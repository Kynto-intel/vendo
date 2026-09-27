// Datei oder Bild an Luzzy (Idee 25): ins Fenster ziehen, 📎-Knopf oder Bild mit Strg+V einfügen.
// Die Anhänge stehen als Kärtchen über der Eingabe (✕ entfernt sie) und gehen mit der nächsten Nachricht an Luzzy.
// Hermes nimmt sie direkt an: Bilder als Bild, PDFs Seite für Seite, alles andere als Datei.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const MAX = 10
const BILD = /\.(png|jpe?g|gif|webp|bmp)$/i

let liste = [] // { name, pfad? , base64?, vorschau? }
let h = { api: null, melden: () => {} }

const symbol = (a) => (a.base64 || BILD.test(a.name) ? '🖼' : /\.pdf$/i.test(a.name) ? '📄' : /\.(csv|xlsx?|tsv)$/i.test(a.name) ? '📊' : '📎')

export function anhaengeEinrichten(helfer) {
  h = { ...h, ...helfer }
  // 📎-Knopf
  $('anhang-knopf').addEventListener('click', async () => {
    const pfade = await h.api.anhangWaehlen().catch(() => [])
    for (const pfad of pfade) hinzufuegen({ name: pfad.split(/[\\/]/).pop(), pfad })
  })
  // ✕ an einem Kärtchen
  $('anhaenge').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-weg]')
    if (!knopf) return
    liste.splice(Number(knopf.dataset.weg), 1)
    zeichnen()
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
    for (const datei of e.dataTransfer.files) {
      const pfad = h.api.pfadVon(datei)
      if (pfad) hinzufuegen({ name: datei.name, pfad })
    }
  })
  // Bild einfügen (Strg+V in einem Eingabefeld)
  for (const feld of document.querySelectorAll('.eingabe-text')) {
    feld.addEventListener('paste', (e) => {
      const bilder = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      if (!bilder.length) return
      e.preventDefault()
      for (const eintrag of bilder) {
        const datei = eintrag.getAsFile()
        const leser = new FileReader()
        leser.onload = () => {
          const dataUrl = String(leser.result)
          hinzufuegen({ name: `Eingefügtes Bild.${(datei.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, base64: dataUrl.split(',')[1], vorschau: dataUrl })
        }
        leser.readAsDataURL(datei)
      }
    })
  }
}

function hinzufuegen(anhang) {
  if (liste.length >= MAX) return h.melden(`Höchstens ${MAX} Anhänge auf einmal.`)
  if (anhang.pfad && liste.some((a) => a.pfad === anhang.pfad)) return
  liste.push(anhang)
  zeichnen()
  document.querySelector('.befehl .eingabe-text')?.focus()
}

function zeichnen() {
  const el = $('anhaenge')
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

export const anhaengeAnzahl = () => liste.length

// Alle Anhänge an Hermes geben. Liefert { namen, text } (text = Verweise, die in die Nachricht gehören).
// Klappt einer nicht, bricht es mit Fehler ab; die Liste bleibt dann stehen.
export async function anhaengeSenden() {
  const texte = []
  const namen = []
  for (const a of liste) {
    const r = a.base64 ? await h.api.hermes.bild(a.base64, a.name) : await h.api.hermes.anhang(a.pfad)
    namen.push(r?.name || a.name)
    if (r?.text) texte.push(r.text)
  }
  const symbole = liste.map(symbol)
  liste = []
  zeichnen()
  return { namen, symbole, text: texte.join('\n') }
}
