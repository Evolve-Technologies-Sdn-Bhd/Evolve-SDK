// src/readers/ReaderManager.ts
import { EventEmitter } from 'events';
import { RfidEventEmitter, TagData, RawPacket } from '../events/EventBus';

export abstract class ReaderManager extends EventEmitter {
  protected rfidEmitter: RfidEventEmitter;
  protected packetId: number = 0;

  constructor(rfidEmitter: RfidEventEmitter) {
    super();
    this.rfidEmitter = rfidEmitter;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract readTag(): void;
  abstract startScan(): void;
  abstract stopScan(): void;

  async configure(settings: Record<string, any>): Promise<void> {
    // Default implementation: do nothing
    return;
  }

  protected emitTag(tag: TagData) {
    console.log('[ReaderManager] Tag Emitted:', tag?.epc || tag?.id);
    // 🚀 OPTIMIZATION: Use setImmediate for non-blocking event emission
    setImmediate(() => {
      // safely forward to external emitter if available
      if (this.rfidEmitter && typeof (this.rfidEmitter as any).emitTag === 'function') {
        (this.rfidEmitter as any).emitTag(tag);
      }
      this.emit('tagRead', tag); // now BaseReader emits too
    });
  }

  /**
   * Convenience helper: register a listener for tag read events.
   *
   * @param callback function invoked when a tag is emitted
   */
  onTag(callback: (tag: TagData) => void): this {
    this.on('tagRead', callback);
    return this;
  }

  protected emitRawData(data: string | Buffer, direction: 'RX' | 'TX' = 'RX') {
    const hexData = typeof data === 'string' ? data : data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
    const packet: RawPacket = {
      id: ++this.packetId,
      timestamp: new Date().toLocaleTimeString(),
      direction,
      data: hexData
    };
    this.rfidEmitter.emitRawData(packet);
  }
}
