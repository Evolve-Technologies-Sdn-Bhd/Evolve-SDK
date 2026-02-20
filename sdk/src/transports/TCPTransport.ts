import net from 'net';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class TcpReader extends ReaderManager {
  private client?: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private host: string, private port: number, emitter: any) { super(emitter); }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.client = new net.Socket();
      this.client.connect(this.port, this.host, () => {
        console.log(`[TcpReader] Connected to ${this.host}:${this.port}`);
        resolve();
      });

      this.client.on('data', (data: Buffer) => this.handleIncomingData(data));
      this.client.on('error', (err) => reject(err));
      this.client.on('close', () => this.emit('disconnected'));
    });
  }

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

  startScan() {
    // 0x89 = Real time inventory, 0xFF = keep reading
    const cmd = A0Protocol.encode(0x01, 0x89, [0xFF]);
    this.client?.write(cmd);
  }

  stopScan() {
    this.client?.write(A0Protocol.encode(0x01, 0x8C)); // 0x8C = Stop/Reset
  }

  async disconnect() { this.client?.destroy(); }

  readTag() {
    // Implementation of abstract method from ReaderManager
    // Tag reading is handled through the data event listener in connect()
  }
}