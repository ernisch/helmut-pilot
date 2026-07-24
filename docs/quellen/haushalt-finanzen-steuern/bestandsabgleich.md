# Bestandsabgleich `haushalt-finanzen-steuern` — Sprint 1

**Stand:** 2026-07-24 · **Verglichen gegen:** `main` @ `035898b` (2026-07-22) · **Branch dieser Analyse:** `claude/helmut-haushalt-sprint-1-unpfzk` (identischer HEAD wie `main`, geprüft vor Beginn)
**Modus:** ausschließlich statische Repository-Analyse. Keine Live-Abrufe, keine Websites geöffnet, keine Live-Abfrage der Produktions-Datenbank, keine Quellen implementiert, keine Parser geschrieben, keine Retrieval Paths angelegt, keine Seeds verändert, keine Aktivierung, keine Migration, kein Deployment, keine bestehende Quelle gelöscht oder verändert.
**Quellpaket:** hochgeladenes Paket `Helmut_haushalt_finanzen_steuern_Master_Uebergabe` (Sprint-1-Auftrag gemäß Chat-Anweisung; die Datei `00_MASTER/03_CLAUDE_CODE_MASTERAUFTRAG.md` beschreibt einen weiter gehenden Mehrphasen-Auftrag (Phase 0–6) — dieser Bericht deckt **ausschließlich** den in der Chat-Anweisung definierten Sprint-1-Umfang ab, nicht die späteren Phasen.

---

## 1. Gelesene Unterlagen und Abweichungen zur Anweisung

Alle sieben angeforderten Dokumente wurden gelesen. Zwei Dateinamen aus der Anweisung weichen von den tatsächlichen Namen im Paket ab; es wurde jeweils die inhaltlich passende reale Datei verwendet:

| Angefordert | Tatsächlich im Paket | Abweichung |
|---|---|---|
| `CLAUDE_CODE_START_HIER.md` | `CLAUDE_CODE_START_HIER.md` (Wurzelverzeichnis) | keine |
| `00_MASTER/01_konsolidierte_fachentscheidung.md` | `00_MASTER/01_KONSOLIDIERTE_FACHENTSCHEIDUNG.md` | nur Groß-/Kleinschreibung |
| `00_MASTER/02_architektur_master.json` | `00_MASTER/02_ARCHITEKTUR_MASTER.json` | nur Groß-/Kleinschreibung |
| `00_MASTER/04_no_go_regeln.md` | `00_MASTER/04_NO_GO_REGELN.md` | nur Groß-/Kleinschreibung |
| `00_MASTER/05_finaler_pflichtkern.csv` | `00_MASTER/05_FINALER_PFLICHTKERN.csv` | nur Groß-/Kleinschreibung |
| `00_MASTER/06_technische_kandidaten.csv` | `00_MASTER/07_KANDIDATEN.csv` | **andere Nummer und anderer Name** — inhaltlich die Kandidatenliste (13 Einträge, passend zum Zielbild „13 technische oder optionale Kandidaten“) |
| `00_MASTER/07_bewusste_ausschluesse.csv` | `01_EINZELBLOECKE/Helmut_haushalt_finanzen_steuern_Block_5_Neutralitaet_Deduplizierung_Gates/03_bewusste_ausschluesse.csv` | **liegt nicht in `00_MASTER`**, sondern nur im Block-5-Unterordner |

Zusätzlich zu den sieben angeforderten Dateien wurden ergänzend gelesen, weil sie für den Abgleich notwendig waren: `00_MASTER/06_BASISABDECKUNG_NICHT_DUPLIZIEREN.csv` (die 3 nicht zu duplizierenden Basispakete), alle fünf Block-Unterordner (`01_fachliche_entscheidung.md`, `02_pflichtrollen.csv`/`02_neue_pflichtrollen.csv`, `03_architekturzuordnung.json`, teils `README.md`/`MANIFEST.json`) sowie `00_MASTER/03_CLAUDE_CODE_MASTERAUFTRAG.md` zur Einordnung des Gesamtauftrags.

---

## 2. Fachliches Zielbild des Pakets (zur Einordnung)

- 15 konkrete neue oder zu prüfende Pflichtrollen (Block 1–4)
- 3 bestehende Basispakete (`bund-basis`, `berlin-basis`, `brandenburg-basis`), die **nicht** doppelt zugeordnet werden dürfen
- 13 technische oder optionale Kandidaten
- kein Google News im Pflichtkern
- Zielkorridor nach technischer Konsolidierung: 15–20 Retrieval Paths
- EU-Quellen zunächst nur Kandidat, keine automatische Pflicht
- Interessenquellen ausschließlich optional
- **Kritisches Stop Gate** (laut `01_KONSOLIDIERTE_FACHENTSCHEIDUNG.md`/`02_ARCHITEKTUR_MASTER.json`): *„Kann ein Fachpaket mit der bestehenden Geography Bindung Bund, Berlin und Brandenburg sauber bedienen?“* — diese Frage ist laut Auftrag **vor** jeder Paketanlage zu klären und wird in diesem Sprint **nicht beantwortet** (siehe Abschnitt 6.3); hier wird nur der dafür relevante Ist-Befund aus dem Code dokumentiert.

---

## 3. Methodik

- **Datenbasis:** ausschließlich der Code- und Dokumentationsstand auf `main`/`035898b` — Datenmodell (`lib/helmut/quellenarchitektur/model.js`), Seeds (`lib/helmut/quellenarchitektur/seeds/*.js`), Legacy-Katalog (`lib/helmut/sources.js`), Katalog-Mapper (`lib/helmut/quellenarchitektur/catalog.js`), generierte SQL-Seed (`supabase/seeds/20260713_source_architecture_seed.sql`) sowie die Statusdokumentation (`docs/quellenarchitektur/00-master-status.md`, `audit/source-coverage.md`, `docs/quellenarchitektur/28-quellenabdeckung-p2-5-readiness-diagnose.md`).
- **Wichtige Einschränkung:** Laut `docs/quellenarchitektur/00-master-status.md` ist `HELMUT_SOURCE_MODE=on` — die **relationale Datenbank** ist die aktive Quellenwahrheit in Produktion, der hartkodierte Katalog nur Fallback. Dieser Bericht vergleicht gegen den **Code-Stand** (Seeds + Katalog-Mapper), nicht gegen den Live-Inhalt der Produktions-Datenbank, weil ein Live-Zugriff laut Auftrag ausdrücklich nicht erlaubt ist. Ein Hinweis dazu: Der eingecheckte SQL-Seed-Schnappschuss (`20260713_...`) enthält keine Zeile für `news-bundesfinanzministerium-sozialstaat`, obwohl diese Quelle im aktuellen `lib/helmut/sources.js` existiert und vom Katalog-Mapper (`catalog.js:buildCatalog`) automatisch mitgezogen würde — es gibt also einen möglichen zeitlichen Versatz zwischen dem eingecheckten SQL-Schnappschuss und dem aktuellen Code-Stand, der ohne Live-Zugriff auf die Produktions-DB nicht abschließend auflösbar ist.
- **Statusdefinition** je Pflichtpfad:
  - **vollständig vorhanden** — ein offizieller, korrekt skalierter, aktiver Retrieval Path erfüllt die Pflichtrolle bereits.
  - **teilweise vorhanden** — es existiert ein Publisher und/oder ein Retrieval Path, der aber falsch skaliert (thematisch zu eng gefiltert), inaktiv/nur vorbereitet oder rein generisch/nicht rollenspezifisch ist.
  - **fehlt vollständig** — kein Publisher, kein Retrieval Path, keine Paketzuordnung auffindbar.
- Für die 13 technischen Kandidaten wurde ausschließlich geprüft, **ob** sie bereits im Repository existieren (Auftrag), keine Bewertung von Freigabebedingungen.

---

## 4. Pflichtpfad-Bestandsabgleich

Vollständige Tabelle mit allen 10 geforderten Dimensionen: `bestandsmatrix.csv` (Zeilen 1–15, Typ „Pflichtpfad“). Zusammenfassung je Block:

### Block 1 — BMF / Bundeshaushalt (Bund)

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 1 | BMF finanzpolitischer Signalstrom | teilweise vorhanden | Publisher + ein Google-News-Weg existieren, aber auf „Sozialstaat/Rente/Bürgergeld/Pflege/Haushalt“ verengt und nur für sozialpolitische Profile aktiv; die offizielle RSS-Übersicht aus der Fachentscheidung ist nicht eingebunden |
| 2 | BMF Gesetze und Gesetzesvorhaben | teilweise vorhanden | Kein BMF-eigener Weg, aber DIP (`rp-dip`, Bund-Basis, aktiv, always_on) deckt Gesetzesvorhaben aller Ressorts generisch und ungefiltert ab |
| 3 | BMF Monatsbericht | fehlt vollständig | kein Anknüpfungspunkt |
| 4 | BMF Open Data | fehlt vollständig | kein Anknüpfungspunkt |
| 5 | Bundeshaushalt Datenportal und Downloads | fehlt vollständig | kein Anknüpfungspunkt; als „kanonischer Bundeshaushaltsdatenweg“ laut Zielbild aber der zentrale Datenanker des gesamten Pakets |
| 6 | Arbeitskreis Steuerschätzungen | fehlt vollständig | repositoryweite Suche nach „Steuerschätzung“/„Arbeitskreis“ ohne Treffer |

### Block 2 — Kontrolle, Statistik, Recht, EU (Bund)

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 7 | Bundesrechnungshof Berichte und Bemerkungen | teilweise vorhanden | Publisher (`authority-bundesrechnungshof`, trust „hoch“) existiert bereits; vorhandener Weg ist auf „Sozialausgaben“ verengt, keine allgemeine Haushaltskontrolle/Sonderberichte |
| 8 | Stabilitätsrat | fehlt vollständig | repositoryweite Suche ohne Treffer |
| 9 | Destatis Öffentliche Finanzen und Steuern | teilweise vorhanden | Publisher (`statoffice-destatis`, trust „hoch“) existiert bereits; vorhandener Weg ist auf Sozialstatistik verengt, keine Einnahmen/Ausgaben/Finanzierungssaldo/Staatsverschuldung |
| 10 | Bundesfinanzhof Entscheidungen | fehlt vollständig | repositoryweite Suche nach „Bundesfinanzhof“ ohne Treffer |
| 11 | Bundesfinanzhof Presse | fehlt vollständig | wie Nr. 10 |

### Block 3 — Berlin

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 12 | SenFin Berlin fachlicher Signalstrom | teilweise vorhanden | Aus einem unabhängigen, früheren Sprint (Sprint 9/9B „Landesmodule Berlin/Brandenburg“) existiert ein vorbereiteter, aber **inaktiver** generischer Weg „Senat Berlin“ (alle Senatsverwaltungen ungefiltert); kein SenFin-eigener Weg; `pkg-berlin-basis` ist Status `prepared`, laut Master-Status „hart gesperrt“ |
| 13 | SenFin Berlin Haushaltsdaten und Open Data | fehlt vollständig | Landesmodul Berlin deckt nur parlamentarische Open-Data-XML ab, keine Haushalts-/Finanzdaten |

### Block 4 — Brandenburg

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 14 | MdFE Brandenburg finanzpolitischer Signalstrom | teilweise vorhanden | Gleiche Struktur wie Nr. 12: vorbereiteter, inaktiver generischer Weg „Ministerien Brandenburg“, MdFE nicht namentlich genannt; `pkg-brandenburg-basis` Status `prepared`, „hart gesperrt“ |
| 15 | MdFE Brandenburg Haushalts- und Finanzdokumentenindex | fehlt vollständig | Die Fachentscheidung selbst markiert diesen Pfad bereits als „technisch blockiert“ — deckt sich mit vollständig fehlendem Bestand |

---

## 5. Technische Kandidaten (13) — nur Existenzprüfung im Repository

Vollständige Tabelle: `bestandsmatrix.csv` (Zeilen 16–28, Typ „Kandidat“).

| Nr | Kandidat | Im Repository vorhanden? |
|---|---|---|
| 1 | BMF getrennte Themenfeeds | Nein |
| 2 | BMF Subventionsberichte | Nein |
| 3 | BMF Beteiligungsberichte | Nein |
| 4 | Bundesrechnungshof Presse (eigener Weg) | Nein (nur der bestehende, sozial-gefilterte BRH-Weg aus Nr. 7) |
| 5 | Europäische Kommission Deutschland Fiskaldokumente | Nein (nur generische EU-Klassifikation, kein Retrieval Path) |
| 6 | Eurostat Government Finance Statistics | Nein |
| 7 | ECOFIN und Rat | Nein |
| 8 | Deutsche Bundesbank Öffentliche Finanzen | Nein |
| 9 | Berlin Zuwendungsdatenbank | Nein |
| 10 | Berlin Beteiligungs- und Vermögensberichte | Nein |
| 11 | Brandenburg kommunale Finanzen | Nein (nur zufälliger Test-Fixture-Text, keine reale Quelle) |
| 12 | Brandenburg Beteiligungs- und Vermögensberichte | Nein |
| 13 | Optionale Interessenbalance | **Teilweise wiederverwendbare Basis vorhanden** — DGB/ver.di und BDI/BDA sind bereits als Publisher + Google-News-Wege vorhanden (aktuell sozialpolitisch gebunden); „Bund der Steuerzahler“ und „Deutscher Städtetag“/„Deutscher Landkreistag“ existieren nicht |

Von 13 Kandidaten existiert **keiner** als dediziert für diesen Zweck angelegter Retrieval Path; bei Kandidat 13 existiert für 2 der 4 Interessenperspektiven bereits wiederverwendbare Publisher-Infrastruktur aus dem bestehenden Sozialpolitik-Fachpaket.

---

## 6. Übergreifende Beobachtungen

**6.1 Strukturmuster der „teilweise vorhanden“-Fälle.** Alle sechs teilweise vorhandenen Pflichtpfade (Nr. 1, 7, 9, 12, 14 sowie mit Einschränkung Nr. 2) folgen demselben Muster: Der **Publisher** ist bereits sauber im Datenmodell verankert, der vorhandene **Retrieval Path** ist aber entweder (a) auf ein fremdes Thema (Sozialpolitik) statt auf Finanzen/Haushalt/Steuern gefiltert, oder (b) strukturell vorbereitet, aber technisch inaktiv (Berlin/Brandenburg-Landesmodul). In keinem der 15 Pflichtpfade existiert heute ein Weg, der ohne Änderung sofort die geforderte Rolle erfüllt.

**6.2 Beleg aus der bestehenden Testsuite.** `scripts/saas-foundation-test.js:278-279` testet bereits explizit ein synthetisches Profil mit Ausschuss „Haushaltsausschuss“, Partei „FDP“, Ministerium „BMF“ und Themen „Bundeshaushalt/Schuldenbremse/Steuern“ — das Ergebnis ist laut Test bewusst **0 thematische Fachquellen** (`!hasAnySocial(haushalt)`). Das bestätigt unabhängig vom Übergabepaket, dass ein Haushalts-/Finanzpolitik-Mandat im heutigen Stand ausschließlich die neutrale Bund-Basis erhält (u. a. `committee-finanzen`, `committee-haushalt`, DIP) und keine fachliche Tiefe.

**6.3 Dubletten-Risiken.** Die größten Überschneidungsrisiken für Sprint 2:
- `committee-finanzen` und `committee-haushalt` (`lib/helmut/sources.js:488-489`) sind bereits **aktive, neutrale** Bund-Basis-Wege mit den Suchbegriffen „Finanzpolitik/Finanzminister/Steuer/Schuldenbremse/Steuerreform“ bzw. „Bundeshaushalt/Haushaltsausschuss/Etat/Sparhaushalt“. Ein neuer, ähnlich geschnittener Google-News-Weg im Fachpaket würde gegen die No-Go-Regel 3 („Keine doppelte Zuordnung allgemeiner Basispfade“) verstoßen.
- DIP (`rp-dip`) ist bereits der generische, aktive Weg für alle Gesetzesvorhaben — eine BMF-spezifische Neuanlage muss sich davon klar abgrenzen (Wiederverwendung statt Parallelweg, wie in der Fachentscheidung Block 1 selbst gefordert).
- Die Publisher `publisher-bundesrechnungshof.de` und `publisher-destatis.de` existieren bereits mit `trust: hoch` — neue Retrieval Paths für diese Behörden müssen denselben Publisher-Datensatz referenzieren, keinen zweiten Herausgeber anlegen.
- Für Berlin/Brandenburg gilt laut Sprint-9-Dokumentation ausdrücklich „Institutionsfilter statt Mehrfach-Crawl“ — ein SenFin- oder MdFE-eigener Weg müsste als Filter auf dem bereits vorbereiteten Senats-/Ministerien-Sammelfeed geführt werden, nicht als zusätzlicher Parallelabruf.

**6.4 Architektonische Beobachtung zum Kritischen Stop Gate (rein deskriptiv, keine Entscheidung).** Das bestehende Datenmodell (`lib/helmut/quellenarchitektur/seeds/packages.js`, `PACKAGE_DEFINITIONS`) bindet **jedes** `source_package` an genau **eine** `geography_id` und **einen** `political_level` (z. B. `pkg-bund-basis` → `geo-bund`/`bund`; `pkg-berlin-basis` → `geo-land-berlin`/`land`). Ein Fachpaket, das laut Übergabepaket „mit der bestehenden Geography Bindung Bund, Berlin und Brandenburg sauber bedienen“ soll, existiert im heutigen Code in dieser Form noch nicht als Muster — alle heutigen Fachpakete (z. B. `arbeit-und-soziales`) sind ebenenrein auf `geo-bund` geschnitten. Dies ist der zentrale Punkt, den das Übergabepaket selbst als „Kritisches Stop Gate“ vor jeder Paketanlage benennt; dieser Bericht beantwortet die Frage nicht, sondern hält nur den Ist-Befund fest.

**6.5 Interne Konsistenz des Übergabepakets.** Die Zahlen aus `02_ARCHITEKTUR_MASTER.json` (15 Pflichtrollen, 3 wiederverwendete Basispakete, 13 Kandidaten) stimmen mit `05_FINALER_PFLICHTKERN.csv` (15 Zeilen), `06_BASISABDECKUNG_NICHT_DUPLIZIEREN.csv` (3 Zeilen) und `07_KANDIDATEN.csv` (13 Zeilen) überein. **Eine interne Abweichung** wurde festgestellt: `01_KONSOLIDIERTE_FACHENTSCHEIDUNG.md` listet unter „Kandidaten“ nur **8** Einträge (kürzere Vorversion), während die maßgebliche `07_KANDIDATEN.csv` **13** Einträge enthält, die dem Zielbild entsprechen. Für diesen Bericht wurde die 13er-Liste (`07_KANDIDATEN.csv`) als maßgeblich behandelt.

**6.6 Berlin/Brandenburg-Vorarbeit stammt aus fremdem Sprint.** Die einzige bereits vorbereitete Infrastruktur für Berlin/Brandenburg (`seeds/landesmodule-quellen.js`, `seeds/landesmodule-kandidaten.js`, `seeds/landesmodule-verifikation.js`) entstand in Sprint 9/9B eines **anderen, unabhängigen** Auftrags (allgemeine Landesmodul-Pflichtklassen wie Plenum/Ausschüsse/Fraktionen) und enthält **keine** Finanz-/Haushaltsrolle. Sie ist strukturell vollständig, aber technisch inaktiv (`status: prepared` auf Paketebene, `needs_review`/`manual` auf Wegebene, laut Master-Status „hart gesperrt“). Jede Sprint-2-Umsetzung für SenFin/MdFE muss an diese bestehende, noch inaktive Struktur anknüpfen statt sie zu duplizieren.

---

## 7. Abschlussbericht

**1. Wie viele Pflichtpfade sind vollständig vorhanden?**
**0 von 15.** Kein Pflichtpfad wird heute durch einen korrekt skalierten, aktiven, rollenreinen Retrieval Path abgedeckt.

**2. Wie viele sind teilweise vorhanden?**
**6 von 15:** Nr. 1 (BMF finanzpolitischer Signalstrom), Nr. 2 (BMF Gesetze und Gesetzesvorhaben, über DIP), Nr. 7 (Bundesrechnungshof Berichte), Nr. 9 (Destatis Öffentliche Finanzen und Steuern), Nr. 12 (SenFin Berlin Signalstrom, über vorbereiteten Landesmodul-Kandidaten), Nr. 14 (MdFE Brandenburg Signalstrom, über vorbereiteten Landesmodul-Kandidaten).

**3. Wie viele fehlen vollständig?**
**9 von 15:** Nr. 3 (BMF Monatsbericht), Nr. 4 (BMF Open Data), Nr. 5 (Bundeshaushalt Datenportal), Nr. 6 (Arbeitskreis Steuerschätzungen), Nr. 8 (Stabilitätsrat), Nr. 10 (BFH Entscheidungen), Nr. 11 (BFH Presse), Nr. 13 (SenFin Haushaltsdaten/Open Data), Nr. 15 (MdFE Haushalts- und Finanzdokumentenindex).

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
Empfehlung mit Begründung (Entscheidung bleibt Sprint 2 vorbehalten):
1. **Nr. 1 — BMF finanzpolitischer Signalstrom.** Größter fachlicher Hebel für Block 1, offizielle Fundstelle (RSS-Übersichts-URL) bereits in der Fachentscheidung dokumentiert → schnellste, günstigste erste Validierung.
2. **Nr. 5 — Bundeshaushalt Datenportal und Downloads.** Laut Zielbild der „kanonische“ Datenanker des gesamten Pakets, im Repository aber ohne jeden Anknüpfungspunkt (höchste technische Unsicherheit: Format, Datensatzinventar, Stabilität unbekannt) — sollte früh geprüft werden, um Formatrisiken rechtzeitig zu erkennen.
3. **Nr. 15 — MdFE Brandenburg Haushalts- und Finanzdokumentenindex.** Einziger Pflichtpfad, den die Fachentscheidung selbst bereits als „technisch blockiert“ kennzeichnet — ohne frühe Klärung bleibt die gesamte Brandenburger Vertikaltiefe (Block 4) offen.

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
Ja, in mehrfacher Hinsicht:
- **Architektonisch:** Das bestehende Datenmodell bindet jedes Source Package an genau eine Geography/einen political_level; ein ebenenübergreifendes Fachpaket (Bund+Berlin+Brandenburg) existiert in dieser Form noch nirgends im Code — exakt die Frage, die das Übergabepaket selbst als „Kritisches Stop Gate“ offen lässt (Abschnitt 6.4).
- **Strukturell:** Berlin/Brandenburg sind nicht „unbeschriebenes Blatt“, sondern tragen bereits vorbereitete (inaktive) Infrastruktur aus einem fremden, unabhängigen Sprint (9/9B), die keine Finanzrolle kennt und mit der ein neues Fachpaket abgestimmt werden muss (Abschnitt 6.6).
- **Intern im Paket selbst:** `01_KONSOLIDIERTE_FACHENTSCHEIDUNG.md` (8 Kandidaten) und `07_KANDIDATEN.csv` (13 Kandidaten) widersprechen sich; Letztere wurde als maßgeblich behandelt (Abschnitt 6.5).
- **Namensgebung:** Zwei der sieben angeforderten Dateinamen entsprechen nicht den tatsächlichen Namen/Pfaden im Paket (Abschnitt 1).
- Kein Widerspruch besteht dagegen bei den Kernzahlen (15 Pflichtrollen, 3 Basispakete, 13 Kandidaten) und beim No-Google-News-Grundsatz — diese sind im Paket in sich konsistent.

**6. Welche Dateien wurden verändert?**
**Ausschließlich zwei neue Dateien angelegt, keine bestehende Datei verändert, gelöscht oder verschoben:**
- `docs/quellen/haushalt-finanzen-steuern/bestandsabgleich.md` (dieser Bericht, neu)
- `docs/quellen/haushalt-finanzen-steuern/bestandsmatrix.csv` (neu)

---

**Sprint 1 ist hiermit abgeschlossen. Es wurden keine Live-Tests durchgeführt und keine Sprint-2-Tätigkeiten (Aktivierung, Migration, Parser-/Retrieval-Path-Anlage, Seed-Änderung) begonnen.**
