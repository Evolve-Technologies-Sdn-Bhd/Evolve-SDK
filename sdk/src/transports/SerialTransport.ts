import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { UF3SReader } from '../readers/UF3-SReader';
import { BBProtocolReader } from '../readers/BBProtocolReader';
import { AOProtocolReader } from '../readers/AOProtocolReader';
import { A0Protocol } from '../utils/A0Protocol';

export type ProtocolType = 'UF3-S' | 'BB' | 'A0';

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private isConnected: boolean = false;
  private scanTimeout?: NodeJS.Timeout;
  private protocolReader?: UF3SReader | BBProtocolReader | AOProtocolReader;
  private selectedProtocol: ProtocolType = 'A0'; // Default, will be overwritten by configure()

  constructor(private path: string, private baud: number, emitter: any) {
    super(emitter);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[SerialTransport] Connecting to ${this.path} @ ${this.baud} (Protocol: ${this.selectedProtocol})`);

        this.port = new SerialPort({
          path: this.path,
          baudRate: this.baud,
          autoOpen: false,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          rtscts: false, // Handle manually if needed
        });

        this.port.open((err) => {
          if (err) {
            console.error(`[SerialTransport] Open error:`, err.message);
            this.isConnected = false;
            return reject(err);
          }

          // Assert signals to wake up RS232 converters
          this.port?.set({ dtr: true, rts: true });

          console.log(`[SerialTransport] Port opened successfully`);
          this.isConnected = true;

          // Initialize the specific reader logic
          this.initializeProtocolReader();

          this.port?.on('data', (data) => this.handleIncomingData(data));
          
          this.port?.on('error', (err) => {
            console.error(`[SerialTransport] Port Error:`, err.message);
            this.rfidEmitter.emitError(err);
          });

          this.port?.on('close', () => {
            console.log(`[SerialTransport] Port closed`);
            this.isConnected = false;
            this.rfidEmitter.emitDisconnected();
          });

          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private initializeProtocolReader(): void {
    switch (this.selectedProtocol) {
      case 'UF3-S': this.protocolReader = new UF3SReader(this.rfidEmitter); break;
      case 'BB':    this.protocolReader = new BBProtocolReader(this.rfidEmitter); break;
      case 'A0':    
      default:      this.protocolReader = new AOProtocolReader(this.rfidEmitter); break;
    }
  }

  private handleIncomingData(data: Buffer): void {
    // 1. Log Raw Hex for debugging (Crucial step)
    // const hex = data.toString('hex').toUpperCase();
    // console.log(`[RX] ${hex}`); 

    this.emitRawData(data, 'RX'); // Send to GUI Console

    if (this.protocolReader) {
      this.protocolReader.injectData(data);
    }
  }

  async configure(settings: Record<string, any>): Promise<void> {
    if (settings.protocol) {
      this.selectedProtocol = settings.protocol as ProtocolType;
    }
  }

  // ========== COMMANDS ==========

  readTag(): void { /* Streaming mode only */ }

  startScan(): void {
    console.log(`[SerialTransport] Starting scan (${this.selectedProtocol})...`);
    if (!this.port || !this.port.isOpen) return;

    if (this.protocolReader) this.protocolReader.startScan();

    const commands: Buffer[] = [];

    if (this.selectedProtocol === 'A0') {
      // A0 Start: 0x88 (Realtime) with param 0xFF (Repeat)
      commands.push(A0Protocol.encode(0xFF, 0x88, [0xFF])); 
    } 
    else if (this.selectedProtocol === 'BB') {
      // --- FIX: EXACT RAW BYTES FOR F5001 MULTI-READ ---
      // Format: BB 00 27 00 03 22 27 10 83 7E (Sanray) OR 
      // Format: BB 00 27 00 00 27 0D 0A (F5001 Standard)
      
      // Let's try the F5001 specific "Realtime Inventory" command
      // Header(1) Type(1) Cmd(1) Len(2) Check(1) End(2)
      // Cmd 0x27 = Multi Tag Inventory
      const cmd = Buffer.from([0xBB, 0x00, 0x27, 0x00, 0x00, 0x27, 0x0D, 0x0A]);
      commands.push(cmd);
    }

    // Send Commands
    commands.forEach(cmd => {
      console.log(`[TX] ${cmd.toString('hex').toUpperCase()}`);
      this.port?.write(cmd);
    });

    // Reset Watchdog
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.scanTimeout = setTimeout(() => {
      console.warn('[SerialTransport] ⚠️ No tag data received yet.');
    }, 5000);
  }

  stopScan(): void {
    console.log(`[SerialTransport] Stopping scan...`);
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    if (!this.port || !this.port.isOpen) return;

    if (this.protocolReader) this.protocolReader.stopScan();

    const commands: Buffer[] = [];

    if (this.selectedProtocol === 'A0') {
      commands.push(A0Protocol.encode(0xFF, 0x89)); // Stop
    } else if (this.selectedProtocol === 'BB') {
      // BB Stop Command (0x28 or just stop reading)
      // BB 00 28 00 00 28 0D 0A
      commands.push(Buffer.from([0xBB, 0x00, 0x28, 0x00, 0x00, 0x28, 0x0D, 0x0A]));
    }

    commands.forEach(cmd => this.port?.write(cmd));
  }

  async disconnect(): Promise<void> {
    this.stopScan();
    if (this.port?.isOpen) {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.port?.close(() => {
            this.isConnected = false;
            resolve();
          });
        }, 100);
      });
    }
  }
}