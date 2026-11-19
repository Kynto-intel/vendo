// Terminal in Vendo: eine echte PowerShell-Konsole über node-pty (wie das Terminal in VS Code).
// Die Oberfläche zeigt sie mit xterm.js (src/renderer/terminal.js). Farben, Tab, Pfeiltasten, Strg+C und
// interaktive Programme (hermes chat, hermes model …) laufen direkt darin.
// Nur Felix bedient das Terminal (Terminal-Bereich); Luzzy und die Plugins nutzen es nicht.
// Hermes liegt im PATH (hermes\bin), damit „hermes …“ ohne Pfad geht.

const path = require('node:path')
const os = require('node:os')

const HERMES_BIN = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'bin')
// „Meine Befehle“: eigene Datei, leicht zu lesen und von Hand zu bearbeiten (Vendo dabei geschlossen lassen)

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

// Gespeicherte Befehle lesen. Noch keine Datei: frühere Befehle aus den Einstellungen übernehmen (einmalig),
// sonst null (dann zeigt die Oberfläche die Standardbefehle).
function befehleLaden() {
  const liste = require('./vendospeicher').lesen('terminal-befehle')
  if (Array.isArray(liste)) return liste
  const einstellungen = require('./einstellungen')
  const alt = einstellungen.laden().terminalBefehle
  if (Array.isArray(alt)) {
    befehleSpeichern(alt)
    einstellungen.speichern({ terminalBefehle: undefined }) // steht jetzt in der eigenen Datei
    return alt
  }
  return null
}

function befehleSpeichern(liste) {
  const sauber = (Array.isArray(liste) ? liste : [])
    .filter((b) => b && typeof b.befehl === 'string' && b.befehl.trim())
    .slice(0, 100)
    .map((b) => ({ name: String(b.name || b.befehl).slice(0, 60), befehl: String(b.befehl).trim().slice(0, 1000) }))
  require('./vendospeicher').schreiben('terminal-befehle', sauber) // PostgreSQL mit Startkopie
  return sauber
}

module.exports = { starten, schreiben, groesseSetzen, befehl, beenden, befehleLaden, befehleSpeichern }
