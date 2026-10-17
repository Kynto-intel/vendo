// Gesprächs-Fenster rechts: öffnen/schließen, Breite ziehen.
// Das Gespräch mit Luzzy steht nicht mehr rechts angedockt, sondern im Crew-Tab (Normaler Chat → Luzzy).
// „Öffnen“ (Gesprächs-Karte rechts, Strg+K, Klick auf den Untertitel) springt dorthin, „Schließen“ zurück zur Zentrale.

import { ansichtZeigen, offeneAnsicht } from '../rahmen/navigation.js'
import { titelfarbeSetzen } from '../rahmen/design.js'
import { luzzyChatZeigen, aktuellerKanal as crewKanal } from '../crewchat.js'

const $ = (id) => document.getElementById(id)

// api: window.vendo
// einstellungen: () => aktuelle Einstellungen (wird beim Ziehen um panel.breite ergänzt)
// runterScrollen: scrollt das Gespräch ans Ende
export function panelEinrichten({ api, einstellungen, runterScrollen }) {
  const panel = $('gespraech-panel')
  const panelGeschlossen = () => !(offeneAnsicht() === 'crew' && crewKanal() === 'zentrale')

  function panelSetzen(offen) {
    panel.hidden = true
    titelfarbeSetzen()
    if (offen) {
      ansichtZeigen('crew')
      luzzyChatZeigen().then(() => {
        runterScrollen()
        $('luzzy-form')?.querySelector('.eingabe-text')?.focus()
      })
    } else if (!panelGeschlossen()) ansichtZeigen('zentrale')
  }

  function breiteSetzen(px) {
    const breite = Math.round(Math.max(320, Math.min(px, window.innerWidth * 0.7)))
    document.documentElement.style.setProperty('--panel-breite', `${breite}px`)
    return breite
  }

  $('vorschau').addEventListener('click', () => panelSetzen(panelGeschlossen()))
  $('gespraech-schliessen').addEventListener('click', () => panelSetzen(false))
  $('untertitel').addEventListener('click', () => {
    if ($('untertitel').textContent) panelSetzen(true)
  })
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      panelSetzen(panelGeschlossen())
    }
  })

  $('griff').addEventListener('pointerdown', (e) => {
    const griff = e.currentTarget
    griff.setPointerCapture(e.pointerId)
    griff.classList.add('zieht')
    const startX = e.clientX
    const startBreite = panel.getBoundingClientRect().width
    let breite = startBreite
    const bewegen = (ev) => (breite = breiteSetzen(startBreite + (startX - ev.clientX)))
    const loslassen = () => {
      griff.classList.remove('zieht')
      griff.removeEventListener('pointermove', bewegen)
      griff.removeEventListener('pointerup', loslassen)
      const eing = einstellungen()
      eing.panel = { ...eing.panel, breite }
      api.einstellungen.speichern({ panel: eing.panel })
    }
    griff.addEventListener('pointermove', bewegen)
    griff.addEventListener('pointerup', loslassen)
  })

  return { panelSetzen, panelGeschlossen, breiteSetzen }
}