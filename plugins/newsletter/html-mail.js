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

const { huelle, inhaltAus, kopfZeile, BAUSTEINE, STANDARD_FARBEN, SCHRIFT, BREITE, maskieren } = require('./bausteine.js')

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
// Rahmen mitbringt und in das nur noch Abmeldelink, Pflichtlinks und Impressum müssen.
function fussTabelle({ abmeldeAdresse, abmeldeText, impressum, farben, marke = {} }) {
  const zeile = BAUSTEINE.fuss({ abmeldeAdresse, abmeldeText, impressum, farben, marke })
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
  const fuss = BAUSTEINE.fuss({ abmeldeAdresse, impressum: marke.impressum, farben, marke })

  if (rahmen) {
    // Im Vendo-Rahmen setzt Vendo den Kopf davor — aus den Markenangaben, wie den Fuß
    // dahinter. Der Inhalt im Feld ist dann wirklich nur noch der Inhalt.
    const kopf = kopfZeile(marke, farben)
    const inhalt = istDokument(gesaeubert.html) ? koerperAus(gesaeubert.html) : gesaeubert.html
    const zeile = `<tr><td style="padding:0;background-color:${farben.flaeche};">${inhalt}</td></tr>`
    return {
      ...gesaeubert,
      html: huelle(`${kopf ? `${kopf}\n      ` : ''}${zeile}\n      ${fuss}`, { farben, titel: marke.titel, vorschauText })
    }
  }

  // Ohne Vendo-Rahmen bleibt ein fremdes Mailing, wie es ist: es bringt seinen eigenen Kopf
  // mit, ein zweiter stünde doppelt da. Nur der Fuß kommt dazu — den verlangt das Gesetz.
  const fussBlock = fussTabelle({ abmeldeAdresse, impressum: marke.impressum, farben, marke })
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
//
// Geprüft wird jedes `<img>`, auch eines **ganz ohne** `src`. Vorher sah die Prüfung nur
// Bilder an, die überhaupt eine Adresse hatten — ein Gerüst mit `<img alt="Produkt 1" />`
// kam dadurch bis in die Vorschau durch und zeigte dort ein kaputtes Bild.
function bilderOhneAdresse(html) {
  return [...String(html ?? '').matchAll(/<img\b[^>]*>/gi)]
    .map((t) => {
      const treffer = t[0].match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
      return treffer ? (treffer[2] ?? treffer[3] ?? treffer[4] ?? '').trim() : ''
    })
    .filter((src) => !/^(https:\/\/[^\s{}]+|cid:\S+|data:image\/[a-z+]+;base64,)/i.test(src))
}

// Knöpfe und Links, die nirgendwo hinführen: kein `href`, ein leeres `href` oder nur `#`.
// In einer Kampagne ist das ein toter Knopf — der Empfänger klickt und nichts passiert.
// `mailto:` und `tel:` sind erlaubte Ziele, `{{warenkorbLink}}` auch (den setzt Vendo ein).
function linksOhneZiel(html) {
  const tot = []
  for (const t of String(html ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const treffer = t[0].match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const ziel = treffer ? (treffer[2] ?? treffer[3] ?? treffer[4] ?? '').trim() : ''
    if (ziel && ziel !== '#') continue
    const text = nurText(t[1]).slice(0, 40)
    tot.push(text || '(ohne Text)')
  }
  return [...new Set(tot)]
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

// ── UTM-Parameter ──
// Vendo-Mails sind eigenes HTML. Ohne UTM-Parameter ordnet Shopify Analytics die Besuche
// keiner Mail zu (bei Felix im September an einem Custom-Liquid-Newsletter nachgewiesen:
// 2,2 % Klicks, 0 Sitzungen), und Vendo misst selbst keine Klicks. Darum hängt Vendo beim
// Bauen jeder Kampagnen- und Automationsmail an jeden Link in den eigenen Shop
// utm_source=vendo, utm_medium=email und utm_campaign=<Kurzname> an. Andere Adressen,
// mailto-Links, Platzhalter wie {{warenkorbLink}} und Links, die schon utm_source tragen,
// bleiben unberührt.
const UTM_QUELLE = 'vendo'
const UTM_MEDIUM = 'email'

// Aus einem Kampagnennamen ein Kurzname: klein, ohne Umlaute, Bindestriche statt Leerzeichen
function utmName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

function utmAnhaengen(html, { hosts = [], kampagne = '' } = {}) {
  const name = utmName(kampagne)
  const erlaubt = new Set((hosts || []).map((h) => String(h).toLowerCase()))
  if (!name || !erlaubt.size) return String(html ?? '')
  return String(html ?? '').replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi, (ganz, vor, zeichen, adresse) => {
    const roh = adresse.replace(/&amp;/gi, '&').trim()
    let ziel
    try {
      ziel = new URL(roh)
    } catch {
      return ganz // Platzhalter, relative Adressen, mailto: nicht anfassen
    }
    if (!/^https?:$/.test(ziel.protocol) || !erlaubt.has(ziel.host.toLowerCase())) return ganz
    if (/[?&]utm_source=/i.test(roh)) return ganz
    const [vorAnker, ...anker] = adresse.split('#')
    const trenner = vorAnker.includes('?') ? '&amp;' : '?'
    const neu = `${vorAnker}${trenner}utm_source=${UTM_QUELLE}&amp;utm_medium=${UTM_MEDIUM}&amp;utm_campaign=${name}${anker.length ? `#${anker.join('#')}` : ''}`
    return `${vor}${zeichen}${neu}${zeichen}`
  })
}

// ── Hausregeln für Texte (Felix' Markenstimme) ──
// Was eine Maschine sicher erkennen kann, prüft Vendo selbst, statt sich darauf zu
// verlassen, dass eine KI ihre Regeln liest: Gedankenstriche („dumme KI-Gedankenstriche“)
// und die Floskeln der Vermeiden-Liste samt falscher Dringlichkeit. Quelle ist Felix'
// Hausregel-Datei voice.md im Text-Skill der Newsletter-Texterin (Stand 2026-11-12); wird
// die Liste dort geändert, hier nachziehen. Ob ein Satz in jeder beliebigen Mail stehen
// könnte, prüft nur ein Mensch oder die KI selbst.
const FLOSKELN = [
  [/\bverpasse?\s+(es\s+)?nicht\b/i, 'Verpasse nicht …'],
  [/\bjetzt\s+zuschlagen\b/i, 'Jetzt zuschlagen'],
  [/\bexklusiv\w*\s+angebot/i, 'Exklusives Angebot'],
  [/\bnur\s+f(ü|ue)r\s+dich\b/i, 'nur für dich'],
  [/\blimitierte\s+zeit\b/i, 'Limitierte Zeit'],
  [/\bletzte\s+chance\b/i, 'letzte Chance'],
  [/\bnur\s+(noch\s+)?heute\b/i, 'nur heute'],
  [/\bl(ä|ae)uft\s+(bald\s+)?ab\b/i, 'läuft ab'],
  [/\bliebe\s+kundin\b|\blieber\s+kunde\b/i, 'Liebe Kundin, lieber Kunde'],
  [/\btauche?\s+ein\s+in\b/i, 'Tauche ein in …'],
  [/\bentdecke\s+die\s+welt\b/i, 'Entdecke die Welt von …'],
  [/\bin\s+der\s+heutigen\s+zeit\b/i, 'In der heutigen Zeit'],
  [/\bwir\s+freuen\s+uns,?\s+(dir|euch|ihnen)\s+mitteilen/i, 'Wir freuen uns, dir mitteilen zu können']
]
const STRICH = /[–—]/

// `teile`: { betreff, vorschauText, html }. `ausnahmen`: Texte, die so bleiben müssen, wie
// sie sind — Produktnamen aus dem Shop enthalten selbst manchmal einen Gedankenstrich.
// Namen in Elementen mit data-feld="…name…" gelten immer als Ausnahme.
function hausregelVerstoesse({ betreff = '', vorschauText = '', html = '' } = {}, { ausnahmen = [] } = {}) {
  const namen = [...String(html).matchAll(/<[^>]*\bdata-feld\s*=\s*"[^"]*name[^"]*"[^>]*>([^<]+)</gi)].map((t) => t[1].trim())
  const frei = [...namen, ...ausnahmen].map((x) => String(x || '').trim()).filter((x) => x.length > 2).sort((a, b) => b.length - a.length)
  const ohneAusnahmen = (text) => frei.reduce((t, a) => t.split(a).join(' '), String(text))
  const stellen = [
    ['Betreff', ohneAusnahmen(betreff)],
    ['Vorschautext', ohneAusnahmen(vorschauText)],
    ['Text', ohneAusnahmen(nurText(html))]
  ]
  const verstoesse = []
  const striche = []
  for (const [wo, text] of stellen) {
    for (const t of text.matchAll(/[^–—]{0,25}[–—][^–—]{0,25}/g)) striche.push(`${wo}: „${t[0].trim()}“`)
  }
  if (striche.length) {
    verstoesse.push(`Gedankenstriche (– oder —) sind nach Felix' Hausregeln verboten, ${striche.length}× gefunden: ${striche.slice(0, 4).join('; ')}. Durch Punkt oder Komma ersetzen. Produktnamen aus dem Shop bleiben, wie sie sind.`)
  }
  const floskeln = new Set()
  for (const [, text] of stellen) for (const [muster, name] of FLOSKELN) if (muster.test(text)) floskeln.add(name)
  if (/^\s*willkommen\s+bei\s+[^.!?]{1,40}[.!?]?\s*$/i.test(betreff)) floskeln.add('„Willkommen bei …“ als ganzer Betreff')
  if (floskeln.size) {
    verstoesse.push(`Floskeln aus Felix' Vermeiden-Liste: ${[...floskeln].join(', ')}. Direkt und konkret sagen, was da ist; Dringlichkeit nur mit echtem Datum.`)
  }
  return verstoesse
}

// Produkte, die nur mit Name und Preis dastehen. Felix' Beobachtung am Handy-Bild: die KI
// beschreibt das Produkt nicht. Jedes Produkt mit einem Feld produktN_name braucht ein
// Feld produktN_text mit mindestens PRODUKTTEXT_MIN Zeichen Text. Ohne markierte Namen
// (frei gebautes HTML) wird nichts geprüft — lieber still als falsch.
const PRODUKTTEXT_MIN = 40
function produkteOhneText(html) {
  const text = String(html ?? '')
  const inhaltVon = (feld) => {
    const auf = text.match(new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bdata-feld\\s*=\\s*"${feld}"[^>]*>`, 'i'))
    if (!auf) return null
    const rest = text.slice(auf.index + auf[0].length)
    const ende = rest.search(new RegExp(`</${auf[1]}\\s*>`, 'i'))
    return nurText(ende >= 0 ? rest.slice(0, ende) : rest)
  }
  const nummern = [...new Set([...text.matchAll(/\bdata-feld\s*=\s*"produkt(\d+)_name"/gi)].map((t) => t[1]))]
  return nummern.filter((nr) => (inhaltVon(`produkt${nr}_text`) || '').trim().length < PRODUKTTEXT_MIN).map((nr) => `produkt${nr}`)
}

// Zellen, die neben einer anderen stehen und auf dem Handy nicht umbrechen: eine Breite
// von 20 bis 80 % (oder 120 bis 480 px) ohne die Klasse „spalte“, die Vendos Handy-Stil
// (bausteine.js, HANDY_STIL) untereinander setzt. Gibt die Zahl solcher Zellen zurück.
function starreSpalten(html) {
  let anzahl = 0
  for (const [tag] of String(html ?? '').matchAll(/<td\b[^>]*>/gi)) {
    if (/\bclass\s*=\s*["'][^"']*\bspalte\b/i.test(tag)) continue
    const prozent = Number((tag.match(/\swidth\s*=\s*["']?(\d+)%/i) || tag.match(/[\s;"']width\s*:\s*(\d+)%/i) || [])[1])
    const pixel = Number((tag.match(/\swidth\s*=\s*["']?(\d+)["'\s>]/i) || [])[1])
    if ((prozent >= 20 && prozent <= 80) || (pixel >= 120 && pixel <= 480)) anzahl += 1
  }
  return anzahl
}

// Wie sehr der Aufbau einer Mail dem eines Musters gleicht, von 0 bis 1. Verglichen wird
// nur die Folge der Elemente (table, tr, td, h1, img, a …), nicht Texte, Adressen oder
// Stile: wer im Muster nur Namen, Preise, Bilder und Links tauscht, kommt auf 1.
// Gemessen über die längste gemeinsame Teilfolge, also unempfindlich dagegen, ob ein
// Abschnitt vorne oder hinten dazukommt.
function aufbauAehnlichkeit(html, musterHtml) {
  const folge = (text) => (String(text ?? '').replace(/<!--[\s\S]*?-->/g, '').match(/<\/?[a-z][a-z0-9]*/gi) || []).map((t) => t.toLowerCase())
  const a = folge(html)
  const b = folge(musterHtml)
  if (!a.length || !b.length) return 0
  if (a.length > 4000 || b.length > 4000) return 0 // so große Mails baut niemand aus einem Muster
  let vorher = new Uint16Array(b.length + 1)
  let jetzt = new Uint16Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = a[i - 1] === b[j - 1] ? vorher[j - 1] + 1 : Math.max(vorher[j], jetzt[j - 1])
    }
    ;[vorher, jetzt] = [jetzt, vorher]
  }
  return (2 * vorher[b.length]) / (a.length + b.length)
}

// Startpunkt einer neuen Vorlage: das Gerüst mit markierten Feldern und Anweisungen. Der
// Gruß ist fest, alles dazwischen wird pro Kampagne neu geschrieben. Kein Logo: Kopf und
// Fuß setzt Vendo beim Bauen der Mail aus den Markenangaben davor und dahinter.
function startVorlageHtml({ marke = {} } = {}) {
  const f = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const schrift = `font-family:${SCHRIFT};`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
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

module.exports = { htmlSaeubern, mailAusHtml, htmlAusBausteinen, beispielHtml, hatInhalt, istDokument, koerperAus, fussTabelle, fremdePlatzhalter, bilderOhneAdresse, linksOhneZiel, felderLesen, feldMarkenEntfernen, unveraendertAusVorlage, aufbauAehnlichkeit, starreSpalten, hausregelVerstoesse, FLOSKELN, produkteOhneText, PRODUKTTEXT_MIN, utmName, utmAnhaengen, nurText, startVorlageHtml, PLATZHALTER_BASIS, PLATZHALTER_WARENKORB, MAX_HTML }
