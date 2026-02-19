import { ipcMain, dialog } from 'electron'; 
import path from 'path';
import fs from 'fs'; 
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper function to format the tag
 */
const formatPayload = async (tag) => {
  try {
    const projectRoot = path.resolve(__dirname, '../../../');
    const sdkPath = path.resolve(projectRoot, 'sdk/dist/index.js');
    const sdkUrl = pathToFileURL(sdkPath).href;
    const sdkModule = await import(sdkUrl);
    const PayloadFormatter = sdkModule?.PayloadFormatter;
    if (!PayloadFormatter) return tag;

    if (typeof PayloadFormatter.format === 'function') return PayloadFormatter.format(tag);

    const formatter = new PayloadFormatter();
    return formatter.format(tag);
  } catch (err) {
    console.error('Error formatting payload:', err);
    return tag;
  }
};

export function registerSdkBridge({ mainWindow, sdk }) {
  // --- SDK HANDLERS ---

  ipcMain.handle('reader:connect', async (_event, config) => {
    console.log('[IPC] reader:connect', config);
    if (!sdk) return { success: true, mock: true };
    await sdk.connectTcp(config.host, config.port);
    return { success: true };
  });

 // MQTT connection handler
  ipcMain.handle('reader:connect-mqtt', async (_event, { brokerUrl, topic, options }) => {
    console.log('[IPC] reader:connect-mqtt', brokerUrl, topic);
    if (!sdk) return { success: true, mock: true };
    await sdk.connectMqtt(brokerUrl, topic, options);
    return { success: true };
  });

  // MQTT publish handler
  ipcMain.handle('mqtt:publish', async (_event, { tag, topic }) => {
    console.log('[IPC] mqtt:publish', topic);
    if (!sdk) return { success: false, error: 'SDK not initialized' };
    if (typeof sdk.publish !== 'function') return { success: false, error: 'Publish not supported by SDK' };
    try {
      await sdk.publish(tag, topic);
      return { success: true };
    } catch (err) {
      console.error('mqtt publish error', err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('reader:disconnect', async () => {
    console.log('[IPC] reader:disconnect');
    if (!sdk) return { success: true };
    await sdk.disconnect();
    return { success: true };
  });

  ipcMain.handle('reader:configure', async (_event, settings) => {
    console.log('[IPC] reader:configure', settings);
    if (!sdk) return { success: true };
    await sdk.configure(settings);
    return { success: true };
  });

  ipcMain.on('reader:start-scan', () => {
    console.log('[IPC] reader:start-scan');

    if (!sdk) {
      const interval = setInterval(async () => {
        const mockTag = {
          raw: Buffer.from('MOCK_TAG'),
          id: 'MOCK_TAG',
          rssi: -45,
          timestamp: Date.now(),
        };
        const formatted = await formatPayload(mockTag);
        mainWindow.webContents.send('rfid:tag-read', formatted);
      }, 1000);

      ipcMain.once('reader:stop-scan', () => clearInterval(interval));
      return;
    }

    const tagListener = async (tag) => {
      const payload = await formatPayload(tag);
      mainWindow.webContents.send('rfid:tag-read', payload);
    };

    sdk.on('tag', tagListener);
    sdk.start();

    ipcMain.once('reader:stop-scan', () => {
      sdk.stop();
      sdk.removeListener('tag', tagListener);
    });
  });

  ipcMain.on('reader:stop-scan', () => {
    console.log('[IPC] reader:stop-scan');
    if (sdk) sdk.stop();
  });

  // Save CSV Data handler
  ipcMain.handle('data:save-csv', async (event, { content, days }) => {
    // Requires 'dialog' to be imported at top
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: `Export RFID Data (Last ${days} Days)`,
      defaultPath: `EvolveSDK_RFID_Data_Last_${days}_Days_${Date.now()}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) return { success: false };

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('Failed to save CSV file:', err);
      return { success: false, error: err.message };
    }
  });

  // Save System Logs handler
  ipcMain.handle('logs:save-to-file', async (event, logContent) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export System Logs',
      defaultPath: `EvolveSDK_Logs_${Date.now()}.txt`,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
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
}