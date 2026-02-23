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
    
    // Process frames: Support both A0 protocol (0xA0 header) and BB protocol (0xBB header)
    while (this.buffer.length >= 5) {
      const header = this.buffer[0];
      
      // 📋 PROTOCOL DETECTION
      if (header === A0Protocol.HEADER) {
        // ✅ A0 PROTOCOL: A0 <len> <addr> <cmd> [...payload...] <checksum>
        console.log(`[SerialReader] ✓ A0 Protocol frame detected`);
        
        const len = this.buffer[1];
        
        // Sanity check: length shouldn't be more than 1024
        if (len > 1024 || len < 3) {
          console.warn(`[SerialReader] Invalid A0 length byte: 0x${len.toString(16)} (${len}), expected 3-1024`);
          this.buffer = this.buffer.subarray(1);
          continue;
        }
        
        // Check if frame is complete
        if (this.buffer.length < len + 2) {
          console.log(`[SerialReader] Waiting for more A0 data... (have ${this.buffer.length} bytes, need ${len + 2})`);
          break; // Wait for more data
        }

        // Extract complete frame
        const frame = this.buffer.subarray(0, len + 2);
        this.frameCount++;
        console.log(`[SerialReader] Frame #${this.frameCount} complete (${frame.length} bytes, A0 protocol)`);
      
        try {
          this.processFrame(frame, 'A0');
        } catch (err) {
          console.error(`[SerialReader] Error processing A0 frame:`, err);
        }

        // Remove processed frame from buffer
        this.buffer = this.buffer.subarray(len + 2);
        
      } else if (header === 0xBB) {
        // ✅ BB PROTOCOL: BB <len> [...payload...] <checksum>
        // ⚠️ NOTE: BB frames may be concatenated with 0x0D 0x0A (CR+LF) separators
        console.log(`[SerialReader] ✓ BB Protocol frame detected`);
        
        const len = this.buffer[1];
        const totalFrameLength = len + 2; // BB + len + payload + checksum
        
        // Sanity check
        if (len > 1024 || len < 3) {
          console.warn(`[SerialReader] Invalid BB length byte: 0x${len.toString(16)} (${len}), expected 3-1024`);
          this.buffer = this.buffer.subarray(1);
          continue;
        }
        
        // Check if frame is complete
        if (this.buffer.length < totalFrameLength) {
          console.log(`[SerialReader] Waiting for more BB data... (have ${this.buffer.length} bytes, need ${totalFrameLength})`);
          break; // Wait for more data
        }
        
        // Extract complete BB frame
        const frame = this.buffer.subarray(0, totalFrameLength);
        this.frameCount++;
        console.log(`[SerialReader] Frame #${this.frameCount} complete (${frame.length} bytes, BB protocol)`);
        
        try {
          this.processFrame(frame, 'BB');
        } catch (err) {
          console.error(`[SerialReader] Error processing BB frame:`, err);
        }
        
        // Remove processed frame from buffer
        this.buffer = this.buffer.subarray(totalFrameLength);
        
        // 🔍 Check for concatenated frames: Skip 0x0D 0x0A (CR+LF) separators
        if (this.buffer.length >= 2 && this.buffer[0] === 0x0D && this.buffer[1] === 0x0A) {
          console.log(`[SerialReader] Skipping CR+LF separator (0x0D 0x0A)`);
          this.buffer = this.buffer.subarray(2);
        }
        
      } else {
        // ❌ UNKNOWN PROTOCOL
        const invalidByte = this.buffer[0].toString(16).padStart(2, '0').toUpperCase();
        console.warn(`[SerialReader] ⚠️ Unknown protocol header: 0x${invalidByte} (${this.buffer[0]})`);
        console.warn(`[SerialReader] Looking for A0 (0xA0) or BB (0xBB) headers...`);
        
        // Search for next valid header (A0 or BB)
        let nextHeaderIndex = -1;
        for (let i = 1; i < Math.min(this.buffer.length, 1000); i++) {
          if (this.buffer[i] === A0Protocol.HEADER || this.buffer[i] === 0xBB) {
            nextHeaderIndex = i;
            const foundProtocol = this.buffer[i] === A0Protocol.HEADER ? 'A0' : 'BB';
            console.log(`[SerialReader] Found ${foundProtocol} header at index ${i}, skipping ${i} bytes`);
            break;
          }
        }
        
        if (nextHeaderIndex > 0) {
          this.buffer = this.buffer.subarray(nextHeaderIndex);
          continue;
        } else {
          console.warn(`[SerialReader] No valid headers found in buffer (${this.buffer.length} bytes), clearing buffer`);
          this.buffer = Buffer.alloc(0);
          break;
        }
      }
    }
  }
  
  private processFrame(frame: Buffer, protocol: 'A0' | 'BB') {
    if (frame.length < 5) {
      console.warn(`[SerialReader] ${protocol} frame too short: ${frame.length} bytes`);
      return;
    }

    const header = frame[0];
    const len = frame[1];
    
    console.log(`[SerialReader] Processing ${protocol} frame: Header=0x${header.toString(16)}, Len=${len}`);

    if (protocol === 'A0') {
      // A0 Protocol frame parsing
      const address = frame[2];
      const cmd = frame[3];
      
      console.log(`[SerialReader] A0 Details: Cmd=0x${cmd.toString(16)}, Address=0x${address.toString(16)}`);

      // Verify checksum
      if (frame.length >= len + 2) {
        const calculatedChecksum = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));
        const receivedChecksum = frame[frame.length - 1];
        
        if (calculatedChecksum !== receivedChecksum) {
          console.warn(`[SerialReader] ⚠️ A0 Checksum mismatch! Calculated: 0x${calculatedChecksum.toString(16)}, Received: 0x${receivedChecksum.toString(16)}`);
          return;
        }
      }
      
      // Handle inventory report commands - common codes for tag data responses
      if (cmd === 0x80 || cmd === 0x81 || cmd === 0x88 || cmd === 0x89 || cmd === 0x90) {
        this.extractAndEmitTag(frame, cmd, protocol);
      } else if (cmd === 0x82) {
        // Module info response - may contain tag data in extended format
        console.log(`[SerialReader] A0 Module info response (0x82)`);
        this.extractAndEmitTag(frame, cmd, protocol);
      } else {
        console.log(`[SerialReader] A0 Unrecognized command: 0x${cmd.toString(16)}`);
      }
      
    } else if (protocol === 'BB') {
      // BB Protocol frame parsing
      // Frame structure: BB <len> [payload...] <checksum>
      // Common format: BB <len> <rssi> [EPC bytes (6-7 bytes)] [additional data...] <checksum>
      
      const dataLen = len - 1; // Exclude checksum byte
      const payload = frame.subarray(2, 1 + dataLen);
      
      console.log(`[SerialReader] [BB] Payload (${payload.length} bytes): ${payload.toString('hex').toUpperCase()}`);
      
      // Extract for EPC-only format (more reliable for unique tracking)
      this.extractAndEmitTag(frame, 0xBB, protocol);
    }
  }
  
  private extractAndEmitTag(frame: Buffer, cmdOrProtocol: number | string, protocol?: 'A0' | 'BB') {
    const protocolName = protocol || 'A0';
    const cmd = typeof cmdOrProtocol === 'number' ? cmdOrProtocol : 0xBB;
    
    try {
      if (frame.length < 5) {
        console.warn(`[SerialReader] ${protocolName} frame too short to extract tag`);
        return;
      }

      // Log the complete frame for debugging
      const frameHex = frame.toString('hex').toUpperCase();
      const frameDisplay = frameHex.match(/.{1,2}/g)?.join(' ') || '';
      console.log(`[SerialReader] [${protocolName}] Parsing frame (${frame.length} bytes): ${frameDisplay}`);

      let rssi = 0;
      let epcStart = 4;
      let epcEnd = Math.min(frame.length - 1, 11); // 🔧 FIX: Standardized to extract only ~7 bytes (indices 4-11)

      if (protocolName === 'A0') {
        // A0 Protocol: Different commands have different data layouts
        // ⚠️ NORMALIZATION: Extract RSSI and standardize EPC extraction
        if (cmd === 0x80 || cmd === 0x89 || cmd === 0x8A) {
          // Typical format: Command at byte 3, RSSI at byte 4, EPC starts at byte 5
          if (frame.length > 5) {
            rssi = frame[4] * -1;
            epcStart = 5;
            epcEnd = Math.min(frame.length - 1, 12); // 🔧 Extract ~7 bytes from byte 5
            console.log(`[SerialReader] [A0] Format: RSSI at byte 4 (value: ${frame[4]}), EPC starts at byte 5 (normalized 7-byte extraction)`);
          }
        } else if (cmd === 0x81 || cmd === 0x88) {
          // Alternative format: data starts at byte 4
          epcStart = 4;
          epcEnd = Math.min(frame.length - 1, 11); // 🔧 Extract ~7 bytes from byte 4
          console.log(`[SerialReader] [A0] Format: EPC starts at byte 4 (normalized 7-byte extraction)`);
        }
      } else if (protocolName === 'BB') {
        // BB Protocol: BB <len> [data...] <checksum>
        // ⚠️ NORMALIZATION: Standardized extraction to match A0 format
        // Standard BB format: byte 2 = RSSI, bytes 3-9 = EPC (7 bytes), rest = additional data
        
        if (frame.length > 5) {
          rssi = (frame[2] * -1); // Byte 2 is RSSI
          epcStart = 3;
          epcEnd = 10; // 🔧 Standardized: Extract exactly 7 bytes (bytes 3-9 inclusive)
          console.log(`[SerialReader] [BB] Format: RSSI at byte 2 (${frame[2]}), EPC at bytes 3-9 (standardized 7-byte extraction)`);
        } else {
          // Fallback if frame is short
          epcStart = 3;
          epcEnd = Math.min(frame.length - 1, 10); 
          console.log(`[SerialReader] [BB] Short frame format (${frame.length} bytes)`);
        }
      }

      // Extract EPC - STANDARDIZED: Always extract ~7 bytes for consistent unique identification
      const epcData = frame.subarray(epcStart, epcEnd);
      console.log(`[SerialReader] [${protocolName}] EPC raw bytes (${epcData.length} bytes, normalized): ${epcData.toString('hex').toUpperCase()}`);
      
      if (epcData.length === 0) {
        console.warn(`[SerialReader] [${protocolName}] No EPC data found in frame`);
        return;
      }

      let id = '';
      try {
        const textDecoded = epcData.toString('utf-8');
        // Check if it's valid UTF-8 and mostly printable characters
        if (textDecoded && /^[\x20-\x7E\n\r\t]+$/.test(textDecoded)) {
          id = textDecoded.trim();
          console.log(`[SerialReader] [${protocolName}] Decoded as UTF-8 text: ${id}`);
        } else {
          id = epcData.toString('hex').toUpperCase();
          console.log(`[SerialReader] [${protocolName}] Decoded as HEX: ${id}`);
        }
      } catch {
        id = epcData.toString('hex').toUpperCase();
        console.log(`[SerialReader] [${protocolName}] Decoded as HEX (fallback): ${id}`);
      }

      if (!id || id.length === 0) {
        console.warn(`[SerialReader] [${protocolName}] Failed to decode EPC`);
        return;
      }
      
      console.log(`[SerialReader] [${protocolName}] ✓ Tag detected - EPC (normalized): ${id}, RSSI: ${rssi}dBm`);
      
      // 🔧 FIX: Extract full payload for ID field (all data after the length byte, except checksum)
      // This is used for raw display but NOT for unique identification
      const payloadStart = 2; // After BB/A0 header and length byte
      const payloadEndExclusive = protocol === 'BB' 
        ? frame.length - 1  // Exclude checksum    
        : frame.length - 1; // Exclude checksum
      const fullPayload = frame.subarray(payloadStart, payloadEndExclusive);
      
      let idFull = '';
      try {
        // Try to decode payload as hex string (more reliable than UTF-8)
        idFull = fullPayload.toString('hex').toUpperCase();
      } catch {
        idFull = '';
      }
      
      // Fallback: if id_full extraction failed, use full frame hex
      if (!idFull) {
        try {
          idFull = frame.toString('hex').toUpperCase();
          console.log(`[SerialReader] [${protocolName}] Using full frame hex as id_full (fallback)`);
        } catch {
          idFull = ''; // Last resort: leave empty
        }
      }
      
      console.log(`[SerialReader] [${protocolName}] id_full extracted (${idFull.length} chars)`);
      
      // 🔧 IMPORTANT: The 'id' field is used for unique identification across both protocols
      // Both A0 and BB protocols now extract exactly ~7 bytes, ensuring same tag = same ID
      // The 'epc' field mirrors 'id' for SDK compatibility
      this.emitTag({
        id: id,           // ✅ Normalized 7-byte EPC for unique identification
        epc: id,          // ✅ Mirror for SDK compatibility
        id_full: idFull,  // Full payload for display purposes only
        timestamp: Date.now(),
        rssi: rssi,
        raw: frame,
        _protocol: protocolName  // 🔧 Track which protocol frame came from (for debugging)
      });
    } catch (err) {
      console.error(`[SerialReader] [${protocolName}] Error extracting tag:`, err);
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