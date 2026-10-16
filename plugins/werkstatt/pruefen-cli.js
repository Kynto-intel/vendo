// Prüfprogramm der Werkstatt für Luzzy: dieselbe Prüfung wie in Jarves-OS, als Text im Terminal.
//   node "C:\Users\Felix\Desktop\Vendo\Vendo\plugins\werkstatt\pruefen-cli.js" <plugin-id>
// Prüft Aufbau, Syntax und Rechte, startet den Hintergrundteil (haupt.js) probeweise in einem eigenen Prozess
// (Hänger nach 10 s) und zeigt den letzten Testlauf von Felix (.testbericht.json). Ändert nichts.
// Endet mit Code 0, wenn es keine Fehler gibt, sonst 1.

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const werkstatt = require('./haupt.js')

try {
  process.stdout.setEncoding?.('utf8')
} catch {
  // egal
}

const id = String(process.argv[2] || '').trim()
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) {
  console.log('Aufruf: node pruefen-cli.js <plugin-id>   (Ordner in jarves-os\\werkstatt\\)')
  process.exit(1)
}
const ordner = path.join(werkstatt.WERKSTATT, id)

// Hintergrundteil probeweise laden (eigener Prozess, wie im Testlauf)
function hauptProbieren() {
  const haupt = path.join(ordner, 'haupt.js')
  if (!fs.existsSync(haupt)) return Promise.resolve(null)
  return new Promise((fertig) => {
    const kind = spawn(process.execPath, [path.join(__dirname, 'test-runner.js'), haupt, '{}'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, cwd: ordner, windowsHide: true })
    const meldungen = []
    let rest = ''
    const ende = (ergebnis) => {
      clearTimeout(uhr)
      kind.kill()
      fertig(ergebnis)
    }
    const uhr = setTimeout(() => ende({ ok: false, text: 'haupt.js startet nicht innerhalb von 10 Sekunden (Endlosschleife oder blockierender Code beim Laden?).' }), 10000)
    kind.stdout.on('data', (d) => {
      rest += d.toString()
      const zeilen = rest.split('\n')
      rest = zeilen.pop()
      for (const z of zeilen) {
        try {
          const n = JSON.parse(z)
          if (n.typ === 'bereit') return ende({ ok: !meldungen.length, text: `haupt.js lädt, Funktionen: ${n.funktionen.join(', ') || 'keine'}`, meldungen })
          if (n.typ === 'fehler') meldungen.push(n.text)
        } catch {
          // keine JSON-Zeile
        }
      }
    })
    kind.on('exit', () => ende({ ok: false, text: meldungen[0] || 'haupt.js ist beim Laden abgestürzt.', meldungen }))
  })
}

;(async () => {
  const b = werkstatt.pruefen(id)
  const stufe = { sicher: 'SICHER (nur Oberfläche)', achtung: 'BRAUCHT RECHTE', gefahr: 'VORSICHT', fehler: 'FEHLER' }[b.stufe]
  console.log(`Plugin „${b.name}“ (${id}) – ${stufe}`)
  console.log(`Dateien: ${b.dateien.map((d) => d.name).join(', ') || 'keine'}`)
  const fehler = [...b.fehler]
  const h = b.fehler.length ? null : await hauptProbieren()
  if (h) {
    if (h.ok) console.log(`OK: ${h.text}`)
    else fehler.push(h.text, ...(h.meldungen || []).slice(1))
  }
  if (fehler.length) {
    console.log('\nFEHLER (bitte beheben):')
    for (const f of fehler) console.log(`  - ${f}`)
  } else console.log('\nPrüfung: keine Fehler im Aufbau und Code.')
  const rechte = b.rechte.filter((r) => r.stufe !== 'hinweis')
  if (rechte.length) {
    console.log('\nRechte (Felix sieht dazu eine Warnung):')
    for (const r of rechte) console.log(`  - [${r.stufe}] ${r.text}`)
  }
  const hinweise = b.rechte.filter((r) => r.stufe === 'hinweis')
  if (hinweise.length) {
    console.log('\nHinweise (besser anpassen):')
    for (const r of hinweise) console.log(`  - ${r.text}`)
  }
  const berichtDatei = path.join(ordner, '.testbericht.json')
  let testFehler = 0
  if (fs.existsSync(berichtDatei)) {
    try {
      const t = JSON.parse(fs.readFileSync(berichtDatei, 'utf8'))
      const berichtZeit = fs.statSync(berichtDatei).mtimeMs
      const geaendert = Math.max(0, ...fs.readdirSync(ordner).filter((d) => !d.startsWith('.')).map((d) => fs.statSync(path.join(ordner, d)).mtimeMs))
      const aktuell = geaendert <= berichtZeit
      console.log(`\nLetzter Testlauf von Felix (${t.zeit}): ${t.ok ? 'ohne Fehler' : t.gestartet ? 'mit Fehlern' : 'Plugin ist nicht gestartet'}${aktuell ? '' : ' – ÄLTER als deine letzten Änderungen: Felix muss neu testen'}`)
      for (const f of t.fehler || []) console.log(`  - ${f}`)
      if (aktuell && !t.ok) testFehler = (t.fehler || []).length || 1
    } catch {
      // Bericht unlesbar: egal
    }
  } else console.log('\nFelix hat noch keinen Testlauf gemacht.')
  if (testFehler) console.log('\n→ Die Fehler aus dem Testlauf sind noch nicht behoben.')
  process.exit(fehler.length || testFehler ? 1 : 0)
})()
