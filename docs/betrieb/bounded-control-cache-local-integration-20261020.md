# Späte Kontrollsicht: kompakter Cache und tatsächlicher Vergleich

Der neue lokale Kontrollcache ist eingebunden. Der belegte Cachemiss ist
beseitigt: Die unveränderte Kontrollsicht hat4.856.607 UTF8-Bytes und passte
zuvor nicht in den2MiB-Cache. Das verursacht wiederholte vollständige
Graphantworten und Serialisierungen. Die Korrektur vermeidet diese Arbeit;
**eine robuste Verringerung der gemeinsamen RAM-Spitze ist nicht belegt**.
Der Speichersprint und der500MB-Puffer sind deshalb weiterhin teilweise offen.

## Konkreter Umbau und erhaltene Grenzen

Kandidat67b5c4ef wurde alsb179e6b4 übernommen. Kleine Kontrollsichten behalten
ihren bestehenden Textcache. Große, vollständig geprüfte Sichten werden in
einem eigenen komprimierten Buffer innerhalb derselben2MiB-Grenze gehalten.
Die ursprüngliche Textlänge undSHA256 werden gespeichert. Wiederverwendung
verlangt weiterhin frische native Prüfungen und danach begrenzte vollständige
Dekomprimierung, exakte Länge, vollständigen komprimierten Eingang, SHA256
und gültigesUTF8. Ungeeignete oder nicht ausreichend komprimierbare Daten
führen zum bestehenden vollständig geprüften Lesepfad.

Die bestehende256MiB-Grenze für logischen Authtext wird nur exportiert;
Decoder, Datenmodell und Budget ändern sich dadurch nicht. Vollständige
Schreibsnapshots, ACK-/Receipt-/Konfliktregeln und fehlender automatischer
Retry bei unbekanntem Ausgang bleiben erhalten. Es gibt keinen Router- oder
DeepSeek-Aufruf und keine Modell-/Kosten-/Reserveänderung.

[Unabhängige Codeprüfung](bounded-control-cache-code-sol-review-20261020.SAFE.json),
[ursprünglicher tatsächlicher Cachemiss](local-control-cache-baseline-20261020.md).

## Vergleich am authentischen späten Datenbankzustand

Alle Fälle verwenden neue isolierte persistente Kopien derselben vollständigen
Quelle827a9872…:1709Dateien/369.399.611Bytes,6000historische Datensätze.
Originale und laufende Originalbank bleiben erhalten. Beide Varianten laden
dieselben Parts-Bytesf300…; deren einzige Änderung gegenüber6b… ist der Export
der bereits bestehenden Grenzkonstante. OLD lädtU31a…, NEW lädtU939….

Je Fall: fünf vollständige Reads, vier echte bestätigte CAS-Schreibvorgänge,
18Kontrollreads; drei temporäre Änderungen und abschließende Wiederherstellung.
Genau27echte RPCs/Antworten, ein Nodeprozess, keine Provideraufrufe.
Die Reihenfolge ist OLD–NEW–NEW–OLD, mit getrennter frischer Root-Adoption
je Fall und vorherigem frischem Null-Auth-/Null-Node-Abschlusscheck.

| Fall | Gemeinsame Lebenszeitspitze, Bytes | Lebenszeit, s | Nodeclient, s |
|---|---:|---:|---:|
| OLD1 `34fed1…` |1.019.572.224|36,761|14,692|
| NEW1 `f4fc95…` |1.002.266.624|34,405|12,647|
| NEW2 `2aa650…` |1.016.721.408|31,156|11,540|
| OLD2 `a11e08…` |1.014.566.912|33,962|13,627|

Die paarweisen Differenzen NEW minus OLD sind−17.305.600 und+2.154.496Bytes.
Die Bereiche überlappen; der beschreibende Mittelwertunterschied−7.575.552Bytes
ist kein reproduzierbarer kausaler RAM-Nachweis. Unterschiedliche Cache- und
GC-Zustände bleiben sichtbar. Node-RSS und einzelne Spitzen werden nicht zum
gemeinsamen Kernelwert addiert. Die gleichzeitig beobachteten anon/file/kernel-
Werte an Zyklusgrenzen zerlegen nicht die exakte historische Gesamtspitze.

Reproduziert ist die Verringerung der HTTP-Antwortkörper von157.016.193 auf
57.089.403Bytes je Fall, der Kontrollserialisierungen von41 auf5 und der
vollständigen Graphantworten bei15der18Kontrollreads. Das sind Arbeits- und
Übertragungsmengen, keine residenten Speicherwerte. Die mittlere gesamte
CPU-Zeit sinkt von36,405 auf33,057Sekunden. Drei Mutationsrunden beweisen
weder ein langfristiges Plateau noch500gleichzeitig aktive Profile.

[Tatsächlicher Vergleich mit Zeit-, CPU- und Zykluswerten](control-cache-actual-abba-20261020.SAFE.json),
[unabhängige Prüfung aller fünf tatsächlichen Fälle](control-cache-actual-abba-sol-review-20261020.SAFE.json).

## Sicherheit und Quellenannahme

Alle vier Vergleichsfälle behalten identische logische Kontroll-/Historyhashes,
die6000er-Verbrauchslinie und den ursprünglichen Merkle-Root nach Entfernen des
temporären Probes. Physisch darf ausschließlich die echt bestätigte neue
CAS-Revision samt unabhängig gemessener physischerSHA abweichen. Katalog,
ABI und Berechtigungen sind darüber hinaus identisch. Alle eigenen Prozesse
sind beendet, alle nativen Gruppen leer und sämtliche Speicherereignisse null.

Der frühere V8-Fall`1ec969…` bleibt FAIL: Das Messprogramm erfasste eine
temporäre Markerdatei während ihrer atomaren Umbenennung; Node wurde beendet
und vollständig reapet. Der eng begrenzte V9-Fix zählt ausschließlich den
veröffentlichten regulären bekannten Marker mit konservativen512Bytes;
andere verschwundene Dateien bleiben Fehler. Alle fünf V9-Fälle wurden neu
qualifiziert; ein älterer Abschlussnachweis wurde nicht übertragen.

[Historischer unvollständiger V8-Vergleich](control-cache-incomplete-v8-sol-review-20261020.SAFE.json),
[unabhängige Prüfung des Markerfixes](control-cache-marker-race-sol-review-20261020.SAFE.json).

Commit6d528425 ergänzt eine eigene lokale Quellenannahme. Sie prüft die
tatsächlichen regulären, kanonischen und begrenzten SAFE-Dateibytes samt Hash
und die exakt aktuellen U-/Parts-Quellen. Eine fehlende oder bloß formal
gültige Pinangabe genügt nicht. Die historische W50-Quellenannahme bleibt
historisch; ausschließlich die zwei separat qualifizierten Quellendeltas
ersetzen deren aktuelle Hashprüfung. Alle anderen Prüfungen bleiben bestehen.
Die vier neuen Eingaben erreichen die vorhandenen Quellendeskriptoren und
damit deren gemeinsame schreibgeschützte Runtime-Dateibindung. Ohne bestehenden
Control-Opt-in werden Helper und neue Nachweise nicht geladen.

Der Offline-Verifier las362eindeutige Datei-Pins, darunter336Fallbelege;
die zusätzliche unabhängige Actualprüfung umfasst435Fall-/Nodebelege.
Private tatsächliche Pinpfade sind nachvollziehbare Herkunft. Zur Laufzeit
werden die gehashten SAFE-Bytes geprüft; es wird keine erneute Ausführung der
privaten Messung behauptet. Neue Gesamtmotor-/500er-Ausführung und RAM-Erfolg
sind in dieser Annahme ausdrücklich nicht qualifiziert.

[Native Quellenqualifikation](../../scripts/helmut-resource-meter/control-cache-native-qualification-20261020.SAFE.json),
[Generierung aus tatsächlichen Belegen](control-cache-native-proof-generation-20261020.SAFE.json),
[unabhängige Prüfung der Ausgabe](control-cache-native-proof-sol-review-20261020.SAFE.json),
[unabhängige Prüfung des Quellen-Gates](control-cache-source-gate-sol-review-20261020.SAFE.json).

34gezielte Quellen-Gate-Prüfungen und22bestehende Integrationstests bestehen.
Die einmalige vollständige Offline-Abnahme auf6d528425 besteht:179/179
Suiten in653Sekunden. [Tatsächlicher Abschlussnachweis](control-cache-final-validation-20261020.SAFE.json). Frühere179/95Ergebnisse werden nicht auf den
geänderten Umfang übertragen.

## Offener Speichervertrag und nächste Entscheidung

Maximal1.548.000.000 gemeinsame Bytes bei exakt500aktiven Profilen,
1.500brauchbare Ergebnisse, Offline90/Unit60/Auth30 und sämtliche frischen
Sicherheitskontrollen bleiben offen. Ein kleiner Komponentenlauf ersetzt das
nicht. Die verbleibende gemeinsame Spitze lässt sich bisher nicht eindeutig
einem einzelnen Allokator zuordnen. Die V9-Zeitklammern ordnen OLD1 dem
abschließenden Schreibfenster und NEW2/OLD2 der dritten Mutation zu; NEW1
bleibt zwischen vollständigem Read, Mutation und Zwischenaufwand unbestimmt.
Das belegt keine verursachende Allokation. Eine weitere strukturelle Änderung
benötigt die Prozesszuordnung in diesen Fenstern;
keine weitere Flagumschaltung oder Minioptimierung auf Verdacht.

[V9-Operationszuordnung mit Unsicherheitsgrenzen](control-cache-v9-operation-memory-20261020.SAFE.json),
[historische V8-Zuordnung](control-cache-v8-operation-memory-20261020.SAFE.json).
Ein vollständiger500er ist derzeit nicht technisch empfohlen. Er benötigt
weiterhin32frische Startbedingungen, ausreichende Platte und ein neues
konkretes GO. Der alte Startvertrag bindet außerdem weiter DeepSeek; das
passt nicht zur aktuellen SOL-only-Anweisung und wird nicht umgangen.
Production, Merge und Deployment sind nicht freigegeben.
