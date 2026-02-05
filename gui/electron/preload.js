const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectReader: (config) => ipcRenderer.invoke('reader:connect', config),
  disconnectReader: () => ipcRenderer.invoke('reader:disconnect'),
  startScan: () => ipcRenderer.send('reader:start-scan'),
  stopScan: () => ipcRenderer.send('reader:stop-scan'),
  onTagRead: (callback) => ipcRenderer.on('rfid:tag-read', (_event, value) => callback(value)),
  removeTagListener: () => ipcRenderer.removeAllListeners('rfid:tag-read'),
  onOpenSettings: (callback) => ipcRenderer.on('menu:open-settings', (_event, value) => callback(value)),
  saveSettings: (settings) => ipcRenderer.invoke('reader:configure', settings),

  //1. Listen for "File > System Logs" menu click
  onExportLogsTrigger: (callback) => ipcRenderer.on('menu:export-logs', (_event, value) => callback(value)),
  //2. Invoke IPC to save logs to file
  saveLogs: (logContent) => ipcRenderer.invoke('logs:save-to-file', logContent),
});