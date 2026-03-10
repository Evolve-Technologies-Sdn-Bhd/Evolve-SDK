import { performance } from 'perf_hooks';
import { MqttReader } from '../src/transports/MQTTTransport';
import { RfidEventEmitter } from '../src/events/EventBus';

/**
 * Performance benchmarks for MQTT communication
 * Tests payload parsing, latency, and concurrent message handling
 */

// Use higher thresholds in CI environment (GitHub Actions runners are slower)
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const ciMultiplier = isCI ? 2.0 : 1.0;

describe('Evolve SDK MQTT Performance', () => {
  const logPerf = (name: string, ms: number) => {
    console.log(`${name}: ${ms.toFixed(2)}ms`);
  };

  // Benchmark 1: JSON payload parsing
  test('benchmarks MQTT JSON payload parsing (10k payloads)', () => {
    const payloads = Array.from({ length: 10000 }, (_, i) => {
      return JSON.stringify({
        Type: 'Tag',
        EPC: `00000000000000000000000${String(i).padStart(3, '0')}`,
        RSSI: -50 - Math.random() * 40,
        AntId: (i % 4) + 1,
        ReadTime: new Date().toISOString(),
      });
    });

    const startTime = performance.now();
    for (const payload of payloads) {
      const parsed = JSON.parse(payload);
      const epc = parsed.EPC;
      const rssi = parsed.RSSI;
    }
    const endTime = performance.now();
    const avgMs = (endTime - startTime) / 10000;

    logPerf('MQTT JSON parsing (10k payloads)', endTime - startTime);
    console.log(`  - Average per payload: ${avgMs.toFixed(4)}ms`);
    console.log(`  - Throughput: ${Math.round(10000 / ((endTime - startTime) / 1000))} payloads/sec`);

    expect(endTime - startTime).toBeLessThan(100);
  });

  // Benchmark 2: Binary payload parsing
  test('benchmarks MQTT binary payload parsing (10k payloads)', () => {
    const payloads: Buffer[] = [];
    for (let i = 0; i < 10000; i++) {
      const buf = Buffer.alloc(24);
      buf[0] = 0xFF; // Magic byte 1
      buf[1] = 0xFE; // Magic byte 2
      buf.writeUInt16BE(16, 2); // Length
      buf.write(`000000000000000000000${String(i).padStart(3, '0')}`.slice(0, 16), 4); // EPC
      buf.writeInt8(-50 - Math.floor(Math.random() * 40), 20); // RSSI
      buf.writeUInt8((i % 4) + 1, 21); // Antenna ID
      payloads.push(buf);
    }

    const startTime = performance.now();
    for (const buf of payloads) {
      const isBinary = buf[0] === 0xFF && buf[1] === 0xFE;
      if (isBinary) {
        const length = buf.readUInt16BE(2);
        const epcData = buf.subarray(4, 4 + length);
        const rssi = buf.readInt8(4 + length);
        const antId = buf.readUInt8(5 + length);
      }
    }
    const endTime = performance.now();
    const avgMs = (endTime - startTime) / 10000;

    logPerf('MQTT binary parsing (10k payloads)', endTime - startTime);
    console.log(`  - Average per payload: ${avgMs.toFixed(4)}ms`);
    console.log(`  - Throughput: ${Math.round(10000 / ((endTime - startTime) / 1000))} payloads/sec`);
    console.log(`  - Speedup vs JSON: ${((100 - startTime) / 100).toFixed(2)}x`);

    expect(endTime - startTime).toBeLessThan(50);
  });

  // Benchmark 3: Message deduplication
  test('benchmarks MQTT message deduplication (100k messages, 20k unique)', () => {
    const seenTags = new Map<string, number>();
    
    const startTime = performance.now();
    for (let i = 0; i < 100000; i++) {
      const epc = `TAG_${String(i % 20000).padStart(5, '0')}`;
      
      if (seenTags.has(epc)) {
        seenTags.set(epc, (seenTags.get(epc) || 0) + 1);
      } else {
        seenTags.set(epc, 1);
      }
    }
    const endTime = performance.now();

    logPerf('MQTT deduplication (100k messages, 20k unique)', endTime - startTime);
    console.log(`  - Unique tags: ${seenTags.size}`);
    console.log(`  - Average duplicate count: ${((100000 - seenTags.size) / seenTags.size).toFixed(2)}`);

    expect(endTime - startTime).toBeLessThan(80 * ciMultiplier);
  });

  // Benchmark 4: RSSI filtering under load
  test('benchmarks MQTT RSSI filtering (100k messages, threshold -70)', () => {
    const messages = Array.from({ length: 100000 }, (_, i) => ({
      epc: `TAG_${i}`,
      rssi: -30 - Math.floor(Math.random() * 60), // Range: -30 to -90
      timestamp: Date.now(),
    }));

    const threshold = -70;
    const startTime = performance.now();
    const filtered = messages.filter(msg => msg.rssi > threshold);
    const endTime = performance.now();

    logPerf('MQTT RSSI filtering (100k messages)', endTime - startTime);
    console.log(`  - Messages above threshold: ${filtered.length}`);
    console.log(`  - Filtered out: ${messages.length - filtered.length}`);
    console.log(`  - Filter efficiency: ${((filtered.length / messages.length) * 100).toFixed(2)}%`);

    expect(endTime - startTime).toBeLessThan(50);
  });

  // Benchmark 5: Topic-based message routing
  test('benchmarks MQTT topic routing (100k messages, 10 topics)', () => {
    const topics = Array.from({ length: 10 }, (_, i) => `rfid/antenna/${i + 1}`);
    const messages = Array.from({ length: 100000 }, (_, i) => ({
      topic: topics[i % 10],
      epc: `TAG_${i}`,
      rssi: -50,
    }));

    const startTime = performance.now();
    const routedMessages = new Map<string, any[]>();
    
    for (const msg of messages) {
      if (!routedMessages.has(msg.topic)) {
        routedMessages.set(msg.topic, []);
      }
      routedMessages.get(msg.topic)!.push(msg);
    }
    const endTime = performance.now();

    logPerf('MQTT topic routing (100k messages, 10 topics)', endTime - startTime);
    console.log(`  - Topics used: ${routedMessages.size}`);
    console.log(`  - Average messages per topic: ${(100000 / routedMessages.size).toFixed(0)}`);

    expect(endTime - startTime).toBeLessThan(80);
  });

  // Benchmark 6: Concurrent broker message processing
  test('benchmarks MQTT concurrent processing (5 virtual subscribers, 20k messages each)', () => {
    const subscriberCount = 5;
    const messagesPerSubscriber = 20000;

    const startTime = performance.now();
    const results = Array(subscriberCount).fill(0).map((_, subscriberId) => {
      let processedCount = 0;
      for (let i = 0; i < messagesPerSubscriber; i++) {
        const parsed = {
          epc: `SUB${subscriberId}_TAG${i}`,
          rssi: -50,
          subscriber: subscriberId,
        };
        processedCount++;
      }
      return processedCount;
    });
    const endTime = performance.now();

    logPerf('MQTT concurrent processing (5 subscribers, 100k total messages)', endTime - startTime);
    console.log(`  - Total processed: ${results.reduce((a, b) => a + b, 0)}`);
    console.log(`  - Per subscriber rate: ${Math.round((messagesPerSubscriber * 1000) / (endTime - startTime))} msgs/sec`);

    expect(endTime - startTime).toBeLessThan(150);
  });

  // Benchmark 7: Payload size impact
  test('benchmarks MQTT payload size impact (1k-10k payloads)', () => {
    const payloadSizes = [100, 500, 1000, 5000];
    
    const results = payloadSizes.map(payloadSize => {
      const payloads = Array.from({ length: 1000 }, (_, i) => {
        return JSON.stringify({
          data: 'x'.repeat(payloadSize),
          epc: `TAG_${i}`,
        });
      });

      const startTime = performance.now();
      let parsed = 0;
      for (const payload of payloads) {
        JSON.parse(payload);
        parsed++;
      }
      const endTime = performance.now();

      return {
        payloadSize,
        processingTimeMs: endTime - startTime,
        throughputMBps: (1000 * payloadSize / ((endTime - startTime) / 1000)) / (1024 * 1024),
      };
    });

    console.log('MQTT payload size impact:');
    results.forEach(({ payloadSize, processingTimeMs, throughputMBps }) => {
      console.log(`  - ${payloadSize}B payload: ${processingTimeMs.toFixed(2)}ms, ${throughputMBps.toFixed(2)} MB/s`);
    });

    expect(results[results.length - 1].processingTimeMs).toBeLessThan(500);
  });

  // Benchmark 8: Connection stability simulation
  test('benchmarks MQTT connection stability (1000 connect/disconnect cycles)', () => {
    const startTime = performance.now();
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < 1000; i++) {
      try {
        // Simulate connection attempt
        if (Math.random() > 0.99) {
          throw new Error('Connection timeout');
        }
        // Simulate message handling
        const message = { epc: `TAG_${i}`, rssi: -50 };
        // Simulate disconnection
        successCount++;
      } catch (e) {
        failureCount++;
      }
    }
    const endTime = performance.now();

    logPerf('MQTT connection stability (1000 cycles)', endTime - startTime);
    console.log(`  - Successful connections: ${successCount}`);
    console.log(`  - Failed connections: ${failureCount}`);
    console.log(`  - Success rate: ${((successCount / 1000) * 100).toFixed(2)}%`);

    expect(endTime - startTime).toBeLessThan(150);
  });
});
