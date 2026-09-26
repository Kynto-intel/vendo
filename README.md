# Jarves-OS

Felix' Kommandozentrale für Hermes mit Luzzy. Plan und Anforderungen: `..\Jarves-OS.md` (im Ordner `Desktop\jarves-os`).

## Starten

Terminal öffnen und eingeben:

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
npm start
```

Hermes muss nicht vorher laufen: Jarves-OS dockt an ein laufendes Hermes an (z. B. wenn die
Hermes-App offen ist) oder startet es selbst.

## Sichern

```
npm run backup
```

legt eine Kopie (ohne `node_modules`) in `Desktop\jarves-os\backup\` an. Mit Notiz:
`npm run backup -- vor-phase-2`

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/main/main.js` | Fenster, Verbindung zwischen Oberfläche und Hermes, System-Werte |
| `src/main/hermes.js` | Andocken/Starten von Hermes, Luzzys "Bot Chat", Senden, Live-Ereignisse |
| `src/main/stimme.js` | Luzzys Stimme (Edge-Neural, hohe Qualität) |
| `src/main/einstellungen.js` | Einstellungen in `daten/einstellungen.json` |
| `src/preload.js` | sichere Brücke zur Oberfläche |
| `src/renderer/` | Oberfläche: Reaktor, Gespräch, Live-Spalte, Einstellungen |
| `scripts/backup.js` | Sicherung |

## Plugins

Eigene Erweiterungen liegen in `plugins\<id>\` (z. B. der Kalender). Wie man eins baut, steht in
`plugins\README.md`.

## Regeln

- Hermes selbst wird nie verändert. Nur update-feste Einstellungen (Profile, config) und nur mit Sicherung.
- Nichts nachbauen, was Hermes schon kann.
