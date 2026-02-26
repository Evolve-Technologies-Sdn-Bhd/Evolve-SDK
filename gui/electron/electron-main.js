import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { registerSdkBridge } from './ipc/sdkbridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure Electron's user data directory is set to a writable location to
// avoid Chromium disk-cache permission errors on Windows.
try {
  const userDataDir = path.join(app.getPath('home'), '.evolve-sdk-electron');
  app.setPath('userData', userDataDir);
} catch (err) {
  console.warn('[Main] Could not set userData path:', err);
}

let sdk = null;
let db = null;

async function initializeSDK() {
  try {
    // Attempt to import the compiled SDK. If unavailable, fall back to mock mode.
    // Use absolute path from project root for reliable module resolution
    const projectRoot = path.resolve(__dirname, '../../');
    const sdkPath = path.resolve(projectRoot, 'sdk/dist/index.js');
    const { pathToFileURL } = await import('url');
    const sdkUrl = pathToFileURL(sdkPath).href;
    const sdkModule = await import(sdkUrl);
    const RfidSdk = sdkModule?.RfidSdk ?? sdkModule?.default;
    if (RfidSdk && typeof RfidSdk === 'function') {
      sdk = new RfidSdk();
      console.log('[App] SDK initialized successfully');
    } else {
      console.warn('[Electron] SDK class not found');
      sdk = null;
    }
  } catch (err) {
    console.warn('[Electron] SDK not available; running in mock mode.', err?.message ?? err);
    sdk = null;
  }
}

async function initializeDatabase() {
  try {
    console.log('[App] Starting database initialization...');
    
    // Database path in user data directory
    const userDataDir = path.join(app.getPath('home'), '.evolve-sdk-electron');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
      console.log('[App] Created user data directory:', userDataDir);
    }
    
    const dbPath = path.join(userDataDir, 'rfid_events.db');
    console.log('[App] Database path:', dbPath);
    
    // Initialize sql.js
    console.log('[App] Loading sql.js...');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    console.log('[App] sql.js loaded');
    
    // Load existing database file or create new one
    let dbData;
    if (fs.existsSync(dbPath)) {
      console.log('[App] Loading existing database file...');
      dbData = fs.readFileSync(dbPath);
      db = new SQL.Database(dbData);
      console.log('[App] Existing database loaded');
    } else {
      console.log('[App] Creating new database...');
      db = new SQL.Database();
      console.log('[App] New database created');
    }
    
    // Initialize tables if needed
    console.log('[App] Creating tables...');
    db.run(`
      CREATE TABLE IF NOT EXISTS rfid_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        epc TEXT,
        reader_id TEXT,
        antenna INTEGER,
        rssi REAL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Save database to file
    console.log('[App] Saving database to file...');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    
    // Store save function for later use
    db.saveToFile = () => {
      try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
      } catch (err) {
        console.error('[App] Error saving database:', err?.message);
      }
    };
    
    console.log('[App] Database initialized successfully at', dbPath);
  } catch (err) {
    console.error('[App] Database initialization failed:');
    console.error('[App] Error message:', err?.message);
    console.error('[App] Error stack:', err?.stack);
    db = null;
  }
}

// Global safety: catch uncaught exceptions and unhandled rejections in the
// main process so the app doesn't crash from unexpected stream/socket errors
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err);
  try {
    // Show a simple error dialog so the user can see the message
    dialog.showErrorBox('Uncaught Exception', String(err && (err.stack || err.message || err)));
  } catch (e) {
    console.error('[Main] Failed to show error box:', e);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason);
});

// --- 1. SETUP LOGS DIRECTORY ---
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

let mainWindow = null;

function createWindow() {
  console.log('[Main] Creating window...');
  const iconPath = path.join(__dirname, '../resources/CLB_letterhead.ico');
  
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Evolve SDK - RFID Management',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
  });
  
  console.log('[Main] Window created');

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  // During development we typically serve from Vite at localhost:5173
  console.log('[Main] Loading URL:', 'http://localhost:5173');
  mainWindow.loadURL('http://localhost:5173');
  
  // Listen for did-finish-load to confirm window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Window loaded successfully');
    
    // Setup log forwarding to GUI after window is loaded
    setupLogForwarding(mainWindow);
  });
  
  mainWindow.webContents.on('render-process-gone', () => {
    console.error('[Main] Renderer process crashed!');
  });
  
  mainWindow.on('closed', () => {
    console.log('[Main] Window closed');
    mainWindow = null;
  });

  createApplicationMenu();

  // Register SDK bridge handlers
  console.log('[Main] About to register SDK bridge. db status:', db ? 'initialized' : 'null/undefined');
  registerSdkBridge({ mainWindow, sdk, db });
  console.log('[Main] SDK bridge registered successfully');
}

/**
 * Forward console logs from main process to Electron window
 */
// Replace your setupLogForwarding function with this safer version:
function setupLogForwarding(mainWindow) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const safeSend = (message, level) => {
    // CRITICAL FIX: Check if window exists AND is not destroyed before sending
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      try {
        mainWindow.webContents.send('system:message', message, level);
      } catch (err) {
        // Window might have been destroyed between the check and the send
      }
    }
  };

  const formatArgs = (args) => {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');
  };

  console.log = function(...args) {
    originalLog.apply(console, args);
    const message = formatArgs(args);
    if (message.includes('[IPC]') || message.includes('[SerialReader]') || message.includes('[RfidSdk]')) {
      safeSend(message, 'info');
    }
  };

  console.error = function(...args) {
    originalError.apply(console, args);
    safeSend(formatArgs(args), 'error');
  };

  console.warn = function(...args) {
    originalWarn.apply(console, args);
    safeSend(formatArgs(args), 'warn');
  };
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // FILE MENU
    {
      label: 'File',
      submenu: [
        {
          label: 'Export', // 1. New Parent Item
          submenu: [
            {
              label: 'Export Data', // 2. Nested Data Export
              submenu: [
                {
                  label: 'Last 24 Hours',
                  click: () => {
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '1');
                  }
                },
                {
                  label: 'Last 7 Days',
                  click: () => {
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '7');
                  }
                },
                {
                  label: 'Last 30 Days',
                  click: () => {
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '30');
                  }
                },
              ]
            },
            {
              label: 'Export Logs', // 3. Nested Log Export
              click: async () => {
                if (mainWindow) mainWindow.webContents.send('menu:export-logs');
              }
            }
          ]
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' } // Exit/Quit
      ]
    },
    // EDIT MENU
    {
      label: 'Edit',
      role: 'editMenu'
    },
    // VIEW MENU
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // SETTINGS MENU
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('menu:open-settings');
      }
    },
    // HELP MENU
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/KhairulAnuar11/RFID-SDK.git');
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Evolve SDK',
              message: 'SDK Information',
              detail: 'Version: 1.0.0\nBuild: 2026-02-03\n\n(c) 2026 Evolve Technology Platform',
              buttons: ['OK'],
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


// --- 4. APP LIFECYCLE ---
app.on('ready', async () => {
  console.log('[App] App ready event');
  await initializeSDK();
  console.log('[App] SDK initialization complete');
  await initializeDatabase();
  console.log('[App] Database initialization complete, db:', db ? 'initialized' : 'failed');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
