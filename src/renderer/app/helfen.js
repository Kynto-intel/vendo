export const STOPPWOERTER = new Set([
  'stopp', 'stop', 'halt', 'sei still', 'hör auf', 'schluss', 'genug', 'das reicht', 'danke das reicht',
  'ok stopp', 'okay stopp', 'still', 'pst', 'psst', 'schon gut'
])

export function maskieren(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

export function klartext(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const WIEDERHOLEN = new Set([
  'wiederhol', 'wiederhole', 'wiederhol das', 'wiederhole das', 'wiederhol es', 'wiederhole es',
  'wiederhol das nochmal', 'wiederhole das nochmal', 'wiederhol das noch mal', 'wiederhole das noch mal',
  'sag das nochmal', 'sag das noch mal', 'sag es nochmal', 'sag es noch mal', 'kannst du das wiederholen',
  'was hast du gesagt', 'was hast du gerade gesagt', 'wie'
])

export function istWiederholen(text) {
  const kern = text.toLowerCase()
    .replace(/[.,!?;:"„“]/g, ' ')
    .replace(/\bbitte\b/g, ' ')
    .replace(/^\s*(hey\s+)?luzzy\b/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return WIEDERHOLEN.has(kern)
}