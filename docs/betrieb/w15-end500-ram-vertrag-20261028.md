# W15-End500: präzisierter RAM-Vertrag

Neue Betreiberentscheidung im bestehenden Sprint. Gilt ausschließlich für den
isolierten GitHub-End500-Test. Kein Teststart, keine Production- oder Tarifänderung.

## Aktueller Prüfvertrag

| Größe | Verbindlicher Wert |
| --- | ---: |
| Harte gemeinsame cgroup-Zuteilung | 2.560.000.000 Bytes |
| Zulässiger tatsächlicher gemeinsamer Lebenszeitpeak | höchstens 2.048.000.000 Bytes |
| Erforderliche physische Reserve | mindestens 512.000.000 Bytes = 20 % der Zuteilung |
| Swapmaximum und tatsächliche Swapnutzung | jeweils 0 |

Die Zahlen sind exakte dezimale Bytes. 1.800.000.000 und 1.900.000.000 Bytes
erfüllen das RAM-Kriterium. Genau 2.048.000.000 Bytes sind zulässig;
2.048.000.001 Bytes verletzen es. Die Reserve wird von 2.560.000.000 Bytes
berechnet, nicht erneut von der Verbrauchsgrenze abgezogen.

Node, PostgreSQL, PostgREST, SQL-Kinder und der von derselben cgroup belastete
Dateicache zählen gemeinsam. Der unveränderte Kernel-Lebenszeitpeak umfasst
Containeranlage/Restore, Seed, Verarbeitung und Abschluss. Kein Peakreset,
Neustart, Messwertabzug oder Cache-/GC-Eingriff. Docker erhält identische
`--memory`- und `--memory-swap`-Werte von 2.560.000.000 Bytes; die cgroup muss
`memory.max=2560000000`, `memory.swap.max=0` und `memory.swap.current=0` melden.
Der tatsächliche `memory.peak`, die weiteren Messfelder und Memory-Events werden
weiter vollständig gelesen. OOM, Limitereignisse, Swap oder fehlende/ungültige
Messungen bleiben Fehler. Stop-Latch, Erstfehler, dauerhafte ACKs, sicherer
Abschluss und vollständiger nativer Integritätsnachweis bleiben Pflicht.

Die bisherige Hochrechnung weiterer Auth-Schreibvorgänge einschließlich des
zusätzlichen 64-MiB-Planaufschlags wird weiterhin getrennt ausgewiesen. Sie ist
eine Prognose für den späteren Mock500 und **kein tatsächlicher End500-Verbrauch**.
Ein negativer Prognosebefund kann keinen End500-RAM-Abbruch unterhalb der neuen
Grenze begründen und erteilt auch keine Mock500-Freigabe. Kein Prognosewert wird
von der gemessenen Speicherlast abgezogen.

## Umsetzung und historische Grenzen

Der neue aktive End500-Vertrag liegt in
`scripts/fixtures/w15-end500-memory-contract.json` mit Version3. Der End500-
Controller bindet nur sein privat importiertes Supervisor-Modul daran; Docker,
Readbacks, Reserve und Berichte verwenden denselben Vertrag.
`scripts/w15-github/end500-contract.json` nennt Zuteilung und Verbrauchsgrenze
ausdrücklich getrennt.

Die Version2 und ihre historischen Transport-/Komponenten-/Mock500-Pfade bleiben
unverändert. Für Mock500 wird durch diese End500-Entscheidung keine neue
Ausführungsfreigabe abgeleitet. Alle historischen Messberichte, Peaks und
PASS/FAIL/UNKNOWN-Ergebnisse bleiben unverändert. Alte Prüfberichte werden nicht
rückwirkend als Version3-PASS umetikettiert. Der geänderte Controller benötigt
vor Ausführung erneut gültige Sourcepins und einen frischen unabhängigen
Startreview; vorhandene Driftprüfungen werden nicht umgangen.

Auth30, Unit60, Provider20, Datenintegrität und die übrigen Sicherheitsgrenzen
bleiben erhalten. End500 bleibt der inerte Endbestand mit 500 Auth-CAS und
0 aktiven Profilen, 0 Units sowie 0 Provideraufrufen; der vollständige Mock500
ist weiterhin eine getrennte Stufe. Die erreichbaren Quelldaten fehlen hier
weiterhin; [Exportauftrag](w15-end500-quellbestand-export-20261028.md).

## Vercel: aktive Production-Einstellung rein lesend bestätigt

Die Projekt- und Deploymentabfragen vom 28.10.2026, etwa 21:37 UTC, ergeben:

| Beleg | Ergebnis |
| --- | --- |
| Projekt `defaultResourceConfig.functionDefaultMemoryType` | `standard` |
| Projekt `defaultResourceConfig.fluid` / Region | `true` / `fra1` |
| Aktiver Alias `helmut-pilot.vercel.app` | READY, `dpl_2eGCkYt4Uu8Ek8w4E1UfzcohwcRA` |
| Aktiver Production-Commit | `775e928a0f7c7962712e35ffaeecb17cb6225a1e` |
| Deployment `config.functionMemoryType` | `standard` |
| Tatsächlicher Lambda-Ausgang `api/index` | `nodejs24.x`, `memorySize=2048` MB |

Damit nutzt die aktive Funktion **Standard mit 2.048 MB**, laut
[Vercel-Produktdefinition](https://vercel.com/docs/functions/configuring-functions/memory)
2 GB/1 vCPU. Performance mit 4 GB/2 vCPU ist nicht aktiviert. Pro wurde vom
Betreiber bestätigt. Die separat gemeldeten 8.192 MB von `buildMachine.memory`
sind Buildmaschinen-RAM und keine Funktionszuteilung. Ein abgebrochenes späteres
Projektziel ersetzt nicht die über den aktiven Alias bestätigte Production.
Keine Einstellung geändert und kein neues Deployment ausgelöst.

## Drei getrennte Messräume

1. **GitHub-End500:** gemeinsame lokale cgroup mit Node und Testdatenbankdiensten;
   maximal 2.048.000.000 Bytes tatsächlicher gemeinsamer Peak bei 2.560.000.000
   Bytes Zuteilung.
2. **Vercel-Funktion:** zugewiesener Speicher einer einzelnen Funktionsinstanz;
   aktuell `api/index` mit 2.048 MB. Die Zuteilung ist kein gemessener Verbrauch.
3. **Supabase-Datenbank:** separat betriebene Datenbank mit eigenem Speicher und
   eigenen Datenbankprozessen. Deren RAM gehört nicht zum RAM einer Vercel-
   Funktionsinstanz. Von Vercel geladene Antwortdaten zählen dort selbstverständlich
   zum Funktionsspeicher; der entfernte Datenbankprozess nicht.

Der GitHub-Gesamtpeak beweist deshalb keinen Bedarf für mehr als 2 GB pro
Vercel-Funktion. Ein solcher tatsächlicher Funktionsbedarfsnachweis liegt in
dieser Prüfung nicht vor; es wurde kein neuer Production-Lasttest ausgeführt.

## Performance nur bei nachgewiesenem Bedarf

Aktuell keine Umstellung empfohlen. Erst ein konkreter Funktions-Messbeleg oder
zuordenbarer Speicherfehler unter der bestätigten Standard-Zuteilung könnte
eine begründete Empfehlung auslösen. Dafür wären Deployment, Route, Last,
Funktionsinstanz, Peak/OOM und Zeitraum zu binden; ein gemeinsamer GitHub-Peak
reicht nicht.

Die frisch gelesene [offizielle Preisübersicht](https://vercel.com/docs/functions/usage-and-pricing)
nennt für Frankfurt `fra1` bei Fluid Compute 0,184 USD/aktive CPU-Stunde,
0,0152 USD/GB-Stunde und 0,60 USD je Million Aufrufe. Bedingte Formel vor Credits
und weiteren Diensten:

`Kosten = 0,184 × aktive CPU-h + 0,0152 × belegte GB-h + 0,60 × Aufrufe / 1.000.000`

Bei derselben belegten Instanzdauer H und den Standard-/Performance-Zuteilungen
von 2 beziehungsweise 4 abrechenbaren GB beträgt die zusätzliche reine
Speicherkomponente `0,0304 × H` USD. Aktive CPU-Zeit, Dauer und Parallelbelegung
können sich ändern. Das ist keine Mehrkostenrechnung für Helmut und keine
Monatsprognose. Änderungen der Funktionsgröße wirken auf neue Deployments und
benötigen ebenso wie eine kostenpflichtige Umstellung ein separates GO.

Keine weiteren RAM-Optimierungen ohne nachgewiesenen Engpass. Funktionalität,
vollständiger 500er-Nachweis und die bestehenden Daten-/Abschlussprüfungen haben
Vorrang. Gezielt geprüfte neue Grenzen und die sicheren API-Readbacks stehen im
[SAFE-Beleg](belege/w15-end500-ram-contract-20261028.SAFE.json);
kein neuer Gesamtlauf wurde durchgeführt. Die Änderungen werden lokal gesichert.
PR975 bleibt auf dem veröffentlichten Kopf66efb89a, damit die laufende große
Pflicht-CI nicht erneut startet; dieser Auftrag führt nur gezielte Prüfungen aus.

# Ergänzende Messbindung vom29.10.2026

Die bisherigen Messwerte und Testergebnisse bleiben unverändert. Neu festgestellt:
Der alte Controller las nur die cgroup des PostgreSQL-Containers. Python-
Orchestrator und nativer Auditor liefen hostseitig; spätere Backupkopien und
Verschlüsselung lagen ebenfalls außerhalb dieses Containerpeaks. Dafür gibt es
keine belegte Ausnahme vom vollständigen gemeinsamen Testbudget. Ein solcher
Containerwert ist deshalb kein vollständiger Gesamt-RAM-Nachweis.

Der explizite GitHub-Laufweg verlangt jetzt einen tatsächlich beobachteten
gemeinsamen Parent mit2.560.000.000Bytes und Swap0, der Python und die
Containerprozesse einschließlich Dateicache, Datenbankexport und Backupabschluss
umfasst. Lebenszeitpeak höchstens2.048.000.000Bytes, Reserve mindestens512.000.000
Bytes; keine Peakrücksetzung oder Abzüge. Der Datenbankcontainer behält zusätzlich
sein eigenes Limit2.560.000.000Bytes innerhalb dieses gemeinsamen Parents.

`common_resources.py` prüft Parent-Inode, echte PID-Zuordnung und Kernelwerte.
Originale und Seed bleiben0600; der UID1000-Anschluss muss tatsächlich hergestellt
und beobachtet werden. Kopier-, Hash- und Verschlüsselungsschritte prüfen den
gleichen Parent weiter, nachdem die ursprünglichen Fortschrittsdateien für das
Backup eingefroren wurden. Der frühe Controllerbefund ist ausdrücklich vorläufig;
er erteilt keine vollständige Lebenszeit- oder Restore-Abnahme.

Die tatsächliche Einrichtung auf einem frischen GitHub-Standardrunner sowie die
vollständige unabhängige Abschlussabnahme bleiben offen. Kleine Prüfungen mit
erfundenen cgroup-Dateien sind kein echter Runnernachweis. Diese Korrektur ist
eine Messbindung, keine Speicheroptimierung und keine Änderung der RAM-Grenzen.
