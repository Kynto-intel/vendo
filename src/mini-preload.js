// Brücke für das Mini-Fenster (Insel oben mittig): Zustand empfangen, Sprechen starten, zurück zum großen Fenster,
// für eine Meldung kurz höher werden.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mini', {
  beiZustand: (rueckruf) => ipcRenderer.on('mini:zustand', (_e, daten) => rueckruf(daten)),
  beiBlick: (rueckruf) => ipcRenderer.on('mini:blick', (_e, daten) => rueckruf(daten)), // Maus relativ zur Leiste (Fennis Augen)
  sprechen: () => ipcRenderer.send('mini:sprechen'),
  gross: () => ipcRenderer.send('mini:gross'),
  hoehe: (offen) => ipcRenderer.send('mini:hoehe', Boolean(offen)) // Meldung auf-/zuklappen
})
