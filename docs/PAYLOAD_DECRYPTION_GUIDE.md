# RFID Payload Decryption Guide

## Overview

The `PayloadDecryptor` utility extracts EPC data from raw hex payloads received from RFID readers, supporting multiple protocol formats.

## Quick Start

### 1. Parse Hex Data to Extract EPC

```typescript
import { PayloadDecryptor } from './utils/PayloadDecryptor';

// Raw hex data from your RFID device
const hexData = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';

// Extract EPC
const result = PayloadDecryptor.parseEpcFromHex(hexData);
console.log(result);
// Output: { EPC: "FBA1586ABCDF16" }
```

### 2. Get JSON Format

```typescript
const jsonString = PayloadDecryptor.parseToJson(hexData);
console.log(jsonString);
// Output:
// {
//   "EPC": "FBA1586ABCDF16"
// }
```

### 3. Validate EPC Format

```typescript
const isValid = PayloadDecryptor.validateEpc('FBA1586ABCDF16');
console.log(isValid); // true - valid 14-character hex EPC
```

## Supported Protocol Formats

### BB Protocol (Custom Protocol)
- **Format**: `BB 97 12 20 00 [EPC: 7 bytes] [DATA...]`
- **EPC Position**: Bytes 5-11 (7 bytes = 14 hex characters)
- **Example**: 
  ```
  Input:  BB 97 12 20 00 FB A1 58 6A BC DF 16 ...
  Output: EPC = FBA1586ABCDF16
  ```

### A0 Protocol (Seuic Standard)
- **Format**: `A0 [LEN] [ADDR] [CMD] [RSSI] [EPC: 7 bytes] ...`
- **EPC Position**: Bytes 5-11 (after RSSI byte)
- **RSSI Position**: Byte 4 (negative dBm value)

## Data Extraction Process

```
Raw Hex: BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06
         │  │  │  │  │  └─────────┬─────────┘  │  │  │  │  │  └─────────────────┬─────────────────┘
         └──────┬──────┴─ Header  │ EPC Data   └────────────┬──────────────────┬────────(Reserved)
                │  (5 bytes)      │ (7 bytes)               │                 │
                │                 │                        │                 └──(Checksum)
                │                 │                        └─(Antenna info, etc.)
                └─ Protocol ID    └─ Extracted: FBA1586ABCDF16
```

## Integration with GUI

The PayloadFormatter automatically uses PayloadDecryptor when processing raw hex data:

```typescript
import { PayloadFormatter } from './utils/PayloadFormatter';

const rawTagData = {
  timestamp: Date.now(),
  raw: 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 ...',
  rssi: -45
};

// PayloadFormatter automatically calls PayloadDecryptor
const formatted = PayloadFormatter.formatTagForDisplay(rawTagData);
console.log(formatted);
// Output: 
// {
//   id: 1708671234567,
//   timestamp: "14:23:45",
//   direction: "RX",
//   data: {
//     EPC: "FBA1586ABCDF16",
//     EPC_Decrypted: "FBA1586ABCDF16",
//     Frame_Hex: "BB 97 12 20 00 FB A1 58 6A BC DF 16 ...",
//     RSSI: "-45 dBm",
//     RSSI_Value: -45,
//     Timestamp: "2026-02-23T14:23:45.000Z"
//   }
// }
```

## Data Stream Display

In the GUI Dashboard → Data Stream (Raw tab), you'll see:

```
14:23:45  [RX]  EPC: FBA1586ABCDF16, RSSI: -45dBm
14:23:46  [RX]  BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 ...
14:23:47  [RX]  {
             "EPC": "FBA1586ABCDF16"
           }
```

## Console Debug Output

When raw data is received and parsed, you'll see:

```
[PayloadDecryptor] Parsing hex data, total bytes: 31
[PayloadDecryptor] Detected BB protocol format
[PayloadDecryptor] Extracted EPC bytes: 0xFB 0xA1 0x58 0x6A 0xBC 0xDF 0x16
[PayloadDecryptor] EPC: FBA1586ABCDF16
[PayloadFormatter] ✓ Successfully decrypted EPC: FBA1586ABCDF16
```

## API Reference

### `PayloadDecryptor.parseEpcFromHex(hexString: string)`
Extracts EPC from raw hex data.
- **Input**: Hex string with or without spaces (e.g., `"BB 97 12 20 00 FB A1 58 6A BC DF 16..."`)
- **Output**: `{ EPC: "FBA1586ABCDF16" }`

### `PayloadDecryptor.parseToJson(hexString: string)`
Returns JSON string representation.
- **Input**: Hex string
- **Output**: JSON string with proper formatting

### `PayloadDecryptor.validateEpc(epc: string)`
Checks if EPC matches valid format (14 hex characters).
- **Input**: EPC string (e.g., `"FBA1586ABCDF16"`)
- **Output**: `true` or `false`

### `PayloadDecryptor.extractRssi(hexString: string)`
Extracts RSSI (signal strength) value.
- **Input**: Hex string
- **Output**: RSSI value in negative dBm (e.g., `-45`) or `null`

## Testing

Run the included test utility:

```typescript
import { testPayloadDecryption } from './utils/PayloadDecryptor.test';

testPayloadDecryption();
// Outputs:
// ========== PAYLOAD DECRYPTION TEST ==========
// Test Case 1: BB Protocol Format
// Input hex: BB 97 12 20 00 FB A1 58 6A BC DF 16 ...
// Expected EPC: FBA1586ABCDF16
// Parsed result: { "EPC": "FBA1586ABCDF16" }
// Match: ✓ PASS
// ...
```

## Troubleshooting

### EPC shows "UNKNOWN"
- Device may be using different protocol format
- Enable console debug logs: check DevTools F12 → Console
- Verify hex data format (should be space-separated or continuous)

### EPC shows "ERROR"
- Hex string parsing failed
- Check for invalid characters in hex data
- Verify data length is at least 12 bytes

### Protocol not detected
- Your device protocol might not be in the detection list
- Use generic extraction mode (automatically tries to find 7-byte EPC sequences)
- Report protocol format for custom support

## Protocol Detection Order

1. **BB Protocol** - Looks for `0xBB` at byte 0
2. **A0 Protocol** - Looks for `0xA0` at byte 0  
3. **Generic Mode** - Scans for 7-byte sequences with variation

## Future Extensions

To support additional protocols, add to `PayloadDecryptor.parseEpcFromHex()`:

```typescript
else if (firstByte === 0xMY_PROTOCOL) {
  // Parse custom format and extract EPC
  epc = /* extraction logic */;
}
```

