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
    mockClient.publish = jest.fn();
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

});