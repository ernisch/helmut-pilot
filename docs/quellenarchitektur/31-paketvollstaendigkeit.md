# Fachliche Paketvollständigkeit — Nachweis (Phase-1-Punkt 13)

**Erhebung:** 2026-07-26 · **Korrektur der Ausschuss-Sollmenge:** 2026-07-26 (§2a) · **Grundlage:** `main` `9f1def5` (Merge #130) + Arbeitsbranch
`claude/helmut-phase1-punkt13-9iwu69` · **Methode:** rein lesend gegen den committeten Code,
**kein** Production-Zugriff, **keine** Datenänderung

> **Was diese Datei beantwortet.** „Ist jedes Quellenpaket **fachlich** vollständig — oder nur
> technisch angelegt?" Sie erfüllt Punkt **13** aus
> [`../roadmap/phase_1_checkliste.md`](../roadmap/phase_1_checkliste.md).
>
> **Abgrenzung zur Inventur.** [`30-paket-inventur-production.md`](30-paket-inventur-production.md)
> misst den **Ist-Zustand der Production-Datenbank** (Zeilen, Ertrag, letzte Lieferung). Diese
> Datei bewertet die **fachliche Zusammensetzung der Paketdefinition** im Code. Beides ist nötig
> und beides ist verschieden: ein Paket kann fachlich vollständig zusammengesetzt sein und
> trotzdem nichts liefern (Berlin/Brandenburg), und ein Paket kann liefern und trotzdem fachlich
> unzureichend sein (`regional-niedersachsen`).
>
> **„Vollständig" heißt hier ausdrücklich NICHT „liefert".** Lieferwahrheit steht in der Inventur
> §3 und gehört zu den Punkten 10/14/15/16.

---

## 1 · Warum Punkt 13 vorher nicht beweisbar war

| Befund | Wirkung |
|---|---|
| `bund-basis`, `arbeit-und-soziales`, `die-linke-bund`, `regional-niedersachsen` trugen `required_classes: []` | Für **4 von 8** Paketen existierte kein maschinell prüfbares Vollständigkeitskriterium — „fachlich vollständig" war weder belegt noch widerlegt (Inventur §4) |
| Klassenabdeckung der Landespakete wurde aus der **Namenskonvention der Abrufweg-Ids** abgeleitet (`be-<klasse>`) | Systematische **Unterzählung**: deduplizierte Rohquellen tragen nur die *erste* Klasse in ihrer Id. Die Inventur hat das selbst als „Hilfsableitung, keine Systemwahrheit" markiert |
| `buildFullModel()` kennt für die vier `prepared`-Landespakete **0 Abrufwege** | Im kanonischen Codemodell sind sie leere Platzhalter; ihre Wege liegen ausschließlich im Landesmodul-Seed. Kein Codepfad vereinigte beide |
| Vollzähligkeitszusagen standen nur im Fließtext (`purpose`: „alle Ausschuesse", „alle Fraktionen") | Nicht prüfbar, also nicht durchgesetzt |
| **Die erste Fassung dieser Prüfung war katalogrelativ** — die Ausschuss-Sollmenge wurde aus dem Katalog abgeleitet und dann gegen den Katalog geprüft | Sie konnte nur beweisen, dass jeder *bekannte* Ausschuss im Pflichtpaket liegt, nicht dass die Menge stimmt. **Genau dort lag der Fehler: 23 statt 24** (§2a) |

## 2 · Fachliche Kriterien (jetzt ausführbar)

Umgesetzt in [`../../lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js`](../../lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js),
abgesichert durch `scripts/paketvollstaendigkeit-test.js`.

| # | Kriterium | Umsetzung |
|---|---|---|
| 1 | **Zweck und politische Zuständigkeit** sind je Paket eindeutig benannt | `PACKAGE_REQUIREMENTS[key].zweck` / `.zustaendigkeit`, mit `belegt`-Herkunftsangabe |
| 2 | **Pflichtklassen** (Themen/Ebenen/Institutionstypen) sind besetzt | `required_classes` der Paketdefinition (geht in die DB) ∩ abgeleitete Klassen der zugeordneten Abrufwege |
| 3 | **Pflicht-Herausgeberklassen** sind vertreten | `evidence_role` der Herausgeber (`official_primary`/`direct_interest`/`journalistic`/`data_source`/`aggregator`) |
| 4 | **Vollzähligkeit** statt Behauptung | Regeln `alle_institutionellen_ausschuesse`, `alle_bundestagsfraktionen`, `alle_genannten_regionen` |
| 5 | **Mindestens ein benannter Herausgeber** je Paket | ≥ 1 Abrufweg mit `evidence_role != aggregator` |
| 6 | **Leere Platzhalter** werden erkannt | Pflichtklassen deklariert + 0 Abrufwege → `blockiert` |
| 7 | **Falsche/doppelte Zuordnungen** werden erkannt | jede Mehrfachzuordnung muss in `ZULAESSIGE_UEBERSCHNEIDUNGEN` deklariert und begründet sein |
| 8 | **Fachlich unmögliche** Pflichtklassen werden getrennt geführt | `nichtAnwendbar` mit Begründung — zählt **nicht** als erledigt, Paket bleibt „teilweise" |
| 9 | **Vorbereitet ≠ aktiv** | Status- und `activation_mode`-Prüfung; Berlin/Brandenburg bleiben `prepared`/`manual` |
| 10 | **Determinismus** | Generatorlauf byte-identisch, zwei Bewertungsläufe identisch, Drift-Gate greift |

### Klassenableitung

Die Klasse eines Abrufwegs wird **deterministisch aus committeten Katalogmerkmalen** abgeleitet
(`type`, `neutral`, `regional`, `party`, Id-Herkunft) — nicht aus einer gepflegten Namensliste.
Für die Landesmodul-Wege wird die im Seed bereits vorhandene `covers`-Angabe übernommen statt neu
geraten. 18 Bundesklassen, 15 Landesklassen; **jede** der 143 Katalogquellen erhält mindestens
eine Klasse (getestet).

Der institutionelle Ausschussweg ist am Namensanfang `„Ausschuss …"` verankert. Das ist nötig,
weil die 25 Themen-×-Kontext-Bündel denselben `type: "committee"` tragen, aber
`„<Thema> · Ausschuss …"` heißen — ohne die Verankerung hätten Themensuchen als
Ausschussabdeckung gezählt (getestet als Negativkontrolle).

## 2a · Korrektur: die Ausschuss-Sollmenge ist jetzt extern verankert

**Befund (2026-07-26, externe Prüfung).** Der Katalog führte **23** ständige Bundestagsausschüsse.
Der 21. Deutsche Bundestag hat **24** — eingesetzt durch Beschluss vom **15. Mai 2025** auf
Grundlage der **Drucksache 21/150** vom 13. Mai 2025 (gemeinsamer Antrag CDU/CSU und SPD,
„Einsetzung von Ausschüssen"). Amtliche Bekanntgabe der Zahl:
`bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982` und
`bundestag.de/presse/hib/kurzmeldungen-1065308`.

### Was gefehlt hat

**Der Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung** (§ 128 GO-BT; einer der vier
kleinsten Ausschüsse der Wahlperiode mit 14 Mitgliedern) war im Katalog **überhaupt nicht
vorhanden** — kein Abrufweg, keine Zuordnung, keine Erwähnung. Für die 21. Wahlperiode belegt
durch die amtliche Ausschuss-Tagesordnung `bundestag.de/resource/blob/1178498/to07.pdf`
(7. Sitzung) und die kanonische Ausschussseite `bundestag.de/go`.

### Ursache der Abweichung 23 statt 24

Kein Zählfehler, sondern eine **fehlende externe Verankerung** in zwei Schichten:

1. Die Katalogliste `bundestagCommitteeSources` war eine **handgepflegte Auswahl von
   Politikfeldern** („Breite Abdeckung ALLER Bundestags-Ausschüsse/Politikfelder"), nie ein
   Abgleich gegen den Einsetzungsbeschluss. Ein Ausschuss ohne eigenes Sachpolitikfeld —
   Wahlprüfung/Immunität/Geschäftsordnung ist parlamentarische Selbstorganisation — fiel dabei
   durch das Raster.
2. Die Vollzähligkeitsregel leitete ihre Sollmenge **aus demselben Katalog** ab. Sie war damit
   per Konstruktion erfüllbar: sie konnte 23 von 23 bestätigen, ohne zu wissen, dass 24 richtig ist.

**Zusätzlich stammten mehrere Bezeichnungen und Zuschnitte aus der 20. Wahlperiode** — die
Ausschussstruktur wurde zur 21. Wahlperiode am neuen Ressortzuschnitt ausgerichtet:

| Katalog-Id (unverändert) | vorher (20. WP) | jetzt (21. WP, amtlich) |
|---|---|---|
| `committee-landwirtschaft` | Ausschuss Ernährung und Landwirtschaft | **Ausschuss für Landwirtschaft, Ernährung und Heimat** |
| `committee-familie` | Ausschuss Familie, Senioren, Frauen und Jugend | **Ausschuss für Bildung, Familie, Senioren, Frauen und Jugend** |
| `committee-bildung` | Ausschuss Bildung und Forschung | **Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung** |
| `committee-klima-umwelt` | Ausschuss Klima und Umwelt | **Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit** |
| `committee-recht` | Ausschuss Recht | **Ausschuss für Recht und Verbraucherschutz** |
| `committee-digitales` | Ausschuss Digitales | **Ausschuss für Digitales und Staatsmodernisierung** |
| `committee-bau-wohnen` | Ausschuss Bauen und Wohnen | **Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen** |
| `committee-sport` | Ausschuss Sport | **Ausschuss für Sport und Ehrenamt** |
| `committee-europa` | Ausschuss Europäische Union | **Ausschuss für die Angelegenheiten der Europäischen Union** |
| `committee-verteidigung` · `committee-finanzen` · `committee-haushalt` · `committee-auswaertiges` · `committee-petitionen` | Kurzform „Ausschuss …" | **Verteidigungsausschuss · Finanzausschuss · Haushaltsausschuss · Auswärtiger Ausschuss · Petitionsausschuss** |

Die Umbenennung von `committee-bildung` ist keine Kosmetik, sondern ein **Zuschnittwechsel**:
Bildung liegt in der 21. Wahlperiode beim Familienausschuss, Forschung/Technologie/Raumfahrt
bildet einen eigenen Ausschuss. Beide Suchdefinitionen sind entsprechend korrigiert.

### Was geändert wurde

1. **Neue kanonische Quelle:**
   [`../../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js`](../../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js) —
   Wahlperiode, Einsetzungsbeschluss und die **24** Ausschüsse mit stabiler fachlicher Kennung,
   amtlicher Bezeichnung und je eigenem amtlichen Fundstellenhinweis. Diese Datei wird **nicht**
   aus dem Katalog abgeleitet; der Katalog wird gegen sie geprüft.
2. **Katalog korrigiert:** alle 24 Ausschussquellen tragen jetzt die amtliche Bezeichnung (aus der
   Sollmenge geholt, nicht doppelt gepflegt) und eine `ausschussKey`-Kennung. Der fehlende
   24. Ausschuss ist als Abrufweg `rp-committee-wahlpruefung` ergänzt — **derselbe
   Google-News-Suchweg wie die anderen 22**, mit Suchbegriffen strikt aus der amtlichen
   Bezeichnung („Wahlprüfung OR Immunität OR Geschäftsordnung OR Wahlrecht"). Keine erfundene
   Quelle, keine erfundene URL.
3. **Katalog-Ids eingefroren.** Auch wo der Slug nicht mehr zum Namen passt (`committee-bildung`
   trägt jetzt den Forschungsausschuss). Eine Id-Änderung würde beim Seed-Einspielen eine **neue**
   `retrieval_paths`-Zeile anlegen und die alte als Waise im Pflichtpaket zurücklassen, wo sie
   weiter gecrawlt würde. Die fachliche Bindung läuft deshalb über `ausschussKey`, nicht über den Slug.
4. **Erkennung umgestellt:** „institutioneller Ausschuss" wird über `ausschussKey` erkannt, nicht
   mehr über das Namensmuster `^Ausschuss `. Fünf der 24 amtlichen Bezeichnungen beginnen nicht
   mit „Ausschuss " — die Namensverankerung hätte sie ab jetzt übersehen.
5. **Vollzähligkeitsregel umgestellt:** `alle_institutionellen_ausschuesse` prüft gegen die
   externe Sollmenge (24) statt gegen das Kataloginventar und nennt die geprüfte Wahlperiode.
6. **Rückweg nachgezogen:** Seed 1 legt jetzt erstmals einen **neuen Abrufweg** an. Der gezielte
   Restore (`scripts/seed-restore-sql.js`) deckte diesen Fall nicht ab und hätte die neue Zeile
   stehen gelassen — gefangen durch die Byte-Gleichheitsprüfung des Restore-Tests. Er entfernt sie
   jetzt *guarded* (nur wenn keine `package_paths`-Zeile sie mehr referenziert, wegen
   `on delete cascade`).

### Ehrliche Grenze der Recherche

`bundestag.de` und `dserver.bundestag.de` sind aus der Agentensitzung **nicht direkt abrufbar**
(die Netzrichtlinie der Umgebung antwortet mit `403` auf `CONNECT`; die HTML-Seiten liefern
zusätzlich Bot-`403` — dieselbe Sperre, die auch `rp-bundestag` betrifft). Der **Volltext der
Drucksache 21/150 konnte daher nicht gelesen werden.** Die Sollmenge stützt sich auf amtliche
Bundestagsdokumente der 21. Wahlperiode, die erreichbar waren — insbesondere die
**Ausschuss-Tagesordnungen** (`bundestag.de/resource/blob/…`), die jede Bezeichnung wörtlich im
Kopf tragen, sowie die kanonischen Ausschussseiten. Jeder Eintrag der Sollmenge nennt seine
Fundstelle. **Empfehlung:** die Liste beim nächsten Zugang zu `dserver.bundestag.de` einmal
direkt gegen den Volltext von 21/150 abgleichen.

## 3 · Vollständigkeitsmatrix

**8 Pakete im Code-Seed** (7 in der Production-DB — die zwei Landes-Parteipakete aus #118 warten
auf die freigabepflichtige Seed-Einspielung). Personenbezogene Pakete `profil-<mandats-id>`
existieren bewusst **nur** als DB-Zeilen und stehen nicht im Code-Seed (Mandantenneutralität,
getestet).

| Paket | Ebene / Region | Aktivierung | Wege | Pflichtklassen | besetzt | Pflichtrollen | erfüllt | **Ergebnis** |
|---|---|---|---|---|---|---|---|---|
| `bund-basis` | bund / `geo-bund`, `is_base` | **aktiv** | 56 | 7 | **7** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `arbeit-und-soziales` | bund / `geo-bund` | **aktiv** | 84 | 10 | **10** (+1 zusätzlich) | `official_primary`, `direct_interest`, `data_source`, `journalistic` | ja | **Vollständig** |
| `die-linke-bund` | bund / `geo-bund` | **aktiv** | 3 | 1 | **1** (+1 zusätzlich) | `direct_interest` | ja | **Vollständig** |
| `regional-niedersachsen` | land / `geo-land-niedersachsen` | **aktiv** | 4 | 1 | **1** | — | **0 benannte Herausgeber** | **Teilweise vollständig** |
| `berlin-basis` | land / `geo-land-berlin`, `is_base` | vorbereitet | 7 | 12 | **12** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `brandenburg-basis` | land / `geo-land-brandenburg`, `is_base` | vorbereitet | 8 | 12 | **12** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `die-linke-berlin` | land / `geo-land-berlin` | vorbereitet | 3 | 3 | **3** | `direct_interest` | ja | **Vollständig** |
| `die-linke-brandenburg` | land / `geo-land-brandenburg` | vorbereitet | 1 | 3 | **1** (2 fachlich unmöglich) | `direct_interest` | ja | **Teilweise vollständig** |

**Summe: 6 vollständig · 2 teilweise vollständig · 0 blockiert.**

### 3.1 · Abdeckung je Paket im Einzelnen

**`bund-basis`** — neutrale Grundversorgung für **jedes** Mandat.
Pflichtklassen: `parlament_bund` (3 Wege) · `regierung_bund` (3) · `bundestagsausschuesse` (**24**) ·
`bundestagsfraktionen` (8) · `allgemeine_bundespolitik` (5) · `leitmedien_bund` (16) ·
`parlamentsdokumentation` (DIP, 1). Beleglage: 5 amtlich · 16 journalistisch · 35 Aggregator.
Vollzähligkeit: **24/24** ständige Ausschüsse der 21. Wahlperiode (geprüft gegen den
Einsetzungsbeschluss, nicht gegen den Katalog), **8/8** Fraktionen.

**`arbeit-und-soziales`** — Fachthemenpaket.
`fachministerium` (6) · `bundestagsausschuesse` (1) · `fachparlamentsvorgaenge` (4) ·
`fachmedien` (15) · `verbaende_gewerkschaften` (17) · `amtliche_daten` (13) ·
`prozessquellen` (7) · `themenradar` (10) · `themenbuendel` (25) · `mediensignale` (9).
Zusätzlich (nicht Pflicht): `parteiquellen_bund` (2 Fraktions-Fachsuchen).

**`die-linke-bund`** — Partei-Direktquellen.
`parteiquellen_bund` (2: Partei + Bundestagsfraktion, beide `direct_interest`); zusätzlich der
neutrale Fraktions-Suchweg (begründete Überschneidung, §4).

**`regional-niedersachsen`** — siehe §5, Befund **V-1**.

**`berlin-basis` / `brandenburg-basis`** — **12 von 12** neutralen Pflichtklassen besetzt.
Das korrigiert beide Zahlenreihen der Inventur §4 (Ist-Stand dort 10/15 bzw. 9/15, Prognose nach
Seed-Einspielung 7/12 bzw. 8/12): die Lücke war ein Artefakt der Id-Namensableitung. Gemessen an `covers` deckt Berlin alle 12 mit 7 Wegen ab
(PARDOK-XML → `plenum`/`drucksachen`/`schriftliche_anfragen`/`gesetzgebung`;
`site:parlament-berlin.de` → `landesparlament`/`ausschuesse`; Senats-Weg →
`landesregierung`/`ministerien`), Brandenburg alle 12 mit 8 Wegen
(parldok-XML → 4 Klassen; Landesregierungs-Weg → `landesregierung`/`staatskanzlei`).
Beide Pakete tragen **keine** Partei-/Fraktions-/Personenklasse — P0-2 bleibt gewahrt (getestet).

**`die-linke-brandenburg`** — siehe §5, Befund **V-2**.

## 4 · Überschneidungen

Genau **drei** Abrufwege liegen in mehr als einem Paket. Jede weitere Mehrfachzuordnung lässt die
Suite fehlschlagen (Negativkontrolle vorhanden).

| Abrufweg | Pakete | Begründung | Bewertung |
|---|---|---|---|
| `rp-rbb24-politik` | `berlin-basis`, `brandenburg-basis` | rbb ist ein Zwei-Länder-Sender; `/politik` mischt Berlin und Brandenburg. **Ein** Abrufweg, **zwei** Paketreferenzen statt derselben Rohquelle zweimal | bewusst zulässig |
| `rp-fraction-linke` | `bund-basis`, `die-linke-bund` | neutrale Fraktionsvollzähligkeit **und** Parteipaket brauchen denselben Weg; ohne ihn hätte `die-linke-bund` 0 funktionierende Wege (gegen den Production-Snapshot gemessen) | bewusst zulässig |
| `rp-ausschuss-arbeit-soziales` | `bund-basis`, `arbeit-und-soziales` | **neu in diesem Sprint**, siehe §5 Befund **V-3** | bewusst zulässig |

Zwischen `bund-basis` und `arbeit-und-soziales` besteht sonst **keine** Überschneidung — die
strikte Trennung Region ↔ Fachthema ist gemessen intakt.

## 5 · Gefundene Lücken und ihre Behandlung

| # | Befund | Beleg | Behandlung |
|---|---|---|---|
| **V-1** | **`regional-niedersachsen` hat keinen benannten regionalen Herausgeber.** Alle 4 Abrufwege sind Google-News-**Themensuchen** ohne `site:`-Filter → Herausgeber ist der Aggregator. 0 journalistische, 0 amtliche Beleglage. Zusätzlich sind alle 4 Wege thematisch auf Arbeit/Soziales gebunden, obwohl das Paket nach **Region** zugewiesen wird — ein Mandat derselben Region mit anderem Schwerpunkt erhält eine thematisch fremde Regionalversorgung. Die regionalen Herausgeber der Region **sind** im Katalog vorhanden (Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute, HAZ, Neue Presse, NDR), werden aber von der Kuratierung entfernt: `keepCuratedSource` lässt `type: "media"` erst ab `priority >= 64` durch, regionale Medien tragen 52–60 | `lib/helmut/sources.js` (`regionalSources`, `stateAndConstituencySources`, `keepCuratedSource`); Rollenmessung im vereinigten Modell | **Erkannt und dauerhaft abgesichert, bewusst nicht behoben.** Das Anheben der Schwelle brächte rund 20 zusätzliche Google-News-Abrufe je Crawl — eine Kosten-/Laufzeitentscheidung und damit freigabepflichtig, zumal die Google-Konzentration (Befund B1) bereits der wichtigste offene Architekturpunkt ist. Das Paket ist deshalb **teilweise vollständig**; die Suite verhindert, dass es unbemerkt als vollständig gilt |
| **V-2** | **`die-linke-brandenburg` kann 2 seiner 3 Pflichtklassen nicht besetzen.** `fraktion_pilot` und `person_pilot` existieren fachlich nicht: Die Linke hat in der 8. Wahlperiode keine Landtagsfraktion in Brandenburg (LTW 22.09.2024 unter 5 %), und es gibt keinen MdL der Partei | `seeds/landesmodule-kandidaten.js`, `unbesetztePilotklasse()`-Begründungen | **Als „fachlich unmöglich" ausgewiesen, nicht als offene Aufgabe.** Die Pflichtklassen werden **nicht** entfernt (das wäre eine Abschwächung des Kriteriums); das Paket bleibt „teilweise vollständig" mit begründeter Unmöglichkeit. Ein Ersatz aus einer fremden Partei ist ausdrücklich ausgeschlossen |
| **V-3** | **Das neutrale Pflicht-Basispaket enthielt nur 22 der 23 ständigen Bundestagsausschüsse des Katalogs.** Genau der Ausschuss für Arbeit und Soziales fehlte — er lag ausschließlich im **Themenpaket** `arbeit-und-soziales`, das ein Mandat nur bei passendem Profil erhält. Jedes andere Mandat hätte 22 von 23 Ausschüssen bekommen, und die Lücke wäre der Profilform des Pilotmandanten gefolgt, obwohl `bund-basis` „alle Ausschuesse" zusagt | `packageKeysForSource`; Vollzähligkeitsregel `alle_institutionellen_ausschuesse` | **Behoben.** Ein institutioneller Ausschussweg gehört jetzt immer auch in `bund-basis`. Wirkung: **+1** `package_paths`-Zeile, **0** neue Abrufwege, **0** Änderung an Aktivierungsmodi. Der Weg war schon vorher katalogaktiv (`auto`) — es entsteht **kein** zusätzlicher Abruf |
| **V-4** | **Jede regionale Quelle landete im Niedersachsen-Paket**, unabhängig von ihrer echten Region. Unter der Production-Kuratierung fiel das nicht auf (nur Niedersachsen-Quellen überleben), mit `HELMUT_SOURCE_CURATION=off` wären es **30 fremde Regionen** in einem Niedersachsen-Paket gewesen | `packageKeysForSource` (alt: `if (source.regional) keys.push("regional-niedersachsen")`) | **Behoben.** Die Zuordnung läuft über die Regionsbegriffe der Paketdefinition; eine regionale Quelle ohne Regionsbezug bleibt bewusst ohne Paket. Der generierte Seed ist unter Production-Kuratierung **unverändert** (0 Diff-Zeilen aus dieser Änderung) |
| **V-5** | **Die Regionsbegriffe lagen doppelt** — einmal im Profil-Resolver, einmal implizit im Paketinhalt. Zuweisung und Paketinhalt konnten auseinanderlaufen | `profile-packages.js` vs. `seeds/packages.js` | **Behoben.** Eine Quelle der Wahrheit: `REGION_TERMS_BY_PACKAGE` in der Paketdefinition; der Resolver liest sie von dort |
| **V-6** | **Der Admin-Report weist Pflichtklassen als `present: 0` aus.** Ursache ist nicht fehlendes Tagging (das gibt es jetzt), sondern dass der Report auf `buildFullModel()` arbeitet, das für Berlin/Brandenburg keine Wege kennt | `admin-report.js` §Länder | **Erkannt, Kommentar korrigiert, Umsetzung als OP-23 vermerkt.** Der `catalog`-Eingang speist auch Aktivierung und Qualitätsbericht — 18 vorbereitete Landeswege würden dort Kennzahlen verschieben. Die Anzeige **untertreibt**, erzeugt also kein falsches Grün |

## 6 · Ausführbare Absicherung

`node scripts/paketvollstaendigkeit-test.js` — **91 Prüfungen** in 14 Gruppen, entsprechend den
Phase-4-Zusicherungen des Auftrags:

| Gruppe | Sichert ab |
|---|---|
| 1 Paketbestand | genau die 8 erwarteten Pakete; jedes mit fachlicher Anforderung; keine tote Anforderung; kein `profil-*`-Paket im Code-Seed |
| 2 Zuordnungen vorhanden | kein Paket ohne Weg; kein leerer Platzhalter; die vier Landespakete sind im vereinigten Modell nicht leer; der Bund-Seed enthält weiterhin **keine** BE/BB-Wege |
| 3 Zuordnung → Abrufweg | keine verwaiste Zuordnung; jeder Weg liegt in ≥ 1 Paket; `unmapped = 0` |
| 4 Abrufweg → Herausgeber | jeder Weg hat einen existierenden Herausgeber mit gültiger Belegfunktion |
| 5 Pflichtklassen | keine offene Klassenlücke; jeder Weg trägt ≥ 1 Klasse; Zielzahlen je Paket; P0-2-Neutralität der Landes-Basispakete |
| 5b Klassenableitung | deterministisch; Themenbündel zählen **nicht** als Ausschuss (Negativkontrolle); keine Klasse außerhalb des erklärten Vokabulars |
| 6 Herausgeberklassen | Pflichtrollen vertreten; reine Aggregator-Beleglage wird erkannt |
| 7 Vollzähligkeit | **24/24** Ausschüsse (gegen die externe Sollmenge, §6a), 8/8 Fraktionen, 4/4 Regionen — **plus Negativkontrolle**: ein entfernter Ausschuss macht die Regel rot |
| 8 Überschneidungen | genau die 3 deklarierten; jede begründet; **Negativkontrolle**: eine undeklarierte Doppelzuordnung wird erkannt |
| 9 Regionszuordnung | Niedersachsen trifft, Bayern trifft nicht; Umlautschreibung; eine Begriffsliste; Resolver und Paketinhalt stimmen überein |
| 10 Vorbereitet bleibt inaktiv | 4 Pakete `prepared`; 18 Wege `needs_review` + `manual`; ein Berliner Landtagsprofil aktiviert **0** Landeswege — **plus Negativkontrolle**, dass diese Probe Zähne hat |
| 11 Kein falsches Grün | nur die zwei belegt unvollständigen Pakete sind nicht „vollständig"; Mängel und Ergebnis sind gekoppelt; **Negativkontrollen** für Paket ohne Anforderung und umbenanntes Paket |
| 12 Definition = Seed | beide Seeds byte-genau der Generatorausgabe; erneute Generierung stabil; `required_classes` jedes Pakets im Seed; kein Paket mehr mit leerer Liste |
| 13 Production-Sicherheit | 5 `always_on`-Wege unverändert; 145 Katalogwege; 140 `auto`; genau **eine** zusätzliche Zuordnung; keine Statusänderung; die Suite schreibt selbst keine Datei; **Strukturriegel**: der Live-Crawlpfad importiert weder `packageKeysForSource` noch `buildFullModel`, und der relationale Plan wird aus DB-Zeilen gebaut |
| 14 Reproduzierbarkeit | zwei Bewertungsläufe identisch; Bestandszahlen 145 + 18 = 163 Wege, 147 + 19 = 166 Zuordnungen |

### 6a · Extern verankerte Zusicherung (Ausschuss-Sollmenge)

`node scripts/bundestag-ausschuesse-test.js` — **36 Prüfungen**, die *nicht* gegen das
Kataloginventar prüfen:

| Gruppe | Sichert ab |
|---|---|
| 1 Sollmenge | erwartete Wahlperiode ist die **21.**; Einsetzungsbeschluss (Drucksache 21/150 vom 13.05.2025, Beschluss 15.05.2025) ist als Primärquelle benannt; die Sollmenge enthält **exakt 24** Ausschüsse; jeder trägt stabile Kennung, amtliche Bezeichnung und Fundstelle; keine Bezeichnung einer früheren Wahlperiode; die vier grundgesetzlich vorgeschriebenen Ausschüsse (Art. 45/45a/45c GG) und der Geschäftsordnungsausschuss (§ 128 GO-BT) sind enthalten |
| 2 Katalog gegen Sollmenge | genau 24 Ausschussquellen; kein fehlender, kein unbekannter, kein doppelter Eintrag; **keine abweichende Bezeichnung**; jede Quelle trägt den amtlichen Namen wörtlich und die Klasse `bundestagsausschuesse`; die 25 Themenbündel und die Prozessquellen zählen **nicht** als Ausschuss |
| 3 Negativkontrollen | ein **fehlender** Ausschuss → rot · ein **zusätzlicher veralteter** Ausschuss der 20. WP → rot · **Zahlengleichstand rettet nicht**: Tausch eines aktuellen gegen einen veralteten Ausschuss (24 bleibt 24) → rot · eine **Umbenennung** (Kennung stimmt, Name nicht) → rot · eine **Zusammenlegung** (zwei Kennungen auf eine reduziert) → rot · eine Quelle ohne Kennung fällt aus der Ist-Menge → rot |
| 4 Wirkung auf `bund-basis` | die Regel nennt die geprüfte Wahlperiode; **24/24** abgedeckt; die Sollzahl stammt aus dem Einsetzungsbeschluss, nicht aus dem Katalog; jeder der 24 Wege liegt im Pflicht-Basispaket; **Negativkontrolle**: fehlt der 24. im Basispaket, ist `bund-basis` nicht mehr vollständig |
| 5 Production-Sicherheit | der neue Weg ist **nicht** `always_on` und nicht `is_critical`; die 5 `always_on`-Kernwege unverändert; der neue Weg überlebt die Kuratierung (sonst wäre die Abdeckung nur auf dem Papier) |

## 7 · Wirkung auf die freigabepflichtige Seed-Einspielung

Die Änderungen wirken **nicht** von selbst — Seeds werden nicht automatisch eingespielt. Wenn der
Betreiber Seed `20260713` (nach den bestehenden Kriterien in
[`../betrieb/quellen-seed-einspielung.md`](../betrieb/quellen-seed-einspielung.md)) einspielt,
kommen gegenüber der bisherigen Vorschau **genau zwei** Effekte hinzu:

1. `required_classes` wird für die vier Bundespakete gesetzt (`on conflict … do update`) — von
   `{}` auf 7 / 10 / 1 / 1 Klassen. Reine Metadaten für die Vollständigkeitsanzeige; **kein**
   Einfluss auf Crawl, Aktivierung oder Matching.
2. **+2** `package_paths`-Zeilen: `pkg-bund-basis` ↔ `rp-ausschuss-arbeit-soziales` und
   `pkg-bund-basis` ↔ `rp-committee-wahlpruefung`. Der erste Weg existiert in Production bereits,
   ist `auto` und steht dort auf `broken` — er wird durch diese Zeile **nicht** abgerufen. Nach der
   (separat freigabepflichtigen) Reaktivierung liefert er in das Basispaket **und** in das
   Fachthemenpaket; wegen der globalen Wegededuplizierung entsteht **kein** zweiter Abruf.
3. **+1** `retrieval_paths`-Zeile: `rp-committee-wahlpruefung`, der 24. ständige Ausschuss.
   `status='needs_review'`, `activation_mode='auto'`, **nicht** `always_on`, **nicht**
   `is_critical`. Er wird nach der Einspielung mitgecrawlt — **das ist der Zweck** und die einzige
   echte Laufzeitwirkung dieser Korrektur: **ein** zusätzlicher Google-News-Abruf je Crawl
   (145 → 146 Wege für ein voll versorgtes Profil, +0,7 %). Die Google-Konzentration (Befund B1)
   steigt entsprechend um einen Weg.

Damit steigt die Soll-Zahl der Zuordnungen im Seed von 145 auf **147** und die der Abrufwege von
144 auf **145**; gegen die gemessene Production sind das **+2** eingefügte Zuordnungen (statt
bisher 0) und **+1** eingefügter Abrufweg. Der gezielte Restore dreht beides zurück (§2a, Punkt 6).
Alle übrigen Soll-Zahlen des Runbooks bleiben unverändert.

## 8 · Was dieser Nachweis **nicht** belegt

- **Keine Lieferwahrheit.** „Vollständig" bewertet die fachliche Zusammensetzung, nicht dass
  Dokumente ankommen (→ Inventur §3, Punkte 10/14/15/16).
- **Die Ausschuss-Vollzähligkeit ist seit der Korrektur NICHT mehr katalogrelativ** (§2a): sie
  wird gegen die 24 ständigen Ausschüsse der 21. Wahlperiode geprüft, verankert im
  Einsetzungsbeschluss. **Weiterhin katalogrelativ** ist die Fraktionsvollzähligkeit (8/8) — für
  sie existiert in diesem Repository keine externe Sollmenge; das ist der nächste analoge Schritt.
- **Der Volltext der Drucksache 21/150 wurde nicht gelesen.** Die Sollmenge stützt sich auf
  amtliche Bundestagsdokumente der 21. Wahlperiode (Ausschuss-Tagesordnungen, kanonische
  Ausschussseiten), weil `bundestag.de`/`dserver.bundestag.de` aus dieser Sitzung nicht abrufbar
  sind. Jeder Eintrag nennt seine Fundstelle; ein direkter Abgleich gegen 21/150 bleibt
  empfohlen (§9).
- **Kein Nachweis für Production-Zeilen.** Bewertet ist der Code-Seed (8 Pakete). Die
  Production-DB führt 7 Pakete + ein personenbezogenes; die Angleichung ist die
  freigabepflichtige Seed-Einspielung.
- **Keine Aussage über inhaltliche Qualität** der gelieferten Dokumente (Punkte 19–28).
- **Verbände und Gewerkschaften werden gemeinsam geführt**, weil der Katalog sie nicht per Typ
  unterscheidet (beide `association`). Eine Trennung wäre eine gepflegte Namensliste — bewusst
  nicht eingeführt.

## 9 · Verbleibende benannte Schritte

| Schritt | Art | Zuständig |
|---|---|---|
| Sollmenge einmal direkt gegen den Volltext der Drucksache 21/150 abgleichen (Bezeichnungen und Reihenfolge) | externe Primärquelle, read-only | Betreiber (Netzzugang zu `dserver.bundestag.de`) |
| Fraktionsvollzähligkeit analog extern verankern (heute katalogrelativ, 8/8) | Code, klein | frei planbar |
| `regional-niedersachsen` mit benannten regionalen Herausgebern versorgen (Kuratierungsschwelle oder gezielte Ausnahme) | Kosten-/Laufzeitentscheidung, ≈ 20 zusätzliche Abrufe je Crawl | Betreiber |
| Pflichtklassenanzeige im Admin an das vereinigte Modell hängen | Code, OP-23 | frei planbar |
| Seed `20260713` einspielen, damit `required_classes` und die Ausschusszuordnung in der DB wirken | Production-Datenänderung | freigabepflichtig |

## 10 · Reproduktion

```
node scripts/bundestag-ausschuesse-test.js          # 36/36 — Ausschuss-Sollmenge (extern verankert)
node scripts/paketvollstaendigkeit-test.js          # 91/91 — fachliche Vollständigkeit
node scripts/source-architecture-test.js            # 98/98 — relationales Fundament
node scripts/profile-packages-test.js               # 69/69 — Profil -> Paket
node scripts/seed-drift-test.js                     # Seed == Generator
node scripts/seed-restore-test.js                   # 43/43 — Seed-Wirkung + Rückweg
node scripts/generate-source-architecture-seed.js   # danach: git diff == leer
node scripts/run-offline-tests.js                   # gesamte Offline-Suite
```

Die Bewertung ist auch direkt abfragbar, ohne Datenbank und ohne Netz:

```js
const { assessPackageCompleteness } = require("./lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
console.log(assessPackageCompleteness().summary);
// { pakete: 8, vollstaendig: 6, teilweise: 2, blockiert: 0, wegeGesamt: 163, zuordnungen: 166 }
```
