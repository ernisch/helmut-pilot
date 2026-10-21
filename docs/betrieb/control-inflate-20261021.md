# Kontrollcache: einzelne Dekompressionskopie, echter Vergleich vom 21.10.2026

Der Kandidat beseitigt eine nachgewiesene vollständige Ausgabekopie beim
Entpacken, besteht aber die vorab festgelegte gemeinsame RAM-Abnahme **nicht**.
Er bleibt außerhalb des Motors. Der aktive Produktcode `6d528425` mit
U-SHA256 `93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b`
und Parts `f30089e7` bleibt unverändert. Die früher belegte gemeinsame
Auth-Komponentenersparnis von 154.886.144 Bytes bleibt separat gültig.

## Konkrete Änderung und Sicherheitsgrenzen

Der tatsächliche eingebettete `node:zlib`-Quelltext des gepinnten Node 24.19.0
ist bytegleich mit dem öffentlichen Tag: SHA256
`399cb4e2b3f31269cc52278a1f1bb4ab7838e3c0ccdc5262e41a8824b1f438a5`.
`processChunkSync` sammelt standardmäßig 16-KiB-Stücke und erzeugt anschließend
mit `Buffer.concat` eine weitere vollständige Ausgabe. Sein nativer Handle
ist vor der Rückgabe geschlossen; daraus folgt kein Handle-Leck.

Kandidat U `40d7e584e7856ea893a491d0598ca55b071fc9a07d2dfeb72d55cd10b14b9d1a`
setzt nur für bereits validierte komprimierte Kontrollansichten mit
2 MiB < Textgröße <= 8 MiB `chunkSize = textBytes + 1`. Das zusätzliche Byte
verhindert den Pufferwechsel bei exakt gefüllter Ausgabe. Größere Ansichten
behalten den bisherigen Weg. Die maximale Ausgabe bleibt `textBytes`;
Hash, genaue Länge, vollständiger Eingangsverbrauch und striktes UTF-8 bleiben
unverändert, ebenso 2-MiB-Cache- und 256-MiB-Logikgrenze.

Ein beschädigter, ansonsten formal gültiger privater Cachezeuge kann nun vor
der Ablehnung bis zu 8.388.609 Bytes Arbeitspuffer belegen. Diese begrenzte
Voraballokation ist dokumentiert. Weder sofortige Speicherfreigabe noch eine
RSS-Ersparnis folgen allein aus der vermiedenen Kopie.

Vier gültige Größen einschließlich Unicode und beider Grenzen sowie zehn
Negativfälle sind bestanden. Der native Ausgabe-Concat entfällt im gewählten
Bereich und bleibt oberhalb erhalten. Bestehende Kontrollleser-Prüfungen:
19 Gruppen und 42 Negativfälle bestanden. Für die neue Vergleichsauswahl:
36 Guards, fünf Python-ASTs, eine Node-Syntaxprüfung und fünf Hostfälle
mit tatsächlichen Exits 0/1/1/1/1 bestanden. Der neue reproduzierbare
Diagnoseeinstieg wurde separat mit denselben 14 Fällen bestanden; sein Ergebnis
ist exakt gleich dem ursprünglichen Testbeleg.

## Gleicher Ablauf, vier echte gemeinsame Lebenszeitpeaks

Dies ist **kein** neuer Vergleich gegen den ursprünglichen V11-Code.
BEFORE ist bereits integrierter U939, AFTER nur U40d7. Beide verwenden dieselben
Parts f300, korrigierten NEW-Renderer und NEW-Graphen, dieselbe authentische
späte Quelle827a, vollständige persistente Kopien, Runtime und Einstellungen.

Nach einem frischen Null-Auth-/Null-Node-Lebenszyklus folgen vier separat
adoptierte Fälle in festgelegter Reihenfolge. Pro Workfall unverändert:
27 echte RPCs, fünf vollständige Reads, vier bestätigte CAS, 18 Kontrollen,
drei Mutationen und Wiederherstellung, sechs Grenzen desselben Node-Prozesses.
Keine Historienzeile wird hinzugefügt, kein unbekannter Schreibausgang wiederholt.

| Reihenfolge | Variante | Gemeinsamer Peak, Bytes | CPU, Sekunden | Gesamtdauer, Sekunden |
| --- | --- | ---: | ---: | ---: |
| 1 | BEFORE | 1.037.365.248 | 32,256723 | 32,667373306 |
| 2 | AFTER | 1.019.125.760 | 34,029183 | 34,113834016 |
| 3 | AFTER | 1.018.159.104 | 32,513580 | 32,558873102 |
| 4 | BEFORE | 1.005.346.816 | 34,209588 | 34,478523783 |

Mittel: 1.021.356.032 -> 1.018.642.432 Bytes. Die Differenz von 2.713.600 Bytes
beweist keine Ersparnis: Die Einzelwerte überlappen. Paarweise Einsparungen
sind +18.239.488 und -12.812.288 Bytes. Die vorab festgelegte Bedingung
`max(AFTER) < min(BEFORE)` scheitert. Mittlere CPU +0,115024 Prozent und
Wandzeit -0,704719 Prozent erfüllen die separate Laufzeitregel, ersetzen
aber den fehlenden RAM-Nachweis nicht.

Der frische Lebenszyklus besteht mit 654.012.416 Bytes und 19,213210082 Sekunden.
Alle Messungen zählen die vollständige native Gruppe bis zum letzten eigenen
Prozessende, einschließlich Einrichtung, Installationen, Datenbank und Cache.
Kein Peakreset, Zwangs-GC, Cacheleeren, neuer Allocator oder nativer Zusatz.
Unverändert: native max 1.547.997.184/high 1.399.996.416/swap0, Node384+16MiB,
Auth30/fetch20/SQL30/lock1s, gesamter Node-Abschnitt30s, Capture256KiB,
Fallbelege4MiB, persistente Kopie768MiB, Hostreserve8GiB. Keine kalten Caches behauptet.

## Funktionale Abnahme und zeitliche Eingrenzung

Alle fünf Fälle sind unabhängig funktional bestanden: 108 echte Work-RPCs,
92 geprüfte Historybindungen, 72 Graphbindungen, 36 vollständige Hashprüfungen
aller 6000 historischen Zeilen, 24 Grenz-Tripel und 68 Work-Captures.
Originalhashes, physische 606 Bytes, Daten, CAS-/Nonce-/ACK-Bindungen,
Katalog/ABI/ACL und ursprünglicher Zustand bleiben korrekt; nur die erwartete
frische Revision ändert sich. Node, PostgreSQL und äußere Starter enden mit0,
Logs erreichen EOF, alle nativen Events sind0, alle eigenen Gruppen leer.
PostgRESTs ursprüngliche signierte -2-Abschlussregel ist vollständig erfüllt.

Neue reine Metadatenanalyse dieser vier Fälle: Alle endgültigen Peaks werden
erst **nach** der sechsten Grenze, also nach allen Kontrollaufrufen, erstmals
beobachtet. Einrichtung liegt bei rund636,9–643,4MB; der Abschluss erhöht die
Peaks nicht. Ein konservatives Zeitmodell ordnet drei Peakklammern
`restore.write` zu; beim ersten BEFORE bleiben Write und letzter Read möglich.
Das Modell setzt stabile Zeitbasis und sequenzielle Readbacks voraus.
Eine exakte Node-/Server-Aufteilung am Peak ist nicht belegt. Später gelesene
`memory.stat`-Werte liegen unter dem echten Highwater und werden nicht als
dessen Zerlegung ausgegeben. File enthält shmem; external enthält ArrayBuffers.

Nächste notwendige Eingrenzung ist deshalb der vollständige späte Schreibpfad:
Snapshot, Parts, RPC, Attach oder die zusätzliche `verifyLogical`-Ergebnisprüfung.
Vorbereitet wird ein frischer isolierter Null-Auth-/27-RPC-Fall mit höchstens
14 Phasenframes/48KiB Zusatzmetadaten nur am letzten Write/Read. Er ist eine neue
Diagnosefrage, kein Wiederholungsversuch des Dekompressionskandidaten und kein
Nachweis für ein Plateau oder den langen 30-Runden-Verlauf.

## Kontrollierte Entfernung der Arbeitskopien

Nach vollständiger Abnahme wurden ausschließlich die fünf zuvor als entbehrlich
klassifizierten PASS-PGDATA-Kopien entfernt: 8555 reguläre Dateien,
1.849.139.200 Bytes gesamte Inventarblöcke, davon1.848.442.880 reguläre Dateiblöcke.
Jeder Fall hatte eigene frische Prüfung, Nonce, befristete Adoption und Once-Claim;
alle fünf tatsächlichen äußeren Löschaufrufe endeten mit0. Alle465 Fallbelege,
15 gestoppten Containerhüllen, Quellen, Images, Volumes, Loops und Gitstände bleiben.
Kanonische Quelle827a und ihre17 permanenten Rekonstruktionsabhängigkeiten sowie
die fünf geschützten Originalressourcen einschließlich Bank sind unverändert.

Ein rein lesender Prüfaufruf hatte keine abrufbare äußere Tool-Abschlussmeldung.
Sein vollständiger frischer PASS-Beleg wurde vom ausschließlich nach Kind-Exit0
schreibenden Wrapper erhalten. Keine Wiederholung und kein erfundener äußerer
Exit0; der getrennte tatsächliche Löschaufruf ist mit Exit0 nachgewiesen.
Nicht einsehbare fremde Prozessfelder werden nicht zu globaler Nutzungsfreiheit erklärt.

Unabhängiger END-Snapshot: 15.106.445.312 Bytes frei, weiterhin73.334.408 Bytes
unter Volladmission15.179.779.720. Weitere Belege benötigen Platz;
keine Reservierung und keine zusätzliche sichere Rückgewinnung angerechnet.
Die ursprüngliche Cloudinstanz bleibt direkt nicht angebunden; gearbeitet wird
mit der autorisiert übernommenen authentifizierten lokalen Quelle.

## Belege, Reproduktion und verbleibendes Ziel

Arbeitsbranch `codex/controlled-cleanup-and-late-probe-20261020`, Entwurfs-PR927,
gesicherte Fortsetzungsbasis `a62a672f`; c8624f7c bleibt erhalten.

- [Root-Vergleich](control-inflate-comparison-20261021.SAFE.json)
- [Unabhängige vollständige Abnahme](control-inflate-sol-review-20261021.SAFE.json)
- [Gezielte Qualifikation](control-inflate-qualification-20261021.SAFE.json)
- [Zeitliche Eingrenzung](control-inflate-peak-attribution-20261021.SAFE.json)
- [Root-END](control-inflate-retirement-20261021.SAFE.json)
- [Unabhängiger END](control-inflate-retirement-sol-review-20261021.SAFE.json)

Reine synthetische Codecdiagnose, mit gepinntem Node24.19.0 und ohne Datenbank:

```sh
node scripts/lokal.js -- /opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --max-old-space-size=384 --max-semi-space-size=16 scripts/helmut-resource-meter/control-inflate-codec-check.js
```

Diese Diagnose ist kein normaler Node22-CI-Test. Die allgemeine CI-Auswahl und
alle alten Quellenfreigaben bleiben unverändert. Die179 bestandenen Produktsuiten
und95 nativen SQL-Vergleiche werden wegen dieses unveränderten Produktumfangs
nicht lokal wiederholt. Bekannte CI-Fehler wegen fehlender privater Originalvorlagen
und die separate Vercel-Konfiguration bleiben offen; übersprungene Tests sind kein PASS.

Das 500er-Ziel und der echte500-MB-Puffer bleiben offen: exakt500 aktive Profile,
1500 brauchbare Positionen, Offline90/Unit60/Auth30 und16 frische Kontrollen je
Profil über den vollständigen Ressourcenablauf sind hier nicht nachgewiesen.
Kein stabiler langer Speicherverlauf und keine Erfolgsgarantie. Alte GOs sind
verbraucht; ein vollständiger Lauf benötigt32 frische Bedingungen, ausreichende
Platte und ein neues konkretes GO. Keine Production-, Merge-, Deployment-,
Router-, Modell-, Kosten- oder Reserveänderung aus diesem Versuch.
