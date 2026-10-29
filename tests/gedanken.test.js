import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten, ideeZerlegen } from '../plugins/gedanken/ansicht.js'

const require = createRequire(import.meta.url)
const hauptLaden = require('../plugins/gedanken/haupt.js')

function createNodeStub() {
  return {
    innerHTML: '',
    handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    querySelector() { return { checked: false, addEventListener() {} } }
  }
}

async function startPlugin(initialState = { notizen: [] }, vaultFailure = false) {
  const state = structuredClone(initialState)
  const content = createNodeStub()
  const headers = createNodeStub()
  let commandHandler
  let contextProvider
  const calls = { vaultCalls: [], assistantCalls: [], saves: 0 }
  const ctx = {
    element: content,
    kopfKnoepfe: headers,
    daten: {
      async laden() { return structuredClone(state) },
      async speichern(value) { Object.assign(state, structuredClone(value)); calls.saves++ }
    },
    maskieren: String,
    async aufrufen(name, value) {
      calls.vaultCalls.push({ name, value })
      if (vaultFailure) throw new Error('synthetic Vault failure')
      return 'Vendo/Ideen/synthetisch.md'
    },
    luzzy(...args) { calls.assistantCalls.push(args); return true },
    befehl(fn) { commandHandler = fn },
    kontext(fn) { contextProvider = fn }
  }
  await starten(ctx)
  return { state, calls, commandHandler, contextProvider }
}

test('Manifest, voice command, plugin storage, and open context work together', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/gedanken/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'gedanken')
  const plugin = await startPlugin()

  assert.equal(await plugin.commandHandler('Merk dir: synthetische Idee festhalten.'), 'Notiert: Synthetische Idee festhalten.')
  assert.equal(plugin.state.notizen.length, 1)
  assert.equal(plugin.calls.vaultCalls[0].name, 'imVault')
  assert.match(plugin.calls.vaultCalls[0].value, /Synthetische Idee festhalten/)
  assert.match(plugin.contextProvider(), /Synthetische Idee festhalten/)
  assert.match(await plugin.commandHandler('Was wollte ich mir merken?'), /Eine Sache: Synthetische Idee festhalten/)
  assert.equal(await plugin.commandHandler('unbekannter Befehl'), null)
})

test('A Vault failure reports partial success without losing the note', async () => {
  const plugin = await startPlugin({ notizen: [] }, true)
  const response = await plugin.commandHandler('Notier: Nur lokal gespeichert')
  assert.match(response, /Nur hier in Vendo/)
  assert.equal(plugin.state.notizen.length, 1)
  assert.equal(plugin.state.notizen[0].text, 'Nur lokal gespeichert')
})

test('Idea responses are parsed and main-process Vault content is constrained', async () => {
  assert.deepEqual(ideeZerlegen('TITEL: Kleine Idee\nSCHLAGWORTE: Test, Alltag\n---\nEin synthetischer Absatz.'), {
    titel: 'Kleine Idee', schlagworte: ['Test', 'Alltag'], text: 'Ein synthetischer Absatz.'
  })

  const registeredServices = new Map()
  const appendedEntries = []
  const createdNotes = []
  hauptLaden({
    bereitstellen(name, fn) { registeredServices.set(name, fn) },
    vault: {
      async anhaengen(...args) { appendedEntries.push(args) },
      async anlegen(...args) { createdNotes.push(args); return 'synthetische-datei.md' }
    }
  })
  await registeredServices.get('imVault')('  Synthetische\nNotiz  ')
  assert.equal(appendedEntries[0][0], 'Gedankenspeicher.md')
  assert.match(appendedEntries[0][1], /Synthetische Notiz/)
  const result = await registeredServices.get('ideeAnlegen')({
    titel: '  Synthetischer  Titel  ', schlagworte: ['Test Eins', 'test-eins', 'Zwei'],
    text: 'Synthetischer Inhalt', original: 'Synthetisches Diktat', zeit: 1792540800000
  })
  assert.equal(result, 'synthetische-datei.md')
  assert.equal(createdNotes[0][0], 'Ideen')
  assert.equal(createdNotes[0][1], 'Synthetischer Titel')
  assert.match(createdNotes[0][2], /tags: \[idee, test-eins, zwei\]/)
  assert.match(createdNotes[0][2], /Synthetischer Inhalt/)
  assert.match(createdNotes[0][2], /> Synthetisches Diktat/)
})