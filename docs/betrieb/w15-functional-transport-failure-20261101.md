# Tatsächlicher End500-Transportfehler und begrenzte Korrektur

Run [41256099275](https://github.com/ernisch/helmut-pilot/actions/runs/41256099275),
Commit `ed2a9642d8926736b70ab201b573ce12d11bcfd9`, Environment
`helmut-ci-originals`: **FAIL**, unabhängig bestätigt. Pflicht-CI 41253721311
und die statische Codeprüfung waren PASS. Genau ein Original-Gesamtversuch
dieser Funktionskette wurde gestartet; kein Mock500 und kein Retry.

## Tatsächlicher Befund

Erste öffentliche Fehlerphase `receiver-download`, Grund `WORKER_REPORTED_FAILURE`.
Die Phase ist betreten, nicht vollständig abgeschlossen. Kein bestätigter Empfang
aller 15 Cipherteile, kein Originalrestore, keine End500-Verarbeitung oder Sicherung.
Auth-CAS-, Usage- und Postimagefortschritt bleiben in der Quittung UNKNOWN.
Die elf Mockoriginale aus Empfang 41037459441 bleiben bestätigt; keine Neubeschaffung.

Vor dem einzigen POST: tatsächliche minimale Linkrestzeit 297,480 Sekunden,
vollständige Parameter 51.067 Zeichen. Frühester Ablauf 01.11.2026 00:22:27 UTC;
Fehlerquittung 00:22:27,5019966 UTC. Die beobachtete Downloadphase dauerte rund
214,600 Sekunden und blieb unter dem eigenen globalen 300-Sekunden-Limit.
Die früheste Linkfrist war beim Fehlerabschluss überschritten. Ob zuerst die lokale
UTC-Prüfung, eine HTTP-Antwort, ein Sockettimeout oder ein anderer innerer Fehler
auslöste, ist mangels damaliger Klassifikation **UNKNOWN**. Keine nachträgliche
Behauptung von HTTP 403, Integritätsfehler oder erfolgreichem vollständigem Empfang.

| Vorhandene Messung | Wert | Grenze/Aussage |
| --- | ---: | --- |
| Höchster sicher beobachteter Kernelpeak, Worker | 658,244 MB | Gemeinsames Hartlimit knapp 5 GB nicht erreicht |
| Gesonderter gecachter Runnerpeak | 658,010 MB | Andere Stichprobe; nicht addieren |
| Letzter Runner-Dateicache | 587,002 MB | Keine belegte Peakkomposition |
| Letzter anonymer Speicher | 47,845 MB | Keine belegte Peakkomposition |
| Letzter Kernelspeicher | 22,594 MB | Keine belegte Peakkomposition |
| Letzte Hostreserve | 15,680 GB | Über verpflichtenden rund 2,15 GB |
| Swap / OOM / harte Grenzereignisse | 0 / 0 / 0 | Kein belegter RAM-Limitgrund |
| Verschlüsselte Artefakte | 0 | Keine zusätzliche Artefaktspeicherung |

Der endgültige Lifetimepeak nach Bereinigung ist UNKNOWN. PostgreSQL-, Node- und
PostgREST-Verbrauch sowie Anbieterparität sind hier nicht nachgewiesen.
Alle acht bestehenden Bereinigungsfelder sind PASS, insbesondere Workerexit,
geschlossene IPC, Parent leer und Parentunit entfernt. Nullaktivität als
End500-/Mock500-Abnahme wurde nicht erlangt. Historische FAILs bleiben erhalten.

## Nachgewiesene kleine Korrekturen

Der neue funktionale Diskguard importierte vor und nach jedem `read1()`-Fragment
das Vertragsmodul erneut. Eine kontrollierte kleine Gegenprobe mit 128 Fragmenten
und simuliertem Plattenfreiraum zeigte 257 Importe bei 257 Ressourcenproben:
2,008 Sekunden. Wiederverwendung des bereits vorhandenen Modulobjekts ergab
0,027 Sekunden, weiterhin sämtliche 257 frischen Ressourcenproben und alle
Grenz-/Frist-/Plattenprüfungen. Das misst ausschließlich synthetischen
Importaufwand, keine bewiesene Beschleunigung des echten Transfers und keine
Wiederherstellung der verlorenen inneren Erstursache.

Zusätzlich reproduziert: Ein echter I/O-/Socketfehler konnte beim Schließen
durch ein Signal verdrängt werden. Die erste Klassifikation wird jetzt innerhalb
der vorhandenen Kontexte vor Bereinigung eingefroren. Acht feste Fehlerklassen
laufen über die bestehenden Receiver-, Worker-, Supervisor- und Actionkanäle;
keine freien Fehlermeldungen, URLs, Pfade, Tokens oder privaten Inhalte.
Socketwartezeiten verwenden zusätzlich die tatsächlich kleinere UTC-Linkrestzeit;
die bisherigen Deckel von 60 Sekunden je Teil und 300 Sekunden insgesamt bleiben.
`read1`, TLS, Redirectverbot, Reihenfolge, Größen, SHA256, GPG und Empfangsschlüssel
sowie sämtliche RAM-, Host-, Platten- und Kostenwächter bleiben erhalten.

## Tatsächliche Freigabegrenze

Die Betreiberbedingung für den zusätzlichen Gesamtversuch lautet: „Die Ursache
konkret belegt wurde.“ Die innere Ursache des echten Runs wurde im alten
Empfänger verworfen und bleibt UNKNOWN. Die Korrekturen sind begründet und
synthetisch prüfbar; sie allein ersetzen diesen fehlenden Kausalbeleg nicht.
**Der automatisch erlaubte Zusatz-Gesamtversuch ist deshalb nicht qualifiziert.**

Nach Pflicht-CI und unabhängiger Abnahme des Reparaturkopfs ist die nächste
Entscheidung eine ausdrückliche, exakt gebundene Freigabe für einen korrigierten
End500-Funktionslauf trotz dieses verbleibenden UNKNOWN. Kein eigener
Informations-Sammellauf, kein weiterer Versuch auf altem Code. Grenzen und
vollständiger End500-/Sicherungsumfang bleiben unverändert. Mock500 bleibt bis
zur tatsächlichen positiven unabhängigen End500-Abnahme gesperrt.

Private Quittung, unabhängige FAIL-Abnahme, Lauf-/Noncebindung und Ressourcenwerte
liegen geordnet im privaten Verzeichnis
`/tmp/w15-functional-chain-20261101/END500_01/`. Keine privaten Quittungen oder
Originaldateien werden mit dieser Dokumentation veröffentlicht. Quelle, Drive,
Secrets und Originale wurden erhalten. Kein Merge, Deployment oder Productionlauf.
