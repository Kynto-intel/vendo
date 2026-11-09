'use strict'
// Newsletter-Plugin: Versandprotokoll.
//
// Eine Zeile je Mail als NDJSON, eine Datei je Monat. Nicht in die Plugin-JSON: die lehnt
// Vendo ab 5 MB ab. Der Ordner liegt in daten/, ist also in der Sicherung und nicht in Git.
// Im Protokoll stehen Adressen nur gekürzt und nie der Mailtext.

const fs = require('node:fs')
const path = require('node:path')

const { kuerzen } = require('./zugang.js')

const ORDNER = path.join(__dirname, '..', '..', 'daten', 'plugins', 'newsletter')

function protokollDatei(ordner = ORDNER, zeit = new Date()) {
  const monat = `${zeit.getFullYear()}-${String(zeit.getMonth() + 1).padStart(2, '0')}`
  return path.join(ordner, `protokoll-${monat}.ndjson`)
}

function protokollZeile({ an, betreff, art = 'kampagne', kampagneId = null, ok, fehler = null, zeit = new Date() }) {
  return {
    zeit: zeit.toISOString(),
    an: kuerzen(an),
    betreff: String(betreff || '').slice(0, 200),
    art,
    kampagneId,
    ok: Boolean(ok),
    fehler: fehler ? String(fehler).slice(0, 200) : null
  }
}

function protokollSchreiben(eintrag, ordner = ORDNER) {
  const zeile = protokollZeile(eintrag)
  try {
    fs.mkdirSync(ordner, { recursive: true })
    fs.appendFileSync(protokollDatei(ordner, new Date(zeile.zeit)), `${JSON.stringify(zeile)}\n`, 'utf8')
    return zeile
  } catch {
    return null // ein Protokoll, das nicht schreibbar ist, darf den Versand nicht aufhalten
  }
}

function protokollLesen({ anzahl = 50, ordner = ORDNER } = {}) {
  let dateien = []
  try {
    dateien = fs
      .readdirSync(ordner)
      .filter((name) => /^protokoll-\d{4}-\d{2}\.ndjson$/.test(name))
      .sort()
      .reverse()
  } catch {
    return []
  }
  const eintraege = []
  for (const name of dateien) {
    let zeilen = []
    try {
      zeilen = fs.readFileSync(path.join(ordner, name), 'utf8').split('\n').filter(Boolean)
    } catch {
      continue
    }
    for (const zeile of zeilen.reverse()) {
      try {
        eintraege.push(JSON.parse(zeile))
      } catch {
        // kaputte Zeile überspringen
      }
      if (eintraege.length >= anzahl) return eintraege
    }
  }
  return eintraege
}

module.exports = { protokollDatei, protokollZeile, protokollSchreiben, protokollLesen, ORDNER }
