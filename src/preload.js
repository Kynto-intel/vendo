// Sichere Brücke zwischen Oberfläche und Hauptprozess. Die Oberfläche bekommt nur diese Funktionen.

const { contextBridge, ipcRenderer } = require('electron')

const abonnieren = (kanal) => (rueckruf) => {
  const hoerer = (_e, daten) => rueckruf(daten)
  ipcRenderer.on(kanal, hoerer)
  return () => ipcRenderer.removeListener(kanal, hoerer)
}

contextBridge.exposeInMainWorld('jarves', {
  hermes: {
    status: () => ipcRenderer.invoke('hermes:status'),
    info: () => ipcRenderer.invoke('hermes:info'),
    senden: (kanal, text) => ipcRenderer.invoke('hermes:senden', kanal, text),
    abbrechen: (kanal) => ipcRenderer.invoke('hermes:abbrechen', kanal),
    crewOeffnen: () => ipcRenderer.invoke('hermes:crewOeffnen'),
    lesen: (pfad) => ipcRenderer.invoke('hermes:lesen', pfad),
    aktion: (art, daten) => ipcRenderer.invoke('hermes:aktion', art, daten),
    beiStatus: abonnieren('hermes:status'),
    beiEreignis: abonnieren('hermes:ereignis'),
    beiFreigabe: abonnieren('hermes:freigabe'),
    freigabe: (id, wahl) => ipcRenderer.invoke('hermes:freigabe', id, wahl),
    beiVerlauf: abonnieren('hermes:verlauf'),
    verlaufHolen: (kanal) => ipcRenderer.invoke('hermes:verlaufHolen', kanal)
  },
  gespraeche: {
    liste: () => ipcRenderer.invoke('gespraeche:liste'),
    wechseln: (name) => ipcRenderer.invoke('gespraeche:wechseln', name),
    entfernen: (name) => ipcRenderer.invoke('gespraeche:entfernen', name)
  },
  plugins: {
    liste: () => ipcRenderer.invoke('plugins:liste'),
    datenLaden: (id) => ipcRenderer.invoke('plugins:datenLaden', id),
    datenSpeichern: (id, daten) => ipcRenderer.invoke('plugins:datenSpeichern', id, daten),
    beobachten: (id) => ipcRenderer.invoke('plugins:beobachten', id),
    beiAenderung: (fn) => ipcRenderer.on('plugins:geaendert', (_e, id) => fn(id)),
    aufrufen: (id, name, ...argumente) => ipcRenderer.invoke('plugins:aufrufen', id, name, argumente)
  },
  waechter: {
    beiMeldung: abonnieren('waechter:meldung'),
    beiProblem: abonnieren('waechter:problem'),
    beiVerbindung: abonnieren('waechter:verbindung'),
    verbindungen: () => ipcRenderer.invoke('waechter:verbindungen'),
    pruefen: () => ipcRenderer.invoke('waechter:pruefen')
  },
  wissen: {
    vault: () => ipcRenderer.invoke('wissen:vault'),
    suchen: (anfrage) => ipcRenderer.invoke('wissen:suchen', anfrage),
    lesen: (rel) => ipcRenderer.invoke('wissen:lesen', rel),
    notizFinden: (name) => ipcRenderer.invoke('wissen:notizFinden', name),
    morgenberichte: () => ipcRenderer.invoke('wissen:morgenberichte'),
    entscheidungen: () => ipcRenderer.invoke('wissen:entscheidungen'),
    bibliothek: () => ipcRenderer.invoke('wissen:bibliothek'),
    dateien: () => ipcRenderer.invoke('wissen:dateien')
  },
  datei: {
    oeffnen: (rel) => ipcRenderer.invoke('datei:oeffnen', rel),
    zeigen: (rel) => ipcRenderer.invoke('datei:zeigen', rel),
    suchen: (anfrage) => ipcRenderer.invoke('datei:suchen', anfrage),
    inhalt: (id) => ipcRenderer.invoke('datei:inhalt', id),
    pfad: (pfad) => ipcRenderer.invoke('datei:pfad', pfad),
    stand: () => ipcRenderer.invoke('datei:stand'),
    speichern: (id, text, geaendert) => ipcRenderer.invoke('datei:speichern', id, text, geaendert),
    rueckgaengig: (id) => ipcRenderer.invoke('datei:rueckgaengig', id),
    mitProgramm: (id) => ipcRenderer.invoke('datei:mitProgramm', id),
    imOrdner: (id) => ipcRenderer.invoke('datei:imOrdner', id)
  },
  sprache: {
    transkribieren: (bytes, mime) => ipcRenderer.invoke('sprache:transkribieren', bytes, mime),
    beiUmschalten: abonnieren('mikrofon:umschalten')
  },
  wake: {
    starten: () => ipcRenderer.invoke('wake:starten'),
    fortsetzen: () => ipcRenderer.invoke('wake:fortsetzen'),
    pausieren: () => ipcRenderer.invoke('wake:pausieren'),
    stoppen: () => ipcRenderer.invoke('wake:stoppen'),
    fuettern: (bytes) => ipcRenderer.send('wake:fuettern', bytes)
  },
  stimme: {
    liste: () => ipcRenderer.invoke('stimme:liste'),
    sprechen: (text, optionen) => ipcRenderer.invoke('stimme:sprechen', text, optionen)
  },
  einstellungen: {
    laden: () => ipcRenderer.invoke('einstellungen:laden'),
    speichern: (neu) => ipcRenderer.invoke('einstellungen:speichern', neu)
  },
  vault: {
    antwortMerken: (antwort, frage) => ipcRenderer.invoke('vault:antwortMerken', antwort, frage)
  },
  zwischenablage: {
    beiNeu: abonnieren('zwischenablage:neu'),
    lesen: () => ipcRenderer.invoke('zwischenablage:lesen'),
    schreiben: (text) => ipcRenderer.invoke('zwischenablage:schreiben', text)
  },
  fenster: {
    aufmerksamkeit: () => ipcRenderer.invoke('fenster:aufmerksamkeit'),
    titelfarbe: (farbe) => ipcRenderer.invoke('fenster:titelfarbe', farbe),
    andocken: (seite) => ipcRenderer.invoke('fenster:andocken', seite),
    mini: (an) => ipcRenderer.invoke('mini:setzen', an),
    beiMini: abonnieren('mini:geaendert'),
    miniZustand: (daten) => ipcRenderer.send('mini:zustand', daten)
  },
  start: {
    stand: () => ipcRenderer.invoke('start:stand'),
    verknuepfung: () => ipcRenderer.invoke('start:verknuepfung'),
    autostart: (an) => ipcRenderer.invoke('start:autostart', an)
  },
  sicherung: {
    liste: () => ipcRenderer.invoke('sicherung:liste'),
    anlegen: () => ipcRenderer.invoke('sicherung:anlegen'),
    ordner: () => ipcRenderer.invoke('sicherung:ordner')
  },
  system: {
    werte: () => ipcRenderer.invoke('system:werte'),
    details: () => ipcRenderer.invoke('system:details')
  }
})
