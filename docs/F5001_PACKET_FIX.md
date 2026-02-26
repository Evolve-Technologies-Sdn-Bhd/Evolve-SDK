# F5001 Protocol Packet Fix - BB 97 vs BB 40 Issue

## Problem Summary
Your SDK was receiving **BB 40 packets** (status frames) instead of **BB 97 packets** (tagged EPC data frames) like the official F5001 SDK.

## Root Cause Analysis

### Official F5001 SDK Sequence (WORKING)
**Write Commands Sent:**
```
bb d0 04 40 01 02 00 17 0d 0a    ← SetInventoryParam1 ONLY
bb 17 02 00 00 19 0d 0a          ← Stop (when user clicks stop)
bb 18 00 18 0d 0a                ← Clear (when user clicks stop)
```

**Read Responses Received:**
```
bb 97 12 20 00 dc d2 29 8a bc da 79 00 00 00 01 00 3c c3 32 00 6b 0d 0a
↑    ↑  
|    └─ BB 97 = Tag Data Frame (EPC Response)
└────── Contains actual EPC: DCD2298ABCDA79
```

### Your SDK Sequence (NOT WORKING)
**Write Commands Sent:**
```
bb d0 04 40 00 02 00 16 0d 0a    ← SetInventoryParam0 (EXTRA - wrong)
bb d0 04 40 01 02 00 17 0d 0a    ← SetInventoryParam1 (correct)
bb d0 04 40 07 02 00 1d 0d 0a    ← StartMultiEPC (WRONG - triggers BB 40)
bb d0 04 40 07 02 00 1d 0d 0a    ← StartMultiEPC again (REDUNDANT)
bb 17 02 00 00 19 0d 0a          ← Stop
bb 18 00 18 0d 0a                ← Clear
```

**Read Responses Received:**
```
bb 40 02 18 69 c3 0d 0a          
↑    ↑  
|    └─ BB 40 = Status Frame (NO EPC DATA)
└────── Wrong response type
```

## Key Issues Fixed

### Issue 1: Wrong Command Parameter (40 07)
- **What was wrong:** `startMultiEPC()` was sending `40 07` as the parameter
- **Why it was wrong:** This triggers BB 40 status responses, not BB 97 tag responses
- **What we fixed:** Removed the redundant `startMultiEPC()` call - it's not needed at all

### Issue 2: Unnecessary Initialization Commands  
- **What was wrong:** Sending SetInventoryParam0 before SetInventoryParam1
- **Why it was wrong:** Official SDK only sends SetInventoryParam1 to enable tag responses
- **What we fixed:** Now only sends `SetInventoryParam1` - this is the trigger command

### Issue 3: Duplicate Command Calls
- **What was wrong:** Calling `startMultiEPC()` twice with 100ms delay
- **Why it was wrong:** The second call was redundant and wrong
- **What we fixed:** Now sends param1 once and waits for BB 97 responses

## The Corrected Command Flow

```
User clicks "Start Read"
    ↓
Send: BB D0 04 40 01 02 00 17 0D 0A
    (SetInventoryParam1 - ENABLES TAG RESPONSES)
    ↓
Reader automatically responds with:
BB 97 ... (TAG DATA)
BB 97 ... (TAG DATA)  
BB 97 ... (TAG DATA)
    ↓
Each BB 97 frame contains EPC data
F5001ProtocolReader.parseTagFrame() extracts EPC
```

## What Changed in Code

### F5001Protocol.ts
- Marked `startMultiEPC()` as deprecated with explanation
- The command still exists but is no longer used

### SerialTransport.ts - startScan()
**Before:**
```typescript
// Send SetInventoryParam0
// Send SetInventoryParam1
// Send StartMultiEPC
// Wait 100ms
// Send StartMultiEPC again
```

**After:**
```typescript
// Send SetInventoryParam1 ONLY
// Wait for automatic BB 97 responses
```

## Expected Results After Fix

### Write Commands Sent (Should Match Official SDK):
```
bb d0 04 40 01 02 00 17 0d 0a
```

### Read Responses (Should Now Receive BB 97):
```
bb 97 12 20 00 dc d2 29 8a bc da 79 00 00 00 01 00 3c c3 32 00 6b 0d 0a
      ↑  ↑                                                               
      |  └─ Data Length (18 bytes)
      └─ BB 97 = Tag Response with EPC
```

## Verification Steps

1. **Build the SDK:**
   ```bash
   cd sdk
   npm run build
   ```

2. **Test with Serial Analyzer:**
   - Connect reader via serial
   - Open Serial Analyzer (monitoring the COM port)
   - In your GUI, click "Connect" then "Start Read"
   - Check write section: Should show `BB D0 04 40 01 02 00 17 0D 0A`
   - Check read section: Should show `BB 97` packets with EPC data (NOT `BB 40`)

3. **Verify in GUI:**
   - EPC tags should now display in the GUI
   - You should see the tag EPC: DCD2298ABCDA79

## Notes

- The BB 40 command (40 07 parameter) is for a different type of query, not for EPC tag reading
- SetInventoryParam1 is the correct initialization for multi-EPC streaming mode
- The F5001Reader correctly parses BB 97 frames - no changes needed there
- Stop and Clear commands remain the same as before

