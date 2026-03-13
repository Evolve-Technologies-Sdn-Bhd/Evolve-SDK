/**
 * RfidSdkError.ts - Structured Error Handling for RFID SDK
 * 
 * All errors in the SDK are emitted with a structured format:
 * [HH:MM:SS][ERROR][CODE] - message
 * 
 * Example: [11:02:56][ERROR][EVRFID-TCP-001] - Invalid TCP configuration
 * 
 * NOTE: The format has NO spaces between brackets to prevent duplication when
 * displayed through multiple logging layers (browser console + log panel).
 */

export interface ErrorDetails {
  [key: string]: any;
}

export interface RfidSdkErrorObject {
  code: string;
  message: string;
  timestamp: number;
  details?: ErrorDetails;
  recoverable: boolean;
  formatted: string;
}

/**
 * Extended Error class with structured error code support
 */
export class RfidSdkError extends Error {
  code: string;
  timestamp: number;
  details: ErrorDetails;
  recoverable: boolean;

  constructor(
    code: string,
    message: string,
    recoverable: boolean = false,
    details?: ErrorDetails
  ) {
    super(message);
    this.name = 'RfidSdkError';
    this.code = code;
    this.message = message;
    this.timestamp = Date.now();
    this.details = details || {};
    this.recoverable = recoverable;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, RfidSdkError.prototype);
  }

  /**
   * Generate formatted error string: [HH:MM:SS][ERROR][CODE] - message
   */
  private generateFormattedError(): string {
    const date = new Date(this.timestamp);
    const timeStr = date.toISOString().split('T')[1].slice(0, -5); // HH:MM:SS
    
    // Include original error if it exists and is different from the generic message
    let displayMessage = this.message;
    if (this.details.originalError && this.details.originalError !== this.message) {
      displayMessage = `${this.message}: ${this.details.originalError}`;
    }
    
    return `[${timeStr}][ERROR][${this.code}] - ${displayMessage}`;
  }

  /**
   * Return formatted error for logging
   */
  toString(): string {
    return this.generateFormattedError();
  }

  /**
   * Get log entry with all details
   */
  getLogEntry(): RfidSdkErrorObject {
    return {
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      details: this.details,
      recoverable: this.recoverable,
      formatted: this.generateFormattedError(),
    };
  }

  /**
   * JSON serialization
   */
  toJSON(): RfidSdkErrorObject {
    return this.getLogEntry();
  }

  /**
   * Check if error is recoverable (allows retry logic)
   */
  isRecoverable(): boolean {
    return this.recoverable;
  }
}

/**
 * Error Code Registry
 * Format: EVRFID-CATEGORY-NNN
 * Categories: INIT, CONN, SERIAL, TCP, MQTT, READER, TAG, DATA, SYSTEM
 */
export const ERROR_CODES = {
  // ========== INITIALIZATION (EVRFID-INIT-xxx) ==========
  INIT_FAILED: {
    code: 'EVRFID-INIT-001',
    message: 'Failed to initialize SDK',
    recoverable: false,
  },
  NO_TRANSPORT: {
    code: 'EVRFID-INIT-002',
    message: 'No transport configured',
    recoverable: false,
  },

  // ========== CONNECTION ERRORS (EVRFID-CONN-xxx) ==========
  CONNECTION_FAILED: {
    code: 'EVRFID-CONN-001',
    message: 'Failed to establish connection',
    recoverable: true,
  },
  CONNECTION_TIMEOUT: {
    code: 'EVRFID-CONN-002',
    message: 'Connection timeout',
    recoverable: true,
  },
  UNEXPECTED_DISCONNECT: {
    code: 'EVRFID-CONN-003',
    message: 'Connection lost during operation',
    recoverable: true,
  },

  // ========== SERIAL TRANSPORT (EVRFID-SERIAL-xxx) ==========
  INVALID_PORT_CONFIG: {
    code: 'EVRFID-SERIAL-001',
    message: 'Invalid serial port configuration',
    recoverable: false,
  },
  PORT_NOT_AVAILABLE: {
    code: 'EVRFID-SERIAL-002',
    message: 'Serial port not found or unavailable',
    recoverable: false,
  },
  PORT_PERMISSION_DENIED: {
    code: 'EVRFID-SERIAL-003',
    message: 'Permission denied on serial port',
    recoverable: false,
  },
  INVALID_BAUD_RATE: {
    code: 'EVRFID-SERIAL-004',
    message: 'Invalid baud rate',
    recoverable: false,
  },
  SERIAL_IO_ERROR: {
    code: 'EVRFID-SERIAL-005',
    message: 'Serial port I/O error',
    recoverable: true,
  },

  // ========== TCP TRANSPORT (EVRFID-TCP-xxx) ==========
  INVALID_TCP_CONFIG: {
    code: 'EVRFID-TCP-001',
    message: 'Invalid TCP host/port configuration',
    recoverable: false,
  },
  HOST_NOT_FOUND: {
    code: 'EVRFID-TCP-002',
    message: 'Host not found (DNS resolution failed)',
    recoverable: true,
  },
  CONNECTION_REFUSED: {
    code: 'EVRFID-TCP-003',
    message: 'Connection refused by remote host',
    recoverable: true,
  },
  NETWORK_UNREACHABLE: {
    code: 'EVRFID-TCP-004',
    message: 'Network unreachable',
    recoverable: true,
  },
  CONNECTION_RESET: {
    code: 'EVRFID-TCP-005',
    message: 'Connection reset by peer',
    recoverable: true,
  },

  // ========== MQTT TRANSPORT (EVRFID-MQTT-xxx) ==========
  INVALID_BROKER_URL: {
    code: 'EVRFID-MQTT-001',
    message: 'Invalid MQTT broker URL',
    recoverable: false,
  },
  BROKER_CONNECTION_FAILED: {
    code: 'EVRFID-MQTT-002',
    message: 'Failed to connect to MQTT broker',
    recoverable: true,
  },
  MQTT_AUTH_FAILED: {
    code: 'EVRFID-MQTT-003',
    message: 'MQTT authentication failed',
    recoverable: false,
  },
  INVALID_TOPIC: {
    code: 'EVRFID-MQTT-004',
    message: 'Invalid MQTT topic configuration',
    recoverable: false,
  },
  SUBSCRIBE_FAILED: {
    code: 'EVRFID-MQTT-005',
    message: 'Failed to subscribe to MQTT topic',
    recoverable: true,
  },
  PUBLISH_FAILED: {
    code: 'EVRFID-MQTT-006',
    message: 'Failed to publish to MQTT topic',
    recoverable: true,
  },

  // ========== READER/DEVICE (EVRFID-READER-xxx) ==========
  READER_NOT_RESPONDING: {
    code: 'EVRFID-READER-001',
    message: 'Reader not responding (heartbeat timeout)',
    recoverable: true,
  },
  INVALID_READER_RESPONSE: {
    code: 'EVRFID-READER-002',
    message: 'Invalid or unexpected reader response format',
    recoverable: true,
  },
  UNSUPPORTED_MODEL: {
    code: 'EVRFID-READER-003',
    message: 'Unsupported reader model',
    recoverable: false,
  },
  FIRMWARE_INCOMPATIBLE: {
    code: 'EVRFID-READER-004',
    message: 'Reader firmware version incompatible',
    recoverable: false,
  },
  COMMAND_EXECUTION_FAILED: {
    code: 'EVRFID-READER-005',
    message: 'Reader command execution failed',
    recoverable: true,
  },
  READER_INTERNAL_ERROR: {
    code: 'EVRFID-READER-006',
    message: 'Reader reported internal error',
    recoverable: true,
  },

  // ========== TAG READING (EVRFID-TAG-xxx) ==========
  INVALID_TAG_FORMAT: {
    code: 'EVRFID-TAG-001',
    message: 'Invalid tag data format',
    recoverable: false,
  },
  EPC_EXTRACTION_FAILED: {
    code: 'EVRFID-TAG-002',
    message: 'Failed to extract EPC from tag data',
    recoverable: false,
  },
  CHECKSUM_FAILED: {
    code: 'EVRFID-TAG-003',
    message: 'Tag data checksum validation failed',
    recoverable: false,
  },
  TAG_DATA_OUT_OF_RANGE: {
    code: 'EVRFID-TAG-004',
    message: 'Tag data parameter out of range',
    recoverable: false,
  },

  // ========== DATA HANDLING (EVRFID-DATA-xxx) ==========
  DECRYPTION_FAILED: {
    code: 'EVRFID-DATA-001',
    message: 'Payload decryption failed',
    recoverable: false,
  },
  INVALID_ENCRYPTION_KEY: {
    code: 'EVRFID-DATA-002',
    message: 'Invalid encryption key format/size',
    recoverable: false,
  },
  INVALID_PAYLOAD_BUFFER: {
    code: 'EVRFID-DATA-003',
    message: 'Invalid or empty payload buffer',
    recoverable: false,
  },
  UNSUPPORTED_PAYLOAD_FORMAT: {
    code: 'EVRFID-DATA-004',
    message: 'Unsupported payload format',
    recoverable: false,
  },
  DATABASE_OPERATION_FAILED: {
    code: 'EVRFID-DATA-005',
    message: 'Database operation failed',
    recoverable: true,
  },

  // ========== SYSTEM ERRORS (EVRFID-SYSTEM-xxx) ==========
  EVENT_EMISSION_FAILED: {
    code: 'EVRFID-SYSTEM-001',
    message: 'Failed to emit event',
    recoverable: true,
  },
  OUT_OF_MEMORY: {
    code: 'EVRFID-SYSTEM-002',
    message: 'Out of memory',
    recoverable: false,
  },
  UNHANDLED_EXCEPTION: {
    code: 'EVRFID-SYSTEM-003',
    message: 'Unhandled exception',
    recoverable: false,
  },
} as const;

/**
 * Factory function to create SDK errors
 */
export function createSdkError(
  errorKey: keyof typeof ERROR_CODES,
  details?: ErrorDetails
): RfidSdkError {
  const errorDef = ERROR_CODES[errorKey];
  return new RfidSdkError(
    errorDef.code,
    errorDef.message,
    errorDef.recoverable,
    details
  );
}

/**
 * Wrap native errors in SDK error format
 */
export function wrapNativeError(
  nativeError: Error,
  errorKey: keyof typeof ERROR_CODES,
  details?: ErrorDetails
): RfidSdkError {
  const errorDef = ERROR_CODES[errorKey];
  const mergedDetails = {
    ...details,
    originalError: nativeError.message,
    originalStack: nativeError.stack,
  };
  return new RfidSdkError(
    errorDef.code,
    errorDef.message,
    errorDef.recoverable,
    mergedDetails
  );
}

/**
 * Serialize any error to structured format
 */
export function serializeError(error: any): RfidSdkErrorObject {
  if (error instanceof RfidSdkError) {
    return error.toJSON();
  }

  // Create generic system error for unstructured errors
  const sdkError = new RfidSdkError(
    'EVRFID-SYSTEM-003',
    error?.message || 'Unknown error',
    false,
    { originalError: error?.toString() }
  );

  return sdkError.toJSON();
}
