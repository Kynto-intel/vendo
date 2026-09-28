// Werkstatt, Hintergrundteil: Entwürfe verwalten, prüfen, einbauen.
// Luzzy baut neue Plugins in jarves-os\werkstatt\<id>\ (nie direkt in plugins\). Jarves-OS prüft sie hier
// (Aufbau, Syntax, welche Rechte der Code nutzt) und kopiert sie erst nach Felix' Ja nach plugins\<id>\.
// Ersetzte Plugins werden vorher nach Desktop\jarves-os\backup\ gesichert, ihre daten.json bleibt erhalten.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const WURZEL = path.join(__dirname, '..', '..')
const PLUGINS = path.join(WURZEL, 'plugins')
const WERKSTATT = path.join(WURZEL, 'werkstatt')
const SICHERUNG = path.join(WURZEL, '..', 'backup')
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const EIGENE = new Set(['werkstatt']) // die Werkstatt ändert sich nicht selbst
const ERLAUBT = new Set(['plugin.json', 'ansicht.js', 'stil.css', 'haupt.js', 'README.md', 'LIESMICH.md'])
const MAX_DATEI = 400_000

const idPruefen = (id) => {
  if (!ID.test(String(id))) throw new Error('Ungültiger Plugin-Name.')
  return String(id)
}
const lesen = (datei) => {
  try {
    return fs.readFileSync(datei, 'utf8')
  } catch {
    return null
  }
}
const manifestVon = (ordner) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ordner, 'plugin.json'), 'utf8'))
  } catch {
    return null
  }
}
const zeitstempel = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (z) => (z === 'T' ? '_' : z === ':' ? '-' : '-'))

// „Plugin für meine Stoffvorräte“ → „stoffvorraete“ (frei, nicht schon vergeben)
function neueId(beschreibung) {
  const woerter = String(beschreibung || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(ein|eine|einen|der|die|das|den|dem|des|fuer|mit|und|oder|mein|meine|meinen|plugin|bau|baue|mach|mir|soll|kann|wo|was|wie|ich|von|zum|zur|auf|alle|mein)$/.test(w))
  let basis = woerter.slice(0, 3).join('-').slice(0, 30).replace(/-+$/, '') || 'mein-plugin'
  if (!ID.test(basis)) basis = 'mein-plugin'
  let id = basis
  for (let i = 2; fs.existsSync(path.join(PLUGINS, id)) || fs.existsSync(path.join(WERKSTATT, id)); i++) id = `${basis}-${i}`
  return id
}

// Entwürfe in der Werkstatt (auch halb fertige, an denen Luzzy noch baut)
function entwuerfe() {
  if (!fs.existsSync(WERKSTATT)) return []
  return fs.readdirSync(WERKSTATT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ID.test(e.name))
    .map((e) => {
      const ordner = path.join(WERKSTATT, e.name)
      const m = manifestVon(ordner)
      const dateien = fs.readdirSync(ordner)
      const geaendert = Math.max(fs.statSync(ordner).mtimeMs, ...dateien.map((d) => fs.statSync(path.join(ordner, d)).mtimeMs))
      return { id: e.name, name: m?.name || e.name, beschreibung: m?.beschreibung || '', fertig: Boolean(m) && dateien.includes('ansicht.js'), ersetzt: fs.existsSync(path.join(PLUGINS, e.name)), geaendert, dateien }
    })
    .sort((a, b) => b.geaendert - a.geaendert)
}

function installierte() {
  return fs.readdirSync(PLUGINS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ID.test(e.name))
    .map((e) => {
      const m = manifestVon(path.join(PLUGINS, e.name))
      return m ? { id: e.name, name: m.name || e.name, beschreibung: m.beschreibung || '', version: m.version || '', eigen: EIGENE.has(e.name), inArbeit: fs.existsSync(path.join(WERKSTATT, e.name)) } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Syntax prüfen, ohne den Code auszuführen (Node im Prüfmodus: node --check)
function syntaxFehler(code, alsModul) {
  const datei = path.join(os.tmpdir(), `jarves-werkstatt-${process.pid}-${Date.now()}.${alsModul ? 'mjs' : 'cjs'}`)
  fs.writeFileSync(datei, code, 'utf8')
  try {
    const r = spawnSync(process.execPath, ['--check', datei], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15000, windowsHide: true })
    if (r.status === 0) return null
    const zeilen = String(r.stderr || r.stdout || '').split(/\r?\n/)
    const zeile = zeilen.find((z) => z.includes(path.basename(datei)))?.match(/:(\d+)\s*$/)?.[1]
    const meldung = zeilen.find((z) => /^\w*Error\b/.test(z.trim()))?.trim() || 'Syntaxfehler'
    return zeile ? `${meldung} (Zeile ${zeile})` : meldung
  } finally {
    fs.rmSync(datei, { force: true })
  }
}

// Was nutzt der Code? (einfache Textsuche, keine Garantie – aber zeigt Felix, worauf er achten sollte)
const MUSTER = [
  { re: /child_process|\bexecSync\b|\bexecFile\b|\bspawn(Sync)?\s*\(|\bexec\s*\(/, text: 'Startet Programme auf dem PC', stufe: 'gefahr' },
  { re: /\beval\s*\(|new\s+Function\s*\(/, text: 'Führt selbst erzeugten Code aus', stufe: 'gefahr' },
  { re: /hermes[\\/]|\.env\b|config\.ya?ml|access_token|api[_-]?key|passwor/i, text: 'Berührt Zugangsdaten oder Hermes-Einstellungen', stufe: 'gefahr' },
  { re: /\b(unlink|rmSync|rmdir|rm)\s*\(|\.rm\(|unlinkSync/, text: 'Löscht Dateien', stufe: 'gefahr' },
  { re: /\b(writeFile|writeFileSync|appendFile|appendFileSync|copyFile|copyFileSync|rename|renameSync|mkdir|mkdirSync)\b/, text: 'Schreibt Dateien auf dem PC (außerhalb der eigenen Plugin-Daten)', stufe: 'achtung' },
  { re: /require\(\s*['"]electron['"]\s*\)/, text: 'Nutzt Electron direkt (Fenster, System)', stufe: 'achtung' },
  { re: /process\.env/, text: 'Liest Umgebungsvariablen', stufe: 'achtung' },
  { re: /window\.jarves/, text: 'Nutzt Jarves-OS-Funktionen direkt statt über ctx', stufe: 'achtung' },
  { re: /\b(confirm|alert|prompt)\s*\(/, text: 'Nutzt Windows-Fenster (confirm/alert) statt ctx.bestaetigen/ctx.hinweis', stufe: 'hinweis' }
]

function pruefen(idRoh, { ordnerBasis = WERKSTATT } = {}) {
  const id = idPruefen(idRoh)
  const ordner = path.join(ordnerBasis, id)
  const fehler = []
  const rechte = []
  const internet = new Set()
  if (!fs.existsSync(ordner)) return { id, fehler: ['Den Entwurf gibt es nicht (mehr).'], rechte, internet: [], stufe: 'fehler', dateien: [] }
  const dateien = []
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    if (e.isDirectory()) {
      fehler.push(`Unterordner „${e.name}“ ist nicht vorgesehen.`)
      continue
    }
    const groesse = fs.statSync(path.join(ordner, e.name)).size
    dateien.push({ name: e.name, groesse })
    if (e.name === 'daten.json') rechte.push({ text: 'Bringt Startdaten mit (daten.json)', stufe: 'hinweis' })
    else if (!ERLAUBT.has(e.name)) fehler.push(`Datei „${e.name}“ gehört nicht in ein Plugin.`)
    if (groesse > MAX_DATEI) fehler.push(`„${e.name}“ ist ungewöhnlich groß (${Math.round(groesse / 1000)} KB).`)
  }
  const m = manifestVon(ordner)
  if (!m) fehler.push('plugin.json fehlt oder ist kaputt.')
  else {
    if (m.id !== id) fehler.push(`In plugin.json steht die id „${m.id}“, der Ordner heißt „${id}“.`)
    if (!m.name) fehler.push('plugin.json: Name fehlt.')
    if (!m.bereich && !lesen(path.join(ordner, 'ansicht.js'))?.includes('karte(')) rechte.push({ text: 'Hat keinen eigenen Bereich in der Leiste', stufe: 'hinweis' })
    if (m.luzzy?.stichwoerter) {
      try {
        new RegExp(m.luzzy.stichwoerter, 'i')
      } catch {
        fehler.push('plugin.json: die Stichwörter für Luzzy sind kein gültiger Ausdruck.')
      }
    }
  }
  const ansicht = lesen(path.join(ordner, 'ansicht.js'))
  if (ansicht == null) fehler.push('ansicht.js fehlt.')
  else {
    if (!/export\s+(async\s+)?function\s+starten\s*\(/.test(ansicht)) fehler.push('ansicht.js: „export async function starten(ctx)“ fehlt.')
    const f = syntaxFehler(ansicht, true)
    if (f) fehler.push(`ansicht.js: ${f}`)
  }
  const haupt = lesen(path.join(ordner, 'haupt.js'))
  if (haupt != null) {
    rechte.push({ text: 'Hat einen Hintergrundteil (haupt.js): läuft mit vollen Rechten auf dem PC', stufe: 'achtung' })
    const f = syntaxFehler(haupt, false)
    if (f) fehler.push(`haupt.js: ${f}`)
    if (!/module\.exports\s*=/.test(haupt)) fehler.push('haupt.js: „module.exports = (ctx) => { … }“ fehlt.')
  }
  const code = `${ansicht || ''}\n${haupt || ''}`
  for (const mu of MUSTER) if (mu.re.test(code)) rechte.push({ text: mu.text, stufe: mu.stufe })
  for (const t of code.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) internet.add(t[1].toLowerCase())
  if (internet.size) rechte.push({ text: `Holt Daten aus dem Internet: ${[...internet].join(', ')}`, stufe: 'achtung' })
  if (/\bfetch\s*\(/.test(ansicht || '')) rechte.push({ text: 'Versucht direkt aus der Oberfläche ins Internet (geht in Jarves-OS nicht, gehört in haupt.js)', stufe: 'hinweis' })
  const stufe = fehler.length ? 'fehler' : rechte.some((r) => r.stufe === 'gefahr') ? 'gefahr' : rechte.some((r) => r.stufe === 'achtung') ? 'achtung' : 'sicher'
  return { id, name: m?.name || id, beschreibung: m?.beschreibung || '', version: m?.version || '', fehler, rechte, internet: [...internet], stufe, dateien, ersetzt: fs.existsSync(path.join(PLUGINS, id)) }
}

function code(idRoh) {
  const ordner = path.join(WERKSTATT, idPruefen(idRoh))
  const aus = {}
  for (const name of ['plugin.json', 'ansicht.js', 'haupt.js', 'stil.css']) {
    const t = lesen(path.join(ordner, name))
    if (t != null) aus[name] = t.length > 60_000 ? `${t.slice(0, 60_000)}\n… (gekürzt)` : t
  }
  return aus
}

// Einbauen: altes Plugin sichern (daten.json bleibt), Entwurf nach plugins\ kopieren, Entwurf entfernen
function einbauen(idRoh) {
  const id = idPruefen(idRoh)
  if (EIGENE.has(id)) throw new Error('Die Werkstatt kann sich nicht selbst ersetzen.')
  const bericht = pruefen(id)
  if (bericht.fehler.length) throw new Error(`Der Entwurf hat noch Fehler: ${bericht.fehler[0]}`)
  const quelle = path.join(WERKSTATT, id)
  const ziel = path.join(PLUGINS, id)
  let gesichert = null
  let daten = null
  if (fs.existsSync(ziel)) {
    gesichert = path.join(SICHERUNG, `plugin-${id}_${zeitstempel()}`)
    fs.mkdirSync(SICHERUNG, { recursive: true })
    fs.cpSync(ziel, gesichert, { recursive: true })
    daten = lesen(path.join(ziel, 'daten.json'))
    fs.rmSync(ziel, { recursive: true, force: true })
  }
  fs.cpSync(quelle, ziel, { recursive: true })
  if (daten != null) fs.writeFileSync(path.join(ziel, 'daten.json'), daten, 'utf8') // Felix' Daten behalten
  fs.rmSync(quelle, { recursive: true, force: true })
  return { id, neu: !gesichert, gesichert: gesichert ? path.basename(gesichert) : null }
}

// Entwurf verwerfen (in den Papierkorb)
async function verwerfen(idRoh) {
  const ordner = path.join(WERKSTATT, idPruefen(idRoh))
  if (!fs.existsSync(ordner)) return true
  await require('electron').shell.trashItem(ordner)
  return true
}

// Vorhandenes Plugin zum Ändern in die Werkstatt holen (ohne daten.json, die bleibt beim Plugin)
function zumAendern(idRoh) {
  const id = idPruefen(idRoh)
  if (EIGENE.has(id)) throw new Error('Die Werkstatt kann sich nicht selbst ändern.')
  const quelle = path.join(PLUGINS, id)
  const ziel = path.join(WERKSTATT, id)
  if (!fs.existsSync(quelle)) throw new Error('Das Plugin gibt es nicht.')
  if (!fs.existsSync(ziel)) {
    fs.mkdirSync(ziel, { recursive: true })
    for (const name of fs.readdirSync(quelle)) if (ERLAUBT.has(name)) fs.copyFileSync(path.join(quelle, name), path.join(ziel, name))
  }
  return { id, ordner: ziel }
}

// Installiertes Plugin entfernen (in den Papierkorb, vorher Sicherung)
async function entfernen(idRoh) {
  const id = idPruefen(idRoh)
  if (EIGENE.has(id)) throw new Error('Die Werkstatt kann sich nicht selbst entfernen.')
  const ordner = path.join(PLUGINS, id)
  if (!fs.existsSync(ordner)) return true
  fs.mkdirSync(SICHERUNG, { recursive: true })
  fs.cpSync(ordner, path.join(SICHERUNG, `plugin-${id}_${zeitstempel()}`), { recursive: true })
  await require('electron').shell.trashItem(ordner)
  return true
}

function neuStarten() {
  const { app } = require('electron')
  setTimeout(() => {
    app.relaunch()
    app.quit()
  }, 300)
  return true
}

module.exports = (ctx) => {
  fs.mkdirSync(WERKSTATT, { recursive: true })
  ctx.bereitstellen('pfade', () => ({ werkstatt: WERKSTATT, plugins: PLUGINS }))
  ctx.bereitstellen('neueId', neueId)
  ctx.bereitstellen('entwuerfe', entwuerfe)
  ctx.bereitstellen('installierte', installierte)
  ctx.bereitstellen('pruefen', (id) => pruefen(id))
  ctx.bereitstellen('code', code)
  ctx.bereitstellen('einbauen', einbauen)
  ctx.bereitstellen('verwerfen', verwerfen)
  ctx.bereitstellen('zumAendern', zumAendern)
  ctx.bereitstellen('entfernen', entfernen)
  ctx.bereitstellen('neuStarten', neuStarten)
}
