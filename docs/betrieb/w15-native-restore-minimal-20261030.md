# Echter synthetischer Restore-Minimalanschluss

Betreiberauftrag30.10.: Den unbekannten inneren Fehler mit einem echten kleinen
durchgehenden PostgreSQL-Test eingrenzen, ohne Originale oder500er-Controllerlauf.
PR978/cf466883 und PR979/53dde52a bleiben unveränderte Vorfahren; PR975/977 bleiben
unangetastet. Run40958135662 bleibt FAIL/worker, innere Ursache UNKNOWN.

## Umfang und einmalige Ausführung

Nur der neue Entwicklungszweig startet den neuen Schritt im bestehenden CI-Job.
Die Standard-Pflicht-CI bleibt erhalten. Der Test verweigert RunAttempt!=1 und
ist ohne ausdrückliches Argument gesperrt. Kein manueller Workflowdispatch,
kein geschütztes Environment und keine Empfängersecrets. Keine neuen Ressourcen
außer den vorhandenen kurzlebigen CI-Testcontainern und dem vorhandenen Slice.

Der unveränderte gemeinsame Parent begrenzt Python-Supervisor, UID1000-Worker,
Dockerclients, PostgreSQL und GPG gemeinsam. Limit2560000000Bytes,
Peak≤2048000000Bytes, Reserve≥512000000Bytes, Swap0, keine Peakzurücksetzung.
Maximal300s gemeinsamer Test, Container ohne Netzwerk/Restart, gepinntes bereits
verwendetes PostgreSQL17.6-Image. Werkzeugbereitstellung erfolgt wie bisher vor
dem gemessenen Lauf. Keine zusätzliche Artefaktspeicherung,0USD neue Speicherung,
0Modellaufrufe,0Profilaktivierungen. Der Auftrag autorisiert nur diese Synthetik.

Die vorhandene kleine SQL-Fixture enthält500 einfache id/aktiv-Zeilen, vier
Duplikat/NULL/Unicode-Zeilen und eine Sequenz. Kein AuthCAS, Usage, Unit, Provider,
Postimage- oder End500-/Mock500-Controllerlauf. Die500/0-Vertragsprüfungen bleiben
unverändert, statt sie für zwei Fixturezeilen zu lockern.

Echte Kette: eigener Source-Dump → fünf unveränderte Restoreaktionen mit echtem
Watch/OwnedBackupRunner → vier unveränderte Exportaktionen samt vollständigem
Tabellen-/Sequenzinventar → tatsächlicher Containerstillstand/Watchabschluss →
deklarierte synthetische Fünf-Dateien-Auswahl → bestehender Sealer mit dem
fingerprintgebundenen öffentlichen Empfänger → lokales Cipherhash-Rücklesen →
unveränderte zweite isolierte Wiederherstellung samt Inventar-/Rollenvergleich.

Die Auswahl enthält ausschließlich synthetischen Dump/Rollen/Inventar und die
vorhandenen öffentlichen Recoverywerkzeuge. Sie ersetzt weder die zwölf
Originalpins noch collect_restore_backup. Die zweite Wiederherstellung liest
die physisch hashgeprüfte synthetische Auswahl; ohne privaten Schlüssel wird
KEINE Entschlüsselung oder authentifizierte Fernrücklesung behauptet. Kein Upload
von Originalen oder synthetischen Daten. Vollbackup-, Original-, End500-, Mock500-
und gemeinsame Original-Lebenszeitabnahme bleiben ausdrücklich false.

## Fehler und Rückweg

Erster Fehler stoppt die Kette. Geschlossenes FAIL-IPC vor dem nächsten Guard;
erste konkrete native Aktion, tatsächlicher Exit/Signal falls im Journal,
fest begrenzte Kategorien statt freier Fehlertexte. Vorhandene Parentdiagnosen
und echte aktuelle/cached RAM-Belege bleiben getrennt, Unbekanntes UNKNOWN.
Keine SQL-Ausgabe, Passphrase, Schlüssel oder Zugangsdaten in Logs/Artefakten.

Nur eigene eindeutig gebundene Supervisorservice und Container stoppen, ihren
tatsächlichen Stillstand und anschließend den inodegebundenen leeren Parent
prüfen. Parent nur nach positiver Leere entfernen. Keine Fremdprozesse und keine
Original-/Drive-/Secretänderung. Keine automatischen Wiederholungen. Bei erneut
nicht eingrenzendem Ergebnis keine weitere gleichartige Probe; stattdessen
konkreten verbleibenden Diagnoseentscheid benennen. Kein neues Original-GO auf
Verdacht. Der reale Test und seine Pflicht-CI werden am exakten Kopf im Draft-PR
dokumentiert; dieser Vorbereitungsstand behauptet noch keinen nativen PASS.

Unabhängiger Vorstartreview fand und korrigierte ausschließlich Fixturefehler
(Journalereignis, Zwischenverzeichnisrechte, echtes FAIL-Paket, eigene Service-
beendigung und Erhalt der Parentfehlerphase). Kein Produktfix auf Verdacht.

Mock-Dateien: kein neuer konkreter Quellenhinweis seit der belegten Suche in
PR979. Deshalb keine erneute Inventur/Drive-Suche.13.706.128Byte-Qualifikations-
bericht und weitere bestehende Originalbindungen bleiben BLOCKED; kein globaler
Datenverlustbeweis und keine Neuqualifikation oder Übertragung.
