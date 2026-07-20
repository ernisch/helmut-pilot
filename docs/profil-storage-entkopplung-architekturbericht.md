# Architekturbericht: Entkopplung des Mandatsprofil-Speichers vom `helmut_store`-Blob

> Phase 1–3 (Read-Only-Audit, Zielarchitektur, Umsetzungsplan). **Keine Implementierung.**
> Stand: 2026-07-20 · Branch-Ziel: `claude/profile-auth-storage-decouple-452fp1`
> Diff-Basis: `main` @ `9f0db65`

---

## 1. Executive Summary

Mandatsprofile liegen heute **im geteilten JSON-Blob** `helmut_store` (Zeile `id='main'`, Spalte `data` jsonb), unter den Schlüsseln `profiles{}` und `mandateProfiles{}`. **Jeder** Profil-Schreibvorgang (`PATCH /api/profile/current`, Onboarding-Per-Schritt-Persistenz, Admin-Schnellstart) führt ein **Voll-Read-Modify-Write des gesamten Mehr-MB-Blobs** aus — inklusive globaler Inhalte (Quellenkatalog, Rohartikel, Crawl-Läufe) **und der Profile aller anderen Mandanten**.

Daraus folgt der große Blast Radius:

- **Lost Update / mandantenübergreifendes Überschreiben (P0):** Der Supabase-Upsert ersetzt die komplette `data`-JSONB (`merge-duplicates` = last-write-wins auf Zeilenebene). Zwei parallele Speichervorgänge (zwei Mandate, oder zwei Referent:innen desselben Mandats, oder Profil-Save während eines Crawl-Writes) überschreiben sich **gegenseitig über alle Schlüssel hinweg** — der Save von Mandant A kann das gerade gespeicherte Profil von Mandant B (und Rohartikel etc.) zurücksetzen.
- **Timeouts (P0):** Der ~1,24-MB-Monolith läuft wiederkehrend in 10-s-Timeouts (dokumentiert als Audit R1); ein Profil-Save hängt an dieser Latenz.

**Die relationale Ziel-Infrastruktur existiert bereits, ist aber inert.** Die Tabellen `profiles` und `mandate_profiles` sind in Production migriert (inkl. `profil_extras jsonb` als verlustfreiem Auffangbehälter). Der SQL-Lese-/Schreibpfad (`getProfileFromDb`, `saveProfileToDb`, verlustfreier Roundtrip `toMandateProfileRow`/`fromMandateProfileRow`) ist implementiert und getestet, hängt aber hinter dem **standardmäßig ausgeschalteten** Flag `HELMUT_PROFILE_DB_MODE` (+ `HELMUT_V3_STORE`). Heute schreibt/liest die App **ausschließlich den Blob**.

**Empfehlung:** Die Entkopplung sollte **vor dem Pilotbetrieb** umgesetzt werden. Der Lost-Update-/Cross-Tenant-Defekt ist keine theoretische, sondern eine **aktive** Korrektheits- und Mandantentrennungs-Schwäche, die genau unter der nebenläufigen Mehrmandanten-Last eines Piloten auftritt. Da ~80 % der Zielarchitektur bereits gebaut sind (SQL-Pfad, Migrationen, Backfill-Skript in PR #112, Tests, Dual-Read-Fallback), ist der Restaufwand überwiegend **Verdrahtung + kontrollierter Cutover + wenige neue Tests** — risikoarm und per Flag reversibel.

---

## 2. Ist-Architektur

### 2.1 Aktueller Leseweg

```
GET /api/profile/current
  → server.js activeProfile(politicianId)                       [server.js:5435]
      → tenantContext.requireTenantId(...)                      (harter Fehler bei fehlendem Kontext)
      → storage.getProfile(politicianId)                        [storage.js:3495]
          ├─ wenn profileDbModeEnabled():                       [storage.js:3491]  ← Flag AUS in Prod
          │     getProfileFromDb(id)                            [storage.js:4188]
          │       → PostgREST-Embed: /profiles?id=eq.<id>&select=*,mandate_profiles(*)
          │       → fromMandateProfileRow(row, mandateRow)      [storage.js:4127]
          │       → Fehler/kein Treffer ⇒ null (Fallback)
          └─ Fallback / Flag AUS:
                readStore("main").profiles[id]                  [storage.js:3500]  ← LIEST GANZEN BLOB
      → mergeProfileDefaults(stored)  ODER  blankProfile(id)    [server.js:5495 / 5448]
```

- `getProfile` ist **SQL-first mit Blob-Fallback** (Dual Read) — aber nur wenn das Flag an ist. In Production ist das Flag aus, also **immer Blob**.
- `readStore("main")` liest die **komplette** `helmut_store`-Zeile `main` (10-s-In-Prozess-Cache pro `storeKey`, serverless praktisch wirkungslos, da jede Invocation eine eigene Instanz ist).

### 2.2 Aktueller Schreibweg

```
PATCH /api/profile/current  (auch Onboarding-Per-Schritt, Admin-Schnellstart, Admin-Profil-Update)
  → normalizeProfile(body, politicianId)                        [server.js:5532]
      → activeProfile(...)  (ERNEUTER Voll-Read zum Mergen der Basis)
  → storage.saveProfile(profile)                                [storage.js:3519]
      → readStore("main")                                       ← VOLL-READ des geteilten Blobs
      → store.profiles[id]        = profileWithMeta
      → store.mandateProfiles[id] = toMandateProfile(profile)   [storage.js:3992]  (abgeleitete Dublette)
      → writeStore(store, "main")                               [storage.js:151]
          → normalizeStore + compactStore (GANZER Blob)         [storage.js:2581]
          → writeSupabaseStore: POST /helmut_store {id:'main', data:<GANZER BLOB>}
                Prefer: resolution=merge-duplicates             ← VOLL-UPSERT, last-write-wins
      └─ wenn profileDbModeEnabled(): saveProfileToDb(profile)  [storage.js:4209]  (Dual Write, additiv)
            → upsert profiles(id,name,email)      on_conflict=id
            → upsert mandate_profiles(user_id,…)  on_conflict=user_id
```

- Der **Blob-Write ist immer die erste, garantierte Operation** (bewusste „Fallback-Treue"); der SQL-Write ist rein additiv und darf nie werfen.
- Transport für **alle** SQL-Zugriffe: `supabaseRequest` mit **`service_role`** (RLS-Bypass). `tenantRequest` fällt permanent auf `service_role` zurück, weil `tenantJwtModeEnabled()` fest `false` liefert (Supabase hat auf asymmetrische Signing-Keys umgestellt; selbst signierte HS256-Tokens werden abgelehnt — siehe `storage.js:2413–2434`).

### 2.3 Deployment-/Nebenläufigkeitskontext

- Vercel Serverless, Region `fra1`, `maxDuration=300s` (`vercel.json`). Mehrere gleichzeitige Requests = **mehrere Instanzen ohne gemeinsamen Cache**; jede macht ein eigenes Voll-Read-Modify-Write der `main`-Zeile.
- Es gibt **keinen** Lock und **keine** optimistische Nebenläufigkeitskontrolle um `saveProfile` / `writeStore("main")`.

---

## 3. Root Cause

Der `main`-Blob ist **ein einziges geteiltes JSONB-Dokument**, das drei fundamental verschiedene Datenklassen ko-lokalisiert:

1. **Globale** Betriebsdaten (`sources`, `rawItems`, `crawlRuns`, `adminSettings`),
2. **die Profile ALLER Mandanten** (`profiles{}`, `mandateProfiles{}`),
3. Reste/Legacy (`users`/`sessions`/`assignments` im Default-Schema — faktisch ungenutzt, Auth nutzt `main-auth`).

Weil eine Profiländerung technisch = „schreibe das ganze Dokument neu", gilt:

- **Keine Isolationsgrenze:** Der kleinste Profil-Edit ist an den größten geteilten Datenbestand gekoppelt → Größe → Timeout.
- **Write-Amplification über Mandantengrenzen:** `merge-duplicates` ersetzt die gesamte `data`-Zelle. Nebenläufige Writes kennen nur ihren eigenen alten Snapshot und schreiben ihn komplett zurück ⇒ **last-write-wins auf Zeilenebene ⇒ Lost Update quer über alle Mandanten und Datenklassen.**

Das ist der eigentliche Blast Radius: nicht die Profillogik, sondern die **geteilte Blob-Zeile als Schreibeinheit**.

---

## 4. Betroffene Dateien und Funktionen

| Datei | Funktion / Stelle | Rolle |
|---|---|---|
| `lib/helmut/storage.js` | `getProfile` (3495), `saveProfile` (3519), `listProfiles` (3509), `listFullProfiles` (3504) | Öffentliche Profil-API (Blob-first) |
| `lib/helmut/storage.js` | `getProfileFromDb` (4188), `saveProfileToDb` (4209) | Relationaler SQL-Pfad (gebaut, flag-gated) |
| `lib/helmut/storage.js` | `toMandateProfileRow` (4081), `fromMandateProfileRow` (4127), `MANDATE_PROFILE_COLUMNS` (4026), `collectProfileExtras` (4061) | Verlustfreies camelCase↔SQL-Mapping (+`profil_extras`) |
| `lib/helmut/storage.js` | `toMandateProfile` (3992) | **Blob-interne** abgeleitete Dublette `mandateProfiles{}` |
| `lib/helmut/storage.js` | `readStore`/`writeStore` (141/151), `normalizeStore` (2581), `readSupabaseStore`/`writeSupabaseStore` (233/246) | Blob-I/O (Voll-Read-Modify-Write) |
| `lib/helmut/storage.js` | `profileDbModeEnabled` (3491), `v3StoreReady` (1573), `tenantRequest` (2574), `supabaseRequest` (2381) | Flag-/Transport-Weichen (service_role) |
| `lib/helmut/storage.js` | `deleteProfileData` (3823), `deleteProfileDataV3` (3757), `exportProfileData` (3785) | DSGVO Lösch-/Export-Pfad (Blob + V3-Tabellen) |
| `server.js` | `/api/profile/current` (456), `/api/profile/demo` (476) | Lese-/Schreib-Endpunkte |
| `server.js` | `activeProfile` (5435), `normalizeProfile` (5532), `mergeProfileDefaults` (5495), `blankProfile` (5448) | Profil-Aufbereitung |
| `server.js` | Admin-User-Schnellstart-Save (1265), Admin-Profil-Update (1411), `/api/admin/tenant-mode` Diagnose (1488) | Weitere Schreibpfade + Live-Diagnose |
| `client.js` | `onboardingDraft` (173/730), Per-Schritt-PATCH & Settings-Save (10846, 11715) | Onboarding/Settings-Schreiber |

**Aufrufer von `getProfile`/`saveProfile`/`activeProfile`/`normalizeProfile`** (Kern): `server.js` `activeProfile`→`getProfile`; `/api/profile/current` GET/PATCH; `/api/profile/demo`; Admin-Pfade (1265, 1411); App-Start-Bootstrap (187); Scheduler/Briefing lesen über `activeProfile`. Auth-/Session-Pfad ruft **keinen** dieser Schreiber auf (siehe §5-Auth unten).

---

## 5. Vorhandene Tabellen und Speicherwege

### 5.1 `helmut_store` (der Blob) — `supabase/schema.sql:1–24`
```sql
create table public.helmut_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.helmut_store enable row level security;
```
Zeilenklassen: `main` (geteilt: Quellen, Rohartikel, **profiles**, **mandateProfiles**), `main-auth` (alle Accounts/Sessions), `main-p-<politicianId>` (pro-Mandant-Blob für Briefings/Tasks/Notes …).

### 5.2 `profiles` — `supabase/schema.sql:49–55` (Mandantenidentität)
```sql
create table public.profiles (
  id text primary key, email text, name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
`id` **ist** die politicianId/Mandanten-ID; FK-Ziel von 15 Kindtabellen. RLS aktiv, Policy `id = helmut_current_tenant()` — durch `service_role` aber **inert**. In Production bereits vorhanden (Presale-Hardening backfillt aus dem Blob + `helmut_ensure_profile()`-Trigger).

### 5.3 `mandate_profiles` — `supabase/schema.sql:57–79` + Migrationen
- PK/FK: `user_id text primary key references public.profiles(id) on delete cascade` → **upsert-fähig** (`on_conflict=user_id`), genau eine Zeile je Mandant, kaskadierendes Löschen.
- ~40 Spalten inkl. CHECK-Constraints (`politische_ebene ∈ {bundestag,landtag}`, `onboarding_status ∈ {neu,in_bearbeitung,abgeschlossen}`, Budget > 0).
- **`profil_extras jsonb`** (Migration `20260712_mandate_profile_completeness.sql`): verlustfreier Auffangbehälter für jedes nicht-spaltige/künftige Blob-Feld — die Brücke, die garantiert kein Feld beim Umzug verliert.
- RLS aktiv, Policy `user_id = helmut_current_tenant()` — durch `service_role` **inert**.

### 5.4 Auth-Speicher — **bereits entkoppelt**
`users`, `sessions`, `assignments` liegen im **separaten** kleinen Auth-Store (`helmut_store` Zeile `main-auth` bzw. lokal `auth.json`). `accounts.js` aliasiert `readAuthStore`/`writeAuthStore` als `readStore`/`writeStore` (Zeile 19) — Login/Session-Validierung/Logout lesen/schreiben **nie** `store.profiles` oder den `main`-Blob. Einzige Kopplung: der Status-Endpunkt `/api/auth/session` liest **read-only** Anzeigenamen via `getProfile` für den Profil-Umschalter. **⇒ Auth/Session sind vom Profil-Blob unabhängig** (erfüllt die spätere Beweispflicht bereits strukturell).

### 5.5 Migrationsstand (relevant)
Alle profil-/RLS-/budget-relevanten Migrationen sind vorhanden **mit Rollback-Pendant**: `20260712_mandate_profile_fields(.sql/_rollback)`, `…_completeness`, `20260712_tenant_rls_policies`, `20260717_llm_budget_reservation`. **Für die Entkopplung ist keine neue Migration nötig** (Zielschema existiert; so bestätigt auch PR #112).

---

## 6. Datenklassifikation des aktuellen Blobs (`main`)

| Klasse | Schlüssel im Blob | Zielort nach Umbau |
|---|---|---|
| **Global / geteilt** | `sources`, `rawItems`, `crawlRuns`, `adminSettings` | bleibt vorerst im `main`-Blob (nicht Teil dieses Umbaus; teils eigene Relationstabellen in Arbeit) |
| **Mandantenbezogen (Profil)** | `profiles{}`, `mandateProfiles{}` | **→ `profiles` + `mandate_profiles` (Ziel dieses Umbaus)** |
| **Mandantenbezogen (Inhalt)** | bereits ausgelagert nach `main-p-<id>` (briefings, tasks, notes, …) | unverändert |
| **Temporär / abgeleitet** | `profilValidierung` (wird in `normalizeProfile` vor dem Persistieren entfernt), `mandateProfiles{}` (Dublette aus `profiles{}`) | wird nicht mehr persistiert / entfällt |
| **Legacy / faktisch ungenutzt** | `users`, `sessions`, `assignments` im `main`-Default (Auth nutzt `main-auth`) | ignorieren; nicht Teil des Umbaus |

Kernaussage: Für die Entkopplung sind **genau zwei Blob-Schlüssel** relevant — `profiles` und `mandateProfiles`. Alles andere bleibt unberührt.

---

## 7. Empfohlene Zielarchitektur

**Prinzip: minimal-invasive relationale Entkopplung**, keine Neuentwicklung des Storage-Systems. Timeout-/Retry-Erhöhung ist **ausdrücklich nicht** die Lösung — die vorhandenen `withStoreRetry`-Mechanismen bleiben, adressieren aber nur das Symptom.

- **Speicherort:** Mandatsprofile werden **alleinige Wahrheit** in `profiles` (Identität: `id`, `name`, `email`) + `mandate_profiles` (alle Fachfelder + `profil_extras`). Genau eine Zeile je Mandant (PK `user_id`).
- **Lesen:** `getProfileFromDb` (existiert) — ein PostgREST-Embed-Query, **immer app-seitig auf `id=eq.<tenant>` gescopt**. Während der Übergangsstufen bleibt der **Blob-Read-Fallback** in `getProfile` aktiv (Dual Read). Nach Cutover entfällt der Fallback.
- **Schreiben:** `saveProfileToDb` (existiert) — zwei **idempotente Upserts** auf PK (`profiles.id`, `mandate_profiles.user_id`). Ein Upsert betrifft **genau eine Zeile eines Mandanten** ⇒ kein globaler Blob, keine Write-Amplification, keine Cross-Tenant-Kollision. **Vor** dem Write: `assertTenant`/`assertTenantRows`, damit `user_id` verpflichtend und eindeutig der Zielmandant ist.
- **Onboarding-Drafts:** `onboardingDraft` ist bereits **clientseitiger, flüchtiger** Zustand (`client.js`). Die Per-Schritt-Persistenz PATCHt `/api/profile/current` → künftig `saveProfileToDb` (ein `mandate_profiles`-Upsert; `onboarding_status`-Spalte existiert). **Kein globaler Blob je Schritt** — genau das behebt die 14-fache Blob-Rewrite-Last des Onboardings.
- **Kompatibilität zu Bestandsdaten:** `profil_extras jsonb` bewahrt jedes nicht-spaltige/künftige Feld 1:1 (getestet: `profile-db-test`, `profile-completeness-test` — verlustfreier Roundtrip über alle vier Scoring-Dimensionen). Bestehende Profile werden per Backfill übernommen; bis Cutover bleibt der Blob als Fallback lesbar.
- **Read-Fallback / Dual Read / Dual Write:** Ja, **temporär**. Dual Read (SQL-first, Blob-Fallback) ist in `getProfile` bereits eingebaut. Dual Write (Blob **und** SQL) ist der bestehende Zustand bei `HELMUT_PROFILE_DB_MODE=on`. Beide sind **Übergangsmechanik**, die in Stufe E entfernt wird.
- **Backfill/Migration:** Über das in PR #112 vorhandene `scripts/profile-blob-to-sql-backfill.js` (Dry-Run + fail-safe) + Runbook — Preview-Beweislauf per Dry-Run, dann realer Lauf. Orphan-/Vollständigkeits-Checks via `sprint6-pilot-migration-test`.
- **Divergenz-Erkennung:** `/api/admin/tenant-mode` prüft bereits live, ob der DB-Lesepfad greift. Ergänzung: in der Dual-Write-Phase je Save einen kompakten **Blob-vs-SQL-Vergleich** (nur Kennzahlen/Feld-Hashes, keine PII) telemetrieren — Muster wie `sourceModeShadowLastRun` im Auth-Store.
- **Rollback:** Flag `HELMUT_PROFILE_DB_MODE=off` ⇒ sofort zurück auf Blob-Verhalten (solange Blob in Stufe D noch mitgeschrieben wird = Flag-Flip genügt). Migrationen haben `_rollback.sql`.
- **service_role / RLS / Mandantentrennung:** Da RLS heute **inert** ist (`service_role`, `tenantJwtModeEnabled()=false` dauerhaft), ist die **App-Schicht die einzige Verteidigung**. Die Zielarchitektur muss das explizit tragen: (a) jeder Profil-Read/Write app-seitig auf `id=eq.<tenant>` / `user_id=<tenant>` gescopt; (b) `assertTenant` verpflichtend auf dem Schreibpfad; (c) `on_conflict=user_id` mit korrektem `user_id`. Echte RLS-Durchsetzung erfordert echtes Supabase-Auth (GoTrue-Tokens) — ein **größerer, separater** Schritt und **kein Blocker** für die Entkopplung, aber das dokumentierte Rest-Risiko (P1).
- **Ohne Production-Änderung vorbereitbar:** Backfill-Skript + Runbook landen, neue Tests (Nebenläufigkeit, Idempotenz, „kein globaler Blob"), Dry-Run-Preview, Telemetrie-Naht — alles hinter dem **ausgeschalteten** Flag, byte-identisches Ist-Verhalten bis zur bewussten Freischaltung.

---

## 8. Migrationsstrategie

1. **Kein neues Schema** — `profiles`/`mandate_profiles` inkl. `profil_extras` sind in Production migriert.
2. **Preview-Beweislauf (Dry-Run):** `profile-blob-to-sql-backfill.js --dry-run` über eine Blob-Kopie → Bericht: Anzahl Profile, gemappte Felder, `profil_extras`-Auffang, 0 Datenverlust, 0 Orphans. Kein Schreibvorgang.
3. **Realer Backfill (idempotent):** Upserts auf PK ⇒ wiederholbar ohne Duplikate. Danach Gegenprüfung Blob↔SQL (Feldzahl, Scoring-Dimensionen).
4. **Dual-Write-Phase:** `HELMUT_PROFILE_DB_MODE=on` → jeder Save schreibt Blob **und** SQL; Divergenz-Telemetrie überwacht Gleichlauf.
5. **Cutover:** SQL wird primär gelesen (Dual Read bereits so); danach Blob-Profil-Schreiben entfernt (Stufe E). Ab hier schreibt `PATCH /api/profile/current` **keinen globalen Blob** mehr.

---

## 9. Rollback-Strategie

> Umsetzungshinweis: Stufe D **und** Stufe E sind als **Flags** implementiert
> (`HELMUT_PROFILE_DB_MODE`, `HELMUT_PROFILE_DB_EXCLUSIVE`), nicht als Code-Entfernung.
> Jeder Rollback ist damit ein Flag-Flip, kein Deploy/Revert.

- **Stufen B–D (Blob wird noch mitgeschrieben):** `HELMUT_PROFILE_DB_MODE=off` ⇒ nächster Request liest/schreibt wieder Blob-only. **Nulldatenverlust**, da der Blob im Dual-Write durchgehend aktuell gehalten wurde. Reiner Flag-Flip.
- **Rollback E → D** (`HELMUT_PROFILE_DB_EXCLUSIVE=off`, `HELMUT_PROFILE_DB_MODE` bleibt an): **verlustfrei und sofort**. `getProfile` liest weiterhin SQL-first, alle im Exklusivmodus relational geschriebenen Profile bleiben lesbar; ab jetzt wird zusätzlich wieder der Blob mitgeschrieben.
- **Rollback E → OFF (voller Rollback bis Blob-only):** ⚠️ **Nicht ohne Reverse-Backfill verlustfrei.** Im Exklusivmodus wurde der Blob bewusst **nicht** mitgeschrieben — in Stufe E neu angelegte oder geänderte Profile existieren nur relational. Ein direkter Sprung `HELMUT_PROFILE_DB_MODE=off` würde diese E-Ära-Profile blob-only unsichtbar machen (Daten bleiben in SQL, sind aber nicht mehr gelesen). **Pflichtschritt vor D→OFF:** `node scripts/profile-relational-backfill.js --reverse --execute` (SQL → Blob-Resync), erst danach `HELMUT_PROFILE_DB_MODE=off`. Der Reverse-Lauf ist idempotent und fail-safe; die Sichtbarkeits-Heilung ist in `scripts/profile-exclusive-store-test.js` (Fall 13) bewiesen. Empfohlener Normalfall: bei einem Zwischenfall in Stufe E nur auf **D** zurückgehen (verlustfrei), OFF nur nach Reverse-Backfill.
- **Schema-Ebene:** Jede Migration hat `_rollback.sql` (Policies/Spalten). Für die Entkopplung selbst nicht erforderlich (kein neues Schema).
- **Divergenz als Abbruchkriterium:** Bleibt die Blob-vs-SQL-Telemetrie (`getProfileTelemetry`/`/api/admin/tenant-mode`) in Dual-Write nicht deckungsgleich (`profileBlobReadFallbacks` dauerhaft > 0 ⇒ Backfill unvollständig), wird Stufe E **nicht** gezogen.

---

## 10. Risiken nach Priorität

### P0 — vor Pilot zu beheben
- **Lost Update / Cross-Tenant-Überschreiben auf dem `main`-Blob.** Nebenläufige Saves ersetzen die ganze `data`-Zelle (last-write-wins) → stiller Verlust fremder Profil-/Inhaltsänderungen. Tritt genau unter Pilot-Last (mehrere Mandate/Nutzer parallel) auf. **Behebung = dieser Umbau** (Per-Zeilen-Upsert).
- **Blob-Timeout beim Profil-Save.** Der Mehr-MB-Blob läuft in 10-s-Timeouts; Retry mildert, verhindert aber Latenz/Teilverlust nicht. Entfällt mit dem kleinen Per-Mandant-Upsert.

### P1 — begleitend absichern
- **RLS inert (service_role).** Nach Entkopplung ruht die Mandantentrennung **vollständig** auf App-seitigem Scoping. Ein fehlender Scope = Cross-Tenant-Leck. Mitigation: `assertTenant` auf allen Profilpfaden + Negativtests; echte RLS via GoTrue als separater Folgeschritt.
- **Dual-Write-Divergenz** Blob↔SQL während der Übergangsphase. Mitigation: Divergenz-Telemetrie + Backfill-Idempotenz.

### P2 — Aufräumen / geringe Wirkung
- **`mandateProfiles{}` ist eine abgeleitete Dublette** von `profiles{}` (via `toMandateProfile`) und kann driften — mit Stufe E ersatzlos entfernen.
- **`/api/profile/demo`** (Admin-Bypass) schreibt ebenfalls den Blob — im Cutover mit umstellen.
- **Namensverwechslung:** `readStore`/`writeStore` bezeichnen in `accounts.js` den **Auth**-Store, in `storage.js` den **Content**-Blob (nur Import-Alias). Korrekt, aber lesefallenträchtig — dokumentieren.

---

## 11. Detaillierter Umsetzungsplan

> Die Stufen ergeben sich aus dem Ist-Zustand: SQL-Pfad, Migrationen, Backfill-Skript (PR #112) und Dual-Read-Fallback sind bereits vorhanden. Der Plan ist daher überwiegend **Verdrahtung + Cutover + Tests**, keine Neuentwicklung.

**Stufe A — Vorbereitung (keine Production-Änderung, Flag bleibt aus)**
- Backfill-Skript `profile-blob-to-sql-backfill.js` + Aktivierungs-Runbook auf diese Branch bringen (aus PR #112 übernehmen bzw. auf dessen Merge aufbauen).
- Neue Tests (§12): Nebenläufigkeits-Konvergenz, Idempotenz, Cross-Tenant-Write-Isolation, „PATCH schreibt keinen globalen Blob".
- Divergenz-Telemetrie-Naht (inert) vorbereiten.

**Stufe B — Lesen aus neuer Quelle mit Fallback + Telemetrie**
- In Preview/Staging `HELMUT_V3_STORE=1` + `HELMUT_PROFILE_DB_MODE=1`; `getProfile` liest SQL-first, fällt bei Miss/Fehler auf Blob zurück (bereits so). Divergenz-/Read-Probe über `/api/admin/tenant-mode` beobachten.

**Stufe C — Backfill + Preview-Beweislauf**
- Dry-Run (Beweisbericht), dann realer idempotenter Backfill; Vollständigkeits-/Orphan-Checks.

**Stufe D — Write-Umschaltung (Dual Write)**
- `HELMUT_PROFILE_DB_MODE=on` in Production → Blob **und** SQL werden geschrieben; Divergenz-Telemetrie grün als Freigabekriterium. Beobachtungsphase.

**Stufe E — Blob-Profilpfad entfernen**
- `saveProfile`/`getProfile`/`normalizeStore`/`compactStore` schreiben/lesen `profiles`/`mandateProfiles` **nicht mehr** im `main`-Blob; einmaliger Export als Sicherung. Ab hier: `PATCH /api/profile/current` **ohne globalen Blob**. Eigener, reversibler Commit nach grüner Dual-Write-Phase.

### Spätere Beweispflichten (Abbildung auf Nachweis)
| Beweispflicht | Nachweis |
|---|---|
| Profil-Lesen ohne `helmut_store` | Stufe-E-Test: `getProfile` liest nur SQL (Blob-Reader gemockt/deaktiviert) |
| Profil-Schreiben ohne `helmut_store` | Stufe-E-Test: `saveProfile` triggert nur `mandate_profiles`-Upsert, kein `helmut_store`-POST |
| Nur betroffener Mandant geändert | neuer Cross-Tenant-Write-Test (Upsert berührt genau `user_id=<tenant>`) |
| Auth/Session unabhängig | bereits strukturell (Auth-Store `main-auth`); Regressionstest ergänzen |
| Parallele Profilupdates ohne gegenseitige Wirkung | neuer Nebenläufigkeitstest (zwei Saves → beide persistiert) |
| Idempotente Saves ohne Duplikate | neuer Idempotenztest (n× gleicher Save → 1 Zeile) |
| Fallback & Rollback funktionieren | vorhandener Fallback-Test + Flag-off-Rollbacktest |
| Bestehende Profile bleiben erhalten | Backfill-Vollständigkeitstest + `profil_extras`-Roundtrip |
| PR #112 unverändert lauffähig | #112 läuft flag-off (Blob); Stufen A–D lassen Blob-Write intakt; in E ruft dieselbe `saveProfile` → SQL, `onboarding_status`-Spalte vorhanden |
| `PATCH /api/profile/current` ohne globalen Blob | Stufe-E-Endpunkttest |

---

## 12. Teststrategie

**Vorhanden (stark):** verlustfreier Roundtrip (`profile-db-test`, `profile-completeness-test`), SQL-vs-Blob-Präzedenz & DB-Fehler-Fallback, Cross-Tenant-**Lese**-Isolation (`mandantentrennung-test`, `cross-tenant-security-test`, `tenant-guard-test`, `rls-policy-simulation-test`, `drei-profile-e2e-test`), Tenant-Neutralität. Alle laufen offline in CI (`ci.yml` → `run-offline-tests.js`, Netz-Guard `NO_NETWORK_TESTS`).

**Lücken (zu schließen):**
1. **Idempotenz** eines Profil-Saves (n× → eine `mandate_profiles`-Zeile).
2. **Nebenläufigkeit:** zwei parallele Saves (gleicher/verschiedener Mandant) → beide Änderungen überleben (Regressionsbeweis gegen den Lost-Update-Root-Cause).
3. **„Kein globaler Blob-Write"** auf `PATCH /api/profile/current` (heute nur als `helmut_store`-RLS-*Simulation* impliziert).
4. **Reales RLS** gegen Postgres (heute nur JS-Simulation) — als Folgeschritt mit GoTrue.

**Testmodus:** weiterhin Dependency-Injection (`deps.request`/`deps.upsert`) für Offline-Determinismus; lokaler Datei-Store mit Snapshot/Restore für die Blob-Seite.

---

## 13. Voraussichtlich betroffene Dateien

- `lib/helmut/storage.js` — `getProfile`/`saveProfile` (Cutover-Logik), `getProfileFromDb`/`saveProfileToDb` (ggf. `assertTenant` ergänzen), `normalizeStore`/`compactStore` (Profil-Schlüssel in Stufe E entfernen), Divergenz-Telemetrie.
- `server.js` — `/api/profile/current`, `/api/profile/demo`, `/api/admin/tenant-mode` (Divergenzanzeige); Admin-Schnellstart/Update unverändert im Verhalten.
- `client.js` — keine funktionale Änderung nötig (PATCH-Vertrag stabil); ggf. Onboarding-Abschluss.
- `scripts/profile-blob-to-sql-backfill.js` + `docs/betrieb/profile-db-aktivierung-runbook.md` — aus/aufbauend auf PR #112.
- `scripts/*` — neue Tests (Idempotenz, Nebenläufigkeit, „kein globaler Blob", Rollback); Aufnahme in `run-offline-tests.js` automatisch.
- `supabase/` — **keine neue Migration** erwartet.
- `.env.example` / `docs/betrieb/env-inventar.md` — `HELMUT_PROFILE_DB_MODE` dokumentieren.

---

## 14. Vorschlag für Branch und PR

- **Branch:** `claude/profile-auth-storage-decouple-452fp1` (bereits vorgegeben).
- **PR-Titel:** „Profil-Storage vom `helmut_store`-Blob entkoppeln (relationaler `profiles`/`mandate_profiles`-Pfad, flag-gesteuerter Cutover)".
- **Reihenfolge/Abhängigkeit:** Stufe A als **erster, verhaltensneutraler** PR (Flag aus, nur Tests + Backfill-Skript + Telemetrie-Naht). Da PR #112 flag-off arbeitet und Stufen A–D den Blob-Write intakt lassen, ist **#112 durchgehend unverändert lauffähig**. Stufe E folgt als separater PR nach grüner Dual-Write-Beobachtung.
- **Nicht mergen ohne Freigabe** der jeweiligen Flag-Umschaltung (Betriebs-Freigabepunkt, analog `helmut-flags.json`-Freigaben).

---

## 15. Klare Empfehlung

**Ja — die Entkopplung sollte vor dem Pilotbetrieb umgesetzt werden.**

Begründung: Der Lost-Update-/Cross-Tenant-Überschreib-Defekt auf dem geteilten `main`-Blob ist **kein latentes, sondern ein aktives** Korrektheits- und Mandantentrennungs-Problem, das **genau die nebenläufige Mehrmandanten-Last eines Piloten** auslöst — mit dem Risiko stillen Profil-Datenverlusts und mandantenübergreifender Kontamination. Gleichzeitig ist die Zielarchitektur bereits ~80 % gebaut (migriertes Schema inkl. `profil_extras`, implementierter + getesteter SQL-Pfad, Dual-Read-Fallback, Backfill-Skript, RLS-Policies als Defense-in-Depth). Der Restaufwand ist **Verdrahtung, kontrollierter Cutover und vier bis fünf neue Tests**, vollständig hinter einem ausgeschalteten Flag vorbereitbar und per Flag-Flip reversibel.

Ein Pilotstart **ohne** diese Entkopplung würde eine bekannte, reproduzierbare Datenverlust-/Isolationslücke bewusst in Kauf nehmen, obwohl die Lösung risikoarm und größtenteils vorhanden ist. Die Umstellung ist daher **vor Pilot geboten** — mindestens bis einschließlich Stufe D (Per-Mandant-Upsert als Schreibwahrheit); Stufe E (Blob-Pfad-Entfernung) kann in der frühen Pilotphase unter Beobachtung folgen.

*Als eigenständigen, nachgelagerten Härtungsschritt (nicht Voraussetzung für den Piloten) empfiehlt sich die echte RLS-Durchsetzung via Supabase-Auth/GoTrue, damit die Mandantentrennung nicht allein auf der App-Schicht ruht.*
