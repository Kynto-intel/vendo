'use strict'
// Newsletter-Plugin: Zugangsdaten des Postfachs prüfen.
//
// Zeilenumbrüche in Name und Adresse werden abgelehnt: damit ließen sich sonst eigene
// Mail-Header einschmuggeln. Das Passwort kommt hier nicht vor — das macht tresor.js.

const SMTP_STANDARD = { host: 'smtp.ionos.de', port: 465 } // IONOS Mail Basic/Business, SSL/TLS
const PORTS = [465, 587] // 465 = SSL/TLS, 587 = STARTTLS als Rückfalloption

const EMAIL_FORM = /^[^\s@,;:<>"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i
const HOST_FORM = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const einzeilig = (wert) => !/[\r\n]/.test(String(wert ?? ''))

// Adresse fürs Log kürzen: aus felix@beispiel.de wird f***@beispiel.de
function kuerzen(email) {
  const text = String(email || '')
  const at = text.indexOf('@')
  if (at < 1) return '***'
  return `${text[0]}***${text.slice(at)}`
}

function zugangPruefen(eingabe = {}) {
  const fehler = []
  const sauber = (wert) => String(wert ?? '').trim()

  const benutzer = sauber(eingabe.benutzer).toLowerCase()
  if (!benutzer) fehler.push('Die Postfach-Adresse fehlt.')
  else if (!EMAIL_FORM.test(benutzer)) fehler.push('Die Postfach-Adresse sieht nicht wie eine E-Mail-Adresse aus.')

  const host = sauber(eingabe.host) || SMTP_STANDARD.host
  if (!HOST_FORM.test(host)) fehler.push('Der Postausgangsserver sieht nicht wie ein Servername aus.')

  const port = Number(eingabe.port ?? SMTP_STANDARD.port)
  if (!PORTS.includes(port)) fehler.push(`Als Port ist ${PORTS.join(' oder ')} vorgesehen.`)

  const absenderName = sauber(eingabe.absenderName)
  if (absenderName.length > 80) fehler.push('Der Absendername ist zu lang (höchstens 80 Zeichen).')
  if (!einzeilig(eingabe.absenderName)) fehler.push('Der Absendername darf keinen Zeilenumbruch enthalten.')

  const antwortAn = sauber(eingabe.antwortAn).toLowerCase()
  if (antwortAn && !EMAIL_FORM.test(antwortAn)) fehler.push('Die Antwortadresse sieht nicht wie eine E-Mail-Adresse aus.')
  if (!einzeilig(eingabe.antwortAn)) fehler.push('Die Antwortadresse darf keinen Zeilenumbruch enthalten.')

  // Wohin Testmails gehen. Leer heißt: an das Postfach selbst.
  const testAdresse = sauber(eingabe.testAdresse).toLowerCase()
  if (testAdresse && !EMAIL_FORM.test(testAdresse)) fehler.push('Die Testadresse sieht nicht wie eine E-Mail-Adresse aus.')
  if (!einzeilig(eingabe.testAdresse)) fehler.push('Die Testadresse darf keinen Zeilenumbruch enthalten.')

  // Name des Testempfängers: damit {{vorname}} in Testmails echt ersetzt wird und man sieht,
  // ob die Anrede stimmt. Leer heißt: Vendo setzt „Vorname“ und „Nachname“ ein.
  const testVorname = sauber(eingabe.testVorname)
  const testNachname = sauber(eingabe.testNachname)
  for (const [wert, roh, wer] of [[testVorname, eingabe.testVorname, 'Vorname'], [testNachname, eingabe.testNachname, 'Nachname']]) {
    if (wert.length > 60) fehler.push(`Der ${wer} für Testmails ist zu lang (höchstens 60 Zeichen).`)
    if (!einzeilig(roh)) fehler.push(`Der ${wer} für Testmails darf keinen Zeilenumbruch enthalten.`)
    if (/[{}<>]/.test(wert)) fehler.push(`Der ${wer} für Testmails darf keine Klammern { } < > enthalten.`)
  }

  return { ok: fehler.length === 0, fehler, wert: { benutzer, host, port, absenderName, antwortAn, testAdresse, testVorname, testNachname } }
}

module.exports = { zugangPruefen, kuerzen, einzeilig, EMAIL_FORM, HOST_FORM, SMTP_STANDARD, PORTS }
