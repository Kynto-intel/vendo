'use strict'
// Newsletter-Plugin: eigenes HTML als Mailinhalt.
//
// bausteine.js erklärt, warum die Bausteine der sichere Weg sind: E-Mail-HTML ist
// Tabellen-Layout mit Inline-CSS, und was im Browser gut aussieht, fällt in Outlook
// auseinander. Dieser Modus hier ist der andere Weg — für fertiges HTML aus einem
// Baukasten, von einer Agentur oder von Hand geschrieben, das genau so raus soll.
//
// Was auch hier nicht verhandelbar ist:
//   - Skripte, Rahmen, eingebettete Objekte und Ereignis-Attribute fliegen raus. Mailprogramme
//     werfen sie ohnehin weg; die Vorschau in Vendo soll sie gar nicht erst ausführen.
//   - Der Fuß mit Abmeldelink und Impressum wird immer angehängt. Ohne ihn baut mail.js
//     keine Kampagnenmail, und das ist richtig so.
//   - Eingesetzte Platzhalterwerte werden maskiert (siehe personalisierenHtml in
//     kampagnen.js): ein Nachname mit spitzer Klammer darf das Markup nicht aufbrechen.

const { huelle, inhaltAus, BAUSTEINE, STANDARD_FARBEN, SCHRIFT, BREITE, maskieren } = require('./bausteine.js')

const MAX_HTML = 200000

// Elemente, die in einer Mail nichts zu suchen haben und samt Inhalt verschwinden.
// `form` und seine Felder sind dabei, weil kein verbreitetes Mailprogramm sie absendet —
// ein Formular in der Mail weckt nur eine Erwartung, die niemand einlöst.
const RAUS_MIT_INHALT = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'form', 'svg', 'math']
// Leere Elemente, die nur als einzelnes Tag vorkommen
const RAUS_EINZELN = ['base', 'link', 'input', 'textarea', 'select', 'button', 'option']

const nennen = {
  script: 'Skripte',
  iframe: 'eingebettete Rahmen',
  frame: 'eingebettete Rahmen',
  frameset: 'eingebettete Rahmen',
  object: 'eingebettete Objekte',
  embed: 'eingebettete Objekte',
  applet: 'eingebettete Objekte',
  noscript: 'noscript-Blöcke',
  form: 'Formulare',
  svg: 'SVG-Grafiken',
  math: 'Formeln',
  base: 'base-Angaben',
  link: 'verlinkte Stylesheets',
  input: 'Formularfelder',
  textarea: 'Formularfelder',
  select: 'Formularfelder',
  button: 'Formularfelder',
  option: 'Formularfelder',
  ereignis: 'Ereignis-Attribute (onclick und ähnliche)',
  adresse: 'Adressen, die kein http, https, mailto oder Bild sind',
  weiterleitung: 'automatische Weiterleitungen'
}

// Eine Liste von Namen in einen Satz gießen, ohne Dopplungen
function hinweisSatz(gefunden) {
  const namen = [...new Set(gefunden.map((g) => nennen[g] || g))]
  if (!namen.length) return ''
  const letzte = namen.pop()
  return namen.length ? `Entfernt: ${namen.join(', ')} und ${letzte}.` : `Entfernt: ${letzte}.`
}

// Das Säubern. Absichtlich eine Positivliste bei Adressen und eine Negativliste bei
// Elementen: alles andere bleibt, damit fremdes Mail-HTML nicht zerfällt.
// Outlooks Bedingungskommentare (`<!--[if mso]>`) bleiben erhalten — ohne sie sieht
// manches gekaufte Template in Outlook anders aus als gedacht.
function htmlSaeubern(roh) {
  const entfernt = []
  let html = String(roh ?? '').slice(0, MAX_HTML)

  for (const tag of RAUS_MIT_INHALT) {
    const mitInhalt = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
    const alleinstehend = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
    for (const muster of [mitInhalt, alleinstehend]) {
      html = html.replace(muster, () => {
        entfernt.push(tag)
        return ''
      })
    }
  }

  for (const tag of RAUS_EINZELN) {
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), () => {
      entfernt.push(tag)
      return ''
    })
  }

  // meta bleibt (Zeichensatz!), nur die automatische Weiterleitung fliegt raus
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, () => {
    entfernt.push('weiterleitung')
    return ''
  })

  // Ereignis-Attribute: onclick, onload, onerror …
  html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
    entfernt.push('ereignis')
    return ''
  })
  html = html.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
    entfernt.push('ereignis')
    return ''
  })

  // Adressen in Attributen: nur http(s), mailto, cid und eingebettete Bilder.
  // Damit sind javascript:, vbscript: und data:text/html draußen.
  html = html.replace(/\s(href|src|background|action|formaction|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (ganz, attribut, _roh, a, b, c) => {
    const wert = (a ?? b ?? c ?? '').trim()
    if (!wert) return ganz
    if (/^(https?:|mailto:|tel:|cid:|#)/i.test(wert)) return ganz
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(wert)) return ganz
    if (/^[^a-z]*[a-z0-9._/-]+\.[a-z]{2,}(\/|$|\?)/i.test(wert) && !wert.includes(':')) return ganz // relative Pfade
    entfernt.push('adresse')
    // Links werden zu "#" (klickbar, führt nirgends hin). Bildadressen werden leer: "#"
    // würde der Browser zur Adresse der Seite selbst auflösen und zu laden versuchen.
    return /^(src|background|poster)$/i.test(attribut) ? ` ${attribut}=""` : ` ${attribut}="#"`
  })

  // In <style> gehört kein expression() und kein @import von außen
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (ganz, inhalt) => {
    if (!/expression\s*\(|@import|javascript:/i.test(inhalt)) return ganz
    entfernt.push('adresse')
    return ganz.replace(/expression\s*\([^)]*\)/gi, '').replace(/@import[^;]*;/gi, '').replace(/javascript:/gi, '')
  })

  return { html, entfernt, hinweis: hinweisSatz(entfernt) }
}

// Steht da ein ganzes Dokument oder ein Stück Inhalt?
const istDokument = (html) => /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)

// Aus einem ganzen Dokument den Rumpf herausholen — für den Fall, dass jemand ein
// vollständiges Dokument in den Vendo-Rahmen legt.
function koerperAus(html) {
  const treffer = String(html).match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
  if (treffer) return treffer[1]
  // Kopfbereich ohne body: alles vor </head> ist kein Inhalt
  return String(html).replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html\b[^>]*>/gi, '').replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
}

// Der Fuß als eigenständige Tabelle — für ein fremdes Dokument, das seinen eigenen
// Rahmen mitbringt und in das nur noch Abmeldelink und Impressum müssen.
function fussTabelle({ abmeldeAdresse, abmeldeText, impressum, farben }) {
  const zeile = BAUSTEINE.fuss({ abmeldeAdresse, abmeldeText, impressum, farben })
  // Breite wie in der Hülle: 100 % mit absoluter Höchstbreite, damit der Fuß auf dem Handy
  // mitgeht (Begründung steht bei `huelle` in bausteine.js).
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${farben.hintergrund};">
  <tr><td align="center" style="padding:0 12px 24px;">
    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BREITE}"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:${BREITE}px;margin:0 auto;background-color:${farben.flaeche};">
      ${zeile}
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>`
}

// Eine Mail aus eigenem HTML bauen.
//   rahmen = true   → der Inhalt kommt in Vendos 600-px-Fläche, Fuß als letzte Zeile.
//   rahmen = false  → das eigene Dokument bleibt, wie es ist; der Fuß wird vor </body> gesetzt.
// Rückgabe enthält neben dem HTML auch, was gesäubert wurde — die Oberfläche sagt es an.
function mailAusHtml(roh, { marke = {}, abmeldeAdresse = '', vorschauText = '', rahmen = true } = {}) {
  const farben = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const gesaeubert = htmlSaeubern(roh)
  gesaeubert.html = feldMarkenEntfernen(gesaeubert.html)
  const fuss = BAUSTEINE.fuss({ abmeldeAdresse, impressum: marke.impressum, farben })

  if (rahmen) {
    const inhalt = istDokument(gesaeubert.html) ? koerperAus(gesaeubert.html) : gesaeubert.html
    const zeile = `<tr><td style="padding:0;background-color:${farben.flaeche};">${inhalt}</td></tr>`
    return { ...gesaeubert, html: huelle(`${zeile}\n      ${fuss}`, { farben, titel: marke.titel, vorschauText }) }
  }

  const fussBlock = fussTabelle({ abmeldeAdresse, impressum: marke.impressum, farben })
  const vorschau = vorschauText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${maskieren(vorschauText)}</div>` : ''

  if (!istDokument(gesaeubert.html)) {
    // Kein ganzes Dokument, aber auch kein Vendo-Rahmen gewünscht: das Nötigste drumherum,
    // sonst ist es kein gültiges Dokument und manche Programme zeigen Quelltext.
    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${maskieren(marke.titel || '')}</title>
</head>
<body style="margin:0;padding:0;background-color:${farben.hintergrund};">
${vorschau}
${gesaeubert.html}
${fussBlock}
</body>
</html>`
    return { ...gesaeubert, html }
  }

  let html = gesaeubert.html
  if (vorschau) {
    html = /<body\b[^>]*>/i.test(html) ? html.replace(/(<body\b[^>]*>)/i, `$1\n${vorschau}`) : `${vorschau}\n${html}`
  }
  html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${fussBlock}\n</body>`) : `${html}\n${fussBlock}`
  return { ...gesaeubert, html }
}

// Der Startpunkt im HTML-Modus: die Bausteine der Kampagne als Quelltext, damit niemand
// vor einem leeren Feld sitzt und das Tabellen-Layout von Hand nachbaut.
function htmlAusBausteinen(bausteine, { marke = {} } = {}) {
  return inhaltAus(bausteine, { marke })
}

// Ein Beispiel für den, der bei null anfängt: Kopfzeile, Text, Knopf — alles so gebaut,
// dass Outlook es verträgt (Tabellen, Inline-CSS, keine Hintergrundbilder).
function beispielHtml({ marke = {} } = {}) {
  const farben = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td style="padding:28px 32px 10px;">
      <h1 style="margin:0;font-family:${SCHRIFT};font-size:24px;line-height:1.3;color:${farben.text};">
        Hallo {{vorname}},
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 0;font-family:${SCHRIFT};font-size:16px;line-height:1.6;color:${farben.text};">
      <p style="margin:0 0 14px;">Hier steht der erste Absatz.</p>
      <p style="margin:0 0 14px;">Und hier der zweite.</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:14px 32px 30px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="${farben.akzent}" style="padding:14px 28px;">
            <a href="https://" style="font-family:${SCHRIFT};font-size:16px;font-weight:600;color:${farben.aufAkzent};text-decoration:none;display:inline-block;">Zum Shop</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

// Platzhalter, die Vendo beim Versand ersetzt. Alles andere in {{ }} käme wörtlich bei den
// Empfängern an — „Hallo {{headline}}“ in 820 Postfächern. Deshalb wird es vor dem Versand
// gesperrt (kampagnePruefen, automationPruefen), nicht nur angezeigt.
const PLATZHALTER_BASIS = ['vorname', 'nachname', 'name', 'email']
const PLATZHALTER_WARENKORB = ['warenkorb', 'warenkorbLink', 'summe']

function fremdePlatzhalter(text, erlaubt = PLATZHALTER_BASIS) {
  const bekannt = erlaubt.map((n) => n.toLowerCase())
  const gefunden = [...String(text ?? '').matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((t) => t[1])
  return [...new Set(gefunden.filter((n) => !bekannt.includes(n.toLowerCase())))].map((n) => `{{${n}}}`)
}

// Bilder, deren Adresse beim Empfänger nicht laden kann: leer, ein Platzhalter, ein
// relativer Pfad oder http statt https.
function bilderOhneAdresse(html) {
  return [...String(html ?? '').matchAll(/<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map((t) => (t[2] ?? t[3] ?? t[4] ?? '').trim())
    .filter((src) => !/^(https:\/\/[^\s{}]+|cid:\S+|data:image\/[a-z+]+;base64,)/i.test(src))
}

// ── Felder einer Vorlage ──
// Eine Vorlage ist keine fertige Mail: jede Stelle, die pro Kampagne neu geschrieben wird,
// trägt data-feld="name" und optional data-feld-hinweis="was hier hinkommt". Die Vorlage
// zeigt dort Beispielinhalt, damit sie in der Vorschau wie eine echte Mail aussieht. Felder
// gehören an das innerste Element (h1, p, a, img, span, td mit Text), nicht um ganze
// Tabellen — dann lässt sich ihr Inhalt verlässlich lesen.

const nurText = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()

function felderLesen(html) {
  const text = String(html ?? '')
  const felder = []
  for (const t of text.matchAll(/<([a-z][a-z0-9]*)\b([^>]*?\sdata-feld\s*=\s*"([^"]+)"[^>]*)>/gi)) {
    const [ganz, tag, attribute, name] = t
    const hinweis = (attribute.match(/\sdata-feld-hinweis\s*=\s*"([^"]*)"/i) || [])[1] || ''
    if (tag.toLowerCase() === 'img') {
      felder.push({ name, hinweis, art: 'bild', beispiel: (attribute.match(/\ssrc\s*=\s*"([^"]*)"/i) || [])[1] || '' })
      continue
    }
    const ab = t.index + ganz.length
    const ende = text.slice(ab).search(new RegExp(`</${tag}\\s*>`, 'i'))
    const innen = ende >= 0 ? text.slice(ab, ab + ende) : ''
    const link = tag.toLowerCase() === 'a' ? (attribute.match(/\shref\s*=\s*"([^"]*)"/i) || [])[1] || '' : ''
    felder.push({ name, hinweis, art: link ? 'link' : 'text', beispiel: nurText(innen), ...(link ? { link } : {}) })
  }
  return felder
}

// Die Feld-Markierungen sind Arbeitshilfen für den Editor und die KI. In der Mail beim
// Empfänger haben sie nichts zu suchen: der Hinweistext stünde sonst im Quelltext jeder Mail.
function feldMarkenEntfernen(html) {
  return String(html ?? '').replace(/\sdata-feld(?:-hinweis)?\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

// Was aus der Vorlage noch unverändert in der Kampagne steht. Kurze Texte wie „Zum Shop“
// dürfen bleiben; längere Beispieltexte und Beispielbilder nicht.
function unveraendertAusVorlage(html, beispiele = []) {
  const kampagneText = nurText(html)
  const kampagneRoh = String(html ?? '')
  return (Array.isArray(beispiele) ? beispiele : []).filter((b) => {
    if (b.art === 'bild') return b.beispiel && kampagneRoh.includes(b.beispiel)
    return b.beispiel && b.beispiel.length >= 15 && kampagneText.includes(b.beispiel)
  })
}

// Startpunkt einer neuen Vorlage: das Gerüst mit markierten Feldern und Anweisungen. Logo
// und Gruß sind fest, alles dazwischen wird pro Kampagne neu geschrieben.
function startVorlageHtml({ marke = {} } = {}) {
  const f = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const schrift = `font-family:${SCHRIFT};`
  const logo = /^https:\/\//i.test(marke.logo || '')
    ? `<img src="${maskieren(marke.logo)}" width="180" alt="${maskieren(marke.titel || '')}" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;" />`
    : `<div style="${schrift}font-size:24px;letter-spacing:0.08em;text-transform:uppercase;color:${f.text};">${maskieren(marke.titel || '')}</div>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td align="center" style="padding:28px 32px 8px;">${logo}</td>
  </tr>
  <tr>
    <td style="padding:20px 32px 6px;">
      <h1 data-feld="ueberschrift" data-feld-hinweis="Kurz und kraftvoll, höchstens sechs Wörter" style="margin:0;${schrift}font-size:26px;line-height:1.25;color:${f.text};">Der Sturm ist da</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 0;${schrift}font-size:16px;line-height:1.6;color:${f.text};">
      <p data-feld="einleitung" data-feld-hinweis="Zwei bis drei Sätze: worum es geht und warum es sich lohnt" style="margin:0 0 14px;">Zwei neue Motive aus schwerer Baumwolle, gemacht für Tage, an denen du nicht klein beigibst.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:10px 32px 0;">
      <img data-feld="hauptbild" data-feld-hinweis="Produktbild aus dem Shop (cdn.shopify.com)" src="" width="536" alt="" style="display:block;width:100%;max-width:536px;height:auto;border:0;" />
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;${schrift}">
      <div data-feld="produktname" data-feld-hinweis="Name des Produkts genau wie im Shop" style="font-size:19px;font-weight:600;color:${f.text};">Produktname</div>
      <div data-feld="produktpreis" data-feld-hinweis="Preis genau wie im Shop" style="font-size:16px;color:${f.leise};margin-top:4px;">00,00 €</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:18px 32px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="${f.akzent}" style="padding:14px 28px;">
            <a data-feld="knopf" data-feld-hinweis="Adresse der Produktseite aus dem Shop, Text kurz" href="" style="${schrift}font-size:16px;font-weight:600;color:${f.aufAkzent};text-decoration:none;display:inline-block;">Zum Produkt</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 32px 28px;${schrift}font-size:16px;line-height:1.6;color:${f.text};">
      <p data-feld="schluss" data-feld-hinweis="Ein Satz zum Abschluss, ruhig und bestimmt" style="margin:0 0 14px;">Bleib unbeugsam.</p>
      <p style="margin:0;">Felix<br />${maskieren(marke.titel || '')}</p>
    </td>
  </tr>
</table>`
}

// Hat das HTML überhaupt etwas Sichtbares? Ein Feld voller Kommentare ist kein Inhalt.
function hatInhalt(html) {
  const ohne = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  if (/<img\b[^>]*src\s*=\s*["']?[^"'>\s]+/i.test(ohne)) return true
  return ohne.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0
}

module.exports = { htmlSaeubern, mailAusHtml, htmlAusBausteinen, beispielHtml, hatInhalt, istDokument, koerperAus, fussTabelle, fremdePlatzhalter, bilderOhneAdresse, felderLesen, feldMarkenEntfernen, unveraendertAusVorlage, nurText, startVorlageHtml, PLATZHALTER_BASIS, PLATZHALTER_WARENKORB, MAX_HTML }
