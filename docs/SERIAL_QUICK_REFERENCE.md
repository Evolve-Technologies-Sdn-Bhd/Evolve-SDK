# Serial Connection Quick Reference

## GUI Connection (Easiest Way)

1. **Select Connection Type**: Choose **"Serial COM"** in Hardware Connection panel
2. **Configure**:
   - COM Port: `COM3` (or whichever your reader uses)
   - Baud Rate: `115200` (common default)
3. **Connect**: Click green "Connect" button
4. **View Data**: Tags appear in Dashboard → Data Stream
5. **Save**: Automatically saved to database

## Command Line Connection

```bash
cd sdk
npx ts-node test/serialExampleWithDatabase.ts
```

**Output:**
```
✓ Serial connection established!
🔍 Starting scan...

[TAG #1] ABC123DEF | RSSI: -65dBm | 14:32:45
[TAG #2] XYZ789GHI | RSSI: -72dBm | 14:32:46
```

## Code Integration

```typescript
import { RfidSdk } from './sdk/src/Rfidsdk';

const sdk = new RfidSdk();

// Connect
await sdk.connectSerial('COM3', 115200);

// Listen for tags
sdk.on('tag', (tag) => {
  console.log(`Tag: ${tag.id}, RSSI: ${tag.rssi} dBm`);
});

// Start/Stop
sdk.startScan();
sdk.stopScan();

// Disconnect
await sdk.disconnect();
```

## Finding Your COM Port

### Windows
- Open Device Manager
- Expand "Ports (COM & LPT)"
- Find your reader (usually shows "Serial" or manufacturer name)

### Linux/Mac
```bash
ls /dev/tty.*     # macOS
ls /dev/ttyUSB*   # Linux with USB adapter
```

## Standard Baud Rates

| Rate | Use Case |
|------|----------|
| 9600 | Older readers |
| 19200 | General purpose |
| 38400 | Standard |
| 57600 | Medium speed |
| **115200** | **Most common** ← Try this first |
| 230400 | High speed |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Port not found" | Check Device Manager, verify COM number |
| Connected but no data | Wrong baud rate, reader not powered |
| Data looks like hex | Normal! Binary EPCs show as hex |
| Intermittent disconnects | Use shielded cable, check power |

## Database Access

SQLite database: `rfid.db`

### Query Recent Tags
```sql
SELECT epc, rssi, read_at FROM rfid_events 
ORDER BY read_at DESC LIMIT 10;
```

### Export to CSV
GUI: Click "Data Export" → Select period → Save

Command line:
```bash
sqlite3 rfid.db ".mode csv" "SELECT * FROM rfid_events;" > export.csv
```

### Get Statistics
```sql
SELECT COUNT(*) as total, COUNT(DISTINCT epc) as unique_tags 
FROM rfid_events WHERE read_at >= datetime('now', '-1 hour');
```

## Hardware Setup

```
RFID Reader (RS-232 output)
        ↓
   [DB-9 or Serial Cable]
        ↓
PC/Laptop (COM3)
        ↓
Evolve-SDK
        ↓
Database + UI Display
```

If your PC doesn't have COM ports:
- Use USB-to-Serial adapter
- Install appropriate drivers
- Will appear as `COM3`, `COM4`, etc.

## Data Format

Each tag includes:
- **ID**: EPC (product code)
- **RSSI**: Signal strength (-100 to -30 dBm, higher = stronger)
- **Timestamp**: When detected
- **Raw**: Complete frame (for debugging)

## Status Indicators

| Icon | Meaning |
|------|---------|
| 🟢 Green dot | Connected |
| ⚪ Gray dot | Disconnected |
| 🔄 Blue loading | Connecting... |
| 🔴 Red X | Connection failed |

## Performance Tips

- **Adjust RSSI Filter**: In Settings, filter by minimum signal strength
- **Reduce Scan Rate**: If data overwhelming, configure reader scan interval
- **Database Cleanup**: Old records auto-delete after 30 days
- **Monitor Memory**: Long scans are efficient, auto-buffering

## Next Steps

1. ✅ Get hardware connected
2. ✅ Verify COM port and baud rate
3. ✅ Test connection in GUI
4. ✅ View data stream
5. ✅ Export or integrate database data

## Full Documentation

See: [SERIAL_CONNECTION_GUIDE.md](./SERIAL_CONNECTION_GUIDE.md)

## Support Resources

- SerialPort library: https://serialport.io/
- A0Protocol: See `sdk/src/utils/A0Protocol.ts`
- Example code: `sdk/test/serialExampleWithDatabase.ts`
- GUI component: `gui/src/components/Sidebar/HardwareConnection.tsx`
