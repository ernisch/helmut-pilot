# ARCHITECTURE — Systemkarte Helmut

**Letzte Aktualisierung:** 2026-07-25 · **verankert auf `main` @ `035898b`**

> **Zweck:** Orientierung, welche Datei für welche Aufgabe zuständig ist. **Keine**
> Erklärung jeder Datei. Diese Datei wird nur aktualisiert, wenn sich die Architektur
> **tatsächlich** ändert — nicht bei jedem Sprint.
>
> **Verbindlich bei Widerspruch:** Sicherheit/Mandantentrennung →
> [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md) ·
> Quellenmodell → [`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md) ·
> Status → [`CURRENT_STATE.md`](CURRENT_STATE.md).

---

## 1 · Zentrale Komponenten

| Komponente | Datei | Größe | Rolle |
|---|---|---|---|
| HTTP-Server + alle Routen | `server.js` | ~6.700 Z. | Node-`http`-Server, ohne Framework; rendert auch die SPA-Shell (`indexHtml()`) und die servergerenderten Auth-Seiten |
| Vercel-Einstieg | `api/index.js` | 1 Z. | reiner `require("../server")` |
| SPA-Client | `client.js` | ~13.000 Z. | Vanilla-JS Single-Page-App, `innerHTML`-Rendering, eine `render…View()`-Funktion je Bereich |
| Styles | `styles.css` | ~12.000 Z. | CSS-Variablen-Tokens in `:root`, Light-Mode-Overrides unter `:root[data-theme="light"]` |
| Persistenz | `lib/helmut/storage.js` | ~5.000 Z. | **einziger** DB-Zugriffspfad (Supabase/PostgREST + Blob-Store) |
| Fachlogik | `lib/helmut/*.js` | ~50 Module | Crawler, Understanding, Lage, Radar, Büro, Budget, Auth, Provisionierung |
| Quellenarchitektur | `lib/helmut/quellenarchitektur/*.js` | — | relationales Quellenmodell, Seeds, Gate, PARDOK |
| Service Worker | `sw.js` | — | stale-while-revalidate für Assets |

**Wichtig:** `server.js`, `client.js` und `styles.css` sind sehr groß. Immer gezielt
suchen (`Grep`) und **abschnittsweise** lesen — nie vollständig öffnen.

## 2 · Datenfluss

```
Vercel Cron ──► /api/cron/crawl ──► scheduler.runSourceCrawl
                                      │  Quellenplan (relational, SOURCE_MODE=on)
                                      ▼
                                    crawler.js ──► raw_documents
                                      │
                                      ▼
              /api/cron/understanding ──► understanding.js (LLM, budget-gated, gelockt)
                                      │
                                      ▼
                                  knowledge_objects (+ document_findings)
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   matching/decisions            radarState.js                  lage.js
        │                             │                             │
        └──────────► /api/app/start ──┴──► client.js (Heute · Lage · Radar · Büro)
```

Ergänzend: `/api/cron/morning-briefing` und `/api/cron/lage-briefing` erzeugen das
Briefing, `/api/cron/health-report` den Betriebsbericht (Watchdog + Alarmpfad).

## 3 · Quellenarchitektur

Drei sauber getrennte Ebenen (Details:
[`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md)):

- **Herausgeber** (`publishers`) — wer veröffentlicht; einmal je Domain; trägt eine
  Belegfunktion (`official_primary`, `direct_interest`, `journalistic`,
  `data_source`, `aggregator`).
- **Abrufweg** (`retrieval_paths`) — wie abgerufen wird (RSS, API, HTML, Google News);
  mit Status und Aktivierungsmodus.
- **Paket** (`packages`) — wofür gebündelt wird; Profile bekommen Pakete über den
  Resolver, nicht einzelne Quellen.

**Landesmodule** (Berlin, Brandenburg) sind im Crawl-Plan gesperrt, bis ihr Land in
`HELMUT_LANDESMODULE` ausdrücklich genannt ist — **je Land getrennt**, Default leer,
fail-closed (kein Sammel-Schlüsselwort). Zusätzlich gilt: ein Abrufweg mit
`activation_mode='manual'` wird nie automatisch abgerufen. Beide Regeln stehen im
ausführenden Plan (`source-mode.buildRelationalCrawlPlan`), nicht in `model.isPathActive`.
Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md).

`HELMUT_SOURCE_MODE=on`: die relationale DB ist die aktive Wahrheit. Der hartkodierte
Katalog `lib/helmut/sources.js` ist **nur noch Fallback** (Ladefehler/leerer Plan).
Personenbezogene Quellen stehen **nicht** im geteilten Katalog, sondern entstehen zur
Laufzeit aus dem Profil (`scheduler.personNewsSource`, id `<mandats-id>-news`).

## 4 · Mandantenmodell

- Ein Mandant = ein Mandat = `politicianId` (= `user_id` in allen Tabellen).
- **Kein Mandant ist hartkodiert**, keiner ist Default oder Fallback (PR #97). Crons
  laufen über alle aktiven DB-Mandate, je Mandant isoliert.
- Cache-Schlüssel tragen die Mandanten-ID (`bf-<userId>-…`, `office-<user>-…`).
- Profile liegen relational (`mandate_profiles`, Exklusivmodus seit PR #113);
  Konten/Sessions liegen im Blob `main-auth` (dokumentierte Restlücke, → OP-03).
- Provisionierung/Teardown: `lib/helmut/provisioning.js`,
  Runbook [`betrieb/zweitmandant-provisionierung-runbook.md`](betrieb/zweitmandant-provisionierung-runbook.md).

## 5 · Authentifizierung

- `HELMUT_AUTH_MODE=accounts` schaltet den Kontomodus (`lib/helmut/auth.js`,
  `lib/helmut/accounts.js`). Identität wird **ausschließlich serverseitig** aus dem
  Session-Cookie `helmut_session` aufgelöst; `pickPoliticianId` validiert gegen die
  Session — eine `user_id` aus dem Request wird nie übernommen.
- Rollen-Gate je Route: `requireRoleOr403(…, "admin")`.
- Globaler CSRF-Guard: HMAC-Token via `GET /api/security/csrf`, Header `X-CSRF-Token`.
- Getrennt davon: Pilot-Zugang über `POST /api/pilot/unlock` (Cookie `helmut_pilot`,
  `PILOT_SECRET`).
- Servergerenderte Seiten ohne SPA: `/passwort-setzen` (muss vor jeder Session laden).

## 6 · Datenbank

- **Supabase (Postgres + PostgREST)**, Zugriff ausschließlich über
  `storage.supabaseRequest` mit `SUPABASE_SERVICE_ROLE_KEY`.
- `service_role` hat **BYPASSRLS** → die vorhandenen 23 RLS-Policies sind angewendet,
  aber **funktional inert**. Durchsetzend sind `assertTenant`/`assertTenantRows`
  (`storage.js`) plus ein verpflichtender `user_id=eq.<tenant>`-Filter.
- Zwei Speicherformen nebeneinander: relationale Tabellen **und** ein zentraler
  JSON-Blob (`helmut_store`, Zeilen `main`, `main-auth`, `main-p-<id>`).
  Der Blob ist **Last-Write-Wins** — dort ist das Verlustrisiko (→ OP-01).
- Migrationen: `supabase/migrations/`. **Jede Migration hat eine
  `…_rollback.sql`-Datei.** Nicht angewandt: `20260720`, `20260721`.

## 7 · Crawler und Verarbeitung

| Schritt | Modul |
|---|---|
| Plan bauen (relational vs. Katalog) | `quellenarchitektur/source-mode.js` |
| Abruf, Feed-Parsing, Retry | `crawler.js`, `google-news-hardening.js` |
| Lauf-Orchestrierung, Locks, Telemetrie | `scheduler.js`, `source-telemetry.js`, `crawl-run-state.js` |
| Dedup + Fundstellen | `dedup.js`, `quellenarchitektur/dedup-global.js` |
| **Vorgangsidentität (Anker, Cluster, Kennung)** | `vorgang-identity.js` |
| Verstehen (LLM) | `understanding.js`, `quellenarchitektur/understanding-gate.js`, `ai.js` |
| **Endzustand je Rohdokument + Watchdog** | `vorgangs-lebenszyklus.js` |
| Kostendeckel (fail-closed) | `llm-budget.js` |
| Amtliche Vorgänge | `dip.js`, `quellenarchitektur/pardok-parser.js`, `pardok-dispatch.js` |

Alle Läufe sind über **atomare, fail-closed Locks** (`pipeline_locks`) gegen
Doppelstart geschützt. Ein bewusster Doppelstart in Production ist **verboten**.

### 7a · Vorgangsidentität (seit 2026-07-26, Betriebsbefund B4)

**Fachliche Identität und technische Eindeutigkeit sind getrennt.** Vorher war die
`vorgang_id` beides zugleich — ein einzelnes Titelwort, das gleichzeitig das Thema
benannte *und* als Idempotenzschlüssel diente. Traf dieses Wort einen älteren,
fachfremden Vorgang, galt ein neues Ereignis als „schon verstanden" und
verschwand ohne Spur ([`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md)).

| Baustein | Wo | Regel |
|---|---|---|
| **Kennung** `vg-<themenwurzel>-<ereignistag>-<prüfsumme>` | `vorgang-identity.js` | Ein **Vorschlag**, kein Urteil. Drei unabhängige Bestandteile → zwei verschiedene Ereignisse treffen sich praktisch nie |
| **Zugehörigkeit** | `understanding.js` → `resolveVorgang()` | Entscheidet am **Beleg** gegen Kandidaten unter den Themenwurzel-Präfixen — nicht am Zeichenkettenvergleich |
| **Vergleichsmaßstab** (seit 2026-07-27) | `vorgang-identity.js` → `sameVorgang()` | **Kern gegen Kern**, nicht Dokument gegen Dokument. Der Kern eines Vorgangs sind die Anker, die mindestens die Hälfte seiner Dokumente teilen. **Ein Vorgang ohne Kern nimmt nichts mehr auf** — damit kann ein thematisch gemischter Vorgang nicht weiter wachsen (Betriebsbefund B4-2). Zweiter, unabhängiger Riegel: ≥ 60 Dokumente = keine Aufnahme mehr |
| **Altkennungen** | dasselbe Präfix | `vg-<wurzel>` fällt exakt auf das Präfix und wird **fortgeschrieben**, nicht dupliziert. Deshalb keine Migration |
| **Verknüpfungsinvariante** | `ko_document_links` | Jeder Ausgang, der einen Vorgang gefunden oder gebildet hat, schreibt die Verknüpfung. Damit ist der Endzustand jedes Rohdokuments **ableitbar** — ohne neue Tabelle |

Ein Vorgang bildet **genau ein politisches Ereignis** ab. Ob er das noch tut, ist
messbar: seine Dokumente erneut clustern. Ein echter Vorgang bleibt **ein** Cluster
(Kohärenz ≥ 0,67 gemessen), ein „Magnet" zerfällt in viele (≤ 0,55). Diagnose:
`scripts/vorgangs-magnet-analyse.js` (rein lesend, bereinigt nichts).

Eine gleiche Kennung bedeutet **nie** „ignoriere das neue Rohdokument". Die
Ergebnisklassen sind `saved` · `updated` · `merged` · `duplicate` ·
`skipped-terminal` · `skipped-failed` · `skipped-budget` · `skipped-error` ·
`skipped-invalid` · `skipped-store`. Ein pauschales `skipped-exists` gibt es
nicht mehr.

## 8 · Briefing, Lage, Radar, Büro

| Bereich | Backend | Client |
|---|---|---|
| Briefing / Heute | `briefingContract.js`, `briefingLanguage.js`, `decisions.js` | `renderBriefingView()` |
| Lage | `lage.js` | `renderLageView()`, `renderLageFocus()`, `renderLageSnapshot()` |
| Radar | `radar.js`, `radarState.js` | Radar-View + `radarDisruption()` |
| Büro | `office.js`, `templates/office/` | Büro-View |
| Profil | `profile-validation.js`, `config.js` | Profil-View, `renderOnboarding()` |

## 9 · Admin-Bereich

View `"admin"` in `client.js` (`renderAdminView()` ab ~Z. 2580), erreichbar nur im
Kontomodus für die Rolle `admin`. Daten aus `/api/admin/overview`,
`/api/admin/data-status`, `/api/admin/recovery-status` und weiteren `/api/admin/*`-
Routen (alle `requireRoleOr403`). Aufbau, bewusste Entscheidungen und Risiken:
[`admin-neuaufbau-2026-07.md`](admin-neuaufbau-2026-07.md).

## 10 · Production-Infrastruktur

- **Vercel**, Region `fra1`, Projekt `helmut-pilot`. Merge nach `main` = Deployment.
- `vercel.json`: Security-Header, immutable Asset-Caching, **9 Cron-Einträge**.
  `ASSET_VERSION` leitet sich aus `VERCEL_GIT_COMMIT_SHA` ab — deshalb bleiben
  `client.js?v=…`/`styles.css?v=…` bei einem Instant Rollback konsistent.
- **Flags:** `helmut-flags.json` (Allowlist); **Vercel-Env überstimmt die Datei immer**.
- **GitHub Actions:** `ci.yml` ist das blockierende Gate (Offline-Suite +
  Chromium-Smoke). Weitere Workflows sind pfadgefiltert oder `workflow_dispatch` und
  dürfen **nicht** als Required Check gesetzt werden.
- Env-Inventar: [`betrieb/env-inventar.md`](betrieb/env-inventar.md) ·
  Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 11 · Wichtige Verzeichnisse

```
server.js  client.js  styles.css  sw.js      # Anwendung (groß — nur abschnittsweise lesen)
api/index.js                                  # Vercel-Einstieg
lib/helmut/                                   # Fachlogik
lib/helmut/quellenarchitektur/                # Quellenmodell + Seeds
supabase/migrations/                          # Migration + Rollback paarweise
scripts/                                      # ~180 Test-/Werkzeugskripte
scripts/run-offline-tests.js                  # kanonischer Testlauf
test/fixtures/                                # Gold-Fixtures (PARDOK, Gate)
.github/workflows/ci.yml                      # blockierendes Merge-Gate
docs/                                         # Doku (Einstieg: START_HERE, CURRENT_STATE)
audit/                                        # historische Auditberichte (kein Status)
```

## 12 · Welche Dateien für welchen Aufgabentyp

| Aufgabentyp | Zuerst öffnen |
|---|---|
| **Backend / API** | betroffene Route in `server.js` (per `Grep` auf den Pfad), zugehöriges `lib/helmut/*.js`, `storage.js` nur für den konkreten Zugriff |
| **Datenmodell / Migration** | `supabase/migrations/` (letzte Dateien), `storage.js`, zugehöriges Rollback-SQL |
| **Quellen** | [`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md), [`quellenarchitektur/07-paketaktivierung-profil-resolver.md`](quellenarchitektur/07-paketaktivierung-profil-resolver.md), `lib/helmut/quellenarchitektur/{source-mode,catalog,profile-packages}.js`, betroffene `seeds/*.js`, `scripts/source-architecture-test.js` |
| **UI** | betroffene `render…View()` in `client.js`, Token-/Light-Mode-Block in `styles.css`, `scripts/*-ui-test.js`, `scripts/browser-smoke-test.js`, [`admin-neuaufbau-2026-07.md`](admin-neuaufbau-2026-07.md) für Admin-Designentscheidungen |
| **Understanding / KI** | `understanding.js`, `ai.js`, `llm-budget.js`, `quellenarchitektur/understanding-gate.js` |
| **Sicherheit / Mandanten** | [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md), [`sprint1-sicherheit/01-zugriffsmatrix.md`](sprint1-sicherheit/01-zugriffsmatrix.md), `tenant-context.js`, `auth.js`, `scripts/cross-tenant-security-test.js` |
| **Betrieb / Production** | [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md), [`betrieb/env-inventar.md`](betrieb/env-inventar.md), [`betrieb/branch-protection.md`](betrieb/branch-protection.md), `vercel.json`, `helmut-flags.json` |
| **Monitoring / Alarm** | `rolling-health.js`, `watchdog-state.js`, `monitoring-webhook.js`, `alarm-payload.js` |
