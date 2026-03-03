import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import { MqttConnectionManager } from '../src/connections/MqttConnectionManager';

jest.mock('mqtt', () => ({
  connect: jest.fn(),
}));

const createMockClient = () => {
  const client = new EventEmitter() as any;

  client.subscribe = jest.fn((topic, cb) => cb?.(null));
  client.publish = jest.fn((topic, payload, options, cb) => cb?.(null));
  client.end = jest.fn((force, opts, cb) => cb?.());

  return client;
};

describe('MqttConnectionManager', () => {
  let client: any;

  beforeEach(() => {
    jest.clearAllMocks();
    client = createMockClient();
    (mqtt.connect as jest.Mock).mockReturnValue(client);
  });

  test('should connect successfully', async () => {
    const manager = new MqttConnectionManager();

    const promise = manager.connect({
      brokerUrl: 'mqtt://localhost',
      topic: 'test/topic',
    });

    client.emit('connect');

    const status = await promise;

    expect(status.connected).toBe(true);
    expect(manager.isConnected()).toBe(true);
  });

  test('should reject invalid config', async () => {
    const manager = new MqttConnectionManager();

    await expect(
      manager.connect({ brokerUrl: '', topic: '' } as any)
    ).rejects.toThrow();
  });

  test('should publish message when connected', async () => {
    const manager = new MqttConnectionManager();

    const promise = manager.connect({
      brokerUrl: 'mqtt://localhost',
      topic: 'test/topic',
    });

    client.emit('connect');
    await promise;

    await manager.publish({ hello: 'world' });

    expect(client.publish).toHaveBeenCalled();
  });

  test('should throw if publish without connection', async () => {
    const manager = new MqttConnectionManager();

    await expect(
      manager.publish('data')
    ).rejects.toThrow('MQTT client is not connected');
  });

  test('disconnect should update status', async () => {
    const manager = new MqttConnectionManager();

    const promise = manager.connect({
      brokerUrl: 'mqtt://localhost',
      topic: 'test/topic',
    });

    client.emit('connect');
    await promise;

    await manager.disconnect();

    expect(manager.isConnected()).toBe(false);
  });

  test('should notify message listeners', async () => {
    const manager = new MqttConnectionManager();

    const messageCallback = jest.fn();
    manager.onMessage(messageCallback);

    const promise = manager.connect({
      brokerUrl: 'mqtt://localhost',
      topic: 'test/topic',
    });

    client.emit('connect');
    await promise;

    client.emit('message', 'test/topic', Buffer.from('hello'));

    expect(messageCallback).toHaveBeenCalledWith(
      'test/topic',
      Buffer.from('hello')
    );
  });
});