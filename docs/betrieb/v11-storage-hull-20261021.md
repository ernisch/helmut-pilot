# V11-Storage-Hülle gesichert und nach Freigabe entfernt

Stand: 21.10.2026 UTC. Nach der konkreten Nutzerfreigabe wurde ausschließlich die
zuvor gesicherte, gestoppte V11-Storage-Hülle
`66d3bb789888a4c87cc3cdcdd49d6938d0c211189f13f4d8fbc096fbd5447b02` entfernt.
Die unabhängige Quellenabnahme, Syntax-/Hilfsqualifizierung und eine neue,
einmalige Rootadoption gingen der Ausführung voraus. Der einzige `docker rm`
endete mit 0, vollständigem stdout/stderr-EOF und genau der erwarteten ID.
Force, Volumeentfernung und automatische Wiederholung waren ausgeschlossen.

## Tatsächliche Kapazität

| Messpunkt | Persistente Bytes |
| --- | ---: |
| Vor dem Eingriff | 14.947.405.824 |
| Nach Eingriff und Abschlussprüfungen | 15.858.814.976 |
| Beobachteter Nettoanstieg | 911.409.152 |
| Unveränderte vollständige Plattenadmission | 15.179.779.720 |
| Späterer unabhängiger Live-Abgleich einschließlich neuer Belege | 15.858.626.560 |
| Abstand zur Admission beim Live-Abgleich | 678.846.840 |

Damit ist der zuvor bestehende Plattenfehlbetrag im gemessenen Snapshot behoben.
Die unabhängige tatsächliche Endabnahme und der separate Live-Abgleich bestehen.
Die verfügbare Kapazität ist keine Reservierung. Die Differenz stammt aus echten
`f_bavail * f_frsize`-Messungen auf dem persistenten Dateisystem einschließlich
anfallender Belegschreibvorgänge; sie wird nicht aus einer logischen Dockergröße
abgeleitet und beweist keine exakte Zuordnung jedes freigewordenen Blocks.

Die Quellenprüfung bestätigt dieselbe Admission mit 2 GiB neuer Speicherdatei,
8 GiB freier Hostreserve, vier vollen und zwei nativen Hilfscontainerbudgets
sowie 512 MiB Ausgabebudget. Kein Budgetterm und keine Reserve wurden reduziert.
Ein späterer Start muss den freien Platz erneut frisch prüfen.

## Erhaltene Originalbindungen

Genau die freigegebene ID darf in den Vorher-/Nachher-Containersets fehlen.
Die vier übrigen Originalcontainer bleiben mit Identität, Zustand, PID und
vollständigen Mountbindungen erhalten; die Originalbank läuft mit PID 5993.
Images, alle benannten und anonymen Volumes, die fünf externen Mountquellen,
`image.raw` und sämtliche Loopbindungen bleiben geschützt. Die kanonischen
Verzeichnismetadaten und das Fehlen einer `postmaster.pid` wurden erneut geprüft.
Es gab keine Lektüre der Originaldatenbankinhalte für diesen Metadatenvergleich.

Elf Sicherungsausgaben und sechs ursprüngliche Eingabepins wurden vor und nach
dem Eingriff geprüft. Alte KEEP-, Inspect-, Proposal- und Archivberichte bleiben
unveränderte historische Belege; die spätere Nutzerfreigabe hebt ausschließlich
die frühere KEEP-Bindung für diese eine Hülle auf. Ihr ursprünglicher Docker-CID,
Created-Wert und ihre Daemonhistorie sind nicht identisch wiederherstellbar.
Die übrigen Originale, 17 abhängigen Archive, 616 geschützten Hilfsdateien, Git,
Fehlerbelege und aktuellen Arbeitsstände bleiben erhalten. Keine weitere
Bereinigung wurde durchgeführt.

## Bereits abgenommene Sicherung

Vor der Freigabe wurden zwei vollständige Rootfs-Exporte mit je 438.837.248 Bytes
verglichen. Beide endeten mit 0/EOF ohne stderr; die aufgezeichneten Streamhashes
stimmen überein. Vollständige Export-Tars wurden nicht auf Platte materialisiert.
Das gespeicherte Manifest enthält 10.239 Einträge. Die unabhängige Prüfung
rekonstruierte es exakt aus dem erhaltenen Basisimage-Manifest, einem entfernten
Basispfad und den Metadaten. Sie prüfte den 10.240-Byte-Deltatar zusätzlich mit
einem eigenen Headerdecoder: sieben reguläre Dateien, jeweils ohne Nutzdaten.
Die 10.239 Metadaten-Overlayeinträge entstehen auch durch neue `uname`/`gname`-
Felder und bedeuten keine 10.239 geänderten Dateiinhalte.

Die ursprüngliche Sicherung belegte am Ausführungsende 7.778.304 Bytes. Das gesamte
neue Dossier einschließlich Entfernung und Abnahme bleibt auf 64 MiB begrenzt.
Die Sicherung ist die Docker-Rootfs-Exportdarstellung mit Inspect-/Logbelegen,
abhängig vom erhaltenen Basisimage. Mountinhalte und die vollständige V11-
Datenbank sind separat erhalten und werden nicht als Bestandteil dieses Backups
behauptet. Beliebige nicht verfügbare ACL-/xattr-Metadaten, Inodes und ctime
werden nicht als wiederherstellbar behauptet.

## Motor und nächste Startgrenze

Der Motorcode bleibt gegenüber `80d750c7859fea95ac5901afe7bf8d172c5624a3`
unverändert. Die zuvor belegte kombinierte Motorersparnis beträgt weiterhin
154.886.144 Bytes im vergleichbaren Komponentenablauf. Die Plattenbereinigung
beweist keine RAM-Ersparnis. Das vollständige Ziel von maximal 1.548.000.000 Bytes
gemeinsamem Verbrauch, ein belastbares Plateau und 500.000.000 Bytes RAM-Puffer
für exakt 500 aktive Profile sind weiter offen.

Vier aktive Vollstartgates verlangen weiterhin alte DeepSeek-Reviewformate.
Ein konsistent versionierter lokaler SOL-Annahmepfad ist nur vorgeschlagen.
Routerkonfiguration und historische Belege wurden nicht verändert; tatsächliche
Modellprovenienz wird nicht durch Selbstaussagen oder umbenannte Altbelege ersetzt.
Im geprüften aktuellen Startpfad bindet die Originalquelle die erhaltene Bank;
ein neuer Ressourcenlauf erzeugt einen eigenen Storage-Container. Eine künftige
finale Startclosure ist durch diese Entfernung nicht abgenommen.

Die konkrete Freigabe gilt ausschließlich für die beschriebene Entfernung.
Kein Ressourcenlauf wurde gestartet. Vor einem Volltest bleiben alle 32 frischen
Bedingungen, vollständige Admission, gültige Fall-/Zeitbindung und ein neues
konkretes GO erforderlich. Alte GOs werden nicht wiederverwendet. Kein Merge,
Deployment, Production-Eingriff, neues bezahltes Angebot oder Budgetwechsel.
Keine bisherigen Motor- oder Ressourcentests wurden wiederholt.

Branch: `codex/controlled-cleanup-and-late-probe-20261020`.
[Entwurfs-PR #927](https://github.com/ernisch/helmut-pilot/pull/927) bleibt offen.
Die fehlenden privaten CI-Originalvorlagen und die getrennte Vercel-Konfiguration
bleiben gesonderte offene Probleme. Lokale Dokumentationsprüfungen ersetzen
keine Motor- oder Ressourcenabnahme. Gleicher Thread, Denkstufe sehr hoch;
der gesamte RAM-Sprint bleibt teilweise abgeschlossen.

## Belege

[Entfernungs- und Kapazitätszusammenfassung](belege/v11-storage-hull-20261021/ROOT_RETIREMENT_SUMMARY.SAFE.json)
und [historische Sicherungszusammenfassung](belege/v11-storage-hull-20261021/ROOT_SUMMARY.SAFE.json)
enthalten nur Ergebnisfelder und Prüfsummen. Vollständige Inspectdaten,
Dateimanifest, Delta, Autorisierungen und Rohbelege bleiben im privaten lokalen
Dossier `v11-storage-hull-proposal-20261021`. Die tatsächliche unabhängige
Entfernungsabnahme und der frische Kapazitäts-/Bindungsabgleich werden in der
Entfernungszusammenfassung gebunden.

- Tatsächliche Entfernung: `3206735f54b4d74e7c40c2dac906943f4e1c34f81a9aba21177aed7c3414a80b`.
- Retirer-Quellenabnahme: `7262fcb4d2cae6c5f18925b4f0a7cfa2abd57fd80ffcc6b4516137dcd6e75f2b`.
- Unabhängige Entfernungsabnahme: `cc64b52b046c2cc8d3e29319ac8a54e62a1f952c46df302ddc81b005a0c478ef`.
- Frischer Kapazitäts-/Bindungsabgleich: `f9ebccbc17a8194b7a9fd266f9286cf7666895d50a3d48fd925648198e67ca62`.
- Tatsächliches Archiv: `2d667a3ab55f694ca9d4681f0b87734745e615b647fde8d14a3912fb1575a44f`.
- Unabhängige Archivabnahme: `285a32c307986a4e5dd68e7bd5a33b860627fe8f892fd49644e87867a71e52b2`.

Die [vorbereitete Vollpfadbeobachtung](fullpath-retention-20261021.md) und die
[belegte frühere Motorersparnis](combined-auth-memory-comparison-20261020.md)
gelten unverändert.
