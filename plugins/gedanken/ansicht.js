// Gedankenspeicher: „Merk dir: Stoffproben bestellen“ (Sprache oder Tippen) oder hier eintippen.
// Daten in plugins/gedanken/daten.json: { notizen: [{ id, text, zeit, erledigt }] }
// Jede neue Notiz landet zusätzlich im Vault (Jarves-OS\Gedankenspeicher.md). Luzzy kennt die offenen Notizen.

const neueId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const zeitText = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

// „Merk dir: …“, „Notier: …“, „Schreib dir auf, dass …“, „Neue Idee: …“, „Halt fest: …“
const MERKEN = /^(?:merk(?:e)? dir|notier(?:e)?(?: dir)?|schreib(?:e)? (?:dir )?auf|halt(?:e)? fest|neue idee|idee:|gedanke:|notiz:)(?:\s+(?:mal|noch|kurz|schnell|bitte))*[:,]?\s+(?:dass\s+)?(.+)$/i
// „Was wollte ich mir merken?“, „Was hab ich mir gemerkt?“, „Lies meine Notizen vor“
const ABFRAGE = /^(?:was (?:wollte ich mir merken|hab(?:e)? ich mir (?:gemerkt|notiert|aufgeschrieben))|(?:zeig|lies|sag|nenn)(?: mir)? (?:meine )?(?:gedanken|notizen|ideen)(?: vor)?|meine (?:gedanken|notizen))$/

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { notizen: [] }
  let erledigteZeigen = false

  async function laden() {
    const d = await ctx.daten.laden()
    daten = { notizen: Array.isArray(d.notizen) ? d.notizen : [] }
    zeichnen()
  }
  async function speichern() {
    await ctx.daten.speichern(daten)
    zeichnen()
  }
  const offen = () => daten.notizen.filter((n) => !n.erledigt)

  // Neue Notiz: in daten.json und im Vault. Gibt Luzzys Bestätigung zurück.
  async function merken(text) {
    text = String(text).trim().replace(/[.!]+$/, '')
    if (!text) return null
    const notiz = { id: neueId(), text: text.charAt(0).toUpperCase() + text.slice(1), zeit: Date.now(), erledigt: false }
    daten.notizen.push(notiz)
    await speichern()
    try {
      await ctx.aufrufen('imVault', `${zeitText(notiz.zeit)} · ${notiz.text}`)
      return `Notiert: ${notiz.text}.`
    } catch (e) {
      console.warn('Gedankenspeicher Vault:', e.message)
      return `Notiert: ${notiz.text}. Nur hier in Jarves, den Vault hab ich gerade nicht gefunden.`
    }
  }

  // Sprache/Text: „Merk dir …“ und „Was wollte ich mir merken?“ beantwortet das Plugin selbst
  ctx.befehl(async (text) => {
    const satz = ohneLuzzy(text)
    const treffer = MERKEN.exec(satz)
    if (treffer) return merken(treffer[1])
    const frage = satz.toLowerCase().replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim()
    if (!ABFRAGE.test(frage)) return null
    await laden()
    const liste = offen()
    if (!liste.length) return 'Du hast dir gerade nichts gemerkt.'
    const texte = liste.slice(-5).map((n) => n.text)
    const aufzaehlung = texte.length > 1 ? `${texte.slice(0, -1).join(', ')} und ${texte.at(-1)}` : texte[0]
    return `${liste.length === 1 ? 'Eine Sache' : `${liste.length} Sachen`}: ${aufzaehlung}.${liste.length > 5 ? ` Das waren die neuesten fünf.` : ''}`
  })

  // Luzzy bekommt die offenen Notizen, wenn Felix danach fragt (Stichwörter in plugin.json)
  ctx.kontext(() => {
    const liste = offen()
    if (!liste.length) return 'Gedankenspeicher: keine offenen Notizen.'
    return `Felix' Gedankenspeicher (offene Notizen, älteste zuerst):\n${liste.map((n) => `- ${zeitText(n.zeit)}: ${n.text}`).join('\n')}`
  })

  // ── Bereich ──
  ctx.kopfKnoepfe.innerHTML = `<label class="gd-schalter"><input type="checkbox" data-erledigte /> Erledigte zeigen</label>`
  ctx.element.innerHTML = `
    <form class="gd-neu hud" data-neu>
      <input name="text" maxlength="2000" placeholder="Was willst du festhalten? (oder sag „Luzzy, merk dir …“)" autocomplete="off" />
      <button class="knopf-gold" type="submit">Merken</button>
    </form>
    <div class="gd-liste" data-liste></div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function zeichnen() {
    const liste = [...daten.notizen].filter((n) => erledigteZeigen || !n.erledigt).reverse()
    $('[data-liste]').innerHTML = liste.length
      ? liste
          .map((n) => `<div class="gd-notiz${n.erledigt ? ' erledigt' : ''}" data-id="${n.id}">
            <button class="gd-haken" data-a="erledigt" type="button" title="${n.erledigt ? 'Wieder offen' : 'Erledigt'}">${n.erledigt ? '✓' : ''}</button>
            <div class="gd-text">${m(n.text)}<small>${zeitText(n.zeit)}</small></div>
            <button class="knopf-mini" data-a="loeschen" type="button" title="Löschen (im Vault bleibt sie stehen)">✕</button>
          </div>`)
          .join('')
      : `<div class="leer-hinweis">Noch nichts festgehalten. Sag einfach „Luzzy, merk dir: Stoffproben bestellen“.</div>`
  }

  $('[data-neu]').addEventListener('submit', async (e) => {
    e.preventDefault()
    const feld = e.currentTarget.elements.text
    const antwort = await merken(feld.value)
    if (antwort) feld.value = ''
  })
  $('[data-liste]').addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-a]')
    const id = knopf?.closest('[data-id]')?.dataset.id
    if (!id) return
    if (knopf.dataset.a === 'erledigt') {
      const n = daten.notizen.find((x) => x.id === id)
      if (n) n.erledigt = !n.erledigt
    } else {
      daten.notizen = daten.notizen.filter((x) => x.id !== id)
    }
    await speichern()
  })
  ctx.kopfKnoepfe.querySelector('[data-erledigte]').addEventListener('change', (e) => {
    erledigteZeigen = e.target.checked
    zeichnen()
  })

  await laden()
  return { laden, takt: 30000 }
}
