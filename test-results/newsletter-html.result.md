# Newsletter-Plugin: Mail-HTML statt Bausteinen, mit mitlaufender Vorschau

**Datum:** 2026-11-11 (erster Stand 2026-11-10)
**Gegenstand:** `plugins/newsletter/html-mail.js` (neu), HTML als einziger Inhalt in
`kampagnen.js`, `vorlagen.js` und `automationen.js`, die gemeinsame Hülle in
`bausteine.js`, die Aufrufe in `haupt.js` (`mailVorschau`, `startHtml`, eine Baustelle
`mailBauenAus` für jede Mail) und die Editoren für **Kampagnen, Vorlagen und
Automationsschritte** in `ansicht.js` mit `stil.css`.

**Testbefehl:**

```
node --test tests/newsletter-html.test.js tests/newsletter-vorlagen.test.js tests/newsletter-kampagnen.test.js
```

**Regressionslauf über das ganze Plugin:**

```
node --test tests/newsletter-automationen.test.js tests/newsletter-bausteine.test.js tests/newsletter-drossel.test.js tests/newsletter-imap.test.js tests/newsletter-kampagnen.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-versand.test.js tests/newsletter-vorlagen.test.js tests/newsletter-warteschlange.test.js tests/newsletter-zugang.test.js tests/newsletter-html.test.js
```

**Fixture:** keine Datei. Alle Inhalte sind erfunden (`beispiel.de`, „Beispielshop GmbH,
Musterweg 1"). Keine Verbindung nach außen, keine Mail, keine geschriebene Datei.

**Ergebnis: PASS — 75 von 75 Tests in den drei Dateien, 270 von 270 im Regressionslauf.**
Gesamtstand: **270 Tests in zwölf Dateien.**

## Stand 2026-11-11: die Bausteine sind aus der Bedienung verschwunden

Gewünscht: „entferne die Bausteine überall". Umgesetzt für **Kampagnen, Vorlagen und
Automationsschritte** — überall ein Code-Feld, kein Umschalter, keine Karten. Die Abschnitte
weiter unten beschreiben den Zwischenstand mit zwei Wegen; was dort über Umschalter,
„Bausteine übernehmen" und das Ablehnen von HTML-Vorlagen in Automationsschritten steht,
gilt nicht mehr.

Was bewusst **nicht** entfernt wurde, und warum:

- **`bausteine.js` als Werkzeug dahinter.** Ohne es gäbe es kein Mail-Gerüst, keinen Fuß
  mit Abmeldelink und Impressum und keine Startmail. Neue Kampagnen und Vorlagen beginnen
  nicht leer, sondern mit dieser Startmail als Quelltext.
- **Luzzys Weg über Bausteine.** Sie schreibt weiter kein Markup, sondern liefert geprüfte
  Bausteine als JSON; Vendo macht daraus Tabellen-HTML und legt es ins Code-Feld. Getestet
  für Kampagne und Vorlage, mit dem Hinweis, dass das bisherige HTML ersetzt wurde.
- **Gespeicherte Bausteine.** Nichts wird gelöscht. Eine Kampagne, Vorlage oder ein
  Automationsschritt ohne `html` wird aus den Bausteinen gebaut (`htmlVon`) — beim Anzeigen,
  Prüfen, in der Vorschau und beim Versand. Getestet: alte Kampagne und alte Vorlage gelten
  nicht als leer, vorhandenes HTML hat Vorrang.

Im Browser angesehen (Prüfseite mit erfundenen Daten, siehe unten): Kampagne, Vorlage und
Automationsschritt zeigen nur noch Code, keinen Umschalter und keine Baustein-Knöpfe; die
Vorschau folgt beim Tippen; keine Meldung in der Konsole. Dabei zwei Kleinigkeiten
behoben: ein doppelter „Als Vorlage"-Knopf in der Kampagne und das zu schmale, inline
stehende Betreff-Feld im Automationsschritt.

## Worum es geht

Der Kampagnen-Editor kannte nur Bausteinkarten: untereinander ein Feld je Angabe, und die
Vorschau war ein Knopf, der einen Block unter dem Formular aufklappte. Wer fertiges
Mail-HTML hat, konnte es gar nicht verwenden.

Jetzt hat der Editor einen Umschalter **Bausteine / HTML-Code** und rechts eine Spalte, in
der die Mail beim Tippen mitläuft.

- **Beides bleibt gespeichert.** Der Modus hängt an der Kampagne (`modus`, `html`,
  `htmlRahmen`). Wer von HTML zurück auf Bausteine wechselt, findet seine Bausteine
  unverändert vor und umgekehrt. Kampagnen aus der Zeit davor haben kein Feld und gelten
  weiter als Bausteine (`modusVon`).
- **Zwei Rahmen-Arten.** Voreinstellung: der eigene Inhalt kommt in Vendos 600-px-Fläche
  mit den Markenfarben. Abgewählt: ein fremdes Dokument (Agenturvorlage, Baukasten) bleibt
  so, wie es ist, und bekommt den Fuß vor `</body>` eingesetzt.
- **Der Fuß ist nicht verhandelbar.** In beiden Rahmen-Arten geprüft: Abmeldelink als
  `mailto:…?subject=Abmeldung` und Impressum stehen in der Mail. Gegenprobe mit
  `mailBauen`: ohne Abmeldeweg wird die Kampagnenmail nicht gebaut.
- **Gesäubert wird beim Bauen, nicht beim Speichern.** Im Feld bleibt stehen, was eingetippt
  wurde; entfernt werden Skripte (samt Inhalt), `iframe`/`object`/`embed`, Formulare und
  Formularfelder, `svg`, `on…`-Attribute, `srcdoc`, automatische Weiterleitungen und jede
  Adresse außer `http(s)`, `mailto`, `tel`, `cid`, Ankern und eingebetteten Bildern
  (`data:image/…`). `data:text/html` wird zu `#`. Die Vorschau sagt an, was weg ist.
- **Was bleiben muss, bleibt:** Tabellen, Inline-CSS, Bilder, `<style>`-Blöcke und Outlooks
  Bedingungskommentare (`<!--[if mso]>`) überstehen das Säubern unverändert — ohne sie sieht
  gekauftes Mail-HTML in Outlook anders aus als gedacht.
- **Platzhalter wirken auch im HTML** und werden dabei maskiert: `{{nachname}}` mit einer
  spitzen Klammer darf das Markup nicht aufbrechen. Unbekannte Platzhalter bleiben stehen,
  damit man sie beim Testversand sieht.
- **Eine Stelle für beide Wege.** `kampagneMailBauen` in `haupt.js` baut das HTML für
  Vorschau, Testmail und echten Versand aus der Warteschlange. Damit kann die Testmail nicht
  mehr anders aussehen als das, was bei den Leuten ankommt.
- **Der Hintergrundteil wird im Test wirklich gestartet** (erfundene Daten im Speicher, kein
  Electron, keine Datei, kein Netz): Modus umstellen und zurück, Vorschau einer gespeicherten
  Kampagne, `mailVorschau` ohne zu speichern und `kampagneBausteineAlsHtml` laufen über die
  echten Plugin-Aufrufe.
- **Länge begrenzt:** höchstens 200 000 Zeichen, sonst bläht ein eingebettetes Bild die
  Plugin-Daten auf.

## Vorlagen gehen denselben Weg

Der Vorlagen-Editor ist jetzt genauso gebaut wie der für Kampagnen: links Code, rechts
**Vorlagen-Details** (Name, Wofür, Inhalt, Anwenden) über der mitlaufenden Vorschau,
derselbe Umschalter Bausteine/Code, dasselbe Autospeichern, „← Vorlagen" zurück zur Liste.
Geteilter Code statt zweier Fassungen: `inhaltFlaeche`, `vorschauSpalte`,
`vorschauAuffrischen` und `sicherungAnstossen` bedienen beide Reiter, `offenerEditor()`
sagt, welcher gerade offen ist.

Was dabei nicht still passieren darf, ist geprüft:

- **Der Weg zum Inhalt wandert mit.** Eine HTML-Vorlage stellt die Kampagne beim Anwenden
  auf HTML um (`inhaltVon`); eine Bausteine-Vorlage stellt sie zurück. Das jeweils andere
  bleibt gespeichert.
- **Automationsschritte bauen aus Bausteinen.** Eine HTML-Vorlage auf einen Schritt
  anzuwenden wird **abgelehnt** statt still auf die Bausteine der Vorlage zurückzufallen —
  sonst ginge eine andere Mail raus als die, die man gesehen hat.
- **Luzzy entwirft Bausteine.** Ein Entwurf stellt eine HTML-Vorlage (und ebenso eine
  HTML-Kampagne) auf Bausteine zurück und sagt es in der Meldung; das HTML bleibt liegen.
- **Als Vorlage sichern** nimmt aus einer HTML-Kampagne das HTML mit.

## Oberfläche

- **Zwei Flächen statt eines langen Formulars**, nach dem Vorbild, das Felix gezeigt hat:
  links **Code** mit Zeilennummern über die volle Höhe, rechts die Karte **E-Mail-Details**
  (An, Betreff, Vorschautext, Name, Von) und darunter die gerenderte Mail. Unter 1240 px
  rutscht die rechte Spalte unter den Code.
- Die Kampagnenliste steht nicht mehr daneben: solange keine Kampagne offen ist, füllt sie
  die Fläche als Kachelliste; in der Kampagne führt **„← Kampagnen"** zurück. Zeitpunkt,
  Luzzy und Löschen liegen unter den Flächen.
- Vorschau mit Umschalter **Rechner / Handy** (390 px) und ausklappbarem Textteil. Sie wird
  nur erneuert, wenn sich das HTML wirklich geändert hat — sonst springt die Scrollstelle
  bei jedem Tastendruck.
- **Speichern von selbst** 1,2 Sekunden nach dem letzten Tastendruck und beim Reiterwechsel,
  mit Anzeige „ungespeichert / gespeichert" im Kopf. Vorher ging Arbeit verloren, wer den
  Reiter wechselte, ohne zu speichern.
- Zwei Startpunkte statt leerem Feld: **„Bausteine übernehmen"** schreibt den aktuellen
  Baustein-Stand als Quelltext ins Feld, **„Beispiel einfügen"** eine schlichte
  Tabellenvorlage mit `{{vorname}}`. Beide fragen nach, bevor sie etwas überschreiben.
- Die Tabulatortaste rückt im Code-Feld ein, statt aus dem Feld zu springen.
- Luzzy entwirft weiterhin nur Bausteine; im HTML-Modus steht an ihrer Stelle der Hinweis,
  wie man den Entwurf nach HTML holt.

## Die Oberfläche doch gesehen — und ein Fehler, der nur so auffiel

Für den ersten Blick ohne Electron habe ich `ansicht.js` mit Vendos echtem `style.css` und
dem Plugin-Stil in einem Browser geladen und `ctx` durch Platzhalter ersetzt (erfundene
Kampagne, erfundene Antworten; nichts geht nach draußen, nichts wird geschrieben). Die
Hilfsdateien dafür liegen außerhalb des Projekts und sind nicht Teil der Änderung.

Dabei blieb die Vorschau **weiß**. Die Ursache: einem `<iframe sandbox="">`, das mit leerem
`srcdoc` entstanden ist, später ein neues `srcdoc` zuzuweisen lädt nichts nach — weder über
die Eigenschaft noch über `setAttribute`. Dasselbe HTML zog sofort, sobald der Rahmen aus
Markup neu eingesetzt wurde. Gegenprobe mit vier Rahmen nebeneinander (ohne `sandbox`, leer,
`allow-popups`, `allow-same-origin`): alle zeigten ihren Inhalt — es liegt nicht am
Sandkasten, sondern am Nachladen. `vorschauFuellen` ersetzt den Rahmen deshalb, statt ihn zu
beschreiben.

Danach geprüft und in Ordnung, in **beiden** Reitern: Liste und Eintrag öffnen, Code links
mit Zeilennummern, Details rechts, die Mail in der Vorschau, **Tippen ändert die Vorschau**
(eine eingefügte Zeile erschien jeweils in der Mail), Umschalter Handy, Wechsel auf
Bausteine und zurück (das HTML stand unverändert wieder da), Autospeichern („gespeichert"
im Kopf), „← Kampagnen" und „← Vorlagen". Keine Meldung in der Konsole.

## Die Handy-Vorschau zeigte einen echten Fehler in der Mail

Gemeldet: „bei Vorschau Handy passt das Format nicht". Nachgemessen in einem 390-px-Fenster:
die Mail war **628 px breit** und wurde rechts abgeschnitten. Das lag nicht an der Vorschau,
sondern am Mail-Gerüst selbst — die Mail wäre auf jedem Telefon so angekommen.

Ursache: die 600-px-Fläche stand als `width="600" style="width:600px;max-width:100%"` in
einer Tabellenzelle. Eine **prozentuale** Höchstbreite rechnet der Browser dort nicht aus,
weil die Zellbreite selbst vom Inhalt abhängt — die Angabe wird verworfen und die Tabelle
bleibt bei 600 px. Jetzt steht dort `width="100%" style="width:100%;max-width:600px"`, also
eine **absolute** Höchstbreite, die greift. Outlook kennt `max-width` überhaupt nicht und
bekommt seine feste 600-px-Tabelle über einen Bedingungskommentar (`<!--[if mso]>`).

Gemessen nach der Änderung, mit einer echten, von `mailAus` gebauten Mail:
`scrollWidth` gleich `clientWidth` bei 320, 390 und 742 px — nichts läuft mehr seitlich über.
Der Test „die Fläche ist mitgehend gebaut" hält das fest. Gleicher Umbau im Fuß, den
`html-mail.js` an fremde Dokumente hängt.

Die Handy-Bühne zeigt jetzt außerdem 390 × 660 px mit dunklem Rand, damit zu sehen ist, wo
das Gerät aufhört.

## Nebenbei behoben

Der **Kampagnenname wurde beim Speichern nie mitgeschickt**: `form.name` ist die eigene
Eigenschaft des Formulars (der Name des Formulars, hier leer) und verdeckt das gleichnamige
Eingabefeld. Gelesen wird jetzt über `form.elements.namedItem('name')`. Dieselbe Stelle im
Vorlagen-Editor ist unberührt geblieben — sie gehört nicht zu dieser Änderung.

## Lauf in der echten App (2026-11-11)

**Befehl:** Vendos Oberflächen-Testmodus mit einem rein lesenden Prüfskript (liegt im
Scratchpad der Sitzung, nicht im Projekt) und einem Bildschirmfoto, danach beendet sich
die App von selbst:

```
$env:VENDO_TEST_JS_NACH = '14000'
$env:VENDO_TEST_JS = "import('file:///<scratchpad>/html-pruef.mjs').then(m => m.lauf())"
$env:VENDO_SCREENSHOT = '<scratchpad>/vendo-kampagne.png'; $env:VENDO_SCREENSHOT_NACH = '32000'
npm start
```

Das Skript tippt nichts, speichert nichts und legt nichts an. Weil ein Reiterwechsel bei
offener Kampagne speichert, öffnet es genau eine Kampagne und zwar zuletzt. Gemeldet
werden nur Zählwerte, keine Inhalte aus den lokalen Daten.

**Ergebnis: PASS.**

- Die vorhandene Kampagne stammt aus der Zeit der Baustein-Oberfläche und öffnet im
  Code-Feld **mit Inhalt** (26 Zeilen) — die Umwandlung über `htmlVon` greift an echten
  Daten.
- Kein Umschalter, keine Bausteinkarten. Detailzeilen: An, Betreff, Vorschautext, Name, Von.
- Die Vorschau enthält eine fertige Mail mit Abmeldelink und dem mitgehenden Gerüst
  (`max-width:600px`).
- Keine Fehlermeldung in der Oberfläche (`console.error`, `window.onerror`, Promise).
- Das Testfenster ist 960 px breit; dort stehen Details und Vorschau **unter** dem Code
  (Umbruch unter 1240 px), wie vorgesehen.

**Nicht abgedeckt in diesem Lauf:** Automationen und Vorlagen gibt es in den lokalen Daten
noch nicht — dort war nichts zu öffnen. Beide Editoren sind nur auf der Prüfseite mit
erfundenen Daten geprüft (siehe oben); sie teilen sich den Code mit der Kampagne.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **Speichern und Versand in der echten App.** Absichtlich nicht ausgelöst: das Prüfskript
  sollte keine echten Daten schreiben und keine Mail verschicken. Abgedeckt sind beide Wege
  durch die Tests gegen den echten Hintergrundteil mit erfundenen Daten.
- **Wie das HTML in echten Mailprogrammen ankommt.** Outlook, Gmail und das Handy zeigen
  erst nach einer Testmail, ob eine fremde Vorlage im Rahmen-Modus hält. `htmlSaeubern`
  verspricht nur, nichts Gefährliches durchzulassen — nicht, dass jedes gekaufte Template
  überall gleich aussieht.
