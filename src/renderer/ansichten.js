// Bereiche der Zentrale: Crew, Jobs, Kanban, System. Alle Daten kommen live aus Hermes.

const api = window.jarves
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const $ = (id) => document.getElementById(id)

// Crew: alle Hermes-Profile außer „default“, Luzzy (donnerwolf) zuerst. Neue Profile erscheinen von selbst.
const LUZZY = 'donnerwolf'
const crewProfile = (profile) =>
  profile.filter((p) => p?.name && p.name !== 'default').sort((a, b) => (b.name === LUZZY) - (a.name === LUZZY) || a.name.localeCompare(b.name))
const gross = (w) => w.charAt(0).toUpperCase() + w.slice(1)
// „kira-trend-scout-bot“ → Name „Kira“, Rolle „Trend-Scout“; „recherche-bot“ → „Recherche-Bot“
function botName(p) {
  if (p.name === LUZZY) return { name: 'Luzzy', rolle: 'Chefin' }
  const teile = p.name.split(/[-_]+/).filter(Boolean)
  const ohneBot = teile.at(-1)?.toLowerCase() === 'bot' ? teile.slice(0, -1) : teile
  if (ohneBot.length < 2) return { name: p.bot_title || teile.map(gross).join('-'), rolle: '' }
  return { name: p.bot_title || gross(ohneBot[0]), rolle: ohneBot.slice(1).map(gross).join('-') }
}

// ── Helfer ──
function zeitpunkt(wert) {
  if (wert == null || wert === '') return null
  const d = typeof wert === 'number' ? new Date(wert < 1e12 ? wert * 1000 : wert) : new Date(wert)
  return isNaN(d) ? null : d
}
export function vorWann(wert) {
  const d = zeitpunkt(wert)
  if (!d) return '–'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 0) return inWann(wert)
  if (s < 60) return 'gerade eben'
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`
  const tage = Math.round(s / 86400)
  return tage === 1 ? 'gestern' : `vor ${tage} Tagen`
}
function inWann(wert) {
  const d = zeitpunkt(wert)
  if (!d) return '–'
  const s = Math.round((d.getTime() - Date.now()) / 1000)
  if (s <= 0) return 'jetzt'
  if (s < 3600) return `in ${Math.round(s / 60)} Min.`
  if (s < 86400) return `in ${Math.round(s / 3600)} Std.`
  return d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const zahl = (n) => (Number(n) || 0).toLocaleString('de-DE')
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mio.` : n >= 1e3 ? `${Math.round(n / 1e3)} Tsd.` : zahl(n))
const euro = (n) => (Number(n) ? `${Number(n).toFixed(2).replace('.', ',')} $` : 'kostenlos')
const gb = (b) => `${(Number(b) / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
const DEUTSCH = { running: 'läuft', stopped: 'gestoppt', connected: 'verbunden', disconnected: 'getrennt', connecting: 'verbindet', error: 'Fehler', scheduled: 'geplant', paused: 'pausiert', completed: 'erledigt', ok: 'ok', success: 'erfolgreich' }
const deutsch = (s) => DEUTSCH[String(s || '').toLowerCase()] || s
const lesen = (pfad) => api.hermes.lesen(pfad).catch(() => null)

function fehlerKarte(el, text) {
  el.innerHTML = `<div class="leer-hinweis">${maskieren(text)}</div>`
}

// ── Crew ──
// Modell-Liste aus Hermes (GET /api/model/options, dieselbe Liste wie in der Hermes-App): nur Anbieter, für die
// das Profil einen Zugang hat. Ältere Hermes-Versionen: Liste aus dem Kanban-Plugin.
const modellListen = new Map() // profil → [{ slug, name, models: [id] }]
async function modelleLaden(profil, { neu = false } = {}) {
  if (!neu && modellListen.get(profil)?.length) return modellListen.get(profil)
  const antwort =
    (await lesen(`/api/model/options?profile=${encodeURIComponent(profil)}${neu ? '&refresh=1' : ''}`)) ||
    (await lesen('/api/plugins/kanban/model-options'))
  const liste = (antwort?.providers || [])
    .map((a) => ({
      slug: String(a.slug || ''),
      name: String(a.name || a.label || a.slug || ''),
      models: (a.models || []).map((m) => String(typeof m === 'string' ? m : m?.id || m?.model || m?.name || '')).filter(Boolean)
    }))
    .filter((a) => a.slug && a.models.length)
  modellListen.set(profil, liste)
  return liste
}

export async function crewLaden() {
  const el = $('crew-karten')
  const profile = (await lesen('/api/profiles'))?.profiles
  if (!profile) return fehlerKarte(el, 'Hermes antwortet gerade nicht.')
  const karten = await Promise.all(
    crewProfile(profile).map(async (p) => {
      const name = p.name
      const [nutzung, sitzungen] = await Promise.all([
        lesen(`/api/analytics/usage?days=30&profile=${encodeURIComponent(name)}`),
        lesen(`/api/sessions?profile=${encodeURIComponent(name)}&limit=1`)
      ])
      const summe = (nutzung?.daily || []).reduce(
        (s, t) => ({ tokens: s.tokens + (t.input_tokens || 0) + (t.output_tokens || 0), kosten: s.kosten + (t.actual_cost || t.estimated_cost || 0), aufrufe: s.aufrufe + (t.api_calls || 0) }),
        { tokens: 0, kosten: 0, aufrufe: 0 }
      )
      const letzte = sitzungen?.sessions?.[0]
      let zuletzt = letzte ? letzte.last_active || letzte.updated_at || letzte.ended_at || letzte.started_at : null
      // Ersatz: letzter Tag mit Aktivität aus der Nutzungsstatistik
      if (!zuletzt) {
        const tag = [...(nutzung?.daily || [])].reverse().find((t) => (t.api_calls || 0) > 0 || (t.input_tokens || 0) > 0)
        if (tag) zuletzt = `${tag.day}T12:00:00`
      }
      return { p, summe, zuletzt, letzterTitel: letzte?.title || '' }
    })
  )
  crewKurzZeigen(karten.filter(Boolean))
  el.style.setProperty('--crew-anzahl', String(Math.max(1, karten.filter(Boolean).length)))
  if (!karten.some(Boolean)) return fehlerKarte(el, 'Keine Bots gefunden. In Hermes gibt es außer „default“ noch kein Profil.')
  el.innerHTML = karten
    .filter(Boolean)
    .map(({ p, summe, zuletzt, letzterTitel }) => {
      const chef = p.name === LUZZY
      const { name, rolle } = botName(p)
      const aktiv = zuletzt && Date.now() - zeitpunkt(zuletzt).getTime() < 3 * 60 * 1000
      return `
      <article class="bot hud${chef ? ' chef' : ''}" data-profil="${maskieren(p.name)}">
        <header>
          <span class="bot-punkt${aktiv ? ' aktiv' : ''}" title="${aktiv ? 'gerade aktiv' : 'ruhig'}"></span>
          <h3 title="Hermes-Profil: ${maskieren(p.name)}">${maskieren(name)}</h3>
          ${rolle ? `<span class="abzeichen">${maskieren(rolle)}</span>` : ''}
        </header>
        <p class="bot-rolle">${maskieren(p.description || 'Keine Beschreibung.')}</p>
        <dl class="werte">
          <dt>Modell</dt><dd title="${maskieren(p.provider)} · ${maskieren(p.model)}">${maskieren(p.model || '–')}</dd>
          <dt>Zuletzt</dt><dd title="${maskieren(letzterTitel)}">${vorWann(zuletzt)}</dd>
          <dt>30 Tage</dt><dd title="${zahl(summe.tokens)} Tokens, ${zahl(summe.aufrufe)} Aufrufe">${tokens(summe.tokens)} Tok. · ${zahl(summe.aufrufe)}×</dd>
          <dt>Kosten</dt><dd>${euro(summe.kosten)}</dd>
        </dl>
        <button class="knopf-flach modell-aendern" type="button" data-profil="${maskieren(p.name)}" data-anbieter="${maskieren(p.provider)}" data-modell="${maskieren(p.model)}">Modell ändern</button>
        <div class="modell-wahl" hidden></div>
      </article>`
    })
    .join('')
}

// Kurzübersicht in der rechten Spalte
function crewKurzZeigen(karten) {
  const el = $('crew-kurz')
  if (!el) return
  el.innerHTML = karten
    .map(({ p, zuletzt }) => {
      const aktiv = zuletzt && Date.now() - zeitpunkt(zuletzt).getTime() < 3 * 60 * 1000
      return `<div class="crew-zeile"><span class="bot-punkt${aktiv ? ' aktiv' : ''}"></span><span>${maskieren(botName(p).name)}</span><time>${vorWann(zuletzt)}</time></div>`
    })
    .join('')
}

// Modell eines Agenten ändern (Hermes: PUT /api/profiles/{name}/model). Suchfeld + Liste statt Auswahlfeld,
// weil es schnell ein paar hundert Modelle sind.
document.addEventListener('click', async (e) => {
  const knopf = e.target.closest('.modell-aendern')
  if (!knopf) return
  const wahl = knopf.nextElementSibling
  if (!wahl.hidden) return (wahl.hidden = true)
  wahl.hidden = false
  await modellWahlZeigen(wahl, knopf.dataset)
})

async function modellWahlZeigen(wahl, { profil, anbieter: jetztAnbieter, modell: jetztModell }, { neu = false } = {}) {
  wahl.innerHTML = `<div class="leise">${neu ? 'Frage die Anbieter neu ab …' : 'Lade Modelle …'}</div>`
  const anbieter = await modelleLaden(profil, { neu })
  if (!anbieter.length) {
    wahl.innerHTML = `<div class="leise">Hermes hat keine Modelle geliefert. In der Hermes-App unter Modelle prüfen, ob ein Anbieter eingerichtet ist.</div>
      <div class="modell-knoepfe"><button class="knopf-flach" data-neu type="button">Neu laden</button></div>`
    wahl.querySelector('[data-neu]').addEventListener('click', () => modellWahlZeigen(wahl, { profil, anbieter: jetztAnbieter, modell: jetztModell }, { neu: true }))
    return
  }
  let gewaehlt = { provider: jetztAnbieter, model: jetztModell }
  wahl.innerHTML = `
    <input class="modell-suche" type="search" placeholder="Modell suchen …" autocomplete="off" />
    <div class="modell-liste" role="listbox"></div>
    <div class="modell-knoepfe">
      <button class="knopf-flach" data-neu type="button" title="Anbieter neu abfragen (neue Modelle)">Neu laden</button>
      <button class="knopf-gold" data-los type="button" disabled>Übernehmen</button>
    </div>`
  const liste = wahl.querySelector('.modell-liste')
  const suche = wahl.querySelector('.modell-suche')
  const los = wahl.querySelector('[data-los]')
  // Anbieter einklappbar: anfangs ist nur der mit dem aktuellen Modell offen, beim Suchen alle mit Treffern
  const offen = new Set([jetztAnbieter])
  const zeichnen = () => {
    const worte = suche.value.toLowerCase().split(/\s+/).filter(Boolean)
    const passt = (text) => worte.every((w) => text.includes(w))
    let anzahl = 0
    liste.innerHTML = anbieter
      .map((a) => {
        const alle = a.models.filter((m) => passt(`${a.name} ${a.slug} ${m}`.toLowerCase()))
        const treffer = alle.slice(0, 60)
        anzahl += treffer.length
        if (!treffer.length) return ''
        const auf = worte.length > 0 || offen.has(a.slug)
        const kopf = `<div class="modell-gruppe${auf ? ' auf' : ''}" role="button" tabindex="0" data-gruppe="${maskieren(a.slug)}" title="${auf ? 'Einklappen' : 'Aufklappen'}"><span class="modell-pfeil">▸</span>${maskieren(a.name)}<small>${alle.length}</small></div>`
        if (!auf) return kopf
        return `${kopf}${treffer
          .map((m) => {
            const aktiv = a.slug === gewaehlt.provider && m === gewaehlt.model
            const jetzt = a.slug === jetztAnbieter && m === jetztModell
            return `<div role="option" tabindex="0" class="modell-eintrag${aktiv ? ' gewaehlt' : ''}" data-anbieter="${maskieren(a.slug)}" data-modell="${maskieren(m)}" title="${maskieren(m)}">${maskieren(m)}${jetzt ? ' <small>aktuell</small>' : ''}</div>`
          })
          .join('')}`
      })
      .join('')
    if (!anzahl) liste.innerHTML = '<div class="leise">Kein Modell passt.</div>'
  }
  zeichnen()
  suche.focus()
  suche.addEventListener('input', zeichnen)
  liste.addEventListener('keydown', (ev) => ev.key === 'Enter' && ev.target.closest('.modell-eintrag, .modell-gruppe')?.click())
  liste.addEventListener('click', (ev) => {
    const gruppe = ev.target.closest('.modell-gruppe')
    if (gruppe) {
      const slug = gruppe.dataset.gruppe
      if (suche.value.trim()) {
        suche.value = '' // beim Suchen sind alle offen: Klick auf einen Anbieter zeigt nur ihn
        offen.clear()
        offen.add(slug)
      } else if (offen.has(slug)) offen.delete(slug)
      else offen.add(slug)
      zeichnen()
      return liste.querySelector(`[data-gruppe="${CSS.escape(slug)}"]`)?.focus()
    }
    const eintrag = ev.target.closest('.modell-eintrag')
    if (!eintrag) return
    gewaehlt = { provider: eintrag.dataset.anbieter, model: eintrag.dataset.modell }
    los.disabled = gewaehlt.provider === jetztAnbieter && gewaehlt.model === jetztModell
    zeichnen()
  })
  wahl.querySelector('[data-neu]').addEventListener('click', () => modellWahlZeigen(wahl, { profil, anbieter: jetztAnbieter, modell: jetztModell }, { neu: true }))
  los.addEventListener('click', async () => {
    los.disabled = true
    try {
      await api.hermes.aktion('modell-setzen', { name: profil, provider: gewaehlt.provider, model: gewaehlt.model })
      wahl.hidden = true
      crewLaden()
    } catch (err) {
      los.disabled = false
      wahl.insertAdjacentHTML('beforeend', `<div class="fehler">${maskieren(err.message)}</div>`)
    }
  })
}

// ── Jobs ──
export async function jobsLaden() {
  const el = $('jobs-liste')
  const profile = (await lesen('/api/profiles'))?.profiles?.map((p) => p.name) || ['default']
  const listen = await Promise.all(
    profile.map(async (name) => {
      const jobs = await lesen(`/api/cron/jobs?profile=${encodeURIComponent(name)}`)
      return (Array.isArray(jobs) ? jobs : jobs?.jobs || []).map((j) => ({ ...j, profil: name }))
    })
  )
  // Doppelte (derselbe Job über mehrere Profile gemeldet) entfernen
  const gesehen = new Set()
  const jobs = listen.flat().filter((j) => (gesehen.has(j.id) ? false : gesehen.add(j.id)))
  $('jobs-anzahl').textContent = jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'Job' : 'Jobs'}` : ''
  if (!jobs.length) {
    return fehlerKarte(el, 'Noch keine geplanten Jobs. Sag Luzzy zum Beispiel: „Schick mir jeden Morgen um 8 den Morgenbericht.“ Der Job erscheint dann hier.')
  }
  el.innerHTML = jobs
    .map((j) => {
      const pausiert = j.enabled === false || j.state === 'paused'
      const fehler = j.last_status === 'error'
      const status = pausiert ? 'pausiert' : fehler ? 'Fehler beim letzten Lauf' : j.state === 'running' ? 'läuft gerade' : 'geplant'
      return `
      <article class="job hud${pausiert ? ' pausiert' : ''}${fehler ? ' fehler' : ''}">
        <header>
          <h3>${maskieren(j.name || j.id)}</h3>
          <span class="abzeichen">${maskieren(status)}</span>
        </header>
        <p class="job-zeitplan">${maskieren(j.schedule_display || j.schedule?.display || '')}</p>
        ${j.prompt ? `<p class="job-auftrag">${maskieren(String(j.prompt).slice(0, 220))}</p>` : ''}
        <dl class="werte">
          <dt>Agent</dt><dd>${maskieren(CREW_NAMEN[j.profil] || j.profil)}</dd>
          <dt>Nächster Lauf</dt><dd>${pausiert ? '–' : inWann(j.next_run_at)}</dd>
          <dt>Letzter Lauf</dt><dd>${vorWann(j.last_run_at)}${j.last_status ? ` · ${maskieren(deutsch(j.last_status))}` : ''}</dd>
        </dl>
        ${fehler && j.last_error ? `<div class="fehler">${maskieren(String(j.last_error).slice(0, 240))}</div>` : ''}
        <div class="job-knoepfe">
          <button class="knopf-flach" data-job="ausfuehren" data-id="${maskieren(j.id)}" data-profil="${maskieren(j.profil)}" type="button">Jetzt ausführen</button>
          <button class="knopf-flach" data-job="${pausiert ? 'fortsetzen' : 'pausieren'}" data-id="${maskieren(j.id)}" data-profil="${maskieren(j.profil)}" type="button">${pausiert ? 'Fortsetzen' : 'Pausieren'}</button>
          <button class="knopf-flach gefahr" data-job="loeschen" data-id="${maskieren(j.id)}" data-profil="${maskieren(j.profil)}" data-name="${maskieren(j.name || j.id)}" type="button">Löschen</button>
        </div>
      </article>`
    })
    .join('')
}

document.addEventListener('click', async (e) => {
  const knopf = e.target.closest('[data-job]')
  if (!knopf) return
  const art = knopf.dataset.job
  if (art === 'loeschen' && !confirm(`Job „${knopf.dataset.name}“ wirklich löschen?`)) return
  knopf.disabled = true
  try {
    await api.hermes.aktion(`job-${art}`, { id: knopf.dataset.id, profil: knopf.dataset.profil })
  } catch (err) {
    alert(`Hat nicht geklappt: ${err.message}`)
  }
  jobsLaden()
})

// ── Kanban ──
const SPALTEN = { triage: 'Eingang', todo: 'Zu tun', scheduled: 'Geplant', ready: 'Bereit', running: 'Läuft', blocked: 'Blockiert', review: 'Prüfen', done: 'Erledigt' }

export async function kanbanLaden() {
  const el = $('kanban-tafel')
  const tafeln = await lesen('/api/plugins/kanban/boards')
  const auswahl = $('kanban-auswahl')
  const aktuell = auswahl.value || tafeln?.current || 'default'
  if (tafeln?.boards) {
    auswahl.innerHTML = tafeln.boards
      .filter((b) => !b.archived)
      .map((b) => `<option value="${maskieren(b.slug)}"${b.slug === aktuell ? ' selected' : ''}>${maskieren(b.name || b.slug)}</option>`)
      .join('')
  }
  const tafel = await lesen(`/api/plugins/kanban/board?board=${encodeURIComponent(aktuell)}`)
  if (!tafel?.columns) return fehlerKarte(el, 'Kanban ist gerade nicht erreichbar.')
  const gesamt = tafel.columns.reduce((s, c) => s + c.tasks.length, 0)
  $('kanban-anzahl').textContent = gesamt ? `${gesamt} Aufgaben` : ''
  el.innerHTML = tafel.columns
    .map(
      (spalte) => `
      <section class="spalte">
        <h3>${maskieren(SPALTEN[spalte.name] || spalte.name)} <span>${spalte.tasks.length}</span></h3>
        <div class="spalte-inhalt">
          ${spalte.tasks.length ? spalte.tasks.map((t) => `
            <article class="aufgabe">
              <div class="aufgabe-titel">${maskieren(t.title || t.id)}</div>
              <div class="aufgabe-info">${maskieren(CREW_NAMEN[t.assignee] || t.assignee || 'offen')}${t.priority ? ` · ${maskieren(t.priority)}` : ''}</div>
            </article>`).join('') : '<div class="spalte-leer">–</div>'}
        </div>
      </section>`
    )
    .join('')
  if (!gesamt) $('kanban-hinweis').hidden = false
  else $('kanban-hinweis').hidden = true
}
$('kanban-auswahl')?.addEventListener('change', kanbanLaden)

// ── System ──
export async function systemLaden() {
  const [status, details, werte, nutzung] = await Promise.all([
    lesen('/api/status'),
    api.system.details().catch(() => null),
    api.system.werte().catch(() => null),
    lesen('/api/analytics/usage?days=30&profile=donnerwolf')
  ])
  const hermesEl = $('system-hermes')
  if (status) {
    const plattformen = Object.entries(status.gateway_platforms || {})
      .filter(([name]) => !name.includes(':'))
      .map(([name, p]) => `<li><span class="punkt-klein ${p.state === 'connected' ? 'gut' : 'schlecht'}"></span>${maskieren(name)} · ${maskieren(deutsch(p.state))}</li>`)
      .join('')
    hermesEl.innerHTML = `
      <dl class="werte">
        <dt>Version</dt><dd>v${maskieren(status.version)} (${maskieren(status.release_date || '')})</dd>
        <dt>Gateway</dt><dd>${maskieren(deutsch(status.gateway_state) || (status.gateway_running ? 'läuft' : 'gestoppt'))}</dd>
        <dt>Update</dt><dd>${status.config_version === status.latest_config_version ? 'Einstellungen aktuell' : 'Einstellungen veraltet'}</dd>
      </dl>
      ${plattformen ? `<ul class="plattformen">${plattformen}</ul>` : ''}`
  } else hermesEl.innerHTML = '<div class="leise">Hermes antwortet nicht.</div>'

  const pcEl = $('system-pc')
  if (werte) {
    const ram = Math.round((werte.ramBelegt / werte.ramGesamt) * 100)
    pcEl.innerHTML = `
      <div class="balken-zeile"><span>CPU</span><div class="balken"><div style="width:${werte.cpu}%"></div></div><span>${werte.cpu} %</span></div>
      <div class="balken-zeile"><span>RAM</span><div class="balken"><div style="width:${ram}%"></div></div><span>${ram} %</span></div>
      ${(details?.platten || []).map((p) => {
        const anteil = Math.round((p.belegt / (p.belegt + p.frei)) * 100)
        return `<div class="balken-zeile"><span>${maskieren(p.name)}:</span><div class="balken"><div style="width:${anteil}%"></div></div><span>${anteil} %</span></div><div class="leise klein">${gb(p.frei)} frei von ${gb(p.belegt + p.frei)}</div>`
      }).join('')}
      <dl class="werte">
        <dt>RAM</dt><dd>${gb(werte.ramBelegt)} von ${gb(werte.ramGesamt)}</dd>
        <dt>Grafik</dt><dd>${maskieren((details?.grafikkarten || []).join(', ') || '–')}</dd>
        <dt>System</dt><dd>${maskieren(details?.betriebssystem || '')}</dd>
        <dt>Läuft seit</dt><dd>${details ? `${Math.floor(details.laufzeit / 3600)} Std.` : '–'}</dd>
      </dl>`
  }

  const ollamaEl = $('system-ollama')
  const o = details?.ollama
  ollamaEl.innerHTML = o
    ? `<div class="leise klein">Geladen (im Speicher):</div>
       ${o.geladen.length ? `<ul class="liste">${o.geladen.map((m) => `<li><b>${maskieren(m.name)}</b> · ${gb(m.vram)} Grafikspeicher</li>`).join('')}</ul>` : '<div class="leise">gerade keins</div>'}
       <div class="leise klein" style="margin-top:10px">Installiert (${o.installiert.length}):</div>
       <ul class="liste">${o.installiert.map((m) => `<li>${maskieren(m.name)} · ${gb(m.groesse)}</li>`).join('')}</ul>`
    : '<div class="leise">Ollama läuft nicht oder ist nicht installiert.</div>'

  const kostenEl = $('system-kosten')
  const modelle = (nutzung?.by_model || []).filter((m) => (m.input_tokens || 0) + (m.output_tokens || 0) > 0)
  kostenEl.innerHTML = modelle.length
    ? `<table class="tabelle"><thead><tr><th>Modell</th><th>Tokens</th><th>Aufrufe</th><th>Kosten</th></tr></thead><tbody>
        ${modelle.map((m) => `<tr><td>${maskieren(m.model)}</td><td>${tokens((m.input_tokens || 0) + (m.output_tokens || 0))}</td><td>${zahl(m.api_calls)}</td><td>${euro(m.estimated_cost)}</td></tr>`).join('')}
       </tbody></table>`
    : '<div class="leise">Keine Nutzung in den letzten 30 Tagen.</div>'
}
