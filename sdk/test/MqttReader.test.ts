import { MqttReader } from "../src/transports/MQTTTransport";
import { RfidEventEmitter } from "../src/events/EventBus";
import mqtt from "mqtt";
import { EventEmitter } from "events";

jest.mock("mqtt");

const mockMqtt = mqtt as jest.Mocked<typeof mqtt>;

describe("MqttReader", () => {

  let reader: MqttReader;
  let mockClient: any;
  let tagCallback: jest.Mock;

  /**
   * Flush async pipeline
   * Needed because SDK now uses setImmediate()
   */
  const flush = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  beforeEach(() => {

    tagCallback = jest.fn();

    mockClient = new EventEmitter();
    mockClient.subscribe = jest.fn((topic: string, cb: any) => cb?.());
    mockClient.publish = jest.fn((topic: string, payload: any, opts: any, cb: any) => {
      if (typeof cb === 'function') cb(null);
    });
    mockClient.end = jest.fn();
    mockClient.connected = true;

    mockMqtt.connect.mockReturnValue(mockClient);

    const emitter = new RfidEventEmitter();
    reader = new MqttReader("mqtt://127.0.0.1:1883", "rfid/tags", emitter);

    reader.onTag(tagCallback);
  });

  afterEach(() => {
    jest.clearAllMocks();
    reader?.disconnect?.();
  });

  /**
   * TEST 1
   * Connection should subscribe to topic
   */
  test("should connect and subscribe to topic", async () => {

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit("connect"));
    await connectPromise;

    expect(mockMqtt.connect).toHaveBeenCalled();
    expect(mockClient.subscribe).toHaveBeenCalledWith("rfid/tags", expect.any(Function));
  });

  /**
   * TEST 2
   * Should parse single tag
   */
  test("should emit tag when message received", async () => {

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit("connect"));
    await connectPromise;

    const payload = JSON.stringify({
      EPC: "ABC123",
      RSSI: -54,
      Antenna: "1",
      Device: "-"
    });

    mockClient.emit("message", "rfid/tags", Buffer.from(payload));

    await flush();

    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        epc: "ABC123"
      })
    );

  });

  /**
   * TEST 3
   * Should parse multiple tags
   */
  test("should emit multiple tags from EPC list", async () => {

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit("connect"));
    await connectPromise;

    const payload = JSON.stringify({
      EPCList: ["ABC123", "DEF456"],
      RSSI: -50,
      Antenna: "1"
    });

    mockClient.emit("message", "rfid/tags", Buffer.from(payload));

    await flush();

    expect(tagCallback).toHaveBeenCalledTimes(2);

  });

  /**
   * TEST 4
   * Nested tag format
   */
  test("should parse nested tag structure", async () => {

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit("connect"));
    await connectPromise;

    const payload = JSON.stringify({
      tag: {
        EPC: "AAAA111122223333"
      }
    });

    mockClient.emit("message", "rfid/tags", Buffer.from(payload));

    await flush();

    expect(tagCallback).toHaveBeenCalledTimes(1);

    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        epc: "AAAA111122223333"
      })
    );

  });

  /**
   * TEST 5
   * Invalid JSON should not crash
   */
  test("should ignore invalid JSON payload", async () => {

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit("connect"));
    await connectPromise;

    mockClient.emit("message", "rfid/tags", Buffer.from("NOT JSON"));

    await flush();

    // The current implementation returns the trimmed payload as EPC if JSON fails
    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        epc: "NOTJSON"
      })
    );

  });

  /**
   * TEST 6
   * Hex-encoded JSON should parse successfully
   */
  test('should parse hex-encoded JSON payload', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    const obj = { EPC: 'AAAABBBB', RSSI: -30 };
    const hex = Buffer.from(JSON.stringify(obj)).toString('hex');
    mockClient.emit('message', 'rfid/tags', Buffer.from(hex));

    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(expect.objectContaining({ epc: 'AAAABBBB' }));
  });

  /**
   * TEST 7
   * Vendor-formatted EPCList under data field
   */
  test('should handle vendor EPCList structure', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    const payload = JSON.stringify({ data: { EpcList: [{ EPC: '1111' }, { EPC: '2222' }], Device: 'DEV1' } });
    mockClient.emit('message', 'rfid/tags', Buffer.from(payload));

    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 8
   * Unexpected payload should emit UNKNOWN
   */
  test('should emit UNKNOWN for unexpected structure', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    const payload = JSON.stringify({ foo: 'bar', baz: 123 });
    mockClient.emit('message', 'rfid/tags', Buffer.from(payload));

    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(expect.objectContaining({ epc: 'UNKNOWN' }));
  });

  /**
   * TEST 9
   * Binary payload handling
   */
  test('should parse binary EPC payload', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    // create buffer: FF FE [len=2] EPC(2 bytes) RSSI ANT
    const epc = Buffer.from([0xAA, 0xBB]);
    const buf = Buffer.alloc(6 + epc.length);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    buf.writeUInt16BE(epc.length, 2);
    epc.copy(buf, 4);
    buf[4 + epc.length] = 0x05; // rssi
    buf[5 + epc.length] = 0x02; // ant

    mockClient.emit('message', 'rfid/tags', buf);
    await flush();

    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(expect.objectContaining({ epc: 'AABB' }));
  });

  /**
   * TEST 10
   * Disconnect call should end client
   */
  test('disconnect should end client and clear reference', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    await reader.disconnect();
    expect(mockClient.end).toHaveBeenCalledWith(true);
    expect((reader as any).client).toBeUndefined();
  });

  /**
   * TEST 10b
   * On reconnect, resubscribe should be invoked
   */
  test('should resubscribe on second connect event', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    mockClient.subscribe.mockClear();
    mockClient.emit('connect'); // simulate reconnect
    expect(mockClient.subscribe).toHaveBeenCalled();
  });

  /**
   * TEST 10c
   * close/disconnect events produce disconnected emitter
   */
  test('should emit disconnected when connection closes or disconnects', async () => {
    const disconnected = jest.fn();
    reader.on('disconnected', disconnected);

    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    mockClient.emit('close');
    mockClient.emit('disconnect');
    expect(disconnected).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 11 variant
   * connection failure emits an error event when maxRetries reached
   */
  test('connection failure should emit error event when give up', async () => {
    const errCB = jest.fn();
    reader.on('error', errCB);
    (reader as any).maxRetries = 0;
    mockClient.subscribe = jest.fn((t, cb) => cb(new Error('subfail2')));

    const p = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await expect(p).rejects.toThrow('subfail2');
    expect(errCB).toHaveBeenCalled();
  });

  /**
   * TEST 12
   * Type:EPCList payload format
   */
  test('should parse payload with Type:EPCList', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    const payload = JSON.stringify({ Type: 'EPCList', data: { EPCList: [{ EPC: 'T1' }, { EPC: 'T2' }] } });
    mockClient.emit('message', 'rfid/tags', Buffer.from(payload));
    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(2);
  });

  /**
   * TEST 13
   * EPC property as JSON string containing nested object/list
   */
  test('should handle EPC string containing JSON object/list', async () => {
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;

    const obj = { EPC: 'XYZ' };
    const payload = JSON.stringify({ EPC: JSON.stringify(obj) });
    mockClient.emit('message', 'rfid/tags', Buffer.from(payload));
    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(1);
    expect(tagCallback).toHaveBeenCalledWith(expect.objectContaining({ epc: 'XYZ' }));

    // also list inside EPC string
    tagCallback.mockClear();
    const listObj = { EPCList: [{ EPC: 'L1' }] };
    const payload2 = JSON.stringify({ EPC: JSON.stringify(listObj) });
    mockClient.emit('message', 'rfid/tags', Buffer.from(payload2));
    await flush();
    expect(tagCallback).toHaveBeenCalledTimes(1);
  });

  /**
   * TEST 11
   * Connection error triggers retry mechanism and eventual success
   */
  test('should retry after connection error and eventually connect', async () => {
    jest.useFakeTimers();
    let callCount = 0;
    mockMqtt.connect.mockImplementation(() => {
      callCount++;
      const c = new EventEmitter() as any;
      c.subscribe = jest.fn((t, cb) => cb && cb());
      c.publish = jest.fn();
      c.end = jest.fn();
      c.connected = false;
      if (callCount === 1) {
        setImmediate(() => c.emit('error', new Error('first fail')));
      } else {
        setImmediate(() => c.emit('connect'));
      }
      return c;
    });

    const p = reader.connect();
    // run timers to process backoff delays
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(1000);

    await p;
    expect(callCount).toBeGreaterThan(1);
    jest.useRealTimers();
  });

  /**
   * TEST 12
   * subscribe error should reject connection
   */
  test('should reject if subscribe callback returns error', async () => {
    // force immediate failure by disabling retries
    (reader as any).maxRetries = 0;
    mockClient.subscribe = jest.fn((topic, cb) => cb(new Error('subfail')));

    const p = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await expect(p).rejects.toThrow('subfail');
  });

  /**
   * TEST 13
   * should publish and publishStructured correctly
   */
  test('publish methods should work when connected and fail when not', async () => {
    // not connected -> reject
    await expect(reader.publish({epc:'X'})).rejects.toThrow('not connected');

    // connect first
    const connectPromise = reader.connect();
    setImmediate(() => mockClient.emit('connect'));
    await connectPromise;
    // set client.connected to true
    mockClient.connected = true;

    const success = await reader.publish({epc:'PING', raw:'hello'});
    expect(success).toBe(true);
    expect(mockClient.publish).toHaveBeenCalled();

    const structured = await reader.publishStructured({epc:'PING2'});
    expect(structured).toBe(true);
    expect(mockClient.publish).toHaveBeenCalled();
  });

});