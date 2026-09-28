// Werkstatt, Hintergrundteil: Entwürfe verwalten, prüfen, einbauen.
// Luzzy baut neue Plugins in jarves-os\werkstatt\<id>\ (nie direkt in plugins\). Jarves-OS prüft sie hier
// (Aufbau, Syntax, welche Rechte der Code nutzt) und kopiert sie erst nach Felix' Ja nach plugins\<id>\.
// Ersetzte Plugins werden vorher nach Desktop\jarves-os\backup\ gesichert, ihre daten.json bleibt erhalten.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

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
      const dateien = fs.readdirSync(ordner).filter((d) => !d.startsWith('.'))
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
    if (e.name.startsWith('.')) continue // z. B. .testbericht.json (Bericht des Testlaufs für Luzzy)
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
  const t = testErgebnis(id)
  if (!t || t.veraltet || !t.ok) throw new Error('Erst den Testlauf machen: Das Plugin muss dort ohne Fehler laufen.')
  if (test?.id === id) testBeenden()
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
  fs.cpSync(quelle, ziel, { recursive: true, filter: (q) => !path.basename(q).startsWith('.') }) // ohne .testbericht.json
  if (daten != null) fs.writeFileSync(path.join(ziel, 'daten.json'), daten, 'utf8') // Felix' Daten behalten
  fs.rmSync(quelle, { recursive: true, force: true })
  testErgebnisse.delete(id)
  lader.neuMerken?.(id) // Notbremse: startet Jarves-OS damit nicht richtig, wird es beim nächsten Start abgeschaltet
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
  lader.vergessen?.(id) // Notbremse-Hinweis verschwindet mit dem Plugin
  return true
}

// ── Testlauf: eigenes Fenster (getrennter Prozess), Hintergrundteil in einem eigenen Node-Prozess ──
const testErgebnisse = new Map() // id → { ok, gestartet, fehler, stand }
let test = null // { id, fenster, kind, offen: Map(nr → { fertig, fehler, uhr }), nr, info }

const standVon = (ordner) => Math.max(0, ...fs.readdirSync(ordner).filter((d) => !d.startsWith('.')).map((d) => fs.statSync(path.join(ordner, d)).mtimeMs))
const dateiUrl = (datei) => require('node:url').pathToFileURL(datei).href

function testBeenden() {
  if (!test) return
  const t = test
  test = null
  for (const { fehler, uhr } of t.offen.values()) {
    clearTimeout(uhr)
    fehler(new Error('Test beendet.'))
  }
  t.kind?.kill()
  if (t.fenster && !t.fenster.isDestroyed()) t.fenster.destroy()
}

function kindStarten(t, hauptDatei, daten) {
  const kind = spawn(process.execPath, [path.join(__dirname, 'test-runner.js'), hauptDatei, JSON.stringify(daten || {})], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    cwd: path.dirname(hauptDatei),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  t.kind = kind
  const anFenster = (n) => t.fenster && !t.fenster.isDestroyed() && t.fenster.webContents.send('werkstatt-test:kind', n)
  let bereit = false
  const haengt = setTimeout(() => {
    if (bereit) return
    anFenster({ typ: 'fehler', text: 'Der Hintergrundteil startet nicht (hängt er sich auf?). Test-Prozess beendet.' })
    kind.kill()
  }, 10000)
  let rest = ''
  kind.stdout.on('data', (d) => {
    rest += d.toString()
    const zeilen = rest.split('\n')
    rest = zeilen.pop()
    for (const z of zeilen) {
      let n
      try {
        n = JSON.parse(z)
      } catch {
        continue
      }
      if (n.typ === 'bereit') {
        bereit = true
        clearTimeout(haengt)
      }
      if (n.typ === 'antwort') {
        const offen = t.offen.get(n.nr)
        if (!offen) continue
        t.offen.delete(n.nr)
        clearTimeout(offen.uhr)
        if (n.fehler) offen.fehler(new Error(n.fehler))
        else offen.fertig(n.wert)
      } else anFenster(n)
    }
  })
  kind.stderr.on('data', (d) => anFenster({ typ: 'log', text: `Hintergrundteil: ${d.toString().trim().slice(0, 300)}` }))
  kind.on('exit', (code) => {
    clearTimeout(haengt)
    if (test === t && code) anFenster({ typ: 'fehler', text: `Der Hintergrundteil wurde beendet (Code ${code}).` })
  })
}

function testStarten(idRoh) {
  const id = idPruefen(idRoh)
  const ordner = path.join(WERKSTATT, id)
  const bericht = pruefen(id)
  if (bericht.fehler.length) throw new Error(`Erst die Fehler beheben lassen: ${bericht.fehler[0]}`)
  testBeenden()
  const { BrowserWindow } = require('electron')
  const m = manifestVon(ordner)
  const datenDatei = [path.join(ordner, 'daten.json'), path.join(PLUGINS, id, 'daten.json')].find((d) => fs.existsSync(d))
  let daten = {}
  try {
    daten = datenDatei ? JSON.parse(fs.readFileSync(datenDatei, 'utf8')) : {}
  } catch {
    daten = {}
  }
  const t = { id, offen: new Map(), nr: 0, stand: standVon(ordner) }
  t.info = {
    id,
    name: m?.name || id,
    bereich: m?.bereich?.name || m?.name || id,
    beschreibung: m?.beschreibung || '',
    ansichtUrl: dateiUrl(path.join(ordner, 'ansicht.js')),
    stilUrl: fs.existsSync(path.join(ordner, 'stil.css')) ? dateiUrl(path.join(ordner, 'stil.css')) : null,
    hatHaupt: fs.existsSync(path.join(ordner, 'haupt.js')),
    daten
  }
  t.fenster = new BrowserWindow({
    width: 1200,
    height: 860,
    title: `Testlauf: ${t.info.name}`,
    backgroundColor: '#0d0c0b',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'test-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  t.fenster.on('closed', () => {
    if (test === t) testBeenden()
  })
  test = t
  testErgebnisse.set(id, { ok: false, gestartet: false, fehler: [], stand: t.stand, laeuft: true })
  if (t.info.hatHaupt) kindStarten(t, path.join(ordner, 'haupt.js'), daten)
  t.fenster.loadFile(path.join(__dirname, 'test.html'))
  return true
}

function testErgebnis(idRoh) {
  const id = idPruefen(idRoh)
  const e = testErgebnisse.get(id)
  const ordner = path.join(WERKSTATT, id)
  if (!e || !fs.existsSync(ordner)) return null
  return { ...e, veraltet: standVon(ordner) !== e.stand, laeuft: test?.id === id }
}

// Verbindung zum Testfenster (einmal einrichten; bei erneutem Laden der Plugins nicht doppelt)
function testKanaeleEinrichten() {
  const { ipcMain } = require('electron')
  if (!ipcMain) return // außerhalb von Electron (z. B. beim Prüfen im Terminal): kein Testfenster
  for (const k of ['werkstatt-test:info', 'werkstatt-test:aufrufen']) ipcMain.removeHandler(k)
  ipcMain.removeAllListeners('werkstatt-test:bericht')
  const vomTest = (e) => (test && e.sender === test.fenster?.webContents ? test : null)
  ipcMain.handle('werkstatt-test:info', (e) => vomTest(e)?.info || null)
  ipcMain.handle('werkstatt-test:aufrufen', (e, name, argumente) => {
    const t = vomTest(e)
    if (!t) throw new Error('Kein Test aktiv.')
    if (!t.kind || t.kind.exitCode != null) throw new Error('Das Plugin hat keinen (laufenden) Hintergrundteil.')
    return new Promise((fertig, fehler) => {
      const nr = ++t.nr
      const uhr = setTimeout(() => {
        t.offen.delete(nr)
        fehler(new Error(`„${name}“ antwortet nicht innerhalb von 20 Sekunden.`))
      }, 20000)
      t.offen.set(nr, { fertig, fehler, uhr })
      t.kind.stdin.write(`${JSON.stringify({ nr, name: String(name), argumente: Array.isArray(argumente) ? argumente : [] })}\n`)
    })
  })
  ipcMain.on('werkstatt-test:bericht', (e, b) => {
    const t = vomTest(e)
    if (!t) return
    const ergebnis = { ok: Boolean(b?.ok), gestartet: Boolean(b?.gestartet), fehler: Array.isArray(b?.fehler) ? b.fehler.slice(0, 20).map(String) : [], stand: t.stand }
    testErgebnisse.set(t.id, ergebnis)
    // Für Luzzy: Bericht des Testlaufs in den Entwurf legen (sie liest ihn beim Reparieren)
    try {
      fs.writeFileSync(path.join(WERKSTATT, t.id, '.testbericht.json'), JSON.stringify({ zeit: new Date().toISOString(), ok: ergebnis.ok, gestartet: ergebnis.gestartet, fehler: ergebnis.fehler }, null, 2), 'utf8')
    } catch {
      // Entwurf gerade weg: egal
    }
  })
}

// ── Notbremse (siehe src/main/plugins.js): neue Plugins, mit denen Jarves-OS nicht richtig startet, werden abgeschaltet ──
const lader = require('../../src/main/plugins')

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
  testKanaeleEinrichten()
  ctx.bereitstellen('testStarten', testStarten)
  ctx.bereitstellen('testErgebnis', testErgebnis)
  ctx.bereitstellen('notbremse', () => lader.notbremse?.() || { jetzt: [], aus: [] })
  ctx.bereitstellen('wiederEinschalten', (id) => lader.wiederEinschalten?.(idPruefen(id)) ?? false)
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
// Für das Prüfprogramm (pruefen-cli.js), mit dem Luzzy ihre Entwürfe selbst prüft
module.exports.pruefen = pruefen
module.exports.WERKSTATT = WERKSTATT
