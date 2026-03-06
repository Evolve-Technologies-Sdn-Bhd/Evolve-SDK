/**
 * PayloadFormatter Utility Tests
 * Tests payload parsing, formatting, and display functions
 */

import { jest, expect, describe, it, beforeEach } from '@jest/globals';

import {
  PayloadFormatter,
  HexFormatter,
  JSONFormatter,
  TextFormatter,
  FormattedTag,
  TagDataDisplay
} from '../src/utils/PayloadFormatter';

describe('PayloadFormatter', () => {
  describe('parsePayload', () => {
    it('parses standard payload with EPC', () => {
      const rawData = {
        EPC: 'ABC123',
        RSSI: -45,
        Antenna: 1,
        Device: 'Reader1'
      };

      const result = PayloadFormatter.parsePayload(rawData);

      expect(result.data.EPC).toBe('ABC123');
      expect(result.data.RSSI).toBe(-45);
      expect(result.data.Antenna).toBe(1);
      expect(result.data.Device).toBe('Reader1');
      expect(result.isJson).toBe(false);
    });

    it('handles missing data gracefully', () => {
      const result = PayloadFormatter.parsePayload(null);
      expect(result.data).toEqual({});
      expect(result.isJson).toBe(false);
    });

    it('extracts EPC from alternative field names', () => {
      const rawData = { epc: 'DEF456', id: 'GHI789' };
      const result = PayloadFormatter.parsePayload(rawData);
      expect(result.data.EPC).toBe('DEF456'); // epc takes precedence
    });

    it('handles RSSI extraction from different formats', () => {
      const rawData = { rssi: -50 };
      const result = PayloadFormatter.parsePayload(rawData);
      expect(result.data.RSSI).toBe(-50);
    });
  });

  describe('formatTagForDisplay', () => {
    it('formats raw data for display', () => {
      const rawData = {
        timestamp: Date.now(),
        EPC: 'TEST123',
        RSSI: -40
      };

      const result = PayloadFormatter.formatTagForDisplay(rawData);

      expect(result.id).toBeDefined();
      expect(result.direction).toBe('RX');
      expect(result.data.EPC).toBe('TEST123');
      expect(result.data.RSSI).toBe(-40);
    });

    it('uses current timestamp when not provided', () => {
      const result = PayloadFormatter.formatTagForDisplay({});
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('formatTag (legacy)', () => {
    it('formats tag data with all fields', () => {
      const rawData = {
        id: 'TAG001',
        epc: 'EPC123',
        rssi: -45,
        timestamp: new Date('2023-01-01T10:30:00Z').getTime(),
        direction: 'RX'
      };

      const result = PayloadFormatter.formatTag(rawData);

      expect(result.tagId).toBe('TAG001');
      expect(result.epc).toBe('EPC123');
      expect(result.rssi).toBe(-45);
      expect(result.rssiDb).toBe('-45 dBm');
      expect(typeof result.readableTime).toBe('string');
      expect(result.direction).toBe('RX');
    });

    it('handles missing fields gracefully', () => {
      const result = PayloadFormatter.formatTag({});

      expect(typeof result.tagId).toBe('string');
      expect(result.epc).toBe('N/A');
      expect(result.rssi).toBe(0);
      expect(result.rssiDb).toBe('0 dBm');
    });
  });

  describe('formatTime', () => {
    it('formats timestamp produces a time-like string', () => {
      const timestamp = new Date('2023-01-01T14:30:45Z').getTime();
      const result = PayloadFormatter.formatTime(timestamp);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}\s?(AM|PM)/i);
    });

    it('returns current time for invalid timestamp', () => {
      const result = PayloadFormatter.formatTime(undefined);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatRSSI', () => {
    it('formats excellent RSSI', () => {
      const result = PayloadFormatter.formatRSSI(-40);
      expect(result.db).toBe('-40 dBm');
      expect(result.strength).toBe('Excellent');
      expect(result.color).toBe('text-green-600');
    });

    it('formats poor RSSI', () => {
      const result = PayloadFormatter.formatRSSI(-85);
      expect(result.db).toBe('-85 dBm');
      expect(result.strength).toBe('Poor');
      expect(result.color).toBe('text-red-600');
    });
  });

  describe('formatEPC', () => {
    it('formats EPC with spaces', () => {
      const result = PayloadFormatter.formatEPC('ABC123DEF456');
      expect(result).toBe('AB C1 23 DE F4 56');
    });

    it('handles short EPC', () => {
      const result = PayloadFormatter.formatEPC('ABC');
      expect(result).toBe('AB C');
    });
  });

  describe('formatHexPacket', () => {
    it('formats hex string with spaces', () => {
      const result = PayloadFormatter.formatHexPacket('AABBCCDDEEFF');
      expect(result).toBe('AA BB CC DD EE FF');
    });
  });

  describe('formatPacketLine', () => {
    it('formats packet line correctly', () => {
      const result = PayloadFormatter.formatPacketLine(
        1,
        new Date('1970-01-01T10:30:45Z').toISOString(),
        'RX',
        'AABBCCDD'
      );
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
      expect(result).toContain('[RX]');
      expect(result).toContain('#1');
      expect(result).toContain('AA BB CC DD');
    });
  });
});

describe('HexFormatter', () => {
  describe('toHex', () => {
    it('converts string to hex', () => {
      const result = HexFormatter.toHex('ABC');
      expect(result).toBe('41 42 43');
    });

    it('converts object to hex', () => {
      const result = HexFormatter.toHex({ test: 'data' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('fromHex', () => {
    it('formats hex string with spaces', () => {
      const result = HexFormatter.fromHex('AABBCC');
      expect(result).toBe('AA BB CC');
    });
  });

  describe('getDisplayHex', () => {
    it('handles string input', () => {
      const result = HexFormatter.getDisplayHex('test');
      expect(result).toBeDefined();
    });

    it('handles object input', () => {
      const result = HexFormatter.getDisplayHex({ key: 'value' });
      expect(result).toBeDefined();
    });

    it('handles hex-like strings', () => {
      const result = HexFormatter.getDisplayHex('AABBCC');
      expect(result).toBe('AA BB CC');
    });
  });
});

describe('JSONFormatter', () => {
  describe('format', () => {
    it('formats object to JSON string', () => {
      const obj = { test: 'value', number: 42 };
      const result = JSONFormatter.format(obj);
      expect(result).toContain('"test": "value"');
      expect(result).toContain('"number": 42');
    });

    it('handles string input', () => {
      const result = JSONFormatter.format('{"test": "value"}');
      expect(result).toContain('"test": "value"');
    });

    it('handles invalid JSON string', () => {
      const result = JSONFormatter.format('invalid json');
      expect(result).toContain('"message": "invalid json"');
    });
  });

  describe('parse', () => {
    it('parses valid JSON string', () => {
      const result = JSONFormatter.parse('{"test": "value"}');
      expect(result).toEqual({ test: 'value' });
    });

    it('returns error for invalid JSON', () => {
      const result = JSONFormatter.parse('invalid');
      expect(result.error).toBeDefined();
    });
  });

  describe('getDisplayJson', () => {
    it('formats data for display', () => {
      const result = JSONFormatter.getDisplayJson({ test: 'value' });
      expect(typeof result).toBe('string');
      expect(result).toContain('test');
    });
  });
});

describe('TextFormatter', () => {
  describe('format', () => {
    it('formats object as text', () => {
      const obj = { key1: 'value1', key2: 42 };
      const result = TextFormatter.format(obj);
      expect(result).toContain('Object:');
      expect(result).toContain('key1: "value1"');
      expect(result).toContain('key2: 42');
    });

    it('formats array as text', () => {
      const arr = ['item1', 'item2'];
      const result = TextFormatter.format(arr);
      expect(result).toContain('Array (2 items):');
      expect(result).toContain('[0]: "item1"');
    });

    it('handles string input', () => {
      const result = TextFormatter.format('plain text');
      expect(result).toBe('plain text');
    });
  });

  describe('getDisplayText', () => {
    it('formats data for display', () => {
      const result = TextFormatter.getDisplayText({ test: 'value' });
      expect(typeof result).toBe('string');
    });
  });
});
