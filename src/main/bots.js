// Neue Bots (Hermes-Profile) direkt aus Jarves-OS anlegen – nur mit Hermes' eigenem Befehl `hermes profile create`,
// am Hermes-Programm wird nichts verändert. Ein Profil ist update-fest (liegt unter hermes\profiles\<id>\).
//   • Einstellungen (Modell, Zugänge, Skills) kommen von einem bestehenden Bot (--clone-from), ohne Messenger-Kanäle
//   • Beschreibung: sagt Luzzy im Bot Mode, wofür der Bot da ist (Hermes nimmt jedes Profil automatisch ins Team)
//   • Charakter und Aufgaben: SOUL.md des neuen Bots · Bild: assets\avatar.png (wie bei Kira, Lira, Milla)

const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')

const HERMES_HOME = path.join(process.env.LOCALAPPDATA || '', 'hermes')
const HERMES_EXE = path.join(HERMES_HOME, 'bin', 'hermes.exe')
const PROFIL = /^[a-z0-9][a-z0-9_-]{0,63}$/

// „Freya“ + „Social Media“ → freya-social-media-bot (daraus liest Jarves-OS später wieder Name und Rolle)
function profilId(name, rolle) {
  const teil = (t) => String(t || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const id = [teil(name), teil(rolle), 'bot'].filter(Boolean).join('-').replace(/-+/g, '-').slice(0, 60)
  return id
}

function hermes(argumente) {
  return new Promise((fertig, fehler) => {
    execFile(HERMES_EXE, argumente, { windowsHide: true, timeout: 180000, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' } }, (e, aus, err) => {
      if (e) return fehler(new Error(String(err || aus || e.message).replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-3).join(' ')))
      fertig(String(aus || ''))
    })
  })
}

function seele({ name, rolle, aufgaben, andere }) {
  return `Du bist ${name}${rolle ? `, der ${rolle}-Bot` : ''} von Donnerwolf, einem Shopify-Shop für Wikinger- und Norse-Kleidung. Felix ist der Inhaber. Du schreibst immer auf Deutsch.

# DEINE ROLLE
${String(aufgaben || '').trim() || `Du unterstützt Felix und die Crew als ${rolle || 'Helfer'}.`}

# REGELN
- Nichts veröffentlichen und nichts im Shop ändern ohne Felix' ausdrückliches Ja.
- Bleib bei deiner Aufgabe. Was nicht deine Aufgabe ist, gibst du an den passenden Bot weiter oder sagst, wer zuständig ist.
- Antworte klar und auf den Punkt.

# ANDERE BOTS
${andere.map((b) => `- **${b.name}**${b.rolle ? ` (${b.rolle})` : ''} – Profil: \`${b.profil}\``).join('\n')}
`
}

async function botAnlegen({ name, rolle, beschreibung, aufgaben, vorlage, bild, andere = [] }) {
  name = String(name || '').trim().slice(0, 40)
  rolle = String(rolle || '').trim().slice(0, 40)
  if (!name) throw new Error('Bitte einen Namen eintragen.')
  const id = profilId(name, rolle)
  if (!PROFIL.test(id) || id.length < 3) throw new Error('Aus dem Namen lässt sich kein gültiges Profil machen. Bitte nur Buchstaben und Zahlen verwenden.')
  const ordner = path.join(HERMES_HOME, 'profiles', id)
  if (fs.existsSync(ordner)) throw new Error(`Einen Bot „${id}“ gibt es schon.`)
  const quelle = String(vorlage || '')
  if (quelle && !PROFIL.test(quelle)) throw new Error('Unbekannte Vorlage.')
  if (quelle && !fs.existsSync(path.join(HERMES_HOME, 'profiles', quelle))) throw new Error(`Die Vorlage „${quelle}“ gibt es nicht.`)

  const argumente = ['profile', 'create', id, '--no-alias']
  if (quelle) argumente.push('--clone-from', quelle)
  const text = String(beschreibung || '').trim().slice(0, 400)
  if (text) argumente.push('--description', text)
  await hermes(argumente)
  if (!fs.existsSync(ordner)) throw new Error('Hermes hat den Bot nicht angelegt.')

  // Charakter und Aufgaben (ersetzt die von der Vorlage kopierte SOUL.md)
  fs.writeFileSync(path.join(ordner, 'SOUL.md'), seele({ name, rolle, aufgaben, andere: andere.filter((b) => b && PROFIL.test(b.profil)) }), 'utf8')

  // Bild (optional): als PNG nach assets\avatar.png, höchstens 512 px
  if (bild) {
    const { nativeImage } = require('electron')
    let img = nativeImage.createFromPath(String(bild))
    if (!img.isEmpty()) {
      const { width, height } = img.getSize()
      if (Math.max(width, height) > 512) img = img.resize(width >= height ? { width: 512 } : { height: 512 })
      fs.mkdirSync(path.join(ordner, 'assets'), { recursive: true })
      fs.writeFileSync(path.join(ordner, 'assets', 'avatar.png'), img.toPNG())
    }
  }
  return { id, name, rolle }
}

module.exports = { botAnlegen, profilId }
