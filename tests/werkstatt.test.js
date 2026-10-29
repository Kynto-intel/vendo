import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { PLUGIN_SYMBOLE, pluginSymbolPfad } from '../src/renderer/rahmen/plugin-symbole.js'

const require = createRequire(import.meta.url)
const { pruefen } = require('../plugins/werkstatt/haupt.js')
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'vendo-werkstatt-test-'))
after(() => rm(fixtureRoot, { recursive: true, force: true }))

async function createDraft(id, files) {
  const folder = path.join(fixtureRoot, id)
  await mkdir(folder, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    if (content === null) {
      await mkdir(path.join(folder, name), { recursive: true })
      continue
    }
    await writeFile(path.join(folder, name), content, 'utf8')
  }
  return folder
}

test('Manifest and view/main-process syntax are checked for a synthetic draft', async () => {
  await createDraft('synthetic-tool', {
    'plugin.json': JSON.stringify({ id: 'synthetic-tool', name: 'Synthetic tool', version: '1.0.0', symbol: 'box', bereich: { name: 'Test' } }),
    'ansicht.js': 'export async function starten(ctx) { ctx.element.innerHTML = "synthetisch" }',
    'haupt.js': "module.exports = (ctx) => { ctx.bereitstellen('ping', async () => 'pong') }"
  })

  const result = pruefen('synthetic-tool', { ordnerBasis: fixtureRoot })
  assert.equal(result.fehler.length, 0)
  assert.equal(result.stufe, 'achtung')
  assert.deepEqual(result.internet, [])
  assert.ok(result.rechte.some((right) => right.text.includes('Hintergrundteil')))
})

test('Plugin symbols use the approved local icon set', async () => {
  const ids = ['aufgaben', 'fokus', 'gedanken', 'kalender', 'meilensteine', 'routinen', 'werkstatt', 'wetter']
  for (const id of ids) {
    const manifest = JSON.parse(await readFile(new URL(`../plugins/${id}/plugin.json`, import.meta.url), 'utf8'))
    assert.ok(PLUGIN_SYMBOLE.includes(manifest.symbol), `${id} must select an approved symbol`)
    assert.ok(pluginSymbolPfad(manifest.symbol))
  }
  assert.equal(pluginSymbolPfad('<svg onload="alert(1)"></svg>'), null)
})

test('Validation errors, disallowed files, permission warnings, and invalid IDs are reported', async () => {
  await createDraft('broken-tool', {
    'plugin.json': JSON.stringify({ id: 'wrong-id', name: 'Synthetic draft' }),
    'ansicht.js': 'export function starten(ctx) {',
    'haupt.js': "module.exports = (ctx) => { require('child_process').spawn('synthetic') }",
    'unexpected.txt': 'synthetisch',
    nested: null
  })

  const result = pruefen('broken-tool', { ordnerBasis: fixtureRoot })
  assert.equal(result.stufe, 'fehler')
  assert.ok(result.fehler.some((error) => error.includes('id')))
  assert.ok(result.fehler.some((error) => error.startsWith('ansicht.js:')))
  assert.ok(result.fehler.some((error) => error.includes('Symbol')))
  assert.ok(result.fehler.some((error) => error.includes('unexpected.txt')))
  assert.ok(result.fehler.some((error) => error.includes('Unterordner')))
  assert.ok(result.rechte.some((right) => right.text.includes('Startet Programme')))
  assert.throws(() => pruefen('../outside', { ordnerBasis: fixtureRoot }), /Ungültiger Plugin-Name/)
  assert.match(pruefen('missing-tool', { ordnerBasis: fixtureRoot }).fehler[0], /gibt es nicht/)
})

test('Unknown sidebar symbols are rejected', async () => {
  await createDraft('unknown-icon', {
    'plugin.json': JSON.stringify({ id: 'unknown-icon', name: 'Unknown icon', symbol: 'made-up', bereich: { name: 'Test' } }),
    'ansicht.js': 'export async function starten(ctx) { ctx.element.innerHTML = "synthetisch" }'
  })

  const result = pruefen('unknown-icon', { ordnerBasis: fixtureRoot })
  assert.ok(result.fehler.some((error) => error.includes('Symbol')))
})
