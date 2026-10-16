// Cloud-TTS-Anbieter. Schlüssel bleiben im Hauptprozess und werden mit dem Windows-Kontoschlüssel verschlüsselt.

const fs = require('node:fs')
const path = require('node:path')
const { app, safeStorage } = require('electron')

const GOOGLE_API = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const ELEVEN_API = 'https://api.elevenlabs.io'
const GOOGLE_MODELL = 'gemini-3.8-flash-tts'
const SCHLUESSEL_DATEI = () => path.join(app.getPath('userData'), 'tts-zugaenge.enc')
const GEMINI_STIMMEN = [
  ['Zephyr', 'Hell'], ['Puck', 'Lebhaft'], ['Charon', 'Informativ'], ['Kore', 'Fest'], ['Fenrir', 'Aufgeregt'],
  ['Leda', 'Jugendlich'], ['Orus', 'Fest'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Gelassen'], ['Autonoe', 'Hell'],
  ['Enceladus', 'Gehaucht'], ['Iapetus', 'Klar'], ['Umbriel', 'Unkompliziert'], ['Algieba', 'Rund'], ['Despina', 'Rund'],
  ['Erinome', 'Klar'], ['Algenib', 'Kiesig'], ['Rasalgethi', 'Informativ'], ['Laomedeia', 'Lebhaft'], ['Achernar', 'Sanft'],
  ['Alnilam', 'Fest'], ['Schedar', 'Gerade'],
  ['Gacrux', 'Ausgereift'], ['Pulcherrima', 'Vorwärts'], ['Achird', 'Freundlich'], ['Zubenelgenubi', 'Informell'],
  ['Vindemiatrix', 'Sanft'], ['Sadachbia', 'Lebhaft'], ['Sadaltager', 'Sachkundig'], ['Sulafat', 'Warm']
].map(([id, klang]) => ({ id, name: `${id} · ${klang}`, herkunft: 'Gemini' }))

function schluesselLaden() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Der verschlüsselte Windows-Speicher ist gerade nicht verfügbar.')
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(SCHLUESSEL_DATEI())))
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    throw new Error('Die gespeicherten TTS-Zugänge konnten nicht entschlüsselt werden.')
  }
}

function schluesselSpeichern(zugaenge) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Der verschlüsselte Windows-Speicher ist gerade nicht verfügbar.')
  const datei = SCHLUESSEL_DATEI()
  fs.mkdirSync(path.dirname(datei), { recursive: true })
  const temporaer = `${datei}.neu`
  fs.writeFileSync(temporaer, safeStorage.encryptString(JSON.stringify(zugaenge)))
  fs.renameSync(temporaer, datei)
}

function zugangSetzen(anbieter, schluessel) {
  if (!['gemini', 'elevenlabs'].includes(anbieter)) throw new Error('Unbekannter TTS-Anbieter.')
  const wert = String(schluessel || '').trim()
  if (wert.length > 500 || /[\r\n]/.test(wert)) throw new Error('Der API-Schlüssel hat ein ungültiges Format.')
  const zugaenge = schluesselLaden()
  if (wert) zugaenge[anbieter] = wert
  else delete zugaenge[anbieter]
  schluesselSpeichern(zugaenge)
  return zugangStatus()
}

function zugangStatus() {
  if (!safeStorage.isEncryptionAvailable()) return { speicherVerfuegbar: false, gemini: false, elevenlabs: false }
  const zugaenge = schluesselLaden()
  return { speicherVerfuegbar: true, gemini: Boolean(zugaenge.gemini), elevenlabs: Boolean(zugaenge.elevenlabs) }
}

function schluesselFuer(anbieter) {
  const schluessel = schluesselLaden()[anbieter]
  if (!schluessel) throw new Error(`Bitte zuerst den ${anbieter === 'gemini' ? 'Gemini' : 'ElevenLabs'}-API-Schlüssel in den Stimmeinstellungen speichern.`)
  return schluessel
}

async function antwortPruefen(antwort, anbieter) {
  if (antwort.ok) return antwort
  if (antwort.status === 401 || antwort.status === 403) throw new Error(`${anbieter} lehnt den API-Schlüssel oder den Zugriff ab (${antwort.status}).`)
  if (antwort.status === 429) throw new Error(`${anbieter} meldet ein Nutzungslimit (429). Bitte später erneut versuchen.`)
  if (antwort.status === 402) {
    const daten = await antwort.clone().json().catch(() => null)
    const detail = daten?.detail
    const grund = typeof detail === 'string' ? detail : detail?.message || ''
    throw new Error(`${anbieter} hat die Anfrage aus Abrechnungs- oder Kontingentgründen abgelehnt (402)${grund ? `: ${String(grund).slice(0, 180)}` : '. Prüfe deine verfügbaren Free-Credits im ElevenLabs-Konto.'}`)
  }
  if (antwort.status === 400 || antwort.status === 422) {
    const daten = await antwort.clone().json().catch(() => null)
    const detail = daten?.detail
    const grund = typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? detail.map((d) => d.msg).filter(Boolean).join('; ') : '')
    throw new Error(`${anbieter} antwortet mit Fehler ${antwort.status}${grund ? `: ${String(grund).slice(0, 240)}` : '.'}`)
  }
  throw new Error(`${anbieter} antwortet mit Fehler ${antwort.status}.`)
}

async function stimmenLaden(anbieter) {
  if (anbieter === 'gemini') return GEMINI_STIMMEN
  if (anbieter !== 'elevenlabs') throw new Error('Für diesen Anbieter gibt es keine Cloud-Stimmenliste.')
  const antwort = await fetch(`${ELEVEN_API}/v2/voices`, {
    headers: { 'xi-api-key': schluesselFuer('elevenlabs') },
    signal: AbortSignal.timeout(20000)
  })
  await antwortPruefen(antwort, 'ElevenLabs')
  const daten = await antwort.json()
  return (daten.voices || [])
    .filter((stimme) => {
      const tarife = stimme.available_for_tiers
      return !Array.isArray(tarife) || tarife.length === 0 || tarife.some((tarif) => String(tarif).toLowerCase() === 'free')
    })
    .map((stimme) => ({ id: stimme.voice_id, name: stimme.name || stimme.voice_id, herkunft: 'ElevenLabs Free' }))
}

async function geminiSprechen(text, stimme, tempo) {
  const annotations = tempo ? [{ type: 'speech_metadata', style: tempo < 0 ? 'speaking slowly' : 'speaking rapidly' }] : undefined
  const antwort = await fetch(GOOGLE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': schluesselFuer('gemini') },
    body: JSON.stringify({
      model: GOOGLE_MODELL,
      input: [{ type: 'user_input', content: [{ type: 'text', text, ...(annotations ? { annotations } : {}) }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: stimme || 'Kore' }] }
    }),
    signal: AbortSignal.timeout(120000)
  })
  await antwortPruefen(antwort, 'Gemini TTS')
  const daten = await antwort.json()
  const inhalte = (daten.steps || []).flatMap((schritt) => schritt.content || [])
  const audio = inhalte.find((teil) => teil.type === 'audio' && teil.data)?.data || daten.output_audio?.data
  if (!audio) throw new Error('Gemini TTS hat keine Audiodaten zurückgegeben.')
  return Buffer.from(audio, 'base64')
}

async function elevenlabsSprechen(text, stimme, tempo) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(stimme || ''))) throw new Error('Bitte in den Stimmeinstellungen eine ElevenLabs-Stimme auswählen.')
  const antwort = await fetch(`${ELEVEN_API}/v1/text-to-speech/${encodeURIComponent(stimme)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': schluesselFuer('elevenlabs'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { speed: Math.max(0.7, Math.min(1.2, 1 + (Number(tempo) || 0) / 100)) }
    }),
    signal: AbortSignal.timeout(120000)
  })
  await antwortPruefen(antwort, 'ElevenLabs')
  const audio = Buffer.from(await antwort.arrayBuffer())
  if (audio.length < 128) throw new Error('ElevenLabs hat keine Audiodaten zurückgegeben.')
  return audio
}

async function sprechen(anbieter, text, { stimme, tempo } = {}) {
  const inhalt = String(text || '').slice(0, 3000)
  if (!inhalt) throw new Error('Kein Text zum Vorlesen vorhanden.')
  const tempoProzent = Number.parseFloat(String(tempo || '').replace('%', '')) || 0
  if (anbieter === 'gemini') return geminiSprechen(inhalt, stimme, tempoProzent)
  if (anbieter === 'elevenlabs') return elevenlabsSprechen(inhalt, stimme, tempoProzent)
  throw new Error('Unbekannter TTS-Anbieter.')
}

module.exports = { zugangSetzen, zugangStatus, stimmenLaden, sprechen }
