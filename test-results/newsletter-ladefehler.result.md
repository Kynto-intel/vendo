# Newsletter-Plugin: Ladefehler in der Oberfläche

**Datum:** 2026-11-16
**Plugin:** `newsletter`
**Gegenstand:** `plugins/newsletter/ansicht.js` (`stillHolen`, `ladefehlerZeile`, Aktion
`nachladen`) und `stil.css` (`.nl-ladefehler`). Anlass: Review-Befund M1 in
`docs/newsletter-review.md`. `stillHolen` gab bei einem Fehler still `null` zurück; ein
Ladefehler sah dadurch aus wie eine leere Liste.

**Testbefehl:**

```
node --test tests/newsletter-ladefehler.test.js
```

**Fixture:** keine Datei. `ctx.element` ist ein kleiner Ersatz, der nur das gezeichnete HTML
festhält; `ctx.aufrufen` ist ein Ersatz für den Hintergrundteil, der feste, erfundene
Antworten oder Fehler liefert. Der Zeitgeber der Oberfläche wird für den Start abgeschaltet.
Kein Fenster, kein Netz, keine `daten/`.

**Ergebnis: PASS — 7 von 7 Tests.** Der fünfte (2026-11-16, später am Tag) prüft den neuen
Abschnitt „Rückläufer per Mail“ im Reiter „Kontakte“ (Einzelheiten in
`test-results/newsletter-ruecklaeufer.result.md`), der sechste und siebte die Zustellungs-Ampel
in der Übersicht und den Editor einer angehaltenen Kampagne (Einzelheiten in
`test-results/newsletter-zustellung.result.md`).

## Einzelne Tests

| Test | Ergebnis |
| --- | --- |
| ein Ladefehler erscheint als Hinweis mit Bereich und „Erneut laden“ | PASS |
| ohne Fehler gibt es keinen Hinweis | PASS |
| „Erneut laden“ holt neu, nach einem Erfolg verschwindet der Hinweis | PASS |
| Fehlertexte werden maskiert, bevor sie ins HTML kommen | PASS |
| Reiter „Kontakte“ zeigt Rückläufer-Bereich, Sperrart und gezählte Fehler | PASS |
| Übersicht zeigt Zustellungs-Ampel und Kasten mit Rat, maskiert | PASS |
| angehaltene Kampagne: Fortsetzen und Abbrechen, Speichern gesperrt | PASS |

## Fehler und Korrekturen

Keine Fehlschläge.

## Nicht geprüft (BLOCKED)

- **Aussehen in der laufenden App** (Farbe, Lage über dem Reiterinhalt, Knopf): nicht
  angesehen. Ein Start von Vendo hätte den echten Versandtakt mit den echten Plugin-Daten
  angestoßen.
- Der Ersatz für `ctx.element` kennt kein echtes DOM; geprüft ist das erzeugte HTML und die
  Aktion des Knopfs, nicht das Klicken im Browser.
