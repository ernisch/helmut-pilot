# Aktuell: DB-Zuordnung korrigiert; neue RAM-Diagnose an Statistik-SQL gestoppt

**FAIL der neuen Diagnose B, kein neuer Mock500-Vollauf.** Python-DB-Fehler
behoben: alle vier importierten `M.read`-Aufrufstellen einschließlich Abschluss
übergeben `database=DB`; administrative Anlage ausdrücklich `postgres`.
Gezielte reine Routingvorprüfung einmalPASS: fünfAufrufstellen, echter
unveränderter Guard mit aufzeichnendem Transport,0DB-Abfragen; implizites altes
und falsches Ziel werden weiterhin vor Transport abgewiesen. Unabhängiger
statischer Review der fertigen RevisionPASS. Frisches ZielB statt Wiederholung.

## Tatsächlich erreichte neue Diagnose

28.10., Beginn der Run-Phase12:42:16 Europe/Istanbul/09:42:16UTC.
Originalrestore atomar inaktiv; vollständiger End500-Datenbestand anschließend
in nativen Tabellen committed und kontrolliert: **3501native Postimagevergleiche**,
500Evidence,500privateDstore,1500Ergebnis- und1000privateD/R-Zeilen,6000Usage.
Die ergänzten Daten bleiben ausdrücklich inert und sind kein Ausführungs-,
Modell- oder Qualitätsnachweis. Der vorangegangene31-Punkte-Datenreview bleibt
übernommen, keine Konstruktor-/Quellen-/Auth-API-Serie wiederholt.

**Erstfehler:** Erste `databaseStats()`-Abfrage scheitert syntaktisch an
`::regclassor relid`. Zwei SQL-Textfragmente wurden ohne Leerzeichen verbunden
(`scripts/synthetik-500-w15-memory-forward.js`, Autovacuum-Statistik).
Das vorhandene PostgreSQL-Fehlerlog bestätigt09:42:16.152UTC/12:42:16.152Istanbul
Syntaxfehler an Zeichen924. Das war ein Fehler der neuen Messhülle.
Der ursprüngliche Python-DB-Fehler trat nicht erneut auf.

Abbruch **vor T-Decodierung, geladenem Command und erstem Mess-CAS**.
0CAS/0Units/0Mockantworten/0Modellaufrufe, kein weiterer Gesamtversuch.
Peak **627245056B**, verbleibend **1420754944B/69,37%**, hart2048000000B,
Swap0,allemax/OOM-Ereignisse0. Diese Zahlen betreffen Seed und abgebrochenen
Anfang; kein vollständiger gemeinsamer Speicher-/GC-/WAL-Zyklusnachweis.
Keine Aussage, die geplanten lokalen Ressourcenbudgets seien erfolgreich validiert.

Automatische Abschlussprüfung funktioniert nun:0aktiv. Genau eine zusätzliche
unabhängige READ-ONLY-Sicht bestätigt **0aktiv/500Profile/501Identitäten/6000Usage**
und die vier nativen Seed-Mengen. Derselbe ursprüngliche Kernelpeak wurde
unabhängig bestätigt, ohne Neustart oder Cachebereinigung. Alle Daten und alten
Fehlerbelege bleiben erhalten. Keine Reparatur oder Wiederholung nach FAIL.

**Nächste konkrete Arbeit:** Fehlendes Leerzeichen in der Statistikabfrage
korrigieren; erzeugtes Metadaten-SQL vor einem neuen Diagnosestart gezielt vom
vorhandenen PostgreSQL-Parser prüfen lassen. Erst danach frisches Diagnoseziel
und gemeinsame End500-Speichermessung. Keine neue Architektur oder pauschale
Testwiederholung. Die bedingte Freigabe für einen Mock500-Gesamtversuch wurde
nicht genutzt; wegen der Fehlerregel gestoppt.

Codefix `dfc9962f`; App-/Sicherheits-/Geschäftslogik unverändert. Kein neues
CI-Grün behauptet, keine vollständige CI wiederholt. Auth-Maxima-/SIGTERM-
Reportingtest aus dem vorigen SprintPASS übernommen. PR969/971/972ungemergt;
keine Production-, Budget-, Hetzner- oder kostenpflichtigen Ressourcenaktionen.

[Ergebnis, unabhängiger Nullnachweis und Nachweisgrenzen](belege/w15-processing-20261027/FORWARD_DIAGNOSTIC_B_20261028.SAFE.json).

---

## Historischer Vorbereitungsfehler vor dem neuen GO

# Neuer Vorbereitungssprint: vor Speicherprobe abgebrochen

**FAIL im Diagnosecontroller; kein neuer Mock500-Versuch.** Der neue Controller
importiert Hilfsfunktionen mit bei Import gebundenem Datenbank-Standardargument.
Die spätere Änderung von `M.DB` ändert dieses Argument nicht. Deshalb stoppt
`M.read()` nach erfolgreichem Restore am Datenbank-Schutzassert vor der SQL-Ausführung.
Auch die automatische Nullnachlesung traf denselben Fehler. Keine Wiederholung
oder Reparatur nach FAIL. Nächste konkrete Korrektur: Diagnose-Datenbank bei allen
importierten Lese-/SQL-Aufrufen ausdrücklich übergeben; frisches Diagnoseziel verwenden.

Unabhängig frisch bestätigt: **0 aktiv /500 Profile /501 Identitäten**;
6 Store-Zeilen und5000Usage. Der End500-Seed wurde nicht erreicht:0CAS/0Units/
0Modellaufrufe. Kernelpeak165928960B betrifft nur Vorbereitung, kein RAM-Nachweis.
Hartes Limit2048000000B/Swap0, keine OOM-Ereignisse.

Erledigt und wiederverwendbar: End500-Größenmodell unabhängig31PrüfungenPASS,
Auth13616853B/6000Usage einschließlich aller5139vorhandenen Einträge,
500Evidence/1500Ergebnisse/1000privateDR/500privateDstore und closedSlot-Kopie.
Ergänzungen eindeutig inert, keine Ausführungs- oder Qualitätsbelege.
Neue lokale Ressourcenbudgets512MiBNode/128MiBWAL/32MiBwork_mem/Autovacuum10s
sind **nicht unter Last validiert** und nicht in den Vollcontroller übernommen.

Auth-Messhülle erweitert: dauerhafte Maxima im bestehenden Profil-ACK und
bestmöglicher Rohdatenbeleg bei SIGTERM. Genau ein gezielter Helpertest mit echtem
SIGTERM PASS; Original-Authbeobachter und Bewertung bytegleich. Unfertige
Vorgänge bleiben unbekannt; keine Garantie bei SIGKILL/OOM. Keine Auth-API,
Quellenqualifikation oder vollständige CI wiederholt.

Geschützte Originalberichte bleiben in der Cloud. Bereinigter Beleg:
[Vorbereitungsbefund](belege/w15-processing-20261027/FORWARD_PREPARATION_20261028.SAFE.json).
CURRENT_STATE und PR972 aktualisiert;969/971/972 bleiben ungemergt.
Die bedingte Freigabe für einen neuen Gesamtversuch wurde nicht genutzt;
gemäß Fehlerregel gestoppt. Keine Production-/Budget-/Hetzneränderungen.

---

# W15: RAM-Teildiagnose bestanden; neuer Vollauf nicht startbereit

**Sprint teilweise abgeschlossen; Startbedingung des neuen Mock500-Versuchs
UNKNOWN.** Die Betreiberbedingung verlangt eine belastbare Begründung der
Reserve bis500Units. Beide unabhängigen Reviews bestätigen: Der neue enge
Auslagerungsbefund reicht dafür nicht. Gemäß Stopregel kein Vollauf, keine
Aktivierung und keine unbewiesene RAM-Optimierung. Der neu bedingt erlaubte
Gesamtversuch wurde **nicht gestartet**. Der historische28c-FAIL und sämtliche
Rohbelege unten bleiben unverändert erhalten.

## Vorhandene Speicherbelege rein lesend geklärt

- Snapshot bei26abgeschlossenen Profilen:579096576B anonym,648536064BDatei-/Shared-Memory;
  darin96247808Bshmem. Das ist keine Zerlegung am eigentlichen1640103936B-Peak.
- Nach Ende von Node/PostgREST nur PostgreSQL-Prozesse übrig: etwa4,69MBanon,
  781,44MBfile einschließlich105,70MBshmem. Kein belegter großer Runtime-Metadaten-
  oder Gateway-Body-Leak: Gateway streamt; Berichte halten begrenzte Metadaten;
  Backend hält einen aktuellen Commandgraphen. Ein Leak allgemein oder die
  konkrete Node-Liveheapgröße am alten Peak ist damit nicht bewiesen oder ausgeschlossen.
- Datenbank79744147B; `helmut_store`65232896B einschließlich65126400BTOAST.
  Native Statistik837Updates,834HOT,einAutovacuum. AuthJSON5458615B in
  PostgreSQL-Textdarstellung/1396404Bkomprimiert. Jeder echte CAS serialisiert
  und ersetzt die vollständige Auth-Zeile einschließlich erhaltener Historie.
- Kumulativ1227383222BWAL und4504080717BTEMP/842Dateien geschrieben. Die
  TEMP-Statistik umfasst auch Restore, Vorbereitung, Audit und Diagnoseabfragen;
  keine nachträglich erfundene Einzelstatementzuordnung.
- 33WAL-Dateien mit553648128B sind per `mincore` vollständig resident nachgewiesen.
  Die Abfrage liest Seitenstatus ohne Inhaltszugriff, Reclaim oder Cachelöschung.
  Globale Dateiresidenz beweist weder jede cgroup-Seitenzuordnung noch die
  Aufteilung am historischen Peak. Kein Cacheanteil wird vom Kernelpeak abgezogen.
- Der begrenzte Container meldet tatsächlich V8-Heaplimit1124859904B. Das ist
  keine RSS-Grenze oder Liveheapmessung. PostgreSQL, PostgREST, externer
  Node-Speicher und Datei-/Shared-Memory teilen weiterhin2048000000B mit
  verbindlicher409600000BReserve.

**Ergänzender alter Teilunit-Befund, keine Änderung alter Berichte:**139neue
Usage-Belege sind gespeichert:70D+69R neben allen5000historischen Zeilen.
Damit ist nun ein zusätzlicher D-Usage-Beleg des abgebrochenen70.Profil belegt.
Vollständige Units bleiben69 und fertige Ergebnisse207. Die DB-Zeilen tragen
keine erfundenen Mockflags; lokale Mockprovenienz folgt aus dem gepinnten
geschlossenen Providerhook und netzlosen Container. Die alte Unbekannt-Aussage
der damaligen Teilzähler bleibt als historischer Stand erhalten.

## Genau eine neue gezielte Diagnose, keine Unit

Ausführung28.10.,**11:12:00–11:12:08 Europe/Istanbul**
(08:12:00–08:12:08UTC). Neue isolierte, inaktive Datenbank innerhalb des
vorhandenen netzlosen Testcontainers. Originaldump hashgeprüft; Restore und
Deaktivierung in einer Transaktion. Nur der erhaltene Auth-Stand69/70 wurde
rein lesend kopiert. Originaldatenbanken unverändert. Frischer lokaler JWT,
keine alte Freigabe als Ausführungsrecht benutzt, keine Signaturprüfung ersetzt.

Vorher unabhängiger statischer Review der finalen Skriptbytes: maximal ein
nativer CAS jePhase, Guard vor einem zweiten Dispatch, kein automatischer
Konfliktretry. Revisions-ACK und echte PostgREST-Nachlesung müssen übereinstimmen.
Vollständiges Roh-JSON vor/nach kanonisch identisch, ausgenommen nur eigener
Diagnosemarker und echte CAS-Revision.

| Schritt | Temp-Dateien/Bytes | Tatsächliches Ergebnis |
|---|---:|---|
| Reine GET-Kontrolle |0/0|Keine Auslagerung |
|1echter CAS, bisherige4MB`work_mem` |1/5729274B|ACK+Revision+vollständiger Readback;1171,434231ms |
|1echter CAS, nur neue DiagnoseDB auf16MB |0/0|ACK+Revision+vollständiger Readback;841,601506ms |

5GETs und2PATCHes,0Gatewayfehler. Alle5139Usage-Einträge und sämtliche übrigen
Rohdaten erhalten.0aktive Profile,0Units,0Provideraufrufe; keine Kosten-,
Quellen-, Sicherheits- oder Geschäftsregel geändert. Eine frische unabhängige
READ-ONLY-Sicht bestätigt0/500/501und5139Usage sowie den Rohdatenvergleich.
Bestehende Quellen500PASS- und Auth-Vier-Schreiber-Belege übernommen, nicht
erneut ausgeführt. V8-Coverage im nötigen Diagnoselauf erfasst.

**Belegt:** Der repräsentative echte Auth-CAS verursacht bei4MB eine temporäre
Auslagerung;16MB beseitigen genau diesen beobachteten Spill. Der genaue interne
PostgreSQL-Operator wird ohne Statement-/Planbeleg nicht behauptet. Die zwei
Zeiten sind Einzelmessungen, keine allgemeine Laufzeitverbesserung.

**Nicht belegt:** geringerer gemeinsamer RAM-Peak oder geringere WAL-Menge.
Beide CAS erzeugten jeetwa1,528MBWAL; diese Arbeit entfällt nicht. Die höchste
periodisch gemessene Probe-Node-RSS301477888B ist weder gemeinsamer Peak noch
exakter Prozesshöchstwert. Höheres`work_mem` kann PostgreSQL-RAM jeOperator und
Verbindung erhöhen. Deshalb keine Übernahme der16MB in den Vollcontroller,
keine spekulativen V8-/WAL-Parameter, kein Cachelöschen oder Messwertabzug.

## Tatsächliche Startgrenze und kürzester notwendiger Folgeschritt

Beide unabhängigen Reviews bestätigen engen Diagnose-PASS, aber
**`UNKNOWN_NOT_CLEARED` für einen neuen Mock500-Start**. Es fehlt die Verbindung
zwischen wachsendem Datenbestand und gleichzeitiger Speicherbelegung:

1. Konservativ größter End500-Authzustand mit1000Usage-/Versuchseinträgen und
   500Outputs zusätzlich zu allen5000historischen Usage-Zeilen.
2. Tatsächlich geladener W15-Command zusammen mit Node-Liveheap, externen
   Allokationen und PostgreSQL-/PostgREST-Verbrauch; natürliche GC statt forcedGC.
3. Gemeinsamer Verlauf über PostgreSQL-Checkpoint-/WAL-Recycling und wachsende
   gespeicherte Ergebnisse, ohne Cachelöschung oder Abzüge.

Der kürzeste sichere nächste Schritt ist eine darauf begrenzte gemeinsame
Speicherdiagnose mit erhaltenen Daten, ohne Unit-/Profilaktivierung oder
Modellaufruf. Erst daraus genau einen belegten Speicherfaktor korrigieren und
unabhängig prüfen. Ein4→16MB-CAS-Vergleich ersetzt diese Begründung nicht.
Kumulative8,89GBWAL bei linearer500er-Hochrechnung sind keine8,89GBRAM;
`max_wal_size` ist nur ein weicher Checkpointtrigger.

Auch die dauerhafte Ablage exakter Auth-Maxima proProfil und eines begrenzten
Abbruchbelegs bleibt vor einem späteren Vollauf offen. Nach der festgestellten
UNKNOWN-Startbedingung keine weitere Umsetzung oder Tests. Full500-Messhüllen,
Startbedingungen, Grenzen und One-shot-Sperren bleiben unverändert; keine
vermeintlich startbereite neue Operation erzeugt.

- [Bereinigte Befund-/Diagnose-/Reviewprojektion](belege/w15-processing-20261027/RAM_DIAGNOSIS_20261028_SUMMARY.SAFE.json).
- [V8-Coverage des erforderlichen Diagnoselaufs](belege/w15-processing-20261027/RAM_DIAGNOSIS_20261028_COVERAGE.SAFE.json).
- Neue Diagnosewerkzeuge:[JavaScript](../../scripts/synthetik-500-w15-ram-cas-diagnostic.js),[Controller](../../scripts/synthetik-500-w15-ram-cas-diagnostic.py).

PR972weiterDraft/ungemergt;969/971ebenfallsnichtgemergt. App/Server/Workflows und
bisherige Quellen-/Authprüfpfade unverändert; kein unnötiger Voll-CI-Lauf,
kein neues CI-Grün. Keine Production-/Hetzner-/Budgetänderungen oder neuen
kostenpflichtigen Ressourcen. Kein neuer Mock500- oder Production-Nachweis.

---

## Historischer Abschluss28c vor dem RAM-Diagnose-GO

**Historischer Befund28c vom28.10.: FAIL, kein lokaler Mock500-PASS.** Nach der
gezielten Auth-Reparatur und unabhängigem Review wurde unter dem neuen GO genau
**ein** neuer vollständiger lokaler Versuch gestartet. **69/500 Profile** sind
vollständig abgeschlossen; während Profil70 stoppte der gemeinsame
Speicherwächter. Kein Retry, Resume oder zweiter Versuch.

## Auth-Messfehler gezielt behoben

Nur die beiden bislang fehlenden Aufrufzuordnungen der bestehenden
`storage.acquirePipelineLock`-/`storage.releasePipelineLock`-APIs wurden in der
Messhülle ergänzt. Ihre echten internen CAS-Schreibvorgänge werden jetzt per
AsyncLocalStorage mit dem vollständigen Originalaufruf einschließlich ACK
verbunden. Öffentliche Mutationen und `recordLlmUsage` behalten ihre bestehenden
Messhüllen. Originalfunktionen, Argumente, Ergebnisse, Exceptions und sämtliche
Sicherheits-/Geschäftsregeln bleiben erhalten.

Genau eine notwendige kostenfreie Auth-Vorprüfung gegen eine neue isolierte
PostgreSQL-Datenbank und echtes PostgREST: Acquire, öffentliche Mutation,
Usage-Speicherung ohne Modellaufruf, Release. **4/4 echte CAS-Schreibvorgänge**
zugeordnet, bestätigt und vollständig unter30s gemessen. Maximaler voller
Aufruf **859,089335ms**, maximaler CAS **663,495627ms**.0aktive Profile davor/danach,
0Units,0Modellaufrufe;5000historische Usage-Zeilen unverändert. Unabhängiger
Review23/23 positiv. Die bereits bestätigte500/500-Quellenqualifikation wurde
übernommen, nicht erneut ausgeführt. V8-Coverage wurde im nötigen Auth-Test erfasst.

## Tatsächlicher neuer Vollauf28c

Getesteter Code `3092efecf98b989d90d0b2c7948bd850826bd990`.
Physisch neuer netzloser Container/PGDATA, keine neuen kostenpflichtigen Ressourcen
oder Downloads.
Der lokale Datenbankname bleibt wegen der unveränderten qualifizierten
Quelleninstallation gleich; er bezeichnet hier eine neue Datenbank im neuen
Server, keinen Zugriff auf den alten28b-Versuch. Frische Operation, Signaturen,
Prüfbelege und unabhängig bestätigte Startbedingungen. Gebundenes Zeitfenster
07:12:47.105–10:12:47.104UTC plus30Minuten Abschluss am28.10.; erste
Reserveverletzung **07:36:11.428UTC**, weit vor beiden Tagesgrenzen.

| Kriterium | Tatsächlich belegt |
|---|---|
| Gleichzeitig aktive synthetische Profile |Exakt500, anschließend gebunden500→0 und unabhängig frisch bestätigt |
| Vollständig abgeschlossene DR Units |69/500; lückenlose bestätigte Indizes0–68; während Index69/Profil70 abgebrochen |
| Lokale Mockantworten |138 für die69vollständigen Units belegt; Teilunit70 nicht vollständig quittiert, kein behaupteter Nullbestand |
| Gespeicherte Ergebnisse |207/1500 plus138private D/R-Belege; alle500Profile/1500Sollpositionen nachgelesen |
| Echte Sicherheitskontrollen |1104/8000 in69vollständigen Units:690Load+414Admission; Teilunit nicht als abgeschlossen gezählt |
| Vertragliche Unit60 |69/69unter60s; längste55,6877248s bei Index0; kein500er-Beleg |
| Ganze HTTP-Anfrage |Maximal60,371888269s; getrennt von der vertraglichen Unitgrenze, kein HTTP-60s-PASS |
| Auth30/Zuordnung |828/828CAS in69Units,690Mutations- und138Usage-Hüllen; alle zugeordnet, vollständig bestätigt und unter30s |
| Auth vor Runtime |Vorbereitung1Mutation732,46813ms/1CAS549,802162ms, ZuordnungPASS |
| Gemeinsamer Kernel-RAM-Peak |**1640103936B** bei technisch erzwungenen2048000000B; kein Cache-/Baselineabzug |
| Reserve |**407896064B=19,9168%**, erforderlich409600000B/20%: **FAIL um1703936B** |
| Swap/Kernel-Ereignisse |Swapmaximum und Verbrauch0; max/OOM/OOMkillalle0, kein Neustart/Recovery |
| Sicheres Ende |Einmal gebunden500→0; SQL und unabhängige native Lesung bestätigen beendet/0aktiv/500Profile/501Identitäten |

Die Unitzeit bleibt unverändert unmittelbar vorJ.enter bis zum bestätigten
J.finish-ACK definiert. Der letzte Owner und ein vollständig gewachsener
500er-Datenbestand wurden nicht erreicht. Die erhaltenen69Fortschrittsbelege
enthalten die tatsächlichen Unitzeiten,16Kontrollen und jeweilige erfolgreiche
Auth-Abstimmung. **Exakte numerische Auth-Maxima dieses Vollaufs sind nach dem
Supervisor-SIGTERM nicht persistiert**; die jeUnit gespeicherten <30s-/Zuordnungs-
Prüfergebnisse bleiben vorhanden. Der gezielte859ms-Wert ist kein Ersatz für
fehlende Vollauf-Maxima. Teilunit70 und deren vollständige Schreib-/Antwortzahl
bleiben ohne Abschlussbeleg offen.0echte Modellaufrufe.

## Abbruch, Live-Protokoll und unabhängige Prüfung

Der vorhandene äußere Wächter meldete die erste Reserveverletzung bei69
akzeptierten Profilen und stoppte die Verarbeitung. Zum Abbruch betrug der
aktuelle gemeinsame Verbrauch1460740096B; maßgeblich ist der vorherige
Lebenszeitpeak1640103936B. Das harte2,048GB-Limit wurde nicht erreicht und kein
OOM beobachtet; **der20%-Reservevertrag ist trotzdem verletzt**.

Nach jedem Profil wurden aktueller gemeinsamer RAM, Peak und verbleibende
Peakreserve in dezimalen MB und Prozent im Terminal und Thread ausgegeben.
Ausgabe und Logschreiber arbeiten außerhalb der Test-cgroup am vorhandenen
Wächter; keine zusätzliche DB-Abfrage pro Profil. Die0,1s-Prüfung ist vom
Ausgabepfad getrennt.86äußere Snapshots sind erhalten; die exakte Zahl sämtlicher
0,1s-Abtastungen wurde nicht gespeichert und wird nicht behauptet.

Der unabhängige Speicherreview hat denselben ursprünglichen Kernelpeak nach
Abschluss erneut gelesen: unverändert1640103936B, kein Restart, kein Swap/OOM.
Das Controllerkennzeichen `originalFinalPeakVerified:false` bleibt im Rohbericht
erhalten: Der bereits gesetzte Speicherfehler verhindert dort die Annahme.
Die zusätzliche unabhängige Lesung bestätigt den Zahlenwert in derselben
fortbestehenden cgroup und macht daraus keinen PASS. Eine frische rein lesende
Repeatable-Read-Sicht bestätigt gebundenbeendet/0aktiv. Alle11Originaldateien
mit96530256Bytes sowie die ursprüngliche Source-Datenbank sind unverändert.

Die genaue Ursache des Peaks ist **nicht** bewiesen. Ein früherer vorhandener
Speichersnapshot enthält anonymen und Datei-/Shared-Memory-Verbrauch, aber keine
Zerlegung zum Peakzeitpunkt. Kein Cache wird abgezogen, keine höhere Grenze,
kein Reclaim und keine Konfigurationsreparatur nach dem Abbruch vorgenommen.

## Alle1500Ergebnispositionen und verbleibende Lücken

Die vollständige unabhängige Nachlesung erfasste500Profile/1500Sollpositionen
mit17000Prüfungen. Rohbilanz3501PASS/13499FAIL; diese Prüfungen sind von den
8000Runtime-Sicherheitskontrollen getrennt. Der Supervisorstop hinterließ keine
finale Runtime-Receipt. Der unveränderte Audit markiert deshalb zusätzlich
seinen Runtime-Kontrollbeleg als fehlend; die69vorhandenen Fortschrittsbelege
beweisen die1104Kontrollen separat. Die Rohberichte werden nicht umgeschrieben.

| Rohkennzeichen | Anzahl | Bedeutung |
|---|---:|---|
| Fehlend |1293|431nicht vollständig verarbeitete Profile mal3 |
| Leer |0|Kein vorhandenes leeres Ergebnis |
| Doppelt |0|Keine doppelten Ergebnisse |
| Technisch nicht abgenommen |1500|Gesamtjournal unvollständig; Runtime-Abschlussreceipt fehlt; umfasst207vorhandene Ergebnisse |
| Unbrauchbar |1293|Hier fehlende Ausgaben; kein festgestellter unbrauchbarer generierter Inhalt |

Flags dürfen überlappen. Die207gespeicherten Ergebnisse bleiben fachlich ungeprüft; lokale Mockbindungen und Strukturprüfung sind
keine echte Modellqualität. Der vollständige500er-Mocknachweis bleibt offen,
der spätere Productionnachweis ebenfalls.

Bereinigte öffentliche Belege ohne private Eingaben, Pfade oder Zugangsdaten:

- [Gezielte echte Auth-Messprüfung und Review](belege/w15-processing-20261027/AUTH_MEASUREMENT_20261028_SUMMARY.SAFE.json).
- [Aktueller Vollauf: Bilanz und Nachweisgrenzen](belege/w15-processing-20261027/FULL500_20261028C_SUMMARY.SAFE.json).
- [Jedes abgeschlossene Profil mit gemeinsamem RAM und Erstfehler](belege/w15-processing-20261027/FULL500_20261028C_PROGRESS.SAFE.jsonl).
- [Alle500Profile und1500Positionen mit getrennten Rohkennzeichen](belege/w15-processing-20261027/FULL500_20261028C_ALL_POSITIONS.SAFE.json).
- [Unabhängiger Speicher-/Nullzustandsreview](belege/w15-processing-20261027/FULL500_20261028C_MEMORY_ZERO_REVIEW.SAFE.json).
- [Übernommener500/500Quellen-PASS](belege/w15-processing-20261027/SOURCE_BINDINGS_20261028B_500PASS.SAFE.json).

**Kürzester nächster Schritt nach neuem GO:** Genau den gemeinsamen
Speicherbedarf des bestehenden Pfads eingrenzen und nur die belegte Ursache
beheben. Hartes Limit,20%-Reserve, Sicherheitslogik und Originale erhalten;
keine neue Architektur. Kein automatischer neuer Gesamtversuch. Die aktuelle
Einmalfreigabe ist verbraucht. Historische Fehler unten bleiben erhalten.

Keine neue vollständige CI: App/Server/Sicherheitslogik/Workflows seit der grünen
Basis `da63309c`/CI40534410137 unverändert; gezielte Checks und Reviews für die
Messhülle separat belegt. Auf dem getesteten Kopf3092efec kein neuer
Workflowlauf; kein neues CI-Grün behauptet. PR969/971/972 bleiben ungemergt.
Keine Production-/Hetzner-/Budgetänderungen, echten Modellaufrufe oder neuen
kostenpflichtigen Ressourcen.

---

## Historischer Vollauf28b: Auth-Zuordnung bei Profil1 unvollständig

**Historischer Sprintzustand28b:gescheitert/abgebrochen, kein lokaler Mock500-PASS.**
Die fehlende echte Quellenidentitätsprüfung ist geschlossen: genau eine neue
Vorprüfung erreichte am28.10.,06:29:07.972UTC **500/500PASS,0Fehler**.
Danach wurde unter dem neuen Betreiber-GO genau ein frischer vollständiger
Mock500-Versuch gestartet. Er stoppte bei Profil1 wegen unvollständiger
Auth-/CAS-Messzuordnung. Kein Retry, Resume oder weiterer Gesamtversuch.

## Tatsächliche Bilanz des neuen Versuchs

| Kriterium | Belegtes Ergebnis |
|---|---|
| Gleichzeitig aktive synthetische Profile |Exakt500; anschliessend gebunden500→0, unabhängig frisch bestätigt |
| Vollständige native DR Units |1/500, Profil1/Index0/BB001; Runner-Abnahme0 wegen Auth-Messfehler;499nicht versucht |
| Lokale Mockantworten |2/1000;0echte Modellaufrufe |
| Gespeicherte Ergebnisse |3/1500 plus2private D/R-Belege; alle500Profile/1500Sollpositionen unabhängig nachgelesen |
| Echte Sicherheitskontrollen |16/8000:10Load+6Admission; kein Hochrechnen der ungeprüften7984 |
| Vertragliche Unit60 |56,435357s von unmittelbar vorJ.enter bis Final-ACK vonJ.finish; nur diese eineUnit |
| Ganze HTTP-Anfrage |61,202063s; ausdrücklich kein Ende-zu-Ende-60s-PASS |
| Auth30 |Nicht vollständig nachgewiesen:2CAS-Schreibvorgänge ohne vollständige Aufrufhülle |
| Gemeinsamer Kernel-RAM-Peak |966053888B, technisch erzwungenes Limit2048000000B, Swap0 |
| Tatsächliche Reserve |1081946112B=52,83%; mindestens409600000B/20% eingehalten, nur im abgebrochenen Lauf |
| Memory-Ereignisse/Rückweg |max/OOM/OOMkillalle0, keine Datenbank-Recovery; nativer Endzustandbeendet/0aktiv |

Der unveränderte genehmigte Prüfvertrag definiert die Unitgrenze vorJ.enter bis
zum bestätigten J.finish-Schreibvorgang, nicht als volle HTTP-Anfrage. Beide
Zeiten sind getrennt ausgewiesen. Unit499 und ein gewachsener500er-Datenbestand
wurden nicht erreicht. RAM unter Last aller500Units ist daher weiterhin offen.

## Quellenblocker tatsächlich behoben

Neue Quellen wurden über die bestehenden unveränderten
`storage.getPublicationSourceIdentities` und
`publication-eligibility.filterCandidates` an die echte neue isolierte PostgreSQL/
PostgREST-Datenbank angeschlossen. Zwei tatsächliche GET-Lesungen lieferten die
kompletten Quellenidentitäten bis zum leeren Seitenschluss; kein Request-Override,
keine selbst erzeugten Symbolnachweise, keine geleerte Publikationspolicy.
Die prozesslokalen geprüften KO-Objekte gelangen unmittelbar in beide
Briefing-/Radar-Konstruktorargumente; native KO60-Versionen bleiben plain.
Der rohe Leerseitenrumpf wurde nicht gesondert gespeichert; Schlussfolgerung aus
unverändertem Paging-Code, zwei erfolgreichen GETs und zwei gelesenen Kanten.

Vorher wurden die neuen Source23-, KO60- und vollständigen Link-Postimages gegen
die geprüften Originalartikel gelesen. Alle500 Profile bestanden danach die
unveränderten B/A/F-, L-, AI/Q- und D/R-Payloadprüfungen. Variantenbilanz:
82/82,82/82,83/83,41/41,**120/120BE**,50/50BB,**42/42Variante6**.
Historische Bezeichnung der Variante6 bleibt im Rohbericht; ihr aktueller
Inhalt ist die amtliche Wohnungsbau-/Wohnungslosigkeitsmeldung vom16.10., kein
umetikettierter08.10.-PDF-Inhalt. Sämtliche Originaltexte/Publikationsdaten und14Tage bleiben
unverändert. Neuer Quellen-/Mockinhalt bleibt ausdrücklich manuelle Testfixture,
kein natives Understanding, keine Modellqualität oder professionelle Abnahme.

62 unabhängige Nachlesekontrollen plus500Einzelabgleiche bestätigten Records,
Originalprofile, Request-/Outputhashes, Native-/Derivationsdaten und fünf
qualifizierte Dateien. Separater Herkunftsreview16/16 bestätigte11Originaldateien
mit96530256Bytes und tatsächliche DB-Postimages. Die qualifizierten Daten wurden
im Vollauf gepinnt wiederverwendet; die500er-Vorprüfung wurde nicht wiederholt.
Der frische signierte Command erhielt die notwendige eigene Requesthashbindung.
Native6Source23/6KO60 mit vollständigen Links wurden vor Aktivierung neu gelesen.

## Konkreter Erstfehler der Vollausführung

`w15-full500-all-unit-auth30-cas-assigned` bei Index0. Die Anwendung antwortete
HTTP200/ok mit1abgeschlossener Unit und speicherte die drei Ergebnisse.
Der Runner stoppte danach vor einem zweiten Dispatch.

Alle12 beobachteten CAS-Schreibvorgänge besitzen bestätigte Schreib-ACKs unter30s.
Die acht vollständig beobachteten öffentlichen Mutationen dauerten maximal
667,295ms, zwei Usage-Aufrufe maximal619,227ms, reine CAS-Schreibvorgänge maximal
568,114ms. **CAS1 undCAS10 tragen jedoch keine Aufrufhülle** (`envelopeId:null`),
ihre Writezeiten418,362ms bzw.427,290ms ersetzen nicht die vollständige Messung
von Queue/Read/Callback bis ACK. Daher `allWritesAssigned=false` und
`allWritesBoundedByEnvelope=false`; kein Auth30-PASS.

Der bestehende Beobachter umhüllt öffentliche Auth-Mutationen und Usage-Sinks.
Die Pipeline-Sperre ruft über die vorhandenen Acquire-/Release-APIs dagegen
lexikalisch `writeAuthStore` auf. Diese beiden Aufrufpfade sind im unveränderten
Quelltext belegt. Die Zuordnung zu den konkreten CAS-IDs ist aus Quelle und
Zeitlage abgeleitet; ein ursprünglicher Caller-Stack wurde nicht erfasst und
wird nicht nachträglich erfunden. Keine Sicherheitskontrolle hat falsch
freigegeben, keine echte Kosten-/Authregel wurde abgeschwächt.

## Ergebnisse, Rückführung und Nachweisgrenzen

Die unabhängige Nachlesung prüfte500Owners/1500Sollpositionen mit17000
Einzelkontrollen, davon1530positiv/15470negativ. Die drei vorhandenen Ergebnisse
haben korrekte native Zeilen, Quellen-, Payload- und Hashbindungen; beim ersten
Owner sind33/34Prüfungen positiv. Die verbleibende Prüfung fordert den nicht
vorhandenen vollständigen500er-Journalabschluss.

| Rohkennzeichen der Ergebnisprüfung | Anzahl | Einordnung |
|---|---:|---|
| Fehlend |1497|499nicht verarbeitete Profile mal3 |
| Leer |0|Kein vorhandenes leeres Ergebnis |
| Doppelt |0|Keine doppelten Ergebnisse |
| Technisch nicht abgenommen |1500|Gesamtjournal nicht abgeschlossen; umfasst auch drei vorhandene Payloads |
| Unbrauchbar |1497|Hier fehlende Ergebnisse; keine generierten unbrauchbaren Texte festgestellt |

Die Rohkennzeichen dürfen überlappen und werden nicht zu disjunkten Kategorien
umgedeutet. Die drei Inhalte bleiben professionell ungeprüft; ihre Existenz und
Einzelbindungen sind kein bestandener Gesamtlauf und kein Beleg echter Modellqualität.

Einmalige gebundene native Rückführung500→0 erfolgreich. Zwei unabhängige
Nachlesungen bestätigen0aktiv/500Profile/501Identitäten, nativebeendet,
Quittungsbindung und unveränderte Fach-/Fremdfelder. Der behaltene Teiljournalstand
ist Index1/running/keinInFlight, keine fortsetzbare neue Freigabe. Originalquelle
und11Originaldateien unverändert; Original-cgroupPeak bis nach der Nachlesung
bestätigt, alle Memory-Ereignisse0, kein Ersatzpeak aus einem Neustart.

Die detaillierten unveränderten Berichte und privaten Eingabedateien bleiben
im geschützten Cloud-Arbeitsbereich. Im öffentlichen Repository liegen nur
bereinigte Statusprojektionen ohne private Eingaben, Pfade oder Zugangsdaten:

- [Alle500 Quellen-/Konstruktorergebnisse](belege/w15-processing-20261027/SOURCE_BINDINGS_20261028B_500PASS.SAFE.json).
- [Tatsächliche Vollaufmetriken, Rohkategorien und Rückführung](belege/w15-processing-20261027/FULL500_20261028B_SUMMARY.SAFE.json).

**Nächster engster Schritt nach neuem GO:** Messhülle der bestehenden
Pipeline-Sperr-APIs vervollständigen, sodass auch deren Queue/Read/Callback/ACK
und CAS-Schreibvorgänge lückenlos gebunden sind. Keine Sicherheits- oder
Zeitgrenzen ändern. Keine Reparatur/Wiederholung dieses verbrauchten Versuchs;
ein weiterer Gesamtversuch braucht eine neue ausdrückliche Freigabe.

Codebranch `codex/w15-signed-runtime-integration-20261027`, getesteter Codecommit
`98be4f6687b40145a8bc4907b8a7dc48197f6d49`. Anwendung/Server/Workflows seit der
grünen Basis `da63309c`/CI40534410137 unverändert. Keine neue Voll-CI; gezielte
Syntax7JS/2Python und notwendige500er-Qualifikation, V8-Coverage dabei erfasst.
PR969/971/972 bleiben ungemergt. Keine Production-/Hetzner-/Budgetänderungen,
keine neuen kostenpflichtigen Ressourcen und keine echten Modellaufrufe.
Lokaler Mockvollnachweis und späterer Productionnachweis bleiben offen.

---

# Historischer Stand vor dem neuen GO:Quellen vorbereitet,Vorprüfung50/1/449

**Abgebrochen nach erstem FAIL:** Genau eine kostenfreie datenreine Prüfung,
06:03:36.135–06:03:38.805UTC (09:03:36–38Istanbul). **50 PASS,1 FAIL,
449 nicht versucht.** Das Ziel500/500 ist nicht erreicht. Kein neuer lokaler W15-Vollauf,
lokaler Container, DB-Schreibzugriff, Aktivierung, Unit, Mockantwort oder Modellaufruf.
Die bedingte Freigabe für einen neuen Mock500-Gesamtversuch ist ungenutzt.

## Neue belegte Originalquellen und lokale Bindungen

Im vorhandenen Bestand fehlten geeignete Quellen. Nur zwei neue amtliche
Originalartikel und der kleine amtliche Berliner Zeitnachweis wurden abgerufen;
alle verbleiben geschützt in der Cloud, ohne Mac-Download oder Originalersatz.

- Berlin: [Steuerschätzung vom23.10.](https://www.berlin.de/sen/finanzen/presse/pressemitteilungen/pressemitteilung.1730442.php),
  amtlicher Index23.10.,12:52Berlin/10:52UTC, Minutenpräzision. HTML50643B,
  SHA256 `717c311350b734ae503946cb238d531f7d0c66a77e4bc2b037635fb8f1b24e3d`.
  Vollständiger zusammenhängender Auszug1139Zeichen: erwartete31,3/32,4Mrd.Euro
  Steuereinnahmen2026/27 und ausdrücklich zugeschriebene Wirtschaftsunsicherheit.
- Variante6: [Bundestagsmeldung vom16.10.](https://www.bundestag.de/presse/hib/kurzmeldungen-1225362),
  nur Publikationstag belegt, keine erfundene Veröffentlichungsuhrzeit. HTML256798B,
  SHA256 `c6938aebddb2e5c2203b6c5892802010ae78cc46e6d1cf76554995136f2c12ca`.
  Vollständige benachbarte Absätze1177Zeichen: Grünen-Forderung nach sozialem
  Wohnungsbau/Bestandsnutzung und zugeschriebene Genehmigungshürden.
  Keine alten PDF-Zahlen oder Statistikbehauptungen übernommen.

Beide Quellen liegen am tatsächlichen28.10. vollständig im unveränderten
14-Tage-Fenster.16 Quellen-/Auszugs-/Zeitbelege positiv und durch Root zusätzlich
an den Original-HTMLs gegengelesen. Quellen-/Mock-/Inputhelpers sind ausschließlich
optionale lokale Testdaten:120 neue BE-Bindungen und42 Wohnungsbau-Bindungen,
neu und offen manuell kuratiert; keine Modellreview- oder native U-Quittung.
Die anderen338 ausgewählten Briefings bleiben inhaltlich bei ihren historischen
Quellen, nur Kalenderbindung neu. Das gemeinsame ausgewählte Inventar wird
getrennt offengelegt:7→6Dokumente,6KOs/6Cluster; alte Originale bleiben erhalten.

Für die neuen Briefingdaten verwendet der unveränderte B-Konstruktor ein
explizites lokales Test-Lesefenster ab16.10.; keine Behauptung heutiger Nachrichten
oder eines nativen Morgenreceipts. Die echte Lage-Quellenfrist, Systemuhr,
Signaturen, Kosten-, Auth-, Einmaligkeits- und Productionregeln bleiben unverändert.
BT-Mitternacht ist ausschließlich dokumentierte Speicherung des belegten Tags;
die lokale Anzeige nennt ehrlich nur diesen Tag, keine Publisher-Uhrzeit.

## Erster tatsächlicher Fehler und engster Folgeschritt

**Index50, `test-kohorte-synthetik-be-001`, Variante4:**
`publication-eligibility-candidate-unchecked` während der Bindungskonstruktion.
Die vorigen50 Brandenburgprofile bestanden die echten unveränderten B/A/F-/L-
und AI/Q-/D/R-Konstruktoren. Für die übrigen449 gab es nach dem ersten Fehler
keine weitere Konstruktorprüfung; insbesondere Variante6 ist noch nicht dynamisch
abgenommen. Keine qualifizierten Daten-/Mockpakete wurden geschrieben.

Der neue Testhelper übergibt seinen neuen Wissenseintrag direkt an
`toBriefingContractV3`. Dessen echte Radarprojektion verlangt unter der erhaltenen
Veröffentlichungspolicy den prozesslokalen Kandidatennachweis. Dieser entsteht
nur durch den bestehenden `publication-eligibility.filterCandidates`-Pfad mit
vollständiger Quellenidentitätslesung. Der Aufruf fehlt im neuen lokalen Helper.
Ein kopierter Policyhash oder ein manuelles A/F-Urteil ersetzt diesen Nachweis
nicht. Der Guard hat korrekt gesperrt; dies ist kein inhaltliches Quellenurteil.

Der vorherige statische Review hatte diese Konstruktorvorbedingung übersehen.
Zwei unabhängige Nachlesereviews bestätigen den tatsächlichen FAIL;44 Kontrollen
im Qualifikationsreview. Die Fehleraufzeichnung enthält an dieser frühen Phase
noch alte RBB-Vorgängermetadaten. Die tatsächlich neu versuchte Quelle/KO sind
im unabhängigen Bericht und Native-Ableitungsbeleg eindeutig separat benannt.
Alle11 Originaldateien mit96530256Bytes byte-/hashgleich; auch die ursprüngliche
isolierte Datenbank ist gegen den erhaltenen Vorherbeleg unverändert.

Nach FAIL keine Reparatur oder Wiederholung. Kürzester nächster Schritt ist die
fehlende reguläre Kandidatenprüfung mit vollständigen Quellenidentitäten vor
dem B-Konstruktor einzubinden und erneut gezielt zu prüfen. **Wegen der ausdrücklichen
Stop-Regel ist dafür ein neues GO erforderlich.** Keine Policy leeren,
keine Freigabe fälschen und keine Sicherheitskontrolle überspringen.
V8-Coverage wurde im notwendigen Lauf erfasst; keine weitere lokale Testsuite
oder manuelle Voll-CI gestartet. Der Push löste automatisch
[CI40642019279](https://github.com/ernisch/helmut-pilot/actions/runs/40642019279)
aus. Nach dem bestätigten lokalen FAIL wurde deren Abbruch angefordert, um
bereits belegte Volltests nicht weiter zu wiederholen. Die untenstehenden
Nullzähler gelten für die lokale W15-Datenprüfung, nicht für diesen gesonderten
automatischen GitHub-Lauf. Kein neues CI-Grün. Diese abschließende reine
Dokukorrektur überspringt eine weitere identische CI-Auslösung; keine
Prüfkonfiguration oder Merge-Schutzregel wurde geändert.
App/Server/Workflows sind seit der grünen Basis `da63309c`/CI40534410137 unverändert;
diese neue datenreine Qualifikation ist ausdrücklich FAIL, kein neues CI-Grün.

- [Zusammenfassung, Quellenpins, Bilanz und nächste Änderung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SUMMARY.SAFE.json).
- [Alle51 tatsächlichen Einzelprotokolle](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_QUALIFICATION.SAFE.json).
- [Unabhängiger Qualifikationsreview](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_REVIEW.SAFE.json).
- [Originalerhaltung und konkrete Veröffentlichungsbindung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_ORIGINALS.SAFE.json).
- [Quelleninhalt und Datumspräzision](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SOURCE_REVIEW.SAFE.json).
- [Ursprüngliche isolierte Datenbank unverändert](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_SOURCE_DB.SAFE.json).
- [V8-Abdeckung dieser begrenzten Vorprüfung](belege/w15-processing-20261027/CURRENT_SOURCES_20261028_COVERAGE.SAFE.json).

PR969/971/972 bleiben ungemergt. Kein500er-PASS, keine neuen gespeicherten Ausgaben;
Ergebniskategorien eines neuen Gesamtlaufs nicht anwendbar. Historische Fehler und
die früher1500fehlenden Ausgaben bleiben im folgenden Befund und im separaten
Vollaufdossier unverändert erhalten. Kein Productionnachweis.

---

# Historischer Befund vor Quellenaktualisierung:338PASS/162FAIL

Die einmalige vollstaendige Vorpruefung lief am28.10.,05:30:21.782UTC
(08:30:21Istanbul) mit den echten bestehenden Konstruktoren und unveraenderten
Quellenpruefungen.500/500 Profile wurden einzeln erfasst: **338 gueltige D-/R-
Bindungen,162 abgewiesen**. Das geforderte500/500-PASS ist nicht erreicht.
Kein neuer Vollauf, Container, Datenbankschreibzugriff, Profilaktivierung,
Unit, Mockantwort oder echter Modellaufruf. Keine Wiederholung.

## Belegter Befund je Variante

| Variante | Profile | D/R gueltig | Fehler |
|---|---:|---:|---:|
|0/Oel-Gas|82|82|0|
|1/Tabak|82|82|0|
|2/Elektromobilitaet|83|83|0|
|3/Elektromobilitaet|41|41|0|
|4/Berlin|120|0|120|
|5/Brandenburg|50|50|0|
|6/Zwangsversteigerungen-PDF|42|0|42|
|Gesamt|500|338|162|

**Berlin, Indices50–169:** Alle120 Profile binden allein den RBB-Beitrag vom
13.10.,11:02:48UTC. Er liegt am tatsächlichen Lauftag ausserhalb des
unveraenderten14-Tage-Fensters. Der echte D-Kontext ist leer; der unveraenderte
Provider wirft `w15-unit0-provider-empty-context`. D und R sind mit diesem
gebundenen Input nicht konstruierbar. Betroffener Quellenbezug:
`q-52da9d6e37f47514600f`, Dokument `rd-691117a4712de0582634fca3081d3ee6c2d6a65c3c4360086dd5caffbd44800d`.

**Variante6,42 Profile:** Erster heute tatsaechlich protokollierter Index170.
Der reale Kontext erlaubt `q-e61c51251bc1d8866dd3` (hib15.10.), der Mock zitiert
`q-89cfb5d28f8ae51b8021` (PDF08.10.). Der echte Guard weist alle42 mit
`ai-text-source-reference` ab. Die hib-Kurzmeldung belegt nicht die bisherigen
PDF-Zahlen2000–3000 und die detaillierten Statistikgrenzen. Ein reiner Austausch
der Quellen-ID waere unbelegt. Die alte Behauptung wurde weder umetikettiert
noch als gueltiger neuer Mock ausgegeben. Ein inhaltlich ausreichend belegter
Ersatz fuer die verlangten zwei eigenstaendigen Absaetze liegt nicht vor.

Der neue Indexbefund stammt ausschliesslich aus dieser freigegebenen
Vorpruefung. Er rekonstruiert nicht nachtraeglich den unprotokollierten ersten
Fehlerindex des vorigen Gesamtversuchs.

## Originale und echte Pruefungen erhalten

Die neue Diagnostik verwendet ausschliesslich `rebindOrdinaryRow`: nur die
fuenf vorhandenen Kalender-/Hashpfade aendern sich im abgeleiteten Speicherobjekt.
Quelltexte, Publikationsdaten, Profile und Native-Inventar bleiben unveraendert.
Quellen- und Codepins sowie Native-Vorher-/Nachherhashes unabhaengig bestaetigt.
Die vorher verwendete `w15-synthetic-window`-Quellenverjuengung wurde nicht
aufgerufen. Unter diesem GO ist jener alte Ableitungspfad kein zulaessiger
Weg, um den fehlenden Berlin-Kontext zu erzeugen.

Je Profil laufen echte B/A/F-Bindung, L-D-Kontext und der unveraenderte
`w15-unit0-provider.prepare` mit AI-/Q-Pruefung und D-/R-Payloadkonstruktoren,
soweit der Input sie zulaesst. Bei abgewiesenem D-/Quellenkontext wird kein
R-PASS erfunden. Die vollstaendige Fehlerliste nennt pro Fall Index, Owner,
Variante, Dokument-ID/Originaldatum, Mock-qID, reale Kontext-qIDs und Fehlergrund.
Zusaetzliche Referenzvergleiche sind Diagnosemetadaten, keine Ersatzvalidatoren.

Zwei unabhaengige reine Berichts-/Quelldatenreviews bestaetigen die Bilanz und
Originalerhaltung;39 Kontrollen im inhaltlichen Review positiv. Keine neuen
Konstruktoren, Units oder Vorpruefungswiederholungen durch die Reviewer.
V8-Coverage beim noetigen einmaligen Lauf mit erfasst; keine neue Voll-CI oder
Runtime-/500er-Leistungsabnahme. App-, Quellen- und Sicherheitslogik unveraendert.

## Daten-/Bindungsgrenze und naechster notwendiger Schritt

Eine reine Mocktext-/ID-Korrektur behebt den fehlenden aktuellen Quellenkontext
der120 Berlinprofile nicht. Benoetigt werden eine tatsaechlich zulaessige
Quellengrundlage und ein ehrlich neu gebundener gepruefter Briefingkontext;
fuer42 weitere Profile ausserdem vollstaendig belegbare Mockinhalte. Die
bestehenden gebundenen Eingaben liefern diesen500er-PASS nicht.

Nach der fehlgeschlagenen Gesamtqualifikation gestoppt: keine Mockreparatur
als erfolgreich behauptet, keine Verjuengung/Umdeklarierung, keine Lockerung
von Quelle/Signatur/Kosten/Einmaligkeit/Auth, kein neuer Vollauf gestartet.
Die bedingte Freigabe fuer den neuen Gesamtversuch bleibt **ungenutzt**;
ein Start setzt weiterhin500/500PASS mit unabhaengigem Review voraus.
Neue gespeicherte Ausgaben fehlen, weil kein neuer Lauf erfolgte: deren
Ergebniskategorien sind hier nicht anwendbar. Der alte Vollauf-FAIL und seine
1500fehlenden Sollpositionen bleiben eigene historische Belege.

- [Alle500 Einzelergebnisse und162 Fehler](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_ALL500.SAFE.json).
- [Zusammenfassung](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_SUMMARY.SAFE.json).
- [Unabhaengiger inhaltlicher Review](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_REVIEW.SAFE.json).
- [Unabhaengige Originalerhaltung](belege/w15-processing-20261027/MOCK_BINDINGS_20261028_SOURCE_PRESERVATION.SAFE.json).

PR969/971/972 bleiben ungemergt. Kein lokaler Mock500-PASS und kein
Productionnachweis; keine Production-, Modell-, Hetzner- oder bezahlten Ressourcenaktionen.
