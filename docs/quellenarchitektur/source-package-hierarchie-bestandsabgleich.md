# Source Package Hierarchie — Architektur- und Bestandsabgleich

**Stand:** 2026-07-23
**Auftrag:** ausschließlich lesender Architektur- und Bestandsabgleich (kein Production Write, keine Migration, keine Aktivierung, kein Deployment, keine Seed-/Paket-/Retrieval-Änderung).
**Vergleichsbasis:** `main` (Stand Commit `035898b`, Branch `claude/source-package-hierarchie-audit-dj80gu`).
**Geprüfte Übergabe:** `Helmut_Source_Package_Hierarchie_Master_Uebergabe` (17-teiliger Fachpaketkatalog, 5 Produktklassen, Ausschussmapping, Profilzuordnung, Übergangspakete).

Dieser Bericht ist rein dokumentarisch. Es wurde nichts angelegt, umbenannt, verschoben oder aktiviert.

---

## Kurzantworten (Management Summary)

1. **Wie viele vorgeschlagene Pakete existieren bereits?**
   Vom 17-teiligen **Fachpaketkatalog existiert genau 1** (`arbeit-und-soziales`).
   Zählt man die gesamte vorgeschlagene Hierarchie (3 Basispakete + 17 Fachpakete + 3 Übergangspakete = 23 benannte Pakete), existieren **7 auf main**: `bund-basis`, `berlin-basis`, `brandenburg-basis`, `arbeit-und-soziales`, `die-linke-bund`, `regional-niedersachsen`, `profil-cem-ince`.

2. **Wie viele fehlen?**
   **16 Fachpakete** fehlen vollständig (alle außer `arbeit-und-soziales`). Auf Ebene der Gesamthierarchie fehlen genau diese 16.

3. **Die drei größten Konflikte** (siehe Abschnitt „Drei größte Konflikte").
   (a) Nur `Basispaket` ist im Datenmodell explizit abgebildet (`is_base`) — die vier übrigen Klassen existieren nur als Namenskonvention + Code-Zweig.
   (b) Fachthemen sind derzeit vermischt: `bund-basis` bündelt alle Ausschüsse/Fraktionen/Leitmedien, `arbeit-und-soziales` sammelt **alle** thematischen Quellen.
   (c) Übergangspakete verletzen bereits die künftigen Regeln (asymmetrisches `die-linke-bund`, ebenengemischtes `regional-niedersachsen`) und das allgemeine Ausschuss→Fachpaket-Mapping mit Max-3-Kappung fehlt.

4. **Empfohlene Zielstruktur:** bestehende 6-Tabellen-Relationalarchitektur **unverändert** lassen; die 5 Klassen als **Produkt-Taxonomie** (nicht als DB-Typ) führen; 17 Fachpakete einzeln als `source_packages`-Zeilen nach Recherche. Details in Abschnitt „Empfohlene Zielstruktur".

5. **Offene Entscheidungen vor Umsetzung:** Klassen-Modellierung (Konvention vs. optionale Spalte), Speicherort des Ausschuss→Fachpaket-Mappings, verbindliche Slugs/IDs, Verdrahtung der Vorsitz-/Ressort-Signale, symmetrische Organisationslogik, geo-sauberes Regionalmodell, generische Personen-Regel, Haushalt-Querschnittslogik, Enforcement von 2-Signale-Gate + Max-3. Details in Abschnitt „Offene Entscheidungen".

6. **Veränderte Dateien:** nur die zwei Berichtsdateien (siehe Abschnitt „Veränderte Dateien"). Keine Seeds, kein Code, keine Retrieval Paths.

---

## 1. Bestehende Quellenarchitektur auf main (Ist)

Die neue Quellenarchitektur ist relational, additiv und **freigabepflichtig noch nicht auf Production angewendet** (Migration `20260713_source_architecture.sql`, Seed `20260713_source_architecture_seed.sql`, Code-Seed `lib/helmut/quellenarchitektur/seeds/packages.js`).

Sechs tragende Tabellen (bleiben laut Übergabe unverändert):

| Ebene | Tabelle | Zweck |
|---|---|---|
| Herausgeber | `publishers` | Organisation existiert genau einmal (Dedup über `canonical_domain`) |
| Abrufweg | `retrieval_paths` | technische Methode je Herausgeber (rss/api/html/googlenews_search/structured_download) |
| Quellenpaket | `source_packages` | bündelt Abrufwege je Produktzweck |
| Paket↔Abrufweg | `package_paths` | m:n, ein Abrufweg wird global nur einmal gecrawlt |
| Entität | `political_entities` | typisierte Schicht (Person/Partei/Fraktion/Ausschuss/Ministerium/…) |
| Geografie | `geographies` (+ `electoral_districts`) | Bund/Land/Bezirk/Kreis/Kommune; Wahlkreis getrennt |

### Bestehende Pakete (`source_packages`)

| key | id | Produktklasse (Übergabe) | status | is_base | political_level |
|---|---|---|---|---|---|
| `bund-basis` | `pkg-bund-basis` | Basispaket | active | **true** | bund |
| `berlin-basis` | `pkg-berlin-basis` | Basispaket | prepared | **true** | land |
| `brandenburg-basis` | `pkg-brandenburg-basis` | Basispaket | prepared | **true** | land |
| `arbeit-und-soziales` | `pkg-arbeit-und-soziales` | Fachpaket | active | false | bund |
| `die-linke-bund` | `pkg-die-linke-bund` | Organisationspaket | active | false | bund |
| `regional-niedersachsen` | `pkg-regional-niedersachsen` | Regionalpaket | active | false | land |
| `profil-cem-ince` | (DB-Zeile, **nicht** im Code-Seed) | Persönliche Beobachtung | active | false | — |

Hinweis: `profil-<mandats-id>` wird bewusst **nicht** im Code-Seed geführt, sondern je Mandat bei der Provisionierung als DB-Zeile angelegt (Konvention `personalPackageKeyFor`, `profile-packages.js`). Der Vorläufer `profil-cem-ince` existiert damit als Produktions-Datenzeile, nicht im Repo.

---

## 2. Prüfpunkte des Auftrags

### 2.1 Welche vorgeschlagenen Pakete existieren bereits
`arbeit-und-soziales` (Fachpaket, Referenzmodell) sowie die drei Basispakete `bund-/berlin-/brandenburg-basis`. Die drei Übergangspakete (`die-linke-bund`, `regional-niedersachsen`, `profil-cem-ince`) existieren ebenfalls, sind aber ausdrücklich als Übergang deklariert.

### 2.2 Welche Pakete fehlen
Die **16** noch nicht recherchierten Fachpakete (Rang 1–16 der Umsetzungsreihenfolge): `haushalt-finanzen-und-steuern`, `wirtschaft-industrie-und-mittelstand`, `gesundheit-und-pflege`, `inneres-sicherheit-und-bevoelkerungsschutz`, `wohnen-bauen-und-stadtentwicklung`, `verkehr-und-infrastruktur`, `digitales-daten-und-staatsmodernisierung`, `energie-klima-und-umwelt`, `bildung`, `wissenschaft-und-forschung`, `familie-jugend-integration-und-teilhabe`, `landwirtschaft-ernaehrung-und-laendliche-raeume`, `aussen-europa-und-entwicklung`, `kultur-medien-und-sport`, `recht-verfassung-und-verbraucherschutz`, `verteidigung`.

### 2.3 Umbenennen / Teilen / Zusammenführen
- **Kein Umbenennen** erforderlich: alle vorhandenen Keys entsprechen bereits den Übergabe-Slugs.
- **Teilen erforderlich (später, kein Migrationsauftrag jetzt):** `bund-basis` und `arbeit-und-soziales` tragen heute thematisch gemischte Quellen. Beim Rollout der 16 Fachpakete werden thematische Quellen aus diesen beiden Sammelpaketen in die neuen Fachpakete verlagert (Ausgliederung, nicht Umbenennung).
- **Ersetzen (später):** `regional-niedersachsen` → geo-saubere Regionalpakete; `die-linke-bund` → symmetrische Organisationslogik; `profil-cem-ince` → generische Personen-Regel.
- **Kein Zusammenführen** vorgesehen.

### 2.4 Welche Paketklassen bereits abgebildet sind
Im Datenmodell ist **nur `Basispaket` explizit** abgebildet (Boolean `is_base`). Die übrigen vier Klassen (`Fachpaket`, `Regionalpaket`, `Organisationspaket`, `Persönliche Beobachtung`) haben **keine** eigene Spalte; sie werden ausschließlich abgeleitet:
- `Fachpaket`: implizit „`is_base=false` und keine Sonderregel" (in `packageKeysForSource`/`resolveProfilePackages`).
- `Regionalpaket`: Namenspräfix `regional-` + `political_level=land` + `geography_id` + Quellen-Tag `regional:true`.
- `Organisationspaket`: Code-Zweig (`party=Die Linke` bzw. `fraction-linke`).
- `Persönliche Beobachtung`: Key-Konvention `profil-<mandats-id>` + Quellen-Tag `demoOnly`.

Das deckt sich mit `paketklassen.json` (`classes_are_product_taxonomy_not_database_schema: true`) und mit dem Masterauftrag (§4: keine neue Klassifikationsspalte vorschlagen, solange nicht zwingend nötig). **Bewertung:** für die heutige Kleinmenge tragfähig; bei 16 zusätzlichen Fachpaketen wird die rein implizite Ableitung mehrdeutiger und sollte mindestens dokumentarisch verbindlich festgelegt werden (siehe offene Entscheidungen).

Die vorhandene Spalte `source_packages.required_classes` bildet **nicht** die Produktklassen ab, sondern die **Landesmodul-Pflichtklassen** (`landesparlament`, `plenum`, `ausschuesse`, …). Sie ist nicht mit der 5er-Produkt-Taxonomie zu verwechseln.

### 2.5 Wo Fachpakete mit Basis/Partei/Medien/Personen vermischt sind
Die heutige Quellenverteilung (`lib/helmut/sources.js` → `packageKeysForSource`) kennt nur wenige Zielkörbe:
- `neutral:true` → **`bund-basis`** (alle Ausschüsse, alle Fraktionen, allgemeine Politik, Leitmedien, breite dt. Medien).
- `themeTerms` → **`arbeit-und-soziales`** — **alle** thematischen Quellen (Fachmedien, Verbände, Radar/Prozess) landen in **einem** Fachpaket, unabhängig vom tatsächlichen Politikfeld.
- `regional:true` → `regional-niedersachsen`; `party=Linke` → `die-linke-bund`; `demoOnly` → `profil-<id>`.

**Folge:** Die inhaltlichen Bausteine der 16 fehlenden Fachpakete (Bildung, Gesundheit, Energie, Verteidigung …) liegen heute entweder neutral in `bund-basis` oder undifferenziert im Sammel-Fachpaket `arbeit-und-soziales`. Es gibt **keine** thematische Trennung — genau das, was die Übergabe künftig herstellen will.

### 2.6 Vereinbarkeit von Ausschussmapping/Profilzuordnung mit dem Mandatsmodell
Das Mandatsmodell (`mandate_profiles`) trägt die nötigen Felder: `ausschuesse`, `stellvertretende_ausschuesse`, `partei/fraktion`, `fachpolitische_schwerpunkte`, `berichterstatter_themen`, `regionale_interessen/-themen`, `relevante_ministerien`, `regierungsrolle`, `bundesland`; die Ebene kommt aus `config.parliamentTypeOf`. Die Profilzuordnungs-Grundlage (`base_package: Parlament/Ebene/Mandatsprofil`) ist damit **kompatibel**.

**Abweichungen der heutigen Ableitung** (`resolveProfilePackages`) gegenüber `profilzuordnung.json`/`ausschussmapping_grundregeln.md`:
- Es existiert **keine allgemeine Ausschuss→Fachpaket-Tabelle**. Aktuell nur eine hartcodierte Regel (`normalizeCommittee === 'arbeit-und-soziales'` → Fachpaket). „Genau ein primäres Fachpaket je Ausschuss" ist strukturell noch nicht abgebildet.
- **`maximum_automatic_topic_packages: 3`** und Zielwert 3 / Range 2–4 werden **nicht erzwungen** — heute unkritisch, weil nur ein Fachpaket existiert; mit 17 Fachpaketen muss die Kappung ergänzt werden.
- **Fokusthemen:** `profilzuordnung` verlangt `automatic_on_first_signal:false` + `minimum_independent_signals:2`. Die heutige Logik löst `arbeit-und-soziales` bereits beim **ersten** Term aus. Divergenz.
- **`chair_or_spokesperson`** und **`ministry_or_department`** sind in `profilzuordnung` automatisch (hohe Priorität). Die Felder existieren (`regierungsrolle`, `relevante_ministerien`), werden in der **Paket-Ableitung aber nicht gelesen**. Verdrahtung offen.
- **Partei/Fraktion:** `profilzuordnung` verlangt Symmetrie und „nicht automatisch". Heute nur `Die Linke` erkannt und als optionales Paket geführt → asymmetrisch (als Übergang deklariert).
- **Petitionsausschuss → Basispaket** und **Haushalt = Querschnitt nur für formell Zuständige**: heute nicht abgebildet (kein Petitions-/Haushalts-Sonderpfad), da die Zielpakete fehlen.

**Fazit:** Mandatsmodell und Regelwerk sind grundsätzlich vereinbar; die feineren Zuordnungsregeln sind noch nicht implementiert und teils divergent — aber ohne die 16 Fachpakete auch noch nicht wirksam. Kein struktureller Widerspruch, sondern Ausbaubedarf.

### 2.7 Kollidieren bestehende Paket-IDs oder -Namen?
**Nein — keine blockierende Kollision.**
- Die 16 vorgeschlagenen Slugs kommen als `source_packages.key`/`id` heute **nirgends** vor (geprüft repo-weit).
- `arbeit-und-soziales` „kollidiert" nur mit sich selbst — beabsichtigte Identität, kein Konflikt.
- **Namensraum-Hinweis (nicht blockierend):** Die Fachpaket-Slugs `bildung` und `verteidigung` sind identisch mit vorhandenen **`political_entities.canonical_key`** der gleichnamigen Ausschüsse (`committee-bt-bildung`, `committee-bt-verteidigung`) sowie mit Normalisierungs-Keys in `matching.js`. Das sind **andere Tabellen** → keine Primärschlüssel-Kollision. Im Gegenteil: der geteilte `canonical_key` ist die natürliche Brücke für das spätere Ausschuss→Fachpaket-Mapping.
- ID-Konvention `pkg-<slug>` ist für alle 16 neuen Pakete kollisionsfrei.

### 2.8 Welche Übergangsregeln ohne Migration umsetzbar wären
Alle drei Übergangsregeln sind heute **reine „so-lassen"-Regeln** und damit **ohne Migration** einhaltbar:
- `die-linke-bund`: nicht löschen, nicht ausbauen → No-op (Datenstand bleibt).
- `regional-niedersachsen`: nicht als Vorlage nutzen, später ersetzen → No-op.
- `profil-cem-ince`: nicht als Sonderfall ausbauen → die Code-Konvention `profil-<id>` ist **bereits generisch** (kein Nutzer hartcodiert), d. h. der Zielzustand ist strukturell schon erreicht; nur Ausbau vermeiden.
- Basispakete + `arbeit-und-soziales`: unverändert bis eigener Auftrag → No-op.

Migrationsbedarf entsteht erst bei den **späteren** Ausbaustufen (symmetrische Organisationslogik, geo-saubere Regionalpakete, generische Personen-Gewichtung), die die Übergabe ausdrücklich in eigene, freigabepflichtige Schritte legt.

### 2.9 Offene Entscheidungen vor technischer Umsetzung
Siehe Abschnitt „Offene Entscheidungen".

### 2.10 Empfohlene verbindliche Zielstruktur
Siehe Abschnitt „Empfohlene Zielstruktur".

---

## Drei größte Konflikte

1. **Klassen sind im Datenmodell nur zu 1/5 abgebildet.** Nur `Basispaket` ist explizit (`is_base`). `Fachpaket`, `Regionalpaket`, `Organisationspaket`, `Persönliche Beobachtung` existieren ausschließlich als Namenskonvention (`regional-`, `profil-`) und Code-Zweig. Das ist konform zur Vorgabe „keine neue Tabelle/Spalte" (NoGo #2, Masterauftrag §4), wird bei 16 zusätzlichen Fachpaketen aber mehrdeutig und muss mindestens verbindlich dokumentiert werden.

2. **Fachthemen sind heute vermischt, nicht getrennt.** `bund-basis` bündelt alle Ausschüsse/Fraktionen/Leitmedien; `arbeit-und-soziales` sammelt via `themeTerms` **alle** thematischen Quellen unabhängig vom Politikfeld. Die 16 fehlenden Fachpakete existieren inhaltlich nur als undifferenzierter Klumpen in genau diesen zwei Sammelpaketen. Ihre Ausgliederung ist der eigentliche Arbeitskern des Rollouts.

3. **Übergangspakete verletzen bereits künftige Regeln, und das allgemeine Zuordnungsgerüst fehlt.** `die-linke-bund` ist asymmetrisch (nur Die Linke erkannt, verletzt NoGo #5-Ziel), `regional-niedersachsen` mischt Land + Städte (verletzt NoGo #9). Zugleich fehlen die allgemeine Ausschuss→Fachpaket-Tabelle, die Max-3-Kappung und das 2-Signale-Gate für Fokusthemen. Alles bewusst als Übergang deklariert — aber vor „mehr als ein Fachpaket aktiv" zu klären.

---

## Empfohlene Zielstruktur

**Grundsatz: additiv, keine neue Architektur.** Die bestehende 6-Tabellen-Relationalstruktur trägt die 5 Produktklassen bereits als Produkt-Taxonomie — sie bleibt **unverändert** (deckt sich mit `01_KONSOLIDIERTE_ENTSCHEIDUNG.md` und NoGo #1/#2).

1. **Klassen = Produkt-Taxonomie, nicht DB-Typ.**
   - `Basispaket` = `is_base=true` (bereits vorhanden).
   - Die übrigen vier Klassen vorerst über eine **dokumentierte Key-/Ableitungskonvention** (`regional-*`, `profil-*`, Organisationspaket via Entitätsbezug, Fachpaket = Rest bei `is_base=false`).
   - **Keine** neue `package_class`-Spalte anlegen, solange die Ableitung eindeutig gehalten wird (NoGo #2, Masterauftrag §4). Eine einzelne, nullable `package_class`-Spalte **nur**, falls die Ableitung nachweislich mehrdeutig wird — als separater, freigabepflichtiger Schritt.
2. **17 Fachpakete als `source_packages`-Zeilen** (`is_base=false`, `political_level=bund`, `geography_id=geo-bund`), **einzeln** nach Deep-Research + Gate + Testabrufen angelegt (NoGo #7/#8, Reihenfolge aus `03_UMSETZUNGSREIHENFOLGE.md`). Slug = Katalog-Slug.
3. **Basispaket je Mandatsprofil** (`bund-basis` + genau ein Landespaket), wie in `profile-packages.js` bereits umgesetzt.
4. **Ausschuss→Fachpaket als Daten**: genau ein Primärpaket je Ausschuss, Ergänzungspaket nur bei echtem Mischgremium; `political_entities.canonical_key` der Ausschüsse als Brücke.
5. **Zuordnungsgrenzen** in der Ableitung: max. 3 automatische Fachpakete, Zielwert 3, Range 2–4, 2 unabhängige Signale für Fokusthemen, Petitionsausschuss → Basispaket, Haushalt = Querschnitt nur für formell Zuständige.
6. **Übergangspakete behalten**, bis symmetrische Organisations-, geo-saubere Regional- und generische Personenlogik fachlich + technisch freigegeben sind.

---

## Offene Entscheidungen

1. **Klassen-Modellierung:** verbindlich per Konvention dokumentieren (empfohlen) **oder** optionale nullable `package_class`-Spalte? (Empfehlung: Konvention; Spalte nur wenn Ableitung mehrdeutig wird.)
2. **Speicherort/Format des Ausschuss→Fachpaket-Mappings** (Code-Seed vs. Referenztabelle vs. `path_expected_topics`).
3. **Verbindliche Slugs/IDs der 16 Fachpakete** final bestätigen, bevor irgendetwas auf main angelegt wird (NoGo #11).
4. **Verdrahtung der Signale** `chair_or_spokesperson` (`regierungsrolle`) und `ministry_or_department` (`relevante_ministerien`) in die Paket-Ableitung.
5. **Enforcement** von Max-3-Kappung + 2-Signale-Gate für Fokusthemen in `resolveProfilePackages`.
6. **Symmetrische Organisationslogik** (Neutralisierung `die-linke-bund`, identische Regel für alle Parteien/Fraktionen).
7. **Geo-sauberes Regionalmodell** als Ersatz für `regional-niedersachsen` (Ebene festlegen: Land vs. Wahlkreis vs. Kommune, keine Vermischung — NoGo #9).
8. **Generische Personen-Regel** + niedrigere Gewichtung persönlicher Treffer (unter Basis + formalen Zuständigkeiten).
9. **Haushalt als Querschnittspaket:** Trigger „nur formell zuständige Profile automatisch" definieren.

---

## Veränderte Dateien

Ausschließlich die zwei Berichtsdateien dieses Bestandsabgleichs — kein Seed, kein Code, keine Retrieval Paths, keine Aktivierung:

1. `docs/quellenarchitektur/source-package-hierarchie-bestandsabgleich.md` (dieser Bericht)
2. `docs/quellenarchitektur/source-package-hierarchie-mapping.csv` (Paket-für-Paket-Abgleich)

---

## Abgleich mit den No-Go-Regeln

Dieser Auftrag war rein lesend. Es wurde **keine** neue Datenbankarchitektur/Tabelle vorgeschlagen (nur dokumentiert), **keine** Quelle/kein Paket angelegt, umbenannt oder verschoben, **keine** Migration, **kein** Production Write, **keine** Aktivierung, **kein** Deployment, **kein** Live-Abruf durchgeführt. Die Masteraufträge zur technischen Umsetzung wurden **nicht** begonnen.
