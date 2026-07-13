# Quellenabdeckung je Profil (Helmut)

**Stand:** 2026-07-13 · **Modus:** rein lesend · **Methode:** Nachbau der produktiven Gate-Logik
(`scheduler.getSourcesForProfile` / `sourceAllowedForProfile` / `themeTermInTopic`, Zeilen 422-498)
gegen den kuratierten Katalog (`v1Sources`, 144 Quellen). Simulation ohne Netz/Write
(`scratchpad/gate.js`). Docs-Zahlen aus Prod-Supabase.

Geprüft: **Cem Ince** (Pilot), **Sanae Abdi**, **Knut Abraham**, **Doris Achelwilm** (echte öffentliche
Mandatsdaten, 21. WP) sowie **zwei anonyme Landtags-Testmodelle** (Berlin, Brandenburg — keine echten
Konten, keine erfundenen Inhalte, nur minimal plausible Testprofile).

> **Kernbild:** Nur **Cem** ist voll versorgt (142 der 144 Quellen). **Alle anderen fünf Profile
> bekommen fast ausschließlich die 53 neutralen Bundes-Basisquellen** — **keine** fachliche Tiefe,
> **keine** Regionalquelle, und (außer Die-Linke-Profilen) **keine** Partei-Direktquelle. Die beiden
> **Landtagsprofile bekommen ausschließlich Bundesinhalte** — nichts über ihren eigenen Landtag.

---

## 1. Freigegebene geteilte Quellen je Profil (von 144)

| Profil | Ebene / Partei / Feld | **freigegeben** | neutral | thema | regional | partei | gesperrt |
|---|---|---:|---:|---:|---:|---:|---:|
| **Cem Ince** | Bund · Linke · Arbeit & Soziales · NDS | **142** | 53 | **84** | 3 | 2 | 1 |
| **Sanae Abdi** | Bund · SPD · Entwicklung · Köln/NRW | **53** | 53 | 0 | 0 | 0 | 90 |
| **Knut Abraham** | Bund · CDU/CSU · Auswärtiges/Menschenrechte · BB | **53** | 53 | 0 | 0 | 0 | 90 |
| **Doris Achelwilm** | Bund · Linke · Digitales/Finanzen · Bremen | **55** | 53 | 0 | 0 | **2** | 88 |
| **ANON Berlin** | **Landtag** · — · Inneres/Wohnen · Berlin | **53** | 53 | 0 | 0 | 0 | 90 |
| **ANON Brandenburg** | **Landtag** · — · Wirtschaft · Brandenburg | **53** | 53 | 0 | 0 | 0 | 90 |

*(Zusätzlich erhält jedes vollständige Profil eigene, dynamisch generierte Personen-/Mandats-Suchen —
`personNewsSource` + `mandateNewsSources` —; diese zählen nicht zum geteilten Katalog. Für die
Landtags-Testmodelle ohne Partei greift die Basis, aber keine themen-/partei-/regionalgebundene Quelle.)*

## 2. Was das konkret bedeutet — pro Profil

### Cem Ince (Pilot) — voll versorgt
- **Passt & liefert:** alle 84 Sozial-Fachquellen feuern (Fachmedien, VdK/SoVD/Paritätische/Caritas,
  ver.di/IG Metall, alle Prozess-/Radar-Quellen, 25 Themen-Bündel), + 2 Die-Linke-Direktgates
  + 3 Niedersachsen-Regionalquellen.
- **Ausschüsse/Themen:** Arbeit & Soziales vollständig; alle 22 Ausschuss-Radare über die Basis.
- **Region:** Niedersachsen/Salzgitter/Wolfenbüttel abgedeckt (die 4 überlebenden Regionalquellen sind **seine**).
- **Lücke:** keine relevante.

### Sanae Abdi (SPD, Entwicklung, Köln/NRW) — unterversorgt
- **Passt grundsätzlich:** neutrale Basis inkl. `committee-entwicklung` (42 Docs/gesamt) und
  `fraction-spd` (151) → ihr Fachausschuss und ihre Fraktion liefern **über die Basis** Rohmaterial.
- **Fehlt:** **0 Entwicklungs-Fachmedien/-Verbände** (existieren nicht — nur Sozial-Fachquellen), **0 SPD-
  Direktquelle** (nur `news-spd-*` mit Social-Gate → gesperrt), **0 NRW-/Köln-Regionalquelle** (per
  Kuratierung weggekürzt, s. §3).
- **Ebene:** Bund ok, Region fehlt komplett.

### Knut Abraham (CDU/CSU, Auswärtiges/Menschenrechte, Brandenburg) — unterversorgt
- **Passt grundsätzlich:** `committee-auswaertiges` (26) + `committee-menschenrechte` (47) +
  `fraction-cdu-csu` (200) über die Basis.
- **Fehlt:** **0 außenpolitische/menschenrechtliche Fachquelle**, **0 CDU/CSU-Direktgate**,
  **0 Brandenburg-Regionalquelle** (weggekürzt). Als Brandenburg-Bezug bleibt nur Google-News-Rauschen.

### Doris Achelwilm (Die Linke, Digitales/Finanzen, Bremen) — teilversorgt
- **Passt & liefert:** neutrale Basis inkl. `committee-digitales` (68) + `committee-finanzen` (92);
  **+2 Die-Linke-Direktgates feuern** (Partei-Match).
- **Fehlt:** **0 Digital-/Netzpolitik-/Steuer-Fachquelle** (nur Sozial-Fachquellen existieren), **0 Bremen-
  Regionalquelle** (weggekürzt). Trotz gleicher Partei wie Cem bekommt sie **keine** seiner Sozial-Fachtiefe
  (Themen-Gate greift korrekt nicht) — gutes Trennungssignal, aber eben auch keine **eigene** Tiefe.

### ANON Berlin (Landtag) & ANON Brandenburg (Landtag) — strukturell unversorgt
- **Passt:** nur die 53 neutralen **Bundes**-Basisquellen.
- **Fehlt vollständig:** **jede Landesebene** — kein Landtag, keine Landesregierung, kein
  Landesministerium, kein Landtagsausschuss, keine Landtagsfraktion, keine Landes-Drucksache/Anfrage,
  keine regionale Leit-/Lokalzeitung (weggekürzt). Ein Landtagsprofil sieht heute **ausschließlich
  Bundespolitik** — das ist für Landespolitik faktisch unbrauchbar.

## 3. Warum Regionalquellen für alle außer Cem fehlen (Kuratierungs-Effekt)

- 27 Bundesland-/Wahlkreis-Quellen und 20 Regionalmedien sind **konfiguriert**, aber
  `keepCuratedSource` behält `type:"media"`-Regionalquellen nur bei **Priorität ≥ 64** und
  `type:"local"` nur bei **≥ 68**. Die Berlin/Brandenburg/Köln/Bremen-Quellen laufen mit Priorität **58**
  → **werden weggekürzt.** Es überleben **nur die 4 hochprioren Niedersachsen-Quellen (Priorität 72)** —
  also genau Cems Heimatregion.
- Zusätzlich tragen `stateAndConstituencySources` **regional UND** `SOCIAL_THEME_TERMS` → doppeltes Gate:
  Selbst wenn sie überlebten, würden sie nur bei sozialpolitischem Profil feuern.
- **Folge:** Regionale Versorgung ist ein **Cem-Sonderfall**, kein Produktmerkmal.

## 4. Vorhanden, aber durch Matching/Ranking verloren

Auch wo Rohmaterial da ist, gehen Treffer verloren:

1. **`political_level` bei allen 231 KOs leer** → Matching kann **Bund nicht von Land trennen**. Selbst
   wenn es Landtagsinhalte gäbe, wären sie nicht als „Land" erkennbar und würden gegen Bundesrauschen
   untergehen. Für die Landtagsprofile ist das der **härteste** verdeckte Verlust.
2. **KO-`embedding` = 0 gespeichert / `matching_results` = 0** → der produktive pgvector-Pfad persistiert
   nichts; Matching läuft über read-time berechnete Embeddings. Für ein einzelnes Profil funktioniert das
   (Cem), skaliert aber nicht als vorberechneter Index.
3. **Regions-Dimension quasi leer:** `mentioned_locations` fast nur „Deutschland"; **kein Brandenburg**,
   kaum Landesbezüge → regionsbasiertes Matching liefert für Land-Profile ~0.
4. **Partei-Schreibvarianten** (SPD/„CDU/CSU"/„Die Linke"/„Linke"/„DIE LINKE") — hier **greift** die
   Normalisierung in `matching.js` (`normalizeParty`/`normalizeCommittee`) korrekt; **kein** Verlust.
5. **Themen-Wortgrenze** (`themeTermInTopic`): korrekt restriktiv (kein „pflege" in „Denkmalpflege").
   Nebenwirkung: Nicht-Sozialprofile matchen die 84 Sozial-Fachquellen bewusst nicht — richtig, aber es
   fehlt der **Ersatz** (feld-eigene Fachquellen).

## 5. Fazit Profilabdeckung

| Profil | Versorgung | Hauptlücke |
|---|---|---|
| Cem Ince | **voll** | — |
| Doris Achelwilm | **teilweise** (Basis + Linke-Partei) | eigene Fachtiefe (Digitales/Finanzen), Bremen-Region |
| Sanae Abdi | **unterversorgt** | Entwicklungs-Fachtiefe, SPD-Direkt, NRW-Region |
| Knut Abraham | **unterversorgt** | Außen-/Menschenrechts-Fachtiefe, CDU-Direkt, Brandenburg-Region |
| ANON Berlin (Landtag) | **strukturell leer** | komplette Landesebene |
| ANON Brandenburg (Landtag) | **strukturell leer** | komplette Landesebene |

**Kernaussage:** Helmut ist heute ein **voll ausgebautes Ein-Feld-/Ein-Region-Produkt (Arbeit & Soziales,
Niedersachsen, Die Linke)**. Für jedes andere Bundesprofil trägt die **neutrale Bundes-Basis** (22
Ausschuss-Radare + 8 Fraktionen + Leitmedien + DIP) eine **brauchbare Grundversorgung**, aber **keine
Fachtiefe und keine Region**. Für **Landtagsprofile fehlt die Ebene ganz**.
