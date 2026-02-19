const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectReader: (config) => ipcRenderer.invoke('reader:connect', config),
  connectMqtt: (brokerUrl, topic, options) => ipcRenderer.invoke('reader:connect-mqtt', { brokerUrl, topic, options }),
  publishMqtt: (tag, topic) => ipcRenderer.invoke('mqtt:publish', { tag, topic }),
  disconnectReader: () => ipcRenderer.invoke('reader:disconnect'),
  startScan: () => ipcRenderer.send('reader:start-scan'),
  stopScan: () => ipcRenderer.send('reader:stop-scan'),
  onTagRead: (callback) => ipcRenderer.on('rfid:tag-read', (_event, value) => callback(value)),
  removeTagListener: () => ipcRenderer.removeAllListeners('rfid:tag-read'),

  onSystemMessage: (callback) => {
    const subscription = (_event, message, level) => callback(message, level);
    ipcRenderer.on('system:message', subscription);
    return () => ipcRenderer.removeListener('system:message', subscription);
  },
  removeSystemMessageListener: () => ipcRenderer.removeAllListeners('system:message'),

  onOpenSettings: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:open-settings', subscription);
    return () => ipcRenderer.removeListener('menu:open-settings', subscription);
  },
  saveSettings: (settings) => ipcRenderer.invoke('reader:configure', settings),

  onExportLogsTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-logs', subscription);
    return () => ipcRenderer.removeListener('menu:export-logs', subscription);
  },
  saveLogs: (logContent) => ipcRenderer.invoke('logs:save-to-file', logContent),

  onExportDataTrigger: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('menu:export-data', subscription);
    return () => ipcRenderer.removeListener('menu:export-data', subscription);
  },

  saveDataCSV: (data, days) => ipcRenderer.invoke('data:save-csv', { content: data, days }),
});
