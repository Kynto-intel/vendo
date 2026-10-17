// Gedankenspeicher, Hintergrundteil: Notiz zusätzlich im Vault festhalten
// (Donnerwolf-Shop\Vendo\Gedankenspeicher.md, wird nur ergänzt, nie überschrieben).
// Diktierte Ideen („Neue Idee: …“) werden eigene Notizen in Vendo\Ideen\ (mit Datum und Schlagworten).

module.exports = (ctx) => {
  ctx.bereitstellen('imVault', (zeile) =>
    ctx.vault.anhaengen('Gedankenspeicher.md', `- ${String(zeile).replace(/\s+/g, ' ').slice(0, 2000)}`, {
      kopf: '# Gedankenspeicher\n\nVon Vendo: alles, was Felix sich mit „Merk dir …“ notiert hat. Neueste unten.'
    })
  )

  ctx.bereitstellen('ideeAnlegen', ({ titel, schlagworte, text, original, zeit } = {}) => {
    const datum = new Date(Number(zeit) || Date.now())
    const zweistellig = (n) => String(n).padStart(2, '0')
    const tag = `${datum.getFullYear()}-${zweistellig(datum.getMonth() + 1)}-${zweistellig(datum.getDate())}`
    const uhrzeit = `${zweistellig(datum.getHours())}:${zweistellig(datum.getMinutes())}`
    const tags = ['idee', ...(Array.isArray(schlagworte) ? schlagworte : [])]
      .map((t) => String(t).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter((t, i, alle) => t && alle.indexOf(t) === i)
      .slice(0, 7)
    const sauberTitel = String(titel || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Idee'
    const inhalt = [
      '---',
      `tags: [${tags.join(', ')}]`,
      `datum: ${tag}`,
      `uhrzeit: "${uhrzeit}"`,
      'quelle: Vendo, diktiert',
      '---',
      '',
      `# ${sauberTitel}`,
      '',
      String(text || '').trim().slice(0, 20000),
      '',
      '## Original-Diktat',
      '',
      ...String(original || '').trim().slice(0, 20000).split('\n').map((z) => `> ${z}`),
      ''
    ].join('\n')
    return ctx.vault.anlegen('Ideen', sauberTitel, inhalt)
  })
}
