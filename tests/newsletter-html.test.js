// Newsletter-Plugin: eigenes HTML als Kampagneninhalt.
// Geprüft wird das Säubern (was fliegt raus, was bleibt), beide Rahmen-Arten, dass der Fuß
// mit Abmeldelink und Impressum immer dabei ist, die maskierte Personalisierung und das
// Zusammenspiel mit mail.js — eine Kampagnenmail ohne Abmeldeweg darf nicht gebaut werden.
// Es geht nie eine Mail raus und es wird keine Datei geschrieben.

import assert from 'node:assert/strict'
import test from 'node:test'
import htmlMail from '../plugins/newsletter/html-mail.js'
import kampagnenModul from '../plugins/newsletter/kampagnen.js'
import bausteineModul from '../plugins/newsletter/bausteine.js'
import mailModul from '../plugins/newsletter/mail.js'
import starten from '../plugins/newsletter/haupt.js'

const { htmlSaeubern, mailAusHtml, htmlAusBausteinen, beispielHtml, hatInhalt, istDokument, koerperAus, MAX_HTML } = htmlMail
const { neueKampagne, kampagnePruefen, personalisierenHtml, htmlVon } = kampagnenModul
const { startVorlage } = bausteineModul
const { mailBauen, textAusHtml } = mailModul

const MARKE = { titel: 'Beispielshop', impressum: 'Beispielshop GmbH, Musterweg 1, 12345 Musterstadt', farben: {} }
const ABMELDE = 'info@beispiel.de'
const ZUGANG = { benutzer: 'info@beispiel.de', absenderName: 'Beispielshop', host: 'smtp.beispiel.de', port: 465 }

const bauen = (html, extra = {}) => mailAusHtml(html, { marke: MARKE, abmeldeAdresse: ABMELDE, ...extra })

// ── Säubern ──

test('Skripte fliegen samt Inhalt raus', () => {
  const r = htmlSaeubern('<p>Vorher</p><script>alert(1)</script><p>Nachher</p>')
  assert.equal(r.html, '<p>Vorher</p><p>Nachher</p>')
  assert.match(r.hinweis, /Skripte/)
})

test('Ereignis-Attribute verschwinden, das Element bleibt', () => {
  const r = htmlSaeubern('<td onclick="boese()" style="padding:8px">Text</td>')
  assert.equal(r.html, '<td style="padding:8px">Text</td>')
  assert.match(r.hinweis, /Ereignis/)
})

test('javascript:-Adressen werden entschärft, http und mailto bleiben', () => {
  assert.match(htmlSaeubern('<a href="javascript:alert(1)">X</a>').html, /href="#"/)
  assert.match(htmlSaeubern('<a href="https://beispiel.de/shop">X</a>').html, /href="https:\/\/beispiel\.de\/shop"/)
  assert.match(htmlSaeubern('<a href="mailto:info@beispiel.de">X</a>').html, /mailto:info@beispiel\.de/)
})

test('eingebettete Rahmen, Objekte und Formulare fliegen raus', () => {
  const r = htmlSaeubern('<iframe src="https://fremd.de"></iframe><form action="https://fremd.de"><p>Feld</p></form><object data="x"></object>')
  assert.doesNotMatch(r.html, /iframe|<form|object/i)
})

test('Bilder, Tabellen, Inline-CSS und Outlook-Kommentare bleiben unangetastet', () => {
  const quelle = '<!--[if mso]><table><tr><td>Outlook</td></tr></table><![endif]--><table style="width:600px"><tr><td><img src="https://beispiel.de/bild.png" width="536" /></td></tr></table>'
  const r = htmlSaeubern(quelle)
  assert.equal(r.html, quelle)
  assert.equal(r.hinweis, '')
})

test('eingebettete Bilder als data: bleiben, data:text/html nicht', () => {
  assert.match(htmlSaeubern('<img src="data:image/png;base64,iVBORw0KGgo=" />').html, /data:image\/png/)
  assert.match(htmlSaeubern('<a href="data:text/html;base64,PHNjcmlwdD4=">X</a>').html, /href="#"/)
})

test('langes HTML wird gekappt statt unbesehen übernommen', () => {
  const lang = `<p>${'x'.repeat(MAX_HTML + 5000)}</p>`
  assert.equal(htmlSaeubern(lang).html.length, MAX_HTML)
})

// ── Mail bauen ──

test('mit Rahmen entsteht ein vollständiges Dokument mit 600-px-Fläche', () => {
  const r = bauen('<p>Hallo</p>')
  assert.match(r.html, /^<!DOCTYPE html/)
  assert.match(r.html, /max-width:600px/)
  assert.match(r.html, /<p>Hallo<\/p>/)
})

// Dieser Test hält den Fehler fest, der in der Handy-Vorschau auffiel: mit
// `width="600" style="width:600px;max-width:100%"` blieb die Mail in einem 390-px-Fenster
// 628 px breit, weil eine Tabelle in einer Tabellenzelle eine prozentuale Höchstbreite
// nicht ausrechnet. Jetzt: 100 % Breite mit absoluter Höchstbreite.
test('die Fläche ist mitgehend gebaut, nicht auf 600 px festgenagelt', () => {
  for (const rahmen of [true, false]) {
    const html = bauen('<p>Hallo</p>', { rahmen }).html
    assert.doesNotMatch(html, /style="width:600px;max-width:100%/, `rahmen=${rahmen}`)
    assert.match(html, /width="100%" style="width:100%;max-width:600px/, `rahmen=${rahmen}`)
    // Outlook kennt max-width nicht und bekommt seine feste Tabelle im Bedingungskommentar
    assert.match(html, /<!--\[if mso\]><table[^>]*width="600"/, `rahmen=${rahmen}`)
  }
})

test('der Fuß mit Abmeldelink und Impressum ist immer dabei', () => {
  for (const rahmen of [true, false]) {
    const r = bauen('<p>Hallo</p>', { rahmen })
    assert.match(r.html, /mailto:info@beispiel\.de\?subject=Abmeldung/, `rahmen=${rahmen}`)
    assert.match(r.html, /Musterweg 1/, `rahmen=${rahmen}`)
  }
})

test('ohne Rahmen bleibt ein fremdes Dokument erhalten, der Fuß kommt vor </body>', () => {
  const fremd = '<!DOCTYPE html><html><head><title>Fremd</title></head><body><table><tr><td>Agenturvorlage</td></tr></table></body></html>'
  const r = bauen(fremd, { rahmen: false })
  assert.match(r.html, /<title>Fremd<\/title>/, 'der eigene Kopf bleibt')
  assert.doesNotMatch(r.html, /<tr><td style="padding:0;background-color:#ffffff;">\s*<table><tr><td>Agenturvorlage/, 'kein Vendo-Rahmen um den Inhalt')
  assert.match(r.html, /<table><tr><td>Agenturvorlage<\/td><\/tr><\/table>/, 'die Vorlage selbst bleibt unangetastet')
  const fussStelle = r.html.indexOf('subject=Abmeldung')
  assert.ok(fussStelle > 0 && fussStelle < r.html.lastIndexOf('</body>'), 'der Fuß steht im Rumpf')
})

test('ein ganzes Dokument im Rahmen-Modus wird auf seinen Rumpf zurückgeschnitten', () => {
  const r = bauen('<html><head><style>p{color:red}</style></head><body><p>Nur das hier</p></body></html>')
  assert.match(r.html, /<p>Nur das hier<\/p>/)
  assert.equal((r.html.match(/<body/gi) || []).length, 1, 'kein zweiter body')
})

test('der Vorschautext steht versteckt in der Mail', () => {
  const r = bauen('<p>Hallo</p>', { vorschauText: 'Kurz angeteasert' })
  assert.match(r.html, /display:none[^>]*>Kurz angeteasert/)
})

test('istDokument und koerperAus erkennen Dokument und Rumpf', () => {
  assert.equal(istDokument('<p>x</p>'), false)
  assert.equal(istDokument('<html><body><p>x</p></body></html>'), true)
  assert.equal(koerperAus('<html><head><title>T</title></head><body><p>x</p></body></html>').trim(), '<p>x</p>')
})

// ── Inhalt erkennen ──

test('hatInhalt unterscheidet Sichtbares von Leerlauf', () => {
  assert.equal(hatInhalt(''), false)
  assert.equal(hatInhalt('<!-- nur eine Notiz --><table><tr><td></td></tr></table>'), false)
  assert.equal(hatInhalt('<p>Ein Satz</p>'), true)
  assert.equal(hatInhalt('<img src="https://beispiel.de/b.png" />'), true, 'eine reine Bildmail ist Inhalt')
})

// ── Startpunkte für den Editor ──

test('htmlAusBausteinen gibt den Stand der Bausteine als Quelltext', () => {
  const html = htmlAusBausteinen(startVorlage(), { marke: MARKE })
  assert.match(html, /^<table/)
  assert.match(html, /Überschrift/)
  assert.doesNotMatch(html, /subject=Abmeldung/, 'der Fuß kommt erst beim Bauen dazu')
})

test('das Beispiel ist sauberes Tabellen-HTML mit Platzhalter', () => {
  const html = beispielHtml({ marke: MARKE })
  assert.match(html, /\{\{vorname\}\}/)
  assert.match(html, /<table/)
  assert.equal(htmlSaeubern(html).hinweis, '', 'das eigene Beispiel übersteht das Säubern unverändert')
})

// ── Personalisieren ──

test('Platzhalter werden im HTML ersetzt und dabei maskiert', () => {
  const html = personalisierenHtml('<p>Hallo {{vorname}} {{nachname}}</p>', { vorname: 'Max', nachname: '<b>Muster</b>' })
  assert.equal(html, '<p>Hallo Max &lt;b&gt;Muster&lt;/b&gt;</p>')
})

test('unbekannte Platzhalter bleiben stehen, damit man sie beim Testversand sieht', () => {
  assert.equal(personalisierenHtml('<p>{{gibtesnicht}}</p>', { vorname: 'Max' }), '<p>{{gibtesnicht}}</p>')
})

// ── Kampagne im HTML-Modus ──

test('eine neue Kampagne startet mit der Startmail als Quelltext', () => {
  const k = neueKampagne({ name: 'Test' })
  assert.match(k.html, /^<table/)
  assert.equal(k.htmlRahmen, true)
  assert.equal(k.modus, undefined, 'es gibt keinen zweiten Weg mehr')
})

test('geprüft wird das HTML', () => {
  const leer = kampagnePruefen({ betreff: 'Betreff', html: '  ' })
  assert.equal(leer.ok, false)
  assert.match(leer.fehler.join(' '), /keinen sichtbaren Inhalt/)
  assert.equal(kampagnePruefen({ betreff: 'Betreff', html: '<p>Inhalt</p>' }).ok, true)
})

// Der Umbau auf HTML darf vorhandene Arbeit nicht wegwerfen
test('gespeicherte Bausteine werden zu HTML, wenn noch keines da ist', () => {
  const alt = { betreff: 'Betreff', bausteine: startVorlage() }
  const geprueft = kampagnePruefen(alt)
  assert.equal(geprueft.ok, true)
  assert.match(geprueft.html, /Überschrift/)
  assert.equal(htmlVon({ html: '<p>neu</p>', bausteine: startVorlage() }), '<p>neu</p>', 'vorhandenes HTML hat Vorrang')
})

// ── Zusammenspiel mit dem Versand ──

test('eine HTML-Kampagne lässt sich als Kampagnenmail bauen', () => {
  const html = bauen('<p>Hallo {{vorname}}</p>').html
  const gebaut = mailBauen({ art: 'kampagne', an: 'kunde@beispiel.de', betreff: 'Neu im Shop', html, zugang: ZUGANG, abmeldeAdresse: ABMELDE })
  assert.equal(gebaut.ok, true, gebaut.fehler?.join(' '))
  assert.match(gebaut.mail.headers['List-Unsubscribe'], /info@beispiel\.de/)
  assert.ok(gebaut.mail.text.includes('Hallo'), 'der Textteil wird abgeleitet')
})

test('ohne Abmeldeweg wird auch im HTML-Modus keine Kampagnenmail gebaut', () => {
  const ohneFuss = mailAusHtml('<p>Hallo</p>', { marke: { titel: 'X' }, abmeldeAdresse: '', rahmen: true }).html
  const gebaut = mailBauen({ art: 'kampagne', an: 'kunde@beispiel.de', betreff: 'Neu', html: ohneFuss, zugang: ZUGANG, abmeldeAdresse: '' })
  assert.equal(gebaut.ok, false)
  assert.match(gebaut.fehler.join(' '), /Abmelde/)
})

// ── Zusammenspiel in haupt.js ──
// Der Hintergrundteil wird mit erfundenen Daten im Speicher gestartet: kein Electron, keine
// Datei, kein Netz. Der Versandtakt läuft ohne Referenz (`unref`) und hält nichts am Leben.

function hauptStarten() {
  let daten = {
    zugang: { benutzer: ABMELDE },
    marke: { ...MARKE, abmeldeAdresse: ABMELDE },
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
    eingangOrdner: false // nie den echten Eingangskorb der Bots anfassen
  })
  return fn
}

test('eine neue Kampagne kommt mit Inhalt und lässt sich überschreiben', () => {
  const fn = hauptStarten()
  const id = fn.kampagneAnlegen('Rauchtest').id
  assert.match(fn.kampagnenLesen().liste[0].html, /^<table/, 'nicht leer, sondern die Startmail')

  assert.equal(fn.kampagneSpeichern({ id, name: 'Neuer Name', betreff: 'Hallo', html: '<p>Eigenes HTML</p>' }).ok, true)
  const nachher = fn.kampagnenLesen().liste[0]
  assert.equal(nachher.name, 'Neuer Name', 'der Name kommt an')
  assert.equal(nachher.html, '<p>Eigenes HTML</p>')
})

test('die Vorschau einer HTML-Kampagne säubert, ergänzt den Fuß und sagt es an', () => {
  const fn = hauptStarten()
  const id = fn.kampagneAnlegen('Rauchtest').id
  fn.kampagneSpeichern({ id, betreff: 'Hallo', modus: 'html', html: '<p onclick="boese()">Hallo</p><script>boese()</script>' })

  const v = fn.kampagneVorschau(id)
  assert.equal(v.ok, true)
  assert.doesNotMatch(v.html, /<script|onclick/i)
  assert.match(v.html, /subject=Abmeldung/)
  assert.match(v.html, /Musterweg 1/)
  assert.match(v.gesaeubert, /Skripte/)
  assert.equal(fn.kampagnenLesen().liste[0].html.includes('<script>'), true, 'im Feld bleibt stehen, was eingetippt wurde')
})

test('mailVorschau baut aus dem Editor-Stand, ohne zu speichern', () => {
  const fn = hauptStarten()
  const id = fn.kampagneAnlegen('Rauchtest').id

  const vorher = fn.kampagnenLesen().liste[0].html
  const v = fn.mailVorschau({ html: '<p>Live {{vorname}}</p>', htmlRahmen: false, betreff: 'Live {{vorname}}' })
  assert.equal(v.ok, true)
  assert.match(v.html, /Live Vorname/, 'Platzhalter werden mit einem Beispielkontakt gefüllt')
  assert.match(v.betreff, /Live Vorname/)
  assert.equal(fn.kampagnenLesen().liste[0].html, vorher, 'nichts davon landet in den Daten')
  assert.equal(fn.kampagnenLesen().liste[0].id, id)
})

test('startHtml liefert eine schlichte Startmail als Quelltext', () => {
  const fn = hauptStarten()
  const r = fn.startHtml()
  assert.equal(r.ok, true)
  assert.match(r.html, /^<table/)
  assert.match(r.html, /Überschrift/)
})

// ── Dasselbe für Vorlagen ──

test('eine Vorlage kommt mit Inhalt und lässt sich überschreiben', () => {
  const fn = hauptStarten()
  const id = fn.vorlageAnlegen({ name: 'Rauchvorlage' }).id
  assert.match(fn.vorlagenLesen().liste[0].html, /^<table/)

  assert.equal(fn.vorlageSpeichern({ id, name: 'Produktvorstellung', html: '<p>Eigenes HTML</p>' }).ok, true)
  const nachher = fn.vorlagenLesen().liste[0]
  assert.equal(nachher.name, 'Produktvorstellung')
  assert.equal(nachher.html, '<p>Eigenes HTML</p>')
})

test('die Vorschau einer HTML-Vorlage säubert und ergänzt den Fuß', () => {
  const fn = hauptStarten()
  const id = fn.vorlageAnlegen({ name: 'V' }).id
  fn.vorlageSpeichern({ id, name: 'V', html: '<p>Hallo {{vorname}}</p><script>boese()</script>' })

  const v = fn.vorlageVorschau(id)
  assert.equal(v.ok, true)
  assert.doesNotMatch(v.html, /<script/i)
  assert.match(v.html, /Hallo Vorname/, 'Platzhalter werden mit Beispieldaten gefüllt')
  assert.match(v.html, /subject=Abmeldung/)
  assert.match(v.gesaeubert, /Skripte/)
})

test('eine Vorlage wird mit ihrem Rahmen in die Kampagne übernommen', () => {
  const fn = hauptStarten()
  const kampagneId = fn.kampagneAnlegen('Ziel').id
  const vorlageId = fn.vorlageAnlegen({ name: 'Vorlage' }).id
  fn.vorlageSpeichern({ id: vorlageId, name: 'Vorlage', html: '<p>Aus der Vorlage</p>', htmlRahmen: false })

  const r = fn.vorlageAnwenden({ vorlageId, ziel: 'kampagne', id: kampagneId })
  assert.equal(r.ok, true, r.text)
  const kampagne = fn.kampagnenLesen().liste[0]
  assert.equal(kampagne.html, '<p>Aus der Vorlage</p>')
  assert.equal(kampagne.htmlRahmen, false)
})

test('eine Vorlage lässt sich auch auf einen Automationsschritt anwenden', () => {
  const fn = hauptStarten()
  const vorlageId = fn.vorlageAnlegen({ name: 'Vorlage' }).id
  fn.vorlageSpeichern({ id: vorlageId, name: 'Vorlage', html: '<p>Erinnerung</p>' })
  const automationId = fn.automationAnlegen('warenkorb').id

  const r = fn.vorlageAnwenden({ vorlageId, ziel: 'automation', id: automationId, schritt: 1 })
  assert.equal(r.ok, true, r.text)
  const schritte = fn.automationenLesen().liste[0].schritte
  assert.equal(schritte[1].html, '<p>Erinnerung</p>')
  assert.notEqual(schritte[0].html, '<p>Erinnerung</p>', 'nur der gemeinte Schritt')
})

test('ein Entwurf von Luzzy wird zu HTML und ersetzt das bisherige', () => {
  const fn = hauptStarten()
  const id = fn.vorlageAnlegen({ name: 'V' }).id
  fn.vorlageSpeichern({ id, name: 'V', html: '<p>eigenes</p>' })

  const antwort = JSON.stringify({ name: 'Entwurf', beschreibung: 'kurz', bausteine: [{ art: 'titel', text: 'Hallo aus dem Entwurf' }] })
  const r = fn.vorlageKiUebernehmen({ id, text: antwort })
  assert.equal(r.ok, true)
  assert.match(r.text, /ersetzt/)
  const v = fn.vorlagenLesen().liste[0]
  assert.match(v.html, /Hallo aus dem Entwurf/)
  assert.doesNotMatch(v.html, /eigenes/)
})

test('auch in der Kampagne wird Luzzys Entwurf zu HTML', () => {
  const fn = hauptStarten()
  const id = fn.kampagneAnlegen('Ziel').id
  const antwort = JSON.stringify({ betreff: 'Neu im Shop', bausteine: [{ art: 'titel', text: 'Zwei neue Motive' }] })
  const r = fn.kiAntwortUebernehmen({ id, text: antwort })
  assert.equal(r.ok, true, r.text)
  const k = fn.kampagnenLesen().liste[0]
  assert.equal(k.betreff, 'Neu im Shop')
  assert.match(k.html, /Zwei neue Motive/)
})

test('der Textteil einer HTML-Mail ist lesbar und ohne Markup', () => {
  const html = bauen('<table><tr><td><h1>Neu im Shop</h1><p>Zwei neue Motive.</p><a href="https://beispiel.de/shop">Zum Shop</a></td></tr></table>').html
  const text = textAusHtml(html)
  assert.match(text, /Neu im Shop/)
  assert.match(text, /Zum Shop \(https:\/\/beispiel\.de\/shop\)/)
  assert.doesNotMatch(text, /<[a-z]/i)
})

test('mailAusHtml nimmt Feld-Markierungen und ihre Hinweise aus der Mail', () => {
  const roh = `<h1 data-feld="ueberschrift" data-feld-hinweis="Kurz, höchstens sechs Wörter" style="margin:0;">Sturm</h1>
<img data-feld='hauptbild' src="https://cdn.shopify.com/s/files/a.png" alt="" />
<p>Text mit data-feld im Satz bleibt Text.</p>`
  const { html } = mailAusHtml(roh)
  assert.ok(!/\sdata-feld(-hinweis)?\s*=/.test(html), 'kein data-feld-Attribut mehr')
  assert.ok(!html.includes('höchstens sechs Wörter'))
  assert.match(html, /<h1 style="margin:0;">Sturm<\/h1>/)
  assert.match(html, /<img src="https:\/\/cdn\.shopify\.com\/s\/files\/a\.png" alt="" \/>/)
  assert.match(html, /Text mit data-feld im Satz bleibt Text\./)
})
