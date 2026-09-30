// PC-Steuerung, Stufe 1: Sofortbefehle ohne KI, direkt auf dem PC. Nur wenn der GANZE Satz genau der Befehl ist:
//   „Lauter“ · „Viel leiser“ · „Lautstärke auf 30 Prozent“ · „Ton aus“ · „Nächstes Lied“ · „Musik Pause“
//   „Öffne Downloads“ · „Sperr den PC“ · „Öffne Photoshop“ (nur wenn es das Programm im Startmenü gibt)
// Alles andere (Browser, Seiten, Suchen, Links, längere Sätze) geht an Luzzy. Sie versteht, was gemeint ist, und
// steuert den PC selbst über ihr Werkzeug pc_steuern (Stufe 2: Hermes-Plugin jarves-pc → src/main/pcbruecke.js).
// Ausgeführt wird im Hauptprozess (src/main/pc.js), dort wird jede Aktion geprüft.

const api = window.jarves

const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

// Satz → Plan (oder null, wenn es kein Sofortbefehl ist). Nur erkennen, noch nichts ausführen.
export function pcBefehlErkennen(text) {
  const satz = ohneLuzzy(text).replace(/[.!?]+\s*$/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const s = satz.toLowerCase()
  if (!s) return null

  // Lautstärke und Musik
  let t = /^(?:mach |dreh |stell )?(?:(?:die |den )?(?:musik|ton|lautstärke|sound) )?(etwas |ein bisschen |ein wenig |viel |ganz |deutlich )?(lauter|leiser)(?: bitte)?$/.exec(s)
  if (t) {
    const menge = /viel|ganz|deutlich/.test(t[1] || '') ? 12 : /etwas|bisschen|wenig/.test(t[1] || '') ? 2 : 5
    return { art: 'taste', taste: t[2], anzahl: menge, sagen: t[2] === 'lauter' ? 'Lauter.' : 'Leiser.' }
  }
  if (/^(?:(?:den |die )?(?:ton|musik|sound) (?:aus|stumm)(?: schalten)?|stumm(?: schalten)?|mute|(?:den )?ton (?:wieder )?an)$/.test(s)) return { art: 'taste', taste: 'stumm', sagen: '' }
  t = /^(?:stell |mach |setz )?(?:die )?lautstärke (?:auf )?(\d{1,3}) ?(?:%|prozent)?$/.exec(s)
  if (t) return { art: 'lautstaerke', prozent: Math.min(100, Number(t[1])), sagen: `Lautstärke auf ${Math.min(100, Number(t[1]))} Prozent.` }
  if (/^(?:(?:die )?musik (?:pause|pausieren|anhalten|stoppen)|pausier(?:e)? (?:die )?musik|pause|(?:die )?musik weiter|spiel (?:die musik )?weiter|weiter ?spielen|musik fortsetzen)$/.test(s)) return { art: 'taste', taste: 'abspielen', sagen: '' }
  if (/^(?:(?:das )?nächste[rs]? (?:lied|song|titel|track)|(?:lied|song) (?:überspringen|weiter)|überspringen)$/.test(s)) return { art: 'taste', taste: 'weiter', sagen: '' }
  if (/^(?:(?:das )?(?:vorherige[rs]?|letzte[rs]?) (?:lied|song|titel|track)|(?:lied|song) zurück)$/.test(s)) return { art: 'taste', taste: 'zurueck', sagen: '' }

  // PC sperren
  if (/^(?:sperr|sperre)(?: den| meinen)? (?:pc|computer|rechner|bildschirm)$/.test(s)) return { art: 'sperren', sagen: 'Ich sperre den PC.' }

  // Ordner
  t = /^(?:öffne|oeffne|zeig|zeige|mach)(?: mir)?(?: mal)?(?: den| die| das| meinen| meine| mein)?(?: ordner)? (desktop|downloads?|dokumente|bilder|fotos|musik|videos|donnerwolf|jarves(?: os)?)(?:[ -]?ordner)?(?: auf)?$/.exec(s)
  if (t) return { art: 'ordner', name: t[1], sagen: '' }

  // Programm: „Öffne Photoshop“, „Starte das Programm OBS“, „Mach Discord auf“. Nur kurze Namen ohne Adresse,
  // ohne „und“ und ohne Datei; ob es das Programm gibt, prüft pcAusfuehren (sonst geht der Satz an Luzzy).
  t = /^(?:öffne|oeffne|öffnen|starte|start)(?: mir)?(?: mal| bitte| doch)*(?: das programm| die app| das spiel| den| die| das)? (.+?)(?: auf)?$/.exec(s) ||
    /^mach(?: mir)?(?: mal| bitte| doch)*(?: das programm| die app| das spiel| den| die| das)? (.+?) auf$/.exec(s)
  if (t && !/^(?:datei|dokument|bild|foto|pdf|video|tabelle|notiz|ordner|link|seite|webseite|browser)(?![\p{L}])/u.test(t[1])) {
    const name = t[1].replace(/(?<![\p{L}])(programm|app|bitte|mal)(?![\p{L}])/giu, ' ').replace(/\s+/g, ' ').trim()
    const kurz = name && name.split(' ').length <= 4
    const adresse = /[/:@]|https?|www\.|\.(?:de|com|net|org|io|shop)(?![\p{L}])/u.test(name)
    if (kurz && !adresse && !/(?<![\p{L}])und(?![\p{L}])/u.test(name)) return { art: 'programm', name, sagen: '' }
  }
  return null
}

// Plan ausführen. Gibt Luzzys Satz zurück, oder null, wenn nichts passte (dann geht der Satz weiter an Luzzy).
// bereichOeffnen(name): Jarves-Bereiche („Öffne Kalender“) gehen vor Programmen.
export async function pcAusfuehren(plan, { bereichOeffnen = () => false } = {}) {
  if (plan.art === 'programm') {
    if (bereichOeffnen(plan.name)) return `Hier ist ${plan.name.charAt(0).toUpperCase()}${plan.name.slice(1)}.`
    const r = await api.pc.aktion({ art: 'programm', name: plan.name })
    return r?.gefunden ? `${r.name} startet.` : null
  }
  if (plan.art === 'ordner') {
    const r = await api.pc.aktion({ art: 'ordner', name: plan.name.replace(/ os$/, '') })
    return r?.gefunden ? `Hier ist der Ordner ${plan.name.charAt(0).toUpperCase()}${plan.name.slice(1)}.` : null
  }
  const { sagen, ...aktion } = plan
  await api.pc.aktion(aktion)
  return sagen || 'Erledigt.'
}
