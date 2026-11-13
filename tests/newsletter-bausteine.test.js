// Newsletter-Plugin, Phase 3: Bausteine für das Mail-HTML.
// Geprüft wird, dass Pflichtangaben (Abmeldelink, Impressum) immer im HTML landen, dass
// Inhalte maskiert werden und dass keine gefährlichen Links durchkommen.

import assert from 'node:assert/strict'
import test from 'node:test'
import bausteine from '../plugins/newsletter/bausteine.js'

const { mailAus, startVorlage, ARTEN, FELDER, BREITE } = bausteine

const MARKE = { titel: 'Beispiel', impressum: 'Beispiel GmbH, Musterweg 1, 12345 Musterstadt', farben: {} }
const ABMELDUNG = 'abmelden@beispiel.de'

const bauen = (liste, extra = {}) => mailAus(liste, { marke: MARKE, abmeldeAdresse: ABMELDUNG, ...extra })

// ── Pflichtangaben ──

test('der Fuß mit Abmeldelink und Impressum wird angehängt, auch wenn er fehlt', () => {
  const html = bauen([{ art: 'text', text: 'Hallo' }])
  assert.match(html, /mailto:abmelden@beispiel\.de\?subject=Abmeldung/)
  assert.match(html, /ABMELDEN/)
  assert.match(html, /Musterweg 1/)
})

test('ein vorhandener Fuß wird mit Adresse und Impressum versorgt', () => {
  const html = bauen([{ art: 'text', text: 'Hallo' }, { art: 'fuss', abmeldeText: 'Hier abmelden' }])
  assert.match(html, /Hier abmelden/)
  assert.match(html, /mailto:abmelden@beispiel\.de/)
  assert.equal(html.match(/subject=Abmeldung/g).length, 1, 'der Fuß kommt nur einmal vor')
})

test('das erzeugte HTML bestätigt die Prüfung in mail.js (es enthält „abmeld“)', () => {
  assert.match(bauen([{ art: 'text', text: 'x' }]).toLowerCase(), /abmeld/)
})

// ── Maskierung und Links ──

test('Inhalte werden maskiert: eingeschmuggelte Tags bleiben Text', () => {
  const html = bauen([{ art: 'text', text: '<script>alert(1)</script> und <b>fett</b>' }])
  assert.ok(!html.includes('<script>'), 'kein echtes script-Tag')
  assert.ok(!html.includes('<b>fett</b>'), 'kein echtes b-Tag')
  assert.match(html, /&lt;script&gt;/)
})

test('auch Überschriften, Produktnamen und Knopftexte werden maskiert', () => {
  const html = bauen([
    { art: 'titel', text: '<img src=x onerror=alert(1)>' },
    { art: 'produkt', titel: '"><script>x</script>', link: 'https://beispiel.de', knopfText: '<b>Kauf</b>' }
  ])
  // „onerror“ darf als Text vorkommen (maskiert), aber nicht als Attribut in einem Tag
  assert.ok(!/<img[^>]*onerror/i.test(html), 'kein img-Tag mit onerror')
  assert.match(html, /&lt;img src=x onerror/, 'es steht maskiert als Text da')
  assert.ok(!/<script>x<\/script>/.test(html))
  assert.match(html, /&lt;b&gt;Kauf/)
})

test('nur http(s)- und mailto-Links kommen durch', () => {
  const boese = bauen([{ art: 'knopf', text: 'Klick', link: 'javascript:alert(1)' }])
  assert.ok(!boese.includes('javascript:'), 'javascript:-Links werden verworfen')
  assert.ok(!boese.includes('Klick'), 'ohne gültigen Link entsteht der Knopf gar nicht')

  const gut = bauen([{ art: 'knopf', text: 'Klick', link: 'https://beispiel.de/shop' }])
  assert.match(gut, /href="https:\/\/beispiel\.de\/shop"/)
  assert.match(gut, /Klick/)
})

test('ein Bild ohne brauchbare Quelle wird weggelassen', () => {
  assert.ok(!bauen([{ art: 'bild', quelle: 'data:image/png;base64,AAA' }]).includes('data:image'))
  assert.match(bauen([{ art: 'bild', quelle: 'https://beispiel.de/b.png', alt: 'Bild' }]), /<img src="https:\/\/beispiel\.de\/b\.png"/)
})

// ── Aufbau ──

test('das HTML ist Tabellen-Layout mit fester Breite und Inline-CSS, dazu nur der Handy-Stil im Kopf', () => {
  const html = bauen([{ art: 'text', text: 'Hallo' }])
  assert.match(html, /^<!DOCTYPE html/)
  assert.match(html, new RegExp(`width="${BREITE}"`))
  assert.match(html, /role="presentation"/)
  // Das Layout hängt nur an Inline-CSS. Einziger <style>-Block ist Vendos Handy-Stil im
  // Kopf: nur eine Media Query, die Spalten auf dem Handy untereinander setzt. Wer ihn
  // nicht liest (Outlook am Rechner), sieht die Mail wie vorher.
  const bloecke = html.match(/<style[\s>][\s\S]*?<\/style>/g) || []
  assert.equal(bloecke.length, 1, 'genau ein style-Block: der Handy-Stil')
  assert.match(bloecke[0], /^<style type="text\/css">\s*@media only screen and \(max-width: \d+px\) \{/)
  assert.match(bloecke[0], /\.spalte \{ display: block !important; width: 100% !important;/)
  assert.ok(html.indexOf(bloecke[0]) < html.indexOf('</head>'), 'im Kopf, nicht im Körper')
  assert.ok(!/display:\s*flex|display:\s*grid/.test(html), 'kein Flexbox und kein Grid')
  assert.ok(!/<script/.test(html), 'kein JavaScript')
})

test('unbekannte Bausteinarten werden übergangen, nicht geraten', () => {
  const html = bauen([{ art: 'html', inhalt: '<div>frei</div>' }, { art: 'text', text: 'bleibt' }])
  assert.ok(!html.includes('<div>frei</div>'))
  assert.match(html, /bleibt/)
})

test('Absätze entstehen aus Leerzeilen, einfache Umbrüche werden zu <br />', () => {
  const html = bauen([{ art: 'text', text: 'Erster Absatz\n\nZweiter\nmit Umbruch' }])
  assert.equal((html.match(/<p style/g) || []).length >= 2, true)
  assert.match(html, /Zweiter<br \/>mit Umbruch/)
})

test('der Kopf nimmt das Logo der Marke, sonst den Namen als Schriftzug', () => {
  const mitLogo = mailAus([{ art: 'kopf' }], { marke: { ...MARKE, logo: 'https://beispiel.de/logo.png' }, abmeldeAdresse: ABMELDUNG })
  assert.match(mitLogo, /<img src="https:\/\/beispiel\.de\/logo\.png"/)

  const ohne = bauen([{ art: 'kopf' }])
  assert.match(ohne, /Beispiel/)
  assert.ok(!ohne.includes('<img'))
})

test('ein leeres Logo-Feld im Kopf verschluckt das Logo der Marke nicht', () => {
  // Der Editor speichert leere Felder als leeren String. Vorher gewann dieser leere String
  // gegen das Marken-Logo, und in der Mail stand kein Bild.
  const marke = { ...MARKE, logo: 'https://beispiel.de/logo.png' }
  const html = mailAus([{ art: 'kopf', logo: '', titel: '' }, { art: 'text', text: 'Hallo' }], { marke, abmeldeAdresse: ABMELDUNG })
  assert.match(html, /<img src="https:\/\/beispiel\.de\/logo\.png"/)
})

test('ein eigenes Logo im Baustein gewinnt gegen das der Marke', () => {
  const marke = { ...MARKE, logo: 'https://beispiel.de/marke.png' }
  const html = mailAus([{ art: 'kopf', logo: 'https://beispiel.de/eigenes.png' }], { marke, abmeldeAdresse: ABMELDUNG })
  // Nur der Kopf wird geprüft: im Fuß steht das Marken-Logo absichtlich (siehe fussTeileAus).
  const kopf = html.slice(0, html.indexOf('border-top'))
  assert.match(kopf, /eigenes\.png/)
  assert.ok(!kopf.includes('marke.png'))
})

test('ohne Logo in Baustein und Marke bleibt der Name als Schriftzug', () => {
  const html = mailAus([{ art: 'kopf', logo: '' }], { marke: { ...MARKE, logo: '' }, abmeldeAdresse: ABMELDUNG })
  assert.ok(!html.includes('<img'))
  assert.match(html, /Beispiel/)
})

test('der Vorschautext steht versteckt im HTML', () => {
  const html = bauen([{ art: 'text', text: 'x' }], { vorschauText: 'Kurz angerissen' })
  assert.match(html, /display:none[^"]*"?>Kurz angerissen/)
})

test('startVorlage liefert nur den Inhalt — Kopf setzt Vendo selbst davor', () => {
  const vorlage = startVorlage()
  assert.ok(!vorlage.some((b) => b.art === 'kopf'), 'der Kopf kommt aus den Markenangaben')
  assert.equal(vorlage[vorlage.length - 1].art, 'fuss')
  assert.ok(vorlage.some((b) => b.art === 'text'))
  for (const b of vorlage) assert.ok(ARTEN.includes(b.art), `${b.art} ist eine bekannte Art`)
})

test('zu jeder Art sind die Felder beschrieben (für Oberfläche und KI-Auftrag)', () => {
  for (const art of ARTEN) assert.ok(Array.isArray(FELDER[art]), `${art} hat eine Feldliste`)
})

test('eine leere oder kaputte Bausteinliste ergibt trotzdem eine vollständige Mail', () => {
  for (const eingabe of [[], null, 'kein Array', [null, 42, {}]]) {
    const html = bauen(eingabe)
    assert.match(html, /mailto:abmelden@beispiel\.de/)
    assert.match(html, /Musterweg 1/)
  }
})
