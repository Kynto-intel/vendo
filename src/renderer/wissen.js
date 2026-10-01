// Wissen-Bereiche: Wissen (Vault), Bibliothek, Entscheidungen, Dateien, dazu der Morgenbericht.
// Ein gemeinsamer "Leser" zeigt Notizen und Dokumente an (Markdown oder HTML).

import { markdownZuHtml } from './markdown.js'
import { vorWann } from './ansichten.js'
import { hinweis } from './fenster.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let helfer = { vorlesen: () => {}, ansichtZeigen: () => {}, anLuzzy: () => {} }
export function wissenEinrichten(h) {
  helfer = { ...helfer, ...h }
}

// ── Leser ──
function leserErstellen(el) {
  let aktuell = null
  el.innerHTML = '<div class="leser-leer">Links etwas auswählen.</div>'

  async function zeigen(rel, { geheim = false } = {}) {
    el.innerHTML = '<div class="leser-leer">Lade …</div>'
    let datei
    try {
      datei = await api.wissen.lesen(rel)
    } catch (e) {
      el.innerHTML = `<div class="leser-leer fehler">${maskieren(e.message)}</div>`
      return
    }
    aktuell = datei
    const istHtml = /\.html?$/i.test(datei.name)
    el.innerHTML = `
      <header class="leser-kopf">
        <div>
          <h3>${maskieren(datei.name.replace(/\.(md|txt)$/i, ''))}</h3>
          <div class="leise klein">${maskieren(datei.pfad)} · geändert ${vorWann(datei.geaendert)}</div>
        </div>
        <div class="leser-knoepfe">
          ${istHtml ? '' : '<button class="knopf-flach" data-leser="vorlesen" type="button">Vorlesen</button>'}
          <button class="knopf-flach" data-leser="oeffnen" type="button">Öffnen</button>
          <button class="knopf-flach" data-leser="zeigen" type="button">Im Explorer</button>
        </div>
      </header>
      <div class="leser-inhalt${geheim ? ' verdeckt' : ''}"></div>
      ${geheim ? '<div class="geheim-hinweis">Diese Notiz enthält Zugangsdaten. <button class="knopf-flach" data-leser="aufdecken" type="button">Trotzdem anzeigen</button></div>' : ''}`
    const inhalt = el.querySelector('.leser-inhalt')
    if (istHtml) {
      // Blogartikel: in einem abgeschotteten Rahmen ohne Skripte
      const rahmen = document.createElement('iframe')
      rahmen.className = 'leser-html'
      rahmen.setAttribute('sandbox', '')
      rahmen.srcdoc = datei.text
      inhalt.appendChild(rahmen)
    } else if (/\.md$/i.test(datei.name)) {
      inhalt.innerHTML = `<div class="msg-text md">${markdownZuHtml(datei.text)}</div>`
    } else {
      inhalt.innerHTML = `<pre class="leser-text">${maskieren(datei.text)}</pre>`
    }
  }

  el.addEventListener('click', async (e) => {
    const wiki = e.target.closest('a.wiki')
    if (wiki) {
      e.preventDefault()
      const pfad = await api.wissen.notizFinden(wiki.dataset.wiki)
      if (pfad) zeigen(pfad)
      return
    }
    const knopf = e.target.closest('[data-leser]')
    if (!knopf || !aktuell) return
    const art = knopf.dataset.leser
    if (art === 'vorlesen') helfer.vorlesen(aktuell.text)
    if (art === 'oeffnen') api.datei.oeffnen(aktuell.pfad).catch((err) => hinweis(err.message, { titel: 'Öffnen' }))
    if (art === 'zeigen') api.datei.zeigen(aktuell.pfad)
    if (art === 'aufdecken') {
      el.querySelector('.leser-inhalt')?.classList.remove('verdeckt')
      el.querySelector('.geheim-hinweis')?.remove()
    }
  })

  return { zeigen, aktuell: () => aktuell }
}

function listeKlicks(listeEl, leser) {
  listeEl.addEventListener('click', (e) => {
    const eintrag = e.target.closest('[data-pfad]')
    if (!eintrag) return
    for (const el of listeEl.querySelectorAll('.gewaehlt')) el.classList.remove('gewaehlt')
    eintrag.classList.add('gewaehlt')
    leser.zeigen(eintrag.dataset.pfad, { geheim: eintrag.dataset.geheim === '1' })
  })
}

// Aufgeklappte Gruppen merken; standardmäßig ist alles zugeklappt
const offeneGruppen = { wissen: new Set(), bibliothek: new Set() }
function gruppenUmschalten(listeEl, art) {
  listeEl.addEventListener('click', (e) => {
    const kopf = e.target.closest('.gruppe-kopf')
    if (!kopf) return
    const gruppe = kopf.parentElement
    gruppe.classList.toggle('eingeklappt')
    const name = gruppe.dataset.gruppe
    if (gruppe.classList.contains('eingeklappt')) offeneGruppen[art].delete(name)
    else offeneGruppen[art].add(name)
  })
}
const zu = (art, name) => (offeneGruppen[art].has(name) ? '' : ' eingeklappt')

// ── Wissen (Vault) ──
const wissenLeser = leserErstellen($('wissen-leser'))
listeKlicks($('wissen-liste'), wissenLeser)
let vaultCache = []

function vaultZeigen(notizen, { suche = false } = {}) {
  const el = $('wissen-liste')
  if (!notizen.length) return (el.innerHTML = `<div class="leise">${suche ? 'Nichts gefunden.' : 'Keine Notizen gefunden.'}</div>`)
  const gruppen = {}
  for (const n of notizen) (gruppen[suche ? 'Treffer' : n.bereich] ??= []).push(n)
  el.innerHTML = Object.entries(gruppen)
    .map(
      ([bereich, liste]) => `
      <div class="gruppe${suche ? '' : zu('wissen', bereich)}" data-gruppe="${maskieren(bereich)}">
        <button class="gruppe-kopf" type="button">${maskieren(bereich.replace(/^\d+_/, '').replace(/[_&]/g, ' ').replace(/\\/g, ' › '))} <span>${liste.length}</span></button>
        <div class="gruppe-inhalt">
          ${liste
            .map(
              (n) => `
            <button class="eintrag" data-pfad="${maskieren(n.pfad)}" data-geheim="${n.geheim ? '1' : ''}" type="button" title="${maskieren(n.wofuer || n.pfad)}">
              <span class="eintrag-titel">${maskieren(n.titel)}</span>
              ${n.status ? `<span class="status status-${n.status === 'prüfen' ? 'pruefen' : n.status}">${maskieren(n.status)}</span>` : ''}
              ${n.geheim ? '<span class="status status-geheim">Zugangsdaten</span>' : ''}
              ${n.ausschnitt ? `<span class="eintrag-info">… ${maskieren(n.ausschnitt)} …</span>` : n.wofuer ? `<span class="eintrag-info">${maskieren(n.wofuer)}</span>` : ''}
            </button>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('')
}

gruppenUmschalten($('wissen-liste'), 'wissen')

let suchUhr = 0
$('wissen-suche').addEventListener('input', (e) => {
  clearTimeout(suchUhr)
  const text = e.target.value.trim()
  suchUhr = setTimeout(async () => {
    if (!text) return vaultZeigen(vaultCache)
    const treffer = await api.wissen.suchen(text)
    const geheim = new Set(vaultCache.filter((n) => n.geheim).map((n) => n.pfad))
    vaultZeigen(treffer.map((t) => ({ ...t, geheim: geheim.has(t.pfad) })), { suche: true })
  }, 250)
})

export async function wissenLaden() {
  vaultCache = await api.wissen.vault().catch(() => [])
  if (!$('wissen-suche').value.trim()) vaultZeigen(vaultCache)
  if (!wissenLeser.aktuell()) {
    const start = vaultCache.find((n) => n.name === '00_Übersicht.md')
    if (start) wissenLeser.zeigen(start.pfad)
  }
}

export function notizOeffnen(pfad) {
  helfer.ansichtZeigen('wissen')
  wissenLeser.zeigen(pfad)
}

// ── Bibliothek ──
const bibliothekLeser = leserErstellen($('bibliothek-leser'))
listeKlicks($('bibliothek-liste'), bibliothekLeser)

export async function bibliothekLaden() {
  const quellen = await api.wissen.bibliothek().catch(() => [])
  const el = $('bibliothek-liste')
  const gesamt = quellen.reduce((s, q) => s + q.dokumente.length, 0)
  $('bibliothek-anzahl').textContent = gesamt ? `${gesamt} Dokumente` : ''
  el.innerHTML = quellen
    .filter((q) => q.dokumente.length)
    .map(
      (q) => `
      <div class="gruppe${zu('bibliothek', q.id)}" data-gruppe="${maskieren(q.id)}">
        <button class="gruppe-kopf" type="button">${maskieren(q.name)} <span>${q.dokumente.length}</span></button>
        <div class="gruppe-inhalt">
          ${q.dokumente
            .map(
              (d) => `
            <button class="eintrag" data-pfad="${maskieren(d.pfad)}" type="button" title="${maskieren(d.pfad)}">
              <span class="eintrag-titel">${maskieren(d.name.replace(/\.(md|html?|txt)$/i, ''))}</span>
              <span class="eintrag-info">${vorWann(d.geaendert)} · ${kb(d.groesse)}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('') || '<div class="leise">Noch keine Dokumente.</div>'
}
gruppenUmschalten($('bibliothek-liste'), 'bibliothek')

// ── Entscheidungen ──
const entscheidungenLeser = leserErstellen($('entscheidungen-leser'))
listeKlicks($('entscheidungen-liste'), entscheidungenLeser)
let entscheidungenCache = []

function entscheidungenZeigen() {
  const filter = $('entscheidungen-filter').value
  const heute = new Date().toISOString().slice(0, 10)
  const liste = entscheidungenCache.filter((d) =>
    filter === 'gilt' ? d.status === 'gilt' : filter === 'ueberholt' ? d.status === 'überholt' : filter === 'faellig' ? d.pruefen && d.pruefen.slice(0, 10) <= heute && d.status !== 'überholt' : true
  )
  const el = $('entscheidungen-liste')
  if (!entscheidungenCache.length) {
    el.innerHTML = '<div class="leer-hinweis">Noch keine Entscheidungen festgehalten. Luzzy legt sie im Vault unter 04_Decision_Log an (eine Notiz pro Entscheidung mit Datum, Begründung, Status und Prüfdatum). Sag ihr einfach: „Halt fest, dass wir …“</div>'
    return
  }
  el.innerHTML = liste.length
    ? liste
        .map(
          (d) => `
        <button class="eintrag entscheidung" data-pfad="${maskieren(d.pfad)}" type="button">
          <span class="eintrag-titel">${maskieren(d.titel)}</span>
          <span class="status status-${d.status === 'überholt' ? 'historisch' : d.status === 'gilt' ? 'aktuell' : 'pruefen'}">${maskieren(d.status)}</span>
          <span class="eintrag-info">${maskieren(d.datum)}${d.pruefen ? ` · prüfen am ${maskieren(d.pruefen)}` : ''}</span>
          ${d.begruendung ? `<span class="eintrag-info">${maskieren(d.begruendung.slice(0, 140))}</span>` : ''}
        </button>`
        )
        .join('')
    : '<div class="leise">Keine Entscheidungen für diesen Filter.</div>'
}
$('entscheidungen-filter').addEventListener('change', entscheidungenZeigen)

export async function entscheidungenLaden() {
  entscheidungenCache = await api.wissen.entscheidungen().catch(() => [])
  $('entscheidungen-anzahl').textContent = entscheidungenCache.length ? `${entscheidungenCache.length}` : ''
  entscheidungenZeigen()
}

// ── Morgenbericht (Karte rechts) ──
let letzterBericht = null
export async function morgenberichtLaden() {
  const el = $('morgenbericht')
  const berichte = await api.wissen.morgenberichte().catch(() => [])
  if (!berichte.length) {
    letzterBericht = null
    el.innerHTML = '<div class="leise">Noch kein Morgenbericht.</div>'
    return
  }
  const neuester = berichte[0]
  const datei = await api.wissen.lesen(neuester.pfad).catch(() => null)
  letzterBericht = datei
  const heute = new Date().toISOString().slice(0, 10)
  const datum = neuester.name.replace('.md', '')
  const kurz = (datei?.text || '')
    .split('\n')
    .filter((z) => /^\s*-\s+/.test(z))
    .slice(0, 3)
    .map((z) => `<li>${maskieren(z.replace(/^\s*-\s+/, '').replace(/\*\*/g, ''))}</li>`)
    .join('')
  el.innerHTML = `
    <div class="bericht-datum">${new Date(datum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}${datum === heute ? '' : ' <span class="status status-pruefen">nicht von heute</span>'}</div>
    ${kurz ? `<ul class="bericht-kurz">${kurz}</ul>` : ''}
    <div class="bericht-knoepfe">
      <button class="knopf-mini" data-bericht="lesen" type="button">Lesen</button>
      <button class="knopf-mini" data-bericht="vorlesen" type="button">Vorlesen</button>
      ${datum === heute ? '' : '<button class="knopf-mini" data-bericht="erstellen" type="button">Heute erstellen</button>'}
    </div>`
}
$('morgenbericht').addEventListener('click', (e) => {
  const art = e.target.closest('[data-bericht]')?.dataset.bericht
  if (!art) return
  if (art === 'lesen' && letzterBericht) notizOeffnen(letzterBericht.pfad)
  if (art === 'vorlesen' && letzterBericht) helfer.vorlesen(letzterBericht.text)
  if (art === 'erstellen') {
    const heute = new Date().toISOString().slice(0, 10)
    helfer.anLuzzy(
      `Erstelle bitte den Morgenbericht für heute (${heute}) im gleichen Aufbau wie die bisherigen in Donnerwolf-Shop\\04_Analytics\\Morgenberichte ` +
        `(Bestellungen live aus Shopify, Postfach, was Antwort braucht) und speichere ihn dort als ${heute}.md. Sag mir danach kurz das Wichtigste.`
    )
  }
})
