# Später Auth-Schreibpfad: echte Phasenmessung vom 21.10.2026

Der einzelne isolierte Diagnosefall ist funktional und unabhängig bestanden.
Die gemeinsame Lebenszeitspitze liegt bei **1.039.151.104 Bytes**. Der größte
zusätzliche Peak entsteht im Zeitfenster der atomaren Datenbankanfrage. Ein
einzelner Allokationsverursacher oder ein neuer Speicherfix ist damit nicht
bewiesen. Der aktive Motor bleibt unverändert auf Produktstand `6d528425`,
U93917a57/Partsf30089e7; der negative Inflate-Kandidat bleibt draußen.

## Tatsächlich ausgeführter Umfang

Vorher getrennt eingefrorener V2-Vertrag: frischer Lebenszyklus ohne Auth/Node,
danach genau ein CURRENT-Fall mit derselben authentischen späten Quelle827a,
NEW-Renderer/Graph, Runtime, persistenten Kopien und unveränderten Budgets.
Je Start eigene frische Root-Adoption; kein automatischer Executor oder Retry.

| Fall | Gemeinsamer Lebenszeitpeak, Bytes | CPU, Sekunden | Dauer, Sekunden |
| --- | ---: | ---: | ---: |
| Null-Auth-/Null-Node-Lebenszyklus | 653.615.104 | siehe Originalbeleg | 18,586201266 |
| Später Schreibpfad, 27 RPC | 1.039.151.104 | 32,250197 | 32,928936332 |

Der Workfall enthält fünf vollständige Reads, vier bestätigte CAS,
18 Kontrollreads, drei Mutationen plus Wiederherstellung und sechs Grenzen
desselben Node-Prozesses. Die 14 synchronen kleinen Messframes laufen nur um
das letzte `restore.write` und den abschließenden vollständigen Read.
`restore.write` ist ein normaler CAS, kein Aufruf von `state_restore_v1`.

Der Diagnoseoverlay ergänzt sechs skalare Hooks; ohne diese ist U bytegleich
mit dem aktiven U939. Die ursprünglichen JSON-Kopien, `Parts.build`, HTTP-
Serialisierung, Diagnose-Requestbody-Beobachter, ACK-Prüfung, Attach und
Ergebnisprüfungen bleiben in Reihenfolge und Inhalt unverändert. Die Metadaten
belegen 20.251 Bytes bei höchstens49.152 Bytes; kein Eingangsobjekt wird gehalten.
Die 37 eingefrorenen Starterdateien und ihr Host bleiben nach den Fällen unverändert.

## Was die 14 Messpunkte tatsächlich zeigen

| Intervall | Peak vorher, Bytes | Peak nachher, Bytes | Zuwachs, Bytes |
| --- | ---: | ---: | ---: |
| Snapshot-Erfassung | 1.027.653.632 | 1.031.090.176 | 3.436.544 |
| Nach Body-Beobachter bis geparste RPC-Antwort | 1.031.090.176 | 1.039.151.104 | 8.060.928 |

Alle anderen Zwischenintervalle und alle inneren Frameklammern zeigen keinen
weiteren Highwater. Der endgültige Kernelpeak ist bereits beim siebten Frame
erreicht. Attach, Historypflege, `verifyLogical`, vollständiger letzter
Diagnose-Read und Prozessabschluss erhöhen ihn in diesem Fall nicht.

Im RPC-Intervall bleibt Node-RSS an beiden Endpunkten bei269.144.064 Bytes,
V8-physical bei117.100.544 Bytes. Gleichzeitig steigt beobachteter gemeinsamer
anonymer Speicher von344.674.304 auf363.290.624 Bytes; file bleibt605.020.160.
Dies sind asynchrone Endpunktbeobachtungen, **keine Zerlegung der Spitze**.
File enthält shmem; external enthält ArrayBuffers. Keine RSS-Summen, keine
Addition getrennter Maxima oder kumulierter Schreibmengen. Beide Intervallarten
enthalten Beobachterarbeit; vor/nach den Zählerklammern anfallende Metadaten
werden nicht als kostenlose Messung ausgegeben. Der letzte Read umfasst den
gesamten bestehenden Diagnoseaufruf einschließlich Ergebnisprüfung.

## Enger serverseitiger Quellenbefund

Der letzte Write sendet nur2458 UTF8-Bytes, zwei Delta-Graphknoten und keine
Historienergänzung; ACK567 Bytes. Die Knotenanzahl belegt den Transport, nicht
neu eingefügte Datenbankzeilen. Der bestehende CAS kann den vollständigen
logischen Zustand allein für `assert_data` rekonstruieren. Der neue Renderer
vermeidet die alte Tokensortierung, materialisiert in diesem Zweig weiterhin
Grapharrays, Fragmente, ganzen Ausgabetext und endgültiges JSONB.

Dieser Zweig hängt von `helmut.local_auth_state_cas_projection` ab. Weder die
erfassten Einstellungen noch der tatsächliche Katalog enthalten eine Quittung
dieser GUC in der CAS-Sitzung. Dokumentiertes Default-OFF und fehlende explizite
Startoption sind kein Beweis gegen Datenbank-/Rollenvorgaben. Der tatsächlich
ausgeführte Zweig bleibt daher **unbewiesen**.

Die vorhandene W45-Projektion hatte bereits34 CAS-Materialisierungen entfernt,
aber den gemeinsamen Peak810.905.600→820.375.552 Bytes erhöht. Das war kein
RAM-Fix. Der neue Phasenfall ersetzt weder einen fairen Projektionsvergleich
noch die noch offene allgemeine Sicherheitsgleichwertigkeit. Kein Einschalten,
keine weitere Messserie und keine neue Architektur allein aus diesem Befund.
Eine spätere anderweitig begründete Diagnose muss die tatsächliche CAS-Sitzung
skalar binden, bevor ihr Validierungszweig behauptet wird.

Die zusätzliche unabhängige SOL-Quellenprüfung lautet **NOT_APPROVED** für
Aktivierung oder ON-Messung: Der allgemeine Nachweis, dass die native
Größenrekurrenz die abschließende tatsächliche JSONB-Größe dominiert, fehlt bei
zusammengeführten kompakten Werten. Zusätzliche Ausrichtungskosten bei gemischten
Zahlen/Stringwerten sind eine konkrete Hypothese, kein reproduziertes Gegenbeispiel.
Die ursprüngliche W45-Architekturdatei ist hier nicht vorhanden und wurde nicht
durch ein Ersatzoriginal ersetzt; die früheren55/37 Belege sind nicht neu geprüft.
Nächster enger Schritt ist diese Größenimplikation mit authentischem PostgreSQL17-
Layoutbeleg zu klären. Bis dahin keine Projektion als Ersatzprüfpfad und kein
neuer Ressourcenlauf zum bloßen Ausprobieren.

## Qualität, kontrollierte Bereinigung und Grenzen

Unabhängig geprüft:27 RPC,23 History- und18 Graphbindungen, neun volle Hashes
aller6000 historischen Zeilen, sechs Grenztripel,17 Captures und102 Workbelege;
dazu57 Lebenszyklusbelege. Originalhashes, physischer606-Byte-Root, Katalog/ABI/
ACL, CAS/ACK/Nonce und Wiederherstellung bleiben korrekt; nur die erwartete neue
Revision ändert sich. Node/PG/äußere Starter enden mit0, EOF und vollständige
Gruppenabschlüsse sind belegt, alle nativen Events0. Die strenge ursprüngliche
PostgREST-Abschlussregel ist erfüllt. Keine Zwangs-GC, Cachebereinigung, Peakresets,
Allocatorwechsel, Budgetänderung oder Provideraufrufe.

55 gezielte Starter-/Frame-/Negativguards, fünf Python-ASTs, zwei Node-Syntax-
prüfungen und fünf Hostfälle0/1/1/1/1 sind bestanden. Die179 Produktsuiten und95
nativen SQL-Vergleiche werden bei unverändertem Produktumfang nicht wiederholt.
CI bleibt gesondert zu beurteilen: fehlende private Originalbindungen und Vercel
sind bekannte Umgebungsprobleme; übersprungene Schritte sind kein Test-PASS.

Nach unabhängiger Actual-Abnahme, getrennter Root-Prüfung, geprüftem Retirer,
zwei frischen Einzelprüfungen und eigenen Nonce-/TTL-/Once-Adoptionen wurden
genau die zwei vorab entbehrlichen PASS-PGDATA-Kopien entfernt:3422 reguläre
Dateien/739.647.488 Bytes Inventarblöcke. Alle159 Belege, sechs Containerhüllen,
Images/Volumes/Loops, Originale, kanonische827a samt17 abhängigen Archiven und
Gitstände bleiben. Beide wirklichen äußeren Löschaufrufe enden mit0.
Nicht einsehbare fremde Prozessfelder werden nicht als globale Nutzungsfreiheit
ausgegeben. Root-END-Snapshot:15.082.921.984 Bytes frei,96.857.736 Bytes unter
Volladmission15.179.779.720; unabhängiger END anschließend15.082.790.912 Bytes
frei/96.988.808 Bytes Fehlbetrag. Weitere Belege benötigen Platz, keine Reservierung.

## Belege und Fortsetzung

Branch `codex/controlled-cleanup-and-late-probe-20261020`, gesicherte Basis
`3c7ca25c`, Entwurfs-PR927 auf926/925/924; c8624f7c bleibt erhalten.

- [Root-Abnahme und alle Phasenwerte](auth-write-phase-actual-20261021.SAFE.json)
- [Unabhängige Actual-Abnahme](auth-write-phase-sol-review-20261021.SAFE.json)
- [Gezielte Qualifikation](auth-write-phase-qualification-20261021.SAFE.json)
- [Serverpfad mit Quellenbindungen](auth-write-phase-server-source-20261021.SAFE.json)
- [Offene Sicherheitsimplikation der CAS-Projektion](auth-write-phase-cas-safety-20261021.SAFE.json)
- [Root-END](auth-write-phase-retirement-20261021.SAFE.json)
- [Unabhängiger END](auth-write-phase-retirement-sol-review-20261021.SAFE.json)
- [Vorheriger fairer Gesamtvergleich mit154.886.144 Bytes Ersparnis](combined-auth-memory-comparison-20261020.md)

Der Sprint bleibt teilweise abgeschlossen. Der maßgebliche alte Renderer wurde
bereits strukturell ersetzt und seine Wirkung vergleichbar gemessen; dieser
neue Fall ist reine Eingrenzung, kein weiterer Motorumbau oder Ersparnisvergleich.
Ein stabiles langes Plateau und500 MB Reserve für exakt500 aktive Profile/
1500 brauchbare Positionen sind weiter offen. Offline90/Unit60/Auth30 und alle
16 frischen Kontrollen je Profil bleiben unverändert erforderlich. Keine
Erfolgsgarantie aus einem kurzen Fall. Voll500 benötigt32 frische Bedingungen,
ausreichend persistente Kapazität und neues konkretes GO; alle früheren GOs sind
verbraucht. Keine Production-Aktion, kein Merge oder Deployment.
