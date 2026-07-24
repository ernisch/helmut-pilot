# MANIFEST — Fachpaket `innere-sicherheit-bund` (kompakter Wiedereinstieg)

**Zweck:** Ohne Repository-Vollscan weiterarbeiten. **Stand:** 2026-07-24 ·
**Status:** `prepared` / technisch **INAKTIV** · **nicht angewendet · kein PR · kein Merge**
**Branch:** `claude/innere-sicherheit-bund-validation-o0fh17` (Basis `035898b`)
**Volle Doku:** `29-innere-sicherheit-bund-paket.md`

## Dateien (alle additiv, isoliert)
| Datei | Rolle |
|---|---|
| `lib/helmut/quellenarchitektur/seeds/innere-sicherheit-bund.js` | Code-Modell (Single Source), `buildInnereSicherheitBundSeed()` |
| `scripts/generate-innere-sicherheit-bund-seed.js` | Generator → SQL + Rollback (`node …` oder `npm run seed:innere-sicherheit-bund`) |
| `scripts/innere-sicherheit-bund-seed-test.js` | 47 Checks (`npm run test:innere-sicherheit-bund`); auto in Offline-Suite |
| `supabase/seeds/20260724_innere_sicherheit_bund_seed.sql` | idempotenter PREPARED-Seed (ON CONFLICT DO NOTHING) |
| `supabase/seeds/20260724_innere_sicherheit_bund_seed_rollback.sql` | guarded Rollback |
| `docs/quellenarchitektur/29-innere-sicherheit-bund-paket.md` | fachlich-technische Doku |

**NICHT verändert:** `seeds/packages.js` (bleibt 6 Pakete), Basis-Seed `20260713_*`, `catalog.js`,
`profile-packages.js`, Generatoren/Registry/Workflow, `run-offline-tests.js`.

## Objekt-IDs
- **Paket:** `pkg-innere-sicherheit-bund` (key `innere-sicherheit-bund`, `prepared`, is_base=false, bund)
- **Neue Entitäten (3):** `authority-bka`, `authority-bfv`, `authority-bfdi` (alle `authority`, data_source-Herausgeber)
- **Wiederverwendete Entität:** `ministry-bmi` (bestehend; nur referenziert)
- **Neue Herausgeber (4):** `publisher-bmi.bund.de` (→ministry-bmi, official_primary), `publisher-bka.de`,
  `publisher-verfassungsschutz.de`, `publisher-bfdi.bund.de` (letzte 3: authority/data_source, trust hoch)
- **Neue Wege (5, needs_review/manual):** `rp-isb-bmi-gesetzgebung`, `rp-isb-bka-statistik-lagebilder`,
  `rp-isb-bka-pmk`, `rp-isb-bfv-verfassungsschutzberichte`, `rp-isb-bfdi-taetigkeitsberichte`
- **Wiederverwendete Wege (2, nur package_paths-Referenz):** `rp-dip`, `rp-committee-inneres`

## Wege → URL (amtlich/WebSearch bestätigt; byte-genau OFFEN)
| Weg | URL |
|---|---|
| rp-isb-bmi-gesetzgebung | `https://www.bmi.bund.de/DE/ministerium/gesetzgebungsverfahren/gesetzgebungsverfahren-artikel.html` |
| rp-isb-bka-statistik-lagebilder | `https://www.bka.de/DE/AktuelleInformationen/StatistikenLagebilder/statistikenlagebilder_node.html` |
| rp-isb-bka-pmk | `https://www.bka.de/DE/UnsereAufgaben/Deliktsbereiche/PMK/PMKZahlen/PMKZahlen_node.html` |
| rp-isb-bfv-verfassungsschutzberichte | `https://www.verfassungsschutz.de/DE/service/publikationen/publikationen_node.html` |
| rp-isb-bfdi-taetigkeitsberichte | `https://www.bfdi.bund.de/DE/Service/Publikationen/Taetigkeitsberichte/taetigkeitsberichte_node.html` |
| rp-dip *(reuse)* | `https://search.dip.bundestag.de/api/v1` |
| rp-committee-inneres *(reuse)* | Google-News-Suchweg „Innenpolitik OR Migration OR Asyl OR Polizei …" |

## Seed-Kennzahlen (Zeilen, additiv)
`source_packages +1 · political_entities +3 · publishers +4 · retrieval_paths +5 · package_paths +7
(5 neu + 2 reuse) · path_expected_levels +5 · path_expected_geographies +5 · path_expected_topics +15 ·
path_expected_entities +5`. Aktive neue Wege: **0**. Byte-verifiziert: **0**.

## Amtliche Fakten (2026-07, WebSearch)
- BMI: seit 06.05.2025 wieder „Bundesministerium des Innern" (Minister Dobrindt); „…und für Heimat" = hist. Alias.
- Innenausschuss (21. WP): Name **„Innenausschuss"**, konst. 21.05.2025 (`bundestag.de/inneres`).
- Verfassungsschutzbericht 2025: veröffentlicht **30.06.2026** (BfV/BMI).
- PKS 2025: **20.04.2026** (BKA). PMK 2025: **09.06.2026**, 85.837 Fälle (Höchststand).
- BfDI 34. TB 2025: übergeben **06.05.2026**.

## Tier / Ausschlüsse
- Tier 1 (5, inkl. 2 reuse): BMI-Gesetzgebung, BKA-Statistik/Lagebilder, BfV, DIP*, Innenausschuss*
- Tier 2 (2): BKA-PMK, BfDI
- Future Target / Tier 3 (NICHT geseedet): Bundespolizei, IMK, Europol, Frontex, Bundesrechnungshof, PKGr-eigener-Weg
- Ausgeschlossen: BBK/THW/Warnsysteme → `bevoelkerungsschutz-katastrophenschutz-bund`; allg. BSI → Cyber-Paket
  (Cybercrime-Lagebild bleibt als BKA-Topic); BND/MAD/Bundeswehr.

## Aktivierungs-Checkliste (später, freigabepflichtig — NICHT Teil dieses Sprints)
1. Byte-Check der 5 URLs (HTTP/Redirect/Content-Type) auf offenem Egress-Runner; Methode/Parser final wählen.
2. DB-Dry-Run: `begin; <seed>; Integritätsprüfungen; rollback;` (0 aktive Wege, Paket `prepared`, 0 FK-Waisen, Bundeswege unverändert).
3. Seed anwenden; Prüfungen; bei Abweichung `…_rollback.sql`.
4. Aktivierung (Paket `prepared`→`active`, Wege `needs_review`→`healthy`, `manual`→`auto`/`always_on`) = **separate** Freigabe.

## Offene Bestandsdrift (außerhalb Scope, nur dokumentiert)
- `committee-bt-inneres` Bestandsname „Ausschuss für Inneres und Heimat" (amtlich 21. WP: „Innenausschuss").
- `entities.js` = 23 Ausschüsse; 21. WP = 24 ständige Ausschüsse.
