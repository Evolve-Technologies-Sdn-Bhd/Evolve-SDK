/**
 * Serial RS-232 Connection Example with Database Integration
 * 
 * This example demonstrates:
 * 1. Connecting to an RFID reader via RS-232/COM port
 * 2. Receiving EPC tags in data stream
 * 3. Saving tag data to SQLite database
 * 4. Displaying tag count statistics
 * 
 * Prerequisites:
 * - RFID reader connected to a serial/COM port
 * - SerialPort library is installed (npm install serialport)
 * - A0Protocol compatible reader
 */

import { RfidSdk } from '../Rfidsdk';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Initialize Database
const dbPath = path.join(__dirname, 'rfid-tags.db');
const db = new Database(dbPath);

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS rfid_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    epc TEXT NOT NULL,
    reader_id TEXT NOT NULL,
    antenna INTEGER DEFAULT 0,
    rssi REAL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_epc ON rfid_events(epc);
  CREATE INDEX IF NOT EXISTS idx_read_at ON rfid_events(read_at);
`);

// Initialize SDK
const sdk = new RfidSdk();

// Statistics
let totalTags = 0;
let uniqueTags = new Set<string>();
const startTime = Date.now();

/**
 * Save tag to database
 */
function saveTagToDatabase(tag: any) {
  try {
    const stmt = db.prepare(`
      INSERT INTO rfid_events (epc, reader_id, antenna, rssi)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(
      tag.id || 'UNKNOWN',
      'SERIAL_READER_COM',
      tag.antenna || 0,
      tag.rssi || 0
    );
    
    console.log(`✓ Saved to DB: ${tag.id}`);
  } catch (err) {
    console.error('Database save error:', err);
  }
}

/**
 * Display statistics
 */
function displayStats() {
  const elapsed = (Date.now() - startTime) / 1000;
  const tagsPerSecond = (totalTags / elapsed).toFixed(2);
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║          TAG READING STATISTICS         ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║ Total Tags Received:        ${totalTags.toString().padEnd(20)} │`);
  console.log(`║ Unique Tags:                ${uniqueTags.size.toString().padEnd(20)} │`);
  console.log(`║ Elapsed Time:               ${elapsed.toFixed(1)}s${' '.repeat(20 - 4)} │`);
  console.log(`║ Tags/Second:                ${tagsPerSecond}${' '.repeat(20 - tagsPerSecond.length)} │`);
  console.log('╚════════════════════════════════════════╝\n');
}

/**
 * Connect to Serial Reader
 */
async function connectToSerialReader() {
  // COM port configuration - MODIFY THESE VALUES FOR YOUR SETUP
  const comPort = 'COM3';        // Change to your COM port (COM1, COM2, COM3, etc.)
  const baudRate = 115200;        // Common baud rates: 9600, 19200, 38400, 57600, 115200

  try {
    console.log(`\n🔌 Connecting to Serial Reader...`);
    console.log(`   COM Port: ${comPort}`);
    console.log(`   Baud Rate: ${baudRate}`);
    console.log(`   Database: ${dbPath}\n`);

    // Connect to the serial reader
    await sdk.connectSerial(comPort, baudRate);
    console.log('✓ Serial connection established!\n');

    // Set up tag read listener
    sdk.on('tag', (tag: any) => {
      totalTags++;
      uniqueTags.add(tag.id);

      console.log(`[TAG #${totalTags}] ${tag.id} | RSSI: ${tag.rssi}dBm | Time: ${new Date(tag.timestamp).toLocaleTimeString()}`);
      
      // Save to database
      saveTagToDatabase(tag);
    });

    // Set up error handler
    sdk.on('error', (err: Error) => {
      console.error(`✗ Error: ${err.message}`);
    });

    // Set up disconnection handler
    sdk.on('disconnected', () => {
      console.log('\n⚠️  Reader disconnected!');
      displayStats();
      process.exit(0);
    });

    // Start scanning
    console.log('🔍 Starting scan...\n');
    sdk.startScan();

    // Display stats every 30 seconds
    setInterval(displayStats, 30000);

    // Keep the process running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n\n⛔ Stopping scan and disconnecting...');
      sdk.stopScan();
      await sdk.disconnect();
      displayStats();
      
      // Query database for summary
      const result = db.prepare(`
        SELECT COUNT(*) as total, COUNT(DISTINCT epc) as unique 
        FROM rfid_events 
        WHERE read_at >= datetime('now', '-1 hour')
      `).get() as any;
      
      console.log(`✓ Database Summary (Last Hour):`);
      console.log(`  - Total reads: ${result.total}`);
      console.log(`  - Unique tags: ${result.unique}`);
      console.log(`✓ Database saved to: ${dbPath}\n`);
      
      process.exit(0);
    });

  } catch (err) {
    console.error('✗ Connection failed:', (err as Error).message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify the COM port number (check Device Manager)');
    console.error('2. Ensure baud rate matches your reader configuration');
    console.error('3. Check that the reader is powered on');
    console.error('4. On Windows, check for COM port conflicts');
    console.error('5. On Linux/Mac, verify port permissions (sudo may be required)\n');
    process.exit(1);
  }
}

/**
 * Export database to CSV
 */
function exportDatabaseToCSV() {
  try {
    const events = db.prepare(`
      SELECT epc, reader_id, antenna, rssi, read_at
      FROM rfid_events
      WHERE read_at >= datetime('now', '-24 hours')
      ORDER BY read_at DESC
    `).all() as any[];

    if (events.length === 0) {
      console.log('No data to export');
      return;
    }

    const csvPath = path.join(__dirname, `rfid-tags-${Date.now()}.csv`);
    const header = 'EPC,Reader,Antenna,RSSI,Timestamp\n';
    const rows = events.map(evt => 
      `"${evt.epc}",${evt.reader_id},${evt.antenna},${evt.rssi},"${evt.read_at}"`
    ).join('\n');

    fs.writeFileSync(csvPath, header + rows);
    console.log(`✓ Exported ${events.length} records to: ${csvPath}`);
  } catch (err) {
    console.error('Export error:', err);
  }
}

// ============================================
// Main Execution
// ============================================

connectToSerialReader().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// Export database when script exits
process.on('exit', () => {
  if (db) {
    exportDatabaseToCSV();
    db.close();
  }
});
