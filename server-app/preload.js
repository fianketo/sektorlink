const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverAPI', {
  getStatus: () => ipcRenderer.invoke('get-status')
});
