// Fenni, der kleine Wolf in der Mini-Leiste (Fenrirs kleiner Bruder). Zeigt, was Luzzy gerade tut:
//   bereit (atmet, blinzelt) · hoert (Ohren gespitzt, Schallwellen) · denkt (Blick nach oben, Punkte)
//   spricht (Maul nach dem Stimmpegel) · schlaeft (keine Verbindung zu Hermes) · schaut (auf den Bildschirm)
// Dazu: freuen() (Sprung, wenn Luzzy fertig ist), anstupsen() (genervt, dreimal schnell: schwindelig),
// blick(dx, dy) (Augen folgen der Maus, Abstand in Bildschirm-Pixeln zur Mitte der Leiste).
// Nur Canvas, keine Bilder. Teile: koerper.js, augen.js, effekte.js, farben.js.

import { kopfZeichnen, maulZeichnen } from './koerper.js'
import { augeZeichnen } from './augen.js'
import { schallwellen, denkpunkte, schlafZ, schwindelSterne } from './effekte.js'
import { fenniFarben } from './farben.js'

const FREUDE_SPRUNG = 1.6 // Sekunden hüpfen
const FREUDE_AUGEN = 2.2 // Sekunden ^ ^
const SCHWINDEL = 2.6 // Sekunden nach dreimal Anstupsen

export function fenniErstellen(canvas) {
  const g = canvas.getContext('2d')
  let farben = fenniFarben()
  let zustand = 'bereit'
  let staerke = 0 // Stimmpegel 0…1 (Sprechen, Zuhören)
  const blick = { x: 0, y: 0 }
  const ziel = { x: 0, y: 0 }
  let blinzeln = 0
  let naechstesBlinzeln = 2
  let stupsZeit = -99
  let stupser = []
  let schwindelBis = -99
  let freudeSeit = -99
  const start = performance.now()
  let letztes = start

  // Schärfe auf hochauflösenden Bildschirmen
  function groesseAnpassen() {
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
  }
  groesseAnpassen()
  addEventListener('resize', groesseAnpassen)

  function bild(jetzt) {
    const t = (jetzt - start) / 1000
    const dt = Math.min(0.1, (jetzt - letztes) / 1000)
    letztes = jetzt
    const dpr = window.devicePixelRatio || 1
    const breite = canvas.width / dpr
    const hoehe = canvas.height / dpr
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, breite, hoehe)

    // Blick weich nachziehen; beim Nachdenken nach oben, beim Schauen geradeaus nach unten
    const blickZiel = zustand === 'denkt' ? { x: -0.6, y: -0.8 } : zustand === 'schaut' ? { x: 0, y: 0.5 } : ziel
    blick.x += (blickZiel.x - blick.x) * 0.15
    blick.y += (blickZiel.y - blick.y) * 0.15

    naechstesBlinzeln -= dt
    if (naechstesBlinzeln < 0 && zustand !== 'schlaeft') {
      blinzeln = 0.13
      naechstesBlinzeln = 2.5 + Math.random() * 3
    }
    if (blinzeln > 0) blinzeln -= dt

    const schwindelig = t < schwindelBis
    const gestupst = t - stupsZeit < 0.45 && !schwindelig
    const freude = t - freudeSeit

    // Größe: Fenni ist in Fenni-Einheiten ~100 hoch (mit Ohren und Sprung), passend zur Leistenhöhe
    const s = hoehe / 100
    let x = breite / 2
    let y = hoehe * 0.6
    let sx = 1
    let sy = 1
    let dreh = 0
    const atmen = Math.sin(t * (zustand === 'schlaeft' ? 1.3 : 2.2)) * (zustand === 'schlaeft' ? 0.035 : 0.022)
    sy += atmen
    sx -= atmen * 0.5
    if (freude < FREUDE_SPRUNG) y -= Math.abs(Math.sin(freude * 7)) * 9 * s * (1 - freude / FREUDE_SPRUNG)
    if (zustand === 'spricht') y += Math.sin(t * 9) * 0.8 * s
    if (gestupst) {
      const k = Math.exp(-(t - stupsZeit) * 7) * Math.cos((t - stupsZeit) * 28)
      sx += k * 0.18
      sy -= k * 0.16
    }
    if (schwindelig) dreh = Math.sin(t * 9) * 0.12

    g.save()
    g.translate(x, y)
    g.scale(s, s)
    // Effekte rechts neben / über dem Kopf (drehen und wippen nicht mit)
    if (zustand === 'hoert') schallwellen(g, 44, -6, t, staerke, farben)
    if (zustand === 'denkt') denkpunkte(g, 36, -34, t, farben)
    if (zustand === 'schlaeft') schlafZ(g, 34, -24, t, farben)
    if (schwindelig) schwindelSterne(g, 0, -40, t, farben)
    // Fenni: um die Unterkante wippen und quetschen
    g.translate(0, 26)
    g.rotate(dreh)
    g.scale(sx, sy)
    g.translate(0, -26)
    kopfZeichnen(g, {
      heben: zustand === 'hoert' ? 1 : 0,
      klapp: gestupst || schwindelig ? 0.6 : zustand === 'schlaeft' ? 0.25 : 0
    }, farben)
    let art = 'offen'
    if (zustand === 'schlaeft') art = 'zu'
    if (zustand === 'schaut') art = 'gross'
    if (freude < FREUDE_AUGEN) art = 'froh'
    if (gestupst) art = 'genervt'
    if (schwindelig) art = 'spirale'
    const augen = { art, groesse: zustand === 'hoert' || zustand === 'schaut' ? 1.15 : 1, blick, blinzeln: blinzeln > 0, t }
    augeZeichnen(g, -13, -5, augen, farben)
    augeZeichnen(g, 13, -5, augen, farben)
    const offen = Math.min(1, staerke * 1.6 + Math.abs(Math.sin(t * 11)) * 0.15)
    maulZeichnen(g, { spricht: zustand === 'spricht', offen }, farben)
    g.restore()
    requestAnimationFrame(bild)
  }
  requestAnimationFrame(bild)

  return {
    zustand(z) {
      zustand = z
    },
    // Stimmpegel (Liste von 0…1, tief → hoch): die tiefen Werte tragen die Stimme
    pegel(liste) {
      if (!Array.isArray(liste) || !liste.length) return (staerke = 0)
      const stimme = liste.slice(0, Math.max(1, Math.ceil(liste.length / 3)))
      staerke = Math.min(1, stimme.reduce((a, b) => a + (Number(b) || 0), 0) / stimme.length)
    },
    // Abstand der Maus zur Mitte der Leiste in Bildschirm-Pixeln
    blick(dx, dy) {
      const laenge = Math.hypot(dx, dy) || 1
      const k = Math.min(1, laenge / 300)
      ziel.x = (dx / laenge) * k
      ziel.y = (dy / laenge) * k
    },
    anstupsen() {
      const t = (performance.now() - start) / 1000
      stupsZeit = t
      stupser = stupser.filter((s) => t - s < 1.2)
      stupser.push(t)
      if (stupser.length >= 3) {
        schwindelBis = t + SCHWINDEL
        stupser = []
      }
    },
    freuen() {
      freudeSeit = (performance.now() - start) / 1000
    },
    // Stimmstärke 0…1 (für den Hintergrund, fenni/sterne.js)
    stimme: () => staerke,
    // Design gewechselt: Farben neu mischen
    farbenNeu() {
      farben = fenniFarben()
    }
  }
}
