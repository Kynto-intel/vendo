// Datei oder Bild an die KI (Idee 25): Büroklammer links in der Eingabe, ins Fenster ziehen oder Bild mit Strg+V.
// Jede Eingabe mit Büroklammer ([data-anhang]) hat eigene Anhänge: Zentrale und Luzzys Chat gehen an Luzzy,
// die Crew-Eingabe an den gerade gewählten Bot. Die Anhänge stehen als Kärtchen direkt über der Eingabe
// (✕ entfernt sie) und gehen mit der nächsten Nachricht mit. Hermes nimmt sie direkt an: Bilder als Bild,
// PDFs Seite für Seite, alles andere als Datei (hermes.js: anhangHinzufuegen, an die Sitzung des Kanals).

const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const MAX = 10
const BILD = /\.(png|jpe?g|gif|webp|bmp)$/i

const ablagen = new Map() // form → { liste: [{ name, pfad?, base64?, vorschau? }], el }
let h = { api: null, melden: () => {} }

const symbol = (a) => (a.base64 || BILD.test(a.name) ? '🖼' : /\.pdf$/i.test(a.name) ? '📄' : /\.(csv|xlsx?|tsv)$/i.test(a.name) ? '📊' : '📎')
const sichtbar = (form) => form.isConnected && !form.hidden && form.offsetParent !== null

function ablage(form) {
  if (!ablagen.has(form)) {
    // Zentrale: der vorhandene Platz #anhaenge über der Eingabe; sonst ein eigener
    const vorhanden = form.previousElementSibling?.classList.contains('anhaenge') ? form.previousElementSibling : null
    const el = vorhanden || Object.assign(document.createElement('div'), { className: 'anhaenge' })
    el.hidden = true
    ablagen.set(form, { liste: [], el })
  }
  return ablagen.get(form)
}

// Wohin gehört eine hineingezogene Datei? In die Eingabe, in der gerade getippt wird, sonst die sichtbare
function aktiveForm() {
  const fokus = document.activeElement?.closest?.('form')
  if (fokus && ablagen.has(fokus) && sichtbar(fokus)) return fokus
  return [...ablagen.keys()].find(sichtbar) || null
}

export function anhaengeEinrichten(helfer) {
  h = { ...h, ...helfer }
  for (const knopf of document.querySelectorAll('[data-anhang]')) {
    const form = knopf.closest('form')
    ablage(form)
    // Büroklammer
    knopf.addEventListener('click', async () => {
      const pfade = await h.api.anhangWaehlen().catch(() => [])
      for (const pfad of pfade) hinzufuegen(form, { name: pfad.split(/[\\/]/).pop(), pfad })
    })
    // Bild einfügen (Strg+V im Eingabefeld)
    form.querySelector('textarea')?.addEventListener('paste', (e) => {
      const bilder = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      if (!bilder.length) return
      e.preventDefault()
      for (const eintrag of bilder) {
        const datei = eintrag.getAsFile()
        const leser = new FileReader()
        leser.onload = () => {
          const dataUrl = String(leser.result)
          hinzufuegen(form, { name: `Eingefügtes Bild.${(datei.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, base64: dataUrl.split(',')[1], vorschau: dataUrl })
        }
        leser.readAsDataURL(datei)
      }
    })
  }
  // ✕ an einem Kärtchen (alle Ablagen)
  document.addEventListener('click', (e) => {
    const knopf = e.target.closest('.anhaenge [data-weg]')
    if (!knopf) return
    const form = [...ablagen.keys()].find((f) => ablagen.get(f).el.contains(knopf))
    if (!form) return
    ablagen.get(form).liste.splice(Number(knopf.dataset.weg), 1)
    zeichnen(form)
  })
  // Ins Fenster ziehen
  let tiefe = 0
  const hatDateien = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
  window.addEventListener('dragenter', (e) => {
    if (!hatDateien(e)) return
    tiefe++
    document.body.classList.add('datei-drueber')
  })
  window.addEventListener('dragleave', (e) => {
    if (!hatDateien(e)) return
    tiefe = Math.max(0, tiefe - 1)
    if (!tiefe) document.body.classList.remove('datei-drueber')
  })
  window.addEventListener('dragover', (e) => {
    if (hatDateien(e)) e.preventDefault()
  })
  window.addEventListener('drop', (e) => {
    if (!hatDateien(e)) return
    e.preventDefault()
    tiefe = 0
    document.body.classList.remove('datei-drueber')
    const form = aktiveForm()
    if (!form) return h.melden('Öffne erst ein Gespräch, dann kannst du Dateien hineinziehen.')
    for (const datei of e.dataTransfer.files) {
      const pfad = h.api.pfadVon(datei)
      if (pfad) hinzufuegen(form, { name: datei.name, pfad })
    }
  })
}

function hinzufuegen(form, anhang) {
  const a = ablage(form)
  if (a.liste.length >= MAX) return h.melden(`Höchstens ${MAX} Anhänge auf einmal.`)
  if (anhang.pfad && a.liste.some((x) => x.pfad === anhang.pfad)) return
  a.liste.push(anhang)
  zeichnen(form)
  form.querySelector('textarea')?.focus()
}

function zeichnen(form) {
  const { liste, el } = ablage(form)
  if (form.previousElementSibling !== el) form.before(el) // die Eingabe kann umziehen (Luzzys Chat → Crew-Tab)
  el.hidden = !liste.length
  el.innerHTML = liste
    .map((a, i) => `
      <div class="anhang-karte" title="${maskieren(a.pfad || a.name)}">
        ${a.vorschau ? `<img src="${a.vorschau}" alt="" />` : `<span class="anhang-symbol">${symbol(a)}</span>`}
        <span class="anhang-name">${maskieren(a.name)}</span>
        <button class="anhang-weg" data-weg="${i}" type="button" title="Anhang entfernen">✕</button>
      </div>`)
    .join('')
}

export const anhaengeAnzahl = (form) => (form && ablagen.has(form) ? ablagen.get(form).liste.length : 0)

// Alle Anhänge dieser Eingabe an Hermes geben, an das Gespräch von „kanal“. Liefert { namen, symbole, text }
// (text = Verweise, die in die Nachricht gehören). Klappt einer nicht, bricht es mit Fehler ab; die Liste bleibt.
export async function anhaengeSenden(form, kanal = 'zentrale') {
  const a = ablage(form)
  const texte = []
  const namen = []
  for (const x of a.liste) {
    const r = x.base64 ? await h.api.hermes.bild(x.base64, x.name, kanal) : await h.api.hermes.anhang(x.pfad, kanal)
    namen.push(r?.name || x.name)
    if (r?.text) texte.push(r.text)
  }
  const symbole = a.liste.map(symbol)
  a.liste = []
  zeichnen(form)
  return { namen, symbole, text: texte.join('\n') }
}
