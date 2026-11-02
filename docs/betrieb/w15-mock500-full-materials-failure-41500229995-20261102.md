# Mock500 Run41500229995: tatsächlicher FAIL und Materials-Fehlerkanal

## Tatsächlicher Versuch

Der einmalig freigegebene Full-Host-Lauf lief auf
`9d8e72e58fcef5992a223af829a663a96a99d29f` in `helmut-ci-originals`.
[Run41500229995](https://github.com/ernisch/helmut-pilot/actions/runs/41500229995),
Job125465522115, Versuch1, Nonce954a6ee6-1971-48e6-b819-184d4437cadd.
Genau eine Linkrunde mit16 Fetches und ein akzeptierter POST. Tatsächliche minimale
Linkrestzeit262,146799s, gesamte Parameter61100Zeichen. READY bis Übergabe39,737s.
Der Branch wurde vorher sicher ohne Force von61d7b5c9 auf9d8e72e5 vorgespult.
Pflicht-CI41492411431 und unabhängige Code-/Bridge-/Startprüfungen waren bestanden.

**FAIL**. GitHub-Job18:24:18–18:26:22UTC =124s; Hauptaktion98s. Die139,8s des
externen Watchers enthalten Beobachtungsnachlauf und sind keine Jobdauer.
Erhaltene erste Phase: `mock500-controller-materials`;
Runnergrund `WORKER_REPORTED_FAILURE`, Python-Workerexit1.
Das ist kein Beleg für einen Nodeexit1. Die alte Phase umfasst sowohl den
Materials-Nodeprozess als auch vier nachfolgende `copy_in`-Übergaben.
Nodeabschluss, genaue Kopierstelle und neue innere Ursache bleiben **UNKNOWN**.
Der frühere Kalenderfehler ist synthetisch belegt korrigiert; er wird diesem
neuen Lauf nicht ohne Zeuge erneut zugeschrieben.

Die lokale GO-/Request-/POST-/Runbindung wurde unabhängig bestätigt. Im tatsächlichen
Fehlerabschluss fehlt die Runtime-Nonce und die vollständige tatsächliche Deklaration;
diese Beobachtungen bleiben UNKNOWN. Das erzeugt keinen zusätzlichen Versuch.

## Ressourcen und Abschluss

| Beobachtung desselben Runs | Tatsächlicher Wert |
|---|---:|
| Gemeinsamer Kernelpeak | 2,590 GB |
| Frisch zugelassenes dynamisches Hartlimit | 13,287 GB |
| Verpflichtende Hostreserve | 2,147 GB |
| Größter beobachteter Dateianteil | 1,529 GB |
| Größter beobachteter anonymer Speicher | 956 MB |
| Größter beobachteter Kernelanteil | 77 MB |
| Shmem-Maximum, bereits im Dateianteil | 40 MB |
| Swap / OOM / harte Grenzereignisse | 0 / 0 / 0 |
| Äußere Bereinigungsprüfungen | 8/8 PASS |
| Artefakte / aktive manuelle Läufe | 0 / 0 |

Kategorien stammen aus17923 diagnostischen Elternbeobachtungen. Ihre Maxima können
von verschiedenen Zeitpunkten stammen; weder addieren noch als Peakzusammensetzung
ausgeben. Der zusätzliche Worker-Cache enthält nur eine Beobachtung nach dem Fehler.
Phasenverlauf, PostgreSQL-/Node-/PostgREST-PSS, CPU und Verbindungsverlauf sind UNKNOWN.
Vorliegende Hostreserveprüfung PASS; keine vollständige Anbieter- oder RAM-Abnahme.
Ein Abbruch am gemeinsamen Kernel-RAM-Limit ist nicht belegt. Historische strengere
RAM-FAILs bleiben erhalten; keine Speicheroptimierung oder Grenzänderung erfolgte.

500gleichzeitigaktiveProfile,500Units,1000Mockphasen,1500Ergebnisse,8000Sicherheitskontrollen,
17000Audits, alle fünf Ergebnisfehlerkategorien und Zeiten bleiben UNKNOWN.
Sicherung, entfernte Rücklesung, zweite Rücksicherung, finale innere DB-Nullaktivität,
Fachfelder und innere Containerabschlussbelege sind ebenfalls UNKNOWN.
Alle acht **äußeren** Prozess-/IPC-/Parentbereinigungen sind davon getrennt PASS.
Finale reine API-Lesung:13andereJobs SKIPPED,0Artefakte, alle fünf manuellen
Aktivstatus0, Ausführungsbranch weiterhin9d. Keine Rücksetzung, kein Retry/Refresh.
Production wurde nicht angefasst. End50041325430429 und Originalempfang41037459441
bleiben vorhandene eigenständige Belege, kein Ersatz für diesen Mock500-FAIL.

31vorhandene Versuchsdokumente, Kontrollcode, verschlüsselter Index und private
Logs sind mit Größen und Hashes dauerhaft im bestehenden privaten Belegbereich07
unter der tatsächlichen Runkennung erhalten. Keine Schlüssel/Passphrasen kopiert;
GPG-Arbeitsverzeichnis ausgeschlossen. Rohlogs und private Quittungen bleiben privat.
Unabhängige FAILED-Abnahme: da5add53d171826e9045bb81f576145c8cf81ae5039a0e58429b9a674837ebc8.

## Nachgewiesene Meldefehler und begrenzte Korrektur

Entwicklungsbranch: `codex/w15-mock500-materials-full-failure-forward-20261102`.
Der tatsächliche endgültige Commit, CI und Review werden am zugehörigen Draft-PR
gebunden; der geschützte Ausführungsbranch bleibt auf9d.

Der alte Full-Controller setzte `HELMUT_W15_MATERIALS_DIAGNOSTIC=1` nur im
Diagnosezweig. Im Fullpfad war der bestehende sichere Node-Recorder deshalb ein
No-op. Der Full-Controller las seinen geschlossenen Erstfehler nicht und der
Worker übertrug nur die Phase. Zudem blieb die Phase während aller vier Kopien
unverändert. Das beweist Diagnoseverlust und Mehrdeutigkeit, nicht die neue
funktionale Fehlerursache.

Ein gemeinsamer kleiner Helper verwendet denselben echten Nodeaufruf und dieselben
vier `copy_in` für Full und die vorhandene begrenzte Materialdiagnose. Der vorhandene
sichere Recorder ist eingeschaltet. Ausschließlich seine größen-/rechtegeprüfte
Vierfeldmeldung wird akzeptiert; private Legacy-Rohmeldungen werden nicht publiziert.
Fehlende oder ungültige Meldung bleibt ausdrücklich `MATERIALS_FAILURE_UNAVAILABLE`.
Jede der vier Kopieroperationen bekommt eine feste eigene Phase. Erst nach allen
vier erfolgreichen Kopien gilt `materialsCompleted`. Diagnose beendet weiterhin
vor Atomic-Bootstrap,prepare,run,Audit oder vollständigem Sicherungsrundlauf.

Die exakte typisierte Controllerausnahme trägt nur die geschlossene Meldung.
Workflow, bestehende terminale IPC und Action erhalten sie als optionales
`runner.materialsFailure`. Schlüssel, Kategorien, Fehlerarten und Stufen sind
streng begrenzt; keine freien Texte, SQL, Pfade, Geheimnisse oder neuen IPC-Frames.
Ungültige Zusatzdaten entfernen keine bekannte Phase. Fremde Typen, Nicht-Materials-
Phasen, spätes FD-Schließen, Bereinigung und Signale dürfen den Erstfehler nicht
ersetzen. Alle bisherigen Größen-, Ressourcen-, Quellen-, Einmal- und Startgrenzen
bleiben unverändert. Alte Modi/FAILs und der gesperrte Fullstart bleiben erhalten.

Gezielte synthetische Gegenproben: Nodefehler, private/zu große/Symlink-Zeugen,
alle vier Kopierfehler, vollständige Kopierfolge, typisierte Workflow-/IPC-/Action-
Weitergabe, fremde Typen/Phasen und späte Bereinigungsfehler. Bestehende kleine
Pipeline-Fixtures prüfen null Units/Provider und sichere Diagnose-Nullaktivität.
Diese Gegenproben sind keine Original- oder Mock500-Abnahme. Pflicht-CI und
unabhängiger Review sind auf dem endgültigen neuen PR-Kopf separat erforderlich.

## Nächste echte Freigabegrenze

Fullversuch1 und Linkrunde1 sind verbraucht. Keine weitere geschützte Ausführung
ist aus diesem GO erlaubt. Die konkrete neue Laufursache ist noch unbekannt;
ein weiterer vollständiger Mock500 auf Verdacht wird nicht empfohlen.

Kleinste begründete nächste Aktion nach exakter Code-/CI-/Reviewabnahme:
eine einmalige begrenzte Diagnose mit vorhandenen Originalbindungen **einschließlich
Node und vier Ausgabekopien**, anschließend sichere Nullaktivität und Prozessstopp.
Der alte Diagnosepfad ohne Kopien würde den mehrdeutigen Fehlerabschnitt nicht
vollständig abdecken. Kein neuer Diagnosemodus, keine neue Infrastruktur.

Freigabevorlage für den dann exakt benannten PR-Kopf im bestehenden Environment:
Ein sicherer Fast Forward von9d nur auf diesen geprüften Kopf; genau eine frische
Linkrunde und ein Materials-Diagnosejob. Höchstens20min äußerer Job,18min Worker,
15min Materialvorbereitung, dynamisches Hostlimit mit mindestens2147483648Byte
Hostreserve,Swap/OOM/Grenzereignisse0, mindestens512MiB Plattenreserve,
höchstens0,05USD Speicherung und ein verschlüsseltes Belegartefakt für einen Tag.
Keine Units, Providerphasen, Modelle oder vollständige500er Verarbeitung. Nur
notwendige isolierte DB-Aktionen; erforderlichenfalls temporäre synthetische
Aktivierung, danach geprüfte0aktive Profile und unveränderte Fachfelder.

Erwartung ist entweder geschlossene Node-/Kopierursache oder vollständiger
Materials-/Kopierabschluss; keine automatische Mock500-Freigabe. Linkgültigkeit>90s,
Parameter≤65535, vorhandene Secrets/Empfänger-/Dateipins unverändert.
BeiFAIL/UNKNOWN stoppen, keinRetry/Refresh. Nur eigene Prozesse stoppen und deren
Stillstand nachweisen; Originale, Drive und Secrets erhalten. Kein Merge,
Deployment oder Production-Eingriff. Vor dieser Aktion neues ausdrückliches GO.
