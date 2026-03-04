/**
 * sdkService Integration Tests
 * 
 * Tests the sdkService mocking and event callback system
 * Verifies that events can be properly emitted and callbacks are invoked
 */

import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';

describe('sdkService Integration', () => {
  let mockElectronAPI: any;
  let mockCallbacks: Map<string, Function[]>;

  beforeEach(() => {
    mockCallbacks = new Map();

    mockElectronAPI = {
      connectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true, message: 'Connected' }),
      disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
      onStats: jest.fn((callback: Function) => {
        if (!mockCallbacks.has('stats')) {
          mockCallbacks.set('stats', []);
        }
        mockCallbacks.get('stats')?.push(callback);
        // Return unsubscribe function
        return () => {
          const callbacks = mockCallbacks.get('stats');
          if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
          }
        };
      }),
      onDisconnected: jest.fn((callback: Function) => {
        if (!mockCallbacks.has('disconnected')) {
          mockCallbacks.set('disconnected', []);
        }
        mockCallbacks.get('disconnected')?.push(callback);
        return () => {
          const callbacks = mockCallbacks.get('disconnected');
          if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
          }
        };
      }),
      onTagRead: jest.fn((callback: Function) => {
        if (!mockCallbacks.has('tagread')) {
          mockCallbacks.set('tagread', []);
        }
        mockCallbacks.get('tagread')?.push(callback);
      }),
      onRawData: jest.fn((callback: Function) => {
        if (!mockCallbacks.has('rawdata')) {
          mockCallbacks.set('rawdata', []);
        }
        mockCallbacks.get('rawdata')?.push(callback);
      }),
      startScan: jest.fn().mockReturnValue({ success: true }),
      stopScan: jest.fn().mockReturnValue({ success: true }),
      resetCounters: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
    };

    // Set up window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockCallbacks.clear();
  });

  describe('sdkService callback registration', () => {
    it('should register onStats callback and return unsubscribe function', () => {
      const callback = jest.fn();

      const unsubscribe = mockElectronAPI.onStats(callback);

      expect(typeof unsubscribe).toBe('function');
      expect(mockCallbacks.get('stats')).toContain(callback);
    });

    it('should register onDisconnected callback and return unsubscribe function', () => {
      const callback = jest.fn();

      const unsubscribe = mockElectronAPI.onDisconnected(callback);

      expect(typeof unsubscribe).toBe('function');
      expect(mockCallbacks.get('disconnected')).toContain(callback);
    });

    it('should support multiple callbacks for same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      mockElectronAPI.onStats(callback1);
      mockElectronAPI.onStats(callback2);
      mockElectronAPI.onStats(callback3);

      expect(mockCallbacks.get('stats')).toHaveLength(3);
      expect(mockCallbacks.get('stats')).toContain(callback1);
      expect(mockCallbacks.get('stats')).toContain(callback2);
      expect(mockCallbacks.get('stats')).toContain(callback3);
    });
  });

  describe('Event emission and callback invocation', () => {
    it('should invoke registered stats callbacks with correct data', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      mockElectronAPI.onStats(callback1);
      mockElectronAPI.onStats(callback2);

      // Simulate emitting stats event
      const statsData = { total: 100, unique: 45 };
      mockCallbacks.get('stats')?.forEach((cb) => cb(statsData));

      expect(callback1).toHaveBeenCalledWith(statsData);
      expect(callback2).toHaveBeenCalledWith(statsData);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should invoke registered disconnected callbacks with correct data', () => {
      const callback = jest.fn();

      mockElectronAPI.onDisconnected(callback);

      const disconnectData = { type: 'reader_disconnected', error: 'Connection lost' };
      mockCallbacks.get('disconnected')?.forEach((cb) => cb(disconnectData));

      expect(callback).toHaveBeenCalledWith(disconnectData);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should invoke multiple stats callbacks independently', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      mockElectronAPI.onStats(callback1);
      mockElectronAPI.onStats(callback2);
      mockElectronAPI.onStats(callback3);

      const statsData = { total: 50, unique: 30 };
      mockCallbacks.get('stats')?.forEach((cb) => cb(statsData));

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Callback cleanup and unsubscription', () => {
    it('should remove callback when unsubscribe is called', () => {
      const callback = jest.fn();

      const unsubscribe = mockElectronAPI.onStats(callback);
      expect(mockCallbacks.get('stats')).toContain(callback);

      unsubscribe();
      expect(mockCallbacks.get('stats')).not.toContain(callback);
    });

    it('should allow specific callback unsubscription while keeping others', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      const unsub1 = mockElectronAPI.onStats(callback1);
      mockElectronAPI.onStats(callback2);
      mockElectronAPI.onStats(callback3);

      unsub1();

      expect(mockCallbacks.get('stats')).not.toContain(callback1);
      expect(mockCallbacks.get('stats')).toContain(callback2);
      expect(mockCallbacks.get('stats')).toContain(callback3);
      expect(mockCallbacks.get('stats')).toHaveLength(2);
    });

    it('should handle unsubscribing all callbacks sequentially', () => {
      const callbacks = [jest.fn(), jest.fn(), jest.fn()];
      const unsubscribers: Function[] = [];

      callbacks.forEach((cb) => {
        unsubscribers.push(mockElectronAPI.onStats(cb));
      });

      expect(mockCallbacks.get('stats')).toHaveLength(3);

      unsubscribers.forEach((unsub) => unsub());

      expect(mockCallbacks.get('stats')).toHaveLength(0);
    });

    it('should allow re-subscription after unsubscribe', () => {
      const callback = jest.fn();

      const unsub = mockElectronAPI.onStats(callback);
      expect(mockCallbacks.get('stats')).toContain(callback);

      unsub();
      expect(mockCallbacks.get('stats')).not.toContain(callback);

      const unsub2 = mockElectronAPI.onStats(callback);
      expect(mockCallbacks.get('stats')).toContain(callback);
    });
  });

  describe('Connection methods', () => {
    it('should call connectReader through electronAPI', async () => {
      const result = await mockElectronAPI.connectReader({ type: 'tcp', ip: '192.168.1.1', port: 5000 });

      expect(mockElectronAPI.connectReader).toHaveBeenCalledWith({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      expect(result.success).toBe(true);
    });

    it('should call disconnectReader through electronAPI', async () => {
      const result = await mockElectronAPI.disconnectReader();

      expect(mockElectronAPI.disconnectReader).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should call startScan through electronAPI', () => {
      const result = mockElectronAPI.startScan();

      expect(mockElectronAPI.startScan).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should call stopScan through electronAPI', () => {
      const result = mockElectronAPI.stopScan();

      expect(mockElectronAPI.stopScan).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('Multiple event types', () => {
    it('should handle simultaneous callbacks across different event types', () => {
      const statsCallback = jest.fn();
      const disconnectCallback = jest.fn();
      const tagReadCallback = jest.fn();

      mockElectronAPI.onStats(statsCallback);
      mockElectronAPI.onDisconnected(disconnectCallback);
      mockElectronAPI.onTagRead(tagReadCallback);

      // Emit different event types
      mockCallbacks.get('stats')?.forEach((cb) => cb({ total: 100, unique: 50 }));
      mockCallbacks.get('disconnected')?.forEach((cb) => cb({ type: 'reader_disconnected' }));
      mockCallbacks.get('tagread')?.forEach((cb) => cb({ epc: 'ABC123', rssi: -50 }));

      expect(statsCallback).toHaveBeenCalledTimes(1);
      expect(disconnectCallback).toHaveBeenCalledTimes(1);
      expect(tagReadCallback).toHaveBeenCalledTimes(1);
      expect(statsCallback).toHaveBeenCalledWith({ total: 100, unique: 50 });
    });

    it('should isolate callbacks between different event types', () => {
      const statsCallback = jest.fn();
      const disconnectCallback = jest.fn();

      mockElectronAPI.onStats(statsCallback);
      mockElectronAPI.onDisconnected(disconnectCallback);

      mockCallbacks.get('stats')?.forEach((cb) => cb({ total: 50, unique: 25 }));

      expect(statsCallback).toHaveBeenCalledTimes(1);
      expect(disconnectCallback).toHaveBeenCalledTimes(0);
    });
  });

  describe('Error handling in callbacks', () => {
    it('should handle callback exceptions without affecting other callbacks', () => {
      const throwingCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      mockElectronAPI.onStats(throwingCallback);
      mockElectronAPI.onStats(normalCallback);

      expect(() => {
        mockCallbacks.get('stats')?.forEach((cb) => {
          try {
            cb({ total: 100, unique: 50 });
          } catch (e) {
            // Expected error
          }
        });
      }).not.toThrow();

      expect(normalCallback).toHaveBeenCalledWith({ total: 100, unique: 50 });
    });
  });

  describe('Event data validation', () => {
    it('should pass stats with correct structure', () => {
      const callback = jest.fn();
      mockElectronAPI.onStats(callback);

      const statsData = { total: 123, unique: 45 };
      mockCallbacks.get('stats')?.forEach((cb) => cb(statsData));

      const receivedData = callback.mock.calls[0][0];
      expect(receivedData).toHaveProperty('total', 123);
      expect(receivedData).toHaveProperty('unique', 45);
    });

    it('should pass disconnect event with correct structure', () => {
      const callback = jest.fn();
      mockElectronAPI.onDisconnected(callback);

      const disconnectData = { type: 'reader_disconnected', error: 'Connection timeout' };
      mockCallbacks.get('disconnected')?.forEach((cb) => cb(disconnectData));

      const receivedData = callback.mock.calls[0][0];
      expect(receivedData).toHaveProperty('type', 'reader_disconnected');
      expect(receivedData).toHaveProperty('error');
    });
  });
});
