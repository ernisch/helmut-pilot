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

## Schutzpunkt vor der anschließenden Betreiber-Ausnahme

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


## Neuer ausdrücklich freigegebener Start: lokal BLOCKED, kein Mockjob

Der Betreiber hat danach die historische Ursachenpflicht ausdrücklich für genau
einen neuen Mock500-Funktionslauf auf1fb2cfe1 aufgehoben. Quelle, Pflicht-CI,
End500-v4-Beleg, neue technische Quellen-/Eingabebindungen, frische Nonce,
Umgebung/Schutzregeln und der sichere Fast Forward32655→1fb wurden geprüft und
unabhängig abgenommen. Die Quellenqualifikation und öffentlichen technischen
Review-/Brückenmetadaten sind an diesen Kopf gebunden; keine Originalinhalte oder
privaten Downloadlinks veröffentlicht. Historische FAILs bleiben unverändert.

Die neue Laufbindung führte genau eine16er-Linkrunde aus: erster Fetch278ms nach
READY, Übergabe24.386ms nachREADY. Der Launcher endete kontrolliert mit
`BLOCKED_MOCK500_DISPATCH`, erster Phase`encryption`, **vor dem GitHub-POST**.
`dispatchAttempted=false`, `dispatchAccepted=false`, sekundäre Bereinigungsfehler
leer, Launcher beendetPASS. STARTED-/Linkrunden-/Launchmarker erhalten; kein
POST_ATTEMPT, ONE_POST_ACCOUNTED oder RUN_BINDING. Damit **kein neuer GitHubjob,
keine Mockprofile aktiviert und keine neue Funktions-/RAM-/Sicherungsabnahme**.
Die acht Workerbereinigungen sind für diesen nicht gestarteten Job nicht anwendbar;
die acht PASS-Werte oben gehören ausschließlich zum historischen Run41365567913.
Die abschließende Restzeit-/Gesamtparameterprüfung vor dem POST wurde nicht
erreicht. Belegt sind45.599B für den Request vor dem verschlüsselten Index;
eine tatsächliche finale Parametergröße oder POST-Restgültigkeit wird nicht behauptet.

Der konkrete lokale Vorbereitungsfehler: Das für GPG gewählte Arbeitsverzeichnis
leitete Socketpfade über der Linux-Grenze ab. Tatsächlich Home101B, längster
Socketpfad121B; zulässig maximal107B ohne abschließendesNullbyte. Vorhanden waren
nur öffentliche Schlüsselring-/Trustdateien; kein verschlüsselter Indexausgang.
Rohes tatsächliches GPG-stderr wurde vom bestehenden Helfer nicht behalten.

Eine kleine kontrollierte Gegenprobe rief den tatsächlichen unveränderten
`encrypted_index.encrypt_index` mit demselben fiktiven Zweifeld-JSON und bestehenden
öffentlichen Empfängerschlüssel auf. Langes Home100B/Socket120B: öffentliche
Vorschau0, Import2 mit fest klassifiziertemNameTooLong/Agentbezug. Kurzes
Home52B/Socket72B: Import/Verschlüsselung/Agentabschluss jeweils0 und validierter
PGP-Cipher. Keine echten URLs, Originale, privaten oder neuen Schlüssel, Drive-/
GitHub-Aufrufe oder500erAusführung. Eigene temporäre Testdateien entfernt.
Ein vorheriger Syntaxfehler des Testtreibers wurde vor jeglicher GPG-Aktion
korrigiert; die eigentliche Gegenprobe lief einmal. Der Befund ist unabhängig
geprüft und passt zum tatsächlichen Importstadium. Dies ist ein lokaler Caller-
Pfadfehler, kein nachgewiesener Mock-Worker-, Empfänger- oder Speicherfehler.
Diese abgeleitete Pfadgrenze fehlte auch im ursprünglichen unabhängigen Review;
dessen alte Quittung bleibt als begrenzter damaliger Nachweis unverändert.

Kleinste Korrektur vorbereitet: echtes privates0700-Verzeichnis
`/tmp/w15mr-next-20261102`, zukünftiger Zustand in dessen`dispatch-state`;
längster GPG-Socketpfad79B, mitNullbyte80B unter108B. Keine Symlinks oder geänderten
Wächter. Alle fünf Kontrollprogramme und statischen Quellen-/Eingabe-/End500-
Bindungen sind bytegleich zum geprüften Stand. Keine neue Freigabe, Nonce,
Linkrunde oder Laufmarker dort erzeugt; Laufzeitcode1fb unverändert, vorhandene
Pflicht-CI weiter gültig. Die vorbereitete Pfadkorrektur ist unabhängig abgenommen.

Belege einschließlich Launcher-/Übergabequittung, unveränderter Startjournale,
öffentlichem Metadatenreadback, kontrollierter GPG-Gegenprobe und Pfadplan:
`/workspace/helmut-w15-private-evidence-20261102/MOCK500_RESTART_02/`.
Die alten Original-/Laufbelege bleiben an den oben genannten Orten erhalten.

Die eine aktuelle Linkrunde bleibt verbraucht und gestoppt. Kein Retry, Refresh,
zweiter Dispatcheraufruf oder automatischer Branchreset. Für eine neue Linkrunde
und den ersten tatsächlichen GitHub-Mock500-Job auf exakt1fb ist eine neue
explizite Betreiberfreigabe mit frischer Laufbindung erforderlich. Alle bisherigen
210-Minuten-/Kalendertags-/Reserve-/Swap-/OOM-/Platten-/Kosten-/Sicherungs-/
Integritäts-/Modell-/Production-Grenzen bleiben unverändert. Der spätere
vollständige Funktionsnachweis und seine unabhängige Abnahme fehlen weiterhin.
