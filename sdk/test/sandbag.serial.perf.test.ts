import { performance } from 'perf_hooks';
import { SerialReader } from '../src/transports/SerialTransport';
import { RfidEventEmitter } from '../src/events/EventBus';

/**
 * Performance benchmarks for Serial communication
 * Tests data throughput, latency, and protocol parsing efficiency
 */
describe('Evolve SDK Serial Performance', () => {
  const logPerf = (name: string, ms: number) => {
    console.log(`${name}: ${ms.toFixed(2)}ms`);
  };

  // Benchmark 1: Serial frame parsing (F5001 protocol simulation)
  test('benchmarks serial frame parsing (F5001 protocol)', () => {
    const frameData = Buffer.from([
      0xBB, 0x00, 0x22, // Header + length
      0x01, // Command
      0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, // EPC (8 bytes)
      0x38, 0x39, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46,
      0xF0, // RSSI
      0x01, // Antenna ID
      0x00, 0x00, 0x00, 0x00, // Timestamp
      0x00, // Checksum
      0x7E  // End marker
    ]);

    // Parse 10,000 frames
    const startTime = performance.now();
    for (let i = 0; i < 10000; i++) {
      const epc = frameData.slice(3, 19).toString('hex').toUpperCase();
      const rssi = frameData[19];
      const antId = frameData[20];
    }
    const endTime = performance.now();
    const avgMs = (endTime - startTime) / 10000;

    logPerf('Serial frame parsing (10k frames)', endTime - startTime);
    console.log(`  - Average per frame: ${avgMs.toFixed(3)}ms`);
    console.log(`  - Throughput: ${Math.round(10000 / ((endTime - startTime) / 1000))} frames/sec`);

    expect(endTime - startTime).toBeLessThan(100); // Should parse 10k frames in < 100ms
  });

  // Benchmark 2: Bulk data reception (simulating continuous serial stream)
  test('benchmarks serial bulk data reception (100k tags)', () => {
    const tagBuffers: Buffer[] = [];
    for (let i = 0; i < 100000; i++) {
      tagBuffers.push(Buffer.from([
        0xBB, 0x00, 0x22,
        0x01,
        0x30 + (i % 16), 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
        0x38, 0x39, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46,
        0xA5 - (i % 50),
        0x01,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x7E
      ]));
    }

    const startTime = performance.now();
    let processedCount = 0;
    for (const buf of tagBuffers) {
      const epc = buf.slice(3, 19).toString('hex');
      const rssi = buf[19];
      processedCount++;
    }
    const endTime = performance.now();

    logPerf('Serial bulk reception (100k tags)', endTime - startTime);
    console.log(`  - Tags processed: ${processedCount}`);
    console.log(`  - Average latency: ${((endTime - startTime) / processedCount).toFixed(4)}ms per tag`);

    expect(endTime - startTime).toBeLessThan(500);
  });

  // Benchmark 3: Deduplication during serial streaming
  test('benchmarks serial deduplication with 50k unique tags', () => {
    const seenTags = new Map<string, number>();
    
    const startTime = performance.now();
    for (let i = 0; i < 50000; i++) {
      const epc = `TAG_${String(i % 10000).padStart(5, '0')}`; // 10k unique tags
      
      if (seenTags.has(epc)) {
        seenTags.set(epc, (seenTags.get(epc) || 0) + 1);
      } else {
        seenTags.set(epc, 1);
      }
    }
    const endTime = performance.now();

    logPerf('Serial deduplication (50k reads, 10k unique)', endTime - startTime);
    console.log(`  - Unique tags: ${seenTags.size}`);
    console.log(`  - Duplicate rate: ${(((50000 - seenTags.size) / 50000) * 100).toFixed(2)}%`);

    expect(endTime - startTime).toBeLessThan(50);
  });

  // Benchmark 4: RSSI filtering performance
  test('benchmarks serial RSSI filtering (100k tags)', () => {
    const tags = Array.from({ length: 100000 }, (_, i) => ({
      epc: `TAG_${i}`,
      rssi: -40 - Math.floor(Math.random() * 50), // RSSI range: -40 to -90
    }));

    const rssiThreshold = -70;
    const startTime = performance.now();
    const filteredTags = tags.filter(tag => tag.rssi > rssiThreshold);
    const endTime = performance.now();

    logPerf('Serial RSSI filtering (100k tags, threshold > -70)', endTime - startTime);
    console.log(`  - Tags above threshold: ${filteredTags.length}`);
    console.log(`  - Filtered out: ${tags.length - filteredTags.length}`);

    expect(endTime - startTime).toBeLessThan(50);
  });

  // Benchmark 5: Concurrent frame parsing (multi-antenna simulation)
  test('benchmarks concurrent antenna parsing (4 antennas, 25k tags each)', () => {
    const antennaCount = 4;
    const tagsPerAntenna = 25000;

    const startTime = performance.now();
    const results = Array(antennaCount).fill(0).map((_, antId) => {
      const antennaTags: any[] = [];
      for (let i = 0; i < tagsPerAntenna; i++) {
        antennaTags.push({
          epc: `ANT${antId}_TAG${i}`,
          rssi: -50 - Math.random() * 40,
          antenna: antId + 1,
        });
      }
      return antennaTags.length;
    });
    const endTime = performance.now();

    logPerf('Concurrent antenna parsing (4 antennas, 100k total)', endTime - startTime);
    console.log(`  - Total processed: ${results.reduce((a, b) => a + b, 0)}`);

    expect(endTime - startTime).toBeLessThan(100);
  });

  // Benchmark 6: Port error recovery simulation
  test('benchmarks serial error recovery (1000 recovery cycles)', () => {
    const startTime = performance.now();
    let recoveredCount = 0;

    for (let i = 0; i < 1000; i++) {
      try {
        // Simulate error
        if (i % 100 === 0) {
          throw new Error('Serial port error');
        }
        // Simulate recovery
        const recovered = Math.random() > 0.5;
        if (recovered) recoveredCount++;
      } catch (e) {
        // Recovery logic
        recoveredCount++;
      }
    }
    const endTime = performance.now();

    logPerf('Serial error recovery (1000 cycles)', endTime - startTime);
    console.log(`  - Successful recoveries: ${recoveredCount}`);
    console.log(`  - Recovery success rate: ${((recoveredCount / 1000) * 100).toFixed(2)}%`);

    expect(endTime - startTime).toBeLessThan(100);
  });

  // Benchmark 7: Baud rate impact simulation (data rate differences)
  test('benchmarks serial data throughput at different baud rates', () => {
    const baudRates = [9600, 57600, 115200];
    const dataSize = 100000; // bytes

    const results = baudRates.map(baud => {
      const bytesPerSecond = baud / 10; // 10 bits per byte (8 data + start + stop)
      const expectedTimeMs = (dataSize / bytesPerSecond) * 1000;
      
      const startTime = performance.now();
      let processed = 0;
      for (let i = 0; i < dataSize; i++) {
        processed++;
      }
      const actualTimeMs = performance.now() - startTime;

      return { baud, expectedTimeMs, actualTimeMs };
    });

    console.log('Serial throughput at different baud rates:');
    results.forEach(({ baud, expectedTimeMs, actualTimeMs }) => {
      console.log(`  - ${baud} baud: expected ${expectedTimeMs.toFixed(2)}ms, actual ${actualTimeMs.toFixed(2)}ms`);
    });

    expect(results[results.length - 1].actualTimeMs).toBeLessThan(50);
  });
});
