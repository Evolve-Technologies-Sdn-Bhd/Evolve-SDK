import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TagProvider, useTags } from '../src/contexts/TagContext';
import { jest, expect } from '@jest/globals';

jest.mock('../src/services/sdkService', () => ({
  sdkService: {
    onStats: jest.fn(() => jest.fn()), // returns unsubscribe fn
    resetCounters: jest.fn(),
  },
}));

describe('TagContext cumulative frequency', () => {
  const wrapper = ({ children }: any) => (
    <TagProvider>{children}</TagProvider>
  );

  it('should increment totalReads cumulatively', () => {
    const { result } = renderHook(() => useTags(), { wrapper });

    act(() => {
      result.current.addTag('EPC1', -50);
      result.current.addTag('EPC1', -48);
      result.current.addTag('EPC2', -40);
    });

    expect(result.current.totalReads).toBe(3);
  });

  it('should count unique tags correctly', () => {
    const { result } = renderHook(() => useTags(), { wrapper });

    act(() => {
      result.current.addTag('EPC1', -50);
      result.current.addTag('EPC1', -48);
      result.current.addTag('EPC2', -40);
    });

    expect(result.current.tags.size).toBe(2);
  });

  it('should increment individual tag count correctly', () => {
    const { result } = renderHook(() => useTags(), { wrapper });

    act(() => {
      result.current.addTag('EPC1', -50);
      result.current.addTag('EPC1', -48);
    });

    const tag = result.current.tags.get('EPC1');
    expect(tag?.count).toBe(2);
  });

  it('should clear all tags and counters', () => {
    const { result } = renderHook(() => useTags(), { wrapper });

    act(() => {
      result.current.addTag('EPC1', -50);
      result.current.addTag('EPC2', -40);
    });

    act(() => {
      result.current.clearTags();
    });

    expect(result.current.totalReads).toBe(0);
    expect(result.current.tags.size).toBe(0);
  });
});