import { maskieren } from './helfen.js'

export function aktivitaetEinrichten(element) {
  const aktivitaeten = []

  function anzeigen() {
    if (!aktivitaeten.length) return (element.innerHTML = '<div class="leise">Nichts los.</div>')
    element.innerHTML = aktivitaeten
      .map((a) => `<div class="eintrag${a.laeuft ? ' laeuft' : ''}"><time>${a.zeit}</time><span>${maskieren(a.text)}</span></div>`)
      .join('')
  }

  function melden(text, laeuft = false) {
    const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    aktivitaeten.unshift({ zeit, text, laeuft })
    aktivitaeten.length = Math.min(aktivitaeten.length, 8)
    anzeigen()
  }

  function laufendeBeenden() {
    aktivitaeten.forEach((a) => (a.laeuft = false))
    anzeigen()
  }

  return { melden, laufendeBeenden }
}