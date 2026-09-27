// Jarves-OS Hauptprozess: Fenster, Hermes-Verbindung, Stimme, System-Werte.

const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, screen, clipboard, protocol } = require('electron')

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
const stimme = require('./stimme')
const einstellungen = require('./einstellungen')
const dateisuche = require('./dateisuche')

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

// ── Hermes → Oberfläche ──
hermes.on('status', (s) => {
  senden('hermes:status', s)
  if (s.zustand === 'bereit') waechter.starten()
})
hermes.on('ereignis', (e) => senden('hermes:ereignis', e))
hermes.on('freigabe', (f) => senden('hermes:freigabe', f))
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
const kanalPruefen = (k) => (KANAELE.has(k) ? k : 'zentrale')
ipcMain.handle('hermes:status', () => ({ zustand: hermes.zustand, text: hermes.statusText, profil: PROFIL }))
ipcMain.handle('hermes:senden', (_e, kanal, text) => hermes.senden(kanalPruefen(kanal), String(text || '').slice(0, 20000)))
ipcMain.handle('hermes:abbrechen', (_e, kanal) => hermes.abbrechen(kanalPruefen(kanal)))
ipcMain.handle('hermes:crewOeffnen', () => hermes.crewOeffnen())
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

ipcMain.handle('stimme:liste', () => stimme.STIMMEN)
ipcMain.handle('stimme:sprechen', async (_e, text, optionen) => {
  const mp3 = await stimme.sprechen(String(text || '').slice(0, 3000), optionen || einstellungen.laden())
  return mp3 // Buffer kommt in der Oberfläche als Uint8Array an
})

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

// Farben nach Tageszeit: Fensterknöpfe oben rechts in der Farbe der rechten Spalte
ipcMain.handle('fenster:titelfarbe', (_e, farbe) => {
  if (!/^#[0-9a-f]{6}$/i.test(String(farbe)) || !fenster || fenster.isDestroyed()) return
  if (process.env.JARVES_TEST_JS) console.log('TEST-TITELFARBE:', farbe) // nur Testmodus
  try {
    fenster.setTitleBarOverlay({ color: farbe, symbolColor: '#C9A14A', height: 38 })
  } catch {
    // nicht auf jedem System möglich
  }
})

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

// ── Mini-Modus: schmale Leiste fest oben mittig, immer im Vordergrund; das große Fenster geht in die Taskleiste ──
// Mikrofon, „Hey Luzzy“ und Stimme laufen weiter im großen Fenster (backgroundThrottling: false),
// es schickt der Leiste nur, was Luzzy gerade tut.
const MINI = { breite: 340, hoehe: 36, abstand: 8 }
let mini = null
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
      y: workArea.y + MINI.abstand,
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
ipcMain.on('mini:zustand', (_e, daten) => {
  if (mini && !mini.isDestroyed()) mini.webContents.send('mini:zustand', daten)
})
ipcMain.on('mini:sprechen', () => senden('mikrofon:umschalten'))
ipcMain.on('mini:gross', () => miniSetzen(false))

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
  fensterErstellen()
  // Strg+Leertaste: Sprechen an/aus, auch wenn Jarves-OS im Hintergrund ist
  globalShortcut.register('Control+Space', () => senden('mikrofon:umschalten'))
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
  if (!globalShortcut.register('Control+Shift+M', miniUmschalten)) console.warn('Strg+Umschalt+M ist schon von einem anderen Programm belegt.')
  if (!globalShortcut.register('Control+Alt+L', miniUmschalten)) console.warn('AltGr+L ist schon von einem anderen Programm belegt.')
  hermes.neuVerbinden()
  bildschirmfotoFuerTest()
  skriptFuerTest()
})

// Testmodus: JARVES_TEST_JS=<JavaScript> [JARVES_TEST_JS_NACH=<ms>] führt Code in der Oberfläche aus
// und schreibt das Ergebnis in die Konsole (nur zum Entwickeln, z. B. Klicks simulieren).
function skriptFuerTest() {
  const code = process.env.JARVES_TEST_JS
  if (!code) return
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
