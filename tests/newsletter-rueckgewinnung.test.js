// Newsletter-Plugin: der Auslöser der Rückgewinnung.
// Geprüft wird, wer angeschrieben wird: Käufer mit Zustimmung, deren letzte Bestellung im
// eingestellten Fenster liegt — höchstens einmal je letzter Bestellung, höchstens 100 neue
// Serien am Tag, Shopify höchstens einmal am Tag gefragt. Dazu die Shopify-Abfrage selbst
// und das Zusammenspiel in haupt.js.
// Alle Kunden, Adressen und IDs sind erfunden. Es wird nie eine Verbindung aufgebaut: Shopify
// ist ein Ersatz für fetch, Electrons safeStorage ein Ersatz im Speicher, nichts wird versendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import automationen from '../plugins/newsletter/automationen.js'
import shopify from '../plugins/newsletter/shopify.js'

const { neueAutomation, automationPruefen, rueckFenster, rueckFensterFehler, rueckKandidaten, RUECK_FENSTER, RUECK_JE_TAG, AUSLOESER } = automationen
const { kaeuferHolen, kaeuferAus, KAEUFER } = shopify

const TAG = 86400000
const JETZT = Date.UTC(2026, 10, 13, 12, 0, 0)
const ZUGANG = { shop: 'beispielshop.myshopify.com', token: 'shpat_abcdefghijklmnopqrstuvwxyz1234' }

const kaeufer = (email, tageHer, bestellung = `gid://shopify/Order/${email.length}${tageHer}`) => ({
  email,
  vorname: '',
  shopifyId: null,
  letzteBestellungId: bestellung,
  letzteBestellungAm: JETZT - tageHer * TAG
})

// ── Das Fenster ──

test('eine neue Rückgewinnung bringt das Fenster 120 bis 365 Tage mit', () => {
  const a = neueAutomation('rueckgewinnung', { jetzt: JETZT })
  assert.equal(a.abTage, 120)
  assert.equal(a.bisTage, 365)
  assert.deepEqual(rueckFenster(a), RUECK_FENSTER)
  assert.equal(neueAutomation('warenkorb').abTage, undefined, 'nur die Rückgewinnung hat ein Fenster')
})

test('ältere Rückgewinnungen ohne Fenster bekommen die Voreinstellung', () => {
  assert.deepEqual(rueckFenster({ art: 'rueckgewinnung' }), { abTage: 120, bisTage: 365 })
})

test('die Beschreibung sagt nicht mehr, der Auslöser fehle', () => {
  assert.doesNotMatch(AUSLOESER.rueckgewinnung.beschreibung, /noch nicht gebaut/)
})

test('ein unbrauchbares Fenster sperrt das Einschalten', () => {
  assert.deepEqual(rueckFensterFehler({ abTage: 120, bisTage: 365 }), [])
  assert.match(rueckFensterFehler({ abTage: 10, bisTage: 365 }).join(' '), /mindestens 30/)
  assert.match(rueckFensterFehler({ abTage: 120, bisTage: 5000 }).join(' '), /höchstens 1825/)
  assert.match(rueckFensterFehler({ abTage: 200, bisTage: 200 }).join(' '), /größer sein als/)

  const schritt = { nach: 0, verfallNach: TAG, betreff: 'Lange nicht gesehen', html: '<p>Hallo</p>' }
  assert.equal(automationPruefen({ art: 'rueckgewinnung', abTage: 120, bisTage: 365, schritte: [schritt] }).ok, true)
  const kaputt = automationPruefen({ art: 'rueckgewinnung', abTage: 300, bisTage: 100, schritte: [schritt] })
  assert.equal(kaputt.ok, false)
  assert.match(kaputt.fehler.join(' '), /Rückgewinnung/)
  assert.equal(automationPruefen({ art: 'warenkorb', abTage: 1, schritte: [schritt] }).ok, true, 'andere Arten prüfen kein Fenster')
})

// ── Wer ist dran? ──

test('nur wer mit der letzten Bestellung im Fenster liegt, ist dran', () => {
  const liste = [kaeufer('zu-frisch@beispiel.de', 60), kaeufer('drin@beispiel.de', 150), kaeufer('zu-alt@beispiel.de', 500), kaeufer('grenze@beispiel.de', 120)]
  const dran = rueckKandidaten(liste, { abTage: 120, bisTage: 365, jetzt: JETZT }).map((k) => k.email)
  assert.deepEqual(dran, ['grenze@beispiel.de', 'drin@beispiel.de'], 'genau 120 Tage zählt schon, die jüngste Bestellung zuerst')
})

test('wer zu seiner letzten Bestellung schon dran war, kommt nicht noch einmal', () => {
  const k = kaeufer('drin@beispiel.de', 150, 'gid://shopify/Order/1')
  assert.equal(rueckKandidaten([k], { abTage: 120, bisTage: 365, jetzt: JETZT, gemerkt: { 'drin@beispiel.de': 'gid://shopify/Order/1' } }).length, 0)
  // Hat die Person seither wieder gekauft und ist wieder weg, ist es ein neuer Anlass
  const wieder = kaeufer('drin@beispiel.de', 150, 'gid://shopify/Order/2')
  assert.equal(rueckKandidaten([wieder], { abTage: 120, bisTage: 365, jetzt: JETZT, gemerkt: { 'drin@beispiel.de': 'gid://shopify/Order/1' } }).length, 1)
})

test('höchstens 100 neue Serien je Lauf, doppelte Adressen nur einmal', () => {
  const viele = Array.from({ length: 250 }, (_, i) => kaeufer(`kunde${i}@beispiel.de`, 130 + (i % 100)))
  assert.equal(RUECK_JE_TAG, 100)
  assert.equal(rueckKandidaten(viele, { abTage: 120, bisTage: 365, jetzt: JETZT }).length, 100)
  const doppelt = [kaeufer('a@beispiel.de', 150), kaeufer('A@beispiel.de', 160)]
  assert.equal(rueckKandidaten(doppelt, { abTage: 120, bisTage: 365, jetzt: JETZT }).length, 1)
})

test('kaputte Einträge fallen heraus, statt abzustürzen', () => {
  const kaputt = [null, 'text', { email: '' }, { email: 'x@beispiel.de', letzteBestellungAm: JETZT - 150 * TAG }, { email: 'y@beispiel.de', letzteBestellungId: 'o', letzteBestellungAm: 'gestern' }]
  assert.deepEqual(rueckKandidaten(kaputt, { abTage: 120, bisTage: 365, jetzt: JETZT }), [])
  assert.deepEqual(rueckKandidaten(undefined, { abTage: 120, bisTage: 365, jetzt: JETZT }), [])
})

// ── Shopify: Käufer holen ──

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

const knoten = (email, tageHer, orderId = `gid://shopify/Order/${tageHer}`) => ({
  id: `gid://shopify/Customer/${email.length}`,
  email,
  firstName: 'Erfunden',
  lastOrder: tageHer == null ? null : { id: orderId, createdAt: new Date(JETZT - tageHer * TAG).toISOString() }
})

const seite = (nodes, weiter = false) => ({ data: { customers: { pageInfo: { hasNextPage: weiter, endCursor: weiter ? 'c2' : null }, nodes } } })

test('die Abfrage fragt nur Kunden mit Zustimmung und Bestellung, mit ihrer letzten Bestellung', () => {
  assert.match(KAEUFER, /accepts_marketing:true AND orders_count:>0/)
  assert.match(KAEUFER, /lastOrder \{ id createdAt \}/)
  assert.doesNotMatch(KAEUFER, /order_date/, 'kein Datumsfilter bei Shopify: der meint irgendeine Bestellung, nicht die letzte')
})

test('kaeuferHolen blättert durch alle Seiten und nimmt nur Kunden mit letzter Bestellung', async () => {
  const { holen, anfragen } = fetchErsatz([seite([knoten('Eins@Beispiel.de', 150), knoten('ohne@beispiel.de', null)], true), seite([knoten('zwei@beispiel.de', 30)])])
  const r = await kaeuferHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, true)
  assert.equal(r.seiten, 2)
  assert.deepEqual(r.kaeufer.map((k) => k.email), ['eins@beispiel.de', 'zwei@beispiel.de'], 'klein geschrieben, ohne Bestellung fällt weg')
  assert.equal(r.kaeufer[0].letzteBestellungId, 'gid://shopify/Order/150')
  assert.equal(r.kaeufer[0].letzteBestellungAm, JETZT - 150 * TAG)
  assert.equal(anfragen[1].koerper.variables.cursor, 'c2')
})

test('kaeuferHolen gibt Fehler von Shopify verständlich weiter', async () => {
  const r = await kaeuferHolen({ ...ZUGANG, holen: fetchErsatz([401]).holen })
  assert.equal(r.ok, false)
  assert.match(r.fehler, /Token/)
  const leer = await kaeuferHolen({ ...ZUGANG, holen: fetchErsatz([{ data: {} }]).holen })
  assert.equal(leer.ok, false)
})

test('kaeuferAus verwirft Kunden ohne Adresse oder mit kaputtem Datum', () => {
  assert.equal(kaeuferAus({ email: '', lastOrder: { id: 'o', createdAt: '2026-01-01' } }), null)
  assert.equal(kaeuferAus({ email: 'a@beispiel.de', lastOrder: { id: 'o', createdAt: 'kaputt' } }), null)
  assert.equal(kaeuferAus({ email: 'a@beispiel.de', lastOrder: null }), null)
})

// ── Zusammenspiel in haupt.js ──
// Ohne Electron gibt es keinen Tresor; deshalb wird `electron.safeStorage` für diese Datei
// durch einen Ersatz im Speicher vertreten, bevor haupt.js geladen wird. Shopify ist der
// fetch-Ersatz `abrufen`. Die Uhr läuft echt: haupt.js nimmt Date.now().

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

const vorTagen = (tage) => new Date(Date.now() - tage * TAG).toISOString()
const kontakt = (email, extra = {}) => ({ email, vorname: 'Erfunden', quelle: 'shopify', zustimmungAm: '2025-01-01', zustand: 'SUBSCRIBED', ...extra })

function hauptStarten({ kunden, mitToken = true } = {}) {
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.de', farben: {} },
    shopify: { shop: ZUGANG.shop, ...(mitToken ? { tokenVerschluesselt: Buffer.from(`test:${ZUGANG.token}`).toString('base64') } : {}) },
    kontakte: [
      kontakt('drin@beispiel.de'),
      kontakt('frisch@beispiel.de'),
      kontakt('alt@beispiel.de'),
      kontakt('gesperrt@beispiel.de', { gesperrt: true }),
      kontakt('ohne-zustimmung@beispiel.de', { zustimmungAm: null })
    ],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: []
  }
  const shopAnfragen = []
  const abrufen = async (url, optionen = {}) => {
    if (!String(url).includes('/graphql.json')) return { ok: false, status: 404, json: async () => ({}) }
    const { query } = JSON.parse(optionen.body)
    shopAnfragen.push(query)
    if (query.includes('lastOrder')) return { ok: true, status: 200, json: async () => seite(kunden()) }
    if (query.includes('orders(')) return { ok: true, status: 200, json: async () => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [] } } }) }
    return { ok: true, status: 200, json: async () => ({ data: {} }) }
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
    abrufen
  })
  return {
    fn,
    daten: () => daten,
    aendern: (f) => {
      f(daten)
    },
    shopAnfragen
  }
}

const SHOPKUNDEN = () => [
  { ...knoten('drin@beispiel.de', 150, 'gid://shopify/Order/101'), lastOrder: { id: 'gid://shopify/Order/101', createdAt: vorTagen(150) } },
  { ...knoten('frisch@beispiel.de', 0), lastOrder: { id: 'gid://shopify/Order/102', createdAt: vorTagen(20) } },
  { ...knoten('alt@beispiel.de', 0), lastOrder: { id: 'gid://shopify/Order/103', createdAt: vorTagen(600) } },
  { ...knoten('gesperrt@beispiel.de', 0), lastOrder: { id: 'gid://shopify/Order/104', createdAt: vorTagen(150) } },
  { ...knoten('ohne-zustimmung@beispiel.de', 0), lastOrder: { id: 'gid://shopify/Order/105', createdAt: vorTagen(150) } },
  { ...knoten('unbekannt@beispiel.de', 0), lastOrder: { id: 'gid://shopify/Order/106', createdAt: vorTagen(150) } }
]

async function eingeschaltet(h) {
  assert.equal(h.fn.automationAnlegen('rueckgewinnung').ok, true)
  const id = h.daten().automationen[0].id
  const gespeichert = h.fn.automationSpeichern({ id, schritte: [{ nach: 0, verfallNach: 30 * TAG, betreff: 'Lange nicht gesehen', html: '<p>Hallo {{vorname}}</p>' }] })
  assert.deepEqual(gespeichert.hinweise, [])
  const an = h.fn.automationSchalten({ id, aktiv: true })
  assert.equal(an.ok, true, an.text)
  return id
}

test('haupt.js startet eine Serie nur für die eine Person, die passt', async () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN })
  const id = await eingeschaltet(h)
  const r = await h.fn.ausloeserPruefen()
  assert.equal(r.ok, true)
  assert.equal(r.rueckgewinnung, 1)

  const laeufe = h.daten().laeufe.filter((l) => l.automationId === id)
  assert.equal(laeufe.length, 1)
  assert.equal(laeufe[0].email, 'drin@beispiel.de')
  assert.equal(laeufe[0].ausloeserId, 'rueck:gid://shopify/Order/101')
  // Gemerkt wird nur, wer wirklich dran war — nicht Gesperrte, nicht ohne Zustimmung
  assert.deepEqual(h.daten().rueckgewinnung.gemerkt, { 'drin@beispiel.de': 'gid://shopify/Order/101' })
  assert.ok(h.daten().einstellungen.ausloeser.rueckgewinnungAm, 'Zeitpunkt der Prüfung steht fest')
})

test('haupt.js fragt Shopify höchstens einmal am Tag nach Käufern', async () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN })
  await eingeschaltet(h)
  await h.fn.ausloeserPruefen()
  await h.fn.ausloeserPruefen()
  assert.equal(h.shopAnfragen.filter((q) => q.includes('lastOrder')).length, 1)
})

test('nach dem Aufräumen der Läufe schreibt haupt.js dieselbe Person nicht noch einmal an', async () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN })
  await eingeschaltet(h)
  await h.fn.ausloeserPruefen()
  // Ein Tag später, der fertige Lauf ist weggeräumt
  h.aendern((d) => {
    d.laeufe = []
    d.einstellungen.ausloeser.rueckgewinnungAm = Date.now() - 2 * TAG
  })
  const r = await h.fn.ausloeserPruefen()
  assert.equal(r.rueckgewinnung, 0)
  assert.equal(h.daten().laeufe.length, 0)
})

test('das Zeitfenster aus dem Editor wird gespeichert und gilt', async () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN })
  const id = await eingeschaltet(h)
  h.fn.automationSchalten({ id, aktiv: false })
  const s = h.fn.automationSpeichern({ id, abTage: '10', bisTage: '700' })
  assert.equal(s.ok, true)
  assert.match(s.hinweise.join(' '), /mindestens 30/, 'zu kurzes Fenster wird gemeldet')
  assert.equal(h.fn.automationSchalten({ id, aktiv: true }).ok, false, 'und sperrt das Einschalten')

  h.fn.automationSpeichern({ id, abTage: 30, bisTage: 700 })
  const gelesen = h.fn.automationenLesen().liste.find((a) => a.id === id)
  assert.equal(gelesen.abTage, 30)
  assert.equal(gelesen.bisTage, 700)
  assert.equal(h.fn.automationSchalten({ id, aktiv: true }).ok, true)

  const r = await h.fn.ausloeserPruefen()
  // 30 bis 700 Tage: jetzt sind auch „alt“ (600) dabei, „frisch“ (20) weiterhin nicht
  assert.equal(r.rueckgewinnung, 2)
  assert.deepEqual(h.daten().laeufe.map((l) => l.email).sort(), ['alt@beispiel.de', 'drin@beispiel.de'])
})

test('ohne Shopify-Zugang lässt sich die Rückgewinnung nicht einschalten', () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN, mitToken: false })
  h.fn.automationAnlegen('rueckgewinnung')
  const id = h.daten().automationen[0].id
  h.fn.automationSpeichern({ id, schritte: [{ nach: 0, verfallNach: TAG, betreff: 'Hallo', html: '<p>Hallo</p>' }] })
  const r = h.fn.automationSchalten({ id, aktiv: true })
  assert.equal(r.ok, false)
  assert.match(r.text, /Shopify-Zugang/)
})

test('erneutes Einschalten prüft beim nächsten Takt statt erst morgen', async () => {
  const h = hauptStarten({ kunden: SHOPKUNDEN })
  const id = await eingeschaltet(h)
  await h.fn.ausloeserPruefen()
  h.fn.automationSchalten({ id, aktiv: false })
  assert.ok(h.daten().einstellungen.ausloeser.rueckgewinnungAm)
  h.fn.automationSchalten({ id, aktiv: true })
  assert.equal(h.daten().einstellungen.ausloeser.rueckgewinnungAm, undefined)
})
