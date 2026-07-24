# Manifest — Quellenpaket `bildung-bund` (kompakt, für Folge-Threads)

> Reicht als Kontext ohne erneuten Repo-Vollscan. Details: `29-bildung-bund-vorbereitung.md`.

- **Status:** `prepared` / **vollständig INAKTIV**. Nicht angewandt, kein Merge, keine Aktivierung.
- **Zweck:** Fachthemenpaket Bildungspolitik des Bundes, föderal korrekt (Bund vs. Länder).
- **Sprint:** 2026-07-24. **Tests:** 141/141 offline grün; `bildung-bund-seed-test.js` = 51 Checks.

## Dateien
- Builder: `lib/helmut/quellenarchitektur/seeds/bildung-bund-quellen.js` (`buildBildungBundSeed()`)
- Generator: `scripts/generate-bildung-bund-seed.js` (deterministisch, idempotent)
- SQL: `supabase/seeds/20260724_bildung_bund_seed.sql` (+ `_rollback.sql`, guarded)
- Test: `scripts/bildung-bund-seed-test.js` · npm `test:bildung-bund`
- Doku: `docs/quellenarchitektur/29-bildung-bund-vorbereitung.md`

## Paket
`pkg-bildung-bund` (key `bildung-bund`, `status=prepared`, `is_base=false`, `political_level=bund`, `geo-bund`).

## Wege (12 = 11 neu + 1 reuse; alle neuen: `needs_review` + `manual`, `googlenews_search`)
- **Tier 1:** `rp-bildung-bmbfsfj`, `rp-bildung-kmk`, `rp-bildung-bibb`, `rp-bildung-destatis`(reuse pub), `rp-bildung-bildungsbericht`, **`rp-committee-bildung`**(REUSE bestehender aktiver Weg)
- **Tier 2:** `rp-bildung-swk`, `rp-bildung-iqb`, `rp-bildung-oecd`(reuse pub), `rp-bildung-dzhw`
- **Tier 3:** `rp-bildung-ba-ausbildungsmarkt`(reuse pub), `rp-bildung-bundesrat`(reuse pub)

## Neu angelegt
- **Entitäten (7):** `ministry-bmbfsfj`, `institution-kmk`, `authority-bibb`, `institution-dipf`, `institution-swk`, `institution-iqb`, `institution-dzhw`
- **Herausgeber (7):** bmbfsfj.bund.de, kmk.org, bibb.de, bildungsbericht.de, swk-bildung.org, iqb.hu-berlin.de, dzhw.eu

## Wiederverwendet (nicht neu/verändert)
- Herausgeber: `publisher-destatis.de`, `publisher-arbeitsagentur.de`, `publisher-bundesrat.de`, `publisher-oecd.org`, `aggregator-google-news`
- Entitäten: `committee-bt-bildung`, `statoffice-destatis`, `authority-bundesagentur-arbeit`, `parliament-bundesrat`
- Weg: `rp-committee-bildung` (parlamentarischer Bildungsweg — kein Parallelweg)

## Ressort 2026 (verifiziert)
- **BMBFSFJ** = Bildung (bmbfsfj.bund.de). **BMFTR** = ex-BMBF, Forschung → `wissenschaft-forschung-bund` (ausgeschlossen). **KMK→Bildungs-MK** (Reform 01/2025, kmk.org), Länderkoordination (kein Bund).
- `ministry-bmbfsfj` ≠ historisches `ministry-bmfsfj` (unverändert). Kein ID-Bruch, kein Update.

## Ausgeschlossen → Wissenschaftspaket
BMFTR, GWK, Hochschulforschung/-organisation. Ferner ausgeschlossen: Bertelsmann/Vodafone/CHE/Stifterverband, UNESCO, Einzelländerquellen.

## Future Targets
Autorengruppe (Maschinendaten), NEPS/LIfBi, Fachstelle Anerkennung, IQB-Prozessdaten, GWK-Beschlüsse, Deutscher Bildungsserver, Programm-Portale (Startchancen/Digitalpakt/GaFöG).

## Vor Aktivierung zwingend
1. Byte-genaue Verifikation der 11 `site:`-Google-News-Suchen (offener-Egress-Runner): HTTP 200, Recency, Volltext, kein Bot-Dauerblock. *(In-Sandbox nicht möglich — Egress bot-blockiert.)*
2. Freigabe + Umschaltung je Weg `needs_review→healthy`, `manual→auto`, Paket `prepared→active`.
3. Offene Punkte: WP21-Ausschussname prüfen; BIBB-Ressortaufsicht (BMBFSFJ vs. BMFTR) letztverbindlich klären.
