import { app, BrowserWindow, ipcMain, Menu, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { registerSdkBridge } from './ipc/sdkbridge';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sdk: any = null;

async function initializeSDK() {
  try {
    // Attempt to import the compiled SDK. If unavailable, fall back to mock mode.
    // Use absolute path from project root for reliable module resolution
    const projectRoot = path.resolve(__dirname, '../../');
    const sdkPath = path.resolve(projectRoot, 'sdk/dist/index.js');
    const sdkUrl = pathToFileURL(sdkPath).href;
    const sdkModule = await import(sdkUrl);
    const RfidSdk = sdkModule?.RfidSdk ?? sdkModule?.default;
    if (RfidSdk && typeof RfidSdk === 'function') {
      sdk = new (RfidSdk as any)();
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

let mainWindow: BrowserWindow | null = null;

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

  // Open dev tools during development
  mainWindow.webContents.openDevTools();
  
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

  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Data',
          submenu: [
            { label: 'Last 24 Hours', click: () => mainWindow?.webContents.send('menu:export-data', '1') },
            { label: 'Last 7 Days', click: () => mainWindow?.webContents.send('menu:export-data', '7') },
            { label: 'Last 30 Days', click: () => mainWindow?.webContents.send('menu:export-data', '30') },
          ],
        },
        { type: 'separator' },
        {
          label: 'Export Logs',
          click: async () => {
            if (mainWindow) mainWindow.webContents.send('menu:export-logs');
          },
        },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', role: 'editMenu' },
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
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('menu:open-settings');
      },
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: async () => await shell.openExternal('https://github.com/KhairulAnuar11/Evolve-SDK.git') },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Evolve SDK',
              message: 'SDK Information',
              detail: 'Version: 1.0.0\nBuild: 2026-02-03\n\n(c) 2026 Evolve Technology Platform',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- IPC: Save data CSV ---
ipcMain.handle('data:save-csv', async (_event, { content, days }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export RFID Data (${days} Days)`,
    defaultPath: `EvolveSDK_RFID_Data_Last_${days}_Days_${Date.now()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (canceled || !filePath) return { success: false };

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save CSV file:', err);
    return { success: false, error: err.message };
  }
});

// --- IPC: Save Logs ---
ipcMain.handle('logs:save-to-file', async (_event, logContent: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export System Logs',
    defaultPath: `EvolveSDK_Logs_${Date.now()}.txt`,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || !filePath) return { success: false };

  try {
    fs.writeFileSync(filePath, logContent, 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save log file:', err);
    return { success: false, error: err.message };
  }
});

// --- APP LIFECYCLE ---
app.whenReady().then(async () => {
  await initializeSDK();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  console.log('[App] Cleaning up before quitting...');
  try {
    await sdk?.disconnect();
  } catch (err) {
    console.warn('Error while disconnecting SDK during quit:', err);
  }
  ipcMain.removeAllListeners();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
