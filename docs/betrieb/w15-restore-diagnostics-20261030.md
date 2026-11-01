# W15: Restore-Diagnosekette, 30.10.2026

Der historische Run40958135662 auf225e76d7 endet ausschließlich mit der äußeren
Phase `worker`. Er enthält keine verwertbare innere Phase, RAM-Werte oder positive
Stillstandsquittung. Diese Werte bleiben UNKNOWN; der Run bleibt FAIL. Es wurde
kein neuer Originallauf gestartet. Die Änderungen beheben nachgestellte Fehler
in der Diagnosekette; sie beweisen keine bestimmte innere Ursache dieses Runs.

## Nachgestellter Diagnoseverlust

Am unveränderten225e76d7 wurden vier zentrale Regressionen synthetisch bestätigt:
eine bereits gesendete oder gespeicherte Workerfehlermeldung wird von der nächsten
Ressourcenprüfung überdeckt, ein Fehler beim Schließen der Pipe ersetzt den
Erstfehler, und ein vollständig gelesenes verworfenes Kernel-Sample geht verloren.
Sechs zusätzliche Gegenproben bestätigen weitere Lücken bei Listenerabschluss,
Elternidentität, TERM während Bereinigung, nachfolgender Leerstandsprüfung,
Worker-Setupabschluss und Ressourcenunterbrechung. Keine Originaldateien,
Datenbank, GPG, Container oder500er-Controller wurden dafür verwendet.

## Begrenzte Reparatur

Die vorhandene Pipe und Unix-Socket-Kommunikation bleiben erhalten. Nur feste
Phasen, feste Gründe, begrenzte Exitcodes, geschlossene numerische Ressourcenwerte
und dreistufige Bereinigungszustände können nach außen gelangen. Exceptiontexte,
Pfade, stderr und geheime Werte bleiben ausgeschlossen. Jeder Frame wird begrenzt
gelesen; EOF, Teilübertragung, Frist und ungültige Antwort bleiben unterscheidbar.
Ein vollständig validierter innerer FAIL hat Vorrang vor einem späteren Guardfehler.
Ein erst nach einer Unterbrechung eingehender Abbruchbericht wird nicht zum Erstfehler.
SystemExit0 oder eine unvollständige Antwort können keinen PASS erzeugen.

Der erste Fehler bleibt bis zur JavaScript-Aktion erhalten, auch wenn anschließend
IPC-Abschluss oder Bereinigung fehlschlagen. Eine bereits geschlossene FAIL-Antwort
wird bei spawnSync-Fehler weitergegeben; ein Erfolg plus Prozessfehler bleibt FAIL.
Setup-/Stagingfehler erhalten den bereits vorhandenen Ressourcen-Cache.

Ressourcen werden als CURRENT_REJECTED_READBACK, CACHED_READBACK oder ausdrücklich
spätere POST_FAILURE_READBACK gekennzeichnet. Die letzte verfügbare Kernelmessung
wird vor dem Stop eines bestätigten eigenen Elternbereichs gesichert, sofern kein
konkreterer innerer oder aktueller Befund vorhanden ist. Fehlende Daten werden
nicht durch Nullen ersetzt. Ein fehlerhafter Öffnungsversuch invalidiert den alten
Cache; TERM vor einem vollständigen aktuellen Sample erzeugt kein falsches
aktuelles Sample. Limits, Peak, Reserve und Swapregeln werden nicht geändert.

`workerExited`, `workerIPCClosed`, `parentStopRequested`, `parentEmpty`,
`parentUnitRemoved`, `serviceLauncherExited`, `launcherListenerClosed` und
`launcherSignalsRestored` werden getrennt als PASS/FAIL/UNKNOWN ausgewiesen.
`parentStopRequested` bestätigt eine angenommene Stopanfrage, keinen Stillstand.
`serviceLauncherExited` betrifft nur das beobachtete lokale Startprozessobjekt.
`parentEmpty` braucht die tatsächliche Kernel-Leerstandsbeobachtung derselben
Elternidentität. Bekannte eigene Prozesse werden auch bei fehlender Beobachtung
begrenzt gestoppt; unbekannte oder ersetzte Elternbereiche werden nicht angefasst.
Entfernung erfolgt nur nach positiver Leerstandsprüfung bei unveränderter Identität.
Die Simulation prüft diese Wege; sie ist kein nativer historischer Stillstandsbeweis.

## Gezielte Abnahme

27 neue Diagnoseprüfungen PASS; neun betroffene vorhandene Anschlusssuiten PASS.
Die neuen Tests sind im bestehenden Pflicht-CI-Schritt eingetragen. Zwei unabhängige
reine Quellreviews bestätigen Fehlerpriorität, Ressourcenherkunft, Signale,
Eigentümerschaft und geschlossene Ausgabe. Der beigefügte Codebeleg bindet deren
Quellstand durch öffentliche Codehashes. Pflicht-CI muss zusätzlich auf dem
aktuellen Codekopf des eigenen Draft-PR erfolgreich sein; dessen externer Status
ist die maßgebliche Laufquittung. Es wurde keine neue Infrastruktur eingerichtet.

## Nächster echter Freigabepunkt

Der reparierte Diagnoseweg rechtfertigt allein keinen weiteren vollständigen
Originallauf. Die tatsächliche innere Restore-/Backupursache bleibt UNKNOWN.
Ein späterer Versuch kann nur als konkret begründete, einmalig begrenzte Diagnose
mit aktuellem geprüftem Commit, gesondertem GO und unveränderten Stop-/RAM-/Kosten-
grenzen beurteilt werden. Kein automatischer Retry. Kein End500, Mock500, Merge,
Deployment oder Production-Eingriff wurde ausgeführt oder zusätzlich freigegeben.
Die zehn weiterhin nicht erreichbaren Mock-Zusatzdateien und der offene Pin bleiben
BLOCKED; keine identische Inventur, Neuqualifikation oder Übertragung.

## Erhaltene vorherige Fortschreibung

## W15: Diagnose60195031 FAIL, keine weitere echte Ausführung

Neues konkretes GO genau einmal genutzt: [40946145190](https://github.com/ernisch/helmut-pilot/actions/runs/40946145190)
auf60195031c9187cf91ce4497f8875977683914f20, Originalbranch/Attempt1, FAIL
`worker.backup-export`. Dispatch47528Zeichen, echte Mindestlinkrestzeit262s.
Unabhängige Abnahme bestätigt FAIL. Letzter gültiger Worker-Cache:
Cap2560000000/Peak1638682624/Current1510432768Bytes,Swap0,alle4Limit-/OOM-Events0.
Kein Gesamt-RAM-/Stop-/Parentleer-PASS. Codefluss belegt davor12Dateien/242570240Bytes
und primären fünfstufigen Restore500/0; kein vollständiger Restore-PASS.
Freeze/Collect/Seal/Transport/zweiteRecovery nicht erreicht,0finalisierte Artefakte.
Innere Exportoperation/UrsacheUNKNOWN; kein pg_dump-Defekt behauptet.
[Erstfehler](betrieb/belege/w15-mock500-integration-20261029/RESTORE_60195031_FAILED.SAFE.json)
und [unabhängige Abnahme](betrieb/belege/w15-mock500-integration-20261029/RESTORE_60195031_REVIEW.SAFE.json)
erhalten. Kein Retry. Weitere echte Ausführung erst nach gezielter Ursachenbehebung
UND neuem konkretem GO; End500/Mock500 bleiben gesperrt.

Die tatsächlich fehlende native Exportverbindung wird gezielt mit kleinen
synthetischen Daten im vorhandenen CI-Service geprüft: echter Worker/Kindprozess,
Dateien, Lifecycle und Quittungen statt künstlich erzeugter Exportdateien.
Kein Originalrestore oder500er-Controller. Aktueller nativer Befund und Pflicht-CI
stehen am tatsächlichen Kopf vonDraft977; kein Originalfehler-PASS daraus.
Fehlercommit60195031 bleibt unveränderter Vorfahre, Mock-Dateiblocker weiterBLOCKED.

Konkreter zusätzlicher Exportblocker synthetisch reproduziert: CI40948554553
auf32eb2dd2 beendet zwei native Aktionen, dannFAIL`backup-roles-native`,RC1;
eigeneDB/Rolle/Dateienbereinigung bestätigt. PG17.6 sucht beim Start vonpg_dumpall
unbedingt seinpg_dump-Nachbarprogramm anhandargv0. Der bisher erfundeneBASE-Pfad
existiert nicht. Minimalfix: nurpg_dumpall erhält echtesargv0; ein gültiger
application_name-Verbindungsparameter erhältBASE im Prozessargument. Stopguard
unverändert. Native Regressionsabnahme/aktuelle Pflicht-CI sieheDraft977.
Das ist ein belegter Codeblocker, kein direkt beobachteter innerer Erstfehler
des Originallaufs; dessen feine Ursache bleibtUNKNOWN. Keine neueAusführung.
