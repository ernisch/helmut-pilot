# Gemeinsame Einzelunit-Integration, 24.10.2026

Status: **BLOCKIERT an der nativen U/Parts-Neuqualifikation**. Der Code ist in
`codex/unit60-qualified-integration-20261024` zusammengeführt. Kein qualifizierter
gemeinsamer Kopf, kein nativer Einzelunit-/500er-Lauf und kein Merge/Production.

## Zusammenführung und erhaltene Änderungen

Basis ist das frisch gelesene `main` `1eb3cbff848f686d86a5236180b3dce8ac3129c3`.
Lokale Mergecommits `0119f25c`, `9cca09fe`, `eaf7c40c` erhalten die vollständige
Vorgängerkette #934 (`3d5be8b6`) → #933-Merge `b1333219` → #936 (`2fc821fd`),
anschließend #937 (`49df8e91`) und #938 (`8d16e3de`). Alle Köpfe sind Vorfahren
des Integrationsstands. Kein bestehender Branch wurde umgeschrieben.

Die aktuellen main-Regeln und die Routerdokumentation sind byteidentisch erhalten.
Die Routerdateien verbinden main-Recovery/Replacement-Schutz mit der bereits in
der Vorgängerkette enthaltenen begrenzten Read-Ausgabeänderung. Dafür bestanden
die 30 synthetischen Routergruppen; kein Modell wurde aufgerufen.

Aus `dd40b8dd` ist ausschließlich die geschlossene Fehlerklassifikation für den
TransactionGuard übernommen. Fremde Fehler werden über keine message/code/stack-
Felder klassifiziert und ergeben `unclassified`. Vorgänger `2374e0b3` wurde nicht
übernommen: kein `track_functions`, kein Statistikreader, keine Einschränkung auf
`same-root-usage`. Alle vier vorhandenen Guardfälle bleiben vorgesehen. Die dort
nötige Umbenennung eines Profilberichts hat im nicht instrumentierten Motor
keinen Bericht als Ziel; sie bleibt im ursprünglichen Profilierungsbranch.

Der Worker erzeugt den Nichtpersistenzhinweis der Erstfehleraufzeichnung jetzt
mit `json.dumps`. Das fehlende öffnende Anführungszeichen ist damit behoben.

## Gezielte Prüfung

Alle Tests über `scripts/lokal.js`; Runtime Node v24.19.0/Python 3.12.14.

| Suite | Tatsächliches Ergebnis |
| --- | --- |
| `local-unit-native-worker-final-capture-test.py` | 18 PASS |
| `local-unit-native-transaction-guard-test.js` | 52 PASS |
| `local-unit-native-diagnostic-integration-test.py` | 2 PASS |
| `deepseek-cloud-router-test.js` | 30 PASS |

Der neue Integrationstest verbindet den realen JS-Catch über echte kurze
synthetische Nodekinder mit Source-NodeChild, Controller-Wrapper, Host und dem
AST-isolierten Workerabschluss. Der eigentliche Guard-Workload ist eine Node-VM
mit gesperrter I/O; ein Zähler simuliert genau einen unbekannten Schreibversuch.
Kein Datenbank-/Motor-/Originalzugriff, keine reale Schreibwiederholung.
Erstbeleg vor Cleanup, reale Exit1/zwei EOFs, Mappingrennen ohne Source-TERM,
vollständige beziehungsweise unvollständige Pinprüfung und Gesamt-FAIL sind
geprüft. Private Sentinelwerte erscheinen nicht in öffentlichen Fehlerrahmen.
Der erste neue Testaufbau scheiterte vor dem Kindstart an einer falschen
Fixtureworker-Zuweisung; diese wurde korrigiert, beide Fälle danach PASS.

Die vorhandenen 155/#938- und 230/#937-Tests bleiben Belege ihrer ursprünglichen
Quellköpfe. Keine pauschale lokale Wiederholung; kein Übertragen ihrer Annahme auf
den gemeinsamen Stand. Pflicht-CI wird einmal am veröffentlichten PR-Kopf geprüft;
der folgende unveränderte Qualifikationsblocker verhindert eine grüne Annahme.

## Unabhängig festgestellter Qualifikationsblocker

Die separate SOL-Prüfung `qualify_runtime_delta` bestätigt unveränderte
`decodeInternal`-/Kontrollleser-/ACK-Kerne und die engen Einmalzeugengrenzen.
Sie bestätigt **keine** native Annahme. Die tatsächlichen neuen Dateipins sind:

| Datei | Bytes | SHA256 |
| --- | ---: | --- |
| `lib/helmut/auth-state-parts.js` | 28525 | `b2e7c46761999160a3815d38d64649628e067181ce957da86e4480a7c90e79fa` |
| `lib/helmut/llm-usage-atomic.js` | 32034 | `b55cad5d7cc8528121140bd175e3b48d56ccbc11f6c415780a666406601d3477` |

`INDEPENDENT_PUBLICATION_REVIEW.SAFE.json` in der vorhandenen
`current-control-source-qualification-20261023`-Kette setzt ausdrücklich
`sourceOnlyQualificationAllowed:false`. `control-cache-integration.js` bindet
weiter die vollständigen alten U-/Parts-Dateien (32050/27356 Bytes) und verlangt
ein echtes geschlossenes Fünffallpaket. Die spätere Lease-SOURCE-only-Ausnahme
gilt nicht für U/Parts. Eine neue Ausnahme wäre eine Vertragsänderung.

Benötigt werden neu gebundene SourceFreeze/PREPARED/Plan/Verifier-Belege,
Lifecycle NONE und OLD/NEW/NEW/OLD sowie unabhängige Actual-/Publicationprüfung
und GenerationAudit. Der historische Kontrolltreiber prüft `U.write`, nicht
`writeOwn`; die Own-Pfad-Abnahme bleibt zusätzlich erforderlich.
Die notwendigen Original-/Laufverzeichnisse sind hier nicht vorhanden. Keine
Übertragung, Rekonstruktion oder Ersatzoriginale wurden vorgenommen.

Die zwei alten Manifestzeilen und der Cache-Gate bleiben unverändert. Weder
Prüfcode noch erwartete Hashes wurden für ein grünes Ergebnis geändert. Die
Runtime-Artefaktprüfung bleibt deshalb rot, ebenso die native Quellenbindung.
Die unabhängige statische Prüfung ist kein Ersatz für die fehlenden Belege.

## Rückweg und nächster Schritt

Dieser Branch verändert ausschließlich Code und Dokumentation. Kein Secret,
Command, Claim, Journal, Profil oder Original wurde verändert. Rückweg vor jeder
Ausführung: den Integrations-PR nicht übernehmen; `main` bleibt `1eb3cbff`.
Innerhalb des Entwicklungsbranches lassen sich die drei Zusammenführungen und
der folgende Korrekturcommit rückwärts zurücknehmen; keine Datenmigration nötig.

Erst das neue gültige Komponentenpaket in der bestehenden Originalumgebung
erstellen und unabhängig annehmen; anschließend versionierte Verbraucher und
Manifest aus den geprüften Bytes fortschreiben und Pflicht-CI neu prüfen.
Danach frische einmalige Einzelunitbindung, Original-/Runtime-/Prozess-/Platten-
Admission und unabhängige Annahme vorbereiten. Keine alten GOs/Claims verwenden.
Genau ein vollständiger nativer Einzelunitlauf bleibt separat auszuführen:
unveränderter Zeitanker einschließlich Autorisierung, zweimal19.900ms,16Kontrollen,
drei Positionen, vollständiger19er-Abschluss/FinalACK/Rücklesung und echter
Prozess-/EOF-/Originalabschluss. Unter60s/Auth30 und gemeinsamer Peak≤1548000000B
bis letztem Exit sind zu belegen; kein Full500-/Plateauersatz und kein Retry.
