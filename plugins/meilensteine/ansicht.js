// Meilensteine-Plugin: Bestellungen insgesamt, nächster Meilenstein mit Fortschritt, Liste aller Meilensteine.
// Die Zahl zählt der Wächter bei Shopify (bei neuen Bestellungen); gefeiert wird dort, hier wird angezeigt.

const zahl = (n) => Number(n).toLocaleString('de-DE')

export async function starten(ctx) {
  const m = ctx.maskieren
  let stand = { anzahl: null, gefeiert: {} }
  let liste = []

  async function laden() {
    try {
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
    return `Bestellungen bei Donnerwolf insgesamt: ${zahl(stand.anzahl)}. Nächster Meilenstein: ${zahl(n)}. Bestellung (noch ${zahl(n - stand.anzahl)}).`
  })

  ctx.element.innerHTML = `
    <div class="ms-raster">
      <section class="ms-kopf hud" data-kopf></section>
      <section class="ms-liste hud"><h3>Alle Meilensteine</h3><div data-liste></div></section>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function zeichnen() {
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
          <span class="ms-name">${zahl(x)}. Bestellung</span>
          <span class="leise">${g ? `${m(g.datum)}${g.bestellung ? ` · ${m(g.bestellung)}` : ''}` : erreicht ? 'erreicht' : x === n ? `noch ${zahl(x - stand.anzahl)}` : ''}</span>
        </div>`
      })
      .join('')
  }

  await laden()
  return { laden, takt: 30000 }
}
