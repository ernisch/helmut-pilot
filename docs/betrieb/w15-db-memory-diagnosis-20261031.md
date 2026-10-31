# DB-Speicherdiagnose nach dem einmaligen synthetischen 500er Lauf

Stand 31.10.2026; PR #1004, Ausgangskopf
`d56e97b37468080aaff6d4bd47b045ba072a2c6f`. Keine neue Ausführung.
Der [Diagnosevertrag](w15-original-free-resource-diagnostic-20261031.md)
und alle offiziellen End500-/Mock500-Verträge bleiben unverändert.

## Primärbelege und Abnahmegrenze

- [Run 41239213884](https://github.com/ernisch/helmut-pilot/actions/runs/41239213884),
  Job 124649370401, Attempt 1; Workflow-Dispatch auf obigem Kopf.
- [Vollständige öffentliche SAFE-Messquittung](https://api.github.com/repos/ernisch/helmut-pilot/check-runs/124651025225),
  Nonce `b280c4ac-239a-42dd-a943-65c5197a6b4d`.
- Pflicht-CI und native 3-Profil-Anschlussqualifikation auf dem Ausgangskopf:
  [41236627723](https://github.com/ernisch/helmut-pilot/actions/runs/41236627723).
  Das ist kein vollständiger 500er Ergebnisnachweis.

Der einmalige 500er Lauf ist **FAIL** nach 383,988566531 s einschließlich
Bereinigung. Die Freigabe ist verbraucht. 96 erfolgreiche lokal simulierte
KI-Antworten mit davor erzwungenen nativen Kontrollen der exakt 500 aktiven IDs
belegen den gleichzeitig aktiven Bestand während dieses Abschnitts. Die letzte
bestätigte innere Operation, vollständige Ergebniszahl und finale Profilflags
0 sind ohne 500er `APP_RESULT` UNKNOWN. Nur die eigenen Prozesse und die
Entfernung des gemeinsamen Parents sind positiv bestätigt. Keine Artefakte,
Originale, kostenpflichtigen Modellaufrufe oder Production-Aktionen.

## Gemessene Gruppen und tatsächliche Grenze

Alle Bytes sind Kernel-cgroup-Belastungen; gemeinsame Seiten werden nicht durch
Addition von Prozess-RSS doppelt gezählt. Bereits vorher außerhalb der Gruppen
belastete gemeinsam genutzte Seiten und der äußere Bootstrap sind nicht
vollständig zugeordnet. Kein Anspruch auf gesamten GitHub-Hostverbrauch.

| Gruppe | Kernel-Lebenszeitpeak B | Hartlimit B | max / OOM / Swap B |
| --- | ---: | ---: | --- |
| Node-Anwendung einschließlich untrennbarem Testtreiber | 408.981.504 | 1.999.998.976 | 0 / 0 / 0 |
| PostgreSQL, PostgREST und SQL-Beobachterclients | 948.191.232 | 948.191.232 | 38 / 0 / 0 |
| Python-Steuerung und lokale KI-/RSS-/DB-Proxy-Fixtures | 450.027.520 | nur gemeinsamer Parent | 0 / 0 / 0 |
| Gemeinsamer Parent | 1.756.499.968 | 4.999.999.488 | 38 hierarchisch / 0 / 0 |

Die verschiedenen Lebenszeitpeaks sind nicht gleichzeitig und werden nicht
addiert. Der Parent prüft seine hierarchischen `memory.events` zuerst. Deshalb
lautet der erste erhaltene Fehler `COMMON_PARENT_REJECTED` in `synthetic500`,
obwohl die engere DB-Gruppe ihr Limit erreichte. Die 38 `max`-Ereignisse sind
Speicherbelastungen an der Grenze, **keine 38 OOMs, Prozesse oder SQL-Aufrufe**.
Reclaim kann dabei stattfinden. Weder ein 5-GB-Engpass noch ein irreduzibler
DB-Arbeitssatz oberhalb des DB-Limits ist dadurch bewiesen. Der unbegrenzte
vollständige Peak bleibt durch den Abbruch UNKNOWN.

Letzter gültiger Parent-Sample: 1.710.399.488 B aktuell,
1.745.797.120 B bisheriger Peak, 14.578.847.744 B Host verfügbar. Nach der
Bereinigung: Parent-Peak 1.756.499.968 B, 714.559.488 B aktuell und
15.619.379.200 B Host verfügbar; die äußere Nachkontrolle erfasste
15.655.780.352 B Host verfügbar. Das tatsächliche Hostminimum ist UNKNOWN.
Die vorgeschriebenen 2.147.483.648 B waren in diesen Samples klar vorhanden.
Der finale allgemeine Wächterstatus bleibt wegen der erhaltenen Grenzereignisse
UNKNOWN; bestätigte Prozess-/Containerstopps werden separat ausgewiesen.

## Wann wurde die Grenze beobachtet?

Beginn der gemessenen `synthetic500`-Phase: DB-Sample 16336,
monotone Zeit 77,357404026 s, aktuell 168.132.608 B, bisheriger Peak 178.741.248 B.
Erste beobachtete finale DB-Peakgrenze: Sample 19671,
413,293665313 s, rund **335,936 s nach Beginn dieser Phase**. Das ist der
Beobachtungszeitpunkt, kein Kernelzeitstempel der tatsächlichen Allokation.
Der letzte gültige Parent-Sample mit `max=0` trägt die Nachlesezeit
413,188275064 s; der Abstand von rund 105 ms ist kein exakter Ereigniszeitpunkt.

Die SAFE-Quittung enthält für denselben nahen DB-Sample:

| Kategorie | Bytes | Einordnung |
| --- | ---: | --- |
| `anon` | 273.461.248 | anonymer Speicher der zugeordneten Gruppe |
| `file` | 588.124.160 | dateibasierte Seiten einschließlich SHMEM |
| darin `shmem` | 198.709.248 | Teil von `file`, nicht zusätzlich addieren |
| `kernel` | 25.358.336 | Kernelbelastung |
| separat gelesenes `memory.current` | 887.554.048 | nicht atomar mit `memory.stat` |
| separat gelesener Lebenszeitpeak | 948.191.232 | kein gleichzeitiger Kategorien-Snapshot |

Der Unterschied zwischen `file` und `shmem` in genau diesem `memory.stat`
beträgt 389.414.912 B; das ist kein Prozessverursacherbeweis oder Peakanteil.
Großer dateibasierter Verbrauch ist belegt. Seine genaue Aufteilung auf
PostgreSQL-Daten/WAL, ausführbare Dateien und sonstige Dateiseiten ist UNKNOWN.
PostgreSQL und PostgREST sind in derselben gemessenen Gruppe; ihre individuellen
RAM-Anteile sind UNKNOWN. Dort gestartete Beobachter-`psql`-Clients belasten
ebenfalls die DB-Gruppe. Anwendungseigene `psql`-Hilfen erben hingegen die
App-/Treibergruppe. Python-Steuerung und lokale Simulatoren liegen separat,
nicht im DB-Budget; diese Zuordnung gilt nicht pauschal für alle Hilfsprozesse.

## Weitere vorhandene Maxima und CPU-/Verbindungsbilanz

Die folgenden Kategorienmaxima sind **zeitlich getrennte Sample-Maxima**,
keine Zusammensetzung einer Gesamtspitze und nicht miteinander addierbar.

| Kategorie B | Anwendung/Treiber | Datenbankdienste | Testwerkzeuge |
| --- | ---: | ---: | ---: |
| `anon` | 392.556.544 | 331.218.944 | 163.647.488 |
| `file` einschließlich SHMEM | 20.480 | 597.323.776 | 256.995.328 |
| darin `shmem` | 0 | 198.709.248 | 8.192 |
| `kernel` | 8.351.744 | 25.939.968 | 17.121.280 |
| `file_dirty` | 0 | 39.231.488 | 144.683.008 |
| `file_writeback` | 0 | 16.777.216 | 106.496 |

Alle Gruppenpeaks wurden zuerst in `synthetic500` beobachtet. Die größte
schmutzige Dateimenge der Werkzeuge stammt dagegen aus der Bereitstellung.

| CPU-Messung | Anwendung/Treiber | Datenbankdienste | Testwerkzeuge | Gemeinsam |
| --- | ---: | ---: | ---: | ---: |
| letzter kumulativer Stand, CPU-s | 166,157641 | 217,695205 | 61,225420 | 445,078266 |
| Drosselzeit, s | 4,150814 | 58,956895 | 0 | nicht als Anbieterwert zu verwenden |

App und DB wurden jeweils mit 100000/100000 µs, also modellierter 1-vCPU-Quota,
gemessen. Die DB-Quota ist eine technische Laborannahme, keine Garantie für
Supabase Micro mit gemeinsam genutzter CPU. Momentane CPU-Spitze, vollständig
zugeordnete äußere Abschlusszeit und echte Anbieterlast sind UNKNOWN.

DB-Konfiguration: `max_connections=60`, `shared_buffers=268.435.456 B`,
`work_mem=3.584.000 B`, `max_parallel_workers=2`, drei reservierte
Superuserplätze. Höchster abgetasteter Clientstand 6; zuletzt 5 Clients,
darin 4 PostgREST/Authenticator-Backends und 1 eigener Beobachter, 1 aktiv,
4 idle. Poolwarteschlange und tatsächliche kurzzeitige Verbindungsspitze
UNKNOWN. Die 60 Plätze allein sind kein Nachweis eines überlasteten Pools.

## Anbieterbelege: gemeinsame Hosted-Micro-Grenze UNKNOWN

Offizielle Quellen, gezielt am 31.10.2026 geprüft:

- [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase):
  “Each project includes a dedicated Postgres instance running on its own server.”
  Belegt den dedizierten Postgres-Server, keine PostgREST-RAM-Zuordnung.
- [Architektur](https://supabase.com/docs/guides/getting-started/architecture):
  “All the services talk to a single Postgres instance.” Logische Anbindung,
  kein Beweis physischer Co-Location oder eines gemeinsamen Hartlimits.
- [V2-Architektur](https://supabase.com/changelog/22135-migration-to-v2-platform-architecture):
  Entkopplung nennt Storage, Realtime und Pooler; daraus folgt weder eine
  gemeinsame noch getrennte PostgREST-Micro-Grenze.
- [Hosted-Reports](https://supabase.com/docs/guides/observability/reports):
  Used beschreibt “RAM actively used by Postgres and the operating system”.
  Keine exakte PostgREST-Budgetbindung.

Der bestätigte Micro-Wert von 1 GB bleibt erhalten. Das gemeinsame lokale
PostgreSQL/PostgREST-Lablimit ist ausdrücklich eine Testannahme; diese Quellen
beweisen keine gleiche gehostete physische RAM-Grenze. Kein Self-Hosting- oder
Docker-Layout wird auf das gehostete Angebot übertragen. Keine weitere
Anbieterrecherche oder kostenpflichtige Monitoringaktivierung erforderlich.

## Kleinste notwendige Korrektur der Diagnose

Der alte Supervisor überschrieb `commonFailureMemory` bei jedem fehlgeschlagenen
Parentlesen erneut, auch bei der Bereinigung. Die erhaltene monotone Zeit
423,801515823 s liegt deshalb nach der nahen Arbeitsmessung. Die Nachkontrolle
darf nicht als erster Abbruchsnapshot beschrieben werden. Die notwendige
Korrektur hält den **ersten** Speicherfehlersnapshot unveränderlich; aktuelle
Kernel- und Abschlusswerte bleiben in ihren bestehenden separaten Feldern.

Zusätzlich wird `APP_PROGRESS.SAFE.json` im bereits privaten Ergebnisverzeichnis
atomar mit 0600 ersetzt. Vor relevanten Operationen werden ausschließlich
gebundene innere Phase/Operation, Sequenz und bestätigte numerische Zähler
übermittelt. Kein neuer Monitor, Prozess oder Messdienst. Der bestehende
Supervisor liest die höchstens 8 KiB im vorhandenen Kontrollablauf und sichert
den letzten gültigen Stand vor der Bereinigung. Signal/erster Arbeitsfehler
friert den Arbeitsstand ein; fehlende oder ungültige Frames ergeben UNKNOWN.
Keine Profil-IDs, Inhalte, URLs, SQL-Texte, Zugangsdaten oder freie Fehlertexte.
Der neutrale SAFE-Check und seine bestehende Fehlerannotation erhalten den
Teilfortschritt auch ohne Worker-Abschluss. Teilfortschritt ersetzt niemals
`APP_RESULT`, Ergebnisvollständigkeit oder die native Nullprofilprüfung.

## Entscheidung und nächste Freigabegrenze

**Am besten belegt:** Die gemeinsame DB-Dienstgruppe erreichte ihr enges
Laborlimit, mit erheblichem dateibasiertem Anteil einschließlich SHMEM.
Die genaue verursachende Operation und der individuelle Prozessanteil sind
UNKNOWN. Keine Grundlage für pauschale App-/DB-Optimierung, Cachemanipulation
oder eine RAM-/Vertragsänderung.

Notwendig sind die belegte Diagnoseverlustkorrektur und bessere Weitergabe des
inneren Fortschritts, keine spekulative Speicherkorrektur. Vor einem einzigen
nächsten Gesamtversuch fehlen ein auf dem exakten neuen Kopf qualifizierter
Fehlerkanal mit Pflicht-CI und unabhängiger Abnahme sowie ein **neues konkretes
einmaliges GO** mit Kopf/Nonce/Umfang und unveränderten Labor-/Hostgrenzen.
Ein erneuter Gesamtversuch wird in diesem Sprint nicht gestartet. Die getrennten
End500-/Mock500-/Production-Abnahmen bleiben offen und ihre Starttore erhalten.
