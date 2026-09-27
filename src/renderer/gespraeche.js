// Mehrere Gespräche (#27): Themen getrennt halten (Shop, Privat, ein Projekt). Jedes Thema ist eine eigene
// Hermes-Unterhaltung, Luzzy behält pro Thema den Faden. Auswahl oben im Gesprächsfenster oder per Stimme:
//   „Neues Gespräch Shop“ · „Wechsel zum Gespräch Privat“ · „Welche Gespräche gibt es?“

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

const NEU = /^(?:neues|neuer|ein neues|starte ein neues|mach ein neues|leg ein neues)\s+(?:gespräch|thema|chat)(?:\s+(?:über|zu|zum|zur|für|namens|mit dem namen))?\s*[:,]?\s*(.*)$/i
const WECHSEL = /^(?:wechsel|wechsle|wechseln|geh|gehe|spring|zurück)(?: mal| bitte| doch)*(?: zu| zum| zur| in das| ins| in| auf)?(?: dem| das| den)?\s+(?:gespräch|thema|chat)\s+(.+)$/i
const LISTE = /^(?:welche (?:gespräche|themen) (?:gibt es|habe ich|hab ich)|zeig(?: mir)? (?:die |meine )?(?:gespräche|themen)|meine gespräche|welches gespräch(?: ist offen| ist das)?|in welchem gespräch (?:bin ich|sind wir))$/i

let stand = { liste: [], aktiv: 'Allgemein' }
let h = { darfWechseln: () => true, vorWechsel: () => {}, beiFehler: () => {} }

function zeigen() {
  $('gespraech-thema').textContent = stand.aktiv
  const menue = $('gespraech-menue')
  menue.innerHTML = `${stand.liste
    .map((g) => `<div class="gm-eintrag${g.name === stand.aktiv ? ' aktiv' : ''}" data-name="${maskieren(g.name)}" tabindex="0">
        <span>${maskieren(g.name)}</span>${g.name === stand.aktiv ? '<small>offen</small>' : '<button class="gm-weg" type="button" title="Aus der Liste nehmen (bleibt in Hermes gespeichert)">✕</button>'}
      </div>`)
    .join('')}
    <form class="gm-neu" id="gm-neu"><input maxlength="40" placeholder="Neues Gespräch, z. B. Shop …" autocomplete="off" /><button class="knopf-flach" type="submit">+</button></form>`
}

export async function gespraecheLaden() {
  try {
    stand = await api.gespraeche.liste()
    zeigen()
  } catch {
    // Hermes/Einstellungen noch nicht bereit
  }
}

// Wechseln oder neu anlegen. Gibt Luzzys Satz zurück.
export async function gespraechWechseln(name) {
  name = String(name || '').trim().replace(/[.!?]+$/, '')
  if (!name) name = `Gespräch ${new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  const vorhanden = stand.liste.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (vorhanden && vorhanden.name === stand.aktiv) return `Wir sind schon im Gespräch ${vorhanden.name}.`
  if (!h.darfWechseln()) return 'Moment, ich antworte noch. Danach wechseln wir.'
  h.vorWechsel()
  stand = await api.gespraeche.wechseln(name)
  zeigen()
  return vorhanden ? `Okay, wir sind wieder im Gespräch ${stand.aktiv}.` : `Neues Gespräch ${stand.aktiv}. Worum geht es?`
}

// Sprachbefehle: Satz (Promise) oder null
export function gespraechBefehl(text) {
  const satz = ohneLuzzy(text).replace(/[.!?]+$/, '').trim()
  const neu = NEU.exec(satz)
  if (neu) return gespraechWechseln(neu[1])
  const wechsel = WECHSEL.exec(satz)
  if (wechsel) return gespraechWechseln(wechsel[1])
  if (LISTE.test(satz)) {
    const namen = stand.liste.map((g) => g.name)
    const andere = namen.filter((n) => n !== stand.aktiv)
    return Promise.resolve(
      `Wir sind im Gespräch ${stand.aktiv}.${andere.length ? ` Außerdem gibt es ${andere.length > 1 ? `${andere.slice(0, -1).join(', ')} und ${andere.at(-1)}` : andere[0]}.` : ' Andere gibt es noch nicht.'}`
    )
  }
  return null
}

export function gespraecheEinrichten(helfer) {
  h = { ...h, ...helfer }
  const knopf = $('gespraech-thema-knopf')
  const menue = $('gespraech-menue')
  const zu = () => (menue.hidden = true)
  knopf.addEventListener('click', (e) => {
    e.stopPropagation()
    menue.hidden = !menue.hidden
    if (!menue.hidden) menue.querySelector('input')?.focus()
  })
  document.addEventListener('click', (e) => !menue.contains(e.target) && zu())
  menue.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') zu()
    if (e.key === 'Enter' && e.target.classList.contains('gm-eintrag')) e.target.click()
  })
  menue.addEventListener('click', async (e) => {
    const eintrag = e.target.closest('.gm-eintrag')
    if (!eintrag) return
    const name = eintrag.dataset.name
    try {
      if (e.target.closest('.gm-weg')) {
        stand = await api.gespraeche.entfernen(name)
        return zeigen()
      }
      zu()
      h.melden(await gespraechWechseln(name))
    } catch (err) {
      h.beiFehler(err)
    }
  })
  menue.addEventListener('submit', async (e) => {
    e.preventDefault()
    const feld = e.target.querySelector('input')
    if (!feld.value.trim()) return
    zu()
    try {
      h.melden(await gespraechWechseln(feld.value))
    } catch (err) {
      h.beiFehler(err)
    }
  })
  gespraecheLaden()
}
