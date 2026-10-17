// aussprache.js – ersetzt Begriffe vor dem Vorlesen durch eine Schreibweise,
// die das TTS richtig ausspricht.
//
// Eintrag: { begriff, aussprache, gross?, exakt? }
//   gross: true -> nur genau diese Groß-/Kleinschreibung treffen (Standard: egal)
//   exakt: true -> keine Endungen zulassen (Standard: "Hoodies", "PDFs", "Vendos" werden mitgetroffen)
//
// Eigene Einträge (aus den Einstellungen) gehen vor den Standard-Einträgen.
// Zahlen, Preise, Daten, Uhrzeiten und Nummern werden automatisch sprechbar gemacht
// (abschaltbar: ausspracheAnwenden(text, eintraege, { zahlen: false })).
// Alle Aussprachen sind Vorschläge: mit "Probe hören" prüfen und bei Bedarf anpassen.

const WORTZEICHEN = String.raw`\p{L}\p{M}\p{N}_`
const ENDUNGEN = 'es|en|e|n|s'

// URLs und E-Mail-Adressen bleiben unangetastet (sonst wird aus shopify.com "Shop-ifai.com").
const URL_MUSTER = /(https?:\/\/[^\s)]+|www\.[^\s)]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/giu

function regexMaskieren(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalisieren(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

// Schlüssel ohne Leerzeichen: "z. B." und "z.B." sind derselbe Begriff.
function schluesselVon(text) {
  return text.toLocaleLowerCase('de-DE').replace(/\s+/g, '')
}

const SYMBOLE = [
  { zeichen: '€', text: ' Euro' },
  { zeichen: '%', text: ' Prozent' },
  { zeichen: '°C', text: ' Grad Celsius' },
  { zeichen: '&', text: ' und ', beidseitig: true }
].map(({ zeichen, text, beidseitig }) => ({
  muster: new RegExp(`\\s*${regexMaskieren(zeichen)}${beidseitig ? '\\s*' : ''}`, 'gu'),
  text
}))

const STANDARD_AUSSPRACHE = [
  // Projekt und Shop
  { begriff: 'Vendo', aussprache: 'Wendo' },
  { begriff: 'Vendo', aussprache: 'Dscharwis O Ess' },
  { begriff: 'Vendo', aussprache: 'Dscharwis' },
  { begriff: 'Shopify', aussprache: 'Shop-ifai' },
  { begriff: 'Hoodie', aussprache: 'Huudi' },
  { begriff: 'T-Shirt', aussprache: 'Tii-Schört' },
  { begriff: 'Etsy', aussprache: 'Ätsi' },
  { begriff: 'Redbubble', aussprache: 'Redbabbel' },

  // KI und Dienste
  { begriff: 'Gemini', aussprache: 'Dscheminai' },
  { begriff: 'ElevenLabs', aussprache: 'Ileven Labs' },
  { begriff: 'OpenAI', aussprache: 'Open A I' },
  { begriff: 'ChatGPT', aussprache: 'Tschätt Dschi Pi Ti' },
  { begriff: 'Claude', aussprache: 'Klaud' },
  { begriff: 'Hugging Face', aussprache: 'Hagging Fäis' },
  { begriff: 'Whisper', aussprache: 'Wisper' },
  { begriff: 'Kyutai', aussprache: 'Kjutai' },
  { begriff: 'LLM', aussprache: 'El El Em' },
  { begriff: 'KI', aussprache: 'K I', gross: true, exakt: true },
  { begriff: 'AI', aussprache: 'Ei Ai', gross: true, exakt: true },

  // Programme und Plattformen
  { begriff: 'YouTube', aussprache: 'Juutuub' },
  { begriff: 'TikTok', aussprache: 'Tick Tock' },
  { begriff: 'WhatsApp', aussprache: 'Wotsäpp' },
  { begriff: 'Spotify', aussprache: 'Spotifai' },
  { begriff: 'Netflix', aussprache: 'Nätflix' },
  { begriff: 'Photoshop', aussprache: 'Fotoschopp' },
  { begriff: 'Windows', aussprache: 'Uindous' },
  { begriff: 'Chrome', aussprache: 'Kroum' },
  { begriff: 'Gmail', aussprache: 'Dschi-Mäil' },
  { begriff: 'Outlook', aussprache: 'Autluck' },
  { begriff: 'Teams', aussprache: 'Tiems' },
  { begriff: 'Zoom', aussprache: 'Suum' },
  { begriff: 'Facebook', aussprache: 'Fäisbuck' },

  // Technik-Kürzel
  { begriff: 'API', aussprache: 'A P I' },
  { begriff: 'TTS', aussprache: 'Tee Tee Ess' },
  { begriff: 'STT', aussprache: 'Ess Tee Tee' },
  { begriff: 'URL', aussprache: 'U R L' },
  { begriff: 'USB', aussprache: 'U S B' },
  { begriff: 'PDF', aussprache: 'P D F' },
  { begriff: 'CSV', aussprache: 'Tse Ess Fau' },
  { begriff: 'HTML', aussprache: 'Ha Te Em El' },
  { begriff: 'JSON', aussprache: 'Dschäisn' },
  { begriff: 'PNG', aussprache: 'Pe En Ge' },
  { begriff: 'JPG', aussprache: 'Jott Pe Ge' },
  { begriff: 'CPU', aussprache: 'Tse Pe U' },
  { begriff: 'GPU', aussprache: 'Ge Pe U' },
  { begriff: 'SSD', aussprache: 'Ess Ess De' },
  { begriff: 'PC', aussprache: 'Pe Tse' },
  { begriff: 'WLAN', aussprache: 'We Lan' },
  { begriff: 'SEO', aussprache: 'Ess E O' },
  { begriff: 'FAQ', aussprache: 'Eff A Kuh' },
  { begriff: 'ID', aussprache: 'I D', gross: true, exakt: true },
  { begriff: 'npm', aussprache: 'En Pe Em' },
  { begriff: 'Node.js', aussprache: 'Noud Dschäi Ess' },
  { begriff: 'GitHub', aussprache: 'Gitthab' },

  // Englische Wörter, die im Alltag vorkommen (bei Bedarf entfernen, falls das TTS sie schon richtig spricht)
  { begriff: 'Cron', aussprache: 'Kron' },
  { begriff: 'Chat', aussprache: 'Tschätt' },
  { begriff: 'Backup', aussprache: 'Bäkapp' },
  { begriff: 'Gateway', aussprache: 'Gäitwäi' },
  { begriff: 'Cloud', aussprache: 'Klaud' },
  { begriff: 'Download', aussprache: 'Daunloud' },

  // Einheiten
  { begriff: 'GB', aussprache: 'Gigabyte', gross: true, exakt: true },
  { begriff: 'MB', aussprache: 'Megabyte', gross: true, exakt: true },
  { begriff: 'TB', aussprache: 'Terabyte', gross: true, exakt: true },

  // Abkürzungen (Leerzeichen sind egal: "z. B." = "z.B.")
  { begriff: 'z. B.', aussprache: 'zum Beispiel' },
  { begriff: 'd. h.', aussprache: 'das heißt' },
  { begriff: 'u. a.', aussprache: 'unter anderem' },
  { begriff: 'usw.', aussprache: 'und so weiter' },
  { begriff: 'etc.', aussprache: 'et cetera' },
  { begriff: 'bzw.', aussprache: 'beziehungsweise' },
  { begriff: 'ca.', aussprache: 'circa' },
  { begriff: 'ggf.', aussprache: 'gegebenenfalls' },
  { begriff: 'evtl.', aussprache: 'eventuell' },
  { begriff: 'inkl.', aussprache: 'inklusive' },
  { begriff: 'zzgl.', aussprache: 'zuzüglich' },
  { begriff: 'Nr.', aussprache: 'Nummer' },
  { begriff: 'Mio.', aussprache: 'Millionen' },
  { begriff: 'Mrd.', aussprache: 'Milliarden' }
]

// ---------------------------------------------------------------------------------------------
// Zahlen, Preise, Daten, Uhrzeiten und Nummern sprechbar machen
// ---------------------------------------------------------------------------------------------
// "39,90 €" -> "neununddreißig Euro neunzig", "3.10." -> "dritter Oktober",
// "14:30 Uhr" -> "vierzehn Uhr dreißig", "Bestellnummer 123456" -> "... eins zwei drei, vier fünf sechs".
// Abschalten: ausspracheAnwenden(text, eintraege, { zahlen: false })

const ZIFFERN = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun']
const EINER = [
  'null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'
]
const ZEHNER = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]
// Wörter, nach denen ein Datum im Dativ/Akkusativ steht: "am dritten Oktober"
const DATIV_VOR_DATUM = new Set(['am', 'vom', 'zum', 'dem', 'den', 'im', 'ab', 'bis', 'seit', 'vor', 'nach', 'von', 'zu', 'um'])

function unter100(n, attributiv) {
  if (n < 20) return n === 1 && attributiv ? 'ein' : EINER[n]
  const einer = n % 10
  const zehner = ZEHNER[Math.floor(n / 10)]
  return einer ? `${einer === 1 ? 'ein' : EINER[einer]}und${zehner}` : zehner
}

function unter1000(n, attributiv) {
  const hunderter = Math.floor(n / 100)
  const rest = n % 100
  return (hunderter ? `${hunderter === 1 ? 'ein' : EINER[hunderter]}hundert` : '') + (rest ? unter100(rest, attributiv) : '')
}

// Ziffernfolgen (Nummern, Telefon) in 3er-Gruppen, jede Ziffer einzeln; Komma = kurze Pause.
function ziffernSprechen(ziffern) {
  const gruppen = String(ziffern).match(/\d{1,3}/g) ?? []
  if (gruppen.length > 1 && gruppen.at(-1).length === 1) {
    const davor = gruppen[gruppen.length - 2]
    gruppen[gruppen.length - 2] = davor.slice(0, 2)
    gruppen[gruppen.length - 1] = davor.slice(2) + gruppen.at(-1)
  }
  return gruppen.map((gruppe) => [...gruppe].map((z) => ZIFFERN[z]).join(' ')).join(', ')
}

// attributiv: "ein Euro", "ein Uhr", "einundzwanzig Stück" statt "eins"
export function zahlZuWort(n, attributiv = false) {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) return ziffernSprechen(String(n))
  if (n === 0) return 'null'
  const teile = []
  const milliarden = Math.floor(n / 1e9)
  const millionen = Math.floor((n % 1e9) / 1e6)
  const rest = n % 1e6
  if (milliarden) teile.push(milliarden === 1 ? 'eine Milliarde' : `${unter1000(milliarden, true)} Milliarden`)
  if (millionen) teile.push(millionen === 1 ? 'eine Million' : `${unter1000(millionen, true)} Millionen`)
  if (rest) {
    const tausender = Math.floor(rest / 1000)
    const einheiten = rest % 1000
    teile.push(
      (tausender ? `${unter1000(tausender, true)}tausend` : '') + (einheiten ? unter1000(einheiten, attributiv) : '')
    )
  }
  return teile.join(' ')
}

// "dritt" + er/en/e; 1-19 mit "t", ab 20 mit "st"
function ordinalStamm(n) {
  const sonder = { 1: 'erst', 3: 'dritt', 7: 'siebt', 8: 'acht' }
  if (n < 20) return sonder[n] ?? `${EINER[n]}t`
  return `${zahlZuWort(n)}st`
}

function jahrSprechen(jahr) {
  let j = Number(jahr)
  if (String(jahr).length === 2) j += j <= 69 ? 2000 : 1900
  if (j >= 1100 && j <= 1999) {
    const rest = j % 100
    return `${unter100(Math.floor(j / 100), true)}hundert${rest ? unter100(rest, false) : ''}`
  }
  return zahlZuWort(j)
}

function datumEndung(text, position) {
  const wort = text.slice(0, position).match(/(\p{L}+)\s*$/u)?.[1]?.toLocaleLowerCase('de-DE')
  if (!wort) return 'er'
  if (wort === 'der') return 'e'
  return DATIV_VOR_DATUM.has(wort) ? 'en' : 'er'
}

function datumSprechen(tag, monat, jahr, text, position) {
  const teile = [ordinalStamm(Number(tag)) + datumEndung(text, position), MONATE[Number(monat) - 1]]
  if (jahr) teile.push(jahrSprechen(jahr))
  return teile.join(' ')
}

function preisSprechen(ganz, cent, waehrung) {
  const euro = Number(ganz.replace(/\./g, ''))
  const c = cent ? Number(cent.padEnd(2, '0')) : 0
  const name = /^(€|eur|euro)$/i.test(waehrung) ? 'Euro' : /^chf$/i.test(waehrung) ? 'Franken' : 'Dollar'
  if (!euro && c) return `${zahlZuWort(c)} Cent`
  return `${zahlZuWort(euro, true)} ${name}${c ? ` ${zahlZuWort(c)}` : ''}`
}

const KEIN_WORT = String.raw`\p{L}\p{N}_`
const ENDE_ZAHL = String.raw`(?![${KEIN_WORT}]|[.,]\d)`
const ZAHL_TEIL = String.raw`\d{1,3}(?:\.\d{3})+|\d+`
const VOR_DATUM = String.raw`(?<![${KEIN_WORT}.,:/-])`
const TAG = String.raw`0?[1-9]|[12]\d|3[01]`

const KENNUNG = new RegExp(
  String.raw`(?<![${KEIN_WORT}])(?<wort>(?:(?:Bestell|Auftrags|Rechnungs|Sendungs|Kunden|Artikel|Tracking|Paket)[\s-]?(?:nummer|nr\.?|id)|Order[\s-]?(?:nummer|nr\.?|id|number)?|Nr\.|Nummer|#))(?<trenner>\s*:?\s*#?\s*)(?<ziffern>\d{3,}(?:-\d+)*)${ENDE_ZAHL}`,
  'giu'
)
const PLZ = new RegExp(String.raw`(?<![${KEIN_WORT}])(?<wort>PLZ|Postleitzahl)(?<trenner>\s*:?\s*)(?<ziffern>\d{5})${ENDE_ZAHL}`, 'giu')
const DATUM_ISO = new RegExp(String.raw`${VOR_DATUM}(?<jahr>\d{4})-(?<monat>0[1-9]|1[0-2])-(?<tag>0[1-9]|[12]\d|3[01])(?!\p{N})`, 'gu')
const DATUM_PUNKT = new RegExp(String.raw`${VOR_DATUM}(?<tag>${TAG})\.\s?(?<monat>0?[1-9]|1[0-2])\.(?:(?<jahr>\d{4}|\d{2}))?(?!\p{N})`, 'gu')
const DATUM_MONAT = new RegExp(
  String.raw`${VOR_DATUM}(?<tag>${TAG})\.\s?(?<monat>${MONATE.join('|')})(?!\p{L})(?:\s+(?<jahr>\d{4})(?!\p{N}))?`,
  'giu'
)
const UHRZEIT = new RegExp(String.raw`(?<![${KEIN_WORT}.,:])(?<h>[01]?\d|2[0-3]):(?<m>[0-5]\d)(?!\p{N}|:\d)(?:\s*Uhr(?!\p{L}))?`, 'gu')
const PREIS_NACH = new RegExp(
  String.raw`(?<![${KEIN_WORT}.,])(?<ganz>${ZAHL_TEIL})(?:,(?:(?<cent>\d{1,2})|-))?\s?(?<waehrung>€|EUR(?!\p{L})|Euro(?!\p{L})|\$|USD(?!\p{L})|Dollar(?!\p{L})|CHF(?!\p{L}))`,
  'giu'
)
const PREIS_VOR = new RegExp(
  String.raw`(?<![${KEIN_WORT}.,])(?<waehrung>€|\$)\s?(?<ganz>${ZAHL_TEIL})(?:,(?:(?<cent>\d{1,2})|-))?${ENDE_ZAHL}`,
  'gu'
)
const ZAHL = new RegExp(
  String.raw`(?<![${KEIN_WORT}.,])(?<minus>[-−](?=\d))?(?<ganz>${ZAHL_TEIL})(?:,(?<dez>\d+))?${ENDE_ZAHL}`,
  'gu'
)

// Kleiner Helfer: entpackt die Argumente von String.replace (benannte Gruppen kommen zuletzt)
const mit = (fn) => (...args) =>
  fn({ treffer: args[0], gruppen: args.at(-1), text: args.at(-2), position: args.at(-3) })

function zahlenSprechbar(eingabe) {
  return eingabe
    .replace(KENNUNG, mit(({ gruppen: g }) => {
      const wort = g.wort === '#' ? 'Nummer' : g.wort.trim()
      return `${wort} ${g.ziffern.split('-').map(ziffernSprechen).join(', ')}`
    }))
    .replace(PLZ, mit(({ gruppen: g }) => `${g.wort} ${[...g.ziffern].map((z) => ZIFFERN[z]).join(' ')}`))
    .replace(DATUM_ISO, mit(({ gruppen: g, text, position }) => datumSprechen(g.tag, g.monat, g.jahr, text, position)))
    .replace(DATUM_PUNKT, mit(({ gruppen: g, text, position }) => datumSprechen(g.tag, g.monat, g.jahr, text, position)))
    .replace(DATUM_MONAT, mit(({ gruppen: g, text, position }) => {
      const monat = MONATE.findIndex((m) => m.toLocaleLowerCase('de-DE') === g.monat.toLocaleLowerCase('de-DE')) + 1
      return datumSprechen(g.tag, monat, g.jahr, text, position)
    }))
    .replace(UHRZEIT, mit(({ gruppen: g }) => {
      const minuten = Number(g.m)
      return `${zahlZuWort(Number(g.h), true)} Uhr${minuten ? ` ${zahlZuWort(minuten)}` : ''}`
    }))
    .replace(PREIS_NACH, mit(({ gruppen: g }) => preisSprechen(g.ganz, g.cent, g.waehrung)))
    .replace(PREIS_VOR, mit(({ gruppen: g }) => preisSprechen(g.ganz, g.cent, g.waehrung)))
    .replace(ZAHL, mit(({ treffer, gruppen: g, text, position }) => {
      const ziffern = g.ganz.replace(/\./g, '')
      const minus = g.minus ? 'minus ' : ''
      // Führende Null (Telefon, Codes) oder sehr lang: Ziffern einzeln
      if ((ziffern.length > 1 && ziffern[0] === '0' && !g.dez && !g.ganz.includes('.')) || ziffern.length > 12) {
        return minus + ziffernSprechen(ziffern)
      }
      // "1 Stück", "21 Artikel": vor einem Hauptwort heißt es "ein", nicht "eins"
      const danach = text.slice(position + treffer.length)
      const attributiv = !g.dez && /^\s+\p{Lu}\p{Ll}/u.test(danach)
      const ganzWort = zahlZuWort(Number(ziffern), attributiv)
      const dezimal = g.dez ? ` Komma ${[...g.dez].map((z) => ZIFFERN[z]).join(' ')}` : ''
      return minus + ganzWort + dezimal
    }))
}

// Begriff -> Regex-Teil. Mehrere Wörter dürfen durch beliebig viele Leerzeichen getrennt sein;
// nach einem Punkt dürfen sie auch ganz fehlen ("z.B.").
function musterFuer(begriff) {
  const teile = begriff.split(' ').map(regexMaskieren)
  return teile.reduce((muster, teil, i) => {
    if (i === 0) return teil
    return muster + (teile[i - 1].endsWith('\\.') ? '\\s*' : '\\s+') + teil
  }, '')
}

let zwischenspeicher = { schluessel: null, ergebnis: null }

function kompilieren(eintraege) {
  const schluessel = JSON.stringify(eintraege)
  if (zwischenspeicher.schluessel === schluessel) return zwischenspeicher.ergebnis

  const gesehen = new Set()
  const regeln = []
  for (const eintrag of [...eintraege, ...STANDARD_AUSSPRACHE]) {
    const begriff = normalisieren(eintrag?.begriff)
    const aussprache = normalisieren(eintrag?.aussprache)
    const key = schluesselVon(begriff)
    if (!begriff || !aussprache || gesehen.has(key)) continue
    gesehen.add(key)
    regeln.push({
      begriff,
      aussprache,
      key,
      gross: eintrag.gross === true,
      // Endungen nur, wenn der Begriff mit Buchstabe/Ziffer endet (nicht bei "usw.")
      flexion: eintrag.exakt !== true && /[\p{L}\p{N}]$/u.test(begriff)
    })
  }

  // Längste zuerst, damit "Vendo" vor "Vendo" greift
  regeln.sort((a, b) => b.begriff.length - a.begriff.length)

  const nachSchluessel = new Map(regeln.map((regel) => [regel.key, regel]))
  const flex = regeln.filter((r) => r.flexion).map((r) => musterFuer(r.begriff))
  const fest = regeln.filter((r) => !r.flexion).map((r) => musterFuer(r.begriff))

  const alternativen = []
  if (flex.length) alternativen.push(`(?<flex>${flex.join('|')})(?<endung>${ENDUNGEN})?`)
  if (fest.length) alternativen.push(`(?<fest>${fest.join('|')})`)

  // Davor und danach darf kein Wortzeichen stehen. Ein Punkt direkt davor oder ein Punkt mit
  // Buchstabe danach heißt: Dateiname oder Domain ("daten.json", "shopify.com") -> nicht ersetzen.
  const muster = alternativen.length
    ? new RegExp(
        `(?<![${WORTZEICHEN}.])(?:${alternativen.join('|')})(?![${WORTZEICHEN}]|\\.[\\p{L}\\p{N}])`,
        'giu'
      )
    : null

  const ergebnis = { muster, nachSchluessel }
  zwischenspeicher = { schluessel, ergebnis }
  return ergebnis
}

function ersetzen(teil, { muster, nachSchluessel }, { zahlen }) {
  // Zahlen zuerst: "Nr. 12345" und "5 GB" werden erkannt, bevor Wörter ersetzt werden
  let ergebnis = zahlen ? zahlenSprechbar(teil) : teil
  for (const symbol of SYMBOLE) ergebnis = ergebnis.replace(symbol.muster, symbol.text)
  if (!muster) return ergebnis

  return ergebnis.replace(muster, (treffer, ...rest) => {
    const gruppen = rest[rest.length - 1]
    const gefunden = String(gruppen.flex ?? gruppen.fest ?? '')
    const regel = nachSchluessel.get(schluesselVon(gefunden))
    if (!regel) return treffer
    if (regel.gross && gefunden.replace(/\s+/g, '') !== regel.begriff.replace(/\s+/g, '')) return treffer
    return regel.aussprache + (gruppen.endung || '')
  })
}

export function ausspracheAnwenden(text, eintraege = [], { zahlen = true } = {}) {
  const eingabe = String(text ?? '')
  if (!eingabe) return eingabe

  const kompiliert = kompilieren(Array.isArray(eintraege) ? eintraege : [])
  // split mit Capture-Gruppe: gerade Stellen = normaler Text, ungerade = URL/E-Mail
  return eingabe
    .split(URL_MUSTER)
    .map((teil, i) => (i % 2 ? teil : ersetzen(teil, kompiliert, { zahlen })))
    .join('')
}

export { STANDARD_AUSSPRACHE }