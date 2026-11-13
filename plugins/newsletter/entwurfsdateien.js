'use strict'
// Newsletter-Plugin: Kampagnen-Entwürfe der KI auch als .html-Datei.
//
// Kampagnen liegen in newsletter.json, und dort schreibt nur Vendo (dieselbe Datei hält
// Kontakte und Warteschlange). Eine KI mit Dateiwerkzeugen konnte einen Entwurf deshalb nur
// als Ganzes über einen Auftrag ersetzen, nicht gezielt darin weiterarbeiten. Jetzt legt
// Vendo jeden Kampagnen-Entwurf, den eine KI angelegt hat, zusätzlich als eigene .html-Datei
// in daten/plugins/newsletter/entwuerfe/ ab und übernimmt Änderungen an der Datei zurück.
// Was gespiegelt wird, entscheidet haupt.js (`alsDatei`); dieses Modul gleicht nur ab und
// kennt deshalb auch Namen für Vorlagen und Automationsschritte.
//
// Abgleich in beide Richtungen über einen gemerkten Stand: die Prüfsumme des Inhalts, der
// zuletzt in Datei und Vendo gleich war (in .stand.json im selben Ordner, damit es einen
// Neustart übersteht):
//   Datei unverändert, Vendo geändert   → Datei neu schreiben
//   Datei geändert, Vendo unverändert   → in Vendo übernehmen, wenn erlaubt
//   beides geändert                     → das Jüngere gewinnt, das andere wird als
//                                         <name>.verworfen.html daneben gelegt
// Eine abgelehnte Änderung (z. B. Kampagne schon geplant) bleibt in der Datei stehen und
// wird mit Grund gemeldet, bis Vendo das Stück selbst wieder ändert.
// Gelöscht werden nur Dateien, die Vendo selbst angelegt hat — nie etwas, das die KI daneben
// abgelegt hat.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ORDNER = path.join(__dirname, '..', '..', 'daten', 'plugins', 'newsletter', 'entwuerfe')
const STAND_DATEI = '.stand.json'
const ARTEN = ['kampagne', 'vorlage', 'automation']
const ID_FORM = /^[A-Za-z0-9_-]{1,64}$/
// Der Kommentar oben in jeder Datei: sagt der KI, was die Datei ist. Beim Übernehmen fällt
// er weg, er gehört nicht zur Mail.
const KOPF_MUSTER = /^<!--\s*vendo-entwurf\b[\s\S]*?-->[ \t]*\n?/

const ohneBom = (text) => String(text ?? '').replace(/^﻿/, '')
// Zeilenenden und Rand vereinheitlichen: ein Editor, der CRLF schreibt, ist keine Änderung
const normal = (text) => ohneBom(text).replace(/\r\n?/g, '\n').trim()
const pruefsumme = (text) => crypto.createHash('sha1').update(normal(text), 'utf8').digest('hex')
const ohneKopf = (text) => normal(normal(text).replace(KOPF_MUSTER, ''))

function dateiName({ art, id, schritt } = {}) {
  if (!ARTEN.includes(art) || !ID_FORM.test(String(id ?? ''))) return null
  if (art === 'automation') {
    const nummer = Number(schritt)
    if (!Number.isInteger(nummer) || nummer < 1) return null
    return `automation-${id}-schritt-${nummer}.html`
  }
  return `${art}-${id}.html`
}

// In einem HTML-Kommentar darf kein „--“ stehen, sonst endet er zu früh
const kommentarSicher = (text) => String(text ?? '').replace(/-{2,}/g, '–').replace(/[\r\n]+/g, ' ')

function kopfZeile(eintrag) {
  const regel = eintrag.aenderbar
    ? 'Diese Datei ist der Inhalt in Vendo; Änderungen hier übernimmt Vendo nach wenigen Sekunden. Für kleine Stellen patch nutzen, für einen Umbau kampagne_aendern mit dem kompletten HTML — nicht write_file. Nur der Inhalt: Kopf mit Logo und Fuß setzt Vendo selbst davor und dahinter. Diesen Kommentar stehen lassen.'
    : `Nur zum Lesen: ${eintrag.grund || 'nicht änderbar'}. Änderungen hier übernimmt Vendo nicht.`
  return `<!-- vendo-entwurf: ${kommentarSicher(eintrag.titel)}\n     ${kommentarSicher(regel)} -->\n`
}

const dateiText = (eintrag) => `${kopfZeile(eintrag)}${normal(eintrag.html)}\n`

function standLaden(ordner) {
  try {
    const roh = JSON.parse(fs.readFileSync(path.join(ordner, STAND_DATEI), 'utf8'))
    return roh && typeof roh === 'object' && roh.dateien && typeof roh.dateien === 'object' ? roh.dateien : {}
  } catch {
    return {}
  }
}

// Über eine Zwischendatei, damit niemand eine halbe Datei liest
function sicherSchreiben(datei, inhalt) {
  const zwischen = `${datei}.${process.pid}.tmp`
  fs.writeFileSync(zwischen, inhalt, 'utf8')
  fs.renameSync(zwischen, datei)
}

// Ein Durchgang. `eintraege` sind alle Stücke aus Vendos Daten:
//   { datei, titel, html, aenderbar, grund, geaendertAm }
// `uebernehmen(eintrag, html)` schreibt eine Dateiänderung in Vendos Daten und gibt
// { ok, text } zurück. `merker` ist ein Objekt, das der Aufrufer zwischen Durchgängen
// aufhebt: damit wird eine Datei nur gelesen, wenn sich Zeit oder Größe geändert haben.
function abgleichen(eintraege, { ordner = ORDNER, uebernehmen, merker = {} } = {}) {
  const ergebnis = { geschrieben: [], uebernommen: [], abgelehnt: [], verworfen: [], geloescht: [], offen: {} }
  fs.mkdirSync(ordner, { recursive: true })
  const stand = standLaden(ordner)
  const vorher = JSON.stringify(stand)

  const schreiben = (eintrag, soll) => {
    sicherSchreiben(path.join(ordner, eintrag.datei), dateiText(eintrag))
    stand[eintrag.datei] = { summe: soll }
    delete merker[eintrag.datei]
    ergebnis.geschrieben.push(eintrag.datei)
  }

  const bekannt = new Set()
  for (const eintrag of eintraege) {
    if (!eintrag?.datei || bekannt.has(eintrag.datei)) continue
    bekannt.add(eintrag.datei)
    const voll = path.join(ordner, eintrag.datei)
    const soll = pruefsumme(eintrag.html)
    const merk = stand[eintrag.datei]

    let info = null
    try {
      info = fs.statSync(voll)
    } catch {
      // Datei fehlt (neu oder von Hand gelöscht): Vendos Stand hinschreiben
    }
    if (!info) {
      schreiben(eintrag, soll)
      continue
    }

    let text = null
    let ist = null
    const zwischengemerkt = merker[eintrag.datei]
    if (zwischengemerkt && zwischengemerkt.mtime === info.mtimeMs && zwischengemerkt.groesse === info.size) {
      ;({ text, ist } = zwischengemerkt)
    } else {
      try {
        text = fs.readFileSync(voll, 'utf8')
      } catch {
        continue // gerade gesperrt, nächster Durchgang
      }
      ist = pruefsumme(ohneKopf(text))
      merker[eintrag.datei] = { mtime: info.mtimeMs, groesse: info.size, text, ist }
    }

    // Gleicher Inhalt: höchstens der Kopfkommentar ist veraltet (Name oder Zustand geändert)
    if (ist === soll) {
      stand[eintrag.datei] = { summe: soll }
      if (normal(text) !== normal(dateiText(eintrag))) schreiben(eintrag, soll)
      continue
    }

    const dateiGeaendert = !merk || ist !== merk.summe
    const vendoGeaendert = !merk || soll !== merk.summe

    if (!dateiGeaendert) {
      schreiben(eintrag, soll)
      continue
    }

    if (merk && merk.abgelehnt === ist && !vendoGeaendert) {
      ergebnis.offen[eintrag.datei] = merk.grund || 'nicht übernommen'
      continue // schon gemeldet, seitdem nichts passiert
    }

    // Beides geändert: das Jüngere gewinnt, das andere bleibt als Kopie daneben
    if (vendoGeaendert && Number(eintrag.geaendertAm || 0) > info.mtimeMs) {
      const kopie = eintrag.datei.replace(/\.html$/, '.verworfen.html')
      sicherSchreiben(path.join(ordner, kopie), text)
      ergebnis.verworfen.push(kopie)
      schreiben(eintrag, soll)
      continue
    }

    const inhalt = ohneKopf(text)
    let r
    try {
      r = uebernehmen ? uebernehmen(eintrag, inhalt) : { ok: false, text: 'Übernehmen ist hier nicht möglich.' }
    } catch (fehler) {
      r = { ok: false, text: `Fehler beim Übernehmen: ${String(fehler?.message || fehler).slice(0, 160)}` }
    }
    if (r?.ok) {
      stand[eintrag.datei] = { summe: ist }
      ergebnis.uebernommen.push(eintrag.datei)
    } else {
      const grund = String(r?.text || 'nicht übernommen').slice(0, 300)
      // `summe` auf Vendos jetzigen Stand: erst wenn Vendo das Stück wieder ändert, wird
      // neu entschieden — sonst liefe derselbe Versuch jede Sekunde wieder
      stand[eintrag.datei] = { summe: soll, abgelehnt: ist, grund }
      ergebnis.abgelehnt.push({ datei: eintrag.datei, text: grund })
      ergebnis.offen[eintrag.datei] = grund
    }
  }

  // Stücke, die es nicht mehr gibt: nur Dateien wegräumen, die Vendo selbst geschrieben hat
  for (const datei of Object.keys(stand)) {
    if (bekannt.has(datei)) continue
    try {
      fs.unlinkSync(path.join(ordner, datei))
    } catch {
      // schon weg
    }
    delete stand[datei]
    delete merker[datei]
    ergebnis.geloescht.push(datei)
  }

  if (JSON.stringify(stand) !== vorher) sicherSchreiben(path.join(ordner, STAND_DATEI), JSON.stringify({ dateien: stand }))
  return ergebnis
}

module.exports = {
  ORDNER,
  STAND_DATEI,
  dateiName,
  dateiText,
  kopfZeile,
  ohneKopf,
  pruefsumme,
  abgleichen
}
