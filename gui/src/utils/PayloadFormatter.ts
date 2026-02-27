/**
 * PayloadFormatter - GUI Renderer Layer
 * All formatting logic belongs here, not in SDK
 * SDK provides raw data, GUI formats for display
 */

import { PayloadDecryptor } from './PayloadDecryptor';

export interface FormattedTag {
  tagId: string;
  epc: string;
  rssi: number;
  rssiDb: string; // "-45 dBm"
  timestamp: string;
  readableTime: string; // "14:02:58"
  direction: 'RX' | 'TX';
}

export interface TagDataDisplay {
  id: number;
  timestamp: string;
  direction: 'RX' | 'TX';
  data: Record<string, any>;
}

export class PayloadFormatter {
  static parsePayload(rawData: any): { data: Record<string, any>; isJson: boolean } {
    // Check if raw data is available
    if (!rawData) {
      return { data: {}, isJson: false };
    }

    // ✅ CLEANED FORMAT: Extract individual EPC fields
    const displayData: Record<string, any> = {};

    // Extract clean EPC - single value (not list)
    if (rawData.epc) {
      displayData.EPC = rawData.epc;
      console.log(`[PayloadFormatter] ✓ EPC: ${rawData.epc}`);
    } else if (rawData.id) {
      displayData.EPC = rawData.id;
      console.log(`[PayloadFormatter] ✓ EPC (from id): ${rawData.id}`);
    }

    // TID - Terminal ID
    if (rawData.tid) {
      displayData.TID = rawData.tid;
      console.log(`[PayloadFormatter] ✓ TID: ${rawData.tid}`);
    }

    // RSSI - Signal strength as numeric value
    if (rawData.rssi !== null && rawData.rssi !== undefined) {
      displayData.RSSI = rawData.rssi;
      console.log(`[PayloadFormatter] ✓ RSSI: ${rawData.rssi}`);
    }

    // Antenna ID
    if (rawData.antId) {
      displayData.AntId = rawData.antId;
      console.log(`[PayloadFormatter] ✓ AntId: ${rawData.antId}`);
    }

    // Read Time - when the tag was read
    if (rawData.readTime) {
      displayData.ReadTime = rawData.readTime;
      console.log(`[PayloadFormatter] ✓ ReadTime: ${rawData.readTime}`);
    }

    console.log('[PayloadFormatter] Final cleaned output:', displayData);
    return { data: displayData, isJson: false };
  }

  /**
   * Format raw TagData into GUI display structure
   */
  static formatTagForDisplay(rawData: any): TagDataDisplay {
    console.log('[PayloadFormatter] formatTagForDisplay input:', rawData);
    const { data } = this.parsePayload(rawData);
    console.log('[PayloadFormatter] parsePayload result:', data);
    
    const result = {
      id: rawData.timestamp || Date.now(),
      timestamp: this.formatTime(rawData.timestamp),
      direction: 'RX' as const,
      data: data
    };
    
    console.log('[PayloadFormatter] formatTagForDisplay output:', result);
    return result;
  }

  /**
   * Format raw TagData into GUI-friendly structure (legacy format)
   */
  static formatTag(rawData: any): FormattedTag {
    const { data } = this.parsePayload(rawData);
    
    // Extract EPC - try multiple sources
    let epc = 'N/A';
    if (rawData.epc) {
      epc = String(rawData.epc);
    } else if (rawData.id) {
      epc = String(rawData.id);
    } else if (data.EPC) {
      epc = String(data.EPC);
    } else if (data.EPC_ID) {
      epc = String(data.EPC_ID);
    }
    
    const rssi = rawData.rssi || 0;
    const id = rawData.id || epc || 'Unknown';
    
    return {
      tagId: id,
      epc: epc.toUpperCase(),
      rssi: rssi,
      rssiDb: `${rssi} dBm`,
      timestamp: new Date(rawData.timestamp || Date.now()).toISOString(),
      readableTime: this.formatTime(rawData.timestamp),
      direction: 'RX'
    };
  }

  /**
   * Format timestamp to readable format
   */
  static formatTime(timestamp: number | Date | undefined): string {
    if (!timestamp) return new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  /**
   * Format RSSI value with signal strength indicator
   */
  static formatRSSI(rssi: number): { db: string; strength: string; color: string } {
    const db = `${rssi} dBm`;
    let strength = '';
    let color = '';

    if (rssi >= -50) {
      strength = 'Excellent';
      color = 'text-green-600';
    } else if (rssi >= -60) {
      strength = 'Very Good';
      color = 'text-green-500';
    } else if (rssi >= -70) {
      strength = 'Good';
      color = 'text-yellow-500';
    } else if (rssi >= -80) {
      strength = 'Fair';
      color = 'text-orange-500';
    } else {
      strength = 'Poor';
      color = 'text-red-600';
    }

    return { db, strength, color };
  }

  /**
   * Format EPC to standard format
   */
  static formatEPC(epc: string): string {
    // Convert to uppercase, add spaces every 2 chars for readability
    const cleaned = epc.replace(/\s/g, '').toUpperCase();
    return cleaned.match(/.{1,2}/g)?.join(' ') || cleaned;
  }

  /**
   * Format raw hex packet for display
   */
  static formatHexPacket(data: string): string {
    const hex = data.replace(/\s/g, '').toUpperCase();
    return hex.match(/.{1,2}/g)?.join(' ') || hex;
  }

  /**
   * Format packet with direction indicator
   */
  static formatPacketLine(
    id: number,
    timestamp: string,
    direction: 'RX' | 'TX',
    data: string
  ): string {
    const time = new Date(timestamp).toLocaleTimeString();
    const dir = direction === 'RX' ? '[RX]' : '[TX]';
    const hex = this.formatHexPacket(data);
    return `${time} ${dir} #${id} ${hex}`;
  }
}

export class HexFormatter {
  static toHex(data: any): string {
    if (typeof data === 'string') {
      // Convert string to hex
      return Array.from(data)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(' ')
        .toUpperCase();
    } else if (typeof data === 'object' && data !== null) {
      // Convert object to JSON string, then to hex
      const jsonStr = JSON.stringify(data);
      return Array.from(jsonStr)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(' ')
        .toUpperCase();
    }
    return '';
  }

  static fromHex(hex: string): string {
    const cleaned = hex.replace(/\s/g, '');
    return cleaned.match(/.{1,2}/g)?.join(' ') || cleaned;
  }

  static getDisplayHex(data: any): string {
    if (typeof data === 'string') {
      // If it's already hex-like, just format it
      if (/^[0-9A-Fa-f\s]+$/.test(data)) {
        return this.fromHex(data);
      }
      // Otherwise convert to hex
      return this.toHex(data);
    } else if (typeof data === 'object' && data !== null) {
      return this.toHex(data);
    }
    return data.toString();
  }

  static highlight(hex: string, pattern: string): string {
    // Highlight specific bytes in hex view
    return hex.replace(
      new RegExp(`\\b${pattern}\\b`, 'gi'),
      `<mark class="bg-yellow-200">$&</mark>`
    );
  }
}

export class JSONFormatter {
  static format(data: any, indent: number = 2): string {
    try {
      if (typeof data === 'string') {
        // First try to parse as JSON
        if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(data);
            return JSON.stringify(parsed, null, indent);
          } catch {
            // If JSON parsing fails, try hex decryption
            if (/^[0-9A-Fa-f\s]+$/.test(data)) {
              try {
                const decrypted = PayloadDecryptor.parseEpcFromHex(data);
                return JSON.stringify(decrypted, null, indent);
              } catch {
                // Fall back to wrapping as string
                return JSON.stringify({ message: data }, null, indent);
              }
            }
            // Otherwise wrap as a string value
            return JSON.stringify({ message: data }, null, indent);
          }
        }
        // If it looks like hex, try to decrypt
        else if (/^[0-9A-Fa-f\s]+$/.test(data)) {
          try {
            const decrypted = PayloadDecryptor.parseEpcFromHex(data);
            return JSON.stringify(decrypted, null, indent);
          } catch {
            return JSON.stringify({ message: data }, null, indent);
          }
        }
        // Otherwise just wrap the text
        else {
          return JSON.stringify({ message: data }, null, indent);
        }
      } else if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data, null, indent);
      } else {
        return JSON.stringify({ value: data }, null, indent);
      }
    } catch (error) {
      return `Error formatting JSON: ${error}`;
    }
  }

  static parse(jsonStr: string): any {
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      return { error: `Invalid JSON: ${error}` };
    }
  }

  static getDisplayJson(data: any): string {
    return this.format(data, 2);
  }
}

export class TextFormatter {
  static format(data: any): string {
    if (typeof data === 'string') {
      return data;
    }

    const lines: string[] = [];

    if (Array.isArray(data)) {
      lines.push(`Array (${data.length} items):`);
      data.forEach((item, idx) => {
        lines.push(`  [${idx}]: ${this.formatValue(item)}`);
      });
    } else if (typeof data === 'object' && data !== null) {
      lines.push('Object:');
      Object.entries(data).forEach(([key, value]) => {
        lines.push(`  ${key}: ${this.formatValue(value)}`);
      });
    } else {
      lines.push(String(data));
    }

    return lines.join('\n');
  }

  static getDisplayText(data: any): string {
    return this.format(data);
  }

  private static formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return `[${typeof value}]`;
      }
    }
    return String(value);
  }
}
