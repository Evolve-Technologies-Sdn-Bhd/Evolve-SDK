import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { UF3SReader } from '../readers/UF3-SReader';
import { BBProtocolReader } from '../readers/BBProtocolReader';
import { AOProtocolReader } from '../readers/AOProtocolReader';
import { A0Protocol } from '../utils/A0Protocol';
import { BBProtocol } from '../utils/BBProtocol';

export type ProtocolType = 'UF3-S' | 'BB' | 'A0';

/**
 * SerialTransport - Manages serial port connection and delegates protocol parsing to appropriate reader
 *
 * Architecture:
 * SerialPort → SerialTransport (connection mgmt) → ProtocolReader (frame parsing) → EventBus
 *
 * Workflow:
 * 1. User selects protocol from dropdown (UF3-S, BB, or A0)
 * 2. SDK calls configure({ protocol: 'UF3-S' }) before connect()
 * 3. connect() opens serial port and initializes the appropriate reader
 * 4. startScan() sends protocol-specific commands and enables the reader
 * 5. Serial data arrives → handleIncomingData() → reader.injectData() → reader parses and emits tags
 * 6. stopScan() sends stop commands and disables the reader
 * 7. disconnect() closes serial port
 */
export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private isConnected: boolean = false;
  private scanTimeout?: NodeJS.Timeout;
  private protocolReader?: UF3SReader | BBProtocolReader | AOProtocolReader;
  private selectedProtocol: ProtocolType = 'A0';

  constructor(private path: string, private baud: number, emitter: any) {
    super(emitter);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[SerialTransport] Attempting connection to ${this.path} @ ${this.baud} baud (Protocol: ${this.selectedProtocol})`);

        this.port = new SerialPort({
          path: this.path,
          baudRate: this.baud,
          autoOpen: false
        });

        this.port.open((err) => {
          if (err) {
            console.error(`[SerialTransport] Failed to open port ${this.path}:`, err.message);
            this.isConnected = false;
            return reject(err);
          }

          console.log(`[SerialTransport] Successfully opened port ${this.path} @ ${this.baud} baud`);
          this.isConnected = true;

          // Initialize the appropriate protocol reader
          this.initializeProtocolReader();

          // Set up data handler
          this.port?.on('data', (data) => this.handleIncomingData(data));

          // Set up error handler
          this.port?.on('error', (err) => {
            console.error(`[SerialTransport] Port error:`, err.message);
            this.rfidEmitter.emitError(err);
          });

          // Set up close handler
          this.port?.on('close', () => {
            console.log(`[SerialTransport] Port closed: ${this.path}`);
            this.isConnected = false;
            this.rfidEmitter.emitDisconnected();
          });

          resolve();
        });
      } catch (err) {
        console.error(`[SerialTransport] Connection error:`, err);
        this.isConnected = false;
        reject(err);
      }
    });
  }

  /**
   * Initialize the appropriate protocol reader based on selectedProtocol
   */
  private initializeProtocolReader(): void {
    console.log(`[SerialTransport] Initializing ${this.selectedProtocol} protocol reader`);

    switch (this.selectedProtocol) {
      case 'UF3-S':
        this.protocolReader = new UF3SReader(this.rfidEmitter);
        break;
      case 'BB':
        this.protocolReader = new BBProtocolReader(this.rfidEmitter);
        break;
      case 'A0':
      default:
        this.protocolReader = new AOProtocolReader(this.rfidEmitter);
        break;
    }

    console.log(`[SerialTransport] ${this.selectedProtocol} reader initialized`);
  }

  /**
   * Handle incoming data from serial port
   * Passes data to the appropriate protocol reader
   */
  private handleIncomingData(data: Buffer): void {
    // Emit raw data for debugging
    const dataHex = data.toString('hex').toUpperCase();
    const hexFormatted = dataHex.match(/.{1,2}/g)?.join(' ') || '';
    console.log(`[SerialReader] Data received (${data.length} bytes): ${hexFormatted}`);

    this.emitRawData(data, 'RX');

    // Pass to protocol reader
    if (this.protocolReader) {
      this.protocolReader.injectData(data);
    } else {
      console.warn('[SerialReader] No protocol reader initialized');
    }
  }

  /**
   * Configure protocol selection - called before connection
   */
  async configure(settings: Record<string, any>): Promise<void> {
    if (settings.protocol) {
      const protocol = settings.protocol as ProtocolType;
      if (['UF3-S', 'BB', 'A0'].includes(protocol)) {
        this.selectedProtocol = protocol;
        console.log(`[SerialTransport] Protocol configured to: ${this.selectedProtocol}`);
      } else {
        console.warn(`[SerialTransport] Unknown protocol: ${protocol}, using default A0`);
      }
    }
  }

  // ========== ReaderManager Abstract Methods ==========

  readTag(): void {
    console.warn('[SerialTransport] readTag() is called, but reader is in continuous streaming mode');
  }

  startScan(): void {
    console.log(`[SerialTransport] Starting scan with ${this.selectedProtocol} protocol...`);
    try {
      if (!this.port || !this.port.isOpen) {
        console.error('[SerialTransport] Port is not open. Cannot start scanning.');
        throw new Error('Serial port is not open');
      }

      // Start the protocol reader
      if (this.protocolReader) {
        this.protocolReader.startScan();
      }

      // Send start command based on protocol
      const commands: Buffer[] = [];

      if (this.selectedProtocol === 'A0') {
        // A0 Protocol start commands
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01]));
        commands.push(A0Protocol.encode(0xFF, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01]));
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.MULTI_INVENTORY));
      } else if (this.selectedProtocol === 'BB') {
        // BB Protocol start command (Real-time mode 0x27)
        commands.push(BBProtocol.encode(0x00, BBProtocol.COMMANDS.REALTIME_INVENTORY));
      } else if (this.selectedProtocol === 'UF3-S') {
        // UF3-S typically starts automatically after connection
        console.log('[SerialTransport] UF3-S reader will start streaming automatically');
      }

      // Send commands
      console.log(`[SerialTransport] Sending ${commands.length} start command(s) to reader...`);
      for (const cmd of commands) {
        this.port.write(cmd, (err) => {
          if (err) {
            const proto = cmd[0] === 0xA0 ? 'A0' : 'BB';
            console.error(`[SerialTransport] Error sending ${proto} start command:`, err.message);
          }
        });
      }

      // Set timeout warning if no data received
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => {
        console.warn('[SerialTransport] ⚠️ No data received for 5 seconds');
        console.warn('[SerialTransport] Possible issues:');
        console.warn('[SerialTransport]   - Device not powered on');
        console.warn('[SerialTransport]   - Wrong COM port or baud rate');
        console.warn('[SerialTransport]   - Device not in read mode');
        console.warn('[SerialTransport]   - Cable not connected properly');
      }, 5000);
    } catch (err) {
      console.error('[SerialTransport] Error starting scan:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  stopScan(): void {
    console.log(`[SerialTransport] Stopping scan with ${this.selectedProtocol} protocol...`);
    try {
      // Clear timeout
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = undefined;
      }

      if (!this.port || !this.port.isOpen) {
        console.error('[SerialTransport] Port is not open. Cannot stop scanning.');
        throw new Error('Serial port is not open');
      }

      // Stop the protocol reader
      if (this.protocolReader) {
        this.protocolReader.stopScan();
      }

      // Send stop commands based on protocol
      const commands: Buffer[] = [];

      if (this.selectedProtocol === 'A0') {
        // A0 Protocol stop commands
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.STOP_INVENTORY));
        commands.push(A0Protocol.encode(0xFF, A0Protocol.COMMANDS.STOP_INVENTORY));
      } else if (this.selectedProtocol === 'BB') {
        // BB Protocol stop command
        commands.push(BBProtocol.encode(0x00, BBProtocol.COMMANDS.GET_READER_INFO));
      } else if (this.selectedProtocol === 'UF3-S') {
        // UF3-S may not need explicit stop command
        console.log('[SerialTransport] UF3-S reader stop initiated');
      }

      // Send commands
      console.log(`[SerialTransport] Sending ${commands.length} stop command(s) to reader...`);
      for (const cmd of commands) {
        this.port.write(cmd, (err) => {
          if (err) {
            const proto = cmd[0] === 0xA0 ? 'A0' : 'BB';
            console.error(`[SerialTransport] Error sending ${proto} stop command:`, err.message);
          }
        });
      }
    } catch (err) {
      console.error('[SerialTransport] Error stopping scan:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    console.log(`[SerialTransport] Disconnecting from ${this.path}...`);

    // Stop scanning first
    try {
      this.stopScan();
    } catch (err) {
      console.warn('[SerialTransport] Error stopping scan on disconnect:', err);
    }

    if (this.port?.isOpen) {
      return new Promise<void>((resolve, reject) => {
        this.port?.close((err) => {
          if (err) {
            console.error('[SerialTransport] Error closing port:', err);
            reject(err);
          } else {
            console.log('[SerialTransport] Port closed successfully');
            this.isConnected = false;
            this.protocolReader = undefined;
            resolve();
          }
        });
      });
    } else {
      console.log('[SerialTransport] Port already closed');
      this.protocolReader = undefined;
    }
  }

  isPortOpen(): boolean {
    return this.isConnected && this.port?.isOpen === true;
  }
}