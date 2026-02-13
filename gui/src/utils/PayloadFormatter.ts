/**
 * PayloadFormatter - GUI Renderer Layer
 * All formatting logic belongs here, not in SDK
 * SDK provides raw data, GUI formats for display
 */

export interface FormattedTag {
  tagId: string;
  epc: string;
  rssi: number;
  rssiDb: string; // "-45 dBm"
  timestamp: string;
  readableTime: string; // "14:02:58"
  direction: 'RX' | 'TX';
}

export class PayloadFormatter {
  /**
   * Format raw TagData into GUI-friendly structure
   */
  static formatTag(rawData: any): FormattedTag {
    return {
      tagId: rawData.tagId || 'Unknown',
      epc: rawData.epc?.toUpperCase() || 'N/A',
      rssi: rawData.rssi || 0,
      rssiDb: `${rawData.rssi || 0} dBm`,
      timestamp: new Date(rawData.timestamp).toISOString(),
      readableTime: this.formatTime(rawData.timestamp),
      direction: 'RX'
    };
  }

  /**
   * Format timestamp to readable format
   */
  static formatTime(timestamp: number | Date): string {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
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
  static toHex(data: string): string {
    return data.replace(/\s/g, '').toUpperCase();
  }

  static fromHex(hex: string): string {
    const cleaned = hex.replace(/\s/g, '');
    return cleaned.match(/.{1,2}/g)?.join(' ') || cleaned;
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
      return JSON.stringify(data, null, indent);
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
    } else if (typeof data === 'object') {
      lines.push('Object:');
      Object.entries(data).forEach(([key, value]) => {
        lines.push(`  ${key}: ${this.formatValue(value)}`);
      });
    } else {
      lines.push(String(data));
    }

    return lines.join('\n');
  }

  private static formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return `[${typeof value}]`;
    return String(value);
  }
}
