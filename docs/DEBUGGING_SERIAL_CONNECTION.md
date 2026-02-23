# Debugging Serial Connection - Step by Step

If your scanner isn't detecting tags, follow this guide to find the exact point where it fails.

## What Changed

The console logging now **forwards [SerialReader], [TcpReader], [App], and [Main] messages to the GUI DevTools**. This was the main missing piece - you weren't seeing what was happening!

---

## Step 1: Restart the Application

1. **Close** the Evolve SDK GUI application completely
2. **Wait 2 seconds**
3. **Restart** the application
4. **Open DevTools**: Press **F12** in the GUI window

---

## Step 2: Check If SDK Initialized

In the **Console** tab (F12), look for these startup messages:

### ✅ Success - You should see:
```
[App] SDK initialized successfully
[App] Database initialized successfully at C:\Users\...\rfid_events.db
```

### ❌ Failure - If you see:
```
[Electron] SDK not available; running in mock mode. Error: ...
```
**Problem**: SDK didn't load
- Try running: `cd sdk && npm run build`
- Make sure build completed without errors

---

## Step 3: Connect to Serial Device

1. **In the GUI**, go to **Hardware Connection** panel
2. **Select "Serial COM"** radio button
3. **Choose** your COM port (e.g., COM3)
4. **Choose** baud rate (try 115200 first)
5. **Click "Connect"**

### ✅ Success - Check console for:
```
[IPC] Attempting serial connection to COM3 @ 115200 baud
[SerialReader] Attempting connection to COM3 @ 115200 baud
[SerialReader] Successfully connected to COM3 @ 115200 baud
[IPC] Connection Successful: Serial COM3 @ 115200 baud
```

### ❌ Failure - If you see:
```
[SerialReader] Failed to open port COM3: Port does not exist
```
**Problem**: Wrong port number
- Check Device Manager for correct COM port
- Or try different ports: COM1, COM2, COM4, COM5, etc.

---

## Step 4: Start Scanning

1. **In the GUI**, click **"Start Read"** button (green)
2. **Check console immediately**

### ✅ Success - You should see:
```
[IPC] reader:start-scan
[IPC] Registering tag and stats listeners
[IPC] Starting SDK scan
[RfidSdk] Starting scan
[SerialReader] ╔════════════════════════════════════╗
[SerialReader] ║      STARTING SCAN                 ║
[SerialReader] ╚════════════════════════════════════╝
[SerialReader] Sending start inventory command: a00401880100
[SerialReader] ✓ Start scan command sent successfully
[SerialReader] 🔍 Waiting for tag data...
[IPC] SDK started successfully
```

### ❌ Failure 1 - Port closed:
```
[SerialReader] ❌ Port not open, cannot start scan. Port state: {
  portExists: true,
  isOpen: false,
  isConnected: false
}
```
**Problem**: Connection was lost
- Try reconnecting
- Check device power/cables

### ❌ Failure 2 - No output at all:
```
[IPC] reader:start-scan
```
**And then nothing else...**

**Problem**: Event listeners not registering
- Try stopping and starting again
- Close and reopen application

---

## Step 5: Wait for Data

After clicking "Start Read", **wait 3-5 seconds** and look for:

### ✅ Success - Data arriving:
```
[SerialReader] ====== DATA RX #1 ======
[SerialReader] Received 15 bytes: A0080180FE590001020304050607080910
[SerialReader] Raw ASCII (if printable): ....Y...........
[SerialReader] Total buffer size: 15 bytes
```

### ❌ Failure - No DATA RX:
```
(long silence after "Waiting for tag data...")
```
**Problem**: Device not sending data
- Check device power
- Try presenting tag closer to reader
- Verify baud rate is correct
- Check cable connection

### ❌ Failure - Wrong data format:
```
[SerialReader] Received 20 bytes: FE590001 02030405 0607080910
[SerialReader] ⚠️ No A0 header at buffer[0]: found 0xFE, searching...
```
**Problem**: Device uses different protocol (not A0 Seuic)
- Your device sends different format
- See "Custom Protocol" section below

---

## Step 6: Frame Processing

After data arrives, check for frame processing:

### ✅ Success - Frame parsed:
```
[SerialReader] ✓ Frame #1 complete: A0080180FE590001020304050607080910
[SerialReader] Frame details - Header: 0xa0, Len: 8, Addr: 0x1, Cmd: 0x80
[SerialReader] Checksum - Calculated: 0x08, Received: 0x08
```

### ✅ Success - Tag detected:
```
[SerialReader] ✓ Tag detected - ID: 123ABC456, RSSI: -65dBm, Length: 12 bytes
```

### ❌ Failure - No frame processing:
```
(DATA RX messages appear but no frame processing)
```
**Problem**: Data arriving but not recognized as valid frame
- Length field might be wrong
- Try different baud rate
- Device might use different framing

---

## Step 7: Tag Appears in GUI

After successful tag detection, you should see:

1. **In the Dashboard** → **Data Stream section**: New tag appears with EPC, RSSI, timestamp
2. **In the Statistics**: Count increases (e.g., "Total: 1, Unique: 1")
3. **In the Database**: Tag is saved (check later with "Export Data")

### ✅ Success Example:
```
Dashboard Data Stream:
┌─────────────────────────────────────┐
│ 123ABC456  | -65 dBm | 14:32:45    │
│ 789XYZ000  | -72 dBm | 14:32:46    │
└─────────────────────────────────────┘

Statistics:
Total Tags: 2
Unique: 2
```

### ❌ Not Appearing:
- Check Step 6: Was tag actually detected?
- Check browser console (F12) for errors from GUI components
- Try reloading page: Ctrl+R

---

## Troubleshooting Tree

```
START
  ↓
App initialized?
  ├ NO → Rebuild SDK: cd sdk && npm run build
  ├ YES ↓
  Connected to serial?
    ├ NO → Wrong COM port, try others
    ├ YES ↓
    Scan started?
      ├ NO → Port closed unexpectedly, reconnect and try again
      ├ YES ↓
      Data arriving? (DATA RX #1, etc)
        ├ NO → Device power/cable, try different baud rate
        ├ YES ↓
        Frame parsed? (Frame #1 complete)
          ├ NO → Wrong protocol format (see Custom Protocol)
          ├ YES ↓
          Tag detected? (✓ Tag detected)
            ├ NO → Unexpected frame structure
            ├ YES ↓
            Appears in GUI?
              ├ NO → GUI issue (refresh page)
              ├ YES ✅ SUCCESS!
```

---

## Custom Protocol Support

If your device **doesn't use A0 format** (no 0xA0 header), I can add support.

### Collect This Info:
1. **Hex dump of first tag frame** (copy from console)
   ```
   Example: FE 59 00 01 02 03 04 05 06 07
   ```

2. **Frame structure explanation**:
   ```
   Byte 0: Frame Header     (0xFE)
   Byte 1: RSSI             (0x59 = 89, so -89 dBm?)
   Byte 2-7: EPC data       (0x00 01 02 03 04 05)
   Byte 8: Checksum        (0x06)
   Byte 9: End marker      (0x07)
   ```

3. **How many frames** to see pattern

### I can then:
- Add custom parser for your protocol
- Extract EPC from correct position
- Parse RSSI correctly
- Update framework to support your device

---

## Console Filter Update

The following tags are now forwarded to GUI DevTools:
- `[SerialReader]` ← Serial data logs
- `[TcpReader]` ← TCP data logs  
- `[RfidSdk]` ← SDK operation logs
- `[IPC]` ← IPC bridge logs
- `[App]` ← Application startup logs
- `[Main]` ← Main process logs
- `[MqttReader]` ← MQTT connection logs

**All other console.log messages won't appear in DevTools** (reduces noise).

---

## Quick Checklist

Use this to verify each step:

- [ ] Rebuilt SDK (npm run build)
- [ ] Closed and reopened GUI
- [ ] Opened DevTools (F12)
- [ ] Saw "[App] SDK initialized successfully"
- [ ] Connected to serial device (saw "[SerialReader] Successfully connected")
- [ ] Clicked "Start Read" 
- [ ] Saw "[SerialReader] Waiting for tag data..."
- [ ] Presented RFID tag to reader
- [ ] Saw "[SerialReader] ====== DATA RX #1 ======" (or higher numbers)
- [ ] Saw "[SerialReader] ✓ Tag detected"  
- [ ] Tag appeared in Dashboard
- [ ] Statistics count increased

If all checked ✅ → **System working correctly!**
If any unchecked → **Follow troubleshooting tree above**

---

## Still Not Working?

Collect this info and share:

1. **Screenshots of ALL console logs** from startup to tag attempt
2. **Device model/manufacturer name**
3. **Baud rate you're using**
4. **What you see**: No data? Wrong data? Frames but no tags?
5. **Hex dump of first 5 data packets** (copy from DATA RX logs)

This info helps pinpoint the exact issue!
