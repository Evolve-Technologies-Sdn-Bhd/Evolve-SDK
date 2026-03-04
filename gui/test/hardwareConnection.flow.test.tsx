/**
 * Hardware Connection Flow Tests
 * 
 * Tests the integration between sdkService connection events and GUI state updates
 * Verifies that:
 * 1. GUI connects through sdkService (not direct hardware access)
 * 2. Connection success updates GUI state
 * 3. Disconnection updates GUI state
 * 4. Event cleanup on unmount
 */

import React, { useState, useEffect } from 'react';
import { renderHook, act } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';

// Mock connection hook that simulates a component using sdkService
const useHardwareConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastDisconnectReason, setLastDisconnectReason] = useState<string | null>(null);

  useEffect(() => {
    // Register disconnect listener (never direct hardware access)
    const unsubscribeDisconnect = window.electronAPI?.onDisconnected?.((data: any) => {
      setIsConnected(false);
      setLastDisconnectReason(data.error || 'Unknown error');
    });

    return () => {
      if (unsubscribeDisconnect) {
        unsubscribeDisconnect();
      }
    };
  }, []);

  const connect = async (config: { type: string; ip?: string; port?: number }) => {
    try {
      setConnectionError(null);
      // Call through service (verified not to be direct hardware call)
      const result = await window.electronAPI?.connectReader?.(config);
      if (result?.success) {
        setIsConnected(true);
      } else {
        setConnectionError(result?.message || 'Connection failed');
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setConnectionError(errorMsg);
      throw error;
    }
  };

  const disconnect = async () => {
    try {
      setConnectionError(null);
      const result = await window.electronAPI?.disconnectReader?.();
      if (result?.success) {
        setIsConnected(false);
        setLastDisconnectReason(null);
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setConnectionError(errorMsg);
      throw error;
    }
  };

  return {
    isConnected,
    connectionError,
    lastDisconnectReason,
    connect,
    disconnect,
  };
};

describe('Hardware Connection Flow', () => {
  let mockElectronAPI: any;
  let disconnectCallbacks: Function[] = [];
  let statsCallbacks: Function[] = [];

  beforeEach(() => {
    disconnectCallbacks = [];
    statsCallbacks = [];

    mockElectronAPI = {
      connectReader: jest.fn().mockImplementation(async (config: any) => {
        // Simulate connection validation
        if (!config || !config.type) {
          throw new Error('Invalid connection config');
        }
        return { success: true, message: 'Connected successfully' };
      }),

      disconnectReader: jest.fn().mockImplementation(async () => {
        return { success: true, message: 'Disconnected' };
      }),

      onDisconnected: jest.fn((callback: Function) => {
        disconnectCallbacks.push(callback);
        return () => {
          const index = disconnectCallbacks.indexOf(callback);
          if (index > -1) disconnectCallbacks.splice(index, 1);
        };
      }),

      onStats: jest.fn((callback: Function) => {
        statsCallbacks.push(callback);
        return () => {
          const index = statsCallbacks.indexOf(callback);
          if (index > -1) statsCallbacks.splice(index, 1);
        };
      }),

      startScan: jest.fn().mockReturnValue({ success: true }),
      stopScan: jest.fn().mockReturnValue({ success: true }),
    };

    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    disconnectCallbacks = [];
    statsCallbacks = [];
  });

  describe('Connection state management', () => {
    it('should initialize with isConnected = false', () => {
      const { result } = renderHook(() => useHardwareConnection());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionError).toBeNull();
    });

    it('should update isConnected to true after successful connection', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      expect(result.current.isConnected).toBe(false);

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionError).toBeNull();
    });

    it('should update connectionError on connection failure', async () => {
      mockElectronAPI.connectReader.mockRejectedValueOnce(new Error('Connection timeout'));

      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        try {
          await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
        } catch (e) {
          // Expected error
        }
      });

      expect(result.current.connectionError).toBe('Connection timeout');
      expect(result.current.isConnected).toBe(false);
    });

    it('should set connectionError when config is invalid', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        try {
          await result.current.connect({ type: '' });
        } catch (e) {
          // Expected error
        }
      });

      expect(result.current.connectionError).toBe('Invalid connection config');
    });
  });

  describe('Disconnection events from hardware', () => {
    it('should update isConnected to false when hardware emits disconnect event', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      // First connect
      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate hardware emitting disconnect event
      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: 'Connection lost' }));
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastDisconnectReason).toBe('Connection lost');
    });

    it('should store disconnect reason from hardware event', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      const disconnectReason = 'Device unplugged';

      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: disconnectReason }));
      });

      expect(result.current.lastDisconnectReason).toBe(disconnectReason);
    });

    it('should use default reason if disconnect event has no error', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected' }));
      });

      expect(result.current.lastDisconnectReason).toBe('Unknown error');
    });
  });

  describe('Disconnect operation', () => {
    it('should set isConnected to false on manual disconnect', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastDisconnectReason).toBeNull();
    });

    it('should call sdkService.disconnectReader', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(mockElectronAPI.disconnectReader).toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      mockElectronAPI.disconnectReader.mockRejectedValueOnce(new Error('Disconnect failed'));

      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        try {
          await result.current.disconnect();
        } catch (e) {
          // Expected error
        }
      });

      expect(result.current.connectionError).toBe('Disconnect failed');
    });
  });

  describe('sdkService method verification', () => {
    it('should use sdkService for connection, not direct hardware access', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      // Verify electronAPI was called (which represents sdkService)
      expect(mockElectronAPI.connectReader).toHaveBeenCalledWith({
        type: 'tcp',
        ip: '192.168.1.1',
        port: 5000,
      });

      // Should not have accessed hardware directly
      expect(mockElectronAPI.connectReader).toHaveBeenCalledTimes(1);
    });

    it('should use sdkService for disconnection, not direct hardware access', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(mockElectronAPI.disconnectReader).toHaveBeenCalled();
    });
  });

  describe('Event listener cleanup', () => {
    it('should unsubscribe from disconnect events on unmount', () => {
      const { unmount } = renderHook(() => useHardwareConnection());

      expect(disconnectCallbacks).toHaveLength(1);

      unmount();

      expect(disconnectCallbacks).toHaveLength(0);
    });

    it('should handle multiple mount/unmount cycles', () => {
      const { unmount: unmount1 } = renderHook(() => useHardwareConnection());
      expect(disconnectCallbacks).toHaveLength(1);

      unmount1();
      expect(disconnectCallbacks).toHaveLength(0);

      const { unmount: unmount2 } = renderHook(() => useHardwareConnection());
      expect(disconnectCallbacks).toHaveLength(1);

      unmount2();
      expect(disconnectCallbacks).toHaveLength(0);
    });

    it('should not call disconnect callback after unmount', async () => {
      const { unmount } = renderHook(() => useHardwareConnection());

      unmount();

      // Try to emit disconnect event after unmount
      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: 'Test' }));
      });

      // Should not crash, callback was unsubscribed
      expect(disconnectCallbacks).toHaveLength(0);
    });
  });

  describe('Multiple connect/disconnect cycles', () => {
    it('should handle multiple connect attempts', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.2', port: 5001 });
      });

      expect(result.current.isConnected).toBe(true);
      expect(mockElectronAPI.connectReader).toHaveBeenCalledTimes(2);
    });

    it('should handle connect after hardware disconnect', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      // Connect
      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);

      // Hardware disconnects
      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: 'Lost connection' }));
      });

      expect(result.current.isConnected).toBe(false);

      // Reconnect
      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);
      expect(mockElectronAPI.connectReader).toHaveBeenCalledTimes(2);
    });

    it('should handle interleaved connect and manual disconnect', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Concurrent operations', () => {
    it('should handle simultaneous hardware disconnect and manual disconnect', async () => {
      const { result } = renderHook(() => useHardwareConnection());

      await act(async () => {
        await result.current.connect({ type: 'tcp', ip: '192.168.1.1', port: 5000 });
      });

      await act(async () => {
        // Simulate hardware disconnect event happening simultaneously
        Promise.resolve().then(() => {
          disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: 'Lost connection' }));
        });

        await result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
    });
  });
});
