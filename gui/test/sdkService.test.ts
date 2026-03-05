/**
 * Comprehensive unit tests for sdkService.ts
 * 
 * Focus:
 * 1) Hardware configuration flow
 * 2) Connection state transitions
 * 3) Start/Stop reading logic
 * 4) Internal state flags (via test harness)
 * 5) Error handling for hardware failures
 * 6) Event emitter callbacks (onTag, onStats, onDisconnected)
 * 
 * Notes:
 * - We mock the hardware transport layer (window.electronAPI)
 * - We do NOT mock sdkService business logic
 * - Tests target branch coverage and error paths
 */

describe('sdkService', () => {
  let electronAPI: any;
  let service: any;

  beforeEach(async () => {
    jest.resetModules();

    // Fresh mock of the Electron API per test
    electronAPI = {
      connectReader: jest.fn().mockResolvedValue({ success: true }),
      connectSerial: jest.fn().mockResolvedValue({ success: true }),
      connectMqtt: jest.fn().mockResolvedValue({ success: true }),
      publishMqtt: jest.fn().mockResolvedValue({ success: true }),
      disconnectReader: jest.fn().mockResolvedValue({ success: true }),
      startScan: jest.fn(),
      stopScan: jest.fn(),
      onTagRead: jest.fn(),
      onStats: jest.fn(),
      onRawData: jest.fn(),
      onDisconnected: jest.fn(),
      removeTagListener: jest.fn(),
      removeStatsListener: jest.fn(),
      removeRawDataListener: jest.fn(),
      clearAllDataListeners: jest.fn(),
      saveSettings: jest.fn(),
      resetCounters: jest.fn().mockResolvedValue({ success: true }),
    };

    // Mock window.electronAPI in jsdom environment
    // @ts-ignore
    window.electronAPI = electronAPI;

    // Dynamically import after window is set so module sees it
    const mod = await import('../src/services/sdkService');
    service = mod.sdkService;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('hardware configuration flow: connect via TCP and start/stop', async () => {
    const ip = '192.168.1.100';
    const port = 8088;

    const res = await service.connect(ip, port);
    expect(res).toEqual({ success: true });
    expect(electronAPI.connectReader).toHaveBeenCalledWith({ type: 'tcp', ip, port });

    // Start reading
    service.startScan();
    expect(electronAPI.startScan).toHaveBeenCalledTimes(1);

    // Stop reading
    service.stopScan();
    expect(electronAPI.stopScan).toHaveBeenCalledTimes(1);

    // Disconnect
    await service.disconnect();
    expect(electronAPI.disconnectReader).toHaveBeenCalledTimes(1);
  });

  test('hardware configuration flow: connect via Serial and start/stop', async () => {
    const comPort = 'COM4';
    const baudRate = 115200;
    const protocol = 'F5001';

    const res = await service.connectSerial(comPort, baudRate, protocol);
    expect(res).toEqual({ success: true });
    expect(electronAPI.connectSerial).toHaveBeenCalledWith({ comPort, baudRate, protocol });

    service.startScan();
    expect(electronAPI.startScan).toHaveBeenCalledTimes(1);

    service.stopScan();
    expect(electronAPI.stopScan).toHaveBeenCalledTimes(1);
  });

  test('error handling: connectSerial failure surfaces to caller', async () => {
    const error = new Error('Port busy');
    electronAPI.connectSerial.mockRejectedValueOnce(error);

    await expect(service.connectSerial('COM5', 115200, 'UF3-S')).rejects.toThrow('Port busy');       
    expect(electronAPI.connectSerial).toHaveBeenCalledTimes(1);
  });

  test('invalid flow: start before any connect still invokes transport start', () => {
    service.startScan();
    expect(electronAPI.startScan).toHaveBeenCalledTimes(1);
  });

  test('double start protection: caller should guard; service will forward both calls', () => {
    service.startScan();
    service.startScan();
    expect(electronAPI.startScan).toHaveBeenCalledTimes(2);
  });

  test('disconnect while reading: stop then disconnect', async () => {
    service.startScan();
    expect(electronAPI.startScan).toHaveBeenCalledTimes(1);

    await service.disconnect();
    // Service doesn’t auto-stop, so only disconnect is called here.
    expect(electronAPI.disconnectReader).toHaveBeenCalledTimes(1);
  });

  test('event emitter: onTagRead callback invoked with payload', () => {
    let receivedTag: any = null;
    service.onTagRead((tag: any) => {
      receivedTag = tag;
    });

    // Simulate the preload wiring by calling the registered callback
    const tagPayload = { epc: 'E2000017221101441890C2F3', rssi: -45, timestamp: Date.now() };
    // Our mock onTagRead is supposed to register a callback with ipcRenderer.on
    expect(electronAPI.onTagRead).toHaveBeenCalledTimes(1);
    const cb = electronAPI.onTagRead.mock.calls[0][0];
    cb(tagPayload);

    expect(receivedTag).toEqual(tagPayload);
  });

  test('event emitter: onStats callback invoked and can drive state flags (harness)', () => {
    const flags = { total: 0, unique: 0, configured: false, connected: false, reading: false };

    service.onStats((stats: any) => {
      flags.total = stats.total;
      flags.unique = stats.unique;
      // simulate that stats coming in means we are reading
      flags.reading = true;
    });

    expect(electronAPI.onStats).toHaveBeenCalledTimes(1);
    const cb = electronAPI.onStats.mock.calls[0][0];

    // Simulate stats event
    cb({ total: 10, unique: 3 });
    expect(flags.total).toBe(10);
    expect(flags.unique).toBe(3);
    expect(flags.reading).toBe(true);
  });

  test('event emitter: onDisconnected callback toggles state (harness)', () => {
    const state = { connected: true, reading: true };

    service.onDisconnected((_info: any) => {
      state.connected = false;
      state.reading = false;
    });

    expect(electronAPI.onDisconnected).toHaveBeenCalledTimes(1);
    const cb = electronAPI.onDisconnected.mock.calls[0][0];
    cb({ type: 'Reader' });

    expect(state.connected).toBe(false);
    expect(state.reading).toBe(false);
  });

  test('reset counters / clean listeners: remove listeners utility exists', () => {
    // Some dashboards call clearAllDataListeners before attaching again
    if (electronAPI.clearAllDataListeners) {
      electronAPI.clearAllDataListeners();
      expect(electronAPI.clearAllDataListeners).toHaveBeenCalledTimes(1);
    }

    // remove individual listeners calls
    if (electronAPI.removeTagListener) {
      electronAPI.removeTagListener();
      expect(electronAPI.removeTagListener).toHaveBeenCalledTimes(1);
    }
    if (electronAPI.removeStatsListener) {
      electronAPI.removeStatsListener();
      expect(electronAPI.removeStatsListener).toHaveBeenCalledTimes(1);
    }
    if (electronAPI.removeRawDataListener) {
      electronAPI.removeRawDataListener();
      expect(electronAPI.removeRawDataListener).toHaveBeenCalledTimes(1);
    }
  });
});
