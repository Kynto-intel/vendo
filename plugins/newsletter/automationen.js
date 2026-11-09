'use strict'
// Newsletter-Plugin: Automationen.
//
// Eine Automation ist eine Folge von Mails mit Wartezeiten, ausgelöst durch ein Ereignis:
//   warenkorb       — jemand hat einen Warenkorb stehen gelassen
//   willkommen      — jemand ist neu als Abonnent dazugekommen
//   rueckgewinnung   — jemand hat lange nichts gekauft (Auslöser kommt später)
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

const AUSLOESER = {
  warenkorb: {
    name: 'Warenkorb abgebrochen',
    beschreibung: 'Jemand hat Artikel im Warenkorb gelassen, ohne zu bestellen.',
    abbruchBei: ['bestellung', 'abmeldung'],
    standardSchritte: [
      { nach: 4 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Du hast etwas vergessen', bausteine: [] },
      { nach: 24 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Noch da? Dein Warenkorb wartet', bausteine: [] }
    ]
  },
  willkommen: {
    name: 'Willkommen',
    beschreibung: 'Jemand hat sich neu für den Newsletter angemeldet.',
    abbruchBei: ['abmeldung'],
    standardSchritte: [
      { nach: STUNDE, verfallNach: 14 * 24 * STUNDE, betreff: 'Willkommen', bausteine: [] },
      { nach: 3 * 24 * STUNDE, verfallNach: 14 * 24 * STUNDE, betreff: 'Schön, dass du da bist', bausteine: [] }
    ]
  },
  rueckgewinnung: {
    name: 'Rückgewinnung',
    beschreibung: 'Jemand hat lange nichts gekauft. Der Auslöser dafür ist noch nicht gebaut.',
    abbruchBei: ['bestellung', 'abmeldung'],
    standardSchritte: [{ nach: STUNDE, verfallNach: 30 * 24 * STUNDE, betreff: 'Lange nichts gehört', bausteine: [] }]
  }
}

const ARTEN = Object.keys(AUSLOESER)
const neueId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const sauber = (wert) => String(wert ?? '').trim()
const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((x) => x && typeof x === 'object') : [])

function neueAutomation(art, { jetzt = Date.now() } = {}) {
  const vorlage = AUSLOESER[art]
  if (!vorlage) return null
  return {
    id: neueId('a'),
    art,
    name: vorlage.name,
    aktiv: false, // bewusst aus: erst Texte schreiben, Testmail prüfen, dann einschalten
    nurMitZustimmung: true,
    schritte: vorlage.standardSchritte.map((s) => ({ ...s, bausteine: [] })),
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
  schritte.forEach((schritt, i) => {
    const nummer = i + 1
    if (!sauber(schritt?.betreff)) fehler.push(`Schritt ${nummer}: der Betreff fehlt.`)
    if (/[\r\n]/.test(String(schritt?.betreff ?? ''))) fehler.push(`Schritt ${nummer}: der Betreff darf keinen Zeilenumbruch enthalten.`)
    if (!Array.isArray(schritt?.bausteine) || !schritt.bausteine.length) fehler.push(`Schritt ${nummer}: der Inhalt fehlt.`)
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
  schluesselVon
}
