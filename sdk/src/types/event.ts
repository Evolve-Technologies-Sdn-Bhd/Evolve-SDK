export enum SDKEvent {
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',

  TAG_DETECTED = 'tag_detected',
  TAG_LOST = 'tag_lost',

  RAW_DATA = 'raw_data',
  DIAGNOSTIC = 'diagnostic',
}

export interface SDKError {
  code: string;
  message: string;
  source?: string;
  raw?: unknown;
}