// Dateisuche: „Luzzy, such die Datei Thor-Hoodie und öffne sie“. Sucht nach Dateinamen in Felix' üblichen Ordnern
// (Donnerwolf, Desktop, Dokumente, Downloads, Bilder, Videos, Musik, OneDrive) und zeigt die Datei in Jarves-OS an.
// Nur lesen: hier wird nichts verändert. Die Oberfläche bekommt keine Pfade zum Öffnen, nur Kennungen aus
// einer Suche; nur diese Dateien dürfen angezeigt werden (Protokoll jarves-datei://<kennung>).

const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomBytes } = require('node:crypto')
const { app, net } = require('electron')
const { pathToFileURL } = require('node:url')
const { WURZEL } = require('./wissen')

const UEBERSPRINGEN = new Set(['node_modules', '.git', '.obsidian', '__pycache__', '.venv', 'venv', 'AppData', '$RECYCLE.BIN', 'System Volume Information', 'firecrawl-selfhost', 'Kynto backups', '.cache', '.trash'])
const MAX_DATEIEN = 80_000
const MAX_TIEFE = 9
const INDEX_ALTER = 10 * 60 * 1000 // alle 10 Minuten neu einlesen (beim nächsten Suchen)
const MAX_TEXT = 2_000_000

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

function orte() {
  if (process.env.JARVES_TEST_DATEIEN) return [{ name: 'Test', ordner: process.env.JARVES_TEST_DATEIEN }]
  const pfad = (name) => {
    try {
      return app.getPath(name)
    } catch {
      return null
    }
  }
  const liste = [
    { name: 'Donnerwolf', ordner: WURZEL },
    { name: 'Desktop', ordner: pfad('desktop') },
    { name: 'Dokumente', ordner: pfad('documents') },
    { name: 'Downloads', ordner: pfad('downloads') },
    { name: 'Bilder', ordner: pfad('pictures') },
    { name: 'Videos', ordner: pfad('videos') },
    { name: 'Musik', ordner: pfad('music') },
    { name: 'OneDrive', ordner: path.join(os.homedir(), 'OneDrive') }
  ].filter((o) => o.ordner)
  // Doppelte (Donnerwolf liegt in Dokumente) nur einmal durchsuchen: der äußere Ordner reicht
  return liste.filter((o, i) => !liste.some((x, j) => j !== i && x.ordner !== o.ordner && o.ordner.startsWith(x.ordner + path.sep)))
}

// Umlaute & Co. vereinheitlichen, damit „Thor Hoodie“ auch „thor-hoodie_final.PNG“ findet
const normal = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[_\-.+()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

let index = null // [{ voll, name, suche, ort, geaendert, groesse }]
let indexZeit = 0
let indexLaeuft = null

async function einlesen() {
  const neu = []
  for (const ort of orte()) {
    const lauf = async (ordner, tiefe) => {
      if (neu.length >= MAX_DATEIEN) return
      let eintraege
      try {
        eintraege = await fs.readdir(ordner, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of eintraege) {
        if (neu.length >= MAX_DATEIEN) return
        if (e.name.startsWith('.') || e.name.startsWith('~$') || UEBERSPRINGEN.has(e.name)) continue
        const voll = path.join(ordner, e.name)
        if (e.isDirectory()) {
          if (tiefe < MAX_TIEFE) await lauf(voll, tiefe + 1)
        } else if (e.isFile()) {
          neu.push({ voll, name: e.name, suche: normal(e.name), ordnerSuche: normal(path.relative(ort.ordner, ordner)), ort: ort.name, wurzel: ort.ordner })
        }
      }
    }
    await lauf(ort.ordner, 0)
  }
  index = neu
  indexZeit = Date.now()
  return index
}
async function indexHolen() {
  if (index && Date.now() - indexZeit < INDEX_ALTER) return index
  if (!indexLaeuft) indexLaeuft = einlesen().finally(() => (indexLaeuft = null))
  // Gibt es schon einen (älteren) Index, sofort damit suchen; der neue kommt im Hintergrund
  return index || indexLaeuft
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

// Suchen: alle Wörter müssen im Dateinamen (oder im Ordnernamen) vorkommen. Beste zuerst.
async function suchen(anfrage, { max = 8 } = {}) {
  const worte = normal(anfrage).split(' ').filter(Boolean)
  if (!worte.length) return []
  const liste = await indexHolen()
  const ganz = normal(anfrage)
  const treffer = []
  for (const d of liste) {
    let punkte = 0
    let alle = true
    for (const w of worte) {
      if (d.suche.includes(w)) punkte += d.suche.split(' ').includes(w) ? 3 : 2
      else if (d.ordnerSuche.includes(w)) punkte += 1
      else {
        alle = false
        break
      }
    }
    if (!alle) continue
    const ohneEndung = normal(path.parse(d.name).name)
    if (ohneEndung === ganz || d.suche === ganz) punkte += 10
    else if (d.suche.startsWith(ganz)) punkte += 4
    treffer.push({ d, punkte })
  }
  treffer.sort((a, b) => b.punkte - a.punkte || a.d.name.length - b.d.name.length)
  const beste = treffer.slice(0, max * 3)
  // Änderungsdatum nur für die Kandidaten holen (schnell), bei Gleichstand gewinnt die neuere Datei
  await Promise.all(
    beste.map(async (t) => {
      try {
        const info = await fs.stat(t.d.voll)
        t.geaendert = info.mtimeMs
        t.groesse = info.size
      } catch {
        t.weg = true
      }
    })
  )
  return beste
    .filter((t) => !t.weg)
    .sort((a, b) => b.punkte - a.punkte || b.geaendert - a.geaendert)
    .slice(0, max)
    .map(({ d, geaendert, groesse }) => ({
      id: freigeben(d.voll),
      name: d.name,
      ort: d.ort,
      ordner: path.relative(d.wurzel, path.dirname(d.voll)) || '',
      art: artVon(d.name),
      geaendert,
      groesse
    }))
}

// Inhalt für die Anzeige: Text direkt, alles andere über jarves-datei://<id>
async function inhalt(id) {
  const voll = pfadVon(id)
  const info = await fs.stat(voll)
  const art = artVon(voll)
  const basis = { id, name: path.basename(voll), art, groesse: info.size, geaendert: info.mtimeMs, ordner: path.dirname(voll) }
  if (['markdown', 'text', 'tabelle'].includes(art)) {
    if (info.size > MAX_TEXT) return { ...basis, art: 'andere', hinweis: 'Die Datei ist zu groß für die Anzeige.' }
    return { ...basis, text: await fs.readFile(voll, 'utf8') }
  }
  if (['bild', 'pdf', 'video', 'audio'].includes(art)) return { ...basis, url: `jarves-datei://${id}/${encodeURIComponent(path.basename(voll))}` }
  return basis
}

// Für protocol.handle('jarves-datei'): nur freigegebene Dateien. net.fetch liefert sie gestreamt mit passendem Typ
// (auch Vor- und Zurückspulen bei Videos).
function antwortFuer(url) {
  const id = new URL(url).hostname
  return net.fetch(pathToFileURL(pfadVon(id)).toString())
}

// Beim Start im Hintergrund schon mal einlesen, damit die erste Suche schnell ist
function vorbereiten() {
  setTimeout(() => indexHolen().catch(() => {}), 15000)
}

module.exports = { suchen, inhalt, pfadVon, antwortFuer, vorbereiten, normal }
