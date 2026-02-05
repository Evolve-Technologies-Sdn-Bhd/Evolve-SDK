// gui/electron-main.cjs
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// --- 1. SETUP LOGS DIRECTORY ---
// Define the log directory (e.g., AppData/Roaming/EvolveSDK/logs)
const LOG_DIR = path.join(app.getPath('userData'), 'logs');

// Ensure log directory exists on startup
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// --- 2. SDK INTEGRATION (Placeholder) ---
// Import your SDK here when ready
// const { UF3SReader } = require('../../sdk/dist/index'); 
// let readerInstance = new UF3SReader(); 

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "EvolveSDK RFID Utility",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), 
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load Vite dev server (dev) or built files (prod)
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  
  // Note: During dev, ensure your Vite server is running on port 5173
  mainWindow.loadURL('http://localhost:5173'); 

  // Initialize the Custom Menu
  createApplicationMenu();
}

// --- 3. CUSTOM MENU CONFIGURATION ---
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // FILE MENU
    {
      label: 'File',
      submenu: [
        { 
          label: 'Export Logs', 
          click: async () => { 
            // Opens the log folder in Windows Explorer / Finder
            if (mainWindow) {
              mainWindow.webContents.send('menu:export-logs');
            }
          } 
        },
        { role: 'quit' }
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
    // SETTINGS (Triggers React Modal)
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('menu:open-settings');
        }
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
              // icon: path.join(__dirname, 'public/icon.png') // Uncomment if you have an icon
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- 4. IPC HANDLERS (Bridge between React & Node) ---

// Connect Reader
ipcMain.handle('reader:connect', async (event, config) => {
  console.log("IPC: Connecting to reader...", config);
  // Real implementation: return await readerInstance.connect(config);
  return { success: true, message: "Connected successfully via IPC" }; 
});

// Disconnect Reader
ipcMain.handle('reader:disconnect', async () => {
  console.log("IPC: Disconnecting...");
  // Real implementation: return await readerInstance.disconnect();
  return { success: true };
});

// Configure Settings (Received from SettingsModal)
ipcMain.handle('reader:configure', async (event, settings) => {
  console.log("IPC: Applying Hardware Settings:", settings);
  
  // Real implementation example:
  // await readerInstance.setPower(settings.power);
  // await readerInstance.setRegion(settings.region);

  return { success: true };
});

// Start/Stop Scan (Event based)
ipcMain.on('reader:start-scan', () => {
  console.log("IPC: Start Scan requested");
  
  // Mocking tag reads for now
  /*
  readerInstance.on('tag', (tag) => {
    mainWindow.webContents.send('rfid:tag-read', tag);
  });
  readerInstance.startReading();
  */
});

// --- NEW IPC HANDLER: Save Logs to File ---
ipcMain.handle('logs:save-to-file', async (event, logContent) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export System Logs',
    defaultPath: `EvolveSDK_Logs_${Date.now()}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });

  if (canceled || !filePath) return { success: false };

  try {
    fs.writeFileSync(filePath, logContent, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save log file:', err);
    return { success: false, error: err.message };
  }
});

// --- 5. APP LIFECYCLE ---

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit(); 
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});