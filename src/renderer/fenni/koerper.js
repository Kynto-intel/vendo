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

// Nase und Maul. offen 0…1: beim Sprechen (aus dem Stimmpegel), sonst das kleine „w“
export function maulZeichnen(g, { offen = 0, spricht = false }, f) {
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
