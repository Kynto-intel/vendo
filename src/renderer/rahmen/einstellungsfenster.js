// Einstellungs-Dialog (Knopf „Einstellungen“ unten links): Formular füllen und lesen, Tabs, Stimme probehören und
// Pocket-TTS-Aufnahme, Verknüpfung und Autostart, Sicherung, Töne probehören, Speichern beim Schließen.
// Angebunden in app.js mit einstellungsfensterEinrichten({ einstellungen, einstellungenSetzen, vorleser,
// mikrofonStatusZeigen, nachSpeichern }). Das Design (Einstellungen → Aussehen) ist rahmen/design.js.

import { kartenFormularFuellen, kartenFormularLesen } from '../karten.js'
import { tonSpielen } from '../toene.js'
import { designAnwenden, designFormularFuellen, designFormularLesen } from './design.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)

let h = { einstellungen: () => null, einstellungenSetzen: () => {}, vorleser: () => null, mikrofonStatusZeigen: () => {}, nachSpeichern: () => {} }

export function einstellungsfensterEinrichten(helfer) {
  h = { ...h, ...helfer }
}

// Pocket TTS (#39): Aufnahme wählen, Zustand zeigen
let pocketDatei = ''
let pocketUhr = null
const dateiName = (p) => String(p || '').split(/[\\/]/).pop()
const maskieren = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const stimmeFuer = (anbieter, einstellungen = h.einstellungen()) => anbieter === 'pocket' ? einstellungen.stimme : einstellungen[`${anbieter}Stimme`]

async function stimmenFuellen(anbieter, ausgewaehlt = '') {
  const auswahl = $('e-stimme')
  const hinweis = $('e-stimme-hinweis')
  $('e-stimmen-laden').hidden = anbieter !== 'elevenlabs'
  auswahl.disabled = true
  hinweis.textContent = anbieter === 'elevenlabs' ? 'Lade Stimmen aus deinem ElevenLabs-Konto …' : ''
  try {
    if (anbieter === 'elevenlabs') {
      const status = await api.stimme.zugangStatus()
      if (!status.elevenlabs) {
        if ($('e-stimme-anbieter').value !== anbieter) return
        auswahl.innerHTML = '<option value="">API-Schlüssel fehlt</option>'
        hinweis.textContent = status.speicherVerfuegbar ? 'Speichere zuerst unten deinen ElevenLabs-API-Schlüssel.' : 'Verschlüsselter Speicher nicht verfügbar.'
        return
      }
    }
    const ergebnis = await api.stimme.liste(anbieter)
    if (!Array.isArray(ergebnis) && ergebnis?.fehler) throw new Error(ergebnis.fehler)
    const stimmen = Array.isArray(ergebnis) ? ergebnis : ergebnis.stimmen || []
    if ($('e-stimme-anbieter').value !== anbieter) return
    const liste = [...stimmen]
    if (ausgewaehlt && !liste.some((s) => s.id === ausgewaehlt)) liste.unshift({ id: ausgewaehlt, name: ausgewaehlt, herkunft: 'gespeichert' })
    auswahl.innerHTML = liste.map((s) => `<option value="${maskieren(s.id)}">${maskieren(s.name)} (${maskieren(s.herkunft)})</option>`).join('')
    auswahl.value = ausgewaehlt || liste[0]?.id || ''
    auswahl.disabled = !liste.length
    hinweis.textContent = anbieter !== 'elevenlabs' ? '' : stimmen.length
      ? `${stimmen.length} für Free verfügbare Stimmen gefunden.`
      : 'Dieses Konto stellt aktuell keine für Free freigegebene Stimme bereit.'
  } catch (e) {
    if ($('e-stimme-anbieter').value === anbieter) {
      auswahl.innerHTML = '<option value="">Stimmenliste nicht verfügbar</option>'
      hinweis.textContent = e.message
    }
  }
}

async function zugaengeAnzeigen() {
  const status = { speicherVerfuegbar: false }
  try {
    Object.assign(status, await api.stimme.zugangStatus())
  } catch {
    // Zugänge bleiben nicht verfügbar, wenn der Hauptprozess sie nicht lesen kann.
  }
  for (const anbieter of ['gemini', 'elevenlabs']) {
    const el = $(`e-${anbieter}-status`)
    el.textContent = !status.speicherVerfuegbar
      ? 'Verschlüsselter Speicher nicht verfügbar.'
      : status[anbieter] ? 'API-Schlüssel verschlüsselt gespeichert.' : 'Kein API-Schlüssel gespeichert.'
    el.dataset.zustand = !status.speicherVerfuegbar ? 'fehler' : status[anbieter] ? 'bereit' : 'aus'
  }
}

async function zugangSpeichern(anbieter, entfernen = false) {
  const feld = $(`e-${anbieter}-schluessel`)
  const status = $(`e-${anbieter}-status`)
  const knopf = $(`e-${anbieter}-${entfernen ? 'entfernen' : 'speichern'}`)
  const schluessel = entfernen ? '' : feld.value.trim()
  if (!entfernen && !schluessel) return feld.focus()
  knopf.disabled = true
  status.textContent = entfernen ? 'Entferne Schlüssel …' : 'Speichere verschlüsselt …'
  try {
    await api.stimme.zugangSetzen(anbieter, schluessel)
    feld.value = ''
    await zugaengeAnzeigen()
    if (anbieter === 'elevenlabs' && $('e-stimme-anbieter').value === 'elevenlabs') {
      await stimmenFuellen('elevenlabs', h.einstellungen().elevenlabsStimme)
    }
  } catch (e) {
    status.textContent = e.message
    status.dataset.zustand = 'fehler'
  } finally {
    knopf.disabled = false
  }
}

async function pocketAnzeigen() {
  const lokal = $('e-stimme-anbieter').value === 'pocket'
  $('e-pocket').hidden = !lokal
  if (!lokal) {
    clearTimeout(pocketUhr)
    return
  }
  const wahl = $('e-stimme').value
  $('e-pocket-datei-zeile').hidden = $('e-pocket-hinweis').hidden = wahl !== 'eigen'
  $('e-pocket-datei').textContent = pocketDatei ? dateiName(pocketDatei) : 'Keine Aufnahme gewählt'
  clearTimeout(pocketUhr)
  const z = await api.stimme.pocketZustand().catch(() => ({ zustand: 'fehler', text: 'nicht erreichbar' }))
  const status = $('e-pocket-status')
  status.textContent = `Pocket TTS: ${z.text}`
  status.dataset.zustand = z.zustand
  if ($('einstellungen').open && z.zustand === 'startet') pocketUhr = setTimeout(pocketAnzeigen, 2000)
}
function pocketStarten() {
  const anbieter = $('e-stimme-anbieter').value
  api.stimme.pocketStarten({ stimmeAnbieter: anbieter, stimme: anbieter === 'pocket' ? $('e-stimme').value : h.einstellungen().stimme, pocketDatei }).then(pocketAnzeigen, pocketAnzeigen)
}
const zahl = (s) => parseInt(String(s).replace(/[^-\d]/g, ''), 10) || 0

function formularFuellen() {
  const anbieter = h.einstellungen().stimmeAnbieter || 'pocket'
  $('e-stimme-anbieter').value = anbieter
  pocketDatei = h.einstellungen().pocketDatei || ''
  stimmenFuellen(anbieter, stimmeFuer(anbieter)).catch(() => {})
  pocketAnzeigen()
  zugaengeAnzeigen()
  $('e-tempo').value = zahl(h.einstellungen().tempo)
  $('e-lautstaerke').value = h.einstellungen().lautstaerke || 250
  $('e-vorlesen').checked = h.einstellungen().vorlesen
  $('e-freihaendig').checked = h.einstellungen().sprache.freihaendig !== false
  $('e-crewstill').checked = h.einstellungen().sprache.crewStill !== false
  $('e-wake').checked = h.einstellungen().sprache.aktivierungswort
  $('e-auto-senden').checked = h.einstellungen().sprache.automatischSenden
  $('e-weiter').checked = h.einstellungen().sprache.weiterZuhoeren
  $('e-unterbrechen').checked = h.einstellungen().sprache.unterbrechen !== false
  $('e-musik').checked = h.einstellungen().sprache.musikErkennen !== false
  const m = h.einstellungen().meldungen
  $('e-m-vorlesen').checked = m.vorlesen
  $('e-m-ton').checked = m.ton !== false
  kartenFormularFuellen(h.einstellungen().karten)
  for (const art of ['bestellung', 'mail', 'job', 'crew']) $(`e-m-${art}`).checked = m[art]
  $('e-m-meilenstein').checked = m.meilenstein !== false
  $('e-m-ruhe-von').value = m.ruheVon || ''
  $('e-m-ruhe-bis').value = m.ruheBis || ''
  h.mikrofonStatusZeigen()
  for (const k of ['reaktor', 'welle', 'scanlinie', 'hintergrund']) $(`e-anim-${k}`).checked = h.einstellungen().animationen[k]
  $('e-tageszeit').checked = h.einstellungen().tageszeitFarben !== false
  $('e-cockpit').checked = h.einstellungen().cockpit !== false
  $('e-start-intro').checked = h.einstellungen().start?.intro !== false
  $('e-start-gruss').checked = h.einstellungen().start?.begruessung !== false
  $('e-start-gateway').checked = h.einstellungen().start?.gateway !== false
  designFormularFuellen()
  reglerAnzeigen()
}

function reglerAnzeigen() {
  const t = Number($('e-tempo').value)
  $('e-tempo-wert').textContent = `${t > 0 ? '+' : ''}${t} %`
  $('e-lautstaerke-wert').textContent = `${$('e-lautstaerke').value} %`
}

function formularLesen() {
  const t = Number($('e-tempo').value)
  const anbieter = $('e-stimme-anbieter').value
  const stimme = $('e-stimme').value
  return {
    stimmeAnbieter: anbieter,
    stimme: anbieter === 'pocket' ? stimme : h.einstellungen().stimme,
    geminiStimme: anbieter === 'gemini' ? stimme : h.einstellungen().geminiStimme,
    elevenlabsStimme: anbieter === 'elevenlabs' ? stimme : h.einstellungen().elevenlabsStimme,
    pocketDatei,
    lautstaerke: Number($('e-lautstaerke').value) || 250,
    tempo: `${t >= 0 ? '+' : ''}${t}%`,
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
      freihaendig: $('e-freihaendig').checked,
      crewStill: $('e-crewstill').checked,
      aktivierungswort: $('e-wake').checked,
      automatischSenden: $('e-auto-senden').checked,
      weiterZuhoeren: $('e-weiter').checked,
      unterbrechen: $('e-unterbrechen').checked,
      musikErkennen: $('e-musik').checked
    },
    animationen: {
      reaktor: $('e-anim-reaktor').checked,
      welle: $('e-anim-welle').checked,
      scanlinie: $('e-anim-scanlinie').checked,
      hintergrund: $('e-anim-hintergrund').checked
    },
    start: {
      intro: $('e-start-intro').checked,
      begruessung: $('e-start-gruss').checked,
      gateway: $('e-start-gateway').checked
    },
    karten: kartenFormularLesen() ?? h.einstellungen().karten,
    design: designFormularLesen(),
    tageszeitFarben: $('e-tageszeit').checked,
    cockpit: $('e-cockpit').checked
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
$('e-lautstaerke').addEventListener('input', reglerAnzeigen)
$('e-probe').addEventListener('click', async () => {
  const f = formularLesen()
  const anbieter = $('e-stimme-anbieter').value
  const stimme = $('e-stimme').value
  if (anbieter === 'pocket' && stimme === 'eigen' && !pocketDatei) return ($('e-pocket-status').textContent = 'Wähle erst eine Aufnahme für die eigene Stimme.')
  const knopf = $('e-probe')
  // Auf Pocket TTS warten, auch beim allerersten Start (lädt dann das Modell)
  knopf.disabled = true
  knopf.textContent = 'Luzzy spricht gleich …'
  if (anbieter === 'pocket') pocketStarten()
  try {
    await h.vorleser().sprechen('Hey Felix. So klinge ich. Alle Systeme bereit, was steht an?', { anbieter, stimme, tempo: f.tempo, lautstaerke: f.lautstaerke, pocketDatei, aufPocketWarten: true })
  } finally {
    knopf.disabled = false
    knopf.textContent = 'Probe hören'
    pocketAnzeigen()
  }
})
$('e-stimme-anbieter').addEventListener('change', () => {
  const anbieter = $('e-stimme-anbieter').value
  stimmenFuellen(anbieter, stimmeFuer(anbieter)).catch(() => {})
  pocketAnzeigen()
  pocketStarten()
})
$('e-stimme').addEventListener('change', () => {
  pocketAnzeigen()
  if ($('e-stimme-anbieter').value === 'pocket') pocketStarten()
})
$('e-stimmen-laden').addEventListener('click', () => {
  stimmenFuellen('elevenlabs', $('e-stimme').value || h.einstellungen().elevenlabsStimme).catch(() => {})
})
$('e-gemini-speichern').addEventListener('click', () => zugangSpeichern('gemini'))
$('e-gemini-entfernen').addEventListener('click', () => zugangSpeichern('gemini', true))
$('e-elevenlabs-speichern').addEventListener('click', () => zugangSpeichern('elevenlabs'))
$('e-elevenlabs-entfernen').addEventListener('click', () => zugangSpeichern('elevenlabs', true))
$('e-pocket-waehlen').addEventListener('click', async () => {
  const datei = await api.stimme.pocketDateiWaehlen()
  if (!datei) return
  pocketDatei = datei
  pocketStarten()
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
      ? `${vorweg}${s.verknuepfung ? 'Verknüpfung liegt auf dem Desktop. ' : ''}Doppelklick auf „Vendo“ startet ohne Terminal, npm start geht weiterhin.`
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
  if ($('einstellungen').returnValue !== 'speichern') return designAnwenden() // Vorschau verwerfen: gespeichertes Design
  h.einstellungenSetzen(await api.einstellungen.speichern(formularLesen()))
  api.stimme.pocketStarten().catch(() => {}) // neue Aufnahme: Pocket TTS damit neu starten
  h.nachSpeichern() // app.js: Animationen, Karten, Aktivierungswort
})
