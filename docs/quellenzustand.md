# Quellenzustand — Health, Frische, Duplikate, Nutzung (Helmut)

**Stand:** 2026-07-13 · **Modus:** rein lesend · **Belegbasis:** Prod-Supabase `ddckuvvpcytqbyfmbvie`,
`sources.js`, `crawler.js`, `matching.js`. Messwerte je Quelle: `docs/quellen-audit.csv`.

> **Kernbild:** Der Crawl ist **tagesfrisch und breit** (4.782 Rohdokumente, 1.273 < 24 h,
> jüngster Abruf heute 08:31 UTC), die Link-Qualität hoch (98,6 % Direktlinks), **keine exakten
> Duplikate**. **Aber:** 7 von 9 „hochwertigen" Direkt-Feeds sind **tot**, die Verstehens-Schicht
> hat strukturelle Lücken (`political_level` bei **allen** 231 KOs leer, **0** gespeicherte
> Embeddings, **0** persistierte Matching-Ergebnisse), und **echte Nutzung findet nur für Cem statt**
> (78 Decisions, alle `cem-ince`).

---

## 1. Frische & Volumen (raw_documents = 4.782)

| Kennzahl | Wert |
|---|---|
| jüngster Abruf | **2026-07-13 08:31 UTC** (heute) |
| ältester Abruf | 2026-07-02 (≈ 11-Tage-Fenster) |
| < 24 h | **1.273** |
| < 7 Tage | **3.551** |
| < 30 Tage | 4.773 |
| distinct `source_id` mit Docs | **121** |
| Link `direct` | **4.717 / 4.782 = 98,6 %** |
| leere URL (Publisher/Proxy geleert) | 56 |

**Verteilung nach `source_type`:** committee 1.699 · media 1.545 · party 748 · bundestag 340 ·
ministry 239 · association 181 · local (regional) **21** · null 9.
→ **Regional bleibt das schwächste Feld: 21 Dokumente insgesamt** (die 4 überlebenden
Niedersachsen-Quellen + Orphans), fast nichts in den letzten 24 h.

## 2. Defekte Quellen — 7 von 9 Direkt-Feeds liefern NULL Dokumente

Die als „zuverlässig" gedachten Direkt-Feeds sind der wunde Punkt. Verifiziert per All-Time-Count:

| Direkt-Feed | Typ | Docs gesamt | Status |
|---|---|---:|---|
| `deutschlandfunk-politik` | rss | **471** | ✅ gesund (Volumen-Spitzenreiter) |
| `tagesschau-politik` | rss | **338** | ✅ gesund |
| `bmas` | rss | 19 | ✅ ok |
| `bundestag` (bundestag.de/rss) | rss | **0** | ❌ **defekt** |
| `bundesregierung` (bundesregierung.de/rss) | rss | **0** | ❌ **defekt** |
| `die-linke` (die-linke.de rss) | rss | **0** | ❌ **defekt** |
| `linksfraktion` (dielinkebt.de rss) | rss | **0** | ❌ **defekt** |
| `dgb` | html-scrape | **0** | ❌ **defekt** |
| `ausschuss-arbeit-soziales` | html-scrape | **0** | ❌ **defekt** |

**Bewertung:** Die **amtlichen Originalquellen** (Bundestag, Bundesregierung) und die
**Partei-Originalquellen** (Die Linke) sind tot — ihre Inhalte kommen nur noch **zweit­hand** über
Google-News-Proxys herein (`general-hib` 127, `dip` 50, `fraction-linke` 83). Das ist ein
**Originalquellen-Verlust**: hohe Frische, aber niedrigere Quellenautorität als möglich. Beide
HTML-Scrapes liefern erwartungsgemäß nichts.

Weitere Katalog-Quellen mit **0 Docs/7 d** (Google-News-Query läuft ins Leere oder ist zu eng):
`news-rnd`, `news-table-media`, `news-sozialverband-deutschland` (1 gesamt), `signal-armutsbericht`,
sowie die meisten `official`-Behördenquellen (`news-arbeitsagentur`, `news-destatis-soziales`,
`news-iab`, `institution-*` OECD/ILO/Eurofound/Bundesrechnungshof/Minijob/Zoll/BA-Statistik) und mehrere
`signal-*`/`radar-*`-Quellen. Diese sind konfiguriert, tragen aber **kaum bis nichts** bei.

## 3. Gesunde Quellen (Top-Lieferanten, alle tagesfrisch)

Deutschlandfunk 471 · Tagesschau 338 · `fraction-cdu-csu` 200 · `committee-gesundheit` 162 ·
`fraction-spd` 151 · `general-hib` 127 · `committee-verteidigung` 98 · `committee-finanzen` 92 ·
`fraction-linke` 83 · `committee-haushalt` 82 · `general-bundestag-plenum` 80 · `committee-klima-umwelt` 80 ·
`committee-familie` 76 · `committee-inneres` 75 · `fraction-fdp` 73 · `committee-bildung` 72 · `dip` 50 ·
`news-verdi` 53 · `radar-buergergeld` 55.
→ **Die neutrale Bundes-Basis (Ausschüsse + Fraktionen + Leitmedien) und DIP tragen das Volumen.**

## 4. Duplikate

- **Exakte Dubletten: keine.** `distinct content_hash = 4.782 = total`.
- **Titel-Dubletten (gleicher Titel, anderer Hash): 279 (≈ 5,8 %)** — normale Cross-Source-Überlappung
  (dasselbe Ereignis bei mehreren Medien), kein Fehler. Der Hash bindet an den Titel, daher werden
  leicht abgewandelte Titel nicht zusammengeführt → **milder Duplikatverdacht auf KO-Ebene** (mehrere
  KOs zum selben Vorgang möglich), aber unkritisch.
- **Empfehlung:** URL-normalisierter statt titelbasierter Cross-Run-Dedup würde die 279 senken.

## 5. Knowledge Objects — verwertbarer Wissensstand (231)

| Feld | belegt | leer | Bewertung |
|---|---:|---:|---|
| `understanding_status = complete` | 179 | 52 pending | 77 % verstanden |
| `tags` | 161 | 70 | **deutlich besser als altes Audit (war 0)** |
| `parteien` | 105 | 126 | ok, aber Schreibvarianten (SPD/CDU/„Die Linke"/„Linke"/„DIE LINKE") |
| `mentioned_locations` | 94 | 137 | fast nur „Deutschland" (22), Länder kaum |
| `ausschuesse` | 74 | 157 | ok, Bund-lastig |
| `policy_field` | 61 | 170 | neu befüllt, aber Mehrheit leer → read-time aus Ausschuss abgeleitet |
| **`political_level`** | **0** | **231** | ❌ **nie befüllt → keine Bund/Land-Trennung möglich** |
| **`embedding`** | **0** | **231** | ❌ **nie gespeichert → pgvector-Suche läuft nur über read-time berechnete Embeddings** |

**Politikfeld-Verteilung der KOs (policy_field):** Arbeit und Soziales 19 · Gesundheit 17 · Finanzen 9 ·
Wirtschaft 7 · Inneres 6 · Bildung 5 · Auswärtiges 5 · Umwelt 4 · Haushalt 4 · Verteidigung 2 · Recht 2 ·
Verkehr 2 · Familie 2 · Wohnen 2. → **Themenbreite entsteht** (nicht mehr nur Soziales), aber pro
Nicht-Sozialfeld nur wenige verstandene Vorgänge.

**KO-Locations:** Deutschland 22 · Bremen 5 · Berlin 4 · EU 4 · Türkei 4 · Israel 3 · … **kein Brandenburg,
keine Landtags-Bezüge.** → Die Regions-Dimension im Matching ist für Land-Profile praktisch leer.

## 6. Tatsächliche Nutzung in Lage / Radar / Helmut / Büro

- **decisions: 78 — ausschließlich `user_id = cem-ince`.** Kein anderes Profil hat je Entscheidungen
  erzeugt. Lage/Radar/Helmut/Büro werden real **nur für den Piloten** durchlaufen.
- **matching_results: 0** — der V3-Matching-Shadow-Runner hat in Prod **nichts persistiert**
  (Flag aus / KO-Embeddings fehlen). Das produktive Matching läuft damit nicht über die gespeicherte
  pgvector-Tabelle, sondern über den read-time-Pfad in `matching.js`.
- **llm_usage: 0 Zeilen** — kein Token-/Kosten-Datensatz gespeichert (Kostentelemetrie nicht befüllt).
- **briefings: 4**, **profile_embeddings: 1** (nur Cem), **mandate_profiles: 1**.
- Die drei Zweitprofile (Sanae Abdi, Knut Abraham, Doris Achelwilm) existieren laut
  `docs/zweitkunden-drei-profile-nachweis.md` **nur als Test-Fixtures** (In-Memory, kein Prod-Write) —
  konsistent mit „0 Decisions außer Cem".

## 7. Crawler-Technik (Kurzbefund)

TLS-Prüfung **aktiv** (kein `rejectUnauthorized=false` mehr — Korrektur ggü. Alt-Audit 2026-07-01).
RSS = Regex-Parser (keine XML-Lib), Concurrency 20, Timeout 7 s, keine generellen Retries.
**Strukturelles Klumpenrisiko:** 135 der 144 Quellen hängen am Google-News-`batchexecute`-Auflöser —
bricht Googles Format, degradieren fast alle Quellen gleichzeitig (Single Point of Failure). Aktuell
funktioniert er (98,6 % Direktlinks).
