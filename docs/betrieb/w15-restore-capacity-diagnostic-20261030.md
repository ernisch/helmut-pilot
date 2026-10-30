# Vollrestore: einmalige Kapazitätsdiagnose, getrennt vom Prüfvertrag

Vorbereitung aufgrund des Betreiberauftrags vom30.10.2026. Kein Originalstart
durch diese Entwicklung. Basis ist der erhaltene Kopf0eb150b5 aus PR994.
Vollrestore41118133816 bleibt FAIL: Peak2048098304Bytes, letzte empfangene
Phasebackup-seal; Dateicache1927438336Bytes ausschließlich nach Fehler beobachtet.
Die genaue Zusammensetzung dieses historischen Peaks bleibt UNKNOWN.

## Eigene Bindung und Grenzen

Neuer manueller Modus: `end500-restore-capacity-diagnostic`.
Eigener Freigabescope: `ISOLATED_GITHUB_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY`.
Die vorhandenen Modi, die End500-/Mock500-Verträge und Production bleiben
unverändert. Die neue Vorbereitung erteilt keine Laufberechtigung.

| Bindung des späteren einmaligen GO | Festgelegter Wert |
|---|---:|
| Hartes Kernel-/Containerlimit | 4999999488Bytes |
| Alte Peakgrenze, ausschließlich Messmaßstab | 2048000000Bytes |
| Nicht für den Parent verfügbare Hostreserve | 2147483648Bytes (2GiB) |
| Gemeinsame Laufzeit einschließlich Staging/Empfang/Sicherung/Rücksicherung | höchstens1800Sekunden |
| Freie Plattenreserve | mindestens536870912Bytes (512MiB) |
| Zusätzliche Speicherung | höchstens0,05USD |
| Sicherungsartefakte / Aufbewahrung | höchstens1 verschlüsseltes Artefakt /1Tag |
| Swap / bezahlte Modellaufrufe | 0 /0 |

Die2GiB Hostreserve sind eine ausdrücklich vorgeschlagene technische
Sicherheitsannahme für diesen isolierten Diagnosemodus, kein Anbieterwert und
kein neuer Productionvertrag. Die5MilliardenBytes folgen der vom Betreiber
genannten Diagnoseobergrenze. Linux kann nicht seitengenaue Memory-Werte beim
Readback runden; deshalb wird vorab ausdrücklich der nächstkleinere4KiB-Wert
4999999488Bytes gebunden. Die tatsächliche Seitengröße muss4096Bytes sein;
sonst BLOCKED. Es gibt keine automatische Anpassung des Limits. Referenz:
https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files
Der vorhandene Plattenplan einschließlich aller Kopien bleibt vollständig.

Die vorab gebundene Diagnose-Limitsabbildung lautet
`comparisonBudgetBytes=4999999488`, `maximumConsumptionBytes=4999999488`,
`requiredReserveBytes=0`, `swapBytes=0`. DieNull bezieht sich ausschließlich
auf einen weiteren Puffer **innerhalb** dieses Diagnose-Parents. Die getrennte
2GiB Hostreserve wird zusätzlich geprüft. Das ist keine neue End500-Abnahme.

## Tatsächliche Runnerkapazität statt angenommener Maschine

Der bestehende erforderliche CI-Job führt zusätzlich genau eine rein lesende
Kapazitätsprüfung aus. Er protokolliert ausschließlich MemTotal, MemAvailable,
gegebenenfalls endliches Root-Cgroup-Headroom, Speicherdruck und feste Grenzen.
Eine historische Runnerklasse oder Codex-Messung ersetzt diese Beobachtung nicht.

Vor dem späteren geschützten Lauf wird dieselbe Prüfung **auf dessen tatsächlichem
Runner vor Parentanlage, Staging und Originalempfang** erneut verlangt. Der
bestehende Parent liegt unmittelbar unter der Cgroup-Mountwurzel; deshalb ist
deren Root der einzige Cgroup-Ahne. MemAvailable und gegebenenfalls endliches
Root-Headroom müssen jeweils mindestens7147483136Bytes tragen. Fehlen Pflichtwerte,
ist die Kapazität unzureichend oder ist das Modell der Root-Hierarchie unbekannt,
wird vorher BLOCKED. Kein kleineres automatisches Ersatzlimit, kein Originalabruf.

Während der vorhandenen Guard-Aufrufe muss das kleinere verbleibende Headroom
aus tatsächlichem MemAvailable und endlichem Rootlimit mindestens2GiB bleiben.
Das schützt gegen anderweitiges Hostwachstum. Die Prüfung allokiert diese Reserve
nicht und garantiert keine gegen beliebige externe Hoständerungen reservierte
Maschine. Beide isolierten PostgreSQL-Container und der gemeinsame Parent sind
fest auf4999999488Bytes und Swap0 begrenzt. Der Parent ist die maßgebliche
Gesamtgrenze; Containerlimits werden nicht addiert.

## Vorhandener Ablauf und vollständige Messung

Empfang derselben15Cipherteile, zwölf unveränderte Originalpins, fünf bestehende
Restoreaktionen bis500Profile/0aktiv, vier Exporte, konsistente vollständige
Sicherung, GPG-Integrität, genau ein verschlüsseltes Artefakt, vollständige
authentifizierte entfernte Rücklesung und zweite frische isolierte Rücksicherung
mit vollständigem Tabellen-/Rollen-/Sequenz-/Datenvergleich bleiben erhalten.
Kein Helmut-Appserver, PostgREST-Dienst oder End500-/Mock500-Controllerkörper
wird durch diesen Restoremodus gestartet.

Die2.048GB-Peakprüfung wird ausschließlich im ausdrücklich gebundenen neuen
Modus zum Messmaßstab. CommonResources, äußerer Supervisor, vorhandener Watch,
Plattenwächter, native Export-/Restore-Readbacks und beide Container verwenden
denselben eigenen Diagnosepfad. Die alten Konstanten und Fixtures bleiben
inhaltlich unverändert. Ein alter GO-Scope oder alte Limits können diesen Pfad
nicht zulassen. Prepare, Readback und Remove derselben eigenen systemd-Unit
tragen identisch das feste Diagnoseprofil.

Vorhandene Guard-Aufrufe lesen begrenzt `memory.peak`, `memory.current`,
`memory.stat`, `memory.pressure`, `memory.swap.current`, `memory.swap.max` und
`memory.events`. Kein zusätzlicher Beobachterprozess oder -thread, kein Cache-
Eingriff, keine Peakzurücksetzung, keine Speicheroptimierung. UID-/Commit-/Nonce-/
Parentidentitäts-, Original- und Prozessintegritätskontrollen bleiben erhalten.

Der umgebende Kernel-Sample (`finalCommonParentAfterOwnedExits` bei Abschluss)
erhält den Kernel-Lebenszeitpeak bis zur letzten äußeren Probe nach Ende aller
eigenen Kinder; bei Fehlern nur den tatsächlich bis dahin beobachteten Peak.
Die geschlossene `capacityMeasurement` ergänzt:

- Letzte Kernelkategorien sowie Maxima der **beobachteten** Werte: anon, file,
  kernel, shmem, file_dirty und file_writeback. Fehlendes bleibt UNKNOWN.
- Speicherdruck some/full mit avg10/avg60/avg300 in Hundertstelprozent und
  kumulativer total-Stallzeit in Mikrosekunden; keine erfundene Prozentauflösung.
- Tatsächliches Host-Headroom, Swap, OOM-/Max-Ereignisse und die vorhandenen
  validierten Phasenkennungen. Die begrenzte Folge hält die bei Readbacks jeweils
  zuletzt empfangene Phase fest; schnelle Zwischenphasen können fehlen.

Kernel-Lebenszeitpeak ist kein aus Stichproben berechnetes Maximum. Kategorien-
maxima und Phasen sind dagegen Beobachtungen; sie sind keine zeitgleiche
Zusammensetzung oder Ursache des Peaks. Dirty/Writeback/Shmem sind überlappende
Dateispeicher-Unterkategorien und werden nicht hinzuaddiert; auch Prozess-PSS
wird nicht mit Dateicache addiert. Vorherige gültige Diagnosen bleiben mit ihrer
Beobachtungszeit erhalten, wenn ein späterer Signal-/Fehlerpfad keinen neuen
Zusatzsnapshot liefern kann. Die erste konkrete Fehlerursache bleibt vorrangig.

## Ergebnis und Abbruch

Ein vollständiger Ablauf endet ausschließlich als
`COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY`; der innere Ergebnisstatus ist
`MEASURED_FULL_RESTORE_CAPACITY_ONLY_LEGACY_ACCEPTANCE_BLOCKED`.
`legacyContractAccepted`, `legacyRestoreAccepted`, `fullLifetimeMemoryAccepted`,
End500-/Mock500-Abnahmen und Ausführungsberechtigung bleiben **false**, auch wenn
der gemessene Peak zufällig unter der alten Grenze bleibt. Der vorhandene
End500-Annahmeprüfer weist einen Diagnosebeleg zurück. Ein Messabschluss ist
keine erfolgreiche Abnahme des bisherigen Vollrestorevertrags.

Hartlimit-/Hostreserveverletzung, Swap/OOM/Max-Ereignisse, ungültiger Readback,
Zeit-/Platten-/Kostenüberschreitung oder jede Integritätsstörung stoppen. Bei
FAIL/UNKNOWN kein Retry, Linkrefresh, automatisches Löschen oder Branchreset.
Nur eigene Prozesse stoppen und deren tatsächlichen Stillstand mit den bisherigen
acht Aufräumfakten nachweisen. Quellen, Drive und vorhandene Secrets erhalten.

## Vorbereitung und Freigabegrenze

Gezielte Gegenproben verwenden kleine erfundene Kerneldateien, vorhandene
synthetische Restore-/Quittungsfixtures und private Pipeframes. Kein echter
PostgreSQL-/GPG-/Original-/500er-Lauf. Sie prüfen den Überschreitungsfall3.1GB,
Hartlimit-/Hostreserve-/Swap-/OOM-Stopps, Signal-/Workerberichtverlust, geschlossene
Metadaten, die getrennte Admission sowie die alte End500-Abnahmesperre.
Betroffene alte Defaultprüfungen bleiben nötig; bereits erfolgreiche Original-
und native Minimalbelege werden übernommen. Der alte AST-Watch-Testadapter
erhält nur drei bislang fehlende Konstruktor-Standardattribute; seine numerischen
Grenzen und Assertions ändern sich nicht.

Nach grüner Pflicht-CI auf dem tatsächlichen Kopf, tatsächlichem CI-Hostbeleg und
unabhängigem Review folgt ein separates einmaliges GO mit exaktem Commit,
Environmenthelmut-ci-originals, festem4999999488Byte-Diagnoselimit und2GiB Hostreserve.
Erst dieses GO erlaubt den sicheren Fast Forward des zugelassenen
Ausführungsbranches und genau einen Diagnoselauf. Alle Code-/CI-/Review-/
Branchprüfungen vor frischen Links; unmittelbar vor dem einzigen POST weiter
tatsächliche Restgültigkeit>90Sekunden und Gesamtparameter≤65535Zeichen.
Keine geschützte Ausführung, Production-Vertragsänderung, Merge oder Deployment
durch diese Vorbereitung.
