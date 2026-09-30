// Wetter-Plugin, Hintergrundteil: holt Daten von Open-Meteo (kostenlos, kein Konto, kein Schlüssel).
// Übertragen wird nur der Ortsname (Suche) bzw. die Koordinaten (Vorhersage).

const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const VORHERSAGE = 'https://api.open-meteo.com/v1/forecast'
const PUFFER_MS = 15 * 60 * 1000

let puffer = { schluessel: '', zeit: 0, daten: null }

async function holen(url) {
  const antwort = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!antwort.ok) throw new Error(`Wetterdienst antwortet mit ${antwort.status}.`)
  return antwort.json()
}

module.exports = (ctx) => {
  // Ort suchen: Liste mit Name, Region, Land, Koordinaten
  ctx.bereitstellen('suchen', async (name) => {
    const text = String(name || '').trim().slice(0, 80)
    if (text.length < 2) return []
    const daten = await holen(`${GEO}?name=${encodeURIComponent(text)}&count=8&language=de&format=json`)
    return (daten.results || []).map((o) => ({
      name: o.name,
      region: o.admin1 || '',
      land: o.country || '',
      breite: o.latitude,
      laenge: o.longitude,
      zeitzone: o.timezone || 'Europe/Berlin'
    }))
  })

  // Vorhersage für Koordinaten: jetzt + 8 Tage (15 Minuten zwischengespeichert)
  ctx.bereitstellen('vorhersage', async (breite, laenge, zeitzone = 'Europe/Berlin') => {
    const schluessel = `${Number(breite).toFixed(3)},${Number(laenge).toFixed(3)}`
    if (puffer.schluessel === schluessel && Date.now() - puffer.zeit < PUFFER_MS) return puffer.daten
    const parameter = new URLSearchParams({
      latitude: String(breite),
      longitude: String(laenge),
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,relative_humidity_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,wind_speed_10m_max',
      // Stundenwerte: Tagesbeschreibung (ansicht.js: tagWetter) und der Verlauf (Temperatur, Niederschlag, Wind)
      hourly: 'weather_code,temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day',
      timezone: zeitzone,
      forecast_days: '8'
    })
    const daten = await holen(`${VORHERSAGE}?${parameter}`)
    puffer = { schluessel, zeit: Date.now(), daten }
    return daten
  })
}
