# W15: lokale Integration des atomaren Nutzungsspeichers

Stand: 28.10.2026. **Teilweise abgeschlossen; kein Mock500- oder Production-Nachweis.**

**Neuester Folgesprint: GitHub-End500-Vorbereitung, Start BLOCKED.**
Die neue Umgebung enthält die alte private W15-Arbeitskopie nicht.
Drive ist frisch geprüft: Das vorhandene elfteilige Originalpaket enthält
die späteren End500-Ableitungen nicht. Konkret fehlt ein erreichbarer
quellseitiger Export von Bound, fünf vollständigen Fixtures, Seed und echtem
Command/Provenienz samt Dump/Rollen. Reine neue Synthetik belegt den
unveränderten Historien-/Quellenvertrag nicht. Ein manueller CI-Planmodus,
neunfacher Byteprüfer und lokale Streaming-Verschlüsselung sind separat
vorbereitet; vollständiger CI-Adapter und entfernte Rücksicherung noch offen.
Kein neuer500er-Lauf, Push, Merge oder Deployment.26-Dateien-Bereinigung laut
Betreiber bereits abgeschlossen; die folgenden damaligen Vorschlagsabschnitte
sind Historie. Keine erneute Bereinigung.
[Aktuelle Entscheidung, Drivebestand, Grenzen und konkreter Restweg](w15-github-end500-vorbereitung-20261028.md).

Die nachfolgenden Abschnitte bewahren den früher veröffentlichten Integrationsstand.
Eigener Branch `codex/w15-atomic-usage-integration-20261028`,
[Draft-PR974](https://github.com/ernisch/helmut-pilot/pull/974), gestapelt auf
PR973 `fa506939` und PR972 `c36bd427`. Neu ausgeführter Diagnosecode C: `ee36720d`;
der historische B-Lauf wurde auf `d2920d6d` ausgeführt. Neuer begrenzter
Datei-I/O-Check tatsächlich auf `63f37c7d` (FAIL); neuer gezielter Draincheck
mit dem Dateistand aus `7c4c25a7` (PASS). Danach genau ein neuer D-Versuch
auf `07b51319`, vor dem ersten CAS am Plattenwächter gestoppt.
Tatsächlich ausgeführter Anschlussstand D: `d66a94dc`; RAM-Diagnose: `55dda919`.
`e1a62acc` ergänzt danach ausschließlich Fehler-Metadaten; kein Lauf wurde wiederholt
oder nachträglich auf diesen Kopf umetikettiert.
Keine Änderungen im ursprünglichen972-Worktree oder am973-Branch; deren offene
Arbeit bleibt erhalten. Keine Merges, Production-Aktionen oder echten Modellaufrufe.

Der erste gezielte Transport-Sprint führte genau eine kleine HTTP-Probe
und eine begrenzte frische Auth-Probe aus. Die Auth-Probe endete beim kontrollierten
Prozessabschluss mit **FAIL**; danach keine Wiederholung und keine neue
End500-Diagnose. Der ursprüngliche11.UNKNOWN bleibt unverändert ungeklärt.

Im anschließend ausdrücklich freigegebenen Sprint wurde der kleine echte
PostgREST-Abschlusscheck bestanden. Die danach einmalig gestartete neue
End500-Diagnose B scheiterte nach290 bestätigten Vorgängen vor dem291.nativen
Schreiben. Unabhängige Endsicht bestätigt sämtliche Daten und0aktive Profile;
kein End500-PASS. Alle historischen UNKNOWN-/FAIL-Befunde bleiben erhalten.

Die anschließend freigegebene C-Diagnose endete nach369/500 mit einem ausdrücklich
klassifizierten Lese-Timeout. Die echte Service-Abschlussquittung und vollständige
native Endsicht waren im damaligen C-Sprint positiv; dort kein weiterer Versuch.
Der danach separat freigegebene D-Versuch und der heutige Freigabestand stehen oben.

## Aktueller Sprint: neue Anbindung gezielt geprüft, End500-D FAIL vor CAS0

Auf Code `07b51319` wurde genau ein frischer isolierter D-Versuch ausgeführt.
Vorbereitende gezielte Checks liefen auf `fdf69342` plus den anschließend
bytegleich in `07b51319` versionierten Dateien. Keine Ergebnisse auf neue Quellen
umetikettiert. Kein Retry, Resume, vollständiger Mock500-Lauf oder Merge.

Die asynchrone Protokollierung ist ausschließlich im isolierten Diagnosepfad
angebunden: synchroner Stop-Latch vor Public-Aufruf/Mutator/nativem Schreiben,
tiefer unveränderlicher Anfangs-Abbruchsnapshot, einmaliger Abschlussowner mit
realer verbleibender15s-Frist, vollständige dauerhafte Fortschrittsbestätigung.
Späte bereits abgesandte Antworten können keinen neuen Fortschritt freigeben.
MEMORY-Gateway bestätigt echte Prozess-/Socket-Enden erst nach Journalabschluss;
früher Prozessfehler sperrt READY. Alle Anwendungs-/Kosten-/Quellenregeln bleiben.
Der bewährte native Abschlussaudit hat45s/Statement; eigentlicher Storage10s,
Journal15s und Auth30 bleiben unverändert. Keine Production-Konfiguration geändert.

Zusätzlicher Plattenbedarf wurde aus bestehenden physischen Größen geplant,
überlappende BASE-/RootFS-/PGDATA-Größen nicht doppelt addiert. Seed118.800.333Bytes
wird unverändert hashgebunden als einzelne RO-Datei außerhalb rekursiv geänderter
BASE eingebunden. Node/PostgREST werden direkt aus vorhandener Kanonik in die
neue getrennte Containerkopie übertragen, ohne weitere143MB Host-Stagingkopie.
Nur8.675.328Bytes neue Appdateien. Keine PGDATA-/State-Aliase, keine Hardlinks,
keine geschützten Daten verlagert und kein PGDATA auf tmpfs. Gemeinsamer Kernelpeak
bleibt ohne Abzüge das RAM-Kriterium. Alle Original-/Altbestände bleiben erhalten.

Der neue Abschlussadapter bewahrt den vollständigen privaten Datenstrom verlustfrei
als gzip statt zweiter120MB-Rohkopie; RawSHA/Bytes, EOF/CRC, exakter Decimalvergleich
und alle3.501Postimages einschließlich6.000Usage sind verpflichtend. Auch stderr wird
vollständig privat mit fdatasync erhalten; öffentliche Berichte enthalten nur
Metadaten. Laufender gemeinsamer RAM-/Plattenwächter0,1s, zusätzlich unmittelbare
Diskprüfung vor jedem Public-/Mutator-/nativen Aufruf. Processing-Floor224MiB;
readonly Abschluss verwendet verbleibendes Auditbudget plus64MiB, damit die
reservierte Auditkapazität auch verbraucht werden kann. Das ist keine FS-Quota.

Gezielte Vorabprüfungen wurden genau einmal ausgeführt, keine Gesamtsuite wiederholt:

| Neue begrenzte Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| Lebenszyklus:2echteSIGTERM-Kinder plus onceClose/Stop-Latch |3/3PASS,143/Signalnull,0weitereFreigaben |
| Verlustfreier Gzip-/Decimal-Dateiadapter |alle120.268.457historischen C-Bytes,42.139.672Gzipbytes,3.501voll verglichenePostimages/6.000Usage |
| Geänderte tatsächlich erzeugte SQL |3.517Hashes:3.511übernommen,6neueParse/Describe,0Execute |
| LokaleDateivorbereitung |8.675.328Bytes,keine neue Datenbank |

Der Codeccheck verwendet ausschließlich einen **neuen privaten Kontrollkopiepfad**
auf `/tmp`, während die historische Originaldatei auf dem Workspace erhalten bleibt.
Er ist kein RAM-/Datenbanklauf und verschiebt keine bestehenden geschützten Dateien.
Die bereits bestandenen10.820Journal-/10.822ACK-/4Fehlerfallprüfungen sowie echte
Auth-/Quellen-/Workerbelege wurden übernommen. Keine alten UNKNOWN-Schreibvorgänge
wiederholt. [Neue Lifecycleabnahme](belege/w15-atomic-usage-integration-20261028/LIFECYCLE_RESULTS_REVIEW_D.SAFE.json)
· [Codec](belege/w15-atomic-usage-integration-20261028/AUDIT_CODEC_CHECK_D.SAFE.json)
· [SQL](belege/w15-atomic-usage-integration-20261028/SQL_PREFLIGHT_D.SAFE.json).

Vor Start unabhängige bewachte Engineering-Zulassung, keine harte Platzgarantie:
1.553.272.832Bytes frei, verbleibendes Planbudget1.503.825.920Bytes nach bereits
allokierterApp,49.446.912Bytes Spielraum; In-flight64MiB bereits enthalten.
[Damals gültige Startabnahme](belege/w15-atomic-usage-integration-20261028/MEMORY_PRESTART_REVIEW_D.SAFE.json).
Dieser Plan stellte sich bei tatsächlicher Anlage/Seed als unvollständig heraus.

| Tatsächlicher D-Befund | Wert |
| --- | --- |
| Primärfehler,19:34:22.803560UTC |`w15-forward-disk-closure-reserve` |
| FreiePlatte beim Erstfehler / geforderterFloor |224.247.808 /234.881.024Bytes |
| Endgültiger gemeinsamer Kernelpeak |548.626.432Bytes |
| RAM-Reserve / Swap / OOM-max-Ereignisse |1.499.373.568Bytes=73,2116% /0 /0 |
| Nativ unabhängig am Ende |500Profile,0aktiv |
| Auth-CAS / W15-Node-Run / Gateway / DR-Units / Modelle |0 /nicht gestartet /nicht gestartet /0 /0 |

Bereits am ersten Wächtersample waren nur641.568.768Bytes frei: rund911,7MB
unter dem Admission-Read. Diese Strecke ist nicht komponentengenau zugeordnet.
Docker weist einen logischen Imageanteil437.457.485Bytes aus; eine zusätzliche
physische VFS-Initlayerkopie bleibt **Vermutung/UNKNOWN**, kein bewiesener Defekt.
Insbesondere wurde kein geschützter Docker-Verzeichniszugriff umgangen.

Alle3.501Seed-SELECTs meldeten innerhalb ihrer Transaktion matches=true. Die
unabhängige reine Metadaten-Endlesung sieht committed Seed-Daten
(2.500Briefings,1.006Storezeilen,Main-Auth6.000Usage). Noch kein Atomicmarker,
llm_usage0; weder Bootstrap noch Node-Setup/-Run erreicht. Keine neue vollständige
3.501Postimage-Abschlussprüfung behauptet. Die im Controller fehlende Servicequittung
ist sekundär: der Service wurde nie gestartet. Der ursprüngliche FileNotFound- /
UNKNOWN-Befund wird nicht überschrieben. Auth-Maxima bleiben nicht gemessen;
der beobachtete Boot-/Restore-/Seed-Peak ist kein End500-RAM-/Auth30-PASS.
[Unabhängiger D-Abschluss](belege/w15-atomic-usage-integration-20261028/DISK_D_RESULTS_REVIEW.SAFE.json)
· [ursprünglicher Controllerbericht](belege/w15-atomic-usage-integration-20261028/RAM_D_CONTROLLER_RESULT.SAFE.json)
· [Postmortem](belege/w15-atomic-usage-integration-20261028/DISK_D_POSTMORTEM_INDEPENDENT.SAFE.json).

### Konkreter Bereinigungsvorschlag: keine Ausführung ohne GO

Exakt26byteidentische Node-/PostgREST-Host-Stagingdateien aus13alten Vorbereitungen,
alle als regulär/UID1000/nlink1/ohneSymlink und mit vollständigemSHA geprüft.
Sichtbare Allokation1.862.975.488Bytes; derzeit222.924.800Bytes frei.
Rechnerisch nach vollständiger Reclamation2.085.900.288Bytes; tatsächlichesdf
ist erst nach einer separat genehmigten Aktion beweisbar. Keine Aussage, dass
sichtbareBlocks sofort vollständig frei werden. Keine Containerdatei, Datenbank,
Originaleingabe, Quelle, Fixture, Archiv, Schlüssel, Passwort oder Journal betroffen.

Kanonische gleichgehashte Exemplare unter dem bisherigenC-Staging sowie die
Originalruntimekopie bleiben erhalten. Vor jeder freigegebenen Löschung müssten
Hashes, Rechte und aktuelle Nichtbenutzung erneut gebunden werden. Risiko:
Die konkreten alten Stagepfade fehlen danach, bis sie wiederhergestellt werden.
Rückweg: exklusives Kopieren der kanonischen Bytes auf den jeweiligen fehlenden
Pfad, vollständige Größen-/SHA-Prüfung, aufgezeichneteUID/GID/Modi und
fdatasync/fsync; niemals vorhandene Dateien überschreiben oder mutable Aliase bauen.
Alle exakten Zielpfade und Wiederherstellungsquellen sind im
[prüfbaren26-Dateien-Manifest](belege/w15-atomic-usage-integration-20261028/STAGING_DUPLICATES_NEXT_GO.SAFE.json)
enthalten. Privates vollständiges Metadatenmanifest bleibt lokal geschützt.

**Nichts gelöscht oder verlagert. Der eine D-Versuch ist verbraucht.** Für die
konkrete26-Dateien-Bereinigung und einen weiteren frischen End500-Versuch braucht
es neues ausdrückliches GO. Zuerst tatsächlich zurückgewonnenen Platz und
revidierten Anlagebedarf mit unabhängiger Startprüfung bestätigen; kein Resume.
Der nächste gemeinsame Plattenplan muss die vor dem bisherigen Wächter sichtbare
Anlagephase tatsächlich berücksichtigen. Eine logische VFS-Risikoallokation ist
keine bewiesene physische Zusatzspitze. Mock500-Startbindungen wurden nach FAIL
nicht weiter geändert; dieser Gesamtversuch und Production bleiben gesperrt.

Die folgenden Komponentenabschnitte enthalten auch historische Sprintstände.
Der neueste D-Befund und die aktuelle konkrete Freigabegrenze stehen im Abschnitt oben.

## Was tatsächlich integriert und geprüft ist

Der standardmäßig ausgeschaltete atomare Speicherweg wird ausschließlich in
frischen netzlosen lokalen PostgreSQL-Kopien installiert. Der Originaldump braucht
fünf additive skalare Spalten, die973s Komponentenfixture bereits voraussetzt:
`kein_aufruf`, `source_id`, `package_id`, `vorgang_id`, `knowledge_object_id`.
Der lokale SQL-Vorschlag ergänzt nur diese Spalten und verlangt vor der DDL
`helmut.local_usage_experiment=on`. Die eigentlichen atomaren Protokollfunktionen
bleiben unverändert. Keine Production-Migration oder Production-Flagänderung.

Die echte Auth-Messhülle erfasst jetzt sowohl den ursprünglichen CAS-Schreiber
als auch `llm-usage-atomic.write`, einschließlich interner Pipeline-Sperren und
Nutzungsspeicherungen. Eine echte private relationale Quittung ersetzt keine
Sicherheitsprüfung: kopierte Quittungen bleiben ungültig. Vollständige native
Auth-Zählungen und Ergebnis-Audithashes verwenden den kettengeprüften logischen
Lesepfad; der physische Blob allein enthält die Nutzungshistorie nicht mehr.

Der CPU-Quellvertrag bindet den geänderten Kostenquelltext und die beiden
neuen transitiven Abhängigkeiten `llm-usage-atomic.js`/`auth-store-cas.js`.
Der gezielte Stored-Command-Test besteht **81/81**, einschließlich des auf973
fehlgeschlagenen geschlossenen Worker-Modulgraphen. Keine vollständige lokale
Suite wiederholt. Bestehende973-Komponentennachweise bleiben historische Belege
für ihren exakten Kopf; sie werden nicht auf974 umetikettiert.

Die vorhandene500/500-Quellenqualifikation wird ausdrücklich begrenzt übernommen:
16/18 Dateien bytegleich, die echten D-/R-Konstruktoren und die Herkunftsfunktion
auch in den beiden geänderten Dateien unverändert. Der neue Routenzeitraum bindet
frische reale Laufzeitgrenzen; das fachliche Eingabedatum bleibt unverändert.
[Quellvergleich](belege/w15-atomic-usage-integration-20261028/SOURCE_COMPATIBILITY.SAFE.json).

## Erfolgreicher begrenzter Ablauf D

Echter Originalrestore, atomarer Bootstrap mit vollständigem logischem Hashvergleich,
frische Ed25519-Signatur, echter Worker/fullC, Prepared0/Open, HTTP/PostgREST,
echte Auth-APIs und ein separater uninstallierter EU-DraftCompletion-Fall.

| Tatsächlicher Befund | Messwert / Ergebnis |
| --- | --- |
| Originale Nutzungshistorie | alle5.000 Einträge vollständig hashgleich erhalten |
| Vollständige Worker-Vorbereitung | 19.868,511201ms |
| Installation-Open | 49,115307ms |
| Vollständig bestätigte Auth-Vorgänge / native Schreibvorgänge | 12 /12 |
| Auth-Maximum einschließlich ganzer API bis ACK | 2.491,931300ms |
| Natives Schreibmaximum | 1.556,436538ms |
| Gemeinsamer Kernelpeak dieses begrenzten Ablaufs | 719.044.608Bytes |
| Lokale EU-Simulation / reale Modellaufrufe | 1 /0 |
| Simulierte bestätigte Kosten / erhaltene UNKNOWN-Reserve | 248 /81.400µUSD |
| Testprofile am Ende | 500 vorhanden,0 aktiv |

24 Start- und24 Abschlusszeilen der Auth-Beobachtung sind dauerhaft erhalten. Die unabhängige
Abnahme bestätigt16/16 Punkte einschließlich echter Signaturprüfung und nativer
Read-only-Endsicht. Haupt-Auth enthält5.001 Einträge nach einem echten kostenfreien
Skip; die getrennte EU-Komponentenzeile enthält einen weiteren Eintrag.

HTTP-Status liefert1.500 **Sollpositionen**, keine neu produzierten Ergebnisse.
Der signierte Cold-Open erfolgt vor diesem HTTP-Statusaufruf; kein neu gemessener
Cold-HTTP-Zeitnachweis wird behauptet. Der echte Runtime-Riegel verweigert0aktive
Profile unverändert. Journal-Claim/Stop und Ablehnung eines zweiten Claims sind
geprüft; keine Unit wurde betreten.

Der EU-Komponentenfall verwendet tatsächliche Storage-, AI-, private Quittungs-
und Kostenfunktionen mit genau einer lokalen HTTPS-Simulation. Er endet nach
privater DraftCompletion vor Dstore/R. Der vollständig installierte positive
D→R→Ergebnisjournal-Ablauf verlangt weiterhin native500aktive Profile und bleibt
Bestandteil der später gesondert freizugebenden Ausführung.

[Unabhängige Abnahme D](belege/w15-atomic-usage-integration-20261028/D_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [Auth-Rohzeiten](belege/w15-atomic-usage-integration-20261028/ATOMIC_AUTH_PREPARED0.SAFE.json)
· [EU-Komponentenfall](belege/w15-atomic-usage-integration-20261028/ATOMIC_EU.SAFE.json).

## Genau eine End500-Allokationsdiagnose: abgebrochen

Frische netzlose Kopie, vollständiges unverändertes inertes End500-Datenmodell,
6.000 Usage-Einträge,3.501 native Seed-Postimages, tatsächlich neu vorbereiteter
W15-Command als unveränderliche Daten und echter geladener Server-Modulbestand.
PostgreSQL, PostgREST, Node, SQL-Kinder und belasteter Dateicache im selben
technisch auf2.048.000.000Bytes begrenzten Container, Swap0. Kein Cache-/GC-Eingriff,
kein Messwertabzug und keine Verrechnung der395MB aus973.

**10/500** atomare Schreibvorgänge einschließlich Revision und vollständigem
Postimage bestätigt. Beim11. Schreiben TypeError vor bestätigtem ACK;
Ausgang bleibt **UNKNOWN**. Sofort beendet, kein Retry und kein weiterer Versuch.

| Tatsächlicher Messwert | Wert |
| --- | --- |
| Gemeinsamer Kernelpeak | 1.154.990.080Bytes |
| Rechnerische Reserve | 893.009.920Bytes =43,60% |
| Maximale vollständige bestätigte Auth-Zeit | 20.034,336894ms |
| Maximale bestätigte native Schreibzeit | 12.559,368517ms |
| Unbestätigte ganze Auth-/Schreibvorgänge | 1 /1 |
| Aktive Profile am Abschluss | 0 |

Die Reserve ist für den beobachteten kurzen Verlauf erfüllt. Die Diagnose
scheitert am technischen Fehler, nicht an einer gemessenen Reserveverletzung.
Keine ausreichende Laufdauer für eine belastbare End500-/Restwachstumsprognose;
kein RAM-PASS für500Units, kein vollständiges Auth30-PASS und kein Unit60-Nachweis.
Die unabhängige Abschlussprüfung bestätigt alle3.501 Datenpostbilder und6.000
Nutzungseinträge vollständig;0aktive von500Profilen. Der letzte sichtbare
Probeindex ist9; der11.Schreibvorgang ist nach Abschluss nicht sichtbar,
seine fehlende Laufquittung wird dadurch nicht nachträglich bestätigt.
468 dauerhafte Beobachtungen,55 natürliche Major-GCs. Nur ein früher
PostgreSQL-Statistikpunkt; kein später WAL-/Checkpoint-/Autovacuum-Verlauf.
Größte beobachtete Einzel-RSS-Werte: Node398,8MB, PostgREST298,8MB,
PostgreSQL-Backend324,6MB. Diese Maxima sind nicht gleichzeitig und werden
nicht addiert. Treiber, Gateway und PostgREST beendet; PostgreSQL/Daten erhalten.
[Unabhängige Fehlerabnahme](belege/w15-atomic-usage-integration-20261028/RAM_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [native vollständige Endsicht](belege/w15-atomic-usage-integration-20261028/RAM_NATIVE_FINAL_INDEPENDENT_READONLY.SAFE.json).

Die tatsächliche Fehlerursache unterhalb TypeError ist aus den damaligen Belegen
nicht rekonstruierbar. Keine Vermutung als Ursache darstellen.

Nach dem Abbruch wurde nur die Fehlerprotokollierung ergänzt: ausdrücklich
erlaubte Transportcodes und sichere Bytezähler, keine Nachrichten, Header,
URLs, Adressen, Schlüssel oder Inhalte. Drei reine Prüfungen bestanden;
unabhängiger statischer Review12/12. Der alte Fehler bleibt UNKNOWN.
[Trace-Review](belege/w15-atomic-usage-integration-20261028/TRANSPORT_METADATA_REVIEW.SAFE.json).

## Gezielte Transportdiagnose: Schreibbestätigungen grün, Abschluss FAIL

Zuerst ausschließlich vorhandene Transport-, PostgreSQL-, PostgREST-, Zeit- und
Kernelbelege geprüft: kein OOM, kein PostgreSQL-Fehlerbeleg, keine belegte
Überschreitung des Auth30-Limits beim11.Vorgang. Dessen native Dauer446,903297ms
und ganze Auth-Dauer1.417,059425ms erklären den TypeError nicht. Der ursprüngliche
Fehlerbericht hat den unterliegenden Transportcode nicht erhalten. Ein bestimmter
HTTP-, Pool-, Zeitlimit- oder RAM-Fehler ist deshalb weiterhin nicht nachgewiesen.
Keine ungeprüfte Transport- oder Speicheroptimierung vorgenommen.

Eine kleine HTTP-Probe über das echte lokale Gateway mit7s realem Eventloop-Stillstand
endet mit6/6 vollständigen Antworten, ohne Datenbank oder Modelle. Kein reproduzierter
Fehler; insbesondere kein Beweis für oder gegen den damaligen unbekannten Ausgang.

Danach genau eine frische isolierte Datenbankkopie, keine Wiederholung des alten
Schreibvorgangs:16 neue Nonce-gebundene Auth-Mutationen über den echten atomaren
Speicherweg, jeweils Revision, private Schreibquittung und vollständiges Nachlesen.
Der reale W15-Command bleibt als gehashte Daten geladen, ohne Ausführungsrecht.

| Tatsächlicher Befund der begrenzten Auth-Probe | Messwert / Ergebnis |
| --- | --- |
| Vollständige neue Schreibbestätigungen / Postimages | 16 /16 |
| HTTP-Anfragen | 49/49 Status200;33 Lese-,16 CAS-Anfragen;0 Requestfehler |
| Ganze Auth-Zeit maximal | 3.141,334564ms |
| Native CAS-Zeit maximal | 1.951,072017ms |
| Gemeinsamer historischer Containerpeak | 1.475.330.048Bytes |
| Reserve zum unveränderten Limit | 572.669.952Bytes =27,9624% |
| Profile / aktiv / Usage am Ende | 500 /0 /6.000 |
| Units / echte Modelle / Wiederholungen | 0 /0 /0 |

Der Peak gehört zum bereits genutzten begrenzten Container einschließlich alter
Diagnose und frischer Kopie. Er ist **kein frischer End500-RAM-Nachweis** und keine
Prognose bis500Units. Swap0, keine OOM-Ereignisse. Auth-Zeiten, Transportverlauf,
GC- und gemeinsame Kernelmessungen sind dauerhaft erhalten. Native Invarianthashes
bestätigen vollständige Historie, Kosten-/Sicherheitsbindungen und übrige Daten;
Quellzustand vor/nach identisch. Keine Profilaktivierung.

**Der tatsächliche Diagnoseabschluss bleibt FAIL:** Das eigene Programm forderte
SIGTERM an; PostgREST endete mit SIGINT. Die neue Abschlussklassifizierung akzeptierte
nur Exit0 oder SIGTERM und verweigerte die Bestätigung. Alle49 HTTP-Anfragen und
16 Schreibquittungen waren vorher vollständig. Zwei spätere Socket-Close-Ereignisse
nach dem letzten ACK gehören zum Abschluss, nicht zu einem gescheiterten Schreiben.
Alle eigenen Treiber-/Gateway-/PostgREST-Prozesse sind beendet; Daten erhalten.

Die bestätigte kleine Programmkorrektur `f8702304` akzeptiert den dokumentierten
PostgREST-UserInterrupt-Ausgang nur nach erfolgreich zugestelltem eigenem SIGTERM;
keine erzwungene Beendigung und keine offenen Sockets bleiben Voraussetzungen.
Primärbeleg: [PostgREST12.2.3, Unix.hs](https://github.com/PostgREST/postgrest/blob/v12.2.3/src/PostgREST/Unix.hs#L23).
Neun reine Zuordnungsprüfungen und unabhängiger statischer Review bestanden;
**kein erneuter Lauf**, keine nachträgliche PASS-Umetikettierung. Die Korrektur
behebt nicht den weiterhin ungeklärten ursprünglichen11.TypeError.

Stand des ersten Transportsprints, vor dem anschließenden neuen GO:
Die damals bedingt freigegebene neue End500-Diagnose wurde **nicht gestartet**:
Der notwendige Fehlerfix-/Start-PASS fehlt, außerdem gilt nach diesem tatsächlichen
Diagnose-FAIL die Stopregel. Neuer Ausführungsversuch benötigt ein neues gezieltes GO.
[Unabhängige17-Punkte-Abnahme und exakte Beleg-/Quellhashes](belege/w15-atomic-usage-integration-20261028/AUTH_TRANSPORT_PROBE_RESULTS_REVIEW.SAFE.json)
· [bereinigte Sprintübersicht](belege/w15-atomic-usage-integration-20261028/TRANSPORT_SPRINT_SUMMARY.SAFE.json).

## Echter PostgREST-Abschlusscheck: PASS

Genau ein neuer kleiner echter Prozessstart auf der bestehenden isolierten
Testdatenbank; keine Auth-/CAS-Schreibanfrage und keine Wiederholung der16/49-
Belege. Die bestehende `serve()`-Abschlusslogik und unveränderte SIGINT-Bewertung
werden tatsächlich ausgeführt. Ergänzt wird ausschließlich die messende Forderung,
dass aktive und freie HTTP-Agentverbindungen des Kindes ebenfalls0 erreichen.

Angenommenes SIGTERM um15:26:01,391UTC, tatsächlicher PostgREST-Ausgang SIGINT,
bestätigte IPC-Abschlussquittung, Kindexit0, kein SIGKILL,0Gateway-Sockets,
0aktive/freie Agentverbindungen und native0Authenticator-Verbindungen vorher/nachher.
Gesamter kleiner Ablauf552,613949ms.500Profile/0aktiv,6.000Usage und native Hashes
unverändert. Unabhängig bestätigt; keine RAM- oder500er-Abnahme daraus abgeleitet.
[Echter Abschlussbeleg](belege/w15-atomic-usage-integration-20261028/POSTGREST_STOP_RESULT.SAFE.json)
· [unabhängige Abschluss-/Transportschutzprüfung](belege/w15-atomic-usage-integration-20261028/POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json).

## Neue End500-Diagnose B: FAIL bei290/500

Frisches netzloses Ziel `w15-memory-atomic-20261028b`, vollständiger unveränderter
inert deklarierter End500-Bestand, echter geladener W15-Command ohne Ausführungsrecht.
25Quellpins unabhängig vorab geprüft.3.511 vorhandene SQL-Parserbelege übernommen,
nur die neue CREATE-DATABASE-Anweisung beschrieben;0Arbeitsabfragen ausgeführt.
Eine danach rein mathematische Quellneubindung übernimmt alle3.512 SQL-Abfragebindungen:
Nur Diagnosezeitbudget und Berichtspfad ändern sich, Rücktausch reproduziert exakt
den bereits geprüften Pythonhash. Keine neue SQL-Serie.

**Ausdrückliche lokale Planabweichung:** ausschließlich das Diagnosefenster
von1.800/1.790 auf3.600/3.590Sekunden außen/innen erweitert. Die vorhandenen warmen
Intervalle ergaben im Mittel1.664s, bei durchgängig bereits beobachtetem Maximum
2.307s für500Vorgänge. Auth30, Unit60, hartes2.048.000.000Bytes-Limit,
20%Reserve, Swap0 und NoRetry bleiben unverändert. Dies ist keine Verlängerung
des späteren3h+30min-Mock500-Vertrags.

| Tatsächliches Ergebnis B | Wert |
| --- | --- |
| Bestätigte Mutationen / native CAS / volle Postimages | 290 /290 /290 |
| Begonnene Auth-Vorgänge / unbestätigt | 291 /1 |
| Fehlerposition | Index290, vor Callback; kein291.nativer Schreibaufruf |
| Ganze bestätigte Auth-Zeit maximal | 11.681,541407ms |
| Native bestätigte CAS-Zeit maximal | 6.150,820550ms |
| Gescheiterter ganzer Vorgang | 10.339,606479ms; Ursache UNKNOWN |
| Gemeinsamer Kernelpeak, auch nach unabhängiger Endlesung | 1.444.556.800Bytes |
| Rechnerische Reserve | 603.443.200Bytes =29,4646875% |
| Limit / Swap / OOM-Ereignisse | 2.048.000.000Bytes /0 /0 |
| Unabhängige Endsicht | 500Profile,0aktiv,6.000Usage,3.501volle Postimages erhalten |
| Neue Units / echte Modelle / Wiederholungen | 0 /0 /0 |

Der291.Auth-Vorgang hat `callbackRuns=0`; alle290nativen Schreiber haben echte
ACKs. Das grenzt den Fehler auf die Phase vor dem Callback/Schreiben ein.
Der Fehlertext ist nur als generischer Error erhalten. Weder HTTP-Status noch
unterliegender Request-/Timeoutgrund lassen sich daraus rekonstruieren.
Die Nähe zur konfigurierten Requestfrist ist **kein Timeoutbeweis**. PostgreSQL-
Primärlog enthält keine ERROR/FATAL/PANIC-/Timeout-/OOM-/Platzfehler; PostgREST
hat nur Startmeldungen, Gatewaylog leer. Abwesenheit von Fehlermeldungen ersetzt
keinen Ursachenbeleg. Der ursprüngliche11.UNKNOWN ist ein eigener alter Fall.

Alle8.424 dauerhaften Beobachtungszeilen mit581Starts/581Finishes sind erhalten;
eine Fehler-Hülle bleibt unbestätigt.13echte PostgreSQL-Statistikpunkte einschließlich
des Fehlerabschlusses erhalten: WAL physisch konstant134.217.728Bytes, kumulativ
geschrieben120.168.018→1.075.781.447Bytes; letzteres ist kein RAM-/Dateibestand.
Store einschließlich TOAST64.995.328→max69.615.616Bytes, TEMP0;
Checkpoints2→17, Autovacuumzähler2→93.4.353natürliche GC-Ereignisse, darunter
961Major-GCs, längste Pause526,377951ms. Kein erzwungener Checkpoint/GC/Cache-Eingriff.
Prozess-RSS-Werte werden wegen geteiltem Speicher und verschiedener Zeitpunkte
nicht addiert. Der gemeinsame Kernelpeak bleibt der maßgebliche Messwert.

Die eingebaute Controller-Endsicht bleibt `activeProfiles:null`: Die PostgREST-
Stopdatei enthält die Signalanforderung, aber keine Abschlussquittung. Die
anschließende separate unabhängige Read-only-Transaktion bestätigt alle3.501
Postimages und alle Auth-/Kosten-/Sicherheitsfelder außer neuer Revision/Probeindex,
6.000Usage und0aktive Profile. Eine spätere reine Prozesssicht findet keine
eigenen laufenden Prozesse. Diese Belege erfinden keine fehlende frühere Quittung;
Controllerbefund und Stop-UNKNOWN bleiben unverändert.

**Kein End500-RAM-PASS:** Der späte Messbereich abIndex349 fehlt, Restwachstum
ist nicht berechnet. Die unbekannte Prognose wird nicht mit0 angesetzt, auch
wenn beobachteter Peak plus64MiB noch unter der Grenze liegt. Vollständiges
Auth30/Unit60/Mock500 bleiben offen. Nach diesem FAIL keine weitere Ausführung,
kein Retry, kein Resume und kein Mock500.
[Unabhängige vollständige Ergebnisabnahme B](belege/w15-atomic-usage-integration-20261028/RAM_B_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [native vollständige Endsicht](belege/w15-atomic-usage-integration-20261028/RAM_B_NATIVE_FINAL_INDEPENDENT_READONLY.SAFE.json).
Die vollständigen bereinigten [581 Auth-Zeitzeilen](belege/w15-atomic-usage-integration-20261028/RAM_B_AUTH_TIMINGS.SAFE.json)
und [1.297 äußeren Kernel-/Fortschrittspunkte](belege/w15-atomic-usage-integration-20261028/RAM_B_MEMORY_TIMELINE.SAFE.jsonl)
sind zusätzlich in Git erhalten. Originale private Rohbelege bleiben geschützt;
Größe und SHA256 der Exporte und ihrer Ausgangsdateien sind gebunden.

## RAM-Wachstum aus den vorhandenen B-Messungen

Alle1.297 vorhandenen äußeren RAM-/Fortschrittspunkte ausgewertet;1.004 davon
enthalten Kernelkomponenten. Das vollständige inerte End500-Modell war bereits
vor der Diagnose geladen. Die späteren Schreibvorgänge vergrößerten nicht erst
schrittweise den fachlichen500er-Enddatenbestand.

PostgREST war der größte frühe anonyme Zuwachs: Median331,01→411,30MB zwischen
den Fenstern50–99 und250–289. Im letzten Fenster gegenüber200–249 aber nur
0,33MB mehr Median und kein höherer p95. Gemeinsamer Median zuletzt+5,58MB;
Dateicache stabil um339MB, darin146,79MB Shared Memory. Node-Heap-Median
99,26→101,07MB. Geteilte Prozess-RSS nicht addiert; PSS war nicht zugänglich.
Der tatsächliche B-Kernelpeak bleibt1.444.556.800Bytes einschließlich aller Spitzen.
Kumulative WAL-Schreibbytes sind kein zusätzlicher RAM: physischer WAL-Bestand
blieb134.217.728Bytes; TEMP0, natürliche Checkpoints/Autovacuum und GC belegt.

Das spricht für ein spätes weitgehend stabiles Niveau im beobachteten Bereich,
beweist aber weder500 noch6.500 zukünftige Vorgänge. Daher keine spekulative
Pool-/GC-/Cache-Optimierung, kein Messwertabzug und keine neue1GB-Pflichtgrenze.
[Vollständige Analyse](belege/w15-atomic-usage-integration-20261028/RAM_B_GROWTH_ANALYSIS.SAFE.json)
· [späte Fenster](belege/w15-atomic-usage-integration-20261028/RAM_B_GROWTH_LATE_WINDOWS.SAFE.json).

## Korrigierte Beobachtung und genau eine neue Diagnose C

Nur im lokalen Testprogramm: geschlossene sichere Fehlerklassen statt verlorener
Fehlertypen; tatsächliche Ownership-/Signalfehler bleiben sichtbar. Jeder eigene
Stopp und die native Nullkontrolle werden getrennt abgeschlossen. Der bestehende
echte Service-Parent startet nun auch im RAM-Lauf PostgREST als Kind und muss
Signalannahme, Kindexit und0Verbindungen dauerhaft quittieren. Keine Änderung
der Storage-, Auth-, Kosten-, Quellen- oder Geschäftslogik und kein höheres Timeout.

Gezielt bestanden:14reine Fehlerklassifikationsfälle, eine echte Ownership-
Ablehnung ohne Signal und genau ein kontrollierter eigener Kindprozess-Stopp;
0HTTP/DB/Auth/Units/Modelle. Acht reine Python-Prüfpunkte bestätigen die sichere
Fehlerübergabe. Unabhängiger Review PASS. Alle3.512 erzeugten SQL-Abfragen sind
gebunden:3.511 identische Parserbelege übernommen, nur CREATE-C neu geparst,
0Arbeitsabfragen ausgeführt.26Quellpins/24Startprüfpunkte unabhängig bestätigt.
[Beobachtungsreview](belege/w15-atomic-usage-integration-20261028/OBSERVATION_RESULTS_REVIEW.SAFE.json)
· [Startabnahme C](belege/w15-atomic-usage-integration-20261028/MEMORY_PRESTART_REVIEW_C.SAFE.json).

Danach genau eine frische netzlose C-Kopie, vollständiges inertes End500-Modell
und echter unveränderlich geladener W15-Command. Tatsächlicher Ablauf
17:14:20,922–17:36:38,463UTC am28.10.; keine Aktivierung oder DR-Unit.

| Tatsächlicher Befund C | Ergebnis |
| --- | --- |
| Vollständig bestätigte Auth-Vorgänge / native CAS / exakte Postimages |369 /369 /369 |
| Nächste Auth-Hülle |370., Index369; Storage-Timeout10.000ms, Callback0/native CAS0 |
| Vollständiges bestätigtes Auth-Maximum |16,171304524s |
| Bestätigtes natives CAS-Maximum |7,691495863s |
| Dauer der gescheiterten Auth-Hülle |11,068298475s; kein erfolgreicher ACK |
| Gemeinsamer Kernelpeak, auch nach unabhängiger Endsicht |1.437.229.056Bytes |
| Verbleibende Reserve |610.770.944Bytes =29,8228% |
| Technisches Limit / Swap / OOM-/Max-Ereignisse |2.048.000.000Bytes /0 /0 |
| Echter Serviceabschluss |TERM angenommen, SIGINT-Kindexit,0Sockets, kein erzwungenes Ende |
| Vollständige native Datenendprüfung |3.501/3.501 Postimages,6.000 Usage unverändert |
| Profile / aktiv |500 /0 |

**Gesamtstatus C: FAIL.** Sofort beendet, kein Retry. Der Speichergrenzwert wurde
im beobachteten Verlauf eingehalten, aber vollständige End500-/Restwachstums-
Abnahme, vollständiges Auth30 und Unit60 sind weiterhin offen. Keine Hochrechnung
des unvollständigen Verlaufs als500er- oder6.500er-Beleg.

Der neue geschlossene Fehlerenum belegt einen Storage-Lesetimeout vor dem
370.Callback; damit kein370.nativer Schreibversuch. Die tieferliegende Ursache
bleibt UNKNOWN. Beide Messspuren haben kurz davor eine Lücke: außen8,404908s,
Node8,513s. Kein GC-Eintrag im Timeoutfenster; daraus folgt weder eine bewiesene
Host-/IO-Pause noch eine PostgreSQL-/PostgREST-Ursache.1.109 Gateway-Anfragen,
aber nur1.108 abgeschlossene Antworten;1.109 gezählte200-Header sind kein Beleg
für1.109 vollständige Antworten. Letzter Read ohne Finish/ausgelieferte Socketbytes.
Die alten11.- undB291.-Fehler werden dadurch nicht nachträglich erklärt.

Dauerhaft erhalten:10.820 innere Beobachtungszeilen,739Auth-Starts/739Abschlüsse
einschließlich Fehler, exakte370Hüllen-/369CAS-Zeiten,1.692äußere Messpunkte,
5.459GC-Einträge und16native Datenbankbeobachtungen. Private Inhalte bleiben
außerhalbGit; öffentliche Exporte enthalten nur technische Messwerte.
[Unabhängige C-Abnahme](belege/w15-atomic-usage-integration-20261028/RAM_C_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [Auth-Einzelzeiten](belege/w15-atomic-usage-integration-20261028/RAM_C_AUTH_TIMINGS.SAFE.json)
· [RAM-Verlauf](belege/w15-atomic-usage-integration-20261028/RAM_C_MEMORY_TIMELINE.SAFE.jsonl)
· [echte Abschlussquittung](belege/w15-atomic-usage-integration-20261028/RAM_C_SERVICE_CLOSURE.SAFE.json)
· [native Endsicht](belege/w15-atomic-usage-integration-20261028/RAM_C_NATIVE_FINAL_INDEPENDENT_READONLY.SAFE.json).

## C-Ursachenrekonstruktion und begrenzter Datei-I/O-Check

Die Originalzeitspuren bestätigen den10.000ms-Lesetimeout vor dem370.Callback.
Schon beim letzten erfolgreichen Vorgang lag die native Hülle bei7,691496s,
die eigentliche Gateway-CAS-Anfrage aber nur bei1,100660s. Rund6,588s lagen
vor dem Gateway-Aufruf und dürfen nicht PostgreSQL zugerechnet werden.
Für die gemeinsame8,404908s-/8,513s-Messlücke fehlen historische CPU-/IO-/PSI-
und fsync-Dauern. Kein GC-Eintrag im Fehlerfenster, keine Reclaim-/Major-Fault-/
OOM-Spitze. Ein späterer kumulativer Snapshot hat `cpu.max=max`,0Drosselereignisse,
keine zugänglichen PSI-Dateien; das rekonstruiert keine damalige Hostpause.
Der vorherige Checkpoint-sync4,268s ist ein IO-Latenzbefund, kein Beweis für den
späteren Stillstand. Produktfehler, Hostpause und fsync bleiben als historische
Ursachenzuordnung UNKNOWN; keine Vermutung als nachgewiesenen Produktfehler ausgeben.
[Zeitfolge und Grenzen](belege/w15-atomic-usage-integration-20261028/C_TIMEOUT_CAUSAL_ANALYSIS.SAFE.json).

Eine konkrete Schwachstelle des Testprogramms ist dagegen belegt: jeder der
10.820 inneren Beobachtungseinträge und2.256 Gatewayeinträge wurde synchron
geschrieben und synchronisiert, auch während echter HTTP-Anfragen. Der neue
optionale `openAsync()`-Weg verwendet dieselben vollständigen sofort serialisierten
Zeilen, native serielle Partialwrites mit anschließendem `fdatasync`, echte ACKs,
eine8-MiB-Queue und standardmäßig15s-Abschlussgrenze. Kein Worker, keine neue
Anwendungsarchitektur, keine gekürzte Historie, keine abgeschaltete Dauerhaftigkeit.
Der alte `open()`-Funktionskörper bleibt bytegleich; Produktion und Geschäfts-
funktionen unverändert. Der Promise-Abbruchpfad ist neu und noch nicht abgenommen.

Nach gezielten Syntax-/Dateivorprüfungen und unabhängigem statischem Review wurde
genau ein begrenzter Datei-I/O-Check mit vorab festgelegten Modi ausgeführt.
Keine HTTP-Anfragen, Datenbank-/Auth-Vorgänge, Profile, Units oder Modelle.
Die historischen C-Ereignisse sind lediglich unveränderte inerte Dateipayloads.

| Gemessener normaler Dateimodus | Synchron | Asynchron |
| --- | --- | --- |
| Vollständige identische C-Payloads |10.820 |10.820 |
| Vollständige dauerhafte Sync-ACKs inkl. Prozessstart |10.821 |10.821 |
| Größte Producer-Eventloop-Lücke |16,226024010s |0,182817406s |
| Größte unabhängige Eltern-Heartbeatlücke |0,441521793s |0,103245429s |
| Gesamte Dateimodus-Wallzeit |16,266034718s |17,575737520s |

Die blockierende Wirkung im Producer und ihre Beseitigung im normalen
asynchronen Dateimodus sind damit belegt. Die gesamte I/O ist nicht schneller;
keine Wartezeit wurde abgezogen. Der konzentrierte Dateitest ist keine
nachträgliche Erklärung der historischen gemeinsamen C-Lücke und keine
Auth30-/RAM-/End500-Abnahme.

**Der Gesamtcheck ist FAIL:** Der Drain-Vorbereiter reihte10.756Zeilen am Stück
ein und wartete dann mit der echten15s-Grenze. Diese wurde bereits vor den
letzten64Zeilen und vor der vorgesehenen SIGTERM-Bereitschaft überschritten.
10.299 kopierte Payloadzeilen vorhanden, letzte Quellsequenz10.298;
Original-C-Datei mit allen10.820Zeilen vollständig erhalten. Kein Abbruchdrain-PASS,
keine der vier danach vorgesehenen Fehlerfallprüfungen ausgeführt. Keine Wiederholung.

Zusätzlicher Fehler im Datei-Prüfprogramm: der fatale Kind-Catch ließ den
Heartbeat aktiv. Das Elternprogramm endete schließlich mit exit1; der tatsächliche
Drain-Kindexit/-Signalwert wurde vor der fehlgeschlagenen Assertion nicht gesichert
und bleibt UNKNOWN. Alle drei registrierten Kind-PIDs sind später unabhängig
abwesend. Eine Prozessabwesenheit wird nicht in eine fehlende Exitquittung umgedeutet.
Externe Cleanup-Prüfungen scheiterten vor einer Signalanforderung; keine Bindung
umgangen, kein externes Signal gesendet. Dies betrifft das Datei-Probekind,
nicht die bereits echte positive C-PostgREST-Abschlussquittung.

Die unabhängige neue native READ-ONLY-Abschlusslesung bestätigt500Profile/0aktiv.
Keine weiteren Datenbankvergleiche oder erfolgreichen Komponentenfälle wiederholt.
Die unvollständige neue End500-Anbindung wurde nicht ausgeführt und nicht aktiv
übernommen; ihr Entwurf bleibt privat erhalten. Der bedingte neue End500-Versuch
ist ungenutzt. Alle vorherigen Daten, FAILs und UNKNOWN-Befunde bleiben erhalten.
[Unabhängige Ergebnisabnahme](belege/w15-atomic-usage-integration-20261028/JOURNAL_IO_RESULTS_REVIEW.SAFE.json)
· [Messwerte](belege/w15-atomic-usage-integration-20261028/JOURNAL_IO_RUN_SUMMARY.SAFE.json)
· [Nullkontrolle und Prozesssicht](belege/w15-atomic-usage-integration-20261028/JOURNAL_IO_NATIVE_ZERO_AND_PROCESS_END.SAFE.json).

Im vorigen Sprint war die nächste Korrektur ausschließlich als **damals nicht
angewendeter, nicht ausgeführter** Patch vorbereitet: Drain-Vorbereitung mit höchstens64
wartenden Ereignissen je vorhandener15s-Barriere, fataler Kind-Exit und
echte Exit-/Signalanforderungsquittung als Datei vor jeder Ergebnisassertion.
Alle10.820Ereignisse bleiben erhalten; keine Frist-/RAM-Grenze wird erhöht.
[Vorschlag](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_FIX_PROPOSAL.SAFE.json)
· [unapplied Patch](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_FIX_UNAPPLIED.patch).

## Historisch vor D: Journal-Abbruchfix, gezielter Check PASS

Der ausdrücklich freigegebene Patch wurde gegen den exakten Quellhash geprüft.
Nur das Datei-Prüfprogramm wurde geändert; tatsächlicher Lauf auf HEAD `872a1bcf`
mit geänderter Datei SHA256 `7984a69b9a93c5700610708c0c324262e38a9c895830d7116972c30c722c22de`,
danach bytegleich in `7c4c25a7` versioniert. Journal-/Auth-Helper und
synchroner Rückweg bleiben bytegleich. Prefix-Barrieren bei höchstens64Einträgen
verhindern den belegten großen Vorbereitungsstau; letzte64Einträge unvermischt
für den echten Signalcheck. Sämtliche15s-Fristen und8MiB-Queue unverändert.
Exit-/Signalausgang, Kindlog und Ergebnisquittungen werden vor Erfolg mit
fdatasync synchronisiert. Fataler Kindfehler beendet den Prozess mit1 statt
Heartbeat-Leck; late-IO-Warten zusätzlich innerhalb derselben15s-Grenze begrenzt.

Gezielte Syntaxprüfung und unabhängiger statischer Review21Punkte bestanden.
Danach genau ein frischer begrenzter Check mit realem210s-Außenwächter:
`node scripts/lokal.js -- timeout --signal=TERM --kill-after=5s 210s node scripts/synthetik-500-w15-journal-io-check.js --run`.
Tatsächlicher Elternprozess-Exit0, kein Retry. Die vorher erfolgreichen normalen
Sync-/Async-Modi wurden über ihren exakten Ergebnis-/Payloadhash übernommen,
nicht erneut ausgeführt. Der alte GesamtFAIL und fehlende Exitbeleg bleiben erhalten.

| Neues tatsächliches Ergebnis | Befund |
| --- | --- |
| Exakte originale C-Payloads, einzeln unabhängig verglichen |10.820/10.820 |
| Kontinuierliche Journalzeilen inklusive Start/Abbruch |10.822 |
| Vollständige native Write-/fdatasync-Bestätigungen |10.822/10.822 |
| Letzte ACK-Sequenz / wartende Einträge |10.821 /0 |
| Dateiabwicklung |geschlossen, kein laufendes IO |
| Tatsächliches SIGTERM / Kind-Exit |einmal angenommen,143/Signalnull |
| Notfall-SIGKILL / verbliebener Kindprozess |keiner /keiner |
| Maximaler nativer Write-/Sync-Callback |10,677481ms /67,197749ms |
| Größte wartende Queue / unveränderte Grenze |23.610Bytes /8.388.608Bytes |
| Alle4vorher nicht ausgeführten Fehlerfälle |PASS |

Vorab festgelegte Fehlerfälle: echte partielle native31Byte-Schreibvorgänge und
unveränderlicher Snapshot; injiziertes Sync-EIO ohneACK; offene IO mit abgelaufener
Deadline ohne FD-Schließen/Wiederverwendung oder verspätetenACK; Queueüberlauf
ohne zusätzlichenACK. Jeder Fall hat eine eigene dauerhaft geschriebene Quittung.
Unfertige Vorgänge bleiben UNKNOWN. Keine HTTP-Anfrage, Datenbankänderung,
Auth-Operation, Unit, Aktivierung oder Modellaufruf. Kein neuer RAM-/Auth30-Beleg.
[Unabhängige Abnahme](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_RESULTS_REVIEW.SAFE.json)
· [Ergebnis](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_RUN_RESULT.SAFE.json)
· [echter Kindexit](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_CHILD_EXIT.SAFE.json)
· [Drainquittung](belege/w15-atomic-usage-integration-20261028/JOURNAL_DRAIN_RECEIPT.SAFE.json).

**Damals neue End500-Startbedingung UNKNOWN, deshalb vor Start gestoppt.** Unabhängig
aktuell1.563.443.200Bytes auf dem Workspace frei. Das historische konservative
1,88GB-Kopierplanbudget passt nicht mehr. Eine belastbare obere Grenze für die
zusätzliche Spitze aus frischer VFS-/Datenbankkopie, WAL, Logs und vollständigem
nativen Abschlussaudit ist nicht belegt. `SizeRootFs`, `SizeRw` und BASE überlappen;
keine Doppeladdition und keine vermeintlich präzise neue Bedarfszahl daraus ableiten.
Das bedeutet fehlende sichere Startreserve, keinen bereits eingetretenen ENOSPC.
Keine Daten gelöscht, verlagert oder verkürzt; keine neue Ressource gebaut.
Keine ungeprüfte asynchrone End500-Anbindung veröffentlicht und keine neue
Datenbank, kein Container und keine End500-Diagnose gestartet. Die bedingte
Einmalfreigabe bleibt ungenutzt. Historische gemeinsame8,4s-Lückenursache UNKNOWN.

## Übernommene und erhaltene Belege

Die ersten lokalen Vorbereitungen bleiben FAIL: A überschritt mit dem alten
Quellenzeitpunkt den9h-Routenzeitraum; B traf auf fehlende Spalten im Originalschema;
C konvertierte bereits verlustfrei, wurde dann von der unveränderten Netzsperre
wegen fehlender lokaler CLI-Umgebungswerte gestoppt. Keine dieser Vorbereitungen
war ein RAM-500er- oder Mock500-Gesamtversuch. Originaldateien und alte DBs bleiben
unverändert erhalten. [Fehlerübersicht](belege/w15-atomic-usage-integration-20261028/START_FAILURES.SAFE.json).

Die neue SQL-Vorprüfung deckt3.512 tatsächliche Abfragen ab:5 neue Parse/Describe-
Prüfungen, übrige über exakte frühere Hashes übernommen; keine Arbeitsabfrage
ausgeführt. Eine reine Python-Namenskorrektur änderte keine SQL-Bytes, daher alle
3.512 Parserbelege übernommen statt erneut ausgeführt. Der nachgewiesene alte
RAM-FAIL aus972 mit1.644.748.800Bytes/19,69% bleibt unverändert bestehen.

V8-Funktionsabdeckung wurde beim ohnehin notwendigen Ablauf gesammelt:
Nutzungsadapter15/16=93,75%, Kostenmodul41/48=85,42%, AI40/102=39,22%,
Storage63/458=13,76%. Begrenzter Funktionswert dieser Node-Prozesse, keine
Zeilen-/Branch-, Worker- oder Gesamtprojektabdeckung.
[Coverage](belege/w15-atomic-usage-integration-20261028/COVERAGE.SAFE.json).

## Freigabestand und nächster Schritt

**End500-D gescheitert vor erstem CAS; kein weiterer Versuch in diesem GO.**
Journal-/Lifecycle-/Codec-/Parserkomponenten gezielt unabhängig PASS; tatsächlicher
W15-End500-Runtime- und Speicherbeleg weiterhin offen. Der eine frische D-Versuch
stoppte an der Plattenreserve im Seed; keine neue Runtime-/Auth30-Abnahme.
Konkretes26-Dateien-Manifest oben ist ausschließlich ein Freigabevorschlag.
Vor jedem weiteren Versuch erst getrennt genehmigte Platzbereitstellung,
tatsächlichesdf, revidierten Anlageplan und neue unabhängige Startabnahme.
Keine Daten-/Beleglöschung oder neuen kostenpflichtigen Ressourcen ausgeführt.
Die tiefe historische C8,4s-Lückenursache bleibt UNKNOWN; kein alter unbestätigter
Schreibvorgang wiederholt und kein Timeout erhöht. Kein Mock500-Start.

Für den späteren Mock500-Start sind außerdem vier vorhandene Bindungen anzupassen:
alter4-Blob-Auth-Beleg auf die bereits geprüften12atomaren D-/EU-ACKs,
neuer974-Review mit echter RAM-Endabnahme, strikte Übernahme des500er-Quellen-PASS
über den belegten16+2-Quellvergleich und frische konsistente Laufverzeichnisse.
Diese Mock500-Lücken wurden nur lesend ermittelt; weiterhin keine Umsetzung.
Die vorhandene fachliche Qualifikation gilt ausdrücklich für28.10.; ein späterer
Tag braucht eine gültige ausgewiesene Kalenderbindung. Keine Signaturen wiederverwenden.
Der bisherige Full500-Controller ist im Integrationssprint ausdrücklich vor
jeder Wirkung gesperrt; historische Reviews erteilen dem neuen Speicherweg
keine Startfreigabe. Erst später frische Operation, Datenbank, Signaturen,
Quell-/Worker-/Auth-/RAM-Abnahme und vollständiges gültiges3h+30min-Zeitfenster.

CI auf Codekopf `e1a62acc`: [lokale Integrität40699087786](https://github.com/ernisch/helmut-pilot/actions/runs/40699087786)
grün; [Pflicht-CI40699087763](https://github.com/ernisch/helmut-pilot/actions/runs/40699087763)
ebenfalls abgeschlossen/grün (Browserlauf gemäß Prüfplan übersprungen).
Dies gilt für `e1a62acc`, nicht automatisch für `f8702304` oder den damaligen Code `d2920d6d`.
Neue Kopf-CI wird nach dem Push getrennt ausgewiesen; keine lokale Gesamtsuite
wiederholt. Der folgende Kopf `d823e95f` hat177/178Offline-Suiten bestanden;
allein `current-state-groesse-test.js` scheiterte an31.601>30.000Zeichen.
Die beiden historischen12.10.-Abschnitte wurden wortgleich archiviert
(SHA256`72622750e75961613b0ce7f7d37ad6cba61c30a5dabf45ed0aafd5233ae55d51`).
Der gezielte Größentest bestand danach4/4 bei25.901Zeichen; keine vollständige
lokale CI-Wiederholung. Neue Berichtsergänzungen bleiben unter der unveränderten Grenze.
Auf dem späteren Kopf `f534a1f7` sind Pflicht-CI
[40723672752](https://github.com/ernisch/helmut-pilot/actions/runs/40723672752) und Integrität
[40723672779](https://github.com/ernisch/helmut-pilot/actions/runs/40723672779) abgeschlossen/grün;
Browser gemäß Prüfplan übersprungen. Das ist kein CI-Beleg für `ee36720d`.
Neue Kopf-CI wird nach dem Push getrennt ausgewiesen; keine vollständige lokale
Suite oder manuelle CI-Wiederholung gestartet.
Auf dem folgenden Kopf `319bf131` sind Pflicht-CI
[40738479972](https://github.com/ernisch/helmut-pilot/actions/runs/40738479972) und Integrität
[40738480004](https://github.com/ernisch/helmut-pilot/actions/runs/40738480004) abgeschlossen/grün;
Browserausführung gemäß Prüfplan übersprungen. Kein Übertragen dieses CI-PASS
auf den neuen optionalen Journalcode `63f37c7d`; neue Kopf-CI separat.
Lokale Belege ersetzen keine Pflicht-CI. Der bekannte unveränderte Vercel-Konfigurationsfehler bleibt
außerhalb dieses Sprints: `functions.api/index.js.includeFiles` hat2.915Zeichen,
zulässig sind256. Keine Preview-/Production-Bereitschaft behauptet.

Auf Kopf `fdf69342` sind Pflicht-CI40748463046 und Integrität40748463085
abgeschlossen/grün, tatsächlicher Browserlauf laut Prüfplan übersprungen. Dies
gilt nicht automatisch für den danach lokal geprüften Codekopf `07b51319` oder
den neuen Dokumentationskopf; dessen automatische Kopf-CI wird separat gelesen.
Keine vollständige lokale Suite oder manuelle CI-Wiederholung gestartet.
