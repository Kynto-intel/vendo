// Vendos Datenbank: PostgreSQL in Docker, nur auf 127.0.0.1 (Plan docs/postgresql-umbauplan.md, Teil A).
//
// Beim Start von Vendo (starten): Docker Desktop starten, falls es nicht läuft, den Container aus
// docker/vendo-db/compose.yml hochfahren, einmalig den App-Benutzer anlegen und die Migrationen ausführen.
// Die Passwörter erzeugt Vendo selbst und speichert sie nur verschlüsselt (Windows, safeStorage) in
// daten/datenbank.json. Ohne Datenbank läuft Vendo weiter; zustand() sagt, warum sie fehlt.
//
// Für Tests: VENDO_DB_URL (postgres://…) verbindet direkt, ohne Docker und ohne safeStorage.

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { randomBytes } = require('node:crypto')

const WURZEL = path.join(__dirname, '..', '..')
const COMPOSE = path.join(WURZEL, 'docker', 'vendo-db', 'compose.yml')
const KONFIG = () => path.join(WURZEL, 'daten', 'datenbank.json')
const PROJEKT = 'vendo-db'

const MIGRATIONEN = [
  {
    version: 1,
    sql: `
      CREATE SCHEMA IF NOT EXISTS vendo;
      CREATE TABLE IF NOT EXISTS vendo.plugin_daten (
        plugin_id    text PRIMARY KEY,
        daten        jsonb NOT NULL,
        geaendert_am timestamptz NOT NULL DEFAULT now()
      );`
  },
  {
    // Teil B: roh = Text genau so, wie Vendo ihn speichert (Reihenfolge der Schlüssel bleibt); austausch = Stand der
    // Austauschdateien für Luzzy (daten/austausch/), damit Vendo fremde Änderungen erkennt
    version: 2,
    sql: `
      ALTER TABLE vendo.plugin_daten ADD COLUMN IF NOT EXISTS roh text;
      CREATE TABLE IF NOT EXISTS vendo.austausch (
        plugin_id    text PRIMARY KEY,
        sha256       text NOT NULL,
        geaendert_am timestamptz NOT NULL DEFAULT now()
      );`
  },
  {
    // A5: Vendos eigene Einstellungen und kleiner Zustand (Einstellungen, Terminal-Befehle, Wächter-Stand)
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS vendo.einstellungen (
        schluessel   text PRIMARY KEY,
        wert         jsonb NOT NULL,
        roh          text NOT NULL,
        geaendert_am timestamptz NOT NULL DEFAULT now()
      );`
  }
]

let pool = null
let startVersprechen = null
let stand = { zustand: 'aus', meldung: 'Noch nicht gestartet.', seit: new Date().toISOString() }
const wartende = new Set()

const setzen = (zustand, meldung) => { stand = { zustand, meldung, seit: new Date().toISOString() } }
const zustand = () => ({ ...stand })
const bereit = () => stand.zustand === 'bereit' && !!pool
const versucht = () => !!startVersprechen

function ausfuehren(befehl, argumente, { env, timeout = 120_000 } = {}) {
  return new Promise((aufloesen, ablehnen) => {
    execFile(befehl, argumente, { env: { ...process.env, ...env }, timeout, windowsHide: true }, (fehler, aus, err) => {
      if (fehler) ablehnen(new Error(String(err || fehler.message).trim().split('\n').slice(-3).join(' ')))
      else aufloesen(String(aus))
    })
  })
}
const warten = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- Zugangsdaten: nur verschlüsselt auf der Platte ----------
function tresor() {
  const { safeStorage } = require('electron')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Der verschlüsselte Windows-Speicher ist gerade nicht verfügbar.')
  return {
    zu: (text) => safeStorage.encryptString(text).toString('base64'),
    auf: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64'))
  }
}
function zugang() {
  const t = tresor()
  let k = null
  try { k = JSON.parse(fs.readFileSync(KONFIG(), 'utf8')) } catch { /* noch keine Einrichtung */ }
  if (!k?.admin || !k?.app) {
    k = { port: 5432, admin: t.zu(randomBytes(24).toString('base64url')), app: t.zu(randomBytes(24).toString('base64url')), angelegt: new Date().toISOString() }
    fs.mkdirSync(path.dirname(KONFIG()), { recursive: true })
    fs.writeFileSync(KONFIG(), JSON.stringify(k, null, 2), 'utf8')
  }
  return { port: Number(k.port) || 5432, admin: t.auf(k.admin), app: t.auf(k.app) }
}

// ---------- Docker ----------
async function dockerBereit() {
  try { await ausfuehren('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 }); return true } catch { return false }
}
async function dockerStarten() {
  if (await dockerBereit()) return
  const exe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe')
  if (!fs.existsSync(exe)) throw new Error('Docker Desktop ist nicht installiert.')
  setzen('startet', 'Docker Desktop wird gestartet …')
  require('node:child_process').spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  for (let i = 0; i < 60; i++) { await warten(3000); if (await dockerBereit()) return }
  throw new Error('Docker Desktop ist nach 3 Minuten nicht bereit.')
}

// ---------- Verbindung ----------
async function verbinden(verbindung, versuche = 30) {
  const { Pool } = require('pg')
  let letzter
  for (let i = 0; i < versuche; i++) {
    const p = new Pool({ ...verbindung, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5000 })
    try { await p.query('SELECT 1'); p.on('error', () => {}); return p } catch (f) { letzter = f; await p.end().catch(() => {}) }
    await warten(2000)
  }
  throw letzter
}

// Einmalig als Verwalter: App-Benutzer anlegen (darf nur eigene Schemata anlegen, nicht verwalten)
async function appBenutzerEinrichten(port, z) {
  const verwalter = await verbinden({ host: '127.0.0.1', port, database: 'vendo', user: 'vendo_admin', password: z.admin })
  try {
    const da = await verwalter.query("SELECT 1 FROM pg_roles WHERE rolname = 'vendo_app'")
    const pw = z.app.replace(/'/g, "''")
    await verwalter.query(`${da.rowCount ? 'ALTER' : 'CREATE'} ROLE vendo_app LOGIN PASSWORD '${pw}'`)
    await verwalter.query('GRANT CONNECT, CREATE ON DATABASE vendo TO vendo_app')
  } finally { await verwalter.end().catch(() => {}) }
}

// Migrationen je Bereich (vendo = Kern, sonst Plugin-ID); festgehalten in vendo.schema_version
async function migrieren(bereich, liste) {
  if (!pool) throw new Error('Datenbank nicht verbunden.')
  const c = await pool.connect()
  try {
    await c.query('CREATE SCHEMA IF NOT EXISTS vendo')
    await c.query('CREATE TABLE IF NOT EXISTS vendo.schema_version (bereich text PRIMARY KEY, version int NOT NULL, geaendert_am timestamptz NOT NULL DEFAULT now())')
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [bereich])
    const r = await c.query('SELECT version FROM vendo.schema_version WHERE bereich = $1', [bereich])
    const ist = r.rows[0]?.version || 0
    const offen = [...liste].sort((a, b) => a.version - b.version).filter((m) => m.version > ist)
    for (const m of offen) await c.query(m.sql)
    if (offen.length) await c.query('INSERT INTO vendo.schema_version (bereich, version) VALUES ($1, $2) ON CONFLICT (bereich) DO UPDATE SET version = $2, geaendert_am = now()', [bereich, offen.at(-1).version])
    await c.query('COMMIT')
    return { vorher: ist, jetzt: offen.at(-1)?.version || ist }
  } catch (f) {
    await c.query('ROLLBACK').catch(() => {})
    throw f
  } finally { c.release() }
}

async function abfrage(sql, werte) {
  if (!bereit()) throw new Error(`Datenbank nicht bereit: ${stand.meldung}`)
  return pool.query(sql, werte)
}
async function transaktion(arbeit) {
  if (!bereit()) throw new Error(`Datenbank nicht bereit: ${stand.meldung}`)
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const erg = await arbeit(c)
    await c.query('COMMIT')
    return erg
  } catch (f) {
    await c.query('ROLLBACK').catch(() => {})
    throw f
  } finally { c.release() }
}

// Ruft fn auf, sobald die Datenbank bereit ist (sofort, wenn sie es schon ist). Gibt eine Abmeldung zurück.
function beiBereit(fn) {
  if (bereit()) Promise.resolve().then(fn).catch((f) => console.warn(`Datenbank: ${f.message}`))
  wartende.add(fn)
  return () => wartende.delete(fn)
}

async function starten() {
  if (startVersprechen) return startVersprechen
  startVersprechen = (async () => {
    try {
      let verbindung
      if (process.env.VENDO_DB_URL) verbindung = { connectionString: process.env.VENDO_DB_URL }
      else {
        if (process.env.VENDO_DB === 'aus' || process.env.VENDO_TEST_STUMM) { setzen('aus', 'Datenbank ist abgeschaltet.'); return zustand() }
        setzen('startet', 'Datenbank wird gestartet …')
        const z = zugang()
        await dockerStarten()
        setzen('startet', 'Datenbank-Container wird gestartet …')
        await ausfuehren('docker', ['compose', '-p', PROJEKT, '-f', COMPOSE, 'up', '-d', '--wait'], {
          env: { VENDO_DB_ADMIN_PASSWORT: z.admin, VENDO_DB_PORT: String(z.port) }, timeout: 300_000
        })
        await appBenutzerEinrichten(z.port, z)
        verbindung = { host: '127.0.0.1', port: z.port, database: 'vendo', user: 'vendo_app', password: z.app }
      }
      pool = await verbinden(verbindung)
      await migrieren('vendo', MIGRATIONEN)
      setzen('bereit', 'Verbunden.')
      for (const fn of wartende) Promise.resolve().then(fn).catch((f) => console.warn(`Datenbank: ${f.message}`))
    } catch (f) {
      setzen('fehler', f.message)
      console.warn(`Datenbank: ${f.message}`)
    }
    return zustand()
  })()
  return startVersprechen
}

async function beenden() {
  const p = pool
  pool = null
  startVersprechen = null
  if (stand.zustand === 'bereit') setzen('aus', 'Beendet.')
  if (p) await p.end().catch(() => {})
}

// Was ein Plugin im Hauptprozess bekommt (ctx.datenbank)
function fuerPlugin(id) {
  return {
    zustand, bereit, abfrage, transaktion, beiBereit,
    migrieren: (liste) => migrieren(String(id), liste)
  }
}

module.exports = { starten, beenden, zustand, bereit, versucht, abfrage, transaktion, beiBereit, migrieren, fuerPlugin, MIGRATIONEN }
