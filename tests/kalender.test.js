import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/kalender/ansicht.js'

const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatTime = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

function createFormStub() {
  const form = {
    hidden: true,
    titel: { value: '' }, datum: { value: '' }, zeit: { value: '' }, dauer: { value: '60' },
    erinnerung: { value: '15' }, notiz: { value: '' }, handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector() { return { hidden: false } }
  }
  return form
}

async function startPlugin(initialState) {
  const state = structuredClone(initialState)
  const savedValues = []
  const notifications = []
  const timers = []
  const elementsBySelector = new Map()
  const form = createFormStub()
  const grid = { innerHTML: '', classList: { toggle() {} } }
  const calendarControls = {
    '[data-form]': form,
    '.kal-raster': grid
  }
  const content = {
    innerHTML: '',
    offsetParent: {},
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector(selector) {
      if (calendarControls[selector]) return calendarControls[selector]
      if (!elementsBySelector.has(selector)) elementsBySelector.set(selector, { innerHTML: '', textContent: '', value: '', hidden: false, handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn }, focus() {}, classList: { add() {}, remove() {}, contains() { return false } } })
      return elementsBySelector.get(selector)
    },
    querySelectorAll() { return [] }
  }
  const headers = {
    innerHTML: '',
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector(selector) {
      if (!elementsBySelector.has(`header:${selector}`)) elementsBySelector.set(`header:${selector}`, { textContent: '', title: '', dataset: {} })
      return elementsBySelector.get(`header:${selector}`)
    }
  }
  const card = { innerHTML: '', addEventListener() {} }
  const previous = { window: globalThis.window, document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  globalThis.window = {}
  globalThis.document = { activeElement: null, addEventListener() {} }
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  globalThis.clearInterval = () => {}
  let contextProvider
  let greetingProvider
  let openCount = 0
  const ctx = {
    element: content,
    kopfKnoepfe: headers,
    daten: {
      async laden() { return structuredClone(state) },
      async speichern(value) { Object.assign(state, structuredClone(value)); savedValues.push(structuredClone(value)) },
      beiAenderung() {}
    },
    maskieren(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') },
    karte() { return card },
    melden(value) { notifications.push(value) },
    bestaetigen: async () => false,
    kontext(fn) { contextProvider = fn },
    begruessung(fn) { greetingProvider = fn },
    oeffnen() { openCount++ }
  }
  await starten(ctx)
  return {
    state, savedValues, notifications, timers, elementsBySelector, form, content, contextProvider, greetingProvider,
    api: globalThis.window.__vendoKalender, get openCount() { return openCount },
    restore() { Object.assign(globalThis, { window: previous.window, document: previous.document, setInterval: previous.setInterval, clearInterval: previous.clearInterval }) }
  }
}

test('Manifest, reminder tick, calendar context, and greeting use synthetic events', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/kalender/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'kalender')
  const eventTime = new Date(Date.now() + 10 * 60000)
  const plugin = await startPlugin({ termine: [
    { id: 't1', titel: 'Synthetischer Rückruf', datum: formatDate(eventTime), zeit: formatTime(eventTime), dauer: 30, erinnerung: 15, notiz: 'Testnotiz' },
    { id: 't2', titel: 'Späterer Testtermin', datum: formatDate(new Date(Date.now() + 2 * 86400000)), zeit: '12:00', erinnerung: 0 }
  ] })
  try {
    assert.match(plugin.contextProvider(), /Synthetischer Rückruf/)
    assert.match(plugin.greetingProvider(), /Synthetischer Rückruf/)
    await plugin.timers.find((timer) => timer.ms === 30000).fn()
    assert.equal(plugin.notifications.length, 1)
    assert.match(plugin.notifications[0].titel, /Synthetischer Rückruf/)
    assert.ok(plugin.state.erinnert.t1)

    const searchInput = plugin.elementsBySelector.get('[data-suche-text]')
    searchInput.value = 'Rückruf'
    await searchInput.handlers.input({ target: searchInput })
    assert.match(plugin.elementsBySelector.get('[data-liste-titel]').textContent, /Suche: „Rückruf“ \(1\)/)
    assert.match(plugin.elementsBySelector.get('[data-kommend]').innerHTML, /Synthetischer Rückruf/)
  } finally {
    plugin.restore()
  }
})

test('Saving preserves newly arrived events; the calendar API validates dates', async () => {
  const plugin = await startPlugin({ termine: [{ id: 't1', titel: 'Vorhandener Termin', datum: '2099-01-01', zeit: '', erinnerung: 0 }] })
  try {
    plugin.state.termine.push({ id: 'extern', titel: 'Synthetisch extern ergänzt', datum: '2099-01-02', zeit: '', erinnerung: 0 })
    Object.assign(plugin.form, {
      titel: { value: 'Neuer synthetischer Termin' }, datum: { value: '2099-01-03' }, zeit: { value: '10:30' },
      dauer: { value: '60' }, erinnerung: { value: '15' }, notiz: { value: 'Nur Testdaten' }
    })
    await plugin.form.handlers.submit({ preventDefault() {} })
    assert.deepEqual(plugin.state.termine.map((entry) => entry.titel), [
      'Vorhandener Termin', 'Synthetisch extern ergänzt', 'Neuer synthetischer Termin'
    ])
    assert.equal(plugin.state.termine.at(-1).zeit, '10:30')
    assert.equal(plugin.state.termine.at(-1).notiz, 'Nur Testdaten')

    plugin.api.zeigen('ungueltig')
    assert.equal(plugin.openCount, 0)
    plugin.api.zeigen('2099-01-03')
    assert.equal(plugin.openCount, 1)
  } finally {
    plugin.restore()
  }
})