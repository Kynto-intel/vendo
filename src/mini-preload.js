// Brücke für das Mini-Fenster (Insel oben mittig): Zustand empfangen, Sprechen starten, zurück zum großen Fenster,
// für eine Meldung kurz höher werden, auf Fenni gezogene Dateien weitergeben.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('mini', {
  beiZustand: (rueckruf) => ipcRenderer.on('mini:zustand', (_e, daten) => rueckruf(daten)),
  beiSichtbar: (rueckruf) => ipcRenderer.on('mini:sichtbar', (_e, an) => rueckruf(an)), // nach oben weg / wieder da
  beiBlick: (rueckruf) => ipcRenderer.on('mini:blick', (_e, daten) => rueckruf(daten)), // Maus relativ zur Leiste (Fennis Augen)
  sprechen: () => ipcRenderer.send('mini:sprechen'),
  gross: () => ipcRenderer.send('mini:gross'),
  hoehe: (offen) => ipcRenderer.send('mini:hoehe', Boolean(offen)), // Meldung auf-/zuklappen
  // Dateien auf Fenni gezogen: Pfad je Datei, dann ans große Fenster (kommen als Anhang an Luzzy)
  pfadVon: (datei) => webUtils.getPathForFile(datei),
  dateienGeben: (pfade) => ipcRenderer.send('mini:dateien', pfade)
})
