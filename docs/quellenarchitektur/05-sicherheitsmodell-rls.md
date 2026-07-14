# Sicherheitsmodell: Mandantentrennung, JWT, RLS, service_role (Stand 2026-07-13)

**Zweck:** Den bisherigen Widerspruch zwischen den Aussagen „JWT scharf / RLS scharf" und
„RLS inert / service_role / App-Guard" **eindeutig** auflösen — durch Verfolgung einer echten
Anfrage vom Browser bis zur Datenbank am tatsächlichen Code.

> **Kernaussage (eindeutig):** Production trennt Mandanten **app-seitig** (Code), **nicht** über
> RLS. Jeder DB-Zugriff läuft über den **`service_role`**-Schlüssel, der RLS **umgeht**. Die
> vorhandenen RLS-Policies sind angewendet, aber **funktional inert**. Der frühere JWT-/RLS-Pfad
> wurde am 2026-07-13 **dauerhaft stillgelegt** (Commit `f952b69`, #68).

## 1. Der Weg einer echten Anfrage (Browser → DB)

```
Browser (angemeldeter Abgeordneter, Session-Cookie)
   │  HTTPS-Request, z. B. GET /api/app/start
   ▼
server.js Route-Handler
   │  löst die Session zu einer politicianId (= tenant/user_id) auf
   │  (Konten/Sessions liegen im helmut_store-Blob 'main-auth', service_role-verwaltet)
   ▼
storage.js — mandantenbezogene Lesefunktion (z. B. listDecisions(userId))
   │  1) assertTenant(userId)  → wirft hart, wenn kein Mandantenkontext (kein stiller Fallback)
   │  2) baut die Query MIT explizitem Filter  ...?user_id=eq.<politicianId>
   │  3) tenantRequest(endpoint, tenantId)
   ▼
tenantRequest:  if (tenantJwtModeEnabled() && tenantId) → tenant-JWT-Pfad
                else                                    → supabaseRequest (service_role)
   │  tenantJwtModeEnabled() === false (hart)  →  IMMER service_role
   ▼
supabaseRequest:  apikey + Authorization = SUPABASE_SERVICE_ROLE_KEY
   ▼
Supabase / PostgREST:  Rolle = service_role  →  RLS wird UMGANGEN (BYPASSRLS)
   ▼
Postgres:  liefert die Zeilen — gefiltert ausschließlich durch den App-seitigen
           user_id=eq.<tenant>-Filter (nicht durch eine DB-Policy)
```

## 2. Die fünf Fragen — eindeutig beantwortet

| Frage | Antwort |
|---|---|
| **Welcher DB-Zugang wird verwendet?** | Ausschließlich der **`service_role`**-Schlüssel (`SUPABASE_SERVICE_ROLE_KEY`), `storage.supabaseRequest` (`storage.js:1411-1417`). |
| **Greift RLS tatsächlich?** | **Nein.** Die Policies sind angewendet, aber `service_role` hat `BYPASSRLS` → sie werden nie ausgewertet. RLS ist **inert**. |
| **Wo wird die Mandantentrennung erzwungen?** | **App-seitig im Code:** `assertTenant`/`assertTenantRows` (`storage.js:877-893`, hart, kein stiller „alle Mandanten"-Fallback) **plus** ein verpflichtender `user_id=eq.<tenant>`-Filter in jeder mandantenbezogenen Query. |
| **Umgeht `service_role` RLS?** | **Ja** — per Definition (`BYPASSRLS`). Das ist der Grund, warum die App-seitige Trennung die einzige wirksame Linie ist. |
| **Welches Sicherheitsmodell nutzt Production?** | **`service_role` + verpflichtendes App-seitiges Tenant-Scoping.** Der tenant-JWT-/`authenticated`-Pfad ist codiert, aber **stillgelegt** (`tenantJwtModeEnabled()` gibt hart `false`, `storage.js:1462`). |

## 3. Auflösung des Widerspruchs

- **`docs/multitenancy-abschlussbericht.md` (2026-07-12)** behauptet „JWT scharf, RLS scharf, die
  Datenbank trennt die Kunden selbst". Das war **zum Zeitpunkt nicht haltbar** bzw. beschrieb einen
  angestrebten Zustand.
- **Ursache der Stilllegung:** Das Supabase-Projekt hat von der Legacy-JWT-Secret-Signierung
  (symmetrisch, HS256) auf **asymmetrische Signing-Keys** (RSA/EC, JWKS) umgestellt. Ein von der App
  **selbst** signiertes HS256-Token wird von PostgREST hart abgelehnt
  (`PGRST301 "None of the keys was able to decode the JWT"`). Der private Schlüssel liegt bei
  Supabase und wird nie exportiert → die App **kann kein akzeptiertes Token mehr selbst signieren**.
  Belegt im Code-Kommentar `storage.js:1443-1461` und im Fix-Commit `f952b69` (#68).
- **Folge (aktueller, korrekter Stand):** `tenantJwtModeEnabled()` ist hart `false`; `tenantRequest`
  nutzt immer `service_role`; `signTenantJWT`/`verifyTenantJWT` bleiben nur für Tests/Historie.

**Dieses Dokument ist ab sofort die maßgebliche Quelle** für den Rollout-Status der
Mandantentrennung. `multitenancy-abschlussbericht.md` §§ zu „RLS/JWT scharf" sind damit überholt.

## 4. Bewertung: Ist das sicher genug?

- **Für den kontrollierten Ein-/Wenig-Mandanten-Betrieb (heute):** vertretbar — vorausgesetzt, die
  App-Guards sind lückenlos. `assertTenant` erzwingt den Kontext hart (kein stiller Fallback), und
  das frühere latente IDOR (ungefiltertes `listDecisions` ohne `userId`) wurde geschlossen.
- **Das Restrisiko ist ein *vergessener* Guard:** Da RLS nicht greift, wäre **ein einziger**
  mandantenbezogener Read ohne `assertTenant` + `user_id`-Filter ein IDOR. Die DB fängt das **nicht**
  ab. Deshalb: neue mandantenbezogene Reads **immer** über die Guard-Helfer.
- **Die neuen Quellentabellen (Sprint 1/2)** sind hiervon unberührt: Sie sind **global/mandantenlos**
  (keine `user_id`-Spalte) und seit der Sprint-2-Verschärfung **service_role-only** (RLS aktiviert,
  keine `authenticated`-Policy) — konsistent mit diesem Modell.

## 5. Weg zu DB-erzwungener Trennung (freigabepflichtig, nicht Teil dieses Sprints)

Echte, DB-seitig erzwungene Mandantentrennung erfordert **echtes Supabase-Auth (GoTrue)**: Tokens,
die vom **aktiven** (asymmetrischen) Signing-Key signiert sind, sodass PostgREST sie akzeptiert und
`request.jwt.claims` für die RLS-Policies (`auth.jwt()->>'user_id'`) setzt. Das ist ein eigener,
größerer Schritt (Login/Session-Umbau, Token-Ausgabe, RLS-Verifikation) und **freigabepflichtig**
(RLS-/Auth-Änderung in Production). **In diesem Sprint wurde nichts an RLS oder Production geändert.**
