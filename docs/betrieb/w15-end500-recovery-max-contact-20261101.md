# W15: korrigierter End500-Lauf und SQL-Einzelablage (01.11.2026)

[Run 41280267757](https://github.com/ernisch/helmut-pilot/actions/runs/41280267757)
auf `efc990ba742b5f35b79dc96e60a06e70280ac104` ist **FAIL**, unabhängig bestätigt.
Die einmalige neue Betreiberfreigabe ist verbraucht. Der Ausführungsbranch wurde
ohne Force Push vom ausdrücklich zugelassenen `ed2a9642` auf diesen Kopf
vorgeschoben. Pflicht-CI 41258278927 und unabhängige Vorprüfung waren PASS.

Die tatsächliche Anfrage im Job ist kanonisch identisch zur freigegebenen Anfrage;
Run, Commit, Versuch 1 und neue Nonce sind gebunden. Genau eine frische Linkrunde,
ein POST, unmittelbar vorher 297,190 Sekunden Restgültigkeit und 51.059
Parameterzeichen. Kein Retry oder Linkrefresh. Jobdauer 1.231 Sekunden.

## Tatsächlicher Befund

Die Fortschrittsquittung bestätigt **exakt 500 Auth-CAS, 6.000 Usagezeilen und
3.501 native Postimages**. Der Empfangs-/Restorepfad und die geprüfte
Verarbeitungsfolge wurden bis zur Sicherungsrücksicherung durchlaufen. Der
Supervisor meldet `PARENT_READBACK_REJECTED`; letzte sicher beobachtete Phase
`backup-recovery`, Sequenz 43, ausdrücklich `ENTERED_NOT_COMPLETED`.

Das unveränderte Hartlimit beträgt knapp 5 GB. `memory.events.max=2` belegt
Grenzkontakte; `oom`, `oom_kill`, `oom_group_kill` und Swap bleiben 0. Ein
Grenzkontakt ist kein OOM und beweist für sich keinen Speicherzuweisungsfehler.
Höchster bestätigter Kernelpeak: **4,999979 GB**. Der endgültige Lifetimepeak
nach Bereinigung bleibt UNKNOWN.

| Messung | Tatsächlicher Wert | Aussagegrenze |
| --- | ---: | --- |
| Gemeinsamer bestätigter Kernelpeak | knapp 5,00 GB | nicht Anbieter-RAM, endgültiger Peak nach Cleanup UNKNOWN |
| Gemeinsamer Verbrauch, letzte gültige Recoveryprobe | 4,989 GB | vor dem ablehnenden Readback |
| Dateiseiten einschließlich Shared Memory, dieselbe Probe | 4,550 GB | keine Zuordnung zu einzelnen Dateien |
| Anonymer Speicher, dieselbe Probe | 290 MB | kein Helmut- oder PostgreSQL-Einzelpeak |
| Kernel, dieselbe Probe | 148 MB | keine atomare Peakkomposition |
| Verfügbare Hostreserve, dieselbe Probe | 15,088 GB | über der unveränderten Reserve von rund 2,15 GB |

Shared Memory, Dirty und Writeback sind Teilmengen; nicht nochmals addieren.
CPU und vollständige Komponentenpeaks bleiben UNKNOWN. Die vorhandenen PSS-Werte
sind unvollständige bestätigte Untergrenzen, keine belastbaren Anbieterpeaks.

Die beobachteten Phaseneintritte zeigen gemeinsamen Verbrauch von 1,989 GB vor
Collection, 2,539 GB vor Seal, 3,086 GB vor Transport, 3,644 GB vor
Authentifizierung und 4,193 GB vor Recovery. Das belegt einen Anstieg im
Sicherungsweg, keine bytegenaue Zuordnung des Peaks zu einer Datei. Die erreichte
geprüfte Gatefolge bestätigt verschlüsselten Transport und authentifizierte
Rücklesung als Vorstufen. Zweite Wiederherstellung und abschließender
Integritätsvergleich wurden **nicht abgeschlossen**; finale Profilflags bleiben
in dieser fehlgeschlagenen Abschlussquittung UNKNOWN.

Alle acht Bereinigungsprüfungen sind tatsächlich PASS: Workerexit, IPC-Schluss,
Parent-Stopp, leerer Parent, entfernte Unit, Launcherexit sowie geschlossene
Listener und wiederhergestellte Signalbehandlung. Prozessstillstand ist belegt.
Ein verschlüsseltes Artefakt: rund 532 MB, ein Tag Aufbewahrung; konservativer
Speicherkostenbound 0,00495 USD bei 0,05 USD Freigabe. Keine Payload erneut
abgerufen, keine Originale, Drive-Dateien oder Secrets gelöscht oder geändert.

## Nachgewiesene unnötige Kopie und begrenzter Korrekturkandidat

Der bisherige Restore-Worker erzeugt eine vollständige SQL-Datei im
Containeroverlay und kopiert sie anschließend vollständig in den bestehenden
Auditpfad. Angewendet wird weiterhin die erste Kopie. Derselbe native
Fünfschrittpfad wird bei der zweiten Rücksicherung wiederverwendet.

Der Korrekturkandidat rendert unmittelbar über einen exklusiv erzeugten
0600-Dateideskriptor in die vorhandene Auditdatei. Hashprüfung und Anwendung
verwenden dieselben SQL-Bytes. Alle fünf Aktionen, Lifecycle-, Integritäts- und
Nullaktivitätsprüfungen bleiben erhalten. Keine Löschung, Hardlinks,
Cachemanipulation, Peakresets oder Grenzänderung.

Acht gezielte synthetische Gegenproben sind PASS und prüfen Einzelablage, Pin-Drift, Anwendung,
vorhandene Dateien, Symlinks, native Fehler sowie den bestehenden Sicherungsanschluss.
Pflicht-CI und unabhängiger Review des finalen Kandidaten bleiben verbindlich;
ihre tatsächlichen Kopfbindungen stehen am zugehörigen Draft-PR.

Die ursprüngliche SQL-Dateigröße und die genaue innere Recoveryaktion beim
Abbruch sind UNKNOWN. Die vermeidbare Vollkopie ist bewiesen; weder ihre alleinige
Ursächlichkeit für diesen Grenzkontakt noch ein zukünftiger vollständiger
Abschluss unter 5 GB werden behauptet.

## Startgrenze

Keine positive vollständige End500-Abnahme. Mock500 bleibt dadurch gesperrt;
elf Mockoriginale und historische Quellenqualifikation bleiben übernommen.
Alte reguläre RAM-FAILs, Anbieterparität UNKNOWN und historische Fehler werden
nicht umgewertet. Production500 wurde nicht ausgeführt und bleibt separat
freizugeben.

Das bestehende Kettenjournal erhält beide fehlgeschlagenen Endläufe samt
unabhängigen Quittungen; der einzige korrigierte Zusatzversuch ist verbraucht.
Kein weiterer Endlauf lässt sich aus dem bisherigen GO oder der bedingten
Mockfreigabe ableiten. Ein späteres neues GO muss eine neue eindeutig begrenzte
Ausführungsautorität festlegen; kein Journalreset und keine Startschutzumgehung.

Private Originalbelege und Metadaten liegen im bestehenden privaten Belegbereich
`/workspace/helmut-w15-private-evidence-20261101/END500_02/` (0700/0600), mit
Inventar und vollständigen Quittungshashes. Hier werden ausschließlich aggregierte
technische Befunde veröffentlicht, keine privaten Original- oder Ergebnisdateien.
