'use strict'
// Plugin-Lader (src/main/plugins.js) mit dem Datenbank-Speicher: alle versionierten Plugins werden gelistet, Hintergrundteile
// starten erst nach dem Laden der Daten, Lesen/Speichern davor wird abgelehnt. Ohne Datenbank, Datenordner im Temp-Ordner
// (auch die Notbremse-Datei). Fehlerbild vom 19.11.2026: „Cannot access 'start' before initialization“ in alleLaden.
//   node --test tests/src/plugins/plugins-laden.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-plugins-'))
process.env.VENDO_DATEN_ORDNER = DATEN
const plugins = require('../../../src/main/plugins')
const speicher = require('../../../src/main/speicher')
test.after(() => { speicher._zuruecksetzen(); fs.rmSync(DATEN, { recursive: true, force: true }) })

test('alleLaden listet alle versionierten Plugins und nutzt die Notbremse-Datei im Datenordner', () => {
  const ids = plugins.alleLaden().map((m) => m.id)
  for (const id of ['aufgaben', 'kalender', 'newsletter', 'wetter', 'werkstatt']) assert.ok(ids.includes(id), `${id} fehlt`)
  assert.equal(JSON.parse(fs.readFileSync(path.join(DATEN, 'plugin-start.json'), 'utf8')).laeuft, true)
  assert.deepEqual(speicher.zustand().austausch.sort(), ['aufgaben', 'kalender'])
})

test('vor dem Laden der Daten: Lesen und Speichern abgelehnt', () => {
  assert.throws(() => plugins.datenLaden('wetter'), /noch nicht geladen/)
  assert.throws(() => plugins.datenSpeichern('wetter', { ort: 'Probe' }), /nichts gespeichert/)
  assert.throws(() => plugins.datenLaden('gibt-es-nicht'), /Unbekanntes Plugin/)
})

// plugins\buchhaltung ist lokal eine Verknüpfung (Junction) auf das eigene Repository vendo-buchhaltung (seit 19.11.2026)
const verknuepft = path.join(__dirname, '..', '..', '..', 'plugins', 'buchhaltung')
const istVerknuepfung = (() => { try { return fs.lstatSync(verknuepft).isSymbolicLink() } catch { return false } })()
test('verknüpfte Plugins (Junction/Symlink auf einen Ordner) werden geladen', { skip: !istVerknuepfung && 'plugins/buchhaltung ist hier keine Verknüpfung' }, () => {
  assert.ok(plugins.alleLaden().some((m) => m.id === 'buchhaltung' && m.ansicht && m.stil), 'buchhaltung über die Verknüpfung gefunden')
})
