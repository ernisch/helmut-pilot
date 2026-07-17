# Auth- & Service-Role-Matrix — Sprint 3 (P0-2-Folgearbeit)

**Sprint:** SaaS-Security · **Datum:** 2026-07-12
**Status:** App-seitiger JWT-Umbau **implementiert** (flag-gated, Default AUS,
zero Verhaltensänderung ohne explizite Konfiguration). **RLS bleibt in
Production inaktiv (0 Policies).** Kein Secret gesetzt, kein Deploy, kein Merge.

Bezug: `audit/fix-plan.md` P0-2, `docs/rls-tenant-policies-draft.md`
(Policy-Design), `supabase/migrations/20260712_tenant_rls_policies.sql`
(vorbereitete, nicht angewendete Migration).

---

## 1. Warum dieser Umbau nötig ist

`docs/rls-tenant-policies-draft.md` §1 hat verifiziert: Die App spricht
Supabase ausschliesslich mit dem `service_role`-Key an — dieser **umgeht RLS
vollständig** (BYPASSRLS). Damit die in Sprint 2 entworfenen RLS-Policies
jemals eine reale Wirkung entfalten, müssen die betroffenen Lese-/Schreibpfade
stattdessen mit der Rolle **`authenticated`** und einem **pro Request
signierten JWT** laufen, das den Mandanten als Claim trägt. Dieses Dokument
listet **exakt**, welche Pfade das betrifft — und welche bewusst **nicht**.

---

## 2. Nutzer-Reads/Writes, die künftig mit authentifiziertem JWT laufen (implementiert, flag-gated)

Alle acht Funktionen liegen in `lib/helmut/storage.js` und wurden auf die
neue Transport-Weiche `tenantRequest(endpoint, tenantId, options)` umgestellt.
Ohne `HELMUT_TENANT_JWT_MODE=1` **und** gesetzte Secrets bleibt ihr Verhalten
**exakt identisch** zu vorher (service_role).

| Funktion | Tabelle | Live-Aufrufer (Route) | Read/Write | Tenant-Claim-Quelle |
|---|---|---|---|---|
| `listMatchingResults` | `matching_results` | `lage.js:297` ← `GET /api/app/start` | Read | `userId`-Parameter (bereits P0-1-gescopt) |
| `listDecisions` | `decisions` | **kein Produktionsaufrufer** (dead, aus Konsistenz mitgezogen) | Read | `userId`-Parameter |
| `listOfficeOutputsByUser` | `office_outputs` | **kein Produktionsaufrufer** (dead, aus Konsistenz mitgezogen) | Read | `userId`-Parameter |
| `getOfficeOutput` | `office_outputs` | `office.js:84` ← `POST /api/office/generate` | Read (Cache-Check) | `userId`-Parameter |
| `canSpendOfficeOutput` | `office_outputs` | `office.js:88` ← `POST /api/office/generate` | Read (Rate-Gate) | `userId`-Parameter |
| `saveOfficeOutput` | `office_outputs` | `office.js:116` ← `POST /api/office/generate` | **Write** | `entry.user_id` |
| `getRenderedBriefingV3` | `briefings` | `lage.js` ← `GET /api/app/start` (Lage-Cache-Check) | Read | `userId`-Parameter |
| `saveRenderedBriefingV3` | `briefings` | `lage.js` ← `GET /api/app/start` (Cache-Miss-Inline-Generierung) **und** `/api/cron/lage-briefing` (Prewarm) | **Write** | `entry.user_id` |

**Mechanismus:** `tenantRequest` prüft `tenantJwtModeEnabled() && tenantId`. Ist
beides erfüllt, signiert `signTenantJWT(tenantId)` ein kurzlebiges (60 s)
HS256-JWT (`{role:"authenticated", user_id:<tenantId>, iss:"helmut-app", iat,
exp}`) und sendet es als `Authorization: Bearer <jwt>` mit
`apikey: <SUPABASE_ANON_KEY>` (statt `service_role_key`). Sonst: unverändert
`supabaseRequest` (service_role).

---

## 3. Globale Backend-Jobs, die weiterhin `service_role` benötigen (bewusst NICHT umgestellt)

Diese Pfade laufen **ohne** eine live eingeloggte Nutzer-Session — sie werden
von Vercel Cron (`CRON_SECRET`-geschützt) oder GitHub Actions ausgelöst und
iterieren teils über mehrere/alle Mandanten. Ein JWT setzt eine **bereits
authentifizierte Einzelperson** voraus, die es hier nicht gibt — der Cron-Job
**ist** das System selbst.

| Funktion/Pfad | Tabelle(n) | Auslöser | Warum service_role bleibt |
|---|---|---|---|
| `runSourceCrawl` (gesamte Kette) | `raw_documents`, `knowledge_objects`, `ko_document_links` | `/api/cron/crawl`, `/api/cron/pipeline` | Schreibt **mandantenlose** Korpusdaten — kein Tenant-Konzept anwendbar |
| `saveDecisions` (Decision-Shadow) | `decisions` | innerhalb `runSourceCrawl`/`foldLageItemsIntoV3` | Bulk-Write der **gesamten** Pipeline in einem Rutsch; kein Live-Request, keine Session |
| `saveMatchingResults` (Matching-Shadow) | `matching_results` | wie oben | Aktuell ohnehin flag-inert (`HELMUT_V3_MATCHING` aus), aber auch bei Aktivierung: Backend-Batch |
| `saveProfileEmbedding` / `getProfileEmbedding` | `profile_embeddings` | `runMatchingShadow` (Backend) | `getProfileEmbedding` hat zusätzlich **keinen einzigen Aufrufer** (dead code) |
| `runPendingUnderstandingShadow` | `knowledge_objects` | `/api/cron/understanding` | Mandantenlos |
| `runLageCheck` (Crawl-Teil) | `raw_documents` | `/api/cron/lage-check` | Mandantenlos |
| `buildHealthReport` | (liest `helmut_store`-Blob) | `/api/cron/health-report` | Operator-Report, kein Endnutzer-Kontext |
| `readSupabaseStore`/`writeSupabaseStore` (**gesamte Blob-Familie**) | `helmut_store` | überall (Cron **und** live) | Siehe §5 — bewusste, dokumentierte Lücke |

---

## 4. Erforderliche Tenant-Claims

- **Claim-Name:** `user_id` (entspricht 1:1 der App-internen `politicianId`,
  identisch zur Spalte, gegen die die RLS-Policies aus Sprint 2 prüfen:
  `user_id = tenant()` bzw. `id = tenant()` bei `profiles`).
- **Rollen-Claim:** `role: "authenticated"` (Pflicht für PostgREST, damit die
  Anfrage nicht als `anon` behandelt wird — `anon` hat laut Sprint-2-Befund
  ebenfalls volle Tabellen-Grants, wird aber durch Policies, die explizit `TO
  authenticated` gescoped sind, weiterhin blockiert).
- **Zusatz-Claims:** `iss: "helmut-app"` (Herkunftsmarkierung, nicht
  sicherheitskritisch), `iat`/`exp` (Kurzlebigkeit — 60 s Default, verhindert
  Replay über die eigentliche Anfrage hinaus).
- **Keine** personenbezogenen Daten im Claim (kein Name, keine E-Mail, keine
  Rolle des Nutzers innerhalb des Mandats) — konsistent mit dem bestehenden
  DSGVO-Minimierungsprinzip des Projekts (vgl. `office.js`-Kommentar „kein
  userId im LLM-Kontext").

---

## 5. Wie Claims serverseitig verifiziert werden

**In Produktion (sobald aktiviert):** PostgREST verifiziert das JWT selbst
gegen das in Supabase konfigurierte Projekt-Secret (`Auth > JWT Settings`) —
die App muss dafür **nichts** zusätzlich tun; das ist Standard-Supabase-
Verhalten. Voraussetzung: `SUPABASE_JWT_SECRET` (App-seitig zum **Signieren**)
muss exakt dem in Supabase hinterlegten Secret entsprechen.

**Im Code implementiert (`lib/helmut/storage.js`):**
- `signTenantJWT(tenantId, opts)` — signiert (Node-`crypto`, HMAC-SHA256, kein
  externes Package).
- `verifyTenantJWT(token, secretOverride)` — bildet exakt denselben Algorithmus
  serverseitig nach (Signaturprüfung via `crypto.timingSafeEqual`,
  `exp`-Ablaufprüfung). **Wird im Produktionspfad der App nicht aufgerufen**
  (die App vertraut PostgREST als Verifizierer) — dient der **Testbarkeit**
  (`scripts/tenant-jwt-test.js`) und als **dokumentierter Nachweis**, dass der
  Mechanismus korrekt ist, ohne echte Supabase-Requests zu benötigen.
- `tenantJwtModeEnabled()` — Gate: nur aktiv, wenn `HELMUT_TENANT_JWT_MODE=1`
  **und** `SUPABASE_JWT_SECRET` **und** `SUPABASE_ANON_KEY` gesetzt sind. Fehlt
  eine Voraussetzung, bleibt der gesamte Mechanismus **inert** — identisch zu
  jedem anderen `HELMUT_V3_*`-Flag in diesem Projekt.

---

## 6. Pfade, die vor RLS-Aktivierung umgebaut werden müssen (dokumentierte Lücke)

**`helmut_store` (der komplette V2-JSON-Blob) bleibt in diesem Sprint
bewusst auf `service_role`.** Betroffen: `readStore`/`writeStore`/
`readSupabaseStore`/`writeSupabaseStore` und alle darauf aufbauenden
Funktionen (`getTasks`, `getUserNotes`, `saveTask`, `getInteractions`,
`readAuthStore`/`writeAuthStore` u. v. a.) — **dutzende Aufrufer**, sowohl aus
Cron-Jobs als auch aus Live-Requests (`/api/tasks`, `/api/app/start` via
`activeProfile`).

**Warum nicht in diesem Sprint umgebaut:**
1. Eine einzelne Blob-Zeile (`main-p-<politicianId>`) trägt **viele** fachlich
   unterschiedliche Sub-Ressourcen (Tasks, Notizen, Crawl-Runs, Lage-Checks,
   Pipeline-Debug-Reports) in einem JSON-Dokument — anders als die klar
   abgegrenzten V3-Relationstabellen ist hier nicht jede einzelne Lese-/
   Schreiboperation ein sauber isolierbarer REST-Call.
2. Drei ID-Klassen (`main` geteilt, `main-auth` **alle** Logins in einer
   Zeile, `main-p-<id>` pro Mandant) — ein Umbau muss präzise zwischen ihnen
   unterscheiden (die Sprint-2-Policy tut das bereits: `helmut_store` erlaubt
   nur `SELECT` auf `main-p-<tenant>`), aber die **Schreibpfade** sind in der
   App so verwoben (Read-Modify-Write auf das gesamte Blob), dass eine
   naive Umstellung leicht `main`/`main-auth`-Zugriffe fälschlich mit
   hineinzieht.
3. **Kein funktionaler Nachteil durch das Aufschieben:** Solange diese Pfade
   auf `service_role` bleiben, sind sie von RLS **unberührt** — auch nach
   einer Aktivierung der Sprint-2-Policies funktioniert der Blob-Store exakt
   wie heute. Es ist eine **fehlende Härtung**, keine **Regression**.

**Folge für die Rollout-Reihenfolge (§ `docs/rls-activation-rollout.md`):**
Die `helmut_store`-Policy aus der Migration kann **sicher aktiviert** werden,
ohne dass sie je vom laufenden Code ausgewertet wird (der Code sendet dafür
nie ein Tenant-JWT) — sie ist reine Vorbereitung für einen späteren, hier
nicht enthaltenen Blob-Store-Umbau.

---

## 7. Kompakte Gesamtübersicht (alle 24 Tabellen, Identitäts-Zuordnung)

| Kategorie | Tabellen | Identität heute | Identität nach voller Aktivierung |
|---|---|---|---|
| **A — Live, jetzt JWT-fähig** | `decisions`\*, `matching_results`, `office_outputs`, `briefings` | service_role | `authenticated` + JWT (flag-gated, implementiert) |
| **B — Backend-Bulk, bleibt service_role** | `decisions`\* (Cron-Schreiblast), `matching_results`\* (Cron), `profile_embeddings` | service_role | service_role (bewusst) |
| **C — geteilt/mandantenlos** | `knowledge_objects`, `raw_documents`, `ko_document_links`, `ko_relations`, `sources` | service_role | service_role (RLS `shared_read`-Policy inert, da kein Umstellungsbedarf) |
| **D — dokumentierte Lücke** | `helmut_store` (+ alle Blob-Funktionen) | service_role | service_role (Folge-Sprint nötig für Wirkung) |
| **E — tote V1/V2-Tabellen** | `profiles`, `mandate_profiles`, `political_items`, `personalized_recommendations`, `daily_tasks`, `communication_drafts`, `user_notes`, `priority_changes`, `interactions`, `topic_memory`, `matching_weights`, `llm_usage` | kein Zugriff (0 Zeilen, kein Code-Pfad) | irrelevant — Policies existieren für Hygiene, werden nie ausgewertet |
| **F — operational** | `pipeline_locks` | kein REST-Zugriff | irrelevant |

\* `decisions`/`matching_results` sind **hybrid**: derselbe Tabellenname wird
sowohl von einem Live-Read (`listMatchingResults`, jetzt JWT-fähig) als auch
von einem Backend-Bulk-Write (`saveDecisions`/`saveMatchingResults`, bleibt
service_role) angesprochen — das ist korrekt und beabsichtigt (Lesen durch
eine Person vs. Schreiben durch die Pipeline sind unterschiedliche
Identitäten für dieselbe Tabelle).

---

## 8. Risiken & Grenzen dieses Sprints

- **Kein funktionales Risiko für den Pilotmandanten (`<pilot-mandats-id>`) heute:** `HELMUT_TENANT_JWT_MODE`
  ist in Production nicht gesetzt → jeder der acht Pfade verhält sich exakt
  wie vor diesem Sprint.
- **Aktivierungsvoraussetzung, die NICHT Teil dieses Sprints ist:**
  `SUPABASE_JWT_SECRET` (das echte Projekt-Secret aus dem Supabase-Dashboard)
  und `SUPABASE_ANON_KEY` müssten als **neue Production-Secrets** in Vercel
  gesetzt werden — das ist laut Auftrag ein expliziter Freigabepunkt und wurde
  **nicht** ausgeführt.
- **`llm_usage`-Doppelspalte** (`user_id`/`politician_id`) bleibt wie in
  Sprint 2 dokumentiert unangetastet — betrifft ohnehin nur die tote Tabelle
  (Kategorie E).
