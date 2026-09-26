// Verbindung zu Hermes.
//
// Pro PC läuft genau ein Hermes-Backend. Wie die Hermes-App dockt Jarves-OS an ein
// laufendes an (Adresse aus spawn-ledger.json, Zugangsschlüssel vom Backend selbst)
// oder startet eins, wenn keins läuft. Danach: REST für Abfragen, WebSocket
// (/api/ws, JSON-RPC) für Sessions und Live-Ereignisse.
//
// Die Zentrale ist ein normaler Chat mit Luzzy: eigene, feste Unterhaltung "Jarves-OS" im
// Profil donnerwolf. (Der Bot Chat mit message_agent für die Crew kommt als eigener Tab.)

const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const WebSocket = require('ws')

const HERMES_HOME = path.join(process.env.LOCALAPPDATA || '', 'hermes')
const HERMES_EXE = path.join(HERMES_HOME, 'bin', 'hermes.exe')
const ARBEITSORDNER = 'C:\\Users\\Felix\\Documents\\Donnerwolf'
const PROFIL = 'donnerwolf'
const ZENTRALE_TITEL = 'Jarves-OS'
const BOT_CHAT = 'Bot Chat'

function verlaufAus(nachrichten) {
  return (nachrichten || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-60)
    .map((m) => ({ rolle: m.role === 'user' ? 'felix' : 'luzzy', text: m.text }))
}
const RPC_TIMEOUT = 60000
const START_TIMEOUT = 150000

class Hermes extends EventEmitter {
  constructor() {
    super()
    this.port = null
    this.token = null
    this.eigenesBackendPid = null
    this.ws = null
    this.naechsteId = 1
    this.offen = new Map()
    this.sessionId = null // Laufzeit-ID der Zentrale (normaler Chat "Jarves-OS")
    this.gespeicherteId = null // dauerhafte ID der Zentrale
    this.crew = { sessionId: null, gespeicherteId: null, gewuenscht: false } // Luzzys Bot Chat
    this.zustand = 'getrennt'
    this.beendet = false
  }

  status(zustand, text = '') {
    this.zustand = zustand
    this.statusText = text
    this.emit('status', { zustand, text })
  }

  // ── Backend finden oder starten ──

  ledger() {
    try {
      const eintraege = JSON.parse(readFileSync(path.join(HERMES_HOME, 'spawn-ledger.json'), 'utf8'))
      return eintraege.filter((e) => ['serve', 'dashboard'].includes(e.purpose) && Number.isInteger(e.port))
    } catch {
      return []
    }
  }

  async tokenVon(port) {
    const antwort = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) })
    const html = await antwort.text()
    const treffer = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*["']([^"']+)["']/)
    return treffer ? treffer[1] : null
  }

  async andocken() {
    for (const eintrag of this.ledger().reverse()) {
      try {
        const token = await this.tokenVon(eintrag.port)
        if (token) return { port: eintrag.port, token, pid: eintrag.pid }
      } catch {
        // Eintrag veraltet, nächsten probieren
      }
    }
    return null
  }

  backendStarten() {
    return new Promise((fertig, fehler) => {
      // Mit Luzzys Profil starten (wie die Hermes-App), damit z. B. das Aktivierungswort ihre Einstellungen nutzt
      const kind = spawn(HERMES_EXE, ['--profile', PROFIL, 'serve', '--host', '127.0.0.1', '--port', '0'], {
        cwd: ARBEITSORDNER,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      })
      let ausgabe = ''
      const uhr = setTimeout(() => fehler(new Error('Hermes hat nicht rechtzeitig gestartet.')), START_TIMEOUT)
      const lesen = (daten) => {
        ausgabe += daten.toString()
        if (/(?<!\w)HERMES_(?:BACKEND|DASHBOARD)_READY port=\d+/.test(ausgabe)) {
          clearTimeout(uhr)
          fertig()
        } else if (/already running on this host/.test(ausgabe)) {
          // Ein anderes Programm war schneller: dann andocken
          clearTimeout(uhr)
          fertig()
        }
      }
      kind.stdout.on('data', lesen)
      kind.stderr.on('data', lesen)
      kind.on('error', (e) => {
        clearTimeout(uhr)
        fehler(new Error(`Hermes konnte nicht gestartet werden: ${e.message}`))
      })
    })
  }

  // ── Verbinden ──

  async verbinden() {
    this.beendet = false
    this.status('verbinde', 'Suche Hermes …')
    let verbindung = await this.andocken()
    if (!verbindung) {
      this.status('verbinde', 'Starte Hermes …')
      await this.backendStarten()
      verbindung = await this.andocken()
      if (!verbindung) throw new Error('Hermes läuft, aber der Zugang klappt nicht.')
      this.eigenesBackendPid = verbindung.pid
    }
    this.port = verbindung.port
    this.token = verbindung.token
    await this.wsOeffnen()
    this.status('verbinde', 'Öffne Luzzys Unterhaltung …')
    await this.luzzyOeffnen()
    if (this.crew.gewuenscht) await this.crewOeffnen().catch(() => {})
    this.status('bereit')
  }

  wsOeffnen() {
    return new Promise((fertig, fehler) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}/api/ws?token=${this.token}`)
      this.ws = ws
      ws.on('open', () => fertig())
      ws.on('error', (e) => fehler(new Error(`Verbindung zu Hermes fehlgeschlagen: ${e.message}`)))
      ws.on('message', (roh) => this.nachricht(roh))
      ws.on('close', () => this.getrennt())
    })
  }

  nachricht(roh) {
    let daten
    try {
      daten = JSON.parse(roh.toString())
    } catch {
      return
    }
    if (daten.id != null && this.offen.has(daten.id)) {
      const { fertig, uhr } = this.offen.get(daten.id)
      clearTimeout(uhr)
      this.offen.delete(daten.id)
      fertig(daten)
      return
    }
    if (daten.method === 'event' && daten.params) {
      const ereignis = daten.params
      // Nur Ereignisse aus unseren Unterhaltungen weitergeben, markiert mit dem Kanal
      const kanal = !ereignis.session_id || ereignis.session_id === this.sessionId ? 'zentrale'
        : ereignis.session_id === this.crew.sessionId ? 'crew' : null
      if (kanal) this.emit('ereignis', { ...ereignis, kanal })
    }
  }

  getrennt() {
    for (const { fertig, uhr } of this.offen.values()) {
      clearTimeout(uhr)
      fertig({ error: { message: 'Verbindung getrennt' } })
    }
    this.offen.clear()
    this.ws = null
    this.sessionId = null
    this.crew.sessionId = null
    if (this.beendet) return
    this.status('fehler', 'Verbindung zu Hermes verloren. Verbinde neu …')
    setTimeout(() => this.neuVerbinden(), 3000)
  }

  async neuVerbinden(versuch = 1) {
    if (this.beendet) return
    try {
      await this.verbinden()
    } catch (e) {
      const warte = Math.min(30000, 3000 * versuch)
      this.status('fehler', `${e.message} Neuer Versuch in ${Math.round(warte / 1000)} s.`)
      setTimeout(() => this.neuVerbinden(versuch + 1), warte)
    }
  }

  rpc(methode, parameter = {}) {
    return new Promise((fertig, fehler) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return fehler(new Error('Keine Verbindung zu Hermes.'))
      const id = this.naechsteId++
      const uhr = setTimeout(() => {
        this.offen.delete(id)
        fehler(new Error(`Hermes antwortet nicht (${methode}).`))
      }, RPC_TIMEOUT)
      this.offen.set(id, {
        uhr,
        fertig: (d) => (d.error ? fehler(new Error(d.error.message || 'Hermes-Fehler')) : fertig(d.result))
      })
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: methode, params: parameter }))
    })
  }

  async rest(pfad, optionen = {}) {
    const antwort = await fetch(`http://127.0.0.1:${this.port}${pfad}`, {
      method: optionen.method || 'GET',
      headers: { 'X-Hermes-Session-Token': this.token, 'Content-Type': 'application/json' },
      body: optionen.body ? JSON.stringify(optionen.body) : undefined,
      signal: AbortSignal.timeout(optionen.timeout || 30000)
    })
    const text = await antwort.text()
    if (!antwort.ok) throw new Error(`Hermes ${antwort.status}: ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }

  // ── Luzzys Unterhaltung ──

  async luzzyOeffnen() {
    // Zuerst über die gemerkte ID, dann über den Titel suchen
    let antwort = null
    let vorhanden = null
    const gemerkt = this.gemerkteSession?.()
    if (gemerkt) {
      // Nur wenn Hermes sagt "gibt es nicht mehr" (z. B. gelöscht), eine neue anlegen.
      // Bei anderen Fehlern (Hermes hakt kurz) abbrechen und später erneut versuchen,
      // damit der Verlauf nicht unnötig verloren geht.
      antwort = await this.rpc('session.resume', { session_id: gemerkt, profile: PROFIL }).catch((e) => {
        if (/not found|nicht gefunden|unknown session/i.test(e.message)) return null
        throw e
      })
      if (antwort) vorhanden = { id: gemerkt }
    }
    if (!antwort) {
      const liste = await this.rpc('session.list', { title: ZENTRALE_TITEL, profile: PROFIL })
      vorhanden = liste?.sessions?.[0] || null
      if (vorhanden) antwort = await this.rpc('session.resume', { session_id: vorhanden.resolved_id || vorhanden.id, profile: PROFIL })
    }
    if (!antwort) {
      // Noch keine (oder gelöscht/archiviert): neu anlegen und betiteln
      antwort = await this.rpc('session.create', { profile: PROFIL, cwd: ARBEITSORDNER })
      await this.rpc('session.title', { session_id: antwort.session_id, title: ZENTRALE_TITEL }).catch(() => {})
    }
    this.sessionId = antwort.session_id
    this.gespeicherteId = antwort.stored_session_id || vorhanden?.resolved_id || vorhanden?.id || null
    if (this.gespeicherteId) this.sessionMerken?.(this.gespeicherteId)
    this.emit('verlauf', { kanal: 'zentrale', verlauf: verlaufAus(antwort.messages) })
  }

  // Crew: Luzzys fester "Bot Chat". Nur dort hat sie message_agent für code-, recherche- und schreib-bot.
  async crewOeffnen() {
    this.crew.gewuenscht = true
    if (this.crew.sessionId) return this.emit('verlauf', { kanal: 'crew', verlauf: this.crew.letzterVerlauf || [] })
    const liste = await this.rpc('session.list', { title: BOT_CHAT, profile: PROFIL })
    const vorhanden = liste?.sessions?.[0]
    let antwort
    if (vorhanden) {
      antwort = await this.rpc('session.resume', { session_id: vorhanden.resolved_id || vorhanden.id, profile: PROFIL })
    } else {
      antwort = await this.rpc('session.create', { profile: PROFIL, cwd: ARBEITSORDNER })
      await this.rpc('session.title', { session_id: antwort.session_id, title: BOT_CHAT }).catch(() => {})
    }
    this.crew.sessionId = antwort.session_id
    this.crew.gespeicherteId = antwort.stored_session_id || vorhanden?.resolved_id || vorhanden?.id || null
    this.crew.letzterVerlauf = verlaufAus(antwort.messages)
    this.emit('verlauf', { kanal: 'crew', verlauf: this.crew.letzterVerlauf })
  }

  async senden(kanal, text) {
    for (let versuch = 0; versuch < 2; versuch++) {
      try {
        if (kanal === 'crew') {
          if (!this.crew.sessionId) await this.crewOeffnen()
          return await this.rpc('prompt.submit', { session_id: this.crew.sessionId, text })
        }
        if (!this.sessionId) await this.luzzyOeffnen()
        return await this.rpc('prompt.submit', { session_id: this.sessionId, text })
      } catch (e) {
        if (versuch === 1 || this.zustand !== 'bereit') throw e
        // Session weg: einmal neu öffnen
        if (kanal === 'crew') this.crew.sessionId = null
        else this.sessionId = null
      }
    }
  }

  // ── Sprache ──

  // Mitgeschnittenen Ton von Hermes mitschreiben lassen (lokal, faster-whisper, Profil-Sprache Deutsch)
  async transkribieren(bytes, mime) {
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    const antwort = await this.rest(`/api/audio/transcribe?profile=${PROFIL}`, {
      method: 'POST',
      body: { data_url: dataUrl, mime_type: mime },
      timeout: 90000
    })
    if (!antwort?.ok) throw new Error(antwort?.error || 'Spracherkennung fehlgeschlagen.')
    return String(antwort.transcript || '').trim()
  }

  // Aktivierungswort: Hermes hört auf "Hey Luzzy", den Ton liefert Jarves-OS (wake.feed, 16 kHz)
  async wakeStarten() {
    const antwort = await this.rpc('wake.start', { surface: 'tui', session_id: this.sessionId || '' })
    return antwort || { started: false }
  }

  wakeFuettern(bytes) {
    if (this.zustand !== 'bereit') return
    this.rpc('wake.feed', { pcm: Buffer.from(bytes).toString('base64'), sample_rate: 16000 }).catch(() => {})
  }

  wakeFortsetzen() {
    return this.rpc('wake.resume', {}).catch(() => null)
  }

  wakePausieren() {
    return this.rpc('wake.pause', {}).catch(() => null)
  }

  wakeStoppen() {
    return this.rpc('wake.stop', {}).catch(() => null)
  }

  async abbrechen(kanal = 'zentrale') {
    const id = kanal === 'crew' ? this.crew.sessionId : this.sessionId
    if (id) await this.rpc('session.interrupt', { session_id: id }).catch(() => {})
  }

  beenden() {
    this.beendet = true
    if (this.ws) this.ws.close()
    // Nur ein selbst gestartetes Backend beenden, nie das der Hermes-App
    if (this.eigenesBackendPid) {
      try {
        process.kill(this.eigenesBackendPid)
      } catch {
        // schon weg
      }
    }
  }
}

module.exports = { Hermes, PROFIL }
