# Aufgabe 4 — JWT-Konzept

**Modus:** reines Konzept. **Keine Implementierung, kein Auth-Flow aktiviert, kein Secret
angelegt.**

> **Grundprämisse (verbindlich).** Die App **kann kein von PostgREST akzeptiertes Token
> mehr selbst signieren** (Supabase auf asymmetrische Signing-Keys umgestellt; PGRST301).
> Der Selbstsignatur-Pfad (`signTenantJWT`) ist tot und bleibt nur für Tests.
> **Konsequenz:** Tokens werden von **Supabase-Auth (GoTrue)** ausgestellt, signiert mit dem
> **aktiven asymmetrischen Signing-Key** des Projekts. Dieses Konzept beschreibt diesen Weg.

---

## 1. Woher das Token kommt (Ausstellung)

- **Aussteller:** Supabase-Auth (GoTrue). Signatur mit dem projektaktiven **asymmetrischen**
  Key (RSA/EC, JWKS). Der private Schlüssel liegt bei Supabase, wird nie exportiert.
- **Wer bekommt ein Konto:** je Mandant **ein** technischer Supabase-Auth-Nutzer
  (`auth.users`-Eintrag), dessen `id`/Metadaten den `politicianId` tragen. Das bestehende
  scrypt-Login (`helmut_session`) bleibt die **primäre** Nutzeranmeldung; der Server holt
  **serverseitig** für die aufgelöste `politicianId` ein GoTrue-Access-Token und nutzt es
  nur als DB-Ausweis. Der Client sieht das Token **nie**.
- **Verifikation:** **PostgREST verifiziert selbst** gegen den JWKS — die App tut dafür
  nichts. Erfolgreich verifizierte Claims stehen als `request.jwt.claims` bereit;
  `helmut_current_tenant()` liest daraus `user_id`.

Das ist Option B aus `docs/mandantentrennung-architektur.md` und der offiziell unterstützte
Weg aus `docs/multitenancy-jwt-signing-keys-umstellung.md` §„offiziell unterstützt".

---

## 2. Benötigte Claims

| Claim | Wert | Pflicht | Zweck |
|-------|------|---------|-------|
| `role` | `helmut_reader` | ja | wählt die Read-only-Rolle in PostgREST (kein `service_role`, kein breites `authenticated`) |
| `user_id` | `<politicianId>` | ja (Tenant-Reads) | **Tenant-Claim** — Basis von `helmut_current_tenant()` und aller Kategorie-A-Policies |
| `sub` | GoTrue-User-UUID | ja | Standard-Subject des GoTrue-Tokens; identifiziert den technischen Auth-Nutzer |
| `aud` | `authenticated` | ja | Standard-Audience, von PostgREST erwartet |
| `iat` | Ausstellzeit | ja | Kurzlebigkeit/Replay-Schutz |
| `exp` | Ablauf (kurz, siehe §5) | ja | erzwingt Rotation; abgelaufen → PostgREST lehnt ab |
| `iss` | Supabase-Auth-URL | ja | Herkunft; Teil der JWKS-Verifikation |

**Keine personenbezogenen Daten im Claim** — kein Name, keine E-Mail, keine Rolle innerhalb
des Mandats (DSGVO-Minimierung, konsistent mit `docs/auth-service-role-matrix.md` §4). Der
`user_id`-Claim ist eine interne, pseudonyme `politicianId` — keine Klarnamen.

### Der Tenant-Claim im Detail

- **Name:** `user_id` (1:1 zur App-internen `politicianId`, identisch zur Spalte, gegen die
  die RLS-Policies prüfen).
- **Muss** so in den GoTrue-Token gelangen (App-Metadaten / Custom-Access-Token-Hook), denn
  GoTrue setzt standardmäßig `sub`, nicht `user_id`. Die Policy-Basis
  `auth.jwt() ->> 'user_id'` erfordert genau diesen Custom-Claim — ein reiner `sub`-basierter
  Token würde **nicht** matchen (Freigabe-relevanter Prüfpunkt, siehe
  [`07-security-gate.md`](07-security-gate.md)).
- **Fallback-Alternative:** Policies auf `sub` umstellen und `user_id`-Spalten auf die
  GoTrue-UUID mappen — größerer Datenumbau, daher **nicht** bevorzugt. Der Custom-Claim
  `user_id` hält die vorhandenen Policies unverändert.

---

## 3. Ablauf bei **fehlendem** Claim

| Situation | Verhalten |
|-----------|-----------|
| Kein Token gesendet | PostgREST behandelt Request als `anon` → keine Policy matcht (`TO authenticated`/`helmut_reader`) → **0 Zeilen**. Der App-Read-Zweig ist **fail-closed**: kein stiller Rückfall auf `service_role`. |
| Token ohne `user_id`-Claim | `helmut_current_tenant()` = `nullif(NULL,'')` = **NULL** → jede Kategorie-A-Policy `using (user_id = NULL)` ist niemals wahr → **0 Zeilen**. Kategorie-B (`shared_read`) liefert weiter Korpusdaten (kein Tenant nötig). |
| Token ohne `role`-Claim | fällt auf Default-Rolle → kein Grant auf die Reader-Tabellen → **Deny**. |

**Server-Reaktion:** In der Übergangsphase (Shadow/Dark-Launch) liefert der Server das
**Legacy-Ergebnis** und **loggt** den fehlenden Claim (Telemetrie-Signal
`reader_claim_missing`). Nach vollständigem Cutover liefert er einen **definierten
Leerzustand** + Log — nie Fremddaten, nie service_role als heimlichen Ersatz.

---

## 4. Ablauf bei **ungültigem** Claim

| Situation | Verhalten |
|-----------|-----------|
| Signatur ungültig / falscher Key | PostgREST: **PGRST301** „No suitable key" → Request abgelehnt (kein DB-Zugriff). Der App-Read-Zweig fängt den Fehler → fail-closed (Legacy-Fallback bzw. Leerzustand + Alarm). |
| `exp` überschritten | PostgREST lehnt abgelaufenes Token ab → fail-closed. Der Server holt ein frisches Token (§5) und wiederholt **einmalig**; erneuter Fehlschlag → Fallback + Alarm. |
| `user_id` ≠ tatsächlicher Session-Mandant (Manipulationsversuch) | Der App-Read-Zweig setzt den `user_id`-Filter **selbst** aus der serverseitig aufgelösten Session — ein vom Token abweichender Claim kann nur **weniger** sehen (RLS ∩ App-Filter), nie mehr. Divergenz wird geloggt (`reader_claim_mismatch`). |
| `user_id` eines fremden Mandanten (böswillig gesetzt) | Da der Server das Token serverseitig für die **eigene** aufgelöste Session holt, ist ein fremder Claim gar nicht erst erzeugbar; käme er dennoch vor, filtert RLS auf genau diesen fremden Tenant — der App-Filter (eigener Tenant) schneidet ihn aber auf **0** (Schnittmenge leer). Defense-in-Depth greift. |

---

## 5. Token-Rotation

- **Kurzlebigkeit:** GoTrue-Access-Tokens laufen standardmäßig **1 Stunde** (konfigurierbar,
  z. B. 15 Min für höhere Sicherheit). Da der Server das Token **pro Request bzw. pro
  Session-Fenster** frisch beschafft, ist die effektive Lebensdauer im DB-Pfad klein.
- **Refresh:** GoTrue liefert zum Access-Token einen **Refresh-Token**. Der Server hält den
  Refresh-Token **serverseitig** (nie im Client) und tauscht ihn bei Ablauf gegen ein neues
  Access-Token. Der Nutzer merkt nichts.
- **Signing-Key-Rotation:** Rotiert Supabase den asymmetrischen Signing-Key, veröffentlicht
  es beide Keys übergangsweise im JWKS — bereits ausgestellte Tokens bleiben gültig, bis sie
  ablaufen; neue werden mit dem neuen Key signiert. Kein App-Eingriff nötig (die App signiert
  nicht selbst). **Genau das** ist der Vorteil gegenüber dem toten HS256-Selbstsignatur-Weg.
- **Kompromittierung:** Verdacht auf Leak eines Refresh-Tokens → GoTrue-Session des
  betroffenen technischen Nutzers **serverseitig invalidieren** (Sign-out/Revoke) → alle
  abgeleiteten Access-Tokens laufen binnen einer Lebensdauer aus; sofortiger Effekt durch
  Reader-Flag-Aus (Rückfall auf Legacy-Read) möglich.

---

## 6. Ablauf nach **Logout**

- **App-Logout (`helmut_session`-Cookie gelöscht):** Der Client hat ohnehin kein DB-Token;
  der Server löst ohne gültige Session **keine** `politicianId` mehr auf →
  `assertTenant` wirft → **kein** DB-Read. Der GoTrue-Refresh-Token der Session wird
  serverseitig verworfen/invalidiert.
- **Kein „hängendes" DB-Token:** Da Tokens serverseitig kurzlebig und session-gebunden sind,
  existiert nach Logout kein weiterverwendbarer DB-Ausweis. Ein zwischengespeichertes
  Access-Token läuft spätestens nach `exp` aus.
- **Cache-Invalphierung:** Bestehende Cache-Isolation (`cache-isolation-test.js`) stellt
  sicher, dass kein Mandantendatensatz aus einem gemeinsamen Cache an eine andere Session
  gelangt — unabhängig vom Token.

---

## 7. Was in diesem Sprint **nicht** getan wird

- **Kein** GoTrue-Nutzer angelegt, **kein** Custom-Access-Token-Hook konfiguriert.
- **Kein** `SUPABASE_JWT_SECRET`/Refresh-Handling verdrahtet.
- **Kein** `role`-Claim, **kein** `HELMUT_READER_MODE`-Flag gesetzt.
- `signTenantJWT`/`verifyTenantJWT` bleiben unverändert (Test/Historie), werden **nicht**
  reaktiviert.

Die Ausstellungs-Infrastruktur (GoTrue-Provisionierung, Token-Hook, Refresh-Loop) ist der
**Bauauftrag** eines späteren Aktivierungs-Sprints und in
[`05-aktivierungsplan-rollout.md`](05-aktivierungsplan-rollout.md) Phase 1 als
Voraussetzung geführt.
