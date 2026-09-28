// Vorlesen: Text aufbereiten und abspielen. Die Lautstärke wird gemessen und an Reaktor und Welle gemeldet.
//   sprechen(text)  ganzer Text auf einmal (Begrüßung, Meldungen, eigene Antworten von Jarves-OS)
//   strom()         Luzzys Antwort Satz für Satz, während sie noch schreibt (siehe satzStuecke)

const MAX_ZEICHEN = 900

export function fuersVorlesen(text, { kuerzen = true } = {}) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*~]/g, '')
    .replace(/[#>|_]/g, ' ')
    .replace(/([.!?:;,])[ \t]*\n+\s*/g, '$1 ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,!?:;])/g, '$1')
    .replace(/^[\s.,;:!?]+/, '') // kein Satzzeichen am Anfang (z. B. nach entferntem Code-Block)
    .trim()
  if (kuerzen && s.length > MAX_ZEICHEN) {
    // Lange Antworten: nur der Anfang, ganze Sätze
    const schnitt = s.slice(0, MAX_ZEICHEN)
    const ende = Math.max(schnitt.lastIndexOf('. '), schnitt.lastIndexOf('! '), schnitt.lastIndexOf('? '))
    s = `${schnitt.slice(0, ende > 200 ? ende + 1 : MAX_ZEICHEN)} Den Rest hab ich dir unten hingeschrieben.`
  }
  return s
}

// Pocket TTS liefert WAV: das Tempo gilt über die Abspielgeschwindigkeit (Tonhöhe bleibt gleich)
function tonQuelle(bytes, optionen) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const wav = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 // "RIFF"
  const prozent = Number(String(optionen?.tempo || '').replace('%', '')) || 0
  const laut = Number(optionen?.lautstaerke) || 250 // Prozent
  return {
    url: URL.createObjectURL(new Blob([b], { type: wav ? 'audio/wav' : 'audio/mpeg' })),
    tempo: wav ? Math.min(1.5, Math.max(0.7, 1 + prozent / 100)) : 1,
    lautstaerke: Math.min(5, Math.max(0.5, laut / 100))
  }
}

export function vorleserErstellen({ beiStart, beiEnde, beiPegel, beiFehler, beiAbbruch = () => {} }) {
  let lauf = 0
  let tonAn = false // hat beiStart gemeldet, beiEnde/beiAbbruch noch nicht
  let audio = null
  let kontext = null
  let analyse = null
  let animation = null
  // Im Mini-Modus ist das große Fenster versteckt, dort gibt es keine Bildschirm-Frames: dann per Timer weiter
  const naechsterFrame = (fn) => (document.hidden ? { t: setTimeout(fn, 33) } : { r: requestAnimationFrame(fn) })
  const animationStopp = () => {
    if (animation?.t) clearTimeout(animation.t)
    if (animation?.r) cancelAnimationFrame(animation.r)
    animation = null
  }
  let pausiert = false // Felix redet vielleicht rein: kurz anhalten, bis klar ist, ob er etwas gesagt hat
  let weiterNachPause = []
  let angehalten = null

  function pegelMessen() {
    if (!analyse) return
    const daten = new Uint8Array(analyse.frequencyBinCount)
    const schritt = () => {
      analyse.getByteFrequencyData(daten)
      const werte = []
      const gruppen = 24
      const breite = Math.floor(daten.length / gruppen)
      for (let g = 0; g < gruppen; g++) {
        let summe = 0
        for (let i = 0; i < breite; i++) summe += daten[g * breite + i]
        werte.push(Math.min(1, summe / breite / 180))
      }
      beiPegel(werte, werte.reduce((a, b) => a + b, 0) / werte.length)
      animation = naechsterFrame(schritt)
    }
    animationStopp()
    schritt()
  }

  function abspielen(url, meinLauf, tempo = 1, lautstaerke = 1) {
    return new Promise((fertig) => {
      if (meinLauf !== lauf) return fertig()
      audio = new Audio(url)
      audio.playbackRate = tempo // Tonhöhe bleibt dabei gleich
      try {
        kontext ??= new AudioContext()
        const quelle = kontext.createMediaElementSource(audio)
        // Lauter machen (Pocket TTS ist leise) und oben begrenzen, damit es nicht übersteuert
        const verstaerker = kontext.createGain()
        verstaerker.gain.value = lautstaerke
        const begrenzer = kontext.createDynamicsCompressor()
        begrenzer.threshold.value = -3
        begrenzer.knee.value = 0
        begrenzer.ratio.value = 20
        begrenzer.attack.value = 0.002
        begrenzer.release.value = 0.1
        analyse = kontext.createAnalyser()
        analyse.fftSize = 256
        quelle.connect(verstaerker)
        verstaerker.connect(begrenzer)
        begrenzer.connect(analyse)
        analyse.connect(kontext.destination)
        pegelMessen()
      } catch {
        // ohne Pegelanzeige weiter
      }
      audio.onended = audio.onerror = () => fertig()
      audio.play().catch(() => fertig())
    })
  }

  const start = () => {
    tonAn = true
    beiStart()
  }
  const ende = () => {
    tonAn = false
    beiEnde()
  }
  // Kurz anhalten (Felix redet vielleicht rein) und genau dort weitermachen
  function pausieren() {
    if (!tonAn || pausiert) return
    pausiert = true
    angehalten = audio && !audio.paused && !audio.ended ? audio : null // nur das, was gerade wirklich spielt
    angehalten?.pause()
  }
  function fortsetzen() {
    if (!pausiert) return
    pausiert = false
    angehalten?.play().catch(() => {})
    angehalten = null
    for (const weiter of weiterNachPause.splice(0)) weiter()
  }
  const pauseAbwarten = () => (pausiert ? new Promise((r) => weiterNachPause.push(r)) : null)

  // Wie laut Luzzy gerade aus den Lautsprechern kommt (0 … 1), damit das Mikrofon ihr Echo erkennt
  function ausgabePegel() {
    if (!analyse || !tonAn || pausiert) return 0
    const daten = new Float32Array(analyse.fftSize)
    analyse.getFloatTimeDomainData(daten)
    let summe = 0
    for (const w of daten) summe += w * w
    return Math.sqrt(summe / daten.length)
  }

  function stoppen() {
    lauf++
    pausiert = false
    angehalten = null
    for (const weiter of weiterNachPause.splice(0)) weiter()
    if (audio) audio.pause()
    audio = null
    animationStopp()
    beiPegel(null, 0)
    // Mitten im Sprechen abgebrochen: melden, damit Jarves-OS weiß, dass Luzzy nicht mehr spricht
    if (tonAn) {
      tonAn = false
      beiAbbruch()
    }
  }

  async function sprechen(text, optionen) {
    const sauber = fuersVorlesen(text)
    if (!sauber) return
    stoppen()
    const meinLauf = lauf
    start()
    try {
      const bytes = await window.jarves.stimme.sprechen(sauber, optionen)
      if (meinLauf !== lauf) return
      await pauseAbwarten()
      if (meinLauf !== lauf) return
      const { url, tempo, lautstaerke } = tonQuelle(bytes, optionen)
      try {
        await abspielen(url, meinLauf, tempo, lautstaerke)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      if (meinLauf === lauf) beiFehler(e)
    } finally {
      if (meinLauf === lauf) {
        animationStopp()
        beiPegel(null, 0)
        ende()
      }
    }
  }

  // Vorlesen, während Luzzy noch schreibt: Stücke kommen nach und nach (stueck), jedes wird erzeugt, sobald das
  // vorige spielt (einer im Voraus), und direkt nacheinander abgespielt. ende(): es kommt nichts mehr.
  function strom(optionen) {
    stoppen()
    const meinLauf = lauf
    const schlange = [] // { text, bytes: Promise | null }
    let fertig = false
    let laeuft = false
    let gestartet = false
    let wecken = null
    const erzeugen = (eintrag) => {
      if (eintrag && !eintrag.bytes) {
        eintrag.bytes = window.jarves.stimme.sprechen(eintrag.text, optionen)
        eintrag.bytes.catch(() => {}) // Fehler wird beim Abspielen gemeldet
      }
    }
    async function abarbeiten() {
      if (laeuft) return
      laeuft = true
      try {
        while (meinLauf === lauf) {
          if (!schlange.length) {
            if (fertig) break
            await new Promise((r) => (wecken = r))
            continue
          }
          const eintrag = schlange.shift()
          erzeugen(eintrag)
          erzeugen(schlange[0]) // das nächste lädt schon
          let bytes
          try {
            bytes = await eintrag.bytes
          } catch (e) {
            if (meinLauf === lauf) beiFehler(e)
            continue
          }
          if (meinLauf !== lauf) return
          await pauseAbwarten()
          if (meinLauf !== lauf) return
          if (!gestartet) {
            gestartet = true
            start()
          }
          const { url, tempo, lautstaerke } = tonQuelle(bytes, optionen)
          try {
            await abspielen(url, meinLauf, tempo, lautstaerke)
          } finally {
            URL.revokeObjectURL(url)
          }
        }
      } finally {
        laeuft = false
        if (meinLauf === lauf && fertig && !schlange.length) {
          animationStopp()
          beiPegel(null, 0)
          ende()
        }
      }
    }
    const weiter = () => {
      wecken?.()
      wecken = null
      abarbeiten()
    }
    return {
      stueck(text) {
        const sauber = fuersVorlesen(text, { kuerzen: false })
        if (!sauber || meinLauf !== lauf || fertig) return 0
        schlange.push({ text: sauber, bytes: null })
        erzeugen(schlange[0]) // das nächste Stück lädt schon, während das aktuelle noch spielt
        weiter()
        return sauber.length
      },
      ende() {
        fertig = true
        weiter()
      },
      aktiv: () => meinLauf === lauf
    }
  }

  return { sprechen, stoppen, strom, pausieren, fortsetzen, pausiert: () => pausiert, ausgabePegel }
}

// Aus dem bisher geschriebenen Text das nächste sprechbare Stück schneiden: bis zum letzten Satzende
// (. ! ? : oder Zeilenende), nicht mitten in Code-Blöcken, nicht nach „z. B.“, „ca.“ oder „1.“.
// Liefert { stueck, bis } oder null (noch zu wenig oder mitten im Satz). schluss: alles, was noch übrig ist.
const ABKUERZUNG = /(?:^|[\s(])(?:z|B|u|a|d|h|o|ca|bzw|usw|etc|Nr|Str|Dr|Hr|Fr|evtl|inkl|ggf|vgl|bspw|max|min|ggü|Tel|\d+)\.$/
export function satzStueck(roh, von, { schluss = false, mindestens = 60 } = {}) {
  const rest = roh.slice(von)
  if (!rest.trim()) return null
  if (schluss) return { stueck: rest, bis: roh.length }
  let bestes = -1
  const grenze = /[.!?:](?=\s)|\n/g
  let t
  while ((t = grenze.exec(rest))) {
    const ende = t.index + 1
    if (ende < mindestens) continue
    const davor = rest.slice(0, ende)
    if ((davor.match(/```/g) || []).length % 2) continue // mitten in einem Code-Block
    if (t[0] === '.' && ABKUERZUNG.test(davor)) continue
    bestes = ende
  }
  return bestes < 0 ? null : { stueck: rest.slice(0, bestes), bis: von + bestes }
}
