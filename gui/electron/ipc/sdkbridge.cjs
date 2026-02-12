// gui/ipc/sdkbridge.cjs
const { ipcMain } = require('electron');
// Import SDK and PayloadFormatter from the compiled DIST folder
const sdk = require('../../../sdk/dist/index.js'); 
// Ensure PayloadFormatter is exported from your SDK index, or point to sdk/dist/payloads/PayloadFormatter.js
const { PayloadFormatter } = require('../../../sdk/dist/index.js'); 

/**
 * Helper function to format the tag
 * Checks if PayloadFormatter has a static method or needs instantiation
 */
const formatPayload = (tag) => {
  try {
    // ADJUST THIS based on how your PayloadFormatter works:
    // Scenario A: It's a static method
    if (PayloadFormatter.format) return PayloadFormatter.format(tag);
    
    // Scenario B: It needs to be instantiated
    const formatter = new PayloadFormatter();
    return formatter.format(tag);
  } catch (err) {
    console.error("Error formatting payload:", err);
    return tag; // Fallback to raw tag on error
  }
};

/**
 * Registers all SDK-related IPC handlers
 * @param {object} deps
 * @param {BrowserWindow} deps.mainWindow
 * @param {object|null} deps.sdk
 */
function registerSdkBridge({ mainWindow, sdk }) {
  // --- CONNECT READER ---
  ipcMain.handle('reader:connect', async (_event, config) => {
    console.log('[IPC] reader:connect', config);

    if (!sdk) return { success: true, mock: true };

    await sdk.connectTcp(config.host, config.port); 
    return { success: true };
  });

  // --- DISCONNECT READER ---
  ipcMain.handle('reader:disconnect', async () => {
    console.log('[IPC] reader:disconnect');

    if (!sdk) return { success: true };

    await sdk.disconnect();
    return { success: true };
  });

  // --- CONFIGURE READER ---
  ipcMain.handle('reader:configure', async (_event, settings) => {
    console.log('[IPC] reader:configure', settings);

    if (!sdk) return { success: true };

    await sdk.configure(settings);
    return { success: true };
  });

  // --- START SCAN ---
  ipcMain.on('reader:start-scan', () => {
    console.log('[IPC] reader:start-scan');

    if (!sdk) {
      // Mock mode for testing GUI without a reader
      const interval = setInterval(() => {
        const mockTag = {
          raw: Buffer.from('MOCK_TAG'),
          id: 'MOCK_TAG',
          rssi: -45,
          timestamp: Date.now()
        };
        // Now formatPayload is defined
        mainWindow.webContents.send('rfid:tag-read', formatPayload(mockTag));
      }, 1000);

      // Stop interval when GUI requests stop-scan
      ipcMain.once('reader:stop-scan', () => clearInterval(interval));
      return;
    }

    // Real SDK mode
    const tagListener = (tag) => {
      // Now formatPayload is defined
      const payload = formatPayload(tag);
      mainWindow.webContents.send('rfid:tag-read', payload);
    };

    sdk.on('tag', tagListener);
    sdk.start();

    // Stop scanning handler
    ipcMain.once('reader:stop-scan', () => {
      sdk.stop();
      // Use removeListener instead of nulling the event array (safer)
      sdk.removeListener('tag', tagListener); 
    });
  });

  // --- STOP SCAN (from GUI) ---
  ipcMain.on('reader:stop-scan', () => {
    console.log('[IPC] reader:stop-scan');
    if (sdk) sdk.stop();
  });
}

module.exports = { registerSdkBridge };