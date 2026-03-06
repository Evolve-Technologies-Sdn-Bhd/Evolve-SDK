/**
 * TextViewer Component Tests
 * Tests text display formatting and empty state
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';

// Mock PayloadFormatter
jest.mock('../src/utils/PayloadFormatter', () => ({
  TextFormatter: {
    getDisplayText: jest.fn((data: any) => `TEXT: ${JSON.stringify(data)}`),
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

import TextViewer from '../src/components/Dashboard/raw/TextViewer';
import { TextFormatter } from '../src/utils/PayloadFormatter';

describe('TextViewer Component', () => {
  const mockLogs = [
    {
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: 'Hello World',
    },
    {
      id: 2,
      timestamp: '10:30:46',
      direction: 'TX' as const,
      data: { message: 'Test data' },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<TextViewer logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
  });

  it('displays empty state message when no logs', () => {
    render(<TextViewer logs={[]} />);
    expect(screen.getByText('Waiting for data stream...')).toBeInTheDocument();
    expect(screen.getByText('Waiting for data stream...')).toHaveClass('text-gray-400', 'italic', 'text-center', 'mt-10');
  });

  it('renders logs correctly', () => {
    render(<TextViewer logs={mockLogs} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('RX')).toBeInTheDocument();
    expect(screen.getByText('10:30:45')).toBeInTheDocument();

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('TX')).toBeInTheDocument();
    expect(screen.getByText('10:30:46')).toBeInTheDocument();
  });

  it('calls TextFormatter.getDisplayText for each log', () => {
    render(<TextViewer logs={mockLogs} />);

    expect(TextFormatter.getDisplayText).toHaveBeenCalledTimes(2);
    expect(TextFormatter.getDisplayText).toHaveBeenCalledWith(mockLogs[0].data);
    expect(TextFormatter.getDisplayText).toHaveBeenCalledWith(mockLogs[1].data);
  });

  it('displays formatted text with correct styling', () => {
    render(<TextViewer logs={mockLogs.slice(0, 1)} />);

    const textElement = screen.getByText('TEXT: "Hello World"');
    expect(textElement).toHaveClass('text-xs', 'text-gray-700', 'whitespace-pre-wrap');
  });

  it('applies correct container styling', () => {
    render(<TextViewer logs={mockLogs.slice(0, 1)} />);

    const container = document.querySelector('.mb-3.p-2.bg-gray-50.border-l-2.border-gray-300.rounded') as HTMLElement | null;
    expect(container).toBeTruthy();
  });

  it('displays direction indicators with correct colors', () => {
    render(<TextViewer logs={mockLogs} />);

    const rxIndicator = screen.getByText('RX');
    const txIndicator = screen.getByText('TX');

    expect(rxIndicator).toHaveClass('text-green-600');
    expect(txIndicator).toHaveClass('text-blue-600');
  });

  it('displays log metadata correctly', () => {
    render(<TextViewer logs={mockLogs.slice(0, 1)} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('RX')).toBeInTheDocument();
    expect(screen.getByText('10:30:45')).toBeInTheDocument();
  });

  it('handles empty data', () => {
    const emptyDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: '',
    }];

    render(<TextViewer logs={emptyDataLog} />);

    expect(TextFormatter.getDisplayText).toHaveBeenCalledWith('');
  });

  it('handles empty object data as fallback', () => {
    const emptyObjLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: {},
    }];

    render(<TextViewer logs={emptyObjLog} />);

    expect(TextFormatter.getDisplayText).toHaveBeenCalledWith({});
  });

  it('handles object data', () => {
    const objectDataLog = [{
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: { key: 'value' },
    }];

    render(<TextViewer logs={objectDataLog} />);

    expect(TextFormatter.getDisplayText).toHaveBeenCalledWith({ key: 'value' });
  });

  it('renders multiple logs in correct order', () => {
    render(<TextViewer logs={mockLogs} />);

    const idElements = screen.getAllByText(/#\d+/);
    expect(idElements).toHaveLength(2);
    expect(idElements[0]).toHaveTextContent('#1');
    expect(idElements[1]).toHaveTextContent('#2');
  });

  it('uses custom formatter when provided', () => {
    const customFormatter = {
      getDisplayText: jest.fn((data: any) => `CUSTOM: ${data}`),
    };

    render(<TextViewer logs={mockLogs.slice(0, 1)} formatter={customFormatter} />);

    expect(customFormatter.getDisplayText).toHaveBeenCalledWith(mockLogs[0].data);
    expect(TextFormatter.getDisplayText).not.toHaveBeenCalled();
  });

  it('displays metadata with correct styling', () => {
    render(<TextViewer logs={mockLogs.slice(0, 1)} />);

    const metadataContainer = screen.getByText('#1').parentElement;
    expect(metadataContainer).toHaveClass('flex', 'gap-2', 'mb-2', 'text-gray-600', 'text-xs', 'font-semibold');
  });
});
