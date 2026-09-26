// Wetter-Plugin: Tab mit aktuellem Wetter und 7-Tage-Vorhersage, Karte rechts, Wetterdaten für Luzzy.
// Ort in plugins/wetter/daten.json: { ort: { name, region, land, breite, laenge, zeitzone } }

// WMO-Wettercodes → Text und Symbol
const CODES = {
  0: ['Klar', '☀'], 1: ['Überwiegend klar', '🌤'], 2: ['Teils bewölkt', '⛅'], 3: ['Bedeckt', '☁'],
  45: ['Nebel', '🌫'], 48: ['Reifnebel', '🌫'],
  51: ['Leichter Nieselregen', '🌦'], 53: ['Nieselregen', '🌦'], 55: ['Starker Nieselregen', '🌧'],
  56: ['Gefrierender Niesel', '🌧'], 57: ['Gefrierender Niesel', '🌧'],
  61: ['Leichter Regen', '🌦'], 63: ['Regen', '🌧'], 65: ['Starker Regen', '🌧'],
  66: ['Gefrierender Regen', '🌧'], 67: ['Gefrierender Regen', '🌧'],
  71: ['Leichter Schneefall', '🌨'], 73: ['Schneefall', '🌨'], 75: ['Starker Schneefall', '❄'], 77: ['Schneegriesel', '🌨'],
  80: ['Leichte Schauer', '🌦'], 81: ['Schauer', '🌧'], 82: ['Heftige Schauer', '⛈'],
  85: ['Schneeschauer', '🌨'], 86: ['Starke Schneeschauer', '❄'],
  95: ['Gewitter', '⛈'], 96: ['Gewitter mit Hagel', '⛈'], 99: ['Schweres Gewitter mit Hagel', '⛈']
}
const code = (c) => CODES[c] || ['Unbekannt', '•']
// Tageswerte nennen das "schlimmste" Wetter des Tages; Nebel ist dabei meist nur Morgennebel
const tagCode = (c) => (c === 45 || c === 48 ? ['Zeitweise Nebel', '🌫'] : code(c))
const grad = (t) => `${Math.round(t)}°`
const uhr = (iso) => String(iso || '').slice(11, 16)
const tagName = (iso, i) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'long' }))

// Voreinstellung: Schongau in Bayern
const STANDARD_ORT = { name: 'Schongau', region: 'Bayern', land: 'Deutschland', breite: 47.8124, laenge: 10.89664, zeitzone: 'Europe/Berlin' }

export async function starten(ctx) {
  const m = ctx.maskieren
  let ort = STANDARD_ORT
  let wetter = null
  let fehler = ''

  const gespeichert = await ctx.daten.laden()
  if (gespeichert?.ort?.breite != null) ort = gespeichert.ort

  // ── Aufbau ──
  ctx.element.innerHTML = `
    <div class="wt-raster">
      <section class="wt-jetzt hud" data-jetzt></section>
      <section class="wt-ort hud">
        <h3>Ort</h3>
        <div class="wt-ort-name" data-ort></div>
        <form class="wt-suche" data-suche>
          <input name="suche" placeholder="Ort suchen, z. B. Schongau" autocomplete="off" />
          <button class="knopf-flach" type="submit">Suchen</button>
        </form>
        <div class="wt-treffer" data-treffer></div>
        <div class="leise klein">Wetterdaten: Open-Meteo, kostenlos, ohne Konto. Übertragen wird nur der Ort.</div>
      </section>
      <section class="wt-tage hud" data-tage></section>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)
  const karte = ctx.karte('Wetter')

  function zeichnen() {
    $('[data-ort]').innerHTML = `<b>${m(ort.name)}</b> <span class="leise">${m([ort.region, ort.land].filter(Boolean).join(', '))}</span>`
    if (!wetter) {
      const text = fehler ? `Wetter gerade nicht abrufbar: ${m(fehler)}` : 'Lade Wetter …'
      $('[data-jetzt]').innerHTML = `<div class="leise">${text}</div>`
      karte.innerHTML = `<div class="leise">${text}</div>`
      return
    }
    const j = wetter.current
    const t = wetter.daily
    const [text, symbol] = code(j.weather_code)
    $('[data-jetzt]').innerHTML = `
      <div class="wt-gross"><span class="wt-symbol">${symbol}</span><span class="wt-temp">${grad(j.temperature_2m)}</span></div>
      <div class="wt-text">${m(text)} · gefühlt ${grad(j.apparent_temperature)}</div>
      <dl class="werte">
        <dt>Heute</dt><dd>${grad(t.temperature_2m_min[0])} bis ${grad(t.temperature_2m_max[0])}</dd>
        <dt>Regen</dt><dd>${t.precipitation_probability_max[0] ?? 0} % · ${t.precipitation_sum[0] ?? 0} mm</dd>
        <dt>Wind</dt><dd>${Math.round(j.wind_speed_10m)} km/h</dd>
        <dt>Feuchte</dt><dd>${j.relative_humidity_2m} %</dd>
        <dt>Sonne</dt><dd>☀ ${uhr(t.sunrise[0])} · ☾ ${uhr(t.sunset[0])}</dd>
      </dl>
      <div class="leise klein">Stand ${uhr(j.time)} Uhr</div>`
    $('[data-tage]').innerHTML = `<h3>7 Tage</h3>${t.time
      .map((tag, i) => {
        const [tx, sy] = tagCode(t.weather_code[i])
        return `<div class="wt-tag"><span class="wt-tag-name">${m(tagName(tag, i))}</span><span class="wt-tag-symbol" title="${m(tx)}">${sy}</span><span class="wt-tag-text">${m(tx)}</span><span class="wt-tag-temp">${grad(t.temperature_2m_min[i])} / <b>${grad(t.temperature_2m_max[i])}</b></span><span class="wt-tag-regen">${t.precipitation_probability_max[i] ?? 0} %</span></div>`
      })
      .join('')}`
    const [mtx, msy] = tagCode(t.weather_code[1])
    karte.innerHTML = `
      <div class="wt-karte-jetzt"><span class="wt-karte-symbol">${symbol}</span><span class="wt-karte-temp">${grad(j.temperature_2m)}</span><span class="wt-karte-text">${m(text)}<br><span class="leise">${m(ort.name)}</span></span></div>
      <div class="wt-karte-zeile"><span>Heute</span><span>${grad(t.temperature_2m_min[0])} / ${grad(t.temperature_2m_max[0])} · ${t.precipitation_probability_max[0] ?? 0} % Regen</span></div>
      <div class="wt-karte-zeile"><span>Morgen</span><span>${msy} ${grad(t.temperature_2m_min[1])} / ${grad(t.temperature_2m_max[1])} · ${m(mtx)}</span></div>`
  }

  async function laden() {
    try {
      wetter = await ctx.aufrufen('vorhersage', ort.breite, ort.laenge, ort.zeitzone)
      fehler = ''
    } catch (e) {
      fehler = e.message
    }
    zeichnen()
  }

  // ── Ort suchen und wählen ──
  let treffer = []
  $('[data-suche]').addEventListener('submit', async (e) => {
    e.preventDefault()
    const text = e.target.suche.value.trim()
    if (!text) return
    $('[data-treffer]').innerHTML = '<div class="leise">Suche …</div>'
    try {
      treffer = await ctx.aufrufen('suchen', text)
    } catch (err) {
      $('[data-treffer]').innerHTML = `<div class="fehler">${m(err.message)}</div>`
      return
    }
    $('[data-treffer]').innerHTML = treffer.length
      ? treffer.map((o, i) => `<button class="wt-treffer-knopf" data-i="${i}" type="button"><b>${m(o.name)}</b> <span class="leise">${m([o.region, o.land].filter(Boolean).join(', '))}</span></button>`).join('')
      : '<div class="leise">Nichts gefunden.</div>'
  })
  $('[data-treffer]').addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-i]')
    if (!knopf) return
    ort = treffer[Number(knopf.dataset.i)]
    await ctx.daten.speichern({ ort })
    $('[data-treffer]').innerHTML = ''
    $('[data-suche]').reset()
    wetter = null
    zeichnen()
    await laden()
  })
  karte.addEventListener('click', () => ctx.oeffnen())

  // ── Für Luzzy: Wetterdaten als Text (Routinen hängen sie an, wenn der Prompt "Wetter" erwähnt) ──
  ctx.kontext(async () => {
    if (!wetter) await laden()
    if (!wetter) return ''
    const j = wetter.current
    const t = wetter.daily
    const tage = t.time.slice(0, 3).map((tag, i) => `- ${tagName(tag, i)}: ${tagCode(t.weather_code[i])[0]}, ${grad(t.temperature_2m_min[i])} bis ${grad(t.temperature_2m_max[i])}, Regenrisiko ${t.precipitation_probability_max[i] ?? 0} %`)
    return `Wetter in ${ort.name} (${ort.region || ort.land}), aktuelle Daten aus Jarves-OS, keine Websuche nötig:\n- Jetzt: ${code(j.weather_code)[0]}, ${grad(j.temperature_2m)} (gefühlt ${grad(j.apparent_temperature)}), Wind ${Math.round(j.wind_speed_10m)} km/h\n${tage.join('\n')}\n- Sonnenaufgang ${uhr(t.sunrise[0])}, Sonnenuntergang ${uhr(t.sunset[0])}`
  })

  // Satz für Luzzys Begrüßung beim Start
  ctx.begruessung(async () => {
    if (!wetter) await laden()
    if (!wetter) return ''
    const j = wetter.current
    const t = wetter.daily
    let satz = `Draußen in ${ort.name} hat es ${Math.round(j.temperature_2m)} Grad, ${code(j.weather_code)[0].toLowerCase()}, heute bis ${Math.round(t.temperature_2m_max[0])} Grad.`
    if ((t.precipitation_probability_max[0] ?? 0) >= 50) satz += ' Heute wird es wahrscheinlich regnen.'
    return satz
  })

  zeichnen()
  await laden()
  setInterval(laden, 20 * 60 * 1000)
  return { laden, takt: 10 * 60 * 1000 }
}
