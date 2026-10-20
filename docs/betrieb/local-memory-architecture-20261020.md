# HELMUT: Speicherentscheidung20.10.2026

Status: native Gesamtgrenze und explizites Node-/Worker-Heapbudget lokal integriert; Voll500-Qualifikation offen.
Kein neuer Voll500, keine Production-Freigabe. Basis2dba431716b5d1693b7039db9233b97f9db5db75,
eigener Branch codex/native-working-set-budget-20261020; c8624f7c bleibt Vorfahr.

## Belegter Fehler und Grenzen der Ursachenbestimmung

V11 testete5fae25be, nicht2dba4317. Sein vollständiger gemeinsamer Kernelpeak
2151936000B verfehlte das1548000000B-Ziel um603936000B.499ACK/1497Positionen
sind ein Fehlbefund. Die spätere letzte Unit-Fristverletzung erklärt den bereits
zuvor entstandenen Peak nicht.

Die tatsächliche alte gemeinsame Gruppe hatte memory.max=max, memory.high=max,
memory.swap.max=max. Das2,048GB-Limit wurde nachträglich geprüft, ohne das
Arbeitsset während der Ausführung zu begrenzen. Diese Lücke ist physisch belegt.
Sie erklärt möglichen ungebremsten Cache-/Heap-Hochwasserstand, beweist aber
allein weder einen Leak noch, dass das unverzichtbare anonyme Arbeitsset ins Ziel passt.

207 Original-Kernelsamples: größte beobachtete gleichzeitige Belegung2079178752B,
davon anon1303851008B, file731328512B und kernel42127360B. shmem146919424B
ist bereits in file enthalten. Die Kategorien sind zeitgleiche native Messungen;
Rundungs-/Erhebungsabweichungen werden nicht glattgerechnet. Der höhere echte
Peak2151936000B liegt zwischen den letzten Samples; seine Zusammensetzung ist
unbekannt. Keine RSS-/PSS-Summe ersetzt ihn.

Median current stieg über abgeschlossene HTTP-Indices0–99/100–199/200–299/
300–399/400–498 von1185,74 über1398,10/1566,84/1754,37 auf1950,59MB.
Kein belegtes Plateau. Node-RSS298979328→631595008B, RssAnon260112384→591011840B.
Zwei letzte PG-Backends hatten jeweils rund190–198MB RssAnon; ihre gemeinsamen
131MB-Seiten dürfen nicht doppelt addiert werden. PostgREST-Pool tatsächlich2,
keine angenommene Standard-Poolgröße10. Stabile Prozessanzahl belegt keinen
Worker-Leak. JS-Heap-/GC-/PSS-/PG-Kontexte fehlen im V11-Original.

Nach letztem Exit verblieben überwiegend403718144B Dateicache. Das ist keine
zulässige Peak-Abzugsposition. Die größte Diagnoseserialisierung509829B erklärt
keine600MB-Lücke. Aussagen über zurückgehaltene Closures oder genaue V8-Leaks
wären unbewiesen. Eine379s-Lücke im späten Hostsampling bleibt ausdrücklich offen.

## Technischer Abgleich

| Dokumentierte Eigenschaft | Tatsächliche Bedeutung hier |
|---|---|
| Linux cgroup v2: current/peak umfassen Nachfahren; file enthält shmem; high drosselt/reclaimt, max kann OOM auslösen und kurz überschritten werden | Eine gemeinsame native Grenze kontrolliert anon + file (einschließlich shmem) + kernel. Alle Helfer müssen zur selben Lebenszeit gehören; unveränderter echter Peak entscheidet weiterhin. |
| PostgreSQL17: shared_buffers und Betriebssystemcache existieren nebeneinander; work_mem gilt je Operation, nicht als Gesamtdeckel | Mehrere Backends können gemeinsam viel mehr als work_mem halten. Pool2 begrenzt Verbindungen, keine einzelnen Query-/JSONB-Kontexte. V11-Laufwerte für shared_buffers/work_mem fehlen. |
| PostgreSQL TOAST: große Werte werden komprimiert/ausgelagert, Verarbeitung kann Entpacken verlangen | Kleine geänderte Felder verhindern bei Vollzustandsoperationen keine großen temporären Werte. Komprimierte Plattengröße ist kein RAMmaß. |
| MVCC und WAL erhalten Versionen/Änderungsnachweise | Wiederholte JSONB-Schreibvorgänge erzeugen Arbeit/Cache/alte Versionen; kumulative WALbytes sind kein simultaner RAMpeak. |
| Node: heapUsed/heapTotal/external/arrayBuffers sind verschiedene Sichten; RSS ist pro Prozess, ArrayBuffers Teil von external; glibc-Fragmentierung kann RSS hoch halten | Keine Addition von Heap+RSS+externals; ohne Heap-/PSS-/GC-Daten kein bewiesener Leak. Natürliche GC beobachten, keinen erzwungenen GC als Einsparung verkaufen. |
| PostgREST verwendet einen persistenten DB-Pool | Query-Kontexte werden normalerweise zurückgesetzt; persistente Backend-RSS kann zusätzlich aus Allocator-/Cache-Hochwasser entstehen. Nachgelagerte Kontextabfragen messen weder vorige RPC-Spitzen noch automatisch beide Poolverbindungen. |
| Vercel Fluid kann mehrere Anfragen im selben Prozess bedienen; Supabase stellt gesonderte Compute-/DB-Ressourcen bereit | Getrennte Anbieterbudgets sind kein gemeinsames lokales2,048GB-Budget. Aus Anbieter-RAMlimits folgt keine lokale Erfüllung; keine Lockerung unseres Vertrags. |

Offizielle Quellen (am20.10. mit HTTP200 und SHA erhalten):
https://docs.kernel.org/admin-guide/cgroup-v2.html
https://www.postgresql.org/docs/17/runtime-config-resource.html
https://www.postgresql.org/docs/17/storage-toast.html
https://www.postgresql.org/docs/17/mvcc-intro.html
https://www.postgresql.org/docs/17/wal-configuration.html
https://raw.githubusercontent.com/nodejs/node/v24.19.0/doc/api/process.md
https://raw.githubusercontent.com/nodejs/node/v24.19.0/doc/api/worker_threads.md
https://raw.githubusercontent.com/nodejs/node/v24.19.0/doc/api/diagnostics_channel.md
https://docs.postgrest.org/en/v13/references/configuration.html
https://vercel.com/docs/functions/fluid-compute
https://supabase.com/docs/guides/platform/compute-and-disk

PostgREST-Dokumentation13 ist ein Eigenschaftsvergleich; daraus wird keine
unbelegte Version des tatsächlich gepinnten lokalen Binaries abgeleitet.

## Entscheidung

Jetzt die belegte Kontrolllücke schließen: EIN natives gemeinsames Arbeitsbudget
vor dem ersten Speicher-/Datenbank-/Anwendungsstart. Bestehende Daten- und
Sicherheitsprotokolle bleiben erhalten. Keine zusätzlichen Dienste, Tabellen
oder Production-Konfigurationen für diese Korrektur.

memory.max wird auf den nächsten ganzen Systemseitenwert UNTER1548000000B
gesetzt (hier1547997184B), memory.high auf1399996416B, swap.max auf0. Diese
strengere Ausführungsgrenze erhöht weder die harte2,048GB-Abnahmegrenze noch
das1,548GB-Ziel. Reclaim-/GC-/OOM-/Zeitrisiken bleiben messpflichtig.

Zwei kleine vorab gebaute lokale Helfer erzeugen den noch nicht vorhandenen
exakten Fall-Elternpfad. Nur dessen RW-Bind wird mit Inode und echtem cgroup2-
Dateisystem geprüft; keine Rootgruppen, Altgruppen, Remounts, Reclaimbefehle,
Peakresets, Loops oder zusätzlichen Capabilities. Danach sind beide Helfer
beendet; ihre Kernelkosten bleiben im selben nicht zurückgesetzten Peak/CPUzähler.

Controller→32Startgruppen→exklusive Reservierung→Budget→Storage→initdb/DB→
Installation/Vorbereitung→Assembly→Anwendung→alle Exits→native Endablesung.
Identische Policy/Runtime-Pins in Connection, Recipe und unabhängiger Acceptance;
C-/Pythonquellen im akzeptierten Quellensatz. Restricted App liest die gepinnten
Metadaten; Daemon-/Imageprüfung auf dem Host. Fehlende/abweichende Bindung blockiert.
Die neue Gesamtannahme verlangt zusätzlich den vollständigen500MB-Puffer;
OOM und unvollständige Enden können keinen Puffer-PASS ergeben.

Behalten: atomare relationale Usage-Zeilen, frische Kontrollansicht, bounded native
Reader, begrenzter Original-Eingabenleser und direkte Speicher-I/O aus2dba4317.
V11 hat diesen gesamten Endstand noch nicht getestet. Immutables Reuse ist kein
Berechtigungscache: Revision/Nonce/State/Hash/Sicherheits-/Kostenprüfungen bleiben frisch.

Nicht erneut aktivieren: frühere W43–W50-Projektions-/Graph-/Single-capture-
Kandidaten ohne nachgewiesene gemeinsame Verbesserung. Keine weitere Cacheebene,
kein Prozess-Neustart pro Profil, kein Swap/RAMdisk/GC-Zwang oder ausgesparte
Messphase. Alle500 Profile aktiv zu halten erlaubt kontrollierte schwere Arbeit;
die vorhandene sequenzielle Ausführung und16Kontrollen werden nicht reduziert.

Ein Vollzustands-Umbau wird hier nicht als erledigt behauptet. U.write erzeugt
weiterhin eine JSON-Snapshotkopie und Parts.build; vollständige Mutation-/Receipt-
Leser benötigen weiterhin das vollständige logische Objekt. Der Kontrollpfad
spart diese Materialisierung nur bei seinen ausdrücklich passenden Lesern.
Die begrenzten privaten Caches halten jeweils einen Graph/eine History/eine
Kontrollsicht. Serialisierte Bytegrenzen begrenzen nicht den gesamten JS-Objekt-,
Map- und temporären Kopieraufwand; kein Beweis gegen Leak oder Hochwasser.

Bereits vorhandene DB-Deltas bleiben anerkannt: U.write überträgt nur neue
Merkle-Knoten, auth_state_parts_local.sql aktualisiert im Store Revision und
Referenzen. Ein größerer Writerumbau müsste speziell Client-Vollsnapshot und
Traversierung beseitigen; relationale DB-Updates müssten nicht neu erfunden werden.

Falls das notwendige anonyme Arbeitsset trotz dieser Grenze nicht passt oder
Reclaim Unit60 verletzt, ist der kleinste zusammenhängende größere Umbau eine
transaktionale API für die tatsächlich veränderten Journal-/Admission-/
Kosten-/Telemetry-Felder mit denselben Revisionen, Konflikten, Bestätigungen und
Wiederherstellungsnachweisen. Das ist ein Writer-/Protokollumbau, kein einzelner
unbewiesener Cache-Schalter. Seine Notwendigkeit ist mit V11 allein nicht eindeutig
bewiesen; deshalb nicht spekulativ alle Authschreiber jetzt umstellen.

## Explizites Nodebudget statt vermuteter automatischer Erkennung

Die neue Authkomponente meldete trotz nativer Elternkappe1,548GB ein
V8-Heaplimit4496293888B und constrainedMemory naheUINT64_MAX. Das ist ein
gemessener Komponentenbefund. Die alte V11-Hauptvorlage gab ausdrücklich
--max-old-space-size=1536 vor; deren tatsächlicher damaliger Heapzustand
ist weiterhin nicht gemessen. Die Komponentenstandardgröße darf nicht
als identische V11-Konfiguration ausgegeben werden.

Policy/2 bindet jetzt zusätzlich --max-old-space-size=384 und
--max-semi-space-size=16 für den lokalen Lauf.384MiB ist ein vorläufiges
Ausführungsbudget, keine aus V11 bewiesene erforderliche Heapgröße. Die
zusätzliche Young-Generation-Option ist nötig: old384 allein ergab hier
576MiB Parent- und480MiB Worker-Heaplimit. Beide Optionen zusammen ergaben
tatsächlich452984832B=432MiB. Das ist KEIN gesamter Node-RSS-Grenzwert;
Buffers/native Speicher/Code und alle Prozesse bleiben im gemeinsamen
Kernelpeak enthalten. Es wird kein GC erzwungen, kein Swap genutzt.

Alle bekannten Bare-Node-Kinder laufen über den gebundenen Shim; der absolute
SQL-Messhelfer erhält dieselben CLI-Optionen. Die exakte lokale Vorlage
ersetzt1536 durch384+Semi16;26Vorlagen samt deterministischem Replay
bleiben erforderlich. NODE_OPTIONS bleibt leer.

Private Contentworker erhalten weiterhin leeres env/execArgv und unveränderte
Corequellen. Die prozessweiten V8-CLI-Optionen überschreiben deren Ressourcen-
Vorgaben nach dokumentierter Node24-Semantik. Ein Parent-Beobachter nutzt
den öffentlichen worker_threads-Diagnosekanal und genau einmal bei online
Worker.getHeapStatistics(). Er erfasst Discovery, echte Live-Heapmessung und
Exit anhand der vorher gebundenen Thread-ID; keine Messung nach Exit wird
behauptet. Kein zusätzlicher error-Listener, Retry, ref/unref oder terminate.
Fehlende/abgelehnte/verspätete Messung, unbekannte Quittung oder Zählerdifferenz
blockieren die Abnahme. Reguläres worker.terminate kann Exit1 erzeugen; das
ist allein kein OOM. Die native OOM-/Workflowprüfung bleibt zusätzlich Pflicht.

Linux ordnet gemeinsam verwendete Seiten der instanziierenden cgroup zu.
Darum ist der native Charge-Wert weder eine PSS-Summe noch ein Anlass für
Cacheabzüge oder Cachelöschung. Feste vorhandene Originalinputs/Images können
bereits andernorts gecacht sein; die vorhandene Messmethode wird nicht
verändert und eine künstlich kalte Probe wird nicht behauptet.

## Tatsächlich geprüfte Teilpfade

| Probe | Tatsächlicher gemeinsamer Peak | Ergebnis und Grenze |
|---|---:|---|
| Native Einrichtung |5681152B| Helfer/Settings/letzterExit; keine Motorlast. Erstversuch wegen umask-Stoppsignal gescheitert, korrigierter frischer Fall bestanden. |
| Kleine echte Dateilast ohne/mit48MiB-Komponentenkappe |54423552B /34574336B|256MiB Byteprüfungen identisch, OOM0;0,748/1,155s. Reclaimwirkung, keine Voll500-Prognose. |
| Auth/PG/PostgREST, authentischer initialer5000-History-Seed |468185088B|16Runden,256Kontrollreads,9bestätigteCAS inklusive Restore; originaler logischer Zustand wiederhergestellt, OOM0. Noch OHNE neues Node-Heapbudget. |
| Tatsächlicher gebundener Eingabenleser unter384/Semi16 |83079168B|Alle500Originalwerte/Reihenfolge per unabhängigemDigest identisch,5,90s Laden+Hashen, V8limit432MiB, alleExits/OOM0. KeineProfilverarbeitung. |
| Tatsächlicher geschlossener ContentWorker unter384/Semi16 |349401088B|Alle500Originalinhalte durch ursprüngliche Ordinary-v1-C-Prüfung, Bootstrap/Seal/Abschlussgraph PASS;8,49s Validierung, Parent+Worker tatsächlich432MiB, Exit0/OOM0. Kein Profilbetrieb. |

Authprobe: PG17.6/Pool2, aber1MiB-WAL-Segmente, max_wal_size16MB,
min_wal_size2MB und wal_buffers128Blocks unterscheiden sich vom Vollversuch.
Das beeinflusst auch Cache-/Checkpointverhalten. high/max/oom blieben0;
diese Probe belegt keine Reclaim- oder Heapdeckelwirkung. Sie verwendet
ursprünglichen Seed, nicht späten V11-Auth.

Die Primärbelege binden jeweils den tatsächlich geprüften Quellenstand.
Die frühen Setup-/Authproben entstanden vor der zusätzlichen Nodepolicy;
spätere Cleanupkorrekturen sind durch die gezielten Fehlerfälle geprüft.
Kein einzelner Komponentenbeleg gilt deshalb als Ausführung des gesamten
finalen Controllers. Das Qualifikationsmanifest trennt finale Quellenpins
von den unverändert erhaltenen Pins der jeweiligen Messung.

In Runden8–15 ohne weitere Nutz-CAS (jeweils voller Authread+16Kontrollreads)
blieb HeapTotal166506496B; HeapUsed fiel von55007864 auf34495328B, während
RSS274579456→278401024B schwankte. Ein beobachteter PG-Backend-PID blieb
bei12564448B reservierten Kontexten, belegter Speicher etwa8468624B. Acht
Runden über7,398s sind kein Langzeitplateau. Alle1189 PSS-Versuche wurden
mit PERMISSION_DENIED abgewiesen; es gibt keine gemessene PSS-Aufteilung.
Die höchste gespeicherte gleichzeitige Currentbelegung452317184B zerfiel
in anon365371392B/file69386240B/kernel16207872B, shmem23482368B bereits
infile. Diese nacheinander gelesenen Zähler sind keine atomare Summe;
die Zusammensetzung des höheren echten Peaks ist unbekannt.

Der erste Authcluster scheiterte vor Last an fehlendem PostgREST-Mount.
Nur dessen neu erzeugte temporäre PGDATA wurde nach zwei vollständigen
Archiv-/Bytevergleichen platzsparend komprimiert erhalten. Keine alten
Container/Volumes/Loops/Originale wurden gelöscht. Die korrigierte Probe
startete in neuem Cluster und neuer Gruppe. Hostreserve in allen gemessenen
Teilpfaden über8GiB; keine lückenlose Reservegarantie daraus.

Der Contenttest verwendete unveränderte UTF8-Bytes des originalen V11-FreshPackets
als ausdrücklich neue Diagnoseableitung, nicht einen behaupteten ursprünglichen
DB-Storetext. Ordinary-v1 prüft die vollständige Original-C-Funktion und den
unveränderten geschlossenen CPUgraph; er qualifiziert keinen historischen-v2-
Fastpath. Der echte Worker endete mit0; die ursprüngliche Planungserwartung1
wurde separat berichtigt, ohne Belegüberschreiben. Reguläres terminate→Exit1
ist ausschließlich durch den gezielten separaten Worker-Test belegt.

Gezielte Regression:26Python-Budgetfälle,19Start-/Cleanup-/Rendererfälle,
20Nodegruppen mit25kurzen echten Nodekindern sowie27Mess-/Abbruchfälle PASS.
Dazu gehörten ENOSPC-/Diagnose-I/O-Fehler, unbekannter Setterausgang ohneRetry,
CLI-Drift, fehlende/falsche Quittungen, externe Beobachtung des unveränderten
Workers und verifizierte reguläre Termination. Der erste Standardlauf bestand
179/179 in694s. Nach Ergänzung des Node-/Workerbudgets bestand auch die
abschließende Standardregression179/179 in708s, Prozessende0.
Die finale Offlineprüfung testet keinen vollständigen Ressourcenlauf.

Sechs Codex-Helfer arbeiteten parallel in getrennten Bereichen; Root integrierte
die Befunde. Unabhängige lesende Quellenprüfungen fanden und schlossen die
Worker-Inventurlücke sowie Cleanup-/OOM-Belegfehler. Ein externer ProHigh-
Integrationsreviewversuch lieferte ungültiges JSON und ist keine Annahme.
Die erfolgreiche frühere ProHigh-Designprüfung war ausdrücklich blockiert
bis zu Komponentenbelegen; sie ersetzt keine neue Gesamtfreigabe.
Die abschließende unabhängige lesende Deltaprüfung der korrigierten
Cleanup-/OOM-Pfade fand keinen konkreten verbleibenden Blocker in diesem
begrenzten Umfang; eine Gesamtannahme wird daraus nicht abgeleitet.

Private Primärbelege bleiben unter
`/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/`:
`v11-curve-evidence/`, `native-budget-implementation-qualification-v2/`,
`cache-pressure-component/`, `auth-native-component-v2/`,
`bounded-input-heap-probe/`, `closed-content-worker-heap-probe/`,
`ACTUAL_DEVELOPMENT_MODEL_USAGE_ARCHITECTURE.SAFE.json`. Keine privaten
Originalinhalte, Schlüssel oder Authdaten sind Bestandteil dieser Änderung.

[Qualifikationsmanifest mit finalen Quellenpins und Primärbeleg-Prüfsummen](local-memory-qualification-20261020.SAFE.json).

Die aktuelle konservative Plattenadmission benötigt15179779720B einschließlich
unverändert8GiB Hostboden,2GiB Raw-Gastdatei,6neuen VFS-Hüllen und512MiB
Ausgabebudget. Verfügbar waren8621735936B; Defizit6558043784B. Die sichere
Bereitstellung dieser Reserve ist unter dem bestehenden Original-/Altressourcen-
erhalt nicht gelöst. Es wird keine weitere Altbereinigung oder neue bezahlte
Infrastruktur aus diesem Auftrag abgeleitet.

## Auswirkungen und Freigabe

RAM: gemeinsame tatsächliche Belegung wirksam begrenzbar, Größe des erforderlichen
anonymen Arbeitssets noch zu qualifizieren. CPU/Laufzeit: Reclaim kann Mehrarbeit
und Fristfehler erzeugen; kein garantierter Gewinn. DB/WAL/Ergebnisse: Protokoll
unverändert, keine vorgetäuschte Datenreduktion. Sicherheit: fail closed bei Drift,
Fremdprozessen, alten Gruppen, unbekanntem Schreibausgang oder OOM; keine Wiederholung.
Production-Kosten unverändert, keine neue Infrastruktur. Betreibervertrag:
82,036000USD/UTC-Tag,88,845364USD kumulativ,0,081400USD Reserve,
81,400000USD Sicherheitsmaximum für500D+500R/U0. Tatsächliche externe
Entwicklungsreviews separat; unbekannte Gebühren bleiben unbekannt.

Noch keine Voll500-Empfehlung. Dazu fehlen repräsentatives stabiles Arbeitsset,
vollständige Zeit-/Qualitätsbelege, Plattenreserve, neue Fall-/Quellen-/Zeitbindung,
frische unabhängige Gesamtannahme,32frische Startgruppen und ein NEUES konkretes GO.
V11 und alle früheren Freigaben bleiben verbraucht. Keine Production/Merge/Deploy.
