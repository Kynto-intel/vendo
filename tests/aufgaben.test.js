import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/aufgaben/ansicht.js'

function createElementStub() {
  return {
    innerHTML: '',
    parentElement: {},
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector() { return { checked: false, addEventListener() {} } }
  }
}

async function startPlugin(initialState = { aufgaben: [] }, assistantReady = false) {
  const state = structuredClone(initialState)
  const content = createElementStub()
  const headers = createElementStub()
  const calls = { messages: [], assistantCalls: [], saves: 0 }
  let commandHandler
  let contextProvider
  let greetingProvider
  const previousWindow = globalThis.window
  const previousSetInterval = globalThis.setInterval
  globalThis.window = {}
  globalThis.setInterval = () => 0
  const ctx = {
    element: content,
    kopfKnoepfe: headers,
    daten: {
      async laden() { return structuredClone(state) },
      async speichern(value) { Object.assign(state, structuredClone(value)); calls.saves++ },
      beiAenderung() {}
    },
    maskieren: (value) => String(value),
    karte: () => ({ innerHTML: '', parentElement: {} }),
    melden(value) { calls.messages.push(value) },
    vorlesen() {},
    bereit: () => assistantReady,
    kontextVon: async () => '',
    luzzy(...args) { calls.assistantCalls.push(args) },
    befehl(fn) { commandHandler = fn },
    kontext(fn) { contextProvider = fn },
    begruessung(fn) { greetingProvider = fn },
    oeffnen() {}
  }
  try {
    await starten(ctx)
    return { state, calls, commandHandler, contextProvider, greetingProvider, api: globalThis.window.__vendoAufgaben }
  } finally {
    globalThis.setInterval = previousSetInterval
    globalThis.window = previousWindow
  }
}

test('Manifest ID, voice command, and persisted date/time agree', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/aufgaben/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'aufgaben')

  const plugin = await startPlugin()
  const answer = await plugin.commandHandler('Neue Aufgabe: Etiketten bestellen morgen um 14 Uhr')
  assert.match(answer, /^Steht auf der Liste: Etiketten bestellen, morgen, 14:00 Uhr\./)
  assert.equal(plugin.state.aufgaben.length, 1)
  assert.match(plugin.state.aufgaben[0].datum, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(plugin.state.aufgaben[0].zeit, '14:00')
  assert.equal(plugin.state.aufgaben[0].erledigt, false)
  assert.equal(plugin.calls.saves, 1)
})

test('Completing an ambiguous task asks for clarification; a unique match is completed', async () => {
  const plugin = await startPlugin({ aufgaben: [
    { id: 'a1', text: 'Etiketten bestellen', erledigt: false, erstellt: 1 },
    { id: 'a2', text: 'Etiketten prüfen', erledigt: false, erstellt: 2 },
    { id: 'a3', text: 'Karton entsorgen', erledigt: false, erstellt: 3 }
  ] })

  assert.match(await plugin.commandHandler('Erledigt: Etiketten'), /^Welche\? /)
  assert.equal(plugin.calls.saves, 0)
  assert.match(await plugin.commandHandler('Erledigt: Karton'), /^Abgehakt: Karton entsorgen\./)
  assert.equal(plugin.state.aufgaben[2].erledigt, true)
  assert.equal((await plugin.api.offen()).length, 2)
  assert.match(await plugin.commandHandler('Was steht auf meiner Liste?'), /Etiketten bestellen/)
})

test('Unknown tasks are not intercepted; context and review fallback are available', async () => {
  const plugin = await startPlugin({ aufgaben: [
    { id: 'a1', text: 'Synthetische Aufgabe', datum: '2099-01-01', erledigt: false, erstellt: 1 }
  ] })
  assert.equal(await plugin.commandHandler('Erledigt: unbekannter Eintrag'), null)
  assert.match(plugin.contextProvider(), /Synthetische Aufgabe/)
  assert.equal(plugin.greetingProvider(), '')
  const review = await plugin.commandHandler('Wochen-Review')
  assert.match(review, /Was sind deine Ziele für nächste Woche\?/)
  assert.equal(plugin.state.review.zuletzt.length, 10)
})