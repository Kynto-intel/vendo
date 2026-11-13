# Newsletter-Plugin: Spalten brechen auf dem Handy um

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand:** Handy-Stil in Vendos Mail-Hülle (`plugins/newsletter/bausteine.js`,
`HANDY_STIL`), Klasse `spalte` in den Mustern (`plugins/newsletter/vorlagen/bestseller.html`,
`neue-motive.html`, `warenkorb-letzter.html`, `willkommen.html`), Prüfung `starreSpalten`
(`plugins/newsletter/html-mail.js`) und ihre Einbindung in die Freigabe von KI-Entwürfen
(`plugins/newsletter/haupt.js`, `vorlagenReste`).
Außerhalb von Vendo: `references/mail-bausteine.md` und `SKILL.md` (0.10.0) im Skill
`vendo-newsletter` der Newsletter-Texterin, vorher gesichert als
`*.vor-handy-spalten-20261112.bak`.

**Testbefehle:**

```
node --test tests/newsletter-bausteine.test.js tests/newsletter-mailpruefung.test.js tests/newsletter-muster.test.js tests/newsletter-bots.test.js
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei; erfundene Daten im Speicher, gespielter Shop, kein Netz.

**Ergebnis: PASS** — Bausteine 18/18, Mailprüfung 26/26, Muster 66/66, Bots 34/34;
Regressionslauf 501/501 (497 Newsletter-Tests in achtzehn Dateien plus 4 Werkstatt-Tests).
`git diff --check` ohne Befund.

## Gemeldet und Ursache

Felix schickte ein Handy-Bildschirmfoto der Kampagne „Bestseller November“: Produkte
zweispaltig, Bilder klein und angeschnitten, Schrift gequetscht. Ursache: alle
zweispaltigen Stellen waren starre Tabellenzellen `width="50%"` — in 5 von 7 Mustern und in
der Kampagne der Texterin (6 Zellen). Inline-CSS allein kann sie auf dem Handy nicht
untereinander setzen. Die Bausteine der Texterin sagten es sogar ausdrücklich: „Zwei
Spalten bleiben auf dem Handy zwei Spalten — gewollt“.

## Was jetzt gilt

- Vendos Hülle hat im Kopf einen einzigen `<style>`-Block: eine Media Query bis 620 px mit
  vier Klassen — `spalte` (volle Breite, untereinander, Bilder darin voll breit),
  `bild-voll`, `nur-gross`, `aussen` (schmaler Außenrand). Das Layout selbst bleibt
  Inline-CSS: wer Media Queries nicht liest (Outlook am Rechner, manche Webmailer), sieht
  die Mail wie vorher.
- Die Muster tragen `class="spalte"` an jeder nebeneinanderstehenden Zelle.
- `starreSpalten(html)` zählt Zellen mit 20–80 % oder 120–480 px Breite ohne `spalte`.
  Bei einem Entwurf der KI steht das unter „Noch offen“, und die Freigabe ist gesperrt.
- Geänderter alter Test: „kein style-Block“ in `newsletter-bausteine.test.js` prüft jetzt,
  dass es genau einen gibt, im Kopf, und dass er nur die Media Query enthält.

## Nachgemessen im Browser (Kampagne der Texterin, gerendert mit Vendos Hülle)

| Breite | ohne `spalte` | mit `spalte` |
|---|---|---|
| 375 px | Produktbilder 140–146 px, zwei Spalten | Produktbilder 309–311 px, untereinander |
| 900 px | — | zwei Spalten à 268 px nebeneinander, wie bisher |

Kein seitlicher Überlauf (Inhaltsbreite = Fensterbreite = 375 px).

## Nicht geprüft

- Echte Mailprogramme (iOS Mail, Gmail-App, Outlook, GMX/Web.de): nur im Browser
  gemessen. Ob GMX/Web.de die Media Query lesen, ist offen — dort bliebe es schlimmstenfalls
  wie vorher zweispaltig.
- Die vorhandene Kampagne „Bestseller November“ trägt die Klasse noch nicht; die Texterin
  muss sie ergänzen (Vendo sperrt die Freigabe bis dahin).
