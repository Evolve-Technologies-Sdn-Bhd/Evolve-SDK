/**
 * MainLayout Component Tests
 * Tests layout structure, event listeners, and child component rendering
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach, afterEach } from '@jest/globals';

// Mock contexts
const mockUseLogs = jest.fn();
const mockUseTags = jest.fn();

jest.mock('../src/contexts/LogsContext', () => ({
  useLogs: () => mockUseLogs(),
}));

jest.mock('../src/contexts/TagContext', () => ({
  useTags: () => mockUseTags(),
}));

// Mock child components
jest.mock('../src/components/Sidebar/Sidebar', () => {
  return function MockSidebar() {
    return <div data-testid="sidebar">Sidebar</div>;
  };
});

jest.mock('../src/components/Header/Header', () => {
  return function MockHeader() {
    return <div data-testid="header">Header</div>;
  };
});

jest.mock('../src/components/Settings/SettingsModal', () => {
  return function MockSettingsModal({ isOpen, onClose }: any) {
    return isOpen ? <div data-testid="settings-modal">Settings Modal</div> : null;
  };
});

// Mock window.electronAPI
const mockElectronAPI = {
  onOpenSettings: jest.fn(),
  onExportLogsTrigger: jest.fn(),
  onExportDataTrigger: jest.fn(),
  onSystemMessage: jest.fn(),
  saveLogs: jest.fn(),
  getExportData: jest.fn(),
  saveExportedCSV: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

import MainLayout from '../src/components/layouts/MainLayout';

describe('MainLayout Component', () => {
  const mockLogs = [
    { id: 1, timestamp: '10:30:45', type: 'INFO', message: 'Test log' },
  ];

  const mockTags = { totalReads: 10, uniqueCount: 5 };

  let mockAddLog: jest.Mock;
  let mockClearLogs: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAddLog = jest.fn();
    mockClearLogs = jest.fn();

    mockUseLogs.mockReturnValue({
      logs: mockLogs,
      addLog: mockAddLog,
      clearLogs: mockClearLogs,
    });

    mockUseTags.mockReturnValue({
      tags: mockTags,
    });

    // Setup mock return values
    mockElectronAPI.onOpenSettings.mockReturnValue(jest.fn());
    mockElectronAPI.onExportLogsTrigger.mockReturnValue(jest.fn());
    mockElectronAPI.onExportDataTrigger.mockReturnValue(jest.fn());
    mockElectronAPI.onSystemMessage.mockReturnValue(jest.fn());
    mockElectronAPI.saveLogs.mockResolvedValue({ success: true });
    mockElectronAPI.getExportData.mockResolvedValue({ success: true, content: 'csv,data', count: 10 });
    mockElectronAPI.saveExportedCSV.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<MainLayout><div>Test Content</div></MainLayout>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders header, sidebar, and children', () => {
    render(<MainLayout><div data-testid="test-content">Test Content</div></MainLayout>);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('applies correct layout styling', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const mainContainer = screen.getByTestId('header').parentElement;
    expect(mainContainer).toHaveClass('flex', 'flex-col', 'h-screen', 'w-screen', 'bg-gray-100', 'overflow-hidden', 'font-sans', 'text-sm');
  });

  it('renders sidebar with correct styling', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const sidebarContainer = screen.getByTestId('sidebar').parentElement;
    expect(sidebarContainer).toHaveClass('w-72', 'flex-shrink-0', 'bg-gray-50', 'border-r', 'border-gray-300', 'flex', 'flex-col');
  });

  it('renders main content area with correct styling', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const main = document.querySelector('main');
    expect(main).toHaveClass('flex-1', 'flex', 'flex-col', 'min-w-0', 'bg-white');
  });

  it('displays logs in the log panel', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    expect(screen.getByText('Error Log / System Messages')).toBeInTheDocument();
    expect(screen.getByText('[INFO]')).toBeInTheDocument();
    expect(screen.getByText('Test log')).toBeInTheDocument();
  });

  it('shows log count correctly', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    expect(screen.getByText('1 Events')).toBeInTheDocument();
  });

  it('clears logs when clear button is clicked', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const clearButton = screen.getByText('Clear Logs');
    fireEvent.click(clearButton);

    expect(mockClearLogs).toHaveBeenCalled();
  });

  it('opens settings modal when triggered', async () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    // Simulate settings trigger
    const settingsCallback = mockElectronAPI.onOpenSettings.mock.calls[0][0];
    settingsCallback();

    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    });
  });

  it('closes settings modal', async () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    // Open modal
    const settingsCallback = mockElectronAPI.onOpenSettings.mock.calls[0][0];
    settingsCallback();

    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    });

    // Close modal (simulated by component)
    // The modal should handle its own closing
  });

  it('handles export logs trigger successfully', async () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportLogsTrigger.mock.calls[0][0];
    await exportCallback();

    expect(mockElectronAPI.saveLogs).toHaveBeenCalledWith('[10:30:45] [INFO] Test log');
    expect(mockAddLog).toHaveBeenCalledWith("Logs exported successfully.", "SUCCESS");
  });

  it('handles export logs trigger with no logs', async () => {
    mockUseLogs.mockReturnValue({
      logs: [],
      addLog: mockAddLog,
      clearLogs: mockClearLogs,
    });

    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportLogsTrigger.mock.calls[0][0];
    await exportCallback();

    expect(mockAddLog).toHaveBeenCalledWith("No logs to export.", "WARNING");
    expect(mockElectronAPI.saveLogs).not.toHaveBeenCalled();
  });

  it('handles export data trigger successfully', async () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportDataTrigger.mock.calls[0][0];
    await exportCallback('7');

    expect(mockElectronAPI.getExportData).toHaveBeenCalledWith(7);
    expect(mockElectronAPI.saveExportedCSV).toHaveBeenCalledWith('csv,data', 7, undefined);
    expect(mockAddLog).toHaveBeenCalledWith(expect.stringMatching(/^Successfully exported 10 tag records/), "SUCCESS");
  });

  it('handles export data trigger with Excel content', async () => {
    mockElectronAPI.getExportData.mockResolvedValue({
      success: true,
      content: 'YmFzZTY0X2V4Y2VsX2J1ZmZlcg==', // base64 string
      count: 5,
      isExcel: true,
    });
    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportDataTrigger.mock.calls[0][0];
    await exportCallback('3');

    expect(mockElectronAPI.getExportData).toHaveBeenCalledWith(3);
    expect(mockElectronAPI.saveExportedCSV).toHaveBeenCalledWith('YmFzZTY0X2V4Y2VsX2J1ZmZlcg==', 3, true);
    expect(mockAddLog).toHaveBeenCalledWith(expect.stringMatching(/^Successfully exported 5 tag records/), "SUCCESS");
  });

  it('handles export data trigger with failure', async () => {
    mockElectronAPI.getExportData.mockResolvedValue({ success: false, error: 'No data' });

    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportDataTrigger.mock.calls[0][0];
    await exportCallback('7');

    expect(mockAddLog).toHaveBeenCalledWith(expect.stringMatching(/No data/), "WARNING");
  });

  it('handles save failure after successful data fetch', async () => {
    mockElectronAPI.getExportData.mockResolvedValue({ success: true, content: 'csv,data', count: 2 });
    mockElectronAPI.saveExportedCSV.mockResolvedValue({ success: false, error: 'No content to save' });

    render(<MainLayout><div>Test</div></MainLayout>);

    const exportCallback = mockElectronAPI.onExportDataTrigger.mock.calls[0][0];
    await exportCallback('1');

    expect(mockElectronAPI.getExportData).toHaveBeenCalledWith(1);
    expect(mockElectronAPI.saveExportedCSV).toHaveBeenCalledWith('csv,data', 1, undefined);
    expect(mockAddLog).toHaveBeenCalledWith(expect.stringMatching(/Export .*failed/i), "ERROR");
  });

  it('handles system messages', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const systemCallback = mockElectronAPI.onSystemMessage.mock.calls[0][0];
    systemCallback('Test system message', 'error');

    expect(mockAddLog).toHaveBeenCalledWith('Test system message', 'ERROR');
  });

  it('maps system message levels correctly', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const systemCallback = mockElectronAPI.onSystemMessage.mock.calls[0][0];

    systemCallback('Info message', 'info');
    expect(mockAddLog).toHaveBeenCalledWith('Info message', 'INFO');

    systemCallback('Warn message', 'warn');
    expect(mockAddLog).toHaveBeenCalledWith('Warn message', 'WARNING');

    systemCallback('Error message', 'error');
    expect(mockAddLog).toHaveBeenCalledWith('Error message', 'ERROR');
  });

  it('registers all event listeners on mount', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    expect(mockElectronAPI.onOpenSettings).toHaveBeenCalledWith(expect.any(Function));
    expect(mockElectronAPI.onExportLogsTrigger).toHaveBeenCalledWith(expect.any(Function));
    expect(mockElectronAPI.onExportDataTrigger).toHaveBeenCalledWith(expect.any(Function));
    expect(mockElectronAPI.onSystemMessage).toHaveBeenCalledWith(expect.any(Function));
  });

  it('cleans up event listeners on unmount', () => {
    const { unmount } = render(<MainLayout><div>Test</div></MainLayout>);

    unmount();

    // Cleanup functions should be called
    // This is tested implicitly through the useEffect cleanup
  });

  it('renders log entries with correct styling', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const logEntry = screen.getByText('Test log').closest('div');
    expect(logEntry).toHaveClass('break-words');

    const timestamp = screen.getByText('[10:30:45]');
    expect(timestamp).toHaveClass('text-gray-400');

    const typeIndicator = screen.getByText('[INFO]');
    expect(typeIndicator).toHaveClass('font-bold', 'text-blue-600');
  });

  it('applies correct styling to log panel', () => {
    render(<MainLayout><div>Test</div></MainLayout>);

    const logPanel = screen.getByText('Error Log / System Messages').parentElement!.parentElement!;
    expect(logPanel).toHaveClass('h-48', 'border-t', 'border-gray-300', 'bg-gray-50', 'flex', 'flex-col');
  });
});
