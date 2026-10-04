const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipc.invoke('load'), save: (d) => ipc.invoke('save', d),
  pickExes: () => ipc.invoke('pick-exes'), pickImage: () => ipc.invoke('pick-image'),
  fileIcon: (i) => ipc.invoke('file-icon', i), launch: (i) => ipc.invoke('launch', i),
  exists: (i) => ipc.invoke('exists', i),
  startupGroup: () => ipc.invoke('startup-group'), closeWindow: () => ipc.invoke('close-window'),
  makeShortcut: (g) => ipc.invoke('make-shortcut', g),
  onSelectGroup: (cb) => ipc.on('select-group', (_, id) => cb(id))
});
