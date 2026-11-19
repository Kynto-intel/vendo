# Review des Newsletter-Plugins

**Stand:** 14. November 2026, überprüft und teilweise abgearbeitet am 16. November 2026
**Umfang:** Review des aktuellen Arbeitsstands einschließlich der zu diesem Zeitpunkt nicht eingecheckten Änderungen. Die Aufgaben unten waren Empfehlungen; was davon am 16. November umgesetzt, bewusst zurückgestellt oder verworfen wurde, steht im Abschnitt „Abarbeitungsstand“.

## Kurzurteil

**Funktionsumfang und technische Basis: etwa 8/10. Produktionsreife: etwa 6/10.** Das sind qualitative Einschätzungen, keine formale Zertifizierung.

Das Plugin verbindet Kontakte, Kampagnen, Vorlagen, Shopify-Automationen, Freigaben, Warteschlange und Auswertung. Stärken sind die vorhandenen Consent-Regeln, die menschliche Versandfreigabe, die modulare Aufteilung und Tests mit synthetischen Daten. Die größten offenen Risiken waren am 14. November Rückläufersperren, die UTM-Kollision gleichnamiger Automationen, die Grenzen bei Kontaktmenge und Speicher sowie das Crash-Fenster der Versandqueue. UTM-Kollision, Crash-Fenster und die fehlende Rückläuferbehandlung (S1) sind seit dem 16. November behoben, die Grenzen dokumentiert. Am selben Tag hat Felix von Hand bestätigt, dass Vendo echte IONOS-Rückmeldungen erkennt, und die DNS-Einträge für SPF, DKIM und DMARC sind vorhanden. **Für den ersten echten Versand ist aus diesem Review nichts mehr offen.**

## Abarbeitungsstand (16. November 2026)

Jeder Punkt wurde gegen den Code geprüft und danach bewertet, ob er für Vendos tatsächlichen Einsatz wichtig ist: ein Shop, rund 820 Abonnenten aus Shopify, Versand über ein IONOS-Postfach, jede Kampagne von Felix freigegeben.

| Punkt | Wichtig? | Status | Begründung |
|---|---|---|---|
| E1 Metadaten | ja, gering | **erledigt** | `plugin.json` war im Arbeitsstand schon korrigiert. Der Widerspruch in der Plugin-README („Punkte 1 bis 3 erledigt“ neben „Plugin noch nicht geöffnet“) ist aufgelöst. |
| E2 Grenzen dokumentieren | ja, gering | **erledigt** | Stand schon vollständig im Abschnitt „Feste Grenzen“ der Plugin-README; ergänzt um „kein genau einmal“. |
| M1 Ladefehler sichtbar | ja | **erledigt** | Ein Ladefehler sah aus wie eine leere Liste und konnte zu falschen Schlüssen führen („keine Kontakte“). Jetzt erscheint oben ein Hinweis mit Bereich und „Erneut laden“. Test: `tests/newsletter-ladefehler.test.js`. |
| M2 UTM-Kennung | ja | **erledigt** | Bestätigter Fehler, aber anders als oben beschrieben: Je Art gibt es nur eine Automation, und ihr Name ist nicht änderbar. Die Kollision entsteht, wenn eine Automation gelöscht und neu angelegt wird; dann wären ihre Bestellungen still der gelöschten zugeordnet worden. Jetzt behält ein Schritt seinen Kurznamen, eine neue gleichnamige Automation bekommt `…-2`. Test: `tests/newsletter-ergebnisse.test.js`. |
| S2 Crash-Fenster | ja | **erledigt** | Das Fenster ist kurz, aber Vendo ist eine Desktop-App, die geschlossen wird, abstürzt oder bei Updates neu startet, und eine doppelte Mail an Kunden ist peinlich. Einträge stehen jetzt vor dem SMTP-Aufruf auf `sendet` und werden nach einem Abbruch `unklar` statt erneut gesendet. Der Kommentar in `warteschlange.js`, der „nie doppelt“ versprach, ist korrigiert. Test: `tests/newsletter-versandzustand.test.js`. |
| S1 Rückläufer und Beschwerden | **ja, wichtigste Lücke** | **erledigt**, mit echten IONOS-Rückmeldungen von Hand durch Felix am 16. November 2026 geprüft | Wer wiederholt an tote Adressen sendet, schadet dem Ruf des Postfachs, das auch der Kundenservice nutzt. Neu `ruecklaeufer.js`: liest Zustellberichte (RFC 3464), Beschwerden (RFC 5965) und Klartext-Rückmeldungen aus einem eigenen Ordner, sperrt tote Adressen und Beschwerden mit eigener Sperrart, zählt vorübergehende Fehler und Ablehnungen nur, schreibt nichts zu Shopify. Dazu eine Sperrprüfung direkt vor jedem Versand. Test: `tests/newsletter-ruecklaeufer.test.js` mit acht synthetischen Rückmeldungen. Von Hand: Filterregel bei IONOS (Absender enthält „mailer-daemon“ oder „postmaster“ → Ordner `Ruecklaeufer`), zwei Mails an nicht vorhandene Adressen; beide Rückmeldungen („Mail delivery failed: returning message to sender“) landeten im Ordner und wurden von Vendo erkannt, gesperrt wurde nichts, weil die Testadressen keine Kontakte sind. |
| M8 SPF/DKIM/DMARC | mittel | **DNS geprüft**, automatische Anzeige eingeplant | Öffentliche DNS-Abfrage am 16. November 2026: SPF schließt IONOS ein (`~all`), DKIM ist über die IONOS-Selektoren `s1-ionos` und `s2-ionos` eingerichtet, DMARC steht auf `p=none` (nur Beobachtung, keine Berichtsadresse). Ob eine verschickte Mail die Prüfungen besteht (dreimal PASS unter „Original anzeigen“ in Gmail), ist noch nachzusehen. Die automatische Anzeige in der Übersicht ist in Phase 5, Schritt 4 eingeplant. |
| M7 Tresor-Test | gering | zurückgestellt | Verschlüsselung über `safeStorage` und Rückgabe ohne Passwort sind im Code sichtbar und in den Zugangs- und Versandtests mit Ersatz-Tresor schon geprüft. Ein weiterer Test brächte wenig. |
| M3 Vorabbericht | gering | zurückgestellt | Kampagnen werden schon geprüft und blockiert, und Felix gibt jede frei. Eine Zusammenfassung wäre bequemer, verhindert aber keinen Fehler. |
| M4 Export und Seitensteuerung | gering | zurückgestellt | 820 Kontakte, Suche vorhanden. Ein CSV-Export wäre für Sicherung oder Anbieterwechsel nützlich, ist aber nicht dringend. |
| M5 Kampagnenbilanz | gering | **teilweise erledigt** | Protokoll, Ergebnisliste und `unklar` decken das Nötige ab. Seit dem 16. November zeigt die Ergebnisliste je Kampagne zusätzlich eine Zustellungs-Ampel (`zustellung.js`): tote Adressen, Ablehnungen wegen Spamverdacht, Beschwerden und Abmeldungen im Verhältnis zu den verschickten Mails. Bei Rot hält Vendo eine laufende Kampagne an, fortsetzen kann nur Felix. Test: `tests/newsletter-zustellung.test.js`. |
| M6 Werkstatt-Prüfung | nein | verworfen | Vendo lädt das Plugin unabhängig von der Werkstatt-Prüfung. Die Änderung beträfe das Werkstatt-Plugin, nicht den Newsletter. |
| S3 Segmente | später | eingeplant | Phase 5, Schritt 7, bewusst erst nach den Schritten 1 bis 5. |
| S4 Skalierbare Ablage | nein | verworfen | 820 von 10.000 möglichen Kontakten; erst bei echtem Bedarf. |
| S5 Phase-5-Auswertungen | später | eingeplant | Steht im Plan der Plugin-README. |
| S6 Öffentliche Endpunkte | nein | verworfen | Braucht einen Server; nur mit einer eigenen Architekturentscheidung. |

## Vorbild-Entscheidung

> **Kurz: Keines der verglichenen Projekte taugt als Bauplan für Vendo. BillionMail taugt als Ideengeber für einzelne Funktionen, nicht als Vorlage.** Von BillionMail interessieren nur die Newsletter-Funktionen, nicht der Mailserver; Vendo sendet weiter über IONOS.

**Keines der verglichenen Projekte eignet sich als Vorbild für Vendos Aufbau.** Alle sind Serverprodukte mit Datenbank, öffentlich erreichbaren Endpunkten und eigenem Betrieb; Vendo ist eine lokale Desktop-App, die über ein vorhandenes IONOS-Postfach sendet. Die Projekte taugen als Ideengeber für einzelne Funktionen. Code wird nicht übernommen (AGPL bei BillionMail, listmonk und MailCheap, proprietär bei NetSendo).

- **BillionMail** (am 16. November 2026 auf GitHub angesehen: etwa 16.400 Sterne, AGPL-3.0, letzte Version v4.9 vom Dezember 2025, letzter Commit Juni 2026): ein vollständiger Mailserver mit Postfix, Dovecot, Rspamd, PostgreSQL, Redis und Roundcube. Er würde IONOS ersetzen, nicht ergänzen: eigene Versand-IP ohne Ruf, die erst aufgewärmt werden muss, DNS, Zertifikate, offene Ports, Sicherungen und laufende Wartung. Für einen Shop mit rund 800 Empfängern ist das unverhältnismäßig. Der für Vendo wichtigste Teil, die Automationen, war im geprüften Stand nur ein Platzhalter (`<div>aaaaa</div>`). **Nicht als Vorbild nehmen.** Brauchbare Idee: eine eigene Liste „auffällige Empfänger“ für Rückläufer (siehe S1).
- **listmonk**: das sauberste Vorbild für Datenmodell, Rückläuferverarbeitung und Versandbilanz, aber ebenfalls ein Server mit PostgreSQL. Als Referenz nützlich, wenn S1 und S3 gebaut werden.
- **MailCheap**: das beste Vorbild für Bedienung und Vorabprüfung (Gmail-Clipping bei 100 KB, Pflichtangaben, gebündelter „Versand bereit?“-Bericht). Nützlich für M3, falls es später kommt.
- **Dispatch**: ein gutes Beispiel für Versandstatus je Empfänger und gezielte Wiederholung; Vendo hat das jetzt in der einfachen Form `sendet`/`unklar`.
- **NetSendo**: wegen der Lizenz ausgenommen (siehe unten).

### BillionMail-Funktionen für Vendo (ohne Mailserver)

Grundlage: die API-Verträge `core/api/batch_mail` und `core/api/contact` im geprüften Commit `fc36c76`. Bewertet wird nur, ob die Funktion für Vendo nützlich wäre; Code wird nicht übernommen (AGPL-3.0).

| BillionMail-Funktion | Vendo heute | Für Vendo? |
|---|---|---|
| Fehlerhafte Empfänger als eigene Liste („Abnormal Recipients“) | fehlt | **Ja, wird als S1 gebaut:** Rückläufer und Beschwerden mit Grund speichern und dauerhaft vom Versand ausschließen. |
| Kampagne pausieren und fortsetzen | seit 16. November vorhanden | **Umgesetzt**, dazu automatisches Anhalten bei auffälliger Zustellung (`zustellung.js`). |
| Versandtempo je Kampagne ändern | ein Stundenbudget für alles (Drossel) | Nein. Das Stundenlimit hängt am IONOS-Postfach, nicht an der Kampagne. |
| Testmail | vorhanden | schon erledigt |
| Vorlagen anlegen, ändern, löschen | vorhanden (Vorlagen und Muster) | schon erledigt |
| Versandprotokoll je Kampagne | Protokoll für alle Mails | Gering. Ein Filter nach Kampagne im Reiter „Protokoll“ wäre bequem. |
| Auswertung nach Empfänger-Anbieter (Gmail, Outlook, GMX, web.de …) | fehlt | **Ja, nach S1.** Zeigt, ob ein Anbieter Vendos Mails gehäuft ablehnt; braucht die Rückläuferdaten aus S1. |
| Übersicht und Diagramme je Kampagne | Ergebnisliste, Übersicht in Phase 5, Schritt 4 geplant | schon eingeplant |
| Kontaktgruppen, Tags, Sammel-Tagging, Gruppen zusammenführen | ein Empfängerkreis | Nur als kuratierte Shopify-Segmente (S3, Phase 5, Schritt 7), keine frei pflegbaren Gruppen. |
| Kontakt-Export | fehlt | Gering (M4). Nützlich für Sicherung oder Anbieterwechsel. |
| Kontaktentwicklung (Trend) | vorhanden (Zugänge und Abmeldungen je Monat) | schon erledigt |
| Öffnungs- und Klickmessung, Abmelde-Link mit eigenem Endpunkt | bewusst nicht vorhanden | Nein, braucht einen öffentlich erreichbaren Server (S6). |
| Absender-/IP-Warmup | nicht vorhanden | Nein, betrifft nur eigene Versand-IPs. |
| Transaktions- und Sammelversand per API | Bot-Aufträge über Dateien | Nein, ohne konkreten Integrationsbedarf. |

Ein Wechsel zu einem dieser Systeme lohnt sich erst, wenn Vendo ohnehin auf einen Server zieht (Plugin-README, „Später: Server“) oder die Liste so groß wird, dass IONOS-Stundenlimits und Reputation nicht mehr reichen. Dann wäre listmonk als eigener Dienst die naheliegende Wahl, nicht BillionMail.

## Verbindliche Regeln für jede Umsetzung und Prüfung

- **Ausschließlich synthetische Testdaten:** Namen, E-Mail-Adressen unter `.invalid`, Bestellungen, Inhalte, Zugangsdaten und DNS-Antworten müssen eigens erfunden sein. Keine echten Personen, Kunden, Bestellungen, Zugangsdaten, Tokens oder lokalen `daten/`-Inhalte verwenden.
- **Nie live testen:** Keine Verbindung zu echtem Shopify, IONOS, SMTP, IMAP, öffentlichem DNS oder anderen Produktiv-/Testdiensten. Keine echte Testmail senden. Netzwerkzugriffe durch kontrollierte Stubs oder einen vollständig lokalen Testdienst ersetzen.
- **100 % der vereinbarten Funktion prüfen:** Vor jeder Änderung klare, messbare Akzeptanzkriterien festhalten. Jedes Kriterium einschließlich Normalfall, Fehlerfall, Grenzwert, Berechtigung und Regression muss durch reproduzierbare Tests oder eine gleichwertige lokale Prüfung belegt sein. „100 %“ bedeutet vollständige Abdeckung der vereinbarten Verhaltensanforderungen, nicht zwingend 100 % Zeilenabdeckung.
- **Keine erfolgreiche Abkürzung bei nicht testbaren Fällen:** Wenn sich ein Verhalten mit synthetischen Daten und Offline-Stubs nicht vollständig belegen lässt, ist es BLOCKED und nicht abgeschlossen. Ein Live-Test ist kein zulässiger Ersatz.
- **Ergebnisse nachvollziehbar festhalten:** Zu Codeänderungen gehören der genaue Testbefehl, Ergebnis, synthetische Fixtures und PASS/FAIL/BLOCKED in `test-results/<testname>.result.md`. Keine sensiblen Daten oder echten Kundenbeispiele in Tests, Logs oder Berichten.
- **Sicherheitsgrenze erhalten:** Consent, Abmeldungen und Suppressions dürfen durch Import, Segmentierung, Wiederholung oder UI-Änderungen nie umgangen werden; der Bot darf nicht selbst den Versand freigeben.

Die frühere Empfehlung, eine echte Testmail in Outlook/Gmail zu senden oder echte IONOS-/Shopify-Verbindungen zu prüfen, wird durch diese Regeln ausdrücklich ersetzt. Zulässig sind lokale UI-/End-to-End-Prüfungen nur mit synthetischen Daten und vollständig gestubbten externen Diensten.

## Aufgaben-Roadmap nach Umsetzungsschwierigkeit

Die Schwierigkeit beschreibt den erwarteten Eingriff in Vendo, nicht die Dringlichkeit. Ein leichtes Dokumentationsproblem kann weniger riskant sein als ein schwerer Versandfehler. Alle Aufgaben unterliegen den obigen Testregeln.

### Leicht – lokal begrenzte Korrekturen

#### E1. Plugin-Metadaten und Statusangaben angleichen

**Erledigt (16. November 2026).** `plugins/newsletter/plugin.json` beschrieb das Plugin im eingecheckten Stand noch als Gerüst „ohne Versand“; im Arbeitsstand war das schon korrigiert. Der widersprüchliche README-Status zur praktischen Nutzung ist bereinigt.

**Akzeptanz:** Manifest, README und tatsächliche Funktionen widersprechen sich nicht; nicht vorhandene Features werden nicht als vorhanden beschrieben.

**Prüfung:** JSON-/Manifest-Validierung sowie ein dokumentarischer Abgleich mit den vorhandenen lokalen Funktionen. Keine Live-Verbindung.

#### E2. Grenzen und offene Funktionen ehrlich dokumentieren

**Erledigt:** Die Plugin-README nennt alle diese Grenzen im Abschnitt „Feste Grenzen“. Die Shopify-Synchronisierung ist derzeit auf 40 Seiten × 250 Kontakte = **10.000** Kontakte begrenzt; die Oberfläche fordert **100** Treffer pro Suche an und hat keine Seitensteuerung. Vendos Plugin-Datenspeicher lehnt serialisierte JSON-Texte über 5.000.000 JavaScript-Zeichen (UTF-16-Codeeinheiten, ungefähr **5 MB**) ab. CSV-Import ist vorhanden, ein vollständiger CSV-Export sowie Öffnungs-/Klicktracking sind nicht implementiert.

**Akzeptanz:** README und Review nennen diese Grenzen und unterscheiden vorhandene Funktionen von geplanten. Produkttexte versprechen kein unbegrenztes Kontaktvolumen.

**Prüfung:** Werte gegen lokale Konstanten/Implementierung abgleichen; keine echten Shopdaten abrufen.

### Mittel – mehrere eng zusammenhängende Module

#### M1. Fehlerzustände beim Laden sichtbar machen

**Erledigt (16. November 2026).** `stillHolen` in `ansicht.js` fing Fehler ab und gab still `null` zurück. Dadurch konnte ein Ladefehler wie eine leere Liste aussehen. Jetzt merkt sich die Oberfläche den Fehler und zeigt ihn oben mit „Erneut laden“.

**Akzeptanz:** Leere Liste, Ladezustand und Fehler sind unterscheidbar; Fehler zeigen den betroffenen Bereich und eine Wiederholen-Aktion.

**Prüfung:** UI-/Modultests für leere Antwort, erfolgreiche Antwort, abgelehnten Stub und erneuten erfolgreichen Versuch; synthetische Antworten.

#### M2. UTM-Kennung pro Automationsschritt stabil und eindeutig machen

**Erledigt (16. November 2026).** Der UTM-Kurzname wurde nur aus Automationsname und Schrittnummer gebildet (`automationUtm` in `haupt.js`), und `nameMerken` in `ergebnisse.js` überschreibt keine schon gespeicherte Zuordnung. Weil es je Art nur eine Automation gibt und ihr Name nicht änderbar ist, entstand die Kollision beim Löschen und Neuanlegen. Jetzt behält ein Schritt seinen Kurznamen (`kurznameFinden`), eine neue gleichnamige Automation bekommt einen eigenen.

**Akzeptanz:** Kennung basiert auf stabiler Automation-ID und Schritt, überlebt Umbenennung und wird bei Mailbau und Auswertung identisch genutzt.

**Prüfung:** Zwei gleichnamige Automationen, Umbenennung, erneuter Versand und bestehende Datensätze mit ausschließlich synthetischen IDs und Bestellungen testen.

#### M3. Verständlichen Versand-Vorabbericht ergänzen

Vorhandene HTML-/Inhaltsprüfungen könnten in einer Übersicht mit Empfängerzahl, erwarteter Dauer, fehlenden Variablen und konkreten Warnungen zusammengefasst werden.

**Akzeptanz:** Der Bericht zeigt, warum ein Versand freigegeben oder blockiert ist; Empfängerzahl berücksichtigt Consent und Suppressions. HTML-Größe und fehlende Variablen werden nachvollziehbar angezeigt. Kein öffentlicher Tracking-Aufruf.

**Prüfung:** Positive und negative Inhaltsfixtures, Empfängerzahlen an Grenzwerten sowie Consent-/Sperrstatus mit synthetischen Kontakten abdecken.

#### M4. Kontaktliste und Export für größere Bestände bedienbar machen

Suche und maximal 100 angezeigte Treffer ersetzen keine Seitensteuerung oder vollständige Datenportabilität.

**Akzeptanz:** Pagination/Export umfassen alle berechtigten Kontakte samt nötigem Consent- und Sperrstatus; Passwörter, Tokens und andere Geheimnisse werden ausgeschlossen. Export und UI beachten die bestehende Datenbegrenzung und melden Fehler klar.

**Prüfung:** Leere, mehrseitige, doppelte, gesperrte und fehlerhafte synthetische Datensätze; Export wird gegen erwartete Dateien und Geheimnis-Filter geprüft.

#### M5. Kampagnenstatus und kontrollierte Wiederholung bündeln

Queue, SMTP-Fehler, gesendete Empfänger und abgelaufene Einträge sind als verständliche Kampagnenbilanz darzustellen.

**Akzeptanz:** Status ist je Kampagne nachvollziehbar; Wiederholung ist nur für eindeutig fehlgeschlagene, weiterhin berechtigte Kontakte möglich. Consent-, Abmelde- und Sperrregeln werden vor erneutem Versand erneut geprüft.
**Prüfung:** Lokaler Versandstub mit Erfolgs-, Fehler-, Ablauf- und Wiederholungsfällen; kein SMTP-Netzwerkverkehr.

#### M6. Werkstatt-Prüfung an den Mehrmodul-Aufbau anpassen

Laut Plugin-README akzeptiert die Werkstatt zusätzliche Newsletter-Module derzeit nicht regulär und wertet Berechtigungen nur anhand von `ansicht.js` und `haupt.js` aus ([README.md](../plugins/newsletter/README.md#L804), Prüfcode in `plugins/werkstatt/haupt.js`). **Verworfen:** Vendo lädt das Plugin unabhängig von dieser Prüfung.

**Akzeptanz:** Alle tatsächlich importierten Plugin-Module werden nach den vorhandenen Regeln geprüft; keine stille Ausnahme und keine abgeschwächte Rechteprüfung.

**Prüfung:** Synthetisches Plugin mit erlaubtem und unerlaubtem Modul/Import; bestehende Plugins als Regressionstest. Nur lokale Fixtures, keine echten Plugin-Daten.

#### M7. Speicherung von Zugangsdaten offline absichern

Die Zugangsdaten werden verschlüsselt gespeichert und nicht an die Oberfläche zurückgegeben. Dieses sicherheitsrelevante Verhalten sollte mit einem fest erfundenen Platzhalterwert und einer isolierten Testumgebung gegen Speichern, erneutes Laden und Renderer-Ausgabe abgesichert werden.

**Akzeptanz:** Der Platzhalterwert liegt im Speicher nicht im Klartext; nach erneutem Laden ist er für den vorgesehenen Hauptprozess verfügbar, aber nicht im Renderer oder in Logs.

**Prüfung:** Nur einen hart erfundenen Dummy-Secret verwenden; keine echten Zugangsdaten, Windows-Benutzerprofile, IONOS-Anmeldungen oder Produktiv-Schlüssel.

#### M8. SPF-, DKIM- und DMARC-Prüfung für die Übersicht planen

Eine DNS-Prüfung ist als mögliche Übersichts-/Freigabehilfe vorgesehen, aber noch nicht umgesetzt. **Stand 16. November 2026:** Die Einträge selbst sind vorhanden und von Hand geprüft (siehe „Abarbeitungsstand“); offen ist nur die automatische Anzeige.

**Akzeptanz:** Status und konkrete Erklärung unterscheiden fehlende, fehlerhafte und gültige Einträge; der Check gibt bei DNS-Fehlern keinen irreführenden Erfolg aus.

**Prüfung:** Resolver muss injizierbar sein; ausschließlich synthetische DNS-Antworten (gültig, fehlend, ungültig, Timeout) testen. Keine öffentliche DNS-Abfrage im Test.

### Schwer – Zustellungslogik, Datenmodell oder Architektur

#### S1. Rückläufer und Beschwerden sicher erfassen und sperren

**Erledigt (16. November 2026)**, siehe „Abarbeitungsstand“. Am selben Tag von Felix von Hand mit echten IONOS-Rückmeldungen bestätigt. Erkennt Vendo eine Rückmeldung künftig nicht, sperrt es nichts.

Eine automatische, getrennte Hard-/Soft-Bounce- und Beschwerdebehandlung fehlt. Erst anhand dokumentierter IONOS-Formate entscheiden, welche synthetischen Parserfixtures benötigt werden; echte Postfächer dürfen nicht abgefragt werden.

**Akzeptanz:** Ereignisquelle, Empfänger, Typ und Grund werden nachvollziehbar gespeichert; dauerhafte Fehler und Beschwerden verhindern weitere Sendungen; temporäre Fehler werden nicht fälschlich dauerhaft gesperrt; Abmeldung bleibt ein eigener Status. Dieselbe Sperrprüfung gilt in Kampagnen, Automationen, Importen und Wiederholungen.
**Prüfung:** Vollständige Parser-/Status-/Versandtests mit erfundenen Bounce- und Beschwerde-Nachrichten sowie Fake-Transport; gültige, ungültige und unbekannte Formate abdecken. Kein echtes IONOS/IMAP.

#### S2. Queue-Crashfenster und unklare SMTP-Zustände beherrschen

**Erledigt (16. November 2026), soweit mit SMTP möglich.** Der Versand wurde erst nach Rückkehr aus `sendMail` gespeichert (`schritt` in `haupt.js`), und der Kommentar in `warteschlange.js` versprach, ein Neustart dürfe „weder Mails verlieren noch doppelt schicken“. Jetzt steht ein Eintrag vor dem Versand auf `sendet`, nach einem Abbruch auf `unklar`, und wird dann nicht wiederholt. Ein Prozessabbruch nach Annahme durch SMTP, aber vor lokalem Speichern kann einen erneuten Versand auslösen. SMTP und lokales Speichern bieten keine gemeinsame atomare Transaktion.

**Akzeptanz:** Zustände vor, während und nach Versand sind unterscheidbar; ein unklarer Zustand wird nicht blind erneut gesendet; Produkttexte versprechen kein Exactly-once-Verhalten.

**Prüfung:** Fake-SMTP und kontrollierte Absturz-Injektion vor Annahme, nach Annahme und vor/nach Persistierung; Neustart und Wiederaufnahme mit synthetischer Queue prüfen.

#### S3. Shopify-Segmente mit Consent- und Sperrschutz einführen

Ein echtes Kampagnen-Segmentmodell nach Käufer/Nichtkäufer oder Produktart fehlt. Das ist ein eigener Ausbau, nicht bloß eine Kontakt-Suche.

**Akzeptanz:** Segmentregeln sind kuratiert und nachvollziehbar; Empfängerzahl wird vor Freigabe ermittelt; Abgemeldete, nicht eingewilligte oder gesperrte Kontakte gelangen nie in den Versand.

**Prüfung:** Synthetische Shops, Bestellungen, Zeiträume und Consent-Zustände; leere und große Segmente; Regression für jede Versandart. Keine Shopify-API oder echte Bestellung.

#### S4. Skalierbare Kontaktablage erst bei bestätigtem Bedarf umbauen

Wenn das 10.000-Kontakte-/5-MB-Limit nicht mehr ausreicht, braucht es eine explizite Entscheidung über Pagination, Indizes, Migration, Sicherung und Wiederherstellung. Eine Datenbank oder ein Serverdienst ist keine kleine Plugin-Korrektur.

**Akzeptanz:** Migrations- und Rückrollpfad, Verhalten bei alten/inkonsistenten Daten, Größenlimits und Backup-/Restore-Verfahren sind festgelegt.

**Prüfung:** Nur künstlich erzeugte große Datensätze, Migrationen und Fehler-/Abbruchtests; keine Kopie aus `daten/` und keine echten Kontakte.

#### S5. Phase-5-Auswertungen nur auf belastbaren Testdaten aufbauen

Noch geplant sind Übersichtstrends, ein Lernbuch, Versandzeitvorschläge, bessere Segmente und Hinweise zu schwachen Automationsschritten. Die vorhandenen Ergebnislisten sind bereits umgesetzt und dürfen nicht als offen dargestellt werden.

**Akzeptanz:** Definitionen für Kennzahlen und Empfehlungen sind reproduzierbar; fehlende oder durch Cookie-Ablehnung unvollständige Attribution wird als unbekannt statt als Null/Erfolg dargestellt.

**Prüfung:** Fest definierte, synthetische Kampagnen- und Bestellverläufe einschließlich fehlender Daten, Ausreißern und Zeitzonen; keine echten Kundenbestellungen.

#### S6. Öffentliche Endpunkte nur nach eigenständigem Architekturentscheid

One-Click-Abmeldung, öffentliche Anmeldeseiten, Newsletter-Archive und Öffnungs-/Klicktracking benötigen eine dauerhaft erreichbare HTTPS-Komponente. Das ist keine lokale Plugin-Aufgabe.

**Akzeptanz:** Nur nach ausdrücklicher Entscheidung über Hosting, Datenschutz, Authentifizierung, Betrieb und Verantwortlichkeit planen; bis dahin keine öffentlichen URLs oder Tracking-Pixel vortäuschen.

**Prüfung:** Falls später beschlossen: nur lokaler Server, synthetische Tokens und Fixtures; keine öffentliche Bereitstellung oder echten Empfänger in der Testphase.

## Aktueller Prüfstand

- Am 14. November nannte die Plugin-README 554 bestandene Tests in 21 Dateien; am 16. November nachgeprüft: 554 von 554. Nach den Korrekturen, S1 und der Zustellungs-Ampel sind es 615 Tests in 25 Dateien, alle bestanden (`node --test tests/newsletter-*.test.js`).
- Im Review wurden weder App-Oberfläche noch externe Integrationen live getestet. Solche Tests sind nach der oben festgelegten Vorgabe ausdrücklich ausgeschlossen.
- Von Hand durch Felix am 16. November 2026, außerhalb der automatisierten Tests: Testkampagne in Gmail und auf dem Handy angesehen (in Ordnung), Outlook bewusst nicht geprüft, weil nicht benötigt; Rückläufer-Ordner, Filterregel und Erkennung echter IONOS-Rückmeldungen in Vendo bestätigt. Dazu eine öffentliche DNS-Abfrage für SPF, DKIM und DMARC.
- Die frühere Aussage, ein echter UI-/Testmail-Lauf sei noch nötig, ist überholt: Für offene UI-Fälle sind lokale Tests mit synthetischen Daten und vollständig gestubbten Diensten erforderlich.
- Eine Dokuänderung wie diese ersetzt keine Verhaltensprüfung eines späteren Codeumbaus.

## Nicht Teil des lokalen Plugin-Ausbaus

Eigener Postfix-/Dovecot-/Rspamd-Stack, öffentliche Newsletterseiten, gehostete Medien, IP-Warmup, mehrere Versandprovider, SMS/Push, allgemeine externe Admin-APIs und Mehrbenutzerrollen erfordern eine separate Produkt-/Architekturentscheidung. Öffentliche Tracking- und Abmeldeendpunkte werden nicht ohne diese Entscheidung ergänzt. Öffnungs-/Klicktracking bleibt wegen Serverbedarf und Datenschutzabwägung bewusst außen vor.

## Vergleichsberichte und Belege

Die folgenden Abschnitte sind Recherche- und Belegmaterial, keine zusätzliche, unsortierte Aufgabenliste. Umsetzungsaufgaben stehen ausschließlich in der Roadmap oben und sind dort nach Schwierigkeit geordnet. Die Vergleiche beschreiben fremde Funktionen; sie sind keine Aufforderung, Code oder Texte zu übernehmen.

### Dispatch

Geprüft wurde Dispatch unter dem Commit [`880da86`](https://github.com/markedo-org/dispatch/commit/880da86f5ef9edc9ed4c1b58d65eacff40527c35). Dispatch ist ein selbst gehosteter Newsletter-Dienst mit API, CLI, MCP und Weboberfläche.

**Für Vendo besonders interessant:**

- **Rückläufer- und Beschwerdebehandlung:** Dispatch unterscheidet dauerhafte Zustellfehler, liest strukturierte IMAP-Zustellberichte und unterstützt Provider-Webhooks. Kontakte mit permanentem Bounce werden von weiteren Sendungen ausgeschlossen. Vendo liest bereits IMAP für Abmeldungen; Bounce-Erkennung wäre ein naheliegender nächster Schritt. ([Feature-Übersicht](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/docs/features.md), [Send-Service](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/internal/service/send.go))
- **Tags und Versandsegmente:** Dispatch versieht Empfänger mit Tags und kann eine Kampagne auf aktive Kontakte mit allen ausgewählten Tags begrenzen. Das passt zu Vendos geplantem Ausbau für Käufer-/Nichtkäufer- und Produktinteresse-Segmente. ([Subscriber-Service](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/internal/service/subscriber.go), [Send-Service](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/internal/service/send.go))
- **Versandakte je Kampagne:** Dispatch speichert den Zustand eines Versands und den Status je Empfänger; fehlgeschlagene, weiterhin aktive Empfänger können gezielt erneut versucht werden. Vendo hat schon Warteschlange und Protokoll; sinnvoll wäre eher eine bessere Übersicht je Kampagne als ein zweites Versandsystem. ([Send-Service](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/internal/service/send.go))
- **Gebündelter Vorab-Check:** Dispatchs Validierung liefert nicht nur Fehler, sondern auch verwendete/verfügbare Variablen, Empfängerzahl und geschätzte Versanddauer. Vendo prüft bereits viele HTML- und Inhaltsprobleme; ein einzelner „Versand bereit?“-Bericht könnte diese Prüfungen verständlicher zusammenfassen. ([AI-Agent-Design](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/docs/ai-agent-design.md))
- **CSV-Export:** Dispatch kann Empfänger exportieren. Vendo hat CSV-Import; ein lokaler Export mit Zustimmungsnachweis und Sperrstatus würde Datenportabilität und manuelle Sicherung verbessern. Geheimnisse dürfen dabei nicht enthalten sein. ([Dispatch-README](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/README.md))
- **One-Click-Abmeldung:** Dispatch setzt `List-Unsubscribe` und `List-Unsubscribe-Post` nach RFC 8058. Vendo dokumentiert derzeit `mailto` plus IMAP-Verarbeitung. Ein One-Click-Endpunkt wäre erst mit einer erreichbaren HTTPS-Komponente sinnvoll. ([Mailer](https://github.com/markedo-org/dispatch/blob/880da86f5ef9edc9ed4c1b58d65eacff40527c35/internal/mailer/mailer.go))

**Nicht einfach übernehmen:** Dispatchs Öffnungs-Pixel benötigt einen erreichbaren Server und ist nicht Vendos aktuellem Ziel entsprechend. Mehrere Provider und ein allgemeiner REST-/MCP-Server würden die lokale IONOS-Architektur und ihre Angriffsfläche unnötig vergrößern. Dispatch trennt Agentenrechte; Vendo hat mit der engen Bot-Aktionsliste und dem Versandvorbehalt für Felix bereits eine passende, strengere Grenze.

### MailCheap

Geprüft wurde MailCheap unter dem Commit [`281026b`](https://github.com/marclou/mailcheap/commit/281026b9fb9701ca27b5358846a27e2414579340). MailCheap beschreibt im README eine selbst gehostete und gehostete Newsletter-App mit Kampagnen, Zustellbarkeitsschutz und Website-Archiv. Das Repository steht unter AGPL-3.0; hier werden ausschließlich Funktionsideen beschrieben, kein Code übernommen. ([README](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/README.md), [Lizenz](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/LICENSE))

**Sinnvolle Beispiele für Vendo:**

- **Zustellbarkeitsschutz als Betriebsfunktion:** MailCheap beschreibt gestaffelte Versandmengen für neue Empfänger, automatische Pausen bei erhöhten Bounces/Beschwerden und die Anbindung an Gmail Postmaster Tools. Für Vendo wäre zunächst ein einfacher, erklärbarer Versand-Stopp bei auffälligen dauerhaften Fehlern passender als komplexe Provider-Infrastruktur. Prozentwerte oder Grenzwerte sollten nicht ungeprüft übernommen werden. ([MailCheap-README](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/README.md))
- **Inaktive Empfänger schonend behandeln:** MailCheap beschreibt einen Rückgewinnungsversuch und anschließendes Pausieren für Empfänger, die mehrere Ausgaben ignoriert haben. Vendo misst derzeit bewusst keine Öffnungen. Deshalb nicht „ignoriert“ aus fehlenden Messdaten ableiten; eine spätere Regel könnte höchstens nachvollziehbare Signale wie letzte Bestellung oder bestätigte Interaktion nutzen.
- **Kampagnen-Vorabprüfung mit Mail-Client-Grenzen:** MailCheap nennt unter anderem Betreff, Vorschautext, Abmeldelink, Postanschrift, Absender und Gmail-Clipping bei 100 KB als Review-Punkte. Vendos Prüfer könnten zusätzlich eine Warnung bei übergroßem HTML und einen gut sichtbaren Vollständigkeitsbericht anzeigen.
- **Absenderdomain prüfen:** MailCheap führt DKIM, Return-Path und DMARC als konkrete Einrichtungs- und Prüfdetails auf. Vendo plant bereits DNS-Prüfungen; dieser Vergleich stützt, das als Freigabe-Hinweis statt als unauffällige Konfigurationsnotiz zu gestalten.
- **Migrationsfreundlicher Import:** MailCheap beschreibt Importe aus mehreren Newsletter-Systemen einschließlich Status und Anmeldedatum. Für Vendo wäre das nur relevant, wenn Felix Kontakte aus einem anderen Anbieter migrieren möchte. Ein CSV-Export ist wahrscheinlich der kleinere, allgemeinere erste Schritt.
- **Web-Archiv und Anmeldeseiten:** Jede Ausgabe kann bei MailCheap als öffentliche Webseite erscheinen. Für Vendo wäre das eine spätere Server-Funktion; lokal kann die App keine zuverlässigen, öffentlichen Abmeldungs- oder Archiv-URLs bereitstellen.
- **MCP-Aktionen an dieselben Prüfungen binden:** MailCheap beschreibt, dass Dashboard, API und Agent dieselben Regeln verwenden und irreversible Sendungen eine Bestätigung verlangen. Vendo hat schon die Felix-Freigabe und Bot-Einschränkungen; wichtig ist, diese Prüfungen bei jeder neuen Bot-Aktion konsistent beizubehalten, statt separate, schwächere Wege zu schaffen.

**Nicht übernehmen, solange Vendo lokal bleibt:** öffentliches Newsletter-Archiv, öffentliche Anmeldeformulare, Provider-Webhooks, Postmaster-Abfragen und Öffnungs-/Klick-Tracking setzen erreichbare Server und zusätzliche Datenflüsse voraus. Das ist ein eigener Architekturentscheid, kein kleiner Plugin-Ausbau. ([Self-Hosting- und Funktionsdetails](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/README.md))

#### Abgleich mit dem Quellcode

Für den Code-Abgleich habe ich die zentralen Pfade für Vorabprüfungen, Kontaktimport und Sperrlisten, Versand und Provider-Events, Abmeldung, Segmente sowie Agentenaktionen angesehen. Dazu gehören beispielsweise [presend-checks.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/presend-checks.js), [contact-import.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/contact-import.js), [email-events.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/email-events.js), [sending.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/sending.js), [segments.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/segments.js) und [define-action.js](https://github.com/marclou/mailcheap/blob/281026b9fb9701ca27b5358846a27e2414579340/lib/actions/define-action.js).

**Im Code bestätigt:**

- **Vor dem Versand gibt es zentrale Inhalts- und Absenderprüfungen.** Dazu zählen unter anderem Betreff und Vorschautext, Inhalt und Variablen, Abmeldemöglichkeit, Postanschrift, Absenderdomain und Gmail-Clipping. Das ist mehr als ein README-Versprechen; die Prüfungen sind als eigener Ablauf implementiert.
- **Der Kontaktimport berücksichtigt Einwilligung und Suppressions.** Duplikate und ungültige Einträge werden behandelt; abgemeldete oder gebouncte Kontakte werden durch einen erneuten Import nicht einfach wieder freigeschaltet. Globale Suppressions verwenden HMAC-geschützte Kennungen statt Klartextadressen.
- **Versand und Events haben Schutz gegen doppelte Verarbeitung.** Nachrichten werden mit Status geführt, Kampagnen können pausieren und Provider-Ereignisse wie Bounces oder Beschwerden aktualisieren Sperrungen und Statistiken. Das Muster für Vendo wäre die zuverlässige Status- und Sperrlogik, nicht MailCheaps gesamte Mehrmandanten-Infrastruktur.
- **Die Abmeldung ist für einen Webdienst entworfen.** Der One-Click-Weg nutzt signierte Tokens und einen POST-Endpunkt; ein GET-Aufruf ändert den Abmeldestatus nicht. Das ist ein gutes Sicherheitsmuster, ersetzt aber keinen erreichbaren HTTPS-Endpunkt in Vendo.
- **Segmente und Agentenaktionen sind zentraler organisiert.** Segmentregeln werden über gemeinsame Logik ausgewertet. Aktionen haben definierte Eingabeschemata und Eigenschaften wie lesend, destruktiv oder wiederholbar; Versand erfordert eine Bestätigung. Vendo sollte vor allem die einheitliche Anwendung seiner Freigaben und Prüfungen beibehalten.

**Wichtige Einschränkung gegenüber dem Produktbild:** Teile des Zustellbarkeitsschutzes sind im Code ausdrücklich an MailCheaps Cloud-Betrieb gebunden. `send-backoff.js` überspringt Backoff im Self-Hosting; `sending.js` lädt Versandtempo nur in der Cloud und startet dort das Sender-Warmup. Diese Funktionen sind daher kein verlässlich verfügbares Vorbild für eine selbst betriebene Installation. Außerdem ist „self-hosted“ hier weiterhin ein Serverbetrieb: Der Versandpfad verwendet unter anderem MongoDB und QStash; es ist keine lokale Desktop-Anwendung wie Vendo.

**Urteil:** Als Funktions- und UX-Vorbild ist MailCheap unter den verglichenen Projekten wahrscheinlich das stärkste. Als Architekturvorlage für Vendos Plugin passt es nicht. Am sinnvollsten sind die übertragbaren Prinzipien – Vorabprüfung, Import-Schutz, nachvollziehbare Sperrstatus, einheitliche Freigaben und klare Versandbilanz. Öffentliche Endpunkte, Cloud-Warmup und die dafür nötige Server-Infrastruktur sollten nicht als kurzfristig fehlende Plugin-Funktionen missverstanden werden.

Das ist eine gezielte Prüfung wichtiger Kernpfade und kein zeilenweises Audit jeder Datei. Das fremde Repository wurde nicht ausgeführt; die verlinkten Tests wurden in dieser Prüfung nicht gestartet.

### NetSendo

Ich nehme **keine Funktionsbeispiele aus NetSendo** in diese Review auf. Das Repository bezeichnet sich als proprietäre, quelloffene Software und erklärt in seiner README, dass KI-Nutzung für Text-/Datenanalyse sowie der Aufbau konkurrierender Produkte aus dem Repository untersagt sind. Um diese Einschränkung zu respektieren, leite ich daraus keine Empfehlungen für Vendo ab. ([NetSendo-README und Lizenzhinweis](https://github.com/NetSendo/NetSendo/blob/bfe0bec00f85746923747233f4264ff40f27e4f8/README.md))

## Vergleich mit listmonk

**Prüfstand:** 14. November 2026. Geprüft wurden das öffentliche Repository und sein oberster Verzeichnisbaum sowie die aktuelle offizielle Dokumentation zu Installation, Entwicklung, Konzepten, Templates, Segmentierung, Bounces, Rollen, APIs, Import, Archiven und Messengern. Die Repository-Links zeigen auf den beweglichen Branch `master`, nicht auf einen festgehaltenen Commit. Das ist ein Architektur- und Funktionsvergleich, kein vollständiger Code- oder Sicherheitstest. listmonk wurde nicht installiert oder ausgeführt.

### Wie listmonk aufgebaut ist

listmonk ist **ein selbst gehosteter Serverdienst**, kein UI-Plugin und keine Electron-Bibliothek:

1. **Laufzeit und Datenbank:** Der Go-Server wird als einzelnes Programm oder Container betrieben. PostgreSQL ist eine notwendige externe Abhängigkeit (laut Installationsdokumentation Version 12 oder höher). Konfiguration, Datenbankschema, Installation und Upgrades gehören zum Betrieb der Instanz. Das unterscheidet sich grundlegend von Vendos lokalem Plugin-Speicher in `daten/plugins/newsletter.json`.
2. **Server- und Admin-Oberfläche:** `cmd/` enthält unter anderem getrennte Handler für Kampagnen, Kontakte, öffentliche Seiten, Bounces, Import, Einstellungen und Rollen. `internal/` kapselt Fach- und Infrastrukturteile wie Authentifizierung, Bounce-Verarbeitung, Events, Messenger, Drosselung, Medien und Subscriber-Import. `models/` enthält Domänen-/Datenmodelle; `queries/` bündelt SQL-Abfragen. Die Entwicklerdokumentation beschreibt die Admin-Oberfläche aktuell als servergerenderte HTML-Ansicht mit JavaScript; ihre Einführungsseite nennt noch Vue/Buefy. Die Frontend-Beschreibung in den offiziellen Dokumenten ist insofern nicht ganz einheitlich.
3. **Datenmodell:** Ein Subscriber ist ein zentraler Kontakt mit E-Mail, Name und frei strukturierten JSON-Attributen. Subscriber können zu mehreren Listen gehören; je Listenmitgliedschaft gibt es einen eigenen Status. Listen sind als öffentlich oder privat und mit Einzel- oder Double-Opt-in konfigurierbar. Kampagnen richten sich an eine oder mehrere Listen. Templates sind separat wiederverwendbar.
4. **Versand und Betrieb:** Kampagnen können vorbereitet, geplant und gestartet werden; die Einstellungen umfassen SMTP und Versandverhalten. Die Dokumentation behandelt Batchgröße für große Empfängerbestände und SMTP-Wiederholungen. Ein Kampagnenversand ist damit ein Dienstprozess, der unabhängig von einem geöffneten Desktopfenster laufen kann.
5. **HTTP-Schnittstellen:** Die administrativen Funktionen sind auch über JSON-APIs erreichbar. Daneben gibt es öffentliche Endpunkte für Anmeldungen/Abonnements, öffentliche Seiten, Links und Tracking sowie Provider-Webhooks. API-Benutzer und Rollen können Rechte getrennt nach Ressourcen und Listen erhalten; das Recht zum Senden ist von der Kampagnenverwaltung trennbar.
6. **Zustellfehler und Berichte:** Bounce-Verarbeitung kann ein POP3-Postfach lesen oder Ereignisse über Provider-Webhooks erhalten. listmonk klassifiziert Rückläufer heuristisch und kann Kontakte gemäß Einstellungen sperren oder entfernen. Die Kampagnenanalyse umfasst unter anderem Views, Links/Klicks und Bounces. Die Dokumentation weist auf die Datenschutzfolgen von View-/Click-Tracking hin und beschreibt auch anonyme Messung.
7. **Weitere Produktbereiche:** Subscriber-Import hat Status/Protokoll und kann abgebrochen werden; Daten lassen sich über APIs exportieren. Dazu kommen öffentliche Archive, System- und Opt-in-Seiten, Medienverwaltung, Transaktionsmail-API und externe Messenger für andere Nachrichtenkanäle. Das sind Bestandteile einer vollständigen Serveranwendung und nicht automatisch notwendige Newsletter-Plugin-Funktionen.
8. **Entwicklung und Tests:** Der Entwicklerablauf baut Admin-Assets und Go-Binary; die offizielle Dokumentation nennt eine Playwright-End-to-End-Suite für die Admin-Oberfläche und eine Entwicklungsumgebung mit PostgreSQL und Mailhog.

Die zentrale architektonische Idee ist also nicht einfach „mehr Newsletter-Funktionen“: listmonk besitzt eine öffentliche, dauerhaft erreichbare Webanwendung, ein relationales Datenmodell und eine Server-API. Dadurch kann es Anmeldungen, Abmeldungen, Tracking, Provider-Rückmeldungen und Versandaufträge auch dann verarbeiten, wenn kein Nutzer gerade ein Desktopprogramm geöffnet hat.

### Gegenüberstellung mit Vendos tatsächlichem Stand

| Bereich | listmonk | Vendo-Newsletter heute | Einschätzung |
|---|---|---|---|
| Betrieb | Dauerhaft laufender Go-Dienst, PostgreSQL, Binary/Docker | Lokales Electron-Plugin; Daten in Vendos Plugin-JSON und Versandprotokoll in lokalen Monatsdateien | **Architekturgrenze, kein fehlendes Plugin-Feature.** Vendo ist nicht unabhängig vom Windows-PC und Vendo-Prozess. |
| Kontakte | Zentraler Kontaktstamm, beliebige Attribute und mehrere Listenmitgliedschaften | Shopify-Consent-Kontakte plus CSV; lokaler Sperrstatus und Zustimmungsnachweis | Der Shop-/Consent-Bezug ist für Vendo passend. Es fehlen mehrere auswählbare Listen und allgemeine Kontaktattribute. |
| Empfängergruppen | Listen, Tags und Abfragen/Segmente; Segmentierung kann Kontaktattribute und dokumentierte SQL-Ausdrücke auswerten | Ein gemeinsamer Empfängerkreis; Suche dient der Kontaktverwaltung, Kampagnen-Zielgruppen sind noch kein echtes Segmentmodell | **Relevante Produktlücke** und bereits als Phase-5-Schritt 7 geplant. Mit festen, geprüften Regeln (z. B. Käufer/Nichtkäufer/Produktart) anfangen; keine beliebigen SQL-Ausdrücke aus listmonk übernehmen. |
| Anmeldung und Einwilligung | Öffentliche Formulare, Single-/Double-Opt-in, Bestätigungsseiten und Listenstatus | Shopify als Quelle, lokaler Nachweis und Filter auf `SUBSCRIBED`; keine eigene öffentliche Anmeldung | Das öffentliche Anmeldeformular und Double-Opt-in sind laut aktuellem Plugin-README bewusst nicht im Vendo-Ziel. Sie werden erst benötigt, wenn eine eigene Website-Anmeldung dazukommt. |
| Kampagnen | Listenwahl, Status/Tags, Vorschau, Zeitplanung, API-Steuerung und Kampagnenanalyse | Entwürfe, Vorschau, Testmail, Freigabe durch Felix, Zeitplan, Warteschlange und Bot-Grenze ohne Versandrecht | Für Vendos Einzelanwenderablauf funktional gut abgedeckt. Fehlende Zielgruppenwahl ist die größere Lücke als weitere Kampagnenverwaltung. |
| Editor und Templates | Wiederverwendbare Templates; Go-Template-Sprache und zahlreiche Funktionen; zusätzlich Template-API | Wiederverwendbare Muster/Vorlagen, kontrollierte Bausteine, begrenzte Personalisierungsfelder, HTML-Prüfung und Shoplink-Prüfung | Vendo hat weniger Ausdrucksmächtigkeit, dafür engere Inhalts- und Freigabegrenzen. Diese Beschränkung ist Absicht und kein Grund, eine allgemeine ausführbare Template-Sprache einzubauen. |
| Automationen | Die in den geprüften offiziellen Kernseiten dokumentierten Hauptobjekte sind Listen, Kampagnen, Templates und Transaktionsmails; ein gleichartiger visueller Mehrschritt-Marketing-Automationseditor ist dort nicht beschrieben | Warenkorb-, Willkommens- und Rückgewinnungsserien mit Wartezeit, Abbruchbedingungen und Shopify-Auslösern | Vendo deckt hier einen eigenen E-Commerce-Anwendungsfall ab; nicht als fehlende listmonk-Funktion oder als Grund zum Entfernen behandeln. |
| Versand und Wiederanlauf | Serverbasierter Kampagnenprozess; Batch- und SMTP-Retry-Einstellungen | Persistente Drossel und Warteschlange, Wiederholungen und Verfall; Versand wird alle 15 Sekunden aus dem Vendo-Hauptprozess abgearbeitet | Für kleine lokale Volumen plausibel. Das ist aber keine verteilte Queue und kein garantierter Dauerbetrieb. |
| „Genau einmal“-Versand | Server und Datenbank führen den Kampagnenzustand; SMTP bleibt auch dort ein externer Dienst | Seit 16. November: Eintrag steht vor dem SMTP-Aufruf auf `sendet`, nach einem Abbruch auf `unklar` und wird nicht blind wiederholt | **Bis 16. November ein Zuverlässigkeitsrisiko, jetzt behoben:** Nimmt der SMTP-Server die Mail an und Vendo stürzt vor dem Speichern des Erfolgs ab, kann der offene Eintrag nach Neustart erneut gesendet werden. Die lokale Schlüssel-Deduplizierung verhindert nicht dieses Crash-Fenster. „Genau einmal“ nicht als technische Garantie versprechen. |
| Abmeldung | Öffentliche Abonnement-/Einstellungsseiten und listmonk-Templates mit Abmelde-URL | Sichtbarer `mailto:`-Abmeldelink plus IMAP-Verarbeitung in einem vorgesehenen Ordner; Shopify-Abmeldungen werden synchronisiert | Der lokale Weg braucht funktionierende Postfachfilter und regelmäßiges Vendo. Ein echter HTTPS-One-Click-Weg erfordert erreichbare Infrastruktur; kein sinnvoller reiner Plugin-Ausbau. |
| Bounces/Beschwerden | POP3-Verarbeitung und Provider-Webhooks, Bounce-Statistik und Sperrregeln | IMAP liest Abmeldungen; es gibt keine getrennte Hard-/Soft-Bounce- oder Beschwerdeverarbeitung | **Wichtigste operative Funktionslücke vor größerem Verteiler-Versand.** Abmelde-Mails nicht als Bounce-Ersatz behandeln. Einen dedizierten, getesteten Rückläuferprozess samt dauerhafter Versandsperre planen. |
| Ergebnis-Messung | Views, Klicks/Links, Bounces und Kampagnen-Analytics | UTM-Zuordnung zu Shopify-Bestellungen, Umsatz und Abmeldungen nach Versand; keine Öffnungs-/Klickpixel | Bewusste Datenschutz-/Serverentscheidung. Shopify-Attribution misst Geschäftsergebnis, nicht Zustellung oder Interaktion; abgelehnte Cookies können sie unterzählen. |
| API und Anbindungen | Admin-/Public-APIs, Import/Export, Webhooks, Transaktions-API und Messenger | Interne Plugin-Aufrufe, Shopify GraphQL, SMTP/IMAP und dateibasierte Bot-Aufträge | Eine externe Admin-API oder zusätzliche Versandprovider sind nur bei konkret benanntem Integrationsbedarf sinnvoll. |
| Rollen und Mitarbeitende | Benutzer, Rollen und listenbezogene Rechte; Senden kann separat eingeschränkt werden | Lokale Vendo-Oberfläche mit Felix als Freigebendem; Texter-Bot darf Entwürfe und Auswertungen steuern, nicht senden | Für den derzeitigen Einzelnutzerfall ist die Freigabegrenze wichtiger als ein Mehrbenutzersystem. Rollen werden erst relevant, wenn mehrere menschliche Betreiber dazukommen. |
| Archiv/Medien | Öffentliche Kampagnenarchive, öffentliche Seiten und Medienverwaltung | Shoplinks/Bilder, keine öffentliche Newsletter-Webseite oder gehostete Medienbibliothek | Serverabhängig und aktuell nicht nötig. |
| Skalierung und Kontaktliste | PostgreSQL, paginierte APIs und dokumentierte Batchverarbeitung für sehr große Bestände | Shopify-Synchronisierung begrenzt auf 40 Seiten × 250 Kontakte = **10.000**; Plugin-Daten haben Vendos 5-MB-Grenze; Oberfläche zeigt bis zu 100 Kontakte pro Suche und bietet keine Seitensteuerung | **Konkrete Grenze, die der Produkttext offen nennen muss.** „Kein Kontaktlimit“ ist durch den derzeitigen Sync-Code nicht gedeckt. Vor einer größeren Liste Pagination/Export sowie Speicher- und Versandverhalten prüfen. |

### Zuordnung der listmonk-Befunde zur Roadmap

- **M4:** Kontakt-Export und Pagination; listmonk zeigt den Nutzen eines zentralen, paginierten Kontaktbestands.
- **M5:** Versandstatus und kontrollierte Wiederholung pro Kampagne.
- **S1:** Bounce-Erkennung und dauerhafte Suppressions.
- **S3:** nachvollziehbare Segmente; Vendo sollte dafür feste Shopify-Regeln statt beliebiger SQL-Abfragen verwenden.
- **S6:** öffentliche Anmeldungen, One-Click-Abmeldung, Tracking, Archive und APIs bleiben Serverfunktionen und erfordern vorab einen Architekturentscheid.
- **E1/E2:** listmonk ist außerdem ein Vergleichspunkt für klare Aussagen zu Datenmodell, Limits und tatsächlichem Funktionsumfang.

### Gesamturteil

listmonk ist das bessere Vorbild für **Listenmodell, Segmentierung, skalierbare Kontaktabfragen, Rückläuferverarbeitung, Versandbilanz und Admin-API**. Vendo hat dagegen bereits einen engeren, für den Shop zugeschnittenen Ablauf, den listmonk nicht ersetzt: Shopify-Kaufdaten, Warenkorb-/Rückgewinnungsserien, eng begrenzte Bot-Aktionen und Felix' explizite Versandfreigabe.

Die größte Lücke ist nicht, listmonk funktional nachzubauen. Es ist, Vendos lokalen Versand mit **Rückläufersperren, ehrlichen Datenlimits, eindeutigen Analysekennungen und einem vollständigen Offline-Ende-zu-Ende-Test mit synthetischen Fixtures** zuverlässig abzusichern. Danach ist die geplante, eng gefasste Shopify-Segmentierung der sinnvollste Funktionsausbau.

Ein späterer Wechsel zu einer Webplattform wäre eine eigene Architekturentscheidung: listmonk könnte dann als separater Dienst über seine dokumentierte API integriert werden. Es sollte nicht stillschweigend in das lokale Plugin eingebettet werden. Die Vergleichsarbeit hat keinen listmonk-Code kopiert; bei einer späteren Codeübernahme wäre dessen AGPL-3.0-Lizenz separat zu prüfen.

### Quellen zu listmonk

- [GitHub-Repository und README](https://github.com/knadh/listmonk)
- [Quellbaum `cmd/`](https://github.com/knadh/listmonk/tree/master/cmd), [`internal/`](https://github.com/knadh/listmonk/tree/master/internal), [`models/`](https://github.com/knadh/listmonk/tree/master/models), [`queries/`](https://github.com/knadh/listmonk/tree/master/queries) und [`static/`](https://github.com/knadh/listmonk/tree/master/static)
- [Installation und PostgreSQL-Anforderung](https://listmonk.app/docs/installation/)
- [Entwickleraufbau und Testumgebung](https://listmonk.app/docs/developer-setup/)
- [Konzepte: Subscriber, Listen, Kampagnen, Tracking und Bounces](https://listmonk.app/docs/concepts/)
- [Abfragen und Segmentierung](https://listmonk.app/docs/querying-and-segmentation/)
- [Templating](https://listmonk.app/docs/templating/)
- [Bounce-Verarbeitung](https://listmonk.app/docs/bounces/)
- [Rollen und Berechtigungen](https://listmonk.app/docs/roles-and-permissions/)
- [APIs: allgemeine Authentifizierung und Rechte](https://listmonk.app/docs/apis/apis/), [Kampagnen](https://listmonk.app/docs/apis/campaigns/), [Subscriber](https://listmonk.app/docs/apis/subscribers/), [Listen](https://listmonk.app/docs/apis/lists/), [Import](https://listmonk.app/docs/apis/import/), [Templates](https://listmonk.app/docs/apis/templates/) und [Transaktionsmails](https://listmonk.app/docs/apis/transactional/)
- [Messenger](https://listmonk.app/docs/messengers/) und [öffentliche Archive](https://listmonk.app/docs/archives/)

## Vergleich mit BillionMail

**Prüfstand:** Der bewegliche Branch `dev`, festgehalten auf Commit [`fc36c76`](https://github.com/Billionmail/BillionMail/commit/fc36c76c050c3775c5e899faf7403cf0262d2744). Untersucht wurden README, Docker Compose, Backend-API-Verträge, ausgewählte Service-Implementierungen, Frontend-Verzeichnisse und vorhandene E2E-Tests. Das ist ein Architektur- und Funktionsvergleich, kein vollständiges Code-, Lizenz- oder Sicherheit-Audit. BillionMail wurde hier nicht installiert oder ausgeführt.

### Wie BillionMail aufgebaut ist

BillionMail ist **ein selbst gehosteter Mailserver mit Newsletter- und Marketingfunktionen**, keine Desktop-Anwendung und keine Bibliothek für Vendo:

1. **Betrieb als Server-Stack:** Das Docker-Compose-Setup startet PostgreSQL 17.4 und Redis 7.4.2 sowie eigene Container für Rspamd, Dovecot, Postfix und die BillionMail-Core-Anwendung. Roundcube wird als Webmail mitgeliefert. Die Container teilen persistente Daten- und Konfigurationsverzeichnisse und exponieren je nach Konfiguration HTTP/HTTPS, SMTP/Submission und IMAP/POP. Domain, DNS, Zertifikate, offene Ports, Datensicherung und laufende Wartung gehören damit zum Produktbetrieb. ([Docker Compose](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/docker-compose.yml))
2. **Backend und Oberfläche:** Der Core ist in Go mit GoFrame aufgebaut. Die Weboberfläche liegt unter `core/frontend`; `package.json` belegt Vue 3, TypeScript, Pinia, Rsbuild und Vitest. Das Repository trennt API-Verträge, Controller, interne Services und Modelle. Damit ist die Architektur eine mehrteilige Webanwendung und kein lokaler Plugin-Bereich mit Vendos JSON-Datei als Datenspeicher. ([Frontend-Paket](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/frontend/package.json), [API](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api), [Controller](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/controller), [Services](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service))
3. **Kontakte und Gruppen:** Der Kontakt-API-Vertrag umfasst Gruppen, Import und Export, Listen und Zuordnungen, Bearbeitung, Trends sowie Tagging. Daneben gibt es eigene Subscribe-List-, Tags- und Abnormal-Recipient-Bereiche. Das spricht für getrennte Kontakte und Empfängergruppen statt einer einzelnen lokalen Empfängerliste. ([Contact-API](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api/contact/contact.go), [API-Baum](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api))
4. **Kampagnen und Versand:** Der `batch_mail`-Vertrag enthält Vorlagenverwaltung, Erstellen und Verwalten von Versandaufgaben, Testmails, Statistiken, Versandprotokolle, Diagramme, Pause/Fortsetzen und Anpassung der Versandgeschwindigkeit. Die Versandstrecke ist ein serverseitiger Batchprozess; ein einzelnes geöffnetes Desktopfenster ist keine Voraussetzung. ([Batch-Mail-API](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api/batch_mail/batch_mail.go), [Batch-Mail-Service](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/batch_mail))
5. **Vorlagen und Personalisierung:** Vorlagen können erstellt, geändert, kopiert, gelöscht, aufgelistet und geprüft werden. Der Versandcode rendert Vorlagen und verarbeitet Empfängerattribute. Das ist ein eigenständiger Template- und Kampagnenbereich; es belegt jedoch nicht automatisch dieselben Shopify-spezifischen Daten oder Prüfschritte wie Vendo. ([Template-API](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api/email_template/email_template.go), [Template-Rendering und Versand](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/batch_mail))
6. **Tracking und Abmeldung:** Repository-E2E-Tests prüfen einen Öffnungspixel, umgeschriebene Klicklinks und gespeicherte Ereignisse. Ein weiterer Test folgt einem signierten JWT-Abmeldelink bis zum Endpunkt und prüft, dass der Kontakt deaktiviert wird. Das belegt konkrete implementierte Abläufe, nicht deren unabhängige Zustellbarkeit oder Datenschutzkonformität in jedem Betrieb. ([Tracking-E2E-Test](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/e2e/tests/test_03_tracking.py), [Abmelde-E2E-Test](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/e2e/tests/test_04_unsubscribe.py), [Unsubscribe-API](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/api/batch_mail/batch_mail.go))
7. **Fehlerempfänger und Sender-Warmup:** Es gibt einen Abnormal-Recipient-Dienst, der fehlgeschlagene/bounced Empfänger aus Mailstatistiken auswerten und in einer eigenen Tabelle führen kann. Warmup-Code und ein E2E-Test für Warmup-Kampagnen sind vorhanden. Diese Funktion ist auf Absender-/IP-Aufwärmung ausgerichtet, nicht gleichbedeutend mit einer Shopify-Verhaltensautomation. Die Existenz des Mechanismus allein belegt noch nicht, dass jede Bounce-Klasse korrekt erkannt, dauerhaft gesperrt und in allen Versandpfaden ausgeschlossen wird. ([Abnormal-Recipient-Service](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/abnormal_recipient/abnormal_recipient.go), [Warmup-Service](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/warmup), [Warmup-E2E-Test](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/e2e/tests/test_06_warmup.py))
8. **Qualitätssicherung:** Neben Frontend-Vitest gibt es Backend-Tests und Python-E2E-Tests, unter anderem für Tracking, Abmeldung, Kontakte, Warmup und Mailversand. Dass Tests im Repository liegen, ist ein besserer Beleg als ein Feature-Claim im README; sie wurden für diesen Vergleich aber nicht gestartet. ([E2E-Tests](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/e2e/tests), [Batch-Mail-Service-Tests](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/batch_mail))

**Wichtige Quellen-Einschränkung:** Das README beschreibt BillionMail einerseits als implementierte Mailserver-/Newsletter-Plattform und zeigt Docker-Installation sowie Kampagnenfunktionen. Andererseits stehen darin noch Formulierungen wie „future“ und „Once development begins“, obwohl die oben genannten APIs, Dienste und Tests im selben geprüften Commit vorhanden sind. Aussagen wie „unlimited sending“, „a billion emails“ und „in 8 minutes“ sind Marketingversprechen, keine durch den Repository-Code oder einen Lasttest belegte Kapazitäts- oder Verfügbarkeitsgarantie. ([README des geprüften Commits](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/README.md))

### Gegenüberstellung mit Vendos tatsächlichem Stand

| Bereich | BillionMail | Vendo-Newsletter heute | Einschätzung |
|---|---|---|---|
| Betriebsmodell | Mehrcontainer-Mailserver, PostgreSQL/Redis, Weboberfläche und öffentlich erreichbare Serverdienste | Lokales Electron-Plugin, Shopify plus SMTP/IMAP, Plugin-Daten in Vendos lokalem JSON-Speicher | **Grundlegender Produktunterschied.** Die BillionMail-Serverinfrastruktur ist keine Plugin-Funktionslücke. |
| SMTP und Domainbetrieb | Verwaltet eigenen Postfix-/Dovecot-Stack, Domains, Mailboxen, Relays und Rspamd | Nutzt einen externen SMTP-/IMAP-Anbieter; keine eigene Mailserververwaltung | BillionMail kann den ganzen Mailbetrieb kontrollieren, trägt dafür aber DNS-, IP-Reputations-, Sicherheits-, Backup- und Wartungsaufwand. Für Vendo nur relevant, wenn bewusst ein eigener Mailserver betrieben werden soll. |
| Kontaktimport/-export | Kontaktgruppen, Tags, Import-/Export- und Gruppen-APIs | Shopify-Sync und CSV-Import; kein vollständiger CSV-Export, Shopify-Sync derzeit auf 10.000 Kontakte begrenzt | Export, skalierbare Kontaktansicht und klare Limits sind sinnvolle Vendo-Verbesserungen. Das PostgreSQL-Datenmodell selbst sollte nicht unbesehen in das Plugin übernommen werden. |
| Kampagnen | Serverseitige Aufgaben mit Statistiken, Versandlogs, Pause/Fortsetzen und Geschwindigkeitssteuerung | Entwurf, Testmail, menschliche Freigabe, Zeitplanung, lokale Queue, Drosselung und Wiederholungen | Vendo hat den passenden Freigabefluss für den Einzelnutzer; BillionMail ist stärker bei zentralem Versandbetrieb und Serverstatus. Vendos bekanntes Absturzfenster zwischen SMTP-Annahme und lokalem Erfolgsprotokoll bleibt separat zu beheben bzw. offenzulegen. |
| E-Commerce-Automationen | Ein `automation`-Frontendpfad existiert, die darin geprüfte `index.vue` enthält aber nur einen Platzhalter (`<div>aaaaa</div>`). Daraus ist kein funktionsfähiger Marketing-Automationseditor abzuleiten. | Warenkorb-, Willkommens- und Rückgewinnungsserien mit Shopify-Bezug, Wartezeiten und Abbruchbedingungen | **Vendo ist hier im konkreten Shop-Anwendungsfall weiter.** BillionMails vorhandenes IP-/Kampagnen-Warmup ist eine andere Art Automation. |
| Segmente und Tags | Kontaktgruppen und Tagging sind im API-Vertrag sichtbar | Echter Shopify-Kampagnenfilter nach Kauf-/Produktsegmenten fehlt noch | Kuratierte Shopify-Segmente sind ein sinnvoller Vendo-Ausbau; nicht mit einer bloßen Liste oder Kontakt-Suchfunktion verwechseln. |
| Abmeldung | Signierter JWT-Link und HTTP-Endpunkt; E2E-Test prüft Deaktivierung des Kontakts | `mailto:` plus IMAP-Verarbeitung; keine eigene öffentliche Abmeldeseite | BillionMails Muster ist für ein Webprodukt passend. Vendo kann es ohne öffentlich erreichbaren HTTPS-Endpunkt nicht gleichwertig bereitstellen. |
| Rückläufer/Sperren | Eigene Abnormal-Recipient-Verwaltung und automatische Auswertung fehlgeschlagener/bounced Empfänger sind im Code vorhanden | Keine getrennte Hard-/Soft-Bounce- oder Beschwerdeverarbeitung | **Wichtige Vendo-Lücke vor größerem Versand.** BillionMail ist ein gutes Beispiel für eine getrennte Sperrliste; die konkrete Fehlerklassifikation und alle Sperrpfade müssten bei einer Übernahme-Idee separat geprüft werden. |
| Öffnungs-/Klickmessung | Pixel- und Linktracking sind durch E2E-Tests abgedeckt | Bewusst nicht enthalten; Vendo misst Bestellungen über Shopify-UTM-Zuordnung | Kein automatisches Muss: Tracking braucht erreichbare Endpunkte, erzeugt zusätzliche personenbezogene Ereignisse und ist nicht dasselbe wie Umsatzattribution. |
| Absender-Warmup | Dedizierte Warmup-Services und Warmup-Kampagnen sind vorhanden | Kein eigener IP-Warmup; Vendo versendet über IONOS | **Nicht kurzfristig übernehmen.** IP-Warmup ist vor allem beim Betrieb eigener Versand-IP-Adressen relevant, nicht eine allgemeine Automationslücke bei externem SMTP. |
| Rollen/Administration | Webbasierte Systemverwaltung für Domains, Mailboxen, Relay, Einstellungen und RBAC | Lokale Bedienung, Felix gibt Versand frei; Bot-Aktionen dürfen nicht selbst versenden | Vendos menschliche Freigabe bleibt die maßgebliche Sicherheitsgrenze. Mehrbenutzerverwaltung wäre erst bei weiteren menschlichen Betreibern nötig. |
| Öffentliche Reichweite | HTTP(S)-Anwendung, Tracking- und Abmeldeendpunkte, Webmail | Kein öffentlicher Serverendpunkt aus dem Plugin | BillionMail kann zentrale Webfunktionen anbieten, weil es als Serverprodukt betrieben wird. Das ist eine eigene Architekturentscheidung für Vendo. |

### Zuordnung der BillionMail-Befunde zur Roadmap

- **M4/M5:** Kontaktgruppen, Export und Kampagnenstatus als mögliche UX-Anregung; BillionMail bleibt ein Serverprodukt.
- **S1:** Abnormal-Recipient-Verwaltung als Beispiel für eine getrennte Sperrliste; die reale Fehlerklassifikation müsste unabhängig geprüft werden.
- **S2:** Serverseitige Versandaufgaben sind ein Vergleich für Statusführung, lösen aber nicht automatisch Vendos SMTP-/Dateisystem-Crashfenster.
- **S3:** Kontaktgruppen und Tags sind Anregungen für kuratierte Shopsegmente.
- **S6:** JWT-Abmeldung und Öffnungs-/Klicktracking setzen einen öffentlich erreichbaren Endpunkt voraus und bleiben außerhalb des lokalen Plugin-Umfangs.
- **Nicht als Vendo-Aufgabe ableiten:** eigener Mailserver, IP-Warmup und ein visueller Marketing-Automationseditor. Im geprüften Commit war die `automation`-Ansicht nur ein Platzhalter; Warmup ist Absender-/IP-Aufwärmung, keine Shopify-Verhaltensautomation.

### Gesamturteil

BillionMail ist das passendere Vorbild für **selbst gehostete Mailzustellung, Kampagnenbetrieb, Kontaktgruppen/Tags, serverseitige Statusführung, Rückläufersperren und Tracking**. Der Preis dafür ist ein dauerhaft zu betreibender, öffentlich erreichbarer Mailserver mit Datenbank, Cache, mehreren Mailkomponenten und entsprechendem Sicherheits- und Wartungsaufwand.

Vendo löst ein anderes Problem: ein lokaler, enger Shopify-Workflow mit menschlicher Versandfreigabe. Die E-Commerce-Automationen sind für diesen Zweck konkreter als BillionMails im geprüften Frontend sichtbarer Automationsbereich. Der sinnvollste Transfer besteht daher aus einzelnen Betriebsprinzipien – dauerhafte Bounce-Sperren, verständliche Versandstatus, kontrollierte Wiederaufnahme und Kontakt-Export – nicht aus einer Servermigration oder dem Nachbau des gesamten Mailserver-Stacks.

BillionMail wird laut README unter AGPL-3.0 veröffentlicht. In diesem Review wurden nur Funktionen und Architektur beschrieben; es wurde kein BillionMail-Code übernommen. ([Lizenz](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/LICENSE))
