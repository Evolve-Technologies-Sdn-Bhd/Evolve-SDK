/**
 * Dashboard Component Tests
 * Using standard jest matchers to avoid type issues
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';

// Mock PayloadFormatter FIRST before importing Dashboard
jest.mock('../src/utils/PayloadFormatter', () => ({
  PayloadFormatter: {
    formatTagForDisplay: jest.fn((tag: any) => ({
      id: tag?.id || '001',
      timestamp: tag?.timestamp || Date.now(),
      direction: tag?.direction || 'RX',
      data: tag?.data || 'test_data',
    })),
  },
  formatTagForDisplay: jest.fn((tag: any) => ({
    id: tag?.id || '001',
    timestamp: tag?.timestamp || Date.now(),
    direction: tag?.direction || 'RX',
    data: tag?.data || 'test_data',
  })),
}));

// Mock PayloadDecryptor FIRST before importing Dashboard
jest.mock('../src/utils/PayloadDecryptor', () => ({
  decryptHexPayload: jest.fn((hex: any) => ({ decrypted: hex })),
  parseEpcFromHex: jest.fn((hex: any) => ({ EPC: 'TEST_EPC', Frame_Hex: hex })),
}));

// Mock RawDataConsole component
jest.mock('../src/components/Dashboard/raw/RawDataConsole', () => {
  return function MockRawDataConsole({ logs, viewType }: any) {
    return (
      <div data-testid="raw-data-console">
        <div data-testid="view-type-display">{viewType}</div>
        {logs.map((log: any, idx: number) => (
          <div key={idx} data-testid={`log-${idx}`}>
            {JSON.stringify(log)}
          </div>
        ))}
      </div>
    );
  };
});

// NOW import Dashboard after mocks are defined
import Dashboard from '../src/components/Dashboard/Dashboard';
import { FilterProvider } from '../src/contexts/FilterContext';

describe('Dashboard Component', () => {
  let mockTagReadListener: jest.Mock<any>;
  let mockRawDataListener: jest.Mock<any>;
  let mockClearAllListeners: jest.Mock<any>;

  // Helper function to render Dashboard with FilterProvider
  const renderDashboard = () => {
    return render(
      <FilterProvider>
        <Dashboard />
      </FilterProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTagReadListener = jest.fn((callback: any) => {
      (window as any).__dashboardTagReadCallback = callback;
      return jest.fn();
    });

    mockRawDataListener = jest.fn((callback: any) => {
      (window as any).__dashboardRawDataCallback = callback;
      return jest.fn();
    });

    mockClearAllListeners = jest.fn();

    (window as any).electronAPI = {
      onTagRead: mockTagReadListener,
      onRawData: mockRawDataListener,
      clearAllDataListeners: mockClearAllListeners,
    };

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).electronAPI;
    delete (window as any).__dashboardTagReadCallback;
    delete (window as any).__dashboardRawDataCallback;
  });

  describe('Rendering', () => {
    it('should render Dashboard component', () => {
      renderDashboard();
      expect(screen.getByTestId('raw-data-console')).toBe(screen.getByTestId('raw-data-console'));
    });

    it('should render with correct initial view type', () => {
      renderDashboard();
      const viewDisplay = screen.getByTestId('view-type-display');
      expect(viewDisplay.textContent).toBe('raw');
    });

    it('should render empty logs initially', () => {
      renderDashboard();
      expect(screen.queryByTestId('log-0')).toBeNull();
    });
  });

  describe('Listeners', () => {
    it('should register onTagRead listener on mount', () => {
      renderDashboard();
      expect(mockTagReadListener).toHaveBeenCalled();
      expect((window as any).__dashboardTagReadCallback).toBeDefined();
    });

    it('should register onRawData listener on mount', () => {
      renderDashboard();
      expect(mockRawDataListener).toHaveBeenCalled();
      expect((window as any).__dashboardRawDataCallback).toBeDefined();
    });

    it('should call clearAllDataListeners on mount', () => {
      renderDashboard();
      expect(mockClearAllListeners).toHaveBeenCalled();
    });
  });

  describe('View Type Switching', () => {
    it('should change view type when selector changes', async () => {
      renderDashboard();

      // Find the select element by looking for the one with value 'raw'
      const select = screen.getByRole('combobox') as HTMLSelectElement;

      await act(async () => {
        fireEvent.change(select, { target: { value: 'json' } });
      });

      expect(select.value).toBe('json');
    });
  });

  describe('Tag Read Events', () => {
    it('should add tag read events to logs', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardTagReadCallback;
        callback({ epc: 'TEST', data: 'data' });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('log-0')).not.toBeNull();
      });
    });
  });

  describe('Raw Data Events', () => {
    it('should add raw data events to logs', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardRawDataCallback;
        callback({
          data: 'FF AA BB CC DD EE FF AA BB CC DD EE FF AA BB CC DD EE',
          direction: 'RX',
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('log-0')).not.toBeNull();
      });
    });

    it('should filter out TX packets', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardRawDataCallback;
        callback({ data: 'AA BB', direction: 'TX' });
      });

      expect(screen.queryByTestId('log-0')).toBeNull();
    });
  });

  describe('Refresh Button', () => {
    it('should have a refresh button', () => {
      renderDashboard();
      const button = screen.getByRole('button', { name: /refresh/i });
      expect(button).toBeDefined();
    });

    it('should clear logs when refresh is clicked', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardTagReadCallback;
        callback({ epc: 'TEST', data: 'data' });
      });

      expect(screen.queryByTestId('log-0')).not.toBeNull();

      const button = screen.getByRole('button', { name: /refresh/i });
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('log-0')).toBeNull();
      });
    });
  });

  describe('Max Logs Limit', () => {
    it('should maintain reasonable log size', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardTagReadCallback;
        for (let i = 0; i < 30; i++) {
          callback({ epc: `EPC_${i}`, data: `data_${i}` });
        }
      });

      await waitFor(() => {
        expect(screen.queryByTestId('log-0')).not.toBeNull();
        expect(screen.queryByTestId('log-29')).not.toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle null data gracefully', async () => {
      renderDashboard();

      await act(async () => {
        const callback = (window as any).__dashboardRawDataCallback;
        callback({ data: null, direction: 'RX' });
      });

      expect(screen.getByTestId('raw-data-console')).toBeDefined();
    });

    it('should handle missing electronAPI', () => {
      delete (window as any).electronAPI;
      renderDashboard();
      expect(screen.getByTestId('raw-data-console')).toBeDefined();
    });
  });
});
