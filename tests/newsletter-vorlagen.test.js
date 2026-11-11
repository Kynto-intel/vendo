// Newsletter-Plugin: Vorlagen.
// Geprüft wird das Anlegen und Prüfen, dass Anwenden eine Kopie erzeugt (die Vorlage sich
// also nicht mitverändert), der Auftrag an die KI und das Lesen ihrer Antwort.

import assert from 'node:assert/strict'
import test from 'node:test'
import vorlagen from '../plugins/newsletter/vorlagen.js'

const { neueVorlage, vorlagePruefen, anwenden, ausHtml, vorlageAendern, kiAuftrag, kiAntwortLesenVorlage, MAX_VORLAGEN } = vorlagen

const JETZT = 1_700_000_000_000

const INHALT = '<table><tr><td><h1 data-feld="ueberschrift">Hallo {{vorname}}</h1><p data-feld="text">Beispieltext</p></td></tr></table>'

// ── Anlegen und prüfen ──

test('neueVorlage hat Name, Startmail und eine Kennung', () => {
  const v = neueVorlage({ name: 'Produktvorstellung', beschreibung: 'Mit Bild und Knopf', jetzt: JETZT })
  assert.equal(v.name, 'Produktvorstellung')
  assert.equal(v.beschreibung, 'Mit Bild und Knopf')
  assert.ok(v.id.startsWith('v'))
  assert.match(v.html, /^<table/, 'ohne Angabe die Startmail als Quelltext')
  assert.ok(vorlagePruefen(v).felder.length >= 5, 'die Startvorlage hat schon markierte Felder')
  assert.equal(v.htmlRahmen, true)
  assert.equal(v.erstelltAm, JETZT)
})

test('neueVorlage übernimmt eigenes HTML', () => {
  const v = neueVorlage({ name: 'Eigen', html: INHALT, htmlRahmen: false })
  assert.equal(v.html, INHALT)
  assert.equal(v.htmlRahmen, false)
})

test('vorlagePruefen verlangt Name und Inhalt', () => {
  assert.match(vorlagePruefen({ name: '', html: INHALT }).fehler.join(' '), /Name fehlt/)
  const ohneInhalt = vorlagePruefen({ name: 'Leer', html: '<!-- noch nichts -->' })
  assert.equal(ohneInhalt.ok, false)
  assert.match(ohneInhalt.fehler.join(' '), /keinen sichtbaren Inhalt/)
  assert.equal(vorlagePruefen({ name: 'Gut', html: INHALT }).ok, true)
})

// Vorlagen aus der Zeit der Baustein-Oberfläche haben kein `html`
test('eine Vorlage ohne html fällt auf ihre gespeicherten Bausteine zurück', () => {
  const alt = { name: 'Alt', bausteine: [{ art: 'titel', text: 'Hallo {{vorname}}' }] }
  const geprueft = vorlagePruefen(alt)
  assert.equal(geprueft.fehler.length, 1, 'einziger Hinweis: Felder fehlen')
  assert.match(geprueft.fehler[0], /Keine Felder markiert/)
  assert.match(geprueft.html, /Hallo \{\{vorname\}\}/, 'der Platzhalter bleibt beim Wandeln stehen')
})

// ── Anwenden ──

test('anwenden gibt das HTML der Vorlage mit ihrem Rahmen', () => {
  const v = neueVorlage({ name: 'V', html: INHALT, htmlRahmen: false })
  const kopie = anwenden(v)
  assert.equal(kopie.html, INHALT)
  assert.equal(kopie.htmlRahmen, false)
})

test('anwenden behält Platzhalter — ersetzt wird erst beim Versand', () => {
  assert.match(anwenden(neueVorlage({ name: 'V', html: INHALT })).html, /\{\{vorname\}\}/)
})

test('anwenden verträgt eine kaputte Vorlage', () => {
  assert.equal(anwenden(null).html, '')
  assert.equal(anwenden({ html: 42 }).html, '42')
})

test('ausHtml macht aus einer Kampagne eine Vorlage', () => {
  const v = ausHtml(INHALT, { name: 'Aus Kampagne', jetzt: JETZT })
  assert.equal(v.name, 'Aus Kampagne')
  assert.equal(v.html, INHALT)
  assert.ok(v.id.startsWith('v'))
})

test('vorlageAendern trifft nur die gemeinte Vorlage', () => {
  const liste = [neueVorlage({ name: 'A' }), neueVorlage({ name: 'B' })]
  const e = vorlageAendern(liste, liste[1].id, { name: 'Neu' }, { jetzt: JETZT })
  assert.equal(e.ok, true)
  assert.equal(e.liste[0].name, 'A')
  assert.equal(e.liste[1].name, 'Neu')
  assert.equal(vorlageAendern(liste, 'gibtsnicht', {}).ok, false)
})

test('es gibt eine Obergrenze für Vorlagen', () => {
  assert.ok(MAX_VORLAGEN >= 10 && MAX_VORLAGEN <= 200)
})

test('ausHtml nimmt den Rahmen der Kampagne mit', () => {
  const v = ausHtml('<p>Mail</p>', { name: 'Aus Kampagne', htmlRahmen: false })
  assert.equal(v.html, '<p>Mail</p>')
  assert.equal(v.htmlRahmen, false)
})

// ── Auftrag an die KI ──

test('der Auftrag verlangt eine Vorlage mit Beispieltexten, kein fertiges Mailing', () => {
  const auftrag = kiAuftrag({ zweck: 'neues Produkt mit Bild', marke: { titel: 'Beispiel' }, ton: 'kurz' })
  assert.match(auftrag, /Vorlage/)
  assert.match(auftrag, /neues Produkt mit Bild/)
  assert.match(auftrag, /Beispiele/)
  assert.match(auftrag, /ausschließlich mit JSON/)
  assert.match(auftrag, /Schreibe kein HTML/)
  assert.match(auftrag, /\{\{vorname\}\}/)
  assert.match(auftrag, /Erfinde keine Links/)
})

test('der Auftrag fragt nach Name und Beschreibung', () => {
  const auftrag = kiAuftrag({ zweck: 'x' })
  assert.match(auftrag, /"name"/)
  assert.match(auftrag, /"beschreibung"/)
})

// ── Antwort lesen ──

const ANTWORT = {
  name: 'Produktvorstellung',
  beschreibung: 'Bild, Text und Knopf',
  bausteine: [
    { art: 'titel', text: 'Neu: {{vorname}}, schau mal' },
    { art: 'text', text: 'Kurzer Beispieltext.' }
  ]
}

test('kiAntwortLesenVorlage liest Name, Beschreibung und Bausteine', () => {
  const e = kiAntwortLesenVorlage(JSON.stringify(ANTWORT))
  assert.equal(e.ok, true)
  assert.equal(e.name, 'Produktvorstellung')
  assert.equal(e.beschreibung, 'Bild, Text und Knopf')
  assert.equal(e.bausteine.length, 2)
})

test('kiAntwortLesenVorlage versteht einen Codeblock mit Vorrede', () => {
  const e = kiAntwortLesenVorlage(`Gerne!\n\n\`\`\`json\n${JSON.stringify(ANTWORT)}\n\`\`\``)
  assert.equal(e.ok, true)
  assert.equal(e.name, 'Produktvorstellung')
})

test('kiAntwortLesenVorlage kommt auch ohne Name aus', () => {
  const e = kiAntwortLesenVorlage(JSON.stringify({ bausteine: ANTWORT.bausteine }))
  assert.equal(e.ok, true)
  assert.equal(e.name, '')
  assert.equal(e.bausteine.length, 2)
})

test('kiAntwortLesenVorlage meldet unbrauchbare Antworten', () => {
  assert.equal(kiAntwortLesenVorlage('Kann ich nicht.').ok, false)
  assert.equal(kiAntwortLesenVorlage(JSON.stringify({ name: 'X', bausteine: [{ art: 'iframe' }] })).ok, false)
})
