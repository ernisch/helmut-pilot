# Helmut UI Umsetzung und Überschneidungsprüfung

Stand: 02.10.2026. Die freigegebenen Desktop- und Mobile-UI-Änderungen sind auf
`codex/ui-design-20261002` umgesetzt und gezielt lokal getestet.
Draft PR: https://github.com/ernisch/helmut-pilot/pull/771

## Auftrag und Isolation

Der Nutzer hat ausdrücklich bestätigt, dass die Motorarbeit `client.js`,
`styles.css` und `index.html` aktuell nicht bearbeitet, und die Umsetzung auf
bestehendem UI Branch freigegeben. Die frühere Dokumentationssperre ist damit
für diese drei Dateien aufgehoben. Grundlage bleiben die hochgeladenen
`handoff/UI-Ehrlichkeitspruefung.md`, `handoff/prototyp/Helmut Desktop.dc.html`
und die sieben Schritte der `Ersteinrichtung.dc.html`.

Die Übergabe ist eine Designvorlage, keine zusätzliche Handlungsfreigabe.
Insbesondere ihre vorgeschlagenen Merge-Schritte gelten hier nicht:
**Nichts mergen, kein Production Deployment.** Keine neuen Funktionen.
Main, Motor, Backend, Cron, Datenbank, dauerhafte Umgebungsvariablen,
Production Daten und Dateien des 500er Tests werden nicht geändert.

Gelesen wurden [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md),
[START_HERE.md](../START_HERE.md), [CURRENT_STATE.md](../CURRENT_STATE.md)
und der relevante Abschnitt der [Roadmap](../ROADMAP_BIS_500.md).
Keine zusätzliche AGENTS.md im Checkout gefunden.
Branches, Worktrees, lokale Änderungen und verfügbare laufende Arbeiten wurden
rein lesend geprüft. Der ursprüngliche Worktree `/workspace/helmut-pilot`
bleibt auf `work`, sauber und bei `97a843501e971509cf8794a065eed81997201861`.
Die isolierte UI Arbeitskopie ist `/workspace/helmut-ui`.

Der erste Commit blieb wegen fehlender Dateibelegungsinformationen ausschließlich
Dokumentation. Die anschließende ausdrückliche Dateifreigabe des Nutzers ermöglicht
die UI Umsetzung. Für die Mobile Fortsetzung wurde erneut rein lesend geprüft:
main ist inzwischen drei Motorcommits weiter bei `0d6c163c`; keiner ändert
`client.js`, `styles.css` oder `index.html`. Auch die vier einschlägigen Branches
`financial-admission-integration`, `financial-intent-integration`,
`starttor-vorbereitung-integration` und `synthetik500-vollhistorie-stand`
(jeweils `codex/…-20261002`) haben keine UI Überschneidung.
Das vollständige Lesen des Motor-Chats scheiterte weiterhin, seine kompakte
Statusabfrage war diesmal erreichbar und nennt Kosten-/Starttor-/Executorarbeit.
Zusammen mit sauberen Worktrees und der bestehenden ausdrücklichen Dateifreigabe
ist keine aktuelle Überschneidung festgestellt. Verdeckte Änderungen in anderen
Umgebungen werden damit nicht pauschal ausgeschlossen. Zentrale Motorstatusdokumente
bleiben unangetastet; vor einem späteren Merge erneut abgleichen.

Der UI Branch wurde nicht mit den neuen Motorcommits zusammengeführt. Tests beziehen
sich auf seine bestehende isolierte Basis `97a84350` plus UI Änderungen; die spätere
Integration mit dem dann aktuellen Motorstand bleibt gesondert zu prüfen.

## Umgesetzter Umfang

| Vorgabe | Ergebnis |
| --- | --- |
| C1, C3 | Onboarding nennt etwa zwei Minuten und vorhandene Büro-Entwürfe; kein Versprechen sofortiger Bereitschaft oder automatischer Vorproduktion. |
| C2 | „Rückmeldungen“ ersetzt „Lernpuls“ und „Helmut lernt“. Keine behauptete Änderung der Priorisierung; der Hinweis benennt gespeicherte Rückmeldungen und ihren bestehenden Einsatz für Büro-Textentwürfe ab fünf. |
| C4 | Quellenlauf und Radar behandeln auch HTTP 200 mit `ok:false` als Fehler. Kein Erfolgshinweis, kein ersetzender Briefing-Reload; der letzte Stand bleibt sichtbar. Bestehende HTTP-/Netzfehler bleiben abgefangen. |
| C5 | „Profil gespeichert“ nur bei erfolgreicher Profilantwort; fehlgeschlagener Abschluss meldet „Profil konnte nicht gespeichert werden“. |
| C6 | Delegation bestätigt Erfolg erst nach HTTP-Erfolg und gespeicherter Task-ID; bei Fehler keine lokale Task und kein Delegationslog. |
| C7 | Interaktionshelper bestätigt HTTP-Erfolg und gespeicherte ID. Rückmeldungsstatus und Erfolgshinweis ändern sich erst nach dieser Bestätigung; Fehler melden „Rückmeldung nicht gespeichert“. |
| C8–C10 | Leeres Briefing ohne ungeprüftes Meldeversprechen, Radarhinweis auf morgens/abends mit „Quellen jetzt prüfen“, Aktualisierungsfehler ohne sofortigen Wiederholversuch. |
| D1, D2 | Bedienflächen mindestens 44 × 44 px; Togglezeilen vollständig anklickbar, beschriftete Labels mindestens 12 px, benannte Metadaten mindestens 13 px. Lange Hinweise und Fußzeilen umbrechen vollständig. |
| D3, D4 | Lokale Spectral-, Hanken-Grotesk- und IBM-Plex-Mono-Schriften mit OFL-Lizenzen, dokumentierte dunkle Farben und feine Linien, ruhiger blauer Akzent, blauer Punkt statt gefülltem Stern. Bestehende Navigation und übrige Funktionen bleiben erhalten. |

Fehler-Rot ist einheitlich **`--risk: #D97B7B`**; `--danger` verweist darauf.
Statusfarben: Grün `#39d18f` aktuell, Gelb `#D6A040` Warnung/veraltet,
Blau `#7FA8E0` Handlung/aktive Auswahl. Im Light Theme bleibt Statustext
auf hellem Grund lesbar; farbige Flächen und Punkte tragen die Kennzeichnung.
Die statische Shell erhält eine neue Assetversionskennung und Schriftpreloads.
Die Servershell verwendet bereits dynamische Assetversionen; kein Backend-Bump.

Nicht übernommen: Prototyp-Beispieldaten, Beispielbilder, Browserdaten oder
Pilotnutzername. Der nicht verifizierte Haushalts-Satz spielt keine Rolle.
Inline-Notfall-Watchdog und seine kritischen Splash-Regeln bleiben unverändert,
weil sie in `server.js` gespiegelt sind. Auch der Querformatsatz bleibt bis
nach dem 500er Test zurückgestellt. Desktop und Mobile sind dieselbe App;
Hochformat wird gestaltet, die bestehende Querformatsperre bleibt erhalten.

## Finale Mobile Übergabe: M1–M7 umgesetzt, M3/M8 zurückgestellt

Zusätzliche Grundlage: `Helmut Mobile Prototyp.zip`, insbesondere `LIESMICH.md`
und `UI-Ehrlichkeitspruefung.md`. Die Behauptung des Pakets, C1–C10 seien noch
nicht umgesetzt und der UI Branch sei unbekannt, beschreibt dessen frühere
Main-Lesung. Maßgeblich ist der tatsächlich geprüfte Branch `codex/ui-design-20261002`.
Vorschläge für getrennte PRs und spätere Merge-Schritte erweitern den Nutzerauftrag
nicht: bestehender Draft PR #771 bleibt offen. Repository-`CLAUDE.md` und `AGENTS.md`
werden nicht ersetzt oder geändert. Keine Prototyp-HTML-Datei, Persona oder
fiktiver politischer Inhalt wird in Produktcode übernommen.

| Mobile Vorgabe | Ergebnis |
| --- | --- |
| M1 | Leiste Briefing/Lage/Radar/Büro in dokumentierter Reihenfolge, 60 px hohe Bedienflächen, Beschriftung 13 px, Safe-Area-Abstand. Profilzugang in der Kopfleiste bleibt auch bei Briefing und Radar sichtbar. |
| M2 | Lage als vertikale Liste; mobile Detailansicht verwendet dieselben bereits vorhandenen Inhalte und Quellen wie das Desktop-Sheet, ohne inneren Scrollbereich. Vorhandene Ansichten `detail`, `vorgang` und `office-detail` haben sichtbares Zurück und Browser-Zurück/Vorwärts. `detailOriginView` bleibt maßgeblich. Browserhistorie enthält nur Sitzungskennung/Index, keine Profil- oder Entwurfstexte; alter Zustand nach Konto-/Mandatswechsel wird ignoriert. Keine neuen URLs, Deep-Links, Backendabrufe oder fachlichen Berechnungen. |
| M4 | Hinweise, Status-, Quellen- und Speichertexte umbrechen; keine Ellipse bei diesen Hinweisen. Formularbezeichnung über dem Feld, mindestens 13 px Text beziehungsweise 12 px für Mono-Kennzeichnungen. |
| M5 | Screenshots und echte Chromium-Prüfungen bei 390 × 844 und 360 × 780; Desktopvergleich 1440 × 900 und bestehende blockierende Querformatsperre 844 × 390. |
| M6 | Einspaltige Raster, 16 px Seitenrand, korrigierter Lage-Karussellversatz, umgebrochene Radar-/Bürozeilen und lange Detailtitel, begrenzte Hinweisfensterbreite. Hauptbereich und sichtbare Kind-Elemente auf Überbreite geprüft, statt Fehler nur durch `overflow-x:hidden` zu verdecken. |
| M7 | `min-height:0` an betroffenen Containern; variable Kopf- und Detailhöhen. Lange mehrzeilige Kopftexte bleiben sichtbar und der Seitenanfang ist wieder erreichbar. |

**M3 bleibt zurückgestellt:** Der neue Satz „Bitte drehe dein Gerät ins Hochformat.“
würde `index.html` und `server.js` zugleich betreffen. Die vorhandene Sperre samt
altem Satz bleibt und ist getestet. **M8 bleibt zurückgestellt:** Kein neuer
H-Zeichen-/Herzschlag-Startbildschirm, keine zusätzliche Mindestladedauer.
Der bestehende Splash und sein Watchdog bleiben vollständig erhalten.
`index.html` ändert in dieser Fortsetzung ausschließlich die Assetversionskennung.

Desktop und Mobile bleiben dieselbe App mit denselben vorhandenen Daten und
Handlern. Die Anordnung ist unter 768 px einspaltig; Mobile unterstützt nur
Hochformat. Auf Desktop bleibt das bestehende Lage-Sheet erhalten. Neue
Produktfunktionen wie Vorgangsverlauf oder „neu seit deinem letzten Briefing“
sind nicht enthalten.

## C4 und C7: Antwortverträge rein lesend geprüft

- `/api/pipeline/run`: abgefangener Timeout liefert
  `{ok:false, bounded:true, reason:"pipeline-run-timeout", error:...}` mit
  HTTP 200. Deshalb prüft der Client zusätzlich `result.ok`.
- `/api/lage/check`: der gelesene `runLageCheck`-Pfad liefert einen gespeicherten
  Check mit `status:"stable"` oder `"changed"`, optional `v3Refresh`, ohne eigenes
  Top-Level-`ok:false`. Geworfene Fehler werden als HTTP-Fehler beantwortet.
  Bestehende HTTP-Prüfung bleibt; kein spekulativer Backendumbau.
- `/api/interactions`: Antwort ist der gespeicherte Eintrag mit ID. Der lokale
  Speicherpfad liefert erst nach erfolgreichem `writeStore` zurück; geworfene
  Fehler werden HTTP-Fehler. Der Client prüft beides statt die Antwort zu verwerfen.

Es wurden keine Live-Fehler provoziert und keine Production-Endpunkte abgefragt.

## Erfolgreiche gezielte Verifikation

Alle Node-Prüfungen über `node scripts/lokal.js -- node …` in der isolierten
UI Arbeitskopie. Der Starter entfernt Zugangsdaten nur aus dem Testkindprozess
und erzwingt lokalen Speicher; Sitzung und Konfigurationsdateien bleiben gleich.
Keine Motor-, 500er-, Datenbank-, Crawl- oder kostenpflichtigen Läufe gestartet.

| Prüfung | Ergebnis |
| --- | --- |
| `scripts/ehrlichkeit-ui-test.js` | 34/34: echte Clienthandler im isolierten DOM-/Fetch-Modell; bestätigte Erfolge, HTTP-/Netzfehler, unvollständige Antworten, verzögerte Rückmeldung, Timeout-/Skip-Verträge. |
| `scripts/radar-ui-test.js` | 32/32 |
| `scripts/helmut-tab-ui-test.js` | 57/57 |
| `scripts/splash-boot-test.js` | 29/29 |
| `scripts/orientation-lock-test.js` | 19/19 |
| `scripts/browser-smoke-test.js` mit verpflichtendem Browser | 66 PASS, 0 FAIL: echter lokaler Servershell-Boot, Desktop/Mobil, Navigation und Querformatsperre einschließlich Hit-Test. |
| `scripts/ui-design-browser-check.js` | 201/201: 1440 × 900, 390 × 844, 360 × 780 und Querformatsperre 844 × 390; sechs Ansichten, sieben Onboarding-Schritte, echte Mobile-Taps, Browser-Zurück/Vorwärts, richtige Vorgangskennung, Konto-/Mandatswechsel, Avatar-/Mitteilungsfenster, lange Kopf-/Detailtexte, Quellenhinweise, lokale Schriften, Statusfarben, Bedienflächen, Textumbruch, Light Theme, keine JS-Fehler/Fremdrequests. |
| Syntax und Diff | `node --check` für Client und neue UI-Prüfungen, `git diff --check` erfolgreich. |

Die zusätzliche Design-Browserprüfung benötigt Playwright/Chromium und ist ein
expliziter lokaler Check, kein neuer Eintrag im Motor-/Offline-Testprogramm.
Screenshots enthalten ausschließlich synthetische UI Testdaten und wurden
visuell geprüft:
[Desktop Briefing](screenshots/desktop-helmut.png),
[Mobile Briefing](screenshots/mobil-helmut.png),
[Mobile Einstellungen](screenshots/mobil-settings.png),
[Lage Liste 390](screenshots/mobil-briefing.png),
[Lage Detail 390](screenshots/mobil-lage-detail.png),
[Büro Detail 390](screenshots/mobil-office-detail.png),
[Radar 390](screenshots/mobil-radar.png),
[Briefing 360](screenshots/mobil-360-helmut.png),
[Lage Detail 360](screenshots/mobil-360-lage-detail.png),
[Büro Detail 360](screenshots/mobil-360-office-detail.png),
[Querformatsperre](screenshots/mobil-querformat.png).

## PR und spätere Mergebereitschaft

Der bestehende Draft PR wird mit Desktop- und Mobile-Umsetzung, Tests und Screenshots aktualisiert.
Der UI Commit enthält `[skip ci]`, weil die bestehende CI auch umfassende
Motor-/500er-Datenbankprüfungen startet und hier ausschließlich gezielte
UI Tests beauftragt sind. Workflows und Teststeuerung werden nicht geändert.
Die beiden Pflichtchecks werden daher für diesen Kopf **nicht als bestanden**
ausgegeben: `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`.

UI-seitig ist der Branch für das spätere Review vorbereitet. Ein Merge bleibt
an den erfolgreichen, unabhängig abgenommenen 500er Nachweis, erneute
Überschneidungsprüfung, aktuelle Pflichtchecks und ausdrückliche Mergefreigabe
gebunden. In diesem Auftrag wird weder gemergt noch Production ausgerollt.
