# Kontrollierte Bereinigung und anschließende Motordiagnose

Stand20.10.2026. Aktueller Arbeitsbranch
`codex/controlled-cleanup-and-late-probe-20261020`, Basis0372500c (PR926),
darunter PR925/f0d3b039 und PR924/bdb2c2c3; c8624f7c erhalten.

Der Betreiber hat nach der rein lesend bestätigten Plattenblockade ausdrücklich
die Entsorgung eindeutig entbehrlicher eigener temporärer Testressourcen
freigegeben. Originaldaten, notwendige DB-Stände, Belege, Gitänderungen sowie
aktive/fremde Ressourcen bleiben geschützt. Keine allgemeine Dockerbereinigung,
keine kostenpflichtige Infrastruktur, unveränderte Reserven, kein Voll500.

## Tatsächlich freigegebener Speicher

Die Inventur wurde getrennt von drei GPT6.1-SOL-Helfern für Dateien/Caches,
Docker und Belegbindungen durchgeführt; Root entschied und führte aus.
Unlesbare Verzeichnisse wurden nicht als leer oder entbehrlich behandelt.
Logische Sparse-Größen und Docker-RW-Größen sind keine belegten Plattenbytes.

Entfernt wurden ausschließlich:

1. Zwei abgeschlossene, reine16MiB-Synthetik-Formatdateien ohne Originalinhalte,
   Loop- oder Serverbindung. Eigentümer, Inode, Größe und vorhandene Testbelege
   geprüft; Ergebnisbelege behalten. Tatsächlicher Nettogewinn33558528B.
2. Zwei beendete schreibgeschützte Direct-I/O-Testhüllen mit PID0. Vollständige
   Inspect-/Diff-/Logbelege privat gespeichert; Logs gegen vorhandene Dateien
   geprüft. Image und sämtliche Hostbindungen einschließlich Loop6 behalten.
   `docker rm` ausschließlich mit den beiden vollständigen IDs, ohne force/volume.
   Tatsächlicher Nettogewinn303468544B.
3. Acht beendete V9-/V10-Ausführungshüllen. Vorher zwei unabhängige vollständige
   RootFS-Exporte je Hülle gegen das erhaltene immutable Basisimage ausgewertet.
   Vollständige Metadaten, entfernte Basispfade, neue Dateiinhalte, Inspect und
   Logs erhalten; Rekonstruktionsmanifeste exakt gleich. Nur die zwei DB-Hüllen
   enthielten neue Nutzdaten: jeweils310B reguläre Konfiguration, privat gesichert.
   Alle übrigen neuen Inhalte0B. Frische unabhängige SOL-Review, konkrete
   Quellen-/Archivpins, erneute Live-Prüfung und eigener Einmalmarker vor Entfernung.
   Tatsächlicher Nettogewinn7293165568B.

Kein Volume, Image, Loop, Datenmount oder ursprünglicher Datenbankstand wurde
entfernt. V11-Hüllen und laufende restaurierte Originalbank bleiben erhalten.
Das geänderte Gitworktree in/tmp und Originaltransferarchive wurden ausdrücklich
geschützt. Alte bereits ausgeführte Bereinigungen wurden nicht erneut gezählt.

Gesamtbeobachtung vor Inventur8596836352B verfügbar; nach Archivierung und
Bereinigung am20.10.2026 um19:48Istanbul/16:48UTC16196812800B. **7599976448B netto zusätzlich
verfügbar**, einschließlich der neu gespeicherten Archiv-/Prüfbelege und anderer
zwischenzeitlicher Dateisystemänderungen. Einzelgewinne dürfen daher nicht als
identischer Gesamtwert ausgegeben werden. Der wesentliche Gewinn kam aus den
beendeten VFS-Containerhüllen trotz ihrer zuvor gemeldeten Docker-RW-Größe0B.

Unveränderter Hostboden8589934592B; Komponentenadmission8606711808B;
Volladmission mit bestehendem2GiB Storage15179779720B. Diese erste Beobachtung
liegt **1017033080B über der Volladmission**. Werte vor jedem neuen Start frisch
prüfen; positiver Plattenbefund ist kein vollständiges Start-GO.

Private Primärbelege liegen unter
`/workspace/helmut-ram-fix-20261020/cleanup-20261020`:
`CLEANUP_COMPLETE.SAFE.json` bindet die Einzelresultate, Archivzusammenfassung,
frische tatsächliche SOL-Review und Rootübernahme. Private Konfigurationen und
Dateiinhalte bleiben außerhalb von Git, mit geschützten Dateirechten.

## Künftige Entsorgung ohne Verlust von Originalen und Nachweisen

Für jeden neuen diagnostischen Lauf zuerst eine konkrete Ressourcenliste führen:
eigene vollständige Container-IDs, Eigentums-/Fallbindung, abgeleitete Pfade,
Original-/Quellpfade und unveränderliche Images. Nach dem letzten Prozessende
Resultate, Rohlogs, Exitcodes, Quellenprüfungen und native Abschlussbelege sichern.
Eine Liste möglicher Kandidaten allein erteilt keine Löschfreigabe.

Beendete Ausführungshüllen erst nach vollständiger verlustfreier Sicherung ihrer
abweichenden RootFS-Dateien und Metadaten entfernen. Erhaltenes Basisimage anhand
Konfiguration und sämtlichen Layerdigests prüfen; zwei Exporte vergleichen und
Rekonstruktion tatsächlich nachweisen. Jede Ressource einzeln auf aktive Nutzung
und neue Bindungen prüfen. Bei Unklarheit behalten und gezielt nachfragen.

Die aktuelle sichere Vorlage liegt privat als
`archive-closed-v9-v10-hulls.py` und `retire-verified-v9-v10-hulls.py` vor.
Diese Fassungen binden absichtlich genau die acht bereits erledigten IDs und sind
**keine wiederverwendbare Freigabe**. Der Retirer prüft standardmäßig nur;
Entfernung benötigt eine frische unabhängige Review, die Code, Archivzusammenfassung
und sämtliche Einzelprüfbelege bindet. Nur `rm <exakte ID>`, ohne force/volume;
keine Namenswildcards und kein prune. Einmalmarker und Fehlerbelege erhalten.

Datenmounts, Originale und notwendige PGDATA werden dadurch nie mitgelöscht.
Eine abgeleitete DB-Kopie ist erst separat entbehrlich, wenn alle benötigten
Belege und Zustände nachweislich erhalten und ihre weitere Nutzung ausgeschlossen
sind. Bei notwendiger Archivierung zuerst tatsächlichen Platz für Archiv und
unveränderten Hostboden prüfen; keine Speicherreserve unterschreiten. Am Ende
`f_bavail` messen und aktive/protected Container, Images, Volumes und alle
Loopbindungen einschließlich Direct-I/O/Autoclear vergleichen.

## Tatsächlich fortgesetzte gezielte Diagnose

Der neue Starter verwendet eine eigene persistente Kopie des authentischen
späten V11-Zustands:1709 Dateien/369399611B, vollständiger Manifesthash827a9872….
Native gemeinsame Gruppe vor Quellenhash, Kopie, ursprünglicher JIT-Restaurierung
und DB-Start aktiv; kein Peakreset, Cacheverwerfen oder erzwungener GC.
Originalkatalog zuerst vollständig geprüft, danach ausschließlich den geprüften
PR925-Renderer in dieser Kopie installiert; ABI/ACL/Rollen/Tabellen/physisches
Authobjekt bleiben gleich. Keine allgemeine Analyse oder Wiederholung der179/95.

Erster Fall `spill-9fab599f05d9ce493b781be7`: **FAIL vor Installation und Messung**.
Die korrekte OID18405 wurde im Katalog als JSON-Text ausgegeben; der Starter
erwartete fälschlich eine Zahl. Exakter Vergleich auf `'18405'` korrigiert,
alte Quellen vollständig gesichert, Delta unabhängig von SOL geprüft. Dieser
Fehlversuch bleibt FAIL; keine erneute Nutzung seiner Adoption.

Neuer Fall `spill-36bfd089c9058be38d193846`: **01 PASS**, neue Quelle-/Code-/Zeitbindung.
Alle1848 erreichbaren Knoten,6010786B Payload; Sortierung nach `node_seq`
mit Quicksort,878KiB Sortierbereich im Speicher. Keine temporären Planblöcke,
Datenbankdelta0 temporäre Dateien/0B; Ausführung11,663ms. Die eigenständige
geordnete Auswahl erklärt den früheren Temp-I/O somit in diesem Plan nicht.
Der in PL/pgSQL tatsächlich gecachte SPI-Plan ist dadurch noch nicht gemessen.

Gesamte eigene Lebenszeit einschließlich Setup/Kopie/JIT/Abschluss16,823s,
nativer Peak653570048B, OOM/high/max-Ereignisse0. Dieser Wert enthält nur die
Diagnosekomponente; kein OLD/NEW-Vergleich, kein Motor- oder500MB-Nachweis.
Originale vor/nachher vollständig gleich, DB sauber heruntergefahren, Log-EOF
und beendeter Lesethread, WorkerExit0 und leere gemeinsame Gruppe nach letztem
Exit belegt. Die16 Sicherheitskontrollen je Profil wurden hier nicht ersetzt
oder als bereits durchgeführt beansprucht. Primärbelege liegen im genannten
Fall unter `/workspace/helmut-ram-fix-20261020/late-read-spill-20261020/cases`.
`ORDERED01_ACTUAL_QUALIFICATION.SAFE.json` im Bereinigungsordner bindet sie;
die öffentliche SAFE-Qualifikation enthält Werte und tatsächliche Prüfsummen.

Separater Fall `spill-47122cc632291c736f13dd2e`: **02 PASS**, mit neuem gebundenem
Modus/SQL-Pin/UUIDv4 und eigener Adoption. Der native warme Kontrollaufruf führte
die vorhandenen frischen Prüfungen aus:1113B Ergebnistext/1162B natives Ergebnis,
beide Nonces im gepinnten SQL geprüft,144,871ms Zielintervall, Tempdelta0B/0Dateien.
Lebenszeit einschließlich Setup/Kopie/JIT/Abschluss674652160B/17,666s, OOM/high/max0;
alle Quellen unverändert und eigenen Prozesse beendet. Keine tatsächliche
JavaScript-Cache-/Tokenannahme oder HTTP-Übertragung wurde damit getestet.
`NATIVE02_ACTUAL_QUALIFICATION.SAFE.json` im Bereinigungsordner bindet Rohdaten,
Nonce-/Quellen-/Exitbelege. Die Quellenfassungen des tatsächlichen01 und02
werden für spätere unveränderte Wiederherstellung separat privat archiviert.

Separater Fall `spill-8103e1df85163bc9728d5c9f`: **03 PASS**, derselbe native
Vierfeld-Kontrollaufruf mit `knownGraph:null`. Tatsächlich1848 Knoten,
6662644B Ergebnistext/6197762B natives Ergebnis, History korrekt wiederverwendet,
Graph vollständig geliefert, beide Nonces/State/Proof/Digest geprüft.
Zielintervall248,065ms und **eine temporäre Datei mit6212035B**. Ein großer
MATERIALIZED-Beobachter-CTE wurde ausdrücklich vermieden; ein OFFSET0-Subquery
wertet den skalaren Leser einmal aus. Hash-/Größenberechnung bleibt Beobachterarbeit.
Lebenszeit einschließlich aller Phasen753774592B/18,515s, OOM/high/max0,
Originalquelle unverändert, sämtliche eigenen Prozesse sauber beendet.
`NATIVE03_ACTUAL_QUALIFICATION.SAFE.json` bindet tatsächliche Roh- und Exitbelege.

Der kalte Pfad materialisierte vollständige Knoten nochmals für einen Hashdigest.
Die inzwischen lokal übernommene Hashprojektion beseitigt diese Tempdatei in
beiden neuen Vergleichsfällen, belegt aber keine gemeinsame RAM-Ersparnis.
[Native19 und symmetrischer ALT/NEU/NEU/ALT-Vergleich](local-cold-digest-comparison-20261020.md).
Die Vierfeldgröße war an diesem Haltepunkt noch ungemessen; später tatsächlich
4.856.607B, siehe den nachfolgenden Cachebefund.

Nach Abschluss der vier Diagnosefälle wurden ausschließlich ihre vier neuen,
beendeten PGDATA-Kopien vollständig gzip-archiviert. Jeweils Python-Vollvergleich
und unabhängiger GNU-tar-Vergleich einschließlich Dateimetadaten PASS; erst danach
frische Root-Adoption und gezieltes Entfernen von je1711 Dateien. Alle Fallbelege,
Containerhüllen, Originale, Images, Volumes und Loops bleiben erhalten.
`FOUR_COMPLETED_PROBE_COPIES_RETIRED.SAFE.json` bindet sämtliche Archive,
Vergleiche und tatsächlichen Entfernungsbelege. damalige Beobachtung:
15603122176B frei, 423342456B über der unveränderten Volladmission.
Die vier Archive belegen zusammen489243917B; dieser Platzgewinn ist netto nach
Archivkosten beobachtet und keine Garantie für Platz nach weiteren Diagnosen.

Die fünf anschließend abgeschlossenen V5-Kopien sind ebenfalls kontrolliert
entfernt:8555 reguläre Dateien, ausschließlich deren fünf konkreten PGDATA-Pfade.
Verlustlose Deltaarchive belegen zusammen107427091B. Byteidentische Dateien
referenzieren die geschützte kanonische Quelle; alle abweichenden Bytes und
vollständigen Zielmetadaten sind archiviert. Python-Vollvergleich und unabhängig
GNU-tar/cmp/stat einschließlich Nanosekundenmetadaten PASS, anschließend je Fall
frische Root-Adoption, erneute Quellen-/Nutzungsprüfung und exakte Entfernung.
Alle Fälle, Rohbelege, Containerhüllen, Images, Volumes, Loops und Originale bleiben.
Die kanonische Quelle827a9872… ist nun **dauerhaft notwendige
Rekonstruktionsabhängigkeit** dieser fünf Archive und darf nicht entsorgt werden.
[Tatsächliche Entfernungsbelege](five-v5-delta-retirement-20261020.SAFE.json) und
[unabhängige SOL-Nachprüfung](five-v5-delta-retirement-sol-review-20261020.SAFE.json).

Beobachtung nach den fünf Entfernungen18:18UTC:15439728640B verfügbar,
259948920B über der unveränderten Volladmission. Das ist eine Momentaufnahme
**vor** der nächsten Diagnosekopie; kein aktuelles Vollstart-GO. Die unabhängige
Nachprüfung verifiziert kleine Belege, Zielabwesenheit und erhaltene Ressourcen;
sie behauptet keine erneute vollständige Hashprüfung großer Originale/Archive.

Der folgende separate PostgREST-Abschlussfall `control-45a29158f86a93d8e76f090d`
bleibt FAIL: SIGTERM gesendet, tatsächlich signierter Exitcode−2 statt erlaubtem
0/−15. Originalquellen identisch, PG sauber beendet, alle eigenen Prozesse zu,
keine OOM-Ereignisse,0Auth-Aufrufe/kein Node. Genau diese Originalversion übersetzt
laut Upstream SIGTERM über UserInterrupt in RTS-SIGINT. Das erklärt den Befund,
ändert aber keinen alten Teststatus. Eine neue eng gebundene Abschlussqualifikation
und die Korrektur einer Diagnose-Hostpfadbindung gehen den drei Motoraufrufen voraus.

Diese neue V7-Abschlussqualifikation und anschließend die drei tatsächlichen
Motorlesevorgänge sind inzwischen bestanden und unabhängig geprüft. Dabei wurde
die4.856.607B große Kontrollsicht als tatsächlicher Auslöser des2MiB-Cachemiss
belegt. [Baseline und Folgeumbau](local-control-cache-baseline-20261020.md).
Die drei abgeschlossenen V6/V7-PGDATA-Kopien sind danach ebenfalls ausschließlich
über ihre drei festen Zielpfade entfernt:5133 reguläre Dateien,35042832B
verlustlose Deltaarchive, je zwei tatsächliche vollständige Vergleiche und frische
einzelne Root-Adoptionen. Sämtliche Fallbelege, Hüllen und Originale bleiben;
die kanonische Basis ist jetzt für **acht** Deltaarchive dauerhaft erforderlich.
[Drei tatsächliche Entfernungen](three-control-delta-retirement-20261020.SAFE.json),
[unabhängige Abschlussnachprüfung](three-control-delta-retirement-sol-review-20261020.SAFE.json).
Alle zwölf getrennten Check-/Archiv-/Vergleichs-/Entfernungsaktionen Exit0;
das exklusive Bereinigungsfenster ist geschlossen. Keine alten Freigaben wiederverwendet.

Neue Momentaufnahme18:48UTC:15301251072B verfügbar,121471352B über der
unveränderten Volladmission. Weitere Diagnosen verbrauchen erneut Platz; vor
jedem Start frisch prüfen. Diese Angabe bewilligt keinen vollständigen Lauf.

Die Bereinigung beweist keine RAM-Einsparung. Robuste gemeinsame RAM-Verbesserung,
langfristiges Plateau, Zeit-/1500-Ergebnisannahme und500MB-Puffer bleiben offen.
Historischer PostgREST-Fall bleibt FAIL. Vor jedem späteren Voll500 zusätzlich32
frische Startbedingungen, gültige Fall-/Zeitbindung, geklärter SOL-only-Reviewvertrag
und neues konkretes Betreiber-GO. Keine Production, Migration, Aktivierung,
Zusammenführung oder Bereitstellung aus dieser Bereinigung ableiten.


## Weitere neun Kopien und aktuelle Plattenlücke,20.10.2026

Auch die vier V8- und fünf V9-Kopien des tatsächlichen Cachevergleichs sind
verlustlos gesichert und entfernt:15.399 reguläre Dateien aus exakt neun
beendeten PGDATA-Verzeichnissen.18 vollständige tatsächliche PASS-Vergleiche
und neun frische einzelne Root-Adoptionen gehen den Entfernungen voraus.
Die erhaltenen neuen Deltaarchive belegen520.601.319Bytes. Alle Fallbelege,
Parentverzeichnisse, Originale, Hüllen, Images, Volumes und Loops bleiben.
Die kanonische Basis827a9872 ist für jetzt17 Deltaarchive dauerhaft notwendig.
Die vier vorherigen vollständigen Archive bleiben ebenfalls erforderlich.

Das erste V8-Skript stoppte korrekt, nachdem das zweite Archiv72.437.735B
statt höchstens64MiB zusätzlichen Root-Limits belegte: vor Vergleichen und
Entfernung dieser Kopie. Der Stopp/Exit1 bleibt erhalten. Ein frischer expliziter
Root-Fortsetzungsplan mit128MiB Zusatzlimit verwendete dieses vorhandene Archiv,
führte beide Vergleiche aus und adoptierte jedes verbleibende Ziel neu. Keine
Wiederholung der Archivierung oder Wiederverwendung verbrauchter Adoptionen.
Der V8-Fehlerfall bleibt FAIL; der nie gestartete V8-OLD2 ist nicht enthalten.

[Unabhängige tatsächliche Nachprüfung mit sämtlichen Pins](nine-v8-v9-pgdata-retirements-sol-review-20261020.SAFE.json)
prüft721 erhaltene Fallbelege, davon712 frisch per SHA/Bytes; neun geheime
Konfigurationen nur per Metadaten. Große Archive und Originalnutzdaten wurden
in dieser Nachprüfung nicht erneut gelesen. Der Bericht trennt das ausdrücklich
von den bereits vollständig ausgeführten Vergleichen vor jeder Entfernung.

Momentaufnahme19:36:46UTC:14.670.798.848B frei statt erforderlichen
15.179.779.720B;508.980.872B fehlen. Die neuen erforderlichen Vergleichsarchive
verbrauchen Platz. Historische df-Werte verschiedener Phasen werden nicht als
aktueller Nettogewinn verrechnet. Der Komponentenboden bleibt8GiB; kein Voll-GO.

Zwei ältere eigene abgeschlossene PGDATA-Kopien sind der nächste enge Kandidat.
Wegen Host-UID-Overflow wurde zuerst ein neuer kleiner statischer Helfer ohne
Netzwerk und ohne Fähigkeiten auf ausschließlich RO-Binds ausgeführt. Nur
lstat/statfs der beiden Roots und eigene UID/GID-Maps: tatsächliche Owner999:1000,
Gerät/Inodes/Mode/Zeitstempel unverändert, Exit0/PID0/kein OOM; Hülle erhalten.
[Quellen-/Planprüfung](two-old-pgdata-root-metadata-sol-review-20261020.SAFE.json),
[tatsächliche Metadaten](two-old-pgdata-root-metadata-actual-20261020.SAFE.json).
Noch keine rekursive Inventur, Dateinutzdatenlesung, Archivierung oder Löschung
dieser zwei Bestände; ihr weiterer Platzgewinn ist nicht behauptet.

[Integrierter Cache und tatsächlicher nativer ALT/NEU-Vergleich](bounded-control-cache-local-integration-20261020.md).
