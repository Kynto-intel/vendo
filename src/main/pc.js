// PC-Steuerung per Stimme (#30): Programme starten (alles aus dem Startmenü, auch Store-Apps wie Netflix),
// Webseiten und Suchen im Browser, Lautstärke und Musik, Ordner öffnen, PC sperren.
// Die Oberfläche schickt nur fertige, einfache Aktionen; hier wird jede geprüft. Nie: beliebige Befehle,
// Programme per Pfad, Herunterfahren, Schließen. Testmodus JARVES_TEST_PC=1: nur protokollieren, nichts ausführen.

const { execFile } = require('node:child_process')
const path = require('node:path')
const { app, shell } = require('electron')
const { WURZEL } = require('./wissen')

const TEST = Boolean(process.env.JARVES_TEST_PC)
const LISTE_ALTER = 60 * 60 * 1000

const normal = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[_\-.+()[\]{}®™©:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function ausfuehren(datei, argumente) {
  if (TEST) {
    console.log('PC-TEST:', datei, JSON.stringify(argumente))
    return Promise.resolve('')
  }
  return new Promise((fertig, fehler) =>
    execFile(datei, argumente, { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (e, aus) => (e ? fehler(e) : fertig(String(aus || ''))))
  )
}
const powershell = (befehl) => ausfuehren('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', befehl])

// ── Programme: Liste aus dem Startmenü (Get-StartApps: Name + AppID, Desktop-Programme und Store-Apps) ──
let programme = null
let programmeZeit = 0
async function programmListe() {
  if (programme && Date.now() - programmeZeit < LISTE_ALTER) return programme
  let liste = []
  if (process.env.JARVES_TEST_PROGRAMME) liste = JSON.parse(process.env.JARVES_TEST_PROGRAMME).map((p) => ({ name: p.Name, id: p.AppID }))
  else if (process.platform === 'win32') {
    try {
      const aus = await new Promise((fertig, fehler) =>
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'],
          { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }, (e, a) => (e ? fehler(e) : fertig(String(a || ''))))
      )
      const roh = JSON.parse(aus || '[]')
      liste = (Array.isArray(roh) ? roh : [roh]).filter((p) => p?.Name && p?.AppID).map((p) => ({ name: p.Name, id: p.AppID }))
    } catch (e) {
      console.warn('Programmliste:', e.message)
    }
  }
  // Deinstallieren/Hilfe-Einträge nie anbieten
  programme = liste.filter((p) => !/uninstall|deinstall|entfernen|readme|hilfe|help|website|web site/i.test(p.name)).map((p) => ({ ...p, suche: normal(p.name) }))
  programmeZeit = Date.now()
  return programme
}

// Bestes Programm zum gesagten Namen: genau > fängt an mit > enthält alle Wörter
async function programmFinden(name) {
  const gesucht = normal(name)
  if (!gesucht) return null
  const worte = gesucht.split(' ')
  let bestes = null
  for (const p of await programmListe()) {
    let punkte = 0
    if (p.suche === gesucht) punkte = 100
    else if (p.suche.startsWith(`${gesucht} `) || p.suche.startsWith(gesucht)) punkte = 60
    else if (worte.every((w) => p.suche.split(' ').includes(w))) punkte = 50
    else if (worte.every((w) => p.suche.includes(w))) punkte = 30
    if (!punkte) continue
    punkte -= p.suche.length / 100 // kürzere Namen zuerst („Photoshop“ vor „Photoshop Elements Organizer“)
    if (!bestes || punkte > bestes.punkte) bestes = { ...p, punkte }
  }
  return bestes
}

async function programmStarten(name) {
  const p = await programmFinden(name)
  if (!p) return { gefunden: false }
  await ausfuehren('explorer.exe', [`shell:AppsFolder\\${p.id}`])
  return { gefunden: true, name: p.name }
}

// ── Web ──
const BROWSER = { chrome: 'chrome', 'google chrome': 'chrome', firefox: 'firefox', edge: 'msedge', 'microsoft edge': 'msedge', opera: 'opera', brave: 'brave' }
async function webOeffnen(adresse, browser) {
  const url = new URL(String(adresse))
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Nur Webseiten.')
  const exe = browser ? BROWSER[normal(browser)] : null
  if (exe && process.platform === 'win32') {
    // Start-Process findet den Browser über die Windows-Registrierung (App Paths); ' ist in der Adresse kodiert
    await powershell(`Start-Process ${exe} '${url.toString().replace(/'/g, '%27')}'`)
    return
  }
  if (TEST) return void console.log('PC-TEST: web', url.toString())
  await shell.openExternal(url.toString())
}

// ── Lautstärke & Musik: Tasten der Tastatur nachahmen (Windows) ──
const TASTE = { lauter: 175, leiser: 174, stumm: 173, abspielen: 179, weiter: 176, zurueck: 177 }
async function taste(name, anzahl = 1) {
  if (!TASTE[name]) throw new Error('Unbekannte Taste.')
  anzahl = Math.max(1, Math.min(60, Math.round(anzahl)))
  await powershell(`$w = New-Object -ComObject WScript.Shell; 1..${anzahl} | ForEach-Object { $w.SendKeys([char]${TASTE[name]}) }`)
}
// Lautstärke auf x %: ganz runter, dann in 2-%-Schritten hoch
async function lautstaerkeSetzen(prozent) {
  const ziel = Math.max(0, Math.min(100, Math.round(prozent)))
  await powershell(`$w = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $w.SendKeys([char]174) }; ${ziel ? `1..${Math.round(ziel / 2)} | ForEach-Object { $w.SendKeys([char]175) }` : ''}`)
}

// ── Ordner ──
function ordnerPfad(name) {
  const n = normal(name)
  const pfad = (p) => {
    try {
      return app.getPath(p)
    } catch {
      return null
    }
  }
  const ORDNER = { desktop: 'desktop', downloads: 'downloads', download: 'downloads', dokumente: 'documents', bilder: 'pictures', fotos: 'pictures', musik: 'music', videos: 'videos' }
  if (n === 'donnerwolf') return WURZEL
  if (n === 'jarves' || n === 'jarves os') return path.join(__dirname, '..', '..')
  return ORDNER[n] ? pfad(ORDNER[n]) : null
}

// Eine Aktion aus der Oberfläche ausführen (nur diese Arten)
async function aktion(a = {}) {
  switch (a.art) {
    case 'programm':
      return programmStarten(String(a.name || '').slice(0, 80))
    case 'web':
      await webOeffnen(a.url, a.browser)
      return { ok: true }
    case 'taste':
      await taste(a.taste, a.anzahl)
      return { ok: true }
    case 'lautstaerke':
      await lautstaerkeSetzen(Number(a.prozent))
      return { ok: true }
    case 'ordner': {
      const p = ordnerPfad(a.name)
      if (!p) return { gefunden: false }
      if (TEST) console.log('PC-TEST: ordner', p)
      else {
        const fehler = await shell.openPath(p)
        if (fehler) throw new Error(fehler)
      }
      return { gefunden: true }
    }
    case 'sperren':
      await ausfuehren('rundll32.exe', ['user32.dll,LockWorkStation'])
      return { ok: true }
    default:
      throw new Error('Unbekannte Aktion.')
  }
}

// Programmliste beim Start im Hintergrund holen, damit „öffne …“ sofort geht
function vorbereiten() {
  setTimeout(() => programmListe().catch(() => {}), 8000)
}

module.exports = { aktion, programmFinden, vorbereiten }
