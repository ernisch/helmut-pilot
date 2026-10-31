# W15: gezielter Quellbestand und einmaliger Exportauftrag

**Ergebnis der Folgeprüfung: alter Bestand in der aktuell angebundenen Umgebung
nicht erreichbar. Keine Aussage über Verlust in der früheren Umgebung.**
Keine Archive erstellt, keine Nutzdaten übertragen und kein End500/Mock500 gestartet.

Der vom Betreiber bestätigte Pfad
`/workspace/shared/helmut-w15-memory-forward-20261028/` und alle daraus konkret
adressierten Dateien wurden rein lesend geprüft. Der übergeordnete Ordner
`/workspace/shared` ist hier lesbar und enthält keinen W15-Bestand. Der aktuelle
Environment-Status gilt ausschließlich für diese angebundene Umgebung; er bietet
keinen Dateizugriff auf die frühere Quelle.

## Wiedergefundener letzter Nachweis

Im bestehenden Codex-Chat **„Hauptthread“**, ID
`01a17c84-6676-71ca-ab08-d63e6e5cf05c`, Host `durable`, ist ein damaliger
Leseauszug erhalten. Command-ID:
`exec-6e6e6c23-3537-4339-bceb-ff1c02d19bff`. Er gehört zum Turn vom
28.10.2026, 20:35:30–20:44:23 UTC / 23:35:30–23:44:23 Europe/Istanbul.
Ein genauerer Zeitstempel dieses Einzelbefehls ist nicht verfügbar.

Der Auszug enthält alle fünf `protectedOutputPins` des gelesenen Bounds mit
vollständigen Pfaden, Größen und SHA256. Die Empfangsmetadaten bestätigen damals
`pathExists:true` für Dump und Rollen; deren `receivedPath`-Werte wurden dabei
nicht ausgegeben. Der gesamte Shellbefehl endete später mit Exit2, weil ein
nachfolgendes `sed` eine nicht vorhandene Skriptdatei öffnen sollte. Die zuvor
ausgegebenen Metadaten sind erhalten; daraus wird kein erfolgreicher Gesamtlauf
und keine neue Hashprüfung der Nutzdateien abgeleitet.

Der Hauptlauf hat diesen Primärauszug gelesen. Der zusätzliche unabhängige
Chatabruf blieb ohne Antwort; der Helfer bestätigt nur Form, Eindeutigkeit und
Summen der übergebenen Metadaten. Kein unabhängiger Abruf-PASS behauptet.

## Genau einmal benötigter Satz

**Neun Nutzdateien, zusammen exakt 242.548.460 Bytes**, ohne Kontrollmetadaten.
Die fünf Fixtures liegen laut letztem Nachweis unter
`/workspace/shared/helmut-w15-memory-forward-20261028/`:

| Schlüssel | Dateiname | Dateibytes |
| --- | --- | ---: |
| auth | END500_AUTH.PRIVATE.json | 13.616.854 |
| evidenceRows | END500_EVIDENCE_ROWS.PRIVATE.json | 60.645.822 |
| privateDraftStoreRows | END500_PRIVATE_DRAFT_STORE_ROWS.PRIVATE.json | 5.771.345 |
| resultRows | END500_RESULT_ROWS.PRIVATE.json | 29.294.535 |
| privateDraftReviewRows | END500_PRIVATE_DRAFT_REVIEW_ROWS.PRIVATE.json | 8.267.504 |

Diese fünf Dateien ergeben 117.596.060 Bytes. Dateigröße und Größe eines erneut
serialisierten JSON-Objekts sind getrennte Größen; der vorhandene Runtimevertrag
für `bound.authJSONBytes` wird nicht auf die Dateigröße umgestellt.

Weitere vier Nutzdateien:

| Schlüssel | Zuletzt gebundener Pfad oder verbindliche Auflösung | Bytes |
| --- | --- | ---: |
| seed | `/workspace/shared/helmut-w15-memory-atomic-20261028c/seed.PRIVATE.sql` | 118.800.333 |
| currentCommand | `/workspace/shared/helmut-w15-atomic-integration-20261028d/current-command.PRIVATE.json` | 1.169.844 |
| frozenSourceDump | Empfangsmanifest: `files[key=frozenSourceDump].receivedPath` | 4.981.565 |
| localRoles | Empfangsmanifest: `files[key=localRoles].receivedPath` | 658 |

Die historischen kanonischen Dump-/Rollenpfade lauten
`/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/FROZEN_SOURCE.PRIVATE.dump`
und daneben `EXACT_LOCAL_ROLES.PRIVATE.sql`. Sie sind keine behaupteten aktuellen
Empfangspfade. Auf dem direkten End500-Weg werden die im hashgebundenen
Empfangsmanifest ausgewiesenen Kopien verwendet.

Zusätzlich drei unveränderte Kontrollbelege:

| Beleg | Quellpfad | Bytes |
| --- | --- | ---: |
| Bound | `/workspace/shared/helmut-w15-memory-forward-20261028/END500_MEMORY_BOUND.SAFE.json` | 4.985 |
| unabhängiger Fixture-Review | `/workspace/shared/helmut-w15-memory-forward-20261028/END500_FIXTURE_INDEPENDENT_REVIEW.SAFE.json` | 4.438 |
| Empfangsmanifest | `/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json` | quellseitig zu messen |

Alle neun Nutzdatei-SHA256 und drei Kontrollbeleg-SHA256 stehen geschlossen in
[source-export-request.json](../../scripts/w15-github/source-export-request.json).
Die Gesamtsumme einschließlich Kontrollen ist **242.557.883 Bytes plus die noch
quellseitig zu messenden Bytes des Empfangsmanifests**. Keine komprimierte
Transfergröße behauptet. Als kleinster erster Nachweis genügt eine quellseitige
Hashinventur; heute ist keine Übertragung freigegeben.

Bereits verfügbare Provenienz wird aus Git übernommen: Integrationsergebnis,
vollständiger SQL-Vorabbeleg, echter PostgREST-Stopbeleg sowie Journal-, Stop-,
Beobachtungs-, Wachstums- und D-Vorabreviews. Drei konkrete bytegebundene
Original-/Git-Pfadzuordnungen stehen ebenfalls im Exportauftrag. Keine nochmalige
Übernahme ganzer Stagingbäume, Binärdateien, Rohlogs, historischer Gesamtarchive
oder der übrigen neun Originalnutzdateien des alten Eingangspakets.

## Rein lesende Quellinventur vorbereitet

```sh
python3 -B scripts/w15-github/source_inventory.py --inventory-only
```

Auf der tatsächlichen Quellumgebung auszuführen, nachdem der öffentliche
Werkzeugstand verfügbar ist. Das Programm verwendet ausschließlich die bekannte
Wurzel `/workspace` und den daneben versionierten Exportauftrag. Keine Suche,
kein Unterprozess, kein Netzwerk, keine Datenbankoperation und keine Schreib-
oder Exportfunktion. Zuerst prüft es alle drei kleinen Kontrollbelege mit SHA,
ihre Bindungen und den unveränderten Umfang. Erst danach streamt es die neun
ausgewählten Dateien durch SHA256. Symlinks, Hardlinks, falsche Rechte und
Pfadausbrüche werden abgewiesen. Die private Pfadstruktur des Empfangsmanifests
gelangt nicht in stdout.

In der aktuellen Umgebung tatsächlich ausgeführt: `SOURCE_UNAVAILABLE`, Exit1,
`filesFreshlyVerified:false`, `transferAllowed:false`, `testStarted:false`.
Der erste Kontrollbeleg fehlt; keine Nutzdatei wurde gelesen. Ein späterer
Erfolg hieße nur `PASS_SOURCE_INVENTORY_ONLY_START_BLOCKED`. Er erstellt kein
Archiv und ist weder Transfer-GO noch Start-GO.

**Konkreter nächster Schritt:** Lesezugang zur früheren Quellumgebung des Chats
„Hauptthread“ bereitstellen und dort genau diese Inventur ausführen. Wenn die
zwölf Dateien frisch bestätigt sind, ausschließlich diesen Satz für den
Export vorbereiten. Die Übertragung wartet weiterhin auf die konkrete Freigabe.

## Entwicklungsstand und Veröffentlichung

Der zuvor lokal gesicherte Stand `a53d12c9` bleibt in der Branchhistorie.
Der Folgeauftrag erlaubt jetzt Push und Draft-PR auf dem eigenen Branch;
das frühere Push-Verbot ist für diese Veröffentlichung ersetzt. Normale
PR-Pflichtchecks sind davon umfasst, vollständige End500-/Mock500-Läufe nicht.
Basis des neuen Draft-PR ist der unveränderte PR974-Branch
`codex/w15-atomic-usage-integration-20261028`, nicht `main`.

Vor dem ersten Push ist ausschließlich der Kandidatenbranch
`codex/w15-github-end500-preparation-20261028` in der vorhandenen
`vercel.json`-Map `git.deploymentEnabled` auf `false` gesetzt. Vercel-Previews
wären sonst automatisch aktiv; ein Draftstatus allein verhindert sie nicht.
Alle anderen Konfigurationseinträge bleiben erhalten. Kein Merge, keine
Serverkonfiguration und kein Deployment.

22 gezielte Dateischutzprüfungen bestanden: 15 bestehende/erweiterte
Eingangsprüfungen und sieben neue Inventurfälle. Der neue Fall begrenzt
Metadatenspeicher auch während eines wachsenden Reads. Kein Test davon ist
ein synthetischer Ersatz für End500 oder eine neue Quellenqualifikation.
