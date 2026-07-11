const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronOverlay', {
  setCollapsed: collapsed => ipcRenderer.send('overlay-set-collapsed', collapsed),
  hide: () => ipcRenderer.send('overlay-hide'),
  flashUrgent: () => ipcRenderer.send('overlay-flash-urgent'),
  dragBubble: (dx, dy) => ipcRenderer.send('overlay-drag-bubble', dx, dy),
  onStopUrgentAlert: callback => ipcRenderer.on('stop-urgent-alert', callback)
});
