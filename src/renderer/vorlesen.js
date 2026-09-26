// Vorlesen: Text aufbereiten und pro Antwort eine Audiodatei abspielen.
// Die Lautstärke wird gemessen und an Reaktor und Welle gemeldet.

const MAX_ZEICHEN = 900

export function fuersVorlesen(text) {
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
    .trim()
  if (s.length > MAX_ZEICHEN) {
    // Lange Antworten: nur der Anfang, ganze Sätze
    const schnitt = s.slice(0, MAX_ZEICHEN)
    const ende = Math.max(schnitt.lastIndexOf('. '), schnitt.lastIndexOf('! '), schnitt.lastIndexOf('? '))
    s = `${schnitt.slice(0, ende > 200 ? ende + 1 : MAX_ZEICHEN)} Den Rest hab ich dir unten hingeschrieben.`
  }
  return s
}

export function vorleserErstellen({ beiStart, beiEnde, beiPegel, beiFehler }) {
  let lauf = 0
  let audio = null
  let kontext = null
  let analyse = null
  let animation = 0

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
      animation = requestAnimationFrame(schritt)
    }
    cancelAnimationFrame(animation)
    schritt()
  }

  function abspielen(url, meinLauf) {
    return new Promise((fertig) => {
      if (meinLauf !== lauf) return fertig()
      audio = new Audio(url)
      try {
        kontext ??= new AudioContext()
        const quelle = kontext.createMediaElementSource(audio)
        analyse = kontext.createAnalyser()
        analyse.fftSize = 256
        quelle.connect(analyse)
        analyse.connect(kontext.destination)
        pegelMessen()
      } catch {
        // ohne Pegelanzeige weiter
      }
      audio.onended = audio.onerror = () => fertig()
      audio.play().catch(() => fertig())
    })
  }

  function stoppen() {
    lauf++
    if (audio) audio.pause()
    audio = null
    cancelAnimationFrame(animation)
    beiPegel(null, 0)
  }

  async function sprechen(text, optionen) {
    const sauber = fuersVorlesen(text)
    if (!sauber) return
    stoppen()
    const meinLauf = lauf
    beiStart()
    try {
      const bytes = await window.jarves.stimme.sprechen(sauber, optionen)
      if (meinLauf !== lauf) return
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      try {
        await abspielen(url, meinLauf)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      if (meinLauf === lauf) beiFehler(e)
    } finally {
      if (meinLauf === lauf) {
        cancelAnimationFrame(animation)
        beiPegel(null, 0)
        beiEnde()
      }
    }
  }

  return { sprechen, stoppen }
}
