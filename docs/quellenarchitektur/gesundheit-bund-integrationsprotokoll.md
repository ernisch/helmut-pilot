# Integrationsprotokoll — Quellenpaket `gesundheit-bund`

**Datum:** 2026-07-24 · **Branch:** `claude/gesundheit-bund-validation-alf8de` · **Status:** prepared / INAKTIV

## Kennzahlen (aus `buildGesundheitBundSeed().summary`)
| Metrik | Wert |
|---|---|
| fachliche Kernquellen | 16 (14 neue Wege + Bundestag via Bestand + Destatis-2.Reihe via ein Weg) |
| Abrufwege (neu) | 14 |
| davon kritisch (`official_primary`) | 5 (BMG, Bundesrat, G-BA, BfArM, PEI) |
| aktive Abrufwege | **0** (alle needs_review + manual) |
| neue Herausgeber | 11 |
| wiederverwendete Herausgeber | 3 (BMG, Bundesrat, Destatis) |
| neue Entitäten | 11 |
| wiederverwendete Entitäten | 3 (ministry-bmg, parliament-bundesrat, statoffice-destatis) |
| Paketzuordnungen | 14 (alle → pkg-gesundheit-bund) |
| Frequenzklassen | ereignisnah 6 · regelmäßig 6 · periodisch 2 |

## Geänderte / neue Dateien
**Neu:**
- `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-quellen.js`
- `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-verifikation.js`
- `scripts/generate-gesundheit-bund-seed.js`
- `scripts/gesundheit-bund-seed-test.js`
- `supabase/seeds/20260724_gesundheit_bund_seed.sql` (+ `_rollback.sql`)
- `docs/quellenarchitektur/29-quellenpaket-gesundheit-bund.md`
- `docs/quellenarchitektur/gesundheit-bund-MANIFEST.md`
- `docs/quellenarchitektur/gesundheit-bund-integrationsprotokoll.md`

**Additiv geändert (minimal):**
- `lib/helmut/quellenarchitektur/seeds/packages.js` — Paketdefinition `pkg-gesundheit-bund` (prepared).
- `scripts/source-architecture-test.js` — Paketzähler 6→7 + prepared-Assertion (paketabhängiger Test, §8).
- `scripts/run-offline-tests.js` — DENYLIST += `generate-gesundheit-bund-seed.js` (Generator, kein Test).

**Bewusst NICHT geändert:** `catalog.js`, `model.js`, `profile-packages.js` (Mapping/Resolver),
`v1Sources`, Drei-Achsen-Methodik, Basis-Seed `20260713_source_architecture_seed.sql`
(war bereits gegenüber dem Generator gedriftet — kein Mitschleifen fremder Diffs).

## Architekturentscheidung
Standalone-Seed nach dem **Landesmodul-Muster** (`landesmodule-quellen.js`): eigenes Modul +
eigener Generator + eigenes Seed-SQL. Nur die **Paketdefinition** liegt in `PACKAGE_DEFINITIONS`
(Modell-Sichtbarkeit). Der Seed ist **nicht** in `buildFullModel`/`catalog` verdrahtet →
`buildFullModel().publishers` bleibt bei 51, kein Eingriff in den Live-Katalog. Begründung:
maximale Isolation, keine Duplikation, keine neue Architektur.

## Verifikation
- **Ebene 1 (Recherche, WebSearch):** 12 belegt, 1 belegt_mit_migrationsrisiko (RKI), 2 teilbelegt.
- **Ebene 2 (Byte-genau):** OFFEN — Sandbox-Egress gesperrt (example.com CONNECT → 403; curl **und**
  WebFetch blockiert). Nachzuholen über offenen Egress-Runner (Muster `sprint9b-verify.yml`).

## Tests
- `node scripts/gesundheit-bund-seed-test.js` → **58 PASS, 0 FAIL**.
- `node scripts/run-offline-tests.js` → **141/141 Suiten grün**.
- Betroffen & grün: source-architecture (92), profile-packages (62), admin-source-report (54),
  landesmodul-seed (18).

## Egress-Verifikationslauf (Vorlage, freigabepflichtig)
Byte-genaue Prüfung NICHT in dieser Sandbox möglich. Vorgehen (separater Schritt):
1. Verifikationsskript nach Muster `scripts/sprint9b-verify-abrufwege.js` gegen die 14 URLs
   (HTTP-Status, Redirect, Content-Type, Feed-Parsebarkeit, Paywall/Bot, dauerhafte URL).
2. Über GitHub-Actions-Runner mit offenem Egress ausführen (Muster `sprint9b-verify.yml`).
3. Urteile in `gesundheit-bund-verifikation.js` (Byte-Ebene) eintragen — **erst dann** Aktivierung.
