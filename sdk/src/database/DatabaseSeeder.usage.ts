/**
 * DatabaseSeeder Usage Examples
 * 
 * The DatabaseSeeder manages seed data for testing, demos, and initial data loading.
 * Supports JSON and CSV formats for import/export.
 */

import { RfidSdk, getDatabaseService, createSeeder } from '@evolve/sdk';

// ============================================================================
// EXAMPLE 1: Import JSON seed data
// ============================================================================

async function example1_ImportJsonSeed() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  // Import from JSON file
  const result = await seeder.importFromJson('./seed-sample.json');

  if (result.success) {
    console.log(`✓ Imported ${result.count} events from JSON`);
  } else {
    console.error(`✗ Import failed: ${result.error}`);
  }

  db.close();
}

// ============================================================================
// EXAMPLE 2: Import CSV seed data
// ============================================================================

async function example2_ImportCsvSeed() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  // Import from CSV file
  const result = await seeder.importFromCsv('./seed-sample.csv');

  if (result.success) {
    console.log(`✓ Imported ${result.count} events from CSV`);
  } else {
    console.error(`✗ Import failed: ${result.error}`);
  }

  db.close();
}

// ============================================================================
// EXAMPLE 3: Validate seed file before importing
// ============================================================================

async function example3_ValidateSeedFile() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  // Validate without importing
  const validation = seeder.validateSeedFile('./seed-sample.json');

  if (validation.valid) {
    console.log(`✓ Valid seed file with ${validation.eventCount} events`);
  } else {
    console.log('✗ Validation errors:');
    validation.errors.forEach((err) => console.log(`  - ${err}`));
  }

  db.close();
}

// ============================================================================
// EXAMPLE 4: Export database data as JSON seed file
// ============================================================================

async function example4_ExportAsJson() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  // Export all data
  const result = await seeder.exportAsJson('./exported-seed.json');

  if (result.success) {
    console.log(`✓ Exported to ${result.path}`);
  } else {
    console.error(`✗ Export failed: ${result.error}`);
  }

  // Export last 7 days
  const result7d = await seeder.exportAsJson('./exported-seed-7days.json', 7);

  db.close();
}

// ============================================================================
// EXAMPLE 5: Export database data as CSV seed file
// ============================================================================

async function example5_ExportAsCSV() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  // Export all data as CSV
  const result = await seeder.exportAsCsv('./exported-seed.csv');

  if (result.success) {
    console.log(`✓ Exported to ${result.path}`);
  } else {
    console.error(`✗ Export failed: ${result.error}`);
  }

  db.close();
}

// ============================================================================
// EXAMPLE 6: Create seed file from array (programmatic)
// ============================================================================

async function example6_CreateSeedFile() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  const seedEvents = [
    { epc: 'TAG001', readerId: 'reader-1', antenna: 1, rssi: -50 },
    { epc: 'TAG002', readerId: 'reader-1', antenna: 2, rssi: -45 },
    { epc: 'TAG003', readerId: 'reader-2', antenna: 1, rssi: -55 },
  ];

  const result = await seeder.createSeedFile(
    './my-custom-seed.json',
    seedEvents,
    {
      description: 'Custom test data for my application',
      createdAt: new Date().toISOString(),
      tags: ['custom', 'testing'],
    }
  );

  if (result.success) {
    console.log(`✓ Created seed file: ${result.path}`);
  }

  db.close();
}

// ============================================================================
// EXAMPLE 7: Full workflow - Validate, Import, and Verify
// ============================================================================

async function example7_FullWorkflow() {
  const db = getDatabaseService();
  const seeder = createSeeder(db);

  console.log('=== Seed Data Workflow ===\n');

  // Step 1: Validate
  console.log('1. Validating seed file...');
  const validation = seeder.validateSeedFile('./seed-sample.json');
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors);
    return;
  }
  console.log(`✓ Valid seed file with ${validation.eventCount} events\n`);

  // Step 2: Import
  console.log('2. Importing seed data...');
  const importResult = await seeder.importFromJson('./seed-sample.json');
  if (!importResult.success) {
    console.error('Import failed:', importResult.error);
    return;
  }
  console.log(`✓ Imported ${importResult.count} events\n`);

  // Step 3: Get statistics
  console.log('3. Checking imported data...');
  const stats = seeder.getSeededStats();
  console.log(`  Total events: ${stats.totalEvents}`);
  console.log(`  Unique EPCs: ${stats.uniqueEPCs}`);
  console.log(`  Readers: ${stats.readers.join(', ')}\n`);

  // Step 4: Export
  console.log('4. Exporting data as backup...');
  const exportResult = await seeder.exportAsJson('./backup-seed.json');
  if (exportResult.success) {
    console.log(`✓ Backup saved to ${exportResult.path}\n`);
  }

  console.log('=== Workflow Complete ===');
  db.close();
}

// ============================================================================
// SEED FILE FORMAT GUIDE
// ============================================================================

/**
 * JSON Seed File Format:
 * 
 * {
 *   "events": [
 *     {
 *       "epc": "TAG_IDENTIFIER",      // Required: Tag EPC/ID
 *       "readerId": "reader-name",     // Required: Reader identifier
 *       "antenna": 1,                  // Optional: Antenna number (1-4)
 *       "rssi": -50                    // Optional: Signal strength in dBm
 *     }
 *   ],
 *   "metadata": {
 *     "description": "Optional description",
 *     "createdAt": "ISO timestamp",
 *     "tags": ["optional", "tags"]
 *   }
 * }
 */

/**
 * CSV Seed File Format (with headers):
 * 
 * epc,readerId,antenna,rssi
 * TAG001,reader-1,1,-50
 * TAG002,reader-1,2,-45
 * TAG003,reader-2,1,-55
 * 
 * Note: antenna and rssi columns are optional
 */

// ============================================================================
// API REFERENCE
// ============================================================================

/**
 * DatabaseSeeder class methods:
 * 
 * async importFromJson(filePath: string): Promise<{ success, count, error? }>
 * - Import events from JSON seed file
 * - Returns count of imported events or error message
 * 
 * async importFromCsv(filePath: string): Promise<{ success, count, error? }>
 * - Import events from CSV seed file
 * - Returns count of imported events or error message
 * 
 * async exportAsJson(outputPath: string, days?: number): Promise<{ success, path?, error? }>
 * - Export database events as JSON seed file
 * - Optional: filter by last N days
 * 
 * async exportAsCsv(outputPath: string, days?: number): Promise<{ success, path?, error? }>
 * - Export database events as CSV seed file
 * - Optional: filter by last N days
 * 
 * async createSeedFile(outputPath: string, events: Array, metadata?): Promise<{ success, path?, error? }>
 * - Create seed file from event array (programmatic)
 * - Include custom metadata
 * 
 * validateSeedFile(filePath: string): { valid, errors, eventCount? }
 * - Validate seed file without importing
 * - Returns validation errors if any
 * 
 * getSeededStats(): { totalEvents, uniqueEPCs, readers }
 * - Get statistics about seeded data
 */

// ============================================================================
// USE CASES
// ============================================================================

/**
 * 1. TESTING
 *    Create seed files with known data for unit/integration tests
 *    - Reproducible data
 *    - Consistent test runs
 *    - Easy cleanup (export then clear)
 * 
 * 2. DEMOS
 *    Pre-load demo data to show application features
 *    - Professional demos with real data
 *    - No need to wait for live tag reads
 *    - Easy to reset between demos
 * 
 * 3. INITIAL DATA
 *    Load historical/baseline data when setting up
 *    - Migrate from other systems
 *    - Import legacy data
 *    - Populate test databases
 * 
 * 4. BACKUP/RESTORE
 *    Export current data as backup
 *    - JSON/CSV human-readable format
 *    - Easy to share
 *    - Restore to another instance
 * 
 * 5. DATA ANALYSIS
 *    Export for analysis in Excel/data tools
 *    - CSV format for spreadsheets
 *    - JSON for data pipelines
 *    - Filter by date range
 */
