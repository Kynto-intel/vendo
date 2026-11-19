'use strict'
// Newsletter-Plugin: Warteschlange.
//
// Warum es sie gibt: Die Drossel lässt nur alle paar Sekunden eine Mail durch, ein Versand an
// hunderte Empfänger dauert also Stunden. Solange darf niemand daneben sitzen, und ein
// Neustart von Vendo mittendrin soll keine Mail verlieren und keine blind doppelt schicken.
//
// Was sie nicht kann: „genau einmal“ garantieren. Nimmt der Postausgangsserver eine Mail an
// und Vendo stürzt ab, bevor der Erfolg gespeichert ist, weiß niemand sicher, ob sie raus ist.
// Deshalb wird ein Eintrag vor dem Versand auf `sendet` gesetzt. Bleibt er dort hängen (Absturz,
// Rechner aus), wird er nach `HAENGT` zu `unklar`: nicht automatisch wiederholt, sondern in der
// Oberfläche gezeigt. Lieber eine Mail zu wenig als eine doppelt.
//
// Wie sie arbeitet:
//   - Jeder Eintrag hat einen Schlüssel aus Kampagne und Empfänger. Zweimal einreihen geht
//     nicht: wer schon in der Schlange steht oder bereits bedient wurde, wird übersprungen.
//     Das ist der Schutz gegen doppelte Mails, nicht die Reihenfolge der Verarbeitung.
//   - Ein Eintrag wird höchstens dreimal versucht. Dazwischen liegt eine Wartezeit, damit ein
//     kurzzeitiges Problem nicht sofort alle Versuche verbraucht.
//   - Jeder Eintrag hat ein Verfallsdatum. Eine Warenkorb-Mail, die drei Tage alt ist, soll
//     nicht mehr rausgehen — besser gar nicht als peinlich spät.
//   - Erledigtes wird nach einer Woche weggeräumt, damit die Liste nicht endlos wächst.
//     Was passiert ist, steht im Protokoll, nicht hier.
//
// Alle Funktionen sind rein: sie verändern die übergebene Liste nicht, sondern geben eine
// neue zurück. Gespeichert wird in den Plugin-Daten unter `warteschlange`.

const MAX_VERSUCHE = 3
const WARTEZEIT = 600000 // 10 Minuten zwischen zwei Versuchen
const VERFALL = 172800000 // 48 Stunden, bis ein Eintrag von selbst verfällt
const BEHALTEN = 604800000 // erledigte Einträge eine Woche aufbewahren
const MAX_EINTRAEGE = 20000
const HAENGT = 900000 // 15 Minuten: weit über der SMTP-Frist (3 × 60 s), dann ist der Versand sicher vorbei
const UNKLAR_TEXT = 'Versand unterbrochen. Ob die Mail ankam, ist unklar; sie wird nicht von selbst wiederholt.'

const neueId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

// Der Schlüssel entscheidet, was als dieselbe Mail gilt
function schluesselVon({ kampagneId, an }) {
  const empfaenger = String(an || '').trim().toLowerCase()
  return `${kampagneId || 'einzel'}:${empfaenger}`
}

const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((e) => e && typeof e === 'object') : [])

// Einträge einreihen. Gibt die neue Liste zurück und sagt, was übersprungen wurde.
// `html` und `betreff` dürfen fehlen, wenn eine kampagneId dabei ist: dann holt der
// Hintergrundteil den Inhalt aus der Kampagne. So liegt das HTML einmal statt tausendmal da.
function einreihen(liste, neue, { jetzt = Date.now(), verfall = VERFALL } = {}) {
  const alt = alsListe(liste)
  const bekannt = new Set(alt.filter((e) => e.zustand !== 'abgelaufen' && e.zustand !== 'fehler').map((e) => e.schluessel))
  const eintraege = []
  let uebersprungen = 0

  for (const roh of Array.isArray(neue) ? neue : [neue]) {
    if (!roh || !String(roh.an || '').trim()) {
      uebersprungen++
      continue
    }
    const schluessel = schluesselVon(roh)
    if (bekannt.has(schluessel)) {
      uebersprungen++
      continue
    }
    bekannt.add(schluessel)
    eintraege.push({
      id: neueId(),
      schluessel,
      kampagneId: roh.kampagneId || null,
      an: String(roh.an).trim().toLowerCase(),
      betreff: roh.betreff ? String(roh.betreff) : null,
      html: roh.html ? String(roh.html) : null,
      art: roh.art === 'test' ? 'test' : 'kampagne',
      zustand: 'offen',
      versuche: 0,
      letzterFehler: null,
      erstelltAm: jetzt,
      faelligAb: Number(roh.faelligAb) || jetzt,
      verfaelltAm: Number(roh.verfaelltAm) || jetzt + verfall,
      erledigtAm: null
    })
  }

  const zusammen = [...alt, ...eintraege]
  return {
    liste: zusammen.length > MAX_EINTRAEGE ? zusammen.slice(-MAX_EINTRAEGE) : zusammen,
    eingereiht: eintraege.length,
    uebersprungen
  }
}

// Der nächste Eintrag, der dran ist. Null, wenn gerade keiner fällig ist.
function naechster(liste, jetzt = Date.now()) {
  const offen = alsListe(liste).filter((e) => e.zustand === 'offen' && e.faelligAb <= jetzt && e.verfaelltAm > jetzt)
  if (!offen.length) return null
  // Älteste zuerst: wer am längsten wartet, kommt dran
  return offen.sort((a, b) => a.faelligAb - b.faelligAb || a.erstelltAm - b.erstelltAm)[0]
}

// Was zu lange gewartet hat, geht nicht mehr raus
function verfalleneMarkieren(liste, jetzt = Date.now()) {
  let anzahl = 0
  const neu = alsListe(liste).map((e) => {
    if (e.zustand === 'offen' && e.verfaelltAm <= jetzt) {
      anzahl++
      return { ...e, zustand: 'abgelaufen', erledigtAm: jetzt, letzterFehler: 'Verfallsfrist abgelaufen' }
    }
    return e
  })
  return { liste: neu, anzahl }
}

// Unmittelbar vor dem Versand: der Eintrag ist unterwegs. Ab jetzt nimmt `naechster` ihn nicht
// mehr, und ein erneutes Einreihen derselben Mail wird übersprungen.
function versandBeginnen(liste, id, jetzt = Date.now()) {
  return alsListe(liste).map((e) => (e.id === id && e.zustand === 'offen' ? { ...e, zustand: 'sendet', sendetSeit: jetzt } : e))
}

// Der Versand hat gar nicht erst begonnen (etwa gedrosselt): zurück in die Schlange, ohne
// einen Versuch zu zählen.
function versandZuruecknehmen(liste, id) {
  return alsListe(liste).map((e) => {
    if (e.id !== id || e.zustand !== 'sendet') return e
    const { sendetSeit, ...rest } = e
    return { ...rest, zustand: 'offen' }
  })
}

// Was länger als `HAENGT` auf `sendet` steht, wurde unterbrochen: als `unklar` abschließen.
function haengendeMarkieren(liste, jetzt = Date.now(), { haengt = HAENGT } = {}) {
  let anzahl = 0
  const neu = alsListe(liste).map((e) => {
    if (e.zustand === 'sendet' && !(Number(e.sendetSeit) > jetzt - haengt)) {
      anzahl++
      return { ...e, zustand: 'unklar', erledigtAm: jetzt, letzterFehler: UNKLAR_TEXT }
    }
    return e
  })
  return { liste: neu, anzahl }
}

// Ein offener Eintrag geht nicht raus, weil der Empfänger inzwischen gesperrt ist. Er gilt
// als erledigt, ohne Versuch; wird die Sperre aufgehoben, darf er neu eingereiht werden.
function ueberspringen(liste, id, grund, jetzt = Date.now()) {
  return alsListe(liste).map((e) => {
    if (e.id !== id || e.zustand !== 'offen') return e
    return { ...e, zustand: 'abgelaufen', erledigtAm: jetzt, letzterFehler: String(grund || 'übersprungen').slice(0, 200) }
  })
}

// Ergebnis eines Versuchs vermerken
function erfolgMerken(liste, id, jetzt = Date.now()) {
  return alsListe(liste).map((e) => {
    if (e.id !== id) return e
    const { sendetSeit, ...rest } = e
    return { ...rest, zustand: 'gesendet', erledigtAm: jetzt, versuche: e.versuche + 1, letzterFehler: null }
  })
}

// Fehlversuch: noch einmal probieren oder endgültig aufgeben
function fehlschlagMerken(liste, id, fehler, { jetzt = Date.now(), wartezeit = WARTEZEIT, maxVersuche = MAX_VERSUCHE } = {}) {
  return alsListe(liste).map((roh) => {
    if (roh.id !== id) return roh
    const { sendetSeit, ...e } = roh
    const versuche = e.versuche + 1
    const text = fehler ? String(fehler).slice(0, 200) : 'unbekannter Fehler'
    if (versuche >= maxVersuche) {
      return { ...e, zustand: 'fehler', versuche, letzterFehler: text, erledigtAm: jetzt }
    }
    return { ...e, zustand: 'offen', versuche, letzterFehler: text, faelligAb: jetzt + wartezeit }
  })
}

// Erledigtes nach einer Woche wegräumen. Was passiert ist, steht im Protokoll.
function aufraeumen(liste, jetzt = Date.now(), { behalten = BEHALTEN } = {}) {
  return alsListe(liste).filter((e) => e.zustand === 'offen' || e.zustand === 'sendet' || !e.erledigtAm || e.erledigtAm > jetzt - behalten)
}

// Offene Einträge verwerfen (etwa „Versand abbrechen“). Erledigtes bleibt stehen.
function offeneVerwerfen(liste, { kampagneId = null, jetzt = Date.now() } = {}) {
  let anzahl = 0
  const neu = alsListe(liste).map((e) => {
    if (e.zustand === 'offen' && (!kampagneId || e.kampagneId === kampagneId)) {
      anzahl++
      return { ...e, zustand: 'abgelaufen', erledigtAm: jetzt, letzterFehler: 'von Hand abgebrochen' }
    }
    return e
  })
  return { liste: neu, anzahl }
}

function stand(liste, jetzt = Date.now()) {
  const alle = alsListe(liste)
  const offen = alle.filter((e) => e.zustand === 'offen')
  return {
    gesamt: alle.length,
    offen: offen.length,
    faellig: offen.filter((e) => e.faelligAb <= jetzt && e.verfaelltAm > jetzt).length,
    wartend: offen.filter((e) => e.faelligAb > jetzt).length,
    sendet: alle.filter((e) => e.zustand === 'sendet').length,
    gesendet: alle.filter((e) => e.zustand === 'gesendet').length,
    fehler: alle.filter((e) => e.zustand === 'fehler').length,
    unklar: alle.filter((e) => e.zustand === 'unklar').length,
    abgelaufen: alle.filter((e) => e.zustand === 'abgelaufen').length
  }
}

module.exports = {
  einreihen,
  naechster,
  verfalleneMarkieren,
  versandBeginnen,
  versandZuruecknehmen,
  ueberspringen,
  haengendeMarkieren,
  erfolgMerken,
  fehlschlagMerken,
  aufraeumen,
  offeneVerwerfen,
  stand,
  schluesselVon,
  MAX_VERSUCHE,
  WARTEZEIT,
  VERFALL,
  BEHALTEN,
  HAENGT
}
