// Testlauf der Werkstatt: führt den Hintergrundteil (haupt.js) eines Entwurfs in einem EIGENEN Prozess aus,
// getrennt von Jarves-OS. Hängt er sich auf oder stürzt ab, betrifft das nur diesen Prozess.
// Gestartet mit ELECTRON_RUN_AS_NODE: node test-runner.js <haupt.js> <daten als JSON>
// Verständigung über stdin/stdout, eine JSON-Zeile pro Nachricht.

const readline = require('node:readline')

const [, , datei, datenText] = process.argv
let daten = {}
try {
  daten = JSON.parse(datenText || '{}')
} catch {
  daten = {}
}
const funktionen = new Map()
const senden = (nachricht) => process.stdout.write(`${JSON.stringify(nachricht)}\n`)
const meldung = (e) => String(e?.stack || e?.message || e).split('\n').slice(0, 3).join(' · ')

process.on('uncaughtException', (e) => senden({ typ: 'fehler', text: `Hintergrundteil abgestürzt: ${meldung(e)}` }))
process.on('unhandledRejection', (e) => senden({ typ: 'fehler', text: `Hintergrundteil: ${meldung(e)}` }))

// Vault nur simulieren: im Test wird nichts geschrieben
const vault = {
  anhaengen: async (name) => (senden({ typ: 'log', text: `Vault (nur Test): würde an „${name}“ anhängen` }), true),
  anlegen: async (ordner, titel) => (senden({ typ: 'log', text: `Vault (nur Test): würde Notiz „${titel}“ anlegen` }), true),
  lesen: async () => ''
}

try {
  require(datei)({
    id: 'test',
    datenLaden: () => daten,
    datenSpeichern: (d) => {
      daten = d
      senden({ typ: 'log', text: 'Hintergrundteil hat Daten gespeichert (nur im Test)' })
      return true
    },
    bereitstellen: (name, fn) => funktionen.set(String(name), fn),
    vault
  })
  senden({ typ: 'bereit', funktionen: [...funktionen.keys()] })
} catch (e) {
  senden({ typ: 'fehler', text: `haupt.js lässt sich nicht laden: ${meldung(e)}` })
}

readline.createInterface({ input: process.stdin }).on('line', async (zeile) => {
  let auftrag
  try {
    auftrag = JSON.parse(zeile)
  } catch {
    return
  }
  const fn = funktionen.get(auftrag.name)
  if (!fn) return senden({ typ: 'antwort', nr: auftrag.nr, fehler: `Funktion „${auftrag.name}“ gibt es im Hintergrundteil nicht.` })
  try {
    const wert = await fn(...(Array.isArray(auftrag.argumente) ? auftrag.argumente : []))
    senden({ typ: 'antwort', nr: auftrag.nr, wert: wert === undefined ? null : wert })
  } catch (e) {
    senden({ typ: 'antwort', nr: auftrag.nr, fehler: meldung(e) })
  }
})
