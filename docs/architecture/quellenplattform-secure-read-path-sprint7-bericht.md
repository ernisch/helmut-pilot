# Sprint 7 — Sicheren Read-only Produktionspfad entwerfen · Abschlussbericht

**Branch:** `architecture/quellenplattform-secure-read-path`
**Basis:** `architecture/quellenplattform-production-validation` @ `c1d42c6`
**Stand:** 2026-07-21

> **Harte Garantie:** Am Ende dieses Sprints gibt es **weiterhin keinerlei Möglichkeit**, Produktionsdaten
> zu lesen. Es wurde **kein** Produktionszugriff ausgeführt, **kein** Secret/Credential verwendet, **keine**
> Verbindung gebaut. Dieser Sprint liefert ausschließlich die **Sicherheits-Leitplanken** (Allowlists,
> automatische Prüfung, read-only Repository-Vertrag) für einen später freizugebenden Zugriff. Das
> Repository ist **inert**: ohne ausdrücklich injizierte, freigegebene Lese-Funktion wirft jeder Read.

---

## 0. Preflight (bestanden)

1. Branch stammt von Sprint 6 (`--is-ancestor` = true). 2. Sprint-6-Commit `c1d42c6` enthalten.
3. **166** Suiten vorhanden. 4. **166/166** grün. 5. Working Tree sauber. ✓

---

## 1. Aufgabe 1 — Datenbedarf (maximale Minimierung)

| Benötigte Daten | Tabelle/View | Benötigte Felder | Warum notwendig | Personenbezogen? | Wirklich erforderlich? |
|---|---|---|---|---|---|
| Mandats-Zuweisungsprofil | `mandate_profiles` | `partei, fraktion, ausschuesse, stellvertretende_ausschuesse, regierungsrolle, regionale_interessen, regionale_themen, relevante_ministerien, themen_prioritaeten, bundesland, mandatsebene` | Speist die dynamische Zuweisung (Sprint 2) → Coverage/Google-News-Vergleich | nein (fachliche Klassifikation) | ja |
| Mandats-Status | `mandate_profiles` | `aktiv, geloescht_at, onboarding_status` | Profilvollständigkeit / Aktivierungsberechtigung | nein | ja |
| Mandats-Pseudonymisierung | `mandate_profiles` | `user_id` | **nur** zur Bildung von `mandat-NNN`, danach **verworfen** | ja (Identifikator) → **entfernt** | ja, aber nur transient |
| Quellen-Telemetrie (Gesundheit) | `source_crawl_telemetry` | `source_id, status, started_at, finished_at, duration_ms, error_code, source_mode, political_level, source_category` | Speist das **eine** Gesundheitsmodell + Qualitätsurteil | nein (rein technisch) | ja |
| **Ausdrücklich NICHT gelesen** | — | `name, namensvarianten, gegner, email, telefon, buero_uebergabe, profil_extras, ki_budget_*, session, token, password*` | — | ja / sensibel | **nein** |

---

## 2. Aufgabe 2–6 — die Leitplanken (`secure-read-path.js`)

- **Read-only Repository (Aufgabe 2):** `createSecureReadRepository` bietet **nur** `listMandates` +
  `listSourceTelemetry`; jede andere Methode wirft (Proxy). Es baut ausschließlich GET-Endpunkte; es
  gibt **keine** Schreibmethode. Ohne injizierten, freigegebenen Reader ist es **inert**
  (`notApprovedReader` wirft) → **kein Produktionsread möglich**.
- **Endpoint-Allowlist (Aufgabe 3):** nur exakt gebaute GET-Endpunkte unter `/rest/v1/` auf
  Allowlist-Tabellen mit explizitem `select=` aus Allowlist-Feldern; alles andere abgelehnt.
- **Tabellen-Allowlist (Aufgabe 4):** genau `mandate_profiles` + `source_crawl_telemetry`. Keine
  Wildcards, keine beliebigen SQLs.
- **Feld-Allowlist (Aufgabe 5):** exakte Spalten je Tabelle; **Sperrliste** blockt zusätzlich
  Name/Mail/Telefon/Session/Token/Passwort/Freitext — auch falls versehentlich allowlisted.
- **Automatische Sicherheitsprüfung (Aufgabe 6):** `validateReadRequest` prüft Methode=GET, Body
  verboten, kein RPC/Upsert-Muster, Endpoint-Präfix, Tabelle allowlisted, explizites `select`
  (kein `*`/Wildcard), jedes Feld allowlisted + nicht auf Sperrliste, Tenant vorhanden + validiert,
  kein Cross-Tenant-Filter. Bei Verstoß: **Abbruch** (`assertReadRequest` wirft).

---

## 3. Aufgabe 7 — Angriffssimulationen (alle blockiert)

| Angriff | blockiert durch |
|---|---|
| POST / PATCH / DELETE | `methode-nicht-get` |
| RPC-Aufruf | `schreibfaehiges-muster` |
| `on_conflict`-Upsert | `schreibfaehiges-muster` |
| `SELECT *` | `select-stern-verboten` |
| Fremder Tenant im Filter | `cross-tenant-filter` |
| Unbekannte Tabelle (`auth_users`) | `tabelle-nicht-allowlisted` |
| Unbekanntes/PII-Feld (`namensvarianten`/`email`) | `feld-verboten-pii` |
| Nicht-allowlisted Feld (`ki_budget_*`) | `feld-nicht-allowlisted` |
| Unbekannter Endpoint (`/auth/v1/...`) | `endpoint-praefix-unerlaubt` |
| Fehlender Tenant | `tenant-fehlt` |
| Nicht-validierter Tenant | `tenant-nicht-validiert` |
| Body-Smuggling in GET | `body-verboten` |

**14/14 simulierte Angriffe blockiert** (`secure-read-path-test.js`).

---

## 4. Aufgabe 8 — Tests + Verifikation

- **Neue Suite:** `secure-read-path-test.js` (**25/25**) — Allowlists, Blocklist, Read-only-Guard,
  Endpoint-/Feld-/Tabellen-/Tenant-Prüfung, 14 Angriffssimulationen, Inertheits-Garantie, kein
  Storage/Supabase/Secret/Netz-Import.
- **Gesamte Offline-Suite: 167/167 grün** (166 Bestand + 1 neu). Fällt **nicht** unter 166.

---

## 5. Abschluss — die 12 Fragen

1. **Welche Daten werden später wirklich gelesen?** Mandats-Fachfelder (Partei/Fraktion/Ausschüsse/
   Ministerien/Themen/Region/Ebene/Status) + technische Quellen-Telemetrie. Kein PII, keine Rohtexte.
2. **Welche Tabellen?** Genau zwei: `mandate_profiles`, `source_crawl_telemetry`.
3. **Welche Views?** Keine — nur die zwei Basistabellen; keine Wildcards/Views nötig.
4. **Welche Felder?** Exakt die Feld-Allowlist (siehe §1/§2), nie vollständige Datensätze, nie `*`.
5. **Welche PII konnte entfernt werden?** Name/`namensvarianten`/`gegner`, E-Mail, Telefon,
   `buero_uebergabe`, `profil_extras`, Budget-, Session-, Token-, Passwortfelder. `user_id` nur
   transient zur Pseudonymisierung, dann verworfen.
6. **Welche Angriffe wurden simuliert?** POST/PATCH/DELETE, RPC, `on_conflict`, `SELECT *`,
   Fremd-Tenant, unbekannte Tabelle, unbekanntes/PII-Feld, unbekannter Endpoint, fehlender/nicht-
   validierter Tenant, Body-Smuggling (14).
7. **Welche wurden blockiert?** **Alle 14** — mit benannter Ursache.
8. **Kann später technisch überhaupt noch geschrieben werden?** Nein — der Guard erzwingt GET,
   verwirft Body, blockt RPC/Upsert; das Repository hat **keine** Schreibmethode; ein `method`-
   Override erreicht die Leitung nicht.
9. **Ist Service-Role vollständig ausgeschlossen?** Ja — der Entwurf nutzt **nur** den Tenant-JWT/
   anon-GET-Pfad; „service_role/SERVICE_ROLE" kommt im Modul strukturell nicht vor (getestet).
10. **Ist Supabase MCP ausgeschlossen?** Ja — kein MCP, kein Supabase-Import, kein Netz-Client (getestet).
11. **Welche Freigabe brauche ich später noch?** (a) Freigabe des Tenant-JWT/anon-**read-only**-Pfads;
    (b) Bereitstellung read-only Credentials (`SUPABASE_URL/ANON_KEY/JWT_SECRET`) mit RLS-Read-only-
    Rolle; (c) Injektion eines freigegebenen `approvedReader` — **erst dann** ist das Repository nicht
    mehr inert. Ohne (a)–(c) bleibt jeder Read gesperrt.
12. **≥166 Offline-Suiten grün?** **Ja — 167/167.**

---

## 6. Sicherheitsregeln — eingehalten

Kein Produktionszugriff · keine neuen Credentials/Secrets · keine Service-Role · kein Supabase-MCP ·
kein Deployment/Migration/Schema-/RLS-/Tabellen-/Policy-/Trigger-/Cron-Änderung · Shadow nicht
aktiviert · Legacy unverändert · kein PR · kein Merge. **Es besteht weiterhin keine Möglichkeit,
Produktionsdaten zu lesen** — das Repository ist inert bis zur ausdrücklichen Freigabe. Alle Live-
Dateien byte-identisch.
