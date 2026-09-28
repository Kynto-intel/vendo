// Suchleiste oben in der Kopfleiste (Strg+F): nach allem suchen, der Treffer öffnet sich in der App.
//   • Bots        → kleines Chat-Fenster unten rechts (crewchat.js), direkt mit dem Bot schreiben
//   • Bereiche, Routinen, Befehle → aus der Befehlspalette (palette.js), öffnet den Tab bzw. führt aus
//   • Notizen     → Vault (Wissen-Tab öffnet die Notiz)
//   • Dateien     → ganzer PC (Dateiansicht öffnet die Datei)
//   • zuletzt: „Luzzy fragen“ mit dem Suchtext
// Tippen zeigt sofort Bots und Befehle; Notizen und Dateien kommen kurz danach dazu.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const normal = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
const ART_SYMBOL = { bild: '🖼', pdf: '📕', video: '🎬', musik: '🎵', tabelle: '📊', text: '📄', notiz: '📝' }

let h = { api: null, befehle: () => [], bots: () => [], botsLaden: async () => [], botFenster: async () => false, dateiZeigen: async () => {}, notizOeffnen: () => {}, luzzy: () => {} }
let treffer = [] // [{ gruppe, name, hinweis, symbol, ausfuehren }]
let auswahl = 0
let nr = 0 // jede Eingabe bekommt eine Nummer: späte Antworten einer alten Suche verwerfen
let uhr = 0
let langsam = { notizen: [], dateien: [], laedt: false }

let botsGeholt = false
function schnelleTreffer(text) {
  const w = normal(text).split(/\s+/).filter(Boolean)
  // Bot-Liste noch nicht da (Crew-Tab nie offen, Hermes gerade erst verbunden): einmal holen, dann neu zeichnen
  if (!h.bots().length && !botsGeholt) {
    botsGeholt = true
    h.botsLaden()
      .then((b) => {
        if (!b?.length) botsGeholt = false // Hermes noch nicht bereit: beim nächsten Tippen nochmal versuchen
        else if ($('suche-eingabe').value.trim()) zeichnen()
      })
      .catch(() => (botsGeholt = false))
  }
  const bots = h.bots()
    .filter((b) => w.every((x) => normal(`${b.name} ${b.rolle || ''} ${b.profil}`).split(/[^a-z0-9]+/).some((t) => t.startsWith(x))))
    .map((b) => b.profil === 'donnerwolf'
      ? { gruppe: 'Bots', name: b.name, hinweis: 'ist hier in der Zentrale – einfach unten schreiben', symbol: 'L', ausfuehren: () => document.querySelector('.befehl .eingabe-text')?.focus() }
      : { gruppe: 'Bots', name: b.name, hinweis: `${b.rolle ? `${b.rolle} · ` : ''}Chat öffnen`, symbol: b.name.charAt(0), bot: b.profil, ausfuehren: () => h.botFenster(b.profil) })
  const befehle = h.befehle(text)
    .filter((b) => b.gruppe !== 'Tastenkürzel') // nur zum Nachschlagen, hier nicht nötig
    .slice(0, 7)
    .map((b) => ({ gruppe: b.gruppe === 'Bereich' ? 'Bereiche' : 'Befehle', name: b.name, hinweis: b.gruppe === 'Bereich' ? '' : b.gruppe, symbol: b.gruppe === 'Bereich' ? '▦' : '›', ausfuehren: b.ausfuehren }))
  // Bereiche vor den übrigen Befehlen
  return [...bots, ...befehle.filter((b) => b.gruppe === 'Bereiche'), ...befehle.filter((b) => b.gruppe === 'Befehle')]
}

function alleTreffer(text) {
  const t = text.trim()
  if (!t) return []
  const notizen = langsam.notizen.slice(0, 5).map((n) => ({ gruppe: 'Notizen', name: n.titel, hinweis: n.ausschnitt ? n.ausschnitt.slice(0, 80) : n.pfad, symbol: ART_SYMBOL.notiz, ausfuehren: () => h.notizOeffnen(n.pfad) }))
  const dateien = langsam.dateien.slice(0, 6).map((d) => ({ gruppe: 'Dateien', name: d.name, hinweis: d.ordner || d.ort || '', symbol: ART_SYMBOL[d.art] || '📄', ausfuehren: () => h.dateiZeigen(d) }))
  return [
    ...schnelleTreffer(t),
    ...notizen,
    ...dateien,
    { gruppe: 'Luzzy', name: `Luzzy fragen: „${t}“`, hinweis: langsam.laedt ? 'Notizen und Dateien werden noch gesucht …' : '', symbol: '✦', luzzy: true, ausfuehren: () => h.luzzy(t) }
  ]
}

function zeichnen() {
  const text = $('suche-eingabe').value
  treffer = alleTreffer(text)
  auswahl = Math.min(auswahl, Math.max(0, treffer.length - 1))
  const liste = $('suche-liste')
  if (!treffer.length) {
    liste.hidden = true
    return
  }
  let letzte = null
  liste.innerHTML = treffer
    .map((t, i) => {
      const kopf = t.gruppe !== letzte ? `<li class="suche-gruppe">${maskieren(t.gruppe)}</li>` : ''
      letzte = t.gruppe
      return `${kopf}<li class="suche-treffer${i === auswahl ? ' gewaehlt' : ''}${t.luzzy ? ' suche-luzzy' : ''}${t.bot ? ' suche-bot' : ''}" data-i="${i}">
        <span class="suche-symbol">${maskieren(t.symbol)}</span>
        <span class="suche-text"><b>${maskieren(t.name)}</b>${t.hinweis ? `<small>${maskieren(t.hinweis)}</small>` : ''}</span>
        ${t.bot ? '<span class="suche-aktion">💬 Chat</span>' : ''}
      </li>`
    })
    .join('')
  liste.hidden = false
  listeAusrichten()
  liste.querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' })
}

// Die Liste hängt unter der Kopfleiste (dort würde sie abgeschnitten): unter das Suchfeld schieben, mindestens 380 px breit
function listeAusrichten() {
  const liste = $('suche-liste')
  const r = $('suche-eingabe').getBoundingClientRect()
  const m = (liste.offsetParent || document.body).getBoundingClientRect()
  const breite = Math.min(Math.max(r.width, 380), m.width - 24)
  let links = r.left - m.left
  if (links + breite > m.width - 12) links = Math.max(12, m.width - 12 - breite)
  liste.style.left = `${links}px`
  liste.style.width = `${breite}px`
  liste.style.top = `${r.bottom - m.top + 6}px`
}

// Notizen und Dateien: kurz nach dem Tippen im Hintergrund suchen
function langsamSuchen(text) {
  clearTimeout(uhr)
  const meine = ++nr
  const t = text.trim()
  langsam = { notizen: [], dateien: [], laedt: t.length >= 2 }
  if (t.length < 2) return
  uhr = setTimeout(async () => {
    const [notizen, dateien] = await Promise.all([
      t.length >= 3 ? h.api.wissen.suchen(t).catch(() => []) : [],
      h.api.datei.suchen(t).catch(() => [])
    ])
    if (meine !== nr) return // inzwischen weitergetippt
    // Programm- und Hermes-Innereien (AppData) nicht anbieten, die will man hier nie öffnen
    const intern = (d) => /^(Local|LocalLow|Roaming)( ›|$)/.test(d.ordner || '') || /(site-packages|node_modules|__pycache__|.git)( ›|$)/.test(d.ordner || '') || /\.(db|db-wal|db-shm|lock|json)$/i.test(d.name)
    langsam = { notizen: notizen || [], dateien: (dateien || []).filter((d) => !intern(d) && (!d.ungefaehr || t.length > 4)), laedt: false }
    zeichnen()
  }, 280)
}

function ausfuehren(i) {
  const t = treffer[i]
  if (!t) return
  schliessen()
  Promise.resolve(t.ausfuehren()).catch((e) => console.warn('Suche:', e.message))
}

function schliessen() {
  $('suche-eingabe').value = ''
  $('suche-liste').hidden = true
  $('suche-eingabe').blur()
  treffer = []
}

export function sucheOeffnen() {
  $('suche-eingabe').focus()
  $('suche-eingabe').select()
}

export function sucheEinrichten(helfer) {
  h = { ...h, ...helfer }
  const feld = $('suche-eingabe')
  feld.addEventListener('input', () => {
    auswahl = 0
    langsamSuchen(feld.value)
    zeichnen()
  })
  feld.addEventListener('focus', () => feld.value.trim() && zeichnen())
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!treffer.length) return
      auswahl = (auswahl + (e.key === 'ArrowDown' ? 1 : -1) + treffer.length) % treffer.length
      zeichnen()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ausfuehren(auswahl)
    } else if (e.key === 'Escape') {
      schliessen()
    }
  })
  // mousedown statt click: sonst schließt das Verlassen des Feldes die Liste, bevor der Klick ankommt
  $('suche-liste').addEventListener('mousedown', (e) => {
    const z = e.target.closest('[data-i]')
    if (!z) return
    e.preventDefault()
    ausfuehren(Number(z.dataset.i))
  })
  feld.addEventListener('blur', () => setTimeout(() => ($('suche-liste').hidden = true), 120))
}
