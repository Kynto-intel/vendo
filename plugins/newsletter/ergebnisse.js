'use strict'
// Newsletter-Plugin: was jede Mail gebracht hat (Phase 5, Schritt 1).
//
// Vendo hängt an jeden Shop-Link utm_source=vendo und utm_campaign=<Kurzname> (html-mail.js).
// Shopify merkt sich zu jeder Bestellung den Besuch, über den sie kam. Hier wird beides
// zusammengeführt:
//   - `namen` hält fest, welcher Kurzname zu welcher Mail gehört — einer Kampagne oder einem
//     Automationsschritt. Ein Kurzname bleibt bei seiner Mail, auch wenn sie später
//     umbenannt wird; die Umbenennung bekommt einen neuen Eintrag, der alte bleibt gültig.
//   - `bestellungen` sind die Bestellungen, die über eine Vendo-Mail kamen, ohne jedes
//     Kundenfeld: ID, Kurzname, Betrag, Währung, Zeitpunkt.
//   - Die Zahlen je Mail werden beim Lesen gerechnet, nicht gespeichert. So kann keine
//     Summe von ihren Bestellungen abweichen.
//
// Zugeordnet wird über den letzten Besuch vor der Bestellung, sonst den ersten — so zählt
// eine Bestellung für die Mail, über die jemand zuletzt kam. Wer im Shop Cookies ablehnt,
// hat oft keine Zuordnung; die Zahlen sind deshalb eher zu niedrig als zu hoch.
//
// Alle Funktionen sind rein: übergebene Listen werden nicht verändert.

const { utmName } = require('./html-mail.js')

const QUELLE = 'vendo'
const TAG = 86400000
const BEHALTEN = 730 * TAG // Bestellungen zwei Jahre lang behalten, dann fallen sie heraus
const ABMELDE_FENSTER = 48 * 3600000

const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((x) => x && typeof x === 'object') : [])
const alsObjekt = (wert) => (wert && typeof wert === 'object' && !Array.isArray(wert) ? wert : {})
const zeitVon = (wert) => {
  if (wert == null || wert === '') return NaN
  const zahl = Number(wert)
  return Number.isFinite(zahl) ? zahl : Date.parse(wert)
}
const gerundet = (betrag) => Math.round(betrag * 100) / 100

// Der Schlüssel einer Mail in den Ergebnissen: „kampagne:<id>“ oder „automation:<id>:<schritt>“
function zielSchluessel(ziel = {}) {
  if (ziel.art === 'kampagne' && ziel.id) return `kampagne:${ziel.id}`
  if (ziel.art === 'automation' && ziel.id && Number.isInteger(ziel.schritt)) return `automation:${ziel.id}:${ziel.schritt}`
  return null
}

const gleichesZiel = (a, b) => zielSchluessel(a) !== null && zielSchluessel(a) === zielSchluessel(b)

// Einen Kurznamen für eine Mail vergeben, der noch keiner anderen gehört. Heißt eine neue
// Kampagne wie eine alte („Herbst“), bekommt sie „herbst-2“ — sonst landeten ihre
// Bestellungen bei der alten.
function kurznameVergeben(namen, wunsch, ziel) {
  const vorhanden = alsObjekt(namen)
  const basis = utmName(wunsch) || 'mail'
  for (let n = 1; n < 1000; n++) {
    const kurz = n === 1 ? basis : `${basis.slice(0, 56)}-${n}`
    const eintrag = vorhanden[kurz]
    if (!eintrag || gleichesZiel(eintrag, ziel)) return kurz
  }
  return `${basis.slice(0, 48)}-${Date.now().toString(36)}`
}

// Der Kurzname, den diese Mail schon hat — bei mehreren der zuletzt vergebene. Null, wenn sie
// noch keinen hat. So bleibt ein Automationsschritt bei seinem Kurznamen, auch wenn die
// Automation später umbenannt wird, wie eine Kampagne bei ihrem `utm`.
function kurznameFinden(namen, ziel) {
  const schluessel = zielSchluessel(ziel)
  if (!schluessel) return null
  let bester = null
  for (const [kurz, eintrag] of Object.entries(alsObjekt(namen))) {
    if (!eintrag || zielSchluessel(eintrag) !== schluessel) continue
    if (!bester || (Number(eintrag.seit) || 0) > (Number(bester.eintrag.seit) || 0)) bester = { kurz, eintrag }
  }
  return bester ? bester.kurz : null
}

// Festhalten, dass ein Kurzname zu einer Mail gehört. Der erste Eintrag gilt: ein Kurzname
// wechselt nie die Mail, sonst wanderten schon gezählte Bestellungen mit.
function nameMerken(namen, kurz, ziel, { jetzt = Date.now() } = {}) {
  const vorhanden = alsObjekt(namen)
  const name = utmName(kurz)
  if (!name || !zielSchluessel(ziel) || vorhanden[name]) return { namen: vorhanden, neu: false }
  const eintrag = { art: ziel.art, id: ziel.id, ...(ziel.art === 'automation' ? { schritt: ziel.schritt } : {}), seit: jetzt }
  return { namen: { ...vorhanden, [name]: eintrag }, neu: true }
}

// Über welche Vendo-Mail kam diese Bestellung? Der letzte Besuch zählt vor dem ersten.
function kurzVon(bestellung = {}) {
  for (const besuch of [bestellung.letzter, bestellung.erster]) {
    if (besuch && String(besuch.source || '').toLowerCase() === QUELLE && besuch.campaign) return utmName(besuch.campaign) || null
  }
  return null
}

// Frisch geholte Bestellungen (shopify.ergebnisBestellungenHolen) in die gespeicherten
// übernehmen. Doppelte zählen einmal; was Shopify noch auswertet (`bereit` falsch), kommt
// beim nächsten Abruf; Stornierte fallen heraus, auch wenn sie schon gezählt waren.
function bestellungenAufnehmen(gespeichert, neue, { jetzt = Date.now(), behalten = BEHALTEN } = {}) {
  const nachId = new Map(alsListe(gespeichert).map((b) => [b.id, b]))
  let aufgenommen = 0
  let entfernt = 0
  for (const b of alsListe(neue)) {
    if (!b.id) continue
    if (b.storniert) {
      if (nachId.delete(b.id)) entfernt++
      continue
    }
    if (b.bereit === false) continue
    const kurz = kurzVon(b)
    if (!kurz || nachId.has(b.id)) continue
    const am = zeitVon(b.am)
    if (!Number.isFinite(am)) continue
    nachId.set(b.id, { id: b.id, kurz, betrag: gerundet(Number(b.betrag) || 0), waehrung: String(b.waehrung || ''), am })
    aufgenommen++
  }
  const grenze = jetzt - behalten
  const liste = [...nachId.values()].filter((b) => b.am >= grenze).sort((a, b) => a.am - b.am)
  return { liste, aufgenommen, entfernt }
}

function summieren(liste) {
  const waehrungen = new Set(liste.map((b) => b.waehrung).filter(Boolean))
  return {
    bestellungen: liste.length,
    umsatz: gerundet(liste.reduce((s, b) => s + (Number(b.betrag) || 0), 0)),
    waehrung: waehrungen.size > 1 ? 'gemischt' : [...waehrungen][0] || '',
    erste: liste.length ? Math.min(...liste.map((b) => b.am)) : null,
    letzte: liste.length ? Math.max(...liste.map((b) => b.am)) : null
  }
}

// Zahlen je Kurzname
function jeKurzname(bestellungen) {
  const gruppen = {}
  for (const b of alsListe(bestellungen)) (gruppen[b.kurz] ||= []).push(b)
  return Object.fromEntries(Object.entries(gruppen).map(([kurz, liste]) => [kurz, summieren(liste)]))
}

// Zahlen je Mail (Kampagne oder Automationsschritt). Kurznamen, die keiner Mail gehören —
// etwa aus einer Testmail an eine Kampagne, die es nicht mehr gibt —, landen unter `ohneMail`.
function jeZiel(bestellungen, namen) {
  const zuordnung = alsObjekt(namen)
  const gruppen = {}
  const ohne = []
  for (const b of alsListe(bestellungen)) {
    const schluessel = zielSchluessel(zuordnung[b.kurz])
    if (schluessel) (gruppen[schluessel] ||= []).push(b)
    else ohne.push(b)
  }
  return {
    ziele: Object.fromEntries(Object.entries(gruppen).map(([s, liste]) => [s, summieren(liste)])),
    ohneMail: summieren(ohne)
  }
}

// Abmeldungen in den 48 Stunden nach einem Kampagnenversand, nur gezählt. Eine Abmeldung
// zählt für die Kampagne, die zuletzt vor ihr gestartet ist — laufen zwei kurz
// hintereinander, bekommt nicht beide dieselbe Abmeldung.
function abmeldungenNachVersand(kampagnenListe, kontakteListe, { fenster = ABMELDE_FENSTER } = {}) {
  const gesendet = alsListe(kampagnenListe)
    .map((k) => ({ id: k.id, start: zeitVon(k.gestartetAm), ende: zeitVon(k.fertigAm) }))
    .filter((k) => k.id && Number.isFinite(k.start))
    .sort((a, b) => b.start - a.start)
  const zahlen = Object.fromEntries(gesendet.map((k) => [k.id, 0]))
  for (const kontakt of alsListe(kontakteListe)) {
    // Eine tote Adresse ist keine Abmeldung (Rückläufer, siehe ruecklaeufer.js)
    if (!kontakt.gesperrt || kontakt.sperrArt === 'ruecklaeufer') continue
    const am = zeitVon(kontakt.gesperrtAm)
    if (!Number.isFinite(am)) continue
    const kampagne = gesendet.find((k) => k.start <= am)
    if (!kampagne) continue
    const bis = (Number.isFinite(kampagne.ende) ? Math.max(kampagne.ende, kampagne.start) : kampagne.start) + fenster
    if (am <= bis) zahlen[kampagne.id]++
  }
  return zahlen
}

// Ab wann Shopify gefragt wird. Erster Abruf: ab dem ersten gemerkten Kurznamen (vorher kann
// keine Bestellung über eine Vendo-Mail gekommen sein). Danach drei Tage überlappend, damit
// Bestellungen, die Shopify beim letzten Mal noch auswertete, nicht verloren gehen.
function abrufSeit({ namen, geholtAm } = {}, { jetzt = Date.now(), ueberlappung = 3 * TAG } = {}) {
  const seitNamen = Object.values(alsObjekt(namen))
    .map((e) => Number(e?.seit))
    .filter(Number.isFinite)
  if (!seitNamen.length) return null // noch keine Mail mit Kurzname verschickt: nichts zu holen
  const frueheste = Math.min(...seitNamen)
  const letzter = Number(geholtAm)
  if (!Number.isFinite(letzter) || letzter <= 0) return frueheste
  return Math.max(frueheste, Math.min(letzter, jetzt) - ueberlappung)
}

// Wie viele Mails je Kampagne wirklich rausgingen, aus dem Versandprotokoll. Testmails und
// Freigabe-Proben zählen nicht, Fehlversuche auch nicht.
function gesendetJeKampagne(protokoll) {
  const zahlen = {}
  for (const e of alsListe(protokoll)) {
    if (!e.ok || e.art !== 'kampagne' || !e.kampagneId) continue
    zahlen[e.kampagneId] = (zahlen[e.kampagneId] || 0) + 1
  }
  return zahlen
}

// Die Ergebnisliste im Reiter „Kampagnen“: eine Zeile je verschickter Kampagne, die neueste
// oben. „Umsatz je 100 Empfänger“ macht Mails an verschieden große Listen vergleichbar;
// ohne Empfänger bleibt er leer statt 0.
function kampagnenZeilen({ kampagnen: liste = [], ziele = {}, abmeldungen = {}, gesendet = {} } = {}) {
  return alsListe(liste)
    .filter((k) => k.id && Number.isFinite(zeitVon(k.gestartetAm)))
    .sort((a, b) => zeitVon(b.gestartetAm) - zeitVon(a.gestartetAm))
    .map((k) => {
      const z = alsObjekt(ziele)[`kampagne:${k.id}`] || {}
      const empfaenger = Number(alsObjekt(gesendet)[k.id]) || 0
      const umsatz = Number(z.umsatz) || 0
      return {
        id: k.id,
        name: String(k.name || ''),
        betreff: String(k.betreff || ''),
        zustand: k.zustand || '',
        gestartetAm: zeitVon(k.gestartetAm),
        empfaenger,
        bestellungen: Number(z.bestellungen) || 0,
        umsatz,
        waehrung: z.waehrung || '',
        jeHundert: empfaenger ? gerundet((umsatz / empfaenger) * 100) : null,
        abmeldungen: Number(alsObjekt(abmeldungen)[k.id]) || 0
      }
    })
}

// ── Automationen (Schritt 3) ──

// Der Schlüssel einer Automationsmail in Warteschlange und Protokoll:
// „auto:<automationId>:<laufId>:<schritt>“ (seit 2026-11-13) oder früher „auto:<laufId>:<schritt>“.
// Beim alten Format hilft nur der Lauf weiter, solange er noch nicht aufgeräumt ist.
// `schritt` ist im Schlüssel 0-basiert, zurück kommt er 1-basiert wie in der Oberfläche.
function autoSchluesselLesen(kampagneId, laufZuAutomation = {}) {
  const teile = String(kampagneId || '').split(':')
  if (teile[0] !== 'auto') return null
  let automationId = null
  let schritt = NaN
  if (teile.length === 4) {
    automationId = teile[1]
    schritt = Number(teile[3])
  } else if (teile.length === 3) {
    automationId = alsObjekt(laufZuAutomation)[teile[1]] || null
    schritt = Number(teile[2])
  }
  if (!automationId || !Number.isInteger(schritt) || schritt < 0) return null
  return { automationId, schritt: schritt + 1 }
}

// Wie viele Mails je Automationsschritt wirklich rausgingen, aus dem Versandprotokoll
function gesendetJeAutomationsschritt(protokoll, laeufe = []) {
  const laufZuAutomation = Object.fromEntries(alsListe(laeufe).map((l) => [l.id, l.automationId]))
  const zahlen = {}
  for (const e of alsListe(protokoll)) {
    if (!e.ok || e.art !== 'kampagne') continue
    const s = autoSchluesselLesen(e.kampagneId, laufZuAutomation)
    if (!s) continue
    const schluessel = `automation:${s.automationId}:${s.schritt}`
    zahlen[schluessel] = (zahlen[schluessel] || 0) + 1
  }
  return zahlen
}

// Wie die Serien einer Automation endeten. Läufe werden 30 Tage nach ihrem Ende aufgeräumt;
// die Zahlen gelten also für ungefähr die letzten 30 Tage.
function endeArt(lauf) {
  if (lauf.zustand === 'laeuft') return 'laufen'
  if (lauf.zustand === 'fertig') return 'durchgelaufen'
  const grund = String(lauf.abbruchGrund || '').toLowerCase()
  if (grund.startsWith('bestellung')) return 'kauf'
  if (grund.includes('abgemeldet')) return 'abmeldung'
  if (grund.startsWith('zu spät') || grund.startsWith('zu spaet')) return 'zuSpaet'
  return 'sonstige'
}

function serienEnden(laeufe) {
  const leer = () => ({ laufen: 0, kauf: 0, abmeldung: 0, zuSpaet: 0, durchgelaufen: 0, sonstige: 0 })
  const je = {}
  for (const l of alsListe(laeufe)) {
    if (!l.automationId) continue
    ;(je[l.automationId] ||= leer())[endeArt(l)]++
  }
  return je
}

// Die Ergebnisse im Reiter „Automationen“: je Automation die Schritte mit gesendet,
// Bestellungen, Umsatz und Umsatz je 100 Empfänger, dazu wie die Serien endeten.
function automationenZeilen({ automationen: liste = [], ziele = {}, gesendet = {}, enden = {} } = {}) {
  return alsListe(liste)
    .filter((a) => a.id)
    .map((a) => ({
      id: a.id,
      name: String(a.name || ''),
      aktiv: Boolean(a.aktiv),
      enden: alsObjekt(enden)[a.id] || { laufen: 0, kauf: 0, abmeldung: 0, zuSpaet: 0, durchgelaufen: 0, sonstige: 0 },
      schritte: alsListe(a.schritte).map((s, i) => {
        const schluessel = `automation:${a.id}:${i + 1}`
        const z = alsObjekt(ziele)[schluessel] || {}
        const n = Number(alsObjekt(gesendet)[schluessel]) || 0
        const umsatz = Number(z.umsatz) || 0
        return {
          schritt: i + 1,
          betreff: String(s.betreff || ''),
          gesendet: n,
          bestellungen: Number(z.bestellungen) || 0,
          umsatz,
          waehrung: z.waehrung || '',
          jeHundert: n ? gerundet((umsatz / n) * 100) : null
        }
      })
    }))
}

module.exports = {
  autoSchluesselLesen,
  gesendetJeAutomationsschritt,
  serienEnden,
  automationenZeilen,
  gesendetJeKampagne,
  kampagnenZeilen,
  QUELLE,
  ABMELDE_FENSTER,
  BEHALTEN,
  zielSchluessel,
  kurznameVergeben,
  kurznameFinden,
  nameMerken,
  kurzVon,
  bestellungenAufnehmen,
  jeKurzname,
  jeZiel,
  abmeldungenNachVersand,
  abrufSeit
}
