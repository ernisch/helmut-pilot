# Betreiberplan — Secret-Phase (Schritt 2 der RLS-Aktivierung)

**Status:** Vorbereitet. **Noch NICHT ausgeführt.** Dieser Plan beschreibt die
**erste** Betreiber-Aktion nach dem Merge der drei Security-PRs (#46/#47/#48):
das **Setzen von zwei Secrets in Vercel**, **ohne** den Tenant-JWT-Modus zu
aktivieren und **ohne** RLS-Migration. Er benötigt eine ausdrückliche Freigabe,
weil er Production-Secrets ändert.

Bezug: `docs/rls-activation-rollout.md` (Gesamtreihenfolge, Schritt 2),
`docs/auth-service-role-matrix.md` (Mechanismus).

---

## 0. Vorab verifizierter Zustand (read-only, 2026-07-12)

- **Production liefert Commit `204d5ef`** (aktuelles Deployment `dpl_Fo7RvWf…`,
  READY; App-Shell-Assets tragen `?v=204d5ef9`).
- **Alle drei Merges (#46/#47/#48) automatisch deployt**, alle Deployments READY,
  **keine Build- oder Runtime-Fehler** (Vercel Runtime-Errors letzte 3 h: keine).
- **App gesund:** `/api/release/public` meldet Supabase aktiv, OpenAI aktiv,
  Briefing (1 Entscheidung/54 Empfehlungen), Radar (20 neu/10 Archiv),
  Datenmotor V3 100 %, 59/59 Direktlinks. Auth-Gate intakt (`/api/app/start`
  und `/api/ai/status` → 401 ohne Session). Der Status „Nicht pitchbereit"
  (Score 75) ist der **vorbestehende** operative Zustand (Lage-Frische/
  Live-Flow), **kein** durch die Merges verursachter Fehler.
- **`pg_policies` = 0** (RLS weiterhin inaktiv). **Tenant-JWT-Modus AUS.**

---

## 1. Welche Werte, aus welcher offiziellen Quelle

| Env-Variable | Offizielle Quelle | Rolle |
|---|---|---|
| `SUPABASE_JWT_SECRET` | Supabase-Dashboard → Projekt `ddckuvvpcytqbyfmbvie` → **Project Settings → API → JWT Settings → „JWT Secret"** | Signier-Secret; **muss exakt** dem Projekt-Secret entsprechen, sonst lehnt PostgREST jedes App-JWT ab |
| `SUPABASE_ANON_KEY` | Supabase-Dashboard → Projekt → **Project Settings → API → „Project API keys" → `anon` `public`** | `apikey`-Header für `authenticated`-Requests (ersetzt den service_role-Key erst, wenn der Modus AN ist) |

**Wichtig:** Beide Werte stammen **ausschließlich** aus dem Supabase-Dashboard
desselben Projekts, das die App bereits nutzt (`SUPABASE_URL` zeigt dorthin).
**Kein** neuer Account, **keine** Dritt-Quelle. Der `anon`-Key ist „publishable"
(kein Geheimnis im engeren Sinn), das `JWT_SECRET` ist **hochsensibel**.

---

## 2. Wo in Vercel eintragen

**Vercel → Team `nohut` → Projekt `helmut-pilot` → Settings → Environment
Variables → „Add New".** Für jede der beiden Variablen: Name exakt wie oben,
Wert aus der jeweiligen Supabase-Quelle einfügen, **Environment = nur
`Production`** auswählen, speichern.

- **`HELMUT_TENANT_JWT_MODE` in dieser Phase NICHT setzen** (bleibt leer/ungesetzt).
- Kein Redeploy nötig, um die Variablen nur *abzulegen*; sie werden erst beim
  nächsten Deployment bzw. bei der nächsten Function-Invocation gelesen — und
  bleiben ohne das Flag ohnehin ungenutzt (§4).

---

## 3. Betroffene Umgebungen

- **Nur `Production`.** Preview/Development erhalten in dieser Phase **nichts**.
- Begründung: Wir wollen ausschließlich die Production-Secrets vorbereiten; eine
  spätere isolierte Preview-Verifikation (Schritt 3 in `rls-activation-rollout.md`)
  bekommt ihre eigenen Werte auf einer separaten Supabase-Branch.

---

## 4. Werte, die NIEMALS im Terminalbericht, Chat, Commit oder Log erscheinen dürfen

- **`SUPABASE_JWT_SECRET`** — der eigentliche Signierschlüssel. Kompromittierung
  = jeder kann gültige Tenant-JWTs für **beliebige** Mandanten fälschen. **Nie**
  in Chat, Terminal, Commit, PR, `.env.example`, Screenshot oder Log.
- **`SUPABASE_ANON_KEY`** — publishable, aber projektspezifisch; trotzdem nicht
  in Berichte kopieren (keine Notwendigkeit).
- **`SUPABASE_SERVICE_ROLE_KEY`** (bestehend) — höchste Sensibilität, ohnehin nie
  ausgeben.
- **Regel für diesen Agenten/den Betreiber:** Werte werden **direkt** aus dem
  Supabase-Dashboard in das Vercel-Formular kopiert. Kein Zwischenschritt über
  Terminal (`echo`, `export`), Datei oder Chat. In `.env.example` stehen nur
  **leere Platzhalter** — das bleibt so.

---

## 5. Vorprüfung (vor dem Setzen)

1. **Kein Verhaltensrisiko bestätigt (code-belegt):** Die drei Env-Variablen
   werden ausschließlich im JWT-Block (`lib/helmut/storage.js`) gelesen. Einziger
   Produktions-Eintrittspunkt ist `tenantRequest` (Z. 1433):
   `if (tenantJwtModeEnabled() && tenantId) …`. `tenantJwtModeEnabled()` prüft
   **zuerst das Flag** (`if (!on) return false;`) und liest die Secrets **erst
   danach** — bei nicht gesetztem `HELMUT_TENANT_JWT_MODE` kehrt es zurück, **ohne
   die Secrets zu lesen**, und `tenantRequest` fällt auf `supabaseRequest`
   (service_role, unverändertes Verhalten) zurück. `verifyTenantJWT` hat **null
   Produktionsaufrufer** (nur Tests). → **Das bloße Ablegen der zwei Secrets bei
   ausgeschaltetem Modus kann garantiert keine Verhaltensänderung erzeugen.**
2. **Secret-Übereinstimmung:** `SUPABASE_JWT_SECRET` muss byte-genau dem
   Dashboard-Wert entsprechen (Copy-Paste, kein manuelles Abtippen).
3. **Scope:** Environment-Auswahl = **nur Production**; `HELMUT_TENANT_JWT_MODE`
   bleibt leer.
4. **Rollback bereit:** die Variable lässt sich in Vercel jederzeit wieder
   löschen (§8).

---

## 6. Aktivierungsreihenfolge (diese Phase)

1. `SUPABASE_ANON_KEY` in Vercel (Production) setzen.
2. `SUPABASE_JWT_SECRET` in Vercel (Production) setzen.
3. **`HELMUT_TENANT_JWT_MODE` NICHT setzen.** (Ende dieser Phase.)
4. Optional: ein Redeploy des aktuellen Commits, damit die Variablen im
   Function-Env verfügbar sind — **rein vorsorglich**, ohne Verhaltenswirkung
   (Modus bleibt aus). Alternativ ohne Redeploy: die Variablen werden beim
   nächsten regulären Deploy aktiv abgelegt.

**NICHT Teil dieser Phase (spätere, je eigene Freigaben):**
- Preview-Verifikation auf isolierter Supabase-Branch (kostenpflichtig).
- RLS-Migration auf Production.
- `HELMUT_TENANT_JWT_MODE=1` (Traffic-Umstellung).

---

## 7. Smoke-Tests (nach dem Setzen, read-only)

Erwartung: **identisches Verhalten wie vorher**, da der Modus aus bleibt.
1. `GET https://helmut-pilot.vercel.app/` → 200, App-Shell lädt (Asset-Version
   entspricht dem aktuellen Commit).
2. `GET /api/release/public` → 200, Kernsysteme grün (Supabase/OpenAI/Briefing/
   Radar/Datenmotor V3), Status-Score unverändert (~75, vorbestehend).
3. `GET /api/app/start` → **401** (Auth-Gate unverändert).
4. Eingeloggt (Betreiber im Browser): App-Start, **Lage, Radar, Helmut, Büro,
   Admin** stichprobenhaft öffnen → laden wie zuvor.
5. Vercel → Runtime-Errors (letzte 1 h) → **leer**.
6. Supabase (read-only): `SELECT count(*) FROM pg_policies WHERE schemaname='public'`
   → **0** (unverändert; diese Phase ändert nichts an der DB).

---

## 8. Risiko

- **Funktionales Risiko dieser Phase: praktisch null.** Modus aus → Secrets
  werden nicht gelesen (§5). Der schlimmste denkbare Tippfehler (falsches
  `JWT_SECRET`) hätte **erst dann** eine Wirkung, wenn später der Modus
  eingeschaltet wird — in dieser Phase ist er folgenlos.
- **Sicherheitsrisiko:** ausschließlich Handhabungsrisiko der Werte selbst
  (§4) — kein neues Angriffsfenster durch das bloße Ablegen.
- **Kein** DB-Eingriff, **keine** Migration, **kein** Datenschreibvorgang,
  **keine** Cron-Änderung.

---

## 9. Rollback

- **Sofort-Rollback:** in Vercel → Settings → Environment Variables die zwei
  Variablen **löschen**. Kein Redeploy zwingend nötig; beim nächsten Deploy/
  Invocation sind sie weg. Zustand danach = exakt wie vor dieser Phase.
- **Kein Datenverlust, kein DB-Rollback nötig** (diese Phase berührt die DB nicht).
- Code-Rollback (nur falls gewünscht, unabhängig): `git revert` der drei
  Merge-Commits `204d5ef`/`9f0aabc`/`7db4ca5` (Reihenfolge #48→#47→#46).

---

## 10. Erwartete Nutzerwirkung

- **Keine.** Für den Piloten (cem-ince) und jeden Nutzer ändert sich in dieser
  Phase nichts: App-Start, Login, Lage, Radar, Helmut, Büro und Admin verhalten
  sich byte-genau wie vor dem Setzen der Secrets (Modus aus → service_role-Pfad
  unverändert).

---

## 11. Danach: nächster echter Freigabepunkt

Nach erfolgreichem Ablegen der zwei Secrets ist der **nächste** freigabepflichtige
Schritt die **isolierte Preview-Verifikation** (Schritt 3 in
`docs/rls-activation-rollout.md`) — dafür wird eine **kostenpflichtige
Supabase-Preview-Branch** benötigt (eigener Freigabepunkt: „kostenpflichtige
externe Infrastruktur"). Erst danach folgen Production-RLS-Migration und
zuletzt `HELMUT_TENANT_JWT_MODE=1`. **Kein** dieser Schritte ist Teil der
Secret-Phase.
