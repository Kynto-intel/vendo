'use strict'
// Newsletter-Plugin: die SMTP-Verbindung.
//
// Das einzige Modul, das nodemailer kennt. Es weiß nichts über Kampagnen, Kontakte oder
// Shopify — nur „diese Mail, dieser Zugang“. Damit lässt sich IONOS später gegen einen
// Versanddienst tauschen, ohne den Rest anzufassen.
//
// nodemailer wird erst beim Aufruf geladen, nicht beim Start des Plugins.

const { SMTP_STANDARD } = require('./zugang.js')

const TEST_FRIST = 20000
const SENDE_FRIST = 60000

// Fehler von nodemailer in einen Satz übersetzen, der weiterhilft und nichts verrät
function smtpFehlerText(fehler) {
  const code = String(fehler?.code || '')
  const antwort = String(fehler?.response || fehler?.message || '')
  if (code === 'EAUTH') return 'Das Postfach hat die Anmeldung abgelehnt. Adresse und Passwort im IONOS-Panel prüfen (Postfach-Passwort, nicht das Kundenkonto-Passwort).'
  if (code === 'ENOTFOUND' || code === 'EDNS') return 'Der Postausgangsserver wurde nicht gefunden. Ist der Servername richtig geschrieben?'
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION') return 'Keine Verbindung zum Postausgangsserver. Internet, Port oder Firewall prüfen.'
  if (/\b4\d\d\b/.test(antwort) && /limit/i.test(antwort)) return 'Das Postfach hat sein Stundenlimit erreicht. Der Versand pausiert und läuft danach weiter.'
  if (/^5\d\d/.test(antwort)) return `Der Server hat abgelehnt: ${antwort.slice(0, 120)}`
  return `Versand fehlgeschlagen: ${(fehler?.message || 'unbekannter Fehler').slice(0, 120)}`
}

// Transport aufbauen. `erzeuger` nur für Tests, sonst kommt nodemailer zum Einsatz.
function transportMachen({ zugang = {}, passwort, frist = SENDE_FRIST, erzeuger = null } = {}) {
  let bauen = erzeuger
  if (!bauen) {
    try {
      bauen = require('nodemailer').createTransport
    } catch {
      return { fehler: 'Die Mail-Bibliothek fehlt. In Vendos Ordner einmal „npm install“ ausführen.' }
    }
  }
  const port = Number(zugang.port) || SMTP_STANDARD.port
  try {
    return {
      transport: bauen({
        host: zugang.host || SMTP_STANDARD.host,
        port,
        secure: port === 465, // 465 verschlüsselt von Anfang an, 587 steigt über STARTTLS um
        auth: { user: zugang.benutzer, pass: passwort },
        connectionTimeout: frist,
        greetingTimeout: frist,
        socketTimeout: frist
      })
    }
  } catch (e) {
    return { fehler: smtpFehlerText(e) }
  }
}

const schliessen = (transport) => {
  try {
    transport.close()
  } catch {
    // egal
  }
}

// Anmeldung prüfen, ohne eine Mail zu schicken
async function anmeldungPruefen({ zugang, passwort, erzeuger = null } = {}) {
  const { transport, fehler } = transportMachen({ zugang, passwort, frist: TEST_FRIST, erzeuger })
  if (fehler) return { ok: false, text: fehler }
  try {
    await transport.verify()
    const port = Number(zugang.port) || SMTP_STANDARD.port
    return { ok: true, text: `Angemeldet als ${zugang.benutzer} über ${zugang.host || SMTP_STANDARD.host}:${port}.` }
  } catch (e) {
    return { ok: false, text: smtpFehlerText(e), fehler: e }
  } finally {
    schliessen(transport)
  }
}

// Eine fertige Mail verschicken
async function mailVerschicken({ zugang, passwort, mail, erzeuger = null } = {}) {
  const { transport, fehler } = transportMachen({ zugang, passwort, frist: SENDE_FRIST, erzeuger })
  if (fehler) return { ok: false, text: fehler }
  try {
    await transport.sendMail(mail)
    return { ok: true, text: `Verschickt an ${mail.to}.` }
  } catch (e) {
    return { ok: false, text: smtpFehlerText(e), fehler: e }
  } finally {
    schliessen(transport)
  }
}

module.exports = { smtpFehlerText, transportMachen, anmeldungPruefen, mailVerschicken, TEST_FRIST, SENDE_FRIST }
