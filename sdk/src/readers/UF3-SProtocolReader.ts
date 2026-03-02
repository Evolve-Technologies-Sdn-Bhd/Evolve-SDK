import { ReaderManager } from './ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

/**
 * UF3-S / F5001 RFID Reader Stream Parser
 *
 * Protocol specification:
 * - Frames are terminated by 0x0D 0x0A (CR LF)
 * - Tag report frames start with: 0xBB 0x97
 * - Heartbeat/status frames start with: 0x7E 0x7E (ignored)
 * - EPC starts at byte index 5, length 7 bytes
 * - RSSI located at byte index 16 (UInt16 Big Endian)
 * - Serial data streams continuously with partial/multiple frames per chunk
 *
 * Example frame:
 * BB 97 12 20 00 BB F7 85 2A BC DA 54 00 00 00 01 00 1C D4 49 00 4E 0D 0A
 */
export class UF3SReader extends ReaderManager {
  private buffer: Buffer = Buffer.alloc(0);
  private isScanning: boolean = false;

  constructor(rfidEmitter: RfidEventEmitter) {
    super(rfidEmitter);
  }

  /**
   * Handle incoming serial data from the reader
   * Accumulates data in internal buffer and processes complete frames
   */
  private onData(data: Buffer): void {
    // Append incoming chunk to buffer
    this.buffer = Buffer.concat([this.buffer, data]);

    // ⚠️ Do NOT emit raw data here - will be included in final tagRead event
    // this.emitRawData(data, 'RX');

    // Process all complete frames in the buffer
    while (this.buffer.length > 0) {
      // Look for frame terminator (0x0D 0x0A - CR LF)
      const frameEndIndex = this.findFrameEnd();

      if (frameEndIndex === -1) {
        // No complete frame found, keep accumulating data
        // But if buffer gets too large (memory safety), clear it
        if (this.buffer.length > 65536) {
          console.warn('[UF3SReader] Buffer exceeded 64KB, clearing to prevent memory leak');
          this.buffer = Buffer.alloc(0);
        }
        break;
      }

      // Extract the frame (excluding CR LF terminator)
      const frameData = this.buffer.subarray(0, frameEndIndex);

      // Remove frame from buffer (including CR LF terminator)
      this.buffer = this.buffer.subarray(frameEndIndex + 2);

      // Process the frame if it has content
      if (frameData.length > 0) {
        this.processFrame(frameData);
      }
    }
  }

  /**
   * Find the index of frame terminator (0x0D 0x0A)
   * Returns -1 if not found
   */
  private findFrameEnd(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 0x0d && this.buffer[i + 1] === 0x0a) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Process a single frame (without CR LF terminator)
   * Extracts EPC and RSSI, emits TAG_DETECTED event
   */
  private processFrame(frame: Buffer): void {
    // Ignore empty frames
    if (frame.length === 0) {
      return;
    }

    // Check for heartbeat/status frames (0x7E 0x7E) - these are ignored
    if (frame.length >= 2 && frame[0] === 0x7e && frame[1] === 0x7e) {
      console.debug('[UF3SReader] Ignoring heartbeat frame');
      return;
    }

    // Check for tag report frame (0xBB 0x97)
    if (frame.length < 2 || frame[0] !== 0xbb || frame[1] !== 0x97) {
      console.debug('[UF3SReader] Ignoring non-tag frame:', frame.toString('hex').substring(0, 20));
      return;
    }

    // Validate frame length (minimum: header 2 + EPC start 5 + EPC 7 + padding + RSSI)
    if (frame.length < 24) {
      console.warn('[UF3SReader] Tag frame too short:', frame.length, 'bytes');
      return;
    }

    try {
      // Extract EPC (7 bytes starting at index 5)
      const epcStart = 5;
      const epcLength = 7;
      if (epcStart + epcLength > frame.length) {
        console.warn('[UF3SReader] Frame too short to extract EPC');
        return;
      }

      const epcBuffer = frame.subarray(epcStart, epcStart + epcLength);
      const epcHex = epcBuffer.toString('hex').toUpperCase();
      const epc = epcHex.match(/.{1,2}/g)?.join('') || epcHex;

      // Extract RSSI (UInt16 Big Endian at byte index 16)
      const rssiIndex = 16;
      if (rssiIndex + 1 >= frame.length) {
        console.warn('[UF3SReader] Frame too short to extract RSSI');
        return;
      }

      const rssi = (frame[rssiIndex] << 8) | frame[rssiIndex + 1];

      // Create tag data object
      const tag: TagData = {
        id: epc,
        epc: epc,
        timestamp: Date.now(),
        raw: frame,
        rssi: rssi,
        id_full: epc
      };

      // Emit tag detection event
      this.emitTag(tag);

      console.debug('[UF3SReader] Tag detected - EPC:', epc, 'RSSI:', rssi);
    } catch (err) {
      console.error('[UF3SReader] Error processing frame:', err);
    }
  }

  // ========== ReaderManager Abstract Methods ==========

  async connect(): Promise<void> {
    // This would be implemented by the transport layer
    throw new Error('UF3SReader.connect() must be implemented by transport layer');
  }

  async disconnect(): Promise<void> {
    this.stopScan();
  }

  readTag(): void {
    // Single read - not applicable for streaming reader
    console.warn('[UF3SReader] readTag() called but reader is streaming');
  }

  startScan(): void {
    this.isScanning = true;
    console.log('[UF3SReader] Scan started');
  }

  stopScan(): void {
    this.isScanning = false;
    console.log('[UF3SReader] Scan stopped');
  }

  /**
   * Inject data into the reader for processing
   * This is called by the transport layer when data arrives
   */
  public injectData(data: Buffer): void {
    if (this.isScanning) {
      this.onData(data);
    }
  }
}

export default UF3SReader;
