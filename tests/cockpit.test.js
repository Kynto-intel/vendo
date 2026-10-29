import assert from 'node:assert/strict'
import test from 'node:test'
import { auftraegeAus, laufendeAuftraege, sitzungsCacheBereinigen, tagesdatenLaden, tagesplanErstellen } from '../src/renderer/cockpit-daten.js'

test('Hermes-Verläufe unterscheiden laufende, erfolgreiche und gescheiterte Aufträge', () => {
  const jetzt = Date.parse('2026-10-29T12:00:00Z')
  const auftraege = auftraegeAus([
    { role: 'user', content: 'Erledigten Auftrag', timestamp: '2026-10-29T11:00:00Z' },
    { role: 'assistant', content: 'Fertig', finish_reason: 'stop', timestamp: '2026-10-29T11:01:00Z' },
    { role: 'user', content: 'Fehlgeschlagener Auftrag', timestamp: '2026-10-29T11:20:00Z' },
    { role: 'user', content: 'Naechster Auftrag', timestamp: '2026-10-29T11:30:00Z' },
    { role: 'assistant', content: 'Teilantwort', finish_reason: 'length', timestamp: '2026-10-29T11:31:00Z' },
    { role: 'user', content: 'Laufender Auftrag', timestamp: '2026-10-29T11:59:00Z' },
    { role: 'user', content: '[background process] Hinweis', timestamp: '2026-10-29T11:59:30Z' },
    { role: 'user', content: 'Versteckte Nachricht', display_kind: 'hidden', timestamp: '2026-10-29T11:59:45Z' }
  ], jetzt)

  assert.deepEqual(auftraege.map(({ text, ergebnis }) => [text, ergebnis]), [
    ['Erledigten Auftrag', 'ok'],
    ['Fehlgeschlagener Auftrag', 'fehler'],
    ['Naechster Auftrag', 'fehler'],
    ['Laufender Auftrag', 'laeuft']
  ])
})

test('Tagesplan zeigt überfällige und kommende Aufgaben sowie Termine, aber keine erledigten oder vergangenen', () => {
  const jetzt = new Date(2026, 9, 29, 12, 0)
  const eintraege = tagesplanErstellen([
    { id: 'alt', titel: 'Vergangener Termin', datum: '2026-10-29', zeit: '09:00' },
    { id: 'heute', titel: 'Termin heute', datum: '2026-10-29', zeit: '14:00' },
    { id: 'morgen', titel: 'Termin morgen', datum: '2026-10-30', zeit: '' },
    { id: 'ungueltig', titel: 'Ungültiges Datum', datum: '2026-02-31' }
  ], [
    { id: 'ueberfaellig', text: 'Überfällige Aufgabe', datum: '2026-10-28' },
    { id: 'heute', text: 'Aufgabe heute', datum: '2026-10-29', zeit: '16:00' },
    { id: 'fertig', text: 'Erledigt', datum: '2026-10-29', erledigt: true },
    { id: 'spaeter', text: 'Zu weit weg', datum: '2026-11-10' }
  ], jetzt)

  assert.deepEqual(eintraege.map(({ art, id }) => [art, id]), [
    ['aufgabe', 'ueberfaellig'],
    ['termin', 'heute'],
    ['aufgabe', 'heute'],
    ['termin', 'morgen']
  ])
  assert.equal(eintraege[0].ueberfaellig, true)
  assert.equal(eintraege[1].ueberfaellig, undefined)

  const rueckstand = Array.from({ length: 5 }, (_, i) => ({ id: `alt-${i}`, text: `Aufgabe ${i}`, datum: `2026-10-${String(24 + i).padStart(2, '0')}` }))
  const kommende = Array.from({ length: 6 }, (_, i) => {
    const datum = new Date(jetzt)
    datum.setDate(datum.getDate() + i + 1)
    return { id: `termin-${i}`, titel: `Termin ${i}`, datum: `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`, zeit: '12:00' }
  })
  const begrenzt = tagesplanErstellen(kommende, rueckstand, jetzt)
  assert.equal(begrenzt.length, 8)
  assert.equal(begrenzt.filter((eintrag) => eintrag.ueberfaellig).length, 3)
})

test('Cockpit zeigt nur wenige laufende Aufträge und keinen abgeschlossenen Verlauf', () => {
  const agenten = [{ profil: 'bot-a', name: 'Bot A', rolle: 'Recherche', auftraege: [
    { start: 10, ende: 0, ergebnis: 'laeuft', text: 'Aktiv' },
    { start: 8, ende: 9, ergebnis: 'ok', text: 'Abgeschlossen' },
    { start: 20, ende: 21, ergebnis: 'fehler', text: 'Fehlgeschlagen' }
  ] }]
  const laufend = laufendeAuftraege(agenten)

  assert.deepEqual(laufend.map(({ text, profil }) => [text, profil]), [['Aktiv', 'bot-a']])

  const viele = Array.from({ length: 7 }, (_, i) => ({ start: i, ergebnis: 'laeuft', text: `Aktiv ${i}` }))
  assert.deepEqual(laufendeAuftraege([{ profil: 'bot-a', name: 'Bot A', auftraege: viele }]).map(({ text }) => text), ['Aktiv 0', 'Aktiv 1', 'Aktiv 2', 'Aktiv 3', 'Aktiv 4'])
})

test('Tagesdaten fragen nur gestartete Plugins ab', async () => {
  const aufrufe = []
  const plan = await tagesdatenLaden(['plugin-kalender'], async (id) => {
    aufrufe.push(id)
    if (id === 'kalender') return { termine: [{ id: 't1', titel: 'Morgen', datum: '2026-10-30', zeit: '10:00' }] }
    throw new Error(`Plugin ${id} nicht geladen`)
  }, new Date(2026, 9, 29, 12))

  assert.deepEqual(aufrufe, ['kalender'])
  assert.deepEqual(plan.map(({ art, id }) => [art, id]), [['termin', 't1']])
})

test('Entfernte Sitzungen werden aus dem Cockpit-Cache gelöscht', () => {
  const cache = new Map([['session-live', { nachrichten: [] }], ['session-deleted', { nachrichten: ['alt'] }]])
  sitzungsCacheBereinigen(cache, ['session-live'])

  assert.deepEqual([...cache.keys()], ['session-live'])
})