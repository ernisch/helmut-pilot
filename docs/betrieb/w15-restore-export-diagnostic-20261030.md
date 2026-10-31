# W15: begrenzte Restore-/Exportdiagnose vorbereiten

Der historische Originallauf40958135662 bleibt innerlich UNKNOWN. Die bereits
erfolgreiche native synthetische Minimalprobe wird übernommen. Sie ersetzt
keine Diagnose mit den vorhandenen Originaleingängen. Dieser neue Ablauf ist
eine separat gesperrte Eingrenzung der noch unbekannten Exportstelle und keine
Wiederholung des vollständigen Restore-/Sicherungs-/Rücksicherungsversuchs.

## Enger ausführbarer Umfang

Manueller Modus`end500-restore-export-diagnostic`, unverändertes Environment
`helmut-ci-originals` und erlaubter Branch
`codex/w15-github-end500-preparation-20261028`. Der konkrete neue Codekopf,
Pflicht-CI, unabhängiger Review und statische SourceQualification müssen vor
einem späteren ausdrücklich begrenzten GO übereinstimmen.

Der vorhandene gemeinsame Runner empfängt die15bestehenden Cipherteile und
prüft die zwölf End500-Originaldateien. Er verwendet ausschließlich vorhandene
Empfängersecrets und die bestehende isolierte PostgreSQL-/Image-Anbindung.
Genau fünf vorhandene Restoreaktionen stellen500Profile/0aktiv her.
Anschließend laufen nur die vier vorhandenen Exportaktionen:
`backup-before`, `backup-dump`, `backup-roles`, `backup-after`.
Die vorhandene vollständige Vorher-/Nachher-Inventarprüfung bleibt erhalten.

Keine Freeze-/Sammel-/Versiegelungs-/Uploadphase, kein Fernrückdownload,
keine zweite Rücksicherung, kein End500-/Mock500-Controller. Der Diagnosemodus
akzeptiert keine Artefaktzugangsdaten. Alle privaten Eingänge, Dump-, Rollen-
und Inventardateien verbleiben im privaten gemeinsamen Runner; kein Klartext
oder privater Fehlertext in Logs, Ausgaben, Artefakten oder Caches.

## Unveränderte Schutzgrenzen

Maximal1800s im gemeinsamen begrenzten Parent. RAM-v3 hart2560000000Bytes,
gemeinsamer tatsächlicher Peak höchstens2048000000Bytes,
Reserve mindestens512000000Bytes, Swap0. Der konservative vollständige
Plattenplan wird unverändert verwendet. Bestehender Standardrunner,
0Modell-/Provideraufrufe und0USD zusätzliche externe Speicherung.
Frischer exakter GO-Commit, UUID4-Nonce, Versuch1, maxReceiveAttempts1,
getrennte Scope`ISOLATED_GITHUB_RESTORE_EXPORT_DIAGNOSTIC_ONLY`,
maxStorageUSD`0`, gültiges höchstens zweistündiges Startfenster.
Alle vier echten Workflowinputs und der vollständige verschlüsselte
Dispatch müssen jeweils in65535Zeichen passen. Frische tatsächliche Links
erst nach abgeschlossener externer Startvorbereitung erzeugen.

## Diagnose und Abnahme

Die erste feste Restoreaktion (create/roles/render/apply/check) oder
Exportaktion bleibt durch Connection,
Worker, Supervisor, IPC und JavaScript-Ausgabe erhalten. Ein beobachteter
Exportaktionsname wird als`connection-export-backup-before`,
`connection-export-backup-dump`, `connection-export-backup-roles` oder
`connection-export-backup-after` ausgegeben. Keine Aktionszuweisung, wenn der
Fehler erst außerhalb einer tatsächlich beobachteten Aktion auftritt.
Vorhandene numerische Ressourcenwerte bleiben über den bestehenden Cache
erhalten; unbekannte Werte werden nicht ergänzt. Der äußere Runner meldet
seine tatsächlich beobachteten Prozess-/IPC-/Parent-Bereinigungszustände.

PASS bedeutet ausschließlich12geprüfte Eingänge, fünf Restoreaktionen500/0,
vier vollständig geprüfte Exportaktionen sowie bestätigten eigenen Container-
und Watch-Stopp. Sein Status lautet
`PASS_RESTORE_EXPORT_DIAGNOSTIC_ONLY_FULL_RESTORE_BLOCKED`.
Backup-Rundlauf, vollständige Restoreabnahme, End500 und Mock500 bleiben false.
Dieser Bericht wird von den vollständigen Folgestufen nicht als Abnahme
akzeptiert. Ein positiver Befund lokalisiert die verbleibende Grenze vor dem
weiteren Sicherungsweg; er ersetzt dessen spätere getrennte Abnahme nicht.

Bei FAIL/UNKNOWN sofort stoppen, erste Phase und vorhandene Ressourcenbelege
erhalten, kein Retry. Nur eindeutig eigene Prozesse/Container stoppen und
Stillstand prüfen. Rückweg: Diagnosepfad nicht weiter verwenden; vorhandene
Secrets, Drive-Dateien und Originale unverändert erhalten, keine automatische
Löschung. Keine echte Ausführung dieses neuen Pfads ohne separates GO.

Vorbereitung: gezielte fiktive Aufnahme-/Connection-/Export-/IPC-/Ausgabetests;
keine Original-, native DB- oder500er-Ausführung in diesem Entwicklungsauftrag.

Der versionierte15-Link-Sender `restore_diagnostic_dispatch.py` mit
`restore_diagnostic_dispatch.exec.js` prüft alle Metadaten/Codequalifikation/CI/
Review/Branchübernahme vor READY. Erst dann genau ein frischer Link pro
bestehendem Cipherteil, parallel höchstens3, geordnet an den wartenden Sender.
Reale früheste SAS-Ablaufzeit>90s wird nach Verschlüsselung und nach
Versuchsmarker-fsync direkt vor dem einzigen POST geprüft. Kein Sourceprobe-
Download/Refresh/Retry. Die vorhandene SAFE-Drivequittung17136Bytes wurde
metadatenrein verifiziert; 15Source-IDs/Pins sind als öffentliche Projektion
versioniert. Keine Originalcipherteile in dieser Vorbereitung abgerufen.

Vor dem nächsten GO wurden zusätzlich alle15exakten Drive-Objekte gezielt
metadatenrein auf Zugänglichkeit, Namen, Größen, erwarteten privaten Ordner
und ausschließlich Ownerrechte geprüft: PASS. Kein Cipher-/Originalabruf,
keine erneute Hashprüfung der Cipherpayloads und keine frischen Links dabei.
