// Fennis Körper: Kopf, Ohren, Schnauze, Wangen, Nase und Maul. Gezeichnet um den Mittelpunkt (0, 0) des Kopfes,
// in „Fenni-Einheiten“ (der Kopf ist 66 × 54 groß); Größe, Position und Wackeln setzt fenni.js vorher.

// Ein Ohr: seite -1 links, 1 rechts. heben 0…1 (gespitzt beim Zuhören), klapp 0…1 (angelegt: genervt, müde)
function ohr(g, seite, heben, klapp, f) {
  g.save()
  g.translate(seite * 20, -22)
  g.rotate(seite * (0.25 + klapp * 0.9) - seite * heben * 0.15)
  g.beginPath()
  g.moveTo(-9, 4)
  g.quadraticCurveTo(-3, -24 - heben * 6, 2, -26 - heben * 6)
  g.quadraticCurveTo(6, -12, 11, 4)
  g.closePath()
  g.fillStyle = f.dunkel
  g.fill()
  g.beginPath()
  g.moveTo(-4, 2)
  g.quadraticCurveTo(-1, -16 - heben * 5, 2, -18 - heben * 5)
  g.quadraticCurveTo(4, -8, 6, 2)
  g.closePath()
  g.fillStyle = f.innen
  g.fill()
  g.restore()
}

// Ohren und Kopf (die Augen kommen danach, siehe augen.js)
export function kopfZeichnen(g, { heben = 0, klapp = 0 }, f) {
  ohr(g, -1, heben, klapp, f)
  ohr(g, 1, heben, klapp, f)
  g.beginPath()
  g.roundRect(-33, -27, 66, 54, 24)
  g.fillStyle = f.fell
  g.fill()
  // Schnauze und Wangen
  g.beginPath()
  g.ellipse(0, 13, 18, 11, 0, 0, Math.PI * 2)
  g.fillStyle = f.schnauze
  g.fill()
  g.beginPath()
  g.ellipse(-20, 8, 6, 3.5, 0, 0, Math.PI * 2)
  g.ellipse(20, 8, 6, 3.5, 0, 0, Math.PI * 2)
  g.fillStyle = f.wange
  g.fill()
}

// Nase und Maul. offen 0…1: beim Sprechen (aus dem Stimmpegel), sonst das kleine „w“.
// hecheln: Maul offen, Zunge hängt raus und wippt (zunge -1…1 aus fenni.js)
export function maulZeichnen(g, { offen = 0, spricht = false, hecheln = false, zunge = 0 }, f) {
  g.beginPath()
  g.moveTo(-5, 6)
  g.quadraticCurveTo(0, 4, 5, 6)
  g.quadraticCurveTo(1, 11, 0, 11)
  g.quadraticCurveTo(-1, 11, -5, 6)
  g.fillStyle = f.auge
  g.fill()
  if (spricht) {
    const hoehe = 2 + offen * 5
    g.beginPath()
    g.ellipse(0, 15 + hoehe / 2, 4.5, hoehe / 1.6 + 1, 0, 0, Math.PI * 2)
    g.fillStyle = f.maul
    g.fill()
    return
  }
  if (hecheln) {
    // offenes Maul (breites „D“ nach unten)
    g.beginPath()
    g.moveTo(-6.5, 12)
    g.quadraticCurveTo(0, 10.5, 6.5, 12)
    g.quadraticCurveTo(6, 19, 0, 19.5)
    g.quadraticCurveTo(-6, 19, -6.5, 12)
    g.fillStyle = f.maul
    g.fill()
    // Zunge: hängt über die Unterlippe, wippt mit dem Atem
    const lang = 27 + zunge * 1.6
    g.beginPath()
    g.moveTo(-4.2, 15)
    g.lineTo(-4.2, lang - 3.5)
    g.quadraticCurveTo(-4.2, lang + 0.5, 0, lang + 0.5)
    g.quadraticCurveTo(4.2, lang + 0.5, 4.2, lang - 3.5)
    g.lineTo(4.2, 15)
    g.closePath()
    g.fillStyle = f.zunge
    g.fill()
    g.strokeStyle = f.zungeLinie
    g.lineWidth = 0.9
    g.beginPath()
    g.moveTo(0, 16)
    g.lineTo(0, lang - 2.5)
    g.stroke()
    return
  }
  g.strokeStyle = f.auge
  g.lineWidth = 1.6
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(0, 11)
  g.quadraticCurveTo(-3, 15, -6, 13)
  g.moveTo(0, 11)
  g.quadraticCurveTo(3, 15, 6, 13)
  g.stroke()
}
