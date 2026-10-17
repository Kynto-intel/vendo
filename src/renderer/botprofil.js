// Profil-Fenster eines Bots (Klick auf das Bild im Crew-Chat): Bild, Name, Rolle, Modell, Beschreibung und die
// SOUL.md zum Lesen und Bearbeiten. Gespeichert wird nur per Klick auf „Speichern“ (oder Strg+S), vorher sichert
// der Hauptprozess die alte Fassung (src/main/botprofil.js). Hermes nimmt die neue SOUL ab dem nächsten neuen Chat.

import { markdownZuHtml } from './markdown.js'
import { bestaetigen } from './fenster.js'
import { botName } from './ansichten.js'

const api = window.vendo
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fehlerText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export async function botProfilOeffnen(profil) {
  if (!profil) return
  const profile = (await api.hermes.lesen('/api/profiles').catch(() => null))?.profiles || []
  const p = profile.find((x) => x.name === profil) || { name: profil }
  const { name, rolle } = botName(p)

  const d = document.createElement('dialog')
  d.className = 'vendo-fenster hud bot-profil'
  d.innerHTML = `
    <div class="bp-kopf">
      <div class="bp-bild" data-bild>${maskieren(name.charAt(0))}</div>
      <div class="bp-info">
        <h3>${maskieren(name)}</h3>
        ${rolle ? `<span class="abzeichen">${maskieren(rolle)}</span>` : ''}
        <dl class="bp-daten">
          <dt>Profil</dt><dd>${maskieren(p.name)}</dd>
          <dt>Modell</dt><dd>${maskieren(p.model || '–')}${p.provider ? ` <span class="leise">(${maskieren(p.provider)})</span>` : ''}</dd>
        </dl>
        ${p.description ? `<p class="bp-beschreibung">${maskieren(p.description)}</p>` : ''}
      </div>
      <button class="bp-zu knopf-flach" type="button" data-zu title="Schließen (Esc)">✕</button>
    </div>
    <div class="bp-soul-kopf">
      <h4>SOUL.md</h4>
      <span class="leise klein" data-stand></span>
      <div class="bp-knoepfe">
        <button class="knopf-flach" type="button" data-bearbeiten>Bearbeiten</button>
        <button class="knopf-flach" type="button" data-abbrechen hidden>Abbrechen</button>
        <button class="knopf-gold" type="button" data-speichern hidden>Speichern</button>
      </div>
    </div>
    <div class="bp-soul md" data-ansicht><div class="leise">Lade SOUL …</div></div>
    <textarea class="bp-editor" data-editor spellcheck="false" hidden></textarea>
    <div class="fehler bp-fehler" data-fehler hidden></div>
    <div class="leise klein bp-hinweis">Änderungen gelten ab dem nächsten neuen Chat mit ${maskieren(name)}. Vor jedem Speichern wird die alte Fassung gesichert (Vendo: daten\\datei-sicherungen\\soul).</div>`
  const $ = (sel) => d.querySelector(sel)
  document.body.appendChild(d)
  d.showModal()

  api.hermes.botBild(profil).then((b) => b?.bild && ($('[data-bild]').innerHTML = `<img src="${b.bild}" alt="" />`)).catch(() => {})

  let soul = ''
  let geaendert = 0
  let bearbeiten = false
  const fehler = (text) => {
    $('[data-fehler]').hidden = !text
    $('[data-fehler]').textContent = text || ''
  }
  const ungespeichert = () => bearbeiten && $('[data-editor]').value !== soul
  const standZeigen = () => {
    $('[data-stand]').textContent = geaendert ? `geändert ${new Date(geaendert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · ${soul.split('\n').length} Zeilen` : ''
  }
  const modus = (an) => {
    bearbeiten = an
    $('[data-ansicht]').hidden = an
    $('[data-editor]').hidden = !an
    $('[data-bearbeiten]').hidden = an
    $('[data-abbrechen]').hidden = !an
    $('[data-speichern]').hidden = !an
    if (an) {
      $('[data-editor]').value = soul
      $('[data-editor]').focus()
    } else {
      $('[data-ansicht]').innerHTML = soul.trim() ? markdownZuHtml(soul) : '<div class="leise">Dieser Bot hat noch keine SOUL.md. Über „Bearbeiten“ kannst du eine anlegen.</div>'
    }
  }

  try {
    const r = await api.hermes.soulLesen(profil)
    soul = r.soul
    geaendert = r.geaendert
    standZeigen()
    modus(false)
  } catch (e) {
    $('[data-ansicht]').innerHTML = ''
    $('[data-bearbeiten]').disabled = true
    fehler(`SOUL konnte nicht gelesen werden: ${fehlerText(e)}`)
  }

  async function speichern() {
    const text = $('[data-editor]').value
    if (text === soul) return modus(false)
    $('[data-speichern]').disabled = true
    fehler('')
    try {
      const r = await api.hermes.soulSpeichern(profil, text, geaendert)
      soul = text
      geaendert = r.geaendert
      standZeigen()
      modus(false)
      $('[data-stand]').textContent += ' · gespeichert ✓'
    } catch (e) {
      fehler(fehlerText(e))
    } finally {
      $('[data-speichern]').disabled = false
    }
  }

  async function schliessen() {
    if (ungespeichert() && !(await bestaetigen('Deine Änderungen an der SOUL sind noch nicht gespeichert. Trotzdem schließen?', { titel: 'Nicht gespeichert', ja: 'Verwerfen', nein: 'Weiter bearbeiten', gefahr: true }))) return
    d.close()
    d.remove()
  }

  d.addEventListener('click', async (e) => {
    if (e.target === d || e.target.closest('[data-zu]')) return schliessen()
    if (e.target.closest('[data-bearbeiten]')) return modus(true)
    if (e.target.closest('[data-speichern]')) return speichern()
    if (e.target.closest('[data-abbrechen]')) {
      if (ungespeichert() && !(await bestaetigen('Änderungen verwerfen?', { titel: 'Abbrechen', ja: 'Verwerfen', nein: 'Weiter bearbeiten', gefahr: true }))) return
      fehler('')
      modus(false)
    }
  })
  d.addEventListener('cancel', (e) => {
    e.preventDefault() // Esc: erst fragen, wenn etwas ungespeichert ist
    schliessen()
  })
  d.addEventListener('keydown', (e) => {
    if (bearbeiten && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      e.stopPropagation() // nicht zusätzlich das Speichern der Dateiansicht auslösen
      speichern()
    }
  })
}
