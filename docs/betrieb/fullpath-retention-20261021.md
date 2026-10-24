# Vollpfad, Speicherursache und begrenzte Laufzeitbeobachtung

Stand21.10.2026, Branch `codex/controlled-cleanup-and-late-probe-20261020`,
Entwurfs-PR927 auf926/925/924. **Lokale Diagnosevorbereitung geprüft;
Optimierungssprint insgesamt teilweise abgeschlossen.** Kein neuer Ressourcenlauf.

## Was am Motor bereits geändert wurde

Der alte PostgreSQL-Renderer materialisierte große vollständige Zwischenmengen.
Der integrierte Renderer verarbeitet diese mit einem Tiefenstapel und Fragmenten;
Kontrollleser, kompakter Kontrollcache und kalte Hashprojektion sind eingebunden.
Der bestehende vergleichbare OLD–NEW–NEW–OLD-Nachweis bleibt unverändert:
1.170.790.400→1.015.904.256B gemeinsamer Komponentenpeak,
154.886.144B/13,23% weniger. Das ist eine belegte strukturelle Änderung,
keine bloße Speicherbegrenzung. [Vergleich](combined-auth-memory-comparison-20261020.md).

Die neue Quellprüfung verfolgt Descriptor→Installation→Katalog→Leser→Schreiber
bis zum lokalen vollständigen Motorpfad. Kein fehlender Installationsaufruf
gefunden. Produktstand6d528425, U93917a57/Partsf30089e7 und c8624f7c bleiben
erhalten. Eine neue vollständige Laufzeitabnahme dieser Kombination fehlt weiterhin.

## Was der alte vollständige Verlauf tatsächlich zeigt

Im selben V11-Fall, zwischen06:29:18.713 und09:01:59.693UTC, steigt der gemeinsame
Anonymspeicher um523.546.624B: Anwendung+264.921.088B, Datenbank+258.625.536B,
Storage unverändert. Der Dateianteil steigt separat um549.806.080B.
Das sind zeitgleiche Endpunktdifferenzen, keine addierten Einzelspitzen.
V11 verwendete alten Code und ein anderes Node-Budget; diese Werte sind keine
verbleibende Last oder Einsparung des aktuellen Motors.

Der große alte Anwendungsprozess ist durch Runtime-Höchstwert und HTTP-Zahlen
plausibel zugeordnet; ein strenger Host-PID-/Startzeit-/Namespace-Beweis fehlt.
Die Originaldaten enthalten keine passenden Isolate-Heap-/external-/GC-Reihen.
Die vier kleinen SQL-Hilfsproben erklären den Anstieg nicht. Der aktuelle
27-RPC-Authfall ersetzt weder den vollständigen Ablauf noch dessen lange Lebensdauer.

Der originale Beobachter hält83.483 Anfrage- und24.495 Ereigniszeilen sowie
4.000 Mutationen und500 Scopes bis zum Prozessende. Die gesamte kompakte
JSON-Darstellung beträgt19.214.980B; das sind keine RAM-Bytes. Verschachtelte
Scope-Diagnosen dominieren diese Darstellung nicht. Die fertigen JSON-Zeilen
bewahren ihre Reihenfolge und einzelne Zeitfelder, aber keine vollständige
sammlungsübergreifende Entstehungs-/Änderungsfolge oder tatsächliche Closure-/GC-Lebensdauer.
Ein vereinfachtes Replay wurde deshalb nicht als Ursachenmessung gestartet.

Auch auf Datenbankseite ist kein weiterer großer vermeidbarer Eigentümer belegt:
der Schreiber überträgt bereits neue Graphknoten, die vollständige Verbrauchshistorie
bleibt erforderlich. Relation-/TOAST-/Indexgrößen, erreichbare historische Wurzeln
und Prozessspeicher sind nicht hinreichend verbunden. Kein spekulatives Löschen,
VACUUM, Graph-GC oder weiterer Snapshotumbau aus diesen Daten.

## Neu implementiert: Beobachtung im tatsächlichen Laufpfad

`native-node-budget.js` nutzt seinen bereits gebundenen Quell-/Ausgabe-/Mountpfad.
Eine neue, ausdrücklich lokale Beobachtung erfasst im Runtime-Hauptisolate
`process.memoryUsage`, V8-Heapstatistiken einschließlich physischer Heapbytes,
Heap-Spaces, kumulierte gelieferte GC-Ereignisse und acht Sammlungsanzahlen.
Keine Arbeitsobjekte, einzelnen GC-Einträge oder Anfragetexte werden gespeichert.
Kein Timer, Heapdump, erzwungener GC, Cacheleeren oder Peakreset.

Die exakten nullbasierten Indices sind0,24,49,…474,499. Die echte lexikalische
`actual_J_enter`-Stelle und `local_unit_http_complete` liefern je21 Messpunkte.
Initialpunkt sowie Vor-/Nachabschluss ergeben45 normale Frames, maximal100
Frames/1MiB und16KiB je Zeile. Eine neue exklusive Datei0600 bleibt bis zum
Schluss unter derselben Messung. Fehler/kurzer Write sind terminal; nach einem
Samplefehler erfolgt kein weiterer Samplewrite und kein erfundener Abschluss.

Nur die privat gerenderten Vorlagen ändern sich bei explizitem nativem Budget;
Originalvorlagen, Produkt, SQL, Journal und sämtliche Geschäftsprüfungen bleiben
unverändert. Vorherige Freigaben werden dadurch nicht erneuert. Die bestehende
vollständige Quellenbindung schließt die geänderte Native-Node-Datei bereits ein;
alte Abnahmen gelten nicht automatisch für diese neuen Bytes.

Im Fehlerpfad werden ursprünglicher begrenzter Fehler und Exitcode1 vor weiterer
Beobachtung gesichert. Ein anschließender Beobachterfehler kann den Promisefehler
ändern und die Ergebnisdatei verhindern; der ursprüngliche Fehler bleibt im stderr.
Schließfehler erzwingen ebenfalls Exit1. Export gilt erst nach zurückgekehrtem
ursprünglichem `io.save` als geschrieben; beide Erfolgs-/Fehlerpfade schließen.

Interpretationsgrenzen: RSS umfasst alle Threads, Heapwerte nur dieses Isolate.
`arrayBuffers` ist in `external` enthalten; physische Heap-/Spacewerte überlappen.
GC-Callbacks können nachlaufen. Lokale PID/Startticks/NSpid/Namespace, soweit lesbar,
sind kein erfundener Host-PID-Nachweis. Der Vorabschluss liegt vor Metadatenprüfung
und Assessment: Das Intervall umfasst Assessment, JSON, Buffer und Schreiben,
keine isolierten JSON-Kosten. Gemeinsamer nativer Peak, Prozessexit, EOF und
Gruppenleerstand bleiben separat erforderlich. Kein neuer RAM-Gewinn behauptet.

## Gezielte Prüfung und unabhängiger Review

Final26 Node-Fälle/31 kurze lokale Kindprozesse PASS, einschließlich45 echter
Skalarmesspunkte, Dateiexklusivität, kurzer Writes,100-Framegrenze und Abschluss.
Der GC-Codec prüft synthetisch gelieferte Einträge aller fünf tatsächlich
gepinnten Node24-Kinds1/2/4/8/16; kein GC wurde angefordert. Vor der Korrektur
waren25 Fälle/30 Kinder bestanden; diese Quellen und Logs bleiben erhalten.

19 Stagingfälle: zunächst18 PASS/ein fehlender `subprocess`-Testimport.
Nach Importkorrektur nur dieser Fall erneut PASS, kein neuer19er-Gesamtpass
behauptet. Er führt die tatsächlichen gerenderten Observer-/Runtimequellen mit
inerten Geschäfts-/Transportabhängigkeiten und fester Fixturezeit aus:
lexikalischer Begin-Hook, End-Hook, unveränderte öffentliche Metadaten sowie
Erfolg, Primärfehler, Savefehler und zusätzliche Beobachterfehler geprüft.
Dabei sind vor allem Units/Ereignisse befüllt; Request-/Mutations-/Scope-
Lebensdauern werden durch diese inerte Prüfung nicht vollständig abgedeckt.
Die500 Fixtureiterationen sind keine500 ausgeführten Motorprofile.

Zusätzlich aktuelle Bounded-/Sender-Descriptor-Komposition mit nativem Budget:
26 Originalvorlagen,24 JS-Syntaxprüfungen und2 Python-ASTs PASS; nur Sequenz,
Observer und Runtimevorlage zusätzlich verändert. Keine Ressourcen/GO-Datei erzeugt.
Die1MiB-/16KiB-Grenzen sind quellengeprüft, im Negativtest wurde die100-Framegrenze
erreicht. Keine Wiederholung der179 Produktsuiten/95 nativen Vergleiche:
Produkt-/SQL-/Budget-/Autoritätsprüfungen sind unverändert; nur lokale
Beobachtung und ihr Staging wurden ergänzt und gezielt geprüft.

Der erste unabhängige Quellreview fand die Verdeckung des ursprünglichen Fehlers;
sein FAIL-Bericht bleibt erhalten, die Korrektur ist gesondert geprüft.
Unabhängige SOL-Quell- und Nachweisprüfung sind Belege dieser lokalen Vorbereitung,
keine modellübergreifende Production- oder vollständige500er-Endabnahme.

## Tatsächliche Grenze und nächster Schritt

Ein vorhandener `next`-Handler darf keinen beliebigen späten Index wiederholen.
Der authentische V11-Schritt499 wurde bereits entered und ist fehlgeschlagen;
Zeitfenster/Claim/GO sind verbraucht. Eine DB-Kopie oder ein neuer Prozess erneuert
sie nicht und stellt die alte153-Minuten-Heapgeschichte nicht her.
Keine Umgehung für einen vermeintlichen kleinen echten Profiltest.

Fünf geschützte Container sowie Metadaten der kanonischen827a-Quelle unverändert,
kein Original-DB-Payload gelesen. Im Endsnapshot14.957.916.160B frei;
221.863.560B fehlen zu15.179.779.720B Volladmission. Snapshot, keine Reservierung.
Keine weitere Bereinigung gebundener Ressourcen, Archivierung, kostenpflichtige Kapazität oder
RAM-Ersatzlösung. Historische Originalcloud bleibt nicht direkt angebunden.

Die Beobachtung ist für einen später sachlich und rechtlich zulässig gestarteten
echten Ablauf vorbereitet. Aktuell kein weiterer vorhandener Spät-Replay qualifiziert.
Zuerst echte gleichphasige Heap-/extern-/GC-/Sammlungsdaten mit gemeinsamem RAM
verbinden; erst danach einen weiteren großen Umbau wählen. Kein Volltest zum
Probieren und keine neue allgemeine Repositoryanalyse.

500 aktive Profile/1500 brauchbare Positionen, Zeiten und500MB Puffer bleiben
offen. Kein vollständiger500er technisch freigegeben oder empfohlen:
ausreichende Platte, frische Quellen-/Fall-/Zeitbindung,32 Startbedingungen,
unabhängige Annahme und neues konkretes GO erforderlich. Der bestehende
DeepSeek-Startvertragskonflikt zur aktuellen SOL-only-Vorgabe bleibt unverändert.
Keine Production-/Merge-/Deployment-/Router-/Kosten-/Reserveänderung.
Gleicher Thread; Denkstufe Sehr hoch.

Öffentliche bytegleiche Nachweiskopien und Pins:
[Manifest](belege/fullpath-retention-20261021/REVIEWABLE_COPIES.SAFE.json).
Private Rohbelege und unveränderte Originale bleiben außerhalb von Git unter
`/workspace/helmut-ram-fix-20261020/fullpath-retention-20261021` bzw. den gebundenen
V11- und CAS-Verzeichnissen. Die früheren roten CI-/Vercel-Befunde bleiben offen;
übersprungen ist kein bestandener Test.
