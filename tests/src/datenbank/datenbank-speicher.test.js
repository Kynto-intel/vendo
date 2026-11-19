'use strict'
// Vendos Datenbank (src/main/datenbank.js): Start, Migrationen, Plugin-Zugang. Gegen eine
// eigene, leere Test-Datenbank in Docker. Nur erfundene Daten. Ohne erreichbare Test-Datenbank wird übersprungen.
//   docker run -d --name vendo-test-db -e POSTGRES_PASSWORD=nurtest -e POSTGRES_DB=vendo_test -p 127.0.0.1:55432:5432 postgres:18
//   node --test tests/src/datenbank/datenbank-speicher.test.js

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.VENDO_DB_URL ||= 'postgres://postgres:nurtest@127.0.0.1:55432/vendo_test'
const datenbank = require('../../../src/main/datenbank')

let erreichbar = false
test.before(async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: process.env.VENDO_DB_URL, connectionTimeoutMillis: 3000 })
  try { await c.connect(); await c.query('DROP SCHEMA IF EXISTS vendo CASCADE'); erreichbar = true } catch { /* keine Test-Datenbank */ } finally { await c.end().catch(() => {}) }
})
test.after(() => datenbank.beenden())

test('starten verbindet, legt vendo.plugin_daten an und ruft beiBereit auf', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  let gerufen = 0
  datenbank.beiBereit(() => { gerufen++ })
  const z = await datenbank.starten()
  assert.equal(z.zustand, 'bereit')
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(gerufen, 1)
  const r = await datenbank.abfrage("SELECT to_regclass('vendo.plugin_daten') AS t")
  assert.equal(r.rows[0].t, 'vendo.plugin_daten')
  const v = await datenbank.abfrage("SELECT to_regclass('vendo.austausch') AS a, to_regclass('vendo.einstellungen') AS e, (SELECT version FROM vendo.schema_version WHERE bereich = 'vendo') AS v")
  assert.deepEqual(v.rows[0], { a: 'vendo.austausch', e: 'vendo.einstellungen', v: 3 })
})

test('Migrationen laufen je Bereich genau einmal', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const liste = [{ version: 1, sql: 'CREATE SCHEMA IF NOT EXISTS probe; CREATE TABLE probe.zaehler (n int)' }, { version: 2, sql: 'INSERT INTO probe.zaehler VALUES (1)' }]
  assert.deepEqual(await datenbank.migrieren('probe', liste), { vorher: 0, jetzt: 2 })
  assert.deepEqual(await datenbank.migrieren('probe', liste), { vorher: 2, jetzt: 2 })
  assert.equal((await datenbank.abfrage('SELECT count(*)::int AS n FROM probe.zaehler')).rows[0].n, 1)
  await datenbank.abfrage('DROP SCHEMA probe CASCADE')
})

test('fehlerhafte Migration wird vollständig zurückgerollt', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  await assert.rejects(datenbank.migrieren('kaputt', [{ version: 1, sql: 'CREATE SCHEMA kaputt; SELECT gibt_es_nicht()' }]))
  assert.equal((await datenbank.abfrage("SELECT to_regnamespace('kaputt') AS s")).rows[0].s, null)
  assert.equal((await datenbank.abfrage("SELECT count(*)::int AS n FROM vendo.schema_version WHERE bereich = 'kaputt'")).rows[0].n, 0)
})

test('fuerPlugin gibt nur Zustand, Abfragen und eigene Migrationen weiter', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const db = datenbank.fuerPlugin('probe-plugin')
  assert.deepEqual(Object.keys(db).sort(), ['abfrage', 'beiBereit', 'bereit', 'migrieren', 'transaktion', 'zustand'])
  assert.equal(db.bereit(), true)
  await db.migrieren([{ version: 1, sql: 'CREATE SCHEMA IF NOT EXISTS probe_plugin' }])
  const r = await datenbank.abfrage("SELECT version FROM vendo.schema_version WHERE bereich = 'probe-plugin'")
  assert.equal(r.rows[0].version, 1)
  await datenbank.abfrage('DROP SCHEMA probe_plugin CASCADE')
})
