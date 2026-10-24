# Entscheidungsvorlage: CPU-Architektur für den 500er Nachweis

**Späterer Stand:** Das ausdrückliche lokale Vertrags GO liegt vor; die Integration und ihre Abnahme stehen in [500er Inhaltsbindung](500er-pruefvertragsvorschlag-inhaltsbindung-20261015.md). Die folgenden Aussagen dokumentieren die frühere Architekturentscheidung und ihre damaligen Messungen.

Stand: 15.10.2026. Lokale Untersuchung auf `codex/cpu-content-epoch-20261015`; keine Production-Aktion. Zwei getrennte DeepSeek-V4-Pro-High-Leseanalysen abgeschlossen, Architekturentscheidung durch Sol. Keine weitere Optimierung oder Änderung des Sicherheitsvertrags übernommen.

**Entscheidung:** Weitere Kleinoptimierungen am jetzigen Vollprüfpfad stoppen. Die SHA-Stufe lässt sich mit identischen Ergebnissen wesentlich beschleunigen. Für den vollständigen unveränderten Vertrag mit 16 vollständigen Auftragsprüfungen gibt es trotzdem noch keinen belegten tragfähigen Algorithmus. Die aussichtsreichste grundlegende Änderung ist die Trennung einer vollständigen Prüfung unveränderlicher Eingaben von weiterhin frischen Sicherheitsprüfungen an allen bisherigen Grenzen. Diese Option benötigt eine ausdrücklich geänderte Abnahmespezifikation und eine unabhängige Sicherheitsabnahme. Sie ist hier weder akzeptiert noch implementiert.

Das ist kein Unmöglichkeitsbeweis für jeden denkbaren Algorithmus. Ein vollständig neuer Compiler für die reinen Berechnungen bleibt eine unbewiesene Alternative, wenn die 16 vollständigen Prüfkörper unverändert zwingend bleiben.

## 1. Tatsächlich wiederholte Arbeit

Die Auswertung verwendet die hashgebundene vollständige Original-Dictionary-Datei, keine verkleinerte Fixture. Die 500 Drafts referenzieren **dasselbe Quellenobjekt**, dasselbe Array mit 874 Source23-Zeilen und dasselbe Array mit 500 KO60-Zeilen. Dagegen sind die 500 B2-Basen und ihre Korrekturkontexte verschiedene Dictionary-Knoten; ein einziger B2-Hash darf sie nicht ersetzen.

| Arbeit allein in der 500-Draft-Schleife von `C.validate` | Je vollständiger C-Prüfung | Quellenbasierte Mindestzahl für 16 C |
|---|---:|---:|
| Source23-Zeilenbesuche | 437.000 | 6.992.000 |
| KO60-Zeilenbesuche | 250.000 | 4.000.000 |
| B2-Vollprüfungen | 500 | 8.000 |

Das sind Operationszahlen aus Originaldaten und Aufrufstruktur, **keine gemessene Laufzeit eines 16er-Laufs**. Zusätzliche E/K-Validierungen sind darin nicht enthalten. Der übernommene unabhängige Aufrufnachweis enthält außerdem zehn frische Packet-Abrufe/Decodierungen und sechs weitere Admissions auf gerade neu erzeugten Graphen.

Zusätzlich werden Paket-, Executor- und Kostenplanrekonstruktion, Profil-/Kontextdeskriptoren, Versionszuordnung, Source19-/KO59-Projektionen und vollständige kanonische Hashpräbilder wiederholt aufgebaut. Im bereits gemessenen optimierten Einzel-C gab es 2.267.957 Hashanfragen, davon 2.252.862 mathematische Treffer; außerdem 719.500 Projektionsanfragen bei nur 1.374 neu erzeugten Projektionen. Ein allgemeiner zusätzlicher Cache ist deshalb kein neuer Lösungsnachweis.

**Sicher gemeinsam berechenbar sind ausschließlich reine Inhaltsfakten:** exakte kanonische Bytes/Hashes, Schlüsselreihenfolgen, Strukturinformationen, Versionsindizes und Projektionen nach tatsächlich nachgewiesener Inhaltsgleichheit und unveränderlicher Eingabe. Vorberechnung und Wiederverwendung müssen an Originalbytes, Namespace, Codeversion, vollständige Struktur und vorhandene Grenzen gebunden bleiben. ID, URL, behauptete Objektmarke oder ein früheres „gültig“ reichen nicht. Mutable Zwischenwerte dürfen ohne einen konkreten Nachweis ihrer Erzeugung und weiteren Verwendung nicht gebunden werden.

**Frisch bleiben müssen** die bisherigen Policy-Lesungen, benötigte private B2-Fähigkeiten und Identitätswirkungen, tatsächliche Quellen-/Profil-/Runtime-Lesungen, Finanz-/Journalzustände, echte Ausführungszeit, Admission/GO, CAS und bestätigte ACKs. Die Rückfallpfade für unbekannte oder veränderte Eingaben bleiben erforderlich.

Wichtige Abgrenzung: C übergibt an B2 `new Date(d.briefingDatum)`, also das gebundene historische Datum. `Dates.bind` ist strukturell. Die aktuelle Ausführungszeit wird durch `Dates.assertCurrent` und andere Runtime-Wachen außerhalb von C geprüft. C selbst ist kein Datenbankabruf. Diese Ebenen dürfen beim Aufteilen nicht vermischt werden.

## 2. Gezielter Algorithmusvergleich mit Originaldaten

Neue Prototypen liegen ausschließlich außerhalb des Produktcodes. Sie schreiben die vollständigen ursprünglichen JSON-Bytes aus einem kompakten Knotengraphen: JSON-Skalare werden mit Node vorcodiert, Objektschlüssel mit der ursprünglichen JavaScript-UTF16-Reihenfolge sortiert. Ein 256-KiB-Puffer bündelt die Übergaben an SHA. Die native Variante verwendet OpenSSL. Keine Variante ersetzt SHA-256 durch einen anderen Hash oder kombiniert Kindhashes zu einem behaupteten ursprünglichen Elternhash.

Alle folgenden Zeiten sind einzelne lokale Komponentenmessungen auf CPU-Affinität 0, ohne Profiler. Node 24.19.0 und beide SHA-Backends verwenden OpenSSL 3.5.7.

| Vollständiger Transport-SHA über 3.219.024.301 logische Bytes | Hash-/Emissionszeit |
|---|---:|
| Exakt extrahierter bisheriger JS-Writer, im normalen Node-Realm | 17,564 s |
| Kompaktes Byteprogramm, gepufferter JS-Writer | 3,299 s |
| Kompaktes Byteprogramm, nativer Writer | 2,395 s |

Beobachteter Gewinn: **14,266 s / Faktor 5,32** für die portable Variante; **15,170 s / Faktor 7,34** für die native Variante. Der bestehende 16-MiB-Transportcachedeckel ist jeweils gleich. Eine frühere VM-Realm-Diagnose wird nicht für diesen Vergleich verwendet.

Weitere exakte Ergebnisse bei unverändertem 8-MiB-Deckel für zurückgehaltene kanonische Chunks:

| Kanonische SHA-Aufgabe | Gepuffertes JS | Nativ |
|---|---:|---:|
| Vollständiger Auftrag | 3,313 s | 2,361 s |
| Alle 500 ursprünglichen B2-Basishashes | nicht zusätzlich gemessen | 1,210 s |
| Alle 500 ursprünglichen Input-ohne-Hash-Hashes | nicht zusätzlich gemessen | 0,202 s |

Die nativen Gruppen bestätigen **1.002 bereits vorhandene Originalhashes**, einschließlich Transport- und Auftragshash. Die portable Variante bestätigt beide vollständigen Originalwurzeln. Der Auftragshash bleibt `5f0220f9e9c4583107c01992b3bf65e5846daf1684bdc6119642876470694543`.

**Kosten der Vorcodierung nicht verschweigen:** Die gemeinsame Vorbereitung aller vier privaten Byteprogramme dauerte 2,776 s und erreichte 894 MB Prozess-RSS. Diese Vorbereitung ist nicht die vollständige ursprüngliche T-/C-Vorbereitung. Parsing des Byteprogramms und Hashzeit stehen getrennt im Messbeleg. Der zusätzliche portable 256-KiB-Puffer muss bei einer späteren Integration dem vorhandenen Speicherbudget zugerechnet werden.

Alle neu gemessenen Einzelphasen blieben unter 2.048 MB; dies ist **kein Gesamtspeichernachweis für die Anwendung oder Unit**. Keine Summe einzelner RSS-Spitzen wird als Gesamtspitze ausgegeben. Native Prozesse hatten zusätzlich eine Adressraumgrenze von 2.048.000.000 Bytes; Node-Prozesse hatten ein 1.536-MiB-Heaplimit und gemessenen RSS, keinen behaupteten harten Gesamt-Cgroup-Deckel.

## 3. Warum schnelleres SHA allein nicht genügt

Die vollständige optimierte Einzel-C-Prüfung benötigte zuvor 60,739 s. Davon lagen 21,176 s innerhalb der gemessenen vollständigen kanonischen Datenemission und SHA-Berechnung. **Selbst wenn diese gesamte Phase kostenlos wäre und der Rest unverändert bliebe, blieben rechnerisch 39,563 s.** Das überschreitet schon für eine Einzelprüfung Auth30.

Diese Differenz ist eine bedingte Rechnung aus derselben Messung, kein gemessener neuer Gesamtlauf und keine Prognose für einen anders aufgebauten Algorithmus. B2-Phasenzeit und SHA-Zeit überlappen; sie werden nicht addiert. Die bestehende Gesamtphase B2 betrug 25,283 s, Source-Projektion 9,572 s und Source/KO-Prüfung 4,255 s. Damit bleiben Datenrekonstruktion, wiederholte Strukturprüfungen und Inhaltszuordnung ein eigener großer Teil des Problems.

Der normale Datenbankpfad qualifiziert den experimentellen Berechnungsepoch noch nicht. Der übernommene echte lokale Auth-Grenztest mit vollständigem C dauerte 234,837 s und lehnte vor jedem Schreiben mit 503 ab. Weder eine Bootstrap-Ergänzung noch das native SHA-Backend allein schließen diese beiden Probleme.

SHA-256 besitzt keinen hier belegten Algorithmus, der beliebige unterschiedliche Präfixe und gemeinsame Suffixe mittels Kindhashes zum identischen alten Gesamthash zusammensetzt. Die bereits abgeschlossene exakte Präfixanalyse zeigte nur 0,84 % ideal mögliche Einsparung für die untersuchten großen Nachrichten. Dieser Ansatz, GC-Tuning und unbelegte zusätzliche Parallelisierung werden nicht neu gestartet.

## 4. Entscheidungsalternativen

| Alternative | Belegter Nutzen | Verbleibendes Problem | Entscheidung |
|---|---|---|---|
| Portable Vorcodierung und gepufferte SHA-Ausgabe | Faktor 5,32 in der Transport-Hashstufe, identische Wurzeln, keine native Zusatzbibliothek | Löst die 39,563 s übrige Einzel-C-Arbeit nicht; vollständige T-/C-Integration fehlt | Bevorzugter SHA-Baustein für einen später nachgewiesenen Gesamtentwurf; jetzt kein isolierter Produktumbau |
| Nativer Graph-Writer | Faktor 7,34 in derselben Hashstufe; 1.002 Originalhashes bestätigt | Nur rund 0,904 s schneller als der portable Transport-Prototyp; zusätzlicher nativer Vertrauens-/Build-/Paketierungsumfang, übrige CPU-Arbeit bleibt | Kein Grund, deshalb eine neue native Produktabhängigkeit einzuführen |
| Neuer Compiler für alle reinen Datenflüsse, bei weiterhin 16 vollständigen Prüfkörpern | Potenziell Weg zur Vermeidung wiederholter Rekonstruktion/Strukturarbeit ohne Änderung der Aufrufzahl | Kein hinreichender Algorithmus oder Gesamtbudget belegt; benötigt umfassende Beweise zu Mutable-Daten, Effekten, Fehlerreihenfolge, Identitäten und privaten Fähigkeiten | Unbewiesene Alternative, falls das wörtliche 16-Vollprüfungen-Kriterium zwingend bleibt; keine weitere kleine Cachevariante |
| Ein vollständiger Vorbereitungsbeleg für unveränderliche Auftragsdaten; frische Wachen an allen 16 bisherigen Grenzen | Entfernt grundsätzlich wiederholte Vollrekonstruktion derselben globalen Eingaben | Ändert das Kriterium „16 vollständige C-Körper“; noch kein gemessener Gesamtpfad oder Sicherheitsäquivalenzbeweis | **Empfohlene grundlegende Richtung zur ausdrücklichen Prüfung der Abnahmespezifikation**, nicht bereits freigegebene Umsetzung |

## 5. Konkreter Umfang einer grundlegenden Änderung

Vor einer Implementierung braucht die vierte Alternative einen vollständigen Datenflussvertrag:

1. Alle 500 Eingaben vollständig prüfen; exakte Originalbytes, alte SHA-/B2-Bindungen, Profil-/Source-Versionen, Plan, Deployment und Verifikatorversion binden. Keine bloße Eingangs-ID und kein clientseitiges JSON-Zertifikat als Autorität.
2. An jeder der bisherigen 16 Grenzen unverändert nötige echte Zeit-, Policy-, Quellen-, Profil-/Runtime-, Finanz-, Admission-/GO-, Journal-/CAS- und ACK-Prüfungen definieren. Benötigte private B2-Fähigkeiten frisch erzeugen. Keine Kostenreservierung erstatten, keine unklare Wirkung wiederholen, keine fehlende Prüfung als Erfolg behandeln.
3. Lebenszyklus explizit lösen: Mutation, Quellen-/Policy-Drift, Ablauf, Prozessneustart, fremder Eingabegraph oder verlorener Beleg müssen sicher stoppen. Der bestehende 60-s-Mathematikcache wird nicht verlängert. Für einen über mehrere Requests verwendeten Vorbereitungsbeleg wären sichere Speicherung/Authentizität und Widerruf ein **neuer, noch nicht abgenommener Vertrag**.
4. Vorbereitung nicht aus dem Zeitnachweis herausverschieben: volle Vorbereitung höchstens 60 s, tatsächliches Auth mit Queue/Lesung/CAS/ACK höchstens 30 s, Unit einschließlich beider höchstens 20-s-Anbieteraufrufe höchstens 60 s, Speicher unter 2.048 MB. Auch die bisherigen 500er Gesamt-/Endfristen bleiben erhalten. Eine volle Neuvorbereitung vor jeder einzelnen Unit darf das Gesamtfenster nicht verdeckt überschreiten.

**Kleinster nächster Arbeitsschritt:** Ein überprüfbarer Schnittplan für genau diese Trennung: jede bisherige C-Teilprüfung und jede tatsächliche Grenze einem unveränderlichen Beleg oder einer weiterhin frischen Originalwache zuordnen; private Fähigkeiten, Fehler- und Identitätswirkungen sowie Neustart/Ablauf separat nachweisen. Erst wenn diese geänderte Abnahmespezifikation ausdrücklich akzeptiert ist, einen vollständigen lokalen Prototyp samt Negativfällen und realer DB-/60-/30-/RAM-Messung bauen. Die vorliegende Untersuchung stellt das Kriterium nicht eigenmächtig um.

Bis dahin bleibt der 500er Start blockiert. Kein Starttermin wird geschätzt; die bisherigen Kostenbelege bleiben übernommen, der noch offene vollständige Infrastrukturkostenvertrag wird durch diese CPU-Untersuchung nicht geschlossen.

## Belege

- Neue Messwerte und Methodenabgrenzung: `/workspace/helmut-parallel-20261015/wave6/ALGORITHM_COMPARISON.SAFE.json`
- Originaldaten-/Wiederholungszahlen: `/workspace/helmut-parallel-20261015/wave6/REPETITION_COUNTS.SAFE.json`
- Pro-Analysen: `wave6/pro-repetition-architecture/FULL_RESULT.json` und `wave6/pro-native-decision/FULL_RESULT.json` unter demselben Belegverzeichnis.
- Übernommener vollständiger Einzel-C: `wave4/candidate-copy-K-fullC/RESULT.SAFE.json`; native Auth-Grenze: `wave5/native-auth30/RESULT.SAFE.json` einschließlich `CORRECTIONS.SAFE.json`.

Alle Prototypen bleiben lokale Messprogramme. Produktquellen, Production, Profile, Journale und Einstellungen wurden in dieser Untersuchung nicht verändert. Kein Merge, Deployment oder kostenpflichtiger Production-Test.
