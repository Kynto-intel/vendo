# Result: cockpit

- Area: Zentrale-Cockpit-Übersichten
- Test: `cockpit.test.js`
- Date: 2026-10-29
- Command: `node --test tests/cockpit.test.js`
- Fixture: Synthetische Hermes-Verläufe sowie Kalendertermine und Aufgaben direkt im Test. Keine lokalen Plugin-Daten, echten Chats, Personen- oder Kundendaten verwendet.
- Result: PASS (4 tests passed, 0 failed)
- Observations: Die Zentrale zeigt nur laufende Aufträge und den Tagesplan; abgeschlossene Sitzungsverläufe werden nicht in die Cockpit-Listen aufgenommen. Der Tagesplan enthält überfällige und kommende offene Aufgaben sowie zukünftige Termine, aber keine erledigten, vergangenen oder zu weit entfernten Einträge. Laufende Aufträge sind auf fünf begrenzt. Tagesdaten werden nur für gestartete Plugin-IDs abgefragt und gelöschte Sitzungen aus dem Cache entfernt.
- Errors/corrections: Die erste Auftrags-Fixture war nicht chronologisch; Zeitstempel korrigiert und versteckte Nachrichten aus der Statusableitung ausgeschlossen. Ein Grenzfalllauf enthielt ungültige synthetische Oktobertage; Folgetermine werden kalendergültig erzeugt. Der IPC-Fehler bei nicht geladenen Plugins wurde durch Abgleich mit den gestarteten Plugin-Bereichen behoben. Der Aktivitäts-Verlaufdialog wurde auf Wunsch entfernt. Aktueller Lauf: 5/5 bestanden.
- Not tested: Electron-Oberfläche, Darstellung in realen Fenstergrößen, tatsächliche Hermes-Verläufe, lokale Kalender-/Aufgaben-Daten und Klickverhalten in der laufenden App. Dafür war in dieser Umgebung kein automatisierter Electron-UI-Test verfügbar.