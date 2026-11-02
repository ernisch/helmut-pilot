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

## Kleinster nächster Schritt

Die feste erste innere Controllerphase über den vorhandenen sicheren Fehlerkanal
erhalten und mit wenigen synthetischen Fehlerfällen nachweisen. Keine rawException-
Texte, Pfade, SQL oder Secrets protokollieren. Erst anhand einer konkreten Ursache
über den nächsten geschützten Versuch entscheiden; kein neues Voll-GO auf Verdacht.
Keine Speicheroptimierung oder höhere Grenze aus diesem FAIL ableiten.
