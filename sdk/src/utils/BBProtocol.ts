// src/protocols/BBProtocol.ts
export class BBProtocol {
  static HEADER = 0xBB;
  static FOOTER = 0x7E;

  /**
   * Calculates the checksum for the BB protocol (Sum of bytes from Type to end of Payload)
   */
  static calculateChecksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum & 0xFF;
  }

  /**
   * Encapsulates a command into a valid BB frame
   * Format: BB <type> <cmd> <len_h> <len_l> [payload...] <checksum> 7E
   */
  static encode(type: number, cmd: number, payload: number[] = []): Buffer {
    const payloadLen = payload.length;
    const frameLen = 7 + payloadLen; // BB + type + cmd + len_h + len_l + payload + checksum + 7E
    const frame = Buffer.alloc(frameLen);
    
    frame[0] = this.HEADER;
    frame[1] = type;
    frame[2] = cmd;
    frame[3] = (payloadLen >> 8) & 0xFF;
    frame[4] = payloadLen & 0xFF;
    
    if (payloadLen > 0) {
      Buffer.from(payload).copy(frame, 5);
    }

    // Checksum is sum of bytes from index 1 to (frameLen - 3)
    const checksum = this.calculateChecksum(frame.subarray(1, frameLen - 2));
    frame[frameLen - 2] = checksum;
    frame[frameLen - 1] = this.FOOTER;
    
    return frame;
  }

  /**
   * Common BB Commands
   */
  static COMMANDS = {
    INVENTORY: 0x22,
    STOP_INVENTORY: 0x22, // Same command, but parameter might differ or just stop reading
    GET_READER_INFO: 0x03,
    SET_OUTPUT_POWER: 0xB6,
    GET_OUTPUT_POWER: 0xB7
  };
}
