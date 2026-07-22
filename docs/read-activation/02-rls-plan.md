# Aufgabe 2 — Vollständiger RLS-Plan (je Tabelle)

**Modus:** reiner Plan. **Keine Migration erstellt, keine Policy geändert.** Die
Policy-Definitionen unten beschreiben den **Zielzustand nach Aktivierung**; die Basis
(`20260712_tenant_rls_policies.sql`) liegt bereits inert in Production.

> **Ausgangspunkt (verifiziert).** 24 Tabellen in `public`. RLS ist auf 24 Tabellen
> aktiviert; 23 Policies existieren (Kategorie A/B + Sonderfälle). Alle Policies sind
> `TO authenticated` gescoped, **nie** `TO anon`. Helper: `helmut_current_tenant()` liest
> `nullif(auth.jwt() ->> 'user_id', '')`.

---

## 1. Änderung gegenüber dem Bestand: Read-only-Rolle statt `for all`

Die bestehenden Tenant-Policies sind `for all to authenticated` (Lesen **und** Schreiben).
Für den **Secure Read Path** brauchen wir **Lesen** über die neue Rolle `helmut_reader`
(kein Schreibrecht). Es gibt zwei gleichwertige Wege, das zu erreichen — **beide sind reine
Vorbereitung, keiner ist in diesem Sprint umzusetzen**:

- **Weg 1 (empfohlen, minimal-invasiv): Rolle trägt keine Schreibgrants.** Die vorhandene
  `for all`-Policy bleibt; die Rolle `helmut_reader` erhält per **GRANT nur `SELECT`**.
  INSERT/UPDATE/DELETE scheitern dann bereits an fehlenden **Tabellen-Grants**, bevor die
  Policy überhaupt greift. Weniger DDL, keine neue Policy nötig. Siehe
  [`03-read-only-rolle.md`](03-read-only-rolle.md).
- **Weg 2 (explizit, mehr DDL): dedizierte SELECT-Policy.** Zusätzlich zur `for all`-Policy
  eine `for select to helmut_reader using (user_id = helmut_current_tenant())`. Macht die
  Leseabsicht im Policy-Katalog sichtbar, verdoppelt aber die Policy-Zahl.

Der Plan unten nennt für jede Tabelle die **Read-Rolle** und **Write-Rolle** getrennt und
setzt Weg 1 als Default voraus (Grant-basierte Read-only-Trennung).

---

## 2. Policy-Matrix — alle 24 Tabellen

Legende: **RLS?** = RLS aktiviert · **Read** = wer liest im Zielbild · **Write** = wer
schreibt · **Policy** = maßgebliche Policy · **Claim** = benötigter JWT-Claim.

### Kategorie A — Tenant-scoped (Spalte `user_id`)

| Tabelle | RLS? | Read | Write | Policy | Claim |
|---------|------|------|-------|--------|-------|
| `decisions` | ✅ | `helmut_reader` (SELECT) | `service_role` (Cron-Bulk) | `tenant_isolation` `using (user_id = tenant())` | `user_id` |
| `matching_results` | ✅ | `helmut_reader` | `service_role` | `tenant_isolation` | `user_id` |
| `office_outputs` | ✅ | `helmut_reader` | `service_role`¹ | `tenant_isolation` | `user_id` |
| `briefings` | ✅ | `helmut_reader` | `service_role`¹ | `tenant_isolation` | `user_id` |
| `profile_embeddings` | ✅ | `service_role`² | `service_role` | `tenant_isolation` | `user_id` |
| `mandate_profiles` | ✅ | `helmut_reader`³ | `service_role` | `tenant_isolation` | `user_id` |
| `political_items` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `personalized_recommendations` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `daily_tasks` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `communication_drafts` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `user_notes` | ✅ | (tot)⁴ | (tot) | `tenant_isolation` | `user_id` |
| `priority_changes` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `interactions` | ✅ | (tot)⁴ | (tot) | `tenant_isolation` | `user_id` |
| `topic_memory` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |
| `matching_weights` | ✅ | (tot) | (tot) | `tenant_isolation` | `user_id` |

¹ `saveOfficeOutput`/`saveRenderedBriefingV3` sind Live-Writes im Nutzer-Request; sie
bleiben in Phase 1–3 auf `service_role` (Write über den Reader ist ausgeschlossen). Ein
späterer Schreib-Cutover auf eine `authenticated`-Schreibrolle ist ein **eigener** Schritt
außerhalb dieses Read-Sprints.
² `profile_embeddings` wird nur backend-seitig geschrieben/gelesen (Matching-Shadow); kein
Nutzer-Read → bleibt `service_role`, Policy existiert nur zur Hygiene.
³ nur relevant, wenn `HELMUT_PROFILE_DB_MODE` aktiv wäre (heute aus → Profile aus Blob).
⁴ `user_notes`/`interactions` als **Relationstabellen** sind tot (0 Zeilen); die
tatsächlichen Notizen/Interaktionen liegen im `helmut_store`-Blob (`getUserNotes`/
`getInteractions`, service_role, App-Guard-gehärtet).

### Sonderfall — `llm_usage`

| Tabelle | RLS? | Read | Write | Policy | Claim |
|---------|------|------|-------|--------|-------|
| `llm_usage` | ✅ | (tot) | `service_role` | `tenant_isolation` `using (user_id = tenant() OR politician_id = tenant())` | `user_id` |

Doppelte Tenant-Spalte (`user_id` **und** `politician_id`) — Policy deckt beide defensiv ab.
Keine Spaltenmigration in diesem Plan.

### Sonderfall — `profiles`

| Tabelle | RLS? | Read | Write | Policy | Claim |
|---------|------|------|-------|--------|-------|
| `profiles` | ✅ | `helmut_reader`³ | `service_role` | `tenant_isolation` `using (id = tenant())` | `user_id` |

Hier **ist** `id` der Mandant (keine `user_id`-Spalte). FK-Ziel von 15 Tabellen → Policy
korrekt, auch wenn heute nicht per REST gelesen.

### Sonderfall — `helmut_store` (Blob)

| id-Klasse | RLS? | Read | Write | Policy |
|-----------|------|------|-------|--------|
| `main-p-<tenant>` (pro Mandant) | ✅ | `helmut_reader` (SELECT) | `service_role` | `tenant_isolation_select` `using (id = 'main-p-' || tenant())` |
| `main` (geteilt: Katalog, Crawl-Runs) | ✅ | `service_role` | `service_role` | **keine** Policy → impliziter Deny für Reader |
| `main-auth` (**alle** Accounts/Sessions) | ✅ | `service_role` | `service_role` | **keine** Policy → impliziter Deny (sicherheitskritisch) |

**Kritische Invariante:** Die Policy matcht **nur** `main-p-<tenant>`. `main` und das
hochsensible `main-auth` (alle Logins in einer Zeile) bleiben für jede Nicht-service_role-
Rolle gesperrt. Der Reader darf `main-auth` **niemals** sehen — das ist per fehlender Policy
strukturell garantiert.

### Kategorie B — geteilter Korpus (mandantenlos, kein Tenant-Bezug)

| Tabelle | RLS? | Read | Write | Policy | Claim |
|---------|------|------|-------|--------|-------|
| `knowledge_objects` | ✅ | `helmut_reader` (alle) | `service_role` (Crawl) | `shared_read` `using (true)` | keiner (nur `role`) |
| `raw_documents` | ✅ | `helmut_reader` | `service_role` | `shared_read` | keiner |
| `ko_document_links` | ✅ | `helmut_reader` | `service_role` | `shared_read` | keiner |
| `ko_relations` | ✅ | `helmut_reader` | `service_role` | `shared_read` | keiner |
| `sources` | ✅ | `helmut_reader` | `service_role` | `shared_read` | keiner |

Jeder Mandant liest denselben Wissenskorpus (Kostenmodell „einmal verstehen, mehrfach
bewerten"). **Kein** Tenant-Claim nötig, aber die `authenticated`/Reader-Rolle (nicht
`anon`). Schreiben bleibt exklusiv `service_role`.

### Kategorie C — operativ

| Tabelle | RLS? | Read | Write | Policy | Claim |
|---------|------|------|-------|--------|-------|
| `pipeline_locks` | ✅ | `service_role` | `service_role` | **keine** (impliziter Deny) | — |

Keine Nutzerdaten (nur `job_name`/Sperrzeiten). Reader hat hier **nichts** zu suchen.

---

## 3. Zusammenfassung: braucht die Tabelle RLS?

| Klasse | Tabellen | RLS-Bewertung |
|--------|----------|---------------|
| **RLS zwingend, Tenant-Filter** | `decisions`, `matching_results`, `office_outputs`, `briefings`, `mandate_profiles`, `profiles`, `helmut_store` (main-p) | Ja — tragen echte Mandantendaten, werden (künftig) über Reader gelesen |
| **RLS zwingend, Deny-only** | `helmut_store` (main-auth, main), `pipeline_locks` | Ja — müssen für Reader **gesperrt** bleiben |
| **RLS als Hygiene (Read bleibt service_role)** | `profile_embeddings`, `llm_usage`, alle 9 toten V1/V2-Tabellen | Ja aktiviert, aber praktisch nie ausgewertet |
| **RLS = shared_read** | `knowledge_objects`, `raw_documents`, `ko_document_links`, `ko_relations`, `sources` | Ja — Lesen für Reader erlaubt, Schreiben gesperrt |

**Kein Downgrade nötig:** RLS ist auf allen 24 Tabellen bereits aktiv. Der Aktivierungs-
schritt fügt **keine** neue Tabellen-RLS hinzu — er ergänzt nur die **Read-only-Rolle** und
deren Grants (Aufgabe 3) und schaltet die **Token-Ausstellung** (Aufgabe 4) scharf.

---

## 4. Benötigte Claims (gesamt)

| Claim | Zweck | Ohne → Verhalten |
|-------|-------|------------------|
| `role` = `helmut_reader` | wählt die Read-only-Rolle in PostgREST | ohne → `anon`/Deny (kein Grant erreichbar) |
| `user_id` = `<politicianId>` | Tenant-Filter in `helmut_current_tenant()` | fehlt/leer → NULL → Kategorie-A-Policies verweigern (0 Zeilen) |
| `exp`/`iat` | Kurzlebigkeit | abgelaufen → PostgREST lehnt Token ab → fail-closed |

Kategorie-B-Reads (`shared_read`) brauchen **nur** `role`, **keinen** `user_id`-Claim.

---

## 5. Rollback-Strategie (pro Ebene)

| Ebene | Rollback | Wirkung auf Betrieb |
|-------|----------|---------------------|
| **Policies** | `20260712_tenant_rls_policies_rollback.sql` (droppt alle `tenant_isolation`/`shared_read`/`tenant_isolation_select`-Policies + Helper-Fn) | Keine — App nutzt weiter service_role; RLS-Rücknahme ist NO-OP, solange Reader-Pfad aus |
| **Read-only Rolle** | `drop owned by helmut_reader; drop role helmut_reader;` (nur wenn angelegt) | Keine — Rolle wird ohne aktiven Token-Pfad nie benutzt |
| **Token-Ausstellung** | GoTrue-Ausgabe deaktivieren / Feature-Flag `HELMUT_READER_MODE` auf `0` | Sofortiger Rückfall auf Legacy-Read (service_role) |
| **App-Read-Zweig** | `git revert` des `tenantReadRequest`-Zweigs | Keine, solange Flag aus |

Die vier Ebenen sind **orthogonal** und **einzeln** zurückrollbar (dasselbe Prinzip wie in
`docs/rls-activation-rollout.md` §7). Kein Rollback berührt eine **Datenzeile** — alle sind
additiv-invers (Policies/Rolle/Grants), kein `DROP` an Daten oder Spalten.

**Reihenfolge bei Vollrücknahme:** App-Read-Zweig aus (Flag) → Token-Ausstellung aus →
(optional) Rolle droppen → (optional) Policies-Rollback. Der erste Schritt allein stellt
bereits den vollständigen Legacy-Zustand her.
