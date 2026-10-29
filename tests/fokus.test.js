import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/fokus/ansicht.js'

function formElement() {
  const elements = {
    fokus: { value: '25' },
    pause: { value: '5' },
    langePause: { value: '15' },
    runden: { value: '4' },
    klang: { value: 'aus' },
    lautstaerke: { value: '0.35' }
  }
  return { elements, handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn } }
}

async function startPlugin(initialState = { einstellungen: {} }) {
  const savedValues = []
  const controls = new Map()
  const form = formElement()
  const timerClock = { dataset: {} }
  const content = {
    innerHTML: '',
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector(selector) {
      if (selector === '[data-form]') return form
      if (selector === '.fk-uhr') return timerClock
      if (!controls.has(selector)) controls.set(selector, { textContent: '', disabled: false, dataset: {}, style: {} })
      return controls.get(selector)
    }
  }
  const calls = { doNotDisturb: [], spokenMessages: [] }
  let commandHandler
  const previousSetInterval = globalThis.setInterval
  globalThis.setInterval = () => 0
  const ctx = {
    element: content,
    daten: {
      async laden() { return structuredClone(initialState) },
      async speichern(value) { savedValues.push(structuredClone(value)) }
    },
    maskieren: String,
    nichtStoeren(value) { calls.doNotDisturb.push(value) },
    vorlesen(value) { calls.spokenMessages.push(value) },
    befehl(fn) { commandHandler = fn }
  }
  try {
    await starten(ctx)
    return { commandHandler, calls, content, form, savedValues, controls, timerClock }
  } finally {
    globalThis.setInterval = previousSetInterval
  }
}

test('Manifest and focus state transitions control Do Not Disturb correctly', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/fokus/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'fokus')
  const plugin = await startPlugin({ einstellungen: { fokus: 40 } })

  assert.match(plugin.commandHandler('Fokus 999 Minuten'), /240 Minuten/)
  assert.equal(plugin.timerClock.dataset.zustand, 'fokus')
  assert.ok(plugin.calls.doNotDisturb[0] > Date.now())
  assert.equal(plugin.commandHandler('Fokus pausieren'), 'Fokus angehalten.')
  assert.equal(plugin.calls.doNotDisturb.at(-1), 0)
  assert.match(plugin.controls.get('[data-phase]').textContent, /angehalten/)
  assert.equal(plugin.commandHandler('Weiter mit Fokus'), 'Weiter geht’s.')
  assert.ok(plugin.calls.doNotDisturb.at(-1) > Date.now())
  assert.equal(plugin.commandHandler('Fokus beenden'), 'Fokus beendet. Meldungen sind wieder an.')
  assert.equal(plugin.timerClock.dataset.zustand, '')
  assert.equal(plugin.calls.doNotDisturb.at(-1), 0)
})

test('Commands outside a timer and setting changes are handled safely', async () => {
  const plugin = await startPlugin()
  assert.equal(plugin.commandHandler('Fokus pausieren'), 'Es läuft gerade keine Fokuszeit.')
  assert.equal(plugin.commandHandler('Weiter mit Fokus'), 'Da ist nichts angehalten.')
  assert.equal(plugin.commandHandler('Fokus beenden'), 'Es läuft gerade keine Fokuszeit.')
  assert.equal(plugin.commandHandler('etwas anderes'), null)

  Object.assign(plugin.form.elements, {
    fokus: { value: '-1' },
    pause: { value: '8' },
    langePause: { value: '20' },
    runden: { value: '3' },
    klang: { value: 'aus' },
    lautstaerke: { value: '0.5' }
  })
  await plugin.form.handlers.input()
  assert.deepEqual(plugin.savedValues.at(-1).einstellungen, {
    fokus: 1, pause: 8, langePause: 20, runden: 3, klang: 'aus', lautstaerke: 0.5
  })
})