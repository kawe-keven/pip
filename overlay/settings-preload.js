const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  platform: process.platform,
  load: () => ipcRenderer.invoke('settings:get'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  testAlfredConnection: (url) => ipcRenderer.invoke('alfred:test-connection', url),
  getUsage: () => ipcRenderer.invoke('usage:get'),
});
