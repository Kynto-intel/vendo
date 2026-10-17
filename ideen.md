# Vendo: Ideen, Runde 2

Neue Sammlung vom 28.09.2026: **keine neuen Plugins**, sondern Optimierungen, Stimme, Killer-Funktionen, echte JARVIS-Momente und was
Hermes kann, das Vendo noch nicht nutzt. Nichts davon ist gebaut. Felix sucht aus.

Aufwand: ⚡ klein (ein Abend) · ⚡⚡ mittel (1–3 Abende) · ⚡⚡⚡ groß (mehrere Tage).
Regel wie immer: Hermes wird nicht verändert, nur seine eingebauten Befehle werden genutzt.

---

## A. Optimierungen (10)

1. ✅ **Kosten-Wächter** (gebaut 28.09.2026, im System-Tab) – Tages- und Monatsbudget in den Einstellungen. Luzzy warnt bei 80 % („Wir sind heute bei
   4 von 5 Euro“), Anzeige oben neben der Uhr. Zahlen kommen aus Hermes' Nutzungsstatistik.

## B. Stimme und Sprechen (10)

11. ✅ **Aussprache-Wörterbuch** – Liste in den Einstellungen: wie Luzzy „Hoodie“, „Shopify“, „Donnerwolf“, Namen und
    Abkürzungen aussprechen soll. Gilt für alles, was sie vorliest.
12. ✅ **Zahlen, Preise und Daten sprechbar** – „39,90 €“ wird „neununddreißig Euro neunzig“, „3.10.“ wird „dritter
    Oktober“, Bestellnummern werden in Gruppen gelesen. Klingt viel natürlicher.

## C. Killer-Funktionen, die sonst keiner hat (10)

21. ✅ **„Willkommen zurück“** (gebaut 17.10.2026) – Vendo merkt, wann du nicht am PC bist (Windows meldet Leerlauf), sammelt Meldungen
    und fasst sie beim Zurückkommen zusammen: „In der Zwischenzeit: 2 Bestellungen, eine Mail von Jana.“

## D. Was Hermes kann, Vendo aber noch nicht nutzt (10)


32. ⚡ **Nebenbei-Frage** – Während Luzzy an etwas Langem arbeitet, eine kurze Frage stellen, ohne sie zu stören
    (`prompt.btw`). Die Antwort kommt sofort, ihr Auftrag läuft weiter und der Chat bleibt unberührt.
33. ⚡⚡ **Aufträge im Hintergrund** – „Luzzy, mach das im Hintergrund: …“ (`prompt.background`). Du redest normal
    weiter, eine Meldung sagt Bescheid, wenn es fertig ist. Mehrere Aufträge gleichzeitig.
34. ⚡⚡ **Rückfragen von Hermes beantworten** – Braucht Luzzy eine Auswahl von dir („Welche Größe soll ich nehmen?“),
    lehnt Vendo das heute ab. Neu: Karte mit den Möglichkeiten, antworten per Klick oder Stimme (`request.answer`).
35. ⚡⚡ **Helfer live sehen und lenken** – Schickt Luzzy Unter-Agenten los, zeigt Vendo sie live (`subagent.list`,
    `subagent.tail`): wer arbeitet woran. Per Stimme lenken („Such nur in Deutschland“) oder stoppen.
37. ⚡⚡ **Luzzys Gedächtnis ansehen** – „Was weißt du über mich?“ Vendo zeigt, was Luzzy sich dauerhaft gemerkt hat
    (`memories\MEMORY.md` und `USER.md` im Profil). Einträge korrigieren oder löschen, nur mit Rückfrage.