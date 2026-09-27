// PC-Steuerung per Stimme (#30), ohne KI, direkt auf dem PC:
//   „Öffne Photoshop“ · „Starte Spotify“ · „Öffne den Browser und geh auf Netflix und such da Terminator“
//   „Such auf YouTube nach Wikinger Musik“ · „Spiel Metallica auf YouTube“ · „Öffne Chrome und geh auf chefkoch.de“
//   „Lauter“ · „Viel leiser“ · „Lautstärke auf 30 Prozent“ · „Ton aus“ · „Nächstes Lied“ · „Musik Pause“
//   „Öffne Downloads“ · „Sperr den PC“
// Ausgeführt wird im Hauptprozess (src/main/pc.js), dort wird jede Aktion geprüft.

const api = window.jarves
const e = encodeURIComponent

// Bekannte Seiten: Startseite und Suche. app: gibt es sie als App, wird ohne Suchbegriff die App geöffnet.
const SEITEN = [
  { name: 'YouTube', worte: ['youtube', 'you tube'], start: 'https://www.youtube.com', suche: (q) => `https://www.youtube.com/results?search_query=${e(q)}` },
  { name: 'Netflix', worte: ['netflix'], start: 'https://www.netflix.com', suche: (q) => `https://www.netflix.com/search?q=${e(q)}`, app: 'Netflix' },
  { name: 'Google Maps', worte: ['google maps', 'maps', 'karten'], start: 'https://www.google.com/maps', suche: (q) => `https://www.google.com/maps/search/${e(q)}` },
  { name: 'Google', worte: ['google'], start: 'https://www.google.com', suche: (q) => `https://www.google.com/search?q=${e(q)}` },
  { name: 'Prime Video', worte: ['prime video', 'amazon prime', 'prime'], start: 'https://www.amazon.de/gp/video/storefront', suche: (q) => `https://www.amazon.de/s?k=${e(q)}&i=instant-video`, app: 'Prime Video' },
  { name: 'Amazon', worte: ['amazon'], start: 'https://www.amazon.de', suche: (q) => `https://www.amazon.de/s?k=${e(q)}` },
  { name: 'Spotify', worte: ['spotify'], start: 'https://open.spotify.com', suche: (q) => `https://open.spotify.com/search/${e(q)}`, app: 'Spotify' },
  { name: 'Wikipedia', worte: ['wikipedia'], start: 'https://de.wikipedia.org', suche: (q) => `https://de.wikipedia.org/w/index.php?search=${e(q)}` },
  { name: 'eBay', worte: ['ebay'], start: 'https://www.ebay.de', suche: (q) => `https://www.ebay.de/sch/i.html?_nkw=${e(q)}` },
  { name: 'Etsy', worte: ['etsy'], start: 'https://www.etsy.com/de', suche: (q) => `https://www.etsy.com/de/search?q=${e(q)}` },
  { name: 'Twitch', worte: ['twitch'], start: 'https://www.twitch.tv', suche: (q) => `https://www.twitch.tv/search?term=${e(q)}` },
  { name: 'Pinterest', worte: ['pinterest'], start: 'https://www.pinterest.de', suche: (q) => `https://www.pinterest.de/search/pins/?q=${e(q)}` },
  { name: 'TikTok', worte: ['tiktok', 'tik tok'], start: 'https://www.tiktok.com', suche: (q) => `https://www.tiktok.com/search?q=${e(q)}` },
  { name: 'Instagram', worte: ['instagram'], start: 'https://www.instagram.com', suche: (q) => `https://www.instagram.com/explore/tags/${e(q.replace(/\s+/g, ''))}/` },
  { name: 'Facebook', worte: ['facebook'], start: 'https://www.facebook.com', suche: (q) => `https://www.facebook.com/search/top?q=${e(q)}` },
  { name: 'Disney+', worte: ['disney plus', 'disney'], start: 'https://www.disneyplus.com', app: 'Disney+' },
  { name: 'Shopify', worte: ['shopify'], start: 'https://admin.shopify.com' },
  { name: 'Gmail', worte: ['gmail'], start: 'https://mail.google.com' }
]
const BROWSER = ['google chrome', 'chrome', 'firefox', 'microsoft edge', 'edge', 'opera', 'brave']
const DOMAIN = /(?<![\p{L}\p{N}.-])((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:de|com|net|org|tv|io|eu|at|ch|shop|info|app|co\.uk))(?![\p{L}\p{N}-])/iu

const wort = (liste) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${liste})(?![\\p{L}\\p{N}])`, 'iu')
const OEFFNEN = wort('öffne|öffnen|oeffne|starte|start|starten|geh|gehe|besuch|besuche|ruf|mach')
const SUCHEN = wort('such|suche|suchen|finde|find|schau|spiel|spiele|abspielen')
// Wörter, die nicht zum Suchbegriff gehören
const FUELL = new Set(('such suche suchen finde find schau spiel spiele abspielen ab öffne öffnen oeffne starte start starten geh gehe besuch besuche ruf ' +
  'auf mach und da dort darauf drauf dann mal mir bitte nach bei in im mit den die das der dem ein eine einen browser internet seite webseite website ' +
  'noch kurz schnell hey luzzy ok jetzt nachher gleich').split(' '))

const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

function seiteIn(s) {
  for (const seite of SEITEN) for (const w of seite.worte) if (wort(w).test(s)) return { seite, wortGefunden: w }
  return null
}

// Satz → Plan (oder null, wenn es keine PC-Steuerung ist). Nur erkennen, noch nichts ausführen.
export function pcBefehlErkennen(text) {
  const satz = ohneLuzzy(text).replace(/[.!?]+\s*$/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const s = satz.toLowerCase()
  if (!s) return null

  // Lautstärke und Musik
  let t = /^(?:mach |dreh |stell )?(?:(?:die |den )?(?:musik|ton|lautstärke|sound) )?(etwas |ein bisschen |ein wenig |viel |ganz |deutlich )?(lauter|leiser)(?: bitte)?$/.exec(s)
  if (t) {
    const menge = /viel|ganz|deutlich/.test(t[1] || '') ? 12 : /etwas|bisschen|wenig/.test(t[1] || '') ? 2 : 5
    return { art: 'taste', taste: t[2], anzahl: menge, sagen: t[2] === 'lauter' ? 'Lauter.' : 'Leiser.' }
  }
  if (/^(?:(?:den |die )?(?:ton|musik|sound) (?:aus|stumm)(?: schalten)?|stumm(?: schalten)?|mute|(?:den )?ton (?:wieder )?an)$/.test(s)) return { art: 'taste', taste: 'stumm', sagen: '' }
  t = /^(?:stell |mach |setz )?(?:die )?lautstärke (?:auf )?(\d{1,3}) ?(?:%|prozent)?$/.exec(s)
  if (t) return { art: 'lautstaerke', prozent: Math.min(100, Number(t[1])), sagen: `Lautstärke auf ${Math.min(100, Number(t[1]))} Prozent.` }
  if (/^(?:(?:die )?musik (?:pause|pausieren|anhalten|stoppen)|pausier(?:e)? (?:die )?musik|pause|(?:die )?musik weiter|spiel (?:die musik )?weiter|weiter ?spielen|musik fortsetzen)$/.test(s)) return { art: 'taste', taste: 'abspielen', sagen: '' }
  if (/^(?:(?:das )?nächste[rs]? (?:lied|song|titel|track)|(?:lied|song) (?:überspringen|weiter)|überspringen)$/.test(s)) return { art: 'taste', taste: 'weiter', sagen: '' }
  if (/^(?:(?:das )?(?:vorherige[rs]?|letzte[rs]?) (?:lied|song|titel|track)|(?:lied|song) zurück)$/.test(s)) return { art: 'taste', taste: 'zurueck', sagen: '' }

  // PC sperren
  if (/^(?:sperr|sperre)(?: den| meinen)? (?:pc|computer|rechner|bildschirm)$/.test(s)) return { art: 'sperren', sagen: 'Ich sperre den PC.' }

  // Ordner
  t = /^(?:öffne|oeffne|zeig|zeige|mach)(?: mir)?(?: mal)?(?: den| die| das| meinen| meine| mein)?(?: ordner)? (desktop|downloads?|dokumente|bilder|fotos|musik|videos|donnerwolf|jarves(?: os)?)(?:[ -]?ordner)?(?: auf)?$/.exec(s)
  if (t) return { art: 'ordner', name: t[1], sagen: '' }

  // Geht es um eine Datei („öffne die Datei Netflix-Rechnung“), ist das Sache der Dateisuche
  if (/(?<![\p{L}])(datei|dokument|pdf|tabelle|notiz|excel|word)(?![\p{L}])/iu.test(s)) return null
  const oeffnen = OEFFNEN.test(s)
  const suchen = SUCHEN.test(s)
  const googleVorn = /^google /.test(s)
  if (!oeffnen && !suchen && !googleVorn) return null

  // Web: bekannte Seite, Adresse oder Browser im Satz
  const browser = BROWSER.find((b) => wort(b).test(s)) || null
  let rest = s
  if (browser) rest = rest.replace(wort(browser), ' ')
  const domain = DOMAIN.exec(rest)?.[1] || null
  if (domain) rest = rest.replace(domain, ' ')
  const gefunden = domain ? null : seiteIn(rest)
  if (gefunden) rest = rest.replace(wort(gefunden.wortGefunden), ' ')
  const browserWort = /(?<![\p{L}])(browser|internet)(?![\p{L}])/iu.test(s)
  if (gefunden || domain || browser || browserWort || googleVorn) {
    // Suchbegriff: aus dem Teil mit „such/finde/spiel …“ (oder alles nach „google …“)
    let begriff = ''
    const teil = rest.split(/(?<![\p{L}])und(?![\p{L}])/u).find((x) => SUCHEN.test(x)) || (googleVorn ? rest.replace(/^google/, '') : '')
    if (teil) begriff = teil.split(/\s+/).filter((w) => w && !FUELL.has(w)).join(' ').trim()
    const seite = gefunden?.seite || (googleVorn && !domain ? SEITEN.find((x) => x.name === 'Google') : null)
    if (begriff && seite?.suche) return { art: 'web', url: seite.suche(begriff), browser, sagen: `Ich suche auf ${seite.name} nach ${begriff}.` }
    if (begriff && domain) return { art: 'web', url: SEITEN.find((x) => x.name === 'Google').suche(`site:${domain} ${begriff}`), browser, sagen: `Ich suche auf ${domain} nach ${begriff}.` }
    if (begriff && !seite && !domain) return { art: 'web', url: SEITEN.find((x) => x.name === 'Google').suche(begriff), browser, sagen: `Ich suche im Internet nach ${begriff}.` }
    if (seite) return { art: 'web', url: seite.start, browser, app: !browser && !browserWort ? seite.app : null, sagen: `Ich öffne ${seite.name}.` }
    if (domain) return { art: 'web', url: `https://${domain}`, browser, sagen: `Ich öffne ${domain}.` }
    if (browser && !browserWort) return { art: 'programm', name: browser, sagen: '' } // „Starte Firefox“
    return { art: 'web', url: 'https://www.google.com', browser, sagen: 'Ich öffne den Browser.' }
  }

  // Programm: „Öffne Photoshop“, „Starte das Programm OBS“, „Mach Discord auf“
  t = /^(?:öffne|oeffne|öffnen|starte|start|mach)(?: mir)?(?: mal| bitte| doch)*(?: das programm| die app| das spiel| den| die| das)? (.+?)(?: auf)?$/.exec(s)
  if (t && !/^(?:datei|dokument|bild|foto|pdf|video|tabelle|notiz|ordner)(?![\p{L}])/u.test(t[1])) {
    const name = t[1].replace(/(?<![\p{L}])(programm|app|bitte|mal)(?![\p{L}])/giu, ' ').replace(/\s+/g, ' ').trim()
    if (name && name.split(' ').length <= 5) return { art: 'programm', name, sagen: '' }
  }
  return null
}

// Plan ausführen. Gibt Luzzys Satz zurück, oder null, wenn nichts passte (dann geht der Satz weiter an Luzzy).
// bereichOeffnen(name): Jarves-Bereiche („Öffne Kalender“) gehen vor Programmen.
export async function pcAusfuehren(plan, { bereichOeffnen = () => false } = {}) {
  if (plan.art === 'programm') {
    if (bereichOeffnen(plan.name)) return `Hier ist ${plan.name.charAt(0).toUpperCase()}${plan.name.slice(1)}.`
    const r = await api.pc.aktion({ art: 'programm', name: plan.name })
    return r?.gefunden ? `${r.name} startet.` : null
  }
  if (plan.art === 'web' && plan.app) {
    // „Öffne Netflix“ ohne Browser und ohne Suche: die App, wenn es sie gibt
    const r = await api.pc.aktion({ art: 'programm', name: plan.app })
    if (r?.gefunden) return `Ich öffne ${r.name}.`
  }
  if (plan.art === 'ordner') {
    const r = await api.pc.aktion({ art: 'ordner', name: plan.name.replace(/ os$/, '') })
    return r?.gefunden ? `Hier ist der Ordner ${plan.name.charAt(0).toUpperCase()}${plan.name.slice(1)}.` : null
  }
  const { sagen, app, ...aktion } = plan
  await api.pc.aktion(aktion)
  return sagen || 'Erledigt.'
}
