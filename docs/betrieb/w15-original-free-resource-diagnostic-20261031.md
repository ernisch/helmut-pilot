# Einmalige originalfreie Ressourcen-Diagnose mit 500 Profilen

Betreiberauftrag vom 31.10.2026: genau ein begrenzter isolierter Diagnoseversuch
mit 500 gleichzeitig aktiven vollständig synthetischen Profilen, tatsächlichem
Helmut-Verarbeitungscode und ausschließlich lokal simulierter KI. Keine
geschützten Originaldateien, keine Production-Wirkung oder kostenpflichtige KI.
Dies ist keine End500-/Mock500-/Anbieterabnahme und ersetzt keinen RAM-Vertrag.
Der Kindprozess der lokalen KI-Simulation erhält einen festen Aufrufdeckel von
96 für die 96 öffentlichen Diagnosevorgänge; der bestehende Simulator begrenzt
zusätzlich auf 128. Der unkonfigurierte App-Fallback von 50 würde die geplante
Messung vorzeitig stoppen. Diese ausschließlich lokale Testkonfiguration
verändert keine Production-, Kosten- oder geschützten Ausführungsbudgets.

## Einziger neuer Anschluss

Ein expliziter öffentlicher Diagnoseadapter verbindet die vorhandene lokale
Z3-Plattform mit echter Provisionierung/Aktivierung, tatsächlichem Understanding,
nativer Datenablage und dem aktuellen Briefing-Fachpfad. Der bisherige Z3-Lauf
allein reicht nicht: Planungsprofile sind keine gespeicherten aktiven Profile,
die alte Materialisierungsattrappe ist keine tatsächliche Fachverarbeitung.

Wiederverwendet werden die vorhandenen PostgreSQL-/Node-/PostgREST-Images,
Schemaaufbereitung, lokale TLS-/KI-Fixture, Parent-/Hostwächter und passive
Komponentenmessung aus PR #1004. Der KI-Fixture kann optional eine geprüfte rein
synthetische Antwortfunktion übergeben werden; ihr Standard bleibt unverändert.
Import der öffentlichen Schemaaufbereitung startet keinen historischen Z3-Lauf.
Nur die beiden neuen Diagnosejobs ergänzen im vorhandenen kurzlebigen PG17.6-
Testcontainer die echte pgvector-Abhängigkeit aus dem vollständig hashgebundenen
PGDG-Paket 0.8.7. Sie verwenden das unveränderte native Repository-Schema und
die tatsächliche Matching-RPC. Die alte Z3-Anpassung mit JSONB und leerer
Matching-RPC darf hier keinen Kapazitätsnachweis liefern; ihr Standard bleibt
für bestehende Aufrufer unverändert. PostgreSQL und Betriebssystemabhängigkeiten
werden nicht aktualisiert. Die Anbieter-Version der Erweiterung ist UNKNOWN.

## Bindungen und begrenzter Ablauf

Der eigene manuelle Modus `resource500-synthetic-diagnostic` im bestehenden
`ci.yml` verwendet keine geschützte GitHub-Umgebung und keine Empfängersecrets.
Er ist an den geprüften Commit, den echten PR1004-Ref, Run-ID, Attempt 1 und
eine neue Nonce gebunden. Kein alter Original-/End500-/Mock500-Startparameter
wird akzeptiert, kein GITHUB-Kontext lokal nachgestellt.

Vor 500 Profilen muss eine kleine positive native Fachprobe bestehen. Erst dann
darf derselbe begrenzte Aufruf genau einmal die 500er Phase beanspruchen.
Keine Wiederholung bei FAIL/UNKNOWN, keine 500er-Schleife oder Ersatzlast.
Alle 500 Profile müssen nativ als gleichzeitig aktiv rückgelesen werden und
gleich behandelt echte Fachverarbeitung durchlaufen. Fehlende/abgelehnte oder
leere Fachresultate ergeben keinen positiven Kapazitätsnachweis.
Die synthetischen Text-/Quellen-/KO-Mengen und tatsächlich verarbeiteten
Ergebnisse sind im Laufbericht auszuweisen. Kein Anspruch auf Gleichwertigkeit
mit der privaten W15-Originalqualifikation oder auf 1.500 formale Mock-Ergebnisse.
Nach Ende müssen eigene Prozesse und 0 aktive Diagnoseprofile bestätigt werden.

| Gruppe | Diagnoseannahme / Schutz |
|---|---|
| Anwendung einschließlich untrennbarem Testtreiber | 1.999.998.976 B hart; modellierte 1-vCPU-Quota |
| PostgreSQL und ausdrücklich zugeordnete DB-Dienste | 948.191.232 B hart; höchstens 60 DB-Clientverbindungen einschließlich Beobachter; lokale CPU-Annahme ohne Micro-Paritätsbehauptung |
| Testwerkzeuge / lokale KI-Simulation / Kontrollprozesse | Eigene Gruppe, außerhalb der engen App-/DB-Grenzen, innerhalb des gemeinsamen Parents |
| Gemeinsamer Parent | 4.999.999.488 B hart, Swap/OOM/Maxereignisse 0; keine Peakresets oder Cachemanipulation |
| Tatsächliche Hostreserve | Mindestens 2.147.483.648 B vor Beginn und während der Messung |
| Zeit und Platte | Höchstens 1.800 s gemeinsamer Diagnoseablauf, mindestens 512 MiB freie Platte |

Alle Budgets sind vor Arbeitsbeginn tatsächlich rückzulesen. Ein Docker-exec
im DB-Unterbaum allein trennt die App nicht. Die vorhandene Namespace-PID-Bindung
und eine geschlossene Startbarriere müssen die Zielgruppe **vor** Node-Import
und relevanter Allokation bestätigen. Der äußere Bootstrap und bereits vorher
vorhandene Host-/Dateicacheanteile bleiben als außerhalb des Messscope erkennbar;
Hostreserve ist kein erfundener Komponentenverbrauch.

Die geschlossene aggregierte SAFE-Quittung wird über einen neutralen GitHub-CI-
Check lesbar gemacht. Nur die beiden neuen öffentlichen Diagnosejobs erhalten
dafür `checks: write`; es gibt keine Repository-Schreibrechte, neuen Secrets,
Artefakte oder externe Monitoringdienste. Der vorhandene kurzlebige Actions-Token
bleibt im Umgebungs-/Headerkanal und erscheint nicht in Befehlsargumenten oder
Messquittungen. Dieser Check ist ausdrücklich kein End500-/Mock500-Starttor.

## Bericht und Auswertung

Je Gruppe: tatsächlicher lebenslanger Kernel-Peak, beobachtete Speicherverläufe,
CPU-Zeit/Quote/Drosselung, vorhandene Druckwerte und Cache/anon/kernel-Kategorien.
Kernel-Peak ist exakt; der Zeitpunkt seines Entstehens ist ohne Kernelbeleg
UNKNOWN. Die erste beobachtete Peakänderung darf mit Beobachtungszeit und Phase
ausgewiesen werden. Kategorien beim Abtasten sind nicht automatisch die
Zusammensetzung des lebenslangen Peaks. Verschiedene Maxima und PSS/Dateicache
nicht addieren; Kernelbelastung ist keine bewiesene Verursacherzuordnung.

DB-Verbindungen: tatsächliches `max_connections` plus höchster beobachteter
Clientstand einschließlich eigener Messsession. Ein Abtastmaximum ist kein
vollständiger Verbindungspeak. Reine App-/Harnessanteile, getrennte DB-Dienstanteile,
Anbieter-Hartlimits, Plattformreserven oder Anbieterparität bleiben UNKNOWN,
soweit nicht tatsächlich gemessen. Positiver kombinierter Gruppen-Fit ist nur
ein Diagnosebefund dieses synthetischen Workloads; negativer Gruppen-Fit beweist
keine isolierte Überschreitung der Helmut-Anwendung allein.

Die erste konkrete Fehlerphase, letzte sichere Ressourcenwerte und tatsächlicher
Stoppstatus bleiben auch bei Workerabbruch erhalten. UNKNOWN bleibt UNKNOWN.
Keine neuen Originale beschaffen, keine Originaldateien löschen, keine
automatische Fortsetzung mit End500, Mock500 oder Production.
