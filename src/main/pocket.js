// Pocket TTS (Kyutai): Luzzys Stimme. Läuft komplett auf Felix' PC, kein Text geht ins Internet.
// Vendo startet dafür `uvx pocket-tts serve --language german` im Hintergrund (nur auf 127.0.0.1)
// und beendet ihn beim Schließen wieder. Eigene Stimme: eine kurze, saubere Aufnahme (WAV, 10 bis 30 s),
// nur von jemandem, der zugestimmt hat. Nichts davon ändert Hermes.

const { spawn, execFile } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

// Weibliche Stimmen von Pocket TTS. Das deutsche Modell hat für jede eine fertige Stimmprobe (Embedding), sie sprechen
// also alle Deutsch. Die Sprecherinnen stammen aus anderen Sprachen, ein leichter Akzent ist möglich.
const STIMMEN = [
  { id: 'alba', name: 'Alba' },
  { id: 'anna', name: 'Anna' },
  { id: 'azelma', name: 'Azelma' },
  { id: 'caro_davy', name: 'Caro' },
  { id: 'cosette', name: 'Cosette' },
  { id: 'eponine', name: 'Eponine' },
  { id: 'estelle', name: 'Estelle' },
  { id: 'eve', name: 'Eve' },
  { id: 'fantine', name: 'Fantine' },
  { id: 'jane', name: 'Jane' },
  { id: 'lola', name: 'Lola' },
  { id: 'mary', name: 'Mary' },
  { id: 'vera', name: 'Vera' }
].map((s) => ({ ...s, herkunft: 'lokal' }))
const EIGEN = { id: 'eigen', name: 'Eigene Stimme', herkunft: 'Aufnahme' }
const STANDARD_STIMME = 'alba'
// Alte Einstellungen (Edge-Stimmen, „pocket“ = Jürgen) auf eine gültige Stimme bringen
const stimmeGueltig = (id) => (id === 'pocket-eigen' ? 'eigen' : id === 'eigen' || STIMMEN.some((s) => s.id === id) ? id : STANDARD_STIMME)

const TEST = process.env.VENDO_TEST_POCKET // Testmodus: Adresse eines schon laufenden Servers, z. B. http://127.0.0.1:8765
const START_ZEIT = 10 * 60 * 1000 // erster Start lädt Programm und Modell herunter, das dauert
const ENDUNGEN = /\.(wav|mp3|flac|ogg|m4a|safetensors)$/i

let prozess = null
let adresse = null
let startet = null // Promise, solange der Server hochfährt
let stimmeGestartet = null
let letzterFehler = ''
let protokoll = ''

// uvx finden: erst im PATH, sonst dort, wo der uv-Installer es hinlegt
function uvxPfad() {
  const kandidaten = process.platform === 'win32'
    ? [path.join(os.homedir(), '.local', 'bin', 'uvx.exe'), path.join(os.homedir(), '.cargo', 'bin', 'uvx.exe')]
    : [path.join(os.homedir(), '.local', 'bin', 'uvx'), path.join(os.homedir(), '.cargo', 'bin', 'uvx')]
  return kandidaten.find((k) => fs.existsSync(k)) || 'uvx'
}

function freierPort() {
  return new Promise((fertig, fehler) => {
    const s = net.createServer()
    s.unref()
    s.on('error', fehler)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => fertig(port))
    })
  })
}

async function gesund(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

function stimmDatei(datei) {
  const d = String(datei || '').trim()
  return d && ENDUNGEN.test(d) && fs.existsSync(d) ? d : ''
}

// Reste aufräumen: Wurde Vendo hart beendet (Absturz, Task-Manager), läuft sein Pocket-TTS-Server weiter und
// belegt pro Stück rund 150 MB. Einmal pro Start alle Pocket-Server beenden, deren Vendo nicht mehr läuft
// (Elternprozess weg). Pocket TTS nutzt auf diesem PC nur Vendo.
let aufgeraeumt = null
function resteAufraeumen() {
  if (aufgeraeumt) return aufgeraeumt
  if (process.platform !== 'win32') return (aufgeraeumt = Promise.resolve())
  // Für jeden Pocket-Prozess die Kette der Eltern hochgehen (Pocket-Prozesse und Konsolen-Hüllen überspringen):
  // Kommt oben kein lebender anderer Prozess (uvx/Vendo), ist er verwaist und wird beendet.
  const skript = `$a = @{}; Get-CimInstance Win32_Process | % { $a[[int]$_.ProcessId] = $_ }
foreach ($p in @($a.Values | ? { $_.CommandLine -like '*pocket-tts*serve*--language german*' })) {
  $e = $a[[int]$p.ParentProcessId]
  while ($e -and ($e.CommandLine -like '*pocket-tts*' -or $e.Name -eq 'conhost.exe')) { $e = $a[[int]$e.ParentProcessId] }
  if (-not $e) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
}`
  aufgeraeumt = new Promise((fertig) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', skript], { windowsHide: true, timeout: 20000 }, () => fertig()))
  return aufgeraeumt
}

function starten(datei) {
  const stimme = stimmDatei(datei)
  if (TEST) return gesund(TEST).then((ok) => (ok ? (adresse = TEST) : Promise.reject(new Error('Pocket TTS (Test) antwortet nicht.'))))
  if (adresse && stimme === stimmeGestartet && prozess) return Promise.resolve(adresse)
  if (startet && stimme === stimmeGestartet) return startet
  stoppen()
  stimmeGestartet = stimme
  letzterFehler = ''
  protokoll = ''
  startet = (async () => {
    await resteAufraeumen()
    const port = await freierPort()
    const url = `http://127.0.0.1:${port}`
    const argumente = ['pocket-tts', 'serve', '--language', 'german', '--host', '127.0.0.1', '--port', String(port)]
    argumente.push('--default-voice', stimme || STANDARD_STIMME)
    // PYTHONUTF8: sonst scheitert Pocket TTS unter Windows beim Lesen seiner deutschen Einstellungsdatei (cp1252)
    const p = spawn(uvxPfad(), argumente, {
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    prozess = p
    const mitschreiben = (d) => (protokoll = (protokoll + d).slice(-4000))
    p.stdout.on('data', mitschreiben)
    p.stderr.on('data', mitschreiben)
    const beendet = new Promise((r) => {
      p.on('error', (e) => r(e.code === 'ENOENT' ? 'uv ist nicht installiert (uvx fehlt).' : e.message))
      p.on('exit', (code) => r(`Pocket TTS wurde beendet (Code ${code}).`))
    })
    let vorbei = null
    beendet.then((grund) => {
      vorbei = grund
      if (prozess === p) {
        prozess = null
        adresse = null
        letzterFehler = fehlerText(grund)
      }
    })
    const bis = Date.now() + START_ZEIT
    while (Date.now() < bis) {
      if (vorbei) throw new Error(fehlerText(vorbei))
      if (await gesund(url)) {
        adresse = url
        return url
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    stoppen()
    throw new Error('Pocket TTS ist nicht rechtzeitig gestartet.')
  })()
  const meins = startet
  startet.catch((e) => (letzterFehler = e.message)).finally(() => startet === meins && (startet = null))
  return startet
}

// Verständlicher Grund aus der Ausgabe von Pocket TTS (ohne Pfade oder Schlüssel weiterzugeben)
function fehlerText(grund) {
  if (/gated|401|403|accept the terms|Cannot access gated repo/i.test(protokoll)) return 'Für eigene Stimmen braucht Pocket TTS die Hugging-Face-Freigabe (Bedingungen zustimmen, dann uvx hf auth login).'
  if (/UnicodeDecodeError/.test(protokoll)) return 'Pocket TTS: Zeichensatz-Fehler beim Start.'
  if (/No such file|FileNotFoundError|could not be loaded|Error opening/i.test(protokoll)) return 'Pocket TTS kann die Stimm-Datei nicht lesen.'
  return grund
}

function stoppen() {
  const p = prozess
  prozess = null
  adresse = null
  startet = null
  if (!p || p.exitCode !== null) return
  // uvx startet Python als eigenen Prozess: unter Windows den ganzen Baum beenden, sonst bleibt der Port belegt
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {})
  else p.kill()
}

// WAV kommt gestreamt: im Kopf steht dann keine echte Länge. Hier nachtragen, damit jeder Player sie sauber abspielt.
function wavReparieren(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return buf
  buf.writeUInt32LE(buf.length - 8, 4)
  let pos = 12
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    if (id === 'data') {
      buf.writeUInt32LE(buf.length - pos - 8, pos + 4)
      break
    }
    pos += 8 + buf.readUInt32LE(pos + 4)
  }
  return buf
}

// stimme: eine aus STIMMEN oder 'eigen' (dann spricht die Aufnahme, mit der der Server gestartet wurde)
async function sprechen(text, { stimme = STANDARD_STIMME, datei } = {}) {
  stimme = stimmeGueltig(stimme)
  const url = await starten(stimme === 'eigen' ? datei : '')
  const form = new FormData()
  form.append('text', text)
  if (stimme !== 'eigen' || !stimmDatei(datei)) form.append('voice_url', stimme === 'eigen' ? STANDARD_STIMME : stimme)
  const r = await fetch(`${url}/tts`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error(`Pocket TTS meldet ${r.status}.`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length <= 44) throw new Error('Pocket TTS: keine Audiodaten erhalten.')
  return wavReparieren(buf)
}

function zustand() {
  if (adresse) return { zustand: 'bereit', text: stimmeGestartet ? `läuft (eigene Stimme: ${path.basename(stimmeGestartet)})` : 'läuft' }
  if (startet) return { zustand: 'startet', text: 'startet … (beim ersten Mal lädt es das Modell, das kann ein paar Minuten dauern)' }
  if (letzterFehler) return { zustand: 'fehler', text: letzterFehler }
  return { zustand: 'aus', text: 'aus' }
}

module.exports = { starten, stoppen, sprechen, zustand, bereit: () => !!adresse, stimmDatei, STIMMEN, EIGEN, stimmeGueltig }
