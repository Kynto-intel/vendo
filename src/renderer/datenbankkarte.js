// Karte „Datenbank“ im System-Tab: Zustand von PostgreSQL, der Plugin-Daten und der Vendo-Einstellungen, dazu ein Export
// aller Plugin-Daten als JSON-Dateien (Notfall, Umzug). Die Arbeit machen src/main/speicher.js und vendospeicher.js.

const api = window.vendo
const m = (t) => String(t ?? '').replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[z])
const fehlertext = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const zeit = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'

let eingerichtet = false
let meldung = ''

export async function datenbankKarteLaden() {
  const el = document.getElementById('system-datenbank')
  if (!el || !api?.datenbank) return
  let z
  try { z = await api.datenbank.zustand() } catch (f) { el.innerHTML = `<div class="sz-fehler klein">${m(fehlertext(f))}</div>`; return }
  const s = z.spiegel || {}
  const v = z.vendo || {}
  const bereit = z.zustand === 'bereit'
  const plugins = s.geladen ? `${s.plugins} Plugins geladen` : `noch nicht geladen${s.ladeFehler ? `: ${s.ladeFehler}` : ''}`
  const einstellungen = v.geladen ? 'aus der Datenbank' : 'aus der Startkopie, bis die Datenbank bereit ist'
  el.innerHTML = `
    <dl class="werte">
      <dt>PostgreSQL</dt><dd><span class="punkt-klein ${bereit ? 'gut' : 'schlecht'}"></span>${m(bereit ? 'verbunden' : z.meldung)}</dd>
      <dt>Plugin-Daten</dt><dd>${m(plugins)}</dd>
      <dt>Einstellungen</dt><dd>${m(einstellungen)}</dd>
      <dt>Zuletzt geschrieben</dt><dd>${m(zeit(s.zeit))}${s.fehler ? ` · <span class="sz-fehler">${m(s.fehler)}</span>` : ''}</dd>
      <dt>Wartet</dt><dd>${m(`${(s.offen || 0) + (v.offen || 0)} offen, ${s.journal || 0} im Journal`)}</dd>
      <dt>Für Luzzy</dt><dd>${m((s.austausch || []).join(', ') || '–')} (daten\\austausch)</dd>
      ${s.altLiegen?.length ? `<dt>Alte Dateien</dt><dd class="sz-fehler">${m(s.altLiegen.join(', '))} in daten\\plugins nicht übernommen (die Datenbank hat schon Daten)</dd>` : ''}
    </dl>
    <div class="sz-zeile"><button class="knopf-flach" type="button" data-db="export" ${s.geladen ? '' : 'disabled'}>Als Dateien exportieren</button></div>
    <div class="leise klein" data-db-meldung>${meldung}</div>`
  if (eingerichtet) return
  eingerichtet = true
  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-db="export"]')
    if (!k) return
    k.disabled = true
    try {
      const r = await api.datenbank.exportieren()
      meldung = `<span class="sz-gut">✓ ${r.dateien} Dateien nach ${m(r.ordner)} geschrieben.</span>`
    } catch (f) {
      meldung = `<span class="sz-fehler">✗ ${m(fehlertext(f))}</span>`
    }
    await datenbankKarteLaden()
  })
}
