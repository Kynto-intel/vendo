// Navigation: Bereiche links (nach Gruppen, mit Symbol), Bereich wechseln, offene Bereiche regelmäßig neu laden,
// „Aktualisieren“-Knöpfe und Links, die einen Bereich öffnen (data-bereich-oeffnen). Plugins melden ihre Bereiche
// beim Start mit pluginBereicheHinzufuegen an.
// Angebunden in app.js mit navigationEinrichten({ einstellungen, verbunden, hoerModusAnwenden, chatNeuLaden }).

import { crewLaden, jobsLaden, systemLaden } from '../ansichten.js'
import { terminalLaden } from '../terminal.js'
import { bibliothekLaden, entscheidungenLaden } from '../wissen.js'
import { crewBotsLaden, wechseln as crewWechseln, crewSichtbarGeworden } from '../crewchat.js'
import { pluginSymbolPfad } from './plugin-symbole.js'

const api = window.vendo
const $ = (id) => document.getElementById(id)

let h = { einstellungen: () => null, verbunden: () => false, hoerModusAnwenden: () => {}, chatNeuLaden: async () => {} }

export function navigationEinrichten(helfer) {
  h = { ...h, ...helfer }
}

// Feste Bereiche; Plugins kommen beim Start vor „System“ dazu (pluginBereicheHinzufuegen)
export const BEREICHE = [
  { id: 'zentrale', name: 'Zentrale', aktiv: true },
  { id: 'crew', name: 'Crew', aktiv: true },
  { id: 'jobs', name: 'Cron-Jobs', aktiv: true },
  { id: 'bibliothek', name: 'Bibliothek', aktiv: true },
  { id: 'entscheidungen', name: 'Entscheidungen', aktiv: true },
  { id: 'system', name: 'System', aktiv: true },
  { id: 'terminal', name: 'Terminal', aktiv: true }
]


// ── Bereiche links: nach Gruppen, mit Symbol (Linien-Grafiken, 24er Raster) ──
const SYMBOLE = {
  zentrale: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  crew: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 13.6c2.6.2 4.5 2.1 4.5 4.9"/>',
  jobs: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  bibliothek: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13"/><path d="M9 7h6"/>',
  entscheidungen: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/><path d="M8 21h8"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>',
  system: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
}
const SYMBOL_PLUGIN = '<path d="M9 3h6v4a2 2 0 1 0 4 0h2v6h-3a2 2 0 1 0 0 4h3v4H3V9h4a2 2 0 1 0 0-4H3V3z"/>'
const GRUPPEN = [
  ['Luzzy', ['zentrale', 'crew']],
  ['', ['plugin-aufgaben', 'plugin-kalender']],
  ['Werkzeuge', ['jobs', 'plugin-routinen', 'plugin-fokus', 'plugin-gedanken', 'plugin-wetter', 'plugin-meilensteine']],
  ['Wissen', ['bibliothek', 'entscheidungen']],
  ['System', ['system', 'terminal']]
]
const symbol = (bereich) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOLE[bereich.id] || pluginSymbolPfad(bereich.symbol) || SYMBOL_PLUGIN}</svg>`
export function bereicheZeigen() {
  const knopf = (b) =>
    `<button class="bereich${b.id === aktuelleAnsicht ? ' gewaehlt' : ''}" data-bereich="${b.id}" type="button" title="${b.name}" ${b.aktiv ? '' : 'disabled'}>${symbol(b)}<span>${b.name}</span></button>`
  const vergeben = new Set(GRUPPEN.flatMap(([, ids]) => ids))
  const gruppen = GRUPPEN.map(([name, ids]) => {
    let liste = ids.map((id) => BEREICHE.find((b) => b.id === id)).filter(Boolean)
    // Neue Plugins ohne feste Gruppe landen bei den Werkzeugen
    if (name === 'Werkzeuge') liste = liste.concat(BEREICHE.filter((b) => !vergeben.has(b.id)))
    return liste.length ? `${name ? `<div class="bereich-gruppe">${name}</div>` : ''}${liste.map(knopf).join('')}` : ''
  })
  $('bereiche').innerHTML = gruppen.join('')
}

// ── Bereiche wechseln; offene Bereiche aktualisieren sich regelmäßig ──
const LADEN = {
  crew: crewLaden, jobs: jobsLaden, system: systemLaden, terminal: terminalLaden,
  bibliothek: bibliothekLaden, entscheidungen: entscheidungenLaden
}
const TAKT = { terminal: 600000, crew: 15000, jobs: 20000, system: 5000, bibliothek: 30000, entscheidungen: 30000 }
let aktuelleAnsicht = 'zentrale'
let crewOffen = false // Crew-Bereich offen: Luzzy hört dort nicht mit (siehe ansichtZeigen)
let taktUhr = 0
let crewGeoeffnet = false

export function ansichtZeigen(id) {
  aktuelleAnsicht = id
  // Crew-Bereich: Luzzy hört nicht mit (Felix schreibt dort mit den Bots), beim Verlassen wieder wie eingestellt
  if (crewOffen !== (id === 'crew')) {
    crewOffen = id === 'crew'
    if (crewOffen) setTimeout(crewSichtbarGeworden, 0) // Arbeitsbühne & Live-Karten mitlesen, solange Crew offen ist
    h.hoerModusAnwenden()
  }
  // Zuletzt offenen Bereich merken (nicht im Testmodus), damit er beim nächsten Start wieder aufgeht
  const einstellungen = h.einstellungen()
  if (einstellungen && einstellungen.letzteAnsicht !== id && !new URLSearchParams(location.search).has('stumm')) {
    einstellungen.letzteAnsicht = id
    api.einstellungen.speichern({ letzteAnsicht: id })
  }
  document.body.dataset.ansicht = id // Zentrale: Gespräch rechts ohne eigene Eingabe (siehe style.css)
  for (const el of document.querySelectorAll('.ansicht')) el.hidden = el.dataset.ansicht !== id
  bereicheZeigen()
  clearInterval(taktUhr)
  if (LADEN[id]) {
    LADEN[id]()
    taktUhr = setInterval(() => h.verbunden() && LADEN[id](), TAKT[id])
  }
  if (id === 'crew' && !crewGeoeffnet && h.verbunden()) {
    crewGeoeffnet = true
    crewBotsLaden().then(() => crewWechseln()).then(() => {
      // nur Testmodus: ?crewtest=<Nachricht> schickt sie einmal in den Crew-Chat
      const test = new URLSearchParams(location.search).get('crewtest')
      if (!test) return
      $('crew-form').querySelector('textarea').value = test
      $('crew-form').requestSubmit()
    }).catch((e) => {
      crewGeoeffnet = false
      console.warn('Crew:', e.message)
    })
  }
  if (id === 'zentrale') document.querySelector('.befehl .eingabe-text')?.focus()
}

$('bereiche').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-bereich]')
  if (knopf && !knopf.disabled) ansichtZeigen(knopf.dataset.bereich)
})
// „Aktualisieren“-Knöpfe: sichtbar zeigen, dass neu geladen wird (sonst sieht man bei gleichen Daten nichts)
async function neuLadenMitRueckmeldung(knopf) {
  const bereich = knopf.dataset.neuLaden
  const text = knopf.textContent
  knopf.disabled = true
  knopf.textContent = 'Lädt …'
  let ok = true
  try {
    await Promise.all([LADEN[bereich]?.(), bereich === 'crew' ? crewBotsLaden() : null]) // Crew: auch neue/umbenannte Bots
    if (bereich === 'crew') await h.chatNeuLaden() // app.js: offenen Chat neu aus Hermes holen (nicht während einer Antwort)
  } catch {
    ok = false
  }
  knopf.textContent = ok ? '✓ Aktualisiert' : 'Hat nicht geklappt'
  setTimeout(() => {
    knopf.textContent = text
    knopf.disabled = false
  }, 1500)
}
document.addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-neu-laden]')
  if (knopf && !knopf.disabled) neuLadenMitRueckmeldung(knopf)
  const oeffnen = e.target.closest('[data-bereich-oeffnen]')
  if (oeffnen) ansichtZeigen(oeffnen.dataset.bereichOeffnen)
})

// Welcher Bereich gerade offen ist ('zentrale', 'crew', 'plugin-wetter' …)
export const offeneAnsicht = () => aktuelleAnsicht
// Hat der Bereich eine Lade-Funktion (also Inhalt, der nachgeladen wird)?
export const bereichLaedt = (id) => Boolean(LADEN[id])

// Bereiche der Plugins vor „System“ einfügen, mit Lade-Funktion und Takt
export function pluginBereicheHinzufuegen(pluginBereiche) {
  const vorSystem = BEREICHE.findIndex((b) => b.id === 'system')
  BEREICHE.splice(vorSystem, 0, ...pluginBereiche.map((b) => ({ id: b.id, name: b.name, symbol: b.symbol, aktiv: true })))
  for (const b of pluginBereiche) {
    if (b.laden) LADEN[b.id] = b.laden
    TAKT[b.id] = b.takt || 60000
  }
  bereicheZeigen()
}
