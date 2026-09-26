# Jarves-OS Plugins

Jeder Ordner hier ist ein Plugin. Jarves-OS lädt beim Start alle Plugins und zeigt sie als eigenen
Bereich links in der Leiste (vor "System"). Neues Plugin = neuer Ordner, Jarves-OS neu starten.

## Aufbau

```
plugins/
  mein-plugin/          Ordnername = id (kleine Buchstaben, Zahlen, Bindestrich)
    plugin.json         Pflicht: Name, Beschreibung, Bereich
    ansicht.js          Oberfläche (JavaScript-Modul)
    stil.css            optional: eigenes Design
    haupt.js            optional: Hintergrundteil (Node, z. B. für Dateien oder Internet)
    daten.json          legt Jarves-OS selbst an: der Speicher des Plugins
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
| `ctx.daten.laden()` / `ctx.daten.speichern(obj)` | eigener Speicher (daten.json) |
| `ctx.karte(titel)` | Karte in der rechten Spalte, gibt das Inhalts-Element zurück |
| `ctx.melden({ titel, text, anzeige })` | Meldung: erscheint rechts, Luzzy sagt `text` laut (Ruhezeit beachtet) |
| `ctx.vorlesen(text)` | Luzzy liest etwas vor |
| `ctx.luzzy(text, { anzeige, vorlesen, ansichtWechseln })` | schickt Luzzy einen Auftrag in der Zentrale; `anzeige` = was im Gespräch erscheint |
| `ctx.kontext(() => text)` | Text, den andere Plugins abfragen können (z. B. Termine für Routinen) |
| `ctx.kontextVon(id)` | Kontext eines anderen Plugins holen, z. B. `ctx.kontextVon('kalender')` |
| `ctx.begruessung(() => satz)` | Kurzer Satz für Luzzys Begrüßung beim Start (z. B. Termine heute, Wetter) |
| `ctx.kontextFuer(text)` | Kontext aller Plugins, deren Stichwörter im Text vorkommen (siehe unten) |
| `ctx.eingabeFilter(fn)` | Eingaben abfangen: `fn(text)` gibt `{ text, anzeige, vorlesen }` oder `null` zurück |
| `ctx.knoepfe([{ name, titel, fn }])` | Knöpfe über der Eingabe in der Zentrale setzen |
| `ctx.bereit()` | Ist Luzzy gerade frei (verbunden, antwortet nicht)? |
| `ctx.oeffnen()` | öffnet den Bereich des Plugins |
| `ctx.aufrufen(name, ...)` | ruft eine Funktion aus haupt.js auf |
| `ctx.maskieren(text)` | Text sicher in HTML einsetzen |
| `ctx.markdownZuHtml(text)` | Markdown anzeigen |

### haupt.js (optional)

```js
module.exports = (ctx) => {
  ctx.bereitstellen('hallo', async (name) => `Hallo ${name}`)
  // ctx.datenLaden(), ctx.datenSpeichern(obj) gibt es hier auch
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

## Stichwörter: Daten automatisch an Luzzy

In `plugin.json` kann ein Plugin Stichwörter angeben (regulärer Ausdruck, Groß-/Kleinschreibung egal):

```json
"luzzy": { "stichwoerter": "wetter|regen|temperatur" }
```

Kommt eins davon in Felix' Nachricht oder im Prompt einer Routine vor, hängt Jarves-OS den Text aus `ctx.kontext()` unsichtbar an.
Luzzy muss dann nicht selbst suchen. Genutzt von: Kalender (Termine), Wetter.
