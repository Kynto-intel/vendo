// Newsletter-Plugin: UTM-Parameter an Shop-Links.
// Vendo-Mails sind eigenes HTML; ohne UTM ordnet Shopify Analytics Besuche keiner Mail zu.
// Geprüft wird, dass Vendo beim Bauen von Kampagnen- und Automationsmails an jeden Link in
// den eigenen Shop utm_source=vendo, utm_medium=email und utm_campaign=<Kurzname> hängt —
// und nichts sonst anfasst: fremde Adressen, mailto, Platzhalter, schon gesetzte UTM, den
// Fuß, Vorlagen. Alle Daten sind erfunden, es geht nichts ins Netz.

import assert from 'node:assert/strict'
import test from 'node:test'
import htmlMail from '../plugins/newsletter/html-mail.js'
import starten from '../plugins/newsletter/haupt.js'

const { utmName, utmAnhaengen } = htmlMail
const HOSTS = ['beispielshop.de', 'www.beispielshop.de']
const UTM = 'utm_source=vendo&amp;utm_medium=email&amp;utm_campaign='

test('utmName macht aus einem Kampagnennamen einen sauberen Kurznamen', () => {
  assert.equal(utmName('Bestseller November'), 'bestseller-november')
  assert.equal(utmName('Für Sie & Ihn – Größen bis 5XL!'), 'fuer-sie-ihn-groessen-bis-5xl')
  assert.equal(utmName('  '), '')
  assert.ok(utmName('x'.repeat(200)).length <= 60)
})

test('utmAnhaengen: nur Links in den eigenen Shop, Anker und vorhandene Parameter bleiben', () => {
  const html = [
    '<a href="https://beispielshop.de/products/rabe">A</a>',
    '<a href="https://www.beispielshop.de/collections/neu?sort=best#oben">B</a>',
    '<a href="https://fremd.de/x">C</a>',
    '<a href="{{warenkorbLink}}">D</a>',
    '<a href="mailto:abmelden@beispiel.de">E</a>',
    '<a href="https://beispielshop.de/x?utm_source=eigen">F</a>',
    '<img src="https://cdn.shopify.com/s/files/rabe.png" />'
  ].join('')
  const r = utmAnhaengen(html, { hosts: HOSTS, kampagne: 'Bestseller November' })
  assert.match(r, /href="https:\/\/beispielshop\.de\/products\/rabe\?utm_source=vendo&amp;utm_medium=email&amp;utm_campaign=bestseller-november"/)
  assert.match(r, /href="https:\/\/www\.beispielshop\.de\/collections\/neu\?sort=best&amp;utm_source=vendo&amp;utm_medium=email&amp;utm_campaign=bestseller-november#oben"/)
  assert.match(r, /href="https:\/\/fremd\.de\/x"/, 'fremde Adresse unverändert')
  assert.match(r, /href="\{\{warenkorbLink\}\}"/, 'Platzhalter unverändert')
  assert.match(r, /href="mailto:abmelden@beispiel\.de"/, 'mailto unverändert')
  assert.match(r, /href="https:\/\/beispielshop\.de\/x\?utm_source=eigen"/, 'vorhandene UTM bleiben')
  assert.match(r, /src="https:\/\/cdn\.shopify\.com\/s\/files\/rabe\.png"/, 'Bilder unverändert')
  assert.equal(utmAnhaengen(html, { hosts: [], kampagne: 'x' }), html, 'ohne bekannte Shop-Adresse nichts')
  assert.equal(utmAnhaengen(html, { hosts: HOSTS, kampagne: '' }), html, 'ohne Namen nichts')
})

function hauptStarten() {
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: {
      titel: 'Beispielshop',
      impressum: 'Beispielshop, Musterweg 1',
      abmeldeAdresse: 'abmelden@beispiel.de',
      farben: {},
      fuss: { impressumUrl: 'https://beispielshop.de/pages/impressum' }
    },
    shopify: { shop: 'beispielshop.myshopify.com', primaerDomain: 'beispielshop.de' },
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: []
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
    abrufen: async () => ({ ok: false, status: 0 })
  })
  return { fn, daten: () => daten, setzen: (x) => (daten = { ...daten, ...x }) }
}

const INHALT = '<p><a href="https://beispielshop.de/products/rabe">Zum Shirt</a></p>'

test('Kampagnen-Vorschau und Live-Vorschau tragen UTM mit dem Kampagnennamen', () => {
  const { fn } = hauptStarten()
  const id = fn.kampagneAnlegen('Herbst Drop').id
  fn.kampagneSpeichern({ id, name: 'Herbst Drop', betreff: 'Neu', html: INHALT })
  const vorschau = fn.kampagneVorschau(id)
  assert.ok(vorschau.html.includes(`products/rabe?${UTM}herbst-drop`), 'Vorschau')
  const live = fn.mailVorschau({ name: 'Herbst Drop', betreff: 'Neu', html: INHALT })
  assert.ok(live.html.includes(`products/rabe?${UTM}herbst-drop`), 'Live-Vorschau')
})

test('Automationsschritte bekommen Name und Schritt als Kurzname, der Warenkorb-Link bleibt', () => {
  const h = hauptStarten()
  h.setzen({
    automationen: [
      { id: 'a1abcdef', name: 'Warenkorb', art: 'warenkorb', aktiv: false, schritte: [{ nach: 3600000, verfallNach: 172800000, betreff: 'Noch da?', html: `${INHALT}<p><a href="{{warenkorbLink}}">Zurück zum Warenkorb</a></p>` }] }
    ]
  })
  const r = h.fn.automationVorschau({ id: 'a1abcdef', schritt: 0 })
  assert.ok(r.html.includes(`products/rabe?${UTM}warenkorb-schritt-1`), r.html.slice(0, 300))
  assert.ok(r.html.includes('href="https://beispiel.de/warenkorb-wiederherstellen"'), 'Warenkorb-Link ohne UTM')
})

test('Vorlagen-Vorschau und Fuß bleiben ohne UTM', () => {
  const { fn } = hauptStarten()
  const vId = fn.vorlageAnlegen({ name: 'Eigene' }).id
  fn.vorlageSpeichern({ id: vId, html: '<p data-feld="x"><a href="https://beispielshop.de/products/rabe">A</a></p>' })
  assert.doesNotMatch(fn.vorlageVorschau(vId).html, /utm_source/, 'eine Vorlage ist keine Kampagne')

  const kId = fn.kampagneAnlegen('Mit Fuss').id
  fn.kampagneSpeichern({ id: kId, name: 'Mit Fuss', betreff: 'x', html: INHALT })
  const html = fn.kampagneVorschau(kId).html
  assert.ok(html.includes('href="https://beispielshop.de/pages/impressum"'), 'der Fuß verlinkt das Impressum im Shop, ohne UTM')
  const fuss = html.slice(html.lastIndexOf('Zum Shirt'))
  assert.doesNotMatch(fuss, /utm_source/, 'Fuß, Impressum und Abmeldelink ohne UTM')
})
