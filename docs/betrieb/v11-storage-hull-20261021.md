# V11-Storage-Hülle gesichert; Plattenfreigabe offen

Stand: 21.10.2026 UTC. Die nichtdestruktive Sicherung ist unabhängig abgenommen.
Die geschützte Originalhülle wurde **nicht entfernt**. Der Motorcode ist gegenüber
`80d750c7859fea95ac5901afe7bf8d172c5624a3` unverändert; diese Phase belegt keine
weitere RAM-Ersparnis und keinen erfolgreichen 500er Lauf.

## Tatsächliche Sicherung

Ziel ist ausschließlich der gestoppte ursprüngliche V11-Storage-Container
`66d3bb789888a4c87cc3cdcdd49d6938d0c211189f13f4d8fbc096fbd5447b02`.
Nach Quellenabnahme, Syntax-/Hilfsaufruf und frischer einmaliger Archivfreigabe
wurde er zweimal vollständig exportiert. Beide Exportvorgänge endeten mit 0,
EOF und ohne stderr. Jeder Stream umfasste 438.837.248 Bytes; die aufgezeichneten
SHA256-Werte stimmen ebenfalls überein. Vollständige Export-Tars wurden nicht
auf der Platte materialisiert.

Das gespeicherte Dateimanifest enthält 10.239 Einträge. Die unabhängige Prüfung
rekonstruierte es exakt aus dem erhaltenen Basisimage-Manifest, einem entfernten
Basispfad und den Metadaten. Sie prüfte den 10.240-Byte-Deltatar zusätzlich mit
einem eigenen Headerdecoder: sieben reguläre Dateien, jeweils ohne Nutzdaten.
Die 10.239 Metadaten-Overlayeinträge entstehen auch durch die neu erfassten
Felder `uname`/`gname`; sie bedeuten keine 10.239 geänderten Dateiinhalte.

Alle elf Sicherungsausgaben und ihre Pins wurden unabhängig geprüft. Der
Vergleich mit dem zweiten vollständigen Export sowie die globalen Container-,
Image-, Volume- und Loop-Prüfungen beruhen auf der geprüften Quelle und dem
tatsächlichen erfolgreichen Ablauf. Ungespeicherte Rawstreams wurden bei der
Endabnahme nicht erneut gelesen. Der neue Sicherungsbestand belegte am
Ausführungsende 7.778.304 Bytes; das gesamte neue Dossier bleibt unter 64 MiB.

Alle fünf geschützten Originalcontainer blieben erhalten. Die Originalbank läuft
weiter mit PID 5993; ihre Bindung und die übrigen Originalbindungen wurden erneut
lesend geprüft. Kanonische Verzeichnismetadaten und das Fehlen einer
`postmaster.pid` sind unverändert. Originale Datenbankinhalte wurden dafür nicht
erneut gelesen. Keine Datenbank, kein Container und kein Ressourcenlauf wurde
gestartet. Es gab keine Löschung und keinen Router-/externen Modellaufruf.

## Umfang und Grenze

Gesichert ist die Docker-Rootfs-Exportdarstellung einschließlich zugehöriger
Inspect-/Logbelege, abhängig vom erhaltenen Basisimage. Die fünf externen
Mountquellen bleiben separat geschützt. Dazu gehören die Loop-Eingaben,
`image.raw` und das anonyme Volume; das benannte V11-Datenbankvolume bleibt
ebenfalls erhalten. Dies ist kein Backup der Mountinhalte oder der gesamten V11-
Datenbank. Ursprüngliche Docker-ID, Created-Bindung, Inodes/ctime und beliebige
nicht verfügbare ACL-/xattr-Metadaten werden nicht als wiederherstellbar behauptet.

## Konkrete Plattenoption

Der abschließende Root-Metadatenabgleich ergab folgenden Snapshot, keine Reservierung:

| Größe | Bytes |
| --- | ---: |
| Persistenter Platz verfügbar | 14.947.823.616 |
| Unveränderte vollständige Admission | 15.179.779.720 |
| Fehlbetrag | 231.956.104 |

Die gezielt geprüften weiteren Worktrees und sechs kleinen Diagnosehüllen
lieferten keinen zusätzlich qualifizierten relevanten Platz. Die CLI-Dateien
bleiben wegen ungeklärter Overlay-Herkunft und tatsächlicher Freigabe blockiert.
Ein Tmpfs ist keine persistente Alternative. Keine pauschale Bereinigung erfolgte.

Die private `ROOT_RELEASE_PROPOSAL.SAFE.json` beschreibt genau eine Option:
nach ausdrücklicher Freigabe ausschließlich die oben benannte gestoppte
Originalhülle ohne Force und ohne Volumeentfernung löschen. Images, alle Volumes,
Mountdaten, Datenbanken, Loops, Originalbelege und Git bleiben geschützt.
Die logische Rootfs-Größe von 437.457.485 Bytes ist **kein Nachweis** des tatsächlich
freigebbaren Platzes. Der reale Gewinn und die Admission wären erst danach
erneut zu messen. Die ursprüngliche Docker-ID/Created-Bindung wäre unwiederbringlich.

Der untersuchte aktuelle Vollstartpfad bindet die Originalbank und erzeugt einen
neuen Storage-Container; eine zwingende Live-Abhängigkeit von dieser alten
Storage-ID wurde dort nicht gefunden. Die noch ungefrorene künftige Startclosure
ist dadurch nicht abgenommen. Die bisherige Bereinigungsfreigabe schützt
Originale ausdrücklich; die Hülle bleibt bis zur konkreten Freigabe **KEEP**.
Es existiert keine Löschadoption und es wurde kein Löschbefehl ausgeführt.

## Weiterhin offen

Der vollständige Startvertrag verlangt in vier aktiven Gate-Dateien noch alte
DeepSeek-Reviewformate. Eine konsistent versionierte lokale SOL-Annahme wurde
nur als Vorschlag untersucht. Alte Belege und Routerkonfiguration bleiben
unverändert; tatsächliche Modellprovenienz wird nicht durch Selbstaussagen ersetzt.
Ein bloßer Austausch des Modellnamens wäre keine gültige Integration.

Die zuvor belegte kombinierte Motorersparnis bleibt 154.886.144 Bytes beim
vergleichbaren Komponentenablauf. Das vollständige RAM-Ziel, ein belastbares
Plateau und der Puffer von 500.000.000 Bytes für exakt 500 aktive Profile sind
weiter offen. Keine Motor- oder Ressourcentests wurden wiederholt. Vor einem Volltest
bleiben vollständige Admission, 32 frische Bedingungen, gültige Fall-/Zeitbindung
und ein neues konkretes GO erforderlich. Frühere GOs werden nicht wiederverwendet.

Branch: `codex/controlled-cleanup-and-late-probe-20261020`.
[Entwurfs-PR #927](https://github.com/ernisch/helmut-pilot/pull/927) bleibt offen;
kein Merge, Deployment oder Production-Eingriff. Die bekannten fehlenden privaten
CI-Originalvorlagen und der getrennte Vercel-Fehler bleiben ungelöst. Gleicher
Thread, Denkstufe sehr hoch; Sprint teilweise abgeschlossen.

## Belegbindung

[Öffentliche Zusammenfassung](belege/v11-storage-hull-20261021/ROOT_SUMMARY.SAFE.json)
enthält ausschließlich freigegebene Ergebnisfelder und Prüfsummen. Vollständige
Inspectdaten, Dateimanifest, Delta, Adoptierungen und Rohbelege bleiben im privaten
lokalen Dossier `v11-storage-hull-proposal-20261021`.

- Tatsächliches Archiv: `2d667a3ab55f694ca9d4681f0b87734745e615b647fde8d14a3912fb1575a44f`.
- Unabhängige tatsächliche Abnahme: `285a32c307986a4e5dd68e7bd5a33b860627fe8f892fd49644e87867a71e52b2`.
- Konkrete, noch nicht freigegebene Option: `e45ee30a6b27a1152a805cf553923c9a08012f9ba456a1da4c1a58db7af86c46`.

Die [vorbereitete Vollpfadbeobachtung](fullpath-retention-20261021.md) und die
[belegte frühere Motorersparnis](combined-auth-memory-comparison-20261020.md)
gelten unverändert.
