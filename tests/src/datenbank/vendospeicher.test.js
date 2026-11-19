'use strict'
// Vendos Einstellungen und kleiner Zustand in PostgreSQL mit Startkopie (src/main/vendospeicher.js, Plan A5).
// Gegen die eigene Test-Datenbank in Docker, nur erfundene Werte, Datenordner ist ein Temp-Ordner.
//   docker start vendo-test-db
//   node --test tests/src/datenbank/vendospeicher.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-a5-'))
process.env.VENDO_DATEN_ORDNER = DATEN
process.env.VENDO_DB_URL ||= 'postgres://postgres:nurtest@127.0.0.1:55432/vendo_test'
const datenbank = require('../../../src/main/datenbank')
const vs = require('../../../src/main/vendospeicher')
const kopie = () => JSON.parse(fs.readFileSync(path.join(DATEN, 'startkopie.json'), 'utf8'))
const inDb = async (k) => (await datenbank.abfrage('SELECT roh FROM vendo.einstellungen WHERE schluessel = $1', [k])).rows[0]?.roh

let erreichbar = false
test.before(async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: process.env.VENDO_DB_URL, connectionTimeoutMillis: 3000 })
  try { await c.connect(); await c.query('DROP SCHEMA IF EXISTS vendo CASCADE'); erreichbar = true } catch { /* keine Test-Datenbank */ } finally { await c.end().catch(() => {}) }
  fs.writeFileSync(path.join(DATEN, 'einstellungen.json'), JSON.stringify({ stimme: 'Probe', design: { farbe: 'gold' } }))
  fs.writeFileSync(path.join(DATEN, 'terminal-befehle.json'), JSON.stringify([{ name: 'Liste', befehl: 'dir' }]))
})
test.after(async () => { vs._zuruecksetzen(); await datenbank.beenden(); fs.rmSync(DATEN, { recursive: true, force: true }) })

test('vor der Datenbank: alte Dateien werden gelesen, Änderungen landen in der Startkopie', (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  assert.equal(vs.lesen('einstellungen').stimme, 'Probe')
  assert.deepEqual(vs.lesen('terminal-befehle'), [{ name: 'Liste', befehl: 'dir' }])
  assert.equal(vs.lesen('waechter-stand'), null)
  vs.schreiben('waechter-stand', { zaehler: 3 })
  assert.deepEqual(JSON.parse(kopie()['waechter-stand']), { zaehler: 3 })
  assert.deepEqual(vs.zustand(), { geladen: false, offen: 3 })
})

test('Laden: leere Datenbank bekommt alle Werte, alte Dateien werden gesichert und weggeräumt', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  await datenbank.starten()
  await vs.laden()
  assert.equal(JSON.parse(await inDb('einstellungen')).stimme, 'Probe')
  assert.deepEqual(JSON.parse(await inDb('terminal-befehle')), [{ name: 'Liste', befehl: 'dir' }])
  assert.deepEqual(JSON.parse(await inDb('waechter-stand')), { zaehler: 3 })
  assert.ok(!fs.existsSync(path.join(DATEN, 'einstellungen.json')))
  assert.ok(!fs.existsSync(path.join(DATEN, 'terminal-befehle.json')))
  const s = fs.readdirSync(path.join(DATEN, 'datei-sicherungen')).find((n) => n.startsWith('vendo-dateien-'))
  assert.ok(fs.existsSync(path.join(DATEN, 'datei-sicherungen', s, 'einstellungen.json')))
  assert.deepEqual(vs.zustand(), { geladen: true, offen: 0 })
  vs.schreiben('einstellungen', { ...vs.lesen('einstellungen'), stimme: 'Neu' })
  await vs.festschreiben()
  assert.equal(JSON.parse(await inDb('einstellungen')).stimme, 'Neu')
})

test('Neustart: Datenbank gewinnt gegen eine veraltete Startkopie, eine Änderung vor dem Verbinden gewinnt gegen die Datenbank', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  await datenbank.abfrage("UPDATE vendo.einstellungen SET roh = '{\"stimme\":\"Anderswo\"}', wert = '{\"stimme\":\"Anderswo\"}' WHERE schluessel = 'einstellungen'")
  vs._zuruecksetzen()
  assert.equal(vs.lesen('einstellungen').stimme, 'Neu') // Startkopie, bis die Datenbank geladen ist
  vs.schreiben('waechter-stand', { zaehler: 4 }) // vor dem Verbinden geändert
  await vs.laden()
  assert.equal(vs.lesen('einstellungen').stimme, 'Anderswo')
  assert.equal(JSON.parse(kopie().einstellungen).stimme, 'Anderswo')
  assert.deepEqual(vs.lesen('waechter-stand'), { zaehler: 4 })
  assert.deepEqual(JSON.parse(await inDb('waechter-stand')), { zaehler: 4 })
})

test('alte Datei liegt noch, obwohl die Startkopie den Wert schon hat: wird nach dem Laden trotzdem gesichert und weggeräumt', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  fs.writeFileSync(path.join(DATEN, 'einstellungen.json'), JSON.stringify({ stimme: 'Uralt' }))
  vs._zuruecksetzen()
  assert.equal(vs.lesen('einstellungen').stimme, 'Anderswo', 'Startkopie ist neuer als die alte Datei')
  await vs.laden()
  assert.ok(!fs.existsSync(path.join(DATEN, 'einstellungen.json')))
  assert.equal(vs.lesen('einstellungen').stimme, 'Anderswo')
})
