# CURRENT STATE — Helmut

**Lokal 22.10.2026 Europe/Istanbul; letzter echter Production-Befund 16.10.2026 13:07:32 UTC, historische Basis 13.10.2026.** Production gilt nur zum Prüfzeitpunkt; keine aktuelle Production-Verifikation. Alte Cockpitfassung bleibt auf Git-Merge `8ca835cec22e738d2ffb2c7a6b55550cdf667a63`. Vollständiger Stand vor dieser Verdichtung: [Archiv](archive/project_state/2026_10_20_CURRENT_STATE_before_local_ram_fix_compaction.md).

## 22.10.: CI-Zielcloud vorbereitet, Originaltransfer offen

Neue Cloud: Übergabe/SHA256 geprüft; eigener GPG-Empfänger, öffentlicher
Schlüssel/Zielbericht owner-only in Drive bytegleich zurückgeladen.
83CI-Originale hier noch nicht übernommen. Cloud-Admin-Token ready, direkte
GitHub-Admin-/Environmentabfragen weiter403, auch nach Betreiberkorrektur.
Lokaler Credential-Erbschutz erweitert:111/111gezielte ChecksPASS, SyntaxPASS,
unabhängiger Diffreview ohne Befund. Kein echter Originalverbraucher-/CI-Erfolg.
[Schutzfix und Transferstand](betrieb/private-ci-original-provisioning-20261021.md).

Owner-/Quellen-/Recipe-/Abschlussbindung integriert, native Abnahme offen.
Quellstand21.10.:15.227.342.848B frei/15.179.779.720B Admission nach Einzelbereinigung;
kein aktueller Ziel-Admissionbeleg. Unit60 spätV12 braucht getrennten Ein-Unit-Vertrag.
Alle GOs verbraucht; kein Voll500/Production/Merge.
[Vorheriger Integrationsstand](betrieb/helmut-blocker-integration-20261021.md).

## 21.10.: V12 fehlgeschlagen; zwei Motoränderungen lokal belegt

Einmaliger Mock500 auf `cd1c4372`, Fall `f3375a7d5548`: 499 ACK/HTTP200,
Index499 HTTP409 `synthetik500-dispatch-EU-unit-deadline`. Erwartete1497 Positionen
beendeter Einheiten, keine1500er Abnahme. Slot12/GO/Claim/Setup verbraucht und erhalten.
[Originaler Endbeleg](betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json),
[Einordnung](betrieb/next-local-full500-20261021.md).
Gemeinsamer Peak1.400.479.744B, high374/max0/OOM0, Gruppen bis letztem Exit leer.
647.520.256B rechnerischer Abstand sind wegen FAIL/Speicherdruck kein Puffernachweis.
Ziel≤1.548.000.000B mit500.000.000B Reserve unverändert. Appanon634.236.928B und
DBfile382.468.096B stammen aus demselben Snapshot; getrennte Peaks nicht addieren.
8Originalpins/SourceWrites0/Day21-42BücherPASS; kein neuer PostgREST-Abschlussfehler,
jedoch keine eigene strenge Einzelquittung. 83.476Requests/4000Mutationen/24.492Events
unabhängig geprüft. Motor ohne Anbieter früh12,412/spät24,543s Median, Spitze31,361s;
38Graphreads/12CAS pro Einheit. Zwei Usage-Writes allein<1,826s sind keine Lösung.

Authentische späte Arbeitskopie:1714Dateien/372.011.391B. P-PhasenprüfungPASS:
4frischeReads/2nichtgesendeteCaptures/0CAS; warm Vollread520ms,Kontrollread259/264ms,
Capture122/124ms. Zwei frühereHTTP-Diagnosen bleibenFAIL. F-FinanzprüfungPASS:
6Kontrollreads, warme Mediane186ms Lesen/6,4ms financial/2ms kontrolliere.
Die Finanzberechnung ist kein Hauptengpass; keine Retentionsaussage aus Endpunktdeltas.

Budgetfix: `canSpendLlmForTenant` spart nur bei ohnehin inerter Tenantpolicy zwei
Kostenreads; Globalcheck bleibt frisch, positive Budgets/Failclosed unverändert.
67Assertions/1352Alt-Neu-FällePASS. [E-Vergleich](betrieb/belege/next-local-full500-20261021/V12_TENANT_BUDGET_COMPARISON.SAFE.json):
OLD/NEW/NEW/OLD, Peakmittel594.139.136→538.824.704B (−55.314.432B/9,31%), beide Paare
positiv. CPU17,785→12,981s, Gate737→331ms,18→6verifizierteReads/0CAS. Entscheidungen
identisch gesperrt(Default50/Verbrauch1000), History6000 unverändert. Damalige179er
Suite zuerst178/179; fehlenden Storage-Artefaktpin korrigiert, betroffene10ChecksPASS.

Struktureller Sperrumbau: explizit lokaler `invocation-lease-v1` in Lage/Storage,
zwei vollständige Auth-Read/CAS-Zyklen durch kleine SQL-Aufrufe ersetzt. Originale
Funktionskörper20260719, privater Handle pro Aufruf statt Job-Tokenmap; strikteACKs,
Ziel/Modus gebunden. Unbekanntes Release oder verlorener Besitz verhindert Erfolg;
kein Retry/Fallback. DefaultAUS, globales Flag unverändert. NativeG-V2PASS:
11LockRPC/2frischeFullreads/0AuthCAS, echte Konkurrenz/TTL/alterToken/Nachfolger,
Root/History6000/vier historische abgelaufene Locks unverändert. G1 bleibtFAIL vorSQL
wegen falscher Totalleer-Annahme. [Native Abnahme](betrieb/belege/local-lock-lease-20261021/ROOT_LOCAL_LOCK_LEASE_ACCEPTANCE.SAFE.json).
[H-Vergleich](betrieb/belege/local-lock-lease-20261021/WARM_COMPONENT_COMPARISON.SAFE.json):
vier Arme je6ZyklenPASS, Peakmittel611.895.296→536.227.840B (−75.667.456B/12,366%),
beide Paare positiv. CPU25,089→13,456s; mit Abschluss26,270→15,613s;
Zyklusmedian1659→22ms. OLD12interneReads/12CAS,NEW12LeaseRPC/0CAS; beide3Witnessreads.
Datenhash ohne Revision/Root/History/Altlocks gleich; alle Exits0/EOF/Gruppen leer/Events0.
WAL-Insertfenster222352→58732B vorShutdown; Graphrelation+45056→0B. SOURCE/ACTUAL
unabhängigPASS. E/H: warmer geteilter Cache, direktesSQL, fortgeschriebene physische
COPY; kein HTTP-/Langzeitplateau-/500MB-Beweis. Ersparnisse nicht addieren.

Codecommitd6778b78 umfasst Binding6395887a und engen Senderguard: echte Receipts,
50Runtimepins/26Vorlagen/3Umgebungen gebunden, alte Bloblocks vor Bootstrap frisch
streng prüfen und erhalten. Bounded Sender-Control Pflicht; Katalogleerprüfung nur
Start/Final. SOURCEPASS,28JS-/2Python-PurechecksPASS, RootgenuineDescriptorPASS;
Client15GruppenPASS. Neue89Runtimepins/10ArtefaktchecksPASS nach Mappingkorrektur;
erster Metadatenfehler bleibtFAIL. 180er Offline-Schlusslauf tatsächlich178/180
in676s; nur Dokumentgröße/Env-InventarFAIL. Beide korrigiert, gezielt4/38ChecksPASS;
kein umgedeuteter durchgehend grüner Lauf. Unbeabsichtigten --help-Start beendet.

Unit60 UNQUALIFIZIERT: Index499 J.enter→409 exakt62,954656s inklusive Fehlercleanup.
Komponenten-Zeitgewinne belegen keine gemessene Fullmotorreserve.
Echter HTTP-Auth-Zyklus I:5Reads/2CAS/2Callbacks bestätigt, Datenhash ohne Revision/
Root/History/4Altlocks wiederhergestellt; alle7HTTP200. GesamtFAIL wegen PostgREST
TERM→−2 ohne passende Configqualifikation; kein Timeout/Kill/EOF-Fehler, Gruppeleer.
675.733.504B Diagnosepeak/alleEvents0 kein Reservebeweis. Warme Reads6,67MB,
Header201ms Median; CASHeader205/207ms, Callback0,065/0,029ms. Capture35/55ms,
Build91/93ms; verschachtelte Zeiten nicht addieren. SOURCE/ACTUAL unabhängig geprüft.
J-HTTP-Lockvergleich tatsächlichOLD/NEW/NEW/OLD je6ZyklenPASS: Peakmittel
718.508.032→640.927.744B (−77.580.288B/10,797%); beidePaare80.384.000/74.776.576B
positiv. CPU22,569→13,842s; Abschluss23,887→16,106s; Arm-Zyklusmediane1384→9,32ms.
OLD15Fullreads/12CAS,NEW3Fullreads/12LeaseRPC/0CAS jeArm, 298Quellen gleich. Root/
History6000/Altlocks/Datenhash ohneRevision gleich, Gruppenleer/EOF/alleEvents0.
NeuePolicy VORStart: exakte frische304B-Config/Binary/8Upstreamdateien/Nonce,
einmaliges privatesObjekt; rawPostgREST−2 nuralsbelegteTERM→UserInterrupt→SIGINT-
Übersetzung gewertet. 28PuretestsPASS, Originalhelper/I-FAIL unverändert.
Warmer geteilterCache/fortgeschriebeneCOPY/Instrumentierungsaufwand enthalten;
keinPlateau/Fullmotor/Unit60/500MB-Pufferbeweis. Unabhängige SOURCE/ACTUAL-AbnahmePASS.

Branch `codex/controlled-cleanup-and-late-probe-20261020`, DraftPR927 auf926/925/924;
c8624f7c erhalten, U93917a57/Partsf30089e7 unverändert. Frühere Kombination
1.170.790.400→1.015.904.256B/−13,23% kein500Beweis;95native/34Gates/22Integration
nicht wiederholt. W45OFF/NEW30/NEW8/112B-Formel abgeschlossen.
Originalimage/8Inputs nachHTTPfrischSHA-unverändert, Originalprozesseleben.
Platte20:52UTC8.965.083.136B frei/8GiBFloor, volleAdmission15.179.779.720B;
Fehlbetrag6.214.696.584B. Alle benötigten Originale/DBstände/Belege bleibenKEEP.
Frühere66d3Hülle konkret freigegeben entfernt/netto911.409.152B; sonst Originale,
Archive/DBstände/Git/FAIL/UNKNOWN KEEP. HistorischeCloud nicht direkt angebunden,
authentifizierte lokale Quelle real. CI39671828506 aufd6778b78FAIL: Day21Importfix
wirkt; private Originalharnessdatei fehlt(`regular pinned file required`). Browser/
MobileSmokePASS, VercelPreviewFAIL separat. Keine Ersatzoriginale oder SkipsalsPASS.
Router erlaubt/unverändert, aktuelle kritische Arbeit SOL, keine externen Modellaufrufe.
Betreiberkosten unverändert. 500/1500/Offline90/Unit60/Auth30/16frischeKontrollen offen.
Kein Production/Merge/Deploy/Reserveänderung/Voll500; alle altenGOs einschließlichV12verbraucht.
Lokaler Umbau/HTTP-Komponentenbeleg abgeschlossen; Gesamtziel teilweiseoffen.
[Nächster sicherer Schritt](betrieb/belege/local-lock-lease-20261021/NEXT_SAFE_STEP.SAFE.json).

## 20.10.: Vorheriger Diagnostikstand vor der neuen Bereinigungsfreigabe

Vorheriger Branch `codex/late-state-memory-diagnostics-20261020`, Basisf0d3b039
(PR925 auf PR924); c8624f7c erhalten. Damals Sortier-/Temp-I/O-Ursache unklar,
nativer Starter noch unqualifiziert und9.662.464B unter Komponentenadmission.
Dieser historische Stand wurde durch die oben belegte Bereinigung, Einbindung
und tatsächlichen Diagnosen abgelöst; alte PostgREST-FAILs bleiben FAIL.
[Befund, Belege und konkrete nächste Messung](betrieb/late-state-memory-diagnostics-20261020.md).

## 20.10.: Vorheriger Renderer-Sprint; 500er Abnahme offen

Eigener Branch `codex/auth-state-working-set-20261020`, Basis `bdb2c2c3`,
`c8624f7c` erhalten. PostgreSQLs materialisierte Vorkommens-/Sortier-/Tokenmengen
im abschließenden Merkle-Renderer durch Tiefenstapel und UTF8-Fragmente ersetzt;
Schutzprüfungen, ABI, CAS, ACK, History und Kontrollleser unverändert.
Neue Quellenbindung separat von historischen Abnahmen, frische Integration
weiter Pflicht. Kein Router-/DeepSeekaufruf in diesem SOL-Sprint.

Echter OLD/NEW/NEW/OLD-Vergleich am unveränderten späten V11-Authzustand:
alle nativen Ausgaben exakt gleich. Rund125MB weniger anonymer Speicher je
Backend; zweites Paar621ms alt/294ms neu. Neue Authkomponente:11 bestätigte
Mutationen,192 frische Kontrollen, CAS-Konflikt, verloreneBestätigung ohneRetry,
zwei echte kostenfreie Ledgeranhänge mit vollständigem6000er Historysuffix PASS.
Separat39 Fälle/95 native Differentialvergleiche,22 Integrationstests und6
Startprüfungen PASS. KonservativeSQL-Regression179/179 in698s, Prozessende0;
endgültigeDescriptorbindung separat gezielt und am echten Katalog geprüft.

Vergleichssteuerung bleibt FAIL wegen PostgREST-Abschluss vor der dort geplanten
Differentialphase; keine Umwertung. Gesamte eigene Lebenszeitgruppe bis letztem
Exit1094455296B/OOM0, enthält OLD+NEW/Setup/RAM-PGDATA/JIT und ist kein exklusiver
NEW- oder Voll500-Nachweis.64KiB ist nur logischer Fragmentpuffer, nicht GesamtRAM.
Zwölf Runden mit GC-Wellen belegen kein langfristiges Plateau. Größter Gesamt-
verursacher und vollständige500MB-/Zeit-/Ergebnisannahme bleiben offen.
Plattenreserve weiterhin rund6,58GB zu klein,8GiB Boden unverändert.
Kein neues vollständigesGO, keine Production/Migration/Merge/Deployment.
[Änderung, tatsächliche Belege, Grenzen und genauer Haltepunkt](betrieb/local-streamed-renderer-20261020.md).

## 20.10.: V11 fehlgeschlagen; gemeinsame RAM- und Nodebudgets lokal eingebunden

**V11 ist durchgeführt und verbraucht. Kein neues Voll500-GO.** Testcode5fae25be,
Fall3b3bf56650bc:499ACKs,1497vorhandene Positionszeilen; fachliche Brauchbarkeit
nicht nachträglich angenommen. Gemeinsamer nativer Peak2151936000B, harte
2048000000B und1548000000B-Pufferziel verfehlt; fehlende Reserve603936000B.
Die letzte Unit scheiterte an ihrer unveränderten60s-Frist. Alle eigenen
Anwendungs-/DB-/Broker-/Holderprozesse beendet; Originale erhalten. Die
V11-Endauswertung und52Konsistenzchecks bestätigen diesen Fehlbefund.

Die tatsächliche gemeinsame Gruppe war unbeschränkt(max/high/swap=max).
207Originalsamples zeigen steigende Anon- und DB-Dateicachebelegung, kein
belegtes Plateau; exakte Heap-/PSS-/GC-Ursache im V11-Original ungeklärt.
Der nachfolgende Motorstand2dba4317(inklusivec8624f7c) wurde vonV11 noch
nicht getestet. Betreiberkosten und Offline90/Unit60/Auth30/16Kontrollen
bleiben unverändert.

Vorheriger Budgetbranch **codex/native-working-set-budget-20261020**, Basis
2dba431716b5d1693b7039db9233b97f9db5db75: NativePolicy/2 setzt vorStorage/DB/
Anwendung eine gemeinsame cgroup2-Grenze1547997184B, high1399996416B,
swap0. Zwei kleine Setuphelfer zählen bis zum letzten Exit mit; keinPeakreset,
keine Altgruppe, keine zusätzlichen Capabilities. Exakte Policy-/Runtime-/
Quellenbindung,32Startgruppen, einmaligeReservation und neueFreigabe bleiben
Pflicht. Gesamtannahme verlangt jetzt zusätzlich den vollständigen500MB-Puffer.

Node/Worker erhalten lokal explizit old384+Semi16; tatsächlich432MiB V8limit,
keine Behauptung über gesamtenRSS. Ohne diese Optionen erkannte die neue
Authkomponente die Elternkappe nicht. AlteV11-Vorlage hatte explizitold1536.
Private Contentworker bleiben ohnePreload/Runtimecredentials und mit
unveränderten Corequellen; Parent misst sie über öffentlichen Diagnosekanal
und getHeapStatistics. Fehlende Messung/Exit oder Drift blockiert. Fehler-
abschluss stoppt exakte eigene IDs auch bei Diagnose-I/O-Fehlern, wahrt
ursprüngliche Fehler und verbrauchte Freigaben.

Echte getrennte Komponenten: Auth/PG/REST468185088B(initialer5000-History-Seed,
256Kontrollreads/9CAS/Restore, noch ohneHeapdeckel); vollständiger Original-
Eingabenleser83079168B unter384/Semi16,500Werte+Reihenfolge identisch;
geschlossener OriginalContentWorker349401088B, alle500Inhalte/vollständiges
Original-C/Bootstrap/Seal PASS. Alle eigenen Gruppen leer/OOM0. Keine dieser
Proben ist ein500-Profil-/1500-Ergebnis-/Unit60-/500MB-Vollnachweis.
PSS1189mal mangelsProzesszugriff nicht lesbar; keine PSS-Summe erfunden.
26Budget-/19Start-/20Nodegruppen plus27Messguards PASS; erste179/179
Standardregression in694s, finaleStandardregression nachNodeeinbindung
179/179 in708s bestanden, Prozessende0.

Implementierung604aa5eddbea1bf90a58501dfcde8e2aa34e61f9 ist gepusht;
[Entwurfs-PR924](https://github.com/ernisch/helmut-pilot/pull/924) richtet sich
gegen die gesicherte Basis2dba4317. GitHub-CI ist **nicht grün**: Run39418567135
zeigte einen unvollständigen festen Source-Importpfad, danach fehlen private
Originalvorlagen/Finanzbelege auf dem Runner. Alle Assertions bleiben erhalten;
lokale Originalprüfungen werden nicht als GitHub-Beleg ausgegeben. Browser-/
Mobile-Smoke desselben Runs bestand. Die automatische Vercel-Preview scheitert
vorBuild an includeFiles3063Zeichen>256; vercel.json hat denselben Blob wie
Basis2dba. Keine Vercel-Konfigurationsänderung oder manuelles Deployment.
Der CI-Importabschluss ist nun mit sieben byteidentischen Quelldateien
vervollständigt. Neuer separater Budgetschritt nutzt exaktNode24.19.0 und
stellt für bisherige PrüfungenNode22 wieder her. Isoliert26Budgetfälle/
20Nodegruppen,7Importnegative,9Überschreibnegative/3Positive PASS. Ohne
private Originale: Start18/19, Autorität15/25; Fehler bleiben sichtbar,
0Skips/0Ersatzoriginale. Das ist keine bestandene öffentliche Gesamt-CI.

**Offen:** später Authzustand/längere Stabilität, neue vollständige Zeit-/
Ergebnis-/500MB-Abnahme, frische Gesamtquellen-/Fenster-/Fallbindung,
unabhängige Gesamtannahme und neues konkretesGO. Plattenadmission braucht
15179779720B, zuletzt8621735936B verfügbar:6558043784B fehlen. Unverändert
8GiB Hostboden, alle alten Originale/Container/Volumes/Loops erhalten. Nur neu
erzeugte temporäre Diagnose-PGDATA wurde nach zwei Archivvergleichen
komprimiert erhalten; keine alte Löschfreigabe wiederverwendet.

[Architekturentscheidung, echte Messungen und Grenzen](betrieb/local-memory-architecture-20261020.md).
[Finale Quellenpins und Primärbeleg-Prüfsummen](betrieb/local-memory-qualification-20261020.SAFE.json).
Private Belege: /workspace/helmut-ram-fix-20261020/architecture-correction-20261020.
Kein weiterer Volltest/Production/Merge/Deployment; dieser Auftrag gewährt
nur lokale Änderungen, gezielte Prüfungen und einen prüfbaren eigenen PR.

HistorischerV10-Fall3cd34019b9d7 ist ebenfalls verbraucht und fehlgeschlagen
(499ACKs,2262437888B). [V10 und Senderkorrektur](betrieb/local-resource-v10-and-sender-fix-20261020.md).

## V9-Vollressourcenlauf19.10.:499ACKs, RAM- und letzter Grenzfall fehlgeschlagen

Der neue Motor wurde tatsächlich getestet: Kontrollleser `96bec54e` und Vollpfadbindung `85f40830`/`c8624f7c`, Laufcode `80273b866594081a68777eeb318abf291b397beb`, explizit `verified-control-view-v1` mit Merkle/History. Default bleibt AUS; neun akzeptierte Core-/SQL-Pins unverändert. Zielcommit `c8624f7c` und alle Zieländerungen erhalten. Kein W49/W50-Replay und keine Änderungen während des Versuchs.

Genau ein neu freigegebener lokaler Mock-Versuch `68f480265d50`: nach zwei zusätzlichen ausdrücklich genehmigten echten ProHigh-Leseannahmen und32/32 frischen Startgruppen gestartet20:49:15UTC, beendet23:47:24UTC.499HTTP200 und499 native FinalACKs (Indices0..498), jeweils16 frische Kontrollen=7.984. Letzter Index499:HTTP409 nach64,562297s, kein FinalACK; natives Scope-Ende62,965026s nach Beginn bei60s-Frist. Innerer Fehlergrund wegen generischem Adapterfehler weiterhinUNKNOWN. Kein vollständiger500-/1500-/8000-/Unit60-Nachweis; keine Positions-Endprüfung erreicht.

Gemeinsamer Kernelpeak einschließlich Anwendung/DB/Infrastruktur/Cache bis letztem Exit **2.300.071.936B**, harte Grenze2.048.000.000B um252.071.936B überschritten.500MB-Puffer ebenfallsFAIL; `reserveBytes=null`, Zielpeak1.548.000.000B um752.071.936B verfehlt. Alle Gruppen leer/OOM0, DB sauber beendet, Originalvergleich8Pins/KO6/RAW7/Links7 identisch/0Quellschreibzugriffe. Offline7,859940s, maximale Vorbereitung2,402350s, erfolgreiche Unitmax52,883333s, Authmax1,431865s. Runner2h58m5,885s, gemeinsameCPU11.791,944866s. Die vorherigen88Pythonfälle/zweiJS-Suiten bleiben übernommen, keine erneute Gesamtsuite.

V9-GO/Claim/Reservierung **verbraucht**, alle17 vorherigen Marker und sämtliche Eigencontainer/Volumes/Belege/Originale erhalten. Kein neuer Volltest/Retry, keine Productionaktion.192Hostsamples mindestens15.100.243.968B frei über8GiB; keine lückenlose Hostreservegarantie. Storage8GB und WAL469.762.048B sind Obergrenzen, keine tatsächlichen Plattenpeaks.0Production-/0bezahlte HELMUT-Provideraufrufe,1.000Mockphasen; separate Reviewgebühren nicht als0 erklärt. Betreiberkosten unverändert. Alte Cloud weiterhin nicht direkt angebunden, echte restaurierte Originale genutzt. [Ergebnis, RAM-Kurve, Grenzen und genauer Haltepunkt](betrieb/local-control-resource-outcome-20261019.md). Die [frühere Vorbereitung](betrieb/local-full-resource-test-preparation-20261019.md) beschreibt den Stand vor dieser tatsächlich verbrauchten Freigabe.

## Wiederaufnahme19.10.: Originale restauriert, neue Glue-Anbindung gezielt geprüft

Die ausdrücklich freigegebene verschlüsselte serverseitige Übernahme ist in der neuen Cloud durchgeführt. Anleitung SHA256 `23270eadb85f0199ded3421f0efa816b39d2257c49e91f62e0825d9ed4b8d669`, sieben Cipherteile, Gesamtcipher, Klartextarchiv, inneres Manifest und sämtliche443 Dateiziele geprüft; nach Wiederherstellung443/443 identisch,0 fehlend,0 Überschreibungen. Alle8 katalogisierten Originalbindungen und10 input19-Capturepins stimmen. Originaldateien wurden aus dem geprüften Transfer restauriert; keine Ersatzoriginale erzeugt. Die ursprüngliche Cloud und ihre laufenden Prozesse sind weiterhin nicht direkt angebunden.

Commit `c8624f7c875a4f6f849d83951898c5e205833a6e` bleibt erhalten. Ursprüngliches Zielworktree `/workspace/helmut-control-integration-20261019` unverändert; eigenes Codeworktree `/workspace/helmut-cpu-epoch-20261015`, Branch `codex/control-integration-restored-20261019`. W50-Proposal umgesetzt: exakter Kontrollmodus nur mit Merkle/History, unveränderte neun akzeptierte Core-/SQL-Hashes, Default AUS, neue Quellen im gemeinsamen Laufzeitmanifest. **19/19 gezielte Integrationstests samt26 echten Vorlagen/Replay sowie13/13 Dateibindungstests PASS.** Echte RO-Containersicht auf Descriptor+19 Quellenpins (20 Dateien/948611Bytes) PASS. Unabhängige Codex-Quellenprüfung ohne konkreten Schutzblocker; keine modellübergreifende kritische Endabnahme behauptet.

Isolierter PostgreSQL17.6 im exakten Image wiederhergestellt; input19-Dump, Rollen und native Auth-/Zählertexte exakt gleich dem gebundenen Witness. Eigene Zielkopie und Gateway mit neuen lokalen Geheimnissen0600, Netzwerk `none`, keine veröffentlichten Ports. Tatsächliche neue Bootstrap-Anbindung PASS:5000 Historyzeilen und vollständiger logischer Authzustand erhalten,458 Merkle-Knoten, beide nativen Kataloge geprüft. Descriptor→Umgebung→Gateway→vollständiger Leser/Kontrollsicht mit dreiHTTP200-Read-RPCs PASS; Kontrollsicht entspricht vollständigem Leser, Schreibversuche vor RPC abgewiesen, anonymer Zugriff gesperrt. Profile, Zähler und übrige Storezeilen nach Prüfung bytegleich zur restaurierten Quelle. **Bereits im Originaldump500 aktive Flags**; unverändert übernommen, keine Aktivierungsoperation. Die frühere Bezeichnung einer „inaktiven Kopie“ im Bootstrapbeleg ist ausdrücklich korrigiert, Beleg und einmaliger Lauf bleiben erhalten.

Docker/cgroup/Loop-Aufbau im kleinen Voraussetzungspfad bestätigt; erste128MiB-Zuordnung korrekt beendet und erhalten. Der erste Storage-Verifier erreichte wegen falschem Containerbenutzer seine Prüfung nicht; kein PASS daraus abgeleitet. Genau ein korrigierter kleiner Nachweis mit UID1000 PASS: tatsächlicher readonly ext4-Mount, neue eigene128MiB-Zuordnung auf Loop1, unveränderte Identität beim Abschluss, Gruppen leer. Alter Fehlerbeleg und beide Zuordnungen bleiben erhalten. Keine neue allgemeine Analyse, W49/W50-Prüfungen nicht wiederholt. Noch offen: vollständiger Laufvertrag samt Zeit/RAM/500MB-Puffer, frische Lauf-/Tages-/Fensterbindung,32 Startbedingungen und kritische Endabnahme. V8 und frühere Freigaben bleiben verbraucht; Migration ist kein neues500er-GO. Betreiberkosten unverändert übernommen. [Belege und genauer Haltepunkt](betrieb/local-control-fullpath-integration-20261019.md).

## Production-Stand und verbindliche Grenzen

**Letzter echter Production-Befund16.10.2026,13:07:32UTC:** Es fehlen drei Funktionen/zwei Trigger; tatsächliches Deployment weiterhin `b428fefa`. Zielnodepatch, ausgelieferte Worker-/Bundlebytes und Schlüsselverteilung offen. Strikter Gesamtspeicher und vollständige numerische Infrastrukturdeckung sind nicht nachträglich aus Altbelegen schließbar.82528 tatsächliche nativeHTTP-Aufrufe der drei Hauptphasen sind ausgezählt, vollständige Wirebytes/physischerDB-Peak fehlen. Der vorhandene270-Minuten-Endwächterjob allein deckt kein9h-Fenster ab; tatsächliches Startfenster muss dazu passend gebunden sein. Production bleibt gesperrt; kein Merge/Deployment/Aktivierung/Productiontest. Keine aktuelle Production-Verifikation in dieser Datei.

Aktueller500er-Nachweis wäre: exakt500 gleichzeitig aktive Profile,500 Mandatsbriefings/500 Morgenbriefings/500 Lage-Ergebnisse=1500 Positionen,8000 frische Sicherheitskontrollen,16 frische Kontrollen je Profil,60s-Unitfrist,Auth30s,Offline90s. Fehlende/leere/doppelte/unbrauchbare/technisch fehlerhafte Positionen getrennt ausweisen. Speicherharte Grenze2.048.000.000B;500.000.000B-Reserve verlangt gemeinsamen Peak≤1.548.000.000B. Storage8GB und WAL469.762.048B bleiben Obergrenzen. Vollständiger500-/1500-/8000-/Unit60-/Auth30-/Gesamtspeicher-/500MB-Nachweis offen.

Kosten/Production-Limits: gültiger EU-Vertrag exakt82,036000USD/UTC-Tag;88,845364USD kumulativ desselben Auftrags;0,081400USD Reserve nur für künftige EU-Tickets;81,400000USD absolutes Sicherheitsmaximum für genau500 D+500 R/U0. Modell `gpt-5-mini-eu`, DataZoneStandard, Sweden Central,9h aktiv+30min Endbeleg. Die früheren6-/7-USD-Grenzen sind **nicht** der aktuelle EU-Vertrag. Betreiberkosten unverändert; unbekannte Reviewgebühren nicht als0. Geschützte Production-Aktionen brauchen ausdrückliches GO: Migrationen, Production-Daten-/Profil-/Konfigurations-/Budgetänderungen, Provisionierung, Aktivierung/Deaktivierung/Löschung, Cron, Umgebungsvariablen, Azure, kostenpflichtige Modellaufrufe außerhalb des Rahmens, externe Nachrichten, kostenpflichtige Ressourcen. Provisionierung≠Aktivierung≠Testfreigabe≠nächste Teststufe.

Sicherheitsgrenzen: AfD-zugehörige Abgeordnete sind ausgeschlossen, Prüfung von Partei und Fraktion, keine AfD-Kunden-/Testzielprofile; alle anderen Parteien und Fraktionslose bleiben zulässig. Mandantentrennung App-seitig über `assertTenant`/`assertTenantRows` plus `user_id=eq.<tenant>`; Quellenwahrheit relational; Budget-Gate fail-closed; Feature-Flags Default AUS; jede Migration mit Rollback-SQL; `main` bleibt einzige Architekturwahrheit. Unabhängige Endprüfung darf nicht durch den ausführenden Hauptlauf ersetzt werden; bis zur Annahme lautet der Status „Production Lauf durchgeführt, unabhängige Endabnahme offen“.

## Blocker-Kurzstand

- **Blocker3 geschlossen, PR901 gemergt:** EU-Servicekostenvertrag wie oben; frühere EU-GO/Teilschritte historisch, nicht aktueller Vertragsstand. [Vertrag/Prüfung](betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).
- **Blocker2 geschlossen11.10.:** [Run38102593796](https://github.com/ernisch/helmut-pilot/actions/runs/38102593796), Workflow/Runtime `6cdaa1cd3cdf16b9e5d18cb9add267583a730292`:500/500 fachlich angenommen,180397 Claimpositionen/4000 Kriterienurteile positiv,42 Pflichtbindungen; frische unabhängige Endprüfung/Root-Abnahme positiv; verschlüsselte Serverbank2026-10-11T04:18:30.484466+00:00 rückgelesen. KZW-Original erhalten/gesperrt, alte Relation UNKNOWN archiviert, NWZ-Alternative gebunden. Kein Aktivierungs-/bezahlter500er-Funktionstest. [Belege](betrieb/blocker2-abschluss-20261011.md).
- **Blocker4 geschlossen07.10.,11:19:02UTC:** persistenter30s-Cron lebt; Auth/Frist/Notstopp produktiv0→0, Rückführung500/499→0 nur isoliert belegt; Profil-/Auth-/Hauptdaten unverändert; ProHigh akzeptiert. Testfenster ungebunden. [Dossier](betrieb/blocker4-endsteuerung-20261007.md).
- **Blocker1 geschlossen/technisch abgenommen07.10.:** PR846 gemergt/ausgerollt; GET auf READY `53e1e369` HTTP405/`Allow: POST` vor DB-/Motorzugriff; direkter Motorweg für500 synthetische Profile technisch abgenommen, kein500er-Test/Aktivierung/Modellaufrufe. Für einen Lauf bleiben frische Laufbindung und Test-GO nötig. [Abnahme](betrieb/blocker1-direkter-500er-motor-20261007.md).
- **B2→D-Integration11.10.:** PR899/Runtime `1ad00cd4` auf READY `dpl_76HSdbWhPMaDRJzQqQ1GsrGx3wcE`; CI168+330 Suiten grün; lokal500/500 nichtleere Kontexte (468 normal/32 historisch); keine neue B2-Fachabnahme/Installation/Aktivierung/Productionänderung; Senderabnahme an Command-/Installations-/Aktivierungsgrenze offen. [Vertrag](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md).
- **Unaufgelöst:** lokaler Voll500-Nachweis, RAM/500MB/Unit60/Auth30/Storage, nach nächster Änderung frische Voll-Eingangsprüfung/32 Startgruppen, zusätzliche Plattenkapazität unter Belegerhalt, Production-Schutzobjekte/Node/Bundle/Schlüssel, vollständige Kosten-/Speicher-/Fenster-/Finanzbelege, separates finales500er-GO.

## Abgeschlossene lokale Untersuchungen

Historische abgeschlossene Befunde bleiben [wortgleich archiviert](archive/project_state/2026_10_21_abgeschlossene_lokale_untersuchungen_vor_lease.md); keine erneute Abnahme oder Wiederholung daraus ableiten.

## Starttor und Schutzgrenzen

Lokale notwendige RAM-/Integrationsänderungen und gezielte Komponentenprüfungen bleiben erlaubt. **Genau der freigegebene nächste vollständige Mock500-VersuchV10 ist verbraucht und als FAIL beendet.** Claim/Setup bleiben erhalten; kein neuer Slot, kein Löschen/Reset verbrauchter Marken und kein automatischer Retry aus alten Betreiberzitaten. Auch V11 und V12 sind verbraucht und fehlgeschlagen; ein neuer Versuch braucht ein neues konkretes GO samt Fall-/Tages-/Code-/Original-/Zeit-/Loop-/Plattenbindung, unabhängiger Annahme und32frischen Startgruppen. Keine Ersatzoriginale.

Production, Merge, Deployment, Production-Migrationen und bezahlte HELMUT-Provideraufrufe sind daraus nicht freigegeben. Für regulären Betrieb bleiben ein gesondertes konkretes Aktivierungs-/Productiontest-GO, aktuelle Paketbindung, Ebenen-/Landesversorgung bis zur sichtbaren Ausgabe, Kosten-/Zeitplan, lebender Endwächter und Rückweg erforderlich. Nur synthetische500Profile für Bundestag/Berlin/Brandenburg, keine AfD-Kunden; originale fachliche/security Prüfungen für alle500,1500Ergebnispositionen und8000frische Kontrollen. Fehlend/leer/doppelt/unbrauchbar/technischfehlerhaft getrennt bilanzieren. Bei unbekanntem Schreibausgang Stop und lesende Klärung, kein Retry. Originale und bisherige Belege erhalten.

Betreiberkosten unverändert: EU-Vertrag82,036000USD/UTC-Tag,88,845364USD kumulativ,0,081400USD Reserve und81,400000USD Sicherheitsmaximum für500D+500R/U0; historische6/7USD sind kein EU-Vertrag. Tatsächliche Codex-/Router-Entwicklungsaufrufe sind davon getrennt, unbekannte Gebühren nicht0. [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md), [Synthetikauftrag](betrieb/synthetischer-500er-auftrag-20261001.md).

## Arbeitssteuerung

Codex Cloud ist der Arbeitsweg. Modell und Denkstufe wählt der Betreiber; kein heimlicher Wechsel. Der Repository-Router delegiert klar abgegrenzte Arbeit an DeepSeek nach AGENTS.md; Root behält Architektur, Integration und finale Abnahme. Vor/nach tatsächlichem Helferstart Rollen und Umfang sichtbar zählen; keine automatischen Modellwiederholungen oder Eskalationen. Parallele Schreibarbeit nur in getrennten Bereichen. Keine zeitabhängige Peak-Arbeitssperre. Production-Schutz und Kostenverträge bleiben unverändert.

## Nächster notwendiger Schritt

180erOffline-Schlussprüfung nachfinalerSperreinbindung abnehmen; danach kleinsten
gebundenenGateway/PostgREST-Authmutationszyklus amspätenKlon qualifizieren,
Read/Decode/Callback/CAS undMesswrapper ohneDoppelzählung trennen. Keine weitere
Finanzprüfung oderallgemeineOptimierungsrunde. Voll500erstmitPlatte,32frischen
Startgruppen,Fall-/Zeitbindung undneuemkonkretemGO. AllealtenGOsverbraucht.
Hierfortsetzen,Sehrhoch wegenCAS/ACK/Originalschutz;kostentragendeProductionbleibtgesperrt.
