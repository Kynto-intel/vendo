// Brücke für Luzzys PC-Werkzeug (Hermes-Plugin jarves-pc in profiles\donnerwolf\plugins\jarves-pc):
// Luzzy entscheidet selbst, was sie am PC tun soll, und ruft pc_steuern auf. Das Plugin schickt die Aktion hierher,
// ausgeführt wird sie wie bei der Oberfläche über pc.js (dort wird jede Aktion geprüft).
// Nur 127.0.0.1, mit Zufallsschlüssel. Adresse und Schlüssel stehen, solange Jarves-OS läuft, in
// %APPDATA%\jarves-os\pc-bruecke.json; beim Beenden wird die Datei gelöscht.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app } = require('electron')
const pc = require('./pc')

const ARTEN = new Set(['programm', 'web', 'taste', 'lautstaerke', 'ordner', 'sperren'])
let server = null
let datei = null

function starten(melden = () => {}) {
  if (server) return
  const schluessel = crypto.randomBytes(24).toString('hex')
  datei = path.join(app.getPath('userData'), 'pc-bruecke.json')
  server = http.createServer((anfrage, antwort) => {
    const senden = (status, daten) => {
      antwort.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      antwort.end(JSON.stringify(daten))
    }
    const kopf = String(anfrage.headers['x-jarves-schluessel'] || '')
    const gleich = kopf.length === schluessel.length && crypto.timingSafeEqual(Buffer.from(kopf), Buffer.from(schluessel))
    if (anfrage.method !== 'POST' || anfrage.url !== '/aktion' || !gleich) return senden(403, { fehler: 'Nicht erlaubt.' })
    let text = ''
    anfrage.on('data', (teil) => {
      text += teil
      if (text.length > 4000) anfrage.destroy()
    })
    anfrage.on('end', async () => {
      try {
        const a = JSON.parse(text || '{}')
        if (!a || typeof a !== 'object' || !ARTEN.has(a.art)) return senden(400, { fehler: 'Unbekannte Aktion.' })
        const ergebnis = await pc.aktion(a)
        melden(a, ergebnis)
        senden(200, ergebnis || { ok: true })
      } catch (e) {
        senden(500, { fehler: String(e.message || e).slice(0, 300) })
      }
    })
  })
  server.listen(0, '127.0.0.1', () => {
    fs.mkdirSync(path.dirname(datei), { recursive: true })
    fs.writeFileSync(datei, JSON.stringify({ port: server.address().port, schluessel, pid: process.pid }), 'utf8')
  })
}

function beenden() {
  try {
    if (datei) fs.rmSync(datei, { force: true })
  } catch {
    // egal
  }
  server?.close()
  server = null
}

module.exports = { starten, beenden }
