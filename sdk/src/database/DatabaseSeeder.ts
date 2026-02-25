import * as fs from 'fs';
import * as path from 'path';

/**
 * Database Seeder - Manages seed data for RFID events
 * 
 * Provides functionality to:
 * 1. Create seed data from JSON/CSV files
 * 2. Import seed data into database
 * 3. Export database data as seed files
 * 4. Manage demo/test data
 */

export interface SeedData {
  events: Array<{
    epc: string;
    readerId: string;
    antenna?: number;
    rssi?: number;
  }>;
  metadata?: {
    description?: string;
    createdAt?: string;
    tags?: string[];
  };
}

export class DatabaseSeeder {
  private dbRef: any; // Reference to any database instance with saveEvent/getEvents

  constructor(dbRef: any) {
    this.dbRef = dbRef;
  }

  /**
   * Import seed data from JSON file
   * 
   * Expected JSON format:
   * {
   *   "events": [
   *     { "epc": "EPC001", "readerId": "reader-1", "antenna": 1, "rssi": -50 },
   *     { "epc": "EPC002", "readerId": "reader-1", "antenna": 2, "rssi": -45 }
   *   ],
   *   "metadata": { "description": "Demo data" }
   * }
   */
  async importFromJson(filePath: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, count: 0, error: `File not found: ${filePath}` };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const seedData: SeedData = JSON.parse(content);

      if (!seedData.events || !Array.isArray(seedData.events)) {
        return { success: false, count: 0, error: 'Invalid JSON format: missing "events" array' };
      }

      // Import each event
      let count = 0;
      for (const evt of seedData.events) {
        if (this.dbRef && typeof this.dbRef.saveEvent === 'function') {
          this.dbRef.saveEvent({
            epc: evt.epc,
            readerId: evt.readerId,
            antenna: evt.antenna || 0,
            rssi: evt.rssi || 0,
          });
          count++;
        }
      }

      console.log(`[DatabaseSeeder] Successfully imported ${count} events from ${path.basename(filePath)}`);
      return { success: true, count };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[DatabaseSeeder] Import failed:', error);
      return { success: false, count: 0, error };
    }
  }

  /**
   * Import seed data from CSV file
   * 
   * Expected CSV format (with header):
   * epc,readerId,antenna,rssi
   * EPC001,reader-1,1,-50
   * EPC002,reader-1,2,-45
   */
  async importFromCsv(filePath: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, count: 0, error: `File not found: ${filePath}` };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

      if (lines.length < 2) {
        return { success: false, count: 0, error: 'CSV file must have header and at least one data row' };
      }

      const header = lines[0].split(',').map((h) => h.toLowerCase().trim());
      const epcIndex = header.indexOf('epc');
      const readerIdIndex = header.indexOf('readerid');
      const antennaIndex = header.indexOf('antenna');
      const rssiIndex = header.indexOf('rssi');

      if (epcIndex === -1 || readerIdIndex === -1) {
        return { success: false, count: 0, error: 'CSV must have "epc" and "readerId" columns' };
      }

      let count = 0;
      for (let i = 1; i <lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        if (values.length < 2) continue;

        if (this.dbRef && typeof this.dbRef.saveEvent === 'function') {
          this.dbRef.saveEvent({
            epc: values[epcIndex],
            readerId: values[readerIdIndex],
            antenna: antennaIndex !== -1 ? parseInt(values[antennaIndex]) || 0 : 0,
            rssi: rssiIndex !== -1 ? parseFloat(values[rssiIndex]) || 0 : 0,
          });
          count++;
        }
      }

      if (count === 0) {
        return { success: false, count: 0, error: 'No valid events found in CSV' };
      }

      console.log(`[DatabaseSeeder] Successfully imported ${count} events from ${path.basename(filePath)}`);
      return { success: true, count };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[DatabaseSeeder] CSV import failed:', error);
      return { success: false, count: 0, error };
    }
  }

  /**
   * Export database data as JSON seed file
   */
  async exportAsJson(outputPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      if (!this.dbRef || typeof this.dbRef.getEvents !== 'function') {
        return { success: false, error: 'Database not available' };
      }

      const events: any[] = this.dbRef.getEvents(30) || []; // Get last 30 days

      if (events.length === 0) {
        return { success: false, error: 'No data to export' };
      }

      const seedData: SeedData = {
        events: events.map((evt: any) => ({
          epc: evt.epc,
          readerId: evt.reader_id || evt.readerId,
          antenna: evt.antenna,
          rssi: evt.rssi,
        })),
        metadata: {
          description: 'Exported RFID seed data',
          createdAt: new Date().toISOString(),
          tags: ['exported', 'seed-data'],
        },
      };

      const output = JSON.stringify(seedData, null, 2);
      fs.writeFileSync(outputPath, output, 'utf-8');

      console.log(`[DatabaseSeeder] Successfully exported ${events.length} events to ${path.basename(outputPath)}`);
      return { success: true, path: outputPath };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[DatabaseSeeder] JSON export failed:', error);
      return { success: false, error };
    }
  }

  /**
   * Validate seed file without importing
   */
  validateSeedFile(filePath: string): { valid: boolean; errors: string[]; eventCount?: number } {
    const errors = [];

    try {
      if (!fs.existsSync(filePath)) {
        errors.push(`File not found: ${filePath}`);
        return { valid: false, errors };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const seedData = JSON.parse(content);

      if (!seedData.events) {
        errors.push('Missing "events" array');
      } else if (!Array.isArray(seedData.events)) {
        errors.push('"events" must be an array');
      } else {
        // Validate each event
        seedData.events.forEach((evt: any, idx: number) => {
          if (!evt.epc) errors.push(`Event ${idx}: missing "epc" field`);
          if (!evt.readerId) errors.push(`Event ${idx}: missing "readerId" field`);
          if (evt.antenna !== undefined && typeof evt.antenna !== 'number') {
            errors.push(`Event ${idx}: "antenna" must be a number`);
          }
          if (evt.rssi !== undefined && typeof evt.rssi !== 'number') {
            errors.push(`Event ${idx}: "rssi" must be a number`);
          }
        });
      }

      if (errors.length > 0) {
        return { valid: false, errors };
      }

      return { valid: true, errors: [], eventCount: seedData.events.length };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push(`Parse error: ${error}`);
      return { valid: false, errors };
    }
  }
}

/**
 * Create seeder instance from existing database
 */
export function createSeeder(db: any): DatabaseSeeder {
  return new DatabaseSeeder(db);
}
