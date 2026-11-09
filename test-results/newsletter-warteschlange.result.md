# Newsletter-Plugin: Warteschlange

**Datum:** 2026-11-09
**Gegenstand:** Phase 1, letzter Teil — `plugins/newsletter/warteschlange.js`: Einträge
einreihen, Idempotenz gegen doppelte Mails, Reihenfolge, Wiederholversuche, Verfall,
Aufräumen und Abbrechen.

**Testbefehl:**

```
node --test tests/newsletter-warteschlange.test.js
```

**Fixture:** keine Datei. Der Test setzt einen festen Zeitpunkt und rechnet mit Abständen,
es wird nicht gewartet und nichts versendet. Nur erfundene Adressen (`beispiel.de`).

**Ergebnis: PASS — 19 von 19 Tests**

Abgedeckt:

- **Keine doppelten Mails.** Derselbe Empfänger in derselben Kampagne wird nicht zweimal
  eingereiht — weder wenn er noch in der Schlange steht, noch wenn er schon bedient wurde.
  Derselbe Empfänger in einer *anderen* Kampagne ist etwas anderes und kommt durch. Nach
  einem endgültigen Fehlschlag ist ein neuer Versuch erlaubt.
- **Adressen werden normalisiert** (getrimmt, kleingeschrieben), der Schlüssel ist
  `kampagne:adresse`, ohne Kampagne `einzel:adresse`.
- **Reihenfolge:** wer am längsten wartet, kommt zuerst. Übersprungen wird, was auf den
  nächsten Versuch wartet oder schon verfallen ist.
- **Versuche:** ein Fehlversuch setzt den Eintrag mit 10 Minuten Wartezeit zurück; beim
  dritten Mal gilt er endgültig als gescheitert und der letzte Fehler bleibt vermerkt.
- **Verfall:** nach 48 Stunden geht ein Eintrag nicht mehr raus, sondern wird als
  `abgelaufen` markiert. Eine eigene Frist je Eintrag ist möglich — für Warenkorb-Mails,
  die nach wenigen Stunden peinlich wären.
- **Aufräumen:** Offenes bleibt, Erledigtes älter als eine Woche fällt weg. Was passiert
  ist, steht im Protokoll, nicht in der Schlange.
- **Abbrechen:** offene Einträge verwerfen, auf Wunsch nur die einer Kampagne; Erledigtes
  bleibt unberührt.
- **Robustheit:** `null`, `undefined`, ein String statt einer Liste oder Müll-Einträge
  führen nicht zum Absturz.

**Zusätzlich geprüft: der Takt im Hintergrundteil**

```
node -e "const haupt=require('./plugins/newsletter/haupt.js'); /* Fake-ctx, siehe unten */"
```

Mit einem Fake-`ctx` geladen: `haupt.js` stellt 22 Funktionen bereit, meldet „Warteschlange
läuft", reiht einen Testeintrag ein und gibt ihn im Stand zurück. Der Zeitgeber startet genau
einmal — der Schutz im Modul-Scope greift, auch wenn Vendo die Aufbaufunktion erneut aufruft.
Das ist wichtig, weil zwei Zeitgeber Mails doppelt verschicken würden.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Das Abarbeiten über Stunden.** Dass ein Versand mit hunderten Einträgen über mehrere
  Stunden sauber durchläuft, zeigt erst ein echter Lauf in der App.
- **Der Takt selbst** (alle 15 Sekunden) wurde nicht über die Zeit beobachtet, nur sein
  einmaliger Start.
- **Nachholen nach einem echten Neustart** von Vendo: die Logik ist getestet (Stand liegt in
  den Plugin-Daten), der Ablauf in der App nicht.
