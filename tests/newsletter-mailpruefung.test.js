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
import htmlMail from '../plugins/newsletter/html-mail.js'
import kampagnenModul from '../plugins/newsletter/kampagnen.js'
import vorlagenModul from '../plugins/newsletter/vorlagen.js'

const { doppelteBilder, erfundenePreise, preisKern } = shoplinks
const { bilderOhneAdresse, linksOhneZiel } = htmlMail

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

// ── Gerüste, die niemand gefüllt hat ──
// Eine Mail mit <img alt="Produkt 1" /> ohne src zeigt beim Empfänger ein kaputtes Bild,
// ein Knopf ohne href führt ins Leere. Beides blieb bis zur Vorschau unbemerkt, weil die
// Prüfung nur Bilder ansah, die überhaupt eine Adresse hatten.

test('ein Bild ganz ohne src wird gemeldet, nicht nur ein leeres', () => {
  assert.equal(bilderOhneAdresse('<img alt="Produkt 1" width="252" />').length, 1, 'ohne src')
  assert.equal(bilderOhneAdresse('<img src="" alt="x" />').length, 1, 'leeres src')
  assert.equal(bilderOhneAdresse('<img src="CDN_BILD_URL" alt="x" />').length, 1, 'Platzhalter aus der Referenz')
  assert.equal(bilderOhneAdresse('<img src="http://alt.de/a.png" alt="x" />').length, 1, 'http statt https')
})

test('echte Bilder und mitgeschickte Icons gehen durch', () => {
  assert.deepEqual(bilderOhneAdresse('<img src="https://cdn.shopify.com/a.png" alt="x" />'), [])
  assert.deepEqual(bilderOhneAdresse('<img src="cid:vendo-nl-instagram" width="22" alt="Instagram" />'), [])
  assert.deepEqual(bilderOhneAdresse('<img src="data:image/png;base64,AAA" alt="x" />'), [])
  assert.deepEqual(bilderOhneAdresse(''), [])
})

test('mehrere leere Bilder werden einzeln gezählt', () => {
  const html = '<img alt="Produkt 1" /><img alt="Produkt 2" /><img src="https://cdn.shopify.com/a.png" alt="echt" />'
  assert.equal(bilderOhneAdresse(html).length, 2)
})

test('ein Knopf ohne Ziel wird mit seinem Text gemeldet', () => {
  assert.deepEqual(linksOhneZiel('<a>ANSEHEN</a>'), ['ANSEHEN'])
  assert.deepEqual(linksOhneZiel('<a href="">JETZT KAUFEN</a>'), ['JETZT KAUFEN'])
  assert.deepEqual(linksOhneZiel('<a href="   ">Zum Shop</a>'), ['Zum Shop'])
  assert.deepEqual(linksOhneZiel('<a href="#">Zum Shop</a>'), ['Zum Shop'], 'eine Raute ist kein Ziel')
})

test('echte Ziele, mailto und tel gehen durch', () => {
  assert.deepEqual(linksOhneZiel('<a href="https://donnerwolf.de/products/x">Zum Produkt</a>'), [])
  assert.deepEqual(linksOhneZiel('<a href="mailto:info@beispiel.de?subject=Abmeldung">ABMELDEN</a>'), [])
  assert.deepEqual(linksOhneZiel('<a href="tel:+4900000">Anrufen</a>'), [])
  assert.deepEqual(linksOhneZiel(''), [])
})

test('ein Knopf, der nur ein Bild enthält, wird trotzdem erkannt', () => {
  assert.deepEqual(linksOhneZiel('<a href=""><img src="https://cdn.shopify.com/a.png" alt="x" /></a>'), ['(ohne Text)'])
})

test('derselbe tote Knopftext wird nur einmal gemeldet', () => {
  assert.deepEqual(linksOhneZiel('<a href="">ANSEHEN</a><a href="">ANSEHEN</a>'), ['ANSEHEN'])
})

// ── Beides sperrt Kampagne und Vorlage ──

const GERUEST = [
  '<table role="presentation"><tr><td>',
  '<img data-feld="produkt1_bild" alt="Produkt 1" width="252" />',
  '<span data-feld="produkt1_name">FENRIR Hoodie</span>',
  '<a data-feld="produkt1_knopf">ANSEHEN</a>',
  '</td></tr></table>'
].join('')

test('eine Kampagne mit ungefülltem Gerüst wird gesperrt', () => {
  const geprueft = kampagnenModul.kampagnePruefen({ name: 'Test', betreff: 'Test', html: GERUEST })
  assert.equal(geprueft.ok, false)
  assert.ok(
    geprueft.fehler.some((f) => /Bild hat keine gültige Adresse/.test(f)),
    'das leere Bild fehlt in den Meldungen'
  )
  assert.ok(
    geprueft.fehler.some((f) => /Knopf führt nirgendwohin.*ANSEHEN/.test(f)),
    'der tote Knopf fehlt in den Meldungen'
  )
})

test('eine Vorlage mit ungefülltem Gerüst wird ebenso beanstandet', () => {
  const geprueft = vorlagenModul.vorlagePruefen({ name: 'Test', html: GERUEST })
  assert.equal(geprueft.ok, false)
  assert.ok(geprueft.fehler.some((f) => /Bild hat noch keine gültige Adresse/.test(f)))
  assert.ok(geprueft.fehler.some((f) => /Knopf führt nirgendwohin/.test(f)))
})

test('eine gefüllte Kampagne geht durch', () => {
  const gut = GERUEST.replace('alt="Produkt 1"', 'src="https://cdn.shopify.com/a.png" alt="Hoodie"').replace(
    '<a data-feld="produkt1_knopf">',
    '<a data-feld="produkt1_knopf" href="https://donnerwolf.de/products/x">'
  )
  const geprueft = kampagnenModul.kampagnePruefen({ name: 'Test', betreff: 'Test', html: gut })
  assert.equal(geprueft.ok, true, geprueft.fehler.join(' '))
})
