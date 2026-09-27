// Mikrofon: Aufnahme mit Stille-Erkennung, Ton fürs Aktivierungswort, Umgang mit fehlendem Mikrofon.
//
// Ablauf Sprechen: aufnehmen() → nimmt auf, bis nach dem Sprechen ~1,3 s Stille ist (oder stoppen())
// → gibt den Ton (webm/opus) zurück. Hört es gar keine Sprache, kommt null zurück.
// Aktivierungswort: solange wakeAn, gehen 100-ms-Stücke (16 kHz) an beiPcm.

const STILLE_NACH_SPRACHE = 1300 // ms
const MAX_AUFNAHME = 45000 // ms
const SPRACH_SCHWELLE = 0.018 // RMS ab der es als Sprache zählt

export function mikrofonErstellen({ beiZustand, beiPegel, beiPcm }) {
  let strom = null
  let kontext = null
  let analyse = null
  let wakeKnoten = null
  let wakeAn = false
  let startenPromise = null
  let aufnahme = null // { recorder, teile, fertig, abbrechen }
  let zustand = 'aus' // aus | bereit | kein-mikrofon | verweigert | nimmt-auf

  function setzen(z, text = '') {
    zustand = z
    beiZustand(z, text)
  }

  function starten() {
    if (strom) return Promise.resolve(true)
    if (startenPromise) return startenPromise
    startenPromise = (async () => {
      try {
        strom = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
      } catch (e) {
        strom = null
        if (e.name === 'NotAllowedError') setzen('verweigert', 'Mikrofon-Zugriff verweigert.')
        else setzen('kein-mikrofon', 'Kein Mikrofon gefunden.')
        return false
      }
      try {
        strom.getAudioTracks()[0].addEventListener('ended', () => {
          stoppenAlles()
          setzen('kein-mikrofon', 'Mikrofon getrennt.')
        })
        const audioKontext = new AudioContext({ sampleRate: 16000 })
        kontext = audioKontext
        const quelle = audioKontext.createMediaStreamSource(strom)
        analyse = audioKontext.createAnalyser()
        analyse.fftSize = 1024
        quelle.connect(analyse)
        await audioKontext.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url))
        wakeKnoten = new AudioWorkletNode(audioKontext, 'pcm-sammler')
        wakeKnoten.port.onmessage = (e) => {
          if (wakeAn && !aufnahme) beiPcm(new Uint8Array(e.data))
        }
        quelle.connect(wakeKnoten)
        setzen('bereit')
        return true
      } catch (e) {
        stoppenAlles()
        setzen('kein-mikrofon', `Mikrofon konnte nicht gestartet werden: ${e.message}`)
        return false
      }
    })().finally(() => {
      startenPromise = null
    })
    return startenPromise
  }

  function stoppenAlles() {
    if (aufnahme) aufnahme.abbrechen()
    strom?.getTracks().forEach((t) => t.stop())
    kontext?.close().catch(() => {})
    strom = null
    kontext = null
    analyse = null
    wakeKnoten = null
  }

  function pegel() {
    if (!analyse) return 0
    const daten = new Float32Array(analyse.fftSize)
    analyse.getFloatTimeDomainData(daten)
    let summe = 0
    for (const s of daten) summe += s * s
    return Math.sqrt(summe / daten.length)
  }

  // Nimmt eine Äußerung auf. ohneSpracheNach: so lange wird auf den Anfang gewartet (ms).
  // Diktat: stilleNach (Pause, die das Ende bedeutet) und maxDauer länger.
  async function aufnehmen({ ohneSpracheNach = 7000, stilleNach = STILLE_NACH_SPRACHE, maxDauer = MAX_AUFNAHME } = {}) {
    if (aufnahme) return null
    if (!(await starten())) return null
    return new Promise((fertig) => {
      const recorder = new MediaRecorder(strom, { mimeType: 'audio/webm;codecs=opus' })
      const teile = []
      let gesprochen = false
      let stilleSeit = null
      let beendet = false
      const start = performance.now()
      let uhr = 0

      const schluss = (mitErgebnis) => {
        if (beendet) return
        beendet = true
        clearTimeout(uhr)
        beiPegel(0)
        recorder.onstop = () => {
          aufnahme = null
          setzen('bereit')
          if (!mitErgebnis || !gesprochen || !teile.length) return fertig(null)
          new Blob(teile, { type: 'audio/webm' }).arrayBuffer().then((b) => fertig({ bytes: new Uint8Array(b), mime: 'audio/webm' }))
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop()
      }

      const pruefen = () => {
        const p = pegel()
        beiPegel(Math.min(1, p * 12))
        const jetzt = performance.now()
        if (p > SPRACH_SCHWELLE) {
          gesprochen = true
          stilleSeit = null
        } else if (gesprochen) {
          stilleSeit ??= jetzt
          if (jetzt - stilleSeit > stilleNach) return schluss(true)
        } else if (jetzt - start > ohneSpracheNach) return schluss(false)
        if (jetzt - start > maxDauer) return schluss(true)
        uhr = setTimeout(pruefen, 60)
      }

      recorder.ondataavailable = (e) => e.data.size && teile.push(e.data)
      recorder.start(250)
      aufnahme = { stoppen: () => schluss(true), abbrechen: () => schluss(false) }
      setzen('nimmt-auf')
      pruefen()
    })
  }

  return {
    starten,
    aufnehmen,
    stoppen: () => aufnahme?.stoppen(),
    abbrechen: () => aufnahme?.abbrechen(),
    nimmtAuf: () => Boolean(aufnahme),
    wakeSetzen: (an) => (wakeAn = an),
    zustand: () => zustand
  }
}
