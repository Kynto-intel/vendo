# Vendo-Plugins

Jeder Ordner hier ist ein Plugin. Vendo lädt beim Start alle Plugins und zeigt sie als eigenen
Bereich links in der Leiste (vor "System"). Neues Plugin = neuer Ordner, Vendo neu starten.

## Aufbau

```
plugins/
  mein-plugin/          Ordnername = id (kleine Buchstaben, Zahlen, Bindestrich)
    plugin.json         Pflicht: Name, Beschreibung, Bereich
    ansicht.js          Oberfläche (JavaScript-Modul)
    stil.css            optional: eigenes Design
    haupt.js            optional: Hintergrundteil (Node, z. B. für Dateien oder Internet)
    (Speicher)          legt Vendo selbst an: daten/plugins/mein-plugin.json, nicht im Plugin-Ordner
```

### plugin.json

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "beschreibung": "Kurz, wofür es da ist.",
  "bereich": { "name": "Mein Plugin" },
  "aktiv": true
}
```

`"aktiv": false` schaltet ein Plugin ab, ohne es zu löschen.

### ansicht.js

```js
export async function starten(ctx) {
  ctx.element.innerHTML = '<p>Hallo aus meinem Plugin</p>'
  return {
    laden() { /* wird aufgerufen, wenn der Bereich geöffnet wird und dann regelmäßig */ },
    takt: 60000 // wie oft laden() läuft, solange der Bereich offen ist (ms)
  }
}
```

### Was ein Plugin über `ctx` bekommt

| Werkzeug | Wofür |
|---|---|
| `ctx.element` | der Inhaltsbereich des Plugins |
| `ctx.kopfKnoepfe` | Platz für Knöpfe oben rechts im Bereich |
| `ctx.daten.laden()` / `ctx.daten.speichern(obj)` | eigener Speicher (`daten/plugins/<id>.json`, bei Felix Daten und im Backup) |
| `ctx.karte(titel)` | Karte in der rechten Spalte, gibt das Inhalts-Element zurück |
| `ctx.melden({ titel, text, anzeige })` | Meldung: erscheint rechts, Luzzy sagt `text` laut (Ruhezeit beachtet) |
| `ctx.vorlesen(text)` | Luzzy liest etwas vor |
| `ctx.luzzy(text, { anzeige, vorlesen, ansichtWechseln })` | schickt Luzzy einen Auftrag in der Zentrale; `anzeige` = was im Gespräch erscheint |
| `ctx.kontext(() => text)` | Text, den andere Plugins abfragen können (z. B. Termine für Routinen) |
| `ctx.kontextVon(id)` | Kontext eines anderen Plugins holen, z. B. `ctx.kontextVon('kalender')` |
| `await ctx.bestaetigen(text, { titel, ja, gefahr })` | Rückfrage im Jarves-Design (statt `confirm`), liefert true/false |
| `ctx.hinweis(text, { titel })` | Hinweisfenster im Jarves-Design (statt `alert`) |
| `ctx.begruessung(() => satz)` | Kurzer Satz für Luzzys Begrüßung beim Start (z. B. Termine heute, Wetter) |
| `ctx.kontextFuer(text)` | Kontext aller Plugins, deren Stichwörter im Text vorkommen (siehe unten) |
| `ctx.eingabeFilter(fn)` | Eingaben abfangen: `fn(text)` gibt `{ text, anzeige, vorlesen }` oder `null` zurück |
| `ctx.befehl(fn)` | Befehl selbst beantworten, sofort und ohne Hermes: `fn(text, { gesprochen })` gibt die Antwort (Luzzy sagt sie), `true` (erledigt, nichts sagen) oder `null` (kein Befehl) zurück |
| `ctx.knoepfe([{ name, titel, fn }])` | Knöpfe über der Eingabe in der Zentrale setzen |
| `ctx.bereit()` | Ist Luzzy gerade frei (verbunden, antwortet nicht)? |
| `ctx.nichtStoeren(bis)` | „Nicht stören“ bis zum Zeitpunkt `bis` (ms) setzen, `0` beendet es (Meldungen nur in der Liste) |
| `ctx.oeffnen()` | öffnet den Bereich des Plugins |
| `ctx.aufrufen(name, ...)` | ruft eine Funktion aus haupt.js auf |
| `ctx.maskieren(text)` | Text sicher in HTML einsetzen |
| `ctx.markdownZuHtml(text)` | Markdown anzeigen |

### haupt.js (optional)

```js
module.exports = (ctx) => {
  ctx.bereitstellen('hallo', async (name) => `Hallo ${name}`)
  // ctx.datenLaden(), ctx.datenSpeichern(obj) gibt es hier auch
  // ctx.vault: in den Vault schreiben, nur in Donnerwolf-Shop\Jarves-OS\ und ohne zu überschreiben:
  //   await ctx.vault.anhaengen('Gedankenspeicher.md', '- Text', { kopf: '# Überschrift' })
  //   await ctx.vault.anlegen('Unterordner', 'Titel', 'Inhalt')   → neue Notiz
  //   await ctx.vault.lesen('Gedankenspeicher.md')
}
```

In `ansicht.js` dann: `await ctx.aufrufen('hallo', 'Felix')`.

## Regeln

- Plugins sind eigener, lokaler Code. Nichts aus dem Internet herunterladen und hier ablegen, ohne es geprüft zu haben.
- Hermes selbst wird von Plugins nicht verändert.
- Vor größeren Änderungen: `npm run backup` (die Plugins sind in der Sicherung enthalten).

## Vorhandene Plugins

| Plugin | Was es tut |
|---|---|
| `kalender` | Eigener Kalender: Monatsansicht, Termine, Erinnerungen über Luzzy, „Heute“-Karte, liefert Termine an andere Plugins |
| `routinen` | Standardaufgaben mit Auslösewort und eigenem Prompt (Termine werden automatisch angehängt, wenn der Prompt sie erwähnt), Ergebnis (vorlesen, speichern), Zeitplan und Knopf über der Eingabe |
| `gedanken` | Gedankenspeicher: „Merk dir: …“ per Sprache oder Tippen, Liste mit erledigt/löschen, jede Notiz auch im Vault (`Jarves-OS\Gedankenspeicher.md`), Luzzy kennt die offenen Notizen |
| `aufgaben` | To-do-Liste mit Fälligkeit („Neue Aufgabe: … bis Freitag“, „Erledigt: …“), Erinnerung über Luzzy-Meldung, Begrüßung, Kontext für Luzzy, Karte „Aufgaben“ (anfangs aus, Einstellungen → Rechte Spalte) |
| `fokus` | Pomodoro-Timer (Fokus, Pause, lange Pause) mit Hintergrundklang (Rauschen, Regen), in der Fokuszeit „Nicht stören“; „Fokus 50 Minuten“, „Fokus beenden“ |
| `meilensteine` | Bestellungen insgesamt (zählt der Wächter bei Shopify), nächster Meilenstein mit Fortschritt, Liste aller erreichten (gefeierte mit Datum aus `Jarves-OS\Meilensteine.md`) |
| `werkstatt` | Plugin-Werkstatt: Luzzy baut neue Plugins in `jarves-os\werkstatt\<id>\`, Vendo prüft (Aufbau, `node --check`, Rechte wie Programme starten, Dateien, Internet, Zugangsdaten) und kopiert sie erst nach Felix' Ja nach `plugins\` (altes Plugin nach `backup\`, `daten.json` bleibt) |

**Plugin von Luzzy bauen lassen:** In der Werkstatt beschreiben oder „Bau mir ein Plugin für …“ sagen. Luzzy nutzt dafür
ihren Hermes-Skill `jarves-plugin-werkstatt` (Profil donnerwolf, `skills\productivity\`), prüft sich mit
`node plugins\werkstatt\pruefen-cli.js <id>` selbst und bessert nach, bis keine Fehler mehr kommen. Felix' Testlauf legt
seinen Bericht als `.testbericht.json` in den Entwurf; „🔧 Luzzy soll die Fehler beheben“ schickt ihr die Fehler.
Entwürfe liegen in `werkstatt\` (nicht im Git-Projekt), bis Felix sie nach bestandenem Testlauf einbaut.

## Stichwörter: Daten automatisch an Luzzy

In `plugin.json` kann ein Plugin Stichwörter angeben (regulärer Ausdruck, Groß-/Kleinschreibung egal):

```json
"luzzy": { "stichwoerter": "wetter|regen|temperatur" }
```

Kommt eins davon in Felix' Nachricht oder im Prompt einer Routine vor, hängt Vendo den Text aus `ctx.kontext()` unsichtbar an.
Luzzy muss dann nicht selbst suchen. Genutzt von: Kalender (Termine), Wetter.
