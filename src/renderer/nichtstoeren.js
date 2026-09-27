// „Nicht stören“ per Sprache oder Text erkennen, z. B.
//   „Luzzy, bis 15 Uhr keine Meldungen“ · „Nicht stören für 30 Minuten“ · „Bitte nicht stören“ (1 Stunde)
//   „Meldungen wieder an“ · „Du darfst wieder stören“
// Nur ganze Sätze, die genau das meinen. Alles andere geht normal an Luzzy.

const STANDARD_MINUTEN = 60

const AN = new Set([
  'nicht stören', 'nicht stören an', 'nicht stören modus', 'nicht stören modus an', 'mach nicht stören an',
  'keine meldungen', 'keine meldungen mehr', 'keine ansagen', 'keine ansagen mehr', 'ich will keine meldungen',
  'ruhe', 'ich brauche ruhe', 'ich will meine ruhe', 'lass mich in ruhe'
])
const AUS = new Set([
  'nicht stören aus', 'nicht stören beenden', 'mach nicht stören aus', 'nicht stören modus aus',
  'meldungen wieder an', 'meldungen an', 'ansagen wieder an', 'du darfst wieder stören', 'stör mich wieder',
  'ruhe vorbei', 'ruhe ist vorbei'
])
const ZAHLEN = {
  ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, neunzig: 90
}
const zahl = (w) => (/^\d+$/.test(w) ? Number(w) : ZAHLEN[w])

function saeubern(text) {
  return String(text || '').toLowerCase()
    .replace(/[,!?;"„“]/g, ' ')
    .replace(/\.(?!\d)/g, ' ') // Punkt am Satzende weg, „15.30“ bleibt
    .replace(/\bbitte\b/g, ' ')
    .replace(/\bnicht-stören\b/g, 'nicht stören')
    .replace(/^\s*(hey\s+)?luzzy\b/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// „bis 15 Uhr“ → Zeitpunkt. Liegt die Uhrzeit schon hinter uns, ist der Nachmittag (3 → 15 Uhr) oder morgen gemeint.
function bisUhrzeit(stunde, minute, jetzt) {
  if (!(stunde >= 0 && stunde <= 24 && minute >= 0 && minute < 60)) return null
  const ziel = new Date(jetzt)
  ziel.setHours(stunde, minute, 0, 0)
  if (ziel <= jetzt && stunde < 12) ziel.setHours(stunde + 12)
  if (ziel <= jetzt) ziel.setDate(ziel.getDate() + 1)
  return ziel.getTime()
}

// Liefert { an: bisZeitpunkt } oder { aus: true } oder null (kein Nicht-stören-Befehl)
export function nichtStoerenErkennen(text, jetzt = new Date()) {
  let s = saeubern(text)
  if (AUS.has(s)) return { aus: true }
  let bis = null
  // „bis 15 Uhr“, „bis 15:30“, „bis drei uhr“
  s = s.replace(/(?:^| )bis (\d{1,2}|[a-zäöüß]+)(?:[:.](\d{2}))?(?: uhr)?(?= |$)/, (treffer, h, m) => {
    const stunde = zahl(h)
    if (stunde == null) return treffer
    bis = bisUhrzeit(stunde, Number(m || 0), jetzt)
    return ' '
  })
  // „für 30 Minuten“, „eine Stunde“, „für eine halbe Stunde“, „die nächsten zwei Stunden“
  if (bis == null) {
    s = s.replace(/(?:^| )(?:für )?(?:die nächsten )?(?:(\d+|[a-zäöüß]+) )?(halbe )?(minute|minuten|stunde|stunden)(?= |$)/, (treffer, anzahl, halbe, einheit) => {
      const n = anzahl === 'halbe' ? 0.5 : anzahl ? zahl(anzahl) : 1
      if (n == null) return treffer
      const minuten = (halbe ? 0.5 : n) * (einheit.startsWith('stunde') ? 60 : 1)
      bis = jetzt.getTime() + minuten * 60000
      return ' '
    })
  }
  s = s.replace(/\s+/g, ' ').trim()
  if (!AN.has(s)) return null
  return { an: bis ?? jetzt.getTime() + STANDARD_MINUTEN * 60000 }
}

export const uhrzeitText = (zeit) => new Date(zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
