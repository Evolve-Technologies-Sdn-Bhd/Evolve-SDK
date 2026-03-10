# Evolve RFID SDK - Complete API Reference

**Version:** 1.0.0  
**Last Updated:** March 9, 2026  
**Target Audience:** External developers integrating the SDK into applications  
**Language:** JavaScript/TypeScript (Node.js 14+)  
**Status:** Production Ready

---

## Quick Start

```javascript
const { RfidSdk } = require('@evolve/sdk');

const sdk = new RfidSdk();

// Connect
await sdk.connectSerial('COM3', 115200, 'A0');

// Listen for tags
sdk.on('tag', (tag) => {
  console.log(`Tag: ${tag.epc} | RSSI: ${tag.rssi}dBm`);
});

// Start scanning
sdk.start();

// Stop and disconnect
sdk.stop();
await sdk.disconnect();
```

---

## Table of Contents

1. [Overview](#overview)
2. [SDK Initialization](#sdk-initialization)
3. [RFID Reader Connection APIs](#rfid-reader-connection-apis)
4. [RFID Tag Reading APIs](#rfid-tag-reading-apis)
5. [Reader Control APIs](#reader-control-apis)
6. [Data Handling APIs](#data-handling-apis)
7. [Error Handling](#error-handling)
8. [Advanced Features](#advanced-features)
9. [TypeScript Definitions](#typescript-definitions)
10. [Additional Resources](#additional-resources)

---

## Overview

The Evolve RFID SDK provides a unified interface for connecting to RFID readers through multiple transport protocols (Serial, TCP/IP, MQTT) and managing tag reading operations. The SDK emits raw tag data with minimal formatting, allowing complete flexibility for consumer applications.

### Key Design Principles

- **Transport Abstraction:** Single API works with Serial, TCP/IP, and MQTT readers
- **Raw Data Emission:** SDK provides unformatted data; consumers handle presentation
- **In-Memory Session Stats:** SDK maintains only session-level statistics (total reads, unique tags)
- **Event-Driven Architecture:** All operations use Node.js EventEmitter pattern
- **Automatic Throttling:** Duplicate tags are automatically suppressed within 500ms windows
- **Structured Error Handling:** All errors follow format `[HH:MM:SS][ERROR][CODE] - Message`

### Event-Driven Architecture

```
┌─────────────────────────────────────────────┐
│  Physical Reader (Serial/TCP/MQTT)          │
└──────────────────┬──────────────────────────┘
                   │
                   ├─> Tag Data
                   └─> Connection Status
                   
┌──────────────────▼──────────────────────────┐
│  Protocol Reader (A0, F5001, UF3-S)         │
│  (Decodes raw bytes into EPC identifiers)   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  RfidSdk (Main Entry Point)                 │
│  - Maintains session stats                  │
│  - Throttles duplicate tags                 │
│  - Emits events to consumers                │
└──────────────────┬──────────────────────────┘
                   │
                   ├─> 'tag' event
                   ├─> 'stats' event
                   ├─> 'connected' event
                   ├─> 'disconnected' event
                   └─> 'error' event
```

---

## SDK Initialization

### Class: `RfidSdk`

The main entry point for the RFID SDK. Initialize this class to establish connections and manage reader operations.

#### Constructor

```javascript
const { RfidSdk } = require('@evolve/sdk');

const sdk = new RfidSdk();
```

**Parameters:** None

**Returns:** RfidSdk instance

**Description:**  
Creates a new SDK instance. The SDK maintains an internal event emitter and session statistics. Only one reader can be connected at a time; connecting to a new reader automatically disconnects the previous one. Session statistics (total reads and unique tags) are maintained in memory only and reset when the SDK is reinitialized.

#### Example: Basic Initialization

```javascript
const { RfidSdk, RfidSdkError, ERROR_CODES } = require('@evolve/sdk');

// Create SDK instance
const sdk = new RfidSdk();

// Listen for tag events
sdk.on('tag', (rawTagData) => {
  console.log('Tag found:', rawTagData.epc);  // e.g., "DEADBEEF12345678"
  console.log('RSSI:', rawTagData.rssi);       // e.g., -65 dBm
  console.log('Timestamp:', rawTagData.timestamp); // Unix milliseconds
});

// Listen for statistics updates
sdk.on('stats', (stats) => {
  console.log(`Total reads: ${stats.total}, Unique tags: ${stats.unique}`);
});

// Listen for connection events
sdk.on('connected', () => {
  console.log('Reader connected and ready');
});

sdk.on('disconnected', () => {
  console.log('Reader disconnected');
});

// Listen for structured error events
sdk.on('error', (errorObj) => {
  // errorObj = { code, message, timestamp, recoverable, formatted, details }
  console.error(`[ERROR] ${errorObj.formatted}`);
  if (errorObj.recoverable) {
    console.log('Error is recoverable - system may auto-retry');
  }
});
```
```

---

## RFID Reader Connection APIs

The SDK supports three transport protocols for connecting to RFID readers. Each connection method handles the underlying transport layer details while presenting a unified interface.

### 1. TCP/IP Connection

#### Method: `connectTcp(host, port)`

Connect to an RFID reader over TCP/IP network.

```javascript
async connectTcp(host: string, port: number): Promise<boolean>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | Yes | IP address or hostname of the reader (e.g., "192.168.1.100") |
| `port` | number | Yes | TCP port number (typically 10001 or custom reader port) |

**Returns:** Promise resolving to `true` on success

**Throws:** RfidSdkError with code EVRFID-CONN-* or EVRFID-TCP-*

**Connection Timeout:** 12 seconds (with automatic retry logic)

**Description:**  
Establishes a TCP socket connection to a reader device. The SDK supports command-response protocol over TCP where readers send JSON or binary tag data frames. This method automatically handles frame parsing and tag extraction. Automatically disconnects any existing reader before connecting.

#### TCP Connection Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

// Listen for connection before connecting
sdk.on('connected', () => {
  console.log('TCP Reader connected');
  sdk.start(); // Begin scanning
});

sdk.on('error', (err) => {
  if (err.recoverable) {
    console.error('Temporary error (will retry):', err.message);
  } else {
    console.error('Permanent error:', err.message);
  }
});

sdk.on('tag', (tag) => {
  console.log(`Tag: ${tag.epc} | RSSI: ${tag.rssi}dBm`);
});

async function connect() {
  try {
    const result = await sdk.connectTcp('192.168.1.100', 10001);
    console.log('Connection result:', result);
  } catch (error) {
    console.error('Failed to connect:', error.message);
    // The SDK will emit error events for recoverable errors
    // and throw only for fatal errors (invalid config, no port, etc.)
  }
}

connect();
```

---

### 2. Serial Port Connection

#### Method: `connectSerial(path, baudRate, protocol)`

Connect to an RFID reader via serial port (RS-232/USB).

```javascript
async connectSerial(
  path: string,
  baudRate: number,
  protocol?: 'UF3-S' | 'F5001' | 'A0'
): Promise<void>
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Serial port path (e.g., "COM3" on Windows, "/dev/ttyUSB0" on Linux) |
| `baudRate` | number | Yes | - | Serial baud rate (typically 115200 or 9600) |
| `protocol` | string | No | 'A0' | Protocol dialect: 'A0' (standard), 'F5001' (Sunray), 'UF3-S' (SEUIC) |

**Returns:** Promise that resolves when connection is established

**Throws:** RfidSdkError with code EVRFID-SERIAL-*

**Description:**  
Opens a serial port connection to an RFID reader. The SDK automatically initializes the selected protocol parser and configures serial parameters (8 data bits, 1 stop bit, no parity). Different readers use different command protocols; specify the correct one for your hardware. Automatically disconnects any existing reader before connecting.

**Protocol Selection Guide:**

| Protocol | Reader Model | Typical Baud Rate | Notes |
|----------|--------------|-------------------|-------|
| 'A0' | Standard/Generic | 115200 | Default, most compatible |
| 'F5001' | Feig Electronics | 9600 or 115200 | Single-tag or multi-tag mode |
| 'UF3-S' | Kinexus UF3-S | 115200 | Antenna control, multi-scan capable |

#### Serial Connection Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

sdk.on('connected', () => {
  console.log('Serial reader ready');
  sdk.startScan();
});

sdk.on('tag', (tag) => {
  console.log(`EPC: ${tag.epc}`);
  console.log(`RSSI: ${tag.rssi}`);
  console.log(`Timestamp: ${tag.timestamp}`);
});

sdk.on('error', (err) => {
  console.error(`[${err.code}] ${err.message}`);
});

async function connect() {
  try {
    // Connect to reader using standard A0 protocol at 115200 baud
    await sdk.connectSerial('COM3', 115200, 'A0');
    // On Linux/macOS, use /dev/ttyUSB0 or similar
    // await sdk.connectSerial('/dev/ttyUSB0', 115200, 'A0');
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

connect();
```

---

### 3. MQTT Connection

#### Method: `connectMqtt(brokerUrl, topic, options)`

Connect to an RFID reader via MQTT message broker.

```javascript
async connectMqtt(
  brokerUrl: string,
  topic: string,
  options?: MqttConnectionConfig
): Promise<boolean>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `brokerUrl` | string | Yes | MQTT broker URL (e.g., "mqtt://broker.example.com" or "mqtts://secure-broker.com") |
| `topic` | string | Yes | MQTT topic to subscribe for tag data (e.g., "rfid/reader1/tags") |
| `options` | MqttConnectionConfig | No | Advanced connection options (see below) |

**Returns:** Promise resolving to `true` on success

**Throws:** RfidSdkError with code EVRFID-MQTT-*

**Description:**  
Connects to an MQTT broker and subscribes to a topic that receives RFID tag data. This enables distributed architectures where readers publish data to a central broker, and multiple consumers subscribe to tag events. Implements exponential backoff retry with max 3 attempts.

**MqttConnectionConfig Interface:**

```typescript
interface MqttConnectionConfig {
  brokerUrl: string;        // Required: mqtt://host or mqtts://host
  topic: string;            // Required: MQTT topic to subscribe
  username?: string;        // Optional: MQTT username for authentication
  password?: string;        // Optional: MQTT password for authentication
  clientId?: string;        // Optional: Custom client ID (auto-generated if omitted)
  keepalive?: number;       // Optional: Keep-alive interval in seconds (default: 30)
  reconnectPeriod?: number; // Optional: Reconnect interval in ms (default: 5000)
  connectTimeout?: number;  // Optional: Connection timeout in ms (default: 10000)
  rejectUnauthorized?: boolean; // Optional: Verify TLS cert (default: true)
  protocol?: 'mqtt' | 'mqtts' | 'tcp' | 'tls' | 'ws' | 'wss'; // Optional: Force protocol
  maxRetries?: number;      // Optional: Max retry attempts (default: 3)
  [key: string]: any;       // Additional mqtt.js IClientOptions
}
```

**Retry Behavior:**
- Implements exponential backoff retry logic (not continuous reconnection)
- Default max retries: 3
- Connection timeout: 10-12 seconds
- After max retries exceeded, emits error and rejects promise

#### MQTT Connection Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

sdk.on('connected', () => {
  console.log('Connected to MQTT broker');
  sdk.start();
});

sdk.on('tag', (tag) => {
  console.log(`Received tag via MQTT: ${tag.epc}`);
});

sdk.on('error', (err) => {
  console.error(`[${err.code}] ${err.message}`);
  // Recoverable errors may trigger automatic retry
});

// Basic MQTT connection
async function connectBasic() {
  try {
    await sdk.connectMqtt(
      'mqtt://broker.example.com',
      'rfid/reader1/tags'
    );
  } catch (error) {
    console.error('MQTT connection failed:', error.message);
  }
}

// Secure MQTT with authentication and TLS
async function connectSecure() {
  try {
    await sdk.connectMqtt(
      'mqtts://secure-broker.example.com:8883',
      'rfid/reader1/tags',
      {
        username: 'rfid_user',
        password: 'secure_password',
        clientId: 'evolve-reader-1',
        keepalive: 30,
        rejectUnauthorized: true,
        connectTimeout: 15000,
        maxRetries: 5
      }
    );
  } catch (error) {
    console.error('Secure connection failed:', error.message);
  }
}

connectSecure();
```

---

### Disconnect Method

#### Method: `disconnect()`

Gracefully disconnect from the reader and release resources.

```javascript
async disconnect(): Promise<void>
```

**Parameters:** None

**Returns:** Promise that resolves when disconnection is complete

**Description:**  
Closes the connection to the reader, stops any active scans, removes event listeners, and cleans up resources. This method should be called before switching readers or shutting down the application. Safe to call even if no reader is currently connected.

#### Disconnect Example

```javascript
async function shutdown() {
  console.log('Shutting down RFID reader...');
  
  sdk.stop(); // Stop scanning first (optional but recommended)
  
  await sdk.disconnect(); // Gracefully disconnect
  
  console.log('Reader disconnected, exiting');
  process.exit(0);
}

// Graceful shutdown on process termination
process.on('SIGINT', shutdown);   // Ctrl+C
process.on('SIGTERM', shutdown);  // Termination signal
```

---

## RFID Tag Reading APIs

Once connected, use these methods to control scanning and receive tag data.

### Starting and Stopping Scans

#### Method: `start()` / `startScan()`

Begin scanning for RFID tags.

```javascript
start(): void
startScan(): void // Alias for start()
```

**Parameters:** None

**Returns:** void (synchronous)

**Behavior:**
- Logs warning if no reader is connected
- Removes previous tag listener and registers a new one
- Applies automatic throttling: same tag within 500ms window is suppressed
- Emits 'tag' event for each unique tag after throttle window
- Emits 'stats' event after each tag update
- Session statistics are updated in real-time

**Description:**  
Initiates tag scanning from the connected reader. Both `start()` and `startScan()` are functional aliases for readability. The SDK automatically applies per-tag throttling to prevent flooding with duplicate tag events from rapid successive detections.

---

#### Method: `stop()` / `stopScan()`

Stop scanning for RFID tags.

```javascript
stop(): void
stopScan(): void // Alias for stop()
```

**Parameters:** None

**Returns:** void (synchronous)

**Behavior:**
- Removes the active tag listener
- Clears throttle state for fresh start on next `start()` call
- No 'tag' events are emitted after this call
- Session statistics are preserved

**Description:**  
Stops the scanning process. Clearing the throttle state ensures that when `start()` is called again, all tags will be treated as "fresh" (not throttled) on first detection.

---

### Tag Read Events

#### Event: `'tag'`

Emitted when a tag is read, passes validation, and is not throttled.

**Event Handler Signature:**

```javascript
sdk.on('tag', (rawTagData) => {
  // rawTagData structure:
  // {
  //   epc?: string,       // Electronic Product Code (primary identifier)
  //   id?: string,        // Alternative ID (protocol-specific)
  //   timestamp: number,  // Milliseconds since epoch
  //   rssi?: number,      // Signal strength in dBm
  //   raw: Buffer,        // Full raw data buffer
  //   id_full?: string    // Full payload data for debugging
  // }
});
```

**Parameters:**

| Property | Type | Description |
|----------|------|-------------|
| `epc` | string \| undefined | Primary tag identifier (typically 14 hex chars = 7 bytes). Extracted cleanly from protocol data. |
| `id` | string \| undefined | Alternative ID field used by some protocols. Fallback if `epc` unavailable. |
| `timestamp` | number | Unix timestamp in milliseconds when tag was detected. |
| `rssi` | number \| undefined | Received Signal Strength Indicator in dBm. Range: -50 (strong) to -90 (weak). May be undefined if reader doesn't support RSSI. |
| `raw` | Buffer | Complete raw binary data from reader. For protocol analysis and debugging. |
| `id_full` | string \| undefined | Full payload string including protocol headers. Used for debugging protocol issues. |

**Throttling:**
- Same EPC within 500ms is automatically suppressed
- Different EPCs emit freely (no rate limiting)
- Throttle state is cleared when `stop()` is called

#### Tag Read Event Examples

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

// Simple tag listener
sdk.on('tag', (tag) => {
  console.log('Tag detected:', tag.epc);
  console.log('Signal strength:', tag.rssi, 'dBm');
});

// Filter tags by signal strength
sdk.on('tag', (tag) => {
  const signalStrength = tag.rssi || -90;
  
  if (signalStrength > -70) {
    console.log('Strong signal:', tag.epc);
  } else if (signalStrength > -80) {
    console.log('Moderate signal:', tag.epc);
  } else {
    console.log('Weak signal:', tag.epc);
  }
});

// Track tag history with timestamps
const tagHistory = new Map();

sdk.on('tag', (tag) => {
  // Guard against undefined EPC
  const identifier = tag.epc || tag.id;
  if (!identifier || identifier === 'UNKNOWN') return;
  
  if (tagHistory.has(identifier)) {
    const lastSeen = tagHistory.get(identifier);
    const timeSinceLastSeen = tag.timestamp - lastSeen;
    console.log(`Tag ${identifier} seen again after ${timeSinceLastSeen}ms`);
  } else {
    console.log(`New tag detected: ${identifier}`);
  }
  
  tagHistory.set(identifier, tag.timestamp);
});

// Validate and process tag data
sdk.on('tag', async (tag) => {
  const identifier = tag.epc || tag.id;
  
  // Validate format
  if (!identifier || identifier === 'UNKNOWN' || identifier === 'ERROR') {
    console.warn('Invalid tag identifier:', tag);
    return;
  }
  
  // Process valid tag
  try {
    console.log(`Processing tag: ${identifier}`);
    // Insert into database, forward to API, etc.
  } catch (error) {
    console.error('Tag processing error:', error);
  }
});
```

---

### Session Statistics API

The SDK maintains in-memory session statistics (total tag reads and unique tag count) for current session. Statistics are NOT persistent and reset when the SDK is reinitialized.

#### Method: `getCumulativeStats()`

Retrieve current session statistics.

```javascript
getCumulativeStats(): { total: number; unique: number }
```

**Returns:** Object with:
- `total`: Total number of valid tags read in current session
- `unique`: Count of unique EPC identifiers encountered

**Description:**  
Returns cumulative counters for the current session. These statistics start at zero when the SDK is initialized and are updated in real-time as tags are detected. Only valid tags (with non-empty, non-UNKNOWN EPC) are counted. Statistics do NOT persist between application restarts.

---

#### Method: `resetCumulativeStats()`

Reset session statistics to zero.

```javascript
resetCumulativeStats(): void
```

**Parameters:** None

**Returns:** void (synchronous)

**Behavior:**
- Clears total count to 0
- Clears unique tags set
- Emits 'stats' event with reset values
- Does NOT affect historical data in database or persistent storage

**Description:**  
Resets the session counters to zero. This is useful for starting a fresh counting session while keeping the reader connected and scanning. Emits a 'stats' event to notify all listeners of the reset.

---

#### Event: `'stats'`

Emitted whenever statistics are updated or reset.

**Event Handler Signature:**

```javascript
sdk.on('stats', (stats) => {
  // stats = { total: number, unique: number }
  console.log(`Total reads: ${stats.total}, Unique tags: ${stats.unique}`);
});
```

**Emission Triggers:**
- After each valid tag is detected and processed
- When `resetCumulativeStats()` is called

---

#### Session Statistics Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

let scanStartTime = null;

sdk.on('connected', () => {
  scanStartTime = Date.now();
  sdk.start();
});

sdk.on('stats', (stats) => {
  const elapsedSeconds = (Date.now() - scanStartTime) / 1000;
  const readsPerSecond = (stats.total / elapsedSeconds).toFixed(2);
  
  console.log(`
    ═══════════════════════════════════
    Session Statistics:
    - Total reads: ${stats.total}
    - Unique tags: ${stats.unique}
    - Elapsed time: ${elapsedSeconds.toFixed(1)}s
    - Rate: ${readsPerSecond} tags/sec
    ═══════════════════════════════════
  `);
});

// Manual reset every 60 seconds for per-minute statistics
setInterval(() => {
  console.log('\n[Hourly statistics reset]');
  sdk.resetCumulativeStats();
  scanStartTime = Date.now();
}, 60000);

// Query at any time
function getReport() {
  const stats = sdk.getCumulativeStats();
  return {
    totalReads: stats.total,
    uniqueTags: stats.unique,
    reportTime: new Date().toISOString()
  };
}

// Export stats every 5 seconds
setInterval(() => {
  const report = getReport();
  console.log('[Report]', JSON.stringify(report));
}, 5000);
```

---

## Reader Control APIs

Configure reader behavior and manage scanning parameters.

#### Method: `configure(settings)`

Apply configuration settings to the connected reader.

```javascript
async configure(settings: Record<string, any>): Promise<void>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `settings` | object | Configuration object (structure depends on reader type) |

**Common Settings:**

| Setting | Type | Applicable To | Default | Description |
|---------|------|---------------|---------|----- -------|\n| `protocol` | 'UF3-S' \| 'F5001' \| 'A0' | Serial | 'A0' | Switch protocol dialect (Serial only, applied before connect) |
| `antenna` | number | UF3-S, F5001 | 1 | Antenna port to activate (1-4 typically) |
| `power` | number | Reader-specific | - | Set transmit power (check reader manual for valid range) |
| `timeout` | number | TCP, MQTT | 10000 | Command response timeout in ms |

**Returns:** Promise that resolves when configuration is applied

**Throws:** RfidSdkError if reader not connected or configuration fails

**Description:**  
Applies protocol-specific or reader-specific configuration. The base ReaderManager provides a default no-op implementation; subclasses (SerialReader, TcpReader, MqttReader) override this to apply transport-specific settings. Available settings depend on reader type and protocol.

#### Configure Example

```javascript
async function configureReader() {
  try {
    // Reselect protocol BEFORE connecting
    // (once connected, protocol is fixed for SerialReader)
    await sdk.configure({ protocol: 'F5001' });
    console.log('Configured to F5001 protocol');
    
    // Apply other settings after connection
    await sdk.connectSerial('COM3', 115200, 'F5001');
    
    // Set antenna (if supported by reader)
    await sdk.configure({ antenna: 1 });
    console.log('Antenna 1 enabled');
    
    // Set scan timeout
    await sdk.configure({ timeout: 5000 });
    console.log('Timeout set to 5 seconds');
    
    sdk.start();
  } catch (error) {
    console.error('Configuration error:', error.message);
  }
}
```

---

### Optional: Publishing Messages

#### Method: `publish(tag, topic)`

Publish tag data to a topic (MQTT readers only).

```javascript
async publish(tag: any, topic?: string): Promise<any>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tag` | object | Yes | Tag data object to publish (any structure) |
| `topic` | string | No | Override default topic for this message (MQTT only) |

**Returns:** Promise resolving with MQTT publish result

**Throws:** RfidSdkError if:
- No reader connected
- Reader does not support publishing (Serial, TCP readers throw error)
- MQTT publish fails

**Description:**  
For MQTT readers only, publishes tag data back to the broker. Useful for relay scenarios where the SDK forwards processed tags to other subscribers. Serial and TCP readers throw \"does not support publish\" error.

#### Publish Example

```javascript
sdk.on('tag', async (tag) => {
  // Process tag locally
  console.log('Processing:', tag.epc);
  
  // Perform some transformation or validation
  const processedTag = {
    epc: tag.epc,
    rssi: tag.rssi,
    processedAt: new Date().toISOString(),
    sourceReader: 'reader-1',
    validated: true
  };
  
  // Publish processed result back to broker (MQTT only)
  try {
    await sdk.publish(
      processedTag,
      'rfid/processed-tags'  // Optional: override topic
    );
    console.log('Published to rfid/processed-tags');
  } catch (error) {
    if (error.message.includes('does not support publish')) {
      // Not using MQTT reader, skip publishing
      console.log('Current reader does not support publishing');
    } else {
      console.error('Publish failed:', error.message);
    }
  }
});
```

---

## Data Handling APIs

### Raw Tag Data Structure

All tag events contain the following data structure:

```typescript
interface TagData {
  epc: string;           // 6-7 byte hex identifier (14 hex chars)
  rssi?: number;         // Signal strength (-50 to -90 dBm)
  timestamp: number;     // Unix timestamp in milliseconds
  raw: Buffer;           // Complete raw binary payload
  id?: string;           // Alternative ID (protocol-dependent)
  id_full?: string;      // Full payload string
}
```

### MQTT Message Format

When receiving tags via MQTT, the payload format depends on your reader configuration. The SDK expects JSON or binary format containing at minimum:

```json
{
  "epc": "XXXXXXXXXXXXXX",
  "rssi": -65,
  "timestamp": 1640000000000
}
```

### Serial Data Frame Format

Serial readers send binary frames formatted according to their protocol:

- **A0 Protocol:** `[HEADER] [LEN] [ADDR] [CMD] [DATA...] [CHECKSUM]`
- **F5001 Protocol:** Sunray proprietary format
- **UF3-S Protocol:** SEUIC command/response format

The SDK automatically parses these frames and extracts EPC identifiers.

### Data Processing Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const fs = require('fs');

const sdk = new RfidSdk();
const outputFile = 'tag_readings.jsonl'; // Line-delimited JSON

// Log raw frames to file
sdk.on('rawData', (packet) => {
  const logEntry = {
    packetId: packet.id,
    timestamp: packet.timestamp,
    direction: packet.direction, // 'RX' or 'TX'
    hexData: packet.data
  };
  fs.appendFileSync(outputFile, JSON.stringify(logEntry) + '\n');
});

// Process and validate tags
const validTags = new Set();

sdk.on('tag', (tag) => {
  // Validate EPC format (should be 14 hex chars)
  const epcRegex = /^[0-9A-Fa-f]{14}$/;
  
  if (!epcRegex.test(tag.epc)) {
    console.warn(`Invalid EPC format: ${tag.epc}`);
    return;
  }
  
  // Track valid unique tags
  validTags.add(tag.epc);
  
  // Log to file
  fs.appendFileSync(
    outputFile,
    JSON.stringify({
      type: 'TAG',
      epc: tag.epc,
      rssi: tag.rssi,
      timestamp: tag.timestamp,
      signalQuality: tag.rssi < -70 ? 'weak' : 'good'
    }) + '\n'
  );
});

// Query processed data
function getReport() {
  return {
    uniqueTags: validTags.size,
    totalReads: sdk.getCumulativeStats().total,
    exportedTo: outputFile
  };
}
```

---

## Error Handling

### Structured Error Format

All SDK errors are emitted with a **structured format** for consistent error handling, logging, and monitoring:

```
[HH:MM:SS][ERROR][CODE] - Message
```

**Example:**
```
[03:24:23][ERROR][EVRFID-CONN-001] - Failed to establish connection
[11:40:21][ERROR][EVRFID-SERIAL-002] - Serial port not found or unavailable
[14:15:09][ERROR][EVRFID-TCP-003] - Connection refused by remote host
```

### Error Object Structure

Each error emitted via the `error` event is a structured object:

```javascript
{
  code: 'EVRFID-CONN-001',              // Unique error code
  message: 'Failed to establish connection',  // Human-readable message
  timestamp: 1773027621112,             // JavaScript timestamp (ms)
  recoverable: true,                    // Boolean: can auto-retry
  formatted: '[03:24:23][ERROR][EVRFID-CONN-001] - Failed to establish connection',
  details: {                            // Context-specific data
    host: '192.168.1.100',
    port: 8088,
    attempts: 3,
    lastError: 'ECONNREFUSED'
  }
}
```

### Event: `'error'`

Emitted on connection failures, protocol errors, or other exceptions.

**Event Handler Signature:**

```javascript
sdk.on('error', (errorObj) => {
  // errorObj is a structured error object with code, message, timestamp, etc.
  console.error(`[ERROR] ${errorObj.formatted}`);
  console.log(`Code: ${errorObj.code}`);
  console.log(`Recoverable: ${errorObj.recoverable}`);
  console.log(`Details:`, errorObj.details);
});
```

### Error Code Reference

Errors are organized in **9 categories** with 46 total unique codes:

#### INITIALIZATION (EVRFID-INIT-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-INIT-001 | Failed to initialize SDK | ❌ No |
| EVRFID-INIT-002 | No transport configured | ❌ No |

#### CONNECTION (EVRFID-CONN-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-CONN-001 | Failed to establish connection | ✅ Yes |
| EVRFID-CONN-002 | Connection timeout | ✅ Yes |
| EVRFID-CONN-003 | Connection lost during operation | ✅ Yes |

#### SERIAL (EVRFID-SERIAL-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-SERIAL-001 | Invalid serial port configuration | ❌ No |
| EVRFID-SERIAL-002 | Serial port not found or unavailable | ❌ No |
| EVRFID-SERIAL-003 | Permission denied on serial port | ❌ No |
| EVRFID-SERIAL-004 | Invalid baud rate | ❌ No |
| EVRFID-SERIAL-005 | Serial port I/O error | ✅ Yes |

#### TCP (EVRFID-TCP-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-TCP-001 | Invalid TCP host/port configuration | ❌ No |
| EVRFID-TCP-002 | Host not found (DNS resolution failed) | ✅ Yes |
| EVRFID-TCP-003 | Connection refused by remote host | ✅ Yes |
| EVRFID-TCP-004 | Network unreachable | ✅ Yes |
| EVRFID-TCP-005 | Connection reset by peer | ✅ Yes |

#### MQTT (EVRFID-MQTT-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-MQTT-001 | Invalid MQTT broker URL | ❌ No |
| EVRFID-MQTT-002 | Failed to connect to MQTT broker | ✅ Yes |
| EVRFID-MQTT-003 | MQTT authentication failed | ❌ No |
| EVRFID-MQTT-004 | Invalid MQTT topic configuration | ❌ No |
| EVRFID-MQTT-005 | Failed to subscribe to MQTT topic | ✅ Yes |
| EVRFID-MQTT-006 | Failed to publish to MQTT topic | ✅ Yes |

#### READER/DEVICE (EVRFID-READER-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-READER-001 | Reader not responding (heartbeat timeout) | ✅ Yes |
| EVRFID-READER-002 | Invalid or unexpected reader response format | ✅ Yes |
| EVRFID-READER-003 | Unsupported reader model | ❌ No |
| EVRFID-READER-004 | Reader firmware version incompatible | ❌ No |
| EVRFID-READER-005 | Reader command execution failed | ✅ Yes |
| EVRFID-READER-006 | Reader reported internal error | ✅ Yes |

#### TAG READING (EVRFID-TAG-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-TAG-001 | Invalid tag data format | ❌ No |
| EVRFID-TAG-002 | Failed to extract EPC from tag data | ❌ No |
| EVRFID-TAG-003 | Tag data checksum validation failed | ❌ No |
| EVRFID-TAG-004 | Tag data parameter out of range | ❌ No |

#### DATA HANDLING (EVRFID-DATA-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-DATA-001 | Payload decryption failed | ❌ No |
| EVRFID-DATA-002 | Invalid encryption key format/size | ❌ No |
| EVRFID-DATA-003 | Invalid or empty payload buffer | ❌ No |
| EVRFID-DATA-004 | Unsupported payload format | ❌ No |
| EVRFID-DATA-005 | Database operation failed | ✅ Yes |

#### SYSTEM (EVRFID-SYSTEM-xxx)
| Code | Message | Recoverable |
|------|---------|-------------|
| EVRFID-SYSTEM-001 | Failed to emit event | ✅ Yes |
| EVRFID-SYSTEM-002 | Out of memory | ❌ No |
| EVRFID-SYSTEM-003 | Unhandled exception | ❌ No |

### Common Error Scenarios

#### 1. Connection Refused (TCP/MQTT)

**Error Codes:** `EVRFID-TCP-003`, `EVRFID-MQTT-002`

**Symptoms:** Reader is not accepting connections

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-TCP-003' || errorObj.code === 'EVRFID-MQTT-002') {
    console.error('Reader connection refused. Is it powered on?');
    console.log('Details:', errorObj.details);
    // errorObj.details: { host, port, attempts, lastError, broker, etc. }
    
    // Since it's recoverable, attempt retry
    if (errorObj.recoverable) {
      console.log('Will attempt auto-reconnect...');
    }
  }
});

// Example: Manual retry with exponential backoff
async function connectWithRetry(host, port, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sdk.connectTcp(host, port);
      console.log('Connected successfully');
      return;
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s...
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Failed to connect after ' + maxRetries + ' attempts');
}
```

#### 2. Serial Port Not Found

**Error Code:** `EVRFID-SERIAL-002`

**Symptoms:** Cable disconnected, invalid port path, or reader not in device list

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-SERIAL-002') {
    console.error('Serial port not found or unavailable');
    console.log('Attempting port:', errorObj.details.port);
    console.log('Baud rate:', errorObj.details.baudRate);
    
    // List available ports for user
    const { SerialPort } = require('serialport');
    SerialPort.list().then(ports => {
      console.log('Available serial ports:');
      ports.forEach(port => {
        console.log(`  - ${port.path} (${port.manufacturer || 'Unknown'})`);
      });
    });
  }
});
```

#### 3. Connection Timeout

**Error Codes:** `EVRFID-CONN-002`, `EVRFID-TCP-002`

**Symptoms:** Reader is not responding within timeout period

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-CONN-002') {
    console.error('Connection timeout - reader not responding');
    console.log(`Timeout after: ${errorObj.details.timeoutMs}ms`);
    console.log(`Attempts made: ${errorObj.details.attempts}`);
    
    // Check network connectivity
    console.log('Diagnostics:');
    console.log('  - Check if reader is powered on');
    console.log('  - Verify network/cable connectivity');
    console.log('  - Check firewall rules (for TCP/MQTT)');
  }
});
```

#### 4. Authentication Failure (MQTT)

**Error Code:** `EVRFID-MQTT-003`

**Symptoms:** MQTT broker rejected credentials

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-MQTT-003') {
    console.error('MQTT authentication failed');
    console.log('Broker:', errorObj.details.broker);
    console.error('Check username/password in connection options');
    
    // This error is NOT recoverable
    console.log('Recoverable:', errorObj.recoverable);
  }
});

// Correct usage:
async function connectMqttSecure() {
  try {
    await sdk.connectMqtt('mqtts://broker.example.com', 'rfid/tags', {
      username: 'correct_user',
      password: 'correct_password',
      connectTimeout: 30000
    });
  } catch (error) {
    console.error('MQTT error:', error.message);
  }
}
```

#### 5. Reader Not Responding

**Error Code:** `EVRFID-READER-001`

**Symptoms:** Connected but no heartbeat from reader (reader becomes unresponsive)

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-READER-001') {
    console.warn('Reader not responding - heartbeat timeout');
    console.log('Details:', errorObj.details);
    
    // Recoverable error - system can auto-reconnect
    if (errorObj.recoverable) {
      console.log('Attempting to reconnect...');
    }
  }
});
```

#### 6. Invalid Tag Format

**Error Code:** `EVRFID-TAG-003`

**Symptoms:** Tag data checksum failed or format corrupted

```javascript
sdk.on('error', (errorObj) => {
  if (errorObj.code === 'EVRFID-TAG-003') {
    console.error('Tag checksum validation failed');
    console.log('Raw frame:', errorObj.details.frame_hex);
    console.log('Calculated checksum:', errorObj.details.calculated_checksum);
    
    // This error is NOT recoverable - individual tag is corrupted
    // but connection continues operating for next tags
  }
});
```

#### 7. Disconnection Events

```javascript
sdk.on('disconnected', () => {
  console.log('Reader disconnected (cable removed or network lost)');
  
  // Optional: Attempt auto-reconnect
  setTimeout(async () => {
    try {
      console.log('Attempting to reconnect...');
      await sdk.connectTcp('192.168.1.100', 10001);
      sdk.startScan();
    } catch (error) {
      console.error('Reconnect failed:', error);
    }
  }, 5000);
});
```

### Error Recovery Best Practices

```javascript
class RfidReaderManager {
  constructor() {
    this.sdk = new RfidSdk();
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    this.sdk.on('error', (errorObj) => this.handleError(errorObj));
    this.sdk.on('disconnected', () => this.handleDisconnection());
  }

  handleError(errorObj) {
    const log = {
      timestamp: new Date(errorObj.timestamp).toISOString(),
      code: errorObj.code,
      message: errorObj.message,
      recoverable: errorObj.recoverable,
      details: errorObj.details,
      formatted: errorObj.formatted
    };

    // Log to file for debugging
    fs.appendFileSync('error_log.jsonl', JSON.stringify(log) + '\n');

    // Determine recovery strategy based on error code
    if (errorObj.recoverable) {
      console.warn(`[RECOVERABLE] ${errorObj.formatted}`);
      this.attemptRecovery(errorObj.code);
    } else {
      console.error(`[FATAL] ${errorObj.formatted}`);
      this.notifyAdministrator(errorObj);
    }
  }

  attemptRecovery(errorCode) {
    // Handle specific error codes with targeted recovery
    switch (errorCode) {
      case 'EVRFID-CONN-001':
      case 'EVRFID-CONN-002':
      case 'EVRFID-TCP-003':
      case 'EVRFID-MQTT-002':
        // Connection errors: reconnect after delay
        console.log('Reconnecting in 3 seconds...');
        setTimeout(() => this.reconnect(), 3000);
        break;
      
      case 'EVRFID-READER-001':
        // Reader not responding: try a reset command
        console.log('Reader unresponsive, attempting reset...');
        this.sendReaderReset();
        break;
      
      case 'EVRFID-SERIAL-005':
      case 'EVRFID-DATA-005':
        // I/O and database errors: may resolve themselves
        console.log('Transient I/O error, will retry next operation');
        break;
      
      default:
        // Generic recovery
        console.log('Attempting generic recovery...');
        this.reconnect();
    }
  }

  async reconnect() {
    try {
      console.log('Reconnecting...');
      await this.disconnect();
      await new Promise(r => setTimeout(r, 1000));
      await this.connect();
      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnect failed:', error);
    }
  }

  handleDisconnection() {
    console.warn('Connection lost, will retry in 5 seconds...');
    setTimeout(() => this.reconnect(), 5000);
  }

  async disconnect() {
    await this.sdk.disconnect();
  }

  async connect() {
    // Your connection logic - adjust based on your transport
    await this.sdk.connectTcp('192.168.1.100', 10001);
  }

  sendReaderReset() {
    // Protocol-specific reset command
    console.log('Sending reader reset command...');
  }

  notifyAdministrator(errorObj) {
    // Send alert for non-recoverable errors
    console.error(`ALERT: Non-recoverable error: ${errorObj.code}`);
    // Implement email/SMS/Slack notification here
  }
}

// Usage
const manager = new RfidReaderManager();
```

### Error Code Quick Lookup

**For Connection Issues:**
- Can't reach reader → Check `EVRFID-CONN-001`, `EVRFID-TCP-003`, `EVRFID-MQTT-002`
- Reader powering on, takes time → Check `EVRFID-CONN-002` (timeout)
- Reader disconnects during scan → Check `EVRFID-CONN-003`

**For Hardware Issues:**
- Serial port problems → Check `EVRFID-SERIAL-002`, `EVRFID-SERIAL-003`, `EVRFID-SERIAL-004`
- Cable/network issues → Check `EVRFID-TCP-004`, `EVRFID-TCP-005`
- Reader unresponsive → Check `EVRFID-READER-001`

**For Data Issues:**
- Tag corruption → Check `EVRFID-TAG-003`, `EVRFID-TAG-001`
- Decryption failures → Check `EVRFID-DATA-001`, `EVRFID-DATA-002`
- Database errors → Check `EVRFID-DATA-005`

### Getting Structured Error Access

Import error utilities in your application:

```javascript
// Node.js / TypeScript
const { 
  RfidSdk,
  RfidSdkError,
  ERROR_CODES,
  createSdkError,
  wrapNativeError
} = require('@evolve/sdk');

// Modern ES Modules
import { 
  RfidSdk,
  RfidSdkError,
  ERROR_CODES,
  createSdkError
} from '@evolve/sdk';
```

**Accessing error codes programmatically:**

```javascript
// Get full registry of all 46 error codes
console.log(ERROR_CODES);
// Output:
// {
//   CONNECTION_FAILED: { code: 'EVRFID-CONN-001', message: '...', recoverable: true },
//   CONNECTION_TIMEOUT: { code: 'EVRFID-CONN-002', ... },
//   ... (44 more codes)
// }

// Check if an error is recoverable
sdk.on('error', (errorObj) => {
  if (errorObj.recoverable) {
    console.log('This error can be auto-recovered');
  } else {
    console.log('This error requires manual intervention');
  }
});
```

---

## Advanced Features

### 1. Multiple Reader Support (Sequential)

While the SDK maintains a single active reader connection, you can switch between readers:

```javascript
async function switchReaders(fromPort, toPort) {
  try {
    console.log('Stopping current scan...');
    sdk.stop();
    
    await sdk.disconnect();
    console.log('Disconnected from', fromPort);
    
    console.log('Connecting to', toPort);
    await sdk.connectSerial(toPort, 115200, 'A0');
    
    sdk.start();
    console.log('Now reading from', toPort);
  } catch (error) {
    console.error('Switch failed:', error.message);
  }
}

// Example: Failover from COM3 to COM4
switchReaders('COM3', 'COM4');
```

### 2. Real-time Monitoring Dashboard

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

class DashboardMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      tagsRead: 0,
      uniqueTags: new Set(),
      lastTagTime: null,
      averageRssi: []
    };
  }

  attach(sdk) {
    sdk.on('tag', (tag) => this.recordTag(tag));
    sdk.on('stats', (stats) => this.updateStats(stats));
  }

  recordTag(tag) {
    this.metrics.tagsRead++;
    this.metrics.uniqueTags.add(tag.epc);
    this.metrics.lastTagTime = tag.timestamp;
    this.metrics.averageRssi.push(tag.rssi);
    
    // Keep only last 100 readings
    if (this.metrics.averageRssi.length > 100) {
      this.metrics.averageRssi.shift();
    }
  }

  updateStats(stats) {
    this.displayMetrics();
  }

  displayMetrics() {
    const uptime = (Date.now() - this.metrics.startTime) / 1000;
    const avgRssi = (
      this.metrics.averageRssi.reduce((a, b) => a + b, 0) /
      this.metrics.averageRssi.length
    ).toFixed(1);

    console.clear();
    console.log('╔════════════════════════════════╗');
    console.log('║    RFID Reader Dashboard       ║');
    console.log('╠════════════════════════════════╣');
    console.log(`║ Uptime:         ${uptime.toFixed(1).padEnd(18)}║`);
    console.log(`║ Tags Read:      ${this.metrics.tagsRead.toString().padEnd(18)}║`);
    console.log(`║ Unique Tags:    ${this.metrics.uniqueTags.size.toString().padEnd(18)}║`);
    console.log(`║ Avg RSSI:       ${avgRssi.padEnd(18)}║`);
    console.log('╚════════════════════════════════╝');
  }
}

const monitor = new DashboardMonitor();
await sdk.connectSerial('COM3', 115200, 'A0');
monitor.attach(sdk);
sdk.start();
```

### 3. Protocol Analysis and Debugging

```javascript
const { RfidSdk } = require('@evolve/sdk');
const fs = require('fs');
const sdk = new RfidSdk();

// Capture raw protocol data for analysis
const protocolCapture = [];

sdk.on('rawData', (packet) => {
  protocolCapture.push({
    id: packet.id,
    timestamp: packet.timestamp,
    direction: packet.direction, // RX or TX
    data: packet.data,
    length: packet.data.split(' ').length
  });
});

// Export capture for Wireshark or analysis tools
function exportCapture() {
  const summary = {
    captureTime: new Date().toISOString(),
    totalPackets: protocolCapture.length,
    inbound: protocolCapture.filter(p => p.direction === 'RX').length,
    outbound: protocolCapture.filter(p => p.direction === 'TX').length,
    packets: protocolCapture
  };

  fs.writeFileSync(
    'protocol_capture.json',
    JSON.stringify(summary, null, 2)
  );

  console.log('Capture exported to protocol_capture.json');
}

// Start debug capture
await sdk.connectSerial('COM3', 115200, 'A0');
sdk.start();

// Export after 30 seconds
setTimeout(exitCapture, 30000);

async function exitCapture() {
  sdk.stop();
  exportCapture();
  await sdk.disconnect();
}
```

### 4. Tag Data Database Integration

```javascript
const { RfidSdk } = require('@evolve/sdk');
const Database = require('better-sqlite3');

const sdk = new RfidSdk();
const db = new Database('rfid_tags.db');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    epc TEXT NOT NULL,
    rssi INTEGER,
    first_seen INTEGER,
    last_seen INTEGER,
    visit_count INTEGER DEFAULT 1
  );
  
  CREATE INDEX IF NOT EXISTS idx_epc ON tags(epc);
`);

// Prepared statements for efficiency
const insertTag = db.prepare(`
  INSERT INTO tags (epc, rssi, first_seen, last_seen, visit_count)
  VALUES (?, ?, ?, ?, 1)
`);

const updateTag = db.prepare(`
  UPDATE tags
  SET last_seen = ?, visit_count = visit_count + 1, rssi = ?
  WHERE epc = ?
`);

const findTag = db.prepare('SELECT * FROM tags WHERE epc = ?');

// Process incoming tags
sdk.on('tag', (tag) => {
  const existing = findTag.get(tag.epc);
  const now = Date.now();

  if (existing) {
    updateTag.run(now, tag.rssi, tag.epc);
  } else {
    insertTag.run(tag.epc, tag.rssi, now, now);
  }
});

// Query example
function getTopTags(limit = 10) {
  return db.prepare(`
    SELECT epc, visit_count, last_seen, rssi
    FROM tags
    ORDER BY visit_count DESC
    LIMIT ?
  `).all(limit);
}

console.log('Top tags:', getTopTags(5));
```

### 5. Throttling and Rate Limiting

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

class ThrottledTagHandler {
  constructor() {
    this.tagTimings = new Map(); // epc -> [timestamps...]
    this.processedTags = 0;
  }

  // Emit only N unique tags per second
  handleTag(tag, maxPerSecond = 10) {
    const key = `${Math.floor(Date.now() / 1000)}`; // 1-second window
    
    if (!this.tagTimings.has(key)) {
      this.tagTimings.set(key, []);
    }

    const timings = this.tagTimings.get(key);
    
    // Only process if under limit
    if (timings.length < maxPerSecond) {
      timings.push(tag.epc);
      this.processedTags++;
      return tag;
    }

    return null; // Dropped due to rate limit
  }

  getStats() {
    return {
      processedTags: this.processedTags,
      droppedTags: sdk.getCumulativeStats().total - this.processedTags
    };
  }
}

const throttler = new ThrottledTagHandler();

sdk.on('tag', (tag) => {
  const processed = throttler.handleTag(tag, 50); // Max 50 tags/sec
  
  if (processed) {
    // Handle tag...
    console.log('Processing tag:', tag.epc);
  } else {
    // Tag was rate-limited
    // console.log('Dropped tag:', tag.epc);
  }
});
```

---

## Advanced Utilities and Exports

### Error Handling Utilities

The SDK exports comprehensive error handling utilities for structured error management:

#### Exports

```javascript
const {
  RfidSdk,
  RfidSdkError,
  createSdkError,
  wrapNativeError,
  serializeError,
  ERROR_CODES,
  type RfidSdkErrorObject,
  type ErrorDetails,
  MqttConnectionManager,
  DatabaseSeeder,
  createSeeder
} = require('@evolve/sdk');
```

#### `RfidSdkError` Class

Extended Error class with structured error support.

```javascript
const error = new RfidSdkError(
  code: string,                 // E.g., 'EVRFID-CONN-001'
  message: string,              // Human-readable message
  recoverable: boolean = false, // Can system auto-retry?
  details?: Record<string, any> // Context-specific data
);

// Methods:
error.code           // Error code (EVRFID-*)
error.message        // Message text
error.timestamp      // Milliseconds since epoch
error.details        // Additional context
error.recoverable    // true if auto-recoverable
error.toString()     // Formatted: [HH:MM:SS][ERROR][CODE] - message
error.toJSON()       // Full structured object
error.isRecoverable()// Check if recoverable
```

#### `createSdkError()` Function

Factory function to create SDK errors from error code registry.

```javascript
const error = createSdkError(
  'CONNECTION_FAILED',  // Error key from ERROR_CODES
  {                     // Optional context
    host: '192.168.1.100',
    port: 10001,
    reason: 'Connection refused'
  }
);
```

#### `wrapNativeError()` Function

Wrap native JavaScript errors in SDK format.

```javascript
try {
  // Some operation that throws
  await someAsyncOperation();
} catch (nativeError) {
  const sdkError = wrapNativeError(
    nativeError,
    'CONNECTION_FAILED', // Error key
    { operation: 'tcp_connect', host: '192.168.1.100' }
  );
  // sdkError.details.originalError contains original message
}
```

#### `ERROR_CODES` Registry

Complete error code registry with definitions.

```javascript
ERROR_CODES.CONNECTION_FAILED
// Returns: {
//   code: 'EVRFID-CONN-001',
//   message: 'Failed to establish connection',
//   recoverable: true
// }

// List all available codes:
Object.keys(ERROR_CODES).forEach(key => {
  const { code, message, recoverable } = ERROR_CODES[key];
  console.log(`${code}: ${message} (${recoverable ? 'recoverable' : 'fatal'})`);
});
```

---

### Database Seeder Utility

#### Class: `DatabaseSeeder`

Manages seed data for testing and bulk import of RFID events.

```javascript
const { DatabaseSeeder, createSeeder } = require('@evolve/sdk');

// Create seeder with database reference
const seeder = new DatabaseSeeder(databaseInstance);

// Or use factory function
const seeder = createSeeder(databaseInstance);
```

#### Method: `importFromJson(filePath)`

Import seed data from a JSON file.

```javascript
async importFromJson(filePath: string): Promise<{ 
  success: boolean; 
  count: number; 
  error?: string 
}>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `filePath` | string | Path to JSON seed data file |

**Expected JSON Format:**

```json
{
  "events": [
    {
      "epc": "DEADBEEF12345678",
      "readerId": "reader-1",
      "antenna": 1,
      "rssi": -65
    },
    {
      "epc": "DEADBEEF87654321",
      "readerId": "reader-1",
      "antenna": 2,
      "rssi": -45
    }
  ],
  "metadata": {
    "description": "Test data",
    "createdAt": "2026-03-09T00:00:00Z",
    "tags": ["test", "demo"]
  }
}
```

**Returns:** Promise resolving to:
- `success`: true if import succeeded
- `count`: Number of events imported
- `error`: Error message if failed

**Example:**

```javascript
const seeder = new DatabaseSeeder(myDatabase);

try {
  const result = await seeder.importFromJson('./seed-data.json');
  if (result.success) {
    console.log(`Imported ${result.count} events`);
  } else {
    console.error('Import failed:', result.error);
  }
} catch (error) {
  console.error('Seeder error:', error.message);
}
```

---

### MQTT Connection Manager

#### Class: `MqttConnectionManager`

Advanced MQTT connection management with configurable retry logic.

```javascript
const { MqttConnectionManager } = require('@evolve/sdk');

const manager = new MqttConnectionManager();

// Connect with full configuration
await manager.connect({
  brokerUrl: 'mqtts://broker.example.com:8883',
  topic: 'rfid/tags',
  username: 'user',
  password: 'pass',
  clientId: 'evolve-reader-1',
  keepalive: 30,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: true,
  maxRetries: 3
});

// Manage connection
manager.onConnectionStatusChange((status) => {
  console.log('Connected:', status.connected);
});

manager.onMessage((topic, payload) => {
  console.log(`Message on ${topic}:`, payload.toString());
});

// Graceful disconnect
await manager.disconnect();
```

#### Methods:

- `connect(config)` - Establish MQTT connection
- `disconnect()` - Close connection
- `publish(topic, payload)` - Publish message
- `subscribe(topic)` - Subscribe to topic
- `onConnectionStatusChange(callback)` - Listen for status changes
- `onMessage(callback)` - Listen for messages

---

## Event Management API

The SDK implements Node.js EventEmitter pattern for all event handling.

#### Method: `on(event, callback)`

Register event listener.

```javascript
on(event: string, callback: (...args: any[]) => void): this
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | string | Event name (see Event Reference below) |
| `callback` | function | Handler function |

**Returns:** Instance for chaining

**Example:**

```javascript
sdk.on('tag', (tag) => {
  console.log('Tag:', tag.epc);
}).on('stats', (stats) => {
  console.log('Stats:', stats);
}).on('error', (err) => {
  console.error('Error:', err.message);
});
```

#### Method: `off(event, callback)` / `removeListener(event, callback)`

Remove event listener.

```javascript
off(event: string, callback: (...args: any[]) => void): this
removeListener(event: string, callback: (...args: any[]) => void): this
```

Both methods are functional aliases.

**Example:**

```javascript
const handler = (tag) => console.log('Tag:', tag.epc);

sdk.on('tag', handler);

// Later: remove listener
sdk.off('tag', handler);
```

---

## Complete Event Reference

| Event | Emitter | Parameters | When Fired |
|-------|---------|------------|-----------|
| `'tag'` | SDK | `(tagData)` | Valid tag detected and throttle window passed |
| `'stats'` | SDK | `(stats)` | After each tag processed; on stats reset |
| `'connected'` | SDK | none | Reader connection established |
| `'disconnected'` | SDK | none | Reader disconnected (cable removed or error) |
| `'error'` | SDK | `(errorObj)` | Connection error, protocol error, or exception |

---

## Summary of Main APIs

| Category | API | Purpose |
|----------|-----|---------|
| **Initialization** | `new RfidSdk()` | Create SDK instance |
| **Event Management** | `on(event, callback)` | Register event listener |
| | `off(event, callback)` | Remove event listener |
| | `removeListener(event, callback)` | Remove listener (alias) |
| **Connections** | `connectTcp(host, port)` | TCP/IP reader connection |
| | `connectSerial(path, baud, protocol)` | Serial reader connection |
| | `connectMqtt(brokerUrl, topic, options)` | MQTT broker connection |
| | `disconnect()` | Close connection gracefully |
| **Scanning** | `start()` / `startScan()` | Begin tag scanning |
| | `stop()` / `stopScan()` | Stop tag scanning |
| **Events** | `on('tag', ...)` | New tag detected (raw data) |
| | `on('stats', ...)` | Statistics updated |
| | `on('connected', ...)` | Reader connected |
| | `on('disconnected', ...)` | Reader disconnected |
| | `on('error', ...)` | Error occurred (structured) |
| **Statistics** | `getCumulativeStats()` | Get session stats {total, unique} |
| | `resetCumulativeStats()` | Reset session stats to zero |
| **Configuration** | `configure(settings)` | Apply reader-specific settings |
| | `publish(tag, topic)` | Publish to MQTT (MQTT only) |

---

## Troubleshooting Guide

### Issue: No tags detected

**Possible Causes:**
- Reader powered off or disconnected
- Wrong baud rate or port
- Tags not in antenna range
- Reader in standby mode

**Solutions:**
1. Verify connection via console logs
2. Check reader LED indicators
3. Move tags closer to antenna (within 30cm typically)
4. Use protocol analyzer to inspect protocol frames

### Issue: High number of duplicate tags

**Possible Causes:**
- Throttle timeout too short
- Multiple antennas detecting same tag
- Reader polling same area multiple times

**Solution:**
```javascript
// Increase throttle window in SDK source if needed
// or handle duplicates in application:
const seenTags = new Set();

sdk.on('tag', (tag) => {
  if (!seenTags.has(tag.epc)) {
    seenTags.add(tag.epc);
    // Process new tag
    console.log('New tag:', tag.epc);
  }
});

// Clear after X seconds
setInterval(() => seenTags.clear(), 10000);
```

### Issue: Connection drops frequently

**Possible Causes:**
- Loose cable connections
- Electrical interference
- Reader resource limits
- Network issues (MQTT)

**Solutions:**
1. Implement automatic reconnection logic
2. Use shielded cables for serial connections
3. Check for EMI sources near reader
4. Increase MQTT keepalive timeout

---

## TypeScript Definitions

All SDK classes and interfaces are fully typed with TypeScript definitions located in `/dist/index.d.ts`:

### Core Type Definitions

```typescript
interface TagData {
  id: string;              // Unique tag ID
  epc?: string;            // Electronic Product Code
  timestamp: number;       // Milliseconds since epoch
  raw: string;             // Raw hex string
  rssi?: number;           // Signal strength (dBm)
  id_full?: string;        // Full ID with protocol prefix
}

interface RawPacket {
  id: string;              // Packet ID
  timestamp: number;       // Receive timestamp
  direction: 'RX' | 'TX';  // Receive or transmit
  data: Buffer;            // Raw packet data
}

interface CumulativeStats {
  total: number;           // Total tags read in session
  unique: number;          // Count of unique EPCs
}

interface MqttConnectionConfig {
  username?: string;
  password?: string;
  clientId?: string;
  keepalive?: number;
  reconnect?: boolean;
  protocol?: 'mqtt' | 'mqtts';
  ca?: string | Buffer[];
  cert?: string | Buffer;
  key?: string | Buffer;
  rejectUnauthorized?: boolean;
  [key: string]: any;
}

interface ReaderMessage {
  code: string;            // Error code (e.g., 'EVRFID-CONN-001')
  message: string;         // Human-readable message
  recoverable: boolean;    // Can be retried
  details?: any;           // Additional context
}
```

### Error Type Definitions

```typescript
class RfidSdkError extends Error {
  code: string;
  message: string;
  recoverable: boolean;
  details?: any;
  formatted: string;       // Pre-formatted [HH:MM:SS][ERROR][CODE] - message

  toString(): string;
  toJSON(): object;
  getLogEntry(): {code: string; message: string};
  isRecoverable(): boolean;
}

// Error creation utilities
function createSdkError(key: string, details?: any): RfidSdkError;
function wrapNativeError(err: Error, key: string, details?: any): RfidSdkError;
function serializeError(err: any): string;

// Full ERROR_CODES registry with 46 codes across 9 categories
const ERROR_CODES: {
  [key: string]: {code: string; message: string; recoverable: boolean}
};
```

### RfidSdk Type Definition

```typescript
class RfidSdk extends EventEmitter {
  constructor();
  
  // Connection methods
  connectTcp(host: string, port: number): Promise<boolean>;
  connectSerial(port: string, baudRate?: number, protocol?: string): Promise<void>;
  connectMqtt(brokerUrl: string, topic: string, options?: MqttConnectionConfig): Promise<boolean>;
  disconnect(): Promise<void>;
  
  // Scanning control
  start(): void;
  startScan(): void;
  stop(): void;
  stopScan(): void;
  
  // Data access
  getCumulativeStats(): CumulativeStats;
  resetCumulativeStats(): void;
  
  // Configuration
  configure(settings: {[key: string]: any}): void;
  
  // MQTT publishing
  publish(tag: TagData, topic?: string): void;
  
  // Event registration (inherited from EventEmitter)
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
}
```

### Utility Type Definitions

```typescript
class DatabaseSeeder {
  importFromJson(filePath: string): void;
}

class MqttConnectionManager {
  connect(brokerUrl: string, options?: MqttConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, message: string | Buffer): Promise<void>;
  subscribe(topic: string): Promise<void>;
  onConnectionStatusChange(callback: (status: boolean) => void): void;
  onMessage(callback: (topic: string, message: Buffer) => void): void;
}

function createSeeder(): DatabaseSeeder;
```

### Event Type Definitions

```typescript
// Tag read event
emit('tag', (tag: TagData) => {}): void;

// Statistics update
emit('stats', (stats: CumulativeStats) => {}): void;

// Connection established
emit('connected', (readerInfo: any) => {}): void;

// Connection lost
emit('disconnected', (reason: string) => {}): void;

// Error occurred
emit('error', (error: RfidSdkError) => {}): void;
```

### Usage Example with TypeScript

```typescript
import { RfidSdk, createSdkError, RfidSdkError, TagData } from '@evolve/sdk';

const sdk = new RfidSdk();

try {
  await sdk.connectSerial('/dev/ttyUSB0', 115200, 'A0');
  
  sdk.on('tag', (tag: TagData) => {
    console.log(`EPC: ${tag.epc}, RSSI: ${tag.rssi}dBm`);
  });
  
  sdk.on('error', (err: RfidSdkError) => {
    console.error(`Error: ${err.code} - ${err.message}`);
    if (err.isRecoverable()) {
      console.log('Attempting recovery...');
    }
  });
  
  const stats = sdk.getCumulativeStats();
  console.log(`Total: ${stats.total}, Unique: ${stats.unique}`);
  
} catch (error) {
  if (error instanceof RfidSdkError) {
    console.error(`SDK Error: ${error.formatted}`);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Additional Resources

- **Source Code:** `sdk/src/` directory
- **TypeScript Definitions:** Auto-generated in `dist/index.d.ts`
- **Error Codes:** Complete registry in `sdk/src/errors/RfidSdkError.ts`
- **Serial Protocols:** Documentation in `docs/SERIAL_CONNECTION_GUIDE.md`, `docs/MQTT_QUICKSTART.md`
- **Integration Examples:** Check `docs/INTEGRATION_EXAMPLE.md` for real-world usage
- **Node.js EventEmitter:** https://nodejs.org/api/events.html
- **MQTT Specification:** https://mqtt.org/
- **TypeScript Guide:** https://www.typescriptlang.org/

---

**End of API Reference**

For support or SDK updates, refer to the project repository or contact your system administrator.
