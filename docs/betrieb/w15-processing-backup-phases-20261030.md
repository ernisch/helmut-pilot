# W15: Verarbeitung und nachgelagerte Sicherung

Vertrag `helmut-w15-processing-backup-phases/1` beschreibt die genehmigte
Entwicklung einer getrennten Ressourcenabnahme. Er erteilt keine Original-,
End500-, Mock500-, Merge-, Deployment- oder Production-Freigabe.

Die neuen Modi sind `end500-full-phased-gated` mit Profil
`helmut-w15-end500-processing-backup/4` und `mock500-full-phased-gated` mit Profil
`helmut-w15-mock500-processing-backup/3`. Alte Modi und Abnahmeschemata bleiben erhalten.

## Verarbeitung und bestätigte Grenze

| Verarbeitung bis einschließlich Export und bestätigtem Stopp | Hartlimit Bytes | Peak höchstens Bytes | Reserve Bytes |
|---|---:|---:|---:|
| End500 | 2560000000 | 2048000000 | 512000000 |
| Mock500 | 2048000000 | 1638400000 | 409600000 |

Empfang, initialer Restore, vollständige Ergebnis- und Sicherheitsprüfung,
Rückführung auf null aktive Profile, Exporte und tatsächlicher Prozessstopp
bleiben in diesem Fenster. Die bisherigen stufenspezifischen Zeit-, Platten-,
Kosten-, Quellen- und Integritätsgrenzen gelten weiter.

Erst nach bestätigtem Abschluss darf der bestehende privilegierte Supervisor
am selben Kernelparent einmalig das Sicherungslimit 4999999488 Bytes setzen,
mit mindestens 2147483648 Bytes Hostreserve. Private Kontrollnachricht und
Bestätigung binden Freigabe, Codekopf, Versuch und Parentidentität. Ungültige
oder wiederholte Übergänge scheitern. Ein vorheriger Fehler bleibt gesperrt.
Es gibt keinen Rückweg zur Verarbeitung, Cacheabzug oder Peakreset; der gesamte
Kernel-Lebenszeitpeak bleibt sichtbar.

## Sicherung und Abnahme

Vollständige Auswahl, Verschlüsselung, entfernte authentifizierte Rücklesung,
zweite frische isolierte Rücksicherung und Integritätsvergleich bleiben Pflicht.
Jede neue Teststufe muss ihre eigenen neuen Ergebnisse sichern. Vorhandene
Funktionsbelege ersetzen keinen noch fehlenden Verarbeitungs-RAM-Nachweis.

`processingMemoryChecksCompleted` und `backupSafetyChecksCompleted` dokumentieren
Laufprüfungen. Sie erteilen keine unabhängige Endabnahme. Die alte gemeinsame
RAM-Abnahme sowie End500-/Mock500-Abnahme und Ausführungsrecht bleiben im
Runtimebeleg false. Der bekannte Mock-Verarbeitungsblocker bleibt unabhängig offen.

Der Sender prüft freigegebene Funktionsbelege und die unabhängige Prüfung der
konkreten Quelländerungen lokal über einen geschützten Belegdateipfad, bevor
frische Links bereitgestellt werden dürfen. Private Quittungen, Originale,
Downloadlinks und Zugangsdaten werden dabei nicht veröffentlicht. Das neue
Mock-Starttor verlangt eine tatsächlich positive unabhängige End500-Abnahme,
die geprüfte Kopfbindung und ein eigenes konkretes GO.

Gezielte synthetische Gegenproben prüfen die Einweggrenze, frühere Fehler,
Identitäts- und Deadlineabweichungen, unveränderte Peakzähler, private
Kontrollkommunikation und weiterhin gesperrte historische Fehlerfälle.
Pflicht-CI und unabhängiger Review müssen den tatsächlichen Codekopf binden.
