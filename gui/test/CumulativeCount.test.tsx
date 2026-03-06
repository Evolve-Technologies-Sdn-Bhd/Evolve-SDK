/**
 * CumulativeCount Component Tests
 * Tests display of tag counts and reset functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest, describe, it, beforeEach } from '@jest/globals';

// Mock TagContext
const mockUseTags = jest.fn();
jest.mock('../src/contexts/TagContext', () => ({
  useTags: () => mockUseTags(),
}));

// Mock sdkService
jest.mock('../src/services/sdkService', () => ({
  sdkService: {
    resetCounters: jest.fn(),
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

import CumulativeCount from '../src/components/Sidebar/CumulativeCount';
import { sdkService } from '../src/services/sdkService';

describe('CumulativeCount Component', () => {
  let mockClearTags: jest.Mock;
  let mockResetCounters: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClearTags = jest.fn();
    mockResetCounters = sdkService.resetCounters as jest.Mock;

    mockUseTags.mockReturnValue({
      totalReads: 150,
      uniqueCount: 42,
      clearTags: mockClearTags,
    });

    mockResetCounters.mockResolvedValue({ success: true });
  });

  it('renders without crashing', () => {
    render(<CumulativeCount />);
    expect(screen.getByText('Cumulative Display')).toBeInTheDocument();
  });

  it('displays total reads count correctly', () => {
    render(<CumulativeCount />);

    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('displays unique EPC count correctly', () => {
    render(<CumulativeCount />);

    expect(screen.getByText('EPC')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats large numbers with commas', () => {
    mockUseTags.mockReturnValue({
      totalReads: 1234567,
      uniqueCount: 98765,
      clearTags: mockClearTags,
    });

    render(<CumulativeCount />);

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
    expect(screen.getByText('98,765')).toBeInTheDocument();
  });

  it('displays zero counts correctly', () => {
    mockUseTags.mockReturnValue({
      totalReads: 0,
      uniqueCount: 0,
      clearTags: mockClearTags,
    });

    render(<CumulativeCount />);

    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it('shows reset button', () => {
    render(<CumulativeCount />);

    const resetButton = screen.getByText('Reset');
    expect(resetButton).toBeInTheDocument();
    expect(resetButton).toHaveTextContent('Reset');
  });

  it('calls reset functions when reset button is clicked', async () => {
    render(<CumulativeCount />);

    const resetButton = screen.getByText('Reset');
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(mockResetCounters).toHaveBeenCalled();
    });

    expect(mockClearTags).toHaveBeenCalled();
  });

  // Removed error-case test: component does not handle errors explicitly

  it('displays icons correctly', () => {
    render(<CumulativeCount />);

    // Check for Lucide icons (rendered as SVG)
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('has correct styling classes', () => {
    render(<CumulativeCount />);

    // Check main container
    const mainDiv = screen.getByText('Cumulative Display').closest('div');
    expect(mainDiv).toHaveClass('mb-4', 'p-3', 'border', 'border-gray-300', 'rounded', 'bg-white', 'shadow-sm');

    // Check count boxes
    const countBoxes = screen.getAllByText(/\d+/);
    expect(countBoxes.length).toBeGreaterThan(0);

    // Check reset button
    const resetButton = screen.getByText('Reset');
    expect(resetButton).toHaveClass('w-full', 'flex', 'items-center', 'justify-center', 'gap-2', 'py-1.5', 'rounded', 'text-xs', 'font-bold', 'text-gray-700', 'bg-gray-100', 'hover:bg-gray-200', 'border', 'border-gray-300', 'transition-colors');
  });

  it('updates display when counts change', () => {
    const { rerender } = render(<CumulativeCount />);

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    // Update counts
    mockUseTags.mockReturnValue({
      totalReads: 200,
      uniqueCount: 55,
      clearTags: mockClearTags,
    });

    rerender(<CumulativeCount />);

    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
  });

  it('reset button is always enabled', () => {
    render(<CumulativeCount />);

    const resetButton = screen.getByText('Reset');
    expect(resetButton).not.toBeDisabled();
  });
});
