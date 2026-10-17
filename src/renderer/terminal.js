// Terminal-Bereich: echte PowerShell-Konsole mit xterm.js (Anzeige) und node-pty (Hauptprozess, src/main/terminal.js),
// wie das Terminal in VS Code. Rechts „Meine Befehle“: eine Liste, jeder Befehl lässt sich löschen, eigene kommen dazu.
// Befehle, die etwas stoppen oder verändern, fragen vor dem Ausführen nach.

import { Terminal } from '../../node_modules/@xterm/xterm/lib/xterm.mjs'
import { FitAddon } from '../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs'
import { bestaetigen } from './fenster.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Startliste (Felix' Wunsch: nur wenige). Der Gateway gehört dem Standard-Profil, daher -p default.
const STANDARD = [
  { name: 'Hermes-Status', befehl: 'hermes status' },
  { name: 'Gateway-Status', befehl: 'hermes -p default gateway status' },
  { name: 'Gateway neu starten', befehl: 'hermes -p default gateway restart' },
  { name: 'Nach Update suchen', befehl: 'hermes update --check' },
  { name: 'Nur Fehler', befehl: 'hermes logs errors -n 40' }
]
// Macht etwas kaputt, wenn man sich verklickt: vorher fragen
const RISKANT = /\b(?:uninstall|delete|remove|rm|purge|prune|reset|stop|restart|pause|import|update(?![^\n]*--check))\b|Remove-Item|\bdel\b|\brmdir\b|Format-|Stop-Process|shutdown/i

let gespeichert = null // aus daten/terminal-befehle.json (null: noch keine Datei → Standardbefehle)
let term = null
let fit = null
let gestartet = false

// Terminal-Farben: Akzent (Cursor, Markierung, Gelb) aus dem Design, der Rest fest
function terminalFarben() {
  const css = getComputedStyle(document.documentElement)
  const wert = (name, ersatz) => css.getPropertyValue(name).trim() || ersatz
  return {
    background: '#09090b', foreground: '#d9d4c8', cursor: wert('--gold', '#c9a14a'), cursorAccent: '#09090b',
    selectionBackground: `rgba(${wert('--akzent-rgb', '201, 161, 74')}, 0.35)`,
    black: '#1b1b1e', red: '#e07a70', green: '#7fb069', yellow: wert('--gold-hell', '#e3be6c'), blue: '#6fa3d8', magenta: '#c792ea', cyan: '#6fc3c3', white: '#d9d4c8',
    brightBlack: '#5c5a55', brightRed: '#f08c82', brightGreen: '#95c77f', brightYellow: '#f0cf85', brightBlue: '#8bb8e8', brightMagenta: '#d7a8f5', brightCyan: '#8ad6d6', brightWhite: '#f2ede2'
  }
}

const liste = () => gespeichert ?? STANDARD
async function listeSpeichern(neu) {
  gespeichert = await window.vendo.terminal.befehleSpeichern(neu)
  listeZeichnen()
}
const fehlertext = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function listeZeichnen() {
  const l = liste()
  $('term-liste').innerHTML = l.length
    ? l.map((b, i) => `<div class="term-eigen">
        <button class="term-befehl${RISKANT.test(b.befehl) ? ' vorsicht' : ''}" type="button" data-nr="${i}" title="${maskieren(b.befehl)}"><span class="term-befehl-name">${RISKANT.test(b.befehl) ? '⚠ ' : ''}${maskieren(b.name)}</span><code>${maskieren(b.befehl)}</code></button>
        <button class="knopf-mini gefahr term-weg" data-weg="${i}" type="button" title="Aus der Liste löschen">✕</button>
      </div>`).join('')
    : '<div class="leise klein">Keine Befehle gespeichert. Unten einen eintragen.</div>'
}

// Anzeige und Konsole müssen gleich viele Zeilen und Spalten haben, sonst zeichnet PowerShell die Eingabezeile
// an der falschen Stelle (z. B. ganz unten). Daher nach jeder Größenänderung, nach dem Laden der Schrift und
// kurz nach dem Start die genaue Größe an die Konsole geben.
function anpassen() {
  if (!term || !$('term-xterm').offsetParent) return // Bereich nicht sichtbar: nichts messen
  fit.fit()
  if (gestartet) window.vendo.terminal.groesse(term.cols, term.rows)
}

async function konsoleStarten() {
  if (gestartet) return
  gestartet = true
  await document.fonts?.ready // erst messen, wenn die Schrift da ist (sonst stimmen Zeilen und Spalten nicht)
  fit.fit()
  try {
    await window.vendo.terminal.starten(term.cols, term.rows)
    setTimeout(anpassen, 250)
  } catch (e) {
    gestartet = false
    term.writeln(`\x1b[31mDie Konsole ließ sich nicht starten: ${fehlertext(e)}\x1b[0m`)
  }
}

async function ausfuehren(b) {
  if (RISKANT.test(b.befehl) && !(await bestaetigen(`„${b.name}“ ausführen?\n\n${b.befehl}\n\nDer Befehl stoppt, löscht oder verändert etwas.`, { titel: 'Befehl ausführen', ja: 'Ausführen', gefahr: true }))) return
  await konsoleStarten()
  await window.vendo.terminal.befehl(b.befehl)
  term.focus()
}

// Bereich wird geöffnet: Konsole starten (beim ersten Mal), Größe anpassen, Tastatur ins Terminal
export function terminalLaden() {
  requestAnimationFrame(async () => {
    await konsoleStarten()
    anpassen()
    term.focus()
  })
}

export function terminalEinrichten() {
  term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    theme: terminalFarben()
  })
  // Design gewechselt (Einstellungen → Aussehen): Cursor und Markierung in der neuen Akzentfarbe
  document.addEventListener('design-geaendert', () => term && (term.options.theme = terminalFarben()))
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open($('term-xterm'))

  // Strg+C: markierter Text wird kopiert, sonst geht Strg+C an die Konsole (bricht ab). Strg+V fügt ein.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || e.altKey) return true
    const taste = e.key.toLowerCase()
    if (taste === 'c' && term.hasSelection()) {
      window.vendo.zwischenablage.schreiben(term.getSelection()).catch(() => {}) // über Electron, navigator.clipboard ist gesperrt
      term.clearSelection()
      return false
    }
    if (taste === 'v') {
      window.vendo.zwischenablage.lesen().then((t) => t && window.vendo.terminal.schreiben(t)).catch(() => {})
      return false
    }
    // Strg+F, Strg+P usw. gehören Vendo (Suche, Befehlspalette), nicht der Konsole
    return !['f', 'p', 'k', 'b', 'j'].includes(taste)
  })
  term.onData((d) => window.vendo.terminal.schreiben(d))
  window.vendo.terminal.beiDaten((d) => term.write(d))
  window.vendo.terminal.beiEnde(() => {
    gestartet = false
    term.writeln('\r\n\x1b[90m[Konsole beendet – „↻ Neu“ oder einen Befehl anklicken startet sie wieder]\x1b[0m')
  })
  // Größe mitziehen (Fenster, Leisten ein-/ausklappen)
  let takt = 0
  new ResizeObserver(() => {
    clearTimeout(takt)
    takt = setTimeout(anpassen, 60) // beim Ziehen am Fenster nicht bei jedem Pixel
  }).observe($('term-xterm'))
  document.fonts?.ready.then(anpassen)

  // Kein „Leeren“-Knopf: er leerte nur die Anzeige, die Konsole wusste nichts davon und schrieb dann versetzt.
  // Leeren geht mit „cls“ in der Konsole (leert beides).
  $('term-neu-start').addEventListener('click', async () => {
    await window.vendo.terminal.neu()
    gestartet = false
    term.reset()
    await konsoleStarten()
    term.focus()
  })

  // Meine Befehle: aus der eigenen Datei laden, dann ausführen, löschen, speichern, Standard wiederherstellen
  listeZeichnen()
  window.vendo.terminal.befehle().then((l) => {
    gespeichert = Array.isArray(l) ? l : null
    listeZeichnen()
  }).catch(() => {})
  $('term-liste').addEventListener('click', async (e) => {
    const weg = e.target.closest('[data-weg]')
    const l = liste()
    if (weg) {
      const b = l[Number(weg.dataset.weg)]
      if (!b || !(await bestaetigen(`„${b.name}“ aus deinen Befehlen löschen?`, { titel: 'Befehl löschen', ja: 'Löschen', gefahr: true }))) return
      return listeSpeichern(l.filter((_, i) => i !== Number(weg.dataset.weg)))
    }
    const k = e.target.closest('[data-nr]')
    if (k && l[Number(k.dataset.nr)]) ausfuehren(l[Number(k.dataset.nr)])
  })
  $('term-neu').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = e.target
    const befehl = f.befehl.value.trim()
    if (!befehl) return f.befehl.focus()
    const name = f.name.value.trim() || befehl.slice(0, 40)
    await listeSpeichern([...liste(), { name, befehl }])
    f.reset()
  })
  $('term-standard').addEventListener('click', async () => {
    const l = liste()
    const fehlen = STANDARD.filter((s) => !l.some((b) => b.befehl === s.befehl))
    if (!fehlen.length) return
    await listeSpeichern([...l, ...fehlen])
  })
}
