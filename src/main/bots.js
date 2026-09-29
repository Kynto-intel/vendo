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

async function botAnlegen({ name, rolle, beschreibung, aufgaben, soulKomplett = false, vorlage, bild, andere = [] }) {
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
  // Von Luzzy komplett geschrieben (oder von Felix): so übernehmen; sonst aus der Vorlage bauen
  const soul = soulKomplett && String(aufgaben || '').trim().length > 200
    ? `${String(aufgaben).trim()}\n`
    : seele({ name, rolle, aufgaben, andere: andere.filter((b) => b && PROFIL.test(b.profil)) })
  fs.writeFileSync(path.join(ordner, 'SOUL.md'), soul, 'utf8')

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

// ── Luzzy hilft: SOUL.md schreiben oder Bild-Prompt für den Avatar (ihr Skill jarves-bot-erstellen ist die Anleitung) ──
// Läuft als einmalige Anfrage an Luzzys Modell (llm.oneshot): nichts davon landet in ihrem Chat.
const SKILL = path.join(HERMES_HOME, 'profiles', 'donnerwolf', 'skills', 'productivity', 'jarves-bot-erstellen', 'SKILL.md')

function skillTeil(teil) {
  const text = fs.existsSync(SKILL) ? fs.readFileSync(SKILL, 'utf8') : ''
  const a = text.indexOf('## Teil 1')
  const b = text.indexOf('## Teil 2')
  if (a < 0 || b < 0) throw new Error('Luzzys Skill „jarves-bot-erstellen“ fehlt.')
  return teil === 1 ? text.slice(a, b) : text.slice(b)
}

async function luzzyHilft(art, d, hermes) {
  const name = String(d?.name || '').trim().slice(0, 40)
  const rolle = String(d?.rolle || '').trim().slice(0, 40)
  if (!name) throw new Error('Bitte erst einen Namen eintragen.')
  const beschreibung = String(d?.beschreibung || '').trim().slice(0, 400)
  const notizen = String(d?.aufgaben || '').trim().slice(0, 4000)
  const andere = (Array.isArray(d?.andere) ? d.andere : []).filter((b) => b && PROFIL.test(b.profil)).slice(0, 20)
  if (!hermes.sessionId) await hermes.luzzyOeffnen()
  let instructions
  let input
  if (art === 'soul') {
    // Nur die Anleitung aus dem Skill (kein Vorbild-SOUL mehr: die alten SOULs sind im Großbuchstaben-Stil geschrieben,
    // den die Anleitung ab Version 3 bewusst vermeidet)
    instructions = `Du bist Luzzy, Felix' rechte Hand bei Donnerwolf. Schreib die SOUL.md für einen neuen Crew-Bot nach dieser Anleitung:

${skillTeil(1)}`
    input = `Neuer Bot:
- Name: ${name}
- Rolle: ${rolle || '(noch offen)'}
- Profil-ID: ${profilId(name, rolle)}
- Wofür er da ist: ${beschreibung || '(nicht angegeben)'}
- Felix' Notizen: ${notizen || '(keine)'}
- Andere Bots: ${andere.map((b) => `${b.name}${b.rolle ? ` (${b.rolle})` : ''} = ${b.profil}`).join('; ')}

Gib nur die fertige SOUL.md aus.`
  } else {
    instructions = `Du bist Luzzy, Felix' rechte Hand bei Donnerwolf. Schreib den Bild-Prompt für den Avatar eines neuen Crew-Bots nach dieser Anleitung:

${skillTeil(2)}`
    input = `Neuer Bot:
- Name: ${name}
- Rolle: ${rolle || '(noch offen)'}
- Wofür er da ist: ${beschreibung || '(nicht angegeben)'}
- Notizen: ${notizen.slice(0, 1500) || '(keine)'}`
  }
  const r = await hermes.rpc('llm.oneshot', { session_id: hermes.sessionId, instructions, input, max_tokens: art === 'soul' ? 4000 : 1200, temperature: 0.6 }, { timeout: 240000 }) // eine ganze SOUL braucht länger als die üblichen 60 s
  let text = String(r?.text || '').trim()
  if (!text) throw new Error('Luzzy hat nichts zurückgegeben. Nochmal versuchen.')
  if (art === 'soul') text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```\s*$/, '').trim() // Codeblock drumherum weg
  return text
}

module.exports = { botAnlegen, profilId, luzzyHilft }
