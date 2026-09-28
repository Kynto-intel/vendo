// Werkstatt (Idee 34): Felix beschreibt ein Plugin in eigenen Worten, Luzzy baut es in jarves-os\werkstatt\<id>\,
// Jarves-OS prüft es (Aufbau, Syntax, Rechte) und baut es erst nach Felix' Ja ein. Vorhandene Plugins lassen sich
// genauso ändern. Per Sprache: „Bau mir ein Plugin für meine Stoffvorräte“ · „Neues Plugin: Kilometer-Tagebuch“.

const STUFE = {
  sicher: ['✓ Sicher', 'Nur Oberfläche: eigener Bereich, eigene Daten. Kein Internet, kein Zugriff auf den PC.'],
  achtung: ['⚠ Braucht Rechte', 'Nutzt mehr als nur die Oberfläche (siehe Liste). Einbauen nur, wenn du damit einverstanden bist.'],
  gefahr: ['⛔ Vorsicht', 'Der Code macht Dinge, die ein Plugin normalerweise nicht braucht. Besser erst von Luzzy ändern lassen.'],
  fehler: ['✗ Noch nicht fertig', 'Der Entwurf hat Fehler. „Nochmal ändern“ und Luzzy sagen, sie soll sie beheben.']
}
const BAUEN = /^(?:(?:hey\s+)?luzzy[,\s]+)?(?:bau|baue|erstell|erstelle|mach|programmier)(?:\s+mir)?(?:\s+mal)?\s+(?:ein|eine|einen)?\s*(?:neues\s+)?plugin(?:\s+(?:für|zum|zur|das|mit|über|namens))?\s*[:,]?\s*(.{3,})$/i
const NEU = /^(?:(?:hey\s+)?luzzy[,\s]+)?neues\s+plugin\s*[:,]?\s*(.{3,})$/i
const fehlertext = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export async function starten(ctx) {
  const m = ctx.maskieren
  const { werkstatt: WERKSTATT, plugins: PLUGINS } = await ctx.aufrufen('pfade')
  let offenerCode = null // id, deren Code gerade aufgeklappt ist
  const berichte = new Map() // id → Prüfbericht
  let zuletztEingebaut = null

  // ── Aufträge an Luzzy ──
  const auftragNeu = (id, wunsch) => `[Plugin-Werkstatt] Felix möchte ein neues Plugin für Jarves-OS: „${wunsch}“

Bau es bitte als Dateien im Ordner ${WERKSTATT}\\${id}\\ . Felix hat das gerade in Jarves-OS beauftragt – das ist seine Freigabe für neue Dateien, aber nur in genau diesem Ordner.
So gehst du vor:
1. Lies die Anleitung ${PLUGINS}\\README.md und nimm ${PLUGINS}\\aufgaben\\ als Vorbild (plugin.json, ansicht.js, stil.css). Braucht das Plugin Daten aus dem Internet, schau dir zusätzlich ${PLUGINS}\\wetter\\haupt.js an.
2. Pflicht: plugin.json mit "id": "${id}", Name, "version": "1.0.0", Beschreibung und "bereich": { "name": … }; ansicht.js mit export async function starten(ctx). Optional stil.css und – nur wenn wirklich nötig, z. B. für Internet – haupt.js.
3. Alles auf Deutsch, Design wie die anderen Plugins: CSS-Variablen (--gold, --gold-hell, --flaeche, --rahmen, --text, --text-leise, --radius) und Klassen mit einem eigenen kurzen Präfix. Rückfragen mit ctx.bestaetigen, Hinweise mit ctx.hinweis (nie confirm/alert), speichern nur mit ctx.daten.
4. Kein Zugriff auf Zugangsdaten, Hermes-Einstellungen oder fremde Dateien, keine Programme starten.
5. Schreib nichts in ${PLUGINS}\\ und ändere nichts anderes: Jarves-OS prüft das Plugin und baut es erst nach Felix' Ja ein.
Zum Schluss in 2–3 Sätzen: was das Plugin kann und wie man es bedient.`
  const auftragAendern = (id, wunsch) => `[Plugin-Werkstatt] Ändere bitte das Plugin im Ordner ${WERKSTATT}\\${id}\\ : „${wunsch}“

Das ist Felix' Freigabe, Dateien in genau diesem Ordner zu ändern oder anzulegen, nirgends sonst. Lies zuerst die vorhandenen Dateien dort und die Anleitung ${PLUGINS}\\README.md. Regeln wie immer: Deutsch, Design über die CSS-Variablen, ctx.bestaetigen/ctx.hinweis statt confirm/alert, speichern nur mit ctx.daten, keine Zugangsdaten, keine Programme starten, nichts in ${PLUGINS}\\ schreiben.
Zum Schluss kurz, was sich geändert hat.`

  async function bauen(wunsch) {
    wunsch = String(wunsch || '').trim()
    if (wunsch.length < 3) return ctx.hinweis('Beschreib kurz, was das Plugin können soll.', { titel: 'Werkstatt' })
    if (!ctx.bereit()) return ctx.hinweis('Luzzy ist gerade beschäftigt oder nicht verbunden. Gleich nochmal versuchen.', { titel: 'Werkstatt' })
    const id = await ctx.aufrufen('neueId', wunsch)
    const ok = await ctx.luzzy(auftragNeu(id, wunsch), { anzeige: `🛠 Werkstatt – neues Plugin: ${wunsch}`, ansichtWechseln: false })
    if (ok !== false) await laden()
    return id
  }
  async function aendern(id, wunsch) {
    wunsch = String(wunsch || '').trim()
    if (wunsch.length < 3) return
    if (!ctx.bereit()) return ctx.hinweis('Luzzy ist gerade beschäftigt oder nicht verbunden. Gleich nochmal versuchen.', { titel: 'Werkstatt' })
    await ctx.luzzy(auftragAendern(id, wunsch), { anzeige: `🛠 Werkstatt – ${id} ändern: ${wunsch}`, ansichtWechseln: false })
    berichte.delete(id)
    await laden()
  }

  // ── Aufbau ──
  ctx.element.innerHTML = `
    <div class="ws-raster">
      <section class="hud ws-neu">
        <h3>Neues Plugin bestellen</h3>
        <form data-neu>
          <textarea name="wunsch" rows="3" maxlength="1500" placeholder="Was soll es können? Z. B. „Ein Plugin für meine Stoffvorräte: Stoffe mit Farbe, Menge und Lieferant, Warnung wenn etwas knapp wird.“"></textarea>
          <div class="ws-zeile"><button class="knopf-gold" type="submit">🛠 Luzzy soll es bauen</button><span class="leise klein">Oder sag: „Bau mir ein Plugin für …“</span></div>
        </form>
        <div class="leise klein">Luzzy baut in einer Werkstatt-Ecke (<code>werkstatt\\</code>). Jarves-OS prüft den Entwurf, eingebaut wird erst nach deinem Ja.</div>
      </section>
      <section class="hud ws-entwuerfe">
        <h3>In der Werkstatt</h3>
        <div data-entwuerfe></div>
      </section>
      <section class="hud ws-installiert">
        <h3>Eingebaute Plugins</h3>
        <div data-installiert></div>
      </section>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function rechteHtml(b) {
    const liste = [...b.fehler.map((f) => ({ text: f, stufe: 'fehler' })), ...b.rechte]
    return liste.length ? `<ul class="ws-rechte">${liste.map((r) => `<li class="ws-${r.stufe}">${m(r.text)}</li>`).join('')}</ul>` : ''
  }

  async function laden() {
    const [entwuerfe, installierte] = await Promise.all([ctx.aufrufen('entwuerfe'), ctx.aufrufen('installierte')])
    for (const e of entwuerfe) if (e.fertig && (!berichte.has(e.id) || berichte.get(e.id).stand !== e.geaendert)) berichte.set(e.id, { ...(await ctx.aufrufen('pruefen', e.id)), stand: e.geaendert })
    $('[data-entwuerfe]').innerHTML = (zuletztEingebaut ? `<div class="ws-eingebaut">✓ „${m(zuletztEingebaut)}“ ist eingebaut. Damit es erscheint, Jarves-OS einmal neu starten. <button class="knopf-gold" data-neustart type="button">Jetzt neu starten</button></div>` : '') + (entwuerfe.length
      ? entwuerfe.map((e) => {
        if (!e.fertig) return `<article class="ws-karte ws-baut"><div class="ws-kopf"><b>${m(e.name)}</b><span class="ws-marke">⏳ Luzzy baut noch …</span></div><div class="leise klein">${e.dateien.length ? `Bisher: ${m(e.dateien.join(', '))}` : 'Noch keine Dateien.'}</div><div class="ws-knoepfe"><button class="knopf-flach gefahr" data-verwerfen="${m(e.id)}" type="button">Verwerfen</button></div></article>`
        const b = berichte.get(e.id)
        const [titel, erklaerung] = STUFE[b.stufe]
        return `<article class="ws-karte ws-stufe-${b.stufe}">
          <div class="ws-kopf"><b>${m(b.name)}</b>${b.ersetzt ? '<span class="ws-marke">Änderung eines eingebauten Plugins</span>' : '<span class="ws-marke">Neu</span>'}<span class="ws-stufe">${titel}</span></div>
          ${b.beschreibung ? `<div class="ws-text">${m(b.beschreibung)}</div>` : ''}
          <div class="leise klein">${m(erklaerung)}</div>
          ${rechteHtml(b)}
          <div class="ws-knoepfe">
            <button class="knopf-gold" data-einbauen="${m(e.id)}" type="button" ${b.stufe === 'fehler' ? 'disabled' : ''}>Ja, einbauen</button>
            <button class="knopf-flach" data-aendern-form="${m(e.id)}" type="button">Nochmal ändern …</button>
            <button class="knopf-flach" data-code="${m(e.id)}" type="button">${offenerCode === e.id ? 'Code zuklappen' : 'Code ansehen'}</button>
            <button class="knopf-flach gefahr" data-verwerfen="${m(e.id)}" type="button">Verwerfen</button>
          </div>
          <form class="ws-aendern" data-aendern="${m(e.id)}" hidden><input maxlength="800" placeholder="Was soll Luzzy ändern?" /><button class="knopf-gold" type="submit">Senden</button></form>
          <div class="ws-code" data-code-ziel="${m(e.id)}"></div>
        </article>`
      }).join('')
      : '<div class="leise">Gerade nichts in Arbeit. Bestell oben ein neues Plugin oder lass unten ein vorhandenes ändern.</div>')
    $('[data-installiert]').innerHTML = installierte.map((p) => `
      <div class="ws-plugin">
        <div><b>${m(p.name)}</b> <span class="leise klein">${m(p.version)}</span><div class="leise klein">${m(p.beschreibung)}</div></div>
        ${p.eigen ? '<span class="leise klein">die Werkstatt selbst</span>' : `<div class="ws-knoepfe">
          <button class="knopf-flach" data-aendern-installiert="${m(p.id)}" type="button" ${p.inArbeit ? 'disabled title="Liegt schon in der Werkstatt"' : ''}>Ändern lassen …</button>
          <button class="knopf-flach gefahr" data-entfernen="${m(p.id)}" data-name="${m(p.name)}" type="button">Entfernen</button>
        </div>`}
        <form class="ws-aendern" data-aendern-neu="${m(p.id)}" hidden><input maxlength="800" placeholder="Was soll Luzzy an „${m(p.name)}“ ändern?" /><button class="knopf-gold" type="submit">Senden</button></form>
      </div>`).join('')
    if (offenerCode) await codeZeigen(offenerCode)
  }

  async function codeZeigen(id) {
    const ziel = $(`[data-code-ziel="${CSS.escape(id)}"]`)
    if (!ziel) return
    const dateien = await ctx.aufrufen('code', id)
    ziel.innerHTML = Object.entries(dateien).map(([name, text]) => `<details open><summary>${m(name)}</summary><pre>${m(text)}</pre></details>`).join('')
  }

  // ── Bedienung ──
  $('[data-neu]').addEventListener('submit', async (e) => {
    e.preventDefault()
    const feld = e.target.wunsch
    const id = await bauen(feld.value)
    if (id) feld.value = ''
  })
  ctx.element.addEventListener('click', async (e) => {
    const k = e.target.closest('button')
    if (!k) return
    try {
      if (k.dataset.neustart != null) return ctx.aufrufen('neuStarten')
      if (k.dataset.code) {
        offenerCode = offenerCode === k.dataset.code ? null : k.dataset.code
        return laden()
      }
      if (k.dataset.aendernForm) {
        const f = $(`[data-aendern="${CSS.escape(k.dataset.aendernForm)}"]`)
        f.hidden = !f.hidden
        return f.hidden || f.querySelector('input').focus()
      }
      if (k.dataset.aendernInstalliert) {
        const f = $(`[data-aendern-neu="${CSS.escape(k.dataset.aendernInstalliert)}"]`)
        f.hidden = !f.hidden
        return f.hidden || f.querySelector('input').focus()
      }
      if (k.dataset.einbauen) {
        const b = berichte.get(k.dataset.einbauen)
        const warnung = b.stufe === 'gefahr'
          ? `„${b.name}“ macht Dinge, die ein Plugin normalerweise nicht braucht:\n• ${b.rechte.filter((r) => r.stufe === 'gefahr').map((r) => r.text).join('\n• ')}\n\nTrotzdem einbauen?`
          : b.stufe === 'achtung'
            ? `„${b.name}“ braucht mehr als nur die Oberfläche:\n• ${b.rechte.filter((r) => r.stufe !== 'hinweis').map((r) => r.text).join('\n• ')}\n\nEinbauen?`
            : `„${b.name}“ ${b.ersetzt ? 'ersetzt das eingebaute Plugin (die alte Fassung wird gesichert, deine Daten bleiben)' : 'wird eingebaut'}. Einverstanden?`
        if (!(await ctx.bestaetigen(warnung, { titel: 'Plugin einbauen', ja: 'Einbauen', gefahr: b.stufe === 'gefahr' }))) return
        const r = await ctx.aufrufen('einbauen', k.dataset.einbauen)
        zuletztEingebaut = b.name
        berichte.delete(r.id)
        ctx.melden({ art: 'hinweis', titel: `Plugin „${b.name}“ eingebaut`, anzeige: r.gesichert ? `Alte Fassung gesichert (${r.gesichert}). Jarves-OS neu starten.` : 'Jarves-OS neu starten, dann erscheint es links.' })
        return laden()
      }
      if (k.dataset.verwerfen) {
        if (!(await ctx.bestaetigen('Diesen Entwurf verwerfen? Er landet im Papierkorb.', { titel: 'Entwurf verwerfen', ja: 'Verwerfen', gefahr: true }))) return
        await ctx.aufrufen('verwerfen', k.dataset.verwerfen)
        berichte.delete(k.dataset.verwerfen)
        return laden()
      }
      if (k.dataset.entfernen) {
        if (!(await ctx.bestaetigen(`Plugin „${k.dataset.name}“ entfernen? Es wird vorher gesichert und landet im Papierkorb. Danach Jarves-OS neu starten.`, { titel: 'Plugin entfernen', ja: 'Entfernen', gefahr: true }))) return
        await ctx.aufrufen('entfernen', k.dataset.entfernen)
        zuletztEingebaut = null
        ctx.melden({ art: 'hinweis', titel: `Plugin „${k.dataset.name}“ entfernt`, anzeige: 'Jarves-OS neu starten, dann ist es weg.' })
        return laden()
      }
    } catch (err) {
      ctx.hinweis(fehlertext(err), { titel: 'Werkstatt' })
    }
  })
  ctx.element.addEventListener('submit', async (e) => {
    const f = e.target
    const text = f.querySelector('input')?.value
    if (f.dataset.aendern) {
      e.preventDefault()
      await aendern(f.dataset.aendern, text)
    } else if (f.dataset.aendernNeu) {
      e.preventDefault()
      try {
        await ctx.aufrufen('zumAendern', f.dataset.aendernNeu)
        await aendern(f.dataset.aendernNeu, text)
      } catch (err) {
        ctx.hinweis(fehlertext(err), { titel: 'Werkstatt' })
      }
    }
  })

  // „Bau mir ein Plugin für …“ per Sprache oder Tippen: Luzzy bekommt den Werkstatt-Auftrag
  ctx.befehl(async (text) => {
    const t = BAUEN.exec(String(text).trim()) || NEU.exec(String(text).trim())
    if (!t) return null
    const id = await bauen(t[1].replace(/[.!?]+$/, ''))
    return id ? true : 'Das hat gerade nicht geklappt. Versuch es gleich nochmal.'
  })

  await laden()
  return { laden, takt: 5000 }
}
