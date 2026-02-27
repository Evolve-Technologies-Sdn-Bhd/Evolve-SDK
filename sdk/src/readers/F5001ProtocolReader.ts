// src/readers/F5001ProtocolReader.ts

import { ReaderManager } from './ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

export class F5001ProtocolReader extends ReaderManager {
  private buffer: Buffer = Buffer.alloc(0);
  private scanning = false;

  constructor(rfidEmitter: RfidEventEmitter) {
    super(rfidEmitter);
  }

  // ========== INCOMING DATA ==========
  public injectData(data: Buffer): void {
    this.emitRawData(data, 'RX');

    this.buffer = Buffer.concat([this.buffer, data]);

    // protect memory
    if (this.buffer.length > 8192) {
      this.buffer = this.buffer.subarray(this.buffer.length - 4096);
    }

    this.processBuffer();
  }

  private processBuffer(): void {
    while (true) {
      // ✅ SYNC on BB frame marker to skip garbage bytes between frames
      let bbIndex = this.buffer.indexOf(0xBB);
      if (bbIndex === -1) {
        // No frame start found, clear junk
        this.buffer = Buffer.alloc(0);
        return;
      }

      // Remove any garbage before the frame marker
      if (bbIndex > 0) {
        console.debug(`[F5001] Skipping ${bbIndex} garbage bytes before frame marker`);
        this.buffer = this.buffer.subarray(bbIndex);
      }

      // Now look for frame terminator (0D 0A)
      const endIndex = this.buffer.indexOf(Buffer.from([0x0D, 0x0A]));
      if (endIndex === -1) {
        // Frame incomplete, wait for more data
        return;
      }

      // Extract complete frame (includes terminator)
      const frame = this.buffer.subarray(0, endIndex + 2);
      this.buffer = this.buffer.subarray(endIndex + 2);

      // Parse the frame (already confirmed to start with BB)
      this.parseFrame(frame);
    }
  }

  // ========== FRAME PARSER ==========
  private parseFrame(frame: Buffer): void {
    const cmd = frame[1];

    switch (cmd) {
      case 0x97:
        this.parseTagFrame(frame);
        break;

      case 0x98:
        console.debug('[F5001] Inventory Finished');
        break;

      case 0x40:
        console.debug('[F5001] Status Frame');
        break;

      default:
        console.debug('[F5001] Unknown CMD:', cmd.toString(16));
    }
  }

  // ========== BB 97 TAG FRAME ==========
  private parseTagFrame(frame: Buffer): void {
    try {
      const dataLen = frame[2];

      // PC word (2 bytes)
      const pc = (frame[3] << 8) | frame[4];

      // EPC length = bits 11–15 of PC
      const epcWords = (pc >> 11) & 0x1F;
      const epcLen = epcWords * 2;

      const epcStart = 5;
      const epcEnd = epcStart + epcLen;

      if (epcEnd > frame.length) return;

      const epc = frame
        .subarray(epcStart, epcEnd)
        .toString('hex')
        .toUpperCase();

      // RSSI is 3rd byte from end (before CRC + 0D 0A)
      const rssiIndex = frame.length - 4;
      let rssi = frame[rssiIndex];

      if (rssi > 127) rssi -= 256;
      rssi = -Math.abs(rssi);

      const tag: TagData = {
        id: epc,
        epc,
        timestamp: Date.now(),
        rssi,
        raw: frame,
        id_full: epc
      };

      this.emitTag(tag);

    } catch (err) {
      console.error('[F5001] Tag parse error:', err);
    }
  }

  // ========== CONTROL ==========
  startScan(): void {
    this.scanning = true;
  }

  stopScan(): void {
    this.scanning = false;
  }

  async connect() {}
  async disconnect() {}
  readTag() {}
}