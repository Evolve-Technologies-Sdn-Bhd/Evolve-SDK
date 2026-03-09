// src/index.ts
export { RfidSdk } from './Rfidsdk';
export { MqttConnectionManager, type MqttConnectionConfig, type MqttConnectionStatus } from './connections/MqttConnectionManager';
export { DatabaseSeeder, createSeeder, type SeedData } from './database/DatabaseSeeder';

// Export error handling
export { 
  RfidSdkError,
  createSdkError,
  wrapNativeError,
  serializeError,
  ERROR_CODES,
  type RfidSdkErrorObject,
  type ErrorDetails,
} from './errors/RfidSdkError';
