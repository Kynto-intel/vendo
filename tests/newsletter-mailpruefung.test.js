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
import musterModul from '../plugins/newsletter/muster.js'

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

// ── Aufbau gegenüber dem Muster ──

test('aufbauAehnlichkeit: nur Inhalte getauscht ergibt 1, verschiedene Muster bleiben deutlich darunter', () => {
  const { aufbauAehnlichkeit } = htmlMail
  const { musterListe, musterHtml } = musterModul
  const basis = musterHtml('bestseller')
  const getauscht = basis.replace(/>([^<]{3,})</g, '>Anderer Text<').replace(/href="[^"]*"/g, 'href="https://beispielshop.de/products/x"')
  assert.equal(aufbauAehnlichkeit(getauscht, basis), 1)
  for (const x of musterListe()) {
    if (x.id === 'bestseller') continue
    assert.ok(aufbauAehnlichkeit(musterHtml(x.id), basis) < 0.9, `${x.id} gilt fälschlich als Nachbau`)
  }
  const halb = basis.split('<tr>').slice(0, 6).join('<tr>')
  assert.ok(aufbauAehnlichkeit(halb, basis) < 0.9, 'kräftig gekürzt ist ein anderer Aufbau')
  assert.equal(aufbauAehnlichkeit('', basis), 0)
})

// ── Spalten, die auf dem Handy umbrechen ──

test('starreSpalten: nebeneinander gesetzte Zellen ohne class="spalte" fallen auf, die Muster nicht', () => {
  const { starreSpalten } = htmlMail
  assert.equal(starreSpalten('<table><tr><td width="50%">a</td><td width="50%">b</td></tr></table>'), 2)
  assert.equal(starreSpalten('<td style="padding:0;width:40%;">a</td>'), 1)
  assert.equal(starreSpalten('<td width="268">a</td>'), 1)
  assert.equal(starreSpalten('<td class="karte spalte" width="50%">a</td>'), 0)
  assert.equal(starreSpalten('<td width="100%">a</td><td width="600">b</td><td>c</td>'), 0, 'volle Breite ist keine Spalte')
  for (const x of musterModul.musterListe()) assert.equal(starreSpalten(musterModul.musterHtml(x.id)), 0, x.id)
})

// ── Hausregeln für Texte ──

test('hausregelVerstoesse: Gedankenstriche überall, Ausnahmen für Produktnamen, Floskeln der Vermeiden-Liste', () => {
  const { hausregelVerstoesse } = htmlMail
  assert.deepEqual(hausregelVerstoesse({ betreff: 'Zwei neue Motive', vorschauText: 'Schwer, limitiert', html: '<p>Sauberer Text, ohne Strich.</p>' }), [])
  const striche = hausregelVerstoesse({ betreff: 'A – B', vorschauText: 'C — D', html: '<p>E – F</p>' })
  assert.equal(striche.length, 1)
  assert.match(striche[0], /3× gefunden: Betreff: „A – B“; Vorschautext: „C — D“; Text: „E – F“/)
  assert.deepEqual(hausregelVerstoesse({ html: '<p>Das Mysteriöses Symbol – Wikinger Shirt ist da.</p>' }, { ausnahmen: ['Mysteriöses Symbol – Wikinger Shirt'] }), [], 'Produktname aus dem Shop')
  assert.deepEqual(hausregelVerstoesse({ html: '<span data-feld="produkt1_name">Rabe – Shirt</span>' }), [], 'Name in einem Namensfeld')
  assert.equal(hausregelVerstoesse({ html: '<p>Bindestrich-Wörter sind erlaubt.</p>' }).length, 0)
  const floskeln = hausregelVerstoesse({ betreff: 'Willkommen bei Beispielshop!', html: '<p>Verpasse nicht die letzte Chance, nur für dich. Tauche ein in die Welt.</p>' })
  assert.match(floskeln[0], /Verpasse nicht …, nur für dich, letzte Chance, Tauche ein in …, „Willkommen bei …“ als ganzer Betreff/)
})

test('produkteOhneText: jedes markierte Produkt braucht eigenen Text, die Muster haben ein Feld dafür', () => {
  const { produkteOhneText } = htmlMail
  assert.deepEqual(produkteOhneText('<span data-feld="produkt1_name">A</span><span data-feld="produkt2_name">B</span>'), ['produkt1', 'produkt2'])
  assert.deepEqual(produkteOhneText('<span data-feld="produkt1_name">A</span><p data-feld="produkt1_text">zu kurz</p>'), ['produkt1'])
  assert.deepEqual(produkteOhneText('<span data-feld="produkt1_name">A</span><p data-feld="produkt1_text">Schwere Baumwolle, <strong>280 g/m²</strong>, normal geschnitten.</p>'), [])
  assert.deepEqual(produkteOhneText('<p>Frei gebaut, ohne markierte Felder.</p>'), [], 'ohne Namensfelder wird nichts geprüft')
  for (const x of musterModul.musterListe()) {
    const html = musterModul.musterHtml(x.id)
    const namen = [...html.matchAll(/data-feld="(produkt\d+)_name"/g)].map((t) => t[1])
    const texte = [...html.matchAll(/data-feld="(produkt\d+)_text"/g)].map((t) => t[1])
    // ein-motiv erzählt sein Produkt im Feld „geschichte“
    if (x.id !== 'ein-motiv') assert.deepEqual(texte, namen, `${x.id}: jedes Produkt hat ein Textfeld`)
  }
})

test('eine 429 von Shopify wird nicht gemerkt: der nächste Versuch kann durchgehen', async () => {
  shoplinks.vergessen()
  let anfragen = 0
  const abrufen = async (url) => {
    anfragen += 1
    return { status: anfragen <= 2 ? 429 : 200, ok: anfragen > 2, url }
  }
  const html = '<a href="https://beispielshop.de/products/rabe">Rabe</a>'
  const erst = await shoplinks.adressenPruefen(html, { hosts: ['beispielshop.de'], abrufen })
  assert.equal(erst.ok, false)
  assert.match(erst.probleme[0].grund, /Status 429/)
  const dann = await shoplinks.adressenPruefen(html, { hosts: ['beispielshop.de'], abrufen })
  assert.equal(dann.ok, true, 'nicht aus dem Gedächtnis gesperrt')
  shoplinks.vergessen()
})
