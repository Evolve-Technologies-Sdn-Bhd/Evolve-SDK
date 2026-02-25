import { SerialPort } from 'serialport';
import { ReaderManager } from '../readers/ReaderManager';
import { A0Protocol } from '../utils/A0Protocol';
import { BBProtocol } from '../utils/BBProtocol';

export class SerialReader extends ReaderManager {
  private port?: SerialPort;
  private buffer: Buffer = Buffer.alloc(0);
  private isConnected: boolean = false;
  private frameCount: number = 0;
  private scanTimeout?: NodeJS.Timeout;
  private readerProtocol: 'A0' | 'BB' | 'AUTO' = 'AUTO';

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
    
    // Process frames: Support A0 (0xA0), BB (0xBB), and SL500 (0x7E) headers
    while (this.buffer.length >= 3) {
      const header = this.buffer[0];
      
      // 📋 PROTOCOL DETECTION
      if (header === A0Protocol.HEADER) {
        // ✅ A0 PROTOCOL: A0 <len> <addr> <cmd> [...payload...] <checksum>
        const len = this.buffer[1];
        
        // Sanity check: length shouldn't be more than 1024
        if (len > 1024 || len < 3) {
          this.buffer = this.buffer.subarray(1);
          continue;
        }
        
        // Check if frame is complete
        if (this.buffer.length < len + 2) break;

        const frame = this.buffer.subarray(0, len + 2);
        this.frameCount++;
        this.processFrame(frame, 'A0');
        this.buffer = this.buffer.subarray(len + 2);
        
      } else if (header === 0xBB) {
        // ✅ BB PROTOCOL (Sanray/Hopeland or Generic BB)
        // Format 1 (Generic): BB <len> [...payload...] <checksum>
        // Format 2 (Sanray): BB <type> <cmd> <len_h> <len_l> ... <checksum> 7E
        
        const lenByte = this.buffer[1];
        
        // Try Sanray format first (more specific with 7E footer)
        if (this.buffer.length >= 7) {
          const payloadLen = (this.buffer[3] << 8) | this.buffer[4];
          const sanrayTotalLen = 7 + payloadLen;
          
          if (sanrayTotalLen <= 1024 && this.buffer.length >= sanrayTotalLen && this.buffer[sanrayTotalLen - 1] === 0x7E) {
            const frame = this.buffer.subarray(0, sanrayTotalLen);
            this.frameCount++;
            this.processFrame(frame, 'BB');
            this.buffer = this.buffer.subarray(sanrayTotalLen);
            continue;
          }
        }
        
        // Try Generic format
        const genericTotalLen = lenByte + 2;
        if (lenByte > 2 && lenByte < 128 && this.buffer.length >= genericTotalLen) {
          const frame = this.buffer.subarray(0, genericTotalLen);
          this.frameCount++;
          this.processFrame(frame, 'BB');
          this.buffer = this.buffer.subarray(genericTotalLen);
          continue;
        }

        // If neither matches but we have enough data, it might be a status message (like BB 40 02 D0 40 52)
        if (this.buffer.length >= 6 && this.buffer[0] === 0xBB && this.buffer[1] === 0x40) {
           console.log(`[SerialReader] Detected BB Status/Heartbeat frame, skipping`);
           this.buffer = this.buffer.subarray(6);
           continue;
        }
        
        // If we can't determine length yet, wait for more data (up to a limit)
        if (this.buffer.length < 128) break; 
        
        // Too much data and no match, skip this BB
        this.buffer = this.buffer.subarray(1);
        
      } else if (header === 0x7E) {
        // ✅ SL500 / 7E PROTOCOL: 7E <len> [...payload...] <checksum>
        if (this.buffer.length < 2) break;
        
        // Check for 7E 7E double header (common in some readers)
        const offset = this.buffer[1] === 0x7E ? 2 : 1;
        if (this.buffer.length < offset + 1) break;
        
        const len = this.buffer[offset];
        const totalLen = offset + len; // Simplified length check
        
        if (totalLen > 1024 || totalLen < 3) {
          this.buffer = this.buffer.subarray(1);
          continue;
        }
        
        if (this.buffer.length < totalLen) break;
        
        const frame = this.buffer.subarray(0, totalLen);
        this.frameCount++;
        console.log(`[SerialReader] ✓ 7E Protocol frame detected`);
        this.processFrame(frame, 'A0'); // Reuse A0 processing logic for now
        this.buffer = this.buffer.subarray(totalLen);

      } else {
        // ❌ UNKNOWN PROTOCOL - Seek for next header
        let nextHeaderIndex = -1;
        for (let i = 1; i < Math.min(this.buffer.length, 1000); i++) {
          if (this.buffer[i] === 0xA0 || this.buffer[i] === 0xBB || this.buffer[i] === 0x7E) {
            nextHeaderIndex = i;
            break;
          }
        }
        
        if (nextHeaderIndex > 0) {
          this.buffer = this.buffer.subarray(nextHeaderIndex);
        } else {
          this.buffer = Buffer.alloc(0);
          break;
        }
      }

      // Skip CR+LF if present
      if (this.buffer.length >= 2 && this.buffer[0] === 0x0D && this.buffer[1] === 0x0A) {
        this.buffer = this.buffer.subarray(2);
      }
    }
  }

  async configure(settings: Record<string, any>): Promise<void> {
    if (settings.protocol) {
      this.readerProtocol = settings.protocol as 'A0' | 'BB' | 'AUTO';
      console.log(`[SerialReader] Protocol set to: ${this.readerProtocol}`);
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
        // BB Protocol: 
        // Format 1 (Generic): BB <len> [data...] <checksum>
        // Format 2 (Sanray): BB <type> <cmd> <len_h> <len_l> [payload...] <checksum> 7E
        
        if (frame.length >= 7 && frame[frame.length - 1] === 0x7E) {
          // ✅ SANRAY/HOPELAND FORMAT
          const type = frame[1];
          const cmd = frame[2];
          const payloadLen = (frame[3] << 8) | frame[4];
          const payload = frame.subarray(5, 5 + payloadLen);
          
          console.log(`[SerialReader] [BB-Sanray] Type=0x${type.toString(16)}, Cmd=0x${cmd.toString(16)}, Payload=${payload.toString('hex').toUpperCase()}`);
          
          if (type === 0x02 && cmd === 0x22) {
            // Inventory notification: RSSI at byte 0 of payload, EPC starts at byte 1
            rssi = payload[0] * -1;
            epcStart = 5 + 1; // 5 (header) + 1 (RSSI)
            epcEnd = 5 + payloadLen; 
            console.log(`[SerialReader] [BB-Sanray] Inventory Tag: RSSI=${rssi}, EPC Start=${epcStart}`);
          } else {
             // Default extraction for other BB types
             epcStart = 5;
             epcEnd = 5 + payloadLen;
          }
        } else if (frame.length > 5) {
          // ✅ GENERIC BB FORMAT
          rssi = (frame[2] * -1); // Byte 2 is RSSI
          epcStart = 3;
          epcEnd = 10; // 🔧 Standardized: Extract exactly 7 bytes
          console.log(`[SerialReader] [BB-Generic] Format: RSSI at byte 2 (${frame[2]}), EPC at bytes 3-9`);
        } else {
          epcStart = 3;
          epcEnd = Math.min(frame.length - 1, 10); 
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

      // 🔍 PROTOCOL-AGNOSTIC START SCAN
      // We send start commands for both A0 and BB protocols if in AUTO mode
      // This ensures we can wake up different readers without manual selection
      
      const commands: Buffer[] = [];
      
      if (this.readerProtocol === 'A0' || this.readerProtocol === 'AUTO') {
        // A0 Start (Seuic) - try both address 0x01 and 0xFF
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01])); // Fast Real-time
        commands.push(A0Protocol.encode(0xFF, A0Protocol.COMMANDS.REALTIME_INVENTORY, [0x01])); // Broadcast
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.MULTI_INVENTORY)); // Multi-tag
      }
      
      if (this.readerProtocol === 'BB' || this.readerProtocol === 'AUTO') {
        // BB Start (Sanray/Hopeland) - Command 0x22 (Inventory)
        // Format: BB 00 22 00 00 22 7E
        commands.push(BBProtocol.encode(0x00, BBProtocol.COMMANDS.INVENTORY)); 
      }

      console.log(`[SerialReader] Sending ${commands.length} start commands to reader...`);
      
      for (const cmd of commands) {
        this.port.write(cmd, (err) => {
          if (err) console.error(`[SerialReader] Error sending ${cmd[0] === 0xA0 ? 'A0' : 'BB'} start command:`, err.message);
        });
      }

      // Set timeout to warn if no data received after 5 seconds
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => {
        if (this.frameCount === 0) {
          console.warn('[SerialReader] ⚠️ No data received for 5 seconds');
          console.warn('[SerialReader] Possible issues:');
          console.warn('[SerialReader]   - Device not powered on');
          console.warn('[SerialReader]   - Wrong COM port or baud rate (Try 115200 or 57600)');
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

      const commands: Buffer[] = [];
      
      if (this.readerProtocol === 'A0' || this.readerProtocol === 'AUTO') {
        commands.push(A0Protocol.encode(0x01, A0Protocol.COMMANDS.STOP_INVENTORY));
        commands.push(A0Protocol.encode(0xFF, A0Protocol.COMMANDS.STOP_INVENTORY));
      }
      
      if (this.readerProtocol === 'BB' || this.readerProtocol === 'AUTO') {
        // Many BB readers stop when any new command is sent, or have specific stop codes
        // We'll send a "Get Reader Info" as a safe way to stop inventory on some modules
        commands.push(BBProtocol.encode(0x00, BBProtocol.COMMANDS.GET_READER_INFO));
      }

      console.log(`[SerialReader] Sending ${commands.length} stop commands to reader...`);
      
      for (const cmd of commands) {
        this.port.write(cmd, (err) => {
          if (err) console.error(`[SerialReader] Error sending ${cmd[0] === 0xA0 ? 'A0' : 'BB'} stop command:`, err.message);
        });
      }

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