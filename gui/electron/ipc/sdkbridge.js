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

export function registerSdkBridge({ mainWindow, sdk, db }) {
  console.log('[IPC] registerSdkBridge called');
  console.log('[IPC] sdk available:', !!sdk);
  console.log('[IPC] db available:', !!db);
  console.log('[IPC] mainWindow available:', !!mainWindow);
  
  // --- SDK HANDLERS ---

  // TCP Connection
  ipcMain.handle('reader:connect', async (_event, { host, port }) => {
    try {
      if (!sdk) {
        throw new Error('SDK not initialized. Cannot connect to TCP reader.');
      }
      if (typeof sdk.connectTcp !== 'function') {
        throw new Error('SDK does not have connectTcp method. SDK may not be properly loaded.');
      }
      if (!host) {
        throw new Error('Host IP is required');
      }
      if (!port) {
        throw new Error('Port is required');
      }
      
      console.log(`[IPC] Attempting TCP connection to ${host}:${port}`);
      await sdk.connectTcp(host, port);
      console.log(`[IPC] Connection Successful: TCP ${host}:${port}`);
      return { success: true };
    } catch (err) {
      const errorMsg = err?.message || String(err);
      console.error(`[IPC] Connection Failed: TCP ${host}:${port} - ${errorMsg}`);
      console.error(`[IPC] Error details:`, err);
      throw new Error(errorMsg);
    }
  });

  // Serial Connection
  ipcMain.handle('reader:connect-serial', async (_event, { comPort, baudRate }) => {
    try {
      if (!sdk) {
        throw new Error('SDK not initialized. Cannot connect to serial reader.');
      }
      if (typeof sdk.connectSerial !== 'function') {
        throw new Error('SDK does not have connectSerial method. SDK may not be properly loaded.');
      }
      if (!comPort) {
        throw new Error('COM port is required');
      }
      if (!baudRate) {
        throw new Error('Baud rate is required');
      }
      
      console.log(`[IPC] Attempting serial connection to ${comPort} @ ${baudRate} baud`);
      await sdk.connectSerial(comPort, baudRate);
      console.log(`[IPC] Connection Successful: Serial ${comPort} @ ${baudRate} baud`);
      return { success: true };
    } catch (err) {
      const errorMsg = err?.message || String(err);
      console.error(`[IPC] Connection Failed: Serial ${comPort} - ${errorMsg}`);
      console.error(`[IPC] Error details:`, err);
      throw new Error(errorMsg);
    }
  });

  // Disconnect
  ipcMain.handle('reader:disconnect', async () => {
    try {
      const type = sdk.reader?.constructor.name;
      await sdk.disconnect();
      console.log(`[IPC] ${type} disconnected successfully`);
      return { success: true };
    } catch (err) {
      console.error(`[IPC] Disconnect failed: ${err.message}`);
      throw err;
    }
  });

  // Track active listeners to prevent duplicates
  let currentTagListener = null;
  let currentStatsListener = null;

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

    // Remove old listeners if they exist to prevent duplicates
    if (currentTagListener !== null) {
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('tag', currentTagListener);
      }
    }
    if (currentStatsListener !== null) {
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('stats', currentStatsListener);
      }
    }

    const tagListener = async (tag) => {
      try {
        const payload = await formatPayload(tag);
        mainWindow.webContents.send('rfid:tag-read', payload);
        
        // Save tag to database
        if (db) {
          try {
            db.run(`
              INSERT INTO rfid_events (epc, reader_id, antenna, rssi)
              VALUES (?, ?, ?, ?)
            `, [
              tag.id || tag.epc || 'UNKNOWN',
              'MQTT_READER',
              tag.antenna || 0,
              tag.rssi || 0
            ]);
            
            // Save database to file after each insert
            if (db.saveToFile) {
              db.saveToFile();
            }
          } catch (dbErr) {
            console.error('[IPC] Error saving tag to database:', dbErr);
          }
        }
      } catch (err) {
        console.error('[IPC] Error formatting/sending tag:', err);
      }
    };

    const statsListener = (stats) => {
      try {
        mainWindow.webContents.send('rfid:stats', stats);
      } catch (err) {
        console.error('[IPC] Error sending stats:', err);
      }
    };

    // Store listeners for cleanup
    currentTagListener = tagListener;
    currentStatsListener = statsListener;

    console.log('[IPC] Registering tag and stats listeners, then starting SDK');
    sdk.on('tag', tagListener);
    sdk.on('stats', statsListener);
    
    try {
      sdk.start();
      console.log('[IPC] SDK started successfully');
    } catch (err) {
      console.error('[IPC] Error starting SDK:', err);
    }

    ipcMain.once('reader:stop-scan', () => {
      try {
        console.log('[IPC] Stopping scan');
        sdk.stop();
        // Safely remove listeners if method exists
        if (typeof sdk.removeListener === 'function') {
          sdk.removeListener('tag', tagListener);
          sdk.removeListener('stats', statsListener);
        }
        currentTagListener = null;
        currentStatsListener = null;
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

  // Export data from database by time period
  ipcMain.handle('data:export-database', async (event, days) => {
    console.log('[IPC] data:export-database called with days:', days);
    
    if (!db) {
      console.error('[IPC] Database not available for export');
      return { success: false, error: 'Database not available' };
    }

    try {
      console.log('[IPC] Querying database for events from last', days, 'days');
      
      // Query database for events from the last N days using sql.js
      const result = db.exec(`
        SELECT epc, reader_id, antenna, rssi, read_at
        FROM rfid_events
        WHERE read_at >= datetime('now', ?)
        ORDER BY read_at DESC
      `, [`-${days} days`]);
      
      // sql.js returns an array of statement results
      let events = [];
      if (result.length > 0 && result[0].values.length > 0) {
        const columns = result[0].columns;
        events = result[0].values.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });
      }
      
      console.log('[IPC] Database query returned', events.length, 'events');

      if (events.length === 0) {
        return { success: false, error: `No tag data found for the last ${days} days.`, count: 0 };
      }

      // Generate CSV content
      const header = 'EPC,Reader,Antenna,RSSI,Read Time\n';
      const rows = events.map(evt => 
        `${evt.epc},${evt.reader_id},${evt.antenna},${evt.rssi},"${evt.read_at}"`
      ).join('\n');
      const csvContent = header + rows;

      console.log('[IPC] Generated CSV with', events.length, 'rows');
      return { success: true, content: csvContent, count: events.length };
    } catch (err) {
      console.error('[IPC] Database export error:', err);
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