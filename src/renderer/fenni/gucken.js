// Fenni guckt über die Kante: Ist die Insel versteckt, schaut er ab und zu kopfüber von oben herein, erst die
// Ohrspitzen, dann die Augen. Er schaut zur Maus, blinzelt und zieht sich wieder zurück. Eigene kleine Ebene ganz oben
// im Fenster (mini.html #gucken); das Fenster lässt dabei alle Klicks durch, er stört also nicht.

import { kopfZeichnen } from './koerper.js'
import { augeZeichnen } from './augen.js'
import { fenniFarben } from './farben.js'

const K = (64 / 90) * 0.72 // Pixel pro Kopf-Einheit, so groß wie Fennis Kopf in der Insel
const zufall = (von, bis) => von + Math.random() * (bis - von)
// Lage der Kopfmitte (Pixel, kopfüber): ganz weg, nur die Ohren, bis zu den Augen
const WEG = -26
const OHREN = -14
const AUGEN = 5.5
// Ablauf eines Guckens (Sekunden)
const ABLAUF = [
  ['ohren', 0.45], // Ohrspitzen kommen
  ['warten', 0.7], // nur die Ohren, zucken kurz
  ['augen', 0.35], // Augen kommen
  ['schauen', 2.6], // schaut zur Maus, blinzelt
  ['zurueck', 0.45]
]
const sanft = (p) => 0.5 - Math.cos(Math.min(1, Math.max(0, p)) * Math.PI) / 2

// x: Funktion, die liefert, wo Fenni zuletzt war (Pixel von der Mitte)
export function guckenErstellen(canvas, { x = () => 0 } = {}) {
  const g = canvas.getContext('2d')
  let farben = fenniFarben()
  let aktiv = false
  let pause = zufall(6, 12) // Sekunden bis zum nächsten Gucken
  let schritt = -1 // Index in ABLAUF, -1 = versteckt
  let seit = 0
  let blinzeln = 0
  const maus = { x: 0, y: 0 }
  let letztes = performance.now()

  function bild(jetzt) {
    const dt = Math.min(0.1, (jetzt - letztes) / 1000)
    letztes = jetzt
    const t = jetzt / 1000
    const dpr = window.devicePixelRatio || 1
    const breite = canvas.clientWidth
    const hoehe = canvas.clientHeight
    if (canvas.width !== Math.round(breite * dpr)) canvas.width = Math.round(breite * dpr)
    if (canvas.height !== Math.round(hoehe * dpr)) canvas.height = Math.round(hoehe * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, breite, hoehe)

    if (schritt < 0) {
      if (aktiv && (pause -= dt) <= 0) {
        schritt = 0
        seit = 0
      }
      return requestAnimationFrame(bild)
    }
    seit += dt
    if (seit >= ABLAUF[schritt][1]) {
      seit = 0
      schritt++
      if (schritt >= ABLAUF.length || (!aktiv && ABLAUF[schritt]?.[0] !== 'zurueck')) {
        schritt = -1
        pause = zufall(18, 40)
        return requestAnimationFrame(bild)
      }
    }
    const art = ABLAUF[schritt][0]
    const p = seit / ABLAUF[schritt][1]
    let y = WEG
    if (art === 'ohren') y = WEG + (OHREN - WEG) * sanft(p)
    if (art === 'warten') y = OHREN + Math.sin(p * Math.PI * 4) * 0.8
    if (art === 'augen') y = OHREN + (AUGEN - OHREN) * sanft(p)
    if (art === 'schauen') y = AUGEN
    if (art === 'zurueck') y = AUGEN + (WEG - AUGEN) * sanft(p)
    if (art === 'schauen' && Math.random() < 0.012) blinzeln = 0.13
    if (blinzeln > 0) blinzeln -= dt

    // Blick zur Maus (kopfüber: Richtung umdrehen)
    const px = breite / 2 + x()
    const dx = maus.x - x()
    const dy = maus.y
    const laenge = Math.hypot(dx, dy) || 1
    const k = Math.min(1, laenge / 300)
    const blick = { x: -(dx / laenge) * k, y: -(dy / laenge) * k }

    g.save()
    g.translate(px, y)
    g.rotate(Math.PI + Math.sin(t * 1.3) * 0.06)
    g.scale(K, K)
    kopfZeichnen(g, { heben: art === 'warten' ? 0.6 + Math.sin(p * Math.PI * 4) * 0.4 : 0.4, klapp: 0 }, farben)
    const augen = { art: 'offen', groesse: 1.1, blick, blinzeln: blinzeln > 0, t }
    augeZeichnen(g, -13, -5, augen, farben)
    augeZeichnen(g, 13, -5, augen, farben)
    g.restore()
    requestAnimationFrame(bild)
  }
  requestAnimationFrame(bild)

  return {
    // an: Insel versteckt (dann darf er gucken); aus: sofort zurückziehen
    an(wert) {
      aktiv = Boolean(wert)
      if (aktiv) pause = zufall(5, 10)
      else if (schritt >= 0) {
        schritt = -1
        g.clearRect(0, 0, canvas.width, canvas.height)
      }
    },
    blick(dx, dy) {
      maus.x = dx
      maus.y = dy
    },
    farbenNeu() {
      farben = fenniFarben()
    }
  }
}
