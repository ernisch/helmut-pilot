# Kompaktes Paket-Manifest — Helmut Quellenarchitektur

> Zweck: **schneller Einstieg für neue Threads**, ohne das gesamte Repository zu lesen.
> Enthält den Bestand an Quellenpaketen + wo Modell, Seed und Tests je Paket liegen.
> Verbindliche Tiefe je Thema: die verlinkten Detaildokumente. Stand: 2026-07-24.

## Modell-Fundament (einmal lesen)

- **Datenmodell / 11 Tabellen:** `docs/quellenarchitektur/03-datenmodell-und-migration.md`
- **Kernmodell (Enums, Referenzzählung, Status):** `lib/helmut/quellenarchitektur/model.js`
- **Migration (Schema):** `supabase/migrations/20260713_source_architecture.sql`
- **Basis-Seed (Bund):** `supabase/seeds/20260713_source_architecture_seed.sql`
- **Gesamt-Status der Migration:** `docs/quellenarchitektur/00-master-status.md`
- Betrieb (Stand fortlaufend): Quellen **on** · Gate **shadow** · PARDOK **shadow** · Scoring **off**.

## Begriffe (kurz)

- **Herausgeber (`publishers`)** — Organisation, existiert **einmal** je Domain.
- **Abrufweg (`retrieval_paths`)** — technische Methode; wird global **einmal** gecrawlt (Referenzzählung).
- **Paket (`source_packages`)** — Bündel von Abrufwegen je Produktzweck.
- **Status Weg:** healthy/degraded/broken/needs_review/paused/archived · **Aktivierung:** auto/always_on/dev_only/manual.
- **Status Paket:** draft/prepared/active/paused/archived. `prepared`/`needs_review`+`manual` = **inaktiv**.

## Pakete (Bestand)

| Paket-Key | Status | Ebene | Wege (≈) | Modell / Seed |
|---|---|---|---|---|
| `bund-basis` | **active** (is_base) | bund | 54 | Basis-Seed · `seeds/packages.js` |
| `arbeit-und-soziales` | **active** | bund | 84 | Basis-Seed |
| `die-linke-bund` | **active** | bund | 2 (+1 Prod-Link) | Basis-Seed |
| `regional-niedersachsen` | **active** | land (NDS) | 4 | Basis-Seed |
| `berlin-basis` | prepared (inaktiv) | land (BE) | 10 | `seeds/landesmodule-quellen.js` · `seeds/20260717_landesmodul_be_bb_seed.sql` |
| `brandenburg-basis` | prepared (inaktiv) | land (BB) | 9 | `seeds/landesmodule-quellen.js` · `20260717_…` |
| **`verkehr-infrastruktur-bund`** | **prepared (INAKTIV)** | bund | 23 (+1 reuse) | `seeds/verkehr-infrastruktur-bund.js` · `20260724_paket_verkehr_infrastruktur_bund_seed.sql` |
| `profil-<mandats-id>` | je Mandat (DB) | — | 1 | Laufzeit, nicht im Code-Seed |

## Paket `verkehr-infrastruktur-bund` (neu, INAKTIV) — Kurzprofil

- **Zweck:** Politikfeld Verkehr & Infrastruktur, Bundesebene (Ministerium, nachgeordnete
  Behörden, Bundesunternehmen, Sicherheits-/Forschungsstellen, Statistik, Verbände).
- **Doku:** `docs/quellenarchitektur/29-paket-verkehr-infrastruktur-bund.md`
- **Neu:** 18 Entitäten · 19 Herausgeber · 23 Abrufwege (**alle `needs_review`/`manual`**) · Paket `prepared`.
- **Wiederverwendet (0 Dubletten):** Herausgeber Destatis/BDI/Google-News · Entitäten
  Destatis/BDI/Verkehrsausschuss/Bundestag/Bundesrat/Bundesregierung · Abrufweg `rp-committee-verkehr`.
- **Methode:** ausschließlich `googlenews_search` (keine erfundenen Feeds; Egress hier gesperrt → alles unverifiziert).
- **Frequenz:** 7 ereignisnah · 13 regelmäßig · 3 periodisch.
- **Generieren:** `npm run seed:verkehr-infrastruktur` · **Test:** `npm run test:verkehr-seed` (34/34).
- **Anwendung auf Production:** **nicht** ausgeführt (freigabepflichtig). Rollback: `…_rollback.sql` (guarded).

## Neue Bund-Entitäten aus diesem Paket (für Wiederverwendung durch spätere Pakete)

`ministry-bmv` (BMV, Aliase BMDV/BMVI) · `company-db-infrago` · `company-autobahn-gmbh` ·
`authority-eba` · `authority-bast` · `authority-baw` · `authority-gdws` · `authority-bfu` ·
`authority-dzsf` · `authority-kba` · `authority-uba` · `authority-balm` (Aliase BAG) ·
`institute-dlr-vf` · `institute-diw` · `association-vdv` · `association-allianz-pro-schiene` ·
`association-adac` · `association-staedtetag`.

> Vor dem Anlegen neuer Organisationen in künftigen Paketen: **erst hier + `seeds/entities.js` +
> `seeds/publishers.js` prüfen**, dann wiederverwenden statt duplizieren.
