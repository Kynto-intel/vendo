import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/wetter/ansicht.js'

const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function createForecast() {
  const dates = Array.from({ length: 8 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() + i)
    return formatDate(date)
  })
  const times = dates.flatMap((day) => Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, '0')}:00`))
  const codes = times.map((time) => {
    const day = dates.indexOf(time.slice(0, 10))
    const hour = Number(time.slice(11, 13))
    if (day === 2 && hour >= 8 && hour < 13) return 45
    if (day === 1 && hour >= 8 && hour <= 19) return 0
    return day === 0 ? 61 : 3
  })
  const currentHour = String(new Date().getHours()).padStart(2, '0')
  return {
    current: { time: `${dates[0]}T${currentHour}:00`, temperature_2m: 12.4, apparent_temperature: 11, weather_code: 3, wind_speed_10m: 8, relative_humidity_2m: 60 },
    daily: {
      time: dates, weather_code: [61, 61, 45, 3, 0, 2, 3, 1], precipitation_probability_max: [70, 39, 10, 0, 0, 20, 0, 0],
      temperature_2m_max: Array(8).fill(15), temperature_2m_min: Array(8).fill(6), wind_speed_10m_max: Array(8).fill(10),
      sunrise: dates.map((day) => `${day}T06:30`), sunset: dates.map((day) => `${day}T18:30`)
    },
    hourly: {
      time: times, weather_code: codes, temperature_2m: times.map((_, i) => 5 + i % 17), precipitation_probability: times.map(() => 25),
      wind_speed_10m: times.map(() => 8), wind_direction_10m: times.map(() => 180), relative_humidity_2m: times.map(() => 60), is_day: times.map(() => 1)
    }
  }
}

async function startView({ weather = createForecast(), fail = false } = {}) {
  const controls = new Map()
  const curve = {
    innerHTML: '', clientWidth: 500,
    querySelector() { return { addEventListener() {}, setAttribute() {} } }
  }
  const tabs = { handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn } }
  const content = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.wt-reiter') return tabs
      if (!controls.has(selector)) controls.set(selector, { innerHTML: '', textContent: '', value: '', hidden: false, handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn }, querySelector() { return { focus() {}, addEventListener() {}, setAttribute() {} } }, reset() {} })
      return controls.get(selector)
    },
    querySelectorAll() { return [] }
  }
  const card = { innerHTML: '', addEventListener() {} }
  const previous = {
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setInterval: globalThis.setInterval
  }
  globalThis.ResizeObserver = class { observe() {} }
  globalThis.requestAnimationFrame = () => 0
  globalThis.setInterval = () => 0
  let contextProvider
  let greetingProvider
  const ctx = {
    element: content,
    daten: { async laden() { return {} }, async speichern() {} },
    maskieren(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') },
    karte() { return card },
    async aufrufen(name) {
      if (name !== 'vorhersage') throw new Error(`unerwarteter Aufruf: ${name}`)
      if (fail) throw new Error('synthetischer Wetterdienstfehler')
      return structuredClone(weather)
    },
    kontext(fn) { contextProvider = fn },
    begruessung(fn) { greetingProvider = fn },
    oeffnen() {}
  }
  try {
    await starten(ctx)
    return { controls, card, contextProvider, greetingProvider }
  } finally {
    globalThis.ResizeObserver = previous.ResizeObserver
    globalThis.requestAnimationFrame = previous.requestAnimationFrame
    globalThis.setInterval = previous.setInterval
  }
}

function loadMainProcess(source) {
  const loadedModule = { exports: {} }
  const services = new Map()
  new Function('require', 'module', 'exports', source)((name) => {
    assert.equal(name, 'node:fs')
    return {}
  }, loadedModule, loadedModule.exports)
  loadedModule.exports({ bereitstellen(name, fn) { services.set(name, fn) } })
  return services
}

test('Manifest, context, daily forecast summary, and view use synthetic data', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/wetter/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'wetter')
  const view = await startView()
  const context = await view.contextProvider()
  assert.match(context, /Wetter in Schongau/)
  assert.match(context, /Heute: Leichter Regen/)
  assert.match(context, /Morgen: Klar/)
  assert.match(context, /Zeitweise Nebel/)
  assert.match(await view.greetingProvider(), /Draußen in Schongau hat es 12 Grad/)
  assert.match(view.card.innerHTML, /Synthetische|Schongau/)
  assert.match(view.controls.get('[data-tage]').innerHTML, /wt-tag/)
})

test('View displays forecast errors and returns no context when weather is unavailable', async () => {
  const view = await startView({ fail: true })
  assert.match(view.controls.get('[data-jetzt]').innerHTML, /synthetischer Wetterdienstfehler/)
  assert.match(view.card.innerHTML, /Wetter gerade nicht abrufbar/)
  assert.equal(await view.contextProvider(), '')
  assert.equal(await view.greetingProvider(), '')
})

test('Main process limits search input, maps responses, and caches forecasts', async () => {
  const source = await readFile(new URL('../plugins/wetter/haupt.js', import.meta.url), 'utf8')
  const services = loadMainProcess(source)
  const previousFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    if (String(url).includes('geocoding-api')) return { ok: true, async json() { return { results: [{ name: 'Synthetischer Ort', admin1: 'Testregion', country: 'Testland', latitude: 1.25, longitude: 2.5 }] } } }
    return { ok: true, async json() { return { daily: ['synthetische Forecastdaten'] } } }
  }
  try {
    assert.deepEqual(await services.get('suchen')(' x '), [])
    const places = await services.get('suchen')(`  ${'A'.repeat(100)}  `)
    assert.equal(places[0].name, 'Synthetischer Ort')
    assert.ok(requests[0].includes(encodeURIComponent('A'.repeat(80))))
    assert.ok(requests[0].includes('count=8'))
    const first = await services.get('vorhersage')(1.234, 2.345, 'Europe/Berlin')
    const second = await services.get('vorhersage')(1.2344, 2.3454, 'Europe/Berlin')
    assert.deepEqual(first, second)
    assert.equal(requests.filter((url) => url.includes('api.open-meteo.com/v1/forecast')).length, 1)
    const forecastUrl = new URL(requests.find((url) => url.includes('api.open-meteo.com/v1/forecast')))
    assert.equal(forecastUrl.searchParams.get('forecast_days'), '8')
    assert.match(forecastUrl.searchParams.get('hourly'), /wind_direction_10m/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Main process reports HTTP errors instead of returning invalid data', async () => {
  const services = loadMainProcess(await readFile(new URL('../plugins/wetter/haupt.js', import.meta.url), 'utf8'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 503 })
  try {
    await assert.rejects(services.get('suchen')('Synthetischer Ort'), /antwortet mit 503/)
  } finally {
    globalThis.fetch = previousFetch
  }
})