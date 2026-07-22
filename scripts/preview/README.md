# Preview-Validierung (Sprint 11)

Erstmalige **technische Validierung der Zielarchitektur** (Supabase Auth →
Tenant Claims → Read-only-Rolle → RLS → Secure Read Path) in einer
**wegwerfbaren, lokalen Postgres-16** — **niemals gegen Production**.

Vollständiger Bericht: `docs/sprint-11-preview-infrastruktur-validierung.md`.

## Ausführen

```bash
npm run preview:validate      # = bash scripts/preview/run.sh
```

Der Orchestrator setzt einen **ephemeren** Cluster auf, spielt Bootstrap +
Schema + die **echte** Migration `20260712` (verbatim) + die neue Read-only-
Rolle `20260722` + einen Mehr-Mandanten-Seed ein, führt alle Validatoren aus
und **räumt danach alles ab** (Teardown-Trap). €0, keine Cloud-Ressource.

## Voraussetzungen

- `postgresql-16` (`initdb`, `pg_ctl`, `psql`) im Container.
- `node` (kein npm-Paket nötig — der DB-Treiber nutzt `psql` via `child_process`,
  passend zu `"dependencies": {}` im Projekt).
- Recht, einen Nicht-Root-Systemnutzer (`pgpreview`) anzulegen (Postgres läuft
  nicht als root). Fehlt eine Voraussetzung, **bricht `run.sh` mit klarer Meldung
  ab** und improvisiert **keine** Alternative.

## Dateien

| Datei | Zweck |
|---|---|
| `00_bootstrap.sql` | Supabase/PostgREST-Nachbildung: `auth.jwt()`/`auth.role()`, Rollen `anon`/`authenticated`/`service_role`/`authenticator` |
| `01_schema.sql` | Minimal-treue 24 Tabellen (nur policy-relevante Spalten) + RPC-Kanarienvogel + Default-Grants |
| `03_seed.sql` | 3 parallele synthetische Mandanten (keine echten Daten/Nutzer/IDs) |
| `lib-pg.js` | psql-Treiber: 1 Aufruf = 1 PostgREST-Request (Claims + `SET LOCAL ROLE`) |
| `preview-db-validate.js` | Aufgaben 2, 3, 4, 8 (GoTrue-Claims, Read-only-Rolle, RLS-Matrix, Adversarial) |
| `secure-read-validate.js` | Aufgabe 5 (Secure Read Path — 5 Gates + Fail-Closed) |
| `shadow-read-validate.js` | Aufgabe 6 (Legacy ∥ Secure, Abweichungs-/Coverage-Vergleich) |
| `rollback-sim.js` | Aufgabe 7 (App-Flag + DB-Migration vorwärts/rückwärts) |
| `performance.js` | Aufgabe 9 (RLS-/Claim-/Secure-Read-Overhead, Parallelität) |
| `run.sh` | End-to-End-Orchestrator mit Teardown |

Die eigentliche RLS-Migration liegt unter
`supabase/migrations/20260712_tenant_rls_policies.sql` und wird **verbatim**
eingespielt; die Read-only-Rolle unter `20260722_readonly_role.sql`
(**Entwurf**, nicht auf Production angewendet).

## Grenzen (bewusst)

Diese Preview validiert **DB-seitig** (RLS, Rollen, Grants, Claim-Konsum). Sie
validiert **nicht** die **GoTrue-Token-Ausstellung/-Signaturprüfung**, `exp`/
Replay oder das Rollen-Claim→DB-Rolle-Mapping — das erfordert echtes GoTrue +
PostgREST (fehlende Infrastruktur, siehe Bericht §Aufgabe 1 / §10.8).
