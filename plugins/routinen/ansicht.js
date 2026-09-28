// Routinen-Plugin: Standardaufgaben mit Auslösewort, Prompt, Bausteinen, Ausgabe und Zeitplan.
// Daten in plugins/routinen/daten.json: { routinen: [...], einstellungen: { ort, newsThemen } }

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const zwei = (n) => String(n).padStart(2, '0')
const heuteText = () => { const d = new Date(); return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}` }
const neueId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

// Nur für die einmalige Umstellung alter Routinen: was ein angehakter Baustein im Prompt bedeutet
const BAUSTEIN_TEXT = {
  termine: () => 'Meine Termine der nächsten Tage (aus dem Kalender).',
  shop: () => 'Shop: Bestellungen und Umsatz seit gestern und in dieser Woche, offene Zahlungen, live aus Shopify.',
  mails: () => 'Postfach: neue Mails und welche davon eine Antwort von mir brauchen.',
  wetter: (e) => `Wetter heute und morgen${e.ort ? ` in ${e.ort}` : ''}.`,
  news: (e) => `Die wichtigsten aktuellen News${e.newsThemen ? ` zu ${e.newsThemen}` : ''} (höchstens 3, mit Quelle).`,
  jobs: () => 'Geplante Hermes-Jobs: was lief, was ist fehlgeschlagen, was steht heute an.',
  entscheidungen: () => 'Entscheidungen im Vault (Donnerwolf-Shop\\04_Decision_Log), deren Prüfdatum fällig ist.'
}

const STANDARD = [
  {
    name: 'Morgenbericht',
    ausloeser: ['morgenbericht', 'guten morgen'],
    prompt: 'Gib mir meinen Morgenbericht. Kurz und klar, das Wichtigste zuerst.\n\nDarin:\n- Meine Termine der nächsten Tage (aus dem Kalender).\n- Shop: Bestellungen und Umsatz seit gestern, offene Zahlungen, live aus Shopify.\n- Postfach: neue Mails und welche eine Antwort brauchen.',
    bausteine: [],
    vorlesen: true,
    speichern: true,
    pfad: 'Donnerwolf-Shop\\04_Analytics\\Morgenberichte\\{datum}.md',
    knopf: true,
    zeitplan: { aktiv: false, zeit: '07:30', tage: [0, 1, 2, 3, 4] }
  },
  { name: 'Wie läuft der Shop?', ausloeser: ['shop check', 'wie läuft der shop'], prompt: 'Wie läuft der Shop? Bestellungen und Umsatz von heute und dieser Woche, offene Zahlungen, live aus Shopify. Kurz und mit Zahlen.', bausteine: [], vorlesen: false, knopf: true },
  { name: 'Neue Mails?', ausloeser: ['neue mails', 'postfach'], prompt: 'Was ist neu im Postfach? Welche Mails brauchen eine Antwort von mir? Kurz.', bausteine: [], vorlesen: false, knopf: true },
  { name: 'Was steht an?', ausloeser: ['was steht an'], prompt: 'Was steht heute und in den nächsten Tagen an? Meine Termine, geplante Jobs und Entscheidungen, die geprüft werden müssen.', bausteine: [], vorlesen: false, knopf: true }
]

function normalisieren(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.\s]*/, '') // "Hey Luzzy, Morgenbericht"
    .replace(/[.,!?;:"„“]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { routinen: [], einstellungen: { ort: '', newsThemen: '' } }
  let gewaehlt = null // ID der Routine im Editor

  async function laden() {
    const d = await ctx.daten.laden()
    if (!Array.isArray(d.routinen)) {
      // Erster Start: die bisherigen Schnellbefehle als Routinen anlegen
      d.routinen = STANDARD.map((r) => ({ id: neueId(), speichern: false, pfad: '', zeitplan: { aktiv: false, zeit: '08:00', tage: [0, 1, 2, 3, 4] }, ...r }))
      d.einstellungen = { ort: '', newsThemen: 'Wikinger- und Norse-Mode, Shopify, Print-Branche' }
      await ctx.daten.speichern(d)
    }
    daten = { routinen: d.routinen, einstellungen: { ort: '', newsThemen: '', ...(d.einstellungen || {}) }, gelaufen: d.gelaufen || {} }
    // Umstellung auf "nur Prompt": angehakte Bausteine einmalig als Text in den Prompt schreiben
    let umgestellt = false
    for (const routine of daten.routinen) {
      if (!routine.bausteine?.length) continue
      const zeilen = routine.bausteine.map((b) => BAUSTEIN_TEXT[b]?.(daten.einstellungen)).filter(Boolean)
      if (zeilen.length) routine.prompt = `${routine.prompt.trim()}\n\nDarin:\n${zeilen.map((z) => `- ${z}`).join('\n')}`
      routine.bausteine = []
      umgestellt = true
    }
    if (umgestellt) await ctx.daten.speichern(daten)
    zeichnen()
    knoepfeSetzen()
  }
  async function speichern() {
    await ctx.daten.speichern(daten)
    zeichnen()
    knoepfeSetzen()
  }

  // ── Auftrag zusammenbauen ──
  async function auftrag(r, zusatz = '') {
    const jetzt = new Date()
    const teile = [
      `[Routine „${r.name}“] Heute ist ${jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.`,
      r.prompt.trim()
    ]
    if (zusatz) teile.push(`Zusatz von Felix: ${zusatz}`)
    // Termine, Wetter usw. liefert Jarves-OS selbst: erwähnt der Prompt sie, werden die Daten angehängt
    const mitgeliefert = await ctx.kontextFuer(`${r.prompt} ${zusatz}`)
    if (mitgeliefert) teile.push(`Diese Daten liefert Jarves-OS, nutze sie direkt statt zu suchen:\n\n${mitgeliefert}`)
    if (r.speichern && r.pfad) teile.push(`Speichere das Ergebnis als Markdown-Datei unter ${r.pfad.replace('{datum}', heuteText())} im Donnerwolf-Ordner.`)
    if (r.vorlesen) teile.push('Formuliere die Antwort so, dass sie sich gut vorlesen lässt: kurze Sätze, keine Tabellen.')
    return teile.join('\n\n')
  }

  async function ausfuehren(r, { zusatz = '', automatisch = false } = {}) {
    const text = await auftrag(r, zusatz)
    daten.gelaufen[r.id] = Date.now()
    ctx.daten.speichern(daten)
    return ctx.luzzy(text, { anzeige: `${automatisch ? '⏰' : '▶'} ${r.name}${zusatz ? `: ${zusatz}` : ''}`, vorlesen: r.vorlesen, ansichtWechseln: !automatisch })
  }

  // ── Auslösewort: Eingabe abfangen ──
  ctx.eingabeFilter(async (text) => {
    const n = normalisieren(text)
    if (!n) return null
    for (const r of daten.routinen) {
      for (const wort of r.ausloeser || []) {
        const w = normalisieren(wort)
        if (!w) continue
        // Genau das Wort, oder das Wort am Anfang mit kurzem Zusatz ("Morgenbericht ohne Wetter")
        if (n === w || (n.startsWith(`${w} `) && n.length - w.length <= 60)) {
          const zusatz = n.slice(w.length).trim()
          daten.gelaufen[r.id] = Date.now()
          ctx.daten.speichern(daten)
          return { text: await auftrag(r, zusatz), anzeige: `▶ ${r.name}${zusatz ? `: ${zusatz}` : ''}`, vorlesen: r.vorlesen }
        }
      }
    }
    return null
  })

  function knoepfeSetzen() {
    ctx.knoepfe(
      daten.routinen
        .filter((r) => r.knopf)
        .map((r) => ({ name: r.name, titel: `Routine „${r.name}“${r.ausloeser?.length ? ` · Auslösewort: ${r.ausloeser.join(', ')}` : ''}`, fn: () => ausfuehren(r) }))
    )
  }

  // ── Zeitplan: jede halbe Minute prüfen ──
  setInterval(async () => {
    const jetzt = new Date()
    const tag = (jetzt.getDay() + 6) % 7 // Montag = 0
    const minute = jetzt.getHours() * 60 + jetzt.getMinutes()
    for (const r of daten.routinen) {
      const z = r.zeitplan
      if (!z?.aktiv || !z.tage?.includes(tag)) continue
      const [h, mi] = String(z.zeit || '').split(':').map(Number)
      if (Number.isNaN(h)) continue
      const soll = h * 60 + mi
      const schluessel = `${r.id}:${heuteText()}`
      if (minute < soll || minute > soll + 120 || daten.gelaufen[`plan:${r.id}`] === schluessel) continue
      if (!ctx.bereit()) continue // Luzzy beschäftigt: nächste Runde nochmal
      daten.gelaufen[`plan:${r.id}`] = schluessel
      await ausfuehren(r, { automatisch: true })
    }
  }, 30000)

  // ── Oberfläche ──
  ctx.kopfKnoepfe.innerHTML = '<button class="knopf-gold" data-r="neu" type="button">+ Neue Routine</button>'
  ctx.element.innerHTML = `
    <div class="rt-raster">
      <div class="rt-liste hud" data-liste></div>
      <div class="rt-editor hud" data-editor><div class="leise rt-leer">Links eine Routine wählen oder „+ Neue Routine“.</div></div>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function zeitplanText(z) {
    if (!z?.aktiv) return ''
    const tage = z.tage?.length === 7 ? 'täglich' : z.tage?.length === 5 && !z.tage.includes(5) && !z.tage.includes(6) ? 'werktags' : (z.tage || []).map((t) => TAGE[t]).join(', ')
    return `⏰ ${tage} ${z.zeit}`
  }

  function zeichnen() {
    $('[data-liste]').innerHTML =
      
      (daten.routinen.length
        ? daten.routinen
            .map(
              (r) => `
          <button class="rt-karte${r.id === gewaehlt ? ' gewaehlt' : ''}" data-routine="${m(r.id)}" type="button">
            <span class="rt-name">${m(r.name)}</span>
            <span class="rt-woerter">${(r.ausloeser || []).map((w) => `<i>„${m(w)}“</i>`).join(' ')}</span>
            <span class="rt-info">${[r.knopf ? 'Knopf' : '', r.vorlesen ? 'vorlesen' : '', r.speichern ? 'speichern' : '', zeitplanText(r.zeitplan)].filter(Boolean).join(' · ')}</span>
            <span class="rt-prompt">${m((r.prompt || '').split('\n')[0])}</span>
          </button>`
            )
            .join('')
        : '<div class="leise">Noch keine Routinen.</div>')
  }

  function editorZeigen(r) {
    gewaehlt = r?.id || null
    zeichnen()
    if (!r) return ($('[data-editor]').innerHTML = '<div class="leise rt-leer">Links eine Routine wählen oder „+ Neue Routine“.</div>')
    const z = r.zeitplan || { aktiv: false, zeit: '08:00', tage: [0, 1, 2, 3, 4] }
    $('[data-editor]').innerHTML = `
      <form class="rt-form" data-form>
        <div class="rt-kopf"><h3>${r.neu ? 'Neue Routine' : 'Routine bearbeiten'}</h3><button class="rt-zu" data-r="schliessen" type="button" title="Schließen">✕</button></div>
        <label>Name <input name="name" required maxlength="60" value="${m(r.name)}" placeholder="z. B. Feierabend" /></label>
        <label>Auslösewörter <input name="ausloeser" value="${m((r.ausloeser || []).join(', '))}" placeholder="z. B. feierabend, tagesabschluss" />
          <small>Mehrere mit Komma trennen. Sagen oder tippen, z. B. „Hey Luzzy, Feierabend“. Was du danach sagst, geht als Zusatz mit („Morgenbericht ohne Wetter“).</small></label>
        <label>Was soll Luzzy tun? (dein Prompt)
          <textarea name="prompt" rows="8" required placeholder="z. B. Gib mir meinen Morgenbericht: Wetter in Schongau, News zu Shopify, meine Termine heute, neue Bestellungen und was im Postfach eine Antwort braucht.">${m(r.prompt || '')}</textarea>
          <small>Schreib einfach alles rein, was du willst. Erwähnst du „Termine“ oder „Kalender“, hängt Jarves-OS deine Termine aus dem Kalender automatisch an. Wetter und News holt Luzzy per Websuche.</small></label>
        <fieldset><legend>Ergebnis</legend>
          <label class="rt-haken"><input type="checkbox" name="vorlesen" ${r.vorlesen ? 'checked' : ''}/> Vorlesen</label>
          <label class="rt-haken"><input type="checkbox" name="speichern" ${r.speichern ? 'checked' : ''}/> Als Datei speichern unter</label>
          <input name="pfad" value="${m(r.pfad || '')}" placeholder="z. B. Donnerwolf-Shop\\04_Analytics\\Berichte\\{datum}.md" />
          <small>{datum} wird durch das heutige Datum ersetzt. Ordner innerhalb von Dokumente\\Donnerwolf.</small>
          <label class="rt-haken"><input type="checkbox" name="knopf" ${r.knopf ? 'checked' : ''}/> Als Knopf über der Eingabe zeigen</label>
        </fieldset>
        <fieldset><legend>Zeitplan</legend>
          <label class="rt-haken"><input type="checkbox" name="planAktiv" ${z.aktiv ? 'checked' : ''}/> Automatisch ausführen um <input name="zeit" type="time" value="${m(z.zeit || '08:00')}" /></label>
          <div class="rt-tage">${TAGE.map((t, i) => `<label class="rt-tag"><input type="checkbox" name="tag" value="${i}" ${z.tage?.includes(i) ? 'checked' : ''}/><span>${t}</span></label>`).join('')}</div>
          <small>Läuft, solange Jarves-OS offen ist.</small>
        </fieldset>
        <div class="rt-vorschau"><div class="rt-vorschau-titel">So geht der Auftrag an Luzzy</div><pre data-vorschau></pre></div>
        <div class="rt-knoepfe">
          <button class="knopf-gold" type="submit">Speichern</button>
          <button class="knopf-flach" data-r="ausfuehren" type="button">Jetzt ausführen</button>
          ${r.neu ? '' : '<button class="knopf-flach gefahr" data-r="loeschen" type="button">Löschen</button>'}
        </div>
      </form>`
    vorschauAktualisieren()
  }

  function formLesen() {
    const f = $('[data-form]')
    return {
      name: f.name.value.trim(),
      ausloeser: f.ausloeser.value.split(',').map((w) => w.trim()).filter(Boolean),
      prompt: f.prompt.value.trim(),
      bausteine: [],
      vorlesen: f.vorlesen.checked,
      speichern: f.speichern.checked,
      pfad: f.pfad.value.trim(),
      knopf: f.knopf.checked,
      zeitplan: { aktiv: f.planAktiv.checked, zeit: f.zeit.value || '08:00', tage: [...f.querySelectorAll('[name="tag"]:checked')].map((x) => Number(x.value)) }
    }
  }

  let vorschauUhr = 0
  function vorschauAktualisieren() {
    clearTimeout(vorschauUhr)
    vorschauUhr = setTimeout(async () => {
      const el = $('[data-vorschau]')
      if (el) el.textContent = await auftrag({ ...formLesen(), name: formLesen().name || 'Neue Routine', prompt: formLesen().prompt || '(dein Prompt)' })
    }, 200)
  }

  // ── Bedienung ──
  ctx.kopfKnoepfe.addEventListener('click', (e) => {
    if (e.target.closest('[data-r="neu"]')) editorZeigen({ id: neueId(), neu: true, name: '', ausloeser: [], prompt: '', bausteine: [], vorlesen: true, knopf: true })
  })
  ctx.element.addEventListener('click', async (e) => {
    const karte = e.target.closest('[data-routine]')
    if (karte) return editorZeigen(daten.routinen.find((r) => r.id === karte.dataset.routine))
    const aktion = e.target.closest('[data-r]')?.dataset.r
    if (aktion === 'schliessen') return editorZeigen(null)
    if (aktion === 'ausfuehren') {
      const r = { ...formLesen(), id: gewaehlt }
      if (!r.prompt) return ctx.hinweis('Bitte erst einen Prompt eintragen.', { titel: 'Routine' })
      return ausfuehren({ ...r, name: r.name || 'Routine' })
    }
    if (aktion === 'loeschen') {
      const r = daten.routinen.find((x) => x.id === gewaehlt)
      if (r && (await ctx.bestaetigen(`Routine „${r.name}“ löschen?`, { titel: 'Routine löschen', ja: 'Löschen', gefahr: true }))) {
        daten.routinen = daten.routinen.filter((x) => x.id !== gewaehlt)
        editorZeigen(null)
        await speichern()
      }
    }
  })
  ctx.element.addEventListener('input', (e) => {
    if (e.target.closest('[data-form]')) vorschauAktualisieren()
  })
  ctx.element.addEventListener('change', async (e) => {
    const feld = e.target.closest('[data-e]')
    if (feld) {
      daten.einstellungen[feld.dataset.e] = feld.value.trim()
      await ctx.daten.speichern(daten)
      vorschauAktualisieren()
    }
    if (e.target.closest('[data-form]')) vorschauAktualisieren()
  })
  ctx.element.addEventListener('submit', async (e) => {
    e.preventDefault()
    const neu = { ...formLesen(), id: gewaehlt }
    if (!neu.name || !neu.prompt) return ctx.hinweis('Name und Prompt brauchen einen Inhalt.', { titel: 'Routine' })
    // Auslösewort darf nicht doppelt vergeben sein
    const doppelt = neu.ausloeser.find((w) => daten.routinen.some((r) => r.id !== neu.id && (r.ausloeser || []).some((x) => normalisieren(x) === normalisieren(w))))
    if (doppelt) return ctx.hinweis(`Das Auslösewort „${doppelt}“ gehört schon zu einer anderen Routine.`, { titel: 'Routine' })
    const index = daten.routinen.findIndex((r) => r.id === neu.id)
    if (index >= 0) daten.routinen[index] = neu
    else daten.routinen.push(neu)
    await speichern()
    editorZeigen(null)
  })

  await laden()
  return { laden, takt: 120000 }
}
