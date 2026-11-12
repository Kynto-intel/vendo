'use strict'
// Newsletter-Plugin: eine Mail aufbauen und den Textteil ableiten.
//
// Hier wird geprüft, was hinterher nicht mehr zu reparieren ist: Empfänger, Betreff,
// Kopfzeilen, Abmeldeweg. Eine Kampagnenmail ohne Abmeldeweg wird nicht gebaut — das ist
// keine Einstellung.

const { EMAIL_FORM, einzeilig } = require('./zugang.js')

// Textteil aus dem HTML ableiten. Jede Mail braucht einen: Spamfilter mögen reines HTML
// nicht, und manche Leute lesen bewusst ohne. Absichtlich schlicht — kein HTML-Parser,
// sondern das, was für unsere eigenen Bausteine reicht.
function textAusHtml(html) {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
      const sauber = text.replace(/<[^>]+>/g, '').trim()
      if (!sauber) return url
      return url.startsWith('mailto:') ? `${sauber} (${url.slice(7)})` : `${sauber} (${url})`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[ \t]+/gm, '') // Einrückung des HTML-Quelltexts gehört nicht in den Textteil
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// art: 'test'      — Mail an die eigene Adresse, kein Abmeldeweg nötig
//      'kampagne'  — Mail an Empfänger: ohne Abmeldeweg wird nicht gebaut
// `anhaenge` sind eingebettete Bilder (die Social-Icons aus icons.js), kein Dateianhang
// für den Empfänger: sie tragen eine `cid`, auf die das HTML zeigt.
function mailBauen({ art = 'kampagne', an, betreff, html, text, zugang = {}, abmeldeAdresse = '', anhaenge = [] } = {}) {
  const fehler = []
  const sauber = (wert) => String(wert ?? '').trim()

  const empfaenger = sauber(an).toLowerCase()
  if (!empfaenger) fehler.push('Der Empfänger fehlt.')
  else if (!EMAIL_FORM.test(empfaenger)) fehler.push('Die Empfängeradresse sieht nicht wie eine E-Mail-Adresse aus.')
  if (!einzeilig(an)) fehler.push('Die Empfängeradresse darf keinen Zeilenumbruch enthalten.')

  const titel = sauber(betreff)
  if (!titel) fehler.push('Der Betreff fehlt.')
  if (titel.length > 200) fehler.push('Der Betreff ist zu lang (höchstens 200 Zeichen).')
  if (!einzeilig(betreff)) fehler.push('Der Betreff darf keinen Zeilenumbruch enthalten.')

  const inhaltHtml = String(html ?? '')
  const inhaltText = sauber(text) || textAusHtml(inhaltHtml)
  if (!inhaltHtml.trim() && !inhaltText) fehler.push('Die Mail hat keinen Inhalt.')

  if (!zugang.benutzer || !EMAIL_FORM.test(String(zugang.benutzer))) fehler.push('Es ist kein gültiges Absender-Postfach eingerichtet.')

  // Harte Regel: Werbung ohne Abmeldeweg geht nicht raus.
  const abmelden = sauber(abmeldeAdresse).toLowerCase() || sauber(zugang.benutzer).toLowerCase()
  if (art === 'kampagne') {
    if (!abmelden || !EMAIL_FORM.test(abmelden)) fehler.push('Für eine Kampagnenmail fehlt der Abmeldeweg.')
    if (!/abmeld|unsubscribe/i.test(inhaltHtml)) fehler.push('In der Kampagnenmail fehlt ein Abmeldelink im Inhalt.')
  }

  if (fehler.length) return { ok: false, fehler }

  const mail = {
    from: zugang.absenderName ? { name: zugang.absenderName, address: zugang.benutzer } : zugang.benutzer,
    to: empfaenger,
    subject: titel,
    text: inhaltText,
    headers: {}
  }
  if (inhaltHtml.trim()) mail.html = inhaltHtml
  // Nur Anhänge, auf die das HTML auch zeigt — ein ungenutztes Bild hinge sonst sichtbar
  // an der Mail. Ohne HTML-Teil gibt es nichts zum Einbetten.
  const eingebettet = (Array.isArray(anhaenge) ? anhaenge : []).filter((a) => a?.cid && a.content && inhaltHtml.includes(`cid:${a.cid}`))
  if (eingebettet.length) mail.attachments = eingebettet
  if (zugang.antwortAn) mail.replyTo = zugang.antwortAn
  if (art === 'kampagne') {
    // mailto statt https: ein Link bräuchte einen erreichbaren Server, den es lokal nicht gibt
    mail.headers['List-Unsubscribe'] = `<mailto:${abmelden}?subject=Abmeldung>`
  }
  return { ok: true, mail }
}

module.exports = { mailBauen, textAusHtml }
