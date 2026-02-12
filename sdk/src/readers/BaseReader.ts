// src/readers/BaseReader.ts
import { EventEmitter } from 'events';
import { RfidEventEmitter, TagData } from '../events/RfidEvents';

export abstract class BaseReader extends EventEmitter {
  protected rfidEmitter: RfidEventEmitter;

  constructor(rfidEmitter: RfidEventEmitter) {
    super();
    this.rfidEmitter = rfidEmitter;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract readTag(): void;

  protected emitTag(tag: TagData) {
    this.rfidEmitter.emitTag(tag);
    this.emit('tagRead', tag); // now BaseReader emits too
  }
}
