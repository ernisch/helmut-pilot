# Helmut UI Umsetzung und Überschneidungsprüfung

Stand: 02.10.2026. Die freigegebenen UI Änderungen sind auf
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

Der aktive Motor-Chat war über die Chatwerkzeuge nicht auslesbar. Deshalb
blieb der erste Commit ausschließlich dokumentarisch. Die anschließende
explizite Dateifreigabe des Nutzers ermöglicht diese Umsetzung. In den
zugänglichen Branch-/Worktree-Daten ist keine Überschneidung mit den
geänderten UI Dateien nachgewiesen; zentrale Motorstatusdokumente bleiben
unangetastet. Vor einem späteren Merge erneut gegen den Motorstand vergleichen.

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
| `scripts/browser-smoke-test.js` mit verpflichtendem Browser | 66 PASS, 0 FAIL: echter lokaler Servershell-Boot, Desktop/Mobil, Navigation und Querformatsperre einschließlich Hit-Test. |
| `scripts/ui-design-browser-check.js` | 80/80: 1440 × 900 und 390 × 844, sechs Ansichten, sieben Onboarding-Schritte, lokale Schriftladung, Statusfarben, 44-px-Flächen, Textumbruch, bedienbare Togglezeile, Light Theme, keine JS-Fehler/Fremdrequests. |
| Syntax und Diff | `node --check` für Client und neue UI-Prüfungen, `git diff --check` erfolgreich. |

Die zusätzliche Design-Browserprüfung benötigt Playwright/Chromium und ist ein
expliziter lokaler Check, kein neuer Eintrag im Motor-/Offline-Testprogramm.
Screenshots enthalten ausschließlich synthetische UI Testdaten und wurden
visuell geprüft:
[Desktop Briefing](screenshots/desktop-helmut.png),
[Mobile Briefing](screenshots/mobil-helmut.png),
[Mobile Einstellungen](screenshots/mobil-settings.png).

## PR und spätere Mergebereitschaft

Der bestehende Draft PR wird mit Umsetzung, Tests und Screenshots aktualisiert.
Der UI Commit enthält `[skip ci]`, weil die bestehende CI auch umfassende
Motor-/500er-Datenbankprüfungen startet und hier ausschließlich gezielte
UI Tests beauftragt sind. Workflows und Teststeuerung werden nicht geändert.
Die beiden Pflichtchecks werden daher für diesen Kopf **nicht als bestanden**
ausgegeben: `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`.

UI-seitig ist der Branch für das spätere Review vorbereitet. Ein Merge bleibt
an den erfolgreichen, unabhängig abgenommenen 500er Nachweis, erneute
Überschneidungsprüfung, aktuelle Pflichtchecks und ausdrückliche Mergefreigabe
gebunden. In diesem Auftrag wird weder gemergt noch Production ausgerollt.
