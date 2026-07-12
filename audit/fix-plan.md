# Fix-Plan — Helmut SaaS-Readiness

**Sprint:** SaaS-Readiness-Audit · **Synthese** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Status:** Analyse abgeschlossen. **Umsetzungssprint 2026-07-12 durchgeführt** — siehe Umsetzungsstand.

## Umsetzungsstand (2026-07-12)

| Item | Status | PR / Ausführung |
|---|---|---|
| **P0-1** `userId` verpflichtend + Tenant-Guard | ✅ **live** | PR #46 (Vorsprint) |
| **P0-2** RLS-Policies (Design + Test + **Production-Migration**) | ✅ **live** (23 Policies aktiv, JWT-Modus AUS → No-Op) | PR #47/#48 + `apply_migration` (Teil 1) |
| **P1-2** Label-Normalisierung Ausschuss/Partei | ✅ **live** | PR #51 (Teil 4) |
| **P1-4** Watchdog toter Pipeline-Marker | ✅ **live** | PR #49 (Teil 2) |
| **P1-5** Watchdog false-green (Briefing-Frische) | ✅ **live** | PR #49 (Teil 2) |
| **P1-6** Radar 200er-Scan-Verlust | ✅ **live** (Scan 500) | PR #52 (Teil 5) |
| **P1-7** Lage-LLM aus App-Start-Kritikpfad | ✅ **live** (cacheOnly) | PR #50 (Teil 3) |
| Watchdog Zwei-Achsen-Zustandsmodell (§4) | ✅ **live** | PR #49 (Teil 2) |
| App-Start: `defer`, immutable-Caching, tasks/notes parallel | ✅ **live** | PR #50 (Teil 3) |
| Radar tote Feldzugriffe (`best_source_type`/`regions`) | ✅ **live** | PR #52 (Teil 5) |
| **P1-1** KO-Anreicherung (tags/policy_field/embedding) | ⏸️ **gestoppt vor Backfill** (Root-Cause lokalisiert: understanding.js extrahiert sie nicht; Fix = Prompt/Schema + Re-Understanding = KI-Kosten) | Freigabepunkt |
| **P1-3** Presentation-Backfill | ⏸️ **gestoppt** (Prod-Writes/KI) | Freigabepunkt |
| **P1-8** Progressive-Shell-Vollumbau (Client) | ⏸️ **zurückgestellt** (braucht Browser-QA; Teil erledigt: defer/parallel) | Folgeschritt |
| **P1-9** Cron-Reihenfolge | ⏸️ **nicht angefasst** (Cron-Änderung = Stop-Bedingung) | Freigabepunkt |
| **P2-6** Radar URL-Pflicht Umfeld/Artikel | ⏸️ offen (kann Sections leeren, QA nötig) | Folgeschritt |
| **P2-8** Radar `published_at` durchgängig | 🟡 teilweise (System A bevorzugt bereits Quellendatum) | Folgeschritt |

**Effekt in Production (live gemessen über `/api/release/public`, das Decisions live rechnet):** sichtbare Entscheidungen des Piloten **1 → 16**, Beleg-Direktlinks **59 → 103**, Beobachtungspunkte **1 → 13** — im Wesentlichen durch die Label-Normalisierung (P1-2) + das erweiterte Scan-Fenster (P1-6). Keine Runtime-Fehler, Score/Struktur-Blocker (Lage-Frische/Live-Flow) unverändert (quellenbasiert, separat).

---

_Ursprünglicher priorisierter Plan (unverändert als Referenz):_

Prioritäten: **P0** kritischer Sicherheits-/Datenisolationsfehler · **P1** Profile verlieren vorhandene relevante Inhalte / Watchdog meldet falsche Zustände / App-Start blockiert · **P2** gezielte Quellen-/Skalierungsverbesserung · **P3** Optimierung ohne unmittelbaren Nutzerschaden.

> Jeder Fix trägt: Problem · belegte Ursache · betroffene Nutzer · Nutzerwirkung · technische Lösung · betroffene Dateien · DB-Wirkung · Migrationsbedarf · Security-Risiko · Rollback · Tests · Abhängigkeiten · Komplexität · Reihenfolge.

---

## P0 — Sicherheit & Mandantentrennung (Vorrang laut Master-Plan)

### P0-1 · `userId` verpflichtend + zentraler `withTenant()`-Wrapper
- **Problem:** V3-Reads liefern bei fehlendem `userId` **alle Mandanten**.
- **Belegte Ursache:** `listMatchingResults({ userId = null })` hängt `user_id=eq.` nur bei truthy `userId` an (storage.js:853-858, selbst verifiziert); gleiches Muster `listDecisions`/`listOfficeOutputsByUser` (storage.js:909/1141). Default `null` = ungefiltert.
- **Betroffene Nutzer:** alle (sobald >1 Mandant).
- **Nutzerwirkung:** ein vergessener `userId` = Cross-Tenant-Leck politischer Daten.
- **Technische Lösung:** `userId` als Pflichtparameter (throw bei fehlend); zentraler `withTenant(userId, fn)`-Wrapper, den alle mandantenbezogenen Reads/Writes durchlaufen.
- **Betroffene Dateien:** `lib/helmut/storage.js` (V3-CRUD), Aufrufer in `server.js`/`lage.js`/`decisions.js`/`office.js`.
- **DB-Wirkung:** keine (nur Query-Bau). **Migrationsbedarf:** nein.
- **Security-Risiko:** senkt es (schließt IDOR-Fläche). **Rollback:** revert Commit (reine App-Logik).
- **Tests:** neue Mandantentrennungs-Suite (Read ohne `userId` → leer/Fehler; Cross-Tenant → 0 Zeilen) — `qa-strategy.md` §3.6.
- **Abhängigkeiten:** keine. **Komplexität:** M. **Reihenfolge:** 1.

### P0-2 · RLS-Policies als Defense-in-Depth
- **Problem:** 24 Tabellen RLS-aktiviert, **0 Policies**; App nutzt Service-Role (umgeht RLS) → kein DB-Netz.
- **Belegte Ursache:** `pg_policies` public = 0 (selbst verifiziert); Advisor `rls_enabled_no_policy` ×24; `Authorization: Bearer serviceRoleKey` (storage.js:1194).
- **Betroffene Nutzer:** alle (Mehrmandanten).
- **Nutzerwirkung:** ein App-Filter-Bug leakt Fremddaten ohne zweite Verteidigungslinie (DSGVO Art. 32/33).
- **Technische Lösung:** RLS-Policies je mandantenbezogener Tabelle (`user_id = current_setting('request.jwt.claims'/'app.user_id')`) **oder** dedizierter DB-Rollen-/Session-Kontext pro Request; Service-Role nur für bewusst mandantenlose Tabellen (`raw_documents`/`knowledge_objects`).
- **Betroffene Dateien:** neue Migration `supabase/migrations/*`, ggf. `storage.js` (Session-Kontext setzen).
- **DB-Wirkung:** **Policies (DDL).** **Migrationsbedarf:** **JA** (nicht in diesem Sprint — Entscheidung/Freigabe Betreiber).
- **Security-Risiko:** senkt es deutlich. **Rollback:** `DROP POLICY` (Policies sind additiv; vorher testen, dass Service-Role-Pfade weiter funktionieren).
- **Tests:** RLS-Suite (anon/authenticated → deny; Cross-Tenant → 0). **Abhängigkeiten:** nach P0-1 (App muss sauber scopen). **Komplexität:** L. **Reihenfolge:** 2.
- **⚠️ Stopp-Punkt:** Migration + Policy-Änderung berühren DB/Security → **erst nach ausdrücklicher Betreiber-Freigabe.**

---

## P1 — Profile verlieren Inhalte / Watchdog falsch / App-Start blockiert

### P1-1 · Knowledge-Object-Anreicherung (tags / policy_field / embedding)
- **Problem:** Themen- und Similarity-Matching feuern faktisch nie → 0 „Sofort reagieren".
- **Belegte Ursache:** `tags` bei allen 217 KOs leer, `embedding` bei allen 217 NULL, `policy_field` leer (selbst gemessen). `matching.js:128` speist KO-`topics` aus `tags`+`policy_field`; `matched_features` über alle 52 decisions: thema **0**. Max Score 47, 0 „Sofort reagieren" (selbst gemessen).
- **Betroffene Nutzer:** **alle** (auch der Pilot).
- **Nutzerwirkung:** kein Vorgang erreicht „Sofort handeln"; Ranking degeneriert; Personalisierung inert.
- **Technische Lösung:** Understanding-Engine muss `tags`/`policy_field` je Vorgang befüllen (Prompt-Extraktion + Save prüfen — **offener Prüfpunkt**, ob Extraktion fehlt oder Save droppt); KO-Embedding erzeugen/persistieren (256-dim, deterministisch — kein KI-Call nötig für den Offline-Ranker, aber für den pgvector-Pfad).
- **Betroffene Dateien:** `lib/helmut/understanding.js`, `understanding-schema.js`, `storage.js` (saveKnowledgeObject), ggf. `matching.js`.
- **DB-Wirkung:** Backfill bestehender KOs (Writes). **Migrationsbedarf:** nein (Spalten existieren). **⚠️** Backfill = Prod-Writes/KI-Kosten → Betreiber-Freigabe.
- **Security-Risiko:** keins. **Rollback:** Felder wieder leeren (idempotenter Backfill).
- **Tests:** Matching-Unit + Testprofil-Fixtures (`qa-strategy.md` §3.1/3.2). **Abhängigkeiten:** keine. **Komplexität:** L. **Reihenfolge:** 3.

### P1-2 · Label-Normalisierung (Ausschuss / Partei)
- **Problem:** harte Identitätstreffer gehen verloren.
- **Belegte Ursache:** `slug()` (matching.js:32) macht nur lowercase/Sonderzeichen; „Ausschuss für Arbeit und Soziales" ≠ „arbeit-und-soziales", „Linke" ≠ „die-linke". Über 52 decisions feuert ausschuss nur 1×, partei 8× (gemessen).
- **Betroffene Nutzer:** alle mit Ausschuss/Partei-Profil.
- **Nutzerwirkung:** fachlich zuständige Vorgänge landen fälschlich in „Ignorieren".
- **Technische Lösung:** Ausschuss-/Partei-Normalisierung (Präfix „Ausschuss für", Artikel „die", Synonym-Mapping) beidseitig (Profil + KO).
- **Betroffene Dateien:** `lib/helmut/matching.js` (+ ggf. `config.js` Synonymtabelle).
- **DB-Wirkung:** keine. **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Matching-Unit (Golden-Cases der Varianten). **Abhängigkeiten:** verstärkt P1-1. **Komplexität:** S-M. **Reihenfolge:** 4.

### P1-3 · Presentation-Backfill ausführen
- **Problem:** 106/162 verstandene KOs ohne vollständige Anzeigefelder → schwächere Darstellung/Nachordnung.
- **Belegte Ursache:** nur 56 complete-KOs haben alle 5 Felder (`display_title` bindend, selbst gemessen); `presentation-backfill.js` Default DRY-RUN, kein Cron, in Prod nie gelaufen.
- **Betroffene Nutzer:** alle. **Nutzerwirkung:** Karten ohne Titel/Kategorie, schlechter lesbar (kein harter Verlust).
- **Technische Lösung:** `backfillPresentationFields({dryRun:false})` einmalig ausführen; danach optional als Wartungs-Cron.
- **Betroffene Dateien:** `lib/helmut/presentation-backfill.js` (Aufruf via bestehendem Endpoint `/api/admin/presentation-backfill?execute=1`).
- **DB-Wirkung:** Writes auf `knowledge_objects.display_*`. **Migrationsbedarf:** nein. **⚠️** Prod-Writes → Betreiber-Freigabe. **KI-Kosten:** prüfen (Backfill kann KI nutzen).
- **Security-Risiko:** keins. **Rollback:** Felder erneut leeren (idempotent). **Tests:** Vorgang-Karten-Contract. **Abhängigkeiten:** keine. **Komplexität:** S. **Reihenfolge:** 5.

### P1-4 · Watchdog-Fehlalarm beheben (toter Pipeline-Marker)
- **Problem:** WhatsApp-Report meldet „Pipeline seit 139h nicht durchgelaufen", obwohl die Pipeline läuft.
- **Belegte Ursache:** `buildHealthReport` liest `getLatestPipelineDebugReport` (server.js:2573/2588/2607); Marker `main-p-cem-ince` zuletzt 2026-07-06 (~139h); `savePipelineDebugReport` hat **null Aufrufer** (storage.js:1783). Crawl frisch 2026-07-12 07:43 (selbst verifiziert).
- **Betroffene Nutzer:** Betreiber (Fehlvertrauen). **Nutzerwirkung:** falscher Rot-Alarm untergräbt Vertrauen; echte Ausfälle gehen im Rauschen unter.
- **Technische Lösung:** Pipeline-Alarm an `crawlRuns[0].createdAt` (lebt) hängen **oder** `savePipelineDebugReport` am Ende von `runSourceCrawl` wieder aufrufen. Profil-/Global-Timestamp-Mismatch vereinheitlichen.
- **Betroffene Dateien:** `server.js` (buildHealthReport ~2588/2607), ggf. `scheduler.js`.
- **DB-Wirkung:** keine (nur Read-Quelle wechseln). **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Watchdog-Zustands-Suite (`qa-strategy.md` §3.5). **Abhängigkeiten:** koppelt an P1-5. **Komplexität:** S. **Reihenfolge:** 6.

### P1-5 · Watchdog false-green beheben (Briefing-Frische)
- **Problem:** Briefing gilt immer als „frisch" → echter „Crawl-läuft-aber-kein-Briefing"-Ausfall würde als gesund gemeldet.
- **Belegte Ursache:** `toBriefingContractV3` setzt `generatedAt = now` bei jedem Read (briefingContract.js:743); alle timestamp-basierten Briefing-Checks (server.js:2586 u.a.) sind damit blind.
- **Betroffene Nutzer:** alle (verdeckter Ausfall). **Nutzerwirkung:** stiller Datenstillstand bleibt unentdeckt.
- **Technische Lösung:** Briefing-Frische über jüngstes `knowledge_objects.created_at`/`understanding_status='complete'` messen (INGEST/OUTPUT-Achsen, `watchdog.md` §4).
- **Betroffene Dateien:** `server.js` (operationalStatus/backendHealth/pilotReadiness/releaseCheck/buildHealthReport).
- **DB-Wirkung:** keine. **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Watchdog-Zustands-Suite (INGEST frisch + OUTPUT tot → VERALTET). **Abhängigkeiten:** mit P1-4. **Komplexität:** M. **Reihenfolge:** 7.

### P1-6 · Radar App-Scan an Archiv angleichen (verlorene Erwähnungen)
- **Problem:** 6 personenbezogene Vorgänge (2 mit Beleg-URL) im App-Radar unsichtbar; kein Fallback.
- **Belegte Ursache:** App-Radar (System A) scannt `limit:200` (server.js:1330); Archiv (System B) 500 (radar.js:242), wird aber vom Client **nie gefetcht** (`radarArchive` nie befüllt, client.js:63/981 — selbst verifiziert). DB: 6 person-KOs jenseits Rang 200, 0 jenseits 500.
- **Betroffene Nutzer:** Profile mit belegten Erwähnungen jenseits des 200-Fensters (wächst mit Bestand).
- **Nutzerwirkung:** echte belegte Erwähnung fehlt in „Über dich" (technisch falscher Leerzustand).
- **Technische Lösung:** App-Radar-Mention-Scan auf ≥500 heben **oder** durch gezielte „KO mit Personennennung des Profils"-Query ersetzen (kein Top-N-`updated_at`-Cut). Recency durchgängig auf `published_at`.
- **Betroffene Dateien:** `server.js:1330`, `lib/helmut/radarState.js`, ggf. `storage.js` (Query).
- **DB-Wirkung:** keine (Read-Query). **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Radar-Regression (person-KO jenseits 200 muss erscheinen). **Abhängigkeiten:** keine. **Komplexität:** M. **Reihenfolge:** 8.

### P1-7 · Lage-LLM aus dem App-Start-Kritikpfad nehmen
- **Problem:** 12s-Timeout kann das komplette Lage-Kartenset verwerfen.
- **Belegte Ursache:** `/api/app/start` umschließt `buildLageBriefing` (Karten **und** KI-Narrativ) mit `withTimeout(…,12000)` (server.js:295); catch nur Log → `lageBriefing` undefined → alle Karten weg (verifiziert).
- **Betroffene Nutzer:** alle bei kaltem Cache. **Nutzerwirkung:** Lage erscheint leer, obwohl Karten deterministisch vorlagen.
- **Technische Lösung:** Karten (deterministisch) sofort aus Cache/KOs liefern; KI-Narrativ **asynchron** nachladen (separater Call/Progressive). Narrativ-Generierung nicht im Start-Kritikpfad.
- **Betroffene Dateien:** `server.js:285-308`, `lib/helmut/lage.js` (Karten/Narrativ entkoppeln).
- **DB-Wirkung:** keine. **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Lage-Regression (Timeout-Simulation → Karten bleiben). **Abhängigkeiten:** koppelt an P1-8. **Komplexität:** M. **Reihenfolge:** 9.

### P1-8 · Progressives App-Rendering (App-Shell sofort)
- **Problem:** Splash bleibt bis alle Daten da sind; kein Zwischenrendering.
- **Belegte Ursache:** `hideStartupSplash()` nur im finalen `render()` (client.js:2984); Cache-First-Sofortrender ist **toter Code** (`loadCachedStartPayload`→null, client.js:660); 2 serielle Boot-Awaits (client.js:376/402); `/api/app/start` bündelt alles.
- **Betroffene Nutzer:** alle (jeder Start). **Nutzerwirkung:** App-Start blockiert die unmittelbare Nutzung.
- **Technische Lösung:** Shell+Navigation aus Profil (klein) sofort rendern; Lage/Radar/Helmut/Büro progressiv nachladen; `activeProfile`/`getTasks`/`getUserNotes` via `Promise.all`; `client.js` `defer`.
- **Betroffene Dateien:** `client.js` (Boot/render), `server.js` (`/api/app/start` ggf. splitten), `index.html`.
- **DB-Wirkung:** keine. **Migrationsbedarf:** nein. **Security-Risiko:** keins. **Rollback:** revert.
- **Tests:** Performance-/App-Start-Budget (`qa-strategy.md` §3.8). **Abhängigkeiten:** mit P1-7. **Komplexität:** L. **Reihenfolge:** 10.

### P1-9 · Cron-Reihenfolge: Understanding vor Morning-Briefing
- **Problem:** Frühbriefing (05:00 UTC) verpasst systematisch noch pending liegende Vorgänge.
- **Belegte Ursache:** morning-briefing 05:00, understanding-cron 05:30 (vercel.json); `buildV3Briefing` liest nur complete-KOs (server.js:1337).
- **Betroffene Nutzer:** alle (Frühversand). **Nutzerwirkung:** frische Vorgänge fehlen im Morgen-Push.
- **Technische Lösung:** Understanding-Cron **vor** morning-briefing legen (z. B. 04:40/05:00 → 05:10), oder morning-briefing nach hinten. Reine Schedule-Änderung.
- **Betroffene Dateien:** `vercel.json` (crons).
- **DB-Wirkung:** keine. **Migrationsbedarf:** nein. **⚠️** Cron-Einstellungen → Betreiber-Entscheidung. **Security-Risiko:** keins. **Rollback:** Schedule revert.
- **Tests:** — (Konfiguration). **Abhängigkeiten:** keine. **Komplexität:** S. **Reihenfolge:** 11.

---

## P2 — Quellenabdeckung & SaaS-Skalierbarkeit

- **P2-1 · Atomare Pipeline-Locks** statt racigem Blob-Lock (`pipeline_locks` via `INSERT … ON CONFLICT`/advisory lock). Ursache: Blob-Lock racig, fail-open (storage.js:522-538). Nutzer: Datenverlust/Doppelkosten bei Concurrency. DB: nutzt vorhandene Tabelle (Writes). Migration: ggf. Constraint. Komplexität: M. Reihenfolge: 12.
- **P2-2 · KI-Budget fail-closed + per-Mandant-Cap** (`HELMUT_MAX_LLM_CALLS_PER_DAY`, `HELMUT_LLM_BUDGET_FAIL_CLOSED=1`, globaler €-Cap, Alerting). Ursache: Default Infinity/fail-open (storage.js:431-514). ⚠️ ENV/Betreiber. Komplexität: S-M. Reihenfolge: 13.
- **P2-3 · Understanding-Lock aktivieren** (`HELMUT_UNDERSTANDING_LOCK=1`) gegen Doppel-Abrechnung; langfristig atomar. Komplexität: S. Reihenfolge: 14.
- **P2-4 · 200-Load-Cap dynamisieren** (Lage + Radar) — skaliert mit Korpus (lage.js:286, server.js:1330). Komplexität: S-M. Reihenfolge: 15.
- **P2-5 · Gezielte Quellenpakete** (siehe `source-coverage.md` §5): (1) Landtage/Landesregierungen (heute **keine** Crawl-Quelle), (2) Politikfeld-Tiefe jenseits Arbeit&Soziales feld-getaggt, (3) Regionales vom SOCIAL-Gate entkoppeln, (4) Partei-Direktfeeds. **Keine** pauschale Massenerweiterung. Dateien: `sources.js`. Komplexität: M. Reihenfolge: 16. **Hinweis:** erst nach P1-1 voll wirksam.
- **P2-6 · Radar-Evidenz vereinheitlichen** — URL-Pflicht auf Umfeld/Artikel/Archiv ausweiten (heute nur mentions, radarState.js:392 vs. 362). Komplexität: S. Reihenfolge: 17.
- **P2-7 · App-Start-Serverzeit** — doppelten KO-Load(200) + doppelten N+1-Quellen-Load zu einer gemeinsamen Ladung + Batch-`IN(...)` (server.js:1330/1422, lage.js:286/320). Komplexität: M. Reihenfolge: 18.
- **P2-8 · Radar-Recency auf `published_at`** statt `updated_at` (verhindert Hochspülen reprozessierter Altvorgänge; radar.js:150). Komplexität: S. Reihenfolge: 19.
- **P2-9 · Profildaten in DB** überführen (`profiles`-Tabelle befüllen; `neutralProfileDefaults`-Problem lösen), damit Mehr-Mandanten überhaupt versorgbar. ⚠️ Prod-Writes. Komplexität: M. Reihenfolge: 20.
- **P2-10 · Demo-Profile aus Prod entfernen** (`james-brown`, `angela-merkel`). ⚠️ Prod-Writes/Datenlöschung → Betreiber-Freigabe. Komplexität: S. Reihenfolge: 21.

---

## P3 — Optimierung / Hygiene (kein unmittelbarer Nutzerschaden)

- **P3-1** · Toten `matching_results`-Persistenzpfad aufräumen **oder** (nur falls pgvector gewollt) mit KO-Embeddings aktivieren; sonst dokumentieren, dass der In-Memory-Ranker die Wahrheit ist.
- **P3-2** · Tote Feldzugriffe beheben: `ko.best_source_type` (radar.js:175, Guard-Input) und `ko.regions` (radarState.js:190) — Spalten existieren nicht.
- **P3-3** · `ko_relations`-Tabelle: nutzen oder als totes Schema entfernen.
- **P3-4** · Asset-Caching: `client.js`/`styles.css` auf `immutable` (URLs sind `?v=<sha>`-versioniert); `client.js` `defer`.
- **P3-5** · DB-Hygiene: `REVOKE EXECUTE` auf `helmut_ensure_profile` (anon/authenticated); `SET search_path` auf beiden Funktionen; `vector`-Extension aus `public`. ⚠️ DB-Änderung → Betreiber-Freigabe.
- **P3-6** · `llm_usage`/`pipeline_locks`-Tabellen nutzen (Observability-Aggregat/Alerting) statt Blob.
- **P3-7** · Self-Service-Provisioning/Onboarding (Produktlücke, kein Sicherheitsproblem).

---

## Ausdrücklich NICHT notwendig

- **Keine** neue Navigation, **kein** Büro V2, **kein** Architektur-Neubau.
- **Keine** blinde Massenerweiterung der Quellen (gezielte Pakete P2-5 genügen).
- **Keine** künstlichen Inhalte, **keine** erfundenen Relationen, **keine** Füllkarten — die Leerzustände sind technisch, nicht durch Füllung zu „lösen".
- **TLS-Verifikation aktivieren:** nicht nötig — ist bereits aktiv (Altaudit-P1 erledigt).
- **Cron-Auth fail-closed machen:** nicht nötig — bereits fail-closed (Altaudit-P1 erledigt).
- **Modellname-Leak schließen:** nicht nötig — bereits behoben (Commit 8791b8a).
- **Client-Supabase-Key entfernen:** nicht nötig — kein Key im Client.
- **pgvector-`matching_results`-Pfad bauen:** nicht nötig für Funktion — der In-Memory-Ranker trägt Lage/Decisions; nur aufräumen (P3-1).
- **Fake-Fallbacks (`fallbackMeetings`/`fallbackDraft`) entfernen:** im V3-Read-Pfad laut Plan bereits zurückgebaut — vor Umsetzung nur verifizieren, nicht blind erneut angehen.

---

## Empfehlung: erster Umsetzungssprint

Laut Master-Plan hat ein kritisches RLS-/Mandantentrennungsproblem Vorrang. Das Audit bestätigt **P0-1 + P0-2** als reale SaaS-Blocker (kein aktiver Einzelpilot-Exploit, aber Defense-in-Depth fehlt).

**Sprint 1 (Sicherheit & Mandantentrennung):** P0-1 (`userId` verpflichtend + `withTenant`) → P0-2 (RLS-Policies, **mit Betreiber-Freigabe für die Migration**) → P2-2 (KI-Budget fail-closed). Rein App-seitig (P0-1) sofort möglich; die Migration (P0-2) ist der einzige DB-Eingriff und braucht Freigabe.

**Danach Sprint 2 (Watchdog-Zustandsmodell):** P1-4 + P1-5 — reine App-Logik, kein DB-Eingriff, sofort testbar.
**Sprint 3 (App-Start):** P1-7 + P1-8.
**Sprint 4 (Profilversorgung):** P1-1 + P1-2 (+ P1-3-Backfill mit Freigabe), dann P2-5-Quellenpakete.

Begründung der Reihenfolge: P0 schützt Daten (Vorrang, aber teils DB-gebunden → Freigabe nötig); der Watchdog (P1-4/5) ist **reine App-Logik ohne DB-Risiko** und stellt sofort Betreiber-Vertrauen her; App-Start (P1-7/8) verbessert die unmittelbare Nutzung ohne Datenrisiko; die Profilversorgung (P1-1/2) ist der größte inhaltliche Hebel, braucht aber Backfill-Freigabe.
