import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { UF3SReader }  from '../readers/UF3-SProtocolReader';
import { UF3SProtocol } from '../utils/UF3SProtocol';
import { F5001ProtocolReader } from '../readers/F5001ProtocolReader';
import { AOProtocolReader } from '../readers/AOProtocolReader';
import { A0Protocol } from '../utils/A0Protocol';
import { F5001Protocol } from '../utils/F5001Protocol';
import { TagData } from '../events/EventBus';
import { createSdkError, wrapNativeError } from '../errors/RfidSdkError';

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
          if (err) {
            // Map serial error codes to structured errors
            const sdkError = wrapNativeError(err, 'PORT_NOT_AVAILABLE', {
              port: this.path,
              baudRate: this.baud,
            });
            this.rfidEmitter.emitError(sdkError);
            return reject(sdkError);
          }
          
          this.port?.set({ dtr: true, rts: true });
          this.isConnected = true;
          this.initializeProtocolReader();

          this.port?.on('data', (data) => this.handleIncomingData(data));
          
          this.port?.on('error', (err) => {
            const sdkError = wrapNativeError(err, 'SERIAL_IO_ERROR', {
              port: this.path,
            });
            this.rfidEmitter.emitError(sdkError);
          });
          
          this.port?.on('close', () => {
            this.isConnected = false;
            this.rfidEmitter.emitDisconnected();
          });

          resolve();
        });
      } catch (err: any) {
        const sdkError = wrapNativeError(err, 'PORT_NOT_AVAILABLE', {
          port: this.path,
          reason: err?.message,
        });
        this.rfidEmitter.emitError(sdkError);
        reject(sdkError);
      }
    });
  }

  private initializeProtocolReader(): void {
    switch (this.selectedProtocol) {
      case 'UF3-S': this.protocolReader = new UF3SReader(this.rfidEmitter); break;
      case 'F5001': this.protocolReader = new F5001ProtocolReader(this.rfidEmitter); break;
      case 'A0':    this.protocolReader = new AOProtocolReader(this.rfidEmitter); break;
      default:      this.protocolReader = new AOProtocolReader(this.rfidEmitter); break;
    }

    // ✅ RELAY tagRead events from protocolReader to SerialReader
    // This ensures cumulative stats are updated for serial transport
    if (this.protocolReader) {
      this.protocolReader.on('tagRead', (tag: TagData) => {
        this.emit('tagRead', tag);
      });
    }
  }

  private handleIncomingData(data: Buffer): void {
    // ⚠️ Do NOT emit raw data here - let protocol reader handle all parsing
    // This prevents duplicate entries in the data stream (3x → 1x)
    // emitRawData(data, 'RX');
    
    if (this.protocolReader) this.protocolReader.injectData(data);
  }

  async configure(settings: Record<string, any>): Promise<void> {
    if (settings.protocol) this.selectedProtocol = settings.protocol as ProtocolType;
  }

  async startScan(): Promise<void> {
    if (!this.port?.isOpen) return;
    if (this.protocolReader) this.protocolReader.startScan();
  
    if (this.selectedProtocol === 'F5001') {
      console.log('[SerialReader] Initiating F5001 Start Sequence...');
      const p0 = F5001Protocol.setInventoryParam0();
      this.port.write(p0);
      this.emitRawData(p0, 'TX');
      await new Promise(resolve => setTimeout(resolve, 100));

      const p1 = F5001Protocol.setInventoryParam1();
      this.port.write(p1);
      this.emitRawData(p1, 'TX');
      await new Promise(resolve => setTimeout(resolve, 100));

      const startCmd = F5001Protocol.startMultiEPC();
      console.log(`[SerialReader] TX START INVENTORY: ${startCmd.toString('hex').toUpperCase()}`);
      this.port.write(startCmd);
      this.emitRawData(startCmd, 'TX');
      console.log(`[SerialReader] Waiting for tag responses...`);
      
    } else if (this.selectedProtocol === 'UF3-S') {
      console.log('[SerialReader] Initiating UF3-S Start Sequence...');
      
      const antCmd = UF3SProtocol.encode(0x01, UF3SProtocol.COMMANDS.SET_ANTENNA, [0xFF]);
      this.port.write(antCmd);
      await new Promise(r => setTimeout(r, 100));

      const startCmd = UF3SProtocol.encode(0x01, UF3SProtocol.COMMANDS.REALTIME_INVENTORY, [0xFF]);
      this.port.write(startCmd);
      this.emitRawData(startCmd, 'TX');
    }
    else if (this.selectedProtocol === 'A0') {
      console.log('[SerialReader] Initiating A0 Start Sequence...');
      // Typical A0 start sequence: REALTIME_INVENTORY enable
      const rt1 = A0Protocol.encode(0xFF, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01]);
      const rt1Hex = rt1.toString('hex').toUpperCase();
      console.log(`[SerialReader] TX REALTIME_INVENTORY: ${rt1Hex}`);
      this.port.write(rt1);
      this.emitRawData(rt1, 'TX');
    }
    else {
      console.log('[SerialReader] Initiating UF3-S/A0 Start Sequence...');
      // Typical A0 start sequence: REALTIME_INVENTORY enable
      const rt1 = A0Protocol.encode(0xFF, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01]);
      const rt1Hex = rt1.toString('hex').toUpperCase();
      console.log(`[SerialReader] TX REALTIME_INVENTORY: ${rt1Hex}`);
      this.port.write(rt1);
      this.emitRawData(rt1, 'TX');
      // Optional multi-inventory kick
      const multi = A0Protocol.encode(0xFF, A0Protocol.COMMANDS.MULTI_INVENTORY, []);
      const multiHex = multi.toString('hex').toUpperCase();
      console.log(`[SerialReader] TX MULTI_INVENTORY: ${multiHex}`);
      this.port.write(multi);
      this.emitRawData(multi, 'TX');
      console.log(`[SerialReader] Waiting for tag responses...`);
    }
  }

  stopScan(): void {
    if (!this.port?.isOpen) return;
    if (this.selectedProtocol === 'F5001') {
      const stopCmd = F5001Protocol.stopMultiEPC();
      this.port.write(stopCmd);
      this.emitRawData(stopCmd, 'TX');
      setTimeout(() => {
        const clearCmd = F5001Protocol.clearBuffer();
        this.port?.write(clearCmd);
        this.emitRawData(clearCmd, 'TX');
      }, 50);
    } else {
      const stopCmd = A0Protocol.encode(0xFF, A0Protocol.COMMANDS.STOP_INVENTORY, []);
      const stopHex = stopCmd.toString('hex').toUpperCase();
      console.log(`[SerialReader] TX STOP_INVENTORY: ${stopHex}`);
      this.port.write(stopCmd);
      this.emitRawData(stopCmd, 'TX');
    }
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
