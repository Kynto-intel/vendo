// Mini-Modus: zeigt, was Luzzy gerade tut (vom großen Fenster geschickt). Klick: sprechen, Doppelklick: groß.

// Farben des Designs (Einstellungen → Aussehen): das große Fenster legt sie beim Anwenden in localStorage
// „jarves-design“ ab (akzentRgb, akzentHellRgb, grundRgb, textRgb). Ohne Eintrag bleibt Donnerwolf Gold aus mini.html.
const RGB = /^\d{1,3}, ?\d{1,3}, ?\d{1,3}$/
function akzentSetzen() {
  let d = null
  try {
    d = JSON.parse(localStorage.getItem('jarves-design') || 'null')
  } catch {
    // Standard
  }
  const setzen = (variable, wert) => RGB.test(String(wert)) && document.documentElement.style.setProperty(variable, wert)
  setzen('--akzent-rgb', d?.akzentRgb)
  setzen('--akzent-hell-rgb', d?.akzentHellRgb)
  setzen('--grund-rgb', d?.grundRgb) // Hintergrund der Pille (Seitenspalten-Farbe des Designs)
  setzen('--text-rgb', d?.textRgb) // Punkte beim Zuhören
}
akzentSetzen()
addEventListener('storage', (e) => e.key === 'jarves-design' && akzentSetzen())

const ANZAHL = 40
const pille = document.getElementById('pille')
const balken = []
for (let i = 0; i < ANZAHL; i++) {
  const b = document.createElement('div')
  b.className = 'balken'
  b.style.setProperty('--i', String(i))
  pille.insertBefore(b, document.getElementById('gross'))
  balken.push(b)
}

window.mini.beiZustand(({ zustand, pegel, titel } = {}) => {
  if (zustand && pille.dataset.zustand !== zustand) pille.dataset.zustand = zustand
  if (titel) pille.title = `${titel} · Klick: sprechen · Doppelklick: großes Fenster (AltGr+L)`
  const denkt = ['denkt', 'versteht', 'antwortet', 'schaut'].includes(zustand) // Höhe kommt dann aus mini.html
  if (pegel === undefined && (zustand === 'spricht' || zustand === 'hoert')) return // Balken bleiben, bis der nächste Pegel kommt
  for (let i = 0; i < ANZAHL; i++) {
    // Pegel (24 Werte, tief → hoch) auf die Balken verteilen. Die Stimme steckt vor allem in den tiefen Werten,
    // deshalb bekommen die mehr Balken (sonst bewegt sich nur der Anfang). Ohne Pegel: Punkte (3 px)
    const wert = pegel ? pegel[Math.min(pegel.length - 1, Math.floor((i / ANZAHL) ** 1.7 * pegel.length))] || 0 : 0
    balken[i].style.height = denkt ? '' : `${Math.round(3 + Math.min(1, wert) * 19)}px`
  }
})

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
