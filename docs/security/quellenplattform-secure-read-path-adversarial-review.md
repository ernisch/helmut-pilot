# Adversarialer Security-Review — Secure Read Path (Sprint 8)

**Auftrag:** Unabhängiger, feindseliger Review (Red Team / Pentest / Security-Architektur / DSGVO-Audit / SaaS-Security) des in Sprint 7 vorbereiteten Secure Read Path.
**Reviewziel-Branch (Code):** `architecture/quellenplattform-secure-read-path` @ `f1cf504`
**Review-Branch (dieses Dokument):** `claude/secure-read-path-security-review-rm21uv`
**Datum:** 2026-07-21
**Modus:** Nur Audit. Keine Aktivierung, keine Produktionsänderung, keine Migration, kein Merge, kein PR. Es wurde **kein** Produktionszugriff ausgeführt, **kein** Credential verwendet, **keine** Verbindung gebaut.

> **Grundhaltung dieses Reviews:** Der Code wird nicht verteidigt. Es wird angenommen, dass Fehler existieren, und gezielt danach gesucht. Jede theoretische Schwäche ist gelistet, jede praktische priorisiert.

---

## 0. Prüfumfang (die auditierten Artefakte)

| Datei | Rolle |
|---|---|
| `lib/helmut/quellenarchitektur/secure-read-path.js` | Leitplanken: Allowlists, `validateReadRequest`, Repository-Vertrag |
| `lib/helmut/quellenarchitektur/production-read-guard.js` | Read-only-Guard, `readOnlyRequest`, `readOnlyRepository` |
| `lib/helmut/quellenarchitektur/master/tenant-scope.js` | Sieben-Schichten-Mandantentrennung (Referenz-Auflösung) |
| `lib/helmut/tenant-context.js` | Mandantenauflösung (kein Default-Mandant) |
| `lib/helmut/storage.js` | Realer Transport (`supabaseRequest`/`tenantRequest`, JWT) — der Pfad, an den aktiviert würde |
| `supabase/migrations/20260712_tenant_rls_policies.sql` | RLS-Entwurf (vorbereitet, **nicht angewandt**) |
| `scripts/secure-read-path-test.js`, `scripts/production-read-guard-test.js` | Test-Suiten (25 + 14 Assertions) |

**Kernbefund vorab:** Das Modul ist heute korrekt **inert** — es liest nichts, importiert keinen Storage/Supabase/Netz-Client, enthält keine Credentials (verifiziert durch Test 24/25). Die eigentlichen Risiken liegen **nicht** darin, dass heute etwas leckt, sondern darin, dass die **Sicherheitsgarantien, auf die sich eine spätere Aktivierung verlassen würde, löchrig sind**. Der Auftrag lautet „beweise, dass er sicher aktiviert werden kann" — dieser Beweis **gelingt nicht**. Nachfolgend die Gründe.

---

## 1. Findings nach Priorität

### 🔴 P0 — Aktivierung im Ist-Zustand führt sofort zu Cross-Tenant-Datenabfluss

#### P0-1 · `buildMandateEndpoint` erzwingt keinerlei Mandanten-Scope; die Tenant-Isolation existiert weder app- noch RLS-seitig

**Beschreibung.**
`buildMandateEndpoint(tenantId)` nimmt eine `tenantId` entgegen, **verwendet sie aber nicht**:

```js
// secure-read-path.js:158-160
function buildMandateEndpoint(tenantId) {
  return `${ENDPOINT_PREFIX}mandate_profiles?select=${FIELD_ALLOWLIST.mandate_profiles.join(",")}&aktiv=eq.true`;
}
```

Der erzeugte Endpoint trägt **keinen** `user_id=eq.<tenant>`-Filter. `validateReadRequest` verlangt zwar, dass eine `tenantId` *vorhanden und validiert* ist, verlangt aber **nicht**, dass der Endpoint tatsächlich einen Mandanten-Filter *trägt* (die Prüfung vergleicht nur einen *bereits vorhandenen* `tenant_id`-Filter, siehe P1-1). Aufgabe 3 des Entwurfs fordert ausdrücklich „(d) einen Tenant-Filter" — diese Bedingung ist im Code **nicht implementiert**.

Die Isolation von `mandate_profiles` soll laut Kommentar „über RLS (Tenant-JWT)" laufen (`secure-read-path.js:122-125`). Dieser RLS-Pfad ist jedoch **nachweislich tot**:

- `tenantJwtModeEnabled()` ist **hart auf `false`** verdrahtet (`storage.js:2432-2434`). `tenantRequest` fällt daher **immer** auf `supabaseRequest` mit **`service_role` (BYPASSRLS)** zurück (`storage.js:2574-2579`, `2381-2393`).
- Der Self-Signed-HS256-Pfad ist als **`STILLGELEGT` / dauerhaft inert** dokumentiert — PostgREST akzeptiert die Tokens nach der Umstellung auf asymmetrische Signing-Keys hart nicht mehr (`storage.js:2413-2431`).
- Die RLS-Migration `20260712_tenant_rls_policies.sql` ist **nur vorbereitet, nicht angewandt**, und ist laut eigenem Kopfkommentar **funktional ein No-Op**, solange die App `service_role` nutzt (`…policies.sql:39-58`).

**Angriff.** Ein späterer Entwickler injiziert den einzigen heute funktionierenden Transport als `approvedReader` (service_role). `repo.listMandates("tenant-1")` sendet `GET /rest/v1/mandate_profiles?select=…&aktiv=eq.true` — **ohne Mandanten-Filter, unter service_role, mit inertem RLS**. PostgREST liefert **die Mandatsprofile ALLER Mandanten der gesamten Plattform** zurück. Kein Angreifer-Input nötig; der „legitime" Aufruf selbst ist der Leak.

**Auswirkung.** Vollständiger Cross-Tenant-Bruch. Jeder Mandant könnte die politischen Fachprofile (Partei, Fraktion, Ausschüsse, Regierungsrolle, Region) **jedes anderen Mandanten** lesen. Der Secure Read Path ist damit **strikt schwächer** als das übrige App-Muster, das laut RLS-Draft app-seitig per `assertTenant`/`id=eq.<tenant>` filtert (`…policies.sql:13-15`).

**Wahrscheinlichkeit.** Hoch bei Aktivierung — es ist der Default-Pfad, kein Fehlbedienungs-Sonderfall.

**Empfohlene Behebung.**
1. `buildMandateEndpoint` **muss** den app-seitigen Filter erzwingen: `…&user_id=eq.${encodeURIComponent(tenantId)}` (analog zum bestehenden `assertTenant`-Muster). Leere/ungültige `tenantId` → Abbruch **vor** dem Bauen.
2. `validateReadRequest` muss für tenant-scoped Tabellen die **Anwesenheit** eines exakten Eigen-Mandanten-Filters auf der **richtigen Spalte** verlangen (nicht nur „falls vorhanden, passend").
3. Aktivierung erst, wenn RLS **real** greift (echte GoTrue-`authenticated`-Tokens, nicht service_role, nicht HS256-self-signed). Bis dahin darf app-seitiges Scoping **nicht** entfallen.

---

### 🟠 P1 — Harte Lücken in der Guard-Logik / DSGVO-Fehlklassifikation

#### P1-1 · Die Cross-Tenant-Prüfung bewacht die *falsche Spalte*

```js
// secure-read-path.js:126-134
const tenantFilterKeys = ["tenant_id", "user_id"];
for (const key of tenantFilterKeys) {
  const vals = params[key] || [];
  for (const v of vals) {
    const val = v.replace(/^eq\./, "");
    if (key === "tenant_id" && val && val !== T) return fail("cross-tenant-filter", val);
  }
}
```

`user_id` steht in `tenantFilterKeys`, aber der Vergleich läuft ausschließlich im Zweig `key === "tenant_id"` — der `user_id`-Zweig ist **toter Code**. Für `mandate_profiles` ist die Mandantenspalte aber **`user_id`** (RLS: `user_id = public.helmut_current_tenant()`, `…policies.sql:110-117`). Die Prüfung schützt also eine Spalte (`tenant_id`), die `mandate_profiles` gar nicht als Mandantendiskriminator nutzt, und lässt die real relevante Spalte (`user_id`) **ungeprüft**.

**Angriff.** `GET /rest/v1/mandate_profiles?select=partei,fraktion&user_id=eq.<fremd-tenant>` passiert `validateReadRequest` mit `{ok:true}` (Feld erlaubt, kein Write-Muster, Tenant vorhanden+validiert, `user_id`-Filter ungeprüft). Kombiniert mit P0-1 (service_role/inertes RLS) ist das gezieltes Auslesen eines **bestimmten** fremden Mandats.

**Auswirkung.** Gezielter Cross-Tenant-Read statt nur Massen-Leak. **Wahrscheinlichkeit:** mittel (setzt einen angreifer-/fehlkonstruierten Endpoint voraus; `validateReadRequest` ist als wiederverwendbares Gate exportiert).
**Behebung:** Vergleich für **jede** tenant-artige Spalte durchführen; für tenant-scoped Tabellen die Mandantenspalte pro Tabelle deklarieren und exakt-eigen erzwingen.

#### P1-2 · Feld-Allowlist gilt nur für `select`, nicht für Filter-Prädikate → Blind-/Oracle-Exfiltration von PII

`validateReadRequest` validiert ausschließlich die `select`-Felder. Beliebige weitere Query-Parameter — **Filter auf Nicht-Allowlist-Spalten**, `or=(…)`, `and=(…)`, `order=`, `like`, `in` — werden **nicht** eingeschränkt.

**Angriff.** `GET /rest/v1/mandate_profiles?select=partei&name=eq.<Klarname>` oder `…&email=like.*@bundestag.de`. Die verbotene Spalte wird **nicht selektiert**, aber als **Filterprädikat** genutzt: eine zurückgegebene Zeile bestätigt den geratenen Namen/die E-Mail (Boolean-Oracle), `like`/Zeilenzahl erlaubt Enumeration. So werden genau die per Sperrliste „geschützten" PII-Felder rekonstruiert — über einen Kanal, den die Allowlist nicht abdeckt.

**Auswirkung.** Umgehung der PII-Sperrliste durch Prädikat-Exfiltration; adressiert exakt die Auftragspunkte „über andere Felder / Kombinationen / OR-Filter / IN-Filter". **Wahrscheinlichkeit:** mittel (angreifer-beeinflusster Endpoint nötig).
**Behebung:** **Parameter-Allowlist** statt nur Select-Allowlist — nur `select`, der erzwungene Eigen-Tenant-Filter und eine kleine, tabellenspezifische Menge sicherer Steuerparameter (`order`/`limit` nur auf Allowlist-Feldern) zulassen; jeder Filter auf einer Nicht-Allowlist-Spalte → `fail`.

#### P1-3 · DSGVO: „kein PII" ist sachlich falsch — es werden politische Daten identifizierbarer Personen verarbeitet (Art. 9)

Der Sprint-7-Bericht klassifiziert `partei, fraktion, ausschuesse, regierungsrolle, …` als „nein (fachliche Klassifikation)". Das ist aus Auditsicht **unhaltbar**:

- **Identifizierbarkeit (Art. 4 Nr. 1 DSGVO).** Für sitzende Mandatsträger ist die **Kombination** aus `partei` + `fraktion` + konkreten `ausschuesse` + `bundesland` + `regierungsrolle` regelmäßig **eindeutig auf eine natürliche Person** rückführbar. `regierungsrolle` (z. B. ein Ministeramt) identifiziert i. d. R. **genau eine** Person direkt. Das Pseudonym `mandat-NNN` beseitigt die Identifizierbarkeit **nicht**, weil die Merkmalskombination selbst identifiziert (Pseudonymisierung ≠ Anonymisierung, ErwGr. 26).
- **Besondere Kategorie (Art. 9 DSGVO).** `partei`/`fraktion` = **politische Meinung/Zugehörigkeit** → besondere Kategorie personenbezogener Daten. Deren Verarbeitung in einer SaaS braucht eine **eigene Rechtsgrundlage** (Art. 9 Abs. 2) und ist bei einem Cross-Tenant-Leak (P0-1) besonders gravierend.

**Auswirkung.** Die Behauptung „kein PII, keine besondere Kategorie" trägt die Freigabeargumentation **nicht**. Ohne DPIA (Art. 35) und Art.-9-Rechtsgrundlage ist eine Aktivierung nicht DSGVO-konform. **Wahrscheinlichkeit:** Gewissheit (betrifft die Klassifikation selbst, nicht einen Angriff).
**Behebung:** Neubewertung als personenbezogen + Art.-9-Daten; DPIA; dokumentierte Rechtsgrundlage; `user_id` niemals ausgeben (siehe P2-2); Prüfung, ob die Merkmalskombination gröber (k-anonym) sein kann.

#### P1-4 · Die Inert-Garantie hängt an einem einzigen ungeschützten Seam; der Reader wird nicht read-only gewrappt

```js
// secure-read-path.js:173-181
function createSecureReadRepository(opts = {}) {
  const reader = typeof opts.approvedReader === "function" ? opts.approvedReader : notApprovedReader();
  ...
  async function guardedGet(endpoint, tenantId) {
    assertReadRequest({ method: "GET", endpoint, tenantId, validTenantIds });
    return reader(endpoint, tenantId);   // <-- Reader NICHT durch readOnlyRequest gewrappt
  }
```

Die gesamte „strukturelle" Inertheit reduziert sich darauf, dass heute niemand `approvedReader` setzt. Es gibt **keine** Prüfung, **was** injiziert wird:

- Jede beliebige Funktion wird sofort zum Live-Reader — es genügt ein einzeiliger Entwickler-Fehler.
- Der vorhandene Schutz `guard.readOnlyRequest` (erzwingt GET, verwirft Body, sodass ein `method`-Override die Leitung nicht erreicht) wird **nirgends** angewendet (verifiziert: keine Nutzung außerhalb des eigenen Tests). Der Reader wird **roh** aufgerufen.
- Der einzige heute funktionierende Transport (`supabaseRequest`/`tenantRequest`) ist **method-parametrisiert** und läuft auf **service_role** — genau die „liest oder schreibt je nach Zustand"-Form, die `production-read-guard` eigentlich verbieten soll. Wird er injiziert, ist die read-only- **und** die Isolationsgarantie zugleich weg.

Damit ist die Antwort auf Auftrag-Frage 5 („kann ein Entwickler versehentlich Reader/Service-Role/Fallback injizieren?") ein klares **Ja**.

**Behebung.** Reader zwingend durch `guard.readOnlyRequest(reader)` wrappen; `approvedReader` nur über eine explizite, geprüfte Capability zulassen (z. B. Signatur/Whitelist erlaubter Reader-Fabriken, expliziter Freigabe-Flag + Startup-Assertion, dass der Reader **nicht** service_role nutzt).

---

### 🟡 P2 — Ernste, aber bedingte Schwächen

#### P2-1 · Tenant-Validierung ist opt-in
```js
// secure-read-path.js:120
if (Array.isArray(validTenantIds) && !validTenantIds.map(String).includes(T)) return fail("tenant-nicht-validiert", T);
```
Die Validierung greift **nur, wenn** `validTenantIds` ein Array ist. `createSecureReadRepository` defaultet es auf `null` (`:175`). Wird das Repo ohne `validTenantIds` erzeugt, akzeptiert das Gate **jede** nicht-leere Mandanten-ID (inkl. `tenant-hacker`). Die „validierter Tenant"-Garantie ist damit optional statt erzwungen.
**Behebung:** Fehlende/leere `validTenantIds` → **hart ablehnen** (fail-closed), nicht durchwinken.

#### P2-2 · `user_id` (Direkt-Identifikator) fließt roh durch den Lesepfad
`user_id` steht in der Feld-Allowlist und wird von `buildMandateEndpoint` selektiert (`:27`, `:159`). Das dokumentierte „nur zur Pseudonymisierung, danach verworfen" ist **nirgends erzwungen** — der Reader erhält den rohen `user_id` (FK zu `auth.users`). Er kann in Reader-Output, Logs, Exceptions/Stacktraces und Telemetrie landen → Re-Identifikation. **Behebung:** `user_id` nicht über die Leseschicht ausgeben; Pseudonymisierung serverseitig **innerhalb** einer Vertrauensgrenze bilden und den Rohwert dort kappen; niemals in Log/Fehlertext.

#### P2-3 · HTTP-Parameter-Pollution auf `select`
`selectFields` prüft nur `params.select[0]` (`:78-81`). Ein zweiter `select=`-Parameter würde **nicht validiert**, aber im Roh-Endpoint an PostgREST mitgesendet → mögliche Divergenz zwischen dem, was validiert, und dem, was ausgeführt wird. **Behebung:** Mehrfaches `select` → `fail`; generell doppelte sicherheitsrelevante Parameter ablehnen.

#### P2-4 · Reaktivierungs-Risiko des JWT-Mechanismus (nur falls je wieder aktiviert)
`signTenantJWT` nutzt **symmetrisches HS256 mit geteiltem `SUPABASE_JWT_SECRET`** (`storage.js:2447-2466`). Wer das Secret kennt, kann Tokens mit **beliebigem `user_id`-Claim** minten → Mandanten-Impersonation. `verifyTenantJWT` überspringt die exp-Prüfung, wenn `exp` kein `number` ist (`:2498`), und es gibt kein `jti`/Nonce → Replay im TTL-Fenster. Heute inert; **vor** einer Reaktivierung mit echtem Auth zu adressieren (asymmetrische GoTrue-Tokens, kein self-signing).

---

### 🔵 P3 — Härtung / Defense-in-Depth

- **P3-1 · Fehlertext-Leak.** `assertReadRequest` gibt angefragte Werte (Feldname, Tenant, Tabelle) im Meldungstext zurück (`:141`). Bei Logging/HTTP-Weitergabe = Informationsabfluss (Auftrag: „über Fehlertexte"). → Reason-Codes nach außen, Details nur intern.
- **P3-2 · Parser wirft statt fail-closed.** `?__proto__=…` löst in `parseEndpoint` einen `TypeError` aus (`params[k].push` auf `Object.prototype`), kaputtes `%`-Encoding einen `URIError` aus `decodeURIComponent` (`:60-76`) — beide propagieren ungefangen aus `validateReadRequest`. Sicherheitstechnisch fail-closed (kein Read), aber unsauber und für generische Upstream-Handler unvorhersehbar. → `Object.create(null)` für `params`, `try/catch` um `decodeURIComponent` mit `return fail(...)`.
- **P3-3 · Exports nicht eingefroren.** Die Allowlist-Arrays sind `Object.freeze`d, das `module.exports`-Objekt aber nicht — Fremdcode im selben Prozess könnte `S.validateReadRequest` per Monkey-Patch ersetzen (Auftrag: „Monkey Patching"). → `Object.freeze(module.exports)`.
- **P3-4 · Write-Regex auf Roh-Endpoint.** `WRITE_ENDPOINT_RE` prüft den **URL-encodierten** String (`production-read-guard.js:22,29`) und ist per Prozent-Encoding umgehbar. Heute nicht ausnutzbar (Tabellen-Allowlist + GET-Zwang fangen es), aber die zweite Verteidigungslinie ist löchrig. → vor der Prüfung dekodieren bzw. auf dekodierte Tokens prüfen.
- **P3-5 · Telemetrie ist plattformweit.** `source_crawl_telemetry` hat keine Mandantenspalte; `buildTelemetryEndpoint` scoped nichts (bewusst, technische Daten). Klar dokumentieren, dass jeder Mandant die **globale** Crawl-Telemetrie (welche Quellen, Fehlercodes, Modi) sähe; prüfen, ob `source_id`/`source_category` Rückschlüsse auf mandantenspezifische Quellenauswahl erlauben.

---

## 2. Systematische Prüfung gegen den Auftragskatalog

| # | Frage | Ergebnis |
|---|---|---|
| 1 | **Kann ein Write stattfinden?** | Im Modul selbst **nein** (kein Write-Endpoint, GET-Zwang, kein RPC/on_conflict, Proxy sperrt Nicht-Lese-Methoden, Body verboten). **Aber:** Der injizierte Reader wird **nicht** read-only gewrappt (P1-4); ein method-parametrisierter service_role-Reader wäre schreibfähig. Read-only ist **nicht** über den Reader-Seam erzwungen. |
| 2 | **Kann Tenant-Isolation umgangen werden?** | **Ja** — P0-1 (kein Filter, inertes RLS), P1-1 (falsche Spalte bewacht), P1-2 (Filter-Prädikate ungeprüft), P2-1 (Validierung opt-in). Wildcard/Null/Undefined/leere Strings werden bei `tenantId` durch `String()+trim()+non-empty` abgefangen; Arrays/Objekte ergeben seltsame, aber nicht durchbrechende Werte. Race/Timing/Cache: Modul ist zustandslos → **kein** Shared-State-Angriff hier. JWT/Replay: nur bei Reaktivierung (P2-4). |
| 3 | **Kann PII gelesen werden?** | Direkt via Select: durch Sperrliste blockiert. **Indirekt: ja** — via Filter-Prädikate (P1-2), via rohem `user_id` (P2-2), via Fehlertexte (P3-1), via Merkmalskombination/Re-Identifikation (P1-3). |
| 4 | **Sind die Allowlists vollständig?** | Tabellen/Felder/Endpoints: für **Select** streng (Exakt-Match blockt Embedded-Resources/Casts/Aliase). **Lücke:** Filter-Parameter sind **nicht** allowlisted (P1-2); die geforderte Bedingung „Endpoint trägt Tenant-Filter" fehlt (P0-1). Der Reader-Seam ist eine **offene Hintertür** (P1-4). |
| 5 | **Ist inert absolut?** | **Nein.** Ein Entwickler kann trivial einen Reader — auch service_role — injizieren, den Fallback auslösen, ohne Capability-Prüfung (P1-4). Environment (`tenantJwtModeEnabled`) ist heute hart aus, aber der service_role-Default ist genau der gefährliche Fallback. |
| 6 | **DSGVO — Rekonstruktion möglich?** | **Ja**, direkt/indirekt/kombiniert (P1-3, P1-2, P2-2). Klassifikation „kein PII" ist falsch. |
| 7 | **Read-only technisch erzwungen?** | **Teilweise.** Innerhalb `validateReadRequest`/`readOnlyRepository`: ja. Über den **tatsächlichen Reader-Aufruf**: **nein** (P1-4, `readOnlyRequest` ungenutzt). „Read-only" ist dokumentiert und für das Gate erzwungen, für den Datenpfad **nicht durchgängig**. |

---

## 3. Was solide ist (fairerweise)

- Kein Storage-/Supabase-/Netz-Import, keine Credentials, kein `process.env`, kein `fetch` im Modul (Test 24/25). Heute **faktisch inert**.
- Select-Allowlist per **Exakt-String-Match** blockt PostgREST-Embedded-Resources, Casts (`::`), JSON-Pfade (`->>`) und Alias-Syntax zuverlässig.
- POST/PATCH/DELETE, RPC, `on_conflict`, `SELECT *`, Body-Smuggling werden im Gate benannt und blockiert.
- `readOnlyRepository`-Proxy (null-Proto-Target, `set` wirft, Nicht-Allowlist-Methoden werfen) ist sauber und ohne offensichtlichen Bypass.
- Allowlist-Objekte tief eingefroren; `"use strict"` überall.
- `tenant-context.js` verweigert korrekt jeden Default-/Fallback-Mandanten und unterscheidet „nicht ladbar" von „leer".

Das **Design-Ziel** ist richtig gedacht. Die **Garantien** halten der feindseligen Prüfung nur nicht stand.

---

## 4. Abschluss — die sechs Freigabefragen

**1. Freigabe für Enterprise-SaaS?**
**Nein — nicht im Ist-Zustand.** P0-1 (Cross-Tenant bei Aktivierung) und die P1-Guard-Lücken sind Blocker. Nach Behebung von P0/P1, echtem RLS-Enforcement und einem Pen-Test gegen eine echte Instanz: **bedingt möglich**.

**2. Freigabe für Behörden?**
**Nein.** Höhere Schutzanforderungen, potenziell besondere Kategorien; ein latenter Cross-Tenant-Bruch ist mit behördlichen Anforderungen unvereinbar, solange (1) nicht erfüllt ist.

**3. Freigabe für Bundestagsabgeordnete?**
**Nein — mit Abstand am klarsten Nein.** MdB-Profile enthalten Art.-9-Daten (politische Zugehörigkeit) über exponierte, besonders schutzbedürftige, teils gefährdete Amtsträger. Ein Cross-Tenant-Leak eines einzelnen MdB-Profils (P0-1/P1-1) wäre ein gravierender Vorfall. Freigabe erst nach vollständiger Behebung **und** DPIA **und** unabhängigem Pen-Test.

**4. Zwingende Bedingungen vor Aktivierung:**
1. **P0-1 behoben:** app-seitiger Eigen-Mandanten-Filter (`user_id=eq.<tenant>`) in jedem tenant-scoped Endpoint erzwungen; `validateReadRequest` verlangt dessen **Anwesenheit** auf der **richtigen Spalte**.
2. **P1-1/P1-2 behoben:** Cross-Tenant-Prüfung auf allen tenant-artigen Spalten; **Parameter-Allowlist** (Filter/Order auf Nicht-Allowlist-Spalten verboten).
3. **Reales RLS-Enforcement:** Requests laufen als `authenticated` mit echten (asymmetrisch signierten) GoTrue-Tokens — **nicht** service_role, **nicht** HS256-self-signed; RLS-Migration angewandt und live verifiziert (`pg_policies`).
4. **Reader-Seam geschlossen (P1-4):** Reader zwingend `readOnlyRequest`-gewrappt; `approvedReader` nur über geprüfte Capability + Startup-Assertion „kein service_role".
5. **P2-1 behoben:** fehlende `validTenantIds` → fail-closed.
6. **DSGVO (P1-3/P2-2):** Neuklassifikation als personenbezogen/Art. 9, dokumentierte Rechtsgrundlage, DPIA; `user_id` nie ausgeben; Prüfung k-Anonymität der Merkmalskombination.
7. **Härtung P3-1…P3-4** umgesetzt.
8. **Unabhängiger Pen-Test** gegen eine echte, isolierte Instanz + **Vier-Augen-Freigabe** durch Betreiber.

**5. Versteckte Risiken?**
- **service_role als Default-Fallback in `tenantRequest`** ist die eigentliche Gefahr hinter jeder „Isolation" — plattformweit, nicht nur hier.
- Laut RLS-Draft haben **`anon` UND `authenticated` heute volle CRUD-Grants auf alle Tabellen**; RLS mit 0 Policies ist die einzige Barriere — jede Aktivierung ohne angewandte Policies operiert ohne DB-seitige Isolation.
- **`helmut_store`-Zeile `main-auth`** hält laut Kommentar **alle Accounts/Logins in einer Zeile** — ein separater, hochsensibler Angriffspunkt außerhalb dieses Moduls, der die Gesamt-Blast-Radius-Bewertung beeinflusst.
- **Monkey-Patch/Reader-Seam** (P1-4/P3-3): die Garantien leben im selben Prozess wie beliebiger anderer Code.
- **Telemetrie global** (P3-5).

**6. Ist eine Aktivierung nach diesem Review verantwortbar?**
**Jetzt: nein.** Der geforderte Beweis „kann sicher aktiviert werden" ist **nicht** erbracht — im Gegenteil, eine Aktivierung im Ist-Zustand würde mit hoher Wahrscheinlichkeit sofort Cross-Tenant-PII abfließen lassen. **Nach vollständiger Erfüllung der Bedingungen unter (4), erneutem adversarialem Review und einem bestandenen Pen-Test gegen eine echte Instanz: verantwortbar.** Bis dahin gilt die richtige Entscheidung von Sprint 7 unverändert weiter: **inert lassen.**

---

## 5. Hinweis zum Modus dieses Reviews

Dieses Dokument ist die **einzige** Änderung dieses Reviews. Es wurde **keine** Zeile Produktionscode verändert, **nichts** aktiviert, **keine** Migration angewandt, **kein** Credential/Secret berührt, **kein** Produktionszugriff ausgeführt, **kein** Merge/PR erzeugt. Die konkreten Korrekturvorschläge sind als anwendbare Snippets pro Finding beschrieben; ihre Umsetzung ist bewusst dem Entwicklungsteam als eigener, freizugebender Schritt überlassen — der Read Path bleibt **inert**.
