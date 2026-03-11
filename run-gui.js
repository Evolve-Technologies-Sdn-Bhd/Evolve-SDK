// EvolveSDK/run-gui.js
const { spawn } = require('child_process');

console.log('[PM2 Wrapper] Launching Electron GUI...');

// This safely spawns npm run dev and connects it to your Windows Desktop session
const guiProcess = spawn('npm.cmd',['run', 'dev'], {
  cwd: './gui',       // Target the gui folder
  stdio: 'inherit',   // Crucial: Passes all Vite/Electron logs directly to PM2
  shell: true         // CRITICAL FOR WINDOWS: Allows Electron to open the UI window
});

guiProcess.on('error', (err) => {
  console.error('[PM2 Wrapper] Failed to start GUI:', err);
});

guiProcess.on('close', (code) => {
  console.log(`[PM2 Wrapper] GUI process exited with code ${code}`);
  process.exit(code); // Tell PM2 the app stopped
});