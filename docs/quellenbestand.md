# Quellenbestand — Istliste aller Quellen (Helmut)

**Stand:** 2026-07-13 · **Modus:** rein lesend, keine Änderung an Code/Prod/Cron/Secrets
**Belegbasis:** `lib/helmut/sources.js`, `crawler.js`, `scheduler.js` (Gate-Logik), `matching.js`, `dip.js`,
`sourceSafety.js`; Live-SELECT gegen Prod-Supabase `ddckuvvpcytqbyfmbvie`
(`raw_documents=4782`, `knowledge_objects=231`, Stand-Crawl 2026-07-13 08:31 UTC).
**Maschinenlesbar:** `docs/quellen-audit.csv` (157 Zeilen: 144 Katalog + 13 Orphan, mit allen Messwerten).

> **Kernbild:** Helmut kennt einen **hartkodierten** Katalog von **144 kuratierten Quellen**
> (aus ~566 generierten). Davon sind **53 „neutrale Basis"** (reine **Bundesebene**), **84 fachlich
> tiefe Quellen — zu 100 % Sozialpolitik**, **4 Regionalquellen (alle Niedersachsen/Cem)**,
> **2 Partei-Direktquellen (nur Die Linke)** und **1 Personenquelle (Cem Ince, Demo)**.
> Es existiert **keine einzige Landtags-, Landesregierungs- oder Landesministeriumsquelle.**

---

## 1. Woher die Quellen kommen (Herkunft & Ladepfad)

- Quellen sind **im Code hartkodiert** (`sources.js` → `v1Sources`), geladen über
  `storage.getSources()`. Die DB-Tabelle `public.sources` ist **leer (0 Zeilen)** — totes Legacy-Schema,
  kein Ladepfad greift darauf zu. **„Code ist die Wahrheit."** Änderungen nur per Deploy.
- **Generierung:** Fabrikfunktionen `directSource` (echter RSS/HTML-Feed), `googleNewsSource`
  (`news.google.com/rss/search?q=…`) und `siteSource` (`site:domain`-Query → Google News).
- **Kreuzprodukt:** `deepTopicSources = 25 Themen × 14 Kontexte = 350 Bündelquellen` — **alle
  sozialpolitisch.** Die Kuratierung behält je Thema **nur die eine** „· Ausschuss Arbeit und Soziales"-
  Variante → 25 statt 350.
- **Kuratierung** (`HELMUT_SOURCE_CURATION`, default an): reduziert ~566 → **144**. Direktfeeds und
  `person`/`official` bleiben immer; Google-News-Quellen werden nach Typ + Priorität gefiltert.

## 2. Katalog-Zusammensetzung (144 kuratierte Quellen)

| Gate-Klasse | # | Bedeutung (wer bekommt sie?) |
|---|---:|---|
| **neutral** | **53** | Basis für **jedes** Mandat. Reine Bundesebene (s. u.). |
| **thema:social** | **84** | Nur bei sozialpolitischem Profil/Thema. Fachmedien, Verbände, Gewerkschaften, Prozess-/Radar-Quellen, Institutionen, 25 Themen-Bündel. |
| **regional** | **4** | Nur bei passender Region **im Quellennamen**. Faktisch nur Niedersachsen (Cem). |
| **partei** | **2** | Nur bei passender Partei. Ausschließlich **Die Linke** (`die-linke`, `linksfraktion`). |
| **person (demo)** | **1** | `cem-ince-news` — nie über den geteilten Katalog, nur Demo. |
| **Summe** | **144** | 9 Direkt-Feeds · 135 Google-News-Quellen |

**Neutrale Basis (53) im Detail — ausschließlich Bund:**
- 4 Kern-Institutionen/Leitmedien direkt: `bundesregierung`, `bundestag`, `tagesschau-politik`, `deutschlandfunk-politik`
- **22 Bundestags-Ausschüsse** (`committee-*`, je 1 Google-News-Query) — alle 22 Fachausschüsse abgedeckt
- **8 Bundestags-Fraktionen + 1** (`fraction-cdu-csu/spd/gruene/linke/afd/fdp/bsw/ssw`, `general-koalition`)
- 3 allgemeine Bundespolitik-Radare (`general-bundestag-plenum`, `-bundesregierung-vorhaben`, `-bundeskabinett`, `general-hib`)
- 16 überregionale Leitmedien (Spiegel, ZEIT, SZ, FAZ, Handelsblatt, WELT, taz, RND, ntv, ZDFheute, ARD, Politico, Table.Media, Tagesspiegel …)

**Die 9 Direkt-Feeds (kein Google News):**
`bmas` (rss) · `bundesregierung` (rss) · `bundestag` (rss) · `ausschuss-arbeit-soziales` (html) ·
`die-linke` (rss) · `linksfraktion` (rss) · `tagesschau-politik` (rss) · `deutschlandfunk-politik` (rss) ·
`dgb` (html).
→ **Wichtig:** 7 dieser 9 liefern in Produktion **0 Dokumente** (s. `quellenzustand.md` §2).

## 3. Quellentyp × Ebene × Anbindung (Katalog)

| Kriterium | Befund |
|---|---|
| **Ebene** | **Bund: praktisch alles.** Land/Landtag: **0 Quellen.** Region: 4 (nur Niedersachsen). |
| **Typ** | committee (Ausschuss-Radare), party (Fraktionen), ministry, bundestag, media, association (Verbände/Gewerkschaften), official (Behörden/Statistik), local (Regional), person (Demo). |
| **Anbindung** | **135 Google-News-Suchen** (inoffizieller Aggregator, fragiler `batchexecute`-URL-Auflöser) vs. **9 Direkt-Feeds**. Keine echte API außer **DIP** (Bundestag, offiziell, strukturiert). |
| **Parser** | RSS = Regex (keine XML-Lib), HTML-Fallback = Startseiten-Scrape, DIP = JSON-API. |
| **Themen/Ausschüsse** | Alle 22 Bundestags-Ausschüsse als neutrales Radar vorhanden; **fachliche Tiefe (Fachmedien/Verbände/Prozessquellen) nur für Arbeit & Soziales.** |
| **Region** | 27 Bundesland-/Wahlkreis-Quellen konfiguriert, aber Kuratierung behält nur die 4 hochprioren Niedersachsen-Quellen (media-Regionalquellen mit Priorität <64 fallen raus). |

## 4. Offizielle Bundes-Datenquelle: DIP (aktiv)

- `dip.js` bindet die **offizielle Bundestags-DIP-API** an (Drucksachen/Vorgänge). Anders als im alten
  Audit (2026-07) ist DIP **jetzt verdrahtet und aktiv**: `scheduler.js:170-174` ergänzt DIP-Rohitems im
  Crawl, sobald `DIP_API_KEY` gesetzt ist.
- **Live-Beleg:** `source_id='dip'` hat **50 Dokumente (37 in 7 Tagen)**, letzter Abruf 2026-07-13.
  Das ist die **einzige amtliche, strukturierte Originalquelle** im Bestand und liefert verlässlich.

## 5. Katalog-Drift: Orphan-Quellen (liefern Docs, sind aber nicht im Katalog)

13 `source_id` erzeugen `raw_documents`, stehen aber **nicht** in der aktuellen `sources.js`
(Rückstände früherer Katalog-Versionen). Die Kuratierung ignoriert sie beim Laden, die alten Dokumente bleiben:

- **8× `cem-ince-news-*`** (`-themen-medien` 114, `-fraktion-partei` 89, `-ausschuss-themen` 88,
  `-regierung-vorhaben` 47, `-ministerien` 33, `-region` 23, `-bmas-vorhaben` 31, `-bundesregierung-vorhaben` 50)
  — teils noch tagesaktuell (14.–114 Docs), teils stehengeblieben (07-07).
- **4× `test-mdb-news-*`** — Test-Profil-Rückstände, **alle seit 2026-07-02 tot** (0 Docs/7 d).
- **1× `dip`** (siehe §4, gewollt aktiv, nur nicht als `v1Sources`-Eintrag geführt).

→ Empfehlung: `test-mdb-*` als eindeutig toten Testrückstand markieren; `cem-ince-news-*` sind
Legacy-Mehrfachquellen des Piloten, die durch die eine `cem-ince-news`-Personenquelle abgelöst wurden.

## 6. Verarbeitungskette (Kurz)

Crawl (RSS-Regex/HTML/DIP-JSON, Concurrency 20, Timeout 7 s, TLS **aktiv**) → Dedup pro Lauf
(`sha256(title|url|date)`) → `raw_documents` → **Understanding** (LLM, global, mandantenlos) →
`knowledge_objects` (231) → **Matching** (`matching.js`, deterministisch, pgvector/berechnetes Embedding,
**keine KI**) → pro Profil bewertet → Lage/Radar/Helmut/Büro. Verknüpfung Roh↔KO über
`ko_document_links` (**1127 Links**, ⌀ ~6 Rohdokumente je verstandenem KO).
