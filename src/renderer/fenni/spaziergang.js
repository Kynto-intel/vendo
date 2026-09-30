// Fennis Spaziergang in der Insel: wo er ist, wohin er läuft und in welcher Haltung (sitzen, stehen, laufen,
// schnueffeln, liegen). Zeichnen tut fenni.js mit rumpf.js; hier steht nur der Ablauf.
//   Luzzy tut nichts: sitzen (8–22 s) → aufstehen → zu einem Platz laufen → stehen, oft schnüffeln → hinsetzen.
//   Luzzy hört zu, denkt, spricht oder schaut: er läuft zügig zurück in die Mitte und setzt sich.
//   Keine Verbindung: er legt sich hin, wo er gerade ist.
// x in Pixeln, 0 = Mitte der Insel.

const AKTIV = ['hoert', 'denkt', 'spricht', 'schaut']
const zufall = (von, bis) => von + Math.random() * (bis - von)
const TEMPO = { bummeln: [22, 32], zurueck: 80 } // Pixel pro Sekunde

export function spaziergangErstellen() {
  let x = 0
  let richtung = 1
  let haltung = 'sitzen'
  let seit = 0 // Sekunden in dieser Haltung
  let bis = zufall(6, 12) // Sekunden bis zum nächsten Schritt im Ablauf
  let ziel = null // Pixel, wohin er läuft
  let tempo = 0
  let danach = 'sitzen' // was nach dem Stehen kommt
  let phase = 0 // Laufphase der Beine

  function wechsel(neu) {
    if (neu === haltung) return
    haltung = neu
    seit = 0
  }
  function losgehen(nach, schnell) {
    ziel = nach
    tempo = schnell || zufall(...TEMPO.bummeln)
  }

  return {
    // dt: Sekunden seit dem letzten Bild; grenze: so weit darf er von der Mitte weg (Pixel);
    // still: gerade nicht losgehen (gestreichelt, schwindelig, freut sich)
    weiter(dt, { zustand, grenze, still }) {
      seit += dt
      if (Math.abs(x) > grenze) x = Math.sign(x) * grenze // Insel kleiner geworden
      if (zustand === 'schlaeft') {
        ziel = null
        wechsel('liegen')
        return
      }
      if (haltung === 'liegen') {
        wechsel('sitzen')
        bis = zufall(3, 6)
      }
      const aktiv = AKTIV.includes(zustand)
      if (aktiv) {
        if (Math.abs(x) > 1.5 && (ziel !== 0 || tempo < TEMPO.zurueck)) losgehen(0, TEMPO.zurueck)
        if (ziel === null && haltung !== 'sitzen') wechsel('sitzen')
      }
      if (ziel !== null) {
        // erst kurz aufstehen, dann laufen
        if (haltung === 'sitzen' || haltung === 'schnueffeln') wechsel('stehen')
        if (haltung === 'stehen' && seit < (aktiv ? 0.08 : 0.35)) return
        wechsel('laufen')
        richtung = Math.sign(ziel - x) || richtung
        x += richtung * tempo * dt
        phase += dt * Math.min(20, tempo * 0.42)
        if ((ziel - x) * richtung <= 0) {
          x = ziel
          ziel = null
          wechsel('stehen')
          bis = aktiv ? 0 : zufall(0.4, 0.9)
          danach = Math.random() < 0.65 ? 'schnueffeln' : 'sitzen'
        }
        return
      }
      if (still || aktiv) return
      bis -= dt
      if (bis > 0) return
      if (haltung === 'sitzen') {
        // neuer Platz: meist irgendwo in der Insel, manchmal zurück zur Mitte, nie ganz nah am alten
        let nach = Math.random() < 0.3 ? 0 : zufall(-grenze, grenze)
        if (Math.abs(nach - x) < 50) nach = x > 0 ? x - zufall(60, 120) : x + zufall(60, 120)
        losgehen(Math.max(-grenze, Math.min(grenze, nach)))
      } else if (haltung === 'stehen') {
        wechsel(danach)
        if (danach === 'schnueffeln') {
          bis = zufall(1.5, 3.2)
          danach = Math.random() < 0.45 ? 'weiter' : 'sitzen'
        } else bis = zufall(8, 22)
      } else if (haltung === 'schnueffeln') {
        if (danach === 'weiter') {
          const nach = x + (Math.random() < 0.5 ? -1 : 1) * zufall(40, 90)
          losgehen(Math.max(-grenze, Math.min(grenze, nach)))
        } else {
          wechsel('stehen')
          danach = 'sitzen'
          bis = 0.4
        }
      }
    },
    lage: () => ({ x, richtung, haltung, seit, phase })
  }
}
