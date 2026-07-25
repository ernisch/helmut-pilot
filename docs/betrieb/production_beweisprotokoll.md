# Production-Beweisprotokoll — Helmut Datenmotor (Thread 2)

> **Redaktioneller Nachtrag 2026-07-17:** (1) Die Freigabe-Nummern dieses Protokolls
> folgen jetzt dem eindeutigen Thread-2-Schema **FT2-1…FT2-8** (früher „F1–F8";
> Mapping: `docs/datenmotor-restliste.md` §1). (2) Mandantenkennungen sind gemäß
> Neutralisierungs-Konvention anonymisiert (`<pilot-mandats-id>`); alle Messwerte,
> Tokens und Zeitstempel sind unverändert original. (3) Die offenen Punkte aus §5/§6
> werden verbindlich in der **Restliste** geführt (OP-05…OP-10, OP-19).

**Zweck.** Fortlaufender, ausschließlich aus echten Production-Messwerten gespeister
Nachweis, dass die am 2026-07-16 freigeschalteten Funktionen im laufenden Betrieb
tatsächlich wirken — und ehrliche Trennung zwischen *bewiesen* und *offen*.

**Verbindliche Regeln dieses Protokolls**
- Nur **gemessene** Werte aus der Production-DB (`ddckuvvpcytqbyfmbvie`), aus Vercel
  und aus GitHub. **Keine Schätzungen, keine Annahmen.**
- Während der Beweisläufe **keine** Änderung an Crawling, Locks, Telemetrie oder
  Zeitplänen. Keine künstliche Fehler-Injektion, kein bewusster Doppelstart.
- Keine Behauptung von Betriebsreife und keine DSGVO-Konformitätsbehauptung — dieses
  Dokument sammelt Belege, es spricht kein Reife-Urteil.

---

## 0 · Rahmen & Ausgangszustand

| Feld | Wert (gemessen) |
|---|---|
| Vercel-Projekt | `helmut-pilot` (`prj_xbZ6…`, Team `nohut`), Region `fra1` |
| Aktives Production-Deployment | `dpl_AvdgqwSeht2kBJDszEGmVgBC6Rwq` (redeploy von `dpl_7DP…`), READY |
| Flags live seit | **2026-07-16 18:06:42 UTC** (erst ab hier greifen die Env-Flags im laufenden Code) |
| Freigeschaltete Flags | `HELMUT_ATOMIC_LOCK`, `HELMUT_UNDERSTANDING_LOCK`, `HELMUT_SOURCE_TELEMETRY` = on |
| Migrationen live | `20260718` (`source_crawl_telemetry`), `20260719` (`pipeline_locks` + `helmut_acquire/release_pipeline_lock`) |
| Cron-Plan (UTC) | crawl `0 4`, `0 20`; pipeline `0 16`; understanding `30 5`, `30 21`; morning-briefing `0 5`; lage-briefing `45 5`; health-report `0 6`; lage-check `0 10` |

**Baseline unmittelbar vor dem ersten flag-aktiven Lauf (2026-07-16 ~18:11 UTC):**
`pipeline_locks` = 0 Zeilen · `source_crawl_telemetry` = 0 Zeilen · `systemErrors` = 59 ·
`processRuns` = 1 · `crawlRuns` = 20 · `knowledge_objects` = 323 (complete 271) ·
`raw_documents` = 5948.

**Kontroll-Lauf (Flag AUS) als A/B-Vergleich:** Der 16:00-UTC-Pipeline-Crawl
`crawl-20260716160030-z34lk` lief auf demselben (FT2-1-)Code, aber **vor** dem
18:06-Redeploy, also mit Flags AUS. Ergebnis: vollständiger crawlRun mit
`durationMs=196645`, 145/145 Quellen — **aber 0 Zeilen in `source_crawl_telemetry`**.
Das belegt: die P0-1-Laufzeitmessung ist flag-unabhängig, die Telemetrie hängt
echt am Flag.

---

## 1 · Dokumentierte Läufe

### Lauf 1 — Crawl (manuell über Vercel „Run" ausgelöst)

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260716182458-il02g` |
| Startzeit (UTC) | 2026-07-16 18:24:58 (Crawl-Lock `locked_at`; runId trägt 182458) |
| Endzeit (UTC) | 2026-07-16 18:28:02 (crawlRun gespeichert 18:28:01.858; Telemetrie-Insert 18:28:02.986) |
| **Gesamtdauer** | **183 106 ms (~3 min 03 s)** — echte Wall-Clock (P0-1), `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **145** |
| Fehlgeschlagene Quellen | **0** |
| Neue Dokumente | crawlRun `newRawDocuments=792` (Persist-Operationen), `savedItems=869`; **Netto-Zuwachs `raw_documents` = +29** (5948→5977). Differenz = Upsert-Semantik: dieselben tagesaktuellen Artikel werden je Lauf re-persistiert, echte Neuzeilen sind wenige. |
| Duplikate | 143 (`crawlRun.duplicates`; Telemetrie `sum(duplicate_documents)=143`); zusätzlich `discardedItems=752`, `loadedItems=1764`, `newCandidateItems=1012` |
| Understanding verarbeitet | **66** |
| Understanding zurückgestellt | **19** |
| **Lock-Nutzung** | **ATOMISCH (relational), live gefangen.** `crawl-<pilot-mandats-id>` token `372ef316-e30c-4c6c-918e-c1d4a89e6a67` (18:24:58 → exp 18:39:58, 15-min-TTL); `global-understanding` token `99b2d564-7100-448e-b65f-57cedf469658` (18:26:21 → exp 18:36:21, 10-min-TTL). Beide in `pipeline_locks` (nicht im Blob `main-auth.pipelineLocks`) → nicht der fail-open-Blob-Pfad. Nach Abschluss: `pipeline_locks` = 0 → token-gebundene Freigabe sauber. |
| Fehler in systemErrors | **0 neue** (59 → 59); `crawlRun.errors=[]`; je Quelle `error_code`-Zeilen = 0 |
| Telemetrie-Zeilen | **145** (`run_id=crawl-20260716182458-il02g`), 145× `status=ok`, 0 Fehlercodes; distinct `source_id` = 144 (Katalog-Dublette, siehe §4.1) |
| Quellenlaufzeiten `duration_ms` | **Min 191 · Median 2375 · Ø 2433 · p95 4624 · Max 7048 ms** (145 Quellen). Quellen-Fetch-Fenster 18:24:59.727 – 18:25:20.129 (~20,4 s wall, nebenläufig) |
| Kategorien | offiziell 78 · medien 48 · partei_fraktion 12 · regional 5 · profil 2 = 145; alle `ok` |
| Exec-Ort | `fra1` |

**Bewertung Lauf 1:** ATOMIC_LOCK, UNDERSTANDING_LOCK und SOURCE_TELEMETRY sind an
harten Spuren belegt (relationale Lock-Zeilen mit Token; 145 Telemetrie-Zeilen gegen
0 im Kontroll-Lauf). Sauberer 145-Quellen-Lauf, 0 Fehler, saubere Lock-Freigabe,
keine Doppelverarbeitung (ein Lock-Halter, ein crawlRun, eine Telemetrie-Run-Gruppe,
`processRuns` +1).

### Lauf 2 — Crawl (natürlicher 20:00-UTC-Cron)

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260716200114-v268f` |
| Startzeit (UTC) | 2026-07-16 20:01:14 (Crawl-Lock `locked_at`; Cron feuerte 20:00, Lock-Acquire nach ~74 s Kaltstart/Jitter) |
| Endzeit (UTC) | 2026-07-16 20:04:04 (crawlRun gespeichert; Telemetrie bis 20:04:09) |
| **Gesamtdauer** | **169 572 ms (~2 min 50 s)**, `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **16** ⚠ |
| Fehlgeschlagene Quellen | **129** ⚠ (siehe Betriebsbefund B1) |
| Neue Dokumente | `newRawDocuments=61`, `savedItems=68`; **Netto `raw_documents` = +31** (5977→6008) |
| Duplikate | 5 (`crawlRun.duplicates`); `loadedItems=73`, `discardedItems=0`, Telemetrie `sum(new_documents)=56` |
| Understanding verarbeitet | **18** |
| Understanding zurückgestellt | **20** |
| **Lock-Nutzung** | **ATOMISCH (relational), beide live gefangen.** `crawl-<pilot-mandats-id>` token `bacc4f5b-61f6-4a1b-8fe2-0ecf53283a79` (20:01:14 → 20:16:14); `global-understanding` token `30864d16-c692-48d8-a08b-aa3e5cbac212` (20:02:29 → 20:12:29). **Um 20:03:28 UTC beide gleichzeitig gehalten** (in-run Pipeline↔Understanding-Überlappung, zwei getrennte atomare Locks). Blob nicht genutzt; nach Abschluss `pipeline_locks`=0 → saubere Freigabe. |
| Fehler in systemErrors | **0 neue** (59 → 59) — trotz 129 fehlgeschlagener Quellen (Einordnung: B1) |
| Telemetrie-Zeilen | **145** (`run_id=v268f`), `status ok=16 / not_ok=129`. **Fehlerklassifikation: `http-429` ×47, `timeout` ×81, `http-4xx` ×1, ok(kein Code) ×16.** |
| Quellenlaufzeiten `duration_ms` | Min 24 · Median 7294 · Ø 6803 · Max 14189 ms — **timeoutgetrieben (degradierter Lauf)**; gesunder Pro-Quellen-Baseline bleibt Lauf 1. Fetch-Fenster 20:01:15.534–20:02:17.499 (~62 s). |
| Kategorien (ok/failed) | medien 15/33 · offiziell 1/77 · partei_fraktion 0/12 · regional 0/5 · profil 0/2 |

**Bewertung Lauf 2:** Die **Beobachtbarkeit funktionierte einwandfrei** — atomarer Lock und
Understanding-Lock live gefangen (sogar zeitgleich), 145 Telemetrie-Zeilen inkl. **präziser
Fehlerklassifikation aller 129 Ausfälle**, saubere Lock-Freigabe. Das **Crawl-Ergebnis war
jedoch schwer degradiert** (nur 16/145 Quellen erfolgreich) — externe Google-News-Drosselung,
kein Flag-/Lock-/Telemetrie-Fehler. Details + ehrlicher Ursachen-Caveat: Betriebsbefund B1.

### Lauf 3 — Dedizierter Understanding-Cron (natürlicher 21:30-UTC-Cron)

| Feld | Gemessener Wert |
|---|---|
| runId | `understanding-cron-20260716213006-n3frt` |
| Startzeit (UTC) | 2026-07-16 21:30:06.290 |
| Endzeit (UTC) | 2026-07-16 21:30:07.364 |
| **Gesamtdauer** | **1 074 ms**, `mode=cron`, `status=ok`, `location=fra1` |
| Understanding verarbeitet | **0** |
| Understanding zurückgestellt | **0** |
| **Lock-Nutzung** | Understanding-Cron zieht `global-understanding` (atomar, da beide Flags on). Wegen ~1 s Laufzeit **nicht** live nachgefangen; der atomare `global-understanding`-Lock ist in Lauf 1 UND Lauf 2 live belegt (unveränderte Flags/Codepfad). |
| Fehler in systemErrors | **0 neue** (59 → 59) |
| Neue KOs | 0 (ko_total 337 → 337) |
| Quellenfelder | n/a (kein Crawl → keine `source_crawl_telemetry`, kein `crawl-<pilot-mandats-id>`-Lock) |

**Bewertung Lauf 3 (ehrlich):** Ein **legitim leerer** Lauf — es gab nichts zu verstehen, weil
das **eager**-Understanding des 20:00-Crawls die Warteschlange bereits geleert hatte. Das ist
korrektes idempotentes Verhalten (Cron feuert, findet 0 pending, sauberer processRun), **kein**
Fehler. Die **substanzielle** Understanding-Laufzeit steckt in den eager-Batches:
- Lauf 1 (eager): 57 verarbeitet, innerhalb der 196 645 ms Crawldauer.
- Lauf 2 (eager, `understanding-eager` runId `v268f`): **18 verarbeitet / 20 zurückgestellt in
  92 988 ms** (20:02:29 → 20:04:02; `startedAt` deckt sich exakt mit dem
  `global-understanding`-Lock-`locked_at` 20:02:29 — dieselbe Sperre, die ich in Lauf 2 live gefangen habe).

**Offener Prüfpunkt:** Ob die **20 zurückgestellten** Dokumente aus Lauf 2 von einem späteren
Cron (nächste Chance: 05:30-Understanding-Cron) nachgeholt werden — Test der Zusicherung
„zurückgestellt = idempotent beim nächsten Lauf nachgeholt". Wird im Morgenzyklus geprüft.

### Lauf 4 — Crawl (natürlicher 04:00-UTC-Cron) — zugleich B1-Gegenprobe

| Feld | Gemessener Wert |
|---|---|
| runId | `crawl-20260717040100-mb1k6` |
| Startzeit (UTC) | 2026-07-17 04:01:00 (Crawl-Lock `locked_at`) |
| Endzeit (UTC) | 2026-07-17 04:03:50 (crawlRun gespeichert) |
| **Gesamtdauer** | **170 106 ms (~2 min 50 s)**, `sourceMode=on` |
| Quellenzahl (geprüft) | **145** |
| Erfolgreiche Quellen | **145** ✅ |
| Fehlgeschlagene Quellen | **0** ✅ |
| Neue Dokumente | `newRawDocuments=820`, `savedItems=892`; **Netto `raw_documents` = +61** (6008→6069) |
| Duplikate | 120 (`crawlRun.duplicates`); `loadedItems=1762`, `discardedItems=750`, Telemetrie `sum(new_documents)=880`, `sum(duplicate)=146` |
| Understanding verarbeitet | **50** |
| Understanding zurückgestellt | **32** |
| **Lock-Nutzung** | **ATOMISCH (relational), live gefangen** (04:02:00). `crawl-<pilot-mandats-id>` token `c80be957-1e00-45de-b0a9-578069b4653e` (04:01:00 → 04:16:00). Blob nicht genutzt; nach Abschluss `pipeline_locks`=0 → saubere Freigabe. Eager-Understanding-processRun +1 (5). |
| Fehler in systemErrors | **0 neue** (59 → 59) |
| Telemetrie-Zeilen | **145** (`run_id=mb1k6`), `status ok=145 / not_ok=0`, Fehlercodes: **nur `ok` ×145** |
| Quellenlaufzeiten `duration_ms` | **Min 131 · Median 2397 · Ø 2421 · p95 4397 · Max 7234 ms** (gesund). Fetch-Fenster 04:01:01.713–04:01:21.826 (~20,1 s). |
| Kategorien | offiziell 78 · medien 48 · partei_fraktion 12 · regional 5 · profil 2 = 145, alle `ok`; `googleUrlResolution` 1766/1770 |

**Bewertung Lauf 4:** **Gesunder Crawl, 145/145, 0 Fehler** — und die entscheidende
**B1-Gegenprobe: das Rate-Limiting ist weg.** Nach langer Google-News-Pause (letzter Crawl
20:00) liefen alle 145 Quellen inkl. voller Google-URL-Auflösung (1766/1770) durch. Die
Pro-Quellen-Laufzeiten decken sich fast exakt mit dem gesunden Lauf 1 (Ø 2421 vs. 2433,
Median 2397 vs. 2375). **B1 war sehr wahrscheinlich ein volumeninduzierter Einmaleffekt**
(3 Vollcrawls in ~4 h), kein Dauerproblem. Locks/Telemetrie erneut sauber bestätigt.

### Morgenzyklus (2026-07-17) — Teil 1: 05:00 Morning-Briefing + 05:30 Understanding-Cron

| Lauf | runId | Start–Ende (UTC) | Dauer | processed | deferred | status | Fehler |
|---|---|---|---|---|---|---|---|
| Morning-Briefing (05:00) | `briefing-morning-20260717050045-crk4d` | 05:00:45–05:00:47 | **2 243 ms** | 54 | – | ok | 0 |
| Understanding-Cron (05:30) | `understanding-cron-20260717053016-a5s5f` | 05:30:16–05:30:18 | **1 987 ms** | **0** | **0** | ok | 0 |

`systemErrors` unverändert (59 → 59), keine neuen KOs/Rohdokumente (kein Crawl in diesem Fenster).

**Coverage-Ergebnis (gemessen — KORRIGIERT gegenüber einer ersten, zu optimistischen Lesart):**
Zwei getrennte Ebenen, ehrlich auseinandergehalten:
- **Finding-Extraktion (Rohebene): vollständig.** Alle **6069/6069 `raw_documents` haben
  `finding_count > 0`** (0 ohne Findings); die 434 seit 2026-07-16 und die 61 aus Lauf 4 sind
  abgedeckt. (`cluster_id` ist übrigens für **alle** Rohdokumente NULL — die Spalte ist ungenutzt;
  die Clusterung läuft über einen anderen Mechanismus.)
- **Understanding (Vorgangs-/KO-Ebene): NICHT vollständig — es gibt einen Rückstand.** Gemessen:
  `knowledge_objects.understanding_status` = **292 complete / 50 pending / 2 failed** (344 gesamt).
  Der Vercel-Log des 05:30-Crons belegt, warum „processed 0" **nicht** „nichts pending" heißt:
  `{"processed":0,"pending":48,"deferred":0,"counts":{"skipped-no-cluster":48}}` — **48 pending
  Vorgänge werden als `skipped-no-cluster` übersprungen**, nicht verarbeitet.

**Ehrliche Einordnung (keine Annahme):** Dieser ~52er-Rückstand (50 pending + 2 failed) ist
**stabil und vorbestehend** — schon vor diesem Sprint lag „nicht-complete" bei ~52 (316/264 →
jetzt 344/292). Er ist **nicht** durch die Flags oder diesen Sprint verursacht. Die übersprungenen
Vorgänge tragen überwiegend themenfremd wirkende IDs (`vg-achtelfinale`, `vg-aargauer`,
`vg-parkplätzen`, `vg-seniorenresidenz`) — plausibel korrektes Aussortieren von Rauschen, **aber
das ist nicht bewiesen**. Als eigener Befund **B2** geführt (offener Prüfpunkt, kein Blocker der
Flag-Beweise). Die 2 `failed`-KOs sind genau die Kandidaten für die (deaktivierte) FT2-6-Recovery.

### Morgenzyklus (2026-07-17) — Teil 2: 05:45 Lage-Briefing + 06:00 Health-Report

Beide Crons **direkt aus den Vercel-Runtime-Logs** belegt (sie schreiben keinen processRun):
- **05:45:38 `GET /api/cron/lage-briefing` → 200** [info], dep `dpl_2fki2AnpmMjECxUD8hAVgM4kTWUP`.
- **06:00:16 `GET /api/cron/health-report` → 200** [info], dep `dpl_2fki2AnpmMjECxUD8hAVgM4kTWUP`.

`systemErrors` nach 06:00 unverändert (**59 → 59**), `pipeline_locks` leer.

**B1-Eskalationsprüfung — ERGEBNIS:** Der Watchdog bewertet die Crawl-Gesundheit über den
**jüngsten** Crawl (`getLatestCrawlRun`) gegen `HELMUT_MAX_CRAWL_FAILURE_RATIO` (Default 0.1);
im Code an mehreren Stellen `crawlFailureRatio = failedSources/checkedSources`. Jüngster Crawl
um 06:00 = **Lauf 4 (04:00, 0/145 Fehler, Ratio 0 %)** → Report **grün**, kein Alarm, **0 neue
`systemErrors`** (bestätigt). **Die transiente B1-Degradation (Lauf 2, 89 % Ausfall) wird NICHT
rückwirkend eskaliert**, weil sie sich vor dem Health-Report erholt hat. Ehrliche Doppelseite:
kein Fehlalarm für einen selbst-erholten Ausreißer — **aber** eine schwere, zwischen zwei
(täglichen 06:00-)Reports auftretende und wieder verschwindende Degradation bleibt vom Alarmpfad
**unbemerkt**. Neuer Wert aus diesem Sprint: die jetzt aktive `source_crawl_telemetry` macht genau
solche Ausreißer **nachträglich diagnostizierbar** (145 Zeilen mit `http-429`/`timeout`-Codes) —
dort, wo der Alarmpfad blind ist.

**Morgenzyklus damit vollständig beobachtet:** 05:00 Briefing (ok), 05:30 Understanding (ok, aber
B2-Rückstand), 05:45 Lage-Briefing (200), 06:00 Health-Report (200, grün).

---

## 1a · Betriebsbefunde (echte Production-Ereignisse, ehrlich dokumentiert)

### B1 · Google-News-Rate-Limiting degradiert den 20:00-Crawl (129/145 Quellen ausgefallen)

**Messung (Lauf 2, `v268f`):** 129 von 145 Quellen fehlgeschlagen. Telemetrie-Fehlercodes:
**47× `http-429`** (explizites Rate-Limit), **81× `timeout`** (Google-News antwortete nicht
mehr), **1× `http-4xx`**. `googleUrlResolution` = 0/0 (die Abrufe scheiterten schon an der
RSS-Stufe, vor der URL-Auflösung). Nur 16 Quellen lieferten (medien 15, offiziell 1).

**Ehrlicher Ursachen-Caveat (kein Beweis, aber plausibel und relevant):** Heute liefen **drei
Vollcrawls in ~4 Stunden** — 16:00 Pipeline-Cron, 18:24 **manuell** ausgelöst (Lauf 1), 20:00
Cron (Lauf 2). Der Normalplan sieht ~2 Crawls/Tag vor (04:00/20:00). Das verdreifachte
Google-News-Anfragevolumen in diesem Fenster hat die Drosselung sehr wahrscheinlich
mitausgelöst. Der 04:00-Crawl (Lauf 4) — nach langer Google-News-Pause — ist der ehrliche
Test, ob dies ein volumeninduzierter Einmaleffekt oder ein Dauerproblem ist.

**GEGENPROBE-ERGEBNIS (Lauf 4, `mb1k6`, 04:00 UTC):** **Rate-Limiting weg.** 145/145 Quellen
erfolgreich, 0 Fehler, volle Google-URL-Auflösung (1766/1770), Pro-Quellen-Laufzeiten wie im
gesunden Lauf 1. Damit ist B1 sehr wahrscheinlich **volumeninduziert und transient** (Auslöser:
3 Vollcrawls in ~4 h), **kein Dauerproblem**. **Bleibende Empfehlung (kein Blocker):** Das
Google-News-Klumpenrisiko besteht latent fort — bei erhöhtem Crawl-Volumen (z. B. mehreren
manuellen Läufen) kann es erneut auftreten; die Audit-Minderung (Direkt-RSS statt Google-News)
senkt es dauerhaft. Für den Normalbetrieb (~2 Crawls/Tag, weit gespreizt) ist der Pfad gesund.

**Warum 0 neue `systemErrors`:** Per-Quelle-Fetchfehler (Rate-Limit/Timeout) landen bewusst in
`crawlRun.errors[]` (inhaltsfrei klassifiziert) **und** in `source_crawl_telemetry` (mit
`error_code`) — **nicht** im `systemErrors`-Ring. Dieser Ring ist für Pipeline-/Technikfehler
(`recordPipelineError`), nicht für routinemäßige Einzelquell-Ausfälle; 129 Einträge würden ihn
fluten. Der **Eskalationspfad** für eine solche Crawl-Degradation ist der Health-Report-Watchdog
(Crawl-Failure-Ratio, `HELMUT_MAX_CRAWL_FAILURE_RATIO`). **Ergebnis (Morgenzyklus Teil 2):** Der
Watchdog schaute den **jüngsten** Crawl an (Lauf 4, gesund) und schlug daher **nicht** an — B1
blieb unalarmiert (Details + ehrliche Bewertung siehe Morgenzyklus Teil 2).

**Kein Eingriff:** Regelkonform NICHT verändert (kein Crawl-/Retry-/Zeitplan-Eingriff während der
Beweisläufe). Bekannte Minderungsoption (bereits im Audit): Direkt-RSS-Feeds statt
Google-News-Suchen (`audit/source-coverage.md` — „Google-News-Klumpenrisiko senken").

### B2 · Understanding-Rückstand: ~52 Vorgänge nicht `complete` (`skipped-no-cluster`)

**Messung:** `knowledge_objects.understanding_status` = **292 complete / 50 pending / 2 failed**.
Der 05:30-Understanding-Cron-Log (Vercel): `{"processed":0,"pending":48,"counts":{"skipped-no-cluster":48}}`
— die pending Vorgänge werden als **`skipped-no-cluster`** übersprungen, nicht verarbeitet.

**Ehrliche Einordnung:** Der Rückstand ist **stabil und vorbestehend** (~52 „nicht-complete" schon
vor diesem Sprint: 316/264 → 344/292), also **nicht** durch die Flags/diesen Sprint verursacht. Die
übersprungenen Vorgänge tragen überwiegend themenfremde IDs (`vg-achtelfinale`, `vg-aargauer`,
`vg-parkplätzen`) — **plausibel** korrektes Rauschaussortieren, **aber nicht bewiesen**. Die 2
`failed`-KOs sind die Kandidaten für die (bewusst deaktivierte) **FT2-6**-Recovery
(`HELMUT_FAILED_KO_RECOVERY`). **Kein Blocker der Flag-Beweise.**

**AUFGELÖST — vollständige Analyse in `docs/betrieb/understanding_rueckstand_analyse.md`
(rein lesend, mit Code-Belegen).** Ergebnis: **kein laufender Datenverlust** (alle 4230 Rohdok.
seit 07-04 verarbeitet), aber der eingefrorene Alt-Bestand (02./03.07.) ist **nicht nur Rauschen**:
~**8 kernmandatsrelevante Vorgänge** (Rente/GKV/Steuer/Arbeitsrecht) + 2 `failed` sind blockiert.
Ursache: `skipped-no-cluster` (`understanding.js:788`) vermengt echt-verwaiste und nur
außerhalb-des-500-Zeilen-Fensters liegende Vorgänge; die Seed-Rohdokumente **existieren noch**
(1839 Zeilen), sind aber über Cron/Admin-Recovery unerreichbar. **FT2-6 löst das NICHT** (nur die 2
`failed`); **FT2-7 wirkungslos**. Datenverlust **teilweise, aktuell reversibel**. Korrektur
vorbereitet, **nicht angewendet** (freigabepflichtig). **Kein Eingriff.**

---

## 2 · Aggregierte Quellenlaufzeiten (über alle dokumentierten Crawls)

Getrennt nach gesunden (`status=ok`) und degradierten Läufen — Timeouts würden gesunde
Kennwerte sonst verzerren.

| Crawl (runId) | geprüft | ok | failed | Ø ms | Median ms | Min ms | Max ms | Anmerkung |
|---|---|---|---|---|---|---|---|---|
| `crawl-20260716182458-il02g` (Lauf 1) | 145 | 145 | 0 | 2433 | 2375 | 191 | 7048 | gesund |
| `crawl-20260716200114-v268f` (Lauf 2) | 145 | 16 | 129 | 6803 | 7294 | 24 | 14189 | degradiert (Rate-Limit, B1) |
| `crawl-20260717040100-mb1k6` (Lauf 4) | 145 | 145 | 0 | 2421 | 2397 | 131 | 7234 | gesund (B1-Gegenprobe: erholt) |

**Gesunder Pro-Quellen-Baseline (Läufe 1 & 4, 290 Quellenabrufe):** Ø ~2427 ms · Median ~2386 ms
· Min 131 ms · Max 7234 ms. Der degradierte Lauf 2 (timeoutgetrieben) ist bewusst getrennt
ausgewiesen und fließt nicht in den gesunden Baseline ein.

---

## 3 · Lock-Nachweis (Zusammenfassung)

- **Atomischer Pipeline-Lock (`HELMUT_ATOMIC_LOCK`):** in **Lauf 1, 2 UND 4** live in
  `pipeline_locks` gefangen (`crawl-<pilot-mandats-id>`, mit `token`/`expires_at`), Blob-Pfad nie genutzt,
  jedes Mal saubere Freigabe. **Bewiesen.**
- **Understanding-Lock (`HELMUT_UNDERSTANDING_LOCK`):** in **Lauf 1 & 2** live gefangen
  (`global-understanding`, mit `token`); der dedizierte Understanding-Cron (Lauf 3, 05:30) nutzt
  denselben atomaren Pfad (wegen ~1–2 s Laufzeit nicht erneut live nachgefangen). **Bewiesen.**
- **Pipeline↔Understanding-Überlappung (in-run):** in Lauf 1 UND Lauf 2 **beobachtet** —
  `crawl-<pilot-mandats-id>` und `global-understanding` wurden **gleichzeitig** gehalten (Lauf 2:
  20:03:28 UTC, zwei getrennte atomare Locks mit je eigenem Token). Das belegt: die atomaren
  Locks koexistieren korrekt für unterschiedliche Jobs im selben Lauf. **Beobachtet.**
- **Deny-Pfad (Doppelstart-Abweisung):** ein zweiter Versuch auf **denselben** `job_name`
  während der Haltezeit liefert `acquired=false` (Job übersprungen). Mangels echtem
  konkurrierendem Zweitlauf **noch nicht** ausgeübt. **Offen** — natürlicher Kandidat ist ein
  Cron-Überschneidungsfenster (z. B. wenn der 05:30-Understanding-Cron einen noch laufenden
  Crawl trifft); kein bewusster Doppelstart (verboten).

---

## 4 · Parallele sichere Arbeiten (kein Eingriff in laufende Beweisläufe)

### 4.1 · Katalog-Dublette `<pilot-mandats-id>-news` — geprüft, Bereinigung vorbereitet (NICHT angewendet)

> **Nachtrag 2026-07-17:** Strukturell behoben durch die Mandantenneutralisierung
> (PR #97) — der Code-Seed enthält keine statische Personenquelle mehr, die
> Personenquelle entsteht nur noch dynamisch (genau einmal). Offen bleibt der
> Live-Nachweis am nächsten regulären Crawl (Telemetrie-Zeilen = distinct
> `source_id`) → Restliste **OP-19**. Der folgende Befund gilt für den Stand vor PR #97.

**Befund (gemessen):** In Lauf 1 trägt die Telemetrie 145 Zeilen, aber nur 144 distinct
`source_id`. Ursache: `source_id=<pilot-mandats-id>-news` erscheint zweimal, unter zwei Labels
(„<Voller Name> News-Suche" und „<pilot-mandats-id> News-Suche", beide Kategorie `profil`).

**Ursache im Code (rein lesend ermittelt):**
- `lib/helmut/sources.js:134` — statischer Katalogeintrag `id:"<pilot-mandats-id>-news"`, `name:"<Voller Name> News-Suche"`.
- `lib/helmut/scheduler.js:763` `personNewsSource()` — baut dynamisch `id:` `` `${profile.id}-news` `` = `<pilot-mandats-id>-news`, `name:` `` `${fullName||profile.id} News-Suche` `` → bei fehlendem `fullName` „<pilot-mandats-id> News-Suche".

Beide Wege liefern **dieselbe `source_id`** → dieselbe Google-News-Suche wird pro Crawl
zweimal abgerufen.

**Sicherheitsnachweis (keine Quelle geht verloren):** Es handelt sich um **eine**
logische Quelle (`source_id=<pilot-mandats-id>-news`), doppelt eingereiht. Eine De-Duplizierung
der zusammengesetzten Quellenliste **nach `source_id`** entfernt nur die Doppel-Einreihung;
`<pilot-mandats-id>-news` bleibt genau einmal enthalten. Kein `source_id` verschwindet.

**Warum jetzt NICHT angewendet:** Die Korrektur ist eine **Code-Änderung** (→ Deploy,
ohne Freigabe verboten) und würde die Quellenzahl während der Beweisläufe von 145 auf 144
verschieben (verfälscht den laufenden Nachweis). Daher: **vorbereitet, nicht angewendet.**
Empfohlener Eingriffsort nach dem Sprint (mit Freigabe): De-Dup nach `source_id` bei der
Quellenlisten-Zusammenstellung, ODER den statischen `<pilot-mandats-id>-news`-Katalogeintrag
weglassen, wenn `personNewsSource` dieselbe `id` erzeugt.

### 4.2 · Zweiter Alarmkanal — technische Vorbereitung (nicht aktiviert) ✔ dokumentiert
Vollständige technische Vorbereitung in **`docs/betrieb/zweitkanal-alarm-vorbereitung.md`**:
verifizierter Code-Pfad (`sendMonitoringWebhook` → `buildAlarmPayload`, 8-s-Timeout,
fail-safe, Allowlist+Redaction), exaktes Payload-Schema, gefahrloser Prüfweg
(`GET /api/cron/health-report?dryRun=1`, kein Versand) und die Aktivierungsschritte.
Aktivierung = FT2-5 (Env-Wert setzen) — **verboten ohne Freigabe** und ohne geprüfte
Webhook-URL. Hier nichts aktiviert, Code unverändert.

### 4.3 · Berlin/Brandenburg — strukturelle Vorbereitung (nicht aktiviert) ✔ vorhanden & inert bestätigt
**Befund (rein lesend):** Die strukturelle BE/BB-Vorbereitung existiert bereits als eigene,
ausdrücklich **inerte** Schicht — nichts davon ist verdrahtet oder aktiv:
- `lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten.js` — Quellenkandidaten je
  Pflichtklasse, **nur `prepared`**, „es wird NICHTS aktiviert, kein Abrufweg erzeugt, kein
  Crawl verdrahtet"; geordnete Reifegrad-Skala (`unbesetzt → kandidat → verifiziert → bereit →
  aktiv`). BE/BB stehen auf **`kandidat`**, „NICHT einsatzbereit (kein prepared-Eintrag in Production)".
- `…/seeds/landesmodule-quellen.js`, `…/seeds/landesmodule-verifikation.js` (Sprint-9B-
  Byte-Verifikation), `…/seeds/packages.js` (15 Pflichtklassen).
- Docs: `docs/quellenarchitektur/11-landesmodule-berlin-brandenburg.md`,
  `13-landesmodule-technische-pruefung-und-bundeswege.md`.

**Live-Gegenprobe:** In Lauf 1 und 2 trugen alle 145 Quellen ausschließlich Bundestags-Kategorien
(offiziell/medien/partei_fraktion/regional/profil des Pilotmandats-Profils) — **kein Landtags-/BE/BB-
Abruf aktiv**. Aktivierung wäre freigabepflichtig (nach Bundestagspilot). **Hier nichts verändert.**

### 4.4 · Datenschutz / Aufbewahrung / Löschung — dokumentarische Weiterarbeit
**Gemessener Beleg für den Aufbewahrungsdruck (Audit R11: unbegrenztes Wachstum):** In diesem
Sprint bestätigt durch echte Deltas — `raw_documents` 5948 → 6008 (Lauf 1 +29 netto, Lauf 2 +31
netto) und `knowledge_objects` 323 → 337 über wenige Stunden, ohne jede Löschung. Das untermauert
das bestehende Retention-Konzept (`docs/betrieb/aufbewahrung-loeschung.md`, Datenklassen-Matrix mit
`knowledge_objects` als Art. 9) und die DSFA-Vorprüfung (`docs/recht/datenschutz-folgenabschaetzung-vorpruefung.md`).
**Keine echte Löschung**, `HELMUT_RETENTION_EXECUTE` bleibt aus (nur Trockenlauf möglich); Fristen
weiter gründer-/rechtsfreigabepflichtig. Politische Daten fließen weiterhin nicht in Telemetrie/
Alarmkanäle (Allowlist + Redaction, in Lauf 1/2 real ohne Inhalt/PII).

---

## 5 · Zwischenurteil (Stand 2026-07-17, 06:xx UTC)

**Stopp-Bedingungen erfüllt:** ≥3 echte Crawls dokumentiert (Lauf 1/2/4) · vollständiger
Morgenzyklus (05:00/05:30/05:45/06:00) · Pipeline↔Understanding-Überschneidung beobachtet · alle
Pflicht-Messwerte im Protokoll · klares Zwischenurteil möglich.

### Bewiesen (an echten Production-Messwerten)
1. **Die drei Flags sind im laufenden Code aktiv und werden real ausgeführt:**
   - `HELMUT_ATOMIC_LOCK`: atomarer `crawl-<pilot-mandats-id>`-Lock **live gefangen in Lauf 1, 2 UND 4**
     (relational, mit `token`, `expires_at`), Blob-Pfad nie genutzt, jedes Mal saubere Freigabe.
   - `HELMUT_UNDERSTANDING_LOCK`: `global-understanding`-Lock **live gefangen in Lauf 1 & 2**,
     inkl. **gleichzeitiger** Haltung mit dem Crawl-Lock (in-run Überschneidung, Lauf 2 20:03:28).
   - `HELMUT_SOURCE_TELEMETRY`: **je Crawl 145 Zeilen** geschrieben (0 im Flag-AUS-Kontrolllauf 16:00).
2. **Telemetrie erfasst auch Fehler korrekt:** Der degradierte Lauf 2 hinterließ 145 Zeilen mit
   **präziser Klassifikation** (`http-429` ×47, `timeout` ×81, `http-4xx` ×1) — Beobachtbarkeit
   bewährt sich genau im Störfall.
3. **Laufzeit real gemessen (P0-1):** `durationMs` je Crawl (183106 / 169572 / 170106 ms) und
   **Pro-Quellen-Laufzeiten** (gesunder Baseline Läufe 1+4: Ø ~2427, Median ~2386, Min 131, Max 7234 ms).
4. **Gesunde Vollläufe:** 145/145 Quellen, 0 Fehler in Lauf 1 & 4; der degradierte Lauf 2 wurde
   **sauber** verarbeitet (kein Absturz, saubere Freigabe) und war extern/transient (B1, erholt).
5. **Datensparsamkeit real:** keine Inhalte/PII in Telemetrie/Alarm-Payloads (Allowlist + Redaction).
6. **Robustheit/Ordnung:** über den gesamten Sprint **0 neue `systemErrors`** (59→59); idempotente
   Leerläufe des Understanding-Crons korrekt; Locks nie im Blob, immer sauber freigegeben.

### Offen (ehrlich, nicht bewiesen)
- **Deny-Pfad unter echter Konkurrenz** (zweiter Lauf wird abgewiesen): nicht ausgeübt — es gab
  keinen konkurrierenden Zweitlauf; bewusster Doppelstart ist verboten. Fail-closed ist im Code +
  auf DB-Ebene belegt, der Live-Beweis unter echter Überlappung fehlt.
- **Fehlerfall → `systemErrors` + Recovery:** mangels echter technischer Störung nicht gezeigt
  (künstliche Injektion verboten). Der `recordPipelineError`-Pfad blieb im Sprint unausgelöst.
- **Zweitkanal-Alarmtest:** braucht `HELMUT_MONITORING_WEBHOOK_URL` (FT2-5) — technisch vorbereitet.
- **B1 (latentes Google-News-Klumpenrisiko):** einmal transient aufgetreten (volumeninduziert),
  vollständig erholt; latent fort — Minderung Direkt-RSS bekannt. **Zusatzbefund:** der Alarm-Watchdog
  ist jüngster-Crawl-basiert + täglich → eine zwischen zwei Reports auftretende, selbst-erholte
  Degradation bleibt unalarmiert (Telemetrie macht sie aber nachträglich sichtbar).
- **B2 (Understanding-Rückstand):** ~52 Vorgänge nicht `complete` (50 pending/2 failed,
  `skipped-no-cluster`); **vorbestehend**, nicht flag-verursacht; plausibel Rauschen, aber unbewiesen.
  Follow-up: Stichprobe + Klärung Filter-vs-Lücke. Die 2 `failed` sind FT2-6-Kandidaten.

### Gesamtbewertung (kein Reife-Urteil, keine DSGVO-Konformitätsbehauptung)
Die drei freigeschalteten Funktionen wirken **korrekt, additiv und beobachtbar** — an echten
Läufen belegt, nicht behauptet. Die neue Beobachtbarkeit hat ihren ersten echten Störfall (B1)
präzise sichtbar und diagnostizierbar gemacht. **Aber:** ein „sauberer Beweistag" im vollen Sinn
ist noch **nicht** abgeschlossen — der Deny-Pfad und der echte Fehler-/Recovery-Pfad sind
unbelegt, und B1/B2 sind offene Betriebsbefunde. **Keine Betriebsreife-Behauptung.**

---

## 6 · Offen / nächste Freigaben

- **Erledigt in diesem Sprint:** 3 Crawls (Lauf 1/2/4) · Understanding-Cron (Lauf 3 + 05:30) ·
  vollständiger Morgenzyklus · in-run Pipeline↔Understanding-Überschneidung · B1-Gegenprobe (erholt) ·
  B1-Eskalationsfrage beantwortet (Watchdog jüngster-Crawl-basiert → keine Rückschau).
- **Offen (Beweis, ehrlich):** Deny-Pfad unter echter Konkurrenz; Fehlerfall→`systemErrors` +
  Recovery (ohne künstliche Injektion nicht auslösbar); Zweitkanal-Alarmtest (braucht FT2-5-Webhook-URL);
  B2-Follow-up (Stichprobe der `skipped-no-cluster`-Vorgänge).
- **Nächste Freigabe (konkret):** **FT2-5** — geprüfte `HELMUT_MONITORING_WEBHOOK_URL` liefern, dann
  aktiviere ich kontrolliert und führe den echten Zweitkanal-Zustelltest durch. Danach — nach einem
  vollständig sauberen Beweistag inkl. Deny-/Fehlerpfad — **FT2-6/FT2-7**; **FT2-8** später (nach Pilot + Recht).

---

---

## 7 · Nachtrag Sprint „Google-News-Härtung" (2026-07-17, Branch `claude/helmut-google-news-hardening-975p22`)

> **Redaktioneller Nachtrag (2026-07-17, Doku-Konsolidierung):** (1) Dieser Sprint
> ist inzwischen als **PR #102** nach `main` gemergt (`ca7e404`) — die Formulierung
> „NICHT gemergt/deployt" unten beschreibt den *Branch-Stand zum Schreibzeitpunkt*.
> Ob der Code über den Merge hinaus in Production **deployt** und durch einen echten
> **Production-Beweislauf** bestätigt ist, ist **noch offen** und wird verbindlich in
> `docs/datenmotor-restliste.md` (OP-07, OP-15, OP-19) geführt. (2) „F5–F8" unten =
> **FT2-5…FT2-8** (neues Schema, siehe Restliste §1). (3) Mandantenkennungen sind wie
> im übrigen Protokoll anonymisiert (`<pilot-mandats-id>` / `<demo-mandant>`); die
> Messwerte, runIds und Zähler sind unverändert original.

**Rein lesende Vertiefung von B1 (Production-Telemetrie, nur SELECT):**
- **Provider-Trennung des Schadens jetzt BEWIESEN:** Kreuzung der 145
  Telemetrie-Zeilen von `v268f` mit `retrieval_paths` → **alle 129 Ausfälle
  waren Google-News-Abrufe** (Plan-Wege 45×429/77×timeout/1×4xx; profil-
  dynamische Suchen 2×429/4×timeout); die **3 direkten Quellen liefen 3/3
  fehlerfrei**. 142 der 145 Quellen des Laufs sind Google-News-basiert
  (Katalog: 146 von 163 Wegen `googlenews_search`). Kein anderer Anbieter
  betroffen. Vollanalyse: `docs/betrieb/google_news_drosselung_analyse.md`.
- **Dubletten-Ursache präzisiert (Korrektur zu §4.1):** Der statische
  `sources.js`-Eintrag ist auf aktuellem `main` bereits entfernt (Commit
  `40e130f`). Die live gemessene Dublette (145 Zeilen / 144 distinct in
  il02g/v268f/mb1k6) entsteht aus **id-Kollision** `personNewsSource`
  (bei leerem Profil-`fullName`: Query `"<pilot-mandats-id>"`, Label „<pilot-mandats-id>
  News-Suche") ↔ relationaler Pfad `rp-<pilot-mandats-id>-news` (Query `"<voller Name>"`) —
  unterschiedliche URLs, daher griff die reine URL-Dedup nicht.
- **Neuer Nebenbefund B3 (beobachtet, offen):** Nach Merge #97
  (Mandantenneutralisierung) lief `crawl-20260717073217-sge68` (manuell,
  07:32 UTC) mit nur **139 Quellen** für ein Testmandat `<demo-mandant>`
  (angelegt 17.07.); die 6 profil-dynamischen Suchen des Piloten fehlten.
  Die Referenzzahl „145" ist damit mandats-/profilabhängig; harte Invariante
  künftig: **Zeilenzahl = distinct `source_id`**. Kein Eingriff in diesem
  Sprint — Prüfpunkt für den Betreiber.

**Auf dem Sprint-Branch umgesetzt (implementiert + offline getestet, NICHT
gemergt/deployt — freigabepflichtig):**
1. **Dubletten-Fix:** source_id-Dedup im Quellenplan (Merge + Fallback-Pfad);
   erwartete Quellenzahl 145 → 144 (`scripts/source-dedupe-test.js`).
2. **Google-News-Härtung:** Provider-Trennung, Gate (Parallelität 5, Abstand
   200 ms), Retry mit Backoff/Jitter + Retry-After, Circuit Breaker je Lauf,
   Cooldown nach Degradation, Vollcrawl-Abstands-Schutz, kein HTML-Fallback-
   Zweitrequest; Kill-Switch `HELMUT_GOOGLE_HARDENING=off`
   (`docs/betrieb/google_news_haertung.md`).
3. **Ehrliche Lauf-Zustände:** 7-Zustands-Klassifikation + Provider-Breakdown/
   Fehlercodes/Retries/Cooldown im crawlRun persistiert (compactStore-Whitelist
   erweitert).
4. **Rollierender Health-Report:** 24-h-Fenster/letzte 3 Läufe, 5 Report-
   Zustände — die B1-Lücke (jüngster-Lauf-Blindheit, §Morgenzyklus Teil 2) ist
   damit geschlossen (`docs/betrieb/health_report_rollierend.md`).
5. **F5-Vorbereitung:** Webhook mit stabiler Ereigniskennung, Dedupe,
   begrenztem Retry, Zustellstatus-Persistenz, Meta-Heartbeat; weiterhin
   inaktiv ohne URL (`docs/betrieb/f5_freigabe.md`).

Zusätzlich wurde eine **adversariale Review** (5 unabhängige Perspektiven)
durchgeführt; alle 9 substanziellen Befunde wurden eingearbeitet (Details:
`google_news_haertung.md` §8). Offline-Suite nach Umsetzung: **127/127 Suiten
grün** (inkl. 5 neuer Suiten). Production blieb unangetastet (kein Merge, kein
Deploy, keine Env-/Cron-/Migrationsänderung, F5–F8 aus).

---

## 8 · Beweisläufe der Google-News-Härtung (2026-07-17/18, nach Merge #102)

**Freigabe & Deploy:** Gründer-Freigabe für Merge + Production-Deployment am
17.07.; Merge **#102** (`ca7e404`) um ~14:53 UTC, Deployment
`dpl_AfxS5NvyEVZ6Vp9PkvveeyJDwyzk` READY ~14:53 UTC. Die Härtung lief mit den
dokumentierten Standardwerten (Gate 5 parallel / 200 ms Abstand, Retry 2 mit
Budget 12, Breaker 10/0.6, Cooldown 60 min, Vollcrawl-Abstand 30 min). Der
04:00-Lauf lief bereits auf dem Folge-Deployment `dpl_DqPCykno…` (Merge **#101**,
reiner Doku-Commit des Gründers — Härtungscode unverändert). **Keine manuellen
Vollcrawls während der Beobachtung; F5–F8 blieben aus; keine Env-/Cron-Änderung.**

### 8.1 · Drei natürliche Crawls (alle gemessen, `politicianId=<pilot-mandats-id>`)

| Feld | Lauf H1 (16:00 Pipeline) | Lauf H2 (20:00 Crawl) | Lauf H3 (04:00 Crawl) |
|---|---|---|---|
| runId | `crawl-20260717160028-8jnlr` | `crawl-20260717200131-236sd` | `crawl-20260718040143-hl6ku` |
| Telemetrie-Zeilen / distinct `source_id` | **144 / 144** | **144 / 144** | **144 / 144** |
| `runState` | **gesund** | **gesund** | **gesund** |
| ok / empty / failed | 143 / 1 / **0** | 143 / 1 / **0** | 143 / 1 / **0** |
| 429 / Timeout / circuit-open / sonstige | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Retries (`retriesTotal`) | 0 | 0 | 0 |
| Circuit Breaker (`googleGate`) | zu (141 beobachtet, 0 Drossel-Fehler) | zu (141/0) | zu (141/0) |
| Cooldown | inaktiv | inaktiv | inaktiv |
| Provider-Breakdown | Google 141/141 ok · Direkt 3/3 ok | Google 141/141 ok · Direkt 3/3 ok | Google 141/141 ok · Direkt 3/3 ok |
| Google-URL-Auflösung | 1728/1731 | 1727/1730 | 1728/1731 |
| Quellen-Fetch-Fenster / Ø je Quelle | ~35 s · 1085 ms | ~32 s · 928 ms | ~30 s · 831 ms |
| Gesamtdauer (`durationMs`) | 206 545 ms | 201 408 ms | 184 624 ms |
| systemErrors danach | 59 | 59 | 59 |

**Damit live bewiesen:**
1. **Dublette weg:** Zeilenzahl = distinct `source_id` (144 = 144) in allen drei
   Läufen — die harte Invariante aus §7 hält; erwartete Quellenzahl 144 exakt
   getroffen (Profil des Piloten trug zur Laufzeit wieder einen `fullName`,
   die Personensuche fiel per URL-Dedup mit `rp-…-news` zusammen; die 6
   profil-dynamischen Mandatssuchen liefen wieder mit).
2. **Härtung im Normalbetrieb verhaltensneutral-positiv:** 0 Fehler, 0 Retries,
   Breaker nie geöffnet, kein Cooldown; URL-Auflösung unverändert ~99,8 %;
   `empty`-Status zählt korrekt nicht als Fehler.
3. **Neue Beobachtbarkeit vollständig persistiert:** `runState`,
   Provider-Breakdown, Fehlercodes, Retries, Cooldown- und Gate-Zustand stehen
   in jedem crawlRun (compactStore-Whitelist wirkt).
4. **Laufzeit-Effekt der Taktung:** Fetch-Fenster ~30–35 s (vorher ~20 s),
   Gesamtdauern 185–207 s — unter den Deckeln (Pipeline 280 s, Crawl 300 s);
   Haupttreiber bleibt das Eager-Understanding (94–100 s), nicht das Gate.
5. **Kein einziger neuer `systemError`** über den gesamten Zeitraum (59, jüngster
   Eintrag weiterhin vom 16.07.).

### 8.2 · Morgenzyklus 2026-07-18 (erster rollierender Health-Report)

| Cron (UTC) | Ergebnis |
|---|---|
| 05:00 morning-briefing | 200, `tenants=1 reason=ok` (5 192 ms) |
| 05:30 understanding | 200 — **B2-Bewegung:** `vg-einkommensteuer` wurde natürlich aufgelöst (`saved`, 1 Dokument; der 04:00-Crawl brachte frische passende Rohdokumente). Pending-Rückstand 46, weiter `skipped-no-cluster` (bekannt, OP). |
| 05:45 lage-briefing | 200 |
| 06:00 health-report | 200 — Datenbasis der rollierenden Sicht: 3 gesunde Läufe im 24-h-Fenster → `aktuell-gesund` (per getesteter Klassifikationslogik; der Report-Text selbst wird nicht persistiert). **Kein** neuer `systemError`, insbesondere KEIN „kein Alarmkanal konfiguriert"-Fehlalarm; Webhook-Zustellstatus im Auth-Store leer = Webhook sauber übersprungen (F5 inaktiv, `unconfigured`-Pfad korrekt). |

**Ehrlicher Nebenbefund (vorbestehend, nicht sprint-verursacht):**
`watchdogStates` (Persistenz des Betriebszustands für die „Erholt"-Hysterese,
P1-4/P1-5 des Vorgänger-Sprints) existiert in KEINEM Store — der
`saveWatchdogState`-Write scheitert offenbar seit jeher still (fail-safe
try/catch). Wirkung: nur das „Erholt"-Label der Zustandsklassifikation;
Alarmlogik und rollierende Sicht sind davon unabhängig. Als offener Punkt an
die Restliste übergeben.

### 8.3 · Konsequenz

Alle in der Freigabe geforderten Nachweise sind erbracht: 3 natürliche Crawls
gesund und vollständig instrumentiert, Dublette live weg, Health-Report-Zyklus
sauber, 0 neue Systemfehler, keine manuellen Eingriffe. Der STÖRFALL-Pfad
(Breaker öffnet, Cooldown greift, Retry bei echtem 429) konnte mangels echter
Google-Drosselung im Fenster NICHT live ausgeübt werden — er bleibt durch die
Offline-Suiten (127/127, inkl. Mock-Server-Sturm-Szenarien) belegt und wird
beim nächsten echten Drossel-Ereignis automatisch sichtbar (Telemetrie +
rollierender Report). Betriebsreife-Urteil: siehe Thread-Abschluss des
Härtungs-Sprints (kein pauschales „betriebsreif", Begründung dort).

---

_Stand dieses Abschnitts: 2026-07-18 nach den Härtungs-Beweisläufen (§8).
Befunde: B1 (Ursache belegt, Härtung deployt und in 3 Läufen gesund beobachtet),
B2 (Rückstand, erste natürliche Auflösung `vg-einkommensteuer`), B3 (Quellenzahl
mandatsabhängig; Invariante Zeilen = distinct source_id, live bestätigt),
NEU: stiller `watchdogStates`-Write-Ausfall (vorbestehend, offen)._

---

## 9 · Beweislauf Incident 2026-07-25 „Crawl-Mandantenamplifikation" (IB-0 … IB-5)

> **Achtung Namenskollision:** die Stufen dieses Beweislaufs heißen **`IB-x`**, nicht `Bx`.
> `B1`/`B2`/`B3` sind in diesem Dokument seit §7/§8 mit einer **anderen** Bedeutung belegt
> (Betriebsbefunde). Der ursprüngliche Incident-Entwurf verwendete `B0–B6` und ist
> zurückgezogen — Begründung und Spezifikationslücke:
> [`incident_2026-07-25_crawl_mandantenamplifikation.md`](incident_2026-07-25_crawl_mandantenamplifikation.md)
> §10/§11.

**Gegenstand:** Wirkt die Shared-Path-Deduplizierung (PR #120) in Production, verschwindet die
Falschmeldung „141 von 144 Quellen fehlgeschlagen", werden wieder alle aktiven Mandate
versorgt, und meldet der Health-Report wieder die Wahrheit?

**Methode:** rein beobachtend. Keine manuellen Läufe, keine forcierten Crawls (`force`
deaktiviert den zu beweisenden Schutz — Incident-Dokument §11.2), keine Env-, Flag-, Cron-
oder Datenänderung. Ausschließlich lesende `SELECT`s gegen `ddckuvvpcytqbyfmbvie` und
Vercel-Runtime-Logs.

**Merge:** PR #120 → `main` `9f95d87`, 2026-07-25 10:27 UTC.
**Production-Deployment:** `dpl_146taCPQSupxYfD3Lav1HoiVAHkP` READY 10:27 UTC; abgelöst um
10:33 UTC durch `dpl_4ohE8HRNxYCHuXLPALq8rFw8GReD` (Merge #121, reiner Doku-Commit —
Incident-Code byte-identisch).

### 9.1 · IB-0 — Deploy-Bereitschaft · **bestanden** (2026-07-25 10:46 UTC)

| Prüfung | Ergebnis |
|---|---|
| Production-Deployment auf dem Merge-Commit `READY` | **ja** — `dpl_146taCPQSupxYfD3Lav1HoiVAHkP` (9f95d87), aktuell produktiv `dpl_4ohE8HRNxYCHuXLPALq8rFw8GReD` (045393c) |
| Zählerfelder in der `compactCrawlRunForStore`-Whitelist | **ja** — `circuitOpenSources`, `sharedSkippedSources` (`storage.js:2759–2760`); ohne Whitelist-Eintrag würde `compactStore` sie beim Schreiben strippen |
| Beide Felder in bestehenden Läufen | **`null`** — erwartet: die Alt-Fassung hat sie nie geschrieben. Damit ist `null` → Zahl der eindeutige Beleg, dass ein Lauf **unter dem Fix** gelaufen ist |
| Baseline vor dem Fix dokumentiert | **ja** — Incident-Dokument §11.4 |
| Kein Eingriff erfolgt | **ja** — 0 Writes, 0 manuelle Läufe |

### 9.2 · IB-1 bis IB-5 — Beobachtung der regulären Crons

_Ergebnisse werden hier nach jeder Stufe mit Messwerten eingetragen. Stufenkriterien:
Incident-Dokument §11.3._

| Stufe | Cron (UTC) | Stand |
|---|---|---|
| IB-1 | Pipeline 16:00 | **nicht messbar** — strukturelle Beobachtungslücke, siehe 9.3. Kein Fehlschlag, kein Abbruch |
| IB-2 | Crawl 20:00 | ausstehend — trägt jetzt den Ledger-Nachweis (L-1…L-7) |
| IB-3 | Crawl 04:00 (Folgetag) | ausstehend |
| IB-4 | Health-Report 06:00 | ausstehend |
| IB-5 | Lage-Check 10:00 | ausstehend |

### 9.3 · IB-1 — Pipeline-Cron 16:00 UTC · **nicht messbar** (ausgewertet 16:12 UTC)

**Deployment-Kontrolle vorab.** Der Lauf lief auf `dpl_AuatHn8VSaHt6yrTtimECSgXaoWb`
(Merge **#127**, `9534bc0`) — nicht mehr auf dem Incident-Deployment. Während der
Beobachtungspause sind 32 Commits nach `main` gelaufen (PRs #124–#127:
Quellen-Seed-Einspielung, Backup/Restore, Paketzuweisung). **Gegenprobe:** alle
incident-relevanten Laufzeitdateien sind zwischen `045393c` und `9534bc0`
**byte-identisch** (`google-news-hardening.js`, `crawler.js`, `scheduler.js`,
`crawl-run-state.js`, `rolling-health.js`, `storage.js`, `server.js`, `vercel.json`).
Der Fix läuft unverändert, die Cron-Zeiten sind unverändert — die Beweisstufen bleiben
gültig.

**Gemessen (Mandat 1, `crawl-20260725160020-0x4st`, `annika-klose`):**

| Größe | Wert | Bewertung |
|---|---|---|
| `runState` | `gesund` | L-1 ✓ |
| `checkedSources` / `successfulSources` / `failedSources` | 145 / 145 / 0 | L-1 ✓ |
| `circuitOpenSources` / `sharedSkippedSources` | **0 / 0** (vorher: `null`) | L-1 ✓ · L-5 teilweise ✓ — die Zähler werden geschrieben, der Lauf lief also **unter dem Fix** |
| `googleUrlResolution` | 1 738 / 1 744 aufgelöst | L-1 ✓, Baseline-Niveau |
| `googleGate` | `{open:false, observed:142, breakerFailures:0}` | Breaker nie geöffnet |
| Telemetrie | 145 Zeilen / 145 distinct `source_id`, 143 ok, **0** `error`, **0** `circuit-open` | Invariante Zeilen = distinct `source_id` hält |
| Laufzeit | 203 309 ms | Baseline-Niveau |
| `successful + failed + circuitOpen + skipped` | 145 + 0 + 0 + 0 = 145 = `checkedSources` | **L-4 ✓** für Mandat 1 |

**Warum die Stufe nicht messbar ist.** Mandat 2 (`cem-ince`) **lief** — im Runtime-Log
sind sein Crawl und sein `lazy-understanding` (1 515 ms, 28 Cluster) belegt —, aber sein
Lauf wurde **nie persistiert**. `/api/cron/pipeline` umschließt `runCronForTenants` mit
einem harten `withTimeout` von 280 000 ms (`server.js:846–850`); das Log endet mit
`[cron/pipeline] 280001ms tenants=undefined bounded=true`. In `runSourceCrawl` liegen
`saveCrawlRun` (`scheduler.js:425`) und die Telemetrie-Persistenz (`scheduler.js:495`)
**hinter** dem Eager-Understanding — die Invocation wurde vorher abgeschnitten. Es gibt
daher für Mandat 2 **keine** Zähler: **L-2, L-3, L-6 sind an diesem Lauf nicht
entscheidbar**.

**Warum das kein Fehlschlag ist.** Das Muster ist **vorbestehend und unverändert**: auch
am 23.07. und 24.07. persistierte der 16:00-Cron ausschließlich Mandat 1. Es ist keine
Folge des Fixes.

**Warum die Log-Beweislage nicht ausreicht (ehrliche Abgrenzung).** Im Log erscheinen für
Mandat 2 genau **7** `Crawl failed`-Zeilen, und zwar ausschließlich auf
**profildynamischen, mandantseigenen** Wegen (Themen `Rente/Arbeit/Soziales/Tariftreue/
Bürgergeld`, Region `Salzgitter-Wolfenbüttel`, `cem-ince News-Suche`) — nicht auf den
geteilten. Das ist mit einem wirksamen Ledger gut vereinbar, **beweist ihn aber nicht**:
`circuit-open`-Ergebnisse erzeugen **ebenfalls keine** Log-Zeile. Aus 7 statt 141
sichtbaren Zeilen lässt sich deshalb nicht unterscheiden, ob die 138 geteilten Wege
*übersprungen* oder vom Breaker *abgebrochen* wurden. Der Nachweis wird nicht behauptet,
sondern auf IB-2 verschoben.

**Kostenwächter (§11.5):** 34 abrechenbare LLM-Calls am 25.07. (Grenze 85), **0** Skips,
kein `daily-llm-budget-reached`. Baseline 43–52/Tag. Unauffällig.

**`systemErrors`:** unverändert **65**, jüngster Eintrag weiterhin 2026-07-20 — kein neuer
Fehler.

**Konsequenz:** IB-2 (Crawl-Cron 20:00 UTC) trägt den vollständigen Ledger-Nachweis.
`/api/cron/crawl` ruft `runCronForTenants` **ohne** äußeren `withTimeout` auf
(`server.js:800–803`), sodass alle Mandantenläufe regulär persistiert werden und der
`zeitbudget`-Systemfehler aus Fix D greifen kann.
