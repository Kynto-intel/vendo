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

  // ── Aufträge an Luzzy (Details stehen in ihrem Hermes-Skill „jarves-plugin-werkstatt“) ──
  const PRUEFEN = `node "${PLUGINS}\\werkstatt\\pruefen-cli.js"`
  const regeln = (id) => `Nutze dafür deinen Skill jarves-plugin-werkstatt (Aufbau, ctx-Werkzeuge, Design, Regeln). Falls du ihn nicht findest: Anleitung ${PLUGINS}\\README.md, Vorbild ${PLUGINS}\\aufgaben\\.
Das ist Felix' Freigabe für neue oder geänderte Dateien, aber nur im Ordner ${WERKSTATT}\\${id}\\ . Nichts in ${PLUGINS}\\ schreiben, nichts anderes ändern – Jarves-OS prüft das Plugin, Felix testet es und baut es erst danach ein.
Prüf dich selbst, bevor du fertig meldest, und behebe alles, bis keine FEHLER mehr kommen:
${PRUEFEN} ${id}`
  const auftragNeu = (id, wunsch) => `[Plugin-Werkstatt] Felix möchte ein neues Plugin für Jarves-OS: „${wunsch}“

Bau es als Dateien im Ordner ${WERKSTATT}\\${id}\\ (plugin.json mit "id": "${id}", ansicht.js, optional stil.css, haupt.js nur wenn nötig).
${regeln(id)}
Zum Schluss in 2–3 Sätzen: was das Plugin kann, wie man es bedient, und dass Felix jetzt den Testlauf starten soll.`
  const auftragAendern = (id, wunsch) => `[Plugin-Werkstatt] Ändere das Plugin im Ordner ${WERKSTATT}\\${id}\\ : „${wunsch}“

Lies zuerst alle vorhandenen Dateien dort.
${regeln(id)}
Zum Schluss kurz, was sich geändert hat, und dass Felix neu testen soll.`
  const auftragReparieren = (id, fehler) => `[Plugin-Werkstatt] Im Plugin im Ordner ${WERKSTATT}\\${id}\\ gibt es Fehler. Finde die Ursache und behebe sie:
${fehler.map((f) => `- ${f}`).join('\n')}

Lies dazu die Dateien dort (und .testbericht.json mit dem letzten Testlauf von Felix).
${regeln(id)}
Zum Schluss kurz, was der Fehler war und was du geändert hast, und dass Felix neu testen soll.`

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
  // Luzzy behebt die Fehler selbst (aus der Prüfung und aus Felix' Testlauf)
  async function reparieren(id) {
    if (!ctx.bereit()) return ctx.hinweis('Luzzy ist gerade beschäftigt oder nicht verbunden. Gleich nochmal versuchen.', { titel: 'Werkstatt' })
    const b = berichte.get(id) || (await ctx.aufrufen('pruefen', id))
    const t = await ctx.aufrufen('testErgebnis', id)
    const fehler = [...(b?.fehler || []), ...(t && !t.ok && !t.veraltet ? (t.fehler.length ? t.fehler.map((f) => `Testlauf: ${f}`) : ['Testlauf: Das Plugin ist nicht gestartet.']) : [])]
    if (!fehler.length) return ctx.hinweis('Gerade sind keine Fehler bekannt. Mach erst einen Testlauf.', { titel: 'Werkstatt' })
    await ctx.luzzy(auftragReparieren(id, fehler), { anzeige: `🔧 Werkstatt – Fehler in ${id} beheben (${fehler.length})`, ansichtWechseln: false })
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
      <details class="hud ws-installiert" data-liste>
        <summary><h3>Eingebaute Plugins</h3><span class="leise klein" data-anzahl></span></summary>
        <div data-installiert></div>
      </details>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function rechteHtml(b) {
    const liste = [...b.fehler.map((f) => ({ text: f, stufe: 'fehler' })), ...b.rechte]
    return liste.length ? `<ul class="ws-rechte">${liste.map((r) => `<li class="ws-${r.stufe}">${m(r.text)}</li>`).join('')}</ul>` : ''
  }

  // Testlauf-Zeile einer Entwurfs-Karte
  function testHtml(e, t) {
    if (!t) return '<div class="ws-test ws-test-offen">🧪 Noch nicht getestet. Vor dem Einbauen einmal den Testlauf machen.</div>'
    if (t.laeuft && !t.gestartet && !t.fehler.length) return '<div class="ws-test ws-test-offen">🧪 Testlauf läuft … (Fenster ist offen)</div>'
    if (t.veraltet) return '<div class="ws-test ws-test-offen">🧪 Luzzy hat seit dem Test etwas geändert. Bitte nochmal testen.</div>'
    if (t.ok) return `<div class="ws-test ws-test-ok">🧪 Testlauf: ✓ läuft ohne Fehler${t.laeuft ? ' (Fenster noch offen)' : ''}</div>`
    return `<div class="ws-test ws-test-fehler">🧪 Testlauf: ✗ ${t.fehler.length ? `${t.fehler.length} Fehler` : 'nicht gestartet'}${t.fehler.length ? `<ul>${t.fehler.slice(0, 4).map((f) => `<li>${m(f)}</li>`).join('')}</ul>` : ''}Klick auf „🔧 Luzzy soll die Fehler beheben“ – sie bekommt die Fehler gleich mit.</div>`
  }

  async function laden() {
    // Felix tippt gerade eine Änderung: nicht neu zeichnen, sonst wäre der Text weg
    if (ctx.element.querySelector('.ws-aendern:not([hidden])')) return
    const [entwuerfe, alleInstallierten, bremse] = await Promise.all([ctx.aufrufen('entwuerfe'), ctx.aufrufen('installierte'), ctx.aufrufen('notbremse')])
    const installierte = alleInstallierten.filter((p) => !p.eigen) // die Werkstatt selbst nicht auflisten
    for (const e of entwuerfe) if (e.fertig && (!berichte.has(e.id) || berichte.get(e.id).stand !== e.geaendert)) berichte.set(e.id, { ...(await ctx.aufrufen('pruefen', e.id)), stand: e.geaendert })
    const tests = new Map()
    for (const e of entwuerfe) if (e.fertig) tests.set(e.id, await ctx.aufrufen('testErgebnis', e.id))
    const bremsHinweis = bremse.aus.length
      ? `<div class="ws-bremse">⚠ Die Notbremse hat ${bremse.aus.length === 1 ? 'ein Plugin' : `${bremse.aus.length} Plugins`} abgeschaltet, weil Jarves-OS damit nicht richtig gestartet ist: ${bremse.aus.map((id) => `<span class="ws-bremse-plugin"><b>${m(id)}</b> <button class="knopf-flach" data-einschalten="${m(id)}" type="button">Wieder einschalten</button></span>`).join(' ')}<div class="leise klein">Besser erst „Ändern lassen“ und Luzzy den Fehler beheben lassen. Nach dem Einschalten Jarves-OS neu starten.</div></div>`
      : ''
    $('[data-entwuerfe]').innerHTML = bremsHinweis + (zuletztEingebaut ? `<div class="ws-eingebaut">✓ „${m(zuletztEingebaut)}“ ist eingebaut. Damit es erscheint, Jarves-OS einmal neu starten. <button class="knopf-gold" data-neustart type="button">Jetzt neu starten</button></div>` : '') + (entwuerfe.length
      ? entwuerfe.map((e) => {
        if (!e.fertig) return `<article class="ws-karte ws-baut"><div class="ws-kopf"><b>${m(e.name)}</b><span class="ws-marke">⏳ Luzzy baut noch …</span></div><div class="leise klein">${e.dateien.length ? `Bisher: ${m(e.dateien.join(', '))}` : 'Noch keine Dateien.'}</div><div class="ws-knoepfe"><button class="knopf-flach gefahr" data-verwerfen="${m(e.id)}" type="button">Verwerfen</button></div></article>`
        const b = berichte.get(e.id)
        const [titel, erklaerung] = STUFE[b.stufe]
        const t = tests.get(e.id)
        const hatFehler = b.stufe === 'fehler' || (t && !t.ok && !t.veraltet && !(t.laeuft && !t.gestartet && !t.fehler.length))
        return `<article class="ws-karte ws-stufe-${b.stufe}">
          <div class="ws-kopf"><b>${m(b.name)}</b>${b.ersetzt ? '<span class="ws-marke">Änderung eines eingebauten Plugins</span>' : '<span class="ws-marke">Neu</span>'}<span class="ws-stufe">${titel}</span></div>
          ${b.beschreibung ? `<div class="ws-text">${m(b.beschreibung)}</div>` : ''}
          <div class="leise klein">${m(erklaerung)}</div>
          ${rechteHtml(b)}
          ${b.stufe === 'fehler' ? '' : testHtml(e, tests.get(e.id))}
          <div class="ws-knoepfe">
            ${hatFehler ? `<button class="knopf-gold ws-reparieren" data-reparieren="${m(e.id)}" type="button">🔧 Luzzy soll die Fehler beheben</button>` : ''}
            <button class="knopf-flach ws-test-knopf" data-testen="${m(e.id)}" type="button" ${b.stufe === 'fehler' ? 'disabled' : ''}>🧪 Testlauf starten</button>
            <button class="knopf-gold" data-einbauen="${m(e.id)}" type="button" ${b.stufe === 'fehler' || !tests.get(e.id)?.ok || tests.get(e.id)?.veraltet ? 'disabled title="Erst den Testlauf ohne Fehler bestehen"' : ''}>Ja, einbauen</button>
            <button class="knopf-flach" data-aendern-form="${m(e.id)}" type="button">Nochmal ändern …</button>
            <button class="knopf-flach" data-code="${m(e.id)}" type="button">${offenerCode === e.id ? 'Code zuklappen' : 'Code ansehen'}</button>
            <button class="knopf-flach gefahr" data-verwerfen="${m(e.id)}" type="button">Verwerfen</button>
          </div>
          <form class="ws-aendern" data-aendern="${m(e.id)}" hidden><input maxlength="800" placeholder="Was soll Luzzy ändern?" /><button class="knopf-gold" type="submit">Senden</button></form>
          <div class="ws-code" data-code-ziel="${m(e.id)}"></div>
        </article>`
      }).join('')
      : '<div class="leise">Gerade nichts in Arbeit. Bestell oben ein neues Plugin oder lass unten ein vorhandenes ändern.</div>')
    $('[data-anzahl]').textContent = `(${installierte.length})`
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
      if (k.dataset.reparieren) return reparieren(k.dataset.reparieren)
      if (k.dataset.testen) {
        await ctx.aufrufen('testStarten', k.dataset.testen)
        return laden()
      }
      if (k.dataset.einschalten) {
        await ctx.aufrufen('wiederEinschalten', k.dataset.einschalten)
        zuletztEingebaut = k.dataset.einschalten
        return laden()
      }
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

  // Notbremse hat gerade etwas abgeschaltet: melden
  const bremse = await ctx.aufrufen('notbremse')
  if (bremse.jetzt.length) ctx.melden({ art: 'hinweis', titel: 'Plugin abgeschaltet', text: `Felix, ich habe beim Start ${bremse.jetzt.length === 1 ? 'ein neues Plugin' : 'neue Plugins'} abgeschaltet, weil Jarves-OS damit beim letzten Mal nicht richtig gestartet ist. Schau in die Werkstatt.`, anzeige: `${bremse.jetzt.join(', ')} – Details in der Werkstatt` })

  await laden()
  return { laden, takt: 3000 }
}
