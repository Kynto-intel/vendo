// Gedankenspeicher, Hintergrundteil: Notiz zusätzlich im Vault festhalten
// (Donnerwolf-Shop\Jarves-OS\Gedankenspeicher.md, wird nur ergänzt, nie überschrieben).

module.exports = (ctx) => {
  ctx.bereitstellen('imVault', (zeile) =>
    ctx.vault.anhaengen('Gedankenspeicher.md', `- ${String(zeile).replace(/\s+/g, ' ').slice(0, 2000)}`, {
      kopf: '# Gedankenspeicher\n\nVon Jarves-OS: alles, was Felix sich mit „Merk dir …“ notiert hat. Neueste unten.'
    })
  )
}
