// Gemeinsame Helfer, um Zeiten aus gesprochenen oder getippten Sätzen zu lesen
// (genutzt von „Nicht stören“ und Timer/Wecker).

export const ZAHLEN = {
  ein: 1, eine: 1, einen: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  neunzehn: 19, zwanzig: 20, fünfundzwanzig: 25, dreißig: 30, vierzig: 40, fünfundvierzig: 45, fünfzig: 50, sechzig: 60, neunzig: 90,
  halbe: 0.5, halben: 0.5, anderthalb: 1.5, eineinhalb: 1.5
}
// „15“, „1,5“, „fünfzehn“ → Zahl (sonst undefined)
export const zahl = (w) => (/^\d+([.,]\d+)?$/.test(w) ? Number(w.replace(',', '.')) : ZAHLEN[w])

// Kleinschreibung, Satzzeichen weg, „bitte“ und ein vorangestelltes „(Hey) Luzzy“ weg
export function saeubern(text) {
  return String(text || '').toLowerCase()
    .replace(/[,!?;"„“]/g, (z, i, s) => (z === ',' && /\d,\d/.test(s.slice(i - 1, i + 2)) ? z : ' ')) // „1,5“ bleibt
    .replace(/\.(?!\d)/g, ' ') // Punkt am Satzende weg, „15.30“ bleibt
    .replace(/\bbitte\b/g, ' ')
    .replace(/^\s*(hey\s+)?luzzy\b/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Uhrzeit → nächster passender Zeitpunkt. Liegt sie schon hinter uns, ist (wenn nachmittag erlaubt)
// der Nachmittag gemeint (3 → 15 Uhr), sonst morgen.
export function uhrzeitZiel(stunde, minute, jetzt = new Date(), { nachmittag = true } = {}) {
  if (!(Number.isInteger(stunde) && stunde >= 0 && stunde <= 24 && minute >= 0 && minute < 60)) return null
  const ziel = new Date(jetzt)
  ziel.setHours(stunde, minute, 0, 0)
  if (ziel <= jetzt && nachmittag && stunde < 12) ziel.setHours(stunde + 12)
  if (ziel <= jetzt) ziel.setDate(ziel.getDate() + 1)
  return ziel.getTime()
}

const EINHEIT = { sekunde: 1000, sekunden: 1000, minute: 60000, minuten: 60000, stunde: 3600000, stunden: 3600000 }
const TEIL = /(?:(\d+(?:[.,]\d+)?|[a-zäöüß]+) )?(?:(halben?) )?(sekunden?|minuten?|stunden?)(?= |$)/g

// Dauer im Satz finden, z. B. „15 Minuten“, „eine halbe Stunde“, „1 Stunde und 30 Minuten“, „anderthalb Stunden“.
// Liefert { ms, rest } (rest = Satz ohne die Dauer) oder null.
export function dauerFinden(s) {
  let ms = 0
  const rest = s.replace(TEIL, (treffer, anzahl, halbe, einheit) => {
    const n = halbe ? (anzahl && zahl(anzahl) !== 1 ? zahl(anzahl) + 0.5 : 0.5) : anzahl ? zahl(anzahl) : 1
    if (n == null) return treffer
    ms += n * EINHEIT[einheit]
    return ' '
  })
  if (!ms) return null
  return { ms: Math.round(ms), rest: rest.replace(/\b(und|für|von|auf|in) (?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() }
}

// „um 7 Uhr“, „um 14:30“, „um halb acht“ im Satz finden → { stunde, minute, rest } oder null
export function uhrzeitFinden(s) {
  let ergebnis = null
  const rest = s.replace(/(?:^| )(um|auf|für) (?:(halb) )?(\d{1,2}|[a-zäöüß]+)(?:[:.](\d{2}))?( uhr)?(?= |$)/, (treffer, vor, halb, h, m, uhr) => {
    let stunde = zahl(h)
    if (stunde == null || !Number.isInteger(stunde)) return treffer
    // „um 7“ ist eine Uhrzeit, „auf 15“ oder „für 10“ nur mit „Uhr“ oder Minuten („auf 7:30“)
    if (vor !== 'um' && !uhr && m == null && !halb) return treffer
    let minute = Number(m || 0)
    if (halb) {
      stunde -= 1 // „halb acht“ = 7:30
      minute = 30
    }
    ergebnis = { stunde, minute }
    return ' '
  })
  return ergebnis && { ...ergebnis, rest: rest.replace(/\s+/g, ' ').trim() }
}
