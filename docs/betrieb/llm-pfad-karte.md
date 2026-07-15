# LLM-Pfad-Karte — alle produktiven KI-Aufrufpfade (Phase 5, Stand 2026-07-15)

Erstellt durch die unabhängige Tiefenprüfung (PR-83-Stand + Race-Fix-Commits),
anschließend gegen die Folge-Commits aktualisiert (siehe Nachtrag unten).
Zentrale Wahrheit: **Alle** LLM-Calls laufen durch den einzigen Choke-Point
`ai.js requestOpenAI`, der seit dem Race-Fix VOR dem HTTP-Call atomar reserviert
(`storage.reserveLlmCall`; Details `llm-budget-reservierung.md`).

## NACHTRAG (Folge-Commits nach der Kartenerstellung, gleicher Branch)

- **Pfad 8 (Parlaments-Einordnung):** hat jetzt ein Budget-Pre-Gate
  (`canSpendLlmForTenant` inkl. per-Mandant-EUR) + ehrlichen Skip-Log
  (`skipped-parliamentAssessment`); der Fehler-Fallback meldet sich nicht mehr
  als `aiEnabled:true`.
- **Pfad 9 (Büro-Engine V3):** Call-Meta trägt jetzt `politicianId` — Kosten
  sind mandantenzugeordnet, per-Mandant-Budgets sehen die Calls; Budget-
  Ablehnung wird als `budget-denied` gemeldet.
- **Pfad 11 (KO-Backfill):** `bypassBudget` ist wieder wirksam — als expliziter
  `budgetExempt`-Durchstich am Choke-Point (nur dieser Admin-Pfad, POST+CSRF,
  harter 5-€-Deckel bleibt).
- **Pfad 17 (Debug-Reset):** nur noch POST; Antwort weist ehrlich darauf hin,
  dass der atomare Reservierungszähler unberührt bleibt.
- **Verbleibende dokumentierte Restrisiken** (bewusst NICHT jetzt gebaut, durch
  den globalen atomaren Deckel begrenzt): Tenant-EUR-Budget bleibt
  Read-then-Decide (Kosten erst nach dem Call bekannt); `llmUsage`-Log bleibt
  Voll-Upsert (Kosten-/Audit-Verluste unter Parallellast möglich — das BUDGET
  hängt nach der Migration nicht mehr am Log); Understanding-Doppel-Call pro
  Vorgang nur bei aktivem `HELMUT_UNDERSTANDING_LOCK=1` verhindert (im
  F5-Produktionsschritt mitsetzen); Office-Zähler/Lage-Lock nicht atomar (low,
  Deckel begrenzt).

---

Geprüft wurde der aktuelle Arbeitsbaum (HEAD 844c443 = PR 83 + 3 Folge-Commits, insb. Race-Fix d9ff3b4). Zentrale Architektur: ALLE LLM-Calls laufen durch den einzigen Choke-Point ai.js requestOpenAI (ai.js:451-453), der seit d9ff3b4 VOR dem HTTP-Call atomar reserviert (storage.reserveLlmCall, Supabase-RPC helmut_reserve_llm_call; lokal in-Prozess-serialisiert). Damit ist der globale Call-Count-Race im Code behoben — ABER nur, wenn die freigabepflichtige Migration 20260717 eingespielt ist (sonst Fallback auf das alte Read-then-Decide, storage.js:970-983), und die Understanding-Reserve ist per Default 0 (Aushungerungsschutz inaktiv). NICHT von der Reservierung abgedeckt: die per-Mandant-EUR-Budgets (reines Read-then-Decide über dem verlustbehafteten last-write-wins-Log) sowie zwei weiterhin ungegatete Pfade (Parlaments-Einordnung ohne jedes Pre-/Tenant-Gate; Büro-Engine ohne LLM-Gate und ohne Mandanten-Kostenzuordnung).

## LLM-Pfad-Karte (PR-83-Stand, Arbeitsbaum)

| # | Pfad | Einstiegspunkt (Datei:Zeile) | Modell | Calls pro Aktion/Start | Gate | Scope | Logging (recordLlmUsage) | Fehler-/Fallback-Verhalten | Parallelitätsrisiko |
|---|------|------------------------------|--------|------------------------|------|-------|--------------------------|----------------------------|---------------------|
| 1 | Understanding – Eager (Crawl) | scheduler.js:257 runSourceCrawl → understanding.js:719/601/546 | understandingModelName() = gpt-5-mini bzw. Azure-Deployment | 1 Call pro neuem Cluster/Vorgang, Zeitbudget 90 s/Crawl (HELMUT_CRAWL_UNDERSTAND_BUDGET_MS) | canSpendLlm(null) pro Cluster (understanding.js:601) + Choke-Point-Reservierung, callType "understanding" = PRIORISIERT (volles Limit) | global (politicianId null) | ja: callType "understanding" + skipped-understanding-budget/-error/-invalid | Fehler → KO als failed geparkt (kein Retry), skipped-Log; fail-open Default | global-understanding-Lock DEFAULT AUS (storage.js:1041); getExisting→save Read-then-Decide → Doppel-Call pro Vorgang bei überlappenden Läufen möglich |
| 2 | Understanding – Cron pending | server.js:873 /api/cron/understanding (CRON_SECRET) → understanding.js:738 | wie 1 | 1 Call pro pending-Vorgang mit Quellen, Budget 240 s | wie 1 | global | wie 1 | wie 1 | wie 1; zusätzlich parallel zu Eager/Lage-Check möglich |
| 3 | Understanding – im Lage-Check | server.js:790 /api/cron/lage-check + server.js:444 /api/lage/check (manuell, isRecent-Drossel) → scheduler.js:326 foldLageItemsIntoV3 | wie 1 | 1 Call pro neuem Vorgang, Budget 60 s | wie 1 | global | wie 1 | wie 1 | wie 1 |
| 4 | Understanding – Admin-Recovery | server.js:1305 /api/admin/recovery/run-understanding (Admin-Session, POST+CSRF) | wie 1 | wie 2, Budget ≤180 s | wie 1 | global | wie 1 | Lock-Guard vorab (übersprungen bei bestehendem Lock), Selbst-Aufräumen des eigenen Locks | wie 1 |
| 5 | Understanding – Debug | server.js:4809 /api/debug/run-understanding (Debug-Secret) | wie 1 | wie 2, aber OHNE Zeitbudget (budgetMs fehlt) | wie 1 | global | wie 1 | Serverless-Kill möglich, Lock-Release nicht garantiert | wie 1 |
| 6 | Lage-KI (Narrativ) | lage.js:538 generateLageBriefing ← /api/lage/briefing (server.js:460, force nur Admin/Pilot), /api/app/start async fire-and-forget (server.js:330), /api/cron/lage-briefing Prewarm über ALLE Profile (server.js:811) | understandingModelName() (gpt-5-mini) | 1 Call pro Mandant × Berlin-Tag × KO-Set-Änderung (Cache bf-user-lage-tag); Cron: bis N Profile/Tag | canSpendLlmForTenant (lage.js:526, globaler Deckel + EUR-Deckel aus Profil; catch → fail-open) + Choke-Point (NICHT priorisiert) | pro Mandant | ja: callType "lageBriefing", politicianId=userId | KI-Fehler/leer → null → "ai-unavailable", KEIN Fake; Budget → "budget"-Leerzustand | per-User-PipelineLock 90 s ist read-then-write + fail-open → Doppel-Call bei 2 Geräten/Cron parallel; Tenant-EUR-Gate Read-then-Decide |
| 7 | Kommunikationsentwürfe (Büro klassisch) | server.js:660 POST /api/communication/generate → ai.js:139 generateCommunicationDraft | modelName() = gpt-5.5 (HELMUT_TEXT_MODEL) bzw. Azure-Deployment; 400er-Fallback gpt-4.1 (nur OpenAI-direkt) | 1/Request; IP-Limit 18/h; Client-Autobatch bis 6 Calls pro App-Öffnung (client.js:11238, 2 Anlässe × Formate) | canSpendLlmForTenant (ai.js:165) + Choke-Point (nicht priorisiert) | pro Mandant | ja: "communicationDraft" + "skipped-communicationDraft" mit politicianId | Budget/KI-Fehler/leer → ehrlicher Regel-Fallback (aiEnabled:false, degraded, fallbackReason) | Tenant-Gate Read-then-Decide vs. nachlaufendem recordLlmUsage → EUR-Deckel parallel überschreitbar |
| 8 | Parlaments-Einordnung | server.js:938 POST /api/parliament/assess → ai.js:265 assessParliamentaryItem | modelName() (gpt-5.5/Azure) | 1/Klick; IP-Limit 40/h | KEIN Pre-Gate, KEIN Tenant-Budget — nur Choke-Point (nicht priorisiert) | faktisch nur global | ja: "parliamentAssessment" mit politicianId | Fehler (auch Budget-Stopp!) → Regel-Fallback fälschlich als aiEnabled:true | ungegatet ggü. Mandanten-Budget; Race-frei nur global via Reservierung |
| 9 | Büro-Engine V3 (Office) | server.js:430 POST /api/office/generate (Flag HELMUT_V3_OFFICE) → office.js:73/104 | modelName() (Azure gpt-5-mini) | 1 Call pro User × Vorgang × Kanal (15 Kanäle), Cache in office_outputs; max 10/User/Tag | NUR canSpendOfficeOutput (Anzahl, fail-open) + Choke-Point; KEIN canSpendLlm/ForTenant | Zähler pro Nutzer; Kosten NICHT mandantenzugeordnet (meta ohne politicianId → Log profileId null) | ja: "office-output" + vorgangId, aber politicianId=null → für Tenant-Budgets unsichtbar | KI-Fehler → skipped ai-error (kein Fake) | Cache-Check + Zähler Read-then-Decide → Doppel-Call/Limitüberschreitung; fail-open bei DB-Fehler |
| 10 | App-Start | server.js:314 /api/app/start | – | SYNCHRON 0 LLM-Calls (Lage cacheOnly, P1-7); asynchron 1 Lage-Call bei Tages-Cache-Miss; Client stößt danach bis 6 Kommunikationsentwürfe an (Pfad 7) | siehe Pfade 6/7 | siehe 6/7 | siehe 6/7 | Timeout 8 s nur für Karten-Read | fire-and-forget-Narrativ × mehrere Geräte → Doppel-Call (Lock racy) |
| 11 | KO-Enrichment-Backfill (Tags) | server.js:1238 /api/admin/ko-enrichment-backfill (Admin-Rolle; execute/bypass nur POST+CSRF) → ko-enrichment.js:40 → ai.js:1115 | understandingModelName() | bis ~250 Calls/Lauf (Cap 500 Cent à 2 Cent/Call est.), Default Dry-Run | canSpendLlm(null) pro KO (bypassBudget umgeht NUR dieses Pre-Gate) + harter EUR-Cap + Choke-Point (nicht priorisiert) | global | ja: "koTagsBackfill", politicianId null | KI-Fehler → null → KO wird NICHT geschrieben; Evidence-Guard gegen Fake-Tags | bypassBudget seit d9ff3b4 wirkungslos (Choke-Point blockiert trotzdem; bis 500 Skip-Log-Voll-Upserts) |
| 12 | Presentation-Backfill | server.js:860 /api/admin/presentation-backfill (CRON_SECRET, Default Dry-Run, execute=1) + scripts/presentation-backfill.js → presentation-backfill.js:165/90 | understandingModelName() | 1 Call pro Kandidat-KO (bis limit 2000), Abbruch bei Budget | canSpendLlm(null) pro KO + Choke-Point; callType "understanding-backfill" (NICHT priorisiert) | global | ja: "understanding-backfill" | KI-Fehler → failed, weiter; Budget → Rest skipped-budget | seriell; kein eigener Lock — parallel zum Cron-Understanding möglich (Partial-Upsert entschärft) |
| 13 | Staff-Backfill | scripts/staff-backfill.js (CLI) + .github/workflows/staff-backfill-*.yml → staff-backfill.js:307/175 | understandingModelName() | 1 Call pro Kandidat-KO; dryRun Default; Failure-Rate-Abort | canSpendLlm(null) pro KO + Choke-Point; callType "understanding-staff-backfill" (nicht priorisiert) | global | ja | wie 12 | wie 12 |
| 14 | Matching-KI | lib/helmut/matching.js | – | 0 LLM-Calls (deterministischer Feature-Vektor, kein Embedding-API-Call) | – | – | – | – | – |
| 15 | Briefing-Generierung (V3 + Morning-Cron) | buildV3Briefing / briefingContract.js; server.js:683 | – | 0 LLM-Calls (deterministisch; helmutAssessment source=deterministic) | – | – | – | – | – |
| 16 | Latente Alt-Pfade | ai.js:33 enrichBriefingWithAI (1 Call PRO Briefing-Item), ai.js:307 generateHelmutAssessment | modelName() | derzeit 0 (kein produktiver Aufrufer) | KEIN Pre-Gate (nur Choke-Point) | pro Mandant (meta) | ja: refineBriefingItem/helmutAssessment | Fallback je Item bzw. regelbasiert | Reaktivierung = ungegatete Serien-Calls |
| 17 | Sonstige (manuell) | scripts/understanding-live-smoke.js, scripts/understanding-eval.js (echte Calls möglich, manuell); /api/debug/reset-llm-budget (server.js:4879) resettet NUR das Log, nicht den Reservierungszähler | divers | manuell | Choke-Point greift auch hier (gleicher ai.js-Pfad) | global | ja | – | Debug-Reset: Gate/Anzeige divergieren |

**Gate-Konfiguration global:** HELMUT_MAX_LLM_CALLS_PER_DAY (leer/0 = bewusst kein Limit → dann auch KEINE Reservierung, storage.js:945-948; ungültig = Schutzlimit 50 statt Infinity — PR-82-Fix wirksam); HELMUT_LLM_BUDGET_FAIL_CLOSED Default AUS (Storage-/RPC-Fehler = fail-open); HELMUT_LLM_RESERVE_UNDERSTANDING Default 0 (Aushungerungsschutz inaktiv, Zielwerte 100/30 laut docs/freigabepunkte.md:80 noch offen); Migration 20260717 (atomare Reservierung) laut docs/freigabepunkte.md:132 noch Freigabepunkt — bis dahin läuft das Gate in Production NICHT-atomar im Altverhalten.

**Kernbefunde:** (a) Nach PR 82/83 noch ungegatet ggü. Budget-Pre-Gates/Tenant-Budget: Parlaments-Einordnung (server.js:938) und Büro-Engine V3 (office.js:88/104, zusätzlich ohne Mandanten-Kostenzuordnung). (b) Races zwischen Gate-Check und recordLlmUsage bestehen weiter bei: Tenant-EUR-Budget (storage.js:783), Reservierungs-Fallback ohne Migration (storage.js:977), llmUsage-Log-Voll-Upsert (storage.js:567), Office-Zähler/Cache (storage.js:1749, office.js:84), Understanding-Exists-Check ohne aktiven Lock (understanding.js:582), Lage-Lock (lage.js:503). Der globale Call-Count-Race ist am Choke-Point (ai.js:452) korrekt gefixt (offline verifiziert: scripts/llm-reservation-test.js 30 PASS, scripts/kosten-limits-test.js 17 PASS), aber erst nach Migrations- und Env-Freigabe in Production wirksam.
