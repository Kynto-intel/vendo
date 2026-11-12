# Newsletter-Plugin: Kampagnen, Bausteine und die Kernerweiterung ctx.fragen

**Datum:** 2026-11-09
**Gegenstand:** Phase 3 — Bausteine für das Mail-HTML (`bausteine.js`), Kampagnen mit
Zeitplan und KI-Entwurf (`kampagnen.js`), die Einbindung in `haupt.js` und die Erweiterung
von Vendo um `ctx.fragen`.

**Gezielte Nachprüfung am 2026-11-11:** Die Kampagnen-Tests wurden nach dem Verschieben
der Versandzeit-Auswahl in die E-Mail-Details-Karte erneut ausgeführt. Die Auswahl steht
jetzt unter den übrigen Details; die bisherige Planung über den Button „Planen“ bleibt
erhalten. Die Vorlage hat weiterhin keine eigene Versandplanung.

**Befehle:** `node --check plugins/newsletter/ansicht.js` und
`node --test tests/newsletter-kampagnen.test.js`

**Ergebnis der Nachprüfung:** PASS — 23 von 23 Kampagnen-Tests. Zusätzlich geprüft:
CSS-Klammern und Markup-Reihenfolge; die Planung steht am Ende der Kampagnen-Details
und wurde aus der Fußzeile entfernt. Keine App-/Electron-Ansicht geprüft.

**Nachprüfung am 2026-11-11:** Die Vorschau startet in Kampagnen- und Vorlagen-Editor
standardmäßig in der Handy-Ansicht. Beim Öffnen oder Wechseln des Editors sowie beim
Zurückkehren in einen offenen Editor wird die Handy-Ansicht erneut ausgewählt.

**Befehle:** `node --check plugins/newsletter/ansicht.js` und
`node --test tests/newsletter-kampagnen.test.js`

**Ergebnis:** PASS — 23 von 23 Kampagnen-Tests. Initialwert und sechs Rücksetzstellen
statisch geprüft; keine App-/Electron-Ansicht geprüft.

**Nachprüfung am 2026-11-11:** Die Vorschau lässt sich in beiden Editoren nicht mehr
ausblenden. Die Ein-/Ausblenden-Steuerung und ihr Zustand wurden entfernt; die Vorschau
wird beim Zeichnen und bei Eingaben weiter aktualisiert.

**Befehle:** `node --check plugins/newsletter/ansicht.js` und
`node --test tests/newsletter-kampagnen.test.js tests/newsletter-vorlagen.test.js`

**Ergebnis:** PASS — 40 von 40 Tests. Statisch geprüft, dass keine Ausblenden-Aktion oder
Einblenden-Steuerung im Newsletter-Editor übrig ist. Keine App-/Electron-Ansicht geprüft.

**Testbefehle:**

```
node --test tests/newsletter-bausteine.test.js
```

```
node --test tests/newsletter-kampagnen.test.js
```

**Fixture:** keine Datei. Beide Tests bauen ihre Daten selbst, nur erfundene Adressen und
Beispielinhalte. Keine Verbindung nach außen, kein Versand.

**Ergebnis: PASS — 15 von 15 (Bausteine), 20 von 20 (Kampagnen)**

Gesamtstand des Plugins: **148 Tests in acht Dateien, alle bestanden.**

## Bausteine

Der Kern der Prüfung ist, dass das erzeugte HTML nicht aufzubrechen ist und die
Pflichtangaben enthält:

- **Abmeldelink und Impressum sind immer drin** — auch wenn der `fuss`-Baustein in der Liste
  fehlt, wird er angehängt; ist er vorhanden, wird er mit Adresse und Impressum versorgt und
  kommt nur einmal vor. Eine leere, `null`- oder Müll-Liste ergibt trotzdem eine vollständige
  Mail.
- **Inhalte werden maskiert.** `<script>alert(1)</script>` im Text bleibt Text; ein
  `<img src=x onerror=…>` in einer Überschrift wird maskiert und entsteht nicht als Tag.
  Geprüft für Text, Überschrift, Produktname und Knopftext.
- **Nur http(s)- und mailto-Links.** Ein `javascript:`-Link wird verworfen, und ohne gültigen
  Link entsteht der Knopf gar nicht. `data:`-Bildquellen werden ebenfalls abgelehnt.
- **Der Aufbau ist E-Mail-tauglich:** Tabellen mit `role="presentation"`, feste Breite
  600 px, alles Inline-CSS, kein `<style>`-Block, kein Flexbox, kein Grid, kein JavaScript.
- **Unbekannte Bausteinarten werden übergangen**, nicht geraten: `{ art: 'html', … }` landet
  nicht im Markup.
- Absätze entstehen aus Leerzeilen, einfache Umbrüche werden `<br />`; der Kopf nimmt das
  Logo der Marke oder den Namen als Schriftzug; der Vorschautext steht versteckt im HTML.

## Kampagnen

- **Prüfen:** Betreff und Inhalt sind Pflicht, ein Zeilenumbruch im Betreff wird abgelehnt
  (Header-Einschmuggeln).
- **Säubern:** Nur bekannte Bausteinarten und bekannte Felder werden übernommen, höchstens
  40 Bausteine. Ein mitgeschicktes `style`- oder `html`-Feld fällt weg.
- **Personalisierung:** `{{vorname}}`, `{{nachname}}`, `{{name}}` und `{{email}}` werden
  ersetzt, Groß-/Kleinschreibung und Leerzeichen im Platzhalter sind erlaubt. **Unbekannte
  Platzhalter bleiben stehen**, damit sie beim Testversand auffallen, statt still bei den
  Leuten zu landen.
- **Zeitplan:** `faellige` findet geplante Kampagnen, deren Zeit da ist; was länger als 24
  Stunden überfällig ist, gilt als `verpasste` und wird **nicht** mehr gesendet, sondern
  zurück in den Entwurf gestellt. Das ist der Schutz dafür, dass Vendo tagelang aus war.

## Verständigung mit der KI

Das war der Teil, dem ich am meisten misstraue, deshalb ausführlich geprüft:

- **Der Auftrag** nennt Thema, Tonfall, Marke und die erlaubten Bausteinarten mit ihren
  Feldern, verlangt ausschließlich JSON, verbietet HTML ausdrücklich, erlaubt `{{vorname}}`
  und verbietet erfundene Adressen, Preise und Rabatte. Kopf und Fuß soll die KI weglassen.
- **Die Antwort** wird aus reinem JSON, aus einem ```json-Codeblock und aus Text mit Vorrede
  und Nachsatz gelesen. Ein mehrzeiliger Betreff wird zu einer Zeile.
- **Erfundenes wird verworfen:** `{ art: 'rohHtml', html: '<div onclick=…>' }` fällt weg,
  ein `style`-Feld an einem Textbaustein ebenfalls. Bleibt nach dem Säubern nichts übrig,
  gilt die Antwort als unbrauchbar.
- **Unbrauchbare Antworten werden gemeldet, nicht geraten:** „Ich kann das leider nicht.“,
  kaputtes JSON, leere Bausteinliste oder nur unbekannte Arten ergeben `ok: false` mit
  Begründung.

## Kernerweiterung: ctx.fragen

Plugins konnten Luzzy bisher nur einen Auftrag schicken (`ctx.luzzy`); die Antwort landete im
Gespräch, nicht im Plugin. Neu ist `await ctx.fragen(text)` → Antworttext. Geändert wurden
vier Dateien, zusammen 89 Zeilen:

- `src/main/hermes.js` (+74): eigene Unterhaltung „Vendo Plugins“ (Kanal `frage`),
  `frageOeffnen()` und `fragen()`. Es läuft immer nur **eine** Anfrage gleichzeitig — in
  derselben Unterhaltung ließen sich zwei Antworten nicht auseinanderhalten. Zeitgrenze drei
  Minuten; bei Verbindungsverlust wird die Session verworfen und beim nächsten Mal neu
  geöffnet.
- `src/main/main.js` (+7): IPC-Handle `hermes:fragen`, und Ereignisse des Kanals `frage`
  gehen **nicht** an die Oberfläche — sonst wären die Zwischenschritte im Crew-Tab gelandet.
- `src/preload.js` (+4) und `src/renderer/plugin-host.js` (+4): die Brücke bis zum `ctx`.
- `plugins/README.md`: `ctx.fragen` ist im Plugin-Vertrag dokumentiert.

**Regressionsprüfung nach dieser Änderung** — alle bestehenden Plugin-Tests laufen weiter:

```
node --test tests/aufgaben.test.js   (3), cockpit (5), fokus (2), gedanken (3),
kalender (2), meilensteine (3), routinen (3), werkstatt (4), wetter (4)
```

Alle bestanden, keine Ausfälle.

**Zusätzlich geprüft: Integration im Hintergrundteil**

Mit einem Fake-`ctx` geladen: 37 bereitgestellte Funktionen. Eine Kampagne anlegen,
Markenangaben speichern, Bausteine setzen, Vorschau erzeugen — das HTML enthält Abmeldelink
und Impressum, der Betreff ist personalisiert, und der abgeleitete Textteil ist sauber
(`"Beispiel\n\nHi\n\nEin Text\n\nNewsletter abbestellen (…)"`). Der KI-Auftrag wird gebaut
und nennt JSON.

**Dabei gefunden und behoben:** Der Textteil übernahm die Einrückung des HTML-Quelltexts
(`"\n\n      Hi"`). `textAusHtml` in `mail.js` entfernt jetzt führenden Leerraum pro Zeile.

**Beobachtung: ein Test war falsch, nicht der Code**

Der Test „auch Überschriften … werden maskiert" fiel zuerst um, weil er `onerror` nirgends im
HTML sehen wollte. Maskiert steht das Wort aber als **Text** da — das ist genau richtig.
Der Test prüft jetzt, dass kein `<img …onerror…>`-Tag entsteht und die Zeichenfolge maskiert
vorkommt.

## Nachtrag 2026-11-09: Logo im Kopf fehlte

Gemeldet wurde, dass das Logo in der Testmail nicht ankommt. Geprüft an den echten
Markenangaben (`daten/plugins/newsletter.json`): die Logo-Adresse war korrekt gespeichert,
und es existierte **keine Kampagne** — verschickt wurde also die freie Testmail aus dem
Reiter „Zugang", die den Inhalt ohne Kopf und Fuß nimmt. Das ist die Bauart, kein Fehler,
aber aus der Beschriftung nicht erkennbar.

**Dabei ein echter Fehler gefunden.** Nachgestellt, wie der Editor speichert:

```
mailAus(bausteineSaeubern([{ art: 'kopf', logo: '', logoBreite: '', titel: '' }, …]))
→ img vorhanden: false
```

Der Editor schreibt leere Felder als leeren String in den Baustein. In `mailAus` stand
`baustein.logo ?? marke.logo` — und `??` greift nur bei `null`/`undefined`, nicht bei `''`.
Nach dem ersten Speichern einer Kampagne wäre das Logo also auch dort verschwunden.

Behoben:

- `bausteineSaeubern` übernimmt leere Felder nicht mehr (ein leeres Feld soll keinen
  Standardwert überschreiben).
- `mailAus` fällt für Kopf-Logo und Kopf-Titel mit `||` auf die Markenangaben zurück.
- Neu: Knopf **„Beispielmail mit Logo an mich"** bei den Markenangaben (`markeTesten`),
  der die Startvorlage mit Kopf, Logo und Fuß verschickt — ohne dass erst eine Kampagne
  angelegt werden muss. Die Rückmeldung weist darauf hin, dass Gmail und Outlook Bilder von
  unbekannten Absendern oft ausblenden.

Neue Tests: leeres Logo-Feld verschluckt das Marken-Logo nicht, ein eigenes Logo im Baustein
gewinnt gegen das der Marke, ohne beides bleibt der Name als Schriftzug, und
`bausteineSaeubern` lässt leere Felder weg. **Gegenprobe mit den echten Markenangaben:** die
Shopify-CDN-Adresse steht als `<img src="…">` im HTML, das Impressum im Fuß.

Stand: `newsletter-bausteine.test.js` 18, `newsletter-kampagnen.test.js` 21, **185 im Plugin**.

**Nicht geprüft:** ob das Bild im Postfach auch angezeigt wird — das hängt am Mailprogramm
und an der Erreichbarkeit der Shopify-CDN-Adresse, nicht am HTML.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **`ctx.fragen` gegen das echte Hermes.** Ob die Unterhaltung „Vendo Plugins“ so angelegt
  wird, ob `message.complete` den Text wie erwartet liefert und ob Luzzy brauchbares JSON
  schreibt, zeigt erst die laufende App. Der Weg dorthin ist gebaut, das Verhalten bei
  unbrauchbaren Antworten getestet.
- **Darstellung der Mail in echten Programmen.** Das HTML ist nach den bekannten Regeln für
  Outlook gebaut (Tabellen, Inline-CSS, keine modernen Layouts), aber nicht in Outlook,
  Gmail und auf einem Handy angesehen. Das geht nur über echte Testmails.
- **Ein echter Kampagnenversand** über die Warteschlange an mehrere Empfänger.
- **Die Oberfläche:** Kampagnenliste, Baustein-Editor, Vorschau im iframe und der
  Luzzy-Knopf wurden in Vendo noch nicht geöffnet.
