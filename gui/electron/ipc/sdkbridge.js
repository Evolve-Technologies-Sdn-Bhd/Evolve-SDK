import { ipcMain, dialog } from 'electron'; 
import path from 'path';
import fs from 'fs'; 
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper function to format the tag - convert Buffer to serializable format
 */
const formatPayload = async (tag) => {
  try {
    // Convert Buffer to string for IPC serialization
    let rawData = tag.raw;
    
    if (Buffer.isBuffer(rawData)) {
      // Convert buffer to UTF-8 string  
      rawData = rawData.toString('utf-8');
    } else if (Array.isArray(rawData)) {
      rawData = Buffer.from(rawData).toString('utf-8');
    }

    return {
      ...tag,
      raw: rawData
    };
  } catch (err) {
    console.error('[IPC] Error serializing tag payload:', err);
    // Fallback: convert buffer to base64 if all else fails
    return {
      ...tag,
      raw: Buffer.isBuffer(tag.raw) ? tag.raw.toString('base64') : tag.raw
    };
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
    try {
      await sdk.connectMqtt(brokerUrl, topic, options);
      return { success: true };
    } catch (err) {
      console.error('[IPC] MQTT connection error:', err);
      // Throw error so GUI receives promise rejection
      throw new Error(err?.message || String(err));
    }
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
      console.log('[IPC] No SDK, entering mock mode');
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
      console.log('[IPC] Tag event received:', tag);
      try {
        const payload = await formatPayload(tag);
        console.log('[IPC] Sending rfid:tag-read to GUI:', payload);
        mainWindow.webContents.send('rfid:tag-read', payload);
      } catch (err) {
        console.error('[IPC] Error formatting/sending tag:', err);
      }
    };

    console.log('[IPC] Registering tag listener and starting SDK');
    sdk.on('tag', tagListener);
    sdk.start();

    ipcMain.once('reader:stop-scan', () => {
      try {
        console.log('[IPC] Stopping scan');
        sdk.stop();
        // Safely remove listener if method exists
        if (typeof sdk.removeListener === 'function') {
          sdk.removeListener('tag', tagListener);
        }
      } catch (err) {
        console.error('[IPC] Error during stop-scan:', err);
      }
    });
  });

  ipcMain.on('reader:stop-scan', () => {
    console.log('[IPC] reader:stop-scan');
    if (sdk) {
      try {
        sdk.stop();
      } catch (err) {
        console.error('[IPC] Error stopping reader:', err);
      }
    }
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