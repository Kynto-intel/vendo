# Newsletter-Plugin: Prüfung erfundener Rabatte und doppelter Bilder

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand:** Zwei neue Prüfungen in `plugins/newsletter/shoplinks.js`
(`doppelteBilder`, `erfundenePreise`, `preisKern`) und ihre Einbindung in
`plugins/newsletter/haupt.js` (`shopHinweise` als Hinweis, `shopAdressenPruefen` als
Sperre vor der Freigabe). Außerhalb von Vendo nachgeschärft: der Skill
`skills/email/vendo-newsletter` im Profil `vala-newsletter-texterin-bot` samt
`references/mail-bausteine.md`.

**Testbefehl:**

```
node --test tests/newsletter-mailpruefung.test.js
```

**Regressionslauf:**

```
node --test tests/newsletter-mailpruefung.test.js tests/newsletter-renner.test.js tests/newsletter-fuss.test.js tests/newsletter-bausteine.test.js tests/newsletter-html.test.js tests/newsletter-kampagnen.test.js tests/newsletter-vorlagen.test.js tests/newsletter-versand.test.js tests/newsletter-automationen.test.js tests/newsletter-bots.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-zugang.test.js tests/newsletter-drossel.test.js tests/newsletter-warteschlange.test.js tests/newsletter-imap.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei. Alle Preise, Produkte und Bildadressen im Test sind erfunden.
Kein Netzzugriff, keine geschriebene Datei.

**Ergebnis: PASS — 14 von 14 Tests in `tests/newsletter-mailpruefung.test.js`, 403 von 403
im Regressionslauf.** Gesamtstand: **403 Tests in siebzehn Dateien.**
`git diff --check` ohne Befund.

## Anlass: eine echte Vorlage, die Vala gebaut hat

Felix hat das HTML einer neuen Vorlage vorgelegt — sie sehe schlecht aus und „fast alle
Produkte gleich". Gemessen statt geschätzt:

| Befund | Messung |
|---|---|
| Durchgestrichene Preise | `31,95 €` und `58,95 €` |
| Produkte mit Vergleichspreis im Shop | **1 von 280** — keines der sechs verwendeten |
| Bilder im HTML | 10, davon nur **6 verschiedene** |
| Häufigstes Bild | das Shirt-Foto, **3×** (Aufmacher, Produkt 1, Sammlungsband 1) |
| Kleidungsstücke | 4 der 6 Produkte derselbe `fluffy-boxcut-hoodie-black` |
| Ansichten | die vier Hoodies alle als `back-…`, also Rückenaufdruck |
| Leere Abzeichen | 4 Produkte mit leerer, aber vorhandener Abzeichen-Zelle |
| Eigene äußere Hülle | ja, `max-width:600px` — Vendo baut die schon |

Die Preise wurden live gegen `donnerwolf.de/products.json` geprüft: `sturmfest-premium-shirt`
kostet 24,95 € ohne Vergleichspreis, `sturmfest-basic-sweatshirt` 49,95 € ohne
Vergleichspreis. **Die Rabatte waren erfunden.** Das ist nicht nur hässlich, ein
erfundener Streichpreis ist irreführende Werbung.

## Was Vendo jetzt prüft

Zwei der Befunde lassen sich objektiv messen, die hat Vendo bekommen. Die anderen drei
(gleiches Kleidungsstück, Rückansichten, Produktfoto als Sammlungsband) sind
Geschmacksfragen und stehen als Regeln im Skill.

**`erfundenePreise(html, produkte)` — sperrt.** Sucht durchgestrichene Preise im HTML und
hält sie gegen die echten `vergleichspreis`-Werte aus der öffentlichen Produktliste. Was
dort nicht vorkommt, ist erfunden. Eingehängt in `shopAdressenPruefen`, also genau dort,
wo schon eine erfundene Produktadresse die Freigabe sperrt — dieselbe Klasse von Problem.

**`doppelteBilder(html)` — meldet.** Zählt Bildadressen ohne Abfrageteil (`?v=…`, denn das
ist dieselbe Datei) und nennt jede, die mehrfach vorkommt. Als Hinweis in `shopHinweise`,
nicht als Sperre: manchmal ist dieselbe Aufnahme gewollt.

## Was geprüft wurde

**Doppelte Bilder (6 Tests).** Dreifaches Bild wird mit Anzahl gemeldet; verschiedene
Bilder, leeres HTML und `null` melden nichts; derselbe Shopify-Link mit anderer `?v=`
gilt als dasselbe Bild; die häufigste Dopplung steht vorn; mitgeschickte Icons (`cid:`),
`data:`-Bilder und leere `src` zählen nicht mit; ein `data-feld`-Attribut vor dem `src`
bringt die Erkennung nicht durcheinander.

**Erfundene Preise (7 Tests).** Ein Streichpreis ohne Deckung wird gemeldet, einer mit
echtem Vergleichspreis nicht. Die Schreibweise ist egal (`29,95 €`, `29,95€`, `29,95 EUR`,
`29.95 €` sind derselbe Preis; `preisKern` normalisiert auch Tausenderpunkte). Ein leeres
oder auf null stehendes Feld ist kein erfundener Preis. Ohne Produktliste gilt jeder
Streichpreis als unbelegt — das ist der Fall eines Shops ohne Vergleichspreise und genau
der hier. Derselbe Preis wird nur einmal gemeldet.

**Der echte Fall (1 Test).** Die beanstandete Vorlage nachgebaut: beide Prüfungen schlagen
an, das Shirt-Foto wird mit `3×` gemeldet und beide Streichpreise als erfunden.

## Nachgeschärft außerhalb von Vendo

Die Vorlage war nicht nur Valas Fehler — die Baustein-Referenz ließ drei davon zu:

- Sie sagte nicht, dass die Zeilen in **eine schlichte Tabelle ohne `max-width`** kommen.
  Jetzt steht die Zieltabelle als Codeblock ganz oben.
- Sie zeigte das Rabatt-Abzeichen als Platzhalter, ohne zu sagen, dass es **kein
  `data-feld`** sein darf. Ein Feld, das man leeren soll, bleibt stehen; jetzt ist es
  Aufbau, der bei fehlendem Vergleichspreis ganz verschwindet.
- Sie sagte nichts über Abwechslung. Neuer Abschnitt „Die fünf Fehler, die eine Mail
  billig aussehen lassen" mit allen Befunden von oben.

In `SKILL.md` stehen die vier harten Regeln jetzt gleich im Kopf, mit dem Hinweis, welche
davon Vendo selbst erzwingt.

## Nicht geprüft

- **Die Sperre im echten Freigabeweg (BLOCKED, braucht Shopify und Electron).**
  `erfundenePreise` ist einzeln geprüft; dass `shopAdressenPruefen` sie im Zusammenspiel
  mit der echten Produktliste auslöst, zeigt erst eine Freigabe in der laufenden App.
- **Ob Vala die neuen Regeln befolgt.** Das zeigt die nächste Vorlage, die sie baut.
- **Die drei Geschmacksbefunde** (gleiches Kleidungsstück, Rückansichten, Produktfoto als
  Sammlungsband) prüft Vendo nicht. Sie ließen sich nicht ohne Fehlalarme messen: ein Shop
  darf vier ähnliche Artikel bewerben, und `back-…` im Dateinamen ist keine verlässliche
  Regel. Sie stehen als Regeln im Skill und bleiben Felix' Blick überlassen.
