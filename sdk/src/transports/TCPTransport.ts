import net from 'net';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class TcpReader extends ReaderManager {
  private client?: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private retryCount = 0;
  private maxRetries = 3;
  private retryTimeout?: NodeJS.Timeout;
  private isManuallyDisconnected = false;
  private connectTimeoutMs = 12000;
  private frameCount = 0;

  constructor(private host: string, private port: number, emitter: any) { super(emitter); }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.isManuallyDisconnected = false;
      this.retryCount = 0;
      let hasSettled = false;

      const attemptConnection = () => {
        this.client?.removeAllListeners();
        this.client?.destroy();
        this.client = new net.Socket();
        this.buffer = Buffer.alloc(0);

        let connectResolved = false;
        const timeout = setTimeout(() => {
          if (connectResolved || hasSettled) return;
          connectResolved = true;
          this.handleConnectionFailure(new Error('Connection timeout'), () => {
            if (!hasSettled) {
              hasSettled = true;
              reject(new Error('Connection timeout'));
            }
          }, attemptConnection);
        }, this.connectTimeoutMs);

        this.client.connect(this.port, this.host, () => {
          if (connectResolved || hasSettled) return;
          connectResolved = true;
          clearTimeout(timeout);
          console.log(`[TcpReader] Connected to ${this.host}:${this.port}`);
          this.emit('connected');
          if (!hasSettled) {
            hasSettled = true;
            this.retryCount = 0;
            resolve();
          }
        });

        this.client.on('data', (data: Buffer) => this.handleIncomingData(data));

        this.client.on('error', (err) => {
          if (!connectResolved && !hasSettled) {
            connectResolved = true;
            clearTimeout(timeout);
            this.handleConnectionFailure(err, () => {
              if (!hasSettled) {
                hasSettled = true;
                reject(err);
              }
            }, attemptConnection);
            return;
          }

          console.error('[TcpReader] Socket error:', err);
          this.rfidEmitter.emitError(err);
          if (!this.isManuallyDisconnected) {
            this.emit('disconnected');
          }
        });

        this.client.on('close', () => {
          if (!this.isManuallyDisconnected) {
            this.rfidEmitter.emitDisconnected();
            this.emit('disconnected');
          }
        });
      };

      attemptConnection();
    });
  }

  private handleConnectionFailure(
    error: Error,
    onMaxRetriesExceeded: () => void,
    attemptConnection: () => void
  ) {
    this.client?.destroy();
    this.client = undefined;

    if (this.isManuallyDisconnected) {
      onMaxRetriesExceeded();
      return;
    }

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 30000);
      console.log(
        `[TcpReader] Connection failed: ${error.message}. Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`
      );
      this.retryTimeout = setTimeout(attemptConnection, delay);
    } else {
      console.error(
        `[TcpReader] Failed to connect after ${this.maxRetries} attempts. Giving up.`
      );
      if (this.listenerCount('error') > 0) {
        this.emit('error', new Error(`Connection failed after ${this.maxRetries} attempts: ${error.message}`));
      }
      onMaxRetriesExceeded();
    }
  }

  private handleIncomingData(data: Buffer) {
    this.emitRawData(data, 'RX');

    // Case A: JSON Mode (Starts with '{' or already contains JSON data)
    if (data[0] === 0x7B || (this.buffer.length > 0 && this.buffer[0] === 0x7B)) {
      this.buffer = Buffer.concat([this.buffer, data]);
      let jsonStr = this.buffer.toString();
      
      // JSON messages are terminated by '$'
      if (jsonStr.includes('$')) {
        const parts = jsonStr.split('$');
        // Keep the last part in buffer (might be an incomplete frame)
        this.buffer = Buffer.from(parts.pop() || "");

        for (const part of parts) {
          if (part.trim()) {
            try {
              const msg = JSON.parse(part);
              this.processJsonMessage(msg);
            } catch (e) {
              console.error("[TcpReader] JSON Parse Error:", e);
            }
          }
        }
      }
      return;
    }

    // Case B: Hex/Binary Mode (Original A0 logic)
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 5) {
      if (this.buffer[0] !== 0xA0) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      const len = this.buffer[1];
      if (this.buffer.length < len + 2) break; 

      const frame = this.buffer.subarray(0, len + 2);
      this.processFrame(frame); // Your existing binary parser
      this.buffer = this.buffer.subarray(len + 2);
    }
  }

  // Logic to process the JSON format and count tags correctly
  private processJsonMessage(msg: any) {
    // code 1001 = Tag Inventory Result in UF3 JSON protocol
    if (msg.code === 1001 && msg.data) {
      const epc = msg.data.epc;
      const rssi = msg.data.rssi || 0;

      const tag = {
        id: epc,
        epc: epc,
        id_full: epc,
        rssi: rssi,
        timestamp: Date.now(),
        _protocol: 'UF3-S-JSON'
      };

      // THIS emits the tag to your GUI and increments count
      this.emitTag(tag); 
    } else {
      // Other codes are just status/success (like code 1000), ignore for counting
      console.log(`[TcpReader] Received Control Message: Code ${msg.code}`);
    }
  }

  private processFrame(frame: Buffer) {
    if (frame.length < 5) {
      console.warn(`[TcpReader] Frame too short: ${frame.length} bytes`);
      return;
    }

    const len = frame[1];
    const cmd = frame[3];

    // Verify checksum (Len..Data)
    if (frame.length >= len + 2) {
      const calculatedChecksum = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));
      const receivedChecksum = frame[frame.length - 1];
      if (calculatedChecksum !== receivedChecksum) {
        console.warn(`[TcpReader] A0 Checksum mismatch! Calculated: 0x${calculatedChecksum.toString(16)}, Received: 0x${receivedChecksum.toString(16)}`);
        return;
      }
    }

    // Inventory / report commands
    if (cmd === 0x80 || cmd === 0x81 || cmd === 0x88 || cmd === 0x89 || cmd === 0x90 || cmd === 0x82) {
      this.extractAndEmitTag(frame, cmd);
    }
  }

  private extractAndEmitTag(frame: Buffer, cmd: number) {
    try {
      // Log frame for debugging
      const frameHex = frame.toString('hex').toUpperCase();
      const frameDisplay = frameHex.match(/.{1,2}/g)?.join(' ') || '';
      console.log(`[TcpReader] [A0] Parsing frame (${frame.length} bytes): ${frameDisplay}`);

      let rssi = 0;
      let epcStart = 4;
      let epcEnd = Math.min(frame.length - 1, 11); // Default ~7 bytes

      if (cmd === 0x80 || cmd === 0x89 || cmd === 0x8A) {
        if (frame.length > 5) {
          rssi = frame[4] * -1;
          epcStart = 5;
          epcEnd = Math.min(frame.length - 1, 12);
        }
      } else if (cmd === 0x81 || cmd === 0x88) {
        epcStart = 4;
        epcEnd = Math.min(frame.length - 1, 11);
      }

      const epcData = frame.subarray(epcStart, epcEnd);
      if (epcData.length === 0) {
        console.warn('[TcpReader] [A0] No EPC data found in frame');
        return;
      }

      let id = '';
      try {
        const textDecoded = epcData.toString('utf-8');
        if (textDecoded && /^[\x20-\x7E\n\r\t]+$/.test(textDecoded)) {
          id = textDecoded.trim();
        } else {
          id = epcData.toString('hex').toUpperCase();
        }
      } catch {
        id = epcData.toString('hex').toUpperCase();
      }

      if (!id || id.length === 0) {
        console.warn('[TcpReader] [A0] Failed to decode EPC');
        return;
      }

      const payloadStart = 2;
      const payloadEndExclusive = frame.length - 1; // Exclude checksum
      const fullPayload = frame.subarray(payloadStart, payloadEndExclusive);
      let idFull = '';
      try {
        idFull = fullPayload.toString('hex').toUpperCase();
      } catch {
        idFull = '';
      }

      if (!idFull) {
        try {
          idFull = frame.toString('hex').toUpperCase();
        } catch {
          idFull = '';
        }
      }

      this.emitTag({
        id: id,
        epc: id,
        id_full: idFull,
        timestamp: Date.now(),
        rssi: rssi,
        raw: frame,
        _protocol: 'A0'
      });
    } catch (err) {
      console.error('[TcpReader] [A0] Error extracting tag:', err);
    }
  }

  startScan() {
    try {
      if (!this.client || !this.client.writable) {
        console.error('[TcpReader] Socket not writable, cannot start scan. Socket state:', {
          clientExists: !!this.client,
          writable: this.client?.writable,
          connecting: this.client?.connecting,
          destroyed: this.client?.destroyed
        });
        throw new Error('TCP socket is not connected or writable');
      }
      
      // 0x89 = Real time inventory, 0xFF = keep reading
      const cmd = A0Protocol.encode(0x01, 0x89, [0xFF]);
      console.log('[TcpReader] Sending start scan command:', cmd.toString('hex'));
      this.emitRawData(cmd, 'TX');
      
      this.client.write(cmd, (err) => {
        if (err) {
          console.error('[TcpReader] Error writing start scan command:', err);
        } else {
          console.log('[TcpReader] Start scan command sent successfully');
        }
      });
    } catch (err) {
      console.error('[TcpReader] Error in startScan:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  stopScan() {
    try {
      if (!this.client || !this.client.writable) {
        console.error('[TcpReader] Socket not writable, cannot stop scan');
        throw new Error('TCP socket is not connected or writable');
      }

      const cmd = A0Protocol.encode(0x01, 0x8C); // 0x8C = Stop/Reset
      console.log('[TcpReader] Sending stop scan command:', cmd.toString('hex'));
      this.emitRawData(cmd, 'TX');
      
      this.client.write(cmd, (err) => {
        if (err) {
          console.error('[TcpReader] Error writing stop scan command:', err);
        } else {
          console.log('[TcpReader] Stop scan command sent successfully');
        }
      });
    } catch (err) {
      console.error('[TcpReader] Error in stopScan:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  async disconnect() {
    this.isManuallyDisconnected = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    this.client?.destroy();
    this.client = undefined;
  }

  readTag() {
    // Implementation of abstract method from ReaderManager
    // Tag reading is handled through the data event listener in connect()
  }

  /**
   * Factory method to create and connect a TCP reader
   * 
   * @param host - TCP server IP address (e.g., '192.168.1.100')
   * @param port - TCP server port (e.g., 5005, 8088)
   * @param emitter - RfidEventEmitter instance for event propagation
   * @returns Promise<TcpReader> - Connected reader instance
   */
  static async createAndConnect(host: string, port: number, emitter: any): Promise<TcpReader> {
    if (!host || typeof host !== 'string') {
      throw new Error('Invalid host: must be a valid IP address string');
    }
    if (!port || typeof port !== 'number' || port < 1 || port > 65535) {
      throw new Error('Invalid port: must be a number between 1 and 65535');
    }

    const reader = new TcpReader(host, port, emitter);
    console.log(`[TcpReader] Creating TCP connection to ${host}:${port}`);
    
    try {
      await reader.connect();
      console.log(`[TcpReader] ✓ Successfully connected to ${host}:${port}`);
      return reader;
    } catch (err) {
      console.error(`[TcpReader] ✗ Failed to connect to ${host}:${port}:`, err);
      throw err;
    }
  }
}

/**
 * Utility function to create and connect to a TCP RFID reader
 * 
 * Usage:
 *   const reader = await connectTcpReader('192.168.1.100', 5005, eventEmitter);
 *   reader.startScan();
 * 
 * @param host - TCP server IP address (e.g., '192.168.1.100')
 * @param port - TCP server port (e.g., 5005, 8088, 4001)
 * @param emitter - RfidEventEmitter instance for event propagation
 * @returns Promise<TcpReader> - Connected reader instance ready to use
 */
export async function connectTcpReader(
  host: string,
  port: number,
  emitter: any
): Promise<TcpReader> {
  try {
    console.log(`[connectTcpReader] Connecting to TCP reader at ${host}:${port}`);
    const reader = await TcpReader.createAndConnect(host, port, emitter);
    console.log(`[connectTcpReader] ✓ Connection established successfully`);
    return reader;
  } catch (err) {
    console.error(`[connectTcpReader] ✗ Connection failed:`, err);
    throw new Error(`Unable to connect to TCP reader at ${host}:${port} - ${err instanceof Error ? err.message : String(err)}`);
  }
}