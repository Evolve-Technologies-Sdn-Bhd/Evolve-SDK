import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { registerSdkBridge } from './ipc/sdkbridge.js';
import { pathToFileURL as p2u } from 'url';

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
global.docsServer = null;
global.docsPort = null;

// Make database globally accessible to IPC handlers
global.dbInstance = null;

async function initializeSDK() {
  try {
    // Standard module import - works in both dev (via node_modules link) 
    // and production (bundled in app.asar/node_modules)
    const sdkModule = await import('@evolve/sdk');
    const RfidSdk = sdkModule?.RfidSdk ?? sdkModule?.default;

    if (RfidSdk && typeof RfidSdk === 'function') {
      sdk = new RfidSdk();
      console.log('[App] ✓ SDK instance created');

      if (typeof sdk.initialize === 'function') {
        await sdk.initialize();
        console.log('[App] ✓ SDK initialize() complete');
      }
    } else {
      console.warn('[Electron] SDK class not found in @evolve/sdk module');
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
    console.log('[App] sql.js loaded successfully');
    
    // Load existing database file or create new one
    let dbData;
    if (fs.existsSync(dbPath)) {
      console.log('[App] Loading existing database file...');
      try {
        dbData = fs.readFileSync(dbPath);
        db = new SQL.Database(dbData);
        console.log('[App] ✓ Existing database loaded, size:', dbData.length, 'bytes');
      } catch (readErr) {
        console.warn('[App] Error loading existing database:', readErr.message);
        console.warn('[App] Creating new database to replace corrupted one...');
        // Delete the corrupted file
        try {
          fs.unlinkSync(dbPath);
          console.log('[App] ✓ Removed corrupted database file');
        } catch (unlinkErr) {
          console.warn('[App] Could not delete corrupted file:', unlinkErr.message);
        }
        db = new SQL.Database();
      }
    } else {
      console.log('[App] Creating new database...');
      db = new SQL.Database();
      console.log('[App] ✓ New database created');
    }
    
    // Verify database object exists
    if (!db) {
      throw new Error('Database object is null after initialization');
    }
    
    // Initialize tables if needed
    console.log('[App] Creating tables...');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS rfid_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          epc TEXT,
          reader_id TEXT,
          antenna INTEGER,
          rssi REAL,
          read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          device_id TEXT
        );
      `);
      console.log('[App] ✓ Tables created/verified');
      
      // Migrate: Add device_id column if it doesn't exist (for old databases)
      try {
        const checkColumnQuery = `PRAGMA table_info(rfid_events)`;
        const tableInfo = db.exec(checkColumnQuery);
        const columns = tableInfo[0]?.values || [];
        const hasDeviceIdColumn = columns.some(col => col[1] === 'device_id');
        
        if (!hasDeviceIdColumn) {
          console.log('[App] ⚠ device_id column missing, adding it...');
          db.exec(`ALTER TABLE rfid_events ADD COLUMN device_id TEXT`);
          console.log('[App] ✓ device_id column added successfully');
        }
      } catch (migrationErr) {
        console.warn('[App] Migration check warning:', migrationErr.message);
        // Attempt to add column anyway
        try {
          db.exec(`ALTER TABLE rfid_events ADD COLUMN device_id TEXT`);
          console.log('[App] ✓ device_id column added via fallback');
        } catch (altErr) {
          if (!altErr.message.includes('duplicate column')) {
            console.warn('[App] Could not add device_id column:', altErr.message);
          }
        }
      }
    } catch (tableErr) {
      console.error('[App] Error creating tables:', tableErr.message);
      // Try to recover by creating a fresh database
      console.warn('[App] Attempting recovery: creating fresh database...');
      try {
        // Delete corrupted database file
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log('[App] Deleted corrupted database');
        }
        // Create new database
        db = new SQL.Database();
        console.log('[App] Created fresh database');
        
        // Try creating table again
        db.exec(`
          CREATE TABLE IF NOT EXISTS rfid_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            epc TEXT,
            reader_id TEXT,
            antenna INTEGER,
            rssi REAL,
            read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            device_id TEXT
          );
        `);
        console.log('[App] ✓ Tables created in fresh database');
      } catch (recoveryErr) {
        console.error('[App] Recovery failed:', recoveryErr.message);
        throw recoveryErr;
      }
    }
    
    // Save database to file
    console.log('[App] Saving database to file...');
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
      console.log('[App] ✓ Database saved to file, size:', buffer.length, 'bytes');
    } catch (saveErr) {
      console.error('[App] Error saving database to file:', saveErr.message);
      throw saveErr;
    }
    
    // Store save function for later use
    db.saveToFile = () => {
      try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
        // Removed verbose database save logging
      } catch (err) {
        console.error('[App] Error saving database:', err?.message);
      }
    };
    
    console.log('[App] ✓✓✓ Database initialized successfully at', dbPath);
    
    // Make database globally accessible
    global.dbInstance = db;
    console.log('[App] ✓ Global database reference set');
  } catch (err) {
    console.error('[App] ✗✗✗ Database initialization failed:');
    console.error('[App] Error message:', err?.message);
    console.error('[App] Error stack:', err?.stack);
    db = null;
    global.dbInstance = null;
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

// Disable GPU cache to avoid permission errors on Windows
// MUST be called before app is ready
app.disableHardwareAcceleration();

function createWindow() {
  console.log('[Main] Creating window...');
  const iconPath = path.join(__dirname, '../resources/CLB_letterhead.ico');
  
  // Ensure cache directory exists with proper permissions
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      console.log('[Main] Created cache directory:', cacheDir);
    } catch (err) {
      console.warn('[Main] Could not create cache directory:', err.message);
    }
  }
  
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Evolve SDK - RFID Management',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        // Disable code cache to avoid permission issues
        v8CodeCache: false,
      },
  });
  
  console.log('[Main] Window created');


  let startUrl;

  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Main] Loading packaged UI:', indexPath);
    mainWindow.loadFile(indexPath);
  } else {
    console.log('[Main] Loading dev server: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
  }
  
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

  if (sdk) {
    console.log('[Main] Registering SDK bridge...');
  } else {
    console.warn('[Main] SDK not available - GUI will run in mock mode');
  }

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
    if (
      message.includes('[IPC]') ||
      message.includes('[SerialReader]') ||
      message.includes('[RfidSdk]') ||
      message.includes('[Main]') ||
      message.includes('[App]') ||
      message.includes('[TcpReader]') ||
      message.includes('[Menu]')
    ) {
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

  // Start a tiny HTTP server to serve local PDFs via http://127.0.0.1:<port>/docs/<file>
  // so PDFs open in the user's default browser (not a local PDF app)
  const ensureDocsServer = async (baseDir) => {
    if (global.docsServer && global.docsPort) {
      return global.docsPort;
    }
    const http = (await import('http')).default;
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url, 'http://127.0.0.1');
          if (!url.pathname.startsWith('/docs/')) {
            res.statusCode = 404;
            return res.end('Not Found');
          }
          const fileName = decodeURIComponent(url.pathname.replace('/docs/', ''));
          const filePath = path.join(baseDir, fileName);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            return res.end('File Not Found');
          }
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'no-cache'
          });
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          res.statusCode = 500;
          res.end('Server Error');
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        global.docsServer = server;
        global.docsPort = address && address.port;
        console.log(`[Menu] Docs HTTP server listening at 127.0.0.1:${global.docsPort}`);
        resolve(global.docsPort);
      });
      server.on('error', (err) => {
        console.error('[EVGUI-MENU-001] Docs HTTP server error:', err);
      });
    });
  };

  // Helper to open PDF with logging
  const openResourcePdf = async (fileName, docName) => {
    
    try {
      let pdfPath;
      if (app.isPackaged) {
        // Production path
        pdfPath = path.join(process.resourcesPath, 'resources', fileName);
      } else {
        // Development path (relative to src/electron-main.js)
        pdfPath = path.join(__dirname, '../resources', fileName);
      }

      //console.log(`[Menu] Resolving PDF path for ${docName}: ${pdfPath}`);

      if (!fs.existsSync(pdfPath)) {
        console.warn(`[Menu] PDF file not found at: ${pdfPath}`);
        dialog.showErrorBox('File Not Found', `Could not find documentation file:\n${fileName}`);
        return;
      }

      // Serve over localhost and open in default browser
      const baseDir = app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '../resources');
      const port = await ensureDocsServer(baseDir);
      const httpUrl = `http://127.0.0.1:${port}/docs/${encodeURIComponent(fileName)}`;
      console.log(`[Menu] Opening PDF in browser via: ${httpUrl}`);
      await shell.openExternal(httpUrl);
      console.log(`[Menu] Successfully requested browser to open: ${httpUrl}`);

    } catch (err) {
      console.error(`[EVGUI-MENU-002] Exception while trying to open ${docName}:`, err);
      dialog.showErrorBox('Open PDF Error', String(err && (err.stack || err.message || err)));
    }
  };

  const template = [
    // FILE MENU
    {
      label: 'File',
      submenu: [
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export Data',
              submenu: [
                {
                  label: 'Last 24 Hours',
                  click: () => {
                    console.log('[Menu] Export requested: Last 24 Hours');
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '1');
                  }
                },
                {
                  label: 'Last 7 Days',
                  click: () => {
                    console.log('[Menu] Export requested: Last 7 Days');
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '7');
                  }
                },
                {
                  label: 'Last 30 Days',
                  click: () => {
                    console.log('[Menu] Export requested: Last 30 Days');
                    if (mainWindow) mainWindow.webContents.send('menu:export-data', '30');
                  }
                },
              ]
            },
            {
              label: 'Export Logs',
              click: async () => {
                console.log('[Menu] Export requested: Logs');
                if (mainWindow) mainWindow.webContents.send('menu:export-logs');
              }
            }
          ]
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
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
        console.log('[Menu] Opened Settings');
        if (mainWindow) mainWindow.webContents.send('menu:open-settings');
      }
    },
    // HELP MENU
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          submenu: [
            {
              label: 'User Manual',
              click: () => openResourcePdf('PRA01260219001_Requirement Analysis RFID SDK JJ Wine.pdf', 'User Manual')
            },
            {
              label: 'Troubleshooting Guide',
              click: () => openResourcePdf('UM01260311001_Troubleshooting Guide.pdf', 'Troubleshooting Guide')
            },
            {
              label: 'API Documentation',
              click: () => openResourcePdf('RFID SDK API Documentation.pdf', 'API Documentation')
            }
          ],
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            console.log('[Menu] Opened About Dialog');
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
