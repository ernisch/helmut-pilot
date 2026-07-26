# Fachliche Paketvollständigkeit — Nachweis (Phase-1-Punkt 13)

**Erhebung:** 2026-07-26 · **Grundlage:** `main` `9f1def5` (Merge #130) + Arbeitsbranch
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

## 3 · Vollständigkeitsmatrix

**8 Pakete im Code-Seed** (7 in der Production-DB — die zwei Landes-Parteipakete aus #118 warten
auf die freigabepflichtige Seed-Einspielung). Personenbezogene Pakete `profil-<mandats-id>`
existieren bewusst **nur** als DB-Zeilen und stehen nicht im Code-Seed (Mandantenneutralität,
getestet).

| Paket | Ebene / Region | Aktivierung | Wege | Pflichtklassen | besetzt | Pflichtrollen | erfüllt | **Ergebnis** |
|---|---|---|---|---|---|---|---|---|
| `bund-basis` | bund / `geo-bund`, `is_base` | **aktiv** | 55 | 7 | **7** | `official_primary`, `journalistic` | ja | **Vollständig** |
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
Pflichtklassen: `parlament_bund` (3 Wege) · `regierung_bund` (3) · `bundestagsausschuesse` (23) ·
`bundestagsfraktionen` (8) · `allgemeine_bundespolitik` (5) · `leitmedien_bund` (16) ·
`parlamentsdokumentation` (DIP, 1). Beleglage: 5 amtlich · 16 journalistisch · 34 Aggregator.
Vollzähligkeit: **23/23** institutionelle Ausschüsse, **8/8** Fraktionen.

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

`node scripts/paketvollstaendigkeit-test.js` — **89 Prüfungen** in 14 Gruppen, entsprechend den
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
| 7 Vollzähligkeit | 23/23 Ausschüsse, 8/8 Fraktionen, 4/4 Regionen — **plus Negativkontrolle**: ein entfernter Ausschuss macht die Regel rot |
| 8 Überschneidungen | genau die 3 deklarierten; jede begründet; **Negativkontrolle**: eine undeklarierte Doppelzuordnung wird erkannt |
| 9 Regionszuordnung | Niedersachsen trifft, Bayern trifft nicht; Umlautschreibung; eine Begriffsliste; Resolver und Paketinhalt stimmen überein |
| 10 Vorbereitet bleibt inaktiv | 4 Pakete `prepared`; 18 Wege `needs_review` + `manual`; ein Berliner Landtagsprofil aktiviert **0** Landeswege — **plus Negativkontrolle**, dass diese Probe Zähne hat |
| 11 Kein falsches Grün | nur die zwei belegt unvollständigen Pakete sind nicht „vollständig"; Mängel und Ergebnis sind gekoppelt; **Negativkontrollen** für Paket ohne Anforderung und umbenanntes Paket |
| 12 Definition = Seed | beide Seeds byte-genau der Generatorausgabe; erneute Generierung stabil; `required_classes` jedes Pakets im Seed; kein Paket mehr mit leerer Liste |
| 13 Production-Sicherheit | 5 `always_on`-Wege unverändert; 144 Katalogwege; 139 `auto`; genau **eine** zusätzliche Zuordnung; keine Statusänderung; die Suite schreibt selbst keine Datei; **Strukturriegel**: der Live-Crawlpfad importiert weder `packageKeysForSource` noch `buildFullModel`, und der relationale Plan wird aus DB-Zeilen gebaut |
| 14 Reproduzierbarkeit | zwei Bewertungsläufe identisch; Bestandszahlen 144 + 18 = 162 Wege, 146 + 19 = 165 Zuordnungen |

## 7 · Wirkung auf die freigabepflichtige Seed-Einspielung

Die Änderungen wirken **nicht** von selbst — Seeds werden nicht automatisch eingespielt. Wenn der
Betreiber Seed `20260713` (nach den bestehenden Kriterien in
[`../betrieb/quellen-seed-einspielung.md`](../betrieb/quellen-seed-einspielung.md)) einspielt,
kommen gegenüber der bisherigen Vorschau **genau zwei** Effekte hinzu:

1. `required_classes` wird für die vier Bundespakete gesetzt (`on conflict … do update`) — von
   `{}` auf 7 / 10 / 1 / 1 Klassen. Reine Metadaten für die Vollständigkeitsanzeige; **kein**
   Einfluss auf Crawl, Aktivierung oder Matching.
2. **+1** `package_paths`-Zeile: `pkg-bund-basis` ↔ `rp-ausschuss-arbeit-soziales`. Der Weg
   existiert in Production bereits, ist `auto` und steht dort auf `broken` — er wird durch diese
   Zeile **nicht** abgerufen. Nach der (separat freigabepflichtigen) Reaktivierung liefert er in
   das Basispaket **und** in das Fachthemenpaket; wegen der globalen Wegededuplizierung entsteht
   dadurch **kein** zweiter Abruf.

Damit steigt die Soll-Zahl der Zuordnungen im Seed von 145 auf **146**; gegen die gemessene
Production sind das **+1** statt bisher **0** eingefügte Zeilen. Alle übrigen Soll-Zahlen des
Runbooks bleiben unverändert.

## 8 · Was dieser Nachweis **nicht** belegt

- **Keine Lieferwahrheit.** „Vollständig" bewertet die fachliche Zusammensetzung, nicht dass
  Dokumente ankommen (→ Inventur §3, Punkte 10/14/15/16).
- **Die Vollzähligkeit ist katalogrelativ.** Bewiesen ist: *jeder* ständige Bundestagsausschuss
  und *jede* Bundestagsfraktion, die der Katalog kennt, liegt im neutralen Pflicht-Basispaket.
  **Nicht** bewiesen ist, dass der Katalog die Ausschussliste des laufenden Bundestages
  vollständig kennt (23 Einträge). Diese Gegenprobe braucht eine externe Primärquelle;
  `bundestag.de` ist aus dieser Sitzung nicht erreichbar (Netzrichtlinie der Umgebung antwortet
  mit `403` auf `CONNECT` — dieselbe Bot-Sperre, die auch `rp-bundestag` betrifft). Offener,
  benannter Schritt für den Betreiber, siehe §9.
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
| Ausschussliste des laufenden Bundestages gegen die 23 Katalogeinträge prüfen | externe Primärquelle, read-only | Betreiber (Netzzugang zu `bundestag.de`) |
| `regional-niedersachsen` mit benannten regionalen Herausgebern versorgen (Kuratierungsschwelle oder gezielte Ausnahme) | Kosten-/Laufzeitentscheidung, ≈ 20 zusätzliche Abrufe je Crawl | Betreiber |
| Pflichtklassenanzeige im Admin an das vereinigte Modell hängen | Code, OP-23 | frei planbar |
| Seed `20260713` einspielen, damit `required_classes` und die Ausschusszuordnung in der DB wirken | Production-Datenänderung | freigabepflichtig |

## 10 · Reproduktion

```
node scripts/paketvollstaendigkeit-test.js          # 89/89 — fachliche Vollständigkeit
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
// { pakete: 8, vollstaendig: 6, teilweise: 2, blockiert: 0, wegeGesamt: 162, zuordnungen: 165 }
```
