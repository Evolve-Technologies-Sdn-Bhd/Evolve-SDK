import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import { MqttReader } from '../src/transports/MQTTTransport';

jest.mock('mqtt');

describe('MqttReader', () => {
  let client: any;
  let reader: MqttReader;
  const tagCallback = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create fully working fake MQTT client
    client = new EventEmitter() as any;

    client.subscribe = jest.fn((topic: string, cb: (err: Error | null) => void) => {
      // simulate successful subscription
      if (cb) cb(null);
    });
    client.publish = jest.fn((topic, message, opts, cb) => {
      if (cb) cb(null);
    });

    client.connected = true; // IMPORTANT FIX

    (mqtt.connect as jest.Mock).mockReturnValue(client);

    const emitter = new EventEmitter() as any;

    reader = new MqttReader(
      'mqtt://localhost',
      'test/topic',
      emitter
    );

    reader.onTag(tagCallback);

    // start the connection process and simulate connect event
    const connectPromise = reader.connect();
    client.emit('connect');
    await connectPromise;
  });

  // -----------------------------
  // Parse EPCList array
  // -----------------------------
  it('should parse EPCList and emit individual tags', () => {
    const payload = JSON.stringify({
      EPCList: [
        { EPC: 'ABC123' },
        { EPC: 'DEF456' }
      ]
    });

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).toHaveBeenCalledTimes(2);
  });

  // -----------------------------
  // Nested EPC JSON string
  // -----------------------------
  it('should parse nested EPC JSON string', () => {
    const nestedPayload = JSON.stringify({
      EPC: JSON.stringify({ EPC: 'NESTED123' })
    });

    client.emit('message', 'test/topic', Buffer.from(nestedPayload));

    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({ epc: 'NESTED123' })
    );
  });

  // -----------------------------
  // Single EPC format
  // -----------------------------
  it('should parse single EPC format', () => {
    const payload = JSON.stringify({
      EPC: 'SINGLE123'
    });

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({ epc: 'SINGLE123' })
    );
  });

  // -----------------------------
  // Raw string EPC
  // -----------------------------
  it('should parse raw string EPC', () => {
    const payload = 'RAW123';

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({ epc: 'RAW123' })
    );
  });

  // -----------------------------
  // Empty EPCList
  // -----------------------------
  it('should handle empty EPCList array', () => {
    const payload = JSON.stringify({
      EPCList: []
    });

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).not.toHaveBeenCalled();
  });

  // -----------------------------
  // Invalid JSON payload
  // -----------------------------
  it('should handle invalid JSON gracefully', () => {
    const payload = 'invalid json {';

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({ epc: 'invalid json {' })
    );
  });

  // -----------------------------
  // Missing EPC field
  // -----------------------------
  it('should handle missing EPC field', () => {
    const payload = JSON.stringify({
      timestamp: '2024-01-01',
      other: 'data'
    });

    client.emit('message', 'test/topic', Buffer.from(payload));

    expect(tagCallback).not.toHaveBeenCalled();
  });

  // -----------------------------
  // Multiple connections
  // -----------------------------
  it('should handle reconnection', () => {
    client.emit('connect');
    client.emit('connect');

    expect(client.subscribe).toHaveBeenCalledTimes(3);
  });

  // -----------------------------
  // Disconnect event
  // -----------------------------
  it('should handle disconnect event', () => {
    expect(() => {
      client.emit('disconnect');
    }).not.toThrow();
  });

  // -----------------------------
  // publishStructured with multiple tags
  // -----------------------------
  it('publishStructured should handle array of tags', async () => {
    await reader.publishStructured([
      { epc: 'PUBLISH001' },
      { epc: 'PUBLISH002' }
    ]);

    expect(client.publish).toHaveBeenCalled();
  });

  // -----------------------------
  // publishStructured
  // -----------------------------
  it('publishStructured should publish formatted EPC', async () => {
    await reader.publishStructured({ epc: 'PUBLISH123' });

    expect(client.publish).toHaveBeenCalled();
  });

  // -----------------------------
  // Subscribe on connect
  // -----------------------------
  it('should subscribe on connect', () => {
    // subscribe is called with topic and callback
    expect(client.subscribe).toHaveBeenCalledWith('test/topic', expect.any(Function));
  });
});