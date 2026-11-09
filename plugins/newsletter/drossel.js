'use strict'
// Newsletter-Plugin: Drossel.
//
// Warum es sie gibt: Das Stundenlimit hängt am Postfach, nicht am Programm. Newsletter und
// Kundenservice senden über dieselbe Adresse, also muss der Newsletter Luft lassen. IONOS
// erlaubt bei Mail Basic/Business 500 Mails pro Stunde (ab 30 Tagen Postfach-Alter); die
// Voreinstellung hier ist 300, der Rest bleibt für Hermes und Antworten von Hand.
//
// Wie sie arbeitet:
//   - Rollierendes Fenster: gezählt wird, was in der letzten Stunde raus ist, nicht in einem
//     festen Stundenblock. Sonst wären direkt nach dem Stundenwechsel wieder 300 Mails auf
//     einen Schlag erlaubt.
//   - Mindestabstand: Budget und Fenster ergeben einen Abstand (bei 300/h sind das 12 s).
//     Gleichmäßig verteilt sieht für den Server weniger nach Spam aus als ein Schub.
//   - Pause: Kommt vom Server „450 … limit exceeded“, wird eine Weile gar nicht gesendet.
//     Das ist die Notbremse, falls die Rechnung nicht aufgeht (etwa weil Hermes gleichzeitig
//     viel verschickt hat).
//
// Der Zustand (Zeitstempel und Pause) gehört in die Plugin-Daten, damit ein Neustart ihn
// nicht vergisst: sonst wäre das Limit nach jedem Vendo-Start wieder leer.

const FENSTER = 3600000 // eine Stunde
const BUDGET_STANDARD = 300
const BUDGET_MAX = 500 // mehr erlaubt IONOS für Mail Basic/Business nicht
const PAUSE_STANDARD = 900000 // 15 Minuten nach einem Limit-Fehler
const MAX_STEMPEL = 2000 // Schutz gegen eine endlos wachsende Liste

function budgetPruefen(wert) {
  const zahl = Math.round(Number(wert))
  if (!Number.isFinite(zahl) || zahl < 1) return BUDGET_STANDARD
  return Math.min(zahl, BUDGET_MAX)
}

// stand: { sendungen: [Zeitstempel in ms], pauseBis: ms }
// Das Objekt wird nicht verändert, jede Änderung gibt einen neuen Stand zurück.
function drosselMachen({ budget = BUDGET_STANDARD, fenster = FENSTER, pause = PAUSE_STANDARD, stand = null, jetzt = () => Date.now() } = {}) {
  const grenze = budgetPruefen(budget)
  const abstand = Math.floor(fenster / grenze)

  const sauberer = (s) => {
    const zeit = jetzt()
    const sendungen = (Array.isArray(s?.sendungen) ? s.sendungen : [])
      .map(Number)
      .filter((t) => Number.isFinite(t) && t > zeit - fenster)
      .sort((a, b) => a - b)
      .slice(-MAX_STEMPEL)
    const pauseBis = Number(s?.pauseBis) || 0
    return { sendungen, pauseBis: pauseBis > zeit ? pauseBis : 0 }
  }

  let aktuell = sauberer(stand)

  return {
    budget: grenze,
    abstand,

    stand() {
      return { sendungen: [...aktuell.sendungen], pauseBis: aktuell.pauseBis }
    },

    // Was die Oberfläche anzeigt
    uebersicht() {
      const zeit = jetzt()
      aktuell = sauberer(aktuell)
      const letzte = aktuell.sendungen[aktuell.sendungen.length - 1] || 0
      return {
        budget: grenze,
        gesendet: aktuell.sendungen.length,
        frei: Math.max(grenze - aktuell.sendungen.length, 0),
        abstand,
        pauseBis: aktuell.pauseBis,
        pausiert: aktuell.pauseBis > zeit,
        letzteSendung: letzte || null
      }
    },

    // Darf jetzt eine Mail raus? Sonst sagt wartenMs, wie lange es dauert.
    darfSenden() {
      const zeit = jetzt()
      aktuell = sauberer(aktuell)

      if (aktuell.pauseBis > zeit) {
        return { ok: false, grund: 'pause', wartenMs: aktuell.pauseBis - zeit, text: 'Der Versand pausiert, weil das Postfach ein Limit gemeldet hat.' }
      }
      if (aktuell.sendungen.length >= grenze) {
        const aeltester = aktuell.sendungen[0]
        const frei = aeltester + fenster - zeit
        return {
          ok: false,
          grund: 'budget',
          wartenMs: Math.max(frei, 0),
          text: `Das Stundenbudget von ${grenze} Mails ist aufgebraucht. In der letzten Stunde sind ${aktuell.sendungen.length} raus.`
        }
      }
      const letzte = aktuell.sendungen[aktuell.sendungen.length - 1] || 0
      if (letzte && zeit - letzte < abstand) {
        return { ok: false, grund: 'abstand', wartenMs: abstand - (zeit - letzte), text: `Zwischen zwei Mails liegen mindestens ${Math.round(abstand / 1000)} Sekunden.` }
      }
      return { ok: true, wartenMs: 0 }
    },

    // Nach einem erfolgreichen Versand aufrufen
    gesendetMerken() {
      aktuell = sauberer(aktuell)
      aktuell = { ...aktuell, sendungen: [...aktuell.sendungen, jetzt()].slice(-MAX_STEMPEL) }
      return this.stand()
    },

    // Nach einem Limit-Fehler des Servers: eine Weile gar nicht senden
    pausieren(dauer = pause) {
      const ms = Math.max(Number(dauer) || 0, 0)
      aktuell = { ...sauberer(aktuell), pauseBis: jetzt() + ms }
      return this.stand()
    },

    pauseBeenden() {
      aktuell = { ...sauberer(aktuell), pauseBis: 0 }
      return this.stand()
    }
  }
}

// Erkennt die Antwort, mit der IONOS das Stundenlimit meldet
function istLimitFehler(fehler) {
  const antwort = `${fehler?.response || ''} ${fehler?.message || ''}`
  return /\b4\d\d\b/.test(antwort) && /limit/i.test(antwort)
}

module.exports = { drosselMachen, istLimitFehler, budgetPruefen, FENSTER, BUDGET_STANDARD, BUDGET_MAX, PAUSE_STANDARD }
