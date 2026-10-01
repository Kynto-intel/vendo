// Wissen: Vault-Suche, Morgenberichte, Entscheidungen, Bibliothek.
// Nur lesend und nur innerhalb von C:\Users\Felix\Documents\Donnerwolf oder der Ordner, die Felix für die Bibliothek gewählt hat.

const fs = require('node:fs/promises')
const path = require('node:path')
const einstellungen = require('./einstellungen')

const WURZEL = 'C:\\Users\\Felix\\Documents\\Donnerwolf'
const VAULT = path.join(WURZEL, 'Donnerwolf-Shop')
const MORGENBERICHTE = path.join(VAULT, '04_Analytics', 'Morgenberichte')
const ENTSCHEIDUNGEN = path.join(VAULT, '04_Decision_Log')
const MAX_GROESSE = 1_500_000
const TEXT_ENDUNGEN = new Set(['.md', '.txt', '.html', '.htm', '.json', '.csv'])
// Beim Durchsuchen des ganzen Ordners überspringen (groß, technisch oder Sicherungen)
const UEBERSPRINGEN = new Set(['node_modules', '.git', '.obsidian', 'firecrawl-selfhost', 'Kynto backups', '__pycache__', '.venv'])

// Bibliothek: die Ordner wählt Felix selbst (Bereich Bibliothek → „+ Ordner wählen“), gespeichert in den Einstellungen
// (daten/einstellungen.json: bibliothek.ordner, ganze Pfade)
function bibliothekOrdner() {
  const liste = einstellungen.laden().bibliothek?.ordner
  return Array.isArray(liste) ? liste.filter((o) => typeof o === 'string' && path.isAbsolute(o)) : []
}
// Liegt der Pfad in diesem Ordner? (Windows: Groß-/Kleinschreibung egal)
function innerhalb(voll, ordner) {
  const a = path.resolve(voll).toLowerCase()
  const b = path.resolve(ordner).toLowerCase()
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep)
}

// Pfad prüfen (relativ zum Donnerwolf-Ordner oder ganz): muss im Donnerwolf-Ordner oder in einem Bibliothek-Ordner liegen
function sicher(relativ) {
  const voll = path.resolve(WURZEL, String(relativ || ''))
  if (!innerhalb(voll, WURZEL) && !bibliothekOrdner().some((o) => innerhalb(voll, o))) throw new Error('Pfad außerhalb der erlaubten Ordner.')
  return voll
}
// Im Donnerwolf-Ordner kurz (relativ), außerhalb der ganze Pfad
const relativ = (voll) => (innerhalb(voll, WURZEL) ? path.relative(WURZEL, voll) : voll)

async function dateienIn(ordner, { endungen = TEXT_ENDUNGEN, tief = false, max = 400 } = {}) {
  const ergebnis = []
  async function lauf(o, stufe) {
    let eintraege
    try {
      eintraege = await fs.readdir(o, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of eintraege) {
      if (ergebnis.length >= max) return
      const voll = path.join(o, e.name)
      if (e.isDirectory()) {
        if (tief && stufe < 7 && !UEBERSPRINGEN.has(e.name) && !e.name.startsWith('.')) await lauf(voll, stufe + 1)
      } else if (endungen === null || endungen.has(path.extname(e.name).toLowerCase())) {
        try {
          const info = await fs.stat(voll)
          ergebnis.push({ pfad: relativ(voll), name: e.name, ordner: relativ(o), groesse: info.size, geaendert: info.mtimeMs })
        } catch {
          // Datei verschwunden
        }
      }
    }
  }
  await lauf(ordner, 0)
  return ergebnis
}

async function lesen(rel) {
  const voll = sicher(rel)
  const info = await fs.stat(voll)
  if (!info.isFile()) throw new Error('Keine Datei.')
  if (!TEXT_ENDUNGEN.has(path.extname(voll).toLowerCase())) throw new Error('Dieser Dateityp wird nicht angezeigt.')
  if (info.size > MAX_GROESSE) throw new Error('Datei zu groß für die Anzeige.')
  return { pfad: relativ(voll), name: path.basename(voll), text: await fs.readFile(voll, 'utf8'), geaendert: info.mtimeMs }
}

async function suchen(anfrage) {
  const worte = String(anfrage || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!worte.length) return []
  const notizen = await dateienIn(VAULT, { endungen: new Set(['.md']), tief: true })
  const treffer = []
  for (const n of notizen) {
    let text = ''
    try {
      text = await fs.readFile(sicher(n.pfad), 'utf8')
    } catch {
      continue
    }
    const klein = text.toLowerCase()
    const name = n.name.toLowerCase()
    if (!worte.every((w) => klein.includes(w) || name.includes(w))) continue
    const pos = klein.indexOf(worte[0])
    const ausschnitt = pos >= 0 ? text.slice(Math.max(0, pos - 60), pos + 140).replace(/\s+/g, ' ') : ''
    const punkte = worte.reduce((s, w) => s + (name.includes(w) ? 10 : 0) + (klein.split(w).length - 1), 0)
    treffer.push({ ...n, titel: n.name.replace(/\.md$/, ''), ausschnitt, punkte })
  }
  return treffer.sort((a, b) => b.punkte - a.punkte).slice(0, 40)
}

// Obsidian-Link [[Name]] → Pfad der Notiz
async function notizFinden(name) {
  const gesucht = String(name || '').split('|')[0].split('#')[0].trim().toLowerCase()
  const notizen = await dateienIn(VAULT, { endungen: new Set(['.md']), tief: true })
  return notizen.find((n) => n.name.toLowerCase() === `${gesucht}.md`)?.pfad || null
}

async function morgenberichte() {
  const liste = await dateienIn(MORGENBERICHTE, { endungen: new Set(['.md']) })
  return liste.filter((d) => /^\d{4}-\d{2}-\d{2}\.md$/.test(d.name)).sort((a, b) => b.name.localeCompare(a.name))
}

// Entscheidungen: Datei JJJJ-MM-TT_titel.md, darin Status (gilt/überholt) und Prüfdatum
async function entscheidungen() {
  const liste = await dateienIn(ENTSCHEIDUNGEN, { endungen: new Set(['.md']) })
  const ergebnis = []
  for (const d of liste) {
    let text = ''
    try {
      text = await fs.readFile(sicher(d.pfad), 'utf8')
    } catch {
      continue
    }
    const feld = (namen) => {
      for (const n of namen) {
        const m = text.match(new RegExp(`^\\s*(?:[-*]\\s*)?\\**${n}\\**\\s*:\\s*\\**\\s*(.+?)\\s*$`, 'im'))
        if (m) return m[1].replace(/\*+/g, '').trim()
      }
      return ''
    }
    const datum = (d.name.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || ''
    const titel = (text.match(/^#\s+(.+)$/m) || [])[1] || d.name.replace(/^\d{4}-\d{2}-\d{2}_?/, '').replace(/\.md$/, '').replace(/[-_]/g, ' ')
    const status = feld(['Status'])
    ergebnis.push({
      ...d,
      datum,
      titel: titel.trim(),
      status: /überholt|ueberholt|veraltet/i.test(status) ? 'überholt' : /gilt|aktiv|aktuell/i.test(status) ? 'gilt' : status || 'offen',
      pruefen: feld(['Prüfdatum', 'Pruefdatum', 'Prüfen am', 'Wiedervorlage']),
      begruendung: feld(['Begründung', 'Begruendung', 'Warum'])
    })
  }
  return ergebnis.sort((a, b) => b.datum.localeCompare(a.datum))
}

// Bibliothek: pro gewähltem Ordner eine Gruppe mit allen Texten darin (auch in Unterordnern), neueste zuerst
const BIBLIOTHEK_ENDUNGEN = new Set(['.md', '.txt', '.html', '.htm'])
async function bibliothek() {
  const ordner = bibliothekOrdner()
  const quellen = []
  for (const o of ordner) {
    let vorhanden = true
    try {
      vorhanden = (await fs.stat(o)).isDirectory()
    } catch {
      vorhanden = false
    }
    const dokumente = vorhanden
      ? (await dateienIn(o, { endungen: BIBLIOTHEK_ENDUNGEN, tief: true, max: 800 }))
          .map((d) => ({ ...d, unter: path.relative(o, path.dirname(path.resolve(WURZEL, d.pfad))) })) // Unterordner in diesem Ordner
          .sort((a, b) => b.geaendert - a.geaendert)
      : []
    quellen.push({ id: o, name: path.basename(o) || o, ordner: o, vorhanden, dokumente })
  }
  return { ordner, quellen }
}
function bibliothekOrdnerDazu(ordner) {
  const neu = path.resolve(String(ordner || ''))
  const liste = bibliothekOrdner()
  if (!liste.some((o) => path.resolve(o).toLowerCase() === neu.toLowerCase())) liste.push(neu)
  einstellungen.speichern({ bibliothek: { ordner: liste } })
  return liste
}
function bibliothekOrdnerWeg(ordner) {
  const weg = path.resolve(String(ordner || '')).toLowerCase()
  const liste = bibliothekOrdner().filter((o) => path.resolve(o).toLowerCase() !== weg)
  einstellungen.speichern({ bibliothek: { ordner: liste } })
  return liste
}

module.exports = { WURZEL, VAULT, sicher, lesen, suchen, notizFinden, morgenberichte, entscheidungen, bibliothek, bibliothekOrdnerDazu, bibliothekOrdnerWeg }
