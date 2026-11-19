'use strict'
// Newsletter-Plugin: Rückläufer und Beschwerden erkennen.
//
// Kommt eine Mail nicht an, schickt der Mailserver eine Rückmeldung an das Postfach, von dem
// sie kam. Eine Filterregel bei IONOS legt diese Mails in einen eigenen Ordner; `imap.js` holt
// sie ab, hier werden sie gelesen. Wer an tote Adressen weiter sendet, schadet dem Ruf des
// Postfachs, das auch der Kundenservice nutzt.
//
// Was hier entschieden wird, je betroffener Adresse:
//   - `hart`: Die Adresse gibt es nicht (mehr). Status 5.1.x, 5.2.1 (Postfach stillgelegt),
//     5.4.4 (Domain ohne Mailserver) oder ein dauerhafter Fehler mit eindeutigem Text wie
//     „user unknown“. → Der Kontakt wird gesperrt.
//   - `beschwerde`: Jemand hat die Mail als Spam gemeldet (Feedback-Report nach RFC 5965).
//     → Der Kontakt wird gesperrt.
//   - `weich`: vorübergehend, etwa Postfach voll (5.2.2) oder 4.x.x. → nur gezählt.
//   - `abgelehnt`: dauerhaft abgelehnt, aber nicht weil die Adresse fehlt — meist Spamverdacht
//     oder eine Richtlinie des Empfängers (5.7.x, unklare 5.x.x). Das sagt etwas über Vendos
//     Mails, nicht über die Adresse. → nur gezählt, nicht gesperrt.
//   - `unbekannt`: eine Rückmeldung, aber nicht sicher lesbar. → nichts tun.
// Im Zweifel wird nicht gesperrt: lieber eine Mail zu viel an eine tote Adresse als eine
// lebendige Kundin, die nie wieder etwas bekommt.
//
// Gelesen werden drei Formen, in dieser Reihenfolge:
//   1. Zustellberichte nach RFC 3464 (`message/delivery-status`), Felder je Empfänger.
//   2. Beschwerden nach RFC 5965 (`message/feedback-report`).
//   3. Klartext-Rückmeldungen, wie sie manche Server schreiben: Empfänger aus
//      `X-Failed-Recipients` oder dem Kopf der mitgeschickten Originalmail, der Grund aus den
//      SMTP-Codes im Text.
//
// Alle Funktionen sind rein. Eingabe ist der Quelltext einer Mail, Ausgabe eine Liste.

const { EMAIL_FORM } = require('./zugang.js')

const MAX_QUELLE = 262144 // mehr als 256 KB einer Rückmeldung braucht niemand zum Lesen
const MAX_TIEFE = 4
const GRUND_LAENGE = 160

// Wonach eine Rückmeldung aussieht, wenn sie kein Zustellbericht ist
const ABSENDER_MUSTER = /mailer-daemon|postmaster|mail delivery (sub)?system|mail-daemon/i
const BETREFF_MUSTER = /undeliver|unzustellbar|nicht zugestellt|zustellung fehlgeschlagen|delivery (status notification|failure|has failed|failed)|returned mail|mail delivery failed|failure notice|rückläufer|non[- ]?delivery/i

// Text, der eindeutig auf eine nicht vorhandene Adresse zeigt
const HART_TEXT =
  /user unknown|unknown user|no such (user|mailbox|recipient|address)|does ?n[o']t exist|mailbox (not found|unavailable|does not exist|is disabled)|recipient (address )?rejected|invalid (recipient|mailbox|address)|address rejected|unknown (recipient|address|mailbox)|account (has been )?(disabled|deactivated)|(domain|host) (name )?not found|unrouteable|empfänger unbekannt|adresse unbekannt|existiert nicht|nicht vorhanden|ungültige (adresse|empfänger)/i

// ── Kleiner MIME-Leser ──
// Nur so viel, wie Rückmeldungen brauchen: Kopf, Teile, base64 und quoted-printable.

function trennen(text) {
  const t = String(text || '')
  const m = /\r?\n\r?\n/.exec(t)
  if (!m) return { kopf: t, rumpf: '' }
  return { kopf: t.slice(0, m.index), rumpf: t.slice(m.index + m[0].length) }
}

function kopfzeilenLesen(block) {
  const felder = []
  for (const zeile of String(block || '').split(/\r?\n/)) {
    if (/^[ \t]/.test(zeile) && felder.length) {
      felder[felder.length - 1][1] += ` ${zeile.trim()}`
      continue
    }
    const i = zeile.indexOf(':')
    if (i > 0) felder.push([zeile.slice(0, i).trim().toLowerCase(), zeile.slice(i + 1).trim()])
  }
  return felder
}

const feld = (felder, name) => (felder.find(([n]) => n === name) || [])[1] || ''

function inhaltstyp(felder) {
  const wert = feld(felder, 'content-type')
  const typ = (wert.split(';')[0] || '').trim().toLowerCase() || 'text/plain'
  const grenze = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(wert)
  return { typ, grenze: grenze ? grenze[1] || grenze[2] : null }
}

function qpDekodieren(text) {
  const ohneUmbruch = String(text).replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < ohneUmbruch.length; i++) {
    const z = ohneUmbruch[i]
    if (z === '=' && /^[0-9a-f]{2}$/i.test(ohneUmbruch.slice(i + 1, i + 3))) {
      bytes.push(parseInt(ohneUmbruch.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(...Buffer.from(z, 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

function dekodieren(rumpf, felder) {
  const kodierung = feld(felder, 'content-transfer-encoding').toLowerCase()
  try {
    if (kodierung === 'base64') return Buffer.from(String(rumpf).replace(/\s+/g, ''), 'base64').toString('utf8')
    if (kodierung === 'quoted-printable') return qpDekodieren(rumpf)
  } catch {
    // kaputt kodiert: dann eben roh
  }
  return String(rumpf)
}

// Alle Blätter einer Mail als flache Liste: { typ, felder, text }
function teileLesen(text, tiefe = 0) {
  const { kopf, rumpf } = trennen(text)
  const felder = kopfzeilenLesen(kopf)
  const { typ, grenze } = inhaltstyp(felder)
  if (typ.startsWith('multipart/') && grenze && tiefe < MAX_TIEFE) {
    const stuecke = String(rumpf).split(`--${grenze}`)
    const teile = []
    for (const stueck of stuecke.slice(1)) {
      if (stueck.startsWith('--')) break // Schlussgrenze
      teile.push(...teileLesen(stueck.replace(/^\r?\n/, ''), tiefe + 1))
    }
    return teile
  }
  return [{ typ, felder, text: dekodieren(rumpf, felder) }]
}

// ── Adressen ──

function adresseAus(wert) {
  // „rfc822; kim@beispiel.invalid“, „<kim@beispiel.invalid>“ oder nur die Adresse
  const roh = String(wert || '').split(';').pop()
  const m = /<?([^\s<>;"']+@[^\s<>;"']+)>?/.exec(roh)
  const email = m ? m[1].trim().toLowerCase().replace(/[.,]+$/, '') : ''
  return email && EMAIL_FORM.test(email) ? email : null
}

function adressenAus(wert) {
  return String(wert || '')
    .split(',')
    .map(adresseAus)
    .filter(Boolean)
}

// ── Einordnen ──

const statusAus = (text) => {
  const m = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/.exec(String(text || ''))
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

const kurz = (text) =>
  String(text || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, GRUND_LAENGE)

// Entscheidung für eine Adresse aus Aktion, Status und Servertext
function einordnen({ aktion = '', status = null, diagnose = '' } = {}) {
  const a = String(aktion).toLowerCase()
  const s = status || statusAus(diagnose)
  const text = String(diagnose || '')
  const smtp = /\b([45])\d\d\b/.exec(text)?.[1] || null
  const hartText = HART_TEXT.test(text)

  if (a === 'delayed' || a === 'relayed' || a === 'delivered' || a === 'expanded') {
    if (a === 'delivered' || a === 'relayed' || a === 'expanded') return { art: 'keine', status: s, grund: 'zugestellt oder weitergeleitet' }
    return { art: 'weich', status: s, grund: 'Zustellung verzögert, der Server versucht es weiter' }
  }
  if (s?.startsWith('4')) return { art: 'weich', status: s, grund: 'vorübergehender Fehler' }
  if (s?.startsWith('5')) {
    const [, klasse, detail] = s.split('.').map(Number)
    if (klasse === 1 || (klasse === 2 && detail === 1) || (klasse === 4 && detail === 4)) return { art: 'hart', status: s, grund: 'Adresse gibt es nicht (mehr)' }
    if (klasse === 2 && detail === 2) return { art: 'weich', status: s, grund: 'Postfach voll' }
    if (hartText) return { art: 'hart', status: s, grund: 'Adresse gibt es nicht (mehr)' }
    if (klasse === 7) return { art: 'abgelehnt', status: s, grund: 'abgelehnt (Richtlinie oder Spamverdacht)' }
    return { art: 'abgelehnt', status: s, grund: 'dauerhaft abgelehnt, Grund unklar' }
  }
  // Kein erweiterter Status: dann der dreistellige SMTP-Code und der Text
  if (smtp === '4') return { art: 'weich', status: null, grund: 'vorübergehender Fehler' }
  if (smtp === '5' || a === 'failed') {
    if (hartText) return { art: 'hart', status: null, grund: 'Adresse gibt es nicht (mehr)' }
    return { art: 'abgelehnt', status: null, grund: 'dauerhaft abgelehnt, Grund unklar' }
  }
  return { art: 'unbekannt', status: null, grund: 'Rückmeldung ohne lesbaren Grund' }
}

// ── Die drei Formen ──

// RFC 3464: ein Block für die Nachricht, dann ein Block je Empfänger
function zustellberichtLesen(text) {
  const bloecke = String(text || '')
    .split(/\r?\n\s*\r?\n/)
    .map(kopfzeilenLesen)
    .filter((f) => f.length)
  const ergebnisse = []
  for (const f of bloecke) {
    const email = adresseAus(feld(f, 'final-recipient')) || adresseAus(feld(f, 'original-recipient'))
    if (!email) continue
    const diagnose = feld(f, 'diagnostic-code')
    const e = einordnen({ aktion: feld(f, 'action'), status: statusAus(feld(f, 'status')), diagnose })
    ergebnisse.push({ email, ...e, grund: kurz(diagnose ? `${e.grund}: ${diagnose.replace(/^smtp;\s*/i, '')}` : e.grund), quelle: 'zustellbericht' })
  }
  return ergebnisse
}

// RFC 5965: eine Spam-Meldung. Der Empfänger steht im Bericht oder im Kopf der Originalmail.
function beschwerdeLesen(bericht, original) {
  const f = kopfzeilenLesen(trennen(bericht).kopf)
  const art = feld(f, 'feedback-type').toLowerCase()
  if (art && art !== 'abuse' && art !== 'fraud') return []
  const adressen = [...adressenAus(feld(f, 'original-rcpt-to')), ...adressenAus(feld(f, 'removal-recipient'))]
  if (!adressen.length && original) adressen.push(...adressenAus(feld(kopfzeilenLesen(trennen(original).kopf), 'to')))
  return [...new Set(adressen)].map((email) => ({ email, art: 'beschwerde', status: null, grund: 'als Spam gemeldet', quelle: 'beschwerde' }))
}

// Klartext: wer, aus X-Failed-Recipients oder dem Kopf der Originalmail; warum, aus dem Text
function klartextLesen(kopf, teile) {
  let adressen = adressenAus(feld(kopf, 'x-failed-recipients'))
  const original = teile.find((t) => t.typ === 'message/rfc822' || t.typ === 'text/rfc822-headers')
  if (!adressen.length && original) adressen = adressenAus(feld(kopfzeilenLesen(trennen(original.text).kopf), 'to'))
  if (!adressen.length) {
    // Manche Server hängen die Originalmail als Text an, hinter einer Trennzeile
    for (const t of teile.filter((x) => x.typ.startsWith('text/plain'))) {
      const m = /^-{2,}.*(original message|copy of the message|ursprüngliche nachricht).*$/im.exec(t.text)
      if (!m) continue
      adressen = adressenAus(feld(kopfzeilenLesen(trennen(t.text.slice(m.index + m[0].length).replace(/^\s*\r?\n/, '')).kopf), 'to'))
      if (adressen.length) break
    }
  }
  if (!adressen.length) return []
  // Der Grund steht im Text vor der Originalmail
  const text = teile
    .filter((t) => t.typ.startsWith('text/plain'))
    .map((t) => t.text.split(/^-{2,}.*(original message|copy of the message|ursprüngliche nachricht).*$/im)[0])
    .join('\n')
  const e = einordnen({ diagnose: text })
  const zeile =
    text
      .split(/\r?\n/)
      .map((z) => z.trim())
      .find((z) => /\b[45]\d\d\b|\b[45]\.\d{1,3}\.\d{1,3}\b/.test(z)) || ''
  return [...new Set(adressen)].map((email) => ({ email, ...e, grund: kurz(zeile ? `${e.grund}: ${zeile}` : e.grund), quelle: 'klartext' }))
}

// Eine Mail lesen. Gibt { rueckmeldung, ergebnisse } zurück; `rueckmeldung` ist falsch, wenn
// die Mail gar keine Rückmeldung ist (etwa eine Abwesenheitsnotiz, die im Ordner gelandet ist).
// `eigene` sind Adressen, die nie gesperrt werden: das Postfach selbst und die Abmeldeadresse.
function lesen(quelle, { eigene = [] } = {}) {
  const text = String(quelle || '').slice(0, MAX_QUELLE)
  const kopf = kopfzeilenLesen(trennen(text).kopf)
  const teile = teileLesen(text)
  const ausgenommen = new Set(eigene.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))

  const bericht = teile.find((t) => t.typ === 'message/delivery-status')
  const spam = teile.find((t) => t.typ === 'message/feedback-report')
  const original = teile.find((t) => t.typ === 'message/rfc822' || t.typ === 'text/rfc822-headers')

  let ergebnisse = []
  let rueckmeldung = false
  if (spam) {
    rueckmeldung = true
    ergebnisse = beschwerdeLesen(spam.text, original?.text)
  } else if (bericht) {
    rueckmeldung = true
    ergebnisse = zustellberichtLesen(bericht.text)
  } else if (feld(kopf, 'x-failed-recipients') || ABSENDER_MUSTER.test(feld(kopf, 'from')) || BETREFF_MUSTER.test(feld(kopf, 'subject'))) {
    rueckmeldung = true
    ergebnisse = klartextLesen(kopf, teile)
  }

  ergebnisse = ergebnisse.filter((e) => e.art !== 'keine' && !ausgenommen.has(e.email))
  // Dieselbe Adresse zweimal in einer Rückmeldung: die schwerere Einordnung zählt
  const rang = { beschwerde: 4, hart: 3, abgelehnt: 2, weich: 1, unbekannt: 0 }
  const je = new Map()
  for (const e of ergebnisse) if (!je.has(e.email) || rang[e.art] > rang[je.get(e.email).art]) je.set(e.email, e)
  return { rueckmeldung, ergebnisse: [...je.values()] }
}

// ── Auf die Kontakte anwenden ──

const SPERRT = new Set(['hart', 'beschwerde'])
const MAX_EREIGNISSE = 500

// Ergebnisse auf die Kontakte anwenden. Hart und Beschwerde sperren (mit eigener Art, damit
// eine Rückläufer-Sperre von einer Abmeldung unterscheidbar bleibt und nicht als Abmeldung
// zu Shopify geht); weich und abgelehnt werden am Kontakt gezählt. Adressen, die nicht in den
// Kontakten stehen, werden nur gezählt. Gibt die neue Liste und die Ereignisse zurück.
function anwenden(kontakteListe, ergebnisse, { jetzt = Date.now() } = {}) {
  const liste = Array.isArray(kontakteListe) ? kontakteListe.map((k) => ({ ...k })) : []
  const nachAdresse = new Map(liste.map((k, i) => [String(k.email || '').toLowerCase(), i]))
  const ereignisse = []
  let gesperrt = 0
  let gezaehlt = 0
  let unbekannt = 0

  for (const e of Array.isArray(ergebnisse) ? ergebnisse : []) {
    if (!e?.email || e.art === 'unbekannt') continue
    const stelle = nachAdresse.get(e.email)
    if (stelle === undefined) {
      unbekannt++
      continue
    }
    const k = liste[stelle]
    ereignisse.push({ am: jetzt, email: e.email, art: e.art, status: e.status || null, grund: kurz(e.grund), quelle: e.quelle || null })
    if (SPERRT.has(e.art)) {
      if (!k.gesperrt) {
        liste[stelle] = {
          ...k,
          gesperrt: true,
          gesperrtAm: jetzt,
          gesperrtGrund: e.art === 'beschwerde' ? 'Beschwerde: als Spam gemeldet' : `Rückläufer: ${kurz(e.status ? `${e.grund} (${e.status})` : e.grund)}`,
          sperrArt: e.art === 'beschwerde' ? 'beschwerde' : 'ruecklaeufer',
          geaendertAm: jetzt
        }
        gesperrt++
      }
      continue
    }
    const zaehler = { weich: 0, abgelehnt: 0, ...(k.ruecklaeufer || {}) }
    zaehler[e.art] = (Number(zaehler[e.art]) || 0) + 1
    liste[stelle] = { ...k, ruecklaeufer: { ...zaehler, letzterAm: jetzt, letzterGrund: kurz(e.grund) } }
    gezaehlt++
  }
  return { liste, ereignisse, gesperrt, gezaehlt, unbekannt }
}

// Neue Ereignisse vorn anfügen, alte hinten abschneiden
function ereignisseMerken(bisher, neue, { max = MAX_EREIGNISSE } = {}) {
  const alt = Array.isArray(bisher) ? bisher.filter((e) => e && typeof e === 'object') : []
  return [...(Array.isArray(neue) ? neue : []), ...alt].slice(0, max)
}

module.exports = {
  lesen,
  einordnen,
  anwenden,
  ereignisseMerken,
  teileLesen,
  adresseAus,
  statusAus,
  SPERRT,
  MAX_QUELLE,
  MAX_EREIGNISSE
}
