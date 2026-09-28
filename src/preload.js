// Sichere Brücke zwischen Oberfläche und Hauptprozess. Die Oberfläche bekommt nur diese Funktionen.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const abonnieren = (kanal) => (rueckruf) => {
  const hoerer = (_e, daten) => rueckruf(daten)
  ipcRenderer.on(kanal, hoerer)
  return () => ipcRenderer.removeListener(kanal, hoerer)
}

contextBridge.exposeInMainWorld('jarves', {
  // Pfad einer ins Fenster gezogenen Datei (Anhang für Luzzy)
  pfadVon: (datei) => webUtils.getPathForFile(datei),
  anhangWaehlen: () => ipcRenderer.invoke('datei:waehlen'),
  notfall: {
    fragen: (nachrichten, modell) => ipcRenderer.invoke('notfall:fragen', nachrichten, modell),
    modelle: () => ipcRenderer.invoke('notfall:modelle')
  },
  hermes: {
    status: () => ipcRenderer.invoke('hermes:status'),
    info: () => ipcRenderer.invoke('hermes:info'),
    senden: (kanal, text) => ipcRenderer.invoke('hermes:senden', kanal, text),
    abbrechen: (kanal) => ipcRenderer.invoke('hermes:abbrechen', kanal),
    crewOeffnen: () => ipcRenderer.invoke('hermes:crewOeffnen'),
    botOeffnen: (kanal) => ipcRenderer.invoke('hermes:botOeffnen', kanal),
    kanalNeuLaden: (kanal) => ipcRenderer.invoke('hermes:kanalNeuLaden', kanal),
    sitzungenMitTitel: (titel, profil) => ipcRenderer.invoke('hermes:sitzungenMitTitel', titel, profil),
    botBild: (profil) => ipcRenderer.invoke('crew:bild', profil),
    botAnlegen: (daten) => ipcRenderer.invoke('crew:botAnlegen', daten),
    profilId: (name, rolle) => ipcRenderer.invoke('crew:profilId', name, rolle),
    bildWaehlen: () => ipcRenderer.invoke('crew:bildWaehlen'),
    lesen: (pfad) => ipcRenderer.invoke('hermes:lesen', pfad),
    aktion: (art, daten) => ipcRenderer.invoke('hermes:aktion', art, daten),
    beiStatus: abonnieren('hermes:status'),
    beiEreignis: abonnieren('hermes:ereignis'),
    beiFreigabe: abonnieren('hermes:freigabe'),
    anhang: (pfad) => ipcRenderer.invoke('hermes:anhang', pfad),
    bild: (base64, name) => ipcRenderer.invoke('hermes:bild', base64, name),
    freigabe: (id, wahl) => ipcRenderer.invoke('hermes:freigabe', id, wahl),
    beiVerlauf: abonnieren('hermes:verlauf'),
    verlaufHolen: (kanal) => ipcRenderer.invoke('hermes:verlaufHolen', kanal)
  },
  pc: {
    aktion: (aktion) => ipcRenderer.invoke('pc:aktion', aktion),
    programm: (name) => ipcRenderer.invoke('pc:programm', name)
  },
  gespraeche: {
    liste: () => ipcRenderer.invoke('gespraeche:liste'),
    wechseln: (name) => ipcRenderer.invoke('gespraeche:wechseln', name),
    entfernen: (name) => ipcRenderer.invoke('gespraeche:entfernen', name),
    loeschen: (name) => ipcRenderer.invoke('gespraeche:loeschen', name)
  },
  botChats: {
    liste: (profil) => ipcRenderer.invoke('botchats:liste', profil),
    wechseln: (profil, name) => ipcRenderer.invoke('botchats:wechseln', profil, name),
    loeschen: (profil, name) => ipcRenderer.invoke('botchats:loeschen', profil, name)
  },
  plugins: {
    liste: () => ipcRenderer.invoke('plugins:liste'),
    datenLaden: (id) => ipcRenderer.invoke('plugins:datenLaden', id),
    datenSpeichern: (id, daten) => ipcRenderer.invoke('plugins:datenSpeichern', id, daten),
    beobachten: (id) => ipcRenderer.invoke('plugins:beobachten', id),
    startOk: () => ipcRenderer.invoke('plugins:startOk'),
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
  musik: {
    status: () => ipcRenderer.invoke('musik:status'),
    beiAenderung: (fn) => ipcRenderer.on('musik:status', (_e, spielt) => fn(spielt))
  },
  shopify: {
    stellen: () => ipcRenderer.invoke('shopify:stellen'),
    tokenEintragen: (token) => ipcRenderer.invoke('shopify:tokenEintragen', token)
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
    beiUmschalten: abonnieren('mikrofon:umschalten'),
    beiFreihaendig: abonnieren('mikrofon:freihaendig')
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
    sprechen: (text, optionen) => ipcRenderer.invoke('stimme:sprechen', text, optionen),
    pocketZustand: () => ipcRenderer.invoke('stimme:pocketZustand'),
    pocketStarten: (optionen) => ipcRenderer.invoke('stimme:pocketStarten', optionen),
    pocketDateiWaehlen: () => ipcRenderer.invoke('stimme:pocketDateiWaehlen')
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
    miniZustand: (daten) => ipcRenderer.send('mini:zustand', daten),
    bildschirmAufnehmen: () => ipcRenderer.invoke('bildschirm:aufnehmen')
  },
  terminal: {
    starten: (cols, rows) => ipcRenderer.invoke('terminal:starten', cols, rows),
    schreiben: (text) => ipcRenderer.send('terminal:schreiben', text),
    groesse: (cols, rows) => ipcRenderer.send('terminal:groesse', cols, rows),
    befehl: (text) => ipcRenderer.invoke('terminal:befehl', text),
    neu: () => ipcRenderer.invoke('terminal:neu'),
    befehle: () => ipcRenderer.invoke('terminal:befehle'),
    befehleSpeichern: (liste) => ipcRenderer.invoke('terminal:befehleSpeichern', liste),
    beiDaten: abonnieren('terminal:daten'),
    beiEnde: abonnieren('terminal:ende')
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
