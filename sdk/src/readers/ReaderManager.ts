// src/readers/ReaderManager.ts
import { EventEmitter } from 'events';
import { RfidEventEmitter, TagData } from '../events/EventBus';

export abstract class ReaderManager extends EventEmitter {
  protected rfidEmitter: RfidEventEmitter;

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
    this.rfidEmitter.emitTag(tag);
    this.emit('tagRead', tag); // now BaseReader emits too
  }
}
