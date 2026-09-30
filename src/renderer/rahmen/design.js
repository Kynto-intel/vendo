// Aussehen der App: Designs, Farben nach Tageszeit und die Farbe der Windows-Knöpfe oben rechts.
//
// Farbdesigns kommen aus dem Ordner designs/ (eine Datei pro Design, src/main/designs.js). designsLaden macht daraus
// Regeln :root[data-design='<id>'] (Grundfarben --d-* und Akzent) und die Knöpfe in Einstellungen → Aussehen.
// designAnwenden setzt data-design / data-hintergrund / data-ecken an <html> und gibt Akzent und Zoom an den
// Hauptprozess (Windows-Knöpfe, Schriftgröße). In den Einstellungen sofort sichtbar, gespeichert mit „Speichern“.
// Angebunden in app.js mit designEinrichten({ einstellungen: () => einstellungen }).

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let h = { einstellungen: () => null }

const DESIGN_STANDARD = { farbe: 'gold', hintergrund: 'normal', ecken: 'kantig', schrift: 'normal' }
const SCHRIFT_ZOOM = { klein: 0.9, normal: 1, gross: 1.1, sehrgross: 1.2 }
// Farbe in der Design-Datei → CSS-Variable (Akzent und Akzent hell kommen als Zahlen dazu, siehe designsLaden)
const DESIGN_VARIABLEN = {
  hintergrund: '--d-hintergrund', leiste: '--d-leiste', flaeche: '--d-flaeche', flaecheHoch: '--d-flaeche-hoch', tief: '--d-tief',
  eingabe: '--d-eingabe', rahmen: '--d-rahmen', linie: '--d-linie', text: '--d-text', textLeise: '--d-text-leise', gedimmt: '--gedimmt',
  akzentDunkel: '--gold-dunkel', akzentFlaeche: '--gold-flaeche', aufAkzent: '--auf-gold'
}
let designEntwurf = { ...DESIGN_STANDARD } // was in den Einstellungen gerade gewählt ist (noch nicht gespeichert)
let designListe = []
let designsFertig = false

export function designEinrichten(helfer) {
  h = { ...h, ...helfer }
}

// ── Windows-Knöpfe oben rechts ──
// Der Hauptprozess misst die Farbe unter den Knöpfen (Bild vom Streifen) und färbt sie passend ein (main.js:
// titelfarbeMessen, auch alle 1,5 s von selbst). Hier nur sofort nachmessen lassen, wenn sich etwas ändert, und noch
// einmal nach dem Übergang (Leiste 220 ms).
export function titelfarbeSetzen() {
  api.fenster.titelfarbe().catch(() => {})
  setTimeout(() => api.fenster.titelfarbe().catch(() => {}), 300)
}
addEventListener('resize', titelfarbeSetzen)

// ── Farben nach Tageszeit: morgens 6–10 heller, tagsüber normal, abends 18–22 wärmer, nachts dunkler ──
export function tageszeitAnwenden() {
  const test = new URLSearchParams(location.search).get('tageszeit') // nur Testmodus
  const stunde = new Date().getHours()
  const zeit = test || (stunde >= 6 && stunde < 10 ? 'morgen' : stunde >= 10 && stunde < 18 ? 'tag' : stunde >= 18 && stunde < 22 ? 'abend' : 'nacht')
  const aus = h.einstellungen()?.tageszeitFarben === false && !test
  if (aus) delete document.documentElement.dataset.tageszeit
  else document.documentElement.dataset.tageszeit = zeit
  titelfarbeSetzen()
}
setInterval(tageszeitAnwenden, 60000)

// ── Designs aus dem Ordner designs/ ──
const alsRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')
function designStilSetzen(css) {
  let stil = document.getElementById('design-stil')
  if (!stil) stil = document.head.appendChild(Object.assign(document.createElement('style'), { id: 'design-stil' }))
  stil.textContent = css
}
async function designsLaden() {
  designListe = await api.fenster.designs().catch(() => [])
  const css = designListe
    .map((d) => `:root[data-design='${d.id}'] { ${Object.entries(DESIGN_VARIABLEN).map(([feld, variable]) => `${variable}: ${d.farben[feld]};`).join(' ')} --akzent-rgb: ${alsRgb(d.farben.akzent)}; --akzent-hell-rgb: ${alsRgb(d.farben.akzentHell)}; }`)
    .join('\n')
  designStilSetzen(css)
  $('e-design').querySelector('[data-dw="farbe"]').innerHTML = designListe
    .map((d) => `<button type="button" data-wert="${maskieren(d.id)}" title="${maskieren(d.beschreibung)}" style="--v1:${d.farben.hintergrund};--v2:${d.farben.akzent}"><span class="dw-muster"></span>${maskieren(d.name)}</button>`)
    .join('')
  designsFertig = true
  designWahlZeigen()
  try {
    localStorage.setItem('jarves-design-css', css) // für den nächsten Start (siehe unten)
  } catch {
    // egal
  }
}
const designsBereit = designsLaden()

// Design anwenden: ohne Angabe das gespeicherte, sonst z. B. die Vorschau aus den Einstellungen
export function designAnwenden(d = h.einstellungen()?.design) {
  if (!designsFertig) return void designsBereit.then(() => designAnwenden(d)) // erst die Farben aus den Dateien
  const gespeichert = h.einstellungen()?.design
  const design = { ...DESIGN_STANDARD, ...(d || {}) }
  const html = document.documentElement
  const setzen = (schluessel, wert, standard) => {
    if (wert && wert !== standard) html.dataset[schluessel] = wert
    else delete html.dataset[schluessel]
  }
  setzen('design', design.farbe, null) // auch „gold“: so gilt eine geänderte gold.json
  setzen('hintergrund', design.hintergrund, 'normal')
  setzen('ecken', design.ecken, 'kantig')
  const zoom = SCHRIFT_ZOOM[design.schrift] || 1
  html.style.setProperty('--zoom', String(zoom))
  const rgb = (getComputedStyle(html).getPropertyValue('--gold').match(/\d+/g) || [201, 161, 74]).slice(0, 3).map(Number)
  const akzent = `#${rgb.map((z) => z.toString(16).padStart(2, '0')).join('')}`
  api.fenster.design({ akzent, zoom }).catch(() => {})
  document.dispatchEvent(new Event('design-geaendert')) // z. B. Terminal-Farben
  titelfarbeSetzen()
  if (d === gespeichert) {
    try {
      // für den nächsten Start und fürs Mini-Fenster (mini.js liest den Akzent hier)
      const css = getComputedStyle(html)
      localStorage.setItem('jarves-design', JSON.stringify({ ...design, akzentRgb: css.getPropertyValue('--akzent-rgb').trim(), akzentHellRgb: css.getPropertyValue('--akzent-hell-rgb').trim() }))
    } catch {
      // ohne Speicher: dann eben erst nach dem Laden der Einstellungen
    }
  }
}

// Beim Start sofort das zuletzt gespeicherte Design zeigen (Einstellungen und Design-Dateien kommen erst gleich)
try {
  const gemerkt = JSON.parse(localStorage.getItem('jarves-design') || 'null')
  const css = localStorage.getItem('jarves-design-css')
  if (gemerkt && css) {
    designStilSetzen(css)
    for (const [schluessel, feld, standard] of [['design', 'farbe', null], ['hintergrund', 'hintergrund', 'normal'], ['ecken', 'ecken', 'kantig']]) {
      if (gemerkt[feld] && gemerkt[feld] !== standard) document.documentElement.dataset[schluessel] = gemerkt[feld]
    }
  }
} catch {
  // egal
}

// ── Auswahl in Einstellungen → Aussehen ──
function designWahlZeigen() {
  for (const gruppe of document.querySelectorAll('#e-design [data-dw]')) {
    for (const knopf of gruppe.querySelectorAll('[data-wert]')) {
      const an = designEntwurf[gruppe.dataset.dw] === knopf.dataset.wert
      knopf.classList.toggle('an', an)
      knopf.setAttribute('aria-pressed', String(an))
    }
  }
}
$('e-design').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-wert]')
  const gruppe = knopf?.closest('[data-dw]')
  if (!gruppe) return
  designEntwurf = { ...designEntwurf, [gruppe.dataset.dw]: knopf.dataset.wert }
  designWahlZeigen()
  designAnwenden(designEntwurf) // Vorschau sofort
})

// Einstellungen öffnen: Auswahl und Ansicht zeigen dasselbe (gespeicherte) Design
export function designFormularFuellen() {
  designEntwurf = { ...DESIGN_STANDARD, ...(h.einstellungen()?.design || {}) }
  designWahlZeigen()
  designAnwenden()
}
export const designFormularLesen = () => ({ ...designEntwurf })
