// Newsletter-Plugin: die meistverkauften Produkte aus den Bestellungen bei Shopify.
// Geprüft wird das Zählen (Stückzahlen, nicht Bestellungen), der Rückfall auf die schlanke
// Abfrage ohne `product { handle }`, das Verbinden mit den öffentlichen Produktdaten, der
// Zwischenspeicher und die Bot-Aktion. Shopify wird durch einen Stub ersetzt: es geht
// nichts nach außen, es wird keine Datei geschrieben, alle Daten sind erfunden.

import assert from 'node:assert/strict'
import test from 'node:test'
import shopify from '../plugins/newsletter/shopify.js'
import shoplinks from '../plugins/newsletter/shoplinks.js'
import bots from '../plugins/newsletter/bots.js'
import starten from '../plugins/newsletter/haupt.js'

const { bestsellerHolen, korbRennerHolen, RENNER_REICH, RENNER_SCHLANK, KORB_RENNER_REICH, KORB_RENNER_SCHLANK } = shopify

const ZUGANG = { shop: 'beispiel.myshopify.com', token: 'shpat_abcdefghijklmnopqrstuvwxyz1234' }

// Eine Antwort, wie Shopify sie schickt
const antwort = (daten) => ({ ok: true, status: 200, json: async () => ({ data: daten }) })
const fehlerAntwort = (meldung) => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: meldung }] }) })

const bestellung = (posten) => ({ id: `gid://b/${Math.random()}`, lineItems: { nodes: posten } })
const posten = (title, quantity, handle) => ({ title, quantity, ...(handle ? { product: { handle } } : {}) })

// Ein Stub, der die Abfragen mitschreibt
function shopifyStub(seiten, { feldFehler = false, feld = 'orders' } = {}) {
  const gesehen = []
  let i = 0
  const holen = async (_url, optionen) => {
    const { query } = JSON.parse(optionen.body)
    gesehen.push(query)
    if (feldFehler && (query === RENNER_REICH || query === KORB_RENNER_REICH)) {
      return fehlerAntwort("Field 'product' doesn't exist on type 'LineItem'")
    }
    const seite = seiten[Math.min(i, seiten.length - 1)]
    i++
    return antwort({ [feld]: { pageInfo: { hasNextPage: i < seiten.length, endCursor: `c${i}` }, nodes: seite } })
  }
  return { holen, gesehen }
}

// ── Zählen ──

test('gezählt werden Stückzahlen, nicht Bestellungen', async () => {
  const { holen } = shopifyStub([
    [
      bestellung([posten('Hoodie', 2, 'hoodie'), posten('Shirt', 1, 'shirt')]),
      bestellung([posten('Shirt', 1, 'shirt')]),
      bestellung([posten('Hoodie', 1, 'hoodie')])
    ]
  ])
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, true, r.fehler)
  assert.equal(r.bestellungen, 3)
  assert.deepEqual(
    r.liste.map((e) => [e.titel, e.menge]),
    [
      ['Hoodie', 3],
      ['Shirt', 2]
    ]
  )
})

test('derselbe Artikel aus mehreren Seiten landet in einer Zeile', async () => {
  const { holen } = shopifyStub([[bestellung([posten('Hoodie', 1, 'hoodie')])], [bestellung([posten('Hoodie', 4, 'hoodie')])]])
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.equal(r.liste.length, 1)
  assert.equal(r.liste[0].menge, 5)
  assert.equal(r.bestellungen, 2)
})

test('ein Posten ohne Stückzahl zählt als eins, einer ohne Namen fällt raus', async () => {
  const { holen } = shopifyStub([[bestellung([posten('Hoodie', null, 'hoodie'), posten('', 9)])]])
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.deepEqual(
    r.liste.map((e) => [e.titel, e.menge]),
    [['Hoodie', 1]]
  )
})

test('gleiche Menge wird nach Namen sortiert, damit die Reihenfolge nicht springt', async () => {
  const { holen } = shopifyStub([[bestellung([posten('Zebra', 1, 'z'), posten('Adler', 1, 'a')])]])
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.deepEqual(
    r.liste.map((e) => e.titel),
    ['Adler', 'Zebra']
  )
})

// ── Rückfall ohne `product { handle }` ──

test('fehlt das Recht für product.handle, wird die schlanke Abfrage genommen', async () => {
  const { holen, gesehen } = shopifyStub([[bestellung([posten('Hoodie', 2)])]], { feldFehler: true })
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, true, r.fehler)
  assert.equal(r.schlank, true)
  assert.equal(gesehen[0], RENNER_REICH, 'erst die reiche Abfrage')
  assert.equal(gesehen[1], RENNER_SCHLANK, 'dann die schlanke')
  assert.equal(r.liste[0].menge, 2)
  assert.equal(r.liste[0].handle, '')
})

test('ein echter Fehler wird durchgereicht, nicht als leere Liste getarnt', async () => {
  const holen = async () => ({ ok: false, status: 401, text: async () => 'nope' })
  const r = await bestsellerHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, false)
  assert.match(r.fehler, /Token|abgelehnt|401/i)
})

// ── Dieselbe Zählung über abgebrochene Warenkörbe ──

test('Warenkorb-Renner zählen Stückzahlen über die Körbe', async () => {
  const { holen } = shopifyStub(
    [[bestellung([posten('Hoodie', 2, 'hoodie'), posten('Shirt', 1, 'shirt')]), bestellung([posten('Hoodie', 1, 'hoodie')])]],
    { feld: 'abandonedCheckouts' }
  )
  const r = await korbRennerHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, true, r.fehler)
  assert.equal(r.koerbe, 2, 'gezählt werden Körbe, nicht Bestellungen')
  assert.deepEqual(
    r.liste.map((e) => [e.titel, e.menge]),
    [
      ['Hoodie', 3],
      ['Shirt', 1]
    ]
  )
})

test('die Warenkorb-Abfrage fragt kein einziges Kundenfeld ab', () => {
  for (const abfrage of [KORB_RENNER_REICH, KORB_RENNER_SCHLANK]) {
    assert.doesNotMatch(abfrage, /customer|email|firstName/i, 'sonst braeuchte sie Zugriff auf geschuetzte Kundendaten')
    assert.match(abfrage, /abandonedCheckouts/)
    assert.match(abfrage, /lineItems/)
  }
})

test('auch bei den Warenkoerben gibt es den Rueckfall ohne product.handle', async () => {
  const { holen, gesehen } = shopifyStub([[bestellung([posten('Hoodie', 2)])]], { feldFehler: true, feld: 'abandonedCheckouts' })
  const r = await korbRennerHolen({ ...ZUGANG, holen })
  assert.equal(r.ok, true, r.fehler)
  assert.equal(r.schlank, true)
  assert.equal(gesehen[0], KORB_RENNER_REICH)
  assert.equal(gesehen[1], KORB_RENNER_SCHLANK)
})

test('beide Ranglisten liefern dieselbe Form', async () => {
  const seiten = [[bestellung([posten('Hoodie', 1, 'hoodie')])]]
  const a = await bestsellerHolen({ ...ZUGANG, holen: shopifyStub(seiten).holen })
  const b = await korbRennerHolen({ ...ZUGANG, holen: shopifyStub(seiten, { feld: 'abandonedCheckouts' }).holen })
  assert.deepEqual(a.liste, b.liste)
  assert.equal(a.bestellungen, 1)
  assert.equal(b.koerbe, 1)
})

// ── Verbinden mit den Produktdaten ──

const IM_SHOP = [
  { titel: 'Hoodie', url: 'https://beispiel.de/products/hoodie', preis: '59,99 €', vergleichspreis: '', bild: 'https://cdn.shopify.com/h.jpg', verfuegbar: true },
  { titel: 'Shirt', url: 'https://beispiel.de/products/shirt', preis: '24,95 €', vergleichspreis: '34,95 €', bild: 'https://cdn.shopify.com/s.jpg', verfuegbar: true },
  { titel: 'Grüße & Mehr', url: 'https://beispiel.de/products/gr%C3%BCsse-mehr', preis: '9,95 €', vergleichspreis: '', bild: 'https://cdn.shopify.com/g.jpg', verfuegbar: false }
]

test('über den handle aus der Bestellung werden Adresse, Bild und Preis ergänzt', () => {
  const [e] = shoplinks.rennerVerbinden([{ titel: 'Hoodie', handle: 'hoodie', menge: 7 }], IM_SHOP)
  assert.equal(e.url, 'https://beispiel.de/products/hoodie')
  assert.equal(e.bild, 'https://cdn.shopify.com/h.jpg')
  assert.equal(e.preis, '59,99 €')
  assert.equal(e.menge, 7)
  assert.equal(e.imShop, true)
  assert.equal(e.verfuegbar, true)
})

test('ohne handle wird über den Titel zugeordnet, Groß- und Kleinschreibung egal', () => {
  const [e] = shoplinks.rennerVerbinden([{ titel: 'SHIRT', handle: '', menge: 2 }], IM_SHOP)
  assert.equal(e.url, 'https://beispiel.de/products/shirt')
  assert.equal(e.vergleichspreis, '34,95 €', 'der alte Preis kommt für das Rabatt-Abzeichen mit')
  assert.equal(e.titel, 'Shirt', 'der Name aus dem Shop gewinnt gegen den aus der Bestellung')
})

test('ein verschlüsselter handle in der Adresse wird trotzdem getroffen', () => {
  const [e] = shoplinks.rennerVerbinden([{ titel: 'Grüße & Mehr', handle: 'grüsse-mehr', menge: 1 }], IM_SHOP)
  assert.equal(e.imShop, true)
  assert.equal(e.verfuegbar, false, 'Ausverkauftes wird als solches gemeldet, nicht verschwiegen')
})

test('was nicht mehr im Shop steht, bleibt mit Namen und Menge stehen', () => {
  const [e] = shoplinks.rennerVerbinden([{ titel: 'Vom Markt genommen', handle: 'weg', menge: 12 }], IM_SHOP)
  assert.equal(e.imShop, false)
  assert.equal(e.titel, 'Vom Markt genommen')
  assert.equal(e.menge, 12)
  assert.equal(e.url, '')
  assert.equal(e.verfuegbar, null)
})

test('ohne Produktliste bricht nichts, es gibt nur keine Adressen', () => {
  const liste = shoplinks.rennerVerbinden([{ titel: 'Hoodie', handle: 'hoodie', menge: 3 }], [])
  assert.equal(liste.length, 1)
  assert.equal(liste[0].imShop, false)
  assert.deepEqual(shoplinks.rennerVerbinden(null, IM_SHOP), [])
})

// ── Zusammenspiel in haupt.js ──
// Der Hintergrundteil läuft mit erfundenen Daten im Speicher: kein Electron, keine Datei.
// `abrufen` bedient sowohl Shopify (POST auf /graphql.json) als auch die öffentliche
// Produktliste des Shops.

const PRODUKTE = {
  products: [
    { title: 'Hoodie', handle: 'hoodie', variants: [{ price: '59.99', available: true }], images: [{ src: 'https://cdn.shopify.com/hoodie.jpg' }] },
    { title: 'Shirt', handle: 'shirt', variants: [{ price: '24.95', compare_at_price: '34.95', available: true }], images: [{ src: 'https://cdn.shopify.com/shirt.jpg' }] },
    { title: 'Ausverkauft', handle: 'weg', variants: [{ price: '19.95', available: false }], images: [{ src: 'https://cdn.shopify.com/weg.jpg' }] }
  ]
}

function hauptStarten({ bestellungen = null, bestseller = null } = {}) {
  const seiten = bestellungen || [
    [
      bestellung([posten('Hoodie', 3, 'hoodie'), posten('Shirt', 1, 'shirt')]),
      bestellung([posten('Ausverkauft', 9, 'weg')]),
      bestellung([posten('Nicht mehr im Shop', 5, 'fort')])
    ]
  ]
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    // Der Tresor ist ohne Electron nicht da: haupt.js meldet dann einen Zugangsfehler.
    // Deshalb wird `shopifyZugang` unten über den Stub-Pfad gar nicht gebraucht — die
    // Tests, die Shopify brauchen, setzen den Token über shopifySpeichern.
    shopify: { shop: ZUGANG.shop, primaerDomain: 'beispiel.de' },
    marke: {},
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: [],
    ...(bestseller ? { bestseller } : {})
  }
  const fn = {}
  const abrufen = async (url, optionen = {}) => {
    if (String(url).includes('/products.json')) return { ok: true, json: async () => PRODUKTE }
    if (String(url).includes('/graphql.json')) {
      const { query } = JSON.parse(optionen.body)
      if (!query.includes('orders(')) return antwort({})
      const seite = seiten.shift() || []
      return antwort({ orders: { pageInfo: { hasNextPage: seiten.length > 0, endCursor: 'c' }, nodes: seite } })
    }
    return { ok: false, status: 404, text: async () => 'weg' }
  }
  starten({
    datenLaden: () => JSON.parse(JSON.stringify(daten)),
    datenSpeichern: (d) => {
      daten = JSON.parse(JSON.stringify(d))
    },
    bereitstellen: (name, f) => {
      fn[name] = f
    },
    fragen: async () => '',
    abrufen,
    eingangOrdner: false // nie den echten Eingangskorb der Bots anfassen
  })
  return { fn, daten: () => daten }
}

test('ohne Shopify-Zugang sagt Vendo bei beiden Listen, woran es liegt', async () => {
  const { fn } = hauptStarten()
  for (const art of ['bestseller', 'warenkorb']) {
    const r = await fn.rennerHolen({ art })
    assert.equal(r.ok, false, `${art} meldet keinen Fehler`)
    assert.match(r.text, /Shopify/)
  }
})

test('rennerLesen gibt beide Listen, hoechstens fuenf, mit ihrem Stand', () => {
  const { fn } = hauptStarten()
  const gelesen = fn.rennerLesen()
  assert.equal(gelesen.anzahl, 5)
  for (const art of ['bestseller', 'warenkorb']) {
    assert.equal(gelesen[art].tage, 30, `${art} kennt den Zeitraum`)
    assert.deepEqual(gelesen[art].liste, [])
    assert.equal(gelesen[art].geholtAm, null)
    assert.equal(gelesen[art].quellen, 0)
  }
})

// ── Die Bestseller stehen schon im ueberblick ──
// Der Bot ruft ueberblick ohnehin als Erstes auf. Stehen die Produkte dort schon drin,
// braucht er keinen zweiten Aufruf — und hat keinen Grund, welche zu erfinden.

const RENNER_STAND = {
  geholtAm: Date.now(),
  tage: 30,
  quellen: 42,
  liste: [
    { titel: 'Hoodie', menge: 9, url: 'https://beispiel.de/products/hoodie', bild: 'https://cdn.shopify.com/h.jpg', preis: '59,99 €', vergleichspreis: '', verfuegbar: true, imShop: true },
    { titel: 'Shirt', menge: 6, url: 'https://beispiel.de/products/shirt', bild: 'https://cdn.shopify.com/s.jpg', preis: '24,95 €', vergleichspreis: '34,95 €', verfuegbar: true, imShop: true },
    { titel: 'Ausverkauft', menge: 20, url: 'https://beispiel.de/products/weg', bild: '', preis: '', vergleichspreis: '', verfuegbar: false, imShop: true },
    { titel: 'Vom Markt genommen', menge: 30, url: '', bild: '', preis: '', vergleichspreis: '', verfuegbar: null, imShop: false }
  ]
}

test('ueberblick trägt die Bestseller fertig mit Adresse, Bild und Preis', async () => {
  const { fn } = hauptStarten({ bestseller: RENNER_STAND })
  const a = await fn.botAuftrag({ aktion: 'ueberblick', argumente: {} })
  assert.equal(a.ok, true)
  assert.deepEqual(
    a.daten.bestseller.map((e) => e.titel),
    ['Hoodie', 'Shirt'],
    'Ausverkauftes und aus dem Shop Genommenes gehört nicht in eine Mail'
  )
  const erstes = a.daten.bestseller[0]
  for (const feld of ['url', 'bild', 'preis']) assert.ok(erstes[feld], `${feld} fehlt`)
  assert.match(a.text, /Meistverkauft gerade: Hoodie, Shirt/)
})

test('ohne geholte Bestseller sagt der Text, was der Bot tun soll', async () => {
  const { fn } = hauptStarten()
  const a = await fn.botAuftrag({ aktion: 'ueberblick', argumente: {} })
  assert.deepEqual(a.daten.bestseller, [])
  assert.match(a.text, /shop_bestseller/)
  assert.match(a.text, /niemals Produkte erfinden/)
})

// ── Die Bot-Aktion ──

test('beide Ranglisten stehen im Bot-Vertrag, mit demselben Feld', () => {
  for (const aktion of ['shop_bestseller', 'shop_warenkorb']) {
    assert.ok(bots.AKTIONEN[aktion], `${aktion} ist erlaubt`)
    assert.deepEqual(bots.AKTIONEN[aktion], ['tage'])
    assert.ok(bots.NUR_LESEN.includes(aktion), `${aktion} aendert nichts`)
    assert.ok(bots.MIT_MAIL.includes(aktion), `${aktion} dauert laenger, der Bot wartet`)
  }
})

test('der Zeitraum wird auf 7 bis 365 Tage begrenzt', () => {
  const pruefen = (tage) => bots.auftragPruefen({ aktion: 'shop_bestseller', argumente: { tage } })
  assert.equal(pruefen(90).argumente.tage, 90)
  assert.equal(pruefen(5).ok, false, 'zu kurz')
  assert.equal(pruefen(400).ok, false, 'zu lang')
})

test('ein unbekanntes Feld fällt aus dem Auftrag', () => {
  const geprueft = bots.auftragPruefen({ aktion: 'shop_bestseller', argumente: { tage: 30, suche: 'hoodie' } })
  assert.equal(geprueft.ok, true, geprueft.fehler)
  assert.deepEqual(Object.keys(geprueft.argumente), ['tage'])
})

test('Renner tragen die Produktbeschreibung aus dem Shop mit — sonst schreibt die KI nur Floskeln', () => {
  const produkte = [{ titel: 'Hoodie', url: 'https://beispielshop.de/products/hoodie', bild: '', preis: '59,99 €', beschreibung: 'Schwere Baumwolle, 320 g/m².' }]
  const [e] = shoplinks.rennerVerbinden([{ titel: 'Hoodie', handle: 'hoodie', menge: 3 }], produkte)
  assert.equal(e.beschreibung, 'Schwere Baumwolle, 320 g/m².')
  const [ohne] = shoplinks.rennerVerbinden([{ titel: 'Weg', handle: 'weg', menge: 1 }], produkte)
  assert.equal(ohne.beschreibung, '')
  assert.ok(shoplinks.kurzText('<p>' + 'Ein Satz über das Motiv. '.repeat(40) + '</p>').length <= shoplinks.BESCHREIBUNG_MAX)
})
