// Kopfzeile der Mitte und Seitenleisten (einklappen, Fenster andocken).
// Genutzt von app.js: kopfzeileEinrichten(), leistenEinrichten() → { leistenAnwenden, leisteUmschalten }.

import { titelfarbeSetzen } from '../rahmen/design.js'

const $ = (id) => document.getElementById(id)

// Kopfzeile der Mitte: nur so weit kürzen, wie es der Platz verlangt
// Stufen: k1 kurzes Datum, k2 kurze Namen („Hermes“), k3 nur Punkte (Tooltip), k4 Datum weg (Uhrzeit bleibt)
export function kopfzeileEinrichten() {
  const kopf = document.querySelector('.mitte-kopf')
  function kopfPasst() {
    const r = kopf.getBoundingClientRect()
    const rechts = r.right - parseFloat(getComputedStyle(kopf).paddingRight)
    const kinder = [...kopf.children].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none')
    return kinder.every((e) => e.getBoundingClientRect().right <= rechts + 0.5)
  }
  let kopfGeplant = false
  function kopfAnpassen() {
    if (kopfGeplant) return
    kopfGeplant = true
    requestAnimationFrame(() => {
      kopfGeplant = false
      for (let stufe = 0; stufe <= 4; stufe++) {
        for (let k = 1; k <= 4; k++) kopf.classList.toggle(`k${k}`, k <= stufe)
        if (kopfPasst()) break
      }
    })
  }
  new ResizeObserver(kopfAnpassen).observe(kopf)
  new MutationObserver(kopfAnpassen).observe(kopf, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] })
}

// Seitenleisten einklappen: links bleibt eine schmale Leiste mit Symbolen, rechts verschwindet ganz
// api: window.vendo
// einstellungen: () => aktuelle Einstellungen (wird um leisten ergänzt)
export function leistenEinrichten({ api, einstellungen }) {
  function leistenAnwenden() {
    const l = einstellungen()?.leisten || { links: true, rechts: true }
    document.body.classList.toggle('links-zu', l.links === false)
    document.body.classList.toggle('rechts-zu', l.rechts === false)
    $('links-umschalten').title = l.links === false ? 'Leiste aufklappen (Strg+B)' : 'Leiste einklappen (Strg+B)'
    $('rechts-umschalten').title = l.rechts === false ? 'Rechte Spalte aufklappen (Strg+J)' : 'Rechte Spalte einklappen (Strg+J)'
    titelfarbeSetzen()
  }
  function leisteUmschalten(seite) {
    // Erst sofort übernehmen, dann speichern: zweimal schnell hintereinander darf sich nicht überschreiben
    const e = einstellungen()
    const l = { links: true, rechts: true, ...(e?.leisten || {}) }
    l[seite] = l[seite] === false
    e.leisten = l
    leistenAnwenden()
    api.einstellungen.speichern({ leisten: l })
  }
  $('links-umschalten').addEventListener('click', () => leisteUmschalten('links'))
  $('rechts-umschalten').addEventListener('click', () => leisteUmschalten('rechts'))
  // Strg+Alt+← / → : exakt an die linke/rechte Bildschirmhälfte, Strg+Alt+↑ : ganzer Bildschirm
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey || e.shiftKey) return
    const seite = { ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'voll' }[e.key]
    if (!seite) return
    e.preventDefault()
    api.fenster.andocken(seite)
  })
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey) return
    const taste = e.key.toLowerCase()
    if (taste === 'b' || taste === 'j') {
      e.preventDefault()
      leisteUmschalten(taste === 'b' ? 'links' : 'rechts')
    }
  })
  return { leistenAnwenden, leisteUmschalten }
}
