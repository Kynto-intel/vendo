// Meilensteine-Plugin: Bestellungen insgesamt, nächster Meilenstein mit Fortschritt, Liste aller Meilensteine.
// Die Zahl zählt der Wächter bei Shopify (bei neuen Bestellungen); gefeiert wird dort, hier wird angezeigt.
// Erweiterbar: eigene Meilensteine (Zahl + Text, z. B. 1.500 „Neues Lager“) und die Schrittweite ab 1.000.
// Gespeichert in plugins/meilensteine/daten.json: { schritt: 250|500|1000, eigene: [{ id, anzahl, text }] }

const zahl = (n) => Number(n).toLocaleString('de-DE')

export async function starten(ctx) {
  const m = ctx.maskieren
  let stand = { anzahl: null, gefeiert: {} }
  let liste = []
  let e = { schritt: 500, eigene: [] }
  const eigenesZiel = (n) => e.eigene.find((x) => x.anzahl === n)

  async function laden() {
    try {
      const d = await ctx.daten.laden()
      e = { schritt: [250, 500, 1000].includes(Number(d.schritt)) ? Number(d.schritt) : 500, eigene: Array.isArray(d.eigene) ? d.eigene : [] }
      stand = await ctx.aufrufen('stand')
      liste = await ctx.aufrufen('liste', (stand.anzahl || 0) + 1000)
    } catch (e) {
      console.warn('Meilensteine:', e.message)
    }
    zeichnen()
  }

  const naechster = () => liste.find((n) => n > (stand.anzahl ?? 0)) ?? null
  const vorheriger = () => [...liste].reverse().find((n) => n <= (stand.anzahl ?? 0)) ?? 0

  // Luzzy: „Wie viele Bestellungen insgesamt?“, „Wann kommt der nächste Meilenstein?“
  ctx.kontext(() => {
    if (stand.anzahl == null) return 'Bestellungen insgesamt: noch nicht gezählt (Jarves-OS zählt beim nächsten Shopify-Abgleich).'
    const n = naechster()
    const ziele = e.eigene.filter((x) => x.anzahl > stand.anzahl).sort((a, b) => a.anzahl - b.anzahl)
    return `Bestellungen bei Donnerwolf insgesamt: ${zahl(stand.anzahl)}. Nächster Meilenstein: ${zahl(n)}. Bestellung (noch ${zahl(n - stand.anzahl)}).${ziele.length ? ` Felix' eigene Ziele: ${ziele.map((x) => `${zahl(x.anzahl)}. Bestellung${x.text ? ` (${x.text})` : ''}`).join(', ')}.` : ''}`
  })

  ctx.element.innerHTML = `
    <div class="ms-raster">
      <div class="ms-links">
        <section class="ms-kopf hud" data-kopf></section>
        <section class="ms-eigene hud">
          <h3>Eigene Meilensteine</h3>
          <form class="ms-neu" data-neu>
            <input name="anzahl" type="number" min="1" max="10000000" required placeholder="Zahl, z. B. 1500" />
            <input name="text" maxlength="80" placeholder="Wofür? z. B. Neues Lager" autocomplete="off" />
            <button class="knopf-gold" type="submit">Hinzufügen</button>
          </form>
          <div class="ms-eigene-liste" data-eigene></div>
          <label class="ms-schritt">Ab 1.000 feiern alle
            <select data-schritt><option value="250">250</option><option value="500">500</option><option value="1000">1.000</option></select>
            Bestellungen
          </label>
          <p class="leise">Luzzy feiert eigene Meilensteine genauso mit Horn und Ansage, mit deinem Text.</p>
        </section>
      </div>
      <section class="ms-liste hud"><h3>Alle Meilensteine</h3><div data-liste></div></section>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function eigeneZeichnen() {
    $('[data-schritt]').value = String(e.schritt)
    const sortiert = [...e.eigene].sort((a, b) => a.anzahl - b.anzahl)
    $('[data-eigene]').innerHTML = sortiert.length
      ? sortiert
          .map((x) => `<div class="ms-eigen${stand.anzahl != null && x.anzahl <= stand.anzahl ? ' erreicht' : ''}" data-id="${m(x.id)}">
            <span class="ms-stern">${stand.anzahl != null && x.anzahl <= stand.anzahl ? '★' : '☆'}</span>
            <span><b>${zahl(x.anzahl)}.</b> ${m(x.text || 'Bestellung')}</span>
            <button class="knopf-mini" data-weg type="button" title="Entfernen">✕</button>
          </div>`)
          .join('')
      : '<div class="leise">Noch keine. Trag oben eine Zahl ein.</div>'
  }

  function zeichnen() {
    eigeneZeichnen()
    if (stand.anzahl == null) {
      $('[data-kopf]').innerHTML = `<div class="leer-hinweis">Noch nicht gezählt. Jarves-OS holt die Zahl beim nächsten Abgleich mit Shopify (jede Minute, sobald Hermes verbunden und der Shopify-Zugang gültig ist).</div>`
      $('[data-liste]').innerHTML = ''
      return
    }
    const n = naechster()
    const v = vorheriger()
    const anteil = n ? Math.round(((stand.anzahl - v) / (n - v)) * 100) : 100
    const wann = stand.zeit ? new Date(stand.zeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : ''
    $('[data-kopf]').innerHTML = `
      <div class="ms-zahl">${zahl(stand.anzahl)}</div>
      <div class="ms-unter">Bestellungen bei Donnerwolf insgesamt${wann ? ` <span class="leise">· Stand ${m(wann)} Uhr</span>` : ''}</div>
      ${n ? `<div class="ms-naechster">Nächster Meilenstein: <b>${zahl(n)}. Bestellung</b> · noch ${zahl(n - stand.anzahl)}</div>
      <div class="ms-balken"><div style="width:${anteil}%"></div></div>
      <div class="ms-balken-text leise"><span>${zahl(v)}</span><span>${anteil} %</span><span>${zahl(n)}</span></div>` : ''}`
    const sichtbar = liste.filter((x) => x <= (n || 0))
    $('[data-liste]').innerHTML = sichtbar
      .reverse()
      .map((x) => {
        const erreicht = x <= stand.anzahl
        const g = stand.gefeiert[x]
        return `<div class="ms-eintrag${erreicht ? ' erreicht' : ''}${x === n ? ' naechster' : ''}">
          <span class="ms-stern">${erreicht ? '★' : '☆'}</span>
          <span class="ms-name">${zahl(x)}. Bestellung${eigenesZiel(x) ? ` <span class="ms-ziel">${m(eigenesZiel(x).text || 'eigenes Ziel')}</span>` : ''}</span>
          <span class="leise">${g ? `${m(g.datum)}${g.bestellung ? ` · ${m(g.bestellung)}` : ''}` : erreicht ? 'erreicht' : x === n ? `noch ${zahl(x - stand.anzahl)}` : ''}</span>
        </div>`
      })
      .join('')
  }

  async function speichern() {
    await ctx.daten.speichern({ schritt: e.schritt, eigene: e.eigene })
    await laden()
  }
  $('[data-neu]').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const f = ev.currentTarget.elements
    const anzahl = Math.round(Number(f.anzahl.value))
    if (!(anzahl > 0)) return
    e.eigene = e.eigene.filter((x) => x.anzahl !== anzahl) // gleiche Zahl ersetzt den alten Eintrag
    e.eigene.push({ id: `m${Date.now().toString(36)}`, anzahl, text: f.text.value.trim() })
    ev.currentTarget.reset()
    await speichern()
  })
  $('[data-eigene]').addEventListener('click', async (ev) => {
    const id = ev.target.closest('[data-weg]') && ev.target.closest('[data-id]')?.dataset.id
    if (!id) return
    e.eigene = e.eigene.filter((x) => x.id !== id)
    await speichern()
  })
  $('[data-schritt]').addEventListener('change', async (ev) => {
    e.schritt = Number(ev.target.value)
    await speichern()
  })

  await laden()
  return { laden, takt: 30000 }
}
