'use strict'
// Newsletter-Plugin: fertige Vorlagen im Stil der Marke.
//
// Warum es die gibt: Eine KI, die vor einem leeren Feld sitzt, baut ein Gerüst und füllt
// es mit erfundenen Produkten. Mit einer fertigen Vorlage bleibt ihr nur noch das, was sie
// gut kann — Texte schreiben und echte Produkte einsetzen. Jede Stelle, die pro Kampagne
// neu geschrieben wird, trägt `data-feld` mit einem Hinweis, was dort hingehört.
//
// Die Farben kommen aus `marke.farben`; fehlt eine, greift DUNKEL weiter unten. Das ist
// bewusst eine dunkle Welt: Donnerwolfs Design-System sagt Anthrazit plus Gold, keine
// bunten Farben. Eine helle Mail mit braunem Knopf sieht aus wie jeder andere Shop.
//
// Regeln, die hier eingehalten sind, damit Vendos Prüfungen nicht anschlagen:
//   - Jedes Bild hat eine echte https-Adresse aus dem Shop (Beispielprodukte), jeder Knopf
//     ein echtes Ziel. Leere Bilder und tote Knöpfe sperren die Freigabe.
//   - Kein Rabatt-Abzeichen, kein durchgestrichener Preis: Donnerwolf führt fast keine
//     Vergleichspreise, und ein erfundener Streichpreis ist irreführende Werbung.
//   - Kein Logo, kein Fuß: Kopf und Fuß setzt Vendo aus den Markenangaben.
//   - Jedes Produkt nur einmal, jedes Bild nur einmal.

const { STANDARD_FARBEN, SCHRIFT, BREITE } = require('./bausteine.js')

// Donnerwolfs Farbwelt als Rückfall, wenn unter „Marke" nichts eingetragen ist.
// Anthrazit und Gold sind immer dabei, Beige ist der helle Kontrast.
const DUNKEL = {
  hintergrund: '#111111',
  flaeche: '#1A1A1A',
  text: '#D9CBB4',
  leise: '#9A8F7C',
  akzent: '#C29A40',
  aufAkzent: '#1A1A1A',
  linie: '#333333'
}

const INHALT = BREITE - 64 // 536 px
const HALB = 252

// Beispielprodukte. Sie stehen in der Vorlage, damit sie in Vendos Übersicht wie eine
// echte Mail aussieht und Vendos Prüfungen durchlaufen. Beim Anlegen einer Kampagne wird
// jedes Feld neu geschrieben — Beispieltext, der stehen bleibt, sperrt die Freigabe.
const BEISPIEL = [
  { titel: 'Sturmfest Thorshammer Hoodie', preis: '59,99 €', pfad: 'sturmfest-fluffy-boxcut-hoodie' },
  { titel: 'Sturmfest Thorshammer T-Shirt', preis: '24,95 €', pfad: 'sturmfest-premium-shirt' },
  { titel: 'Sturmfest Thorshammer Sweatshirt', preis: '49,95 €', pfad: 'sturmfest-basic-sweatshirt' },
  { titel: 'Nicht grau, Eisen Hoodie', preis: '59,99 €', pfad: 'ich-bin-nicht-grau-fluffy-boxcut-hoodie' }
]

const SHOP = 'https://donnerwolf.de'
// Ein einzelnes neutrales Beispielbild je Produkt. Echte Adressen setzt die KI ein; diese
// hier sind nur Platzhalter, die laden — ohne sie meldet Vendo „Bild ohne Adresse".
const beispielBild = (i) => `${SHOP}/cdn/shop/files/donnerwolf-beispiel-${i + 1}.png`
const beispielUrl = (i) => `${SHOP}/products/${BEISPIEL[i].pfad}`

const m = (wert) =>
  String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Ein Feld markieren: `data-feld` sagt Vendo und der KI, was pro Kampagne neu geschrieben wird.
const feld = (name, hinweis) => `data-feld="${m(name)}" data-feld-hinweis="${m(hinweis)}"`

function farbenAus(marke = {}) {
  const eigene = marke?.farben || {}
  // Hat Felix eigene Farben eingetragen, gewinnen die. Sonst Donnerwolfs dunkle Welt,
  // nicht Vendos helle Grundeinstellung.
  const gewaehlt = { ...STANDARD_FARBEN, ...DUNKEL, ...eigene }
  return gewaehlt
}

// ── Gemeinsame Bausteine der Muster ──

const knopf = (text, url, { gross = false, feldName = '', hinweis = '' } = {}, f) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td bgcolor="${f.akzent}" style="padding:${gross ? '15px 34px' : '12px 24px'};">
          <a ${feldName ? feld(feldName, hinweis) : ''} href="${m(url)}" style="font-family:${SCHRIFT};font-size:${gross ? 16 : 14}px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${f.aufAkzent};text-decoration:none;display:inline-block;">${m(text)}</a>
        </td></tr>
      </table>`

const band = (text, feldName, hinweis, f) => `
  <tr>
    <td align="center" style="padding:30px 32px 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td bgcolor="${f.akzent}" style="padding:5px 16px;font-family:${SCHRIFT};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${f.aufAkzent};">${m(text)}</td></tr>
      </table>
      <div ${feld(feldName, hinweis)} style="margin-top:12px;font-family:${SCHRIFT};font-size:20px;line-height:1.35;font-weight:600;color:${f.text};">Platzhalter für die Unterzeile</div>
    </td>
  </tr>`

const trenner = (f) => `
  <tr><td style="padding:26px 32px 2px;">
    <div style="height:1px;background-color:${f.linie};line-height:1px;font-size:0;">&nbsp;</div>
  </td></tr>`

// Eine Produktkachel. `nr` ist die Nummer im Feldnamen, `i` das Beispielprodukt.
const produkt = (nr, i, f) => `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${f.flaeche};border:1px solid ${f.linie};">
            <tr><td align="center" style="padding:8px 8px 0;">
              <a ${feld(`produkt${nr}_bild_link`, 'Adresse genau dieses Produkts')} href="${beispielUrl(i)}" style="text-decoration:none;"><img ${feld(`produkt${nr}_bild`, 'Bild genau dieses Produkts, jedes Bild nur einmal in der Mail')} src="${beispielBild(i)}" width="${HALB}" alt="${m(BEISPIEL[i].titel)}" style="display:block;width:100%;max-width:${HALB}px;height:auto;border:0;" /></a>
            </td></tr>
            <tr><td align="center" style="padding:12px 10px 0;font-family:${SCHRIFT};font-size:14px;line-height:1.4;font-weight:600;color:${f.text};">
              <span ${feld(`produkt${nr}_name`, 'Produktname genau wie im Shop')}>${m(BEISPIEL[i].titel)}</span>
            </td></tr>
            <tr><td align="center" style="padding:5px 10px 0;font-family:${SCHRIFT};font-size:14px;color:${f.leise};">
              <span ${feld(`produkt${nr}_preis`, 'Preis genau wie im Shop, ohne erfundenen Streichpreis')}>${m(BEISPIEL[i].preis)}</span>
            </td></tr>
            <tr><td align="center" style="padding:12px 10px 14px;">${knopf('Ansehen', beispielUrl(i), { feldName: `produkt${nr}_knopf`, hinweis: 'Adresse genau dieses Produkts' }, f)}
            </td></tr>
          </table>`

const produktPaar = (nr1, i1, nr2, i2, f) => `
  <tr>
    <td style="padding:16px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
        <tr>
          <td width="50%" valign="top" style="padding:0 6px 0 0;">${produkt(nr1, i1, f)}
          </td>
          <td width="50%" valign="top" style="padding:0 0 0 6px;">${produkt(nr2, i2, f)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`

const aufmacher = (ueberschrift, einleitung, knopfText, f, { hinweisUeber = 'Höchstens sechs Wörter, konkreter Haken, keine Werbefloskel', hinweisEin = 'Zwei bis drei Sätze, Du-Form, ruhig und bestimmt. Keine Gedankenstriche.' } = {}) => `
  <tr>
    <td align="center" style="padding:34px 32px 8px;">
      <h1 ${feld('ueberschrift', hinweisUeber)} style="margin:0 0 12px;font-family:${SCHRIFT};font-size:28px;line-height:1.2;font-weight:700;letter-spacing:0.01em;color:${f.text};">${m(ueberschrift)}</h1>
      <p ${feld('einleitung', hinweisEin)} style="margin:0 0 22px;font-family:${SCHRIFT};font-size:16px;line-height:1.65;color:${f.leise};">${m(einleitung)}</p>${knopf(knopfText, `${SHOP}/collections/all`, { gross: true, feldName: 'haupt_knopf', hinweis: 'Adresse der passenden Sammlung oder des Shops' }, f)}
    </td>
  </tr>`

const schluss = (satz, f, { gruss = 'Bleib standhaft.<br />Felix' } = {}) => `
  <tr>
    <td align="center" style="padding:28px 32px 32px;">
      <p ${feld('abschluss', 'Ein Satz zum Abschluss, ruhig. Kein Pathos.')} style="margin:0 0 18px;font-family:${SCHRIFT};font-size:16px;line-height:1.65;color:${f.text};">${m(satz)}</p>${knopf('Zum Shop', SHOP, { gross: true, feldName: 'schluss_knopf', hinweis: 'Shop oder Sammlung' }, f)}
      <p ${feld('gruss', 'Grußzeile, persönlich')} style="margin:20px 0 0;font-family:${SCHRIFT};font-size:15px;line-height:1.6;color:${f.leise};">${gruss}</p>
    </td>
  </tr>`

const huelle = (zeilen) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">${zeilen}
</table>`

// ── Die sechs Muster ──

const MUSTER = [
  {
    id: 'neue-motive',
    name: 'Neue Motive',
    art: 'kampagne',
    beschreibung: 'Newsletter für einen Drop: Aufmacher, zwei Motive nebeneinander, Abschluss.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Zwei neue Motive', 'Schwerer Stoff, klare Ansage. Beide ab sofort im Shop.', 'Jetzt ansehen', f),
          band('Neu', 'abschnitt1', 'Unterzeile zum Abschnitt, eine Zeile', f),
          produktPaar(1, 0, 2, 1, f),
          schluss('Welches davon passt zu dir?', f)
        ].join('')
      )
  },
  {
    id: 'bestseller',
    name: 'Meistverkauft',
    art: 'kampagne',
    beschreibung: 'Newsletter mit vier Produkten im Raster. Für die Renner aus der Übersicht.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Das tragen die meisten', 'Vier Motive, die diesen Monat am häufigsten rausgegangen sind.', 'Alle ansehen', f),
          band('Meistverkauft', 'abschnitt1', 'Unterzeile, eine Zeile', f),
          produktPaar(1, 0, 2, 1, f),
          produktPaar(3, 2, 4, 3, f),
          schluss('Noch nichts dabei? Im Shop stehen mehr als zweihundert Motive.', f)
        ].join('')
      )
  },
  {
    id: 'ein-motiv',
    name: 'Ein Motiv, groß',
    art: 'kampagne',
    beschreibung: 'Newsletter für ein einzelnes Produkt: großes Bild, Geschichte dahinter, ein Knopf.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Der Hammer bleibt', 'Ein Motiv, das keine Erklärung braucht. Und trotzdem eine hat.', 'Zum Motiv', f),
          `
  <tr>
    <td style="padding:22px 32px 0;">
      <a ${feld('hauptbild_link', 'Adresse des Produkts')} href="${beispielUrl(0)}" style="text-decoration:none;"><img ${feld('hauptbild', 'Großes Produktbild, 536 px')} src="${beispielBild(0)}" width="${INHALT}" alt="${m(BEISPIEL[0].titel)}" style="display:block;width:100%;max-width:${INHALT}px;height:auto;border:0;" /></a>
    </td>
  </tr>
  <tr>
    <td style="padding:22px 32px 0;font-family:${SCHRIFT};font-size:16px;line-height:1.7;color:${f.text};">
      <p ${feld('geschichte', 'Drei bis vier Sätze zur Idee hinter dem Motiv. Konkret, kein Pathos.')} style="margin:0;">Platzhalter für die Geschichte hinter dem Motiv.</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:18px 32px 0;font-family:${SCHRIFT};">
      <div ${feld('produkt1_name', 'Produktname genau wie im Shop')} style="font-size:18px;font-weight:600;color:${f.text};">${m(BEISPIEL[0].titel)}</div>
      <div ${feld('produkt1_preis', 'Preis genau wie im Shop')} style="margin-top:6px;font-size:15px;color:${f.leise};">${m(BEISPIEL[0].preis)}</div>
    </td>
  </tr>`,
          schluss('Mehr davon steht im Shop.', f)
        ].join('')
      )
  },
  {
    id: 'warenkorb-erinnerung',
    name: 'Warenkorb: Erinnerung',
    art: 'warenkorb',
    beschreibung: 'Erster Schritt nach dem Abbruch. Ohne Rabatt, beantwortet Versand und Rückgabe.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Dein Warenkorb steht noch', 'Du hast etwas liegen lassen. Wir haben es nicht weggeräumt.', 'Warenkorb öffnen', f, {
            hinweisUeber: 'Kurz, kein Druck, keine erfundene Frist',
            hinweisEin: 'Zwei Sätze. Kein Rabatt in dieser Mail.'
          }),
          `
  <tr>
    <td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${f.flaeche};border:1px solid ${f.linie};">
        <tr><td style="padding:16px 18px;font-family:${SCHRIFT};font-size:15px;line-height:1.7;color:${f.text};">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${f.akzent};margin-bottom:8px;">Das liegt drin</div>
          {{warenkorb}}
          <div style="margin-top:12px;font-size:16px;font-weight:600;">Summe: {{summe}}</div>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:20px 32px 0;">${knopf('Warenkorb wiederherstellen', '{{warenkorbLink}}', { gross: true }, f)}
    </td>
  </tr>`,
          trenner(f),
          `
  <tr>
    <td style="padding:16px 32px 0;font-family:${SCHRIFT};font-size:15px;line-height:1.7;color:${f.leise};">
      <p ${feld('fragen', 'Die drei häufigsten Abbruchgründe beantworten: Versandkosten, Lieferzeit, Rückgabe. Keine Zahlen erfinden.')} style="margin:0;">Platzhalter für die Antworten auf Versand, Lieferzeit und Rückgabe.</p>
    </td>
  </tr>`,
          schluss('Fragen? Antworte einfach auf diese Mail.', f)
        ].join('')
      )
  },
  {
    id: 'warenkorb-letzter',
    name: 'Warenkorb: letzter Anstoß',
    art: 'warenkorb',
    beschreibung: 'Zweiter Schritt. Warenkorb, zwei passende Motive daneben, ein klarer Knopf.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Letzte Erinnerung', 'Danach lassen wir dich in Ruhe. Dein Warenkorb bleibt trotzdem stehen.', 'Warenkorb öffnen', f, {
            hinweisUeber: 'Kurz. Keine erfundene Frist, kein Countdown.',
            hinweisEin: 'Zwei Sätze, ruhig. Ein Rabatt nur, wenn Felix einen echten Code genannt hat.'
          }),
          `
  <tr>
    <td style="padding:22px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${f.flaeche};border:1px solid ${f.linie};">
        <tr><td style="padding:16px 18px;font-family:${SCHRIFT};font-size:15px;line-height:1.7;color:${f.text};">
          {{warenkorb}}
          <div style="margin-top:12px;font-size:16px;font-weight:600;">Summe: {{summe}}</div>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:20px 32px 0;">${knopf('Jetzt abschließen', '{{warenkorbLink}}', { gross: true }, f)}
    </td>
  </tr>`,
          band('Passt dazu', 'abschnitt1', 'Unterzeile, eine Zeile', f),
          produktPaar(1, 1, 2, 2, f),
          schluss('Bis bald.', f)
        ].join('')
      )
  },
  {
    id: 'willkommen',
    name: 'Willkommen',
    art: 'willkommen',
    beschreibung: 'Erste Mail nach der Anmeldung: wofür die Marke steht, zwei Einstiegsmotive.',
    bauen: (f) =>
      huelle(
        [
          aufmacher('Willkommen bei Donnerwolf, {{vorname}}', 'Keine tägliche Dauerbeschallung. Nur wenn es etwas zu sagen gibt.', 'Shop ansehen', f, {
            hinweisUeber: 'Begrüßung mit {{vorname}}. Muss auch ohne Namen tragen.',
            hinweisEin: 'Zwei Sätze: was ihn erwartet und wie oft. Nichts versprechen, was nicht eingehalten wird.'
          }),
          `
  <tr>
    <td style="padding:24px 32px 0;font-family:${SCHRIFT};font-size:16px;line-height:1.7;color:${f.text};">
      <p ${feld('haltung', 'Drei bis vier Sätze: wofür die Marke steht. Keine Werbefloskeln, kein Pathos.')} style="margin:0;">Platzhalter für die Haltung hinter der Marke.</p>
    </td>
  </tr>`,
          band('Zum Anfangen', 'abschnitt1', 'Unterzeile, eine Zeile', f),
          produktPaar(1, 0, 2, 3, f),
          schluss('Antworte einfach, wenn du etwas wissen willst. Die Mail liest wirklich Felix.', f)
        ].join('')
      )
  }
]

// Ein Muster als HTML. Unbekannte Kennung gibt null, damit der Aufrufer es merkt.
function musterHtml(id, { marke = {} } = {}) {
  const muster = MUSTER.find((x) => x.id === id)
  if (!muster) return null
  return muster.bauen(farbenAus(marke))
}

// Die Liste für die Oberfläche und für den Bot — ohne die Baufunktionen.
const musterListe = () => MUSTER.map(({ id, name, art, beschreibung }) => ({ id, name, art, beschreibung }))

module.exports = { MUSTER, musterListe, musterHtml, farbenAus, DUNKEL, BEISPIEL }
