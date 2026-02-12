// src/events/RfidEvents.ts
import { EventEmitter } from 'events';

export interface TagData {
  id: string;
  timestamp: number;
  raw: Buffer;
  rssi?: number;
}

export type RfidEvents = 'connected' | 'disconnected' | 'tagRead' | 'error';

export class RfidEventEmitter extends EventEmitter {
  emitTag(tag: TagData) {
    this.emit('tagRead', tag);
  }

  emitConnected() {
    this.emit('connected');
  }

  emitDisconnected() {
    this.emit('disconnected');
  }

  emitError(err: Error) {
    this.emit('error', err);
  }
}
