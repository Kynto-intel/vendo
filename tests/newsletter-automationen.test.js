// Newsletter-Plugin, Phase 4: Automationen.
// Geprüft wird die Zustandsmaschine: ein Lauf pro Ereignis, Schritte mit Wartezeit, Verfall,
// Abbruch bei Bestellung oder Abmeldung, und die Zustimmungsprüfung. Die Uhr wird gestellt,
// es wird nichts versendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import automationen from '../plugins/newsletter/automationen.js'

const { AUSLOESER, ARTEN, STUNDE, neueAutomation, automationPruefen, laufStarten, faellige, verfalleneMarkieren, schrittGemacht, abbrechen, aufraeumen, stand, darfSenden, schluesselVon } = automationen

const JETZT = 1_700_000_000_000

const SCHRITTE = [
  { nach: 4 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Vergessen?', bausteine: [{ art: 'text', text: 'Hallo' }] },
  { nach: 24 * STUNDE, verfallNach: 48 * STUNDE, betreff: 'Noch da?', bausteine: [{ art: 'text', text: 'Hallo' }] }
]

const starten = (liste, extra = {}) =>
  laufStarten(liste, { automationId: 'a1', email: 'anna@beispiel.de', ausloeserId: 'korb-1', schritte: SCHRITTE, jetzt: JETZT, ...extra })

// ── Anlegen und prüfen ──

test('es gibt die drei vorgesehenen Auslöser mit Abbruchregeln', () => {
  assert.deepEqual(ARTEN, ['warenkorb', 'willkommen', 'rueckgewinnung'])
  assert.deepEqual(AUSLOESER.warenkorb.abbruchBei, ['bestellung', 'abmeldung'])
  assert.deepEqual(AUSLOESER.willkommen.abbruchBei, ['abmeldung'], 'eine Bestellung beendet die Willkommensserie nicht')
})

test('eine neue Automation ist absichtlich ausgeschaltet und verlangt Zustimmung', () => {
  const a = neueAutomation('warenkorb', { jetzt: JETZT })
  assert.equal(a.aktiv, false, 'erst Texte schreiben und testen, dann einschalten')
  assert.equal(a.nurMitZustimmung, true)
  assert.ok(a.schritte.length >= 1)
  assert.equal(neueAutomation('gibtsnicht'), null)
})

test('automationPruefen verlangt Betreff und Inhalt in jedem Schritt', () => {
  const ohne = automationPruefen({ art: 'warenkorb', schritte: [{ nach: 0, verfallNach: STUNDE, betreff: '', bausteine: [] }] })
  assert.equal(ohne.ok, false)
  assert.match(ohne.fehler.join(' '), /Schritt 1: der Betreff fehlt/)
  assert.match(ohne.fehler.join(' '), /Schritt 1: der Inhalt fehlt/)

  assert.equal(automationPruefen({ art: 'warenkorb', schritte: SCHRITTE }).ok, true)
})

test('automationPruefen lehnt einen Zeilenumbruch im Betreff und kaputte Zeiten ab', () => {
  const e = automationPruefen({ art: 'warenkorb', schritte: [{ nach: -1, verfallNach: 0, betreff: 'A\nB', bausteine: [{ art: 'text', text: 'x' }] }] })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Zeilenumbruch/)
  assert.match(e.fehler.join(' '), /Wartezeit ist unbrauchbar/)
  assert.match(e.fehler.join(' '), /Verfallsfenster ist unbrauchbar/)
})

// ── Ein Lauf pro Ereignis ──

test('laufStarten legt einen Lauf mit Fälligkeit und Verfall an', () => {
  const e = starten([])
  assert.equal(e.gestartet, true)
  const lauf = e.liste[0]
  assert.equal(lauf.zustand, 'laeuft')
  assert.equal(lauf.schritt, 0)
  assert.equal(lauf.faelligAb, JETZT + 4 * STUNDE)
  assert.equal(lauf.verfaelltAm, JETZT + 48 * STUNDE)
  assert.equal(lauf.email, 'anna@beispiel.de')
})

test('dasselbe Ereignis startet keinen zweiten Lauf', () => {
  const erste = starten([])
  const zweite = starten(erste.liste)
  assert.equal(zweite.gestartet, false)
  assert.equal(zweite.grund, 'läuft schon')
  assert.equal(zweite.liste.length, 1, 'der Auslöser liefert denselben Warenkorb bei jedem Abruf — das darf nichts verdoppeln')
})

test('ein anderer Warenkorb derselben Person startet einen eigenen Lauf', () => {
  const erste = starten([])
  const zweite = starten(erste.liste, { ausloeserId: 'korb-2' })
  assert.equal(zweite.gestartet, true)
  assert.equal(zweite.liste.length, 2)
})

test('ohne Ereignis-ID zählt die Adresse als Schlüssel', () => {
  assert.equal(schluesselVon({ automationId: 'a1', email: 'Anna@Beispiel.de' }), 'a1:anna@beispiel.de')
  const erste = laufStarten([], { automationId: 'a1', email: 'anna@beispiel.de', schritte: SCHRITTE, jetzt: JETZT })
  const zweite = laufStarten(erste.liste, { automationId: 'a1', email: 'anna@beispiel.de', schritte: SCHRITTE, jetzt: JETZT })
  assert.equal(zweite.gestartet, false)
})

test('laufStarten verlangt Adresse, Automation und Schritte', () => {
  assert.equal(laufStarten([], { automationId: 'a1', schritte: SCHRITTE }).gestartet, false)
  assert.equal(laufStarten([], { email: 'a@beispiel.de', schritte: SCHRITTE }).gestartet, false)
  assert.equal(laufStarten([], { automationId: 'a1', email: 'a@beispiel.de', schritte: [] }).gestartet, false)
})

// ── Schritte ──

test('ein Lauf wird erst zur Wartezeit fällig', () => {
  const liste = starten([]).liste
  assert.equal(faellige(liste, JETZT).length, 0, 'sofort noch nicht')
  assert.equal(faellige(liste, JETZT + 4 * STUNDE).length, 1, 'nach vier Stunden schon')
})

test('nach dem ersten Schritt folgt der zweite mit eigener Wartezeit', () => {
  const liste = starten([]).liste
  const nach1 = schrittGemacht(liste, liste[0].id, SCHRITTE, { jetzt: JETZT + 4 * STUNDE })
  assert.equal(nach1[0].schritt, 1)
  assert.equal(nach1[0].zustand, 'laeuft')
  assert.equal(nach1[0].faelligAb, JETZT + 4 * STUNDE + 24 * STUNDE)

  const nach2 = schrittGemacht(nach1, liste[0].id, SCHRITTE, { jetzt: JETZT + 28 * STUNDE })
  assert.equal(nach2[0].zustand, 'fertig', 'nach dem letzten Schritt ist die Serie durch')
  assert.equal(nach2[0].erledigtAm, JETZT + 28 * STUNDE)
})

// ── Verfall ──

test('ein Schritt, der zu spät dran wäre, verfällt statt rauszugehen', () => {
  const liste = starten([]).liste
  const spaet = JETZT + 49 * STUNDE
  assert.equal(faellige(liste, spaet).length, 0, 'nach dem Verfallsfenster nicht mehr fällig')
  const verfallen = verfalleneMarkieren(liste, spaet)
  assert.equal(verfallen.anzahl, 1)
  assert.equal(verfallen.liste[0].zustand, 'abgebrochen')
  assert.match(verfallen.liste[0].abbruchGrund, /zu spät/)
})

// ── Abbruch ──

test('eine Bestellung beendet die Serie', () => {
  const liste = starten([]).liste
  const e = abbrechen(liste, { email: 'anna@beispiel.de', grund: 'Bestellung eingegangen', automationIds: ['a1'], jetzt: JETZT })
  assert.equal(e.anzahl, 1)
  assert.equal(e.liste[0].zustand, 'abgebrochen')
  assert.equal(e.liste[0].abbruchGrund, 'Bestellung eingegangen')
  assert.equal(faellige(e.liste, JETZT + 4 * STUNDE).length, 0)
})

test('der Abbruch trifft nur die genannte Adresse und Automation', () => {
  let liste = starten([]).liste
  liste = laufStarten(liste, { automationId: 'a2', email: 'bo@beispiel.de', ausloeserId: 'x', schritte: SCHRITTE, jetzt: JETZT }).liste
  liste = laufStarten(liste, { automationId: 'a2', email: 'anna@beispiel.de', ausloeserId: 'y', schritte: SCHRITTE, jetzt: JETZT }).liste

  const nurA1 = abbrechen(liste, { email: 'anna@beispiel.de', automationIds: ['a1'], jetzt: JETZT })
  assert.equal(nurA1.anzahl, 1)
  assert.equal(nurA1.liste.filter((l) => l.zustand === 'laeuft').length, 2)

  const alleVonAnna = abbrechen(liste, { email: 'anna@beispiel.de', jetzt: JETZT })
  assert.equal(alleVonAnna.anzahl, 2, 'ohne Automationsfilter alle Serien dieser Person')
})

test('ohne Adresse lassen sich alle Läufe einer Automation beenden (Abschalten)', () => {
  let liste = starten([]).liste
  liste = laufStarten(liste, { automationId: 'a1', email: 'bo@beispiel.de', ausloeserId: 'z', schritte: SCHRITTE, jetzt: JETZT }).liste
  const e = abbrechen(liste, { grund: 'Automation abgeschaltet', automationIds: ['a1'], jetzt: JETZT })
  assert.equal(e.anzahl, 2)
})

test('ein abgebrochener Lauf wird nicht noch einmal abgebrochen', () => {
  const liste = abbrechen(starten([]).liste, { email: 'anna@beispiel.de', jetzt: JETZT }).liste
  assert.equal(abbrechen(liste, { email: 'anna@beispiel.de', jetzt: JETZT }).anzahl, 0)
})

// ── Zustimmung ──

test('darfSenden verlangt Zustimmung, solange die Automation es vorschreibt', () => {
  const streng = { nurMitZustimmung: true }
  assert.equal(darfSenden({ automation: streng, kontakt: { zustimmungAm: '2025-01-01' } }).ok, true)

  const ohne = darfSenden({ automation: streng, kontakt: { zustimmungAm: null } })
  assert.equal(ohne.ok, false)
  assert.match(ohne.grund, /Zustimmung/)

  assert.equal(darfSenden({ automation: { nurMitZustimmung: false }, kontakt: { zustimmungAm: null } }).ok, true, 'bewusst umgestellt: dann geht es')
})

test('an gesperrte und unbekannte Adressen geht nie etwas', () => {
  assert.equal(darfSenden({ automation: {}, kontakt: { gesperrt: true, zustimmungAm: '2025-01-01' } }).ok, false)
  assert.equal(darfSenden({ automation: {}, kontakt: null }).ok, false)
})

// ── Aufräumen und Stand ──

test('aufraeumen behält Laufendes und wirft alte Erledigte weg', () => {
  const liste = [
    { id: '1', zustand: 'laeuft', email: 'a@beispiel.de' },
    { id: '2', zustand: 'fertig', erledigtAm: JETZT - 31 * 24 * STUNDE },
    { id: '3', zustand: 'fertig', erledigtAm: JETZT - STUNDE }
  ]
  const geraeumt = aufraeumen(liste, JETZT)
  assert.deepEqual(geraeumt.map((l) => l.id), ['1', '3'])
})

test('stand zählt gesamt und je Automation', () => {
  let liste = starten([]).liste
  liste = laufStarten(liste, { automationId: 'a2', email: 'bo@beispiel.de', ausloeserId: 'q', schritte: SCHRITTE, jetzt: JETZT }).liste
  liste = abbrechen(liste, { email: 'bo@beispiel.de', jetzt: JETZT }).liste

  assert.equal(stand(liste).gesamt, 2)
  assert.equal(stand(liste).laufen, 1)
  assert.equal(stand(liste).abgebrochen, 1)
  assert.equal(stand(liste, 'a1').laufen, 1)
  assert.equal(stand(liste, 'a2').laufen, 0)
})

test('kaputte Listen führen nicht zum Absturz', () => {
  assert.equal(stand(null).gesamt, 0)
  assert.deepEqual(faellige(undefined, JETZT), [])
  assert.equal(verfalleneMarkieren('kein Array', JETZT).anzahl, 0)
  assert.equal(aufraeumen([null, 42, 'x'], JETZT).length, 0)
})
