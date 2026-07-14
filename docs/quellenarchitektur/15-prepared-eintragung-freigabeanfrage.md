# 15 — Production-Freigabeanfrage: prepared-Eintragung der verifizierten BE/BB-Abrufwege

**Stand:** 2026-07-14 · **Sprint 9B → Production** · **Status: ANGEWENDET (nach Go + grünem Dry-Run) — 18 BE/BB-Wege prepared eingetragen**

> **Ausführungsprotokoll (2026-07-14):**
> 1. **Dry-Run** `begin; <seed>; <Prüfungen A–H>; rollback;` → **vollständig grün**, keine Netto-Änderung.
> 2. **4-vs-5 geklärt:** 5 `always_on`-Kernwege alle vorhanden (deutschlandfunk-politik, dip, tagesschau-politik,
>    bundestag, bundesregierung); die §2-Kennzahl „4" ist gesund-crawlend (`healthy/degraded`) — bundestag +
>    bundesregierung sind vorbestehend `broken` (in 9B repariert, aber Reparatur bewusst nicht angewandt). **Keine
>    funktionierende Bundesquelle deaktiviert/un-migriert.**
> 3. **Echte Eintragung** `begin; <seed>; commit;` erfolgreich. **Post-Commit-Prüfung A–H grün:**
>    political_entities 69→**73**, publishers 51→**64**, retrieval_paths 145→**163**, package_paths 145→**164**,
>    path_expected_levels 0→**18**, path_expected_geographies 0→**18**; 18 BE/BB-Wege eingetragen, davon 0 abweichend
>    von needs_review/manual; beide Pakete `prepared`; aktiv-gesund **4** (unverändert), always_on-Kernset **5**
>    (unverändert); 0 FK-Waisen; 145 Bundeswege unverändert; 3 Bot-Wege needs_review/manual.
> 4. **Rollback:** nicht nötig (alles grün); `..._rollback.sql` bleibt verfügbar.

Diese Anfrage beschreibt die **sichere, technisch inaktive** Eintragung der in Sprint 9B real
verifizierten **18 Berlin/Brandenburg-Abrufwege** (+ Herausgeber/Entitäten/Zuordnungen) als
`prepared`. **Noch nichts angewendet.** Kein Crawl, keine Aktivierung, keine Flags, kein Cron,
kein Deployment. Artefakte: `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` (+ `_rollback.sql`),
generiert von `scripts/generate-landesmodul-seed.js` (Test: `scripts/landesmodul-seed-test.js`, 23 grün).

> **Scope-Klarstellung zu „24 Wegen":** Von den 24 verifizierten Wegen sind **18** neue BE/BB-Wege
> (werden hier eingetragen). Die **6 Bundeswege** sind Reparaturen an **bestehenden** Production-Wegen
> und werden **NICHT** angewendet — bestehende Bundeswege bleiben unverändert (siehe §8).

---

## 1. Was eingefügt wird

| Objekt | Anzahl | Details |
|--------|-------:|---------|
| **Politische Entitäten** (`political_entities`) | **4** | `party-linke-berlin`, `group-agh-linke`, `person-tobias-schulze`, `party-linke-brandenburg` |
| **Herausgeber** (`publishers`) | **14** (13 neu + 1 vorhanden) | `publisher-tagesspiegel.de` existiert bereits (identisch) → `ON CONFLICT DO NOTHING` |
| **Abrufwege** (`retrieval_paths`) | **18** | alle `status='needs_review'`, `activation_mode='manual'` |
| **Paketzuordnungen** (`package_paths`) | **19** | nur `pkg-berlin-basis` / `pkg-brandenburg-basis` (rbb24 → beide) |
| **Erwartete Ebene** (`path_expected_levels`) | **18** | alle `land` |
| **Erwartete Geografie** (`path_expected_geographies`) | **18** | `geo-land-berlin` / `geo-land-brandenburg` |

**FK-Voraussetzungen (read-only geprüft, alle erfüllt):** referenzierte Bestands-Entitäten
`parliament-berlin-agh`, `government-berlin-senat`, `parliament-brandenburg-landtag`,
`government-brandenburg` (4/4 vorhanden); Pakete `pkg-berlin-basis`, `pkg-brandenburg-basis`
(2/2 vorhanden, `status='prepared'`); Geografien `geo-land-berlin`, `geo-land-brandenburg` (2/2).
**ID-Kollisionen:** Entitäten 0, Abrufwege 0, Herausgeber 1 (tagesspiegel, unkritisch via DO NOTHING).

---

## 2. Erwartete Zeilenzahlen (vor → nach)

| Tabelle | vorher | Δ | nachher |
|---------|-------:|---:|--------:|
| `political_entities` | 69 | +4 | **73** |
| `publishers` | 51 | +13 | **64** (tagesspiegel bereits vorhanden) |
| `retrieval_paths` | 145 | +18 | **163** |
| `package_paths` | 145 | +19 | **164** |
| `path_expected_levels` | 0 | +18 | **18** |
| `path_expected_geographies` | 0 | +18 | **18** |
| `source_packages` | 7 | 0 | **7** (unverändert) |
| **aktive Wege** (`activation_mode in (auto,always_on)` ∧ `status in (healthy,degraded)`) | **4** | **0** | **4** (unverändert) |

---

## 3. Kennzeichnung jedes Weges (18)

| Weg | Klasse(n) | Methode | Kategorie |
|-----|-----------|---------|-----------|
| rp-be-plenum | Plenum/Drucksachen/Anfragen/Gesetzgebung | structured_download | **direkte Primärquelle** (PARDOK-XML) |
| rp-bb-plenum | Plenum/Drucksachen/Anfragen/Gesetzgebung | structured_download | **direkte Primärquelle** (parldok-XML) |
| rp-be-regionale_leitmedien | regionale Leitmedien | rss | **journalistische Quelle** (Tagesspiegel) |
| rp-rbb24-politik | ÖR-Landesberichterstattung (BE+BB) | rss | **journalistische Quelle** (rbb24) |
| rp-be-partei_pilot | Partei-Pilot | rss | **Partei-/Fraktionsquelle** 🔒 eingeschränkt (Bot-429) |
| rp-be-fraktion_pilot | Fraktion-Pilot | rss | **Partei-/Fraktionsquelle** 🔒 eingeschränkt (Bot-429) |
| rp-bb-partei_pilot | Partei-Pilot | rss | **Partei-/Fraktionsquelle** 🔒 eingeschränkt (Bot-429) |
| rp-be-landesparlament | Landesparlament + Ausschüsse | googlenews_search | **Google-News-Ersatzweg** |
| rp-be-landesregierung | Landesregierung + Ministerien | googlenews_search | **Google-News-Ersatzweg** |
| rp-be-staatskanzlei | Staatskanzlei | googlenews_search | **Google-News-Ersatzweg** |
| rp-be-landesfraktionen | Landesfraktionen | googlenews_search | **Google-News-Ersatzweg** |
| rp-be-person_pilot | Person-Pilot | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-landesparlament | Landesparlament | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-ausschuesse | Ausschüsse | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-landesregierung | Landesregierung + Staatskanzlei | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-ministerien | Ministerien | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-landesfraktionen | Landesfraktionen | googlenews_search | **Google-News-Ersatzweg** |
| rp-bb-regionale_leitmedien | regionale Leitmedien | googlenews_search | **Google-News-Ersatzweg** (MAZ) |

**Summe:** 2 direkte Primärquellen · 2 journalistische · 3 Partei/Fraktion (eingeschränkt) · 11 Google-News-Ersatz.

---

## 4. Nachweis: alle Wege `needs_review`, `manual`, technisch INAKTIV

- Im generierten SQL trägt **jeder** der 18 `retrieval_paths`-Inserts hart
  `status='needs_review'` + `activation_mode='manual'` (Test: 18/18; das SQL enthält **kein**
  `'auto'`/`'always_on'`/`'healthy'`). Wichtig: DB-Default von `activation_mode` ist `auto` —
  deshalb wird `manual` **explizit** gesetzt.
- Post-Insert-Integritätsprüfung (§6, Prüfung B) = **0 Zeilen** erwartet.
- `computeGlobalActivation`/Live-Crawl nutzen ohnehin `v1Sources`, nicht diese Wege → auch bei
  einem Crawl würden sie nicht angefasst.

## 5. Nachweis: Berlin und Brandenburg bleiben `prepared`

- Es werden **keine** `source_packages` geändert. `pkg-berlin-basis`/`pkg-brandenburg-basis`
  bleiben `status='prepared'` (Prüfung C = beide `prepared`).
- Es werden nur `package_paths`-**Verknüpfungen** angelegt (Paket ↔ Weg), kein Paketstatus berührt.

---

## 6. Smoke-Tests + Integritätsprüfungen (nach dem Insert, read-only)

| # | Prüfung | Erwartet |
|---|---------|----------|
| A | Zeilenzahlen der 6 Tabellen | exakt wie §2 (73/64/163/164/18/18) |
| B | BE/BB-Wege mit `status<>'needs_review' OR activation_mode<>'manual'` | **0** |
| C | `source_packages.status` für berlin-/brandenburg-basis | beide `prepared` |
| D | aktive Wege gesamt (`auto/always_on` ∧ `healthy/degraded`) | **4** (unverändert) |
| E | verwaiste `package_paths`/`path_expected_*` (FK ohne Ziel) | **0** |
| F | bestehende **Bundeswege** (145 alte `retrieval_paths`) unverändert (Anzahl + `updated_at`) | unverändert |
| G | `raw_documents` / `knowledge_objects` / `briefings` Zeilenzahlen | unverändert (kein Crawl) |
| H | 3 Bot-Wege: `status='needs_review'`, `activation_mode='manual'`, keine Aktivierung | bestätigt |

**Optionaler Vorab-Dry-Run (Schritt 0, ohne Netto-Änderung):** `begin;` → Seed anwenden →
Prüfungen A–H → `rollback;`. Beweist die Anwendbarkeit (CHECK/FK) ohne Commit.

---

## 7. Vollständiges Rollback

`supabase/seeds/20260717_landesmodul_be_bb_seed_rollback.sql` (in einer Transaktion):
1. `path_expected_geographies` / `path_expected_levels` / `package_paths` der 18 BE/BB-Weg-IDs löschen,
2. die 18 `retrieval_paths` (per ID) löschen,
3. Herausgeber **guarded** löschen — nur, wenn **kein** Abrufweg (auch kein Bundesweg) sie mehr
   referenziert (schützt `publisher-tagesspiegel.de` u. a. vor `on delete cascade`),
4. die 4 neuen Entitäten **guarded** löschen — nur, wenn kein Herausgeber sie mehr referenziert.

Ergebnis: exakter Ausgangszustand (Zeilenzahlen wie §2 „vorher"). Berührt **keine** Bundeswege/Basis-Daten.

---

## 8. Bestätigung: keine bestehenden Bundeswege ersetzt oder aktiviert

- Der Seed fügt **ausschließlich** neue IDs `rp-be-*` / `rp-bb-*` / `rp-rbb24-politik` ein
  (Kollision mit Bestand = 0) und nutzt durchgehend `ON CONFLICT DO NOTHING` → **kein** bestehender
  Datensatz wird überschrieben oder aktualisiert.
- Die **6 Bundeswege-Reparaturen** (bundestag, bundesregierung, die-linke, linksfraktion,
  ausschuss-arbeit-soziales, dgb) werden **NICHT** angewendet. Ihre Anwendung wäre ein separater,
  eigens freizugebender Schritt (Änderung bestehender Production-Wege) — hier ausdrücklich **ausgeschlossen**.
- Die 4 aktuell aktiven Wege bleiben aktiv/unverändert (Prüfung D/F).

## 9. Die 3 Bot-gesperrten Parteiquellen: eingeschränkt + NICHT aktivierbar

`rp-be-partei_pilot`, `rp-be-fraktion_pilot`, `rp-bb-partei_pilot` (Die Linke Berlin/Brandenburg,
Linksfraktion Berlin) sind real nur mit HTTP-429 (Bot-Sperre) erreichbar. Sie werden — wie alle —
`needs_review`/`manual` eingetragen und sind im Modell als **eingeschränkt / nicht aktivierbar**
markiert (`landesmodul-seed`-Test erzwingt `aktivierbar=false`). **Aktivierung ausgeschlossen**,
bis ein server-seitiger Abruf (realistischer UA, keine Umgehung) verfügbar ist.

---

## 10. Stop-Bedingungen (sofortiger Rollback)

Sofort `rollback`, wenn eine davon eintritt:
- **SQL-Fehler** (CHECK-/FK-Verletzung) beim Insert.
- Zeilenzahlen nach dem Insert **≠** §2.
- **irgendein** BE/BB-Weg mit `status<>'needs_review'` oder `activation_mode<>'manual'` (Prüfung B > 0).
- aktive Wege gesamt **≠ 4** (Prüfung D).
- ein Paketstatus **≠ `prepared`** (Prüfung C).
- **irgendein** bestehender Bundesweg verändert (Prüfung F).
- `raw_documents`/`knowledge_objects`/`briefings` verändert (Prüfung G).

---

## 11. Exakt auszuführende Schritte (nach „Go")

0. (optional) Dry-Run `begin; <seed>; <Prüfungen A–H>; rollback;`.
1. `20260717_landesmodul_be_bb_seed.sql` anwenden (eine Transaktion, `notify pgrst`).
2. Prüfungen A–H ausführen.
3. Bei Abweichung → `20260717_landesmodul_be_bb_seed_rollback.sql`; sonst fertig.
4. Ergebnisbericht: Zeilenzahlen vorher/nachher, Prüfungen A–H, Bestätigung 0 aktiv / BE/BB prepared / Bundeswege unverändert.

**Dauer:** < 1 Minute (reine Inserts, keine Backfills, kein Crawl). **Kostenrisiko:** 0 (keine LLM-/Netz-Aufrufe).

---

## Freigabefrage

**Gibst du „Go" für die Eintragung der 18 BE/BB-Abrufwege (+ 4 Entitäten, 13 neue Herausgeber,
19 Paketzuordnungen, 18+18 Ebenen/Geografien) als `prepared` (needs_review/manual, technisch
inaktiv) gemäß Schritt 1–4 — mit Ausschluss jeder Bundesweg-Änderung und ohne Aktivierung der
3 Bot-gesperrten Parteiquellen?**
