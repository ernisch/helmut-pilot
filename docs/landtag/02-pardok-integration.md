# Landtag-Megasprint — Phase 4: PARDOK vollständig integriert (Shadow abgeschlossen, Live gebaut & deaktiviert)

**Stand:** 2026-07-17 · **Branch:** `claude/helmut-landtag-architecture-tqu3qt`

## 1. Bausteine (alle vorhanden, alle getestet)

| Baustein | Ort | Status |
|---|---|---|
| **Berlin-Parser** (flaches `<Dokument>`, DBID-Identität) | `lib/helmut/quellenarchitektur/pardok-parser.js` (`parseBerlinDokument`) | ✅ vorhanden, Gold-Fixture-Tests grün |
| **Brandenburg-Parser** (`<Vorgang>` + verschachteltes `<Dokument>`, delete-Stubs) | ebd. (`parseBrandenburgVorgang`) | ✅ vorhanden, Gold-Fixture-Tests grün |
| **Dispatcher** (off/shadow/**live**) | `lib/helmut/quellenarchitektur/pardok-dispatch.js` | ✅ Live-Pfad in diesem Sprint gebaut (P2-2) |
| **Streaming-Abruf** (64-MiB-Budget, Record-Frühabbruch) | `lib/helmut/crawler.js` (`fetchPardokText`) | ✅ vorhanden (`pardok-fetch-test.js`) |
| **Live-Mapping** Dokument → Pipeline-rawItem | `pardok-dispatch.js` (`pardokDocToRawItem`, `selectLiveDocuments`) | ✅ neu; kompatibel zu `normalizeRawItem` |
| **Tests** | `scripts/pardok-parser-test.js`, `pardok-dispatch-test.js` (inkl. Block 9 Live), `pardok-gate-test.js`, `pardok-fetch-test.js`, `pardok-dispatch-smoke-test.js` | ✅ alle grün |

## 2. Live-Modus: gebaut, aber DOPPELT gesperrt (Default aus)

Der Live-Pfad (`Items → crawlSource → saveRawItems → Pipeline`) existiert jetzt, öffnet aber nur mit **zwei unabhängigen Freigaben**:

1. `HELMUT_PARDOK_DISPATCH=live` (bzw. `on`) — heute steht `helmut-flags.json` auf `shadow` (unverändert, wurde in diesem Sprint NICHT angefasst).
2. Das PARDOK-Land muss in `HELMUT_LANDESMODULE` freigegeben sein (z. B. `berlin`) — heute leer.

Ohne beide Freigaben verhält sich `live` exakt wie `shadow` (0 Items, isolierte Telemetrie, Grund `live-ohne-landesfreigabe (shadow-fallback)`). Bewiesen durch Tests 9a/9b/9j; die Nutzerpfad-Isolation beweist weiterhin `pardok-dispatch-smoke-test.js`.

**Live-Item-Eigenschaften** (Tests 9c–9g): `sourceType='landesparlament'`, `confidence='high'`, `politicalLevel/sourcePoliticalLevel='land'` (autoritatives Klassifikationssignal, s. `classification.js`), Hash = stabiler Inhaltsfingerabdruck (`pardok-…`, dedup-fähig über Läufe), Geografie `geo-land-berlin`/`geo-land-brandenburg`, Cap über `maxItems` (Default 16, neueste zuerst, keine Platzhalter), Fehlerseite ⇒ 0 Items.

**Datenminimierung:** Nur amtliche Dokument-Metadaten (Titel, Nummer, Art, Datum, URL, Urheber-Institutionen, Desk-Stichworte) — kein Volltext, keine Bürger-Personendaten (vgl. DIP-Präzedenz `dip.js`).

## 3. Shadow: vollständig abgeschlossen

Der Shadow-Pfad gilt als abgeschlossen; alle Abschlusskriterien sind belegt:

| Kriterium | Beleg |
|---|---|
| Beide Länderformate korrekt geparst (Titel-/Datums-/ID-Quoten, delete-Stubs, titellose Formate) | `pardok-parser-test.js` (Gold-Fixtures `test/fixtures/pardok/berlin-gold.xml` + `brandenburg-gold.xml`, adversariale Fälle) |
| Dedup zu eindeutigen Dokumenten + Fundstellen | `pardok-parser-test.js` (`dedupToDocuments`), `pardok-dispatch-test.js` 4c/4e |
| Isolierte Ablage ohne Prod-Write | `pardok-dispatch-test.js` 8a/8b; Artefakte `shadow-store/pardok-dispatch-be-plenum.json` (8 Dok.) / `-bb-plenum.json` (6 Dok.) |
| 0 Items in sichtbarer Pipeline in off/shadow | `pardok-dispatch-test.js` 3/4/7, `pardok-dispatch-smoke-test.js` (Require-Graph + Verhaltensbeweis) |
| Reale Groessen beherrschbar (Berlin ~48 MB, BB ~12 MB) | Streaming-Limits `HELMUT_PARDOK_MAX_RESPONSE_BYTES`/`_MAX_RECORDS` + `pardok-fetch-test.js`; Live-XML-Prüfung über manuellen Workflow `.github/workflows/pardok-parser.yml` (secrets-frei, Artefakt-only) |
| Amtliche Dokumente laufen nie ins Verstehens-Parkfeld | `pardok-gate-test.js` |

**Restpunkt für die Aktivierung (kein Shadow-Punkt):** Vor dem Live-Flip einen frischen Lauf des manuellen Workflows `pardok-parser.yml` gegen die aktuellen Live-Exporte ziehen (Wahlperioden-URLs prüfen: Berlin WP19, Brandenburg WP8 — die Seed-URLs sind wahlperioden-fixiert und müssen bei Legislaturwechsel nachgezogen werden).

## 4. Was bewusst NICHT getan wurde (Sprint-Verbote)

- `helmut-flags.json` unverändert (`HELMUT_PARDOK_DISPATCH=shadow`).
- Keine Vercel-Env-Änderung, kein Cron, kein Prod-Write, keine Quellen-Statusänderung.
- Berlin/Brandenburg bleiben deaktiviert; die Aktivierung ist ausschließlich über Konfiguration möglich (siehe Aktivierungscheckliste im Readiness-Report).
