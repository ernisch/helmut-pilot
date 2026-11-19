# Infrastrukturabgleich für den Quellenprüfstand

Stand 19.11.2026. Der Abgleich nutzt Vercel- und Supabase-Verwaltungsmetadaten und je eine lesende PostgreSQL-Abfrage zu Größe, Verbindungen, Indizes und Zeilenschutz sowie zu aggregierten RPC-Ausführungszeiten. Er umfasst keine Fachdatensätze, Quellenabrufe, Modellaufrufe oder Lastproben.

## Vercel und GitHub

Vercel meldet für das mit `ernisch/helmut-pilot` verbundene Team `nohut` den Pro-Tarif und für das Projekt `helmut-pilot` Node `24.x`. Der Produktionsalias zeigt auf das bereite Git-Deployment `da61adfe04b0188e20c1a3bc4325a841733e4a47` in `fra1`. Der Repositorystand `7b1f55b0` dokumentiert die Ausrollung. Am ausgelieferten Code ist für `api/index.js` eine Dauer von 300 Sekunden eingestellt. Zur Funktion gehört die PDF-Worker-Datei im Vercel-Bundle. [Deployment](https://vercel.com/nohut/helmut-pilot/7i8nwqeVVBPwnfFYZDsDApxMJTMS) · [Ausgelieferte Konfiguration](https://github.com/ernisch/helmut-pilot/blob/da61adfe04b0188e20c1a3bc4325a841733e4a47/vercel.json)

Vercel nennt für Pro mit Fluid Compute 300 Sekunden Standarddauer und 800 Sekunden reguläres Maximum. Für Funktionen nennt der Anbieter 2 GB RAM und eine vCPU als Standard, bis zu 4 GB und zwei vCPUs auf Pro, 4,5 MB für Request-Bodies und ungestreamte Response-Bodies und 1.024 gemeinsame Dateideskriptoren. Das reale Fluid-, Speicher- und CPU-Profil der eingesetzten Funktion war über die zugänglichen Connector-Antworten nicht sichtbar. [Funktionsgrenzen](https://vercel.com/docs/functions/limitations)

Auf Pro sind bis zu 100 Cron-Definitionen je Projekt mit Minutenauflösung möglich. Zustellungen können ausbleiben, sich überlappen oder doppelt eintreffen. Vercel wiederholt fehlgeschlagene Cron-Aufrufe nicht automatisch. HELMUT nutzt drei Quellen-Crondefinitionen mit acht UTC-Starts von 03:00 bis 04:45 und setzt Lage und Morgenausgabe für 04:55 beziehungsweise 05:10 UTC an. Der Prüfstand kann Zeitplan und Wiederzustellung gezielt nachstellen. Reale Zustellung, Startzeitstreuung und Kaltstarts bleiben offen. [Cron-Grenzen](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) · [Zustellungsverhalten](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs) · [Betriebsbeleg](quellenfaelligkeit-20261119.md)

Der manuelle Workflow nutzt Node 24 und `ubuntu-latest`. GitHub dokumentiert für den Standardrunner in öffentlichen Repositories vier x64-CPU-Kerne, 16 GB RAM und 14 GB SSD auf VM-Ebene. Vercel-Funktionsbundle, CPU- und Speicherzuteilung sowie Transportzeiten zum Supabase-Projekt werden damit nur insoweit nachgebildet, wie der jeweilige Prüfbericht eine Begrenzung oder Gegenprobe belegt. [GitHub-Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

## Supabase

Die Projektverwaltung meldet für das Produktionsprojekt PostgreSQL `17.6.1.127` (Engine 17, GA), Region `eu-west-1` und `ACTIVE_HEALTHY`. Der Organisationstarif ist Pro. Der offizielle Tarif enthält 8 GB Disk für General Purpose. Falls die Instanz auf Micro läuft, gelten 1 GB RAM, zwei geteilte ARM-Kerne, standardmäßig 60 Datenbankverbindungen und bis zu 200 Pooler-Clients. Der beobachtete PostgreSQL-Deckel von 60 identifiziert die Instanzgröße nicht eindeutig. Die tatsächliche Compute-Größe, das zugeteilte Volume, der Poolmodus und die Poolgröße blieben offen. Die direkten lesenden Management-GETs für Disk und Pool erhielten aus der Ausführungsumgebung keine Verbindung. [Projektbindung](bundestag-faktenbetrieb-20261118.md) · [Compute und Disk](https://supabase.com/docs/guides/platform/compute-and-disk) · [Disk-Metadaten](https://supabase.com/docs/reference/api/v1-get-database-disk) · [Pooler-Metadaten](https://supabase.com/docs/reference/api/v1-get-pooler-config)

| PostgreSQL-Metadaten, 19.11.2026 um 13:56:08 UTC | Beobachtung |
| --- | --- |
| `pg_database_size(current_database())` | 666.627.219 Byte (635,75 MiB). Das zugeteilte und tatsächlich belegte Disk-Volume hat einen eigenen Messwert. |
| `max_connections` | 60, davon 3 Superuser-Reservierungen und 0 weitere reservierte Verbindungen. |
| `pg_stat_activity` für die Datenbank | 1 aktives und 3 inaktive Client-Backends, außerdem 2 interne Worker. Augenblickswert außerhalb des Morgenfensters. |
| Indizes und Zeilenschutz im ausgewählten Quellenschema | 49 gültige und 0 ungültige Indizes. RLS auf allen 11 geprüften Tabellen, bei `helmut_jobs`, `helmut_job_outbox`, `helmut_anbieter_fenster` und `helmut_anbieter_schutzschalter` erzwungen. |

Die Schemaabfrage berücksichtigte außerdem `helmut_store`, `knowledge_objects`, `mandate_profiles`, `raw_documents`, `retrieval_paths`, `source_crawl_telemetry` und `source_packages`. Ein RLS-Schalter ist ein Schemabefund. Für den `service_role`-Pfad sind der Mandatsfilter im Anwendungscode und gezielte Zugriffstests erforderlich. [Sicherheitsmodell](../quellenarchitektur/05-sicherheitsmodell-rls.md)

Der Workflow setzt den isolierten PostgreSQL-Server auf 60 Verbindungen mit 3 reservierten Slots und prüft beide Werte vor dem Lauf. Er nutzt PostgreSQL 17.6, PostgREST 12.2.3 und eine kontrollierte Uhr. Die separate Störprobe nutzt einen künstlich auf eine Verbindung begrenzten lokalen PostgREST-Pool. [Workflow](../../.github/workflows/manuelle-quellenpruefung.yml)

Die vorhandenen `pg_stat_statements` ergaben am 19.11.2026 um 14:02:08 UTC folgende aggregierte Stichprobe. Das Statistikfenster beginnt laut `stats_reset` am 12.11.2026 um 14:38:18 UTC. Die Auswertung filtert die aktuelle Datenbank, Top-Level-Aufrufe und exakte RPC-Namen. Sie exportiert keine Abfragetexte.

| RPC | Einträge | Aufrufe | Datenbank-Ausführung je Aufruf (ms) |
| --- | ---: | ---: | ---: |
| `helmut_anbieter_reserviere` | 1 | 8.360 | 0,430 |
| `helmut_anbieter_melde` | 1 | 3.358 | 0,520 |
| `helmut_claim_quellenfaelligkeit` | 3 | 3 | 15,325 |
| `helmut_claim_tagesarbeit` | 4 | 8.951 | 2,471 |
| `helmut_enqueue_job` | 6 | 6 | 36,531 |
| `helmut_defer_job` | 1 | 6.532 | 0,541 |
| `helmut_finish_job` | 1 | 2.475 | 0,737 |

Für `helmut_extend_job_lease` ergab der Filter keinen Eintrag. Die Werte geben die je Aufruf gewichtete SQL-Ausführungszeit wieder. Ende-zu-Ende-Latenz und Spitzenwerte bleiben offen. Die Reihen mit drei und sechs Aufrufen erlauben keine belastbare Durchsatzschätzung. [Statistikdefinition](https://www.postgresql.org/docs/17/pgstatstatements.html)

## Einordnung der Kapazität

Die bereits belegten Engpässe sind die Anbietergrenze für Google, 16 Originalreservierungen, acht Quellenfenster mit 2.400 gebuchten Sekunden und die Geldgrenzen von 1 USD täglich und 30 USD insgesamt. Die Metadatenprobe erfasst keine Spitzenwerte für Supabase-CPU, RAM, I/O, Verbindungen, PostgREST oder Vercel. Aus GitHub-Laufzeiten und dem Datenbank-Momentwert lässt sich keine zusätzliche Produktionskapazität ableiten. [Kapazitätsbeleg](quellenfaelligkeit-20261119.md)
