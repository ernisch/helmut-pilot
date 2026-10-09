# Blocker 2: fester Nurleselauf für Profil 12 — Vorbereitung

Stand: 09.10.2026, offline vorbereitet; **kein Merge, Deployment oder neuer Production-Eingabeabruf freigegeben oder ausgeführt**. Fachabnahme weiterhin **0/500**. A4/B5 abgeschlossen, C gesperrt.

## Anlass und Umsetzung

Die vollständige Aufnahme 37790661298 bleibt die eigene historische 500er Bilanz. Die spätere Aufnahme 37826938407 brach an Profil 12 mit HTTP 500 ab. PR #874 liefert inzwischen eine geschlossene Speicher-Lesediagnose; die frühere Timeoutursache bleibt UNKNOWN. Ein neuer Abruf soll diese Diagnose für genau dieselbe synthetische Position sichtbar machen. Er ersetzt keinen vollständigen positiven Einzelnachweis.

Der neue Einstieg `scripts/github-blocker2-readonly-diagnose12.js`, seine lokale Action und `.github/workflows/blocker2-readonly-diagnose12.yml` sind fest auf `test-kohorte-synthetik-bt-012` gebunden. Es gibt keinen Profil-, Positions- oder Umfangsparameter. Workflow-Commit und erwarteter Production-Commit müssen identisch sein; Drift stoppt vor Cipher-ACK und jedem Production-GET. Der bisherige feste 122er Einstieg bleibt bestehen, der normale 500er Einstieg behält seinen Umfang.

Der Leser übernimmt den bestehenden Cipher-/ACK-/Stop-Vertrag: bestätigter erster verschlüsselter Checkpoint vor Quellenzugriff, höchstens **1 Eingabe-GET + 2 Identitäts-GETs**, keine Wiederholung, keine Umleitung, höchstens drei Minuten Leserzeit und 15 Minuten Jobzeit. Fehler stoppen vor weiteren GETs. Originalantworten einschließlich HTTP-500-Body und SHA256 bleiben innerhalb der bestehenden Größenlimits ausschließlich verschlüsselt. Die 500 Positionsdateien bilanzieren genau einen Versuch und 499 nicht erfasste Positionen; alle 500er-Abnahmeflags bleiben falsch. Ein später bestätigter Abschlusscheckpoint kann trotz vorherigem ACK-Fehler gesichert sein; der Lauf bleibt dann ausdrücklich fehlgeschlagen.

## Freigabegrenze

Der aktuelle Auftrag umfasst nur Branch, Offlineprüfung, unabhängige Codeprüfung, Draft-PR und CI. Vor Installation und tatsächlichem Abruf ist ein neues konkretes GO erforderlich. Es muss den endgültigen geprüften PR-Kopf, einen regulären Merge mit automatisch erwartetem Deployment sowie genau einen dispatch des neuen Workflows auf dessen bestätigtem Merge-/Production-Commit binden. Kein anderer PR, Workflow, Retry, 122er oder 500er Lauf ist enthalten.

Für dieses spätere GO werden drei identische rein lesende 52-Tabellen-Prüfungen vorgesehen: vor Installation, nach READY vor dem Abruf und nach abgeschlossenem Abruf. SQL SHA256 `cfd0986829e79848b53be2509b1bade5de5f34f767a4466a1da42c8e948c4c90`: vollständiges SELECT unverändert, ausschließlich transaktionslokal `jit=off`, REPEATABLE READ READ ONLY, 15 Sekunden Statement- und zwei Sekunden Lockfrist. Zeilenzahlen und Vollzeilen/xmin-Fingerabdrücke müssen exakt der unveränderlichen Nach-B-Basis entsprechen. Keine Wiederholung nach Abbruch.

Deployment-Metadaten höchstens zwölf Reads/15 Minuten; Capture-Beobachtung höchstens 20 Minuten. Vor dispatch keine konkurrierende Aufnahme in der gemeinsamen Concurrency-Gruppe. Empfängerbindung bleibt der bestehende öffentliche Schlüssel mit Fingerabdruck `8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7`; der private Schlüssel bleibt ausschließlich serverseitig. Kein neuer Schlüssel, Drive-Schreibzugriff oder Betreiber-Dateitransfer.

Die spätere Wiederherstellung bindet Run-ID, Workflowpfad, event/ref/attempt 1, exakten Quellcommit und Berliner Tag; vollständige Artifactliste, Original-ZIP-Digests, sichere Extraktion und AEAD jedes Einzelbelegs werden geprüft. Nur Position 12 darf den neuen Eingabebody enthalten; die anderen 499 bleiben nicht erfasst. Authentisierung des Ciphertransports ist keine Absendersignatur und keine fachliche Abnahme. Historische Originale bleiben getrennt.

Nicht enthalten: weitere Production-Eingaben oder Funktionsaufrufe, Anbieterlogs, Modelle, Daten-/Profil-/Reservierungsänderungen, Aktivierung, Konfiguration, Kostenrahmenänderung, Rückweg, manuelles Deployment/Cancel, zusätzliche Sicherung oder Retentionsänderung. Übergabebranch weiterhin nicht mergen oder deployen. Das konkrete gebundene Freigabepaket liegt privat außerhalb von Git und wird erst nach finalem Review/CI abgeschlossen.

## Prüfung

Gezielte neue Gegenproben verwenden Fake-GETs und echte RSA/AES-Verschlüsselung: feste Profil-/Commitbindung, unveränderter HTTP-500-Originalbody, honest 499-Nichterfassung, Identitäts-/Profil-/Modell-/Hash-/ACK-/Tages-/Frist-/Größenstopps und abgewiesene Selektoren. Bestehende 122er-, 500er- und dauerhafte Cipher-Prüfungen sichern die Regression. Tatsächliche Ergebnisse und endgültiger Kopf werden im PR und privaten Nachweispaket dokumentiert; dieser Text behauptet keine Production-Ausführung oder abgeschlossene Fachabnahme.
