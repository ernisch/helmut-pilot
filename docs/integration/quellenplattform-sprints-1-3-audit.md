# Integrationsaudit — Quellenplattform Sprint 1–3

**Branch:** `integration/quellenplattform-sprints-1-3`
**Basis:** `main` @ `d6d9063`
**Stand:** 2026-07-21
**Charakter dieses Branches:** **treue, ruhende Vereinigung** (faithful dormant union) — Entscheidungsfläche, keine entschiedene Architektur.

---

## 0. Was dieser Branch ist — und was nicht

Dieser Branch führt Sprint 1, 2 und 3 **mechanisch und vollständig** auf `main` zusammen
(`git merge --no-ff`, Reihenfolge S1 → S2 → S3, **null Textkonflikte**). Er

- **fügt nur hinzu** (58 Dateien = exakt die Vereinigung der drei Sprints),
- **löscht nichts**, **dedupliziert nichts**, **verdrahtet nichts** neu,
- **verändert keine Live-/Produktionsdatei**: `server.js`, `lib/helmut/quellenarchitektur/model.js`,
  `lib/helmut/tenant-context.js`, `supabase/migrations/20260713_source_architecture.sql` u. a. sind
  **byte-identisch zu `main`**,
- **wendet keine Migration an**, führt keinen Crawl/Cron aus, ändert keine Locks.

Alle drei Sprint-Lieferungen sind **ruhende Bibliotheken** (dormant shelfware): nichts davon ist in
`server`, eine API-Route, `scheduler.js` oder `crawler.js` eingehängt. Einziger Konsument je Sprint
sind dessen eigene `scripts/*-test.js`.

> **Kernaussage:** Die Gefahr liegt **nicht beim Merge** (der ist trivial sauber), sondern beim
> **späteren Verdrahten**. Dieser Branch macht die drei Sprints gemeinsam testbar und legt die
> architektonischen Widersprüche offen — er **entscheidet sie nicht**. Die verbindlichen
> Architekturentscheidungen (Abschnitt 6) sind bewusst dem Menschen vorbehalten.

---

## 1. Phase 1 — Branch-Topologie

Alle drei Sprints zweigen vom **identischen** Commit `d6d9063` (= aktueller `main`-HEAD) ab. Die
paarweisen Merge-Basen sind ebenfalls alle `d6d9063` — **kein Sprint enthält einen Commit eines
anderen.**

| Sprint | Branch | Basis | Commits | Dateien | Migration |
|---|---|---|---|---|---|
| S1 Mandatsregister | `claude/universelles-mandatsregister-sprint1` | `d6d9063` | 2 | 8 (+1708) | `supabase/migrations/prepared/` (quarantäniert, nicht angewendet) |
| S2 Quellenbibliothek | `claude/session-ckedi8` | `d6d9063` | 1 | 18 (+2172) | **keine** |
| S3 Master-Katalog | `claude/session-pyryop` | `d6d9063` | 2 | 32 (+4405) | `supabase/migrations/` (aktiver Pfad, freigabepflichtig) |

**Dateiüberschneidung zwischen den Branches: null.** Nur zwei Bestandsdateien werden überhaupt
geändert — `.github/workflows/ci.yml` (nur S2) und `scripts/run-offline-tests.js` (nur S3),
verschiedene Dateien. Deshalb ist der sequenzielle Merge textuell konfliktfrei.

**Abhängigkeits-Landkarte** (jeder Sprint erweitert `main`, keiner referenziert einen anderen):

```
main (quellenarchitektur/model.js, matching.js, config.js, profile-packages.js, seeds/*)
 ├── S1  mandate-register.js        → nutzt profile-packages, PACKAGE_DEFINITIONS, config, profile-validation
 ├── S2  quellenbibliothek/*        → nutzt quellenarchitektur/model, matching, config  (parallel zu catalog.js)
 └── S3  quellenarchitektur/master/* → nutzt ../model ("Wiederverwendung statt Parallelmodell"), seeds/entities, seeds/geographies
```

### Ausdrückliche Antworten

1. **Enthält S2 die Änderungen aus S1?** — **Nein.** Merge-Basis = `main`; kein S1-Commit in S2;
   S2 importiert `mandate-register.js` nicht (leitet sein `MandateRequirement` selbst aus dem Rohprofil ab).
2. **Enthält S3 die Änderungen aus S1 und S2?** — **Nein.** Gleiches Bild; S3 referenziert weder S1 noch S2 im Code.
3. **Hat S3 Funktionen aus S2 neu gebaut oder dupliziert?** — **Parallel neu gebaut, nicht kopiert.**
   Beide haben eigene `assignment`-, `health`-, `quality/coverage`-Bausteine, aber auf **verschiedenen
   Datenmodellen**; keiner importiert den anderen.
4. **Widersprüchliche Datenmodelle / Registries / Zuweisungslogiken?** — **Ja** (Kernproblem):
   drei überlappende „Quelle"-Abstraktionen und **zwei sich gegenseitig ausschließende** Zuweisungsmaschinen (S2 vs. S3).
5. **Doppelte oder kollidierende Migrationen?** — **Keine Kollision** (S1 `mandate_*` vs. S3 `catalog_*`/`tenant_source_*`,
   disjunkte Dateien und Tabellen), aber **Konventionsdivergenz** (S1 `prepared/` vs. S3 aktiver Pfad).
6. **Unterschiedliche Wahrheiten für Profile/Quellen/Pakete/Gesundheit?** — **Ja** für Quellen, Pakete
   und Gesundheit; Profile/Mandate haben mit `mandate_profiles` weiterhin **eine** Schreibwahrheit (S1 ist davon abgeleitet).

---

## 2. Phase 2 — Architektur-Matrix

Legende: ● vorhanden · ○ nicht vorhanden · **K** = Konflikt/konkurrierend · **D** = Doppelung

| # | Dimension | main (live) | S1 | S2 | S3 | Status | Verbindliche Wahrheit (Empfehlung) |
|---|---|---|---|---|---|---|---|
| 1 | Mandatsregister | ○ | ● | ○ | ○ | Nur S1 | **S1** als abgeleitetes Read-Model über `mandate_profiles` |
| 2 | Quellenbibliothek (Logikschicht) | ○ | ○ | ● | ○ | Nur S2 | Design von **S2** auf `main`-Persistenz übernehmen |
| 3 | Master-Quellenkatalog (relational) | ● (`source_architecture`) | ○ | ○ | ● | **K** | `main` bleibt Basis; Neu-Teile aus **S3** einfalten |
| 4 | Quellenzuweisung | ● `profile-packages` | (nutzt main) | ● | ● | **K (Blocker)** | **UNENTSCHIEDEN** — S2 (Pakete sterben) *oder* S3 (Pakete bleiben) |
| 5 | Qualitätsmodell | ● `quality-watchdog` | ○ | ● | (in supply) | **D** | **main** Watchdog; S2-Skalar als Ranking-Schicht oben drauf |
| 6 | Gesundheitsmotor | ● `model.nextPathStatus` (6 Zust.) | ○ | ● (8 Zust.) | ● (4 Zust., main-Schwellen) | **D** | **main** FSM; S2-Transientzustände als Sub-States absorbieren |
| 7 | Discovery / Intake | ○ | ○ | ● | ● | Überschneidung | Neu; auf das Sieger-Quellmodell falten (S3-Intake + S2-Lifecycle) |
| 8 | Tenant-Trennung | ● `tenant-context` / RLS | (neutral) | ○ (tenant-blind) | ● (`tenant-scope`, 7 Schichten) | Lücke bei S2 | **main** `helmut_current_tenant()` + **S3**-Tenant-Schicht |
| 9 | DSGVO / PII | ● (Bestand) | (kein neuer PII) | ○ (kein PII-Scan) | ● (Datenfluss + PII-Regeln) | Lücke bei S2 | **S3** DSGVO-Schicht maßgeblich |
| 10 | Datenbankmodell | ● (Bestand) | ● (2 add. Tab., `prepared/`) | ○ | ● (12 add. Tab., aktiver Pfad) | **K** (Konvention) | additiv, aber Schema-Konsolidierung nötig (siehe #3) |

Zu entfernende **eindeutige** Doppelungen (mechanisch, nach Freigabe — siehe Abschnitt 5): S3-Enum-Redeklarationen,
S1/main Committee-Label-Karte, S2 toter `createLibrary`-Fassade.

---

## 3. Phase 3 — Integrationsentscheidung

- **Reihenfolge bestätigt: S1 → S2 → S3.** Jeder Branch merged sauber auf den vorigen (empirisch geprüft).
- **Merge statt Cherry-Pick für alle drei** — alle sind sauber und additiv; für eine *treue* Vereinigung
  ist Merge korrekt (Cherry-Pick nur nötig, um Teilmengen zu nehmen, was hier nicht gewollt ist).
- **Für die spätere Produktiv-Verdrahtung gilt die umgekehrte Empfehlung:** S1 als ruhende additive
  Schicht behalten; S2 und S3 **nicht** als-ist verdrahten, sondern nach den Architekturentscheidungen
  (Abschnitt 6) die **Sieger-Teile** selektiv übernehmen und die Verlierer entfernen.

---

## 4. Phase 4 — Aufbau des Branches

`git checkout -B integration/quellenplattform-sprints-1-3 origin/main`, dann drei `--no-ff`-Merges
(S1, S2, S3). Ergebnis: 58 geänderte Dateien = exakt die Vereinigung der drei Sprints; keine
zusätzliche, keine fehlende Datei; alle Live-Dateien unverändert gegenüber `main`. **Keine
architektonische Entscheidung wurde still getroffen** (alle drei Implementierungen bleiben nebeneinander bestehen).

---

## 5. Phase 5 — Bereinigung (NICHT ausgeführt — bewusst)

Gefundene Doppelungen. **Keine wurde entfernt**, weil keine „eindeutig obsolet ohne Entscheidung" ist —
alle hängen an einer offenen Architekturfrage. Bei Unsicherheit: stoppen und fragen.

**Echte, aber harmlose Doppelungen (mechanisch bereinigbar NACH Freigabe):**
- S3 `master/model.js:TRUST_LEVELS` redeklariert `main model.js:TRUST_LEVELS` (obwohl `../model` schon importiert). → aus Basis re-exportieren.
- S3 `master/taxonomy.js:EVIDENCE_ROLES` redeklariert `main`-Werte (mit „konsistent mit"-Kommentar). → importieren.
- S1 `seeds/mandate-registry.js:COMMITTEE_RELATIONS.policyField` überlappt `main matching.js:POLICY_FIELD_LABELS` (gleiche ~22 Keys/Labels). S1 ist die Obermenge (+ Ministerium/themeTerms) → S1 als Datenheimat, Labels aus einer Quelle beziehen.
- S2 `index.js:createLibrary` — von nichts importiert (auch nicht von den eigenen Tests). Toter Komfort-Export → verdrahten oder entfernen.

**Architektonische Doppelungen (NUR mit menschlicher Entscheidung auflösbar — Abschnitt 6):**
drei Quellmodelle · zwei Zuweisungsmaschinen · drei Gesundheitsvokabulare · zwei Qualitätsmodelle · S3 `catalog_*` vs. `main` `source_architecture`.

**Hardcoding / Pilot-Sonderfälle:** sauber. Kein Partei-/Ausschuss-/Mandanten-Steuerfluss, keine
`=== "pilot"`-Sonderpfade, keine TODO/FIXME/HACK in den neuen Modulen. S1s einzelner Eintrag
`PARTY_PACKAGE_KEYS = { linke: … }` ist **Daten** (aktuelle Paketabdeckung), keine Sonderfall-Logik —
als Abdeckungslücke tracken, kein Blocker. **Korrektur zum Analyse-Zwischenstand:** der zunächst
gemeldete „Bug" in `master/health.js` (Schwellen `undefined`) ist ein **Fehlalarm** — `require("../model")`
löst auf `main`s `model.js` auf, das `BROKEN_THRESHOLD=6`/`DEGRADE_THRESHOLD=3` exportiert; Eskalation
funktioniert (Laufzeit geprüft: streak 3 → degraded, 6 → broken).

---

## 6. Offene Entscheidungen (verbindlich dem Menschen vorbehalten)

Nach Priorität. **Bis diese entschieden sind, darf Sprint 4 nicht auf der Quell-/Zuweisungsschicht aufbauen.**

1. **[BLOCKER] Überlebt das „Paket"-Konzept?** — S2 schafft Pakete ab (Zuweisung zur Laufzeit aus
   Kriterien, refCount direkt auf Quellen) vs. S3 behält Pakete (Quelle→Paket-Klassifikator). Beide können
   nicht zugleich landen. Diese Frage kaskadiert in das Quellmodell, das DB-Schema und Sprint 4. S1s
   `computeSupplyOutlook` hängt an kuratierten Paket-Keys und ist von dieser Entscheidung abhängig.
2. **[HOCH] Kanonisches Quell-Datenmodell** — `main` relational vs. S3 flacher 20-Attribut-Record vs.
   S2 flacher Descriptor. Nur eines darf schreiben. (Empfehlung: `main` bleibt Schreibwahrheit; S3-Neu-Teile einfalten.)
3. **[HOCH] Konkurrierendes DB-Quellschema** — S3 `catalog_*` dupliziert das ausgelieferte
   `20260713_source_architecture.sql`. Einfalten der Neu-Teile (12-Zustand-Review/Release/License/Privacy,
   `tenant_source_*`) **oder** `main`-Schema formal ablösen. **S3 nicht als paralleles Schema neben `main` anwenden.**
4. **[HOCH] Ein Gesundheitsvokabular** — `main` 6 Zustände vs. S2 8 vs. S3 4.
5. **[HOCH] Ein Qualitätsmodell** — `main` kategorialer Watchdog vs. S2 Skalar (und ob der Skalar oben aufsetzt).
6. **[HOCH] S2-Tenant-Blindheit** — S2s global deduplizierte Registry hat kein `tenant_id`, keine
   Private-Source-/PII-Behandlung. Unkritisch solange in-memory; Leck-Risiko bei Persistenz. S3-Tenant-/RLS-/DSGVO-Schicht als maßgeblich übernehmen.
7. **[MEDIUM] Migrations-Konvention** — S1 `prepared/` (physisch außerhalb des Runner-Pfads) vs. S3
   im aktiven Pfad mit `FREIGABEPFLICHTIG`-Kommentar. Vereinheitlichen (Empfehlung: S3 ebenfalls nach `prepared/`).
8. **[NIEDRIG] S1 `mandate_register.profile_id` FK-Ziel** — `mandate_profiles.id` vs. `profiles.id`,
   auskommentiert; vor jeder Anwendung verifizieren (README OP-01). Nicht dringend (staged).

---

## 7. Phase 6 — Verifikation (auf diesem Branch)

- **Offline-Gesamtsuite:** **149/149 Suiten grün** (Exit 0, ~40 s), inkl. der 9 neuen Sprint-Suiten
  (S1×1, S2×5, S3×3) und aller Bestandstests. Der `[NETZ-GUARD]`-Hinweis zu `pardok-shadow-test.js`
  ist **Bestand auf `main`** (keine Sprint-Datei): der Netz-Guard blockte einen Nicht-Localhost-Versuch,
  die Suite blieb grün — kein Regress.
- **Syntax-Check:** alle **39** geänderten/neuen `.js`-Dateien bestehen `node --check`.
  Hinweis: `.github/workflows/ci.yml` deckt `lib/helmut/quellenarchitektur/master/*.js` im
  Syntax-Glob **nicht** ab (Unterverzeichnis) — Folge-Fix empfohlen; die kanonische Gate
  (`run-offline-tests.js`) erfasst die Tests jedoch automatisch.
- **Migrations-Additivität:** beide Migrationen sind **rein additiv** (S1: 2 `CREATE TABLE`; S3: 12;
  alle `ALTER` nur `enable row level security` auf **eigenen** neuen Tabellen; kein `ALTER`/`DROP` auf
  Bestandstabellen). Rollbacks sind DROP-only und deckungsgleich (2 bzw. 12 Tabellen). **Keine Migration wurde ausgeführt.**
- **Mandantentrennung / DSGVO / Zuweisung / Coverage / Shadow:** die Sprint-Tests
  (`master-catalog-tenant-test`, `quellenbibliothek-assignment-test`, `master-catalog-migration-test`,
  `master-catalog-shadow-compare`) sowie die Bestandstests (`tenant-neutrality`, `tenant-guard`,
  `tenant-jwt`, `source-architecture`, `source-coverage`) sind Teil der Gesamtsuite oben.

---

## 8. Abschlussurteil

1. **Vorher integriert?** — **Nein.** Drei unabhängige Abzweige vom selben `main`-Commit, nebeneinander.
2. **Überschneidungen?** — drei Quellmodelle, zwei Zuweisungsmaschinen, drei Gesundheitsvokabulare,
   zwei Qualitätsmodelle, ein konkurrierendes DB-Quellschema, kleinere Enum-/Label-Doppelungen.
3. **Gelöste Konflikte?** — nur **mechanische**: sauberer Merge, treue Vereinigung, Verifikation grün.
   Keine fachliche Doppelung wurde still aufgelöst.
4. **Konflikte, die deine Entscheidung brauchen?** — Abschnitt 6 (v. a. der Paket-Blocker #1 und Quellmodell #2/#3).
5. **Verbindliche Architektur jetzt?** — Basis bleibt `main` (live). Für alles Konkurrierende ist die
   verbindliche Wahrheit **noch nicht entschieden** (Matrix Spalte „Verbindliche Wahrheit" = Empfehlung, nicht Beschluss).
6. **Alle drei Sprints vollständig auf dem Branch?** — **Ja**, treu und vollständig (58 Dateien = Vereinigung), nichts entfernt.
7. **Alle Tests grün?** — siehe Abschnitt 7.
8. **Stabil genug für Sprint 4?** — **Bedingt.** Als *ruhende* Vereinigung ja; für Aufbau auf der
   Quell-/Zuweisungsschicht **erst nach** den Entscheidungen #1–#3.
