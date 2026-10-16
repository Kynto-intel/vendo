// Vendo-Oberfläche: Luzzy in der Mitte, Gespräch, Live-Spalte, Einstellungen.

import { reaktorErstellen, welleErstellen } from './reaktor.js'
import { markdownZuHtml } from './markdown.js'
import { vorleserErstellen, satzStueck } from './vorlesen.js'
import { mikrofonErstellen } from './mikrofon.js'

import { crewLaden } from './ansichten.js'
import { meldungenEinrichten, meldungNeu, problemNeu, meldungenSammeln } from './meldungen.js'
import { miniInfoEinrichten } from './miniinfo.js'
import { freigabenEinrichten, freigabeAusText, freigabeOffen, freigabeZurueckgezogen, freigabenLeeren, jaKnoepfeAnhaengen, jaKnoepfeEntfernen } from './freigaben.js'
import { tonSpielen } from './toene.js'
import './auswahl.js' // eigene Auswahlfenster für Datum und Uhrzeit (statt der Windows-Fenster)
import { ablageEinrichten, ablageErgebnis } from './zwischenablage.js'
import { timerEinrichten, timerBefehl } from './timer.js'
import { befehleSuchen } from './palette.js'
import { sucheEinrichten, sucheOeffnen } from './suche.js'
import { selbsttestStarten } from './selbsttest.js'
import { diktatErkennen, diktatAuftrag, diktatAblegen } from './diktat.js'
import { pcBefehlErkennen, pcAusfuehren } from './pcsteuerung.js'
import { gespraecheEinrichten, gespraecheLaden, gespraechBefehl } from './gespraeche.js'
import { dateiBefehlErkennen, dateiSuchenUndZeigen, trefferNummer, trefferOeffnen, dateiansichtEinrichten, dateiZeigen, istOeffnenWunsch, pfadAusAntwortOeffnen, aenderungsBefehl } from './dateiansicht.js'
import { kartenEinrichten, kartenAnwenden } from './karten.js'
import { nichtStoerenErkennen, uhrzeitText } from './nichtstoeren.js'
import { introAbspielen, introAus, begruessungBauen } from './startsequenz.js'
import { pluginsStarten, pluginEingabe, pluginBefehl, kontextFuer, pluginBegruessung, pluginKontext } from './plugin-host.js'
import { anhaengeEinrichten, anhaengeAnzahl, anhaengeSenden, anhaengeDazu } from './anhaenge.js'
import { sendeKnopfSetzen } from './sendeknopf.js'
import { befehlslisteEinrichten } from './rahmen/befehlsliste.js'
import { navigationEinrichten, BEREICHE, ansichtZeigen, bereicheZeigen, offeneAnsicht, bereichLaedt, pluginBereicheHinzufuegen } from './rahmen/navigation.js'
import { designEinrichten, designAnwenden, tageszeitAnwenden, titelfarbeSetzen } from './rahmen/design.js'
import { einstellungsfensterEinrichten } from './rahmen/einstellungsfenster.js'
import { shopifyZugangEinrichten, shopifyZugangStatus } from './shopifyzugang.js'
import { buehneStarten } from './buehne.js'
import { kostenEinrichten } from './kosten.js'
import { cockpitEinrichten, cockpitAnzeigen, cockpitAnstossen } from './cockpit.js'
import { terminalEinrichten } from './terminal.js'
import { crewChatEinrichten, crewBotsLaden, crewEreignis, crewVerlauf, botAnrede, anBotSenden, luzzyChatZeigen, aktuellerKanal as crewKanal, aktuellenChatNeuLaden, crewBots, botFensterOeffnen } from './crewchat.js'
import { notfallEinrichten, notfallAntworten, NETZ_FEHLER } from './notfall.js'
import { wissenEinrichten, notizOeffnen, morgenberichtLaden } from './wissen.js'

const $ = (id) => document.getElementById(id)
const api = window.jarves

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
designEinrichten({ einstellungen: () => einstellungen }) // Designs, Tageszeit, Windows-Knöpfe (rahmen/design.js)
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
// Freihändig (Standard): „Hey Luzzy“, Reinreden, Weiter-Zuhören. Aus: nur auf Knopfdruck (Headset, Anrufe).
// Im Crew-Bereich (Felix schreibt mit Kira & Co.) hört Luzzy automatisch nur auf Knopfdruck (abschaltbar).
const freihaendigEingestellt = () => einstellungen?.sprache?.freihaendig !== false
const crewStill = () => offeneAnsicht() === 'crew' && einstellungen?.sprache?.crewStill !== false
const freihaendig = () => freihaendigEingestellt() && !crewStill()

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
    const unterbrechen = einstellungen?.sprache?.unterbrechen !== false && freihaendig()
    mikrofon.wakeSetzen(wakeAktiv && unterbrechen)
    if (unterbrechen && !musikAktiv()) reinredenStarten() // Musik würde Luzzy sonst unterbrechen
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
  const anzeige = z === 'bereit' && crewStill() && freihaendigEingestellt() ? 'crew' : z === 'bereit' && !freihaendig() ? 'knopf' : z === 'bereit' && wakeAktiv ? 'wake' : z
  el.dataset.zustand = anzeige
  const texte = {
    aus: 'Mikrofon …',
    bereit: 'Mikrofon bereit',
    wake: 'Hört auf „Hey Luzzy“',
    knopf: 'Mikrofon: nur auf Knopfdruck',
    crew: 'Mikrofon: im Crew-Bereich nur auf Knopfdruck',
    'nimmt-auf': 'Nimmt auf',
    'kein-mikrofon': 'Kein Mikrofon',
    verweigert: 'Mikrofon verweigert'
  }
  // „Hey Luzzy“ gewünscht, aber Hermes hört nicht: kleiner Hinweis statt stiller Konsolen-Warnung
  const wakeFehlt = z === 'bereit' && freihaendig() && !wakeAktiv && wakeGrund && einstellungen?.sprache?.aktivierungswort
  el.querySelector('.verbindung-text').textContent = wakeFehlt ? 'Mikrofon bereit · „Hey Luzzy“ aus' : texte[anzeige] || text || z
  el.title = `${wakeFehlt ? wakeHinweis() : texte[anzeige] || text || z}\nKlick oder Strg+Umschalt+H: ${freihaendig() ? 'nur noch auf Knopfdruck zuhören' : 'wieder freihändig („Hey Luzzy“)'}` // Tooltip, auch wenn oben nur der Punkt zu sehen ist
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
      if (beschaeftigt && !freigabeOffen()) api.hermes.abbrechen('zentrale') // wer spricht, unterbricht Luzzy (außer sie wartet auf eine Freigabe)
      vorleser.stoppen()
    }
    if (!(await mikrofon.starten())) {
      untertitelZeigen('Kein Mikrofon gefunden. Steck eins ein, dann klick auf das Mikrofon.', { fertig: true })
      return
    }
    if (!leise) piep(true)
    hoert = true
    luzzyFragt = false
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
    // Nur Musik oder typische Erkennungs-Fehler (z. B. „♪“, „Untertitel im Auftrag des ZDF“): nicht an Luzzy
    if (nurMusik(text)) {
      if (weiterSprechen()) return
      untertitelZeigen('Da war wohl nur Musik. Sag einfach nochmal „Hey Luzzy“.', { fertig: true })
      return
    }
    if (unterbrechung) {
      // Felix hat wirklich etwas gesagt: Luzzy hört auf, eine laufende Antwort wird abgebrochen
      vorleser.stoppen()
      if (beschaeftigt && !freigabeOffen()) {
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

// ── Musik erkennen: läuft auf dem PC Musik/Video (Windows-Mediensteuerung), zählt sie nicht als Sprache ──
let musikSpielt = false
const musikAktiv = () => musikSpielt && einstellungen?.sprache?.musikErkennen !== false
api.musik?.status().then((s) => (musikSpielt = Boolean(s))).catch(() => {})
api.musik?.beiAenderung((s) => (musikSpielt = Boolean(s)))
// „Hey Luzzy“ während Musik läuft: Musik anhalten (Medientaste), zuhören, danach von selbst weiter
let musikVonJarvesAngehalten = false
async function musikKurzAnhalten() {
  if (!musikAktiv()) return
  await api.pc.aktion({ art: 'taste', taste: 'abspielen' }).catch(() => {})
  musikVonJarvesAngehalten = true
  await new Promise((r) => setTimeout(r, 350)) // kurz warten, bis es still ist
}
setInterval(() => {
  // Fertig mit Zuhören, Antworten und Vorlesen: angehaltene Musik wieder starten
  if (!musikVonJarvesAngehalten || spricht || hoert || versteht || beschaeftigt || sprichtGerade) return (musikRuheSeit = 0)
  if (Date.now() - (musikRuheSeit ||= Date.now()) < 1500) return
  musikVonJarvesAngehalten = false
  musikRuheSeit = 0
  if (!musikSpielt) api.pc.aktion({ art: 'taste', taste: 'abspielen' }).catch(() => {})
}, 500)
let musikRuheSeit = 0
// Nur Musik oder bekannte Fehlerkennungen der Spracherkennung (sie „hört“ bei Musik gern Untertitel-Sätze)
const NUR_MUSIK = [/[♪♫🎵🎶]/u, /^\W*[\[(]?\s*(musik|music|gesang|singing|applaus|applause|instrumental|lachen)\s*[\])]?\W*$/i, /untertitel(ung)?\s+(im auftrag|von|der|des)/i, /(vielen dank|danke)\s+(fürs|für's|für das)\s+zuschauen/i, /copyright|amara\.org|swr|zdf\s+\d{4}/i]
function nurMusik(text) {
  const t = String(text || '').trim()
  return t.length < 2 || NUR_MUSIK.some((m) => m.test(t))
}

// Nach Luzzys Antwort kurz weiter zuhören, wenn die Frage gesprochen war (Gesprächsmodus)
function weiterZuhoeren() {
  if (!letzteEingabeGesprochen || !einstellungen?.sprache?.weiterZuhoeren || !freihaendig()) return
  if (musikAktiv()) return (letzteEingabeGesprochen = false) // läuft Musik, würde sie sonst mitgeschrieben
  letzteEingabeGesprochen = false
  setTimeout(() => {
    if (!beschaeftigt && !spricht && !hoert) sprechenStarten({ ohneSpracheNach: 8000, leise: false })
  }, 350)
}

// Aktivierungswort bei Hermes scharf schalten (oder aus). Klappt es nicht, steht der Grund in wakeGrund
// (angezeigt beim Mikrofon oben, in den Einstellungen → Sprechen und im Selbsttest).
const wakeHinweis = () =>
  wakeGrund === 'disabled'
    ? '„Hey Luzzy“ ist in Hermes aus. Meist, weil die Hermes-App offen war und Vendo an ihr Hermes angedockt hat (anderes Profil). Hermes-App schließen und Vendo neu starten.'
    : `„Hey Luzzy“ hört gerade nicht zu (${wakeGrund}).`
async function wakeEinrichten() {
  const soll = Boolean(einstellungen?.sprache?.aktivierungswort) && freihaendig() && verbunden
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

// Freihändig an/aus: Klick auf „Mikrofon“ oben, Strg+Umschalt+H (überall), Befehlspalette, Einstellungen
async function freihaendigSetzen(an, { sagen = true } = {}) {
  einstellungen = await api.einstellungen.speichern({ sprache: { ...einstellungen.sprache, freihaendig: Boolean(an) } })
  reinredenAus()
  await wakeEinrichten()
  mikrofonStatusZeigen(mikrofon.zustand())
  const satz = an ? 'Ich höre wieder von selbst zu. Sag einfach Hey Luzzy.' : 'Okay, ich höre nur noch zu, wenn du das Mikrofon startest.'
  aktivitaetMelden(satz)
  if (sagen) untertitelZeigen(satz, { fertig: true })
}
// Umschalten: im Crew-Bereich (dort ist Luzzy still) heißt das „hier doch mithören“, sonst freihändig an/aus
async function hoerModusUmschalten() {
  if (crewStill() && freihaendigEingestellt()) {
    einstellungen = await api.einstellungen.speichern({ sprache: { ...einstellungen.sprache, crewStill: false } })
    hoerModusAnwenden()
    return untertitelZeigen('Okay, ich höre jetzt auch im Crew-Bereich zu. Zurückstellen: Einstellungen, Sprechen.', { fertig: true })
  }
  return freihaendigSetzen(!freihaendigEingestellt())
}
function hoerModusAnwenden() {
  reinredenAus()
  wakeEinrichten()
  mikrofonStatusZeigen(mikrofon.zustand())
}
$('mikrofon-status').addEventListener('click', hoerModusUmschalten)
api.sprache.beiFreihaendig(hoerModusUmschalten)
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
let luzzyFragt = false // Luzzys letzte Antwort endet mit einer Frage (bis Felix antwortet): Fenni legt den Kopf schief
const miniInfo = miniInfoEinrichten({ api }) // Wetter, Termin, Aufgaben, Luzzys Worte und Meldungen für die Insel
function miniSenden(pegel) {
  if (!miniAn) return
  if (pegel !== undefined) {
    const jetzt = performance.now()
    if (pegel && jetzt - miniLetzterPegel < 40) return // höchstens 25× pro Sekunde
    miniLetzterPegel = jetzt
  }
  const z = zustand()
  api.fenster.miniZustand({
    zustand: z,
    titel: z === 'bereit' && wakeAktiv ? 'Hört auf „Hey Luzzy“' : ZUSTAND_TEXT[z],
    werkzeug: beschaeftigt && werkzeug ? werkzeug.replace(/_/g, ' ') : '',
    frage: luzzyFragt || freigabeOffen(),
    freigabe: freigabeOffen(), // solange sie auf dein Ja wartet, bleibt die Insel sichtbar
    ...(pegel !== undefined ? { pegel } : {})
  })
}
// Dateien auf Fenni gezogen: als Anhang an die Eingabe, in die auch Gesprochenes kommt (geht mit der nächsten Nachricht mit)
api.fenster.beiMiniDateien?.((pfade) => {
  if (!Array.isArray(pfade) || !pfade.length) return
  anhaengeDazu(document.querySelector('.befehl'), pfade)
  const was = pfade.length === 1 ? pfade[0].split(/[\\/]/).pop() : `${pfade.length} Dateien`
  untertitelZeigen(`${was} ist angekommen. Klick auf Fenni und sag, was ich damit machen soll.`, { fertig: true })
})
api.fenster.beiMini((an) => {
  miniAn = Boolean(an)
  miniInfo.an(miniAn)
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
  // Nur Luzzys Eingaben (Zentrale, Luzzys Chat); die Crew-Eingabe schaltet ihr eigenes Gespräch (unterhaltung.js)
  for (const knopf of document.querySelectorAll('.eingabe-form .senden')) sendeKnopfSetzen(knopf, beschaeftigt, { wer: 'Luzzy' })
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
  miniInfo.worte(kurz) // auch rechts in der Mini-Insel
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

// ── Befehlspalette (Strg+P): Befehlsliste und Einrichten in rahmen/befehlsliste.js ──
ablageEinrichten({
  verbunden: () => verbunden,
  luzzy: (text, optionen) => {
    ansichtZeigen('zentrale')
    return anLuzzy(text, optionen)
  }
})

// Befehlspalette (rahmen/befehlsliste.js). Weiterleitungen, weil manche Funktionen erst weiter unten entstehen.
befehlslisteEinrichten({
  ansichtZeigen: (...a) => ansichtZeigen(...a),
  abschicken: (...a) => abschicken(...a),
  feldHoehe: (...a) => feldHoehe(...a),
  aktivitaetMelden: (...a) => aktivitaetMelden(...a),
  untertitelZeigen: (...a) => untertitelZeigen(...a),
  lokalAntworten: (...a) => lokalAntworten(...a),
  freihaendigSetzen: (...a) => freihaendigSetzen(...a),
  hoerModusUmschalten: (...a) => hoerModusUmschalten(...a),
  leisteUmschalten: (...a) => leisteUmschalten(...a),
  nichtStoerenSetzen: (...a) => nichtStoerenSetzen(...a),
  panelGeschlossen: (...a) => panelGeschlossen(...a),
  panelSetzen: (...a) => panelSetzen(...a),
  selbsttest: (...a) => selbsttest(...a),
  sprechenStarten: (...a) => sprechenStarten(...a),
  wiederholen: (...a) => wiederholen(...a),
  vorleser: () => vorleser,
  bereiche: () => BEREICHE,
  einstellungen: () => einstellungen,
  einstellungenSetzen: (neu) => (einstellungen = neu)
})
$('mini-an').addEventListener('click', () => api.fenster.mini(true))

// ── Senden (aus der Mitte oder aus dem Gesprächs-Fenster) ──
// Luzzy antwortet selbst, ohne Hermes (Timer, Nicht stören …)
function lokalAntworten(text, { gesprochen = false } = {}) {
  letzteEingabeGesprochen = gesprochen // Gesprächsmodus: danach wie gewohnt weiter zuhören
  untertitelZeigen(text, { fertig: true })
  letzteAntwortMerken(text)
  vorleser.sprechen(text, stimmOptionen())
}

// ── „Luzzy, was siehst du?“ (Idee 37) ──
// Nur im Mini-Modus und nur auf Felix' Befehl: EIN Bildschirmfoto (Bildschirm mit der Maus) geht an Luzzy, sie sagt,
// was sie sieht, und hilft bei dem, was offen ist. Nie heimlich, nichts wird gespeichert. Die Leiste leuchtet dabei weiß.
const SEHEN = /^(?:was siehst du|was ist (?:das|hier) auf (?:dem|meinem) bildschirm|(?:schau|guck|sieh)(?: dir)?(?: mal)?(?: kurz)? (?:auf |über )?(?:den |meinen )?bildschirm|(?:schau|guck|sieh) (?:dir )?(?:mal )?(?:kurz )?(?:das|hier)(?: mal)?(?: kurz)? an|kannst du (?:meinen bildschirm|das) sehen)/
async function bildschirmZeigen(text, { gesprochen = false } = {}) {
  if (!verbunden) return lokalAntworten('Ich bin gerade nicht mit Hermes verbunden, darum kann ich nicht schauen.', { gesprochen })
  if (beschaeftigt) return lokalAntworten('Ich antworte noch. Frag mich gleich nochmal.', { gesprochen })
  api.fenster.miniZustand({ zustand: 'schaut', titel: 'Luzzy schaut auf den Bildschirm' })
  try {
    await api.hermes.bild(await api.fenster.bildschirmAufnehmen(), 'bildschirm.jpg')
  } catch (e) {
    miniSenden()
    return lokalAntworten(`Ich konnte nicht auf den Bildschirm schauen: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, { gesprochen })
  }
  anLuzzy(
    `${text}\n\n[Felix hat dich gerade gebeten, auf seinen Bildschirm zu schauen. Das Bild im Anhang ist ein einzelnes Bildschirmfoto davon. Sag kurz, was du siehst, und hilf bei dem, was dort offen ist (z. B. Fehlermeldung, Shopify-Seite, Design). Antworte kurz, deine Antwort wird vorgelesen: keine Tabellen, keine Listen mit Code.]`,
    { anzeige: `📸 Bildschirm\n${text}`, gesprochen, vorlesen: true }
  )
}

// Befehle, die Jarves-OS selbst erledigt. Gehen sofort, auch ohne Hermes und während Luzzy noch antwortet.
function lokalerBefehl(text, { gesprochen = false } = {}) {
  // Wartet eine Hermes-Freigabe: „Ja“ / „Nein“ / „Stopp“ beantworten sie
  const freigabe = freigabeAusText(text)
  if (freigabe) return lokalAntworten(freigabe, { gesprochen }), true
  if (STOPPWOERTER.has(text.toLowerCase().replace(/[.,!?]/g, '').replace(/^(hey )?luzzy /, '').replace(/\s+/g, ' ').trim())) return stoppen(), true
  // „Hör nur noch auf Knopfdruck“ / „Freihändig an“
  const hoerBefehl = text.toLowerCase().replace(/[.,!?]/g, '').replace(/^(hey )?luzzy /, '').replace(/\s+/g, ' ').trim()
  if (/^(?:hör|höre) (?:nur noch |nur )?auf knopfdruck$|^(?:freihändig|freihand|mikrofon) aus$|^(?:hör|höre) (?:nicht mehr zu|nicht mehr mit|auf mitzuhören)$/.test(hoerBefehl)) return freihaendigSetzen(false, { sagen: false }), lokalAntworten('Okay, ich höre nur noch zu, wenn du das Mikrofon startest.', { gesprochen }), true
  if (/^(?:freihändig|freihand) (?:an|ein)$|^(?:hör|höre) wieder (?:mit|zu)$/.test(hoerBefehl)) return freihaendigSetzen(true, { sagen: false }), lokalAntworten('Ich höre wieder von selbst zu. Sag einfach Hey Luzzy.', { gesprochen }), true
  // „Luzzy, was siehst du?“ – nur im Mini-Modus: ein Bildschirmfoto an Luzzy
  if (miniAn && SEHEN.test(hoerBefehl)) return bildschirmZeigen(text, { gesprochen }), true
  // Ist gerade eine Datei offen: „Luzzy, ändere …“ ändert die Datei (live im Text, gespeichert wird nur per Klick)
  const aenderung = aenderungsBefehl(text)
  if (aenderung) return dateiAntworten(aenderung, { gesprochen }), true
  // PC-Sofortbefehle (Lautstärke, Musik, Ordner, Sperren); Programme weiter unten, weil erst nachgesehen werden muss,
  // ob es sie gibt. Browser, Seiten und Suchen macht Luzzy selbst (Werkzeug pc_steuern).
  const pcSicher = pcBefehlErkennen(text)
  if (pcSicher && pcSicher.art !== 'programm') return dateiAntworten(pcAusfuehren(pcSicher, { bereichOeffnen }), { gesprochen }), true
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
dateiansichtEinrichten({ beiFehler: (e) => systemNachricht(`Datei: ${e.message}`), luzzy: (text, optionen) => anLuzzy(text, optionen) })
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

// „Öffne Kalender“, „Starte Fokus“: Bereiche von Jarves-OS gehen vor gleichnamigen Programmen
function bereichOeffnen(name) {
  const gesucht = String(name || '').toLowerCase().trim()
  const b = BEREICHE.find((x) => x.aktiv && (x.name.toLowerCase() === gesucht || x.id === gesucht))
  if (!b) return false
  ansichtZeigen(b.id)
  return true
}

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
  const form = feld.closest('form')
  if (!text && !anhaengeAnzahl(form)) return
  losgelegt = true
  luzzyFragt = false
  // Mit Anhang (Datei oder Bild): direkt an Luzzy, keine lokalen Befehle
  if (anhaengeAnzahl(form)) {
    if (!verbunden) return systemNachricht('Anhänge gehen nur, wenn Hermes verbunden ist.')
    if (beschaeftigt) return systemNachricht('Luzzy antwortet noch. Schick den Anhang gleich nochmal.')
    feld.value = ''
    feldHoehe(feld)
    let a
    try {
      a = await anhaengeSenden(form, 'zentrale')
    } catch (e) {
      return systemNachricht(`Anhang: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    }
    const frage = text || 'Schau dir das an und sag mir kurz, was drin ist.'
    const liste = a.namen.map((n, i) => `${a.symbole[i]} ${n}`).join('   ')
    return anLuzzy(`${frage}${a.text ? `\n\n${a.text}` : ''}`, { anzeige: `${liste}${text ? `\n${text}` : ''}`, gesprochen })
  }
  if (lokalerBefehl(text, { gesprochen })) {
    feld.value = ''
    feldHoehe(feld)
    return
  }
  // „Kira, …“: direkt an den Bot (Offene Entscheidung 3)
  const anrede = botAnrede(text)
  if (anrede) {
    feld.value = ''
    feldHoehe(feld)
    return botAnsprechen(anrede, { gesprochen })
  }
  // Plugin-Befehle, die das Plugin selbst beantwortet (z. B. „Merk dir: …“)
  const pluginAntwort = await pluginBefehl(text, { gesprochen })
  if (pluginAntwort) {
    feld.value = ''
    feldHoehe(feld)
    if (pluginAntwort.antwort) lokalAntworten(pluginAntwort.antwort, { gesprochen })
    return
  }
  // PC-Sofortbefehl „Öffne <Programm>“: nur wenn es das Programm gibt, sonst weiter unten (am Ende an Luzzy).
  const pcPlan = pcBefehlErkennen(text)
  if (pcPlan?.art === 'programm') {
    const satz = await pcAusfuehren(pcPlan, { bereichOeffnen }).catch((e) => `Das hat nicht geklappt: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    if (satz) {
      feld.value = ''
      feldHoehe(feld)
      return lokalAntworten(satz, { gesprochen })
    }
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
  if (!verbunden) {
    // Notbetrieb: Luzzy antwortet lokal über Ollama
    if (einstellungen?.notfall?.an === false) return systemNachricht('Noch keine Verbindung zu Hermes.')
    feld.value = ''
    feldHoehe(feld)
    return notfallFrage(text, { gesprochen, grund: 'Hermes ist nicht erreichbar' })
  }
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
    return anLuzzy(`${text}\n\n[Von Vendo mitgeschickt, Stand ${stand}. Nutze diese Daten direkt statt zu suchen:]\n${mitgeliefert}`, { anzeige: text, gesprochen })
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
let luzzyBeiText = null // bekommt Luzzys Antwort laufend, während sie schreibt (z. B. Änderungen live in eine Datei)
async function anLuzzy(text, { anzeige = text, vorlesen = false, gesprochen = false, nachher = null, beiText = null } = {}) {
  if (!text || beschaeftigt || !verbunden) return false
  letzteEingabeGesprochen = gesprochen
  letzteFrage = anzeige
  vorlesenErzwungen = Boolean(vorlesen)
  luzzyNachher = typeof nachher === 'function' ? nachher : null
  luzzyBeiText = typeof beiText === 'function' ? beiText : null
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
    luzzyBeiText = null
    laufendeBeenden()
    zustandZeigen()
    systemNachricht(`Konnte nicht senden: ${e.message}`)
    if (!verbunden || NETZ_FEHLER.test(e.message)) notfallFrage(anzeige, { gesprochen, ohneFrage: true, grund: 'Hermes ist nicht erreichbar' })
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
// Das Gespräch mit Luzzy steht nicht mehr rechts angedockt, sondern im Crew-Tab (Normaler Chat → Luzzy).
// „Öffnen“ (Gesprächs-Karte rechts, Strg+K, Klick auf den Untertitel) springt dorthin, „Schließen“ zurück zur Zentrale.
const panel = $('gespraech-panel')
const panelGeschlossen = () => !(offeneAnsicht() === 'crew' && crewKanal() === 'zentrale')

function panelSetzen(offen) {
  panel.hidden = true
  titelfarbeSetzen()
  if (offen) {
    ansichtZeigen('crew')
    luzzyChatZeigen().then(() => {
      runterScrollen()
      $('luzzy-form')?.querySelector('.eingabe-text')?.focus()
    })
  } else if (!panelGeschlossen()) ansichtZeigen('zentrale')
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
  if (ev.type === 'request.cancel') return freigabeZurueckgezogen(ev.payload?.id) // Hermes hat eine Rückfrage zurückgezogen
  if (ev.type === 'message.start' || ev.type === 'message.complete') cockpitAnstossen() // Cockpit: Aufträge und „arbeitet“ neu rechnen
  if (ev.kanal && ev.kanal !== 'zentrale') return crewEreignis(ev) // Crew-Tab: Luzzys Bot Chat und die Bot-Gespräche
  const p = ev.payload || {}
  switch (ev.type) {
    case 'message.start':
      beschaeftigt = true
      jaKnoepfeEntfernen()
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
      try {
        luzzyBeiText?.(aktuelleAntwort.roh)
      } catch (e) {
        console.warn('Live-Änderung:', e.message)
      }
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
      luzzyFragt = /\?[\s"'»«“”)\]]*$/.test(klartext(text))
      if (aktuelleAntwort) {
        aktuelleAntwort.textEl.innerHTML = markdownZuHtml(text)
        aktuelleAntwort.el.roh = text
      }
      else if (text) nachrichtAnzeigen('luzzy', text)
      if (p.status === 'error' || p.error) {
        systemNachricht(p.error || p.failure_reason || 'Die Antwort ist fehlgeschlagen.')
        // Internet oder Cloud-Modell weg: Luzzy antwortet im Notbetrieb lokal
        if (NETZ_FEHLER.test(String(p.error || p.failure_reason || '')) && letzteFrage) setTimeout(() => notfallFrage(letzteFrage, { gesprochen: letzteEingabeGesprochen, ohneFrage: true, grund: 'Das Cloud-Modell antwortet nicht' }), 0)
      }
      // Bittet Luzzy um Felix' Ja: Knöpfe „Ja, mach“ / „Nein“ darunter
      else if (text) jaKnoepfeAnhaengen(aktuelleAntwort?.el || [...document.querySelectorAll('#gespraech .msg.luzzy')].at(-1), text)
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
      luzzyBeiText = null
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
      // "Hey Luzzy" gehört: zuhören (läuft Musik, pausiert sie kurz und läuft danach weiter)
      musikKurzAnhalten().then(() => sprechenStarten())
      break
    case 'error':
      systemNachricht(p.message || 'Fehler in Hermes.')
      if (NETZ_FEHLER.test(String(p.message || '')) && letzteFrage && beschaeftigt) setTimeout(() => notfallFrage(letzteFrage, { gesprochen: letzteEingabeGesprochen, ohneFrage: true, grund: 'Das Cloud-Modell antwortet nicht' }), 0)
      beschaeftigt = false
      aktuelleAntwort = null
      luzzyNachher = null
      luzzyBeiText = null
      zustandZeigen()
      break
  }
})

api.hermes.beiVerlauf((v) => (v?.kanal && v.kanal !== 'zentrale' ? crewVerlauf(v) : verlaufZeigen(v?.verlauf)))

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
    freigabenLeeren()
    beschaeftigt = false
    aktuelleAntwort = null
    $('luzzy-zustand').textContent = text || 'Nicht verbunden'
    reaktor.zustand('getrennt')
  } else {
    zustandZeigen()
    infoLaden()
    wakeEinrichten()
    if (offeneAnsicht() !== 'crew') crewLaden()
    // Beim Start wiederhergestellter Bereich: jetzt mit Verbindung richtig laden (Crew-Chat öffnen usw.)
    if (offeneAnsicht() !== 'zentrale') ansichtZeigen(offeneAnsicht())
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

// Navigation (Bereiche links, Bereich wechseln, Aktualisieren): rahmen/navigation.js
navigationEinrichten({
  einstellungen: () => einstellungen,
  verbunden: () => verbunden,
  hoerModusAnwenden: () => hoerModusAnwenden(),
  // „Aktualisieren“ im Crew-Tab: offenen Chat neu aus Hermes holen (z. B. nach Löschen in der Hermes-App)
  chatNeuLaden: async () => {
    if (crewKanal() === 'zentrale' && (beschaeftigt || aktuelleAntwort)) throw new Error('Antwort läuft noch')
    gezeigterVerlauf = ''
    await aktuellenChatNeuLaden()
  }
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
  einstellungen: () => einstellungen,
  beiNeu: (m) => miniInfo.meldung(m) // Mini-Insel klappt kurz auf
})
api.waechter.beiMeldung(meldungNeu)

// Shopify-Token im System-Tab erneuern (siehe shopifyzugang.js)
shopifyZugangEinrichten({ melden: meldungNeu })

// Suchleiste oben in der Zentrale (siehe suche.js): Bots öffnen ein kleines Chat-Fenster, alles andere den Tab
sucheEinrichten({
  api,
  befehle: befehleSuchen,
  bots: crewBots,
  botsLaden: crewBotsLaden,
  botFenster: botFensterOeffnen,
  dateiZeigen,
  notizOeffnen,
  luzzy: (text) => {
    ansichtZeigen('zentrale')
    const feld = document.querySelector('.befehl .eingabe-text')
    feld.value = text
    abschicken(feld)
  }
})
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    sucheOeffnen() // die Suchleiste sitzt in der Kopfleiste, geht in jedem Bereich
  }
})

// Cockpit in der Zentrale (siehe cockpit.js): Instrumente oben, Luzzy und die aktivsten Bots darunter
cockpitEinrichten({
  api,
  verbunden: () => verbunden,
  botFenster: botFensterOeffnen,
  crewOeffnen: () => ansichtZeigen('crew'),
  zentraleSichtbar: () => offeneAnsicht() === 'zentrale'
})

// Terminal-Bereich (siehe terminal.js): echte PowerShell, „Meine Befehle“ in daten/terminal-befehle.json
terminalEinrichten()

// Kosten-Wächter im System-Tab, warnt bei 80 % / 100 % des Budgets (siehe kosten.js)
kostenEinrichten({
  api,
  einstellungen: () => einstellungen,
  speichern: async (teil) => {
    Object.assign(einstellungen, teil)
    await api.einstellungen.speichern(teil)
  },
  melden: meldungNeu
})

// Datei oder Bild an Luzzy (siehe anhaenge.js)
anhaengeEinrichten({ api, melden: (satz) => untertitelZeigen(satz, { fertig: true }) })

// Notfall-Luzzy: lokal über Ollama, wenn Hermes oder die Cloud nicht erreichbar ist (siehe notfall.js)
notfallEinrichten({
  api,
  kontext: () => pluginKontext(),
  felix: (text) => nachrichtAnzeigen('felix', text),
  luzzy: (text, modell) => {
    const { el } = nachrichtAnzeigen('luzzy', text)
    el.classList.add('notfall')
    el.querySelector('.msg-wer').insertAdjacentHTML('beforeend', `<span class="notfall-marke">🛟 Notbetrieb${modell ? ` · ${maskieren(modell)}` : ''}</span>`)
    letzteAntwortMerken(text)
  },
  untertitel: (text) => untertitelZeigen(text, { fertig: true }),
  sprechen: (text) => vorleser.sprechen(text, stimmOptionen()),
  zuhoeren: () => weiterZuhoeren(),
  modell: () => einstellungen?.notfall?.modell || ''
})
function notfallFrage(text, { gesprochen = false, ohneFrage = false, grund = '' } = {}) {
  if (einstellungen?.notfall?.an === false) return false
  letzteEingabeGesprochen = gesprochen
  return notfallAntworten(text, { gesprochen: gesprochen || Boolean(einstellungen?.vorlesen), ohneFrage, grund })
}

// Freigaben: Hermes fragt vor riskanten Befehlen, Luzzy vor Shop-Änderungen (siehe freigaben.js)
freigabenEinrichten({
  api,
  vorlesen: (text) => vorleser.sprechen(text, stimmOptionen()),
  zuhoeren: () => {
    if (einstellungen?.sprache?.weiterZuhoeren && !spricht && !hoert) sprechenStarten({ ohneSpracheNach: 8000 })
  },
  melden: meldungNeu,
  geaendert: () => miniSenden(),
  luzzy: (text) => {
    const feld = document.querySelector('.befehl .eingabe-text')
    feld.value = text
    abschicken(feld)
  }
})
api.waechter.beiProblem(problemNeu)

// Verbindungsanzeige oben: Shopify und Postfach (grün = verbunden, rot = Problem, Klick = jetzt prüfen)
const QUELLEN = { shopify: ['shopify-status', 'Shopify'], mail: ['mail-status', 'Postfach'] }
const verbindungStand = {} // quelle → { ok, text }, auch für die Startsequenz
function verbindungZeigen({ quelle, ok, text }) {
  verbindungStand[quelle] = { ok, text }
  if (quelle === 'shopify') shopifyZugangStatus({ ok, text })
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
setInterval(() => verbunden && offeneAnsicht() !== 'crew' && crewLaden(), 30000)

// Gespräche im Crew-Bereich: Normaler Chat mit den Bots und Bot Mode (siehe crewchat.js)
crewChatEinrichten({
  api,
  crewSichtbar: () => offeneAnsicht() === 'crew',
  crewOeffnen: () => offeneAnsicht() !== 'crew' && ansichtZeigen('crew'),
  aktivitaet: (text, laeuft) => {
    if (laeuft) return aktivitaetMelden(text, true)
    laufendeBeenden()
    aktivitaetMelden(text)
  },
  // Ein Bot hat geantwortet, während Felix woanders ist: melden
  fertigWoanders: (bot, text) => {
    if (!text) return
    const luzzyCrew = bot.profil === 'donnerwolf'
    meldungNeu({
      art: 'crew',
      titel: luzzyCrew ? 'Die Crew ist fertig' : `${bot.name} hat geantwortet`,
      text: luzzyCrew ? 'Felix, die Crew hat ein Ergebnis für dich. Schau mal in den Crew-Bereich.' : `Felix, ${bot.name} hat dir geantwortet. Steht im Crew-Bereich.`,
      anzeige: 'Antwort im Crew-Bereich',
      zeit: Date.now()
    })
  }
})

// „Kira, …“ in der Zentrale: direkt an den Bot (normaler Chat), Antwort kommt hier als Untertitel und im Crew-Tab
async function botAnsprechen({ bot, text }, { gesprochen = false } = {}) {
  if (!verbunden) return systemNachricht(`${bot.name} ist nur erreichbar, wenn Hermes verbunden ist.`)
  untertitelZeigen(`An ${bot.name} geschickt. Die Antwort kommt gleich, sie steht auch im Crew-Tab.`, { fertig: true })
  aktivitaetMelden(`${bot.name} arbeitet`, true)
  try {
    const ok = await anBotSenden(bot, text, (antwort) => {
      laufendeBeenden()
      if (!antwort) return untertitelZeigen(`${bot.name} hat nicht geantwortet. Schau im Crew-Tab nach.`, { fertig: true })
      untertitelZeigen(`${bot.name}: ${antwort}`, { fertig: true })
      letzteAntwortMerken(antwort)
      if (gesprochen || einstellungen?.vorlesen) {
        letzteEingabeGesprochen = gesprochen
        vorleser.sprechen(antwort, stimmOptionen()).then(() => weiterZuhoeren())
      }
    })
    if (!ok) untertitelZeigen(`${bot.name} arbeitet noch an der letzten Aufgabe. Versuch es gleich nochmal.`, { fertig: true })
  } catch (e) {
    laufendeBeenden()
    systemNachricht(`${bot.name}: ${e.message}`)
  }
}

// ── Einstellungen ──
const stimmOptionen = () => ({ stimme: einstellungen.stimme, tempo: einstellungen.tempo, lautstaerke: einstellungen.lautstaerke })

// Einstellungs-Dialog (Formular, Tabs, Pocket TTS, Sicherung …): rahmen/einstellungsfenster.js
einstellungsfensterEinrichten({
  einstellungen: () => einstellungen,
  einstellungenSetzen: (neu) => (einstellungen = neu),
  vorleser: () => vorleser,
  mikrofonStatusZeigen: () => mikrofonStatusZeigen(mikrofon.zustand()),
  // nach „Speichern“: die neuen Einstellungen auf die App anwenden
  nachSpeichern: () => {
    animationenAnwenden()
    kartenAnwenden(einstellungen.karten)
    wakeEinrichten()
  }
})

// Designs, Tageszeit-Farben, Farbe der Windows-Knöpfe: rahmen/design.js

function animationenAnwenden() {
  designAnwenden()
  tageszeitAnwenden()
  const a = einstellungen.animationen
  document.body.classList.toggle('anim-reaktor', a.reaktor)
  document.body.classList.toggle('anim-welle', a.welle)
  document.body.classList.toggle('anim-scanlinie', a.scanlinie)
  document.body.classList.toggle('anim-hintergrund', a.hintergrund)
  cockpitAnzeigen(einstellungen.cockpit !== false)
}

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
  if (s.zustand === 'bereit') crewBotsLaden().catch(() => {}) // Namen der Bots für „Kira, …“
  if (s.zustand === 'bereit') buehneStarten().catch(() => {}) // Karte „Crew live“ rechts mitlesen lassen
  if (s.zustand === 'bereit') cockpitAnstossen() // Cockpit: gleich mit den Zahlen loslegen
  if (s.zustand === 'bereit') verlaufZeigen((await api.hermes.verlaufHolen('zentrale'))?.verlauf)
  statusZeigen({ zustand: s.zustand, text: s.text })
  breiteSetzen(einstellungen.panel?.breite || 460)
  leistenAnwenden()
  timerEinrichten({ gespeichert: einstellungen.timer, speichern: (liste) => api.einstellungen.speichern({ timer: liste }), alarm: timerAlarm })
  nichtStoerenZeigen()
  const testAnsicht = new URLSearchParams(location.search).get('ansicht') // nur Testmodus
  if (testAnsicht) setTimeout(() => bereichLaedt(testAnsicht) && ansichtZeigen(testAnsicht), 5000)
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
  pluginBereicheHinzufuegen(pluginBereiche)
  pluginsBereit(pluginBereiche.length)
  geladenePlugins = pluginBereiche.length
  // Rechte Spalte: eigene Auswahl und Reihenfolge (Einstellungen → Rechte Spalte)
  kartenEinrichten(document.querySelector('.live'))
  kartenAnwenden(einstellungen.karten)
  // Zuletzt offenen Bereich wieder öffnen (nur wenn es ihn noch gibt, z. B. Plugin gelöscht)
  const letzte = einstellungen.letzteAnsicht
  if (!testAnsicht && letzte && letzte !== 'zentrale' && BEREICHE.some((b) => b.id === letzte && b.aktiv)) ansichtZeigen(letzte)
  const testPanel = new URLSearchParams(location.search).get('panel') // nur Testmodus: '1' offen, '0' zu
  if (testPanel === '1') panelSetzen(true) // nur Testmodus
}

start()
