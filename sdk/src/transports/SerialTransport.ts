import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private buffer: Buffer = Buffer.alloc(0);
  private isConnected: boolean = false;

  constructor(private path: string, private baud: number, emitter: any) { 
    super(emitter); 
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[SerialReader] Attempting connection to ${this.path} @ ${this.baud} baud`);
        
        this.port = new SerialPort({ 
          path: this.path, 
          baudRate: this.baud, 
          autoOpen: false 
        });

        this.port.open((err) => {
          if (err) {
            console.error(`[SerialReader] Failed to open port ${this.path}:`, err.message);
            this.isConnected = false;
            return reject(err);
          }

          console.log(`[SerialReader] Successfully connected to ${this.path} @ ${this.baud} baud`);
          this.isConnected = true;

          // Set up data handler
          this.port?.on('data', (data) => this.handleIncomingData(data));
          
          // Set up error handler
          this.port?.on('error', (err) => {
            console.error(`[SerialReader] Port error:`, err.message);
            this.rfidEmitter.emitError(err);
          });

          // Set up close handler
          this.port?.on('close', () => {
            console.log(`[SerialReader] Port closed: ${this.path}`);
            this.isConnected = false;
            this.rfidEmitter.emitDisconnected();
          });

          resolve();
        });
      } catch (err) {
        console.error(`[SerialReader] Connection error:`, err);
        this.isConnected = false;
        reject(err);
      }
    });
  }

  private handleIncomingData(data: Buffer) {
    // Append incoming data to buffer
    this.buffer = Buffer.concat([this.buffer, data]);
    
    console.log(`[SerialReader] Received ${data.length} bytes, buffer size: ${this.buffer.length}`);
    
    // Minimum frame: A0 04 Addr Cmd CS (5 bytes)
    while (this.buffer.length >= 5) {
      if (this.buffer[0] !== A0Protocol.HEADER) {
        // Seek for header
        console.warn(`[SerialReader] Header mismatch: 0x${this.buffer[0].toString(16)}, seeking...`);
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const len = this.buffer[1];
      
      // Check if frame is complete
      if (this.buffer.length < len + 2) {
        console.log(`[SerialReader] Incomplete frame: need ${len + 2} bytes, have ${this.buffer.length}`);
        break; // Wait for more data
      }

      // Extract complete frame
      const frame = this.buffer.subarray(0, len + 2);
      
      try {
        this.processFrame(frame);
      } catch (err) {
        console.error(`[SerialReader] Error processing frame:`, err);
      }

      // Remove processed frame from buffer
      this.buffer = this.buffer.subarray(len + 2);
    }
  }
  
  private processFrame(frame: Buffer) {
    const cmd = frame[3];
    
    // Handle different command types
    if (cmd === 0x89 || cmd === 0x80) { 
      // Inventory Report - extract EPC
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

      const rssi = frame[frame.length - 2] * -1;
      
      console.log(`[SerialReader] Tag detected - ID: ${id}, RSSI: ${rssi}dBm`);
      
      this.emitTag({
        id: id,
        timestamp: Date.now(),
        rssi: rssi,
        raw: frame
      });
    } else {
      console.log(`[SerialReader] Received command: 0x${cmd.toString(16)}`);
    }
  }

  async readTag(): Promise<any> {
    // This method is called when waiting for a tag
    // Tags are emitted asynchronously via the 'data' event handler
    return new Promise((resolve) => {
      // Placeholder - tags are detected in handleIncomingData
      resolve(null);
    });
  }

  startScan() { 
    console.log('[SerialReader] Starting scan...');
    if (this.port?.isOpen) {
      this.port.write(A0Protocol.encode(0x01, 0x89, [0xFF]));
    } else {
      console.warn('[SerialReader] Port not open, cannot start scan');
    }
  }

  stopScan() { 
    console.log('[SerialReader] Stopping scan...');
    if (this.port?.isOpen) {
      this.port.write(A0Protocol.encode(0x01, 0x8C));
    } else {
      console.warn('[SerialReader] Port not open, cannot stop scan');
    }
  }

  async disconnect() { 
    console.log(`[SerialReader] Disconnecting from ${this.path}...`);
    if (this.port?.isOpen) {
      return new Promise<void>((resolve, reject) => {
        this.port?.close((err) => {
          if (err) {
            console.error('[SerialReader] Error closing port:', err);
            reject(err);
          } else {
            console.log('[SerialReader] Port closed successfully');
            this.isConnected = false;
            resolve();
          }
        });
      });
    } else {
      console.log('[SerialReader] Port already closed');
    }
  }

  isPortOpen(): boolean {
    return this.isConnected && this.port?.isOpen === true;
  }
}