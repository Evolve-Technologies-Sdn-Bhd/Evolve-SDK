import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private path: string, private baud: number, emitter: any) { super(emitter); }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ path: this.path, baudRate: this.baud, autoOpen: false });
      this.port.open((err) => {
        if (err) return reject(err);
        console.log(`[SerialReader] Connected to ${this.path}`);
        this.port?.on('data', (data) => this.handleIncomingData(data));
        resolve();
      });
    });
  }

  // Uses the same handleIncomingData and processFrame as TCP
  private handleIncomingData(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
    // Minimum frame: A0 04 Addr Cmd CS (5 bytes)
    while (this.buffer.length >= 5) {
      if (this.buffer[0] !== A0Protocol.HEADER) {
        this.buffer = this.buffer.subarray(1); // Seek for header
        continue;
      }
      const len = this.buffer[1];
      if (this.buffer.length < len + 2) break; // Frame incomplete

      const frame = this.buffer.subarray(0, len + 2);
      this.processFrame(frame);
      this.buffer = this.buffer.subarray(len + 2);
    }
  }
  
  private processFrame(frame: Buffer) {
    const cmd = frame[3];
    if (cmd === 0x89 || cmd === 0x80) { // Inventory Report
      const epc = frame.subarray(7, frame.length - 2);
      
      // Try to decode as UTF-8 text first, fall back to hex if not valid text
      let id = '';
      try {
        const textDecoded = epc.toString('utf-8');
        // Check if it's valid UTF-8 and mostly printable characters
        if (textDecoded && /^[\x20-\x7E\n\r\t]+$/.test(textDecoded)) {
          id = textDecoded.trim();
        } else {
          id = epc.toString('hex').toUpperCase();
        }
      } catch {
        id = epc.toString('hex').toUpperCase();
      }
      
      this.emitTag({
        id: id,
        timestamp: Date.now(),
        rssi: frame[frame.length - 2] * -1,
        raw: frame
      });
    }
  }

  async readTag(): Promise<any> {
    // Implement tag reading logic here
    return new Promise((resolve) => {
      // This will be resolved when a tag is detected in processFrame
      resolve(null);
    });
  }

  startScan() { this.port?.write(A0Protocol.encode(0x01, 0x89, [0xFF])); }
  stopScan() { this.port?.write(A0Protocol.encode(0x01, 0x8C)); }
  async disconnect() { if (this.port?.isOpen) this.port.close(); }
}