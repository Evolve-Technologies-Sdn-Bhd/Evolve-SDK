# RFID SDK Error Handling Guide

## Error Code Format

All errors in the RFID SDK follow this structured format:

```
[HH:MM:SS][ERROR][CODE] - Message
```

**Example:**
```
[11:02:56][ERROR][EVRFID-TCP-001] - Invalid TCP host/port configuration
```

### Error Code Structure

- **Timestamp**: `HH:MM:SS` (local time for quick log scanning)
- **Level**: `ERROR` (fixed)
- **Code**: `EVRFID-CATEGORY-NNN` (unique identifier for programmatic handling)
- **Message**: Human-readable description with context

---

## Error Categories

### 1. **EVRFID-INIT** - Initialization Errors
SDK startup and configuration failures.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-INIT-001 | Failed to initialize SDK | ❌ No | SDK instantiation failed, missing dependencies |
| EVRFID-INIT-002 | No transport configured | ❌ No | No connection method (TCP/Serial/MQTT) specified |

**Troubleshooting:**
- Verify SDK is properly installed: `npm list @evolve/sdk`
- Check SDK initialization code in main.ts
- Ensure at least one transport (TCP, Serial, or MQTT) is configured

---

### 2. **EVRFID-CONN** - General Connection Errors
Transport-agnostic connection failures.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-CONN-001 | Failed to establish connection | ✅ Yes | Network unreachable, reader offline, timeout |
| EVRFID-CONN-002 | Connection timeout | ✅ Yes | Reader not responding within timeout period |
| EVRFID-CONN-003 | Connection lost during operation | ✅ Yes | Network flipped or reader powered off |

**Troubleshooting:**
- Check reader is powered on and accessible
- Verify network connectivity to device
- Increase timeout if reader is slow to respond
- Check firewall rules for TCP/MQTT connectivity

---

### 3. **EVRFID-SERIAL** - Serial Transport Errors
Serial port (COM port) connection failures.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-SERIAL-001 | Invalid serial port configuration | ❌ No | Non-existent port, invalid baud rate |
| EVRFID-SERIAL-002 | Serial port not found or unavailable | ❌ No | Port occupied, unplugged device, disabled port |
| EVRFID-SERIAL-003 | Permission denied on serial port | ❌ No | Insufficient permissions (Windows UAC, Linux udev) |
| EVRFID-SERIAL-004 | Invalid baud rate | ❌ No | Unsupported baud rate for reader |
| EVRFID-SERIAL-005 | Serial port I/O error | ✅ Yes | Port temporarily unavailable, data corruption |

**Troubleshooting:**

**EVRFID-SERIAL-001 & 002:**
```bash
# List available COM ports
# Windows: Device Manager → Ports (COM & LPT)
# Linux: ls /dev/ttyUSB* or /dev/ttyACM*
# macOS: ls /dev/tty.usb*
```

**EVRFID-SERIAL-003 (Permission Denied):**
```bash
# Windows: Run as Administrator
# Linux: sudo usermod -aG dialout $USER  # Then restart shell
# macOS: May already have permissions
```

**EVRFID-SERIAL-004 (Wrong Baud Rate):**
- Check reader manual for correct baud rate
- Common: 9600, 19200, 38400, 115200
- Verify SDK configuration matches reader setting

**EVRFID-SERIAL-005 (I/O Error):**
- Try replugging the serial device
- Check USB cable for damage
- Try different USB port
- Update device drivers

---

### 4. **EVRFID-TCP** - TCP Transport Errors
TCP/IP network connection failures.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-TCP-001 | Invalid TCP host/port configuration | ❌ No | Invalid IP address or port number |
| EVRFID-TCP-002 | Host not found (DNS resolution failed) | ✅ Yes | Wrong hostname, DNS unavailable, network unreachable |
| EVRFID-TCP-003 | Connection refused by remote host | ✅ Yes | Reader not listening, wrong port, firewall blocking |
| EVRFID-TCP-004 | Network unreachable | ✅ Yes | Network down, routing issue, VPN disconnect |
| EVRFID-TCP-005 | Connection reset by peer | ✅ Yes | Reader crashes, network flipped, timeout |

**Troubleshooting:**

**EVRFID-TCP-001 (Invalid Config):**
```javascript
// ❌ Wrong
sdk.connectTcp('192.168.1', 8088);  // Invalid IP
sdk.connectTcp('reader', 'port');   // Port must be number

// ✅ Correct
sdk.connectTcp('192.168.1.100', 8088);  // Valid IP
sdk.connectTcp('reader.local', 8088);   // Valid hostname
```

**EVRFID-TCP-002 (Host Not Found):**
```bash
# Test connectivity
ping 192.168.1.100
# Test port
telnet 192.168.1.100 8088     # Windows
nc -zv 192.168.1.100 8088     # Linux/Mac
```

**EVRFID-TCP-003 (Connection Refused):**
- Verify reader is running and listening on port 8088
- Check reader logs for startup errors
- Verify firewall allows inbound on port 8088
- Try accessing reader web UI in browser to verify connectivity

**EVRFID-TCP-004 & 005 (Network Issues):**
- Check network connectivity: `ping 192.168.1.100`
- Verify reader still responding: restart reader and retry
- Check packet loss: `ping -c 100 192.168.1.100` (Linux)
- Monitor reader logs for errors

---

### 5. **EVRFID-MQTT** - MQTT Transport Errors
MQTT broker connection failures.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-MQTT-001 | Invalid MQTT broker URL | ❌ No | Malformed URL, unsupported protocol |
| EVRFID-MQTT-002 | Failed to connect to MQTT broker | ✅ Yes | Broker offline, network unreachable, timeout |
| EVRFID-MQTT-003 | MQTT authentication failed | ❌ No | Wrong credentials, user disabled |
| EVRFID-MQTT-004 | Invalid MQTT topic configuration | ❌ No | Topic filter syntax error |
| EVRFID-MQTT-005 | Failed to subscribe to MQTT topic | ✅ Yes | Topic doesn't exist, ACL restrictions |
| EVRFID-MQTT-006 | Failed to publish to MQTT topic | ✅ Yes | Topic ACL restrictions, broker quota |

**Troubleshooting:**

**EVRFID-MQTT-001 (Invalid URL):**
```javascript
// ❌ Wrong
sdk.connectMqtt('mqtt://broker.example.com:1883/topic');  // Topic in URL
sdk.connectMqtt('example.com:1883');                       // Missing protocol

// ✅ Correct
sdk.connectMqtt('mqtt://broker.example.com:1883', 'topic');
sdk.connectMqtt('mqtt://user:pass@broker.example.com:1883', 'topic');
```

**EVRFID-MQTT-002 (Broker Offline):**
```bash
# Test broker connectivity
telnet broker.example.com 1883  # Port 1883 = MQTT, 8883 = MQTT+TLS
mqttwarn -n -l 127.0.0.1 -p 1883  # If using local broker
```

**EVRFID-MQTT-003 (Authentication Failed):**
```javascript
// Provide credentials
sdk.connectMqtt(
  'mqtt://broker.example.com:1883',
  'topic',
  {
    username: 'rfid_user',
    password: 'correct_password',
  }
);
```

**EVRFID-MQTT-004 & 005 (Topic Issues):**
- Verify topic syntax: no spaces, valid characters
- Check ACL rules allow user to publish/subscribe
- Broker may have topic hierarchies (e.g., `devices/rfid/tags`)

---

### 6. **EVRFID-READER** - Reader Device Errors
RFID reader hardware and response errors.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-READER-001 | Reader not responding (heartbeat timeout) | ✅ Yes | Reader crash, firmware bug, stuck in processing |
| EVRFID-READER-002 | Invalid or unexpected reader response format | ✅ Yes | Protocol mismatch, firmware version incompatible |
| EVRFID-READER-003 | Unsupported reader model | ❌ No | Reader model not in supported list |
| EVRFID-READER-004 | Reader firmware version incompatible | ❌ No | Firmware version too old or too new |
| EVRFID-READER-005 | Reader command execution failed | ✅ Yes | Command format invalid, reader rejected command |
| EVRFID-READER-006 | Reader reported internal error | ✅ Yes | Reader buffer full, sensor failure, temperature issue |

**Troubleshooting:**

**EVRFID-READER-001 (Not Responding):**
- Check reader is powered on (LED indicators)
- Try powering reader off and on
- Check reader logs/web UI for errors
- Verify no other application has reader connection

**EVRFID-READER-003 & 004 (Compatibility):**
```javascript
// Check reader info
reader.getInfo();
// Supported: A0, F5001, UF3-S protocols
// Check firmware version in reader web UI
```

**EVRFID-READER-005 & 006 (Command Errors):**
- Check SDK protocol configuration matches reader
- Disable any custom command maps if causing issues
- Restart reader if in error state

---

### 7. **EVRFID-TAG** - Tag Data Errors
RFID tag parsing and validation errors.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-TAG-001 | Invalid tag data format | ❌ No | Data corrupted in transmission, wrong protocol |
| EVRFID-TAG-002 | Failed to extract EPC from tag data | ❌ No | EPC field missing, data incomplete |
| EVRFID-TAG-003 | Tag data checksum validation failed | ❌ No | Data corrupted, noisy RF environment |
| EVRFID-TAG-004 | Tag data parameter out of range | ❌ No | RSSI/Antenna values invalid |

**Troubleshooting:**

**EVRFID-TAG-001 & 002 (Format/Extraction):**
- Verify protocol selection (A0, F5001, UF3-S) matches reader
- Check reader raw data in hex viewer for format
- Try different RFID tag to isolate tag vs reader issue

**EVRFID-TAG-003 (Checksum Failed):**
- Indicates RF environment with interference
- Try moving reader away from sources (WiFi, metal, high-power devices)
- Check antenna connections and shielding
- Reduce reader power level if adjustable

**EVRFID-TAG-004 (Parameter Out of Range):**
- Indicates RSSI or antenna port corrupted
- Similar troubleshooting as checksum failures
- May indicate aging/damaged RFID tags

---

### 8. **EVRFID-DATA** - Data Processing Errors
Payload processing, encryption, and database errors.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-DATA-001 | Payload decryption failed | ❌ No | Wrong key, corrupted ciphertext, unsupported algorithm |
| EVRFID-DATA-002 | Invalid encryption key format/size | ❌ No | 32-byte key required, hex decode failed |
| EVRFID-DATA-003 | Invalid or empty payload buffer | ❌ No | Null/empty payload, too small for format |
| EVRFID-DATA-004 | Unsupported payload format | ❌ No | Format not in list of supported formats |
| EVRFID-DATA-005 | Database operation failed | ✅ Yes | Database locked, disk full, connection lost |

**Troubleshooting:**

**EVRFID-DATA-001 & 002 (Encryption):**
```javascript
// Verify key format
const key = crypto.randomBytes(32);  // 32-byte (256-bit) key
const keyHex = key.toString('hex');  // Convert to hex if storing
```

**EVRFID-DATA-003 (Invalid Payload):**
- Verify payload is not null/empty before processing
- Check payload object has required fields
- Validate payload size meets minimum requirements

**EVRFID-DATA-005 (Database Errors):**
- Check disk space: `df -h` (Linux) or `C:` in File Explorer (Windows)
- Verify database file permissions
- Check database isn't locked by another application
- Try database repair/recovery procedures

---

### 9. **EVRFID-SYSTEM** - System Level Errors
System-level and unhandled exceptions.

| Code | Message | Recoverable | Common Causes |
|------|---------|-------------|---------------|
| EVRFID-SYSTEM-001 | Failed to emit event | ✅ Yes | Event listener crashed, emitter destroyed |
| EVRFID-SYSTEM-002 | Out of memory | ❌ No | Memory leak, buffer overrun, too many tags cached |
| EVRFID-SYSTEM-003 | Unhandled exception | ❌ No | Bug in SDK or user code, uncaught promise |

**Troubleshooting:**

**EVRFID-SYSTEM-001 (Event Emission):**
- Add try/catch to event listeners
- Check listener isn't closed when emitting
- Review recent listener changes

**EVRFID-SYSTEM-002 (Out of Memory):**
```bash
# Monitor memory usage (Node.js)
node --max-old-space-size=4096 app.js  # Increase to 4GB

# Check system memory
free -h              # Linux
Get-WmiObject Win32_ComputerSystem  # PowerShell (Windows)
vm_stat              # macOS
```

**EVRFID-SYSTEM-003 (Unhandled Exception):**
- Add uncaught exception handler
- Review SDK logs for stack trace
- Report to RFID SDK support with full error details

---

## Error Handling Patterns

### Pattern 1: Basic Error Logging

```javascript
const { RfidSdk, RfidSdkError } = require('@evolve/sdk');

const sdk = new RfidSdk();

sdk.on('error', (errorObj) => {
  // errorObj contains: { code, message, timestamp, details, recoverable, formatted }
  if (errorObj instanceof RfidSdkError) {
    console.error(errorObj.toString());  // Already formatted: [HH:MM:SS][ERROR][CODE] - message
    console.error('Details:', errorObj.details);
  }
});
```

### Pattern 2: Error Code Filtering (Retry Logic)

```javascript
sdk.on('error', async (errorObj) => {
  // Retry recoverable errors
  if (errorObj.recoverable) {
    console.log(`Recoverable error ${errorObj.code}, retrying...`);
    await new Promise(r => setTimeout(r, 2000));
    await sdk.connectTcp(host, port);  // Retry
  } else {
    console.error(`Fatal error ${errorObj.code}, manual intervention required`);
    // Alert user, disable auto-reconnect
  }
});
```

### Pattern 3: Error Code Based Diagnostics

```javascript
sdk.on('error', (errorObj) => {
  switch (errorObj.code) {
    case 'EVRFID-TCP-002':  // Host not found
      console.log('Checking network connectivity...');
      break;
    case 'EVRFID-SERIAL-002':  // Port not available
      console.log('Listing available COM ports...');
      break;
    case 'EVRFID-TAG-003':  // Checksum failed
      console.log('RF environment may have interference');
      break;
  }
});
```

### Pattern 4: Error Monitoring Dashboard

```javascript
const errorStats = new Map();

sdk.on('error', (errorObj) => {
  const count = (errorStats.get(errorObj.code) || 0) + 1;
  errorStats.set(errorObj.code, count);
  
  // Alert if same error occurs 5+ times in 1 minute
  if (count >= 5) {
    console.warn(`⚠️ ALERT: ${errorObj.code} occurred ${count} times`);
    // Send alert notification
  }
});
```

### Pattern 5: Structured Error Logging to File

```javascript
const fs = require('fs');

sdk.on('error', (errorObj) => {
  const logEntry = {
    timestamp: new Date(errorObj.timestamp).toISOString(),
    code: errorObj.code,
    message: errorObj.message,
    recoverable: errorObj.recoverable,
    details: errorObj.details,
    Stack trace available in verbose logs
  };
  
  // Append to JSONL file (one JSON per line)
  fs.appendFileSync('logs/errors.jsonl', JSON.stringify(logEntry) + '\n');
});
```

---

## Quick Reference

### Import Error Classes

```javascript
import { RfidSdkError, createSdkError, wrapNativeError, ERROR_CODES } from '@evolve/sdk';
```

### Create Custom Errors

```javascript
// Using factory function
const error = createSdkError('CONNECTION_FAILED', {
  host: '192.168.1.100',
  port: 8088,
  reason: 'Device offline'
});

// Wrap native Node.js errors
const sdkError = wrapNativeError(nativeError, 'SERIAL_IO_ERROR', {
  port: 'COM3'
});

// Emit via SDK
sdk.on('error', (err) => {
  console.error(err.toString());  // [HH:MM:SS][ERROR][CODE] - message
  console.log(err.code);          // EVRFID-TCP-001
  console.log(err.details);       // { host, port, ... }
  console.log(err.recoverable);   // boolean
});
```

### Instanceof Checks

```javascript
if (error instanceof RfidSdkError) {
  console.log('Structured error:', error.code);
} else {
  console.log('Generic error:', error.message);
}
```

### Error Summary

All **46 error codes** organized by category:
- **INIT** (2): SDK initialization
- **CONN** (3): General connection
- **SERIAL** (5): Serial port
- **TCP** (5): TCP/IP network
- **MQTT** (6): MQTT broker
- **READER** (6): RFID reader device
- **TAG** (4): Tag data
- **DATA** (5): Data processing
- **SYSTEM** (3): System level

---

## Testing Error Handling

```bash
# Run unit tests
npm test

# Run tests with error codes
npm test -- --grep "error|Error|EVRFID"

# Check test coverage
npm run coverage
```

---

## Feedback & Support

If you encounter an error code not documented here:
1. Check the error details object for context
2. Enable debug logging: `sdk.configure({ debug: true })`
3. Check reader logs and network connectivity
4. Report issue with error code and details to support
