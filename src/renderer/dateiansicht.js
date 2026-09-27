// Dateiansicht: „Luzzy, such die Datei Thor-Hoodie und öffne sie“, „Öffne die Datei Preisliste“, „Zeig mir das Bild Logo“.
// Gesucht wird in Felix' üblichen Ordnern (siehe src/main/dateisuche.js). Die Datei erscheint in einem Fenster über
// Jarves-OS, ohne eigenen Tab: Notizen, Texte, Tabellen, Bilder, PDF, Videos, Musik. Alles andere (Word, Excel …):
// Knopf „Mit Programm öffnen“. Mehrere Treffer: Liste zum Anklicken oder „die zweite“ sagen.

import { markdownZuHtml } from './markdown.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Was gesucht wird: Schlüsselwort → Art (für die Anzeige) oder Endungen (Excel, Word …)
const ART_WORT = { bild: 'bild', foto: 'bild', pdf: 'pdf', video: 'video', tabelle: 'tabelle', notiz: 'markdown' }
const ENDUNG_WORT = { excel: ['.xlsx', '.xls', '.csv'], word: ['.docx', '.doc'], präsentation: ['.pptx', '.ppt'], powerpoint: ['.pptx', '.ppt'] }
// Ganze Wörter; \b taugt nicht, weil JavaScript „ö“ nicht als Buchstaben zählt („öffne“ am Satzanfang)
const wort = (liste) => new RegExp(`(?<![\\p{L}\\p{N}])(${liste})(?![\\p{L}\\p{N}])`, 'iu')
const SCHLUESSEL = wort('datei|dokument|bild|foto|pdf|video|tabelle|notiz|excel|word|präsentation|powerpoint')
const OEFFNEN_ABSICHT = wort('öffne|oeffne|öffnen|oeffnen|aufmachen|mach\\p{L}* (?:\\p{L}+ )*?auf|zeig|zeige|zeigen')
const NUR_OEFFNEN = wort('öffne|oeffne|öffnen|oeffnen|aufmachen|mach\\p{L}* (?:\\p{L}+ )*?auf')
const SUCH_ABSICHT = wort('such|suche|suchen|find|finde|finden|wo ist|wo liegt|wo sind')
const PFAD = /[A-Za-z]:\\[^\n"<>|*?]+/
// Füllwörter, die nicht zum Dateinamen gehören
const WEG = new Set(('such suche suchen find finde finden öffne oeffne öffnen oeffnen zeig zeige zeigen mach mache mal auf aufmachen und sie es ' +
  'die das den dem der mir bitte doch nach meine meinen meiner meines mein eine einen ein kannst könntest du würdest wo ist liegt sind namens ' +
  'mit namen heißt heisst datei dokument bild foto pdf video tabelle notiz excel word präsentation powerpoint vom von über zum zur zu hey hallo ok luzzy ' +
  'jetzt schnell gerade kurz noch im in unter aus ordner am pc computer rechner meinem meiner').split(' '))

const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')
const normal = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[_\-.+()[\]]+/g, ' ').replace(/\s+/g, ' ').trim()

// { suche, art, endungen, sicher } | { pfad } | null
// sicher: klar eine Datei gemeint (Schlüsselwort, Endung oder Suche). Sonst („öffne mir die Preisliste“) nur öffnen,
// wenn es eine passende Datei gibt, und sonst an Luzzy weitergeben.
export function dateiBefehlErkennen(text) {
  const satz = ohneLuzzy(text).replace(/[?!]+\s*$/, '').trim()
  const pfad = PFAD.exec(satz)
  if (pfad && (OEFFNEN_ABSICHT.test(satz) || SUCH_ABSICHT.test(satz))) return { pfad: pfad[0].replace(/[\s.,;:]+$/, '') }
  const oeffnen = OEFFNEN_ABSICHT.test(satz)
  const suchen = SUCH_ABSICHT.test(satz)
  if (!oeffnen && !suchen) return null
  const schluessel = (SCHLUESSEL.exec(satz)?.[1] || '').toLowerCase()
  const worte = satz
    .replace(/[„“"'»«]/g, ' ')
    .replace(/\s+punkt\s+(\w{2,4})\b/gi, '.$1') // „Preisliste Punkt PDF“
    .split(/\s+/)
    .map((w) => w.replace(/^[,;:.]+|[,;:.]+$/g, ''))
    .filter((w) => w && !WEG.has(w.toLowerCase()))
  const suche = worte.join(' ').trim()
  if (!suche) return null
  const endung = /\.\w{2,5}$/.test(suche)
  // Ohne Schlüsselwort und Endung ist „zeig mir …“ meist keine Datei (Bestellungen, Wetter …): das bleibt bei Luzzy.
  // „Such die Preisliste“ / „Öffne die Preisliste“: unsicher, Jarves-OS schaut nach und gibt sonst an Luzzy weiter
  if (!schluessel && !endung && !(suchen && oeffnen) && !NUR_OEFFNEN.test(satz) && !suchen) return null
  return { suche, art: ART_WORT[schluessel] || null, endungen: ENDUNG_WORT[schluessel] || null, sicher: Boolean(schluessel || endung || (suchen && oeffnen)) }
}

const ZAHLEN = ['erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte']

// „die zweite“, „Nummer 3“, „die 2“ – nur solange die Trefferliste offen ist
export function trefferNummer(text) {
  if (!letzteTreffer.length || !$('dateiansicht').open || $('dateiansicht').dataset.modus !== 'liste') return null
  const satz = ohneLuzzy(text).toLowerCase().replace(/[.!?]/g, '').trim()
  const t = /^(?:die |das |den |nummer |nr )?(\d|erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte)(?: datei| davon)?$/.exec(satz)
  if (!t) return null
  const n = /\d/.test(t[1]) ? Number(t[1]) : ZAHLEN.indexOf(t[1]) + 1
  return n >= 1 && n <= letzteTreffer.length ? n : null
}

let letzteTreffer = []
let offeneId = null

const groesse = (b) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const datum = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
// Für Luzzys Satz: ohne Endung, „thor_hoodie-entwurf“ → „thor hoodie entwurf“
const sprechName = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
const ortText = (t) => [t.ort, t.ordner].filter(Boolean).join(' › ')

// Suchen und zeigen. Gibt den Satz zurück, den Luzzy dazu sagt.
// nurWennPassend: bei unsicheren Befehlen („öffne die Preisliste“) null, wenn keine Datei wirklich passt (dann Luzzy)
export async function dateiSuchenUndZeigen({ suche, art, endungen, pfad }, { nurWennPassend = false } = {}) {
  if (pfad) return pfadOeffnen(pfad)
  let treffer = await api.datei.suchen(suche)
  const worte = normal(suche).split(' ')
  // Unsicherer Befehl: nur echte Treffer (jedes Wort im Namen oder Ordner), nichts Ungefähres, sonst an Luzzy
  if (nurWennPassend) treffer = treffer.filter((t) => !t.ungefaehr && worte.some((w) => normal(t.name).includes(w)))
  if (art || endungen) {
    const passend = treffer.filter((t) => (art && t.art === art) || (endungen && endungen.some((e) => t.name.toLowerCase().endsWith(e))))
    if (passend.length) treffer = passend
  }
  if (!treffer.length) {
    if (nurWennPassend) return null
    const st = await api.datei.stand().catch(() => null)
    if (st && !st.fertig) return `Ich lese deinen PC gerade noch ein, bisher kenne ich ${st.dateien.toLocaleString('de-DE')} Dateien. Frag mich gleich nochmal.`
    return `Ich finde auf deinem PC keine Datei mit dem Namen ${suche}.`
  }
  letzteTreffer = treffer
  // Eindeutig (nur einer, oder der Name passt genau): gleich öffnen
  const genau = treffer.filter((t) => normal(t.name.replace(/\.[^.]+$/, '')) === normal(suche) || normal(t.name) === normal(suche))
  if (treffer.length === 1 || genau.length === 1) {
    const t = genau[0] || treffer[0]
    await dateiZeigen(t)
    return `Hier ist ${sprechName(t.name)}.${t.ungefaehr ? ' Den Namen hab ich nur ungefähr gefunden.' : ''}`
  }
  listeZeigen(suche, treffer)
  return `Ich hab ${treffer.length} Dateien gefunden. Welche meinst du? Sag zum Beispiel: die erste.`
}

// Pfade in Luzzys Antwort (z. B. „C:\\Users\\Felix\\Desktop\\Preisliste.pdf“), wenn Felix ums Öffnen gebeten hat:
// die erste Datei, die es gibt, gleich anzeigen. Gibt true zurück, wenn eine angezeigt wird.
export function istOeffnenWunsch(text) {
  return OEFFNEN_ABSICHT.test(String(text || '')) || SUCH_ABSICHT.test(String(text || ''))
}
export async function pfadAusAntwortOeffnen(antwort) {
  // Erst die längste Lesart („Logo.v2.svg“), dann die kürzeste („Preisliste.pdf und ist offen“)
  const text = String(antwort || '')
  const lang = [...text.matchAll(/[A-Za-z]:\\[^\n"<>|*?`]+\.[A-Za-z0-9]{1,5}(?![A-Za-z0-9])/g)].map((t) => t[0].trim())
  const kurz = [...text.matchAll(/[A-Za-z]:\\[^\n"<>|*?`]+?\.[A-Za-z0-9]{1,5}(?![A-Za-z0-9])/g)].map((t) => t[0].trim())
  const pfade = [...lang, ...kurz]
  for (const pfad of [...new Set(pfade)].slice(0, 5)) {
    if (await pfadOeffnen(pfad, { still: true })) return true
  }
  return false
}

// Datei über ihren vollen Pfad öffnen (Felix nennt ihn, oder er steht in Luzzys Antwort)
export async function pfadOeffnen(pfad, { still = false } = {}) {
  let t
  try {
    t = await api.datei.pfad(pfad)
  } catch (e) {
    if (still) return null
    return `Die Datei kann ich nicht öffnen: ${e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
  }
  letzteTreffer = [t]
  await dateiZeigen(t)
  return `Hier ist ${sprechName(t.name)}.`
}

export async function trefferOeffnen(n) {
  const t = letzteTreffer[n - 1]
  if (!t) return ''
  await dateiZeigen(t)
  return `Hier ist ${sprechName(t.name)}.`
}

function oeffnenFalls() {
  const dialog = $('dateiansicht')
  if (!dialog.open) dialog.showModal()
}

function listeZeigen(suche, treffer) {
  if (ungespeichert()) throw new Error('Du hast noch ungespeicherte Änderungen. Erst speichern oder verwerfen.')
  offeneId = null
  offen = null
  bearbeiten = false
  luzzyLauf = null
  $('da-aenderungen').innerHTML = ''
  statusSetzen('')
  for (const k of ['da-bearbeiten', 'da-speichern', 'da-verwerfen', 'da-rueck', 'da-luzzy']) $(k).hidden = true
  const dialog = $('dateiansicht')
  dialog.dataset.modus = 'liste'
  $('da-name').textContent = `Gefunden: ${suche}`
  $('da-ort').textContent = 'Anklicken oder sagen, zum Beispiel „die erste“.'
  $('da-ordner').hidden = $('da-programm').hidden = true
  const inhalt = $('da-inhalt')
  inhalt.className = 'da-inhalt'
  inhalt.innerHTML = `<div class="da-liste">${treffer
    .map((t, i) => `<div class="da-treffer" tabindex="0" data-nr="${i + 1}"><span class="da-nr">${i + 1}</span><b>${maskieren(t.name)}</b><small>${maskieren(ortText(t))} · ${datum(t.geaendert)}</small></div>`)
    .join('')}</div>`
  oeffnenFalls()
  inhalt.querySelector('.da-treffer')?.focus()
}

async function dateiZeigen(treffer) {
  if (ungespeichert()) throw new Error('Du hast noch ungespeicherte Änderungen. Erst speichern oder verwerfen.')
  const d = await api.datei.inhalt(treffer.id)
  offeneId = d.id
  const text = typeof d.text === 'string' ? d.text.replace(/\r\n/g, '\n') : null
  offen = { ...d, text, crlf: typeof d.text === 'string' && d.text.includes('\r\n'), treffer }
  bearbeiten = false
  luzzyLauf = null
  warnungGezeigt = false
  const dialog = $('dateiansicht')
  dialog.dataset.modus = 'datei'
  $('da-name').textContent = d.name
  ortZeigen()
  $('da-ordner').hidden = $('da-programm').hidden = false
  statusSetzen('')
  $('da-aenderungen').innerHTML = ''
  inhaltZeichnen()
  knoepfeZeigen()
  oeffnenFalls()
}

function ortZeigen() {
  $('da-ort').textContent = `${ortText(offen.treffer)} · ${groesse(offen.groesse)} · geändert ${datum(offen.geaendert)}`
}

function inhaltZeichnen() {
  const d = offen
  const inhalt = $('da-inhalt')
  inhalt.className = `da-inhalt${['bild', 'video', 'audio'].includes(d.art) || d.art === 'andere' ? ' zentriert' : ''}`
  if (d.art === 'markdown') inhalt.innerHTML = `<div class="da-md">${markdownZuHtml(d.text.replace(/^---\n[\s\S]*?\n---\n/, ''))}</div>`
  else if (d.art === 'text') inhalt.innerHTML = `<pre class="da-text">${maskieren(d.text)}</pre>`
  else if (d.art === 'tabelle') inhalt.innerHTML = tabelle(d.text)
  else if (d.art === 'bild') inhalt.innerHTML = `<img src="${maskieren(d.url)}" alt="${maskieren(d.name)}" />`
  else if (d.art === 'pdf') inhalt.innerHTML = `<iframe src="${maskieren(d.url)}" title="${maskieren(d.name)}"></iframe>`
  else if (d.art === 'video') inhalt.innerHTML = `<video src="${maskieren(d.url)}" controls autoplay></video>`
  else if (d.art === 'audio') inhalt.innerHTML = `<audio src="${maskieren(d.url)}" controls autoplay></audio>`
  else
    inhalt.innerHTML = `<div class="da-hinweis">${maskieren(d.hinweis || 'Diese Art Datei kann Jarves-OS nicht selbst anzeigen.')}<br />Mit „Mit Programm öffnen“ geht sie im passenden Programm auf.</div>`
}

// ── Bearbeiten: Felix selbst oder Luzzy (live, Stelle für Stelle). Gespeichert wird NUR mit Felix' Klick. ──
let offen = null // { id, name, art, text (zuletzt gespeichert, Zeilenende \n), crlf, geaendert, bearbeitbar, rueckgaengig, treffer }
let bearbeiten = false
let warnungGezeigt = false
let luzzyLauf = null // { vorher, angewendet, aenderungen: [{ alt, neu, pos, fehlt }] }
let h = { luzzy: async () => false, beiFehler: () => {} }
const editor = () => $('da-inhalt').querySelector('.da-editor')
export const ungespeichert = () => Boolean(offen && bearbeiten && editor() && editor().value !== offen.text)

function statusSetzen(text, warnung = false) {
  $('da-status').textContent = text
  $('da-status').classList.toggle('warnung', warnung)
}
function knoepfeZeigen() {
  const kann = Boolean(offen?.bearbeitbar)
  const geaendert = ungespeichert()
  $('da-bearbeiten').hidden = !kann
  $('da-bearbeiten').textContent = bearbeiten ? 'Fertig' : 'Bearbeiten'
  $('da-speichern').hidden = !bearbeiten
  $('da-speichern').disabled = !geaendert
  $('da-verwerfen').hidden = !geaendert
  $('da-rueck').hidden = !(kann && offen.rueckgaengig && !geaendert)
  $('da-luzzy').hidden = !bearbeiten
  if (geaendert) statusSetzen('● Nicht gespeichert. Speichern musst du selbst (Strg+S).', true)
  else if ($('da-status').classList.contains('warnung')) statusSetzen('')
}

function bearbeitenAn() {
  if (!offen?.bearbeitbar) return false
  bearbeiten = true
  const inhalt = $('da-inhalt')
  inhalt.className = 'da-inhalt'
  inhalt.innerHTML = '<textarea class="da-editor" spellcheck="false"></textarea>'
  editor().value = offen.text
  editor().addEventListener('input', () => {
    warnungGezeigt = false
    knoepfeZeigen()
  })
  aenderungenZeigen()
  knoepfeZeigen()
  return true
}
function bearbeitenAus() {
  if (ungespeichert()) return statusSetzen('Erst speichern oder verwerfen.', true)
  bearbeiten = false
  luzzyLauf = null
  aenderungenZeigen()
  inhaltZeichnen()
  knoepfeZeigen()
}

async function speichernKlick() {
  if (!ungespeichert()) return
  const wert = editor().value
  try {
    const r = await api.datei.speichern(offen.id, offen.crlf ? wert.replace(/\n/g, '\r\n') : wert, offen.geaendert)
    offen.text = wert
    offen.geaendert = r.geaendert
    offen.groesse = r.groesse
    offen.rueckgaengig = true
    luzzyLauf = null
    aenderungenZeigen()
    ortZeigen()
    knoepfeZeigen()
    statusSetzen('✓ Gespeichert. Die alte Fassung ist gesichert (Rückgängig).')
  } catch (e) {
    statusSetzen(fehlerText(e), true)
  }
}
function verwerfenKlick() {
  if (!editor()) return
  editor().value = offen.text
  luzzyLauf = null
  aenderungenZeigen()
  knoepfeZeigen()
  statusSetzen('Änderungen verworfen.')
}
async function rueckgaengigKlick() {
  try {
    const r = await api.datei.rueckgaengig(offen.id)
    offen.text = r.text.replace(/\r\n/g, '\n')
    offen.crlf = r.text.includes('\r\n')
    offen.geaendert = r.geaendert
    offen.groesse = r.groesse
    offen.rueckgaengig = false
    if (editor()) editor().value = offen.text
    else inhaltZeichnen()
    ortZeigen()
    knoepfeZeigen()
    statusSetzen('↶ Die Fassung vor dem letzten Speichern ist zurück.')
  } catch (e) {
    statusSetzen(fehlerText(e), true)
  }
}
const fehlerText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// Luzzy ändert: sie schickt Änderungsblöcke, Jarves-OS trägt jeden sofort im Text ein, sobald er vollständig ist
const BLOCK = /<<<ALT\r?\n([\s\S]*?)\r?\n===\r?\n([\s\S]*?)\r?\n?>>>/g
const AENDERN = /^(?:bitte\s+)?(?:kannst du\s+)?(ändere|änder|ändern|ersetze|ersetz|schreib|schreibe|füge|füg|lösch|lösche|entferne|entfern|korrigier|korrigiere|verbessere|verbesser|übersetze|übersetz|formulier|formuliere|kürze|kürz|ergänze|ergänz|tausch|tausche|streich|streiche|setz|setze|mach|mache|pass|passe|nimm|benenn|benenne)(?![\p{L}])/iu

// Solange eine bearbeitbare Datei offen ist: „Luzzy, ändere den Preis …“ geht an die Datei (Satz-Promise oder null)
export function aenderungsBefehl(text) {
  if (!offen?.bearbeitbar || !$('dateiansicht').open) return null
  const satz = ohneLuzzy(text).replace(/^[,\s]+/, '').trim()
  if (!AENDERN.test(satz)) return null
  return luzzyAendern(satz)
}

async function luzzyAendern(anweisung, { gesprochen = true } = {}) {
  if (!bearbeiten && !bearbeitenAn()) return 'Diese Datei kann ich nicht bearbeiten.'
  const text = editor().value
  if (text.length > 60000) return 'Die Datei ist zu groß, um sie mit mir zu bearbeiten. Du kannst sie aber selbst ändern.'
  luzzyLauf = { vorher: text, angewendet: 0, aenderungen: [] }
  aenderungenZeigen()
  statusSetzen('Luzzy ändert …')
  const auftrag = [
    `Felix hat die Datei „${offen.name}“ offen und möchte sie ändern: „${anweisung}“.`,
    'Ändere nur die Stellen, die dafür nötig sind. Antworte ausschließlich mit Änderungsblöcken in genau diesem Format (beliebig viele):',
    '<<<ALT',
    'der bisherige Text, Zeichen für Zeichen genau wie in der Datei, gerade so lang, dass er eindeutig ist',
    '===',
    'der neue Text',
    '>>>',
    'Etwas einfügen: nimm als ALT die Zeile davor und schreib sie im neuen Text mit dem Zusatz. Etwas löschen: neuer Text leer.',
    'Keine Einleitung, keine Erklärung, keine Werkzeuge benutzen, nichts speichern. Gespeichert wird nur, wenn Felix selbst auf Speichern klickt.',
    '',
    `Die Datei „${offen.name}“:`,
    '"""',
    text,
    '"""'
  ].join('\n')
  const ok = await h.luzzy(auftrag, {
    anzeige: `✏️ ${offen.name}: ${anweisung}`,
    gesprochen,
    beiText: (roh) => bloeckeAnwenden(roh),
    nachher: (antwort) => {
      bloeckeAnwenden(antwort)
      return zusammenfassung()
    }
  })
  if (ok === false) {
    luzzyLauf = null
    statusSetzen('')
    return 'Ich antworte gerade noch. Sag es gleich nochmal.'
  }
  return ''
}

function bloeckeAnwenden(roh) {
  if (!luzzyLauf || !editor()) return
  const bloecke = [...String(roh || '').matchAll(BLOCK)]
  for (let i = luzzyLauf.angewendet; i < bloecke.length; i++) einsetzen(bloecke[i][1], bloecke[i][2])
  luzzyLauf.angewendet = Math.max(luzzyLauf.angewendet, bloecke.length)
}

function einsetzen(alt, neu) {
  const feld = editor()
  let wert = feld.value
  let pos = wert.indexOf(alt)
  let laenge = alt.length
  if (pos < 0 && alt.trim()) {
    // Leerzeichen/Zeilenumbrüche weichen oft leicht ab: flexibel suchen
    const muster = alt.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const t = new RegExp(muster).exec(wert)
    if (t) {
      pos = t.index
      laenge = t[0].length
    }
  }
  if (pos < 0 || !alt) {
    luzzyLauf.aenderungen.push({ alt, neu, fehlt: true })
    return aenderungenZeigen()
  }
  wert = wert.slice(0, pos) + neu + wert.slice(pos + laenge)
  feld.value = wert
  luzzyLauf.aenderungen.push({ alt, neu, pos })
  zeigenBei(pos, neu.length, { fokus: false })
  aenderungenZeigen()
  knoepfeZeigen()
}

// Zur Stelle scrollen (und markieren, wenn das Feld den Fokus bekommen darf)
function zeigenBei(pos, laenge, { fokus = true } = {}) {
  const feld = editor()
  if (!feld) return
  const zeile = feld.value.slice(0, pos).split('\n').length
  const hoehe = parseFloat(getComputedStyle(feld).lineHeight) || 20
  feld.scrollTop = Math.max(0, (zeile - 4) * hoehe)
  if (fokus) {
    feld.focus()
    feld.setSelectionRange(pos, pos + laenge)
  }
}

function aenderungenZeigen() {
  const el = $('da-aenderungen')
  if (!luzzyLauf?.aenderungen.length) return (el.innerHTML = '')
  const kurz = (t) => maskieren(t.replace(/\s+/g, ' ').trim().slice(0, 60) || '(leer)')
  el.innerHTML = `${luzzyLauf.aenderungen
    .map((a, i) =>
      a.fehlt
        ? `<span class="da-aenderung fehlt" title="${maskieren(a.alt)}"><span>✗ nicht gefunden: „${kurz(a.alt)}“</span></span>`
        : `<button type="button" class="da-aenderung" data-nr="${i}" title="Zur Stelle springen"><span>✎ „${kurz(a.alt)}“ → „${kurz(a.neu)}“</span></button>`
    )
    .join('')}<button type="button" class="da-aenderung alle-weg" data-alle-weg><span>Luzzys Änderungen verwerfen</span></button>`
}

function zusammenfassung() {
  if (!luzzyLauf) return ''
  const gut = luzzyLauf.aenderungen.filter((a) => !a.fehlt).length
  const fehlt = luzzyLauf.aenderungen.length - gut
  knoepfeZeigen()
  if (!ungespeichert()) statusSetzen('')
  if (!luzzyLauf.aenderungen.length) return 'Ich habe keine Änderung eingetragen. Sag mir genauer, was ich ändern soll.'
  return `${gut === 1 ? 'Eine Stelle' : `${gut} Stellen`} geändert.${fehlt ? ` ${fehlt === 1 ? 'Eine Stelle' : `${fehlt} Stellen`} habe ich nicht gefunden.` : ''} Schau es dir an. Gespeichert ist noch nichts, das machst du mit Speichern.`
}

// CSV/TSV als Tabelle (Trennzeichen raten: Semikolon, Tab oder Komma), höchstens 1.000 Zeilen
function tabelle(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim())
  const erste = zeilen[0] || ''
  const trenner = ['\t', ';', ','].sort((a, b) => erste.split(b).length - erste.split(a).length)[0]
  const zelle = (z) => {
    const teile = []
    let akt = ''
    let inAnf = false
    for (const c of z) {
      if (c === '"') inAnf = !inAnf
      else if (c === trenner && !inAnf) teile.push(akt), (akt = '')
      else akt += c
    }
    teile.push(akt)
    return teile
  }
  const kopf = zelle(erste)
  const rest = zeilen.slice(1, 1001)
  return `<table class="da-tabelle"><thead><tr>${kopf.map((k) => `<th>${maskieren(k)}</th>`).join('')}</tr></thead><tbody>${rest
    .map((z) => `<tr>${zelle(z).map((k) => `<td title="${maskieren(k)}">${maskieren(k)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>${zeilen.length > 1001 ? `<div class="da-hinweis">Nur die ersten 1.000 Zeilen.</div>` : ''}`
}

export function dateiansichtEinrichten({ beiFehler = () => {}, luzzy } = {}) {
  h = { ...h, beiFehler, ...(luzzy ? { luzzy } : {}) }
  const dialog = $('dateiansicht')
  // Nicht gespeichert? Erst warnen; wer nochmal schließt, verwirft die Änderungen
  const schliessen = () => {
    if (ungespeichert() && !warnungGezeigt) {
      warnungGezeigt = true
      return statusSetzen('● Nicht gespeichert! Nochmal schließen verwirft die Änderungen.', true)
    }
    dialog.close()
  }
  $('da-zu').addEventListener('click', schliessen)
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault()
    schliessen()
  })
  dialog.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && bearbeiten) {
      e.preventDefault()
      speichernKlick()
    }
  })
  $('da-bearbeiten').addEventListener('click', () => (bearbeiten ? bearbeitenAus() : bearbeitenAn() && editor().focus()))
  $('da-speichern').addEventListener('click', speichernKlick)
  $('da-verwerfen').addEventListener('click', verwerfenKlick)
  $('da-rueck').addEventListener('click', rueckgaengigKlick)
  $('da-luzzy-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const feld = e.target.querySelector('input')
    const anweisung = feld.value.trim()
    if (!anweisung) return
    feld.value = ''
    const satz = await luzzyAendern(anweisung, { gesprochen: false })
    if (satz) statusSetzen(satz, true)
  })
  $('da-aenderungen').addEventListener('click', (e) => {
    if (e.target.closest('[data-alle-weg]')) {
      if (luzzyLauf && editor()) editor().value = luzzyLauf.vorher
      luzzyLauf = null
      aenderungenZeigen()
      knoepfeZeigen()
      return statusSetzen('Luzzys Änderungen verworfen.')
    }
    const knopf = e.target.closest('.da-aenderung[data-nr]')
    const a = knopf && luzzyLauf?.aenderungen[Number(knopf.dataset.nr)]
    if (!a || !editor()) return
    const wert = editor().value
    let pos = wert.indexOf(a.neu, Math.max(0, a.pos - 200))
    if (pos < 0) pos = wert.indexOf(a.neu)
    if (pos >= 0) zeigenBei(pos, a.neu.length)
  })
  $('da-ordner').addEventListener('click', () => offeneId && api.datei.imOrdner(offeneId).catch((e) => beiFehler(e)))
  $('da-programm').addEventListener('click', () => offeneId && api.datei.mitProgramm(offeneId).catch((e) => beiFehler(e)))
  const waehlen = (el) => el && dateiZeigen(letzteTreffer[Number(el.dataset.nr) - 1]).catch((e) => beiFehler(e))
  $('da-inhalt').addEventListener('click', (e) => waehlen(e.target.closest('.da-treffer')))
  $('da-inhalt').addEventListener('keydown', (e) => e.key === 'Enter' && waehlen(e.target.closest('.da-treffer')))
  // Beim Schließen Videos/Musik anhalten
  dialog.addEventListener('close', () => {
    if (dialog.open) return // gleich wieder geöffnet (nächste Datei): nichts leeren
    $('da-inhalt').innerHTML = ''
    offeneId = null
    offen = null
    bearbeiten = false
    luzzyLauf = null
    $('da-luzzy').hidden = true
    $('da-aenderungen').innerHTML = ''
    statusSetzen('')
  })
}
