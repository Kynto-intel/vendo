import MarkdownIt from '../../node_modules/markdown-it/dist/browser/markdown-it.esm.min.mjs'

function wikiLinks(md) {
  md.inline.ruler.before('link', 'wiki_link', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 91 || state.src.charCodeAt(start + 1) !== 91) return false
    const ende = state.src.indexOf(']]', start + 2)
    if (ende < 0) return false
    const inhalt = state.src.slice(start + 2, ende)
    const trenner = inhalt.indexOf('|')
    const ziel = (trenner < 0 ? inhalt : inhalt.slice(0, trenner)).trim()
    const anzeige = (trenner < 0 ? ziel : inhalt.slice(trenner + 1)).trim()
    if (!ziel || !anzeige) return false
    if (silent) return true
    const token = state.push('wiki_link', 'a', 0)
    token.meta = { ziel }
    token.children = []
    state.md.inline.parse(anzeige, state.md, state.env, token.children)
    state.pos = ende + 2
    return true
  })
  md.renderer.rules.wiki_link = (tokens, index, optionen, umgebung, renderer) => {
    const token = tokens[index]
    return `<a class="wiki" data-wiki="${md.utils.escapeHtml(token.meta.ziel)}">${renderer.renderInline(token.children, optionen, umgebung)}</a>`
  }
}

function aufgabenListen(md) {
  md.core.ruler.push('vendo_task_lists', (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const inline = state.tokens[index]
      if (inline.type !== 'inline') continue
      const match = inline.content.match(/^\[([ xX])\]\s+/)
      if (!match) continue
      const listenpunkt = state.tokens.slice(0, index).reverse().find((token) => token.type === 'list_item_open')
      const text = inline.children?.find((token) => token.type === 'text' && token.content.startsWith(match[0]))
      if (!listenpunkt || !text) continue
      listenpunkt.attrJoin('class', 'aufgabe-punkt')
      text.content = `${match[1] === ' ' ? '☐' : '☑'} ${text.content.slice(match[0].length)}`
    }
  })
}

const markdown = MarkdownIt({ html: false, linkify: true, breaks: true })
markdown.use(wikiLinks).use(aufgabenListen)
markdown.validateLink = (url) => /^https?:\/\//i.test(url)
markdown.renderer.rules.link_open = (tokens, index, optionen, umgebung, renderer) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener')
  return renderer.renderToken(tokens, index, optionen)
}
markdown.renderer.rules.heading_open = () => '<h3>'
markdown.renderer.rules.heading_close = () => '</h3>'
markdown.renderer.rules.table_open = (tokens, index, optionen, umgebung, renderer) => {
  tokens[index].attrJoin('class', 'md-tabelle')
  return `<div class="tabelle-rahmen">${renderer.renderToken(tokens, index, optionen)}`
}
markdown.renderer.rules.table_close = (tokens, index, optionen, umgebung, renderer) => `${renderer.renderToken(tokens, index, optionen)}</div>`

export function markdownZuHtml(text) {
  const ohneKopf = String(text || '').replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
  return markdown.render(ohneKopf)
}
