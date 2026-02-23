# Serial Connection - Console Log Reference

Quick interpretation guide for all console messages you might see.

## Startup Logs

```
[App] App ready event
```
✅ Application started, initializing

```
[App] SDK initialization complete
[App] Database initialization complete, db: initialized
```
✅ SDK and database loaded successfully

---

## Connection Logs

### Starting Connection

```
[IPC] Attempting serial connection to COM3 @ 115200 baud
```
✅ User clicked Connect, IPC requesting serial connection

```
[SerialReader] Attempting connection to COM3 @ 115200 baud
```
✅ Serial transport trying to open port

### Success

```
[SerialReader] Successfully connected to COM3 @ 115200 baud
[IPC] Connection Successful: Serial COM3 @ 115200 baud
```
✅ **Port opened successfully! Device is ready.**

### Connection Errors

```
[SerialReader] Failed to open port COM3: Port does not exist
```
❌ COM port doesn't exist
- Check Device Manager
- Use correct port name

```
[SerialReader] Failed to open port COM3: Access denied
```
❌ Another program is using this port
- Close other terminal software
- Check Windows Device Manager

```
[SerialReader] Port closed: COM3
```
⚠️ Device disconnected or port was closed
- Check device power
- Verify cable

---

## Scan Start Logs

```
[IPC] reader:start-scan
```
✅ User clicked "Start Read"

```
[IPC] Scan already active, ignoring duplicate start request
```
⚠️ User clicked "Start Read" while already scanning
- Click "Stop Read" first, then "Start Read" again

```
[RfidSdk] Starting scan
```
✅ SDK initiating scan

```
[SerialReader] ║      STARTING SCAN                 ║
[SerialReader] Sending start inventory command: a00401880100
[SerialReader] ✓ Start scan command sent successfully
```
✅ **Inventory start command sent to device**
- Check device LED (should indicate scanning mode)

```
[SerialReader] ❌ Port not open, cannot start scan
```
❌ Port closed - likely device disconnected
- Reconnect device
- Check power/cables

```
[SerialReader] 🔍 Waiting for tag data (check console for incoming frames)...
```
✅ Ready to receive tag data - present RFID tag to reader

```
[IPC] SDK started successfully
```
✅ All listeners registered, scan is active

---

## Data Reception Logs

### No Data Arriving

```
(silence after "Waiting for tag data...")
```
❌ Device not sending data
- Check device power
- Try different baud rate
- Verify RFID tag is in read range
- Check cable connection

### Data Arriving

```
[SerialReader] ====== DATA RX #1 ======
[SerialReader] Received 15 bytes: A0080180FE590001020304050607
[SerialReader] Raw ASCII (if printable): ....Y..........
[SerialReader] Total buffer size: 15 bytes
```
✅ **Device is sending data!**
- A0 at start = correct format
- Hex values = binary protocol data
- Total buffer size = accumulated data

```
[SerialReader] ====== DATA RX #2 ======
[SerialReader] Received 3 bytes: 080910
[SerialReader] Raw ASCII (if printable): ...
[SerialReader] Total buffer size: 18 bytes
```
✅ More data received (multi-packet frame)
- Buffer accumulating data until complete frame

### Data Format Issues

```
[SerialReader] ⚠️ No A0 header at buffer[0]: found 0xFE, searching...
[SerialReader] No 0xA0 header found in buffer, discarding all 20 bytes
```
❌ **Device uses different protocol**
- Expected: A0 header (Seuic protocol)
- Received: FE header (unknown protocol)
- **Action needed**: Custom parser required

```
[SerialReader] ⚠️ Invalid length byte: 0xF4 (244), expected 3-1024
[SerialReader] Buffer content: 73756368616...
```
❌ Frame data corrupted or wrong format
- Try different baud rate
- Check cable quality

---

## Frame Processing Logs

### Valid Frames

```
[SerialReader] ✓ Frame #1 complete: A0080180FE590001020304050607
```
✅ **Complete frame received and extracted**
- Frame #N = frame counter
- Hex string = frame bytes

```
[SerialReader] Frame details - Header: 0xa0, Len: 8, Addr: 0x1, Cmd: 0x80
[SerialReader] Checksum - Calculated: 0x08, Received: 0x08
```
✅ Frame structure valid
- Header: 0xA0 = Seuic protocol
- Cmd: 0x80 = Tag data response
- Checksum: Match = data integrity OK

### Frame Errors

```
[SerialReader] Checksum - Calculated: 0x08, Received: 0x10
[SerialReader] ⚠️ Checksum mismatch!
```
⚠️ Frame received but checksum error (rare)
- Usually indicates corrupted data
- Check cable/power quality
- Try different baud rate

```
[SerialReader] Frame too short: 3 bytes
```
⚠️ Incomplete frame received
- Usually means more data coming
- Wait for next DATA RX

---

## Tag Detection Logs

### Successful Tag Detection

```
[SerialReader] ✓ Tag detected - ID: 123ABC456DEF, RSSI: -65dBm, Length: 12 bytes
```
✅ **TAG FOUND AND PARSED!**
- ID: The EPC/tag ID
- RSSI: Signal strength (more negative = weaker)
- Length: EPC data size

```
[IPC] Registering tag and stats listeners
[IPC] ✓ Tag detected - ID: 123ABC456, RSSI: -65dBm
[rfid:tag-read] received
```
✅ Tag transmitted to GUI

### Tag Extraction Failures

```
[SerialReader] ⚠️ No EPC data found in frame
```
⚠️ Frame received but no EPC bytes
- Frame format unexpected
- Device sends different layout
- **Action**: Provide raw hex for debugging

```
[SerialReader] Failed to decode EPC
```
⚠️ EPC bytes invalid UTF-8 and no fallback
- Rare issue with corrupted data

```
[SerialReader] Command 0x89 not recognized as tag data
```
⚠️ Received command code not in supported list
- Device sends unknown command
- **Action**: Collect hex and command code for support

---

## Database Logs

```
[IPC] Error saving tag to database: ...
```
⚠️ Tag received but DB save failed
- Database may be locked
- Usually not critical - tag still displays

```
[App] Database saved to file
```
✅ Database changes persisted to disk
- Happens every time a tag is saved

---

## GUI Display Logs

**Console logs** (DevTools):
- Look for `[SerialReader]`, `[RfidSdk]`, `[IPC]` tags

**Dashboard Display**:
- Go to Dashboard tab
- Look for new tag in Data Stream section
- Check Statistics panel for count increase

**Database**:
- Click "Export Data"
- Select time period
- Download CSV to verify tags were saved

---

## Log Severity Quick Reference

| Symbol | Meaning | Action |
|--------|---------|--------|
| ✅ | Success | Good! Continue |
| ⚠️ | Warning | Unexpected but continuing | 
| ❌ | Error | Problem detected |
| 🔍 | Info | Status update |
| ║ | Important | Notice this output |

---

## Performance Logs

```
[SerialReader] Received 256 bytes, buffer size: 512
```
✅ Normal - buffer accumulating data

```
[SerialReader] Incomplete frame: need 50 bytes, have 30, waiting for more data...
```
✅ Normal - multi-packet frame assembly

```
[SerialReader] Found 0xA0 at index 5, discarding 5 bytes
```
✅ Normal - recovered from misaligned data

```
[SerialReader] Remaining buffer: 0 bytes
```
✅ Normal - buffer cleaned after processing

---

## Understanding the Log Flow

### Successful Read

```
INPUT:   User clicks "Start Read"
    ↓
LOG:     [IPC] reader:start-scan
    ↓
LOG:     [RfidSdk] Starting scan
    ↓
LOG:     [SerialReader] Sending start inventory command
    ↓
LOG:     ✓ Start scan command sent successfully
    ↓
WAIT:    Present RFID tag...
    ↓
LOG:     [SerialReader] ====== DATA RX #1 ======
    ↓
LOG:     ✓ Frame #1 complete
    ↓
LOG:     ✓ Tag detected - ID: ...
    ↓
OUTPUT:  Tag appears in Dashboard
         Statistics updated
         Database saved
```

### Failed Read (Device Not Sending Data)

```
INPUT:   User clicks "Start Read"
    ↓
LOG:     [IPC] reader:start-scan
    ↓
LOG:     [SerialReader] Sending start inventory command
    ↓
LOG:     ✓ Start scan command sent successfully
    ↓
LOG:     🔍 Waiting for tag data...
    ↓
SILENCE: (no DATA RX messages for 10+ seconds)
    ↓
OUTPUT:  No tags in Dashboard
         No database entries
         
→ Problem: Device not sending data
  Check: Power, cable, baud rate, device mode
```

---

## Tips for Reading Logs

1. **Scroll to top** after clicking Start Read
2. **Look for pattern**: 
   - SUCCESS: DATA RX → Frame → Tag detected
   - FAILURE: DATA RX missing OR Frame errors
3. **Timestamps**: Are events happening in correct order?
4. **Error messages**: Read them completely (they tell you what's wrong)
5. **Try once**: Don't spam Start/Stop - watch output carefully

---

## Export All Logs (for debugging)

To share logs with support:

1. **F12** → Console
2. **Right-click** → "Save as..."
3. **Export logs** (some browsers support this)
4. Or take **screenshots** of console area showing all messages
5. Include **device model** and **issue description**
