// Fennis Körper unter dem Kopf: Rumpf, Beine, Pfoten und Schwanz. Zwei Ansichten:
//   sitzen   – von vorne wie ein sitzender Welpe, Pfoten mit rosa Ballen nach vorne
//   seitlich – Rumpf quer, vier Beine, Schwanz hinten; für stehen, schnüffeln und laufen
// Koordinaten in Fenni-Einheiten, (0, 0) = Boden unter seiner Mitte. Beide geben zurück, wo der Kopf hingehört
// ({ x, y } = Kopfmitte); den Kopf selbst zeichnen koerper.js und augen.js (fenni.js setzt alles zusammen).

// Pfote von vorne gesehen (Sohle zu dir): heller Ballen mit drei Zehen
function sohle(g, x, y, f) {
  g.beginPath()
  g.ellipse(x, y, 6.5, 5.5, 0, 0, Math.PI * 2)
  g.fillStyle = f.schnauze
  g.fill()
  g.fillStyle = f.ballen
  g.beginPath()
  g.ellipse(x, y + 1.2, 2.8, 2.2, 0, 0, Math.PI * 2)
  g.fill()
  for (const dx of [-3.1, 0, 3.1]) {
    g.beginPath()
    g.arc(x + dx, y - 2.9 + Math.abs(dx) * 0.25, 1.15, 0, Math.PI * 2)
    g.fill()
  }
}

// Buschiger Schwanz als dicker, runder Strich mit heller Spitze; wedeln -1…1 dreht ihn um die Wurzel
function schwanz(g, x, y, winkel, wedeln, f) {
  g.save()
  g.translate(x, y)
  g.rotate(winkel + wedeln * 0.45)
  g.lineCap = 'round'
  g.strokeStyle = f.fellDunkel
  g.lineWidth = 8.5
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(12, -2, 13, -15)
  g.stroke()
  g.strokeStyle = f.schnauze
  g.lineWidth = 6.5
  g.beginPath()
  g.moveTo(13.2, -12)
  g.lineTo(13, -15.5)
  g.stroke()
  g.restore()
}

// Sitzt, von vorne. wedeln: -1…1
export function sitzenZeichnen(g, { wedeln = 0 } = {}, f) {
  schwanz(g, 12, -5, 0.7, wedeln, f) // liegt seitlich am Boden
  // Hinterbacken seitlich unten, etwas dunkler, hinter dem Rumpf
  g.fillStyle = f.fellDunkel
  g.beginPath()
  g.ellipse(-12, -9, 10, 9, 0, 0, Math.PI * 2)
  g.ellipse(12, -9, 10, 9, 0, 0, Math.PI * 2)
  g.fill()
  // Rumpf und heller Bauch
  g.fillStyle = f.fell
  g.beginPath()
  g.ellipse(0, -19, 15.5, 17, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(0, -17, 9, 12, 0, 0, Math.PI * 2)
  g.fill()
  // Vorderbeine mit Pfoten
  g.fillStyle = f.fell
  g.beginPath()
  g.roundRect(-10.5, -24, 7.5, 23, 3.7)
  g.roundRect(3, -24, 7.5, 23, 3.7)
  g.fill()
  g.strokeStyle = f.linie
  g.lineWidth = 0.9
  g.beginPath()
  g.moveTo(-3, -18)
  g.lineTo(-3, -4)
  g.moveTo(3, -18)
  g.lineTo(3, -4)
  g.stroke()
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(-6.8, -2.3, 4.6, 2.9, 0, 0, Math.PI * 2)
  g.ellipse(6.8, -2.3, 4.6, 2.9, 0, 0, Math.PI * 2)
  g.fill()
  // Hinterpfoten nach vorne, Sohle zu dir
  sohle(g, -17, -5, f)
  sohle(g, 17, -5, f)
  return { x: 0, y: -50 }
}

// Ein Bein von der Seite: Strich von der Hüfte zum Boden, schwingt um die Hüfte; heben hebt die Pfote beim Schritt
function bein(g, x, winkel, heben, farbe, f) {
  const laenge = 13.5
  const fx = x + Math.sin(winkel) * laenge
  const fy = -16 + Math.cos(winkel) * laenge - heben
  g.strokeStyle = farbe
  g.lineCap = 'round'
  g.lineWidth = 6.5
  g.beginPath()
  g.moveTo(x, -16)
  g.lineTo(fx, fy)
  g.stroke()
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(fx + 1.2, fy + 0.6, 4.2, 2.6, 0, 0, Math.PI * 2)
  g.fill()
}

// Von der Seite (nach rechts; fenni.js spiegelt für links). schritt: Laufphase in Radiant, laeuft 0…1 (0 = steht),
// senken 0…1 (Kopf zum Schnüffeln unten), wedeln -1…1
export function seitlichZeichnen(g, { schritt = 0, laeuft = 0, senken = 0, wedeln = 0 } = {}, f) {
  const wippen = -Math.abs(Math.sin(schritt)) * 1.6 * laeuft
  // Diagonalgang: vorne nah + hinten fern gleich, vorne fern + hinten nah gegenläufig
  const a = Math.sin(schritt) * 0.5 * laeuft
  const b = Math.sin(schritt + Math.PI) * 0.5 * laeuft
  const hebA = Math.max(0, Math.cos(schritt)) * 3.5 * laeuft
  const hebB = Math.max(0, Math.cos(schritt + Math.PI)) * 3.5 * laeuft
  g.save()
  g.translate(0, wippen)
  // ferne Beine (dunkler, hinter dem Rumpf)
  bein(g, 9, b, hebB, f.fellDunkel, f)
  bein(g, -12, a, hebA, f.fellDunkel, f)
  schwanz(g, -19, -24, -1.05, wedeln, f)
  // Rumpf, heller Bauch
  g.fillStyle = f.fell
  g.beginPath()
  g.ellipse(0, -21, 22, 12.5, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(3, -14.5, 14, 5, 0, 0, Math.PI * 2)
  g.fill()
  // nahe Beine
  bein(g, 12, a, hebA, f.fell, f)
  bein(g, -9, b, hebB, f.fell, f)
  g.restore()
  return { x: 17 + senken * 3, y: -41 + senken * 14 + wippen }
}

// Liegt auf dem Bauch (von der Seite, nach rechts), Vorderpfoten nach vorne, Schwanz hinten am Boden; der Kopf ruht
// vorne fast auf dem Boden. Für „keine Verbindung“ (schläft).
export function liegenZeichnen(g, { wedeln = 0 } = {}, f) {
  schwanz(g, -18, -6, -2.2, wedeln * 0.4, f)
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(24, -2.2, 5.2, 2.7, 0, 0, Math.PI * 2) // ferne Vorderpfote
  g.fill()
  g.fillStyle = f.fell
  g.beginPath()
  g.ellipse(0, -10, 22, 10, 0, 0, Math.PI * 2)
  g.ellipse(-11, -9.5, 9.5, 8, 0, 0, Math.PI * 2) // Hinterbacke
  g.fill()
  g.strokeStyle = f.linie
  g.lineWidth = 1
  g.beginPath()
  g.arc(-11, -9.5, 7, -2.6, 0.2)
  g.stroke()
  g.fillStyle = f.schnauze
  g.beginPath()
  g.ellipse(3, -3.5, 14, 3.5, 0, 0, Math.PI * 2) // heller Bauch
  g.ellipse(-3, -2.2, 5, 2.6, 0, 0, Math.PI * 2) // Hinterpfote
  g.ellipse(18, -2.4, 5.5, 2.8, 0, 0, Math.PI * 2) // nahe Vorderpfote
  g.fill()
  return { x: 18, y: -21 }
}
