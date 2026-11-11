// Newsletter-Plugin, Phase 3: Kampagnen.
// Geprüft wird das Prüfen und Personalisieren, der Zeitplan (fällig, verpasst) und vor allem
// die Verständigung mit der KI: was aus ihrer Antwort übernommen wird und was nicht.

import assert from 'node:assert/strict'
import test from 'node:test'
import kampagnen from '../plugins/newsletter/kampagnen.js'

const { neueKampagne, kampagnePruefen, bausteineSaeubern, personalisieren, bausteinePersonalisieren, faellige, verpasste, kampagneAendern, kiAuftrag, kiAntwortLesen, MAX_BAUSTEINE } = kampagnen

const JETZT = 1_700_000_000_000
const KONTAKT = { email: 'anna@beispiel.de', vorname: 'Anna', nachname: 'Beispiel' }

// ── Anlegen und prüfen ──

test('neueKampagne startet als Entwurf mit einer brauchbaren Startmail', () => {
  const k = neueKampagne({ name: 'Herbst', jetzt: JETZT })
  assert.equal(k.zustand, 'entwurf')
  assert.equal(k.name, 'Herbst')
  assert.equal(k.geplantAm, null)
  assert.match(k.html, /^<table/, 'das Feld ist nicht leer, sondern enthält die Startmail als Quelltext')
  assert.equal(k.htmlRahmen, true)
  assert.ok(k.id.startsWith('k'))
})

test('kampagnePruefen verlangt Betreff und Inhalt', () => {
  const ohneBetreff = kampagnePruefen({ html: '<p>x</p>' })
  assert.equal(ohneBetreff.ok, false)
  assert.match(ohneBetreff.fehler.join(' '), /Betreff fehlt/)

  const ohneInhalt = kampagnePruefen({ betreff: 'Hallo', html: '<!-- nur ein Kommentar -->' })
  assert.equal(ohneInhalt.ok, false)
  assert.match(ohneInhalt.fehler.join(' '), /keinen sichtbaren Inhalt/)

  assert.equal(kampagnePruefen({ betreff: 'Hallo', html: '<p>x</p>' }).ok, true)
})

// Kampagnen aus der Zeit der Baustein-Oberfläche haben kein `html`. Sie dürfen nicht
// plötzlich als leer gelten — ihr Inhalt wird aus den Bausteinen gebaut.
test('eine Kampagne ohne html fällt auf ihre gespeicherten Bausteine zurück', () => {
  const alt = { betreff: 'Hallo', bausteine: [{ art: 'titel', text: 'Überschrift' }, { art: 'text', text: 'Ein Satz' }] }
  const geprueft = kampagnePruefen(alt)
  assert.equal(geprueft.ok, true)
  assert.match(geprueft.html, /Überschrift/)
  assert.match(geprueft.html, /Ein Satz/)
  assert.match(geprueft.html, /^<table/, 'daraus wird Tabellen-HTML')
})

test('htmlVon nimmt vorhandenes HTML und rührt die Bausteine nicht an', () => {
  const stueck = { html: '<p>von Hand</p>', bausteine: [{ art: 'text', text: 'alt' }] }
  assert.equal(kampagnen.htmlVon(stueck), '<p>von Hand</p>')
  assert.equal(kampagnen.htmlVon({}), '', 'ohne beides bleibt es leer')
})

test('kampagnePruefen lehnt einen Zeilenumbruch im Betreff ab', () => {
  const e = kampagnePruefen({ betreff: 'Hallo\r\nBcc: fremd@beispiel.de', bausteine: [{ art: 'text', text: 'x' }] })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Zeilenumbruch/)
})

// ── Bausteine säubern ──

test('bausteineSaeubern nimmt nur bekannte Arten und bekannte Felder', () => {
  const liste = bausteineSaeubern([
    { art: 'text', text: 'bleibt', boeseFeld: '<script>' },
    { art: 'html', inhalt: '<div>weg</div>' },
    { art: 'knopf', text: 'Klick', link: 'https://beispiel.de' },
    'kein Objekt',
    null
  ])
  assert.deepEqual(liste.map((b) => b.art), ['text', 'knopf'])
  assert.equal(liste[0].boeseFeld, undefined, 'unbekannte Felder fallen weg')
  assert.equal(liste[0].text, 'bleibt')
})

test('bausteineSaeubern lässt leere Felder weg, damit sie keine Standardwerte überschreiben', () => {
  const liste = bausteineSaeubern([{ art: 'kopf', logo: '', logoBreite: '', titel: '   ' }])
  assert.deepEqual(liste[0], { art: 'kopf' }, 'nur die Art bleibt übrig')

  const mitWert = bausteineSaeubern([{ art: 'kopf', logo: 'https://beispiel.de/l.png', titel: '' }])
  assert.deepEqual(mitWert[0], { art: 'kopf', logo: 'https://beispiel.de/l.png' })
})

test('bausteineSaeubern begrenzt die Anzahl', () => {
  const viele = Array.from({ length: MAX_BAUSTEINE + 10 }, () => ({ art: 'text', text: 'x' }))
  assert.equal(bausteineSaeubern(viele).length, MAX_BAUSTEINE)
})

// ── Personalisierung ──

test('personalisieren ersetzt die bekannten Platzhalter', () => {
  assert.equal(personalisieren('Hallo {{vorname}}!', KONTAKT), 'Hallo Anna!')
  assert.equal(personalisieren('{{ name }}', KONTAKT), 'Anna Beispiel')
  assert.equal(personalisieren('{{EMAIL}}', KONTAKT), 'anna@beispiel.de')
})

test('unbekannte Platzhalter bleiben stehen, damit man sie beim Test sieht', () => {
  assert.equal(personalisieren('Hallo {{spitzname}}', KONTAKT), 'Hallo {{spitzname}}')
})

test('fehlende Angaben ergeben leeren Text, nicht „undefined“', () => {
  assert.equal(personalisieren('Hallo {{vorname}}', { email: 'x@beispiel.de' }), 'Hallo ')
})

test('bausteinePersonalisieren geht durch alle Textfelder', () => {
  const liste = bausteinePersonalisieren([{ art: 'titel', text: 'Hi {{vorname}}' }, { art: 'knopf', text: 'Für {{vorname}}', link: 'https://beispiel.de' }], KONTAKT)
  assert.equal(liste[0].text, 'Hi Anna')
  assert.equal(liste[1].text, 'Für Anna')
  assert.equal(liste[1].link, 'https://beispiel.de', 'Links bleiben unverändert')
})

// ── Zeitplan ──

test('faellige findet geplante Kampagnen, deren Zeit da ist', () => {
  const liste = [
    { id: 'a', zustand: 'geplant', geplantAm: JETZT - 1000 },
    { id: 'b', zustand: 'geplant', geplantAm: JETZT + 60000 },
    { id: 'c', zustand: 'entwurf', geplantAm: JETZT - 1000 },
    { id: 'd', zustand: 'laeuft', geplantAm: JETZT - 1000 }
  ]
  assert.deepEqual(faellige(liste, { jetzt: JETZT }).map((k) => k.id), ['a'])
})

test('eine Kampagne, die länger als das Fenster überfällig ist, gilt als verpasst', () => {
  const liste = [{ id: 'a', zustand: 'geplant', geplantAm: JETZT - 86400000 - 1 }]
  assert.equal(faellige(liste, { jetzt: JETZT }).length, 0, 'sie wird nicht mehr gesendet')
  assert.deepEqual(verpasste(liste, { jetzt: JETZT }).map((k) => k.id), ['a'])
})

test('kampagneAendern trifft nur die gemeinte Kampagne', () => {
  const liste = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  const e = kampagneAendern(liste, 'b', { name: 'Neu' }, { jetzt: JETZT })
  assert.equal(e.ok, true)
  assert.equal(e.liste[0].name, 'A')
  assert.equal(e.liste[1].name, 'Neu')
  assert.equal(e.liste[1].geaendertAm, JETZT)
  assert.equal(kampagneAendern(liste, 'gibtsnicht', {}).ok, false)
})

// ── Auftrag an die KI ──

test('der Auftrag nennt Thema, Bausteine und verbietet HTML', () => {
  const auftrag = kiAuftrag({ thema: 'Herbstaktion', marke: { titel: 'Beispiel' }, ton: 'kurz' })
  assert.match(auftrag, /Herbstaktion/)
  assert.match(auftrag, /Beispiel/)
  assert.match(auftrag, /kurz/)
  assert.match(auftrag, /ausschließlich mit JSON/)
  assert.match(auftrag, /Schreibe kein HTML/)
  assert.match(auftrag, /"art": "titel"/)
  assert.match(auftrag, /\{\{vorname\}\}/)
  assert.ok(!auftrag.includes('"fuss"'), 'Kopf und Fuß soll die KI weglassen')
})

test('der Auftrag gibt genannte Produkte mit und verbietet erfundene Angaben', () => {
  const auftrag = kiAuftrag({ thema: 'Neu', produkte: [{ titel: 'Shirt Wolf', preis: '29,90 €', link: 'https://beispiel.de/wolf' }] })
  assert.match(auftrag, /Shirt Wolf/)
  assert.match(auftrag, /29,90/)
  assert.match(auftrag, /Erfinde keine Adressen, keine Preise, keine Rabatte/)
})

// ── Antwort der KI lesen ──

const ANTWORT = {
  betreff: 'Neu im Shop',
  vorschauText: 'Drei neue Motive',
  bausteine: [
    { art: 'titel', text: 'Drei neue Motive' },
    { art: 'text', text: 'Hallo {{vorname}},\n\nes gibt Neues.' }
  ]
}

test('kiAntwortLesen versteht reines JSON', () => {
  const e = kiAntwortLesen(JSON.stringify(ANTWORT))
  assert.equal(e.ok, true)
  assert.equal(e.betreff, 'Neu im Shop')
  assert.equal(e.vorschauText, 'Drei neue Motive')
  assert.equal(e.bausteine.length, 2)
})

test('kiAntwortLesen holt das JSON aus einem Codeblock heraus', () => {
  const e = kiAntwortLesen(`Hier ist der Entwurf:\n\n\`\`\`json\n${JSON.stringify(ANTWORT)}\n\`\`\`\n\nViel Erfolg!`)
  assert.equal(e.ok, true)
  assert.equal(e.betreff, 'Neu im Shop')
})

test('kiAntwortLesen verträgt Text davor und danach ohne Codeblock', () => {
  const e = kiAntwortLesen(`Gerne! ${JSON.stringify(ANTWORT)} Sag Bescheid, wenn du Änderungen willst.`)
  assert.equal(e.ok, true)
  assert.equal(e.bausteine.length, 2)
})

test('kiAntwortLesen wirft erfundene Bausteinarten und Felder weg', () => {
  const e = kiAntwortLesen(
    JSON.stringify({
      betreff: 'B',
      bausteine: [
        { art: 'rohHtml', html: '<div onclick="x">weg</div>' },
        { art: 'text', text: 'bleibt', style: 'color:red' }
      ]
    })
  )
  assert.equal(e.ok, true)
  assert.equal(e.bausteine.length, 1)
  assert.equal(e.bausteine[0].art, 'text')
  assert.equal(e.bausteine[0].style, undefined)
})

test('kiAntwortLesen macht aus einem mehrzeiligen Betreff eine Zeile', () => {
  const e = kiAntwortLesen(JSON.stringify({ betreff: 'Zeile eins\nZeile zwei', bausteine: [{ art: 'text', text: 'x' }] }))
  assert.ok(!e.betreff.includes('\n'))
})

test('kiAntwortLesen meldet unbrauchbare Antworten statt zu raten', () => {
  assert.equal(kiAntwortLesen('Ich kann das leider nicht.').ok, false)
  assert.equal(kiAntwortLesen('{kaputt').ok, false)
  assert.equal(kiAntwortLesen('').ok, false)
  assert.equal(kiAntwortLesen(null).ok, false)

  const leer = kiAntwortLesen(JSON.stringify({ betreff: 'B', bausteine: [] }))
  assert.equal(leer.ok, false)
  assert.match(leer.fehler, /keine brauchbaren Bausteine/)

  const nurMuell = kiAntwortLesen(JSON.stringify({ betreff: 'B', bausteine: [{ art: 'iframe', src: 'x' }] }))
  assert.equal(nurMuell.ok, false)
})
