# Newsletter-Plugin: Produkttexte, Automationshinweise, 429 — und der neue Skill der Texterin

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand in Vendo:**
- Muster `bestseller`, `neue-motive`, `warenkorb-letzter`, `willkommen`: je Produktkarte ein
  Feld `produktN_text` (zwischen Name und Preis, im Stil der Karte, mit Hinweis und
  erkennbarem Beispieltext).
- `html-mail.js`: `produkteOhneText` — jedes Produkt mit `produktN_name` braucht
  `produktN_text` mit mindestens 40 Zeichen. In `haupt.js` sperrt das bei KI-Entwürfen die
  Freigabe.
- `haupt.js`: `automation_zeigen` und die anderen Automations-Antworten zeigen je Schritt
  dieselben Prüfungen (Hausregeln, starre Spalten, Produkte ohne Text) als Hinweis.
- `shoplinks.js`: vorübergehende Antworten (429, 5xx) werden nicht mehr zehn Minuten
  gemerkt; vorher sperrten sie die Freigabe auch dann, wenn ein neuer Versuch durchginge.

**Gegenstand außerhalb von Vendo** (Profil der Newsletter-Texterin, vorher gesichert als
`*.vor-skill-neu-20261112.bak`): `SKILL.md` (1.0.0) neu geschrieben,
`references/verkaufstexte.md` mit Web-Recherche neu, `references/mail-bausteine.md`
bereinigt, Systemprompt neu gefasst (2964 statt 3953 Zeichen).

**Testbefehle:**

```
node --test tests/newsletter-bots.test.js tests/newsletter-mailpruefung.test.js tests/newsletter-muster.test.js
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei; erfundene Daten, gespielter Shop, kein Netz.

**Ergebnis: PASS** — Bots 36/36, Mailprüfung 29/29, Muster 66/66; Regressionslauf 507/507
(503 Newsletter-Tests in achtzehn Dateien plus 4 Werkstatt-Tests). `git diff --check` ohne
Befund. Gemessen: die vier Muster ohne Befund, `ein-motiv` meldet sein Produkt (die
Geschichte steht dort im Feld `geschichte`), die Kampagne der Texterin meldet alle vier
Produkte ohne Text.

## Widersprüche, die im Skill standen (und jetzt weg sind)

| Stelle | Widerspruch | Jetzt |
|---|---|---|
| SKILL: „Für Tonfall, Betreffzeilen und Texte gilt `donnerwolf-email-flow`“ | dessen Ablauf verlangt Zahlen, Screenshots, Performance-Dateien und Warten auf Felix, gebaut für Shopify Email | nur `voice.md` daraus gilt, der Ablauf ausdrücklich nicht |
| SKILL „Vier Regeln“ | fünf aufgezählt | Tabelle „Was Vendo selbst prüft“ plus vier Punkte, die nur die KI sieht |
| SKILL: Fallback über Shopify-MCP mit „Baue Produkt-URL als …/products/{handle}“ | gleiche Datei: „nie eine Adresse zusammensetzen“ | Fallback gestrichen |
| SKILL: „bei 429 trotzdem zur Freigabe geben“ | Vendo sperrt bei 429 und merkte sich die 429 zehn Minuten | Vendo merkt sich 429 nicht mehr; Skill: eine Minute warten, neu prüfen, sonst Felix |
| SKILL/Bausteine: Farben aus `marke.farben` | die Muster tragen eigene Farben; ergänzte Blöcke passten nicht | Stil (Farben, Maße, Knöpfe) aus dem Muster übernehmen |
| Bildbreite halb: 256 px (SKILL), 252 px (Bausteine), 268 px (Muster) | drei Werte | „wie im Muster“ |
| Bausteine: „keine runden Ecken an Knöpfen“ | alle Muster haben runde Knöpfe | Knopfform des Musters |
| Bausteine: „keine Media-Queries“ | Vendo bringt seit heute Handy-Klassen mit | `class="spalte"` |
| Bausteine: „Hol die Produkte immer mit `shop_produkte`“ | SKILL: zuerst `ueberblick` → `bestseller` | eine Reihenfolge |
| `voice.md`: „genau ein Button-Label pro Mail“ | Muster haben Produktknöpfe und einen Hauptknopf | gilt für Shopify-Email-Flows; in Vendo: ein Label je Knopfart |
| Abschnitte „Eine richtige Vorlage bauen“, „Standard-Aufbau“ | die KI darf keine Vorlagen mehr bauen | gestrichen |
| Anleitungen selbst voller „—“ | Hausregel: keine Gedankenstriche, die KI schreibt ihren Vorlagen nach | aus Skill, Bausteinen und Systemprompt entfernt |

## Recherche (Kurzfassung, Quellen in `verkaufstexte.md`)

Klaviyo-Benchmarks 2026 (Warenkorb 6 % Klicks, beste 10 % 11,3 %; Willkommen 6,5 % /
13,3 %), Rejoiner (über 1.000 Marken: erste Warenkorb-Mail optimal nach 30 Minuten,
Produktbilder erhöhen die Rückgewinnung, 60 % der erfolgreichen Betreffs vermeiden
„Warenkorb“), Litmus (Willkommensserie 3 bis 5 Mails in 7 bis 10 Tagen; schlichte
Textmail konvertierte bei Kunden besser), Attentive und Twilio (Betreff kurz, rund 33
sichtbare Zeichen), Stripo (einspaltig auf dem Handy, Hauptknopf im ersten Bildschirm),
Omnisend und Drip (Asphalte: eine Mail für ein T-Shirt mit Stoffgewicht; Huckberry:
warum und für wen; konkrete Zahlen statt „verkauft sich schnell“), Aagaard (Knopftext),
Baymard (Abbruchgründe), dazu Felix' vorhandene Recherche in `flow-benchmarks.md`.

## Nicht geprüft

- Wie die Texterin mit dem neuen Skill arbeitet: braucht einen Lauf nach Neustart von
  Hermes (Systemprompt) und Vendo (Code).
- Ob GMX/Web.de die Handy-Klassen lesen (siehe `newsletter-handy.result.md`).
