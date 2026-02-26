import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { UF3SReader } from '../readers/UF3-SReader';
import { F5001ProtocolReader } from '../readers/F5001ProtocolReader';
import { AOProtocolReader } from '../readers/AOProtocolReader';
import { A0Protocol } from '../utils/A0Protocol';
import { F5001Protocol } from '../utils/F5001Protocol';

export type ProtocolType = 'UF3-S' | 'F5001' | 'A0';

// ... (keep imports at the top)

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private isConnected: boolean = false;
  private scanInterval?: NodeJS.Timeout; 
  private protocolReader?: UF3SReader | F5001ProtocolReader | AOProtocolReader;
  private selectedProtocol: ProtocolType = 'A0'; 

  constructor(private path: string, private baud: number, emitter: any) {
    super(emitter);
  }

  // ... (keep connect and initializeProtocolReader as they are)

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[SerialTransport] Connecting to ${this.path} @ ${this.baud} (${this.selectedProtocol})`);

        this.port = new SerialPort({
          path: this.path,
          baudRate: this.baud,
          autoOpen: false,
          dataBits: 8, stopBits: 1, parity: 'none', rtscts: false,
        });

        this.port.open((err) => {
          if (err) return reject(err);
          
          this.port?.set({ dtr: true, rts: true });
          this.isConnected = true;
          this.initializeProtocolReader();

          this.port?.on('data', (data) => this.handleIncomingData(data));
          this.port?.on('error', (err) => this.rfidEmitter.emitError(err));
          this.port?.on('close', () => {
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
      case 'F5001': this.protocolReader = new F5001ProtocolReader(this.rfidEmitter); break;
      case 'A0':    
      default:      this.protocolReader = new AOProtocolReader(this.rfidEmitter); break;
    }
  }

  private handleIncomingData(data: Buffer): void {
    const dataHex = data.toString('hex').toUpperCase();
    const formatted = dataHex.match(/.{1,2}/g)?.join(' ') || '';
    
    // Log the data to console
    console.log(`[SerialReader] RX ${data.length} bytes: ${formatted}`);
    
    if (formatted.includes('BB 97')) {
      console.log('[SerialReader] ✓ TAG DETECTED (BB 97)');
    }

    this.emitRawData(data, 'RX');
    if (this.protocolReader) this.protocolReader.injectData(data);
  }

  async configure(settings: Record<string, any>): Promise<void> {
    if (settings.protocol) this.selectedProtocol = settings.protocol as ProtocolType;
  }

  /**
   * FIXED START SCAN
   * The sequence must be: Config Param 0 -> Config Param 1 -> Multi-EPC Inventory (0x17)
   */
  async startScan(): Promise<void> {
    if (!this.port?.isOpen) return;

    if (this.protocolReader) this.protocolReader.startScan();
    
    console.log('[SerialReader] Initiating F5001 Start Sequence...');

    // Step 1: Set Inventory Param 0
    const p0 = F5001Protocol.setInventoryParam0();
    this.port.write(p0);
    this.emitRawData(p0, 'TX');

    // Small delay for reader to process config
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 2: Set Inventory Param 1
    const p1 = F5001Protocol.setInventoryParam1();
    this.port.write(p1);
    this.emitRawData(p1, 'TX');

    // Small delay for reader to process config
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 3: THE ACTUAL INVENTORY START COMMAND (0x17)
    // We use the 0x17 command here. Ensure F5001Protocol.stopMultiEPC returns BB 17 02 00 00 19 0D 0A
    const startCmd = F5001Protocol.stopMultiEPC(); 
    
    console.log(`[SerialReader] TX START INVENTORY: ${startCmd.toString('hex').toUpperCase()}`);
    this.port.write(startCmd);
    this.emitRawData(startCmd, 'TX');
    
    console.log(`[SerialReader] Reader should now be scanning...`);
  }

  /**
   * STOP SCAN
   * Sends the toggle command (0x17) and clears the reader buffer
   */
  stopScan(): void {
    if (!this.port?.isOpen) return;

    // Send 0x17 to stop/toggle
    const stopCmd = F5001Protocol.stopMultiEPC();
    this.port.write(stopCmd);
    this.emitRawData(stopCmd, 'TX');

    // Clear buffer (0x18)
    setTimeout(() => {
      const clearCmd = F5001Protocol.clearBuffer();
      this.port?.write(clearCmd);
      this.emitRawData(clearCmd, 'TX');
    }, 50);

    if (this.protocolReader) this.protocolReader.stopScan();
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
  
  readTag(): void {}
  isPortOpen(): boolean { return this.isConnected && this.port?.isOpen === true; }
}