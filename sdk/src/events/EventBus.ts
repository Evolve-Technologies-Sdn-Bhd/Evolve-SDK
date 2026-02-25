// src/events/RfidEvents.ts
import { EventEmitter } from 'events';

export interface TagData {
  id: string;
  epc?: string; // EPC identifier (6-7 bytes, extracted cleanly)
  timestamp: number;
  raw: Buffer;
  rssi?: number;
  id_full?: string; // Full payload data (for display)
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
