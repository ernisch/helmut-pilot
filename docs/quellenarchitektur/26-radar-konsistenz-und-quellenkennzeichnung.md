# Radar — Vollständige Konsistenz-Dokumentation + Quellen-Kennzeichnung (Phase A/B)

Stand: read-only aus Produktionsdaten reproduziert (frozener Snapshot, `now` fixiert). **Keine**
Production-Änderung, kein Flag, kein Deploy, keine Migration. Feature-Branch.

## Phase A — behobene Preview-Fehler

### A.A "Neue Dynamiken": 7 → 6 (deterministisch, kein Bug)
Die Dynamik-Zahl ist **kein** Bug und **nicht** zufällig. `buildDynamics` zeigt nur Vorgänge, deren
**jüngste belegte Quellen-Veröffentlichung** innerhalb des 7‑Tage-Fensters (`RADAR_DYNAMICS_FRESH_DAYS`,
Default 7) relativ zu `now` liegt, UND die ≥2 Quellen (offiziell) bzw. ≥3 Quellen (rising) haben.
Bei **identischem `(Datensnapshot, now)`** ist das Ergebnis **deterministisch** (zwei Läufe → identische
Menge, per Test gepinnt). Der beobachtete Wechsel „7 → 6" entsteht, weil `now` fortschreitet: ein
Vorgang, dessen jüngste Quelle am Fensterrand liegt, fällt heraus. Offline am frozenen Snapshot belegt:
`now=2026‑07‑13 → 7` · `07‑14 → 7` (andere Vorgänge: `vg‑behörden` altert heraus, `vg‑verfassung`
kommt herein) · `07‑15 → 3`. Keine Code-Änderung nötig; Determinismus + Fensterlogik als Test gepinnt
(`radar-source-label-test.js` #6). **Keine fest codierte Zahl 7** in Tests.

### A.B Ausschuss-Reiter: von 13 (falsch) auf 0 (fachlich korrekt)
Die 13 zuvor gezeigten Ausschuss-Signale waren **alle** topic-inferiert: `ko.ausschuesse` trug „Ausschuss
für Arbeit und Soziales", aber (real geprüft, 13/13) der Ausschuss war **nie** im Inhalt genannt und es
gab **kein** Ausschussdokument — reine BMAS-/Ministeriums-/Medienmeldungen zum Thema Arbeit/Soziales.
Über den GESAMTEN Bestand (195 KOs) nennen nur **2** KOs überhaupt einen „Ausschuss für/…" im Inhalt,
und beide sind „Ausschuss der Bundesregierung/Koalitionsausschuss" — kein Fachausschuss. Es gibt also
**keine echten Arbeit‑und‑Soziales-Ausschussvorgänge** in den aktuellen Daten → der Reiter ist korrekt
**leer**. Neue Regel: der volle kuratierte Ausschussname muss **wörtlich im strukturierten Inhalt** stehen
(kein Landtag-/kommunal-/Koalitions-Widerspruch). `ko.ausschuesse` allein (auch volle Form) und
`source_type` zählen **nicht** mehr.

### A.C Wahlkreis (bereits in Dok. 25 behoben, hier bestätigt)
Allgemeine Geografien (16 Bundesländer + Bund/Europa, zentral aus der Geografie-Seed-Liste) zählen nicht
als Wahlkreisbeleg. Für den Pilotmandanten aktuell 0 Wahlkreis-Signale (Bovenschulte korrekt entfernt).

### A.D "Offizielle Quellen": Amtlichkeit über die DOMAIN, nicht über source_type
`raw_documents.source_type` ist im Bestand **nachweislich unzuverlässig**: dieselbe journalistische
Quelle (FAZ, Berliner Zeitung, Nordkurier) trägt je Dokument `committee` (58×), `media` (24×), `party`
(16×), `bundestag` (5×), `ministry` (3×). Kein `source_type`-Kategorie-Filter kann das Label „Offizielle
Quellen" wahrheitsgemäß machen. Fix: die Amtlichkeit der **angezeigten primären Quelle** wird aus der
**Domain** über das kuratierte Herausgeber-Register (`seeds/publishers.js`) bestimmt. Amtlich =
Herausgebertyp ∈ {parliament, government, ministry, authority, statistical_office}. Medien/Verbände/
Parteien/Fraktionen/Aggregatoren sind **nicht** amtlich; unbekannte Domain → journalistisch (Default),
niemals amtlich. Ergebnis (Pilotmandant, real): 5 „official"-Artikel, alle bundesregierung.de/bmas.de/bundesrat.de
— **0** journalistische Fehl-Kennzeichnungen. Das Label „Offizielle Quellen" bleibt (die angezeigte Quelle
IST amtlich) — keine Umbenennung nötig.

## Phase B — Konsistenztabelle aller Radar-Bereiche
Alle Bereiche lesen denselben `decisions`-Satz (Top‑50 Profil-Relevanz + fresh-augment − Quarantäne),
die breite verstandene KO-Menge (nur „Über dich") und `sourcesByVorgang`. Gemeinsame Normalisierung:
Partei `slugParty`, Ausschuss `committeeMatchKey`, Ort roh `slug`.

| Bereich | Datenquelle | Zeitfenster | Filter/Belegregel | Relevanzschwelle | Max | Fallback |
|---|---|---|---|---|---|---|
| **Über dich** (mentions) | breite verstandene KOs (kein Top‑N-Cut) | keins | voller Name (structured/prose) belegt; sourceSafety; echte URL | — | 30 | ehrlich leer |
| **Partei** | decisions.matched_features (partei) | keins | Partei in `ko.parteien` (nicht nur mentioned) UND Akteursbeleg (Partei-/Fraktionsquelle über ALLE Quellen ODER Partei im Titel); zentrale `slugParty` | Top‑50 (Cut) | 12/Segment | ehrlich leer |
| **Wahlkreis** | decisions.matched_features (wahlkreis) | keins | konkreter Ort in `ko.mentioned_locations`; **kein** Bundesland/Bund/Europa | Top‑50 | 12 | ehrlich leer |
| **Ausschüsse** | decisions.matched_features (ausschuss) | keins | Ausschuss in `ko.ausschuesse` (Anker) UND **voller Ausschussname wörtlich im Inhalt**, kein Landtag-/kommunal-/Koalitions-Widerspruch; Ebene via `parliamentTypeOf` | Top‑50 | 12 | ehrlich leer |
| **Neue Dynamiken** | decisions | **7 Tage** (jüngste Quelle) | ≥2 Quellen + offiziell/medial, sonst ≥3 Quellen; deterministisch je `now` | Top‑50 | 8 | ehrlich leer |
| **Alle Artikel** | decisions | keins | dedupliziert; relationTypes für Filter | Top‑50 | 48 | ehrlich leer |
| **Medien** (Filter) | Artikel | keins | primäre Quell-**Domain** = Medien/Aggregator ODER unbekannt | — | (48) | — |
| **Offizielle Quellen** (Filter) | Artikel | keins | primäre Quell-**Domain** = amtlich/institutionell (Register) | — | (48) | — |

### Verhinderte Fehlklassen (Phase B Vorgaben)
- Gleicher Begriff, verschiedene Bereiche → **eine** zentrale Normalisierung je Dimension (Partei/Ausschuss).
- Themenähnlichkeit ≠ institutioneller Beleg (Ausschuss braucht Namen im Inhalt).
- Medienquelle ≠ amtliche Quelle (Domain-basiert).
- Bundesland ≠ Wahlkreisbeleg (`TOO_GENERAL_REGION_SLUGS`).
- Ausschüsse verschiedener Ebenen → `parliamentTypeOf` + Ebenen-Marker trennen Bund/Land/Kommune.

## Bewusste Grenzen (read-time, ohne Backfill)
- `decision_entities`/`decision_level` sind im Bestand **leer** (kein Backfill ausgeführt) → read-time nicht
  nutzbar; die Beleg-Regel stützt sich daher auf die strukturierten Inhaltsfelder + das Domain-Register.
  Ein späterer (freizugebender) Klassifikations-Backfill könnte die Ausschuss-Erkennung zusätzlich über die
  strukturierte Entität stützen — nicht Teil dieser read-only Stufe.

## Tests
`radar-committee-evidence-test.js` (25) · `radar-source-label-test.js` (25, inkl. Dynamik-Determinismus) ·
`radar-committee-normalization-test.js` (32) · `radar-party-normalization-test.js` (31) · `radar-state`
(102). Gesamt-Radar/-Matching + Lage/Helmut/Contract/Profile: 18 Suiten grün.
