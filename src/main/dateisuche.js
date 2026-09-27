// Dateisuche: „Luzzy, such die Datei Thor-Hoodie und öffne sie“. Sucht nach Dateinamen auf dem ganzen PC (alle
// Laufwerke, auch AppData) und zeigt die Datei in Jarves-OS an. Ausgelassen: Windows- und Programmordner, Papierkorb,
// Zwischenspeicher, Entwickler-Ordner und Dateien mit Zugangsdaten (Hermes-Einstellungen, Schlüssel, Passwörter).
// Nur lesen: hier wird nichts verändert. Die Oberfläche bekommt keine Pfade zum Öffnen, nur Kennungen aus
// einer Suche; nur diese Dateien dürfen angezeigt werden (Protokoll jarves-datei://<kennung>).
// Das Verzeichnis (nur Pfade) liegt in daten/dateiindex.txt, damit die Suche nach einem Neustart sofort geht;
// im Hintergrund wird es alle 30 Minuten frisch eingelesen.

const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomBytes } = require('node:crypto')
const { net } = require('electron')
const { pathToFileURL } = require('node:url')
const { WURZEL } = require('./wissen')

// Systemordner: nie durchsuchen, nie anzeigen (klein geschrieben)
const SYSTEM = new Set([
  'windows', 'windows.old', 'program files', 'program files (x86)', 'programdata', '$recycle.bin', 'system volume information',
  'recovery', 'perflogs', '$windows.~bt', '$windows.~ws', '$winreagent', 'msocache', 'config.msi',
  // Verknüpfungen von Windows auf andere Ordner (sonst doppelt oder im Kreis)
  'application data', 'local settings', 'all users', 'default user', 'anwendungsdaten', 'lokale einstellungen'
])
// Nur beim Einlesen auslassen: Zwischenspeicher und Entwickler-Ordner (Hunderttausende Dateien ohne Nutzen)
const UEBERSPRINGEN = new Set([
  ...SYSTEM, 'node_modules', '__pycache__', '.venv', 'venv', 'firecrawl-selfhost', 'kynto backups',
  'temp', 'tmp', 'cache', 'caches', 'cache2', 'code cache', 'gpucache', 'shadercache', 'dawncache', 'dawngraphitecache', 'dawnwebgpucache',
  'grshadercache', 'cache_data', 'npm-cache', 'service worker', 'crashpad', 'crashdumps', 'inetcache', 'webcache', 'indexeddb',
  'blob_storage', 'd3dscache', 'nvidia corporation', 'packages', 'wer'
])
const MAX_DATEIEN = 600_000
const MAX_TIEFE = 16
const PARALLEL = 8
const INDEX_ALTER = 30 * 60 * 1000
const MAX_TEXT = 2_000_000
const INDEX_DATEI = path.join(__dirname, '..', '..', 'daten', 'dateiindex.txt')
const INDEX_VERSION = 'v3' // ändert sich, wenn sich ändert, was eingelesen wird: altes Verzeichnis dann verwerfen

const ARTEN = {
  markdown: ['.md', '.markdown'],
  text: ['.txt', '.log', '.json', '.js', '.ts', '.py', '.html', '.htm', '.css', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.bat', '.ps1', '.sh', '.env.example'],
  tabelle: ['.csv', '.tsv'],
  bild: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'],
  pdf: ['.pdf'],
  video: ['.mp4', '.webm', '.mov', '.m4v'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
}
const artVon = (datei) => {
  const endung = path.extname(datei).toLowerCase()
  return Object.keys(ARTEN).find((a) => ARTEN[a].includes(endung)) || 'andere'
}

// Nie finden, nie anzeigen: Systemordner und Dateien mit Zugangsdaten, auch nicht, wenn Luzzy den Pfad nennt.
// Dazu gehören Hermes' Einstellungen (dort steht der Shopify-Zugang), Browser-Passwörter und Windows-Anmeldedaten.
const GEHEIM = /(^|[\\/])(\.env(\..*)?|id_rsa.*|id_ed25519.*|.*\.pem|.*\.key|.*\.pfx|.*\.p12|.*\.kdbx|credentials.*|auth.*\.json|login data.*|cookies.*|web data.*|local state)$/i
const GEHEIME_ORDNER = /[\\/](hermes|\.hermes)[\\/](.*[\\/])?(config\.ya?ml|.*\.env|auth[^\\/]*|.*token[^\\/]*|.*secret[^\\/]*)$|[\\/]microsoft[\\/](credentials|protect|crypto|vault)[\\/]/i
function gesperrt(voll) {
  const teile = voll.toLowerCase().split(/[\\/]+/)
  if (teile.some((t) => SYSTEM.has(t))) return true
  return GEHEIM.test(voll) || GEHEIME_ORDNER.test(voll)
}

// Wo gesucht wird: alle Laufwerke (Windows), sonst der Benutzerordner. Testmodus: JARVES_TEST_DATEIEN
async function wurzeln() {
  if (process.env.JARVES_TEST_DATEIEN) return [process.env.JARVES_TEST_DATEIEN]
  if (process.platform !== 'win32') return [os.homedir()]
  const liste = []
  for (const buchstabe of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const w = `${buchstabe}:\\`
    try {
      await fs.access(w)
      liste.push(w)
    } catch {
      // Laufwerk gibt es nicht (oder leeres Kartenlesegerät)
    }
  }
  return liste
}

// Umlaute & Co. vereinheitlichen, damit „Thor Hoodie“ auch „thor-hoodie_final.PNG“ findet
const normal = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[_\-.+()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Verzeichnis, platzsparend: Ordner einmal, Dateien verweisen auf ihren Ordner
function leererIndex() {
  return { ordner: [], ordnerNormal: [], namen: [], namenNormal: [], ordnerVon: [], fertig: false, zeit: 0 }
}
function ordnerDazu(ix, ordner) {
  ix.ordner.push(ordner)
  ix.ordnerNormal.push(normal(ordner))
  return ix.ordner.length - 1
}
function dateiDazu(ix, ordnerNr, name) {
  ix.namen.push(name)
  ix.namenNormal.push(normal(name))
  ix.ordnerVon.push(ordnerNr)
}

let index = null // fertiges (oder von der Festplatte geladenes) Verzeichnis
let imAufbau = null // wird gerade eingelesen (Suche nutzt es, solange es noch kein fertiges gibt)
let laeuft = null

async function einlesen() {
  const ix = leererIndex()
  imAufbau = ix
  const gesehen = new Set() // echte Pfade verlinkter Ordner, gegen Schleifen
  const schlange = (await wurzeln()).map((w) => ({ ordner: w, tiefe: 0 }))
  const arbeiter = async () => {
    while (schlange.length && ix.namen.length < MAX_DATEIEN) {
      const { ordner, tiefe } = schlange.shift()
      let eintraege
      try {
        eintraege = await fs.readdir(ordner, { withFileTypes: true })
      } catch {
        continue // kein Zugriff
      }
      const nr = ordnerDazu(ix, ordner)
      for (const e of eintraege) {
        const name = e.name
        if (name.startsWith('.') || name.startsWith('~$') || UEBERSPRINGEN.has(name.toLowerCase())) continue
        const voll = path.join(ordner, name)
        let istOrdner = e.isDirectory()
        let istDatei = e.isFile()
        // OneDrive-Dateien und Verknüpfungen meldet Windows als Link: nachsehen, was dahinter ist
        if (e.isSymbolicLink()) {
          try {
            const info = await fs.stat(voll)
            istOrdner = info.isDirectory()
            istDatei = info.isFile()
            if (istOrdner) {
              const echt = await fs.realpath(voll)
              if (gesehen.has(echt)) continue
              gesehen.add(echt)
            }
          } catch {
            continue
          }
        }
        if (istOrdner) {
          if (tiefe < MAX_TIEFE) schlange.push({ ordner: voll, tiefe: tiefe + 1 })
        } else if (istDatei && !gesperrt(voll)) {
          dateiDazu(ix, nr, name)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter))
  ix.fertig = true
  ix.zeit = Date.now()
  index = ix
  imAufbau = null
  speichern(ix).catch(() => {})
  return ix
}

// Verzeichnis auf der Festplatte: Zeile 1 Zeit, dann „O<Tab>Pfad“ für Ordner und „D<Tab>Ordnernummer<Tab>Name“
async function speichern(ix) {
  const zeilen = [`${INDEX_VERSION} ${ix.zeit}`]
  ix.ordner.forEach((o) => zeilen.push(`O\t${o}`))
  for (let i = 0; i < ix.namen.length; i++) zeilen.push(`D\t${ix.ordnerVon[i]}\t${ix.namen[i]}`)
  await fs.mkdir(path.dirname(INDEX_DATEI), { recursive: true })
  await fs.writeFile(INDEX_DATEI, zeilen.join('\n'), 'utf8')
}
function laden() {
  if (process.env.JARVES_TEST_DATEIEN) return null
  try {
    const zeilen = fsSync.readFileSync(INDEX_DATEI, 'utf8').split('\n')
    const [version, zeit] = zeilen[0].split(' ')
    if (version !== INDEX_VERSION) return null // von einer älteren Jarves-Version: neu einlesen
    const ix = leererIndex()
    ix.zeit = Number(zeit) || 0
    for (let i = 1; i < zeilen.length; i++) {
      const z = zeilen[i]
      if (z.startsWith('O\t')) ordnerDazu(ix, z.slice(2))
      else if (z.startsWith('D\t')) {
        const tab = z.indexOf('\t', 2)
        dateiDazu(ix, Number(z.slice(2, tab)), z.slice(tab + 1))
      }
    }
    ix.fertig = true
    return ix.namen.length ? ix : null
  } catch {
    return null
  }
}

function aktualisieren() {
  if (!laeuft) laeuft = einlesen().catch(() => null).finally(() => (laeuft = null))
  return laeuft
}
// Zum Suchen: das fertige Verzeichnis (bei Bedarf im Hintergrund frisch einlesen), sonst das, was schon da ist
function verzeichnis() {
  if (!index) index = laden()
  if (!index || Date.now() - index.zeit > INDEX_ALTER) aktualisieren()
  return index || imAufbau || leererIndex()
}
function stand() {
  const ix = index || imAufbau
  return { dateien: ix ? ix.namen.length : 0, fertig: Boolean(index), laeuft: Boolean(laeuft) }
}

// Freigegebene Treffer: Kennung → voller Pfad (nur diese darf die Oberfläche anzeigen/öffnen)
const freigegeben = new Map()
function freigeben(voll) {
  for (const [id, p] of freigegeben) if (p === voll) return id
  const id = randomBytes(9).toString('hex')
  freigegeben.set(id, voll)
  if (freigegeben.size > 500) freigegeben.delete(freigegeben.keys().next().value)
  return id
}
function pfadVon(id) {
  const voll = freigegeben.get(String(id || ''))
  if (!voll) throw new Error('Diese Datei ist nicht (mehr) freigegeben. Bitte neu suchen.')
  return voll
}

// Kleine Tippfehler/Hörfehler erlauben („thor hudi“ → „thor hoodie“): Abstand höchstens 1 (ab 7 Zeichen: 2)
function aehnlich(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false
  const grenze = a.length >= 7 ? 2 : 1
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i]
    let kleinste = i
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      kleinste = Math.min(kleinste, jetzt[j])
    }
    if (kleinste > grenze) return false
    vorher = jetzt
  }
  return vorher[b.length] <= grenze
}

// Laufwerk als Ortsangabe („auf Laufwerk D“): nur dort suchen. Ordnernamen („Desktop“, „Donnerwolf“) brauchen
// keine Sonderbehandlung: jedes Wort darf auch im Ordnerpfad stehen (zählt dann weniger als im Dateinamen).
function ortAus(worte) {
  const filter = []
  const rest = []
  for (let i = 0; i < worte.length; i++) {
    if ((worte[i] === 'laufwerk' || worte[i] === 'platte') && /^[a-z]$/.test(worte[i + 1] || '')) {
      filter.push({ laufwerk: `${worte[i + 1]}:` })
      i++
    } else rest.push(worte[i])
  }
  return { worte: rest, filter }
}
const passtZuOrt = (ordner, filter) => filter.every((f) => ordner.toLowerCase().startsWith(f.laufwerk))

// Suchen: alle Wörter müssen im Dateinamen (oder im Ordnerpfad) vorkommen. Beste zuerst.
// Findet das nichts: mit kleinen Hör- und Tippfehlern, danach reicht die Mehrheit der Wörter (Treffer „ungefähr“).
async function suchen(anfrage, { max = 8 } = {}) {
  const alle = normal(anfrage).split(' ').filter(Boolean)
  const { worte, filter } = ortAus(alle)
  if (!worte.length) return []
  const ix = verzeichnis()
  const ganz = worte.join(' ')
  let treffer = durchsuchen(ix, worte, ganz, filter, 'genau')
  let ungefaehr = false
  if (!treffer.length) {
    ungefaehr = true
    treffer = durchsuchen(ix, worte, ganz, filter, 'hoerfehler')
    if (!treffer.length && worte.length > 1) treffer = durchsuchen(ix, worte, ganz, filter, 'mehrheit')
  }
  return ergebnis(ix, treffer, max, ungefaehr)
}

function durchsuchen(ix, worte, ganz, filter, art) {
  const treffer = []
  const noetig = art === 'mehrheit' ? Math.ceil(worte.length / 2) : worte.length
  for (let i = 0; i < ix.namen.length; i++) {
    const name = ix.namenNormal[i]
    let punkte = 0
    let gefunden = 0
    let imNamen = true
    let lang = false
    for (const w of worte) {
      if (name.includes(w)) {
        punkte += name.split(' ').includes(w) ? 3 : 2
        gefunden++
        if (w.length >= 4) lang = true
      } else if (art === 'hoerfehler' && w.length >= 4 && name.split(' ').some((t) => aehnlich(w, t))) {
        punkte += 1
        gefunden++
        lang = true
      } else if (art !== 'mehrheit' && ix.ordnerNormal[ix.ordnerVon[i]].includes(w)) {
        punkte += 1
        gefunden++
        imNamen = false
      } else if (art !== 'mehrheit') break
    }
    if (gefunden < noetig || (art === 'mehrheit' && !lang)) continue
    if (filter.length && !passtZuOrt(ix.ordner[ix.ordnerVon[i]], filter)) continue
    const ohneEndung = normal(path.parse(ix.namen[i]).name)
    if (ohneEndung === ganz || name === ganz) punkte += 10
    else if (name.startsWith(ganz)) punkte += 4
    treffer.push({ i, punkte, imNamen })
  }
  return treffer
}

async function ergebnis(ix, treffer, max, ungefaehr) {
  treffer.sort((a, b) => b.punkte - a.punkte || ix.namen[a.i].length - ix.namen[b.i].length)
  const beste = treffer.slice(0, max * 3)
  // Änderungsdatum nur für die Kandidaten holen (schnell), bei Gleichstand gewinnt die neuere Datei
  await Promise.all(
    beste.map(async (t) => {
      t.voll = path.join(ix.ordner[ix.ordnerVon[t.i]], ix.namen[t.i])
      try {
        const info = await fs.stat(t.voll)
        t.geaendert = info.mtimeMs
        t.groesse = info.size
      } catch {
        t.weg = true
      }
    })
  )
  return beste
    .filter((t) => !t.weg && !gesperrt(t.voll))
    .sort((a, b) => b.punkte - a.punkte || b.geaendert - a.geaendert)
    .slice(0, max)
    .map((t) => beschreiben(t.voll, { geaendert: t.geaendert, groesse: t.groesse, imNamen: t.imNamen, ungefaehr }))
}

// Für die Anzeige: „Desktop › Shop“ statt des ganzen Pfads, wo es geht
function beschreiben(voll, rest) {
  const ordner = path.dirname(voll)
  const heim = os.homedir()
  const imHeim = ordner.toLowerCase().startsWith(heim.toLowerCase() + path.sep)
  const teile = (imHeim ? path.relative(heim, ordner) : ordner).split(/[\\/]+/).filter(Boolean)
  const [ort = ordner, ...unter] = teile
  return { id: freigeben(voll), name: path.basename(voll), ort, ordner: unter.join(' › '), art: artVon(voll), ...rest }
}

// Felix nennt einen vollen Pfad (oder er steht in Luzzys Antwort): jede Datei auf dem PC, nur zum Anzeigen,
// außer Systemordnern, AppData und Dateien mit Zugangsdaten
async function pfadTreffer(pfad) {
  const voll = path.resolve(String(pfad || '').trim().replace(/^["']|["']$/g, ''))
  if (gesperrt(voll)) throw new Error('Diese Datei zeigt Jarves-OS nicht an (Systemordner oder Zugangsdaten).')
  let info
  try {
    info = await fs.stat(voll)
  } catch {
    throw new Error('Die Datei gibt es nicht (mehr).')
  }
  if (!info.isFile()) throw new Error('Das ist ein Ordner, keine Datei.')
  return beschreiben(voll, { geaendert: info.mtimeMs, groesse: info.size, imNamen: true })
}

const PROGRAMME = new Set(['.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr', '.lnk', '.jar', '.reg', '.hta', '.cpl', '.pif', '.url'])
const istProgramm = (voll) => PROGRAMME.has(path.extname(voll).toLowerCase())

// Inhalt für die Anzeige: Text direkt, alles andere über jarves-datei://<id>
async function inhalt(id) {
  const voll = pfadVon(id)
  const info = await fs.stat(voll)
  const art = artVon(voll)
  const basis = { id, name: path.basename(voll), art, groesse: info.size, geaendert: info.mtimeMs, ordner: path.dirname(voll) }
  if (['markdown', 'text', 'tabelle'].includes(art)) {
    if (info.size > MAX_TEXT) return { ...basis, art: 'andere', hinweis: 'Die Datei ist zu groß für die Anzeige.' }
    return { ...basis, text: await fs.readFile(voll, 'utf8'), bearbeitbar: bearbeitbar(voll), rueckgaengig: Boolean(letzteSicherung.get(voll)) }
  }
  if (['bild', 'pdf', 'video', 'audio'].includes(art)) return { ...basis, url: `jarves-datei://${id}/${encodeURIComponent(path.basename(voll))}` }
  return basis
}

// ── Bearbeiten: nur Text (Notizen, Texte, CSV) und nur, wenn Felix auf „Speichern“ klickt ──
// Vor jedem Speichern kommt die alte Fassung nach daten/datei-sicherungen/ (Rückgängig holt die letzte zurück).
// Wurde die Datei inzwischen woanders geändert (anderes Programm, OneDrive), wird nicht überschrieben.
const SICHERUNGEN = path.join(__dirname, '..', '..', 'daten', 'datei-sicherungen')
const letzteSicherung = new Map() // voller Pfad → Sicherungsdatei
const bearbeitbar = (voll) => ['markdown', 'text', 'tabelle'].includes(artVon(voll)) && !gesperrt(voll) && !istProgramm(voll)

async function sichern(voll) {
  await fs.mkdir(SICHERUNGEN, { recursive: true })
  const stempel = new Date().toISOString().replace(/[:.]/g, '-')
  const ziel = path.join(SICHERUNGEN, `${stempel}__${path.basename(voll)}`)
  await fs.copyFile(voll, ziel)
  letzteSicherung.set(voll, ziel)
  return ziel
}

async function speichern(id, text, geaendertBeimLaden) {
  const voll = pfadVon(id)
  if (!bearbeitbar(voll)) throw new Error('Diese Datei kann Jarves-OS nicht bearbeiten.')
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Der Text ist zu groß.')
  const info = await fs.stat(voll)
  if (geaendertBeimLaden && Math.abs(info.mtimeMs - geaendertBeimLaden) > 1) {
    throw new Error('Die Datei wurde inzwischen woanders geändert. Schließ sie und öffne sie neu, damit nichts verloren geht.')
  }
  await sichern(voll)
  await fs.writeFile(voll, text, 'utf8')
  const neu = await fs.stat(voll)
  return { geaendert: neu.mtimeMs, groesse: neu.size, sicherung: true }
}

// Rückgängig: die Fassung vor dem letzten Speichern zurückholen (die aktuelle wird vorher auch gesichert)
async function rueckgaengig(id) {
  const voll = pfadVon(id)
  const alt = letzteSicherung.get(voll)
  if (!alt) throw new Error('Es gibt nichts rückgängig zu machen.')
  const text = await fs.readFile(alt, 'utf8')
  await sichern(voll)
  letzteSicherung.set(voll, null)
  await fs.writeFile(voll, text, 'utf8')
  const neu = await fs.stat(voll)
  return { text, geaendert: neu.mtimeMs, groesse: neu.size }
}

// Für protocol.handle('jarves-datei'): nur freigegebene Dateien. net.fetch liefert sie gestreamt mit passendem Typ
// (auch Vor- und Zurückspulen bei Videos).
function antwortFuer(url) {
  const id = new URL(url).hostname
  return net.fetch(pathToFileURL(pfadVon(id)).toString())
}

// Beim Start: gespeichertes Verzeichnis laden (sofort suchbar) und im Hintergrund immer frisch einlesen
function vorbereiten() {
  setTimeout(() => {
    try {
      verzeichnis()
      aktualisieren()
    } catch {
      // nächstes Mal
    }
  }, 5000)
}

module.exports = { suchen, stand, inhalt, speichern, rueckgaengig, pfadVon, pfadTreffer, istProgramm, antwortFuer, vorbereiten, normal }
