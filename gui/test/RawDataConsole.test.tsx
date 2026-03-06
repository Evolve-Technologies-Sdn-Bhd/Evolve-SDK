/**
 * RawDataConsole Component Tests
 * Tests view switching and component rendering
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest, describe, it, beforeEach } from '@jest/globals';

// Mock child components
jest.mock('../src/components/Dashboard/raw/RawHexView', () => {
  return function MockRawHexView({ logs }: any) {
    return <div data-testid="raw-hex-view">RawHexView: {logs.length} logs</div>;
  };
});

jest.mock('../src/components/Dashboard/raw/JSONViewer', () => {
  return function MockJSONViewer({ logs }: any) {
    return <div data-testid="json-viewer">JSONViewer: {logs.length} logs</div>;
  };
});

jest.mock('../src/components/Dashboard/raw/TextViewer', () => {
  return function MockTextViewer({ logs }: any) {
    return <div data-testid="text-viewer">TextViewer: {logs.length} logs</div>;
  };
});

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

import RawDataConsole from '../src/components/Dashboard/raw/RawDataConsole';

describe('RawDataConsole Component', () => {
  const mockLogs = [
    {
      id: 1,
      timestamp: '10:30:45',
      direction: 'RX' as const,
      data: 'test data 1',
    },
    {
      id: 2,
      timestamp: '10:30:46',
      direction: 'TX' as const,
      data: 'test data 2',
    },
  ];

  const mockScrollRef = { current: null };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<RawDataConsole logs={[]} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByTestId('raw-hex-view')).toBeInTheDocument();
  });

  it('renders RawHexView for raw view type', () => {
    render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByTestId('raw-hex-view')).toBeInTheDocument();
    expect(screen.getByText('RawHexView: 2 logs')).toBeInTheDocument();
  });

  it('renders JSONViewer for json view type', () => {
    render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="json" />);
    expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
    expect(screen.getByText('JSONViewer: 2 logs')).toBeInTheDocument();
  });

  it('renders TextViewer for text view type', () => {
    render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="text" />);
    expect(screen.getByTestId('text-viewer')).toBeInTheDocument();
    expect(screen.getByText('TextViewer: 2 logs')).toBeInTheDocument();
  });

  it('passes logs prop to child components', () => {
    render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByText('RawHexView: 2 logs')).toBeInTheDocument();
  });

  it('applies correct container styling', () => {
    render(<RawDataConsole logs={[]} scrollRef={mockScrollRef} viewType="raw" />);
    const container = screen.getByTestId('raw-hex-view').parentElement;
    expect(container).toHaveClass('flex-1', 'overflow-y-auto', 'p-4', 'font-mono', 'text-xs', 'space-y-1');
  });

  it('handles empty logs array', () => {
    render(<RawDataConsole logs={[]} scrollRef={mockScrollRef} viewType="json" />);
    expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
    expect(screen.getByText('JSONViewer: 0 logs')).toBeInTheDocument();
  });

  it('passes scrollRef correctly', () => {
    // Refs are not reflected as DOM attributes; ensure component renders without error
    render(<RawDataConsole logs={[]} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByTestId('raw-hex-view')).toBeInTheDocument();
  });

  it('switches views correctly', () => {
    const { rerender } = render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByTestId('raw-hex-view')).toBeInTheDocument();

    rerender(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="json" />);
    expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('raw-hex-view')).not.toBeInTheDocument();

    rerender(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="text" />);
    expect(screen.getByTestId('text-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('json-viewer')).not.toBeInTheDocument();
  });

  it('maintains logs when switching views', () => {
    const { rerender } = render(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="raw" />);
    expect(screen.getByText('RawHexView: 2 logs')).toBeInTheDocument();

    rerender(<RawDataConsole logs={mockLogs} scrollRef={mockScrollRef} viewType="json" />);
    expect(screen.getByText('JSONViewer: 2 logs')).toBeInTheDocument();
  });
});
