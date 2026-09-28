// Plugins für Jarves-OS: jeder Ordner in jarves-os\plugins\<id>\ mit einer plugin.json.
//
// Aufbau eines Plugins:
//   plugin.json   Pflicht: { "id", "name", "version", "beschreibung", "bereich": { "name" } }
//   ansicht.js    Oberfläche (ES-Modul): export function starten(ctx) { ... return { laden } }
//   stil.css      optional: eigenes Design
//   haupt.js      optional: Hintergrundteil (CommonJS): module.exports = (ctx) => { ctx.bereitstellen('name', fn) }
//   daten.json    wird von Jarves-OS angelegt: der Speicher des Plugins (ctx.daten)
//
// Plugins sind lokaler Code von Felix/Claude, kein Download aus dem Netz.

const fs = require('node:fs')
const path = require('node:path')

const ORDNER = path.join(__dirname, '..', '..', 'plugins')
const GUELTIGE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/

const geladen = new Map() // id → { manifest, funktionen }

// ── Notbremse: frisch eingebaute Plugins (Werkstatt) stehen in daten/plugin-start.json unter „neu“. Beim Start wird
// „laeuft“ gesetzt; meldet die Oberfläche nach dem Start „alles gut“ (startOk), gelten die neuen als bewährt.
// Kam der letzte Start nie so weit (Absturz, Aufhängen), werden die neuen Plugins diesmal abgeschaltet („aus“).
const START_DATEI = path.join(__dirname, '..', '..', 'daten', 'plugin-start.json')
let startGeprueft = false
let abgeschaltet = [] // in diesem Start durch die Notbremse abgeschaltet
function startZustand() {
  try {
    const z = JSON.parse(fs.readFileSync(START_DATEI, 'utf8'))
    return { laeuft: Boolean(z.laeuft), neu: Array.isArray(z.neu) ? z.neu : [], aus: Array.isArray(z.aus) ? z.aus : [] }
  } catch {
    return { laeuft: false, neu: [], aus: [] }
  }
}
function startZustandSpeichern(z) {
  fs.mkdirSync(path.dirname(START_DATEI), { recursive: true })
  fs.writeFileSync(START_DATEI, JSON.stringify(z, null, 2), 'utf8')
}
function startPruefen() {
  if (startGeprueft) return startZustand()
  startGeprueft = true
  const z = startZustand()
  if (z.laeuft && z.neu.length) {
    abgeschaltet = [...z.neu]
    z.aus = [...new Set([...z.aus, ...z.neu])]
    z.neu = []
    console.warn(`Notbremse: Jarves-OS ist beim letzten Mal nicht richtig gestartet. Abgeschaltet: ${abgeschaltet.join(', ')}`)
  }
  z.laeuft = true
  startZustandSpeichern(z)
  return z
}
function startOk() {
  const z = startZustand()
  z.laeuft = false
  z.neu = []
  startZustandSpeichern(z)
  return true
}
function neuMerken(id) {
  const z = startZustand()
  z.neu = [...new Set([...z.neu, id])]
  z.aus = z.aus.filter((x) => x !== id)
  startZustandSpeichern(z)
}
function wiederEinschalten(id) {
  const z = startZustand()
  z.aus = z.aus.filter((x) => x !== id)
  z.neu = [...new Set([...z.neu, id])] // beim nächsten Start wieder unter Beobachtung
  startZustandSpeichern(z)
  return true
}
const notbremse = () => ({ jetzt: abgeschaltet, aus: startZustand().aus })

function datenPfad(id) {
  return path.join(ORDNER, id, 'daten.json')
}

function datenLaden(id) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  try {
    return JSON.parse(fs.readFileSync(datenPfad(id), 'utf8'))
  } catch {
    return {}
  }
}

function datenSpeichern(id, daten) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  const text = JSON.stringify(daten ?? {}, null, 2)
  if (text.length > 5_000_000) throw new Error('Plugin-Daten zu groß.')
  // Erst in eine Zwischendatei schreiben, dann umbenennen: so geht bei einem Absturz nichts kaputt
  const ziel = datenPfad(id)
  fs.writeFileSync(`${ziel}.neu`, text, 'utf8')
  fs.renameSync(`${ziel}.neu`, ziel)
  return true
}

function alleLaden() {
  const start = startPruefen()
  geladen.clear()
  let eintraege = []
  try {
    eintraege = fs.readdirSync(ORDNER, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    return []
  }
  for (const e of eintraege) {
    const ordner = path.join(ORDNER, e.name)
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(ordner, 'plugin.json'), 'utf8'))
    } catch {
      console.warn(`Plugin ${e.name}: plugin.json fehlt oder ist kaputt, übersprungen.`)
      continue
    }
    if (!GUELTIGE_ID.test(String(manifest.id)) || manifest.id !== e.name) {
      console.warn(`Plugin ${e.name}: id muss dem Ordnernamen entsprechen (kleine Buchstaben, Zahlen, Bindestrich).`)
      continue
    }
    if (manifest.aktiv === false) continue
    if (start.aus.includes(manifest.id)) continue // Notbremse: abgeschaltet (in der Werkstatt wieder einschalten)
    const eintrag = {
      manifest: {
        id: manifest.id,
        name: String(manifest.name || manifest.id),
        version: String(manifest.version || '0.1.0'),
        beschreibung: String(manifest.beschreibung || ''),
        bereich: manifest.bereich ? { name: String(manifest.bereich.name || manifest.name) } : null,
        luzzy: manifest.luzzy?.stichwoerter ? { stichwoerter: String(manifest.luzzy.stichwoerter) } : null,
        ansicht: fs.existsSync(path.join(ordner, 'ansicht.js')),
        stil: fs.existsSync(path.join(ordner, 'stil.css'))
      },
      funktionen: new Map()
    }
    geladen.set(manifest.id, eintrag)
    // Optionaler Hintergrundteil
    const haupt = path.join(ordner, 'haupt.js')
    if (fs.existsSync(haupt)) {
      try {
        const aufbau = require(haupt)
        aufbau({
          id: manifest.id,
          datenLaden: () => datenLaden(manifest.id),
          datenSpeichern: (d) => datenSpeichern(manifest.id, d),
          bereitstellen: (name, fn) => eintrag.funktionen.set(String(name), fn),
          // Schreiben nur in Donnerwolf-Shop\Jarves-OS\ (nie überschreiben), siehe src/main/vaultschreiben.js
          vault: require('./vaultschreiben')
        })
      } catch (fehler) {
        console.warn(`Plugin ${manifest.id}: haupt.js konnte nicht geladen werden: ${fehler.message}`)
      }
    }
  }
  return [...geladen.values()].map((p) => p.manifest)
}

async function aufrufen(id, name, argumente = []) {
  const fn = geladen.get(id)?.funktionen.get(name)
  if (!fn) throw new Error(`Plugin-Funktion ${id}.${name} gibt es nicht.`)
  return fn(...argumente)
}

// Daten-Datei beobachten: ändert jemand anderes sie (z. B. Luzzy trägt einen Termin ein), meldet Jarves-OS das dem Plugin
const beobachtet = new Set()
function beobachten(id, beiAenderung) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  if (beobachtet.has(id)) return true
  beobachtet.add(id)
  fs.watchFile(datenPfad(id), { interval: 1000 }, (jetzt, vorher) => {
    if (jetzt.mtimeMs !== vorher.mtimeMs) beiAenderung(id)
  })
  return true
}

module.exports = { ORDNER, alleLaden, datenLaden, datenSpeichern, aufrufen, beobachten, startOk, neuMerken, wiederEinschalten, notbremse }
