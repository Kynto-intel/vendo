// Shopify-Token im System-Tab erneuern (src/main/shopifytoken.js macht die Arbeit).
// Der Token steht nur im Eingabefeld und wird nach dem Absenden sofort geleert; Jarves-OS speichert ihn nirgends selbst.

const api = window.jarves
const $ = (id) => document.getElementById(id)
const fehlertext = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function shopifyZugangEinrichten({ melden = () => {} } = {}) {
  const form = $('shopify-token-form')
  const feld = $('shopify-token-feld')
  const hinweis = $('shopify-token-hinweis')
  const knopf = form.querySelector('button[type=submit]')
  api.shopify.stellen().then((n) => {
    if (n) hinweis.textContent = `Jarves-OS prüft den Token bei Shopify und trägt ihn dann an allen ${n} Stellen in Hermes ein (Hermes und alle Bots, config.yaml und .env). Vorher wird jede Datei gesichert.`
  }).catch(() => {})
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const token = feld.value.trim()
    if (!token) return feld.focus()
    feld.value = '' // nicht länger als nötig im Feld
    knopf.disabled = true
    hinweis.className = 'leise klein'
    hinweis.textContent = 'Prüfe den Token bei Shopify …'
    try {
      const r = await api.shopify.tokenEintragen(token)
      hinweis.className = 'klein sz-gut'
      hinweis.textContent = r.neuGeladen
        ? `✓ Token funktioniert (${r.shopName}), ist an ${r.dateien.length} Stellen eingetragen und sofort aktiv. Kein Neustart nötig.`
        : `✓ Token funktioniert (${r.shopName}) und ist an ${r.dateien.length} Stellen eingetragen. Hermes konnte ihn nicht selbst neu laden: bitte Hermes einmal neu starten.`
      melden({ art: 'hinweis', titel: 'Shopify-Token erneuert', anzeige: r.neuGeladen ? `An ${r.dateien.length} Stellen eingetragen, sofort aktiv.` : `An ${r.dateien.length} Stellen eingetragen. Hermes neu starten.`, zeit: Date.now() })
    } catch (err) {
      hinweis.className = 'klein sz-fehler'
      hinweis.textContent = `✗ ${fehlertext(err)} Es wurde nichts geändert.`
    } finally {
      knopf.disabled = false
    }
  })
}

// Status-Zeile (vom Wächter: verbunden / Problem)
export function shopifyZugangStatus({ ok, text } = {}) {
  const el = $('shopify-zugang-status')
  if (!el) return
  el.innerHTML = `<span class="punkt-klein ${ok ? 'gut' : 'schlecht'}"></span><span>${ok ? 'Verbunden' : String(text || 'Nicht verbunden').replace(/[<>&]/g, '')}</span>`
}
