// Gastgeber für Jarves-OS-Plugins in der Oberfläche.
// Jedes Plugin bekommt einen eigenen Bereich (links in der Leiste), optional eine Karte rechts
// und ein ctx-Objekt mit Werkzeugen. Siehe plugins/README.md.

import { markdownZuHtml } from './markdown.js'

const api = window.jarves
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const kontextAnbieter = [] // { id, fn } liefern Text für Luzzy (z. B. Termine)
const stichwoerter = [] // { id, muster } bei diesen Wörtern bekommt Luzzy den Kontext des Plugins mit
const begruessungen = [] // { id, fn } kurzer Satz für Luzzys Begrüßung beim Start
const eingabeFilter = [] // { id, fn } dürfen eine Eingabe abfangen (z. B. Auslösewort einer Routine)
const befehle = [] // { id, fn } beantworten eine Eingabe selbst (z. B. „Merk dir: …“), ohne Hermes
const knoepfe = new Map() // id → [{ name, titel, fn }] Knöpfe über der Eingabe
let knopfLeiste = null

export async function pluginsStarten({ mitte, rechts, vorKarte, schnellbefehle, melden, vorlesen, luzzy, ansichtZeigen, bereit }) {
  knopfLeiste = schnellbefehle || null
  knopfLeiste?.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-plugin-knopf]')
    if (!knopf) return
    const [pid, index] = knopf.dataset.pluginKnopf.split(':')
    knoepfe.get(pid)?.[Number(index)]?.fn()
  })
  let manifeste = []
  try {
    manifeste = await api.plugins.liste()
  } catch (e) {
    console.warn('Plugins:', e.message)
    return []
  }
  const bereiche = []
  for (const m of manifeste) {
    if (!m.ansicht) continue
    if (m.stil) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `../../plugins/${m.id}/stil.css`
      document.head.appendChild(link)
    }
    // Eigener Bereich in der Mitte
    const bereichId = `plugin-${m.id}`
    const abschnitt = document.createElement('section')
    abschnitt.className = 'ansicht ansicht-seite plugin-ansicht'
    abschnitt.dataset.ansicht = bereichId
    abschnitt.hidden = true
    abschnitt.innerHTML = `
      <header class="seiten-kopf">
        <div><h2>${maskieren(m.bereich?.name || m.name)}</h2><p class="leise">${maskieren(m.beschreibung)}</p></div>
        <div class="seiten-knoepfe plugin-knoepfe"></div>
      </header>
      <div class="plugin-inhalt"></div>`
    mitte.appendChild(abschnitt)

    if (m.luzzy?.stichwoerter) {
      try {
        stichwoerter.push({ id: m.id, muster: new RegExp(m.luzzy.stichwoerter, 'i') })
      } catch {
        console.warn(`Plugin ${m.id}: Stichwörter ungültig`)
      }
    }

    const ctx = {
      id: m.id,
      name: m.name,
      element: abschnitt.querySelector('.plugin-inhalt'),
      kopfKnoepfe: abschnitt.querySelector('.plugin-knoepfe'),
      daten: {
        laden: () => api.plugins.datenLaden(m.id),
        speichern: (d) => api.plugins.datenSpeichern(m.id, d)
      },
      aufrufen: (name, ...argumente) => api.plugins.aufrufen(m.id, name, ...argumente),
      // Karte in der rechten Spalte (z. B. "Heute")
      karte(titel) {
        const karte = document.createElement('section')
        karte.className = 'karte hud plugin-karte'
        karte.dataset.plugin = m.id
        karte.dataset.karte = `plugin-${m.id}` // für Einstellungen → Rechte Spalte
        karte.dataset.name = titel
        karte.innerHTML = `<h3>${maskieren(titel)}</h3><div class="plugin-karte-inhalt"></div>`
        rechts.insertBefore(karte, vorKarte)
        return karte.querySelector('.plugin-karte-inhalt')
      },
      melden: (meldung) => melden({ zeit: Date.now(), art: m.id, ...meldung }),
      vorlesen,
      luzzy,
      oeffnen: () => ansichtZeigen(bereichId),
      // Text, den Luzzy bei "Was steht an?" mitbekommt
      kontext: (fn) => kontextAnbieter.push({ id: m.id, fn }),
      // Kontext eines bestimmten Plugins holen (z. B. 'kalender' → Termine)
      kontextVon,
      // Kurzer Satz für Luzzys Begrüßung beim Start (z. B. "Heute hast du zwei Termine.")
      begruessung: (fn) => begruessungen.push({ id: m.id, fn }),
      // Kontext aller Plugins, deren Stichwörter im Text vorkommen (z. B. "Wetter" → Wetterdaten)
      kontextFuer,
      // Eingaben abfangen: fn(text) → { text, anzeige?, vorlesen? } oder null
      eingabeFilter: (fn) => eingabeFilter.push({ id: m.id, fn }),
      // Befehle, die das Plugin selbst beantwortet: fn(text) → Antwort (Text, Luzzy sagt ihn) oder null.
      // Gehen sofort, auch ohne Hermes und während Luzzy noch antwortet.
      befehl: (fn) => befehle.push({ id: m.id, fn }),
      // Knöpfe über der Eingabe setzen (ersetzt die bisherigen Knöpfe dieses Plugins)
      knoepfe: (liste) => {
        knoepfe.set(m.id, Array.isArray(liste) ? liste : [])
        knoepfeZeigen()
      },
      // Ist Luzzy frei (verbunden, antwortet gerade nicht)?
      bereit: () => (bereit ? bereit() : true),
      maskieren,
      markdownZuHtml
    }

    let rueckgabe = {}
    try {
      const modul = await import(`../../plugins/${m.id}/ansicht.js`)
      rueckgabe = (await modul.starten(ctx)) || {}
    } catch (e) {
      ctx.element.innerHTML = `<div class="leer-hinweis fehler">Plugin „${maskieren(m.name)}“ konnte nicht starten: ${maskieren(e.message)}</div>`
      console.warn(`Plugin ${m.id}:`, e)
    }
    bereiche.push({ id: bereichId, name: m.bereich?.name || m.name, laden: rueckgabe.laden, takt: rueckgabe.takt })
  }
  return bereiche
}

// Sätze aller Plugins für die Begrüßung beim Start
export async function pluginBegruessung() {
  const saetze = []
  for (const { fn } of begruessungen) {
    try {
      const satz = await fn()
      if (satz) saetze.push(String(satz))
    } catch {
      // Plugin liefert gerade nichts
    }
  }
  return saetze
}

// Kontext eines bestimmten Plugins holen (z. B. 'kalender' → Termine)
export async function kontextVon(id) {
  const teile = []
  for (const k of kontextAnbieter.filter((a) => a.id === id)) {
    try {
      teile.push(await k.fn())
    } catch {
      // Plugin liefert gerade nichts
    }
  }
  return teile.filter(Boolean).join('\n')
}

// Kontext aller Plugins, deren Stichwörter im Text vorkommen
export async function kontextFuer(text) {
  const teile = []
  for (const { id, muster } of stichwoerter) {
    if (muster.test(text)) teile.push(await kontextVon(id))
  }
  return teile.filter(Boolean).join('\n\n')
}

// Alles, was Plugins für Luzzy bereitstellen, als ein Text
export async function pluginKontext() {
  const teile = []
  for (const { fn } of kontextAnbieter) {
    try {
      const text = await fn()
      if (text) teile.push(String(text))
    } catch {
      // Plugin liefert gerade nichts
    }
  }
  return teile.join('\n\n')
}

// Befehle der Plugins, die sie selbst beantworten (erster Treffer gewinnt) → Antwort oder null
export async function pluginBefehl(text) {
  for (const { id, fn } of befehle) {
    try {
      const antwort = await fn(text)
      if (antwort) return String(antwort)
    } catch (e) {
      console.warn(`Befehl ${id}:`, e.message)
    }
  }
  return null
}

// Eingabe durch die Plugins schicken (erster Treffer gewinnt)
export async function pluginEingabe(text) {
  for (const { fn } of eingabeFilter) {
    try {
      const treffer = await fn(text)
      if (treffer?.text) return treffer
    } catch (e) {
      console.warn('Eingabe-Filter:', e.message)
    }
  }
  return null
}

function knoepfeZeigen() {
  if (!knopfLeiste) return
  const alle = [...knoepfe.entries()].flatMap(([pid, liste]) => liste.map((k, i) => ({ ...k, schluessel: `${pid}:${i}` })))
  knopfLeiste.innerHTML = alle
    .map((k) => `<button class="schnell" data-plugin-knopf="${k.schluessel}" type="button" title="${maskieren(k.titel || '')}">${maskieren(k.name)}</button>`)
    .join('')
  knopfLeiste.hidden = !alle.length
}
