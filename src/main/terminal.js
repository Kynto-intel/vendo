// Terminal in Jarves-OS: eine echte PowerShell-Konsole über node-pty (wie das Terminal in VS Code).
// Die Oberfläche zeigt sie mit xterm.js (src/renderer/terminal.js). Farben, Tab, Pfeiltasten, Strg+C und
// interaktive Programme (hermes chat, hermes model …) laufen direkt darin.
// Nur Felix bedient das Terminal (Terminal-Bereich); Luzzy und die Plugins nutzen es nicht.
// Hermes liegt im PATH (hermes\bin), damit „hermes …“ ohne Pfad geht.

const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

const HERMES_BIN = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'bin')

let pty = null
let konsole = null
let groesse = { cols: 100, rows: 30 }

function umgebung() {
  return { ...process.env, PATH: `${HERMES_BIN};${process.env.PATH || ''}`, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
}

// Konsole starten (einmal; läuft weiter, auch wenn der Bereich gewechselt wird)
function starten(senden, cols, rows) {
  if (Number(cols) > 10 && Number(rows) > 3) groesse = { cols: Math.floor(cols), rows: Math.floor(rows) }
  if (konsole) return { laeuft: true }
  pty ??= require('node-pty')
  konsole = pty.spawn('powershell.exe', ['-NoLogo'], {
    name: 'xterm-256color',
    cols: groesse.cols,
    rows: groesse.rows,
    cwd: os.homedir(),
    env: umgebung(),
    useConpty: true
  })
  const diese = konsole
  diese.onData((d) => senden('terminal:daten', d))
  diese.onExit(({ exitCode }) => {
    if (konsole === diese) konsole = null
    senden('terminal:ende', { code: exitCode })
  })
  return { laeuft: true, neu: true }
}

function schreiben(text) {
  if (!konsole) return false
  konsole.write(String(text ?? ''))
  return true
}

function groesseSetzen(cols, rows) {
  if (!(Number(cols) > 10 && Number(rows) > 3)) return false
  groesse = { cols: Math.floor(cols), rows: Math.floor(rows) }
  try {
    konsole?.resize(groesse.cols, groesse.rows)
  } catch {
    // Konsole gerade beendet
  }
  return true
}

// Einen gespeicherten Befehl ausführen: wie getippt und Enter gedrückt
function befehl(text, senden) {
  if (!konsole) starten(senden)
  konsole.write(`${String(text || '').trim()}\r`)
  return true
}

function beenden() {
  if (!konsole) return false
  const k = konsole
  konsole = null
  try {
    k.kill()
  } catch {
    // schon weg
  }
  return true
}

// Normale PowerShell in einem eigenen Fenster (falls Felix eins neben Jarves-OS will)
function inFenster() {
  const kind = spawn('cmd.exe', ['/c', 'start', '"Jarves-OS Terminal"', 'powershell.exe', '-NoLogo'], { cwd: os.homedir(), env: umgebung(), detached: true, stdio: 'ignore' })
  kind.unref()
  return true
}

module.exports = { starten, schreiben, groesseSetzen, befehl, beenden, inFenster }
