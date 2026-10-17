**Lokale Auth-CAS-Korrektur vom 17.10.2026 — keine Production-Abnahme**

Der abgebrochene Ressourcenlauf `e5839baa59a9` erreichte gemeinsam
2.132.410.368 Byte bei erlaubten 2.048.000.000 Byte. Die Datenbank meldete
1.204.197.058 temporäre Byte in 238 Dateien. Das ist kumulativer Schreibverbrauch,
kein gleichzeitiger Speicherstand. Der Versuch und sein GO bleiben verbraucht.

Ein kleiner separater Vergleich mit echten, ausschließlich lesend übernommenen
Auth-Daten weist die dominante Ursache nach: PostgREST 12.2.3 verarbeitet den
großen PATCH-Wert in einem `json_to_record` Function Scan. Schon ein einzelner
JSONB-Wert überschreitet dort `work_mem=4MB` und wird materialisiert/ausgelagert.
Der tatsächliche EXPLAIN-Plan zeigt 538 temporäre Blöcke, jedoch keinen Sort.
Historische Einzeloperationen sind mangels damaliger SQL-Logs nicht vollständig
rückwirkend zuordenbar; die 238 Dateien werden deshalb nicht pauschal einem
einzigen Statement zugeschrieben.

Die kleine Korrektur übergibt denselben vollständigen Wert als einen unbenannten
JSONB-Parameter an eine skalare CAS-Funktion. Sie extrahiert das große Datenobjekt
einmal und schreibt es unter derselben atomaren Versionsbedingung. Der
Rückgabewert enthält ausschließlich die bestätigte Zeilenkennung. Es entstehen
keine neue Tabelle und kein zusätzlicher Cache. `work_mem` bleibt unverändert.

`supabase/proposals/auth_store_cas_scalar_jsonb.sql` ist ein inertes SQL-Proposal,
keine angewendete Production-Migration. Die lokale Wahl
`HELMUT_AUTH_STORE_CAS_TRANSPORT=scalar-jsonb-rpc` schaltet den Kandidaten zu.
Ohne diese Wahl bleibt `postgrest-patch` unverändert aktiv. Fehlende RPCs,
unbekannte Werte und unklare Schreibausgänge erlauben keinen Transport-Fallback.
Einfügen einer fehlenden Zeile bleibt der bestehende, eindeutig bestätigte Weg.

Verglichen wurden zwei neue isolierte PostgreSQL-17.6-Container mit demselben
Originalwert, PostgREST 12.2.3, Node 24.19.0, RLS, einem REST-Poolplatz,
24 CAS-Schreibvorgängen und einem weiteren EXPLAIN-ANALYZE-Schreibvorgang.
Die Kernelgruppe umfasst PostgreSQL, PostgREST, den Node-Client und deren Kinder
von der Initialisierung bis zum letzten Prozessende. Host-Vorbereitung und
Dockerdaemon sind in beiden kleinen Fällen außerhalb dieses Messumfangs.

| Messgröße | Bisheriger PATCH | Einmalige JSONB-Übergabe |
| --- | ---: | ---: |
| Kernel-Speicherhöchststand | 530.534.400 B | 465.166.336 B |
| Vollständig geloggte temporäre Dateien | 25 | 0 |
| Temporäre Nutzdaten aus den nativen Dateimeldungen | 110.110.150 B | 0 B |
| Median der 24 Schreibantworten | 250,863 ms | 203,841 ms |
| Langsamste einzelne Schreibantwort | 364,159 ms | 916,790 ms |
| Gesamte Kernel-CPU-Zeit des kleinen Falls | 8,560736 s | 8,962482 s |
| Node-Client maxRSS, separat und nicht addiert | 206.159.872 B | 220.295.168 B |

Gemessen sind 65.368.064 Byte weniger gemeinsamer Speicher, rund 12,32 Prozent,
und 110.110.150 Byte weniger temporäre Schreibdaten. Der Median verbessert sich
um 47,022 ms. CPU und der langsamste Einzelaufruf sind dagegen höher. Es wird
keine allgemeine Beschleunigung und keine zusätzliche Unit60-Reserve behauptet.
Der erste Prototyp mit sechs Schreibvorgängen hatte einen höheren Peak und wurde
nicht übernommen; die vorliegende Variante vermeidet mehrfache JSON-Extraktionen.

Native `pg_stat_database`-Zähler können dem letzten Backendzugriff nachlaufen.
Der vollständige temporäre Verbrauch stammt deshalb aus den nach dem sauberen
Shutdown gesicherten `log_temp_files`-Meldungen. Die verschachtelten EXPLAIN- und
pg_stat_statements-Knoten werden nicht mehrfach als eigene Schreibdaten addiert.

14 gezielte Prüfungen gegen echtes PostgreSQL/PostgREST bestehen: große unveränderte
Inhalte, veraltete und kopierte Snapshots, genau ein konkurrierender Gewinner,
Legacy-Nullrevision, Zielwechsel, ungültiger Transport, fehlende RPC, verlorene
Antwort ohne Wiederholung, fehlende Zeile, RLS, Rollenrechte, ungültige Eingaben
und die ursprünglichen ALWAYS-Trigger. Deren drei native Funktionshashes bleiben
identisch. 81 bestehende Prüfungen der signierten Inhalts-/Zustandsbindung bestehen.
Das SQL-Rollback besteht fünf getrennte Prüfungen einschließlich Quellendrift,
fehlender Funktion, unveränderten Tabellendaten und erhaltenen Schutztriggern.
Der konservative Standardlauf bestand 175 von 177 Suiten. Der fehlende
Env-Inventareintrag und die durch die Quelländerung überholten Artefakt-Sollwerte
wurden gezielt korrigiert; die beiden Folgeprüfungen bestehen mit 38 beziehungsweise
10 Prüfungen. Eine zweite vollständige Offline-Runde wurde nicht gestartet.
Das aktuelle Artefaktmanifest bindet zusätzlich das CAS-Modul und damit 85 Dateien.
Die historischen Manifest-/Qualifikationsbezüge bleiben nachvollziehbar; der
Metadatenleser meldet ausdrücklich `full500QualificationProven=false`.
DeepSeek V4 Pro High hat die SQL-Ursache und die begrenzte Sicherheitsänderung in
zwei getrennten rein lesenden Aufträgen geprüft; echte Tests führte Sol aus.

Die bereits vorhandene, kryptografisch an Originaldaten und Zustand gebundene
Wiederverwendung unveränderlicher Auftragsinhalte bleibt bestehen. Veränderliche
Berechtigungen, Profile, Quellenzulässigkeit, Kosten, Fristen und Notstopp werden
nicht durch einen Cache ersetzt. Alle 16 Kontrollpunkte bleiben unverändert.

Die Meta-Quellen begründen, unabhängige unveränderliche Arbeit vorzubereiten und
unnötige Materialisierungen/Kopien zu vermeiden. Instagrams Python-Immortal-Objects
beheben Referenzzähler-/GC-bedingtes Copy-on-write; das ist kein übertragbarer
Node-/PostgreSQL-Schalter. Ein zusätzlicher Quellen-Cache würde die gemessene
Materialisierung des veränderlichen Auth-Blobs nicht beheben.

- [Scaling Instagram Explore](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/)
- [Immortal Objects for Python](https://engineering.fb.com/2023/08/15/developer-tools/immortal-objects-for-python-instagram-meta/)
- [PostgREST 12.2.3: einzelner unbenannter JSON-Parameter](https://github.com/PostgREST/postgrest/blob/v12.2.3/docs/references/api/functions.rst#functions-with-a-single-unnamed-json-parameter)

Für Vercel/Supabase ist die Änderung prinzipiell übertragbar: Der Node-Prozess nutzt
weiter HTTP; die vermiedene Zwischenablage liegt in PostgreSQL/PostgREST. Tatsächliche
Production-Version, Funktion, ACL, RLS und Laufzeiten müssen vor einem gesonderten
Integrations-GO nachgewiesen werden. Getrennte Production-Systeme ändern den
gemeinsamen lokalen 2.048.000.000-Byte-Vertrag nicht. Es wird kein Dateicache aus
der Messung entfernt und keine Speichergrenze erhöht.

Eine zusätzliche Cachebegrenzung wurde nicht integriert: Die bisherige
`inactive_file`-Stichprobe zeigt Reclaim-Potenzial, beweist aber weder ausreichende
Gesamtersparnis noch unveränderte Laufzeit unter Speicherdruck. Insbesondere darf
die kleine Ersparnis nicht vom früheren 500er Peak abgezogen werden.

Der Kandidat bleibt lokal und zuschaltbar vorbereitet. Die vollständige Abnahme
von Offline90, Unit60, Auth30, allen 500 Abschlüssen und gemeinsamem Gesamtspeicher
bleibt offen. Kein neuer 500er Ressourcenlauf, keine Aktivierung, kein neues GO,
keine Production-Änderung und kein kostenpflichtiger Modelltest wurden ausgeführt.
Der nächste Schritt ist die gebundene Endabnahme des zugeschalteten Kandidaten
innerhalb einer separat erlaubten Testausführung; der alte Auftrag ist tabu.
