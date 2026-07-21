# Sprint 9 — Production Read Security Hardening (Secure Read Path)

> **Status:** Sicherheitsfundament **gebaut**, **INERT**, **nicht aktiviert**, **nicht
> deployt**, **nicht migriert**. Kein Merge nach `main`, kein Pull Request. Kein
> Produktivpfad ruft den Secure Read Path auf (Beleg: `grep -rn secure-read-path lib server.js`
> liefert nur das Modul selbst; kein `require` aus Produktionscode). Kein sichtbares
> Verhalten geändert.
>
> **Code:** `lib/helmut/secure-read-path.js`
> **Beweise:** `scripts/secure-read-path-test.js` (63 Assertions),
> `scripts/secure-read-path-adversarial-test.js` (28 abgewehrte Angriffe).

## 0 · Ausgangslage & Ziel

Der adversariale Review hatte bestätigt: Die Quellenplattform ist architektonisch
korrekt, aber der geplante Lesepfad wäre heute **nicht verantwortbar** aktivierbar
(mind. ein P0, mehrere P1). Grund: Der Bestand liest über `service_role`
(RLS-Bypass) + einen **app-seitig angehängten** `user_id`-Filter
(`docs/quellenarchitektur/05-sicherheitsmodell-rls.md`). Das Restrisiko ist genau
**ein vergessener Filter** → latentes IDOR, das die DB (RLS inert) nicht abfängt.

Ziel dieses Sprints: die technische Sicherheitsbasis schaffen, damit ein späterer
Read-Zugriff diese Fehlerklasse **konstruktiv** nicht mehr zulässt — ohne
Aktivierung, ohne Migration, ohne Produktionsberührung.

## 1 · Kernidee — warum ein eigener Pfad statt `supabaseRequest`

`storage.supabaseRequest` ist per Definition `service_role` und nimmt einen
**Roh-Endpoint-String** entgegen. Ein Entwickler kann dort jederzeit einen
mandantenbezogenen Read ohne Tenant-Filter bauen. Der Secure Read Path beseitigt
beide Eigenschaften:

- **Kein Roh-Endpoint-Eingang.** Der Aufrufer beschreibt nur ein *strukturiertes*
  `spec` (`table`/`select`/`filters`/`order`/`limit`/`offset`). Den Endpoint baut
  ausschließlich `buildSecureQuery`.
- **Kein `service_role`.** Der Pfad liest nur mit einem ausdrücklichen, geprüften
  read-only-Grant. Fehlt er → fail-closed.

## 2 · Aufgabe 1 (P0) — Tenant-Isolation technisch unvermeidbar

| Mechanismus | Wirkung |
|---|---|
| Tenant kommt **nur** aus der versiegelten Capability (`capability.tenantId`) | Genau eine Tenant-Wahrheit |
| `buildSecureQuery` hängt für jede `scope:'tenant'`-Tabelle den Filter `user_id=eq.<tenant>` **selbst** an | Der Filter ist nicht „vergessbar“ — es gibt keinen Ausgang aus der Funktion ohne ihn (auch bei leerem `filters`) |
| Der Aufrufer darf die Tenant-Spalte **nicht** selbst filtern (auch nicht „korrekt“) → `TenantTruthError` | Keine zweite/divergierende Tenant-Angabe |
| Nachweis-Guard nach dem Bau: Endpoint muss **genau einen** Tenant-Filter enthalten, sonst throw | Defense-in-Depth |
| `tenantId` wird beim Minting gehärtet (keine Struktur-/Steuerzeichen) | Kein Aufbrechen des Filters via präparierter ID |

Beweis: `secure-read-path-test.js` „Plan(<tabelle>) enthaelt GENAU 1 Tenant-Filter“
für **alle** tenant-Tabellen; Adversarial A3a–A3e.

## 3 · Aufgabe 2 — Kein `service_role`-Fallback, fail-closed

`resolveReadGrant()` liefert nur dann `{ok:true}`, wenn **beide** gesetzt sind:
`HELMUT_SECURE_READ_ROLE` (Allowlist read-only Rollen, `service_role`/`postgres`/
`supabase_admin` hart abgewiesen) **und** `HELMUT_SECURE_READ_GRANT` (Credential,
das **timing-safe** gegen alle bekannten `service_role`-Schlüssel geprüft wird —
Tarnung als Read-Grant scheitert). Fehlt/irrt etwas → `ReadCapabilityError`
(fail-closed). **Produktion heute:** keine der Variablen gesetzt → Pfad inert.
Der Transport konstruiert **niemals** einen `service_role`-Header.

Beweis: A2 (kein Grant, falsche Rolle, `service_role`-Rolle, getarntes Credential);
A6b; A9a/A9b (fail-closed unter Fehlbedingungen).

## 4 · Aufgabe 3 — Reader Capability Hardening (`approvedReader`)

- `approvedReader` ist **modul-privat** (nicht in `module.exports`). Kein Export
  trägt „approvedReader/transport/rawRequest/privileged“ im Namen.
- Eine Capability trägt ein **privates Brand-Symbol** (`CAPABILITY_BRAND`, nicht
  exportiert). Ein von außen gebautes Plain-Object oder ein Proxy besteht
  `isMintedCapability` nicht.
- Der einzige Weg an einen Reader ist `openSecureReader(options)` — es nimmt
  **keine** Capability und **keinen** Transport entgegen (keine alternative
  Injektion). Capability + Grant werden intern frisch gemintet/geprüft.
- Der Reader ist `Object.freeze`d (kein Monkey-Patching, kein Anheften von
  Methoden), der Transport steckt in einer Closure (kein Repository-Austausch).

Beweis: A1a–A1d, A2a–A2c, A5a–A5c, A6a, A7a/A7b.

## 5 · Aufgabe 4 — Parameter Hardening (allowlist-or-block)

Alles wird aus dem strukturierten `spec` gebaut; **jeder** nicht-allowlistete
Aspekt → `ParameterHardeningError` (fail-closed):

| Aspekt | Regel |
|---|---|
| `spec`-Schlüssel | Allowlist `table/select/filters/order/limit/offset`; **jeder** andere Key (z. B. `or`, `header`, `method`, `body`, `endpoint`) → blockiert (Query-Pollution/Roh-Param) |
| `table` | muss im Katalog stehen |
| `select` | Positive Spalten-Allowlist je Tabelle; `*` verboten; keine Duplikate; DSGVO-Gating (s. u.); Default-Select nur öffentlich/technisch |
| `filters` | max. 12; nur `{column,op,value}`; Operator-Allowlist `eq/neq/gt/gte/lt/lte/like/ilike/is/in`; **`or` existiert nicht** → blockiert; Tenant-Spalte verboten |
| Werte | Skalar, ≤256 Zeichen, Zeichensatz-Allowlist (Steuerzeichen/Komma/Klammer blockiert); eigenes `encodeURIComponent` → kein Encoding-Bypass, keine Injection |
| `in` | Array, 1..100 Werte, jeder Wert geprüft |
| `order` | Spalte allowlistet, Richtung nur `asc`/`desc` |
| `limit`/`offset` | Ganzzahl, gedeckelt (limit 1..200, offset 0..100000); Limit **immer** gesetzt (Default 200) |
| Mehrfachparameter | konstruktiv unmöglich (Bau aus Struktur, keine Roh-Strings) |
| Header | Aufrufer kann keine Header beisteuern; Transport setzt feste Header |

Beweis: die 20+ „-> blockiert“-Assertions in `secure-read-path-test.js` + A4b/A4c.

## 6 · Aufgabe 6 — DSGVO-Klassifikation (jedes Feld begründet)

**Einstufungen:** `oeffentlich` (öffentliche Sachinfo, kein Personenbezug),
`technisch` (IDs/Zeitstempel/Status/Zähler), `personenbezogen` (Art. 4 DSGVO),
`art9` (besondere Kategorie: politische Meinung/Inhalte).

**Technisch durchgesetzt (nicht nur dokumentiert):** `personenbezogen` nur mit
`allowPersonal`; `art9` nur mit `allowSensitive` **und** `scope:'tenant'`;
Default-Select liefert **nur** `oeffentlich`/`technisch` (Datensparsamkeit ab
Werk); globale Tabellen dürfen **keine** `art9`-Spalte enthalten (Katalog-Invariante
beim Laden geprüft).

### Globale Referenztabellen (mandantenlos)

| Tabelle.Feld | Einstufung | Begründung |
|---|---|---|
| geographies.{id,parent_id,geography_id,level,created_at,updated_at} | technisch | Struktur-/Referenz-Metadaten |
| geographies.{name,ags} | öffentlich | Amtliche Gebietsnamen/Gemeindeschlüssel — öffentlich |
| electoral_districts.{id,kind,number,geography_id,…} | technisch | Wahlkreis-Struktur |
| electoral_districts.name | öffentlich | Amtlicher Wahlkreisname |
| political_entities.{id,entity_type,canonical_key,level,geography_id,…} | technisch | Typisierung/Referenz |
| **political_entities.name** | **personenbezogen** | `entity_type` kann `person` sein → Name einer natürlichen Person. Konservativ als personenbezogen (nicht global im Default lesbar) |
| **political_entities.aliases** | **personenbezogen** | Alias-Namen können Personen betreffen |
| publishers.{id,canonical_domain,publisher_type,evidence_role,trust,lifecycle_status,entity_id,…} | öffentlich/technisch | Herausgeber-Metadaten, öffentlich |
| **publishers.name** | **personenbezogen** | Ein Herausgeber kann eine natürliche Person sein (Abgeordneten-Website etc.) → konservativ personenbezogen |
| retrieval_paths.* | technisch | Rein technische Abrufkonfiguration (Methode/URL/Status/Zähler) — `url`/`query`/`name` als öffentlich (öffentliche Feed-Adressen) |
| source_packages.* | öffentlich/technisch | Produktdefinition der Quellenpakete |

> **Korrektur ggü. früherer Annahme:** Die Migration
> `20260713_source_architecture.sql` stufte *alle* Quelltabellen pauschal als „keine
> personenbezogenen Daten“ ein. Das ist für Struktur-/Abrufmetadaten korrekt, für
> **Personennamen** in `political_entities`/`publishers` aber zu grob. Der Secure Read
> Path korrigiert das: solche Namen sind **personenbezogen** und global nur mit
> ausdrücklicher `allowPersonal`-Freigabe lesbar (Default: nicht).

### Mandantengebundene Tabellen (`scope:'tenant'`, `user_id`) — Art. 9-relevant

| Tabelle.Feld | Einstufung | Begründung |
|---|---|---|
| briefings/decisions/matching_results/office_outputs/profile_embeddings.{id,user_id,status,*_at,score,dim,profile_hash,…} | technisch | Identifikatoren/Metadaten des Mandats |
| **briefings.{headline,summary}** | **Art. 9** | Politische Lage-/Bewertungstexte zum Mandat → besondere Kategorie (politische Meinung) |
| **decisions.rationale** | **Art. 9** | Politische Bewertung/Begründung |
| **office_outputs.content** | **Art. 9** | Politische Kommunikationsinhalte |

> Alle mandantengebundenen Inhaltsfelder sind **Art. 9** und nur mandantengebunden
> (`scope:'tenant'`) **und** mit `allowSensitive` lesbar — nie global. Der
> Default-Select liefert diese Felder **nicht**.

### `llm_usage` — bewusst NICHT lesbar (Aufgabe 5)

`llm_usage` trägt historisch **zwei** Tenant-Spalten (`user_id` **und**
`politician_id`, RLS-Migration `20260712`). Das wäre eine zweite Tenant-Wahrheit
→ der Secure Read Path registriert die Tabelle **nicht** (`TENANT_AMBIGUOUS_TABLES`).
Wer sie später lesbar machen will, muss zuerst auf **genau eine** Tenant-Spalte
kanonisieren (Migration, freigabepflichtig).

## 7 · Aufgabe 5 — Genau eine verbindliche Tenant-Wahrheit

- Die **einzige** Quelle ist `capability.tenantId` (versiegelt, gehärtet).
- Katalog-Invariante (beim Laden geprüft): jede Tabelle hat höchstens **eine**
  Tenant-Spalte; `scope:'tenant'` genau eine; globale Tabellen keine.
- Aufrufer-Filter auf die Tenant-Spalte → hart abgewiesen (keine Divergenz).
- Toter/mehrdeutiger Pfad entfernt: `llm_usage` (Doppelspalte) ist nicht lesbar.
- Kein `politician_id`-Nebenpfad: der Secure Read Path kennt nur `user_id` als
  Tenant-Spalte.

## 8 · Aufgabe 7 — Read-only technisch erzwungen

- Transport ist eine Closure, sendet **hart** `method:'GET'`; es gibt keinen
  Parameter, um die Methode zu ändern (auch ein manipuliertes `fetch` bekommt nie
  ≠GET).
- Kein `spec.method`/`spec.body`/`spec.endpoint` (unbekannte Keys → blockiert).
- `/rpc/`-Endpoints verboten (im Builder **und** im Transport).
- Reader `Object.freeze`d (kein Monkey-Patch), Transport nicht exportiert (kein
  Repository-Austausch), Grant nur in Closure (keine DI).
- **Konstruktiv unmöglich:** POST/PATCH/DELETE/PUT/RPC/UPSERT.

Beweis: A4a–A4e, A5a–A5c, A6a, plus „Transport sendet ausschliesslich GET“.

## 9 · Aufgabe 8 — JWT/RLS-Aktivierungsvoraussetzungen (nur vorbereiten)

Der Secure Read Path ist **inert**, bis **alle** folgenden Bedingungen erfüllt sind
(jede ist ein eigener, freigabepflichtiger Schritt — **keine Umsetzung auf Verdacht**):

1. **Echte read-only DB-Rolle** in Supabase/Postgres anlegen (z. B. `secure_reader`)
   mit ausschließlich `SELECT`-Grants auf die freigegebenen Tabellen, **ohne**
   `BYPASSRLS`. Diese Rolle ist **nicht** `service_role`.
2. **Credential** dieser Rolle (kurzlebig/rotierbar) bereitstellen und als
   `HELMUT_SECURE_READ_GRANT` + `HELMUT_SECURE_READ_ROLE` konfigurieren
   (Secret-Handling wie `SUPABASE_SERVICE_ROLE_KEY`).
3. **RLS-Policies scharf** für die tenant-Tabellen: `tenant_isolation` (bereits
   entworfen in `20260712_tenant_rls_policies.sql`) **anwenden** und die Rolle des
   Read-Grants erfassen (heute: `to authenticated`; für eine dedizierte
   `secure_reader`-Rolle Policy-Rolle entsprechend ergänzen).
4. **Echtes Supabase-Auth (GoTrue) bzw. serverseitig gesetzter Tenant-Claim**, damit
   `helmut_current_tenant()` (`auth.jwt()->>'user_id'`) den Mandanten liefert — der
   selbst-signierte HS256-Pfad ist stillgelegt (asymmetrische Signing-Keys,
   `05-sicherheitsmodell-rls.md`). Alternativ: der Read-Grant setzt den Tenant über
   einen serverseitig kontrollierten Kanal (dann bleibt der App-seitige Filter die
   erste Linie, RLS die zweite).
5. **`llm_usage` kanonisieren** (eine Tenant-Spalte), falls es lesbar werden soll.
6. **Unabhängiger Penetrationstest** gegen die aktivierte Rolle (echte DB), inkl.
   Nachweis, dass die Rolle **nicht** schreiben und **nicht** RLS umgehen kann.

Erst wenn 1–6 erfüllt und unabhängig verifiziert sind, darf über einen **Dark
Launch** gesprochen werden.

## 10 · Aufgabe 9 — Adversarialer Retest (Ergebnis)

`scripts/secure-read-path-adversarial-test.js`: **28/28 Angriffe abgewehrt**
(Reflection, gefälschte/Proxy-Capability, DI, Encoding-/Query-Pollution-Bypass des
Tenant-Filters, präparierte Tenant-ID, Schreibversuche POST/PATCH/DELETE/RPC/UPSERT,
Monkey-Patching, Repository-/Transport-Austausch, getarnter `service_role`-Grant,
fail-closed unter Fehlbedingungen). **P0 = 0, P1 = 0** für den Secure Read Path.

---

## Abschlussbericht — die neun Fragen

1. **Welche P0 wurden behoben?**
   Der P0 „mandantenbezogener Read ohne erzwungene Tenant-Isolation (App-seitig
   vergessbarer Filter, RLS inert → latentes IDOR)“. Im Secure Read Path ist der
   Tenant-Filter **technisch unvermeidbar** (Builder erzwingt ihn, Aufrufer kann ihn
   weder weglassen noch überschreiben; Nachweis-Guard + Tests).

2. **Welche P1 wurden behoben?**
   (a) impliziter `service_role`-Fallback → beseitigt (kein `service_role` im Pfad,
   fail-closed). (b) `approvedReader` direkt nutzbar → jetzt privat + Capability-Gate.
   (c) Parameter-Manipulation (select/filter/order/limit/offset/or/in/Header/
   Mehrfachparameter/Encoding/Query-Pollution) → allowlisted-or-block. (d) mehrdeutige
   Tenant-Wahrheit (`llm_usage` Doppelspalte, `politician_id`-Nebenpfad) → eine
   verbindliche Wahrheit, mehrdeutige Tabelle nicht lesbar. (e) fehlende Read-only-
   Garantie → technisch erzwungen. (f) DSGVO-Fehleinstufung von Personennamen →
   korrigiert + technisch gegated.

3. **Welche Risiken bleiben?**
   Der Secure Read Path selbst hat für seinen Umfang **keine offenen P0/P1**. Rest
   **außerhalb** des Moduls (unverändert, freigabepflichtig): der **Bestandslesepfad**
   nutzt weiter `service_role` + App-Filter (dieser Sprint ändert daran bewusst
   nichts). Ferner: eine echte read-only DB-Rolle existiert noch **nicht** (der Pfad
   ist deshalb inert); RLS ist weiter inert; ein unabhängiger DB-Pentest steht aus.

4. **Gibt es noch implizite Trust-Annahmen?**
   Innerhalb des Moduls: keine impliziten. Explizit dokumentiert: (i) der spätere
   Read-Grant muss eine **echte** read-only-Rolle **ohne** `BYPASSRLS` sein — das kann
   der App-Code nicht selbst garantieren, nur prüfen, dass er **nicht** `service_role`
   ist; (ii) `global.fetch` als HTTP-Transport (Standard-Node/Vercel-Runtime).

5. **Ist `service_role` vollständig aus dem zukünftigen Read-Pfad entfernt?**
   **Ja.** Der Secure Read Path konstruiert nie einen `service_role`-Header, weist ein
   `service_role`-Credential/-Rolle aktiv (timing-safe) ab und fällt bei fehlendem
   read-only-Grant fail-closed aus — kein Fallback.

6. **Kann Tenant-Isolation jetzt auch ohne RLS nicht versehentlich umgangen werden?**
   **Ja** — für den Secure Read Path. Der Filter wird konstruktiv erzwungen (kein
   Roh-Endpoint, kein weglassbarer/überschreibbarer Filter, versiegelte Capability als
   einzige Wahrheit). Ein Entwickler kann ihn nicht versehentlich umgehen. (Der
   **Bestandspfad** bleibt davon unberührt und weiterhin auf den App-Guard angewiesen.)

7. **Welche Bedingungen fehlen noch vor einer echten Aktivierung?**
   Abschnitt 9, Punkte 1–6: read-only DB-Rolle + Credential, scharfe RLS-Policies inkl.
   Rolle, serverseitiger Tenant-Claim/echtes Auth, `llm_usage`-Kanonisierung,
   unabhängiger Pentest. Alle freigabepflichtig.

8. **Würdest du den Secure Read Path jetzt für einen Dark Launch empfehlen?**
   **Nein.** Das Fundament ist fertig und bewiesen, aber die Aktivierungs­
   voraussetzungen (echte read-only-Rolle, scharfe RLS, unabhängiger Pentest) sind
   nicht erfüllt. Bis dahin bleibt der Pfad korrekt **inert**.

9. **Welche unabhängigen Prüfungen sollten vor Produktion zusätzlich erfolgen?**
   (i) DB-seitiger Pentest der `secure_reader`-Rolle (kein Write, kein RLS-Bypass, kein
   Zugriff über die freigegebenen Tabellen hinaus). (ii) RLS-Policy-Review durch eine
   zweite Person gegen echte JWT-Claims. (iii) DSGVO/DPO-Review der Feldfreigaben
   (personenbezogen/Art. 9). (iv) Secret-Handling-/Rotation-Audit des Read-Grants.
   (v) unabhängige Code-Review des Gates auf Umgehbarkeit.

## Abnahmekriterien

- [x] Kein P0 mehr (Secure Read Path) — Tenant-Isolation erzwungen.
- [x] Kein P1 mehr (Secure Read Path) — s. o.
- [x] Tenant-Isolation mehrfach technisch erzwungen (Builder + Guard + gehärtete ID + Scope-Trennung).
- [x] `service_role` kein Fallback mehr (aktiv abgewiesen, fail-closed).
- [x] Read-only technisch garantiert (GET-only, frozen, keine Schreibmethoden).
- [x] Parameter-Manipulation ausgeschlossen (allowlist-or-block).
- [x] Capability-Gating implementiert (privater `approvedReader`, gebrandete Capability).
- [x] Alle Tests grün (Offline-Suite inkl. beider neuer Suiten).
- [x] Keine Produktion aktiviert (Pfad inert, keine Env gesetzt, kein Caller).
- [x] Kein Merge, kein PR — Arbeit auf `claude/session-fprapc`.
