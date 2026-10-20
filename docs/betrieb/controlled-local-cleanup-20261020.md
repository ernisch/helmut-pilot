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

Die Bereinigung selbst beweist keine RAM-Einsparung. Der getrennte tatsächliche
Combined-Auth-ABBA-Vergleich belegt154.886.144B/13,23% weniger gemeinsamen
Lebenszeitpeak dieser Komponente. Langfristiges Plateau, vollständige Zeit-/
1500-Ergebnisannahme und500MB-Puffer des gesamten Motors bleiben offen.
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
Dies beschreibt den damaligen ersten Metadatenschritt. Inzwischen sind3484
Metadateneinträge sowie0owner- und0initial-userns-sichtbare xattrs qualifiziert.
Die zwei älteren Kopien blieben an diesem Zwischenstand KEEP. Die spätere volle
Sicherungsabnahme und tatsächliche gezielte Entfernung sind unten gesondert belegt.

[Integrierter Cache und tatsächlicher nativer ALT/NEU-Vergleich](bounded-control-cache-local-integration-20261020.md).

## Tatsächlicher Abschluss der sieben neuen PASS-Kopien

Die zwei vorab entbehrlichen Ownership-PASS-Kopien und alle fünf Combined-Auth-
PASS-Kopien sind separat nach frischen Root-Adoptionen entfernt.
Ownership:3422 reguläre Dateien/739.643.392B Blöcke,321 Fallbelege unverändert
([Actual-IR](ownership-two-pass-copies-retired-sol-review-20261020.SAFE.json)).
Combined:8555 reguläre Dateien/1.849.147.392B Blöcke,460 Fallbelege unverändert
([Actual-IR](combined-auth-five-copies-retired-sol-review-20261020.SAFE.json)).
Fall-/Disk-Hüllen, Originale und Quelle827a bleiben erhalten. Die Blöcke sind
geprüfte Zielinventare und kein addierter Gesamt-df-Nettogewinn.

Die damalige Root-Momentaufnahme7d9478 zeigte14.550.601.728B frei,
629.177.992B unter der Volladmission15.179.779.720B. Danach wurden drei eigene
saubere Hilfsworktrees mittels Git-Docs-Sparse reduziert:1664 eingecheckte Dateien
ausgelagert, je3 Pflichtdokumente und alle Nicht-Docs-Dateien erhalten.
Refs, HEADs, Indexblobs, gemeinsame Gitkonfiguration und Gitobjekte bleiben gleich;
alle ausgelagerten Dateien sind daraus bytegenau wiederherstellbar.
[Unabhängige tatsächliche Nachprüfung](three-own-worktrees-docs-sparse-sol-review-20261020.SAFE.json)
bestätigt4801 Nicht-Docs-Dateien und1664 ausgelagerte Pfade. Die drei getrennten
df-Differenzen summieren sich auf100.339.712B; keine Behauptung eines isolierten
Gesamt-df-Gewinns über gleichzeitig veränderte Belege hinweg.

Eine weitere eigene Initial-Auth-PASS-Arbeitskopie wurde nach separater
Entbehrlichkeits-/Quellenprüfung, echtem Check und frischer einmaliger Root-Adoption
entfernt:1000 Dateien/45.789.184B belegte Blöcke, tatsächliche df-Differenz gleich.
Alle37 erforderlichen Belege sowie Original, physische Kopie und Hüllen unverändert.
Historischer Testvertrag hier5000 Historyzeilen/44 RPCs; nicht als heutiger
6000-/27-RPC-Vergleich umgedeutet.
[Unabhängige tatsächliche Nachprüfung](small-initial-auth-copy-retired-sol-review-20261020.SAFE.json).

Die zwei älteren UID999-Kopien sind nun vollständig verlustlos gesichert:
135.292.875B und134.951.882B private gzip-Archive, zusammen270.244.757B.
Jeweils GNU-tar-Vollvergleich und unabhängiger vollständiger Quell-SHA-/Tarvergleich,
danach alle3484 sichtbaren Metadateneinträge unverändert. Eine unabhängige SOL-
Nachprüfung liest sämtliche Archivbytes/CRC/EOF und alle1712 Dateien je Archiv;
UID/GID/Mode/Nanosekunden-PAX und die sechs echten abgeschlossenen Aktionen gebunden.
Keine universelle Xattr-/Namespace-/Ctime-Wiederherstellungsgarantie behauptet.
[Unabhängige vollständige Sicherungsabnahme](old-two-full-backups-sol-review-20261020.SAFE.json).
An diesem Sicherungsstand blieb ihre tatsächliche Entfernung bis zu frischen
Root-Nutzungs-/Abhängigkeits-/Prozessprüfungen offen. Die spätere Ausführung folgt
unten; Quelle827a ist davon unabhängig weiter geschützt.

Root-Momentaufnahme8ae4cb nach Archivierung:14.400.036.864B frei,
779.742.856B unter der Volladmission. Historische Momentaufnahmen werden nicht
als heutige Startkapazität verwendet. Der geprüfte temporäre GitHub-Logcache
liegt auf tmpfs und würde0B persistente Kapazität freigeben; nicht entfernt.
Alle älteren datierten Kapazitätsangaben bleiben historische Momentaufnahmen.
Vor einem späteren Start sind die echte Kapazität und alle Startbedingungen neu
zu prüfen. Keine neue Voll500-Freigabe oder Production-Aktion.

Anschließend wurden in genau diesen drei eigenen sauberen Hilfsworktrees
weitere2508 eingecheckte flache Skriptkopien sowie sechs Frontendkopien
(`client.js`/`styles.css`) per Git-Sparse ausgelagert. Der Hauptarbeitsbaum bleibt
vollständig. Laufzeit-/Auth-/Native-/Kontrollskripte, alle benötigten Unterverzeichnisse,
Produktquellen und Pflichtdokumente bleiben verfügbar. HEADs/Branches/Refs,
Indexblobs und gemeinsame Gitkonfiguration unverändert; ausgelagerte Inhalte
bleiben aus den geprüften Gitobjekten bytegenau wiederherstellbar. Für historische
vollständige Offline-/Frontend-Prüfungen in diesen Hilfsworktrees zuerst die
betroffenen Pfade gezielt aus Git wiederherstellen.
[Tatsächliche Skript-Sparse-Abnahme](three-own-worktrees-flat-scripts-sparse-sol-review-20261020.SAFE.json)
und [Frontend-Sparse-Abnahme](three-own-worktrees-frontend-sparse-sol-review-20261020.SAFE.json)
trennen frische ENOENT-/Gitprüfungen von übernommenen Root-Vollhashbelegen.
Die getrennten df-Differenzen summieren sich auf47.460.352B und2.772.992B;
kein isolierter Gesamtgewinn über zeitgleich entstehende Belege hinweg.

## Tatsächlicher Abschluss der zwei älteren gesicherten Kopien

Beide konkreten PGDATA-Verzeichnisse sind jetzt entfernt:3424 reguläre Dateien
und60 Verzeichnisse, die privaten Parentverzeichnisse samt Einmalmarkern bleiben.
Jedes Ziel zuerst separat vollständig gegen die gesicherten1712 Datei-SHAs
geprüft; dann frische unabhängige Abhängigkeitsprüfung, aktuelle Docker-/Host-/
Gruppenschlussprüfung, neue Root-Adoption und genau einmalige Entfernung.
Nach der ersten Entfernung wurden die nun geänderten Parentmetadaten tatsächlich
neu gemessen; keine alten Zeit-/Linkwerte für die zweite Aktion übernommen.
Alle vier Aktionen endeten mit CLI0, beiden EOFs, beendetem Kindprozess, PID0
und ohne OOM. Archive und sämtliche geschützten Belege danach unverändert.

Ein separater rein lesender Endprüfer hat alle vier tatsächlichen Belegketten,
Einmalmarker, vollständige historische Check-Dateihashes, beide ENOENTs,
erhaltene Archive/Parentverzeichnisse und vier weiterhin beendete CIDs bestätigt.
[Tatsächlicher Endprüfer](old-two-retirements-end-verifier-20261020.SAFE.json).
Er wiederholt keine großen Archiv-/Originalnutzdaten-Hashes; diese stammen aus
der vollen Sicherungsabnahme und den erneuten Helferprüfungen vor/nach Entfernung.
[Unabhängige tatsächliche Nachprüfung](old-two-retirements-sol-review-20261020.SAFE.json)
bestätigt154 frisch bytegeprüfte Belegpins; ein bereits qualifiziertes statisches
ELF nur per Metadaten/Historie. Unlesbare Claimkörper bleiben als Grenze benannt.

Die vorherigen Vorabfehler bleiben erhalten: Docker ließ `ReadOnly:false` in den
zwei RW-HostConfig-Mounts weg; der erste Create-only-Versuch wurde deshalb vor
jedem Start abgelehnt. Eine neue Quellenfassung erwartet exakt diese Darstellung,
weiterhin vollständiger Dictvergleich und exakt zwei definierte RW-Parents.
Das bei geschlossenen Helfern beobachtete explizite `OomKillDisable:false→null`
wird ausschließlich im gespeicherten Created→Stopped-Metadatenvergleich behandelt;
keine Kernelpolicygleichsetzung, kein Setter, keine Budget-/Friständerung.
Die nie gestartete fehlerhafte Hülle wurde nach frischem Created/PID0/Nullstart-
Nachweis, unverändertem Image und leerem RootFS-Diff gezielt ohne force/volumes
entfernt. Fehlversuchsbelege bleiben; keine frühere Adoption wiederverwendet.

Nach bestandener Endprüfung sind genau sechs abgeschlossene Dockerinventare
verlustlos gzip-gesichert. Jede Rohfassung erst nach vollständigem SHA-/CRC-/EOF-
Rückvergleich und dauerhaftem Rekonstruktionsmapping entfernt; alle logischen
Rohpins unverändert. Vor einer späteren erneuten Prüfung, die physische Rohpfade
liest, diese ausschließlich aus dem jeweils gebundenen gzip bytegleich herstellen.
Das betrifft eigene abgeleitete Inventuren, keine Originale oder Messnutzdaten.
Private Primärbelege: `old-two-qualified-copy-retirement-execution/<nonce>/`
mit `CLOSED_INVENTORY_COMPACTION.SAFE.json` und `INVENTORY_COMPACTED.SAFE.json`.
[Unabhängige Kompaktierungsnachprüfung](six-closed-inventory-compactions-sol-review-20261020.SAFE.json):
alle sechs gzip-Dateien zusammen1.179.766B vollständig zurückgelesen, exakt
21.126.293B ursprüngliche Rohdaten per SHA/CRC/EOF wiederherstellbar. Sie prüft
Rekonstruktionsmappings; vor jedem erneuten Rohpfad-Consumer gezielt rehydrieren.

Echte Root-Momentaufnahme719a00 danach:15.164.137.472B frei, weiterhin15.642.248B
unter Volladmission15.179.779.720B. Noch keine ausreichende vollständige
Plattenadmission; keine Kapazität aus bloßen Kandidaten oder Prognosen gezählt.


## Volladmission nach drei verlustlos archivierten Vorabkontrollen

Genau drei eigene historische BLOCKED-CHECK_ONLY-Berichte sind anschließend
verlustlos archiviert:23.456.382B Rohbytes jetzt6.074.691B gzip, alle drei
vollständig per SHA/CRC/EOF und exaktem Rückvergleich unabhängig geprüft.
Die Berichte enthalten Quellinventare und Vorbedingungen; sie sind abgeleitete
Kontrollen, keine primären V11-Messdaten. Ihre BLOCKED-/FAIL-/GO-Zustände bleiben
unverändert. Andere Final-Vorabberichte sind weiterhin vorhanden; mangels
gepinntem Before-Metadatenbeleg wird keine neue Pre/Post-Gleichheit behauptet.
[Unabhängige tatsächliche Nachprüfung](three-blocked-preflight-compactions-sol-review-20261020.SAFE.json).
Historische Rohpfad-Consumer benötigen vor erneutem Lesen die bytegleiche
Rehydrierung aus dem jeweiligen Mapping. Kein altes GO wird dadurch gültig.

Der letzte [Plattensnapshot vor dem Dokumentationscommit](cleanup-final-capacity-snapshot-20261020.SAFE.json)
zeigt15.181.066.240B frei gegen unveränderte15.179.779.720B Volladmission,
**1.286.520B darüber**. Damit an diesem Zeitpunkt knapp erfüllt; die
Aufnahme ist keine Reservierung oder spätere Startfreigabe. Commit und spätere
Belege können Platz verbrauchen; vor jedem Start aktuelle Kapazität samt allen
32 Bedingungen und konkretem neuem GO prüfen. RAM-Puffer und vollständiger
500er Nachweis bleiben unabhängig davon offen. Keine Reserve oder Kosten geändert.

[Frische geschützte Ressourcenprüfung](cleanup-protected-resources-readback-20261020.SAFE.json):
Originalbank weiterhin aktiv, alle vier V11-Hüllen vorhanden; fünf volle CIDs,
Running/PID und sämtliche Mountquellen gleich der erhaltenen Baseline.
Quelle827a: Rootmetadaten gleich, kein postmaster.pid. Das ist eine gezielte
Metadatenprüfung, kein neuer Originalnutzdatenhash oder vollständiger HostConfig-
Vergleich. Originale, Images, Volumes und Loopbindungen wurden nicht verändert.

44 Root-Orchestrierungsquellen sind zusätzlich dauerhaft privat bytegleich
archiviert:55752B gzip, kompletter Rückvergleich und Einzel-SHAs. Manifest
`cleanup-20261020/root-orchestration-source-preservation-20261020/ACTUAL_SOURCE_PRESERVATION.SAFE.json`
SHA8affcc278583efb546dc7b3561062afd36e06092a15ce5bc4467bc9c94650960;
die spätere rein lesende Ressourcenprüfung ist ebenfalls als Quelle dort erhalten.
Quellenwiederherstellung erlaubt keine Wiederholung verbrauchter Aktionen.
