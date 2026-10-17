// Musik erkennen: läuft auf dem PC Musik/Video (Windows-Mediensteuerung), zählt sie nicht als Sprache.
// Genutzt von app.js: musikAktiv(), musikKurzAnhalten(), nurMusik(text).

const NUR_MUSIK = [/[♪♫🎵🎶]/u, /^\W*[\[(]?\s*(musik|music|gesang|singing|applaus|applause|instrumental|lachen)\s*[\])]?\W*$/i, /untertitel(ung)?\s+(im auftrag|von|der|des)/i, /(vielen dank|danke)\s+(fürs|für's|für das)\s+zuschauen/i, /copyright|amara\.org|swr|zdf\s+\d{4}/i]

// Nur Musik oder bekannte Fehlerkennungen der Spracherkennung (sie „hört“ bei Musik gern Untertitel-Sätze)
export function nurMusik(text) {
  const t = String(text || '').trim()
  return t.length < 2 || NUR_MUSIK.some((m) => m.test(t))
}

// api: window.vendo
// einstellungen: () => aktuelle Einstellungen
// luzzyBeschaeftigt: () => true, solange Luzzy spricht, zuhört, versteht oder antwortet
export function musikEinrichten({ api, einstellungen, luzzyBeschaeftigt }) {
  let musikSpielt = false
  // „Hey Luzzy“ während Musik läuft: Musik anhalten (Medientaste), zuhören, danach von selbst weiter
  let musikVonVendoAngehalten = false
  let musikRuheSeit = 0

  const musikAktiv = () => musikSpielt && einstellungen()?.sprache?.musikErkennen !== false

  api.musik?.status().then((s) => (musikSpielt = Boolean(s))).catch(() => {})
  api.musik?.beiAenderung((s) => (musikSpielt = Boolean(s)))

  async function musikKurzAnhalten() {
    if (!musikAktiv()) return
    await api.pc.aktion({ art: 'taste', taste: 'abspielen' }).catch(() => {})
    musikVonVendoAngehalten = true
    await new Promise((r) => setTimeout(r, 350)) // kurz warten, bis es still ist
  }

  setInterval(() => {
    // Fertig mit Zuhören, Antworten und Vorlesen: angehaltene Musik wieder starten
    if (!musikVonVendoAngehalten || luzzyBeschaeftigt()) return (musikRuheSeit = 0)
    if (Date.now() - (musikRuheSeit ||= Date.now()) < 1500) return
    musikVonVendoAngehalten = false
    musikRuheSeit = 0
    if (!musikSpielt) api.pc.aktion({ art: 'taste', taste: 'abspielen' }).catch(() => {})
  }, 500)

  return { musikAktiv, musikKurzAnhalten, nurMusik }
}