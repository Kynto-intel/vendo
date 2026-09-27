// Freigaben bequemer (Offene Entscheidung 1, Variante A: Luzzys Regeln bleiben, Freigeben geht schneller).
//
// 1. Hermes-Freigaben: Will Luzzy (oder die Crew) einen Befehl ausführen, den Hermes für riskant hält, fragt Hermes nach.
//    Jarves-OS zeigt dann über der Eingabe eine Karte: Einmal erlauben · Für dieses Gespräch · Ablehnen.
//    Luzzy sagt dazu, worum es geht; Felix kann auch einfach „Ja“ oder „Nein“ sagen oder tippen.
// 2. Luzzys eigene Ja-Fragen (SOUL-Regel: erst zeigen, dann Felix' Ja): Endet ihre Antwort mit so einer Frage,
//    erscheinen darunter die Knöpfe „Ja, mach“ und „Nein“.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const JA = /^(?:ja|jo|jap|jep|jawohl|klar|okay|ok|gut|passt|go|los|mach(?: das| es)?(?: ruhig)?|leg los|einverstanden|erlaubt|erlauben|freigeben|freigegeben|in ordnung|darfst du|einmal erlauben)(?:[\s,!.]+(?:mach|bitte|ruhig|gerne|luzzy|das|es|so))*[\s!.]*$/i
const SESSION = /^(?:ja,?\s+)?(?:für (?:dieses|das ganze|das) gespräch|immer in diesem gespräch|für heute)[\s!.]*$/i
const NEIN = /^(?:nein|nö|ne|nee|nope|stopp|stop|halt|abbrechen|ablehnen|lieber nicht|nicht|lass (?:es|das)|auf keinen fall)(?:[\s,!.]+(?:danke|luzzy|lass es|bitte))*[\s!.]*$/i

// Fragt Luzzy nach Felix' Ja? (Antwort endet mit einer Frage in dieser Art)
const JA_FRAGE = /(soll ich|darf ich|freigabe|dein ja|gibst du|einverstanden|bestätig|okay so|ok so|passt das|so übernehmen|so anlegen|so eintragen|so speichern|so ändern|so abschicken|so senden|so posten|so veröffentlichen|veröffentlich|live (?:stellen|schalten)|freigeben|umsetzen\?|machen\?|loslegen\?)/i

let h = { api: null, vorlesen: () => {}, zuhoeren: () => {}, melden: () => {}, luzzy: () => {} }
const offen = [] // { id, kanal, befehl, beschreibung, auswahl }

function ohneLuzzy(text) {
  return String(text || '').trim().replace(/^\s*(?:hey\s+)?luzzy[,!.:\s]*/i, '').trim()
}

export function freigabenEinrichten(helfer) {
  h = { ...h, ...helfer }
  h.api.hermes.beiFreigabe((f) => neu(f))
  $('freigaben').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-wahl]')
    if (knopf) beantworten(knopf.closest('[data-freigabe]').dataset.freigabe, knopf.dataset.wahl)
  })
  // Knöpfe unter Luzzys Ja-Fragen (im Gespräch)
  $('gespraech').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-ja-antwort]')
    if (!knopf) return
    const leiste = knopf.closest('.ja-knoepfe')
    leiste?.remove()
    h.luzzy(knopf.dataset.jaAntwort === 'ja' ? 'Ja, mach.' : 'Nein, lass es.')
  })
}

function neu(f) {
  offen.push(f)
  zeichnen()
  const botName = f.kanal.includes(':') ? f.kanal.split(':')[1].split('-')[0].replace(/^./, (c) => c.toUpperCase()) : ''
  const wer = f.kanal === 'crew' ? 'Die Crew möchte' : botName ? `${botName} möchte` : 'Ich möchte'
  const was = f.beschreibung ? kuerzen(f.beschreibung, 160) : 'einen Befehl auf deinem PC ausführen'
  h.melden({ art: 'hinweis', titel: 'Luzzy braucht deine Freigabe', anzeige: was, zeit: Date.now() })
  h.vorlesen(`Felix, ich brauche deine Freigabe. ${wer} ${f.beschreibung ? `Folgendes tun: ${was}.` : `${was}.`} Soll ich?`).then(() => {
    if (offen.some((x) => x.id === f.id)) h.zuhoeren()
  })
}

function kuerzen(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)} …` : t
}

function zeichnen() {
  const el = $('freigaben')
  el.hidden = !offen.length
  el.innerHTML = offen
    .map((f) => `
      <div class="freigabe-karte hud" data-freigabe="${maskieren(f.id)}">
        <div class="freigabe-kopf">⚠ ${f.kanal === 'crew' ? 'Die Crew' : f.kanal.includes(':') ? maskieren(f.kanal.split(':')[1].split('-')[0].replace(/^./, (c) => c.toUpperCase())) : 'Luzzy'} braucht deine Freigabe</div>
        ${f.beschreibung ? `<div class="freigabe-text">${maskieren(kuerzen(f.beschreibung, 400))}</div>` : ''}
        ${f.befehl ? `<pre class="freigabe-befehl">${maskieren(kuerzen(f.befehl, 600))}</pre>` : ''}
        <div class="freigabe-knoepfe">
          <button class="knopf-gold" data-wahl="once" type="button">Einmal erlauben</button>
          ${f.auswahl.includes('session') ? '<button class="knopf-flach" data-wahl="session" type="button">Für dieses Gespräch</button>' : ''}
          <button class="knopf-flach gefahr" data-wahl="deny" type="button">Ablehnen</button>
        </div>
        <div class="leise klein">Oder sag einfach „Ja“ oder „Nein“.</div>
      </div>`)
    .join('')
}

async function beantworten(id, wahl) {
  const i = offen.findIndex((f) => f.id === id)
  if (i < 0) return
  offen.splice(i, 1)
  zeichnen()
  await h.api.hermes.freigabe(id, wahl).catch(() => {})
}

// Hermes hat die Anfrage zurückgezogen (Zeit abgelaufen, anderswo beantwortet, Luzzy abgebrochen)
export function freigabeZurueckgezogen(id) {
  const i = offen.findIndex((f) => f.id === id)
  if (i < 0) return
  offen.splice(i, 1)
  zeichnen()
}

// Verbindung weg: alle offenen Karten weg (Hermes hat sie dann ohnehin verworfen)
export function freigabenLeeren() {
  offen.length = 0
  zeichnen()
}

export const freigabeOffen = () => offen.length > 0

// „Ja“ / „Nein“ getippt oder gesagt, während eine Freigabe offen ist → beantworten. Liefert den Satz für Luzzy oder null.
export function freigabeAusText(text) {
  if (!offen.length) return null
  const s = ohneLuzzy(text).toLowerCase()
  if (s.length > 60) return null
  const f = offen[0]
  if (SESSION.test(s) && f.auswahl.includes('session')) return beantworten(f.id, 'session'), 'Alles klar, für dieses Gespräch erlaubt.'
  if (JA.test(s)) return beantworten(f.id, 'once'), 'Alles klar, mach ich.'
  if (NEIN.test(s)) return beantworten(f.id, 'deny'), 'Okay, lass ich.'
  return null
}

// Unter Luzzys fertiger Antwort: Ja/Nein-Knöpfe, wenn sie um Felix' Ja bittet
export function jaKnoepfeAnhaengen(el, text) {
  if (!el || !text) return
  const schluss = text.trim().slice(-400)
  if (!/\?\s*[*_)"“”]*\s*$/.test(schluss) || !JA_FRAGE.test(schluss)) return
  el.insertAdjacentHTML('beforeend', `
    <div class="ja-knoepfe">
      <button class="knopf-gold" data-ja-antwort="ja" type="button">Ja, mach</button>
      <button class="knopf-flach" data-ja-antwort="nein" type="button">Nein</button>
    </div>`)
}

// Neue Nachricht: alte Ja/Nein-Knöpfe weg (sie gehören zur vorigen Frage)
export function jaKnoepfeEntfernen() {
  for (const el of document.querySelectorAll('#gespraech .ja-knoepfe')) el.remove()
}
