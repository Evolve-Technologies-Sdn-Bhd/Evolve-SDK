/**
 * ReadControl Component Tests
 * Tests start/stop scanning functionality and state management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest, describe, it, beforeEach, afterEach } from '@jest/globals';

// Mock sdkService
jest.mock('../src/services/sdkService', () => ({
  sdkService: {
    startScan: jest.fn(),
    stopScan: jest.fn(),
    onDisconnected: jest.fn(),
    onResetCounters: jest.fn(),
  },
}));

// Mock window.electronAPI
const mockElectronAPI = {
  onTagRead: jest.fn(),
  onRawData: jest.fn(),
  clearAllDataListeners: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

import ReadControl from '../src/components/Sidebar/ReadControl';
const mockSdkService = require('../src/services/sdkService').sdkService;

describe('ReadControl Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock successful operations
    mockSdkService.startScan.mockResolvedValue(undefined);
    mockSdkService.stopScan.mockResolvedValue(undefined);
    mockSdkService.onDisconnected.mockReturnValue(jest.fn()); // Returns cleanup function
    mockSdkService.onResetCounters.mockReturnValue(jest.fn()); // Returns cleanup function
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('renders without crashing', () => {
    render(<ReadControl />);
    expect(screen.getByText('Read Control')).toBeTruthy();
  });

  it('displays start and stop buttons', () => {
    render(<ReadControl />);
    expect(screen.getByText('▶ Start Read')).toBeTruthy();
    expect(screen.getByText('⏹ Stop Read')).toBeTruthy();
  });

  it('displays total time and initial timer value', () => {
    render(<ReadControl />);
    expect(screen.getByText('Total Time:')).toBeTruthy();
    expect(screen.getByText('00:00:00')).toBeTruthy();
  });

  it('shows stopped status initially', () => {
    render(<ReadControl />);
    expect(screen.getByText('Status:')).toBeTruthy();
    expect(screen.getByText('● Stopped')).toBeTruthy();
  });

  it('starts scanning when start button is clicked', async () => {
    render(<ReadControl />);

    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockSdkService.startScan).toHaveBeenCalled();
    });

    expect(screen.getByText('● Scanning')).toBeInTheDocument();
    expect(startButton).toBeDisabled();
  });

  it('stops scanning when stop button is clicked', async () => {
    render(<ReadControl />);

    // Start scanning first
    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockSdkService.startScan).toHaveBeenCalled();
    });

    // Now stop scanning
    const stopButton = screen.getByRole('button', { name: /stop read/i });
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(mockSdkService.stopScan).toHaveBeenCalled();
    });

    expect(screen.getByText('● Stopped')).toBeInTheDocument();
    expect(stopButton).toBeDisabled();
  });

  it('timer updates while scanning', async () => {
    render(<ReadControl />);

    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockSdkService.startScan).toHaveBeenCalled();
    });

    // Fast-forward 2 seconds
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:02')).toBeInTheDocument();
    });
  });

  it('timer resets when counters are reset', async () => {
    let resetCallback: () => void;
    mockSdkService.onResetCounters.mockImplementation((callback: () => void) => {
      resetCallback = callback;
    });

    render(<ReadControl />);

    // Start scanning and advance timer
    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);
    
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:05')).toBeInTheDocument();
    });

    // Trigger reset
    act(() => {
      resetCallback!();
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });
  });

  it('timer continues from current value when scanning starts after being stopped (without reset)', async () => {
    render(<ReadControl />);

    // Start scanning and advance timer
    const startButton = screen.getByRole('button', { name: /start read/i });
    const stopButton = screen.getByRole('button', { name: /stop read/i });

    fireEvent.click(startButton);
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:03')).toBeInTheDocument();
    });

    // Stop scanning
    fireEvent.click(stopButton);
    
    act(() => {
      jest.advanceTimersByTime(2000); // Should not advance timer while stopped
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:03')).toBeInTheDocument();
    });

    // Start scanning again - should resume from 3 seconds
    fireEvent.click(startButton);
    
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText('00:00:05')).toBeInTheDocument();
    });
  });

  it('handles start scan errors gracefully', async () => {
    // Simulate synchronous throw so try/catch in component handles it
    mockSdkService.startScan.mockImplementation(() => { throw new Error('Scan failed'); });

    render(<ReadControl />);

    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockSdkService.startScan).toHaveBeenCalled();
    });

    // Should remain in stopped state on sync error
    expect(screen.getByText('● Stopped')).toBeInTheDocument();
    expect(startButton).not.toBeDisabled();
  });

  it('handles stop scan errors gracefully', async () => {
    // Simulate synchronous throw so catch path is exercised and scanning remains true
    mockSdkService.stopScan.mockImplementation(() => { throw new Error('Stop failed'); });

    render(<ReadControl />);

    // Start scanning first
    const startButton = screen.getByText('▶ Start Read');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockSdkService.startScan).toHaveBeenCalled();
    });

    // Try to stop (will fail)
    const stopButton = screen.getByRole('button', { name: /stop read/i });
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(mockSdkService.stopScan).toHaveBeenCalled();
    });

    // Should still show scanning state on sync error (since stop failed before setScanning(false))
    expect(screen.getByText('● Scanning')).toBeInTheDocument();
  });

  it('auto-stops scanning when reader disconnects', async () => {
    let disconnectCallback: (data: any) => void;

    mockSdkService.onDisconnected.mockImplementation((callback: (data: any) => void) => {
      disconnectCallback = callback;
      return jest.fn(); // cleanup function
    });

    render(<ReadControl />);

    // Start scanning
    const startButton = screen.getByRole('button', { name: /start read/i });
    fireEvent.click(startButton);

    // Simulate disconnect
    act(() => {
      disconnectCallback!({ reason: 'connection lost' });
    });

    expect(mockSdkService.stopScan).toHaveBeenCalled();
    // Wait for state update to reflect in DOM
    await waitFor(() => {
      expect(screen.getByText('● Stopped')).toBeInTheDocument();
    });
  });

  it('registers disconnect listener on mount', () => {
    render(<ReadControl />);

    expect(mockSdkService.onDisconnected).toHaveBeenCalledWith(expect.any(Function));
  });

  it('button states reflect scanning status correctly', () => {
    render(<ReadControl />);

    const startButton = screen.getByRole('button', { name: /start read/i });
    const stopButton = screen.getByRole('button', { name: /stop read/i });

    // Initially
    expect(startButton).not.toBeDisabled();
    expect(stopButton).toBeDisabled();

    // Start scanning
    fireEvent.click(startButton);

    expect(startButton).toBeDisabled();
    expect(stopButton).not.toBeDisabled();

    // Stop scanning
    fireEvent.click(stopButton);

    expect(startButton).not.toBeDisabled();
    expect(stopButton).toBeDisabled();
  });

  it('maintains scanning state across re-renders', () => {
    const { rerender } = render(<ReadControl />);

    // Start scanning
    const startButton = screen.getByText('▶ Start Read');
    fireEvent.click(startButton);

    // Re-render
    rerender(<ReadControl />);

    // Should still show scanning
    expect(screen.getByText('● Scanning')).toBeInTheDocument();
  });
});
