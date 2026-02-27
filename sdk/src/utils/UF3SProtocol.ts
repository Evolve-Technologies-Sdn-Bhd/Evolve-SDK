// utils/UF3SProtocol.ts
export class UF3SProtocol {
  static calculateCRC16(data: Buffer): number {
    const POLYNOMIAL = 0x8408;
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) crc = (crc >> 1) ^ POLYNOMIAL;
        else crc >>= 1;
      }
    }
    return crc;
  }

  static encode(address: number, cmd: number, data: number[] = []): Buffer {
    const len = 4 + data.length;
    const payload = Buffer.alloc(3 + data.length);
    payload[0] = len;
    payload[1] = address;
    payload[2] = cmd;
    if (data.length > 0) Buffer.from(data).copy(payload, 3);

    const crc = this.calculateCRC16(payload);
    const frame = Buffer.alloc(payload.length + 2);
    payload.copy(frame);
    frame[frame.length - 2] = crc & 0xFF;        // LSB
    frame[frame.length - 1] = (crc >> 8) & 0xFF; // MSB
    return frame;
  }

  // P6: Set Power (1~33). Note: Bit 7 = 0 to save to memory
  static setPower(power: number = 30) {
    return this.encode(0x00, 0x2F, [power & 0x7F]);
  }

  // P10: Set Antenna Mask. 0xFF enables all 8 ports
  static setAntennaMask(mask: number = 0xFF) {
    return this.encode(0x00, 0x3F, [mask]);
  }

  // P4: Inventory command. QValue | Session (0xFF = Auto)
  static queryTag(qValue: number = 4) {
    return this.encode(0x00, 0x01, [qValue, 0xFF]);
  }
}