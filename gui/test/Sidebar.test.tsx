/**
 * Sidebar Component Tests
 * Tests component composition and layout
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest, describe, it, beforeEach } from '@jest/globals';

// Mock all child components
jest.mock('../src/components/Sidebar/FilterData', () => {
  return function MockFilterData() {
    return <div data-testid="filter-data">FilterData Component</div>;
  };
});

jest.mock('../src/components/Sidebar/HardwareConnection', () => {
  return function MockHardwareConnection() {
    return <div data-testid="hardware-connection">HardwareConnection Component</div>;
  };
});

jest.mock('../src/components/Sidebar/ReadControl', () => {
  return function MockReadControl() {
    return <div data-testid="read-control">ReadControl Component</div>;
  };
});

jest.mock('../src/components/Sidebar/CumulativeCount', () => {
  return function MockCumulativeCount() {
    return <div data-testid="cumulative-count">CumulativeCount Component</div>;
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

import Sidebar from '../src/components/Sidebar/Sidebar';

describe('Sidebar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('filter-data')).toBeInTheDocument();
  });

  it('renders all child components', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('filter-data')).toBeInTheDocument();
    expect(screen.getByTestId('hardware-connection')).toBeInTheDocument();
    expect(screen.getByTestId('read-control')).toBeInTheDocument();
    expect(screen.getByTestId('cumulative-count')).toBeInTheDocument();
  });

  it('renders components in correct order', () => {
    render(<Sidebar />);

    const sidebar = screen.getByTestId('filter-data').parentElement;
    const children = Array.from(sidebar!.children);

    expect(children[0]).toHaveAttribute('data-testid', 'filter-data');
    expect(children[1]).toHaveAttribute('data-testid', 'hardware-connection');
    expect(children[2]).toHaveAttribute('data-testid', 'read-control');
    expect(children[3]).toHaveAttribute('data-testid', 'cumulative-count');
  });

  it('has correct container styling', () => {
    render(<Sidebar />);

    const container = screen.getByTestId('filter-data').parentElement;
    expect(container).toHaveClass('p-2', 'flex', 'flex-col', 'h-full', 'overflow-y-auto');
  });

  it('includes copyright notice', () => {
    render(<Sidebar />);

    expect(screen.getByText('© 2026 EvolveTechnologyPlatform')).toBeInTheDocument();
  });

  it('copyright has correct styling', () => {
    render(<Sidebar />);

    const copyright = screen.getByText('© 2026 EvolveTechnologyPlatform');
    expect(copyright).toHaveClass('text-[10px]', 'text-center', 'text-gray-400', 'mt-4');
  });

  it('has spacer div for layout', () => {
    render(<Sidebar />);

    const sidebar = screen.getByTestId('filter-data').parentElement;
    const children = Array.from(sidebar!.children);

    // Should have 6 children: 4 components + spacer + copyright
    expect(children).toHaveLength(6);

    // The 5th child should be the spacer (flex-1)
    const spacer = children[4];
    expect(spacer).toHaveClass('flex-1');
  });
});
