# RS-232 Serial COM Connection Guide

This guide explains how to set up and use the RS-232 serial (COM) connection for receiving EPC data from RFID readers.

## Overview

The Evolve-SDK supports three connection modes:
- **TCP/IP**: Network-based connection
- **MQTT**: Broker-based messaging
- **Serial (RS-232)**: Direct serial/COM port connection ← **This guide**

## Architecture

```
RFID Reader (RS-232)
        ↓
    COM Port
        ↓
  SerialReader (SerialTransport.ts)
        ↓
  EventBus (emits 'tag' events)
        ↓
  IPC Bridge (sdkbridge.js)
        ↓
  GUI Display + Database Save
```

## System Requirements

### Hardware
- RFID reader with RS-232/COM output
- USB-to-Serial adapter (if your computer doesn't have COM ports)
- Serial cable with proper pinout

### Software
- Node.js 16+ (for SDK)
- Windows, Linux, or macOS
- COM port drivers installed

### Dependencies
- `serialport` (already in package.json)
- `better-sqlite3` (for database)

## Quick Start

### Step 1: Hardware Setup

Identify your RFID reader's COM port:

**Windows:**
1. Open Device Manager (`devmgmt.msc`)
2. Expand "Ports (COM & LPT)"
3. Note the COM port number (e.g., COM3)

**Linux:**
```bash
ls /dev/ttyUSB*
# or
ls /dev/ttyS*
```

**macOS:**
```bash
ls /dev/tty.*
ls /dev/cu.*
```

### Step 2: Connect via GUI

1. Open the Evolve-SDK GUI
2. In the "Hardware Connection" panel:
   - Select **"Serial COM"** radio button
   - Choose your COM port from dropdown
   - Select baud rate (usually 115200)
   - Click **Connect**

3. The connection status indicator will turn green when connected

### Step 3: Start Scanning

1. Once connected, data will automatically appear in the Data Stream
2. Tags are displayed with:
   - EPC ID (text or hex)
   - RSSI (signal strength)
   - Timestamp

3. All tag data is automatically saved to the SQLite database

## Configuration Details

### Baud Rates
Most RFID readers use these standard rates:
- **9600** - Older readers
- **19200** - Standard
- **38400** - Common
- **57600** - Medium speed
- **115200** - Common for modern readers (default)
- **230400** - High speed

**If unsure, consult your reader's documentation.**

### Serial Port Configuration

The SerialTransport automatically configures:
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: None
- **Flow Control**: None

These are A0Protocol standard settings.

## Data Stream

Once connected, received tags appear in the Dashboard:

```
╔═══════════════════════════════════════════════╗
║  [TAG #1234] ABC123DEF | RSSI: -65dBm | 14:32:45
║  [TAG #1235] XYZ789GHI | RSSI: -72dBm | 14:32:46
║  [TAG #1236] ABC123DEF | RSSI: -68dBm | 14:32:47
╚═══════════════════════════════════════════════╝
```

### Data Format

Each detected tag includes:
- **ID**: EPC identifier (UTF-8 text if printable, hex otherwise)
- **RSSI**: Received Signal Strength Indicator (in dBm, -100 to -30 range)
- **Timestamp**: When tag was detected
- **Raw**: Complete frame data (for debugging)

## Database Integration

### Automatic Storage

All received tags are automatically saved to: `rfid.db`

### Database Schema

```sql
CREATE TABLE rfid_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  epc TEXT NOT NULL,
  reader_id TEXT NOT NULL,
  antenna INTEGER,
  rssi REAL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Query Recent Tags

```sql
-- Get last 100 tags
SELECT epc, rssi, read_at FROM rfid_events 
ORDER BY read_at DESC LIMIT 100;

-- Get unique tags from last hour
SELECT DISTINCT epc FROM rfid_events
WHERE read_at >= datetime('now', '-1 hour');

-- Count tags per RSSI level
SELECT rssi, COUNT(*) as count FROM rfid_events
WHERE read_at >= datetime('now', '-24 hours')
GROUP BY rssi ORDER BY rssi DESC;
```

### Export Data

From the GUI:
1. Click **Data Export** button
2. Select time period (1, 7, or 30 days)
3. Choose save location
4. CSV file with columns: EPC, Reader, Antenna, RSSI, Timestamp

From command line:
```bash
sqlite3 rfid.db ".mode csv" "SELECT * FROM rfid_events;" > tags.csv
```

## Programmatic Usage

### Basic Example

```typescript
import { RfidSdk } from './sdk/src/Rfidsdk';

const sdk = new RfidSdk();

// Connect to serial reader
await sdk.connectSerial('COM3', 115200);

// Listen for tags
sdk.on('tag', (tag) => {
  console.log(`Tag: ${tag.id}, RSSI: ${tag.rssi}dBm`);
});

// Start scanning
sdk.startScan();

// Later: stop and disconnect
sdk.stopScan();
await sdk.disconnect();
```

### With Database

See: `sdk/test/serialExampleWithDatabase.ts`

Run it:
```bash
cd sdk
npx ts-node test/serialExampleWithDatabase.ts
```

## Troubleshooting

### Connection Fails

**Error:** "Failed to open port COM3"

Causes:
- COM port doesn't exist or wrong number
- Another application using the port
- Missing/incorrect drivers

Solutions:
1. Verify COM port in Device Manager
2. Close other serial applications (terminal, other SDKs)
3. Install USB-to-Serial drivers if using adapter
4. Try a different COM port

### No Data Received

**Issue:** Connected but no tags appear

Causes:
- Wrong baud rate
- Reader not sending data
- Protocol mismatch
- Buffer issues

Solutions:
1. Verify baud rate matches reader documentation
2. Check reader is powered and functioning
3. Look at raw hexadecimal data in debug logs
4. Use serial monitor to test: try PuTTY or Arduino Serial Monitor
5. Verify frame structure starts with 0xA0 (header)

### Intermittent Connection

**Issue:** Occasional disconnects

Causes:
- Poor cable quality
- Electrical interference
- USB bus power issues
- Serial buffer overflow

Solutions:
1. Use shielded, shorter serial cable
2. Reduce scan rate if possible
3. Use powered USB hub for USB adapter
4. Increase buffer sizes in Evolve-SDK
5. Check for ground loops

### Data Corrupted

**Issue:** Tags showing garbage data or hex instead of text

Causes:
- Data not UTF-8 encodable
- Protocol parsing issue
- EPC uses binary format

Solutions:
1. Binary EPCs show as hex - this is normal
2. Check reader EPC format settings
3. Review frame data in logs for protocol issues
4. May need custom EPC parser for your specific format

## Debug Logging

Enable detailed serial logging:

**In code:**
```typescript
// SerialReader automatically logs:
// - Connection status
// - Data received
// - Frame processing
// - Errors
```

**In GUI:**
Look at browser console (F12) and Electron DevTools for detailed logs.

Check logs for patterns:
- `[SerialReader] Received X bytes` - data flowing
- `[SerialReader] Tag detected` - parsing working
- `[SerialReader] Header mismatch` - protocol issue

## Performance Tips

### Optimize Tag Reading Rate
- Adjust reader antenna power (if supported)
- Configure reader scan rate/interval
- Filter tags by RSSI threshold

### Database Performance
```sql
-- Create indexes for faster queries
CREATE INDEX idx_epc ON rfid_events(epc);
CREATE INDEX idx_read_at ON rfid_events(read_at);

-- Cleanup old data periodically
DELETE FROM rfid_events WHERE read_at < datetime('now', '-30 days');
```

### Memory Management
- The SDK buffers incoming data efficiently
- Events are processed incrementally
- Old database records auto-cleanup (30-day default)

## Advanced Configuration

### Custom Baud Rates

If your reader requires an uncommon baud rate, modify in code:

```typescript
// In HardwareConnection.tsx, add to baudRate options:
<option value="460800">460800</option>
```

### Custom Frame Protocol

If your reader uses a different protocol than A0Protocol:

1. Create new protocol class in `sdk/src/utils/`
2. Implement frame parsing similar to A0Protocol
3. Update SerialReader to use new protocol

### Multi-Reader Setup

To connect multiple readers:
```typescript
const sdk1 = new RfidSdk();
const sdk2 = new RfidSdk();

await sdk1.connectSerial('COM3', 115200);
await sdk2.connectSerial('COM4', 115200);

sdk1.on('tag', handleTag);
sdk2.on('tag', handleTag);
```

## References

- [SerialPort Documentation](https://serialport.io/)
- [A0Protocol Implementation](../src/utils/A0Protocol.ts)
- [SerialTransport Source](../src/transports/SerialTransport.ts)
- [Example Script](./test/serialExampleWithDatabase.ts)

## Support

For issues:
1. Check the troubleshooting section above
2. Review detailed logs in console
3. Verify hardware connections with serial monitor
4. Check reader documentation for protocol/settings

## Common Reader Models

### UF3-S Reader
- Default Port: COM3 or first available
- Baud Rate: 115200
- Protocol: A0Protocol
- Data Format: EPC as text or hex

### Other Readers
Consult your reader's documentation for:
- Supported baud rates
- Data protocol
- Frame format
- EPC encoding method
