/**
 * JSONViewer Component Tests
 * Tests JSON display formatting and empty state
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest, describe, it, beforeEach } from '@jest/globals';

// Mock PayloadFormatter
jest.mock('../src/utils/PayloadFormatter', () => ({
  JSONFormatter: {
    getDisplayJson: jest.fn((data: any) => JSON.stringify(data, null, 2)),
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

import JSONViewer from '../src/components/Dashboard/raw/JSONViewer';
import { JSONFormatter } from '../src/utils/PayloadFormatter';

describe('JSONViewer Component', () => {
  const mockLogs = [
    {
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: { EPC: 'ABC123', RSSI: -45 },
    },
    {
      id: 2,
      timestamp: '10:30:46',
      direction: 'TX' as const,
      data: { EPC: 'DEF456', RSSI: -50 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<JSONViewer logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
  });

  it('displays empty state message when no logs', () => {
    render(<JSONViewer logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
    expect(screen.getByText('Waiting for data stream...')).toHaveClass('text-gray-400', 'italic', 'text-center', 'mt-10');
  });

  it('renders logs correctly', () => {
    render(<JSONViewer logs={mockLogs} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('[RX]')).toBeInTheDocument();
    expect(screen.getByText('10:30:45')).toBeInTheDocument();

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('[TX]')).toBeInTheDocument();
    expect(screen.getByText('10:30:46')).toBeInTheDocument();
  });

  it('calls JSONFormatter.getDisplayJson for each log', () => {
    render(<JSONViewer logs={mockLogs} />);

    expect(JSONFormatter.getDisplayJson).toHaveBeenCalledTimes(2);
    expect(JSONFormatter.getDisplayJson).toHaveBeenCalledWith(mockLogs[0].data);
    expect(JSONFormatter.getDisplayJson).toHaveBeenCalledWith(mockLogs[1].data);
  });

  it('displays formatted JSON in pre tags', () => {
    const mockGetDisplayJson = JSONFormatter.getDisplayJson as jest.Mock;
    mockGetDisplayJson.mockReturnValue('{\n  "formatted": "json"\n}');

    render(<JSONViewer logs={mockLogs.slice(0, 1)} />);

    const preElement = document.querySelector('pre') as HTMLElement;
    expect(preElement.tagName).toBe('PRE');
    expect(preElement).toHaveClass('text-xs', 'overflow-auto', 'bg-white', 'p-2', 'rounded', 'border', 'border-gray-300');
  });

  it('applies correct styling to log containers', () => {
    render(<JSONViewer logs={mockLogs.slice(0, 1)} />);

    const container = document.querySelector('.mb-4.p-2.bg-gray-100.rounded') as HTMLElement | null;
    expect(container).toBeTruthy();
  });

  it('displays direction indicators with correct colors', () => {
    render(<JSONViewer logs={mockLogs} />);

    const rxIndicator = screen.getByText('[RX]');
    const txIndicator = screen.getByText('[TX]');

    expect(rxIndicator).toHaveClass('text-green-600');
    expect(txIndicator).toHaveClass('text-blue-600');
  });

  it('displays log metadata correctly', () => {
    render(<JSONViewer logs={mockLogs.slice(0, 1)} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('[RX]')).toBeInTheDocument();
    expect(screen.getByText('10:30:45')).toBeInTheDocument();
  });

  it('handles empty data object', () => {
    const emptyDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: {},
    }];

    render(<JSONViewer logs={emptyDataLog} />);

    expect(JSONFormatter.getDisplayJson).toHaveBeenCalledWith({});
  });

  it('handles empty data fallback', () => {
    const emptyDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: {},
    }];

    render(<JSONViewer logs={emptyDataLog} />);

    expect(JSONFormatter.getDisplayJson).toHaveBeenCalledWith({});
  });

  it('renders multiple logs in correct order', () => {
    render(<JSONViewer logs={mockLogs} />);

    const logElements = screen.getAllByText(/\d+/, { selector: 'span.font-bold' });
    expect(logElements).toHaveLength(2);
    expect(logElements[0]).toHaveTextContent('1');
    expect(logElements[1]).toHaveTextContent('2');
  });

  it('uses custom formatter when provided', () => {
    const customFormatter = {
      getDisplayJson: jest.fn((data: any) => 'custom formatted'),
    };

    render(<JSONViewer logs={mockLogs.slice(0, 1)} formatter={customFormatter} />);

    expect(customFormatter.getDisplayJson).toHaveBeenCalledWith(mockLogs[0].data);
    expect(JSONFormatter.getDisplayJson).not.toHaveBeenCalled();
  });
});
