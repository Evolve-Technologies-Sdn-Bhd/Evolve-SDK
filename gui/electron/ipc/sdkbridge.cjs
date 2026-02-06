const { ipcMain } = require('electron');

/**
 * Registers all SDK-related IPC handlers
 * @param {object} deps
 * @param {BrowserWindow} deps.mainWindow
 * @param {object|null} deps.sdk
 */
function registerSdkBridge({ mainWindow, sdk }) {
  // CONNECT
  ipcMain.handle('reader:connect', async (_event, config) => {
    console.log('[IPC] reader:connect', config);

    if (!sdk) {
      return { success: true, mock: true };
    }

    await sdk.connect(config);
    return { success: true };
  });

  // DISCONNECT
  ipcMain.handle('reader:disconnect', async () => {
    console.log('[IPC] reader:disconnect');

    if (!sdk) return { success: true };

    await sdk.disconnect();
    return { success: true };
  });

  // CONFIGURE
  ipcMain.handle('reader:configure', async (_event, settings) => {
    console.log('[IPC] reader:configure', settings);

    if (!sdk) return { success: true };

    await sdk.configure(settings);
    return { success: true };
  });

  // START SCAN
  ipcMain.on('reader:start-scan', () => {
    console.log('[IPC] reader:start-scan');

    if (!sdk) {
      // mock data
      setInterval(() => {
        mainWindow.webContents.send('rfid:tag-read', {
          epc: 'MOCK_TAG',
          rssi: -45,
          timestamp: Date.now()
        });
      }, 1000);
      return;
    }

    sdk.on('tag', (tag) => {
      mainWindow.webContents.send('rfid:tag-read', tag);
    });

    sdk.start();
  });

  // STOP SCAN
  ipcMain.on('reader:stop-scan', () => {
    console.log('[IPC] reader:stop-scan');
    if (sdk) sdk.stop();
  });
}

module.exports = { registerSdkBridge };
