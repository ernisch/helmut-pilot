# JWT-Umstellung: Warum selbst signierte HS256-Tokens abgelehnt werden

Stand 2026-07-13. Einfach erklärt, mit dem belegten Live-Befund.

## Der Befund (verbindlich belegt)

Der Profil-Lesepfad `getProfileFromDb` scheitert in Production reproduzierbar mit
genau diesem Fehler (verbatim aus den Runtime-Logs des aktuellen Deployments,
08:34:52):

```json
{"code":"PGRST301","details":"None of the keys was able to decode the JWT","message":"No suitable key or wrong key type"}
```

Dazu passend im Admin-Endpoint `/api/admin/tenant-mode`:
`tenantJwtReadWorks: false`, `profileSource: helmut_store (Blob-Fallback)`,
`secretMatchesLegacy: null`.

### Warum HS256 abgelehnt wird

Supabase kennt zwei Systeme, um JWTs zu signieren
([Doku](https://supabase.com/docs/guides/auth/signing-keys)):

- **Legacy**: ein einziges geteiltes Secret (symmetrisch, HS256). Damit ließen
  sich früher eigene Tokens signieren, die PostgREST akzeptierte. „No longer
  recommended."
- **Signing Keys (neu)**: asymmetrische Schlüssel (RSA/EC). Der **private**
  Schlüssel liegt bei Supabase und wird **nie exportiert**.

Dieses Projekt ist auf das **neue asymmetrische System** umgestellt. Belege:

1. Die Fehlermeldung „**No suitable key or wrong key type**" bedeutet exakt: der
   Algorithmus unseres Tokens (HS256, symmetrisch) hat im aktiven Schlüsselsatz
   von PostgREST **keinen passenden Schlüssel**. Wäre nur das Secret falsch, aber
   HS256 noch aktiv, hieße der Fehler „JWSInvalidSignature" — tut er aber nicht.
2. `secretMatchesLegacy: null`: der öffentliche anon-Key des Projekts ist kein
   Legacy-HS256-JWT mehr, sondern der moderne publishable Key (`sb_publishable_…`).
3. Auch nach der Korrektur von `SUPABASE_JWT_SECRET` auf das Legacy Secret blieb
   der Fehler bestehen.

**Kernkonsequenz:** Weil der aktive private Signierschlüssel bei Supabase liegt
und nicht exportierbar ist, **kann die App kein von PostgREST akzeptiertes Token
mehr selbst signieren** — unabhängig vom Secret-Wert. Der HS256-Selbst-Signier-
Ansatz ist damit endgültig ein Sackgassen-Weg.

## Der offiziell unterstützte Weg

Für einen **vertrauenswürdigen Backend-Dienst**, der den Mandanten serverseitig
wählt (Helmut hat keinen End-User-Login gegen Supabase), gibt es zwei Optionen:

- **(A) service_role + verpflichtendes App-seitiges Tenant-Scoping** — der von
  Supabase für Server-/Backend-Zugriff vorgesehene Weg. RLS wird umgangen; der
  Backend-Code ist dafür verantwortlich, **jeden** Read auf den eigenen Mandanten
  zu filtern (`profiles?id=eq.<tenant>`). Genau dieses Muster nutzt der **gesamte
  Rest der App bereits** (helmut_store, knowledge_objects, briefings … alle über
  service_role, alle 200). **Keine** selbst gebauten Tokens.
- **(B) Echte Supabase-Auth-Nutzer** — pro Mandant ein `auth.users`-Eintrag und
  ein per-User-Access-Token via GoTrue (vom aktiven asymmetrischen Key signiert),
  sodass RLS mit `auth.jwt()` die harte Grenze wird. Größerer Umbau (Nutzer-
  Provisionierung, Token-Ausgabe/-Refresh, Session-Handling) und berührt eine
  Freigabe-Grenze (automatisches Anlegen echter Nutzerkonten).

## Umgesetzte Codeänderung (Option A, auf dem Branch)

`tenantJwtModeEnabled()` ist **dauerhaft stillgelegt** (gibt immer `false`
zurück, ausführlicher Kommentar im Code). Wirkung:

- `tenantRequest` nutzt **immer** `supabaseRequest` (service_role) — es werden
  **keine** selbst signierten Tokens mehr erzeugt.
- `getProfileFromDb` liest `mandate_profiles` damit über service_role (wie alle
  anderen DB-Reads) → statt 401 nun 200 → `tenantJwtReadWorks: true`,
  `profileSource: mandate_profiles (DB)`.
- Die Mandantentrennung liegt im `id=eq.<tenant>`-Filter des Endpoints — dieselbe
  Vertrauensgrenze wie im gesamten übrigen Produkt.
- `signTenantJWT`/`verifyTenantJWT` bleiben nur für Tests/Historie erhalten,
  werden im Request-Pfad nicht mehr aufgerufen. `SUPABASE_JWT_SECRET` wird nicht
  mehr benötigt.

**Cem bleibt jederzeit funktionsfähig:** der Blob-Fallback ist unverändert; fällt
der DB-Read (aus welchem Grund auch immer) aus, dient weiter der Blob.

Tests: tenant-jwt 30/30, profile-db 44/44, profile-completeness 46/46,
jwt-endpoint-diagnose 9/9, p1-security 322/322.

## Sicherer nächster Schritt

Diese Änderung ist **noch nicht deployt** (nur auf dem Branch, Preview). Vor dem
Production-Deploy braucht es die ausdrückliche Freigabe. Nach Merge/Deploy prüfen:
`/api/admin/tenant-mode` muss `tenantJwtReadWorks: true` und
`profileSource: mandate_profiles (DB)` zeigen; Lage/Radar/Helmut/Büro/Admin grün;
keine PGRST301-Fehler mehr in den Runtime-Logs.

Optional später: Option B als echte RLS-Grenze — separater Block, eigene Freigabe.
