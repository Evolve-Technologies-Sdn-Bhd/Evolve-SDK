import { ipcMain, dialog } from 'electron'; 
import path from 'path';
import fs from 'fs'; 
import { fileURLToPath, pathToFileURL } from 'url';
import ExcelJS from 'exceljs';
import { SerialPort } from 'serialport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Formatting Helpers ---
function timeStr(ts = Date.now()) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}
function formatErrorLine(code, message, ts = Date.now()) {
  return `[${timeStr(ts)}] [ERROR] [${code}] ${message}`;
}
function logErrorWithCode(code, message, err) {
  const final = `${message}${err?.message ? `: ${err.message}` : ''}`;
  console.error(formatErrorLine(code, final));
}

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
    
    // Extract Device info from multiple possible sources
    const device = tag.device || tag.Device || tag.deviceId || '-';
    
    // Extract Antenna info
    const antenna = tag.antenna || tag.antId || 0;
    
    // Return standardized format: EPC, Frame_Hex, RSSI, Antenna, Device
    const result = {
      EPC: epc,
      Frame_Hex: frameHex,
      RSSI: rssi,
      // Antenna with proper casing for data stream
      Antenna: antenna,
      // Device with proper casing for data stream
      Device: device,
      // Keep original timestamp if available
      timestamp: tag.timestamp || Date.now()
    };
    
    return result;
  } catch (err) {
    console.error('[IPC] Error serializing tag payload:', err);
    // Fallback with minimal data
    return {
      EPC: tag.id || tag.epc || 'ERROR',
      Frame_Hex: '',
      RSSI: tag.rssi || 0,
      Antenna: tag.antenna || tag.antId || 0,
      Device: tag.device || tag.Device || '-',
      error: err.message
    };
  }
};

export function registerSdkBridge({ mainWindow, sdk, db: initialDb }) {
  
  // ========================================
  // SDK ERROR HANDLING
  // ========================================
  // Register error listener to prevent uncaught exceptions
  // All SDK errors are emitted here for logging/monitoring
  if (sdk) {
    sdk.on('error', (errorObj) => {
      // errorObj is a structured error: { code, message, timestamp, details, recoverable, formatted }
      const logEntry = {
        timestamp: new Date(errorObj.timestamp).toISOString(),
        code: errorObj.code,
        message: errorObj.message,
        recoverable: errorObj.recoverable,
        details: errorObj.details,
        formatted: errorObj.formatted,
      };
      
      // Send to renderer for GUI display via SDK error channel
      // NOTE: Do NOT log to console.error here - it would be intercepted by setupLogForwarding
      // and sent as a duplicate 'system:message' event, causing duplication in logs
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sdk:error', logEntry);
      }
      
      // Optional: Log to file for monitoring/debugging
      const logFile = path.join(__dirname, '../../logs/sdk_errors.jsonl');
      try {
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
      } catch (writeErr) {
        console.error('[SDK-ERROR] Failed to write error log:', writeErr.message);
      }
    });
  }
  
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
        throw new Error('SDK not loaded');
      }
      if (typeof sdk.connectTcp !== 'function') {
        throw new Error('TCP not supported by SDK');
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
      // Let SDK error handler deal with formatting and emission
      // SDK will emit structured error via 'error' event with proper formatting
      // Ensure consistent formatting to terminal
      if (err?.code) {
        console.error(formatErrorLine(err.code, err.message, err.timestamp ?? Date.now()));
      } else {
        logErrorWithCode('EVRFID-CONN-001', 'TCP connection failed', err);
      }
      throw err;
    }
  });

  // List available COM ports
  ipcMain.handle('serial:list-ports', async () => {
    try {
      // Force a fresh scan by creating a new SerialPort instance if needed, 
      // but SerialPort.list() is static so we just call it.
      // Sometimes on Windows, the list is cached or slow.
      const ports = await SerialPort.list();
      //console.log('[IPC] Raw SerialPort.list() result:', JSON.stringify(ports)); // Debug logging
      
      // Filter and map ports to a simpler format
      const availablePorts = ports.map(port => ({
        path: port.path,
        productId: port.productId,
        vendorId: port.vendorId,
        manufacturer: port.manufacturer
      }));
      
      console.log(`[IPC] Available ports: ${availablePorts.map(p => p.path).join(', ')}`);
      return { success: true, ports: availablePorts };
    } catch (err) {
      const errorMsg = err?.message || String(err);
      console.error(formatErrorLine('EVGUI-IPC-002', `Error listing COM ports: ${errorMsg}`));
      // Return empty array instead of error to prevent UI crash, but log it
      return { success: false, error: errorMsg, ports: [] };
    }
  });

  // Serial Connection
  ipcMain.handle('reader:connect-serial', async (_event, { comPort, baudRate, protocol }) => {
    try {
      if (!sdk) {
        throw new Error('SDK not loaded');
      }
      if (typeof sdk.connectSerial !== 'function') {
        throw new Error('Serial not supported by SDK');
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
      // Let SDK error handler deal with formatting and emission
      // SDK will emit structured error via 'error' event with proper formatting
      if (err?.code) {
        console.error(formatErrorLine(err.code, err.message, err.timestamp ?? Date.now()));
      } else {
        logErrorWithCode('EVRFID-SERIAL-002', 'Serial connection failed', err);
      }
      throw err;
    }
  });

  // Disconnect
  ipcMain.handle('reader:disconnect', async () => {
    try {

      if (!sdk) {
        return { success: false, message: 'SDK not initialized' };
      }

      if (!sdk.reader) {
        console.warn('[IPC] No reader connected');
        return { success: false, message: 'No reader connected' };
      }

      const type = sdk.reader?.constructor?.name || 'Reader';

      await sdk.disconnect();

      currentReaderType = 'UNKNOWN';

      console.log(`[IPC] ${type} disconnected successfully`);

      mainWindow.webContents.send('rfid:disconnected', { type });

      return { success: true };

    } catch (err) {

      console.error(formatErrorLine(
        'EVGUI-IPC-001',
        `Disconnect failed: ${err?.message || String(err)}`
      ));

      mainWindow.webContents.send('rfid:disconnected', {
        type: 'Reader',
        error: err.message
      });

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
      logErrorWithCode('EVRFID-MQTT-002', 'MQTT connection error', err);
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
      logErrorWithCode('EVRFID-MQTT-006', 'mqtt publish error', err);
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
      logErrorWithCode('EVGUI-IPC-006', 'Error resetting counters', err);
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
        
        // Always forward to renderer for visibility; skip DB for invalid EPC
        mainWindow.webContents.send('rfid:tag-read', payload);
        
        // Save tag to database
        const currentDb = global.dbInstance || initialDb;
        if (currentDb && payload.EPC !== 'UNKNOWN' && payload.EPC !== 'ERROR') {
          try {
            const epc = payload.EPC.replace(/'/g, "''"); // Escape single quotes
            const device = (payload.Device || '-').replace(/'/g, "''"); // Escape single quotes - use capitalized Device
            // Convert timestamp to ISO string for SQLite (tag.timestamp is in milliseconds)
            const readAt = tag.timestamp ? new Date(tag.timestamp).toISOString() : new Date().toISOString();
            const query = `
              INSERT INTO rfid_events (epc, reader_id, antenna, rssi, read_at, device_id)
              VALUES ('${epc}', '${currentReaderType}', ${payload.Antenna || 0}, ${payload.RSSI || 0}, '${readAt}', '${device}')
            `;
            currentDb.exec(query);
            
            // Save database to file after each insert
            if (currentDb.saveToFile) {
              currentDb.saveToFile();
            }
          } catch (dbErr) {
            const errorMsg = dbErr.message || String(dbErr);
            
            // Handle missing device_id column migration
            if (errorMsg.includes('no column named device_id') || errorMsg.includes('device_id')) {
              console.warn('[IPC] ⚠ device_id column missing, attempting to add...');
              try {
                // Add the missing column
                currentDb.exec(`ALTER TABLE rfid_events ADD COLUMN device_id TEXT`);
                console.log('[IPC] ✓ device_id column added successfully');
                
                // Retry the insert
                const epc = payload.EPC.replace(/'/g, "''");
                const device = (payload.Device || '-').replace(/'/g, "''");
                const readAt = tag.timestamp ? new Date(tag.timestamp).toISOString() : new Date().toISOString();
                const retryQuery = `
                  INSERT INTO rfid_events (epc, reader_id, antenna, rssi, read_at, device_id)
                  VALUES ('${epc}', '${currentReaderType}', ${payload.Antenna || 0}, ${payload.RSSI || 0}, '${readAt}', '${device}')
                `;
                currentDb.exec(retryQuery);
                
                // Save database to file
                if (currentDb.saveToFile) {
                  currentDb.saveToFile();
                }
                console.log('[IPC] ✓ Tag saved after column migration');
      } catch (migrationErr) {
                logErrorWithCode('EVRFID-DATA-005', 'Failed to migrate column', migrationErr);
              }
            } else {
              console.error(formatErrorLine('EVRFID-DATA-005', `Error saving tag to database: ${errorMsg}`));
              console.error('[IPC] Query was:', query);
            }
          }
        }
      } catch (err) {
        logErrorWithCode('EVRFID-TAG-001', 'Error formatting/sending tag', err);
      }
    };

    const statsListener = (stats) => {
      try {
        mainWindow.webContents.send('rfid:stats', stats);
      } catch (err) {
        logErrorWithCode('EVGUI-IPC-003', 'Error sending stats', err);
      }
    };

    const rawDataListener = (packet) => {
      try {
        mainWindow.webContents.send('rfid:raw-data', packet);
      } catch (err) {
        logErrorWithCode('EVGUI-IPC-003', 'Error sending raw data', err);
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
      if (!sdk || !sdk.reader) {
        console.warn('[IPC] Cannot start scan - reader not connected');
        return;
      }
      
      sdk.start();
      scanActive = true;
      console.log('[IPC] Scan started successfully');
    } catch (err) {
      logErrorWithCode('EVGUI-IPC-004', 'Error starting SDK', err);
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
      logErrorWithCode('EVGUI-IPC-005', 'Error stopping scan', err);
      scanActive = false;
    }
  });

  // Save CSV Data handler
  ipcMain.handle('data:save-csv', async (event, { content, days, isExcel }) => {
    console.log('[IPC] ✓ Save handler called');
    console.log('[IPC] Received content size:', content ? content.length : 0, 'bytes');
    
    if (!content || content.length === 0) {
      console.error(formatErrorLine('EVGUI-EXPORT-003', 'Export data save failed: No content to save'));
      return { success: false, error: 'No content to save' };
    }
    
    // Determine file extension and filters
    const filters = isExcel 
      ? [{ name: 'Excel Files', extensions: ['xlsx'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'CSV Files', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }];
    
    const defaultFilename = isExcel
      ? `EvolveSDK_RFID_Data_Last_${days}_Days_${Date.now()}.xlsx`
      : `EvolveSDK_RFID_Data_Last_${days}_Days_${Date.now()}.csv`;
    
    // Requires 'dialog' to be imported at top
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: `Export RFID Data (Last ${days} Days)`,
      defaultPath: defaultFilename,
      filters
    });

    if (canceled || !filePath) {
      console.log('[IPC] ⊘ Save dialog canceled or no file path');
      return { success: false };
    }

    console.log('[IPC] Saving file to:', filePath);

    try {
      // If Excel, convert from base64; if CSV, write directly
      if (isExcel) {
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      
      console.log('[IPC] ✓ File saved successfully to:', filePath);
      console.log('[IPC] File size written:', fs.statSync(filePath).size, 'bytes');
      return { success: true };
    } catch (err) {
      console.error(formatErrorLine('EVGUI-EXPORT-003', `Export data save failed: ${err?.message || 'Unknown error'}`));
      return { success: false, error: err.message };
    }
  });

  // Export data from database by time period (Excel format)
  // - 1 day: Summary + Detailed Records sheets
  // - 7+ days: One sheet per day with EPC count
  ipcMain.handle('data:export-database', async (event, days) => {
    console.log('[IPC] ✓ Export handler called with days:', days);
    
    // Get database using the helper function
    const currentDb = getDb();
    
    if (!currentDb) {
      console.error(formatErrorLine('EVRFID-DATA-005', 'Database not available for export'));
      return { success: false, error: 'Database not available - make sure it was initialized' };
    }

    try {
      console.log('[IPC] ✓ Database available, querying events...');
      
      // First check if table exists
      const tableCheckQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='rfid_events'`;
      const tableCheck = currentDb.exec(tableCheckQuery);
      
      if (!tableCheck || tableCheck.length === 0 || tableCheck[0].values.length === 0) {
        console.warn('[IPC] ⊘ Table rfid_events does not exist yet');
        return { success: false, error: 'No data available yet - table not created', count: 0 };
      }
      
      console.log('[IPC] ✓ Table rfid_events found');
      
      // Build and execute the query
      const query = `
        SELECT epc, reader_id, antenna, rssi, read_at, device_id
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
      }

      console.log('[IPC] ✓ Retrieved', events.length, 'events from database');

      if (events.length === 0) {
        return { success: false, error: `No tag data found for the last ${days} days.`, count: 0 };
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      
      if (days === 1) {
        // ===== FOR 1 DAY: SUMMARY + DETAILED RECORDS =====
        console.log('[IPC] Creating 1-day export with Summary and Detailed Records sheets');
        
        // SHEET 1: SUMMARY TABLE
        const summarySheet = workbook.addWorksheet('Summary');
        
        // Create a map of EPC counts
        const epcCountMap = new Map();
        events.forEach(evt => {
          const epc = evt.epc || '';
          epcCountMap.set(epc, (epcCountMap.get(epc) || 0) + 1);
        });

        // Sort EPCs alphabetically
        const uniqueEpcs = Array.from(epcCountMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]));

        // Add header row
        summarySheet.columns = [
          { header: 'EPC', key: 'epc', width: 30 },
          { header: 'Tag Count', key: 'count', width: 12 }
        ];

        // Style header row
        summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

        // Add data rows
        uniqueEpcs.forEach(([epc, count]) => {
          summarySheet.addRow({ epc, count });
        });

        console.log('[IPC] ✓ Summary sheet created with', uniqueEpcs.length, 'unique EPCs');

        // SHEET 2: DETAILED RECORDS
        const detailSheet = workbook.addWorksheet('Detailed Records');
        
        // Add header row
        detailSheet.columns = [
          { header: 'EPC', key: 'epc', width: 30 },
          { header: 'Device', key: 'device_id', width: 20 },
          { header: 'Connection', key: 'reader_id', width: 20 },
          { header: 'Antenna', key: 'antenna', width: 10 },
          { header: 'RSSI', key: 'rssi', width: 10 },
          { header: 'Read Time', key: 'read_at', width: 25 }
        ];

        // Style header row
        detailSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        detailSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

        // Add data rows with formatted timestamps
        events.forEach(evt => {
          let readTimeFormatted = evt.read_at || '';
          if (readTimeFormatted) {
            try {
              const date = new Date(readTimeFormatted);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              const seconds = String(date.getSeconds()).padStart(2, '0');
              readTimeFormatted = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            } catch (e) {
              // Keep original format if conversion fails
            }
          }
          
          detailSheet.addRow({
            epc: evt.epc || '',
            device_id: evt.device_id || '',
            reader_id: evt.reader_id || '',
            antenna: evt.antenna || '',
            rssi: evt.rssi || 0,
            read_at: readTimeFormatted
          });
        });

        console.log('[IPC] ✓ Detailed Records sheet created with', events.length, 'records');

      } else {
        // ===== FOR 7+ DAYS: ONE SHEET PER DAY WITH EPC COUNT =====
        console.log('[IPC] Creating', days, '-day export with one sheet per day');
        
        // Group events by day
        const eventsByDay = {};
        
        events.forEach(evt => {
          try {
            const date = new Date(evt.read_at);
            const dateKey = date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            if (!eventsByDay[dateKey]) {
              eventsByDay[dateKey] = [];
            }
            eventsByDay[dateKey].push(evt);
          } catch (e) {
            console.warn('[IPC] ⊘ Failed to parse date for event:', evt.read_at);
          }
        });

        console.log('[IPC] ✓ Events grouped by day, total days:', Object.keys(eventsByDay).length);

        // Sort dates in reverse order (most recent first)
        const sortedDates = Object.keys(eventsByDay).sort().reverse();
        
        // Create a sheet for each day
        sortedDates.forEach(dateKey => {
          const dayEvents = eventsByDay[dateKey];
          
          // Create EPC count map for this day
          const epcCountMap = new Map();
          dayEvents.forEach(evt => {
            const epc = evt.epc || '';
            epcCountMap.set(epc, (epcCountMap.get(epc) || 0) + 1);
          });

          // Sort EPCs alphabetically
          const uniqueEpcs = Array.from(epcCountMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]));

          // Create sheet with date as name (max 31 chars for Excel sheet names)
          const sheetName = dateKey.substring(0, 31);
          const daySheet = workbook.addWorksheet(sheetName);

          // Add header row
          daySheet.columns = [
            { header: 'EPC', key: 'epc', width: 30 },
            { header: 'Tag Count', key: 'count', width: 12 }
          ];

          // Style header row
          daySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          daySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

          // Add data rows
          uniqueEpcs.forEach(([epc, count]) => {
            daySheet.addRow({ epc, count });
          });

          console.log('[IPC] ✓ Sheet created for', dateKey, 'with', uniqueEpcs.length, 'unique EPCs');
        });

        console.log('[IPC] ✓ All', sortedDates.length, 'daily sheets created');
      }

      // Generate Excel buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      console.log('[IPC] ✓ Excel workbook generated, size:', buffer.length, 'bytes');

      return { success: true, content: buffer.toString('base64'), count: events.length, isExcel: true };
      
    } catch (err) {
      console.error(formatErrorLine('EVRFID-DATA-005', `Database export error: ${err?.message || 'Unknown error'}`));
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
      console.error(formatErrorLine('EVGUI-EXPORT-001', `Failed to save log file: ${err?.message || 'Unknown error'}`));
      return { success: false, error: err.message };
    }
  });
}
