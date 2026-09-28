// Terminal in Jarves-OS: Befehle in PowerShell ausführen, Ausgabe live an die Oberfläche.
// Nur Felix tippt oder klickt die Befehle (Terminal-Bereich); Luzzy und die Plugins nutzen das nicht.
// Jeder Befehl läuft in einer eigenen PowerShell, der Ordner (cd) wird zwischen den Befehlen gemerkt.
// Hermes liegt im PATH (hermes\bin), damit „hermes …“ ohne Pfad geht. Rückfragen (j/n) lassen sich beantworten.
// Interaktive Programme (hermes chat, hermes model, hermes setup …) öffnen sich in einem eigenen Fenster.

const { spawn, execFile } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const HERMES_BIN = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'bin')
const MARKE = '__JARVES_ORDNER__'

let ordner = os.homedir()
let laufend = null // { kind, id }
let naechsteId = 1

function umgebung() {
  return {
    ...process.env,
    PATH: `${HERMES_BIN};${process.env.PATH || ''}`,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    NO_COLOR: '1', // keine Farbcodes, die in der Anzeige als Zeichensalat landen
    TERM: 'dumb'
  }
}

// Farb- und Steuerzeichen entfernen (falls ein Programm sie trotzdem schickt)
const sauber = (t) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r(?!\n)/g, '\n')

function ausfuehren(befehl, senden) {
  if (laufend) throw new Error('Es läuft noch ein Befehl. Erst stoppen oder warten.')
  const text = String(befehl || '').trim()
  if (!text) return null
  const id = naechsteId++
  // Am Ende den aktuellen Ordner ausgeben, damit „cd“ wirkt wie in einem echten Terminal
  const skript = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; $OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Continue'; $ProgressPreference = 'SilentlyContinue'
# Fehler als Text mit in die Ausgabe (sonst schickt PowerShell ohne Konsole XML)
& { ${text} } 2>&1 | Out-String -Stream -Width 220
$__code = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }
Write-Output "${MARKE}$((Get-Location).Path)"
exit $__code`
  // Skript verschlüsselt übergeben (UTF-16LE, Base64): so bleibt die Eingabe frei für Antworten auf Rückfragen
  const kodiert = Buffer.from(skript, 'utf16le').toString('base64')
  const kind = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-InputFormat', 'Text', '-OutputFormat', 'Text', '-EncodedCommand', kodiert], {
    cwd: fs.existsSync(ordner) ? ordner : os.homedir(),
    env: umgebung(),
    windowsHide: true
  })
  laufend = { kind, id }
  let rest = ''
  const zeilen = (daten, art) => {
    let t = sauber(daten.toString('utf8'))
    if (art === 'aus') {
      t = rest + t
      const i = t.lastIndexOf('\n')
      rest = i >= 0 ? t.slice(i + 1) : t // halbe Zeile aufheben (könnte die Ordner-Marke sein)
      t = i >= 0 ? t.slice(0, i + 1) : ''
      t = t.split('\n').filter((z) => {
        if (!z.startsWith(MARKE)) return true
        ordner = z.slice(MARKE.length).trim() || ordner
        return false
      }).join('\n')
    }
    if (t) senden('terminal:ausgabe', { id, text: t, art })
  }
  kind.stdout.on('data', (d) => zeilen(d, 'aus'))
  kind.stderr.on('data', (d) => zeilen(d, 'fehler'))
  kind.on('close', (code) => {
    if (rest) {
      if (rest.startsWith(MARKE)) ordner = rest.slice(MARKE.length).trim() || ordner
      else senden('terminal:ausgabe', { id, text: rest, art: 'aus' })
    }
    if (laufend?.id === id) laufend = null
    senden('terminal:ende', { id, code, ordner })
  })
  kind.on('error', (e) => {
    if (laufend?.id === id) laufend = null
    senden('terminal:ausgabe', { id, text: `PowerShell ließ sich nicht starten: ${e.message}\n`, art: 'fehler' })
    senden('terminal:ende', { id, code: -1, ordner })
  })
  // stdin bleibt offen: Rückfragen („Fortfahren? [j/n]“) beantwortet Felix über das Eingabefeld
  return { id, ordner }
}

// Antwort auf eine Rückfrage des laufenden Befehls
function eingeben(text) {
  if (!laufend) return false
  laufend.kind.stdin.write(`${String(text ?? '')}\n`)
  return true
}

function stoppen() {
  if (!laufend) return false
  const { kind } = laufend
  execFile('taskkill', ['/pid', String(kind.pid), '/T', '/F'], { windowsHide: true }, () => {})
  return true
}

// Interaktive Programme brauchen ein echtes Konsolenfenster
function inFenster(befehl) {
  const text = String(befehl || '').trim()
  const cwd = fs.existsSync(ordner) ? ordner : os.homedir()
  const kind = spawn('cmd.exe', ['/c', 'start', '"Jarves-OS Terminal"', 'powershell.exe', '-NoLogo', '-NoExit', '-Command', text || 'Write-Host "Jarves-OS Terminal"'], {
    cwd, env: umgebung(), detached: true, stdio: 'ignore', windowsHide: false
  })
  kind.unref()
  return true
}

const stand = () => ({ ordner, laeuft: Boolean(laufend) })

module.exports = { ausfuehren, eingeben, stoppen, inFenster, stand }
