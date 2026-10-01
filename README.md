# Jarves-OS

**Felix' Kommandozentrale für Hermes – mit Luzzy in der Mitte.**

Jarves-OS ist eine eigene Desktop-App (Electron) für den Donnerwolf-Shop. Sie verbindet sich mit dem lokalen Hermes
und macht daraus eine Sprach- und Klick-Zentrale: Luzzy (Hermes-Profil `donnerwolf`) hört zu, antwortet mit ihrer
eigenen, lokalen Stimme, verteilt Aufgaben an ihre Crew, meldet Bestellungen und Mails, kennt Termine, Wetter,
Aufgaben und Notizen, findet und bearbeitet Dateien, steuert den PC – und vieles davon funktioniert sogar ohne Internet.

> **Grundregel: Hermes selbst wird nie verändert.** Jarves-OS nutzt nur, was Hermes von Haus aus anbietet
> (REST, WebSocket, eingebaute Befehle) und update-feste Einstellungen (Profile, config) – immer mit Sicherung.
> Nichts wird nachgebaut, was Hermes schon kann. Ein Hermes-Update macht nichts kaputt.

**Grundprinzip: Hermes ist das Gehirn, Jarves-OS ist das Gesicht.** Agenten, Werkzeuge, Skills, Gedächtnis, Jobs,
Kanban, Spracherkennung und Modelle kommen aus Hermes. Jarves-OS zeigt das schöner an, macht es per Stimme bedienbar
und bündelt alles an einem Ort.

- **Ziele:** mit Luzzy reden wie Tony Stark mit JARVIS · alle Agenten, Jobs und Aufgaben auf einen Blick · alles zum
  Shop auf Zuruf · Luzzy verteilt Arbeit an die Crew · Automationen und Meldungen im Blick.
- **Bewusst nicht:** kein eigener Agent, keine eigene Werkzeugsammlung oder Job-Planung, kein Server im Internet,
  keine Handy-App. Jarves-OS läuft nur auf Felix' PC.

## Inhalt

1. [Einrichten](#einrichten)
2. [Starten](#starten)
3. [Bedienung auf einen Blick](#bedienung-auf-einen-blick)
4. [Die Oberfläche](#die-oberfläche)
5. [Luzzy und die Crew](#luzzy-und-die-crew)
6. [Sprechen und Zuhören](#sprechen-und-zuhören)
7. [Luzzys Stimme (Pocket TTS)](#luzzys-stimme-pocket-tts)
8. [Alle Sprachbefehle](#alle-sprachbefehle)
9. [Dateien finden, anzeigen und bearbeiten](#dateien-finden-anzeigen-und-bearbeiten)
10. [PC-Steuerung](#pc-steuerung)
11. [Mehrere Gespräche](#mehrere-gespräche)
12. [Diktat, Ideen und Zwischenablage](#diktat-ideen-und-zwischenablage)
13. [Mini-Modus](#mini-modus)
14. [Meldungen und Wächter](#meldungen-und-wächter)
15. [Notfall-Luzzy (ohne Internet)](#notfall-luzzy-ohne-internet)
16. [Plugins](#plugins)
17. [Einstellungen](#einstellungen)
18. [Was in Hermes eingerichtet ist](#was-in-hermes-eingerichtet-ist-update-fest)
19. [Sicherheit, Regeln und Datenschutz](#sicherheit-regeln-und-datenschutz)
20. [Probleme lösen](#probleme-lösen)
21. [Sichern, Git und Updates](#sichern-git-und-updates)
22. [Aufbau (für Entwickler)](#aufbau-für-entwickler)

---

## Einrichten

**Voraussetzungen**

| Was | Wofür | Pflicht? |
|---|---|---|
| Windows 10/11 | PC-Steuerung, Musik-Erkennung, Verknüpfungen | ja |
| [Node.js](https://nodejs.org) (LTS) | Jarves-OS selbst | ja |
| Hermes mit Profil `donnerwolf` | Luzzy, Crew, Spracherkennung | ja |
| [uv](https://docs.astral.sh/uv/) | Luzzys Stimme (Pocket TTS) | ja, für die Stimme |
| Hugging-Face-Konto | einmalige Freigabe für Pocket TTS | ja, für die Stimme |
| Mikrofon / Headset | Sprechen mit Luzzy | empfohlen |
| [Ollama](https://ollama.com) | Notfall-Luzzy ohne Internet | optional |

**Einmalig einrichten** (jeden Befehl einzeln in PowerShell):

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
npm install
```

uv installieren (falls noch nicht da):

```
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Pocket TTS freischalten: auf [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts) anmelden,
den Bedingungen zustimmen, dann einmal anmelden (der Schlüssel bleibt auf dem PC, niemandem weitergeben):

```
uvx hf auth login
```

Beim ersten Start lädt Pocket TTS das deutsche Modell (gut 200 MB). Das dauert einmalig ein paar Minuten.

## Starten

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
npm start
```

Oder ohne Terminal: **Einstellungen → Start & Sicherung → „Verknüpfung auf dem Desktop anlegen“** (dort auch
„Mit Windows starten“). Hermes muss nicht vorher laufen: Jarves-OS dockt an ein laufendes Hermes an oder startet es selbst.

Sobald Hermes bereit ist, startet Jarves-OS auch den **Hermes-Gateway** (Telegram & Co., ein Gateway für alle
Profile) mit Hermes' eigenem Befehl `hermes -p default gateway start` (`src/main/gateway.js`). Läuft er schon,
passiert nichts. Er läuft losgelöst weiter, auch wenn Jarves-OS geschlossen wird; stoppen mit
`hermes -p default gateway stop`. Abschalten: **Einstellungen → Hermes-Gateway beim Start mitstarten**.

Beim Start fährt die **Donnerwolf-Startsequenz** hoch (Systemcheck: Hermes, Luzzy, Stimme, Plugins, Shopify,
Postfach), danach begrüßt Luzzy dich passend zur Tageszeit mit Bestellungen über Nacht, Mails, Terminen, Aufgaben
und Wetter. Klick oder Esc überspringt das Intro. Fenstergröße, Position und der zuletzt offene Bereich werden gemerkt.

## Bedienung auf einen Blick

**Tastenkürzel, die überall gehen** (auch wenn Jarves-OS im Hintergrund ist):

| Taste | Wirkung |
|---|---|
| **Strg+Leertaste** / **„Hey Luzzy“** | Sprechen |
| **Strg+Umschalt+H** | Freihändig an/aus (aus = Luzzy hört nur auf Knopfdruck, gut mit Headset oder in Anrufen) |
| **Strg+Umschalt+L** | Zwischenablage an Luzzy (aus jedem Programm) |
| **AltGr+L** / **Strg+Umschalt+M** | Mini-Modus an/aus |

**Tastenkürzel im Fenster:**

| Taste | Wirkung |
|---|---|
| **Strg+F** | Suchleiste oben in der Kopfleiste: Bots, Bereiche, Befehle, Notizen und Dateien |
| **Strg+P** | Befehlspalette: alle Befehle, Bereiche, Tastenkürzel und Sprachbefehle zum Tippen |
| **Strg+K** | Luzzys Chat öffnen/schließen (im Crew-Bereich) |
| **Strg+B** / **Strg+J** | Linke / rechte Leiste ein- und ausklappen |
| **Strg+Alt+←/→/↑** | Fenster an die linke/rechte Bildschirmhälfte / ganzer Bildschirm |
| **Strg+S** | Geöffnete Datei speichern (in der Dateiansicht) |
| **Esc** | Luzzy verstummt, Fenster schließen |

- **Oben:** Hermes, Mikrofon, Shopify, Postfach (grün = verbunden, Klick = neu prüfen), Nicht-stören-Symbol,
  Suchleiste, Datum, Uhrzeit und laufende Timer. Ist das Fenster schmal, kürzt sich die Leiste von selbst: erst das
  Datum, dann die Namen, zuletzt nur noch die farbigen Punkte (Name beim Drüberfahren). Klick auf „Mikrofon“ schaltet Freihändig um.
- **Suchleiste** (oben in der Kopfleiste, in jedem Bereich, Strg+F): nach allem suchen, der Treffer öffnet sich in der App. Gruppen:
  **Bots** (öffnet ein kleines Chat-Fenster unten rechts: direkt mit Kira, Lira oder Milla schreiben – derselbe Chat
  wie im Crew-Tab, ⤢ öffnet ihn groß), **Bereiche** und **Befehle** (wie in der Befehlspalette), **Notizen** aus dem
  Vault, **Dateien** auf dem PC (ohne Programm- und Hermes-Innereien) und ganz unten „Luzzy fragen“.
  ↑ ↓ wählen, Enter öffnet, Esc schließt.
- **Anhänge:** Büroklammer links in der Eingabe, Datei ins Fenster ziehen oder Bild mit Strg+V. Geht mit der nächsten
  Nachricht an das Gespräch, in dem du schreibst: Zentrale und Luzzys Chat an Luzzy, die Crew-Eingabe an den gewählten
  Bot (Kira, Lira …). Die Kärtchen stehen über der Eingabe, ✕ entfernt eins. Technik: `anhaenge.js`, Hermes hängt sie
  an die Sitzung des Kanals (`hermes.js: anhangHinzufuegen`).
- **Senden und Stopp:** runder goldener Knopf rechts, Pfeil = Senden (oder Enter), Quadrat = Stopp, solange die KI
  antwortet (`sendeknopf.js`).
  Hermes bekommt Bilder als Bild, PDFs Seite für Seite, den Rest als Datei.

## Die Oberfläche

**Links** die Bereiche, **in der Mitte** der gewählte Bereich, **rechts** Karten (Wetter, Crew live, Meldungen, Heute, Crew,
Timer, Plugin-Karten – welche und in welcher Reihenfolge stellst du in den Einstellungen ein). Die Farben wechseln
mit der Tageszeit: morgens heller, abends wärmer und dunkler.

| Gruppe | Bereich | Was er kann |
|---|---|---|
| **Luzzy** | **Zentrale** | **Cockpit** (siehe unten) und die Chat-Eingabe; Luzzys Reaktor sitzt unten in der rechten Spalte. Ohne Cockpit: Reaktor, Untertitel, Schnellbefehle, 📌 Antwort merken |
| | **Crew** | Bot-Karten, Normaler Chat, Bot Mode, Arbeitsbühne (siehe unten) |
| **Automation** | **Jobs** | Hermes-Jobs ansehen, ausführen, pausieren, löschen (mit Rückfrage) |
| | **Kanban** | Hermes-Kanban-Board |
| | **Routinen** | Auslösewort → Auftrag, mit Zeitplan und Schnellbefehlen |
| **Werkzeuge** | **Aufgaben** · **Kalender** · **Fokus** · **Gedanken** · **Wetter** · **Meilensteine** | Plugins, siehe [Plugins](#plugins) |
| **Wissen** | **Bibliothek** · **Entscheidungen** | Texte aus deinen eigenen Ordnern lesen, offene Entscheidungen – nur lesend |
| **System** | **System** | Hermes, PC (Festplatte, Grafikkarte), Ollama, Nutzung/Kosten, **Kosten-Wächter**, **Shopify-Zugang**, **Selbsttest** |
| | **Terminal** | PowerShell in Jarves-OS mit den gängigen Hermes-Befehlen zum Anklicken und eigenen gespeicherten Befehlen (siehe unten) |

**Cockpit in der Zentrale** – auf einen Blick sehen, was los ist (abschaltbar: Einstellungen → Aussehen):

- **Instrumente:** Erfolgsquote der Agenten (mit Verlauf der letzten 14 Tage) · **Mission Control** mit der Zahl der
  Aufträge der letzten 30 Tage und dem Systemstatus · Ø Bearbeitungszeit (vom Auftrag bis zur fertigen Antwort) ·
  darunter Systemstatus, CPU, RAM und Festplatte.
- **Agenten-Orchestrierung:** Luzzy als Chefin oben (mit „arbeiten gerade“), darunter die 4 aktivsten Bots mit Anteil
  an den Aufträgen der letzten 24 Stunden, Ø Antwortzeit und Sitzungen. Ein Bot, der gerade arbeitet, leuchtet gold.
  Klick auf einen Bot öffnet das kleine Chat-Fenster.
- **Zentrale = nur Cockpit und Chat-Eingabe.** Luzzy (Reaktor, Name, Zustand, Sprach-Welle) sitzt unten in der rechten
  Spalte, ohne Untertitel – ihre Antworten hörst du, der Verlauf steht im Crew-Tab. Die Schnellbefehl-Knöpfe sind
  ausgeblendet (Routinen gehen weiter per Auslösewort, Befehlspalette oder Suchleiste). Freigabe-Karten und Anhänge
  erscheinen wie gewohnt über der Eingabe. Cockpit aus (Einstellungen → Aussehen): alles wieder wie früher.
- **So wird gerechnet** (Hermes selbst führt keine Erfolgsquote): Ein Auftrag ist jede Nachricht an einen Agenten – von
  dir oder von einem anderen Bot. Erfolgreich, wenn danach eine fertige Antwort kommt; gescheitert, wenn keine kommt.
  Ein gescheiterter Auftrag in den letzten 24 Stunden oder ein nicht erreichbarer Dienst setzt den Status auf
  „Eingeschränkt“, ohne Hermes auf „Gestört“. Jarves-OS rechnet nur, solange die Zentrale zu sehen ist.

**Terminal** (System → Terminal):

- Eine **echte PowerShell-Konsole** direkt in Jarves-OS, gebaut mit den Standard-Bausteinen **xterm.js** (Anzeige) und
  **node-pty** (Konsole) – wie das Terminal in VS Code. Farben, Tab-Vervollständigung, Pfeiltasten, Strg+C laufen wie
  gewohnt; auch interaktive Programme (`hermes chat`, `hermes model`, `hermes setup`) laufen direkt darin.
  `hermes …` geht ohne Pfad. Die Konsole läuft weiter, wenn du den Bereich wechselst.
- **Strg+C** kopiert markierten Text (sonst bricht es den laufenden Befehl ab), **Strg+V** fügt ein.
  „↻ Neu“ startet die Konsole neu. Leeren: `cls` eintippen.
- **Meine Befehle** (rechts): eine Liste zum Anklicken. Am Anfang 5 Standardbefehle (Hermes-Status, Gateway-Status,
  Gateway neu starten, Nach Update suchen, Nur Fehler). **Jeden** kannst du löschen (✕ beim Drüberfahren), eigene mit
  Name und Befehl speichern, „Standard wiederherstellen“ holt gelöschte Standardbefehle zurück. Befehle, die etwas
  stoppen, neu starten, löschen oder aktualisieren (⚠), fragen vorher nach.
  Gespeichert in einer eigenen Datei: `daten	erminal-befehle.json` (lokal, nicht im Git-Projekt, in „Jarves-OS sichern“
  enthalten). Von Hand bearbeiten geht auch – dabei Jarves-OS geschlossen lassen.
- Das Terminal bedienst nur du – Luzzy und die Crew haben darauf keinen Zugriff.

**Wissen & Co. im Detail** (alles nur lesend, nur im Ordner `Documents\Donnerwolf` und in den Ordnern, die du für die
Bibliothek gewählt hast):

- **Morgenbericht:** Ein Hermes-Job erstellt ihn und legt ihn unter `04_Analytics\Morgenberichte\JJJJ-MM-TT.md` ab.
  Jarves-OS zeigt ihn als Karte, liest ihn vor und startet ihn über die Routine „Morgenbericht“ (mit Zeitplan) oder
  „Heute erstellen“.
- **Bibliothek:** Texte (Markdown, Text, HTML) aus Ordnern, die du selbst bestimmst, schön formatiert. Oben
  **„+ Ordner wählen“** öffnet das Ordner-Fenster von Windows; der Ordner erscheint als Kärtchen und bleibt gespeichert
  (`daten/einstellungen.json`, `bibliothek.ordner`). Mehrere Ordner gehen. Jeder Unterordner erscheint als eigene aufklappbare Gruppe (auch verschachtelt), ✕ am
  Kärtchen nimmt einen Ordner wieder heraus (die Dateien bleiben). Es gibt keinen fest eingebauten Pfad mehr. Hier
  öffnen sich auch Notizen aus der Suchleiste, aus Notiz-Links und der Morgenbericht („Lesen“). Den Vault durchsuchst
  du über die Suchleiste (Strg+F).
- **Entscheidungen:** das Entscheidungs-Tagebuch aus `Donnerwolf-Shop\04_Decision_Log\` mit Filter gilt / überholt /
  Prüfung fällig. Neue Entscheidungen legt Luzzy an.
- **Jobs:** Hermes-Jobs aller Profile mit Zeitplan, letztem und nächstem Lauf; ausführen, pausieren, löschen (mit Rückfrage).
- **Kanban:** Hermes' eigenes Kanban-Board (Tafeln, Spalten, Aufgaben der Agenten).
- **Kosten-Wächter** (System): was Luzzy und die Crew heute und diesen Monat kosten (in Dollar, wie Hermes rechnet),
  dazu Tokens und Aufrufe, ein 14-Tage-Verlauf und wer wie viel verbraucht. Tages- und Monatsbudget eintragen:
  Luzzy warnt bei 80 % und 100 % (je einmal, als Meldung mit Warnton), auch wenn der System-Tab nicht offen ist.
  Kostenlose Modelle zählen 0 $ – dann zeigt der Verlauf die Tokens.

## Luzzy und die Crew

**Luzzy** ist Felix' rechte Hand bei Donnerwolf und läuft im Hermes-Profil `donnerwolf`. Ihr Charakter und ihre Regeln
stehen in `hermes\profiles\donnerwolf\SOUL.md`: direkt, warm, trocken im Humor, loyal, ehrliche Meinung, Ergebnis
zuerst, immer Deutsch und „du“. Jarves-OS schickt **keinen eigenen Persona-Text** mit – es gibt nur eine Luzzy, egal
ob Felix sie in der Hermes-App, in Telegram oder in Jarves-OS anspricht.

Luzzy ist die Chefin, die Crew sind die übrigen Hermes-Profile (alle außer `default`), zurzeit eine Design-Kette:
**Kira** (Trend-Scout) → **Lira** (Design-Konzept) → **Milla** (Listing-Texte für Shopify). Neue Profile erscheinen
automatisch, Bilder kommen aus `hermes\profiles\<bot>\assets\avatar.png`.

- **Aufbau wie ein Messenger:** links der Chat (oben Bild, Name und Rolle des gewählten Bots, die Reiter und
  „Aktualisieren“), rechts die Bots als Liste mit „Bot finden …“ und der Karte „Crew-Netzwerk“ (wie viele arbeiten).
  Im sehr schmalen Fenster rutscht die Bot-Liste als Leiste über den Chat.
- **Bot-Karten rechts:** Bild, Name, Rolle, zuletzt aktiv (Details wie Modell, Tokens und Kosten der letzten 30 Tage
  im Tooltip). Klick auf eine Karte öffnet den Chat mit diesem Bot, die gewählte Karte ist hervorgehoben.
- **💬 Normaler Chat:** direkt mit Luzzy, Kira, Lira oder Milla, ohne Bot Mode. Pro Bot mehrere Chats
  (anlegen, wechseln, mit dem Papierkorb-Symbol löschen über „Allgemein ▾“). Luzzys normaler Chat ist das Gespräch der Zentrale.
- **Aktualisieren** (oben rechts): lädt Bot-Karten und Bot-Liste neu und holt den offenen Chat frisch aus Hermes –
  z. B. nachdem du in der Hermes-App Nachrichten oder einen Chat gelöscht hast. Nichts geht dabei verloren.
  Hermes löscht einen Chat nicht, solange Jarves-OS ihn offen hat: dann erst in Jarves-OS zu einem anderen Chat wechseln.
- **🤖 Bot Mode:** der „Bot Chat“ eines Bots – dort arbeiten die Bots zusammen; bei Luzzy: Crew-Aufträge.
  Den Bot Chat nur für die Zusammenarbeit nutzen, sonst wird er lang, teuer und unübersichtlich.
- **🎬 Arbeitsbühne:** live sehen, wie die Bots zusammenarbeiten: Kette Luzzy → Kira → Lira → Milla, ein Brief wandert
  bei jeder Übergabe, darunter der Ablauf des Auftrags (Klick: ganzer Auftrag und Antwort, „Bot Chat öffnen“).
  Die Bot-Karten oben leuchten gold, solange ein Bot arbeitet. Jarves-OS liest die Bot Chats dafür nur mit.
- **Crew live (rechte Spalte):** zeigt immer nur den Bot, der gerade dran ist – Bild, was er tut („sucht im Netz · 1:20“),
  den Auftrag und eine kleine Kette (gold = arbeitet, grün = fertig). Ist er fertig und gibt weiter, wechselt die Karte
  von selbst zum nächsten Bot. Klick öffnet die Arbeitsbühne. Ein- und ausschalten: Einstellungen → Rechte Spalte.
- **Beim Namen rufen:** „Kira, was ist gerade Trend?“ geht in der Zentrale direkt an Kira (Antwort als Untertitel).
- **Neuen Bot anlegen:** „＋ Neuer Bot“ oben in der Bot-Liste. Name, Rolle (daraus wird das Profil, z. B.
  `freya-social-media-bot`), Bild (optional), **Wofür ist er da?** (1–2 Sätze – daran erkennt Luzzy, wann sie ihn
  fragt), **Aufgaben und Charakter** (kommt in seine `SOUL.md`) und **Einstellungen übernehmen von** (Modell,
  Zugänge und Skills eines bestehenden Bots, ohne Messenger-Kanäle). Angelegt wird mit Hermes' eigenem Befehl
  `hermes profile create` – update-fest, am Hermes-Programm ändert sich nichts. Hermes nimmt jeden Bot automatisch ins
  Crew-Team auf; danach öffnet sich gleich der Chat mit ihm.
  **Luzzy hilft:** „✨ Luzzy schreibt die SOUL“ macht aus Name, Rolle und Stichworten die komplette SOUL.md (Aufbau wie
  bei Kira: Rolle, harte Grenzen, andere Bots, Arbeitsweise, Übergabe-Format, Stil) – sie wird genau so gespeichert.
  „🎨 Bild-Prompt von Luzzy“ liefert Prompt und Negativ-Prompt im Stil von Kira, Lira und Milla (gesichtsloser
  schwarzer Helm, Gold, nordische Muster, eigenes Erkennungszeichen), mit Kopier-Knöpfen. Beides läuft als einmalige
  Anfrage an Luzzys Modell und landet nicht in ihrem Chat. Die Anleitung dafür ist ihr Skill `jarves-bot-erstellen` –
  im Chat klappt es also genauso („Gib mir einen Bildprompt für Freya“).
- **Modell ändern:** Zahnrad auf der Bot-Karte. Liste mit Suche, Anbieter zum Ein- und Ausklappen.
- **Profil und SOUL:** Klick auf Bild oder Namen des Bots oben im Crew-Chat öffnet sein Profil (Bild, Rolle, Modell,
  Beschreibung) mit der `SOUL.md`. „Bearbeiten“, dann „Speichern“ oder Strg+S; ungespeicherte Änderungen fragen vor
  dem Schließen nach. Vor jedem Speichern landet die alte Fassung in `daten\datei-sicherungen\soul\`. Wurde die SOUL
  inzwischen woanders geändert, wird nicht überschrieben. Hermes nimmt die neue SOUL ab dem nächsten neuen Chat.
  Technik: `src/main/botprofil.js`, `src/renderer/botprofil.js`.
- **Im Crew-Bereich hört Luzzy nicht von selbst mit** (z. B. Musik im Headset). Sprechen geht dort mit Strg+Leertaste.
- **Freigaben:** Bei riskanten Befehlen erscheint eine Karte (Einmal erlauben · Für dieses Gespräch · Ablehnen) und
  Luzzy sagt, worum es geht – einfach „Ja“ oder „Nein“ sagen. Unter Luzzys Ja-Fragen stehen „Ja, mach“ / „Nein“.
- **Termine und Aufgaben über Luzzy:** „Luzzy, trag mir morgen um 10 Zahnarzt ein“, „Leg mir die Aufgaben an: Stativ
  aufbauen bis Samstag, Video schneiden bis Sonntag“. Luzzy nutzt dafür die Werkzeuge `jarves_kalender` und
  `jarves_aufgaben` (Hermes-Plugin `jarves-planer`), der Eintrag erscheint sofort im Kalender bzw. in der Aufgabenliste.
  Meldet Überschneidungen; ein Datum am Ende des Aufgabentexts („… bis Samstag“) wird als Fälligkeit erkannt.
  **Details zu Aufgaben:** „Schreib bei der Aufgabe Video 1 in die Details: …“, „Ergänze bei … noch …“, „Was steht in
  den Details von …?“ Luzzy hält den Titel kurz und schreibt Notizen und Schritte in das Feld Details.
- **Luzzy muss nicht suchen:** Bei Fragen zu Wetter, Terminen, Aufgaben und Notizen schickt Jarves-OS die Daten samt
  Datum und Uhrzeit gleich mit.

## Sprechen und Zuhören

- **Spracherkennung** macht Hermes (lokal, Deutsch). Aktivierungswort **„Hey Luzzy“**, oder Strg+Leertaste / Mikrofon-Knopf.
- **Freihändig** (Standard an): Luzzy hört von selbst auf „Hey Luzzy“. Aus = nur auf Knopfdruck. Umschalten:
  Strg+Umschalt+H, Klick auf „Mikrofon“ oben oder in den Einstellungen.
- **Gesprächsmodus:** Nach Luzzys Antwort hört sie kurz weiter zu, du kannst direkt weiterreden.
- **Früh vorlesen:** Luzzy spricht, sobald der erste Satz fertig ist, nicht erst am Ende der Antwort.
  Lange Antworten liest sie gekürzt vor („Den Rest hab ich dir unten hingeschrieben“).
- **Unterbrechen:** einfach reinreden, „Stopp“ / „Hey Luzzy“ sagen oder Esc. Luzzy lernt dabei ihr eigenes Echo
  kennen und bricht nicht wegen ihrer eigenen Stimme ab.
- **Musik erkennen:** Läuft Musik oder ein Video auf dem PC, zählt das nicht als Sprache; bei „Hey Luzzy“ pausiert
  die Musik kurz und läuft danach weiter.

## Luzzys Stimme (Pocket TTS)

Luzzy spricht mit **Pocket TTS** (Kyutai, deutsches Modell), **komplett lokal auf dem PC**. Kein Text geht dafür ins
Internet, es kostet nichts, und die Stimme ist schneller als Echtzeit.

- **13 weibliche Stimmen:** Alba, Anna, Azelma, Caro, Cosette, Eponine, Estelle, Eve, Fantine, Jane, Lola, Mary, Vera.
  Alle sprechen Deutsch; die Sprecherinnen stammen aus anderen Sprachen, ein leichter Akzent ist möglich.
- **Eigene Stimme:** eine saubere Aufnahme (WAV/MP3, 10 bis 30 Sekunden, ohne Musik) wählen – **nur von jemandem,
  der zugestimmt hat**.
- **Tempo** (−20 bis +20 %) und **Lautstärke** (100 bis 400 %, Standard 250 %; ein Begrenzer verhindert Übersteuern).
- **Probe hören** in Einstellungen → Stimme. Dort steht auch, ob Pocket TTS läuft.
- Jarves-OS startet `uvx pocket-tts serve --language german` beim Start selbst (nur auf 127.0.0.1) und beendet es
  beim Schließen. Nach dem Start braucht Luzzy ein paar Sekunden, bis sie sprechen kann.

## Alle Sprachbefehle

Diese Befehle erledigt Jarves-OS **selbst** – sofort, ohne auf Hermes zu warten, kostenlos und ohne Internet.
Alles andere geht an Luzzy. Die komplette Liste steht auch in der Befehlspalette (Strg+P).

| Thema | Beispiele |
|---|---|
| Stoppen / Wiederholen | „Stopp“, „Sei still“, „Das reicht“ · „Wiederhol das“, „Was hast du gesagt?“ |
| Timer & Wecker | „Timer 15 Minuten für die Nudeln“, „Weck mich um 7“, „Erinner mich um 14 Uhr an den Anruf“, „Wie lange noch für die Nudeln?“, „Timer um 5 Minuten verlängern“, „Nudel-Timer stoppen“ |
| Nicht stören | „Bis 15 Uhr keine Meldungen“, „Nicht stören für 30 Minuten“, „Bitte nicht stören“ (1 Stunde), „Meldungen wieder an“ |
| Freihändig | „Hör nur auf Knopfdruck“, „Freihändig aus“ bzw. Strg+Umschalt+H |
| Selbsttest | „Mach einen Selbsttest“, „Systemcheck“ |
| Gespräche | „Neues Gespräch Shop“, „Wechsel zum Gespräch Privat“, „Welche Gespräche gibt es?“ |
| Dateien | „Such die Datei Thor-Hoodie und öffne sie“, „Öffne die Preisliste“, „Zeig mir das Bild Logo“, „die zweite“ |
| Datei ändern | (Datei offen) „Ändere den Preis auf 39 Euro“, „Kürze den zweiten Absatz“, „Übersetze das ins Englische“ |
| PC-Steuerung | Sofort: „Öffne Photoshop“, „Lauter“, „Lautstärke auf 30 Prozent“, „Nächstes Lied“, „Musik Pause“, „Öffne Downloads“, „Sperr den PC“. Über Luzzy: „Öffne Netflix und such Terminator“, „Spiel Metallica auf YouTube“, „Mach mir den Link in Chrome auf“ |
| Diktat | „Diktat“ (lange Aufnahme), „Diktat: …“, „Schreib eine Mail an Jana, dass …“ |
| Ideen & Notizen | „Neue Idee: …“ (in den Vault), „Merk dir: Stoffproben bestellen“ |
| Aufgaben | „Neue Aufgabe: Etiketten bestellen bis Freitag“, „Erledigt: Etiketten“, „Was muss ich heute noch?“ |
| Fokus | „Fokus 25 Minuten“, „Fokus beenden“ |
| Routinen | das Auslösewort, z. B. „Morgenbericht“, „Feierabend“, „Shop-Check“ |
| Crew | „Kira, …“, „Lira, …“, „Milla, …“ |
| Freigaben | „Ja“ / „Nein“, wenn eine Freigabe-Karte offen ist |

## Dateien finden, anzeigen und bearbeiten

**Finden:** „Luzzy, such die Datei … und öffne sie“ oder in die Eingabe tippen. Jarves-OS durchsucht den **ganzen PC**
(alle Laufwerke, auch AppData und OneDrive) – außer Windows- und Programmordnern. Der Index wird im Hintergrund
aufgebaut und gemerkt (`daten\dateiindex.txt`). Hörfehler werden verziehen („Donnerwolf Soul“ findet `SOUL.md`).
Mehrere Treffer: Liste zum Anklicken oder „die zweite“ sagen. Auch ein Pfad geht direkt.

**Anzeigen:** Die Datei erscheint in einem Fenster über Jarves-OS, ohne eigenen Tab: Notizen (Markdown), Texte,
Tabellen (CSV), Bilder, PDF, Videos und Musik. Alles andere (Word, Excel …): „Mit Programm öffnen“ oder „Im Ordner zeigen“.

**Bearbeiten:** Knopf „Bearbeiten“, dann selbst tippen – oder Luzzy sagen, was sie ändern soll. Ihre Änderungen
erscheinen **live** im Text und als Liste zum Nachvollziehen. **Gespeichert wird nur, wenn du auf „Speichern“ klickst
(oder Strg+S)** – Luzzy speichert nie selbst. Vor jedem Speichern legt Jarves-OS eine Sicherung an
(`daten\datei-sicherungen\`), „Rückgängig“ holt den alten Stand zurück. Wurde die Datei inzwischen woanders geändert,
warnt Jarves-OS, statt zu überschreiben.

**Nie gefunden oder gezeigt** werden geheime Dateien: Hermes-`config.yaml`/`.env`/Zugänge, Schlüssel und Tokens,
Browser- und Windows-Anmeldedaten.

## PC-Steuerung

Zwei Stufen:

**1. Sofortbefehle (ohne KI, sofort).** Nur wenn der **ganze Satz** genau der Befehl ist
(`src/renderer/pcsteuerung.js`):

- **Ton und Musik:** lauter/leiser (auch „viel“, „etwas“), „Lautstärke auf 30 Prozent“, „Ton aus“, „Nächstes Lied“,
  „Vorheriges Lied“, „Musik Pause/weiter“.
- **Ordner:** Desktop, Downloads, Dokumente, Bilder, Musik, Videos, Donnerwolf, Jarves-OS.
- **PC sperren.**
- **Programme:** „Öffne Photoshop“, „Starte Spotify“, „Mach Discord auf“ (höchstens 4 Wörter, ohne Adresse, ohne
  „und“). Nur wenn es das Programm im Startmenü gibt, sonst geht der Satz an Luzzy.

**2. Alles andere versteht Luzzy** und steuert den PC selbst mit ihrem Werkzeug `pc_steuern`: Seiten und Links
öffnen („Mach mir den Link mal auf“, „Öffne das in Chrome“), auf YouTube, Google, Amazon, Etsy … suchen (sie baut die
Such-Adresse selbst), Programme, Lautstärke, Musik, Ordner, PC sperren. Schickst du ihr einen Link zum Anschauen
(„https://… schau mal da rein“), liest sie ihn und öffnet ihn **nicht** am PC. Dauert 1 bis 3 Sekunden.

So läuft Stufe 2: Hermes-Plugin `jarves-pc` (in Luzzys Profil) → lokale Brücke in Jarves-OS
(`src/main/pcbruecke.js`, nur 127.0.0.1 mit Zufallsschlüssel, Zugang in `%APPDATA%\jarves-os\pc-bruecke.json`,
solange Jarves-OS läuft) → `src/main/pc.js`, das jede Aktion prüft. Ist Jarves-OS zu, sagt Luzzy das. Aus Telegram
und anderen Messengern geht es nie (das Plugin prüft die Herkunft, bei Telegram ist es zusätzlich ausgeblendet).

**Nie:** beliebige Befehle, Herunterfahren, Programme schließen, Programme über einen Pfad starten, andere Adressen
als http/https.

## Mehrere Gespräche

Themen getrennt halten (Shop, Privat, ein Projekt): Liste oben im Gespräch („Allgemein ▾“), Wechsel mit einem Klick
oder per Stimme. Jedes Thema ist eine eigene Hermes-Unterhaltung, Luzzy behält pro Thema den Faden.
Löschen geht nur mit Rückfrage.

## Diktat, Ideen und Zwischenablage

- **Diktat:** frei drauflos reden, auch länger (Pausen bis 3,5 Sekunden). Luzzy macht daraus eine fertige Mail,
  Nachricht oder einen Text und legt ihn **in die Zwischenablage** (Strg+V). Abschicken tust du selbst.
- **„Neue Idee: …“** – Luzzy legt eine saubere Notiz mit Datum und Schlagworten in den Vault
  (`Donnerwolf-Shop\Jarves-OS\Ideen\`, das Original-Diktat steht mit drin).
- **📌 Antwort merken:** speichert eine Antwort als Notiz in `Donnerwolf-Shop\Jarves-OS\Gemerkte Antworten\`.
- **Zwischenablage an Luzzy:** in irgendeinem Programm Text kopieren, **Strg+Umschalt+L**: zusammenfassen,
  verbessern, übersetzen oder beantworten. Das Ergebnis kommt zurück in die Zwischenablage.

## Mini-Modus

Eine kleine schwarze **Insel, die oben in der Bildschirmmitte aus der Kante kommt** (ohne Rahmen, mit geschwungenem
Übergang, so sieht sie aus wie ein Teil des Bildschirms), **immer ganz vorne**, egal was offen ist (auch vor anderen
Fenstern, die „immer im Vordergrund“ sind: sie holt sich jede Sekunde den obersten Platz zurück, ohne den Fokus zu nehmen;
nur Spiele im exklusiven Vollbild zeichnen darüber). So kannst du jederzeit mit Luzzy reden,
ohne dass Jarves-OS Platz braucht.

**Sie stört nicht:** Nach 4 Sekunden ohne Maus und ohne Luzzy verschwindet sie nach oben, und Klicks gehen dann durch
(z. B. auf Browser-Tabs darunter). Zurück holst du sie, indem du die Maus **ganz an die obere Kante über ihr** schiebst.
Von selbst taucht sie auf bei einer **Meldung** und solange Luzzy zuhört, nachdenkt oder spricht.

- **Fenni**, ein kleiner Wolf (Fenrirs kleiner Bruder) mit ganzem Körper im Chibi-Stil (großer Kopf, runder Körper,
  Pfoten mit rosa Ballen, buschiger Schwanz). Wenn Luzzy nichts tut, sitzt er, steht nach einer Weile auf,
  **spaziert durch die Insel**, bleibt stehen, schnüffelt und setzt sich woanders wieder hin; läuft er über Uhr oder
  Termin, werden diese kurz blass, der warme Schein wandert mit ihm. Er zeigt, was Luzzy gerade tut: atmet und
  blinzelt (bereit), läuft zurück in die Mitte und spitzt die Ohren (hört zu), schaut nach oben mit Denk-Punkten
  (denkt nach), bewegt das Maul mit ihrer Stimme (spricht), hüpft vor Freude, wedelt und hechelt danach (Antwort
  fertig), legt sich hin und schläft (keine Verbindung zu Hermes). Bei Meldungen und beim Streicheln wedelt er.
  Endet Luzzys Antwort mit einer Frage oder wartet sie auf deine Freigabe, **legt er den Kopf schief** (mit „?“);
  bei einer Freigabe bleibt die Insel sichtbar, bis du antwortest. Bei einem **Meilenstein** (z. B. 1.000. Bestellung,
  Bereich Meilensteine) **heult er wie ein Wolf**.
- **Datei auf Fenni ziehen:** Er reißt das Maul auf, beim Loslassen frisst er sie. Die Datei hängt dann an Luzzys
  nächster Nachricht (wie die Büroklammer); Klick auf Fenni und sag, was sie damit machen soll. Ist die Insel versteckt,
  erst mit der Datei an die obere Kante, dann kommt sie.
- **Versteckt:** Ab und zu guckt Fenni kopfüber über die obere Bildschirmkante, erst die Ohren, dann die Augen, schaut
  zur Maus und verschwindet wieder (Klicks gehen weiter durch).
  Ab und zu hechelt er auch von selbst. Seine Augen folgen der Maus über den ganzen Bildschirm, seine Farben kommen
  aus dem Design.
- **Links:** Uhrzeit, darunter das Wetter aus dem Wetter-Plugin (ohne Wetter: das Datum).
- **Rechts:** was Luzzy gerade sagt (Ende ihres Satzes, bleibt nach der Antwort 7 Sekunden stehen), sonst was sie tut
  („Ich höre zu …“, „Arbeitet …“ mit dem Werkzeug), sonst der nächste Termin von heute oder morgen (Kalender-Plugin)
  und die offenen Aufgaben (Aufgaben-Plugin).
- **Meldungen** (neue Bestellung, Mail, Job, Crew …): die Insel klappt 9 Sekunden nach unten auf, Fenni horcht auf.
  Klick auf die Meldung öffnet das große Fenster. Bei „Nicht stören“ bleibt sie zu.
- **Hintergrund:** feine Lichtpunkte rieseln wie auf einem alten Röhrenbildschirm (Zeilen, leises Flackern, warmer
  Schein, der mit Luzzys Stimme pulsiert). Beim Einschalten kommt die Insel aus der Kante, die Anzeige geht wie eine
  Röhre aus einem hellen Strich an, die Punkte kreisen kurz als Ring um Fenni und legen sich dann an die Ränder.

**AltGr+L** oder Strg+Umschalt+M: an/aus · **Klick:** sprechen (Fenni hüpft) · **Doppelklick:** großes Fenster ·
**Rechtsklick:** Fenni anstupsen (dreimal schnell: schwindelig) · **Maus über Fenni hin und her:** streicheln
(Augen zu, Ohren angelegt, hechelt).
Technik: `src/renderer/mini.html` + `mini.js` (Insel), `src/renderer/fenni/` (`fenni.js` Steuerung, `koerper.js` Kopf,
`augen.js`, `rumpf.js` Körper in den Haltungen sitzen/seitlich/liegen, `spaziergang.js` wohin er läuft und wann, `gucken.js` Gucken über die Kante,
`effekte.js`, `farben.js`, `sterne.js` Hintergrund auf eigener Ebene), nur Canvas, keine Bilder.
Fenster 480 × 64 Pixel direkt an der oberen Kante; Verstecken und Zurückholen steuert `main.js` (`miniLage`,
`mini:sichtbar`, versteckt mit `setIgnoreMouseEvents`); für eine Meldung 44 Pixel höher (`mini:hoehe`, sonst bliebe ein
unsichtbarer Streifen, der Klicks auf Browser-Tabs schluckt). Die Infos sammelt `src/renderer/miniinfo.js` im großen
Fenster (jede Minute und sofort bei Änderungen an Terminen und Aufgaben); die Mausposition schickt `main.js`
(`mini:blick`), solange der Mini-Modus an ist.

**„Luzzy, was siehst du?“** (nur im Mini-Modus): Luzzy macht **ein** Bildschirmfoto vom Bildschirm mit der Maus,
sagt, was sie sieht, und hilft bei dem, was offen ist (Fehlermeldung, Shopify-Seite, Design). Geht nur auf deinen Befehl,
nie heimlich; die Leiste leuchtet dabei weiß. Das Foto wird nicht gespeichert. Auch: „Schau dir das an“,
„Schau mal auf den Bildschirm“, „Kannst du das sehen?“ – gern mit Frage dahinter („Was siehst du, warum geht das nicht?“).

## Meldungen und Wächter

Jarves-OS prüft regelmäßig und meldet (rechts in der Liste und auf Wunsch laut, mit Ton):

- **Neue Bestellungen** – „Der Laden redet mit dir“: „Thor-Hoodie in L nach Hamburg, dritte Bestellung von dieser
  Person“. Ohne Namen und Adresse, nichts wird gespeichert. Ton: Horn.
- **Neue Mails** (über das IONOS-Mail-Plugin von Hermes), **fehlgeschlagene Jobs** (Warnton),
  **Meilensteine** (10., 25., 50., 100. … 1.000. Bestellung, danach alle 500 – Luzzy feiert mit),
  **Termine, fällige Aufgaben, Timer, Crew-Antworten**.
- Luzzy redet nicht dazwischen, wenn du sprichst oder sie antwortet. **Ruhezeit** (z. B. 22 bis 7 Uhr),
  **Nicht stören** und **Fokus** halten sie still – die Meldungen landen trotzdem in der Liste. Timer klingeln immer.

**Shopify-Zugang erneuern:** System → Shopify-Zugang → Token eintragen → „Prüfen & eintragen“. Jarves-OS prüft ihn bei
Shopify, trägt ihn überall in Hermes ein (Hermes und alle Bots, `config.yaml` und `.env`, mit Sicherung) und lädt
Hermes neu – ohne Neustart. Der Token wird nie angezeigt, geloggt oder gespeichert.

## Notfall-Luzzy (ohne Internet)

Ist Hermes nicht erreichbar oder scheitert eine Antwort an Internet oder Cloud-Modell, antwortet Luzzy **lokal über
Ollama** (kleinstes vorhandene Modell, z. B. `gemma4:12b`; Jarves-OS startet Ollama selbst). Sie kennt Datum,
Uhrzeit, Termine, Aufgaben und Notizen; Shop, Mails und Internet gehen dann nicht, das sagt sie ehrlich.
Solche Antworten sind mit **„🛟 Notbetrieb“** markiert. Timer, Notizen, Aufgaben, PC-Sofortbefehle, Dateisuche und
Luzzys Stimme laufen ohnehin ohne Internet (Seiten, Suchen und Links öffnen geht nur mit Luzzy über Hermes).

## Plugins

Je ein Ordner in `plugins\<id>\` – eigener Bereich links, optional eine Karte rechts
(Anleitung zum Selberbauen: [`plugins/README.md`](plugins/README.md)).

| Plugin | Was es kann |
|---|---|
| **Routinen** | Deine Standardaufgaben: Auslösewort sagen oder tippen, Luzzy erledigt den hinterlegten Auftrag. Bausteine (Wetter, Termine, Shop, Postfach …) werden automatisch angehängt. Mit Zeitplan (z. B. Morgenbericht werktags 7:30) und als Schnellbefehle über der Eingabe |
| **Kalender** | Eigener Kalender (statt Google/Outlook): Monatsansicht zum Einklappen, Tagesliste, Suche, Erinnerung vor Terminen, „Heute“-Karte rechts; Luzzy trägt per Sprache ein, ändert und löscht (auch Post-Termine für Instagram/Facebook). **Mit den Aufgaben verbunden:** offene Aufgaben mit Datum stehen als „☐ …“ an ihrem Tag; **ziehen** legt sie auf einen anderen Tag, Klick öffnet sie im Bereich Aufgaben. Die Tagesliste zeigt die Aufgaben des Tages (abhaken, ✕ nimmt sie vom Tag) und die Aufgaben ohne Tag (＋ legt sie auf den gewählten Tag) |
| **Aufgaben** | To-do-Liste mit Fälligkeit und Erinnerung. **Klick auf eine Aufgabe klappt sie auf:** Details (Notizen, Schritte, Links; Markdown) lesen, mit „Bearbeiten“ Titel, Datum, Uhrzeit und Details ändern; Aufgaben mit Details tragen „≡ Details“. Luzzy schreibt und liest die Details mit ihrem Werkzeug. **Wann:** in der aufgeklappten Aufgabe mit „Heute“, „Morgen“, „+1 Woche“, „Ohne Datum“ oder dem Datumsfeld auf einen anderen Tag legen; „Im Kalender zeigen“ springt zu diesem Tag. Luzzy setzt ein Datum nur, wenn du einen Tag nennst („Leg Video 1 auf Samstag“, „Verteil die Aufgaben auf die nächsten zwei Wochen“). Dazu das **Wochen-Review**: Sonntagabend fasst Luzzy die Woche zusammen, fragt nach Zielen und legt sie als Aufgaben an |
| **Gedanken** | Gedankenspeicher: „Merk dir: …“, landet auch im Vault (`Jarves-OS\Gedankenspeicher.md`); Ideen in `Jarves-OS\Ideen\` |
| **Fokus** | Pomodoro-Timer mit Hintergrundklang; in der Fokuszeit stört Luzzy nicht |
| **Wetter** | Jetzt und 7 Tage für deinen Ort (Open-Meteo, kostenlos, ohne Konto; übertragen wird nur der Ort) |
| **Meilensteine** | Bestellungen insgesamt, der nächste Meilenstein und alle erreichten (Liste auch im Vault) |
| **Werkstatt** | Neue Plugins in eigenen Worten bestellen („Bau mir ein Plugin für …“): Luzzy baut sie in `werkstatt\`, Jarves-OS prüft Aufbau, Syntax und Rechte (✓ Sicher · ⚠ Braucht Rechte · ⛔ Vorsicht), eingebaut wird erst nach deinem Ja (altes Plugin gesichert, deine Daten bleiben). **Vorher Pflicht: Testlauf** in einem eigenen Fenster (Plugin wie echt ausprobieren; Daten nur simuliert, Hintergrundteil in einem eigenen Prozess – Absturz oder Aufhängen betrifft nur den Test). **Notbremse:** Stürzt die Oberfläche nach dem Einbauen ab oder hängt sie, wird das neue Plugin beim nächsten Start automatisch abgeschaltet (normales Schließen zählt nicht; entfernte Plugins vergisst sie). **Luzzy repariert selbst:** Sie baut mit ihrem Hermes-Skill `jarves-plugin-werkstatt`, prüft sich mit dem Prüfprogramm und liest die Fehler aus deinem Testlauf; „🔧 Luzzy soll die Fehler beheben“ schickt sie ihr. Auch eingebaute Plugins ändern lassen oder entfernen; danach Jarves-OS neu starten (Knopf) |

Plugin-Daten (`plugins\*\daten.json`) bleiben lokal und gehören nicht ins Git-Projekt.

## Einstellungen

Knopf „Einstellungen“ unten links. Gespeichert in `daten\einstellungen.json` (bleibt lokal, ist in der Sicherung enthalten).

| Tab | Was du einstellst |
|---|---|
| **Stimme** | Stimme (13 Stimmen oder eigene Aufnahme), Tempo, Lautstärke, automatisch vorlesen, Probe hören |
| **Sprechen** | Freihändig, im Crew-Bereich nicht mithören, „Hey Luzzy“, sofort abschicken, weiter zuhören, Unterbrechen, Musik erkennen, Mikrofon-Status |
| **Meldungen** | Was gemeldet und vorgelesen wird, Ton, Ruhezeit |
| **Aussehen** | **Design:** Farbdesign (Donnerwolf Gold, Nordlicht, Blutmond, Runenwald, Eisen), Hintergrund (Tiefschwarz, Normal, Etwas heller), Ecken (Kantig, Weich), Schriftgröße (Klein bis Sehr groß). Sofort sichtbar, gespeichert mit „Speichern“, Abbrechen stellt das alte Design wieder her. Dazu Animationen (Reaktor, Welle, Scanlinie, Hintergrund), Farben nach Tageszeit (passen sich jedem Design an) |
| **Rechte Spalte** | Welche Karten sichtbar sind und in welcher Reihenfolge |
| **Start & Sicherung** | Intro, Begrüßung, Verknüpfung, mit Windows starten, „Jarves-OS sichern“ |

**Neues Design anlegen:** Jedes Design ist eine eigene Datei im Ordner `designs\` (z. B. `designs\nordlicht.json`).
Eine vorhandene Datei kopieren, umbenennen (der Dateiname ist die ID: Kleinbuchstaben, Ziffern, Bindestrich), `name`,
`beschreibung`, `reihenfolge` und die Farben ändern, Jarves-OS neu starten: Das Design steht dann in den Einstellungen.
Sonst muss nichts geändert werden.

| Farbe in der Datei | Wofür |
|---|---|
| `hintergrund`, `leiste`, `flaeche`, `flaecheHoch`, `tief`, `eingabe` | Mitte, Seitenspalten, Karten, Karten beim Drüberfahren, eingelassene Flächen, Eingabefelder |
| `rahmen`, `linie` | Ränder, Trennlinien |
| `text`, `textLeise`, `gedimmt` | Schrift, leise Schrift, Abgeschaltetes |
| `akzent`, `akzentHell` | Akzentfarbe (Knöpfe, Überschriften, Reaktor) und ihre helle Variante |
| `akzentDunkel`, `akzentFlaeche`, `aufAkzent` | Akzent-Ränder, Akzent-Flächen (eigene Nachricht), Schrift auf dem Akzent |

Alle Farben als `#rrggbb`. Fehlt eine oder ist sie falsch geschrieben, gilt der Wert aus `gold.json`; eine kaputte
Datei wird übersprungen (Hinweis im Terminal). Technik: `src/main/designs.js` liest den Ordner, `app.js` (`designsLaden`)
macht daraus CSS-Regeln `:root[data-design='<id>']` und die Knöpfe. Alle Farben der App (auch Plugins, Reaktor, Terminal,
Mini-Fenster, Windows-Knöpfe) hängen an diesen Werten; „gold“ in CSS-Variablennamen heißt „Akzentfarbe“.

## Was in Hermes eingerichtet ist (update-fest)

| Wo | Was |
|---|---|
Alles liegt unter `C:\Users\Felix\AppData\Local\hermes\` in Profil- bzw. Nutzer-Einstellungen, die ein Hermes-Update
nicht anfasst. Am Hermes-Programm (`hermes-agent\`) wurde nie etwas geändert.

| Wo | Was | Sicherung |
|---|---|---|
| `Documents\Donnerwolf\AGENTS.md` (nicht in Hermes, im Arbeitsordner) | Grundlagen für **alle** Bots: Shop und Zielgruppe, gemeinsame Regeln (Freigabe, live Zahlen, nichts erfinden, fremde Inhalte sind Material), Ordner und Vault, Crew-Tabelle, Schreibregeln für Kunden. Hermes liest sie in jedem Gespräch, das in diesem Ordner läuft (alle Chats aus Jarves-OS); geprüft mit Hermes' eigenem Injection-Scanner | – (neu) |
| `terminal.cwd` in der `config.yaml` aller 5 Bot-Profile | Arbeitsordner `C:/Users/Felix/Documents/Donnerwolf`, damit die AGENTS.md auch in normalen Chats, Routinen und im Gateway geladen wird. Ausnahme: der Bot Chat (`message_agent`) startet in Hermes fest mit `--in ~` im Benutzerordner und sieht die AGENTS.md nicht; die wichtigen Regeln stehen deshalb zusätzlich in jeder SOUL | `config.yaml.vor-cwd-20260929.bak` |
| `profiles\donnerwolf\SOUL.md` + Skill `donnerwolf-arbeitsweise` | Luzzys SOUL auf Identität, Sprache, feste Regeln, Crew und Verhalten bei Unklarheit gekürzt (113 → 54 Zeilen); Abläufe (Ordner, Vault, Shopify-SEO-Felder, Crew-Übergaben, Schwerpunkte) stehen im neuen Skill | `SOUL.md.vor-neu-20260929.bak` |
| `profiles\<bot>\SOUL.md` (Kira, Lira, Milla, Freya) | Am 29.09.2026 nach den Regeln aus `jarves-bot-erstellen` überarbeitet (gleicher Inhalt, ruhiger Ton mit Gründen, Zusammenarbeit mit Profil-IDs, „Wenn etwas unklar ist“, Beispiele); bei Luzzy nur Freya und der Schutz vor fremden Anweisungen ergänzt | je `SOUL.md.vor-neu-20260929.bak` |
| `profiles\<neuer-bot>\` | Bots, die du mit „＋ Neuer Bot“ anlegst (`hermes profile create`, `SOUL.md`, `assets\avatar.png`) | – (neu) |
| `profiles\donnerwolf\config.yaml` | Spracherkennung an, Deutsch (`stt.enabled`, `stt.language: de`, Modell `base`) | `config.yaml.vor-jarves-os-20260926-0207.bak` |
| `profiles\donnerwolf\config.yaml` | Aktivierungswort (`wake_word`: provider sherpa, phrase „hey luzzy“, capture client, surface tui, sensitivity 0.45) | `config.yaml.vor-jarves-os-phase2-*.bak` |
| `profiles\donnerwolf\skills\productivity\jarves-plugin-werkstatt\` | Skill: wie Luzzy Jarves-OS-Plugins baut, prüft und repariert (Werkstatt) | – (neu) |
| `profiles\donnerwolf\skills\productivity\jarves-bot-erstellen\` | Skill: wie Luzzy passgenaue Bot-SOULs schreibt (nach Hermes-Doku und Prompt-Leitfäden: Identität statt Handbuch, Gründe statt Großbuchstaben, Bot-Arten mit echten Werkzeugen, Verhalten bei Unklarheit, zwei Beispiele, Prüfliste) und Avatar-Prompts im Crew-Stil | `SKILL.md.vor-v2.bak`, `SKILL.md.vor-v3.bak` |
| `profiles\donnerwolf\skills\productivity\jarves-kalender\` | Skill, damit Luzzy Termine einträgt (`scripts\termin.py`: neu, ändern, löschen, suchen, liste; meldet Überschneidungen). Seit 01.10.2026 legt `termin.py` die Kalender-Datei selbst an, und der Skill verweist auf das Werkzeug `jarves_kalender` | `termin.py.vor-planer-20261001.bak`, `SKILL.md.vor-planer-20261001.bak` |
| `profiles\donnerwolf\plugins\jarves-planer\` + `config.yaml` | Plugin mit den Werkzeugen `jarves_kalender` (ruft `termin.py`) und `jarves_aufgaben` (`aufgabe.py`: liste, neu, zeigen, ändern, erledigt, offen, löschen, suchen; mit `details` je Aufgabe, `details_dazu` hängt an; schreibt `plugins\aufgaben\daten.json`). Packt ein Modell alles in den Text („Titel | Konzept: … | Ablauf: …“), teilt `aufgabe.py` selbst in kurzen Titel und Details (nichts wird abgeschnitten); Test-Aufgaben („Test“, „Test mit Datum“) werden abgewiesen; `eintraege` darf auch als Text ankommen. Werkzeuge statt Skill + Terminal, weil jedes Modell sie sicher findet. Mehrere Termine oder Aufgaben gehen in einem Aufruf (`eintraege: […]`), am Ende steht eine Zählung („2 von 3 angelegt“). Eingeschaltet mit `hermes -p donnerwolf plugins enable jarves-planer`. **Wichtig:** Hermes lädt alle Plugin- und MCP-Werkzeuge in Jarves-Sitzungen nur auf Abruf (`tool_search` / `tool_describe` / `tool_call`); ein direkter Aufruf mit dem Namen wird abgewiesen. Claude kommt damit klar, kleinere Modelle (z. B. `gemma4`) nicht: deshalb steht in den Anweisungen von `jarves-planer` und `jarves-pc` die genaue `tool_call`-Form mit Beispiel. Änderungen an Plugins wirken erst nach einem Neustart des Hermes-Backends | `config.yaml.vor-jarves-planer-20261001.bak`, `jarves-pc\__init__.py.vor-toolcall-20261001.bak`, `jarves-planer\__init__.py.vor-details-20261001.bak`, `jarves-planer\aufgabe.py.vor-details-20261001.bak`, je `…vor-robust-20261001.bak` |
| `profiles\donnerwolf\plugins\jarves-pc\` + `config.yaml` | Plugin für Luzzys Werkzeug `pc_steuern` (PC-Steuerung Stufe 2, siehe dort). Eingeschaltet mit `hermes -p donnerwolf plugins enable jarves-pc`, für Telegram ausgeblendet mit `hermes -p donnerwolf tools disable --platform telegram jarves_pc` (Hermes schreibt die Telegram-Liste dabei aus, die Werkzeuge bleiben dieselben) | `config.yaml.vor-jarves-pc-20260930.bak` |
| `config.yaml` / `.env` (Hermes und Profile) | Shopify-Token – nur über System → Shopify-Zugang | automatisch bei jedem Eintragen |

`surface: tui` sorgt dafür, dass nur Jarves-OS das Aktivierungswort bekommt, nicht die Hermes-App.
Empfindlichkeit: höher = strenger. Termine und Aufgaben über Luzzy gehen überall, wo sie das Plugin `jarves-planer`
hat (Jarves-OS, Hermes-App). Sie schreibt direkt in die Dateien der Plugins; ist Jarves-OS offen, erscheint die
Änderung sofort, sonst beim nächsten Start.

**So spricht Jarves-OS mit Hermes:**

- **Nur ein Hermes-Backend pro PC.** Läuft schon eins (z. B. weil die Hermes-App offen ist), dockt Jarves-OS an –
  die Adresse steht in `hermes\spawn-ledger.json`. Sonst startet es selbst `hermes serve --host 127.0.0.1 --port 0`.
  Alles nur lokal (127.0.0.1).
- **REST** mit Kopfzeile `X-Hermes-Session-Token`, **Live-Verbindung** `ws://127.0.0.1:<port>/api/ws?token=…`
  (JSON-RPC, Antworten kommen Wort für Wort: `message.start/delta/complete`, `tool.start/complete`, `thinking.delta` …).
- **Gespräche:** Zentrale = Luzzys Chat „Jarves-OS“ (weitere Themen „Jarves-OS · <Name>“), Crew = Luzzys fester
  „Bot Chat“ (nur dort hat sie `message_agent` und kann an die Bots delegieren), Bots = je ein Chat „Jarves-OS“ im
  Profil des Bots. Arbeitsordner der Sitzungen: `Documents\Donnerwolf`. Ist eine Unterhaltung weg, legt Jarves-OS
  sie neu an. Lange Chats fasst Hermes selbst zusammen.
- **Spracherkennung:** Jarves-OS nimmt das Mikrofon selbst auf und schickt den Ton an `POST /api/audio/transcribe`,
  Hermes schreibt ihn lokal mit faster-whisper mit. Das Aktivierungswort läuft über `wake.feed`.
- **Genutzte Befehle:** `session.*` (list, create, resume, title, close, delete, active_list), `prompt.submit`,
  `approval.respond`, `image.attach` / `image.attach_bytes` / `pdf.attach` / `file.attach`, `reload.env`,
  `reload.mcp`, `skills.reload`, `wake.*`.
- **Gelesen über REST:** `/api/profiles` (auch Modell pro Bot ändern), `/api/sessions`, `/api/analytics/usage`,
  `/api/cron/jobs` (ausführen, pausieren, fortsetzen, löschen), `/api/plugins/kanban/*`, `/api/config`, Status.

## Sicherheit, Regeln und Datenschutz

- **Hermes nie verändern**, nichts nachbauen, was Hermes kann. Luzzys Shop-Regeln bleiben: nichts veröffentlichen
  und nichts im Shop ändern ohne Felix' Ja.
- **Zugangsdaten** (Shopify-Token, Hermes-Schlüssel) nie anzeigen, loggen, speichern oder an die Oberfläche geben.
  Geheime Dateien werden von der Dateisuche nie gefunden.
- **Dateien** nur speichern, wenn Felix klickt – mit Sicherung und „Rückgängig“. **Vault-Schreiben** nur in
  `Donnerwolf-Shop\Jarves-OS\` und nie überschreiben. Bibliothek & Co. sind nur lesend.
- **PC-Steuerung** nur geprüfte Aktionen: nie beliebige Befehle, Herunterfahren, Schließen, Programme per Pfad.
- **Löschen** (Jobs, Gespräche, Chats) nur nach Rückfrage.
- **Was das Haus verlässt:** Nachrichten an Luzzy gehen an das Modell, das in Hermes eingestellt ist. Die Stimme
  (Pocket TTS), Spracherkennung, Dateisuche, PC-Steuerung, Timer und Notizen bleiben auf dem PC. Das Wetter bekommt
  nur den Ort. Das Mikrofon darf nur Jarves-OS selbst benutzen.

## Probleme lösen

Erster Schritt immer: **„Mach einen Selbsttest“** (oder System → Selbsttest). Er sagt, was nicht geht und was zu tun ist.

| Problem | Lösung |
|---|---|
| Luzzy spricht nicht, Status „uv ist nicht installiert“ | uv installieren (siehe [Einrichten](#einrichten)), Jarves-OS neu starten |
| Status „braucht die Hugging-Face-Freigabe“ | Auf huggingface.co/kyutai/pocket-tts zustimmen, dann `uvx hf auth login` |
| Pocket TTS „Zeichensatz-Fehler“ | Setzt Jarves-OS selbst (`PYTHONUTF8=1`); nur bei Tests im Terminal vorher `$env:PYTHONUTF8=1` |
| Luzzy ist zu leise | Einstellungen → Stimme → Lautstärke höher |
| Nach dem Start kurz keine Stimme | Normal: Pocket TTS braucht ein paar Sekunden, beim allerersten Mal ein paar Minuten |
| Luzzy reagiert auf Musik oder Gespräche im Headset | Freihändig aus (Strg+Umschalt+H) – dann nur auf Knopfdruck |
| „Hey Luzzy“ geht nicht | Mikrofon-Status in Einstellungen → Sprechen prüfen; in Hermes (Profil donnerwolf) das Aktivierungswort |
| Datei wird nicht gefunden | Kurz warten, der Index baut sich im Hintergrund auf; genauer benennen oder Endung dazusagen („… PDF“) |
| Shopify rot | System → Shopify-Zugang: neuen Token eintragen |
| Mini-Modus-Taste geht nicht | Ein anderes Programm belegt sie (z. B. Teams) – die andere Taste oder den Mini-Knopf nehmen |

## Sichern, Git und Updates

`npm run backup` (oder Einstellungen → Start & Sicherung → „Jarves-OS sichern“) legt eine Kopie in
`Desktop\jarves-os\backup\` an. Das Projekt liegt privat auf GitHub (Kynto-intel/jarves-os); `daten\` und
Plugin-Daten bleiben lokal.

**Neuen Stand holen** (jeden Befehl einzeln, ohne das `PS C:\...>` davor):

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
git switch main
```
```
git pull
```

Neue Funktionen kommen direkt auf `main` oder als Pull Request auf dem Branch `claude/fervent-pasteur-dft0hp`.

**Neue Ideen** (Runde 2: Optimierungen, Stimme, Killer-Funktionen, ungenutzte Hermes-Funktionen): [`ideen.md`](ideen.md).

**Für später** (bewusst nicht gebaut): eine kostenpflichtige ElevenLabs-Stimme, falls Pocket TTS einmal nicht reicht.
Neue Wünsche am einfachsten als Plugin über die [Werkstatt](#plugins) bauen lassen.

**Bewusst gestrichen:** Produktideen-Schmiede (macht die Crew mit Kira → Lira → Milla schon) und Social-Planer
(Post-Termine stehen im Kalender, veröffentlicht wird nur nach deinem Ja).

## Aufbau (für Entwickler)

Electron 38, reines JavaScript ohne Build. Abhängigkeiten: `ws` (Hermes-Verbindung), `node-pty`, `@xterm/xterm` und `@xterm/addon-fit` (Terminal; node-pty bringt fertige Windows-Dateien mit, nichts muss kompiliert werden).

| Ordner / Datei | Inhalt |
|---|---|
| `src/main/main.js` | Hauptprozess: Fenster, Mini-Fenster, Tastenkürzel, IPC, Protokoll `jarves-datei:` |
| `src/main/hermes.js` | Verbindung zu Hermes (WebSocket-RPC und REST), Gespräche, Bot Chats |
| `src/main/waechter.js` | Bestellungen, Mails, Jobs, Meilensteine |
| `src/main/pocket.js` | Luzzys Stimme: Pocket-TTS-Server starten/stoppen, Sprechen |
| `src/main/dateisuche.js` | Index über den ganzen PC, Suche, Anzeigen, Speichern mit Sicherung |
| `src/main/pc.js` | Programme, Webseiten, Tasten, Lautstärke, Ordner, Sperren (geprüft) |
| `src/main/notfall.js` · `musik.js` · `wissen.js` | Ollama-Notbetrieb · Musik-Erkennung · Vault lesen |
| `src/main/vaultschreiben.js` · `shopifytoken.js` · `plugins.js` · `einstellungen.js` | Vault schreiben (eng begrenzt) · Shopify-Token · Plugin-Host · Einstellungen |
| `src/preload.js` · `src/mini-preload.js` | Sichere Brücke `window.jarves` zur Oberfläche |
| `src/renderer/` | Oberfläche (ES-Module): `app.js` (Zentrale, Luzzy, Verdrahtung der Teile), `vorlesen.js`, `mikrofon.js`, `crewchat.js`, `buehne.js`, `ansichten.js`, `dateiansicht.js`, `pcsteuerung.js`, `gespraeche.js`, `diktat.js`, `meldungen.js`, `timer.js`, `palette.js`, `selbsttest.js`, `mini.js` … |
| `src/renderer/fenni/` | Fenni, der kleine Wolf in der Mini-Leiste: `fenni.js` (Zustände, Animation), `koerper.js` (Kopf), `augen.js`, `rumpf.js` (Körper), `spaziergang.js` (Laufen, Haltungen), `gucken.js` (guckt über die Kante), `effekte.js`, `farben.js`, `sterne.js` (rieselnde Lichtpunkte, Röhren-Zeilen, Auftauchen); Hecheln, Hüpfer beim Klick, Streicheln, Aufhorchen bei Meldungen, Kopf schief bei Fragen, Heulen bei Meilensteinen, Dateien fressen |
| `src/renderer/miniinfo.js` | Infos für die Mini-Insel: Wetter, nächster Termin, offene Aufgaben (aus den Plugins), Luzzys Worte und Meldungen |
| `src/renderer/rahmen/` | Alles, was das Fenster selbst betrifft, aus `app.js` ausgelagert: `design.js` (Designs, Tageszeit-Farben, Windows-Knöpfe), `einstellungsfenster.js` (Einstellungs-Dialog), `befehlsliste.js` (Befehle der Palette Strg+P), `navigation.js` (Bereiche links, Bereich wechseln). Jede Datei wird in `app.js` mit `…Einrichten({ … })` angebunden |
| `designs/` | Ein Design pro Datei (siehe Einstellungen) |
| `plugins/` | Plugins (siehe oben) |
| `plugins/werkstatt/` | Werkstatt: Prüfung, Testlauf-Fenster (`test.html`, `test-runner.js`), Prüfprogramm für Luzzy (`pruefen-cli.js`) |
| `werkstatt/` | Plugin-Entwürfe, an denen Luzzy baut (nicht in Git) |
| `scripts/backup.js` | Sicherung |
| `daten/` | Einstellungen, Dateiindex, Datei-Sicherungen, Notbremse (`plugin-start.json`) – nicht in Git |

**Design:** Standard ist Donnerwolf Gold auf Anthrazit (weitere Designs im Ordner `designs/`), die Grundwerte stehen in
`src/renderer/style.css` unter `:root` (Mitte `#131315`, Seitenspalten `#0E0E10`, Karten `#19191C`, Eingaben `#101012`, Rahmen `#26262A`, Gold `#C9A14A`,
helles Gold `#E3BE6C`, Text `#ECE6DA`, leiser Text `#8C877E`). Karten mit runden Ecken und weichem Schatten, Gold nur
als Akzent, Monospace für Status und Zahlen. Reaktor mit drehenden Ringen, Sprach-Welle, Scanlinie – alles abschaltbar.
Plugins nutzen dieselben Variablen und Klassen (`hud`, `knopf-gold`, `knopf-flach`, `leise`).

**Testmodus** (Umgebungsvariablen):

| Variable | Wirkung |
|---|---|
| `JARVES_TEST_STUMM=1` | ohne Intro und Vorlesen |
| `JARVES_TEST_ANSICHT=<bereich>` | startet in diesem Bereich |
| `JARVES_TEST_JS=<code>` + `JARVES_TEST_JS_NACH=<ms>` | führt Code in der Oberfläche aus (Ergebnis als `TEST-ERGEBNIS:`) |
| `JARVES_SCREENSHOT=<datei>` + `JARVES_SCREENSHOT_NACH=<ms>` | Bild der App, danach beenden |
| `JARVES_TEST_INTRO` · `JARVES_TEST_FREIGABE` | Intro zeigen · Freigabe-Anfrage vorspielen |
| `JARVES_TEST_MIKROFON=<wav>` | Mikrofon aus einer WAV-Datei |
| `JARVES_TEST_PC=1` · `JARVES_TEST_PROGRAMME` | PC-Aktionen nur protokollieren · Programmliste vorgeben |
| `JARVES_TEST_DATEIEN` · `JARVES_TEST_VAULT` · `JARVES_TEST_HERMES_HOME` | Dateisuche · Vault · Hermes-Ordner auf Testordner |
| `JARVES_TEST_TAGESZEIT` · `JARVES_TEST_MELDUNG` · `JARVES_TEST_NACHRICHT` | Tageszeit-Farben · Meldung · Nachricht vorspielen |
| `JARVES_TEST_POCKET=<url>` | schon laufenden Pocket-TTS-Server nutzen |
