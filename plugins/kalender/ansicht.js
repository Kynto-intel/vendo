// Kalender-Plugin für Jarves-OS.
// Termine liegen in daten/plugins/kalender.json: { termine: [{ id, titel, datum, zeit, dauer, notiz, erinnerung }] }
//   datum "JJJJ-MM-TT", zeit "HH:MM" oder "" (ganztägig), dauer in Minuten, erinnerung Minuten vorher (0 = keine)
// Verbunden mit dem Aufgaben-Plugin (window.__jarvesAufgaben, falls eingeschaltet): offene Aufgaben mit Datum stehen
// als „☐ …“ an ihrem Tag. Ziehen legt eine Aufgabe auf einen anderen Tag, Klick öffnet sie im Bereich Aufgaben.
// In der Tagesliste: Aufgaben des Tages (abhaken, vom Tag nehmen) und Aufgaben ohne Tag (＋ legt sie auf den Tag).

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const zwei = (n) => String(n).padStart(2, '0')
const tagText = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
const heute = () => tagText(new Date())
const neueId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function beginn(t) {
  const [j, m, d] = t.datum.split('-').map(Number)
  const [h, min] = (t.zeit || '00:00').split(':').map(Number)
  return new Date(j, m - 1, d, h, min)
}
const sortiert = (liste) => [...liste].sort((a, b) => beginn(a) - beginn(b) || (a.zeit ? 1 : -1))
function datumLang(text) {
  const [j, m, d] = text.split('-').map(Number)
  return new Date(j, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}
function wannText(t) {
  const tag = t.datum === heute() ? 'Heute' : t.datum === tagText(new Date(Date.now() + 86400000)) ? 'Morgen' : datumLang(t.datum)
  return `${tag}${t.zeit ? `, ${t.zeit} Uhr` : ', ganztägig'}`
}

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { termine: [] }
  let monat = new Date()
  monat.setDate(1)
  let bearbeitet = null // Termin-ID im Formular, null = neu
  let tagGewaehlt = null // Tag, dessen Termine unten stehen (null = heute)
  let suche = '' // Suche nach Namen, leer = Termine des Tages
  const listenTag = () => tagGewaehlt || heute()
  let eingeklappt = false // Monatsblatt eingeklappt (merkt sich Jarves-OS pro PC)
  try {
    eingeklappt = localStorage.getItem('kalender-eingeklappt') === '1'
  } catch {
    // ohne Speicher: ausgeklappt
  }
  const erinnert = new Set() // in dieser Sitzung schon erinnert (zusätzlich zu daten.erinnert)
  // Aufgaben-Plugin (falls eingeschaltet): offene Aufgaben für die Tage und die Tagesliste
  const aufgabenApi = () => window.__jarvesAufgaben
  const offeneAufgaben = () => (aufgabenApi()?.alle?.() || []).filter((a) => !a.erledigt)
  let gezogen = '' // ID der Aufgabe, die gerade auf einen anderen Tag gezogen wird

  async function laden() {
    const d = await ctx.daten.laden()
    daten = { termine: Array.isArray(d.termine) ? d.termine : [], erinnert: d.erinnert || {} }
    zeichnen()
  }
  // Ändern immer auf dem neuesten Stand der Datei: Luzzy kann inzwischen Termine eingetragen haben,
  // die dürfen beim Speichern nicht verloren gehen.
  async function aendern(fn) {
    const d = await ctx.daten.laden().catch(() => null)
    const frisch = Array.isArray(d?.termine) ? { ...d, termine: d.termine, erinnert: d.erinnert || {} } : daten // Datei gerade nicht lesbar: nicht leer überschreiben
    fn(frisch)
    daten = frisch
    await ctx.daten.speichern(daten)
    zeichnen()
  }

  // ── Aufbau ──
  ctx.kopfKnoepfe.innerHTML = `
    <button class="knopf-gold" data-k="neu" type="button">+ Termin</button>
    <button class="knopf-flach" data-k="zurueck" type="button">‹</button>
    <span class="kal-monat" data-monat></span>
    <button class="knopf-flach" data-k="vor" type="button">›</button>
    <button class="knopf-flach" data-k="heute" type="button">Heute</button>
    <button class="knopf-flach" data-k="einklappen" type="button" data-einklappen></button>`
  ctx.element.innerHTML = `
    <div class="kal-raster">
      <div class="kal-monatsblatt hud">
        <div class="kal-wochentage">${WOCHENTAGE.map((w) => `<div>${w}</div>`).join('')}</div>
        <div class="kal-tage" data-tage></div>
      </div>
      <aside class="kal-seite">
        <form class="kal-form hud" data-form hidden>
          <div class="kal-form-kopf"><h3 data-form-titel>Neuer Termin</h3><button class="kal-zu" data-k="abbrechen" type="button" title="Schließen (Esc)">✕</button></div>
          <label>Was <input name="titel" required maxlength="120" placeholder="z. B. Zahnarzt" /></label>
          <label>Datum <input name="datum" type="date" required /></label>
          <div class="kal-zeile">
            <label>Uhrzeit <input name="zeit" type="time" /></label>
            <label>Dauer <select name="dauer"><option value="30">30 Min.</option><option value="60" selected>1 Std.</option><option value="90">1,5 Std.</option><option value="120">2 Std.</option><option value="240">4 Std.</option></select></label>
          </div>
          <label>Erinnern <select name="erinnerung"><option value="0">nicht</option><option value="5">5 Min. vorher</option><option value="15" selected>15 Min. vorher</option><option value="30">30 Min. vorher</option><option value="60">1 Std. vorher</option><option value="1440">1 Tag vorher</option></select></label>
          <label>Notiz <textarea name="notiz" rows="2" maxlength="1000"></textarea></label>
          <div class="kal-knoepfe">
            <button class="knopf-gold" type="submit">Speichern</button>
            <button class="knopf-flach" data-k="abbrechen" type="button">Abbrechen</button>
            <button class="knopf-flach gefahr" data-k="loeschen" type="button" hidden>Löschen</button>
          </div>
          <div class="leise klein">Ohne Uhrzeit ist der Termin ganztägig.</div>
        </form>
        <section class="hud kal-kommend">
          <h3 data-liste-titel>Termine heute</h3>
          <div class="kal-suche">
            <input type="date" data-suche-datum title="Tag wählen: zeigt die Termine dieses Tages" />
            <input type="search" data-suche-text placeholder="Termin suchen …" maxlength="60" />
          </div>
          <div data-kommend></div>
        </section>
      </aside>
    </div>`

  const $ = (sel) => ctx.element.querySelector(sel)
  const form = $('[data-form]')
  const heuteKarte = ctx.karte('Heute')

  function formFuellen(t, datum) {
    bearbeitet = t?.id || null
    form.titel.value = t?.titel || ''
    form.datum.value = t?.datum || datum || heute()
    form.zeit.value = t?.zeit || ''
    form.dauer.value = String(t?.dauer || 60)
    form.erinnerung.value = String(t?.erinnerung ?? 15)
    form.notiz.value = t?.notiz || ''
    $('[data-form-titel]').textContent = t ? 'Termin bearbeiten' : 'Neuer Termin'
    form.querySelector('[data-k="loeschen"]').hidden = !t
    form.hidden = false
  }

  function formVerbergen() {
    bearbeitet = null
    form.hidden = true
  }

  function zeichnen() {
    // Monatsblatt
    ctx.kopfKnoepfe.querySelector('[data-monat]').textContent = monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    const erster = new Date(monat)
    const versatz = (erster.getDay() + 6) % 7 // Montag = 0
    const start = new Date(erster)
    start.setDate(1 - versatz)
    const nachTag = {}
    for (const t of sortiert(daten.termine)) (nachTag[t.datum] ??= []).push(t)
    const offene = offeneAufgaben()
    const aufgabenNachTag = {}
    for (const a of offene) if (a.datum) (aufgabenNachTag[a.datum] ??= []).push(a)
    const zellen = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const text = tagText(d)
      const termine = nachTag[text] || []
      const aufgaben = aufgabenNachTag[text] || []
      // höchstens vier Zeilen je Tag (mit „+ weitere“): Termine zuerst, dann Aufgaben
      const termineDa = termine.slice(0, aufgaben.length ? 2 : 3)
      let aufgabenDa = aufgaben.slice(0, 4 - termineDa.length)
      let rest = termine.length + aufgaben.length - termineDa.length - aufgabenDa.length
      if (rest > 0 && termineDa.length + aufgabenDa.length === 4) {
        aufgabenDa = aufgabenDa.slice(0, -1)
        rest++
      }
      zellen.push(`
        <div class="kal-tag${d.getMonth() !== monat.getMonth() ? ' fremd' : ''}${text === heute() ? ' heute' : ''}${tagGewaehlt === text ? ' gewaehlt' : ''}" data-tag="${text}">
          <div class="kal-nummer">${d.getDate()}</div>
          ${termineDa.map((t) => `<button class="kal-termin" data-termin="${m(t.id)}" type="button" title="${m(t.titel)}">${t.zeit ? `<b>${m(t.zeit)}</b> ` : ''}${m(t.titel)}</button>`).join('')}
          ${aufgabenDa.map((a) => `<button class="kal-aufgabe" data-aufgabe="${m(a.id)}" draggable="true" type="button" title="Aufgabe: ${m(a.text)} · ziehen: auf einen anderen Tag legen · klicken: öffnen">☐ ${m(a.text)}</button>`).join('')}
          ${rest > 0 ? `<div class="kal-mehr">+${rest} weitere</div>` : ''}
        </div>`)
    }
    $('[data-tage]').innerHTML = zellen.join('')

    // Einklappen
    ctx.element.querySelector('.kal-raster').classList.toggle('eingeklappt', eingeklappt)
    const klappKnopf = ctx.kopfKnoepfe.querySelector('[data-einklappen]')
    klappKnopf.textContent = eingeklappt ? '▾ Monat zeigen' : '▴ Monat einklappen'
    klappKnopf.title = eingeklappt ? 'Monatsblatt wieder zeigen' : 'Monatsblatt einklappen, nur die Liste zeigen'

    // Liste unten: Termine des gewählten Tages (heute: nur, was noch ansteht) oder Suchergebnis
    const jetzt = new Date()
    const vorbei = (t) => (t.zeit ? beginn(t).getTime() + (t.dauer || 60) * 60000 < jetzt.getTime() : t.datum < heute())
    const kommend = sortiert(daten.termine).filter((t) => !vorbei(t))
    const eintrag = (t, mitTag) => `<button class="kal-eintrag" data-termin="${m(t.id)}" type="button"><span>${m(t.titel)}</span><small>${m(mitTag ? wannText(t) : t.zeit ? `${t.zeit} Uhr${t.dauer ? ` · ${t.dauer >= 60 ? `${String(t.dauer / 60).replace('.', ',')} Std.` : `${t.dauer} Min.`}` : ''}` : 'ganztägig')}${t.notiz ? ` · ${m(t.notiz)}` : ''}</small></button>`
    const titel = $('[data-liste-titel]')
    const datumFeld = $('[data-suche-datum]')
    if (document.activeElement !== datumFeld) datumFeld.value = listenTag()
    let html
    if (suche) {
      const wort = suche.toLowerCase()
      const treffer = sortiert(daten.termine).filter((t) => t.titel.toLowerCase().includes(wort) || (t.notiz || '').toLowerCase().includes(wort))
      titel.textContent = `Suche: „${suche}“ (${treffer.length})`
      html = treffer.length ? treffer.map((t) => eintrag(t, true)).join('') : '<div class="leise">Kein Termin gefunden.</div>'
    } else {
      const tag = listenTag()
      const morgen = tagText(new Date(Date.now() + 86400000))
      titel.textContent = tag === heute() ? 'Termine heute' : tag === morgen ? 'Termine morgen' : `Termine am ${datumLang(tag)}`
      const amTag = sortiert(daten.termine).filter((t) => t.datum === tag)
      const liste = tag === heute() ? amTag.filter((t) => !vorbei(t)) : amTag
      const schonVorbei = amTag.length - liste.length
      html = liste.length ? liste.map((t) => eintrag(t, false)).join('') : `<div class="leise">${schonVorbei ? 'Für heute steht nichts mehr an.' : 'Keine Termine.'}</div>`
      if (schonVorbei) html += `<div class="leise klein">${schonVorbei === 1 ? 'Ein Termin' : `${schonVorbei} Termine`} heute schon vorbei.</div>`
      const danach = kommend.find((t) => t.datum > tag)
      if (tag === heute() && !liste.length && danach) html += `<div class="kal-danach leise klein">Als Nächstes:</div>${eintrag(danach, true)}`
      // Aufgaben dieses Tages und Aufgaben, die noch keinen Tag haben (＋ legt sie auf diesen Tag)
      const aufgabeZeile = (a, mitTag) => `<div class="kal-aufgabe-zeile" data-aufgabe="${m(a.id)}" draggable="true" title="Ziehen: auf einen Tag im Monatsblatt legen">
          <button class="kal-haken" data-ak="erledigt" type="button" title="Erledigt"></button>
          <span class="kal-aufgabe-text" data-ak="oeffnen" role="button" tabindex="0" title="Klicken: im Bereich Aufgaben öffnen (Details)">${m(a.text)}${a.zeit ? ` <small>${m(a.zeit)} Uhr</small>` : ''}</span>
          ${mitTag ? '<button class="knopf-mini" data-ak="ohne" type="button" title="Von diesem Tag nehmen (ohne Datum)">✕</button>' : `<button class="knopf-mini" data-ak="hierher" type="button" title="Auf ${m(datumLang(tag))} legen">＋</button>`}
        </div>`
      const amTagAufgaben = offene.filter((a) => a.datum === tag)
      const ohneTag = offene.filter((a) => !a.datum)
      if (amTagAufgaben.length) html += `<div class="kal-danach leise klein">Aufgaben an diesem Tag:</div>${amTagAufgaben.map((a) => aufgabeZeile(a, true)).join('')}`
      if (ohneTag.length) html += `<div class="kal-danach leise klein">Aufgaben ohne Tag (＋ legt sie auf diesen Tag, oder auf einen Tag ziehen):</div>${ohneTag.map((a) => aufgabeZeile(a, false)).join('')}`
    }
    $('[data-kommend]').innerHTML = html

    // Karte rechts: heute
    const heutige = sortiert(daten.termine).filter((t) => t.datum === heute())
    const naechster = kommend.find((t) => t.datum !== heute())
    heuteKarte.innerHTML = `${
      heutige.length
        ? heutige.map((t) => `<div class="kal-heute-zeile"><b>${t.zeit ? m(t.zeit) : 'ganztägig'}</b><span>${m(t.titel)}</span></div>`).join('')
        : '<div class="leise">Heute keine Termine.</div>'
    }${naechster ? `<div class="leise klein kal-naechster">Als Nächstes: ${m(naechster.titel)} · ${m(wannText(naechster))}</div>` : ''}`
  }

  // ── Bedienung ──
  ctx.kopfKnoepfe.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k
    if (k === 'neu') {
      formFuellen(null, tagGewaehlt || heute())
      form.titel.focus()
      return
    }
    if (k === 'zurueck') monat.setMonth(monat.getMonth() - 1)
    if (k === 'vor') monat.setMonth(monat.getMonth() + 1)
    if (k === 'heute') {
      monat = new Date()
      monat.setDate(1)
      tagGewaehlt = null
      suche = ''
      $('[data-suche-text]').value = ''
    }
    if (k === 'einklappen') {
      eingeklappt = !eingeklappt
      try {
        localStorage.setItem('kalender-eingeklappt', eingeklappt ? '1' : '0')
      } catch {
        // nicht merkbar: gilt bis zum Neustart
      }
    }
    if (k) zeichnen()
  })
  ctx.element.addEventListener('click', async (e) => {
    // Aufgaben: in der Tagesliste abhaken, öffnen, auf den Tag legen, vom Tag nehmen; im Monatsblatt öffnen
    const aufgabe = e.target.closest('[data-aufgabe]')
    if (aufgabe) {
      const api = aufgabenApi()
      const id = aufgabe.dataset.aufgabe
      const art = e.target.closest('[data-ak]')?.dataset.ak || (aufgabe.classList.contains('kal-aufgabe') ? 'oeffnen' : '')
      if (!api || !art) return
      if (art === 'erledigt') await api.erledigen(id, true)
      if (art === 'hierher') await api.datumSetzen(id, listenTag())
      if (art === 'ohne') await api.datumSetzen(id, '')
      if (art === 'oeffnen') api.zeigen(id)
      return
    }
    const termin = e.target.closest('[data-termin]')
    if (termin) {
      formFuellen(daten.termine.find((t) => t.id === termin.dataset.termin))
      return
    }
    const tag = e.target.closest('[data-tag]')
    if (tag) {
      tagGewaehlt = tag.dataset.tag === heute() ? null : tag.dataset.tag
      suche = ''
      $('[data-suche-text]').value = ''
      zeichnen()
      if (tag.dataset.tag === heute()) $(`[data-tag="${tag.dataset.tag}"]`)?.classList.add('gewaehlt')
      return
    }
    const k = e.target.closest('[data-k]')?.dataset.k
    if (k === 'abbrechen') formVerbergen()
    if (k === 'loeschen' && bearbeitet) {
      const t = daten.termine.find((x) => x.id === bearbeitet)
      if (t && (await ctx.bestaetigen(`Termin „${t.titel}“ löschen?`, { titel: 'Termin löschen', ja: 'Löschen', gefahr: true }))) {
        const weg = bearbeitet
        formVerbergen()
        await aendern((d) => {
          d.termine = d.termine.filter((x) => x.id !== weg)
          delete d.erinnert[weg]
        })
      }
    }
  })
  // Aufgabe auf einen anderen Tag ziehen (aus dem Monatsblatt oder aus der Tagesliste)
  const zielWeg = () => ctx.element.querySelectorAll('.kal-tag.ziel').forEach((el) => el.classList.remove('ziel'))
  ctx.element.addEventListener('dragstart', (e) => {
    const el = e.target.closest?.('[data-aufgabe]')
    if (!el) return
    gezogen = el.dataset.aufgabe
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', el.textContent.trim())
  })
  ctx.element.addEventListener('dragover', (e) => {
    const tag = gezogen && e.target.closest('[data-tag]')
    if (!tag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!tag.classList.contains('ziel')) {
      zielWeg()
      tag.classList.add('ziel')
    }
  })
  ctx.element.addEventListener('drop', async (e) => {
    const tag = gezogen && e.target.closest('[data-tag]')
    if (!tag) return
    e.preventDefault()
    const id = gezogen
    gezogen = ''
    zielWeg()
    await aufgabenApi()?.datumSetzen(id, tag.dataset.tag)
  })
  ctx.element.addEventListener('dragend', () => {
    gezogen = ''
    zielWeg()
  })
  $('[data-suche-datum]').addEventListener('change', (e) => {
    const wert = e.target.value
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return
    tagGewaehlt = wert === heute() ? null : wert
    suche = ''
    $('[data-suche-text]').value = ''
    const [j, mo] = wert.split('-').map(Number)
    monat = new Date(j, mo - 1, 1)
    formVerbergen()
    zeichnen()
  })
  $('[data-suche-text]').addEventListener('input', (e) => {
    suche = e.target.value.trim()
    zeichnen()
  })
  heuteKarte.addEventListener('click', () => ctx.oeffnen())
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !form.hidden && ctx.element.offsetParent !== null) formVerbergen()
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const eintrag = {
      id: bearbeitet || neueId(),
      titel: form.titel.value.trim(),
      datum: form.datum.value,
      zeit: form.zeit.value,
      dauer: Number(form.dauer.value),
      erinnerung: Number(form.erinnerung.value),
      notiz: form.notiz.value.trim()
    }
    if (!eintrag.titel || !eintrag.datum) return
    const [j, mo] = eintrag.datum.split('-').map(Number)
    monat = new Date(j, mo - 1, 1)
    formVerbergen()
    await aendern((d) => {
      d.termine = [...d.termine.filter((t) => t.id !== eintrag.id), eintrag]
      delete d.erinnert[eintrag.id] // geänderter Termin: neu erinnern
    })
  })

  // ── Erinnerungen: Luzzy meldet sich vor dem Termin ──
  setInterval(async () => {
    const jetzt = Date.now()
    const neu = {}
    for (const t of daten.termine) {
      if (!t.erinnerung) continue
      const b = t.zeit ? beginn(t).getTime() : beginn(t).getTime() + 8 * 3600000 // ganztägig: um 8 Uhr
      const faellig = b - t.erinnerung * 60000
      const schluessel = `${t.id}:${t.datum}:${t.zeit}`
      if (jetzt >= faellig && jetzt < b + 5 * 60000 && !erinnert.has(schluessel) && daten.erinnert[t.id] !== schluessel) {
        erinnert.add(schluessel)
        daten.erinnert[t.id] = schluessel
        neu[t.id] = schluessel
        const minuten = Math.max(0, Math.round((b - jetzt) / 60000))
        const wann = !t.zeit ? 'heute' : minuten <= 1 ? 'jetzt' : minuten < 90 ? `in ${minuten} Minuten` : `um ${t.zeit} Uhr`
        ctx.melden({ art: 'termin', titel: `Termin: ${t.titel}`, text: `Felix, ${wann}: ${t.titel}.`, anzeige: wannText(t) })
      }
    }
    if (Object.keys(neu).length) await aendern((d) => Object.assign(d.erinnert, neu))
  }, 30000)

  // ── Für Luzzy: Termine der nächsten 7 Tage ──
  ctx.kontext(() => {
    const grenze = new Date(Date.now() + 7 * 86400000)
    const liste = sortiert(daten.termine).filter((t) => t.datum >= heute() && beginn(t) <= grenze)
    if (!liste.length) return 'Termine aus dem Jarves-Kalender (nächste 7 Tage): keine.'
    return `Termine aus dem Jarves-Kalender (nächste 7 Tage):\n${liste.map((t) => `- ${wannText(t)}: ${t.titel}${t.notiz ? ` (${t.notiz})` : ''}`).join('\n')}`
  })

  // Satz für Luzzys Begrüßung beim Start
  ctx.begruessung(() => {
    const heutige = sortiert(daten.termine).filter((t) => t.datum === heute())
    if (!heutige.length) return 'Heute stehen keine Termine an.'
    const naechster = heutige.find((t) => t.zeit && beginn(t) >= new Date()) || heutige[0]
    const wann = naechster.zeit ? `um ${naechster.zeit} Uhr` : 'ganztägig'
    if (heutige.length === 1) return `Heute hast du einen Termin, ${wann}: ${naechster.titel}.`
    return `Heute hast du ${heutige.length} Termine, der nächste ${wann}: ${naechster.titel}.`
  })

  // Luzzy (oder jemand anderes) hat die Datei geändert: neu einlesen
  ctx.daten.beiAenderung?.(() => laden())

  // Tagwechsel: Heute-Markierung und Karte aktualisieren
  setInterval(zeichnen, 5 * 60000)

  // Aufgaben-Plugin: neu zeichnen, sobald sich Aufgaben ändern (das Plugin startet evtl. erst nach dem Kalender)
  const aufgabenUhr = setInterval(() => {
    if (!aufgabenApi()?.beiAenderung) return
    clearInterval(aufgabenUhr)
    aufgabenApi().beiAenderung(() => !gezogen && zeichnen())
    zeichnen()
  }, 1000)
  // Für den Bereich Aufgaben („Im Kalender zeigen“): diesen Tag wählen und den Kalender öffnen
  window.__jarvesKalender = {
    zeigen(datum) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum))) return
      const [j, mo] = datum.split('-').map(Number)
      monat = new Date(j, mo - 1, 1)
      tagGewaehlt = datum === heute() ? null : datum
      suche = ''
      formVerbergen()
      ctx.oeffnen()
      zeichnen()
    }
  }

  await laden()
  return { laden, takt: 60000 }
}
