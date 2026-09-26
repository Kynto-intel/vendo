// Donnerwolf-Startsequenz: Intro beim Öffnen (Reaktor fährt hoch, Systemcheck) und Luzzys Begrüßung.
// Das Intro liegt schon im HTML (#intro), damit beim Start nichts aufblitzt. Klick, Esc oder Leertaste überspringt.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const warten = (ms) => new Promise((r) => setTimeout(r, ms))

// Wartet, bis pruefen() einen Wert liefert, höchstens ms Millisekunden (dann null)
async function wartenAuf(pruefen, ms) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    const wert = await pruefen()
    if (wert) return wert
    await warten(200)
  }
  return null
}

export function introAus() {
  $('intro')?.remove()
  document.body.classList.remove('intro-an')
}

// schritte: [{ name, pruefen: () => ({ ok, text }) | null, zeit }] – werden nacheinander abgehakt
export async function introAbspielen(schritte, { mindestens = 3200, hoechstens = 9000 } = {}) {
  const el = $('intro')
  if (!el) return
  const start = Date.now()
  let uebersprungen = false
  const ueberspringen = () => (uebersprungen = true)
  const taste = (e) => ['Escape', ' ', 'Enter'].includes(e.key) && ueberspringen()
  el.addEventListener('click', ueberspringen)
  window.addEventListener('keydown', taste)

  const log = $('intro-log')
  requestAnimationFrame(() => el.classList.add('laeuft'))
  await warten(900) // Reaktor fährt hoch
  for (const s of schritte) {
    if (uebersprungen) break
    const zeile = document.createElement('div')
    zeile.className = 'intro-zeile'
    zeile.innerHTML = `<span class="intro-name">${maskieren(s.name)}</span><span class="intro-punkte"></span><span class="intro-wert">prüfe …</span>`
    log.appendChild(zeile)
    const rest = Math.max(600, hoechstens - (Date.now() - start))
    const ergebnis = await wartenAuf(async () => uebersprungen || (await s.pruefen()), Math.min(s.zeit || 6000, rest))
    if (ergebnis === true) break
    if (!ergebnis) {
      // Dauert länger: nicht aufhalten, läuft im Hintergrund weiter (Anzeige oben)
      zeile.classList.add('offen')
      zeile.querySelector('.intro-wert').textContent = '… prüft im Hintergrund'
    } else {
      zeile.classList.add(ergebnis.ok ? 'ok' : 'fehler')
      zeile.querySelector('.intro-wert').textContent = `${ergebnis.ok ? '✓' : '⚠'} ${ergebnis.text}`
    }
    await warten(160)
  }
  if (!uebersprungen) {
    el.classList.add('bereit')
    await warten(Math.max(700, mindestens - (Date.now() - start)))
  }
  el.removeEventListener('click', ueberspringen)
  window.removeEventListener('keydown', taste)
  el.classList.add('weg')
  document.body.classList.remove('intro-an')
  await warten(700)
  el.remove()
}

// Begrüßung zusammenbauen, ohne Luzzy zu fragen (geht sofort und kostet nichts)
export function begruessungBauen({ probleme = [], bestellungen = null, ungelesen = null, jobsFehler = 0, pluginSaetze = [] }) {
  const stunde = new Date().getHours()
  const gruss =
    stunde < 5 ? 'Na, noch wach, Felix?' : stunde < 11 ? 'Guten Morgen, Felix.' : stunde < 18 ? 'Hallo Felix.' : 'Guten Abend, Felix.'
  const teile = [gruss]
  teile.push(probleme.length ? `Fast alles bereit, nur ${probleme.join(' und ')} ${probleme.length > 1 ? 'haben' : 'hat'} gerade ein Problem.` : 'Alle Systeme bereit.')
  // bestellungen/ungelesen = null heißt: unbekannt (z. B. Shopify nicht erreichbar), dann nichts dazu sagen
  if (bestellungen === 0 && ungelesen === 0) teile.push('Keine neuen Bestellungen, und das Postfach ist leer.')
  else {
    if (bestellungen === 0) teile.push('Seit dem letzten Mal keine neuen Bestellungen.')
    else if (bestellungen === 1) teile.push('Seit dem letzten Mal ist eine neue Bestellung reingekommen.')
    else if (bestellungen > 1) teile.push(`Seit dem letzten Mal sind ${bestellungen} neue Bestellungen reingekommen.`)
    if (ungelesen === 0) teile.push('Das Postfach ist leer.')
    else if (ungelesen === 1) teile.push('Im Postfach wartet eine ungelesene Mail.')
    else if (ungelesen > 1) teile.push(`Im Postfach warten ${ungelesen} ungelesene Mails.`)
  }
  if (jobsFehler === 1) teile.push('Ein geplanter Job ist fehlgeschlagen, steht bei den Meldungen.')
  else if (jobsFehler > 1) teile.push(`${jobsFehler} geplante Jobs sind fehlgeschlagen, stehen bei den Meldungen.`)
  teile.push(...pluginSaetze.filter(Boolean))
  teile.push(stunde >= 18 || stunde < 5 ? 'Was kann ich noch für dich tun?' : 'Was steht an?')
  return teile.join(' ')
}
