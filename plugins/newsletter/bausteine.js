'use strict'
// Newsletter-Plugin: Bausteine für das Mail-HTML.
//
// Warum Bausteine und nicht freies HTML: E-Mail-HTML ist Tabellen-Layout mit Inline-CSS aus
// der Steinzeit. Outlook rendert mit Word, kennt kein Flexbox, kein Grid, keine
// Hintergrundbilder und ignoriert oft ganze <style>-Blöcke. Ein Modell, das „einen schönen
// Newsletter in HTML“ schreibt, liefert etwas, das im Browser gut aussieht und in Outlook
// auseinanderfällt. Deshalb: hier liegen geprüfte Schnipsel, und die KI entscheidet nur über
// Reihenfolge und Inhalt.
//
// Regeln, die diese Datei einhält:
//   - Nur Tabellen, Breite 600 px, alles Inline-CSS.
//   - Keine externen Stylesheets, keine Schriften von außen, kein JavaScript.
//   - Jeder Text wird maskiert: Inhalte kommen aus Shopify, aus der KI oder von Hand und
//     dürfen das Markup nicht aufbrechen.
//   - Der Fuß trägt immer Abmeldelink und Impressum. Ohne die geht keine Kampagne raus
//     (mail.js prüft das zusätzlich).

const BREITE = 600

const STANDARD_FARBEN = {
  hintergrund: '#f4f2ee',
  flaeche: '#ffffff',
  text: '#23201c',
  leise: '#6b6560',
  akzent: '#8a6a3b',
  aufAkzent: '#ffffff',
  linie: '#e2ddd5'
}

const SCHRIFT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Alles, was in das HTML wandert, wird maskiert
function m(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Adressen in Attributen: nur http(s) und mailto, sonst leer. Verhindert javascript:-Links.
function url(wert) {
  const text = String(wert ?? '').trim()
  if (!/^(https?:\/\/|mailto:)/i.test(text)) return ''
  return m(text)
}

// Zeilenumbrüche in Absätze, dazwischen nichts anderes erlauben
function absaetze(text, farben) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((teil) => teil.trim())
    .filter(Boolean)
    .map(
      (teil) =>
        `<p style="margin:0 0 14px;font-family:${SCHRIFT};font-size:16px;line-height:1.6;color:${farben.text};">${m(teil).replace(/\n/g, '<br />')}</p>`
    )
    .join('')
}

const zelle = (inhalt, { farben, polsterung = '24px 32px' }) =>
  `<tr><td style="padding:${polsterung};background-color:${farben.flaeche};">${inhalt}</td></tr>`

// ── Die Bausteine ──
// Jeder bekommt seine Angaben als Objekt und gibt Tabellenzeilen zurück.

const BAUSTEINE = {
  // Kopf mit Logo (Bild-URL) oder, wenn keines da ist, mit dem Namen als Schriftzug
  kopf({ logo, logoBreite = 180, titel, farben }) {
    const bild = url(logo)
    const inhalt = bild
      ? `<img src="${bild}" width="${Number(logoBreite) || 180}" alt="${m(titel || '')}" style="display:block;margin:0 auto;border:0;max-width:100%;height:auto;" />`
      : `<div style="font-family:${SCHRIFT};font-size:26px;letter-spacing:0.08em;text-transform:uppercase;color:${farben.text};text-align:center;">${m(titel || '')}</div>`
    return zelle(inhalt, { farben, polsterung: '28px 32px 18px' })
  },

  // Überschrift
  titel({ text, farben }) {
    return zelle(
      `<h1 style="margin:0;font-family:${SCHRIFT};font-size:24px;line-height:1.3;color:${farben.text};font-weight:600;">${m(text || '')}</h1>`,
      { farben, polsterung: '8px 32px 0' }
    )
  },

  // Fließtext, Absätze durch Leerzeilen getrennt
  text({ text, farben }) {
    return zelle(absaetze(text, farben), { farben, polsterung: '18px 32px 4px' })
  },

  // Bild, optional verlinkt
  bild({ quelle, link, alt, farben }) {
    const bild = url(quelle)
    if (!bild) return ''
    const img = `<img src="${bild}" width="${BREITE - 64}" alt="${m(alt || '')}" style="display:block;width:100%;max-width:${BREITE - 64}px;height:auto;border:0;" />`
    const ziel = url(link)
    return zelle(ziel ? `<a href="${ziel}" style="text-decoration:none;">${img}</a>` : img, { farben, polsterung: '18px 32px' })
  },

  // Knopf. Für Outlook mit festem Rahmen statt border-radius, das versteht Word nicht.
  knopf({ text, link, farben }) {
    const ziel = url(link)
    if (!ziel || !text) return ''
    return zelle(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td align="center" bgcolor="${farben.akzent}" style="padding:14px 28px;">
          <a href="${ziel}" style="font-family:${SCHRIFT};font-size:16px;font-weight:600;color:${farben.aufAkzent};text-decoration:none;display:inline-block;">${m(text)}</a>
        </td></tr>
      </table>`,
      { farben, polsterung: '10px 32px 24px' }
    )
  },

  // Produkt: Bild, Name, Preis, Knopf — der Block, der im Shop-Newsletter am meisten zählt
  produkt({ bild, titel, beschreibung, preis, link, knopfText = 'Ansehen', farben }) {
    const quelle = url(bild)
    const ziel = url(link)
    const teile = []
    if (quelle) {
      const img = `<img src="${quelle}" width="${BREITE - 64}" alt="${m(titel || '')}" style="display:block;width:100%;max-width:${BREITE - 64}px;height:auto;border:0;margin-bottom:14px;" />`
      teile.push(ziel ? `<a href="${ziel}" style="text-decoration:none;">${img}</a>` : img)
    }
    if (titel) teile.push(`<div style="font-family:${SCHRIFT};font-size:19px;font-weight:600;color:${farben.text};margin-bottom:6px;">${m(titel)}</div>`)
    if (beschreibung) teile.push(`<div style="font-family:${SCHRIFT};font-size:15px;line-height:1.55;color:${farben.leise};margin-bottom:8px;">${m(beschreibung)}</div>`)
    if (preis) teile.push(`<div style="font-family:${SCHRIFT};font-size:17px;font-weight:600;color:${farben.text};margin-bottom:14px;">${m(preis)}</div>`)
    if (ziel && knopfText) {
      teile.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${farben.akzent}" style="padding:12px 22px;">
        <a href="${ziel}" style="font-family:${SCHRIFT};font-size:15px;font-weight:600;color:${farben.aufAkzent};text-decoration:none;display:inline-block;">${m(knopfText)}</a>
      </td></tr></table>`)
    }
    if (!teile.length) return ''
    return zelle(teile.join(''), { farben, polsterung: '18px 32px' })
  },

  trenner({ farben }) {
    return zelle(`<div style="height:1px;background-color:${farben.linie};line-height:1px;font-size:0;">&nbsp;</div>`, { farben, polsterung: '6px 32px' })
  },

  // Fuß mit Abmeldelink und Impressum. Pflicht in jeder Kampagne.
  fuss({ abmeldeAdresse, abmeldeText = 'Newsletter abbestellen', impressum, farben }) {
    const adresse = String(abmeldeAdresse || '').trim()
    const link = adresse ? `mailto:${m(adresse)}?subject=Abmeldung` : ''
    const teile = []
    if (link) {
      teile.push(
        `<p style="margin:0 0 10px;font-family:${SCHRIFT};font-size:13px;line-height:1.6;color:${farben.leise};">
          <a href="${link}" style="color:${farben.leise};text-decoration:underline;">${m(abmeldeText)}</a>
        </p>`
      )
    }
    if (impressum) {
      teile.push(
        `<p style="margin:0;font-family:${SCHRIFT};font-size:12px;line-height:1.6;color:${farben.leise};">${m(impressum).replace(/\n/g, '<br />')}</p>`
      )
    }
    return `<tr><td style="padding:22px 32px 30px;background-color:${farben.flaeche};border-top:1px solid ${farben.linie};">${teile.join('')}</td></tr>`
  }
}

// Welche Angaben ein Baustein kennt — für die Oberfläche und für die Anweisung an die KI
const FELDER = {
  kopf: ['logo', 'logoBreite', 'titel'],
  titel: ['text'],
  text: ['text'],
  bild: ['quelle', 'link', 'alt'],
  knopf: ['text', 'link'],
  produkt: ['bild', 'titel', 'beschreibung', 'preis', 'link', 'knopfText'],
  trenner: [],
  fuss: ['abmeldeText']
}

const ARTEN = Object.keys(BAUSTEINE)

// Eine Mail aus Bausteinen zusammensetzen.
// `marke`: { logo, titel, farben, impressum }
function mailAus(bausteine, { marke = {}, abmeldeAdresse = '', vorschauText = '' } = {}) {
  const farben = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const liste = Array.isArray(bausteine) ? bausteine : []

  const zeilen = []
  for (const baustein of liste) {
    const bauen = BAUSTEINE[baustein?.art]
    if (!bauen) continue // unbekannte Art wird übergangen, nicht geraten
    const angaben = { ...baustein, farben }
    if (baustein.art === 'kopf') {
      // Mit `||`, nicht `??`: der Editor speichert leere Felder als leeren String, und der
      // soll auf die Marke zurückfallen statt das Logo zu verschlucken.
      angaben.logo = baustein.logo || marke.logo || ''
      angaben.titel = baustein.titel || marke.titel || ''
    }
    zeilen.push(bauen(angaben))
  }

  // Der Fuß ist Pflicht: fehlt er in der Liste, wird er angehängt
  if (!liste.some((b) => b?.art === 'fuss')) {
    zeilen.push(BAUSTEINE.fuss({ abmeldeAdresse, impressum: marke.impressum, farben }))
  } else {
    // vorhandenen Fuß mit Adresse und Impressum versorgen
    const stelle = liste.findIndex((b) => b?.art === 'fuss')
    zeilen[stelle] = BAUSTEINE.fuss({ ...liste[stelle], abmeldeAdresse, impressum: marke.impressum, farben })
  }

  // Vorschautext: erscheint in der Mailliste neben dem Betreff, soll aber nicht im Text stehen
  const vorschau = vorschauText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${m(vorschauText)}</div>`
    : ''

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${m(marke.titel || '')}</title>
</head>
<body style="margin:0;padding:0;background-color:${farben.hintergrund};">
${vorschau}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${farben.hintergrund};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BREITE}" style="width:${BREITE}px;max-width:100%;background-color:${farben.flaeche};">
      ${zeilen.join('\n      ')}
    </table>
  </td></tr>
</table>
</body>
</html>`
}

// Eine schlichte Startvorlage, damit nicht jede Kampagne bei null anfängt
function startVorlage() {
  return [
    { art: 'kopf' },
    { art: 'titel', text: 'Überschrift' },
    { art: 'text', text: 'Hier steht der Text.\n\nEin zweiter Absatz.' },
    { art: 'knopf', text: 'Zum Shop', link: '' },
    { art: 'fuss' }
  ]
}

module.exports = { mailAus, startVorlage, BAUSTEINE, FELDER, ARTEN, STANDARD_FARBEN, BREITE }
