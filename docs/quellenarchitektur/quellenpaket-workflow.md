# Quellenpaket-Workflow — wiederverwendbarer, additiv garantierter Ablauf

Stand: 2026-07-24 · Gilt für **alle** Quellenpakete (Landesmodule, Fachpakete wie
„Wohnen, Bauen und Stadtentwicklung“, künftige Pakete).

Dieser Bericht beschreibt den gehärteten Workflow, mit dem ein neues Quellenpaket in
Seed-SQL überführt wird, **ohne** Bestandsdaten zu verändern und **ohne** Runtime-Effekt
bis zur ausdrücklichen Freigabe. Er ist die kanonische Referenz nach der P1-Workflow-Härtung.

> **Kein Ergebnis in diesem Dokument ist handgeschrieben.** Die Zahlen und das Urteil
> stammen aus dem Script-Output von `scripts/quellenpaket-workflow-test.js` (JSON via
> `--out`), das im CI erzeugt und als Artefakt archiviert wird. Ändert sich das Modell,
> ändert sich der Report — nicht dieser Text.

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
Drift-/Additivitäts-Check (scripts/quellenpaket-workflow-test.js)
   │   byte-für-byte-Reproduktion + rein-additiv + Kollision + Runtime-Inertheit
   ▼
CI-Gate + maschinenlesbares JSON-Artefakt (.github/workflows/ci.yml)
   │
   ▼
Dokumentation (dieses Dokument, aus dem Report gespeist)
```

## 2. Die vier Garantien (technisch, nicht behauptet)

`scripts/quellenpaket-workflow-test.js` läuft in der Offline-Suite (CI-Gate) und erzeugt
zusätzlich einen JSON-Report. Es prüft **die gesamte erzeugte Ausgabe** — Datenzeilen,
Reihenfolge, Kommentare, Leerraum — nicht nur Datenzeilen.

| Garantie | Was geprüft wird | Warum das „rein additiv“ beweist |
|---|---|---|
| **(A) Drift / Reproduzierbarkeit** | Jede committete Seed-Datei (inkl. Rollback) ist **byte-für-byte** aus ihrem Generator reproduzierbar. | Erkennt entfernte, verschobene, geänderte Zeilen, **verlorene Kommentare** und jeden Handedit. Das committete Artefakt ist damit beweisbar exakt das Modell. |
| **(B) Additivität** | Jede Seed-Anweisung ist ein additives Upsert (`insert … on conflict do nothing`/`do update`). **Kein** `delete`/`drop`/`truncate`/`alter`, **kein** `update` außerhalb `do update set`. | „rein additiv“ ist über die ganze Datei bewiesen — ein destruktives Statement lässt den Check rot werden. |
| **(C) Domain-/URL-Kollision** | Kein Abrufweg-URL kollidiert über **ALLE** Retrieval Paths (Basismodell **+ jedes** Paket-Seed), Path-IDs eindeutig, jede Herausgeber-Domain gehört genau einem Herausgeber. | Ein neues Paket kann keine bestehende Quelle doppelt crawlen oder eine ID recyceln — geprüft gegen die **Vereinigung**, nicht nur das neue Paket. |
| **(D) Runtime-Inertheit** | Ein neues Paket-Seed setzt jeden Abrufweg hart auf `status='needs_review'`, `activation_mode='manual'`; mit dem Paket im Status `prepared` liefert `model.isPathActive()` für **jeden** neuen Weg `false`. | Beweist: **kein Crawl, kein Runtime-Effekt** bis zur expliziten Freigabe (siehe §4). |

Negativ-verifiziert: Entfernt man testweise eine Datenzeile **oder** eine Kommentarzeile
aus einem committeten Seed, wird der Drift-Check rot (Exit 1) und nennt die erste
abweichende Zeile.

## 3. Warum es kein hartes „genau ein neues Paket“ mehr gibt

- **Registry statt Sonderfall:** `quellenpaket-workflow-test.js` iteriert über eine
  `REGISTRY` von Generator→Artefakt-Paaren. Ein neues Paket = **ein** Registry-Eintrag;
  alle vier Garantien greifen automatisch. Nichts im Workflow setzt voraus, dass genau
  ein neues Paket existiert — er prüft `N` Seeds gleichartig.
- **Sollwerte aus dem Modell abgeleitet:** Die globalen Tests (`source-architecture-test.js`,
  `landesmodul-seed-test.js`) enthalten **keine** harten globalen Gesamtzahlen mehr
  (früher `144`/`145`/`6`/`18`…). Statt `=== 144` prüfen sie **Invarianten**: gültige
  Referenzen, keine Doppel-Links, kein verwaister Weg, `Paketzahl === PACKAGE_DEFINITIONS`,
  `path_expected_* === retrievalPaths.length`. Fügt jemand ein Paket hinzu, bleiben die
  Tests grün, solange die Struktur stimmt — sie fallen nur bei echten Fehlern.
- **Deterministische Ordnung → wenig Merge-Konflikte:** Beide Generatoren sortieren jede
  Zeilengruppe stabil nach Primärschlüssel (Geografie topologisch nach Ebene, dann ID).
  Parallele Paketarbeit erzeugt dadurch Diffs, die einander nicht umsortieren; die
  byte-für-byte-Reproduktion ist stabil gegen Modell-Umsortierungen.

### Warum deterministische Ordnung statt reinem „append-only“

„Append-only“ (neue Zeilen nur anhängen) hält Diffs klein, **verhindert aber
Merge-Konflikte nicht**: sobald zwei Zweige an dieselbe Datei anhängen oder das Modell
umsortiert, entsteht scheinbarer Drift. Die **robustere** Variante ist eine deterministische
Gesamtordnung nach ID: reihenfolge-unabhängig, reproduzierbar, und zwei parallel ergänzte
Pakete interleaven konfliktfrei nach ID. Sie ist implementiert; „append-only“ ist damit
abgelöst.

## 4. Warum ein neues Paket trotz Seed keinen Runtime-Effekt hat

**Diese Begründung gilt für jedes künftige Quellenpaket.** Ein Paket-Seed fügt Zeilen
ein, aber es wird **nichts** gecrawlt, weil drei Bedingungen zusammenkommen:

1. **Abrufweg-Status `needs_review` + `activation_mode='manual'`** — im generierten SQL
   **hart gesetzt** (nicht dem DB-Default `auto` überlassen). Kein `always_on`.
2. **Paket-Status `prepared`, nicht `active`** — `model.computePathRefcounts()` zählt nur
   Wege, die von **aktiven** Paketen benötigt werden. Ein `prepared`-Paket liefert für
   seine Wege einen **leeren** aktiven Refcount.
3. **`model.isPathActive(weg, refcount)`** ist damit `false`: nicht `always_on`, und
   `refcount.length === 0`. Ein Weg ist nur dann technisch aktiv (→ Crawl), wenn ihn
   mindestens ein **aktives** Paket benötigt oder er `always_on` ist — beides trifft für
   frisch geseedete Paket-Wege nicht zu.

Der Check (D) beweist Punkt 1 am SQL und Punkt 3 am Modell (kombiniertes Post-Seed-Modell,
`isPathActive() === false` für jeden neuen Weg). **Runtime-Effekt entsteht erst**, wenn ein
Betreiber das Paket bewusst auf `active` setzt **und** die Wege nach Prüfung freigibt
(Status/Activation ändert) — ein separater, freigabepflichtiger Schritt außerhalb des Seeds.

## 5. Maschinenlesbare Archivierung

- **Erzeugung:** CI (`.github/workflows/ci.yml`, Job *offline-suite*) ruft
  `node scripts/quellenpaket-workflow-test.js --out quellenpaket-workflow-report.json`,
  ergänzt `archivedAt` (CI-Zeitstempel) + `gitSha` und lädt die Datei als Artefakt
  `quellenpaket-workflow-nachweis` hoch (Retention 90 Tage).
- **Warum der Zeitstempel im CI gesetzt wird:** Das Skript selbst stempelt nicht
  (`Date.now()`/`new Date()` bleiben außen vor) — so ist der Report reproduzierbar und
  sandbox-tauglich; die Nachvollziehbarkeit (Wann? Welcher Commit?) fügt die CI hinzu.
- **Quelle der Wahrheit:** Dieses Dokument zitiert nur Struktur; die konkreten Zahlen/das
  Urteil stehen im JSON-Report, nicht hier.

## 6. Ein neues Quellenpaket hinzufügen (Rezept)

1. Modell/Seed-Daten des Pakets ergänzen (fachlich, außerhalb dieses Workflows).
2. Generator schreiben oder erweitern (`scripts/generate-<paket>-seed.js`) — **muss**
   deterministisch sortieren und die Ausgabe rein aus dem Modell ableiten.
3. Seed generieren, committen (Artefakt, nicht von Hand editieren).
4. **Einen** Registry-Eintrag in `scripts/quellenpaket-workflow-test.js` ergänzen
   (`kind: "package"`, `file`, `render`, ggf. `rollbackFile`/`paths`/`packagePaths`).
5. `node scripts/quellenpaket-workflow-test.js` grün? Dann garantiert der Workflow für das
   neue Paket automatisch Drift-Freiheit, Additivität, Kollisionsfreiheit und
   Runtime-Inertheit. Kein Sonderfall, keine globalen Zahlen anzupassen.

## 7. Beteiligte Dateien

| Datei | Rolle |
|---|---|
| `scripts/generate-source-architecture-seed.js` | Generator Basis-Seed (deterministisch, importierbar) |
| `scripts/generate-landesmodul-seed.js` | Generator Paket-Seed (deterministisch) |
| `scripts/quellenpaket-workflow-test.js` | Kanonische P1-Verifikation (A–D) + JSON-Report |
| `scripts/source-architecture-test.js` | Modell-Invarianten (ohne harte globale Zahlen) |
| `scripts/landesmodul-seed-test.js` | Seed-Invarianten (Sollwerte aus Modell) |
| `.github/workflows/ci.yml` | CI-Gate + maschinenlesbares Nachweis-Artefakt |
| `supabase/seeds/*_seed.sql` | generierte, reproduzierbare Artefakte |
