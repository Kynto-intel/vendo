# Jarves-OS: Ideen und offene Entscheidungen

Sammelliste, damit nichts verloren geht. Angelegt: 26.09.2026.
Der Plan und der Bau-Stand stehen in `Jarves-OS.md`.

---

## Offene Entscheidungen

### 1. Freigaben für Luzzy und die Crew
Luzzys Regeln in ihrer `SOUL.md` sagen: nichts veröffentlichen, nichts im Shop ändern, keine neuen Dateien ohne Felix' Ja.
Bei der Planung stand aber auch: Die Crew darf ohne Freigabe senden und veröffentlichen.
- **Variante A (gilt aktuell):** Regeln bleiben. Jarves-OS könnte Freigaben bequemer machen (Luzzy fragt per Stimme, Felix sagt „Ja“ oder klickt „Freigeben“).
- **Variante B:** Felix lockert die Regeln in der SOUL.md, Jarves-OS protokolliert jede Aktion.

### 2. Kürzere Antworten bei Spracheingabe
Wenn Felix mit Luzzy spricht statt schreibt, antwortet sie kürzer (Hinweis an Hermes, dass die Frage gesprochen kam).

### 3. Bots direkt ansprechen
Zusätzlich zu Luzzy als Chefin einzelne Bots direkt anschreiben, z. B. im Crew-Tab (Recherche-, Schreib-, Code-Bot).

### 4. Rollen der Bots breiter fassen
Die Bots sind nur auf den Blog zugeschnitten (Recherche für Artikel, Artikel schreiben, HTML-Vorlage).
Möglich: Recherche-Bot für alle Recherchen, Schreib-Bot für alle Texte, Code-Bot für alle Technik.
Felix: vorerst so lassen.

### 5. Morgenbericht automatisch
**Erledigt über Idee 8:** Routine „Morgenbericht“ hat einen Zeitplan (Uhrzeit + Wochentage), einfach im Tab „Routinen“ einschalten. Läuft, solange Jarves-OS offen ist.

Ein Hermes-Job erstellt jeden Morgen den Bericht (im Vault unter `04_Analytics\Morgenberichte`).
Offen: Uhrzeit, und ob Luzzy ihn beim Start von Jarves-OS automatisch vorliest.
Hängt eng mit Idee 8 (Routinen) zusammen.

### 6. Bibliothek-Regel
Die Agenten legen lange Texte (Recherchen, Berichte, Strategien) automatisch als Datei in `Donnerwolf\Bibliothek` ab statt in den Chat.
Die Anzeige in Jarves-OS ist schon vorbereitet. Braucht eine Regel für Luzzy und die Bots (SOUL.md oder Hermes-Skill), erst nach Felix' Ja.

### 7. Termine per Sprache
Ein kleiner Hermes-Skill, damit Luzzy selbst Termine in den Jarves-Kalender eintragen kann,
z. B. „Luzzy, trag mir morgen um 10 Zahnarzt ein.“
(Termine liegen in `jarves-os\plugins\kalender\daten.json`.) Update-fest im Profil donnerwolf, erst nach Felix' Ja.

---

## Neue Ideen

### 8. Routinen mit Auslösewort („Standardaufgaben“)
Idee von Felix (26.09.2026). **Umgesetzt am 26.09.2026** als Plugin `jarves-osplugins
outinen` (Tab „Routinen“).

**Was:** Ein eigener Bereich (Tab) „Routinen“. Dort legt Felix Routinen an, jede mit:
- **Auslösewort**, z. B. „Morgenbericht“, „Feierabend“, „Wochenrückblick“, „Shop-Check“
- **Prompt:** was alles hinein soll, frei formuliert, z. B.
  „Wetter in meiner Stadt, wichtigste News zu Wikinger-Mode und Shopify, meine Termine von heute,
  Bestellungen und Umsatz seit gestern, Mails, die eine Antwort brauchen.“
- **Bausteine zum Anklicken** (optional): Wetter, News, Termine aus dem Jarves-Kalender, Shop-Daten, Postfach,
  geplante Jobs, Entscheidungen zum Prüfen. Jarves-OS hängt die passenden Daten automatisch an den Prompt,
  z. B. die Termine aus dem Kalender-Plugin.
- **Wie das Ergebnis kommt:** vorlesen, im Gespräch anzeigen, als Datei ablegen (z. B. Morgenbericht im Vault)
- **Zeitplan** (optional): z. B. jeden Werktag 7:30 Uhr, dann läuft die Routine von selbst

**Auslösen:**
- Felix sagt oder tippt das Auslösewort („Hey Luzzy, Morgenbericht“ oder nur „Morgenbericht“ in die Eingabe)
- Klick auf die Routine im Tab
- Zeitplan

**Umsetzungsgedanken:**
- Jarves-OS erkennt das Auslösewort in der Eingabe bzw. im Gesprochenen, bevor es an Luzzy geht,
  und schickt stattdessen den hinterlegten Prompt samt Bausteinen.
- Als Plugin bauen (`jarves-os\plugins\routinen\`), passt zum Plugin-System.
- Zeitgesteuerte Routinen: entweder Jarves-OS selbst (nur solange es läuft) oder als Hermes-Job (läuft immer).
- Ersetzt bzw. erweitert Punkt 5 (Morgenbericht automatisch) und die festen Schnellbefehle über der Eingabe:
  Schnellbefehle könnten künftig aus den Routinen kommen.
- Für Wetter und News braucht Luzzy Web-Zugriff. Den hat Hermes (web_search, web_extract), prüfen, ob er im Profil aktiv ist.

---

## 9. Wetter-Plugin (erledigt, 26.09.2026)

- Eigener Tab **Wetter** mit jetzt + 7 Tagen, Karte rechts, Ort frei wählbar (Voreinstellung Schongau, Bayern).
- Daten von Open-Meteo: kostenlos, ohne Konto, übertragen wird nur der Ort.
- Fragt Felix nach Wetter (oder Terminen), schickt Jarves-OS die Daten samt Datum/Uhrzeit gleich mit, im Chat wie in Routinen.
  Luzzy muss nicht mehr im Netz suchen.

---

## 10. Ideensammlung (26.09.2026), sortiert nach Dauer und Schwierigkeit

Nur Ideen, nichts davon ist gebaut (außer ✅). Felix sucht aus, was davon kommt.
Innerhalb jeder Stufe steht das Einfachste oben. In Klammern die Art:
**Plugin** · **Optimierung** · **Killer** (macht Jarves besonders) · **Extra**. 🆕 = neu dazugekommen.

### ⚡ Klein: je ungefähr ein Abend (20 Ideen)

1. ✅ **Fenster merken** (Optimierung, gebaut 26.09.2026) – Größe, Position und zuletzt offener Tab werden beim Neustart wiederhergestellt.
2. ✅ **Schneller starten** (Optimierung, gebaut 27.09.2026) – Jarves-OS als Verknüpfung auf dem Desktop/in der Taskleiste statt Terminal,
   optional Autostart mit Windows.
3. ✅ **Ton für Meldungen** (Optimierung, gebaut 26.09.2026) – Dezenter Donnerwolf-Ton (z. B. Horn) bei neuer Bestellung,
   anderer Ton bei Problemen.
4. ✅ **„Wiederhol das“** (Optimierung, gebaut 26.09.2026) – Knopf und Sprachbefehl: Luzzy liest ihre letzte Antwort nochmal vor,
   sofort und ohne Hermes zu fragen.
6. ✅ **Antwort merken** (Optimierung, gebaut 27.09.2026) – Kleiner 📌-Knopf an jeder Antwort von Luzzy: speichert sie als Notiz im Vault,
   damit gute Antworten nicht im Verlauf untergehen.
7. ✅ **Rechte Spalte selbst einstellen** (Optimierung, gebaut 27.09.2026) – In den Einstellungen per Haken wählen, welche Karten sichtbar
   sind und in welcher Reihenfolge.
8. ✅ **Sicherung auf Knopfdruck** (Extra, Knopf gebaut 26.09.2026; automatische Sicherung vor Updates noch offen) – In den Einstellungen ein Knopf „Jarves-OS sichern“
   (statt `npm run backup`), und automatische Sicherung vor jedem Update.
9. ✅ **Nicht stören per Stimme** (Optimierung, gebaut 27.09.2026) – „Luzzy, bis 15 Uhr keine Meldungen.“ Oben erscheint ein kleines
   Symbol, danach ist alles wieder normal. Meldungen landen trotzdem in der Liste.
10. ✅ **Timer & Wecker per Sprache** (Plugin, Felix' Wunsch, gebaut 27.09.2026) – Luzzy stellt Timer mit Namen:
    „Hey Luzzy, stell Timer auf 15 Minuten für Nudeln.“ → „Alles klar, 15 Minuten für die Nudeln.“
    - Oben neben der Uhr läuft der Countdown mit Namen („🍝 Nudeln 14:32“), mehrere Timer gleichzeitig möglich.
    - Wenn er abläuft: Ton + Luzzy sagt laut „Felix, deine Nudeln sind fertig!“, auch in der Ruhezeit
      und wenn Jarves-OS im Hintergrund ist (Timer hat Felix ja selbst gestellt).
    - Weitere Sätze: „Wie lange noch für die Nudeln?“, „Nudel-Timer stoppen“, „Timer um 5 Minuten verlängern“,
      „Erinner mich um 14 Uhr an den Anruf.“
    - Läuft komplett in Jarves-OS (wie das Auslösewort der Routinen): sofort, ohne auf Hermes zu warten,
      kostet nichts, geht auch ohne Internet.
11. ✅ **Themen nach Tageszeit** (Extra, gebaut 27.09.2026) – Abends wird die Oberfläche wärmer/dunkler, morgens heller.
12. ✅ **Donnerwolf-Startsequenz** (Extra, gebaut 26.09.2026) – Beim Start ein kurzes Intro: Reaktor fährt hoch,
    Luzzy begrüßt dich passend zur Tageszeit.
13. ✅ **Erfolge / Meilensteine** (Extra, gebaut 27.09.2026) – „1.500. Bestellung!“ – Luzzy feiert mit, eine Liste der Meilensteine im Vault.
14. ✅ **Selbsttest-Knopf** (Optimierung, gebaut 27.09.2026) – Ein Klick prüft Hermes, Mikrofon, Shopify, Postfach, Wetter, Stimme
    und sagt klar, was nicht geht und was zu tun ist.
15. ✅ **Zwischenablage an Luzzy** (Killer, gebaut 27.09.2026) – In irgendeinem Programm Text kopieren, Strg+Umschalt+L drücken:
    Luzzy fasst zusammen, verbessert, übersetzt oder beantwortet ihn. Funktioniert auch, wenn Jarves-OS im Hintergrund ist.
16. ✅ **Befehlspalette (Strg+P)** (Optimierung, gebaut 27.09.2026) – Ein Feld für alles: Tab öffnen, Routine starten, Einstellung ändern,
    Plugin aufrufen. Tippen statt klicken.
17. ✅ **Gedankenspeicher** (Plugin, gebaut 27.09.2026) – Schnell etwas festhalten („Merk dir: Stoffproben bestellen“), per Tippen
    oder Sprache. Landet im Vault in einem festen Ordner, Luzzy kennt die Notizen.
18. ✅ **Aufgaben / To-do** (Plugin, gebaut 27.09.2026) – Einfache Aufgabenliste mit Fälligkeit, Erinnerung über die Meldungen,
    „Was muss ich heute noch?“ bekommt Luzzy automatisch mit (wie Wetter und Termine).
19. ✅ **Musik / Fokus** (Plugin, gebaut 27.09.2026) – Kleine Leiste für Hintergrundmusik oder Fokus-Timer (Pomodoro),
    Luzzy stört in der Fokuszeit nicht.
20. ✅ **Wochen-Review mit Stimme** (Killer, gebaut 27.09.2026) – Sonntagabend ein kurzes Gespräch: Luzzy fasst die Woche zusammen,
    fragt nach Zielen für die nächste Woche und legt sie als Aufgaben an (braucht Nr. 18).

### ⚡⚡ Mittel: je ungefähr 1–3 Abende (13 Ideen)

21. ✅ **Sprach-Diktat ins Vault** (Killer, gebaut 27.09.2026) – „Hey Luzzy, neue Idee: …“ – Luzzy schreibt es sauber als Notiz
    mit Datum und Schlagworten in den richtigen Ordner (Jarves-OS\Ideen, das Original-Diktat steht mit drin).
22. ✅ **Diktiermodus für Mails und Texte** (Killer, gebaut 27.09.2026) – Einfach frei drauflos reden, auch länger. Luzzy macht daraus
    eine saubere Mail oder einen Text, legt ihn in die Zwischenablage oder als Entwurf ab. Abschicken tut Felix.
    „Diktat“ (lange Aufnahme, Pausen bis 3,5 Sekunden), „Diktat: …“ oder „Schreib eine Mail an …, dass …“.
23. ✅ **„Der Laden redet mit dir“** (Killer, gebaut 27.09.2026) – Bei jeder Bestellung sagt Luzzy nicht nur „neue Bestellung“, sondern
    „Thor-Hoodie in L nach Hamburg, dritte Bestellung von dieser Person“. Ohne Namen und Adresse, nichts wird gespeichert.
24. ✅ **Mini-Modus** (Optimierung, gebaut 27.09.2026) – Felix' Wunsch: schmale Leiste fest oben mittig, immer im
    Vordergrund, zeigt nur Luzzys Stimme als Balken. Klick: sprechen, Doppelklick oder Strg+Umschalt+M: großes Fenster.
25. 🆕 **Datei oder Bild an Luzzy** (Optimierung) – PDF, Foto oder Tabelle per Drag & Drop in den Chat ziehen:
    „Was steht da drin?“, „Fass das zusammen.“ (Für Bilder braucht es ein Modell, das Bilder versteht.)
26. **Suche über alles** (Optimierung) – Ein Suchfeld (Strg+F) für Vault, Gespräche, Termine, Bestellungen, Mails.
27. 🆕 **Mehrere Gespräche** (Optimierung) – Themen getrennt halten (z. B. Shop, Privat, ein Projekt): Liste im
    Gesprächs-Fenster, Wechsel mit einem Klick, Luzzy verliert nicht den Faden.
28. 🆕 **Hermes-Update-Wächter** (Killer) – Meldet, wenn es eine neue Hermes-Version gibt, und erklärt in einfachen
    Worten, was neu ist. Sichert vorher Profile und Einstellungen und prüft nach dem Update, ob Jarves-OS noch alles kann.
29. **Finanzen & Kosten** (Plugin) – Einnahmen vs. Ausgaben im Monat (Shopify-Umsatz, Gebühren, KI-Kosten aus
    Hermes, Abos). Nur Überblick, keine Überweisungen.
30. 🆕 **PC-Steuerung per Stimme** (Killer) – „Öffne Photoshop“, „Mach lauter“, „Zeig mir den Donnerwolf-Ordner.“
    Nur Befehle aus einer Liste, die Felix selbst festlegt, nichts anderes.
31. ✅ **Antwort schon beim Schreiben vorlesen** (Optimierung, gebaut 27.09.2026) – Luzzy fängt an zu sprechen, sobald der erste Satz
    fertig ist, nicht erst am Ende. Fühlt sich viel schneller an.
32. ✅ **Unterbrechen per Stimme** (Optimierung, gebaut 27.09.2026) – „Stopp“ oder „Hey Luzzy“ während sie spricht bricht ab und hört zu.
    Auch Esc. Abschaltbar in Einstellungen → Sprechen.
33. 🆕 **Notfall-Luzzy ohne Internet** (Extra) – Fällt Internet oder das Cloud-Modell aus, übernimmt ein lokales
    Modell (Ollama ist schon da) die einfachen Sachen: Timer, Notizen, Kalender, Uhrzeit. Luzzy sagt dazu, dass sie im Notbetrieb ist.

### ⚡⚡⚡ Groß: mehrere Tage, eher ein eigenes Projekt (6 Ideen)

34. 🆕 **Plugin-Werkstatt** (Killer) – Felix beschreibt in eigenen Worten, was er braucht („ein Plugin für meine
    Stoffvorräte“). Code-Bot baut es im Plugin-Ordner, Felix sieht eine Vorschau, aktiv wird es erst nach seinem Ja.
    Jarves baut sich selbst weiter.
35. **Produktideen-Schmiede** (Killer) – Recherche-Bot sucht Trends (Wikinger, Norse, Runen, Serien wie Vikings),
    Schreib-Bot macht Text und Namen, daraus wird ein fertiger Produktentwurf zum Absegnen.
36. **Social-Planer** (Plugin) – Kalender für Instagram- und Facebook-Posts: Entwürfe von Schreib-Bot, Bild dazu,
    geplantes Datum. Veröffentlicht wird nur nach Felix' Ja (Luzzy-Regel bleibt).
37. 🆕 **„Luzzy, was siehst du?“** (Killer) – Auf Befehl schaut Luzzy auf den Bildschirm (ein Bild, nur wenn Felix
    es sagt, nie heimlich) und hilft bei dem, was gerade offen ist: Fehlermeldung, Shopify-Seite, Design.
    Braucht ein Modell, das Bilder versteht.
38. **Crew-Arbeitsbühne** (Killer) – Man sieht live, wie die Bots zusammenarbeiten: wer gerade was macht,
    Zwischenergebnisse, wer wem etwas übergibt. Wie ein kleines Team auf dem Bildschirm.
39. 🆕 **Eigene Luzzy-Stimme, lokal** (Extra) – Eine unverwechselbare eigene Stimme über ein lokales Sprachmodell
    auf dem PC: läuft ohne Internet und ohne Microsoft-Dienst, klingt nur nach Luzzy.

---

## Später / optional

- **ElevenLabs-Stimme** (kostenpflichtig, noch menschlicher)
- **Weitere Plugins** nach Bedarf (Anleitung in `jarves-os\plugins\README.md`)
