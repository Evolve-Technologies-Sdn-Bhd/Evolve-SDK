const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  
  //...reader connection APIs....
  connectReader: (config) => ipcRenderer.invoke('reader:connect', config),
  disconnectReader: () => ipcRenderer.invoke('reader:disconnect'),
  startScan: () => ipcRenderer.send('reader:start-scan'),
  stopScan: () => ipcRenderer.send('reader:stop-scan'),
  //..tag read listener...
  onTagRead: (callback) => ipcRenderer.on('rfid:tag-read', (_event, value) => callback(value)),
  removeTagListener: () => ipcRenderer.removeAllListeners('rfid:tag-read'),
  // 1. SETTINGS LISTENER (With Cleanup)
  onOpenSettings: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:open-settings', subscription);
    return () => ipcRenderer.removeListener('menu:open-settings', subscription);
  },
  saveSettings: (settings) => ipcRenderer.invoke('reader:configure', settings),

  // 2. LOGS EXPORT LISTENER (With Cleanup)
  onExportLogsTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-logs', subscription);
    return () => ipcRenderer.removeListener('menu:export-logs', subscription);
  },
  //2. Invoke IPC to save logs to file
  saveLogs: (logContent) => ipcRenderer.invoke('logs:save-to-file', logContent),

  // 3. DATA EXPORT LISTENER (With Cleanup)
  onExportDataTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-data', subscription);
    return () => ipcRenderer.removeListener('menu:export-data', subscription);
  },

  saveDataCSV: (data, days) => ipcRenderer.invoke('data:save-csv', {content: data, days})
});