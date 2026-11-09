// Newsletter-Plugin, Phase 1: Warteschlange.
// Geprüft wird die Idempotenz (keine doppelten Mails), die Reihenfolge, die Versuche, der
// Verfall und das Aufräumen. Die Uhr wird gestellt, es wird nichts versendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import ws from '../plugins/newsletter/warteschlange.js'

const { einreihen, naechster, verfalleneMarkieren, erfolgMerken, fehlschlagMerken, aufraeumen, offeneVerwerfen, stand, schluesselVon, VERFALL, WARTEZEIT, BEHALTEN } = ws

const JETZT = 1_700_000_000_000

const dreiKontakte = [
  { kampagneId: 'k1', an: 'anna@beispiel.de' },
  { kampagneId: 'k1', an: 'bo@beispiel.de' },
  { kampagneId: 'k1', an: 'cem@beispiel.de' }
]

// ── Einreihen und Idempotenz ──

test('einreihen legt Einträge an und setzt Verfallsfrist und Fälligkeit', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  assert.equal(e.eingereiht, 3)
  assert.equal(e.uebersprungen, 0)
  assert.equal(e.liste.length, 3)
  const erster = e.liste[0]
  assert.equal(erster.zustand, 'offen')
  assert.equal(erster.versuche, 0)
  assert.equal(erster.faelligAb, JETZT)
  assert.equal(erster.verfaelltAm, JETZT + VERFALL)
  assert.equal(erster.art, 'kampagne')
})

test('dieselbe Kampagne und dieselbe Adresse kommen nicht zweimal in die Schlange', () => {
  const erste = einreihen([], dreiKontakte, { jetzt: JETZT })
  const zweite = einreihen(erste.liste, dreiKontakte, { jetzt: JETZT })
  assert.equal(zweite.eingereiht, 0, 'nichts Neues')
  assert.equal(zweite.uebersprungen, 3)
  assert.equal(zweite.liste.length, 3, 'die Liste wächst nicht')
})

test('schon gesendete Einträge verhindern einen zweiten Versand', () => {
  const erste = einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  const gesendet = erfolgMerken(erste.liste, erste.liste[0].id, JETZT)
  const nochmal = einreihen(gesendet, [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  assert.equal(nochmal.eingereiht, 0, 'wer bedient wurde, wird nicht erneut eingereiht')
  assert.equal(nochmal.uebersprungen, 1)
})

test('dieselbe Adresse in einer anderen Kampagne ist etwas anderes', () => {
  const erste = einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  const zweite = einreihen(erste.liste, [{ kampagneId: 'k2', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  assert.equal(zweite.eingereiht, 1)
})

test('ein endgültig fehlgeschlagener Eintrag darf neu eingereiht werden', () => {
  const erste = einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  let liste = erste.liste
  for (let i = 0; i < 3; i++) liste = fehlschlagMerken(liste, erste.liste[0].id, 'EAUTH', { jetzt: JETZT })
  assert.equal(liste[0].zustand, 'fehler')
  const nochmal = einreihen(liste, [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  assert.equal(nochmal.eingereiht, 1, 'nach einem endgültigen Fehler ist ein neuer Versuch erlaubt')
})

test('einreihen überspringt Einträge ohne Adresse', () => {
  const e = einreihen([], [{ kampagneId: 'k1' }, { kampagneId: 'k1', an: '   ' }, { kampagneId: 'k1', an: 'gut@beispiel.de' }], { jetzt: JETZT })
  assert.equal(e.eingereiht, 1)
  assert.equal(e.uebersprungen, 2)
})

test('die Adresse wird klein geschrieben und der Schlüssel ist eindeutig', () => {
  const e = einreihen([], [{ kampagneId: 'k1', an: '  Anna@Beispiel.DE ' }], { jetzt: JETZT })
  assert.equal(e.liste[0].an, 'anna@beispiel.de')
  assert.equal(e.liste[0].schluessel, 'k1:anna@beispiel.de')
  assert.equal(schluesselVon({ an: 'X@Y.de' }), 'einzel:x@y.de', 'ohne Kampagne zählt es als Einzelmail')
})

// ── Reihenfolge ──

test('naechster nimmt den, der am längsten wartet', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const liste = e.liste.map((eintrag, i) => ({ ...eintrag, faelligAb: JETZT + (2 - i) * 1000 }))
  assert.equal(naechster(liste, JETZT + 5000).an, 'cem@beispiel.de', 'der früheste Fälligkeitszeitpunkt zuerst')
})

test('naechster überspringt, was noch wartet oder schon verfallen ist', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const liste = [
    { ...e.liste[0], faelligAb: JETZT + 600000 }, // wartet auf den nächsten Versuch
    { ...e.liste[1], verfaelltAm: JETZT - 1 }, // verfallen
    { ...e.liste[2] } // dieser ist dran
  ]
  assert.equal(naechster(liste, JETZT).an, 'cem@beispiel.de')
})

test('naechster gibt null, wenn nichts fällig ist', () => {
  assert.equal(naechster([], JETZT), null)
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const alleGesendet = e.liste.map((x) => ({ ...x, zustand: 'gesendet' }))
  assert.equal(naechster(alleGesendet, JETZT), null)
})

// ── Versuche ──

test('ein Fehlversuch wartet und probiert es noch zweimal', () => {
  const e = einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  const id = e.liste[0].id

  const nach1 = fehlschlagMerken(e.liste, id, 'ETIMEDOUT', { jetzt: JETZT })
  assert.equal(nach1[0].zustand, 'offen')
  assert.equal(nach1[0].versuche, 1)
  assert.equal(nach1[0].faelligAb, JETZT + WARTEZEIT, 'der nächste Versuch kommt später')
  assert.equal(naechster(nach1, JETZT), null, 'sofort ist er nicht dran')
  assert.ok(naechster(nach1, JETZT + WARTEZEIT), 'nach der Wartezeit schon')

  const nach2 = fehlschlagMerken(nach1, id, 'ETIMEDOUT', { jetzt: JETZT })
  assert.equal(nach2[0].versuche, 2)
  assert.equal(nach2[0].zustand, 'offen')

  const nach3 = fehlschlagMerken(nach2, id, 'ETIMEDOUT', { jetzt: JETZT })
  assert.equal(nach3[0].versuche, 3)
  assert.equal(nach3[0].zustand, 'fehler', 'nach drei Versuchen ist Schluss')
  assert.equal(nach3[0].letzterFehler, 'ETIMEDOUT')
})

test('erfolgMerken schließt den Eintrag ab', () => {
  const e = einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.de' }], { jetzt: JETZT })
  const fertig = erfolgMerken(e.liste, e.liste[0].id, JETZT)
  assert.equal(fertig[0].zustand, 'gesendet')
  assert.equal(fertig[0].erledigtAm, JETZT)
  assert.equal(fertig[0].letzterFehler, null)
})

// ── Verfall und Aufräumen ──

test('was zu lange gewartet hat, verfällt statt rauszugehen', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const spaeter = JETZT + VERFALL + 1
  const verfallen = verfalleneMarkieren(e.liste, spaeter)
  assert.equal(verfallen.anzahl, 3)
  assert.equal(verfallen.liste[0].zustand, 'abgelaufen')
  assert.match(verfallen.liste[0].letzterFehler, /Verfallsfrist/)
  assert.equal(naechster(verfallen.liste, spaeter), null)
})

test('eine eigene Verfallsfrist ist möglich (etwa 48 Stunden für Warenkorb-Mails)', () => {
  const e = einreihen([], [{ kampagneId: 'warenkorb', an: 'anna@beispiel.de', verfaelltAm: JETZT + 3600000 }], { jetzt: JETZT })
  assert.equal(e.liste[0].verfaelltAm, JETZT + 3600000)
  assert.equal(verfalleneMarkieren(e.liste, JETZT + 3600001).anzahl, 1)
})

test('aufraeumen behält Offenes und wirft alte Erledigte weg', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const liste = [
    { ...e.liste[0] }, // offen
    { ...e.liste[1], zustand: 'gesendet', erledigtAm: JETZT - BEHALTEN - 1 }, // alt
    { ...e.liste[2], zustand: 'gesendet', erledigtAm: JETZT - 1000 } // frisch
  ]
  const geraeumt = aufraeumen(liste, JETZT)
  assert.equal(geraeumt.length, 2)
  assert.ok(geraeumt.some((x) => x.zustand === 'offen'))
  assert.ok(!geraeumt.some((x) => x.erledigtAm === JETZT - BEHALTEN - 1))
})

test('offeneVerwerfen bricht den Versand ab und lässt Erledigtes stehen', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const liste = erfolgMerken(e.liste, e.liste[0].id, JETZT)
  const abgebrochen = offeneVerwerfen(liste, { jetzt: JETZT })
  assert.equal(abgebrochen.anzahl, 2)
  assert.equal(abgebrochen.liste.filter((x) => x.zustand === 'gesendet').length, 1)
  assert.equal(naechster(abgebrochen.liste, JETZT), null)
})

test('offeneVerwerfen kann auf eine Kampagne begrenzt werden', () => {
  const erste = einreihen([], [{ kampagneId: 'k1', an: 'a@beispiel.de' }], { jetzt: JETZT })
  const zweite = einreihen(erste.liste, [{ kampagneId: 'k2', an: 'b@beispiel.de' }], { jetzt: JETZT })
  const abgebrochen = offeneVerwerfen(zweite.liste, { kampagneId: 'k1', jetzt: JETZT })
  assert.equal(abgebrochen.anzahl, 1)
  assert.equal(abgebrochen.liste.find((x) => x.kampagneId === 'k2').zustand, 'offen')
})

// ── Stand ──

test('stand zählt die Zustände auseinander', () => {
  const e = einreihen([], dreiKontakte, { jetzt: JETZT })
  const liste = [
    { ...e.liste[0] },
    { ...e.liste[1], faelligAb: JETZT + 600000 },
    { ...e.liste[2], zustand: 'gesendet', erledigtAm: JETZT }
  ]
  const s = stand(liste, JETZT)
  assert.equal(s.gesamt, 3)
  assert.equal(s.offen, 2)
  assert.equal(s.faellig, 1)
  assert.equal(s.wartend, 1)
  assert.equal(s.gesendet, 1)
})

test('eine kaputte Liste führt nicht zum Absturz', () => {
  assert.deepEqual(stand(null).gesamt, 0)
  assert.equal(naechster(undefined, JETZT), null)
  assert.equal(einreihen('kein Array', dreiKontakte, { jetzt: JETZT }).eingereiht, 3)
  assert.equal(aufraeumen([null, 'Müll', 42], JETZT).length, 0)
})
