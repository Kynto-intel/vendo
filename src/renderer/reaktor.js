// Luzzys "Gesicht": Reaktor mit drehenden Ringen und pulsierendem Kern.
// Zustände: bereit | denkt | antwortet | spricht | getrennt

const NS = 'http://www.w3.org/2000/svg'
const GOLD = '#C29A40'
const GOLD_HELL = '#D9B25F'

function element(name, attribute = {}, eltern) {
  const el = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attribute)) el.setAttribute(k, v)
  if (eltern) eltern.appendChild(el)
  return el
}

export function reaktorErstellen(behaelter) {
  const svg = element('svg', { class: 'reaktor', viewBox: '0 0 200 200', 'data-zustand': 'getrennt', 'aria-hidden': 'true' })
  const defs = element('defs', {}, svg)
  const verlauf = element('radialGradient', { id: 'kern-verlauf' }, defs)
  element('stop', { offset: '0%', 'stop-color': '#fff6dc' }, verlauf)
  element('stop', { offset: '35%', 'stop-color': GOLD_HELL }, verlauf)
  element('stop', { offset: '70%', 'stop-color': GOLD, 'stop-opacity': '0.55' }, verlauf)
  element('stop', { offset: '100%', 'stop-color': GOLD, 'stop-opacity': '0' }, verlauf)

  const ring = (klasse, r, farbe, deckkraft, breite, striche) =>
    element('circle', {
      class: `r ${klasse}`, cx: 100, cy: 100, r, fill: 'none', stroke: farbe,
      'stroke-opacity': deckkraft, 'stroke-width': breite, 'stroke-dasharray': striche
    }, svg)

  ring('r1', 94, GOLD, 0.35, 1, '2 5')
  ring('r2', 84, GOLD, 0.8, 2.5, '46 12 8 12')
  ring('r3', 74, GOLD_HELL, 0.5, 5, '1.2 6.55')
  ring('r4', 62, GOLD, 0.9, 1.5, '70 18 20 18')
  ring('r5', 50, GOLD_HELL, 0.55, 1, '4 3')
  element('circle', { cx: 100, cy: 100, r: 40, fill: 'none', stroke: GOLD, 'stroke-opacity': 0.25, 'stroke-width': 1 }, svg)
  element('circle', { class: 'r kern', cx: 100, cy: 100, r: 36, fill: 'url(#kern-verlauf)' }, svg)
  element('circle', { cx: 100, cy: 100, r: 11, fill: '#fff6dc', 'fill-opacity': 0.9 }, svg)

  behaelter.replaceChildren(svg)
  return {
    zustand(z) {
      svg.setAttribute('data-zustand', z)
    }
  }
}

export function welleErstellen(behaelter, anzahl = 24) {
  const balken = Array.from({ length: anzahl }, (_, i) => {
    const b = document.createElement('span')
    b.style.animationDelay = `${((i * 137) % 900) / 1000}s`
    behaelter.appendChild(b)
    return b
  })
  return {
    // pegel 0..1 aus der Sprachausgabe; null = Balken ruhen
    pegel(werte) {
      balken.forEach((b, i) => {
        b.style.transform = werte ? `scaleY(${Math.max(0.15, werte[i % werte.length])})` : ''
      })
    }
  }
}
