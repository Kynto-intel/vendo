# Newsletter-Plugin: die Muster im Stil der Marke — zugleich die Grundvorlagen

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12 (letzter Lauf nachmittags, nach dem Umbau „Muster sind Vorlagen“)
**Gegenstand:** `plugins/newsletter/muster.js` mit den Mustern aus `plugins/newsletter/vorlagen/`,
ihre Anbindung in `plugins/newsletter/haupt.js` (`alleVorlagen`, `musterAlsVorlage`,
`musterVon`, `vorlageZumAendern`, `vorlageEntfernen`, `vorlageAusMuster`, Bot-Aktionen
`vorlage_zeigen`, `vorlage_aendern`, `vorlage_loeschen`, `vorlage_aus_muster`,
`links_pruefen`, `ueberblick`, Entwurfsdateien), `plugins/newsletter/ansicht.js` (eine
Liste im Reiter „Vorlagen“), `plugins/newsletter/stil.css`. Dazu `shoplinks.doppelteProdukte`
und die Lockerung in `vorlagen.js` (Warenkorb-Platzhalter in Vorlagen erlaubt).
Außerhalb von Vendo: Systemprompt (3981 von 4000 Zeichen) und Skill (0.6.0) im
Hermes-Profil der Newsletter-Texterin, vorher gesichert als
`*.vor-muster-als-vorlagen-20261112.bak`.

**Testbefehl:**

```
node --test tests/newsletter-muster.test.js
```

**Regressionslauf:**

```
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei. Markenangaben, Impressum und Beispielprodukte im Test sind
erfunden. Kein Netzzugriff, keine geschriebene Datei.

**Ergebnis: PASS — 65 von 65 Tests in `tests/newsletter-muster.test.js`, 495 von 495 im
Regressionslauf** (491 Newsletter-Tests in achtzehn Dateien plus 4 Werkstatt-Tests), Lauf
vom 2026-11-12 abends.
`git diff --check` ohne Befund.

**App-Lauf (Vendos Testmodus, `VENDO_TEST_JS` + `VENDO_SCREENSHOT`, Skript im
Arbeitsordner, nicht im Repo):** Vorher geprüft, dass der Start nichts verschickt
(Warteschlange leer, keine Automation an, nichts geplant). Der Reiter „Vorlagen“ zeigt
eine Liste, keinen Muster-Block mehr; jede alte Kopie trägt „Angepasst“. Editor öffnen und
schließen legt keine Kopie an (weiter 11 eigene Vorlagen). Beim Schließen speicherte der
schon vorher vorhandene Weg „Neue Motive“ mit gleichem Inhalt und neuer Änderungszeit.
Die Konsole meldete nur Bilder, die Vendos Sicherheitsregel sperrt — aus den alten
Kopien von heute Nacht (`donnerwolf.de/cdn/...beispiel-N.png`), nicht aus den Mustern.

## Muster sind Vorlagen (2026-11-12, nachmittags)

Felix: „warum habe ich 11 vorlagen aber nur 7 im vorlagen ordner und warum wird mir
beides in vendo angezeigt das ist doch sinnlos“. Ursache: jeder Klick auf eine
Musterkarte legte ohne Rückfrage eine Kopie an (Neue Motive ×2, Drei Sammlungen ×2,
Meistverkauft ×3), die Muster standen trotzdem daneben, und keine Kopie folgte einer
späteren Änderung der Datei.

Jetzt:

- Die Muster stehen **selbst** in der Vorlagenliste (`muster: true`), anwendbar, testbar,
  ohne Kopie. Ihre ID ist der Dateiname.
- Eine eigene Fassung (`musterId`) entsteht erst beim echten Ändern — in Vendo, über
  `vorlage_aendern` oder über die .html-Datei — und steht dann **an Stelle** des Musters.
  Selbstspeichern mit unverändertem Inhalt legt keine an.
- Löschen einer Fassung = „Auf Muster zurücksetzen“; ein Muster selbst lässt sich nicht
  löschen. Alte Kopien ohne `musterId` werden über den gleichen Namen zugeordnet.
- `vorlage_aus_muster` legt nichts mehr an, sondern nennt die passende ID.
- `muster.js` liest die Dateien neu, sobald sich eine ändert (höchstens alle zwei
  Sekunden geprüft) — kein Neustart mehr nötig.

Neue Tests: Muster in der Liste ohne Kopie; ansehen/anwenden/unverändert speichern legt
nichts an; Ändern ergibt eine Fassung an Stelle des Musters; Zurücksetzen; alte Kopien
per Name; `vorlageAusMuster` ohne Kopie; der Bot über `ueberblick`, `vorlage_zeigen`,
`vorlage_aendern`, `kampagne_neu` und `vorlage_loeschen`.
Nicht automatisch getestet: das Neueinlesen geänderter Muster-Dateien (der Test müsste
eine versionierte Datei im Plugin-Ordner ändern).

## Nur Muster für die KI (2026-11-12, abends)

Felix: „nur die [Muster in] plugins/newsletter/vorlagen darf die KI nutzen um daraus
Entwürfe zu bauen“. Seitdem sieht ein Bot in `ueberblick` nur die Muster, `vorlage_zeigen`
und `kampagne_neu` nehmen nur Muster-IDs — immer das Original aus der Datei, auch wenn Felix
eine angepasste Fassung hat —, und `vorlage_neu`, `vorlage_aendern`,
`vorlage_aus_kampagne`, `vorlage_aus_muster` und `vorlage_loeschen` stehen nicht mehr im
Bot-Vertrag. `vorlageAusMuster` ist aus dem Hintergrundteil entfernt (die Oberfläche
brauchte es seit dem Umbau nicht mehr). Neue bzw. ersetzte Tests: der Bot nimmt nur Muster,
auch bei angepasster Fassung; die Vorlagen-Aktionen fehlen im Vertrag.

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

## Nachtrag 2026-11-12, abends: gültiges HTML, getrennte Muster, Platzhalterbild

Drei Mängel gemeldet.

**Alles rot in VS Code.** Nachgezählt: **141 `style`-Attribute** enthielten `%TOKEN%`, also
ungültiges CSS — jeder Editor markiert das. Die Dateien enthalten jetzt echte Werte
(`background-color:#1A1A1A`), und `muster.js` ersetzt **Wert für Wert**: die sieben Farben
und die Shop-Adresse. Nebeneffekt: die Dateien lassen sich so, wie sie sind, im Browser
öffnen. Bedingung dafür ist, dass jede Standardfarbe einmalig ist, sonst bekämen zwei
Rollen dieselbe neue Farbe; `aufAkzent` wurde deshalb von `#1A1A1A` auf `#15120B` geändert
und ein Test prüft die Einmaligkeit.

**Alles doppelt.** Die Musterkarten hatten dieselbe Gestalt wie die eigenen Vorlagen und
standen darüber — sieben Muster plus die daraus angelegten Vorlagen sahen aus wie eine
doppelte Liste. Die Muster stehen jetzt **unter** der Vorlagenliste in einem Klappblock,
der zugeht, sobald es eigene Vorlagen gibt. Der Text sagt ausdrücklich, dass ein Klick
eine **neue** Vorlage anlegt und die Muster stehen bleiben.

**Kaputte Bildsymbole.** Die Beispielbilder zeigten auf Adressen, die nicht laden. Jetzt
zeichnet `icons.js` ein Platzhalterbild (Rahmen, Diagonalen, „BILD / 1200 × 600 px") in der
Schriftfarbe des Fußes und schickt es wie die Social-Icons als `cid:vendo-nl-bild` mit.
Die Vorschau zeigt damit eine erkennbare Bildfläche statt eines Fehlersymbols, und Vendos
Bildprüfung lässt `cid:` ohnehin durch.

**Vier neue Tests:** kein Platzhalter in einem `style`-Attribut, überhaupt kein `%TOKEN%`
mehr in den Dateien, jede Standardfarbe einmalig, und jede Bildfläche zeigt auf das
mitgeschickte Platzhalterbild.

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
