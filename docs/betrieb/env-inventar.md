# Environment-Inventar — vollständige Referenz (Stand 2026-07-15, Folgebranch)

**Zweck (Audit-Blocker):** Der Betrieb hing an einem Bus-Faktor 1 auch auf
Konfigurationsebene — `.env.example` deckte nur ~35 von ~100 im Code gelesenen
Variablen ab. Diese Datei listet **alle** aus dem Code (`server.js`, `api/`,
`lib/helmut/**`, `sw.js`) tatsächlich gelesenen Variablen mit Zweck, Default,
Secret-Status und Pflicht/optional. Automatisch gegen den Code abgeglichen; ein
Regressionstest (`scripts/env-inventar-test.js`) hält die Liste synchron —
inklusive der dynamisch gelesenen Variablen (`envList("…")`, `flagValue("…")`,
`env.NAME`-Parameter).

**Bedienung:** Secrets stehen NUR in Vercel (Project → Settings → Environment
Variables), niemals im Repo. Bei jeder Änderung: hier Ist-Wert des Betreibers
NICHT eintragen (nur Zweck/Default), sondern in den Passwort-Manager. Nach
Neuaufbau des Systems ist diese Liste die Rekonstruktionsgrundlage.
Rotationsdetails je Secret: `docs/betrieb/secret-rotation.md`.

Legende: **S** = Secret (nie loggen/committen) · **P** = Pflicht in Production ·
**O** = optional (Default greift). **Merkmale** (kompakt, wo sinnvoll):
Lesestelle · Umgebung (Prod = nur Vercel Production nötig; alle = Dev/Preview/Prod
gleichbedeutsam) · Fail-Verhalten bei Fehlen/Fehlwert (fail-open = Feature fällt
weg, App läuft; fail-closed = Zugriff/Aktion wird verweigert) · Rotationsbedarf.

## 1. Secrets / Zugang (S)

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `SUPABASE_URL` | P | Supabase-Projekt-URL. Ohne: V3-Store inert, App läuft Blob-los/lokal. | storage.js · alle · fail-open (Prod faktisch datenlos) · Rot: nur bei Projektwechsel |
| `SUPABASE_SERVICE_ROLE_KEY` (auch `SUPABASE_SERVICE_KEY`, `SUPABASE_SECRET_KEY`) | P·S | Service-Role-Key (RLS-Bypass) — der reale DB-Zugang. | storage.js · alle · fail-open (Store inert) · Rot: bei Verdacht, siehe secret-rotation.md |
| `SUPABASE_JWT_SECRET` | O·S | Nur für den (stillgelegten) Tenant-JWT-Modus. Aktuell wirkungslos. → Abschnitt 9 | storage.js · — · wirkungslos · Rot: entfällt (veraltet) |
| `SUPABASE_ANON_KEY` | O·S | Anon-Key für authenticated-Requests (nur JWT-Modus). | storage.js · — · wirkungslos (JWT-Modus aus) · Rot: entfällt |
| `PILOT_SECRET` (auch `HELMUT_PILOT_SECRET`) | P·S | Geteilter Pilot-Zugangscode. **Fail-closed:** auf Vercel ohne diesen Wert kein Zugang. Rotation = Freigabepunkt FA-1 (früher F1; am 2026-07-15 ausgeführt, `/api/pilot/unlock` → HTTP 200 verifiziert). | server.js · Prod · fail-closed · Rot: FA-1 erledigt / sonst bei Verdacht |
| `HELMUT_ADMIN_SECRET` | O·S | Admin-/Debug-Bypass für einzelne Endpunkte; Default = `CRON_SECRET` (empfohlen: SEPARAT setzen, sonst gewährt das Cron-Secret Debug-Vollzugriff). | server.js · Prod · fail-closed (404 ohne Secret) · Rot: bei Verdacht |
| `CRON_SECRET` (GitHub-Secret: `HELMUT_CRON_SECRET`) | P·S | Bearer für alle `/api/cron/*`. **Fail-closed:** ohne → 503. **Doppelpflege:** identischer Wert in Vercel UND als GitHub-Secret `HELMUT_CRON_SECRET` (briefing-watchdog). | server.js · Prod+GitHub · fail-closed · Rot: beide Orte gleichzeitig |
| `OPENAI_API_KEY` | P*·S | OpenAI-Key. *Pflicht nur, wenn Azure NICHT gesetzt. Ohne KI: Regel-Fallbacks. | ai.js · Prod (+GitHub staff-backfill) · fail-open (Regelmotor) · Rot: Provider-Konsole |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_KEY` | P*·S | Azure OpenAI (EU) — hat Vorrang vor OpenAI. Empfohlener Produktionspfad. | ai.js · Prod (+GitHub staff-backfill) · fail-open (Fallback OpenAI/Regeln) · Rot: Azure-Portal |
| `AZURE_OPENAI_DEPLOYMENT` | O | Deployment-Name. Default `gpt-5-mini`. | ai.js · Prod · Default greift · — |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (auch `HELMUT_VAPID_PUBLIC_KEY` / `HELMUT_VAPID_PRIVATE_KEY` / `HELMUT_VAPID_SUBJECT`) | O·S | Web-Push-Schlüssel. Ohne: Push deaktiviert (App läuft). Erzeugung: `scripts/generate-vapid-keys.js`. | push.js · Prod · fail-open (Push aus) · Rot: nur bei Kompromittierung (invalidiert ALLE Push-Abos) |
| `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY` | O·S | WhatsApp-Health-Report an den Betreiber. **Ohne → dieser Kanal wird STILL übersprungen** (siehe Zweitkanal `HELMUT_MONITORING_WEBHOOK_URL`). | server.js · Prod · fail-open (still!) · Rot: CallMeBot-Neuregistrierung |
| `DIP_API_KEY` | O·S | Bundestag-DIP-API (Drucksachen). Ohne: DIP-Feature inaktiv. | dip.js · Prod · fail-open (DIP aus) · Rot: bei Ablauf/Leak |
| `OPENAI_MODEL` | O | Modellname für den direkten OpenAI-Pfad. Default gpt-4.1. | ai.js · alle · Default greift · — |

## 2. Betriebsmodus / Auth (nicht geheim)

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `HELMUT_AUTH_MODE` | O | `accounts` = Konten-Login; sonst Legacy-Pilotgate. | server.js/auth.js · Prod · Default Legacy-Gate · — |
| `HELMUT_PROTECTED_TENANT_IDS` | O | Optionale zusätzliche Schutzliste (Komma-Liste von Mandats-IDs) für die Provisionierung; bestehende, nicht vom Werkzeug angelegte Mandanten sind auch ohne Wert datengetrieben geschützt. | provisioning.js · alle · Default leer (Marker-Schutz greift) · — |
| `HELMUT_TENANT_MODE` | O | Default `pilot`. | server.js · alle · Default greift · — |
| `HELMUT_TENANT_JWT_MODE` | O | **Stillgelegt** (tenantJwtModeEnabled()=false). Ohne Wirkung. → Abschnitt 9 | storage.js · — · wirkungslos · — |
| `HELMUT_PROFILE_DB_MODE` | O | Profile aus mandate_profiles statt Blob (Dual Write). Default aus. | storage.js · alle · Default aus · — |
| `HELMUT_PROFILE_DB_EXCLUSIVE` | O | Stufe E: Profile relational-only, saveProfile schreibt keinen helmut_store-Blob mehr. Setzt `HELMUT_PROFILE_DB_MODE=1` voraus. Default aus. Nur nach verifiziertem Backfill. Rollback = Flag leeren. | storage.js · alle · Default aus (Dual Write) · — |
| `HELMUT_V3_STORE` | O | V3-Relationstabellen nutzen. In Prod = 1. | storage.js · Prod=1 · ohne: V3 inert (fail-open) · — |
| `HELMUT_ADMIN_EMAIL` / `HELMUT_ADMIN_PASSWORD` / `HELMUT_ADMIN_NAME` / `HELMUT_ADMIN_RESET` | O·(S bei Passwort) | Erst-Admin-Seed (nach erstem Start entfernbar). | server.js · Prod (einmalig) · nur beim Seed relevant · nach Nutzung entfernen |
| `HELMUT_ALLOW_QUERY_SECRETS` | O | Query-Secret-Login erlauben. Default false. **In Prod ungesetzt lassen.** | server.js · alle · Default sicher (aus) · — |
| `HELMUT_SESSION_TTL_MS` | O | Session-Laufzeit. Default 30 Tage. | accounts.js · alle · Default greift · — |
| `HELMUT_INVITE_TOKEN_TTL_MS` | O | Gültigkeit des Einladungs-Links (Invite-Token, Umsetzungsnotiz §6). Default 7 Tage. | accounts.js · alle · Default greift · — |
| `HELMUT_RESET_TOKEN_TTL_MS` | O | Gültigkeit des Passwort-Reset-Links. Default 1 Stunde. | accounts.js · alle · Default greift · — |
| `HELMUT_PUBLIC_URL` | O | Basis-URL für öffentliche Zugangs-Links (`/passwort-setzen?token=…`). Default: aus Request-Headern (x-forwarded-host/-proto) abgeleitet. | server.js · alle · Default greift · — |
| `HELMUT_MAIL_FROM` | O | Absender für Invite-/Reset-Mails, sobald ein Mail-Dienst existiert (Domain folgt). Default Platzhalter `Helmut <no-reply@…de>`; Versand derzeit deaktiviert, Interim = Kopierlink im Admin. | invite-mail.js · später · Versand aus (ehrlicher sent=false-Status) · — |
| `HELMUT_CANONICAL_HOST` | O | Default `helmut-pilot.vercel.app`. | server.js · Prod · Default greift · — |
| `NODE_ENV` / `PORT` / `VERCEL` / `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` | (Plattform) | Von Vercel/Node gesetzt. `VERCEL_GIT_COMMIT_SHA` speist die Asset-Versionierung (ASSET_VERSION). | Plattform · automatisch · — · — |

## 3. Kosten / KI-Budget

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | P (empfohlen) | Globales Tageslimit. **Fail-closed:** NUR eine positive ganze Zahl setzt das Limit; fehlend, leer, `0`, negativ oder unparsebar → **Schutzlimit 50 Calls/Tag** (einmalige Log-Warnung). Einen „kein Limit"-Zustand gibt es seit dem Budget-Rollout NICHT mehr — wer mehr braucht, setzt explizit eine hohe Zahl. Production: 100. | storage.js (`llmDailyCallLimit`) · Prod · fail-closed (Schutzlimit 50) · — |
| `HELMUT_LLM_BUDGET_FAIL_CLOSED` | O | Bei Budget-Prüffehler KI verweigern statt erlauben. Default aus (Freigabepunkt FA-6, früher F6). Production: 1. | storage.js · Prod=1 · Default fail-open, mit Flag fail-closed · — |
| `HELMUT_LLM_RESERVE_UNDERSTANDING` | O | Reservierter Understanding-Mindestanteil am Tageslimit (Anzahl Calls). Nicht-Understanding-Pfade reservieren nur bis (Limit − Reserve). Leer/0 = aus; ungültig → 0. Production-Empfehlung: 30 (mit Limit 100, Runbook `llm-budget-reservierung.md`). | storage.js · Prod=30 empfohlen · Leer = Reserve aus (fail-open Richtung Verdrängung) · — |
| `HELMUT_TENANT_LLM_CAP` | O (Freigabepunkt) | Atomarer Kostendeckel JE MANDANT (Scope `tenant:<id>`), zusätzlich zum globalen Deckel. **Default AUS = verhaltensneutral** (reserveLlmCall byte-identisch, nur globaler Scope). 1/true/on = AN. Nutzt die bereits eingespielte Funktion `helmut_reserve_llm_call`; keine neue Migration. Freigabepflichtig, weil ein zu niedriges Limit echte Mandanten drosseln kann. | storage.js (`tenantLlmCapEnabled`/`reserveTenantScope`) · Prod=leer (aus) · Default aus · — |
| `HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY` | O | Uniformes Tageslimit (Anzahl KI-Calls) je Mandant, wenn `HELMUT_TENANT_LLM_CAP` AN ist und für den Mandanten kein Override existiert. Nur positive ganze Zahl; sonst **sicherer Fallback 40**. | storage.js (`tenantDailyCallLimit`) · Prod=leer · fail-safe (Fallback 40) · — |
| `HELMUT_TENANT_LLM_LIMITS` | O | Per-Mandant-Overrides als JSON-Karte (schlagen das uniforme Limit), z. B. `{"tenant-alpha":150,"tenant-beta":30}`. Ungültiges JSON → ignoriert (uniformer Default greift), einmalige Log-Warnung. Keine PII (nur Mandant-IDs + Zahlen). | storage.js (`tenantLlmLimitsMap`) · Prod=leer · Default kein Override · — |
| `HELMUT_UNDERSTANDING_LOCK` | O | Globaler Understanding-Lock gegen Doppelläufe. Default aus. | storage.js · Prod=1 empfohlen · Default aus · — |
| `HELMUT_FAILED_KO_RECOVERY` · `HELMUT_FAILED_KO_MAX_RETRIES` (Default 2) | O | **P1-4, FREIGABEPFLICHTIG, Default AUS.** Begrenzte automatische Wiederholung fehlgeschlagener Wissensobjekte im Understanding-Cron (failed → pending, bis `complete` oder nach `MAX_RETRIES` → `failed-final`, terminal). Schreibt Prod-KOs → nur nach Freigabe. Ohne Flag No-Op. Zähler im Auth-Store (keine Migration). | server.js/ko-recovery.js · Prod nach Freigabe · fail-open (No-Op) · — |
| `HELMUT_UNDERSTANDING_PRIORITY` | O | **P1-3, FREIGABEPFLICHTIG, Default AUS.** Schaltet die Understanding-Priorisierung scharf: bei Budgetdeckel werden die höchstpriorisierten Vorgänge zuerst verstanden (amtlich > hohe Relevanz > Frist > Wichtigkeit > regional > Grenzfall) statt in Ankunftsreihenfolge. Reine, KI-freie Umsortierung. Ohne Flag byte-identische Ankunftsreihenfolge. Verhaltensänderung → Freigabe. | understanding.js · Prod nach Freigabe · Default aus · — |
| `HELMUT_ATOMIC_LOCK` | O | **P0-4, FREIGABEPFLICHTIG, Default AUS.** Schaltet den atomaren, **fail-closed** Pipeline-Lock (Postgres `helmut_acquire_pipeline_lock`, Migration `20260719_pipeline_lock_atomic.sql` — NICHT auf Prod angewendet) statt des blob-basierten, fail-open Alt-Locks. Ohne Flag UND ohne Migration = bisheriges Verhalten byte-identisch. Erst mit BEIDEM: genau eine aktive Instanz, kein Doppel-KI-Call, sichere 05:30-Überlappungs-Koordination (mit `HELMUT_UNDERSTANDING_LOCK=on`). | storage.js · Prod nach Freigabe · Default fail-open (Blob), mit Flag fail-closed (atomar) · — |
| `HELMUT_LLM_PRICE_JSON` | O | Preis-Override für Kostenschätzung. | storage.js · alle · Default-Preise greifen · — |
| `HELMUT_UNDERSTANDING_MODEL` / `HELMUT_TEXT_MODEL` | O | Modell-Override (nur OpenAI-Pfad). Default gpt-5-mini. | ai.js · alle · Default greift · — |
| `HELMUT_OFFICE_DAILY_LIMIT` | O | Büro-Outputs/Tag (V3-Engine). Default 10. | office.js · alle · Default greift · — |
| `HELMUT_MAX_DAILY_INPUTS` | O | Tagesinputs/Mandat. Default 3. | server.js · alle · Default greift · — |

## 4. Quellen / Crawl / PARDOK

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `HELMUT_SOURCE_MODE` | P | off/shadow/**on** (Cutover aktiv). Via helmut-flags.json/Env (dynamisch gelesen über `flagValue`). | flags.js/source-mode.js · Prod=on · Default off (kein Crawl-Cutover!) · — |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | O | Gate/Dispatch off/shadow/on. Beide shadow. Dynamisch über `flagValue`/helmut-flags.json. | flags.js · alle · Default off · — |
| `HELMUT_LANDESMODULE` | O | **Freigabe der Landesmodule je Land, FREIGABEPFLICHTIG, Default LEER = alle gesperrt.** Kommagetrennte Länderliste (heute nur `berlin`/`brandenburg`), z. B. `berlin`. Nur ausdrücklich genannte Länder laufen; unbekannte Werte wirken nicht und es gibt bewusst KEIN Sammel-Schlüsselwort (`alle`/`*` sind wirkungslos, fail-closed). Öffnet ausschließlich das Crawl-Gate — Paketstatus (`prepared`), Wegstatus (`manual`) und die Profil-Referenzzählung bleiben eigenständige Riegel. Leeren = sofortiger Rollback ohne DB-Zugriff. Runbook: `betrieb/berlin-aktivierung.md`. | flags.js/source-mode.js · Prod nach Freigabe · Default leer (alle Landesmodule gesperrt) · — |
| `HELMUT_SOURCE_BLOCKLIST` | O | Kommagetrennte Domains, die als Quelle GESPERRT werden — Betreiber-Schalter, wirkt sofort ohne Deploy (dynamisch gelesen: `envList("HELMUT_SOURCE_BLOCKLIST")`). Leer = keine Zusatzsperren. | sourceSafety.js · Prod (Notfallschalter) · Leer = aus · — |
| `HELMUT_SOURCE_ALLOWLIST` | O | Kommagetrennte Domains, die ZUSÄTZLICH als vertrauenswürdige Quelle erlaubt werden — Betreiber-Schalter ohne Deploy (`envList("HELMUT_SOURCE_ALLOWLIST")`). Leer = nur eingebaute Liste. | sourceSafety.js · Prod (bei Bedarf) · Leer = aus · — |
| `CRAWLER_TIMEOUT_MS` (Default 7000) · `CRAWLER_CONCURRENCY` | O | Crawl-Netzverhalten. | crawler.js · alle · Default greift · — |
| `HELMUT_GOOGLE_HARDENING` | O | **Google-News-Härtung (Sprint 2026-07), Default AN.** Kill-Switch: `off`/`0`/`false` stellt das Alt-Verhalten (ein Pool, keine Google-Drossel) ohne Deploy wieder her. | google-news-hardening.js · Prod · Default an · — |
| `HELMUT_GOOGLE_CONCURRENCY` (Default 5) · `HELMUT_GOOGLE_MIN_SPACING_MS` (Default 200) | O | Google-News-Gate: max. gleichzeitige Google-Quellenabrufe + Mindestabstand zwischen Google-Quellenstarts (ms). Direkte/amtliche Quellen sind NIE betroffen. Ungültige Werte → konservativer Default (fail-closed). | google-news-hardening.js · alle · Default greift · — |
| `HELMUT_GOOGLE_RETRY_MAX` (Default 2) · `HELMUT_GOOGLE_RETRY_BASE_MS` (Default 1000) · `HELMUT_GOOGLE_RETRY_CAP_MS` (Default 8000) · `HELMUT_GOOGLE_RETRY_AFTER_CAP_MS` (Default 15000) | O | Retry-Regeln für Google-Feeds: max. Wiederholungen bei 429/5xx (exponentieller Backoff + Jitter, Retry-After-Header respektiert und gedeckelt). Timeouts werden bewusst NICHT wiederholt. | google-news-hardening.js/crawler.js · alle · Default greift · — |
| `HELMUT_GOOGLE_BREAKER_MIN_OBSERVATIONS` (Default 10) · `HELMUT_GOOGLE_BREAKER_FAILURE_RATIO` (Default 0.6) | O | Circuit Breaker je Lauf: ab N beobachteten Google-VERSUCHEN mit ≥ Ratio Drossel-Fehlern (429/Timeout/5xx) enden restliche Google-Abrufe sofort (`circuit-open`). Fehlversuche zählen je Versuch (schnelle Öffnung im Sturm). | google-news-hardening.js · alle · Default greift · — |
| `HELMUT_GOOGLE_RETRY_BUDGET` (Default 12) · `HELMUT_GOOGLE_BREAKER_MEMORY_MS` (Default 600000) | O | Harte Retry-Obergrenze JE LAUF (Backoff-Schlafzeiten halten Gate-Slots — das Budget schützt das Serverless-Zeitlimit bei Teil-Drosselung) und Breaker-Gedächtnis: nach einer Breaker-Öffnung starten Folge-Läufe im selben Prozess (sequenzieller Mandanten-Loop) direkt fail-fast. 0 = aus. | google-news-hardening.js/scheduler.js · alle · Default greift · — |
| `HELMUT_GOOGLE_COOLDOWN_MS` (Default 3600000) · `HELMUT_FULL_CRAWL_MIN_SPACING_MS` (Default 1800000) | O | Cooldown: nach stark degradiertem Lauf fährt der nächste Vollcrawl Google reduziert (nur Primär-Feed, keine URL-Auflösung); ein Vollcrawl < Mindestabstand nach dem letzten überspringt den Google-Anteil ganz (Schutz vor eng aufeinanderfolgenden manuellen Vollcrawls). | google-news-hardening.js/scheduler.js · alle · Default greift · — |
| `HELMUT_RUNSTATE_PARTIAL_RATIO` (Default 0.1) · `HELMUT_RUNSTATE_HEAVY_RATIO` (Default 0.5) | O | Schwellen der Crawl-Lauf-Klassifikation (teilweise-/stark-degradiert). Empfehlung, keine endgültige Produktentscheidung — siehe `docs/betrieb/google_news_haertung.md`. | crawl-run-state.js · alle · Default greift · — |
| `HELMUT_RUNSTATE_MIN_ATTEMPTED` (Default 10) | O | Mindestzahl tatsächlich VERSUCHTER Abrufwege, ab der eine Fehlerquote als Lauf-Bewertung gilt. Greift nur bei bewusst reduzierten Läufen (übersprungene Wege > 0): aus einem winzigen Restanteil darf keine Degradation extrapoliert werden (Incident 2026-07-25). | crawl-run-state.js · alle · Default greift · — |
| `HELMUT_SHARED_PATH_DEDUP` (Default on) · `HELMUT_SHARED_PATH_WINDOW_MS` (Default 900000) | O | Geteilte Google-News-Abrufwege werden je Cron-Durchlauf nur EINMAL geholt (alle Mandate laufen sequenziell im selben Prozess hinter derselben Egress-IP; ~138 von 144 Wegen sind mandantenunabhängig identisch). Verhindert die selbst verursachte Drosselung, die Folge-Mandate als „141/144 Fehler" erscheinen ließ (Incident 2026-07-25). Kill-Switch: `off` stellt das Alt-Verhalten her. | google-news-hardening.js/crawler.js/scheduler.js · alle · Default greift · — |
| `HELMUT_WATCHDOG_LAGE_FRESH_MS` (Default 93600000 = 26 h) | O | Frischeschwelle der Watchdog-Lage-Achse, am CRON-TAKT gemessen (Lage-Cron `0 10 * * *` = 1×/Tag, Health-Report `0 6 * * *`). Die In-App-Schwelle `HELMUT_MAX_LAGE_CHECK_AGE_MS` (4 h) bleibt unverändert. Vorher erzeugte die 4-h-Schwelle gegen den 24-h-Takt jeden Morgen den Fehlalarm „Lage-Check veraltet" (Incident 2026-07-25). | server.js/watchdog-state.js · alle · Default greift · — |
| `HELMUT_CRAWL_MAX_RESPONSE_BYTES` | O | Standard-Crawl-Bytelimit. Default 10 MiB. | crawler.js · alle · Default greift · — |
| `HELMUT_PARDOK_MAX_RESPONSE_BYTES` (Default 64 MiB) · `HELMUT_PARDOK_MAX_RECORDS` (Default 800) | O | PARDOK-Streaming-Budget (Audit-Fix Sprint 7). | pardok-parser.js · alle · Default greift · — |
| `HELMUT_SOURCE_TARGET` / `HELMUT_SOURCE_CURATION` | O | Katalog-Kuratierung (Alt-Katalog-Pfad). | crawler.js · alle · Default greift · — |
| `HELMUT_GOOGLE_NEWS_MAX_ITEMS` · `HELMUT_DIRECT_RSS_MAX_ITEMS` · `HELMUT_PERSON_NEWS_MAX_ITEMS` · `HELMUT_PROFILE_NEWS_MAX_ITEMS` · `HELMUT_TOPIC_RADAR_MAX_ITEMS` | O | Item-Caps je Quellart. | crawler.js · alle · Default greift · — |
| `HELMUT_CRAWL_MAX_CANDIDATES` · `HELMUT_CRAWL_LAZY_BUDGET_MS` · `HELMUT_CRAWL_UNDERSTAND_BUDGET_MS` · `HELMUT_UNDERSTAND_BUDGET_MS` · `HELMUT_LAGE_UNDERSTAND_BUDGET_MS` | O | Zeit-/Mengenbudgets der Pipeline. | scheduler.js/understanding.js · alle · Default greift · — |
| `DIP_WAHLPERIODE` (Default 21) · `HELMUT_DIP_PRIMARY` · `DIP_CACHE_MS` | O | DIP-Verhalten. | dip.js · alle · Default greift · — |
| `AUTO_REFRESH_ON_READ` | O | Lazy-Refresh beim Lesen. | server.js · alle · Default greift · — |
| `HELMUT_MANUAL_RUN_MIN_INTERVAL_MS` | O | Drossel für manuelle Läufe. | server.js · alle · Default greift · — |

## 5. Lage / Radar / Darstellung

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `HELMUT_KO_SCAN_LIMIT` | O | KO-Scan-Fenster. Default 500. | storage.js · alle · Default greift · — |
| `HELMUT_LAGE_MAX_VORGAENGE` · `HELMUT_LAGE_DEMO` · `HELMUT_LAGE_CHECK_*` · `HELMUT_LAGE_CHECK_SOURCE_LIMIT` | O | Lage-/Lage-Check-Verhalten (Demo default aus). | lage.js · alle · Default greift · — |
| `HELMUT_SCORING_MODE` | O | Ebenen-bewusstes Ranking + gap/stale/quiet. Default off. Dynamisch gelesen (`env.HELMUT_SCORING_MODE`). | scoring.js · alle · Default off · — |
| `HELMUT_V3_MATCHING` / `HELMUT_MATCHING_DIM` / `HELMUT_V3_LAZY_UNDERSTANDING` / `HELMUT_V3_OFFICE` / `HELMUT_V3_SHADOW_COMPARE` | O | V3-Subsysteme, Default aus (`HELMUT_V3_SHADOW_COMPARE` dynamisch gelesen). | storage.js/office.js/supply-shadow-compare.js · alle · Default aus · — |
| `HELMUT_FRESH_STALE_HOURS` · `RADAR_DYNAMICS_FRESH_DAYS` · `HELMUT_TOP_TOPIC_COOLDOWN_HOURS` · `HELMUT_DECISION_LABEL_MAX` · `HELMUT_RAWDOC_SUMMARY_MAX` (Default 240) | O | Frische-/Anzeigeparameter. | radarState.js/storage.js · alle · Default greift · — |
| `HELMUT_REVIEW_FIXTURE` | O | **Gefährlich in Prod:** liefert fiktive Abnahmedaten. MUSS in Production ungesetzt sein. | reviewFixture.js · nur Dev · Default sicher (aus) · — |

## 6. Watchdog / Betrieb / Store

| Variable | P/O | Zweck / Default | Merkmale |
|---|---|---|---|
| `HELMUT_MIN_CHECKED_SOURCES` · `HELMUT_MIN_SUCCESSFUL_SOURCES` · `HELMUT_MIN_CONFIGURED_SOURCES` · `HELMUT_MIN_LAGE_CHECK_SOURCES` | O | Quellenabdeckung-/Watchdog-Schwellen. **P2-5:** Defaults auf die relationale Architektur kalibriert (120/110/120/75; gesunder Ist-Crawl ~145), zentral in `lib/helmut/source-coverage.js`. | server.js · alle · Default greift · — |
| `HELMUT_MAX_CRAWL_FAILURE_RATIO` · `HELMUT_MAX_FULL_CRAWL_AGE_MS` · `HELMUT_MAX_LAGE_CHECK_AGE_MS` · `HELMUT_MAX_OUTPUT_FRESHNESS_MS` | O | Frische-/Fehler-Grenzen des Watchdogs. | server.js · alle · Default greift · — |
| `HELMUT_STORAGE_BACKEND` · `HELMUT_SUPABASE_STORE_ID` (Default `main`) · `HELMUT_SUPABASE_AUTH_STORE_ID` · `HELMUT_STORE_CACHE_MS` · `HELMUT_SUPABASE_TIMEOUT_MS` | O | Store-Backend/Caching. | storage.js · alle · Default greift · — |
| `HELMUT_BLOB_RETRY_MAX` (Default 2) · `HELMUT_BLOB_RETRY_BASE_MS` (Default 250) | O | **P0-5 Stufe 1.** Begrenzter Retry mit exponentiellem Backoff für Blob-Reads/Writes bei transienten Fehlern (Timeout/5xx/Verbindung; 4xx werden nicht geretryt). Nach erschöpften Versuchen: ein technischer `systemError` (kein stiller Lauf-Verlust). Feste Obergrenze — keine Endlosschleife. | storage.js · alle · Default greift · — |
| `HELMUT_CRAWL_RUN_RETENTION` (Default 20) | O | **P0-5 Stufe 1.** Aufbewahrte Crawl-Läufe im Blob (an `saveCrawlRun` angeglichen, non-lossy). Die eigentliche Blob-Entlastung liefert Stufe 2 (Crawl-Läufe relational, freigabepflichtig). | storage.js · alle · Default greift · — |
| `HELMUT_CRAWL_RUNS_RELATIONAL` | O | **P0-5 Stufe 2, FREIGABEPFLICHTIG, Default AUS.** Dual-Write der Crawl-Läufe in die relationale Tabelle `crawl_runs` (Migration `20260720` — NICHT auf Prod angewendet). Ohne Flag UND ohne Migration = No-Op. Übergangsplan: `docs/betrieb/blob-relational-migration-plan.md`. | storage.js · Prod nach Freigabe · fail-open (No-Op) · — |
| `HELMUT_RETENTION_EXECUTE` | O | **Datenschutz-Retention, FREIGABEPFLICHTIG, Default AUS.** Erlaubt dem Retention-Werkzeug (`scripts/retention-dryrun.js --execute`) die ECHTE Löschung überalteter `raw_documents`/`knowledge_objects` nach der Datenklassen-Matrix. Ohne Flag ist nur der Trockenlauf möglich. Löscht Prod-Daten (kaskadiert Provenienz) → Gründer- + Rechtsfreigabe. Konzept: `docs/betrieb/aufbewahrung-loeschung.md`. | storage.js/retention.js · Prod nach Freigabe · Default aus (nur Trockenlauf) · — |
| `HELMUT_SOURCE_TELEMETRY` | O | **P0-1, FREIGABEPFLICHTIG, Default AUS.** Aktiviert den Write der Pro-Quellenabruf-Telemetrie in die relationale Tabelle `source_crawl_telemetry` (Migration `20260718_source_crawl_telemetry.sql` — NICHT auf Prod angewendet). Ohne Flag UND ohne Migration = reiner No-Op (kein Production-Daten-Write). Nur technische Metadaten, kein Volltext/PII. | scheduler.js/source-telemetry.js · Prod nach Freigabe · fail-open (No-Op) · — |
| `HELMUT_RECOVERY_EXECUTE` (+ `HELMUT_RECOVERY_CONFIRM`, `HELMUT_RECOVERY_RUNID`) | O | **STILLGELEGT (2026-07-18, Pending-Sprint) — wirkungslos.** Der anker-basierte Recovery-Pfad erzeugte einen Multi-Themen-Digest (Lauf `rec-29569461715`, vollständig zurückgerollt) und wurde hart stillgelegt: `scripts/understanding-recovery-execute.js` ist ein reiner Stilllegungs-Hinweis (kein DB-/KI-/Write-Pfad, unabhängig von Flag/Token), die `RECOVERY_ALLOWLIST` ist leer, die GitHub-Action `understanding-recovery.yml` wurde entfernt. Ersatz: Einzel-Dokument-Recovery je exakter `raw_document_id` (Restliste OP-05). Historie: `docs/betrieb/understanding_recovery_trockenlauf.md`. | understanding-recovery.js · — · wirkungslos (No-Op) · — |
| `HELMUT_PENDING_TERMINAL_EXECUTE` · `HELMUT_PENDING_TERMINAL_CONFIRM` · `HELMUT_PENDING_TERMINAL_RUNID` | O | **OP-06 Terminales Aussortieren, FREIGABEPFLICHTIG, Default AUS.** Schaltet das Aussortier-Skript (`scripts/pending-terminal-aussortieren.js`) für genau die 34 bestätigten Allowlist-Fälle (27 Rauschen + 7 belegte Themen-Duplikate) scharf; zusätzlich exaktes Token `AUSSORTIEREN_34_BESTAETIGT` nötig. Ohne beides: reiner Plan-/Snapshot-Ausdruck (read-only). Echter Lauf: konditionale PATCHes `pending`/`failed` → `failed-final` mit Rollback-Kennung `aussortiert:<RUNID>:<vorstatus>` in `understanding_model`; 0 KI-Calls, kein Delete. Freigabevorlage: `docs/betrieb/pending_terminal_aussortierung.md`. | pending-terminal.js · Prod nach Freigabe · fail-safe (No-Op) · — |
| `VERCEL_REGION` · `HELMUT_EXEC_LOCATION` | O | Ausführungsort-Etikett für die Laufzeit-Telemetrie (P0-1, technische Metadaten, nie PII). `VERCEL_REGION` wird von Vercel gesetzt; `HELMUT_EXEC_LOCATION` überschreibt es lokal. Default `local`. | scheduler.js/server.js · alle · Default greift · — |
| `HELMUT_PIPELINE_ERROR_WINDOW_MS` (Default 6 h) | O | **P0-3.** Dedup-Fenster des zentralen Pipeline-Fehler-Sammlers: identische Fehler (gleicher Prozess+Fehlertyp+Quelle) innerhalb dieses Fensters erhöhen einen Zähler statt neue `systemErrors`-Zeilen zu fluten. | storage.js · alle · Default greift · — |
| `HELMUT_COMMIT_SHA` (auch `VERCEL_GIT_COMMIT_SHA`) | O | Commit-Kennung für die Fehler-/Telemetrie-Korrelation (technische Metadaten). `VERCEL_GIT_COMMIT_SHA` wird von Vercel gesetzt. | storage.js · Prod · Default greift · — |
| `HELMUT_MONITORING_WEBHOOK_URL` | O | **Zweiter Alarmkanal** (Audit-Folgebranch): Health-Report wird zusätzlich zu CallMeBot als JSON-POST hierher geschickt (Slack/Discord/Zapier/E-Mail-Relais). Ohne: nur WhatsApp. Setzen = **F5 (freigabepflichtig)**; Härtung (Ereigniskennung, Dedupe, Retry, Zustellstatus, Heartbeat) siehe `docs/betrieb/f5_freigabe.md`. | server.js/monitoring-webhook.js · Prod empfohlen · fail-open (Kanal still aus) · Rot: bei Webhook-Leak |
| `HELMUT_MONITORING_WEBHOOK_RETRY_MAX` | O | Max. Wiederholungen der Webhook-Zustellung bei Netzfehler/5xx (Default 2, exponentieller Backoff; 4xx wird nie wiederholt). Harte Obergrenze, keine Endlosschleife. | monitoring-webhook.js · alle · Default greift · — |
| `HELMUT_ASSET_VERSION` | O | Cache-Busting-Version für den CLI-Deploy-Weg (setzt `scripts/vercel-deploy.sh` aus Git-SHA+Zeit). Git-Integration-Deploys nutzen stattdessen `VERCEL_GIT_COMMIT_SHA`. **CLI-Deploys IMMER über das Skript** (siehe `deploy-rollback.md`). | server.js · nur CLI-Deploy · ohne: Konstante (Stale-Asset-Falle) · — |
| `HELMUT_LAGE_CHECK_RECENT_HOURS` · `HELMUT_LAGE_CHECK_REGENERATE_THRESHOLD` | O | Lage-Check-Feinsteuerung. | lage.js · alle · Default greift · — |
| `HELMUT_STAFF_STALE_DAYS` | O | Staff-Backfill-Frische. | staff.js · alle · Default greift · — |

## 7. Pflicht-Mindestset für einen funktionierenden Production-Neuaufbau

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PILOT_SECRET` (oder
`HELMUT_AUTH_MODE=accounts` + Admin-Seed), `AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_KEY`
(oder `OPENAI_API_KEY`), `HELMUT_V3_STORE=1`, `HELMUT_SOURCE_MODE=on`,
`HELMUT_MAX_LLM_CALLS_PER_DAY`. Für Push zusätzlich die VAPID-Trias, für
Alarmierung `CALLMEBOT_*` (bzw. `HELMUT_MONITORING_WEBHOOK_URL`, Zweitkanal).
Ein Startup-Warnhinweis bei fehlenden Pflichtvariablen ist als spätere
Ergänzung sinnvoll (Roadmap), aber kein Blocker.

## 8. Werkzeug-/Script-Variablen (nicht Laufzeit)

Diese Variablen liest NICHT der Server, sondern Betriebs-Skripte bzw.
GitHub-Actions-Workflows. Sie gehören nicht nach Vercel (Ausnahmen vermerkt),
sondern in die Shell des Betreibers, `.env.local`, GitHub Secrets/Variables —
**oder, für Claude-Code-Cloud-Sitzungen, die Claude-Code-Environment-Einstellungen**
(Environment → Environment Variables).

**Vierter Kanal — Claude Code Cloud (seit 2026-07-25, `CLAUDE.md` §4.9):**
Produktionsrelevante Skripte, die Secrets benötigen, müssen sowohl lokal als auch in
einer Cloud-Sitzung lauffähig sein. Eine Cloud-Sitzung läuft in einem isolierten,
frisch geklonten Container ohne Zugriff auf die lokale Maschine des Betreibers und
ohne persistenten Zustand über einen Neustart hinaus — eine `.env.local` kann dort
nicht wie gewohnt abgelegt werden. Secrets erreichen den Prozess einer Cloud-Sitzung
stattdessen als echte `process.env`-Variablen, sobald sie einmal in den
Environment-Einstellungen der jeweiligen Claude-Code-Umgebung hinterlegt sind —
analog zu `GITHUB_TOKEN`, das dort bereits ohne jede manuelle Eingabe verfügbar ist.
**Niemals** Secrets in den Chat einer Sitzung eingeben oder in einen Commit
aufnehmen. Technische Voraussetzung (bereits erfüllt, geprüft 2026-07-25): kein
Skript in diesem Repo lädt `.env.local` selbst per `dotenv` — jedes liest Secrets
ausschließlich über `process.env`, ist also gegenüber dem Herkunftskanal
(Shell-Export, `.env.local`, GitHub Secret, Cloud-Environment-Variable) blind und
funktioniert identisch, unabhängig davon, welcher der vier Kanäle die Variable
gesetzt hat.

| Variable | Ort (Lesestelle) | Zweck / Hinweise |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (S) | `scripts/backup-export.js` | Pre-Seed-/Voll-Backup (read-only). Läuft identisch lokal (`.env.local`) und in einer Claude-Code-Cloud-Sitzung (Environment Variables der Cloud-Umgebung) — beide Kanäle landen gleichermaßen in `process.env`. |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` (S) | `scripts/restore-drill.js` | Service-Role-Key des ZIEL-Testprojekts für die Restore-Übung (die Ziel-URL kommt als CLI-Argument `--target-url`, nicht als Env). Nur ad hoc in der Shell setzen, nie persistieren. Darf NIE der Production-Key sein. |
| `VERCEL_TOKEN` (S) | vercel-CLI (`scripts/vercel-deploy.sh` setzt Login via `vercel whoami` voraus) | CLI-/CI-Zugang zum Vercel-Account. Wird von keinem Repo-Code direkt gelesen; Erzeugung/Widerruf unter vercel.com → Account → Tokens. Rotationspflichtig (secret-rotation.md). |
| `HELMUT_CRON_SECRET` (S, GitHub-Secret) | `.github/workflows/briefing-watchdog.yml` | GitHub-Seite der `CRON_SECRET`-Doppelpflege — MUSS wertgleich mit `CRON_SECRET` in Vercel sein, sonst schlägt der Watchdog fehl. |
| `HELMUT_PROD_URL` (GitHub-Variable, `vars.`) | `.github/workflows/briefing-watchdog.yml` | Basis-URL für den Watchdog-Aufruf. Default `https://helmut-pilot.vercel.app`. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` / `AZURE_OPENAI_KEY` / `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` (S, GitHub-Secrets/Vars) | `.github/workflows/staff-backfill-*.yml` | GitHub-Spiegel der Vercel-Werte für die manuellen Staff-Backfill-Workflows. Bei Rotation der Vercel-Werte MITROTIEREN. |
| `HELMUT_BASE_URL` | `scripts/smoke-test.js` | Ziel-URL des Smoke-Tests (Default lokal). |
| `HELMUT_SMOKE_AUTH` | `scripts/smoke-test.js` | `1` = Account-Modus-Smoke (Login/RBAC/Mandantentrennung) statt Pilot-Smoke. |
| `HELMUT_SMOKE_ADMIN_EMAIL` / `HELMUT_SMOKE_ADMIN_PASSWORD` (S bei Passwort) | `scripts/smoke-test.js` | Admin-Zugang für den Account-Modus-Smoke (Fallback: `HELMUT_ADMIN_EMAIL`/`HELMUT_ADMIN_PASSWORD`). |
| `HELMUT_UNDERSTANDING_EVAL_LIVE` | `scripts/understanding-eval.js` | `1` = Goldset-Eval mit ECHTEN KI-Calls (Kosten!). Default offline. Steht auch in `.env.example`. |

Bewusst NICHT inventarisiert (reine Test-/Probe-Knöpfe ohne Betriebsrelevanz):
`PARDOK_*` (pardok-shadow-test), `PP_*` (pardok-structure-probe), `S9B_*`
(sprint9b-verify), `SP_*` (shadow-pilot-crawl), `TMPDIR`.

## 9. Veraltete Variablen

Diese Variablen existieren noch als Lesestellen bzw. historische Referenzen,
haben aber keine Wirkung mehr. NICHT neu setzen; bei Gelegenheit aus Vercel
entfernen.

| Variable | Status |
|---|---|
| `HELMUT_TENANT_JWT_MODE` | Stillgelegt: `tenantJwtModeEnabled()` liefert hart `false`. Setzen ändert nichts. |
| `SUPABASE_JWT_SECRET` | Nur vom stillgelegten Tenant-JWT-Modus konsumiert — aktuell wirkungslos. |
| `SUPABASE_ANON_KEY` | Nur vom stillgelegten Tenant-JWT-Modus konsumiert — aktuell wirkungslos. |
| `HELMUT_MONITORING_EMAIL` | Hat NIE existiert (Doku-Phantom bis 2026-07). Der Zweitkanal heißt `HELMUT_MONITORING_WEBHOOK_URL`. |

## 10. Kritische Production-Variablen

Kritisch = Fehlen oder Fehlwert bricht Production sofort sichtbar ODER
entfesselt Kosten. Diese Werte bei JEDER Env-Änderung gegenprüfen:

| Variable | Warum kritisch |
|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Ohne beide: kein Store — App startet, zeigt aber keine Daten; Crons schreiben ins Leere. |
| `CRON_SECRET` | Ohne: alle `/api/cron/*` antworten 503 → kein Crawl, kein Briefing, kein Health-Report (fail-closed). Falscher Wert nur in GitHub (`HELMUT_CRON_SECRET`): Watchdog schlägt dauerhaft fehl. |
| `PILOT_SECRET` (Legacy-Modus) | Ohne: niemand kommt in die App (fail-closed). |
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | Falsch hoch gesetzt = Kostenrisiko. Fehlend/ungültig = Schutzlimit 50 → Understanding-Läufe werden gedrosselt (fail-closed, kein Kostenrisiko, aber Funktionseinbuße). |
| `HELMUT_LLM_BUDGET_FAIL_CLOSED` | In Prod = 1. Ohne: bei Budget-Prüffehlern werden KI-Calls ERLAUBT (fail-open → Kostenrisiko bei Störung). |
| `HELMUT_SOURCE_MODE` | Ohne/off: kein Quellen-Cutover — Crawl liefert keinen neuen Stoff, App veraltet still. |
| `AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_KEY` (oder `OPENAI_API_KEY`) | Ohne: nur Regel-Fallbacks, keine KI-Ausgaben (App läuft, Kernnutzen fehlt). |
| `HELMUT_V3_STORE` | Ohne `=1`: V3-Pfade inert — Understanding/Büro/Radar-Datenfluss steht. |
| `HELMUT_REVIEW_FIXTURE` | MUSS ungesetzt sein — gesetzt liefert es fiktive Daten an echte Nutzer. |
