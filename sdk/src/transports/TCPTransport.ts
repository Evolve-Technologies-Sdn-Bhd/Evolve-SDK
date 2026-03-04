import net from 'net';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class TcpReader extends ReaderManager {
  private client?: net.Socket;
  private bufJson = '';               // JSON stream buffer ($-delimited)
  private bufA0: Buffer = Buffer.alloc(0); // Fallback A0 buffer
  private retryCount = 0;
  private maxRetries = 3;
  private retryTimeout?: NodeJS.Timeout;
  private isManuallyDisconnected = false;
  private connectTimeoutMs = 12000;
  private frameCount = 0;

  // Debug mode
  private debug = false;

  // Simple state machine
  private state: ReaderState = ReaderState.DISCONNECTED;

  // Pending command resolvers by code
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timeout: NodeJS.Timeout }>();

  // Command map (can be overridden via configure)
  private commands: CommandMap = {
    ANTENNA_ENABLE: 2005,
    ANTENNA_DISABLE: 2005,
    INVENTORY_START: 2006,
    INVENTORY_STOP: 2007,
    GET_MODE: 2010,
    SET_MODE: 2011
  };

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
        this.bufA0 = Buffer.alloc(0);
        this.bufJson = '';

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
          this.log(`[TcpReader] Connected to ${this.host}:${this.port}`);
          this.emit('connected');
          this.state = ReaderState.CONNECTED;
          if (!hasSettled) {
            hasSettled = true;
            this.retryCount = 0;
            resolve();
          }
          // Kick off initialization once the promise has resolved
          this.initialize().catch(err => this.log(`[TcpReader] Initialization error: ${err?.message || err}`, 'error'));
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

          this.log(`[TcpReader] Socket error: ${err?.message || err}`, 'error');
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
          this.state = ReaderState.DISCONNECTED;
        });
      };

      attemptConnection();
    });
  }

  private log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    if (level === 'error') {
      console.error(msg);
      return;
    }
    if (level === 'warn') {
      console.warn(msg);
      return;
    }
    if (this.debug) {
      console.log(msg);
    }
  }

  // Configure debug and command map
  async configure(settings: Record<string, any>): Promise<void> {
    if (typeof settings?.debug === 'boolean') this.debug = settings.debug;
    if (settings?.commands && typeof settings.commands === 'object') {
      this.commands = { ...this.commands, ...settings.commands };
    }
  }

  // Initialize device after connection
  private async initialize(): Promise<void> {
    if (!this.client || !this.client.writable) return;
    if (this.state !== ReaderState.CONNECTED && this.state !== ReaderState.READY) return;
    this.log('[TcpReader] Starting initialization sequence...');

    // Optional: query working mode then set to manual (0)
    try {
      await this.sendCommand(this.commands.GET_MODE);
    } catch { /* ignore */ }
    try {
      await this.sendCommand(this.commands.SET_MODE, { mode: 0 });
    } catch { /* ignore */ }

    // Ensure antenna enabled state is known (do not start inventory here)
    try {
      await this.sendCommand(this.commands.ANTENNA_ENABLE, { antennaEnable: 1 });
    } catch { /* ignore */ }

    this.state = ReaderState.READY;
    this.log('[TcpReader] Initialization complete. Reader is READY.');
  }

  // Core sendCommand for JSON $-delimited protocol
  private sendCommand(code: number, data?: Record<string, any>, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.writable) return reject(new Error('Socket not connected'));

      const payload = JSON.stringify(data ? { code, data } : { code });
      const frame = `${payload}$`;

      // If another command with same code is pending, reject the previous one
      if (this.pending.has(code)) {
        const p = this.pending.get(code)!;
        clearTimeout(p.timeout);
        p.reject(new Error(`Pending command with code ${code} was superseded`));
        this.pending.delete(code);
      }

      const timer = setTimeout(() => {
        this.pending.delete(code);
        reject(new Error(`Timeout waiting for response to code ${code}`));
      }, timeoutMs);

      this.pending.set(code, { resolve, reject, timeout: timer });
      this.log(`[TcpReader] → ${frame.trim()}`);
      this.emitRawData(frame, 'TX');
      this.client.write(frame, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(code);
          reject(err);
        }
      });
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
      this.log(`[TcpReader] Connection failed: ${error.message}. Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
      this.retryTimeout = setTimeout(attemptConnection, delay);
    } else {
      this.log(`[TcpReader] Failed to connect after ${this.maxRetries} attempts. Giving up.`, 'error');
      if (this.listenerCount('error') > 0) {
        this.emit('error', new Error(`Connection failed after ${this.maxRetries} attempts: ${error.message}`));
      }
      onMaxRetriesExceeded();
    }
  }

  private handleIncomingData(data: Buffer) {
    this.emitRawData(data, 'RX');

    // Case A: JSON Mode ($-delimited frames)
    const text = data.toString('utf-8');
    if (text.includes('{') || this.bufJson.includes('{')) {
      this.bufJson += text;
      while (this.bufJson.includes('$')) {
        const idx = this.bufJson.indexOf('$');
        const message = this.bufJson.slice(0, idx);
        this.bufJson = this.bufJson.slice(idx + 1);
        const trimmed = message.trim();
        if (!trimmed) continue;
        this.log(`[TcpReader] ← ${trimmed}`);
        try {
          const parsed = JSON.parse(trimmed);
          this.processJsonMessage(parsed);
        } catch (e) {
          this.log(`[TcpReader] Invalid JSON frame: ${trimmed}`, 'error');
        }
      }
      return;
    }

    // Case B: Hex/Binary Mode (Original A0 logic)
    this.bufA0 = Buffer.concat([this.bufA0, data]);
    while (this.bufA0.length >= 5) {
      if (this.bufA0[0] !== 0xA0) {
        this.bufA0 = this.bufA0.subarray(1);
        continue;
      }
      const len = this.bufA0[1];
      if (this.bufA0.length < len + 2) break; 

      const frame = this.bufA0.subarray(0, len + 2);
      this.processFrame(frame); // Your existing binary parser
      this.bufA0 = this.bufA0.subarray(len + 2);
    }
  }

  // Logic to process the JSON format and count tags correctly
  private processJsonMessage(msg: any) {
    // Resolve pending command by exact code
    if (typeof msg?.code === 'number' && this.pending.has(msg.code)) {
      const p = this.pending.get(msg.code)!;
      clearTimeout(p.timeout);
      this.pending.delete(msg.code);
      p.resolve(msg);
    }

    // code 1001 = Tag Inventory Result in UF3 JSON protocol (stream)
    if (msg.code === 1001 && msg.data) {
      const epc = msg.data.epc;
      const rssi = msg.data.rssi || 0;

      const tag = {
        id: epc,
        epc: epc,
        id_full: epc,
        rssi: rssi,
        timestamp: Date.now(),
        raw: Buffer.from(JSON.stringify(msg))
      };

      // THIS emits the tag to your GUI and increments count
      this.emitTag(tag); 
      // Transition into running state on first tag received
      if (this.state !== ReaderState.INVENTORY_RUNNING) {
        this.state = ReaderState.INVENTORY_RUNNING;
      }
    } else {
      // Other codes are control/status (e.g., 1000 ack)
      this.log(`[TcpReader] Control Message: Code ${msg.code}`);
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
      this.log(`[TcpReader] [A0] Parsing frame (${frame.length} bytes): ${frameDisplay}`);

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
        this.log('[TcpReader] [A0] No EPC data found in frame', 'warn');
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
        this.log('[TcpReader] [A0] Failed to decode EPC', 'warn');
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
        raw: frame
      });
    } catch (err) {
      this.log(`[TcpReader] [A0] Error extracting tag: ${err}`, 'error');
    }
  }

  startScan() {
    if (!this.client || !this.client.writable) {
      this.log('[TcpReader] Socket not writable, cannot start scan', 'error');
      throw new Error('TCP socket is not connected or writable');
    }
    if (this.state !== ReaderState.READY && this.state !== ReaderState.INITIALIZED) {
      this.log(`[TcpReader] Cannot start inventory from state ${ReaderState[this.state]}`, 'warn');
    }
    this.log('[TcpReader] Starting continuous inventory...');
    this.sendCommand(this.commands.ANTENNA_ENABLE, { antennaEnable: 1 })
      .then(() => this.sendCommand(this.commands.SET_MODE, { mode: 0 }).catch(() => {}))
      .then(() => this.sendCommand(this.commands.INVENTORY_START))
      .then(() => {
        this.state = ReaderState.INVENTORY_RUNNING;
        this.log('[TcpReader] Inventory command acknowledged; waiting for tag stream...');
      })
      .catch(err => this.log(`[TcpReader] Start inventory error: ${err?.message || err}`, 'error'));
  }

  stopScan() {
    if (!this.client || !this.client.writable) {
      this.log('[TcpReader] Socket not writable, cannot stop scan', 'error');
      throw new Error('TCP socket is not connected or writable');
    }
    this.log('[TcpReader] Stopping inventory...');
    this.sendCommand(this.commands.INVENTORY_STOP)
      .then(() => this.sendCommand(this.commands.ANTENNA_DISABLE, { antennaEnable: 0 }).catch(() => {}))
      .then(() => {
        this.state = ReaderState.READY;
        this.log('[TcpReader] Inventory stopped; reader is READY');
      })
      .catch(err => this.log(`[TcpReader] Stop inventory error: ${err?.message || err}`, 'error'));
  }

  async disconnect() {
    this.isManuallyDisconnected = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    this.client?.destroy();
    this.client = undefined;
    this.state = ReaderState.DISCONNECTED;
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

// Reader state machine
enum ReaderState {
  DISCONNECTED,
  CONNECTED,
  INITIALIZED,
  READY,
  INVENTORY_RUNNING
}

// Command map type for JSON protocol
type CommandMap = {
  ANTENNA_ENABLE: number;
  ANTENNA_DISABLE: number;
  INVENTORY_START: number;
  INVENTORY_STOP: number;
  GET_MODE: number;
  SET_MODE: number;
};

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
