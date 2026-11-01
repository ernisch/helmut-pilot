# W15 Vollrestore: RAM-Grenze erreicht, unabhängige Abnahme FAIL

Der ausdrücklich einmal freigegebene Vollrestore auf
`537adaa323337518e5ba294e2647bfe084f520c1` wurde genau einmal gestartet.
[Run41073062264](https://github.com/ernisch/helmut-pilot/actions/runs/41073062264),
Attempt1, Job124121902354 sind FAIL. Der Job dauerte90s, der geschützte
Ausführungsschritt62s. Alle zehn anderen Jobs wurden übersprungen; GitHub
bestätigt0Artefakte. Kein Retry, Linkrefresh oder weiterer Originalversuch.

## Erster tatsächlich nachgewiesener Fehler

Die geschlossene Laufquittung meldet Phase `worker` und
`PARENT_READBACK_REJECTED`, Quelle `CURRENT_REJECTED_READBACK`.
Der tatsächliche gemeinsame Kernelpeak beträgt2048073728Bytes bei einem
unveränderten harten Limit von2560000000Bytes. Er überschreitet die erlaubten
2048000000Bytes um73728Bytes; die verbleibende Reserve511926272Bytes liegt
um73728Bytes unter den geforderten512000000Bytes. Der Wächter hat korrekt
gestoppt. Es gab keinen OOM und keinen Swapverbrauch.

| Beobachtung beim abgelehnten Readback | Tatsächlicher Wert |
| --- | ---: |
| Gemeinsamer Kernelpeak | 2048073728Bytes |
| Aktueller gemeinsamer Verbrauch | 2047098880Bytes |
| Verbleibende Reserve am Peak | 511926272Bytes |
| Swapmaximum / aktueller Swap | 0 / 0 |
| Ereignisse max / oom / oom_kill / oom_group_kill | 0 / 0 / 0 / 0 |
| `lastReadbackValid` | false |

Dies beweist eine Überschreitung der vertraglichen RAM-Grenze. Die auslösende
innere Arbeitsphase und deren einzelner Ressourcenverursacher sind durch diese
Quittung nicht belegt: Ein innerer Workerbericht fehlt. Deshalb bleiben
Empfangsabschluss, aktuelle Profilzahlen, Export-, Versiegelungs-, Transport-
und Rücksicherungsfortschritt dieses Laufs UNKNOWN. Der frühere positive
Diagnosebefund wird dadurch weder aufgehoben noch zur Vollabnahme erweitert.

## Tatsächlicher Prozessabschluss

Alle acht geschlossenen Bereinigungsprüfungen sind PASS: `workerExited`,
`workerIPCClosed`, `parentStopRequested`, `parentEmpty`, `parentUnitRemoved`,
`serviceLauncherExited`, `launcherListenerClosed`, `launcherSignalsRestored`.
Der eigene gemeinsame Parent wurde als leer bestätigt; unbekannter
Arbeitsfortschritt wird nicht als erfolgreicher Abschluss ausgegeben.
Es gab keine automatische Löschung oder Branchrücksetzung. Die bestehenden
Originale, Drive-Cipherquellen und Empfängersecrets bleiben erhalten.

## Startbindung und öffentliche Belege

Vor der Linkerstellung waren exakter Kopf, Pflicht-CI41055237113, unabhängige
Reviews, Workflow und bestehende Environment-Branchpolicy rein lesend geprüft.
Der zugelassene Entwicklungsbranch wurde mit `force:false` sicher von
`a2d0f542df9526534c239e3db8291e366798a67a` auf den freigegebenen Kopf
vorgedrückt. `main`, Schutzregeln und Environment-Secrets wurden nicht verändert.
Sämtliche Vorbereitung war vor READY und vor den frischen Links abgeschlossen.
Der Sender hat seinen einen Dispatch angenommen; dies ist keine Restoreabnahme.
Die geprüften Grenzen >90s tatsächliche Restgültigkeit unmittelbar vor dem
einzigen POST und höchstens65535Zeichen gelten unverändert. Eine genaue
verbleibende Sekundenzahl ist nicht aufgezeichnet.

Die ausdrücklich freigegebene öffentliche technische Codequalifikation umfasst
68884Bytes und hat SHA256
`3883e140f41649dba2dd6ee1d9c69a5065629d9d642113d93d06b724299d4408`.
Die hier abgelegten Belege enthalten ausschließlich geschlossene SAFE-Metadaten,
keine privaten Nutzdateien, Klartextlinks, Schlüssel, Passphrasen oder das
komprimierte Qualifikationspaket.

Die tatsächliche Fehlerquittung hat662Bytes, kanonischen SHA256
`f72e613c314c995605bcdab880b733402084958f1897b9216e20468b7ebe5f43`
und Datei-SHA256 einschließlich abschließendem Zeilenumbruch
`d02842d4321a0fe0eee0da68fab1f70ab089b17b723697d83a6447eb816d7100`.
Sie wurde unabhängig genau einmal aus der Log-ZIP im Speicher ausgewertet;
Rohlogs und signierte Logadressen wurden weder gespeichert noch ausgegeben.
Die Nonce steht nicht in der Fehlerquittung selbst. Ihre Bindung ist ausdrücklich
über GO, öffentlichen Request, Senderresultat und tatsächliche Runmetadaten
belegt. Die unabhängige Gesamtbewertung lautet
`FAIL_INDEPENDENT_FULL_RESTORE_ACCEPTANCE`.

Alle geschlossenen Nachweise liegen unter
[`belege/w15-full-restore-result-20261030/`](belege/w15-full-restore-result-20261030/).

## Abnahmestand und nächste Grenze

Der vollständige konsistente Sicherungsrundlauf, authentifizierte entfernte
Rücklesung und zweite frische isolierte Rücksicherung sind weiterhin nicht
abgenommen. Die erlaubte Obergrenze eines verschlüsselten Artefakts mit einem
Tag Aufbewahrung wurde nicht ausgeschöpft; beobachtet sind0Artefakte.
Es gibt keine positive Vollrestore-, End500-, Mock500- oder Production-Abnahme.

Übernommen bleiben die unabhängig erfolgreiche Originaldiagnose41049571965
auf `a2d0f542`: zwölf Originale/242570240Bytes, fünf native Restoreaktionen500/0,
vier Exporte, Peak1644433408Bytes, Swap0. Ebenso bleibt der erfolgreiche
Elf-Dateien-Mockempfang41037459441 mit217563454Bytes und allen ursprünglichen
Pins gültig. Dessen temporärer Runner ist beendet; ein späterer Mocklauf muss
das erhaltene Cipherarchiv im eigenen freigegebenen Job entgegennehmen.
Keine bestehende Qualifikation oder Beschaffung wurde wiederholt.

Nächster Entwicklungsschritt ist ausschließlich eine gezielte Einordnung der
belegten RAM-Überschreitung mit vorhandenen Codepfaden und kleinen synthetischen
Gegenproben. Kein konkret unbelegter Ressourcenverursacher gilt als repariert.
Keine RAM-Erhöhung, kein weiterer echter Versuch auf Verdacht. Ein notwendiger
Fix braucht gezielte Prüfung, Pflicht-CI und unabhängigen Review; ein weiterer
echter Vollrestore braucht danach ein neues konkretes GO. End500 folgt erst
nach positiver Vollrestoreabnahme mit eigener Freigabe auf dem geprüften Kopf.
Mock500 benötigt anschließend positive End500-Abnahme, tatsächliche Bridge
zum Mockkopf und seine eigene unveränderte RAM-v2-/Zeit-/Einmalfreigabe.

## Gezielt ergänzte Speicherdiagnose

Die beiden unabhängigen Codeprüfungen haben keinen unbegrenzten Heap-Read der
Original- oder Dumpdateien nachgewiesen. Absichtliche vollständige Kopien und
wiederholte Integritätsprüfungen sind vorhanden; ihr Dateicache-Anteil im
fehlgeschlagenen Originallauf ist mangels `memory.stat` unbekannt. Diese
Möglichkeit rechtfertigt weder einen behaupteten Ursachenfix noch eine
Absenkung der Reserve. Die beiden geschlossenen Reviews liegen bei den Belegen.

Der Nachfolger ergänzt ausschließlich im Fehlerpfad eine begrenzte Leseprobe
von `memory.stat` am bereits geöffneten und identitätsgeprüften Parent.
Zulässig sind nur sechs feste numerische Kategorien oder UNKNOWN. Die Werte
sind ausdrücklich nach dem Fehler beobachtet und keine Zusammensetzung des
historischen Peaks. Fehler dieser optionalen Diagnose verdrängen weder die
erste Phase noch die bisherigen RAM-Werte; Worker, Supervisor und beide
GitHub-Adapter erhalten dieselbe geschlossene Projektion. Der erfolgreiche
Messpfad liest keine zusätzlichen Kerneldateien. Limits und Schutzentscheidungen
bleiben identisch. Diese Diagnoseergänzung behebt keine nachgewiesene
Speicherursache und erteilt keine neue Ausführungsfreigabe.

Die neue ausdrücklich aktivierte PR-CI-Probe verwendet den vorhandenen
gemeinsamen Parent und denselben RAM-Vertrag für eine feste synthetische
32-MiB-Datei und eine 32-MiB-Kopie. Sie liest die Kernelwerte für anonymen
Speicher, Dateien, Kernel und gemeinsamen Speicher an festen Messpunkten;
fehlende Einzelwerte bleiben UNKNOWN. Dateiinhalt und Kopie werden vollständig
blockweise gehasht, anschließend werden unveränderte Parentidentität und
tatsächlicher Prozessstillstand geprüft. Der Standardaufruf ist gesperrt.
Es gibt keine Originale, Datenbank, Container, GPG, Netzübertragung oder
500er-Steuerung. Kein Cache-Reclaim, Zählerreset oder Abzug vom gemessenen Peak.
Die maximal 180 Sekunden lange Probe ist auf den eigenen Diagnose-PR und
Versuch1 beschränkt. Ihr tatsächliches Ergebnis und die Pflicht-CI werden im
zugehörigen Draft-PR ausgewiesen. Selbst ein PASS dieser Probe erklärt nicht
nachträglich den Speicheranstieg des Originallaufs und erteilt keine Restore-,
End500- oder Mock500-Abnahme.
