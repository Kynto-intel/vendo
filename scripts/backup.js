// Sicherung: kopiert den Live-Ordner (ohne node_modules) nach ..\backup\vendo_JJJJ-MM-TT_HH-MM
// Aufruf: npm run backup [-- "kurze Notiz"]
// Auch aus Vendo heraus nutzbar (Einstellungen → Sicherung → „Jetzt sichern“).

const fs = require('node:fs')
const path = require('node:path')

const quelle = path.join(__dirname, '..')
const ORDNER = path.join(quelle, '..', 'backup')
const AUSLASSEN = new Set(['node_modules', '.git'])

function sichern(notiz = '') {
  const zeit = new Date()
  const zwei = (n) => String(n).padStart(2, '0')
  const stempel = `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}_${zwei(zeit.getHours())}-${zwei(zeit.getMinutes())}`
  notiz = String(notiz).trim()
  const basis = `vendo_${stempel}${notiz ? '_' + notiz.replace(/[^\w\-äöüÄÖÜß]+/g, '-').slice(0, 40) : ''}`
  // Zweimal in derselben Minute: nicht überschreiben, sondern durchnummerieren
  let name = basis
  for (let i = 2; fs.existsSync(path.join(ORDNER, name)); i++) name = `${basis}_${i}`
  const ziel = path.join(ORDNER, name)
  fs.cpSync(quelle, ziel, {
    recursive: true,
    filter: (datei) => !AUSLASSEN.has(path.basename(datei))
  })
  return ziel
}

// Vorhandene Sicherungen: Anzahl und die neueste
function sicherungen() {
  let namen = []
  try {
    namen = fs.readdirSync(ORDNER, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    // Ordner gibt es noch nicht
  }
  const mitZeit = namen.map((name) => ({ name, zeit: fs.statSync(path.join(ORDNER, name)).mtimeMs })).sort((a, b) => b.zeit - a.zeit)
  return { ordner: ORDNER, anzahl: mitZeit.length, letzte: mitZeit[0] || null }
}

module.exports = { sichern, sicherungen, ORDNER }

if (require.main === module) {
  console.log(`Sicherung angelegt: ${sichern(process.argv.slice(2).join(' '))}`)
}
