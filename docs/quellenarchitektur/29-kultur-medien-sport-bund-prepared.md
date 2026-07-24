# 29 — PREPARED-Eintragung: Bund-Fachpaket „Kultur, Medien und Sport (Bund)"

**Stand:** 2026-07-24 · **Status: VORBEREITET, NICHT ANGEWENDET** (kein Crawl, keine Aktivierung,
kein Flag, kein Cron, kein Deployment, kein PR, kein Profil-Mapping).

Technische Vorbereitung einer **kleinen, hochwertigen** Quellenarchitektur mit maximalem
politischem Signalwert und konsequenter Wiederverwendung. Kanonischer Paketname:
`kultur-medien-und-sport-bund`. Artefakte (generiert, idempotent, nicht-destruktiv):

- `supabase/seeds/20260724_kultur_medien_sport_bund_seed.sql` (+ `_rollback.sql`)
- Generator: `scripts/generate-kultur-medien-sport-seed.js`
- Quellmodul: `lib/helmut/quellenarchitektur/seeds/kultur-medien-sport-quellen.js`
- Test: `scripts/kultur-medien-sport-seed-test.js` (im Offline-Runner, 51 Prüfungen grün)

## 1. Zielarchitektur — 8 Retrieval Paths (5 neu, 3 wiederverwendet)

| # | Weg | Publisher | neu/reuse | Signal |
|---|-----|-----------|-----------|--------|
| 1 | `rp-bkm-kultur` | `publisher-kulturstaatsminister.de` (**neu**, BKM) | neu | Kultur/Erinnerung/Kulturgutschutz/Denkmalschutz |
| 2 | `rp-bkm-medien-film` | `publisher-kulturstaatsminister.de` (**neu**, BKM) | neu | Medien/Filmförderung/Filmfördergesetz/Medieninvestitionsgesetz/DW |
| 3 | `rp-sport-ehrenamt-bund` | `publisher-bundesregierung.de` (**reuse**) | neu | Sportförderung/Spitzensport/Ehrenamt/Anti-Doping |
| 4 | `rp-committee-kultur-medien` | `aggregator-google-news` | **reuse** | Ausschuss für Kultur und Medien |
| 5 | `rp-committee-sport` | `aggregator-google-news` | **reuse** | Ausschuss für Sport (und Ehrenamt) |
| 6 | `rp-dip` | `publisher-dip.bundestag.de` | **reuse** | Parl. Vorgänge/Drucksachen/Unterrichtungen |
| 7 | `rp-nada-antidoping` | `publisher-nada.de` (**neu**, NADA) | neu | Jahresberichte/WADA-Code/nat. Regeländerungen |
| 8 | `rp-destatis-kulturfinanzbericht` | `publisher-destatis.de` (**reuse**) | neu | Kulturfinanzbericht (Destatis, 2-Jahres-Rhythmus) |

**Neu:** 2 Herausgeber (BKM, NADA) · 3 Entitäten (`ministry-bkm`,
`government-sport-ehrenamt-bk`, `institution-nada`) · 1 Paket · 5 Abrufwege.
**Wiederverwendet:** 3 Wege (`rp-dip`, `rp-committee-kultur-medien`, `rp-committee-sport`) —
nur zusätzliche `package_paths`-Referenz, **global unverändert**; Herausgeber
`publisher-bundesregierung.de`/`publisher-destatis.de`; Entität `statoffice-destatis`.

## 2. Verbindliche fachliche Korrekturen (alle umgesetzt)

1. **Sport ≠ BKM:** eigene Entität `government-sport-ehrenamt-bk` (Staatsministerin beim
   Bundeskanzler); der Sport-Weg hängt am Bundesregierung-Publisher, nicht am BKM.
2. **Kein `bundeskanzleramt.de`-Publisher:** bestehender `publisher-bundesregierung.de`
   deckt Sport ab → nur ein neuer Retrieval Path.
3. **Kulturfinanzbericht:** `publisher-destatis.de` wiederverwendet, kein neuer Publisher.
4. **15. Sportbericht:** kein PDF/`structured_download`-Weg — über `rp-dip` (Unterrichtung)
   + `rp-sport-ehrenamt-bund` abgedeckt.
5. **Sportausschuss-URL:** keine erfundene `bundestag.de/ausschuesse/sport`-URL — bestehender
   `rp-committee-sport` wiederverwendet.
6. **BISp:** nicht aufgenommen (kein nachweisbar regelmäßiger politischer Signalwert) →
   Future Target.
7. **NADA:** eigenständiger Weg, Fokus Jahresberichte/WADA-Code/Regeländerungen; Query meidet
   operative Einzelfälle.
8. **BKM geteilt:** zwei Retrieval Paths (Kultur bzw. Medien/Film) auf einem Publisher.
9. **Ausschuss-Öffentlichkeit:** keine Pauschalbehauptung; Wege liefern öffentlich nachweisbare
   Inhalte (Google-News-Fund über amtliche/öffentliche Mitteilungen), keine internen Sitzungen.

## 3. Erwartete Zeilen-Deltas (rein additiv)

| Tabelle | Δ |
|---|---|
| `political_entities` | +3 |
| `publishers` | +2 |
| `source_packages` | +1 (`prepared`, `is_base=false`) |
| `retrieval_paths` | +5 (alle `needs_review` + `manual`, `is_critical=false`) |
| `package_paths` | +8 (5 neu + 3 reuse-Referenzen) |
| `path_expected_levels` | +5 (`bund`) |
| `path_expected_geographies` | +5 (`geo-bund`) |
| `path_expected_topics` | +24 |
| `path_expected_entities` | +5 |

**Aktive Wege gesamt: unverändert.** Die 5 neuen Wege sind `manual`/`needs_review` (inaktiv);
die 3 wiederverwendeten behalten ihren bestehenden globalen Status (das prepared-Paket erhöht ihre
Referenzzählung nicht). Absolute „nachher"-Werte sind vor Freigabe per Live-Pre-Count zu
bestätigen (diese Umgebung liest die Produktions-DB bewusst nicht).

## 4. Smoke-/Integritätsprüfungen nach dem Insert (read-only)

| # | Prüfung | Erwartet |
|---|---------|----------|
| A | Δ der 9 Tabellen | exakt wie §3 |
| B | neue Wege mit `status<>'needs_review' OR activation_mode<>'manual'` | **0** |
| C | `source_packages.status` für `pkg-kultur-medien-und-sport-bund` | `prepared` |
| D | aktive Wege gesamt (`auto/always_on` ∧ `healthy/degraded`) | **unverändert** |
| E | verwaiste `package_paths`/`path_expected_*` (FK ohne Ziel) | **0** |
| F | `rp-dip`/`rp-committee-*` (Status, `updated_at`, Publisher) | **unverändert** |
| G | `raw_documents`/`knowledge_objects`/`briefings` | **unverändert** (kein Crawl) |

## 5. Rollback

`20260724_kultur_medien_sport_bund_seed_rollback.sql` (eine Transaktion): entfernt die 4
`path_expected_*` der 5 neuen Wege, alle `package_paths` des neuen Pakets, die 5 neuen Wege,
das Paket, dann **guarded** die 2 neuen Herausgeber (nur wenn kein Weg sie referenziert) und die
3 neuen Entitäten (nur wenn kein Herausgeber/`path_expected_entities` sie referenziert).
Wiederverwendete Wege/Herausgeber/Entitäten (`rp-dip`, `rp-committee-*`,
`publisher-bundesregierung.de`, `publisher-destatis.de`, `statoffice-destatis`) bleiben unberührt.

## 6. Auszuführende Schritte (erst nach „Go")

0. (optional) Dry-Run `begin; <seed>; <Prüfungen A–G>; rollback;`.
1. `20260724_kultur_medien_sport_bund_seed.sql` anwenden (eine Transaktion, `notify pgrst`).
2. Prüfungen A–G ausführen.
3. Bei Abweichung → Rollback; sonst fertig. **Keine** Aktivierung, **kein** Profil-Mapping.

**Dauer:** < 1 Minute (reine Inserts). **Kostenrisiko:** 0 (keine LLM-/Netz-Aufrufe).
