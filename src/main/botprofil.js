// Profil-Fenster der Crew: SOUL.md eines Bots lesen und bearbeiten (Hermes-Profil, update-fest:
// %LOCALAPPDATA%\hermes\profiles\<profil>\SOUL.md). Nur bestehende Profile, nur die SOUL.md.
// Vor jedem Speichern kommt die alte Fassung nach daten/datei-sicherungen/soul/. Wurde die Datei inzwischen
// woanders geändert (Hermes-App, Editor), wird nicht überschrieben. Hermes liest die SOUL beim nächsten neuen Chat.

const fs = require('node:fs/promises')
const path = require('node:path')

const PROFILE = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'profiles')
const SICHERUNGEN = path.join(__dirname, '..', '..', 'daten', 'datei-sicherungen', 'soul')
const PROFIL = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_TEXT = 200_000

async function soulPfad(profil) {
  const name = String(profil || '')
  if (!PROFIL.test(name)) throw new Error('Unbekanntes Profil.')
  const ordner = path.join(PROFILE, name)
  const info = await fs.stat(ordner).catch(() => null)
  if (!info?.isDirectory()) throw new Error(`Das Hermes-Profil „${name}“ gibt es nicht.`)
  return path.join(ordner, 'SOUL.md')
}

async function lesen(profil) {
  const datei = await soulPfad(profil)
  const info = await fs.stat(datei).catch(() => null)
  if (!info) return { soul: '', geaendert: 0, fehlt: true }
  return { soul: await fs.readFile(datei, 'utf8'), geaendert: info.mtimeMs, fehlt: false }
}

async function speichern(profil, text, geaendertBeimLaden) {
  const datei = await soulPfad(profil)
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Der Text ist zu groß.')
  if (!text.trim()) throw new Error('Eine leere SOUL speichere ich nicht.')
  const info = await fs.stat(datei).catch(() => null)
  if (info && geaendertBeimLaden && Math.abs(info.mtimeMs - geaendertBeimLaden) > 1) {
    throw new Error('Die SOUL wurde inzwischen woanders geändert. Schließ das Fenster und öffne es neu, damit nichts verloren geht.')
  }
  let sicherung = null
  if (info) {
    await fs.mkdir(SICHERUNGEN, { recursive: true })
    const stempel = new Date().toISOString().replace(/[:.]/g, '-')
    sicherung = path.join(SICHERUNGEN, `${stempel}__${profil}__SOUL.md`)
    await fs.copyFile(datei, sicherung)
  }
  await fs.writeFile(datei, text, 'utf8')
  const neu = await fs.stat(datei)
  return { geaendert: neu.mtimeMs, sicherung: sicherung ? path.basename(sicherung) : null }
}

module.exports = { lesen, speichern }
