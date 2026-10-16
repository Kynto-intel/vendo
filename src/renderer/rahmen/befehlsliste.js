// Befehlspalette (Strg+P): die Liste aller Befehle (Bereiche, Routinen, Sprachbefehle, Tastenkürzel, Einstellungen …)
// und das Einrichten der Palette. Die Palette selbst (Suchen, Anzeigen, Ausführen) ist palette.js.
// Angebunden in app.js mit befehlslisteEinrichten({ … }): Funktionen und Zustand aus app.js kommen als h.<name>.

import { paletteEinrichten, paletteOeffnen } from '../palette.js'
import { ablageOeffnen } from '../zwischenablage.js'
import { sucheOeffnen } from '../suche.js'
import { timerBefehl, timerListe } from '../timer.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)

// Aus app.js (befehlslisteEinrichten): ansichtZeigen, abschicken, feldHoehe, aktivitaetMelden, untertitelZeigen,
// lokalAntworten, freihaendigSetzen, hoerModusUmschalten, leisteUmschalten, nichtStoerenSetzen, panelGeschlossen,
// panelSetzen, selbsttest, sprechenStarten, wiederholen, vorleser(), bereiche() (BEREICHE), einstellungen(),
// einstellungenSetzen(neu)
let h = {}

// An Luzzy schicken wie getippt (Jarves-OS-Befehle, Routinen und Plugins greifen wie gewohnt)
function paletteSenden(text) {
  h.ansichtZeigen('zentrale')
  const feld = document.querySelector('.befehl .eingabe-text')
  feld.value = text
  h.abschicken(feld)
}
// Beispiel in die Eingabe legen, „…“ markiert zum Überschreiben
function paletteEinfuegen(text) {
  h.ansichtZeigen('zentrale')
  const feld = document.querySelector('.befehl .eingabe-text')
  feld.value = text
  h.feldHoehe(feld)
  feld.focus()
  const i = text.indexOf('…')
  if (i >= 0) feld.setSelectionRange(i, i + 1)
  else feld.setSelectionRange(text.length, text.length)
}
// Sprachbefehle (gehen gesprochen nach „Hey Luzzy“ oder getippt). Mit „…“: Beispiel zum Anpassen in die Eingabe.
const SPRACHBEFEHLE = [
  ['Hey Luzzy', 'Luzzy hört zu (oder Strg+Leertaste)', 'aktivierungswort zuhören', () => h.sprechenStarten()],
  ['Hör nur noch auf Knopfdruck', 'kein „Hey Luzzy“ mehr, z. B. beim Telefonieren (Strg+Umschalt+H schaltet zurück)', 'mikrofon headset anruf freihändig aus', () => h.freihaendigSetzen(false)],
  ['Einfach reinreden (während sie spricht)', 'Luzzy hört auf und hört dir zu, auch „Hey Luzzy“ geht', 'unterbrechen dazwischen reden'],
  ['Luzzy, was siehst du?', 'nur im Mini-Modus: sie schaut EINMAL auf den Bildschirm und hilft (auch „Schau dir das an“)', 'bildschirm sehen schauen screenshot foto'],
  ['Stopp', 'Luzzy hört sofort auf (auch „Halt“, „Das reicht“, „Psst“)', 'still ruhe aufhören abbrechen'],
  ['Wiederhol das', 'letzte Antwort nochmal', 'wie bitte nochmal vorlesen'],
  ['Was hast du gerade gesagt?', '', 'wiederholen'],
  ['Timer 15 Minuten für …', 'z. B. die Nudeln', 'eieruhr countdown kochen'],
  ['Weck mich um … Uhr', '', 'wecker aufwachen morgen'],
  ['Erinner mich um … Uhr an …', 'oder „in 20 Minuten“', 'erinnerung termin'],
  ['Wie lange noch?', 'Timer abfragen', 'timer rest'],
  ['Timer um 5 Minuten verlängern', '', 'länger mehr zeit'],
  ['Alle Timer stoppen', '', 'timer löschen aus'],
  ['Nicht stören für … Minuten', 'oder „bis 15 Uhr keine Meldungen“', 'ruhe still'],
  ['Meldungen wieder an', 'beendet Nicht stören', 'ruhe vorbei'],
  ['Neues Gespräch …', 'eigenes Thema, z. B. „Neues Gespräch Shop“; Luzzy behält pro Thema den Faden', 'thema chat gespräch neu'],
  ['Wechsel zum Gespräch …', 'auch oben im Gesprächsfenster auswählen', 'thema chat gespräch wechseln'],
  ['Welche Gespräche gibt es?', '', 'themen gespräche liste'],
  ['Öffne … (Programm)', 'alles aus dem Startmenü, z. B. „Öffne Photoshop“, „Starte Spotify“', 'programm app starten öffnen pc'],
  ['Öffne den Browser und geh auf Netflix und such …', 'Luzzy versteht es und öffnet die Seite (Werkzeug pc_steuern), auch YouTube, Google, Amazon, Etsy …', 'browser internet webseite netflix youtube suchen'],
  ['Such auf YouTube nach …', 'oder „Spiel … auf YouTube“; macht Luzzy', 'youtube video musik suchen'],
  ['Öffne … in Chrome', 'Link oder Seite in einem bestimmten Browser; macht Luzzy', 'chrome firefox edge adresse link'],
  ['Lauter / Leiser', 'auch „viel lauter“, „Lautstärke auf 30 Prozent“, „Ton aus“', 'lautstärke ton stumm'],
  ['Nächstes Lied / Musik Pause', 'auch „vorheriges Lied“, „Musik weiter“', 'musik lied song pause'],
  ['Öffne Downloads', 'auch Desktop, Dokumente, Bilder, Musik, Videos, Donnerwolf', 'ordner explorer'],
  ['Sperr den PC', '', 'sperren bildschirm'],
  ['Such die Datei … und öffne sie', 'zeigt sie direkt in Jarves (Notiz, Bild, PDF, Video …)', 'datei suchen öffnen finden dokument bild pdf'],
  ['Ändere … (bei offener Datei)', 'Luzzy ändert die Stellen live im Text, speichern tust du selbst (Strg+S)', 'datei bearbeiten ändern ersetzen korrigieren'],
  ['Öffne die Datei …', 'auch „Zeig mir das Bild …“, „Öffne das PDF …“; mehrere Treffer: „die zweite“', 'datei öffnen zeigen bild foto pdf video tabelle'],
  ['Merk dir: …', 'Gedankenspeicher', 'notiz idee notieren'],
  ['Neue Idee: …', 'Luzzy schreibt sie sauber als Notiz in den Vault (Jarves-OS, Ideen)', 'idee notiz vault diktat schlagworte'],
  ['Diktat', 'frei reden, auch länger: Luzzy macht eine fertige Mail oder Nachricht daraus (Zwischenablage)', 'diktieren diktiermodus mail text', () => h.sprechenStarten({ diktat: true })],
  ['Schreib eine Mail an …, dass …', 'fertige Mail in der Zwischenablage, abschicken tust du selbst', 'mail email nachricht whatsapp brief entwurf diktat'],
  ['Was wollte ich mir merken?', '', 'gedanken notizen'],
  ['Neue Aufgabe: … bis Freitag', 'oder „morgen um 14 Uhr“', 'todo to-do liste'],
  ['Erledigt: …', 'Aufgabe abhaken', 'fertig abhaken aufgabe'],
  ['Was steht auf meiner Liste?', 'offene Aufgaben', 'aufgaben todo'],
  ['Was muss ich heute noch machen?', 'Luzzy mit Aufgaben und Terminen', 'aufgaben termine heute'],
  ['Wochen-Review', 'Woche zusammenfassen, Ziele eintragen', 'wochenrückblick ziele'],
  ['Fokus', '25 Minuten, Luzzy stört nicht', 'pomodoro konzentrieren'],
  ['Fokus … Minuten', '', 'pomodoro'],
  ['Fokus beenden', 'auch „Fokus pausieren“, „Weiter mit Fokus“', 'pomodoro stop'],
  ['Wie wird das Wetter morgen?', 'Luzzy bekommt die Wetterdaten', 'wetter regen'],
  ['Was steht an?', 'Termine und Jobs', 'termine kalender'],
  ['Wie viele Bestellungen haben wir insgesamt?', 'Meilensteine', 'meilenstein shop'],
  ['Mach einen Selbsttest', 'prüft alles', 'systemcheck check']
]
// Tastenkürzel (zum Nachschlagen, Anklicken führt aus, wo es geht)
const TASTENKUERZEL = [
  ['Befehlspalette', 'Strg+P', () => {}],
  ['Suchleiste oben: Bots, Bereiche, Notizen, Dateien', 'Strg+F', () => sucheOeffnen()],
  ['Sprechen (auch im Hintergrund)', 'Strg+Leertaste', () => h.sprechenStarten()],
  ['Freihändig an/aus („Hey Luzzy“ oder nur auf Knopfdruck, z. B. mit Headset)', 'Strg+Umschalt+H', () => h.hoerModusUmschalten()],
  ['Zwischenablage an Luzzy (aus jedem Programm)', 'Strg+Umschalt+L', () => ablageOeffnen()],
  ['Gespräch öffnen/schließen', 'Strg+K', () => h.panelSetzen(h.panelGeschlossen())],
  ['Linke Leiste ein/aus (oder Klick aufs Logo)', 'Strg+B', () => h.leisteUmschalten('links')],
  ['Rechte Spalte ein/aus', 'Strg+J', () => h.leisteUmschalten('rechts')],
  ['Fenster: linke Bildschirmhälfte', 'Strg+Alt+←', () => api.fenster.andocken('links')],
  ['Fenster: rechte Bildschirmhälfte', 'Strg+Alt+→', () => api.fenster.andocken('rechts')],
  ['Fenster: ganzer Bildschirm', 'Strg+Alt+↑', () => api.fenster.andocken('voll')],
  ['Mini-Modus: nur eine Leiste oben mittig (auch aus jedem Programm)', 'AltGr+L', () => api.fenster.mini(true)],
  ['Mini-Modus an/aus (andere Taste dafür)', 'Strg+Umschalt+M', () => api.fenster.mini(true)],
  ['Nachricht abschicken', 'Enter', () => {}],
  ['Neue Zeile in der Eingabe', 'Umschalt+Enter', () => {}],
  ['Luzzy hört auf zu sprechen', 'Esc', () => h.vorleser().stoppen()],
  ['Fenster, Palette, Dialog schließen', 'Esc', () => {}],
  ['Zwischenablage-Fenster: Zusammenfassen, Verbessern, Übersetzen, Beantworten', '1 – 4', () => {}],
  ['Entwickler-Werkzeuge (Fehlersuche)', 'F12', () => {}]
]
let paletteRoutinen = [] // aus dem Routinen-Plugin, beim Öffnen der Palette frisch geladen
function paletteBefehle() {
  const liste = h.bereiche().filter((b) => b.aktiv).map((b) => ({ name: `${b.name} öffnen`, gruppe: 'Bereich', stichwoerter: 'gehe zu tab zeige', ausfuehren: () => h.ansichtZeigen(b.id) }))
  // Routinen mit ihren Auslösewörtern (auch die ohne Knopf); ohne Routinen-Daten: die Schnellbefehl-Knöpfe
  if (paletteRoutinen.length) {
    for (const r of paletteRoutinen) {
      const wort = (r.ausloeser || [])[0]
      if (!wort) continue
      liste.push({ name: r.name, gruppe: 'Routine', hinweis: `sag „${r.ausloeser.join('“ oder „')}“`, stichwoerter: `routine ${r.ausloeser.join(' ')}`, sagen: true, ausfuehren: () => paletteSenden(wort) })
    }
  } else {
    for (const knopf of document.querySelectorAll('#schnellbefehle [data-plugin-knopf]')) {
      liste.push({ name: knopf.textContent.trim(), gruppe: 'Schnellbefehl', stichwoerter: `routine ${knopf.title}`, ausfuehren: () => knopf.click() })
    }
  }
  for (const [satz, hinweis, stichwoerter, eigen] of SPRACHBEFEHLE) {
    liste.push({ name: `„${satz}“`, gruppe: 'Sprachbefehl', hinweis, stichwoerter, sagen: true, ausfuehren: eigen || (() => (satz.includes('…') ? paletteEinfuegen(satz) : paletteSenden(satz))) })
  }
  for (const [name, taste, aktion] of TASTENKUERZEL) liste.push({ name, gruppe: 'Tastenkürzel', taste, stichwoerter: 'taste tastatur kürzel shortcut', ausfuehren: aktion })
  const ruhe = h.einstellungen()?.nichtStoerenBis > Date.now()
  const bescheid = (text) => {
    h.untertitelZeigen(text, { fertig: true })
    h.aktivitaetMelden(text)
  }
  liste.push(
    { name: 'Sprechen', gruppe: 'Luzzy', stichwoerter: 'mikrofon zuhören reden', ausfuehren: () => h.sprechenStarten() },
    { name: 'Letzte Antwort nochmal hören', gruppe: 'Luzzy', stichwoerter: 'wiederhol vorlesen', ausfuehren: () => h.wiederholen() },
    { name: h.panelGeschlossen() ? 'Gespräch öffnen' : 'Gespräch schließen', gruppe: 'Ansicht', stichwoerter: 'chat verlauf strg+k', ausfuehren: () => h.panelSetzen(h.panelGeschlossen()) },
    ruhe
      ? { name: 'Nicht stören beenden', gruppe: 'Meldungen', stichwoerter: 'ruhe meldungen wieder an', ausfuehren: () => h.nichtStoerenSetzen(0) }
      : { name: 'Nicht stören (1 Stunde)', gruppe: 'Meldungen', stichwoerter: 'ruhe still keine meldungen', ausfuehren: () => h.nichtStoerenSetzen(Date.now() + 3600000) },
    ...(timerListe().length ? [{ name: 'Alle Timer stoppen', gruppe: 'Timer', stichwoerter: 'wecker erinnerung löschen', ausfuehren: () => h.lokalAntworten(timerBefehl('alle timer stoppen')) }] : []),
    { name: 'Meldungen leeren', gruppe: 'Meldungen', stichwoerter: 'liste löschen', ausfuehren: () => $('meldungen-leeren').click() },
    { name: 'Zwischenablage an Luzzy', gruppe: 'Luzzy', stichwoerter: 'kopiert strg+umschalt+l zusammenfassen übersetzen verbessern', ausfuehren: () => ablageOeffnen() },
    { name: 'Selbsttest', gruppe: 'System', stichwoerter: 'prüfen check test fehler', ausfuehren: () => h.selbsttest() },
    {
      name: 'Vendo sichern', gruppe: 'System', stichwoerter: 'backup sicherung',
      ausfuehren: async () => {
        bescheid('Sichere Vendo …')
        try {
          await api.sicherung.anlegen()
          bescheid('Vendo ist gesichert.')
        } catch (e) {
          bescheid(`Sicherung fehlgeschlagen: ${e.message}`)
        }
      }
    },
    { name: 'Sicherungsordner öffnen', gruppe: 'System', stichwoerter: 'backup explorer', ausfuehren: () => api.sicherung.ordner() },
    {
      name: `Vorlesen ${h.einstellungen()?.vorlesen ? 'ausschalten' : 'einschalten'}`, gruppe: 'Einstellung', stichwoerter: 'stimme stumm leise laut',
      ausfuehren: async () => {
        const neu = await api.einstellungen.speichern({ vorlesen: !h.einstellungen().vorlesen })
        h.einstellungenSetzen(neu)
        if (!neu.vorlesen) h.vorleser().stoppen()
        bescheid(neu.vorlesen ? 'Vorlesen ist an.' : 'Vorlesen ist aus.')
      }
    },
    { name: `Linke Leiste ${h.einstellungen()?.leisten?.links === false ? 'aufklappen' : 'einklappen'}`, gruppe: 'Ansicht', stichwoerter: 'seitenleiste menü strg+b', ausfuehren: () => h.leisteUmschalten('links') },
    { name: `Rechte Spalte ${h.einstellungen()?.leisten?.rechts === false ? 'aufklappen' : 'einklappen'}`, gruppe: 'Ansicht', stichwoerter: 'seitenleiste karten strg+j', ausfuehren: () => h.leisteUmschalten('rechts') },
    { name: 'Fenster: linke Bildschirmhälfte', gruppe: 'Fenster', stichwoerter: 'andocken halb links strg+alt', ausfuehren: () => api.fenster.andocken('links') },
    { name: 'Fenster: rechte Bildschirmhälfte', gruppe: 'Fenster', stichwoerter: 'andocken halb rechts strg+alt', ausfuehren: () => api.fenster.andocken('rechts') },
    { name: 'Fenster: ganzer Bildschirm', gruppe: 'Fenster', stichwoerter: 'maximieren vollbild groß', ausfuehren: () => api.fenster.andocken('voll') },
    { name: 'Einstellungen öffnen', gruppe: 'Einstellung', stichwoerter: 'optionen stimme animationen', ausfuehren: () => $('einstellungen-oeffnen').click() }
  )
  return liste
}

export function befehlslisteEinrichten(helfer) {
  h = { ...h, ...helfer }
  paletteEinrichten({
    befehle: paletteBefehle,
    vorbereiten: async () => {
      const d = await api.plugins.datenLaden('routinen').catch(() => null)
      paletteRoutinen = Array.isArray(d?.routinen) ? d.routinen : []
    },
    luzzy: (text) => {
      h.ansichtZeigen('zentrale')
      const feld = document.querySelector('.befehl .eingabe-text')
      feld.value = text
      h.abschicken(feld)
    }
  })
  $('palette-oeffnen').addEventListener('click', paletteOeffnen)
}
