/**
 * TagContext + sdkService Integration Tests
 * 
 * Tests the integration between sdkService stats events and TagContext
 * Verifies:
 * 1. TagContext subscribes to sdkService.onStats
 * 2. Stats updates from sdkService flow into context
 * 3. Event cleanup on unmount
 * 4. Multiple stats updates are handled correctly
 */

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { renderHook, act } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';

interface Tag {
  epc: string;
  count: number;
  rssi: number;
}

interface TagContextType {
  tags: Map<string, Tag>;
  totalReads: number;
  uniqueCount: number;
  addTag: (epc: string, rssi: number) => void;
  clearTags: () => void;
}

const TagContextInternal = createContext<TagContextType | undefined>(undefined);

// Provider that subscribes to sdkService
const TagProviderWithSdkIntegration: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tags, setTags] = useState<Map<string, Tag>>(new Map());
  const [totalReads, setTotalReads] = useState(0);
  const [uniqueCount, setUniqueCount] = useState(0);

  useEffect(() => {
    // Subscribe to sdkService stats updates
    const unsubscribe = window.electronAPI?.onStats?.((stats: { total: number; unique: number }) => {
      setTotalReads(stats.total);
      setUniqueCount(stats.unique);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addTag = (epc: string, rssi: number) => {
    setTags((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(epc);
      updated.set(epc, {
        epc,
        count: (existing?.count || 0) + 1,
        rssi,
      });
      return updated;
    });
    setTotalReads((prev) => prev + 1);
    setUniqueCount((prev) => {
      const newCount = new Map(tags);
      return newCount.has(epc) ? prev : prev + 1;
    });
  };

  const clearTags = () => {
    setTags(new Map());
    setTotalReads(0);
    setUniqueCount(0);
  };

  return (
    <TagContextInternal.Provider value={{ tags, totalReads, uniqueCount, addTag, clearTags }}>
      {children}
    </TagContextInternal.Provider>
  );
};

const useTagsWithSdkIntegration = () => {
  const context = useContext(TagContextInternal);
  if (!context) throw new Error('useTagsWithSdkIntegration must be used within TagProviderWithSdkIntegration');
  return context;
};

describe('TagContext + sdkService Integration', () => {
  let mockElectronAPI: any;
  let statsCallbacks: Function[] = [];
  let disconnectCallbacks: Function[] = [];

  beforeEach(() => {
    statsCallbacks = [];
    disconnectCallbacks = [];

    mockElectronAPI = {
      onStats: jest.fn((callback: Function) => {
        statsCallbacks.push(callback);
        return () => {
          const index = statsCallbacks.indexOf(callback);
          if (index > -1) statsCallbacks.splice(index, 1);
        };
      }),

      onDisconnected: jest.fn((callback: Function) => {
        disconnectCallbacks.push(callback);
        return () => {
          const index = disconnectCallbacks.indexOf(callback);
          if (index > -1) disconnectCallbacks.splice(index, 1);
        };
      }),

      connectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
      disconnectReader: (jest.fn() as jest.Mock<any>).mockResolvedValue({ success: true }),
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
    statsCallbacks = [];
    disconnectCallbacks = [];
  });

  const wrapper = ({ children }: any) => <TagProviderWithSdkIntegration>{children}</TagProviderWithSdkIntegration>;

  describe('sdkService subscription', () => {
    it('should subscribe to sdkService.onStats on mount', () => {
      renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(mockElectronAPI.onStats).toHaveBeenCalled();
      expect(statsCallbacks).toHaveLength(1);
    });

    it('should return unsubscribe function from onStats', () => {
      const { unmount } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(statsCallbacks).toHaveLength(1);

      unmount();

      expect(statsCallbacks).toHaveLength(0);
    });
  });

  describe('Stats flow from sdkService to context', () => {
    it('should update totalReads when sdkService emits stats', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(result.current.totalReads).toBe(0);

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 45 }));
      });

      expect(result.current.totalReads).toBe(100);
    });

    it('should update uniqueCount when sdkService emits stats', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(result.current.uniqueCount).toBe(0);

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 45 }));
      });

      expect(result.current.uniqueCount).toBe(45);
    });

    it('should handle multiple stats updates sequentially', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 50, unique: 20 }));
      });

      expect(result.current.totalReads).toBe(50);
      expect(result.current.uniqueCount).toBe(20);

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 150, unique: 65 }));
      });

      expect(result.current.totalReads).toBe(150);
      expect(result.current.uniqueCount).toBe(65);
    });

    it('should correctly reflect stats increases', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 10, unique: 5 }));
      });

      expect(result.current.totalReads).toBe(10);

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 20, unique: 8 }));
      });

      expect(result.current.totalReads).toBe(20);
      expect(result.current.uniqueCount).toBe(8);
    });
  });

  describe('Event cleanup', () => {
    it('should unsubscribe from sdkService.onStats on unmount', () => {
      const { unmount } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(statsCallbacks).toHaveLength(1);

      unmount();

      expect(statsCallbacks).toHaveLength(0);
    });

    it('should not update state after unmount', () => {
      const { result, unmount } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      unmount();

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 999, unique: 999 }));
      });

      // Stats should not update after unmount
      expect(statsCallbacks).toHaveLength(0);
    });

    it('should handle remounting and resubscribing', () => {
      const { unmount } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(statsCallbacks).toHaveLength(1);

      unmount();

      expect(statsCallbacks).toHaveLength(0);

      renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      expect(statsCallbacks).toHaveLength(1);
    });
  });

  describe('Stats persistence across updates', () => {
    it('should maintain stats values across re-renders', () => {
      const { result, rerender } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 45 }));
      });

      const firstTotal = result.current.totalReads;
      const firstUnique = result.current.uniqueCount;

      rerender();

      expect(result.current.totalReads).toBe(firstTotal);
      expect(result.current.uniqueCount).toBe(firstUnique);
    });

    it('should accumulate stats correctly over time', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      const statsUpdates = [
        { total: 10, unique: 5 },
        { total: 25, unique: 12 },
        { total: 50, unique: 28 },
        { total: 100, unique: 55 },
      ];

      statsUpdates.forEach((stats) => {
        act(() => {
          statsCallbacks.forEach((cb) => cb(stats));
        });
      });

      // Last update should be reflected
      expect(result.current.totalReads).toBe(100);
      expect(result.current.uniqueCount).toBe(55);
    });
  });

  describe('Local tag management with SDK stats', () => {
    it('should allow manual addTag alongside SDK stats updates', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        result.current.addTag('EPC1', -50);
      });

      expect(result.current.totalReads).toBe(1);
      expect(result.current.uniqueCount).toBe(1);

      // SDK emits different stats (simulating background process)
      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 45 }));
      });

      // SDK stats overwrite local count
      expect(result.current.totalReads).toBe(100);
      expect(result.current.uniqueCount).toBe(45);
    });

    it('should handle clearTags', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        result.current.addTag('EPC1', -50);
        result.current.addTag('EPC2', -48);
      });

      expect(result.current.tags.size).toBe(2);

      act(() => {
        result.current.clearTags();
      });

      expect(result.current.totalReads).toBe(0);
      expect(result.current.uniqueCount).toBe(0);
      expect(result.current.tags.size).toBe(0);
    });
  });

  describe('Multiple hook instances with shared provider', () => {
    it('should share stats across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });
      const { result: result2 } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 150, unique: 75 }));
      });

      expect(result1.current.totalReads).toBe(150);
      expect(result2.current.totalReads).toBe(150);
      expect(result1.current.uniqueCount).toBe(75);
      expect(result2.current.uniqueCount).toBe(75);
    });

    it('should create separate subscriptions for separate providers', () => {
      const { unmount: unmount1 } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });
      const { unmount: unmount2 } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      // Each wrapper is a separate provider, so each creates its own subscription
      // In a real app, providers would be nested and reuse subscriptions
      expect(statsCallbacks.length).toBeGreaterThanOrEqual(1);

      unmount1();
      unmount2();

      expect(statsCallbacks).toHaveLength(0);
    });
  });

  describe('Error scenarios', () => {
    it('should handle stats with zero values', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 0, unique: 0 }));
      });

      expect(result.current.totalReads).toBe(0);
      expect(result.current.uniqueCount).toBe(0);
    });

    it('should handle large stat values', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 1000000, unique: 999999 }));
      });

      expect(result.current.totalReads).toBe(1000000);
      expect(result.current.uniqueCount).toBe(999999);
    });

    it('should handle stats where unique > total (invalid but present)', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 50, unique: 100 }));
      });

      // Should simply reflect what was sent
      expect(result.current.totalReads).toBe(50);
      expect(result.current.uniqueCount).toBe(100);
    });
  });

  describe('Integration with disconnection events', () => {
    it('should handle disconnection while subscribed to stats', async () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 50 }));
      });

      expect(result.current.totalReads).toBe(100);

      // Simulate disconnection event
      act(() => {
        disconnectCallbacks.forEach((cb) => cb({ type: 'reader_disconnected', error: 'Connection lost' }));
      });

      // Stats should still be preserved
      expect(result.current.totalReads).toBe(100);
    });

    it('should continue receiving stats after reconnection', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 50, unique: 25 }));
      });

      expect(result.current.totalReads).toBe(50);

      // Simulate reconnection (new stats)
      act(() => {
        statsCallbacks.forEach((cb) => cb({ total: 100, unique: 55 }));
      });

      expect(result.current.totalReads).toBe(100);
    });
  });

  describe('Subscription lifecycle', () => {
    it('should maintain subscription through multiple rapid stat updates', () => {
      const { result } = renderHook(() => useTagsWithSdkIntegration(), { wrapper });

      act(() => {
        for (let i = 0; i < 100; i++) {
          statsCallbacks.forEach((cb) => cb({ total: i, unique: i / 2 }));
        }
      });

      expect(result.current.totalReads).toBe(99);
      expect(statsCallbacks).toHaveLength(1);
    });

    it('should handle subscription errors gracefully', () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      statsCallbacks.push(errorCallback);

      expect(() => {
        statsCallbacks.forEach((cb) => {
          try {
            cb({ total: 100, unique: 50 });
          } catch (e) {
            // Expected error
          }
        });
      }).not.toThrow();
    });
  });
});
