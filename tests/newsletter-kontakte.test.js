// Newsletter-Plugin, Phase 2: Kontakte.
// Geprüft wird das Zusammenführen (eine Sperre darf ein Sync nicht aufheben), wer als
// Empfänger gilt, Sperren, Freigeben, Löschen und der CSV-Import. Nur erfundene Adressen.

import assert from 'node:assert/strict'
import test from 'node:test'
import kontakte from '../plugins/newsletter/kontakte.js'

const { empfaenger, stand, zusammenfuehren, sperren, freigeben, loeschen, finden, csvLesen, gueltig, zustandErlaubt } = kontakte

const JETZT = 1_700_000_000_000

const ausShopify = [
  { email: 'anna@beispiel.de', vorname: 'Anna', nachname: 'Beispiel', shopifyId: 'gid://1001', quelle: 'shopify', zustimmungAm: '2025-06-01T08:30:00Z' },
  { email: 'bo@beispiel.de', vorname: 'Bo', nachname: '', shopifyId: 'gid://1002', quelle: 'shopify', zustimmungAm: '2025-04-02T11:00:00Z' }
]

// ── Zusammenführen ──

test('zusammenfuehren legt neue Kontakte an', () => {
  const e = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  assert.equal(e.angelegt, 2)
  assert.equal(e.aktualisiert, 0)
  assert.equal(e.liste.length, 2)
  assert.equal(e.liste[0].gesperrt, false)
  assert.equal(e.liste[0].quelle, 'shopify')
  assert.equal(e.liste[0].angelegtAm, JETZT)
})

test('zusammenfuehren aktualisiert Namen und Kundennummer, ohne doppelt anzulegen', () => {
  const erste = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const zweite = zusammenfuehren(erste.liste, [{ email: 'ANNA@beispiel.de', vorname: 'Anna-Lena', shopifyId: 'gid://1001', zustimmungAm: '2025-06-01T08:30:00Z' }], { jetzt: JETZT + 1000 })
  assert.equal(zweite.angelegt, 0)
  assert.equal(zweite.aktualisiert, 1)
  assert.equal(zweite.liste.length, 2)
  const anna = finden(zweite.liste, 'anna@beispiel.de')
  assert.equal(anna.vorname, 'Anna-Lena')
  assert.equal(anna.geaendertAm, JETZT + 1000)
})

test('ein Sync hebt eine Sperre NICHT auf', () => {
  const erste = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const gesperrt = sperren(erste.liste, 'anna@beispiel.de', { grund: 'abgemeldet', jetzt: JETZT })
  const nachSync = zusammenfuehren(gesperrt.liste, ausShopify, { jetzt: JETZT + 5000 })

  assert.equal(nachSync.gesperrtGelassen, 1)
  const anna = finden(nachSync.liste, 'anna@beispiel.de')
  assert.equal(anna.gesperrt, true, 'wer sich abgemeldet hat, bleibt abgemeldet')
  assert.equal(anna.gesperrtGrund, 'abgemeldet')
})

test('ein Sync übernimmt für gesperrte Kontakte die Kundennummer, damit die Abmeldung zurückgeschrieben werden kann', () => {
  const bestand = [{ email: 'anna@beispiel.de', gesperrt: true, shopifyId: null, quelle: 'csv', zustimmungAm: null }]
  const nachSync = zusammenfuehren(bestand, ausShopify, { jetzt: JETZT })
  assert.equal(finden(nachSync.liste, 'anna@beispiel.de').shopifyId, 'gid://1001')
  assert.equal(finden(nachSync.liste, 'anna@beispiel.de').gesperrt, true)
})

test('zusammenfuehren überspringt unbrauchbare Adressen', () => {
  const e = zusammenfuehren([], [{ email: 'keine-adresse' }, { email: '' }, {}, { email: 'gut@beispiel.de', zustimmungAm: '2025-01-01' }], { jetzt: JETZT })
  assert.equal(e.angelegt, 1)
  assert.equal(e.uebersprungen, 3)
})

test('eine vorhandene Zustimmung wird nicht durch eine spätere überschrieben', () => {
  const erste = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const zweite = zusammenfuehren(erste.liste, [{ email: 'anna@beispiel.de', zustimmungAm: '2026-01-01T00:00:00Z' }], { jetzt: JETZT })
  assert.equal(finden(zweite.liste, 'anna@beispiel.de').zustimmungAm, '2025-06-01T08:30:00Z', 'der erste Nachweis bleibt stehen')
})

// ── Empfänger und Stand ──

test('Empfänger ist nur, wer zustimmt und nicht gesperrt ist', () => {
  const liste = [
    { email: 'a@beispiel.de', zustimmungAm: '2025-01-01', gesperrt: false },
    { email: 'b@beispiel.de', zustimmungAm: '2025-01-01', gesperrt: true },
    { email: 'c@beispiel.de', zustimmungAm: null, gesperrt: false }
  ]
  assert.deepEqual(empfaenger(liste).map((k) => k.email), ['a@beispiel.de'])

  const s = stand(liste)
  assert.equal(s.gesamt, 3)
  assert.equal(s.empfaenger, 1)
  assert.equal(s.gesperrt, 1)
  assert.equal(s.ohneZustimmung, 1)
})

// ── Zustand aus Shopify (SUBSCRIBED / PENDING) ──

test('nur SUBSCRIBED ist Empfänger — PENDING heißt: Double-Opt-In noch nicht bestätigt', () => {
  const liste = [
    { email: 'a@beispiel.de', zustimmungAm: '2025-01-01', zustand: 'SUBSCRIBED' },
    { email: 'b@beispiel.de', zustimmungAm: '2025-01-01', zustand: 'PENDING' },
    { email: 'c@beispiel.de', zustimmungAm: '2025-01-01', zustand: 'UNSUBSCRIBED' },
    { email: 'd@beispiel.de', zustimmungAm: '2025-01-01', zustand: null }
  ]
  assert.deepEqual(empfaenger(liste).map((k) => k.email), ['a@beispiel.de', 'd@beispiel.de'], 'ohne Zustand entscheidet weiter das Datum')

  const s = stand(liste)
  assert.equal(s.empfaenger, 2)
  assert.equal(s.offeneBestaetigung, 1)
  assert.equal(s.andererZustand, 1)
  assert.equal(s.ohneZustand, 1)
})

test('zustandErlaubt ist unabhängig von der Schreibweise', () => {
  assert.equal(zustandErlaubt({ zustand: 'subscribed' }), true)
  assert.equal(zustandErlaubt({ zustand: 'SUBSCRIBED' }), true)
  assert.equal(zustandErlaubt({ zustand: 'pending' }), false)
  assert.equal(zustandErlaubt({}), true, 'kein Zustand hinterlegt: wie bisher')
})

test('der Zustand aus Shopify überschreibt den gespeicherten', () => {
  const erste = zusammenfuehren([], [{ email: 'a@beispiel.de', zustimmungAm: '2025-01-01', zustand: 'SUBSCRIBED' }], { jetzt: JETZT })
  assert.equal(empfaenger(erste.liste).length, 1)

  // Beim nächsten Sync steht die Adresse auf PENDING: sie fällt sofort heraus
  const zweite = zusammenfuehren(erste.liste, [{ email: 'a@beispiel.de', zustand: 'PENDING' }], { jetzt: JETZT + 1000 })
  assert.equal(finden(zweite.liste, 'a@beispiel.de').zustand, 'PENDING')
  assert.equal(empfaenger(zweite.liste).length, 0)
})

test('ein CSV-Import bringt keinen Zustand mit und bleibt am Zustimmungsdatum gemessen', () => {
  const e = zusammenfuehren([], [{ email: 'a@beispiel.de', quelle: 'csv', zustimmungAm: '2025-01-15' }], { jetzt: JETZT })
  assert.equal(finden(e.liste, 'a@beispiel.de').zustand, null)
  assert.equal(empfaenger(e.liste).length, 1)
})

test('ohne Zustimmungsdatum ist niemand Empfänger, auch nicht nach einem Import', () => {
  const e = zusammenfuehren([], [{ email: 'ohne@beispiel.de', quelle: 'csv' }], { jetzt: JETZT })
  assert.equal(e.angelegt, 1)
  assert.equal(empfaenger(e.liste).length, 0)
})

// ── Sperren, Freigeben, Löschen ──

test('sperren behält die Adresse in der Liste', () => {
  const e = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const g = sperren(e.liste, 'anna@beispiel.de', { jetzt: JETZT })
  assert.equal(g.ok, true)
  assert.equal(g.liste.length, 2, 'die Adresse bleibt bekannt, damit ein Import sie nicht wieder einsammelt')
  assert.equal(finden(g.liste, 'anna@beispiel.de').gesperrt, true)
})

test('freigeben macht eine Sperre rückgängig', () => {
  const e = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const g = sperren(e.liste, 'anna@beispiel.de', { jetzt: JETZT })
  const f = freigeben(g.liste, 'ANNA@beispiel.de', { jetzt: JETZT })
  assert.equal(f.ok, true)
  assert.equal(finden(f.liste, 'anna@beispiel.de').gesperrt, false)
  assert.equal(finden(f.liste, 'anna@beispiel.de').gesperrtGrund, null)
})

test('loeschen entfernt die Adresse ganz', () => {
  const e = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  const l = loeschen(e.liste, 'anna@beispiel.de')
  assert.equal(l.ok, true)
  assert.equal(l.liste.length, 1)
  assert.equal(finden(l.liste, 'anna@beispiel.de'), null)
})

test('sperren, freigeben und loeschen melden unbekannte Adressen', () => {
  const e = zusammenfuehren([], ausShopify, { jetzt: JETZT })
  assert.equal(sperren(e.liste, 'niemand@beispiel.de', { jetzt: JETZT }).ok, false)
  assert.equal(freigeben(e.liste, 'niemand@beispiel.de', { jetzt: JETZT }).ok, false)
  assert.equal(loeschen(e.liste, 'niemand@beispiel.de').ok, false)
})

// ── CSV ──

test('csvLesen versteht Semikolon, Komma und Tabulator', () => {
  const semikolon = csvLesen('email;vorname;zustimmungam\nanna@beispiel.de;Anna;2025-01-15')
  assert.equal(semikolon.ok, true)
  assert.equal(semikolon.kontakte[0].email, 'anna@beispiel.de')
  assert.equal(semikolon.kontakte[0].vorname, 'Anna')
  assert.equal(semikolon.kontakte[0].zustimmungAm, '2025-01-15')
  assert.equal(semikolon.kontakte[0].quelle, 'csv')

  assert.equal(csvLesen('email,vorname,zustimmungam\nbo@beispiel.de,Bo,2025-02-01').kontakte.length, 1)
  assert.equal(csvLesen('email\tvorname\tzustimmungam\ncem@beispiel.de\tCem\t2025-03-01').kontakte.length, 1)
})

test('csvLesen erkennt englische und andere Spaltennamen', () => {
  const e = csvLesen('E-Mail;First Name;Last Name;Consent\nanna@beispiel.de;Anna;Beispiel;2025-01-15')
  assert.equal(e.kontakte[0].vorname, 'Anna')
  assert.equal(e.kontakte[0].nachname, 'Beispiel')
  assert.equal(e.kontakte[0].zustimmungAm, '2025-01-15')
})

test('csvLesen kommt mit Anführungszeichen und Trennzeichen im Feld zurecht', () => {
  const e = csvLesen('email;nachname;zustimmungam\nanna@beispiel.de;"Beispiel; von";2025-01-15')
  assert.equal(e.kontakte[0].nachname, 'Beispiel; von')
})

test('csvLesen verlangt eine Spalte email', () => {
  const e = csvLesen('name;datum\nAnna;2025-01-15')
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /email/)
})

test('csvLesen nimmt Adressen ohne Zustimmungsdatum auf, weist aber darauf hin', () => {
  const e = csvLesen('email;vorname\nanna@beispiel.de;Anna')
  assert.equal(e.ok, true)
  assert.equal(e.kontakte[0].zustimmungAm, null)
  assert.match(e.fehler.join(' '), /ohne Zustimmungsdatum/)
  assert.equal(empfaenger(zusammenfuehren([], e.kontakte, { jetzt: JETZT }).liste).length, 0)
})

test('csvLesen meldet ungültige Zeilen mit Zeilennummer und macht weiter', () => {
  const e = csvLesen('email;zustimmungam\nkaputt;2025-01-01\ngut@beispiel.de;2025-01-02')
  assert.equal(e.kontakte.length, 1)
  assert.equal(e.kontakte[0].email, 'gut@beispiel.de')
  assert.match(e.fehler.join(' '), /Zeile 2/)
})

test('csvLesen verträgt leere Eingaben', () => {
  assert.equal(csvLesen('').ok, false)
  assert.equal(csvLesen(null).ok, false)
  assert.equal(csvLesen('email;zustimmungam').kontakte.length, 0, 'nur eine Kopfzeile')
})

test('gueltig prüft die Form einer Adresse', () => {
  assert.equal(gueltig('anna@beispiel.de'), true)
  assert.equal(gueltig('ANNA@BEISPIEL.DE'), true)
  assert.equal(gueltig('anna@beispiel'), false)
  assert.equal(gueltig('anna beispiel@x.de'), false)
  assert.equal(gueltig(''), false)
  assert.equal(gueltig(null), false)
})
