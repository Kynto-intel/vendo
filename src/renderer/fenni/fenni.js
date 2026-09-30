// Fenni, der kleine Wolf in der Mini-Insel (Fenrirs kleiner Bruder), mit ganzem Körper. Er spaziert durch die Insel,
// schnüffelt und setzt sich wieder (spaziergang.js); tut Luzzy etwas, läuft er zurück in die Mitte. Zeigt, was sie tut:
//   bereit (atmet, blinzelt) · hoert (Ohren gespitzt, Schallwellen) · denkt (Blick nach oben, Punkte)
//   spricht (Maul nach dem Stimmpegel) · schlaeft (keine Verbindung zu Hermes) · schaut (auf den Bildschirm)
// Dazu: freuen() (Sprung, wenn Luzzy fertig ist, danach hechelt er), anstupsen() (genervt, dreimal schnell: schwindelig),
// klick() (kleiner Hüpfer mit großen Augen), streicheln() (Maus über ihm hin und her: Augen zu, hechelt),
// aufhorchen() (Ohren hoch, schaut nach unten auf eine Meldung), blick(dx, dy) (Augen folgen der Maus, Abstand in
// Bildschirm-Pixeln zur Mitte der Leiste). Wenn er bereit ist, hechelt er ab und zu von selbst.
// frage(an) legt den Kopf schief (Luzzy fragt etwas oder wartet auf dein Ja), hungrig(an) reißt das Maul auf (Datei wird
// über ihn gezogen), fressen() kaut die Datei, heulen() heult wie ein Wolf (Meilenstein erreicht).
// Nur Canvas, keine Bilder. Teile: koerper.js (Kopf), augen.js, rumpf.js (Körper), spaziergang.js, effekte.js, farben.js.

import { kopfZeichnen, maulZeichnen } from './koerper.js'
import { augeZeichnen } from './augen.js'
import { schallwellen, denkpunkte, schlafZ, schwindelSterne, fragezeichen, heulNoten } from './effekte.js'
import { fenniFarben } from './farben.js'
import { sitzenZeichnen, seitlichZeichnen, liegenZeichnen } from './rumpf.js'
import { spaziergangErstellen } from './spaziergang.js'

const FREUDE_SPRUNG = 1.6 // Sekunden hüpfen
const FREUDE_AUGEN = 2.2 // Sekunden ^ ^
const SCHWINDEL = 2.6 // Sekunden nach dreimal Anstupsen
const KLICK = 0.55 // Sekunden Hüpfer nach einem Klick
const HECHELN_NACH_FREUDE = 3 // Sekunden
const hechelPause = () => 35 + Math.random() * 50 // Sekunden bis zum nächsten Hecheln von selbst
const KOPF = 0.72 // Kopfgröße am Körper
const KAUEN = 1.2 // Sekunden kauen nach dem Fressen
const HEULEN = 3.4 // Sekunden heulen
const RAND = 46 // Pixel, die er beim Spazieren vom Rand der Insel wegbleibt (runde Ecken unten)
const WECHSEL = 0.22 // Sekunden „Plopp“, wenn er sich hinsetzt oder aufsteht

export function fenniErstellen(canvas) {
  const g = canvas.getContext('2d')
  let farben = fenniFarben()
  let zustand = 'bereit'
  let staerke = 0 // Stimmpegel 0…1 (Sprechen, Zuhören)
  const blick = { x: 0, y: 0 }
  const ziel = { x: 0, y: 0 }
  const maus = { x: 0, y: 0 } // Abstand der Maus zur Mitte der Insel (Pixel)
  const gang = spaziergangErstellen()
  let lauf = 0 // 0…1, weich zwischen stehen und laufen
  let senken = 0 // 0…1, Kopf unten zum Schnüffeln
  let ansicht = 'vorne' // vorne (sitzt), seite (steht, läuft, schnüffelt), liegen
  let wechselZeit = -99
  let fragt = false
  let hungrig = false
  let kauenBis = -99
  let heulSeit = -99
  let blinzeln = 0
  let naechstesBlinzeln = 2
  let stupsZeit = -99
  let stupser = []
  let schwindelBis = -99
  let freudeSeit = -99
  let klickZeit = -99
  let horchBis = -99
  let streichelnBis = -99
  let hechelnBis = -99
  let naechstesHecheln = hechelPause()
  const start = performance.now()
  let letztes = start

  // Schärfe auf hochauflösenden Bildschirmen
  function groesseAnpassen() {
    const dpr = window.devicePixelRatio || 1
    const breite = Math.round(canvas.clientWidth * dpr)
    const hoehe = Math.round(canvas.clientHeight * dpr)
    if (breite !== canvas.width) canvas.width = breite
    if (hoehe !== canvas.height) canvas.height = hoehe
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
    const klick = t - klickZeit
    const horcht = t < horchBis
    const streichelt = t < streichelnBis && zustand === 'bereit'
    // Hecheln: von selbst ab und zu, nach der Freude und beim Streicheln, aber nur, wenn Luzzy nichts tut
    if (zustand === 'bereit') naechstesHecheln -= dt
    if (naechstesHecheln < 0) {
      hechelnBis = t + 2.5 + Math.random() * 2
      naechstesHecheln = hechelPause()
    }
    const kaut = t < kauenBis
    const heult = t - heulSeit < HEULEN
    const schief = fragt && zustand === 'bereit' && !heult && !kaut
    const hechelt = zustand === 'bereit' && !gestupst && !schwindelig && !hungrig && !kaut && !heult && (t < hechelnBis || streichelt)

    // Größe: Fenni ist sitzend ~88 Fenni-Einheiten hoch (Pfoten bis Ohrspitzen), passend zur Inselhöhe
    const s = hoehe / 90
    gang.weiter(dt, { zustand, grenze: Math.max(0, breite / 2 - RAND), still: streichelt || schwindelig || gestupst || freude < FREUDE_SPRUNG || hungrig || kaut || heult })
    const lage = gang.lage()
    lauf += ((lage.haltung === 'laufen' ? 1 : 0) - lauf) * Math.min(1, dt * 10)
    senken += ((lage.haltung === 'schnueffeln' ? 1 : 0) - senken) * Math.min(1, dt * 6)
    const neueAnsicht = lage.haltung === 'sitzen' ? 'vorne' : lage.haltung === 'liegen' ? 'liegen' : 'seite'
    if (neueAnsicht !== ansicht) {
      ansicht = neueAnsicht
      wechselZeit = t
    }
    // Augen: beim Laufen in Laufrichtung, sonst zur Maus (von seinem Platz aus gesehen)
    const lange = Math.hypot(maus.x - lage.x, maus.y) || 1
    const k = Math.min(1, lange / 300)
    ziel.x = lage.haltung === 'laufen' ? lage.richtung * 0.9 : ((maus.x - lage.x) / lange) * k
    ziel.y = lage.haltung === 'laufen' ? 0.1 : lage.haltung === 'schnueffeln' ? 0.9 : (maus.y / lange) * k
    // Schwanz: wedelt beim Streicheln, bei Meldungen und vor Freude, sonst schwingt er leicht
    const wedeln = streichelt || horcht || hungrig || kaut || freude < FREUDE_AUGEN + 1 ? Math.sin(t * 16) : Math.sin(t * 2) * 0.15

    const x = breite / 2 + lage.x
    let y = hoehe - 1.5 // Boden
    let sx = 1
    let sy = 1
    let dreh = 0
    const atmen = hechelt ? Math.sin(t * 14) * 0.022 : Math.sin(t * (zustand === 'schlaeft' ? 1.3 : 2.2)) * (zustand === 'schlaeft' ? 0.025 : 0.014)
    sy += atmen
    sx -= atmen * 0.5
    if (freude < FREUDE_SPRUNG) y -= Math.abs(Math.sin(freude * 7)) * 7 * s * (1 - freude / FREUDE_SPRUNG)
    if (klick < KLICK) y -= Math.sin((klick / KLICK) * Math.PI) * 5 * s
    if (zustand === 'spricht') y += Math.sin(t * 9) * 0.6 * s
    if (gestupst) {
      const q = Math.exp(-(t - stupsZeit) * 7) * Math.cos((t - stupsZeit) * 28)
      sx += q * 0.16
      sy -= q * 0.14
    }
    if (t - wechselZeit < WECHSEL) {
      const q = Math.sin(((t - wechselZeit) / WECHSEL) * Math.PI)
      sx += q * 0.1
      sy -= q * 0.12
    }
    if (schwindelig) dreh = Math.sin(t * 9) * 0.1
    if (kaut) {
      sy -= Math.abs(Math.sin(t * 16)) * 0.05
      sx += Math.abs(Math.sin(t * 16)) * 0.03
    }
    if (heult) sy += Math.sin(Math.min(1, (t - heulSeit) / 0.4) * Math.PI / 2) * 0.05 // streckt sich

    // Körper (um den Boden unter ihm wippen, quetschen, drehen)
    g.save()
    g.translate(x, y)
    g.rotate(dreh)
    g.scale(s * sx, s * sy)
    let kopf
    if (ansicht === 'vorne') kopf = sitzenZeichnen(g, { wedeln }, farben)
    else {
      g.save()
      g.scale(lage.richtung, 1)
      kopf = ansicht === 'liegen'
        ? liegenZeichnen(g, { wedeln }, farben)
        : seitlichZeichnen(g, { schritt: lage.phase, laeuft: lauf, senken: senken * (0.85 + Math.sin(t * 9) * 0.15), wedeln }, farben)
      g.restore()
      kopf = { x: kopf.x * lage.richtung, y: kopf.y }
    }
    // Kopf
    g.translate(kopf.x, kopf.y)
    g.scale(KOPF, KOPF)
    if (ansicht === 'seite') g.rotate(lage.richtung * senken * 0.18)
    if (schief) g.rotate(0.24 + Math.sin(t * 1.5) * 0.04) // Kopf schief: „Hm?“
    if (heult) g.translate(0, -4) // Schnauze nach oben
    kopfZeichnen(g, {
      heben: zustand === 'hoert' || horcht || hungrig || schief || klick < KLICK ? 1 : 0,
      klapp: gestupst || schwindelig ? 0.6 : zustand === 'schlaeft' ? 0.25 : heult ? 0.3 : streichelt ? 0.35 + Math.sin(t * 6) * 0.05 : 0
    }, farben)
    let art = 'offen'
    if (zustand === 'schlaeft') art = 'zu'
    if (zustand === 'schaut' || horcht || klick < KLICK) art = 'gross'
    if (freude < FREUDE_AUGEN || streichelt) art = 'froh'
    if (gestupst) art = 'genervt'
    if (schwindelig) art = 'spirale'
    if (hungrig) art = 'gross'
    if (kaut) art = 'froh'
    if (heult) art = 'zu'
    const augen = { art, groesse: zustand === 'hoert' || zustand === 'schaut' || horcht || hungrig || klick < KLICK ? 1.15 : 1, blick: horcht ? { x: 0.2, y: 0.9 } : blick, blinzeln: blinzeln > 0, t }
    augeZeichnen(g, -13, -5, augen, farben)
    augeZeichnen(g, 13, -5, augen, farben)
    const offen = Math.min(1, staerke * 1.6 + Math.abs(Math.sin(t * 11)) * 0.15)
    // Maul: weit auf (hungrig), kauen, heulen (rund mit Vibrato), sprechen oder hecheln
    const maulOffen = hungrig ? 1 : kaut ? Math.abs(Math.sin(t * 16)) * 0.8 : heult ? 0.6 + Math.sin(t * 30) * 0.08 : offen
    maulZeichnen(g, { spricht: zustand === 'spricht' || hungrig || kaut || heult, offen: maulOffen, hecheln: hechelt, zunge: Math.sin(t * 14) }, farben)
    g.restore()

    // Effekte neben dem Kopf (drehen und wippen nicht mit)
    g.save()
    g.translate(x + kopf.x * s * sx, y + kopf.y * s * sy)
    g.scale(s * KOPF * 1.15, s * KOPF * 1.15)
    if (zustand === 'hoert') schallwellen(g, 40, -6, t, staerke, farben)
    if (zustand === 'denkt') denkpunkte(g, 34, -30, t, farben)
    if (zustand === 'schlaeft') schlafZ(g, 30, -22, t, farben)
    if (schwindelig) schwindelSterne(g, 0, -36, t, farben)
    if (schief) fragezeichen(g, 32, 4, t, farben) // neben dem Kopf (darüber ist die Bildschirmkante)
    if (heult) heulNoten(g, 26, 2, t, (t - heulSeit) / HEULEN, farben)
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
    // Abstand der Maus zur Mitte der Insel in Bildschirm-Pixeln (die Augen rechnen von Fennis Platz aus)
    blick(dx, dy) {
      maus.x = dx
      maus.y = dy
    },
    // Wo Fenni gerade ist: Pixel von der Mitte der Insel (mini.js: Texte blass, Streicheln)
    position: () => gang.lage().x,
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
      hechelnBis = freudeSeit + FREUDE_AUGEN + HECHELN_NACH_FREUDE
    },
    // Klick auf die Leiste: kleiner Hüpfer, Ohren hoch, große Augen
    klick() {
      klickZeit = (performance.now() - start) / 1000
    },
    // Maus streicht über Fenni: solange das anhält, Augen ^ ^, Ohren angelegt, hechelt
    streicheln() {
      streichelnBis = (performance.now() - start) / 1000 + 0.9
    },
    // Neue Meldung: Ohren hoch, schaut nach unten auf die Sprechblase
    aufhorchen(sekunden = 2.5) {
      horchBis = (performance.now() - start) / 1000 + sekunden
    },
    // Luzzy fragt etwas oder wartet auf dein Ja: Kopf schief, Fragezeichen
    frage(an) {
      fragt = Boolean(an)
    },
    // Eine Datei wird über die Insel gezogen: er setzt sich und reißt das Maul auf
    hungrig(an) {
      hungrig = Boolean(an)
      if (hungrig) gang.hinsetzen()
    },
    // Datei losgelassen: kauen, danach freut er sich
    fressen() {
      hungrig = false
      gang.hinsetzen()
      kauenBis = (performance.now() - start) / 1000 + KAUEN
      setTimeout(() => this.freuen(), KAUEN * 1000)
    },
    // Meilenstein: setzt sich und heult wie ein Wolf
    heulen() {
      gang.hinsetzen()
      heulSeit = (performance.now() - start) / 1000
    },
    // Stimmstärke 0…1 (für den Hintergrund, fenni/sterne.js)
    stimme: () => staerke,
    // Design gewechselt: Farben neu mischen
    farbenNeu() {
      farben = fenniFarben()
    }
  }
}
