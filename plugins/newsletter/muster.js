'use strict'
// Newsletter-Plugin: fertige Vorlagen im Stil der Marke.
//
// Die Vorlagen liegen als gewöhnliches HTML in `vorlagen/`, eine Datei je Muster. Felix
// kann sie dort von Hand ändern, ohne Code anzufassen; dieses Modul liest sie nur ein und
// setzt die Platzhalter. Eine neue Datei im Ordner ist ein neues Muster, ohne Codeänderung.
//
// Warum es die Muster überhaupt gibt: Vor einem leeren Feld baut auch eine gute KI nur ein
// Gerüst und füllt es mit denselben drei Produkten. Mit einer fertigen Vorlage bleibt ihr
// das, was sie kann — Texte schreiben und echte Produkte einsetzen.
//
// Die Dateien halten sich an Vendos eigene Regeln, und die Tests halten sie darauf fest:
// kein Logo, kein Fuß, keine eigene 600-px-Hülle, kein Bild ohne Adresse, kein Knopf ohne
// Ziel, kein Streichpreis ohne echten Vergleichspreis, kein Bild und kein Produkt doppelt.

const fs = require('fs')
const path = require('path')
const { STANDARD_FARBEN, SCHRIFT } = require('./bausteine.js')

const ORDNER = path.join(__dirname, 'vorlagen')

// Donnerwolfs Farbwelt als Rückfall, wenn unter „Marke" nichts eingetragen ist: Anthrazit
// und Gold sind immer dabei, Beige ist der helle Kontrast. Vendos helle Grundeinstellung
// wäre hier falsch — das Design-System der Marke sagt dunkel und keine bunten Farben.
const DUNKEL = {
  hintergrund: '#111111',
  flaeche: '#1A1A1A',
  text: '#D9CBB4',
  leise: '#9A8F7C',
  akzent: '#C29A40',
  aufAkzent: '#1A1A1A',
  linie: '#333333'
}

const SHOP = 'https://donnerwolf.de'

// Beispielprodukte. Sie stehen in der Vorlage, damit sie in Vendos Übersicht wie eine
// echte Mail aussieht und Vendos Prüfungen durchläuft. Die Bildadressen zeigen bewusst auf
// nichts Echtes: eine fertig aussehende Vorlage bliebe sonst so stehen.
const BEISPIEL = [
  { name: 'Sturmfest Thorshammer Hoodie', preis: '59,99 €', pfad: 'sturmfest-fluffy-boxcut-hoodie' },
  { name: 'Sturmfest Thorshammer T-Shirt', preis: '24,95 €', pfad: 'sturmfest-premium-shirt' },
  { name: 'Sturmfest Thorshammer Sweatshirt', preis: '49,95 €', pfad: 'sturmfest-basic-sweatshirt' },
  { name: 'Nicht grau, Eisen Hoodie', preis: '59,99 €', pfad: 'ich-bin-nicht-grau-fluffy-boxcut-hoodie' }
]

// Kopfzeilen der Datei: <!-- name: … -->
function kopfLesen(text, feld) {
  const treffer = String(text).match(new RegExp(`<!--\\s*${feld}:\\s*([^>]*?)\\s*-->`, 'i'))
  return treffer ? treffer[1].trim() : ''
}

// Alle Kommentare entfernen: die Kopfzeilen und die Anleitung gehören nicht in die Mail.
const kommentareWeg = (text) => String(text).replace(/<!--[\s\S]*?-->/g, '').trim()

function dateienLesen() {
  let namen = []
  try {
    namen = fs.readdirSync(ORDNER).filter((n) => n.toLowerCase().endsWith('.html')).sort()
  } catch {
    return [] // kein Ordner: dann gibt es eben keine Muster
  }
  const gefunden = []
  for (const datei of namen) {
    let roh
    try {
      roh = fs.readFileSync(path.join(ORDNER, datei), 'utf8')
    } catch {
      continue
    }
    const id = path.basename(datei, '.html')
    const name = kopfLesen(roh, 'name') || id
    const art = kopfLesen(roh, 'art') || 'kampagne'
    const beschreibung = kopfLesen(roh, 'beschreibung')
    gefunden.push({ id, name, art, beschreibung, roh, datei })
  }
  // Reihenfolge wie gewünscht: erst die Newsletter, dann Warenkorb, dann Willkommen
  const rang = { kampagne: 0, warenkorb: 1, willkommen: 2 }
  return gefunden.sort((a, b) => (rang[a.art] ?? 9) - (rang[b.art] ?? 9) || a.name.localeCompare(b.name, 'de'))
}

// Einmal beim Start lesen. Wer eine Datei ändert, startet Vendo neu — so wie bei jeder
// anderen Plugin-Datei auch.
const GELESEN = dateienLesen()

const hexOk = (wert) => (/^#[0-9a-f]{3,8}$/i.test(String(wert || '').trim()) ? String(wert).trim() : '')

function farbenAus(marke = {}) {
  const eigene = {}
  for (const [name, wert] of Object.entries(marke?.farben || {})) {
    if (hexOk(wert)) eigene[name] = wert
  }
  return { ...STANDARD_FARBEN, ...DUNKEL, ...eigene }
}

// Die Platzhalter einer Datei füllen. Absichtlich %TOKEN% und nicht {{token}}: Vendo prüft
// {{…}} gegen seine eigene Platzhalterliste und würde unbekannte sperren.
function ersetzen(roh, { marke = {}, shop = SHOP } = {}) {
  const f = farbenAus(marke)
  const werte = {
    SCHRIFT,
    SHOP: shop.replace(/\/$/, ''),
    HINTERGRUND: f.hintergrund,
    FLAECHE: f.flaeche,
    TEXT: f.text,
    LEISE: f.leise,
    AKZENT: f.akzent,
    AUFAKZENT: f.aufAkzent,
    LINIE: f.linie
  }
  BEISPIEL.forEach((p, i) => {
    const n = i + 1
    werte[`NAME${n}`] = p.name
    werte[`PREIS${n}`] = p.preis
    werte[`URL${n}`] = `${werte.SHOP}/products/${p.pfad}`
    werte[`BILD${n}`] = `${werte.SHOP}/cdn/shop/files/donnerwolf-beispiel-${n}.png`
  })
  return String(roh).replace(/%([A-Z0-9]+)%/g, (ganz, name) => (name in werte ? werte[name] : ganz))
}

// Ein Muster als fertiges HTML. Unbekannte Kennung gibt null, damit der Aufrufer es merkt.
function musterHtml(id, angaben = {}) {
  const muster = GELESEN.find((x) => x.id === id)
  if (!muster) return null
  return ersetzen(kommentareWeg(muster.roh), angaben)
}

// Die Liste für die Oberfläche und für den Bot — ohne das rohe HTML.
const musterListe = () => GELESEN.map(({ id, name, art, beschreibung }) => ({ id, name, art, beschreibung }))

module.exports = { musterListe, musterHtml, ersetzen, farbenAus, kopfLesen, kommentareWeg, ORDNER, DUNKEL, BEISPIEL, SHOP }
