# Cumulative Display Debugging Guide

## Issue
The cumulative display (Total & Unique tag count) is not updating when tags are received.

## Debug Steps

### Step 1: Check Console Logging Flow

Open **DevTools (F12)** → **Console** tab and look for these log messages in order:

#### Expected Log Sequence When You Receive a Tag:

```
[RfidSdk] Emitting stats event: { total: 1, unique: 1 }
[IPC] ✓ Received stats event from SDK: Object { total: 1, unique: 1 }
[IPC] Stats: total=1, unique=1
[IPC] ✓ Sent rfid:stats to renderer
[TagContext] ✓ Received stats update: Object { total: 1, unique: 1 }
[TagContext] Setting total=1, unique=1
[CumulativeCount] Updated - totalReads: 1 uniqueCount: 1
```

### Step 2: Trace Each Component

**If you see the messages:**

| Message Present | What It Means |
|---|---|
| Only SDK logs | ✗ Stats not reaching IPC bridge |
| SDK + IPC logs | ✗ Stats not reaching renderer (GUI) |
| All except TagContext | ✗ onStats listener not set up |
| All except CumulativeCount | ✗ Component not re-rendering |
| No logs at all | ✗ Tags not being detected |

### Step 3: Check Each Component

#### A. Verify SDK is Emitting Stats
```javascript
// In DevTools Console:
console.log('SDK reader:', window.sdk?.reader);
console.log('SDK stats:', window.sdk?.getCumulativeStats?.());
```

#### B. Verify Stats Listener is Registered
```javascript
// In DevTools Console:
console.log('onStats function exists:', typeof window.electronAPI.onStats);
// Then manually test it:
window.electronAPI.onStats((stats) => {
  console.log('[MANUAL TEST] Received stats:', stats);
});
```

#### C. Verify Tag Events Are Coming In
Look for these in the console:
```
[Dashboard] ✓ Received tag event
[Dashboard] ✓ Received raw data packet
```

### Step 4: Manual Reset Test

In DevTools Console, manually trigger a stats update:

```javascript
// Simulate receiving a stats event
const mockStats = { total: 5, unique: 3 };
window.electronAPI.onStats((stats) => {
  console.log('[MANUAL] Stats arrived:', stats);
});

// You should now see CumulativeCount update logs
```

## Checklist: What to Verify

### ✓ Connection & Scanning
```
□ Hardware connection shows "Connected"
□ Start Read button clicked
□ Serial data showing in Console ([SerialReader] Data received...)
□ Tag data appearing in Data Stream
```

### ✓ SDK Level
```
□ Tags are being detected ([RfidSdk] Emitting stats event)
□ Stats have non-zero values (total > 0, unique > 0)
□ Different tags show increasing unique count
```

### ✓ IPC Bridge
```
□ IPC logs show "✓ Received stats event from SDK"
□ IPC logs show "✓ Sent rfid:stats to renderer"
□ No errors in [IPC] logs
```

### ✓ GUI Layer
```
□ TagContext logs show stats received
□ CumulativeCount logs show value updates
□ Component renders with updated numbers
```

## Common Issues & Solutions

### Issue 1: No SDK Logs
**Problem:** `[RfidSdk] Emitting stats event` never appears

**Causes:**
- No tags being detected from device
- SDK not connected to reader
- Reader in wrong mode

**Solution:**
```
1. Check [SerialReader] Data received logs - confirm hex data arriving
2. Check [SerialReader] Parsing frame - confirm frames being parsed
3. Check [SerialReader] ✓ Tag detected - confirm EPC being extracted
4. If no tag logs, device isn't sending data
```

### Issue 2: SDK Logs Present, But No IPC Logs
**Problem:** `[RfidSdk]` logs show but `[IPC]` stats logs don't

**Causes:**
- Stats listener not registered
- SDK not emitting to registered listener
- Event name mismatch

**Solution:**
```javascript
// In Electron main process console (not DevTools), verify:
// 1. Listener is registered
console.log('statsListener registered:', typeof currentStatsListener === 'function');

// 2. SDK is event emitter
console.log('SDK is EventEmitter:', sdk instanceof require('events').EventEmitter);

// 3. Manually emit:
sdk.on('stats', (stats) => console.log('[MANUAL EMIT TEST]', stats));
sdk.start(); // Start scanning - should trigger stats event
```

### Issue 3: IPC Logs Present, But No TagContext Logs
**Problem:** `[IPC] ✓ Sent rfid:stats` appears but `[TagContext]` logs don't

**Causes:**
- Renderer didn't receive IPC message
- `electronAPI.onStats` not set up correctly
- Wrong channel name

**Solution:**
```javascript
// In DevTools Console:
// 1. Verify preload exposed the function
console.log('window.electronAPI:', window.electronAPI);
console.log('onStats exists:', !!window.electronAPI?.onStats);

// 2. Check if listener is attached
const listeners = window.electronAPI.onStats ? 'yes' : 'no';
console.log('Listeners attached:', listeners);

// 3. Listen manually
window.electronAPI.onStats((stats) => {
  console.log('[MANUAL LISTENER] Stats:', stats);
});
```

### Issue 4: All Logs Present, But Values Don't Update
**Problem:** Logs show stats arriving but numbers don't change

**Causes:**
- Component not re-rendering
- React state not updating
- Display component mounted after context

**Solution:**
```javascript
// In DevTools Console:
// Force the component to re-check
window.location.reload(); // Full page reload

// After reload, present a tag again and check if display updates
```

## Debug Checklist: Run in Order

When user says "display doesn't work":

```
1. ✓ Connected to device?
   └─ Check: Hardware Connection → "Connected ✓"

2. ✓ Data streaming?
   └─ Check: Dashboard → Data Stream → see hex/JSON data

3. ✓ Tags detected?
   └─ Check: Console → [SerialReader] ✓ Tag detected

4. ✓ SDK emitting stats?
   └─ Check: Console → [RfidSdk] Emitting stats event

5. ✓ IPC forwarding stats?
   └─ Check: Console → [IPC] ✓ Received stats event from SDK

6. ✓ GUI receiving stats?
   └─ Check: Console → [TagContext] ✓ Received stats update

7. ✓ Component displaying?
   └─ Check: Cumulative Display box shows numbers > 0
   └─ Check: Console → [CumulativeCount] Updated
```

## Quick Fix: Reset Everything

If stuck, try full reset:

```javascript
// In DevTools Console:

// 1. Reload app
window.location.reload();

// 2. After reload, disconnect and reconnect
// Hardware Connection → Disconnect → Connect

// 3. Start fresh scan
// Read Control → Start Read

// 4. Present tag and check console
```

## File Locations for Debugging

To enable verbose logging, check these files:

- **SDK Stats Emission**: `/sdk/src/Rfidsdk.ts` (line ~151)
- **IPC Stats Forwarding**: `/gui/electron/ipc/sdkbridge.js` (line ~246)
- **GUI Stats Reception**: `/gui/src/contexts/TagContext.tsx` (line ~27)
- **Display Component**: `/gui/src/components/Sidebar/CumulativeCount.tsx` (line ~7)

All now include `console.log` statements for debugging.

## Expected Console Output Examples

### Working Scenario (Tag Detected):
```
[SerialReader] Data received (31 bytes): BB 97 12 20 00 FB A1 58 6A BC DF 16...
[SerialReader] Frame complete - processing...
[SerialReader] ✓ Tag detected - EPC: FBA1586ABCDF16, RSSI: -45dBm
[RfidSdk] Emitting stats event: { total: 1, unique: 1 }
[IPC] ✓ Received stats event from SDK: Object { total: 1, unique: 1 }
[IPC] Stats: total=1, unique=1
[IPC] ✓ Sent rfid:stats to renderer
[TagContext] ✓ Received stats update: Object { total: 1, unique: 1 }
[TagContext] Setting total=1, unique=1
[CumulativeCount] Updated - totalReads: 1 uniqueCount: 1
```

### Non-Working Scenario (No Tags):
```
[SerialReader] Data received (31 bytes): BB 97 12 20 00 FB A1 58 6A BC DF 16...
[SerialReader] Frame complete
[SerialReader] Unrecognized command: 0x97  ← PROBLEM: Frame not parsing correctly
(no tag detected, no stats emitted)
```

## Next Steps

1. **Collect Console Output**: Screenshot or copy all console logs
2. **Identify the Break Point**: Find where logs stop
3. **Focus Debug**: Look at the component at that break point
4. **Report Issue**: Include:
   - Full console log sequence
   - Where the logs stop
   - Device model and settings
   - Expected vs actual values

