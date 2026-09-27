// Dateiansicht: „Luzzy, such die Datei Thor-Hoodie und öffne sie“, „Öffne die Datei Preisliste“, „Zeig mir das Bild Logo“.
// Gesucht wird in Felix' üblichen Ordnern (siehe src/main/dateisuche.js). Die Datei erscheint in einem Fenster über
// Jarves-OS, ohne eigenen Tab: Notizen, Texte, Tabellen, Bilder, PDF, Videos, Musik. Alles andere (Word, Excel …):
// Knopf „Mit Programm öffnen“. Mehrere Treffer: Liste zum Anklicken oder „die zweite“ sagen.

import { markdownZuHtml } from './markdown.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const ARTWORT = { bild: 'bild', foto: 'bild', pdf: 'pdf', video: 'video', tabelle: 'tabelle', notiz: 'markdown' }
const WAS = '(datei|dokument|bild|foto|pdf|video|tabelle|notiz)'
const SUCHEN = new RegExp(`^(?:such|suche|find|finde)(?: mal| mir| bitte| doch)*(?: nach)?(?: der| die| dem| das| den| meine[mnrs]?| mein| eine[mnr]?)? ${WAS}(?: namens| mit dem namen| die| das)?\\s+(.+?)(?:\\s+und\\s+(?:öffne|oeffne|zeig|zeige|mach)\\b.*)?$`, 'i')
const OEFFNEN = new RegExp(`^(?:öffne|oeffne|zeig|zeige|mach)(?: mir)?(?: mal| bitte| doch)*(?: die| das| den| meine[mnrs]?| mein)? ${WAS}(?: namens| mit dem namen)?\\s+(.+?)(?:\\s+auf)?$`, 'i')
const ZAHLEN = ['erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte']

const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')
const normal = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[_\-.+()[\]]+/g, ' ').replace(/\s+/g, ' ').trim()

// { suche, art } oder null
export function dateiBefehlErkennen(text) {
  const satz = ohneLuzzy(text).replace(/[.!?]+$/, '')
  const t = SUCHEN.exec(satz) || OEFFNEN.exec(satz)
  if (!t) return null
  const suche = t[2]
    .replace(/[„“"'»«]/g, '')
    .replace(/\s+punkt\s+(\w{2,4})$/i, '.$1') // „Preisliste Punkt PDF“
    .replace(/^(?:vom|von der|von dem|von|über|mit|zum|zur|zu)\s+/i, '') // „das Foto vom Wolf“
    .trim()
  return suche ? { suche, art: ARTWORT[t[1].toLowerCase()] || null } : null
}

// „die zweite“, „Nummer 3“, „die 2“ – nur solange die Trefferliste offen ist
export function trefferNummer(text) {
  if (!letzteTreffer.length || !$('dateiansicht').open || $('dateiansicht').dataset.modus !== 'liste') return null
  const satz = ohneLuzzy(text).toLowerCase().replace(/[.!?]/g, '').trim()
  const t = /^(?:die |das |den |nummer |nr )?(\d|erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte)(?: datei| davon)?$/.exec(satz)
  if (!t) return null
  const n = /\d/.test(t[1]) ? Number(t[1]) : ZAHLEN.indexOf(t[1]) + 1
  return n >= 1 && n <= letzteTreffer.length ? n : null
}

let letzteTreffer = []
let offeneId = null

const groesse = (b) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const datum = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
// Für Luzzys Satz: ohne Endung, „thor_hoodie-entwurf“ → „thor hoodie entwurf“
const sprechName = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
const ortText = (t) => [t.ort, t.ordner].filter(Boolean).join(' › ')

// Suchen und zeigen. Gibt den Satz zurück, den Luzzy dazu sagt.
export async function dateiSuchenUndZeigen({ suche, art }) {
  let treffer = await api.datei.suchen(suche)
  if (art) {
    const passend = treffer.filter((t) => t.art === art)
    if (passend.length) treffer = passend
  }
  if (!treffer.length) return `Ich finde keine Datei mit dem Namen ${suche}.`
  letzteTreffer = treffer
  // Eindeutig (nur einer, oder der Name passt genau): gleich öffnen
  const genau = treffer.filter((t) => normal(t.name.replace(/\.[^.]+$/, '')) === normal(suche) || normal(t.name) === normal(suche))
  if (treffer.length === 1 || genau.length === 1) {
    const t = genau[0] || treffer[0]
    await dateiZeigen(t)
    return `Hier ist ${sprechName(t.name)}.`
  }
  listeZeigen(suche, treffer)
  return `Ich hab ${treffer.length} Dateien gefunden. Welche meinst du? Sag zum Beispiel: die erste.`
}

export async function trefferOeffnen(n) {
  const t = letzteTreffer[n - 1]
  if (!t) return ''
  await dateiZeigen(t)
  return `Hier ist ${sprechName(t.name)}.`
}

function oeffnenFalls() {
  const dialog = $('dateiansicht')
  if (!dialog.open) dialog.showModal()
}

function listeZeigen(suche, treffer) {
  offeneId = null
  const dialog = $('dateiansicht')
  dialog.dataset.modus = 'liste'
  $('da-name').textContent = `Gefunden: ${suche}`
  $('da-ort').textContent = 'Anklicken oder sagen, zum Beispiel „die erste“.'
  $('da-ordner').hidden = $('da-programm').hidden = true
  const inhalt = $('da-inhalt')
  inhalt.className = 'da-inhalt'
  inhalt.innerHTML = `<div class="da-liste">${treffer
    .map((t, i) => `<div class="da-treffer" tabindex="0" data-nr="${i + 1}"><span class="da-nr">${i + 1}</span><b>${maskieren(t.name)}</b><small>${maskieren(ortText(t))} · ${datum(t.geaendert)}</small></div>`)
    .join('')}</div>`
  oeffnenFalls()
  inhalt.querySelector('.da-treffer')?.focus()
}

async function dateiZeigen(treffer) {
  const d = await api.datei.inhalt(treffer.id)
  offeneId = d.id
  const dialog = $('dateiansicht')
  dialog.dataset.modus = 'datei'
  $('da-name').textContent = d.name
  $('da-ort').textContent = `${ortText(treffer)} · ${groesse(d.groesse)} · geändert ${datum(d.geaendert)}`
  $('da-ordner').hidden = $('da-programm').hidden = false
  const inhalt = $('da-inhalt')
  inhalt.className = `da-inhalt${['bild', 'video', 'audio'].includes(d.art) || d.art === 'andere' ? ' zentriert' : ''}`
  if (d.art === 'markdown') inhalt.innerHTML = `<div class="da-md">${markdownZuHtml(d.text.replace(/^---\n[\s\S]*?\n---\n/, ''))}</div>`
  else if (d.art === 'text') inhalt.innerHTML = `<pre class="da-text">${maskieren(d.text)}</pre>`
  else if (d.art === 'tabelle') inhalt.innerHTML = tabelle(d.text)
  else if (d.art === 'bild') inhalt.innerHTML = `<img src="${maskieren(d.url)}" alt="${maskieren(d.name)}" />`
  else if (d.art === 'pdf') inhalt.innerHTML = `<iframe src="${maskieren(d.url)}" title="${maskieren(d.name)}"></iframe>`
  else if (d.art === 'video') inhalt.innerHTML = `<video src="${maskieren(d.url)}" controls autoplay></video>`
  else if (d.art === 'audio') inhalt.innerHTML = `<audio src="${maskieren(d.url)}" controls autoplay></audio>`
  else
    inhalt.innerHTML = `<div class="da-hinweis">${maskieren(d.hinweis || 'Diese Art Datei kann Jarves-OS nicht selbst anzeigen.')}<br />Mit „Mit Programm öffnen“ geht sie im passenden Programm auf.</div>`
  oeffnenFalls()
}

// CSV/TSV als Tabelle (Trennzeichen raten: Semikolon, Tab oder Komma), höchstens 1.000 Zeilen
function tabelle(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim())
  const erste = zeilen[0] || ''
  const trenner = ['\t', ';', ','].sort((a, b) => erste.split(b).length - erste.split(a).length)[0]
  const zelle = (z) => {
    const teile = []
    let akt = ''
    let inAnf = false
    for (const c of z) {
      if (c === '"') inAnf = !inAnf
      else if (c === trenner && !inAnf) teile.push(akt), (akt = '')
      else akt += c
    }
    teile.push(akt)
    return teile
  }
  const kopf = zelle(erste)
  const rest = zeilen.slice(1, 1001)
  return `<table class="da-tabelle"><thead><tr>${kopf.map((k) => `<th>${maskieren(k)}</th>`).join('')}</tr></thead><tbody>${rest
    .map((z) => `<tr>${zelle(z).map((k) => `<td title="${maskieren(k)}">${maskieren(k)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>${zeilen.length > 1001 ? `<div class="da-hinweis">Nur die ersten 1.000 Zeilen.</div>` : ''}`
}

export function dateiansichtEinrichten({ beiFehler = () => {} } = {}) {
  const dialog = $('dateiansicht')
  $('da-zu').addEventListener('click', () => dialog.close())
  $('da-ordner').addEventListener('click', () => offeneId && api.datei.imOrdner(offeneId).catch((e) => beiFehler(e)))
  $('da-programm').addEventListener('click', () => offeneId && api.datei.mitProgramm(offeneId).catch((e) => beiFehler(e)))
  const waehlen = (el) => el && dateiZeigen(letzteTreffer[Number(el.dataset.nr) - 1]).catch((e) => beiFehler(e))
  $('da-inhalt').addEventListener('click', (e) => waehlen(e.target.closest('.da-treffer')))
  $('da-inhalt').addEventListener('keydown', (e) => e.key === 'Enter' && waehlen(e.target.closest('.da-treffer')))
  // Beim Schließen Videos/Musik anhalten
  dialog.addEventListener('close', () => {
    $('da-inhalt').innerHTML = ''
    offeneId = null
  })
}
