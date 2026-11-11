# Newsletter-Plugin: Vorlagen

**Datum:** 2026-11-09
**Gegenstand:** `plugins/newsletter/vorlagen.js` und der neue Reiter „Vorlagen" —
wiederverwendbare Bausteinfolgen, anwendbar auf Kampagnen und auf einzelne
Automationsschritte, mit eigenem KI-Auftrag.

**Testbefehl:**

```
node --test tests/newsletter-vorlagen.test.js
```

**Fixture:** keine Datei, nur erfundene Beispielinhalte. Keine Verbindung nach außen.

**Ergebnis: PASS — 15 von 15 Tests.** Gesamtstand: **231 Tests in elf Dateien.**

## Worum es geht

Bisher hing jede Bausteinfolge an genau einer Kampagne. Wer eine zweite Kampagne anlegte,
fing bei der Startvorlage an oder baute von Hand nach — alle Mails sahen gleich aus oder
kosteten jedes Mal dieselbe Arbeit.

- **Anwenden kopiert.** `anwenden()` gibt eine Kopie der Bausteine zurück; eine spätere
  Änderung in der Kampagne ändert die Vorlage nicht mit. Das ist der Test, der mir hier am
  wichtigsten war.
- **Platzhalter bleiben stehen** (`{{vorname}}` und bei Automationen `{{warenkorb}}`,
  `{{warenkorbLink}}`) — ersetzt wird erst beim Versand.
- **Auf einen einzelnen Schritt anwendbar:** beim Integrationscheck geprüft, dass Schritt 1
  einer Automation die Vorlage übernimmt und Schritt 2 unberührt bleibt. So kann die zweite
  Erinnerung anders aussehen als die erste.
- **Umgekehrt sichern:** aus einer Kampagne oder einem Schritt wird mit einem Knopf eine
  Vorlage.
- **Gesäubert wird wie überall:** unbekannte Bausteinarten und fremde Felder fallen weg,
  auch wenn sie von der KI kommen.

## KI-Auftrag für Vorlagen

Bewusst ein anderer als bei Kampagnen: Dort soll ein fertiger Text entstehen, hier die
**Form**. Der Auftrag verlangt kurze Beispielsätze statt ausformulierter Werbung, Platzhalter
an den richtigen Stellen, kein HTML, keine erfundenen Links oder Preise — dazu Name und
Beschreibung der Vorlage. Die Antwort wird mit derselben Mechanik gelesen wie bei Kampagnen
(reines JSON, Codeblock oder mit Vorrede), erweitert um Name und Beschreibung; fehlen die,
reichen die Bausteine.

Übernommen wird wahlweise in die offene Vorlage (Kopf und Fuß bleiben erhalten) oder als
neue Vorlage.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **Die Oberfläche**: Reiter, Editor, Auswahlfeld in Kampagnen und Automationsschritten
  wurden in Vendo noch nicht geöffnet.
- **Ein echter KI-Entwurf einer Vorlage**: dass `ctx.fragen` antwortet, ist belegt; ob Luzzy
  auf diesen Auftrag brauchbares JSON liefert, zeigt der erste Versuch.
