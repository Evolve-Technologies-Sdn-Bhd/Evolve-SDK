import { ReaderManager } from './ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

/**
 * A0Protocol Reader - Handles A0 Protocol frames for general RFID readers
 *
 * Protocol specification:
 * - Format: A0 <len> <addr> <cmd> [...payload...] <checksum>
 * - Length is total frame size (addr + cmd + payload + checksum)
 * - Checksum is 2's complement of sum of bytes from len to end of payload
 * - Various command codes for different response types
 */
export class AOProtocolReader extends ReaderManager {
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

    // ⚠️ Do NOT emit raw data here - will be included in final tagRead event
    // this.emitRawData(data, 'RX');

    // Process all complete frames
    while (this.buffer.length >= 3) {
      const processed = this.tryParseFrame();
      if (!processed) break; // No complete frame found
    }

    // Memory leak protection
    if (this.buffer.length > 65536) {
      console.warn('[AOProtocolReader] Buffer exceeded 64KB, clearing');
      this.buffer = Buffer.alloc(0);
    }
  }

  /**
   * Try to parse one frame from the buffer
   * Returns true if a frame was processed, false if waiting for more data
   */
  private tryParseFrame(): boolean {
    if (this.buffer.length < 3) return false;

    const header = this.buffer[0];
    if (header !== 0xA0) {
      // Skip non-A0 frames
      this.buffer = this.buffer.subarray(1);
      return true;
    }

    const len = this.buffer[1];

    // Sanity check
    if (len > 1024 || len < 3) {
      console.warn('[AOProtocolReader] Invalid length:', len);
      this.buffer = this.buffer.subarray(1);
      return true;
    }

    // Check if frame is complete
    const totalLen = len + 2; // Header + len byte + payload
    if (this.buffer.length < totalLen) {
      return false; // Wait for more data
    }

    const frame = this.buffer.subarray(0, totalLen);
    this.buffer = this.buffer.subarray(totalLen);

    this.processFrame(frame);
    return true;
  }

  /**
   * Process a complete A0 frame
   * Format: A0 <len> <addr> <cmd> [...payload...] <checksum>
   */
  private processFrame(frame: Buffer): void {
    if (frame.length < 5) {
      console.warn('[AOProtocolReader] Frame too short:', frame.length);
      return;
    }

    try {
      const len = frame[1];
      const address = frame[2];
      const cmd = frame[3];

      console.debug(`[AOProtocolReader] Processing frame - Len: ${len}, Addr: 0x${address.toString(16)}, Cmd: 0x${cmd.toString(16)}`);

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(frame.subarray(1, frame.length - 1));
      const receivedChecksum = frame[frame.length - 1];

      if (calculatedChecksum !== receivedChecksum) {
        console.warn(
          `[AOProtocolReader] Checksum mismatch! Calculated: 0x${calculatedChecksum.toString(16)}, Received: 0x${receivedChecksum.toString(16)}`
        );
        return;
      }

      // Handle tag report commands
      if (cmd === 0x80 || cmd === 0x81 || cmd === 0x88 || cmd === 0x89 || cmd === 0x90) {
        this.extractAndEmitTag(frame, cmd);
      } else if (cmd === 0x82) {
        // Module info response
        console.debug('[AOProtocolReader] Module info response (0x82)');
        this.extractAndEmitTag(frame, cmd);
      } else {
        console.debug(`[AOProtocolReader] Unrecognized command: 0x${cmd.toString(16)}`);
      }
    } catch (err) {
      console.error('[AOProtocolReader] Error processing frame:', err);
    }
  }

  /**
   * Calculate A0 protocol checksum (2's complement)
   */
  private calculateChecksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (0x100 - (sum & 0xff)) & 0xff;
  }

  /**
   * Extract EPC and RSSI from A0 frame and emit tag event
   */
  private extractAndEmitTag(frame: Buffer, cmd: number): void {
    if (frame.length < 5) {
      console.warn('[AOProtocolReader] Frame too short to extract tag');
      return;
    }

    try {
      let rssi = 0;
      let epcStart = 4;
      let epcEnd = Math.min(frame.length - 1, 11);

      // Different command formats
      if (cmd === 0x80 || cmd === 0x89 || cmd === 0x8A) {
        // Format: RSSI at byte 4, EPC starts at byte 5
        if (frame.length > 5) {
          rssi = frame[4] * -1;
          epcStart = 5;
          epcEnd = Math.min(frame.length - 1, 12);
          console.debug(`[AOProtocolReader] Format (0x${cmd.toString(16)}): RSSI at byte 4, EPC from byte 5`);
        }
      } else if (cmd === 0x81 || cmd === 0x88) {
        // Format: EPC starts at byte 4
        epcStart = 4;
        epcEnd = Math.min(frame.length - 1, 11);
        console.debug(`[AOProtocolReader] Format (0x${cmd.toString(16)}): EPC from byte 4`);
      }

      // Extract EPC - standardized to ~7 bytes
      const epcData = frame.subarray(epcStart, epcEnd);
      if (epcData.length === 0) {
        console.warn('[AOProtocolReader] No EPC data found');
        return;
      }

      const epc = this.decodeEPC(epcData);
      if (!epc) {
        console.warn('[AOProtocolReader] Failed to decode EPC');
        return;
      }

      // Extract full payload for id_full
      const payloadStart = 2; // After header and length byte
      const payloadEnd = frame.length - 1; // Exclude checksum
      const fullPayload = frame.subarray(payloadStart, payloadEnd);
      const idFull = fullPayload.toString('hex').toUpperCase();

      // Emit tag
      const tag: TagData = {
        id: epc,
        epc: epc,
        timestamp: Date.now(),
        raw: frame,
        rssi: rssi,
        id_full: idFull
      };

      this.emitTag(tag);
      console.debug(`[AOProtocolReader] Tag detected - EPC: ${epc}, RSSI: ${rssi}dBm`);
    } catch (err) {
      console.error('[AOProtocolReader] Error extracting tag:', err);
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
    throw new Error('AOProtocolReader.connect() must be implemented by transport layer');
  }

  async disconnect(): Promise<void> {
    this.stopScan();
  }

  readTag(): void {
    console.warn('[AOProtocolReader] readTag() called but reader is streaming');
  }

  startScan(): void {
    this.isScanning = true;
    console.log('[AOProtocolReader] Scan started');
  }

  stopScan(): void {
    this.isScanning = false;
    console.log('[AOProtocolReader] Scan stopped');
  }
}

export default AOProtocolReader;
