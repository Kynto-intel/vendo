// Rechte Spalte selbst einstellen: welche Karten sichtbar sind und in welcher Reihenfolge.
// Jede Karte hat data-karte (feste Karten in index.html, Plugin-Karten: "plugin-<id>").
// Gespeichert in den Einstellungen als karten: { reihenfolge: [ids], aus: [ids] }.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let spalte = null
let standard = { reihenfolge: [], aus: [] }

function karten() {
  return [...spalte.querySelectorAll(':scope > [data-karte]')]
}
const kartenName = (el) => el.dataset.name || el.querySelector('h3')?.firstChild?.textContent?.trim() || el.dataset.karte

// Einmal nach dem Start der Plugins: Standard merken (so wie die Spalte ohne eigene Einstellung aussieht)
export function kartenEinrichten(rechts) {
  spalte = rechts
  const alle = karten()
  const ordnung = (el) => Number(getComputedStyle(el).order) || 0
  standard = {
    reihenfolge: alle.map((el, i) => ({ el, i })).sort((a, b) => ordnung(a.el) - ordnung(b.el) || a.i - b.i).map(({ el }) => el.dataset.karte),
    aus: alle.filter((el) => el.hidden).map((el) => el.dataset.karte)
  }
}

// Reihenfolge und Sichtbarkeit aus den Einstellungen (neue Karten, z. B. von neuen Plugins, hängen hinten an)
function stand(einstellung) {
  const da = new Set(standard.reihenfolge)
  const gespeichert = (einstellung?.reihenfolge || []).filter((id) => da.has(id))
  const neu = standard.reihenfolge.filter((id) => !gespeichert.includes(id))
  const aus = einstellung ? (einstellung.aus || []).concat(neu.filter((id) => standard.aus.includes(id))) : standard.aus
  return { reihenfolge: gespeichert.length ? [...gespeichert, ...neu] : standard.reihenfolge, aus: new Set(aus) }
}

export function kartenAnwenden(einstellung) {
  if (!spalte) return
  const { reihenfolge, aus } = stand(einstellung)
  for (const el of karten()) {
    el.style.order = String(reihenfolge.indexOf(el.dataset.karte))
    el.hidden = aus.has(el.dataset.karte)
  }
}

// Einstellungen-Dialog: Liste mit Haken und ↑ ↓
export function kartenFormularFuellen(einstellung) {
  if (!spalte) return
  const { reihenfolge, aus } = stand(einstellung)
  const namen = Object.fromEntries(karten().map((el) => [el.dataset.karte, kartenName(el)]))
  $('e-karten').innerHTML = reihenfolge
    .map((id) => `<li data-karte-id="${maskieren(id)}">
      <label class="haken"><input type="checkbox" ${aus.has(id) ? '' : 'checked'} /> ${maskieren(namen[id])}</label>
      <span class="karten-pfeile"><button class="knopf-mini" type="button" data-schieben="-1" title="Nach oben">↑</button><button class="knopf-mini" type="button" data-schieben="1" title="Nach unten">↓</button></span>
    </li>`)
    .join('')
}

export function kartenFormularLesen() {
  if (!spalte) return null // Plugins noch nicht geladen: nichts ändern
  const zeilen = [...$('e-karten').children]
  return {
    reihenfolge: zeilen.map((li) => li.dataset.karteId),
    aus: zeilen.filter((li) => !li.querySelector('input').checked).map((li) => li.dataset.karteId)
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#e-karten-standard')) return kartenFormularFuellen(null) // zurück auf den Auslieferungszustand
  const knopf = e.target.closest('#e-karten [data-schieben]')
  if (!knopf) return
  const li = knopf.closest('li')
  if (knopf.dataset.schieben === '-1' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling)
  if (knopf.dataset.schieben === '1' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li)
})
