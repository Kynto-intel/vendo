// Wetter-Plugin: Tab mit aktuellem Wetter, 24-Stunden-Verlauf (Temperatur, Niederschlag, Wind) und 8 Tagen,
// Karte rechts, Wetterdaten für Luzzy. Aufbau wie die Google-Wetterkarte, im Jarves-Look.
// Ort in daten/plugins/wetter.json: { ort: { name, region, land, breite, laenge, zeitzone } }

// WMO-Wettercodes → Text und Symbol-Art (Symbole: symbolSvg)
const CODES = {
  0: ['Klar', 'klar'], 1: ['Überwiegend klar', 'heiter'], 2: ['Teils bewölkt', 'wolkig'], 3: ['Bedeckt', 'bedeckt'],
  45: ['Nebel', 'nebel'], 48: ['Reifnebel', 'nebel'],
  51: ['Leichter Nieselregen', 'niesel'], 53: ['Nieselregen', 'niesel'], 55: ['Starker Nieselregen', 'regen'],
  56: ['Gefrierender Niesel', 'regen'], 57: ['Gefrierender Niesel', 'regen'],
  61: ['Leichter Regen', 'regen'], 63: ['Regen', 'regen'], 65: ['Starker Regen', 'regen'],
  66: ['Gefrierender Regen', 'regen'], 67: ['Gefrierender Regen', 'regen'],
  71: ['Leichter Schneefall', 'schnee'], 73: ['Schneefall', 'schnee'], 75: ['Starker Schneefall', 'schnee'], 77: ['Schneegriesel', 'schnee'],
  80: ['Leichte Schauer', 'schauer'], 81: ['Schauer', 'schauer'], 82: ['Heftige Schauer', 'regen'],
  85: ['Schneeschauer', 'schnee'], 86: ['Starke Schneeschauer', 'schnee'],
  95: ['Gewitter', 'gewitter'], 96: ['Gewitter mit Hagel', 'gewitter'], 99: ['Schweres Gewitter mit Hagel', 'gewitter']
}
const code = (c) => CODES[c] || ['Unbekannt', 'bedeckt']
// Open-Meteo nennt pro Tag das „schlimmste“ Wetter: eine einzige Nebelstunde macht den ganzen Tag zu „Nebel“,
// eine bedeckte Stunde den Tag zu „Bedeckt“. Deshalb zählt das Wetter tagsüber (8 bis 19 Uhr, stündlich):
// Regen, Schnee und Gewitter bestimmen den Tag ab 40 % Regenwahrscheinlichkeit (auch wenn sie nur kurz kommen;
// darunter, z. B. ein Gewitter mit 20 % am Abend, zählt das eigentliche Tageswetter, die Prozentzahl steht daneben),
// Nebel nur ab 5 Stunden (Morgennebel bis in den Vormittag ist im Herbst im Lechtal normal, danach ist oft den ganzen
// Tag Sonne), sonst das mittlere Wetter. Geprüft gegen DWD-Messwerte Altenstadt/Schongau (23. bis 29.09.2026).
const TAG_VON = 8
const TAG_BIS = 19
const NEBEL_STUNDEN = 5
const REGEN_AB = 40
const istNebel = (c) => c === 45 || c === 48
function tagWetter(wetter, i) {
  const tagesCode = wetter.daily.weather_code[i]
  const chance = wetter.daily.precipitation_probability_max?.[i]
  const tag = wetter.daily.time[i]
  const h = wetter.hourly
  if (tagesCode > 48 && (chance == null || chance >= REGEN_AB)) return code(tagesCode)
  if (!h?.time) return istNebel(tagesCode) ? ['Zeitweise Nebel', 'nebel'] : code(tagesCode)
  const stunden = h.time
    .map((zeit, k) => ({ zeit, c: h.weather_code[k] }))
    .filter(({ zeit, c }) => zeit.startsWith(tag) && c != null && Number(zeit.slice(11, 13)) >= TAG_VON && Number(zeit.slice(11, 13)) <= TAG_BIS)
  if (!stunden.length) return code(tagesCode)
  const nebel = stunden.filter(({ c }) => istNebel(c)).length
  if (nebel >= NEBEL_STUNDEN) return nebel >= stunden.length / 2 ? code(45) : ['Zeitweise Nebel', 'nebel']
  // Mittleres Wetter der Stunden (Median): bei je 3 Stunden klar, teils bewölkt, bedeckt → teils bewölkt.
  // Ohne Nebel und ohne unwahrscheinlichen Regen.
  const himmel = stunden.map(({ c }) => c).filter((c) => c <= 3).sort((a, b) => a - b)
  return code(himmel.length ? himmel[Math.floor(himmel.length / 2)] : tagesCode)
}
const grad = (t) => `${Math.round(t)}°`
const uhr = (iso) => String(iso || '').slice(11, 16)
const tagName = (iso, i) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'long' }))
const wochentag = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'long' })
const kurzTag = (iso) => `${new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}.`

// ── Wettersymbole als Grafik (Emojis sehen unter Windows je nach Schrift kaputt aus) ──
const F = { sonne: '#f3b53f', sonneHell: '#f8cd6b', mond: '#e6dcc4', wolke: '#d6dae0', wolkeDunkel: '#8b929b', regen: '#63a4de', blitz: '#f2c14e', schnee: '#eef2f6' }
const sonne = (cx, cy, r) => {
  const strahlen = Array.from({ length: 8 }, (_, k) => {
    const w = (k * Math.PI) / 4
    const [a, b] = [r + 3.5, r + 8]
    return `<line x1="${(cx + a * Math.cos(w)).toFixed(1)}" y1="${(cy + a * Math.sin(w)).toFixed(1)}" x2="${(cx + b * Math.cos(w)).toFixed(1)}" y2="${(cy + b * Math.sin(w)).toFixed(1)}"/>`
  }).join('')
  return `<g stroke="${F.sonne}" stroke-width="3" stroke-linecap="round">${strahlen}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${F.sonne}"/><circle cx="${cx - r * 0.25}" cy="${cy - r * 0.25}" r="${r * 0.55}" fill="${F.sonneHell}" opacity="0.55"/>`
}
const mond = (cx, cy, s) => `<path transform="translate(${cx - 16 * s} ${cy - 16 * s}) scale(${s})" d="M20 2a15 15 0 1 0 12 24A13 13 0 0 1 20 2z" fill="${F.mond}"/>`
// Wolke im Kasten 0..48 × 8..36, verschoben und skaliert
const wolke = (x, y, s, farbe = F.wolke) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${farbe}"><circle cx="15" cy="25" r="9"/><circle cx="25" cy="19" r="12"/><circle cx="36" cy="26" r="8"/><rect x="6" y="25" width="38" height="11" rx="5.5"/></g>`
const tropfen = (punkte) => `<g stroke="${F.regen}" stroke-width="3" stroke-linecap="round">${punkte.map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 2.5}" y2="${y + 7}"/>`).join('')}</g>`
function symbolSvg(art, tag = true, groesse = 40) {
  const himmel = (hinten) => (tag ? sonne(24, 22, hinten ? 10 : 12) : mond(24, 22, hinten ? 0.9 : 1.05))
  let inhalt
  switch (art) {
    case 'klar': inhalt = tag ? sonne(32, 32, 13) : mond(32, 32, 1.3); break
    case 'heiter': inhalt = `${himmel(false)}${wolke(24, 26, 0.72)}`; break
    case 'wolkig': inhalt = `${himmel(true)}${wolke(14, 20, 0.95)}`; break
    case 'bedeckt': inhalt = `${wolke(16, 8, 0.8, F.wolkeDunkel)}${wolke(6, 18, 0.95)}`; break
    case 'nebel': inhalt = `${wolke(8, 6, 0.95)}<g stroke="${F.wolkeDunkel}" stroke-width="3" stroke-linecap="round"><line x1="12" y1="48" x2="52" y2="48"/><line x1="18" y1="55" x2="46" y2="55"/></g>`; break
    case 'niesel': inhalt = `${wolke(8, 4, 0.95)}<g fill="${F.regen}"><circle cx="22" cy="50" r="2"/><circle cx="32" cy="54" r="2"/><circle cx="42" cy="50" r="2"/></g>`; break
    case 'regen': inhalt = `${wolke(8, 2, 0.95, F.wolkeDunkel)}${tropfen([[22, 45], [32, 49], [42, 45]])}`; break
    case 'schauer': inhalt = `${himmel(true)}${wolke(14, 14, 0.9)}${tropfen([[28, 50], [38, 53], [48, 50]])}`; break
    case 'schnee': inhalt = `${wolke(8, 2, 0.95)}<g fill="${F.schnee}"><circle cx="22" cy="48" r="2.6"/><circle cx="32" cy="54" r="2.6"/><circle cx="42" cy="48" r="2.6"/></g>`; break
    case 'gewitter': inhalt = `${wolke(8, 2, 0.95, F.wolkeDunkel)}<path d="M33 40l-8 12h6l-3 10 10-14h-6l3-8z" fill="${F.blitz}"/>${tropfen([[20, 45], [44, 45]])}`; break
    default: inhalt = wolke(8, 12, 0.95)
  }
  return `<svg class="wt-svg" viewBox="0 0 64 64" width="${groesse}" height="${groesse}" aria-hidden="true">${inhalt}</svg>`
}

// Voreinstellung: Schongau in Bayern
const STANDARD_ORT = { name: 'Schongau', region: 'Bayern', land: 'Deutschland', breite: 47.8124, laenge: 10.89664, zeitzone: 'Europe/Berlin' }
const REITER = { temperatur: 'Temperatur', niederschlag: 'Niederschlag', wind: 'Wind' }

export async function starten(ctx) {
  const m = ctx.maskieren
  let ort = STANDARD_ORT
  let wetter = null
  let fehler = ''
  let auswahl = 0 // gewählter Tag (0 = heute)
  let reiter = 'temperatur'

  const gespeichert = await ctx.daten.laden()
  if (gespeichert?.ort?.breite != null) ort = gespeichert.ort

  // ── Aufbau ──
  ctx.element.innerHTML = `
    <div class="wt">
      <section class="wt-kopf hud">
        <div class="wt-jetzt" data-jetzt></div>
        <div class="wt-rechts">
          <div class="wt-ort-zeile"><span data-ort></span> · <button class="wt-link" type="button" data-ort-aendern>Ort ändern</button></div>
          <div class="wt-titel">Wetter</div>
          <div class="wt-wann" data-wann></div>
          <div class="wt-lage" data-lage></div>
        </div>
        <div class="wt-ortwahl" data-ortwahl hidden>
          <form class="wt-suche" data-suche>
            <input name="suche" placeholder="Ort suchen, z. B. Schongau" autocomplete="off" />
            <button class="knopf-flach" type="submit">Suchen</button>
          </form>
          <div class="wt-treffer" data-treffer></div>
        </div>
      </section>
      <section class="wt-verlauf hud">
        <div class="wt-reiter" role="tablist">${Object.entries(REITER).map(([id, name]) => `<button type="button" role="tab" data-reiter="${id}">${name}</button>`).join('')}</div>
        <div class="wt-kurve" data-kurve></div>
        <div class="wt-tage" data-tage></div>
        <div class="wt-fuss leise" data-fuss></div>
      </section>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)
  const karte = ctx.karte('Wetter')

  // Stunden-Indizes für den gewählten Tag: heute ab der aktuellen Stunde 24 Stunden, sonst 0 bis 23 Uhr
  function stundenVon(tagIndex) {
    const h = wetter.hourly
    if (!h?.time) return []
    let start = h.time.findIndex((z) => z.startsWith(wetter.daily.time[tagIndex]))
    if (tagIndex === 0) {
      const jetzt = String(wetter.current.time).slice(0, 13)
      const k = h.time.findIndex((z) => z.slice(0, 13) === jetzt)
      if (k >= 0) start = k
    }
    if (start < 0) return []
    return Array.from({ length: 24 }, (_, k) => start + k).filter((k) => k < h.time.length)
  }

  // Kopf: heute die aktuellen Werte, an anderen Tagen die Tageswerte. Beim Drüberfahren über die Kurve: die Stunde.
  function kopfZeichnen(stunde = null) {
    const j = wetter.current
    const t = wetter.daily
    const h = wetter.hourly
    const hIndex = h?.time ? h.time.findIndex((z) => z.slice(0, 13) === String(j.time).slice(0, 13)) : -1
    let temp, text, art, istTag, regen, feuchte, wind, wann
    if (stunde != null) {
      ;[text, art] = code(h.weather_code[stunde])
      temp = h.temperature_2m[stunde]
      istTag = h.is_day?.[stunde] !== 0
      regen = h.precipitation_probability?.[stunde]
      feuchte = h.relative_humidity_2m?.[stunde]
      wind = h.wind_speed_10m?.[stunde]
      wann = `${wochentag(h.time[stunde])}, ${uhr(h.time[stunde])}`
    } else if (auswahl === 0) {
      ;[text, art] = code(j.weather_code)
      temp = j.temperature_2m
      istTag = hIndex < 0 || h.is_day?.[hIndex] !== 0
      regen = hIndex >= 0 ? h.precipitation_probability?.[hIndex] : t.precipitation_probability_max[0]
      feuchte = j.relative_humidity_2m
      wind = j.wind_speed_10m
      wann = `${wochentag(t.time[0])}, ${uhr(j.time)}`
    } else {
      ;[text, art] = tagWetter(wetter, auswahl)
      temp = t.temperature_2m_max[auswahl]
      istTag = true
      regen = t.precipitation_probability_max[auswahl]
      const mittag = h?.time ? h.time.indexOf(`${t.time[auswahl]}T14:00`) : -1
      feuchte = mittag >= 0 ? h.relative_humidity_2m?.[mittag] : null
      wind = t.wind_speed_10m_max?.[auswahl]
      wann = wochentag(t.time[auswahl])
    }
    const zeile = (name, wert) => (wert == null ? '' : `<div><span>${name}:</span> ${wert}</div>`)
    $('[data-jetzt]').innerHTML = `
      ${symbolSvg(art, istTag, 72)}
      <span class="wt-temp">${Math.round(temp)}</span><span class="wt-einheit">°C</span>
      <div class="wt-details">${zeile('Niederschlag', regen == null ? null : `${regen} %`)}${zeile('Luftfeuchte', feuchte == null ? null : `${feuchte} %`)}${zeile('Wind', wind == null ? null : `${Math.round(wind)} km/h`)}</div>`
    $('[data-wann]').textContent = wann
    $('[data-lage]').textContent = text
  }

  // ── 24-Stunden-Verlauf als SVG ──
  function kurveZeichnen() {
    const el = $('[data-kurve]')
    const h = wetter.hourly
    const idx = stundenVon(auswahl)
    if (idx.length < 2) return void (el.innerHTML = '<div class="leise">Kein Stundenverlauf verfügbar.</div>')
    const B = Math.max(320, el.clientWidth || 800)
    const H = 150
    const rand = 22
    const oben = 26
    const unten = 26
    const x = (k) => rand + (k * (B - 2 * rand)) / (idx.length - 1)
    const beschriftet = (k) => k % 3 === 0
    const zeiten = idx.map((i, k) => (beschriftet(k) ? `<text class="wt-achse" x="${x(k)}" y="${H - 6}" text-anchor="middle">${uhr(h.time[i])}</text>` : '')).join('')
    let inhalt = ''
    if (reiter === 'temperatur') {
      const werte = idx.map((i) => h.temperature_2m[i])
      const min = Math.min(...werte)
      const max = Math.max(...werte)
      const y = (v) => oben + (1 - (v - min) / (max - min || 1)) * (H - oben - unten - 8)
      const linie = werte.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
      inhalt = `
        <defs><linearGradient id="wt-verlauf-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${F.sonne}" stop-opacity="0.45"/><stop offset="1" stop-color="${F.sonne}" stop-opacity="0.04"/></linearGradient></defs>
        <path d="${linie} L${x(werte.length - 1)} ${H - unten} L${x(0)} ${H - unten} Z" fill="url(#wt-verlauf-gold)"/>
        <path d="${linie}" fill="none" stroke="${F.sonne}" stroke-width="2.5" stroke-linejoin="round"/>
        ${werte.map((v, k) => (beschriftet(k) ? `<text class="wt-wert" x="${x(k)}" y="${y(v) - 8}" text-anchor="middle">${Math.round(v)}</text>` : '')).join('')}`
    } else if (reiter === 'niederschlag') {
      const werte = idx.map((i) => h.precipitation_probability?.[i] ?? 0)
      const breite = Math.max(3, ((B - 2 * rand) / idx.length) * 0.55)
      const y = (v) => oben + (1 - v / 100) * (H - oben - unten)
      inhalt = `
        <line x1="${rand}" x2="${B - rand}" y1="${H - unten}" y2="${H - unten}" stroke="var(--rahmen)"/>
        ${werte.map((v, k) => `<rect x="${(x(k) - breite / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${breite.toFixed(1)}" height="${(H - unten - y(v)).toFixed(1)}" rx="1.5" fill="${F.regen}" opacity="${v ? 0.85 : 0}"/>`).join('')}
        ${werte.map((v, k) => (beschriftet(k) ? `<text class="wt-wert wt-wert-regen" x="${x(k)}" y="${y(v) - 6}" text-anchor="middle">${v} %</text>` : '')).join('')}`
    } else {
      const mitte = (H - unten + oben) / 2 + 4
      inhalt = idx
        .map((i, k) => {
          if (!beschriftet(k)) return ''
          const richtung = (h.wind_direction_10m?.[i] ?? 0) + 180 // Pfeil zeigt, wohin der Wind weht
          return `<g transform="translate(${x(k)} ${mitte - 14}) rotate(${richtung})"><path d="M0 -9 L5 3 L0 0 L-5 3 Z" fill="${F.wolke}"/></g>
            <text class="wt-wert" x="${x(k)}" y="${mitte + 16}" text-anchor="middle">${Math.round(h.wind_speed_10m?.[i] ?? 0)} km/h</text>`
        })
        .join('')
    }
    el.innerHTML = `<svg class="wt-kurve-svg" viewBox="0 0 ${B} ${H}" width="${B}" height="${H}">
      ${inhalt}${zeiten}
      <line class="wt-zeiger" data-zeiger x1="0" x2="0" y1="${oben - 10}" y2="${H - unten}" visibility="hidden"/>
      <rect data-flaeche x="0" y="0" width="${B}" height="${H}" fill="transparent"/>
    </svg>`
    // Drüberfahren: Stunde im Kopf zeigen
    const flaeche = el.querySelector('[data-flaeche]')
    const zeiger = el.querySelector('[data-zeiger]')
    flaeche.addEventListener('mousemove', (e) => {
      const r = flaeche.getBoundingClientRect()
      const k = Math.max(0, Math.min(idx.length - 1, Math.round(((e.clientX - r.left) * (B / r.width) - rand) / ((B - 2 * rand) / (idx.length - 1)))))
      zeiger.setAttribute('x1', x(k))
      zeiger.setAttribute('x2', x(k))
      zeiger.setAttribute('visibility', 'visible')
      kopfZeichnen(idx[k])
    })
    flaeche.addEventListener('mouseleave', () => {
      zeiger.setAttribute('visibility', 'hidden')
      kopfZeichnen()
    })
  }

  function zeichnen() {
    $('[data-ort]').innerHTML = `<b>${m(ort.name)}</b> <span class="leise">${m(ort.region || ort.land || '')}</span>`
    for (const k of ctx.element.querySelectorAll('[data-reiter]')) k.classList.toggle('an', k.dataset.reiter === reiter)
    if (!wetter) {
      const text = fehler ? `Wetter gerade nicht abrufbar: ${m(fehler)}` : 'Lade Wetter …'
      $('[data-jetzt]').innerHTML = `<div class="leise">${text}</div>`
      karte.innerHTML = `<div class="leise">${text}</div>`
      return
    }
    const j = wetter.current
    const t = wetter.daily
    kopfZeichnen()
    kurveZeichnen()
    $('[data-tage]').innerHTML = t.time
      .map((tag, i) => {
        const [tx, art] = tagWetter(wetter, i)
        return `<button type="button" class="wt-tag${i === auswahl ? ' an' : ''}" data-tag="${i}" title="${m(`${tagName(tag, i)}: ${tx}, Regen ${t.precipitation_probability_max[i] ?? 0} %`)}">
          <span class="wt-tag-name">${m(kurzTag(tag))}</span>${symbolSvg(art, true, 40)}
          <span class="wt-tag-temp"><b>${grad(t.temperature_2m_max[i])}</b> ${grad(t.temperature_2m_min[i])}</span></button>`
      })
      .join('')
    const gefuehlt = auswahl === 0 ? ` · gefühlt ${grad(j.apparent_temperature)}` : ''
    $('[data-fuss]').innerHTML = `Sonne ${uhr(t.sunrise[auswahl])} bis ${uhr(t.sunset[auswahl])}${gefuehlt} · Stand ${uhr(j.time)} Uhr · Daten: Open-Meteo`
    const [text, art] = code(j.weather_code)
    const hIndex = wetter.hourly?.time?.findIndex((z) => z.slice(0, 13) === String(j.time).slice(0, 13)) ?? -1
    const istTag = hIndex < 0 || wetter.hourly.is_day?.[hIndex] !== 0
    const [mtx, mart] = tagWetter(wetter, 1)
    karte.innerHTML = `
      <div class="wt-karte-jetzt">${symbolSvg(art, istTag, 34)}<span class="wt-karte-temp">${grad(j.temperature_2m)}</span><span class="wt-karte-text">${m(text)}<br><span class="leise">${m(ort.name)}</span></span></div>
      <div class="wt-karte-zeile"><span>Heute</span><span>${grad(t.temperature_2m_min[0])} / ${grad(t.temperature_2m_max[0])} · ${t.precipitation_probability_max[0] ?? 0} % Regen</span></div>
      <div class="wt-karte-zeile"><span>Morgen</span><span class="wt-karte-morgen">${symbolSvg(mart, true, 16)} ${grad(t.temperature_2m_min[1])} / ${grad(t.temperature_2m_max[1])} · ${m(mtx)}</span></div>`
  }

  async function laden() {
    try {
      wetter = await ctx.aufrufen('vorhersage', ort.breite, ort.laenge, ort.zeitzone)
      fehler = ''
      if (auswahl >= (wetter.daily?.time?.length || 1)) auswahl = 0
    } catch (e) {
      fehler = e.message
    }
    zeichnen()
  }

  // ── Bedienung: Reiter, Tage, Größe ──
  ctx.element.querySelector('.wt-reiter').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-reiter]')
    if (!knopf || !wetter) return
    reiter = knopf.dataset.reiter
    zeichnen()
  })
  $('[data-tage]').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-tag]')
    if (!knopf) return
    auswahl = Number(knopf.dataset.tag)
    zeichnen()
  })
  // Kurve an die Breite anpassen, aber nur bei echter Breitenänderung (sonst meldet der Browser eine Schleife)
  let letzteBreite = 0
  new ResizeObserver(([eintrag]) => {
    const breite = Math.round(eintrag.contentRect.width)
    if (!wetter || breite === letzteBreite) return
    letzteBreite = breite
    requestAnimationFrame(kurveZeichnen)
  }).observe($('[data-kurve]'))

  // ── Ort suchen und wählen ──
  $('[data-ort-aendern]').addEventListener('click', () => {
    const wahl = $('[data-ortwahl]')
    wahl.hidden = !wahl.hidden
    if (!wahl.hidden) wahl.querySelector('input').focus()
  })
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
    $('[data-ortwahl]').hidden = true
    wetter = null
    auswahl = 0
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
    const tage = t.time.slice(0, 3).map((tag, i) => `- ${tagName(tag, i)}: ${tagWetter(wetter, i)[0]}, ${grad(t.temperature_2m_min[i])} bis ${grad(t.temperature_2m_max[i])}, Regenrisiko ${t.precipitation_probability_max[i] ?? 0} %`)
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
