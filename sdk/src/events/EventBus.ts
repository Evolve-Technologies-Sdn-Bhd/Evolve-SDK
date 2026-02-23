// src/events/RfidEvents.ts
import { EventEmitter } from 'events';

export interface TagData {
  id: string;
  timestamp: number;
  raw: Buffer;
  rssi?: number;
}

export interface RawPacket {
  id: number;
  timestamp: string;
  direction: 'RX' | 'TX';
  data: string;
}

export type RfidEvents = 'connected' | 'disconnected' | 'tagRead' | 'error' | 'rawData';

export class RfidEventEmitter extends EventEmitter {
  emitTag(tag: TagData) {
    this.emit('tagRead', tag);
  }

  emitRawData(packet: RawPacket) {
    this.emit('rawData', packet);
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
