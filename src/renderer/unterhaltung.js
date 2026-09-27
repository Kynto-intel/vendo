// Wiederverwendbares Gespräch (Liste + Eingabe) für einen Hermes-Kanal, z. B. die Crew oder ein Bot.
// Zeigt Verlauf, streamt Antworten live mit und schickt über window.jarves.hermes.senden(kanal, text).
// Teilen sich mehrere Gespräche eine Eingabe (Crew-Tab), reagiert nur das aktive (istAktiv).

import { markdownZuHtml } from './markdown.js'

const maskieren = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function unterhaltungErstellen({ kanal, liste, form, namen = { felix: 'FELIX', luzzy: 'LUZZY' }, wer = 'Luzzy', leerText, beiAktivitaet = () => {}, beiFertig = () => {}, istAktiv = () => true }) {
  const api = window.jarves.hermes
  let beschaeftigt = false
  let antwort = null // { textEl, roh }
  let werkzeug = ''
  const feld = form.querySelector('textarea')
  const knopf = form.querySelector('.senden')

  function leer() {
    liste.innerHTML = `<div class="gespraech-leer">${maskieren(leerText || 'Noch nichts gesagt.')}</div>`
  }

  function anzeigen(rolle, text, { laeuft = false } = {}) {
    liste.querySelector('.gespraech-leer')?.remove()
    const el = document.createElement('div')
    el.className = `msg ${rolle}`
    el.innerHTML = `<div class="msg-wer">${namen[rolle] || rolle.toUpperCase()}</div><div class="msg-text"></div>`
    const textEl = el.querySelector('.msg-text')
    if (rolle === 'felix') textEl.textContent = text
    else textEl.innerHTML = markdownZuHtml(text) + (laeuft ? '<span class="cursor"></span>' : '')
    liste.appendChild(el)
    liste.scrollTop = liste.scrollHeight
    return textEl
  }

  function system(text) {
    liste.querySelector('.gespraech-leer')?.remove()
    const el = document.createElement('div')
    el.className = 'msg system'
    el.textContent = text
    liste.appendChild(el)
    liste.scrollTop = liste.scrollHeight
  }

  function knopfZeigen() {
    if (!istAktiv()) return
    knopf.textContent = beschaeftigt ? 'Stopp' : 'Senden'
    knopf.classList.toggle('stopp', beschaeftigt)
    knopf.type = beschaeftigt ? 'button' : 'submit'
  }

  function antwortZeichnen() {
    if (!antwort) return
    const hinweis = werkzeug ? `<div class="werkzeug-hinweis">Werkzeug: <b>${maskieren(werkzeug)}</b></div>` : ''
    antwort.textEl.innerHTML = markdownZuHtml(antwort.roh) + '<span class="cursor"></span>' + hinweis
    liste.scrollTop = liste.scrollHeight
  }

  async function abschicken() {
    if (!istAktiv()) return
    const text = feld.value.trim()
    if (!text || beschaeftigt) return
    feld.value = ''
    feld.style.height = 'auto'
    await senden(text)
  }

  async function senden(text) {
    anzeigen('felix', text)
    beschaeftigt = true
    knopfZeigen()
    try {
      await api.senden(kanal, text)
    } catch (e) {
      beschaeftigt = false
      knopfZeigen()
      system(`Konnte nicht senden: ${e.message}`)
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    abschicken()
  })
  knopf.addEventListener('click', (e) => {
    if (beschaeftigt && istAktiv()) {
      e.preventDefault()
      api.abbrechen(kanal)
    }
  })
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && istAktiv()) {
      e.preventDefault()
      abschicken()
    }
  })
  feld.addEventListener('input', () => {
    feld.style.height = 'auto'
    feld.style.height = `${Math.min(feld.scrollHeight, 160)}px`
  })

  leer()

  return {
    // Dieses Gespräch ist jetzt sichtbar: Knopf (Senden/Stopp) passend setzen
    aktivieren: () => knopfZeigen(),
    beschaeftigt: () => beschaeftigt,
    // Von außen schicken (z. B. „Kira, …“ in der Zentrale)
    senden: (text) => (beschaeftigt ? Promise.resolve(false) : senden(text).then(() => true)),
    verlauf(eintraege) {
      if (beschaeftigt || antwort) return
      liste.replaceChildren()
      if (!eintraege?.length) return leer()
      for (const n of eintraege) anzeigen(n.rolle, n.text)
    },
    ereignis(ev) {
      const p = ev.payload || {}
      switch (ev.type) {
        case 'message.start':
          beschaeftigt = true
          antwort ??= { textEl: anzeigen('luzzy', '', { laeuft: true }), roh: '' }
          beiAktivitaet(`${wer} arbeitet`, true)
          break
        case 'message.delta':
          if (typeof p.text !== 'string') break
          antwort ??= { textEl: anzeigen('luzzy', '', { laeuft: true }), roh: '' }
          antwort.roh += p.text
          antwortZeichnen()
          break
        case 'tool.start':
          werkzeug = p.name || 'Werkzeug'
          beiAktivitaet(`${wer}: ${werkzeug}`, true)
          antwortZeichnen()
          break
        case 'tool.complete':
          werkzeug = ''
          antwortZeichnen()
          break
        case 'message.complete': {
          const text = typeof p.text === 'string' && p.text ? p.text : antwort?.roh || ''
          if (antwort) antwort.textEl.innerHTML = markdownZuHtml(text)
          else if (text) anzeigen('luzzy', text)
          if (p.status === 'error' || p.error) system(p.error || p.failure_reason || 'Die Antwort ist fehlgeschlagen.')
          antwort = null
          werkzeug = ''
          beschaeftigt = false
          beiAktivitaet(`${wer} hat geantwortet`)
          beiFertig(p.status === 'error' || p.error ? '' : text)
          break
        }
        case 'error':
          system(p.message || 'Fehler in Hermes.')
          antwort = null
          beschaeftigt = false
          break
      }
      knopfZeigen()
    }
  }
}
