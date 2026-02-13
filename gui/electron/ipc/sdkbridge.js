import { ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper function to format the tag
 */
const formatPayload = async (tag) => {
  try {
    // Use absolute path from project root for reliable module resolution
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
  ipcMain.handle('reader:connect', async (_event, config) => {
    console.log('[IPC] reader:connect', config);
    if (!sdk) return { success: true, mock: true };
    await sdk.connectTcp(config.host, config.port);
    return { success: true };
  });

  // MQTT connect handler
  ipcMain.handle('reader:connect-mqtt', async (_event, { brokerUrl, topic, options }) => {
    console.log('[IPC] reader:connect-mqtt', brokerUrl, topic);
    if (!sdk) return { success: true, mock: true };
    await sdk.connectMqtt(brokerUrl, topic, options);
    return { success: true };
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
}
