// Newsletter-Plugin: zwei Prüfungen gegen das, was eine KI beim Mailbau falsch macht.
//
// Anlass war eine echte Vorlage: zwei durchgestrichene Preise, die es im Shop nicht gibt
// (Rabatt erfunden), dasselbe Produktfoto dreimal, und vier von sechs Produkten derselbe
// schwarze Hoodie. Die ersten beiden kann Vendo objektiv erkennen, hier wird das geprüft.
//
// Alle Daten sind erfunden, es geht nichts nach außen, es wird keine Datei geschrieben.

import assert from 'node:assert/strict'
import test from 'node:test'
import shoplinks from '../plugins/newsletter/shoplinks.js'

const { doppelteBilder, erfundenePreise, preisKern } = shoplinks

const bild = (url, extra = '') => `<img ${extra} src="${url}" width="252" alt="x" style="display:block;" />`
const strich = (preis) => `<span style="color:#6b6560;text-decoration:line-through;">${preis}</span>`

const SHIRT = 'https://cdn.shopify.com/s/files/1/0001/front-shirt-black.png'
const HOODIE = 'https://cdn.shopify.com/s/files/1/0001/back-hoodie-black.png'

// ── Dasselbe Bild mehrfach ──

test('ein Bild dreimal wird mit Anzahl gemeldet', () => {
  const html = bild(SHIRT) + bild(HOODIE) + bild(SHIRT) + bild(SHIRT)
  const r = doppelteBilder(html)
  assert.equal(r.length, 1)
  assert.equal(r[0].url, SHIRT)
  assert.equal(r[0].anzahl, 3)
})

test('verschiedene Bilder melden nichts', () => {
  assert.deepEqual(doppelteBilder(bild(SHIRT) + bild(HOODIE)), [])
  assert.deepEqual(doppelteBilder(''), [])
  assert.deepEqual(doppelteBilder(null), [])
})

test('derselbe Shopify-Link mit anderer Version ist dasselbe Bild', () => {
  // Shopify hängt ?v=… an; dieselbe Datei zweimal bleibt dieselbe Datei
  const html = bild(`${SHIRT}?v=1791674015`) + bild(`${SHIRT}?v=1791999999`)
  assert.deepEqual(
    doppelteBilder(html).map((b) => [b.url, b.anzahl]),
    [[SHIRT, 2]]
  )
})

test('die häufigste Dopplung steht vorn', () => {
  const html = bild(SHIRT) + bild(SHIRT) + bild(HOODIE) + bild(HOODIE) + bild(HOODIE)
  assert.deepEqual(
    doppelteBilder(html).map((b) => b.anzahl),
    [3, 2]
  )
})

test('mitgeschickte Icons und Platzhalter zählen nicht als Bild', () => {
  const html = '<img src="cid:vendo-nl-instagram" /><img src="data:image/png;base64,AAA" /><img src="" />'
  assert.deepEqual(doppelteBilder(html + html), [], 'nur echte http-Adressen werden gezählt')
})

test('das Attribut davor bringt die Erkennung nicht durcheinander', () => {
  const html = bild(SHIRT, 'data-feld="produkt1_bild" data-feld-hinweis="Bild aus shop_produkte"') + bild(SHIRT)
  assert.equal(doppelteBilder(html)[0].anzahl, 2)
})

// ── Erfundene Streichpreise ──

const PRODUKTE = [
  { titel: 'Shirt', preis: '24,95 €', vergleichspreis: '' },
  { titel: 'Hoodie', preis: '59,99 €', vergleichspreis: '' },
  { titel: 'Restposten', preis: '19,95 €', vergleichspreis: '29,95 €' }
]

test('ein Streichpreis ohne Vergleichspreis im Shop wird gemeldet', () => {
  assert.deepEqual(erfundenePreise(strich('31,95 €'), PRODUKTE), ['31,95 €'])
  assert.deepEqual(erfundenePreise(strich('31,95 €') + strich('58,95 €'), PRODUKTE), ['31,95 €', '58,95 €'])
})

test('ein Streichpreis, den es im Shop wirklich gibt, ist in Ordnung', () => {
  assert.deepEqual(erfundenePreise(strich('29,95 €'), PRODUKTE), [])
})

test('Schreibweise des Preises ist egal', () => {
  for (const schreibweise of ['29,95 €', '29,95€', '29,95 EUR', '29.95 €']) {
    assert.deepEqual(erfundenePreise(strich(schreibweise), PRODUKTE), [], `${schreibweise} sollte durchgehen`)
  }
  assert.equal(preisKern('29,95 €'), '29.95')
  assert.equal(preisKern('1.299,00 €'), '1299.00')
})

test('ein leeres durchgestrichenes Feld ist kein erfundener Preis', () => {
  assert.deepEqual(erfundenePreise(strich(''), PRODUKTE), [])
  assert.deepEqual(erfundenePreise(strich('   '), PRODUKTE), [])
  assert.deepEqual(erfundenePreise(strich('0,00 €'), PRODUKTE), [], 'null ist kein alter Preis')
})

test('ohne Produktliste gilt jeder Streichpreis als unbelegt', () => {
  // So ist es, wenn der Shop gar keine Vergleichspreise führt — dann darf keiner dastehen
  assert.deepEqual(erfundenePreise(strich('31,95 €'), []), ['31,95 €'])
  assert.deepEqual(erfundenePreise(strich('31,95 €'), null), ['31,95 €'])
})

test('derselbe erfundene Preis wird nur einmal gemeldet', () => {
  assert.deepEqual(erfundenePreise(strich('31,95 €') + strich('31,95 €'), PRODUKTE), ['31,95 €'])
})

test('eine Mail ohne Streichpreise meldet nichts', () => {
  assert.deepEqual(erfundenePreise('<span>24,95 €</span>', PRODUKTE), [])
  assert.deepEqual(erfundenePreise('', PRODUKTE), [])
})

// ── Der echte Fall, der den Anlass gab ──

test('die beanstandete Vorlage fällt in beiden Prüfungen auf', () => {
  // Nachgebaut: Shirt-Foto im Aufmacher, beim ersten Produkt und auf dem Sammlungsband,
  // dazu zwei Streichpreise, die kein Produkt des Shops hat.
  const html = [
    bild(`${SHIRT}?v=1`),
    bild(`${SHIRT}?v=1`) + '24,95 €' + strich('31,95 €'),
    bild(HOODIE) + '49,95 €' + strich('58,95 €'),
    bild(`${SHIRT}?v=2`)
  ].join('')

  const doppelt = doppelteBilder(html)
  assert.equal(doppelt.length, 1)
  assert.equal(doppelt[0].anzahl, 3, 'das Shirt-Foto steht dreimal')

  assert.deepEqual(erfundenePreise(html, PRODUKTE), ['31,95 €', '58,95 €'])
})
