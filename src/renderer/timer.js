// Timer, Wecker und Erinnerungen per Sprache oder Text, komplett in Jarves-OS (ohne Hermes, ohne Internet):
//   „Stell einen Timer auf 15 Minuten für die Nudeln“ · „Nudel-Timer 10 Minuten“
//   „Weck mich um 7 Uhr“ · „Erinner mich um 14 Uhr an den Anruf“ · „Erinner mich in 20 Minuten an die Wäsche“
//   „Wie lange noch für die Nudeln?“ · „Nudel-Timer stoppen“ · „Alle Timer stoppen“
//   „Timer um 5 Minuten verlängern“ · „Noch 5 Minuten für die Nudeln“
// Oben neben der Uhr läuft der Countdown. Wenn er abläuft: Ton + Luzzy sagt es, auch in der Ruhezeit
// und bei „Nicht stören“ (den Timer hat Felix ja selbst gestellt).

import { saeubern, dauerFinden, uhrzeitFinden, uhrzeitZiel } from './zeitsprache.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const MAX = 10

const SYMBOLE = [
  [/^(nudel|pasta|spaghetti)/, '🍝'], [/^pizza/, '🍕'], [/^tee/, '🍵'], [/^kaffee/, '☕'], [/^eier?\b/, '🥚'],
  [/^(kuchen|torte)/, '🍰'], [/^(brot|brötchen)/, '🍞'], [/^(ofen|backofen|auflauf)/, '🔥'], [/^(essen|mittag|abendessen)/, '🍽'],
  [/^(wäsche|trockner|waschmaschine)/, '👕'], [/^(anruf|telefon|call)/, '📞'], [/^(meeting|besprechung)/, '👥'],
  [/^(training|sport)/, '🏋'], [/^(tablette|medizin)/, '💊'], [/^pause/, '☕']
]
const symbolFuer = (eintrag) => {
  const name = String(eintrag.name || '').toLowerCase()
  for (const [muster, zeichen] of SYMBOLE) if (name.split(/\s+/).some((w) => muster.test(w))) return zeichen
  return eintrag.typ === 'wecker' ? '⏰' : eintrag.typ === 'erinnerung' ? '🔔' : '⏱'
}

let liste = [] // { id, typ: timer|wecker|erinnerung, ende, dauer?, name?, phrase?, satz? }
let h = { speichern: () => {}, alarm: () => {} }

// ── Zeiten als Text ──
function dauerText(ms, { genau = false } = {}) {
  const s = Math.max(0, Math.round(ms / 1000))
  const std = Math.floor(s / 3600)
  const min = Math.floor((s % 3600) / 60)
  const sek = s % 60
  const teile = []
  if (std) teile.push(`${std} ${std === 1 ? 'Stunde' : 'Stunden'}`)
  if (min) teile.push(`${min} ${min === 1 ? 'Minute' : 'Minuten'}`)
  if (sek && (genau || (!std && min < 2))) teile.push(`${sek} ${sek === 1 ? 'Sekunde' : 'Sekunden'}`)
  if (!teile.length) return 'weniger als eine Sekunde'
  return teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}` : teile[0]
}
const uhr = (zeit) => new Date(zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }).replace(/^0(?=\d)/, '')
const tagText = (zeit) => {
  const tage = Math.round((new Date(zeit).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return tage === 0 ? '' : tage === 1 ? ' morgen' : ` am ${new Date(zeit).toLocaleDateString('de-DE', { weekday: 'long' })}`
}
function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const zwei = (n) => String(n).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${zwei(Math.floor((s % 3600) / 60))}:${zwei(s % 60)}` : `${Math.floor(s / 60)}:${zwei(s % 60)}`
}

// Den Namen so übernehmen, wie Felix ihn geschrieben hat (Großschreibung), sonst ersten Buchstaben groß
function imOriginal(original, klein) {
  const i = original.toLowerCase().indexOf(klein)
  return i >= 0 ? original.slice(i, i + klein.length) : klein.charAt(0).toUpperCase() + klein.slice(1)
}
const ARTIKEL = /^(?:(die|den|das|der|dem|meine[nm]?|mein|deine[nm]?|dein) )/
function nameAus(phrase, original) {
  if (!phrase) return {}
  const echt = imOriginal(original, phrase)
  return { phrase: echt, name: echt.replace(new RegExp(ARTIKEL.source, 'i'), '').replace(/^./, (c) => c.toUpperCase()) }
}

// Welche Einträge meint Felix? („Nudeln“ passt zu „Nudel-Timer“ und umgekehrt)
function passende(filter, typen) {
  const kandidaten = liste.filter((e) => !typen || typen.includes(e.typ))
  if (!filter) return kandidaten
  const woerter = filter.toLowerCase().split(/[\s-]+/).filter((w) => w.length >= 3 && !/^(die|den|das|der|dem|timer|wecker|erinnerung)$/.test(w))
  if (!woerter.length) return kandidaten
  return kandidaten.filter((e) => {
    const namen = String(e.name || '').toLowerCase().split(/[\s-]+/).filter(Boolean)
    return woerter.some((w) => namen.some((n) => n.startsWith(w.slice(0, Math.max(3, w.length - 2))) || w.startsWith(n.slice(0, Math.max(3, n.length - 2)))))
  })
}
const bezeichnung = (e) => (e.typ === 'wecker' ? `Wecker um ${uhr(e.ende)} Uhr` : e.phrase ? `${e.typ === 'erinnerung' ? 'Erinnerung an' : 'Timer für'} ${e.phrase}` : e.typ === 'erinnerung' ? `Erinnerung um ${uhr(e.ende)} Uhr` : `Timer über ${dauerText(e.dauer)}`)

// ── Satz verstehen ──
// Liefert { art, … } oder null (dann geht der Satz normal an Luzzy)
export function timerErkennen(text, jetzt = new Date()) {
  const s = saeubern(text)
    .replace(/(\S+?)-(timer|wecker)\b/g, '$1 $2') // „nudel-timer“ → „nudel timer“
    .replace(/\b(\S{3,}?)(timer)\b/g, (t, vorn) => (/^(count|eier)$/.test(vorn) ? t : `${vorn} timer`)) // „nudeltimer“
  const hatTimerWort = /\b(timer|wecker|erinnerung(en)?|countdown|eieruhr)\b/.test(s)
  const frage = /^(wie|was|warum|wann|wo|kann|könntest|soll|gibt|hast|ist|läuft) /.test(s)

  // Abfrage: „Wie lange noch (für die Nudeln)?“, „Wie lange läuft der Timer noch?“
  if (/^wie ?(lange|viel zeit)\b/.test(s) && (hatTimerWort || /\bnoch\b/.test(s)) && (hatTimerWort || liste.length)) {
    const name = s.replace(/^wie ?(lange|viel zeit)( (noch|läuft|dauert|bleibt|hat))*( der| die| das| mein| meine)?/, '').replace(/\b(timer|wecker|erinnerung|noch|läuft|dauert|bleibt|für|braucht|brauchen|sind|ist|bis|klingelt)\b/g, ' ').trim()
    return { art: 'abfrage', filter: name, typen: /\bwecker\b/.test(s) ? ['wecker'] : /\berinnerung/.test(s) ? ['erinnerung'] : null }
  }
  if (frage) return null

  // Stoppen: „Nudel-Timer stoppen“, „Stopp den Wecker“, „Alle Timer löschen“
  const stopp = /\b(stopp|stoppe|stoppen|stop|aus|ausschalten|abbrechen|brich|löschen|lösche|beenden|beende|weg)\b/
  if (hatTimerWort && stopp.test(s) && !dauerFinden(s)) {
    const alle = /\balle\b/.test(s)
    const filter = s.replace(stopp, ' ').replace(/\b(alle|den|die|das|der|mein|meine|meinen|timer|wecker|erinnerung(en)?|für|ab|mal|jetzt)\b/g, ' ').replace(/\s+/g, ' ').trim()
    // „Alle Timer stoppen“ lässt Wecker und Erinnerungen in Ruhe
    const typen = /\bwecker\b/.test(s) ? ['wecker'] : /\berinnerung/.test(s) ? ['erinnerung'] : alle && /\btimer\b/.test(s) ? ['timer'] : null
    return { art: 'stoppen', alle, filter, typen }
  }

  // Verlängern: „Timer um 5 Minuten verlängern“, „Noch 5 Minuten für die Nudeln“
  const dauer = dauerFinden(s)
  if (dauer && (/\bverlänger/.test(s) || (/^(noch|gib (den |der |dem )?\S+ noch) /.test(s) && liste.length))) {
    const filter = dauer.rest.replace(/\b(verlängern|verlängere|verlänger|noch|um|gib|timer|den|die|das|der|dem|für|mein|meine|meinen)\b/g, ' ').replace(/\s+/g, ' ').trim()
    return { art: 'verlaengern', ms: dauer.ms, filter }
  }

  // Wecker: „Weck mich um 7 Uhr“, „Stell einen Wecker auf 6:30“, „Weck mich in 20 Minuten“
  if (/^(weck(e|en)? mich|stell(e)? (mir )?(einen |den )?wecker|wecker (auf|um|für|in) )/.test(s)) {
    const zeit = uhrzeitFinden(s)
    if (zeit) return { art: 'stellen', typ: 'wecker', ende: uhrzeitZiel(zeit.stunde, zeit.minute, jetzt, { nachmittag: false }) }
    if (dauer) return { art: 'stellen', typ: 'wecker', ende: jetzt.getTime() + dauer.ms }
    return null
  }

  // Erinnerung: „Erinner mich um 14 Uhr an den Anruf“, „Erinnere mich in 20 Minuten, dass die Wäsche fertig ist“
  if (/^(erinner(e|n)? mich|sag mir (in|um) .* bescheid|gib mir (in|um) .* bescheid)/.test(s)) {
    const zeit = uhrzeitFinden(s)
    const rest = (zeit ? zeit.rest : dauer ? dauer.rest : s).replace(/^(erinner(e|n)? mich|sag mir|gib mir)\b/, '').replace(/\bbescheid\b/, '').trim()
    const ende = zeit ? uhrzeitZiel(zeit.stunde, zeit.minute, jetzt) : dauer ? jetzt.getTime() + dauer.ms : null
    if (!ende) return null
    const an = /(?:^| )an (.+)$/.exec(rest)
    const dass = /(?:^| )dass (.+)$/.exec(rest)
    const inhalt = an ? nameAus(an[1], text) : dass ? { satz: imOriginal(text, dass[1]) } : {}
    return { art: 'stellen', typ: 'erinnerung', ende, ...inhalt }
  }

  // Timer: „Stell einen Timer auf 15 Minuten für die Nudeln“, „Nudel-Timer 10 Minuten“, „Timer 5 Minuten“
  if (/\b(timer|countdown|eieruhr)\b/.test(s) && dauer) {
    let rest = dauer.rest
    let phrase = /(?:^| )für (.+?)$/.exec(rest)?.[1] || /(?:^| )(?:namens|mit dem namen) (.+)$/.exec(rest)?.[1]
    if (!phrase) {
      // Name vor „Timer“: „nudel timer“ → „Nudel“
      const vorn = /(?:^| )(\S+) timer\b/.exec(rest)?.[1]
      if (vorn && !/^(einen|ein|den|der|mir|stell|stelle|mach|mache|start|starte|neuen|neue)$/.test(vorn)) phrase = vorn
    }
    return { art: 'stellen', typ: 'timer', ende: jetzt.getTime() + dauer.ms, dauer: dauer.ms, ...nameAus(phrase?.trim(), text) }
  }
  return null
}

// ── Befehl ausführen ──
// Liefert Luzzys Antwort (Text) oder null, wenn es kein Timer-Befehl war
export function timerBefehl(text) {
  const b = timerErkennen(text)
  if (!b) return null
  const jetzt = Date.now()

  if (b.art === 'stellen') {
    if (liste.length >= MAX) return `Es laufen schon ${MAX} Timer. Stopp erst einen.`
    const eintrag = { id: `${jetzt}-${Math.random().toString(36).slice(2, 6)}`, typ: b.typ, ende: b.ende, dauer: b.dauer, name: b.name, phrase: b.phrase, satz: b.satz }
    liste.push(eintrag)
    aenderung()
    if (b.typ === 'timer') return b.phrase ? `Alles klar, ${dauerText(b.dauer)} für ${b.phrase}.` : `Alles klar, Timer auf ${dauerText(b.dauer)}.`
    if (b.typ === 'wecker') return `Wecker ist gestellt auf ${uhr(b.ende)} Uhr${tagText(b.ende)}.`
    const wann = b.ende - jetzt < 3600000 ? `in ${dauerText(b.ende - jetzt)}` : `um ${uhr(b.ende)} Uhr${tagText(b.ende)}`
    return b.phrase ? `Mach ich, ich erinnere dich ${wann} an ${b.phrase}.` : b.satz ? `Mach ich, ich erinnere dich ${wann} daran.` : `Mach ich, ich melde mich ${wann}.`
  }

  if (b.art === 'abfrage') {
    const treffer = passende(b.filter, b.typen).sort((x, y) => x.ende - y.ende)
    if (!liste.length) return 'Gerade läuft kein Timer.'
    if (!treffer.length) return `Dazu läuft kein Timer. ${liste.length === 1 ? 'Es läuft nur einer' : `Es laufen ${liste.length}`}: ${liste.map(bezeichnung).join(', ')}.`
    return treffer.map((e) => (e.typ === 'wecker' ? `Dein Wecker klingelt um ${uhr(e.ende)} Uhr${tagText(e.ende)}.` : `${e.phrase || e.typ === 'erinnerung' ? `${bezeichnung(e)}: noch` : 'Noch'} ${dauerText(e.ende - jetzt)}.`)).join(' ')
  }

  if (b.art === 'stoppen') {
    const treffer = b.alle ? passende('', b.typen) : passende(b.filter, b.typen)
    if (!treffer.length) return liste.length ? `Den finde ich nicht. Es laufen: ${liste.map(bezeichnung).join(', ')}.` : 'Da läuft gerade kein Timer.'
    if (treffer.length > 1 && !b.alle) return `Welchen? ${treffer.map(bezeichnung).join(' oder ')}?`
    liste = liste.filter((e) => !treffer.includes(e))
    aenderung()
    return treffer.length > 1 ? `Alle ${treffer.length} gestoppt.` : `${bezeichnung(treffer[0])} gestoppt.`
  }

  if (b.art === 'verlaengern') {
    const treffer = passende(b.filter, ['timer', 'erinnerung'])
    if (!treffer.length) return 'Da läuft gerade kein Timer, den ich verlängern kann.'
    if (treffer.length > 1) return `Welchen? ${treffer.map(bezeichnung).join(' oder ')}?`
    const e = treffer[0]
    e.ende += b.ms
    if (e.dauer) e.dauer += b.ms
    aenderung()
    return `Okay, ${dauerText(b.ms)} mehr${e.phrase ? ` für ${e.phrase}` : ''}. Jetzt noch ${dauerText(e.ende - jetzt)}.`
  }
  return null
}

// ── Ablaufen ──
function alarmText(e, { verpasst = false } = {}) {
  const vorweg = verpasst ? `Während Jarves-OS zu war, um ${uhr(e.ende)} Uhr: ` : ''
  if (e.typ === 'wecker') return `${vorweg}${new Date(e.ende).getHours() < 11 ? 'Guten Morgen, Felix!' : 'Felix, dein Wecker!'} Es ist ${uhr(e.ende)} Uhr.`
  if (e.typ === 'erinnerung') return `${vorweg}Felix, ${e.phrase ? `denk an ${e.phrase}!` : e.satz ? `du wolltest erinnert werden, dass ${e.satz}.` : 'deine Erinnerung!'}`
  return `${vorweg}Felix, dein Timer ${e.phrase ? `für ${e.phrase}` : `über ${dauerText(e.dauer)}`} ist abgelaufen.`
}

function pruefen() {
  const jetzt = Date.now()
  const faellig = liste.filter((e) => e.ende <= jetzt)
  if (faellig.length) {
    liste = liste.filter((e) => e.ende > jetzt)
    aenderung()
    for (const e of faellig) h.alarm({ text: alarmText(e), titel: `${symbolFuer(e)} ${e.name || (e.typ === 'wecker' ? 'Wecker' : e.typ === 'erinnerung' ? 'Erinnerung' : 'Timer')}`, eintrag: e })
  }
  zeigen()
}

function zeigen() {
  const el = $('timer-leiste')
  if (!el) return
  const jetzt = Date.now()
  el.hidden = !liste.length
  el.innerHTML = [...liste]
    .sort((a, b) => a.ende - b.ende)
    .map((e) => {
      const lang = e.typ !== 'timer' && e.ende - jetzt > 3600000
      const zeit = lang ? uhr(e.ende) : countdown(e.ende - jetzt)
      return `<button class="timer-chip${e.ende - jetzt < 60000 ? ' timer-bald' : ''}" type="button" data-timer-id="${e.id}" title="${maskieren(bezeichnung(e))} · Klick: stoppen">${symbolFuer(e)} ${e.name ? `${maskieren(e.name)} ` : ''}<b>${zeit}</b></button>`
    })
    .join('')
}

function aenderung() {
  h.speichern(liste)
  zeigen()
}

// gespeichert: Liste aus den Einstellungen (übersteht einen Neustart)
export function timerEinrichten({ gespeichert = [], speichern, alarm }) {
  h = { speichern, alarm }
  const jetzt = Date.now()
  liste = (Array.isArray(gespeichert) ? gespeichert : []).filter((e) => e && Number.isFinite(e.ende))
  // Während Jarves-OS zu war abgelaufen: kurz nachholen (nur die letzte Stunde), Älteres verwerfen
  const verpasst = liste.filter((e) => e.ende <= jetzt && jetzt - e.ende < 3600000)
  liste = liste.filter((e) => e.ende > jetzt)
  if (liste.length !== (Array.isArray(gespeichert) ? gespeichert.length : 0)) aenderung() // Abgelaufenes aus dem Speicher nehmen
  for (const e of verpasst) h.alarm({ text: alarmText(e, { verpasst: true }), titel: `${symbolFuer(e)} ${e.name || 'Timer'} (verpasst)`, eintrag: e })
  setInterval(pruefen, 500)
  zeigen()
  $('timer-leiste').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-timer-id]')
    if (!chip) return
    liste = liste.filter((e) => e.id !== chip.dataset.timerId)
    aenderung()
  })
}

export const timerListe = () => liste
