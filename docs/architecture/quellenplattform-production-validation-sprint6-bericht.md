# Sprint 6 — Read-only Produktionsvalidierung · Abschlussbericht

**Branch:** `architecture/quellenplattform-production-validation`
**Basis:** `architecture/quellenplattform-catalog-enrichment` @ `e0b9977`
**Stand:** 2026-07-21
**Ergebnisstatus:** **GESTOPPT – FREIGABE ERFORDERLICH**

> Es wurde **kein** Produktionsread ausgeführt. In dieser Umgebung existiert **kein** sicherer,
> tenant-gebundener, read-only-garantierter Produktions-Lesepfad, und es sind **keine Credentials**
> vorhanden. Gemäß Stop-Gate wurde vor jedem Produktionszugriff gestoppt. Geliefert werden: das
> Zugriffsaudit, die Entscheidungsmatrix, die Datenminimierung, der Read-Only-Schutzguard und der
> vollständig mockbare Validierungs-Harness (alle **ohne** Produktionsanbindung) — bereit, sobald ein
> sicherer Pfad **freigegeben** ist.

---

## 0. Preflight (bestanden)

1. Branch stammt direkt von `architecture/quellenplattform-catalog-enrichment` ab (`--is-ancestor` = true). ✓
2. Sprint-5-Commit `e0b9977` enthalten. ✓
3. **164** Offline-Suiten vorhanden. ✓
4. **164/164** grün vor Beginn. ✓
5. Keine uncommitteten Änderungen. ✓

---

## 1. Phase 1 — Read-only Zugriffsaudit (nur Code-Inspektion, kein Produktionsread)

Inventar der vorhandenen Zugriffspfade und ihre harten Eigenschaften:

- **App-DB-Pfad `storage.supabaseRequest`** — nutzt `SUPABASE_SERVICE_ROLE_KEY` (Admin). Er ist
  **methoden-parametrisiert** (`method: GET|POST|PATCH|DELETE`) → genau die verbotene „liest oder
  schreibt je nach Zustand"-Form. Service-Role **umgeht RLS** (Tenant-Trennung nur app-seitig).
- **Tenant-Pfad `storage.tenantRequest` / `supabaseAuthenticatedRequest`** — nutzt `SUPABASE_ANON_KEY`
  + signiertes **Tenant-JWT** (`role`-Claim) → PostgREST erzwingt **RLS serverseitig**. Aber ebenfalls
  methoden-parametrisiert (kann schreiben) und braucht `SUPABASE_JWT_SECRET` + `ANON_KEY` + `URL`.
- **Supabase-MCP (`execute_sql`/`list_tables`)** — arbiträres SQL, **schreibfähig**, Admin/Service-Role,
  **RLS-umgehend**.
- **Admin-Read-Endpunkte (server.js)** — brauchen laufenden Server + Admin-Secret; app-seitige Isolation.
- **Diagnose-Skripte** (`jwt-diagnose.js` etc.) — nur Metadaten, kein Mandatsread.
- **Interne Read-Modelle (offline)** — Master-Katalog-Seed + Fixtures; **keine** Tenant-Daten.

**Credential-Präsenz in dieser Umgebung (nur Boolean geprüft, nie Werte):**
`SUPABASE_URL=false`, `SERVICE_ROLE_KEY=false`, `ANON_KEY=false`, `JWT_SECRET=false` → **Produktion ist
physisch nicht erreichbar.**

### Entscheidungsmatrix

| Zugriffspfad | Read-only garantiert | Tenant-sicher (serverseitig) | PII-Risiko | Neue Secrets nötig | Empfehlung |
|---|:--:|:--:|:--:|:--:|---|
| `storage.supabaseRequest` (Service-Role) | ❌ (GET/POST/PATCH/DELETE) | ❌ (RLS umgangen) | hoch | ja | **ABLEHNEN** |
| `tenantRequest` / `authenticatedRequest` (anon + Tenant-JWT) | ❌ (methoden-param.) | ✅ (RLS via `authenticated`) | mittel | ja (JWT_SECRET+ANON+URL) | **Nur mit Freigabe + GET-only-Wrapper** |
| Supabase-MCP (`execute_sql`) | ❌ (arbiträres SQL) | ❌ (Admin, RLS umgangen) | hoch | ja | **ABLEHNEN** |
| Admin-Read-Endpunkte (server.js) | teils | app-seitig | mittel | ja (Admin-Secret+Server) | Nur mit Freigabe |
| Diagnose-Skripte | meta/read | n/a | niedrig | ja | nur Metadaten |
| Interne Read-Modelle (Seed/Fixtures, offline) | ✅ | ✅ (keine Tenant-Daten) | keine | nein | **genutzt (offline)** |

**Ergebnis:** Kein Pfad ist zugleich (a) read-only-garantiert, (b) serverseitig tenant-sicher und
(c) ohne neue Secrets verfügbar. Der einzige serverseitig tenant-sichere Pfad (Tenant-JWT/anon) ist
methoden-parametrisiert und benötigt neue Secrets. **→ Stop-Gate ausgelöst.**

### Kritisches Stop-Gate — die 7 Prüfungen
1. **Welcher Read-only-Pfad?** Keiner ist read-only-garantiert; nur ein GET-only-Wrapper über den
   Tenant-JWT-Pfad käme in Frage.
2. **Credentials?** `SUPABASE_URL/ANON_KEY/JWT_SECRET` — **nicht vorhanden** → neue Secrets nötig.
3. **Schreibrechte der Credentials?** Service-Role = Vollzugriff (schreibfähig); Tenant-JWT-Rolle je
   nach RLS potenziell schreibfähig ohne GET-Zwang.
4. **Serverseitige Tenant-Trennung?** Nur beim Tenant-JWT-Pfad (RLS); Service-Role/MCP umgehen sie.
5. **Welche Tabellen/Spalten?** (Phase 2 unten definiert — noch nicht gelesen.)
6. **PII nötig?** Nein (Datenminimierung Phase 2 schließt Name/E-Mail/Telefon aus).
7. **Lokale Persistenz?** Keine — es werden keine sensiblen Dateien erzeugt.

Da **neue Secrets nötig**, **vorhandene Credentials Schreibrechte hätten** und **kein
read-only-garantierter Pfad** existiert: **sofort gestoppt, Freigabe erforderlich.** Keine kreative
Umgehung, keine Service-Role-Nutzung.

---

## 2. Phase 2 — Datenminimierung (definiert, im Harness erzwungen)

**Mandatsprofil — erlaubt:** interne (pseudonyme) Mandatsreferenz, Partei, Fraktion, Ausschüsse,
Funktionen, Themen, Region, Bundesland, Mandatsebene, Profilvollständigkeit, Tenant-Zuordnung.
**Verboten (nie geladen/übernommen):** Name, E-Mail, Telefon, private Kontaktdaten, Freitexte,
Login-/Sessiondaten. Mandate werden **vor** jeder Verarbeitung pseudonymisiert (`mandat-001`, …).

**Quellen-Telemetrie — erlaubt:** Quellen-ID, technische Gesundheit, letzter Erfolg, Fehlerklasse,
Parserstatus, Qualitätsstatus, Prüfstatus, Aktivitätsstatus, Tenant-Sichtbarkeit. **Keine** Rohartikel
oder Volltexte. Umgesetzt in `production-validation.js` (`MANDATE_ALLOWED`/`MANDATE_FORBIDDEN`/
`TELEMETRY_ALLOWED`, `minimizeMandate`, `minimizeTelemetryRow`).

---

## 3. Phase 3 — Read-Only-Schutzguard + Harness (gebaut, ohne Produktionsanbindung)

- **`production-read-guard.js`** — strukturelle Schreibsperre: `assertReadOnlyRequest` (nur GET/HEAD,
  kein Body, kein RPC/Upsert-Endpoint), `readOnlyRequest` (erzwingt GET, verwirft Body — ein
  `method`-Override kann nicht schreiben), `readOnlyRepository` (Proxy: nur freigegebene Lese-Methoden,
  alles andere wirft), `scanWriteCapability` (belegt strukturell, dass `storage.js` schreibfähig ist →
  Direktnutzung verboten). Enthält **keine** Credentials/Endpunkte.
- **`production-validation.js`** — der Validierungs-Harness. Konsumiert eine **injizierte**,
  read-only-gesicherte Quelle (`listMandates`/`listSourceTelemetry`), minimiert + pseudonymisiert,
  und speist die Daten in die **bestehende** Shadow-Maschinerie (Sprint 4) über den befüllten
  Master-Katalog (Sprint 5). **Keine neue Parallelarchitektur, kein eigenes Health-/Quality-Modell,
  kein Storage-/Supabase-Import, keine Secrets.** In dieser Umgebung nur **mock**-getrieben
  (`isMock:true`). Der real verbindende Adapter ist **bewusst nicht gebaut** (Freigabe-Gate).

---

## 4. Phasen 4–7 — mit Mock statt Produktion (kein realer Read)

Da kein Produktionsread erlaubt/möglich war, wurden Stichprobe, realer Shadow-Vergleich und die
Sicherheits-/Datenschutzprüfung **mit einer Mock-Produktionsquelle** nachgewiesen (verschiedene
Parteien/Ausschüsse/Regionen, ein unvollständiges Profil, zwei Tenants, PII-behaftete Rohdaten zur
Prüfung der Minimierung). Ergebnis des Mock-Laufs: Legacy immer sichtbar/intakt, neue Plattform nie
auto-aktiv, Telemetrie + Mandate PII-frei, kein Cross-Tenant-Leak, deterministisch. **Die realen
Antworten (echte Mandate/Telemetrie) stehen aus, bis ein Pfad freigegeben ist.**

**Abbruchregeln (Phase 8):** unverändert die 11 Regeln aus Sprint 4 (`shadow-compare.evaluateAbortRules`)
plus die Sprint-6-Ergänzungen „Produktionsdaten widersprechen Seed", „Fixtures nicht repräsentativ",
„reale Quelle defekt", „Datenbasis unvollständig" — alle als Blocker führbar; **keine** verändert je Legacy.

---

## 5. Phase 9 — Tests + Verifikation

- **Neue Suiten (2):** `production-read-guard-test.js` (14/14) und `production-validation-test.js`
  (17/17, mock-getrieben). Decken ab: Read-only-Garantie, keine Writes, Abbruch bei ungesicherter
  Quelle, Tenant-Isolation, private Quellen, pseudonymisierte Mandate, PII-freie Telemetrie,
  fehlende→unbekannt, Legacy allein entscheidend, Fehler-Isolation, Health-/Quality-Daten (mock),
  Entity-ID-Normalisierung, Determinismus, keine Produktionsdaten in Snapshots, kein
  Secret/Storage-Import, kein Auto-Wechsel, Validierung nur über gesicherten Pfad.
- **Gesamte Offline-Suite: 166/166 grün** (164 Bestand + 2 neu). Fällt **nicht** unter 164.
- **Kein realer Validierungslauf** ausgeführt (kein freigegebener Pfad) → keine begrenzte Realabfrage.

---

## 6. Abschluss — die 15 Fragen (mit echten Messwerten, soweit ohne Produktionsread möglich)

1. **Welcher Read-only-Pfad wurde geprüft?** Alle (siehe Matrix). Einziger serverseitig tenant-sicherer:
   Tenant-JWT/anon (`supabaseAuthenticatedRequest`) — aber methoden-parametrisiert + neue Secrets nötig.
2. **War eine zusätzliche Freigabe nötig?** **Ja** — und sie steht aus. Neue Secrets + read-only-Wrapper
   + Bestätigung der RLS-Read-only-Rolle erforderlich.
3. **Welche Tabellen/Felder wurden gelesen?** **Keine** (Produktion nicht berührt). Geplant/minimiert:
   `mandate_profiles` (nur Fachfelder, kein PII), `source_crawl_telemetry`/`retrieval_paths` (nur technisch).
4. **Wie viele reale Mandate getestet?** **0 real.** Mock-Stichprobe: 4 Mandate über 2 Tenants.
5. **Welche Parteien/Ausschüsse/Regionen?** (Mock) SPD, Linke, Grüne; Gesundheit, Arbeit&Soziales;
   Berlin, Niedersachsen, Bayern — real ausstehend.
6. **Unterschied echte Daten vs. Fixtures?** Real nicht messbar (kein Read). Der Harness liefert den
   dimensionsweisen Abgleich (`compareFixtureVsReal`) mit konkreter Ursache je Differenz, sobald echte
   Daten vorliegen.
7. **Realer Google-News-Anteil?** Real unbekannt (kein Read). Fixture/Seed-Referenz Sprint 5: Ø 0,154.
8. **Problematische reale Quellen?** Real unbekannt. Strukturell führt der Katalog Prüf-/Lizenzstatus
   ehrlich (viele Ministerien `presse_erlaubt`, einige `unbewertet`) — die reale Health/Recht-Prüfung
   braucht den freigegebenen Read.
9. **Tenant-Isolation nachweisbar?** **Ja** — strukturell (Guard + per-Tenant-Läufe, kein Cross-Tenant-PII,
   RLS-Pfad als einziger empfohlener) und im Mock-Lauf bewiesen; serverseitig via RLS/Tenant-JWT.
10. **PII/Secrets verarbeitet?** **Nein.** Minimierung entfernt Name/E-Mail/Telefon; Referenzen gehasht;
    keine Secrets/kein Storage-Import in der Sprint-6-Schicht (getestet).
11. **Gab es irgendeinen Write?** **Nein.** Guard blockt strukturell jede Nicht-GET-Operation; kein
    Produktionszugriff erfolgte.
12. **Blocker gegen Aktivierung?** (a) Kein freigegebener read-only Produktionspfad; (b) reale Health-/
    Prüfdaten fehlen; (c) fehlende Credentials; (d) `autoActivateNewAllowed` strukturell false; die
    fachlichen Blocker aus Sprint 4/5 (fiktive Partei, Wahlkreis, ressort-lose Politikfelder) bestehen fort.
13. **Master-Katalog mit echten Daten belastbar?** **Noch nicht belegt** — der Katalog ist offline
    (Seed) belastbar und deterministisch; die Belastbarkeit gegen reale Telemetrie ist erst nach
    freigegebenem Read messbar.
14. **Nächste konkrete Datenkorrekturen?** Reale Health-/Prüfstatus je Quelle einspielen; Quellen mit
    `unbewertet`-Lizenz rechtlich klären; wahlkreisscharfe + ressort-lose Politikfeld-Quellen ergänzen;
    reale Entity-ID-Normalisierung gegen Produktions-Partei-/Regionswerte verifizieren.
15. **≥164 Offline-Suiten grün?** **Ja — 166/166.**

---

## 7. Minimaler Vorschlag (NICHT implementiert — wartet auf Freigabe)

Falls du einen realen Read freigibst, empfehle ich **ausschließlich**:
1. Pfad: **Tenant-JWT/anon** (`supabaseAuthenticatedRequest`), **nicht** Service-Role, **nicht** MCP.
2. Ein **neuer, dünner read-only Adapter**, der ausschließlich `guard.readOnlyRequest` nutzt (hart GET,
   Endpoint-Allowlist: `mandate_profiles`-Fachspalten + `source_crawl_telemetry`-Technikspalten).
3. **Kleine, begrenzte Stichprobe** (Pilot-Tenant + 1–2 weitere), **keine** Vollabfrage aller Tenants.
4. Secrets als **read-only**-Rolle bereitstellen; RLS-Read-only serverseitig bestätigen.
5. Ergebnisse nur **pseudonymisiert + minimiert** (bereits erzwungen); **keine** lokale Persistenz.

Dieser Adapter wird erst nach deiner ausdrücklichen Freigabe gebaut und committet.

---

## 8. Sicherheitsregeln — eingehalten

Kein Produktionswrite · keine Migration/Schemaänderung · keine Seed-Daten in Produktion · keine
RLS-/Auth-/Secret-/Benutzer-/Mandat-Änderung · keine Quellen aktiviert/deaktiviert · keine Crawls/Crons/
Locks · keine Telemetrie verändert · kein Deployment · kein Merge nach `main` · kein Pull Request ·
kein automatischer Wechsel. **Kein Produktionszugriff erfolgt.** Alle Live-Dateien byte-identisch.
