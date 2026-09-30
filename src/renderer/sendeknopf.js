// Senden-/Stopp-Knopf aller Eingaben (Zentrale, Crew, Bot-Fenster): runder goldener Knopf mit Symbol.
// Senden = Pfeil nach oben, Stopp = Quadrat (die KI hört auf). Der Knopf behält die Klasse „senden“ bzw. „bf-senden“.

const SENDEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>'
const STOPP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.2"/></svg>'

export function sendeKnopfSetzen(knopf, laeuft, { wer = 'die KI' } = {}) {
  if (!knopf) return
  const zustand = laeuft ? 'stopp' : 'senden'
  if (knopf.dataset.zustand === zustand) return
  knopf.dataset.zustand = zustand
  knopf.innerHTML = laeuft ? STOPP : SENDEN
  const text = laeuft ? `Stopp: ${wer} hört sofort auf` : 'Senden (Enter)'
  knopf.title = text
  knopf.setAttribute('aria-label', text)
  knopf.classList.toggle('stopp', laeuft)
  knopf.type = laeuft ? 'button' : 'submit'
}
