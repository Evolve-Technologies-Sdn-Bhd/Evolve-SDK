/**
 * PayloadDecryptor - Decode RFID Protocol Data
 * Handles binary protocol parsing and EPC extraction
 */

export interface ParsedRfidData {
  EPC: string;
  [key: string]: any;
}

export class PayloadDecryptor {
  /**
   * Parse hex string data and extract EPC
   * Data format: [header...] [EPC: 7 bytes] [data...]
   * 
   * Example:
   * Input:  "BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06"
   * Output: { EPC: "FBA1586ABCDF16" }
   */
  static parseEpcFromHex(hexString: string): ParsedRfidData {
    try {
      // Remove spaces and convert to uppercase
      const cleanHex = hexString.replace(/\s+/g, '').toUpperCase();
      
      // Convert hex string to bytes
      const bytes: number[] = [];
      for (let i = 0; i < cleanHex.length; i += 2) {
        const byte = parseInt(cleanHex.substr(i, 2), 16);
        bytes.push(byte);
      }

      console.log('[PayloadDecryptor] Parsing hex data, total bytes:', bytes.length);
      console.log('[PayloadDecryptor] Byte array:', bytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '));

      // Detect protocol format
      const firstByte = bytes[0];
      let epc = '';

      // Check if this is our custom protocol (starts with BB)
      if (firstByte === 0xBB) {
        console.log('[PayloadDecryptor] Detected BB protocol format');
        // Format: BB 97 12 20 00 [EPC: 7 bytes] ...
        // EPC is at bytes 5-11 (7 bytes)
        if (bytes.length >= 12) {
          const epcBytes = bytes.slice(5, 12);
          epc = epcBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
          console.log('[PayloadDecryptor] Extracted EPC bytes:', epcBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
          console.log('[PayloadDecryptor] EPC:', epc);
        }
      }
      // Check if this is A0 protocol (header 0xA0)
      else if (firstByte === 0xA0) {
        console.log('[PayloadDecryptor] Detected A0 protocol format');
        // A0Protocol format: A0 [LEN] [ADDR] [CMD] [DATA...] [CHECKSUM]
        const len = bytes[1];
        if (bytes.length >= len + 2) {
          const cmd = bytes[3];
          // Tag data typically starts at byte 4 or 5
          if (cmd === 0x80 || cmd === 0x89) {
            // Try extracting EPC from byte 5 onwards (skip RSSI at byte 4)
            let epcStart = 5;
            let epcLength = 7; // Standard EPC is 7 bytes (14 hex chars)
            
            if (bytes.length >= epcStart + epcLength) {
              const epcBytes = bytes.slice(epcStart, epcStart + epcLength);
              epc = epcBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
              console.log('[PayloadDecryptor] Extracted EPC from A0 frame:', epc);
            }
          }
        }
      }
      // Generic extraction: look for 7-byte EPC pattern
      else {
        console.log('[PayloadDecryptor] Unknown protocol, attempting generic EPC extraction');
        // Try to find 7-byte sequences that look like EPC data
        for (let i = 0; i < bytes.length - 6; i++) {
          const candidate = bytes.slice(i, i + 7);
          // Check if bytes look reasonable (not all zeros or all FF)
          const hasVariation = candidate.some(b => b !== 0 && b !== 0xFF);
          if (hasVariation) {
            epc = candidate.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
            console.log('[PayloadDecryptor] Found potential EPC at offset', i, ':', epc);
            break;
          }
        }
      }

      // Return parsed data in JSON format
      const result: ParsedRfidData = {
        EPC: epc || 'UNKNOWN'
      };

      console.log('[PayloadDecryptor] Final result:', result);
      return result;
    } catch (error) {
      console.error('[PayloadDecryptor] Error parsing hex data:', error);
      return { EPC: 'ERROR' };
    }
  }

  /**
   * Parse hex string to human-readable format
   */
  static parseToJson(hexString: string): string {
    const parsed = this.parseEpcFromHex(hexString);
    return JSON.stringify(parsed, null, 2);
  }

  /**
   * Extract RSSI (signal strength) if present
   */
  static extractRssi(hexString: string): number | null {
    try {
      const cleanHex = hexString.replace(/\s+/g, '').toUpperCase();
      const bytes: number[] = [];
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substr(i, 2), 16));
      }

      // For BB protocol, RSSI might be at different positions
      // For A0 protocol, RSSI is typically at byte 4
      if (bytes[0] === 0xA0 && bytes.length > 4) {
        const rssi = bytes[4];
        return rssi * -1; // Convert to negative dBm
      }

      return null;
    } catch (error) {
      console.error('[PayloadDecryptor] Error extracting RSSI:', error);
      return null;
    }
  }

  /**
   * Validate if EPC is in correct format
   */
  static validateEpc(epc: string): boolean {
    // EPC should be 14 hex characters (7 bytes)
    return /^[0-9A-Fa-f]{14}$/.test(epc);
  }
}
