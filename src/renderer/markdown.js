// Kleiner, sicherer Markdown-Umwandler für Luzzys Antworten.
// Erst wird alles HTML-maskiert, dann werden nur bekannte Formatierungen erzeugt.

const maskieren = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(text) {
  const codes = []
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  s = maskieren(s)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  // Obsidian-Links [[Notiz]] und [[Notiz|Anzeige]]
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, ziel, anzeige) => `<a class="wiki" data-wiki="${ziel.trim()}">${(anzeige || ziel).trim()}</a>`)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${maskieren(codes[Number(i)])}</code>`)
}

const tabellenZeile = (z) => z.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim())

export function markdownZuHtml(text) {
  // YAML-Kopf (Obsidian-Eigenschaften) weglassen
  const ohneKopf = String(text || '').replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---\n/, '')
  const zeilen = ohneKopf.split('\n')
  const aus = []
  let liste = null
  let absatz = []
  let code = null
  let tabelle = null // { kopf, zeilen }

  const tabelleEnde = () => {
    if (!tabelle) return
    aus.push(
      `<div class="tabelle-rahmen"><table class="md-tabelle"><thead><tr>${tabelle.kopf.map((k) => `<th>${inline(k)}</th>`).join('')}</tr></thead><tbody>${tabelle.zeilen
        .map((z) => `<tr>${z.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`
    )
    tabelle = null
  }

  const absatzEnde = () => {
    if (absatz.length) aus.push(`<p>${absatz.map(inline).join('<br>')}</p>`)
    absatz = []
  }
  const listeEnde = () => {
    if (liste) aus.push(`</${liste}>`)
    liste = null
  }

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]
    // Tabellen: Kopfzeile + Trennzeile |---|---|
    if (code === null && /^\s*\|.*\|\s*$/.test(zeile)) {
      if (tabelle) {
        tabelle.zeilen.push(tabellenZeile(zeile))
        continue
      }
      if (/^\s*\|?\s*:?-{2,}/.test(zeilen[i + 1] || '')) {
        absatzEnde()
        listeEnde()
        tabelle = { kopf: tabellenZeile(zeile), zeilen: [] }
        i++
        continue
      }
    } else tabelleEnde()
    if (code === null && /^\s*(-{3,}|\*{3,})\s*$/.test(zeile)) {
      absatzEnde()
      listeEnde()
      aus.push('<hr>')
      continue
    }
    if (code === null && /^\s*>\s?/.test(zeile)) {
      absatzEnde()
      listeEnde()
      aus.push(`<blockquote>${inline(zeile.replace(/^\s*>\s?/, ''))}</blockquote>`)
      continue
    }
    if (code !== null) {
      if (/^```/.test(zeile)) {
        aus.push(`<pre><code>${maskieren(code.join('\n'))}</code></pre>`)
        code = null
      } else code.push(zeile)
      continue
    }
    if (/^```/.test(zeile)) {
      absatzEnde()
      listeEnde()
      code = []
      continue
    }
    const ueberschrift = zeile.match(/^(#{1,3})\s+(.*)/)
    const punkt = zeile.match(/^\s*[-*•]\s+(.*)/)
    const nummer = zeile.match(/^\s*\d+[.)]\s+(.*)/)
    if (ueberschrift) {
      absatzEnde()
      listeEnde()
      aus.push(`<h3>${inline(ueberschrift[2])}</h3>`)
    } else if (punkt || nummer) {
      absatzEnde()
      const art = punkt ? 'ul' : 'ol'
      if (liste !== art) {
        listeEnde()
        aus.push(`<${art}>`)
        liste = art
      }
      const inhalt = (punkt || nummer)[1]
      const haken = inhalt.match(/^\[([ xX])\]\s+(.*)/)
      aus.push(haken ? `<li class="aufgabe-punkt">${haken[1] === ' ' ? '☐' : '☑'} ${inline(haken[2])}</li>` : `<li>${inline(inhalt)}</li>`)
    } else if (!zeile.trim()) {
      absatzEnde()
      listeEnde()
    } else {
      listeEnde()
      absatz.push(zeile)
    }
  }
  if (code !== null) aus.push(`<pre><code>${maskieren(code.join('\n'))}</code></pre>`)
  tabelleEnde()
  absatzEnde()
  listeEnde()
  return aus.join('')
}
