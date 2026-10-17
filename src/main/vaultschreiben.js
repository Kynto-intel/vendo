// Schreiben in den Vault, eng begrenzt: nur im Ordner Donnerwolf-Shop\Vendo\ und nie eine bestehende
// Datei überschreiben (neue Notizen bekommen notfalls „(2)“, Listen werden nur ergänzt).
// Genutzt von „Antwort merken“ (📌) und den Plugins Gedankenspeicher und Aufgaben (ctx.vault).

const fs = require('node:fs/promises')
const path = require('node:path')
const { VAULT } = require('./wissen')

// Testmodus: VENDO_TEST_VAULT=<Ordner> statt des echten Vaults
const VAULT_ORDNER = process.env.VENDO_TEST_VAULT || VAULT
const ORDNER = path.join(VAULT_ORDNER, 'Vendo')

// Nur einfache Namen, keine Pfade: „Gedankenspeicher.md“, „Gemerkte Antworten“
function name(text, { endung = '' } = {}) {
  const sauber = String(text || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80)
  if (!sauber) throw new Error('Kein gültiger Name.')
  return endung && !sauber.toLowerCase().endsWith(endung) ? `${sauber}${endung}` : sauber
}

async function ordnerBereit(unterordner = '') {
  try {
    await fs.access(VAULT_ORDNER)
  } catch {
    throw new Error('Vault nicht gefunden (Documents\\Donnerwolf\\Donnerwolf-Shop).')
  }
  const ziel = unterordner ? path.join(ORDNER, name(unterordner)) : ORDNER
  await fs.mkdir(ziel, { recursive: true })
  return ziel
}

// Neue Notiz anlegen. Gibt den Pfad relativ zum Vault zurück.
async function anlegen(unterordner, titel, inhalt) {
  const ordner = await ordnerBereit(unterordner)
  const basis = name(titel)
  for (let i = 1; i < 100; i++) {
    const datei = path.join(ordner, `${basis}${i > 1 ? ` (${i})` : ''}.md`)
    try {
      await fs.writeFile(datei, String(inhalt), { encoding: 'utf8', flag: 'wx' }) // wx: nie überschreiben
      return path.relative(VAULT_ORDNER, datei)
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
  }
  throw new Error('Zu viele Notizen mit diesem Namen.')
}

// Text an eine Datei anhängen (legt sie mit Überschrift an, wenn es sie noch nicht gibt)
async function anhaengen(datei, text, { kopf = '' } = {}) {
  const ziel = path.join(await ordnerBereit(), name(datei, { endung: '.md' }))
  let neu = false
  try {
    await fs.access(ziel)
  } catch {
    neu = true
  }
  await fs.appendFile(ziel, `${neu && kopf ? `${kopf}\n\n` : ''}${String(text).replace(/\s+$/, '')}\n`, 'utf8')
  return path.relative(VAULT_ORDNER, ziel)
}

// Datei aus dem Vendo-Ordner lesen ('' wenn es sie nicht gibt)
async function lesen(datei) {
  try {
    return await fs.readFile(path.join(ORDNER, name(datei, { endung: '.md' })), 'utf8')
  } catch {
    return ''
  }
}

module.exports = { anlegen, anhaengen, lesen, ORDNER }
