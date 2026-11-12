'use strict'
// Newsletter-Plugin: Vorlagen.
//
// Eine Vorlage ist ein gespeichertes Stück Mail-HTML mit Beispieltexten und Platzhaltern.
// Sie wird auf eine Kampagne oder auf einen Automationsschritt angewendet und dort weiter
// bearbeitet — die Vorlage selbst ändert sich dadurch nicht.
//
// Warum getrennt von Kampagnen: sonst sieht jede Mail gleich aus oder muss von Hand
// nachgebaut werden. Eine Kampagne kann auch umgekehrt als Vorlage gesichert werden.

const { bausteineSaeubern, kiAntwortLesen, htmlVon } = require('./kampagnen.js')
const { ARTEN, FELDER, startVorlage, inhaltAus } = require('./bausteine.js')
const { hatInhalt, fremdePlatzhalter, bilderOhneAdresse, linksOhneZiel, felderLesen, startVorlageHtml, PLATZHALTER_BASIS, PLATZHALTER_WARENKORB, MAX_HTML } = require('./html-mail.js')

const MAX_VORLAGEN = 50
const INHALT_ARTEN = ['titel', 'text', 'bild', 'produkt', 'knopf']

const neueId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const sauber = (wert) => String(wert ?? '').trim()

function neueVorlage({ name = 'Neue Vorlage', beschreibung = '', html = '', htmlRahmen = true, marke = {}, jetzt = Date.now() } = {}) {
  return {
    id: neueId(),
    name: sauber(name).slice(0, 80) || 'Neue Vorlage',
    beschreibung: sauber(beschreibung).slice(0, 200),
    // Nicht leer anfangen: die Startmail als Quelltext, zum Überschreiben
    // Startpunkt mit markierten Feldern: so ist schon die neue Vorlage eine Vorlage
    html: String(html ?? '').slice(0, MAX_HTML) || startVorlageHtml({ marke }),
    htmlRahmen: htmlRahmen !== false,
    erstelltAm: jetzt,
    geaendertAm: jetzt
  }
}

function vorlagePruefen(vorlage = {}, { marke = {} } = {}) {
  const fehler = []
  if (!sauber(vorlage.name)) fehler.push('Der Name fehlt.')
  const html = htmlVon(vorlage, { marke })
  if (!hatInhalt(html)) fehler.push('Die Vorlage hat noch keinen sichtbaren Inhalt.')
  if (html.length > MAX_HTML) fehler.push(`Das HTML ist zu lang (höchstens ${MAX_HTML} Zeichen).`)
  // In einer Vorlage dürfen Lücken stehen — in der Kampagne sperren sie dann den Versand.
  // Die Warenkorb-Platzhalter gelten hier mit: eine Vorlage kann für einen
  // Automationsschritt gedacht sein, und dort setzt Vendo sie ein. Ob sie an der Stelle
  // erlaubt sind, entscheidet beim Anwenden kampagnePruefen bzw. automationPruefen.
  const fremde = fremdePlatzhalter(html, [...PLATZHALTER_BASIS, ...PLATZHALTER_WARENKORB])
  if (fremde.length) fehler.push(`Lücken, die in der Kampagne gefüllt werden müssen: ${fremde.slice(0, 8).join(', ')}${fremde.length > 8 ? ' …' : ''}.`)
  const ohneAdresse = bilderOhneAdresse(html)
  if (ohneAdresse.length) fehler.push(`${ohneAdresse.length === 1 ? 'Ein Bild hat' : `${ohneAdresse.length} Bilder haben`} noch keine gültige Adresse (https://…).`)
  // Auch in einer Vorlage: ein Knopf ohne Ziel bleibt beim Anwenden ohne Ziel, weil dort
  // nur die markierten Felder neu geschrieben werden.
  const tot = linksOhneZiel(html)
  if (tot.length) fehler.push(`${tot.length === 1 ? 'Ein Knopf führt' : `${tot.length} Knöpfe führen`} nirgendwohin: ${tot.slice(0, 4).map((t) => `„${t}“`).join(', ')}. Auch im Beispiel gehört eine echte Adresse aus dem Shop hinein.`)
  // Eine Vorlage ist keine fertige Mail: ohne markierte Felder weiß niemand, was beim
  // Anwenden neu geschrieben werden muss
  const felder = felderLesen(html)
  if (hatInhalt(html) && !felder.length) fehler.push('Keine Felder markiert: jede Stelle, die pro Kampagne neu geschrieben wird, braucht data-feld="name".')
  return { ok: fehler.length === 0, fehler, html, felder }
}

// Eine Vorlage anwenden: eine Kopie ihres HTML. Kopf und Fuß kommen beim Bauen der Mail
// aus den Markenangaben und sind nicht Teil der Vorlage.
function anwenden(vorlage, { marke = {} } = {}) {
  return {
    html: htmlVon(vorlage, { marke }),
    htmlRahmen: vorlage?.htmlRahmen !== false
  }
}

// Aus einer fertigen Kampagne oder einem Automationsschritt eine Vorlage machen
function ausHtml(html, { name, beschreibung = '', htmlRahmen = true, marke = {}, jetzt = Date.now() } = {}) {
  return neueVorlage({ name, beschreibung, html, htmlRahmen, marke, jetzt })
}

function vorlageAendern(liste, id, aenderung, { jetzt = Date.now() } = {}) {
  let getroffen = false
  const neu = (Array.isArray(liste) ? liste : []).map((v) => {
    if (v?.id !== id) return v
    getroffen = true
    return { ...v, ...aenderung, geaendertAm: jetzt }
  })
  return { liste: neu, ok: getroffen }
}

// Auftrag an die KI. Anders als bei einer Kampagne geht es hier um die Form, nicht um einen
// bestimmten Inhalt: die Texte sind Beispiele, die später ersetzt werden.
function kiAuftrag({ zweck, marke = {}, ton = '', anzahlBausteine = 6 } = {}) {
  const artenText = ARTEN.filter((a) => a !== 'fuss' && a !== 'kopf')
    .map((art) => `  "${art}": Felder ${JSON.stringify(FELDER[art])}`)
    .join('\n')

  return `Du entwirfst eine wiederverwendbare Newsletter-Vorlage für ${sauber(marke.titel) || 'einen Onlineshop'}.

Wofür die Vorlage gedacht ist: ${sauber(zweck) || 'ein allgemeiner Newsletter'}
${ton ? `Tonfall: ${sauber(ton)}\n` : ''}
Antworte ausschließlich mit JSON in dieser Form, ohne Text davor oder danach:

{
  "name": "…",
  "beschreibung": "…",
  "bausteine": [ { "art": "titel", "text": "…" }, { "art": "text", "text": "…" } ]
}

Erlaubte Bausteinarten und ihre Felder:
${artenText}

Regeln:
- Höchstens ${Math.max(2, Math.min(Number(anzahlBausteine) || 6, 12))} Bausteine.
- Es ist eine **Vorlage**: die Texte sind Beispiele, die später ersetzt werden. Schreibe sie
  so, dass die Form erkennbar ist — kurze Beispielsätze statt ausformulierter Werbung.
- Nutze Platzhalter, wo sie hingehören: {{vorname}} für die Anrede.
- Schreibe kein HTML. Keine Tags, keine Attribute.
- Erfinde keine Links, Preise oder Rabatte. Lass "link" leer, wenn nichts vorgegeben ist.
- "name" ist kurz und sagt, wofür die Vorlage ist. "beschreibung" ist ein Satz dazu.
- Kopf mit Logo und Fuß der Mail setzt Vendo selbst davor und dahinter — lass beides weg.`
}

// Antwort lesen: dieselbe Mechanik wie bei Kampagnen, plus Name und Beschreibung
function kiAntwortLesenVorlage(text) {
  const gelesen = kiAntwortLesen(text)
  if (!gelesen.ok) return gelesen
  let name = ''
  let beschreibung = ''
  try {
    const roh = String(text ?? '')
    const start = roh.indexOf('{')
    const ende = roh.lastIndexOf('}')
    if (start >= 0 && ende > start) {
      const objekt = JSON.parse(roh.slice(start, ende + 1))
      name = sauber(objekt?.name).slice(0, 80)
      beschreibung = sauber(objekt?.beschreibung).slice(0, 200)
    }
  } catch {
    // Name und Beschreibung sind Beiwerk: fehlen sie, reichen die Bausteine
  }
  return { ...gelesen, name, beschreibung }
}

module.exports = {
  neueVorlage,
  vorlagePruefen,
  anwenden,
  ausHtml,
  vorlageAendern,
  kiAuftrag,
  kiAntwortLesenVorlage,
  MAX_VORLAGEN,
  INHALT_ARTEN
}
