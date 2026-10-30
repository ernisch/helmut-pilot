# W15 Nachtauftrag: vorhandene Restorequittung und getrennte Startgrenzen

Stand 30.10.2026 UTC, Branch `codex/w15-night-restore-20261030`, Ausgang
`deb812f9e7e3a2d58e5b4e593a1eec00ef1e22d8`. **Teilweise abgeschlossen:** die
vorhandene native Minimalquittung ist jetzt erreichbar und im begrenzten
synthetischen Umfang positiv geprüft. Der alte innere Originalfehler bleibt
UNKNOWN; ein weiterer Originallauf ist daraus nicht begründet.

Der aktuelle Nachtauftrag hat Vorrang vor alten Freigabevorlagen: sämtliche
früheren Restore-GOs sind verbraucht. Keine Originalübertragung, kein
Originalrestore, End500, Mock500, Modelltest oder Aufbau neuer Ressourcen wurde
ausgeführt. Kein Merge, Deployment, Production-, Migrations-, Secret- oder
Budgeteingriff; kein Workflowneustart. Produktcode blieb unverändert.

## Vorhandene Quittung tatsächlich gelesen

Quelle ist ausschließlich der abgeschlossene
[CI-Run 40982718647](https://github.com/ernisch/helmut-pilot/actions/runs/40982718647),
Job `123826368135`, Schritt 5. Die bisher erfolgreichen Pflichtchecks und der
Vorstartreview aus [PR980](https://github.com/ernisch/helmut-pilot/pull/980)
werden übernommen; keine bereits erfolgreiche Probe wurde wiederholt.

Die andere vorhandene Lesemöglichkeit funktioniert: GitHub-Run-Logarchiv statt
Joblog. Ein GET mit `curl` auf den Run-Archivendpunkt lieferte HTTP302 zum
Actions-Ergebnisdienst; dessen temporäre URL wurde getrennt **ohne** den
API-Authorization-Header gelesen. Geerbter Proxy und TLS-Prüfung blieben aktiv.
Das ZIP wurde nur im Prozessspeicher ausgewertet. Genau eine passende JSON-Zeile
aus `Syntax + Offline-Suiten/5_W15 echter synthetischer Minimalanschluss — einmalige Diagnose.txt`
wurde gegen die geschlossenen Felder und Wertetypen des vorhandenen Producers
validiert und als
[unveränderte SAFE-Quittung](belege/w15-night-restore-20261030/NATIVE_CONNECTION_40982718647.SAFE.json)
gesichert. Keine Rohlogs, Archivdatei, temporäre Downloadfähigkeit,
Zugangsdaten oder Fingerabdrücke von Zugangsdaten wurden ausgegeben oder ins
Repository übernommen. Der Run hat keine separaten Actions-Artefakte.

Die neue konkrete Transportprüfung bestätigt aktuell auflösbaren und
erreichbaren Proxy sowie erfolgreichen API-/Archivtransport. Die Ursache der
**früheren** Connector-/CLI-/urllib-Transportfehler bleibt UNKNOWN; aktueller
Erfolg beweist keine rückwirkende TLS-, Token- oder Proxyfehlerursache.
Diese fehlgeschlagenen Joblogmethoden wurden nicht erneut durchprobiert.

Die Quittung trägt tatsächlich den CI-Mergecommit
`59c13b3d65cc0abd3cda5a1d1fe9445d49638f7f`, nicht den PR-Kopf. Der rein lesende
GitHub-Vergleich **deb812f9 → 59c13b3d** bestätigt einen zusätzlichen Commit und
keine Dateiänderungen. Damit ist der ausgeführte Dateistand an deb812f9 gebunden;
die tatsächliche Commitkennung in der Originalquittung bleibt erhalten.

## Positive Detailprüfung, ausdrücklich nur für den Minimalanschluss

Die tatsächliche Quittung hat Schema
`helmut-w15-real-synthetic-connection/1` und Status
`PASS_REAL_SYNTHETIC_CONNECTION_ONLY`, RunAttempt 1, fünf Restoreschritte,
vier Exportaktionen, verifizierte lokale Versiegelung und zweite isolierte
Rücksicherung. Sie enthält 126079713 Cipherbytes. Das ist kein Übertragungsbeleg.

| Tatsächlich gemessener Minimalumfang | Befund |
| --- | --- |
| Gemeinsames hartes RAM-Limit | 2560000000 Bytes |
| Gemeinsamer Kernel-Lebenszeitpeak | 960356352 Bytes |
| Reserve gegenüber dem harten Limit | 1599643648 Bytes; Mindestreserve 512000000 erfüllt |
| Zulässiger Peak | 2048000000 Bytes; eingehalten |
| Swapmaximum / Swapbelegung | 0 / 0 Bytes |
| Limit-/OOM-Zähler | jeweils 0; auch die weiteren ausgegebenen Kernelzähler 0 |
| Worker / Worker-IPC | beide PASS |
| Watch / eigener Service / eigene Container | jeweils PASS; zwei eigene Container geprüft |
| Äußerer Parentleerstand / Entfernung | beide PASS |
| Modellaufrufe / Profilaktivierungen / neue Speicherung | 0 / 0 / 0 USD |

Der äußere Abschluss prüft den inodegebundenen leeren Parent nach dem
Service-/Containerstillstand und entfernt ihn anschließend. Seine positiven
Felder ersetzen **nicht** die sechs internen, hier unbenutzten IPC-Felder:
`launcherListenerClosed`, `launcherSignalsRestored`, `parentEmpty`,
`parentStopRequested`, `parentUnitRemoved`, `serviceLauncherExited` bleiben im
Objekt `ipcCleanup` ausdrücklich UNKNOWN. Die äußeren Werte sind gesonderte
tatsächliche Beobachtungen. Die Speicherbelegung des leeren Parents bleibt
871481344 Bytes; Leerstand wird nicht mit null Cachebytes gleichgesetzt.

Alle weitergehenden Annahmen bleiben in der Quittung false: Originaldatenzugriff,
Originalzulassung, vollständige Originalsammlung, authentifizierte
Fernrücklesung, bewiesene historische Ursache, End500-/Mock500-Abnahme und
Ausführungsautorität. Die fünf synthetischen Sicherungsdateien ersetzen weder
die zwölf Originalpins noch `collect_restore_backup`. Die zweite Datenbank
verwendete die lokal hashgeprüften synthetischen Dateien, keine aus dem Cipher
authentifiziert fernrückgelesene Auswahl.

[Geschlossener Transport- und Detailprüfbeleg](belege/w15-night-restore-20261030/NATIVE_RECEIPT_REVIEW.SAFE.json).

## Historische Ursache: belastbare Eingrenzung und verbleibende Lücken

Der erhaltene
[Ursachenbeleg](belege/w15-restore-cause-20261030/RESTORE_SEAM.SAFE.json)
für Run40958135662 auf225e76d7 bleibt FAIL/worker. Seine 76 Sekunden Jobdauer
belegen keinen Ablauf der 1800-Sekunden-Parentfrist oder der erst später
gestarteten 600-Sekunden-Restore-/Exportfrist. Innere Phase, RAM, Cleanup und
Originalfortschritt dieses Runs bleiben UNKNOWN. Neue Messwerte des
synthetischen Runs werden ihm nicht zugeordnet.

Der native PASS schließt jetzt die frühere Beleglücke zwischen den fünf echten
Restoreaktionen, vollständigem Tabellen-/Sequenzexport, öffentlicher
Verschlüsselung und zweitem synthetischem PostgreSQL-Restore unter derselben
gemessenen Elternbegrenzung. Ein allgemeiner Defekt dieser Verbindung ist am
aktuellen unveränderten Produktcode mit dieser Fixture nicht nachgewiesen.
Die bereits behobene UID1000-Importstörung betraf ausschließlich den ersten
neuen Fixtureaufbau; sie erklärt nicht den historischen Originallauf.

| Im aktuellen Minimaltest nicht ausgeführter Anteil | Bestehender Anschluss; verbleibender Beleg |
| --- | --- |
| Neuer authentifizierter Originalempfang, zwölf Pins, Cache und volle Materialisierung | `restore_workflow.run_worker` → `restore_connection.prepare_same_job`; historischer Empfang übernommen, kein heutiger Original-/Same-Job-PASS |
| Reale Originaldaten und Originalgrößen beim Restore/Inventar | gleiche `runtime_restore.restore_owned`-/`export_restore_database`-Aktionen; daten-/größenabhängige Fehler oder kurze native Fristen dadurch nicht ausgeschlossen |
| Vollständiger eingefrorener Arbeits-/Vorbereitungsbaum, zwölf Eingänge und Provenienz | `restore_completion_hook` → `collect_restore_backup`; nur synthetische Komponentenprüfungen, keine native Originalvollständigkeitsabnahme |
| Entfernter verschlüsselter Rücktransport und authentifizierte Entschlüsselung aller Mitglieder | `completion_hook` → `artifact_transport.roundtrip` → `authenticated_readback`; im Minimaltest absichtlich nicht ausgeführt |
| Zweiter Restore aus der tatsächlich fernrückgelesenen vollständigen Auswahl | `restore_readback`; native synthetische Funktionsprobe vorhanden, Original-/Remote-Verknüpfung offen |

Es gibt keinen neuen konkreten Produktfehler und deshalb keinen Produktfix auf
Verdacht. Ohne zusätzliche erreichbare Primärdiagnose darf aus diesen Lücken
keine bestimmte Fehlerursache ausgewählt werden. Die erfolgreiche native
Minimalprobe wird nicht wiederholt. Der blockierte Environment-Public-Key-
Endpunkt wurde nicht aufgerufen; keine Originale oder privaten Zwischenstände
wurden zur Ursachensuche gelesen.

## Code bis zur getrennten Freigabe vorbereitet

Die vorhandenen ausführbaren Anschlüsse sind unverändert vorhanden. Der feste
UID1000-Worker prüft statischen SourceQualification-Review, tatsächlichen
Laufkontext und frisches GO **vor** Empfang; der gemeinsame Parent umfasst
Empfang, Staging, Restore, Sicherung, Rückdownload und zweite Datenbank.
Ein Default-, Plan-, fehlendes oder abgelaufenes GO startet diesen Weg nicht.

Restore-only verbindet die fünf nativen Aktionen mit konsistentem Dump/Rollen-
und vollständigem Tabellen-/Sequenzinventar, tatsächlichem Container-/Watch-
Abschluss, vollständiger gefrorener Auswahl, vorhandenem GPG-Sealer, offiziellem
Artifactkanal, authentifizierter Manifest-/Mitgliederprüfung und zweitem frischem
netzlösen Restore. Erst die geschlossenen positiven Rücklese-/Recoveryquittungen
lassen den Worker erfolgreich abschließen. Die unabhängige Gesamt-Abnahme
bleibt zusätzlich erforderlich; ein Workflow-SUCCESS allein öffnet End500 nicht.

Der getrennte Modus `end500-full-gated` ruft den vorhandenen vollständigen
End500-Controller direkt mit demselben Sicherungsrückweg auf. Die vorhandenen
Ziele bleiben 500 Auth-CAS, 6000 Usage, 3501 native Postimages, vollständige
Bilanz sowie am Ende 0 aktive Profile / 0 Units / 0 Provider. Es wurde kein
Controller und kein solcher Test ausgeführt. Keine gemeinsame Workflow-,
Controller- oder Ressourcenänderung war für diese rein lesende Vorbereitung
notwendig.

### Restore-Grenze: derzeit kein startbereites GO

Eine neue Originalausführung ist erst konkret zur Entscheidung vorzulegen,
wenn eine **neue belegte Diagnosefrage** den notwendigen Original-/Größen- oder
Rückweganteil und die erwartete unterscheidende Beobachtung begrenzt. Der
historische innere Fehler ist weiterhin unbekannt; das Mini-PASS allein
rechtfertigt keinen erneuten vollständigen Lauf.

Zusätzlich nötig sind ein von Root integrierter ausdrücklich benannter
Codecommit, frischer unabhängiger Quellenreview, grüne Pflicht-CI dieses
Standes, tatsächliche Runner-/Image-/Binärbindungen und ausreichende aktuelle
Platte. Alte ephemere Klartexte und alte Downloadfähigkeiten werden nicht
vorausgesetzt. Der vorhandene Zugang einschließlich Empfänger und tatsächlich
lesbarer, ausreichend lange gültiger Cipherlinks muss für den konkreten
späteren Job belegt sein, ohne Secretänderung oder Originaltransfer in dieser
Vorbereitung.

Nur ein **separates konkretes neues** Restore-GO dürfte genau einen
`end500-restore-gated`-Versuch einschließlich des dafür notwendigen einmaligen
Empfangs der bestehenden Cipherteile erlauben: 12 / 242570240 Eingangsbytes,
5 Restoreschritte, exakt 500 Profile / 0 aktiv, vollständige gefrorene
Sicherung, verschlüsselter Offhost-Rückweg, authentifizierte Fernrücklesung und
zweite frische Rücksicherung samt vollständigem Inventar-/Rollenvergleich.
Keine End500-Fortsetzung. GO an Commit, Branch, Nonce, Versuch1, SourceQualification
und höchstens zweistündige Gültigkeit binden; maximal 1800 Sekunden Parent,
unverändert 2560000000 / 2048000000 / 512000000 RAM-Bytes, Swap0, höchstens
0,05 USD zusätzliche Speicherung und 0 Modellaufrufe. Alle alten GOs bleiben
verbraucht. Kostenobergrenze ist eine bestehende Codegrenze, keine neue
Budgetfreigabe dieses Nachtauftrags.

Der konservative vollständige Plattenplan reserviert 12465332072 Bytes
zuzüglich tatsächlichem Checkout und gepinnten Binärbytes; der vorhandene
Binärvertrag umfasst 143299024 Bytes. Keine Prognose aus der kleinen Fixture
ableiten. Keine Löschung, Ressourcenaufstockung oder automatische Wiederholung
zum Erreichen einer Grenze. FAIL/UNKNOWN erhält den Erstfehler und stoppt;
nur eindeutig eigene Prozesse stoppen, Stillstand und Parentleerstand prüfen.
Originale, Cipherquellen und bestehende private Teilprodukte bleiben erhalten.

### End500-Grenze: erst nach unabhängiger positiver Original-Restoreabnahme

Ein End500-GO ist davon getrennt und erst nach vollständigem positivem
Original-Restore-/Sicherungs-/Remote-/Rücksicherungs- und Lebenszeitreview auf
**demselben** Codecommit sinnvoll. Der Code verlangt eine andere vorherige
Run-ID, Status `PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE` und den SHA256 der
tatsächlichen unabhängigen Restorequittung. Die neue native Minimalquittung
erfüllt diesen Vertrag ausdrücklich nicht.

Danach muss ein eigenes neues End500-GO genau einen frischen
`end500-full-gated`-Job einschließlich des wegen ephemerer Runnerablage erneut
notwendigen Originalempfangs benennen. Maximal 3600 Sekunden Parent; unveränderte
RAM-/Swapgrenzen, maximal 0,05 USD neue Speicherung, 0 Provider-/Modellaufrufe,
vollständiger End500-Controller und derselbe vollständige Sicherungsrückweg.
Ein bestandener Restore startet ihn niemals automatisch. Mock500 und
Production werden davon nicht freigegeben.

## Änderung, Verifikation und Übergabe

Nur dieser Bericht und die zwei geschlossenen Belegdateien sind neu. Kein
Runtimefix, keine neuen Tests und kein Testneustart; die bestehenden positiven
Tests werden übernommen. Neu waren ausschließlich read-only Transport-/
Metadatenabrufe und geschlossene Validierung der schon vorhandenen SAFE-Zeile.
Prüfskripte liefen über `node scripts/lokal.js -- python3 -I -B ...`.

Keine eigenen Pushes/PRs; lokaler Commit für Root-Integration. Root pflegt den
gemeinsamen CURRENT_STATE und die unabhängige Schlussprüfung. Nächster Schritt:
Root integriert den belegten Mini-Abschluss und benennt die weiter fehlende
historische Primärdiagnose; kein Restore-/End500-GO auf Verdacht anfragen.
Empfohlene Denkstufe für diese Integration: **Hoch**, weil Primärquittung,
Grenzen und unveränderter Code jetzt konkret vorliegen.
