// Plugins für Vendo: jeder Ordner in vendo\plugins\<id>\ mit einer plugin.json.
//
// Aufbau eines Plugins:
//   plugin.json   Pflicht: { "id", "name", "version", "beschreibung", "bereich": { "name" }, "symbol" }
//   ansicht.js    Oberfläche (ES-Modul): export function starten(ctx) { ... return { laden } }
//   stil.css      optional: eigenes Design
//   haupt.js      optional: Hintergrundteil (CommonJS): module.exports = (ctx) => { ctx.bereitstellen('name', fn) }
//   Speicher      ctx.daten → vendo.plugin_daten (speicher.js); "austausch": true legt für Luzzy daten/austausch/<id>.json an.
//
// Plugins sind lokaler Code von Felix/Claude, kein Download aus dem Netz.

const fs = require('node:fs')
const path = require('node:path')
const speicher = require('./speicher')
const datenbank = require('./datenbank')

const ORDNER = path.join(__dirname, '..', '..', 'plugins')
const GUELTIGE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/

const geladen = new Map() // id → { manifest, funktionen }

// ── Notbremse: frisch eingebaute Plugins (Werkstatt) stehen in daten/plugin-start.json unter „neu“. Beim Start wird
// „laeuft“ gesetzt; meldet die Oberfläche nach dem Start „alles gut“ (startOk), gelten die neuen als bewährt.
// Kam der letzte Start nie so weit (Absturz, Aufhängen), werden die neuen Plugins diesmal abgeschaltet („aus“).
const START_DATEI = () => path.join(speicher.ordner().daten, 'plugin-start.json') // Datei, auch ohne Datenbank
let startGeprueft = false
let abgeschaltet = [] // in diesem Start durch die Notbremse abgeschaltet
function startZustand() {
  try {
    const z = JSON.parse(fs.readFileSync(START_DATEI(), 'utf8'))
    return { laeuft: Boolean(z.laeuft), neu: Array.isArray(z.neu) ? z.neu : [], aus: Array.isArray(z.aus) ? z.aus : [] }
  } catch {
    return { laeuft: false, neu: [], aus: [] }
  }
}
function startZustandSpeichern(z) {
  fs.mkdirSync(path.dirname(START_DATEI()), { recursive: true })
  fs.writeFileSync(START_DATEI(), JSON.stringify(z, null, 2), 'utf8')
}
function startPruefen() {
  if (startGeprueft) return startZustand()
  startGeprueft = true
  const z = startZustand()
  if (z.laeuft && z.neu.length) {
    abgeschaltet = [...z.neu]
    z.aus = [...new Set([...z.aus, ...z.neu])]
    z.neu = []
    console.warn(`Notbremse: Vendo ist beim letzten Mal nicht richtig gestartet. Abgeschaltet: ${abgeschaltet.join(', ')}`)
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
// Plugin entfernt: Notbremse vergisst es
function vergessen(id) {
  const z = startZustand()
  z.aus = z.aus.filter((x) => x !== id)
  z.neu = z.neu.filter((x) => x !== id)
  startZustandSpeichern(z)
  abgeschaltet = abgeschaltet.filter((x) => x !== id)
}
const notbremse = () => ({ jetzt: abgeschaltet, aus: startZustand().aus })

// Speicher eines Plugins: vendo.plugin_daten in PostgreSQL (speicher.js). Lesen und Speichern werfen, solange die
// Daten nicht geladen sind: dann nie mit {} weiterarbeiten.
function datenLaden(id) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  const text = speicher.lesen(id)
  try { return text ? JSON.parse(text) : {} } catch { return {} }
}

function datenSpeichern(id, daten) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  const text = JSON.stringify(daten ?? {}, null, 2)
  if (text.length > speicher.GRENZE) throw new Error('Plugin-Daten zu groß.')
  speicher.schreiben(id, text)
  return true
}

function alleLaden() {
  const start = startPruefen()
  geladen.clear()
  let eintraege = []
  try {
    // auch Verknüpfungen (Junction/Symlink) auf einen Ordner, z. B. pluginsuchhaltung → eigenes Repository vendo-buchhaltung
    eintraege = fs.readdirSync(ORDNER, { withFileTypes: true }).filter((e) => e.isDirectory() || (e.isSymbolicLink() && fs.statSync(path.join(ORDNER, e.name), { throwIfNoEntry: false })?.isDirectory()))
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
        symbol: String(manifest.symbol || ''),
        luzzy: manifest.luzzy?.stichwoerter ? { stichwoerter: String(manifest.luzzy.stichwoerter) } : null,
        ansicht: fs.existsSync(path.join(ordner, 'ansicht.js')),
        stil: fs.existsSync(path.join(ordner, 'stil.css'))
      },
      funktionen: new Map()
    }
    geladen.set(manifest.id, eintrag)
    if (manifest.austausch === true) speicher.austauschAnmelden(manifest.id) // Luzzy liest und schreibt eine Kopie
    const startDatei = path.join(ordner, 'daten.json') // Startdaten eines neuen Plugins, nur wenn die Datenbank noch nichts hat
    if (fs.existsSync(startDatei)) speicher.startdatenAnmelden(manifest.id, startDatei)
    // Optionaler Hintergrundteil. Liegen die Daten in der Datenbank, startet er erst, wenn sie geladen sind.
    const haupt = path.join(ordner, 'haupt.js')
    if (fs.existsSync(haupt)) {
      eintrag.aufbau = new Promise((fertig) => speicher.beiGeladen(() => { if (geladen.get(manifest.id) === eintrag) hauptAufbauen(manifest, eintrag, haupt); fertig() }))
    }
  }
  return [...geladen.values()].map((p) => p.manifest)
}

function hauptAufbauen(manifest, eintrag, haupt) {
  try {
    const aufbau = require(haupt)
    aufbau({
      id: manifest.id,
      ordner: path.dirname(haupt), // Plugin-Ordner, wie Vendo ihn sieht (bei einer Verknüpfung nicht das Ziel)
      datenLaden: () => datenLaden(manifest.id),
      datenSpeichern: (d) => datenSpeichern(manifest.id, d),
      festschreiben: () => speicher.festschreiben(), // wartet, bis der Spiegel in der Datenbank geschrieben ist
      datenbank: datenbank.fuerPlugin(manifest.id), // PostgreSQL für eigene Tabellen (Schema = Plugin-ID)
      bereitstellen: (name, fn) => eintrag.funktionen.set(String(name), fn),
      // Schreiben nur in Donnerwolf-Shop\Vendo\ (nie überschreiben), siehe src/main/vaultschreiben.js
      vault: require('./vaultschreiben')
    })
  } catch (fehler) {
    console.warn(`Plugin ${manifest.id}: haupt.js konnte nicht geladen werden: ${fehler.message}`)
  }
}

async function aufrufen(id, name, argumente = []) {
  const e = geladen.get(id)
  if (e?.aufbau && !speicher.geladen()) await speicher.warten()
  if (e?.aufbau) await e.aufbau
  const fn = e?.funktionen.get(name)
  if (!fn) throw new Error(`Plugin-Funktion ${id}.${name} gibt es nicht.`)
  return fn(...argumente)
}

// Daten beobachten: ändert jemand anderes sie (z. B. Luzzy trägt einen Termin ein), meldet speicher.js das dem Plugin
const beobachtet = new Set()
function beobachten(id, beiAenderung) {
  if (!geladen.has(id)) throw new Error('Unbekanntes Plugin.')
  if (beobachtet.has(id)) return true
  beobachtet.add(id)
  speicher.beobachten(id, beiAenderung)
  return true
}

module.exports = { ORDNER, alleLaden, datenLaden, datenSpeichern, aufrufen, beobachten, startOk, neuMerken, wiederEinschalten, vergessen, notbremse }
