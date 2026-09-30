// Fennis Augen. art: 'offen' (folgt dem Blick), 'zu' (schläft), 'froh' (^ ^ nach einer fertigen Antwort),
// 'genervt' (halb zu nach dem Anstupsen), 'spirale' (schwindelig), 'gross' (schaut auf den Bildschirm).
// blick: { x, y } je -1…1, blinzeln: true für einen kurzen Lidschlag.

export function augeZeichnen(g, x, y, { art = 'offen', groesse = 1, blick = { x: 0, y: 0 }, blinzeln = false, t = 0 }, f) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = f.auge
  g.lineCap = 'round'

  if (art === 'zu') {
    g.lineWidth = 2.4
    g.beginPath()
    g.arc(0, -1, 5, 0.15 * Math.PI, 0.85 * Math.PI)
    g.stroke()
    return g.restore()
  }
  if (art === 'froh') {
    g.lineWidth = 2.6
    g.beginPath()
    g.arc(0, 3, 5.5, 1.15 * Math.PI, 1.85 * Math.PI)
    g.stroke()
    return g.restore()
  }
  if (art === 'spirale') {
    g.lineWidth = 1.8
    g.beginPath()
    for (let a = 0; a < 14; a += 0.2) g.lineTo(Math.cos(a + t * 8) * a * 0.55, Math.sin(a + t * 8) * a * 0.55)
    g.stroke()
    return g.restore()
  }

  // Offenes Auge mit Pupille, die dem Blick folgt
  g.scale(groesse, groesse * (blinzeln ? 0.12 : 1))
  g.beginPath()
  g.ellipse(0, 0, 7.5, 8.5, 0, 0, Math.PI * 2)
  g.fillStyle = f.augeWeiss
  g.fill()
  const px = blick.x * 3
  const py = blick.y * 3
  g.beginPath()
  g.arc(px, py, art === 'gross' ? 3.6 : 4.6, 0, Math.PI * 2)
  g.fillStyle = f.auge
  g.fill()
  g.beginPath()
  g.arc(px - 1.6, py - 1.8, 1.5, 0, Math.PI * 2)
  g.fillStyle = '#fff'
  g.fill()
  if (art === 'genervt') {
    // Oberlid halb zu, mit einer geraden Kante
    g.fillStyle = f.fell
    g.fillRect(-9, -10, 18, 8)
    g.strokeStyle = f.innen
    g.lineWidth = 1.6
    g.beginPath()
    g.moveTo(-7, -2)
    g.lineTo(7, -3.5)
    g.stroke()
  }
  g.restore()
}
