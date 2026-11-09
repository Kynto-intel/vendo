'use strict'
// Newsletter-Plugin: Kontakte.
//
// Die Liste der Empfänger, zusammengeführt aus Shopify und CSV-Importen. Zwei Regeln, die
// hier nie weich werden:
//   - Ein Sync darf eine Sperre nicht aufheben. Wer sich abgemeldet hat, bleibt abgemeldet,
//     auch wenn Shopify ihn weiter als Abonnent führt.
//   - Ohne Zustimmungsdatum ist niemand Empfänger. Das ist der Nachweis, wenn jemand fragt.
//
// Abmelden sperrt (die Adresse bleibt bekannt, damit ein Import sie nicht wieder einsammelt).
// Löschen entfernt sie vollständig — das ist für eine Auskunfts- oder Löschanfrage gedacht.

const { EMAIL_FORM } = require('./zugang.js')

const sauber = (wert) => String(wert ?? '').trim()
const adresse = (wert) => sauber(wert).toLowerCase()

function gueltig(email) {
  const wert = adresse(email)
  return Boolean(wert) && EMAIL_FORM.test(wert)
}

const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((k) => k && gueltig(k.email)) : [])

// Zustände, die Shopify für die E-Mail-Adresse melden kann. Empfänger ist nur SUBSCRIBED:
// PENDING heißt, die Bestätigung aus dem Double-Opt-In fehlt noch — an diese Adressen darf
// nichts raus, auch wenn Shopify sie im Abonnenten-Filter mitliefert.
const ZUSTAND_OK = 'SUBSCRIBED'
const ZUSTAND_OFFEN = 'PENDING'

// Kein Zustand hinterlegt (CSV-Import oder ältere API-Version) → es entscheidet das
// Zustimmungsdatum, wie bisher.
const zustandErlaubt = (kontakt) => !kontakt.zustand || String(kontakt.zustand).toUpperCase() === ZUSTAND_OK

// Wer darf eine Kampagne bekommen: Zustimmung vorhanden, Zustand in Ordnung, nicht gesperrt.
function empfaenger(liste) {
  return alsListe(liste).filter((k) => !k.gesperrt && k.zustimmungAm && zustandErlaubt(k))
}

function stand(liste) {
  const alle = alsListe(liste)
  return {
    gesamt: alle.length,
    empfaenger: empfaenger(alle).length,
    gesperrt: alle.filter((k) => k.gesperrt).length,
    ohneZustimmung: alle.filter((k) => !k.gesperrt && !k.zustimmungAm).length,
    offeneBestaetigung: alle.filter((k) => !k.gesperrt && String(k.zustand || '').toUpperCase() === ZUSTAND_OFFEN).length,
    andererZustand: alle.filter((k) => !k.gesperrt && k.zustand && !zustandErlaubt(k) && String(k.zustand).toUpperCase() !== ZUSTAND_OFFEN).length,
    ohneZustand: alle.filter((k) => !k.zustand).length,
    ausShopify: alle.filter((k) => k.quelle === 'shopify').length,
    ausImport: alle.filter((k) => k.quelle === 'csv').length
  }
}

// Neue Kontakte in den Bestand einarbeiten. Gesperrte bleiben gesperrt.
function zusammenfuehren(bestand, neue, { jetzt = Date.now() } = {}) {
  const liste = alsListe(bestand).map((k) => ({ ...k, email: adresse(k.email) }))
  const nachAdresse = new Map(liste.map((k, i) => [k.email, i]))
  let angelegt = 0
  let aktualisiert = 0
  let uebersprungen = 0
  let gesperrtGelassen = 0

  for (const roh of Array.isArray(neue) ? neue : []) {
    const email = adresse(roh?.email)
    if (!gueltig(email)) {
      uebersprungen++
      continue
    }
    const stelle = nachAdresse.get(email)

    if (stelle === undefined) {
      liste.push({
        email,
        vorname: sauber(roh.vorname),
        nachname: sauber(roh.nachname),
        quelle: roh.quelle === 'csv' ? 'csv' : 'shopify',
        shopifyId: roh.shopifyId || null,
        zustand: roh.zustand ? String(roh.zustand).toUpperCase() : null,
        zustimmungAm: roh.zustimmungAm || null,
        zustimmungNachweis: sauber(roh.zustimmungNachweis) || null,
        gesperrt: false,
        gesperrtAm: null,
        gesperrtGrund: null,
        angelegtAm: jetzt,
        geaendertAm: jetzt
      })
      nachAdresse.set(email, liste.length - 1)
      angelegt++
      continue
    }

    const alt = liste[stelle]
    if (alt.gesperrt) {
      // Der Sync holt niemanden zurück, der sich abgemeldet hat. Nur die Kundennummer
      // übernehmen, damit die Abmeldung später zu Shopify zurückgeschrieben werden kann.
      liste[stelle] = { ...alt, shopifyId: alt.shopifyId || roh.shopifyId || null }
      gesperrtGelassen++
      continue
    }
    liste[stelle] = {
      ...alt,
      vorname: sauber(roh.vorname) || alt.vorname,
      nachname: sauber(roh.nachname) || alt.nachname,
      shopifyId: roh.shopifyId || alt.shopifyId || null,
      // Der Zustand kommt aus Shopify und ist dort die Wahrheit: er wird überschrieben,
      // nicht nur ergänzt. Wer von SUBSCRIBED auf PENDING wechselt, fällt also heraus.
      zustand: roh.zustand ? String(roh.zustand).toUpperCase() : alt.zustand || null,
      zustimmungAm: alt.zustimmungAm || roh.zustimmungAm || null,
      zustimmungNachweis: alt.zustimmungNachweis || sauber(roh.zustimmungNachweis) || null,
      geaendertAm: jetzt
    }
    aktualisiert++
  }

  return { liste, angelegt, aktualisiert, uebersprungen, gesperrtGelassen }
}

// Abmelden: sperren, aber in der Liste behalten
function sperren(liste, email, { grund = 'abgemeldet', jetzt = Date.now() } = {}) {
  const ziel = adresse(email)
  let getroffen = false
  const neu = alsListe(liste).map((k) => {
    if (adresse(k.email) !== ziel) return k
    getroffen = true
    return { ...k, gesperrt: true, gesperrtAm: jetzt, gesperrtGrund: sauber(grund) || 'abgemeldet', geaendertAm: jetzt }
  })
  return { liste: neu, ok: getroffen }
}

function freigeben(liste, email, { jetzt = Date.now() } = {}) {
  const ziel = adresse(email)
  let getroffen = false
  const neu = alsListe(liste).map((k) => {
    if (adresse(k.email) !== ziel) return k
    getroffen = true
    return { ...k, gesperrt: false, gesperrtAm: null, gesperrtGrund: null, geaendertAm: jetzt }
  })
  return { liste: neu, ok: getroffen }
}

// Vollständig entfernen (Löschanfrage). Danach kann ein Sync die Adresse wieder einsammeln,
// sofern sie bei Shopify noch zustimmt — deshalb ist Sperren der Normalfall.
function loeschen(liste, email) {
  const ziel = adresse(email)
  const vorher = alsListe(liste)
  const neu = vorher.filter((k) => adresse(k.email) !== ziel)
  return { liste: neu, ok: neu.length < vorher.length }
}

function finden(liste, email) {
  const ziel = adresse(email)
  return alsListe(liste).find((k) => adresse(k.email) === ziel) || null
}

// ── CSV-Import ──
// Erwartet eine Kopfzeile. Trennzeichen wird erkannt (Komma, Semikolon, Tab).
// Spalten: email (Pflicht), vorname, nachname, zustimmungam (Pflicht, sonst kein Empfänger).
const SPALTEN = {
  email: ['email', 'e-mail', 'mail', 'adresse', 'e-mail-adresse'],
  vorname: ['vorname', 'first name', 'firstname', 'first_name'],
  nachname: ['nachname', 'last name', 'lastname', 'last_name', 'name'],
  zustimmungAm: ['zustimmungam', 'zustimmung am', 'zustimmung', 'opt-in', 'optin', 'consent', 'datum']
}

function trennzeichenVon(zeile) {
  const kandidaten = [';', ',', '\t']
  let bestes = ','
  let meiste = 0
  for (const zeichen of kandidaten) {
    const anzahl = zeile.split(zeichen).length - 1
    if (anzahl > meiste) {
      meiste = anzahl
      bestes = zeichen
    }
  }
  return bestes
}

function feldAufteilen(zeile, trennzeichen) {
  const felder = []
  let aktuell = ''
  let inAnfuehrung = false
  for (let i = 0; i < zeile.length; i++) {
    const zeichen = zeile[i]
    if (zeichen === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') {
        aktuell += '"'
        i++
      } else {
        inAnfuehrung = !inAnfuehrung
      }
      continue
    }
    if (zeichen === trennzeichen && !inAnfuehrung) {
      felder.push(aktuell)
      aktuell = ''
      continue
    }
    aktuell += zeichen
  }
  felder.push(aktuell)
  return felder.map((f) => f.trim())
}

function csvLesen(text) {
  const zeilen = String(text || '')
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
  if (!zeilen.length) return { ok: false, fehler: ['Die Datei ist leer.'], kontakte: [] }

  const trennzeichen = trennzeichenVon(zeilen[0])
  const kopf = feldAufteilen(zeilen[0], trennzeichen).map((f) => f.toLowerCase().replace(/^"|"$/g, ''))

  const stelle = {}
  for (const [feld, namen] of Object.entries(SPALTEN)) {
    stelle[feld] = kopf.findIndex((k) => namen.includes(k))
  }
  if (stelle.email < 0) {
    return { ok: false, fehler: ['In der Kopfzeile fehlt eine Spalte „email“.'], kontakte: [] }
  }

  const kontakte = []
  const fehler = []
  for (let i = 1; i < zeilen.length; i++) {
    const felder = feldAufteilen(zeilen[i], trennzeichen)
    const email = adresse(felder[stelle.email])
    if (!email) continue
    if (!gueltig(email)) {
      fehler.push(`Zeile ${i + 1}: „${email.slice(0, 60)}“ ist keine gültige Adresse.`)
      continue
    }
    const zustimmung = stelle.zustimmungAm >= 0 ? sauber(felder[stelle.zustimmungAm]) : ''
    if (!zustimmung) {
      fehler.push(`Zeile ${i + 1}: ohne Zustimmungsdatum wird ${email} nicht als Empfänger geführt.`)
    }
    kontakte.push({
      email,
      vorname: stelle.vorname >= 0 ? sauber(felder[stelle.vorname]) : '',
      nachname: stelle.nachname >= 0 ? sauber(felder[stelle.nachname]) : '',
      quelle: 'csv',
      zustimmungAm: zustimmung || null,
      zustimmungNachweis: zustimmung ? `CSV-Import, Zustimmung laut Datei: ${zustimmung}` : null
    })
  }

  return { ok: kontakte.length > 0, kontakte, fehler }
}

module.exports = { empfaenger, stand, zusammenfuehren, sperren, freigeben, loeschen, finden, csvLesen, gueltig, zustandErlaubt, SPALTEN, ZUSTAND_OK, ZUSTAND_OFFEN }
