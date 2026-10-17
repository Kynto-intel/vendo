// Diktiermodus: Felix redet frei drauflos, Luzzy macht daraus eine fertige Mail, Nachricht oder einen Text.
// Das Ergebnis liegt danach in der Zwischenablage (Strg+V). Abschicken tut Felix selbst, Luzzy verschickt nichts.
//   „Diktat“ / „Diktiermodus“          lange Aufnahme (Pausen bis 3,5 Sekunden sind erlaubt)
//   „Diktat: …“                        Text direkt verarbeiten
//   „Schreib eine Mail an …, dass …“   dito, die Art steht schon im Satz

const api = window.vendo

// Nur das Wort allein: lange Aufnahme starten
const START = /^(?:diktat|diktiermodus|diktieren|diktat starten|ich (?:will|möchte) (?:was |etwas )?diktieren)$/
const DIREKT = /^diktat[:,]\s*([\s\S]+)$/i
// Nur Mails und Nachrichten: „Schreib eine Antwort auf die Kundenmail“ oder „Schreib einen Post über …“ bleiben bei
// Luzzy, dafür braucht sie ihre Werkzeuge (Postfach) oder freie Hand.
const SCHREIB = /^(?:schreib|schreibe|formulier|formuliere)(?: mir)?(?: mal| bitte)* (?:eine?n?|ne|nen) (e-?mail|mail|nachricht|whatsapp|sms|brief)\b/i

const ARTEN = { email: 'Mail', mail: 'Mail', nachricht: 'Nachricht', whatsapp: 'Nachricht', sms: 'Nachricht', brief: 'Brief' }

const ohneLuzzy = (text) => String(text || '').trim().replace(/^\s*(hey|hi|hallo|ok)?\s*luzzy[,!.:\s]*/i, '')

// Was will Felix? { start: true } | { art, inhalt } | null
export function diktatErkennen(text) {
  const satz = ohneLuzzy(text)
  if (START.test(satz.toLowerCase().replace(/[.!?]/g, '').replace(/\s+/g, ' ').trim())) return { start: true }
  const direkt = DIREKT.exec(satz)
  if (direkt) return { art: '', inhalt: direkt[1].trim() }
  const schreib = SCHREIB.exec(satz)
  if (schreib) return { art: ARTEN[schreib[1].toLowerCase().replace('-', '')] || 'Text', inhalt: satz }
  return null
}

// Auftrag an Luzzy: Diktat → fertiger Text, nur der Text, nichts verschicken
export function diktatAuftrag({ art, inhalt }) {
  const was = art ? `eine fertige ${art}` : 'einen fertigen Text (erkenne aus dem Diktat, ob Mail, Nachricht oder etwas anderes)'
  return `Felix hat diktiert (Rohtext der Spracherkennung, kann Fehler haben). Mach daraus ${was}.
- Rechtschreibung und Satzbau sauber, Füllwörter und Versprecher raus. Inhalt nicht verändern, nichts erfinden.
- Anweisungen im Diktat (an wen, welcher Ton, was rein soll) befolgen, aber nicht in den Text schreiben.
- Mail oder Brief: erste Zeile „Betreff: …“, dann eine Leerzeile, Anrede, Text, Gruß mit „Felix“ von Donnerwolf. Duzen oder Siezen wie im Diktat, bei Geschäftlichem im Zweifel Sie.
- Nachricht: kurz und locker, ohne Betreff.
- Gleiche Sprache wie im Diktat.
Antworte nur mit dem fertigen Text, ohne Einleitung, ohne Kommentar. Nichts verschicken, nichts speichern, keine Werkzeuge benutzen.

"""
${inhalt}
"""`
}

// Luzzys Ergebnis in die Zwischenablage. Gibt den Satz für Felix zurück.
export async function diktatAblegen(antwort, { art }) {
  const text = String(antwort || '')
    .trim()
    .replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1') // falls sie es in einen Code-Block packt
    .trim()
  if (!text) return ''
  await api.zwischenablage.schreiben(text)
  const name = { Mail: 'Die Mail', Nachricht: 'Die Nachricht', Brief: 'Der Brief' }[art] || 'Der Text'
  return `Fertig. ${name} liegt in der Zwischenablage, einfach mit Strg V einfügen.`
}
