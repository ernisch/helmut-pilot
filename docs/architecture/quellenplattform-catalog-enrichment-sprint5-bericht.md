# Sprint 5 — Master-Katalog-Befüllung und intelligentes Tagging · Abschlussbericht

**Branch:** `architecture/quellenplattform-catalog-enrichment`
**Basis:** `architecture/quellenplattform-shadow-sprint4` @ `025466a`
**Stand:** 2026-07-21
**Charakter:** reiner **Daten**-Sprint. Keine neue Architektur, keine neuen Modelle, keine
Parallelstrukturen, keine neue Gesundheits-/Qualitäts-/Bewertungslogik. Ausschließlich der globale
Master-Katalog wurde qualitativ befüllt/getaggt. Legacy bleibt produktiv, Shadow bleibt intern.

---

## 0. Preflight (bestanden)

1. Branch stammt von Sprint 4 ab: `merge-base --is-ancestor` = true, HEAD == `025466a`. ✓
2. Alle **162** Offline-Suiten vorhanden. ✓
3. Alle **162** grün vor Beginn. ✓

---

## 1. Was verändert wurde (und was ausdrücklich nicht)

**Verändert (rein Daten/Datenpfad, dormant, keine Live-Datei):**
- `master/seeds/catalog-seed.js` — **Katalogdaten**: (a) jedes Bundesministerium mit seinem
  Ressort-**Politikfeld** getaggt (BMAS→Arbeit&Soziales, BMG→Gesundheit, BMF→Finanzen+Haushalt, …),
  abgeleitet aus der **einen Mandatswahrheit** (Sprint 1, `COMMITTEE_RELATIONS`); (b) eine neue,
  belegte **EU-Primärquelle** (Europäisches Parlament) für das Politikfeld Europa; (c) `topics` im
  Seed-Builder durchgereicht.
- `konsolidierung-versorgungsplan.js` — **Datenpfad-Vervollständigung** im Katalog-Adapter: die im
  Katalog bereits vorhandenen **Entitäts-Referenzen** (`party-linke`, `group-bt-linke`,
  `geo-land-berlin`) werden auf ihre kanonischen Matching-Schlüssel aufgelöst (`linke`, `berlin`) —
  über die **vorhandenen** Entitäts-/Geografie-Seeds. Ohne diese Auflösung erreichte die im Katalog
  vorhandene Klassifikation die (unveränderte) Zuweisung nie — das war die Ursache, warum in Sprint 4
  jedes Real-Katalog-Mandat blockiert war. **Keine neue Bewertungslogik, kein neues Modell,
  rückwärtskompatibel** (unbekannte Werte bleiben unverändert; bereits normalisierte Schlüssel laufen
  unverändert durch).

**Nicht verändert:** Sprint 1/2/3/4-Modelle, `matching.js`, `model.js`, `quality-watchdog.js`,
`source-record.js`, `tenant-context.js`, Migrationen, RLS, Auth, Crawls, Crons, `server.js`,
`scheduler.js`. Kein Deployment, keine Shadow-Aktivierung, Legacy unverändert allein entscheidend.
`git diff` bestätigt: **keine Live-/Modell-/Migrations-/CI-Datei** ist berührt.

---

## 2. Shadow-Vergleich Sprint 4 → Sprint 5

14 repräsentative Mandate, identische Shadow-Maschinerie, repräsentative Betriebstelemetrie (technisch,
PII-frei) für die aktiven Katalogquellen — so isoliert der Vergleich die **Katalogqualität**.

| Kennzahl | Sprint 4 (roher Katalog) | Sprint 5 (befüllt) |
|---|---|---|
| Mandate **vollständig** versorgt | 0 | **12** |
| Mandate **eingeschränkt** | 0 | 2 |
| Mandate **blockiert** (Gesamtstatus) | 14 | **0** |
| Als **besser** vs. Legacy klassifiziert | 0 | **13** |
| Ø **Google-News-Anteil** | 0,857 | **0,154** |
| Mandate mit **Google-News-Alleinversorgung** | 12 | **0** |
| Ausschüsse mit Primärquelle | nur Suchanbieter | **15 Ressorts + EU** |

Zusätzlich als reproduzierbarer **A/B-Test** (`catalog-enrichment-shadow-test.js`): derselbe Katalog
**ohne** Ministeriums-Tagging vs. **mit** Tagging zeigt messbar sinkende Google-News-Abhängigkeit,
0 Suchanbieter-Alleinversorgung und mehr versorgte Mandate.

---

## 3. Versorgungslücken (Aufgabe 4)

**Vollständig versorgt:** alle **9** Bundestagsparteien (CDU, CSU, SPD, Grüne, FDP, AfD, Linke, BSW,
SSW), alle **16** Bundesländer (Landesportale), die Fraktionen des 21. Bundestags, und alle
Fachausschüsse mit belegtem Ministerium (15 Ressorts) plus Europa.

**Teilweise / kritisch (ehrlich offen, keine erfundene Quelle):**
- **`neue-zukunftspartei`** (fiktive Testpartei) — keine Quelle vorhanden → kritische Partei-/Fraktions-
  lücke, korrekt als „nicht freigabefähig" markiert. Das belegt: **neue Parteien ohne Sonderlogik**
  werden generisch behandelt und ehrlich als unterversorgt ausgewiesen.
- **`salzgitter`** (einzelner Wahlkreis, kein Bundesland) — keine wahlkreisscharfe Quelle; die
  Bundesland-/Regionalebene ist gedeckt.
- **Politikfelder ohne belegtes Bundesministerium** (Petitionen, Sport, Tourismus, Menschenrechte,
  Kultur/BKM) bleiben bewusst **ungetaggt** (keine Schätzung) → weiter über Suchanbieter/Neutralbasis.

---

## 4. Deduplizierung (Aufgabe 6)

Analyse über den befüllten Katalog: **0 doppelte kanonische Quellen-Schlüssel, 0 doppelte IDs.** Die
23 Ausschuss-Suchwege teilen zwar den Aggregator-Herausgeber, tragen aber je eine **eigene**
Suchdefinition (distinct canonical_key) — **keine** Dubletten. Ergebnis: **keine sicheren Dubletten
zu entfernen** (der Sprint-3-Katalog ist bereits canonical-key-dedupliziert). Nichts wurde entfernt.

---

## 5. Verifikation (Aufgabe 8)

- **Neue Suiten (2):** `catalog-enrichment-test.js` (12/12 — Tagging aus der Mandatswahrheit,
  Entitäts-/Regions-Auflösung, dedup-sauber, deterministisch, keine Schätzung) und
  `catalog-enrichment-shadow-test.js` (8/8 — Google-News-Reduktion, neue Primärquellen,
  Parteien/Ausschüsse/Regionen, neue Partei ehrlich als Lücke, deterministisch).
- **Gesamte Offline-Suite: 164/164 grün** (162 Bestand + 2 neu). Fällt **nicht** unter 162.
- `[NETZ-GUARD]` zu `pardok-shadow-test.js`: Bestand aus `main`, kein Regress.

---

## 6. Abschluss — die zehn Fragen

1. **Wie viele Quellen wurden verbessert?** **15** Ministerien mit Ressort-Politikfeldern getaggt
   (→ Primärquellen ihrer Ausschüsse); die Entitäts-/Regions-Auflösung macht zusätzlich **9** Partei-,
   **6** Fraktions- und **55** regionsbezogene Quellen erst matchbar; **+1** neue Primärquelle. Der
   Katalog wuchs von **107 → 108** Records; die Wirkung liegt v. a. in der jetzt greifenden Klassifikation.
2. **Welche neuen Primärquellen kamen hinzu?** Das **Europäische Parlament** (`europarl.europa.eu`,
   belegte EU-Primärquelle für das Politikfeld Europa). Darüber hinaus wurden **bestehende** amtliche
   Primärquellen (15 Ministerien) durch Tagging als Ausschuss-Primärquellen **wirksam** gemacht — keine
   erfundenen Quellen.
3. **Welche Parteien profitieren?** **Alle 9** (CDU/CSU/SPD/Grüne/FDP/AfD/Linke/BSW/SSW) — sie waren im
   Katalog vorhanden, wurden aber erst durch die Entitäts-Auflösung matchbar.
4. **Welche Ausschüsse profitieren?** Alle mit belegtem Ministerium: Arbeit&Soziales, Gesundheit,
   Finanzen, Haushalt, Inneres, Recht, Wirtschaft, Umwelt, Ernährung, Familie, Bildung, Verkehr,
   Digitales, Wohnen, Verteidigung, Entwicklung, Auswärtiges — **plus Europa** (neue EU-Primärquelle).
5. **Welche Regionen profitieren?** Alle **16** Bundesländer (Landesportale + regionale Medien +
   Landtage), jetzt matchbar durch die Geografie-Auflösung (`geo-land-berlin` → `berlin`).
6. **Wie stark wurde die Google-News-Abhängigkeit reduziert?** Ø-Anteil **0,857 → 0,154**; Mandate mit
   **Google-News-Alleinversorgung 12 → 0**. Google News ist nirgends mehr die einzige Pflichtquelle.
7. **Welche Versorgungslücken bleiben?** Fiktive Partei `neue-zukunftspartei` (kein Beleg), Wahlkreis
   `salzgitter` (keine wahlkreisscharfe Quelle), Politikfelder ohne Bundesministerium
   (Petitionen/Sport/Tourismus/Menschenrechte/Kultur) — alle ehrlich offen, keine Schätzung.
8. **Welche Daten fehlen weiterhin?** Reale **Betriebstelemetrie** (Gesundheit/Qualität) und reale
   **Mandatsprofile** — sie liegen in Produktion und brauchen einen freigegebenen, mandantengetrennten
   Lesepfad (offline nicht vorhanden). Ferner: wahlkreisscharfe Quellen und Ressort-lose Politikfelder.
9. **Welche Tests wurden ergänzt?** `catalog-enrichment-test.js` (Datenqualität/Tagging/Auflösung/Dedup/
   Determinismus) und `catalog-enrichment-shadow-test.js` (A/B: Google-News-Reduktion, neue
   Primärquellen, Parteien/Ausschüsse/Regionen, neue Partei/Region ehrlich, Determinismus).
10. **Weiterhin ≥162 Offline-Suiten grün?** **Ja — 164/164 grün.**

---

## 7. Sicherheitsregeln — eingehalten

Keine Produktion geändert · keine Migration · kein Deployment · Auth/RLS/Cron/Crawls unverändert ·
Shadow **nicht** aktiviert · Legacy **nicht** ersetzt · kein Merge nach `main` · kein Pull Request.
Alle Live-Dateien byte-identisch zum Sprint-4-Stand.
