const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mindforge', {
  // Window controls for frameless window
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Platform info
  platform: process.platform,

  // IPC helpers
  send: (channel, data) => {
    const validChannels = ['window-minimize', 'window-maximize', 'window-close'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, callback) => {
    const validChannels = ['score-update', 'intervention'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
});
