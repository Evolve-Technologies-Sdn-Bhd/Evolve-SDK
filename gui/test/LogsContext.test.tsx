import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { LogsProvider, useLogs, LogEntry } from '../src/contexts/LogsContext';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';

describe('LogsContext', () => {
  const wrapper = ({ children }: any) => (
    <LogsProvider>{children}</LogsProvider>
  );

  describe('addLog()', () => {
    it('should add a log entry with default INFO level', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Test message');
      });

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]?.message).toBe('Test message');
      expect(result.current.logs[0]?.type).toBe('INFO');
    });

    it('should add a log entry with specified level', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Error occurred', 'ERROR');
      });

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]?.message).toBe('Error occurred');
      expect(result.current.logs[0]?.type).toBe('ERROR');
    });

    it('should support different log levels (INFO, SUCCESS, WARNING, ERROR)', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Info message', 'INFO');
        result.current.addLog('Success message', 'SUCCESS');
        result.current.addLog('Warning message', 'WARNING');
        result.current.addLog('Error message', 'ERROR');
      });

      expect(result.current.logs).toHaveLength(4);
      expect(result.current.logs[0]?.type).toBe('INFO');
      expect(result.current.logs[1]?.type).toBe('SUCCESS');
      expect(result.current.logs[2]?.type).toBe('WARNING');
      expect(result.current.logs[3]?.type).toBe('ERROR');
    });

    it('should generate IDs for each log entry', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Message 1');
        result.current.addLog('Message 2');
        result.current.addLog('Message 3');
      });

      expect(result.current.logs).toHaveLength(3);

      // Verify all IDs are numbers and valid timestamps
      result.current.logs.forEach((log) => {
        expect(typeof log.id).toBe('number');
        expect(log.id).toBeGreaterThan(0);
        // Verify it's a reasonable timestamp (within last minute)
        expect(Date.now() - log.id).toBeLessThan(60000);
      });
    });

    it('should generate timestamps for each log entry', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Test message');
      });

      expect(result.current.logs[0]?.timestamp).toBeDefined();
      expect(typeof result.current.logs[0]?.timestamp).toBe('string');
      expect(result.current.logs[0]?.timestamp.length).toBeGreaterThan(0);
    });

    it('should add multiple logs in FIFO order', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('First');
        result.current.addLog('Second');
        result.current.addLog('Third');
      });

      expect(result.current.logs).toHaveLength(3);
      expect(result.current.logs[0]?.message).toBe('First');
      expect(result.current.logs[1]?.message).toBe('Second');
      expect(result.current.logs[2]?.message).toBe('Third');
    });
  });

  describe('Max log size (1000 entries)', () => {
    it('should maintain FIFO order when exceeding max size', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        // Add 1001 logs
        for (let i = 0; i < 1001; i++) {
          result.current.addLog(`Message ${i}`);
        }
      });

      // Should keep only last 1000
      expect(result.current.logs).toHaveLength(1000);
      // First message (0) should be removed, second message (1) should be first
      expect(result.current.logs[0]?.message).toBe('Message 1');
      // Last message should be 1000
      expect(result.current.logs[999]?.message).toBe('Message 1000');
    });

    it('should remove oldest log when reaching max capacity', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        // Add exactly 1000 logs
        for (let i = 0; i < 1000; i++) {
          result.current.addLog(`Log ${i}`);
        }
      });

      expect(result.current.logs).toHaveLength(1000);
      const firstMessage = result.current.logs[0]?.message;

      act(() => {
        // Add one more log
        result.current.addLog('Log 1000');
      });

      // Still 1000 logs
      expect(result.current.logs).toHaveLength(1000);
      // Original first log message ('Log 0') should be removed
      expect(result.current.logs[0]?.message).not.toBe(firstMessage);
      expect(result.current.logs[0]?.message).toBe('Log 1');
      expect(result.current.logs[999]?.message).toBe('Log 1000');
    });
  });

  describe('clearLogs()', () => {
    it('should clear all logs', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Log 1');
        result.current.addLog('Log 2');
        result.current.addLog('Log 3');
      });

      expect(result.current.logs).toHaveLength(3);

      act(() => {
        result.current.clearLogs();
      });

      expect(result.current.logs).toHaveLength(0);
    });

    it('should allow adding logs after clearing', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Log 1');
        result.current.clearLogs();
        result.current.addLog('Log 2');
      });

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]?.message).toBe('Log 2');
    });

    it('should clear empty logs without error', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      expect(() => {
        act(() => {
          result.current.clearLogs();
        });
      }).not.toThrow();

      expect(result.current.logs).toHaveLength(0);
    });
  });

  describe('useLogs hook error handling', () => {
    it('should throw error when used outside LogsProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useLogs());
      }).toThrow('useLogs must be used within a LogsProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Context state management', () => {
    it('should support multiple calls to useLogs within same provider', () => {
      const { result, rerender } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Log 1');
      });

      expect(result.current.logs).toHaveLength(1);

      // Simulate component rerender
      rerender();

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]?.message).toBe('Log 1');

      act(() => {
        result.current.addLog('Log 2');
      });

      expect(result.current.logs).toHaveLength(2);
    });

    it('should update context when logs change', () => {
      const { result, rerender } = renderHook(() => useLogs(), { wrapper });

      expect(result.current.logs).toHaveLength(0);

      act(() => {
        result.current.addLog('New log');
      });

      expect(result.current.logs).toHaveLength(1);
    });
  });

  describe('Log entry structure', () => {
    it('should have all required properties on log entry', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Test message', 'WARNING');
      });

      const log = result.current.logs[0];

      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('type');
      expect(log).toHaveProperty('message');
    });

    it('should have correct property types', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Test message', 'SUCCESS');
      });

      const log = result.current.logs[0];

      expect(typeof log?.id).toBe('number');
      expect(typeof log?.timestamp).toBe('string');
      expect(typeof log?.type).toBe('string');
      expect(typeof log?.message).toBe('string');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle rapid consecutive log additions', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.addLog(`Rapid log ${i}`, 'INFO');
        }
      });

      expect(result.current.logs).toHaveLength(100);
      expect(result.current.logs[0]?.message).toBe('Rapid log 0');
      expect(result.current.logs[99]?.message).toBe('Rapid log 99');
    });

    it('should handle mixed operations correctly', () => {
      const { result } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('Log 1', 'INFO');
        result.current.addLog('Log 2', 'ERROR');
        result.current.clearLogs();
        result.current.addLog('Log 3', 'SUCCESS');
      });

      expect(result.current.logs).toHaveLength(1);
      expect(result.current.logs[0]?.message).toBe('Log 3');
      expect(result.current.logs[0]?.type).toBe('SUCCESS');
    });

    it('should preserve log order through multiple render cycles', () => {
      const { result, rerender } = renderHook(() => useLogs(), { wrapper });

      act(() => {
        result.current.addLog('First');
        result.current.addLog('Second');
      });

      rerender();

      expect(result.current.logs).toHaveLength(2);
      expect(result.current.logs[0]?.message).toBe('First');
      expect(result.current.logs[1]?.message).toBe('Second');

      act(() => {
        result.current.addLog('Third');
      });

      expect(result.current.logs).toHaveLength(3);
      expect(result.current.logs[2]?.message).toBe('Third');
    });
  });
});
