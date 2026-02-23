/**
 * PayloadDecryptor Test Utility
 * 
 * Usage:
 * import { testPayloadDecryption } from './PayloadDecryptor.test';
 * testPayloadDecryption();
 */

import { PayloadDecryptor } from './PayloadDecryptor';

export function testPayloadDecryption() {
  console.log('========== PAYLOAD DECRYPTION TEST ==========\n');

  // Test case 1: Your specific data
  const testData1 = 'BB 97 12 20 00 FB A1 58 6A BC DF 16 00 00 00 01 00 2A 58 9E 00 F9 0D 0A 7E 7E 08 84 00 8A 06';
  const expectedEpc1 = 'FBA1586ABCDF16';

  console.log('Test Case 1: BB Protocol Format');
  console.log('Input hex:', testData1);
  console.log('Expected EPC:', expectedEpc1);

  const result1 = PayloadDecryptor.parseEpcFromHex(testData1);
  console.log('Parsed result:', JSON.stringify(result1, null, 2));
  console.log('Match:', result1.EPC === expectedEpc1 ? '✓ PASS' : '✗ FAIL');
  console.log('---\n');

  // Test case 2: Output in JSON format
  console.log('Test Case 2: JSON Output Format');
  const jsonOutput = PayloadDecryptor.parseToJson(testData1);
  console.log('JSON output:');
  console.log(jsonOutput);
  console.log('---\n');

  // Test case 3: Validation
  console.log('Test Case 3: EPC Validation');
  console.log('Is valid EPC format:', PayloadDecryptor.validateEpc(result1.EPC) ? '✓ YES' : '✗ NO');
  console.log('---\n');

  console.log('========== TEST COMPLETE ==========\n');
}

// Run tests if this file is imported
if (typeof window !== 'undefined') {
  // Browser environment - can be called manually
  console.log('[PayloadDecryptor.test] Ready for testing. Call testPayloadDecryption() to run tests.');
}
