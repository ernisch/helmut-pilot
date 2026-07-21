# Sprint 3 — Taxonomie (Phase 2) und Beschaffungsstrategie (Phase 4)

## 1. Verbindliche Quellen-Taxonomie (Phase 2)

Die Taxonomie ist **datengetrieben** (`master/taxonomy.js`): eine neue Kategorie, Institution,
Partei, Region oder politische Ebene entsteht durch **Hinzufügen einer Datenzeile** — nie durch
Code-Änderung (Abnahme §7/§8; Tests §23/§24/§25 belegen neue Partei/Ausschuss/Bundesland ohne
Codeänderung). Keine Produktlogik ist in der Taxonomie fest codiert.

Die **26 inhaltlichen Kategorien** (jede trägt strukturelle Vor-Einstufungen: Belegfunktion,
inhaltliche Haltung, amtlich ja/nein, primärquellenfähig, Standard-Beschaffungspriorität):

| # | Kategorie (id) | Gruppe | Belegfunktion | Haltung | amtlich | Tier |
|---|----------------|--------|---------------|---------|---------|------|
| 1 | Parlament (`parlament`) | parlament | official_primary | fact | ja | 1 |
| 2 | Bundesregierung (`bundesregierung`) | exekutive | official_primary | fact | ja | 1 |
| 3 | Ministerium (`ministerium`) | exekutive | official_primary | fact | ja | 1 |
| 4 | Behörde (`behoerde`) | exekutive | data_source | fact | ja | 1 |
| 5 | Bundesrat (`bundesrat`) | parlament | official_primary | fact | ja | 1 |
| 6 | Partei (`partei`) | parteipolitik | direct_interest | **position** | nein | 1 |
| 7 | Fraktion (`fraktion`) | parteipolitik | direct_interest | **position** | nein | 1 |
| 8 | Ausschuss (`ausschuss`) | parlament | official_primary | fact | ja | 1 |
| 9 | Abgeordnete (`abgeordnete`) | parteipolitik | direct_interest | **position** | nein | 3 |
| 10 | Bundesland (`bundesland`) | exekutive | official_primary | fact | ja | 1 |
| 11 | Landesregierung (`landesregierung`) | exekutive | official_primary | fact | ja | 1 |
| 12 | Landtag (`landtag`) | parlament | official_primary | fact | ja | 1 |
| 13 | Wahlkreis (`wahlkreis`) | parlament | official_primary | fact | ja | 3 |
| 14 | Kommunale Institution (`kommunal`) | exekutive | official_primary | fact | ja | 3 |
| 15 | Gericht (`gericht`) | kontrolle_justiz | official_primary | fact | ja | 1 |
| 16 | Rechnungshof (`rechnungshof`) | kontrolle_justiz | data_source | fact | ja | 1 |
| 17 | Fachverband (`fachverband`) | interessenvertretung | direct_interest | **position** | nein | 3 |
| 18 | Gewerkschaft (`gewerkschaft`) | interessenvertretung | direct_interest | **position** | nein | 3 |
| 19 | Arbeitgeberverband (`arbeitgeberverband`) | interessenvertretung | direct_interest | **position** | nein | 3 |
| 20 | Wissenschaft/Forschung (`wissenschaft`) | wissenschaft_analyse | data_source | analysis | nein | 3 |
| 21 | Thinktank (`thinktank`) | wissenschaft_analyse | journalistic | analysis | nein | 3 |
| 22 | NGO (`ngo`) | interessenvertretung | direct_interest | **position** | nein | 3 |
| 23 | Überregionale Medien (`medien_ueberregional`) | medien | journalistic | journalistic | nein | 4 |
| 24 | Regionale Medien (`medien_regional`) | medien | journalistic | journalistic | nein | 4 |
| 25 | Fachmedien (`fachmedien`) | medien | journalistic | journalistic | nein | 3 |
| 26 | Öffentliches Datenportal (`datenportal`) | daten | data_source | fact | ja | 1 |

**Suchanbieter** (`suchanbieter`, Google News o. ä.) ist bewusst **keine** der 26 inhaltlichen
Kategorien, sondern ein eigener **technischer** Typ (Discovery/Rückfallebene). Er ist nie
Primärquelle, nie amtlich, immer Tier 5 — und wird in der Coverage-Matrix separat als Abhängigkeit
ausgewiesen (Abnahme §9).

**Gewichtung (Phase 9):** `content_stance` trennt **Fakt** von **Position**. Eine Partei/Fraktion/ein
Verband ist Primärquelle für die **eigene** Position, aber nie ein neutraler Faktenbeleg. Amtliche
Statistik/Gerichte/Rechnungshöfe/Parlamente sind Faktenquellen. Faktengewicht > Analyse >
Journalismus > Position (`coverage-matrix.weightOf`).

## 2. Beschaffungsstrategie — Rangfolge (Phase 4)

`master/acquisition.js` leitet die Aufnahme-Priorität **deterministisch** aus (Abrufmethode,
Quellentyp) ab — kein Anbieter-Sonderfall.

| Tier | Rang | Was |
|------|------|-----|
| 1 | Offizielle strukturierte Primärquellen | Amtliche APIs/Datensätze/Register (DIP, Destatis, offene Datenportale) |
| 2 | Offizielle Feeds/APIs/Sitemaps/Pressebereiche | Direkte Feeds amtlicher Herausgeber |
| 3 | Seriöse Fach-/Sekundärquellen | Verbände, Gewerkschaften, Arbeitgeber, Wissenschaft, Thinktanks, Fachmedien, NGOs |
| 4 | Regionale und überregionale Medien | Journalistische Einordnung, kein Primärbeleg |
| 5 | Suchanbieter (Discovery/Rückfall) | Nur Ergänzung — nie alleinige Versorgung (Abnahme §9) |

Regel: Ein Suchanbieter-Abrufweg (`googlenews_search`) ist **immer** Tier 5 — unabhängig davon,
welchen Herausgeber die Suche adressiert.

Verteilung im Startkatalog (107 Quellen): **Tier 1: 16 · Tier 2: 44 · Tier 3: 11 · Tier 4: 13 ·
Tier 5: 23** (die 23 sind die heute suchbasiert abgedeckten Ausschüsse — siehe Coverage-Bericht).
