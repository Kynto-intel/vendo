// Hintergrund hinter Fenni: feine Lichtpunkte, warmer Schein und ein Hauch alter Röhrenbildschirm.
// Beim Öffnen der Mini-Leiste kreisen die Punkte erst als heller Ring um Fenni und legen sich dann als leises Flimmern
// an die Ränder („Auftauchen“, ~3 s; das Einschalten der Röhre selbst macht mini.html). Danach rieseln sie langsam, funkeln und flackern ab und zu kurz auf.
// Auf Luzzy reagiert es sanft: hört zu / spricht = Punkte und Schein pulsieren mit der Stimme, denkt = sie kreisen.
// Eigene Canvas-Ebene unter Fenni (mini.html), eigene Animation. Farben aus dem Design (--akzent-rgb, --text-rgb).

const ANZAHL = 140
const RING = 1.1 // Sekunden kreisen die Punkte als Ring um Fenni
const AUFTAUCHEN = 3 // Sekunden, bis alle Punkte an ihrem Platz sind

const zahlen = (text, ersatz) => (String(text || '').trim() || ersatz).split(',').map((z) => Number(z) || 0)
const sanft = (p) => 1 - Math.pow(1 - p, 3)

export function sterneErstellen(canvas) {
  const g = canvas.getContext('2d')
  let akzent = [201, 161, 74]
  let punktFarbe = [236, 230, 218]
  let zustand = 'bereit'
  let staerke = 0
  let punkte = []
  const start = performance.now()
  let letztes = start

  function farbenNeu() {
    const stil = getComputedStyle(document.documentElement)
    akzent = zahlen(stil.getPropertyValue('--akzent-rgb'), '201, 161, 74')
    punktFarbe = zahlen(stil.getPropertyValue('--text-rgb'), '236, 230, 218')
  }

  // Ziel-Plätze: überall, aber nicht direkt um Fenni herum, zu den Rändern hin dichter
  function punkteVerteilen(breite, hoehe) {
    const mx = breite / 2
    const my = hoehe / 2
    punkte = Array.from({ length: ANZAHL }, () => {
      let x
      let y
      for (let versuch = 0; versuch < 20; versuch++) {
        const seite = Math.random() < 0.5 ? -1 : 1
        x = mx + seite * Math.pow(Math.random(), 0.6) * breite / 2
        y = Math.random() * hoehe
        const innen = ((x - mx) / (hoehe * 1.1)) ** 2 + ((y - my) / (hoehe * 0.55)) ** 2
        if (innen > 1) break
      }
      const winkel = Math.random() * Math.PI * 2
      return {
        x, y, // Ziel
        winkel, // Startplatz auf dem Ring um Fenni
        ring: 0.85 + Math.random() * 0.4,
        groesse: 0.5 + Math.random() * 0.9,
        hell: 0.25 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        tempo: 0.8 + Math.random() * 2.2,
        fall: 1.5 + Math.random() * 3.5, // rieseln, Pixel pro Sekunde
        flacker: 0
      }
    })
  }

  function groesseAnpassen() {
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    punkteVerteilen(canvas.clientWidth, canvas.clientHeight)
  }
  farbenNeu()
  groesseAnpassen()
  addEventListener('resize', groesseAnpassen)

  function bild(jetzt) {
    const t = (jetzt - start) / 1000
    const dt = Math.min(0.1, (jetzt - letztes) / 1000)
    letztes = jetzt
    const dpr = window.devicePixelRatio || 1
    const breite = canvas.width / dpr
    const hoehe = canvas.height / dpr
    const mx = breite / 2
    const my = hoehe / 2
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, breite, hoehe)

    const stimme = ['hoert', 'spricht'].includes(zustand) ? staerke : 0
    const auftauchen = Math.min(1, t / AUFTAUCHEN)

    // Warmer Schein hinter Fenni (beim Auftauchen und mit der Stimme heller)
    const schein = 0.16 + (1 - auftauchen) * 0.14 + stimme * 0.18 + (zustand === 'denkt' ? Math.sin(t * 3) * 0.04 : 0)
    const radius = hoehe * (1.05 + stimme * 0.25)
    const verlauf = g.createRadialGradient(mx, my, 0, mx, my, radius)
    verlauf.addColorStop(0, `rgba(${akzent.join(',')}, ${schein})`)
    verlauf.addColorStop(1, `rgba(${akzent.join(',')}, 0)`)
    g.fillStyle = verlauf
    g.fillRect(0, 0, breite, hoehe)

    // Punkte
    const p = sanft(Math.max(0, Math.min(1, (t - RING) / (AUFTAUCHEN - RING))))
    for (const s of punkte) {
      s.y += s.fall * dt * (zustand === 'schlaeft' ? 0.4 : 1)
      if (s.y > hoehe + 2) s.y = -2
      if (s.flacker > 0) s.flacker -= dt
      else if (Math.random() < 0.0009) s.flacker = 0.12 // kurz aufflackern wie auf einer alten Röhre
      let x = s.x
      let y = s.y
      let winkel = s.winkel
      if (zustand === 'denkt') winkel += t * 0.6
      if (p < 1) {
        // vom Ring um Fenni zum Ziel, der Ring dreht sich dabei langsamer
        const drehung = winkel + t * 2.4 * (1 - p)
        const rx = mx + Math.cos(drehung) * hoehe * 0.95 * s.ring
        const ry = my + Math.sin(drehung) * hoehe * 0.42 * s.ring
        x = rx + (x - rx) * p
        y = ry + (y - ry) * p
      }
      const funkeln = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + t * s.tempo))
      let deck = s.hell * funkeln * (1 + stimme * 0.8)
      if (p < 1) deck = deck * p + (1 - p) * 0.9
      if (s.flacker > 0) deck = Math.min(1, deck + 0.6)
      g.fillStyle = `rgba(${punktFarbe.join(',')}, ${Math.min(1, deck)})`
      const d = s.groesse * (s.flacker > 0 ? 1.6 : 1)
      g.fillRect(x - d / 2, y - d / 2, d, d)
    }

    // Röhrenbildschirm: feine Zeilen und ein langsam wandernder heller Streifen
    g.fillStyle = 'rgba(0, 0, 0, 0.18)'
    for (let zy = 0; zy < hoehe; zy += 3) g.fillRect(0, zy, breite, 1)
    const streifen = ((t * 18) % (hoehe + 40)) - 20
    const band = g.createLinearGradient(0, streifen - 12, 0, streifen + 12)
    band.addColorStop(0, `rgba(${punktFarbe.join(',')}, 0)`)
    band.addColorStop(0.5, `rgba(${punktFarbe.join(',')}, 0.035)`)
    band.addColorStop(1, `rgba(${punktFarbe.join(',')}, 0)`)
    g.fillStyle = band
    g.fillRect(0, streifen - 12, breite, 24)

    requestAnimationFrame(bild)
  }
  requestAnimationFrame(bild)

  return {
    zustand(z) {
      zustand = z
    },
    // Stimmstärke 0…1 (aus dem Pegel, den auch Fenni bekommt)
    staerke(wert) {
      staerke = Math.max(0, Math.min(1, Number(wert) || 0))
    },
    farbenNeu
  }
}
