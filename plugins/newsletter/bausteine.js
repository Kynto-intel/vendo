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

// ── Der Fuß als Markenangabe ──
// Pflichtlinks, Social-Icons und Logo im Fuß stehen nicht in der einzelnen Kampagne,
// sondern einmal in `marke.fuss`. Dann sind sie in jeder Mail dabei — auch in Automationen
// und in fremdem HTML, das keinen eigenen Fuß mitbringt.

// Die Pflichtlinks, in der Reihenfolge, in der sie im Fuß stehen.
const RECHTSLINKS = [
  { id: 'impressumUrl', name: 'Impressum' },
  { id: 'datenschutzUrl', name: 'Datenschutzerklärung' },
  { id: 'agbUrl', name: 'AGB' }
]

// Die Netzwerke, die der Fuß kennt, in der Reihenfolge der Icons. Zu jedem gehört ein Bild
// in `plugins/newsletter/social media icons`; icons.js findet es über die Kennung und
// schickt es mit der Mail mit. Ein Netzwerk hier ohne Bild dort bliebe im Fuß leer —
// deshalb hält ein Test beide Listen zusammen.
const NETZWERKE = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'pinterest', name: 'Pinterest' },
  { id: 'tiktok', name: 'TikTok' }
]

const ABMELDE_TEXT = 'ABMELDEN'
const SOCIAL_TITEL = 'FOLGE UNS HIER'
const LOGO_BREITE_FUSS = 120
const LOGO_BREITE_KOPF = 180
// Anzeigegröße der Icons im Fuß. Einstellbar über `fuss.iconBreite`; die Grenzen halten
// sie dort, wo sie noch erkennbar und noch nicht marktschreierisch sind.
const ICON_BREITE = 22
const ICON_BREITE_MIN = 14
const ICON_BREITE_MAX = 40
// Vorsatz der Kennung eines mitgeschickten Icons. Steht hier und nicht in icons.js, weil
// das HTML hier entsteht und icons.js dieses Modul schon lädt.
const ICON_CID_VORSATZ = 'vendo-nl-'

// Farben, die nur der Fuß kennt. Leer heißt: wie der Rest der Mail.
const FUSS_FARBEN = ['hintergrund', 'text', 'akzent']
// Der Kopf kennt nur Grund und Schrift — einen Akzent braucht er nicht.
const KOPF_FARBEN = ['hintergrund', 'text']

// Eine Zahl in ihre Grenzen bringen, sonst der Standardwert
const zahlIn = (wert, min, max, standard) => {
  const n = Number(wert)
  return n >= min && n <= max ? Math.round(n) : standard
}

// Ist das eine brauchbare Hexfarbe? Leer und Unsinn geben leer zurück.
const hexFarbe = (wert) => (/^#[0-9a-f]{3,8}$/i.test(String(wert || '').trim()) ? String(wert).trim() : '')

// ── Der Kopf als Markenangabe ──
// Dasselbe Versprechen wie beim Fuß: das Logo steht einmal hier und kommt dann in jede
// Mail. Der Auftrag an die KI sagt seit jeher „Kopf und Fuß werden automatisch ergänzt“ —
// seit es `kopfZeile` gibt, stimmt das auch im HTML-Modus.
function kopfTeileAus(marke = {}, farben = STANDARD_FARBEN) {
  const k = marke.kopf || {}
  const hintergrund = hexFarbe(k.hintergrund)
  return {
    zeigen: k.zeigen !== false,
    // Mit `||`, nicht `??`: ein leeres Feld im Editor soll auf das Logo der Marke
    // zurückfallen, nicht das Logo verschlucken.
    logo: url(k.logo || marke.logo || ''),
    logoBreite: zahlIn(k.logoBreite, 40, BREITE - 40, LOGO_BREITE_KOPF),
    titel: marke.titel || '',
    farben: {
      hintergrund: hintergrund || farben.flaeche,
      eigenerGrund: Boolean(hintergrund),
      text: hexFarbe(k.text) || (hintergrund ? '#ffffff' : farben.text)
    }
  }
}

// Die Kopfzeile jeder Mail: Logo mittig, sonst der Name als Schriftzug. Leer, wenn der Kopf
// abgeschaltet ist oder es weder Logo noch Namen gibt — dann fängt die Mail mit dem Inhalt
// an, statt eine leere Fläche zu zeigen.
function kopfZeile(marke = {}, farben = STANDARD_FARBEN) {
  const t = kopfTeileAus(marke, farben)
  if (!t.zeigen) return ''
  const inhalt = t.logo
    ? `<img src="${t.logo}" width="${t.logoBreite}" alt="${m(t.titel)}" style="display:block;margin:0 auto;border:0;max-width:${t.logoBreite}px;height:auto;" />`
    : t.titel
      ? `<div style="font-family:${SCHRIFT};font-size:26px;letter-spacing:0.08em;text-transform:uppercase;color:${t.farben.text};text-align:center;">${m(t.titel)}</div>`
      : ''
  if (!inhalt) return ''
  return `<tr><td align="center" bgcolor="${t.farben.hintergrund}" style="padding:28px 32px 20px;background-color:${t.farben.hintergrund};text-align:center;">${inhalt}</td></tr>`
}

// Die Kopfangaben prüfen, bevor sie gespeichert werden — wie fussPruefen.
function kopfPruefen(eingabe = {}) {
  const wert = {}
  const verworfen = []
  if (eingabe.zeigen === false) wert.zeigen = false
  const logo = String(eingabe.logo ?? '').trim().slice(0, 300)
  if (logo) {
    if (/^https:\/\/[^\s<>"']+$/i.test(logo)) wert.logo = logo
    else verworfen.push('Logo im Kopf')
  }
  wert.logoBreite = zahlIn(eingabe.logoBreite, 40, BREITE - 40, LOGO_BREITE_KOPF)
  for (const name of KOPF_FARBEN) {
    const farbe = String(eingabe[name] ?? '').trim()
    if (!farbe) continue
    if (hexFarbe(farbe)) wert[name] = farbe
    else verworfen.push(`Kopffarbe ${name}`)
  }
  return { wert, verworfen }
}

// Aus den Markenangaben die Teile des Fußes machen. Nur Einträge mit brauchbarer Adresse
// kommen durch — ein leeres Feld darf keinen leeren Link in die Mail schreiben.
function fussTeileAus(marke = {}, farben = STANDARD_FARBEN) {
  const f = marke.fuss || {}
  // Eigener Grund im Fuß (wie im Beispiel: dunkel unter heller Mail) oder die Fläche der
  // Mail. Ohne eigenen Grund bleibt die Trennlinie, mit eigenem Grund trennt die Farbe.
  const hintergrund = hexFarbe(f.hintergrund)
  const text = hexFarbe(f.text) || (hintergrund ? '#ffffff' : farben.leise)
  return {
    // Mit `||`, nicht `??`: der Editor speichert leere Felder als leeren String, und der
    // soll auf das Logo aus dem Kopf zurückfallen.
    logo: f.logoZeigen === false ? '' : url(f.logo || marke.logo || ''),
    logoBreite: zahlIn(f.logoBreite, 40, 300, LOGO_BREITE_FUSS),
    iconBreite: zahlIn(f.iconBreite, ICON_BREITE_MIN, ICON_BREITE_MAX, ICON_BREITE),
    titel: marke.titel || '',
    socialTitel: f.socialTitel === '' ? '' : String(f.socialTitel || '').trim() || SOCIAL_TITEL,
    zusatz: String(f.zusatz || '').trim(),
    abmeldeText: String(f.abmeldeText || '').trim() || ABMELDE_TEXT,
    farben: {
      hintergrund: hintergrund || farben.flaeche,
      eigenerGrund: Boolean(hintergrund),
      text,
      akzent: hexFarbe(f.akzent) || text
    },
    rechtslinks: RECHTSLINKS.map((l) => ({ ...l, adresse: f[l.id] || '' })).filter((l) => url(l.adresse)),
    social: NETZWERKE.map((n) => ({ ...n, adresse: f[n.id] || '', icon: f[`${n.id}Icon`] || '' })).filter((n) => url(n.adresse))
  }
}

// Eingetragene Fußangaben prüfen, bevor sie gespeichert werden. Adressen müssen https
// sein: http-Bilder werden in Postfächern blockiert, und alles andere ist kein Link.
// Verworfenes wird benannt, damit die Oberfläche es sagen kann statt es zu verschlucken.
function fussPruefen(eingabe = {}) {
  const wert = {}
  const verworfen = []
  const istHttps = (text) => /^https:\/\/[^\s<>"']+$/i.test(text)
  const nehmen = (feld, name, roh) => {
    const text = String(roh ?? '').trim().slice(0, 300)
    if (!text) return
    if (istHttps(text)) wert[feld] = text
    else verworfen.push(name)
  }

  if (eingabe.logoZeigen === false) wert.logoZeigen = false
  nehmen('logo', 'Logo im Fuß', eingabe.logo)
  wert.logoBreite = zahlIn(eingabe.logoBreite, 40, 300, LOGO_BREITE_FUSS)
  wert.iconBreite = zahlIn(eingabe.iconBreite, ICON_BREITE_MIN, ICON_BREITE_MAX, ICON_BREITE)

  const einzeilig = (roh, laenge) => String(roh ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, laenge)
  const text = einzeilig(eingabe.abmeldeText, 40)
  if (text) wert.abmeldeText = text
  // Leerer Titel ist eine Ansage („keine Überschrift über den Icons“) und kein fehlendes
  // Feld — deshalb wird er gespeichert, sobald das Feld überhaupt mitkommt.
  if (eingabe.socialTitel !== undefined) wert.socialTitel = einzeilig(eingabe.socialTitel, 40)
  const zusatz = einzeilig(eingabe.zusatz, 160)
  if (zusatz) wert.zusatz = zusatz

  for (const name of FUSS_FARBEN) {
    const farbe = String(eingabe[name] ?? '').trim()
    if (!farbe) continue
    if (hexFarbe(farbe)) wert[name] = farbe
    else verworfen.push(`Fußfarbe ${name}`)
  }

  for (const l of RECHTSLINKS) nehmen(l.id, l.name, eingabe[l.id])
  for (const n of NETZWERKE) {
    nehmen(n.id, n.name, eingabe[n.id])
    nehmen(`${n.id}Icon`, `${n.name}-Icon`, eingabe[`${n.id}Icon`])
  }
  return { wert, verworfen }
}

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

  // Fuß: Logo, Social-Icons, Pflichtlinks, Impressum, darunter mittig „ABMELDEN“.
  // Abmeldeweg und Impressum sind Pflicht in jeder Kampagne; Logo, Icons und Links kommen
  // aus `marke.fuss` und erscheinen, sobald dort eine Adresse steht (siehe fussTeileAus).
  fuss({ abmeldeAdresse, abmeldeText = '', impressum, farben, marke = {} }) {
    const t = fussTeileAus(marke, farben)
    const f = t.farben
    const adresse = String(abmeldeAdresse || '').trim()
    const link = adresse ? `mailto:${m(adresse)}?subject=Abmeldung` : ''
    const teile = []

    // Logo mittig. Eigene Adresse, sonst das Logo aus dem Kopf.
    if (t.logo) {
      teile.push(
        `<img src="${url(t.logo)}" width="${t.logoBreite}" alt="${m(t.titel)}" style="display:block;margin:0 auto 18px;border:0;max-width:${t.logoBreite}px;height:auto;" />`
      )
    }

    if (t.social.length) {
      // Überschrift über den Icons („FOLGE UNS HIER“). Leerer Titel heißt: keine.
      if (t.socialTitel) {
        teile.push(
          `<p style="margin:0 0 14px;font-family:${SCHRIFT};font-size:13px;font-weight:600;line-height:1.5;letter-spacing:0.12em;text-transform:uppercase;color:${f.text};text-align:center;">${m(t.socialTitel)}</p>`
        )
      }

      // Die Icons: eine Tabellenzeile, damit Outlook sie nebeneinander stellt. Vendo
      // zeichnet sie und schickt sie als eingebettetes Bild mit (cid:, siehe icons.js) —
      // eine eigene Icon-Adresse hat Vorrang. SVG und data:-Bilder gehen nicht, die werfen
      // Gmail und Outlook weg.
      const zellen = t.social
        .map((n) => {
          const ziel = url(n.adresse)
          const quelle = url(n.icon) || `cid:${ICON_CID_VORSATZ}${n.id}`
          const bild = `<img src="${quelle}" width="${t.iconBreite}" height="${t.iconBreite}" alt="${m(n.name)}" style="display:block;border:0;width:${t.iconBreite}px;height:${t.iconBreite}px;" />`
          return `<td align="center" valign="middle" style="padding:0 7px;"><a href="${ziel}" style="text-decoration:none;color:${f.text};">${bild}</a></td>`
        })
        .join('')
      teile.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;"><tr>${zellen}</tr></table>`
      )
    }

    // Pflichtlinks: Impressum | Datenschutzerklärung | AGB
    if (t.rechtslinks.length) {
      const trenn = `<span style="color:${f.text};">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`
      teile.push(
        `<p style="margin:0 0 14px;font-family:${SCHRIFT};font-size:13px;line-height:1.7;color:${f.text};text-align:center;">${t.rechtslinks
          .map((l) => `<a href="${url(l.adresse)}" style="color:${f.text};text-decoration:underline;">${m(l.name)}</a>`)
          .join(trenn)}</p>`
      )
    }

    // Das Impressum fließt als ein Block und bricht von selbst um, statt jede eingetippte
    // Zeile untereinander zu stapeln: die Teile werden mit „ | “ verbunden, wie es in
    // Fußzeilen üblich ist. Wer doch einen festen Umbruch will, lässt eine Zeile frei.
    const impressumBloecke = String(impressum ?? '')
      .split(/\n\s*\n/)
      .map((block) =>
        block
          .split('\n')
          .map((zeile) => zeile.trim().replace(/\s*\|\s*$/, ''))
          .filter(Boolean)
          .join(' | ')
      )
      .filter(Boolean)
    if (impressumBloecke.length) {
      teile.push(
        `<p style="margin:0;font-family:${SCHRIFT};font-size:12px;line-height:1.7;color:${f.text};text-align:center;">${impressumBloecke.map(m).join('<br />')}</p>`
      )
    }

    // Freie Zeile darunter, etwa „Alle Preise inkl. MwSt. und zzgl. Versandkosten“
    if (t.zusatz) {
      teile.push(
        `<p style="margin:14px 0 0;font-family:${SCHRIFT};font-size:12px;line-height:1.6;color:${f.text};text-align:center;">${m(t.zusatz)}</p>`
      )
    }

    // Ganz unten, mittig: der Abmeldelink. Steht zuletzt, weil er das Letzte sein soll,
    // was in der Mail steht — und weil mail.js ohne ihn keine Kampagnenmail baut.
    if (link) {
      teile.push(
        `<p style="margin:18px 0 0;font-family:${SCHRIFT};font-size:12px;line-height:1.6;letter-spacing:0.1em;color:${f.akzent};text-align:center;">
          <a href="${link}" style="color:${f.akzent};text-decoration:underline;">${m(abmeldeText || t.abmeldeText)}</a>
        </p>`
      )
    }

    // Eigener Grund im Fuß trennt schon durch die Farbe; ohne ihn braucht es die Linie.
    const rand = f.eigenerGrund ? '' : `border-top:1px solid ${farben.linie};`
    return `<tr><td align="center" bgcolor="${f.hintergrund}" style="padding:26px 32px 30px;background-color:${f.hintergrund};${rand}text-align:center;">${teile.join('')}</td></tr>`
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

// Das Grundgerüst jeder Mail: Dokument, Hintergrundfläche und die 600-px-Spalte.
// Liegt eigens hier, weil es der HTML-Modus (html-mail.js) genauso braucht — ein zweites
// Skelett wäre eines zu viel, das beim Ändern vergessen wird.
// `zeilen` sind fertige <tr>-Zeilen der inneren Tabelle.
//
// Warum `width="100%"` mit `max-width:600px` und nicht `width="600"` mit `max-width:100%`:
// Eine Tabelle in einer Tabellenzelle rechnet eine **prozentuale** Höchstbreite nicht aus
// (die Zellbreite hängt selbst vom Inhalt ab), also blieb die Mail auf dem Handy 600 px
// breit und wurde seitlich abgeschnitten — in der Vorschau nachgemessen: 628 px in einem
// 390-px-Fenster. Eine absolute Höchstbreite greift. Outlook kennt `max-width` nicht und
// bekommt über den Bedingungskommentar seine feste 600-px-Tabelle.
function huelle(zeilen, { farben = STANDARD_FARBEN, titel = '', vorschauText = '' } = {}) {
  // Vorschautext: erscheint in der Mailliste neben dem Betreff, soll aber nicht im Text stehen
  const vorschau = vorschauText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${m(vorschauText)}</div>`
    : ''

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${m(titel || '')}</title>
</head>
<body style="margin:0;padding:0;background-color:${farben.hintergrund};">
${vorschau}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${farben.hintergrund};">
  <tr><td align="center" style="padding:24px 12px;">
    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BREITE}"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:${BREITE}px;margin:0 auto;background-color:${farben.flaeche};">
      ${zeilen}
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`
}

// Die Bausteine zu Tabellenzeilen machen — ohne Dokument drumherum und ohne Fuß.
// Der HTML-Modus setzt damit den Editor auf den Stand der Bausteine.
// Was in einem Feld einer Vorlage hinkommt — für data-feld-hinweis
const FELD_HINWEISE = {
  titel: 'Überschrift für diese Kampagne, kurz und kraftvoll',
  text: 'Text für diese Kampagne',
  bild: 'Bild aus dem Shop (cdn.shopify.com)',
  knopf: 'Knopftext und Adresse einer Seite aus dem Shop',
  produkt: 'Produkt aus dem Shop: Bild, Name, Preis, Adresse genau wie geliefert'
}

// `felder: true` macht aus den Zeilen eine Vorlage: jeder Inhaltsbaustein bekommt
// data-feld (titel1, text1, produkt2 …) und eine Anweisung. Kopf, Trenner und Fuß bleiben
// fest. Bei Bildern sitzt das Feld am <img>, sonst an der Zelle.
function zeilenAus(bausteine, { marke = {}, farben = null, felder = false } = {}) {
  const f = farben || { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const zeilen = []
  const zaehler = {}
  for (const baustein of Array.isArray(bausteine) ? bausteine : []) {
    const bauen = BAUSTEINE[baustein?.art]
    // Kopf und Fuß werden übersprungen: die setzt Vendo beim Bauen der Mail selbst aus den
    // Markenangaben davor und dahinter. Eine ältere Liste mit `kopf` darin ergäbe sonst
    // zwei Logos. Unbekannte Arten werden übergangen, nicht geraten.
    if (!bauen || baustein.art === 'fuss' || baustein.art === 'kopf') continue
    const angaben = { ...baustein, farben: f }
    if (baustein.art === 'kopf') {
      // Mit `||`, nicht `??`: der Editor speichert leere Felder als leeren String, und der
      // soll auf die Marke zurückfallen statt das Logo zu verschlucken.
      angaben.logo = baustein.logo || marke.logo || ''
      angaben.titel = baustein.titel || marke.titel || ''
    }
    let zeile = bauen(angaben)
    if (felder && zeile && FELD_HINWEISE[baustein.art]) {
      zaehler[baustein.art] = (zaehler[baustein.art] || 0) + 1
      const merkmal = `data-feld="${baustein.art}${zaehler[baustein.art]}" data-feld-hinweis="${m(FELD_HINWEISE[baustein.art])}"`
      zeile = baustein.art === 'bild' ? zeile.replace('<img ', `<img ${merkmal} `) : zeile.replace('<td ', `<td ${merkmal} `)
    }
    zeilen.push(zeile)
  }
  return zeilen
}

// Dieselben Zeilen als eigenständiger Inhaltsblock, wie ihn der HTML-Editor zeigt:
// eine Tabelle, die sich in die 600-px-Spalte einfügt.
function inhaltAus(bausteine, angaben = {}) {
  const zeilen = zeilenAus(bausteine, angaben)
  if (!zeilen.length) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
${zeilen.map((z) => `  ${z}`).join('\n')}
</table>`
}

// Eine Mail aus Bausteinen zusammensetzen.
// `marke`: { logo, titel, farben, impressum }
function mailAus(bausteine, { marke = {}, abmeldeAdresse = '', vorschauText = '' } = {}) {
  const farben = { ...STANDARD_FARBEN, ...(marke.farben || {}) }
  const liste = Array.isArray(bausteine) ? bausteine : []

  const zeilen = []
  // Der Kopf ist Pflicht wie der Fuß: bringt die Liste keinen eigenen mit, kommt der aus
  // den Markenangaben davor. Damit muss keine Vorlage und keine KI-Antwort ihn mitliefern.
  if (!liste.some((b) => b?.art === 'kopf')) {
    const kopf = kopfZeile(marke, farben)
    if (kopf) zeilen.push(kopf)
  }
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
    zeilen.push(BAUSTEINE.fuss({ abmeldeAdresse, impressum: marke.impressum, farben, marke }))
  } else {
    // vorhandenen Fuß mit Adresse, Impressum und den Fußangaben der Marke versorgen
    const stelle = liste.findIndex((b) => b?.art === 'fuss')
    zeilen[stelle] = BAUSTEINE.fuss({ ...liste[stelle], abmeldeAdresse, impressum: marke.impressum, farben, marke })
  }

  return huelle(zeilen.join('\n      '), { farben, titel: marke.titel, vorschauText })
}

// Eine schlichte Startmail als Inhalt. Ohne Kopf und ohne Fuß: beide kommen aus den
// Markenangaben und werden beim Bauen der Mail ergänzt.
function startVorlage() {
  return [
    { art: 'titel', text: 'Überschrift' },
    { art: 'text', text: 'Hier steht der Text.\n\nEin zweiter Absatz.' },
    { art: 'knopf', text: 'Zum Shop', link: '' },
    { art: 'fuss' }
  ]
}

module.exports = {
  mailAus,
  huelle,
  zeilenAus,
  inhaltAus,
  startVorlage,
  fussTeileAus,
  fussPruefen,
  kopfTeileAus,
  kopfPruefen,
  kopfZeile,
  BAUSTEINE,
  FELDER,
  ARTEN,
  RECHTSLINKS,
  NETZWERKE,
  FUSS_FARBEN,
  KOPF_FARBEN,
  ABMELDE_TEXT,
  SOCIAL_TITEL,
  LOGO_BREITE_FUSS,
  LOGO_BREITE_KOPF,
  ICON_BREITE,
  ICON_BREITE_MIN,
  ICON_BREITE_MAX,
  ICON_CID_VORSATZ,
  STANDARD_FARBEN,
  SCHRIFT,
  BREITE,
  maskieren: m
}
