# Sprint 3 — Versorgungsstandard je Mandat (Phase 3)

`master/supply-standard.js` definiert für **jedes** Mandat den benötigten Quellenumfang als zwölf
Versorgungsebenen mit je zehn Attributen. Der Standard ist **Daten** und wird pro Mandatsprofil
ausgewertet (`evaluateSupply`) — es gibt **keinen** fest codierten Pilot-Sonderfall (Test §22).

## Die zwölf Versorgungsebenen mit den zehn Pflichtattributen

Attribute je Ebene: (1) Pflicht/optional · (2) Mindestanzahl funktionierender Quellen · (3)
Mindestanzahl unabhängiger Herausgeber · (4) notwendige Quellentypen · (5) zulässige Ersatzquellen ·
(6) max. Anbieter-Abhängigkeit · (7) Aktualität · (8) Gesundheit · (9) Qualität (Vertrauen) · (10)
blockierend/nicht blockierend.

| Ebene | Pflicht | min. Quellen | min. Herausgeber | notwendige Typen | Ersatz | max. Anbieter | Aktualität | Gesundheit | Qualität | blockierend |
|-------|:---:|:---:|:---:|---|---|:---:|---|---|---|:---:|
| Institutionelle Grundversorgung | ✔ | 4 | 3 | parlament, bundesregierung, ausschuss | bundesrat, ministerium, datenportal | 50 % | daily | degraded | hoch | ✔ |
| Partei-Versorgung | ✔ | 1 | 1 | partei | fraktion | 100 % | weekly | degraded | mittel | ✔ |
| Fraktionsversorgung | ✔ | 1 | 1 | fraktion | partei | 100 % | weekly | degraded | mittel | ✔ |
| Personenversorgung | – | 1 | 1 | abgeordnete | suchanbieter | 100 % | weekly | broken | niedrig | – |
| Ausschussversorgung | ✔ | 1 | 1 | ausschuss | parlament, ministerium | 100 % | weekly | degraded | mittel | ✔ |
| Themenversorgung | – | 2 | 2 | fachmedien, wissenschaft, fachverband | ministerium, behoerde, thinktank, ngo | 60 % | weekly | degraded | mittel | – |
| Ministeriumsversorgung | ✔ | 1 | 1 | ministerium | bundesregierung, behoerde | 100 % | weekly | degraded | hoch | ✔ |
| Regionalversorgung | – | 1 | 1 | medien_regional | landtag, landesregierung, kommunal | 70 % | weekly | degraded | mittel | – |
| Medienversorgung | ✔ | 2 | 2 | medien_ueberregional | medien_regional, fachmedien | 50 % | daily | degraded | mittel | – |
| Fachöffentlichkeit | – | 2 | 2 | fachverband, gewerkschaft, arbeitgeberverband, wissenschaft, thinktank, ngo | – | 60 % | monthly | broken | mittel | – |
| Politische Opposition/Gegenpositionen | ✔ | 2 | 2 | partei, fraktion | thinktank, ngo | 50 % | weekly | broken | mittel | – |
| Termin- und Vorgangsversorgung | ✔ | 1 | 1 | parlament, datenportal | bundesregierung, ministerium | 100 % | daily | degraded | hoch | ✔ |

## Verbindliche Regeln

- **Suchanbieter nur als Ergänzung/Rückfall (Abnahme §9):** `evaluateLevel` markiert eine Ebene,
  deren funktionierende Quellen **ausschließlich** Suchanbieter sind, als **nicht versorgt**
  (Grund `nur-suchanbieter-versorgung`). Bei einer blockierenden Pflichtebene (Partei, Ausschuss …)
  ist das ein **blockierender Mangel**. Google News kann damit **nie** die alleinige Versorgung
  einer Partei, eines Ausschusses oder eines Mandanten sein.
- **Unabhängige Herausgeber:** die geforderte `min_independent_publishers` zählt nur Nicht-Such-
  anbieter-Herausgeber → ein Cluster aus einem einzigen Anbieter erfüllt die Ebene nicht.
- **Anbieter-Klumpen:** überschreitet ein Herausgeber `max_single_provider_share`, gilt die Ebene
  als nicht versorgt (Grund `anbieter-klumpen`).
- **Blockierend vs. nicht blockierend:** nur Pflichtebenen mit `blocking=true` erzeugen einen
  blockierenden Mangel; optionale/nicht blockierende Lücken werden gemeldet, verhindern aber die
  Mandatsaktivierung nicht.

## Auswertung

`evaluateSupply(sourcesByLevel)` liefert `{ ok, fullyMet, blockingDeficiencies[], unmetRequired[],
perLevel[] }`. `ok=false`, sobald eine blockierende Pflichtebene nicht versorgt ist. Damit lässt sich
je Mandat prüfen, ob das zusammengestellte Quellenpaket den Versorgungsstandard erfüllt — die
Grundlage für die produktive automatische Zuweisung in Sprint 4.
