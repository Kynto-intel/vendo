// Kleine Effekte neben Fenni (in Fenni-Einheiten, x/y = Punkt rechts neben dem Kopf):
// Schallwellen beim Zuhören, Denk-Punkte, „z z“ beim Schlafen, Sterne beim Schwindel.

// Zuhören: drei Bögen wandern nach außen, lauter = kräftiger
export function schallwellen(g, x, y, t, staerke, f) {
  g.save()
  g.strokeStyle = f.effekt
  g.lineWidth = 2
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const p = (t * 1.4 + i / 3) % 1
    g.globalAlpha = (1 - p) * (0.45 + Math.min(1, staerke) * 0.55)
    g.beginPath()
    g.arc(x, y, 8 + p * 18, -0.6, 0.6)
    g.stroke()
  }
  g.restore()
}

// Nachdenken: drei Punkte hüpfen nacheinander
export function denkpunkte(g, x, y, t, f) {
  g.save()
  g.fillStyle = f.effekt
  for (let i = 0; i < 3; i++) {
    const hoehe = Math.max(0, Math.sin(t * 5 - i * 0.7)) * 5
    g.beginPath()
    g.arc(x + i * 10, y - hoehe, 3, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

// Schlafen (keine Verbindung zu Hermes): zwei „z“ steigen auf
export function schlafZ(g, x, y, t, f) {
  g.save()
  g.fillStyle = f.effekt
  g.font = '500 13px "Segoe UI", sans-serif'
  for (let i = 0; i < 2; i++) {
    const p = (t * 0.5 + i * 0.5) % 1
    g.globalAlpha = 1 - p
    g.fillText('z', x + p * 14, y - p * 20)
  }
  g.restore()
}

// Schwindelig: drei Sterne kreisen über dem Kopf
export function schwindelSterne(g, x, y, t, f) {
  g.save()
  g.fillStyle = f.effekt
  for (let i = 0; i < 3; i++) {
    const a = t * 4 + i * 2.09
    g.beginPath()
    g.arc(x + Math.cos(a) * 30, y + Math.sin(a) * 6, 2.4, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}
