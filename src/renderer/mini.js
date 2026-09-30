// Mini-Modus: kleine Leiste oben mittig mit Fenni, dem kleinen Wolf (fenni/). Er zeigt, was Luzzy gerade tut
// (vom großen Fenster geschickt). Klick: sprechen, Doppelklick: großes Fenster, Rechtsklick: Fenni anstupsen.

import { fenniErstellen } from './fenni/fenni.js'
import { sterneErstellen } from './fenni/sterne.js'

// Farben des Designs (Einstellungen → Aussehen): das große Fenster legt sie beim Anwenden in localStorage
// „jarves-design“ ab (akzentRgb, akzentHellRgb, grundRgb, textRgb). Ohne Eintrag bleibt Donnerwolf Gold aus mini.html.
const RGB = /^\d{1,3}, ?\d{1,3}, ?\d{1,3}$/
function farbenSetzen() {
  let d = null
  try {
    d = JSON.parse(localStorage.getItem('jarves-design') || 'null')
  } catch {
    // Standard
  }
  const setzen = (variable, wert) => RGB.test(String(wert)) && document.documentElement.style.setProperty(variable, wert)
  setzen('--akzent-rgb', d?.akzentRgb) // Rand der Pille, Fennis Fell und Ohren
  setzen('--akzent-hell-rgb', d?.akzentHellRgb)
  setzen('--grund-rgb', d?.grundRgb) // Hintergrund der Pille (Seitenspalten-Farbe des Designs)
  setzen('--text-rgb', d?.textRgb)
}
farbenSetzen()

const pille = document.getElementById('pille')
const sterne = sterneErstellen(document.getElementById('sterne')) // Lichtpunkte und Schein hinter Fenni
const fenni = fenniErstellen(document.getElementById('fenni'))
addEventListener('storage', (e) => {
  if (e.key !== 'jarves-design') return
  farbenSetzen()
  fenni.farbenNeu()
  sterne.farbenNeu()
})

// Luzzys Zustand → Fenni. versteht (schreibt Gesprochenes mit) und antwortet (schreibt) = nachdenken
const FENNI = { bereit: 'bereit', hoert: 'hoert', versteht: 'denkt', denkt: 'denkt', antwortet: 'denkt', spricht: 'spricht', getrennt: 'schlaeft', schaut: 'schaut' }
let vorher = 'bereit'
window.mini.beiZustand(({ zustand, pegel, titel } = {}) => {
  if (titel) pille.title = `${titel} · Klick: sprechen · Doppelklick: großes Fenster · Rechtsklick: Fenni anstupsen`
  if (pegel !== undefined) {
    fenni.pegel(pegel)
    sterne.staerke(fenni.stimme())
  }
  if (!zustand || zustand === vorher) return
  // Luzzy ist mit einer Antwort fertig: Fenni freut sich
  if (zustand === 'bereit' && ['antwortet', 'spricht'].includes(vorher)) fenni.freuen()
  if (!['spricht', 'hoert'].includes(zustand)) {
    fenni.pegel(null)
    sterne.staerke(0)
  }
  vorher = zustand
  pille.dataset.zustand = zustand
  fenni.zustand(FENNI[zustand] || 'bereit')
  sterne.zustand(FENNI[zustand] || 'bereit')
})
// Augen folgen der Maus (das Hauptprogramm meldet ihre Position, solange der Mini-Modus an ist)
window.mini.beiBlick?.(({ x, y } = {}) => fenni.blick(Number(x) || 0, Number(y) || 0))

// Einfacher Klick startet das Sprechen, aber erst, wenn kein Doppelklick folgt
let klickUhr = 0
pille.addEventListener('click', (e) => {
  if (e.target.id === 'gross') return window.mini.gross()
  clearTimeout(klickUhr)
  if (e.detail > 1) return
  klickUhr = setTimeout(() => window.mini.sprechen(), 230)
})
pille.addEventListener('dblclick', () => {
  clearTimeout(klickUhr)
  window.mini.gross()
})
// Rechtsklick: anstupsen (dreimal schnell: schwindelig)
pille.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  fenni.anstupsen()
})
