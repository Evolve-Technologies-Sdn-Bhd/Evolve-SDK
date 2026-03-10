#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// SDK MQTT Performance Test
const sdkPath = path.join(__dirname, 'sdk');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const test = spawn(npm, ['run', 'test:mqtt-perf'], {
  cwd: sdkPath,
  stdio: 'inherit',
  shell: true,
});

test.on('close', (code) => {
  console.log(`\n[PERF] SDK MQTT Performance test exited with code ${code}`);
  process.exit(code);
});
