// Eigene Rückfrage- und Hinweisfenster im Jarves-Design (statt der grauen Windows-Fenster von confirm/alert).
//   await bestaetigen('Chat „neu“ löschen?', { titel: 'Chat löschen', ja: 'Löschen', gefahr: true }) → true/false
//   await hinweis('Bitte erst einen Prompt eintragen.')
// Esc oder Klick daneben = Abbrechen. Bei gefährlichen Aktionen steht der Fokus auf „Abbrechen“.

const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function fensterZeigen({ titel, text, ja, nein, gefahr }) {
  return new Promise((fertig) => {
    const d = document.createElement('dialog')
    d.className = `jarves-fenster hud${gefahr ? ' gefahr' : ''}`
    d.innerHTML = `
      <div class="jf-kopf">${gefahr ? '<span class="jf-zeichen">⚠</span>' : ''}<h3>${maskieren(titel)}</h3></div>
      <p class="jf-text">${maskieren(text)}</p>
      <div class="jf-knoepfe">
        ${nein ? `<button class="knopf-flach" data-antwort="nein" type="button">${maskieren(nein)}</button>` : ''}
        <button class="${gefahr ? 'knopf-gefahr' : 'knopf-gold'}" data-antwort="ja" type="button">${maskieren(ja)}</button>
      </div>`
    let erledigt = false
    const schliessen = (antwort) => {
      if (erledigt) return
      erledigt = true
      d.close()
      d.remove()
      fertig(antwort)
    }
    d.addEventListener('click', (e) => {
      const knopf = e.target.closest('[data-antwort]')
      if (knopf) return schliessen(knopf.dataset.antwort === 'ja')
      if (e.target === d) schliessen(false) // Klick auf den abgedunkelten Rand
    })
    d.addEventListener('cancel', (e) => {
      e.preventDefault()
      schliessen(false)
    })
    document.body.appendChild(d)
    d.showModal()
    d.querySelector(gefahr && nein ? '[data-antwort="nein"]' : '[data-antwort="ja"]').focus()
  })
}

export function bestaetigen(text, { titel = 'Sicher?', ja = 'OK', nein = 'Abbrechen', gefahr = false } = {}) {
  return fensterZeigen({ titel, text, ja, nein, gefahr })
}

export function hinweis(text, { titel = 'Hinweis', ok = 'OK' } = {}) {
  return fensterZeigen({ titel, text, ja: ok, nein: '', gefahr: false }).then(() => undefined)
}
