# Runbook — Tenant-JWT-Modus aktivieren (RLS scharf schalten)

**Stand:** 2026-07-12 · **Status:** Vorprüfungen ✅, Aktivierung wartet auf **einen Betreiber-Handgriff**.

*Was passiert hier:* Heute spricht die App die Datenbank mit einem „Generalschlüssel"
(service_role) an, der die RLS-Regeln umgeht. Mit `HELMUT_TENANT_JWT_MODE=1` stellt
die App auf einen **pro-Nutzer signierten Ausweis (JWT)** um — dann gibt die Datenbank
jedem Request nur die eigenen Mandantendaten frei. Die RLS-Policies sind seit
2026-07-12 in Production aktiv und warten nur auf diese Umschaltung.

---

## 0. Vorprüfungen (read-only, verifiziert 2026-07-12)

- **Production gesund:** `/api/release/public` → 200, Supabase/OpenAI aktiv, Briefing
  (16 Entscheidungen / 103 Belege / Radar 20/10), Datenmotor V3 100 %. Keine
  Vercel-Runtime-Fehler (letzte 2 h).
- **RLS aktiv:** `pg_policies` (public) = **23**, 24 RLS-Tabellen, Helper-Funktion
  `helmut_current_tenant()` vorhanden.
- **Rollback bereit:** Flag entfernen + Redeploy (§4). Zusätzlich DB-Rollback-Migration
  `supabase/migrations/20260712_tenant_rls_policies_rollback.sql` vorhanden (hier nicht nötig).
- **Secrets:** `SUPABASE_JWT_SECRET` + `SUPABASE_ANON_KEY` wurden vom Betreiber in der
  Secret-Phase in Vercel Production eingetragen. **Verifikation ohne Werte:** nach dem
  Deploy des Diagnose-Endpoints (unten) über `GET /api/admin/tenant-mode` prüfen —
  `jwtSecretPresent` und `anonKeyPresent` müssen `true` sein.

## 1. Warum ein Betreiber-Handgriff nötig ist

Der Agent hat **kein Werkzeug, um Vercel-Environment-Variablen zu setzen** (die
Vercel-Integration ist für Env-Variablen read-only). Das Setzen von
`HELMUT_TENANT_JWT_MODE=1` und der Redeploy sind daher **ein manueller Betreiber-
Schritt**. Alles davor (RLS-Migration, Diagnose-Endpoint, Verifikationsplan) und
alles danach (Verifikation, Rollback-Anweisung) übernimmt der Agent.

## 2. Aktivierung (Betreiber, 2 Klicks)

1. **Vercel → Projekt `helmut-pilot` → Settings → Environment Variables → Add New:**
   Name `HELMUT_TENANT_JWT_MODE`, Wert `1`, **Environment = nur Production**, speichern.
2. **Redeploy auslösen:** Vercel → Deployments → aktuelles Production-Deployment →
   „Redeploy" (Env-Änderungen werden erst mit einem Redeploy wirksam).

> **Wichtig:** `SUPABASE_JWT_SECRET` muss byte-genau dem Supabase-Projekt-Secret
> entsprechen — sonst lehnt PostgREST jedes App-JWT ab und die tenant-scoped Reads
> fallen (fail-safe) auf Leerzustände zurück. Genau dafür ist die Verifikation da.

## 3. Verifikation SOFORT nach dem Redeploy

**Betreiber (mit Admin-Session):**
- `GET /api/admin/tenant-mode` → `tenantJwtModeEnabled: true`,
  `effectiveTransport: "authenticated (per-Mandant-JWT, RLS aktiv)"`,
  `jwtSecretPresent/anonKeyPresent: true`.
- Eingeloggt als cem-ince die App öffnen: **Lage, Radar, Helmut, Büro, Admin** laden
  wie zuvor; das Briefing zeigt weiter Cems Entscheidungen/Belege (nicht leer).

**Agent (unauthentifiziert, automatisch):**
- `GET /api/release/public` → Briefing/Radar/Datenmotor **unverändert** grün
  (16 Entscheidungen, 103 Belege, Radar 20/10). Dieser Endpoint rechnet das komplette
  V3-Briefing für cem-ince über die **tenant-scoped Reads** — bleiben die Zahlen
  erhalten, funktioniert der JWT-Pfad für Cem („Cem sieht seine Daten"). Fallen sie
  auf 0, ist der JWT-Pfad defekt → Rollback.
- Vercel-Runtime-Fehler: **leer**. Ein Anstieg von `[v3Store] … fehlgeschlagen`-Logs
  signalisiert ein JWT-/Claim-Problem.

**Mandantentrennung (Design-belegt + im Isolationstest 19/19 bestätigt):** Ohne
gültigen `user_id`-Claim liefert `helmut_current_tenant()` NULL → jede Tenant-Policy
verweigert → fehlender Nutzerkontext wird abgelehnt; ein Mandant kann keine Fremddaten
lesen. Interne System-Jobs laufen über `service_role` (BYPASSRLS) unverändert weiter
(sie nutzen NICHT den JWT-Pfad).

## 4. Rollback (sofort, folgenlos)

Falls ein wichtiger Test fehlschlägt:
1. **Vercel → Environment Variables:** `HELMUT_TENANT_JWT_MODE` **löschen** (oder auf
   `0` setzen).
2. **Redeploy** auslösen.
3. Ergebnis: sofortiger Rückfall auf den `service_role`-Pfad (unabhängig davon, dass
   die RLS-Policies aktiv bleiben — service_role umgeht sie). Zustand = exakt wie vor
   der Aktivierung. Kein Datenverlust, kein DB-Rollback nötig.

## 5. Danach

Nach erfolgreicher Aktivierung ist die **DB-seitige Mandantentrennung scharf**. Der
nächste sinnvolle Schritt Richtung Mehrmandantenbetrieb ist die **Profilversorgung in
der DB** (P2-9) + **KO-Anreicherung** (siehe `docs/ko-anreicherung-analyse.md`). Ein
zweiter echter Mandant sollte erst danach und kontrolliert dazukommen.
