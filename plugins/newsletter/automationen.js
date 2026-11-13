'use strict'
// Newsletter-Plugin: Automationen.
//
// Eine Automation ist eine Folge von Mails mit Wartezeiten, ausgelöst durch ein Ereignis:
//   warenkorb       — jemand hat einen Warenkorb stehen gelassen
//   willkommen      — jemand ist neu als Abonnent dazugekommen
//   rueckgewinnung  — jemand hat lange nichts gekauft: die letzte Bestellung liegt im
//                     eingestellten Fenster (Voreinstellung 120 bis 365 Tage zurück)
//
// Ein „Lauf“ ist eine Person in einer Automation: er merkt sich, welcher Schritt dran ist und
// wann. Was hier nie passieren darf:
//   - Zwei Läufe für dasselbe Ereignis. Der Auslöseschlüssel (Automation + Ereignis-ID)
//     verhindert das, auch über einen Neustart hinweg.
//   - Eine Mail, deren Anlass vorbei ist. Jeder Schritt hat ein Verfallsfenster: eine
//     Warenkorb-Mail, die zwei Tage zu spät kommt, ist peinlicher als keine.
//   - Werbung ohne Zustimmung. Ob eine Automation auch ohne Marketing-Zustimmung senden darf,
//     ist einstellbar — die Voreinstellung ist „nur mit“. Eine Warenkorb-Mail ist Werbung,
//     und ein abgebrochener Warenkorb ist kein Kauf, greift also nicht unter die
//     Bestandskunden-Ausnahme in § 7 Abs. 3 UWG.
//
// Alle Funktionen sind rein: die übergebene Liste wird nicht verändert.

const STUNDE = 3600000
const { fremdePlatzhalter, bilderOhneAdresse, PLATZHALTER_BASIS, PLATZHALTER_WARENKORB } = require('./html-mail.js')

const AUSLOESER = {
  warenkorb: {
    name: 'Warenkorb abgebrochen',
    beschreibung: 'Jemand hat Artikel im Warenkorb gelassen, ohne zu bestellen.',
    abbruchBei: ['bestellung', 'abmeldung'],
    standardSchritte: [
      { nach: 4 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Du hast etwas vergessen', html: '' },
      { nach: 24 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Noch da? Dein Warenkorb wartet', html: '' }
    ]
  },
  willkommen: {
    name: 'Willkommen',
    beschreibung: 'Jemand hat sich neu für den Newsletter angemeldet.',
    abbruchBei: ['abmeldung'],
    standardSchritte: [
      { nach: STUNDE, verfallNach: 14 * 24 * STUNDE, betreff: 'Willkommen', html: '' },
      { nach: 3 * 24 * STUNDE, verfallNach: 14 * 24 * STUNDE, betreff: 'Schön, dass du da bist', html: '' }
    ]
  },
  rueckgewinnung: {
    name: 'Rückgewinnung',
    beschreibung: 'Jemand hat lange nichts gekauft: die letzte Bestellung liegt im eingestellten Zeitraum zurück. Vendo sieht einmal am Tag bei Shopify nach.',
    abbruchBei: ['bestellung', 'abmeldung'],
    standardSchritte: [{ nach: STUNDE, verfallNach: 30 * 24 * STUNDE, betreff: 'Lange nichts gehört', html: '' }]
  }
}

const ARTEN = Object.keys(AUSLOESER)
const neueId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const sauber = (wert) => String(wert ?? '').trim()
const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((x) => x && typeof x === 'object') : [])

// ── Rückgewinnung: wer ist dran? ──
// Das Fenster: letzte Bestellung mindestens `abTage` und höchstens `bisTage` her. Die
// Obergrenze hält Leute heraus, die vor Jahren einmal bestellt haben und Vendo kaum noch
// kennen — eine Mail an sie bringt eher Beschwerden als Käufe.
const TAG = 24 * STUNDE
const RUECK_FENSTER = { abTage: 120, bisTage: 365 }
const RUECK_GRENZEN = { abMin: 30, bisMax: 1825 }
// Neue Serien je Tag. Beim ersten Einschalten liegen oft Hunderte im Fenster; die sollen
// nicht an einem Tag aus dem Postfach gehen, das auch der Kundenservice benutzt.
const RUECK_JE_TAG = 100

function rueckFenster(automation = {}) {
  const ab = Number(automation.abTage)
  const bis = Number(automation.bisTage)
  return {
    abTage: Number.isInteger(ab) ? ab : RUECK_FENSTER.abTage,
    bisTage: Number.isInteger(bis) ? bis : RUECK_FENSTER.bisTage
  }
}

function rueckFensterFehler({ abTage, bisTage }) {
  const fehler = []
  if (!Number.isInteger(abTage) || abTage < RUECK_GRENZEN.abMin) fehler.push(`Rückgewinnung: „ab“ muss mindestens ${RUECK_GRENZEN.abMin} Tage sein.`)
  if (!Number.isInteger(bisTage) || bisTage > RUECK_GRENZEN.bisMax) fehler.push(`Rückgewinnung: „bis“ darf höchstens ${RUECK_GRENZEN.bisMax} Tage sein.`)
  if (Number.isInteger(abTage) && Number.isInteger(bisTage) && bisTage <= abTage) fehler.push('Rückgewinnung: „bis“ muss größer sein als „ab“.')
  return fehler
}

// Aus den Käufern (shopify.kaeuferHolen) die heraussuchen, deren letzte Bestellung im
// Fenster liegt und für die es noch keine Serie gab. `gemerkt` ist { email: bestellungId }
// der schon angeschriebenen — es überdauert das Aufräumen alter Läufe, sonst bekäme dieselbe
// Person nach 30 Tagen dieselbe Mail noch einmal. Kauft sie wieder und bleibt dann erneut
// weg, ist ihre letzte Bestellung eine andere, und sie darf wieder dran sein.
// Die mit der jüngsten Bestellung zuerst: sie sind am ehesten zurückzuholen.
function rueckKandidaten(kaeufer, { abTage, bisTage, gemerkt = {}, jetzt = Date.now(), grenze = RUECK_JE_TAG } = {}) {
  const frueheste = jetzt - bisTage * TAG
  const spaeteste = jetzt - abTage * TAG
  const gesehen = new Set()
  return alsListe(kaeufer)
    .filter((k) => {
      const email = sauber(k.email).toLowerCase()
      const am = Number(k.letzteBestellungAm)
      if (!email || !k.letzteBestellungId || !Number.isFinite(am)) return false
      if (am < frueheste || am > spaeteste) return false
      if (gemerkt[email] === k.letzteBestellungId) return false
      if (gesehen.has(email)) return false
      gesehen.add(email)
      return true
    })
    .sort((a, b) => b.letzteBestellungAm - a.letzteBestellungAm)
    .slice(0, Math.max(Number(grenze) || 0, 0))
}

function neueAutomation(art, { jetzt = Date.now() } = {}) {
  const vorlage = AUSLOESER[art]
  if (!vorlage) return null
  return {
    id: neueId('a'),
    art,
    name: vorlage.name,
    aktiv: false, // bewusst aus: erst Texte schreiben, Testmail prüfen, dann einschalten
    nurMitZustimmung: true,
    schritte: vorlage.standardSchritte.map((s) => ({ ...s, html: '' })),
    ...(art === 'rueckgewinnung' ? { ...RUECK_FENSTER } : {}),
    erstelltAm: jetzt,
    geaendertAm: jetzt
  }
}

// Eine Automation ist nur sendefähig, wenn jeder Schritt Betreff und Inhalt hat
function automationPruefen(automation = {}) {
  const fehler = []
  if (!ARTEN.includes(automation.art)) fehler.push('Unbekannte Art von Automation.')
  const schritte = Array.isArray(automation.schritte) ? automation.schritte : []
  if (!schritte.length) fehler.push('Die Automation hat keinen Schritt.')
  if (automation.art === 'rueckgewinnung') fehler.push(...rueckFensterFehler(rueckFenster(automation)))
  schritte.forEach((schritt, i) => {
    const nummer = i + 1
    if (!sauber(schritt?.betreff)) fehler.push(`Schritt ${nummer}: der Betreff fehlt.`)
    if (/[\r\n]/.test(String(schritt?.betreff ?? ''))) fehler.push(`Schritt ${nummer}: der Betreff darf keinen Zeilenumbruch enthalten.`)
    // Der Inhalt ist HTML. Ältere Schritte aus der Zeit der Baustein-Oberfläche haben
    // keines — dann zählen ihre Bausteine, bis der Schritt neu gespeichert wird.
    const hatHtml = String(schritt?.html ?? '').trim().length > 0
    const hatBausteine = Array.isArray(schritt?.bausteine) && schritt.bausteine.length > 0
    if (!hatHtml && !hatBausteine) fehler.push(`Schritt ${nummer}: der Inhalt fehlt.`)
    // Unbekannte Platzhalter kämen wörtlich an; Warenkorb-Angaben gibt es nur beim Warenkorb
    const erlaubt = automation.art === 'warenkorb' ? [...PLATZHALTER_BASIS, ...PLATZHALTER_WARENKORB] : PLATZHALTER_BASIS
    const fremde = fremdePlatzhalter(`${schritt?.betreff ?? ''} ${schritt?.html ?? ''}`, erlaubt)
    if (fremde.length) fehler.push(`Schritt ${nummer}: unbekannte Platzhalter ${fremde.slice(0, 6).join(', ')}.`)
    if (bilderOhneAdresse(schritt?.html).length) fehler.push(`Schritt ${nummer}: ein Bild hat keine gültige Adresse (https://…).`)
    if (!Number.isFinite(Number(schritt?.nach)) || Number(schritt.nach) < 0) fehler.push(`Schritt ${nummer}: die Wartezeit ist unbrauchbar.`)
    const verfall = Number(schritt?.verfallNach)
    if (!Number.isFinite(verfall) || verfall <= 0) fehler.push(`Schritt ${nummer}: das Verfallsfenster ist unbrauchbar.`)
  })
  return { ok: fehler.length === 0, fehler }
}

const schluesselVon = ({ automationId, ausloeserId, email }) => `${automationId}:${sauber(ausloeserId) || sauber(email).toLowerCase()}`

// Einen Lauf beginnen. Doppelte werden übersprungen, nicht gemeldet — der Auslöser liefert
// dasselbe Ereignis bei jedem Abruf erneut.
function laufStarten(laeufe, { automationId, email, ausloeserId = '', schritte = [], jetzt = Date.now(), daten = {} } = {}) {
  const liste = alsListe(laeufe)
  const adresse = sauber(email).toLowerCase()
  if (!adresse || !automationId || !schritte.length) return { liste, gestartet: false, grund: 'unvollständig' }

  const schluessel = schluesselVon({ automationId, ausloeserId, email: adresse })
  if (liste.some((l) => l.schluessel === schluessel)) return { liste, gestartet: false, grund: 'läuft schon' }

  const erster = schritte[0]
  const lauf = {
    id: neueId('l'),
    schluessel,
    automationId,
    email: adresse,
    ausloeserId: sauber(ausloeserId),
    daten, // z. B. Warenkorb-Inhalt und Wiederherstellungs-Link
    schritt: 0,
    zustand: 'laeuft',
    begonnenAm: jetzt,
    faelligAb: jetzt + Number(erster.nach || 0),
    verfaelltAm: jetzt + Number(erster.verfallNach || 48 * STUNDE),
    abbruchGrund: null,
    erledigtAm: null
  }
  return { liste: [...liste, lauf], gestartet: true, lauf }
}

// Läufe, deren nächster Schritt dran ist
function faellige(laeufe, jetzt = Date.now()) {
  return alsListe(laeufe).filter((l) => l.zustand === 'laeuft' && l.faelligAb <= jetzt && l.verfaelltAm > jetzt)
}

// Was zu lange gewartet hat, wird nicht mehr gesendet
function verfalleneMarkieren(laeufe, jetzt = Date.now()) {
  let anzahl = 0
  const liste = alsListe(laeufe).map((l) => {
    if (l.zustand === 'laeuft' && l.verfaelltAm <= jetzt) {
      anzahl++
      return { ...l, zustand: 'abgebrochen', abbruchGrund: 'zu spät (Verfallsfenster abgelaufen)', erledigtAm: jetzt }
    }
    return l
  })
  return { liste, anzahl }
}

// Nach einem versendeten Schritt: weiter zum nächsten oder fertig
function schrittGemacht(laeufe, id, schritte = [], { jetzt = Date.now() } = {}) {
  return alsListe(laeufe).map((l) => {
    if (l.id !== id) return l
    const naechsteNummer = l.schritt + 1
    const naechster = schritte[naechsteNummer]
    if (!naechster) return { ...l, zustand: 'fertig', schritt: naechsteNummer, erledigtAm: jetzt }
    return {
      ...l,
      schritt: naechsteNummer,
      faelligAb: jetzt + Number(naechster.nach || 0),
      verfaelltAm: jetzt + Number(naechster.verfallNach || 48 * STUNDE)
    }
  })
}

// Abbrechen, wenn der Zweck erfüllt ist (Bestellung) oder die Person nicht mehr will
// (Abmeldung). `nur` begrenzt auf eine Automationsart.
function abbrechen(laeufe, { email, grund = 'abgebrochen', jetzt = Date.now(), automationIds = null } = {}) {
  const adresse = sauber(email).toLowerCase()
  let anzahl = 0
  const liste = alsListe(laeufe).map((l) => {
    if (l.zustand !== 'laeuft') return l
    if (adresse && l.email !== adresse) return l
    if (automationIds && !automationIds.includes(l.automationId)) return l
    anzahl++
    return { ...l, zustand: 'abgebrochen', abbruchGrund: sauber(grund), erledigtAm: jetzt }
  })
  return { liste, anzahl }
}

// Läufe einer gelöschten oder abgeschalteten Automation beenden
function laeufeVon(laeufe, automationId) {
  return alsListe(laeufe).filter((l) => l.automationId === automationId)
}

function aufraeumen(laeufe, jetzt = Date.now(), { behalten = 30 * 24 * STUNDE } = {}) {
  return alsListe(laeufe).filter((l) => l.zustand === 'laeuft' || !l.erledigtAm || l.erledigtAm > jetzt - behalten)
}

function stand(laeufe, automationId = null) {
  const alle = automationId ? laeufeVon(laeufe, automationId) : alsListe(laeufe)
  return {
    gesamt: alle.length,
    laufen: alle.filter((l) => l.zustand === 'laeuft').length,
    fertig: alle.filter((l) => l.zustand === 'fertig').length,
    abgebrochen: alle.filter((l) => l.zustand === 'abgebrochen').length
  }
}

// Darf an diese Person gesendet werden? Die Prüfung liegt hier, damit sie nicht in der
// Oberfläche vergessen werden kann.
function darfSenden({ automation, kontakt }) {
  if (!kontakt) return { ok: false, grund: 'Die Adresse ist nicht in den Kontakten.' }
  if (kontakt.gesperrt) return { ok: false, grund: 'Der Kontakt ist abgemeldet.' }
  if (automation?.nurMitZustimmung !== false && !kontakt.zustimmungAm) {
    return { ok: false, grund: 'Keine Marketing-Zustimmung hinterlegt.' }
  }
  return { ok: true }
}

module.exports = {
  AUSLOESER,
  ARTEN,
  STUNDE,
  neueAutomation,
  automationPruefen,
  laufStarten,
  faellige,
  verfalleneMarkieren,
  schrittGemacht,
  abbrechen,
  laeufeVon,
  aufraeumen,
  stand,
  darfSenden,
  schluesselVon,
  rueckFenster,
  rueckFensterFehler,
  rueckKandidaten,
  RUECK_FENSTER,
  RUECK_GRENZEN,
  RUECK_JE_TAG
}
