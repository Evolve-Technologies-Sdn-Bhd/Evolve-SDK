import { EventEmitter } from 'events';
import { AOProtocolReader } from '../src/readers/AOProtocolReader';
import { UF3SReader } from '../src/readers/UF3-SProtocolReader';
import { F5001ProtocolReader } from '../src/readers/F5001ProtocolReader';
import { A0Protocol } from '../src/utils/A0Protocol';
import { UF3SProtocol } from '../src/utils/UF3SProtocol';

// helper to wait for next tick since ReaderManager.emitTag uses setImmediate
function nextTick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

describe('AOProtocolReader', () => {
  let reader: AOProtocolReader;
  let emitter: any;

  beforeEach(() => {
    emitter = { emitTag: jest.fn(), emitRawData: jest.fn() };
    reader = new AOProtocolReader(emitter as any);
    reader.startScan();
  });

  it('should parse valid tag packet', async () => {
    // build a frame: header, len, addr, cmd=0x80, rssi=5, epc bytes
    const epc = Buffer.from('DEADBEEF', 'hex');
    const addr = 0x01;
    const cmd = 0x80;
    const rssiByte = 0x05;
    const payload = Buffer.concat([Buffer.from([addr, cmd, rssiByte]), epc]);
    const len = payload.length + 1; // includes checksum
    const frame = Buffer.alloc(len + 2);
    frame[0] = 0xA0;
    frame[1] = len;
    payload.copy(frame, 2);
    const cs = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));
    frame[frame.length - 1] = cs;

    reader.injectData(frame);
    await nextTick();
    expect(emitter.emitTag).toHaveBeenCalled();
    const tag = emitter.emitTag.mock.calls[0][0];
    expect(tag.epc).toBe(epc.toString('hex').toUpperCase());
    expect(tag.rssi).toBe(-rssiByte);
  });

  it('should ignore malformed packet (bad checksum)', async () => {
    const buf = Buffer.from([0xA0, 0x03, 0x01, 0x80, 0x00]);
    // wrong checksum purposely
    reader.injectData(buf);
    await nextTick();
    expect(emitter.emitTag).not.toHaveBeenCalled();
  });

  it('should handle empty buffers gracefully', () => {
    expect(() => reader.injectData(Buffer.alloc(0))).not.toThrow();
    expect(emitter.emitTag).not.toHaveBeenCalled();
  });

  it('should process multiple tags in one buffer', async () => {
    const makeFrame = (epcHex: string) => {
      const epcBytes = Buffer.from(epcHex, 'hex');
      const addr = 0x01;
      const cmd = 0x80;
      const rssiByte = 0x0a;
      const payload = Buffer.concat([Buffer.from([addr, cmd, rssiByte]), epcBytes]);
      const len = payload.length + 1;
      const frame = Buffer.alloc(len + 2);
      frame[0] = 0xA0;
      frame[1] = len;
      payload.copy(frame, 2);
      frame[frame.length - 1] = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));
      return frame;
    };
    const f1 = makeFrame('ABCDEF01');
    const f2 = makeFrame('12345678');
    reader.injectData(Buffer.concat([f1, f2]));
    await nextTick();
    expect(emitter.emitTag).toHaveBeenCalledTimes(2);
  });

  it('should extract EPC correctly from various commands', async () => {
    // use cmd 0x81 format (epc starts at byte4)
    const epcBytes = Buffer.from('A1B2', 'hex');
    const addr = 0x01;
    const cmd = 0x81;
    const payload = Buffer.concat([Buffer.from([addr, cmd]), epcBytes]);
    const len = payload.length + 1;
    const frame = Buffer.alloc(len + 2);
    frame[0] = 0xA0;
    frame[1] = len;
    payload.copy(frame, 2);
    frame[frame.length - 1] = A0Protocol.calculateChecksum(frame.subarray(1, frame.length - 1));

    reader.injectData(frame);
    await nextTick();
    const tag = emitter.emitTag.mock.calls[0][0];
    expect(tag.epc).toBe(epcBytes.toString('hex').toUpperCase());
  });
});

describe('UF3SProtocolReader', () => {
  let reader: UF3SReader;
  let emitter: any;

  beforeEach(() => {
    emitter = { emitTag: jest.fn(), emitRawData: jest.fn() };
    reader = new UF3SReader(emitter);
  });

  it('should parse UF3-S packet format and emit tag', () => {
    const epc = Buffer.from('CAFEBABE', 'hex');
    const rssi = 0x04;
    const addr = 0x01;
    const cmd = 0x89;
    // build frame
    const body = Buffer.concat([
      Buffer.from([addr, cmd, rssi, 0x00, 0x00]), // pc placeholder 0
      epc
    ]);
    const len = body.length + 2; // length byte includes addr,cmd,data,cs?
    const frame = Buffer.alloc(len + 2);
    frame[0] = UF3SProtocol.HEADER;
    frame[1] = body.length + 1; // len from spec (Addr+Cmd+Data+CS)
    body.copy(frame, 2);
    frame[frame.length - 1] = UF3SProtocol.calculateChecksum(frame.subarray(1, frame.length - 1));

    reader.injectData(frame);
    expect(emitter.emitTag).toHaveBeenCalled();
    const tag = emitter.emitTag.mock.calls[0][0];
    expect(tag.epc).toBe(epc.toString('hex').toUpperCase());
    expect(tag.rssi).toBe(-rssi);
  });

  it('should emit jsonRead when receiving JSON string', () => {
    const callback = jest.fn();
    reader.on('jsonRead', callback);
    const json = Buffer.from(JSON.stringify({ foo: 'bar' }));
    reader.injectData(json);
    expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('should skip malformed JSON without throwing', () => {
    expect(() => reader.injectData(Buffer.from('{notjson'))).not.toThrow();
  });

  it('should handle empty buffer without emitting', () => {
    reader.injectData(Buffer.alloc(0));
    expect(emitter.emitTag).not.toHaveBeenCalled();
  });
});

describe('F5001ProtocolReader', () => {
  let reader: F5001ProtocolReader;
  let emitter: any;

  beforeEach(() => {
    emitter = { emitTag: jest.fn(), emitRawData: jest.fn() };
    reader = new F5001ProtocolReader(emitter as any);
  });

  it('should parse F5001 response correctly', async () => {
    // build a 97 tag frame with a 2-word EPC (4 bytes)
    const epc = Buffer.from('DEADBEAF', 'hex');
    const pcWords = 2; // bits 11-15 -> value 2
    const pc = pcWords << 11;
    const rssi = 0x05;
    const body: number[] = [];
    body.push(0x97); // cmd
    body.push(0x06 + epc.length); // len (dummy)
    body.push((pc >> 8) & 0xff);
    body.push(pc & 0xff);
    // append epc
    for (const b of epc) body.push(b);
    // append rssi and dummy CRC
    body.push(rssi);
    const frame = Buffer.from([0xBB, ...body, 0x00, 0x0D, 0x0A]);

    reader.injectData(frame);
    await nextTick();

    expect(emitter.emitTag).toHaveBeenCalled();
    const tag = emitter.emitTag.mock.calls[0][0];
    expect(tag.epc).toBe(epc.toString('hex').toUpperCase());
    expect(tag.rssi).toBe(-rssi);
  });

  it('should ignore incomplete frame', () => {
    reader.injectData(Buffer.from([0xBB, 0x97, 0x02]));
    expect(emitter.emitTag).not.toHaveBeenCalled();
  });

  it('should parse multiple tag frames in same buffer', async () => {
    const makeFrame = (epcHex: string, rssiVal: number) => {
      const epcBytes = Buffer.from(epcHex, 'hex');
      const pcWords = epcBytes.length / 2;
      const pc = pcWords << 11;
      const arr: number[] = [];
      arr.push(0x97);
      arr.push(0x00); // len not checked
      arr.push((pc >> 8) & 0xff);
      arr.push(pc & 0xff);
      for (const b of epcBytes) arr.push(b);
      arr.push(rssiVal);
      return Buffer.from([0xBB, ...arr, 0x00, 0x0D, 0x0A]);
    };
    const f1 = makeFrame('AAAA', 0x01);
    const f2 = makeFrame('BBBB', 0x02);
    reader.injectData(Buffer.concat([f1, f2]));
    await nextTick();
    expect(emitter.emitTag).toHaveBeenCalledTimes(2);
  });
});
