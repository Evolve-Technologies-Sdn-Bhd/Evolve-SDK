export class UF3SProtocol {
  static HEADER = 0xA0;

  static COMMANDS = {
    GET_READER_INFO: 0x70,
    SET_ANTENNA: 0x74, // Crucial for 8-channel readers
    REALTIME_INVENTORY: 0x89,
    MULTI_INVENTORY: 0x80,
    STOP_INVENTORY: 0x8C,
    SET_POWER: 0x76,
  };

  /**
   * Checksum calculation: Two's complement of the sum of all bytes 
   * (excluding the header 0xA0)
   */
  static calculateChecksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return (0x100 - (sum & 0xFF)) & 0xFF;
  }

  /**
   * Encodes a command into a UF3-S compliant Buffer
   */
  static encode(addr: number, cmd: number, data: number[] = []): Buffer {
    const len = data.length + 3; // Length = Addr + Cmd + DataLength
    const frame = Buffer.alloc(len + 2); // Frame = Header + Len + Payload + CS

    frame[0] = this.HEADER;
    frame[1] = len;
    frame[2] = addr;
    frame[3] = cmd;

    if (data.length > 0) {
      Buffer.from(data).copy(frame, 4);
    }

    // Checksum is calculated on bytes from Length to end of Data
    const cs = this.calculateChecksum(frame.subarray(1, frame.length - 1));
    frame[frame.length - 1] = cs;

    return frame;
  }
}