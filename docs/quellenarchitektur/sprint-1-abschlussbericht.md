# Sprint 1 — Abschlussbericht (Relationales Quellen-Fundament)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible Arbeiten — **keine** Production-Änderung.

## 1. Was analysiert wurde (Phase 0/1)

Vollständige, am echten Code und an den echten Prod-Daten belegte Ist-Aufnahme des V3-Datenmotors
(10 parallele Subsystem-Analysen + Synthese), plus vollständige Auswertung der gelieferten
`quellen-audit.csv` (157 Zeilen) und der vier Berichte. Ergebnis: `00-ist-architektur-und-abweichungen.md`
(Ist-Architektur, Abweichungsliste hoch/mittel/niedrig, Risiken, freigaberelevante Fragen) und
`01-sprintplan.md` (10 abhängigkeitsgetriebene Sprints).

**Alle 13 Auftrags-Eckdaten wurden verifiziert** (u. a. 144 Quellen + 13 Orphans; 6 defekte / 3 gesunde
Direkt-Feeds — nicht „7"; `political_level` bei allen 231 KOs leer; Berlin/Brandenburg 0 Quellen).

## 2. Was vorher falsch oder riskant war (Auszug, Kern-Blocker)

- Herausgeber, Abrufweg und Paket waren in einem flachen Objekt verschmolzen; Google News wurde als
  „Herausgeber" behandelt; der Katalog lag hartkodiert im Code, die DB-Tabelle `sources` war tot.
- Kein Paket-/Aktivierungs-/Referenzzählungs-Konzept → jedes Profil würde geteilte Quellen erneut
  crawlen (SaaS-Kostenrisiko).
- Kuratierung kürzt Regional-/Landesquellen an einer Prioritätsschwelle + doppeltem Social-Gate weg →
  Berlin/Brandenburg strukturell unversorgt.

## 3. Was Sprint 1 umgesetzt hat (relationales Fundament)

Die **Wurzelabhängigkeit** aller weiteren Arbeit — sauber getrennte Ebenen Herausgeber ·
Abrufweg · Paket + zentrale Geografie- und Entitätsschicht, **additiv** und als
**Kompatibilitätsschicht** (Live-Verhalten unverändert).

### Neue/geänderte Artefakte
| Datei | Inhalt |
|---|---|
| `lib/helmut/quellenarchitektur/model.js` | Enums + reine Logik (URL-Normalisierung, Inhaltsfingerabdruck, Methoden-/Belegfunktions-Klassifikation, Statuswechsel, Referenzzählung) |
| `lib/helmut/quellenarchitektur/catalog.js` | Katalog-Mapper: 144 Quellen + 13 Orphans + DIP → Herausgeber/Abrufwege/Pakete (verlustfrei) |
| `lib/helmut/quellenarchitektur/seeds/{geographies,entities,packages,publishers}.js` | 50 Geografien, 69 Entitäten, 7 Pakete, Herausgeber-Namensregister |
| `lib/helmut/quellenarchitektur/index.js` | Aggregator (`buildFullModel`) |
| `supabase/migrations/20260713_source_architecture.sql` (+ `_rollback`) | 11 global geteilte Tabellen, RLS-konform, **nicht angewendet** |
| `supabase/seeds/20260713_source_architecture_seed.sql` | generierte, idempotente Seed-SQL |
| `scripts/source-architecture-test.js` | 86 Tests (Unit/Integration/Migration/Edge-Case) |
| `scripts/generate-source-architecture-seed.js` | Seed-SQL-Generator |
| `docs/quellenarchitektur/00–03, sprint-1-abschlussbericht.md` | Ist-Architektur, Sprintplan, Zielmodell, Datenmodell/Migration, dieser Bericht |

### Kernergebnisse (per Test verifiziert)
- **Herausgeber existiert einmal:** 145 Abrufwege → 51 Herausgeber (Dedup nach Domain); BMAS = 1
  Herausgeber, 2 Abrufwege.
- **Abrufwege getrennt & global 1× crawlbar:** m:n Paket↔Abrufweg + Referenzzählung; `dev_only` löst
  nie einen Crawl aus; `always_on` für Bund Basis/kritische Quellen.
- **Google News = Suchweg:** 91 Themensuchen am Aggregator, `site:`-Suchen am echten Herausgeber.
- **144 + 13 vollständig behandelt:** 0 unzugeordnet; 8 Legacy- + 4 Test-Orphans + DIP klassifiziert.
- **Bund/Land/EU/Kommune + Geografie:** 5-stufiger Ebenen-Enum; 16 Länder strukturell; Berlin (12
  Bezirke) + Brandenburg (18 Kreise/Städte) vertieft; Wahlkreis separat.
- **Pilot-Schutz:** gesunde Bundesquellen (DLF/Tagesschau/BMAS) erhalten; 6 defekte Pflicht-Direktfeeds
  sichtbar als `broken` + `is_critical` (nicht still archiviert).

## 4. Testergebnis
- **`npm run test:source-architecture`: 86 PASS, 0 FAIL.**
- Regression: repräsentative Offline-Suite grün (profile-validation 32, matching-norm 20, llm-budget
  22, watchdog-state 43, profile-completeness 46).
- `node --check` grün für alle neuen Dateien; `package.json` valide.

## 5. Sicherheit, Mandantentrennung, Kosten, Performance
- **Sicherheit/Mandanten:** neue Tabellen global geteilt (keine Tenant-Spalte), RLS aktiviert
  (Lesen für `authenticated`, Schreiben nur `service_role`) — keine bestehende Policy geändert.
- **Kosten:** keine — reine Struktur/Seeds/Tests, kein Crawl, keine KI, kein DB-Write auf Prod.
- **Performance:** keine Live-Pfad-Änderung; das Modell wird lazy per `require` geladen und ist
  nicht im App-Start/Read-Pfad verdrahtet.

## 6. Offene Risiken / noch nicht ausgeführte Production-Schritte (freigabepflichtig)
1. **Migration `20260713_source_architecture.sql` auf Production anwenden** — Grund: das relationale
   Fundament aktivieren. Risiko: additiv, minimal (keine Bestandstabelle betroffen). Rollback:
   `…_rollback.sql`. **DB-Validierung der Migration erfolgt im Zuge dieser Freigabe** (Dev-Umgebung
   hat kein Live-Supabase).
2. **Seed-Daten laden** (`…_seed.sql`) — nach Schritt 1.

Beides ist **vorbereitet, aber nicht ausgeführt.** Keine weiteren freigabepflichtigen Schritte in
Sprint 1 (keine Cron-/RLS-Scharfschaltung/neue Quellen/Kosten).

## 7. Nächster Sprint
**Sprint 2 — KO-Klassifikation (Ebene/Geografie/Entität) in Understanding:** `decision_level`,
`affected_geographies`, `decision_entities` etc. in den einen Understanding-Call ziehen,
Whitelist-Falle beheben, Embedding write-time persistieren. Setzt auf den in Sprint 1 gebauten
Geografie-/Entitäts-Tabellen auf.

> Admin-Screenshots (§44) folgen in Sprint 8 (Admin-Oberfläche) — in Sprint 1 gibt es bewusst keine
> UI-Änderung.
