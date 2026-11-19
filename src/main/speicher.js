// Speicher der Plugin-Daten: PostgreSQL ist das Original (Plan docs/postgresql-umbauplan.md, Teil B).
//
// Vendo lädt beim Verbinden alle Zeilen aus vendo.plugin_daten in den Arbeitsspeicher; lesen() und schreiben() arbeiten
// darauf, jede Änderung geht gebündelt in einer Transaktion zurück. Solange nichts geladen ist, wird weder gelesen noch
// gespeichert: So landet nie ein leerer Stand über echten Daten. Nimmt die Datenbank eine Änderung nicht an, kommt sie ins
// Journal daten/speicher-offen/ (auch beim Beenden) und wird beim nächsten Laden nachgeschrieben.
// Austausch: Plugins mit "austausch": true in plugin.json (Kalender, Aufgaben) bekommen eine Kopie in
// daten/austausch/<id>.json. Luzzy (Hermes-Plugin vendo-planer) liest und schreibt diese Datei; Vendo liest jede fremde
// Änderung sofort (und beim Start) ein. Die Datei ist nur Eingang und Kopie, nie das Original.
// Alte Dateien: Liegt beim Laden noch eine daten/plugins/<id>.json (z. B. aus einer alten Sicherung zurückgespielt) oder
// bringt ein neues Plugin Startdaten (plugins/<id>/daten.json) mit, wird sie nur übernommen, wenn die Datenbank für dieses
// Plugin noch nichts hat; danach wandert sie in daten/datei-sicherungen/. Sonst bleibt sie liegen und zustand() nennt sie.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const datenbank = require('./datenbank')

const GUELTIGE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const GRENZE = 5_000_000
const WURZEL = path.join(__dirname, '..', '..')

function ordner() {
  const daten = process.env.VENDO_DATEN_ORDNER || path.join(WURZEL, 'daten')
  return {
    daten,
    plugins: path.join(daten, 'plugins'),
    austausch: path.join(daten, 'austausch'),
    journal: path.join(daten, 'speicher-offen'),
    sicherungen: path.join(daten, 'datei-sicherungen')
  }
}
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex')
const zeitName = () => new Date().toISOString().replace(/[:.]/g, '-')
function atomarSchreiben(datei, text) {
  fs.mkdirSync(path.dirname(datei), { recursive: true })
  fs.writeFileSync(`${datei}.neu`, text, 'utf8')
  fs.renameSync(`${datei}.neu`, datei)
}
// Gültige Plugin-Daten: JSON-Objekt (kein Array, nicht null) innerhalb der Größengrenze
function gueltig(text) {
  if (typeof text !== 'string' || text.length > GRENZE) return false
  try { const d = JSON.parse(text); return !!d && typeof d === 'object' && !Array.isArray(d) } catch { return false }
}
// Alle <id>.json eines Ordners (Unterordner, .bak usw. bleiben außen vor)
function jsonDateien(o) {
  const gut = new Map()
  let eintraege = []
  try { eintraege = fs.readdirSync(o, { withFileTypes: true }) } catch { /* Ordner fehlt */ }
  for (const e of eintraege) {
    if (!e.isFile() || !e.name.endsWith('.json') || !GUELTIGE_ID.test(e.name.slice(0, -5))) continue
    const text = fs.readFileSync(path.join(o, e.name), 'utf8')
    if (gueltig(text)) gut.set(e.name.slice(0, -5), text)
  }
  return gut
}

// ---------- Schreiben in die Datenbank ----------
const offen = new Map() // id → JSON-Text, noch nicht in der Datenbank
const austauschOffen = new Map() // id → sha256 der zuletzt geschriebenen/eingelesenen Austauschdatei
const imJournal = new Set()
let zeitgeber = null
let wiederholen = null
let laufend = null
let letzter = { zeit: null, geschrieben: 0, fehler: null }

const UPSERT = `INSERT INTO vendo.plugin_daten (plugin_id, daten, roh) VALUES ($1, $2::text::jsonb, $2::text)
  ON CONFLICT (plugin_id) DO UPDATE SET daten = EXCLUDED.daten, roh = EXCLUDED.roh, geaendert_am = now()
  WHERE vendo.plugin_daten.roh IS DISTINCT FROM EXCLUDED.roh OR vendo.plugin_daten.daten IS DISTINCT FROM EXCLUDED.daten`
const AUSTAUSCH_UPSERT = `INSERT INTO vendo.austausch (plugin_id, sha256) VALUES ($1, $2)
  ON CONFLICT (plugin_id) DO UPDATE SET sha256 = EXCLUDED.sha256, geaendert_am = now()`

function merken(id, text) {
  offen.set(String(id), text)
  if (!zeitgeber) zeitgeber = setTimeout(() => { zeitgeber = null; festschreiben().catch(() => {}) }, 300)
}

// Schreibt alle offenen Stände; wartet auf einen laufenden Durchgang. Ohne Datenbank bleiben sie offen und im Journal.
async function festschreiben() {
  while (laufend) await laufend
  if (!offen.size && !austauschOffen.size) return { geschrieben: 0, offen: 0 }
  if (!datenbank.bereit()) { journalSchreiben(); return { geschrieben: 0, offen: offen.size } }
  const paket = [...offen]
  const paketA = [...austauschOffen]
  offen.clear()
  austauschOffen.clear()
  laufend = (async () => {
    let geschrieben = 0
    try {
      await datenbank.transaktion(async (c) => {
        for (const [id, text] of paket) geschrieben += (await c.query(UPSERT, [id, text])).rowCount
        for (const [id, s] of paketA) await c.query(AUSTAUSCH_UPSERT, [id, s])
      })
      letzter = { zeit: new Date().toISOString(), geschrieben, fehler: null }
      journalAufraeumen(paket)
    } catch (f) {
      for (const [id, text] of paket) if (!offen.has(id)) offen.set(id, text) // neuere Stände nicht überschreiben
      for (const [id, s] of paketA) if (!austauschOffen.has(id)) austauschOffen.set(id, s)
      letzter = { ...letzter, fehler: f.message }
      journalSchreiben()
      if (!wiederholen) wiederholen = setTimeout(() => { wiederholen = null; festschreiben().catch(() => {}) }, 10_000)
      throw f
    }
    return geschrieben
  })().finally(() => { laufend = null })
  return { geschrieben: await laufend, offen: offen.size }
}

// ---------- Journal: Stände, die (noch) nicht in der Datenbank sind ----------
function journalSchreiben() {
  for (const [id, text] of offen) {
    try { atomarSchreiben(path.join(ordner().journal, `${id}.json`), text); imJournal.add(id) } catch (f) { console.warn(`Speicher: Journal ${id}: ${f.message}`) }
  }
}
function journalLesen() {
  const gut = jsonDateien(ordner().journal)
  for (const id of gut.keys()) imJournal.add(id)
  return gut
}
function journalAufraeumen(paket) {
  for (const [id, text] of paket) {
    if (!imJournal.has(id) || offen.has(id)) continue
    const datei = path.join(ordner().journal, `${id}.json`)
    try { if (fs.readFileSync(datei, 'utf8') === text) fs.unlinkSync(datei); imJournal.delete(id) } catch { imJournal.delete(id) }
  }
}
// Beim Beenden: alles, was noch nicht festgeschrieben ist, ins Journal (synchron)
function sichern() { if (offen.size) journalSchreiben() }

// ---------- Arbeitsspeicher ----------
let cache = null // Map id → JSON-Text; null = noch nicht geladen
let ladeVersprechen = null
let ladeFehler = null
let altLiegen = [] // alte Dateien, die nicht übernommen wurden, weil die Datenbank schon Daten hat
const beiGeladenListe = new Set()
const austauschIds = new Set()
const startdaten = new Map() // id → Pfad der daten.json im Plugin-Ordner
const exportiert = new Map() // id → sha256 der Austauschdatei, wie Vendo sie zuletzt geschrieben oder eingelesen hat
const beobachter = new Map() // id → Set(fn)
const meldeZeit = new Map()
const beobachteteAustausch = new Set()

const geladen = () => !!cache
function nichtGeladenText() {
  if (ladeFehler) return `Plugin-Daten konnten nicht aus der Datenbank geladen werden: ${ladeFehler}`
  return `Plugin-Daten sind noch nicht geladen (Datenbank: ${datenbank.zustand().meldung}). Es wurde nichts gespeichert.`
}

async function laden() {
  if (cache) return { plugins: cache.size, journal: 0, uebernommen: [] }
  if (ladeVersprechen) return ladeVersprechen
  ladeVersprechen = (async () => {
    const r = await datenbank.abfrage('SELECT plugin_id, COALESCE(roh, daten::text) AS t FROM vendo.plugin_daten')
    const a = await datenbank.abfrage('SELECT plugin_id, sha256 FROM vendo.austausch')
    const m = new Map(r.rows.map((z) => [z.plugin_id, z.t]))
    for (const z of a.rows) exportiert.set(z.plugin_id, z.sha256)
    const journal = journalLesen() // neuer als die Datenbank
    for (const [id, text] of journal) { m.set(id, text); offen.set(id, text) }
    cache = m
    ladeFehler = null
    const uebernommen = altEinlesen()
    for (const [id, datei] of startdaten) startdatenEinlesen(id, datei)
    for (const id of austauschIds) austauschAbgleichen(id)
    await festschreiben().catch(() => {}) // Journal und Eingänge nachschreiben; scheitert es, bleiben sie im Journal
    for (const fn of beiGeladenListe) { try { fn() } catch (f) { console.warn(`Speicher: ${f.message}`) } }
    beiGeladenListe.clear()
    return { plugins: m.size, journal: journal.size, uebernommen }
  })()
  try { return await ladeVersprechen } catch (f) { ladeFehler = f.message; throw f } finally { ladeVersprechen = null }
}

// Alte daten/plugins/<id>.json: nur übernehmen, wenn die Datenbank für das Plugin nichts hat; dann sichern und wegräumen
function altEinlesen() {
  const o = ordner()
  const alt = jsonDateien(o.plugins)
  const uebernommen = []
  altLiegen = []
  if (!alt.size) return uebernommen
  const ziel = path.join(o.sicherungen, `plugin-daten-eingelesen-${zeitName()}`)
  for (const [id, text] of alt) {
    if (cache.has(id)) { altLiegen.push(id); continue }
    fs.mkdirSync(ziel, { recursive: true })
    fs.renameSync(path.join(o.plugins, `${id}.json`), path.join(ziel, `${id}.json`))
    cache.set(id, text)
    merken(id, text)
    uebernommen.push(id)
  }
  if (altLiegen.length) console.warn(`Speicher: alte Dateien nicht übernommen, die Datenbank hat schon Daten: ${altLiegen.join(', ')}`)
  return uebernommen
}
// Startdaten eines neuen Plugins (plugins/<id>/daten.json) gelten nur, solange die Datenbank nichts für das Plugin hat
function startdatenAnmelden(id, datei) {
  startdaten.set(String(id), datei)
  if (cache) startdatenEinlesen(String(id), datei)
}
function startdatenEinlesen(id, datei) {
  startdaten.delete(id)
  if (cache.has(id)) return
  let text
  try { text = fs.readFileSync(datei, 'utf8') } catch { return }
  if (!gueltig(text)) return
  cache.set(id, text)
  merken(id, text)
}

// Ruft fn auf, sobald die Daten geladen sind (sofort, wenn sie es schon sind)
function beiGeladen(fn) {
  if (cache) { fn(); return () => {} }
  beiGeladenListe.add(fn)
  return () => beiGeladenListe.delete(fn)
}
// Wartet, bis gelesen und gespeichert werden darf; lehnt ab, wenn die Datenbank ausgefallen ist oder die Zeit abläuft
function warten(ms = 300_000) {
  if (cache) return Promise.resolve()
  return new Promise((ok, nein) => {
    const ende = Date.now() + ms
    const pruefen = () => {
      if (cache) return ok()
      const z = datenbank.zustand()
      if (ladeFehler || z.zustand === 'fehler' || (z.zustand === 'aus' && datenbank.versucht()) || Date.now() > ende) return nein(new Error(nichtGeladenText()))
      setTimeout(pruefen, 200)
    }
    pruefen()
  })
}

function lesen(id) {
  if (!cache) throw new Error(nichtGeladenText())
  return cache.get(String(id)) ?? null
}
function schreiben(id, text) {
  if (!cache) throw new Error(nichtGeladenText())
  id = String(id)
  if (cache.get(id) === text) return false
  cache.set(id, text)
  merken(id, text)
  if (austauschIds.has(id)) austauschSchreiben(id)
  melden(id)
  return true
}

// ---------- Beobachter ----------
function beobachten(id, fn) {
  if (!beobachter.has(id)) beobachter.set(id, new Set())
  beobachter.get(id).add(fn)
}
function melden(id) {
  if (meldeZeit.has(id)) return
  meldeZeit.set(id, setTimeout(() => {
    meldeZeit.delete(id)
    for (const fn of beobachter.get(id) || []) { try { fn(id) } catch { /* Beobachter darf nicht stören */ } }
  }, 150))
}

// ---------- Austausch mit Luzzy ----------
const austauschDatei = (id) => path.join(ordner().austausch, `${id}.json`)
function austauschAnmelden(id) {
  id = String(id)
  if (austauschIds.has(id)) return
  austauschIds.add(id)
  if (cache) austauschAbgleichen(id)
}
function austauschSchreiben(id) {
  const text = cache.get(id) ?? '{}'
  const s = sha(text)
  exportiert.set(id, s) // vor dem Schreiben, damit der Beobachter die eigene Änderung nicht einliest
  austauschOffen.set(id, s)
  try { atomarSchreiben(austauschDatei(id), text) } catch (f) { console.warn(`Speicher: Austauschdatei ${id}: ${f.message}`) }
}
// Datei von außen geändert (Luzzy)? Dann einlesen, sonst die Kopie auf den Stand der Datenbank bringen.
function austauschAbgleichen(id) {
  let text = null
  try { text = fs.readFileSync(austauschDatei(id), 'utf8') } catch { /* noch keine Datei */ }
  if (text !== null && exportiert.has(id) && sha(text) !== exportiert.get(id)) {
    if (gueltig(text)) einlesen(id, text)
    else console.warn(`Speicher: Austauschdatei ${id} ist kein gültiges JSON und wird nicht übernommen.`)
  } else if (text === null || text !== (cache.get(id) ?? '{}')) {
    austauschSchreiben(id)
  }
  if (beobachteteAustausch.has(id)) return
  beobachteteAustausch.add(id)
  fs.watchFile(austauschDatei(id), { interval: 1000 }, (jetzt, vorher) => {
    if (jetzt.mtimeMs === vorher.mtimeMs || !cache) return
    let t
    try { t = fs.readFileSync(austauschDatei(id), 'utf8') } catch { return }
    if (sha(t) === exportiert.get(id)) return
    if (gueltig(t)) einlesen(id, t)
  })
}
function einlesen(id, text) {
  exportiert.set(id, sha(text))
  austauschOffen.set(id, sha(text))
  cache.set(id, text)
  merken(id, text)
  melden(id)
}

// ---------- Export: alle Plugin-Daten als JSON-Dateien (Notfall, Sicherung, Umzug) ----------
async function exportieren(ziel = path.join(ordner().sicherungen, `plugin-daten-export-${zeitName()}`)) {
  if (!cache) throw new Error(nichtGeladenText())
  await festschreiben().catch(() => {})
  fs.mkdirSync(ziel, { recursive: true })
  for (const [id, text] of cache) atomarSchreiben(path.join(ziel, `${id}.json`), text)
  return { dateien: cache.size, ordner: ziel }
}

function zustand() {
  let journal = 0
  try { journal = fs.readdirSync(ordner().journal).filter((n) => n.endsWith('.json')).length } catch { /* kein Journal */ }
  return { geladen: !!cache, plugins: cache ? cache.size : null, offen: offen.size, journal, austausch: [...austauschIds], altLiegen, ladeFehler, ...letzter }
}

// Nur für Tests: inneren Zustand vergessen (wie ein neuer Vendo-Prozess)
function _zuruecksetzen() {
  for (const id of beobachteteAustausch) fs.unwatchFile(austauschDatei(id))
  for (const t of meldeZeit.values()) clearTimeout(t)
  clearTimeout(zeitgeber); clearTimeout(wiederholen)
  zeitgeber = wiederholen = null
  cache = null; ladeFehler = null; ladeVersprechen = null; altLiegen = []
  for (const x of [offen, austauschOffen, imJournal, austauschIds, startdaten, exportiert, beobachter, meldeZeit, beobachteteAustausch, beiGeladenListe]) x.clear()
  letzter = { zeit: null, geschrieben: 0, fehler: null }
}

module.exports = {
  ordner, festschreiben, zustand, sichern, laden, beiGeladen, warten, geladen, lesen, schreiben, beobachten,
  austauschAnmelden, startdatenAnmelden, exportieren, _zuruecksetzen, GRENZE
}
