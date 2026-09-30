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
    this.freigaben = new Map() // Hermes fragt nach Felix' Freigabe: Anfrage-ID → { sessionId, requestId }
    this.sessionId = null // Laufzeit-ID der Zentrale (normaler Chat "Jarves-OS")
    this.gespeicherteId = null // dauerhafte ID der Zentrale
    this.crew = { sessionId: null, gespeicherteId: null, gewuenscht: false } // Luzzys Bot Chat
    // Direkte Gespräche mit den Bots: Kanal „normal:<profil>“ (normales Gespräch) oder „botchat:<profil>“ (Bot Mode)
    this.bots = new Map() // kanal → { profil, modus, sessionId, letzterVerlauf }
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
    // Hermes sagen, dass Jarves-OS Rückfragen beantwortet (Freigaben für riskante Befehle).
    // Ohne das bricht Hermes solche Befehle einfach ab, statt Felix zu fragen.
    await this.rpc('client.capabilities', { server_requests: true }).catch(() => {})
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
    // Hermes fragt etwas (Anfrage mit eigener ID, z. B. Freigabe für einen Befehl)
    if (daten.method && daten.method !== 'event' && daten.id != null) return this.serverAnfrage(daten)
    if (daten.method === 'event' && daten.params) {
      const ereignis = daten.params
      // Nur Ereignisse aus unseren Unterhaltungen weitergeben, markiert mit dem Kanal
      const kanal = !ereignis.session_id ? 'zentrale' : this.kanalVon(ereignis.session_id)
      if (kanal) this.emit('ereignis', { ...ereignis, kanal })
    }
  }

  // Zu welchem Kanal gehört eine Hermes-Unterhaltung? (zentrale, crew, normal:<profil>, botchat:<profil>)
  kanalVon(sessionId) {
    if (sessionId === this.sessionId) return 'zentrale'
    if (sessionId === this.crew.sessionId) return 'crew'
    for (const [kanal, b] of this.bots) if (b.sessionId === sessionId) return kanal
    return null
  }

  sessionIdVon(kanal) {
    if (kanal === 'zentrale') return this.sessionId
    if (kanal === 'crew') return this.crew.sessionId
    return this.bots.get(kanal)?.sessionId || null
  }

  // Gespräch mit einem Bot öffnen (oder das gemerkte fortsetzen). normal = eigenes Gespräch „Jarves-OS“ im Profil
  // des Bots, ohne Bot Mode. botchat = sein „Bot Chat“ (dort arbeiten die Bots zusammen, Bot Mode).
  async botOeffnen(kanal) {
    const t = /^(normal|botchat):([a-z0-9][a-z0-9_-]{0,63})$/.exec(String(kanal))
    if (!t) throw new Error('Unbekannter Bot-Kanal.')
    const [, modus, profil] = t
    if (modus === 'botchat' && profil === PROFIL) return this.crewOeffnen() // Luzzys Bot Chat = Kanal „crew“
    if (modus === 'normal' && profil === PROFIL) throw new Error('Luzzys normaler Chat ist die Zentrale.')
    const b = this.bots.get(kanal) || { profil, modus, sessionId: null, letzterVerlauf: [] }
    this.bots.set(kanal, b)
    if (b.sessionId) return this.emit('verlauf', { kanal, verlauf: b.letzterVerlauf || [] })
    // Normale Bot-Chats: mehrere möglich („Allgemein“ = „Jarves-OS“, weitere „Jarves-OS · <Name>“), siehe main.js
    const gewaehlt = modus === 'normal' ? this.botChat?.(profil) : null
    const titel = modus === 'botchat' ? BOT_CHAT : gewaehlt?.titel || ZENTRALE_TITEL
    const weg = (e) => {
      if (/not found|nicht gefunden|unknown session/i.test(e.message)) return null
      throw e
    }
    let antwort = null
    let id = null
    if (gewaehlt?.session) {
      antwort = await this.rpc('session.resume', { session_id: gewaehlt.session, profile: profil }).catch(weg)
      if (antwort) id = gewaehlt.session
    }
    if (!antwort) {
      const liste = await this.rpc('session.list', { title: titel, profile: profil })
      const vorhanden = liste?.sessions?.[0]
      if (vorhanden) {
        antwort = await this.rpc('session.resume', { session_id: vorhanden.resolved_id || vorhanden.id, profile: profil }).catch(weg)
        if (antwort) id = vorhanden.resolved_id || vorhanden.id
      }
    }
    if (!antwort) {
      antwort = await this.rpc('session.create', { profile: profil, cwd: ARBEITSORDNER })
      await this.rpc('session.title', { session_id: antwort.session_id, title: titel }).catch(() => {})
    }
    b.sessionId = antwort.session_id
    b.letzterVerlauf = verlaufAus(antwort.messages)
    if (modus === 'normal') this.botChatMerken?.(profil, antwort.stored_session_id || id || null)
    this.emit('verlauf', { kanal, verlauf: b.letzterVerlauf, gewechselt: true })
  }

  // Anderen Chat eines Bots öffnen: den bisherigen schließen (bleibt gespeichert), dann den gewählten öffnen
  async botWechseln(kanal) {
    const b = this.bots.get(kanal)
    if (b?.sessionId) {
      await this.rpc('session.close', { session_id: b.sessionId }).catch(() => {})
      b.sessionId = null
    }
    return this.botOeffnen(kanal)
  }

  // „Aktualisieren“: offenes Gespräch schließen und neu aus dem gespeicherten Stand von Hermes öffnen
  // (z. B. nachdem Felix in der Hermes-App Nachrichten oder den ganzen Chat gelöscht hat). Hermes speichert jede
  // Nachricht sofort, beim Schließen geht nichts verloren. Ist der Chat gelöscht, wird er leer neu angelegt.
  async kanalNeuLaden(kanal) {
    kanal = String(kanal || '')
    if (kanal === 'zentrale') {
      if (this.sessionId) await this.rpc('session.close', { session_id: this.sessionId }).catch(() => {})
      this.sessionId = null
      return this.gespraechOeffnen(this.gemerkteSession?.() || null, this.gemerkterTitel?.() || ZENTRALE_TITEL)
    }
    if (kanal === 'crew' || kanal === `botchat:${PROFIL}`) {
      if (this.crew.sessionId) await this.rpc('session.close', { session_id: this.crew.sessionId }).catch(() => {})
      this.crew.sessionId = null
      return this.crewOeffnen()
    }
    return this.botWechseln(kanal)
  }

  // Gespeicherte Unterhaltung endgültig löschen (Hermes lehnt das ab, solange sie offen ist: dann erst schließen)
  // Geänderte Einstellungen (z. B. neuer Shopify-Token) ohne Neustart übernehmen. Nutzt nur Befehle, die Hermes
  // selbst anbietet: .env neu einlesen und die Anbindungen (MCP, darunter Shopify) neu starten. Hermes bleibt unverändert.
  async einstellungenNeuLaden() {
    await this.rpc('reload.env', {})
    const r = await this.rpc('reload.mcp', { confirm: true })
    return r?.status === 'reloaded'
  }

  async sessionLoeschen({ gespeicherteId = null, titel = '', profil = PROFIL }) {
    let id = gespeicherteId
    if (!id && titel) {
      const liste = await this.rpc('session.list', { title: titel, profile: profil })
      id = liste?.sessions?.[0]?.resolved_id || liste?.sessions?.[0]?.id || null
    }
    if (!id) return false
    const schonWeg = (e) => /not found|nicht gefunden|unknown session/i.test(e.message) // leere Chats speichert Hermes gar nicht
    try {
      await this.rpc('session.delete', { session_id: id, profile: profil })
    } catch (e) {
      if (schonWeg(e)) return true
      const offen = await this.rpc('session.active_list', { profile: profil }).catch(() => null)
      for (const s of offen?.sessions || []) {
        if (s.session_key === id || (titel && s.title === titel)) await this.rpc('session.close', { session_id: s.id }).catch(() => {})
      }
      await this.rpc('session.delete', { session_id: id, profile: profil }).catch((e2) => {
        if (!schonWeg(e2)) throw e2
      })
    }
    return true
  }

  // Rückfrage von Hermes. Freigaben zeigt Jarves-OS an; alles andere (Passwörter, Auswahlfragen …)
  // lehnt es höflich ab, dann macht Hermes weiter wie ohne Jarves-OS.
  serverAnfrage({ id, method, params = {} }) {
    const kanal = params.session_id ? this.kanalVon(params.session_id) : null
    if (method === 'approval' && kanal) {
      this.freigaben.set(id, { sessionId: params.session_id, requestId: params.request_id })
      this.rpc('approval.received', { session_id: params.session_id, request_id: params.request_id }).catch(() => {})
      this.emit('freigabe', {
        id,
        kanal,
        befehl: String(params.command || ''),
        beschreibung: String(params.description || ''),
        werkzeug: String(params.tool_name || ''),
        auswahl: Array.isArray(params.choices) ? params.choices : ['once', 'deny']
      })
      return
    }
    this.antwortSenden(id, null, { code: -32601, message: 'Jarves-OS kann diese Rückfrage nicht beantworten.' })
  }

  antwortSenden(id, ergebnis, fehler) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, ...(fehler ? { error: fehler } : { result: ergebnis }) }))
    return true
  }

  // Felix hat entschieden: once (einmal), session (für dieses Gespräch) oder deny (ablehnen)
  freigabeBeantworten(id, wahl) {
    if (!this.freigaben.has(id)) return false
    this.freigaben.delete(id)
    return this.antwortSenden(id, { choice: ['once', 'session', 'deny'].includes(wahl) ? wahl : 'deny' })
  }

  getrennt() {
    this.freigaben.clear()
    for (const { fertig, uhr } of this.offen.values()) {
      clearTimeout(uhr)
      fertig({ error: { message: 'Verbindung getrennt' } })
    }
    this.offen.clear()
    this.ws = null
    this.sessionId = null
    this.crew.sessionId = null
    for (const b of this.bots.values()) b.sessionId = null
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

  rpc(methode, parameter = {}, { timeout = RPC_TIMEOUT } = {}) {
    return new Promise((fertig, fehler) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return fehler(new Error('Keine Verbindung zu Hermes.'))
      const id = this.naechsteId++
      const uhr = setTimeout(() => {
        this.offen.delete(id)
        fehler(new Error(`Hermes antwortet nicht (${methode}).`))
      }, timeout)
      this.offen.set(id, {
        uhr,
        fertig: (d) => (d.error ? fehler(new Error(d.error.message || 'Hermes-Fehler')) : fertig(d.result))
      })
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: methode, params: parameter }))
    })
  }

  // Anfragen von vor dem Verbinden (z. B. die Crew-Liste beim Start, während Hermes noch hochfährt) warten auf den Zugang
  verbindungAbwarten(frist = START_TIMEOUT) {
    if (this.port && this.token) return Promise.resolve()
    return new Promise((fertig, fehler) => {
      const pruefen = () => {
        if (!this.port || !this.token) return
        clearTimeout(uhr)
        this.off('status', pruefen)
        fertig()
      }
      const uhr = setTimeout(() => {
        this.off('status', pruefen)
        fehler(new Error('Hermes ist noch nicht verbunden.'))
      }, frist)
      this.on('status', pruefen)
    })
  }

  async rest(pfad, optionen = {}) {
    await this.verbindungAbwarten()
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
      const liste = await this.rpc('session.list', { title: this.gemerkterTitel?.() || ZENTRALE_TITEL, profile: PROFIL })
      vorhanden = liste?.sessions?.[0] || null
      if (vorhanden) antwort = await this.rpc('session.resume', { session_id: vorhanden.resolved_id || vorhanden.id, profile: PROFIL })
    }
    if (!antwort) {
      // Noch keine (oder gelöscht/archiviert): neu anlegen und betiteln
      antwort = await this.rpc('session.create', { profile: PROFIL, cwd: ARBEITSORDNER })
      await this.rpc('session.title', { session_id: antwort.session_id, title: this.gemerkterTitel?.() || ZENTRALE_TITEL }).catch(() => {})
    }
    this.sessionId = antwort.session_id
    this.gespeicherteId = antwort.stored_session_id || vorhanden?.resolved_id || vorhanden?.id || null
    if (this.gespeicherteId) this.sessionMerken?.(this.gespeicherteId)
    this.emit('verlauf', { kanal: 'zentrale', verlauf: verlaufAus(antwort.messages) })
  }

  // Mehrere Gespräche (Themen): eine eigene Hermes-Unterhaltung pro Thema, Luzzy behält pro Thema den Faden.
  // gespeicherteId: fortsetzen; fehlt sie oder ist die Unterhaltung weg: über den Titel suchen, sonst neu anlegen.
  async gespraechOeffnen(gespeicherteId, titel) {
    let antwort = null
    let id = null // dauerhafte ID der fortgesetzten Unterhaltung (bei einer neuen: aus stored_session_id)
    const weg = (e) => {
      if (/not found|nicht gefunden|unknown session/i.test(e.message)) return null
      throw e
    }
    if (gespeicherteId) {
      antwort = await this.rpc('session.resume', { session_id: gespeicherteId, profile: PROFIL }).catch(weg)
      if (antwort) id = gespeicherteId
    }
    if (!antwort && titel) {
      const liste = await this.rpc('session.list', { title: titel, profile: PROFIL })
      const vorhanden = liste?.sessions?.[0] || null
      if (vorhanden) {
        antwort = await this.rpc('session.resume', { session_id: vorhanden.resolved_id || vorhanden.id, profile: PROFIL }).catch(weg)
        if (antwort) id = vorhanden.resolved_id || vorhanden.id
      }
    }
    if (!antwort) {
      antwort = await this.rpc('session.create', { profile: PROFIL, cwd: ARBEITSORDNER })
      if (titel) await this.rpc('session.title', { session_id: antwort.session_id, title: titel }).catch(() => {})
    }
    this.sessionId = antwort.session_id
    this.gespeicherteId = antwort.stored_session_id || id || null
    if (this.gespeicherteId) this.sessionMerken?.(this.gespeicherteId)
    this.emit('verlauf', { kanal: 'zentrale', verlauf: verlaufAus(antwort.messages), gewechselt: true })
    return this.gespeicherteId
  }

  // Crew: Luzzys fester "Bot Chat". Dort spricht sie ihre Bots an (die anderen Hermes-Profile außer „default“).
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
        if (kanal === 'crew' || kanal === `botchat:${PROFIL}`) {
          if (!this.crew.sessionId) await this.crewOeffnen()
          return await this.rpc('prompt.submit', { session_id: this.crew.sessionId, text })
        }
        if (kanal !== 'zentrale') {
          if (!this.bots.get(kanal)?.sessionId) await this.botOeffnen(kanal)
          return await this.rpc('prompt.submit', { session_id: this.bots.get(kanal).sessionId, text })
        }
        if (!this.sessionId) await this.luzzyOeffnen()
        return await this.rpc('prompt.submit', { session_id: this.sessionId, text })
      } catch (e) {
        if (versuch === 1 || this.zustand !== 'bereit') throw e
        // Session weg: einmal neu öffnen
        if (kanal === 'crew') this.crew.sessionId = null
        else if (this.bots.has(kanal)) this.bots.get(kanal).sessionId = null
        else this.sessionId = null
      }
    }
  }

  // ── Anhänge: Datei oder Bild an Luzzy (Idee 25) ──
  // Hermes legt sie für die nächste Nachricht bereit. Bilder als Bild, PDFs Seite für Seite als Bilder,
  // alles andere als Datei im Arbeitsbereich (dann kommt ein Verweis in den Text).
  // Anhänge gehen an das Gespräch des Kanals, in dem Felix gerade schreibt (Zentrale, Crew, ein Bot)
  async anhangSitzung(kanal) {
    if (kanal === 'zentrale' && !this.sessionId) await this.luzzyOeffnen()
    const id = this.sessionIdVon(kanal)
    if (!id) throw new Error('Dieses Gespräch ist noch nicht offen. Schreib einmal etwas oder wechsle kurz hin und her.')
    return id
  }

  async anhangHinzufuegen(pfad, kanal = 'zentrale') {
    const endung = path.extname(pfad).toLowerCase()
    const session_id = await this.anhangSitzung(kanal)
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(endung)) {
      const r = await this.rpc('image.attach', { session_id, path: pfad })
      if (!r?.attached) throw new Error(r?.message || 'Das Bild ließ sich nicht anhängen.')
      return { art: 'bild', name: r.name || path.basename(pfad), text: '' }
    }
    if (endung === '.pdf') {
      const r = await this.rpc('pdf.attach', { session_id, path: pfad })
      if (!r?.attached) throw new Error('Das PDF ließ sich nicht anhängen.')
      return { art: 'pdf', name: r.filename || path.basename(pfad), text: '', seiten: r.pages_attached }
    }
    const r = await this.rpc('file.attach', { session_id, path: pfad })
    if (!r?.attached) throw new Error('Die Datei ließ sich nicht anhängen.')
    return { art: 'datei', name: r.name || path.basename(pfad), text: r.ref_text || '' }
  }

  // Eingefügtes Bild (Strg+V) ohne Datei auf der Platte
  async bildHinzufuegen(base64, name = 'bild.png', kanal = 'zentrale') {
    const session_id = await this.anhangSitzung(kanal)
    const r = await this.rpc('image.attach_bytes', { session_id, content_base64: base64, filename: name })
    if (!r?.attached) throw new Error(r?.message || 'Das Bild ließ sich nicht anhängen.')
    return { art: 'bild', name: r.name || name, text: '' }
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
    // Profil ausdrücklich mitgeben: dockt Jarves-OS an ein Hermes der Hermes-App an, läuft das evtl. mit einem
    // anderen Profil, in dem „Hey Luzzy“ nicht eingerichtet ist
    const antwort = await this.rpc('wake.start', { surface: 'tui', session_id: this.sessionId || '', profile: PROFIL })
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
    const id = this.sessionIdVon(kanal)
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
