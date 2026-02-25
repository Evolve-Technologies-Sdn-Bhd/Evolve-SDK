// CUMULATIVE DISPLAY DEBUG SCRIPT
// Copy-paste this into DevTools Console (F12) to test stats flow

console.clear();
console.log('🔍 CUMULATIVE DISPLAY DEBUG - Starting diagnostic...\n');

// Test 1: Check if API exists
console.log('📋 TEST 1: Check electronAPI');
if (!window.electronAPI) {
  console.error('❌ FAIL: window.electronAPI not found');
} else if (!window.electronAPI.onStats) {
  console.error('❌ FAIL: window.electronAPI.onStats not found');
} else {
  console.log('✅ PASS: electronAPI.onStats exists');
}

// Test 2: Try to register listener
console.log('\n📋 TEST 2: Register Stats Listener');
let statsReceived = false;
let lastStats = null;

try {
  window.electronAPI.onStats((stats) => {
    statsReceived = true;
    lastStats = stats;
    console.log('✅ PASS: Stats listener triggered!');
    console.log('   Received:', stats);
    console.log(`   Total: ${stats?.total}, Unique: ${stats?.unique}`);
  });
  console.log('✅ PASS: Stats listener registered');
} catch (err) {
  console.error('❌ FAIL: Error registering listener:', err);
}

// Test 3: Display current values
console.log('\n📋 TEST 3: Current Displayed Values');
const cumulativeDisplay = document.querySelector('[class*="Cumulative"]');
if (cumulativeDisplay) {
  const totalText = cumulativeDisplay.querySelector('[class*="Total"]');
  const uniqueText = cumulativeDisplay.querySelector('[class*="Unique"]');
  
  if (totalText) {
    console.log('Total reads shown:', totalText.textContent);
  }
  if (uniqueText) {
    console.log('Unique count shown:', uniqueText.textContent);
  }
} else {
  console.log('⚠️ Could not find cumulative display element');
}

// Test 4: Manual trigger test
console.log('\n📋 TEST 4: Manual Tag Event Test');
console.log('Now send a tag to your RFID reader...');
console.log('Waiting for stats event (30 second timeout)...\n');

// Set up timeout to check if stats arrived
const timeout = setTimeout(() => {
  console.log('\n⏱️ TIMEOUT: No stats received after 30 seconds');
  console.log('Possible issues:');
  console.log('  1. No tags being detected');
  console.log('  2. Device not connected');
  console.log('  3. Scan not started');
  console.log('\nCheck these:');
  console.log('  • Is "Connected ✓" showing in Hardware Connection?');
  console.log('  • Did you click "Start Read"?');
  console.log('  • Are you seeing [SerialReader] logs in console?');
  console.log('  • Are tags appearing in Data Stream?');
}, 30000);

// Test function to manually check stats
window.checkStatsDebug = function() {
  console.clear();
  console.log('=== STATS DEBUG CHECK ===\n');
  
  if (statsReceived) {
    clearTimeout(timeout);
    console.log('✅ Stats listener is working!');
    console.log('Last stats received:', lastStats);
  } else {
    console.log('❌ No stats received yet');
  }
  
  console.log('\nManual test complete.');
  console.log('Call window.checkStatsDebug() again to check status.');
};

console.log('📌 Helper: Run window.checkStatsDebug() to check if stats arrived\n');
