import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private buffer: Buffer = Buffer.alloc(0);
  private isConnected: boolean = false;
  private frameCount: number = 0;
  private scanTimeout?: NodeJS.Timeout;

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
    
    // Show data in hex format for clarity
    const dataHex = data.toString('hex').toUpperCase();
    const hexFormatted = dataHex.match(/.{1,2}/g)?.join(' ') || '';
    console.log(`[SerialReader] Data received (${data.length} bytes): ${hexFormatted}`);
    
    // Emit to data stream
    this.emitRawData(data, 'RX');
    
    // Minimum frame: A0 04 Addr Cmd CS (5 bytes)
    while (this.buffer.length >= 5) {
      if (this.buffer[0] !== A0Protocol.HEADER) {
        // Seek for header
        const invalidByte = this.buffer[0].toString(16).padStart(2, '0').toUpperCase();
        console.warn(`[SerialReader] ⚠️ Invalid header 0x${invalidByte}, searching for 0xA0...`);
        
        // Try to find A0 header in buffer
        let a0Index = -1;
        for (let i = 1; i < Math.min(this.buffer.length, 1000); i++) {
          if (this.buffer[i] === A0Protocol.HEADER) {
            a0Index = i;
            break;
          }
        }
        
        if (a0Index > 0) {
          console.log(`[SerialReader] Found 0xA0 at index ${a0Index}, skipping ${a0Index} bytes`);
          this.buffer = this.buffer.subarray(a0Index);
          continue;
        } else {
          console.warn(`[SerialReader] No 0xA0 header found in buffer, clearing ${this.buffer.length} bytes`);
          this.buffer = Buffer.alloc(0);
          break;
        }
      }

      const len = this.buffer[1];
      
      // Sanity check: length shouldn't be more than 1024
      if (len > 1024 || len < 3) {
        console.warn(`[SerialReader] Invalid length byte: 0x${len.toString(16)} (${len}), expected 3-1024`);
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      
      // Check if frame is complete
      if (this.buffer.length < len + 2) {
        console.log(`[SerialReader] Waiting for more data... (have ${this.buffer.length} bytes, need ${len + 2})`);
        break; // Wait for more data
      }

      // Extract complete frame
      const frame = this.buffer.subarray(0, len + 2);
      this.frameCount++;
      console.log(`[SerialReader] Frame #${this.frameCount} complete (${frame.length} bytes)`);
      
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
    if (frame.length < 5) {
      console.warn(`[SerialReader] Frame too short: ${frame.length} bytes`);
      return;
    }

    const header = frame[0];
    const len = frame[1];
    const address = frame[2];
    const cmd = frame[3];
    
    console.log(`[SerialReader] Processing: Cmd=0x${cmd.toString(16)}, Len=${len}, Address=0x${address.toString(16)}`);

    // Verify checksum
    if (frame.length >= len + 2) {
      const calculatedChecksum = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));
      const receivedChecksum = frame[frame.length - 1];
      
      if (calculatedChecksum !== receivedChecksum) {
        console.warn(`[SerialReader] ⚠️ Checksum mismatch! Calculated: 0x${calculatedChecksum.toString(16)}, Received: 0x${receivedChecksum.toString(16)}`);
        return;
      }
    }
    
    // Handle inventory report commands - common codes for tag data responses
    if (cmd === 0x80 || cmd === 0x81 || cmd === 0x88 || cmd === 0x89 || cmd === 0x90) { 
      this.extractAndEmitTag(frame, cmd);
    } else if (cmd === 0x82) {
      // Module info response - may contain tag data in extended format
      console.log(`[SerialReader] Module info response (0x82)`);
      this.extractAndEmitTag(frame, cmd);
    } else {
      console.log(`[SerialReader] Unrecognized command: 0x${cmd.toString(16)}`);
    }
  }

  private extractAndEmitTag(frame: Buffer, cmd: number) {
    try {
      if (frame.length < 5) {
        console.warn(`[SerialReader] Frame too short to extract tag`);
        return;
      }

      // Log the complete frame for debugging
      const frameHex = frame.toString('hex').toUpperCase();
      const frameDisplay = frameHex.match(/.{1,2}/g)?.join(' ') || '';
      console.log(`[SerialReader] Parsing frame (${frame.length} bytes): ${frameDisplay}`);

      // Different commands have different data layouts
      let rssi = 0;
      let epcStart = 4;
      let epcEnd = frame.length - 1; // Exclude checksum

      // Try to parse RSSI at byte 4 for common commands
      if (cmd === 0x80 || cmd === 0x89 || cmd === 0x8A) {
        // Typical format: Command at byte 3, RSSI at byte 4, EPC starts at byte 5
        if (frame.length > 5) {
          rssi = frame[4] * -1;
          epcStart = 5;
          console.log(`[SerialReader] Format: RSSI at byte 4 (value: ${frame[4]}), EPC starts at byte 5`);
        }
      } else if (cmd === 0x81 || cmd === 0x88) {
        // Alternative format: data starts at byte 4
        epcStart = 4;
        console.log(`[SerialReader] Format: EPC starts at byte 4`);
      }

      // Extract EPC
      const epcData = frame.subarray(epcStart, epcEnd);
      console.log(`[SerialReader] EPC raw bytes (${epcData.length} bytes): ${epcData.toString('hex').toUpperCase()}`);
      
      if (epcData.length === 0) {
        console.warn(`[SerialReader] No EPC data found in frame`);
        return;
      }

      let id = '';
      try {
        const textDecoded = epcData.toString('utf-8');
        // Check if it's valid UTF-8 and mostly printable characters
        if (textDecoded && /^[\x20-\x7E\n\r\t]+$/.test(textDecoded)) {
          id = textDecoded.trim();
          console.log(`[SerialReader] Decoded as UTF-8 text: ${id}`);
        } else {
          id = epcData.toString('hex').toUpperCase();
          console.log(`[SerialReader] Decoded as HEX: ${id}`);
        }
      } catch {
        id = epcData.toString('hex').toUpperCase();
        console.log(`[SerialReader] Decoded as HEX (fallback): ${id}`);
      }

      if (!id || id.length === 0) {
        console.warn(`[SerialReader] Failed to decode EPC`);
        return;
      }
      
      console.log(`[SerialReader] ✓ Tag detected - EPC: ${id}, RSSI: ${rssi}dBm`);
      
      this.emitTag({
        id: id,
        timestamp: Date.now(),
        rssi: rssi,
        raw: frame
      });
    } catch (err) {
      console.error(`[SerialReader] Error extracting tag:`, err);
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
    try {
      if (!this.port || !this.port.isOpen) {
        console.error('[SerialReader] ❌ Port not open. Cannot start scanning.');
        throw new Error('Serial port is not open');
      }

      // Send start inventory command (0x88)
      const command = A0Protocol.encode(0x01, 0x88, [0xFF]);
      console.log('[SerialReader] Sending start command');
      
      this.port.write(command, (err) => {
        if (err) {
          console.error('[SerialReader] Error sending start command:', err.message);
        } else {
          console.log('[SerialReader] ✓ Start command sent');
        }
      });

      // Set timeout to warn if no data received after 5 seconds
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => {
        if (this.frameCount === 0) {
          console.warn('[SerialReader] ⚠️ No data received for 5 seconds');
          console.warn('[SerialReader] Possible issues:');
          console.warn('[SerialReader]   - Device not powered on');
          console.warn('[SerialReader]   - Wrong COM port or baud rate');
          console.warn('[SerialReader]   - Device not in read mode');
          console.warn('[SerialReader]   - Cable not connected properly');
        }
      }, 5000);
    } catch (err) {
      console.error('[SerialReader] Error in startScan:', err instanceof Error ? err.message : err);
      throw err;
    }
  }

  stopScan() { 
    console.log('[SerialReader] Stopping scan...');
    try {
      // Clear timeout
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = undefined;
      }

      if (!this.port || !this.port.isOpen) {
        console.error('[SerialReader] ❌ Port not open. Cannot stop scanning.');
        throw new Error('Serial port is not open');
      }

      // Send stop inventory command (0x89)
      const command = A0Protocol.encode(0x01, 0x89);
      console.log('[SerialReader] Sending stop command');
      
      this.port.write(command, (err) => {
        if (err) {
          console.error('[SerialReader] Error sending stop command:', err.message);
        } else {
          console.log('[SerialReader] ✓ Stop command sent');
        }
      });

      console.log(`[SerialReader] Scan complete - received ${this.frameCount} frames`);
      this.frameCount = 0;
    } catch (err) {
      console.error('[SerialReader] Error in stopScan:', err instanceof Error ? err.message : err);
      throw err;
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