# Quellenabdeckung & Source Health — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 2** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. **Belegbasis:** `lib/helmut/sources.js`, `crawler.js`, `sourceSafety.js`, `storage.js`; SELECT-Abfragen gegen Prod-Supabase `ddckuvvpcytqbyfmbvie` (`raw_documents=4594`).

> **Kernbefund:** Helmut crawlt technisch sauber und **tagesfrisch** (jüngstes Dokument 2026-07-12 10:00 UTC; **1.180 Dokumente < 24 h**, 3.601 < 7 Tage). Die Breite ist auf dem Papier groß (~566 konfiguriert → ~130 kuratiert), **aber inhaltlich massiv auf EIN Politikfeld — Arbeit & Soziales — und das Profil des Pilotmandanten (Person und Partei) zugeschnitten.** → Empfehlung **B (gezielte Quellenpakete)**, keine Massenerweiterung.

---

## 1. Quellen-Inventar (`sources.js`, hartkodiert)

**Herkunft:** Quellen sind **im Code hartkodiert** (`v1Sources`, sources.js:570-596), geladen über `storage.getSources()` (storage.js:1545). Der Store merged nur `custom:true`-Quellen dazu — **„Code ist die Wahrheit"** (storage.js:1425-1429). Die Supabase-Tabelle `public.sources` (**0 Zeilen**) ist **totes Legacy-Schema** — kein `from('sources')` im Ladepfad.

**Generierung:** Fabrikfunktionen `googleNewsSource` (:45), `siteSource` (site:-Query → Google News, :63), `directSource` (:35). Das große Volumen entsteht aus dem **Kreuzprodukt** `deepTopicSources = 25 Themen × 14 Kontexte = 350 Quellen` (:119-130, 429) — **alle sozialpolitisch**.

| Gruppe | # | crawlMethod | Theme-Gate |
|---|---|---|---|
| coreSources | 11 | 10 rss / 2 html (ausschuss, dgb) / 1 person | gemischt |
| officialSearchSources | 8 | Google-News | SOCIAL |
| mediaSources | 23 | Google-News | neutral |
| broadGermanMediaSources | 16 | Google-News | neutral |
| regionalSources | 14 | Google-News | **regional** |
| publicBroadcastRegionalSources | 6 | Google-News | **regional** |
| specialistSources | 10 | Google-News | SOCIAL |
| policySpecialistSources | 5 | Google-News | SOCIAL |
| associationSources | 10 | Google-News | SOCIAL |
| politicalActorSources | 8 | Google-News | SOCIAL |
| topicRadarSources | 11 | Google-News | SOCIAL |
| **deepTopicSources (25×14)** | **350** | Google-News | SOCIAL |
| governmentProcessSources | 8 | Google-News | SOCIAL |
| stateAndConstituencySources (27 Regionen) | 27 | Google-News | **regional + SOCIAL** |
| additionalInstitutionSources | 12 | Google-News | SOCIAL |
| socialPolicySignalSources | 12 | Google-News | SOCIAL |
| **bundestagCommitteeSources (alle 22 Ausschüsse)** | 22 | Google-News | **neutral** |
| **bundestagFractionSources (alle 8 Fraktionen)** | 8 | Google-News | **neutral** |
| generalPoliticsSources | 5 | Google-News | neutral |
| **Summe roh** | **~566** | | |

**Google-News-Abhängigkeit = strukturell dominant.** Nur **7 echte Direkt-RSS-Feeds** (bmas, bundesregierung, bundestag, die-linke, linksfraktion, tagesschau, deutschlandfunk). **Alle übrigen ~550 Quellen** sind `news.google.com/rss/search?q=…`, die den fragilen Google-News-URL-Auflöser (batchexecute-Decoding, crawler.js:165-229) durchlaufen. Kuratierung (`slice(0,560)`, an per Default) behält Direktfeeds immer, drosselt Google-News nach Priorität → kuratierter Satz ≈130. Von den 350 deepTopicSources überlebt pro Thema **nur genau EINE** Kontext-Variante (`· Ausschuss Arbeit und Soziales$`, :561) → 25 statt 350, weiter auf den Sozialausschuss verengt.

**Theme-Gating (`SOCIAL_THEME_TERMS`, sources.js:16-22):** Jede thematisch tiefe Quelle (Fachmedien, Verbände, Prozess-/Radar-Quellen, Institutionen) trägt das Social-Theme-Gate und wird **nur** an sozialpolitische bzw. Demo-Profile ausgespielt. Die „neutrale Basis" (alle 22 Ausschüsse, alle 8 Fraktionen, Leitmedien) liefert Breite; **jede Fachtiefe ist an Arbeit & Soziales gekoppelt.**

---

## 2. Crawler-Technik (`crawler.js`) — Korrektur zum alten CTO-Audit

| Aspekt | Befund | Beleg |
|---|---|---|
| RSS-Parser | **Regex-basiert**, keine XML-Lib (`<item>`/`<entry>` per matchAll) | :351-368 |
| Concurrency | Quellen 20 parallel; URL-Auflösung 4 | :6, :111 |
| Timeout | 7000 ms pro Request (Inaktivität) | :5, :599 |
| Retries | Kein genereller Fetch-Retry; Google-Decoding 2 Versuche; Redirects ≤6 | :176, :588 |
| **TLS** | **`rejectUnauthorized` NICHT deaktiviert → Zertifikatsprüfung AKTIV** | :554-556, :601 |
| Response-Cap | 10 MB Body-Limit | :16, :569 |
| Keyword-Filter | Nur für `type:"person"` (Feed `<pilot-mandats-id>-news`); übrige Quellen ungefiltert | :131, :343 |
| Dedup | SHA-256 über `title\|hashUrl\|hashDate` | :434, :519 |
| linkType | `classifyLinkType` → direct/publisher/google_proxy/missing; `url=""` wenn nicht direct | :430-431, :460-466 |
| Kandidaten-Cap | max 1000 Roh-Kandidaten/Crawl, priorisiert | :7, :95-108 |

**Korrektur:** Das alte Audit (2026-07-01) meldete „TLS-Verifikation global aus" als P1-Risiko. **Das ist im aktuellen Code nicht mehr der Fall** — TLS-Prüfung ist aktiv. ✅

**Verbleibende Fragilität (SPOF):** Der Nutzwert der ~550 Google-News-Quellen hängt am regex/batchexecute-Decoder. Bricht Googles Wrapper (Kommentar :213 räumt das ein), degradieren fast alle Quellen gleichzeitig auf `linkType != direct` → `url=""`. Aktuell funktioniert es (siehe §3), ist aber ein **Single Point of Failure**.

---

## 3. DB-Analyse `raw_documents` (4.594 Zeilen, SELECT-only)

**Frische — sehr gut:** jüngster Crawl **2026-07-12 10:00 UTC** (heute); ältester 2026-07-02 (~10-Tage-Fenster). **< 24 h: 1.180 · < 7 Tage: 3.601 · < 30 Tage: 4.585.**

**Link-Qualität — gut:** `direct` **4.529 (98,6 %)**, publisher 53, google_proxy 3, `missing` 0, null 9. Leere URL: 56 = publisher(53)+google_proxy(3), konsistent.

**Duplikate — unkritisch:** distinct `content_hash` = 4.594 = total → **keine exakten Dubletten**. `dup_title_est ≈ 261` (gleicher Titel, anderer Hash) = normale Cross-Source-Überlappung.

**Verteilung nach `source_type` (mit Frische):**

| source_type | n | < 24 h | < 7 d | jüngster Crawl |
|---|---|---|---|---|
| committee | 1.659 | 540 | 1.381 | heute 10:00 |
| media | 1.442 | 247 | 1.025 | heute 10:00 |
| party | 718 | 165 | 554 | heute 10:00 |
| bundestag | 334 | 79 | 297 | heute 10:00 |
| ministry | 233 | 85 | 196 | heute 10:00 |
| association | 178 | 64 | 137 | heute 10:00 |
| **local (regional)** | **21** | **0** | **11** | **2026-07-11 08:14** |
| null | 9 | 0 | 0 | — |

**Top-Quellen (Volumen):** Deutschlandfunk 435 · Tagesschau 308 · hib/Bundestag 127 · DIP 50 · ver.di 40 · BMG-Pflege 33 · IG Metall 26 · SPD-Fraktion 24. → Die **Direkt-RSS-Feeds dominieren** das Volumen; Google-News-Quellen liefern viele kleine Beiträge. **121 distinct `source_id`** haben Dokumente erzeugt.

**Katalog-Drift:** Es tauchen `source_id`s auf, die **nicht** in der aktuellen `sources.js` stehen (`dip`, `<pilot-mandats-id>-news-themen-medien`, `bundle-ausschuss-gewerkschaften`) → Legacy-Bestand früherer Katalog-Versionen; die Kuratierung ignoriert verwaiste Store-Quellen, aber alte `raw_documents` bleiben.

**Regional = klare Schwachstelle:** nur **21 local-Dokumente insgesamt, 0 in den letzten 24 h**. Ursache: `stateAndConstituencySources` tragen `regional:true` **UND** `SOCIAL_THEME_TERMS` → **doppeltes Gate**, nur fürs Sozial-Pilotprofil aktiv.

**Politikfeld-Verteilung (Roh-Docs, 7 d, ILIKE-Stichprobe):** Arbeit & Soziales **758** · Digitales 199 · Klima 78 · Wohnen 76 · Verkehr 69 · Verteidigung 56 · Bildung 44 · Landwirtschaft 21 · Außen 18. Die Nicht-Sozialfelder existieren nur als **Grundrauschen** aus den 22 Ausschuss-Radaren (je 1 flache Query) + Fraktionen + Leitmedien — **keine** Fachmedien/Verbände/Prozess-Quellen pro Feld.

---

## 4. Quellenabdeckungsmatrix

„Konfiguriert" = eigene/gezielte Quelle. „Docs (7 d)" = ILIKE-Stichprobe. „Gate" = wird nur bei passendem Profil ausgespielt.

| Zielbereich | Konfiguriert? | Docs (7 d) | Gate | Lücke |
|---|---|---|---|---|
| CDU | ja (Fraktion neutral; news SOCIAL) | 139 | neutral | gering |
| CSU | via CDU/CSU-Fraktion, **keine eigene** csu.de | 33 | — | **mittel** |
| SPD | ja | 173 | neutral | gering |
| Grüne | ja | 109 | neutral | gering |
| Die Linke | **ja, tiefste Abdeckung** (2 Direktfeeds) | 143 | neutral+Pilot | keine |
| FDP | ja | 56 | neutral | gering |
| AfD | ja | 137 | neutral | gering |
| BSW | ja (neutral) | 35 | neutral | gering-mittel |
| Fraktionslose/SSW | nur SSW | — | neutral | mittel |
| Bundesregierung | ja, Direktfeed | 196 (ministry) | neutral | keine |
| Bundesrat | ja | 57 | SOCIAL | mittel (nur sozialpol. Query) |
| Bundestag | ja, 2 Direktfeeds + hib | 297 | neutral | keine |
| **Landtage** | **keine Crawl-Quelle** (nur Safety-Whitelist) | 71 (zufällig) | — | **groß** |
| **Landesregierungen** | **keine gezielte Quelle** | gering | — | **groß** |
| Ministerien | ja (BMAS/BMG/BMFSFJ/BMF) | 196 | tw. SOCIAL | **eng auf Sozialressorts** |
| Ausschüsse | **alle 22** als Radar | 1.381 | neutral | keine (aber je 1 flache Query) |
| Wahlkreise | nur Regionen des Pilotmandanten | in 21 local | regional+SOCIAL | **groß außerhalb Pilot** |
| Regionen/Bundesländer | 27 konfiguriert | **11** | regional+SOCIAL | **groß (Gate blockt)** |
| Verbände | ja (VdK/SoVD/Paritätische/BDA/BDI) | 137 | SOCIAL | **nur Sozialverbände** |
| Gewerkschaften | ja (ver.di/IG Metall/DGB) | in association | SOCIAL | gering |
| Fachthemen | **nur Arbeit & Soziales tief** (350er Matrix) | Arb&Soz 758 | SOCIAL | **groß für andere Felder** |
| überregionale Medien | ja (23) | 1.025 | neutral | keine |
| regionale Medien | ja (20) | 11 | regional | **groß (Gate)** |
| Fachmedien | ja, aber sozial-getönt (LTO/Haufe/Ärzteblatt) | tw. | SOCIAL | **nur arbeits-/sozialrechtlich** |
| offizielle Quellen | ja (Destatis/BA/DRV/Zoll/BRH) | 196 | SOCIAL | eng auf Sozialdaten |

**Pilot-Bias bestätigt:** Nur EIN Personenprofil (`<pilot-mandats-id>-news`, prio 100) ist als Quelle verdrahtet. Die 350er Themen-Matrix, alle Prozess-/Radar-/Institutions-/Spezialquellen tragen `SOCIAL_THEME_TERMS`. **Ein CDU-Verteidigungs- oder Grünen-Klima-Profil bekäme heute kein einziges Fachmedium, keinen Fachverband, keine Prozess-Radar-Quelle seines Feldes — nur die neutrale Basis.**

---

## 5. Bewertung & Empfehlung: **B — gezielte Quellenpakete**

**Nicht A**, weil außerhalb Arbeit & Soziales keine thematische Quellentiefe existiert und Landes-/Regionalebene faktisch leer sind. **Nicht C**, weil Infrastruktur, Crawler, Dedup, Frische und die neutrale Breite solide stehen — eine pauschale Vervielfachung würde nur die Google-News-Drosselung (§2-SPOF) verschärfen, ohne gezielt Lücken zu schließen.

**Konkrete Lücken → Zielquellenarten → erwarteter Nutzen (priorisiert):**

1. **Landtage / Landesregierungen / Landtagsfraktionen (größte Lücke).** Heute nur in der Safety-Whitelist, **keine Crawl-Quelle**. → Paket: pro Bundesland 1× Landtags-RSS/-Suche + Staatskanzlei/Landesregierung + Landtagsfraktion des Mandats. **Nutzen:** bedient Landespolitiker-Profile überhaupt erst; entkoppelt Regionales vom SOCIAL-Gate.
2. **Politikfeld-Tiefe jenseits Arbeit & Soziales.** Je Kernfeld (Gesundheit, Verteidigung, Klima/Energie, Inneres/Migration, Finanzen, Verkehr, Bildung, Digitales) ein kleines Paket: 2-3 Fachmedien + 2-3 Fachverbände + 1 Prozess/Radar-Quelle, **feld-getaggt** statt SOCIAL-getaggt. **Nutzen:** macht Helmut für Nicht-Sozial-Mandate liefer-fähig; nutzt die vorhandene Theme-Gating-Mechanik unverändert.
3. **Regionales entkoppeln.** `regionalSources`/`stateAndConstituencySources` tragen `regional:true` **plus** `SOCIAL_THEME_TERMS` → doppeltes Gate, 0 Docs/24h. → Zweites, thematisch neutrales Regional-Set (nur `regional:true`). **Nutzen:** hebt Wahlkreis-/Regionalabdeckung von aktuell 21 Docs deutlich an.
4. **Partei-Direktquellen vervollständigen.** Eigene Direktfeeds nur für Die Linke. → csu.de, cdu.de, spd.de, gruene.de, fdp.de, afd.de, bsw-vg.de als eigene Partei-/Fraktions-Direktquellen. **Nutzen:** neutrale Parteiabdeckung unabhängig vom Sozial-Query; reduziert Google-News-Abhängigkeit.
5. **Google-News-Klumpenrisiko senken (Infrastruktur).** Wo Direkt-RSS existiert (viele Ministerien/Verbände/Medien), Google-News-Suchen durch Direktfeeds ersetzen. **Nutzen:** robustere Link-Auflösung, geringeres Ausfallrisiko.

> **Wichtiger Zusammenhang zu Phase 3 (Matching):** Mehr Quellen allein lösen die Versorgung **nicht**. Die Knowledge Objects tragen heute **keine** `tags`/`policy_field` (bei allen 217 leer) — d. h. selbst reichlich vorhandene Fachdokumente matchen mangels Themen-Merkmalen nicht auf Profile. Quellenpakete (P2) sind erst **nach** der KO-Anreicherung (P1, siehe `profile-coverage.md`) voll wirksam.

**VERMUTUNG** (read-only, nicht verifizierbar): Ob feld-getaggte Pakete pro Profil tatsächlich greifen, hängt an `scheduler.getSourcesForProfile`/`themeTermInTopic`; die Gate-Logik ist hier aus den Code-Kommentaren (sources.js:8-15, 96-117) abgeleitet.
