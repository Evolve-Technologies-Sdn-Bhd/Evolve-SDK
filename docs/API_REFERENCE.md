# Evolve RFID SDK - Complete API Reference

**Version:** 0.1.0  
**Target Audience:** External developers integrating the SDK into applications  
**Language:** JavaScript/TypeScript (Node.js)  

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

---

## Overview

The Evolve RFID SDK provides a unified interface for connecting to RFID readers through multiple transport protocols (Serial, TCP/IP, MQTT) and managing tag reading operations. The SDK emits raw tag data with minimal formatting, allowing complete flexibility for consumer applications.

### Key Design Principles

- **Transport Abstraction:** Single API works with Serial, TCP/IP, and MQTT readers
- **Raw Data Emission:** SDK provides unformatted data; consumers handle presentation
- **Stateless Architecture:** SDK maintains only session-level statistics in memory
- **Event-Driven:** All operations use Node.js EventEmitter pattern

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
Creates a new SDK instance. The SDK maintains an internal event emitter and reader state. Only one reader can be connected at a time; connecting to a new reader automatically disconnects the previous one.

#### Example: Basic Initialization

```javascript
const { RfidSdk } = require('@evolve/sdk');

// Create SDK instance
const sdk = new RfidSdk();

// Listen for tag events
sdk.on('tag', (rawTagData) => {
  console.log('Tag found:', rawTagData.epc);
  console.log('RSSI:', rawTagData.rssi);
  console.log('Timestamp:', rawTagData.timestamp);
});

// Listen for connection events
sdk.on('connected', () => {
  console.log('Reader connected and ready');
});

sdk.on('disconnected', () => {
  console.log('Reader disconnected');
});

sdk.on('error', (error) => {
  console.error('SDK Error:', error.message);
});
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

**Errors Thrown:**
- `Error`: Connection refused (port not open/reader unreachable)
- `Error`: DNS resolution failed (invalid hostname)
- `Error`: Connection timeout (reader not responding)
- `Error`: Reader already connected (disconnect first)

**Description:**  
Establishes a TCP socket connection to a reader device. The SDK supports command-response protocol over TCP where readers send JSON or binary tag data frames. This method automatically handles frame parsing and tag extraction.

#### TCP Connection Example

```javascript
const { RfidSdk } = require('@evolve/sdk');

const sdk = new RfidSdk();

// Connect to reader at 192.168.1.100:10001
sdk.on('connected', () => {
  console.log('TCP Reader connected');
  sdk.start(); // Begin scanning
});

sdk.on('error', (err) => {
  console.error('Connection error:', err.message);
});

sdk.on('tag', (tag) => {
  console.log(`Tag: ${tag.epc} | RSSI: ${tag.rssi}dBm`);
});

try {
  await sdk.connectTcp('192.168.1.100', 10001);
} catch (error) {
  console.error('Failed to connect:', error.message);
  // Retry logic here
}
```

---

### 2. Serial Port Connection

#### Method: `connectSerial(path, baudRate, protocol)`

Connect to an RFID reader via serial port (RS-232/USB).

```javascript
async connectSerial(
  path: string,
  baudRate: number,
  protocol: 'UF3-S' | 'F5001' | 'A0' = 'A0'
): Promise<void>
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | Yes | - | Serial port path (e.g., "COM3" on Windows, "/dev/ttyUSB0" on Linux) |
| `baudRate` | number | Yes | - | Serial baud rate (typically 115200 or 9600) |
| `protocol` | string | No | 'A0' | Protocol dialect: 'A0' (standard), 'F5001' (Feig), 'UF3-S' (Kinexus) |

**Returns:** Promise that resolves when connection is established

**Errors Thrown:**
- `Error`: Port not found (invalid path)
- `Error`: Port already open (address in use)
- `Error`: Permission denied (user lacks serial port access)
- `Error`: Invalid baud rate

**Description:**  
Opens a serial port connection to an RFID reader. The SDK automatically initializes the selected protocol parser and configures serial parameters (8 data bits, 1 stop bit, no parity). Different readers use different command protocols; specify the correct one for your hardware.

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
  console.error('Serial error:', err.message);
  // May attempt auto-reconnect or user intervention
});

async function connect() {
  try {
    // Connect to reader using standard A0 protocol at 115200 baud
    await sdk.connectSerial('COM3', 115200, 'A0');
  } catch (error) {
    console.error('Connection failed:', error.message);
  }
}

// On Linux/macOS, use /dev/ttyUSB0 or similar
// await sdk.connectSerial('/dev/ttyUSB0', 115200, 'A0');

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

**Errors Thrown:**
- `Error`: Invalid broker URL format
- `Error`: Connection refused (broker unreachable)
- `Error`: MQTT authentication failed (invalid credentials)
- `Error`: Topic subscription failed
- `Error`: Network timeout

**Description:**  
Connects to an MQTT broker and subscribes to a topic that receives RFID tag data. This enables distributed architectures where readers publish data to a central broker, and multiple consumers subscribe to tag events.

**MqttConnectionConfig Interface:**

```typescript
interface MqttConnectionConfig {
  brokerUrl: string;        // Required: mqtt://host or mqtts://host
  topic: string;            // Required: MQTT topic to subscribe
  username?: string;        // Optional: MQTT username
  password?: string;        // Optional: MQTT password
  clientId?: string;        // Optional: Custom client ID (auto-generated)
  keepalive?: number;       // Optional: Keep-alive in seconds (default: 30)
  reconnectPeriod?: number; // Optional: Reconnect interval in ms (default: 5000)
  connectTimeout?: number;  // Optional: Connection timeout in ms (default: 30000)
  rejectUnauthorized?: boolean; // Optional: Verify TLS cert (default: true)
  protocol?: 'mqtt' | 'mqtts' | 'tcp' | 'tls' | 'ws' | 'wss'; // Optional: Force protocol
  maxRetries?: number;      // Optional: Max retry attempts (default: 3)
}
```

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
  console.error('MQTT error:', err.message);
});

// Basic MQTT connection
async function connectViaHttp() {
  try {
    await sdk.connectMqtt(
      'mqtt://broker.example.com',
      'rfid/reader1/tags'
    );
  } catch (error) {
    console.error('MQTT connection failed:', error.message);
  }
}

// Secure MQTT with authentication
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
Closes the connection to the reader and cleans up event listeners. This should be called before switching to a different reader or shutting down the application.

#### Disconnect Example

```javascript
async function shutdown() {
  console.log('Shutting down RFID reader...');
  
  sdk.stop(); // Stop scanning (optional)
  
  await sdk.disconnect(); // Disconnect reader
  
  console.log('Reader disconnected, exiting');
  process.exit(0);
}

// Call on process termination
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
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

**Returns:** void

**Errors:** Logs warning if no reader connected

**Description:**  
Initiates tag scanning from the reader. Both `start()` and `startScan()` are functional aliases for readability. The SDK will emit 'tag' events for each unique tag detected. Duplicate tags within a throttle window (500ms by default) are suppressed to reduce event flooding.

---

#### Method: `stop()` / `stopScan()`

Stop scanning for RFID tags.

```javascript
stop(): void
stopScan(): void // Alias for stop()
```

**Parameters:** None

**Returns:** void

**Description:**  
Stops the scanning process. No 'tag' events will be emitted after calling this method. Internal throttling state is cleared for a fresh start on the next `start()` call.

---

### Tag Read Events

#### Event: `'tag'`

Emitted when a tag is read and passes validation.

**Event Handler Signature:**

```javascript
sdk.on('tag', (rawTagData) => {
  // rawTagData structure:
  // {
  //   epc: string,        // Electronic Product Code (6-7 bytes, hex)
  //   rssi?: number,      // Signal strength in dBm (typically -50 to -90)
  //   timestamp: number,  // Milliseconds since epoch
  //   raw: Buffer,        // Full raw data buffer
  //   id?: string,        // Alternative ID field
  //   id_full?: string    // Full payload data for debugging
  // }
});
```

**Parameters:**

| Property | Type | Description |
|----------|------|-------------|
| `epc` | string | Primary tag identifier (7 bytes = 14 hex characters). Unique per physical tag. |
| `rssi` | number | Received Signal Strength Indicator in dBm. Range: -50 (strong) to -90 (weak). |
| `timestamp` | number | Unix timestamp in milliseconds when tag was detected. |
| `raw` | Buffer | Complete raw binary data from reader. For protocol analysis. |
| `id` | string | Alternative identifier (used by some protocols). |
| `id_full` | string | Full payload including protocol headers. For debugging. |

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
  const now = new Date(tag.timestamp);
  
  if (tagHistory.has(tag.epc)) {
    const lastSeen = tagHistory.get(tag.epc);
    const timeSinceLastSeen = tag.timestamp - lastSeen;
    console.log(`Tag ${tag.epc} seen again after ${timeSinceLastSeen}ms`);
  } else {
    console.log(`New tag detected: ${tag.epc}`);
  }
  
  tagHistory.set(tag.epc, tag.timestamp);
});

// Extract and process tag data
sdk.on('tag', async (tag) => {
  // Validate EPC format
  if (!tag.epc || tag.epc === 'UNKNOWN') {
    console.warn('Invalid tag EPC:', tag);
    return;
  }
  
  // Insert into database
  try {
    await database.insertTag({
      epc: tag.epc,
      rssi: tag.rssi,
      timestamp: tag.timestamp,
      raw_data: tag.raw.toString('hex')
    });
  } catch (error) {
    console.error('Database error:', error);
  }
});
```

---

### Session Statistics API

The SDK maintains in-memory session statistics (total tag reads and unique tag count).

#### Method: `getCumulativeStats()`

Retrieve current session statistics.

```javascript
getCumulativeStats(): { total: number; unique: number }
```

**Returns:** Object with:
- `total`: Total number of tags read in current session
- `unique`: Count of unique EPC identifiers

**Description:**  
Returns cumulative counters for the current session. These statistics start at zero when the SDK is initialized and reset only when `resetCumulativeStats()` is called. Statistics do NOT persist between application restarts; for persistent tracking, store data in a database.

---

#### Method: `resetCumulativeStats()`

Reset session statistics to zero.

```javascript
resetCumulativeStats(): void
```

**Parameters:** None

**Returns:** void

**Description:**  
Clears the total count and unique tags set. Emits a 'stats' event to notify listeners of the reset.

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

#### Session Statistics Example

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

let scanStartTime = null;

sdk.on('connected', () => {
  scanStartTime = Date.now();
});

sdk.on('stats', (stats) => {
  const elapsedSeconds = (Date.now() - scanStartTime) / 1000;
  const readsPerSecond = (stats.total / elapsedSeconds).toFixed(2);
  
  console.log(`
    Session Statistics:
    - Total reads: ${stats.total}
    - Unique tags: ${stats.unique}
    - Elapsed time: ${elapsedSeconds.toFixed(1)}s
    - Rate: ${readsPerSecond} tags/sec
  `);
});

// Manual reset functionality
function resetStatistics() {
  console.log('Resetting session statistics...');
  sdk.resetCumulativeStats();
}

// Example: Reset every 60 seconds
setInterval(resetStatistics, 60000);
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

| Setting | Type | Applicable To | Description |
|---------|------|---------------|----|
| `protocol` | 'UF3-S' \| 'F5001' \| 'A0' | Serial | Switch protocol dialect |
| `power` | number | Reader-specific | Set transmit power (check reader manual) |
| `antenna` | number | UF3-S, F5001 | Antenna port to activate (1-4 typically) |
| `timeout` | number | TCP, MQTT | Command response timeout in ms |

**Description:**  
Applies protocol-specific or reader-specific configuration. Available settings depend on the reader type and protocol. Consult your reader's documentation for supported parameters.

#### Configure Example

```javascript
async function configureReader() {
  try {
    // Reselect protocol mid-session (Serial only)
    await sdk.configure({ protocol: 'F5001' });
    console.log('Switched to F5001 protocol');
    
    // Set antenna (if supported)
    await sdk.configure({ antenna: 1 });
    console.log('Antenna 1 enabled');
    
    // Set scan timeout
    await sdk.configure({ timeout: 5000 });
    console.log('Timeout set to 5 seconds');
  } catch (error) {
    console.error('Configuration error:', error);
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
| `tag` | object | Yes | Tag data object to publish |
| `topic` | string | No | Override default topic for this message |

**Returns:** Promise

**Errors Thrown:**
- `Error`: No reader connected
- `Error`: Reader does not support publishing (Serial, TCP readers)

**Description:**  
For MQTT readers, publishes tag data back to the broker. Useful for relay scenarios or notifying other subscribers of processed tags.

#### Publish Example

```javascript
sdk.on('tag', async (tag) => {
  // Process tag locally...
  console.log('Processing:', tag.epc);
  
  // Publish to MQTT for other consumers
  try {
    await sdk.publish(
      {
        epc: tag.epc,
        rssi: tag.rssi,
        processedAt: new Date().toISOString()
      },
      'rfid/processed-tags'
    );
  } catch (error) {
    console.error('Publish failed:', error.message);
    // Not fatal - continue processing
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
- **F5001 Protocol:** Feig Electronics proprietary format
- **UF3-S Protocol:** Kinexus UF3-S command/response format

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

## Summary of Main APIs

| Category | API | Purpose |
|----------|-----|---------|
| **Initialization** | `new RfidSdk()` | Create SDK instance |
| **Connections** | `connectTcp()` | TCP/IP reader connection |
| | `connectSerial()` | Serial reader connection |
| | `connectMqtt()` | MQTT broker connection |
| | `disconnect()` | Close connection gracefully |
| **Scanning** | `start() / startScan()` | Begin tag scanning |
| | `stop() / stopScan()` | Stop tag scanning |
| **Events** | `on('tag', ...)` | Listen for tag reads |
| | `on('stats', ...)` | Listen for stat updates |
| | `on('connected', ...)` | Listen for connection |
| | `on('disconnected', ...)` | Listen for disconnection |
| | `on('error', ...)` | Listen for errors |
| **Statistics** | `getCumulativeStats()` | Get session stats |
| | `resetCumulativeStats()` | Reset session stats |
| **Configuration** | `configure()` | Apply reader settings |
| | `publish()` | MQTT publish (MQTT only) |

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

## Additional Resources

- **Serial Protocols**: Refer to reader manufacturer documentation (Feig, Kinexus, etc.)
- **MQTT Specification**: https://mqtt.org/
- **Node.js EventEmitter**: https://nodejs.org/api/events.html
- **TypeScript Types**: Check `dist/index.d.ts` in installed package

---

**End of API Reference**

For support or SDK updates, visit the project repository or contact your system administrator.
