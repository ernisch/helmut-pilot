# Bestandsabgleich — Source Package `wirtschaft-industrie-mittelstand`

**Sprint:** 1 (ausschließlich Bestandsabgleich, rein lesend) · **Stand `main`:** `035898b` (2026-07-22) ·
**Datum dieses Abgleichs:** 2026-07-24 · **Branch:** `claude/helmut-wirtschaft-bestandsabgleich-ql0eaq`

**Quellpaket:** `Helmut_wirtschaft_industrie_mittelstand_Master_Uebergabe.zip` (hochgeladen, außerhalb des
Repositories entpackt, NICHT Teil dieses Commits)

## 0. Methodik und Geltungsbereich

Dieser Bericht vergleicht die im Quellpaket definierten 14 Pflichtpfade und 17 technischen
Kandidaten ausschließlich gegen den **Code- und Konfigurationsstand von `main`** — also gegen
`supabase/migrations/20260713_source_architecture.sql` (Schema), `supabase/seeds/*.sql` und die
äquivalenten JS-Seeds unter `lib/helmut/quellenarchitektur/seeds/*.js` (Publishers, Retrieval
Paths, Source Packages), `lib/helmut/sources.js` (Alt-Katalog) und `lib/helmut/sourceSafety.js`
(Domain-Vertrauensregister). **Nicht** geprüft wurde der Live-Zustand der Produktions-Datenbank
(Supabase) — laut Auftrag ausdrücklich kein Live-Abruf, keine Webseiten, keine Quell-, Parser-
oder Retrieval-Path-Implementierung, keine Seed-/Aktivierungs-Änderung. Alle Aussagen zu
„aktiv"/„inaktiv" beziehen sich auf den in `main` versionierten Soll-Zustand (`status`/
`activation_mode`/Paket-`status`), nicht auf einen live abgefragten Ist-Zustand der Datenbank.

Gelesen wurden vor Beginn der Analyse (in der vorgegebenen Reihenfolge): `CLAUDE_CODE_START_HIER.md`,
`00_MASTER/01_KONSOLIDIERTE_FACHENTSCHEIDUNG.md`, `00_MASTER/02_ARCHITEKTUR_MASTER.json`,
`00_MASTER/04_NO_GO_REGELN.md`, `00_MASTER/05_FINALER_PFLICHTKERN.csv`, sowie zusätzlich die
tatsächlich im Paket vorhandenen Dateien `00_MASTER/06_BASIS_UND_FACHGRENZEN.csv` und
`00_MASTER/07_KANDIDATEN.csv` (siehe Hinweis unter Frage 5 zur Namensabweichung), außerdem alle
fünf Einzelblock-Ordner (`01_fachliche_entscheidung.md`, `02_pflichtrollen.csv` bzw.
`02_kandidaten.csv`, `03_bewusste_ausschluesse.csv` in Block 5).

**Nicht durchgeführt** (wie beauftragt): Live-Abrufe, Webseiten-Öffnungen, Quellimplementierung,
Parser-Erstellung, Anlage von Retrieval Paths, Seed-Änderungen, Aktivierung, Migration, Deployment,
Löschung oder Änderung bestehender Quellen.

## 1. Zusammenfassung

| Kennzahl | Wert |
|---|---|
| Pflichtpfade gesamt | 14 |
| … vollständig vorhanden | **0** |
| … teilweise vorhanden | **3** (#4 Destatis, #11 Berlin, #13 Brandenburg) |
| … fehlen vollständig | **11** |
| Technische Kandidaten gesamt | 17 |
| … davon mit vorhandenem Publisher (ganz oder teilweise) | **1** von 17 (`DIHK/ZDH/BDI/DGB` — 3 der 4 genannten Verbände) |
| … thematisch angrenzende, aber falsche Konzepte im Repo vorhanden | 1 (`Tourismus als eigener Statistikweg` → nur Bundestagsausschuss-Google-News-Weg) |
| Bestehendes Source Package `wirtschaft-industrie-(und-)mittelstand` | **existiert nicht** — Slug ist frei |
| `HELMUT_SOURCE_MODE` (main, `helmut-flags.json`) | `on` — relationale DB ist aktive Quellenwahrheit, Alt-Katalog ist Fallback |

Kein einziger Pflichtpfad ist heute vollständig abgedeckt. Der Ausgangspunkt für dieses Fachpaket
ist damit nahezu komplettes Neuland — mit drei nutzbaren Anknüpfungspunkten (Destatis-Publisher,
sowie je ein genereller, aber inaktiver und fachlich unspezifischer Landesweg für Berlin und
Brandenburg).

## 2. Pflichtpfade — Detailbefund

Für die vollständige Matrix mit allen zehn geforderten Dimensionen siehe
[`bestandsmatrix.csv`](./bestandsmatrix.csv) (Zeilen 1–14 = Pflichtpfade, Zeilen 15–31 = technische
Kandidaten). Zusammenfassung je Block:

### Block 1 — Bund, Ressort und Statistik (5 Pflichtpfade)

| # | Rolle | Status | Kernbefund |
|---|---|---|---|
| 1 | Bundeswirtschaftsressort — Aktueller Fachsignalstrom | fehlt vollständig | Kein Publisher, kein Weg. `bmwk.de` ist in `sourceSafety.js` als vertrauenswürdige Domain vorregistriert. |
| 2 | Bundeswirtschaftsressort — Gesetze und Vorhaben | fehlt vollständig | Gleicher fehlender Herausgeber wie #1. |
| 3 | Bundeswirtschaftsressort — Monatsanalysen/Jahreswirtschaftsbericht | fehlt vollständig | Gleicher fehlender Herausgeber wie #1. |
| 4 | Destatis — Kuratiertes Wirtschaftsdatenset | **teilweise vorhanden** | Publisher `publisher-destatis.de` existiert (trust=hoch, data_source), aber der einzige bestehende Weg (`rp-news-destatis-soziales`) ist eine themenfremde Google-News-Suche im Paket `arbeit-und-soziales`. Für die GENESIS-Datenbank existiert kein Parser. |
| 5 | Sachverständigenrat Wirtschaft — Gutachten und Prognosen | fehlt vollständig | Keine Spur im Repository. |

### Block 2 — Wettbewerb, Außenwirtschaft, Mittelstand (5 Pflichtpfade)

Alle fünf Pfade (Bundeskartellamt Entscheidungen, Bundeskartellamt Presse, BAFA, KfW Research,
Monopolkommission) **fehlen vollständig**: kein Publisher, kein Retrieval Path, keine Erwähnung in
`sourceSafety.js`, keine Entität. Bundeskartellamt-Entscheidungen und -Presse teilen sich einen
künftigen Herausgeber (aktuell keiner von beiden vorhanden).

### Block 3 — Berlin (2 Pflichtpfade)

| # | Rolle | Status | Kernbefund |
|---|---|---|---|
| 11 | Berliner Wirtschaftsverwaltung — Fachlicher Signalstrom | **teilweise vorhanden** | Nur der generische, vorbereitete `publisher-berlin.de` + der generische, technisch **inaktive** Weg `rp-be-landesregierung` (`status=needs_review`, `activation_mode=manual`, Paket `berlin-basis` selbst `status=prepared`) — deckt Senat *pauschal* ab, nicht die Wirtschaftsverwaltung spezifisch. |
| 12 | Amt für Statistik Berlin Brandenburg — Berliner Wirtschaftsdaten | fehlt vollständig | Kein Publisher; nur die typisierte Entität `statoffice-berlin-brandenburg` existiert als Anker. **Identisch mit Pfad 14** (siehe Frage 6). |

### Block 4 — Brandenburg (2 Pflichtpfade)

| # | Rolle | Status | Kernbefund |
|---|---|---|---|
| 13 | Brandenburger Wirtschaftsressort — Fachlicher Signalstrom | **teilweise vorhanden** | Nur der generische, vorbereitete `publisher-brandenburg.de` + der generische, technisch **inaktive** Weg `rp-bb-ministerien` (`status=needs_review`, `activation_mode=manual`, Paket `brandenburg-basis` selbst `status=prepared`) — deckt „Ministerium Brandenburg" pauschal ab, nicht MWEKE spezifisch. |
| 14 | Amt für Statistik Berlin Brandenburg — Brandenburger Wirtschaftsdaten | fehlt vollständig | Gleicher Herausgeber wie Pfad 12. **Identisch mit Pfad 12** (siehe Frage 6). |

## 3. Technische Kandidaten — Detailbefund

Geprüft wurde ausschließlich, ob die 17 Kandidaten aus `00_MASTER/07_KANDIDATEN.csv` bereits im
Repository existieren (kein Zehn-Dimensionen-Check wie bei den Pflichtpfaden):

- **14 von 17 fehlen vollständig**: Getrennte Ministeriums-Themenfeeds, Gemeinschaftsdiagnose, BAFA
  Fördervollzug/Open Data, GTAI, KfW Presse, IBB, Berlin Partner, ILB, WFBB, Strukturentwicklung
  Lausitz, Eurostat, EU Kommission Industrie/Binnenmarkt, DG Competition, ifo, ZEW.
- **„Lausitz"** kommt zwar als Zeichenkette im Repository vor — aber nur als Teil des
  Landkreisnamens `geo-kreis-bb-oberspreewald-lausitz` in der Geografie-Hierarchie, nicht als
  Institution „Strukturentwicklung Lausitz". Reiner Zufallstreffer, keine Dublette.
- **„Tourismus als eigener Statistikweg"**: kein Statistikweg vorhanden, aber ein thematisch
  angrenzender `rp-committee-tourismus` (Bundestagsausschuss Tourismus, Google News, Teil von
  `bund-basis`) existiert bereits — ein anderes Konzept (Parlamentsausschuss statt amtlicher
  Statistikweg).
- **„DIHK, ZDH, BDI, DGB"** ist der einzige Kandidat mit überwiegend vorhandener Publisher-Basis:
  ZDH (`publisher-zdh.de` + `rp-news-zdh`), BDI (`publisher-bdi.eu` + `rp-news-bdi`) und DGB
  (`publisher-dgb.de` + `rp-dgb`, Status `broken`) existieren bereits — alle drei aber als Teil des
  Pakets `arbeit-und-soziales` mit sozial-/arbeitspolitischer Themenfilterung, nicht
  industrie-/mittelstandspolitisch. DIHK existiert nicht. Für das neue Fachpaket wären die
  Publisher wiederverwendbar, die Retrieval Paths aber nicht (falscher Themenfilter).

## 4. Abschlussfragen

### 1. Wie viele Pflichtpfade sind vollständig vorhanden?

**0 von 14.**

### 2. Wie viele sind teilweise vorhanden?

**3 von 14:**
- Pfad 4 (Destatis — Kuratiertes Wirtschaftsdatenset): Publisher vorhanden, passender Weg/Parser fehlt.
- Pfad 11 (Berliner Wirtschaftsverwaltung): nur genereller, inaktiver, fachlich unspezifischer Landesweg vorhanden.
- Pfad 13 (Brandenburger Wirtschaftsressort): nur genereller, inaktiver, fachlich unspezifischer Landesweg vorhanden.

### 3. Wie viele fehlen vollständig?

**11 von 14:** Pfade 1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 14.

### 4. Welche drei Pfade sollten zuerst technisch validiert werden?

1. **Destatis — Kuratiertes Wirtschaftsdatenset (#4).** Einziger Pflichtpfad mit bereits
   vorhandenem, hoch vertrauenswürdigem Publisher-Datensatz — die größte offene technische Frage
   (Zugriffsmethode auf die GENESIS-Datenbank; im Repository existiert bislang kein API-/
   Tabellen-Parser, nur RSS/HTML/Google-News/PARDOK-XML) lässt sich hier am schnellsten klären und
   entscheidet mit, ob überhaupt ein neuer `retrieval_paths.method`/Parser-Typ nötig wird. Die
   fachliche Entscheidung selbst nennt Destatis als „amtlichen Datenanker" — höchste Priorität laut
   Paket-Neutralitätsprinzip („amtliche Statistik und Vollzugsquellen vor Interessen und
   Standortkommunikation").
2. **Bundeswirtschaftsministerium — Aktueller Fachsignalstrom (#1).** Politischer Primäranker des
   gesamten Bundeskerns; die Klärung von aktuellem Ressortnamen, Alias und Feed-Endpunkt betrifft
   mit hoher Wahrscheinlichkeit auch Pfad #2 (Gesetze/Vorhaben) und #3 (Monatsberichte), da alle
   drei denselben künftigen Herausgeber teilen — eine Validierung hier hat also Hebelwirkung auf
   zwei weitere Pflichtpfade gleichzeitig.
3. **Berliner Wirtschaftsverwaltung (#11) und Brandenburger Wirtschaftsressort (#13) — gemeinsam.**
   Diese zwei Pfade sind die einzigen, an denen sich das im Quellpaket selbst benannte **Kritische
   Stop Gate** (Geography-Bindung Bund/Berlin/Brandenburg, `political_level`, Regionalkuratur,
   profilspezifische Begrenzung) konkret technisch überprüfen lässt — inklusive der realen
   Kollisionsgefahr mit den bereits vorbereiteten, aber inaktiven generischen `berlin-basis`/
   `brandenburg-basis`-Landeswegen (siehe Frage 6). Eine frühe gemeinsame Validierung entscheidet,
   ob das Fachpaket die Zwei-Länder-Struktur sauber bedienen kann, bevor in die übrigen Pfade
   investiert wird.

### 5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?

Ja, in mehreren Punkten — jeweils an der **Schnittstelle zum Repository**, nicht innerhalb der
fachlichen Definition selbst (die Zahlen 14 Pflichtrollen / 17 Kandidaten / Zielkorridor 14–20
Retrieval Paths sind über alle Master- und Blockdateien hinweg konsistent):

- **Slug-/Namensabweichung.** `00_MASTER/02_ARCHITEKTUR_MASTER.json` definiert den Slug
  `wirtschaft-industrie-und-mittelstand` (mit „und"); der Arbeitsauftrag und der Zielordner dieses
  Berichts (`docs/quellen/wirtschaft-industrie-mittelstand`) verwenden die Schreibweise **ohne**
  „und". Beide Varianten sind aktuell als `source_packages.key` frei (keine existiert in
  `lib/helmut/quellenarchitektur/seeds/packages.js`), die Inkonsistenz sollte aber vor einer
  Paketanlage (Sprint 2+) verbindlich aufgelöst werden — Slug-Freiheit ist laut
  `CLAUDE_CODE_START_HIER.md` selbst die erste Stop-Gate-Frage.
- **Referenzierte Fachgrenze zu einem nicht existierenden Paket.**
  `00_MASTER/06_BASIS_UND_FACHGRENZEN.csv` und Block 5 verlangen eine fachliche Abgrenzung zu
  `haushalt-finanzen-und-steuern`. Dieses Source Package **existiert auf `main` nicht** — weder in
  den SQL-Seeds noch in `packages.js`. Aktuell existieren nur `bund-basis`, `arbeit-und-soziales`,
  `die-linke-bund`, `regional-niedersachsen` (alle `status=active`) sowie `berlin-basis` und
  `brandenburg-basis` (beide `status=prepared`). Die Abgrenzung zu `arbeit-und-soziales`,
  `bund-basis`, `berlin-basis` und `brandenburg-basis` ist real prüfbar; die zu
  `haushalt-finanzen-und-steuern` bislang nicht, da ihr Gegenstück fehlt.
- **Datei-Namensschema des Quellpakets weicht vom Arbeitsauftrag ab.** Angefordert wurden
  `06_technische_kandidaten.csv` und `07_bewusste_ausschluesse.csv`; tatsächlich enthält
  `00_MASTER` `06_BASIS_UND_FACHGRENZEN.csv` und `07_KANDIDATEN.csv`. Eine
  `bewusste_ausschluesse.csv` existiert nur auf Block-5-Ebene (EU/Interessen/Google-News), nicht
  im Master-Ordner. Rein redaktionell, aber für künftige Pakete zu vereinheitlichen.
- **Begriffliche Nähe „Wirtschaft" auf Parlaments- statt Ministeriumsebene.** Der bestehende
  `rp-committee-wirtschaft` (Bundestagsausschuss Wirtschaft und Energie, Teil von `bund-basis`) ist
  thematisch verwandt, aber institutionell ein anderer Akteur als die im neuen Paket geforderten
  BMWK-Ministeriumswege. Die fachliche Definition unterscheidet diese Ebenen nicht explizit — siehe
  auch Frage 6.

### 6. Gibt es auch hier einen Konflikt durch mehrere Ebenen oder Geografien?

**Ja, konkret und mehrfach belegt:**

1. **Identische Quelle für zwei Geografie-Rollen.** Die Pflichtpfade #12 (Berliner
   Wirtschaftsdaten) und #14 (Brandenburger Wirtschaftsdaten) nennen denselben Herausgeber und
   dieselbe Fundstelle (`statistik-berlin-brandenburg.de/presse/`) für zwei getrennte
   Landes-Rollen. Genau dieses Muster musste im Repository bereits einmal gelöst werden: der
   bestehende `rbb24.de`-Weg im Landesmodul-Seed ist **ein** Abrufweg mit **zwei**
   Paketreferenzen (`berlin-basis` und `brandenburg-basis`), nicht zwei getrennte Wege (siehe
   `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js`, `DEDUP_HINWEISE`). Ohne
   bewusste Anwendung desselben Musters entstünde für das Amt für Statistik Berlin-Brandenburg ein
   doppelt angelegter, doppelt gecrawlter Weg für dieselbe Quelle.
2. **Drei Ebenen um denselben Begriff „Wirtschaft".** (i) Bundestags-Fachausschuss „Wirtschaft und
   Energie" (Parlamentsebene, bereits als `rp-committee-wirtschaft` in `bund-basis` vorhanden),
   (ii) Bundeswirtschaftsministerium (Exekutivebene, im neuen Paket gefordert, im Repository nicht
   vorhanden), (iii) Landeswirtschaftsressorts Berlin/Brandenburg (Landesebene, im neuen Paket
   gefordert, nur generisch/inaktiv vorbereitet). Diese drei Ebenen sind fachlich benachbart, aber
   institutionell getrennt; die neue fachliche Definition schärft diese Trennung nicht explizit,
   was bei der technischen Umsetzung Verwechslungs- und Dublettenrisiko birgt.
3. **Spannung Landesbasispaket vs. künftiges Fachpaket.** Die generischen, aber technisch
   inaktiven `landesregierung`/`ministerien`-Sammelwege in `berlin-basis`/`brandenburg-basis`
   (beide `status=prepared`) würden — sobald sie aktiviert werden — denselben Publisher
   (`berlin.de`/`brandenburg.de`) crawlen wie ein künftiger fachspezifischer
   Wirtschaftsressort-Weg. Das ist exakt die im Auftrag benannte Sorge „keine doppelten
   Basispfade" (No-Go-Regel 3) und bestätigt, dass die in `CLAUDE_CODE_START_HIER.md` selbst als
   kritisch benannten Stop-Gate-Fragen (Geography-Bindung Bund/Berlin/Brandenburg,
   `political_level`, Regionalkuratur, profilspezifische Begrenzung) real und nicht nur
   hypothetisch sind — der Bestandsabgleich bestätigt den Bedarf, dieses Stop Gate vor einer
   Paketanlage zu klären.

### 7. Welche Dateien wurden verändert?

Ausschließlich die zwei neu angelegten Dateien in diesem Commit:

- `docs/quellen/wirtschaft-industrie-mittelstand/bestandsabgleich.md` (neu)
- `docs/quellen/wirtschaft-industrie-mittelstand/bestandsmatrix.csv` (neu)

Keine bestehende Datei wurde verändert, gelöscht oder verschoben. Es wurden keine Quellen, Seeds,
Migrationen, Parser, Retrieval Paths oder Source Packages angelegt, verändert oder aktiviert.

## 5. Nächste Schritte (nicht Teil dieses Sprints)

Dieser Bericht ist ein reiner Ist-Abgleich. Sprint 2 (technische Live-Validierung einzelner Wege),
Paketanlage, Migration, Aktivierung und Deployment wurden — wie beauftragt — **nicht** begonnen.
