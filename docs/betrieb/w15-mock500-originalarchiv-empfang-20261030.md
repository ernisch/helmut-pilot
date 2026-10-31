# Mock500: bestehendes Originalarchiv über geschützten GitHub-Empfänger

Stand30.10.2026. Vorbereitung, **keine tatsächliche Datenannahme**. Entwicklung
auf Nachfolgebranch von PR981; dessen geprüfter Kopf69f37c4d und PR975/977/978/
979/980 bleiben erhalten. Exakter neuer Kopf, Pflicht-CI und unabhängige Abnahme
stehen im zugehörigen Draft-PR. Keine echte Übertragung/Entschlüsselung.

## Fest gebundene vorhandene Quelle

Betreiberübergabe: Drive-ID`1koFG3XkeJr82wVNmMZwu94wgFFtBklor`, Ordner
`1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd`, Name
`HELMUT_MOCK500_ORIGINALS_20261030.tar.gz.gpg`. Bereits gelesene Drive-Metadaten
bestätigen Größe17780398Bytes und nur einen Owner-Berechtigungseintrag.
Cipher-SHA256`f8447b6fdde4c2c4fa76a8322999bd844f0c4445ee6077b29e3d29f93359f414`
ist hier **Betreiberpin, noch keine lokale/GitHub-Rückleseprüfung**.
GPG-Empfänger unverändert`7E3998A6C2CB948C69A2EE51F4267ABF26796EDC`.

GPG enthält genau einen gzip-USTAR-Strom. Genau12reguläre Archiveinträge:
elf Originale217563454Bytes und MANIFEST.json6144Bytes mit SHA256
`e07e4169abe3f41400900ff45e6f98d3dd18ee4ae5585f95e7fdcec98f960d7a`.
Alle ursprünglichen Namen/Größen/Hashes sind im
[`mock500_original_archive.py`](../../scripts/w15-github/mock500_original_archive.py)
fest gebunden. Der vormals unbekannte Replacements-Pin ist nun übergeben:
12969Bytes/SHA256`52ee2e82102434917d976ed248cdb772083d071be97e5465af4ae7b96368be29`.
Er ist vor echter Annahme weiterhin **nicht lokal bestätigt**.

## Kleinster Empfangsanschluss

Neue explizite manuelle CI-Auswahl`mock500-receive-originals`, bestehendes
Environment`helmut-ci-originals`, nur contents:read, Checkout des tatsächlichen
Runcommits ohne gespeicherte Git-Anmeldung. Ausschließlich bestehende Secrets
`HELMUT_W15_RECEIVER_PROTECTED_KEY_B64` und`HELMUT_W15_RECEIVER_PASSPHRASE`.
Keine neuen Secrets/Kopien nach Codex, Schlüssel oder Drive-Anmeldedaten.

Die CLI`mock500_archive_receive.py --receive-mock-originals-only` verlangt
Commit-/Branch-/Run-/Versuch1- und tatsächliche Eventbindung vor Secretzugriff,
unabhängiges ausdrücklich autorisiertes Empfangs-GO mit frischem UUID4-Nonce,
maxReceiveAttempts1/maximumWallSeconds600, maximal zweistündiges Startfenster.
Alle Empfänger-Helfer werden gegen die unveränderlichen Commitblobs geprüft.
Inputs gehen ausschließlich über Environmentwerte; keine Shellinterpolation.

Vier Workflowinputs wie bisher: Modus, exakter Commit, öffentliche begrenzte
GO-Deklaration und ausschließlich GPG-verschlüsselter Downloadindex.
Schema`helmut-w15-mock500-original-archive-url-index/1` bindet Commit/Nonce,
createdAtUTC/expiresAtUTC sowie den festen Archivdescriptor mit genau
format/driveId/cipherBytes/cipherSHA256/manifestSHA256/url. Format ist explizit
`gpg-gzip-ustar-mock-originals/1`. URL bleibt ausschließlich im Cipherindex.
Summe aller Inputzeichen **und** serialisierte tatsächliche Inputs/Dispatch
müssen jeweils≤65535 sein. Ein synthetischer Größencheck ersetzt diese spätere
Prüfung am tatsächlichen Cipherindex nicht.

Indexalter/Lebensdauer höchstens30Minuten; bei jedem Downloadschritt echter
Ablauf geprüft. Ein GET ohne Redirect/Retry/Resume, TLS/Proxy unverändert,
read1/1MiB,300s Downloadbudget/60s Socketfenster. Einmaliger17.8MB-Objektbound
gilt ausschließlich für das neue Format; alter16MiB-Teilbound unverändert.
Cipher vor Entschlüsselung vollständig gehasht und zurückgelesen. GPG-Primary,
DECRYPTION_KEY, GOODMDC, DECRYPTION_OKAY, Exit0 und Ende des eigenen Prozesses
werden verlangt. GPG-Kind180s, Empfangs-CLI600s mit Signalbehandlung,
äußerer Job15Minuten einschließlich Checkout und Fehlerabschluss.

Der gzip-Decoder prüft CRC/Trailer/EOF und lehnt zweite gzip-Member/Restbytes
ab. Physische USTAR-Header statt ungeprüfter tarfile-Extraktion: keine absoluten
Pfade, Traversal, Links, Duplikate, Verzeichnisse, PAX/GNU-Zusätze oder Extras.
Dateien ausschließlich exklusiv0600 in neuem0700-Baum, kein Überschreiben.
Manifest wird gegen seine **exakten Originalbytes** gehasht; sein unbekanntes
Schema wird nicht erfunden, Herkunftspfade wählen keine Ausgabeorte.
Alle elf Dateipins werden beim Schreiben und durch vollständige anschließende
Rücklesung geprüft. SAFE-Quittung enthält elf öffentliche Pin-/PASS-Zeilen,
Cipher/Manifest/Empfänger, tatsächlichen Codekopf/Run und bestätigten Agentstopp.
Keine Originaltexte, privaten Pfade, URLs, Passphrasen oder Schlüssel ausgeben.
Erste innere Archivfehlerphase bleibt erhalten; Prozess-/Agentstopp ohne Beleg
UNKNOWN. Kein PASS nach fehlgeschlagener Bereinigung; kein Fallback/Retry.

## Verfügbarkeit im späteren Mock500-Lauf

Ein Empfangsjob ist **keine dauerhafte Ablage**. Sein temporärer Runner darf
niemals Eingabe eines späteren Jobs sein. Keine Klartextartefakte oder Caches.
Deshalb verwendet der vorhandene gemeinsame Mock500-Job den neuen Decoder
selbst, nach seinem späteren separaten GO mit frischem gültigem Downloadindex.
Er empfängt das bestehende verschlüsselte Archiv einmal in seinem eigenen
gemeinsamen RAM-v2-Parent und reicht alle elf privaten asset_paths und die
unabhängige binding_raw direkt an den vorhandenen Eingabeprüfer weiter.
Eine heutige Empfangsfreigabe erlaubt **keine** spätere erneute Übernahme.

Altes Archivformat und vollständiger alter Empfangsweg bleiben erhalten.
Ursprüngliche500/500-Quellenqualifikation wird übernommen; Dateihashes alleine
erzeugen keinen Quellenvergleich/keine Eingabebindungsabnahme. Original16/
Current2-Vergleich, Atomic12ACK, Tagesbindung, End500-Voraussetzung und Bridge
bleiben unverändert. Keine Wiederholung der erfolgreichen Quellenqualifikation.
Der spätere vollständige Lauf braucht weiterhin seine vorhandenen zwölf
End500-Eingänge mit separater Freigabe, vollständiger SourceQualification des
dann tatsächlichen Codekopfs und positiver unabhängiger End500-Abnahme.

Kein Klartext-gzip-/Tar-Spool. Im bestehenden vollständigen Plattenplan passen
6144Manifestbytes in provenanceAndInputValidation und der begrenzte GPG-Status
in privateLogsAndRuntimeState; beide Eingabekopien und die zwei konservativen
Cipherbudgets bleiben erhalten. Standalone verlangt Cipher+Payloads+65536Bytes
für Manifest/Status/Framing plus mindestens1GiB freien Reserveplatz.
Der Standalonejob behauptet keine gemeinsame RAM-v2-/Restore-/500er-Abnahme.

## Tatsächliche offene Startgrenzen

1. **Transportfähigkeit nicht belegt.** Der GitHub-Runner hat keine private
   Drive-Anmeldung. Historisch waren kurzlebige`*.oaiusercontent.com`-Links
   vorhanden; die heutigen Connectorwerkzeuge dokumentieren nur eine
   authentifizierte Sediment-Dateireferenz. Keine vorhandene ausführbare
   Auflösung in einen frischen runnerlesbaren Link ist nachgewiesen. Frühere
   Empfänge beweisen keinen aktuellen Linkaussteller. Kein neuer Cipherabruf
   wurde in diesem Vorbereitungsauftrag durchgeführt. Ein privater
   sediment://-Verweis wird nicht als HTTPS-URL ausgegeben und nicht auf
   öffentliche Drivefreigabe/Klartextablage ausgewichen.
2. **Ausführungsref noch nicht vorgerückt.** Environment lesend200: weiterhin
   genau der bisherige Branch`codex/w15-github-end500-preparation-20261028`,
   aktuell225e76d7. Der Nachfolgebranch ist dort nicht zugelassen. Neue geprüfte
   Dateien dürfen erst über eine abgestimmte sichere Fast-Forward-Übernahme auf
   dem erlaubten Branch ausgeführt werden; keine Schutzregeländerung. Der Branch
   selbst meldet protected:false; main-Schutzdetails waren403/UNKNOWN und wurden
   nicht erneut angefragt. Environment-Branchschutz ist davon getrennt.

Ohne bestätigten Transportlink und stimmigen Ausführungsref ist die Datenannahme
**nicht vollständig startbereit**. Es wird kein GO auf eine unbekannte
Downloadfähigkeit als garantiert ausführbar dargestellt.

## Konkreter, erst nach diesen Vorbedingungen nutzbarer Empfangsvertrag

GO für **genau einen Empfang**, Modus`mock500-receive-originals`, exakter
unabhängig geprüfter neuer PR-Kopf auf dem oben erlaubten Branch im bestehenden
Environment. Keine Freigabe für Datenbank/Restore/End500/Mock500. Quelle nur das
oben gepinnte bestehende private Archiv; keine erneute Erstellung oder Schlüssel.
Vor Dispatch: aktueller Metadaten-/Ownercheck, echter frischer abrufbarer
Cipherlink aus bestehendem authentifizierten Weg, vollständige verschlüsselte
Parametergröße≤65535, gültiger GO-Nonce/Versuch1, aktuelle Pflicht-CI und Review.
Erwartet: genau11vollständig verifizierte Originale/217563454Bytes, Manifestpin,
authentifizierte Entschlüsselung, vollständige unabhängige SAFE-Quittungsabnahme.
Maximal600s Empfang plus15Minuten äußerer Job; bestehender Standard-Linuxrunner,
keine kostenpflichtige neue Ressource,0Modellaufrufe,0USD zusätzliche
Artefaktspeicherung (kein Upload). Kein RAM-Vertragswechsel; kein RAM-PASS aus
diesem begrenzten Empfang ableiten. Bei FAIL/UNKNOWN sofort stoppen, kein Retry.
Rückweg: neuen Empfangspfad nicht weiter verwenden, eigene Prozesse stoppen
und beobachteten Stillstand melden; bestehende Secrets/Drive-Dateien/Originale
unverändert erhalten, keine automatische Löschung. Späterer Mockjob braucht
separate Genehmigung für seinen eigenen gemeinsamen Empfang.

Nur synthetische Format-/Hash-/Fehler-/Handoffprüfungen und erforderliche
Code-CI; genaue Ergebnisse/Review im Draft-PR. Keine Original- oder500er-Tests,
Productionänderung, Migration, Merge, Deployment oder Modellkosten.
