# Datenmotor-Karte — Helmut V3

**Sprint:** SaaS-Readiness-Audit · **Phase 1** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Änderung. Keine Migration. Keine Writes.
**Belegbasis:** `vercel.json`, `server.js` (Cron-Handler), `lib/helmut/scheduler.js`, `understanding.js`, `matching.js`, `decisions.js`, `lazyUnderstanding.js`, `storage.js`, `lage.js`; nicht-destruktive SELECT-Abfragen gegen Produktions-Supabase `ddckuvvpcytqbyfmbvie`.

> **Kernbefund vorab:** Der V3-Datenmotor **läuft heute produktiv** (nicht mehr „0 KOs" wie im V3-Plan vom 06.07.). Ground-Truth-Zählungen (2026-07-12): `raw_documents=4594`, `knowledge_objects=217` (davon `complete=162`, `pending=55`), `decisions=52`, `briefings=3`. Der Crawl ist tagesfrisch (jüngstes Dokument 10:01 UTC). Die zentrale Schwäche liegt **nicht** im Crawl, sondern in der **Verständnis-→-Präsentations-Strecke** und in **Cron-Reihenfolge/Locks**.

---

## 1. Cron-Fahrplan (aus `vercel.json`, UTC → Berlin/CEST = UTC+2)

| UTC | CEST | Pfad | Handler | Kernfunktion | Erzeugt sichtbare Inhalte? |
|---|---|---|---|---|---|
| 04:00 | 06:00 | `/api/cron/crawl` | server.js:587 | `runSourceCrawl` (full) | Wurzel: raw_documents + Kette |
| 05:00 | 07:00 | `/api/cron/morning-briefing` | server.js:592 | `buildV3Briefing` + Push | Ja (flüchtig, nur Push) |
| 05:30 | 07:30 | `/api/cron/understanding` | server.js:717 | `runPendingUnderstandingShadow` | Ja (löst pending-KOs auf) |
| 05:45 | 07:45 | `/api/cron/lage-briefing` | server.js:667 | `buildLageBriefing` (Prewarm) | Ja (persistiert → `briefings`) |
| 06:00 | 08:00 | `/api/cron/health-report` | server.js:627 | `buildHealthReport` + WhatsApp | Nein (Operator-Diagnose) |
| 10:00 | 12:00 | `/api/cron/lage-check` | server.js:646 | `runLageCheck` | Nur bei „changed"-Lage |
| 16:00 | 18:00 | `/api/cron/pipeline` | server.js:610 | `runSourceCrawl` (280 s) | = crawl (dritter Lauf) |
| 20:00 | 22:00 | `/api/cron/crawl` | server.js:587 | `runSourceCrawl` (full) | = crawl |
| 21:30 | 23:30 | `/api/cron/understanding` | server.js:717 | `runPendingUnderstandingShadow` | Ja |

**Kein eigener Cron** für `matching-shadow` oder `decision-shadow` — beide laufen **ausschließlich eingebettet** in `runSourceCrawl` / `foldLageItemsIntoV3` (scheduler.js:216, 220, 280, 281).

---

## 2. Datenmotor-Karte (pro Prozess)

| Prozess | Trigger | Eingabe | Ausgabe → Zieltabelle | Abhängigkeiten | Unabhängig? | Zwingend für Briefings? | Fehlerwirkung | Nutzerwirkung | Maßgeblicher Zeitstempel | Recovery |
|---|---|---|---|---|---|---|---|---|---|---|
| **crawl** `runSourceCrawl` | Cron 04/16/20 UTC | RSS/DIP-Quellen | `raw_documents` (+ Folgekette) | Quellen, `HELMUT_V3_STORE` | Ja (Wurzel) | **JA** — einzige Quelle neuer raw_documents | Lock „already running"; V3-Schritte fail-safe (kein throw) | Ohne Crawl keine neuen Vorgänge | `raw_documents.created_at` (techn.), `published_at` (fachlich) | Lock `crawl-<id>` 15 min TTL (scheduler.js:157), idempotent |
| **lazy-understanding** `runLazyUnderstandingShadow` | in Crawl, pro Cluster, 60 s Budget | Cluster + Profile | pending-KO → `knowledge_objects` (status=pending) | `HELMUT_V3_LAZY_UNDERSTANDING` | Nein | Indirekt (baut pending-Queue) | Gated aus → keine pending-Queue | Keine direkte | — | idempotent, 0 KI |
| **understanding (eager)** `runUnderstandingShadow` | in Crawl, 90 s Budget (scheduler.js:210) | savedItems (Cluster) | KO complete/failed → `knowledge_objects` + `ko_document_links` | `HELMUT_V3_STORE`, KI-Key, Lock | Nein | **JA** — nur `complete`-KOs sind briefingfähig | Budget-Timeout → Rest bleibt pending | Neue Vorgangskarten | `knowledge_objects.created_at` | Rest pending → Understanding-Cron holt nach |
| **understanding-cron** `runPendingUnderstandingShadow` | Cron 05:30/21:30 UTC | `listRecentRawDocuments(500)` + pending | KO complete/failed | wie eager | Ja | Ja (räumt pending-Rückstau) | „no-pending"/„ai-disabled"/„locked" → No-Op | Verspätete Karten | `knowledge_objects.created_at` | 240 s Budget (server.js:724), Rest bleibt pending |
| **matching-shadow** `runMatchingShadow` | in Crawl + fold | Profil, KOs | Profil-Embedding + `matching_results` | **`HELMUT_V3_MATCHING`** (separates Flag) | Nein | **NEIN** (toter Pfad, s. §5) | Gated aus → skipped | Keine | `matching_results.created_at` | fail-safe |
| **decision-shadow** `runDecisionShadow` | in Crawl + fold | Profil, complete-KOs | `decisions` (score/decision/priority) | `HELMUT_V3_STORE`, **nicht** `matching_results` | Nein | **JA** (priorisiert Vorgangskarten) | „no-vorgaenge"/skipped | Priorität der Karten | `decisions.created_at` | eigenes In-Memory-Matching (decisions.js:132), Upsert idempotent |
| **morning-briefing** `buildV3Briefing` | Cron 05:00 UTC | complete-KOs + Quellen | **In-Memory-Contract + Push — KEINE Persistenz** | complete-KOs, on-the-fly Decisions | Ja (nur lesend) | Erzeugt Frühbriefing, aber flüchtig | 60 s Timeout → Leerzustand | Frühbriefing + Push | liest KO-Stempel, schreibt keinen | zustandslos, rechnet jedesmal neu |
| **lage-briefing** `buildLageBriefing` | Cron 05:45 UTC (Prewarm) | complete-KOs, KI-Narrativ | Cache → **`briefings`** (`bf-<user>-lage-<tag>`) | v3StoreReady, KI, Budget, Lock | Ja (pro Profil) | Wärmt „Aktuelle Lage" vor | „generating"/„budget"/„ai-unavailable" → Leerzustand (kein Fake) | „Aktuelle Lage"-Text | `briefings.generated_at` (Berlin-Tag) | generate-if-missing; Lock 90 s (lage.js:442) |
| **lage-check** `runLageCheck` | Cron 10:00 UTC | Subset-Quellen, TopicMemory, KOs | `lageCheck`; bei „changed" → `foldLageItemsIntoV3` | Quellen, Schwelle | Ja | Nur bei starker neuer Lage | 280 s Timeout → status stable | Push „Neue Lage" + ggf. Karten | `lageCheck` + KO-Stempel | idempotent, fail-safe |
| **pipeline** | Cron 16:00 UTC | = crawl | = crawl (280 s) | = crawl | Ja | JA (dritter Crawl) | 280 s Timeout → bounded | wie crawl | wie crawl | wie crawl |
| **health-report** | Cron 06:00 UTC | Status/Zähler | WhatsApp; Fehler → `recordSystemError` | CallMeBot-Keys | Ja (Diagnose) | Nein | Zustellfehler geloggt | nur Operator-WhatsApp | — | reiner Read/Send |

---

## 3. Die geforderten Präzisions-Antworten

**(a) Welche Jobs erzeugen tatsächlich NEUE nutzbare Inhalte?**
- **Vorgangskarten (KOs):** `understanding (eager)` + `understanding-cron` — nur sie erzeugen `knowledge_objects` mit `understanding_status='complete'` (understanding.js:558). Ergänzt durch `decision-shadow` (Priorisierung → `decisions`).
- **Briefings:** `morning-briefing` (`buildV3Briefing`, flüchtig, nur Push) und `lage-briefing` (persistierter „Aktuelle Lage"-Cache → `briefings`).
- **Wurzel:** `crawl`/`pipeline` — ohne sie keine neuen `raw_documents` und damit keine neuen Karten.

**(b) Welche aktualisieren nur Zwischendaten?** `crawl → raw_documents`, `lazy-understanding → pending-KOs`, `matching-shadow → Embedding/matching_results` (Letzteres komplett unbenutzt, §5). Kein direkter Nutzerwert.

**(c) Welche können unabhängig weiterlaufen?** `morning-briefing`, `lage-briefing`, `health-report`, `lage-check`, `understanding-cron` haben eigene Crons und sind read-tolerant. Die Briefing-/Health-Jobs laufen auch bei totem Crawl weiter (dann aus Altbestand). `understanding-cron` braucht existierende pending-KOs.

**(d) Welche blockieren andere (Locks)?**
- `crawl`/`pipeline` teilen den Lock `crawl-<politicianId>` (15 min TTL, scheduler.js:157). Bei Überlappung (04/16/20 UTC) gewinnt der erste; die anderen kehren mit „already running" zurück.
- **`lage-check` ruft `crawlAllSources` OHNE diesen Lock** (scheduler.js:298) → kann **parallel** zum regulären Crawl Quellen ziehen (Kollisionsrisiko).
- `lage-briefing` hat pro Nutzer `lage-briefing-<userId>` (90 s, lage.js:442).
- `understanding` nutzt den globalen `global-understanding`-Lock (understanding.js:596/643) — **inaktiv per Default** (§4).
- **Alle Locks liegen im `helmut_store`-JSON** (`store.pipelineLocks`, storage.js:524-545), **nicht** in der `pipeline_locks`-Tabelle → deshalb `pipeline_locks=0`.

**(e) Wann funktioniert das System teilweise weiter?** Fällt der Crawl aus, laufen Briefings/Lage aus dem Altbestand (217 KOs) weiter. Fällt Understanding (KI/Budget) aus, sammelt der Crawl weiter raw_documents + pending; der Understanding-Cron holt nach (idempotent). Fällt matching-shadow aus: **null Wirkung** (ohnehin ungenutzt). Harte `withTimeout`-Grenzen (280/60/30 s) sorgen dafür, dass jeder Cron **immer** antwortet — Leerzustand statt Hänger (server.js:600/618/655).

**(f) Fachliche vs. technische Zeitstempel.**
- **Technisch (Durchsatz):** `raw_documents.created_at`, `knowledge_objects.created_at`, `decisions.created_at`.
- **Fachlich (Nutzersicht):** `raw_documents.published_at` (Ereignis-Aktualität), `briefings.generated_at` / Berlin-Tag-Key `bf-<user>-lage-<tag>` (lage.js:426), abgeleitete `deadline`/`zeitdruck`. Der Briefing-Slot wird aus **Europe/Berlin** abgeleitet (server.js:1306), die Crons feuern in **UTC** — dieser TZ-Versatz ist fachlich relevant.

---

## 4. Cron-Reihenfolge & Understanding-Lock

**Reihenfolge-Auffälligkeit (P1-Kandidat, belegt):** Das **morning-briefing feuert 05:00 UTC, der Understanding-Cron erst 05:30 UTC**. `buildV3Briefing` liest nur `understanding_status='complete'`-KOs (server.js:1337-1338). Vorgänge, die der 04:00-Crawl wegen des 90-s-Budgets als **pending** liegen ließ, werden erst 05:30 verstanden — also **nach** dem Frühversand. → Der Frühbriefing-Push kann frische, aber noch pending-Vorgänge **systematisch verpassen**. `lage-briefing` (05:45) liegt dagegen korrekt **nach** dem Understanding-Cron.

**Understanding-Lock — verdrahtet, aber inaktiv (Kosten-Risiko):** Die Naht ist vollständig (`defaultDeps().acquireLock → storage.acquireGlobalUnderstandingLock`, understanding.js:486-487), aufgerufen in beiden Runnern (:596/:643). Aber `acquireGlobalUnderstandingLock` ist ein **No-Op, solange `HELMUT_UNDERSTANDING_LOCK` nicht gesetzt ist** — es liefert bedingungslos `{granted:true, active:false}` und schreibt nichts (storage.js:565-575). Konsequenz: Überlappen zwei Understanding-Pässe (z. B. Crawl-eager + `lage-check`-fold, oder ein manueller Lauf), gibt es **keinen echten Schutz gegen doppelte, kostenpflichtige LLM-Calls**.

---

## 5. matching_results / llm_usage / pipeline_locks = 0 — was das wirklich heißt

**`matching_results=0` trotz 217 KOs / 52 decisions:** Drei zusammenwirkende Gründe:
1. `runMatchingShadow` ist hinter dem separaten Flag `HELMUT_V3_MATCHING` gegatet (matching.js:251-262) — offenbar AUS → sofortiges `skipped`.
2. Persistenz hinge an der pgvector-RPC (`saveMatchingResults → v3Upsert("matching_results")`, storage.js:830-851) — wird nie aufgerufen.
3. **Entscheidend:** `matching_results` wird von **niemandem** gelesen, der Briefings/Karten baut. `buildV3Briefing`, `runDecisionShadow` und `buildLageBriefing` machen ihr **eigenes In-Memory-Matching** über `matching.matchProfileToKnowledgeObjects` (decisions.js:132, server.js:1351, lage.js:389/396). → `matching_results` ist ein **toter Persistenzpfad**; die 52 decisions entstehen unabhängig davon.

**`llm_usage=0` heißt NICHT „kein Kosten-Tracking":** `recordLlmUsage` schreibt in das **`helmut_store`-JSON** (`store.llmUsage`, storage.js:406-416), nicht in die dedizierte Tabelle. Jeder Call wird geloggt (ai.js:418/434/449). → Die `llm_usage`-Tabelle ist unbenutzt; das echte Log liegt im Blob. (Gleiches Muster wie `pipeline_locks`.) — **Korrektur zum alten CTO-Audit** („KI-Kosten komplett unüberwacht"): ein Usage-Log existiert, nur in der falschen Ebene und ohne Aggregations-/Alerting-Sicht.

**Understanding = genau 1 LLM-Call pro NEUEM Vorgang:** `understandOneCluster` macht genau einen `deps.requestUnderstanding(...)`-Call pro Cluster/Vorgang (understanding.js:548), übersprungen bei existierendem KO („skipped-exists", :524). **Mandantenlos**: ein globaler Call pro Vorgang, danach 0 KI für alle Nutzer.

---

## 6. DB-Ground-Truth (Prod, 2026-07-12)

| Tabelle | n | älteste `created_at` | neueste `created_at` |
|---|---|---|---|
| raw_documents | 4594 | 2026-07-02 12:23 | **2026-07-12 10:01** |
| knowledge_objects | 217 | 2026-07-02 16:20 | 2026-07-12 07:42 |
| decisions | 52 | 2026-07-12 04:03 | 2026-07-12 07:43 |
| briefings | 3 | 2026-07-12 05:45 | 2026-07-12 05:45 |

- **KO-Status:** `complete=162`, `pending=55`.
- **Präsentations-Lücke (P1, direkt gemessen):** Von 162 `complete`-KOs haben **nur 56 den vollständigen Presentation-Satz** (display_title + display_summary + why_relevant + recommendation + display_category). `display_title` ist die bindende Bedingung (complete_all5 = complete_with_title = 56). → **106 von 162 fertigen Vorgängen (65 %) können mangels Präsentationsfeldern nicht als Lage-Karte erscheinen.** (Details in `profile-coverage.md`/`fix-plan.md`.)
- **Frische-Kaskade:** raw_documents (10:01) → KOs (07:42, ~2,5 h Versatz, konsistent mit 05:30-UTC-Understanding-Cron) → decisions (07:43). **Alle 52 decisions sind von HEUTE** (Upsert `dec-<user>-<ko>`, keine Historie). **Alle 3 briefings exakt 05:45 UTC** = lage-briefing-Prewarm, ein Row je Profil.

---

## 7. Belegte Auffälligkeiten (→ Fix-Plan)

1. **morning-briefing (05:00) vor understanding-cron (05:30)** → Frühbriefing verpasst pending-Vorgänge. (server.js:1337-1338 vs. vercel.json) — **P1-Kandidat**
2. **Understanding-Lock inaktiv per Default** → Risiko doppelter LLM-Kosten. (storage.js:565-575) — **P1/P2 (Kosten)**
3. **`matching_results` toter Pfad** — nie persistiert, nie gelesen; Decisions/Briefings nutzen In-Memory-Matching. — **P3 (Aufräumen/Klarheit)**
4. **`llm_usage`/`pipeline_locks`-Tabellen unbenutzt** — Usage/Locks im Blob; kein Aggregat/Alerting. — **P2 (Observability)**
5. **`lage-check` crawlt ohne `crawl-<id>`-Lock** (scheduler.js:298) → Parallel-Crawl-Kollision. — **P2**
6. **106/162 complete-KOs ohne vollständige Präsentationsfelder** → Karten unsichtbar trotz Verständnis. — **P1**
7. **Vier separate V3-Flags** (`HELMUT_V3_STORE/_MATCHING/_LAZY_UNDERSTANDING` + `HELMUT_UNDERSTANDING_LOCK`) — Fehlkonfiguration legt Teilstränge still, ohne dass ein Briefing hart failt (fail-safe Leerzustand). — **P2 (Betriebssicherheit)**

**VERMUTUNG** (read-only, nicht via ENV verifizierbar): In Prod sind `HELMUT_V3_STORE` + KI **AN** (162 complete-KOs, 52 decisions, 3 briefings belegen den laufenden Motor); `HELMUT_V3_MATCHING` und `HELMUT_UNDERSTANDING_LOCK` **AUS** (konsistent mit `matching_results=0` und der No-Op-Lock-Logik).
