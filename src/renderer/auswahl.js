// Eigene Auswahlfenster für Datum und Uhrzeit im Jarves-Design, statt der Windows-Standardfenster
// (die sich nicht einfärben lassen). Gilt für alle input[type=date|time], auch in Plugins und Dialogen.
// Das Feld selbst bleibt: Tippen geht wie gewohnt, der Wert steht weiter in input.value (JJJJ-MM-TT bzw. HH:MM).
// Öffnen: Klick ins Feld, F4 oder Alt+↓. Schließen: Esc, Klick daneben, Auswahl.

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const zwei = (n) => String(n).padStart(2, '0')
const tagText = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`

let feld = null // gerade bearbeitetes Eingabefeld
let monat = null // angezeigter Monat im Kalender (1. des Monats)
const fenster = document.createElement('div')
fenster.className = 'auswahl-fenster'
fenster.setAttribute('popover', 'manual') // liegt so auch über offenen Dialogen (Einstellungen)
document.body.appendChild(fenster)

function setzen(wert) {
  feld.value = wert
  feld.dispatchEvent(new Event('input', { bubbles: true }))
  feld.dispatchEvent(new Event('change', { bubbles: true }))
}

function schliessen() {
  if (!feld) return
  const war = feld
  feld = null
  try {
    fenster.hidePopover()
  } catch {
    // war schon zu
  }
  war.focus()
}

// Unter (oder, wenn kein Platz, über) dem Feld
function platzieren() {
  const r = feld.getBoundingClientRect()
  const b = fenster.offsetWidth
  const h = fenster.offsetHeight
  const links = Math.min(Math.max(8, r.left), innerWidth - b - 8)
  const oben = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6
  fenster.style.left = `${links}px`
  fenster.style.top = `${oben}px`
}

// ── Datum ──
function kalenderZeigen() {
  const gewaehlt = feld.value
  const heute = tagText(new Date())
  const start = new Date(monat)
  start.setDate(1 - ((start.getDay() + 6) % 7)) // Montag der ersten Woche
  let tage = ''
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const t = tagText(d)
    const klassen = ['aw-tag', d.getMonth() !== monat.getMonth() && 'fremd', t === heute && 'heute', t === gewaehlt && 'gewaehlt'].filter(Boolean).join(' ')
    tage += `<button type="button" class="${klassen}" data-tag="${t}">${d.getDate()}</button>`
  }
  fenster.innerHTML = `
    <div class="aw-kopf">
      <button type="button" class="aw-pfeil" data-monat="-1" title="Voriger Monat">‹</button>
      <span>${MONATE[monat.getMonth()]} ${monat.getFullYear()}</span>
      <button type="button" class="aw-pfeil" data-monat="1" title="Nächster Monat">›</button>
    </div>
    <div class="aw-woche">${TAGE.map((t) => `<span>${t}</span>`).join('')}</div>
    <div class="aw-tage">${tage}</div>
    <div class="aw-fuss"><button type="button" data-aw="loeschen">Löschen</button><button type="button" data-aw="heute">Heute</button></div>`
}

// ── Uhrzeit ──
function uhrZeigen() {
  const [h, m] = (feld.value || '').split(':')
  const spalte = (werte, aktiv, art) =>
    `<div class="aw-spalte" data-spalte="${art}">${werte.map((w) => `<button type="button" class="aw-zeit${w === aktiv ? ' gewaehlt' : ''}" data-${art}="${w}">${w}</button>`).join('')}</div>`
  const stunden = Array.from({ length: 24 }, (_, i) => zwei(i))
  const minuten = Array.from({ length: 60 }, (_, i) => zwei(i))
  fenster.innerHTML = `
    <div class="aw-uhr">${spalte(stunden, h, 'stunde')}${spalte(minuten, m, 'minute')}</div>
    <div class="aw-fuss"><button type="button" data-aw="loeschen">Löschen</button><button type="button" data-aw="jetzt">Jetzt</button></div>`
  // Gewählte (oder aktuelle) Zeit in die Mitte scrollen
  const jetzt = new Date()
  for (const [art, wert] of [['stunde', h || zwei(jetzt.getHours())], ['minute', m || zwei(jetzt.getMinutes())]]) {
    const knopf = fenster.querySelector(`[data-${art}="${wert}"]`)
    const s = knopf?.parentElement
    if (s) s.scrollTop = knopf.offsetTop - s.clientHeight / 2 + knopf.offsetHeight / 2
  }
}

function oeffnen(eingabe) {
  if (eingabe.disabled || eingabe.readOnly) return
  feld = eingabe
  fenster.dataset.art = eingabe.type
  if (eingabe.type === 'date') {
    const d = eingabe.value ? new Date(`${eingabe.value}T00:00`) : new Date()
    monat = new Date(d.getFullYear(), d.getMonth(), 1)
    kalenderZeigen()
  } else uhrZeigen()
  if (!fenster.matches(':popover-open')) fenster.showPopover()
  platzieren()
  if (eingabe.type === 'time') uhrZeigen() // nach dem Einblenden: jetzt stimmen die Höhen fürs Scrollen
}

fenster.addEventListener('click', (e) => {
  if (!feld) return
  const k = e.target.closest('button')
  if (!k) return
  if (k.dataset.monat) {
    monat.setMonth(monat.getMonth() + Number(k.dataset.monat))
    return kalenderZeigen()
  }
  if (k.dataset.tag) {
    setzen(k.dataset.tag)
    return schliessen()
  }
  if (k.dataset.aw === 'heute') {
    setzen(tagText(new Date()))
    return schliessen()
  }
  if (k.dataset.aw === 'jetzt') {
    const j = new Date()
    setzen(`${zwei(j.getHours())}:${zwei(j.getMinutes())}`)
    return schliessen()
  }
  if (k.dataset.aw === 'loeschen') {
    setzen('')
    return schliessen()
  }
  // Uhrzeit: Stunde wählen (Minuten bleiben bzw. 00), Minute wählen schließt
  const [h, m] = (feld.value || '').split(':')
  if (k.dataset.stunde) {
    setzen(`${k.dataset.stunde}:${m || '00'}`)
    return uhrZeigen()
  }
  if (k.dataset.minute) {
    setzen(`${h || zwei(new Date().getHours())}:${k.dataset.minute}`)
    return schliessen()
  }
})
// Mausrad über dem Kalender blättert die Monate
fenster.addEventListener('wheel', (e) => {
  if (fenster.dataset.art !== 'date') return
  e.preventDefault()
  monat.setMonth(monat.getMonth() + (e.deltaY > 0 ? 1 : -1))
  kalenderZeigen()
}, { passive: false })

const istAuswahlFeld = (el) => el instanceof HTMLInputElement && (el.type === 'date' || el.type === 'time')
document.addEventListener('click', (e) => {
  if (istAuswahlFeld(e.target)) return oeffnen(e.target)
  if (feld && !fenster.contains(e.target)) schliessen()
}, true)
document.addEventListener('keydown', (e) => {
  if (feld && e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation() // sonst schließt Esc auch den Dialog darunter
    return schliessen()
  }
  // F4 / Alt+↓ öffnen sonst das Windows-Fenster
  if (istAuswahlFeld(e.target) && (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) {
    e.preventDefault()
    oeffnen(e.target)
  }
}, true)
addEventListener('resize', () => feld && platzieren())
