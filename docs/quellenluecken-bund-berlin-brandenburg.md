# Quellenlücken & Abschlussentscheidung — Bund, Berlin, Brandenburg (Helmut)

**Stand:** 2026-07-13 · **Modus:** rein lesend, keine Quellen hinzugefügt, keine Prod-/Cron-/Migrations-/
Secret-Änderung. Belege in `quellenbestand.md`, `quellenzustand.md`, `quellenabdeckung-profile.md`,
`docs/quellen-audit.csv`.

---

## 1. Besondere Prüfungen — Ist-Abdeckung im Katalog

### Bundesebene

| Bereich | Abdeckung | Beleg / Lücke |
|---|---|---|
| **Bundestag** | ✅ (aber Direktfeed tot) | `general-hib` 127, `general-bundestag-plenum` 80, **`dip` 50 (amtlich)**. Direktfeed `bundestag` **0 Docs** → nur zweithand. |
| **Bundesregierung** | ⚠️ | `general-bundesregierung-vorhaben` 58, `general-bundeskabinett` 52. Direktfeed `bundesregierung` **0 Docs**. |
| **Bundesrat** | ⚠️ eng | `news-bundesrat-soziales` 22 + `process-bundesrat-sozialpolitik` 13 — **nur mit Sozial-Query** (Social-Gate). |
| **Bundesministerien** | ⚠️ nur Sozialressorts | BMAS 19, BMG-Pflege 37, BMF/BMFSFJ nur sozialpolitisch. Andere Ressorts: keine eigene Quelle. |
| **Alle Bundestagsparteien/Fraktionen** | ✅ neutral | `fraction-*` für CDU/CSU 200, SPD 151, Linke 83, FDP 73, BSW 47, Grüne 41, AfD 39, SSW 40. **Aber: Partei-Direktquellen nur für Die Linke** (7 Parteien ohne eigenes Gate). |
| **Bundestagsausschüsse** | ✅ alle 22 | je 1 neutrales Google-News-Radar; **Fachtiefe nur bei Arbeit & Soziales**. |
| **Überregionale Medien** | ✅ | 16 Leitmedien (DLF 471, Tagesschau 338, …). |
| **Regionale Medien** | ❌ (bis auf NDS) | per Kuratierung weggekürzt (Priorität <64). |
| **Fachmedien** | ⚠️ nur sozial | LTO/Haufe/Ärzteblatt/WirtschaftsWoche — alle Social-Gate. |
| **Verbände** | ⚠️ nur Sozialverbände | VdK/SoVD/Paritätische/Caritas/Diakonie/BDA/BDI/DGB. |
| **Gewerkschaften** | ✅ (im Sozial-Gate) | ver.di 53, IG Metall 39, DGB (Direkt tot). |

### Berlin & Brandenburg (Landesebene) — **durchgängig 0 Crawl-Quellen**

| Bereich | Berlin | Brandenburg |
|---|---|---|
| Landtag / Abgeordnetenhaus | ❌ 0 | ❌ 0 |
| Landesregierung / Senat / Staatskanzlei | ❌ 0 | ❌ 0 |
| Landesministerien | ❌ 0 | ❌ 0 |
| Landtagsausschüsse | ❌ 0 | ❌ 0 |
| Fraktionen auf Landesebene | ❌ 0 | ❌ 0 |
| Schriftliche Anfragen / Drucksachen (Land) | ❌ 0 | ❌ 0 |
| Plenum (Land) | ❌ 0 | ❌ 0 |
| Regionale Leitmedien | ❌ weggekürzt (rbb24, Berliner Ztg, Tagesspiegel-Regional) | ❌ weggekürzt |
| Lokale Medien | ❌ | ❌ |

> Die einzigen Land-Bezüge im Code: **`sourceSafety.js` führt 17 Landtags-Domains** (u. a.
> `parlament-berlin.de`, `landtag.brandenburg.de`) als **passive Sicherheits-Whitelist** — das ist
> **keine Crawl-Quelle**, sondern erlaubt solche Links nur, falls sie zufällig auftauchen.

## 2. Abschlussbewertung

### a) Gesunde vorhandene Quellen
Neutrale Bundes-Basis trägt zuverlässig: **22 Ausschuss-Radare, 8 Fraktionen, Leitmedien
(DLF 471 / Tagesschau 338), `general-hib` 127, DIP 50** (amtlich). Sozial-Fachtiefe für Cem vollständig
und tagesfrisch. Frische (1.273 Docs/24 h), Link-Qualität (98,6 %) und Dedup (0 exakte Dubletten) sind gut.

### b) Defekte oder ungenutzte Quellen
- **Defekt:** 7 von 9 Direkt-Feeds mit **0 Docs** — `bundestag`, `bundesregierung`, `die-linke`,
  `linksfraktion`, `dgb`, `ausschuss-arbeit-soziales` (html), (dazu die 2 HTML-Scrapes generell).
  → **Originalquellen-Verlust**, Inhalte nur zweithand.
- **Ungenutzt/leer:** viele `official`-/`institution-`/`signal-`/`radar-`-Quellen mit 0 Docs/7 d
  (Arbeitsagentur, Destatis, IAB, OECD, ILO, Eurofound, Bundesrechnungshof, Minijob, Zoll, `news-rnd`,
  `news-table-media`). Konfiguriert, aber ohne Ertrag.
- **Nie genutzt (real):** Alle Flächen laufen produktiv **nur für `cem-ince`** (78 Decisions, 1 Profil-Embedding).

### c) Doppelte Quellen (Katalog-Drift)
13 Orphan-`source_id` außerhalb des Katalogs: **4× `test-mdb-*`** (tot seit 07-02 → **löschbarer Testmüll**),
**8× `cem-ince-news-*`** (Legacy-Mehrfachquellen des Piloten, durch `cem-ince-news` abgelöst),
**1× `dip`** (gewollt). Keine Gefahr, aber Aufräumkandidaten.

### d) Unterversorgte Bundestagsprofile
- **Sanae Abdi (SPD/Entwicklung/NRW):** unterversorgt — keine Fach-, keine Regional-, keine Partei-Direktquelle.
- **Knut Abraham (CDU/Auswärtiges/Brandenburg):** unterversorgt — dito.
- **Doris Achelwilm (Linke/Digitales/Bremen):** teilversorgt (Basis + Linke-Direkt), aber keine Fachtiefe/Region.
- Grundversorgung über die neutrale Basis besteht bei allen dreien; es fehlt **Fachtiefe + Region**.

### e) Sind Berlin & Brandenburg der richtige erste Landtagsausbau?
**Ja — aber mit Vorbedingung.** Berlin und Brandenburg sind sinnvoll als erstes Landtagspaket:
- Klar abgegrenzte, überschaubare Ebene; beide Länder in DIP/Bund oft mitverhandelt (Lausitz-Strukturwandel,
  Wohnen/Mieten Berlin) → hohe Anschlussfähigkeit an vorhandene Bundesinhalte.
- **Aber:** Ein Landtagspaket wirkt **erst**, wenn zwei strukturelle Blocker gelöst sind, die **nichts mit
  neuen Quellen** zu tun haben:
  1. **`political_level` muss befüllt werden** (Understanding), sonst gehen Landesinhalte im Bundesrauschen unter.
  2. **Regional-Kuratierung entkoppeln** (`keepCuratedSource`): Land-/Regionalquellen dürfen nicht an der
     Prioritätsschwelle 64/68 sterben, und das doppelte Social-Gate auf `stateAndConstituencySources`
     muss weg. Ohne diese Entkopplung würden neue Berlin/Brandenburg-Quellen genauso weggekürzt wie heute.

### f) Welche Quellenarten fehlen vermutlich (priorisiert)
1. **Landtag/Landesregierung/Landesministerien/Landtagsfraktionen** für Berlin & Brandenburg
   (Plenum, Ausschüsse, Drucksachen, schriftliche Anfragen) — **größte Lücke**.
2. **Regionale Leit-/Lokalmedien** je Land, **thematisch neutral** (nicht sozial-gegated): Berlin (rbb24,
   Tagesspiegel, Berliner Zeitung, Berliner Morgenpost), Brandenburg (rbb Brandenburg aktuell, MAZ, Lausitzer Rundschau).
3. **Politikfeld-Tiefe jenseits Soziales** (Gesundheit, Außen/Menschenrechte, Digitales/Netz, Finanzen/Steuer,
   Verteidigung, Klima) — je 2-3 Fachmedien + 2-3 Fachverbände, **feld-getaggt** statt social-getaggt.
4. **Partei-Direktquellen** für die übrigen 7 Parteien (cdu.de, csu.de, spd.de, gruene.de, fdp.de, afd.de, bsw-vg.de).
5. **Reparatur der toten Direkt-Feeds** (bundestag.de, bundesregierung.de, die-linke.de) — Infrastruktur,
   keine neue Quelle: die amtlichen Originale zurückholen.

### g) Welche Quellen NICHT aufnehmen
- Keine weiteren **Google-News-`site:`-Suchen**, wo ein **Direkt-RSS** existiert (Klumpenrisiko).
- Keine **breite Massenerweiterung** (verschärft nur die Google-News-Drosselung, ohne Lücken zu schließen).
- Keine der **toten `official`-/`institution-`/`signal-`-Quellen** neu vervielfältigen, bevor geklärt ist,
  warum sie 0 Docs liefern.
- **`test-mdb-*`** nicht reaktivieren (Testmüll).

## 3. Empfohlener Umsetzungssprint (nach diesem Audit)

**Sprint „Landesfähig machen" (Reihenfolge zwingend):**
1. **Understanding:** `political_level` (Bund/Land/EU) je KO befüllen — Voraussetzung für Ebenentrennung.
2. **Kuratierung entkoppeln:** Regional-/Landesquellen von der Prioritätsschwelle und vom Social-Gate lösen
   (neutrales `regional`-Set).
3. **Landtagspaket Berlin + Brandenburg** bauen: je Land Landtag (Plenum/Drucksachen/Anfragen),
   Landesregierung/Staatskanzlei, 1-2 Landesministerien, Landtagsfraktionen, 3-4 neutrale Regionalmedien.
4. **Direkt-Feeds reparieren** (bundestag.de/bundesregierung.de/die-linke.de) — Originalquellen zurück.
5. **Optional danach:** Partei-Direktquellen + eine zweite Politikfeld-Tiefe (z. B. Gesundheit oder Außen).

> **Wichtig:** Schritte 1-2 sind **Voraussetzung** — ohne sie verpufft Schritt 3. Quellen hinzufügen
> allein löst die Versorgung nicht, solange Ebenentrennung und Kuratierung Landesinhalte verwerfen.
