// Gedankenspeicher: „Merk dir: Stoffproben bestellen“ (Sprache oder Tippen) oder hier eintippen.
// Daten in daten/plugins/gedanken.json: { notizen: [{ id, text, zeit, erledigt }] }
// Jede neue Notiz landet zusätzlich im Vault (Jarves-OS\Gedankenspeicher.md). Luzzy kennt die offenen Notizen.
// „Neue Idee: …“ (Sprach-Diktat): Luzzy macht daraus eine saubere Notiz mit Titel und Schlagworten,
// die als eigene Datei in Jarves-OS\Ideen\ landet; im Gedankenspeicher steht dann „Idee: <Titel>“.

const neueId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const zeitText = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

// „Merk dir: …“, „Notier: …“, „Schreib dir auf, dass …“, „Halt fest: …“
const MERKEN = /^(?:merk(?:e)? dir|notier(?:e)?(?: dir)?|schreib(?:e)? (?:dir )?auf|halt(?:e)? fest|gedanke:|notiz:)(?:\s+(?:mal|noch|kurz|schnell|bitte))*[:,]?\s+(?:dass\s+)?(.+)$/i
// „Neue Idee: …“, „Idee: …“, „Ich hab eine Idee: …“
const IDEE = /^(?:neue idee|idee|ich hab(?:e)? (?:eine|ne|'ne) idee)[:,.!]?\s+([\s\S]+)$/i

// Auftrag an Luzzy: aus dem Diktat eine Notiz machen (festes Format, damit Jarves-OS sie ablegen kann)
const IDEE_AUFTRAG = (roh) => `Felix hat eine Idee diktiert (Rohtext der Spracherkennung, kann Fehler haben). Mach daraus eine saubere Notiz für seinen Obsidian-Vault. Antworte genau in diesem Format, sonst nichts:
TITEL: kurzer, treffender Titel (höchstens 8 Wörter)
SCHLAGWORTE: 2 bis 5 Schlagworte, kleingeschrieben, mit Komma getrennt
---
Die Idee als kurze, klare Notiz in Markdown (ein, zwei Absätze oder Stichpunkte). Nichts erfinden, nichts weglassen.
Keine Werkzeuge benutzen und nichts selbst speichern, das Ablegen übernimmt Jarves-OS.

"""
${roh}
"""`

// Luzzys Antwort zerlegen: { titel, schlagworte, text }; fehlt etwas, bleibt es leer
export function ideeZerlegen(antwort) {
  const roh = String(antwort || '').replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim()
  const titel = (roh.match(/^\s*\**titel\**:\s*(.+)$/im) || [])[1]?.replace(/[*#"„“]/g, '').trim() || ''
  const schlagworte = ((roh.match(/^\s*\**schlagw(?:o|ö)rte?\**:\s*(.+)$/im) || [])[1] || '')
    .split(/[,;]/)
    .map((t) => t.replace(/[*#]/g, '').trim())
    .filter(Boolean)
  const trenner = roh.search(/^\s*---\s*$/m)
  const text = (trenner >= 0 ? roh.slice(trenner).replace(/^\s*---\s*/, '') : roh.replace(/^\s*\**(?:titel|schlagw(?:o|ö)rte?)\**:.*$/gim, '')).trim()
  return { titel, schlagworte, text }
}
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

  // Neue Notiz: im Speicher des Plugins und im Vault. Gibt Luzzys Bestätigung zurück.
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

  // „Neue Idee: …“ → Luzzy schreibt sie sauber, Jarves-OS legt sie als Notiz im Vault ab
  async function ideeDiktiert(roh, { gesprochen = false } = {}) {
    roh = roh.trim()
    const zeit = Date.now()
    const ok = await ctx.luzzy(IDEE_AUFTRAG(roh), {
      anzeige: `💡 Neue Idee: ${roh}`,
      gesprochen,
      nachher: async (antwort) => {
        const idee = ideeZerlegen(antwort)
        const titel = idee.titel || roh.split(/\s+/).slice(0, 6).join(' ')
        let pfad
        try {
          pfad = await ctx.aufrufen('ideeAnlegen', { titel, schlagworte: idee.schlagworte, text: idee.text || roh, original: roh, zeit })
        } catch (e) {
          console.warn('Idee Vault:', e.message)
          await merken(`Idee: ${roh}`)
          return 'Den Vault hab ich gerade nicht gefunden. Die Idee steht erstmal im Gedankenspeicher.'
        }
        daten.notizen.push({ id: neueId(), text: `Idee: ${titel}`, zeit, erledigt: false, datei: pfad })
        await speichern()
        return `Deine Idee „${titel}“ liegt im Vault, im Ordner Jarves-OS, Ideen.`
      }
    })
    if (ok !== false) return true
    // Luzzy antwortet gerade noch oder Hermes ist weg: nichts verlieren
    await merken(`Idee: ${roh}`)
    return 'Luzzy ist gerade beschäftigt, ich hab die Idee erstmal im Gedankenspeicher notiert.'
  }

  // Sprache/Text: „Merk dir …“, „Neue Idee: …“ und „Was wollte ich mir merken?“ beantwortet das Plugin selbst
  ctx.befehl(async (text, { gesprochen } = {}) => {
    const satz = ohneLuzzy(text)
    const idee = IDEE.exec(satz)
    if (idee) return ideeDiktiert(idee[1], { gesprochen })
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
