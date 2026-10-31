# Getrennte Ressourcenmessung und Referenzvertrag

Stand 31.10.2026. Entwurf **`helmut-w15-separated-resources/1`**, weiterhin
**inaktiv**. Grundlage: [PR #992](https://github.com/ernisch/helmut-pilot/pull/992),
[PR #993](https://github.com/ernisch/helmut-pilot/pull/993) und
[PR #1003](https://github.com/ernisch/helmut-pilot/pull/1003).
Die numerische Referenz ist zur Entscheidung vorbereitet. Sie ersetzt weder
den bisherigen End500-/Mock500-Vertrag noch eine Ausführungsfreigabe.

## Vorhandene Anbieter-Messmöglichkeiten

| Anbieter | Bereits vorhandene Möglichkeit | Grenze des Nachweises |
|---|---|---|
| Vercel | Enthaltenes Basic Observability: Aufrufe, Fehler, Laufzeit; vorhandene Concurrency-Ansicht verwenden. Das verfügbare Metrikschema benennt `peak_memory_mb`, `provisioned_memory_mb` und `function_cpu_time_ms` je Function Invocation. | Ein Schema ist kein Messwert. Die frühere RAM-Abfrage ergab keinen verwertbaren Wert; nicht wiederholt. Query und viele CLI-Auswertungen benötigen Plus. Kein Upgrade aktivieren. Tatsächliche App-Peaks und vollständige Instanzdimensionen UNKNOWN. |
| Supabase | Vorhandene Metrics API mit ungefähr 200 Prometheus-Serien für RAM, CPU, Datenbank und Verbindungen; vorhandene Dashboards. Geschützte vorhandene Anbindung wiederverwenden, empfohlener Abrufabstand 60 s. | Abtast-Maximum ist kein vollständiger Kernel-Peak. Namen können sich ändern; fehlende Reihen UNKNOWN. Kein neuer Exporter, Grafana, Schlüssel oder Monitoringdienst. |
| PostgreSQL | Nur lesende Einstellungen und aggregiertes `pg_stat_activity`: Clientverbindungen, Beobachter, Rollenklassen, reservierte Plätze, aktive/idle/offene Transaktionen. | Konfiguration beweist keinen Verbrauch und 60 Plätze beweisen keine 500er Kapazität. Background-Worker nicht als Clientplätze zählen. Beobachter ausdrücklich mitzählen. Poolwartezeit ohne vorhandenen Messwert UNKNOWN. |

Basic Observability ist enthalten; das bedeutet keine kostenlose Freigabe aller
Vercel-Query-Funktionen. Es wurde keine kostenpflichtige Funktion eingeschaltet.
Supabase Metrics und SQL werden hier nicht gegen Production aufgerufen.
Die Vorbereitung verwendet vorhandene Belege und öffentliche Dokumentation.

Quellen: [Vercel Observability](https://vercel.com/docs/observability),
[Insights](https://vercel.com/docs/observability/insights),
[Plus](https://vercel.com/docs/observability/observability-plus),
[Supabase Metrics](https://supabase.com/docs/guides/observability/metrics),
[Verbindungen](https://supabase.com/docs/guides/database/connection-management),
[Changelog](https://supabase.com/changelog.md).

## Belegte Basis und vorgeschlagene Laborwerte

| Komponente | Belegt | Inaktive technische Referenzannahme |
|---|---|---|
| Helmut-Anwendung je modellierter Funktionsinstanz | Vercel Standard: 2 GB, 1 vCPU pro Instanz. Effektives Anbieter-Hartlimit in Bytes UNKNOWN. | Dezimale Unterstellung 2.000.000.000 B; auf 4.096-B-Seiten abgerundet **1.999.998.976 B hart**; Referenzpeak höchstens **1.999.994.880 B**. `cpu.max=100000 100000`. |
| PostgreSQL/Datenbank | Micro: 1 GB einschließlich System/Diensten, geteilte CPU, höchstens 60 DB-Clientverbindungen. Historischer OS-`MemTotal`-Messwert 948.191.232 B vom 30.10.2026 17:59:47 UTC; kein Anbieter-Hartlimit. | Kleinerer Wert aus dezimalen 1.000.000.000 B und diesem OS-Wert: **948.191.232 B hart**, Referenzpeak höchstens **948.187.136 B**. Lokales 1-vCPU-Limit ist eine Laborwahl und **kein** belegter konservativer Ersatz für Shared CPU. |
| Testwerkzeuge, PostgREST und Sicherung | Keine Vercel-App-Budgets. PostgREST ist Supabase-Dienst; seine tatsächliche Anbieter-Platzierung UNKNOWN. | Testwerkzeuge/Sicherung disjunkt zuordnen. PostgREST benötigt noch eine separat qualifizierte Dienst-/PID-/PSS-Zuordnung; bisher kein eigener cgroup-Slot. Kein erfundener zusätzlicher Anbieter-RAM-Anteil. |
| Gemeinsamer GitHub-Schutz | Vorhandener Kapazitätsdiagnosemodus wurde gesondert geprüft. | Wiederverwendung **4.999.999.488 B hart**, mindestens **2.147.483.648 B tatsächlich verfügbarer Hostreserve**, Swap/OOM/Maxereignisse 0; mindestens **536.870.912 B** freie Platte. Dies ist ein Vorschlag für das Referenzlabor, **keine** bereits aktivierte Erhöhung des Mock-Vertrags. |

Die Differenz von genau einer Seite zwischen Referenzpeak und Hartlimit bedeutet
nur `peak < hard` in Kernel-Seiteneinheiten. **4.096 B sind keine Sicherheitsreserve.**
Die reale Reserve muss aus maximaler Allokation zwischen Beobachtung und wirksamem
Stopp sowie nicht modellierten Plattformdiensten hergeleitet werden. Diese Größen
sind noch UNKNOWN; weder 0 B noch frühere pauschale 20 Prozent werden eingesetzt.
Eine Referenzpassung beweist nur, dass der beobachtete Laborzustand unter den
gewählten Zahlen liegt, keine belastbare Anbieter- oder Production-Kapazität.
Abweichende Kernel-Seitengröße muss vor Aktivierung neu qualifiziert werden.

Die bestehende DB-Konfiguration wird nicht verändert: `shared_buffers` 268.435.456 B,
`work_mem` 3.584.000 B, `max_parallel_workers=2`, PostgREST-Pool 3.
`work_mem` gilt je geeigneter Operation/Worker und ist kein Gesamtlimit.
Zwei Parallel-Worker sind keine zwei garantierten CPU-Kerne. 500 Profile sind
weder 500 Vercel-Instanzen noch 500 gleichzeitig nötige DB-Verbindungen.
Reservierte Verbindungen werden aus tatsächlichen Einstellungen abgeleitet,
unbekannte Reservierungen bleiben UNKNOWN. Keine Rolle/Pools still erhöhen.

## Kleinster vorbereiteter Codeanschluss

* `component_resource_meter.py` liest ausschließlich bereits vorhandene, explizit
  deklarierte disjunkte cgroup-v2-Unterbäume. `CommonResources.component_snapshot`
  ist ein optionaler Anschluss für den bestehenden Wächter; dessen `sample()`
  und alle bisherigen Limits bleiben unverändert. Kein zusätzlicher Poller.
* Je Gruppe: `memory.current`, lebenslanges `memory.peak`, `memory.max`, Swap,
  Max/OOM-Ereignisse, anon/file/kernel/shmem/dirty/writeback, CPU-Zeit,
  Throttling, tatsächliches `cpu.max`, Cpuset und vorhandene Druckwerte.
  CPU-Raten erst nach zwei gültigen Beobachtungen gleicher Identität.
  `cpu.max` ist die konfigurierte Gruppenquota, keine garantierte CPU-Lieferung;
  engere Vorfahrengrenzen, Hostkonkurrenz und Shared-CPU-Effekte bleiben gesondert.
* Kernel- und PID-Identitäten vor und nach der Zuordnung prüfen. Eine deklarierte
  Rolle bestätigt Programmsemantik nur durch den Aufrufer, nicht durch den Kernel.
  Gemeinsamer App-/Treiber-PID oder fehlende Bindung: reine App UNKNOWN.
  Der bestehende Node-Gateway ist nicht automatisch der Helmut-Appserver.
* Dateicache wird als Unterkategorie des vom Kernel belasteten cgroup-Budgets
  sichtbar. Das beweist wegen Shared-/First-touch-/Restcache nicht den Verursacher.
  PSS, Cache und unterschiedliche zeitliche Peaks
  niemals addieren. Beobachtungen sind nicht atomar; Zusammensetzung des
  lebenslangen Peaks bleibt ohne zeitgleichen Beleg UNKNOWN.
  Vollständige beobachtete PID-Zuordnung beweist keine vollständige Parent-/Cache-
  Bilanz: auch unbesetzte/verbliebene Untergruppen können Speicher halten.
* `separated_resources.py` stellt den inaktiven Plan, eine geschlossene numerische
  Verbindungsprojektion und eine ausdrücklich begrenzte Referenz-Snapshot-Bewertung
  bereit. Keine Abnahme-/Startbefugnis, keine DB-Verbindung beim Import.
  SQL nur feste Einstellungen und aggregierte Klassen, keine Querytexte,
  Mandanten, IPs oder privaten Datensätze. Poolwarteschlangen UNKNOWN.

Heute laufen App/Treiber teilweise im gleichen PID und Containergruppen decken
mehrere Komponenten ab. Der Leser macht daraus keine scheinbare Trennung.
Nach Vertragsentscheidung ist die tatsächliche separate Platzierung samt
Limit-Rücklesung, vollständiger PID-Abdeckung und zuverlässigem Stopp noch gezielt
zu qualifizieren. Teststeuerung muss außerhalb der App-/DB-Budgets liegen;
PostgREST muss dabei separat qualifiziert sichtbar werden oder UNKNOWN bleiben;
PG und PostgREST im selben Datenbank-Unterbaum sind derzeit ein kombinierter Wert,
kein getrennt gemessener PostgREST-cgroup-/CPU-Beitrag. Sein Micro-Systemanteil
bleibt ohne Beleg UNKNOWN.
Genau diese fehlende Qualifikation verhindert derzeit eine Anbieterabnahme.

## Abnahme und Freigabegrenzen

Entwicklungsabnahme: gezielte fiktive Kernel-/PID-/CPU-Fälle, Anschluss-/UNKNOWN-
und Verbindungsfälle, nur lesendes SQL im bereits vorhandenen synthetischen
CI-PostgreSQL, Pflicht-CI und unabhängiger Review des tatsächlichen Codekopfs.
Keine Neuqualifikation der Originale, kein geschützter Testlauf.

**Freigabevorschlag:** Den oben numerisch festgelegten Referenz-Laborvertrag
`helmut-w15-separated-resources/1` als Grundlage der anschließenden isolierten
Komponentenzuordnung und Rücklesequalifikation genehmigen. UNKNOWN-Reserven,
Shared-CPU-Unterschied und fehlende Anbieterparität bleiben ausdrücklich offen.
Dies genehmigt keinen vollständigen 500er Lauf, keine Änderung alter Abnahmen,
keine Production-Aktion und keine kostenpflichtige Monitoringfunktion.

Eine spätere verbindliche Ersatzabnahme benötigt zusätzlich die ausdrückliche
Entscheidung über Reserven/Plattformanteile und den tatsächlichen, qualifizierten
Codekopf. Jede geschützte Ausführung benötigt weiterhin ihr eigenes konkretes GO
mit Commit, Umgebung, Kosten, Grenzen und Rückweg. Alte FAILs bleiben erhalten.

## Kürzester Weg zu Mock500

1. Ressourcenentscheidung treffen; ausschließlich die fehlende physische Trennung
   und Limit-Rücklesung synthetisch qualifizieren. Keine RAM-Optimierung ohne Engpass.
2. Vorbereiteten End500-Sicherungsfix aus PR #1002 auf neuem gesondert freigegebenem
   Lauf vollständig abnehmen; vorhandene Funktionsbelege übernehmen.
3. Historischen Mock-RAM-Fehler nach 69 Units gesondert behandeln: dessen
   Komponentenverbrauch ist UNKNOWN. Keine Phasentrennung oder neue Referenzzahl
   als Reparatur behaupten. Nur aus tatsächlichen Messbelegen korrigieren.
4. Positiv abgenommenen End500-Kopf mit Mock500-Kopf binden, gültige Tages-/Zeitfenster,
   Atomic12ACK und Namespace prüfen. Abgelaufenes Fenster nicht auf dem Papier verlängern.
5. Eigenes exaktes Mock500-GO erst nach Startqualifikation: 500 gleichzeitig aktive
   synthetische Profile, 500 Units, 1.000 Mockphasen, 1.500 gespeicherte und einzeln
   geprüfte Ergebnisse, 8.000 Kontrollen; Auth <30 s, Unit <60 s, Provider <20 s,
   sichere Rückführung auf 0 aktiv. Bestehende Zeit-/Kosten-/Sicherungs-/Abbruch-
   und unabhängige Rücksicherungsbedingungen erhalten.

Die elf Mock-Originaldateien sind bereits bestätigt; kein neuer Beschaffungsblocker.
Mock500 ist damit noch nicht startbereit. Ein gemeinsamer GitHub-Peak allein
erlaubt weder die Addition von 2 GB und 1 GB noch eine Vercel-/Micro-PASS-Meldung.
