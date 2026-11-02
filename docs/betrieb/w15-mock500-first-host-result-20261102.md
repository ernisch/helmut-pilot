# Mock500: erster dynamischer Host-Funktionslauf, 02.11.2026

[GitHub Run41365567913](https://github.com/ernisch/helmut-pilot/actions/runs/41365567913),
Job125024885163, Commit`32655e8f61b6bc3c75619cdb328cf0219e5f317b`, PR1015,
Environment`helmut-ci-originals`, Vertrag`helmut-w15-mock500-host-functional/1`.

## Tatsächlicher Abschluss

**Funktion FAIL.** Der authentifizierte Run und Job sind abgeschlossen. Jobdauer
laut API188s (00:08:56–00:12:04UTC), Hauptaktionsschritt165s. Watcher218,525s ist
eine zeitlich spätere Beobachtung und keine Jobdauer. Der einmalige Auftrag ist
verbraucht; ein POST und eine16er-Linkrunde, kein Retry/Linkrefresh. Vor dem POST
279,5203s tatsächliche Mindest-Linkrestzeit, 60.256B ASCII-Gesamtparameter.
Sicherer Fast ForwardF157→32655, keine Rücksetzung oder weitere Branchänderung.

Die eindeutige SAFE-Fehlerquittung meldet Workerphase`mock500`, Grund
`WORKER_REPORTED_FAILURE`, Workerexit1. Im Controller wird die innere Ausnahme
verworfen (`mock500-body`), anschließend ein generischer RuntimeError ohne Ursache
geworfen und außen nur`mock500` erhalten. Das belegt einen Diagnoseverlust,
**keine bestimmte innere fachliche oder technische Fehlerursache**.

500 gleichzeitige aktive Profile, 500Units, 1.000Mockphasen, 1.500 einzeln geprüfte
Ergebnisse, 8.000 Kontrollen, 17.000 Auditprüfungen und deren Fehlerkategorien sind
als Endstand **UNKNOWN**. Auch vollständige Timingmaxima, Sicherung/Rücklesung/
zweiter Restore und finale Datenbankflags0 sind nicht positiv belegt. Keine
lokalen Erwartungswerte als tatsächliche Ergebnisse verwenden.

Die Quittung enthält keine explizite Runtime-Nonce oder vollständige tatsächliche
Workflowdeklaration. Diese bleiben UNKNOWN; lokale GO-/POST-Dateien ersetzen keine
authentifizierten tatsächlichen Inputs. Run/Job/Commit/Attempt und einmalige
Übermittlung sind unabhängig gebunden. Dies ist keine positive Funktionsabnahme.

## Ressourcen

| Beobachtung | Tatsächlich gemessen | Aussage |
| --- | ---: | --- |
| Gemeinsamer Kernelpeak | 2,592 GB | unter tatsächlichem Hartlimit |
| Frisch berechnetes Hartlimit | 13,419 GB | derselbe Wert in den Fehlerreadbacks |
| Minimale geschützte Hostreserve | 2,147 GB | vorhandener Vertrag, keine Änderung |
| Dateianteil, beobachtetes Maximum | 1,522 GB | enthält SharedMemory |
| Anonymer Speicher, beobachtetes Maximum | 980 MB | zeitlich eigener Maximalwert |
| Kernelspeicher, beobachtetes Maximum | 78 MB | zeitlich eigener Maximalwert |
| SharedMemory, beobachtetes Maximum | 41 MB | nicht zusätzlich zum Dateianteil addieren |
| Swap/OOM/harte Grenzereignisse | 0 | kein belegter RAM-Grenzabbruch |
| PostgreSQL/Node/PostgREST/Werkzeuge einzeln | UNKNOWN | keine vollständige Attribution im Fehlerbeleg |
| CPU, gleichzeitige Peakzusammensetzung | UNKNOWN | keine Schätzung als Messung |

Der Supervisor bestätigt die Host-/Ancestor-Schutzbedingungen, unter anderem
HostAvailable15,119GB im letzten gültigen Fehlerreadback. Diese Beobachtung ist
kein Minimum über den ganzen Lauf und keine Anbieterabnahme. Kategorie-Maxima
stammen aus unterschiedlichen Zeitpunkten; nicht addieren. Der alte5-GB-Vergleich
und alte strengere RAM-Abnahmen bleiben unverändert. Vercel-/Supabase-Eignung
**UNKNOWN**, Production500 nicht ausgeführt und weiterhin separat gesperrt.

## Bereinigung, Kosten und Belegerhalt

Alle acht bestehenden Bereinigungsfelder PASS: Worker beendet, IPC geschlossen,
Parentstopp angefordert, Parent leer, Unit entfernt, Servicelauncher beendet,
Listener geschlossen, Signalbehandlung wiederhergestellt. Frische Nachkontrolle:
keine aktiven manuellen GitHub Runs. Prozessstillstand und finale Profilflags0
bleiben getrennte Urteile; letztere fehlen im Ergebnisbeleg.

Artefaktanzahl0, zusätzliche Artefaktspeicherung0. Keine weiteren Modelltests,
Originalläufe, Grenzänderungen, Merges, Deployments oder Productionaktionen.
Originale, bestehende Drive-Archive und Secrets bleiben unverändert erhalten.

Private Primärbelege einschließlich authentifiziertem Joblog, SAFE-Quittung,
Run/Jobs/Artefakt-API-Rücklesung und unabhängigen Reviews liegen dauerhaft unter
`/workspace/helmut-w15-private-evidence-20261102/MOCK500_HOST_FUNCTIONAL_01/`;
Livecase`/tmp/w15-mockhc-20261102`. Keine privaten Originale, vollständigen privaten
Quittungen oder Zugangsdaten werden mit dieser Dokumentation veröffentlicht.

## Nachfolgende gezielte Reparatur, kein neuer Originallauf

[Draft-PR1017](https://github.com/ernisch/helmut-pilot/pull/1017), Branch
`codex/w15-mock500-first-failure-checkpoint-20261102`, Kopf
`1fb2cfe103d0e788a951e0e9158171326057b49d`: Der nachgestellte Diagnoseverlust
ist behoben. Der Controller meldet die erste feste Arbeitsphase über den schon
vorhandenen Worker-/IPC-/Aktionskanal. Spätere Supervisor-, Gateway-, Signal- und
Abschlussfehler verdrängen den Erstfehler nicht und verhindern die Wiederherstellung
der globalen Bindungen nicht. Exakte Exceptiontypen und eine geschlossene
Phasenliste sperren beliebige private Fehlermeldungen, Pfade und SQL.

Sieben kleine Pythonfehlerfälle und26 zugelassene Phasen durch den tatsächlichen
Python-/JavaScript-Kanal PASS. Die Korrektur samt nativer Testgrenze und CI-Anschluss
ist unabhängig auf dem exakten Kopf geprüft, ohne offene Befunde. Pflicht-CI
[41413462459](https://github.com/ernisch/helmut-pilot/actions/runs/41413462459)
ist vollständig PASS: beide erforderlichen Checks sowie die korrigierte Kopierprobe.
Der tatsächliche CI-Merge-Testbaum ist bytegleich zum unabhängig geprüften Kopf.
Die Probe verwendet eine fiktive Datei, eine schon vorhandene CI-Dienst-Image-ID
und einen begrenzten, netzlosen Schlafcontainer: keine Datenbank, Originale,
Profilaktivierung, Modelle oder500erGesamtausführung.

Zwei konkret untersuchte Verdachtsmomente rechtfertigen keinen Laufzeitfix:

- Die lokale Kopierprobe und die korrigierte native CI-Probe reproduzieren keinen
  Dateieigentümerfehler. Der kontrollierte UID0-Gegenfall wird korrekt abgewiesen.
  Die erste CI-Probe41411724415 bleibt FAIL/INCONCLUSIVE vor der Eigentumsmessung;
  vier BereinigungenPASS. Ihr Arbeitsverzeichnis und ihre Containerbasis wichen
  vom echten Worker ab; diese Testvoraussetzungen wurden gezielt korrigiert.
- Der tatsächliche Mock-Staging-Serverimport besteht ohne `vercel.json`. Ein
  kleiner originalfreier Test beobachtet genau einen intern abgefangenen
  MODULE_NOT_FOUND-Fall, erfolgreiche Servereinbindung und Cron-Metadaten=null;
  Listener/Verbindungen/Fetches/Kindprozesse0. Kein Import- oder Empfangsfix.
  Der experimentelle Test ist separat erhalten, kein Grund für einen erneuten
  unveränderten End500-Nachweis oder eine Speicheroptimierung.

Private Entwicklungs-/CI-Belege liegen unter
`/workspace/helmut-w15-private-evidence-20261102/MOCK500_FIX_ROOT/`,
unabhängige Prüfungen unter dem benachbarten `MOCK500_CHECKPOINT_INDEPENDENT/`.
Bestehende Originale und ursprüngliche Laufbelege bleiben am oben genannten Ort.

## Tatsächlicher nächster Schutzpunkt

Die historische erste innere Ursache bleibt UNKNOWN. Eine reparierte
Fehlerweitergabe rekonstruiert keine verlorene Quittung. Auch ein reproduzierter
Importfehler würde ohne passenden Laufbeleg nicht automatisch den historischen
Erstfehler beweisen; die beiden Gegenproben belegen hier keinen solchen Fehler.

Das neue bedingte Einmal-GO ist unverbraucht. Seine geforderte belegte
Ursachenbehebung ist nicht ausreichend nachgewiesen; deshalb kein neuer privater
Link, Originalempfang, Wechsel des Ausführungsbranches oder geschützter Mockjob.
Erforderlich ist ein ausreichender, an diesen Run gebundener Ursachenbeleg oder
eine neue konkrete Betreiberentscheidung, die diese bisher nicht erfüllte
Voraussetzung ausdrücklich ändert. Das verbrauchte alte GO darf nicht
wiederverwendet werden. Historischer
FAIL, vollständige Ergebniszähler/finale Profilflags/Sicherung UNKNOWN,
End500-Funktionsbeleg und sämtliche Schutzgrenzen bleiben unverändert.
Fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Ergebnisse
bleiben jeweils UNKNOWN; es liegen keine vollständigen Einzelbefunde vor.
