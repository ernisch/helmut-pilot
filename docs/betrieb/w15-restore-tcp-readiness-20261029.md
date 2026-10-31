# W15: frische PostgreSQL-Bereitschaft und feste Fehlerphasen

Der genau einmal freigegebene Restore40920225333 aufb6eb7449 scheiterte mit
`connection-restore`. Das ist keine positive Restore-/Backup-/Rücksicherungs-
oder RAM-Abnahme. Kein automatischer Retry. Der vorherige40905370350 bleibt FAIL.

Unabhängige rein lesende Prüfung fand eine konkrete Readiness-Race: Die offizielle
PostgreSQL-Initialisierung öffnet kurzzeitig ausschließlich einen Unix-Socket.
`pg_isready` ohne Host kann diesen Übergangsserver bereits als bereit melden,
bevor er stoppt und der endgültige Server startet. Primärer isolierter Restore
und zweite Rücksicherung warten jetzt ausdrücklich aufTCP127.0.0.1. Keine
Restoreaktion wird dafür wiederholt. Die genaue historische Fehlerursache ist
wegen der alten groben SAFE-Fehlerphase weiterhin unbekannt.

Die feste Fehlerprojektion unterscheidet zusätzlich prepared-check,
materialization,container-start,readiness,native-restore,backup. Nur diese festen
Wörter passieren Worker/IPC/JavaScript; keine Exceptiontexte, privaten Pfade,
SQL-Inhalte oder Logs. Vorhandene Einmalbindung, Eingabe-/Empfängerpins,
gemeinsame Uhr, RAM2560000000/Peak2048000000/Reserve512000000/Swap0 und alle
Sicherungsprüfungen bleiben unverändert. Die geprüften7e3d96e9/b6eb7449 bleiben
unverändert als Vorfahren erhalten.

Drei neue fiktive Readinessfälle belegen: Init-Socket allein startet keinen
Restore; echte TCP-Bereitschaft startet genau eine native Aktion; deren Fehler
bleibt alsnative-restore erhalten. Derselbe bestehende Rücksicherungs-Pollblock
wird ausschließlich mit fiktiven Prozessen geprüft. Der betroffene geschlossene
Phasentransport einschließlich JavaScript wird gezielt geprüft. Keine Originale,
DB, GPG, Netzübertragung oder500er-Ausführung durch diese Tests.

Vor einem neuen echten Einzelversuch: unabhängiger Review, Pflicht-CI auf dem
tatsächlichen Codekopf, unveränderte Environmentberechtigung und neues konkretes
GO für genau diesen Commit. Umfang wie zuvor:15bestehende Cipherteile,12Pins,
500Profile/0aktiv, vollständige verschlüsselte Sicherung, entfernter Rückdownload
und zweite isolierte Recovery; höchstens1800s gemeinsamer Parent,0,05USD Speicher,
0Modellaufrufe. BeiFAIL/UNKNOWN stoppen, kein Retry/End500/Mock500. Bestehende
Secrets, Drive-Dateien und Originale erhalten; keine automatische Löschung.
