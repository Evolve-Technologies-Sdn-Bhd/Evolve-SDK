import { ReaderManager } from './ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

/**
 * BBProtocol Reader - Handles BB Protocol frames for F5001 and similar devices
 *
 * Protocol specifications:
 * - Format 1 (F5001/CR LF terminated): BB 97 [format] [EPC 7 bytes] [RSSI/data] 0D 0A
 * - Format 2 (Status/Heartbeat): BB 40 [...] 0D 0A
 * - Format 3 (Sanray): BB <type> <cmd> <len_h> <len_l> [payload...] <checksum> 7E
 * - Heartbeat: 7E 7E [data...] (no terminator, just skipped)
 * - All frames may be terminated by CR LF (0x0D 0x0A)
 */
export class BBProtocolReader extends ReaderManager {
  private buffer: Buffer = Buffer.alloc(0);
  private isScanning: boolean = false;

  constructor(rfidEmitter: RfidEventEmitter) {
    super(rfidEmitter);
  }

  /**
   * Handle incoming serial data
   * Accumulates data in buffer and processes complete frames
   */
  public injectData(data: Buffer): void {
    if (!this.isScanning) return;

    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, data]);

    // Emit raw data for debugging
    this.emitRawData(data, 'RX');

    // Process all complete frames
    while (this.buffer.length >= 3) {
      const processed = this.tryParseFrame();
      if (!processed) break; // No complete frame found
    }

    // Memory leak protection
    if (this.buffer.length > 65536) {
      console.warn('[BBProtocolReader] Buffer exceeded 64KB, clearing');
      this.buffer = Buffer.alloc(0);
    }
  }

  /**
   * Try to parse one frame from the buffer
   * Returns true if a frame was processed, false if waiting for more data
   */
  private tryParseFrame(): boolean {
    if (this.buffer.length === 0) return false;

    // Sync to BB header: If buffer doesn't start with BB, scan for it to discard garbage
    if (this.buffer[0] !== 0xBB) {
      const bbIndex = this.buffer.indexOf(0xBB);
      
      if (bbIndex > 0) {
        // Found BB later in buffer - discard prefix (garbage/heartbeat)
        const garbage = this.buffer.subarray(0, bbIndex);
        
        // Check if it's the known heartbeat (7E 7E)
        if (garbage.length >= 2 && garbage[0] === 0x7E && garbage[1] === 0x7E) {
           // It's likely a heartbeat - silent skip or debug
           // console.debug('[BBProtocolReader] Skipped heartbeat sequence');
        } else {
           console.debug(`[BBProtocolReader] Skipped ${bbIndex} bytes of non-BB data`);
        }
        
        this.buffer = this.buffer.subarray(bbIndex);
        return true; // Loop again to process from BB
      } else {
        // No BB found in the entire buffer
        if (this.buffer.length > 256) {
           // Buffer too full of garbage, clear it
           console.warn('[BBProtocolReader] Buffer full of non-BB data, clearing');
           this.buffer = Buffer.alloc(0);
           return true; // Buffer cleared, return true to continue/reset
        }
        // Wait for more data
        return false;
      }
    }

    // At this point, buffer starts with 0xBB. 
    // We can proceed to parse it as either CR LF terminated or Sanray format.

    // First, look for CR LF terminated frames (0x0D 0x0A)
    const crlfIndex = this.findCRLF();
    if (crlfIndex !== -1) {
      // Found a complete CR LF terminated frame
      const frame = this.buffer.subarray(0, crlfIndex);
      this.buffer = this.buffer.subarray(crlfIndex + 2); // Skip CR LF

      if (frame.length > 0) {
        this.processFrame(frame);
      }
      return true;
    }

    // If no CR LF found yet, check if we have Sanray format (with 7E footer)
    if (this.buffer.length >= 7 && this.buffer[this.buffer.length - 1] === 0x7E) {
      // Could be complete Sanray frame, but need to verify it's actually complete
      const header = this.buffer[0];
      if (header === 0xBB && this.buffer.length >= 7) {
        const type = this.buffer[1];
        const cmd = this.buffer[2];
        const payloadLen = (this.buffer[3] << 8) | this.buffer[4];
        const totalLen = 7 + payloadLen;

        if (totalLen <= 1024 && this.buffer.length >= totalLen && this.buffer[totalLen - 1] === 0x7E) {
          const frame = this.buffer.subarray(0, totalLen);
          this.buffer = this.buffer.subarray(totalLen);
          this.processFrame(frame);
          return true;
        }
      }
    }

    // Wait for more data (up to 256 bytes for safety)
    if (this.buffer.length > 256 && crlfIndex === -1) {
      // Too much data without CR LF, skip first byte
      this.buffer = this.buffer.subarray(1);
      return true;
    }

    return false;
  }

  /**
   * Find CR LF (0x0D 0x0A) in buffer
   */
  private findCRLF(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 0x0d && this.buffer[i + 1] === 0x0a) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Process a complete BB frame
   */
  private processFrame(frame: Buffer): void {
    if (frame.length < 2) {
      console.debug('[BBProtocolReader] Frame too short');
      return;
    }

    const frameHex = frame.toString('hex').toUpperCase();
    console.debug(`[BBProtocolReader] Processing frame: ${frameHex}`);

    const header = frame[0];

    // Handle heartbeat frames (7E 7E)
    if (header === 0x7E && frame.length >= 2 && frame[1] === 0x7E) {
      console.debug('[BBProtocolReader] Ignoring heartbeat frame (7E 7E)');
      return;
    }

    // Handle BB protocol frames
    if (header === 0xBB && frame.length >= 2) {
      const subtype = frame[1];

      // IMPORTANT: Only process BB 97 tag report frames
      if (subtype === 0x97) {
        console.debug(`[BBProtocolReader] Detected BB 97 tag report frame`);
        this.processTagFrame(frame);
        return;
      }

      // BB 40 = Status/Heartbeat
      if (subtype === 0x40) {
        console.debug(`[BBProtocolReader] Status frame BB 40 received: ${frameHex}`);
        return;
      }

      // Try Sanray format as fallback
      console.debug(`[BBProtocolReader] Attempting Sanray format parsing for BB ${subtype.toString(16)}`);
      this.processSanrayFrame(frame);
      return;
    }

    // Unknown frame type
    console.debug(`[BBProtocolReader] Unknown frame header: 0x${header.toString(16)}`);
  }

  /**
   * Process F5001 tag report frame (BB 97 format)
   * Structure: BB 97 [format bytes] [EPC 7] [RSSI/data...]
   * Minimum length: BB(1) + 97(1) + format(3) + EPC(7) + minimal_data = 12 bytes
   */
  private processTagFrame(frame: Buffer): void {
    // Validate this is actually a BB 97 frame
    if (frame.length < 2 || frame[0] !== 0xBB || frame[1] !== 0x97) {
      console.warn('[BBProtocolReader] processTagFrame called with invalid header');
      return;
    }

    if (frame.length < 13) {
      console.warn('[BBProtocolReader] BB 97 Tag frame too short:', frame.length, 'bytes');
      return;
    }

    try {
      // Frame: BB 97 12 20 00 [EPC 7 bytes] [padding/RSSI...]
      // Positions: 0  1  2  3  4   5-11       12+
      
      const epcStart = 5;
      const epcLength = 7;

      if (epcStart + epcLength > frame.length) {
        console.warn('[BBProtocolReader] BB 97 frame too short to extract EPC');
        return;
      }

      // Extract EPC (7 bytes)
      const epcBuffer = frame.subarray(epcStart, epcStart + epcLength);
      const epc = this.decodeEPC(epcBuffer);

      if (!epc || epc.length === 0) {
        console.warn('[BBProtocolReader] Failed to decode EPC from BB 97 frame');
        return;
      }

      // Extract RSSI - typically at byte 15 (UInt16 BE) or nearby
      let rssi = 0;
      if (frame.length > 15) {
        // Try to extract RSSI as signed value or from position 15-16
        rssi = frame[15];
        if (rssi > 127) {
          rssi = rssi - 256; // Convert to signed if needed
        }
      }

      const tag: TagData = {
        id: epc,
        epc: epc,
        timestamp: Date.now(),
        raw: frame,
        rssi: rssi,
        id_full: frame.toString('hex').toUpperCase()
      };

      this.emitTag(tag);
      console.log(`[BBProtocolReader] ✓ BB 97 Tag detected - EPC: ${epc}, RSSI: ${rssi}dBm`);
    } catch (err) {
      console.error('[BBProtocolReader] Error processing BB 97 tag frame:', err);
    }
  }

  /**
   * Process Sanray format frame
   */
  private processSanrayFrame(frame: Buffer): void {
    if (frame.length < 7 || frame[frame.length - 1] !== 0x7E) {
      return; // Not Sanray format
    }

    try {
      const type = frame[1];
      const cmd = frame[2];
      const payloadLen = (frame[3] << 8) | frame[4];
      const payload = frame.subarray(5, 5 + payloadLen);

      if (type === 0x02 && cmd === 0x22 && payload.length > 0) {
        // Inventory notification
        const rssi = payload[0] * -1;
        const epcData = payload.subarray(1);

        if (epcData.length > 0) {
          const epc = this.decodeEPC(epcData);
          if (epc) {
            const tag: TagData = {
              id: epc,
              epc: epc,
              timestamp: Date.now(),
              raw: frame,
              rssi: rssi,
              id_full: payload.toString('hex').toUpperCase()
            };

            this.emitTag(tag);
            console.debug(`[BBProtocolReader] Sanray Tag detected - EPC: ${epc}, RSSI: ${rssi}dBm`);
          }
        }
      }
    } catch (err) {
      console.error('[BBProtocolReader] Error processing Sanray frame:', err);
    }
  }

  /**
   * Decode EPC from buffer (try UTF-8, fallback to HEX)
   */
  private decodeEPC(buffer: Buffer): string {
    if (buffer.length === 0) return '';

    try {
      const text = buffer.toString('utf-8');
      if (text && /^[\x20-\x7E\n\r\t]+$/.test(text)) {
        return text.trim();
      }
    } catch {
      // Fall through to HEX
    }

    return buffer.toString('hex').toUpperCase();
  }

  // ========== ReaderManager Abstract Methods ==========

  async connect(): Promise<void> {
    throw new Error('BBProtocolReader.connect() must be implemented by transport layer');
  }

  async disconnect(): Promise<void> {
    this.stopScan();
  }

  readTag(): void {
    console.warn('[BBProtocolReader] readTag() called but reader is streaming');
  }

  startScan(): void {
    this.isScanning = true;
    console.log('[BBProtocolReader] Scan started');
  }

  stopScan(): void {
    this.isScanning = false;
    console.log('[BBProtocolReader] Scan stopped');
  }
}

export default BBProtocolReader;
