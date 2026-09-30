// Einstellungen von Jarves-OS, gespeichert in daten/einstellungen.json im Projektordner
// (so sind sie auch im Backup enthalten).

const fs = require('node:fs')
const path = require('node:path')
const { stimmeGueltig } = require('./pocket')

const DATEI = path.join(__dirname, '..', '..', 'daten', 'einstellungen.json')

const STANDARD = {
  stimme: 'alba', // Pocket TTS, lokal
  tempo: '+0%',
  lautstaerke: 250, // Prozent: Pocket TTS ist von sich aus leise
  vorlesen: true,
  animationen: { reaktor: true, scanlinie: true, welle: true, hintergrund: true },
  start: { intro: true, begruessung: true, gateway: true }, // gateway: Hermes-Gateway beim Öffnen mitstarten
  tageszeitFarben: true,
  leisten: { links: true, rechts: true }, // true = aufgeklappt
  panel: { offen: false, breite: 460 },
  sprache: { freihaendig: true, crewStill: true, aktivierungswort: true, automatischSenden: true, weiterZuhoeren: true, unterbrechen: true, musikErkennen: true },
  meldungen: { vorlesen: true, ton: true, bestellung: true, mail: true, job: true, crew: true, ruheVon: '22:00', ruheBis: '07:00' }
}

function laden() {
  try {
    const gespeichert = JSON.parse(fs.readFileSync(DATEI, 'utf8'))
    return {
      ...STANDARD,
      ...gespeichert,
      stimme: stimmeGueltig(gespeichert.stimme), // alte Edge-Stimmen und „Jürgen“ werden zu Alba
      animationen: { ...STANDARD.animationen, ...(gespeichert.animationen || {}) },
      start: { ...STANDARD.start, ...(gespeichert.start || {}) },
      panel: { ...STANDARD.panel, ...(gespeichert.panel || {}) },
      leisten: { ...STANDARD.leisten, ...(gespeichert.leisten || {}) },
      sprache: { ...STANDARD.sprache, ...(gespeichert.sprache || {}) },
      meldungen: { ...STANDARD.meldungen, ...(gespeichert.meldungen || {}) }
    }
  } catch {
    return structuredClone(STANDARD)
  }
}

function speichern(neu) {
  const aktuell = { ...laden(), ...neu }
  fs.mkdirSync(path.dirname(DATEI), { recursive: true })
  fs.writeFileSync(DATEI, JSON.stringify(aktuell, null, 2), 'utf8')
  return aktuell
}

module.exports = { laden, speichern }
