# Sprint 3 — Coverage-Matrix (Phase 9) und Shadow-Vergleich (Phase 1)

Zahlen aus dem Startkatalog (107 Quellen) — reproduzierbar über
`scripts/master-catalog-shadow-compare.js` und `master.buildMasterCatalog().coverage`.

## 1. Abdeckungsmatrix (Phase 9)

**Zusammensetzung nach Quellentyp** (107 Quellen): parlament 2, bundesrat 1, bundesregierung 1,
datenportal 2, rechnungshof 1, gericht 1, behoerde 1, ministerium 16, partei 9, fraktion 6,
ausschuss 24 (23 Suchwege + 1 Direktweg), medien_ueberregional 7, medien_regional 6, gewerkschaft 3,
arbeitgeberverband 2, fachverband 1, wissenschaft 3, thinktank 1, ngo 1, bundesland 16, landtag 3.

**Perspektive (funktionierende Quellen):** Fakt 41 · Position 20 · Journalismus 13 · Analyse 0
(die Analyse-Quellen — Wissenschaft/Thinktanks — sind noch `released`/`classified`, also vor der
finalen Aktivierung, und zählen daher noch nicht als „funktionierend"). Faktenquellen dominieren
deutlich — die Gewichtung bevorzugt amtliche Fakten vor Meinungsbeiträgen.

### Parteien / Fraktionen (Ausgewogenheit)

- **Alle 9 Parteien** des Mandatsregisters haben je ≥ 1 eigene Direktquelle → **keine Partei
  unterversorgt**, keine Partei durch die Architektur bevorzugt.
- **5 von 8 Fraktionen** haben eine aktive belegbare Direktdomain: **CDU/CSU, SPD, Grüne, Die Linke,
  AfD** — exakt die Fraktionen des 21. Deutschen Bundestags (2025). Die **FDP-Bundestagsfraktion ist
  seit der Wahl 2025 nicht mehr vertreten** (4,3 % Zweitstimmen) und wird als `superseded` (veraltet)
  geführt — ein realer Beleg für diesen Importzustand. **BSW und SSW** haben keine belegbare eigene
  Fraktions-Feed-Domain; der Versorgungsstandard erlaubt hier die Partei als Ersatzquelle
  (BSW/SSW-Parteiseiten sind vorhanden). **Kein erfundener Feed.**
- Gegenpositionen sind vorhanden (mehrere Parteien/Fraktionen mit eigenen Positionsquellen) →
  `fehlendeGegenpositionen = false`.

### Ausschüsse

- **22 von 23 Ausschüssen** sind heute **Suchanbieter-Monokultur** (ausschließlich über Google-News-
  Suche abgedeckt) — genau die im Bestand real vorhandene Abhängigkeit. Der Petitionsausschuss hat
  mit ePetitionen (`epetitionen.bundestag.de`) eine belegbare Direktquelle.
- Die Coverage-Matrix markiert diese 22 als `nur-suchanbieter` **und** `monokultur`. Der
  Versorgungsstandard wertet eine reine Suchanbieter-Versorgung als **nicht versorgt** → damit kann
  Google News für Ausschüsse **nicht mehr als vollwertige alleinige Versorgung gelten** (Abnahme §9).
- **Sprint-4-Maßnahme:** Ausschüsse strukturiert über DIP (amtliche API) statt Suche versorgen.

### Bundesländer / Regionen

- **Alle 16 Bundesländer** haben ein offizielles Landesportal (Typ `bundesland`, `released`).
- **Regionale Medien-Lücken (aktiv):** Bayern, Bremen, Hessen, Saarland haben derzeit **keine
  aktive** Regionalmedienquelle (die ÖR-Regionalsender rbb/NDR/SWR/MDR/WDR decken 12 Länder ab).
  Die Landesportale sind vorbereitet (`released`), aber noch nicht `active`.

### Anbieter-/Suchabhängigkeit

- **Suchanbieter-Gesamtanteil: 31,1 %** der funktionierenden Quellen (die 23 Ausschuss-Suchwege).
  Zum Vergleich Altbestand: dort sind **134 von 143** Quellen (~94 %) Google-News-basiert. Der
  Master-Katalog senkt die strukturelle Suchabhängigkeit drastisch und macht den Rest sichtbar.
  Die Suchanbieter-Erkennung ist bewusst robust (Aggregator-Herausgeber, `search`/`googlenews`-
  Methode **und** Google-News-via-RSS) — ein Suchweg kann sich nicht als Direktquelle tarnen.

### Weitere Befunde

- **Quellen ohne Rechtsbewertung: 34** (`license_status`/`privacy_status` = `unbewertet`) — u. a. die
  Ausschuss-Suchwege und einzelne, bewusst noch nicht rechtlich geprüfte Institutionen. Ehrlich als
  Lücke geführt; Aktivierung erst nach `legally_checked`.
- **Quellen ohne (aktiven) Abrufweg: 32** — die noch nicht aktivierten `released`/`classified`-
  Quellen (Landesportale, Wissenschaft, einzelne Ministerien).

## 2. Shadow-Vergleich Alt-relational vs. Master (Phase 1)

`node scripts/master-catalog-shadow-compare.js` → schreibt `master-katalog-vergleich.json` (Default
`audit/`; reproduzierbar, zweiter Lauf identisch). **Urteil: `konflikt`** (wegen 1 echtem URL-Widerspruch).

| Frage | Ergebnis |
|-------|---------:|
| 1) nur im alten System | 143 |
| 2) nur im neuen Modell | 106 |
| 3) unterschiedlich klassifiziert | 1 |
| 4) widersprüchliche URLs | 1 |
| 5) vermutlich doppelt | 0 |
| 6) abweichende Paketzuweisung | 1 |

**Interpretation (wichtig — kein Regressionssignal):** Alt und Neu sind **absichtlich**
unterschiedliche Repräsentationen. Der Altbestand (144 adaptierte Wege) besteht zu ~94 % aus
Google-News-**Suchen**; der Master-Katalog nutzt für dieselben Institutionen **direkte amtliche
URLs**. Deshalb sind fast alle Einträge `nur-Alt` (die Suchwege) bzw. `nur-Neu` (die Direktquellen)
— das ist die **gewollte** Modellierungsverbesserung, keine verlorene Quelle. Genau ein Weg (DIP,
`search.dip.bundestag.de/api/v1`) ist in beiden identisch.

**Der harte Befund (Punkt 4):**
- `publisher-bundestag.de|html|parliament-bundestag` — der Bundestag erscheint mit zwei URLs
  (Alt-Weg vs. Master-Direktweg) bei gleicher starker Rolle (Institution Bundestag) → echter
  Widerspruch, der reconciled werden muss. Der URL-Vergleich flaggt nur bei starker inhaltlicher
  Rolle (Partei/Fraktion/Ausschuss/Institution); zwei legitime Feeds eines Mediums ohne Institution
  (z. B. Tagesschau) werden bewusst **nicht** als Widerspruch gewertet (kein Over-Flagging).

**Punkt 3 (Klassifikation):** der DGB-Weg trägt im Alt-System keine Institution, im Master
`institution_id = union-dgb` (Verbesserung). **Punkt 5 (Dubletten):** 0 — die erwartete Alt↔Neu-
Überlappung (DIP) zählt korrekt als `geteilt`, nicht als Dublette; katalog-interne Dubletten gibt es
keine. **Punkt 6:** eine abweichende Paketzuweisung als Prüfpunkt dokumentiert.
