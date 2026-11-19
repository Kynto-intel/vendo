// Newsletter-Plugin: Zustellung beobachten, Kampagnen anhalten und fortsetzen.
// Geprüft wird die Ampel je Kampagne (tote Adressen, Ablehnungen wegen Spamverdacht,
// Beschwerden, Abmeldungen im Verhältnis zu den verschickten Mails), dass Vendo bei Rot eine
// laufende Kampagne anhält, bei Gelb nicht, dass Mails angehaltener Kampagnen warten, und dass
// nur Felix fortsetzen kann, ohne dass jemand die Mail doppelt bekommt.
// Alle Zahlen, Kampagnen und Adressen sind erfunden (`.invalid`). Es wird nie eine Verbindung
// aufgebaut: nodemailer und Electrons safeStorage sind Ersatzteile im Speicher, das
// Versandprotokoll liegt in einem frischen Temp-Ordner.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import zustellung from '../plugins/newsletter/zustellung.js'
import protokoll from '../plugins/newsletter/protokoll.js'
import ws from '../plugins/newsletter/warteschlange.js'

// Nie die echten Hermes-Einstellungen (Shopify-Token) lesen: leerer Test-Ordner
process.env.VENDO_TEST_HERMES_HOME ||= `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/vendo-test-ohne-hermes`
const { zaehlen, bewerten, schwerste, MIN_GESENDET, MIN_FUER_ROT, FENSTER } = zustellung
const { protokollLesen } = protokoll
const STUNDE = 3600000
const START = Date.UTC(2026, 10, 16, 8, 0, 0)

const stufeVon = (z) => bewerten(z).stufe

// ── Bewerten ──

test('ohne Auffälligkeiten grün', () => {
  assert.deepEqual(bewerten({ gesendet: 500 }), { stufe: 'gruen', gruende: [] })
  assert.equal(stufeVon({ gesendet: 500, hart: 5 }), 'gruen', '1 % tote Adressen ist unauffällig')
})

test('tote Adressen: ab 2 % gelb, ab 5 % rot', () => {
  assert.equal(stufeVon({ gesendet: 100, hart: 2 }), 'gelb')
  assert.equal(stufeVon({ gesendet: 100, hart: 5 }), 'rot')
  const b = bewerten({ gesendet: 100, hart: 5 })
  assert.equal(b.gruende[0].art, 'hart')
  assert.match(b.gruende[0].text, /5 tote Adressen bei 100 verschickten Mails \(5 %\)/)
  assert.match(b.gruende[0].rat, /gesperrt/)
})

test('rot erst ab genug verschickten Mails und Ereignissen, sonst gelb', () => {
  assert.equal(stufeVon({ gesendet: MIN_GESENDET - 1, hart: 10 }), 'gelb', 'am Anfang hält ein Ausreißer nichts an')
  assert.equal(stufeVon({ gesendet: 50, beschwerde: MIN_FUER_ROT - 1 }), 'gelb', 'zwei Beschwerden reichen nicht zum Anhalten')
  assert.equal(stufeVon({ gesendet: 0, abgelehnt: 1 }), 'gelb', 'Ereignisse ohne gezählten Versand: beobachten')
})

test('Beschwerden nach Gmail-Richtwerten, Ablehnungen streng', () => {
  assert.equal(stufeVon({ gesendet: 800, beschwerde: 1 }), 'gelb', '0,125 %')
  assert.equal(stufeVon({ gesendet: 800, beschwerde: 3 }), 'rot', '0,375 % liegt über 0,3 %')
  assert.equal(stufeVon({ gesendet: 100, abgelehnt: 1 }), 'gelb')
  assert.equal(stufeVon({ gesendet: 100, abgelehnt: 3 }), 'rot')
})

test('Abmeldungen machen höchstens gelb, nie rot', () => {
  assert.equal(stufeVon({ gesendet: 100, abmeldung: 40 }), 'gelb')
})

test('der schwerste Grund steht vorn, jeder Grund hat einen Rat', () => {
  const b = bewerten({ gesendet: 200, hart: 5, abgelehnt: 7, abmeldung: 3 })
  assert.equal(b.stufe, 'rot')
  assert.deepEqual(
    b.gruende.map((g) => [g.art, g.stufe]),
    [
      ['abgelehnt', 'rot'],
      ['hart', 'gelb'],
      ['abmeldung', 'gelb']
    ]
  )
  for (const g of b.gruende) assert.ok(g.rat.length > 20)
  assert.equal(schwerste(['gruen', 'gelb', 'gruen']), 'gelb')
  assert.equal(schwerste([]), 'gruen')
})

// ── Zählen ──

test('Ereignisse gehören zur zuletzt davor gestarteten Kampagne, bis 48 Stunden nach ihrem Ende', () => {
  const kampagnen = [
    { id: 'k1', gestartetAm: START, fertigAm: START + 2 * STUNDE },
    { id: 'k2', gestartetAm: START + 100 * STUNDE }
  ]
  const ereignisse = [
    { am: START - STUNDE, art: 'hart' }, // vor jeder Kampagne
    { am: START + STUNDE, art: 'hart' },
    { am: START + 2 * STUNDE + FENSTER - 1, art: 'abgelehnt' },
    { am: START + 2 * STUNDE + FENSTER + 1, art: 'hart' }, // zu spät für k1, zu früh für k2
    { am: START + 101 * STUNDE, art: 'beschwerde' },
    { am: START + 101 * STUNDE, art: 'unbekannt' }
  ]
  const kontakte = [
    { email: 'a@kunden.invalid', gesperrt: true, gesperrtAm: START + STUNDE }, // Abmeldung
    { email: 'b@kunden.invalid', gesperrt: true, gesperrtAm: START + STUNDE, sperrArt: 'ruecklaeufer' },
    { email: 'c@kunden.invalid', gesperrt: false }
  ]
  const z = zaehlen({ kampagnen, ereignisse, kontakte, gesendet: { k1: 120 }, jetzt: START + 102 * STUNDE })
  assert.deepEqual(z.k1, { gesendet: 120, hart: 1, abgelehnt: 1, beschwerde: 0, weich: 0, abmeldung: 1 })
  assert.deepEqual(z.k2, { gesendet: 0, hart: 0, abgelehnt: 0, beschwerde: 1, weich: 0, abmeldung: 0 })
})

test('eine laufende Kampagne zählt bis jetzt, kaputte Eingaben stören nicht', () => {
  const z = zaehlen({ kampagnen: [{ id: 'k1', gestartetAm: START }], ereignisse: [{ am: START + 500 * STUNDE, art: 'hart' }], jetzt: START + 500 * STUNDE })
  assert.equal(z.k1.hart, 1)
  assert.deepEqual(zaehlen({ kampagnen: null, ereignisse: 'x', kontakte: undefined }), {})
})

// ── Zusammenspiel in haupt.js ──

const require = createRequire(import.meta.url)
const ersatz = (pfad, exports) => {
  require.cache[pfad] = { id: pfad, filename: pfad, loaded: true, exports }
}
ersatz(require.resolve('electron'), {
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (t) => Buffer.from(`test:${t}`),
    decryptString: (b) => Buffer.from(b).toString().slice(5)
  }
})
const gesendet = []
ersatz(require.resolve('nodemailer'), {
  createTransport: () => ({
    sendMail: async (mail) => {
      gesendet.push(mail.to)
      return { messageId: 'x' }
    },
    close() {}
  })
})
const { default: starten } = await import('../plugins/newsletter/haupt.js')

const kontakt = (email) => ({ email, vorname: '', nachname: '', quelle: 'shopify', zustand: 'SUBSCRIBED', zustimmungAm: '2026-01-01', gesperrt: false })
const KAMPAGNE = { id: 'k1', name: 'Herbst', betreff: 'Neu', html: '<p>Hallo</p>', zustand: 'laeuft' }

// Ein Protokoll mit `anzahl` verschickten Mails der Kampagne k1, kurz nach ihrem Start
function protokollOrdner(start, anzahl) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-newsletter-zustellung-'))
  const zeilen = Array.from({ length: anzahl }, (_, i) => JSON.stringify({ zeit: new Date(start + 1000 + i).toISOString(), an: `k***${i}@kunden.invalid`, betreff: 'Neu', art: 'kampagne', kampagneId: 'k1', ok: true }))
  const d = new Date(start)
  const datei = `protokoll-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.ndjson`
  if (anzahl) fs.writeFileSync(path.join(ordner, datei), `${zeilen.join('\n')}\n`)
  return ordner
}

function hauptStarten({ verschickt = 100, ereignisse = [], warteschlange = [], kampagne = {}, kontakteListe = null } = {}) {
  const start = Date.now() - 2 * STUNDE
  const protokollPfad = protokollOrdner(start, verschickt)
  let daten = {
    zugang: { benutzer: 'info@beispiel.invalid', passwortVerschluesselt: Buffer.from('test:nur-ein-test-passwort').toString('base64') },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.invalid', farben: {} },
    kontakte: kontakteListe || [kontakt('kim@kunden.invalid'), kontakt('lou@kunden.invalid')],
    kampagnen: [{ ...KAMPAGNE, gestartetAm: start, ...kampagne }],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange,
    ruecklaeufer: ereignisse.map((e) => ({ am: start + STUNDE, email: 'x@kunden.invalid', ...e }))
  }
  const fn = {}
  starten({
    datenLaden: () => JSON.parse(JSON.stringify(daten)),
    datenSpeichern: (d) => {
      daten = JSON.parse(JSON.stringify(d))
    },
    bereitstellen: (name, f) => {
      fn[name] = f
    },
    fragen: async () => '',
    eingangOrdner: false,
    protokollOrdner: protokollPfad
  })
  return { fn, daten: () => daten, aendern: (f) => f(daten), protokollPfad }
}

const harte = (n) => Array.from({ length: n }, () => ({ art: 'hart' }))
const k1 = (h) => h.daten().kampagnen.find((k) => k.id === 'k1')

test('bei Rot hält Vendo eine laufende Kampagne an und nennt den Grund', () => {
  const h = hauptStarten({ verschickt: 100, ereignisse: harte(6) })
  assert.equal(h.fn.zustellungPruefen().angehalten, 1)
  const k = k1(h)
  assert.equal(k.zustand, 'pausiert')
  assert.equal(k.pausiertVon, 'vendo')
  assert.match(k.pausiertGrund, /6 tote Adressen bei 100 verschickten Mails/)
})

test('bei Gelb hält Vendo nichts an', () => {
  const h = hauptStarten({ verschickt: 100, ereignisse: harte(3) })
  assert.equal(h.fn.zustellungPruefen().angehalten, 0)
  assert.equal(k1(h).zustand, 'laeuft')
  assert.equal(h.fn.zustellungLesen().stufe, 'gelb')
})

test('Mails einer angehaltenen Kampagne warten, andere gehen weiter', async () => {
  const liste = ws.einreihen([], [
    { kampagneId: 'k1', an: 'kim@kunden.invalid' },
    { an: 'info@beispiel.invalid', betreff: 'Probe', html: '<p>x</p>', art: 'test' }
  ]).liste
  const h = hauptStarten({ verschickt: 100, ereignisse: harte(6), warteschlange: liste })
  h.fn.zustellungPruefen()
  gesendet.length = 0
  await h.fn.warteschlangeSchritt()
  await h.fn.warteschlangeSchritt()
  assert.deepEqual(gesendet, ['info@beispiel.invalid'], 'nur die Testmail, nicht die Kampagnenmail')
  assert.ok(
    protokollLesen({ anzahl: 10, ordner: h.protokollPfad }).some((e) => e.art === 'test' && e.ok),
    'Testmail-Protokoll bleibt im temporären Ordner'
  )
  assert.equal(h.daten().warteschlange.find((e) => e.kampagneId === 'k1').zustand, 'offen')
  h.fn.kampagnenPflegen()
  assert.equal(k1(h).zustand, 'pausiert', 'eine angehaltene Kampagne wird nicht als fertig abgeschlossen')
})

test('eine angehaltene Kampagne lässt sich weder ändern noch neu starten', () => {
  const h = hauptStarten({ verschickt: 100, ereignisse: harte(6) })
  h.fn.zustellungPruefen()
  assert.equal(h.fn.kampagneSpeichern({ id: 'k1', name: 'Herbst', betreff: 'Anders', html: '<p>anders</p>' }).ok, false)
  assert.equal(h.fn.kampagneLoeschen('k1').ok, false)
  const start = h.fn.kampagneStarten('k1')
  assert.equal(start.ok, false)
})

test('Fortsetzen: Felix entscheidet, niemand bekommt die Mail doppelt, Vendo hält nicht noch einmal an', async () => {
  const jetzt = Date.now()
  const [schon, verfallen, wartet] = ws.einreihen([], [
    { kampagneId: 'k1', an: 'ana@kunden.invalid' },
    { kampagneId: 'k1', an: 'kim@kunden.invalid' },
    { kampagneId: 'k1', an: 'lou@kunden.invalid' }
  ]).liste
  const liste = [
    { ...schon, zustand: 'gesendet', erledigtAm: jetzt },
    { ...verfallen, zustand: 'abgelaufen', erledigtAm: jetzt, letzterFehler: 'Verfallsfrist abgelaufen' },
    { ...wartet, verfaelltAm: jetzt + 1000 }
  ]
  const h = hauptStarten({
    verschickt: 100,
    ereignisse: harte(6),
    warteschlange: liste,
    kontakteListe: [kontakt('ana@kunden.invalid'), kontakt('kim@kunden.invalid'), kontakt('lou@kunden.invalid')]
  })
  h.fn.zustellungPruefen()
  const r = h.fn.kampagneFortsetzen('k1')
  assert.equal(r.ok, true, r.text)
  const k = k1(h)
  assert.equal(k.zustand, 'laeuft')
  assert.equal(k.automatischAnhaltenAus, true)
  const schlange = h.daten().warteschlange.filter((e) => e.kampagneId === 'k1')
  assert.equal(schlange.filter((e) => e.an === 'ana@kunden.invalid').length, 1, 'wer die Mail hat, wird nicht neu eingereiht')
  assert.ok(schlange.some((e) => e.an === 'kim@kunden.invalid' && e.zustand === 'offen'), 'Verfallenes kommt neu in die Schlange')
  assert.ok(schlange.find((e) => e.an === 'lou@kunden.invalid' && e.zustand === 'offen').verfaelltAm > jetzt + 47 * STUNDE, 'Wartendes bekommt eine frische Frist')
  assert.equal(h.fn.zustellungPruefen().angehalten, 0, 'Felix hat entschieden')
  assert.equal(h.fn.zustellungLesen().kampagnen[0].automatischAnhaltenAus, true)
})

test('von Hand anhalten und fortsetzen lässt die automatische Prüfung an', () => {
  const h = hauptStarten({ verschickt: 100 })
  assert.equal(h.fn.kampagneAnhalten('k1').ok, true)
  assert.equal(k1(h).pausiertVon, 'felix')
  assert.equal(h.fn.kampagneAnhalten('k1').ok, false, 'zweimal anhalten geht nicht')
  assert.equal(h.fn.kampagneFortsetzen('k1').ok, true)
  assert.equal(k1(h).automatischAnhaltenAus, false)
  assert.equal(h.fn.kampagneFortsetzen('k1').ok, false, 'eine laufende Kampagne kann nicht fortgesetzt werden')
})

test('Abbrechen geht auch bei einer angehaltenen Kampagne', () => {
  const liste = ws.einreihen([], [{ kampagneId: 'k1', an: 'kim@kunden.invalid' }]).liste
  const h = hauptStarten({ verschickt: 100, ereignisse: harte(6), warteschlange: liste })
  h.fn.zustellungPruefen()
  assert.equal(h.fn.kampagneAbbrechen('k1').ok, true)
  assert.equal(k1(h).zustand, 'abgebrochen')
  assert.equal(h.daten().warteschlange[0].zustand, 'abgelaufen')
})

test('zustellungLesen und die Ergebnisliste liefern Ampel, Gründe und Rat', () => {
  const h = hauptStarten({ verschickt: 100, ereignisse: [...harte(6), { art: 'abgelehnt' }] })
  h.fn.zustellungPruefen()
  const z = h.fn.zustellungLesen()
  assert.equal(z.stufe, 'rot')
  const k = z.kampagnen[0]
  assert.equal(k.zustand, 'pausiert')
  assert.equal(k.pausiertVon, 'vendo')
  assert.equal(k.zahlen.gesendet, 100)
  assert.ok(k.gruende.every((g) => g.rat))
  assert.equal(JSON.stringify(z).includes('@'), false, 'keine Adressen')
  const zeile = h.fn.kampagnenErgebnisse().zeilen[0]
  assert.equal(zeile.zustellung.stufe, 'rot')
})
