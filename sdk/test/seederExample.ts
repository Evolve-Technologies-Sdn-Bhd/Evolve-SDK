/**
 * DatabaseSeeder Usage Examples
 * 
 * This file demonstrates how to use DatabaseSeeder to:
 * - Import seed data from JSON/CSV files
 * - Export database data as seed files
 * - Validate seed files before importing
 */

import { createSeeder } from '../src/index';
import { SqliteDatabase } from '../src/database/SqLiteDatabase';
import * as path from 'path';

async function examples() {
  // Initialize database
  const dbPath = path.join(__dirname, '../test-data/rfid.db');
  const db = new SqliteDatabase(dbPath);

  // Create seeder instance
  const seeder = createSeeder(db);

  // Example 1: Import from JSON seed file
  console.log('\n--- Example 1: Import from JSON ---');
  const jsonResult = await seeder.importFromJson(path.join(__dirname, '../database/seed-sample.json'));
  console.log('Import result:', jsonResult);

  // Example 2: Import from CSV seed file
  console.log('\n--- Example 2: Import from CSV ---');
  const csvResult = await seeder.importFromCsv(path.join(__dirname, '../database/seed-sample.csv'));
  console.log('Import result:', csvResult);

  // Example 3: Validate seed file without importing
  console.log('\n--- Example 3: Validate Seed File ---');
  const validation = seeder.validateSeedFile(path.join(__dirname, '../database/seed-sample.json'));
  console.log('Validation result:', validation);

  // Example 4: Export database as JSON
  console.log('\n--- Example 4: Export as JSON ---');
  const exportJson = await seeder.exportAsJson(path.join(__dirname, '../test-data/export-sample.json'));
  console.log('Export result:', exportJson);

  // Example 5: Create seed file programmatically
  console.log('\n--- Example 5: Create Seed File Programmatically ---');
  const customEvents = [
    { epc: 'TEST-001', readerId: 'reader-test', antenna: 1, rssi: -45 },
    { epc: 'TEST-002', readerId: 'reader-test', antenna: 2, rssi: -50 },
    { epc: 'TEST-003', readerId: 'reader-test', antenna: 3, rssi: -55 },
  ];
  const createResult = await seeder.createSeedFile(
    path.join(__dirname, '../test-data/custom-seed.json'),
    customEvents,
    { description: 'Custom test data', tags: ['test', 'demo'] }
  );
  console.log('Create result:', createResult);

  console.log('\n✅ All examples completed!');
}

// Run if executed directly
if (require.main === module) {
  examples().catch(console.error);
}

export { examples };
