'use strict'
// Newsletter-Plugin: Kampagnen.
//
// Eine Kampagne ist ein Stück Mail-HTML mit Betreff, Zielgruppe und optionalem Zeitpunkt.
// Hier liegt alles, was ohne Netz und ohne Oberfläche entschieden werden kann: prüfen,
// personalisieren, fällige Kampagnen finden, und die Verständigung mit der KI.
//
// Der Inhalt ist HTML, überall. Die Bausteine aus bausteine.js sind kein zweiter Weg mehr,
// sondern nur noch das Werkzeug dahinter: sie bauen Kopf und Fuß, die Startmail und den
// Entwurf von Luzzy — und erzeugen daraus HTML, das im Code-Feld landet.
//
// Die KI schreibt weiterhin kein Markup. Sie bekommt die erlaubten Bausteine beschrieben
// und liefert JSON; Vendo macht daraus geprüftes Tabellen-HTML. Warum, steht in
// bausteine.js: ein Modell, das „einen schönen Newsletter in HTML“ schreibt, liefert etwas,
// das im Browser gut aussieht und in Outlook auseinanderfällt.

const { ARTEN, FELDER, startVorlage, inhaltAus, maskieren } = require('./bausteine.js')
const { hatInhalt, fremdePlatzhalter, bilderOhneAdresse, linksOhneZiel, MAX_HTML } = require('./html-mail.js')

// 'freigabe': ein Bot hat die Kampagne vorbereitet und Felix eine Testmail geschickt; sie
// wartet auf seine Bestätigung in Vendo. Gesendet wird aus diesem Zustand nie.
const ZUSTAENDE = ['entwurf', 'freigabe', 'geplant', 'laeuft', 'fertig', 'abgebrochen']
const MAX_BAUSTEINE = 40

const neueId = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const sauber = (wert) => String(wert ?? '').trim()

// Das HTML eines gespeicherten Stücks. Älteres aus der Zeit der Baustein-Oberfläche hat
// noch kein `html`: dann wird es aus den Bausteinen gebaut, damit nichts verloren geht.
// Gelöscht wird dabei nichts — die Bausteine bleiben liegen, bis das Stück neu gespeichert
// wird, und dann steht das HTML an ihrer Stelle.
function htmlVon(roh, { marke = {} } = {}) {
  const stueck = roh && typeof roh === 'object' ? roh : {}
  const html = String(stueck.html ?? '')
  if (html.trim()) return html
  const bausteine = bausteineSaeubern(stueck.bausteine)
  return bausteine.length ? inhaltAus(bausteine, { marke }) : ''
}

function neueKampagne({ name = 'Neue Kampagne', marke = {}, jetzt = Date.now() } = {}) {
  return {
    id: neueId(),
    name: sauber(name) || 'Neue Kampagne',
    betreff: '',
    vorschauText: '',
    // Nicht leer anfangen: die Startmail als Quelltext, zum Überschreiben
    html: inhaltAus(startVorlage(), { marke }),
    htmlRahmen: true, // in Vendos 600-px-Fläche legen; aus = eigenes Dokument
    zielgruppe: 'alle', // vorerst: alle Empfänger mit Zustimmung
    zustand: 'entwurf',
    geplantAm: null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
    gestartetAm: null,
    fertigAm: null,
    eingereiht: 0
  }
}

// Nur bekannte Bausteinarten und bekannte Felder übernehmen. Alles andere fällt weg: so
// kann weder die KI noch ein Import etwas in das Markup schmuggeln.
function bausteineSaeubern(liste) {
  const heraus = []
  for (const roh of Array.isArray(liste) ? liste : []) {
    const art = sauber(roh?.art)
    if (!ARTEN.includes(art)) continue
    const baustein = { art }
    for (const feld of FELDER[art] || []) {
      if (roh[feld] === undefined || roh[feld] === null) continue
      const wert = typeof roh[feld] === 'number' ? roh[feld] : sauber(roh[feld])
      // Leere Felder gar nicht übernehmen: ein leerer String würde sonst einen Standardwert
      // überschreiben (etwa das Logo aus den Markenangaben im Kopf-Baustein).
      if (wert === '') continue
      baustein[feld] = wert
    }
    heraus.push(baustein)
    if (heraus.length >= MAX_BAUSTEINE) break
  }
  return heraus
}

function kampagnePruefen(kampagne = {}, { marke = {} } = {}) {
  const fehler = []
  const betreff = sauber(kampagne.betreff)
  if (!betreff) fehler.push('Der Betreff fehlt.')
  if (betreff.length > 200) fehler.push('Der Betreff ist zu lang (höchstens 200 Zeichen).')
  if (/[\r\n]/.test(String(kampagne.betreff ?? ''))) fehler.push('Der Betreff darf keinen Zeilenumbruch enthalten.')

  const html = htmlVon(kampagne, { marke })
  if (!hatInhalt(html)) fehler.push('Die Kampagne hat noch keinen sichtbaren Inhalt.')
  if (html.length > MAX_HTML) fehler.push(`Das HTML ist zu lang (höchstens ${MAX_HTML} Zeichen).`)

  // Was nicht ersetzt wird, käme wörtlich bei den Empfängern an: sperren, nicht nur zeigen
  const fremde = fremdePlatzhalter([kampagne.betreff, kampagne.vorschauText, html].join(' '))
  if (fremde.length) fehler.push(`Unbekannte Platzhalter: ${fremde.slice(0, 8).join(', ')}${fremde.length > 8 ? ' …' : ''} — die kämen so bei den Empfängern an. Vendo ersetzt nur {{vorname}}, {{nachname}}, {{name}} und {{email}}.`)
  const ohneAdresse = bilderOhneAdresse(html)
  if (ohneAdresse.length) fehler.push(`${ohneAdresse.length === 1 ? 'Ein Bild hat' : `${ohneAdresse.length} Bilder haben`} keine gültige Adresse (nötig: https://…).`)
  // Ein Knopf ohne Ziel ist in einer Mail nicht reparierbar: der Empfänger klickt ins Leere.
  const tot = linksOhneZiel(html)
  if (tot.length) fehler.push(`${tot.length === 1 ? 'Ein Knopf führt' : `${tot.length} Knöpfe führen`} nirgendwohin: ${tot.slice(0, 4).map((t) => `„${t}“`).join(', ')}. Jeder Knopf braucht eine echte Adresse aus dem Shop.`)

  if (kampagne.geplantAm && !Number.isFinite(Number(kampagne.geplantAm))) fehler.push('Der Zeitpunkt ist unbrauchbar.')

  return { ok: fehler.length === 0, fehler, html }
}

// Platzhalter ersetzen. Unbekannte Platzhalter bleiben stehen, damit man sie beim
// Testversand sieht, statt dass still „Hallo ,“ bei den Leuten landet.
const PLATZHALTER = {
  vorname: (k) => sauber(k.vorname),
  nachname: (k) => sauber(k.nachname),
  name: (k) => `${sauber(k.vorname)} ${sauber(k.nachname)}`.trim(),
  email: (k) => sauber(k.email)
}

// `extra` liefert Platzhalter, die nur in einem Zusammenhang gelten — bei Automationen etwa
// {{warenkorb}}, {{warenkorbLink}} und {{summe}}.
function personalisieren(text, kontakt = {}, extra = {}) {
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (ganz, name) => {
    const schluessel = String(name).toLowerCase()
    const fn = PLATZHALTER[schluessel]
    if (fn) return fn(kontakt)
    const zusatz = Object.entries(extra).find(([k]) => k.toLowerCase() === schluessel)
    if (zusatz) return String(zusatz[1] ?? '')
    return ganz
  })
}

// Dasselbe für eigenes HTML — mit einem Unterschied: der eingesetzte Wert wird maskiert.
// In den Bausteinen maskiert der Baustein selbst, hier steht der Text schon im Markup, und
// ein Nachname mit spitzer Klammer würde die Mail sonst aufbrechen.
function personalisierenHtml(text, kontakt = {}, extra = {}) {
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (ganz, name) => {
    const schluessel = String(name).toLowerCase()
    const fn = PLATZHALTER[schluessel]
    if (fn) return maskieren(fn(kontakt))
    const zusatz = Object.entries(extra).find(([k]) => k.toLowerCase() === schluessel)
    if (zusatz) return maskieren(zusatz[1] ?? '')
    return ganz
  })
}

function bausteinePersonalisieren(bausteine, kontakt = {}, extra = {}) {
  return bausteineSaeubern(bausteine).map((baustein) => {
    const neu = { ...baustein }
    for (const [feld, wert] of Object.entries(neu)) {
      if (feld !== 'art' && typeof wert === 'string') neu[feld] = personalisieren(wert, kontakt, extra)
    }
    return neu
  })
}

// Welche geplanten Kampagnen sind dran? `fenster` verhindert, dass eine Kampagne, die
// tagelang liegen geblieben ist (Vendo war aus), ungefragt rausgeht.
function faellige(kampagnen, { jetzt = Date.now(), fenster = 86400000 } = {}) {
  return (Array.isArray(kampagnen) ? kampagnen : []).filter(
    (k) => k?.zustand === 'geplant' && Number(k.geplantAm) && Number(k.geplantAm) <= jetzt && Number(k.geplantAm) > jetzt - fenster
  )
}

// Geplant, aber das Fenster ist verstrichen: nicht mehr senden, sondern zurück in den Entwurf
function verpasste(kampagnen, { jetzt = Date.now(), fenster = 86400000 } = {}) {
  return (Array.isArray(kampagnen) ? kampagnen : []).filter((k) => k?.zustand === 'geplant' && Number(k.geplantAm) && Number(k.geplantAm) <= jetzt - fenster)
}

function kampagneAendern(liste, id, aenderung, { jetzt = Date.now() } = {}) {
  let getroffen = false
  const neu = (Array.isArray(liste) ? liste : []).map((k) => {
    if (k?.id !== id) return k
    getroffen = true
    return { ...k, ...aenderung, geaendertAm: jetzt }
  })
  return { liste: neu, ok: getroffen }
}

// ── Verständigung mit der KI ──

// Die Anweisung. Absichtlich streng: nur JSON, nur diese Arten, keine Erklärungen.
function kiAuftrag({ thema, marke = {}, ton = '', produkte = [], anzahlBausteine = 6 } = {}) {
  const artenText = ARTEN.filter((a) => a !== 'fuss' && a !== 'kopf')
    .map((art) => `  "${art}": Felder ${JSON.stringify(FELDER[art])}`)
    .join('\n')

  const produktText = produkte.length
    ? `\nProdukte, die vorkommen sollen (nimm die Angaben genau so):\n${produkte
        .map((p) => `- ${sauber(p.titel)}${p.preis ? `, ${sauber(p.preis)}` : ''}${p.link ? `, Link: ${sauber(p.link)}` : ''}`)
        .join('\n')}`
    : ''

  return `Du schreibst einen Newsletter für ${sauber(marke.titel) || 'einen Onlineshop'}.

Thema: ${sauber(thema) || 'allgemeiner Newsletter'}
${ton ? `Tonfall: ${sauber(ton)}\n` : ''}${produktText}

Antworte ausschließlich mit JSON in dieser Form, ohne Text davor oder danach:

{
  "betreff": "…",
  "vorschauText": "…",
  "bausteine": [ { "art": "titel", "text": "…" }, { "art": "text", "text": "…" } ]
}

Erlaubte Bausteinarten und ihre Felder:
${artenText}

Regeln:
- Höchstens ${Math.max(2, Math.min(Number(anzahlBausteine) || 6, 12))} Bausteine.
- Schreibe kein HTML. Keine Tags, keine Attribute, keine Platzhalter in spitzen Klammern.
- Für den Namen des Empfängers darfst du {{vorname}} verwenden.
- "betreff" höchstens 60 Zeichen, ohne Zeilenumbruch.
- "vorschauText" ist der kurze Text, den Mailprogramme neben dem Betreff zeigen.
- Links nur, wenn sie oben genannt sind. Erfinde keine Adressen, keine Preise, keine Rabatte.
- Kopf mit Logo und Fuß der Mail setzt Vendo selbst davor und dahinter — lass beides weg.`
}

// Die Antwort lesen. Modelle hängen gern Erklärungen an oder packen das JSON in einen
// Codeblock — beides wird hier abgeräumt, statt sich darauf zu verlassen.
function kiAntwortLesen(text) {
  const roh = String(text ?? '')
  const ohneBlock = roh.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/```[\s\S]*$/, '')
  const kandidaten = [ohneBlock, roh]

  for (const kandidat of kandidaten) {
    const start = kandidat.indexOf('{')
    const ende = kandidat.lastIndexOf('}')
    if (start < 0 || ende <= start) continue
    let objekt
    try {
      objekt = JSON.parse(kandidat.slice(start, ende + 1))
    } catch {
      continue
    }
    const bausteine = bausteineSaeubern(objekt?.bausteine)
    if (!bausteine.length) return { ok: false, fehler: 'Die Antwort enthält keine brauchbaren Bausteine.' }
    const betreff = sauber(objekt?.betreff).replace(/[\r\n]+/g, ' ').slice(0, 200)
    return {
      ok: true,
      betreff,
      vorschauText: sauber(objekt?.vorschauText).replace(/[\r\n]+/g, ' ').slice(0, 200),
      bausteine
    }
  }
  return { ok: false, fehler: 'Die Antwort war kein verwertbares JSON.' }
}

module.exports = {
  neueKampagne,
  kampagnePruefen,
  bausteineSaeubern,
  personalisieren,
  personalisierenHtml,
  bausteinePersonalisieren,
  htmlVon,
  faellige,
  verpasste,
  kampagneAendern,
  kiAuftrag,
  kiAntwortLesen,
  ZUSTAENDE,
  MAX_BAUSTEINE,
  PLATZHALTER
}
