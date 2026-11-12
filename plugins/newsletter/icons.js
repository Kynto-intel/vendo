'use strict'
// Newsletter-Plugin: die Social-Media-Icons für den Fuß.
//
// Die Bilder liegen als PNG im Ordner „social media icons“ neben dieser Datei. Vendo
// verkleinert sie auf Mailgröße und schickt sie mit der Mail mit — eingetragen wird in der
// Oberfläche nur die Adresse des Profils.
//
// Warum mitgeschickt (`cid:`) und nicht als Adresse im Netz: dann braucht es keinen Platz
// im Web, auf dem die Icons liegen und erreichbar bleiben müssen. `data:`-Adressen gehen
// nicht, die wirft Gmail weg; SVG zeigt kein Mailprogramm. Im Fenster von Vendo kennt der
// Browser kein `cid:` — dort wird für die Vorschau auf `data:` zurückgetauscht
// (`alsDatenAdressen`).
//
// Warum verkleinert: die Vorlagen sind rund 2500 px groß und zusammen fast 400 kB. In der
// Mail hängen sie mit 56 px und wenigen hundert Byte dran.
//
// Warum eingefärbt: die Vorlagen sind weiße Silhouetten auf durchsichtigem Grund. Weiß ist
// auf einem dunklen Fuß richtig und auf einem hellen unsichtbar, deshalb bekommt eine
// einfarbige Vorlage die Schriftfarbe des Fußes. Ein mehrfarbiges Bild bleibt, wie es ist.
//
// Die Marken gehören ihren Inhabern. Die Bilder stehen hier nur als Link zu den eigenen
// Profilen im Fuß.

const fs = require('fs')
const path = require('path')
const { NETZWERKE, ICON_BREITE, ICON_CID_VORSATZ } = require('./bausteine.js')

const ORDNER = path.join(__dirname, 'social media icons')

// Anzeigegröße im Fuß und die Größe, in der das Bild mitgeht. Doppelt, damit es auf
// Bildschirmen mit hoher Auflösung nicht ausfranst.
const ICON_ANZEIGE = ICON_BREITE
const ICON_PIXEL = ICON_ANZEIGE * 2
const CID_VORSATZ = ICON_CID_VORSATZ

const cidVon = (id) => `${CID_VORSATZ}${id}`

// Dateinamen auf Kennungen bringen: klein, nur Buchstaben, und gleiche Buchstaben
// hintereinander zu einem zusammengezogen. Damit findet „Faceboook.png“ das Netzwerk
// `facebook`, ohne dass jemand die Datei umbenennen muss.
const zusammenziehen = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1')

// Welche Datei zu welchem Netzwerk gehört
function dateienSuchen() {
  const gefunden = {}
  let liste = []
  try {
    liste = fs.readdirSync(ORDNER)
  } catch {
    return gefunden // kein Ordner: dann gibt es eben keine Icons
  }
  for (const n of NETZWERKE) {
    const gesucht = zusammenziehen(n.id)
    const datei = liste.find((d) => /\.png$/i.test(d) && zusammenziehen(path.basename(d, path.extname(d))) === gesucht)
    if (datei) gefunden[n.id] = path.join(ORDNER, datei)
  }
  return gefunden
}

const DATEIEN = dateienSuchen()

// Für welche Netzwerke es ein Bild gibt. Ein Netzwerk ohne Bild bekommt im Fuß keinen
// Icon-Platz (siehe `fehlende` und die Prüfung in bausteine.js über die Tests).
const MIT_BILD = NETZWERKE.map((n) => n.id).filter((id) => DATEIEN[id])

// ── Laden ──

let canvasModul = null
function canvasHolen() {
  if (canvasModul !== null) return canvasModul
  try {
    canvasModul = require('@napi-rs/canvas')
  } catch {
    canvasModul = false // einmal merken, nicht bei jedem Icon neu versuchen
  }
  return canvasModul
}

// Je Netzwerk die fertig verkleinerte Fläche, dazu ob sie einfarbig ist.
// `null` heißt: versucht und nicht geschafft.
const VORLAGEN = new Map()
let laden = null

// Sind alle deckenden Pixel dieselbe Farbe? Dann darf eingefärbt werden.
function istEinfarbig(k, groesse) {
  const d = k.getImageData(0, 0, groesse, groesse).data
  let min = [255, 255, 255]
  let max = [0, 0, 0]
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue // halbdurchsichtige Ränder zählen nicht mit
    for (let f = 0; f < 3; f++) {
      if (d[i + f] < min[f]) min[f] = d[i + f]
      if (d[i + f] > max[f]) max[f] = d[i + f]
    }
  }
  return max.every((wert, f) => wert - min[f] <= 24)
}

// Ein Bild laden und mittig in ein Quadrat legen, ohne es zu verzerren: die Icons haben
// unterschiedliche Seitenverhältnisse (das f ist hoch und schmal, Instagram quadratisch),
// im Fuß sollen sie trotzdem gleich hoch nebeneinander stehen.
async function vorlageLaden(id, groesse) {
  const canvas = canvasHolen()
  if (!canvas || !DATEIEN[id]) return null
  try {
    const bild = await canvas.loadImage(fs.readFileSync(DATEIEN[id]))
    const flaeche = canvas.createCanvas(groesse, groesse)
    const k = flaeche.getContext('2d')
    const faktor = Math.min(groesse / bild.width, groesse / bild.height)
    const breite = bild.width * faktor
    const hoehe = bild.height * faktor
    k.drawImage(bild, (groesse - breite) / 2, (groesse - hoehe) / 2, breite, hoehe)
    return { flaeche, einfarbig: istEinfarbig(k, groesse) }
  } catch {
    return null
  }
}

// Die Bilder einmal einlesen. Läuft beim Start des Plugins los; wer es eilig hat, wartet
// darauf (`einzelSenden` tut das). Ein zweiter Aufruf wartet auf denselben Durchlauf.
function vorbereiten(groesse = ICON_PIXEL) {
  if (laden) return laden
  laden = (async () => {
    for (const id of MIT_BILD) VORLAGEN.set(id, await vorlageLaden(id, groesse))
    return MIT_BILD.filter((id) => VORLAGEN.get(id))
  })()
  return laden
}

// ── Icons ausgeben ──

const FERTIG = new Map() // "id|farbe" → Buffer

// Ein Icon als PNG in der gewünschten Farbe. Gibt null zurück, solange die Vorlagen noch
// nicht gelesen sind oder es für das Netzwerk kein Bild gibt — dann bleibt der Platz leer,
// statt ein kaputtes Bild zu zeigen.
function iconPng(id, { farbe = '#ffffff' } = {}) {
  const vorlage = VORLAGEN.get(id)
  if (!vorlage) return null
  const schluessel = `${id}|${farbe}`
  if (FERTIG.has(schluessel)) return FERTIG.get(schluessel)

  const canvas = canvasHolen()
  if (!canvas) return null
  try {
    const groesse = vorlage.flaeche.width
    const flaeche = canvas.createCanvas(groesse, groesse)
    const k = flaeche.getContext('2d')
    k.drawImage(vorlage.flaeche, 0, 0)
    if (vorlage.einfarbig) {
      // Die Form bleibt, die Farbe wird ersetzt: `source-in` malt nur dort, wo das Bild
      // deckt. So folgt das Icon der Schrift im Fuß, hell wie dunkel.
      k.globalCompositeOperation = 'source-in'
      k.fillStyle = farbe
      k.fillRect(0, 0, groesse, groesse)
      k.globalCompositeOperation = 'source-over'
    }
    const puffer = flaeche.toBuffer('image/png')
    FERTIG.set(schluessel, puffer)
    return puffer
  } catch {
    return null
  }
}

// ── Mail und Vorschau ──

// Welche mitgeschickten Icons ein HTML anfordert, in der Reihenfolge des Vorkommens
function iconsImHtml(html) {
  const text = String(html ?? '')
  return NETZWERKE.map((n) => n.id).filter((id) => text.includes(`cid:${cidVon(id)}`))
}

// Die Anhänge für eine Mail: ein eingebettetes Bild je angefordertem Icon. Form wie
// nodemailer sie erwartet; `contentDisposition: 'inline'` hält sie aus der Anhangsliste
// des Postfachs heraus.
function anhaengeFuer(html, { farbe = '#ffffff' } = {}) {
  const anhaenge = []
  for (const id of iconsImHtml(html)) {
    const inhalt = iconPng(id, { farbe })
    if (!inhalt) continue
    anhaenge.push({ filename: `${id}.png`, content: inhalt, cid: cidVon(id), contentType: 'image/png', contentDisposition: 'inline' })
  }
  return anhaenge
}

// Für die Vorschau im Fenster: `cid:` kennt der Browser nicht, `data:` schon. Umgekehrt
// als beim Versand — deshalb steht beides hier beieinander und läuft nie auseinander.
function alsDatenAdressen(html, { farbe = '#ffffff' } = {}) {
  let text = String(html ?? '')
  for (const id of iconsImHtml(text)) {
    const inhalt = iconPng(id, { farbe })
    const ersatz = inhalt ? `data:image/png;base64,${inhalt.toString('base64')}` : ''
    text = text.split(`cid:${cidVon(id)}`).join(ersatz)
  }
  return text
}

module.exports = {
  vorbereiten,
  iconPng,
  iconsImHtml,
  anhaengeFuer,
  alsDatenAdressen,
  cidVon,
  zusammenziehen,
  DATEIEN,
  MIT_BILD,
  ORDNER,
  ICON_ANZEIGE,
  ICON_PIXEL,
  CID_VORSATZ
}
