// Mini-Modus: schwarze Insel oben an der Bildschirmkante mit Fenni, dem kleinen Wolf (fenni/). Sie versteckt sich nach
// ein paar Sekunden nach oben (main.js). Fenni zeigt, was Luzzy gerade tut
// (vom großen Fenster geschickt). Links Uhr und Wetter, rechts Luzzys Worte oder nächster Termin und offene Aufgaben
// (miniinfo.js im großen Fenster), bei einer Meldung klappt unten eine Zeile auf.
// Klick: sprechen, Doppelklick: großes Fenster, Rechtsklick: Fenni anstupsen, Maus über Fenni hin und her: streicheln.

import { fenniErstellen } from './fenni/fenni.js'
import { sterneErstellen } from './fenni/sterne.js'

const $ = (id) => document.getElementById(id)
const MELDUNG_ZEIT = 9000 // so lange bleibt eine Meldung offen
const WORTE_ZEIT = 7000 // so lange bleiben Luzzys letzte Worte stehen, wenn sie fertig ist
const SYMBOL = { bestellung: '◆', mail: '✉', job: '⚠', crew: '⚑', hinweis: 'ⓘ', termin: '◷', timer: '⏱', aufgabe: '☐', meilenstein: '★', kosten: '$' }
const TEXT = { hoert: ['Ich höre zu …', 'Klick: fertig'], versteht: ['Verstehe …', ''], denkt: ['Denkt nach …', ''], getrennt: ['Keine Verbindung', 'Hermes ist nicht erreichbar'], schaut: ['Schaut auf den Bildschirm …', ''] }

// Farben des Designs (Einstellungen → Aussehen): das große Fenster legt sie beim Anwenden in localStorage
// „jarves-design“ ab (akzentRgb, akzentHellRgb, grundRgb, textRgb). Ohne Eintrag bleibt Donnerwolf Gold aus mini.html.
const RGB = /^\d{1,3}, ?\d{1,3}, ?\d{1,3}$/
function farbenSetzen() {
  let d = null
  try {
    d = JSON.parse(localStorage.getItem('jarves-design') || 'null')
  } catch {
    // Standard
  }
  const setzen = (variable, wert) => RGB.test(String(wert)) && document.documentElement.style.setProperty(variable, wert)
  setzen('--akzent-rgb', d?.akzentRgb) // Rand der Insel, Fennis Fell und Ohren
  setzen('--akzent-hell-rgb', d?.akzentHellRgb)
  setzen('--grund-rgb', d?.grundRgb) // Hintergrund der Insel (Seitenspalten-Farbe des Designs)
  setzen('--text-rgb', d?.textRgb)
}
farbenSetzen()

const insel = $('insel')
const pille = $('pille')
const sterne = sterneErstellen($('sterne')) // Lichtpunkte und Schein hinter Fenni
const fenni = fenniErstellen($('fenni'))
addEventListener('storage', (e) => {
  if (e.key !== 'jarves-design') return
  farbenSetzen()
  fenni.farbenNeu()
  sterne.farbenNeu()
})

// ── Links: Uhr, darunter Wetter (oder das Datum, solange kein Wetter da ist) ──
let info = {} // vom großen Fenster (miniinfo.js): { wetter: { grad, text }, termin, aufgaben }
function linksZeigen() {
  const jetzt = new Date()
  $('uhr').textContent = jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  $('wetter').textContent = info.wetter
    ? `${info.wetter.grad}° · ${info.wetter.text}`
    : jetzt.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}
linksZeigen()
setInterval(linksZeigen, 5000)

// ── Rechts: was Luzzy gerade sagt oder tut, sonst Termin und Aufgaben ──
let zustand = 'bereit'
let worte = ''
let worteBis = 0
let werkzeug = ''
// Das Ende von Luzzys Text, an einer Wortgrenze abgeschnitten (passt in zwei Zeilen)
function ende(text, laenge = 44) {
  if (text.length <= laenge) return text
  const stueck = text.slice(-laenge)
  return `… ${stueck.slice(stueck.indexOf(' ') + 1)}`
}
function rechtsZeigen() {
  const rechts = $('rechts')
  const setzen = (oben, unten = '', alsWorte = false) => {
    rechts.classList.toggle('worte', alsWorte)
    $('rechts-oben').textContent = oben
    $('rechts-unten').textContent = unten
  }
  const redet = ['antwortet', 'spricht'].includes(zustand) || Date.now() < worteBis
  if (worte && redet && zustand !== 'hoert') return setzen(ende(worte), '', true)
  if (werkzeug && ['denkt', 'antwortet'].includes(zustand)) return setzen('Arbeitet …', werkzeug)
  if (TEXT[zustand]) return setzen(...TEXT[zustand])
  const aufgaben = info.aufgaben ? `☐ ${info.aufgaben} ${info.aufgaben === 1 ? 'Aufgabe' : 'Aufgaben'} offen` : ''
  if (info.termin) return setzen(`◷ ${info.termin}`, aufgaben)
  setzen(aufgaben || 'Alles ruhig', 'Klick: sprechen')
}
rechtsZeigen()
setInterval(rechtsZeigen, 1000)

// ── Meldung: Insel klappt nach unten auf, Fenni horcht auf ──
let meldungUhr = 0
let zuklappUhr = 0
function meldungZeigen(m) {
  $('meldung-symbol').textContent = SYMBOL[m.art] || '•'
  $('meldung-titel').textContent = m.titel || 'Neue Meldung'
  $('meldung-zeile').textContent = m.anzeige || ''
  clearTimeout(zuklappUhr)
  clearTimeout(meldungUhr)
  window.mini.hoehe?.(true) // Fenster zuerst höher, dann klappt die Insel sichtbar auf
  requestAnimationFrame(() => requestAnimationFrame(() => pille.classList.add('offen')))
  fenni.aufhorchen()
  meldungUhr = setTimeout(meldungSchliessen, MELDUNG_ZEIT)
}
function meldungSchliessen() {
  clearTimeout(meldungUhr)
  if (!pille.classList.contains('offen')) return
  pille.classList.remove('offen')
  zuklappUhr = setTimeout(() => window.mini.hoehe?.(false), 360) // nach dem Zuklappen wieder klein
}

// ── Nachrichten vom großen Fenster ──
// Luzzys Zustand → Fenni. versteht (schreibt Gesprochenes mit) und antwortet (schreibt) = nachdenken
const FENNI = { bereit: 'bereit', hoert: 'hoert', versteht: 'denkt', denkt: 'denkt', antwortet: 'denkt', spricht: 'spricht', getrennt: 'schlaeft', schaut: 'schaut' }
window.mini.beiZustand((daten = {}) => {
  const { zustand: neu, pegel, titel } = daten
  if (titel) pille.title = `${titel} · Klick: sprechen · Doppelklick: großes Fenster · Rechtsklick: Fenni anstupsen · Maus über Fenni hin und her: streicheln`
  if (daten.info) {
    info = daten.info
    linksZeigen()
  }
  if (daten.worte !== undefined) {
    worte = String(daten.worte || '')
    worteBis = worte ? Date.now() + WORTE_ZEIT : 0
  }
  if (daten.werkzeug !== undefined) werkzeug = String(daten.werkzeug || '')
  if (daten.meldung) meldungZeigen(daten.meldung)
  if (pegel !== undefined) {
    fenni.pegel(pegel)
    sterne.staerke(fenni.stimme())
  }
  if (neu && neu !== zustand) {
    // Luzzy ist mit einer Antwort fertig: Fenni freut sich (und hechelt danach)
    if (neu === 'bereit' && ['antwortet', 'spricht'].includes(zustand)) fenni.freuen()
    if (neu === 'hoert') worte = '' // neue Frage: alte Antwort weg
    if (!['spricht', 'hoert'].includes(neu)) {
      fenni.pegel(null)
      sterne.staerke(0)
    }
    zustand = neu
    insel.dataset.zustand = neu
    fenni.zustand(FENNI[neu] || 'bereit')
    sterne.zustand(FENNI[neu] || 'bereit')
  }
  rechtsZeigen()
})
// Nach oben weg und wieder da (main.js entscheidet: nichts los → weg; Maus an der oberen Kante, Meldung, Luzzy aktiv → da)
insel.addEventListener('animationend', (e) => e.animationName === 'herab' && insel.classList.add('da'))
window.mini.beiSichtbar?.((an) => {
  insel.classList.add('da')
  insel.classList.toggle('weg', !an)
})
// Augen folgen der Maus (das Hauptprogramm meldet ihre Position, solange der Mini-Modus an ist)
window.mini.beiBlick?.(({ x, y } = {}) => fenni.blick(Number(x) || 0, Number(y) || 0))

// ── Maus ──
// Einfacher Klick: Fenni hüpft sofort, das Sprechen startet, wenn kein Doppelklick folgt. Klick auf eine Meldung: großes Fenster
let klickUhr = 0
pille.addEventListener('click', (e) => {
  if (e.target.id === 'gross' || e.target.closest('#meldung')) return window.mini.gross()
  clearTimeout(klickUhr)
  if (e.detail > 1) return
  fenni.klick()
  klickUhr = setTimeout(() => window.mini.sprechen(), 230)
})
pille.addEventListener('dblclick', () => {
  clearTimeout(klickUhr)
  window.mini.gross()
})
// Rechtsklick: anstupsen (dreimal schnell: schwindelig)
pille.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  fenni.anstupsen()
})
// Streicheln: die Maus direkt über Fenni hin und her bewegen (gesammelter Weg, der schnell wieder verfliegt)
let weg = 0
let letzteBewegung = 0
pille.addEventListener('mousemove', (e) => {
  const mitte = pille.clientWidth / 2
  if (Math.abs(e.offsetX - mitte) > 40 || e.target.id !== 'fenni') return
  const jetzt = performance.now()
  weg = weg * Math.exp(-(jetzt - letzteBewegung) / 400) + Math.abs(e.movementX) + Math.abs(e.movementY) * 0.5
  letzteBewegung = jetzt
  if (weg > 110) fenni.streicheln()
})
