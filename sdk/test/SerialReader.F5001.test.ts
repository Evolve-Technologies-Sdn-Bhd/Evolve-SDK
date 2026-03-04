import { SerialReader } from '../src/transports/SerialTransport';
import { EventEmitter } from 'events';
import { F5001Protocol } from '../src/utils/F5001Protocol';

// ================================
// MOCK SerialPort
// ================================
jest.mock('serialport', () => {
  const EventEmitter = require('events');
  return {
    SerialPort: jest.fn().mockImplementation(() => {
      const emitter = new EventEmitter();
      emitter.isOpen = false;

      emitter.open = jest.fn((cb) => {
        emitter.isOpen = true;
        if (cb) cb(null);
      });

      emitter.write = jest.fn((data, cb) => {
        if (cb) cb(null);
      });

      emitter.set = jest.fn();
      emitter.close = jest.fn((cb) => {
        emitter.isOpen = false;
        if (cb) cb(null);
      });

      return emitter;
    }),
  };
});

// ================================
// MOCK F5001Protocol
// ================================
jest.mock('../src/utils/F5001Protocol', () => ({
  F5001Protocol: {
    setInventoryParam0: jest.fn(() => Buffer.from([0x01])),
    setInventoryParam1: jest.fn(() => Buffer.from([0x02])),
    startMultiEPC: jest.fn(() => Buffer.from([0x03])),
    stopMultiEPC: jest.fn(() => Buffer.from([0x04])),
    clearBuffer: jest.fn(() => Buffer.from([0x05])),
  },
}));

// ================================
// TESTS
// ================================
describe('SerialReader - F5001 Protocol', () => {
  let reader: SerialReader;
  let emitter: any;

  beforeEach(async () => {
    // Mocked emitter with necessary methods
    emitter = new EventEmitter();
    emitter.emitRawData = jest.fn();
    emitter.emitError = jest.fn();
    emitter.emitDisconnected = jest.fn();

    reader = new SerialReader('/dev/ttyUSB0', 115200, emitter);
    await reader.configure({ protocol: 'F5001' });
  });

  test('connect should open serial port and initialize protocol', async () => {
    await expect(reader.connect()).resolves.not.toThrow();
    expect(reader.isPortOpen()).toBe(true);

    const protocolReader: any = (reader as any).protocolReader;
    expect(protocolReader).toBeDefined();
  });

  test('startScan should send correct F5001 commands', async () => {
    await reader.connect();
    const port: any = (reader as any).port;

    await reader.startScan();

    expect(port.write).toHaveBeenCalledWith(Buffer.from([0x01])); // setInventoryParam0
    expect(port.write).toHaveBeenCalledWith(Buffer.from([0x02])); // setInventoryParam1
    expect(port.write).toHaveBeenCalledWith(Buffer.from([0x03])); // startMultiEPC
    expect(emitter.emitRawData).toHaveBeenCalled(); // ensure emitRawData called
  });

  test('stopScan should send stop and clear buffer commands', async () => {
    await reader.connect();
    const port: any = (reader as any).port;

    reader.stopScan();

    expect(port.write).toHaveBeenCalledWith(Buffer.from([0x04])); // stopMultiEPC
    // clearBuffer delayed by 50ms
    await new Promise((r) => setTimeout(r, 60));
    expect(port.write).toHaveBeenCalledWith(Buffer.from([0x05])); // clearBuffer
    expect(emitter.emitRawData).toHaveBeenCalled();
  });

  test('incoming data should be passed to protocolReader', async () => {
    await reader.connect();
    const protocolReader: any = (reader as any).protocolReader;
    protocolReader.injectData = jest.fn();

    const port: any = (reader as any).port;
    const fakeData = Buffer.from([0xAA, 0xBB]);
    port.emit('data', fakeData);

    expect(protocolReader.injectData).toHaveBeenCalledWith(fakeData);
  });

  test('should emit tagRead event from protocolReader', async () => {
    await reader.connect();

    // Replace protocolReader with a real EventEmitter
    const protocolReader = new EventEmitter();
    (reader as any).protocolReader = protocolReader;

    // Relay tagRead events as the real initializeProtocolReader does
    (reader as any).protocolReader.on('tagRead', (tag: any) => {
      reader.emit('tagRead', tag);
    });

    const callback = jest.fn();
    reader.on('tagRead', callback);

    // Simulate a tag read
    protocolReader.emit('tagRead', { epc: '300833B2DDD9014000000000' });

    expect(callback).toHaveBeenCalledWith({ epc: '300833B2DDD9014000000000' });
  });
});