// Terminal-Bereich: PowerShell in Jarves-OS, dazu die gängigen Hermes-Befehle zum Anklicken und eigene gespeicherte Befehle.
// Ausführen macht der Hauptprozess (src/main/terminal.js). Befehle, die etwas stoppen oder verändern, fragen vorher nach.
// Interaktive Programme (hermes chat, model, setup, update …) öffnen sich in einem eigenen Konsolenfenster.

import { bestaetigen } from './fenster.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Gängige Hermes-Befehle (geprüft mit hermes --help). vorsicht: vorher nachfragen · fenster: braucht ein echtes Konsolenfenster
const HERMES = [
  ['Status', [
    { name: 'Alles prüfen', befehl: 'hermes status', text: 'Status aller Teile von Hermes' },
    { name: 'Version & Updates', befehl: 'hermes --version', text: 'Installierte Version, ob ein Update da ist' },
    { name: 'Einstellungen prüfen', befehl: 'hermes doctor', text: 'Konfiguration und Abhängigkeiten' },
    { name: 'Nutzung 7 Tage', befehl: 'hermes insights --days 7', text: 'Tokens, Kosten, Werkzeuge, Aktivität' }
  ]],
  // Der Gateway gehört dem Standard-Profil (Hermes: „Manage it from the default profile“), daher -p default
  ['Gateway (Telegram & Co.)', [
    { name: 'Gateway-Status', befehl: 'hermes -p default gateway status' },
    { name: 'Gateway starten', befehl: 'hermes -p default gateway start', vorsicht: 'Den Gateway-Dienst starten?' },
    { name: 'Gateway stoppen', befehl: 'hermes -p default gateway stop', vorsicht: 'Den Gateway stoppen? Telegram & Co. antworten dann nicht mehr, bis du ihn wieder startest.' },
    { name: 'Gateway neu starten', befehl: 'hermes -p default gateway restart', vorsicht: 'Den Gateway neu starten? Laufende Antworten in Telegram & Co. brechen ab.' },
    { name: 'Gateways aller Profile', befehl: 'hermes -p default gateway list' }
  ]],
  ['Notbremse', [
    { name: 'Alles anhalten', befehl: 'hermes pause', text: 'Jobs, Kanban und neue Gateway-Antworten stoppen', vorsicht: 'Hermes anhalten? Geplante Jobs, Kanban und neue Antworten im Gateway stoppen, bis du „Weitermachen“ klickst.' },
    { name: 'Weitermachen', befehl: 'hermes resume', text: 'Notbremse lösen' }
  ]],
  ['Crew, Jobs & Skills', [
    { name: 'Profile (Bots)', befehl: 'hermes profile list' },
    { name: 'Gespräche – Überblick', befehl: 'hermes sessions stats' },
    { name: 'Geplante Jobs', befehl: 'hermes cron list' },
    { name: 'Job-Planer Status', befehl: 'hermes cron status' },
    { name: 'Installierte Skills', befehl: 'hermes skills list' }
  ]],
  ['Protokolle', [
    { name: 'Letzte Einträge', befehl: 'hermes logs -n 60' },
    { name: 'Nur Fehler', befehl: 'hermes logs errors -n 40' },
    { name: 'Gateway-Protokoll', befehl: 'hermes logs gateway -n 40' }
  ]],
  ['Wartung', [
    { name: 'Nach Update suchen', befehl: 'hermes update --check', text: 'Nur schauen, nichts installieren' },
    { name: 'Hermes aktualisieren', befehl: 'hermes update', text: 'Öffnet ein eigenes Fenster', vorsicht: 'Hermes jetzt aktualisieren? Hermes legt vorher selbst eine Sicherung an. Jarves-OS verbindet sich danach neu.' },
    { name: 'Sicherung anlegen', befehl: 'hermes backup --quick', text: 'Schnelle Sicherung von Einstellungen, Skills, Gesprächen', vorsicht: 'Eine Hermes-Sicherung (Zip) anlegen?' }
  ]]
]

// Braucht ein echtes Konsolenfenster (Menüs, Tastatur-Steuerung) oder läuft endlos
const INTERAKTIV = /^\s*hermes(?:\.exe)?\s*$|^\s*hermes(?:\.exe)?\s+(?:chat|model|setup|console|moa|portal|auth|login|dashboard|desktop|gui|serve|proxy|acp|tui)\b|^\s*hermes(?:\.exe)?\s+update(?![^\n]*--check)|^\s*hermes(?:\.exe)?\s+logs\b[^\n]*\s-f\b|^\s*hermes(?:\.exe)?\s+gateway\s+run\b/i
// Macht etwas kaputt, wenn man sich vertippt: vorher fragen
const RISKANT = /\b(?:uninstall|delete|remove|rm|purge|prune|reset|stop|pause|restart|import)\b|Remove-Item|\bdel\b|\brmdir\b|Format-|Stop-Process|shutdown/i

let h = { einstellungen: () => ({}), speichern: async () => {} }
let verlauf = []
let verlaufPos = -1
let laeuft = false
let jetzigeId = null

try {
  verlauf = JSON.parse(localStorage.getItem('terminal-verlauf') || '[]')
} catch {
  verlauf = []
}

function schreiben(text, art = 'aus') {
  const el = $('term-ausgabe')
  const unten = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  const span = document.createElement('span')
  span.className = `term-${art}`
  span.textContent = text
  el.appendChild(span)
  // nicht endlos wachsen lassen
  while (el.childNodes.length > 4000) el.removeChild(el.firstChild)
  if (unten) el.scrollTop = el.scrollHeight
}

function promptZeigen(ordner) {
  if (ordner) $('term-ordner').textContent = ordner
  $('term-prompt').textContent = laeuft ? '›' : `PS ${ordner || $('term-ordner').textContent}>`
  $('term-stopp').hidden = !laeuft
  $('term-feld').placeholder = laeuft ? 'Antwort an den laufenden Befehl (z. B. j) …' : 'Befehl eingeben, z. B. hermes status'
}

async function ausfuehren(befehl, { vorsicht = '' } = {}) {
  const text = String(befehl || '').trim()
  if (!text) return
  if (laeuft) return schreiben('Es läuft noch ein Befehl. Warte oder klick auf Stopp.\n', 'hinweis')
  const frage = vorsicht || (RISKANT.test(text) ? `„${text}“ ausführen? Der Befehl stoppt, löscht oder verändert etwas.` : '')
  if (frage && !(await bestaetigen(frage, { titel: 'Befehl ausführen', ja: 'Ausführen', gefahr: true }))) return
  verlauf = [text, ...verlauf.filter((v) => v !== text)].slice(0, 100)
  verlaufPos = -1
  try {
    localStorage.setItem('terminal-verlauf', JSON.stringify(verlauf))
  } catch {
    // egal
  }
  schreiben(`\n${$('term-prompt').textContent} ${text}\n`, 'befehl')
  if (INTERAKTIV.test(text)) {
    await window.jarves.terminal.fenster(text)
    schreiben('Läuft in einem eigenen Fenster (das Programm braucht eine echte Konsole).\n', 'hinweis')
    return
  }
  try {
    laeuft = true
    promptZeigen()
    const r = await window.jarves.terminal.ausfuehren(text)
    jetzigeId = r?.id ?? null
  } catch (e) {
    laeuft = false
    promptZeigen()
    schreiben(`${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}\n`, 'fehler')
  }
}

function hermesZeichnen() {
  $('term-hermes').innerHTML = HERMES.map(([gruppe, liste]) => `
    <div class="term-gruppe">${maskieren(gruppe)}</div>
    ${liste.map((b, i) => `<button class="term-befehl${b.vorsicht ? ' vorsicht' : ''}" type="button" data-gruppe="${maskieren(gruppe)}" data-i="${i}" title="${maskieren(b.befehl)}${b.text ? ` – ${maskieren(b.text)}` : ''}">
      <span class="term-befehl-name">${b.vorsicht ? '⚠ ' : ''}${maskieren(b.name)}</span><code>${maskieren(b.befehl)}</code></button>`).join('')}`).join('')
}

function eigeneZeichnen() {
  const liste = h.einstellungen()?.terminalBefehle || []
  $('term-eigene').innerHTML = liste.length
    ? liste.map((b, i) => `<div class="term-eigen"><button class="term-befehl" type="button" data-eigen="${i}" title="${maskieren(b.befehl)}"><span class="term-befehl-name">${maskieren(b.name)}</span><code>${maskieren(b.befehl)}</code></button><button class="knopf-mini gefahr" data-eigen-weg="${i}" type="button" title="Entfernen">✕</button></div>`).join('')
    : '<div class="leise klein">Noch keine. Befehl ins Feld tippen, dann „＋ Speichern“.</div>'
}

export function terminalLaden() {
  // Bereich wird geöffnet: Feld fokussieren, Ordner anzeigen
  window.jarves.terminal.stand().then((s) => {
    laeuft = s.laeuft
    promptZeigen(s.ordner)
  }).catch(() => {})
  setTimeout(() => $('term-feld')?.focus(), 50)
}

export function terminalEinrichten(helfer) {
  h = { ...h, ...helfer }
  hermesZeichnen()
  eigeneZeichnen()
  schreiben('Jarves-OS Terminal · PowerShell. „hermes …“ geht ohne Pfad. Rechts die gängigen Hermes-Befehle zum Anklicken.\n', 'hinweis')

  window.jarves.terminal.beiAusgabe((d) => schreiben(d.text, d.art === 'fehler' ? 'fehler' : 'aus'))
  window.jarves.terminal.beiEnde((d) => {
    laeuft = false
    jetzigeId = null
    if (d.code) schreiben(`(beendet mit Code ${d.code})\n`, 'hinweis')
    promptZeigen(d.ordner)
  })

  $('term-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const feld = $('term-feld')
    const text = feld.value
    feld.value = ''
    if (laeuft) {
      schreiben(`${text}\n`, 'befehl')
      await window.jarves.terminal.eingeben(text)
      return
    }
    if (text.trim() === 'cls' || text.trim() === 'clear') {
      $('term-ausgabe').replaceChildren()
      return
    }
    ausfuehren(text)
  })
  $('term-feld').addEventListener('keydown', (e) => {
    if (e.key === 'c' && e.ctrlKey && laeuft && !window.getSelection()?.toString()) {
      e.preventDefault()
      window.jarves.terminal.stoppen()
      schreiben('^C\n', 'hinweis')
    }
    if (laeuft || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    verlaufPos = Math.max(-1, Math.min(verlauf.length - 1, verlaufPos + (e.key === 'ArrowUp' ? 1 : -1)))
    e.target.value = verlaufPos < 0 ? '' : verlauf[verlaufPos]
  })
  $('term-stopp').addEventListener('click', () => window.jarves.terminal.stoppen())
  $('term-leeren').addEventListener('click', () => $('term-ausgabe').replaceChildren())
  $('term-fenster').addEventListener('click', () => window.jarves.terminal.fenster($('term-feld').value))
  $('term-ausgabe').addEventListener('click', () => !window.getSelection()?.toString() && $('term-feld').focus())

  $('term-hermes').addEventListener('click', (e) => {
    const k = e.target.closest('[data-gruppe]')
    if (!k) return
    const b = HERMES.find(([g]) => g === k.dataset.gruppe)?.[1][Number(k.dataset.i)]
    if (b) ausfuehren(b.befehl, { vorsicht: b.vorsicht })
  })
  // Eigene Befehle: speichern, ausführen, entfernen
  $('term-speichern').addEventListener('click', () => {
    if (!$('term-feld').value.trim()) return schreiben('Erst den Befehl ins Eingabefeld tippen, dann speichern.\n', 'hinweis')
    $('term-neu').hidden = false
    $('term-neu').name.focus()
  })
  $('term-neu').addEventListener('submit', async (e) => {
    e.preventDefault()
    const befehl = $('term-feld').value.trim()
    const name = e.target.name.value.trim() || befehl.slice(0, 40)
    if (!befehl) return
    const liste = [...(h.einstellungen()?.terminalBefehle || []), { name, befehl }].slice(-40)
    await h.speichern({ terminalBefehle: liste })
    e.target.reset()
    e.target.hidden = true
    eigeneZeichnen()
  })
  $('term-eigene').addEventListener('click', async (e) => {
    const weg = e.target.closest('[data-eigen-weg]')
    const liste = h.einstellungen()?.terminalBefehle || []
    if (weg) {
      const b = liste[Number(weg.dataset.eigenWeg)]
      if (!b || !(await bestaetigen(`Gespeicherten Befehl „${b.name}“ entfernen?`, { titel: 'Befehl entfernen', ja: 'Entfernen', gefahr: true }))) return
      await h.speichern({ terminalBefehle: liste.filter((_, i) => i !== Number(weg.dataset.eigenWeg)) })
      return eigeneZeichnen()
    }
    const k = e.target.closest('[data-eigen]')
    if (k) ausfuehren(liste[Number(k.dataset.eigen)]?.befehl)
  })
}
