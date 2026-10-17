// aussprache.js – ersetzt Begriffe vor dem Vorlesen durch eine Schreibweise,
// die das TTS richtig ausspricht.
//
// Eintrag: { begriff, aussprache, gross?, exakt? }
//   gross: true -> nur genau diese Groß-/Kleinschreibung treffen (Standard: egal)
//   exakt: true -> keine Endungen zulassen (Standard: "Hoodies", "PDFs", "Vendos" werden mitgetroffen)
//
// Eigene Einträge (aus den Einstellungen) gehen vor den Standard-Einträgen.
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
  { begriff: 'Jarves-OS', aussprache: 'Dscharwis O Ess' },
  { begriff: 'Jarves', aussprache: 'Dscharwis' },
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

  // Längste zuerst, damit "Jarves-OS" vor "Jarves" greift
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

function ersetzen(teil, { muster, nachSchluessel }) {
  let ergebnis = teil
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

export function ausspracheAnwenden(text, eintraege = []) {
  const eingabe = String(text ?? '')
  if (!eingabe) return eingabe

  const kompiliert = kompilieren(Array.isArray(eintraege) ? eintraege : [])
  // split mit Capture-Gruppe: gerade Stellen = normaler Text, ungerade = URL/E-Mail
  return eingabe
    .split(URL_MUSTER)
    .map((teil, i) => (i % 2 ? teil : ersetzen(teil, kompiliert)))
    .join('')
}

export { STANDARD_AUSSPRACHE }