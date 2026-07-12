# Sichere Rollout-Reihenfolge — RLS-Aktivierung (P0-2, Sprint 2 + 3)

**Status:** Planungsdokument. **Kein Schritt hierin wurde ausgeführt.**
Production ist zum Zeitpunkt der Erstellung unverändert (RLS enabled, 0
Policies; `HELMUT_TENANT_JWT_MODE` nicht gesetzt).

Dieses Dokument verbindet Sprint 2 (`supabase/migrations/20260712_tenant_rls_policies.sql`,
Policy-Design) mit Sprint 3 (`lib/helmut/storage.js`, App-seitiger JWT-Umbau,
flag-gated) zu einer **einzigen, sicheren Reihenfolge**. Jeder Schritt ist
einzeln verifizierbar und **einzeln zurückrollbar**, bevor der nächste beginnt.

---

## Grundprinzip

**Migration zuerst (sicher, No-Op), App-Umstellung danach (isoliert testbar),
niemals beide gleichzeitig.** Solange `HELMUT_TENANT_JWT_MODE` aus ist, sind
RLS-Policies für die App wirkungslos (service_role umgeht sie) — das erlaubt,
die DB-Änderung und die App-Änderung **vollständig zu entkoppeln** und jede für
sich zu verifizieren, bevor sie mit der jeweils anderen zusammenwirkt.

---

## Schritt 1 — App-Code (bereits erledigt, dieser Sprint)

- P0-1 Tenant-Guard (`assertTenant`/`assertTenantRows`) — PR #46.
- JWT-Signierung/-Transport-Weiche (`tenantRequest`, flag-gated) — dieser
  Sprint (PR folgt).
- **Verifikation:** `npm run test:tenant && npm run test:tenant-jwt` +
  volle Offline-Suite. **Kein Production-Deploy in diesem Schritt enthalten.**
- **Rollback:** `git revert` — reiner Code, keine DB-Auswirkung, da Flag aus.

## Schritt 2 — JWT-Claims (Konfiguration, NICHT Teil dieses Sprints)

- Betreiber trägt in Vercel (Production-Env) ein:
  `SUPABASE_JWT_SECRET` (aus Supabase-Dashboard → Auth → JWT Settings,
  **identisch** zum Projekt-Secret — sonst schlägt jede PostgREST-Verifikation
  fehl) und `SUPABASE_ANON_KEY` (publishable, aus Supabase-Dashboard → API
  Settings).
- `HELMUT_TENANT_JWT_MODE` bleibt **noch auf `0`/ungesetzt** — die Secrets
  allein aktivieren nichts (siehe `tenantJwtModeEnabled()`).
- **Verifikation:** keine (Secrets sind noch inert ohne Flag).
- **Rollback:** Env-Variable in Vercel wieder entfernen — keine Auswirkung, da
  ohnehin noch nichts aktiv war.
- **⚠️ Dies ist ein Freigabepunkt** (Änderung von Secrets) — separat vom
  Betreiber auszuführen, nicht durch diesen Agenten.

## Schritt 3 — Service-Role-Trennung verifizieren (Staging/Preview)

- Auf einer **isolierten Supabase-Preview-Branch** (kostenpflichtig, eigene
  Freigabe nötig): Migration `20260712_tenant_rls_policies.sql` anwenden.
- `HELMUT_TENANT_JWT_MODE=1` **nur** in der Preview-Deployment-Umgebung
  setzen (nicht Production).
- Smoke-Test: `GET /api/app/start` (Lage-Cache via `getRenderedBriefingV3` +
  `listMatchingResults`) und `POST /api/office/generate` (Office-Pfad) gegen
  die Preview ausführen, mit einem echten Test-Mandat.
- **Erwartung:** identisches Verhalten wie mit `service_role` — die neuen
  Policies lassen den eigenen Tenant durch (`user_id = tenant()`), Cross-
  Tenant-Zugriff (zweites Test-Mandat) liefert 0 Zeilen.
- **Verifikation:** `docs/rls-tenant-policies-draft.md` §7 (empfohlener
  Live-Test), plus manuelle Prüfung der zwei Live-Write-Pfade
  (`saveOfficeOutput`, `saveRenderedBriefingV3`) — funktionieren INSERT/UPDATE
  unter `authenticated` + RLS `with check`?
- **Rollback:** Rollback-Migration auf der Preview-Branch anwenden, Branch
  danach löschen.
- **⚠️ Dies ist ein Freigabepunkt** (kostenpflichtige Supabase-Branch) —
  separat freizugeben.

## Schritt 4 — RLS-Migration auf Production anwenden

- **Erst nachdem Schritt 3 erfolgreich war.**
- Migration `20260712_tenant_rls_policies.sql` manuell auf Production
  anwenden (`psql` oder Supabase-Dashboard SQL-Editor durch den Betreiber).
- `HELMUT_TENANT_JWT_MODE` bleibt zu diesem Zeitpunkt **weiterhin aus** in
  Production — die neuen Policies sind aktiv, aber die App nutzt sie noch
  nicht (service_role bypass). **Kein Nutzer merkt etwas.**
- **Verifikation:** `SELECT count(*) FROM pg_policies WHERE schemaname='public'`
  → erwartete Anzahl (siehe Kommentar am Ende der Migrationsdatei).
  `SELECT * FROM helmut_store WHERE id NOT LIKE 'main-p-%'` bleibt über
  `service_role` weiterhin voll lesbar (Kontrollprobe: nichts wurde
  versehentlich restriktiver für die App selbst).
- **Rollback:** `20260712_tenant_rls_policies_rollback.sql` anwenden →
  Zustand identisch zu vorher (0 Policies).
- **⚠️ Dies ist ein Freigabepunkt** (Production-Migration + RLS-Policy-Aktivierung).

## Schritt 5 — App-Traffic schrittweise umstellen

- `HELMUT_TENANT_JWT_MODE=1` in Production setzen (Config-Änderung, **kein**
  Secret, aber sicherheitsrelevant genug für eine eigene Freigabe/Beobachtung).
- **Empfehlung:** zuerst nur für den Piloten (cem-ince) beobachten — da es nur
  ein aktives Mandat gibt, ist „schrittweise pro Mandant" hier gleichbedeutend
  mit „an/aus für alle", da HELMUT_TENANT_JWT_MODE global gilt (kein
  Per-Mandant-Rollout-Mechanismus in diesem Sprint gebaut — bei mehreren
  Mandanten müsste diese Grenze vor Aktivierung erweitert werden).
- **Verifikation:** Live-Smoke `GET /api/app/start`, `POST /api/office/generate`
  gegen Production mit dem echten Pilotprofil; Vercel-Logs auf
  `[v3Store] ... fehlgeschlagen` prüfen (jede fehlgeschlagene Anfrage fällt
  laut Code-Design fail-safe auf einen Leerzustand zurück, NICHT auf einen
  Crash — aber ein Anstieg dieser Logs signalisiert ein JWT-/Claim-Problem).
- **Rollback:** `HELMUT_TENANT_JWT_MODE` auf `0`/entfernen — sofortiger
  Rückfall auf `service_role`, unabhängig davon, ob die RLS-Policies aktiv
  sind (service_role umgeht sie immer).

## Schritt 6 — Smoke-Tests (nach jedem der obigen Schritte)

Mindestens: `npm run test:tenant`, `npm run test:tenant-jwt`,
`npm run test:rls-policy-sim`, volle Offline-Suite (`node scripts/*.js`
gemäss `audit/qa-strategy.md`), plus die in Schritt 3/5 beschriebenen
Live-Smokes gegen Preview bzw. Production.

## Schritt 7 — Rollback-Übersicht (kompakt)

| Ebene | Rollback-Aktion | Betrifft laufenden Betrieb? |
|---|---|---|
| App-Code (Schritt 1) | `git revert` | Nein (Flag aus) |
| Secrets (Schritt 2) | Env-Variable entfernen | Nein (Flag aus) |
| Preview-Verifikation (Schritt 3) | Branch löschen | Nein (isoliert) |
| RLS-Migration (Schritt 4) | Rollback-SQL anwenden | Nein (App nutzt weiter service_role) |
| Traffic-Umstellung (Schritt 5) | Flag zurück auf `0` | **Sofortiger Rückfall**, kein Datenverlust |

---

## Warum diese Reihenfolge sicher ist

Jeder Schritt lässt sich **unabhängig** zurückrollen, ohne einen der anderen
zu berühren, weil die beiden Achsen (RLS-Policy-Existenz vs. App-JWT-Nutzung)
**orthogonal** sind: Policies ohne JWT-Traffic = wirkungslos aber sicher;
JWT-Traffic ohne Policies = unmöglich (Migration muss zuerst da sein, sonst
lehnt PostgREST wegen `enable row level security` ohne passende Policy jede
Zeile ab — das ist der Grund, warum Schritt 4 zwingend vor Schritt 5 kommt).
Diese Reihenfolge stellt sicher, dass **zu keinem Zeitpunkt** ein halb
konfigurierter Zustand den Piloten (cem-ince) sichtbar beeinträchtigt.
