# Environment-Inventar — vollständige Referenz (Stand 2026-07-15, Folgebranch)

**Zweck (Audit-Blocker):** Der Betrieb hing an einem Bus-Faktor 1 auch auf
Konfigurationsebene — `.env.example` deckte nur ~35 von ~100 im Code gelesenen
Variablen ab. Diese Datei listet **alle** aus dem Code (`server.js`, `api/`,
`lib/helmut/**`, `sw.js`) tatsächlich gelesenen Variablen mit Zweck, Default,
Secret-Status und Pflicht/optional. Automatisch gegen den Code abgeglichen; ein
Regressionstest (`scripts/env-inventar-test.js`) hält die Liste synchron.

**Bedienung:** Secrets stehen NUR in Vercel (Project → Settings → Environment
Variables), niemals im Repo. Bei jeder Änderung: hier Ist-Wert des Betreibers
NICHT eintragen (nur Zweck/Default), sondern in den Passwort-Manager. Nach
Neuaufbau des Systems ist diese Liste die Rekonstruktionsgrundlage.

Legende: **S** = Secret (nie loggen/committen) · **P** = Pflicht in Production ·
**O** = optional (Default greift).

## 1. Secrets / Zugang (S)

| Variable | P/O | Zweck / Default |
|---|---|---|
| `SUPABASE_URL` | P | Supabase-Projekt-URL. Ohne: V3-Store inert, App läuft Blob-los/lokal. |
| `SUPABASE_SERVICE_ROLE_KEY` (auch `SUPABASE_SERVICE_KEY`, `SUPABASE_SECRET_KEY`) | P·S | Service-Role-Key (RLS-Bypass) — der reale DB-Zugang. |
| `SUPABASE_JWT_SECRET` | O·S | Nur für den (stillgelegten) Tenant-JWT-Modus. Aktuell wirkungslos. |
| `SUPABASE_ANON_KEY` | O·S | Anon-Key für authenticated-Requests (nur JWT-Modus). |
| `PILOT_SECRET` (auch `HELMUT_PILOT_SECRET`) | P·S | Geteilter Pilot-Zugangscode. **Fail-closed:** auf Vercel ohne diesen Wert kein Zugang. Rotation = Freigabepunkt F1. |
| `HELMUT_ADMIN_SECRET` | O·S | Admin-/Debug-Bypass für einzelne Endpunkte; Default = `CRON_SECRET`. |
| `CRON_SECRET` (GitHub-Secret: `HELMUT_CRON_SECRET`) | P·S | Bearer für alle `/api/cron/*`. **Fail-closed:** ohne → 503. |
| `OPENAI_API_KEY` | P*·S | OpenAI-Key. *Pflicht nur, wenn Azure NICHT gesetzt. Ohne KI: Regel-Fallbacks. |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_KEY` | P*·S | Azure OpenAI (EU) — hat Vorrang vor OpenAI. Empfohlener Produktionspfad. |
| `AZURE_OPENAI_DEPLOYMENT` | O | Deployment-Name. Default `gpt-5-mini`. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (auch `HELMUT_VAPID_PUBLIC_KEY` / `HELMUT_VAPID_PRIVATE_KEY` / `HELMUT_VAPID_SUBJECT`) | O·S | Web-Push-Schlüssel. Ohne: Push deaktiviert (App läuft). Erzeugung: `scripts/generate-vapid-keys.js`. |
| `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY` | O·S | WhatsApp-Health-Report an den Betreiber. **Ohne → dieser Kanal wird STILL übersprungen** (siehe Zweitkanal `HELMUT_MONITORING_WEBHOOK_URL`). |
| `DIP_API_KEY` | O·S | Bundestag-DIP-API (Drucksachen). Ohne: DIP-Feature inaktiv. |
| `OPENAI_MODEL` | O | Modellname für den direkten OpenAI-Pfad. Default gpt-4.1. |

## 2. Betriebsmodus / Auth (nicht geheim)

| Variable | P/O | Zweck / Default |
|---|---|---|
| `HELMUT_AUTH_MODE` | O | `accounts` = Konten-Login; sonst Legacy-Pilotgate. |
| `HELMUT_TENANT_MODE` | O | Default `pilot`. |
| `HELMUT_TENANT_JWT_MODE` | O | **Stillgelegt** (tenantJwtModeEnabled()=false). Ohne Wirkung. |
| `HELMUT_PROFILE_DB_MODE` | O | Profile aus mandate_profiles statt Blob. Default aus. |
| `HELMUT_V3_STORE` | O | V3-Relationstabellen nutzen. In Prod = 1. |
| `HELMUT_ADMIN_EMAIL` / `HELMUT_ADMIN_PASSWORD` / `HELMUT_ADMIN_NAME` / `HELMUT_ADMIN_RESET` | O·(S bei Passwort) | Erst-Admin-Seed (nach erstem Start entfernbar). |
| `HELMUT_ALLOW_QUERY_SECRETS` | O | Query-Secret-Login erlauben. Default false. |
| `HELMUT_SESSION_TTL_MS` | O | Session-Laufzeit. Default 30 Tage. |
| `HELMUT_CANONICAL_HOST` | O | Default `helmut-pilot.vercel.app`. |
| `NODE_ENV` / `PORT` / `VERCEL` / `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` | (Plattform) | Von Vercel/Node gesetzt. `VERCEL_GIT_COMMIT_SHA` speist die Asset-Versionierung (ASSET_VERSION). |

## 3. Kosten / KI-Budget

| Variable | P/O | Zweck / Default |
|---|---|---|
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | P (empfohlen) | Globales Tageslimit. **Leer/0 = kein Limit** (dokumentiert); gesetzter Ungültigwert → Schutzlimit 50 (Audit-Fix). Übergangsempfehlung: erst Ist-Wert in Admin-Diagnose ablesen, dann Richtwert ~100 Understanding-Calls/Tag. |
| `HELMUT_LLM_BUDGET_FAIL_CLOSED` | O | Bei Budget-Prüffehler KI verweigern statt erlauben. Default aus (Freigabepunkt F6). |
| `HELMUT_UNDERSTANDING_LOCK` | O | Globaler Understanding-Lock gegen Doppelläufe. Default aus. |
| `HELMUT_LLM_PRICE_JSON` | O | Preis-Override für Kostenschätzung. |
| `HELMUT_UNDERSTANDING_MODEL` / `HELMUT_TEXT_MODEL` | O | Modell-Override (nur OpenAI-Pfad). Default gpt-5-mini. |
| `HELMUT_OFFICE_DAILY_LIMIT` | O | Büro-Outputs/Tag (V3-Engine). Default 10. |
| `HELMUT_MAX_DAILY_INPUTS` | O | Tagesinputs/Mandat. Default 3. |

## 4. Quellen / Crawl / PARDOK

| Variable | P/O | Zweck / Default |
|---|---|---|
| `HELMUT_SOURCE_MODE` | P | off/shadow/**on** (Cutover aktiv). Via helmut-flags.json/Env. |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | O | Gate/Dispatch off/shadow/on. Beide shadow. |
| `CRAWLER_TIMEOUT_MS` (Default 7000) · `CRAWLER_CONCURRENCY` | O | Crawl-Netzverhalten. |
| `HELMUT_CRAWL_MAX_RESPONSE_BYTES` | O | Standard-Crawl-Bytelimit. Default 10 MiB. |
| `HELMUT_PARDOK_MAX_RESPONSE_BYTES` (Default 64 MiB) · `HELMUT_PARDOK_MAX_RECORDS` (Default 800) | O | PARDOK-Streaming-Budget (Audit-Fix Sprint 7). |
| `HELMUT_SOURCE_TARGET` / `HELMUT_SOURCE_CURATION` | O | Katalog-Kuratierung (Alt-Katalog-Pfad). |
| `HELMUT_GOOGLE_NEWS_MAX_ITEMS` · `HELMUT_DIRECT_RSS_MAX_ITEMS` · `HELMUT_PERSON_NEWS_MAX_ITEMS` · `HELMUT_PROFILE_NEWS_MAX_ITEMS` · `HELMUT_TOPIC_RADAR_MAX_ITEMS` | O | Item-Caps je Quellart. |
| `HELMUT_CRAWL_MAX_CANDIDATES` · `HELMUT_CRAWL_LAZY_BUDGET_MS` · `HELMUT_CRAWL_UNDERSTAND_BUDGET_MS` · `HELMUT_UNDERSTAND_BUDGET_MS` · `HELMUT_LAGE_UNDERSTAND_BUDGET_MS` | O | Zeit-/Mengenbudgets der Pipeline. |
| `DIP_WAHLPERIODE` (Default 21) · `HELMUT_DIP_PRIMARY` · `DIP_CACHE_MS` | O | DIP-Verhalten. |
| `AUTO_REFRESH_ON_READ` | O | Lazy-Refresh beim Lesen. |
| `HELMUT_MANUAL_RUN_MIN_INTERVAL_MS` | O | Drossel für manuelle Läufe. |

## 5. Lage / Radar / Darstellung

| Variable | P/O | Zweck / Default |
|---|---|---|
| `HELMUT_KO_SCAN_LIMIT` | O | KO-Scan-Fenster. Default 500. |
| `HELMUT_LAGE_MAX_VORGAENGE` · `HELMUT_LAGE_DEMO` · `HELMUT_LAGE_CHECK_*` · `HELMUT_LAGE_CHECK_SOURCE_LIMIT` | O | Lage-/Lage-Check-Verhalten (Demo default aus). |
| `HELMUT_SCORING_MODE` | O | Ebenen-bewusstes Ranking + gap/stale/quiet. Default off. |
| `HELMUT_V3_MATCHING` / `HELMUT_MATCHING_DIM` / `HELMUT_V3_LAZY_UNDERSTANDING` / `HELMUT_V3_OFFICE` / `HELMUT_V3_SHADOW_COMPARE` | O | V3-Subsysteme, Default aus. |
| `HELMUT_FRESH_STALE_HOURS` · `RADAR_DYNAMICS_FRESH_DAYS` · `HELMUT_TOP_TOPIC_COOLDOWN_HOURS` · `HELMUT_DECISION_LABEL_MAX` · `HELMUT_RAWDOC_SUMMARY_MAX` (Default 240) | O | Frische-/Anzeigeparameter. |
| `HELMUT_REVIEW_FIXTURE` | O | **Gefährlich in Prod:** liefert fiktive Abnahmedaten. MUSS in Production ungesetzt sein. |

## 6. Watchdog / Betrieb / Store

| Variable | P/O | Zweck / Default |
|---|---|---|
| `HELMUT_MIN_CHECKED_SOURCES` · `HELMUT_MIN_SUCCESSFUL_SOURCES` · `HELMUT_MIN_CONFIGURED_SOURCES` · `HELMUT_MIN_LAGE_CHECK_SOURCES` | O | Watchdog-Schwellen. |
| `HELMUT_MAX_CRAWL_FAILURE_RATIO` · `HELMUT_MAX_FULL_CRAWL_AGE_MS` · `HELMUT_MAX_LAGE_CHECK_AGE_MS` · `HELMUT_MAX_OUTPUT_FRESHNESS_MS` · `HELMUT_MAX_LAGE_CHECK_AGE_MS` | O | Frische-/Fehler-Grenzen des Watchdogs. |
| `HELMUT_STORAGE_BACKEND` · `HELMUT_SUPABASE_STORE_ID` (Default `main`) · `HELMUT_SUPABASE_AUTH_STORE_ID` · `HELMUT_STORE_CACHE_MS` · `HELMUT_SUPABASE_TIMEOUT_MS` | O | Store-Backend/Caching. |
| `HELMUT_MONITORING_WEBHOOK_URL` | O | **Zweiter Alarmkanal** (Audit-Folgebranch): Health-Report wird zusätzlich zu CallMeBot als JSON-POST hierher geschickt (Slack/Discord/Zapier/E-Mail-Relais). Ohne: nur WhatsApp. |
| `HELMUT_ASSET_VERSION` | O | Cache-Busting-Version für den CLI-Deploy-Weg (setzt `scripts/vercel-deploy.sh` aus Git-SHA+Zeit). Git-Integration-Deploys nutzen stattdessen `VERCEL_GIT_COMMIT_SHA`. |
| `HELMUT_LAGE_CHECK_RECENT_HOURS` · `HELMUT_LAGE_CHECK_REGENERATE_THRESHOLD` | O | Lage-Check-Feinsteuerung. |
| `HELMUT_MORNING_PUSH_ALL_PROFILES` | O | Morgen-Push für alle Profile (Multi-Mandant). Default aus (Freigabepunkt F4). |
| `HELMUT_STAFF_STALE_DAYS` | O | Staff-Backfill-Frische. |

## 7. Pflicht-Mindestset für einen funktionierenden Production-Neuaufbau

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PILOT_SECRET` (oder
`HELMUT_AUTH_MODE=accounts` + Admin-Seed), `AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_KEY`
(oder `OPENAI_API_KEY`), `HELMUT_V3_STORE=1`, `HELMUT_SOURCE_MODE=on`,
`HELMUT_MAX_LLM_CALLS_PER_DAY`. Für Push zusätzlich die VAPID-Trias, für
Alarmierung `CALLMEBOT_*` (bzw. `HELMUT_MONITORING_EMAIL`, Zweitkanal).
Ein Startup-Warnhinweis bei fehlenden Pflichtvariablen ist als spätere
Ergänzung sinnvoll (Roadmap), aber kein Blocker.
