// Aufgaben-Plugin: To-do-Liste mit Fälligkeit, Erinnerung über Luzzy-Meldungen, Kontext für Luzzy.
// Daten in plugins/aufgaben/daten.json: { aufgaben: [{ id, text, datum, zeit, erledigt, erstellt, erledigtAm }] }
//   datum "JJJJ-MM-TT" oder "" (ohne Datum), zeit "HH:MM" oder "" (dann Erinnerung morgens um 9)
// Per Sprache oder Tippen (Jarves-OS antwortet selbst, ohne Hermes):
//   „Neue Aufgabe: Etiketten bestellen bis Freitag“ · „Aufgabe: Max anrufen morgen um 14 Uhr“
//   „Setz Stoffproben auf meine Liste“ · „Erledigt: Etiketten“ · „Hak Stoffproben ab“ · „Was steht auf meiner Liste?“

import { uhrzeitFinden, zahl, ZAHLEN } from '../../src/renderer/zeitsprache.js'

const zwei = (n) => String(n).padStart(2, '0')
const tagText = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
const heute = () => tagText(new Date())
const neueId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')
const WOCHENTAGE = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag']
const ERINNERUNG_OHNE_ZEIT = '09:00'
// Uhrzeit im Text: „um 14 Uhr“, „um 14:30“, „um drei“, „auf 15 Uhr“, „für 10:30“ (nicht „für Thor“)
const STUNDE = `(?:\\d{1,2}(?:[:.]\\d{2})?|${Object.keys(ZAHLEN).join('|')})`
const UHRZEIT_IM_TEXT = new RegExp(`\\s*(?:um\\s+(?:halb\\s+)?${STUNDE}(?:\\s+uhr)?|(?:auf|für)\\s+(?:halb\\s+)?${STUNDE}\\s+uhr|(?:auf|für)\\s+\\d{1,2}[:.]\\d{2})(?=\\s|$)`, 'i')

function plusTage(n, von = new Date()) {
  const d = new Date(von)
  d.setDate(d.getDate() + n)
  return d
}
function datumLesbar(datum) {
  if (!datum) return ''
  if (datum === heute()) return 'heute'
  if (datum === tagText(plusTage(1))) return 'morgen'
  if (datum === tagText(plusTage(-1))) return 'gestern'
  const [j, m, d] = datum.split('-').map(Number)
  const tag = new Date(j, m - 1, d)
  const abstand = Math.round((tag - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return abstand > 0 && abstand < 7 ? tag.toLocaleDateString('de-DE', { weekday: 'long' }) : tag.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })
}
const satz = (text) => `${text.replace(/\.+$/, '')}.` // „15.10.“ am Satzende nicht doppelt
const wannText = (a) => [datumLesbar(a.datum), a.zeit ? `${a.zeit} Uhr` : ''].filter(Boolean).join(', ')

// Datum im Satz finden: „bis Freitag“, „morgen“, „am 3.10.“, „in 3 Tagen“, „nächste Woche“, „Ende der Woche“
export function datumFinden(satz, jetzt = new Date()) {
  const s = ` ${satz} `
  const vor = '(?:bis |am |für |zum |spätestens |ab )?'
  const muster = [
    [new RegExp(` ${vor}(heute|morgen|übermorgen)(?: früh| abend| mittag| nachmittag)?(?= )`, 'i'), (t) => tagText(plusTage({ heute: 0, morgen: 1, übermorgen: 2 }[t[1].toLowerCase()], jetzt))],
    [new RegExp(` ${vor}(?:(nächsten|kommenden) )?(${WOCHENTAGE.join('|')})(?= )`, 'i'), (t) => {
      const ziel = WOCHENTAGE.indexOf(t[2].toLowerCase())
      const abstand = (ziel - jetzt.getDay() + 7) % 7 || 7 // „Freitag“ an einem Freitag = nächste Woche
      return tagText(plusTage(abstand, jetzt))
    }],
    [new RegExp(` ${vor}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?(?= )`, 'i'), (t) => {
      let jahr = t[3] ? Number(t[3].length === 2 ? `20${t[3]}` : t[3]) : jetzt.getFullYear()
      const d = new Date(jahr, Number(t[2]) - 1, Number(t[1]))
      if (!t[3] && d < new Date(jetzt).setHours(0, 0, 0, 0)) d.setFullYear(jahr + 1)
      return d.getMonth() === Number(t[2]) - 1 ? tagText(d) : null
    }],
    [/ in (\d+|[a-zäöüß]+) (tag|tagen|woche|wochen)(?= )/i, (t) => {
      const n = zahl(t[1].toLowerCase())
      return n ? tagText(plusTage(Math.round(n * (t[2].toLowerCase().startsWith('woche') ? 7 : 1)), jetzt)) : null
    }],
    [new RegExp(` ${vor}(?:ende (?:der|dieser) woche|zum wochenende)(?= )`, 'i'), () => tagText(plusTage((5 - jetzt.getDay() + 7) % 7, jetzt))],
    [new RegExp(` ${vor}nächste woche(?= )`, 'i'), () => tagText(plusTage(((1 - jetzt.getDay() + 7) % 7) || 7, jetzt))]
  ]
  for (const [re, fn] of muster) {
    const t = re.exec(s)
    if (!t) continue
    const datum = fn(t)
    if (!datum) continue
    return { datum, rest: (s.slice(0, t.index) + ' ' + s.slice(t.index + t[0].length)).replace(/\s+/g, ' ').trim() }
  }
  return null
}

// „Neue Aufgabe: …“, „Aufgabe: …“, „To-do: …“, „Setz … auf meine Liste“, „Füg … zu meinen Aufgaben hinzu“
const NEU = [
  /^(?:neue aufgabe|aufgabe|to-?do)(?:\s+(?:für mich|hinzufügen))?[:,]?\s+(.+)$/i,
  /^(?:setz|schreib|pack|nimm|füg)(?:e)?\s+(.+?)\s+(?:auf|zu|in)\s+(?:meine|die|meinen|den)\s+(?:to-?do-?liste|to-?dos|aufgaben(?:liste)?|liste)(?:\s+(?:hinzu|auf))?$/i
]
// „Erledigt: …“, „Abgehakt: …“, „Hak … ab“, „Streich …“, „… ist erledigt“
const ERLEDIGT = [/^(?:erledigt|abgehakt|fertig|geschafft)[:,]?\s+(.+)$/i, /^(?:hak|streich)(?:e)?\s+(.+?)\s+(?:ab|durch|von der liste)$/i, /^(.+?)\s+(?:ist|sind|hab ich|habe ich)\s+(?:erledigt|fertig|gemacht|abgehakt)$/i]
// „Was steht auf meiner Liste?“, „Welche Aufgaben habe ich?“, „Lies meine Aufgaben vor“
const LISTE = /^(?:was steht auf meiner (?:to-?do-?)?liste|welche aufgaben hab(?:e)? ich(?: noch)?|(?:lies|zeig|nenn)(?: mir)? meine (?:aufgaben|to-?dos)(?: vor)?|meine (?:aufgaben|to-?dos))$/i

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { aufgaben: [], erinnert: {} }
  let erledigteZeigen = false

  async function laden() {
    const d = await ctx.daten.laden()
    daten = { aufgaben: Array.isArray(d.aufgaben) ? d.aufgaben : [], erinnert: d.erinnert || {} }
    zeichnen()
  }
  async function speichern() {
    await ctx.daten.speichern(daten)
    zeichnen()
  }
  const offen = () => daten.aufgaben.filter((a) => !a.erledigt)
  const sortiert = (liste) => [...liste].sort((a, b) => (a.datum || '9999').localeCompare(b.datum || '9999') || (a.zeit || '99').localeCompare(b.zeit || '99') || a.erstellt - b.erstellt)

  // Aufgabe aus einem Satz anlegen (Datum und Uhrzeit werden herausgelesen)
  async function anlegen(satz) {
    let text = String(satz).trim()
    let datum = ''
    let zeit = ''
    const d = datumFinden(text)
    if (d) ({ datum, rest: text } = d)
    const u = uhrzeitFinden(` ${text.toLowerCase()} `)
    if (u) {
      // Uhrzeit aus dem Originaltext entfernen (gleiche Stelle wie im kleingeschriebenen)
      text = text.replace(UHRZEIT_IM_TEXT, '').trim()
      zeit = `${zwei(u.stunde)}:${zwei(u.minute)}`
      if (!datum) datum = new Date().getHours() * 60 + new Date().getMinutes() < u.stunde * 60 + u.minute ? heute() : tagText(plusTage(1))
    }
    text = text.replace(/[.!]+$/, '').replace(/^(?:dass\s+)?/i, '').trim()
    if (!text) return null
    const aufgabe = { id: neueId(), text: text.charAt(0).toUpperCase() + text.slice(1), datum, zeit, erledigt: false, erstellt: Date.now() }
    daten.aufgaben.push(aufgabe)
    await speichern()
    return aufgabe
  }

  // Welche offene Aufgabe ist gemeint? („Etiketten“ → „Etiketten bestellen“)
  function finden(suche) {
    const woerter = suche.toLowerCase().replace(/[.,!?]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/^(die|den|das|der|aufgabe|mit|und|von|für)$/.test(w))
    if (!woerter.length) return []
    const kern = (w) => w.slice(0, Math.max(3, w.length - 2))
    const punkte = (a) => woerter.filter((w) => a.text.toLowerCase().split(/[\s-]+/).some((t) => t.startsWith(kern(w)) || w.startsWith(kern(t)))).length
    const bewertet = offen().map((a) => ({ a, p: punkte(a) })).filter((x) => x.p > 0)
    const best = Math.max(0, ...bewertet.map((x) => x.p))
    return bewertet.filter((x) => x.p === best).map((x) => x.a)
  }

  // ── Sprache/Text: selbst beantworten ──
  ctx.befehl(async (eingabe) => {
    const satz = ohneLuzzy(eingabe).replace(/[?!]+$/, '').trim()
    for (const re of NEU) {
      const t = re.exec(satz)
      if (!t) continue
      const a = await anlegen(t[1])
      if (!a) return null
      return satz(`Steht auf der Liste: ${a.text}${a.datum ? `, ${wannText(a)}` : ''}`)
    }
    for (const re of ERLEDIGT) {
      const t = re.exec(satz.replace(/\.$/, ''))
      if (!t) continue
      const treffer = finden(t[1])
      if (!treffer.length) return null // keine passende Aufgabe: normal an Luzzy
      if (treffer.length > 1) return `Welche? ${treffer.map((a) => a.text).join(' oder ')}?`
      treffer[0].erledigt = true
      treffer[0].erledigtAm = Date.now()
      await speichern()
      const rest = offen().length
      return `Abgehakt: ${treffer[0].text}. ${rest ? `Noch ${rest} offen.` : 'Alles erledigt, stark.'}`
    }
    if (LISTE.test(satz.replace(/\.$/, ''))) {
      const liste = sortiert(offen())
      if (!liste.length) return 'Deine Liste ist leer.'
      const texte = liste.slice(0, 5).map((a) => `${a.text}${a.datum ? ` (${wannText(a)})` : ''}`)
      return `${satz(`${liste.length === 1 ? 'Eine Aufgabe' : `${liste.length} Aufgaben`}: ${texte.length > 1 ? `${texte.slice(0, -1).join(', ')} und ${texte.at(-1)}` : texte[0]}`)}${liste.length > 5 ? ' Das waren die ersten fünf.' : ''}`
    }
    return null
  })

  // ── Für Luzzy: offene Aufgaben (bei „Was muss ich heute noch?“ usw.) ──
  ctx.kontext(() => {
    const liste = sortiert(offen())
    if (!liste.length) return 'Aufgaben aus Jarves-OS: keine offenen.'
    const h = heute()
    const zeile = (a) => `- ${a.text}${a.datum ? ` (fällig ${wannText(a)}${a.datum < h ? ', ÜBERFÄLLIG' : ''})` : ' (ohne Datum)'}`
    return `Offene Aufgaben aus Jarves-OS (heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}):\n${liste.map(zeile).join('\n')}`
  })

  // ── Begrüßung: fällige Aufgaben ──
  ctx.begruessung(() => {
    const h = heute()
    const heuteFaellig = offen().filter((a) => a.datum === h).length
    const ueber = offen().filter((a) => a.datum && a.datum < h).length
    const teile = []
    if (heuteFaellig) teile.push(`${heuteFaellig === 1 ? 'eine Aufgabe' : `${heuteFaellig} Aufgaben`} für heute`)
    if (ueber) teile.push(`${ueber === 1 ? 'eine überfällige' : `${ueber} überfällige`}`)
    return teile.length ? `Auf deiner Liste: ${teile.join(' und ')}.` : ''
  })

  // ── Erinnerung: zur Uhrzeit, ohne Uhrzeit morgens um 9 (über Luzzy-Meldung, Ruhezeit beachtet) ──
  setInterval(async () => {
    const jetzt = new Date()
    const minute = `${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}`
    let geaendert = false
    for (const a of offen()) {
      if (a.datum !== heute()) continue
      const um = a.zeit || ERINNERUNG_OHNE_ZEIT
      const schluessel = `${a.datum} ${um}`
      if (minute >= um && daten.erinnert[a.id] !== schluessel) {
        daten.erinnert[a.id] = schluessel
        geaendert = true
        ctx.melden({ art: 'aufgabe', titel: `Aufgabe: ${a.text}`, text: satz(`Felix, ${a.zeit ? 'jetzt' : 'heute'} fällig: ${a.text}`), anzeige: wannText(a) })
      }
    }
    if (geaendert) await ctx.daten.speichern(daten)
  }, 30000)

  // ── Rechte Spalte: Karte „Aufgaben“ (anfangs ausgeblendet, einschalten unter Einstellungen → Rechte Spalte) ──
  const karte = ctx.karte('Aufgaben')
  karte.parentElement.hidden = true
  function karteZeichnen() {
    const h = heute()
    const liste = sortiert(offen()).filter((a) => a.datum && a.datum <= h)
    karte.innerHTML = liste.length
      ? liste.slice(0, 5).map((a) => `<div class="af-karte-zeile${a.datum < h ? ' ueber' : ''}">${m(a.text)}${a.zeit ? ` <span class="leise">${a.zeit}</span>` : ''}</div>`).join('') + (liste.length > 5 ? `<div class="leise">+ ${liste.length - 5} weitere</div>` : '')
      : `<div class="leise">Heute nichts fällig${offen().length ? ` · ${offen().length} offen` : ''}.</div>`
  }

  // ── Bereich ──
  ctx.kopfKnoepfe.innerHTML = `<label class="gd-schalter af-schalter"><input type="checkbox" data-erledigte /> Erledigte zeigen</label>`
  ctx.element.innerHTML = `
    <form class="af-neu hud" data-neu>
      <input name="text" maxlength="500" required placeholder="Neue Aufgabe, z. B. „Etiketten bestellen bis Freitag“" autocomplete="off" />
      <input name="datum" type="date" title="Fällig am (optional)" />
      <input name="zeit" type="time" title="Uhrzeit (optional)" />
      <button class="knopf-gold" type="submit">Hinzufügen</button>
    </form>
    <div class="af-liste" data-liste></div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  function gruppe(titel, liste, klasse = '') {
    if (!liste.length) return ''
    return `<section class="af-gruppe ${klasse}"><h3>${titel} <span>${liste.length}</span></h3>${liste
      .map((a) => `<div class="af-aufgabe${a.erledigt ? ' erledigt' : ''}" data-id="${a.id}">
        <button class="gd-haken af-haken" data-a="erledigt" type="button" title="${a.erledigt ? 'Wieder offen' : 'Erledigt'}">${a.erledigt ? '✓' : ''}</button>
        <div class="af-text">${m(a.text)}${a.datum || a.zeit ? `<small>${m(wannText(a))}</small>` : ''}</div>
        <button class="knopf-mini" data-a="loeschen" type="button" title="Löschen">✕</button>
      </div>`)
      .join('')}</section>`
  }

  function zeichnen() {
    const h = heute()
    const o = sortiert(offen())
    const html =
      gruppe('Überfällig', o.filter((a) => a.datum && a.datum < h), 'ueber') +
      gruppe('Heute', o.filter((a) => a.datum === h)) +
      gruppe('Demnächst', o.filter((a) => a.datum > h)) +
      gruppe('Ohne Datum', o.filter((a) => !a.datum)) +
      (erledigteZeigen ? gruppe('Erledigt', daten.aufgaben.filter((a) => a.erledigt).sort((a, b) => (b.erledigtAm || 0) - (a.erledigtAm || 0))) : '')
    $('[data-liste]').innerHTML = html || '<div class="leer-hinweis">Nichts zu tun. Sag „Luzzy, neue Aufgabe: …“ oder tipp oben eine ein.</div>'
    karteZeichnen()
  }

  $('[data-neu]').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = e.currentTarget.elements
    const a = await anlegen(f.text.value)
    if (!a) return
    // Datum/Uhrzeit aus den Feldern haben Vorrang vor dem Text
    if (f.datum.value) a.datum = f.datum.value
    if (f.zeit.value) {
      a.zeit = f.zeit.value
      if (!a.datum) a.datum = heute()
    }
    await speichern()
    e.currentTarget.reset()
  })
  $('[data-liste]').addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-a]')
    const id = knopf?.closest('[data-id]')?.dataset.id
    if (!id) return
    const a = daten.aufgaben.find((x) => x.id === id)
    if (knopf.dataset.a === 'erledigt' && a) {
      a.erledigt = !a.erledigt
      a.erledigtAm = a.erledigt ? Date.now() : undefined
    } else if (knopf.dataset.a === 'loeschen') {
      daten.aufgaben = daten.aufgaben.filter((x) => x.id !== id)
    }
    await speichern()
  })
  ctx.kopfKnoepfe.querySelector('[data-erledigte]').addEventListener('change', (e) => {
    erledigteZeigen = e.target.checked
    zeichnen()
  })
  setInterval(zeichnen, 5 * 60000) // „heute“ wandert mit

  await laden()
  // Für andere Teile von Jarves-OS (Wochen-Review): Aufgaben anlegen und lesen
  window.__jarvesAufgaben = { anlegen, offen: () => sortiert(offen()), erledigtSeit: (zeit) => daten.aufgaben.filter((a) => a.erledigt && a.erledigtAm >= zeit) }
  return { laden, takt: 30000 }
}
