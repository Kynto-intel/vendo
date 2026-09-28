// Läuft gerade Musik oder ein Video auf dem PC (Spotify, YouTube im Browser, Media Player …)?
// Windows kennt das über seine Mediensteuerung (die gleiche, die beim Lautstärke-Regler den Titel zeigt).
// Ein kleines PowerShell-Skript fragt alle 2 Sekunden nach und meldet Änderungen („spielt“ / „still“).
// Nur lesen, nichts steuern. Jarves-OS nutzt das, damit Musik nicht als Sprache verstanden wird.

const { spawn } = require('node:child_process')

const SKRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $op = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
  $t = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $mgr = $t.Result
} catch { Write-Output 'fehler'; exit 1 }
$letzter = ''
while ($true) {
  $spielt = $false
  try { foreach ($s in $mgr.GetSessions()) { if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { $spielt = $true } } } catch {}
  $jetzt = if ($spielt) { 'spielt' } else { 'still' }
  if ($jetzt -ne $letzter) { Write-Output $jetzt; $letzter = $jetzt }
  Start-Sleep -Seconds 2
}
`

// beiAenderung(spielt: boolean). Gibt eine Stopp-Funktion zurück.
function musikBeobachten(beiAenderung) {
  if (process.platform !== 'win32') return () => {}
  let kind = null
  let aus = false
  const starten = () => {
    if (aus) return
    kind = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SKRIPT], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let rest = ''
    kind.stdout.on('data', (d) => {
      rest += d.toString()
      const zeilen = rest.split(/\r?\n/)
      rest = zeilen.pop()
      for (const z of zeilen.map((x) => x.trim())) {
        if (z === 'spielt') beiAenderung(true)
        if (z === 'still') beiAenderung(false)
      }
    })
    kind.on('exit', (code) => {
      kind = null
      beiAenderung(false)
      if (!aus && code !== 1) setTimeout(starten, 10000) // abgestürzt: später nochmal (1 = geht auf diesem PC nicht)
    })
  }
  starten()
  return () => {
    aus = true
    kind?.kill()
  }
}

module.exports = { musikBeobachten }
