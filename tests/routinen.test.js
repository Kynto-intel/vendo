import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/routinen/ansicht.js'

async function pluginStart(initial) {
  const state = structuredClone(initial)
  const timers = []
  const saves = []
  const controls = new Map()
  const content = {
    innerHTML: '',
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, { innerHTML: '', textContent: '', value: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn } })
      return controls.get(selector)
    }
  }
  const headers = { innerHTML: '', addEventListener() {} }
  const previous = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  globalThis.clearInterval = () => {}
  let inputFilter
  let buttons
  const calls = { prompts: [], context: [], saved: saves }
  const ctx = {
    element: content,
    kopfKnoepfe: headers,
    daten: {
      async laden() { return structuredClone(state) },
      async speichern(value) { Object.assign(state, structuredClone(value)); saves.push(structuredClone(value)) }
    },
    maskieren(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') },
    async kontextFuer(text) { calls.context.push(text); return text.includes('Kalender') ? 'Synthetischer Kalenderkontext' : '' },
    luzzy(text, options) { calls.prompts.push({ text, options }); return true },
    eingabeFilter(fn) { inputFilter = fn },
    knoepfe(value) { buttons = value },
    bereit: () => true,
    bestaetigen: async () => false,
    hinweis() {}
  }
  try {
    await starten(ctx)
    return {
      state, timers, controls, calls, inputFilter, get buttons() { return buttons },
      restore() { globalThis.setInterval = previous.setInterval; globalThis.clearInterval = previous.clearInterval }
    }
  } catch (error) {
    globalThis.setInterval = previous.setInterval
    globalThis.clearInterval = previous.clearInterval
    throw error
  }
}

test('Manifest, trigger phrase, prompt context, and routine button work', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/routinen/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'routinen')
  const plugin = await pluginStart({ routinen: [{
    id: 'r1', name: 'Morgenbericht', ausloeser: ['morgenbericht'],
    prompt: 'Bitte Termine im Kalender zusammenfassen.', vorlesen: true, speichern: true,
    pfad: 'synthetischer/{datum}.md', knopf: true
  }], einstellungen: {} })
  try {
    const result = await plugin.inputFilter('Hey Luzzy, Morgenbericht ohne Wetter')
    assert.match(result.text, /Synthetischer Kalenderkontext/)
    assert.match(result.text, /Zusatz von Felix: ohne wetter/)
    assert.match(result.text, /synthetischer\/\d{4}-\d{2}-\d{2}\.md/)
    assert.equal(result.vorlesen, true)
    assert.equal(await plugin.inputFilter('morgenberichterstattung'), null)
    assert.equal(plugin.buttons.length, 1)
    await plugin.buttons[0].fn()
    assert.equal(plugin.calls.prompts.length, 1)
    assert.match(plugin.calls.prompts[0].options.anzeige, /Morgenbericht/)
  } finally {
    plugin.restore()
  }
})

test('Legacy prompt components are migrated exactly once', async () => {
  const plugin = await pluginStart({
    routinen: [{ id: 'r2', name: 'Test', ausloeser: [], prompt: 'Basisauftrag', bausteine: ['wetter', 'unbekannt'], knopf: false }],
    einstellungen: { ort: 'Synthetischer Ort' }
  })
  try {
    assert.match(plugin.state.routinen[0].prompt, /Wetter heute und morgen in Synthetischer Ort/)
    assert.deepEqual(plugin.state.routinen[0].bausteine, [])
    assert.equal(plugin.calls.saved.length, 1)
  } finally {
    plugin.restore()
  }
})

test('Schedule waits while the assistant is busy and runs once at the target minute', async () => {
  const now = new Date()
  const today = (now.getDay() + 6) % 7
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const plugin = await pluginStart({ routinen: [{
    id: 'r3', name: 'Synthetischer Zeitplan', ausloeser: [], prompt: 'Auftrag ausführen.', knopf: false,
    zeitplan: { aktiv: true, zeit: time, tage: [today] }
  }], einstellungen: {} })
  try {
    assert.equal(plugin.timers[0].ms, 30000)
    await plugin.timers[0].fn()
    assert.equal(plugin.calls.prompts.length, 1)
    assert.match(plugin.calls.prompts[0].options.anzeige, /Synthetischer Zeitplan/)
    await plugin.timers[0].fn()
    assert.equal(plugin.calls.prompts.length, 1)
  } finally {
    plugin.restore()
  }
})