# Serial Scanner Diagnostic Guide

## Problem: Scanner Doesn't Receive EPC Data

If your scanner isn't detecting tags, use this guide to diagnose the issue.

## Step 1: Check If Device Is Sending Any Data

1. **Open Developer Console**: In the GUI, press **F12** → **Console** tab
2. **Connect** to your serial device
3. **Click "Start Read"**
4. **Look for these logs**:

```
[SerialReader] ====== DATA RX #1 ======
[SerialReader] Received X bytes: <hex data>
[SerialReader] Raw ASCII (if printable): <data>
```

### What This Means:
- ✅ **If you see "DATA RX #" messages**: Device IS sending data
- ❌ **If you see NO "DATA RX" messages**: Device is not sending data OR wrong COM port/baud rate

### Next Steps:

**If NO data is being received:**
1. Verify COM port is correct (Device Manager)
2. Try different baud rates: 9600, 19200, 38400, 57600, 115200, 230400
3. Check device power and cable connections
4. Try a different USB cable or serial adapter
5. Verify device is in "serial mode" (not USB mode)

**If data IS being received, go to Step 2**

---

## Step 2: Check Data Format

Once you see incoming data, look at the hex output:

### Example 1: A0 Protocol Format ✅
```
[SerialReader] Received 15 bytes: A0 08 01 80 FE 59 00 01 02 03 04 05 06 07 08
```
**What this means**: Frame starts with `A0` (correct format) → Go to Step 3

### Example 2: Non-A0 Format ❌
```
[SerialReader] Received 20 bytes: 01 02 03 04 05 FE 59 00 01 02 03 04 05 06 07
```
**What this means**: No `A0` header found → **Device uses different protocol**
- Device might use: binary frames, ASCII text, or custom protocol
- Requires different parsing logic

### Example 3: ASCII Text ❌
```
[SerialReader] Received 10 bytes: EPC:123456
[SerialReader] Raw ASCII (if printable): EPC:123456
```
**What this means**: Device sends plain text, not A0 frames
- Requires different parser

---

## Step 3: Check Frame Structure

If data starts with `A0`, look at the second byte (length):

```
[SerialReader] Frame #1 complete: A0 08 01 80 FE 59 00 01 02 03 04 05 06 07 08
                                   ↑  ↑  ↑  ↑
                               Header Len Addr Cmd
```

**Frame breakdown:**
- **Byte 0 (A0)**: Header ✅
- **Byte 1 (08)**: Length = 8 bytes
- **Byte 2 (01)**: Address
- **Byte 3 (80)**: Command = 0x80 (typical inventory response)

### Expected Command Codes:
- `80` = Inventory report ✅
- `81` = Alternative tag data format ✅
- `88` = Start inventory response ✅
- `89` = Tag data / Continuous read response ✅
- `8A` = Real-time inventory ✅
- `8C` = Stop/Reset response

### If Command Code Is Different:
- Device might send different command codes
- Example: device sends `C0` instead of `80`
- Requires adding support for that command code

---

## Step 4: Check EPC Extraction

If frames are parsing correctly but no tags appear:

```
[SerialReader] ✓ Frame #1 complete: A0 08 01 80 FE 59 00 01 02 03 04 05 06 07 08
[SerialReader] Checksum - Calculated: 0x08, Received: 0x08
[SerialReader] ⚠️ No EPC data found in frame
```

**What this means**: Frame is valid but EPC extraction failed

### Possible Issues:
1. **EPC might start at different byte position**
   - Current code assumes: Byte 5+ is EPC
   - Your device might have: RSSI at different position, metadata fields, etc.

2. **Check actual frame layout**:
   ```
   Typical: [A0][Len][Addr][Cmd][RSSI][EPC...][Checksum]
   Your device: [A0][Len][Addr][Cmd][?][?][?][Checksum]
   ```

3. **Solution**: Provide the raw hex of a tag frame
   - Example: `A0 0E 01 80 FE 59 00 01 02 03 04 05 06 07 08 09 AA BB`
   - So we can help parse it correctly

---

## Step 5: Verify Start Command Is Sent

Check if the start scan command is actually being sent:

```
[SerialReader] ║      STARTING SCAN                 ║
[SerialReader] ✓ Start scan command sent successfully
[SerialReader] Decoded: Header=0xA0, Len=0x04, Addr=0x01, Cmd=0x88
[SerialReader] 🔍 Waiting for tag data (check console for incoming frames)...
```

### If Command NOT sent:
```
[SerialReader] ❌ Port not open, cannot start scan. Port state: {
  portExists: true,
  isOpen: false,
  isConnected: false
}
```
**What this means**: Serial port closed unexpectedly
- Try reconnecting
- Check for device disconnect
- Look for error messages in console before this

---

## Common Issues & Solutions

| Problem | Symptoms | Solution |
|---------|----------|----------|
| **Wrong COM Port** | No DATA RX messages | Check Device Manager, try different ports |
| **Wrong Baud Rate** | Garbled data (no 0xA0 headers) | Try standard rates: 115200, 38400, 9600 |
| **Device Not Powered** | No DATA RX messages | Check power cable, LED indicators |
| **Wrong Cable** | Connection fails or disconnects | Try shielded RS-232 cable |
| **Different Protocol** | Data doesn't start with A0 | Device uses different format - need custom parser |
| **Device Not in Read Mode** | Connected but no tags | Device might have mode switch, or needs different command |
| **Bad Checksum** | Frames arrive but marked invalid | Rare - try replacing cable |

---

## Data Collection For Debugging

If scanner still doesn't work, collect this info:

1. **Screenshots of console logs** when clicking "Start Read"
2. **First 10 lines of DATA RX** showing hex output
3. **Device model/manufacturer**
4. **Baud rate being used**
5. **Any documentation** for the device protocol

Post these in a bug report for faster help!

---

## Advanced: Custom Protocol Support

If your device uses a different protocol:

1. **Provide raw hex samples** of tag frames
2. **Document frame structure**:
   ```
   Example frame: FE 59 00 01 02 03 04 05
   Byte 0: Frame type
   Byte 1: RSSI
   Byte 2+: EPC data
   ```
3. **We'll add custom parser** to `SerialTransport.ts`

---

## Quick Checklist

- [ ] Opened F12 console while scanning
- [ ] Saw "DATA RX" messages in console
- [ ] Data starts with `A0` or identified protocol
- [ ] Command code (Byte 3) is recognized
- [ ] Checked with different baud rates
- [ ] Verified device power and cable
- [ ] No error messages in console
- [ ] Device is in correct mode for reading tags

---

## Still Not Working?

If you've gone through all steps, collect the information from "Data Collection For Debugging" section above and create a detailed bug report.
