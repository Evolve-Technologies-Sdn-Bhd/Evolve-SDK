/**
 * RawHexView Component Tests
 * Tests hex display formatting and empty state
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';

// Mock PayloadFormatter
jest.mock('../src/utils/PayloadFormatter', () => ({
  HexFormatter: {
    getDisplayHex: jest.fn((data: any) => `HEX: ${data}`),
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

import RawHexView from '../src/components/Dashboard/raw/RawHexView';
import { HexFormatter } from '../src/utils/PayloadFormatter';

describe('RawHexView Component', () => {
  const mockLogs = [
    {
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: 'AABBCCDD',
    },
    {
      id: 2,
      timestamp: '10:30:46',
      direction: 'TX' as const,
      data: 'EEFF0011',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<RawHexView logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
  });

  it('displays empty state message when no logs', () => {
    render(<RawHexView logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
    expect(screen.getByText('Waiting for data stream...')).toHaveClass('text-gray-400', 'italic', 'text-center', 'mt-10');
  });

  it('renders logs correctly', () => {
    render(<RawHexView logs={mockLogs} />);

    expect(screen.getByText('10:30:45')).toBeInTheDocument();
    expect(screen.getByText('[RX]')).toBeInTheDocument();
    expect(screen.getByText('HEX: AABBCCDD')).toBeInTheDocument();

    expect(screen.getByText('10:30:46')).toBeInTheDocument();
    expect(screen.getByText('[TX]')).toBeInTheDocument();
    expect(screen.getByText('HEX: EEFF0011')).toBeInTheDocument();
  });

  it('calls HexFormatter.getDisplayHex for each log', () => {
    render(<RawHexView logs={mockLogs} />);

    expect(HexFormatter.getDisplayHex).toHaveBeenCalledTimes(2);
    expect(HexFormatter.getDisplayHex).toHaveBeenCalledWith(mockLogs[0].data);
    expect(HexFormatter.getDisplayHex).toHaveBeenCalledWith(mockLogs[1].data);
  });

  it('displays timestamps in correct column', () => {
    render(<RawHexView logs={mockLogs.slice(0, 1)} />);

    const timestampElement = screen.getByText('10:30:45');
    expect(timestampElement).toHaveClass('text-gray-500', 'w-20', 'shrink-0');
  });

  it('displays direction indicators with correct colors and positioning', () => {
    render(<RawHexView logs={mockLogs} />);

    const rxIndicator = screen.getByText('[RX]');
    const txIndicator = screen.getByText('[TX]');

    expect(rxIndicator).toHaveClass('w-8', 'font-bold', 'shrink-0', 'text-green-600');
    expect(txIndicator).toHaveClass('w-8', 'font-bold', 'shrink-0', 'text-blue-600');
  });

  it('displays hex data with correct styling', () => {
    render(<RawHexView logs={mockLogs.slice(0, 1)} />);

    const hexElement = screen.getByText('HEX: AABBCCDD');
    expect(hexElement.tagName).toBe('CODE');
    expect(hexElement).toHaveClass('text-gray-800', 'break-all');
  });

  it('applies correct container styling', () => {
    render(<RawHexView logs={mockLogs.slice(0, 1)} />);

    const logContainer = screen.getByText('10:30:45').closest('div');
    expect(logContainer).toHaveClass('flex', 'gap-4', 'border-b', 'border-gray-100', 'pb-1', 'hover:bg-gray-50');
  });

  it('handles empty data', () => {
    const emptyDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: '',
    }];

    render(<RawHexView logs={emptyDataLog} />);

    expect(HexFormatter.getDisplayHex).toHaveBeenCalledWith('');
  });

  it('handles null data', () => {
    const nullDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: null,
    }];

    render(<RawHexView logs={nullDataLog} />);

    expect(HexFormatter.getDisplayHex).toHaveBeenCalledWith(null);
  });

  it('renders multiple logs in correct order', () => {
    render(<RawHexView logs={mockLogs} />);

    const timestampElements = screen.getAllByText(/10:30:\d+/);
    expect(timestampElements).toHaveLength(2);
    expect(timestampElements[0]).toHaveTextContent('10:30:45');
    expect(timestampElements[1]).toHaveTextContent('10:30:46');
  });

  it('uses custom formatter when provided', () => {
    const customFormatter = {
      getDisplayHex: jest.fn((data: any) => `CUSTOM: ${data}`),
    };

    render(<RawHexView logs={mockLogs.slice(0, 1)} formatter={customFormatter} />);

    expect(customFormatter.getDisplayHex).toHaveBeenCalledWith(mockLogs[0].data);
    expect(HexFormatter.getDisplayHex).not.toHaveBeenCalled();
  });

  it('displays hover effect on log rows', () => {
    render(<RawHexView logs={mockLogs.slice(0, 1)} />);

    const logRow = screen.getByText('10:30:45').parentElement;
    expect(logRow).toHaveClass('hover:bg-gray-50');
  });
});
