// Sicherung von Vendos Datenbank: pg_dump im Container (ohne Passwort, über den lokalen Socket im Container).
// Legt daten/datenbank-sicherungen/vendo-<Zeit>.dump ab und behält die letzten 14 Stände.
//   node scripts/datenbank-sicherung.js                 Sicherung anlegen
//   node scripts/datenbank-sicherung.js --pruefen       Sicherung anlegen und in eine Wegwerf-Datenbank zurückspielen
// Für Tests: VENDO_DB_SICHERUNG_ORDNER (Zielordner) und VENDO_DB_CONTAINER (Containername).

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ORDNER = process.env.VENDO_DB_SICHERUNG_ORDNER || path.join(__dirname, '..', 'daten', 'datenbank-sicherungen')
const CONTAINER = process.env.VENDO_DB_CONTAINER || 'vendo-db-postgres-1'
const BEHALTEN = 14

const docker = (args, opt = {}) => execFileSync('docker', args, { maxBuffer: 1 << 30, windowsHide: true, ...opt })

fs.mkdirSync(ORDNER, { recursive: true })
const zeit = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const ziel = path.join(ORDNER, `vendo-${zeit}.dump`)
fs.writeFileSync(ziel, docker(['exec', CONTAINER, 'pg_dump', '-U', 'vendo_admin', '-d', 'vendo', '-Fc']))
console.log(`Sicherung: ${ziel} (${fs.statSync(ziel).size} Bytes)`)

const alte = fs.readdirSync(ORDNER).filter((n) => /^vendo-.*\.dump$/.test(n)).sort().slice(0, -BEHALTEN)
for (const n of alte) fs.unlinkSync(path.join(ORDNER, n))

if (process.argv.includes('--pruefen')) {
  // Wiederherstellung proben: in die Wegwerf-Datenbank vendo_probe zurückspielen und Tabellen zählen
  docker(['exec', CONTAINER, 'dropdb', '-U', 'vendo_admin', '--if-exists', 'vendo_probe'])
  docker(['exec', CONTAINER, 'createdb', '-U', 'vendo_admin', 'vendo_probe'])
  docker(['exec', '-i', CONTAINER, 'pg_restore', '-U', 'vendo_admin', '-d', 'vendo_probe', '--no-owner'], { input: fs.readFileSync(ziel) })
  const tabellen = String(docker(['exec', CONTAINER, 'psql', '-U', 'vendo_admin', '-d', 'vendo_probe', '-tAc',
    "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"])).trim()
  docker(['exec', CONTAINER, 'dropdb', '-U', 'vendo_admin', 'vendo_probe'])
  console.log(`Wiederherstellung geprobt: ${tabellen} Tabellen zurückgespielt, Wegwerf-Datenbank wieder gelöscht.`)
}
