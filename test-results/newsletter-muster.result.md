# Newsletter-Plugin: sechs fertige Vorlagen im Stil der Marke

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand:** `plugins/newsletter/muster.js` (neu) mit sechs Vorlagen, ihre Anbindung in
`plugins/newsletter/haupt.js` (`musterLesen`, `vorlageAusMuster`, Bot-Aktion
`vorlage_aus_muster`, Muster im `ueberblick`), `plugins/newsletter/bots.js`,
`plugins/newsletter/ansicht.js` (Auswahl im Reiter „Vorlagen"),
`plugins/newsletter/stil.css`. Dazu `shoplinks.doppelteProdukte` und eine Lockerung in
`vorlagen.js` (Warenkorb-Platzhalter sind in Vorlagen erlaubt).

**Testbefehl:**

```
node --test tests/newsletter-muster.test.js
```

**Regressionslauf:**

```
node --test tests/newsletter-muster.test.js tests/newsletter-mailpruefung.test.js tests/newsletter-renner.test.js tests/newsletter-fuss.test.js tests/newsletter-bausteine.test.js tests/newsletter-html.test.js tests/newsletter-kampagnen.test.js tests/newsletter-vorlagen.test.js tests/newsletter-versand.test.js tests/newsletter-automationen.test.js tests/newsletter-bots.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-zugang.test.js tests/newsletter-drossel.test.js tests/newsletter-warteschlange.test.js tests/newsletter-imap.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei. Markenangaben, Impressum und Beispielprodukte im Test sind
erfunden. Kein Netzzugriff, keine geschriebene Datei.

**Ergebnis: PASS — 59 von 59 Tests in `tests/newsletter-muster.test.js`, 474 von 474 im
Regressionslauf.** Gesamtstand: **474 Tests in achtzehn Dateien.**
`git diff --check` ohne Befund.

## Warum es die Muster gibt

Felix: „der bot haut mir 3 mal die selben produkte rein, das ist sinnlos so." Vor einem
leeren Feld baut auch eine gute KI nur ein Gerüst und füllt es mit dem, was sie gerade
hat. Mit einer fertigen Vorlage bleibt ihr das, was sie kann: Texte schreiben und echte
Produkte einsetzen.

## Woher der Stil kommt

Gelesen in `Documents/Donnerwolf/Donnerwolf-Shop/00_Kontext`:

- `Design-System.md`: Anthrazit `#1A1A1A`, Gold `#C29A40`, Beige `#D9CBB4` als heller
  Kontrast, dazu Charcoal, Waldgrün, Lederbraun. **Regel: Anthrazit plus Gold immer dabei,
  keine bunten Farben.**
- `Branding.md`: Wikinger, nordisch, **Dark Luxury**, kein Discount-Chaos. Motto „Keine
  Ausreden". Rote Linie: keine bunte Marketing-Optik.
- `Schreibstil.md`: deutsch, klar, direkt, etwas düster. **Keine Gedankenstriche in
  Kundentexten**, keine Hype-Sprache, **keine erfundene Dringlichkeit oder Knappheit**,
  nichts erfinden.

Daraus folgt die wichtigste Entscheidung: **die Muster sind dunkel.** Vendos
Grundeinstellung (heller Grund `#f4f2ee`, brauner Knopf `#8a6a3b`) sieht aus wie jeder
andere Shop. Eigene Farben unter „Marke" gewinnen weiterhin.

## Die sechs

| Kennung | Name | Art | Aufbau |
|---|---|---|---|
| `neue-motive` | Neue Motive | Kampagne | Aufmacher, Band, zwei Produkte, Abschluss |
| `bestseller` | Meistverkauft | Kampagne | Aufmacher, Band, vier Produkte im Raster |
| `ein-motiv` | Ein Motiv, groß | Kampagne | Großes Bild, Geschichte, ein Produkt |
| `warenkorb-erinnerung` | Warenkorb: Erinnerung | Warenkorb | Warenkorb, Knopf, Antworten auf Versand und Rückgabe. **Ohne Rabatt** |
| `warenkorb-letzter` | Warenkorb: letzter Anstoß | Warenkorb | Warenkorb, Knopf, zwei passende Motive |
| `willkommen` | Willkommen | Willkommen | Begrüßung mit `{{vorname}}`, Haltung, zwei Einstiegsmotive |

## Was geprüft wurde

**Je Muster sechs Prüfungen (36 Tests).** Jedes besteht `vorlagePruefen`; keines hat ein
Bild ohne Adresse oder einen Knopf ohne Ziel; keines wiederholt ein Bild oder ein Produkt;
keines enthält einen durchgestrichenen Preis oder ein Rabatt-Abzeichen (der Shop führt
fast keine Vergleichspreise, jeder Streichpreis wäre erfunden); keines bringt Logo, Fuß
oder eine eigene 600-px-Hülle mit; jedes markiert mindestens fünf Stellen mit `data-feld`
samt Hinweis, und die Feldnamen sind eindeutig.

**Die Muster als Satz (4 Tests).** Es sind sechs, mit eindeutigen Kennungen, und sie decken
Newsletter, Warenkorb und Willkommen ab. Ein unbekanntes Muster gibt `null` statt eines
halben HTML. Kein Muster enthält „nur noch heute", „nur für kurze Zeit", „Countdown" oder
„läuft ab in" — die Schreibstil-Regel gegen erfundene Dringlichkeit, geprüft an dem, was
beim Empfänger ankommt (Feld-Hinweise werden vorher entfernt).

**Farben (2 Tests).** Ohne eigene Markenfarben kommt die dunkle Welt der Marke, nicht
Vendos helle Grundeinstellung. Eine eigene Akzentfarbe gewinnt.

**Warenkorb und Willkommen (2 Tests).** Beide Warenkorb-Muster nutzen `{{warenkorb}}`,
`{{summe}}` und `{{warenkorbLink}}`; das Willkommens-Muster redet mit `{{vorname}}` an.

**Die ganze Mail (1 Test).** Aus jedem Muster baut `mailAusHtml` eine vollständige Mail:
Kopf mit Logo davor, Fuß dahinter, und **beim Säubern wird nichts entfernt**. Die
Platzhalter werden davor ersetzt, wie Vendo es auch beim Versand tut — sonst verlöre
`href="{{warenkorbLink}}"` seine Adresse.

**Anlegen (4 Tests).** `musterLesen` gibt sechs; `vorlageAusMuster` legt eine saubere
Vorlage mit Namen und Beschreibung an; ein unbekanntes Muster legt nichts an; der Bot
sieht die Muster im `ueberblick` und legt eines über `vorlage_aus_muster` an, bei falscher
Kennung bekommt er die gültigen genannt.

## Nachtrag 2026-11-12: eigene Dateien, Vorschau, näher am Vorbild

Felix: die Vorlagen gehören in einen eigenen Ordner als .html, die Karten brauchen eine
Vorschau, und keine sieht so gut aus wie sein Vorbild.

**Eigene Dateien.** Je Muster eine Datei in `plugins/newsletter/vorlagen/`, gewöhnliches
HTML. `muster.js` ist nur noch der Lader: Name, Art und Beschreibung liest es aus
Kommentaren im Kopf der Datei, Farben und Beispielprodukte setzt es für `%TOKEN%` ein.
Bewusst `%TOKEN%` und nicht `{{token}}` — letzteres prüft Vendo gegen seine eigene
Platzhalterliste und würde unbekannte sperren. Eine neue Datei im Ordner ist ein neues
Muster, ohne Codeänderung; Felix kann die Dateien selbst ändern.

**Vorschau.** Die Musterkarten nutzen dieselbe verkleinerte Darstellung wie die eigenen
Vorlagen (`nl-mini` mit `srcdoc`). `musterLesen` baut dafür je Muster die ganze Mail mit
Kopf und Fuß und tauscht `cid:` gegen `data:`, wie jede andere Vorschau auch.

**Gestaltung.** Drei Unterschiede zum Vorbild waren im Markup zu beheben: Bilder laufen
jetzt **randlos** über die volle Breite statt mit 32 px Rand (das war der auffälligste
Unterschied), Produktkarten haben einen Rahmen und einen Knopf über die **ganze
Kartenbreite** statt eines schmalen in der Mitte, und es gibt ein siebtes Muster „Drei
Sammlungen" für Bänder in den Shop.

**Was im Markup nicht zu beheben ist.** Das Vorbild lebt von Lifestyle-Fotos mit Menschen,
einem Aufmacher mit eingerechneter Schrift und Sammlungsbändern mit Text im Bild. Das sind
Bilder, keine Auszeichnung — in HTML nicht nachbaubar (siehe „Text im Bild" in
`references/mail-bausteine.md`). Die Muster lassen Platz dafür: `%BILD1%` im Aufmacher und
in den Sammlungsbändern erwartet genau so ein Bild, 1200 px breit.

**Zehn neue Tests:** je Datei ein Muster, Kopfzeilen vollständig, kein Token bleibt
ungefüllt (ein unbekannter bleibt absichtlich stehen), keine Anleitung und kein Kommentar
landet in der Mail, `musterLesen` liefert je Muster eine Vorschau ohne `cid:`. Die Prüfung
auf die äußere Hülle wurde präzisiert: ein randloses Bild darf 600 px breit sein, nur eine
Tabelle mit dieser Höchstbreite wäre die Hülle.

## Entscheidungen

- **Muster im `ueberblick` statt einer Auflistungs-Aktion.** `auftragPruefen` lehnt jede
  Aktion ohne `id` grundsätzlich ab („Die ID fehlt"). Eine Aktion, die ohne `id` eine
  Liste liefert, hätte diese Regel aufweichen müssen. Die Liste steht deshalb dort, wo der
  Bot ohnehin zuerst hinsieht.
- **Beispielprodukte mit erfundenen Bildadressen.** Die Muster brauchen Bilder, damit sie
  Vendos Prüfung bestehen und in der Übersicht wie eine Mail aussehen. Die Adressen zeigen
  auf `donnerwolf.de/cdn/shop/files/donnerwolf-beispiel-N.png` und laden nicht — sie sind
  Platzhalter und werden pro Kampagne ersetzt. Eine echte Produktadresse hier hätte den
  Anschein erweckt, das Muster sei schon fertig.
- **Warenkorb-Platzhalter sind in Vorlagen jetzt erlaubt.** Eine Vorlage kann für einen
  Automationsschritt gedacht sein, und dort ersetzt Vendo sie. Ob sie an der konkreten
  Stelle erlaubt sind, entscheidet weiterhin `kampagnePruefen` bzw. `automationPruefen`.
- **`doppelteProdukte` meldet erst ab drei Vorkommen.** Bild und Knopf derselben Kachel
  zeigen absichtlich beide auf das Produkt; zwei sind normal, drei sind eine Wiederholung.

## Nicht geprüft

- **Die Auswahl in der laufenden App (offen).** Dass die sechs Karten im Reiter „Vorlagen"
  erscheinen und ein Klick eine Vorlage anlegt, ist nicht in Vendo geprüft; `ansicht.js`
  ist syntaktisch geprüft, der Weg dahinter über `haupt.js` getestet. Weil `haupt.js`
  geändert wurde, muss Vendo neu starten.
- **Wie die Muster in echten Postfächern aussehen (BLOCKED).** Dunkle Mails sind in
  Outlook und Gmail heikler als helle: manche Programme invertieren Farben im Dunkelmodus.
  Belegt ist das erst mit einer Testmail an Felix.
- **Ob die KI die Muster benutzt.** Skill und Systemprompt nennen sie als besten Start,
  erzwingen lässt es sich nicht.
