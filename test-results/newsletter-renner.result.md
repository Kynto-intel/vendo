# Newsletter-Plugin: Renner — was sich verkauft und was liegen bleibt

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-11
**Gegenstand:** Zwei Ranglisten aus Shopify — die fünf meistverkauften Produkte aus den
Bestellungen und die fünf, die am häufigsten in abgebrochenen Warenkörben lagen. Für die
Übersicht in Vendo und als Aktionen `shop_bestseller` und `shop_warenkorb` für den
Newsletter-Bot.
Neu: `plugins/newsletter/shopify.js` (`rangliste`, `RENNER_*`, `KORB_RENNER_*`, `bestsellerHolen`, `korbRennerHolen`),
`plugins/newsletter/shoplinks.js` (`rennerVerbinden`), `plugins/newsletter/haupt.js`
(`rennerSichern`, `rennerLesen`, `rennerHolen`, beide Bot-Aktionen),
`plugins/newsletter/bots.js` (zwei Aktionen, Feld `tage`), `plugins/newsletter/ansicht.js`
(beide Listen unter den Kacheln), `plugins/newsletter/stil.css`.
Außerhalb von Vendo: das Hermes-Plugin `vendo-newsletter` und der Skill
`skills/email/vendo-newsletter` im Profil `vala-newsletter-texterin-bot`.

**Testbefehl:**

```
node --test tests/newsletter-renner.test.js
```

**Regressionslauf:**

```
node --test tests/newsletter-renner.test.js tests/newsletter-fuss.test.js tests/newsletter-bausteine.test.js tests/newsletter-html.test.js tests/newsletter-kampagnen.test.js tests/newsletter-vorlagen.test.js tests/newsletter-versand.test.js tests/newsletter-automationen.test.js tests/newsletter-bots.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-zugang.test.js tests/newsletter-drossel.test.js tests/newsletter-warteschlange.test.js tests/newsletter-imap.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei. Shopify wird durch einen Stub ersetzt, der die abgeschickten
Abfragen mitschreibt; die öffentliche Produktliste ebenso. Alle Namen, Preise und
Bestellungen sind erfunden (`beispiel.de`, „Hoodie", „Shirt"). Kein Netzzugriff, keine
geschriebene Datei, keine echten Zugangsdaten.

**Ergebnis: PASS — 22 von 22 Tests in `tests/newsletter-renner.test.js`, 415 von 415
im Regressionslauf.** Gesamtstand: **415 Tests in siebzehn Dateien.**
`git diff --check` ohne Befund.

## Warum ins Plugin und nicht als eigener Shopify-Zugang für den Bot

Gefragt war, ob der Newsletter-Bot einen eigenen Shopify-Zugang bekommt oder Vendo die
Listen liefert. Vendo liefert sie:

- Der Token liegt schon in Vendo, mit genau den nötigen Rechten (`read_orders` braucht die
  Warenkorb-Automation ohnehin). Ein zweiter Zugang wäre ein zweites Geheimnis an einer
  zweiten Stelle — und der Bot käme damit an Kundendaten, die er heute bewusst nicht sieht
  (`bots.js`: keine einzelnen Kontakte).
- Eine fertige Fünferliste ist ein Bruchteil dessen, was das Durchsuchen von 280 Produkten
  kostet. Der ausdrückliche Zweck war, Tokens zu sparen.

## Was geprüft wurde

**Zählen (4 Tests).** Gezählt werden Stückzahlen, nicht Bestellungen: zwei Hoodies in einer
Bestellung sind zwei verkaufte Hoodies. Derselbe Artikel aus mehreren Seiten der Abfrage
landet in einer Zeile. Ein Posten ohne Stückzahl zählt als eins, einer ohne Namen fällt
heraus. Bei gleicher Menge wird nach Namen sortiert, damit die Reihenfolge zwischen zwei
Läufen nicht springt.

**Rückfall ohne `product { handle }` (2 Tests).** Die reiche Abfrage holt den Handle mit,
damit sich ein Posten ohne Raten seiner Produktseite zuordnen lässt. Fehlt das Recht dafür,
antwortet Shopify mit einem Feldfehler; dann wird einmal auf die schlanke Abfrage
umgeschaltet und über den Titel zugeordnet — derselbe Mechanismus, den `warenkoerbeHolen`
schon nutzt. Der Test prüft die Reihenfolge der tatsächlich abgeschickten Abfragen. Ein
echter Fehler (abgelehnter Token) wird durchgereicht, nicht als leere Liste getarnt.

**Verbinden mit den Produktdaten (5 Tests).** `shoplinks.rennerVerbinden` hängt Adresse,
Bild, Preis und Vergleichspreis an. Zuordnung erst über den Handle, sonst über den Titel
ohne Rücksicht auf Groß- und Kleinschreibung; ein in der Adresse verschlüsselter Handle
(`gr%C3%BCsse-mehr`) wird trotzdem getroffen. Der Name aus dem Shop gewinnt gegen den aus
der Bestellung. **Was nicht mehr im Shop steht, bleibt mit Namen und Menge stehen** und ist
mit `imShop: false` gekennzeichnet — so fällt auf, wenn ein Renner aus dem Sortiment
genommen wurde, statt dass er stillschweigend verschwindet. Ausverkauftes wird mit
`verfuegbar: false` gemeldet. Ohne Produktliste bricht nichts.

**Zusammenspiel und Bot-Vertrag (5 Tests).** Ohne Shopify-Zugang sagt Vendo, woran es
liegt. `bestsellerLesen` gibt höchstens fünf Einträge und kennt seinen Stand.
`shop_bestseller` steht in `bots.js` als erlaubte Aktion mit genau dem Feld `tage`, gilt
als nur lesend und als langsam (der Bot wartet länger). Der Zeitraum wird auf 7 bis 365
Tage begrenzt, ein unbekanntes Feld fällt aus dem Auftrag.

**Vertrag gegengeprüft.** Ein Skript stellt `bots.js` gegen das Hermes-Plugin: 26 Aktionen,
18 Felder, 6 langsame Aktionen — deckungsgleich. Der Systemprompt des Plugins misst nach
der Ergänzung 3810 Zeichen bei einer Grenze von 4000.

## Nachtrag 2026-11-12: die Warenkorb-Renner dazu

Dieselbe Rangliste über abgebrochene Warenkörbe. Gebaut wurde sie nicht daneben, sondern
durch Zusammenlegen: `rangliste()` in `shopify.js` macht jetzt die gemeinsame Arbeit
(blättern, Posten zählen, bei fehlendem Recht auf die schlanke Abfrage umschalten),
`bestsellerHolen` und `korbRennerHolen` geben ihr nur die Abfragen und das Feld der
Antwort mit. In `haupt.js` dasselbe: `rennerSichern(art)` statt zweier fast gleicher
Funktionen, mit einer Tabelle `RENNER` für das, was sich unterscheidet.

**Die Abfrage fragt kein Kundenfeld ab.** `KORB_RENNER_REICH` und `_SCHLANK` holen nur
`lineItems`, kein `customer`, keine Adresse, keinen Namen. Für eine Produktrangliste braucht
es niemanden namentlich — und ohne Kundenfelder rührt die Abfrage keine geschützten
Kundendaten an. `warenkoerbeHolen` ist der andere Fall: dort wird angeschrieben, dort muss
die Adresse mit. Ein Test hält das fest, damit später niemand aus Bequemlichkeit `customer`
ergänzt.

**Vier neue Tests.** Zählen über Körbe statt Bestellungen (`koerbe` statt `bestellungen`),
keine Kundenfelder in beiden Abfragen, der Rückfall ohne `product { handle }` auch hier,
und dass beide Ranglisten dieselbe Form liefern — sonst müsste die Oberfläche zwei Formate
kennen. Die bestehenden Tests wurden auf beide Arten erweitert statt verdoppelt.

**In der Übersicht** stehen beide Listen nebeneinander (untereinander, wenn das Fenster
schmal ist), jede mit eigenem Knopf „Neu holen". Was aus dem Shop genommen wurde, bleibt
sichtbar, aber durchgestrichen und abgeblendet — so fällt auf, dass ein Renner fehlt,
statt dass er stillschweigend aus der Liste rutscht. In eine Mail lässt Vendo ihn nicht:
die Bot-Aktion filtert auf `imShop` und `verfuegbar`.

**Der Systemprompt des Hermes-Plugins** misst jetzt 3924 von 4000 erlaubten Zeichen. Viel
mehr passt nicht mehr hinein; die nächste Regel für den Bot gehört in den Skill, nicht in
den Prompt.

## Nachtrag 2026-11-12: die Bestseller stehen schon im `ueberblick`

Felix: „der bot soll ja die produkte nehmen die in vendo angezeigt werden, das doch die
bestseller". Bisher musste der Bot sie mit einem zweiten Aufruf holen — und baute statt
dessen ein Gerüst mit erfundenen Produkten.

Jetzt trägt die Antwort von `ueberblick`, die der Bot ohnehin als Erstes abruft, die
Liste unter `bestseller` mit: dieselben fünf, die Felix in seiner Übersicht sieht, jede
mit `url`, `bild`, `preis`, `vergleichspreis` und verkaufter Stückzahl. Ausverkauftes und
aus dem Shop Genommenes ist aussortiert — das gehört in Felix' Übersicht, aber nicht in
eine Mail. Der Antworttext nennt die ersten drei beim Namen; ist die Liste leer, sagt er
stattdessen, dass `shop_bestseller` zu rufen ist und Produkte niemals erfunden werden.

**Zwei neue Tests:** die Liste kommt fertig mit Adresse, Bild und Preis und ohne die
beiden ungeeigneten Einträge; ohne geholte Bestseller steht die Anweisung im Text.

Im Hermes-Plugin ersetzt eine Regel `PRODUKTE` die alte Adressregel teilweise: „NIE
erfinden, auch keine Namen und keine Preise … stehen schon in der Antwort von ueberblick".
Der Systemprompt war damit kurz über der Grenze von 4000 Zeichen (4015) — die
Adressregel wurde zusammengezogen, jetzt sind es 3781.

## Entscheidungen

- **Höchstens einmal in 20 Stunden frisch.** Die Bestellabfrage ist langsam und zählt auf
  Shopifys Kontingent. Für eine Bestseller-Liste reicht ein Stand pro Tag; ein Aufruf
  zwischendurch gibt den gespeicherten zurück und sagt das auch („Stand von heute"). Der
  Knopf „Neu holen" in der Übersicht erzwingt es.
- **Zwanzig gespeichert, fünf gezeigt.** Die Datei soll nicht wachsen, aber eine Reserve
  ist da, falls die ersten Plätze ausverkauft sind.
- **Standard 30 Tage.** Kurz genug, um eine Saison abzubilden, lang genug für einen Shop
  dieser Größe. `tage` lässt 7 bis 365 zu.
- **Zwei Aktionen statt einer mit Schalter.** `shop_bestseller` und `shop_warenkorb` sagen
  im Namen, was sie liefern. Ein Feld `art` hätte mit dem gleichnamigen Feld der
  Automationen (`warenkorb`, `willkommen`, `rueckgewinnung`) kollidiert.

## Nicht geprüft

- **Der volle Weg mit echtem Shopify-Token (BLOCKED, braucht Electron).** `shopifyZugang`
  entschlüsselt den Token über Electrons `safeStorage`; in einem normalen Node-Prozess gibt
  es den nicht, es gibt auch bewusst keinen Klartext-Rückfall. Getestet sind deshalb die
  Abfrage (mit Stub), das Zählen, das Verbinden und der Bot-Vertrag einzeln — nicht die
  Kette in einem Durchlauf. Belegen lässt sich die erst mit „Neu holen" in der laufenden App.
- **Die Anzeige in der Übersicht (offen).** Dass die Liste erscheint und der Knopf greift,
  ist nicht in der laufenden App geprüft; `ansicht.js` ist syntaktisch geprüft. Weil
  `haupt.js` geändert wurde, muss Vendo einmal neu starten.
- **Ob Shopify `product { handle }` für Felix' Token wirklich liefert.** Tut es das nicht,
  greift die schlanke Fassung — das ist geprüft, aber welcher der beiden Wege bei ihm läuft,
  zeigt erst der erste echte Abruf (`schlank: true` im Ergebnis).
- **Ob `abandonedCheckouts` ohne Kundenfelder auch ohne Freigabe für geschützte Kundendaten
  läuft.** Das ist die Erwartung hinter der schlanken Abfrage, belegt ist sie nicht —
  Shopify entscheidet das am Objekt, nicht nur am Feld. Schlägt es fehl, kommt die Meldung
  von Shopify durch, und die Liste bleibt leer statt falsch.
