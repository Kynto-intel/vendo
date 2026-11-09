// Newsletter-Plugin, Phase 1: Drossel.
// Geprüft wird das Stundenbudget, der Mindestabstand zwischen zwei Mails und die Pause nach
// einem Limit-Fehler. Die Uhr wird gestellt, es wird nichts versendet und nicht gewartet.

import assert from 'node:assert/strict'
import test from 'node:test'
import drosselModul from '../plugins/newsletter/drossel.js'

const { drosselMachen, istLimitFehler, budgetPruefen, BUDGET_STANDARD, BUDGET_MAX, FENSTER } = drosselModul

// Eine stellbare Uhr: so lässt sich eine Stunde in einer Millisekunde durchspielen
function uhr(start = 1_700_000_000_000) {
  let jetzt = start
  return { jetzt: () => jetzt, vor: (ms) => (jetzt += ms), stand: () => jetzt }
}

// Drossel füllen: n Mails vermerken. Ohne Zeitvorschub, damit alle im selben Fenster
// liegen — `gesendetMerken` prüft den Abstand nicht, es ist nur der Vermerk danach.
function fuellen(drossel, anzahl) {
  let stand = null
  for (let i = 0; i < anzahl; i++) stand = drossel.gesendetMerken()
  return stand
}

// ── Budget prüfen ──

test('budgetPruefen hält sich an die Grenzen von IONOS', () => {
  assert.equal(budgetPruefen(200), 200)
  assert.equal(budgetPruefen(BUDGET_MAX + 100), BUDGET_MAX, 'mehr als 500/h erlaubt IONOS nicht')
  assert.equal(budgetPruefen(0), BUDGET_STANDARD)
  assert.equal(budgetPruefen(-5), BUDGET_STANDARD)
  assert.equal(budgetPruefen('keine Zahl'), BUDGET_STANDARD)
  assert.equal(budgetPruefen(12.6), 13, 'wird gerundet')
})

// ── Mindestabstand ──

test('die erste Mail darf sofort raus', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 300, jetzt: zeit.jetzt })
  assert.equal(d.darfSenden().ok, true)
})

test('zwischen zwei Mails liegt der Mindestabstand', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 300, jetzt: zeit.jetzt })
  assert.equal(d.abstand, 12000, '3600 s / 300 Mails = 12 s')

  d.gesendetMerken()
  const sofort = d.darfSenden()
  assert.equal(sofort.ok, false)
  assert.equal(sofort.grund, 'abstand')
  assert.ok(sofort.wartenMs > 0 && sofort.wartenMs <= 12000)

  zeit.vor(12000)
  assert.equal(d.darfSenden().ok, true)
})

test('ein kleineres Budget bedeutet einen größeren Abstand', () => {
  const d = drosselMachen({ budget: 60 })
  assert.equal(d.abstand, 60000, 'bei 60/h eine Mail pro Minute')
})

// ── Stundenbudget ──

test('ist das Budget aufgebraucht, wird nicht mehr gesendet', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 10, jetzt: zeit.jetzt })
  fuellen(d, 10)

  const erschoepft = d.darfSenden()
  assert.equal(erschoepft.ok, false)
  assert.equal(erschoepft.grund, 'budget')
  assert.match(erschoepft.text, /10/)
  assert.ok(erschoepft.wartenMs > 0, 'es wird gesagt, wie lange es dauert')
})

test('das Fenster rollt: nach einer Stunde ist wieder Platz', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 10, jetzt: zeit.jetzt })
  fuellen(d, 10)
  assert.equal(d.darfSenden().grund, 'budget')

  // So weit vor, dass die erste Mail aus dem Fenster fällt
  zeit.vor(FENSTER + 1)
  const frei = d.darfSenden()
  assert.equal(frei.ok, true)
  assert.equal(d.uebersicht().gesendet, 0, 'alte Zeitstempel werden aufgeräumt')
})

test('die Übersicht zeigt Budget, Verbrauch und freien Rest', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 10, jetzt: zeit.jetzt })
  fuellen(d, 3)
  const u = d.uebersicht()
  assert.equal(u.budget, 10)
  assert.equal(u.gesendet, 3)
  assert.equal(u.frei, 7)
  assert.equal(u.pausiert, false)
})

// ── Pause nach einem Limit-Fehler ──

test('nach einem Limit-Fehler wird pausiert, auch wenn das Budget nicht voll ist', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 300, pause: 900000, jetzt: zeit.jetzt })
  d.pausieren()

  const gesperrt = d.darfSenden()
  assert.equal(gesperrt.ok, false)
  assert.equal(gesperrt.grund, 'pause')
  assert.ok(gesperrt.wartenMs > 800000)
  assert.equal(d.uebersicht().pausiert, true)

  zeit.vor(900000)
  assert.equal(d.darfSenden().ok, true, 'nach der Pause geht es weiter')
  assert.equal(d.uebersicht().pausiert, false)
})

test('die Pause lässt sich von Hand beenden', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 300, jetzt: zeit.jetzt })
  d.pausieren(900000)
  assert.equal(d.darfSenden().grund, 'pause')
  d.pauseBeenden()
  assert.equal(d.darfSenden().ok, true)
})

test('die Pause gilt vor dem Mindestabstand: der Grund ist die Pause', () => {
  const zeit = uhr()
  const d = drosselMachen({ budget: 300, jetzt: zeit.jetzt })
  d.gesendetMerken()
  d.pausieren(900000)
  assert.equal(d.darfSenden().grund, 'pause')
})

// ── Zustand über einen Neustart ──

test('der Stand übersteht einen Neustart: das Budget ist danach nicht wieder leer', () => {
  const zeit = uhr()
  const erste = drosselMachen({ budget: 10, jetzt: zeit.jetzt })
  fuellen(erste, 10)
  const gespeichert = erste.stand()

  // Vendo startet neu, die Drossel wird aus den gespeicherten Daten aufgebaut
  const zweite = drosselMachen({ budget: 10, stand: gespeichert, jetzt: zeit.jetzt })
  assert.equal(zweite.uebersicht().gesendet, 10)
  assert.equal(zweite.darfSenden().grund, 'budget')
})

test('eine laufende Pause übersteht einen Neustart', () => {
  const zeit = uhr()
  const erste = drosselMachen({ jetzt: zeit.jetzt })
  const gespeichert = erste.pausieren(900000)

  const zweite = drosselMachen({ stand: gespeichert, jetzt: zeit.jetzt })
  assert.equal(zweite.darfSenden().grund, 'pause')
})

test('ein kaputter oder alter Stand blockiert nicht', () => {
  const zeit = uhr()
  const kaputt = drosselMachen({ stand: { sendungen: ['keine Zahl', null, NaN], pauseBis: 'gestern' }, jetzt: zeit.jetzt })
  assert.equal(kaputt.darfSenden().ok, true)
  assert.equal(kaputt.uebersicht().gesendet, 0)

  const alt = drosselMachen({ budget: 1, stand: { sendungen: [zeit.stand() - FENSTER - 1000], pauseBis: zeit.stand() - 1000 }, jetzt: zeit.jetzt })
  assert.equal(alt.darfSenden().ok, true, 'abgelaufene Zeitstempel und Pausen zählen nicht mehr')
})

test('der Stand wächst nicht endlos', () => {
  const zeit = uhr()
  const viele = Array.from({ length: 5000 }, (_, i) => zeit.stand() - i)
  const d = drosselMachen({ budget: BUDGET_MAX, stand: { sendungen: viele }, jetzt: zeit.jetzt })
  assert.ok(d.stand().sendungen.length <= 2000, 'die Liste der Zeitstempel ist begrenzt')
})

// ── Limit-Fehler erkennen ──

test('istLimitFehler erkennt die Antwort von IONOS', () => {
  assert.equal(istLimitFehler({ response: '450 Mail send limit exceeded' }), true)
  assert.equal(istLimitFehler({ message: '452 too many recipients, limit reached' }), true)
  assert.equal(istLimitFehler({ response: '550 Sender address is not allowed' }), false, 'das ist kein Limit')
  assert.equal(istLimitFehler({ code: 'EAUTH' }), false)
  assert.equal(istLimitFehler(null), false)
})
