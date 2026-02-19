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

// --- 1. SETUP LOGS DIRECTORY ---
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

let mainWindow = null;

function createWindow() {
  console.log('[Main] Creating window...');
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Evolve SDK - RFID Management',
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
  registerSdkBridge({ mainWindow, sdk });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // FILE MENU
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Data',
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
        { type: 'separator' },
        {
          label: 'Export Logs',
          click: async () => {
            if (mainWindow) mainWindow.webContents.send('menu:export-logs');
          }
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
  await initializeSDK();
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
