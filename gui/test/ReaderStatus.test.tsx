/**
 * ReaderStatus Component Tests
 * Tests basic rendering of placeholder component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest, describe, it, beforeEach } from '@jest/globals';

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

import ReaderStatus from '../src/components/Dashboard/ReaderStatus';

describe('ReaderStatus Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ReaderStatus />);
    expect(screen.getByText('Reader Status')).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<ReaderStatus />);
    expect(screen.getByText('Reader Status')).toBeInTheDocument();
  });

  it('has correct container structure', () => {
    render(<ReaderStatus />);

    const container = screen.getByText('Reader Status').parentElement;
    expect(container).toBeInTheDocument();
    expect(container!.tagName).toBe('DIV');
  });
});
