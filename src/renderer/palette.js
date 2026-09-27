// Befehlspalette (Strg+P): ein Feld für alles. Tippen, mit ↑ ↓ wählen, Enter ausführen, Esc schließt.
// Passt kein Befehl, geht der Text mit Enter als Nachricht an Luzzy.
// Ohne Suchtext: alles nach Gruppen mit Überschrift (auch alle Tastenkürzel und Sprachbefehle zum Nachschlagen).
// Befehl: { name, gruppe, stichwoerter?, taste?, sagen?, hinweis?, ausfuehren }

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const normal = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')

let befehleHolen = () => []
let vorbereiten = async () => {} // vor dem Öffnen (z. B. Routinen laden)
let anLuzzy = () => {}
// Reihenfolge der Gruppen, wenn nichts getippt ist (unbekannte Gruppen hinten)
const GRUPPEN = ['Bereich', 'Luzzy', 'Schnellbefehl', 'Routine', 'Timer', 'Meldungen', 'Ansicht', 'Fenster', 'System', 'Einstellung', 'Sprachbefehl', 'Tastenkürzel']
const gruppenRang = (g) => (GRUPPEN.includes(g) ? GRUPPEN.indexOf(g) : GRUPPEN.length)
let treffer = []
let auswahl = 0
let gruppenFilter = '' // Schnellfilter oben (Sprachbefehle, Tastenkürzel, Bereiche), leer = alles

function filtern(text) {
  const woerter = normal(text).split(/\s+/).filter(Boolean)
  const alle = befehleHolen().filter((b) => !gruppenFilter || b.gruppe === gruppenFilter)
  // Jedes getippte Wort muss ein Wort des Befehls anfangen („kal“ → Kalender, aber „sich“ nicht → Ansicht)
  const passt = (b) => {
    const teile = normal(`${b.name} ${b.gruppe} ${b.stichwoerter || ''} ${b.taste || ''} ${b.hinweis || ''}`).split(/[^a-z0-9+]+/)
    return woerter.every((w) => teile.some((t) => t.startsWith(w)))
  }
  const passend = woerter.length ? alle.filter(passt) : [...alle].sort((a, b) => gruppenRang(a.gruppe) - gruppenRang(b.gruppe))
  // Treffer am Namensanfang zuerst
  if (woerter.length) passend.sort((a, b) => Number(!normal(a.name).startsWith(woerter[0])) - Number(!normal(b.name).startsWith(woerter[0])))
  if (text.trim() && !gruppenFilter) passend.push({ name: `An Luzzy: „${text.trim()}“`, gruppe: 'Luzzy', luzzy: true, ausfuehren: () => anLuzzy(text.trim()) })
  return passend
}

function zeigen() {
  treffer = filtern($('palette-eingabe').value)
  auswahl = Math.min(auswahl, Math.max(0, treffer.length - 1))
  const mitUeberschriften = !$('palette-eingabe').value.trim()
  let letzteGruppe = null
  $('palette-liste').innerHTML = treffer
    .map((b, i) => {
      const kopf = mitUeberschriften && b.gruppe !== letzteGruppe ? `<li class="palette-gruppe">${maskieren(b.gruppe === 'Sprachbefehl' ? 'Sprachbefehle (sagen oder tippen)' : b.gruppe === 'Tastenkürzel' ? 'Tastenkürzel' : b.gruppe)}</li>` : ''
      letzteGruppe = b.gruppe
      const rechts = b.taste ? `<kbd>${maskieren(b.taste)}</kbd>` : b.sagen ? '<span class="palette-sag">sagen</span>' : mitUeberschriften ? '' : `<small>${maskieren(b.gruppe)}</small>`
      return `${kopf}<li class="${i === auswahl ? 'gewaehlt' : ''}${b.luzzy ? ' palette-luzzy' : ''}" data-index="${i}"><span class="palette-name">${maskieren(b.name)}${b.hinweis ? `<i>${maskieren(b.hinweis)}</i>` : ''}</span>${rechts}</li>`
    })
    .join('')
  $('palette-liste').querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' })
}

function ausfuehren(i) {
  const befehl = treffer[i]
  if (!befehl) return
  $('palette').close()
  befehl.ausfuehren()
}

export async function paletteOeffnen() {
  if ($('palette').open) return $('palette').close()
  await vorbereiten().catch(() => {})
  $('palette-eingabe').value = ''
  auswahl = 0
  filterSetzen('')
  zeigen()
  $('palette').showModal()
  $('palette-eingabe').focus()
}

function filterSetzen(gruppe) {
  gruppenFilter = gruppe
  for (const k of document.querySelectorAll('#palette-filter [data-filter]')) k.classList.toggle('an', k.dataset.filter === gruppe)
}

export function paletteEinrichten({ befehle, luzzy, vorbereiten: vor }) {
  $('palette-filter').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-filter]')
    if (!knopf) return
    filterSetzen(knopf.dataset.filter)
    auswahl = 0
    zeigen()
    $('palette-eingabe').focus()
  })
  befehleHolen = befehle
  if (vor) vorbereiten = vor
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
