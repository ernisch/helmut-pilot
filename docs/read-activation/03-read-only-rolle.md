# Aufgabe 3 — Read-only Datenbankrolle (`helmut_reader`)

**Modus:** reiner Entwurf. **Keine Rolle angelegt, kein Grant/Revoke ausgeführt.** Die
SQL-Blöcke unten sind Referenz für einen späteren, freigabepflichtigen Migrationsschritt.

> **Warum eine neue Rolle überhaupt?** `service_role` hat `BYPASSRLS` und umgeht jede
> Policy — untauglich als Träger eines RLS-erzwungenen Lesepfads. Das generische
> `authenticated` trägt in den Bestands-Policies `for all` (Schreiben inklusive) und hat
> laut Grant-Prüfung volle CRUD-Grants — zu breit. `helmut_reader` ist eine **dedizierte,
> minimale** Rolle, unter der Schreiben **strukturell unmöglich** ist.

---

## 1. Rollen-Definition (Zielbild)

```sql
-- NUR ENTWURF — nicht ausführen ohne Freigabe.
create role helmut_reader nologin noinherit;
-- nologin:   die Rolle wird ausschließlich per JWT-role-Claim angenommen,
--            nie mit Passwort verbunden.
-- noinherit: erbt keine Rechte anderer Rollen automatisch.
-- KEIN superuser, KEIN bypassrls, KEIN createrole, KEIN createdb.
grant helmut_reader to authenticator;  -- PostgREST-Rollenwechsel-Muster
```

`authenticator` ist die PostgREST-Login-Rolle, die per `SET ROLE` in die durch den
`role`-Claim benannte Rolle wechselt. `helmut_reader` muss ihr `grant`ed sein, damit
PostgREST hineinwechseln darf.

---

## 2. Benötigte Rechte (mit Begründung je Berechtigung)

| Recht | Umfang | Begründung |
|-------|--------|------------|
| `USAGE` on schema `public` | Schema sichtbar machen | Ohne Schema-`USAGE` ist keine Tabelle adressierbar. Minimalvoraussetzung. |
| `SELECT` on `decisions`, `matching_results`, `office_outputs`, `briefings` | Live-Nutzer-Reads (V3) | Genau die Tabellen, aus denen `/api/app/start` das Briefing/Radar rendert. RLS filtert auf den eigenen Tenant. |
| `SELECT` on `mandate_profiles`, `profiles` | Profil-Read (falls DB-Modus) | Nur wirksam bei `HELMUT_PROFILE_DB_MODE`; Policy `id/user_id = tenant()`. |
| `SELECT` on `knowledge_objects`, `raw_documents`, `ko_document_links`, `ko_relations`, `sources` | geteilter Korpus | `shared_read`-Policy — jeder Mandant liest denselben mandantenlosen Wissenskorpus. |
| `SELECT` on `helmut_store` | Blob-Read `main-p-<tenant>` | Policy `tenant_isolation_select` beschränkt auf die eigene `main-p-`-Zeile; Tasks/Notizen. |
| `EXECUTE` on `public.helmut_current_tenant()` | Tenant aus Claim lesen | Die Policies rufen diese Funktion auf; ohne `EXECUTE` scheitert jede Policy-Auswertung. |

**Prinzip:** Grants werden **tabellengenau** vergeben (kein `GRANT SELECT ON ALL TABLES`),
damit eine künftig hinzugefügte sensible Tabelle nicht automatisch lesbar wird. Neue
Tabellen sind standardmäßig **nicht** für `helmut_reader` freigegeben (kein
`ALTER DEFAULT PRIVILEGES ... GRANT` für diese Rolle).

```sql
-- NUR ENTWURF.
grant usage on schema public to helmut_reader;

grant select on public.decisions, public.matching_results,
                 public.office_outputs, public.briefings,
                 public.mandate_profiles, public.profiles,
                 public.knowledge_objects, public.raw_documents,
                 public.ko_document_links, public.ko_relations, public.sources,
                 public.helmut_store
  to helmut_reader;

grant execute on function public.helmut_current_tenant() to helmut_reader;
```

---

## 3. Verbotene Rechte (mit Begründung je Verbot)

| Verbotenes Recht | Warum verboten |
|------------------|----------------|
| `INSERT` / `UPDATE` / `DELETE` (alle Tabellen) | Ein Lesepfad braucht **nie** Schreibrechte. Ohne Grant ist jeder Schreibversuch ein DB-Fehler — ein kompromittierter oder fehlerhafter Read-Pfad kann **keine** Daten verändern. |
| `BYPASSRLS` | Das Kernattribut, das service_role gefährlich macht. `helmut_reader` **muss** RLS unterliegen — sonst wäre die ganze zweite Verteidigungslinie wirkungslos. |
| `SELECT` on `helmut_store` **id=main-auth** | Alle Accounts/Sessions liegen in einer Zeile. Der Reader darf sie **nie** sehen — garantiert durch die fehlende Policy (nur `main-p-`-Präfix ist erlaubt), nicht nur durch Grant. |
| `SELECT` on `helmut_store` **id=main** | Geteilte Betriebsdaten (Katalog, Crawl-Runs) — kein Endnutzerbezug. Ebenfalls per fehlender Policy gesperrt. |
| `SELECT` on `pipeline_locks` | Operative Sperrtabelle, keine Nutzerdaten, per fehlender Policy gesperrt (und kein Grant). |
| `EXECUTE` on `helmut_reserve_llm_call` u. a. INVOKER-Funktionen | Budget-/Schreibfunktionen; `EXECUTE` wurde public/anon/authenticated bereits entzogen (FA-12). Reader erhält es nicht. |
| `CREATE` on schema `public` | Reader darf keine Objekte anlegen. |
| `superuser` / `createrole` / `createdb` / `replication` | Keinerlei Administrationsrechte. |
| Zugriff auf `auth`-Schema-Tabellen | Reader liest nie GoTrue-interne Nutzer/Session-Tabellen. |

---

## 4. Notwendige Revokes (Bereinigung des Supabase-Defaults)

Supabase vergibt beim Bootstrap `anon` **und** `authenticated` volle CRUD-Grants auf alle
Tabellen (verifiziert, Migration `20260712` §3). Damit die Read-only-Trennung real ist,
müssen die überbreiten Default-Grants **eingeengt** werden — **bevor** irgendein
`authenticated`/Reader-Token live geht:

```sql
-- NUR ENTWURF — Reihenfolge und Umfang vor Ausführung mit Grant-Audit abgleichen.

-- 1) Schreibrechte von authenticated auf allen Nutzer-Tabellen entziehen,
--    damit der Lesepfad nie schreiben kann (Defense-in-Depth zur Rolle):
revoke insert, update, delete on public.decisions, public.matching_results,
       public.office_outputs, public.briefings, public.mandate_profiles,
       public.profiles, public.helmut_store
  from authenticated;

-- 2) anon vollständig von allen public-Tabellen ausschließen
--    (anon darf NIE etwas erreichen — alle Policies sind ohnehin TO authenticated):
revoke all on all tables in schema public from anon;

-- 3) sensible Tabellen auch für authenticated/Reader komplett sperren:
revoke all on public.pipeline_locks from anon, authenticated;
```

**Wichtig — nicht anfassen:** `service_role` behält **alle** Grants (Cron-Writes,
Blob-Writes, `main-auth`). Kein Revoke auf `service_role`. Ein versehentlicher
`revoke ... from service_role` würde den gesamten produktiven Betrieb (Legacy-Read **und**
Schreibpfade) brechen — das ist die gefährlichste Fehlbedienung in diesem Bereich und in
[`09-risikoanalyse.md`](09-risikoanalyse.md) als Stop-Risiko geführt.

---

## 5. Verifikation der Rolle (read-only, vor Aktivierung)

Nach Anlegen der Rolle auf einer **isolierten Preview-Branch** (freigabepflichtig, kostet
Geld) — nie zuerst in Production:

```sql
-- 1) Rolle hat KEIN bypassrls, KEIN superuser:
select rolname, rolsuper, rolbypassrls, rolcanlogin
  from pg_roles where rolname = 'helmut_reader';
-- Erwartung: rolsuper=f, rolbypassrls=f, rolcanlogin=f

-- 2) Reader hat NUR SELECT, kein INSERT/UPDATE/DELETE:
select table_name, privilege_type
  from information_schema.role_table_grants
  where grantee = 'helmut_reader' order by table_name, privilege_type;
-- Erwartung: ausschließlich SELECT, und nur auf den 12 freigegebenen Tabellen.

-- 3) Isolationsprobe (analog rls-isolation-test-results.md, 19/19):
--    set role helmut_reader; set request.jwt.claims mit user_id=Mandant-A →
--    liefert NUR A-Zeilen; Mandant-B-Zeilen = 0; main-auth = 0; write = Fehler.
```

Der bestehende Offline-Simulator `scripts/rls-policy-simulation-test.js` prüft die
**Prädikatlogik** ohne echte DB (19/19). Für die **Rollen-/Grant-Ebene** ist zusätzlich ein
echter Postgres-Lauf nötig (lokal oder Preview-Branch) — Teil des Security-Gates
([`07-…`](07-security-gate.md)).

---

## 6. Zusammenfassung

`helmut_reader` = **`nologin`, `noinherit`, kein `BYPASSRLS`, nur `SELECT` auf 12 genau
benannte Tabellen, `EXECUTE` nur auf `helmut_current_tenant()`.** Schreiben, `main-auth`,
`main`, `pipeline_locks`, alle Admin-Rechte: **ausgeschlossen** — teils per fehlendem Grant,
teils per fehlender Policy, meist doppelt. Das ist der DB-seitige Kern des „Secure Read
Path": selbst bei vollständig kompromittiertem App-Read-Zweig bleibt der Schaden auf
**Lesen der eigenen Mandantendaten** begrenzt.
