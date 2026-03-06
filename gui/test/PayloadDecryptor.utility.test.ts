/**
 * PayloadDecryptor Utility Test
 * Tests the test utility functions
 */

import { jest, expect, describe, it, beforeEach } from '@jest/globals';

import { testPayloadDecryption } from '../src/utils/PayloadDecryptor.utility';

describe('PayloadDecryptor Utility', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('runs testPayloadDecryption function', () => {
    testPayloadDecryption();

    expect(consoleSpy).toHaveBeenCalledWith('========== PAYLOAD DECRYPTION TEST ==========\n');
    expect(consoleSpy).toHaveBeenCalledWith('Test Case 1: BB Protocol Format');
    expect(consoleSpy).toHaveBeenCalledWith('Expected EPC:', 'FBA1586ABCDF16');
    expect(consoleSpy).toHaveBeenCalledWith('Match:', '✓ PASS');
  });

  it('tests JSON output format', () => {
    testPayloadDecryption();

    expect(consoleSpy).toHaveBeenCalledWith('Test Case 2: JSON Output Format');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('JSON output:')
    );
  });

  it('tests EPC validation', () => {
    testPayloadDecryption();

    expect(consoleSpy).toHaveBeenCalledWith('Test Case 3: EPC Validation');
    expect(consoleSpy).toHaveBeenCalledWith('Is valid EPC format:', '✓ YES');
  });

  it('completes all test cases', () => {
    testPayloadDecryption();

    expect(consoleSpy).toHaveBeenCalledWith('========== TEST COMPLETE ==========\n');
  });

  it('handles the test data correctly', () => {
    // Import the actual decryptor to verify the test data
    const { PayloadDecryptor } = require('../src/utils/PayloadDecryptor');

    const testData = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';
    const expectedEpc = 'FBA1586ABCDF16';

    const result = PayloadDecryptor.parseEpcFromHex(testData);
    expect(result.EPC).toBe(expectedEpc);
  });
});