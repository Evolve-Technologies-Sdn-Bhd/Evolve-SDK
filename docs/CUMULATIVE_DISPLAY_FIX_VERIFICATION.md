# Cumulative Display Fix - Verification Guide

## What Was Fixed

### The Problem
Every 5 seconds, the device was sending tag data in different formats:
- **A0 Protocol**: Extracted full payload (potentially 10+ bytes)
- **BB Protocol**: Extracted only 7 bytes

This caused the same physical tag to have different extracted IDs, breaking cumulative counting.

**Example:**
```
Same Tag Sending Data:
  Time 0-5s:  A0 format → ID extracted as "ABCDEF7890EXTRA"  (16 bytes)
  Time 5-10s: BB format → ID extracted as "ABCDEF7"         (7 bytes)
  Result: Counted as 2 different tags ❌
```

## The Solution

### Changes Made

#### 1. **SerialTransport.ts** - Normalized EPC Extraction
```typescript
// Before: Variable extraction size
A0 Protocol:  epcStart=4, epcEnd=frame.length-1      (4-250 bytes)
BB Protocol:  epcStart=3, epcEnd=10                   (7 bytes)

// After: Standardized to ~7 bytes
A0 Protocol:  epcStart=4, epcEnd=Math.min(length, 11) (~7 bytes)
BB Protocol:  epcStart=3, epcEnd=10                    (7 bytes)
```

#### 2. **RfidSdk.ts** - Enhanced Debugging
- Added protocol tracking in tag data
- Added detailed logging showing:
  - Tag ID
  - Protocol used
  - Whether it's a new unique tag
  - Current cumulative stats

## How to Verify the Fix

### Step 1: Enable Console Logging
Open Developer Tools (F12) and look for these patterns:

**Normal behavior after fix:**
```
[SerialReader] [A0] Format: RSSI at byte 4, EPC starts at byte 5 (normalized 7-byte extraction)
[SerialReader] [A0] EPC raw bytes (7 bytes, normalized): ABCDEF7
[RfidSdk] Tag read: ID=ABCDEF7, Protocol=A0, NEW=true, Total=1, Unique=1
[RfidSdk] Emitting stats event: { total: 1, unique: 1 }

[SerialReader] [BB] Format: RSSI at byte 2, EPC at bytes 3-9 (standardized 7-byte extraction)
[SerialReader] [BB] EPC raw bytes (7 bytes, normalized): ABCDEF7
[RfidSdk] Tag read: ID=ABCDEF7, Protocol=BB, NEW=false, Total=2, Unique=1
[RfidSdk] Emitting stats event: { total: 2, unique: 1 }
```

### Step 2: Monitor Cumulative Display
1. Start scanning with your RFID reader
2. Watch the "Cumulative Display" widget:
   - **Total**: Should increment by 1 for each tag read
   - **Unique**: Should increment by 1 only for new tags
   
3. Expected behavior:
   - If the same tag is read multiple times: 
     - `Total` increases each time ✓
     - `Unique` stays the same (only increment on first read) ✓

### Step 3: Test Format Switching
If your device switches between A0 and BB protocols:

**Before Fix (❌ BROKEN)**
```
Total: 1, Unique: 1  (after A0 frame)
Total: 2, Unique: 2  (after BB frame of same tag - WRONG!)
Total: 3, Unique: 3  (expected but got duplicates)
```

**After Fix (✓ CORRECT)**
```
Total: 1, Unique: 1  (after A0 frame of tag "ABC123")
Total: 2, Unique: 1  (after BB frame of same tag - CORRECT!)
Total: 3, Unique: 1  (same tag counted again, unique stays at 1)
```

## Key Log Messages to Look For

| Message | Meaning |
|---------|---------|
| `EPC raw bytes (7 bytes, normalized)` | ✓ Correct - Normalized extraction working |
| `EPC raw bytes (16 bytes, normalized)` | ⚠️ Issue - Indicates variable payload still being sent |
| `[A0] Format: ... (normalized 7-byte extraction)` | ✓ Correct - A0 protocol using normalized extraction |
| `[BB] Format: ... (standardized 7-byte extraction)` | ✓ Correct - BB protocol using standardized extraction |
| `NEW=false, Unique=X` | ✓ Correct - Same tag recognized across protocols |

## Testing Checklist

- [ ] Start scanning - Total increments correctly
- [ ] Read same tag multiple times - Unique count stays same
- [ ] Check console logs show normalized 7-byte extraction
- [ ] Verify protocol switch message appears in logs
- [ ] After 5 seconds, confirm ID is still the same across protocol changes
- [ ] Reset button clears both Total and Unique to 0
- [ ] Multiple different tags show correct unique count

## Troubleshooting

### Issue: Unique count still multiplying
**Check:**
1. Open browser DevTools → Console
2. Look for EPC extraction size:
   - If seeing "16 bytes" instead of "7 bytes" → Device sending variable format
   - Check A0 protocol commands being sent

### Issue: Protocol not showing in logs
**Check:**
1. `_protocol` field might not be present in older tag objects
2. Update code to include `_protocol: protocolName` in emitTag()

### Issue: Same tag still counted twice
**Check:**
1. Confirm both A0 and BB extract exactly **7 bytes**
2. Verify ID field is set to the same value in both cases
3. Check SDK is using `epc || id` field for unique identification

## Debugging Commands

Run these in the browser console to inspect tag data:

```javascript
// Monitor incoming tags
window.electronAPI.onTagRead((tag) => {
  console.log('Tag received:', {
    id: tag.id,
    epc: tag.epc,
    protocol: tag._protocol,
    epcLength: tag.id?.length || 'unknown'
  });
});
```

## Expected Outcomes

✓ **Cumulative display works correctly even when device alternates between A0 and BB protocols**

✓ **Same physical tag always has same extracted ID regardless of protocol**

✓ **Unique count is accurate across protocol switches**

✓ **Total count increments correctly**

✓ **5-second format changes no longer break counting logic**
