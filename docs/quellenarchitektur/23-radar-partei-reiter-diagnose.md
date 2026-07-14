# Radar „Dein Umfeld › Partei" — Diagnose des leeren Reiters + Härtung (B1/B2)

Stand: read-only reproduziert aus Produktionsdaten. **Keine** Production-Änderung, kein Flag,
kein Deploy, keine Quellenaktivierung. Der Fix liegt ausschließlich im Feature-Branch.

## Frage
Der Preview zeigt im Radar **7 neue Signale** und gefüllte „Neue Dynamiken", aber „Dein Umfeld ›
Partei" ist leer („Keine neuen relevanten Parteisignale"). Ist das fachlich korrekt oder ein
Zuordnungsfehler?

## Verbindliches Ergebnis: fachlich korrekt (kein Zuordnungsfehler)
Der Live-Zustand wurde offline **exakt reproduziert** — echter Lesepfad (`decideForUser` limit 50 →
`augmentFreshCandidates` → `sourceSafety` → `toBriefingContractV3` → `radarState`) mit echtem
Cem-Profil (Blob **und** `mandate_profiles` identisch: `partei`/`fraktion` = „Die Linke"), 195
verstandenen KOs und 1.147 Quellzeilen. Ergebnis: `environment.party = 0`, `dynamics = 7`,
`Wahlkreis = 1`, `Ausschüsse = 1` — **deckt sich exakt** mit der Beobachtung (die „7" ist eine
unabhängige Bestätigung, dass die Nachstellung den Live-Pfad trifft).

### Warum leer
- Das **einzige** saubere Die-Linke-Akteur-Signal ist `vg-angleichung` (`parteien = ["DIE LINKE"]`,
  Quelle vom Typ `party`). Die Beleg-Regel **besteht** es (isoliert eingespeist → `party = 1`).
- `vg-angleichung` rankt aber **Platz 84 von 130** in Cems Profil-Relevanz (similarity 0,0538) — es
  geht um Polizei-/Feuerwehr-Zulagen, kaum Überschneidung mit Cems Arbeit/Soziales/Rente-Profil; nur
  die Partei matcht. Der Lesepfad kappt auf **Top-50**; Platz 84 fällt raus, `augmentFreshCandidates`
  rettet es nicht (8 Tage alt, nicht „frisch"). Es erreicht `radarState` nie.
- Alle anderen „Die Linke"/„Linke"-KOs führen die Partei nur als **eine von fünf** Koalitions-/
  Beteiligtenparteien (SPD, CDU/CSU, Grüne, FDP, Die Linke). Das sind Beteiligten-Auflistungen,
  **keine** Partei-Akteur-Signale → korrekt nicht im Reiter (Quelle Medien, Partei nicht im Titel).
- `vg-sozialabbau` (`parteien = ["Die Linke"]`) hat als primäre Quelle Medien (SWR) und keine
  Partei-/Fraktionsquelle → nach der strengen Akteursregel korrekt nicht gewertet.

Der Reiter-Text „Keine neuen **relevanten** Parteisignale" ist damit inhaltlich zutreffend. Der
Partei-Reiter speist sich (anders als „Über dich"/Erwähnungen) nur aus den Top-50-Decisions; ob er
zusätzlich einen Breit-Fallback erhalten soll, ist eine **Produktentscheidung** (offen, hier NICHT
geändert).

## Zwei latente Korrektheits-Bugs (allgemein, nicht die Ursache hier) — behoben
Beide betreffen **alle** Parteien/Fraktionen, keine Cem-Sonderregel. Sie ändern Cems aktuelle Anzeige
**nicht** (offline verifiziert: `party = 0`, `dynamics = 7`, `Wahlkreis = 1`, `Ausschüsse = 1`
unverändert), härten aber die Beleg-Regel für andere Parteien/Schreibweisen.

- **B1 — Normalisierungs-Drift (`radarState.js`):** Der Radar verglich Partei/Fraktion mit rohem
  `slug()` (`"die linke"` ≠ `"linke"`), während das Matching die Features zentral über
  `normalizeParty()` erzeugt. Ein korrekt gematchter Partei-Akteur, dessen KO-Schreibweise vom Profil
  abwich (z. B. Profil „Die Linke" vs. `ko.parteien` „Linke"), wurde im Radar wieder verworfen. Fix:
  `radarProfileTerms`, `radarRelationBeleg`, `partyRelationBeleg` und die Debug-Spiegelung
  `radarPartyDecision` nutzen jetzt dieselbe zentrale `slugParty`-Normalisierung auf **beiden** Seiten
  (Profil UND `ko.parteien`). Umlaut-Faltung auch im Titel-Akteursbeleg (z. B. „Grüne").
- **B2 — nur primäre Quelle geprüft:** `radarPartyActorEvidence` prüfte nur die (nach link_type/Datum)
  primäre Quelle auf `source_type` party/faction. Fix: **alle** Quellen des Vorgangs werden geprüft.

**Bewusst außerhalb des Scope (unverändert):** Die Ausschuss-Dimension trägt dieselbe latente
`slug`-Lücke (z. B. „Ausschuss für Arbeit und Soziales" vs. „Arbeit und Soziales"). Sie wurde NICHT
geändert, weil das Cems sichtbaren Ausschüsse-Reiter verändern würde (1 → 12) und der angefragte Scope
Partei/Fraktion ist. Separat entscheidbar.

## Tests
`scripts/radar-party-normalization-test.js` (neu, 31 Assertions, alle grün): zentrale Normalisierung
(Die Linke/DIE LINKE/Linke/Linksfraktion → ein Schlüssel; SPD/CDU/Union/Grüne/AfD/FDP/BSW getrennt;
Grüne == Bündnis 90/Die Grünen; FDP == Freie Demokraten; de- == en-Profilfelder), B1-Akteurserkennung
je Partei, B2-Nicht-Primärquelle, Leerzustand (Koalitions-Auflistung → nicht gewertet) vs. Präsenz
(echter Akteur → gewertet), nur-`mentioned_parties` → nicht gewertet, Dedup, Ausschuss/Wahlkreis
unverändert. Regression: `radar-state` 102/102, `radar` 38/38, `radar-ui` 18/18, `matching-norm`
20/20, `contract-adapter` 31/31, `current-helmut-state` 79/79, `decisions` 38/38, `lage` 138/138.

## Erneute Preview-Prüfung
Der Fix ist reine Lesepfad-Logik (0 KI, 0 Kosten, keine Migration). Nach Deploy des Feature-Branch-
Previews ist zu erwarten: **Der Partei-Reiter bleibt für Cem korrekt leer** (die Ursache — der
Top-50-Relevanz-Cut von `vg-angleichung` — ist unverändert; B1/B2 ändern Cems Anzeige nicht). Prüfung:
Radar weiterhin 7 Signale, „Neue Dynamiken" gefüllt, „Partei" leer, „Wahlkreis"/„Ausschüsse" je 1 —
identisch zu vorher, jetzt aber mit zentral-normalisierter, für alle Parteien robuster Beleg-Regel.
