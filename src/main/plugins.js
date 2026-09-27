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

module.exports = { ORDNER, alleLaden, datenLaden, datenSpeichern, aufrufen, beobachten }
