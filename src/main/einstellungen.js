// Einstellungen von Vendo, gespeichert in PostgreSQL (vendo.einstellungen, Schlüssel „einstellungen“) mit Startkopie,
// siehe vendospeicher.js.

const { stimmeGueltig } = require('./pocket')
const vendospeicher = require('./vendospeicher')

const STANDARD = {
  stimmeAnbieter: 'pocket',
  stimme: 'alba', // Pocket TTS, lokal
  geminiStimme: 'Kore',
  elevenlabsStimme: '',
  tempo: '+0%',
  lautstaerke: 250, // Prozent: Pocket TTS ist von sich aus leise
  vorlesen: true,
  aussprache: [],
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

function ausspracheBereinigen(eintraege) {
  if (!Array.isArray(eintraege)) return []
  return eintraege
    .filter((eintrag) => eintrag && typeof eintrag.begriff === 'string' && typeof eintrag.aussprache === 'string')
    .map(({ begriff, aussprache }) => ({
      begriff: begriff.trim().replace(/\s+/g, ' '),
      aussprache: aussprache.trim().replace(/\s+/g, ' ')
    }))
    .filter(({ begriff, aussprache }) => begriff && aussprache)
}

function laden() {
  try {
    const gespeichert = vendospeicher.lesen('einstellungen')
    if (!gespeichert || typeof gespeichert !== 'object') throw new Error('noch keine Einstellungen')
    return {
      ...STANDARD,
      ...gespeichert,
      stimmeAnbieter: ['pocket', 'gemini', 'elevenlabs'].includes(gespeichert.stimmeAnbieter) ? gespeichert.stimmeAnbieter : STANDARD.stimmeAnbieter,
      stimme: stimmeGueltig(gespeichert.stimme), // alte Edge-Stimmen und „Jürgen“ werden zu Alba
      geminiStimme: typeof gespeichert.geminiStimme === 'string' ? gespeichert.geminiStimme : STANDARD.geminiStimme,
      elevenlabsStimme: typeof gespeichert.elevenlabsStimme === 'string' ? gespeichert.elevenlabsStimme : STANDARD.elevenlabsStimme,
      aussprache: ausspracheBereinigen(gespeichert.aussprache),
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
  aktuell.aussprache = ausspracheBereinigen(aktuell.aussprache)
  vendospeicher.schreiben('einstellungen', aktuell)
  return aktuell
}

module.exports = { laden, speichern }
