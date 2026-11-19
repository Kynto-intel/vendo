// Vendos eigene Einstellungen und kleiner Zustand in PostgreSQL (Plan docs/postgresql-umbauplan.md, A5).
//
// Original ist die Tabelle vendo.einstellungen (schluessel, wert, roh). Weil Vendo Einstellungen schon beim Start braucht,
// bevor Docker und die Datenbank bereit sind (Fenster, Stimme, Start-Optionen), hält Vendo zusätzlich eine Startkopie in
// daten/startkopie.json. Sie wird bei jeder Änderung mitgeschrieben und nur gelesen, bis die Datenbank geladen ist; dann
// gilt die Datenbank, außer für Änderungen, die in der Zwischenzeit gemacht und noch nicht geschrieben wurden.
// Die früheren Dateien (daten/einstellungen.json, terminal-befehle.json, waechter-stand.json) liest Vendo einmal ein, wenn
// es für den Schlüssel noch nichts gibt; nach dem Schreiben in die Datenbank wandern sie nach daten/datei-sicherungen/.

const fs = require('node:fs')
const path = require('node:path')
const datenbank = require('./datenbank')

const ALT = { einstellungen: 'einstellungen.json', 'terminal-befehle': 'terminal-befehle.json', 'waechter-stand': 'waechter-stand.json' }
const daten = () => process.env.VENDO_DATEN_ORDNER || path.join(__dirname, '..', '..', 'daten')
const kopieDatei = () => path.join(daten(), 'startkopie.json')

const UPSERT = `INSERT INTO vendo.einstellungen (schluessel, wert, roh) VALUES ($1, $2::text::jsonb, $2::text)
  ON CONFLICT (schluessel) DO UPDATE SET wert = EXCLUDED.wert, roh = EXCLUDED.roh, geaendert_am = now()
  WHERE vendo.einstellungen.roh IS DISTINCT FROM EXCLUDED.roh`

let werte = null // Map schluessel → JSON-Text (aus Startkopie, später aus der Datenbank)
let geladen = false
const offen = new Map()
const altEingelesen = new Map() // schluessel → Pfad der alten Datei, die nach dem Schreiben weggeräumt wird
let zeitgeber = null
let laufend = null

function kopieLesen() {
  if (werte) return
  werte = new Map()
  try { for (const [k, t] of Object.entries(JSON.parse(fs.readFileSync(kopieDatei(), 'utf8')))) if (typeof t === 'string') werte.set(k, t) } catch { /* noch keine Startkopie */ }
}
function kopieSchreiben() {
  try {
    fs.mkdirSync(daten(), { recursive: true })
    fs.writeFileSync(`${kopieDatei()}.neu`, JSON.stringify(Object.fromEntries(werte), null, 2), 'utf8')
    fs.renameSync(`${kopieDatei()}.neu`, kopieDatei())
  } catch (f) { console.warn(`Vendo-Speicher: Startkopie: ${f.message}`) }
}
// Einmalig: frühere eigene Datei übernehmen, solange es für den Schlüssel noch nichts gibt
function altPruefen(schluessel) {
  if (!ALT[schluessel] || altEingelesen.has(schluessel)) return
  const datei = path.join(daten(), ALT[schluessel])
  if (!fs.existsSync(datei)) return
  altEingelesen.set(schluessel, datei) // wird nach dem Laden weggeräumt; die Startkopie ist dann schon neuer
  if (werte.has(schluessel)) return
  let text
  try { text = fs.readFileSync(datei, 'utf8'); JSON.parse(text) } catch { return }
  werte.set(schluessel, text)
  offen.set(schluessel, text)
  kopieSchreiben()
  bald()
}

function lesen(schluessel) {
  kopieLesen()
  altPruefen(schluessel)
  const t = werte.get(schluessel)
  if (t == null) return null
  try { return JSON.parse(t) } catch { return null }
}
function schreiben(schluessel, wert) {
  kopieLesen()
  const text = JSON.stringify(wert ?? null, null, 2)
  if (werte.get(schluessel) === text) return false
  werte.set(schluessel, text)
  offen.set(schluessel, text)
  kopieSchreiben()
  bald()
  return true
}
function bald() {
  if (!zeitgeber) zeitgeber = setTimeout(() => { zeitgeber = null; festschreiben().catch(() => {}) }, 300)
}

async function festschreiben() {
  while (laufend) await laufend
  if (!offen.size || !geladen || !datenbank.bereit()) return { geschrieben: 0, offen: offen.size }
  const paket = [...offen]
  offen.clear()
  laufend = (async () => {
    try {
      let n = 0
      await datenbank.transaktion(async (c) => { for (const [k, t] of paket) n += (await c.query(UPSERT, [k, t])).rowCount })
      altWegraeumen(paket.map(([k]) => k))
      return n
    } catch (f) {
      for (const [k, t] of paket) if (!offen.has(k)) offen.set(k, t)
      throw f
    }
  })().finally(() => { laufend = null })
  return { geschrieben: await laufend, offen: offen.size }
}
function altWegraeumen(schluessel) {
  const ziel = path.join(daten(), 'datei-sicherungen', `vendo-dateien-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  for (const k of schluessel) {
    const datei = altEingelesen.get(k)
    if (!datei) continue
    altEingelesen.delete(k)
    try { fs.mkdirSync(ziel, { recursive: true }); fs.renameSync(datei, path.join(ziel, path.basename(datei))) } catch { /* bleibt liegen, schadet nicht */ }
  }
}

// Beim Verbinden: Datenbank laden; ungeschriebene Änderungen und Werte, die es dort noch nicht gibt, nachschreiben
async function laden() {
  kopieLesen()
  for (const k of Object.keys(ALT)) altPruefen(k)
  const r = await datenbank.abfrage('SELECT schluessel, COALESCE(roh, wert::text) AS t FROM vendo.einstellungen')
  const inDb = new Map(r.rows.map((z) => [z.schluessel, z.t]))
  for (const [k, t] of inDb) if (!offen.has(k)) werte.set(k, t)
  for (const [k, t] of werte) if (!inDb.has(k) && !offen.has(k)) offen.set(k, t)
  geladen = true
  kopieSchreiben()
  const erg = await festschreiben()
  altWegraeumen([...altEingelesen.keys()].filter((k) => !offen.has(k))) // alles in der Datenbank: alte Dateien sichern
  return erg
}

const zustand = () => ({ geladen, offen: offen.size })
function _zuruecksetzen() { clearTimeout(zeitgeber); zeitgeber = null; werte = null; geladen = false; offen.clear(); altEingelesen.clear() }

module.exports = { lesen, schreiben, laden, festschreiben, zustand, _zuruecksetzen }
