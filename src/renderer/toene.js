// Töne für Meldungen, direkt hier erzeugt (keine Tondateien nötig).
// horn: neue Bestellung · warnung: Probleme · glocke: alles andere (Mail, Termin, Crew …)

const DAUER = { horn: 1500, warnung: 650, glocke: 700, wecker: 1500 } // ms, danach darf Luzzy sprechen
const WICHTIG = ['horn', 'warnung', 'glocke'] // bei mehreren Meldungen auf einmal spielt nur der wichtigste Ton

export function tonFuer(art) {
  if (art === 'bestellung' || art === 'meilenstein') return 'horn'
  if (art === 'job' || art === 'hinweis' || art === 'kosten') return 'warnung'
  return 'glocke'
}

export function wichtigsterTon(arten) {
  const toene = arten.map(tonFuer)
  return WICHTIG.find((t) => toene.includes(t)) || null
}

let kontext = null

// Spielt den Ton und wartet, bis er verklungen ist
export async function tonSpielen(name) {
  if (!DAUER[name]) return
  try {
    kontext ??= new AudioContext()
    if (kontext.state === 'suspended') await kontext.resume()
    const t = kontext.currentTime + 0.02
    if (name === 'horn') horn(kontext, t)
    else if (name === 'warnung') warnung(kontext, t)
    else if (name === 'wecker') wecker(kontext, t)
    else glocke(kontext, t)
  } catch {
    return // ohne Ton weiter
  }
  await new Promise((r) => setTimeout(r, DAUER[name]))
}

// Tiefes Wikingerhorn: zwei leicht verstimmte Sägezähne, gleitet von A2 nach D3 hoch, weich gefiltert
function horn(ctx, t) {
  const laut = ctx.createGain()
  laut.gain.setValueAtTime(0.0001, t)
  laut.gain.exponentialRampToValueAtTime(0.16, t + 0.25)
  laut.gain.setValueAtTime(0.16, t + 0.95)
  laut.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(500, t)
  filter.frequency.linearRampToValueAtTime(1100, t + 0.3)
  filter.Q.value = 1
  filter.connect(laut).connect(ctx.destination)
  // leichtes Vibrato wie beim echten Blasen
  const vibrato = ctx.createOscillator()
  const tiefe = ctx.createGain()
  vibrato.frequency.value = 5
  tiefe.gain.value = 1.5
  vibrato.connect(tiefe)
  for (const verstimmt of [0, 4]) {
    const osz = ctx.createOscillator()
    osz.type = 'sawtooth'
    osz.detune.value = verstimmt
    osz.frequency.setValueAtTime(110, t)
    osz.frequency.exponentialRampToValueAtTime(146.8, t + 0.28)
    tiefe.connect(osz.frequency)
    osz.connect(filter)
    osz.start(t)
    osz.stop(t + 1.45)
  }
  vibrato.start(t)
  vibrato.stop(t + 1.45)
}

// Zwei fallende Töne: „Achtung“
function warnung(ctx, t) {
  for (const [frequenz, start] of [[494, 0], [370, 0.28]]) {
    const osz = ctx.createOscillator()
    const laut = ctx.createGain()
    osz.type = 'triangle'
    osz.frequency.value = frequenz
    laut.gain.setValueAtTime(0.0001, t + start)
    laut.gain.exponentialRampToValueAtTime(0.14, t + start + 0.02)
    laut.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.26)
    osz.connect(laut).connect(ctx.destination)
    osz.start(t + start)
    osz.stop(t + start + 0.3)
  }
}

// Timer/Wecker: dreimal zwei kurze helle Töne (unverwechselbar mit Meldungen)
function wecker(ctx, t) {
  for (let i = 0; i < 6; i++) {
    const start = Math.floor(i / 2) * 0.5 + (i % 2) * 0.14
    const osz = ctx.createOscillator()
    const laut = ctx.createGain()
    osz.type = 'square'
    osz.frequency.value = 1046
    laut.gain.setValueAtTime(0.0001, t + start)
    laut.gain.exponentialRampToValueAtTime(0.07, t + start + 0.01)
    laut.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.1)
    osz.connect(laut).connect(ctx.destination)
    osz.start(t + start)
    osz.stop(t + start + 0.12)
  }
}

// Heller, kurzer Glockenton mit Oberton
function glocke(ctx, t) {
  for (const [frequenz, staerke] of [[880, 0.1], [1320, 0.035]]) {
    const osz = ctx.createOscillator()
    const laut = ctx.createGain()
    osz.frequency.value = frequenz
    laut.gain.setValueAtTime(0.0001, t)
    laut.gain.exponentialRampToValueAtTime(staerke, t + 0.01)
    laut.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osz.connect(laut).connect(ctx.destination)
    osz.start(t)
    osz.stop(t + 0.65)
  }
}
