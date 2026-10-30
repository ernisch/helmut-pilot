# Mock500: privater Indexproduzent ohne Startberechtigung

Die reine Bibliothek`mock500_index_builder.build_index` verbindet später
bereits vorliegende frische Downloadlinks mit der extern geprüften kanonischen
Eingabebindung des tatsächlichen Mock-Codekopfs. Sie ruft weder Drive noch
GitHub, GPG, eine Datenbank oder einen Controller auf und hat keine CLI.
Sie erzeugt kein GO, keine Lauf-ID, Qualifikation oder End500-Abnahme.

Eingabe sind exakt16geordnete`{sourceCode,url}`-Zeilen:
`end500.gpg.part-001` bis`end500.gpg.part-015`, anschließend
`HELMUT_MOCK500_ORIGINALS_20261030.tar.gz.gpg`. Alle Links müssen dem bestehenden
HTTPS-/SAS-Vertrag entsprechen: nur Lesen, einzelnes Blob, keine IP-Bindung,
keine doppelten Parameter oder Quellen. Auch verschiedene Signaturen derselben
Blobadresse ersetzen nicht zwei unterschiedliche Quellen.
Jede tatsächliche SAS-Ablaufzeit muss beim Aufbau mehr als90s entfernt sein.
Gemeinsames Indexende ist höchstens der früheste tatsächliche Ablauf und
höchstens30Minuten nach dem beobachteten Aufbauzeitpunkt; keine Fristverlängerung.

Der Index verwendet ausschließlich das bestehende neue gzip-Archivformat.
Die ursprünglichen15Teile bleiben im vorhandenen geschachtelten Originalindex.
Der zusätzliche Descriptor bindet den bestehenden Drive-Archivbezeichner,
Cipher-/Manifestpins und217563454zusätzliche Originalbytes.
Der unveränderte Empfänger`mock500_receive.checked_index` prüft den vollständigen
Index einschließlich aller elf Zusatzpins, Originalempfangspin und16+2-Quellenbindung.
Die bestehende500/500-Quellenqualifikation wird nicht erneut ausgeführt.

Rückgabe:`index_raw` ist **privat** und enthält die Downloadfähigkeiten.
Es darf nur in den bestehenden GPG-Indexencoder gelangen, niemals in Logs,
Klartext-Workflowparameter, Artefakte oder Caches. Nur`safe_plan` darf öffentlich
ausgewertet werden. Sein PASS belegt ausschließlich den gebundenen Indexaufbau;
Mock-Startbereitschaft und jede Ausführungs-/Abnahmeberechtigung bleiben false.

Ein vollständiger Mock-Startknopf wird dadurch nicht eingeführt. Weiterhin
fehlen vor einer späteren Ausführung die tatsächliche positive End500-Abnahme,
Bridge, qualifizierter endgültiger Mockkopf und separates konkretes Mock-GO.
Der spätere Sender muss nach der Verschlüsselung alle tatsächlichen Parameter
gegen65535Zeichen und unmittelbar vor dem einmaligen Dispatch erneut alle
Linkablaufzeiten prüfen. RAM-v2, Tages-/Zeitvertrag, gemeinsamer Empfang und
Sicherungs-/Abbruchanschlüsse bleiben unverändert.

Entwicklung und gezielte Tests verwenden nur fiktive SAS-Adressen und öffentliche
Pin-Metadaten. Keine Originalbytes gelesen, keine Übertragung oder Ausführung.
