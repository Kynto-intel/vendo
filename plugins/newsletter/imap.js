'use strict'
// Newsletter-Plugin: Abmeldungen aus dem Postfach lesen.
//
// Der `List-Unsubscribe`-Header verweist auf eine `mailto:`-Adresse. Wer sich abmeldet,
// schickt also eine Mail — und die muss wirken, ohne dass jemand sie von Hand abarbeitet.
//
// Zwei Regeln, die hier wichtig sind:
//   - **Nicht in der INBOX wühlen.** Dort liegen die Kundenmails, die Hermes beobachtet.
//     Vorgesehen ist ein eigener Ordner, den eine Filterregel bei IONOS füllt. Wird doch
//     die INBOX eingestellt, zählt nur, was im Betreff nach Abmeldung aussieht.
//   - **Nichts löschen, nichts verschieben.** Verarbeitete Mails werden nur als gelesen
//     markiert. Damit bleibt alles nachvollziehbar, und ein Fehler hier vernichtet nichts.
//
// `erzeuger` ist einspritzbar, damit Tests ohne Postfach laufen.

const { EMAIL_FORM } = require('./zugang.js')

const IMAP_STANDARD = { host: 'imap.ionos.de', port: 993 }
const ORDNER_STANDARD = 'Abmeldungen'
const MAX_MAILS = 200
const FRIST = 30000

// Wonach eine Abmeldung aussieht, wenn sie nicht in einem eigenen Ordner liegt
const ABMELDE_MUSTER = /abmeld|unsubscribe|austragen|abbestell/i

function absenderAus(umschlag) {
  const von = umschlag?.from?.[0]?.address || umschlag?.sender?.[0]?.address || ''
  const email = String(von).trim().toLowerCase()
  return email && EMAIL_FORM.test(email) ? email : null
}

// Zählt diese Mail als Abmeldung? Im eigenen Ordner ja, sonst muss der Betreff passen.
function istAbmeldung({ betreff, eigenerOrdner }) {
  if (eigenerOrdner) return true
  return ABMELDE_MUSTER.test(String(betreff || ''))
}

const istInbox = (ordner) => String(ordner || '').trim().toUpperCase() === 'INBOX'

function fehlerText(fehler) {
  const text = String(fehler?.message || fehler || '')
  if (/authentication|AUTHENTICATIONFAILED|invalid credentials/i.test(text)) {
    return 'Das Postfach hat die Anmeldung abgelehnt. Dieselben Zugangsdaten wie beim Versand prüfen.'
  }
  if (/mailbox.*(exist|not found)|NONEXISTENT|no such/i.test(text)) {
    return 'Den Ordner gibt es im Postfach nicht. Namen prüfen (Groß- und Kleinschreibung) oder ihn bei IONOS anlegen.'
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return 'Der Posteingangsserver wurde nicht gefunden. Ist der Servername richtig?'
  if (/ETIMEDOUT|ECONNREFUSED|socket/i.test(text)) return 'Keine Verbindung zum Posteingangsserver. Internet, Port oder Firewall prüfen.'
  return `Postfach nicht lesbar: ${text.slice(0, 140)}`
}

function einstellungenPruefen(eingabe = {}) {
  const fehler = []
  const ordner = String(eingabe.ordner ?? '').trim() || ORDNER_STANDARD
  if (ordner.length > 120) fehler.push('Der Ordnername ist zu lang.')
  if (/[\r\n]/.test(ordner)) fehler.push('Der Ordnername darf keinen Zeilenumbruch enthalten.')
  const host = String(eingabe.host ?? '').trim() || IMAP_STANDARD.host
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) fehler.push('Der Posteingangsserver sieht nicht wie ein Servername aus.')
  const port = Number(eingabe.port ?? IMAP_STANDARD.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.push('Der Port ist unbrauchbar.')
  return { ok: fehler.length === 0, fehler, wert: { ordner, host, port, aktiv: Boolean(eingabe.aktiv) } }
}

function clientMachen({ zugang = {}, passwort, einstellungen = {}, erzeuger = null }) {
  if (erzeuger) return erzeuger({ zugang, passwort, einstellungen })
  let ImapFlow
  try {
    ;({ ImapFlow } = require('imapflow'))
  } catch {
    return null
  }
  return new ImapFlow({
    host: einstellungen.host || IMAP_STANDARD.host,
    port: Number(einstellungen.port) || IMAP_STANDARD.port,
    secure: true,
    auth: { user: zugang.benutzer, pass: passwort },
    logger: false, // sonst landet der ganze IMAP-Verkehr samt Betreffs im Terminal
    socketTimeout: FRIST,
    greetingTimeout: FRIST
  })
}

// Ungelesene Mails im Ordner holen und als Abmeldungen deuten.
// Gibt { ok, abmeldungen: [{ uid, email, betreff, datum }], gesehen, fehler } zurück.
async function abmeldungenHolen({ zugang, passwort, einstellungen = {}, erzeuger = null, grenze = MAX_MAILS } = {}) {
  const ordner = einstellungen.ordner || ORDNER_STANDARD
  const eigenerOrdner = !istInbox(ordner)
  const client = clientMachen({ zugang, passwort, einstellungen, erzeuger })
  if (!client) return { ok: false, fehler: 'Die IMAP-Bibliothek fehlt. In Vendos Ordner einmal „npm install“ ausführen.', abmeldungen: [] }

  const abmeldungen = []
  let gesehen = 0
  let sperre = null
  try {
    await client.connect()
    sperre = await client.getMailboxLock(ordner)
    for await (const nachricht of client.fetch({ seen: false }, { envelope: true, uid: true })) {
      gesehen++
      if (gesehen > grenze) break
      const umschlag = nachricht?.envelope || {}
      const email = absenderAus(umschlag)
      if (!email) continue
      if (!istAbmeldung({ betreff: umschlag.subject, eigenerOrdner })) continue
      abmeldungen.push({
        uid: nachricht.uid,
        email,
        betreff: String(umschlag.subject || '').slice(0, 120),
        datum: umschlag.date ? new Date(umschlag.date).toISOString() : null
      })
    }
    return { ok: true, abmeldungen, gesehen, ordner, eigenerOrdner }
  } catch (fehler) {
    return { ok: false, fehler: fehlerText(fehler), abmeldungen, gesehen }
  } finally {
    try {
      if (sperre) sperre.release()
    } catch {
      // egal
    }
    try {
      await client.logout()
    } catch {
      try {
        client.close?.()
      } catch {
        // egal
      }
    }
  }
}

// Verarbeitete Mails als gelesen markieren, damit sie beim nächsten Lauf nicht noch einmal
// kommen. Eine eigene Verbindung, damit ein Fehler beim Markieren den Abruf nicht verliert.
async function alsGelesenMarkieren({ zugang, passwort, einstellungen = {}, uids = [], erzeuger = null } = {}) {
  const liste = (Array.isArray(uids) ? uids : []).map(Number).filter((u) => Number.isFinite(u) && u > 0)
  if (!liste.length) return { ok: true, markiert: 0 }
  const client = clientMachen({ zugang, passwort, einstellungen, erzeuger })
  if (!client) return { ok: false, fehler: 'Die IMAP-Bibliothek fehlt.', markiert: 0 }

  let sperre = null
  try {
    await client.connect()
    sperre = await client.getMailboxLock(einstellungen.ordner || ORDNER_STANDARD)
    await client.messageFlagsAdd({ uid: liste.join(',') }, ['\\Seen'], { uid: true })
    return { ok: true, markiert: liste.length }
  } catch (fehler) {
    return { ok: false, fehler: fehlerText(fehler), markiert: 0 }
  } finally {
    try {
      if (sperre) sperre.release()
    } catch {
      // egal
    }
    try {
      await client.logout()
    } catch {
      try {
        client.close?.()
      } catch {
        // egal
      }
    }
  }
}

// Verbindung und Ordner prüfen, ohne etwas zu verändern
async function verbindungPruefen({ zugang, passwort, einstellungen = {}, erzeuger = null } = {}) {
  const ordner = einstellungen.ordner || ORDNER_STANDARD
  const client = clientMachen({ zugang, passwort, einstellungen, erzeuger })
  if (!client) return { ok: false, text: 'Die IMAP-Bibliothek fehlt. In Vendos Ordner einmal „npm install“ ausführen.' }
  let sperre = null
  try {
    await client.connect()
    sperre = await client.getMailboxLock(ordner)
    const anzahl = client.mailbox?.exists ?? null
    return {
      ok: true,
      text: `Ordner „${ordner}“ geöffnet${anzahl == null ? '' : `, ${anzahl} Mails darin`}.${istInbox(ordner) ? ' Achtung: in der INBOX liegen auch deine Kundenmails — dort zählt nur, was im Betreff nach Abmeldung aussieht.' : ''}`
    }
  } catch (fehler) {
    return { ok: false, text: fehlerText(fehler) }
  } finally {
    try {
      if (sperre) sperre.release()
    } catch {
      // egal
    }
    try {
      await client.logout()
    } catch {
      try {
        client.close?.()
      } catch {
        // egal
      }
    }
  }
}

module.exports = {
  abmeldungenHolen,
  alsGelesenMarkieren,
  verbindungPruefen,
  einstellungenPruefen,
  absenderAus,
  istAbmeldung,
  fehlerText,
  istInbox,
  IMAP_STANDARD,
  ORDNER_STANDARD,
  ABMELDE_MUSTER,
  MAX_MAILS
}
