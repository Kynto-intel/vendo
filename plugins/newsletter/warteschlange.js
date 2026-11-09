'use strict'
// Newsletter-Plugin: Warteschlange.
//
// Warum es sie gibt: Die Drossel lässt nur alle paar Sekunden eine Mail durch, ein Versand an
// hunderte Empfänger dauert also Stunden. Solange darf niemand daneben sitzen, und ein
// Neustart von Vendo mittendrin darf weder Mails verlieren noch doppelt schicken.
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

// Ergebnis eines Versuchs vermerken
function erfolgMerken(liste, id, jetzt = Date.now()) {
  return alsListe(liste).map((e) => (e.id === id ? { ...e, zustand: 'gesendet', erledigtAm: jetzt, versuche: e.versuche + 1, letzterFehler: null } : e))
}

// Fehlversuch: noch einmal probieren oder endgültig aufgeben
function fehlschlagMerken(liste, id, fehler, { jetzt = Date.now(), wartezeit = WARTEZEIT, maxVersuche = MAX_VERSUCHE } = {}) {
  return alsListe(liste).map((e) => {
    if (e.id !== id) return e
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
  return alsListe(liste).filter((e) => e.zustand === 'offen' || !e.erledigtAm || e.erledigtAm > jetzt - behalten)
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
    gesendet: alle.filter((e) => e.zustand === 'gesendet').length,
    fehler: alle.filter((e) => e.zustand === 'fehler').length,
    abgelaufen: alle.filter((e) => e.zustand === 'abgelaufen').length
  }
}

module.exports = {
  einreihen,
  naechster,
  verfalleneMarkieren,
  erfolgMerken,
  fehlschlagMerken,
  aufraeumen,
  offeneVerwerfen,
  stand,
  schluesselVon,
  MAX_VERSUCHE,
  WARTEZEIT,
  VERFALL,
  BEHALTEN
}
