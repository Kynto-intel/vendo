const SCHLUESSEL = 'vendo.hermes-warteschlange.v1'

export function hermesSlashErkennen(text) {
  return /^\s*\/(?:goal|steer|queue|s|q)(?:\s|$)/i.test(String(text || ''))
}

function warteschlangeLaden() {
  try {
    const eintraege = JSON.parse(localStorage.getItem(SCHLUESSEL) || '[]')
    return Array.isArray(eintraege)
      ? eintraege.filter((e) => typeof e?.text === 'string' && e.text.trim()).slice(0, 20)
      : []
  } catch {
    return []
  }
}

export function hermesAuftraegeEinrichten({ api, beschaeftigt, verbunden, zielStarten, warteschlangenSenden, melden, bestaetigen = melden }) {
  let warteschlange = warteschlangeLaden()
  let zielAktiv = null
  let wirdGesendet = false
  let statusLaeuft = false

  function speichern() {
    try {
      localStorage.setItem(SCHLUESSEL, JSON.stringify(warteschlange))
    } catch {
      melden('Warteschlange konnte nicht lokal gespeichert werden.')
    }
  }

  function zielErgebnis(ergebnis, anzeigen = true) {
    const text = String(ergebnis?.output || ergebnis?.message || '').trim()
    if (/goal\s*\(active/i.test(text)) zielAktiv = true
    else if (/goal.*\b(?:paused|done|cleared|achieved)\b|no active goal|no goal is active/i.test(text)) zielAktiv = false
    if (text && anzeigen) melden(text)
    return text
  }

  async function zielBefehl(arg, { anzeigen = true } = {}) {
    if (!verbunden()) throw new Error('Hermes ist gerade nicht verbunden.')
    const ergebnis = await api.hermes.aktion('ziel-befehl', { arg })
    if (ergebnis?.type === 'send' && ergebnis.message) {
      zielAktiv = true
      const ziel = arg.replace(/^(?:draft\s+)?/, '').trim() || 'Ziel fortsetzen'
      const ok = await zielStarten(ergebnis.message, ziel)
      if (ok === false) throw new Error('Luzzy arbeitet bereits. Das Ziel konnte nicht gestartet werden.')
      bestaetigen('Ziel gestartet.')
      return
    }
    zielErgebnis(ergebnis, anzeigen)
    await warteschlangePruefen()
  }

  async function zielStatus() {
    if (!verbunden()) {
      zielAktiv = null
      return
    }
    if (statusLaeuft) return
    statusLaeuft = true
    try {
      await zielBefehl('status', { anzeigen: false })
    } catch (e) {
      if (zielAktiv === null) zielAktiv = false
      await warteschlangePruefen()
    } finally {
      statusLaeuft = false
    }
  }

  async function warteschlangePruefen() {
    if (wirdGesendet || beschaeftigt() || zielAktiv !== false || !warteschlange.length || !verbunden()) return
    wirdGesendet = true
    try {
      const ergebnis = await warteschlangenSenden(warteschlange[0].text)
      if (ergebnis === true || ergebnis?.ok) {
        warteschlange.shift()
        speichern()
        melden('Nächste Nachricht aus der Warteschlange wurde gesendet.')
        if (ergebnis?.fertig) queueMicrotask(warteschlangePruefen)
      }
    } catch (e) {
      melden(`Warteschlange: ${e.message}. Die Nachricht bleibt vorgemerkt.`)
    } finally {
      wirdGesendet = false
    }
  }

  async function slashAusfuehren(befehl, argument) {
    const text = argument.trim()
    if (!verbunden()) return melden('Hermes ist gerade nicht verbunden.')

    if (befehl === 'steer') {
      if (!text) return melden('Verwendung: /steer <Hinweis für den laufenden Auftrag>')
      if (!beschaeftigt()) return melden('Gerade läuft kein Auftrag. /steer funktioniert während Luzzy arbeitet.')
      try {
        const ergebnis = await api.hermes.aktion('ziel-lenken', { text })
        if (ergebnis?.status === 'rejected') throw new Error(ergebnis.text || 'Hermes hat den Hinweis abgelehnt.')
        melden(ergebnis?.status === 'redirected'
          ? `Luzzy umgelenkt: ${text}`
          : `Hinweis für den nächsten Werkzeug-Schritt vorgemerkt: ${text}`)
      } catch (e) {
        melden(`/steer fehlgeschlagen: ${e.message}`)
      }
      return
    }

    if (befehl === 'queue') {
      if (/^list$/i.test(text)) {
        melden(warteschlange.length
          ? `Warteschlange (${warteschlange.length}/20): ${warteschlange.map((e, i) => `${i + 1}. ${e.text}`).join(' | ')}`
          : 'Die Warteschlange ist leer.')
        return
      }
      const entfernen = /^remove\s+(\d+)$/i.exec(text)
      if (entfernen) {
        const index = Number(entfernen[1]) - 1
        if (index < 0 || index >= warteschlange.length) return melden('Diese Nummer gibt es nicht in der Warteschlange. Mit /queue list anzeigen.')
        warteschlange.splice(index, 1)
        speichern()
        return melden('Nachricht aus der Warteschlange entfernt.')
      }
      if (/^clear$/i.test(text)) {
        const anzahl = warteschlange.length
        warteschlange = []
        speichern()
        return melden(`${anzahl} vorgemerkte ${anzahl === 1 ? 'Nachricht' : 'Nachrichten'} entfernt.`)
      }
      if (!text) return melden('Verwendung: /queue <Nachricht> · /queue list · /queue remove <Nr.> · /queue clear')
      if (warteschlange.length >= 20) return melden('Warteschlange voll (maximal 20). Erst mit /queue list ansehen oder Einträge entfernen.')
      warteschlange.push({ text })
      speichern()
      melden(beschaeftigt() || zielAktiv === true
        ? `Für danach vorgemerkt (${warteschlange.length}/20). Mit /queue list ansehen.`
        : 'Luzzy ist frei; die Nachricht wird jetzt gesendet.')
      await zielStatus()
      await warteschlangePruefen()
      return
    }

    if (befehl === 'goal') {
      if (!text) return melden('Verwendung: /goal <Ziel> · /goal status · /goal pause · /goal resume · /goal clear')
      if (/^(?:status|pause|resume|clear|show|draft(?:\s|$))/i.test(text)) {
        try {
          await zielBefehl(text)
        } catch (e) {
          melden(`/goal fehlgeschlagen: ${e.message}`)
        }
        return
      }
      if (beschaeftigt()) return melden('Luzzy arbeitet bereits. Nutze /steer für einen Hinweis oder /queue für den nächsten Auftrag.')
      try {
        await zielBefehl(text)
      } catch (e) {
        melden(`/goal fehlgeschlagen: ${e.message}`)
      }
    }
  }

  function slash(text) {
    const treffer = /^\s*\/(goal|steer|queue|s|q)(?:\s+([\s\S]*))?\s*$/i.exec(text)
    if (!treffer) return false
    const befehl = ({ s: 'steer', q: 'queue' })[treffer[1].toLowerCase()] || treffer[1].toLowerCase()
    void slashAusfuehren(befehl, treffer[2] || '')
    return true
  }

  return {
    slash,
    antwortFertig: async () => {
      await zielStatus()
      await warteschlangePruefen()
    },
    zielAktualisieren: zielStatus
  }
}
