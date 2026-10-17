// Mikrofon: Aufnahme mit Stille-Erkennung, Ton fürs Aktivierungswort, Umgang mit fehlendem Mikrofon.
//
// Ablauf Sprechen: aufnehmen() → nimmt auf, bis nach dem Sprechen ~1,3 s Stille ist (oder stoppen())
// → gibt den Ton (webm/opus) zurück. Hört es gar keine Sprache, kommt null zurück.
// Aktivierungswort: solange wakeAn, gehen 100-ms-Stücke (16 kHz) an beiPcm.

const STILLE_NACH_SPRACHE = 1300 // ms
const MAX_AUFNAHME = 45000 // ms
const SPRACH_SCHWELLE = 0.018 // RMS ab der es als Sprache zählt
const REINREDEN_SCHWELLE = 0.02 // Reinreden, während Luzzy spricht: mindestens so laut wie normale Sprache
const REINREDEN_TREFFER = 5 // × 50 ms, damit ein Huster oder Klopfen nicht reicht

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

  // Reinreden, während Luzzy spricht. Was von ihrer eigenen Stimme im Mikrofon ankommt, hängt davon ab, wie laut
  // sie gerade spielt (ausgabe(), 0 … 1). Vendo lernt dieses Verhältnis laufend und meldet beiSprache nur,
  // wenn deutlich mehr ankommt, als ihr Echo erklärt, gut 0,25 s lang. Gibt eine Funktion zum Beenden zurück.
  function reinreden({ beiSprache, ausgabe = () => 0 }) {
    let aus = false
    let uhr = 0
    let echo = 0 // Mikrofon ÷ Ausgabe: wie viel von Luzzy im Mikrofon landet
    let rauschen = 0.004 // Grundrauschen im Raum, wenn Luzzy gerade still ist
    let treffer = 0
    const zuletzt = [] // Luzzys Lautstärke der letzten 0,4 s (ihr Ton kommt verzögert im Mikrofon an)
    const start = performance.now()
    const pruefen = () => {
      if (aus) return
      if (!aufnahme && analyse) {
        const m = pegel()
        zuletzt.push(ausgabe())
        if (zuletzt.length > 8) zuletzt.shift()
        const o = Math.max(...zuletzt)
        const schwelle = Math.max(REINREDEN_SCHWELLE, rauschen * 4, echo * o * 3)
        if (performance.now() - start > 400 && m > schwelle) {
          treffer++
          if (treffer >= REINREDEN_TREFFER) {
            aus = true
            return beiSprache()
          }
        } else {
          treffer = Math.max(0, treffer - 1) // ein kurzer Einbruch zwischen zwei Silben zählt nicht
          if (o > 0.01) echo = echo ? echo * 0.96 + (m / o) * 0.04 : m / o // lernt Luzzys Echo
          else rauschen = rauschen * 0.95 + m * 0.05
        }
      }
      uhr = setTimeout(pruefen, 50)
    }
    starten().then((ok) => ok && pruefen())
    return () => {
      aus = true
      clearTimeout(uhr)
    }
  }

  return {
    starten,
    aufnehmen,
    reinreden,
    stoppen: () => aufnahme?.stoppen(),
    abbrechen: () => aufnahme?.abbrechen(),
    nimmtAuf: () => Boolean(aufnahme),
    wakeSetzen: (an) => (wakeAn = an),
    zustand: () => zustand
  }
}
