// src/protocols/A0Protocol.ts
export class A0Protocol {
  static HEADER = 0xA0;

  /**
   * Calculates the checksum for the A0 protocol (Sum of bytes, then 2's complement)
   */
  static calculateChecksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (0x100 - (sum & 0xFF)) & 0xFF;
  }

  /**
   * Encapsulates a command into a valid frame
   */
  static encode(address: number, cmd: number, data: number[] = []): Buffer {
    const len = data.length + 3; // Addr + Cmd + Data + Checksum
    const frame = Buffer.alloc(len + 2); // Header + Len + Payload
    
    frame[0] = this.HEADER;
    frame[1] = len;
    frame[2] = address;
    frame[3] = cmd;
    
    if (data.length > 0) {
      Buffer.from(data).copy(frame, 4);
    }

    // Checksum is calculated from Len to end of Data
    const checksum = this.calculateChecksum(frame.subarray(1, frame.length - 1));
    frame[frame.length - 1] = checksum;
    
    return frame;
  }

  /**
   * Common A0 Commands
   */
  static COMMANDS = {
    INVENTORY: 0x80,
    MULTI_INVENTORY: 0x82,
    REALTIME_INVENTORY: 0x88,
    STOP_INVENTORY: 0x89,
    GET_READER_INFO: 0x21,
    SET_OUTPUT_POWER: 0x76,
    GET_OUTPUT_POWER: 0x77
  };
}