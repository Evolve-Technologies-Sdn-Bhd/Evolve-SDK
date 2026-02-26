// src/protocols/F5001Protocol.ts

export class F5001Protocol {
  static HEADER = 0xBB;
  static END = Buffer.from([0x0D, 0x0A]);

  /**
   * Checksum = sum of all bytes except header and end bytes, masked to 0xFF
   */
  static checksum(bytes: number[]): number {
    let sum = 0;
    for (const b of bytes) sum += b;
    return sum & 0xFF;
  }

  /**
   * Build generic frame:
   * BB [CMD] [LEN] [DATA...] [CHECKSUM] 0D 0A
   */
  static build(cmd: number, payload: number[] = []): Buffer {
    const len = payload.length;
    const body = [cmd, len, ...payload];
    const crc = this.checksum(body);

    return Buffer.from([
      this.HEADER,
      ...body,
      crc,
      ...this.END
    ]);
  }

  // ========== COMMANDS ==========

  /**
   * Start Multi EPC Inventory (40 07 parameter)
   * This is the actual command that enables tag detection
   * Must be sent AFTER SetInventoryParam0 and SetInventoryParam1
   */

  static setInventoryParam0() { return Buffer.from([0xBB, 0xD0, 0x04, 0x40, 0x00, 0x02, 0x00, 0x16, 0x0D, 0x0A]); }
  static setInventoryParam1() { return Buffer.from([0xBB, 0xD0, 0x04, 0x40, 0x01, 0x02, 0x00, 0x17, 0x0D, 0x0A]); }

  static startMultiEPC() { 
    return Buffer.from([0xBB, 0x17, 0x02, 0x00, 0x00, 0x19, 0x0D, 0x0A]); 
  }

  static stopMultiEPC() { 
    return Buffer.from([0xBB, 0x17, 0x02, 0x00, 0x00, 0x19, 0x0D, 0x0A]); // Same command toggles or stops
  }

  /**
   * Clear Buffer
   */
  static clearBuffer(): Buffer {
    // bb 18 00 18 0d 0a
    return this.build(0x18, []);
  }
}
