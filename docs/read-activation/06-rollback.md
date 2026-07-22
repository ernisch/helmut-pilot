# Aufgabe 6 — Rollback

**Kernfrage:** Wie wird **innerhalb weniger Minuten** vollständig auf den Legacy-Read
zurückgeschaltet — und was bleibt dabei erhalten?

> **Grundprinzip.** Der Legacy-Read (service_role, BYPASSRLS, App-Filter) wird in **keiner**
> Rollout-Phase entfernt — er bleibt der codierte Default-Fallback. Rollback = den Reader-
> Pfad **abschalten**, nicht den Legacy-Pfad **wiederherstellen**. Deshalb ist er schnell und
> folgenlos.

---

## 1. Der Minuten-Rollback (Schnellpfad)

**Ein einziger Handgriff genügt:**

1. **Vercel → Environment Variables:** `HELMUT_READER_MODE` auf `off` setzen (oder löschen).
2. **Redeploy** auslösen (Env-Änderungen wirken erst mit Redeploy).

**Wirkung (sofort nach Redeploy):** `tenantReadRequest` wird nicht mehr aufgerufen; jeder
Read läuft wieder über `supabaseRequest` (service_role) mit dem App-Filter — **exakt** der
heutige, getestete Legacy-Zustand. Kein DB-Rollback, keine Migration, keine Datenberührung.

**Dauer:** Flag-Änderung < 1 Min, Vercel-Redeploy typischerweise 1–3 Min → **vollständiger
Rückfall in < 5 Minuten.** (Bei akuter Not zusätzlich: Vercel **Instant Rollback** auf das
letzte grüne Deployment — Sekunden, ohne Redeploy-Build.)

**Warum das reicht:** Reader und Legacy sind **orthogonal** — der Reader ist eine additive
Abzweigung. Ihn abzuschalten kann keinen halb-migrierten Zustand hinterlassen, weil nie
Daten migriert wurden; es wurde nur mit einer anderen Identität **gelesen**.

---

## 2. Rollback-Stufen (nach Tiefe)

| Stufe | Auslöser | Aktion | Dauer | Betriebswirkung |
|-------|----------|--------|-------|-----------------|
| **S0 Instant** | akute Störung nach Deploy | Vercel Instant Rollback auf letztes grünes Deployment | Sekunden | zurück auf vorherigen Code + Env |
| **S1 Flag** | Reader-Pfad fehlerhaft | `HELMUT_READER_MODE=off` + Redeploy | < 5 Min | Reader aus, Legacy bedient alles |
| **S2 Mandant** | ein Mandant betroffen | Mandant aus Reader-Allowlist / Canary-% senken | < 5 Min | nur dieser Mandant zurück auf Legacy |
| **S3 Rolle** | Verdacht auf Rolle/Grant-Problem | (optional) `drop owned by helmut_reader; drop role helmut_reader;` | Minuten | keine — Rolle wird ohne Flag ohnehin nicht genutzt |
| **S4 Policies** | Verdacht auf Policy-Fehler | `20260712_tenant_rls_policies_rollback.sql` | < 30 s | **keine** — Policies sind bei service_role ohnehin inert |

**Regelfall ist S1** (bzw. S0 bei akuter Not). S3/S4 sind nur bei einem tatsächlichen
DB-seitigen Verdacht nötig und ändern am Legacy-Betrieb **nichts** (service_role umgeht RLS
so oder so). Reihenfolge bei Vollrücknahme: **S1 → S2 → (S3) → (S4)** — bereits S1 stellt den
vollständigen Legacy-Zustand her.

---

## 3. Was bleibt erhalten?

### Daten

- **Alle** Mandantendaten bleiben unverändert. Der Rollback berührt **keine** Zeile: er
  ändert nur, mit welcher Rolle gelesen wird. Es gibt **keine** Reader-spezifischen
  Schreibpfade (die Rolle hat keine Schreibrechte), also auch keine „Reader-Daten", die
  verloren gehen könnten.
- Schreibpfade (Cron, Blob-Writes, Live-Writes wie `saveOfficeOutput`/`saveRenderedBriefingV3`)
  laufen die **ganze** Zeit über `service_role` — vom Reader-Rollout unberührt. Kein
  Schreibvorgang wird durch den Rollback rückabgewickelt.
- `helmut_store`-Blob (Profile, Tasks, Notizen) unverändert; `main-auth` (Accounts/Sessions)
  war nie im Reader-Pfad.

### Logs

- **Vercel-Runtime-Logs** bleiben vollständig erhalten (inkl. der `reader_*`-Diagnosezeilen,
  die zeigen, **warum** zurückgerollt wurde). Sie sind der forensische Nachweis des
  Fehlerbilds — vor dem Rollback sichern (§5).
- **Supabase-Logs** (PostgREST/Postgres, `get_logs`) bleiben im Rahmen der Supabase-
  Retention erhalten — hier stehen die PGRST301/Policy-Deny-Ereignisse.
- Application-Logs zu Understanding/Crawl/Budget (unabhängig vom Reader) unberührt.

### Telemetrie

- Die **Baseline-Messgrößen** aus Phase 0 (Latenz p50/p95, Fehlerrate, `/api/release/public`-
  Zahlen) bleiben erhalten und sind nach dem Rollback der Beleg, dass der Legacy-Zustand
  wiederhergestellt ist (Zahlen zurück auf Baseline).
- Reader-spezifische Zähler (`reader_read_success`, `reader_claim_missing`,
  `reader_claim_mismatch`, Divergenzrate) bleiben als historische Reihe erhalten — sie
  werden nach `off` nur nicht mehr fortgeschrieben, aber nicht gelöscht.
- Kosten-/Budget-Telemetrie (`llm_usage`, Budget-Counter) ist vom Reader-Pfad entkoppelt
  (der Reader macht keine LLM-Calls) → unberührt.

---

## 4. Was ein Rollback **nicht** kann (ehrliche Grenzen)

- Er macht **keine** bereits an einen Nutzer ausgelieferte Antwort rückgängig. Ist in einer
  Dark-Launch-Phase kurz eine falsche (z. B. leere) Antwort ausgeliefert worden, verhindert
  der Rollback nur **künftige** Fehlantworten. → Deshalb kommt der Dark Launch (Phase 3)
  erst **nach** bewiesener Divergenz = 0 (Phase 2).
- Er behebt **keine** DSGVO-relevante Fehlsichtung rückwirkend. Eine tatsächliche Cross-
  Tenant-Sichtung ist ein **Incident** (siehe [`08-…`](08-operations-runbook.md) §Incident),
  nicht nur ein Rollback — der Rollback ist die erste Sofortmaßnahme, nicht die letzte.

---

## 5. Pflicht-Sicherung **vor** jedem Rollback (60 Sekunden)

Damit die Ursache analysierbar bleibt, **vor** dem `off`-Schalten:

1. Vercel-Runtime-Logs des Fehlerfensters exportieren/screenshoten (`reader_*`-Zeilen).
2. Supabase `get_logs` (PostgREST) des Fensters sichern (PGRST301/Deny-Ereignisse).
3. Betroffene(n) Mandanten + Zeitfenster notieren (für die Incident-/DSGVO-Bewertung).

Erst danach S0/S1 ausführen. Diese Sicherung ist Teil des Runbooks und verhindert, dass der
schnelle Rollback die Beweise überschreibt.
