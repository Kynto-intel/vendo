// Sicherung: kopiert den Live-Ordner (ohne node_modules) nach ..\backup\jarves-os_JJJJ-MM-TT_HH-MM
// Aufruf: npm run backup [-- "kurze Notiz"]

const fs = require('node:fs')
const path = require('node:path')

const quelle = path.join(__dirname, '..')
const zeit = new Date()
const zwei = (n) => String(n).padStart(2, '0')
const stempel = `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}_${zwei(zeit.getHours())}-${zwei(zeit.getMinutes())}`
const notiz = process.argv.slice(2).join(' ').trim()
const name = `jarves-os_${stempel}${notiz ? '_' + notiz.replace(/[^\w\-äöüÄÖÜß]+/g, '-').slice(0, 40) : ''}`
const ziel = path.join(quelle, '..', 'backup', name)

const AUSLASSEN = new Set(['node_modules', '.git'])

fs.cpSync(quelle, ziel, {
  recursive: true,
  filter: (datei) => !AUSLASSEN.has(path.basename(datei))
})
console.log(`Sicherung angelegt: ${ziel}`)
