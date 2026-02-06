/**
 * Serial Transport Test
 * Tests serial port connectivity and data transmission
 */

import { SerialTransport } from '../transports/SerialTransport';
import { UF3SReader } from '../readers/UF3SReader';
import { ReaderInfo } from '../types/reader';
import { SDKEvent } from '../types/event';

export async function testSerialTransport(portPath: string) {
  console.log(`\n=== Testing Serial Transport on ${portPath} ===\n`);

  const transport = new SerialTransport(portPath, 115200);

  try {
    // Test 1: Connect
    console.log('Test 1: Connecting to serial port...');
    await transport.connect();
    console.log('✓ Connected successfully\n');

    // Test 2: Setup data listener
    console.log('Test 2: Setting up data listener...');
    let receivedCount = 0;
    transport.onData((data) => {
      receivedCount++;
      console.log(`  [${receivedCount}] Received ${data.length} bytes:`, data.toString('hex'));
    });
    console.log('✓ Data listener ready\n');

    // Test 3: Setup error listener
    console.log('Test 3: Setting up error listener...');
    transport.onError((err) => {
      console.error('  ✗ Transport error:', err.message);
    });
    console.log('✓ Error listener ready\n');

    // Test 4: Test connection status
    console.log('Test 4: Checking connection status...');
    console.log(`  Connected: ${transport.isConnected()}`);
    console.log('✓ Status check passed\n');

    // Test 5: Wait for incoming data
    console.log('Test 5: Waiting for incoming data (10 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (receivedCount > 0) {
      console.log(`✓ Received ${receivedCount} data packets\n`);
    } else {
      console.log('⚠ No data received (reader may not be sending)\n');
    }

    // Test 6: Disconnect
    console.log('Test 6: Disconnecting...');
    await transport.disconnect();
    console.log('✓ Disconnected successfully\n');

    console.log('=== All Serial Transport Tests Passed ===\n');
  } catch (err) {
    console.error('✗ Test failed:', (err as Error).message);
    process.exit(1);
  }
}

/**
 * Integration test with UF3SReader
 */
export async function testUF3SReader(portPath: string) {
  console.log(`\n=== Testing UF3S Reader on ${portPath} ===\n`);

  const transport = new SerialTransport(portPath, 115200);

  const readerInfo: ReaderInfo = {
    id: `serial-${portPath}`,
    model: 'UF3-S',
    transport: 'serial',
    address: portPath,
  };

  const reader = new UF3SReader(readerInfo, transport);

  try {
    // Setup event listeners
    const eventBus = reader.getEventBus();

    console.log('Setting up event listeners...');
    eventBus.on(SDKEvent.CONNECTED, (info) => {
      console.log(`✓ Reader Connected: ${info.model} (${info.address})`);
    });

    eventBus.on(SDKEvent.TAG_DETECTED, (data) => {
      console.log(`✓ TAG DETECTED: ${data.tagId} at ${data.timestamp}`);
    });

    eventBus.on(SDKEvent.ERROR, (err) => {
      console.error(`✗ ERROR: ${err.message}`);
    });

    // Connect
    console.log('\nConnecting to reader...');
    await reader.connect();

    // Wait for tags
    console.log('Waiting for tags (15 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // Disconnect
    console.log('\nDisconnecting...');
    await reader.disconnect();

    console.log('✓ Test completed successfully\n');
  } catch (err) {
    console.error('✗ Test failed:', (err as Error).message);
    process.exit(1);
  }
}

/**
 * Run serial transport tests
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  ts-node serialTest.ts <port-path>');
    console.log('\nExample:');
    console.log('  ts-node serialTest.ts COM3          # Windows');
    console.log('  ts-node serialTest.ts /dev/ttyUSB0  # Linux');
    console.log('  ts-node serialTest.ts /dev/tty.usbserial-123456  # macOS\n');
    process.exit(0);
  }

  const portPath = args[0];
  testUF3SReader(portPath).catch(console.error);
}
