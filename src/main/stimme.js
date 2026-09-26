// Luzzys Stimme: Microsoft-Edge-Neural-Stimmen, direkt aus Node erzeugt.
// Unabhängig von Hermes' Stimmen-Einstellungen. Nur der vorzulesende Text geht an Microsoft.

const WebSocket = require('ws')
const { createHash, randomBytes, randomUUID } = require('node:crypto')

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM = '143.0.3650.75'
const WIN_EPOCH = 11644473600
const TIMEOUT = 30000

const STIMMEN = [
  { id: 'de-AT-IngridNeural', name: 'Ingrid', herkunft: 'Österreich' },
  { id: 'de-CH-LeniNeural', name: 'Leni', herkunft: 'Schweiz' },
  { id: 'de-DE-SeraphinaMultilingualNeural', name: 'Seraphina', herkunft: 'Deutschland' },
  { id: 'de-DE-KatjaNeural', name: 'Katja', herkunft: 'Deutschland' },
  { id: 'de-DE-AmalaNeural', name: 'Amala', herkunft: 'Deutschland' }
]

function secMsGec() {
  let t = Date.now() / 1000 + WIN_EPOCH
  t -= t % 300
  return createHash('sha256').update(`${(t * 1e7).toFixed(0)}${TOKEN}`, 'ascii').digest('hex').toUpperCase()
}

const zeitstempel = () => new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)')
const neueId = () => randomUUID().replaceAll('-', '')
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const erlaubt = (wert, muster, standard) => (muster.test(String(wert || '')) ? wert : standard)

function sprechen(text, { stimme, tempo, hoehe } = {}) {
  const stimmeId = STIMMEN.some((s) => s.id === stimme) ? stimme : STIMMEN[0].id
  const rate = erlaubt(tempo, /^[+-]\d{1,2}%$/, '+0%')
  const pitch = erlaubt(hoehe, /^[+-]\d{1,2}Hz$/, '+0Hz')
  return new Promise((fertig, fehler) => {
    const major = CHROMIUM.split('.')[0]
    const url =
      'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
      `?TrustedClientToken=${TOKEN}&ConnectionId=${neueId()}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM}`
    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: `muid=${randomBytes(16).toString('hex').toUpperCase()};`
      }
    })
    const teile = []
    const uhr = setTimeout(() => {
      ws.terminate()
      fehler(new Error('Stimme: keine Antwort vom Vorlesedienst.'))
    }, TIMEOUT)
    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${zeitstempel()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
          '"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}\r\n'
      )
      const ssml =
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
        `<voice name='${stimmeId}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${xml(text)}</prosody></voice></speak>`
      ws.send(`X-RequestId:${neueId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${zeitstempel()}Z\r\nPath:ssml\r\n\r\n${ssml}`)
    })
    ws.on('message', (daten, binaer) => {
      if (!binaer) {
        if (String(daten).includes('Path:turn.end')) {
          clearTimeout(uhr)
          ws.close()
          teile.length ? fertig(Buffer.concat(teile)) : fehler(new Error('Stimme: keine Audiodaten erhalten.'))
        }
        return
      }
      const kopfLaenge = daten.readUInt16BE(0)
      const kopf = daten.subarray(2, 2 + kopfLaenge).toString()
      if (kopf.includes('Path:audio') && kopf.includes('Content-Type:audio/mpeg')) teile.push(daten.subarray(2 + kopfLaenge))
    })
    ws.on('unexpected-response', (_anfrage, antwort) => {
      clearTimeout(uhr)
      fehler(new Error(`Stimme: Vorlesedienst meldet ${antwort.statusCode}.`))
    })
    ws.on('error', (e) => {
      clearTimeout(uhr)
      fehler(new Error(`Stimme: ${e.message}`))
    })
  })
}

module.exports = { sprechen, STIMMEN }
