# Data Format Inconsistency Issue - Root Cause & Fix

## The Problem

Every 5 seconds, the data extraction format changes between A0 and BB protocols, causing the same physical tag to be counted as **multiple unique tags**. This breaks cumulative total and unique count.

### Root Cause

In `SerialTransport.ts`, the `extractAndEmitTag()` method extracts tag IDs differently depending on protocol:

#### A0 Protocol
```
epcStart = 4 or 5 (depends on command)
epcEnd = frame.length - 1 (variable, includes all payload)
Extracted Length: 4-254 bytes
Result: "ABCDEF7890EXTRA_DATA_HERE"
```

#### BB Protocol  
```
epcStart = 3 (fixed)
epcEnd = 10 (fixed, hardcoded)
Extracted Length: 7 bytes (fixed)
Result: "ABCDEF7"
```

### The Bug Scenario

If the same physical tag sends data in both formats:
1. **First scan (BB format)**: ID extracted = "ABCDEF7" → Added to unique set
2. **Second scan (A0 format)**: ID extracted = "ABCDEF7890EXTRA_DATA" → Treated as NEW unique tag ❌
3. **Result**: Same tag counted twice in cumulative display

### Impact

- **Total Reads**: Works correctly (increments each time)
- **Unique Count**: Multiplies incorrectly when format switches
- **5-Second Cycle**: Device alternates between sending A0 and BB frames, causing format flip every 5 seconds

## The Solution

Normalize the ID extraction across both protocols by:
1. **Always extract exactly 7 bytes of EPC data** (the core identifier)
2. **Ignore protocol-specific padding or extra data**
3. **Ensure consistent ID format** regardless of which protocol frame arrives

### Changes Required

- Standardize `epcStart` and `epcEnd` positions for both A0 and BB
- Extract only the essential EPC bytes (first 7-8 bytes of tag data)
- Document the expected format in code comments

## Expected Result

Whether tag data arrives as A0 or BB protocol:
- **Same tag = Same extracted ID**
- **Cumulative display works correctly**
- **Unique count is accurate**
