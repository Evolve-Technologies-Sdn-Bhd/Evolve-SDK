/**
 * FilterData Component Tests
 * Tests EPC filtering functionality and UI interactions
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';

// Mock FilterContext
const mockUseFilter = jest.fn();
jest.mock('../src/contexts/FilterContext', () => ({
  useFilter: () => mockUseFilter(),
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

import FilterData from '../src/components/Sidebar/FilterData';

describe('FilterData Component', () => {
  let mockSetEpcFilter: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSetEpcFilter = jest.fn();
    mockUseFilter.mockReturnValue({
      epcFilter: '',
      setEpcFilter: mockSetEpcFilter,
    });
  });

  it('renders without crashing', () => {
    render(<FilterData />);
    expect(screen.getByText('Filter Data')).toBeInTheDocument();
  });

  it('displays input field with placeholder', () => {
    render(<FilterData />);
    const input = screen.getByPlaceholderText('Search EPC...');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('calls setEpcFilter when input changes', () => {
    render(<FilterData />);

    const input = screen.getByPlaceholderText('Search EPC...');
    fireEvent.change(input, { target: { value: 'ABC123' } });

    expect(mockSetEpcFilter).toHaveBeenCalledWith('ABC123');
  });

  it('does not show clear button when filter is empty', () => {
    render(<FilterData />);
    expect(screen.queryByText('✕')).not.toBeInTheDocument();
  });

  it('shows clear button when filter has value', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: 'ABC123',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const clearButton = screen.getByTitle('Clear filter');
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toHaveTextContent('✕');
  });

  it('shows filtering message when filter is active', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: 'ABC123',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    expect(screen.getByText('Filtering:')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('clears filter when clear button is clicked', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: 'ABC123',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const clearButton = screen.getByTitle('Clear filter');
    fireEvent.click(clearButton);

    expect(mockSetEpcFilter).toHaveBeenCalledWith('');
  });

  it('displays current filter value in input', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: 'TEST_EPC',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const input = screen.getByPlaceholderText('Search EPC...');
    expect(input).toHaveValue('TEST_EPC');
  });

  it('handles empty string filter correctly', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: '',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const input = screen.getByPlaceholderText('Search EPC...');
    expect(input).toHaveValue('');

    // Should not show filtering message
    expect(screen.queryByText('Filtering:')).not.toBeInTheDocument();
    expect(screen.queryByText('✕')).not.toBeInTheDocument();
  });

  it('handles special characters in filter', () => {
    const specialFilter = 'EPC-123_456';
    mockUseFilter.mockReturnValue({
      epcFilter: specialFilter,
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const input = screen.getByPlaceholderText('Search EPC...');
    expect(input).toHaveValue(specialFilter);

    expect(screen.getByText(specialFilter)).toBeInTheDocument();
  });

  it('input field has correct styling classes', () => {
    render(<FilterData />);

    const input = screen.getByPlaceholderText('Search EPC...');
    expect(input).toHaveClass('flex-1', 'border', 'border-gray-300', 'rounded', 'px-2', 'py-1', 'text-xs', 'focus:outline-none', 'focus:border-blue-500');
  });

  it('clear button has correct styling', () => {
    mockUseFilter.mockReturnValue({
      epcFilter: 'test',
      setEpcFilter: mockSetEpcFilter,
    });

    render(<FilterData />);

    const clearButton = screen.getByTitle('Clear filter');
    expect(clearButton).toHaveClass('px-2', 'py-1', 'bg-red-500', 'hover:bg-red-600', 'text-white', 'rounded', 'text-xs', 'font-semibold', 'transition');
  });
});
