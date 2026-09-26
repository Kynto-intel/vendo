// Meldungen: Luzzy sagt wichtige Ereignisse laut und listet sie rechts auf.
// Warteschlange: Sie redet nicht dazwischen, wenn Felix spricht oder sie gerade antwortet.
// Ruhezeit: in der eingestellten Zeit nur anzeigen, nicht vorlesen.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const SYMBOL = { bestellung: '◆', mail: '✉', job: '⚠', crew: '⚑', hinweis: 'ⓘ', termin: '◷' }

let h = { vorlesen: () => {}, istBeschaeftigt: () => false, einstellungen: () => ({}) }
const liste = []
const warteschlange = []
let gesammelt = null // während der Startsequenz: Meldungen sammeln statt einzeln vorlesen

// Sammeln an/aus; beim Ausschalten kommen die gesammelten Meldungen zurück (für die Begrüßung)
export function meldungenSammeln(an) {
  if (an) return (gesammelt = [])
  const liste = gesammelt || []
  gesammelt = null
  return liste
}

export function meldungenEinrichten(helfer) {
  h = { ...h, ...helfer }
  setInterval(abarbeiten, 1500)
  $('meldungen-leeren').addEventListener('click', () => {
    liste.length = 0
    zeigen()
  })
}

function inRuhezeit(e) {
  const [vh, vm] = String(e.ruheVon || '').split(':').map(Number)
  const [bh, bm] = String(e.ruheBis || '').split(':').map(Number)
  if ([vh, vm, bh, bm].some((n) => Number.isNaN(n))) return false
  const jetzt = new Date()
  const minute = jetzt.getHours() * 60 + jetzt.getMinutes()
  const von = vh * 60 + vm
  const bis = bh * 60 + bm
  return von <= bis ? minute >= von && minute < bis : minute >= von || minute < bis // über Mitternacht
}

function zeigen() {
  const el = $('meldungen-liste')
  $('meldungen-leeren').hidden = !liste.length
  if (!liste.length) return (el.innerHTML = '<div class="leise">Alles ruhig.</div>')
  el.innerHTML = liste
    .slice(0, 12)
    .map((m) => {
      const zeit = new Date(m.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      return `<div class="meldung meldung-${m.art}">
        <span class="meldung-symbol">${SYMBOL[m.art] || '•'}</span>
        <div><div class="meldung-titel">${maskieren(m.titel)}</div>${m.anzeige ? `<div class="meldung-text">${maskieren(m.anzeige)}</div>` : ''}</div>
        <time>${zeit}</time>
      </div>`
    })
    .join('')
}

export function meldungNeu(m) {
  const e = h.einstellungen()?.meldungen || {}
  if (m.art !== 'hinweis' && e[m.art] === false) return // Art abgeschaltet
  liste.unshift(m)
  liste.length = Math.min(liste.length, 40)
  zeigen()
  if (gesammelt) return gesammelt.push(m)
  if (m.art !== 'hinweis' && e.vorlesen !== false && !inRuhezeit(e)) warteschlange.push(m.text)
}

export function problemNeu(p) {
  const namen = { shopify: 'Shopify', mail: 'Postfach', jobs: 'Jobs' }
  meldungNeu({ art: 'hinweis', titel: `${namen[p.quelle] || p.quelle}: nicht erreichbar`, anzeige: p.text, zeit: Date.now() })
}

function abarbeiten() {
  if (!warteschlange.length || h.istBeschaeftigt()) return
  // Mehrere auf einmal zusammenfassen, damit Luzzy nicht ewig redet
  const texte = warteschlange.splice(0, warteschlange.length)
  h.vorlesen(texte.length > 3 ? `${texte.slice(0, 3).join(' ')} Und noch ${texte.length - 3} weitere Meldungen.` : texte.join(' '))
}

zeigen()
