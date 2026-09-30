// Hermes-Gateway (Telegram & Co.) beim Start von Jarves-OS mit hochfahren, damit die Hermes-App nicht offen sein muss.
// Nur Hermes' eigener Befehl `hermes gateway start`: Er startet den einen Gateway für alle Profile losgelöst im
// Hintergrund (er läuft also weiter, wenn Jarves-OS zugeht) und tut nichts, wenn schon einer läuft.
// Der Gateway gehört dem Standard-Profil, daher -p default (wie bei den Terminal-Befehlen).

const path = require('node:path')
const { execFile } = require('node:child_process')

const HERMES_HOME = path.join(process.env.LOCALAPPDATA || '', 'hermes')
const HERMES_EXE = path.join(HERMES_HOME, 'bin', 'hermes.exe')

function starten() {
  return new Promise((fertig) => {
    execFile(HERMES_EXE, ['-p', 'default', 'gateway', 'start'], {
      cwd: HERMES_HOME,
      windowsHide: true,
      timeout: 120000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' }
    }, (e, aus, err) => {
      const text = `${aus || ''}\n${err || ''}`.replace(/\x1b\[[0-9;]*m/g, '').trim()
      const ok = !e && !/FAILED|✗ Gateway start/.test(text)
      fertig({ ok, text: text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean).slice(-3).join(' ') || (e && e.message) || '' })
    })
  })
}

module.exports = { starten }
