# RLS-Tenant-Policies — Sprint 2 (P0-2), vollständig verifizierter Entwurf

> **STATUS: ENTWURF — NICHT ANGEWENDET.** Migration + Rollback liegen als
> vorbereitete, NICHT ausgeführte SQL-Dateien vor:
> `supabase/migrations/20260712_tenant_rls_policies.sql` /
> `..._rollback.sql`. Dieses Repo hat **keine** CI/CD-Automatisierung, die
> Dateien aus `supabase/migrations/` automatisch einspielt (verifiziert:
> kein `supabase db push`, kein Migration-Runner in `.github/workflows` oder
> `scripts/vercel-deploy.sh`). Anwendung geschieht ausschliesslich manuell
> durch einen Menschen, analog zu `20260711_presale_hardening.sql`.
> **In Sprint 2 wurde nichts an der Produktionsdatenbank geändert.**

Bezug: `audit/saas-risk-matrix.md` #1, `audit/fix-plan.md` P0-2. Baut auf dem in
Sprint 1 umgesetzten **P0-1** auf (App-seitiger Tenant-Guard,
`lib/helmut/storage.js` `assertTenant`/`assertTenantRows`).

**Änderung gegenüber der Sprint-1-Fassung dieses Dokuments:** Der ursprüngliche
Entwurf (Option A: „SET LOCAL app.user_id") war technisch nicht umsetzbar (siehe
§1). Sprint 2 hat das vollständig gegen Schema, echte Queries, Auth-Modell und
Rollen-Grants verifiziert und korrigiert. Alle Aussagen unten sind mit
Belegen aus der Live-Datenbank (Supabase `ddckuvvpcytqbyfmbvie`, 2026-07-12,
read-only) unterlegt.

---

## 1. Korrektur des Transportmechanismus (zentraler Sprint-2-Befund)

- Die App verbindet sich mit Supabase **ausschliesslich über PostgREST-HTTP**
  (`fetch` gegen `/rest/v1/...`) mit einem **statischen** Header
  `Authorization: Bearer <service_role_key>` für **jeden** Request
  (`lib/helmut/storage.js` `supabaseRequest`, Zeile ~1231). **Keine**
  Postgres-Client-Bibliothek (`package.json`: `"dependencies": {}`).
- **`SET LOCAL app.user_id = ...` (Sprint-1-Entwurf) ist über diesen Transport
  nicht umsetzbar** — PostgREST bietet keinen Kanal, um beliebige SQL-Statements
  vor einer Query auszuführen; jede REST-Anfrage läuft in einer eigenen,
  kurzlebigen Session.
- **Korrekter, Supabase-nativer Mechanismus für stateless PostgREST: JWT-Claims.**
  Verifiziert vorhanden in diesem Projekt: `auth.jwt()`, `auth.role()`,
  `auth.uid()` (Abfrage gegen `pg_proc`/`pg_namespace`, Schema `auth`). Policies
  lesen den Mandanten aus einem **pro Request signierten JWT-Claim** `user_id`,
  gesendet mit der Rolle **`authenticated`** (nicht `service_role`).
- **Kritischer Rollen-Befund:** `anon` **und** `authenticated` haben **heute
  bereits volle CRUD-Grants** (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) auf **alle
  24 Tabellen** (`information_schema.role_table_grants`, Supabase-Default-
  Bootstrap). **RLS mit 0 Policies ist aktuell die einzige Barriere.** Policies
  werden deshalb explizit `TO authenticated` gescoped — **nie** `TO anon` — damit
  ein anonymer Aufrufer (kein gültiges JWT) auch nach dieser Migration
  vollständig ausgeschlossen bleibt.
- **Die App nutzt heute für jeden Tenant-Pfad den `service_role`-Key
  (BYPASSRLS).** Diese Migration ändert daran nichts. Solange die App nicht auf
  JWT-Minting + `authenticated`-Rolle umgestellt wird (separater, **nicht** in
  diesem Sprint enthaltener Folgeschritt), ist das Anwenden dieser Migration
  **funktional wirkungslos** für den laufenden Piloten (cem-ince) — reine
  Defense-in-Depth-Vorbereitung. Das ist die Grundlage für „Pilotbetrieb nicht
  beeinträchtigt" (§6).

---

## 2. Live-vs-tote Tabellen (verifiziert per Code-Grep)

Von den 24 Tabellen werden **9** von der App tatsächlich über `/rest/v1/...`
angesprochen (grep auf `lib/helmut/storage.js`):

`helmut_store, decisions, matching_results, office_outputs, profile_embeddings,
briefings, knowledge_objects, raw_documents, ko_document_links` (+ RPC
`match_knowledge_objects`).

Die übrigen **15** sind V1/V2-Aspirationsschema aus `supabase/schema.sql` — **0
Zeilen, kein Code-Pfad, niemals per REST erreicht**:
`profiles` (App liest Profile aus dem `helmut_store`-Blob, **nicht** aus dieser
Tabelle — verifiziert: 0 Treffer für `/rest/v1/profiles`), `mandate_profiles,
political_items, personalized_recommendations, daily_tasks,
communication_drafts, user_notes, priority_changes, interactions, topic_memory,
matching_weights, llm_usage, ko_relations, sources, pipeline_locks`.

Sie erhalten trotzdem konsistente Policies (Hygiene + Zukunftssicherheit, siehe
§4) — das berührt **keinen** produktiven Pfad, weil sie ohnehin nie gelesen
werden.

---

## 3. Policy-Matrix pro Tabelle (alle 24, begründet)

| Tabelle | Live/Tot | Tenant-Spalte | Prädikat | Rollen | Begründung |
|---|---|---|---|---|---|
| `decisions` | **LIVE** | `user_id` | `user_id = tenant()` | authenticated | Priorisierte Vorgänge pro Mandat — Kernleck-Kandidat aus P0-1 |
| `matching_results` | **LIVE** | `user_id` | `user_id = tenant()` | authenticated | Wie decisions; P0-1-Guard bereits app-seitig aktiv |
| `office_outputs` | **LIVE** | `user_id` | `user_id = tenant()` | authenticated | Generierte Kommunikationsentwürfe — sensibel |
| `profile_embeddings` | **LIVE** | `user_id` (PK) | `user_id = tenant()` | authenticated | Profil-Vektor pro Mandat |
| `briefings` | **LIVE** | `user_id` | `user_id = tenant()` | authenticated | Lage-Cache; `id` enthält `user_id` bereits, aber Spalten-Policy ist robuster als ID-Parsing |
| `mandate_profiles` | tot (0 Zeilen) | `user_id` (PK) | `user_id = tenant()` | authenticated | V1/V2-Schema, FK auf `profiles`; Hygiene |
| `political_items` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `personalized_recommendations` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `daily_tasks` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `communication_drafts` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `user_notes` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene (App nutzt `helmut_store`-Blob) |
| `priority_changes` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `interactions` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene (App nutzt Blob) |
| `topic_memory` | tot | `user_id` | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `matching_weights` | tot | `user_id` (PK) | `user_id = tenant()` | authenticated | V1/V2-Schema; Hygiene |
| `llm_usage` | tot | `user_id` **und** `politician_id` | `user_id = tenant() OR politician_id = tenant()` | authenticated | **Schema-Inkonsistenz** (zwei Tenant-Spalten, keine kanonisch) — Prädikat deckt defensiv beide ab; Spalten-Bereinigung nicht Teil dieses Sprints |
| `profiles` | tot (per REST) | **`id` selbst** | `id = tenant()` | authenticated | Keine `user_id`-Spalte — die Zeile **ist** der Mandant. FK-Ziel von 15 Tabellen; Selbstzugriff korrekt für künftige Nutzung |
| `helmut_store` | **LIVE** | keine Spalte, **ID-Präfix** | `id = 'main-p-' \|\| tenant()`, **nur SELECT** | authenticated | Drei ID-Klassen verifiziert (`main`=geteilt, `main-auth`=**alle** Logins in 1 Zeile, `main-p-<id>`=pro Mandat). Nur das `main-p-`-Muster matcht — `main`/`main-auth` bleiben für jede Nicht-Service-Rolle implizit gesperrt (kein Policy-Treffer). Kein Schreibzugriff (App schreibt exklusiv über service_role) |
| `knowledge_objects` | **LIVE** | keine (geteilt) | `true`, **nur SELECT** | authenticated | Parlamentarischer Korpus ist bewusst mandantenlos (jeder Mandant braucht denselben Datenbestand) |
| `raw_documents` | **LIVE** | keine (geteilt) | `true`, nur SELECT | authenticated | Wie knowledge_objects |
| `ko_document_links` | **LIVE** | keine (geteilt) | `true`, nur SELECT | authenticated | Verknüpfungstabelle, mandantenlos |
| `ko_relations` | tot | keine (geteilt) | `true`, nur SELECT | authenticated | Mandantenlos, aktuell 0 Zeilen |
| `sources` | tot | keine (geteilt) | `true`, nur SELECT | authenticated | Mandantenlos; App nutzt hartkodierte `sources.js`, nicht diese Tabelle |
| `pipeline_locks` | tot | keine (job_name) | **keine Policy** | — | Operative Sperren, keine Nutzerdaten; App liest Locks aus dem Blob, nicht dieser Tabelle. RLS bleibt aktiviert, bewusst ohne Policy → impliziter Deny für alle Nicht-Service-Rollen (Status quo, keine Änderung nötig) |

**Schreibzugriff bei geteilten Tabellen (Kategorie B):** bewusst **keine**
INSERT/UPDATE/DELETE-Policy für `authenticated` — das bleibt exklusiv
`service_role` vorbehalten (automatisch verweigert ohne passende Policy).

---

## 4. Migration & Rollback

- **Migration:** `supabase/migrations/20260712_tenant_rls_policies.sql` — additiv,
  idempotent (`create or replace` / `drop policy if exists` + `create policy`),
  in einer Transaktion (`begin`/`commit`), keine Datenlöschung, keine
  Spaltenänderung.
- **Rollback:** `supabase/migrations/20260712_tenant_rls_policies_rollback.sql` —
  entfernt ausschliesslich die neu erzeugten Policies + die Helper-Funktion
  `helmut_current_tenant()`. Ergebnis danach identisch zum heute (2026-07-12)
  verifizierten Ausgangszustand: RLS auf allen 24 Tabellen aktiviert, 0
  Policies.
- **Beide Dateien wurden in Sprint 2 ausschliesslich vorbereitet, nicht
  ausgeführt.**

---

## 5. Betroffene Service-Role-Pfade (geprüft, nicht geändert)

Alle mandantenbezogenen Lese-/Schreibpfade laufen heute über `service_role`
(`lib/helmut/storage.js`, `supabaseRequest`):

| Pfad | Tabelle(n) | Tenant-Scoping heute (nach P0-1) |
|---|---|---|
| `listDecisions` / `saveDecisions` | `decisions` | `assertTenant`/`assertTenantRows` (P0-1) |
| `listMatchingResults` / `saveMatchingResults` | `matching_results` | `assertTenant`/`assertTenantRows` (P0-1) |
| `getOfficeOutput` / `listOfficeOutputsByUser` / `canSpendOfficeOutput` / `saveOfficeOutput` | `office_outputs` | `assertTenant` (P0-1) |
| `getProfileEmbedding` / `saveProfileEmbedding` | `profile_embeddings` | `assertTenant` (P0-1, Read) |
| `getRenderedBriefingV3` / `saveRenderedBriefingV3` | `briefings` | `userId`-Pflichtparameter, deterministische `id` (`bf-<user>-<slot>-<day>`) |
| Crawl/Understanding-Kette | `knowledge_objects`, `raw_documents`, `ko_document_links` | mandantenlos (korrekt, kein Scoping nötig) |
| `readSupabaseStore`/`writeSupabaseStore` | `helmut_store` | physisch getrennte Zeilen (`main`, `main-p-<id>`, `main-auth`) |

**In Sprint 2 wurde an keinem dieser Pfade Code geändert.** Die Migration fügt
ausschliesslich DB-seitige Policies hinzu, die für `service_role` irrelevant
sind (BYPASSRLS).

---

## 6. Risiken für den Einzelpiloten (cem-ince)

- **Anwenden der Migration (falls/wenn freigegeben): kein funktionales Risiko
  für den laufenden Betrieb.** Die App nutzt weiterhin `service_role`
  (RLS-Bypass) für alle Tenant-Pfade — die neuen Policies werden von der
  laufenden App schlicht nie ausgewertet, bis eine separate App-Änderung
  (JWT-Minting + Rollenwechsel) erfolgt.
- **RLS-Aktivierung ist bereits Status quo** (alle 24 Tabellen seit vorherigem
  Zustand `RLS enabled`) — die Migration ändert daran nichts, sie ergänzt nur
  Policies. Kein zusätzliches „Enable RLS"-Risiko.
- **Echtes Risiko liegt ausschliesslich im NICHT in diesem Sprint enthaltenen
  Folgeschritt** (App auf JWT/`authenticated` umstellen): dort müsste bei
  fehlerhaftem Claim-Mapping ein Pilot leere Tenant-Tabellen sehen (fail-closed,
  konsistent mit dem bestehenden Fail-safe-Designprinzip der App — Leerzustand
  statt Crash, aber dennoch ein sichtbarer Ausfall ohne sorgfältigen Test vorab).
  Deshalb ausdrücklich **nicht** Teil dieses Sprints.
- **Reihenfolge-Risiko bei künftiger Umsetzung:** Migration zuerst anwenden
  (sicher, No-Op), App-Wiring **danach** und **einzeln getestet**, bevor
  Produktions-Traffic umgestellt wird. Beide Schritte **nie gleichzeitig**.
- **`helmut_store`-Sonderfall:** Die `main-auth`-Zeile enthält **alle**
  Account-/Login-Daten in einer einzigen JSON-Zeile. Die Policy lässt diese ID
  bewusst **durch kein Muster matchen** — sie bleibt für jede Nicht-Service-Rolle
  vollständig unsichtbar. Ein Fehler in der Musterlogik hier wäre der
  gravierendste denkbare Fehler (Exposition aller Logins); deshalb exakt
  getestet (§7, Test 6).

---

## 7. Teststrategie & ausgeführte Tests

**Ausgeführt (lokal, deterministisch, keine Netzwerk-/DB-Verbindung):**
`scripts/rls-policy-simulation-test.js` (`npm run test:rls-policy-sim`) —
**28/28 grün**. Jedes SQL-Prädikat aus der Migration wurde 1:1 als JS-Funktion
nachgebildet und gegen einen synthetischen Mehr-Mandanten-Datensatz geprüft:

1. Deny ohne Tenant-Kontext (fehlender/leerer JWT-Claim) — alle Kategorie-A-Tabellen → 0 Zeilen.
2. Cross-Tenant-Isolation — Mandant A sieht nie Mandant B (decisions, office_outputs).
3. Erlaubter Zugriff innerhalb desselben Tenants (positiv).
4. `llm_usage`-Sonderfall (zwei mögliche Tenant-Spalten).
5. `profiles`-Sonderfall (`id` ist der Mandant).
6. `helmut_store`-Sonderfall — **nur** `main-p-<tenant>` sichtbar, `main`/`main-auth`/fremdes Mandat **nie**.
7. `shared_read` — jeder authentifizierte Mandant liest denselben Korpus; `anon`-Rolle bleibt aussen vor.
8. `pipeline_locks` — keine Policy → impliziter Deny für authenticated/anon; `service_role` (Bypass) sieht weiterhin alles.
9. `anon`-Rolle mit vollen CRUD-Grants, aber ohne gültiges JWT → 0 Zeilen (Grants allein reichen nicht — RLS ist die wirksame Barriere).

**Bewusste Grenze dieser Tests:** Es handelt sich um eine **Logik-Simulation**,
keine Ausführung gegen eine echte Postgres-Instanz. Eine Live-Verifikation
(SQL-Syntax, tatsächliche `pg_policies`-Wirkung, echte PostgREST-Antworten)
wurde **nicht** durchgeführt — das hätte DDL gegen die Produktionsdatenbank
erfordert (auch versuchsweise in einer zurückgerollten Transaktion), was der
Auftrag explizit ausschliesst.

**Empfohlener nächster Verifikationsschritt (NICHT Teil dieses Sprints, eigene
Freigabe nötig):** Anwendung der Migration auf einer **isolierten
Supabase-Preview-Branch** (kostenpflichtig, `mcp__Supabase__create_branch` +
`confirm_cost`), dort:
(a) Migration anwenden, `pg_policies` gegen die erwartete Zeilenzahl (22, siehe
Kommentar am Ende der Migrationsdatei) prüfen;
(b) mit einem testweise gemintenten JWT (`authenticated`, Claim `user_id`) echte
PostgREST-Calls gegen zwei synthetische Mandanten fahren und Cross-Tenant-Leck
sowie Deny-ohne-Claim empirisch bestätigen;
(c) Rollback anwenden, `pg_policies`-Zahl wieder auf 0 verifizieren;
(d) Branch löschen.
Dieser Schritt wurde in Sprint 2 **nicht** ausgeführt (Kosten-/Freigabepflicht
für Cloud-Ressourcen, analog zur Zurückhaltung bei Production-Migrationen).

**Bestehende App-seitige Suite unverändert relevant:**
`scripts/tenant-guard-test.js` (P0-1, 37/37) bleibt die Verifikation der
**App-Schicht**; die neue Suite verifiziert die **DB-Schicht**-Logik. Beide
zusammen decken Defense-in-Depth wie vom Auftrag gefordert ab.

---

## 8. Nicht Teil von Sprint 2

- **Keine** Anwendung der Migration auf Production.
- **Keine** Änderung an Watchdog, App-Start, Radar, Lage, Matching oder Quellen.
- **Keine** App-seitige JWT-Minting-/Rollenwechsel-Implementierung (separater,
  eigens freizugebender Folgeschritt — siehe §6).
- **Keine** Schema-Bereinigung der `llm_usage`-Doppelspalte (`user_id` vs.
  `politician_id`) — nur als Prädikat-Absicherung behandelt.
- **Keine** Live-Verifikation auf einer Supabase-Branch (Kosten-/Freigabepflicht,
  §7).
