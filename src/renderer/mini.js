// Mini-Modus: zeigt, was Luzzy gerade tut (vom großen Fenster geschickt). Klick: sprechen, Doppelklick: groß.

const ANZAHL = 20
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
  if (titel) pille.title = `${titel} · Klick: sprechen · Doppelklick: großes Fenster (Strg+Umschalt+M)`
  const denkt = ['denkt', 'versteht', 'antwortet'].includes(zustand)
  if (pegel === undefined && (zustand === 'spricht' || zustand === 'hoert')) return // Balken bleiben, bis der nächste Pegel kommt
  for (let i = 0; i < ANZAHL; i++) {
    // Pegel (24 Werte) auf die Balken verteilen; ohne Pegel: Punkte (3 px)
    const wert = pegel ? pegel[Math.floor((i * pegel.length) / ANZAHL)] || 0 : 0
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
