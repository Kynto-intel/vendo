// Brücke für das Testlauf-Fenster der Werkstatt: nur die drei Dinge, die der Test braucht.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('werkstattTest', {
  info: () => ipcRenderer.invoke('werkstatt-test:info'),
  aufrufen: (name, argumente) => ipcRenderer.invoke('werkstatt-test:aufrufen', name, argumente),
  bericht: (bericht) => ipcRenderer.send('werkstatt-test:bericht', bericht),
  beiKind: (fn) => ipcRenderer.on('werkstatt-test:kind', (_e, nachricht) => fn(nachricht))
})
