// Jarves-OS Oberfläche: Luzzy in der Mitte, Gespräch, Live-Spalte, Einstellungen.

import { reaktorErstellen, welleErstellen } from './reaktor.js'
import { markdownZuHtml } from './markdown.js'
import { vorleserErstellen, satzStueck } from './vorlesen.js'
import { mikrofonErstellen } from './mikrofon.js'
import { unterhaltungErstellen } from './unterhaltung.js'
import { crewLaden, jobsLaden, kanbanLaden, systemLaden } from './ansichten.js'
import { meldungenEinrichten, meldungNeu, problemNeu, meldungenSammeln } from './meldungen.js'
import { tonSpielen } from './toene.js'
import './auswahl.js' // eigene Auswahlfenster für Datum und Uhrzeit (statt der Windows-Fenster)
import { ablageEinrichten, ablageErgebnis, ablageOeffnen } from './zwischenablage.js'
import { timerEinrichten, timerBefehl, timerListe } from './timer.js'
import { paletteEinrichten, paletteOeffnen } from './palette.js'
import { selbsttestStarten } from './selbsttest.js'
import { diktatErkennen, diktatAuftrag, diktatAblegen } from './diktat.js'
import { gespraecheEinrichten, gespraecheLaden, gespraechBefehl } from './gespraeche.js'
import { dateiBefehlErkennen, dateiSuchenUndZeigen, trefferNummer, trefferOeffnen, dateiansichtEinrichten, istOeffnenWunsch, pfadAusAntwortOeffnen } from './dateiansicht.js'
import { kartenEinrichten, kartenAnwenden, kartenFormularFuellen, kartenFormularLesen } from './karten.js'
import { nichtStoerenErkennen, uhrzeitText } from './nichtstoeren.js'
import { introAbspielen, introAus, begruessungBauen } from './startsequenz.js'
import { pluginsStarten, pluginEingabe, pluginBefehl, kontextFuer, pluginBegruessung } from './plugin-host.js'
import { wissenEinrichten, wissenLaden, bibliothekLaden, entscheidungenLaden, dateienLaden, morgenberichtLaden } from './wissen.js'

const $ = (id) => document.getElementById(id)
const api = window.jarves

const BEREICHE = [
  { id: 'zentrale', name: 'Zentrale', aktiv: true },
  { id: 'crew', name: 'Crew', aktiv: true },
  { id: 'jobs', name: 'Jobs', aktiv: true },
  { id: 'kanban', name: 'Kanban', aktiv: true },
  { id: 'bibliothek', name: 'Bibliothek', aktiv: true },
  { id: 'entscheidungen', name: 'Entscheidungen', aktiv: true },
  { id: 'wissen', name: 'Wissen', aktiv: true },
  { id: 'dateien', name: 'Dateien', aktiv: true },
  { id: 'system', name: 'System', aktiv: true }
]

const ZUSTAND_TEXT = {
  bereit: 'Bereit',
  denkt: 'Denke nach',
  antwortet: 'Antworte',
  spricht: 'Spreche',
  hoert: 'Höre zu',
  versteht: 'Verstehe',
  getrennt: 'Nicht verbunden'
}

let einstellungen = null
let verbunden = false
let beschaeftigt = false
let aktuelleAntwort = null // { el, textEl, roh }
let werkzeug = ''
let spricht = false
let hoert = false // Mikrofon nimmt gerade auf
let versteht = false // Hermes schreibt das Gesprochene gerade mit
let letzteEingabeGesprochen = false
let wakeAktiv = false
let wakeGrund = '' // warum „Hey Luzzy“ nicht zuhört (siehe wakeEinrichten)

const reaktor = reaktorErstellen($('reaktor-rahmen'))
const welle = welleErstellen($('welle'))

let reinredenAus = () => {} // beendet die Reinreden-Erkennung, solange Luzzy nicht spricht
// Redet Felix rein, hält Luzzy kurz an und hört zu (siehe sprechenStarten, unterbrechung)
function reinredenStarten() {
  reinredenAus()
  if (!verbunden) return
  reinredenAus = mikrofon.reinreden({
    ausgabe: () => vorleser.ausgabePegel(),
    beiSprache: () => sprechenStarten({ ohneSpracheNach: 2500, unterbrechung: true })
  })
}
const vorleser = vorleserErstellen({
  beiStart: () => {
    spricht = true
    // „Hey Luzzy“ oder einfach Reinreden unterbricht sie (Echo-Unterdrückung filtert ihre eigene Stimme); abschaltbar
    const unterbrechen = einstellungen?.sprache?.unterbrechen !== false
    mikrofon.wakeSetzen(wakeAktiv && unterbrechen)
    if (unterbrechen) reinredenStarten()
    zustandZeigen()
  },
  beiEnde: () => {
    reinredenAus()
    spricht = false
    mikrofon.wakeSetzen(wakeAktiv)
    zustandZeigen()
    weiterZuhoeren()
  },
  beiPegel: (werte, mittel) => {
    welle.pegel(werte)
    document.documentElement.style.setProperty('--pegel', String(mittel || 0))
  },
  beiFehler: (e) => systemNachricht(`Stimme: ${e.message}`),
  // Mitten im Sprechen abgebrochen (Felix redet, Esc, „Stopp“): wieder bereit, ohne weiter zuzuhören
  beiAbbruch: () => {
    reinredenAus()
    spricht = false
    mikrofon.wakeSetzen(wakeAktiv)
    zustandZeigen()
  }
})

// ── Sprechen: Mikrofon → Hermes schreibt mit → an Luzzy ──
const mikrofon = mikrofonErstellen({
  beiZustand: mikrofonStatusZeigen,
  beiPegel: (p) => {
    if (!hoert) return
    welle.pegel(Array.from({ length: 24 }, (_, i) => p * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + performance.now() / 120)))))
    document.documentElement.style.setProperty('--pegel', String(p * 0.8))
  },
  beiPcm: (bytes) => api.wake.fuettern(bytes)
})

function mikrofonStatusZeigen(z, text) {
  const el = $('mikrofon-status')
  const anzeige = z === 'bereit' && wakeAktiv ? 'wake' : z
  el.dataset.zustand = anzeige
  const texte = {
    aus: 'Mikrofon …',
    bereit: 'Mikrofon bereit',
    wake: 'Hört auf „Hey Luzzy“',
    'nimmt-auf': 'Nimmt auf',
    'kein-mikrofon': 'Kein Mikrofon',
    verweigert: 'Mikrofon verweigert'
  }
  // „Hey Luzzy“ gewünscht, aber Hermes hört nicht: kleiner Hinweis statt stiller Konsolen-Warnung
  const wakeFehlt = z === 'bereit' && !wakeAktiv && wakeGrund && einstellungen?.sprache?.aktivierungswort
  el.querySelector('.verbindung-text').textContent = wakeFehlt ? 'Mikrofon bereit · „Hey Luzzy“ aus' : texte[anzeige] || text || z
  el.title = wakeFehlt ? wakeHinweis() : texte[anzeige] || text || z // Tooltip, auch wenn oben nur der Punkt zu sehen ist
  $('mikrofon').classList.toggle('fehlt', z === 'kein-mikrofon' || z === 'verweigert')
  $('mikrofon').title = z === 'kein-mikrofon' ? 'Kein Mikrofon gefunden. Einstecken, dann klicken.' : 'Sprechen (Strg+Leertaste)'
  const e = $('e-mikrofon-status')
  if (e) e.textContent = `Mikrofon: ${texte[anzeige] || text || z}${wakeFehlt ? `. ${wakeHinweis()}` : ''}`
}

// Kurzer Signalton, wenn Luzzy zuhört
function piep(hoch = true) {
  try {
    const ctx = new AudioContext()
    const osz = ctx.createOscillator()
    const laut = ctx.createGain()
    osz.frequency.value = hoch ? 880 : 520
    laut.gain.setValueAtTime(0.0001, ctx.currentTime)
    laut.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    laut.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osz.connect(laut).connect(ctx.destination)
    osz.start()
    osz.stop(ctx.currentTime + 0.2)
    osz.onended = () => ctx.close()
  } catch {
    // ohne Ton weiter
  }
}

let sprichtGerade = false // verhindert doppelten Start
// unterbrechung: Felix hat reingeredet, während Luzzy spricht. Sie hält nur an; erst wenn wirklich etwas
// verstanden wurde, bricht sie ab. Sonst (Husten, ihr eigenes Echo) spricht sie einfach weiter.
async function sprechenStarten({ ohneSpracheNach = 7000, leise = false, diktat = false, unterbrechung = false } = {}) {
  if (mikrofon.nimmtAuf()) return mikrofon.stoppen() // zweiter Druck = fertig gesprochen
  if (sprichtGerade || !verbunden) return unterbrechung && vorleser.fortsetzen()
  sprichtGerade = true
  const weiterSprechen = () => {
    if (!unterbrechung || !vorleser.pausiert()) return false
    vorleser.fortsetzen()
    reinredenStarten()
    return true
  }
  try {
    if (unterbrechung) vorleser.pausieren()
    else {
      if (beschaeftigt) api.hermes.abbrechen('zentrale') // wer spricht, unterbricht Luzzy
      vorleser.stoppen()
    }
    if (!(await mikrofon.starten())) {
      untertitelZeigen('Kein Mikrofon gefunden. Steck eins ein, dann klick auf das Mikrofon.', { fertig: true })
      return
    }
    if (!leise) piep(true)
    hoert = true
    zustandZeigen()
    if (diktat) untertitelZeigen('Diktat läuft. Sprich ganz normal, auch länger. Fertig: kurz Pause machen oder aufs Mikrofon klicken.', { fertig: true })
    // Diktat: Denkpausen bis 3,5 Sekunden, höchstens 5 Minuten
    const ton = await mikrofon.aufnehmen(diktat ? { ohneSpracheNach: 10000, stilleNach: 3500, maxDauer: 300000 } : { ohneSpracheNach })
    hoert = false
    welle.pegel(null)
    document.documentElement.style.setProperty('--pegel', '0')
    if (!ton && weiterSprechen()) return zustandZeigen()
    if (!ton) {
      if (diktat) untertitelZeigen('Ich hab nichts gehört. Sag „Diktat“, wenn du nochmal willst.', { fertig: true })
      zustandZeigen()
      return
    }
    piep(false)
    versteht = true
    zustandZeigen()
    let text = ''
    try {
      text = await api.sprache.transkribieren(ton.bytes, ton.mime)
    } catch (e) {
      systemNachricht(`Spracherkennung: ${e.message}`)
    }
    versteht = false
    zustandZeigen()
    if (!text && weiterSprechen()) return
    if (!text) {
      untertitelZeigen('Hab dich nicht verstanden. Nochmal?', { fertig: true })
      return
    }
    if (unterbrechung) {
      // Felix hat wirklich etwas gesagt: Luzzy hört auf, eine laufende Antwort wird abgebrochen
      vorleser.stoppen()
      if (beschaeftigt) {
        api.hermes.abbrechen('zentrale')
        for (let i = 0; i < 30 && beschaeftigt; i++) await new Promise((r) => setTimeout(r, 100)) // bis Hermes bestätigt
      }
    }
    if (diktat) {
      losgelegt = true
      diktatVerarbeiten({ art: '', inhalt: text }, { gesprochen: true }) // nicht warten, siehe unten
      return
    }
    const feld = document.querySelector('.befehl .eingabe-text')
    feld.value = text
    feldHoehe(feld)
    // Nicht warten: Hermes meldet das Absenden erst, wenn die ganze Antwort fertig ist. Bis dahin wäre das
    // Mikrofon gesperrt und Felix könnte Luzzy nicht unterbrechen.
    if (einstellungen.sprache?.automatischSenden) abschicken(feld, { gesprochen: true })
    else feld.focus()
  } finally {
    hoert = false
    versteht = false
    sprichtGerade = false
    zustandZeigen()
    if (wakeAktiv) api.wake.fortsetzen()
  }
}

// Nach Luzzys Antwort kurz weiter zuhören, wenn die Frage gesprochen war (Gesprächsmodus)
function weiterZuhoeren() {
  if (!letzteEingabeGesprochen || !einstellungen?.sprache?.weiterZuhoeren) return
  letzteEingabeGesprochen = false
  setTimeout(() => {
    if (!beschaeftigt && !spricht && !hoert) sprechenStarten({ ohneSpracheNach: 8000, leise: false })
  }, 350)
}

// Aktivierungswort bei Hermes scharf schalten (oder aus). Klappt es nicht, steht der Grund in wakeGrund
// (angezeigt beim Mikrofon oben, in den Einstellungen → Sprechen und im Selbsttest).
const wakeHinweis = () =>
  wakeGrund === 'disabled'
    ? '„Hey Luzzy“ ist in Hermes aus. Meist, weil die Hermes-App offen war und Jarves-OS an ihr Hermes angedockt hat (anderes Profil). Hermes-App schließen und Jarves-OS neu starten.'
    : `„Hey Luzzy“ hört gerade nicht zu (${wakeGrund}).`
async function wakeEinrichten() {
  const soll = Boolean(einstellungen?.sprache?.aktivierungswort) && verbunden
  if (!soll) {
    if (wakeAktiv) await api.wake.stoppen()
    wakeAktiv = false
    mikrofon.wakeSetzen(false)
    mikrofonStatusZeigen(mikrofon.zustand())
    return
  }
  if (!(await mikrofon.starten())) return
  try {
    const antwort = await api.wake.starten()
    wakeAktiv = Boolean(antwort?.started)
    wakeGrund = wakeAktiv ? '' : antwort?.reason || 'unbekannt'
  } catch (e) {
    wakeAktiv = false
    wakeGrund = e.message
  }
  mikrofon.wakeSetzen(wakeAktiv && (!spricht || einstellungen?.sprache?.unterbrechen !== false))
  mikrofonStatusZeigen(mikrofon.zustand())
}

$('mikrofon').addEventListener('click', () => sprechenStarten())
api.sprache.beiUmschalten(() => sprechenStarten())
// Mikrofon eingesteckt: automatisch aufnehmen
navigator.mediaDevices.addEventListener('devicechange', () => {
  if (['kein-mikrofon', 'aus'].includes(mikrofon.zustand())) wakeEinrichten()
})

// ── Zustand von Luzzy ──
function zustand() {
  if (!verbunden) return 'getrennt'
  if (hoert) return 'hoert'
  if (versteht) return 'versteht'
  if (spricht) return 'spricht'
  if (beschaeftigt) return aktuelleAntwort?.roh ? 'antwortet' : 'denkt'
  return 'bereit'
}

// Mini-Modus (Leiste oben mittig, siehe mini.html): bekommt Zustand und Pegel, solange sie offen ist
let miniAn = false
let miniLetzterPegel = 0
function miniSenden(pegel) {
  if (!miniAn) return
  if (pegel !== undefined) {
    const jetzt = performance.now()
    if (pegel && jetzt - miniLetzterPegel < 40) return // höchstens 25× pro Sekunde
    miniLetzterPegel = jetzt
  }
  const z = zustand()
  api.fenster.miniZustand({ zustand: z, titel: z === 'bereit' && wakeAktiv ? 'Hört auf „Hey Luzzy“' : ZUSTAND_TEXT[z], ...(pegel !== undefined ? { pegel } : {}) })
}
api.fenster.beiMini((an) => {
  miniAn = Boolean(an)
  if (miniAn) setTimeout(() => miniSenden(), 300) // die Leiste braucht einen Moment zum Laden
})
{
  const pegelZeigen = welle.pegel.bind(welle)
  welle.pegel = (werte) => {
    pegelZeigen(werte)
    miniSenden(werte || null)
  }
}

function zustandZeigen() {
  const z = zustand()
  miniSenden()
  reaktor.zustand(z === 'versteht' ? 'denkt' : z)
  const el = $('luzzy-zustand')
  if (werkzeug && beschaeftigt) el.innerHTML = `Arbeite · <b>${maskieren(werkzeug)}</b>`
  else if (z === 'hoert') el.innerHTML = `<b>${ZUSTAND_TEXT[z]}</b> …`
  else el.innerHTML = z === 'bereit' ? `<b>${ZUSTAND_TEXT[z]}</b>` : `${ZUSTAND_TEXT[z]}${z === 'denkt' || z === 'versteht' ? ' …' : ''}`
  const welleAktiv = ['denkt', 'antwortet', 'spricht', 'hoert', 'versteht'].includes(z)
  $('welle').className = `welle${welleAktiv ? ' aktiv' : ''}${z === 'denkt' || z === 'versteht' ? ' denkt' : ''}`
  $('mikrofon').classList.toggle('an', hoert)
  for (const knopf of document.querySelectorAll('.senden')) {
    knopf.textContent = beschaeftigt ? 'Stopp' : 'Senden'
    knopf.classList.toggle('stopp', beschaeftigt)
    knopf.type = beschaeftigt ? 'button' : 'submit'
  }
}

// ── Untertitel unter dem Reaktor: Luzzys aktuelle Antwort in Kurzform ──
function klartext(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
function untertitelZeigen(text, { fertig = false } = {}) {
  const el = $('untertitel')
  const kurz = klartext(text)
  if (!kurz) return (el.textContent = '')
  const zuLang = kurz.length > 320
  const sichtbar = fertig ? kurz.slice(0, 320) : kurz.slice(-320)
  el.innerHTML = `${!fertig && zuLang ? '… ' : ''}${maskieren(sichtbar)}${fertig && zuLang ? ' …' : ''}${
    fertig && zuLang && panelGeschlossen() ? '<span class="leise-hinweis">Ganze Antwort im Gespräch</span>' : ''
  }`
}

const maskieren = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ── Gespräch ──
function nachrichtAnzeigen(rolle, text, { laeuft = false } = {}) {
  $('gespraech-leer')?.remove()
  const el = document.createElement('div')
  el.className = `msg ${rolle}`
  const wer = document.createElement('div')
  wer.className = 'msg-wer'
  wer.textContent = rolle === 'luzzy' ? 'LUZZY' : 'FELIX'
  if (rolle === 'luzzy') {
    el.roh = text // Markdown für „Antwort merken“
    wer.insertAdjacentHTML('beforeend', '<button class="msg-merken" type="button" title="Antwort im Vault merken (Jarves-OS\\Gemerkte Antworten)">📌</button>')
  }
  const textEl = document.createElement('div')
  textEl.className = 'msg-text'
  if (rolle === 'felix') textEl.textContent = text
  else textEl.innerHTML = markdownZuHtml(text) + (laeuft ? '<span class="cursor"></span>' : '')
  el.append(wer, textEl)
  $('gespraech').appendChild(el)
  runterScrollen()
  return { el, textEl }
}

function systemNachricht(text) {
  $('gespraech-leer')?.remove()
  const el = document.createElement('div')
  el.className = 'msg system'
  el.textContent = text
  $('gespraech').appendChild(el)
  runterScrollen()
}

function runterScrollen() {
  const g = $('gespraech')
  g.scrollTop = g.scrollHeight
  vorschauAktualisieren()
}

// Vorschau rechts: die letzten drei Nachrichten, je zwei Zeilen
function vorschauAktualisieren() {
  const letzte = [...$('gespraech').querySelectorAll('.msg.luzzy, .msg.felix')].slice(-3)
  const liste = $('vorschau-liste')
  if (!letzte.length) return (liste.innerHTML = '<div class="leise">Noch nichts gesagt.</div>')
  liste.innerHTML = letzte
    .map((m) => {
      const luzzy = m.classList.contains('luzzy')
      const text = klartext(m.querySelector('.msg-text')?.textContent || '') || '…'
      return `<div class="vorschau-zeile ${luzzy ? 'luzzy' : 'felix'}"><b>${luzzy ? 'LUZZY' : 'FELIX'}</b>${maskieren(text)}</div>`
    })
    .join('')
}

function antwortAktualisieren() {
  if (!aktuelleAntwort) return
  const hinweis = werkzeug ? `<div class="werkzeug-hinweis">Werkzeug: <b>${maskieren(werkzeug)}</b></div>` : ''
  aktuelleAntwort.textEl.innerHTML = markdownZuHtml(aktuelleAntwort.roh) + '<span class="cursor"></span>' + hinweis
  runterScrollen()
}

// ── Aktivität rechts ──
const aktivitaeten = []
function aktivitaetMelden(text, laeuft = false) {
  const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  aktivitaeten.unshift({ zeit, text, laeuft })
  aktivitaeten.length = Math.min(aktivitaeten.length, 8)
  aktivitaetZeigen()
}
function aktivitaetZeigen() {
  const el = $('aktivitaet')
  if (!aktivitaeten.length) return (el.innerHTML = '<div class="leise">Nichts los.</div>')
  el.innerHTML = aktivitaeten
    .map((a) => `<div class="eintrag${a.laeuft ? ' laeuft' : ''}"><time>${a.zeit}</time><span>${maskieren(a.text)}</span></div>`)
    .join('')
}
function laufendeBeenden() {
  aktivitaeten.forEach((a) => (a.laeuft = false))
  aktivitaetZeigen()
}

// ── „Wiederhol das“: Luzzys letzte Antwort nochmal vorlesen, sofort und ohne Hermes zu fragen ──
let letzteAntwort = ''
const WIEDERHOLEN = new Set([
  'wiederhol', 'wiederhole', 'wiederhol das', 'wiederhole das', 'wiederhol es', 'wiederhole es',
  'wiederhol das nochmal', 'wiederhole das nochmal', 'wiederhol das noch mal', 'wiederhole das noch mal',
  'sag das nochmal', 'sag das noch mal', 'sag es nochmal', 'sag es noch mal', 'kannst du das wiederholen',
  'was hast du gesagt', 'was hast du gerade gesagt', 'wie' // 'wie' = „Wie bitte?“ (bitte wird vorher entfernt)
])
function istWiederholen(text) {
  const kern = text.toLowerCase()
    .replace(/[.,!?;:"„“]/g, ' ')
    .replace(/\bbitte\b/g, ' ')
    .replace(/^\s*(hey\s+)?luzzy\b/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return WIEDERHOLEN.has(kern)
}
function letzteAntwortMerken(text) {
  letzteAntwort = text || ''
  $('nochmal').hidden = !letzteAntwort
  $('antwort-merken').hidden = !letzteAntwort
  $('antwort-merken').textContent = '📌 Merken'
}
function wiederholen({ gesprochen = false } = {}) {
  letzteEingabeGesprochen = gesprochen // Gesprächsmodus: danach wie gewohnt weiter zuhören
  const text = letzteAntwort || 'Ich hab noch nichts gesagt, was ich wiederholen könnte.'
  untertitelZeigen(text, { fertig: true })
  vorleser.sprechen(text, stimmOptionen())
}
$('nochmal').addEventListener('click', () => !beschaeftigt && wiederholen())

// ── Antwort merken (📌): Luzzys Antwort als Notiz in den Vault (Jarves-OS\Gemerkte Antworten) ──
let letzteFrage = ''
async function antwortMerken(antwort, frage, knopf) {
  try {
    const pfad = await api.vault.antwortMerken(antwort, frage)
    knopf.textContent = knopf.id === 'antwort-merken' ? '✓ Gemerkt' : '✓'
    knopf.disabled = true
    knopf.title = `Gemerkt: ${pfad}`
    aktivitaetMelden('Antwort im Vault gemerkt')
  } catch (e) {
    systemNachricht(`Merken ging nicht: ${e.message}`)
  }
}
$('antwort-merken').addEventListener('click', (e) => antwortMerken(letzteAntwort, letzteFrage, e.currentTarget))
$('gespraech').addEventListener('click', (e) => {
  const knopf = e.target.closest('.msg-merken')
  if (!knopf) return
  const msg = knopf.closest('.msg')
  let frage = msg.previousElementSibling
  while (frage && !frage.classList.contains('felix')) frage = frage.previousElementSibling
  antwortMerken(msg.roh || msg.querySelector('.msg-text').innerText, frage?.querySelector('.msg-text').textContent || '', knopf)
})

// ── „Nicht stören“: Meldungen nur in der Liste, ohne Ton und Ansage, bis zur gewählten Uhrzeit ──
function nichtStoerenZeigen() {
  const bis = einstellungen?.nichtStoerenBis || 0
  const aktiv = bis > Date.now()
  $('nicht-stoeren').hidden = !aktiv
  if (aktiv) $('nicht-stoeren').querySelector('.verbindung-text').textContent = `Ruhe bis ${uhrzeitText(bis)}`
  return aktiv
}
async function nichtStoerenSetzen(bis, { gesprochen = false, bestaetigen = true } = {}) {
  einstellungen = await api.einstellungen.speichern({ nichtStoerenBis: bis })
  nichtStoerenZeigen()
  if (!bestaetigen) return
  letzteEingabeGesprochen = gesprochen
  const text = bis ? `Alles klar, bis ${uhrzeitText(bis)} Uhr keine Meldungen. Ich sammle sie für dich.` : 'Meldungen sind wieder an.'
  untertitelZeigen(text, { fertig: true })
  vorleser.sprechen(text, stimmOptionen())
}
$('nicht-stoeren').addEventListener('click', () => nichtStoerenSetzen(0))
setInterval(nichtStoerenZeigen, 30000) // Symbol verschwindet von selbst, wenn die Zeit um ist

// ── Selbsttest: prüft alles und Luzzy sagt, was nicht geht ──
let geladenePlugins = null
const SELBSTTEST = /^(?:(?:hey )?luzzy )?(?:mach |starte? )?(?:(?:einen|den|mal einen) )?(?:selbsttest|systemcheck|systemtest|system check)(?: machen| starten)?$/
async function selbsttest({ gesprochen = false } = {}) {
  const zusammenfassung = await selbsttestStarten({
    verbunden: () => verbunden,
    hermesText: () => $('verbindung').querySelector('.verbindung-text').textContent,
    mikrofonZustand: () => mikrofon.zustand(),
    wakeGewuenscht: () => Boolean(einstellungen?.sprache?.aktivierungswort),
    wakeAktiv: () => wakeAktiv,
    wakeHinweis: () => (wakeGrund ? wakeHinweis() : ''),
    stimmOptionen,
    pluginAnzahl: () => geladenePlugins
  })
  if (!zusammenfassung) return
  letzteEingabeGesprochen = gesprochen
  untertitelZeigen(zusammenfassung, { fertig: true })
  vorleser.sprechen(zusammenfassung, stimmOptionen())
}
$('selbsttest-starten').addEventListener('click', () => selbsttest())
$('selbsttest-nochmal').addEventListener('click', () => selbsttest())

// ── Timer abgelaufen: Ton, dann sagt Luzzy es. Auch in der Ruhezeit und bei „Nicht stören“,
// den Timer hat Felix ja selbst gestellt. Mehrere nacheinander, nie während Felix spricht.
let alarmKette = Promise.resolve()
function timerAlarm({ text, titel }) {
  api.fenster.aufmerksamkeit()
  meldungNeu({ art: 'timer', titel, anzeige: text, zeit: Date.now(), still: true })
  alarmKette = alarmKette.then(async () => {
    for (let i = 0; i < 120 && (hoert || versteht); i++) await new Promise((r) => setTimeout(r, 500))
    await tonSpielen('wecker')
    aktivitaetMelden(titel)
    lokalAntworten(text)
    await new Promise((r) => setTimeout(r, 1500))
  })
}

// ── Kopfzeile der Mitte: nur so weit kürzen, wie es der Platz verlangt ──
// Stufen: k1 kurzes Datum, k2 kurze Namen („Hermes“), k3 nur Punkte (Tooltip), k4 Datum weg (Uhrzeit bleibt)
const kopf = document.querySelector('.mitte-kopf')
function kopfPasst() {
  const r = kopf.getBoundingClientRect()
  const rechts = r.right - parseFloat(getComputedStyle(kopf).paddingRight)
  const kinder = [...kopf.children].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none')
  return kinder.every((e) => e.getBoundingClientRect().right <= rechts + 0.5)
}
let kopfGeplant = false
function kopfAnpassen() {
  if (kopfGeplant) return
  kopfGeplant = true
  requestAnimationFrame(() => {
    kopfGeplant = false
    for (let stufe = 0; stufe <= 4; stufe++) {
      for (let k = 1; k <= 4; k++) kopf.classList.toggle(`k${k}`, k <= stufe)
      if (kopfPasst()) break
    }
  })
}
new ResizeObserver(kopfAnpassen).observe(kopf)
new MutationObserver(kopfAnpassen).observe(kopf, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] })

// ── Seitenleisten einklappen: links bleibt eine schmale Leiste mit Symbolen, rechts verschwindet ganz ──
function leistenAnwenden() {
  const l = einstellungen?.leisten || { links: true, rechts: true }
  document.body.classList.toggle('links-zu', l.links === false)
  document.body.classList.toggle('rechts-zu', l.rechts === false)
  $('links-umschalten').title = l.links === false ? 'Leiste aufklappen (Strg+B)' : 'Leiste einklappen (Strg+B)'
  $('rechts-umschalten').title = l.rechts === false ? 'Rechte Spalte aufklappen (Strg+J)' : 'Rechte Spalte einklappen (Strg+J)'
  titelfarbeSetzen()
}
function leisteUmschalten(seite) {
  // Erst sofort übernehmen, dann speichern: zweimal schnell hintereinander darf sich nicht überschreiben
  const l = { links: true, rechts: true, ...(einstellungen?.leisten || {}) }
  l[seite] = l[seite] === false
  einstellungen.leisten = l
  leistenAnwenden()
  api.einstellungen.speichern({ leisten: l })
}
$('links-umschalten').addEventListener('click', () => leisteUmschalten('links'))
$('rechts-umschalten').addEventListener('click', () => leisteUmschalten('rechts'))
// Strg+Alt+← / → : exakt an die linke/rechte Bildschirmhälfte, Strg+Alt+↑ : ganzer Bildschirm
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || !e.altKey || e.shiftKey) return
  const seite = { ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'voll' }[e.key]
  if (!seite) return
  e.preventDefault()
  api.fenster.andocken(seite)
})
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.shiftKey || e.altKey) return
  const taste = e.key.toLowerCase()
  if (taste === 'b' || taste === 'j') {
    e.preventDefault()
    leisteUmschalten(taste === 'b' ? 'links' : 'rechts')
  }
})

// ── Befehlspalette (Strg+P): alles, was man sonst klickt, per Tippen ──
// An Luzzy schicken wie getippt (Jarves-OS-Befehle, Routinen und Plugins greifen wie gewohnt)
function paletteSenden(text) {
  ansichtZeigen('zentrale')
  const feld = document.querySelector('.befehl .eingabe-text')
  feld.value = text
  abschicken(feld)
}
// Beispiel in die Eingabe legen, „…“ markiert zum Überschreiben
function paletteEinfuegen(text) {
  ansichtZeigen('zentrale')
  const feld = document.querySelector('.befehl .eingabe-text')
  feld.value = text
  feldHoehe(feld)
  feld.focus()
  const i = text.indexOf('…')
  if (i >= 0) feld.setSelectionRange(i, i + 1)
  else feld.setSelectionRange(text.length, text.length)
}
// Sprachbefehle (gehen gesprochen nach „Hey Luzzy“ oder getippt). Mit „…“: Beispiel zum Anpassen in die Eingabe.
const SPRACHBEFEHLE = [
  ['Hey Luzzy', 'Luzzy hört zu (oder Strg+Leertaste)', 'aktivierungswort zuhören', () => sprechenStarten()],
  ['Einfach reinreden (während sie spricht)', 'Luzzy hört auf und hört dir zu, auch „Hey Luzzy“ geht', 'unterbrechen dazwischen reden'],
  ['Stopp', 'Luzzy hört sofort auf (auch „Halt“, „Das reicht“, „Psst“)', 'still ruhe aufhören abbrechen'],
  ['Wiederhol das', 'letzte Antwort nochmal', 'wie bitte nochmal vorlesen'],
  ['Was hast du gerade gesagt?', '', 'wiederholen'],
  ['Timer 15 Minuten für …', 'z. B. die Nudeln', 'eieruhr countdown kochen'],
  ['Weck mich um … Uhr', '', 'wecker aufwachen morgen'],
  ['Erinner mich um … Uhr an …', 'oder „in 20 Minuten“', 'erinnerung termin'],
  ['Wie lange noch?', 'Timer abfragen', 'timer rest'],
  ['Timer um 5 Minuten verlängern', '', 'länger mehr zeit'],
  ['Alle Timer stoppen', '', 'timer löschen aus'],
  ['Nicht stören für … Minuten', 'oder „bis 15 Uhr keine Meldungen“', 'ruhe still'],
  ['Meldungen wieder an', 'beendet Nicht stören', 'ruhe vorbei'],
  ['Neues Gespräch …', 'eigenes Thema, z. B. „Neues Gespräch Shop“; Luzzy behält pro Thema den Faden', 'thema chat gespräch neu'],
  ['Wechsel zum Gespräch …', 'auch oben im Gesprächsfenster auswählen', 'thema chat gespräch wechseln'],
  ['Welche Gespräche gibt es?', '', 'themen gespräche liste'],
  ['Such die Datei … und öffne sie', 'zeigt sie direkt in Jarves (Notiz, Bild, PDF, Video …)', 'datei suchen öffnen finden dokument bild pdf'],
  ['Öffne die Datei …', 'auch „Zeig mir das Bild …“, „Öffne das PDF …“; mehrere Treffer: „die zweite“', 'datei öffnen zeigen bild foto pdf video tabelle'],
  ['Merk dir: …', 'Gedankenspeicher', 'notiz idee notieren'],
  ['Neue Idee: …', 'Luzzy schreibt sie sauber als Notiz in den Vault (Jarves-OS, Ideen)', 'idee notiz vault diktat schlagworte'],
  ['Diktat', 'frei reden, auch länger: Luzzy macht eine fertige Mail oder Nachricht daraus (Zwischenablage)', 'diktieren diktiermodus mail text', () => sprechenStarten({ diktat: true })],
  ['Schreib eine Mail an …, dass …', 'fertige Mail in der Zwischenablage, abschicken tust du selbst', 'mail email nachricht whatsapp brief entwurf diktat'],
  ['Was wollte ich mir merken?', '', 'gedanken notizen'],
  ['Neue Aufgabe: … bis Freitag', 'oder „morgen um 14 Uhr“', 'todo to-do liste'],
  ['Erledigt: …', 'Aufgabe abhaken', 'fertig abhaken aufgabe'],
  ['Was steht auf meiner Liste?', 'offene Aufgaben', 'aufgaben todo'],
  ['Was muss ich heute noch machen?', 'Luzzy mit Aufgaben und Terminen', 'aufgaben termine heute'],
  ['Wochen-Review', 'Woche zusammenfassen, Ziele eintragen', 'wochenrückblick ziele'],
  ['Fokus', '25 Minuten, Luzzy stört nicht', 'pomodoro konzentrieren'],
  ['Fokus … Minuten', '', 'pomodoro'],
  ['Fokus beenden', 'auch „Fokus pausieren“, „Weiter mit Fokus“', 'pomodoro stop'],
  ['Wie wird das Wetter morgen?', 'Luzzy bekommt die Wetterdaten', 'wetter regen'],
  ['Was steht an?', 'Termine und Jobs', 'termine kalender'],
  ['Wie viele Bestellungen haben wir insgesamt?', 'Meilensteine', 'meilenstein shop'],
  ['Mach einen Selbsttest', 'prüft alles', 'systemcheck check']
]
// Tastenkürzel (zum Nachschlagen, Anklicken führt aus, wo es geht)
const TASTENKUERZEL = [
  ['Befehlspalette', 'Strg+P', () => {}],
  ['Sprechen (auch im Hintergrund)', 'Strg+Leertaste', () => sprechenStarten()],
  ['Zwischenablage an Luzzy (aus jedem Programm)', 'Strg+Umschalt+L', () => ablageOeffnen()],
  ['Gespräch öffnen/schließen', 'Strg+K', () => panelSetzen(panelGeschlossen())],
  ['Linke Leiste ein/aus (oder Klick aufs Logo)', 'Strg+B', () => leisteUmschalten('links')],
  ['Rechte Spalte ein/aus', 'Strg+J', () => leisteUmschalten('rechts')],
  ['Fenster: linke Bildschirmhälfte', 'Strg+Alt+←', () => api.fenster.andocken('links')],
  ['Fenster: rechte Bildschirmhälfte', 'Strg+Alt+→', () => api.fenster.andocken('rechts')],
  ['Fenster: ganzer Bildschirm', 'Strg+Alt+↑', () => api.fenster.andocken('voll')],
  ['Mini-Modus: nur eine Leiste oben mittig (auch aus jedem Programm)', 'AltGr+L', () => api.fenster.mini(true)],
  ['Mini-Modus an/aus (andere Taste dafür)', 'Strg+Umschalt+M', () => api.fenster.mini(true)],
  ['Nachricht abschicken', 'Enter', () => {}],
  ['Neue Zeile in der Eingabe', 'Umschalt+Enter', () => {}],
  ['Luzzy hört auf zu sprechen', 'Esc', () => vorleser.stoppen()],
  ['Fenster, Palette, Dialog schließen', 'Esc', () => {}],
  ['Zwischenablage-Fenster: Zusammenfassen, Verbessern, Übersetzen, Beantworten', '1 – 4', () => {}],
  ['Entwickler-Werkzeuge (Fehlersuche)', 'F12', () => {}]
]
let paletteRoutinen = [] // aus dem Routinen-Plugin, beim Öffnen der Palette frisch geladen
function paletteBefehle() {
  const liste = BEREICHE.filter((b) => b.aktiv).map((b) => ({ name: `${b.name} öffnen`, gruppe: 'Bereich', stichwoerter: 'gehe zu tab zeige', ausfuehren: () => ansichtZeigen(b.id) }))
  // Routinen mit ihren Auslösewörtern (auch die ohne Knopf); ohne Routinen-Daten: die Schnellbefehl-Knöpfe
  if (paletteRoutinen.length) {
    for (const r of paletteRoutinen) {
      const wort = (r.ausloeser || [])[0]
      if (!wort) continue
      liste.push({ name: r.name, gruppe: 'Routine', hinweis: `sag „${r.ausloeser.join('“ oder „')}“`, stichwoerter: `routine ${r.ausloeser.join(' ')}`, sagen: true, ausfuehren: () => paletteSenden(wort) })
    }
  } else {
    for (const knopf of document.querySelectorAll('#schnellbefehle [data-plugin-knopf]')) {
      liste.push({ name: knopf.textContent.trim(), gruppe: 'Schnellbefehl', stichwoerter: `routine ${knopf.title}`, ausfuehren: () => knopf.click() })
    }
  }
  for (const [satz, hinweis, stichwoerter, eigen] of SPRACHBEFEHLE) {
    liste.push({ name: `„${satz}“`, gruppe: 'Sprachbefehl', hinweis, stichwoerter, sagen: true, ausfuehren: eigen || (() => (satz.includes('…') ? paletteEinfuegen(satz) : paletteSenden(satz))) })
  }
  for (const [name, taste, aktion] of TASTENKUERZEL) liste.push({ name, gruppe: 'Tastenkürzel', taste, stichwoerter: 'taste tastatur kürzel shortcut', ausfuehren: aktion })
  const ruhe = einstellungen?.nichtStoerenBis > Date.now()
  const bescheid = (text) => {
    untertitelZeigen(text, { fertig: true })
    aktivitaetMelden(text)
  }
  liste.push(
    { name: 'Sprechen', gruppe: 'Luzzy', stichwoerter: 'mikrofon zuhören reden', ausfuehren: () => sprechenStarten() },
    { name: 'Letzte Antwort nochmal hören', gruppe: 'Luzzy', stichwoerter: 'wiederhol vorlesen', ausfuehren: () => wiederholen() },
    { name: panelGeschlossen() ? 'Gespräch öffnen' : 'Gespräch schließen', gruppe: 'Ansicht', stichwoerter: 'chat verlauf strg+k', ausfuehren: () => panelSetzen(panelGeschlossen()) },
    ruhe
      ? { name: 'Nicht stören beenden', gruppe: 'Meldungen', stichwoerter: 'ruhe meldungen wieder an', ausfuehren: () => nichtStoerenSetzen(0) }
      : { name: 'Nicht stören (1 Stunde)', gruppe: 'Meldungen', stichwoerter: 'ruhe still keine meldungen', ausfuehren: () => nichtStoerenSetzen(Date.now() + 3600000) },
    ...(timerListe().length ? [{ name: 'Alle Timer stoppen', gruppe: 'Timer', stichwoerter: 'wecker erinnerung löschen', ausfuehren: () => lokalAntworten(timerBefehl('alle timer stoppen')) }] : []),
    { name: 'Meldungen leeren', gruppe: 'Meldungen', stichwoerter: 'liste löschen', ausfuehren: () => $('meldungen-leeren').click() },
    { name: 'Zwischenablage an Luzzy', gruppe: 'Luzzy', stichwoerter: 'kopiert strg+umschalt+l zusammenfassen übersetzen verbessern', ausfuehren: () => ablageOeffnen() },
    { name: 'Selbsttest', gruppe: 'System', stichwoerter: 'prüfen check test fehler', ausfuehren: () => selbsttest() },
    {
      name: 'Jarves-OS sichern', gruppe: 'System', stichwoerter: 'backup sicherung',
      ausfuehren: async () => {
        bescheid('Sichere Jarves-OS …')
        try {
          await api.sicherung.anlegen()
          bescheid('Jarves-OS ist gesichert.')
        } catch (e) {
          bescheid(`Sicherung fehlgeschlagen: ${e.message}`)
        }
      }
    },
    { name: 'Sicherungsordner öffnen', gruppe: 'System', stichwoerter: 'backup explorer', ausfuehren: () => api.sicherung.ordner() },
    {
      name: `Vorlesen ${einstellungen?.vorlesen ? 'ausschalten' : 'einschalten'}`, gruppe: 'Einstellung', stichwoerter: 'stimme stumm leise laut',
      ausfuehren: async () => {
        einstellungen = await api.einstellungen.speichern({ vorlesen: !einstellungen.vorlesen })
        if (!einstellungen.vorlesen) vorleser.stoppen()
        bescheid(einstellungen.vorlesen ? 'Vorlesen ist an.' : 'Vorlesen ist aus.')
      }
    },
    { name: `Linke Leiste ${einstellungen?.leisten?.links === false ? 'aufklappen' : 'einklappen'}`, gruppe: 'Ansicht', stichwoerter: 'seitenleiste menü strg+b', ausfuehren: () => leisteUmschalten('links') },
    { name: `Rechte Spalte ${einstellungen?.leisten?.rechts === false ? 'aufklappen' : 'einklappen'}`, gruppe: 'Ansicht', stichwoerter: 'seitenleiste karten strg+j', ausfuehren: () => leisteUmschalten('rechts') },
    { name: 'Fenster: linke Bildschirmhälfte', gruppe: 'Fenster', stichwoerter: 'andocken halb links strg+alt', ausfuehren: () => api.fenster.andocken('links') },
    { name: 'Fenster: rechte Bildschirmhälfte', gruppe: 'Fenster', stichwoerter: 'andocken halb rechts strg+alt', ausfuehren: () => api.fenster.andocken('rechts') },
    { name: 'Fenster: ganzer Bildschirm', gruppe: 'Fenster', stichwoerter: 'maximieren vollbild groß', ausfuehren: () => api.fenster.andocken('voll') },
    { name: 'Einstellungen öffnen', gruppe: 'Einstellung', stichwoerter: 'optionen stimme animationen', ausfuehren: () => $('einstellungen-oeffnen').click() }
  )
  return liste
}
ablageEinrichten({
  verbunden: () => verbunden,
  luzzy: (text, optionen) => {
    ansichtZeigen('zentrale')
    return anLuzzy(text, optionen)
  }
})

paletteEinrichten({
  befehle: paletteBefehle,
  vorbereiten: async () => {
    const d = await api.plugins.datenLaden('routinen').catch(() => null)
    paletteRoutinen = Array.isArray(d?.routinen) ? d.routinen : []
  },
  luzzy: (text) => {
    ansichtZeigen('zentrale')
    const feld = document.querySelector('.befehl .eingabe-text')
    feld.value = text
    abschicken(feld)
  }
})
$('palette-oeffnen').addEventListener('click', paletteOeffnen)
$('mini-an').addEventListener('click', () => api.fenster.mini(true))

// ── Senden (aus der Mitte oder aus dem Gesprächs-Fenster) ──
// Luzzy antwortet selbst, ohne Hermes (Timer, Nicht stören …)
function lokalAntworten(text, { gesprochen = false } = {}) {
  letzteEingabeGesprochen = gesprochen // Gesprächsmodus: danach wie gewohnt weiter zuhören
  untertitelZeigen(text, { fertig: true })
  letzteAntwortMerken(text)
  vorleser.sprechen(text, stimmOptionen())
}

// Befehle, die Jarves-OS selbst erledigt. Gehen sofort, auch ohne Hermes und während Luzzy noch antwortet.
function lokalerBefehl(text, { gesprochen = false } = {}) {
  if (STOPPWOERTER.has(text.toLowerCase().replace(/[.,!?]/g, '').replace(/^(hey )?luzzy /, '').replace(/\s+/g, ' ').trim())) return stoppen(), true
  if (istWiederholen(text)) return wiederholen({ gesprochen }), true
  if (SELBSTTEST.test(text.toLowerCase().replace(/[,.!?]/g, '').replace(/\s+/g, ' ').trim())) return selbsttest({ gesprochen }), true
  const stoeren = nichtStoerenErkennen(text)
  if (stoeren) return nichtStoerenSetzen(stoeren.an || 0, { gesprochen }), true
  const timerAntwort = timerBefehl(text)
  if (timerAntwort) return lokalAntworten(timerAntwort, { gesprochen }), true
  const diktat = diktatErkennen(text)
  if (diktat) return diktatVerarbeiten(diktat, { gesprochen }), true
  // Mehrere Gespräche: „Neues Gespräch Shop“, „Wechsel zum Gespräch Privat“, „Welche Gespräche gibt es?“
  const gespraech = gespraechBefehl(text)
  if (gespraech) return dateiAntworten(gespraech, { gesprochen }), true
  // Datei suchen und in Jarves-OS zeigen; bei mehreren Treffern: „die zweite“
  const nummer = trefferNummer(text)
  if (nummer) return dateiAntworten(trefferOeffnen(nummer), { gesprochen }), true
  const datei = dateiBefehlErkennen(text)
  if (datei && (datei.sicher || datei.pfad)) return dateiAntworten(dateiSuchenUndZeigen(datei), { gesprochen }), true
  return false
}
async function dateiAntworten(arbeit, { gesprochen }) {
  try {
    const satz = await arbeit
    if (satz) lokalAntworten(satz, { gesprochen })
  } catch (e) {
    lokalAntworten(`Das hat nicht geklappt: ${e.message}`, { gesprochen })
  }
}
dateiansichtEinrichten({ beiFehler: (e) => systemNachricht(`Datei: ${e.message}`) })
gespraecheEinrichten({
  darfWechseln: () => verbunden && !beschaeftigt,
  // Vor dem Wechsel: Luzzy still, der neue Verlauf wird auf jeden Fall gezeichnet
  vorWechsel: () => {
    vorleser.stoppen()
    aktuelleAntwort = null
    gezeigterVerlauf = ''
    untertitelZeigen('')
  },
  melden: (satz) => untertitelZeigen(satz, { fertig: true }),
  beiFehler: (e) => systemNachricht(`Gespräch: ${e.message}`)
})

// Diktiermodus (siehe diktat.js): „Diktat“ allein startet eine lange Aufnahme, sonst macht Luzzy den Text fertig
async function diktatVerarbeiten(diktat, { gesprochen = false } = {}) {
  if (diktat.start) {
    setTimeout(() => sprechenStarten({ diktat: true }), 150) // läuft evtl. noch in der vorigen Aufnahme
    return
  }
  const kurz = diktat.inhalt.replace(/\s+/g, ' ')
  const ok = await anLuzzy(diktatAuftrag(diktat), {
    anzeige: `✍️ Diktat${diktat.art ? ` (${diktat.art})` : ''}: ${kurz.length > 300 ? `${kurz.slice(0, 300)} …` : kurz}`,
    gesprochen,
    nachher: (antwort) => diktatAblegen(antwort, diktat)
  })
  if (ok !== false) return
  // Luzzy kann gerade nicht: nichts verlieren, das Diktat roh in die Zwischenablage
  await api.zwischenablage.schreiben(diktat.inhalt).catch(() => {})
  lokalAntworten(`${verbunden ? 'Luzzy antwortet gerade noch' : 'Hermes ist gerade nicht verbunden'}. Ich hab dir das Diktat erstmal roh in die Zwischenablage gelegt.`, { gesprochen })
}

let losgelegt = false // Felix hat schon etwas gesagt oder getippt (dann keine Begrüßung mehr dazwischen)
async function abschicken(feld, { gesprochen = false } = {}) {
  const text = feld.value.trim()
  if (!text) return
  losgelegt = true
  if (lokalerBefehl(text, { gesprochen })) {
    feld.value = ''
    feldHoehe(feld)
    return
  }
  // Plugin-Befehle, die das Plugin selbst beantwortet (z. B. „Merk dir: …“)
  const pluginAntwort = await pluginBefehl(text, { gesprochen })
  if (pluginAntwort) {
    feld.value = ''
    feldHoehe(feld)
    if (pluginAntwort.antwort) lokalAntworten(pluginAntwort.antwort, { gesprochen })
    return
  }
  // „Öffne die Preisliste“: gibt es eine passende Datei, zeigt Jarves-OS sie; sonst geht der Satz an Luzzy
  const vielleichtDatei = dateiBefehlErkennen(text)
  if (vielleichtDatei && !vielleichtDatei.sicher && !vielleichtDatei.pfad) {
    const satz = await dateiSuchenUndZeigen(vielleichtDatei, { nurWennPassend: true }).catch(() => null)
    if (satz) {
      feld.value = ''
      feldHoehe(feld)
      return lokalAntworten(satz, { gesprochen })
    }
  }
  if (beschaeftigt) return
  if (!verbunden) return systemNachricht('Noch keine Verbindung zu Hermes.')
  feld.value = ''
  feldHoehe(feld)
  // Plugins dürfen die Eingabe abfangen, z. B. das Auslösewort einer Routine ("Morgenbericht")
  const treffer = await pluginEingabe(text)
  if (treffer) return anLuzzy(treffer.text, { anzeige: treffer.anzeige || text, vorlesen: treffer.vorlesen, gesprochen })
  // Fragt Felix nach Wetter oder Terminen, schickt Jarves-OS die Daten gleich mit (Luzzy muss nicht suchen)
  const mitgeliefert = await kontextFuer(text)
  if (mitgeliefert) {
    const jetzt = new Date()
    const stand = `${jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
    return anLuzzy(`${text}\n\n[Von Jarves-OS mitgeschickt, Stand ${stand}. Nutze diese Daten direkt statt zu suchen:]\n${mitgeliefert}`, { anzeige: text, gesprochen })
  }
  return anLuzzy(text, { gesprochen })
}

// ── Früher vorlesen: Luzzy spricht schon, während sie noch schreibt (Satz für Satz) ──
const VORLESE_MAX = 900 // Zeichen; lange Antworten: nur der Anfang, der Rest steht im Gespräch
let vorleseStrom = null
let vorleseBis = 0 // bis hierhin ist der Text schon an die Stimme gegangen
let vorleseZeichen = 0
function vorleseStromStarten() {
  vorleseStrom = !luzzyNachher && (einstellungen?.vorlesen || vorlesenErzwungen) ? vorleser.strom(stimmOptionen()) : null
  vorleseBis = 0
  vorleseZeichen = 0
}
function vorleseStromFuettern(roh, { schluss = false } = {}) {
  if (!vorleseStrom?.aktiv()) return
  if (vorleseZeichen >= VORLESE_MAX) {
    if (schluss && roh.slice(vorleseBis).trim()) vorleseStrom.stueck('Den Rest hab ich dir unten hingeschrieben.')
    vorleseBis = roh.length
    return
  }
  const s = satzStueck(roh, vorleseBis, { schluss, mindestens: vorleseZeichen ? 60 : 20 }) // der erste Satz darf kurz sein: schneller Start
  if (!s) return
  vorleseBis = s.bis
  vorleseZeichen += vorleseStrom.stueck(s.stueck)
}

// Luzzys Antwort weiterverarbeiten (Idee in den Vault, Diktat in die Zwischenablage) und kurz Bescheid geben
async function nachherAusfuehren(nachher, antwort, { sprechen }) {
  let satz = ''
  try {
    satz = String((await nachher(antwort)) || '')
  } catch (e) {
    satz = `Das hat nicht geklappt: ${e.message}`
  }
  if (!satz) return weiterZuhoeren()
  aktivitaetMelden(satz)
  $('untertitel').insertAdjacentHTML('beforeend', `<span class="leise-hinweis">${maskieren(satz)}</span>`)
  if (sprechen) vorleser.sprechen(satz, stimmOptionen())
  else weiterZuhoeren()
}

// „Stopp“, „Halt“, „Das reicht“: Luzzy hört sofort auf (geht nicht an Hermes)
const STOPPWOERTER = new Set(['stopp', 'stop', 'halt', 'sei still', 'hör auf', 'schluss', 'genug', 'das reicht', 'danke das reicht', 'ok stopp', 'okay stopp', 'still', 'pst', 'psst', 'schon gut'])
function stoppen() {
  vorleser.stoppen()
  if (beschaeftigt) api.hermes.abbrechen('zentrale')
  untertitelZeigen('Okay, ich bin still.', { fertig: true })
}
// Esc: Luzzy hört auf zu sprechen (wenn gerade kein Fenster offen ist, das Esc selbst braucht)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !spricht || document.querySelector('dialog[open]')) return
  vorleser.stoppen()
})

// Schickt einen Auftrag an Luzzy. anzeige = was im Gespräch als Felix' Nachricht erscheint.
// nachher(antwort) → Satz für Felix: Jarves-OS macht mit der Antwort etwas (Vault, Zwischenablage). Die Antwort
// selbst wird dann nicht vorgelesen, nur dieser Satz.
let vorlesenErzwungen = false
let luzzyNachher = null
async function anLuzzy(text, { anzeige = text, vorlesen = false, gesprochen = false, nachher = null } = {}) {
  if (!text || beschaeftigt || !verbunden) return false
  letzteEingabeGesprochen = gesprochen
  letzteFrage = anzeige
  vorlesenErzwungen = Boolean(vorlesen)
  luzzyNachher = typeof nachher === 'function' ? nachher : null
  vorleser.stoppen()
  nachrichtAnzeigen('felix', anzeige)
  untertitelZeigen('')
  beschaeftigt = true
  werkzeug = ''
  zustandZeigen()
  aktivitaetMelden('Luzzy denkt nach', true)
  try {
    await api.hermes.senden('zentrale', text)
  } catch (e) {
    beschaeftigt = false
    luzzyNachher = null
    laufendeBeenden()
    zustandZeigen()
    systemNachricht(`Konnte nicht senden: ${e.message}`)
    return false
  }
  return true
}

function feldHoehe(feld) {
  feld.style.height = 'auto'
  feld.style.height = `${Math.min(feld.scrollHeight, 160)}px`
}

for (const form of document.querySelectorAll('.eingabe-form')) {
  const feld = form.querySelector('.eingabe-text')
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    abschicken(feld)
  })
  form.querySelector('.senden').addEventListener('click', (e) => {
    if (beschaeftigt) {
      e.preventDefault()
      api.hermes.abbrechen('zentrale')
      vorleser.stoppen()
    }
  })
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      abschicken(feld)
    }
  })
  feld.addEventListener('input', () => feldHoehe(feld))
}

// ── Gesprächs-Fenster rechts: öffnen/schließen, Breite ziehen ──
const panel = $('gespraech-panel')
const panelGeschlossen = () => panel.hidden

function panelSetzen(offen, { speichern = true } = {}) {
  panel.hidden = !offen
  titelfarbeSetzen()
  $('vorschau').classList.toggle('an', offen)
  $('vorschau-aktion').textContent = offen ? 'Schließen ‹' : 'Öffnen ›'
  if (offen) {
    runterScrollen()
    if (aktuelleAnsicht === 'zentrale') document.querySelector('.befehl .eingabe-text').focus()
    else panel.querySelector('.eingabe-text').focus()
  } else document.querySelector('.befehl .eingabe-text').focus()
  if (speichern && einstellungen) {
    einstellungen.panel = { ...einstellungen.panel, offen }
    api.einstellungen.speichern({ panel: einstellungen.panel })
  }
}
function breiteSetzen(px) {
  const breite = Math.round(Math.max(320, Math.min(px, window.innerWidth * 0.7)))
  document.documentElement.style.setProperty('--panel-breite', `${breite}px`)
  return breite
}

$('vorschau').addEventListener('click', () => panelSetzen(panelGeschlossen()))
$('gespraech-schliessen').addEventListener('click', () => panelSetzen(false))
$('untertitel').addEventListener('click', () => {
  if ($('untertitel').textContent) panelSetzen(true)
})
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    panelSetzen(panelGeschlossen())
  }
})

$('griff').addEventListener('pointerdown', (e) => {
  const griff = e.currentTarget
  griff.setPointerCapture(e.pointerId)
  griff.classList.add('zieht')
  const startX = e.clientX
  const startBreite = panel.getBoundingClientRect().width
  let breite = startBreite
  const bewegen = (ev) => (breite = breiteSetzen(startBreite + (startX - ev.clientX)))
  const loslassen = () => {
    griff.classList.remove('zieht')
    griff.removeEventListener('pointermove', bewegen)
    griff.removeEventListener('pointerup', loslassen)
    einstellungen.panel = { ...einstellungen.panel, breite }
    api.einstellungen.speichern({ panel: einstellungen.panel })
  }
  griff.addEventListener('pointermove', bewegen)
  griff.addEventListener('pointerup', loslassen)
})

// ── Hermes-Ereignisse ──
api.hermes.beiEreignis((ev) => {
  if (ev.kanal === 'crew') return crewGespraech.ereignis(ev)
  const p = ev.payload || {}
  switch (ev.type) {
    case 'message.start':
      beschaeftigt = true
      vorleser.stoppen()
      vorleseStromStarten()
      if (!aktuelleAntwort) aktuelleAntwort = { ...nachrichtAnzeigen('luzzy', '', { laeuft: true }), roh: '' }
      zustandZeigen()
      break
    case 'message.delta':
      if (typeof p.text !== 'string') break
      if (!aktuelleAntwort) aktuelleAntwort = { ...nachrichtAnzeigen('luzzy', '', { laeuft: true }), roh: '' }
      aktuelleAntwort.roh += p.text
      vorleseStromFuettern(aktuelleAntwort.roh)
      antwortAktualisieren()
      untertitelZeigen(aktuelleAntwort.roh)
      zustandZeigen()
      break
    case 'tool.start':
      werkzeug = p.name || 'Werkzeug'
      aktivitaetMelden(`Werkzeug: ${werkzeug}`, true)
      antwortAktualisieren()
      zustandZeigen()
      break
    case 'tool.complete':
      werkzeug = ''
      laufendeBeenden()
      antwortAktualisieren()
      zustandZeigen()
      break
    case 'message.complete': {
      const text = typeof p.text === 'string' && p.text ? p.text : aktuelleAntwort?.roh || ''
      untertitelZeigen(text, { fertig: true })
      if (aktuelleAntwort) {
        aktuelleAntwort.textEl.innerHTML = markdownZuHtml(text)
        aktuelleAntwort.el.roh = text
      }
      else if (text) nachrichtAnzeigen('luzzy', text)
      if (p.status === 'error' || p.error) systemNachricht(p.error || p.failure_reason || 'Die Antwort ist fehlgeschlagen.')
      aktuelleAntwort = null
      beschaeftigt = false
      werkzeug = ''
      laufendeBeenden()
      aktivitaetMelden('Luzzy hat geantwortet')
      if (text && p.status !== 'error' && !p.error) letzteAntwortMerken(text)
      // Zwischenablage an Luzzy: Ergebnis gleich wieder in die Zwischenablage
      ablageErgebnis(p.status !== 'error' && !p.error ? text : '')
        .then((hinweis) => {
          if (!hinweis) return
          aktivitaetMelden(hinweis)
          $('untertitel').insertAdjacentHTML('beforeend', `<span class="leise-hinweis">📋 ${maskieren(hinweis)}</span>`)
        })
        .catch((e) => systemNachricht(`Zwischenablage: ${e.message}`))
      zustandZeigen()
      const gelungen = text && p.status !== 'error' && !p.error
      // Felix wollte eine Datei sehen und Luzzy nennt den Pfad: in Jarves-OS anzeigen (Hermes selbst kann das nicht)
      if (gelungen && istOeffnenWunsch(letzteFrage)) pfadAusAntwortOeffnen(text).catch(() => {})
      const nachher = luzzyNachher
      luzzyNachher = null
      if (nachher) {
        if (gelungen) nachherAusfuehren(nachher, text, { sprechen: Boolean(einstellungen?.vorlesen || vorlesenErzwungen || letzteEingabeGesprochen) })
        else weiterZuhoeren()
      } else if (vorleseStrom && gelungen) {
        vorleseStromFuettern(text, { schluss: true }) // Rest vorlesen, dann ist der Strom fertig
        vorleseStrom.ende()
      } else if ((einstellungen?.vorlesen || vorlesenErzwungen) && gelungen) vorleser.sprechen(text, stimmOptionen())
      else {
        if (vorleseStrom) vorleser.stoppen()
        weiterZuhoeren()
      }
      vorleseStrom = null
      vorlesenErzwungen = false
      break
    }
    case 'wake.detected':
      // "Hey Luzzy" gehört: zuhören
      sprechenStarten()
      break
    case 'error':
      systemNachricht(p.message || 'Fehler in Hermes.')
      beschaeftigt = false
      aktuelleAntwort = null
      zustandZeigen()
      break
  }
})

api.hermes.beiVerlauf((v) => (v?.kanal === 'crew' ? crewGespraech.verlauf(v.verlauf) : verlaufZeigen(v?.verlauf)))

// Derselbe Verlauf kommt u. U. zweimal (Ereignis + Abfrage beim Start). Nur neu zeichnen, wenn
// er sich geändert hat und gerade kein Gespräch läuft, sonst würde eine frische Antwort überschrieben.
let gezeigterVerlauf = ''
function verlaufZeigen(verlauf) {
  if (!verlauf || beschaeftigt || aktuelleAntwort) return
  const fingerabdruck = JSON.stringify(verlauf.slice(-3))
  if (fingerabdruck === gezeigterVerlauf) return
  gezeigterVerlauf = fingerabdruck
  $('gespraech').replaceChildren()
  if (!verlauf.length) {
    const leer = document.createElement('div')
    leer.className = 'gespraech-leer'
    leer.id = 'gespraech-leer'
    leer.textContent = 'Noch nichts gesagt. Schreib Luzzy einfach unten.'
    $('gespraech').appendChild(leer)
  }
  for (const n of verlauf) nachrichtAnzeigen(n.rolle, n.text)
  vorschauAktualisieren()
}

api.hermes.beiStatus(statusZeigen)

function statusZeigen({ zustand: z, text }) {
  verbunden = z === 'bereit'
  if (verbunden) gespraecheLaden()
  const v = $('verbindung')
  v.dataset.zustand = z
  v.querySelector('.verbindung-text').textContent =
    z === 'bereit' ? 'Mit Hermes verbunden' : text || (z === 'verbinde' ? 'Verbinde …' : 'Getrennt')
  v.title = v.querySelector('.verbindung-text').textContent // Tooltip, wenn oben nur der Punkt zu sehen ist
  if (!verbunden) {
    beschaeftigt = false
    aktuelleAntwort = null
    $('luzzy-zustand').textContent = text || 'Nicht verbunden'
    reaktor.zustand('getrennt')
  } else {
    zustandZeigen()
    infoLaden()
    wakeEinrichten()
    if (aktuelleAnsicht !== 'crew') crewLaden()
    // Beim Start wiederhergestellter Bereich: jetzt mit Verbindung richtig laden (Crew-Chat öffnen usw.)
    if (aktuelleAnsicht !== 'zentrale') ansichtZeigen(aktuelleAnsicht)
    testNachrichtSenden()
  }
}

async function infoLaden() {
  try {
    const info = await api.hermes.info()
    if (!info.modell) setTimeout(infoLaden, 5000) // Hermes noch nicht ganz bereit: später nochmal
    $('info-modell').textContent = info.modell || '–'
    $('info-modell').title = info.modell || ''
    $('info-version').textContent = info.version ? `v${info.version}` : '–'
  } catch {
    // nicht so wichtig
  }
}

// ── Bereiche links: nach Gruppen, mit Symbol (Linien-Grafiken, 24er Raster) ──
const SYMBOLE = {
  zentrale: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  crew: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 13.6c2.6.2 4.5 2.1 4.5 4.9"/>',
  jobs: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  bibliothek: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13"/><path d="M9 7h6"/>',
  entscheidungen: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/><path d="M8 21h8"/>',
  wissen: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
  dateien: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  system: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  'plugin-aufgaben': '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8 12l3 3 5-6"/>',
  'plugin-fokus': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  'plugin-gedanken': '<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M9 10h6M9 13.5h4"/>',
  'plugin-kalender': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'plugin-meilensteine': '<path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6-4.4-4.2 6-.8z"/>',
  'plugin-routinen': '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  'plugin-wetter': '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M7 20h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.3 3.3 0 0 0 7 20z"/>'
}
const SYMBOL_PLUGIN = '<path d="M9 3h6v4a2 2 0 1 0 4 0h2v6h-3a2 2 0 1 0 0 4h3v4H3V9h4a2 2 0 1 0 0-4H3V3z"/>'
const GRUPPEN = [
  ['Luzzy', ['zentrale', 'crew']],
  ['Automation', ['jobs', 'kanban', 'plugin-routinen']],
  ['Werkzeuge', ['plugin-aufgaben', 'plugin-kalender', 'plugin-fokus', 'plugin-gedanken', 'plugin-wetter', 'plugin-meilensteine']],
  ['Wissen', ['wissen', 'bibliothek', 'entscheidungen', 'dateien']],
  ['System', ['system']]
]
const symbol = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOLE[id] || SYMBOL_PLUGIN}</svg>`
function bereicheZeigen() {
  const knopf = (b) =>
    `<button class="bereich${b.id === aktuelleAnsicht ? ' gewaehlt' : ''}" data-bereich="${b.id}" type="button" title="${b.name}" ${b.aktiv ? '' : 'disabled'}>${symbol(b.id)}<span>${b.name}</span></button>`
  const vergeben = new Set(GRUPPEN.flatMap(([, ids]) => ids))
  const gruppen = GRUPPEN.map(([name, ids]) => {
    let liste = ids.map((id) => BEREICHE.find((b) => b.id === id)).filter(Boolean)
    // Neue Plugins ohne feste Gruppe landen bei den Werkzeugen
    if (name === 'Werkzeuge') liste = liste.concat(BEREICHE.filter((b) => !vergeben.has(b.id)))
    return liste.length ? `<div class="bereich-gruppe">${name}</div>${liste.map(knopf).join('')}` : ''
  })
  $('bereiche').innerHTML = gruppen.join('')
}

// ── Bereiche wechseln; offene Bereiche aktualisieren sich regelmäßig ──
const LADEN = {
  crew: crewLaden, jobs: jobsLaden, kanban: kanbanLaden, system: systemLaden,
  bibliothek: bibliothekLaden, entscheidungen: entscheidungenLaden, wissen: wissenLaden, dateien: dateienLaden
}
const TAKT = { crew: 15000, jobs: 20000, kanban: 15000, system: 5000, bibliothek: 30000, entscheidungen: 30000, wissen: 60000, dateien: 30000 }
let aktuelleAnsicht = 'zentrale'
let taktUhr = 0
let crewGeoeffnet = false

function ansichtZeigen(id) {
  aktuelleAnsicht = id
  // Zuletzt offenen Bereich merken (nicht im Testmodus), damit er beim nächsten Start wieder aufgeht
  if (einstellungen && einstellungen.letzteAnsicht !== id && !new URLSearchParams(location.search).has('stumm')) {
    einstellungen.letzteAnsicht = id
    api.einstellungen.speichern({ letzteAnsicht: id })
  }
  document.body.dataset.ansicht = id // Zentrale: Gespräch rechts ohne eigene Eingabe (siehe style.css)
  for (const el of document.querySelectorAll('.ansicht')) el.hidden = el.dataset.ansicht !== id
  bereicheZeigen()
  clearInterval(taktUhr)
  if (LADEN[id]) {
    LADEN[id]()
    taktUhr = setInterval(() => verbunden && LADEN[id](), TAKT[id])
  }
  if (id === 'crew' && !crewGeoeffnet && verbunden) {
    crewGeoeffnet = true
    api.hermes.crewOeffnen().then(() => {
      // nur Testmodus: ?crewtest=<Nachricht> schickt sie einmal in den Crew-Chat
      const test = new URLSearchParams(location.search).get('crewtest')
      if (!test) return
      $('crew-form').querySelector('textarea').value = test
      $('crew-form').requestSubmit()
    }).catch((e) => {
      crewGeoeffnet = false
      console.warn('Crew:', e.message)
    })
  }
  if (id === 'zentrale') document.querySelector('.befehl .eingabe-text')?.focus()
}

$('bereiche').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-bereich]')
  if (knopf && !knopf.disabled) ansichtZeigen(knopf.dataset.bereich)
})
document.addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-neu-laden]')
  if (knopf) LADEN[knopf.dataset.neuLaden]?.()
  const oeffnen = e.target.closest('[data-bereich-oeffnen]')
  if (oeffnen) ansichtZeigen(oeffnen.dataset.bereichOeffnen)
})
// Wissen-Bereiche: Vorlesen, Bereich wechseln, Auftrag an Luzzy
wissenEinrichten({
  vorlesen: (text) => vorleser.sprechen(text, stimmOptionen()),
  ansichtZeigen: (id) => ansichtZeigen(id),
  anLuzzy: (text) => {
    ansichtZeigen('zentrale')
    anLuzzy(text)
  }
})
morgenberichtLaden()
setInterval(morgenberichtLaden, 5 * 60 * 1000)

// Uhrzeit und Datum oben rechts in der Kopfzeile
function uhrZeigen() {
  const jetzt = new Date()
  document.getElementById('uhr-zeit').textContent = jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  document.getElementById('uhr-datum').textContent = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  document.getElementById('uhr-datum-kurz').textContent = jetzt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) // bei wenig Platz
}
uhrZeigen()
setInterval(uhrZeigen, 1000)

// Meldungen (Phase 5): Wächter im Hauptprozess + "Crew ist fertig"
meldungenEinrichten({
  vorlesen: (text) => vorleser.sprechen(text, stimmOptionen()),
  istBeschaeftigt: () => !verbunden || beschaeftigt || spricht || hoert || versteht || sprichtGerade,
  einstellungen: () => einstellungen
})
api.waechter.beiMeldung(meldungNeu)
api.waechter.beiProblem(problemNeu)

// Verbindungsanzeige oben: Shopify und Postfach (grün = verbunden, rot = Problem, Klick = jetzt prüfen)
const QUELLEN = { shopify: ['shopify-status', 'Shopify'], mail: ['mail-status', 'Postfach'] }
const verbindungStand = {} // quelle → { ok, text }, auch für die Startsequenz
function verbindungZeigen({ quelle, ok, text }) {
  verbindungStand[quelle] = { ok, text }
  const [id, name] = QUELLEN[quelle] || []
  if (!id) return
  const el = $(id)
  el.dataset.zustand = ok ? 'bereit' : 'fehler'
  el.querySelector('.verbindung-text').textContent = ok ? `${name} verbunden` : `${name}: Problem`
  el.title = `${text || ''}
(Klick: jetzt prüfen)`
}
api.waechter.beiVerbindung(verbindungZeigen)
api.waechter.verbindungen().then((v) => Object.entries(v || {}).forEach(([quelle, info]) => verbindungZeigen({ quelle, ...info })))
for (const [quelle, [id, name]] of Object.entries(QUELLEN)) {
  $(id).addEventListener('click', () => {
    $(id).dataset.zustand = 'verbinde'
    $(id).querySelector('.verbindung-text').textContent = `${name} …`
    api.waechter.pruefen()
  })
}

// Schnellbefehle über der Eingabe kommen aus dem Routinen-Plugin (plugins/routinen)

// Crew-Übersicht rechts aktuell halten, auch wenn der Crew-Bereich zu ist
setInterval(() => verbunden && aktuelleAnsicht !== 'crew' && crewLaden(), 30000)

// Gespräch im Crew-Bereich: Luzzys Bot Chat
const crewGespraech = unterhaltungErstellen({
  kanal: 'crew',
  liste: $('crew-gespraech'),
  form: $('crew-form'),
  leerText: 'Noch keine Crew-Aufträge. Sag Luzzy, was die Bots erledigen sollen.',
  beiAktivitaet: (text, laeuft) => {
    if (laeuft) return aktivitaetMelden(text, true)
    laufendeBeenden()
    aktivitaetMelden(text)
    // Crew fertig, während Felix woanders ist: melden
    if (text === 'Crew-Antwort da' && aktuelleAnsicht !== 'crew') {
      meldungNeu({ art: 'crew', titel: 'Die Crew ist fertig', text: 'Felix, die Crew hat ein Ergebnis für dich. Schau mal in den Crew-Bereich.', anzeige: 'Antwort im Crew-Bereich', zeit: Date.now() })
    }
  }
})

// ── Einstellungen ──
const stimmOptionen = () => ({ stimme: einstellungen.stimme, tempo: einstellungen.tempo, hoehe: einstellungen.hoehe })
const zahl = (s) => parseInt(String(s).replace(/[^-\d]/g, ''), 10) || 0

// Farben nach Tageszeit: morgens 6–10 heller, tagsüber normal, abends 18–22 wärmer, nachts dunkler
function tageszeitAnwenden() {
  const test = new URLSearchParams(location.search).get('tageszeit') // nur Testmodus
  const h = new Date().getHours()
  const zeit = test || (h >= 6 && h < 10 ? 'morgen' : h >= 10 && h < 18 ? 'tag' : h >= 18 && h < 22 ? 'abend' : 'nacht')
  const aus = einstellungen?.tageszeitFarben === false && !test
  if (aus) delete document.documentElement.dataset.tageszeit
  else document.documentElement.dataset.tageszeit = zeit
  farbZeit = aus ? 'tag' : zeit
  titelfarbeSetzen()
}
// Fensterknöpfe oben rechts (Windows zeichnet sie selbst) in der Farbe dessen, was darunter liegt:
// rechte Spalte offen → ihre Farbe; zu → Gespräch (falls offen) oder die Mitte. Werte wie in style.css.
let farbZeit = 'tag'
let titelfarbe = '#0e0e10'
function titelfarbeSetzen() {
  const leiste = { morgen: '#121214', tag: '#0e0e10', abend: '#0f0d0b', nacht: '#090807' }[farbZeit]
  const mitte = { morgen: '#17171a', tag: '#131315', abend: '#141210', nacht: '#0d0c0b' }[farbZeit]
  const rechtsZu = document.body.classList.contains('rechts-zu')
  const farbe = !rechtsZu || !$('gespraech-panel').hidden ? leiste : mitte
  if (farbe !== titelfarbe) api.fenster.titelfarbe((titelfarbe = farbe))
}
setInterval(tageszeitAnwenden, 60000)

function animationenAnwenden() {
  tageszeitAnwenden()
  const a = einstellungen.animationen
  document.body.classList.toggle('anim-reaktor', a.reaktor)
  document.body.classList.toggle('anim-welle', a.welle)
  document.body.classList.toggle('anim-scanlinie', a.scanlinie)
  document.body.classList.toggle('anim-hintergrund', a.hintergrund)
}

function formularFuellen() {
  $('e-stimme').value = einstellungen.stimme
  $('e-tempo').value = zahl(einstellungen.tempo)
  $('e-hoehe').value = zahl(einstellungen.hoehe)
  $('e-vorlesen').checked = einstellungen.vorlesen
  $('e-wake').checked = einstellungen.sprache.aktivierungswort
  $('e-auto-senden').checked = einstellungen.sprache.automatischSenden
  $('e-weiter').checked = einstellungen.sprache.weiterZuhoeren
  $('e-unterbrechen').checked = einstellungen.sprache.unterbrechen !== false
  const m = einstellungen.meldungen
  $('e-m-vorlesen').checked = m.vorlesen
  $('e-m-ton').checked = m.ton !== false
  kartenFormularFuellen(einstellungen.karten)
  for (const art of ['bestellung', 'mail', 'job', 'crew']) $(`e-m-${art}`).checked = m[art]
  $('e-m-meilenstein').checked = m.meilenstein !== false
  $('e-m-ruhe-von').value = m.ruheVon || ''
  $('e-m-ruhe-bis').value = m.ruheBis || ''
  mikrofonStatusZeigen(mikrofon.zustand())
  for (const k of ['reaktor', 'welle', 'scanlinie', 'hintergrund']) $(`e-anim-${k}`).checked = einstellungen.animationen[k]
  $('e-tageszeit').checked = einstellungen.tageszeitFarben !== false
  $('e-start-intro').checked = einstellungen.start?.intro !== false
  $('e-start-gruss').checked = einstellungen.start?.begruessung !== false
  reglerAnzeigen()
}

function reglerAnzeigen() {
  const t = Number($('e-tempo').value)
  const h = Number($('e-hoehe').value)
  $('e-tempo-wert').textContent = `${t > 0 ? '+' : ''}${t} %`
  $('e-hoehe-wert').textContent = `${h > 0 ? '+' : ''}${h} Hz`
}

function formularLesen() {
  const t = Number($('e-tempo').value)
  const h = Number($('e-hoehe').value)
  return {
    stimme: $('e-stimme').value,
    tempo: `${t >= 0 ? '+' : ''}${t}%`,
    hoehe: `${h >= 0 ? '+' : ''}${h}Hz`,
    vorlesen: $('e-vorlesen').checked,
    meldungen: {
      vorlesen: $('e-m-vorlesen').checked,
      ton: $('e-m-ton').checked,
      bestellung: $('e-m-bestellung').checked,
      mail: $('e-m-mail').checked,
      job: $('e-m-job').checked,
      crew: $('e-m-crew').checked,
      meilenstein: $('e-m-meilenstein').checked,
      ruheVon: $('e-m-ruhe-von').value,
      ruheBis: $('e-m-ruhe-bis').value
    },
    sprache: {
      aktivierungswort: $('e-wake').checked,
      automatischSenden: $('e-auto-senden').checked,
      weiterZuhoeren: $('e-weiter').checked,
      unterbrechen: $('e-unterbrechen').checked
    },
    animationen: {
      reaktor: $('e-anim-reaktor').checked,
      welle: $('e-anim-welle').checked,
      scanlinie: $('e-anim-scanlinie').checked,
      hintergrund: $('e-anim-hintergrund').checked
    },
    start: {
      intro: $('e-start-intro').checked,
      begruessung: $('e-start-gruss').checked
    },
    karten: kartenFormularLesen() ?? einstellungen.karten,
    tageszeitFarben: $('e-tageszeit').checked
  }
}

$('einstellungen-oeffnen').addEventListener('click', () => {
  formularFuellen()
  sicherungStandZeigen()
  startStandZeigen()
  einstellungsTab(letzterTab)
  $('einstellungen').showModal()
  document.querySelector('.e-tab.gewaehlt')?.focus() // nicht das ✕ (bekäme sonst den Fokusrahmen)
})
$('e-tempo').addEventListener('input', reglerAnzeigen)
$('e-hoehe').addEventListener('input', reglerAnzeigen)
$('e-probe').addEventListener('click', () => {
  const f = formularLesen()
  vorleser.sprechen('Hey Felix. So klinge ich. Alle Systeme bereit, was steht an?', { stimme: f.stimme, tempo: f.tempo, hoehe: f.hoehe })
})
// Einstellungen: Tabs links (der zuletzt offene Tab bleibt gemerkt, solange Jarves-OS läuft)
let letzterTab = 'stimme'
function einstellungsTab(id) {
  letzterTab = id
  for (const t of document.querySelectorAll('.e-tab')) t.classList.toggle('gewaehlt', t.dataset.eTab === id)
  for (const seite of document.querySelectorAll('.e-seite')) seite.hidden = seite.dataset.eSeite !== id
  document.querySelector('.e-inhalt').scrollTop = 0
}
document.querySelector('.e-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-e-tab]')
  if (tab) einstellungsTab(tab.dataset.eTab)
})
$('e-zu').addEventListener('click', () => $('einstellungen').close('abbrechen'))

// Schneller starten: Desktop-Verknüpfung und Autostart (gilt sofort, nicht erst mit „Speichern“)
async function startStandZeigen(vorweg = '') {
  try {
    const s = await api.start.stand()
    $('e-verknuepfung').disabled = !s.windows
    $('e-autostart').disabled = !s.windows
    $('e-autostart').checked = s.autostart
    $('e-verknuepfung').textContent = s.verknuepfung ? 'Verknüpfung neu anlegen' : 'Verknüpfung auf dem Desktop anlegen'
    $('e-start-stand').textContent = s.windows
      ? `${vorweg}${s.verknuepfung ? 'Verknüpfung liegt auf dem Desktop. ' : ''}Doppelklick auf „Jarves-OS“ startet ohne Terminal, npm start geht weiterhin.`
      : 'Verknüpfung und Autostart gehen nur unter Windows.'
  } catch (e) {
    $('e-start-stand').textContent = e.message
  }
}
$('e-verknuepfung').addEventListener('click', async () => {
  try {
    await api.start.verknuepfung()
    await startStandZeigen('Angelegt. ')
  } catch (e) {
    $('e-start-stand').textContent = `Ging nicht: ${e.message}`
  }
})
$('e-autostart').addEventListener('change', async (e) => {
  try {
    await api.start.autostart(e.target.checked)
    await startStandZeigen(e.target.checked ? 'Startet ab jetzt mit Windows. ' : 'Kein Autostart mehr. ')
  } catch (err) {
    $('e-start-stand').textContent = `Ging nicht: ${err.message}`
  }
})

// Sicherung auf Knopfdruck
async function sicherungStandZeigen(vorweg = '') {
  const el = $('e-sicherung-stand')
  try {
    const { anzahl, letzte } = await api.sicherung.liste()
    const wann = letzte ? new Date(letzte.zeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : ''
    el.textContent = vorweg + (letzte ? `Letzte Sicherung: ${wann} Uhr (${anzahl} insgesamt)` : 'Noch keine Sicherung.')
  } catch (e) {
    el.textContent = `Sicherungen nicht lesbar: ${e.message}`
  }
}
$('e-sichern').addEventListener('click', async () => {
  const knopf = $('e-sichern')
  knopf.disabled = true
  $('e-sicherung-stand').textContent = 'Sichere …'
  try {
    await api.sicherung.anlegen()
    await sicherungStandZeigen('Gesichert. ')
  } catch (e) {
    $('e-sicherung-stand').textContent = `Sicherung fehlgeschlagen: ${e.message}`
  } finally {
    knopf.disabled = false
  }
})
$('e-sicherung-ordner').addEventListener('click', () => api.sicherung.ordner())

// Töne für Meldungen probehören
document.querySelector('.ton-probe').addEventListener('click', (e) => {
  const knopf = e.target.closest('[data-ton-probe]')
  if (knopf) tonSpielen(knopf.dataset.tonProbe)
})
$('einstellungen').addEventListener('close', async () => {
  if ($('einstellungen').returnValue !== 'speichern') return
  einstellungen = await api.einstellungen.speichern(formularLesen())
  animationenAnwenden()
  kartenAnwenden(einstellungen.karten)
  wakeEinrichten()
})

// Testmodus (nur beim Entwickeln): ?test=<Nachricht> schickt sie einmal automatisch, ohne Vorlesen
const testNachricht = new URLSearchParams(location.search).get('test')
let testGesendet = false
function testNachrichtSenden() {
  if (!testNachricht || testGesendet) return
  testGesendet = true
  einstellungen = { ...einstellungen, vorlesen: false }
  const feld = document.querySelector('.befehl .eingabe-text')
  feld.value = testNachricht
  abschicken(feld)
}

// ── Donnerwolf-Startsequenz: Intro mit Systemcheck, danach begrüßt Luzzy ──
let stimmenListe = []
async function startsequenzLaufen({ mitIntro, pluginsFertig, stumm }) {
  const gruss = einstellungen.start?.begruessung !== false
  if (gruss) meldungenSammeln(true) // Bestellungen über Nacht nicht einzeln vorlesen, sondern in der Begrüßung zählen
  // Wächter gleich nach dem Verbinden prüfen lassen, nicht erst nach seiner ersten Runde
  ;(async () => {
    for (let i = 0; i < 60 && !verbunden; i++) await new Promise((r) => setTimeout(r, 200))
    if (verbunden) api.waechter.pruefen()
  })()
  let pluginAnzahl = null
  pluginsFertig.then((n) => (pluginAnzahl = n))
  const verbindungInfo = (q) => verbindungStand[q] && { ok: verbindungStand[q].ok, text: verbindungStand[q].ok ? (q === 'mail' ? verbindungStand[q].text.replace(/^Verbunden,?\s*/, '') || 'verbunden' : 'verbunden') : 'Problem' }
  const schritte = [
    { name: 'Hermes-Kern', pruefen: () => verbunden && { ok: true, text: 'verbunden' }, zeit: 8000 },
    { name: 'Luzzy · Profil donnerwolf', pruefen: () => verbunden && { ok: true, text: 'bereit' }, zeit: 800 },
    { name: 'Stimme', pruefen: () => { const st = stimmenListe.find((x) => x.id === einstellungen.stimme); return st && { ok: true, text: st.name } }, zeit: 1500 },
    { name: 'Plugins', pruefen: () => pluginAnzahl != null && { ok: true, text: `${pluginAnzahl} geladen` }, zeit: 5000 },
    { name: 'Shopify', pruefen: () => verbindungInfo('shopify'), zeit: 5000 },
    { name: 'Postfach', pruefen: () => verbindungInfo('mail'), zeit: 3000 }
  ]
  if (mitIntro) await introAbspielen(schritte)
  if (!gruss) return
  // Auf den ersten Wächter-Durchlauf warten (ohne Intro), damit die Zahlen stimmen
  const ende = Date.now() + 12000
  while (Date.now() < ende && !(verbunden && verbindungStand.shopify && verbindungStand.mail && pluginAnzahl != null)) await new Promise((r) => setTimeout(r, 250))
  await new Promise((r) => setTimeout(r, 600)) // Meldungen des Durchlaufs kommen direkt danach
  const gesammelt = meldungenSammeln(false)
  const probleme = Object.keys(QUELLEN).filter((q) => verbindungStand[q] && !verbindungStand[q].ok).map((q) => QUELLEN[q][1])
  if (!verbunden) probleme.unshift('Hermes')
  const ungelesen = /(\d+) ungelesen/.exec(verbindungStand.mail?.text || '')
  const text = begruessungBauen({
    probleme,
    bestellungen: verbindungStand.shopify?.ok ? gesammelt.filter((m) => m.art === 'bestellung').length : null,
    ungelesen: verbindungStand.mail?.ok && ungelesen ? Number(ungelesen[1]) : null,
    jobsFehler: gesammelt.filter((m) => m.art === 'job').length,
    pluginSaetze: await pluginBegruessung()
  })
  window.__begruessung = text // für den Testmodus
  if (beschaeftigt || hoert || versteht || losgelegt) return // Felix hat schon losgelegt
  untertitelZeigen(text, { fertig: true })
  letzteAntwortMerken(text)
  if (!stumm) vorleser.sprechen(text, stimmOptionen())
}

// ── Start ──
async function start() {
  bereicheZeigen()
  einstellungen = await api.einstellungen.laden()
  if (new URLSearchParams(location.search).has('stumm')) window.__testEingabe = pluginEingabe // nur Testmodus
  if (new URLSearchParams(location.search).has('stumm')) {
    // nur Testmodus: nichts laut
    einstellungen.vorlesen = false
    einstellungen.meldungen = { ...einstellungen.meldungen, vorlesen: false }
  }
  if (new URLSearchParams(location.search).has('meldungtest')) {
    setTimeout(() => {
      meldungNeu({ art: 'bestellung', titel: 'Neue Bestellung #1411', text: 'Felix, neue Bestellung: Thor-Hoodie in L nach Hamburg, 49,90 Euro. Das ist schon die dritte Bestellung von dieser Person.', anzeige: '49,90 Euro · Thor-Hoodie (L) · Hamburg · 3. Bestellung', zeit: Date.now() })
      meldungNeu({ art: 'mail', titel: 'Mail von Max Muster', text: 'Neue Mail von Max Muster: Frage zur Lieferung.', anzeige: 'Frage zur Lieferung', zeit: Date.now() })
      meldungNeu({ art: 'job', titel: 'Job fehlgeschlagen: Morgenbericht', text: 'Achtung, der Job Morgenbericht ist fehlgeschlagen.', anzeige: 'Timeout beim Abruf', zeit: Date.now() })
    }, 3000)
  }
  const suche = new URLSearchParams(location.search)
  const stumm = suche.has('stumm')
  const mitIntro = einstellungen.start?.intro !== false && (!stumm || suche.has('intro')) // Testmodus: ohne Intro
  if (!mitIntro) introAus()
  let pluginsBereit
  const pluginsFertig = new Promise((r) => (pluginsBereit = r))
  startsequenzLaufen({ mitIntro, pluginsFertig, stumm })
  const stimmen = await api.stimme.liste()
  stimmenListe = stimmen
  $('e-stimme').innerHTML = stimmen.map((s) => `<option value="${s.id}">${s.name} (${s.herkunft})</option>`).join('')
  animationenAnwenden()
  zustandZeigen()
  const s = await api.hermes.status()
  if (s.zustand === 'bereit') verlaufZeigen((await api.hermes.verlaufHolen('zentrale'))?.verlauf)
  statusZeigen({ zustand: s.zustand, text: s.text })
  breiteSetzen(einstellungen.panel?.breite || 460)
  leistenAnwenden()
  timerEinrichten({ gespeichert: einstellungen.timer, speichern: (liste) => api.einstellungen.speichern({ timer: liste }), alarm: timerAlarm })
  nichtStoerenZeigen()
  const testAnsicht = new URLSearchParams(location.search).get('ansicht') // nur Testmodus
  if (testAnsicht) setTimeout(() => LADEN[testAnsicht] && ansichtZeigen(testAnsicht), 5000)
  // Plugins (jarves-os\plugins): eigener Bereich links, Karte rechts
  const pluginBereiche = await pluginsStarten({
    mitte: document.querySelector('.mitte'),
    rechts: document.querySelector('.live'),
    vorKarte: $('karte-gerade'),
    schnellbefehle: $('schnellbefehle'),
    melden: meldungNeu,
    vorlesen: (text) => vorleser.sprechen(text, stimmOptionen()),
    // luzzy(text, { anzeige, vorlesen, ansichtWechseln })
    luzzy: (text, optionen = {}) => {
      if (optionen.ansichtWechseln !== false) ansichtZeigen('zentrale')
      return anLuzzy(text, optionen)
    },
    ansichtZeigen,
    bereit: () => verbunden && !beschaeftigt && !hoert && !versteht,
    nichtStoeren: (bis) => nichtStoerenSetzen(Number(bis) || 0, { bestaetigen: false })
  })
  const vorSystem = BEREICHE.findIndex((b) => b.id === 'system')
  BEREICHE.splice(vorSystem, 0, ...pluginBereiche.map((b) => ({ id: b.id, name: b.name, aktiv: true })))
  for (const b of pluginBereiche) {
    if (b.laden) LADEN[b.id] = b.laden
    TAKT[b.id] = b.takt || 60000
  }
  bereicheZeigen()
  pluginsBereit(pluginBereiche.length)
  geladenePlugins = pluginBereiche.length
  // Rechte Spalte: eigene Auswahl und Reihenfolge (Einstellungen → Rechte Spalte)
  kartenEinrichten(document.querySelector('.live'))
  kartenAnwenden(einstellungen.karten)
  // Zuletzt offenen Bereich wieder öffnen (nur wenn es ihn noch gibt, z. B. Plugin gelöscht)
  const letzte = einstellungen.letzteAnsicht
  if (!testAnsicht && letzte && letzte !== 'zentrale' && BEREICHE.some((b) => b.id === letzte && b.aktiv)) ansichtZeigen(letzte)
  const testPanel = new URLSearchParams(location.search).get('panel') // nur Testmodus: '1' offen, '0' zu
  panelSetzen(testPanel ? testPanel === '1' : Boolean(einstellungen.panel?.offen), { speichern: false })
}

start()
