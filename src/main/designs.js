// Designs (Einstellungen → Aussehen): eine Datei pro Design im Ordner designs/ (z. B. designs/nordlicht.json).
// Neues Design = Datei kopieren, Name und Farben ändern, Jarves-OS neu starten. Der Dateiname ist die ID.
// Jede Farbe wird geprüft (#rrggbb); fehlt eine oder ist sie falsch, gilt der Wert aus gold.json (bzw. unten).

const fs = require('node:fs')
const path = require('node:path')

const ORDNER = path.join(__dirname, '..', '..', 'designs')
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const FARBE = /^#[0-9a-f]{6}$/i
// Ersatz, falls selbst gold.json fehlt (entspricht Donnerwolf Gold)
const ERSATZ = {
  hintergrund: '#131315', leiste: '#0e0e10', flaeche: '#19191c', flaecheHoch: '#202024', tief: '#0b0b0c', eingabe: '#101012',
  rahmen: '#26262a', linie: '#1f1f23', text: '#ece6da', textLeise: '#8c877e', gedimmt: '#5a564f',
  akzent: '#c9a14a', akzentHell: '#e3be6c', akzentDunkel: '#4a3c1f', akzentFlaeche: '#221d13', aufAkzent: '#16130c'
}

function lesen(datei) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ORDNER, datei), 'utf8'))
  } catch (e) {
    console.warn(`Design ${datei} ist kaputt und wird übersprungen: ${e.message}`)
    return null
  }
}

function liste() {
  let dateien = []
  try {
    dateien = fs.readdirSync(ORDNER).filter((d) => d.endsWith('.json') && ID.test(d.slice(0, -5)))
  } catch {
    // kein Ordner: nur Gold aus style.css
  }
  const grund = { ...ERSATZ, ...(lesen('gold.json')?.farben || {}) }
  const designs = []
  for (const datei of dateien) {
    const roh = lesen(datei)
    if (!roh || typeof roh !== 'object') continue
    const farben = {}
    for (const [name, standard] of Object.entries(ERSATZ)) {
      const wert = roh.farben?.[name]
      farben[name] = FARBE.test(String(wert)) ? String(wert).toLowerCase() : FARBE.test(grund[name]) ? grund[name] : standard
    }
    designs.push({
      id: datei.slice(0, -5),
      name: String(roh.name || datei.slice(0, -5)).slice(0, 30),
      beschreibung: String(roh.beschreibung || '').slice(0, 60),
      reihenfolge: Number(roh.reihenfolge) || 99,
      farben
    })
  }
  return designs.sort((a, b) => (a.id === 'gold' ? -1 : b.id === 'gold' ? 1 : a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name)))
}

module.exports = { liste }
