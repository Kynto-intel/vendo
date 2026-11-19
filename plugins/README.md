# Vendo-Plugins

Jeder Ordner hier ist ein Plugin. Vendo lädt beim Start alle Plugins und zeigt sie als eigenen
Bereich links in der Leiste (vor "System"). Neues Plugin = neuer Ordner, Vendo neu starten.

## Aufbau

```
plugins/
  mein-plugin/          Ordnername = id (kleine Buchstaben, Zahlen, Bindestrich)
    plugin.json         Pflicht: Name, Beschreibung, Bereich
    ansicht.js          Oberfläche (JavaScript-Modul)
    stil.css            Pflicht: eigene Plugin-Styles
    haupt.js            optional: Hintergrundteil (Node, z. B. für Dateien oder Internet)
    (Speicher)          verwaltet Vendo in PostgreSQL (vendo.plugin_daten), nicht im Plugin-Ordner
```

### plugin.json

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "beschreibung": "Kurz, wofür es da ist.",
  "bereich": { "name": "Mein Plugin" },
  "symbol": "box",
  "aktiv": true
}
```

`"aktiv": false` schaltet ein Plugin ab, ohne es zu löschen.

`"austausch": true` (z. B. Kalender, Aufgaben): Vendo schreibt zusätzlich eine
Kopie nach `daten/austausch/<id>.json`. Luzzys Werkzeuge lesen und schreiben diese Datei; Vendo liest jede fremde Änderung
sofort (und beim Start) ein und meldet sie über `ctx.daten.beiAenderung`. Die Datei ist nie das Original.

`symbol` ist Pflicht und bestimmt das Sidebar-Icon. Wähle genau einen passenden Schlüssel aus dieser geprüften Auswahl:
`checklist`, `target`, `message`, `calendar`, `star`, `repeat`, `cloud-sun`, `tools`, `receipt`, `box`, `book`, `chart`, `clock`, `folder`, `heart`, `search`, `shield`.
Unbekannte Werte werden nicht als SVG interpretiert; die Werkstatt-Prüfung weist sie zurück.

Jedes Plugin muss eine eigene `stil.css` enthalten. Plugin-spezifische Regeln gehören in diese Datei und sollen nicht
die Oberflächen anderer Plugins verändern.

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
| `ctx.daten.laden()` / `ctx.daten.speichern(obj)` | eigener Speicher in PostgreSQL (`vendo.plugin_daten`). Startdaten kann ein neues Plugin als `daten.json` im Plugin-Ordner mitbringen; sie gelten nur, solange die Datenbank nichts für das Plugin hat. Solange die Datenbank nicht geladen ist, warten beide; scheitert sie, kommt ein Fehler, nie ein leerer Stand |
| `ctx.karte(titel)` | Karte in der rechten Spalte, gibt das Inhalts-Element zurück |
| `ctx.melden({ titel, text, anzeige })` | Meldung: erscheint rechts, Luzzy sagt `text` laut (Ruhezeit beachtet) |
| `ctx.vorlesen(text)` | Luzzy liest etwas vor |
| `ctx.luzzy(text, { anzeige, vorlesen, ansichtWechseln })` | schickt Luzzy einen Auftrag in der Zentrale; `anzeige` = was im Gespräch erscheint |
| `await ctx.fragen(text)` | fragt Luzzy etwas und gibt **die Antwort als Text zurück**. Läuft in der eigenen Unterhaltung „Vendo Plugins“, erscheint also nicht im Gespräch in der Zentrale. Immer nur eine Anfrage auf einmal; wirft bei Zeitüberschreitung (3 Minuten) oder wenn schon eine läuft |
| `ctx.kontext(() => text)` | Text, den andere Plugins abfragen können (z. B. Termine für Routinen) |
| `ctx.kontextVon(id)` | Kontext eines anderen Plugins holen, z. B. `ctx.kontextVon('kalender')` |
| `await ctx.bestaetigen(text, { titel, ja, gefahr })` | Rückfrage im Vendo-Design (statt `confirm`), liefert true/false |
| `ctx.hinweis(text, { titel })` | Hinweisfenster im Vendo-Design (statt `alert`) |
| `ctx.begruessung(() => satz)` | Kurzer Satz für Luzzys Begrüßung beim Start (z. B. Termine heute, Wetter) |
| `ctx.kontextFuer(text)` | Kontext aller Plugins, deren Stichwörter im Text vorkommen (siehe unten) |
| `ctx.eingabeFilter(fn)` | Eingaben abfangen: `fn(text)` gibt `{ text, anzeige, vorlesen }` oder `null` zurück |
| `ctx.befehl(fn)` | Befehl selbst beantworten, sofort und ohne Hermes: `fn(text, { gesprochen })` gibt die Antwort (Luzzy sagt sie), `true` (erledigt, nichts sagen) oder `null` (kein Befehl) zurück |
| `ctx.knoepfe([{ name, titel, fn }])` | Knöpfe über der Eingabe in der Zentrale setzen |
| `ctx.bereit()` | Ist Luzzy gerade frei (verbunden, antwortet nicht)? |
| `ctx.nichtStoeren(bis)` | „Nicht stören“ bis zum Zeitpunkt `bis` (ms) setzen, `0` beendet es (Meldungen nur in der Liste) |
| `ctx.oeffnen()` | öffnet den Bereich des Plugins |
| `ctx.aufrufen(name, ...)` | ruft eine Funktion aus haupt.js auf |
| `ctx.pfadVon(datei)` | Dateipfad einer gezogenen oder gewählten Datei (File-Objekt), z. B. um sie an haupt.js zu geben |
| `ctx.maskieren(text)` | Text sicher in HTML einsetzen |
| `ctx.markdownZuHtml(text)` | Markdown anzeigen |

### haupt.js (optional)

```js
module.exports = (ctx) => {
  ctx.bereitstellen('hallo', async (name) => `Hallo ${name}`)
  // ctx.ordner: Plugin-Ordner, wie Vendo ihn sieht (auch wenn plugins\<id> eine Verknüpfung auf einen anderen Ordner ist)
  // ctx.datenLaden(), ctx.datenSpeichern(obj) gibt es hier auch (Datenbank, siehe ctx.daten); haupt.js startet erst,
  // wenn die Plugin-Daten geladen sind.
  // ctx.festschreiben(): wartet, bis der Stand in der Datenbank geschrieben ist
  // ctx.datenbank: PostgreSQL für eigene Tabellen (nur wenn Docker läuft, vorher ctx.datenbank.bereit() prüfen):
  //   ctx.datenbank.migrieren([{ version: 1, sql: 'CREATE SCHEMA IF NOT EXISTS <plugin_id> …' }])
  //   await ctx.datenbank.abfrage(sql, werte), await ctx.datenbank.transaktion(async (c) => …), ctx.datenbank.beiBereit(fn)
  // ctx.vault: in den Vault schreiben, nur in Donnerwolf-Shop\Vendo\ und ohne zu überschreiben:
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
| `buchhaltung` | Buchhaltung für den Shop: holt Shopify-Bestellungen (Umsatzbeleg als PDF) und Shirtigo-Bestellungen mit Original-Rechnung, liest PDF-Rechnungen lokal ohne Upload, legt alles in ein schreibgeschütztes Belegarchiv mit Prüfkette, Zeitstempel und verschlüsselter USB-Sicherung. Zeigt Gewinn je Bestellung, Umsatz je Jahr, Kleinunternehmergrenzen und Steuerstatus je Zeitraum. Unter „Meine Angaben“: Firmendaten, persönliche Angaben (nur verschlüsselt gespeichert), ELSTER-Übersicht zum Abtippen, ausblendbare Bereiche und Export eines Jahresarchivs als ZIP. Führt zusätzlich einen Index in PostgreSQL, wenn Vendos Datenbank läuft. Eigenes Repository [vendo-buchhaltung](https://github.com/Kynto-intel/vendo-buchhaltung), nicht in Vendo enthalten: nach `plugins\buchhaltung` klonen oder als Verknüpfung einbinden, darin `npm install`. Läuft mit demselben Code auch eigenständig im Browser |
| `kalender` | Eigener Kalender: Monatsansicht, Termine, Erinnerungen über Luzzy, „Heute“-Karte, liefert Termine an andere Plugins |
| `routinen` | Standardaufgaben mit Auslösewort und eigenem Prompt (Termine werden automatisch angehängt, wenn der Prompt sie erwähnt), Ergebnis (vorlesen, speichern), Zeitplan und Knopf über der Eingabe |
| `gedanken` | Gedankenspeicher: „Merk dir: …“ per Sprache oder Tippen, Liste mit erledigt/löschen, jede Notiz auch im Vault (`Vendo\Gedankenspeicher.md`), Luzzy kennt die offenen Notizen |
| `aufgaben` | To-do-Liste mit Fälligkeit („Neue Aufgabe: … bis Freitag“, „Erledigt: …“), Erinnerung über Luzzy-Meldung, Begrüßung, Kontext für Luzzy, Karte „Aufgaben“ (anfangs aus, Einstellungen → Rechte Spalte) |
| `fokus` | Pomodoro-Timer (Fokus, Pause, lange Pause) mit Hintergrundklang (Rauschen, Regen), in der Fokuszeit „Nicht stören“; „Fokus 50 Minuten“, „Fokus beenden“ |
| `meilensteine` | Bestellungen insgesamt (zählt der Wächter bei Shopify), nächster Meilenstein mit Fortschritt, Liste aller erreichten (gefeierte mit Datum aus `Vendo\Meilensteine.md`) |
| `newsletter` | Newsletter über das eigene IONOS-Postfach (im Aufbau): Postfach-Zugang, Testmail, Versandprotokoll, Drossel mit Stundenbudget, Warteschlange, Kontakte aus Shopify und per CSV mit Abmeldung in beide Richtungen, Kampagnen, Vorlagen und Automationsschritte als Mail-HTML mit mitlaufender Vorschau, Entwurf von Luzzy (`ctx.fragen`) und Zeitplan, Automationen für Warenkorbabbruch und Willkommensserie. Die Newsletter-Texterin (Hermes-Profil `vala-newsletter-texterin-bot`) steuert über ihr Hermes-Plugin `vendo-newsletter` alles im Newsletter außer dem Versand: Kampagnen, Vorlagen, Automationen, Marke, Auswertung; Kampagnen gibt sie zur Freigabe, senden, planen und einschalten tut nur Felix. Links und Bilder müssen echte Adressen aus dem eigenen Shop sein (Vendo liefert Produktadressen und prüft jede vor der Freigabe); Vorlagen tragen markierte Felder und erscheinen im Reiter „Vorlagen“ als gerenderter Ausschnitt. Stand und Bauplan in `plugins/newsletter/README.md` |
| `werkstatt` | Plugin-Werkstatt: Luzzy baut neue Plugins in `vendo\werkstatt\<id>\`, Vendo prüft (Aufbau, `node --check`, Rechte wie Programme starten, Dateien, Internet, Zugangsdaten) und kopiert sie erst nach Felix' Ja nach `plugins\` (altes Plugin nach `backup\`, `daten.json` bleibt) |

**Plugin von Luzzy bauen lassen:** In der Werkstatt beschreiben oder „Bau mir ein Plugin für …“ sagen. Luzzy nutzt dafür
ihren Hermes-Skill `vendo-plugin-werkstatt` (Profil donnerwolf, `skills\productivity\`), prüft sich mit
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
