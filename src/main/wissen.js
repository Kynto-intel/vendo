// Wissen: Vault, Morgenberichte, Entscheidungen, Bibliothek, Dateien.
// Nur lesend und nur innerhalb von C:\Users\Felix\Documents\Donnerwolf.

const fs = require('node:fs/promises')
const path = require('node:path')

const WURZEL = 'C:\\Users\\Felix\\Documents\\Donnerwolf'
const VAULT = path.join(WURZEL, 'Donnerwolf-Shop')
const MORGENBERICHTE = path.join(VAULT, '04_Analytics', 'Morgenberichte')
const ENTSCHEIDUNGEN = path.join(VAULT, '04_Decision_Log')
const MAX_GROESSE = 1_500_000
const TEXT_ENDUNGEN = new Set(['.md', '.txt', '.html', '.htm', '.json', '.csv'])
// Beim Durchsuchen des ganzen Ordners überspringen (groß, technisch oder Sicherungen)
const UEBERSPRINGEN = new Set(['node_modules', '.git', '.obsidian', 'firecrawl-selfhost', 'Kynto backups', '__pycache__', '.venv'])

// Quellen der Bibliothek: lange Texte der Agenten
const BIBLIOTHEK = [
  { id: 'bibliothek', name: 'Bibliothek', ordner: path.join(WURZEL, 'Bibliothek') },
  { id: 'recherche', name: 'Blog-Recherchen', ordner: path.join(WURZEL, 'Social Media', 'Donnerwolf', 'Blog', 'Recherche') },
  { id: 'entwuerfe', name: 'Blog-Entwürfe', ordner: path.join(WURZEL, 'Social Media', 'Donnerwolf', 'Blog', 'Entwuerfe') },
  { id: 'artikel', name: 'Fertige Blogartikel', ordner: path.join(WURZEL, 'Social Media', 'Donnerwolf', 'Blog') }
]

// Relativen Pfad prüfen: muss innerhalb des Donnerwolf-Ordners bleiben
function sicher(relativ) {
  const voll = path.resolve(WURZEL, String(relativ || ''))
  if (voll !== WURZEL && !voll.startsWith(WURZEL + path.sep)) throw new Error('Pfad außerhalb des Donnerwolf-Ordners.')
  return voll
}
const relativ = (voll) => path.relative(WURZEL, voll)

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

// Tabellen der 00_Übersicht.md: Pfad → Wofür + Status (aktuell, prüfen, historisch)
async function uebersicht() {
  const karte = {}
  try {
    const text = await fs.readFile(path.join(VAULT, '00_Übersicht.md'), 'utf8')
    for (const zeile of text.split(/\r?\n/)) {
      const spalten = zeile.split('|').map((s) => s.trim())
      if (spalten.length < 5) continue
      const datei = (spalten[2].match(/`([^`]+)`/) || [])[1]
      if (!datei || datei.includes('JJJJ')) continue
      const rel = path.join('Donnerwolf-Shop', datei.replace(/\//g, '\\'))
      karte[rel] = { wofuer: spalten[3], status: spalten[4] }
    }
  } catch {
    // keine Übersicht
  }
  return karte
}

async function vault() {
  const [notizen, karte] = await Promise.all([dateienIn(VAULT, { endungen: new Set(['.md']), tief: true }), uebersicht()])
  return notizen
    .map((n) => {
      const info = karte[n.pfad] || null
      const status = info?.status || ''
      return {
        ...n,
        titel: n.name.replace(/\.md$/, ''),
        // Gruppe = oberster Ordner im Vault (Unterordner, z. B. der Sicherungen, landen in einer Gruppe)
        bereich: n.ordner.replace(/^Donnerwolf-Shop\\?/, '').split(path.sep)[0] || 'Start',
        wofuer: info?.wofuer || '',
        status: /histor/i.test(status) ? 'historisch' : /prüfen/i.test(status) ? 'prüfen' : /aktuell/i.test(status) ? 'aktuell' : '',
        statusText: status,
        geheim: /zugangsdaten|token|passwort/i.test(status + ' ' + n.name)
      }
    })
    .sort((a, b) => a.pfad.localeCompare(b.pfad, 'de'))
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

async function bibliothek() {
  const quellen = []
  for (const q of BIBLIOTHEK) {
    const tief = q.id === 'bibliothek'
    const endungen = q.id === 'artikel' ? new Set(['.html', '.htm']) : new Set(['.md', '.txt', '.html'])
    const dokumente = (await dateienIn(q.ordner, { endungen, tief })).sort((a, b) => b.geaendert - a.geaendert)
    quellen.push({ id: q.id, name: q.name, ordner: relativ(q.ordner), vorhanden: dokumente.length > 0 || q.id !== 'bibliothek', dokumente })
  }
  return quellen
}

async function dateien() {
  let oberste = []
  try {
    oberste = (await fs.readdir(WURZEL, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, pfad: e.name }))
  } catch {
    // nicht lesbar
  }
  const alle = await dateienIn(WURZEL, { endungen: null, tief: true, max: 4000 })
  const neueste = alle.sort((a, b) => b.geaendert - a.geaendert).slice(0, 40)
  return { wurzel: WURZEL, ordner: oberste, neueste }
}

module.exports = { WURZEL, sicher, lesen, vault, suchen, notizFinden, morgenberichte, entscheidungen, bibliothek, dateien }
