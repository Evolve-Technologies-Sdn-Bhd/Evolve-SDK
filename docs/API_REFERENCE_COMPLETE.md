# Evolve RFID SDK - Complete API Reference

**Version:** 1.0.0  
**Last Updated:** March 9, 2026  
**Target Audience:** External developers integrating the SDK into applications  
**Language:** JavaScript/TypeScript (Node.js)

---

## Table of Contents

1. [Overview](#overview)
2. [SDK Initialization & Connections](#sdk-initialization--connections)
3. [Scanning & Tag Reading](#scanning--tag-reading)
4. [Session Statistics](#session-statistics)
5. [Events & Listeners](#events--listeners)
6. [Error Handling](#error-handling)
7. [IPC Handlers (Electron)](#ipc-handlers-electron)
8. [GUI Service Methods](#gui-service-methods)
9. [Advanced Features](#advanced-features)

---

## Overview

The Evolve RFID SDK provides a unified interface for connecting to RFID readers through multiple transport protocols (Serial, TCP/IP, MQTT) and managing tag reading operations.

### Key Design Principles

- **Transport Abstraction:** Single API works with Serial, TCP/IP, and MQTT readers
- **Raw Data Emission:** SDK provides unformatted data; consumers handle presentation
- **Session Statistics:** In-memory counters for current session only
- **Event-Driven:** EventEmitter-based architecture for clean integration

### Architecture Diagram

```
┌─────────────────────────────────┐
│  Physical Reader                │
│  (Serial/TCP/MQTT)              │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Protocol Reader                │
│  (A0, F5001, UF3-S)            │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  RfidSdk (Main Entry Point)     │
│  - Maintains session stats      │
│  - Throttles duplicate tags     │
│  - Emits normalized events      │
└────────────┬────────────────────┘
             │
    ┌────────┴──────────┬───────────┬──────────┐
    │                   │           │          │
    v                   v           v          v
 'tag'              'stats'    'connected'  'error'
 event              event      'disconnected' event
                    event      events
```

---

## SDK Initialization & Connections

### Class: `RfidSdk`

Main entry point for the RFID SDK.

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();
```

### Connection Methods

#### Method: `connectTcp(host, port)`

Connect to an RFID reader over TCP/IP.

```typescript
connectTcp(host: string, port: number): Promise<boolean>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `host` | string | IP address or hostname (e.g., "192.168.1.100") |
| `port` | number | TCP port number (e.g., 10001) |

**Returns:** Promise<boolean> - true on success

**Example:**

```javascript
try {
  await sdk.connectTcp('192.168.1.100', 10001);
  console.log('TCP reader connected');
} catch (error) {
  console.error('Connection failed:', error.message);
}
```

---

#### Method: `connectSerial(path, baudRate, protocol)`

Connect to an RFID reader via serial port.

```typescript
connectSerial(
  path: string, 
  baudRate: number, 
  protocol?: 'UF3-S' | 'F5001' | 'A0'
): Promise<void>
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | - | Serial port path (COM3, /dev/ttyUSB0, etc.) |
| `baudRate` | number | - | Baud rate (115200, 9600, etc.) |
| `protocol` | string | 'A0' | Protocol: 'A0' (standard), 'F5001' (Feig), 'UF3-S' (Kinexus) |

**Example:**

```javascript
// Windows
await sdk.connectSerial('COM4', 115200, 'A0');

// Linux/macOS
await sdk.connectSerial('/dev/ttyUSB0', 115200, 'F5001');
```

---

#### Method: `connectMqtt(brokerUrl, topic, options)`

Connect to RFID reader via MQTT broker.

```typescript
connectMqtt(
  brokerUrl: string,
  topic: string,
  options?: MqttConnectionConfig
): Promise<boolean>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `brokerUrl` | string | Broker URL (mqtt://host or mqtts://host:8883) |
| `topic` | string | MQTT topic to subscribe to |
| `options` | object | Optional connection parameters |

**MqttConnectionConfig:**

```typescript
interface MqttConnectionConfig {
  username?: string;           // MQTT username
  password?: string;           // MQTT password
  clientId?: string;           // Custom client ID
  keepalive?: number;          // Keep-alive in seconds (default: 30)
  reconnectPeriod?: number;    // Reconnect interval in ms (default: 5000)
  connectTimeout?: number;     // Connection timeout in ms (default: 30000)
  rejectUnauthorized?: boolean; // Verify TLS cert (default: true)
  protocol?: string;           // Force protocol (mqtt, mqtts, tcp, tls, ws, wss)
  maxRetries?: number;         // Max retry attempts (default: 3)
}
```

**Example:**

```javascript
// Basic MQTT
await sdk.connectMqtt('mqtt://broker.example.com', 'rfid/tags');

// Secure MQTT with authentication
await sdk.connectMqtt('mqtts://broker.example.com:8883', 'rfid/tags', {
  username: 'user',
  password: 'pass',
  clientId: 'rfid-reader-1'
});
```

---

#### Method: `disconnect()`

Gracefully disconnect from current reader.

```typescript
disconnect(): Promise<void>
```

**Example:**

```javascript
await sdk.disconnect();
console.log('Reader disconnected');
```

---

#### Method: `configure(settings)`

Apply configuration settings to the connected reader.

```typescript
configure(settings: Record<string, any>): Promise<void>
```

**Common Settings:**

| Setting | Type | Description |
|---------|------|-------------|
| `protocol` | string | Switch protocol dialect (UF3-S, F5001, A0) |
| `antenna` | number | Select antenna port (1-4) |
| `timeout` | number | Command timeout in ms |

**Example:**

```javascript
await sdk.configure({ protocol: 'F5001' });
await sdk.configure({ antenna: 1 });
```

---

## Scanning & Tag Reading

### Method: `start()` / `startScan()`

Begin scanning for RFID tags.

```typescript
start(): void
startScan(): void  // Alias for start()
```

**Example:**

```javascript
sdk.on('connected', () => {
  sdk.start();
  console.log('Scanning...');
});
```

---

### Method: `stop()` / `stopScan()`

Stop scanning for RFID tags.

```typescript
stop(): void
stopScan(): void  // Alias for stop()
```

**Example:**

```javascript
sdk.stop();
console.log('Scan stopped');
```

---

## Session Statistics

### Method: `getCumulativeStats()`

Get current session cumulative statistics.

```typescript
getCumulativeStats(): { total: number; unique: number }
```

**Returns:**
- `total`: Total tags read in session
- `unique`: Count of unique EPCs detected

**Example:**

```javascript
const stats = sdk.getCumulativeStats();
console.log(`Total reads: ${stats.total}, Unique tags: ${stats.unique}`);
```

---

### Method: `resetCumulativeStats()`

Reset session statistics to zero.

```typescript
resetCumulativeStats(): void
```

**Example:**

```javascript
sdk.resetCumulativeStats();
console.log('Statistics reset');
```

---

## Events & Listeners

### Event: `'tag'`

Emitted when a valid RFID tag is detected.

**Event Data:**

```typescript
interface TagData {
  epc: string;        // 7-byte hex identifier (14 hex chars)
  rssi?: number;      // Signal strength in dBm (-50 to -90)
  timestamp: number;  // Unix timestamp in milliseconds
  raw: Buffer;        // Complete raw binary data
  id?: string;        // Alternative identifier
  id_full?: string;   // Full payload string
}
```

**Example:**

```javascript
sdk.on('tag', (tag) => {
  console.log(`EPC: ${tag.epc}`);
  console.log(`RSSI: ${tag.rssi}dBm`);
  console.log(`Timestamp: ${new Date(tag.timestamp).toISOString()}`);
});
```

---

### Event: `'stats'`

Emitted when session statistics are updated or reset.

**Event Data:**

```typescript
{
  total: number;   // Total reads in session
  unique: number;  // Unique tag count
}
```

**Example:**

```javascript
sdk.on('stats', (stats) => {
  console.log(`Total: ${stats.total}, Unique: ${stats.unique}`);
});
```

---

### Event: `'connected'`

Emitted when reader successfully connects.

**Example:**

```javascript
sdk.on('connected', () => {
  console.log('Reader connected and ready');
});
```

---

### Event: `'disconnected'`

Emitted when reader is disconnected.

**Example:**

```javascript
sdk.on('disconnected', () => {
  console.log('Reader disconnected');
});
```

---

### Event: `'error'`

Emitted when an error occurs.

**Event Data:**

```typescript
interface RfidSdkErrorObject {
  code: string;              // Unique error code (e.g., EVRFID-CONN-001)
  message: string;           // Human-readable message
  timestamp: number;         // JavaScript timestamp (ms)
  recoverable: boolean;      // Can be auto-recovered
  formatted: string;         // Formatted: [HH:MM:SS][ERROR][CODE] - message
  details?: {                // Context-specific data
    host?: string;
    port?: number;
    port?: string;          // Serial port
    baudRate?: number;
    [key: string]: any;
  }
}
```

**Example:**

```javascript
sdk.on('error', (errorObj) => {
  console.error(`[${errorObj.code}] ${errorObj.message}`);
  console.error(`Formatted: ${errorObj.formatted}`);
  
  if (errorObj.recoverable) {
    console.log('Error is recoverable, will auto-retry');
  }
});
```

---

### Event: `'rawData'`

Emitted for each raw data packet from reader (for debugging).

**Event Data:**

```typescript
interface RawPacket {
  id: number;           // Packet sequence ID
  timestamp: number;    // When packet was received
  direction: string;    // 'RX' (receive) or 'TX' (transmit)
  data: string;        // Hex string of raw data
}
```

---

### Method: `on(event, callback)`

Register listener for SDK events.

```typescript
on(event: string, callback: (...args: any[]) => void): void
```

**Supported Events:** 'tag', 'stats', 'connected', 'disconnected', 'error', 'rawData'

---

### Method: `removeListener(event, callback)` / `off(event, callback)`

Unregister event listener.

```typescript
removeListener(event: string, callback: (...args: any[]) => void): void
off(event: string, callback: (...args: any[]) => void): void  // Alias
```

---

## Error Handling

### Error Code Registry (46 Total Codes)

All errors follow the format: `[HH:MM:SS][ERROR][CODE] - Message`

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

---

### Error Handling Best Practice

```javascript
class RfidReaderManager {
  constructor() {
    this.sdk = new RfidSdk();
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    this.sdk.on('error', (errorObj) => this.handleError(errorObj));
  }

  handleError(errorObj) {
    // Log error with code
    console.error(`[${errorObj.code}] ${errorObj.message}`);
    console.error(`Details:`, errorObj.details);

    // Check recoverability
    if (errorObj.recoverable) {
      console.warn('Error is recoverable, attempting retry...');
      this.attemptRecovery(errorObj.code);
    } else {
      console.error('Fatal error, manual intervention required');
      this.notifyAdministrator(errorObj);
    }
  }

  attemptRecovery(errorCode) {
    switch (errorCode) {
      case 'EVRFID-CONN-001':
      case 'EVRFID-CONN-002':
      case 'EVRFID-TCP-003':
        console.log('Reconnecting in 3 seconds...');
        setTimeout(() => this.reconnect(), 3000);
        break;
      
      case 'EVRFID-READER-001':
        console.log('Reader unresponsive, sending reset...');
        this.sendReaderReset();
        break;
      
      default:
        this.reconnect();
    }
  }

  async reconnect() {
    try {
      await this.sdk.disconnect();
      await new Promise(r => setTimeout(r, 1000));
      await this.sdk.connectTcp('192.168.1.100', 10001);
      this.sdk.start();
      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnect failed:', error);
    }
  }

  notifyAdministrator(errorObj) {
    // Send email, SMS, or Slack notification
    console.error(`ALERT: ${errorObj.code} - ${errorObj.message}`);
  }
}
```

---

## IPC Handlers (Electron)

The IPC bridge provides handlers for GUI communication with the SDK.

### Handler: `serial:list-ports`

List all available serial ports on the system.

```javascript
const ports = await window.electronAPI.invoke('serial:list-ports');
// Returns: [{ path: 'COM4', manufacturer: 'Silicon Labs', description: '...' }, ...]
```

**Parameters:** None

**Returns:** Array of port objects with `path`, `manufacturer`, `description`

---

### Handler: `reader:connect`

Connect to TCP/IP reader.

```javascript
await window.electronAPI.invoke('reader:connect', {
  host: '192.168.1.100',
  port: 10001
});
```

**Parameters:**
- `host` (string): IP address or hostname
- `port` (number): TCP port

**Returns:** `{ success: true }` or throws error

---

### Handler: `reader:connect-serial`

Connect to serial reader.

```javascript
await window.electronAPI.invoke('reader:connect-serial', {
  comPort: 'COM4',
  baudRate: 115200,
  protocol: 'A0'
});
```

**Parameters:**
- `comPort` (string): Serial port path
- `baudRate` (number): Baud rate
- `protocol` (string): 'A0', 'F5001', or 'UF3-S'

**Returns:** `{ success: true }` or throws error

---

### Handler: `reader:connect-mqtt`

Connect to MQTT broker.

```javascript
await window.electronAPI.invoke('reader:connect-mqtt', {
  brokerUrl: 'mqtt://broker.example.com',
  topic: 'rfid/tags',
  options: { username: 'user', password: 'pass' }
});
```

**Parameters:**
- `brokerUrl` (string): MQTT broker URL
- `topic` (string): MQTT topic to subscribe
- `options` (object): Optional connection options

**Returns:** `{ success: true }` or throws error

---

### Handler: `reader:disconnect`

Disconnect from current reader.

```javascript
await window.electronAPI.invoke('reader:disconnect');
```

**Returns:** `{ success: true }` or throws error

---

### Handler: `reader:start-scan`

Start scanning for tags.

```javascript
window.electronAPI.send('reader:start-scan');
```

**Events Emitted:**
- `rfid:tag-read` - Tag detected
- `rfid:stats` - Statistics updated
- `rfid:raw-data` - Raw data packet

---

### Handler: `reader:stop-scan`

Stop scanning for tags.

```javascript
window.electronAPI.send('reader:stop-scan');
```

---

### Handler: `reader:reset-counters`

Reset session statistics.

```javascript
await window.electronAPI.invoke('reader:reset-counters');
```

**Returns:** `{ success: true }` or throws error

---

## GUI Service Methods

The GUI service (`sdkService`) provides a convenient interface for React/Vue components.

```javascript
import { sdkService } from '../../services/sdkService';
```

### Method: `connect(ip, port)`

Connect to TCP/IP reader from GUI.

```javascript
await sdkService.connect('192.168.1.100', 10001);
```

---

### Method: `connectSerial(comPort, baudRate, protocol)`

Connect to serial reader from GUI.

```javascript
await sdkService.connectSerial('COM4', 115200, 'A0');
```

---

### Method: `connectMqtt(brokerUrl, topic, options)`

Connect to MQTT broker from GUI.

```javascript
await sdkService.connectMqtt('mqtt://broker.example.com', 'rfid/tags', {
  username: 'user',
  password: 'pass'
});
```

---

### Method: `disconnect()`

Disconnect from current reader.

```javascript
await sdkService.disconnect();
```

---

### Method: `startScan()`

Start scanning from GUI.

```javascript
sdkService.startScan();
```

---

### Method: `stopScan()`

Stop scanning from GUI.

```javascript
sdkService.stopScan();
```

---

### Method: `onTagRead(callback)`

Register listener for tag events.

```javascript
sdkService.onTagRead((tag) => {
  console.log('Tag detected:', tag.epc);
  // GUI state update triggers here
});
```

---

### Method: `onStats(callback)`

Register listener for statistics updates.

```javascript
const unsubscribe = sdkService.onStats((stats) => {
  console.log(`Total: ${stats.total}, Unique: ${stats.unique}`);
  // Update GUI counters
});

// To unsubscribe:
// unsubscribe();
```

---

### Method: `onRawData(callback)`

Register listener for raw data packets (debugging).

```javascript
sdkService.onRawData((packet) => {
  console.log('Packet:', packet.direction, packet.data);
});
```

---

### Method: `onDisconnected(callback)`

Register listener for disconnection events.

```javascript
sdkService.onDisconnected((data) => {
  console.log('Reader disconnected:', data.type);
});
```

---

### Method: `resetCounters()`

Reset session statistics from GUI.

```javascript
await sdkService.resetCounters();
```

---

## Advanced Features

### 1. Multi-Protocol Support

Switch protocols for serial readers mid-session:

```javascript
// Start with A0
await sdk.connectSerial('COM4', 115200, 'A0');
sdk.start();

// Later, switch to F5001
await sdk.configure({ protocol: 'F5001' });
```

---

### 2. Filtered Tag Processing

Process tags selectively based on RSSI:

```javascript
sdk.on('tag', (tag) => {
  const strength = tag.rssi || -90;
  
  if (strength > -70) {
    console.log('Strong signal:', tag.epc);
    // Process tag
  }
  // Weak signals are silently dropped
});
```

---

### 3. Error Recovery with Exponential Backoff

```javascript
async function connectWithRetry(host, port, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sdk.connectTcp(host, port);
      return true;
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

---

### 4. Database Integration

```javascript
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('rfid_tags.db');

sdk.on('tag', (tag) => {
  db.run(
    'INSERT INTO tags (epc, rssi, timestamp) VALUES (?, ?, ?)',
    [tag.epc, tag.rssi, new Date(tag.timestamp).toISOString()]
  );
});
```

---

### 5. Real-time Statistics Dashboard

```javascript
class Dashboard {
  constructor() {
    this.startTime = Date.now();
  }

  attach(sdk) {
    sdk.on('stats', (stats) => {
      const uptime = (Date.now() - this.startTime) / 1000;
      const rate = (stats.total / uptime).toFixed(2);
      
      console.clear();
      console.log(`
        ╔═══════════════════════════╗
        ║  RFID Dashboard           ║
        ╠═══════════════════════════╣
        ║ Uptime:     ${uptime.toFixed(1)}s        ║
        ║ Total:      ${stats.total}            ║
        ║ Unique:     ${stats.unique}            ║
        ║ Rate:       ${rate} tags/sec  ║
        ╚═══════════════════════════╝
      `);
    });
  }
}
```

---

## Complete Example: Full Integration

```javascript
const { RfidSdk } = require('@evolve/sdk');
const sdk = new RfidSdk();

class RfidApplication {
  constructor() {
    this.connected = false;
    this.scanning = false;
    this.tags = new Map();
  }

  async start() {
    this.setupEventHandlers();
    await this.connect();
    this.startScanning();
  }

  setupEventHandlers() {
    sdk.on('connected', () => {
      console.log('✓ Reader connected');
      this.connected = true;
    });

    sdk.on('disconnected', () => {
      console.log('✗ Reader disconnected');
      this.connected = false;
      this.handleDisconnection();
    });

    sdk.on('tag', (tag) => {
      this.processTag(tag);
    });

    sdk.on('stats', (stats) => {
      console.log(`Stats: ${stats.total} total, ${stats.unique} unique`);
    });

    sdk.on('error', (errorObj) => {
      console.error(`[${errorObj.code}] ${errorObj.message}`);
      if (errorObj.recoverable) {
        console.log('Attempting recovery...');
      }
    });
  }

  async connect() {
    try {
      await sdk.connectTcp('192.168.1.100', 10001);
    } catch (error) {
      console.error('Connection failed:', error.message);
      throw error;
    }
  }

  startScanning() {
    if (!this.connected) {
      console.warn('Not connected');
      return;
    }
    sdk.start();
    this.scanning = true;
    console.log('Scanning started');
  }

  stopScanning() {
    sdk.stop();
    this.scanning = false;
    console.log('Scanning stopped');
  }

  processTag(tag) {
    const lastSeen = this.tags.get(tag.epc);
    
    if (lastSeen) {
      const timeSinceLastSeen = tag.timestamp - lastSeen.timestamp;
      console.log(`Tag ${tag.epc} seen again after ${timeSinceLastSeen}ms`);
    } else {
      console.log(`New tag detected: ${tag.epc}`);
    }

    this.tags.set(tag.epc, {
      rssi: tag.rssi,
      timestamp: tag.timestamp
    });
  }

  async handleDisconnection() {
    console.log('Reconnecting in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
    try {
      await this.connect();
      if (this.scanning) {
        this.startScanning();
      }
    } catch (error) {
      console.error('Reconnection failed:', error.message);
    }
  }

  async shutdown() {
    console.log('Shutting down...');
    this.stopScanning();
    await sdk.disconnect();
    console.log('Goodbye');
  }
}

// Usage
const app = new RfidApplication();
app.start().catch(console.error);

process.on('SIGINT', () => app.shutdown());
```

---

## Troubleshooting

### No Tags Being Detected

1. Check `sdk.start()` was called
2. Verify reader is powered on
3. Ensure tags are within antenna range (< 1 meter typically)
4. Check tags are compatible with reader firmware

### Connection Keeps Dropping

1. Verify network stability (for TCP/MQTT)
2. Check reader heartbeat settings
3. Implement reconnection logic with exponential backoff
4. Check error logs for specific error codes

### High Duplicate Rates

1. Throttling is automatic (500ms per tag default)
2. Multiple antennas detecting same tag
3. Tag moving in/out of range repeatedly

---

## API Reference Summary

| Task | Method | Parameters |
|------|--------|------------|
| **Initialize** | `new RfidSdk()` | - |
| **Connect TCP** | `connectTcp()` | host, port |
| **Connect Serial** | `connectSerial()` | path, baudRate, protocol |
| **Connect MQTT** | `connectMqtt()` | brokerUrl, topic, options |
| **Disconnect** | `disconnect()` | - |
| **Start Scanning** | `start()` | - |
| **Stop Scanning** | `stop()` | - |
| **Get Stats** | `getCumulativeStats()` | - |
| **Reset Stats** | `resetCumulativeStats()` | - |
| **Configure** | `configure()` | settings |
| **Listen Events** | `on()` | event, callback |
| **Remove Listener** | `off()` | event, callback |
| **Publish (MQTT)** | `publish()` | tag, topic |

---

<!-- End of API Reference -->

For the latest documentation, visit the project repository or check the inline code documentation.
