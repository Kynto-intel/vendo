// Jarves-OS Hauptprozess: Fenster, Hermes-Verbindung, Stimme, System-Werte.

const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, screen, clipboard, protocol, dialog } = require('electron')

// Testmodus ohne echtes Mikrofon: JARVES_TEST_MIKROFON=<datei.wav> spielt die Datei als Mikrofon ein
if (process.env.JARVES_TEST_MIKROFON) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.JARVES_TEST_MIKROFON}%noloop`)
}
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Gefundene Dateien in Jarves-OS anzeigen (Bilder, PDF, Video …): nur über jarves-datei://<kennung>, siehe dateisuche.js
protocol.registerSchemesAsPrivileged([{ scheme: 'jarves-datei', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const os = require('node:os')
const path = require('node:path')
const { Hermes, PROFIL } = require('./hermes')
const pocket = require('./pocket')
const einstellungen = require('./einstellungen')
const dateisuche = require('./dateisuche')
const pc = require('./pc')
const notfall = require('./notfall')

const hermes = new Hermes()
// Die Zentrale-Unterhaltung über ihre feste ID wiederfinden (Titel kann Hermes ändern)
// Mehrere Gespräche (#27): Liste der Themen in den Einstellungen, jedes mit seiner Hermes-Unterhaltung.
// „Allgemein“ ist die bisherige Zentrale (Titel „Jarves-OS“), neue Themen heißen in Hermes „Jarves-OS · <Name>“.
function gespraeche() {
  const e = einstellungen.laden()
  let liste = (Array.isArray(e.gespraeche) ? e.gespraeche : []).filter((g) => g && typeof g.name === 'string' && g.name.trim())
  if (!liste.length) liste = [{ name: 'Allgemein', titel: 'Jarves-OS', session: e.zentraleSession || null }]
  const aktiv = liste.find((g) => g.name === e.aktivesGespraech) || liste[0]
  return { liste, aktiv }
}
hermes.gemerkteSession = () => gespraeche().aktiv.session || null
hermes.gemerkterTitel = () => gespraeche().aktiv.titel || 'Jarves-OS'
hermes.sessionMerken = (id) => {
  const { liste, aktiv } = gespraeche()
  if (aktiv.session === id && einstellungen.laden().gespraeche) return
  aktiv.session = id
  einstellungen.speichern({ gespraeche: liste, aktivesGespraech: aktiv.name, zentraleSession: id })
}
const gespraechName = (name) => String(name || '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
const gespraecheFuerOberflaeche = () => {
  const { liste, aktiv } = gespraeche()
  return { liste: liste.map((g) => ({ name: g.name })), aktiv: aktiv.name }
}
let fenster = null

function senden(kanal, daten) {
  if (fenster && !fenster.isDestroyed()) fenster.webContents.send(kanal, daten)
}

// Fenster merken: Größe und Position vom letzten Mal, aber nur, wenn es noch auf einen Bildschirm passt
// (z. B. zweiter Monitor abgesteckt). Sonst Standardgröße in der Mitte.
function gemerktesFenster() {
  const f = einstellungen.laden().fenster
  if (!f || !Number.isFinite(f.width) || !Number.isFinite(f.height)) return null
  const sichtbar = screen.getAllDisplays().some(({ workArea: b }) =>
    f.x < b.x + b.width - 100 && f.x + f.width > b.x + 100 && f.y >= b.y - 20 && f.y < b.y + b.height - 100
  )
  return sichtbar ? f : null
}

function fensterMerken() {
  if (!fenster || fenster.isDestroyed()) return
  const { x, y, width, height } = fenster.getNormalBounds()
  einstellungen.speichern({ fenster: { x, y, width, height, maximiert: fenster.isMaximized() } })
}

function fensterErstellen() {
  const gemerkt = gemerktesFenster()
  fenster = new BrowserWindow({
    width: gemerkt?.width || 1440,
    height: gemerkt?.height || 900,
    ...(gemerkt ? { x: gemerkt.x, y: gemerkt.y } : {}),
    minWidth: 720, // klein genug fürs Andocken an die Bildschirmhälfte (Full HD: 960 px)
    minHeight: 560,
    backgroundColor: '#0E0E10',
    title: 'Jarves-OS',
    autoHideMenuBar: true,
    show: false,
    // Keine Titelleiste; Windows zeichnet nur die drei Fensterknöpfe, in der Farbe der rechten Spalte
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0E0E10', symbolColor: '#C9A14A', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // Mikrofon und Stille-Erkennung laufen auch im Hintergrund
      plugins: true // PDF-Anzeige in der Dateiansicht
    }
  })
  fenster.once('ready-to-show', () => {
    if (gemerkt?.maximiert) fenster.maximize()
    fenster.show()
  })
  fenster.on('close', fensterMerken)
  // Angedockt (Windows+Pfeil oder an den Rand gezogen), aber ein paar Pixel zu breit? Auf die exakte Hälfte setzen.
  let andockUhr = null
  const andockenPruefen = () => {
    clearTimeout(andockUhr)
    andockUhr = setTimeout(haelfteKorrigieren, 350)
  }
  fenster.on('resize', andockenPruefen)
  fenster.on('move', andockenPruefen)
  fenster.on('focus', () => fenster.flashFrame(false))
  // Mini-Modus: Klick aufs Taskleisten-Symbol holt das große Fenster zurück, die Leiste verschwindet
  fenster.on('restore', () => miniSetzen(false))
  fenster.on('show', () => miniSetzen(false))
  fenster.on('closed', () => miniSetzen(false, { schliessen: true }))
  fenster.webContents.on('before-input-event', (ereignis, eingabe) => {
    if (eingabe.type === 'keyDown' && eingabe.key === 'F12') {
      fenster.webContents.openDevTools({ mode: 'detach' })
    }
  })
  const query = {}
  if (process.env.JARVES_TEST_NACHRICHT) query.test = process.env.JARVES_TEST_NACHRICHT
  if (process.env.JARVES_TEST_PANEL) query.panel = process.env.JARVES_TEST_PANEL
  if (process.env.JARVES_TEST_STUMM) query.stumm = '1'
  if (process.env.JARVES_TEST_ANSICHT) query.ansicht = process.env.JARVES_TEST_ANSICHT
  if (process.env.JARVES_TEST_TAGESZEIT) query.tageszeit = process.env.JARVES_TEST_TAGESZEIT
  if (process.env.JARVES_TEST_INTRO) query.intro = '1'
  if (process.env.JARVES_TEST_CREW) query.crewtest = process.env.JARVES_TEST_CREW
  if (process.env.JARVES_TEST_MELDUNG) query.meldungtest = '1'
  fenster.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query })
  // Links aus Antworten im Standardbrowser öffnen, nie im Jarves-OS-Fenster
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  fenster.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) shell.openExternal(url)
    }
  })
}

// Wächter: neue Bestellungen, Mails, fehlgeschlagene Jobs (Phase 5)
const { Waechter } = require('./waechter')
const waechter = new Waechter(hermes)
waechter.on('meldung', (m) => senden('waechter:meldung', m))
waechter.on('problem', (p) => senden('waechter:problem', p))
waechter.on('verbindung', (v) => senden('waechter:verbindung', v))
ipcMain.handle('waechter:verbindungen', () => waechter.verbindungen)
ipcMain.handle('waechter:pruefen', () => waechter.pruefen())
// Shopify-Token erneuern: prüfen, überall in Hermes eintragen, dann den Wächter neu prüfen lassen. Der Token geht nie zurück.
const shopifyToken = require('./shopifytoken')
ipcMain.handle('shopify:stellen', () => shopifyToken.stellen().length)
ipcMain.handle('shopify:tokenEintragen', async (_e, token) => {
  const ergebnis = await shopifyToken.eintragen(String(token || '').slice(0, 200))
  // Ohne Neustart übernehmen (Hermes-eigene Befehle reload.env / reload.mcp); klappt das nicht: Hinweis auf Neustart
  ergebnis.neuGeladen = await hermes.einstellungenNeuLaden().catch(() => false)
  waechter.pruefen().catch(() => {})
  return ergebnis
})

// ── Hermes → Oberfläche ──
// Hermes-Gateway (Telegram & Co.) einmal pro Start mit hochfahren, sobald Hermes bereit ist (Einstellung start.gateway)
let gatewayGeprueft = false
hermes.on('status', (s) => {
  senden('hermes:status', s)
  if (s.zustand === 'bereit') waechter.starten()
  if (s.zustand === 'bereit' && !gatewayGeprueft && !process.env.JARVES_TEST_STUMM && einstellungen.laden().start?.gateway !== false) {
    gatewayGeprueft = true
    // Nur ASCII ausgeben: die PowerShell-Konsole zeigt Umlaute und Hermes' Häkchen sonst verstümmelt an
    require('./gateway').starten().then((g) => console.log(`Hermes-Gateway: ${g.ok ? 'laeuft' : 'Start fehlgeschlagen'} (${g.text.replace(/[^\x20-\x7e]/g, '').trim()})`))
  }
})
hermes.on('ereignis', (e) => senden('hermes:ereignis', e))
hermes.on('freigabe', (f) => senden('hermes:freigabe', f))
// Läuft Musik/Video auf dem PC? (Windows-Mediensteuerung, nur lesen) → Oberfläche, damit Musik nicht als Sprache zählt
let musikSpielt = false
const musikStopp = require('./musik').musikBeobachten((spielt) => {
  musikSpielt = spielt
  senden('musik:status', spielt)
})
app.on('will-quit', () => musikStopp())
ipcMain.handle('musik:status', () => musikSpielt)
// Testmodus: JARVES_TEST_FREIGABE=1 spielt nach 9 s eine Freigabe-Anfrage vor (Hermes führt dabei nichts aus)
if (process.env.JARVES_TEST_FREIGABE) setTimeout(() => hermes.emit('freigabe', { id: 'test-freigabe', kanal: 'zentrale', befehl: 'Remove-Item C:/Temp/alt -Recurse', beschreibung: 'Den Ordner C:/Temp/alt mit allen Dateien löschen', werkzeug: 'terminal', auswahl: ['once', 'session', 'always', 'deny'] }), 9000)
const letzterVerlauf = {} // pro Kanal (zentrale, crew)
hermes.on('verlauf', (v) => {
  letzterVerlauf[v.kanal] = v
  senden('hermes:verlauf', v)
})
ipcMain.handle('hermes:verlaufHolen', (_e, kanal = 'zentrale') => letzterVerlauf[kanal] || null)

// ── Oberfläche → Hauptprozess ──
const KANAELE = new Set(['zentrale', 'crew'])
const kanalPruefen = (k) => (KANAELE.has(k) || /^(normal|botchat):[a-z0-9][a-z0-9_-]{0,63}$/.test(String(k)) ? k : 'zentrale')
ipcMain.handle('hermes:status', () => ({ zustand: hermes.zustand, text: hermes.statusText, profil: PROFIL }))
ipcMain.handle('hermes:senden', (_e, kanal, text) => hermes.senden(kanalPruefen(kanal), String(text || '').slice(0, 20000)))
ipcMain.handle('hermes:abbrechen', (_e, kanal) => hermes.abbrechen(kanalPruefen(kanal)))
ipcMain.handle('hermes:crewOeffnen', () => hermes.crewOeffnen())
ipcMain.handle('hermes:botOeffnen', (_e, kanal) => hermes.botOeffnen(String(kanal || '')))
// Terminal-Bereich (terminal.js): echte PowerShell-Konsole über node-pty, Anzeige mit xterm.js
const terminal = require('./terminal')
ipcMain.handle('terminal:starten', (_e, cols, rows) => terminal.starten(senden, cols, rows))
ipcMain.on('terminal:schreiben', (_e, text) => terminal.schreiben(String(text ?? '').slice(0, 100000)))
ipcMain.on('terminal:groesse', (_e, cols, rows) => terminal.groesseSetzen(cols, rows))
ipcMain.handle('terminal:befehl', (_e, text) => terminal.befehl(String(text || '').slice(0, 4000), senden))
ipcMain.handle('terminal:neu', () => terminal.beenden())
ipcMain.handle('terminal:befehle', () => terminal.befehleLaden())
ipcMain.handle('terminal:befehleSpeichern', (_e, liste) => terminal.befehleSpeichern(liste))
app.on('will-quit', () => terminal.beenden())
// Gespräche mit einem bestimmten Titel finden (auch versteckte wie Luzzys „Bot Chat“, die /api/sessions weglässt)
ipcMain.handle('hermes:sitzungenMitTitel', async (_e, titel, profil) => {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(profil))) throw new Error('Unbekanntes Profil.')
  const r = await hermes.rpc('session.list', { title: String(titel || '').slice(0, 120), profile: String(profil) })
  return (r?.sessions || []).map((s) => ({ id: s.resolved_id || s.id, titel: s.title, zuletzt: s.last_active || s.last_activity_at || s.started_at }))
})
ipcMain.handle('hermes:kanalNeuLaden', (_e, kanal) => hermes.kanalNeuLaden(String(kanal || '')))
// Bild eines Bots: hermes\profiles\<profil>\assets\avatar.(png|jpg|jpeg|webp) als data:-Adresse (nur lesen)
// Neuen Bot anlegen (bots.js, über hermes profile create) und ein Bild dafür wählen
const bots = require('./bots')
ipcMain.handle('crew:botAnlegen', async (_e, daten) => {
  const d = daten && typeof daten === 'object' ? daten : {}
  const r = await bots.botAnlegen({ name: d.name, rolle: d.rolle, beschreibung: d.beschreibung, aufgaben: String(d.aufgaben || '').slice(0, 20000), soulKomplett: Boolean(d.soulKomplett), vorlage: d.vorlage, bild: d.bild, andere: Array.isArray(d.andere) ? d.andere.slice(0, 30) : [] })
  hermes.rest('/api/profiles').catch(() => {}) // Hermes die neue Liste gleich einlesen lassen
  return r
})
// Luzzy schreibt die SOUL.md oder den Bild-Prompt für einen neuen Bot (einmalige Anfrage, nicht in ihrem Chat)
ipcMain.handle('crew:luzzyHilft', (_e, art, daten) => bots.luzzyHilft(art === 'bild' ? 'bild' : 'soul', daten && typeof daten === 'object' ? daten : {}, hermes))
ipcMain.handle('crew:profilId', (_e, name, rolle) => bots.profilId(name, rolle))
ipcMain.handle('crew:bildWaehlen', async () => {
  const r = await dialog.showOpenDialog(fenster, { title: 'Bild für den neuen Bot', properties: ['openFile'], filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
  return r.canceled ? null : r.filePaths[0] || null
})
ipcMain.handle('crew:bild', (_e, profil) => {
  const name = String(profil || '')
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) return null
  const fs = require('node:fs')
  const ordner = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'profiles', name, 'assets')
  for (const [endung, typ] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const datei = path.join(ordner, `avatar.${endung}`)
    const info = fs.statSync(datei, { throwIfNoEntry: false })
    if (!info?.isFile() || info.size > 8_000_000) continue
    return { bild: `data:${typ};base64,${fs.readFileSync(datei).toString('base64')}`, stand: info.mtimeMs }
  }
  return null
})
// Profil-Fenster der Crew: SOUL.md eines Bots lesen und (nur per Klick auf Speichern) bearbeiten, mit Sicherung
const botProfil = require('./botprofil')
ipcMain.handle('crew:soulLesen', (_e, profil) => botProfil.lesen(profil))
ipcMain.handle('crew:soulSpeichern', (_e, profil, text, geaendert) => botProfil.speichern(profil, text, Number(geaendert) || 0))
// Anhänge: nur echte Dateien, die Felix ausgesucht oder ins Fenster gezogen hat
// Kanal des Gesprächs, an das der Anhang geht: Zentrale, Luzzys Bot Chat oder ein Bot (normal/botchat)
const ANHANG_KANAL = /^(zentrale|crew|(normal|botchat):[a-z0-9][a-z0-9_-]{0,63})$/
const anhangKanal = (kanal) => (ANHANG_KANAL.test(String(kanal || 'zentrale')) ? String(kanal || 'zentrale') : 'zentrale')
ipcMain.handle('hermes:anhang', (_e, pfad, kanal) => {
  const p = String(pfad || '')
  if (!path.isAbsolute(p) || !require('node:fs').statSync(p, { throwIfNoEntry: false })?.isFile()) throw new Error('Datei nicht gefunden.')
  return hermes.anhangHinzufuegen(p, anhangKanal(kanal))
})
ipcMain.handle('hermes:bild', (_e, base64, name, kanal) => {
  const b = String(base64 || '')
  if (!b || b.length > 30_000_000) throw new Error('Bild fehlt oder ist zu groß.')
  return hermes.bildHinzufuegen(b, String(name || 'bild.png').slice(0, 80), anhangKanal(kanal))
})
ipcMain.handle('datei:waehlen', async () => {
  const r = await dialog.showOpenDialog(fenster, { title: 'Datei oder Bild für Luzzy', properties: ['openFile', 'multiSelections'] })
  return r.canceled ? [] : r.filePaths.slice(0, 10)
})
// Notfall-Luzzy: lokal über Ollama, wenn Hermes oder die Cloud nicht erreichbar ist
ipcMain.handle('notfall:fragen', (_e, nachrichten, modell) => notfall.fragen(Array.isArray(nachrichten) ? nachrichten.slice(-24) : [], String(modell || '')))
ipcMain.handle('notfall:modelle', () => notfall.modelle())
ipcMain.handle('hermes:freigabe', (_e, id, wahl) => hermes.freigabeBeantworten(String(id), String(wahl)))
ipcMain.handle('gespraeche:liste', () => gespraecheFuerOberflaeche())
// Wechseln oder (gibt es den Namen noch nicht) neu anlegen
ipcMain.handle('gespraeche:wechseln', async (_e, name) => {
  name = gespraechName(name)
  if (!name) throw new Error('Kein Name für das Gespräch.')
  const { liste } = gespraeche()
  let ziel = liste.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (!ziel) {
    if (liste.length >= 30) throw new Error('Schon 30 Gespräche. Lösch erst eins.')
    ziel = { name, titel: `Jarves-OS · ${name}`, session: null }
    liste.push(ziel)
  }
  einstellungen.speichern({ gespraeche: liste, aktivesGespraech: ziel.name })
  await hermes.gespraechOeffnen(ziel.session, ziel.titel)
  return gespraecheFuerOberflaeche()
})
// Endgültig löschen (in Hermes). Das offene Gespräch nicht, erst wechseln.
ipcMain.handle('gespraeche:loeschen', async (_e, name) => {
  const { liste, aktiv } = gespraeche()
  const g = liste.find((x) => x.name === name)
  if (!g) return gespraecheFuerOberflaeche()
  if (aktiv.name === name) throw new Error('Das offene Gespräch kann nicht gelöscht werden. Erst zu einem anderen wechseln.')
  await hermes.sessionLoeschen({ gespeicherteId: g.session, titel: g.titel, profil: PROFIL })
  einstellungen.speichern({ gespraeche: liste.filter((x) => x.name !== name) })
  return gespraecheFuerOberflaeche()
})

// Mehrere normale Chats pro Bot (Crew-Tab): Liste in den Einstellungen, „Allgemein“ = Hermes-Titel „Jarves-OS“
const BOT_PROFIL = /^[a-z0-9][a-z0-9_-]{0,63}$/
function botChats(profil) {
  const alle = einstellungen.laden().botChats || {}
  const eigene = alle[profil] || {}
  let liste = (Array.isArray(eigene.liste) ? eigene.liste : []).filter((g) => g && typeof g.name === 'string' && g.name.trim())
  if (!liste.length) liste = [{ name: 'Allgemein', titel: 'Jarves-OS', session: null }]
  const aktiv = liste.find((g) => g.name === eigene.aktiv) || liste[0]
  return { alle, liste, aktiv }
}
function botChatsSpeichern(profil, liste, aktivName) {
  const alle = einstellungen.laden().botChats || {}
  einstellungen.speichern({ botChats: { ...alle, [profil]: { liste, aktiv: aktivName } } })
}
const botChatsFuerOberflaeche = (profil) => {
  const { liste, aktiv } = botChats(profil)
  return { liste: liste.map((g) => ({ name: g.name })), aktiv: aktiv.name }
}
hermes.botChat = (profil) => botChats(profil).aktiv
hermes.botChatMerken = (profil, id) => {
  if (!id) return
  const { liste, aktiv } = botChats(profil)
  if (aktiv.session === id) return
  aktiv.session = id
  botChatsSpeichern(profil, liste, aktiv.name)
}
ipcMain.handle('botchats:liste', (_e, profil) => (BOT_PROFIL.test(String(profil)) ? botChatsFuerOberflaeche(String(profil)) : null))
ipcMain.handle('botchats:wechseln', async (_e, profil, name) => {
  profil = String(profil || '')
  if (!BOT_PROFIL.test(profil)) throw new Error('Unbekannter Bot.')
  name = gespraechName(name) || `Chat ${new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  const { liste } = botChats(profil)
  let ziel = liste.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (!ziel) {
    if (liste.length >= 30) throw new Error('Schon 30 Chats. Lösch erst einen.')
    ziel = { name, titel: `Jarves-OS · ${name}`, session: null }
    liste.push(ziel)
  }
  botChatsSpeichern(profil, liste, ziel.name)
  await hermes.botWechseln(`normal:${profil}`)
  return botChatsFuerOberflaeche(profil)
})
ipcMain.handle('botchats:loeschen', async (_e, profil, name) => {
  profil = String(profil || '')
  if (!BOT_PROFIL.test(profil)) throw new Error('Unbekannter Bot.')
  const { liste, aktiv } = botChats(profil)
  const g = liste.find((x) => x.name === name)
  if (!g) return botChatsFuerOberflaeche(profil)
  if (aktiv.name === name) throw new Error('Der offene Chat kann nicht gelöscht werden. Erst zu einem anderen wechseln.')
  await hermes.sessionLoeschen({ gespeicherteId: g.session, titel: g.titel, profil })
  botChatsSpeichern(profil, liste.filter((x) => x.name !== name), aktiv.name)
  return botChatsFuerOberflaeche(profil)
})

// Aus der Liste nehmen (die Unterhaltung bleibt in Hermes erhalten). Das aktive Gespräch nicht.
ipcMain.handle('gespraeche:entfernen', (_e, name) => {
  const { liste, aktiv } = gespraeche()
  if (aktiv.name === name) throw new Error('Das offene Gespräch kann nicht entfernt werden. Erst wechseln.')
  einstellungen.speichern({ gespraeche: liste.filter((g) => g.name !== name) })
  return gespraecheFuerOberflaeche()
})

// Nur lesende Abfragen an diese Hermes-Bereiche (Jobs, Crew, Kosten, Kanban, Modell-Liste, Status)
const LESEN_ERLAUBT = [/^\/api\/cron\/jobs/, /^\/api\/profiles/, /^\/api\/analytics\//, /^\/api\/plugins\/kanban\//, /^\/api\/model\/options/, /^\/api\/status$/, /^\/api\/sessions/]
ipcMain.handle('hermes:lesen', (_e, pfad) => {
  if (typeof pfad !== 'string' || !LESEN_ERLAUBT.some((m) => m.test(pfad))) throw new Error('Abfrage nicht erlaubt.')
  return hermes.rest(pfad)
})

// Gezielte Aktionen (Jobs steuern, Modell eines Agenten ändern)
const sicher = (s) => encodeURIComponent(String(s || ''))
ipcMain.handle('hermes:aktion', (_e, art, daten = {}) => {
  const profil = daten.profil ? `?profile=${sicher(daten.profil)}` : ''
  switch (art) {
    case 'job-ausfuehren':
      return hermes.rest(`/api/cron/jobs/${sicher(daten.id)}/trigger${profil}`, { method: 'POST' })
    case 'job-pausieren':
      return hermes.rest(`/api/cron/jobs/${sicher(daten.id)}/pause${profil}`, { method: 'POST' })
    case 'job-fortsetzen':
      return hermes.rest(`/api/cron/jobs/${sicher(daten.id)}/resume${profil}`, { method: 'POST' })
    case 'job-loeschen':
      return hermes.rest(`/api/cron/jobs/${sicher(daten.id)}${profil}`, { method: 'DELETE' })
    case 'modell-setzen':
      return hermes.rest(`/api/profiles/${sicher(daten.name)}/model`, {
        method: 'PUT',
        body: { provider: String(daten.provider || ''), model: String(daten.model || '') }
      })
    default:
      throw new Error('Unbekannte Aktion.')
  }
})
ipcMain.handle('hermes:info', async () => {
  const [status, profile] = await Promise.all([
    hermes.rest('/api/status').catch(() => null),
    hermes.rest('/api/profiles').catch(() => null)
  ])
  const luzzy = profile?.profiles?.find((p) => p.name === PROFIL)
  return { version: status?.version || '', modell: luzzy?.model || '', anbieter: luzzy?.provider || '' }
})

ipcMain.handle('sprache:transkribieren', (_e, bytes, mime) => hermes.transkribieren(bytes, String(mime || 'audio/webm')))
ipcMain.handle('wake:starten', () => hermes.wakeStarten())
ipcMain.handle('wake:fortsetzen', () => hermes.wakeFortsetzen())
ipcMain.handle('wake:pausieren', () => hermes.wakePausieren())
ipcMain.handle('wake:stoppen', () => hermes.wakeStoppen())
ipcMain.on('wake:fuettern', (_e, bytes) => hermes.wakeFuettern(bytes))

// Plugins (jarves-os\plugins\<id>\)
const plugins = require('./plugins')
ipcMain.handle('plugins:liste', () => plugins.alleLaden())
ipcMain.handle('plugins:datenLaden', (_e, id) => plugins.datenLaden(String(id)))
ipcMain.handle('plugins:datenSpeichern', (_e, id, daten) => plugins.datenSpeichern(String(id), daten))
ipcMain.handle('plugins:beobachten', (_e, id) => plugins.beobachten(String(id), (pid) => fenster?.webContents.send('plugins:geaendert', pid)))
ipcMain.handle('plugins:startOk', () => plugins.startOk()) // Notbremse: Start hat geklappt
// Notbremse: Wird Jarves-OS normal beendet (auch schnell nach dem Start), zählt das als geglückter Start.
// Nur Absturz oder Hänger der Oberfläche lösen sie beim nächsten Start aus.
let oberflaecheGestoert = false
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() !== 'window') return
  wc.on('render-process-gone', (_ev, d) => { if (wc === fenster?.webContents && d.reason !== 'clean-exit') oberflaecheGestoert = true })
  wc.on('unresponsive', () => { if (wc === fenster?.webContents) oberflaecheGestoert = true })
  wc.on('responsive', () => { if (wc === fenster?.webContents) oberflaecheGestoert = false })
})
app.on('before-quit', () => { if (!oberflaecheGestoert) plugins.startOk() })
ipcMain.handle('plugins:aufrufen', (_e, id, name, argumente) => plugins.aufrufen(String(id), String(name), Array.isArray(argumente) ? argumente : []))

// Wissen (nur lesen, nur im Donnerwolf-Ordner)
const wissen = require('./wissen')
ipcMain.handle('wissen:vault', () => wissen.vault())
ipcMain.handle('wissen:suchen', (_e, anfrage) => wissen.suchen(anfrage))
ipcMain.handle('wissen:lesen', (_e, rel) => wissen.lesen(rel))
ipcMain.handle('wissen:notizFinden', (_e, name) => wissen.notizFinden(name))
ipcMain.handle('wissen:morgenberichte', () => wissen.morgenberichte())
ipcMain.handle('wissen:entscheidungen', () => wissen.entscheidungen())
ipcMain.handle('wissen:bibliothek', () => wissen.bibliothek())
ipcMain.handle('wissen:dateien', () => wissen.dateien())
ipcMain.handle('datei:oeffnen', async (_e, rel) => {
  const fehler = await shell.openPath(wissen.sicher(rel))
  if (fehler) throw new Error(fehler)
})
ipcMain.handle('datei:zeigen', (_e, rel) => shell.showItemInFolder(wissen.sicher(rel)))
// Dateisuche auf dem ganzen PC („such die Datei … und öffne sie“): nur lesen; gezeigt werden nur Treffer einer Suche
ipcMain.handle('datei:suchen', (_e, anfrage) => dateisuche.suchen(String(anfrage || '').slice(0, 200)))
ipcMain.handle('datei:inhalt', (_e, id) => dateisuche.inhalt(id))
ipcMain.handle('datei:stand', () => dateisuche.stand())
// PC-Sofortbefehle der Oberfläche: nur einfache, geprüfte Aktionen (Programm aus dem Startmenü, Taste, Ordner, Sperren)
ipcMain.handle('pc:aktion', (_e, aktion) => pc.aktion(aktion && typeof aktion === 'object' ? aktion : {}))
// Luzzys Werkzeug pc_steuern (Hermes-Plugin jarves-pc) kommt über diese lokale Brücke an
const pcBruecke = require('./pcbruecke')
app.on('will-quit', () => pcBruecke.beenden())
// Bearbeiten: speichern nur auf Felix' Klick (die Oberfläche ruft das nur vom Speichern-Knopf aus), immer mit Sicherung
ipcMain.handle('datei:speichern', (_e, id, text, geaendert) => dateisuche.speichern(id, text, Number(geaendert) || 0))
ipcMain.handle('datei:rueckgaengig', (_e, id) => dateisuche.rueckgaengig(id))
ipcMain.handle('datei:pfad', (_e, pfad) => dateisuche.pfadTreffer(String(pfad || '').slice(0, 500)))
ipcMain.handle('datei:mitProgramm', async (_e, id) => {
  const voll = dateisuche.pfadVon(id)
  // Programme und Skripte startet Jarves-OS nie von selbst, auch nicht auf Knopfdruck
  if (dateisuche.istProgramm(voll)) throw new Error('Programme und Skripte startet Jarves-OS nicht. Nimm „Im Ordner zeigen“.')
  const fehler = await shell.openPath(voll)
  if (fehler) throw new Error(fehler)
})
ipcMain.handle('datei:imOrdner', (_e, id) => shell.showItemInFolder(dateisuche.pfadVon(id)))

// Luzzys Stimme: Pocket TTS (#39), lokal auf dem PC. Kein Text geht ins Internet.
const pocketDateiFuer = (o) => (pocket.stimmeGueltig(o.stimme) === 'eigen' ? o.pocketDatei : '')
const frist = (ms, text) => new Promise((_r, fehler) => setTimeout(() => fehler(new Error(text)), ms))
ipcMain.handle('stimme:liste', () => [...pocket.STIMMEN, pocket.EIGEN])
ipcMain.handle('stimme:sprechen', async (_e, text, optionen) => {
  const o = { ...einstellungen.laden(), ...(optionen || {}) }
  const stimmeId = pocket.stimmeGueltig(o.stimme)
  const datei = pocketDateiFuer({ ...o, stimme: stimmeId })
  // Startet der Server noch: warten (bei „Probe hören“ auch beim allerersten Start, der das Modell lädt)
  if (!pocket.bereit()) await Promise.race([pocket.starten(datei), frist(o.aufPocketWarten ? 10 * 60000 : 90000, 'Pocket TTS startet noch.')])
  return pocket.sprechen(String(text || '').slice(0, 3000), { stimme: stimmeId, datei }) // Buffer kommt als Uint8Array an
})
ipcMain.handle('stimme:pocketZustand', () => pocket.zustand())
ipcMain.handle('stimme:pocketStarten', (_e, optionen) => {
  pocket.starten(pocketDateiFuer({ ...einstellungen.laden(), ...(optionen || {}) })).catch(() => {})
  return pocket.zustand()
})
ipcMain.handle('stimme:pocketDateiWaehlen', async () => {
  const r = await dialog.showOpenDialog(fenster, {
    title: 'Aufnahme für Luzzys Stimme (10 bis 30 Sekunden, nur mit Zustimmung der Person)',
    properties: ['openFile'],
    filters: [{ name: 'Aufnahme', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'safetensors'] }]
  })
  return r.canceled ? '' : pocket.stimmDatei(r.filePaths[0])
})
app.on('will-quit', () => pocket.stoppen())

ipcMain.handle('einstellungen:laden', () => einstellungen.laden())
// Ergebnis zurück in die Zwischenablage (Zwischenablage an Luzzy)
ipcMain.handle('zwischenablage:schreiben', (_e, text) => clipboard.writeText(String(text || '').slice(0, 100000)))
ipcMain.handle('zwischenablage:lesen', () => clipboard.readText().slice(0, 15000))

// Schneller starten: Desktop-Verknüpfung und Autostart mit Windows (der Start per Terminal bleibt)
// Beides startet Electron direkt mit dem Projektordner, ohne Terminal-Fenster.
const APP_ORDNER = path.join(__dirname, '..', '..')
const VERKNUEPFUNG = () => path.join(app.getPath('desktop'), 'Jarves-OS.lnk')
const autostartOptionen = () => ({ path: process.execPath, args: [APP_ORDNER] })
ipcMain.handle('start:stand', () => ({
  windows: process.platform === 'win32',
  verknuepfung: require('node:fs').existsSync(VERKNUEPFUNG()),
  autostart: process.platform === 'win32' ? app.getLoginItemSettings(autostartOptionen()).openAtLogin : false
}))
ipcMain.handle('start:verknuepfung', () => {
  if (process.platform !== 'win32') throw new Error('Geht nur unter Windows.')
  const ok = shell.writeShortcutLink(VERKNUEPFUNG(), 'create', {
    target: process.execPath,
    args: `"${APP_ORDNER}"`,
    cwd: APP_ORDNER,
    description: 'Jarves-OS: Luzzy und die Donnerwolf-Kommandozentrale'
  })
  if (!ok) throw new Error('Verknüpfung konnte nicht angelegt werden.')
  return VERKNUEPFUNG()
})
ipcMain.handle('start:autostart', (_e, an) => {
  if (process.platform !== 'win32') throw new Error('Geht nur unter Windows.')
  app.setLoginItemSettings({ openAtLogin: Boolean(an), ...autostartOptionen() })
  return app.getLoginItemSettings(autostartOptionen()).openAtLogin
})

// ── Andocken an die Bildschirmhälfte ──
// Exakte Hälfte der Arbeitsfläche (ohne Taskleiste) des Bildschirms, auf dem Jarves-OS gerade ist
function haelfteBerechnen(seite) {
  const wa = screen.getDisplayMatching(fenster.getBounds()).workArea
  const links = Math.floor(wa.width / 2)
  return seite === 'links'
    ? { x: wa.x, y: wa.y, width: links, height: wa.height }
    : { x: wa.x + links, y: wa.y, width: wa.width - links, height: wa.height }
}
function andocken(seite) {
  if (!fenster || fenster.isDestroyed()) return
  if (seite === 'voll') return fenster.isMaximized() ? fenster.unmaximize() : fenster.maximize()
  if (fenster.isMaximized()) fenster.unmaximize()
  fenster.setBounds(haelfteBerechnen(seite))
}
// Nach Windows-Andocken: steht das Fenster fast genau auf einer Hälfte (±24 px), wird es exakt ausgerichtet
function haelfteKorrigieren() {
  if (!fenster || fenster.isDestroyed() || fenster.isMaximized() || fenster.isFullScreen() || fenster.isMinimized()) return
  const b = fenster.getBounds()
  const wa = screen.getDisplayMatching(b).workArea
  const nah = (a, z, t = 24) => Math.abs(a - z) <= t
  if (!nah(b.height, wa.height) || !nah(b.y, wa.y, 16) || !nah(b.width, wa.width / 2)) return
  const seite = nah(b.x, wa.x, 16) ? 'links' : nah(b.x + b.width, wa.x + wa.width, 16) ? 'rechts' : null
  if (!seite) return
  const ziel = haelfteBerechnen(seite)
  if (['x', 'y', 'width', 'height'].some((k) => Math.abs(b[k] - ziel[k]) > 1)) fenster.setBounds(ziel)
}
ipcMain.handle('fenster:andocken', (_e, seite) => andocken(['links', 'rechts', 'voll'].includes(seite) ? seite : 'links'))

// Fensterknöpfe oben rechts (Windows zeichnet sie selbst) in der Farbe dessen, was darunter wirklich zu sehen ist:
// ein kleines Bild vom Streifen unter den Knöpfen, davon der Durchschnitt. So passt es auch mit goldenem Schimmer,
// Raster, Tageszeit-Farben, eingeklappter rechter Spalte und abgedunkeltem Hintergrund bei offenen Fenstern
// (die CSS-Hintergrundfarbe allein kennt diese Ebenen nicht). Nachgemessen alle 1,5 s und auf Zuruf der Oberfläche.
const KNOEPFE = { breite: 138, hoehe: 38 } // drei Windows-Knöpfe à 46 px, Höhe wie titleBarOverlay
let titelfarbe = '#0e0e10'
let titelSymbol = '#C9A14A' // Symbolfarbe der Knöpfe = Akzent des Designs (Einstellungen → Aussehen)
let zoom = 1 // Schriftgröße der App (Einstellungen → Aussehen); die Knopfleiste wächst mit, damit sie zur Seite passt
let titelMisst = false
const knopfHoehe = () => Math.round(KNOEPFE.hoehe * zoom)
function titelleisteSetzen() {
  try {
    fenster.setTitleBarOverlay({ color: titelfarbe, symbolColor: titelSymbol, height: knopfHoehe() })
  } catch {
    // nicht auf jedem System möglich
  }
}
async function titelfarbeMessen() {
  if (titelMisst || !fenster || fenster.isDestroyed() || !fenster.isVisible() || fenster.isMinimized()) return
  titelMisst = true
  try {
    const [breite] = fenster.getContentSize()
    const bild = await fenster.webContents.capturePage({ x: Math.max(0, breite - KNOEPFE.breite), y: 0, width: Math.min(KNOEPFE.breite, breite), height: knopfHoehe() })
    const b = bild.toBitmap() // BGRA
    const summe = [0, 0, 0]
    let n = 0
    for (let i = 0; i + 3 < b.length; i += 16) {
      summe[0] += b[i + 2]
      summe[1] += b[i + 1]
      summe[2] += b[i]
      n++
    }
    if (!n) return
    const rgb = summe.map((s) => Math.round(s / n))
    const alt = titelfarbe.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16))
    if (Math.max(...rgb.map((w, k) => Math.abs(w - alt[k]))) < 3) return // kaum Unterschied: nicht flackern
    titelfarbe = `#${rgb.map((w) => w.toString(16).padStart(2, '0')).join('')}`
    if (process.env.JARVES_TEST_JS) console.log('TEST-TITELFARBE:', titelfarbe) // nur Testmodus
    titelleisteSetzen()
  } catch {
    // nicht auf jedem System möglich
  } finally {
    titelMisst = false
  }
}
ipcMain.handle('fenster:titelfarbe', () => titelfarbeMessen())
// Designs: eine Datei pro Design im Ordner designs/ (src/main/designs.js)
ipcMain.handle('design:liste', () => require('./designs').liste())
// Design aus den Einstellungen: Akzentfarbe für die Knopf-Symbole, Schriftgröße als Zoom der ganzen App
ipcMain.handle('fenster:design', (_e, d = {}) => {
  if (!fenster || fenster.isDestroyed()) return
  if (/^#[0-9a-f]{6}$/i.test(String(d.akzent))) titelSymbol = d.akzent
  const z = Number(d.zoom)
  if (z >= 0.8 && z <= 1.3) {
    zoom = z
    fenster.webContents.setZoomFactor(zoom)
  }
  titelleisteSetzen()
  setTimeout(titelfarbeMessen, 400)
})
setInterval(titelfarbeMessen, 1500)

// Taskleiste blinken lassen, wenn Jarves-OS im Hintergrund etwas Wichtiges hat (z. B. Timer abgelaufen)
ipcMain.handle('fenster:aufmerksamkeit', () => {
  if (fenster && !fenster.isDestroyed() && !fenster.isFocused()) fenster.flashFrame(true)
})
// Antwort merken (📌): als Notiz in Donnerwolf-Shop\Jarves-OS\Gemerkte Antworten
const vaultSchreiben = require('./vaultschreiben')
ipcMain.handle('vault:antwortMerken', async (_e, antwort, frage) => {
  antwort = String(antwort || '').slice(0, 100000)
  frage = String(frage || '').slice(0, 2000)
  if (!antwort.trim()) throw new Error('Keine Antwort zum Merken.')
  const jetzt = new Date()
  const zwei = (n) => String(n).padStart(2, '0')
  const datum = `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`
  // Titel: erster Satz der Antwort, ohne Markdown-Zeichen
  const erster = antwort.replace(/[#*_`>\[\]]/g, '').split(/(?<=[.!?])\s|\n/).map((s) => s.trim()).find(Boolean) || 'Antwort'
  const titel = `${datum} ${erster.slice(0, 60).replace(/[.!?:,;\s]+$/, '')}`
  const inhalt = `---\ndatum: ${datum} ${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}\nquelle: Luzzy (Jarves-OS)\ntags: [gemerkt]\n---\n\n${frage ? `**Frage:** ${frage}\n\n---\n\n` : ''}${antwort}\n`
  return vaultSchreiben.anlegen('Gemerkte Antworten', titel, inhalt)
})

// Sicherung auf Knopfdruck (wie npm run backup)
const sicherung = require('../../scripts/backup')
ipcMain.handle('sicherung:liste', () => sicherung.sicherungen())
ipcMain.handle('sicherung:anlegen', () => sicherung.sichern())
ipcMain.handle('sicherung:ordner', () => {
  require('node:fs').mkdirSync(sicherung.ORDNER, { recursive: true })
  return shell.openPath(sicherung.ORDNER)
})
ipcMain.handle('einstellungen:speichern', (_e, neu) => einstellungen.speichern(neu || {}))

// System-Details für den Bereich "System": Festplatte, Grafikkarte, lokale Modelle (Ollama)
const { execFile } = require('node:child_process')
const ausfuehren = (befehl, argumente) =>
  new Promise((fertig) =>
    execFile(befehl, argumente, { windowsHide: true, timeout: 8000 }, (fehler, ausgabe) => fertig(fehler ? '' : String(ausgabe)))
  )
let grafikkarten = null
// Ollama lauscht je nach Einstellung nur auf IPv4 oder nur auf IPv6: beide probieren
async function ollama(pfad) {
  for (const basis of ['http://127.0.0.1:11434', 'http://[::1]:11434']) {
    try {
      return await (await fetch(basis + pfad, { signal: AbortSignal.timeout(1500) })).json()
    } catch {
      // nächste Adresse
    }
  }
  return null
}
ipcMain.handle('system:details', async () => {
  const [plattenText, ollamaLaeuft, ollamaInstalliert] = await Promise.all([
    ausfuehren('powershell.exe', ['-NoProfile', '-Command', "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object { '{0};{1};{2}' -f $_.Name, $_.Used, $_.Free }"]),
    ollama('/api/ps'),
    ollama('/api/tags')
  ])
  if (grafikkarten === null) {
    const text = await ausfuehren('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }'])
    grafikkarten = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  }
  const platten = plattenText.split(/\r?\n/).filter(Boolean).map((z) => {
    const [name, belegt, frei] = z.split(';')
    return { name, belegt: Number(belegt), frei: Number(frei) }
  })
  return {
    platten,
    grafikkarten,
    ollama: ollamaInstalliert
      ? {
          installiert: (ollamaInstalliert.models || []).map((m) => ({ name: m.name, groesse: m.size })),
          geladen: (ollamaLaeuft?.models || []).map((m) => ({ name: m.name, vram: m.size_vram, bis: m.expires_at }))
        }
      : null,
    betriebssystem: `${os.type()} ${os.release()}`,
    laufzeit: os.uptime()
  }
})

let letzteCpu = os.cpus()
ipcMain.handle('system:werte', () => {
  const jetzt = os.cpus()
  let leer = 0
  let gesamt = 0
  jetzt.forEach((kern, i) => {
    const vorher = letzteCpu[i]?.times || kern.times
    const d = Object.keys(kern.times).reduce((s, k) => s + (kern.times[k] - vorher[k]), 0)
    gesamt += d
    leer += kern.times.idle - vorher.idle
  })
  letzteCpu = jetzt
  return {
    cpu: gesamt ? Math.round(100 - (leer / gesamt) * 100) : 0,
    ramBelegt: os.totalmem() - os.freemem(),
    ramGesamt: os.totalmem()
  }
})

// ── Mini-Modus: Insel fest oben mittig an der Bildschirmkante, immer im Vordergrund; das große Fenster geht in die Taskleiste ──
// Mikrofon, „Hey Luzzy“ und Stimme laufen weiter im großen Fenster (backgroundThrottling: false),
// es schickt der Leiste nur, was Luzzy gerade tut.
// Platz für Fenni (renderer/fenni/), Uhr/Wetter links, Luzzys Worte rechts; meldung: so viel höher, solange eine Meldung
// aufgeklappt ist (sonst bliebe unter der Insel ein unsichtbarer Streifen, der Klicks auf Browser-Tabs schluckt)
const MINI = { breite: 480, hoehe: 64, meldung: 44 }
let mini = null
// Die Insel versteckt sich nach oben, wenn nichts los ist, damit sie nicht stört. Sie kommt wieder, wenn die Maus an die
// obere Kante über ihr geht, bei einer Meldung und solange Luzzy zuhört, nachdenkt oder spricht. Versteckt lässt das
// Fenster alle Klicks durch (setIgnoreMouseEvents), die Insel selbst schiebt mini.html nach oben.
const MINI_WEG_NACH = 4000 // ms ohne Maus und ohne Luzzy, dann verschwindet sie
const MINI_KANTE = 4 // Pixel an der oberen Kante, die sie zurückholen
const MINI_AKTIV = ['hoert', 'versteht', 'denkt', 'antwortet', 'spricht', 'schaut']
const miniLage = { sichtbar: true, zuletzt: 0, luzzy: 'bereit', meldung: false, freigabe: false } // freigabe: Luzzy wartet auf dein Ja
function miniSichtbar(an) {
  if (!mini || mini.isDestroyed() || miniLage.sichtbar === an) return
  miniLage.sichtbar = an
  miniLage.zuletzt = Date.now()
  mini.setIgnoreMouseEvents(!an)
  mini.webContents.send('mini:sichtbar', an)
}
// Fennis Augen folgen der Maus auf dem ganzen Bildschirm: Mausposition relativ zur Mitte der Leiste, ~25-mal pro
// Sekunde und nur, solange der Mini-Modus an ist und sich die Maus bewegt
let letzterBlick = ''
setInterval(() => {
  if (!mini || mini.isDestroyed() || !mini.isVisible()) return
  const maus = screen.getCursorScreenPoint()
  const b = mini.getBounds()
  const ueberX = maus.x >= b.x && maus.x < b.x + b.width
  const halten = (ueberX && maus.y >= b.y && maus.y < b.y + b.height) || miniLage.meldung || miniLage.freigabe || MINI_AKTIV.includes(miniLage.luzzy)
  if (!miniLage.sichtbar && ueberX && maus.y <= b.y + MINI_KANTE) miniSichtbar(true)
  else if (miniLage.sichtbar && halten) miniLage.zuletzt = Date.now()
  else if (miniLage.sichtbar && Date.now() - miniLage.zuletzt > MINI_WEG_NACH) miniSichtbar(false)
  const blick = { x: Math.round(maus.x - (b.x + b.width / 2)), y: Math.round(maus.y - (b.y + MINI.hoehe / 2)) }
  const schluessel = `${blick.x},${blick.y}`
  if (schluessel === letzterBlick) return
  letzterBlick = schluessel
  mini.webContents.send('mini:blick', blick)
}, 40)
// Immer ganz vorne, egal was offen ist: Windows schiebt andere Fenster, die auch „immer im Vordergrund“ sind
// (z. B. Photoshop-Paletten, Videoplayer, Screenshot-Werkzeuge), sonst darüber. Deshalb jede Sekunde wieder nach
// ganz oben, ohne den Fokus zu nehmen (moveTop aktiviert das Fenster nicht).
setInterval(() => {
  if (!mini || mini.isDestroyed() || !mini.isVisible()) return
  mini.setAlwaysOnTop(true, 'screen-saver')
  mini.moveTop()
}, 1000)
function miniSetzen(an, { schliessen = false } = {}) {
  if (!fenster || fenster.isDestroyed()) an = false
  if (!an) {
    if (!mini) return
    const alt = mini
    mini = null
    if (!alt.isDestroyed()) alt.close()
    if (!schliessen && fenster && !fenster.isDestroyed()) {
      if (fenster.isMinimized()) fenster.restore()
      fenster.show()
      fenster.focus()
    }
    senden('mini:geaendert', false)
    return
  }
  if (!mini) {
    // Auf dem Bildschirm, auf dem Jarves-OS gerade ist: oben in der Mitte
    const { workArea } = screen.getDisplayMatching(fenster.getBounds())
    mini = new BrowserWindow({
      width: MINI.breite,
      height: MINI.hoehe,
      x: Math.round(workArea.x + (workArea.width - MINI.breite) / 2),
      y: workArea.y, // direkt an der oberen Kante: die Insel kommt aus dem Bildschirm
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false, // nimmt Photoshop & Co. nicht den Fokus weg
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      title: 'Luzzy',
      webPreferences: { preload: path.join(__dirname, '..', 'mini-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    mini.setAlwaysOnTop(true, 'screen-saver')
    Object.assign(miniLage, { sichtbar: true, zuletzt: Date.now(), luzzy: 'bereit', meldung: false, freigabe: false })
    mini.loadFile(path.join(__dirname, '..', 'renderer', 'mini.html'))
    mini.once('ready-to-show', () => mini?.showInactive())
    const dieses = mini
    mini.on('closed', () => {
      if (mini === dieses) miniSetzen(false)
    })
  }
  senden('mini:geaendert', true)
  if (!fenster.isMinimized()) fenster.minimize()
}
ipcMain.handle('mini:setzen', (_e, an) => miniSetzen(Boolean(an)))
// „Luzzy, was siehst du?“ (Idee 37): EIN Bildschirmfoto, nur im Mini-Modus und nur auf Felix' Befehl (nie heimlich).
// Bildschirm, auf dem die Maus steht; die Mini-Leiste kurz ausblenden, damit sie nicht mit drauf ist. Nichts wird gespeichert.
ipcMain.handle('bildschirm:aufnehmen', async () => {
  if (!mini || mini.isDestroyed()) throw new Error('Das geht nur im Mini-Modus.')
  const { desktopCapturer, screen } = require('electron')
  const anzeige = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const faktor = Math.min(1, 1920 / (anzeige.size.width * anzeige.scaleFactor))
  const groesse = { width: Math.round(anzeige.size.width * anzeige.scaleFactor * faktor), height: Math.round(anzeige.size.height * anzeige.scaleFactor * faktor) }
  const leiste = mini
  leiste.hide()
  try {
    await new Promise((z) => setTimeout(z, 150))
    const quellen = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: groesse })
    const quelle = quellen.find((q) => q.display_id === String(anzeige.id)) || quellen[0]
    if (!quelle || quelle.thumbnail.isEmpty()) throw new Error('Der Bildschirm ließ sich nicht aufnehmen.')
    return quelle.thumbnail.toJPEG(85).toString('base64')
  } finally {
    if (!leiste.isDestroyed()) leiste.showInactive()
  }
})
ipcMain.on('mini:zustand', (_e, daten) => {
  if (!mini || mini.isDestroyed()) return
  if (daten?.zustand) miniLage.luzzy = daten.zustand
  if (daten?.freigabe !== undefined) miniLage.freigabe = Boolean(daten.freigabe)
  if (daten?.meldung || daten?.freigabe || MINI_AKTIV.includes(daten?.zustand)) miniSichtbar(true) // taucht auf
  mini.webContents.send('mini:zustand', daten)
})
ipcMain.on('mini:sprechen', () => senden('mikrofon:umschalten'))
ipcMain.on('mini:gross', () => miniSetzen(false))
// Dateien auf Fenni gezogen (nur Pfade): das große Fenster hängt sie an Luzzys nächste Nachricht
ipcMain.on('mini:dateien', (_e, pfade) => {
  if (!Array.isArray(pfade)) return
  const liste = pfade.filter((x) => typeof x === 'string' && path.isAbsolute(x)).slice(0, 10)
  if (liste.length) senden('mini:dateien', liste)
})
// Meldung auf- und zuklappen: das Fenster wächst nach unten mit (mini.js)
ipcMain.on('mini:hoehe', (_e, offen) => {
  if (!mini || mini.isDestroyed()) return
  miniLage.meldung = Boolean(offen)
  miniLage.zuletzt = Date.now()
  const b = mini.getBounds()
  mini.setBounds({ ...b, height: MINI.hoehe + (offen ? MINI.meldung : 0) })
})

// ── Start ──
app.whenReady().then(() => {
  // Mikrofon nur für Jarves-OS selbst erlauben
  session.defaultSession.setPermissionRequestHandler((_wc, recht, antwort) => antwort(recht === 'media'))
  session.defaultSession.setPermissionCheckHandler((_wc, recht) => recht === 'media')
  protocol.handle('jarves-datei', (anfrage) => {
    try {
      return dateisuche.antwortFuer(anfrage.url)
    } catch (e) {
      return new Response(e.message, { status: 404 })
    }
  })
  dateisuche.vorbereiten()
  pc.vorbereiten()
  if (!process.env.JARVES_TEST_STUMM) pcBruecke.starten() // ein Testlauf übernimmt nie die Brücke des echten Jarves-OS
  // Pocket TTS gleich beim Start hochfahren, damit Luzzy schnell sprechen kann (im stummen Testmodus nicht:
  // dort wird nichts vorgelesen, und abgebrochene Testläufe ließen sonst Server zurück)
  if (!process.env.JARVES_TEST_STUMM || process.env.JARVES_TEST_POCKET) pocket.starten(pocketDateiFuer(einstellungen.laden())).catch(() => {})
  fensterErstellen()
  // Strg+Leertaste: Sprechen an/aus, auch wenn Jarves-OS im Hintergrund ist
  globalShortcut.register('Control+Space', () => senden('mikrofon:umschalten'))
  // Strg+Umschalt+H: freihändig an/aus („Hey Luzzy“ & Co. oder nur auf Knopfdruck), auch mitten in einem Anruf
  if (!globalShortcut.register('Control+Shift+H', () => senden('mikrofon:freihaendig'))) console.warn('Strg+Umschalt+H ist schon von einem anderen Programm belegt.')
  // Strg+Umschalt+L: kopierten Text an Luzzy (auch aus jedem anderen Programm)
  const ok = globalShortcut.register('Control+Shift+L', () => {
    if (!fenster || fenster.isDestroyed()) return
    if (fenster.isMinimized()) fenster.restore()
    fenster.show()
    fenster.focus()
    senden('zwischenablage:neu', clipboard.readText().slice(0, 15000))
  })
  if (!ok) console.warn('Strg+Umschalt+L ist schon von einem anderen Programm belegt.')
  // Strg+Umschalt+M oder AltGr+L: Mini-Modus an/aus, aus jedem Programm. Windows meldet AltGr als Strg+Alt,
  // deshalb „Control+Alt+L“ (die Schreibweise „AltGr“ ist bei globalen Tastenkürzeln unter Windows nicht verlässlich).
  const miniUmschalten = () => miniSetzen(!mini)
  // Eine der beiden reicht: nur warnen, wenn keine frei ist (Strg+Umschalt+M belegt z. B. Microsoft Teams)
  const miniTaste1 = globalShortcut.register('Control+Shift+M', miniUmschalten)
  const miniTaste2 = globalShortcut.register('Control+Alt+L', miniUmschalten)
  if (!miniTaste1 && !miniTaste2) console.warn('Mini-Modus: Strg+Umschalt+M und AltGr+L sind beide von anderen Programmen belegt. Der Mini-Knopf in Jarves-OS geht weiter.')
  hermes.neuVerbinden()
  bildschirmfotoFuerTest()
  skriptFuerTest()
})

// Testmodus: JARVES_TEST_JS=<JavaScript> [JARVES_TEST_JS_NACH=<ms>] führt Code in der Oberfläche aus
// und schreibt das Ergebnis in die Konsole (nur zum Entwickeln, z. B. Klicks simulieren).
function skriptFuerTest() {
  const code = process.env.JARVES_TEST_JS
  if (!code) return
  // Fehler aus der Oberfläche (auch beim Laden der Module) im Terminal zeigen, damit ein Test sie sieht
  fenster.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.log('TEST-KONSOLE:', String(e.message).slice(0, 300), e.sourceId ? `(${path.basename(e.sourceId)}:${e.lineNumber})` : '')
  })
  setTimeout(async () => {
    try {
      const ergebnis = await fenster.webContents.executeJavaScript(code, true)
      console.log('TEST-ERGEBNIS:', JSON.stringify(ergebnis))
    } catch (e) {
      console.log('TEST-FEHLER:', e.message)
    }
  }, Number(process.env.JARVES_TEST_JS_NACH || 10000))
}

// Testmodus: JARVES_SCREENSHOT=<datei.png> [JARVES_SCREENSHOT_NACH=<ms>] macht ein Bild der App und beendet sie.
function bildschirmfotoFuerTest() {
  const ziel = process.env.JARVES_SCREENSHOT
  if (!ziel) return
  setTimeout(async () => {
    const bild = await fenster.webContents.capturePage()
    require('node:fs').writeFileSync(ziel, bild.toPNG())
    hermes.beenden()
    app.quit()
  }, Number(process.env.JARVES_SCREENSHOT_NACH || 15000))
}

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  waechter.stoppen()
  hermes.wakeStoppen()
  hermes.beenden()
  app.quit()
})
