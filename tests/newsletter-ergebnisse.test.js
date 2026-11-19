// Newsletter-Plugin, Phase 5 Schritt 1: was jede Mail gebracht hat.
// Geprüft wird die Zuordnung von Bestellungen zu Mails über die UTM-Angaben (letzter Besuch
// vor erstem, fremde Quellen ignoriert, Stornos, noch nicht ausgewertete Bestellungen),
// eindeutige Kurznamen bei gleichnamigen Kampagnen, die Abmeldungen nach einem Versand, das
// Abruf-Fenster, die Shopify-Abfrage und das Zusammenspiel in haupt.js.
// Alle Bestellungen, Beträge und Adressen sind erfunden. Shopify ist ein fetch-Ersatz,
// Electrons safeStorage ein Ersatz im Speicher; es wird nichts verschickt.

import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ergebnisse from '../plugins/newsletter/ergebnisse.js'
import shopify from '../plugins/newsletter/shopify.js'

// Nie die echten Hermes-Einstellungen (Shopify-Token) lesen: leerer Test-Ordner
process.env.VENDO_TEST_HERMES_HOME ||= `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/vendo-test-ohne-hermes`
const { zielSchluessel, kurznameVergeben, nameMerken, kurzVon, bestellungenAufnehmen, jeKurzname, jeZiel, abmeldungenNachVersand, abrufSeit, gesendetJeKampagne, kampagnenZeilen, autoSchluesselLesen, gesendetJeAutomationsschritt, serienEnden, automationenZeilen } = ergebnisse
const { ergebnisBestellungenHolen, ergebnisBestellungAus, ERGEBNISSE } = shopify

const TAG = 86400000
const STUNDE = 3600000
const JETZT = Date.UTC(2026, 10, 20, 12, 0, 0)
const ZUGANG = { shop: 'beispielshop.myshopify.com', token: 'shpat_abcdefghijklmnopqrstuvwxyz1234' }

const vendo = (campaign) => ({ source: 'vendo', medium: 'email', campaign })
const bestellung = (id, { letzter = null, erster = null, betrag = 50, am = JETZT - TAG, ...rest } = {}) => ({ id, am, betrag, waehrung: 'EUR', bereit: true, storniert: false, letzter, erster, ...rest })

// ── Zuordnung ──

test('der letzte Besuch zählt vor dem ersten, fremde Quellen gar nicht', () => {
  assert.equal(kurzVon({ letzter: vendo('herbst'), erster: vendo('sommer') }), 'herbst')
  assert.equal(kurzVon({ letzter: { source: 'google', campaign: 'x' }, erster: vendo('sommer') }), 'sommer', 'kam zuletzt über Google, zuerst über die Mail')
  assert.equal(kurzVon({ letzter: { source: 'instagram', campaign: 'herbst' } }), null)
  assert.equal(kurzVon({ letzter: { source: 'vendo', campaign: '' } }), null)
  assert.equal(kurzVon({ letzter: { source: 'VENDO', campaign: 'Herbst Neu' } }), 'herbst-neu', 'Groß/klein und Leerzeichen wie beim Anhängen')
  assert.equal(kurzVon({}), null)
})

test('bestellungenAufnehmen nimmt nur Vendo-Bestellungen, ohne Kundenfelder, jede einmal', () => {
  const neue = [
    bestellung('o1', { letzter: vendo('herbst'), betrag: 59.99, email: 'kundin@beispiel.de' }),
    bestellung('o2', { letzter: { source: 'google', campaign: 'x' } }),
    bestellung('o3', {}),
    bestellung('o1', { letzter: vendo('herbst'), betrag: 59.99 })
  ]
  const r = bestellungenAufnehmen([], neue, { jetzt: JETZT })
  assert.equal(r.aufgenommen, 1)
  assert.deepEqual(r.liste, [{ id: 'o1', kurz: 'herbst', betrag: 59.99, waehrung: 'EUR', am: JETZT - TAG }])
  assert.equal(JSON.stringify(r.liste).includes('@'), false, 'keine Adresse gespeichert')

  const nochmal = bestellungenAufnehmen(r.liste, neue, { jetzt: JETZT })
  assert.equal(nochmal.aufgenommen, 0, 'der überlappende Abruf zählt nichts doppelt')
  assert.equal(nochmal.liste.length, 1)
})

test('noch nicht ausgewertete Bestellungen kommen später, Stornos fallen heraus', () => {
  const offen = bestellungenAufnehmen([], [bestellung('o1', { letzter: vendo('herbst'), bereit: false })], { jetzt: JETZT })
  assert.equal(offen.liste.length, 0)
  const spaeter = bestellungenAufnehmen(offen.liste, [bestellung('o1', { letzter: vendo('herbst') })], { jetzt: JETZT })
  assert.equal(spaeter.liste.length, 1)
  const storniert = bestellungenAufnehmen(spaeter.liste, [bestellung('o1', { letzter: vendo('herbst'), storniert: true })], { jetzt: JETZT })
  assert.equal(storniert.liste.length, 0)
  assert.equal(storniert.entfernt, 1)
})

test('sehr alte Bestellungen fallen nach zwei Jahren heraus', () => {
  const alt = [{ id: 'alt', kurz: 'herbst', betrag: 10, waehrung: 'EUR', am: JETZT - 800 * TAG }]
  assert.equal(bestellungenAufnehmen(alt, [], { jetzt: JETZT }).liste.length, 0)
})

// ── Kurznamen ──

test('eine gleichnamige neue Kampagne bekommt einen eigenen Kurznamen', () => {
  let namen = {}
  const a = kurznameVergeben(namen, 'Herbst', { art: 'kampagne', id: 'k1' })
  assert.equal(a, 'herbst')
  namen = nameMerken(namen, a, { art: 'kampagne', id: 'k1' }, { jetzt: JETZT }).namen
  assert.equal(kurznameVergeben(namen, 'Herbst', { art: 'kampagne', id: 'k1' }), 'herbst', 'dieselbe Kampagne behält ihren')
  const b = kurznameVergeben(namen, 'Herbst', { art: 'kampagne', id: 'k2' })
  assert.equal(b, 'herbst-2')
  namen = nameMerken(namen, b, { art: 'kampagne', id: 'k2' }, { jetzt: JETZT }).namen
  assert.equal(kurznameVergeben(namen, 'Herbst', { art: 'kampagne', id: 'k3' }), 'herbst-3')
})

test('ein Kurzname wechselt nie die Mail', () => {
  const namen = nameMerken({}, 'herbst', { art: 'kampagne', id: 'k1' }, { jetzt: JETZT }).namen
  const nochmal = nameMerken(namen, 'herbst', { art: 'kampagne', id: 'k2' }, { jetzt: JETZT })
  assert.equal(nochmal.neu, false)
  assert.equal(nochmal.namen.herbst.id, 'k1')
  assert.equal(nameMerken({}, 'x', { art: 'unsinn' }).neu, false, 'unbekannte Ziele werden nicht gemerkt')
})

test('jeZiel fasst Kurznamen derselben Mail zusammen, auch nach einer Umbenennung', () => {
  const namen = {
    herbst: { art: 'kampagne', id: 'k1', seit: 1 },
    'herbstaktion': { art: 'kampagne', id: 'k1', seit: 2 },
    'warenkorb-abgebrochen-schritt-1': { art: 'automation', id: 'a1', schritt: 1, seit: 1 }
  }
  const liste = [
    { id: 'o1', kurz: 'herbst', betrag: 50, waehrung: 'EUR', am: 10 },
    { id: 'o2', kurz: 'herbstaktion', betrag: 30.5, waehrung: 'EUR', am: 20 },
    { id: 'o3', kurz: 'warenkorb-abgebrochen-schritt-1', betrag: 20, waehrung: 'EUR', am: 15 },
    { id: 'o4', kurz: 'gibt-es-nicht', betrag: 5, waehrung: 'EUR', am: 5 }
  ]
  const r = jeZiel(liste, namen)
  assert.deepEqual(r.ziele['kampagne:k1'], { bestellungen: 2, umsatz: 80.5, waehrung: 'EUR', erste: 10, letzte: 20 })
  assert.equal(r.ziele['automation:a1:1'].umsatz, 20)
  assert.equal(r.ohneMail.bestellungen, 1)
  assert.equal(jeKurzname(liste).herbst.bestellungen, 1)
  assert.equal(zielSchluessel({ art: 'automation', id: 'a1' }), null, 'ohne Schritt kein Schlüssel')
})

test('Beträge werden auf Cent gerundet, verschiedene Währungen fallen auf', () => {
  const r = jeKurzname([
    { id: 'a', kurz: 'x', betrag: 0.1, waehrung: 'EUR', am: 1 },
    { id: 'b', kurz: 'x', betrag: 0.2, waehrung: 'CHF', am: 2 }
  ])
  assert.equal(r.x.umsatz, 0.3)
  assert.equal(r.x.waehrung, 'gemischt')
})

// ── Abmeldungen nach dem Versand ──

test('Abmeldungen zählen 48 Stunden nach dem Versand, für die zuletzt gestartete Kampagne', () => {
  const kampagnen = [
    { id: 'k1', gestartetAm: JETZT - 10 * TAG, fertigAm: JETZT - 10 * TAG + 3 * STUNDE },
    { id: 'k2', gestartetAm: JETZT - 2 * TAG },
    { id: 'entwurf', gestartetAm: null }
  ]
  const kontakte = [
    { email: 'a@beispiel.de', gesperrt: true, gesperrtAm: JETZT - 10 * TAG + 5 * STUNDE }, // k1
    { email: 'b@beispiel.de', gesperrt: true, gesperrtAm: JETZT - 10 * TAG + 50 * STUNDE }, // k1: 47 h nach Ende
    { email: 'c@beispiel.de', gesperrt: true, gesperrtAm: JETZT - 6 * TAG }, // zu spät für k1
    { email: 'd@beispiel.de', gesperrt: true, gesperrtAm: new Date(JETZT - TAG).toISOString() }, // k2, als Text
    { email: 'e@beispiel.de', gesperrt: false, gesperrtAm: JETZT - TAG },
    { email: 'f@beispiel.de', gesperrt: true, gesperrtAm: JETZT - 30 * TAG } // vor jeder Kampagne
  ]
  assert.deepEqual(abmeldungenNachVersand(kampagnen, kontakte), { k2: 1, k1: 2 })
})

// ── Abruf-Fenster ──

test('ohne verschickte Mail wird Shopify gar nicht gefragt, danach drei Tage überlappend', () => {
  assert.equal(abrufSeit({ namen: {} }, { jetzt: JETZT }), null)
  const namen = { herbst: { art: 'kampagne', id: 'k1', seit: JETZT - 10 * TAG } }
  assert.equal(abrufSeit({ namen }, { jetzt: JETZT }), JETZT - 10 * TAG, 'erster Abruf ab der ersten Mail')
  assert.equal(abrufSeit({ namen, geholtAm: JETZT - TAG }, { jetzt: JETZT }), JETZT - 4 * TAG)
  assert.equal(abrufSeit({ namen: { x: { art: 'kampagne', id: 'k', seit: JETZT - TAG } }, geholtAm: JETZT - TAG }, { jetzt: JETZT }), JETZT - TAG, 'nie vor der ersten Mail')
})

// ── Ergebnisliste je Kampagne (Schritt 2) ──

test('gesendetJeKampagne zählt nur erfolgreich verschickte Kampagnenmails', () => {
  const protokoll = [
    { kampagneId: 'k1', art: 'kampagne', ok: true },
    { kampagneId: 'k1', art: 'kampagne', ok: true },
    { kampagneId: 'k1', art: 'kampagne', ok: false },
    { kampagneId: 'k1', art: 'test', ok: true },
    { kampagneId: 'k2', art: 'kampagne', ok: true },
    { kampagneId: null, art: 'kampagne', ok: true },
    null
  ]
  assert.deepEqual(gesendetJeKampagne(protokoll), { k1: 2, k2: 1 })
})

test('kampagnenZeilen: nur verschickte, die neueste oben, Umsatz je 100 Empfänger', () => {
  const zeilen = kampagnenZeilen({
    kampagnen: [
      { id: 'alt', name: 'Sommer', betreff: 'Leicht', zustand: 'fertig', gestartetAm: JETZT - 30 * TAG },
      { id: 'neu', name: 'Herbst', betreff: 'Schwer', zustand: 'laeuft', gestartetAm: JETZT - TAG },
      { id: 'entwurf', name: 'Winter', zustand: 'entwurf', gestartetAm: null }
    ],
    ziele: { 'kampagne:alt': { bestellungen: 3, umsatz: 150, waehrung: 'EUR' } },
    abmeldungen: { alt: 2 },
    gesendet: { alt: 400, neu: 0 }
  })
  assert.deepEqual(zeilen.map((z) => z.id), ['neu', 'alt'])
  assert.deepEqual(zeilen[1], { id: 'alt', name: 'Sommer', betreff: 'Leicht', zustand: 'fertig', gestartetAm: JETZT - 30 * TAG, empfaenger: 400, bestellungen: 3, umsatz: 150, waehrung: 'EUR', jeHundert: 37.5, abmeldungen: 2 })
  assert.equal(zeilen[0].jeHundert, null, 'ohne Empfänger kein Wert statt 0')
  assert.equal(zeilen[0].umsatz, 0)
  assert.deepEqual(kampagnenZeilen(), [])
})

// ── Automationen (Schritt 3) ──

test('autoSchluesselLesen versteht das neue und das alte Format', () => {
  assert.deepEqual(autoSchluesselLesen('auto:a1:l7:0'), { automationId: 'a1', schritt: 1 })
  assert.deepEqual(autoSchluesselLesen('auto:l7:1', { l7: 'a1' }), { automationId: 'a1', schritt: 2 }, 'alt: über den Lauf')
  assert.equal(autoSchluesselLesen('auto:l7:1', {}), null, 'alt und Lauf schon aufgeräumt: nicht zuzuordnen')
  assert.equal(autoSchluesselLesen('k123'), null, 'eine Kampagne ist keine Automation')
  assert.equal(autoSchluesselLesen('auto:a1:l7:x'), null)
  assert.equal(autoSchluesselLesen(null), null)
})

test('gesendetJeAutomationsschritt zählt nur erfolgreiche Automationsmails', () => {
  const protokoll = [
    { kampagneId: 'auto:a1:l1:0', art: 'kampagne', ok: true },
    { kampagneId: 'auto:a1:l2:0', art: 'kampagne', ok: true },
    { kampagneId: 'auto:a1:l1:1', art: 'kampagne', ok: true },
    { kampagneId: 'auto:a1:l3:0', art: 'kampagne', ok: false },
    { kampagneId: 'auto:l9:0', art: 'kampagne', ok: true },
    { kampagneId: 'k1', art: 'kampagne', ok: true }
  ]
  assert.deepEqual(gesendetJeAutomationsschritt(protokoll, [{ id: 'l9', automationId: 'a2' }]), {
    'automation:a1:1': 2,
    'automation:a1:2': 1,
    'automation:a2:1': 1
  })
})

test('serienEnden ordnet die Abbruchgründe ein', () => {
  const laeufe = [
    { automationId: 'a1', zustand: 'laeuft' },
    { automationId: 'a1', zustand: 'fertig' },
    { automationId: 'a1', zustand: 'abgebrochen', abbruchGrund: 'Bestellung eingegangen' },
    { automationId: 'a1', zustand: 'abgebrochen', abbruchGrund: 'abgemeldet' },
    { automationId: 'a1', zustand: 'abgebrochen', abbruchGrund: 'Der Kontakt ist abgemeldet.' },
    { automationId: 'a1', zustand: 'abgebrochen', abbruchGrund: 'zu spät (Verfallsfenster abgelaufen)' },
    { automationId: 'a1', zustand: 'abgebrochen', abbruchGrund: 'Automation abgeschaltet' },
    { automationId: 'a2', zustand: 'fertig' },
    { zustand: 'fertig' }
  ]
  const r = serienEnden(laeufe)
  assert.deepEqual(r.a1, { laufen: 1, kauf: 1, abmeldung: 2, zuSpaet: 1, durchgelaufen: 1, sonstige: 1 })
  assert.equal(r.a2.durchgelaufen, 1)
})

test('automationenZeilen: je Schritt gesendet, Umsatz, je 100 Empfänger', () => {
  const zeilen = automationenZeilen({
    automationen: [{ id: 'a1', name: 'Warenkorb', aktiv: true, schritte: [{ betreff: 'Vergessen?' }, { betreff: 'Noch da?' }] }],
    ziele: { 'automation:a1:1': { bestellungen: 2, umsatz: 90, waehrung: 'EUR' } },
    gesendet: { 'automation:a1:1': 40 },
    enden: { a1: { laufen: 3, kauf: 2, abmeldung: 0, zuSpaet: 1, durchgelaufen: 5, sonstige: 0 } }
  })
  assert.equal(zeilen.length, 1)
  assert.deepEqual(zeilen[0].schritte[0], { schritt: 1, betreff: 'Vergessen?', gesendet: 40, bestellungen: 2, umsatz: 90, waehrung: 'EUR', jeHundert: 225 })
  assert.deepEqual(zeilen[0].schritte[1], { schritt: 2, betreff: 'Noch da?', gesendet: 0, bestellungen: 0, umsatz: 0, waehrung: '', jeHundert: null })
  assert.equal(zeilen[0].enden.kauf, 2)
  assert.equal(automationenZeilen({ automationen: [{ id: 'a2', schritte: [] }] })[0].enden.laufen, 0, 'ohne Läufe stehen Nullen')
})

// ── Shopify ──

function fetchErsatz(antworten) {
  const anfragen = []
  let i = 0
  const holen = async (url, optionen) => {
    anfragen.push({ url, koerper: JSON.parse(optionen.body) })
    const naechste = antworten[Math.min(i++, antworten.length - 1)]
    if (typeof naechste === 'number') return { ok: false, status: naechste, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => naechste }
  }
  return { holen, anfragen }
}

const knoten = (id, { campaign = 'herbst', source = 'vendo', betrag = '49.90', ready = true, cancelledAt = null, ohneWeg = false } = {}) => ({
  id: `gid://shopify/Order/${id}`,
  createdAt: new Date(JETZT - TAG).toISOString(),
  cancelledAt,
  totalPriceSet: { shopMoney: { amount: betrag, currencyCode: 'EUR' } },
  customerJourneySummary: ohneWeg ? null : { ready, firstVisit: null, lastVisit: { utmParameters: { source, medium: 'email', campaign } } }
})
const seite = (nodes, weiter = false) => ({ data: { orders: { pageInfo: { hasNextPage: weiter, endCursor: weiter ? 'c2' : null }, nodes } } })

test('die Abfrage fragt Bestellungen mit Weg und Betrag, aber kein Kundenfeld', () => {
  assert.match(ERGEBNISSE, /customerJourneySummary/)
  assert.match(ERGEBNISSE, /utmParameters \{ source medium campaign \}/)
  assert.doesNotMatch(ERGEBNISSE, /customer\s*\{|email/, 'niemand namentlich')
})

test('ergebnisBestellungenHolen blättert, filtert nach Datum und liest die UTM-Angaben', async () => {
  const { holen, anfragen } = fetchErsatz([seite([knoten(1), knoten(2, { source: 'google' })], true), seite([knoten(3, { ohneWeg: true })])])
  const r = await ergebnisBestellungenHolen({ ...ZUGANG, seit: JETZT - 3 * TAG, holen })
  assert.equal(r.ok, true)
  assert.equal(r.bestellungen.length, 3)
  assert.match(anfragen[0].koerper.variables.filter, /^created_at:>'2026-11-17/)
  assert.equal(anfragen[1].koerper.variables.cursor, 'c2')
  assert.deepEqual(r.bestellungen[0].letzter, { source: 'vendo', medium: 'email', campaign: 'herbst' })
  assert.equal(r.bestellungen[0].betrag, 49.9)
  assert.equal(r.bestellungen[2].letzter, null, 'ohne Weg keine Angaben, aber kein Absturz')
})

test('ergebnisBestellungAus übernimmt Storno und „noch nicht ausgewertet“', () => {
  assert.equal(ergebnisBestellungAus(knoten(1, { ready: false })).bereit, false)
  assert.equal(ergebnisBestellungAus(knoten(1, { cancelledAt: '2026-11-19T10:00:00Z' })).storniert, true)
  assert.equal(ergebnisBestellungAus({ id: 'x', createdAt: 'kaputt' }), null)
})

test('ergebnisBestellungenHolen gibt Fehler von Shopify weiter', async () => {
  const r = await ergebnisBestellungenHolen({ ...ZUGANG, seit: JETZT, holen: fetchErsatz([401]).holen })
  assert.equal(r.ok, false)
  assert.match(r.fehler, /Token/)
})

// ── Zusammenspiel in haupt.js ──
// Ohne Electron gibt es keinen Tresor: `electron.safeStorage` wird für diese Datei durch
// einen Ersatz im Speicher vertreten, bevor haupt.js geladen wird.

const require = createRequire(import.meta.url)
const electronPfad = require.resolve('electron')
require.cache[electronPfad] = {
  id: electronPfad,
  filename: electronPfad,
  loaded: true,
  exports: {
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (t) => Buffer.from(`test:${t}`),
      decryptString: (b) => Buffer.from(b).toString().slice(5)
    }
  }
}
const { default: starten } = await import('../plugins/newsletter/haupt.js')

// Das Versandprotokoll liegt für jeden Test in einem frischen Temp-Ordner — nie das echte
function protokollOrdner(zeilen = []) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-newsletter-ergebnisse-'))
  if (zeilen.length) fs.writeFileSync(path.join(ordner, 'protokoll-2026-11.ndjson'), zeilen.map((z) => JSON.stringify(z)).join('\n') + '\n')
  return ordner
}

function hauptStarten({ bestellungen = () => [], protokoll = [] } = {}) {
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.de', farben: {} },
    shopify: { shop: ZUGANG.shop, primaerDomain: 'beispielshop.de', tokenVerschluesselt: Buffer.from(`test:${ZUGANG.token}`).toString('base64') },
    kontakte: [
      { email: 'kundin@beispiel.de', vorname: 'Kim', quelle: 'shopify', zustimmungAm: '2026-01-01', zustand: 'SUBSCRIBED' },
      { email: 'kunde@beispiel.de', vorname: 'Lou', quelle: 'shopify', zustimmungAm: '2026-01-01', zustand: 'SUBSCRIBED' }
    ],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: []
  }
  const filter = []
  const abrufen = async (url, optionen = {}) => {
    if (!String(url).includes('/graphql.json')) return { ok: false, status: 404, json: async () => ({}) }
    const { query, variables } = JSON.parse(optionen.body)
    if (query.includes('customerJourneySummary')) {
      filter.push(variables.filter)
      return { ok: true, status: 200, json: async () => seite(bestellungen()) }
    }
    return { ok: true, status: 200, json: async () => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [] } } }) }
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
    protokollOrdner: protokollOrdner(protokoll),
    abrufen
  })
  return { fn, daten: () => daten, aendern: (f) => f(daten), filter }
}

const GUTES_HTML = '<p>Hallo {{vorname}}, neu im Shop: <a href="https://beispielshop.de/products/hoodie">Hoodie ansehen</a></p>'

function kampagneGestartet(h, name) {
  const id = h.fn.kampagneAnlegen(name).id
  assert.equal(h.fn.kampagneSpeichern({ id, name, betreff: 'Neu im Shop', vorschauText: 'Schwere Baumwolle', html: GUTES_HTML }).ok, true)
  const r = h.fn.kampagneStarten(id)
  assert.equal(r.ok, true, JSON.stringify(r.fehler))
  return id
}

test('beim Start bekommt die Kampagne ihren Kurznamen und die Zuordnung steht', async () => {
  const h = hauptStarten()
  const id = kampagneGestartet(h, 'Herbst Neu')
  const k = h.daten().kampagnen.find((x) => x.id === id)
  assert.equal(k.utm, 'herbst-neu')
  assert.deepEqual({ ...h.daten().ergebnisse.namen['herbst-neu'], seit: 0 }, { art: 'kampagne', id, seit: 0 })
})

test('eine zweite gleichnamige Kampagne bekommt einen eigenen Kurznamen', () => {
  const h = hauptStarten()
  kampagneGestartet(h, 'Herbst')
  const zweite = kampagneGestartet(h, 'Herbst')
  assert.equal(h.daten().kampagnen.find((x) => x.id === zweite).utm, 'herbst-2')
})

test('ergebnisseHolen ordnet Bestellungen der Kampagne zu und ergebnisseLesen rechnet', async () => {
  const h = hauptStarten({ bestellungen: () => [knoten(1, { campaign: 'herbst', betrag: '59.99' }), knoten(2, { campaign: 'herbst', betrag: '20.01' }), knoten(3, { source: 'google' })] })
  const id = kampagneGestartet(h, 'Herbst')
  const r = await h.fn.ergebnisseHolen()
  assert.equal(r.ok, true)
  assert.equal(r.aufgenommen, 2)
  const gelesen = h.fn.ergebnisseLesen()
  assert.equal(gelesen.ziele[`kampagne:${id}`].bestellungen, 2)
  assert.equal(gelesen.ziele[`kampagne:${id}`].umsatz, 80)
  assert.ok(gelesen.geholtAm)
  assert.equal(JSON.stringify(gelesen).includes('@'), false, 'keine Adressen in den Ergebnissen')

  // Ein zweiter Abruf am selben Tag zählt nichts doppelt
  await h.fn.ergebnisseHolen()
  assert.equal(h.fn.ergebnisseLesen().ziele[`kampagne:${id}`].bestellungen, 2)
})

test('ohne verschickte Mail fragt haupt.js Shopify gar nicht', async () => {
  const h = hauptStarten({ bestellungen: () => [knoten(1)] })
  const r = await h.fn.ergebnisseHolen()
  assert.equal(r.nichts, true)
  assert.equal(h.filter.length, 0)
})

test('ein Automationsschritt merkt sich seinen Kurznamen, wenn er in die Warteschlange geht', async () => {
  const h = hauptStarten()
  h.fn.automationAnlegen('willkommen')
  const a = h.daten().automationen[0]
  h.fn.automationSpeichern({ id: a.id, schritte: [{ nach: 0, verfallNach: TAG, betreff: 'Willkommen', html: GUTES_HTML }] })
  assert.equal(h.fn.automationSchalten({ id: a.id, aktiv: true }).ok, true)
  h.aendern((d) => {
    d.laeufe = [{ id: 'l1', schluessel: 'x', automationId: a.id, email: 'kundin@beispiel.de', schritt: 0, zustand: 'laeuft', faelligAb: Date.now() - 1000, verfaelltAm: Date.now() + TAG }]
  })
  h.fn.laeufeAbarbeiten()
  assert.deepEqual({ ...h.daten().ergebnisse.namen['willkommen-schritt-1'], seit: 0 }, { art: 'automation', id: a.id, schritt: 1, seit: 0 })
  const eintrag = h.daten().warteschlange.find((e) => e.kampagneId === `auto:${a.id}:l1:0`)
  assert.match(eintrag.html, /utm_campaign=willkommen-schritt-1/)
})

// Eine Automation einschalten und einen Lauf für ihren ersten Schritt einreihen
function automationEingereiht(h, laufId) {
  assert.equal(h.fn.automationAnlegen('willkommen').ok, true)
  const a = h.daten().automationen.find((x) => x.art === 'willkommen')
  h.fn.automationSpeichern({ id: a.id, schritte: [{ nach: 0, verfallNach: TAG, betreff: 'Willkommen', html: GUTES_HTML }] })
  assert.equal(h.fn.automationSchalten({ id: a.id, aktiv: true }).ok, true)
  h.aendern((d) => {
    d.laeufe = [{ id: laufId, schluessel: laufId, automationId: a.id, email: 'kundin@beispiel.de', schritt: 0, zustand: 'laeuft', faelligAb: Date.now() - 1000, verfaelltAm: Date.now() + TAG }]
  })
  h.fn.laeufeAbarbeiten()
  return { id: a.id, eintrag: h.daten().warteschlange.find((e) => e.kampagneId === `auto:${a.id}:${laufId}:0`) }
}

test('eine neu angelegte gleichnamige Automation bekommt einen eigenen Kurznamen', () => {
  const h = hauptStarten()
  const alt = automationEingereiht(h, 'l1')
  assert.match(alt.eintrag.html, /utm_campaign=willkommen-schritt-1[&"]/)
  assert.equal(h.fn.automationLoeschen(alt.id).ok, true)

  const neu = automationEingereiht(h, 'l2')
  assert.notEqual(neu.id, alt.id)
  assert.match(neu.eintrag.html, /utm_campaign=willkommen-schritt-1-2[&"]/, 'sonst zählten ihre Bestellungen für die gelöschte')
  const namen = h.daten().ergebnisse.namen
  assert.equal(namen['willkommen-schritt-1'].id, alt.id, 'der alte Kurzname bleibt bei der alten Automation')
  assert.equal(namen['willkommen-schritt-1-2'].id, neu.id)
  assert.equal(namen['willkommen-schritt-1-2'].schritt, 1)
})

test('ein Automationsschritt behält seinen Kurznamen bei jedem weiteren Versand', () => {
  const h = hauptStarten()
  const erst = automationEingereiht(h, 'l1')
  h.aendern((d) => {
    d.laeufe = [{ id: 'l3', schluessel: 'l3', automationId: erst.id, email: 'kunde@beispiel.de', schritt: 0, zustand: 'laeuft', faelligAb: Date.now() - 1000, verfaelltAm: Date.now() + TAG }]
  })
  h.fn.laeufeAbarbeiten()
  const zweiter = h.daten().warteschlange.find((e) => e.kampagneId === `auto:${erst.id}:l3:0`)
  assert.match(zweiter.html, /utm_campaign=willkommen-schritt-1[&"]/)
  assert.deepEqual(Object.keys(h.daten().ergebnisse.namen), ['willkommen-schritt-1'], 'kein zweiter Eintrag für dieselbe Mail')
})

test('kurznameFinden nimmt den zuletzt vergebenen Namen einer Mail und nur ihren', () => {
  const ziel = { art: 'automation', id: 'a1', schritt: 1 }
  const namen = {
    'alt-schritt-1': { art: 'automation', id: 'a1', schritt: 1, seit: 10 },
    'neu-schritt-1': { art: 'automation', id: 'a1', schritt: 1, seit: 20 },
    'fremd-schritt-1': { art: 'automation', id: 'a2', schritt: 1, seit: 30 },
    'zwei-schritt-2': { art: 'automation', id: 'a1', schritt: 2, seit: 40 }
  }
  assert.equal(ergebnisse.kurznameFinden(namen, ziel), 'neu-schritt-1')
  assert.equal(ergebnisse.kurznameFinden(namen, { art: 'automation', id: 'a3', schritt: 1 }), null)
  assert.equal(ergebnisse.kurznameFinden(null, ziel), null)
  assert.equal(ergebnisse.kurznameFinden(namen, { art: 'automation', id: 'a1' }), null, 'ohne Schritt kein Ziel')
})

test('kampagnenErgebnisse liefert die Zeile mit Empfängern aus dem Protokoll und Umsatz aus Shopify', async () => {
  const h = hauptStarten({ bestellungen: () => [knoten(1, { campaign: 'herbst', betrag: '60.00' })] })
  const id = kampagneGestartet(h, 'Herbst')
  // Ein zweiter Hintergrundteil mit derselben Kampagne und einem Protokoll: zwei Mails raus,
  // eine gescheitert, eine Testmail
  const zeilen = [
    { zeit: new Date().toISOString(), an: 'k…@beispiel.de', art: 'kampagne', kampagneId: id, ok: true },
    { zeit: new Date().toISOString(), an: 'k…@beispiel.de', art: 'kampagne', kampagneId: id, ok: true },
    { zeit: new Date().toISOString(), an: 'x…@beispiel.de', art: 'kampagne', kampagneId: id, ok: false },
    { zeit: new Date().toISOString(), an: 'f…@beispiel.de', art: 'test', kampagneId: id, ok: true }
  ]
  const h2 = hauptStarten({ bestellungen: () => [knoten(1, { campaign: 'herbst', betrag: '60.00' })], protokoll: zeilen })
  h2.aendern((d) => {
    d.kampagnen = h.daten().kampagnen
    d.ergebnisse = h.daten().ergebnisse
  })
  await h2.fn.ergebnisseHolen()
  const r = h2.fn.kampagnenErgebnisse()
  assert.equal(r.shopifyBereit, true)
  assert.ok(r.geholtAm)
  assert.equal(r.zeilen.length, 1)
  assert.equal(r.zeilen[0].id, id)
  assert.equal(r.zeilen[0].empfaenger, 2)
  assert.equal(r.zeilen[0].bestellungen, 1)
  assert.equal(r.zeilen[0].umsatz, 60)
  assert.equal(r.zeilen[0].jeHundert, 3000)
  assert.equal(JSON.stringify(r).includes('@'), false, 'keine Adressen in der Ergebnisliste')
})

test('ergebnisseHolen sagt in einem Satz, was herauskam', async () => {
  const h = hauptStarten({ bestellungen: () => [] })
  kampagneGestartet(h, 'Herbst')
  const r = await h.fn.ergebnisseHolen()
  assert.equal(r.ok, true)
  assert.equal(r.text, 'Keine neuen Bestellungen aus Mails.')
})

test('automationenErgebnisse: gesendet aus dem Protokoll, Umsatz je Schritt, Enden der Serien', async () => {
  const h = hauptStarten({ bestellungen: () => [knoten(1, { campaign: 'willkommen-schritt-1', betrag: '30.00' })] })
  h.fn.automationAnlegen('willkommen')
  const a = h.daten().automationen[0]
  h.fn.automationSpeichern({ id: a.id, schritte: [{ nach: 0, verfallNach: TAG, betreff: 'Willkommen', html: GUTES_HTML }] })
  h.fn.automationSchalten({ id: a.id, aktiv: true })
  h.aendern((d) => {
    d.laeufe = [{ id: 'l1', schluessel: 'x', automationId: a.id, email: 'kundin@beispiel.de', schritt: 0, zustand: 'laeuft', faelligAb: Date.now() - 1000, verfaelltAm: Date.now() + TAG }]
  })
  h.fn.laeufeAbarbeiten()

  // Ein zweiter Hintergrundteil mit denselben Daten und einem Protokoll, in dem die Mail raus ist
  const h2 = hauptStarten({
    bestellungen: () => [knoten(1, { campaign: 'willkommen-schritt-1', betrag: '30.00' })],
    protokoll: [
      { zeit: new Date().toISOString(), an: 'k…@beispiel.de', art: 'kampagne', kampagneId: `auto:${a.id}:l1:0`, ok: true },
      { zeit: new Date().toISOString(), an: 'k…@beispiel.de', art: 'test', kampagneId: null, ok: true }
    ]
  })
  h2.aendern((d) => {
    d.automationen = h.daten().automationen
    d.laeufe = h.daten().laeufe.map((l) => ({ ...l, zustand: 'abgebrochen', abbruchGrund: 'Bestellung eingegangen' }))
    d.ergebnisse = h.daten().ergebnisse
  })
  await h2.fn.ergebnisseHolen()
  const r = h2.fn.automationenErgebnisse()
  const z = r.zeilen.find((x) => x.id === a.id)
  assert.deepEqual(z.schritte[0], { schritt: 1, betreff: 'Willkommen', gesendet: 1, bestellungen: 1, umsatz: 30, waehrung: 'EUR', jeHundert: 3000 })
  assert.equal(z.enden.kauf, 1)
  assert.equal(JSON.stringify(r).includes('@'), false, 'keine Adressen')
})
