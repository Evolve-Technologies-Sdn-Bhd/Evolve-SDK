import { RfidEventEmitter, TagData, RawPacket } from '../src/events/EventBus';
import { RfidSdkError, RfidSdkErrorObject } from '../src/errors/RfidSdkError';

describe('EventBus', () => {
  let emitter: RfidEventEmitter;

  beforeEach(() => {
    emitter = new RfidEventEmitter();
  });

  it('should register listener', () => {
    const cb = jest.fn();
    emitter.on('connected', cb);
    emitter.emitConnected();
    expect(cb).toHaveBeenCalled();
  });

  it('should emit event to listener with payload', () => {
    const cb = jest.fn();
    emitter.on('tagRead', cb);
    const tag: TagData = {
      id: '1234',
      timestamp: Date.now(),
      raw: Buffer.from([0x01, 0x02])
    };
    emitter.emitTag(tag);
    expect(cb).toHaveBeenCalledWith(tag);
  });

  it('should support multiple listeners', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    emitter.on('disconnected', cb1);
    emitter.on('disconnected', cb2);
    emitter.emitDisconnected();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('should remove listeners correctly', () => {
    const cb = jest.fn();
    emitter.on('connected', cb);
    emitter.off('connected', cb);
    emitter.emitConnected();
    expect(cb).not.toHaveBeenCalled();
  });

  it('should handle emitting events with no listeners without error', () => {
    expect(() => emitter.emit('rawData', { id: 1, timestamp: 't', direction: 'RX', data: '00' } as RawPacket)).not.toThrow();
  });

  it('should forward error payload via emitError', () => {
    const cb = jest.fn();
    emitter.on('error', cb);
    const err = new Error('test');
    emitter.emitError(err);
    
    // Verify emitError wraps native errors in RfidSdkErrorObject
    expect(cb).toHaveBeenCalled();
    const emittedError = cb.mock.calls[0][0] as RfidSdkErrorObject;
    expect(emittedError.code).toBe('EVRFID-SYSTEM-003');
    expect(emittedError.message).toBe('test');
    expect(emittedError.recoverable).toBe(false);
    expect(emittedError.details?.originalError).toBe('Error: test');
    expect(emittedError.formatted).toContain('[ERROR][EVRFID-SYSTEM-003]');
  });

  it('should not throw if error event has no listeners', () => {
    const emitterNoListeners = new RfidEventEmitter();
    const err = new Error('test error with no listeners');
    
    // Should not throw - logs to console instead
    expect(() => {
      emitterNoListeners.emitError(err);
    }).not.toThrow();
  });
});