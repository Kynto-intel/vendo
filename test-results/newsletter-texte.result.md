# Newsletter-Plugin: verkaufsstarke Texte — Produktfakten und Hausregeln

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand:** Produktbeschreibung aus dem Shop für die KI (`plugins/newsletter/shoplinks.js`:
`kurzText`, Feld `beschreibung` in `produkteLaden` und `rennerVerbinden`), Prüfung der
Hausregeln für Texte (`plugins/newsletter/html-mail.js`: `hausregelVerstoesse`, `FLOSKELN`)
und ihre Einbindung in die Freigabe von KI-Entwürfen (`plugins/newsletter/haupt.js`:
`vorlagenReste`, `bekannteTitel`, `produktNamen`).
Außerhalb von Vendo: neue Referenz `references/verkaufstexte.md` im Skill
`vendo-newsletter` (0.11.0) und ein Verweis im Systemprompt (3953 Zeichen) der
Newsletter-Texterin, vorher gesichert als `*.vor-verkaufstexte-20261112.bak`.

**Testbefehle:**

```
node --test tests/newsletter-bots.test.js tests/newsletter-mailpruefung.test.js tests/newsletter-renner.test.js
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei; erfundene Produkte im gespielten Shop (mit `body_html`), kein Netz.

**Ergebnis: PASS** — Bots 35/35, Mailprüfung 27/27, Renner 23/23; Regressionslauf 504/504
(500 Newsletter-Tests in achtzehn Dateien plus 4 Werkstatt-Tests). `git diff --check` ohne
Befund.

## Gemeldet und Ursache

Felix: die Texte müssen verkaufsstark und überzeugend sein. Befund am Entwurf „Bestseller
November“: drei von vier Produkten nur mit Name und Preis, sonst Allgemeinplätze („Das Motiv
spricht für sich“, „Echte Käufe, echte Motive“), zwei Gedankenstriche entgegen Felix'
Hausregeln. Ursachen: Vendo gab der KI keine Produktbeschreibung (nur Titel, Preis, Bild,
Typ, Schlagwörter); der Text-Skill `donnerwolf-email-flow` ist für Shopify-Email-Flows mit
Zahlen und Screenshots gebaut und hat für Kampagnen nur einen Absatz; nichts prüfte die
Hausregeln.

## Was jetzt gilt

- **Produktfakten:** `shop_produkte`, `shop_bestseller`, `shop_warenkorb` und `ueberblick`
  liefern je Produkt `beschreibung` — die Beschreibung aus der öffentlichen Produktliste
  des Shops als Klartext, am Satzende auf höchstens 400 Zeichen gekürzt. Gegenprobe am
  echten Shop (nur lesend, öffentliche Liste): 3 von 3 Produkten mit Beschreibung, darin
  Stoffgewicht, Passform, Größen, Sitz des Drucks. Gespeicherte Renner-Listen bekommen das
  Feld beim nächsten Abruf (höchstens 20 Stunden alt).
- **Hausregeln:** Gedankenstriche (– und —) in Betreff, Vorschautext und Text sowie die
  Floskeln der Vermeiden-Liste und falsche Dringlichkeit („letzte Chance“, „nur heute“,
  „läuft ab“) stehen bei einem KI-Entwurf unter „Noch offen“ und sperren die Freigabe.
  Produktnamen aus dem Shop dürfen einen Strich enthalten: Namen in `data-feld="…name…"`,
  Renner-Titel und alle Titel, die Vendo schon aus dem Shop gelesen hat, sind ausgenommen.
  Am echten Entwurf gemessen: genau die 2 echten Gedankenstriche gefunden, die zwei
  Produktnamen mit Strich nicht.
- **Text-Anleitung:** `references/verkaufstexte.md` — Aufhänger aus echten Daten, drei
  Betreffzeilen aus drei Winkeln, Produkttexte nach „Haltung, Fakt, Moment“ aus der
  `beschreibung`, nur echte Belege, konkrete Knöpfe und ein eigener Text-Durchgang mit
  Prüfliste. Verweist auf `voice.md`, statt es zu kopieren.

## Nicht geprüft

- Ob die Texterin damit wirklich bessere Texte schreibt: braucht einen Lauf mit der echten
  Texterin nach einem Neustart von Hermes (Systemprompt) und Vendo (neuer Code).
- Die Vermeiden-Liste steht als Kopie in `html-mail.js`; ändert Felix `voice.md`, muss
  `FLOSKELN` nachgezogen werden.
