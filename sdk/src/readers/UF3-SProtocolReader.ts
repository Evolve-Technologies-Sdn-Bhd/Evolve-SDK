import { EventEmitter } from 'events';
import { UF3SProtocol } from '../utils/UF3SProtocol';

export class UF3SReader extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private rfidEmitter: any) {
    super();
  }

  /**
   * Injects raw bytes from Serial/TCP into the parser
   */
  public injectData(data: Buffer): void {

    if (data[0] === 0x7B) { // '{' indicates JSON format
      try {
        const jsonStr = data.toString('utf-8').trim(); 
        const jsonObj = JSON.parse(jsonStr);
        this.emit('jsonRead', jsonObj);
      } catch (err) {
        console.error('[UF3-S] JSON Parse Error:', err);
      }
    } else {
      this.buffer = Buffer.concat([this.buffer, data]);

      while (this.buffer.length >= 5) {
        if (this.buffer[0] !== UF3SProtocol.HEADER) {
          this.buffer = this.buffer.subarray(1);
          continue;
        }

        const len = this.buffer[1];
        if (this.buffer.length < len + 2) break; // Wait for full frame

        const frame = this.buffer.subarray(0, len + 2);
        this.processFrame(frame);
        this.buffer = this.buffer.subarray(len + 2);
      }
    }
  }

  private processFrame(frame: Buffer): void {
    const cmd = frame[3];
    const data = frame.subarray(4, frame.length - 1);

    // 0x89 or 0x80 are tag report commands
    if (cmd === 0x89 || cmd === 0x80) {
      this.parseTag(frame, cmd);
    }
  }

  private parseTag(frame: Buffer, cmd: number): void {
    try {
      // UF3-S Format: [Header, Len, Addr, Cmd, RSSI, PC, EPC..., CS]
      // Note: Length varies based on EPC length
      const rssi = frame[4] * -1;
      const epc = frame.subarray(7, frame.length - 1).toString('hex').toUpperCase();

      if (epc) {
        const tag = {
          id: epc,
          epc: epc,
          rssi: rssi,
          timestamp: Date.now(),
          _protocol: 'UF3-S'
        };
        this.emit('tagRead', tag);
        this.rfidEmitter.emitTag(tag);
      }
    } catch (err) {
      console.error('[UF3-S] Parse Error:', err);
    }
  }


  public startScan(): string {
      // Most UF3-S JSON readers start with this command
      // code 1011 = Start Inventory
      return JSON.stringify({
          code: 1011,
          data: {
              antennaEnable: 1, // Change to [1,2,3,4,5,6,7,8] for all 8 ports
              inventoryMode: 1
          }
      }) + "$";
  }

  public stopScan(): Buffer {
    return UF3SProtocol.encode(0x01, UF3SProtocol.COMMANDS.STOP_INVENTORY, []);
  }
}