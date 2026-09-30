// Infos für die Mini-Insel (mini.html): Wetter, nächster Termin und offene Aufgaben aus den Plugins Wetter, Kalender
// und Aufgaben, dazu Luzzys Worte (Untertitel) und neue Meldungen. Solange der Mini-Modus an ist, jede Minute neu und
// sofort, wenn sich Termine oder Aufgaben ändern (das Wetter puffert das Plugin selbst 15 Minuten).

const MINUTE = 60 * 1000
const zwei = (n) => String(n).padStart(2, '0')
const tagText = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`

// WMO-Wettercodes kurz (die langen Texte hat das Wetter-Plugin)
function wetterText(c) {
  if (c === 0) return 'klar'
  if (c === 1) return 'heiter'
  if (c === 2) return 'wolkig'
  if (c === 3) return 'bedeckt'
  if (c === 45 || c === 48) return 'Nebel'
  if (c >= 51 && c <= 57) return 'Niesel'
  if (c >= 61 && c <= 67) return 'Regen'
  if (c >= 71 && c <= 77) return 'Schnee'
  if (c >= 80 && c <= 82) return 'Schauer'
  if (c === 85 || c === 86) return 'Schneeschauer'
  if (c >= 95) return 'Gewitter'
  return ''
}

// Nächster Termin heute oder morgen, der noch nicht vorbei ist: „15:00 Zahnarzt“, „Morgen 09:30 Steuerberater“
function naechsterTermin(termine = []) {
  const jetzt = new Date()
  const heute = tagText(jetzt)
  const morgen = tagText(new Date(Date.now() + 24 * 60 * MINUTE))
  const beginn = (t) => {
    const [j, m, d] = t.datum.split('-').map(Number)
    const [h, min] = (t.zeit || '00:00').split(':').map(Number)
    return new Date(j, m - 1, d, h, min)
  }
  const kommend = termine
    .filter((t) => t?.datum && [heute, morgen].includes(t.datum))
    .filter((t) => !t.zeit || beginn(t).getTime() + (Number(t.dauer) || 30) * MINUTE > jetzt.getTime())
    .sort((a, b) => beginn(a) - beginn(b))
  const t = kommend.find((x) => x.zeit) || kommend[0] // Termine mit Uhrzeit zuerst, sonst ganztägige
  if (!t) return ''
  const wann = `${t.datum === morgen ? 'Morgen ' : ''}${t.zeit || (t.datum === morgen ? '' : 'Heute')}`.trim()
  return `${wann} ${t.titel || 'Termin'}`
}

export function miniInfoEinrichten({ api }) {
  let an = false
  let uhr = 0
  let letzteWorte = 0
  let worteUhr = 0
  const senden = (daten) => an && api.fenster.miniZustand(daten)

  async function wetter() {
    const ort = (await api.plugins.datenLaden('wetter').catch(() => null))?.ort
    if (ort?.breite == null) return null
    const w = await api.plugins.aufrufen('wetter', 'vorhersage', ort.breite, ort.laenge, ort.zeitzone).catch(() => null)
    const j = w?.current
    if (!j || typeof j.temperature_2m !== 'number') return null
    return { grad: Math.round(j.temperature_2m), text: wetterText(j.weather_code) }
  }
  async function sammeln() {
    if (!an) return
    const [w, kalender, aufgaben] = await Promise.all([
      wetter().catch(() => null),
      api.plugins.datenLaden('kalender').catch(() => null),
      api.plugins.datenLaden('aufgaben').catch(() => null)
    ])
    senden({
      info: {
        wetter: w,
        termin: naechsterTermin(Array.isArray(kalender?.termine) ? kalender.termine : []),
        aufgaben: (Array.isArray(aufgaben?.aufgaben) ? aufgaben.aufgaben : []).filter((a) => a && !a.erledigt).length
      }
    })
  }
  api.plugins.beiAenderung?.((id) => ['kalender', 'aufgaben', 'wetter'].includes(id) && sammeln())

  return {
    // Mini-Modus an/aus (app.js, api.fenster.beiMini)
    an(wert) {
      an = Boolean(wert)
      clearInterval(uhr)
      if (!an) return
      setTimeout(sammeln, 400) // die Insel braucht einen Moment zum Laden
      uhr = setInterval(sammeln, MINUTE)
    },
    // Luzzys Worte (Untertitel), höchstens ~8× pro Sekunde; das letzte Stück kommt immer an
    worte(text) {
      if (!an) return
      clearTimeout(worteUhr)
      const warten = 120 - (performance.now() - letzteWorte)
      if (warten > 0) return (worteUhr = setTimeout(() => this.worte(text), warten))
      letzteWorte = performance.now()
      senden({ worte: text })
    },
    // Neue Meldung (meldungen.js): klappt die Insel kurz auf
    meldung(m) {
      senden({ meldung: { art: m.art, titel: m.titel, anzeige: m.anzeige || '' } })
    }
  }
}
