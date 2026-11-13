# Job-Metriken: lokale SQL-Optimierung, 13.11.2026

Status13.11.,09:49UTC: Nach konkreter Betreiberfreigabe auf Production angewendet.
Registrierte Migration20261113094853; deshalb die vorbereiteten Dateinamen und
Testpfade dieser Kennung angeglichen. Der gepruefte SQL-Koerper bleibt bytegleich.
Keine Neustartursache oder Betriebsbereitschaft bewiesen.

## Befund und Korrektur

Die bisherige `public.helmut_job_metrics(integer)` materialisiert die mehrfach
referenzierte CTE `basis AS (SELECT * FROM public.helmut_jobs)`. Der echte lokale
PostgreSQL-17.6-Plan zeigt 17 CTE-Scans. Nach Auslagerung lesen 16 weitere Scans
den Zwischenspeicher erneut. Auch das Verhaeltnis der vom Betreiber gemeldeten
Temp-Zaehler passt genau dazu: 392096 = 16 × 24506. Das beweist keine Neustartursache.

Die Korrektur aggregiert die skalaren Kennzahlen gemeinsam mit `FILTER` und liest
die Tabelle separat fuer die beiden JSON-Gruppierungen: drei schmale Tabellenscans,
kein breiter `basis`-Zwischenspeicher. Die Ein-Zeilen-CTE `fenster` bleibt erhalten.
Alle 17 Spalten, Reihenfolge, Typen und Ergebnisse bleiben gleich, einschliesslich
NULL-Durchsatz ohne passende Abschluesse, Rundung, Fenster-/Lease-/24h-Grenzen und
der getrennten Faelligkeits-/Wartezeitsicht. Keine neuen Indizes oder Einstellungen.

## Kleine lokale Nachweise

Vorhandene Suite `jobqueue-alter-datenbank-test.js`: **35 PASS / 0 FAIL**.
Neun synthetische Faelle × acht Parameter (inklusive Default/NULL/0/negativ/Extrema)
vergleichen alle 17 Feldwerte in derselben Transaktion und damit mit demselben `now()`.
OID, gesamte `pg_proc`-Metadaten ausser dem Funktionskoerper, Kommentar, ACL und
Jobdaten bleiben gleich; zweifache Anwendung und zweifacher Rueckweg bestanden.
Die bestehenden 26 Alters-/Rechte-/Rollback-Gruppen bleiben erhalten.
Assertions werden lokal explizit aktiviert. Auch mit anfangs ausgeschaltetem
`plpgsql.check_asserts` bestehen 35 Gruppen; eine private Fassung mit falschem
Wartend-Zaehler wird mit dem erwarteten Feldvergleichsfehler zurueckgewiesen.

Direktes `EXPLAIN (ANALYZE, BUFFERS)` am Funktionsaufruf, 192 synthetische Jobs,
lokales `work_mem=64kB`: Temp-Bloecke gelesen/geschrieben **64/4 → 0/0**,
gemessene Ausfuehrung im Function-Scan **1,274 → 0,743 ms**. Einzelmessung, keine
allgemeine Beschleunigungszusage. Eine zweite kleine, gemischte Fixture zeigt
80/5 → 0/0; bei 3500kB passen beide Fassungen in den Speicher (jeweils 0/0).
[Gemessene Plaene und Grenzen](job-metrics-ressourcen-20261113.json).

Aufruf mit ausschliesslich lokalem psql/Socket und frischer eigener Testdatenbank:
`HELMUT_TEST_PG_HOST=/var/run/postgresql HELMUT_TEST_PG_PORT=5432 HELMUT_TEST_PG_USER=helmut HELMUT_TEST_PG_DB_ALTER=helmut_metrics_local node scripts/lokal.js -- node scripts/jobqueue-alter-datenbank-test.js`.
Kein Mock100/Mock500, kein Production-Lasttest oder Modellaufruf. Vorhandene
erfolgreiche breite Nachweise bleiben historisch; keine erneute Gesamtpruefung.

## Umfang, Rueckweg und offene Grenzen

Angewendete Migration `20261113094853_job_metrics_ohne_materialisierung.sql`
und ihr `rollback_`-Gegenstueck; `CREATE OR REPLACE` erhaelt Identitaet, Owner,
ACL und Kommentar ohne DROP/GRANT. Rueckweg stellt den bisherigen 17-Feld-Koerper
wieder her. Production-Anwendung mit atomaren Ausgangs-/Metadatenpruefungen; Auth,
Mandanten- und Kostenlogik unveraendert.

Andere Aggregat-/DISTINCT-Sortierungen koennen bei grossen Bestandsmengen weiter
Temp-IO erzeugen. Keine allgemeine Produktionsbeschleunigung oder Ausfallbehebung bewiesen.
Unabhaengiges Codex-Review auf494ad4fa: kein SQL-/Rueckweg-Befund; gefundene
Assertion-Testluecke korrigiert und per Negativprobe belegt. Nachreview auf2737fb3c
abgeschlossen: keine blockierenden Befunde. SQL und Teststand bleiben unveraendert.
Betreiberfreigabe zur gezielten Uebernahme liegt vor. `[skip ci]` haelt die Pruefung
wie beauftragt lokal;
keine gruene Pflicht-CI behauptet. Der eigene bestehende Branch mit deaktiviertem
Vercel-Deployment wird weiterverwendet; keine Deploymentkonfiguration geaendert.

## Rein lesende Production-Nachkontrolle

Die Funktion entspricht exakt dem freigegebenen Aggregatkoerper. OID, alle
17 Rueckgabefelder, Owner/ACL, Funktionsattribute und Kommentar sind unveraendert.
Einmaliger EXPLAIN-ANALYZE-Lesecheck in READ ONLY als service_role, begrenzt auf5s:
119,022ms Gesamtausfuehrung, eine Ergebniszeile, Temp-IO0/0. Keine alte schwere
Funktion erneut ausgefuehrt, keine Zaehler zurueckgesetzt. Die Datenbank blieb
auf ihrem bisherigen Startzeitpunkt. Kein Quellen-, Lage-, Morgen- oder Modelllauf.

Der Repository-Merge darf nur regulaer ohne Admin-/Schutzumgehung erfolgen.
GitHub-CI wurde nicht als bestanden ausgegeben. Dateinamen und Testpfade sind
reine Historienangleichung, keine neue fachliche SQL-/Testaenderung.
