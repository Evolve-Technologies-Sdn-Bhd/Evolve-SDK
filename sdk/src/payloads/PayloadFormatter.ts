// src/payloads/PayloadFormatter.ts
import { TagData } from '../events/RfidEvents';

export function formatPayload(tag: TagData) {
  return {
    raw: tag.raw,                          // Buffer
    hex: tag.raw.toString('hex'),          // Hex string
    text: `${tag.id} @ ${new Date(tag.timestamp).toLocaleTimeString()}`, // Plain text
    json: {                               // Structured JSON
      epc: tag.id,
      rssi: tag.rssi ?? null,
      timestamp: tag.timestamp
    }
  };
}
