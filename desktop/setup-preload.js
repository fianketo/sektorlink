const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
  saveServerConfig: serverUrl => ipcRenderer.send('save-server-config', serverUrl)
});
