# Aufgabe 1 — Endgültige Read-Architektur (vollständiger, expliziter Datenfluss)

**Regel:** Kein Schritt darf implizit sein. Jede Station unten ist ein benannter,
überprüfbarer Übergang mit definierter Identität, Eingabe, Ausgabe und Fehlerverhalten.

> **Zielbild.** Diese Architektur beschreibt den **angestrebten** produktiven Zustand nach
> vollständiger Aktivierung. Sie ist heute **nicht** scharf geschaltet. Die tragende
> Entscheidung — der einzige Weg, der mit dem aktuellen Supabase-Setup funktioniert — ist
> die **Token-Ausstellung durch Supabase-Auth (GoTrue)** statt durch die App
> (Selbstsignatur ist tot, siehe `docs/multitenancy-jwt-signing-keys-umstellung.md`).

---

## 1. Der Datenfluss auf einen Blick

```
[1] Client (Browser, angemeldeter Abgeordneter/Mitarbeiter)
      │  HTTPS + helmut_session-Cookie
      ▼
[2] Server (server.js Route-Handler, z. B. GET /api/app/start)
      │  Session → politicianId (tenantId) auflösen
      ▼
[3] JWT (kurzlebiges, von Supabase-Auth signiertes Access-Token für DIESEN Mandanten)
      │  trägt Rolle + Tenant-Claim
      ▼
[4] Tenant Claim (user_id = <politicianId> im verifizierten Token)
      │  von PostgREST als request.jwt.claims gesetzt
      ▼
[5] Read-only Rolle (Postgres-Rolle helmut_reader, KEIN BYPASSRLS, KEINE Schreibrechte)
      │  role-Claim = "helmut_reader"
      ▼
[6] RLS (Row Level Security Policies werten helmut_current_tenant() aus)
      │  using (user_id = tenant()) — Zeilenfilter in der DB erzwungen
      ▼
[7] Secure Read Path (storage.js: tenantRequest → tenantReadRequest, fail-closed)
      │  baut Query MIT explizitem user_id=eq.<tenant>-Filter (Defense-in-Depth)
      ▼
[8] Quellenplattform (Supabase/PostgREST → Postgres: Relationstabellen + Blob)
      │  liefert ausschließlich Zeilen des eigenen Mandanten
      ▼
[9] Antwort (JSON an den Server → gerendertes Briefing/Radar/Lage an den Client)
```

Zwei **orthogonale** Verteidigungslinien wirken zusammen: **RLS in der DB** (Station 5+6)
**und** der **App-seitige Filter** (Station 7). Fällt eine aus, hält die andere. Das ist
der Kernunterschied zu heute, wo nur die App-Linie existiert.

---

## 2. Jede Station einzeln (nichts implizit)

### [1] Client
- **Wer:** ein am Produkt angemeldeter Nutzer (Abgeordneter oder Mitarbeiter eines Mandats).
- **Eingabe:** HTTPS-Request mit `helmut_session`-Cookie (bestehendes scrypt-Login,
  **unverändert**). Der Client spricht **nie** direkt mit Supabase — er kennt weder Token
  noch DB.
- **Ausgabe:** ein Request an eine `server.js`-Route.
- **Fehlerfall:** kein Cookie / abgelaufen → bestehendes Auth-Gate antwortet `401`
  (unverändert; kein DB-Zugriff).

### [2] Server
- **Wer:** `server.js` Route-Handler (z. B. `GET /api/app/start` → `lage.js`).
- **Aktion:** löst die Session zur **`politicianId`** auf (= `tenantId` = `user_id`).
  Konten/Sessions liegen im `helmut_store`-Blob `main-auth` (service_role-verwaltet,
  **bleibt** service_role — kein Endnutzerkontext, siehe Auth-Matrix §3).
- **Ausgabe:** ein aufgelöster `tenantId` + der Wunsch, mandantenbezogene Daten zu lesen.
- **Fehlerfall:** Session lässt sich nicht auflösen → `assertTenant(tenantId)` **wirft hart**
  (`storage.js`, kein stiller „alle Mandanten"-Fallback) → `401/500`, **kein** DB-Read.

### [3] JWT
- **Was:** ein **kurzlebiges Access-Token**, ausgestellt von **Supabase-Auth (GoTrue)** für
  genau diesen Mandanten, signiert mit dem **aktiven asymmetrischen Signing-Key** des
  Projekts. **Nicht** von der App selbst signiert (dieser Weg ist tot, PGRST301).
- **Bezug:** Details, Claims, Rotation, Logout in
  [`04-jwt-konzept.md`](04-jwt-konzept.md).
- **Ausgabe:** `Authorization: Bearer <access_token>` + `apikey: <publishable_key>` am
  PostgREST-Request (statt `service_role`-Key).
- **Fehlerfall:** kein/abgelaufenes Token → der Secure Read Path erhält **kein** Token →
  **fail-closed** (Station 7): entweder Legacy-Fallback (in der Shadow-/Übergangsphase)
  oder harter Leerzustand (nach Cutover) — **nie** ein service_role-Read als stiller
  Ersatz.

### [4] Tenant Claim
- **Was:** der Claim **`user_id = <politicianId>`** im verifizierten Token.
- **Verifikation:** **PostgREST verifiziert das Token selbst** gegen den aktiven Signing-Key
  (JWKS) — die App tut dafür nichts. Nach erfolgreicher Verifikation stellt PostgREST die
  Claims als `request.jwt.claims` bereit; `auth.jwt() ->> 'user_id'` liefert den Tenant.
- **Ausgabe:** ein gesetzter Tenant-Kontext in der DB-Transaktion.
- **Fehlerfall:** Claim fehlt/leer → `helmut_current_tenant()` liefert **NULL**
  (`nullif(auth.jwt() ->> 'user_id', '')`, verifiziert in Migration `20260712`) → **jede**
  Tenant-Policy verweigert (Station 6). Fail-closed **by design**.

### [5] Read-only Rolle
- **Was:** eine **neue** Postgres-Rolle **`helmut_reader`** — **ohne** `BYPASSRLS`,
  **ohne** `INSERT/UPDATE/DELETE`, nur `SELECT` auf die freigegebenen Tabellen. Der
  Token-`role`-Claim ist `helmut_reader` (statt `service_role` oder dem generischen
  `authenticated`).
- **Warum eigene Rolle:** `service_role` umgeht RLS (BYPASSRLS) — für einen Lesepfad, der
  RLS **erzwingen** soll, disqualifiziert. Das generische `authenticated` trägt in den
  bestehenden Policies `for all` (Lesen **und** Schreiben) — für einen reinen Read-Pfad zu
  breit. Eine dedizierte Read-only-Rolle macht Schreiben über diesen Pfad **strukturell
  unmöglich**, nicht nur per Policy.
- **Bezug:** Rechte/Grants/Revokes in [`03-read-only-rolle.md`](03-read-only-rolle.md).
- **Fehlerfall:** Rolle versucht Schreiben → von der DB abgelehnt (kein Grant) → Fehler im
  Server-Log, **kein** stiller Datenschreib.

### [6] RLS
- **Was:** die Row-Level-Security-Policies aus `20260712_tenant_rls_policies.sql`, in
  Production bereits **vorhanden**, heute inert. Sie werten `helmut_current_tenant()` aus.
- **Wirkung (aktiviert):** `using (user_id = public.helmut_current_tenant())` filtert
  **in der Datenbank** jede Zeile heraus, deren `user_id` nicht dem Tenant-Claim entspricht.
  Geteilte Korpustabellen (`knowledge_objects`, `raw_documents`, …) tragen `shared_read`
  (`using (true)`) — jeder Mandant liest denselben mandantenlosen Wissenskorpus.
- **Bezug:** vollständige Policy-Matrix in [`02-rls-plan.md`](02-rls-plan.md).
- **Fehlerfall:** Tenant-Claim NULL → **impliziter Deny** (keine Policy matcht) → 0 Zeilen.
  Ein Mandant kann **keine** Fremddaten sehen, selbst wenn Station 7 einen Filterfehler
  hätte.

### [7] Secure Read Path
- **Wer:** `storage.js` — die vorhandene Transport-Weiche `tenantRequest(endpoint,
  tenantId, options)`, erweitert um einen **Read-only-Zweig** (`tenantReadRequest`), der die
  **Read-only Rolle** (Station 5) verwendet.
- **Aktion:** (1) `assertTenant(tenantId)` — harter Guard; (2) Query **immer** mit
  explizitem `...?user_id=eq.<politicianId>`-Filter bauen (Defense-in-Depth, unabhängig von
  RLS); (3) Request mit dem Reader-Token absetzen.
- **Fail-closed-Vertrag:** Schlägt der Reader-Read fehl (kein Token, PGRST-Fehler,
  Timeout), fällt der Pfad **nicht** stillschweigend auf `service_role` zurück. In der
  Übergangsphase (Shadow) wird das Legacy-Ergebnis geliefert; nach Cutover ein definierter
  Leerzustand + Log. **Nie** ein RLS-umgehender Read als heimlicher Ersatz.
- **Bezug:** Die acht betroffenen Funktionen stehen in `docs/auth-service-role-matrix.md`
  §2 (`listMatchingResults`, `getRenderedBriefingV3`, `getOfficeOutput`, …).

### [8] Quellenplattform
- **Was:** Supabase/PostgREST → Postgres. Zwei Speicherformen:
  - **Relationstabellen** (V3): `matching_results`, `briefings`, `office_outputs`,
    `decisions`, `knowledge_objects`, `raw_documents`, … — die künftige tragende Quelle.
  - **`helmut_store`-Blob** (V2): pro Mandant `main-p-<id>`; geteilt `main`; Konten
    `main-auth`. Die RLS-Policy erlaubt `authenticated` **nur** `SELECT` auf `main-p-<tenant>`.
- **HELMUT_V3_STORE:** Master-Gate des V3-Reads (Prod aktiv, `1`). Der Secure Read Path
  ändert **nicht**, *ob* V3 gelesen wird, sondern *mit welcher Identität* (Reader-Rolle
  statt service_role).
- **Fehlerfall:** Tabelle/Blob nicht verfügbar → availability-Flag/`null` (Bestandsverhalten,
  kein harter Crash).

### [9] Antwort
- **Was:** JSON-Zeilen des **eigenen** Mandanten an den Server → gerendertes
  Briefing/Radar/Lage/Büro an den Client.
- **Invariante:** Für den Pilotmandanten muss die Antwort **byte-/zahlengleich** zum
  Legacy-Read sein (gleiche Entscheidungen, Belege, Radar-Zahlen). Abweichung = Abbruch
  (siehe Rollout-Abbruchkriterien, [`05-…`](05-aktivierungsplan-rollout.md)).

---

## 3. Identitätsmatrix je Station (explizit)

| Station | Identität heute (Legacy) | Identität nach Aktivierung (Ziel) |
|---------|--------------------------|-----------------------------------|
| Client → Server | `helmut_session`-Cookie | unverändert |
| Server → DB (Nutzer-Reads) | `service_role` (BYPASSRLS) | **`helmut_reader`** + GoTrue-JWT |
| Server → DB (Schreibpfade, Cron, Blob-Write, `main-auth`) | `service_role` | **`service_role`** (bewusst unverändert) |
| DB-Zeilenfilter | App-Filter `user_id=eq` | App-Filter **+** RLS-Policy |
| Token-Aussteller | — (kein Token) | **Supabase-Auth (GoTrue)**, asymm. Key |

**Bewusst NICHT umgestellt (bleibt service_role):** alle Backend-/Cron-Schreibpfade
(`runSourceCrawl`, `saveDecisions`, Understanding-Shadow, Health-Report), der gesamte
Blob-**Schreib**pfad und `main`/`main-auth` (siehe Auth-Matrix §3/§6). Diese haben **keinen**
Endnutzer-/Session-Kontext — ein per-Nutzer-JWT ist dort nicht anwendbar.

---

## 4. Warum genau diese Architektur (Entscheidungsbegründung)

1. **Selbstsignatur ist tot.** Die App kann kein PostgREST-akzeptiertes Token mehr erzeugen
   (asymmetrische Keys). Jede Architektur, die auf `signTenantJWT` baut, ist eine Sackgasse.
   → Token-Ausstellung muss zu **GoTrue**.
2. **service_role kann RLS nicht erzwingen** (BYPASSRLS). Ein Read-Pfad, der RLS als
   zweite Linie will, **darf** service_role nicht nutzen. → **eigene Read-only Rolle.**
3. **Read-only, nicht `for all`.** Der Lesepfad braucht nie Schreibrechte. Eine Rolle ohne
   Schreibgrants macht einen kompromittierten/fehlerhaften Read-Pfad **harmlos** für die
   Datenintegrität. → **`helmut_reader` statt generischem `authenticated`.**
4. **Defense-in-Depth statt Ersatz.** Der App-Filter bleibt **zusätzlich** zu RLS bestehen.
   Ein vergessener Filter wird von RLS gefangen; ein RLS-Fehlkonfig vom Filter. Das ist der
   direkte Gegenwert zum heutigen Rest-Risiko „ein vergessener Guard = IDOR"
   (`05-sicherheitsmodell-rls.md` §4).
5. **Fail-closed.** Fehlender/ungültiger Claim ⇒ NULL-Tenant ⇒ 0 Zeilen. Kein Zustand, in
   dem ein Fehler „mehr" statt „weniger" Daten freigibt.

---

## 5. Was von dieser Architektur heute schon existiert (überprüfbar)

| Baustein | Zustand | Beleg |
|----------|---------|-------|
| RLS-Policies in Prod | ✅ vorhanden, inert | 23 Policies, `docs/rls-activation-rollout.md` |
| `helmut_current_tenant()`-Helper | ✅ vorhanden | Migration `20260712` |
| App-Filter `user_id=eq` + `assertTenant` | ✅ aktiv, getestet | `storage.js`, Tenant-Guard-Tests |
| Transport-Weiche `tenantRequest` | ✅ vorhanden (inert) | `storage.js` |
| GoTrue-Token-Ausstellung | ❌ fehlt | zu bauen (Option B) |
| Read-only Rolle `helmut_reader` | ❌ fehlt | zu entwerfen → `03-…` |
| Read-only-Zweig `tenantReadRequest` | ❌ fehlt | zu bauen |
| Shadow-Read-Vergleichsharnisch | ❌ fehlt | zu bauen → Rollout Phase 1/2 |

Die fehlenden Bausteine sind der **Bauauftrag** der späteren Aktivierungs-Sprints; ihre
Reihenfolge, Kriterien und Rückwege stehen in
[`05-aktivierungsplan-rollout.md`](05-aktivierungsplan-rollout.md).
