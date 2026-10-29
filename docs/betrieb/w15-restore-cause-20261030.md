# W15: gezielte Ursachenabgrenzung und bestehende Mock-Quellen

PR978/cf466883 bleibt unveränderter Vorfahre mit seiner erfolgreichen Pflicht-CI40967332952
und unabhängig abgenommenem Diagnosefix. Kein Merge und keine Branchvorstellung.
Der historische Run40958135662 auf225e76d7 bleibt FAIL/worker. Die aktuelle
GitHub-Jobmetadatenprüfung bestätigt21:28:54–21:30:10UTC,76Sekunden insgesamt.
Innere Phase, RAM, Stop, Originalfortschritt und Backupfortschritt bleiben UNKNOWN.
Die gemeinsame1800s-Runnerfrist und frisch gestartete600s-Restore-/Exportfristen
können bei dieser Gesamtlaufzeit nicht regulär abgelaufen sein. Kürzere native
Statement-/Socketfristen, Ressourcenfehler, Prozessende und Fehlerüberlagerung
werden dadurch nicht ausgeschlossen. Keine konkrete dieser Ursachen ist bewiesen.

## Neue Trennprobe statt erfolgreicher Testwiederholung

Der vorhandene native Exporttest ersetzt `_restore_closure`, `_sample` und
`database_export_plan`. Deshalb war seine erfolgreiche Vier-Aktionen-Prüfung
kein Nachweis dieses vorgeschalteten Anschlusses. Die neue gezielte Probe führt
alle fünf unveränderten Node-Producer durch `restore_owned` und diese drei
unveränderten Prüfungen. Dateien, Identitäten, Journale und Hashes entstehen
wirklich; weder Quittungen noch Closure werden künstlich geliefert.
Drei neue Tests PASS; veränderte Renderdatei/Identität, falscher Container und
beendete Überwachung werden abgelehnt. Ein unabhängiger reiner Review PASS.
Die neue Suite ist im vorhandenen CI-Schritt ergänzt. Pflicht-CI dieses neuen
Prüfkopfs wird separat im zugehörigen Draft-PR dokumentiert.

Grenzen: Native PostgreSQL-Kinder und Kernelwerte sind ausdrücklich fiktiv,
Dockertransport ist ein lokaler Testadapter. Keine SQL-, Container-, OwnedWatch-,
RAM-, Restore- oder vollständige Sicherungsabnahme. Keine Datenbank/GPG/Originale
und keine erneute Vier-Aktionen-Exportprüfung. Die tatsächliche native Export-
und Snapshot-Funktionsprüfung des Vorgängers wird als bestehender Beleg übernommen.
Es ist kein weiterer Produktdefekt nachgewiesen; deshalb kein Produktfix auf Verdacht.

## Mock-Quellen gezielt, ohne erneute Inventur

Der dokumentierte Drive-Ordner wurde einmal begrenzt vollständig gelesen:
605direkte Metadateneinträge unter einer1000er-Grenze. Unter den elf exakten
Zusatznamen ist nur das bereits lokalisierte269598Byte-Builder-ZIP belegt.
Der13706128Byte-Bericht mit SHA256
d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d
hat dort weder einen Namenstreffer noch einen passenden Größentreffer.
Der ältere30Teil-Index hat nur eine Revision vom26.10. und keinen Verweis auf
ein separates Mitgliederinventar; sein Scope-Digest belegt keine Ziel-Mitgliedschaft.
Ein Filter der bereits erhaltenen Metadaten findet zu diesem Scope nur Index und
Cipherteile. Kein späteres28.10.-Qualified-Paket oder genauer Quellort bestätigt.
Der aktuelle Codex-Host lieferte binnen eines begrenzten8s-Leseaufrufs keinen
Threadindex; deshalb wurde kein erneuter Zugriff auf den unerreichbaren Pfad versucht.
Keine Payloads/Cipherteile gelesen, keine neue Inventur, keine Neuqualifikation,
keine Übertragung. Zehn Originale und ein Replacements-Pin weiter BLOCKED;
kein Hashabweichungs- oder globaler Datenverlustbeweis.
Kleinster nötiger Schritt bleibt genau der bestehende13,7MB-Bericht aus einem
erhaltenen Ursprungsbestand oder passenden Snapshot. Erst nach bestätigtem Ort
kann ein gezielter verschlüsselter Transfer mit gesondertem GO ausgeführt werden.

## PR-Abhängigkeiten und echte Freigabegrenze

PR975 bleibt225e76d7, PR977 bleibt8de90cbe, PR978 bleibtcf466883. Beide Nachfolger
haben225e76d7 als gemeinsamen Vorfahren. Die rein lesende Drei-Baum-Prüfung zeigt
keinen Textkonflikt; das ist kein Integrations-/Qualifikations-PASS. Kein Merge.
PR977 ergänzt nur die explizite225e-Endbaseline samt Negativtest; der Diagnosefix
und dieser Zusatz bleiben voneinander unabhängige Nachfolger. Ein späterer
endgültiger Mock-Kopf braucht die tatsächlich positiv abgenommene End500-Baseline
samt exakt gebundener SourceQualification und Bridge; alte Belege nicht umdeuten.

Für End500 fehlen positive vollständige Restore-/Backup-/Rücksicherungsabnahme
und danach ein separates End500-GO. Für Mock500 fehlen zusätzlich die genannten
Originalquellen/Pins, positive End500-Abnahme, finale Kopfbindungen und Mock-GO.
Dieser neue synthetische Anschlussbeleg beweist keine konkrete innere Ursache
und rechtfertigt daher keinen weiteren vollständigen Originallauf auf Verdacht.
Es wird kein neues echtes Restore-GO als startbereit vorgelegt. Ohne belastbare
Ursachenabgrenzung lässt sich ein noch kleinerer echter Testumfang derzeit nicht
sicher vom bestehenden vollständigen Restorepfad trennen. Keine Originaltests,
Modelltests, Merges, Deployments oder Production-Aktionen ausgeführt.

SAFE-Belege: [Restore](belege/w15-restore-cause-20261030/RESTORE_SEAM.SAFE.json)
und [Mock-Quellen](belege/w15-restore-cause-20261030/MOCK_SOURCE_SEARCH.SAFE.json).
