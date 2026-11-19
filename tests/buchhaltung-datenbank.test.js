'use strict'
// Buchhaltung: abgeleiteter Index in PostgreSQL (plugins/buchhaltung/datenbank-index.js, Plan 11.2 Phase D).
// Zeilenbau ohne Datenbank; Aufbau, Gegenprobe und Jahressummen gegen die leere Test-Datenbank in Docker.
// Nur erfundene Bestellungen. Ohne erreichbare Test-Datenbank werden die Datenbank-Tests übersprungen.
//   node --test tests/buchhaltung-datenbank.test.js

const test = require('node:test')
const assert = require('node:assert/strict')

process.env.VENDO_DB_URL ||= 'postgres://postgres:nurtest@127.0.0.1:55432/vendo_test'
const datenbank = require('../src/main/datenbank')
const idx = require('../plugins/buchhaltung/datenbank-index')

const bestellung = (nr, datum, brutto, extra = {}) => ({
  id: `s${nr}`, beleg: { version: 1, pdf: `2024/umsatzbeleg/Umsatzbeleg Bestellung ${nr}__abc.pdf`, sha256: `sha-${nr}` },
  rechnung: {
    referenz: String(nr), datum, storniert: false, kleinunternehmer: true, wirksam: brutto, version: 'api-1',
    summen: { brutto, mwst: 0, netto: brutto, mwstSatz: 0 },
    empfaenger: { name: 'Erika Mustermann', strasse: 'Musterweg 1', plz: '54321', ort: 'Musterstadt', land: 'DE', email: 'erika@example.invalid' },
    positionen: [{ typ: 'artikel', bezeichnung: 'Shirt', menge: 1, gesamt: brutto, bildUrl: 'https://example.invalid/bild.png' }],
    zahlung: { art: 'paypal', bezahlt: true, datum, eingaenge: [{ datum, betrag: brutto, gateway: 'paypal' }], erstattungen: [] },
    ...extra
  }
})
const QUELLEN = {
  shop: [
    bestellung(1001, '2024-03-05', 29.9),
    bestellung(1002, '2024-12-31', 50, { zahlung: { art: 'paypal', bezahlt: false, datum: '2025-01-02', eingaenge: [{ datum: '2025-01-02', betrag: 50, gateway: 'paypal' }], erstattungen: [{ datum: '2025-01-10', betrag: 10, gateway: 'paypal' }] } }),
    bestellung(1003, '2025-02-01', 19.99, { storniert: true, wirksam: 0, summen: { brutto: 0, mwst: 0, netto: 0, mwstSatz: 0 } })
  ],
  shirtigo: [{ id: 't55', beleg: { pdf: '2024/eingang/Rechnung R-1.pdf', sha256: 'sha-r1' }, rechnung: { rechnungsnummer: 'R-1', datum: '2024-03-06', version: 2, wirksam: -12.5, summen: { brutto: 14.88, mwst: 2.38, netto: 12.5 } } }],
  belege: [{ id: 'r0123456789abcdef0123', archiv: { sha256: 'sha-b1' }, ausgeblendet: false, rechnung: { lieferant: 'Beispiel GmbH', rechnungsnummer: 'B-7', datum: '2024-05-01', art: 'ausgabe', wirksam: -5, summen: { brutto: 5, mwst: 0, netto: 5 }, p13b: { steuer: 0.95 } } }]
}

test('zeilenBauen: alle Tabellen, keine Kundendaten', () => {
  const z = idx.zeilenBauen(QUELLEN)
  assert.equal(z.bestellungen.length, 3)
  assert.equal(z.zahlungen.length, 4) // 3 Eingänge + 1 Erstattung
  assert.equal(z.einkaeufe.length, 1)
  assert.equal(z.belege.length, 1)
  const text = JSON.stringify(z)
  for (const verboten of ['Mustermann', 'Musterweg', 'erika@', '54321', 'bild.png']) assert.ok(!text.includes(verboten), verboten)
  const [nr, version, bestelltag, zahlungstag] = z.bestellungen[1]
  assert.deepEqual([nr, version, bestelltag, zahlungstag], ['1002', 1, '2024-12-31', '2025-01-02'])
  assert.deepEqual(z.zahlungen.filter((x) => x[0] === '1002').map((x) => [x[2], x[4]]), [['eingang', 50], ['erstattung', 10]])
  assert.equal(z.bestellungen[0][12], 'DE') // nur das Land bleibt (Globus, EU-Grenze)
})

test('quelleVon ändert sich mit den Quellen', () => {
  assert.equal(idx.quelleVon([1, 'a']), idx.quelleVon([1, 'a']))
  assert.notEqual(idx.quelleVon([1, 'a']), idx.quelleVon([2, 'a']))
})

let erreichbar = false
test.before(async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: process.env.VENDO_DB_URL, connectionTimeoutMillis: 3000 })
  try { await c.connect(); await c.query('DROP SCHEMA IF EXISTS buchhaltung CASCADE'); await c.query("DELETE FROM vendo.schema_version WHERE bereich = 'buchhaltung'").catch(() => {}); erreichbar = true } catch { /* keine Test-Datenbank */ } finally { await c.end().catch(() => {}) }
  if (erreichbar) await datenbank.starten()
})
test.after(() => datenbank.beenden())
const db = () => datenbank.fuerPlugin('buchhaltung')

test('aufbauen + stand + Jahressummen auf den Cent', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  await idx.einrichten(db())
  const anzahl = await idx.aufbauen(db(), idx.zeilenBauen(QUELLEN), 'quelle-1')
  assert.deepEqual(anzahl, { bestellungen: 3, zahlungen: 4, einkaeufe: 1, belege: 1 })
  const s = await idx.stand(db())
  assert.equal(s.quelle, 'quelle-1')
  assert.deepEqual(s.anzahl, anzahl)
  assert.deepEqual(await idx.jahresSummen(db()), [
    { jahr: '2024', anzahl: 2, brutto: 79.9, mwst: 0, wirksam: 79.9 },
    { jahr: '2025', anzahl: 1, brutto: 0, mwst: 0, wirksam: 0 }
  ])
  // zweiter Aufbau ersetzt vollständig (keine Doppelten)
  await idx.aufbauen(db(), idx.zeilenBauen({ ...QUELLEN, shop: QUELLEN.shop.slice(0, 1) }), 'quelle-2')
  assert.equal((await db().abfrage('SELECT count(*)::int AS n FROM buchhaltung.bestellungen')).rows[0].n, 1)
  await idx.aufbauen(db(), idx.zeilenBauen(QUELLEN), 'quelle-1')
})

test('Gegenprobe: gleicher Stand ok, verfälschte, fehlende und zusätzliche Zeilen werden gemeldet', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  const zeilen = idx.zeilenBauen(QUELLEN)
  assert.equal((await idx.pruefen(db(), zeilen)).ok, true)
  await db().abfrage("UPDATE buchhaltung.bestellungen SET brutto = 30.90 WHERE nr = '1001'")
  await db().abfrage("DELETE FROM buchhaltung.einkaeufe WHERE ref = '55'")
  await db().abfrage("INSERT INTO buchhaltung.belege (id, ausgeblendet) VALUES ('r-erfunden', false)")
  const p = await idx.pruefen(db(), zeilen)
  assert.equal(p.ok, false)
  assert.deepEqual(p.tabellen.bestellungen, { fehltOderAnders: ['1001'], nurInDatenbank: ['1001'] })
  assert.deepEqual(p.tabellen.einkaeufe.fehltOderAnders, ['55'])
  assert.deepEqual(p.tabellen.belege.nurInDatenbank, ['r-erfunden'])
  await idx.aufbauen(db(), zeilen, 'quelle-1')
  assert.equal((await idx.pruefen(db(), zeilen)).ok, true)
})

test('Migration der Buchhaltung ist wiederholbar', async (t) => {
  if (!erreichbar) return t.skip('Test-Datenbank nicht erreichbar')
  assert.deepEqual(await idx.einrichten(db()), { vorher: 1, jetzt: 1 })
})
