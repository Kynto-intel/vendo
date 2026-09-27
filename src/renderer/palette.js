// Befehlspalette (Strg+P): ein Feld für alles. Tippen, mit ↑ ↓ wählen, Enter ausführen, Esc schließt.
// Passt kein Befehl, geht der Text mit Enter als Nachricht an Luzzy.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const normal = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')

let befehleHolen = () => [] // → [{ name, gruppe, stichwoerter?, ausfuehren }]
let anLuzzy = () => {}
let treffer = []
let auswahl = 0

function filtern(text) {
  const woerter = normal(text).split(/\s+/).filter(Boolean)
  const alle = befehleHolen()
  // Jedes getippte Wort muss ein Wort des Befehls anfangen („kal“ → Kalender, aber „sich“ nicht → Ansicht)
  const passt = (b) => {
    const teile = normal(`${b.name} ${b.gruppe} ${b.stichwoerter || ''}`).split(/[^a-z0-9+]+/)
    return woerter.every((w) => teile.some((t) => t.startsWith(w)))
  }
  const passend = woerter.length ? alle.filter(passt) : alle
  // Treffer am Namensanfang zuerst
  if (woerter.length) passend.sort((a, b) => Number(!normal(a.name).startsWith(woerter[0])) - Number(!normal(b.name).startsWith(woerter[0])))
  if (text.trim()) passend.push({ name: `An Luzzy: „${text.trim()}“`, gruppe: 'Luzzy', luzzy: true, ausfuehren: () => anLuzzy(text.trim()) })
  return passend
}

function zeigen() {
  treffer = filtern($('palette-eingabe').value)
  auswahl = Math.min(auswahl, Math.max(0, treffer.length - 1))
  $('palette-liste').innerHTML = treffer
    .map((b, i) => `<li class="${i === auswahl ? 'gewaehlt' : ''}${b.luzzy ? ' palette-luzzy' : ''}" data-index="${i}"><span>${maskieren(b.name)}</span><small>${maskieren(b.gruppe)}</small></li>`)
    .join('')
  $('palette-liste').querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' })
}

function ausfuehren(i) {
  const befehl = treffer[i]
  if (!befehl) return
  $('palette').close()
  befehl.ausfuehren()
}

export function paletteOeffnen() {
  if ($('palette').open) return $('palette').close()
  $('palette-eingabe').value = ''
  auswahl = 0
  zeigen()
  $('palette').showModal()
  $('palette-eingabe').focus()
}

export function paletteEinrichten({ befehle, luzzy }) {
  befehleHolen = befehle
  anLuzzy = luzzy
  $('palette-eingabe').addEventListener('input', () => {
    auswahl = 0
    zeigen()
  })
  $('palette-eingabe').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      auswahl = (auswahl + (e.key === 'ArrowDown' ? 1 : -1) + treffer.length) % Math.max(1, treffer.length)
      zeigen()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ausfuehren(auswahl)
    }
  })
  $('palette-liste').addEventListener('click', (e) => {
    const zeile = e.target.closest('[data-index]')
    if (zeile) ausfuehren(Number(zeile.dataset.index))
  })
  // Klick neben die Palette schließt sie
  $('palette').addEventListener('click', (e) => e.target === $('palette') && $('palette').close())
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      paletteOeffnen()
    }
  })
}
