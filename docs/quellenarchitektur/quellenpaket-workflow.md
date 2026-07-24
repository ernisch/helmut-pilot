# Quellenpaket-Workflow — wiederverwendbarer, nicht-destruktiv & reproduzierbar garantierter Ablauf

Stand: 2026-07-24 · Gilt für **alle** Quellenpakete (Landesmodule, Fachpakete wie
„Wohnen, Bauen und Stadtentwicklung“, künftige Pakete).

Dieser Bericht beschreibt den gehärteten Workflow, mit dem ein neues Quellenpaket in
Seed-SQL überführt wird, **ohne** Bestandsdaten zu löschen/ersetzen und **ohne** Runtime-Effekt
bis zur ausdrücklichen Freigabe. Er ist die kanonische Referenz nach der P1-Workflow-Härtung
und der Quellenpaket/Workflow-Konsolidierung.

> **Kein Ergebnis in diesem Dokument ist handgeschrieben.** Die Zahlen und das Urteil
> stammen aus dem Script-Output von `scripts/quellenpaket-workflow-test.js` (JSON via
> `--out`), das im CI erzeugt und als Artefakt archiviert wird. Ändert sich das Modell,
> ändert sich der Report — nicht dieser Text.

> **Präzise Begriffe statt „rein additiv“.** Der Basis-Seed ist ein **reproduzierbarer
> Upsert-Seed** (`insert … on conflict do update set …`), **kein** insert-only/„rein additiver“
> Seed. Der Landesmodul-Seed ist **insert-only** (`… do nothing`). Beide sind **nicht-destruktiv**
> (kein `delete`/`drop`/`truncate`/`alter`/`merge`). Der maschinenlesbare Report gibt pro Seed
> den **tatsächlich gemessenen** Modus aus — siehe §5.

---

## 1. Ablauf

```
Modell (lib/helmut/quellenarchitektur, FACHLICH — hier nicht angefasst)
   │
   ▼
Generator (scripts/generate-*-seed.js)        reine Codegen, kein DB/Netz
   │   deterministisch sortiert (ID-Ordnung), Kommentare reproduzierbar
   ▼
Seed-SQL (supabase/seeds/*_seed.sql)          generiertes Artefakt, NICHT von Hand editieren
   │
   ▼
Registry (scripts/quellenpaket-registry.js)   Single Source of Truth: Seeds ↔ Pakete
   │
   ▼
Verifikation (scripts/quellenpaket-workflow-test.js)
   │   Fail-Closed-Vollständigkeit + Drift + nicht-destruktiv + Mutationsmodus
   │   + paketgenerische Kollision + Runtime-Inertheit
   ▼
CI-Gate + maschinenlesbares JSON-Artefakt (.github/workflows/ci.yml)
   │
   ▼
Dokumentation (dieses Dokument, aus dem Report gespeist)
```

## 2. Die Garantien (technisch, nicht behauptet)

`scripts/quellenpaket-workflow-test.js` läuft in der Offline-Suite (CI-Gate) und erzeugt
zusätzlich einen JSON-Report. Es prüft **die gesamte erzeugte Ausgabe** — Datenzeilen,
Reihenfolge, Kommentare, Leerraum — **und die Registry selbst** (fail-closed).

| Garantie | Was geprüft wird | Aussage |
|---|---|---|
| **(0) Vollständigkeit (fail-closed)** | Jeder Seed unter `supabase/seeds/` ist registriert **oder** in einer begründeten Allowlist; jeder Registry-Eintrag zeigt auf ein **vorhandenes** Artefakt; jeder `kind:"package"`-Eintrag trägt **alle** Pflicht-Hooks (`packageId`/`paths()`/`packagePaths()`/`publishers()`/Generator/Zielartefakt). | Verwaister Seed **oder** fehlender Hook → ROT. Keine stillen `if (entry.paths)`-Überspringungen. |
| **(A) Drift / Reproduzierbarkeit** | Jede committete Seed-Datei (inkl. Rollback) ist **byte-für-byte** aus ihrem Generator reproduzierbar. | Erkennt entfernte, verschobene, geänderte Zeilen, **verlorene Kommentare** und jeden Handedit. |
| **(B) Nicht-destruktiv + Mutationsmodus** | **Kein** `delete`/`drop`/`truncate`/`alter`/`merge` (auch nicht in CTEs), **kein** `update` außerhalb `do update set`. Der **tatsächliche** Modus wird gemessen und gegen den erwarteten geprüft. | Basis-Seed = `upsert_update`, Landesmodul-Seed = `insert_only`. „Nicht-destruktiv“ ist bewiesen — ein destruktives Statement lässt den Check rot werden. **Nicht** mit „insert-only“/„rein additiv“ gleichgesetzt. |
| **(C) Kollision (paketgenerisch)** | Über die **Vereinigung** aller registrierten Basis- + Paketdefinitionen: eindeutige Path-/Package-/Entity-IDs, Slugs, (scoped) Canonical Keys; jede Domain gehört genau **einem** Herausgeber (außer begründete Shared-Domain-Ausnahme); keine URL-Dublette über den **schema-insensitiven** Schlüssel (exakt, normalisiert, `www.`, Trailing-Slash, Tracking-Parameter, Query-Reihenfolge, **http/https**). | Ein neues Paket kann keine bestehende Quelle doppelt crawlen oder eine ID recyceln. **Grenze:** Redirect-Dubletten sind **offline nicht** erkennbar (siehe §3). |
| **(D) Runtime-Inertheit** | Jeder Paket-Weg trägt im materialisierten SQL hart `status='needs_review'`, `activation_mode='manual'` (kein `auto`/`always_on`/`healthy`); mit dem Paket `prepared` liefert `model.isPathActive()` für **jeden** Weg `false`. | **Kein Crawl, kein Runtime-Effekt** bis zur expliziten Freigabe (siehe §4). |

Negativ-verifiziert (`scripts/quellenpaket-negativ-test.js`, 20 Fälle): verwaister Seed,
Registry-Eintrag ohne Artefakt, Paket ohne `paths()`/`packagePaths()`, doppelte Path-/Package-ID,
doppelter Slug/Canonical Key, URL mit/ohne Slash, http/https-Variante, gleiche Domain mit zwei
Publishern (ohne und mit Ausnahme), verlorene SQL-Zeile, veränderter Kommentar, destruktives
Statement, Upsert-Klassifikation, WBSB als registriertes/inaktives Paket, unbekannter Non-Catalog-Pfad,
CI-Report mit Git-SHA. Jeder Guard **muss** rot werden — ein grüner Guard bei fehlerhafter Eingabe
wäre ein blinder Test. Die Negativtests verändern **keine** Repository-Datei (nur Temp-/In-Memory).

### Was NICHT automatisch garantiert ist (ehrlich)

- **Die Garantien greifen nur bei einem VOLLSTÄNDIGEN Registry-Eintrag.** Ein neues Paket wird
  erst geprüft, wenn es als Registry-Eintrag existiert und alle Pflicht-Hooks trägt. Ein
  unregistriertes Paket ist nicht „automatisch sicher“ — es ist ungeprüft (und ein verwaister
  Non-Catalog-Pfad macht `source-architecture-test.js` rot).
- **Es gibt bewusst gepflegte manuelle Ausnahmen** (keine „alles-automatisch“-Behauptung):
  - die **Non-Architektur-Allowlist** (`NON_ARCHITECTURE_SEED_ALLOWLIST`) für Seeds, die
    nachweislich nicht zur Quellenarchitektur gehören (aktuell leer);
  - die **Shared-Domain-Ausnahmen** (`SHARED_DOMAIN_EXCEPTIONS`, Domain + Publisher + Begründung)
    für legitime geteilte Domains (aktuell leer).
  Jede Ausnahme ist explizit und begründet — solange eine besteht, gilt „alle Garantien greifen
  automatisch“ **nicht** uneingeschränkt.
- **Redirect-Dubletten** (zwei URLs, die live auf dasselbe Ziel weiterleiten) sind **offline
  nicht** erkennbar und daher **nicht** Teil der Kollisionsgarantie — sie gehören zur späteren
  **Live-Verifikation je Paket**.

## 3. Deterministische Ordnung: was sie leistet — und was nicht

Beide Generatoren sortieren jede Zeilengruppe **stabil** nach Primärschlüssel (Geografie
topologisch nach Ebene, dann ID). Das **reduziert Diff-Rauschen**: eine Modell-Umsortierung
oder parallele Paketarbeit erzeugt keine scheinbaren Umsortierungs-Drifts, und die
byte-für-byte-Reproduktion bleibt stabil.

**Deterministische Ordnung garantiert aber KEINE konfliktfreien Git-Merges.** Sobald zwei
Zweige denselben Basis-Seed regenerieren, dieselbe Registry, gemeinsame Entitäten/Publisher
oder gemeinsame Tests berühren, kann Git denselben Bereich beanspruchen — die Sortierung senkt
die Wahrscheinlichkeit, hebt den Konflikt aber nicht auf. Aussagen wie „konfliktfrei parallel“
oder „beliebig oft ohne Konflikte“ treffen **nicht** zu. Die verbindliche Regel steht in §6.

## 4. Warum ein neues Paket trotz Seed keinen Runtime-Effekt hat

**Diese Begründung gilt für jedes künftige Quellenpaket.** Ein Paket-Seed fügt Zeilen
ein, aber es wird **nichts** gecrawlt, weil drei Bedingungen zusammenkommen:

1. **Abrufweg-Status `needs_review` + `activation_mode='manual'`** — im generierten SQL
   **hart gesetzt** (nicht dem DB-Default `auto` überlassen). Kein `always_on`.
2. **Paket-Status `prepared`, nicht `active`** — `model.computePathRefcounts()` zählt nur
   Wege, die von **aktiven** Paketen benötigt werden. Ein `prepared`-Paket liefert für
   seine Wege einen **leeren** aktiven Refcount.
3. **`model.isPathActive(weg, refcount)`** ist damit `false`: nicht `always_on`, und
   `refcount.length === 0`.

Check (D) beweist Punkt 1 am SQL (nur die Paket-Zeilen — für WBSB die 11 Zeilen im Basis-Seed,
nicht die aktiven Basiswege) und Punkt 3 am kombinierten Post-Seed-Modell. **Runtime-Effekt
entsteht erst**, wenn ein Betreiber das Paket bewusst auf `active` setzt **und** die Wege nach
Prüfung freigibt — ein separater, freigabepflichtiger Schritt außerhalb des Seeds.

## 5. Maschinenlesbare Archivierung (§9-genaue Begriffe)

- **Erzeugung:** CI (`.github/workflows/ci.yml`, Job *offline-suite*) ruft
  `node scripts/quellenpaket-workflow-test.js --out quellenpaket-workflow-report.json --sha "$GITHUB_SHA"`,
  ergänzt `archived_at` (CI-Zeitstempel) und lädt die Datei als Artefakt
  `quellenpaket-workflow-nachweis` hoch (Retention 90 Tage). **Fail-closed:** keine veraltete
  Report-Datei wird wiederverwendet; stürzt das Prüfsystem vor dem JSON-Schreiben ab, erzeugt
  CI einen minimalen Fehlerbericht (ROT) und schlägt fehl; ein ROT-Verdikt lässt den Schritt
  fehlschlagen. Der Report enthält **nur** Prüfergebnisse + Zählwerte + Git-SHA — **keine**
  Secrets/Produktionsdaten.
- **Pro-Seed-Attribute (tatsächlich gemessen, nicht behauptet):**
  `reproducible` (Drift ok), `destructive_statements` (false), `mutation_mode`
  (`insert_only` | `upsert_update`), `expected_mutation_mode`, `runtime_inert` (Pakete).
  Beispiel: Basis-Seed `{ reproducible: true, destructive_statements: false,
  mutation_mode: "upsert_update", runtime_inert: null }`; Landesmodul-Seed
  `{ …, mutation_mode: "insert_only", runtime_inert: true }`.
- **`git_sha`** steht im Report (aus `--sha`/`GITHUB_SHA`); das Skript stempelt **keine** Zeit
  (`Date.now()`/`new Date()` bleiben außen vor) → reproduzierbar/sandbox-tauglich. Zeitstempel
  und Aufbewahrung liefert die CI.
- **`offline_limits.redirect_duplicates`** dokumentiert im Report selbst, dass Redirect-Dubletten
  offline nicht abgedeckt sind.
- **Quelle der Wahrheit:** Dieses Dokument zitiert nur Struktur; die konkreten Zahlen/das Urteil
  stehen im JSON-Report, nicht hier.

## 6. Verbindliche Parallelisierungsregel

Die deterministische Sortierung reduziert Diff-Rauschen. Sie **garantiert keine** konfliktfreien
Git-Merges. Daher gilt:

**Sicher parallel** (unabhängige Vorarbeit, keine geteilten Code-/Seed-Artefakte):
- Recherche
- Kandidatenlisten
- Quellenprüfung
- paketbezogene Dokumentation

**Nur mit Rebase und Serialisierung** (geteilte Artefakte — nacheinander, nicht gleichzeitig
mergen; vor dem Merge auf den aktuellen Stand rebasen und Verifikation erneut grün fahren):
- Code-Integration
- zentrale Registry (`scripts/quellenpaket-registry.js`)
- gemeinsame Entitäten
- gemeinsame Publisher
- gemeinsame Tests
- Basis-Seed-Regeneration
- Merge

## 7. Ein neues Quellenpaket hinzufügen (Rezept)

1. Modell/Seed-Daten des Pakets ergänzen (fachlich, außerhalb dieses Workflows).
2. Materialisierung wählen:
   - **eigenes Seed-Artefakt** (wie Landesmodul): Generator schreiben/erweitern
     (`scripts/generate-<paket>-seed.js`) — **muss** deterministisch sortieren und die
     Ausgabe rein aus dem Modell ableiten, **kein** Write-on-import;
   - **oder ins Basismodell injizieren** (wie WBSB via `catalog.js`): dann materialisiert der
     Basis-Seed die Zeilen (Registry-Feld `providedBySeed: "source-architecture"`, `inBaseModel: true`).
3. Seed generieren, committen (Artefakt, nicht von Hand editieren).
4. **Einen** Registry-Eintrag in `scripts/quellenpaket-registry.js` ergänzen:
   `kind: "package"`, `packageId`, `paths()`, `packagePaths()`, `publishers()`,
   `expectedMutationMode`, `inBaseModel`, sowie entweder `file`/`render`/`rollbackFile`
   (eigenes Artefakt) **oder** `providedBySeed` (Basis-Seed).
5. `node scripts/quellenpaket-workflow-test.js` grün? Dann greifen für das neue Paket
   Vollständigkeit, Drift-Freiheit, Nicht-Destruktivität + korrekter Mutationsmodus,
   Kollisionsfreiheit und Runtime-Inertheit. Kein Sonderfall, keine globalen Zahlen anzupassen.
6. Betrifft die Ergänzung geteilte Artefakte (Registry, Basis-Seed, gemeinsame Tests/Entitäten/
   Publisher): **§6 beachten** (Rebase + Serialisierung vor dem Merge).

## 8. CI-Gate und Branch Protection (ehrlich)

Der CI-Workflow läuft bei jedem Pull Request und Push auf `main`, schlägt bei negativem
Prüfergebnis fehl und erzeugt immer das maschinenlesbare Artefakt (fail-closed). **CI allein
blockiert einen Merge aber nicht** — dazu muss der Betreiber **einmalig Branch Protection**
aktivieren (GitHub → Settings → Branches): *Require status checks to pass* für „Syntax +
Offline-Suiten“ und „Browser-/Mobile-Smoke (Chromium)“, sowie *Require branches to be up to
date*. Dieser organisatorische Schritt ist per Code **nicht** erzwingbar.

## 9. Beteiligte Dateien

| Datei | Rolle |
|---|---|
| `scripts/quellenpaket-registry.js` | **Kanonische Registry** (Seeds ↔ Pakete), reine Helfer (Kollision/Vollständigkeit/Mutationsmodus) |
| `scripts/generate-source-architecture-seed.js` | Generator Basis-Seed (deterministisch, importierbar, kein Write-on-import) |
| `scripts/generate-landesmodul-seed.js` | Generator Paket-Seed (deterministisch) |
| `scripts/quellenpaket-workflow-test.js` | Kanonische P1-Verifikation (0, A–D) + JSON-Report |
| `scripts/quellenpaket-negativ-test.js` | 20 negative Beweise (Guards werden rot) |
| `scripts/source-architecture-test.js` | Modell-Invarianten (ohne harte globale Zahlen, §7-Non-Catalog-Klassifikation) |
| `scripts/landesmodul-seed-test.js` | Seed-Invarianten (Sollwerte aus Modell) |
| `.github/workflows/ci.yml` | CI-Gate + maschinenlesbares Nachweis-Artefakt (fail-closed) |
| `supabase/seeds/*_seed.sql` | generierte, reproduzierbare Artefakte |
