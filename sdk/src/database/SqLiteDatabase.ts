import Database from 'better-sqlite3';

interface RFIDEvent {
  epc: string;
  readerId: string;
  antenna: number;
  rssi: number;
  deviceId: string;
}

class SqliteDatabase {
  private db: Database.Database;

  constructor(filename = 'rfid.db') {
    this.db = new Database(filename);
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rfid_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        epc TEXT,
        reader_id TEXT,
        antenna INTEGER,
        rssi REAL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_id TEXT
      );
    `);

    this.cleanupOldData();
  }

  saveEvent(event: RFIDEvent) {
    const stmt = this.db.prepare(`
      INSERT INTO rfid_events (epc, reader_id, antenna, rssi, device_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(event.epc, event.readerId, event.antenna, event.rssi);
  }

  getEvents(days: 1 | 7 | 30) {
    return this.db.prepare(`
      SELECT * FROM rfid_events
      WHERE read_at >= datetime('now', ?)
    `).all(`-${days} days`);
  }

  private cleanupOldData() {
    this.db.exec(`
      DELETE FROM rfid_events
      WHERE read_at < datetime('now', '-30 days')
    `);
  }
}