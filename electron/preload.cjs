const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fuelApi', {
  getAppVersion: () => ipcRenderer.invoke('fuel:getAppVersion'),
  getRuntimeInfo: () => ipcRenderer.invoke('fuel:getRuntimeInfo'),
  onUpdateEvent: (callback) => {
    const channel = 'fuel:update-event';
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  getDataRoot: () => ipcRenderer.invoke('fuel:getDataRoot'),
  loadVehicles: () => ipcRenderer.invoke('fuel:loadVehicles'),
  saveVehicles: (vehicles) => ipcRenderer.invoke('fuel:saveVehicles', vehicles),
  loadDaily: (dateKey) => ipcRenderer.invoke('fuel:loadDaily', dateKey),
  saveDaily: (dateKey, payload) => ipcRenderer.invoke('fuel:saveDaily', dateKey, payload),
  loadMonth: (year, month) => ipcRenderer.invoke('fuel:loadMonth', year, month),
  loadDailyRange: (startKey, endKey) => ipcRenderer.invoke('fuel:loadDailyRange', startKey, endKey),
  devEnsureBackup: () => ipcRenderer.invoke('fuel:devEnsureBackup'),
  devBackupStatus: () => ipcRenderer.invoke('fuel:devBackupStatus'),
  devRestoreBackup: () => ipcRenderer.invoke('fuel:devRestoreBackup'),
});
