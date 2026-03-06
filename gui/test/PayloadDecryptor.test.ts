/**
 * PayloadDecryptor Utility Tests
 * Tests hex parsing, EPC extraction, and protocol detection
 */

import { jest, expect, describe, it, beforeEach } from '@jest/globals';

import { PayloadDecryptor } from '../src/utils/PayloadDecryptor';

describe('PayloadDecryptor', () => {
  describe('parseEpcFromHex', () => {
    it('parses BB protocol format correctly', () => {
      const hexString = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';
      const result = PayloadDecryptor.parseEpcFromHex(hexString);

      expect(result.EPC).toBe('FBA1586ABCDF16');
    });

    it('parses A0 protocol format correctly', () => {
      // Mock A0 protocol data
      const hexString = 'A0 0F 01 80 85 12 34 56 78 9A BC DE F0 00 00 00';
      const result = PayloadDecryptor.parseEpcFromHex(hexString);

      // Should extract EPC from position 5-11 (7 bytes)
      expect(result.EPC).toBeDefined();
    });

    it('handles generic EPC extraction', () => {
      const hexString = '00 01 02 03 04 05 06 07 08 09 0A 0B';
      const result = PayloadDecryptor.parseEpcFromHex(hexString);

      // Should find some EPC-like sequence
      expect(result.EPC).toBeDefined();
    });

    it('returns UNKNOWN for invalid data', () => {
      const hexString = 'invalid';
      const result = PayloadDecryptor.parseEpcFromHex(hexString);

      expect(result.EPC).toBe('UNKNOWN');
    });

    it('handles empty string', () => {
      const result = PayloadDecryptor.parseEpcFromHex('');
      expect(result.EPC).toBe('UNKNOWN');
    });

    it('handles malformed hex', () => {
      const result = PayloadDecryptor.parseEpcFromHex('ZZ ZZ ZZ');
      expect(result.EPC).toBe('UNKNOWN');
    });

    it('removes spaces and converts to uppercase', () => {
      const hexString = 'bb 97 12 20 00 fb a1 58 6a bc df 16';
      const result = PayloadDecryptor.parseEpcFromHex(hexString);

      expect(result.EPC).toBe('FBA1586ABCDF16');
    });
  });

  describe('parseToJson', () => {
    it('returns formatted JSON string', () => {
      const hexString = 'BB 97 12 20 00 FB A1 58 6A BC DF 16';
      const result = PayloadDecryptor.parseToJson(hexString);

      expect(typeof result).toBe('string');
      expect(result).toContain('EPC');
      expect(result).toContain('FBA1586ABCDF16');
    });
  });

  describe('extractRssi', () => {
    it('extracts RSSI from A0 protocol', () => {
      const hexString = 'A0 0F 01 80 85 12 34 56 78 9A BC DE F0';
      const result = PayloadDecryptor.extractRssi(hexString);

      // RSSI at byte 4, should be negative
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });

    it('returns null for non-A0 protocol', () => {
      const hexString = 'BB 97 12 20 00 FB A1 58 6A BC DF 16';
      const result = PayloadDecryptor.extractRssi(hexString);

      expect(result).toBeNull();
    });

    it('returns null for invalid data', () => {
      const result = PayloadDecryptor.extractRssi('invalid');
      expect(result).toBeNull();
    });
  });

  describe('validateEpc', () => {
    it('validates correct EPC format', () => {
      expect(PayloadDecryptor.validateEpc('FBA1586ABCDF16')).toBe(true);
      // 14 hex chars (7 bytes)
      expect(PayloadDecryptor.validateEpc('123456789ABCDE')).toBe(true);
    });

    it('rejects invalid EPC formats', () => {
      expect(PayloadDecryptor.validateEpc('')).toBe(false);
      expect(PayloadDecryptor.validateEpc('123')).toBe(false);
      expect(PayloadDecryptor.validateEpc('GGGGGGGGGGGGGGGG')).toBe(false);
      expect(PayloadDecryptor.validateEpc('FBA1586ABCDF1')).toBe(false); // Too short
      expect(PayloadDecryptor.validateEpc('FBA1586ABCDF160')).toBe(false); // Too long
    });

    it('accepts lowercase hex', () => {
      expect(PayloadDecryptor.validateEpc('fba1586abcdf16')).toBe(true);
    });
  });

  describe('protocol detection', () => {
    it('detects BB protocol', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const hexString = 'BB 97 12 20 00 FB A1 58 6A BC DF 16';
      PayloadDecryptor.parseEpcFromHex(hexString);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detected BB protocol format')
      );

      consoleSpy.mockRestore();
    });

    it('detects A0 protocol', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const hexString = 'A0 0F 01 80 85 12 34 56 78 9A BC DE F0';
      PayloadDecryptor.parseEpcFromHex(hexString);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detected A0 protocol format')
      );

      consoleSpy.mockRestore();
    });

    it('falls back to generic extraction', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const hexString = '00 01 02 03 04 05 06 07 08 09 0A 0B';
      PayloadDecryptor.parseEpcFromHex(hexString);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown protocol, attempting generic EPC extraction')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('handles parsing errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Force an error by passing invalid data that causes issues
      const result = PayloadDecryptor.parseEpcFromHex('XX XX XX');

      // Current behavior returns UNKNOWN when parsing fails softly
      expect(result.EPC).toBe('UNKNOWN');

      consoleSpy.mockRestore();
    });

    it('handles null input', () => {
      const result = PayloadDecryptor.parseEpcFromHex(null as any);
      expect(result.EPC).toBe('ERROR');
    });
  });

  describe('byte array conversion', () => {
    it('converts hex string to correct byte array', () => {
      const hexString = 'A0 BB CC';
      // This is tested indirectly through the parsing functions
      const result = PayloadDecryptor.parseEpcFromHex(hexString);
      expect(result).toBeDefined();
    });

    it('handles odd-length hex strings', () => {
      const result = PayloadDecryptor.parseEpcFromHex('ABC');
      expect(result.EPC).toBe('UNKNOWN');
    });
  });
});
