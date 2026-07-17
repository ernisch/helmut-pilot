# Radar „Dein Umfeld › Ausschüsse" — Diagnose der Normalisierungslücke + Korrektur

Stand: read-only reproduziert aus Produktionsdaten. **Keine** Production-Änderung, kein Flag,
kein Deploy, keine Quellenaktivierung. Der Fix liegt ausschließlich im Feature-Branch.

## Genaue Ursache
Der Ausschuss-Reiter zeigte für den Pilotmandanten (Ausschuss „Arbeit und Soziales") nur **1** Vorgang, obwohl
19 echte, strukturell verankerte Ausschuss-Signale vorlagen. Ursache: `radarState.js` verglich
den Ausschuss mit rohem `slug()` (`"arbeit und soziales"` ≠ `"ausschuss fuer arbeit und
soziales"`), während das Matching (`matching.js`) für die Erzeugung der `matched_features`
bereits zentral `normalizeCommittee`/`slugCommittee` nutzt, das Schreibvarianten wie „Ausschuss
für Arbeit und Soziales", „Bundestagsausschuss für Arbeit und Soziales" und „Sozialausschuss"
korrekt auf denselben kanonischen Schlüssel abbildet. Radar verwarf dadurch jeden korrekt
gematchten Ausschuss-Treffer wieder, dessen KO-Schreibweise vom Profilfeld abwich — strukturell
identisch zum bereits behobenen Partei-Fall (B1).

## Zusätzlich entdeckt: Kollisionsbug in der zentralen Funktion selbst
Bei der geforderten Testmatrix („Menschenrechte und humanitäre Hilfe", „Recht und
Verbraucherschutz") zeigte sich: `normalizeCommittee` normalisiert „Menschenrechte und
humanitäre Hilfe" fälschlich auf `"recht"` (Kollision mit dem Rechtsausschuss), weil der
Substring-Fallback die Schlüssel in Einfüge-Reihenfolge prüft und der kurze Schlüssel `"recht"`
zufällig vor dem spezifischeren `"menschenrechte"` steht (`"recht"` ist Teilwort von
„menschenRECHTe"). Dieser Bug ist **bereits bekannt und andernorts umgangen**:
`lib/helmut/quellenarchitektur/classification.js` enthält einen dokumentierten Workaround
genau für diesen Fall (`// normalizeCommittee liefert für "Menschenrechte …" fälschlich "recht"`)
— unabhängige Bestätigung, dass der Bug real und nicht neu ist.

Systematische Prüfung ergab **6 Kollisionspaare** im Synonym-Katalog (Substring eines kürzeren
Schlüssels in einem längeren, unterschiedlicher kanonischer Wert): `wirtschaft`↔`ernaehrung und
landwirtschaft`, `wirtschaft`↔`landwirtschaft`, `wirtschaft`↔`wirtschaftliche zusammenarbeit und
entwicklung`, `recht`↔`menschenrechte`, `digitales`↔`digitales und verkehr`,
`entwicklung`↔`wohnen stadtentwicklung bauwesen und kommunen`.

## Wichtige Design-Entscheidung: Ranking-Neutralität
Ein erster Korrekturversuch (Kollisionsfix direkt in `normalizeCommittee`) wurde **verworfen**,
weil er nachweislich Ranking-Nebenwirkungen hatte: „Neue Dynamiken" verschob sich für den Piloten von
**7 auf 8** Signale — obwohl der eigene Ausschuss des Piloten („Arbeit und Soziales") von keiner der 6
Kollisionen betroffen ist. Ursache: `normalizeCommittee`/`slugCommittee` speisen über
`knowledgeObjectWeightedTokens`/`profileWeightedTokens` den geteilten Feature-Vektor-Raum
(Kosinus-Ähnlichkeit), der den Top-50-Relevanz-Cut in `decideForUser` bestimmt — eine Änderung
an EINEM Vorgang kann die Rangfolge ALLER Vorgänge marginal verschieben und damit die Top-50-
Grenze für andere Vorgänge kippen. Das verletzt die Vorgabe, dass Partei/Wahlkreis/Dynamiken/
Lage/Helmut/Büro unverändert bleiben müssen.

**Lösung:** `normalizeCommittee`/`slugCommittee` bleiben **unverändert** (Ranking-Pfad bytegleich).
Neue, separate Funktion `committeeMatchKey` (matching.js) — selber Synonym-Katalog, aber mit
„maximal munch" (längster/spezifischster Schlüssel zuerst geprüft) kollisionssicher — wird
**ausschließlich** für Mitgliedschafts-/Belegvergleiche genutzt (Radar-Ausschuss-Reiter). Damit
bleibt die Ähnlichkeits-/Embedding-Pipeline bytegleich, während der Radar-Reiter korrekt und
kollisionssicher normalisiert. `office.js` (Büro) hat keinerlei Abhängigkeit zu `radarState`
oder den Ausschuss-Funktionen — strukturell unberührt.

## Zahlen
- **Vorher (aktueller Preview-Zustand):** 1 sichtbares Ausschuss-Signal (`vg-destabilisiert`).
- **Nachher (nach Korrektur):** **19 echte, strukturell verankerte Ausschuss-Signale**, davon
  **12 sichtbar** (bestehender, unveränderter `ENV_SEGMENT_CAP=12` — dieselbe Kappung wie bei
  Partei/Erwähnungen, sortiert nach Aktualität/Score; 7 weitere reale Treffer sind vorhanden,
  aber nicht in der Top-12-Anzeige). `vg-destabilisiert` selbst fällt nach der Korrektur aus der
  Top-12 (mehr echte, aktuellere Konkurrenz) — erwartetes Verhalten der bestehenden Sortierung.
- **Partei, Wahlkreis, Dynamiken, Erwähnungen:** unverändert (0 / 0 / 7 / 0 — exakt wie vor der
  Ausschuss-Korrektur, siehe Regressionsnachweis unten).

## Fachliche Bewertung aller 19 Treffer
**Gruppe 1 — hochvertrauenswürdig, exakte/offizielle Ausschuss-Bezeichnung (14 von 19):**
`vg-destabilisiert`, `vg-0362b11ce5daab502d72b364`, `vg-arbeitsmarkt`, `vg-arbeitsrecht`,
`vg-behindertenrechtskonvention`, `vg-bürgergeld`, `vg-digitalisierung`, `vg-eigenverantwortung`,
`vg-fcbc7c45c29ae0de58406c2e`, `vg-gewerkschaft`, `vg-renteneintrittsmodelle`, `vg-teilhabe`,
`vg-zuzahlungsfalle`, `vg-deutsche`. Alle tragen „Ausschuss für Arbeit und Soziales" bzw.
„Bundestagsausschuss für Arbeit und Soziales" **strukturell** in `ko.ausschuesse` (nicht nur
`mentioned_committees`), meist mit BMAS als Akteur, Themen genau im Fokus des Piloten (Bürgergeld,
Rente, Arbeitsmarkt, Tarifbindung, Arbeitsschutz, Teilhabe/Inklusion).

**Gruppe 2 — naheliegende Kurzform, thematisch eindeutig Bund (1 von 19):** `vg-gesundheit`
(„Arbeits- und Sozialausschuss" + Koalitionsausschuss-Reformpaket zu Steuern/Gesundheit/Rente/
Arbeitsmarkt — klar bundespolitisch, gebräuchliche Kurzform statt Vollname).

**Gruppe 3 — generische Kurzform „Sozialausschuss", institutionell nicht abschließend prüfbar
(4 von 19):** `vg-landwirtschaft` (GKV-Novelle, Bundesthema, generisches Label),
`vg-servicestelle` (SGB II/Bürgergeld-Vollzug, Bundesrecht, generisches Label), `vg-regierung`
(BMAS + explizit „kommunale Ebene" gemischt, Sammlung-KO mit 4 Ausschusslabels, teils nicht-
offizielle Namen), `vg-nachbarschaftshilfe` (**höchstes Fehlzuordnungsrisiko**: Text ist
explizit Landkreis-/Kommunalebene, „Sozialausschuss" hier vermutlich ein **kommunales**
Gremium, nicht der Bundestagsausschuss).

**Bewusst nicht behoben:** Die generische Kurzform „Sozialausschuss" → `arbeit-und-soziales` ist
ein **bereits bestehender** Eintrag im zentralen Synonym-Katalog (nicht neu eingeführt), der
schon heute von `profile-packages.js` (Paketaktivierung) und der Matching-Ähnlichkeitsbewertung
für ALLE Profile verwendet wird — das Ausschuss-Datenmodell (`ko.ausschuesse`) trägt keine
Ebenen-Kennzeichnung (Bund/Land/Kommune), die eine allgemeingültige, nicht pilotspezifische
Unterscheidung erlauben würde. Eine Änderung dieser Synonymbreite ist eine eigene, größere
Entscheidung mit Auswirkung auf alle Profile/Pakete — außerhalb des heutigen Auftrags (Radar an
zentrale Normalisierung anbinden). Flagge für eine mögliche spätere, separate Verbesserung
(Ebenen-Feld im KO-Schema).

**Nebenbefund (nicht behoben, außerhalb Testmatrix):** `"Digitalausschuss"` (Kurzform ohne
Leerzeichen) normalisiert auf `"digital"` statt `"digitales"` — eine Abdeckungslücke (verpasster
Treffer), keine Kollision (kein Fehlmerge). Nicht Teil der geforderten Testmatrix, nicht behoben.

## Code-Änderung
- `lib/helmut/matching.js`: neue, separat exportierte Funktion `committeeMatchKey` (kollisions-
  sicher, „maximal munch"). `normalizeCommittee`/`slugCommittee` **unverändert**.
- `lib/helmut/radarState.js`: `radarProfileTerms.committees` und die `committee`-Verzweigung in
  `radarRelationBeleg` nutzen jetzt `committeeMatchKey` (beide Seiten: Profil UND
  `ko.ausschuesse`). `mentioned_committees` zählt weiterhin NICHT (nur strukturell verankerte
  `ko.ausschuesse` — analog zur Partei-Regel).

## Tests
`scripts/radar-committee-normalization-test.js` (neu, 30 Assertions, alle grün): Kernmatrix
(Arbeit und Soziales/Ausschuss für Arbeit und Soziales/Bundestagsausschuss, Gesundheit/
Ausschuss für Gesundheit/Gesundheitsausschuss, Menschenrechte/Recht **bleiben getrennt**),
Groß-/Kleinschreibung, Profilfeldvarianten (`committee` singular + `committees` Array), ähnliche
Ausschussnamen ohne Verwechslung, bloße `mentioned_committees`-Erwähnung → kein Treffer, reine
Themen-/Titelnennung ohne `ausschuesse`-Feld → kein Treffer, Dedup, **explizit gepinnte
Ranking-Neutralität** (`normalizeCommittee`/`slugCommittee` bytegleich vs. `committeeMatchKey`
getrennt und kollisionssicher), Partei-/Wahlkreis-Regression.

Bestandssuiten unverändert grün: `radar-party-normalization` 31/31, `radar-state` 102/102,
`radar` 38/38, `radar-ui` 18/18, `radar-scan-limit` 3/3, `matching-norm` 20/20,
`profile-supply-matrix` 20/20, `ko-anreicherung` 18/18, `admin-profile-fields` 15/15,
`contract-adapter` 31/31, `current-helmut-state` 79/79, `decisions` 38/38, `lage` 138/138,
`helmut-fields` 65/65, `helmut-tab-ui` 50/50, `cache-isolation` 10/10.

## Erneute Preview-Prüfung
Nach Rebuild des Branch-Previews erwartet: Ausschuss-Reiter zeigt **12 Vorgänge** (statt 1),
alle mit Bezug „Arbeit und Soziales" (BMAS-Themen, Bürgergeld, Rente, Arbeitsmarkt,
Tarifbindung, Gesundheitsreform-Berührung). Partei bleibt korrekt leer, Wahlkreis bleibt leer,
„Neue Dynamiken" weiterhin 7 Signale (identisch zu vorher), Lage/Helmut/Büro unverändert.

## Grenzen (verbindlich eingehalten)
Keine Production-Änderung, kein Deployment, keine Feature-Flag-Änderung, keine
Quellenaktivierung, kein Cron, kein Tageslimit, kein Cutover. Production bleibt bis zur
erneuten Preview-Prüfung gesperrt.
