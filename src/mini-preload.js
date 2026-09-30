// Brücke für das Mini-Fenster (Leiste oben mittig): nur Zustand empfangen, Sprechen starten, zurück zum großen Fenster.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mini', {
  beiZustand: (rueckruf) => ipcRenderer.on('mini:zustand', (_e, daten) => rueckruf(daten)),
  beiBlick: (rueckruf) => ipcRenderer.on('mini:blick', (_e, daten) => rueckruf(daten)), // Maus relativ zur Leiste (Fennis Augen)
  sprechen: () => ipcRenderer.send('mini:sprechen'),
  gross: () => ipcRenderer.send('mini:gross')
})
