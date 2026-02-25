import { ReaderManager } from './ReaderManager';
import { RfidEventEmitter, TagData } from '../events/EventBus';

export class BBProtocolReader extends ReaderManager {
  private buffer: Buffer = Buffer.alloc(0);
  private isScanning: boolean = false;

  constructor(rfidEmitter: RfidEventEmitter) {
    super(rfidEmitter);
  }

  public injectData(data: Buffer): void {
    if (!this.isScanning) return;
    this.buffer = Buffer.concat([this.buffer, data]);

    // Keep buffer size sane
    if (this.buffer.length > 4096) {
      this.buffer = this.buffer.subarray(this.buffer.length - 2048);
    }

    this.processBuffer();
  }

  private processBuffer() {
    while (this.buffer.length >= 8) { // Min frame length
      // 1. Look for Header 0xBB
      const headerIdx = this.buffer.indexOf(0xBB);
      
      // If we have data but no BB header, discard garbage up to the next BB or keep last few bytes
      if (headerIdx === -1) {
        // No BB found. discard all but last byte just in case
        if (this.buffer.length > 0) this.buffer = this.buffer.subarray(this.buffer.length - 1);
        break;
      }

      // If garbage before BB, discard it
      if (headerIdx > 0) {
        this.buffer = this.buffer.subarray(headerIdx);
        continue;
      }

      // Now buffer starts with BB.
      // Check for CR LF (0D 0A) terminator
      const crlfIndex = this.buffer.indexOf(Buffer.from([0x0D, 0x0A]));
      
      if (crlfIndex !== -1) {
        // We have a full frame: BB ... 0D 0A
        const frame = this.buffer.subarray(0, crlfIndex + 2); // Include 0D 0A
        this.parseFrame(frame);
        
        // Remove frame from buffer
        this.buffer = this.buffer.subarray(crlfIndex + 2);
      } else {
        // No terminator yet. 
        // If buffer is getting huge (>128 bytes) without terminator, likely corrupt. Skip this BB.
        if (this.buffer.length > 128) {
          this.buffer = this.buffer.subarray(1);
        } else {
          // Wait for more data
          break; 
        }
      }
    }
  }

  private parseFrame(frame: Buffer) {
    // Expected: BB 97 [Len] [Cmd] [Ant] [EPC...] [RSSI] ... 0D 0A
    // Example:  bb 97  12    20    00    cc e4...
    
    if (frame.length < 5) return;
    
    const type = frame[1]; // 0x97 = Notification, 0x40 = Status

    if (type === 0x40) {
      // Heartbeat / Status response
      // console.log('[BB] Status Frame:', frame.toString('hex'));
      return;
    }

    if (type === 0x97) {
      // Tag Data
      // Based on your analyzer:
      // Index 0: BB
      // Index 1: 97
      // Index 2: 12 (Length of data following?)
      // Index 3: 20
      // Index 4: 00
      // Index 5: Start of EPC
      
      try {
        const epcStart = 5;
        const epcLen = 12; // Usually 12 bytes for 96-bit EPC, or variable
        
        // Dynamic EPC length check? 
        // Let's assume standard 12 bytes or 7 bytes based on your log (CC E4 21 7A BC DD 48) -> 7 bytes?
        // Let's safe extract.
        
        // Raw Data: ... 00 [CC E4 21 7A BC DD 48] 00 00 00 01 ...
        // It looks like 7 bytes EPC then 00s.
        
        const epcBuffer = frame.subarray(epcStart, epcStart + 7); // Extract 7 bytes as per your log
        const epc = epcBuffer.toString('hex').toUpperCase();
        
        // RSSI is usually near the end or after EPC. 
        // In your log: ... 48 [00] ... 
        // Let's assume byte 15 is RSSI?
        const rssi = frame.length > 15 ? frame[15] : 0;

        const tag: TagData = {
          id: epc,
          epc: epc,
          timestamp: Date.now(),
          rssi: -rssi, // Convert to negative dBm
          raw: frame,
          id_full: frame.toString('hex').toUpperCase()
        };

        this.emitTag(tag);
        // console.log(`[BB] Tag Found: ${epc}`);
      } catch (err) {
        console.error('[BB] Parse Error:', err);
      }
    }
  }

  startScan() { this.isScanning = true; }
  stopScan() { this.isScanning = false; }
  
  // Stubs
  async connect() {}
  async disconnect() {}
  readTag() {}
}