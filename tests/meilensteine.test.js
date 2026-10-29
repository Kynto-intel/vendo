import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { starten } from '../plugins/meilensteine/ansicht.js'

function createFieldStub(value = '') { return { value } }

async function startPlugin({ counterSnapshot = { anzahl: 375, gefeiert: {} }, milestoneList = [10, 25, 50, 100, 250, 500, 750, 1000], integrationFailure = false } = {}) {
  const settings = { schritt: 500, eigene: [{ id: 'm1', anzahl: 450, text: 'Synthetisches Ziel' }] }
  const savedSettings = []
  const elementsBySelector = new Map()
  const form = {
    handlers: {},
    elements: { anzahl: createFieldStub(), text: createFieldStub() },
    addEventListener(name, fn) { this.handlers[name] = fn }
  }
  const content = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '[data-neu]') return form
      if (!elementsBySelector.has(selector)) elementsBySelector.set(selector, { innerHTML: '', textContent: '', value: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn } })
      return elementsBySelector.get(selector)
    }
  }
  let contextProvider
  const ctx = {
    element: content,
    daten: {
      async laden() { return structuredClone(settings) },
      async speichern(value) { Object.assign(settings, structuredClone(value)); savedSettings.push(structuredClone(value)) }
    },
    maskieren(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') },
    async aufrufen(name) {
      if (integrationFailure) throw new Error('synthetic integration failure')
      return name === 'stand' ? structuredClone(counterSnapshot) : milestoneList
    },
    kontext(fn) { contextProvider = fn }
  }
  await starten(ctx)
  return { settings, savedSettings, content, form, elementsBySelector, contextProvider }
}

test('Manifest, progress, custom goals, and Luzzy context are rendered', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugins/meilensteine/plugin.json', import.meta.url), 'utf8'))
  assert.equal(manifest.id, 'meilensteine')
  const plugin = await startPlugin()
  assert.match(plugin.elementsBySelector.get('[data-kopf]').innerHTML, /375/)
  assert.match(plugin.elementsBySelector.get('[data-kopf]').innerHTML, /500\. Bestellung/)
  assert.match(plugin.elementsBySelector.get('[data-eigene]').innerHTML, /Synthetisches Ziel/)
  assert.match(plugin.elementsBySelector.get('[data-liste]').innerHTML, /250\. Bestellung/)
  assert.match(plugin.contextProvider(), /Nächster Meilenstein: 500\. Bestellung/)
  assert.match(plugin.contextProvider(), /450\. Bestellung \(Synthetisches Ziel\)/)

  plugin.form.elements.anzahl.value = '600'
  plugin.form.elements.text.value = 'Noch ein synthetisches Ziel'
  await plugin.form.handlers.submit({ preventDefault() {}, currentTarget: { elements: plugin.form.elements, reset() {} } })
  assert.equal(plugin.settings.eigene.find((goal) => goal.anzahl === 600).text, 'Noch ein synthetisches Ziel')
  assert.equal(plugin.savedSettings.length, 1)
})

test('An integration failure shows an empty state and invalid increments fall back safely', async () => {
  const plugin = await startPlugin({ counterSnapshot: { anzahl: null, gefeiert: {} }, milestoneList: [], integrationFailure: true })
  assert.match(plugin.elementsBySelector.get('[data-kopf]').innerHTML, /Noch nicht gezählt/)
  assert.equal(plugin.elementsBySelector.get('[data-liste]').innerHTML, '')
  assert.match(plugin.contextProvider(), /noch nicht gezählt/)
  assert.equal(plugin.elementsBySelector.get('[data-schritt]').value, '500')
})

test('Main process reads a synthetic counter snapshot and maps Vault entries', async () => {
  const source = await readFile(new URL('../plugins/meilensteine/haupt.js', import.meta.url), 'utf8')
  const loadedModule = { exports: {} }
  const registeredServices = new Map()
  const vaultText = '- 21.10.2026 · 250. Bestellung (um #250): Testfeier\n- 22.10.2026 · 500. Bestellung'
  const filesystemStub = { readFileSync(filePath) { assert.equal(filePath, 'synthetic-counter.json'); return '{"bestellAnzahl":375,"bestellAnzahlZeit":"2026-10-21T12:00:00.000Z"}' } }
  const dependencies = {
    'node:fs': filesystemStub,
    '../../src/main/waechter': {
      STAND_DATEI: 'synthetic-counter.json',
      meilensteinEinstellungen: () => ({ schritt: 250, eigene: [{ anzahl: 450 }] }),
      istMeilenstein: (n, settings) => n === 10 || n === 25 || n === 50 || n === 100 || n === 250 || n === 450 || (n >= 500 && n % settings.schritt === 0)
    }
  }
  const contextStub = {
    bereitstellen(name, fn) { registeredServices.set(name, fn) },
    vault: { async lesen(filePath) { assert.equal(filePath, 'Meilensteine.md'); return vaultText } }
  }
  new Function('require', 'module', 'exports', source)((name) => {
    assert.ok(dependencies[name], `Unexpected module: ${name}`)
    return dependencies[name]
  }, loadedModule, loadedModule.exports)
  loadedModule.exports(contextStub)

  const snapshot = await registeredServices.get('stand')()
  assert.equal(snapshot.anzahl, 375)
  assert.equal(snapshot.gefeiert[250].bestellung, '#250')
  assert.equal(snapshot.gefeiert[500].datum, '22.10.2026')
  const milestones = registeredServices.get('liste')(500)
  assert.ok(milestones.includes(250))
  assert.ok(milestones.includes(500))
  assert.ok(milestones.includes(450))
})