// Notfall-Luzzy (Idee 33): Ist Hermes oder das Cloud-Modell nicht erreichbar (kein Internet, Anbieter gestört),
// antwortet Luzzy lokal über Ollama auf Felix' PC. Ollama wird bei Bedarf selbst gestartet.
// Ohne Werkzeuge: kein Shop, keine Mails, kein Internet. Nur Gespräch plus das, was Vendo mitschickt.

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ADRESSEN = ['http://127.0.0.1:11434', 'http://[::1]:11434']
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')
let adresse = null
let startet = null

async function holen(basis, pfad, optionen = {}, ms = 2000) {
  const antwort = await fetch(basis + pfad, { ...optionen, signal: AbortSignal.timeout(ms) })
  if (!antwort.ok) throw new Error(`Ollama antwortet mit ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`)
  return antwort.json()
}

async function erreichbar() {
  for (const basis of adresse ? [adresse, ...ADRESSEN] : ADRESSEN) {
    try {
      await holen(basis, '/api/tags', {}, 1500)
      adresse = basis
      return true
    } catch {
      // nächste Adresse
    }
  }
  return false
}

// Läuft Ollama nicht, einmal starten und bis zu 25 Sekunden warten
async function bereit() {
  if (await erreichbar()) return true
  if (!startet) {
    startet = (async () => {
      if (!fs.existsSync(OLLAMA_EXE)) throw new Error('Ollama ist nicht installiert.')
      const kind = spawn(OLLAMA_EXE, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true })
      kind.unref()
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 500))
        if (await erreichbar()) return true
      }
      throw new Error('Ollama startet nicht.')
    })().finally(() => {
      startet = null
    })
  }
  return startet
}

// Installierte Modelle, kleinstes zuerst (antwortet am schnellsten)
async function modelle() {
  await bereit()
  const d = await holen(adresse, '/api/tags')
  return (d.models || []).filter((m) => !/embed/i.test(m.name)).sort((a, b) => a.size - b.size).map((m) => ({ name: m.name, groesse: m.size }))
}

// nachrichten: [{ role: 'system'|'user'|'assistant', content }]
async function fragen(nachrichten, modell = '') {
  await bereit()
  const name = modell || (await modelle())[0]?.name
  if (!name) throw new Error('In Ollama ist kein Modell installiert.')
  const d = await holen(adresse, '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think: false – ohne langes „Nachdenken“ antwortet z. B. gemma4 in Sekunden statt in einer halben Minute
    body: JSON.stringify({ model: name, messages: nachrichten, stream: false, think: false, keep_alive: '15m', options: { num_ctx: 8192, temperature: 0.6 } })
  }, 180000) // das erste Laden des Modells kann dauern
  return { text: String(d.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), modell: name }
}

module.exports = { bereit, modelle, fragen }
