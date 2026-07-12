# Profil-Vollständigkeit im DB-Pfad (Phase 15 Nachtrag)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Tests:** `scripts/profile-completeness-test.js` (46/46) · `profile-db-test.js` (44/44)

## Problem

Beim Schreiben von Cems Profil in `mandate_profiles` (Phase 15) fiel auf: einige
Blob-Profilfelder hatten **keine** Entsprechung in `mandate_profiles`. Beim Aktivieren
von `HELMUT_PROFILE_DB_MODE` (DB-Pfad liest DB statt Blob) wären sie **verloren**
gegangen. Vollständige Liste der zuvor fehlenden Felder aus Cems Live-Blob:

`regionalInterests`, `relevantMinistries`, `topicPriorities`, `opponents`,
`monitoringTargets`, `officeHandoffMethod`, `localMedia`, `mainQuestion`,
`officeFormats`, `outputNeeds`, `location`, `committeeUnknown`, `onboardedAt`.

## Lösung: saubere DB-Lösung (strukturierte Spalten + Auffangbehälter)

Die langfristig saubere Datenbanklösung — **kein** Blob-Merge, DB bleibt alleinige
Quelle. Migration `20260712_mandate_profile_completeness.sql` (rein additiv):

**Strukturierte Spalten** für die funktional genutzten Felder (Radar/Matching/Büro):

| Neue Spalte | Blob-Feld | genutzt von |
|---|---|---|
| `relevante_ministerien text[]` | `relevantMinistries` | Entity-/Radar-Erkennung |
| `gegner text[]` | `opponents` | Entity-Erkennung |
| `monitoring_ziele text[]` | `monitoringTargets` | Monitoring |
| `regionale_interessen text[]` | `regionalInterests` | Radar/Entity |
| `themen_prioritaeten jsonb` | `topicPriorities` | Themen-Priorisierung |
| `buero_uebergabe text` | `officeHandoffMethod` | Büro-Übergabe |

**`profil_extras jsonb`** — verlustfreier Auffangbehälter für **alle übrigen und
künftigen** Blob-Felder (`localMedia`, `mainQuestion`, `officeFormats`, `outputNeeds`,
`location`, `committeeUnknown`, `onboardedAt`, …). `toMandateProfileRow` sammelt jedes
Feld ohne eigene Spalte hierhin; `fromMandateProfileRow` streut es beim Lesen zuerst
zurück. **Damit geht garantiert kein Feld verloren — auch keine künftig neu
eingeführten.**

## Warum Auffangbehälter statt Spalte-pro-Feld?

- **Lossless & zukunftssicher:** ein neues Profilfeld (z. B. später im Admin ergänzt)
  landet automatisch in `profil_extras` und überlebt den DB-Pfad — ohne neue Migration.
- **Sauber:** die für Matching/Radar/Büro wichtigen Felder sind echte, abfragbare
  Spalten; nur der selten strukturiert benötigte „lange Schwanz" (Prompt-Kontext wie
  `mainQuestion`/`outputNeeds`/`localMedia`) liegt gebündelt in JSONB.
- **Kein Merge nötig:** die DB-Zeile allein bildet das Profil vollständig ab; der Blob
  ist nicht mehr als Fallback-Quelle für einzelne Felder nötig (bleibt aber als
  Gesamt-Backup bestehen).

## Bewiesen (Tests)

- **Cems reales Profil** (36 Felder): **jedes** Feld überlebt den DB-Roundtrip
  1:1 (`profile-completeness-test.js` §1, 33 Feldvergleiche + Schlüssel-Vollständigkeit).
- `profil_extras` enthält **nur** die spaltenlosen Felder, **kein** Feld mit eigener
  Spalte (keine Doppelspeicherung).
- **Mehrere Testprofile** (SPD-Landtag inkl. eines erfundenen Zukunftsfelds) — alles
  verlustfrei, inkl. des Zukunftsfelds via `profil_extras`.
- **Leeres Profil:** keine erfundenen Felder, keine leeren Arrays (`undefined` bleibt weg).
- **Echtes SQL-Schema** (lokale Postgres-Test-DB): INSERT/SELECT mit allen neuen
  Spalten (text[]-Arrays, `themen_prioritaeten` JSONB, verschachteltes `profil_extras`)
  — alle Werte intakt zurückgelesen. Migration idempotent, Rollback entfernt nur die
  neuen Spalten (Zeile + übrige Spalten bleiben).

## Sicherheit / kein Production-Effekt

- Der Code läuft **nur** bei `HELMUT_PROFILE_DB_MODE=1` (via `saveProfileToDb`/
  `getProfileFromDb`). Flag ist **aus** → **kein** Verhaltensunterschied für Cem heute.
- Selbst wenn das Flag vor der Production-Migration eingeschaltet würde: `saveProfileToDb`
  ist fail-safe (Fehler → skipped, Blob-Write bereits erfolgt), `getProfileFromDb`
  fällt bei Fehler auf den Blob zurück. Kein Crash, kein Datenverlust.

## Offene Production-Schritte (Freigabe erforderlich)

Damit der DB-Pfad Cem in **Production** 1:1 abbildet, sind noch nötig (Production-Writes
→ Freigabe):
1. Migration `20260712_mandate_profile_completeness.sql` auf Production anwenden.
2. Cems `mandate_profiles`-Zeile um die neuen Felder ergänzen (UPDATE aus dem Blob).

Danach ist der letzte Schritt die Flag-Aktivierung `HELMUT_PROFILE_DB_MODE=1` (Vercel).
