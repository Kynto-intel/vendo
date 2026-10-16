// Einstellungen von Jarves-OS, gespeichert in daten/einstellungen.json im Projektordner
// (so sind sie auch im Backup enthalten).

const fs = require('node:fs')
const path = require('node:path')
const { stimmeGueltig } = require('./pocket')

const DATEI = path.join(__dirname, '..', '..', 'daten', 'einstellungen.json')

const STANDARD = {
  stimmeAnbieter: 'pocket',
  stimme: 'alba', // Pocket TTS, lokal
  geminiStimme: 'Kore',
  elevenlabsStimme: '',
  tempo: '+0%',
  lautstaerke: 250, // Prozent: Pocket TTS ist von sich aus leise
  vorlesen: true,
  animationen: { reaktor: true, scanlinie: true, welle: true, hintergrund: true },
  // Aussehen: farbe gold|nordlicht|blutmond|runenwald|eisen · hintergrund normal|tief|hell · ecken kantig|weich ·
  // schrift klein|normal|gross|sehrgross (Zoom der ganzen App)
  design: { farbe: 'gold', hintergrund: 'normal', ecken: 'kantig', schrift: 'normal' },
  start: { intro: true, begruessung: true, gateway: true }, // gateway: Hermes-Gateway beim Öffnen mitstarten
  tageszeitFarben: true,
  leisten: { links: true, rechts: true }, // true = aufgeklappt
  panel: { offen: false, breite: 460 },
  sprache: { freihaendig: true, crewStill: true, aktivierungswort: true, automatischSenden: true, weiterZuhoeren: true, unterbrechen: true, musikErkennen: true },
  meldungen: { vorlesen: true, ton: true, bestellung: true, mail: true, job: true, crew: true, ruheVon: '22:00', ruheBis: '07:00' },
  bibliothek: { ordner: [] } // Ordner, die im Bereich Bibliothek gezeigt werden (wählt Felix dort selbst)
}

function laden() {
  try {
    const gespeichert = JSON.parse(fs.readFileSync(DATEI, 'utf8'))
    return {
      ...STANDARD,
      ...gespeichert,
      stimmeAnbieter: ['pocket', 'gemini', 'elevenlabs'].includes(gespeichert.stimmeAnbieter) ? gespeichert.stimmeAnbieter : STANDARD.stimmeAnbieter,
      stimme: stimmeGueltig(gespeichert.stimme), // alte Edge-Stimmen und „Jürgen“ werden zu Alba
      geminiStimme: typeof gespeichert.geminiStimme === 'string' ? gespeichert.geminiStimme : STANDARD.geminiStimme,
      elevenlabsStimme: typeof gespeichert.elevenlabsStimme === 'string' ? gespeichert.elevenlabsStimme : STANDARD.elevenlabsStimme,
      animationen: { ...STANDARD.animationen, ...(gespeichert.animationen || {}) },
      design: { ...STANDARD.design, ...(gespeichert.design || {}) },
      start: { ...STANDARD.start, ...(gespeichert.start || {}) },
      panel: { ...STANDARD.panel, ...(gespeichert.panel || {}) },
      leisten: { ...STANDARD.leisten, ...(gespeichert.leisten || {}) },
      sprache: { ...STANDARD.sprache, ...(gespeichert.sprache || {}) },
      meldungen: { ...STANDARD.meldungen, ...(gespeichert.meldungen || {}) },
      bibliothek: { ...STANDARD.bibliothek, ...(gespeichert.bibliothek || {}) }
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
