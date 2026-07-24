# Workflow-Konsolidierung — Protokoll

Stand: 2026-07-24 · Branch `claude/quellenpaket-workflow-konsolidierung-7nqp04` (von `main`).

Dieser Sprint vereinigt den **Piloten `wohnen-bauen-stadtentwicklung-bund` (WBSB)** und die
**Quellenpaket-Workflow-Härtung** auf einem gemeinsamen Branch und behebt die verbliebenen
P1-Probleme. **Ausschließlich Workflow- und Integrations-Sprint** — keine neue Quellenrecherche,
keine fachliche Überarbeitung des Wohnungs-Pakets, **keine Aktivierung**.

---

## 1. Ausgangsbranches und Commits (gegen die reale Git-Historie verifiziert)

`main` = `035898b` (Merge #114). Beide Quellbranches waren sauber auf diesem `main` basiert
(gemeinsame Merge-Basis `035898b`, keine fachfremden Zusatz-Commits).

**Pilot-Branch** `claude/pilot-wohnen-bauen-stadtentwicklung-f64fix` (@ `05f9b574`), 4 Commits
— exakt die auditierten Referenzen:

| Original | Betreff |
|---|---|
| `bad951b` | Pilot WBSB: Verifikations-Skript + Offline-Selbsttest (WIP) |
| `cb9cb33` | Pilot WBSB: Kandidaten-Seed (28 reale URLs) + CI-Verifikations-Workflow |
| `923c902` | Pilot WBSB: Pflichtkern (11 verifizierte Quellen) in Quellenarchitektur + Seed-SQL |
| `05f9b57` | Pilot WBSB: Dokumentation (Rechercheprotokoll, Quellenprüfung-CSV, Implementierungsprotokoll) |

**Workflow-Härtungs-Branch** `claude/workflow-p1-fixes-tf0q1a` (@ `b83f776`), 1 Commit
— exakt die auditierte Referenz:

| Original | Betreff |
|---|---|
| `b83f776` | P1-Workflow-Haertung: Quellenpaket-Seed rein additiv technisch garantieren |

Alle fünf Referenzen wurden gegen `git log`/`git ls-remote` bestätigt (nicht aus Abschluss-
berichten übernommen).

## 2. Übernahme (kontrollierte Git-Strategie: Cherry-Pick)

Reihenfolge: zuerst die 4 Pilot-Commits (chronologisch), dann der Härtungs-Commit — so
konzentrieren sich die Konflikte in **einem** Cherry-Pick.

| Neuer Commit | Herkunft | Inhalt |
|---|---|---|
| `e5fda15` | ⟵ `bad951b` | Pilot Verifikations-Skript (sauber) |
| `76fe28d` | ⟵ `cb9cb33` | Pilot Kandidaten-Seed + CI-Verify (sauber) |
| `344a05e` | ⟵ `923c902` | Pilot Pflichtkern (sauber) |
| `ce986be` | ⟵ `05f9b57` | Pilot Doku (sauber) |
| `9a0632b` | ⟵ `b83f776` | Workflow-Härtung — **2 Konflikte gelöst** (siehe §3) |

Anschließend die eigentliche Konsolidierungs-Härtung als **separate** Commits (klare Provenienz):

| Commit | Inhalt |
|---|---|
| `831feed` | Konsolidierung P1: kanonische Registry, generische Kollision, Fail-Closed, §7-Invariante, §9-Modus, §8-Zahlen, §13-Negativtests |
| `11ee07e` | Konsolidierung: CI-Bericht fail-closed (§11) + Workflow-Doku korrigiert (§12) |
| *(dieser Commit)* | Konsolidierungs-Protokoll (§16) |

## 3. Merge-Konflikte und ihre Auflösung

Nur die **zwei bekannten** Dateien kollidierten (bestätigt: Schnittmenge der von beiden
Branches berührten Dateien).

### A. `supabase/seeds/20260713_source_architecture_seed.sql`
- **Ursache:** Der Pilot fügte 47 Zeilen WBSB in das **alte** Seed-Format ein; die Härtung
  regenerierte die **ganze** Datei deterministisch (Sortierung + `DO UPDATE`-Upserts).
- **Auflösung:** **Regeneration über den vorgesehenen Generator** (§10-konform). Der Generator
  liest `buildFullModel()`, das WBSB via `catalog.js` bereits enthält — die regenerierte Datei
  vereint deterministisch das gehärtete Format **und** die 11 WBSB-Zeilen. Weder Pilot noch
  Härtung gingen verloren. Ergebnis: 50 Geografien, 72 Entitäten, 56 Herausgeber, **155**
  Abrufwege (144 Legacy + 11 WBSB), 7 Pakete, 156 Paketzuordnungen.

### B. `scripts/source-architecture-test.js`
- **Ursache:** Beide Seiten änderten die Migrations-/Vollständigkeitsprüfungen. Der Kern-Konflikt:
  die Härtung führte die Invariante `nonCatalogPaths.every(p => p.legacy_source_id === "dip")`
  ein — **unvereinbar** mit WBSB, dessen Wege Non-Catalog sind (`legacy_source_id = "wbsb-*"`),
  aber **nicht** DIP.
- **Auflösung (fachlich korrekte Invariante, §7):** Die Härtungs-Verbesserungen (dynamische
  Sollwerte statt harter `143/144/145`) wurden übernommen **und** die dip-only-Annahme durch
  eine **Klassifikation** ersetzt: jeder Non-Catalog-Weg ist genau eines von
  `explicit` (DIP), `registered_package` (WBSB — Pfad eines registrierten, vorbereiteten Pakets)
  oder `orphan` (unbekannt/verwaist → **Test ROT**). Zusätzlich blieben die WBSB-spezifischen
  Pilot-Prüfungen erhalten. WBSB besteht die Prüfung als **registriertes Paket**, nicht als Legacy.

Zwischenschritt-Sauberkeit: der Cherry-Pick `9a0632b` löste den §7-Konflikt zunächst
**self-contained** (Klassifikation aus `PACKAGE_DEFINITIONS`, ohne Fremdmodul, grün); der
Folge-Commit `831feed` hob dies auf die **gemeinsame Registry** (mit zusätzlicher „registriert +
Generator vorhanden“-Garantie).

## 4. Veränderte Dateien (25, gegen `main`)

- **Pilot (neu):** `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung.js`,
  `…/wohnen-bauen-stadtentwicklung-kandidaten.js`, `scripts/wohnen-bauen-stadtentwicklung-verify.js`,
  `…-verify-test.js`, `.github/workflows/wohnen-bauen-stadtentwicklung-verify.yml`,
  `docs/quellen/wohnen-bauen-stadtentwicklung-bund/{rechercheprotokoll.md,quellenpruefung.csv,implementierungsprotokoll.md}`.
- **Pilot (erweitert):** `lib/helmut/quellenarchitektur/catalog.js` (WBSB additiv einmischen),
  `…/seeds/entities.js` (3 Entitäten), `…/seeds/packages.js` (1 Paket).
- **Härtung:** `scripts/generate-source-architecture-seed.js`, `scripts/generate-landesmodul-seed.js`,
  `supabase/seeds/20260717_landesmodul_be_bb_seed{,_rollback}.sql`.
- **Konsolidierung (neu):** `scripts/quellenpaket-registry.js`, `scripts/quellenpaket-negativ-test.js`,
  `docs/quellenarchitektur/quellenpaket-workflow.md`, dieses Protokoll.
- **Konsolidierung (erweitert):** `scripts/quellenpaket-workflow-test.js`, `scripts/source-architecture-test.js`,
  `scripts/landesmodul-seed-test.js`, `scripts/admin-source-report-test.js`,
  `scripts/sprint6-pilot-migration-test.js`, `.github/workflows/ci.yml`,
  `supabase/seeds/20260713_source_architecture_seed.sql` (regeneriert).

## 5. Registry-Struktur (`scripts/quellenpaket-registry.js`)

Single Source of Truth, drei Einträge:

| key | kind | Artefakt | Modus | inBaseModel | Paket-Hooks |
|---|---|---|---|---|---|
| `source-architecture` | base | `20260713_source_architecture_seed.sql` | `upsert_update` | — | (enthält WBSB eingebettet) |
| `landesmodul-be-bb` | package | `20260717_landesmodul_be_bb_seed.sql` (+ Rollback) | `insert_only` | `false` | paths/packagePaths/publishers/entities |
| `wohnen-bauen-stadtentwicklung-bund` | package | `providedBySeed` → Basis-Seed | `upsert_update` | `true` | paths/packagePaths/publishers |

Weitere Registry-Strukturen: `NON_ARCHITECTURE_SEED_ALLOWLIST` (aktuell **leer** — alle Seeds
gehören zur Architektur), `SHARED_DOMAIN_EXCEPTIONS` (aktuell **leer** — jede Domain gehört
genau einem Herausgeber). Beide sind explizit dokumentiert und werden bei Bedarf begründet gefüllt.

## 6. Geprüfte Seed-Artefakte (Registry ↔ Artefakt-Abgleich)

Gefunden unter `supabase/seeds/`: **3** Dateien — alle registriert, keine verwaist, kein
Registry-Eintrag ohne Artefakt.

| Datei | Registrierung | reproduzierbar | destruktiv | Modus (gemessen) | runtime_inert |
|---|---|---|---|---|---|
| `20260713_source_architecture_seed.sql` | `source-architecture` (render) | ja | nein | `upsert_update` | n/a (aktive Grundversorgung) |
| `20260717_landesmodul_be_bb_seed.sql` | `landesmodul-be-bb` (render) | ja | nein | `insert_only` | **true** |
| `20260717_landesmodul_be_bb_seed_rollback.sql` | `landesmodul-be-bb` (renderRollback) | ja | *(Rollback — bewusst destruktiv, guarded delete)* | — | — |

WBSB ist über den `source-architecture`-Basis-Seed materialisiert (11 Zeilen, drift-geprüft)
**und** als eigener Paket-Eintrag registriert — in der Prüfung tatsächlich enthalten.

## 7. Neue Sicherheitsinvarianten

- **§4 Fail-Closed-Vollständigkeit:** jeder Seed registriert **oder** begründet allowlisted;
  jeder Registry-Eintrag zeigt auf ein vorhandenes Artefakt. Verwaister Seed / fehlendes
  Artefakt → ROT.
- **§5 strikte Paket-Registry:** `kind:"package"` ohne `packageId`/`paths()`/`packagePaths()`/
  `publishers()`/Generator/Zielartefakt → ROT. Keine stillen `if (entry.paths)`-Überspringungen.
- **§6 paketgenerische Kollision** über die Vereinigung (Basis + alle separaten Paket-Seeds;
  `inBaseModel`-Pakete nicht doppelt gezählt): eindeutige Path-/Package-/Entity-IDs, Paket-Slugs,
  (scoped) Canonical Keys, `publisher_id → genau eine Domain`, `Domain → genau ein Herausgeber`
  (außer begründete Ausnahme), URL-Dublette über schema-insensitiven Schlüssel
  (`www`/Trailing-Slash/Tracking/Query-Reihenfolge/**http↔https**). Sonderfall
  `if (entry.key !== "landesmodul-be-bb")` **entfernt**.
- **§7 Non-Catalog-Klassifikation:** Legacy / DIP / registriertes Paket / verwaist; Orphan → ROT.
- **§9 gemessener Mutationsmodus** je Seed (nicht behauptet): `insert_only` vs. `upsert_update`,
  gegen den erwarteten geprüft; Report-Felder `reproducible`/`destructive_statements`/
  `mutation_mode`/`runtime_inert`.
- **§11 Fehlerbericht-Absicherung:** Absturz vor JSON-Write → minimaler roter Report, Exit 1.

## 8. Negative Tests (`scripts/quellenpaket-negativ-test.js`, 20 Fälle → 35 Checks, alle grün)

Nur Temp-/In-Memory-Daten, **keine** Repository-Datei verändert (Temp-Dir wird aufgeräumt).
Bewiesen: (1) verwaiste Seed-Datei → ROT, (2) Registry-Eintrag ohne Artefakt → ROT,
(3) Paket ohne `paths()` → ROT, (4) Paket ohne `packagePaths()` → ROT, (5) doppelte Path-ID,
(6) doppelte Package-ID, (7) doppelter Slug, (8) doppelter Canonical Key (+ Gegenprobe:
gleicher Key/andere Geografie = grün), (9) URL mit/ohne Slash, (10) http/https (+ www/Tracking/
Query-Reihenfolge), (11) gleiche Domain zwei Publisher ohne Ausnahme → ROT, (12) mit begründeter
Ausnahme → grün (+ unvollständige Ausnahme = ROT), (13) verlorene SQL-Zeile → Drift,
(14) veränderter Kommentar → Drift, (15) destruktives Statement/destruktive CTE → ROT,
(16) Upsert korrekt als `upsert_update` / Landesmodul `insert_only`, (17) WBSB als registriertes
Paket erkannt, (18) WBSB-Wege inaktiv (Modell + Refcount), (19) unbekannter Non-Catalog-Pfad →
Orphan, (20) CI-Report enthält Git-SHA + echtes Ergebnis + §9-Schema.

## 9. Ausgeführte Testläufe (echte Ergebnisse — nichts von Hand erfunden)

| Lauf | Ergebnis |
|---|---|
| Syntaxprüfung aller geänderten JS-Dateien (`node --check`) | 16/16 OK |
| `source-architecture-test.js` | 106 PASS, 0 FAIL |
| `quellenpaket-workflow-test.js` | 30 PASS, 0 FAIL |
| `quellenpaket-negativ-test.js` | 35 PASS, 0 FAIL |
| `landesmodul-seed-test.js` | alle grün (18 Wege) |
| `admin-source-report-test.js` | 54 PASS, 0 FAIL |
| `sprint6-pilot-migration-test.js` | 46 PASS, 0 FAIL |
| `wohnen-bauen-stadtentwicklung-verify-test.js` | 14 PASS, 0 FAIL |
| **Vollständige Offline-Suite** (`run-offline-tests.js`) | **143/143 Suiten grün** |

## 10. Ergebnis der Seed-Regeneration

- Basis-Seed und Landesmodul-Seed regeneriert → `git status` **sauber** (committete Artefakte
  sind byte-identisch zum Generator).
- **Zweite** Regeneration → `diff` gegen erste: **byte-identisch** (Basis, Landesmodul, Rollback).
- Kein `Date.now()`/`Math.random()`/`new Date()` in Generatoren/Registry (nur in Doku-Kommentaren
  benannt). **Kein Write-on-import**: Module-`require` schreibt nichts (git status bleibt sauber);
  Generatoren schreiben nur bei direktem Aufruf (`require.main === module`).
- **Git-Diff-Prüfung:** gegenüber `main` **keine** gelöschte Quelle/Herausgeber/Paket-ID; die
  einzigen Zuwächse sind exakt WBSB (1 Paket + 5 neue Herausgeber + 11 `rp-wbsb-*` Wege;
  destatis.de/bundestag.de wiederverwendet).

## 11. Bestätigte Runtime-Inaktivität (WBSB)

- Paketstatus **`prepared`** (nicht `active`), `is_base=false`, Ebene `bund`.
- 11 Abrufwege: **alle** `status='needs_review'` + `activation_mode='manual'`; **kein**
  `is_critical`, **kein** `always_on`/`auto`.
- `model.isPathActive()` = **false** für alle 11 Wege (0 aktive Wege).
- **Kein Profil-Mapping** (`packageKeysForSource` ordnet WBSB nicht automatisch zu).
- Kein aktiver Crawl-Plan, keine Produktionsaktivierung. Freigabe ist ein separater,
  freigabepflichtiger Schritt außerhalb dieses Sprints.

## 12. Weiterhin bestehende Grenzen (ehrlich)

- **Redirect-Dubletten** sind **offline nicht** erkennbar → Teil der späteren Live-Verifikation
  je Paket (auch im Report-Feld `offline_limits.redirect_duplicates` dokumentiert). Es wird
  **nicht** behauptet, sie seien automatisch ausgeschlossen.
- **Branch Protection** ist per Code **nicht** erzwingbar — CI schlägt bei Fehlern fehl und
  erzeugt den Nachweis, aber das Merge-Blocking muss der Betreiber einmalig als Branch-Protection-
  Regel aktivieren (organisatorischer Schritt, in CI-Header + Workflow-Doku dokumentiert).
- **Manuelle Ausnahmen** (Non-Architektur-Allowlist, Shared-Domain-Ausnahmen) sind bewusst
  gepflegt — „alle Garantien greifen automatisch“ gilt daher **nicht** uneingeschränkt.
- **Fachliche** Korrektheit des WBSB-Pakets ist **nicht** Gegenstand dieses Sprints (erfolgt in
  einem separaten Sprint nach Read-only-Audit dieses Stands).

## 13. Verbindliche Parallelisierungsregeln

**Sicher parallel:** Recherche · Kandidatenlisten · Quellenprüfung · paketbezogene Dokumentation.

**Nur mit Rebase und Serialisierung:** Code-Integration · zentrale Registry · gemeinsame
Entitäten · gemeinsame Publisher · gemeinsame Tests · Basis-Seed-Regeneration · Merge.

Die deterministische Sortierung **reduziert Diff-Rauschen**, **garantiert aber keine**
konfliktfreien Git-Merges. Aussagen wie „konfliktfrei parallel“ / „beliebig oft ohne Konflikte“
treffen nicht zu.
