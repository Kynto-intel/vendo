// Fokus-Plugin: Pomodoro-Timer (Fokus, kurze Pause, nach 4 Runden lange Pause) mit Hintergrundklang.
// In der Fokuszeit ist „Nicht stören“ an: Meldungen landen nur in der Liste. Timer und Wecker klingeln trotzdem.
// Per Sprache: „Fokus“, „Fokus 50 Minuten“, „Pomodoro starten“, „Fokus beenden“, „Fokus pausieren“, „Weiter mit Fokus“.
// Einstellungen in daten/plugins/fokus.json: { fokus, pause, langePause, runden, klang, lautstaerke }

import { tonSpielen } from '../../src/renderer/toene.js'

const STANDARD = { fokus: 25, pause: 5, langePause: 15, runden: 4, klang: 'aus', lautstaerke: 0.35 }
const KLAENGE = { aus: 'Kein Klang', braun: 'Rauschen (tief)', regen: 'Regen' }
const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')
const zwei = (n) => String(n).padStart(2, '0')
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${zwei(Math.floor(s / 60))}:${zwei(s % 60)}` }

// „Fokus“, „Fokuszeit starten“, „Pomodoro“, „Fokus 50 Minuten“, „Ich will mich konzentrieren“
const START = /^(?:(?:starte?|mach)\s+)?(?:(?:den|die|eine[n]?)\s+)?(?:fokus(?:zeit|modus|-?timer)?|pomodoro|konzentrationszeit)(?:\s+(?:starten|an|bitte))?(?:\s+(?:für\s+)?(\d{1,3})\s+minuten)?$|^ich (?:will|muss|möchte) mich (?:jetzt )?konzentrieren$/i
const STOPP = /^(?:(?:fokus(?:zeit|modus)?|pomodoro)\s+(?:beenden|stoppen|stopp|aus|abbrechen)|(?:beende|stopp|stoppe)\s+(?:den\s+|die\s+)?(?:fokus(?:zeit|modus)?|pomodoro))$/i
const PAUSIEREN = /^(?:fokus|pomodoro)\s+(?:pausieren|anhalten)$/i
const WEITER = /^(?:weiter mit (?:dem )?(?:fokus|pomodoro)|(?:fokus|pomodoro) (?:fortsetzen|weiter))$/i

// ── Hintergrundklang, direkt erzeugt ──
let audio = null
function klangStarten(art, lautstaerke) {
  klangStoppen()
  if (art === 'aus') return
  try {
    const ctx = new AudioContext()
    const laenge = ctx.sampleRate * 4
    const puffer = ctx.createBuffer(2, laenge, ctx.sampleRate)
    for (let k = 0; k < 2; k++) {
      const d = puffer.getChannelData(k)
      let letzter = 0
      for (let i = 0; i < laenge; i++) {
        const weiss = Math.random() * 2 - 1
        if (art === 'braun') {
          letzter = (letzter + 0.02 * weiss) / 1.02 // braunes Rauschen: tief und weich
          d[i] = letzter * 3.5
        } else {
          d[i] = weiss * 0.5 // Regen: gefiltertes Rauschen mit leisen Tropfen
          if (Math.random() < 0.0004) for (let j = 0; j < 180 && i + j < laenge; j++) d[i + j] += (Math.random() * 2 - 1) * 0.6 * Math.exp(-j / 30)
        }
      }
    }
    const quelle = ctx.createBufferSource()
    quelle.buffer = puffer
    quelle.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = art === 'braun' ? 'lowpass' : 'bandpass'
    filter.frequency.value = art === 'braun' ? 600 : 1800
    filter.Q.value = art === 'braun' ? 0.7 : 0.4
    const laut = ctx.createGain()
    laut.gain.setValueAtTime(0.0001, ctx.currentTime)
    laut.gain.exponentialRampToValueAtTime(Math.max(0.001, lautstaerke), ctx.currentTime + 2) // sanft einblenden
    quelle.connect(filter).connect(laut).connect(ctx.destination)
    quelle.start()
    audio = { ctx, laut }
  } catch (e) {
    console.warn('Fokus-Klang:', e.message)
  }
}
function klangStoppen() {
  if (!audio) return
  const { ctx, laut } = audio
  audio = null
  try {
    laut.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1)
    setTimeout(() => ctx.close(), 1200)
  } catch {
    ctx.close()
  }
}
const klangLautstaerke = (wert) => audio && audio.laut.gain.setTargetAtTime(Math.max(0.001, wert), audio.ctx.currentTime, 0.2)

export async function starten(ctx) {
  const m = ctx.maskieren
  let e = { ...STANDARD }
  // Laufender Zustand (nur im Speicher): phase fokus|pause|lange, ende (ms), runde, pausiertRest (ms)
  let lauf = null

  const d = await ctx.daten.laden()
  e = { ...STANDARD, ...(d.einstellungen || {}) }
  const speichern = () => ctx.daten.speichern({ einstellungen: e })

  function phaseStarten(phase, minuten) {
    lauf = { ...(lauf || { runde: 1 }), phase, ende: Date.now() + minuten * 60000, dauer: minuten * 60000, pausiertRest: null }
    if (phase === 'fokus') {
      ctx.nichtStoeren(lauf.ende)
      klangStarten(e.klang, e.lautstaerke)
    } else {
      ctx.nichtStoeren(0)
      klangStoppen()
    }
    zeichnen()
  }

  function fokusStarten(minuten = e.fokus) {
    lauf = { runde: 1 }
    phaseStarten('fokus', minuten)
    return `Fokus an, ${minuten} Minuten. Ich halte dir den Rücken frei.`
  }
  function beenden() {
    const war = lauf
    lauf = null
    ctx.nichtStoeren(0)
    klangStoppen()
    zeichnen()
    return war ? 'Fokus beendet. Meldungen sind wieder an.' : 'Es läuft gerade keine Fokuszeit.'
  }
  function pausieren() {
    if (!lauf || lauf.pausiertRest != null) return 'Es läuft gerade keine Fokuszeit.'
    lauf.pausiertRest = lauf.ende - Date.now()
    ctx.nichtStoeren(0)
    klangStoppen()
    zeichnen()
    return 'Fokus angehalten.'
  }
  function fortsetzen() {
    if (!lauf || lauf.pausiertRest == null) return 'Da ist nichts angehalten.'
    lauf.ende = Date.now() + lauf.pausiertRest
    lauf.pausiertRest = null
    if (lauf.phase === 'fokus') {
      ctx.nichtStoeren(lauf.ende)
      klangStarten(e.klang, e.lautstaerke)
    }
    zeichnen()
    return 'Weiter geht’s.'
  }

  // Phase vorbei: Ton, Luzzy sagt es, nächste Phase startet von selbst
  setInterval(async () => {
    if (!lauf || lauf.pausiertRest != null || Date.now() < lauf.ende) return zeichnenZeit()
    const war = lauf.phase
    if (war === 'fokus') {
      const lang = lauf.runde % e.runden === 0
      phaseStarten(lang ? 'lange' : 'pause', lang ? e.langePause : e.pause)
      await tonSpielen('glocke')
      ctx.vorlesen(lang ? `Stark, ${e.runden} Runden geschafft. Jetzt ${e.langePause} Minuten richtig Pause.` : `Fokuszeit vorbei. ${e.pause} Minuten Pause, beweg dich kurz.`)
    } else {
      lauf.runde += 1
      phaseStarten('fokus', e.fokus)
      await tonSpielen('glocke')
      ctx.vorlesen(`Pause vorbei. Runde ${lauf.runde}, ${e.fokus} Minuten Fokus.`)
    }
  }, 500)

  // ── Sprache/Text ──
  ctx.befehl((eingabe) => {
    const s = ohneLuzzy(eingabe).replace(/[.!?]+$/, '').trim()
    const start = START.exec(s)
    if (start) return fokusStarten(start[1] ? Math.min(240, Math.max(1, Number(start[1]))) : e.fokus)
    if (STOPP.test(s)) return beenden()
    if (PAUSIEREN.test(s)) return pausieren()
    if (WEITER.test(s)) return fortsetzen()
    return null
  })

  // ── Bereich ──
  ctx.element.innerHTML = `
    <div class="fk-raster">
      <section class="fk-uhr hud">
        <div class="fk-phase" data-phase>Bereit</div>
        <div class="fk-zeit" data-zeit>${zwei(e.fokus)}:00</div>
        <div class="fk-balken"><div data-balken></div></div>
        <div class="fk-runde leise" data-runde></div>
        <div class="fk-knoepfe">
          <button class="knopf-gold" data-a="start" type="button">Fokus starten</button>
          <button class="knopf-flach" data-a="pause" type="button">Anhalten</button>
          <button class="knopf-flach" data-a="stopp" type="button">Beenden</button>
        </div>
      </section>
      <form class="fk-einstellungen hud" data-form>
        <h3>Einstellungen</h3>
        <label>Fokus <span><input name="fokus" type="number" min="1" max="240" /> Min.</span></label>
        <label>Pause <span><input name="pause" type="number" min="1" max="60" /> Min.</span></label>
        <label>Lange Pause <span><input name="langePause" type="number" min="1" max="120" /> Min.</span></label>
        <label>Runden bis lange Pause <span><input name="runden" type="number" min="1" max="12" /></span></label>
        <label>Klang <select name="klang">${Object.entries(KLAENGE).map(([k, n]) => `<option value="${k}">${m(n)}</option>`).join('')}</select></label>
        <label>Lautstärke <input name="lautstaerke" type="range" min="0.05" max="1" step="0.05" /></label>
        <p class="leise">In der Fokuszeit ist „Nicht stören“ an: Meldungen landen nur in der Liste. Timer und Wecker klingeln trotzdem.</p>
      </form>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)
  const form = $('[data-form]')
  for (const [k, v] of Object.entries(e)) if (form.elements[k]) form.elements[k].value = v

  const PHASEN = { fokus: 'Fokus', pause: 'Pause', lange: 'Lange Pause' }
  function zeichnenZeit() {
    const rest = !lauf ? e.fokus * 60000 : lauf.pausiertRest != null ? lauf.pausiertRest : lauf.ende - Date.now()
    $('[data-zeit]').textContent = mmss(rest)
    $('[data-balken]').style.width = lauf ? `${Math.min(100, 100 - (rest / lauf.dauer) * 100)}%` : '0%'
  }
  function zeichnen() {
    ctx.element.querySelector('.fk-uhr').dataset.zustand = lauf?.phase || ''
    $('[data-phase]').textContent = !lauf ? 'Bereit' : `${PHASEN[lauf.phase]}${lauf.pausiertRest != null ? ' · angehalten' : ''}`
    $('[data-runde]').textContent = lauf ? `Runde ${lauf.runde} · lange Pause nach ${e.runden}` : `${e.fokus} Min. Fokus · ${e.pause} Min. Pause`
    $('[data-a="start"]').textContent = lauf ? 'Neu starten' : 'Fokus starten'
    $('[data-a="pause"]').textContent = lauf?.pausiertRest != null ? 'Weiter' : 'Anhalten'
    $('[data-a="pause"]').disabled = !lauf
    $('[data-a="stopp"]').disabled = !lauf
    zeichnenZeit()
  }

  ctx.element.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a
    if (a === 'start') ctx.vorlesen(fokusStarten())
    if (a === 'pause') lauf?.pausiertRest != null ? fortsetzen() : pausieren()
    if (a === 'stopp') beenden()
  })
  form.addEventListener('input', async () => {
    for (const k of ['fokus', 'pause', 'langePause', 'runden']) e[k] = Math.max(1, Number(form.elements[k].value) || STANDARD[k])
    const klangNeu = form.elements.klang.value
    e.lautstaerke = Number(form.elements.lautstaerke.value)
    klangLautstaerke(e.lautstaerke)
    if (klangNeu !== e.klang) {
      e.klang = klangNeu
      if (lauf?.phase === 'fokus' && lauf.pausiertRest == null) klangStarten(e.klang, e.lautstaerke)
    }
    await speichern()
    zeichnen()
  })

  zeichnen()
  return { laden: zeichnen, takt: 5000 }
}
