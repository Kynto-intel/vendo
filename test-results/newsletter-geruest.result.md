# Newsletter-Plugin: Gerüst

**Datum:** 2026-11-09
**Gegenstand:** Aufbau- und Syntaxprüfung des neuen Plugins `plugins/newsletter/` (Gerüst:
`plugin.json`, `ansicht.js`, `stil.css`, `README.md`). Es gibt noch keine Logik und keinen
Versand, deshalb noch keine Verhaltenstests.

**Testbefehl:**

```
node -e "const path=require('path');const w=require('./plugins/werkstatt/haupt.js');const e=w.pruefen('newsletter',{ordnerBasis:path.join(process.cwd(),'plugins')});console.log(JSON.stringify(e,null,2))"
```

Genutzt wird die Prüffunktion der Plugin-Werkstatt (`plugins/werkstatt/haupt.js`) mit
`ordnerBasis` auf `plugins/` statt auf den Werkstatt-Ordner. Keine Fixture nötig, die
Prüfung liest nur die Dateien des Plugins und ändert nichts.

**Ergebnis: PASS**

- `fehler`: leer.
- `stufe`: `gefahr` — ausgelöst vom Muster „Berührt Zugangsdaten oder Hermes-Einstellungen",
  das auf das Wort „Passwort" im Text der Ansicht anspringt. Bei einem Plugin, das ein
  Postfach ansprechen soll, ist das erwartbar und kein Mangel. Es liegt kein Zugriff auf
  Hermes-Dateien oder `.env` vor.
- Erkannte Dateien: `ansicht.js`, `plugin.json`, `README.md`, `stil.css`.
- Geprüft wurden dabei: gültige `plugin.json` (id passend zum Ordner, Name, erlaubtes
  Symbol `message`), Vorhandensein und Syntax von `ansicht.js`, vorhandenes
  `export async function starten(ctx)`, erlaubte Dateinamen, keine Unterordner,
  Dateigrößen.

**Beobachtung beim ersten Durchlauf**

Der erste Prüflauf schlug mit zwei Fehlern fehl: „Datei „PLAN.md" gehört nicht in ein
Plugin." und dasselbe für `STAND.md`. Die Werkstatt lässt in einem Plugin nur
`plugin.json`, `ansicht.js`, `stil.css`, `haupt.js`, `README.md` und `LIESMICH.md` zu und
keine Unterordner (`ERLAUBT` in `plugins/werkstatt/haupt.js`). Plan und Stand wurden
daraufhin in `plugins/newsletter/README.md` zusammengeführt; die ursprünglich geplanten
Moduldateien und der Unterordner für HTML-Bausteine sind als offene Entscheidung in dieser
README festgehalten.

**Nicht geprüft**

- Das Plugin wurde in Vendo noch nicht geöffnet: dass der Bereich in der Leiste erscheint,
  die Reiter umschalten und die Datenstruktur beim ersten Öffnen sauber angelegt wird,
  steht noch aus (BLOCKED in dieser Umgebung — braucht einen Start der Electron-App).
- Kein Versand, keine Shopify-Abfrage, keine Automation vorhanden, also nichts davon
  getestet.
