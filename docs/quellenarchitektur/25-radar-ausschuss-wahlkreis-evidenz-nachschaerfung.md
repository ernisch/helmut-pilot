# Radar Ausschuss/Wahlkreis — Nachschärfung: echte Beleg-Evidenz statt Normalisierung allein

Stand: read-only reproduziert aus Produktionsdaten. **Keine** Production-Änderung, kein Flag,
kein Deploy, keine Quellenaktivierung. Der Fix liegt ausschließlich im Feature-Branch.

## Genaue Ursache
Die vorherige Korrektur (Dok. 24) machte den Ausschuss-Vergleich zentral konsistent
(`committeeMatchKey`), prüfte aber nur, ob der normalisierte **Schlüssel** übereinstimmt. Das
reicht nicht: kurze, mehrdeutige Kurzformen wie „Sozialausschuss" existieren an **jeder**
politischen Ebene (Bund/Land/Kommune) und normalisieren auf denselben Schlüssel wie die
offizielle Bundestags-Bezeichnung „Ausschuss für Arbeit und Soziales". Dadurch erschienen
Koalitionsausschuss-Meldungen, kommunale Gremien und ein bloßes Themenwort fälschlich im
Ausschuss-Reiter. Beim Wahlkreis lag die Ursache separat: `regionalInterests` des Profils
(zulässig auch das eigene Bundesland, z. B. „Niedersachsen") floss ungefiltert in den
Wahlkreis-Vergleich ein — der Code-Kommentar sagte zwar „kein allgemeines Bundesland", die
Implementierung filterte das aber nicht heraus.

## Neue Beleg-Regel (Ausschuss)
Ein Ausschuss-Treffer zählt nur noch, wenn zusätzlich zur Schlüssel-Übereinstimmung **eine**
belastbare Bedingung erfüllt ist:
- **(a)** mindestens ein passender `ko.ausschuesse`-Eintrag trägt die **volle amtliche Form**
  („Ausschuss für X" / „Bundestagsausschuss für X") **ohne** widersprechenden Ebenen-/
  Institutions-Marker (Landtag/kommunal/Koalitionsausschuss),
- **(b)** der volle kuratierte Ausschussname (aus den 23 offiziellen Bundestags-Fachausschüssen,
  `seeds/entities.js`) steht wörtlich im Titel/Inhalt,
- **(c)** eine echte amtliche Quelle (`source_type = 'bundestag'`) ist beteiligt — **außer** der
  Vorgang trägt selbst ein Misch-/Kommunal-/Koalitions-Signal (dann zählt nur (a) oder (b); ein
  zufällig vorhandenes `bundestag`-Dokument in einem großen Sammel-Vorgang belegt nicht
  automatisch genau diesen Ausschussbezug).

Für Landtag-Profile (`parliamentType === 'Landtag'`) verlangt (a) einen expliziten
Landtag-/Abgeordnetenhaus-Marker statt der Bundestags-Form — es gibt noch keinen kuratierten
Land-Ausschusskatalog (Landesmodule sind strukturell vorbereitet, siehe `seeds/entities.js`).

**Bewusst NICHT** als Ausschuss-Quelle vertraut: `source_type = 'committee'`. Stichprobe ergab,
dass dieser Wert im Bestand nachweislich unspezifisch vergeben wird — u. a. an eine
Behinderten-NGO (Lebenshilfe), tagesschau.de, eine Agrar-Fachpublikation und eine lokale
bayerische Zeitung (Merkur/Wolfratshausen). `source_type = 'bundestag'` (DIP-Dokumente:
Drucksachen/Kleine Anfragen/Beschlussempfehlungen) ist die geprüft saubere Kategorie.

## Neue Beleg-Regel (Wahlkreis)
Zu allgemeine Geografien zählen nicht mehr als Wahlkreisbezug: alle 16 Bundesländer (zentral aus
der Geografie-Seed-Liste, kein Bundesland hartkodiert) sowie „Deutschland"/„Bund"/„Europa"/„EU"
werden aus den Wahlkreis-Profilbegriffen ausgeschlossen, bevor sie mit `ko.mentioned_locations`
verglichen werden.

## Betroffene Vorgänge (vollständige Tabelle)

| Titel | aktuelle Zuordnung (vorher) | Beleg | politische Ebene | konkreter Ausschuss/Geografie | Ergebnis |
|---|---|---|---|---|---|
| BMAS startet zweite Phase eines Energieprojekts | Ausschuss | volle Form „Ausschuss für Arbeit und Soziales" | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Arbeitsmarkt bleibt trotz leichter Erholung weiter angespannt | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| EU-Digitalisierung erleichtert Arbeitnehmerentsendung | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Umsetzung der UN-Behindertenrechtskonvention (Lebenshilfe-Bericht) | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Bürgergeld-Verschärfung (Sanktionen/Mitwirkungspflichten) | Ausschuss | volle Form „Bundestagsausschuss für…" | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Sammlung: Diverse sozialpolitische Initiativen (Inklusion/Qualifizierung) | Ausschuss | volle Form (+ Unterausschuss-Variante) | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| eDeclaration-Verordnung Arbeitnehmerentsendung | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| BMAS-Papier „Verbindlichkeit, Eigenverantwortung und Mitwirkung" | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Rente mit 70 – neue Regelungen | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| Mitbestimmung/Gewerkschaften/Tarifbindung | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| BMAS-Modelle für längeres Arbeitsleben | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| BMAS-Ausschreibung + Bundesteilhabepreis 2026 | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| GKV-Reform: Zuzahlungsregelung belastet Rentner | Ausschuss | volle Form | Bund | Ausschuss für Arbeit und Soziales | **behalten** |
| „…warum Tarifflucht unsere Demokratie destabilisiert" | Ausschuss | bloßes Themenwort „Arbeit und Soziales" (kein „Ausschuss"), Quelle bachhausen.de (kein Bundestag) | nicht belegbar | keiner | **entfernt** |
| **Koalitionsausschuss einigt sich auf Reformpaket** (Steuern/Gesundheit/Rente/Arbeitsmarkt) | Ausschuss | Vorgang ist ein Koalitionsausschuss-Beschluss; Kurzform „Arbeits- und Sozialausschuss" ohne Beleg | Koalitionsausschuss (keine Parlamentsebene) | keiner | **entfernt** |
| **Bund plant Ausnahmen für Landwirtschaft in GKV-Novelle** | Ausschuss | bloße Kurzform „Sozialausschuss", Quelle top agrar (Fachmedium, kein Bundestag) | nicht belegbar | keiner | **entfernt** |
| Landkreis führt bezahlte Nachbarschaftshilfe ein | Ausschuss | „Sozialausschuss" im Landkreis-Kontext, Quelle Merkur (Lokalzeitung) | Kommune | kommunaler Sozialausschuss (nicht Cems Ausschuss) | **entfernt** |
| **BMAS und kommunale Ausschüsse stärken Teilhabe und Inklusion** | Ausschuss | explizit „kommunale Ausschüsse"/„Bundes- und kommunaler Ebene" gemischt | Bund+Kommune gemischt | keiner eindeutig | **entfernt** |
| Servicestelle SGB II – Hinweise §10 Abs.1 Nr.3 | Ausschuss | bloße Kurzform „Sozialausschuss", Quelle Servicestelle SGB II (Verwaltung, kein Bundestag) | Bundesverwaltung (nicht Parlament) | keiner | **entfernt** |
| **Bovenschulte: Ein starkes, soziales und einiges Europa wichtiger denn je** | Wahlkreis | nur Bundesland „Niedersachsen" + „Europa"/„Deutschland" in mentioned_locations, Quelle Bundesrat | Land (Bundesrat) | kein konkreter Wahlkreisbezug | **entfernt** |

(Fett = vom Nutzer explizit als auffällig benannt.)

## Zahlen
- **Ausschuss-Signale vorher (nach Dok. 24, vor dieser Nachschärfung):** 19 (12 sichtbar, Cap 12).
- **Echte Ausschuss-Signale danach:** **13** (12 sichtbar, Cap unverändert bei 12 — eines fällt
  jetzt knapp aus der Top-12, da weniger Konkurrenz um die Plätze besteht als vorher gedacht).
- **Entfernte Fehlzuordnungen:** 6 Ausschuss-Vorgänge (siehe Tabelle) + 1 Wahlkreis-Vorgang
  (Bovenschulte).
- **Wahlkreis-Prüfung:** 0 echte Wahlkreis-Signale für Cem (Bovenschulte war der einzige
  Treffer und ist jetzt korrekt entfernt; kein Ersatztreffer aufgetaucht).

## Regression (unverändert, verifiziert)
Partei: 0 (unverändert) · Wahlkreis: 0 (Bovenschulte korrekt entfernt) · Neue Dynamiken: **7**,
identische Vorgänge (`vg-ausschreibung, vg-gesundheit, vg-grundsicherung, vg-probleme,
vg-regierung, vg-teilhabe, vg-verfassung`) · Erwähnungen: 0. Lage/Helmut/Büro strukturell
unberührt (Büro/`office.js` hat keine Abhängigkeit zu `radarState`; Lage/Helmut lesen
`briefingContract.items`/`currentHelmutState`, nicht `environment` — 19 Bestandssuiten
(700+ Assertions) unverändert grün, siehe unten).

## Code-Änderung
- `lib/helmut/radarState.js`:
  - Neue Ausschuss-Beleg-Funktionen: `isOfficialCommitteeForm`, `hasNonBundCommitteeSignal`,
    `hasLandCommitteeSignal`, `officialCommitteeNameInContent`, `hasOfficialCommitteeSource`,
    `committeeHasSufficientEvidence`, `committeeRelationBeleg`.
  - `radarProfileTerms`: `parliamentType` (zentral aus `config.parliamentTypeOf`) ergänzt;
    `constituencies` nutzt jetzt `constituencyKeySet` (schließt `TOO_GENERAL_REGION_SLUGS` aus:
    16 Bundesländer + Bund/Europa, zentral aus `seeds/geographies.js`).
  - Neue Importe: `config.parliamentTypeOf`, `seeds/geographies.LAENDER`,
    `seeds/entities.COMMITTEES` (reine Daten, kein DB-Zugriff, kein Zyklus).
- **Bewusst unverändert:** `matching.js` (`normalizeCommittee`/`slugCommittee`, Ranking/Score/
  Top-50-Cut bleiben bytegleich — dieselbe Ranking-Neutralität wie in Dok. 24 begründet).

## Tests
`scripts/radar-committee-evidence-test.js` (neu, 27 Assertions, alle grün): Arbeit und Soziales
als echter Bundestagsausschuss, kommunaler Sozialausschuss (inkl. explizitem „kommunale
Ausschüsse"-Fall), Koalitionsausschuss, Landtagsausschuss (inkl. Ebenen-Isolierung: Bundestag-
Profil sieht Landtag-Ausschuss nicht und umgekehrt), reine Themennennung, Gesundheitsausschuss/
Landwirtschaftsausschuss (Kurzform allein unzureichend, Korroboration über Inhalt/Quelle
funktioniert), gleicher Ausschussname auf verschiedenen Ebenen, korrekter/falscher Wahlkreis,
Bundesrat ohne Wahlkreisbezug, Person aus anderer Region, Partei-Regression.

Zwei Tests aus der vorherigen Runde (`radar-committee-normalization-test.js`,
`radar-state-test.js`) testeten bare Kurzformen als ausreichend — das war die alte, jetzt
absichtlich verschärfte Erwartung; beide aktualisiert, um die neue, korrekte Regel zu spiegeln
(kein Kurzform-Sonderfall mehr, gilt gleich für Gesundheit/Recht/Auswärtiges).

Alle 19 Suiten grün (700+ Assertions): `radar-committee-evidence` 27/27,
`radar-committee-normalization` 32/32, `radar-party-normalization` 31/31, `radar-state` 102/102,
`radar` 38/38, `radar-ui` 18/18, `radar-scan-limit` 3/3, `matching-norm` 20/20,
`profile-supply-matrix` 20/20, `ko-anreicherung` 18/18, `admin-profile-fields` 15/15,
`contract-adapter` 31/31, `current-helmut-state` 79/79, `decisions` 38/38, `lage` 138/138,
`helmut-fields` 65/65, `helmut-tab-ui` 50/50, `cache-isolation` 10/10, `profile-completeness`
46/46, `profile-db` 44/44.

## Erneute Preview-Prüfung
Nach Rebuild erwartet: Ausschuss-Reiter zeigt **12 Vorgänge**, alle mit der vollen amtlichen
Form „Ausschuss für Arbeit und Soziales"/„Bundestagsausschuss für Arbeit und Soziales" belegt —
keine Koalitionsausschuss-, keine kommunalen, keine bloßen Themen-Treffer mehr. Wahlkreis-Reiter
zeigt **0 Vorgänge** (Bovenschulte verschwunden, kein Ersatz). Partei bleibt leer, „Neue
Dynamiken" weiterhin 7 (identische Vorgänge), Lage/Helmut/Büro unverändert.

## Grenzen (verbindlich eingehalten)
Keine Production-Änderung, kein Deployment, keine Feature-Flag-Änderung, keine
Quellenaktivierung, kein Cron, keine Tageslimit-Änderung, kein Cutover.
