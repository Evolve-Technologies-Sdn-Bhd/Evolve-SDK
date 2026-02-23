# Your Data Breakdown

## Raw Data Provided
```
BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06
```

## Byte-by-Byte Analysis

```
Position  Hex   Dec  Description
────────────────────────────────────────────────────────────────
0         BB    187  Protocol Header (Custom Format)
1         97    151  Protocol Version/ID
2         12     18  Packet Type
3         20     32  Flags/Options
4         00      0  Length/Reserved
                     
5         FB    251  ┐
6         A1    161  │
7         58     88  ├─ EPC Data (7 bytes = 14 hex characters)
8         6A    106  │
9         BC    188  │
10        DF    223  │
11        16     22  ┘
                     
12        00      0  ┐
13        00      0  │
14        00      0  ├─ Reserved / Additional Data
15        01      1  │
16        00      0  │
17        2A     42  ├─ (Content varies by protocol)
18        58     88  │
19        9E    158  │
20        00      0  │
21        F9    249  │
22        0D     13  │
23        0A     10  ├─ Possible timestamp/ID/Reserved
24        7E    126  │
25        7E    126  │
26        08      8  │
27        84    132  │
28        00      0  │
29        8A    138  │
30        06      6  ┘
```

## EPC Extraction

### Raw Bytes at Positions 5-11:
```
FB A1 58 6A BC DF 16
```

### Combined as Hex String:
```
FBA1586ABCDF16
```

### In JSON Format:
```json
{
  "EPC": "FBA1586ABCDF16"
}
```

## Verification

✓ **Protocol**: BB Custom Protocol (detected by 0xBB header)  
✓ **EPC Location**: Bytes 5-11  
✓ **EPC Format**: 7 bytes = 14 hex characters  
✓ **Expected Match**: YES - `FBA1586ABCDF16` ✓

## How to Use in Code

```typescript
import { PayloadDecryptor } from '../utils/PayloadDecryptor';

const hexData = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';
const result = PayloadDecryptor.parseEpcFromHex(hexData);

console.log(result);
// Output: { EPC: 'FBA1586ABCDF16' }

console.log(JSON.stringify(result, null, 2));
// Output:
// {
//   "EPC": "FBA1586ABCDF16"
// }
```

## Data Stream Output

When this data is received by your RFID reader, it will appear in the GUI Dashboard → Data Stream as:

### Raw Tab:
```
BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06
```

### JSON Tab:
```json
{
  "EPC": "FBA1586ABCDF16"
}
```

### Text Tab:
```
EPC: FBA1586ABCDF16
Protocol: BB Custom Format
Bytes Received: 31
```

## Testing

You can manually test this decryption in the browser console (DevTools → Console):

```javascript
// Import the decryptor (already available in the app)
const hexData = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';

// Call the parser
const result = window.PayloadDecryptor.parseEpcFromHex(hexData);
console.log(result);
```

