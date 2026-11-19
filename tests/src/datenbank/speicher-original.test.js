'use strict'
// PostgreSQL als einziges Original der Plugin-Daten (src/main/speicher.js, Plan docs/postgresql-umbauplan.md Teil B):
// Laden, alte Dateien und Startdaten nur ohne Datenbankzeile, Lesen/Speichern aus dem Arbeitsspeicher, Austauschdatei für
// Luzzy, Journal bei Datenbankausfall, Export. Gegen die eigene Test-Datenbank in Docker, nur erfundene Daten,
// Datenordner ist ein Temp-Ordner. Ohne erreichbare Test-Datenbank wird übersprungen.
//   docker start vendo-test-db
//   node --test tests/src/datenbank/speicher-original.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-original-'))
process.env.VENDO_DATEN_ORDNER = DATEN
process.env.VENDO_DB_URL ||= 'postgres://postgres:nurtest@127.0.0.1:55432/vendo_test'
const datenbank = require('../../../src/main/datenbank')
const speicher = require('../../../src/main/speicher')

const P = path.join(DATEN, 'plugins')
const A = path.join(DATEN, 'austausch')
const J = path.join(DATEN, 'speicher-offen')
const text = (o) => JSON.stringify(o, null, 2)
const warte = (ms) => new Promise((r) => setTimeout(r, ms))
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms
  while (Date.now() < ende) { if (await bedingung()) return true; await warte(100) }
  return false
}
const roh = async (id) => (await datenbank.abfrage('SELECT roh FROM vendo.plugin_daten WHERE plugin_id = $1', [id])).rows[0]?.roh

const NOTIZEN = text({ zeta: 1, alpha: { b: [1, 2], a: 'ä' } }) // Reihenfolge der Schlüssel muss bleiben
const IN_DB = text({ quelle: 'datenbank' })

let erreichbar = false
test.before(async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: process.env.VENDO_DB_URL, connectionTimeoutMillis: 3000 })
  try { await c.connect(); await c.query('DROP SCHEMA IF EXISTS vendo CASCADE'); erreichbar = true } catch { /* keine Test-Datenbank */ } finally { await c.end().catch(() => {}) }
  if (!erreichbar) return
  await datenbank.starten()
  await datenbank.abfrage('INSERT INTO vendo.plugin_daten (plugin_id, daten, roh) VALUES ($1, $2::text::jsonb, $2::text)', ['vorhanden', IN_DB])
  fs.mkdirSync(path.join(P, 'newsletter'), { recursive: true })
  fs.writeFileSync(path.join(P, 'notizen.json'), NOTIZEN) // alte Datei, Datenbank hat nichts: wird übernommen
  fs.writeFileSync(path.join(P, 'vorhanden.json'), text({ quelle: 'alte Datei' })) // Datenbank hat schon Daten: bleibt liegen
  fs.writeFileSync(path.join(P, 'newsletter', 'protokoll.ndjson'), '{}\n')
  fs.mkdirSync(path.join(DATEN, 'neu-plugin'))
  fs.writeFileSync(path.join(DATEN, 'neu-plugin', 'daten.json'), text({ start: true }))
})
test.after(async () => {
  speicher._zuruecksetzen()
  await datenbank.beenden()
  fs.rmSync(DATEN, { recursive: true, force: true })
})

test('vor dem Laden: weder lesen noch speichern, die Datenbank behält ihre Daten', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  assert.throws(() => speicher.lesen('vorhanden'), /noch nicht geladen/)
  assert.throws(() => speicher.schreiben('vorhanden', '{}'), /nichts gespeichert/)
  assert.equal(await roh('vorhanden'), IN_DB)
})

test('Laden: alte Datei und Startdaten nur ohne Datenbankzeile; übernommene Datei wird gesichert und weggeräumt', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  speicher.austauschAnmelden('kalender')
  speicher.startdatenAnmelden('neu-plugin', path.join(DATEN, 'neu-plugin', 'daten.json'))
  speicher.startdatenAnmelden('vorhanden', path.join(DATEN, 'neu-plugin', 'daten.json'))
  const l = await speicher.laden()
  assert.deepEqual(l.uebernommen, ['notizen'])
  assert.equal(speicher.lesen('notizen'), NOTIZEN)
  assert.equal(speicher.lesen('vorhanden'), IN_DB, 'Datenbank gewinnt gegen alte Datei und Startdaten')
  assert.equal(JSON.parse(speicher.lesen('neu-plugin')).start, true)
  assert.equal(speicher.lesen('gibt-es-nicht'), null)
  assert.ok(!fs.existsSync(path.join(P, 'notizen.json')))
  assert.ok(fs.existsSync(path.join(P, 'vorhanden.json')))
  assert.deepEqual(speicher.zustand().altLiegen, ['vorhanden'])
  assert.ok(fs.existsSync(path.join(P, 'newsletter', 'protokoll.ndjson')))
  const gesichert = fs.readdirSync(path.join(DATEN, 'datei-sicherungen')).find((n) => n.startsWith('plugin-daten-eingelesen-'))
  assert.equal(fs.readFileSync(path.join(DATEN, 'datei-sicherungen', gesichert, 'notizen.json'), 'utf8'), NOTIZEN)
  assert.equal(await roh('notizen'), NOTIZEN)
  assert.equal(fs.readFileSync(path.join(A, 'kalender.json'), 'utf8'), '{}')
})

test('Speichern geht in die Datenbank und in die Austauschdatei, Beobachter wird benachrichtigt', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const gemeldet = []
  speicher.beobachten('kalender', (id) => gemeldet.push(id))
  const neu = text({ termine: [{ id: 't1', titel: 'Geändert in Vendo' }] })
  assert.equal(speicher.schreiben('kalender', neu), true)
  assert.equal(speicher.schreiben('kalender', neu), false)
  await speicher.festschreiben()
  assert.equal(await roh('kalender'), neu)
  assert.equal(fs.readFileSync(path.join(A, 'kalender.json'), 'utf8'), neu)
  assert.ok(await bis(() => gemeldet.length === 1))
  await warte(1500) // die eigene Änderung der Austauschdatei wird nicht als fremde eingelesen
  assert.equal(gemeldet.length, 1)
})

test('Luzzy ändert die Austauschdatei: Vendo liest sie ein und meldet es; ungültiges JSON nicht', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const gemeldet = []
  speicher.beobachten('kalender', () => gemeldet.push(1))
  const vonLuzzy = JSON.stringify({ termine: [{ id: 't2', titel: 'Von Luzzy eingetragen' }] }, null, 2) + '\n'
  fs.writeFileSync(path.join(A, 'kalender.json.tmp'), vonLuzzy)
  fs.renameSync(path.join(A, 'kalender.json.tmp'), path.join(A, 'kalender.json'))
  assert.ok(await bis(() => speicher.lesen('kalender') === vonLuzzy, 5000), 'Änderung wurde nicht eingelesen')
  assert.ok(await bis(() => gemeldet.length >= 1))
  await speicher.festschreiben()
  assert.equal(await roh('kalender'), vonLuzzy)
  fs.writeFileSync(path.join(A, 'kalender.json'), '[1, 2]')
  await warte(1800)
  assert.equal(speicher.lesen('kalender'), vonLuzzy)
})

test('Neustart: Eingang von Luzzy, während Vendo zu war, wird übernommen', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  speicher._zuruecksetzen()
  const offline = text({ termine: [{ id: 't3', titel: 'Eingetragen, als Vendo zu war' }] })
  fs.writeFileSync(path.join(A, 'kalender.json'), offline)
  speicher.austauschAnmelden('kalender')
  const l = await speicher.laden()
  assert.equal(l.journal, 0)
  assert.equal(speicher.lesen('notizen'), NOTIZEN)
  assert.equal(speicher.lesen('kalender'), offline)
  await speicher.festschreiben()
  assert.equal(await roh('kalender'), offline)
})

test('Datenbank fällt aus: Änderung kommt ins Journal und wird beim nächsten Laden nachgeschrieben', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  await datenbank.beenden()
  const neu = text({ zeta: 2, alpha: 'ohne Datenbank gespeichert' })
  speicher.schreiben('notizen', neu)
  await speicher.festschreiben()
  assert.equal(fs.readFileSync(path.join(J, 'notizen.json'), 'utf8'), neu)
  speicher.sichern()
  speicher._zuruecksetzen()
  await datenbank.starten()
  const l = await speicher.laden()
  assert.equal(l.journal, 1)
  assert.equal(speicher.lesen('notizen'), neu)
  assert.equal(await roh('notizen'), neu)
  assert.ok(!fs.existsSync(path.join(J, 'notizen.json')), 'Journal wurde nach dem Schreiben nicht aufgeräumt')
})

test('warten: ohne Datenbank Fehler nach Frist, löst auf, sobald geladen', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  speicher._zuruecksetzen()
  await datenbank.beenden()
  await assert.rejects(speicher.warten(300), /noch nicht geladen/)
  const w = speicher.warten(10_000)
  await datenbank.starten()
  await speicher.laden()
  await w
  assert.match(speicher.lesen('notizen'), /ohne Datenbank gespeichert/)
})

test('Export: alle Plugin-Daten als JSON-Dateien, Text genau wie in der Datenbank', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const r = await speicher.exportieren()
  assert.ok(r.dateien >= 4)
  assert.equal(fs.readFileSync(path.join(r.ordner, 'vorhanden.json'), 'utf8'), IN_DB)
  assert.equal(fs.readFileSync(path.join(r.ordner, 'notizen.json'), 'utf8'), speicher.lesen('notizen'))
})
