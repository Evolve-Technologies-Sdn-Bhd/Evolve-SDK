import { ipcMain, dialog } from 'electron'; 
import path from 'path';
import fs from 'fs'; 
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Helper function to standardize tag payload format
 * Ensures all tags have: EPC, Frame_Hex, RSSI
 * Handles multiple input formats and normalizes to standard output
 */
const formatPayload = async (tag) => {
  try {
    // Extract EPC from multiple possible sources
    const epc = tag.epc || tag.id || tag.EPC || 'UNKNOWN';
    
    // Convert raw data to Frame_Hex format
    let frameHex = '';
    let rawData = tag.raw || tag.Frame_Hex || tag.frame_hex || '';
    
    if (Buffer.isBuffer(rawData)) {
      // Convert binary frame to hex with spaces for readability
      frameHex = rawData.toString('hex').toUpperCase();
      frameHex = frameHex.match(/.{1,2}/g)?.join(' ') || frameHex;
    } else if (Array.isArray(rawData)) {
      frameHex = Buffer.from(rawData).toString('hex').toUpperCase();
      frameHex = frameHex.match(/.{1,2}/g)?.join(' ') || frameHex;
    } else if (typeof rawData === 'string') {
      // Already a string - clean up spacing
      frameHex = rawData.replace(/\s+/g, ' ').trim().toUpperCase();
    }
    
    // Extract RSSI
    const rssi = tag.rssi !== undefined ? tag.rssi : (tag.RSSI !== undefined ? tag.RSSI : 0);
    
    // Return standardized format: EPC, Frame_Hex, RSSI
    return {
      EPC: epc,
      Frame_Hex: frameHex,
      RSSI: rssi,
      // Keep original timestamp if available
      timestamp: tag.timestamp || Date.now(),
      // Keep antenna info if available
      antenna: tag.antenna || tag.antId || 0
    };
  } catch (err) {
    console.error('[IPC] Error serializing tag payload:', err);
    // Fallback with minimal data
    return {
      EPC: tag.id || tag.epc || 'ERROR',
      Frame_Hex: '',
      RSSI: tag.rssi || 0,
      error: err.message
    };
  }
};

export function registerSdkBridge({ mainWindow, sdk, db: initialDb }) {
  
  // Helper to get current database (prioritizes global.dbInstance)
  const getDb = () => {
    if (global.dbInstance) {
      return global.dbInstance;
    }
    if (initialDb) {
      return initialDb;
    }
    return null;
  };
  
  // --- SDK HANDLERS ---

  // Track current reader type for database logging
  let currentReaderType = 'UNKNOWN';

  // TCP Connection
  ipcMain.handle('reader:connect', async (_event, { host, ip, address, port }) => {
    try {
      if (!sdk) {
        throw new Error('SDK not initialized. Cannot connect to TCP reader.');
      }
      if (typeof sdk.connectTcp !== 'function') {
        throw new Error('SDK does not have connectTcp method. SDK may not be properly loaded.');
      }
      const resolvedHost = host || ip || address;
      if (!resolvedHost) {
        throw new Error('Host IP is required');
      }
      const resolvedPort = typeof port === 'string' ? Number(port) : port;
      if (!resolvedPort || Number.isNaN(resolvedPort)) {
        throw new Error('Port is required');
      }
      
      await sdk.connectTcp(resolvedHost, resolvedPort);
      currentReaderType = 'TCP';
      console.log(`[IPC] TCP Connection Successful: ${resolvedHost}:${resolvedPort}`);
      return { success: true };
    } catch (err) {
      const errorMsg = err?.message || String(err);
      console.error(`[IPC] Connection Failed: TCP ${host || ip || address}:${port} - ${errorMsg}`);
      console.error(`[IPC] Error details:`, err);
      throw new Error(errorMsg);
    }
  });

  // Serial Connection
  ipcMain.handle('reader:connect-serial', async (_event, { comPort, baudRate, protocol }) => {
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
      
      // Validate protocol selection - supported: UF3-S, F5001, A0
      const validProtocols = ['UF3-S', 'F5001', 'A0'];
      const selectedProtocol = protocol && validProtocols.includes(protocol) ? protocol : 'A0';
      
      await sdk.connectSerial(comPort, baudRate, selectedProtocol);
      currentReaderType = 'SERIAL';
      console.log(`[IPC] Serial Connection Successful: ${comPort} @ ${baudRate} baud with ${selectedProtocol} protocol`);
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
      const type = sdk.reader?.constructor.name || 'Reader';
      await sdk.disconnect();
      currentReaderType = 'UNKNOWN';
      console.log(`[IPC] ${type} disconnected successfully`);
      
      // Stop scan if active
      if (scanActive) {
        try {
          sdk.stop();
          if (currentTagListener && typeof currentTagListener === 'function' && typeof sdk.removeListener === 'function') {
            sdk.removeListener('tag', currentTagListener);
          }
          if (currentStatsListener && typeof currentStatsListener === 'function' && typeof sdk.removeListener === 'function') {
            sdk.removeListener('stats', currentStatsListener);
          }
          if (currentRawDataListener && typeof currentRawDataListener === 'function' && typeof sdk.removeListener === 'function') {
            sdk.removeListener('rawData', currentRawDataListener);
          }
          currentTagListener = null;
          currentStatsListener = null;
          currentRawDataListener = null;
          scanActive = false;
        } catch (stopErr) {
          console.error('[IPC] Error stopping scan on disconnect:', stopErr);
        }
      }
      
      // Notify renderer that disconnection occurred
      mainWindow.webContents.send('rfid:disconnected', { type });
      
      return { success: true };
    } catch (err) {
      console.error(`[IPC] Disconnect failed: ${err.message}`);
      // Still notify renderer of disconnection even if there's an error
      mainWindow.webContents.send('rfid:disconnected', { type: 'Reader', error: err.message });
      throw err;
    }
  });

  // Track active listeners to prevent duplicates
  let currentTagListener = null;
  let currentStatsListener = null;
  let currentRawDataListener = null;
  let scanActive = false;

  // MQTT connection handler
  ipcMain.handle('reader:connect-mqtt', async (_event, { brokerUrl, topic, options }) => {
    if (!sdk) return { success: true, mock: true };
    try {
      await sdk.connectMqtt(brokerUrl, topic, options);
      currentReaderType = 'MQTT';
      return { success: true };
    } catch (err) {
      console.error('[IPC] MQTT connection error:', err);
      // Throw error so GUI receives promise rejection
      throw new Error(err?.message || String(err));
    }
  });

  // MQTT publish handler
  ipcMain.handle('mqtt:publish', async (_event, { tag, topic }) => {
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
    if (!sdk) return { success: true };
    await sdk.configure(settings);
    return { success: true };
  });

  // Reset cumulative counters (totalCount and uniqueTags in SDK)
  ipcMain.handle('reader:reset-counters', async () => {
    if (!sdk) return { success: false, error: 'SDK not initialized' };
    try {
      sdk.resetCumulativeStats();
      console.log('[IPC] Counters reset successfully');
      return { success: true };
    } catch (err) {
      console.error('[IPC] Error resetting counters:', err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.on('reader:start-scan', () => {
    console.log('[IPC] Starting scan');
    // Prevent multiple simultaneous scans
    if (scanActive) {
      return;
    }

    if (!sdk) {
      scanActive = true;
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

      // Store interval ID for cleanup
      currentTagListener = { interval, isMock: true };
      return;
    }

    // Clean up any old listeners first
    if (currentTagListener && typeof currentTagListener === 'function') {
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('tag', currentTagListener);
      }
    }
    if (currentStatsListener && typeof currentStatsListener === 'function') {
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('stats', currentStatsListener);
      }
    }
    if (currentRawDataListener && typeof currentRawDataListener === 'function') {
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('rawData', currentRawDataListener);
      }
    }

    const tagListener = async (tag) => {
      try {
        const payload = await formatPayload(tag);
        mainWindow.webContents.send('rfid:tag-read', payload);
        
        // Save tag to database
        const currentDb = global.dbInstance || initialDb;
        if (currentDb) {
          try {
            const epc = (tag.id || tag.epc || 'UNKNOWN').replace(/'/g, "''"); // Escape single quotes
            // Convert timestamp to ISO string for SQLite (tag.timestamp is in milliseconds)
            const readAt = tag.timestamp ? new Date(tag.timestamp).toISOString() : new Date().toISOString();
            const query = `
              INSERT INTO rfid_events (epc, reader_id, antenna, rssi, read_at)
              VALUES ('${epc}', '${currentReaderType}', ${tag.antenna || 0}, ${tag.rssi || 0}, '${readAt}')
            `;
            currentDb.exec(query);
            
            // Save database to file after each insert
            if (currentDb.saveToFile) {
              currentDb.saveToFile();
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

    const rawDataListener = (packet) => {
      try {
        mainWindow.webContents.send('rfid:raw-data', packet);
      } catch (err) {
        console.error('[IPC] Error sending raw data:', err);
      }
    };

    // Store listeners for cleanup
    currentTagListener = tagListener;
    currentStatsListener = statsListener;
    currentRawDataListener = rawDataListener;

    sdk.on('tag', tagListener);
    sdk.on('stats', statsListener);
    sdk.on('rawData', rawDataListener);
    
    try {
      sdk.start();
      scanActive = true;
      console.log('[IPC] Scan started successfully');
    } catch (err) {
      console.error('[IPC] Error starting SDK:', err);
      scanActive = false;
      // Clean up listeners on error
      if (typeof sdk.removeListener === 'function') {
        sdk.removeListener('tag', tagListener);
        sdk.removeListener('stats', statsListener);
        sdk.removeListener('rawData', rawDataListener);
      }
      currentTagListener = null;
      currentStatsListener = null;
      currentRawDataListener = null;
    }
  });

  // Stop scan handler
  ipcMain.on('reader:stop-scan', () => {
    console.log('[IPC] Stopping scan');
    if (!scanActive) {
      return;
    }

    try {
      // Handle mock mode
      if (currentTagListener && currentTagListener.isMock) {
        clearInterval(currentTagListener.interval);
        currentTagListener = null;
        scanActive = false;
        return;
      }

      // Handle SDK mode
      if (sdk) {
        sdk.stop();
        
        // Clean up listeners
        if (currentTagListener && typeof currentTagListener === 'function' && typeof sdk.removeListener === 'function') {
          sdk.removeListener('tag', currentTagListener);
        }
        if (currentStatsListener && typeof currentStatsListener === 'function' && typeof sdk.removeListener === 'function') {
          sdk.removeListener('stats', currentStatsListener);
        }
        if (currentRawDataListener && typeof currentRawDataListener === 'function' && typeof sdk.removeListener === 'function') {
          sdk.removeListener('rawData', currentRawDataListener);
        }
      }

      currentTagListener = null;
      currentStatsListener = null;
      currentRawDataListener = null;
      scanActive = false;
      console.log('[IPC] Scan stopped successfully');
    } catch (err) {
      console.error('[IPC] Error stopping scan:', err);
      scanActive = false;
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
    // Get database using the helper function
    const currentDb = getDb();
    
    if (!currentDb) {
      console.error('[IPC] ✗ Database not available for export');
      return { success: false, error: 'Database not available - make sure it was initialized' };
    }

    try {
      // First check if table exists
      const tableCheckQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='rfid_events'`;
      const tableCheck = currentDb.exec(tableCheckQuery);
      
      if (!tableCheck || tableCheck.length === 0 || tableCheck[0].values.length === 0) {
        console.warn('[IPC] ⊘ Table rfid_events does not exist yet');
        return { success: false, error: 'No data available yet - table not created', count: 0 };
      }
      
      // Build and execute the query
      const query = `
        SELECT epc, reader_id, antenna, rssi, read_at
        FROM rfid_events
        WHERE read_at >= datetime('now', '-${days} days')
        ORDER BY read_at DESC
      `;
      
      const result = currentDb.exec(query);
      
      // sql.js returns an array of statement results
      let events = [];
      if (result.length > 0 && result[0].values && result[0].values.length > 0) {
        const columns = result[0].columns;
        events = result[0].values.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });
      } else {
      }

      if (events.length === 0) {
        return { success: false, error: `No tag data found for the last ${days} days.`, count: 0 };
      }

      // Generate CSV content
      const header = 'EPC,Connection,Antenna,RSSI,Read Time\n';
      const rows = events.map(evt => {
        // Safely escape CSV values
        const epc = (evt.epc || '').replace(/"/g, '""');
        const reader = (evt.reader_id || '').replace(/"/g, '""');
        return `"${epc}","${reader}",${evt.antenna},${evt.rssi},"${evt.read_at}"`;
      }).join('\n');
      const csvContent = header + rows;

      return { success: true, content: csvContent, count: events.length };
      
    } catch (err) {
      console.error('[IPC] ✗ Database export error:', err.message);
      console.error('[IPC] Error stack:', err.stack);
      return { success: false, error: `Export error: ${err.message}` };
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
