# Newsletter-Plugin: Mail bauen, Versand, Protokoll

**Datum:** 2026-11-09
**Gegenstand:** Phase 1, zweiter Teil — Aufbau einer Mail (Kopfzeilen, HTML- und Textteil,
Abmeldeweg), Versand einer einzelnen Mail und das Versandprotokoll. Geprüft wird die Logik
in `plugins/newsletter/haupt.js` ohne SMTP-Verbindung.

**Testbefehl:**

```
node --test tests/newsletter-versand.test.js
```

Dazu erneut der Test des vorigen Schritts, der weiterhin durchläuft:

```
node --test tests/newsletter-zugang.test.js
```

**Fixture:** keine Datei. Der Test baut sich seine Daten selbst und schreibt das Protokoll in
einen frischen Ordner unter dem Temp-Verzeichnis (`fs.mkdtempSync`), der danach wieder
gelöscht wird — nie in `daten/`. Nur erfundene Adressen (`beispiel.de`).

**Ergebnis: PASS — 26 von 26 Tests** (Versand), **19 von 19** (Zugang, unverändert)

Abgedeckt:

- **Textteil ableiten** (`textAusHtml`): Absätze und `<br>` werden zu Umbrüchen, Links
  behalten ihre Adresse im Klartext (`Zum Shop (https://…)`, bei `mailto:` ohne Präfix),
  Listen werden zu Strichen, Entities aufgelöst, `<script>`, `<style>` und Kommentare
  verschwinden, leere Eingaben ergeben einen leeren Text statt eines Fehlers.
- **Mail bauen** (`mailBauen`): Absender mit und ohne Anzeigename, Empfänger getrimmt und
  kleingeschrieben, Textteil wird abgeleitet oder übernommen, `Reply-To` nur wenn
  eingestellt.
- **Abmeldeweg wird erzwungen:** Eine Kampagnenmail ohne Abmeldelink im Inhalt wird nicht
  gebaut; mit Abmeldelink wird der `List-Unsubscribe`-Header gesetzt (`mailto:`, weil ein
  Link einen erreichbaren Server bräuchte). Eine Testmail bekommt bewusst keinen Header, weil
  sie keine Werbung ist.
- **Header-Einschmuggeln:** Zeilenumbrüche im Betreff und in der Empfängeradresse werden
  abgelehnt. Ohne das ließe sich über `Hallo\r\nBcc: fremd@…` ein eigener Empfänger
  einschleusen.
- **Pflichtfelder und Grenzen:** fehlender Empfänger, Betreff oder Inhalt, Betreff über 200
  Zeichen, fehlendes Absender-Postfach.
- **Protokoll:** Adresse steht nur gekürzt darin, es gibt kein Feld für den Mailtext, Betreff
  und Fehlertext werden bei 200 Zeichen gekappt; Dateiname nach Monat
  (`protokoll-2026-03.ndjson`); Ordner wird angelegt, Zeilen werden angehängt; Lesen gibt die
  neuesten zuerst und hält die gewünschte Anzahl ein; kaputte Zeilen und fremde Dateien
  werden übersprungen; ein nicht beschreibbarer Pfad gibt `null` zurück, statt zu werfen —
  ein Protokollfehler darf den Versand nicht aufhalten.
- **Fehlertexte:** `450 Mail send limit exceeded` wird als Stundenlimit des Postfachs erkannt.

**Zusätzliche Prüfung: Aufbau des Plugins**

```
node -e "const path=require('path');const w=require('./plugins/werkstatt/haupt.js');const e=w.pruefen('newsletter',{ordnerBasis:path.join(process.cwd(),'plugins')});console.log(JSON.stringify(e,null,2))"
```

Ergebnis: keine Fehler. Gemeldete Rechte, alle erwartbar:

- `achtung` — Hintergrundteil läuft mit vollen Rechten auf dem PC.
- `achtung` — schreibt Dateien außerhalb der eigenen Plugin-Daten: das sind die
  Protokoll-Monatsdateien unter `daten/plugins/newsletter/`.
- `achtung` — nutzt Electron direkt: `safeStorage` für das verschlüsselte Passwort.
- `gefahr` — „Berührt Zugangsdaten": trifft auf das Wort „Passwort" zu. Das Plugin liest
  keine Hermes-Datei und keine `.env`.

`internet`: leer — keine fest verdrahteten Adressen im Code.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Der tatsächliche Versand.** `mailSenden` baut eine SMTP-Verbindung zu IONOS auf; das
  braucht gültige Zugangsdaten und die laufende App. Getestet ist alles davor: was gebaut
  wird, welche Kopfzeilen entstehen, was protokolliert wird.
- **Darstellung in Mailprogrammen.** Ob eine Mail in Outlook, Gmail und auf dem Handy sauber
  aussieht, zeigt erst ein echter Testversand. Für Kampagnen kommt das mit den geprüften
  Bausteinen in Phase 3.
- **Die Oberfläche.** Testmail-Formular, Textvorschau und Protokolltabelle wurden in Vendo
  noch nicht geöffnet.
- **Drossel und Warteschlange** gibt es noch nicht: aktuell geht genau eine Mail pro Klick
  raus. Ein Massenversand ist damit nicht möglich und auch nicht vorgesehen.
