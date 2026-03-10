#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Change to GUI directory and run tests
const guiPath = path.join(__dirname, 'gui');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const test = spawn(npm, ['run', 'test:sandbag'], {
  cwd: guiPath,
  stdio: 'inherit',
  shell: true,
});

test.on('close', (code) => {
  console.log(`GUI Performance test exited with code ${code}`);
  process.exit(code);
});
