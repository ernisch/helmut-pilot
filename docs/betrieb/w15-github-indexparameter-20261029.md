# W15: verschlüsselter Index als Workflowparameter

Betreiberfreigabe vom29.10.2026: genau eine Übergabe des tatsächlich
verschlüsselten Downloadindex und begrenzter Empfang der vorhandenen15
Cipherteile. Kein erneuter Sourceexport oder Verschlüsseln der Originale,
keine neuen Schlüssel, Ressourcen oder Modellaufrufe. Der bisher geplante
Write von `HELMUT_W15_CIPHER_URL_INDEX` entfällt vollständig. Tokenrotation,
403-Wiederholung und Supportklärung sind keine Voraussetzung dieses Datenwegs.

## Eng begrenzter Kanal

Im bestehenden manuellen `ci.yml`-Modus `end500-receive-inputs` kommt ausschließlich
`w15_cipher_index` hinzu: ASCII-armierter GPG-Ciphertext für den vorhandenen
Empfänger`7E3998A6C2CB948C69A2EE51F4267ABF26796EDC`. Dieser Wert darf öffentlich
einsehbar sein. Klartextadressen, Passphrase und private Schlüssel gehören
niemals in Workflowparameter oder Kommandoargumente.

`encrypted_index.encrypt_index` verwendet ausschließlich das bereits gepinnte
öffentliche Schlüsseldokument, dessen unveränderten SHA256 und den bestehenden
Fingerprintprüfer/GPG. Kein eigenes Kryptoverfahren, keine Schlüsselerzeugung.
GPG erhält den privaten Index über stdin. Es entstehen ausschließlich private
lokale Dateien; die Workflowübergabe enthält nur den Ciphertext.

`dispatch_payload` prüft sämtliche tatsächlichen Eingabewerte, deren gesamtes
JSON-Objekt und zusätzlich die komplette serialisierte Dispatch-Anfrage gegen
65.535Zeichen. ASCII-Ciphertext und JSON-Escaping sind eingeschlossen. Bei
Überschreitung stoppen; keine öffentliche Dateiablage und kein Klartextfallback.

Der Workflow übernimmt den Wert ausschließlich als Umgebungsvariable, ohne
Shellinterpolation. Branch, ausgecheckter Commit und Versuch1 bleiben gebunden.
Vor privaten Kindern wird zusätzlich die tatsächliche `workflow_dispatch`-
Eventdatei mit genau Modus, geprüftem Commit und Ciphertextparameter verglichen.
Neue Modul- und Workflowbytes sind an die rohen Git-Blobs des Commits gebunden.

Nur im bestehenden Environment `helmut-ci-originals` werden die zwei bereits
funktionierenden Empfängersecrets verwendet. Sie bleiben unverändert. Alle drei
Prozesswerte werden vor GPG entfernt; Kinder erhalten eine feste secretfreie
Umgebung. Der importierte bestehende private Schlüssel wird ausschließlich für
die notwendige Entschlüsselung verwendet, keine Wiederholung des Kontrolltexts.

Der entschlüsselte Index entsteht exklusiv0600 im0700-Privatbaum, nie in stdout.
Die GPG-Ausgabe geht direkt in eine reguläre Datei und ist im Kind physisch auf
49.151Bytes begrenzt; Timeout30s, keine Core-Dumps. Erfolg verlangt Exit0,
richtigen entschlüsselnden Primary, `DECRYPTION_OKAY` und `GOODMDC`. Erst danach
liest der vorhandene Index-/Empfangscode den Klartext. Private GPG-Status-/Logs
und fehlgeschlagene Teilprodukte bleiben lokal, ohne Upload oder Löschung.

## Unveränderte Empfangsprüfung

Der Index bindet den neuen Consumercommit; innerer Sourcecommit und alter
Transferkontext bleiben unverändert. Die15 bereits vorhandenen Driveobjekte
wurden über den unveränderten17136-Byte-Transferbeleg identifiziert und ihre
Metadaten frisch gelesen: nur Eigentümerberechtigung, erwartete Größen und
MIME-Typ. Keine Originale hierfür neu übertragen.

Frische Links erst unmittelbar nach grüner Pflicht-CI und unabhängiger Prüfung
erzeugen. Tatsächliche Linkabläufe bestimmen den frühesten Indexablauf; die
vorhandene späteste30-Minuten-Schranke wird dadurch nicht verlängert. Vor
Dispatch und jedem Download bleibt die echte Restgültigkeit Pflicht. Reihenfolge,
HTTPS-Hostbindung, keine Redirects/Retry,15 Größen/Hashes, Gesamthash,
authentifiziertes Manifest und alle zwölf Originalpins bleiben unverändert.

Nur `PASS_EXISTING12_RECEIVED_AND_RELOCATED_ONLY_START_BLOCKED` mit12Dateien/
242570240Bytes ist Empfangserfolg. Ein Dispatch oder grüner Startschritt reicht
nicht. Kein Controller, DB-Start, End500 oder Mock500. RAM- und Fachvertrag bleiben
unverändert. Der neue Sender darf nur einmal dispatchen; unklarer API-Ausgang
oder fehlgeschlagener Empfang erteilt kein Wiederholungsrecht.

## Prüfung und Rückweg

Zehn neue gezielte synthetische Prüfungen bestanden: tatsächlicher Public-Key-
Encrypt nur eines erfundenen Index ohne neuen Schlüssel, Parameter-/Eventgrenzen,
physische Ausgabebegrenzung mit erfundenem Kind, GPG-Statusannahme und Anschluss
an den bestehenden gemockten15-/12-Empfänger. Unabhängiger statischer ReviewPASS.
Keine erneute tatsächliche Empfängerkontrolle. Neue Pflicht-CI auf dem finalen
Commit bleibt vor der tatsächlichen Übergabe erforderlich.

Rückweg: diesen neuen Empfangspfad nicht weiter verwenden. Bestehende
Environmentsecrets, Drive-Cipherteile, Originale und private Teilprodukte
unverändert erhalten; keine automatische Löschung. Kein Merge, Deployment oder
Production-Eingriff. Der tatsächliche Empfang wird erst nach dem Lauf separat
mit Workflow, Commit, Versuch und vollständigem Zwölfdateienbefund dokumentiert.
