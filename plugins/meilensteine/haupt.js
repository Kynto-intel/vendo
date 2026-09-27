// Meilensteine, Hintergrundteil: Anzahl aller Bestellungen (zählt der Wächter bei Shopify, siehe src/main/waechter.js)
// und die im Vault festgehaltenen Meilensteine (Jarves-OS\Meilensteine.md) lesen.

const fs = require('node:fs')
const { istMeilenstein, meilensteinEinstellungen, STAND_DATEI } = require('../../src/main/waechter')

module.exports = (ctx) => {
  ctx.bereitstellen('stand', async () => {
    let stand = {}
    try {
      stand = JSON.parse(fs.readFileSync(STAND_DATEI, 'utf8'))
    } catch {
      // Wächter hat noch nicht gezählt
    }
    // Gefeierte Meilensteine aus dem Vault: „- 27.09.2026 · 1.500. Bestellung (um #2501)“
    const text = await ctx.vault.lesen('Meilensteine.md')
    const gefeiert = {}
    for (const z of text.matchAll(/^- (\d{2}\.\d{2}\.\d{4}) · ([\d.]+)\. Bestellung(?: \(um (#\d+)\))?(?::.*)?$/gm)) {
      gefeiert[Number(z[2].replace(/\./g, ''))] = { datum: z[1], bestellung: z[3] || '' }
    }
    return { anzahl: stand.bestellAnzahl ?? null, zeit: stand.bestellAnzahlZeit ?? null, gefeiert }
  })
  // Alle Meilensteine bis n (für die Liste): 10, 25, 50, 100, 250, 500, 750, 1.000, 1.500 …
  // (liest die Einstellungen frisch: Schrittweite und eigene Ziele aus daten.json)
  ctx.bereitstellen('liste', (bis) => {
    const e = meilensteinEinstellungen()
    const grenze = Math.max(1000, Number(bis) || 0, ...e.eigene.map((x) => x.anzahl))
    const liste = []
    for (let n = 1; n <= grenze; n++) if (istMeilenstein(n, e)) liste.push(n)
    return liste
  })
}
