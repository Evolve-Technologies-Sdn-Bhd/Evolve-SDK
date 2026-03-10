#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Change to SDK directory and run tests
const sdkPath = path.join(__dirname, 'sdk');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const test = spawn(npm, ['run', 'test:sandbag'], {
  cwd: sdkPath,
  stdio: 'inherit',
  shell: true,
});

test.on('close', (code) => {
  console.log(`SDK Performance test exited with code ${code}`);
  process.exit(code);
});
