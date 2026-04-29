const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNetworkEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('network-event', handler);
    return () => ipcRenderer.removeListener('network-event', handler);
  },
  onDataLayerEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('datalayer-event', handler);
    return () => ipcRenderer.removeListener('datalayer-event', handler);
  },
});
