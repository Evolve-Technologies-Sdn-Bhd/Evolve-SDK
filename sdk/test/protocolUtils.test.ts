import { A0Protocol } from '../src/utils/A0Protocol';
import { UF3SProtocol } from '../src/utils/UF3SProtocol';
import { F5001Protocol } from '../src/utils/F5001Protocol';

describe('A0Protocol utility', () => {
  it('should calculate correct checksum for simple data', () => {
    const data = Buffer.from([0x02, 0x03, 0x04]);
    // sum = 9 -> two's complement = 0xF7
    expect(A0Protocol.calculateChecksum(data)).toBe(0xF7);
  });

  it('should encode a command frame with no data', () => {
    const buf = A0Protocol.encode(0x01, 0x80);
    // header, len, addr, cmd, checksum
    expect(buf[0]).toBe(0xA0);
    expect(buf[2]).toBe(0x01);
    expect(buf[3]).toBe(0x80);
    // length should be 3 (addr+cmd+cs)
    expect(buf[1]).toBe(3);
    // checksum should validate
    const cs = A0Protocol.calculateChecksum(buf.subarray(1, buf.length - 1));
    expect(cs).toBe(buf[buf.length - 1]);
  });

  it('should encode a command frame with data payload', () => {
    const payload = [0x10, 0x20, 0x30];
    const buf = A0Protocol.encode(0x05, 0x90, payload);
    expect(buf[0]).toBe(0xA0);
    expect(buf[2]).toBe(0x05);
    expect(buf[3]).toBe(0x90);
    expect(buf.subarray(4, 7)).toEqual(Buffer.from(payload));
    const cs = A0Protocol.calculateChecksum(buf.subarray(1, buf.length - 1));
    expect(cs).toBe(buf[buf.length - 1]);
  });

  it('should produce different checksum when data is modified (invalid checksum)', () => {
    const buf = A0Protocol.encode(0x01, 0x80, [0x01]);
    const corrupt = Buffer.from(buf);
    corrupt[4] = 0xFF; // change payload
    expect(A0Protocol.calculateChecksum(corrupt.subarray(1, corrupt.length - 1))).not.toBe(corrupt[corrupt.length - 1]);
  });

  it('should handle empty data and boundary lengths', () => {
    const buf = A0Protocol.encode(0x00, 0x00, []);
    expect(buf.length).toBe(5); // header + len + addr + cmd + cs
    expect(buf[1]).toBe(3);
  });
});

describe('UF3SProtocol utility', () => {
  it('should calculate checksum identical to A0 algorithm', () => {
    const data = Buffer.from([0x05, 0x06]);
    expect(UF3SProtocol.calculateChecksum(data)).toBe(A0Protocol.calculateChecksum(data));
  });

  it('should encode frames correctly and validate checksum', () => {
    const buf = UF3SProtocol.encode(0x01, UF3SProtocol.COMMANDS.REALTIME_INVENTORY, [0xAA]);
    expect(buf[0]).toBe(UF3SProtocol.HEADER);
    expect(buf[2]).toBe(0x01);
    expect(buf[3]).toBe(UF3SProtocol.COMMANDS.REALTIME_INVENTORY);
    const cs = UF3SProtocol.calculateChecksum(buf.subarray(1, buf.length - 1));
    expect(cs).toBe(buf[buf.length - 1]);
  });

  it('should produce invalid checksum when buffer is tampered', () => {
    const buf = UF3SProtocol.encode(0x02, UF3SProtocol.COMMANDS.STOP_INVENTORY);
    const tampered = Buffer.from(buf);
    tampered[2] = 0xFF;
    expect(UF3SProtocol.calculateChecksum(tampered.subarray(1, tampered.length - 1))).not.toBe(tampered[tampered.length - 1]);
  });

  it('should handle zero-length payload', () => {
    const buf = UF3SProtocol.encode(0x00, UF3SProtocol.COMMANDS.GET_READER_INFO, []);
    expect(buf.length).toBe(5);
    expect(buf[1]).toBe(3);
  });
});

describe('F5001Protocol utility', () => {
  it('should build a proper frame with CRC and terminator', () => {
    const frame = F5001Protocol.build(0x10, [0x01, 0x02]);
    expect(frame[0]).toBe(F5001Protocol.HEADER);
    expect(frame[1]).toBe(0x10);
    // length byte should equal payload length (2)
    expect(frame[2]).toBe(2);
    expect(frame.slice(frame.length - 2)).toEqual(F5001Protocol.END);
    const body = [0x10, 0x02, 0x01, 0x02];
    expect(F5001Protocol.checksum(body)).toBe(frame[frame.length - 3]);
  });

  it('should compute checksum masked to one byte', () => {
    expect(F5001Protocol.checksum([0xff, 0x02])).toBe((0xff + 0x02) & 0xff);
  });

  it('should create known command buffers for helpers', () => {
    expect(F5001Protocol.setInventoryParam0()).toBeInstanceOf(Buffer);
    expect(F5001Protocol.startMultiEPC()).toBeInstanceOf(Buffer);
  });
});
