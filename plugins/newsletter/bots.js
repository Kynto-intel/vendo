'use strict'
// Newsletter-Plugin: Aufträge von Hermes-Bots.
//
// Ein Bot (vorgesehen: die Newsletter-Texterin) steuert das Plugin — nur versenden kann er
// nicht. Daraus folgen die festen Regeln dieser Datei:
//   - Ein Bot verschickt nie etwas an Empfänger. Alles, was Versand auslöst, bleibt bei
//     Felix: planen, starten, eine Automation einschalten. Eine Kampagne kann der Bot nur
//     **zur Freigabe** geben: dann geht eine Testmail an Felix' eigene Adresse, und erst
//     Felix' Bestätigung in Vendo plant den Versand.
//   - Ein Bot darf Kampagnen-Entwürfe, Vorlagen und ausgeschaltete Automationen anlegen,
//     ändern und löschen, die Marke (Name, Logo, Farben) pflegen, Kontakte bei Shopify
//     abgleichen und alles auswerten.
//   - Ein Bot sieht keine einzelnen Kontakte (nur Zahlen), keine Zugangsdaten, ändert weder
//     Impressum noch Abmeldeweg, Postfach oder Stundenbudget, und rührt nichts an, was
//     geplant ist, läuft oder schon verschickt wurde.
//   - Automationen senden von selbst, sobald sie eingeschaltet sind. Ein Bot ändert sie
//     deshalb nur, solange sie aus sind.
//
// Der Weg: der Bot legt eine Auftragsdatei in den Eingangskorb, Vendo führt sie mit den
// eigenen Funktionen aus und legt die Antwort daneben. So bleibt Vendo der einzige, der
// newsletter.json schreibt — dort liegen auch Kontakte und Warteschlange, und zwei
// Schreiber auf einer Datei überschreiben sich gegenseitig.

const fs = require('node:fs')
const path = require('node:path')
const { MAX_HTML } = require('./html-mail.js')

const EINGANG = path.join(__dirname, '..', '..', 'daten', 'plugins', 'newsletter', 'eingang')
const MAX_AUFTRAG = 400000 // Bytes je Auftragsdatei: HTML bis 200 000 Zeichen plus Umlaute
const ALTER_MAX = 10 * 60000 // Liegengebliebenes nach zehn Minuten wegräumen

// Was ein Bot darf. Jede Aktion nennt die Felder, die sie annimmt; alles andere fällt weg.
const AKTIONEN = {
  ueberblick: [],
  auswertung: [],
  kampagne_zeigen: ['id'],
  kampagne_neu: ['name', 'betreff', 'vorschauText', 'html', 'htmlRahmen', 'vorlage_id'],
  kampagne_aendern: ['id', 'name', 'betreff', 'vorschauText', 'html', 'htmlRahmen'],
  kampagne_kopieren: ['id', 'name'],
  kampagne_loeschen: ['id'],
  kampagne_zur_freigabe: ['id', 'zeitpunkt'],
  vorlage_zeigen: ['id'],
  vorlage_neu: ['name', 'beschreibung', 'html', 'htmlRahmen'],
  vorlage_aus_muster: ['id'],
  vorlage_aendern: ['id', 'name', 'beschreibung', 'html', 'htmlRahmen'],
  vorlage_aus_kampagne: ['id', 'name', 'beschreibung'],
  vorlage_loeschen: ['id'],
  automation_neu: ['art', 'name'],
  automation_zeigen: ['id'],
  automation_aendern: ['id', 'name'],
  automation_schritt_neu: ['id', 'betreff', 'html', 'htmlRahmen', 'nach_stunden', 'verfall_stunden'],
  automation_schritt_aendern: ['id', 'schritt', 'betreff', 'html', 'htmlRahmen', 'nach_stunden', 'verfall_stunden'],
  automation_schritt_loeschen: ['id', 'schritt'],
  automation_loeschen: ['id'],
  automation_zur_probe: ['id', 'schritt'],
  kontakte_abgleichen: [],
  shop_produkte: ['suche'],
  shop_bestseller: ['tage'],
  shop_warenkorb: ['tage'],
  links_pruefen: ['id'],
  marke_aendern: ['titel', 'logo', 'farben']
}

// Nur lesend: ändern nichts, also auch kein Neuzeichnen in Vendo
const NUR_LESEN = ['ueberblick', 'auswertung', 'kampagne_zeigen', 'vorlage_zeigen', 'automation_zeigen', 'shop_produkte', 'shop_bestseller', 'shop_warenkorb', 'links_pruefen']

// Diese Aktionen schicken eine Testmail oder fragen Shopify; der Bot wartet darauf länger
const MIT_MAIL = ['kampagne_zur_freigabe', 'automation_zur_probe', 'kontakte_abgleichen', 'shop_produkte', 'shop_bestseller', 'shop_warenkorb', 'links_pruefen']

// Zustände, in denen ein Bot eine Kampagne noch ändern oder löschen darf
const BOT_AENDERBAR = ['entwurf', 'freigabe']

const LAENGEN = { id: 64, name: 80, betreff: 200, vorschauText: 200, beschreibung: 200, html: MAX_HTML, zeitpunkt: 40, vorlage_id: 64, suche: 100, art: 30, titel: 80, logo: 500 }
const GANZZAHLEN = { schritt: [1, 20], nach_stunden: [0, 2160], verfall_stunden: [1, 2160], tage: [7, 365] }

const ID_FORM = /^[A-Za-z0-9_-]{6,64}$/

// Einen Auftrag prüfen und auf das Erlaubte zuschneiden. Unbekannte Aktionen und Felder
// werden nicht geraten, sondern abgelehnt bzw. weggelassen.
function auftragPruefen(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return { ok: false, fehler: 'Der Auftrag ist kein Objekt.' }
  const aktion = String(roh.aktion ?? '').trim()
  if (!Object.prototype.hasOwnProperty.call(AKTIONEN, aktion)) {
    return { ok: false, fehler: `Unbekannte oder nicht erlaubte Aktion „${aktion.slice(0, 40)}“. Erlaubt: ${Object.keys(AKTIONEN).join(', ')}.` }
  }
  const quelle = roh.argumente && typeof roh.argumente === 'object' && !Array.isArray(roh.argumente) ? roh.argumente : {}
  const argumente = {}
  for (const feld of AKTIONEN[aktion]) {
    const wert = quelle[feld]
    if (wert === undefined || wert === null) continue
    if (feld === 'htmlRahmen') {
      argumente[feld] = Boolean(wert)
      continue
    }
    if (GANZZAHLEN[feld]) {
      const [von, bis] = GANZZAHLEN[feld]
      const zahl = Number(wert)
      if (!Number.isInteger(zahl) || zahl < von || zahl > bis) {
        return { ok: false, fehler: feld === 'schritt' ? '„schritt“ ist die Nummer des Schritts, beginnend bei 1.' : `„${feld}“ ist eine ganze Zahl von ${von} bis ${bis}.` }
      }
      argumente[feld] = zahl
      continue
    }
    if (feld === 'farben') {
      if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return { ok: false, fehler: '„farben“ ist ein Objekt, z. B. {"akzent": "#8a6a3b"}.' }
      argumente.farben = Object.fromEntries(Object.entries(wert).slice(0, 20).map(([k, v]) => [String(k).slice(0, 20), String(v).slice(0, 20)]))
      continue
    }
    const text = String(wert)
    const grenze = LAENGEN[feld] ?? 200
    if (text.length > grenze) return { ok: false, fehler: `„${feld}“ ist zu lang (höchstens ${grenze} Zeichen).` }
    if ((feld === 'betreff' || feld === 'name' || feld === 'vorschauText') && /[\r\n]/.test(text)) {
      return { ok: false, fehler: `„${feld}“ darf keinen Zeilenumbruch enthalten.` }
    }
    argumente[feld] = text
  }
  if (AKTIONEN[aktion].includes('id') && !argumente.id) return { ok: false, fehler: 'Die ID fehlt. Erst „ueberblick“ aufrufen und die ID von dort nehmen.' }
  return { ok: true, aktion, argumente }
}

// „2026-11-20 10:00“, „2026-11-20T10:00“ oder Millisekunden — in Ortszeit. Muss in der
// Zukunft liegen, sonst ist es kein Wunschtermin.
function zeitpunktLesen(text, { jetzt = Date.now() } = {}) {
  if (text === undefined || text === null || String(text).trim() === '') return { ok: true, wert: null }
  const roh = String(text).trim()
  let wert = null
  if (/^\d{10,14}$/.test(roh)) wert = Number(roh)
  else {
    const t = roh.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/)
    if (t) wert = new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3]), Number(t[4]), Number(t[5])).getTime()
  }
  if (!Number.isFinite(wert)) return { ok: false, fehler: 'Den Zeitpunkt bitte als JJJJ-MM-TT HH:MM angeben, z. B. 2026-11-20 10:00.' }
  if (wert <= jetzt) return { ok: false, fehler: 'Der Zeitpunkt liegt in der Vergangenheit.' }
  return { ok: true, wert }
}

// ── Eingangskorb ──
// Dateien: <id>.auftrag.json (vom Bot), <id>.antwort.json (von Vendo). Beide werden über
// eine Zwischendatei geschrieben und umbenannt, damit niemand eine halbe Datei liest.

function sicherSchreiben(datei, inhalt) {
  const zwischen = `${datei}.${process.pid}.tmp`
  fs.writeFileSync(zwischen, inhalt, 'utf8')
  fs.renameSync(zwischen, datei)
}

// Offene Aufträge, älteste zuerst. Eine Datei, die nicht lesbar ist, kommt mit Fehler zurück
// — der Bot soll eine Antwort bekommen, statt ewig zu warten.
function eingangLesen(ordner = EINGANG) {
  let namen
  try {
    namen = fs.readdirSync(ordner)
  } catch {
    return []
  }
  const auftraege = []
  for (const name of namen) {
    const treffer = name.match(/^([A-Za-z0-9_-]{6,64})\.auftrag\.json$/)
    if (!treffer) continue
    const datei = path.join(ordner, name)
    let stand
    try {
      stand = fs.statSync(datei)
    } catch {
      continue
    }
    const eintrag = { id: treffer[1], datei, zeit: stand.mtimeMs }
    if (stand.size > MAX_AUFTRAG) eintrag.fehler = 'Der Auftrag ist zu groß.'
    else {
      try {
        eintrag.roh = JSON.parse(fs.readFileSync(datei, 'utf8'))
      } catch {
        eintrag.fehler = 'Der Auftrag ist kein gültiges JSON.'
      }
    }
    auftraege.push(eintrag)
  }
  return auftraege.sort((a, b) => a.zeit - b.zeit)
}

// Den Auftrag aus dem Korb nehmen, bevor er ausgeführt wird. Gelingt das nicht, hat ihn der
// Bot schon zurückgezogen (Zeit abgelaufen) — dann wird er auch nicht ausgeführt.
function auftragNehmen(eintrag) {
  try {
    fs.unlinkSync(eintrag.datei)
    return true
  } catch {
    return false
  }
}

function antwortSchreiben(id, antwort, ordner = EINGANG) {
  if (!ID_FORM.test(String(id))) return false
  fs.mkdirSync(ordner, { recursive: true })
  sicherSchreiben(path.join(ordner, `${id}.antwort.json`), JSON.stringify(antwort))
  return true
}

// Antworten, die niemand abgeholt hat, und Zwischendateien wegräumen
function aufraeumen(ordner = EINGANG, { jetzt = Date.now() } = {}) {
  let namen
  try {
    namen = fs.readdirSync(ordner)
  } catch {
    return 0
  }
  let weg = 0
  for (const name of namen) {
    if (!/\.(antwort\.json|tmp)$/.test(name)) continue
    const datei = path.join(ordner, name)
    try {
      if (jetzt - fs.statSync(datei).mtimeMs > ALTER_MAX) {
        fs.unlinkSync(datei)
        weg += 1
      }
    } catch {
      // schon weg
    }
  }
  return weg
}

module.exports = {
  AKTIONEN,
  NUR_LESEN,
  MIT_MAIL,
  BOT_AENDERBAR,
  EINGANG,
  ID_FORM,
  auftragPruefen,
  zeitpunktLesen,
  eingangLesen,
  auftragNehmen,
  antwortSchreiben,
  aufraeumen
}
