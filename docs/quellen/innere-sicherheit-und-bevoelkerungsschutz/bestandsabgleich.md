# Bestandsabgleich: innere-sicherheit-und-bevoelkerungsschutz (Sprint 1)

**Stand:** 2026-07-24
**Auftrag:** Sprint 1 (Bestandsabgleich) laut Übergabe `Helmut_08_inneres-sicherheit-und-bevoelkerungsschutz_Master_Uebergabe_2026-07-22`
**Branch:** `claude/helmut-bestandsabgleich-sprint-1-4ynda3`, Basis: `main` (HEAD `035898b`)
**Umfang:** ausschließlich Lesevergleich Repository ↔ Source Package. Keine Live-Abrufe, keine Implementierung, keine Aktivierung, keine Migration. Siehe [„Scope-Einhaltung"](#scope-einhaltung) am Ende.

---

## 1. Wichtiger Hinweis zur Paketstruktur (Abweichung vom vorgegebenen Leseplan)

Der im Auftrag vorgegebene Leseplan referenziert Pfade unter `00_MASTER/…` sowie eine Datei
`CLAUDE_CODE_START_HIER.md`. Das tatsächlich hochgeladene und entpackte Paket
`Helmut_08_inneres-sicherheit-und-bevoelkerungsschutz_Master_Uebergabe_2026-07-22` verwendet
jedoch eine **flache, durchnummerierte Struktur ohne `00_MASTER/`-Ordner** — diese Pfade
existieren im Paket nicht (verifiziert per `unzip -l`, 25 Dateien, keine `00_MASTER/*`). Eine
Suche nach den referenzierten Dateinamen (`konsolidierte_fachentscheidung`,
`architektur_master`, `no_go_regeln`, `finaler_pflichtkern`, `technische_kandidaten`,
`bewusste_ausschluesse`, `CLAUDE_CODE_START_HIER`) ergab **auch im Repository** auf `main` keine
Treffer. Es handelt sich damit um eine Abweichung zwischen der (vermutlich generischen,
paketübergreifenden) Auftragsvorlage und dem konkret gelieferten Paket — keine dieser Dateien
wurde nachträglich erzeugt oder ersetzt; stattdessen wurden die inhaltlich entsprechenden,
tatsächlich vorhandenen Dateien gelesen:

| Angeforderter Pfad (Auftrag) | Tatsächlich gelesene Datei (Paket) | Inhaltliche Entsprechung |
|---|---|---|
| `CLAUDE_CODE_START_HIER.md` | `00_START_HIER.md` | Einstiegspunkt, Statusüberblick |
| `00_MASTER/01_konsolidierte_fachentscheidung.md` | `01_EXECUTIVE_SUMMARY.md`, `DRAFT_V2.md` | fachliche Kernentscheidungen |
| `00_MASTER/02_architektur_master.json` | `data/source_package.json` | Architektur-Kontext, Rollen, Geografien |
| `00_MASTER/04_no_go_regeln.md` | `14_CLAUDE_CODE_VALIDIERUNGSAUFTRAG.md` (Abschnitt „Nicht tun") + `10_BEWUSSTE_AUSSCHLUESSE.csv` | Verbote / bewusste Ausschlüsse |
| `00_MASTER/05_finaler_pflichtkern.csv` | `03_FINALER_PFLICHTKERN.csv` | die 19 Pflichtpfade (Grundlage dieses Abgleichs) |
| `00_MASTER/06_technische_kandidaten.csv` | `05_RETRIEVAL_PATH_KANDIDATEN.csv` | Retrieval-Path-Kandidaten je Publisher (21 Zeilen) |
| `00_MASTER/07_bewusste_ausschluesse.csv` | `10_BEWUSSTE_AUSSCHLUESSE.csv` | identisch |

Zusätzlich vollständig gelesen: `02_SCOPE_UND_ABGRENZUNG.md`, `04_QUELLENBEWERTUNG.csv`,
`06_EBENENMATRIX.csv`, `07_REDUNDANZ_UND_WIEDERVERWENDUNG.csv`, `08_TECHNISCHE_VORPRUEFUNG.csv`,
`09_GOOGLE_NEWS_ABLOESE.md`, `11_AUDIT_FINAL.md`, `12_ENTSCHEIDUNGSLOG.md`,
`13_QUELLENVERZEICHNIS.md`, `15_FINAL_REPORT.md`, `MANIFEST.json`, `audit/AUDIT_FINAL.md`,
`audit/AUDIT_PRUEFKATALOG.md`, `audit/AUDIT_V1.md`, `data/retrieval_paths.json`. Damit wurde das
Paket vollständig gelesen; nur die Ordnerbezeichnung/Dateinamen weichen vom Auftragstext ab, nicht
der fachliche Inhalt.

## 2. Datengrundlage im Repository (`main`)

Reiner Lesevergleich, keine Live-DB-Abfrage (Sprint-1-Scope). Geprüft wurden die Dateien, die den
Ist-Zustand der Quellenarchitektur auf `main` tragen:

- `supabase/migrations/20260713_source_architecture.sql` — Schema (`publishers`, `retrieval_paths`,
  `source_packages`, `package_paths`, `geographies`, `political_entities`, `path_expected_levels`,
  `path_expected_geographies`), Status-Enums.
- `supabase/seeds/20260713_source_architecture_seed.sql` — Bund-Basisdaten (aktiv).
- `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` — Berlin-/Brandenburg-Landesmodul (prepared/inaktiv).
- `lib/helmut/quellenarchitektur/seeds/packages.js`, `publishers.js`, `landesmodule-kandidaten.js`,
  `landesmodule-quellen.js` — die Quell-Definitionen (Single Source), aus denen die SQL-Seeds generiert werden.
- `lib/helmut/quellenarchitektur/source-mode.js`, `catalog.js`, `pardok-parser.js`, `pardok-dispatch.js` — Aktivierungslogik, Parser, hartes BE/BB-Gate.
- `lib/helmut/sources.js` — hartkodierter Alt-Katalog (heute **Fallback**, nicht mehr aktive Quellenwahrheit).
- `lib/helmut/sourceSafety.js` — Domain-Vertrauensregister (`OFFICIAL_DOMAINS` u.a.).
- `lib/helmut/lage.js`, `lib/helmut/crawler.js` — PDF-Erkennung/-Behandlung im Lesepfad.
- `helmut-flags.json`, `docs/quellenarchitektur/00-master-status.md`, `docs/quellenarchitektur/00-ist-architektur-und-abweichungen.md` — Betriebsstatus.
- `docs/quellenarchitektur/*` (alle 40 Dateien, stichprobenartig/volltextdurchsucht auf „Polizei",
  „Verfassungsschutz", „BKA", „Katastrophenschutz", „Zivilschutz", „innere Sicherheit") — kein
  Treffer außer einer beiläufigen Erwähnung „Polizei-/Feuerwehr-Zulagen" in einer Radar-Diagnose
  (`23-radar-partei-reiter-diagnose.md:23`, ein einzelner realer Vorgang, keine Paket-/Quellenarbeit).

**Zentraler Befund vorab:** `HELMUT_SOURCE_MODE=on` (`helmut-flags.json:6`) — die relationale DB
(publishers/retrieval_paths/source_packages/package_paths) ist die **aktive Quellenwahrheit**,
der hartkodierte `sources.js`-Katalog ist nur noch Fallback. Beide Ebenen wurden geprüft; keine
der 19 Pflichtquellen taucht in einer von beiden auf.

## 3. Definitionen der Bewertungsdimensionen

- **vollständig vorhanden**: dedizierter `publisher`-Datensatz **und** dedizierter, dem
  Pflichtpfad entsprechender `retrieval_path` existieren.
- **teilweise vorhanden**: kein dedizierter Pfad, aber mindestens eines von: (a) die Domain ist
  bereits im Vertrauens-/Kategorisierungsregister bekannt (`sourceSafety.js`), (b) ein bestehender,
  aktiver **oder** inaktiver Pfad deckt dieselbe Institution/Ebene thematisch an (z. B. generische
  Landesregierungs- oder Ministerien-Sammelsuche), (c) die Institution existiert als
  `political_entity` (Erwähnungs-/Verknüpfungsebene). Eine bloße **Domain-String-Kollision** ohne
  inhaltlichen Bezug (s. Abschnitt 5.2) zählt **nicht** als „teilweise vorhanden", sondern wird
  unter „mögliche Dubletten" geführt.
- **fehlt vollständig**: keines der obigen Kriterien trifft zu.
- **aktiver/inaktiver Status**: bezieht sich auf `retrieval_paths.status` /
  `retrieval_paths.activation_mode` sowie den übergeordneten `source_packages.status`
  (`draft/prepared/active/paused/archived`). Berlin/Brandenburg tragen zusätzlich ein hartes,
  vom Paketstatus unabhängiges Ausschluss-Gate (`source-mode.js:22`, `pardok-dispatch.js:112`).

## 4. Ergebnis je Pflichtpfad — Zusammenfassung

Die vollständige, pfadgenaue Bewertung (alle 10 geforderten Dimensionen je Pflichtpfad, inkl.
Fundstellen) steht in [`bestandsmatrix.csv`](./bestandsmatrix.csv) (19 Zeilen, 17 Spalten). Kurzfassung:

| Ebene | Pflichtpfade | vollständig | teilweise | fehlt |
|---|---|---|---|---|
| Bund | 8 (BMI, BKA, BfV, BSI, BBK, Bundespolizei, BAMF, BfDI) | 0 | 4 (BMI, BSI, BBK, BfDI) | 4 (BKA, BfV, Bundespolizei, BAMF) |
| Berlin | 6 (SenInn, Polizei, Verfassungsschutz, Feuerwehr, BlnBDI, LEA) | 0 | 1 (SenInn) | 5 |
| Brandenburg | 5 (MIK, Polizei, Verfassungsschutz, KatS, LDA) | 0 | 1 (MIK) | 4 |
| **Gesamt** | **19** | **0** | **6** | **13** |

Die sechs „teilweise vorhanden"-Fälle beruhen **ausnahmslos auf generischer, nicht
institutionsspezifischer Infrastruktur** (Domain-Vertrauensregel oder thematisch weite
Sammelsuche), nicht auf einer echten Teilimplementierung der jeweiligen Behörde. Keine der 19
Pflichtquellen hat einen eigenen `retrieval_path`.

## 5. Zentrale strukturelle Befunde

### 5.1 Kein bestehendes Source Package für dieses Politikfeld

Es existiert kein `source_packages`-Eintrag für „innere Sicherheit"/„Bevölkerungsschutz". Die
einzigen inhaltlich angrenzenden Strukturen sind:
- `pkg-bund-basis` (**aktiv**) — enthält die generische, themenweite Google-News-Sammelquelle
  `committee-inneres` („Ausschuss Inneres und Heimat", `lib/helmut/sources.js:486`, eingebunden
  über `tagSources(bundestagCommitteeSources, { neutral: true })`, `sources.js:569`). Das ist
  **parlamentarische** Berichterstattung über das Themenfeld, keine Behörden-Primärquelle.
- `pkg-berlin-basis` / `pkg-brandenburg-basis` (**Status `prepared`, nicht aktiv**) — die 15
  „Landesmodul-Pflichtklassen" (`lib/helmut/quellenarchitektur/seeds/packages.js:20-25`:
  landesparlament, plenum, ausschuesse, drucksachen, schriftliche_anfragen, gesetzgebung,
  landesregierung, staatskanzlei, ministerien, landesfraktionen, regionale_leitmedien,
  oer_landesberichterstattung, partei_pilot, fraktion_pilot, person_pilot) sind **vollständig auf
  Parlament/Regierungskommunikation/Parteien/Medien zugeschnitten**. Es gibt **keine Klasse** für
  Sicherheitsbehörde, Nachrichtendienst, Polizei, Katastrophenschutz oder Kontrollinstanz
  (Datenschutzaufsicht) — die genau die `core_roles` sind, die das neue Paket selbst definiert
  (`data/source_package.json:11-19`: Ressort, Amtliche Statistik, Polizei, Nachrichtendienst,
  Cyber-Fachbehörde, Bevölkerungsschutz, Aufenthaltsverwaltung, Kontrollinstanz).

Eine Aufnahme dieses Pakets wäre damit **keine reine Datenergänzung** in ein bestehendes Schema,
sondern erfordert eine **konzeptionelle Erweiterung der Pflichtklassen-Taxonomie** je Landesmodul
(oder ein neues, eigenständiges Rollenmodell für Bund-Fachbehörden, das es aktuell ebenfalls nicht
gibt — `pkg-bund-basis.required_classes` ist leer, `{}`).

### 5.2 Publisher-Modell ist domain-, nicht pfadsensitiv → Kollisionsrisiko

Publisher-IDs werden ausschließlich aus der Domain gebildet
(`publisher-${slug(domain)}`, `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js:93`).
Fünf der sechs Berlin-Pflichtquellen liegen jedoch alle unter dem **gleichen** Host `berlin.de`
(nur als Pfad unterschieden: `/sen/inneres/`, `/polizei/…`, `/sen/inneres/verfassungsschutz/`,
`/feuerwehr/`, `/einwanderung/`) — und dieser Host ist bereits als generischer Publisher
`publisher-berlin.de` („Land Berlin — Landespressedienst") belegt
(`supabase/seeds/20260717_landesmodul_be_bb_seed.sql:19`). Nach dem aktuellen Muster würden SenInn,
Polizei Berlin, Verfassungsschutz Berlin, Berliner Feuerwehr und LEA Berlin **alle auf dieselbe
Publisher-ID kollidieren**, obwohl es fachlich fünf unterschiedliche Behörden mit unterschiedlicher
`evidence_role`/`trust` sind. Dasselbe Muster (in kleinerem Umfang) betrifft Brandenburg: MIK
Brandenburg und der Katastrophenschutz-Pfad liegen beide unter `mik.brandenburg.de`. Nur BlnBDI
(`datenschutz-berlin.de`) und die vier Brandenburg-Fachbehörden mit eigener Subdomain
(`polizei.brandenburg.de`, `verfassungsschutz.brandenburg.de`, `lda.brandenburg.de`) sowie alle
acht Bundesbehörden sind domain-eindeutig. Das ist eine **technische Vorfrage**, die vor Anlage
neuer Publisher-Zeilen für Berlin geklärt werden müsste (pfadsensitives Publisher-Modell oder
bewusste Namensraum-Erweiterung) — hier nur dokumentiert, nicht gelöst.

### 5.3 Keine PDF-Volltextverarbeitung im Repository

10 von 19 Pflichtquellen sind laut Quellenpaket selbst `html_pdf`-typisiert (u. a. alle
Verfassungsschutz-, Polizei- und Datenschutzaufsichts-Berichte). Im Repository existiert dazu
**keine Belegstelle für einen ausführenden PDF-Volltext-Parser**:
- `lib/helmut/lage.js:60-64` erkennt PDFs nur für die Anzeige (`isPdfLike`, Label „PDF" vs. „Web"),
  extrahiert keinen Inhalt.
- `lib/helmut/quellenarchitektur/pardok-parser.js:95-97` wählt nur eine PDF-**URL** aus
  XML-Metadaten aus (PARDOK-Vorgänge), parst kein PDF.
- `lib/helmut/crawler.js:697` schließt `.pdf`-URLs explizit von der Artikel-Auflösung aus.
- Der Parser-Wert `html-scrape` (`catalog.js:170`, `landesmodule-quellen.js:66`) wird nur als
  **Label** in Seed-/Katalogdaten vergeben; eine Codestelle, die tatsächlich `parser === "html-scrape"`
  auswertet und ausführt, wurde nicht gefunden. Die einzigen zwei realen Datensätze mit diesem
  Parser-Label (`rp-ausschuss-arbeit-soziales`, `rp-dgb`,
  `supabase/seeds/20260713_source_architecture_seed.sql:212,217`) stehen zudem beide auf
  **`status='broken'`**.

Das betrifft technisch auch die neun reinen HTML-Pflichtquellen (BMI, BBK, Bundespolizei, BAMF,
SenInn, Feuerwehr Berlin, LEA Berlin, MIK Brandenburg, KatS Brandenburg) — für sie wäre zumindest
kein PDF-Gate zu lösen, aber die `html-scrape`-Methode selbst ist im Bestand unbewährt (0 von 2
funktionierend).

### 5.4 Berlin/Brandenburg: zusätzliches hartes Aktivierungs-Gate

Unabhängig vom Paketstatus `prepared` gilt für Berlin/Brandenburg ein separates, hartes Gate:
„Berlin/Brandenburg bleiben VOLLSTÄNDIG ausgeschlossen (hartes Gate …)"
(`lib/helmut/quellenarchitektur/source-mode.js:22`); `pardok-dispatch.js:112`: „0 Items in die
sichtbare Pipeline. BE/BB erreicht NIE Lage/Radar/Helmut/Büro." Jede künftige Aktivierung der
11 Berlin-/Brandenburg-Pflichtquellen hängt damit an **derselben** übergeordneten, bereits anderswo
anstehenden BE/BB-Freigabeentscheidung — nicht an einer eigenständigen Entscheidung für dieses
Fachpaket.

## 6. Technische Kandidaten (`05_RETRIEVAL_PATH_KANDIDATEN.csv`) — reine Existenzprüfung

Auftrag: „Prüfe zusätzlich die technischen Kandidaten ausschließlich darauf, ob sie bereits im
Repository existieren." Die Kandidatenliste enthält 21 URL-Zeilen (feinere Ebene als die 19
Pflichtquellen — BMI und BKA je 2×, MIK Brandenburg 2×). Ergebnis der Domain-/URL-Suche über das
gesamte Repository (`main`, Volltext, keine Live-Abfrage):

| # | Publisher | URL-Kandidat (Kurzform) | Existiert im Repository? |
|---|---|---|---|
| 1 | BMI | `.../themen/sicherheit/sicherheit-artikel.html` | Nein (Domain nur in Vertrauensliste, kein Pfad) |
| 2 | BMI | `.../themen/bevoelkerungsschutz/…` | Nein |
| 3 | BKA | PKS-Pfad | Nein |
| 4 | BKA | PMK-Pfad | Nein |
| 5 | BfV | Publikationen-Pfad | Nein |
| 6 | BSI | Lagebericht-Pfad | Nein (Domain nur in Vertrauensliste, kein Pfad) |
| 7 | BBK | KRITIS-Pfad | Nein (Domain nur in Vertrauensliste, kein Pfad) |
| 8 | Bundespolizei | Aufgaben-Pfad | Nein |
| 9 | BAMF | Asylzahlen-Pfad | Nein |
| 10 | BfDI | Tätigkeitsberichte-Pfad | Nein (Domain nur in Vertrauensliste, kein Pfad) |
| 11 | SenInn Berlin | Ressortseite | Nein (nur generischer, inaktiver berlin.de-Sammelpfad) |
| 12 | Polizei Berlin | PKS-Berlin-Pfad | Nein |
| 13 | Verfassungsschutz Berlin | Berichte-Pfad | Nein |
| 14 | Berliner Feuerwehr | Feuerwehr-Pfad | Nein |
| 15 | BlnBDI | Jahresberichte-Pfad | Nein |
| 16 | LEA Berlin | Einwanderung-Pfad | Nein |
| 17 | MIK Brandenburg | Innere-Sicherheit-Pfad | Nein (nur generischer, inaktiver Ministerien-Sammelpfad) |
| 18 | Polizei Brandenburg | Kriminalitätsstatistik-Pfad | Nein |
| 19 | Verfassungsschutz Brandenburg | Verfassungsschutz-Pfad | Nein |
| 20 | MIK Brandenburg | Brand-/Katastrophenschutz-Pfad | Nein |
| 21 | LDA Brandenburg | Tätigkeitsberichte-Pfad | Nein |

**Ergebnis: 0 von 21 technischen Kandidaten existieren als `retrieval_path` im Repository.** Vier
Kandidaten (6, 7, 10 sowie implizit 1/2 über die BMI-Domain) profitieren von der generischen
`*.bund.de`-Vertrauensregel in `sourceSafety.js`, was aber keine Pfad-Existenz ist, sondern nur
eine spätere Kategorisierungserleichterung, falls ein Pfad angelegt würde.

## 7. Abschlussbericht

**1. Wie viele Pflichtpfade sind vollständig vorhanden?**
**0 von 19.** Kein einziger der 19 Pflichtpfade hat einen dedizierten `publisher`- und
`retrieval_path`-Datensatz im Repository.

**2. Wie viele sind teilweise vorhanden?**
**6 von 19**: BMI, BSI, BBK, BfDI (Bund — Domain bereits vertrauensklassifiziert bzw. thematisch
über den aktiven „Ausschuss Inneres und Heimat"-Google-News-Pfad angrenzend), SenInn Berlin
(generischer, inaktiver Landesregierungs-/Staatskanzlei-Pfad) und MIK Brandenburg (generischer,
inaktiver Ministerien-Sammelpfad). Alle sechs beruhen auf generischer, nicht
institutionsspezifischer Infrastruktur — keiner hat einen eigenen Abrufweg.

**3. Wie viele fehlen vollständig?**
**13 von 19**: BKA, BfV, Bundespolizei, BAMF (Bund); Polizei Berlin, Verfassungsschutz Berlin,
Berliner Feuerwehr, BlnBDI, LEA Berlin (Berlin); Polizei Brandenburg, Verfassungsschutz
Brandenburg, Katastrophenschutz Brandenburg, LDA Brandenburg (Brandenburg). Für diese existiert
keinerlei Spur (weder Publisher noch Pfad noch Vertrauenseintrag noch Entität).

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
Empfehlung, nach den Kriterien (a) kein PDF-Abhängigkeit (HTML-only, umgeht den in §5.3
dokumentierten fehlenden PDF-Parser), (b) bereits vorhandene, wenn auch schwache
Infrastruktur-Berührung, (c) hoher Pflichtkern-Rang laut `04_QUELLENBEWERTUNG.csv` (Must-have,
Vertrauen hoch):
1. **BMI** (`bmi.bund.de`) — einzige Bundesquelle mit doppeltem Bestandsbezug (explizite
   Vertrauenseinstufung **und** aktiver thematischer Google-News-Pfad), HTML-only, Ressort-Anker
   der gesamten Behördenkette.
2. **BBK** (`bbk.bund.de`) — HTML-only, trägt den Namensbestandteil „Bevölkerungsschutz" des
   Pakettitels direkt, bereits über die `bund.de`-Regel vertrauensklassifiziert, keine
   Bund-Quelle deckt dieses Themenfeld bisher auch nur ansatzweise ab.
3. **SenInn Berlin** (`berlin.de/sen/inneres`) — sollte **vor** allen anderen Berlin-Quellen
   geprüft werden, weil an ihr das in §5.2 dokumentierte Publisher-Kollisionsproblem (fünf
   Berliner Behörden teilen sich `berlin.de`) exemplarisch geklärt werden muss, bevor Polizei
   Berlin, Verfassungsschutz Berlin, Feuerwehr Berlin oder LEA Berlin sinnvoll angelegt werden
   können. (Technisch ebenbürtige Alternative ohne dieses Kollisionsproblem: **MIK Brandenburg**,
   eigene Subdomain, ebenfalls bereits thematisch als „Ministerium Brandenburg" grob angrenzend.)

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
Ja, in zwei Dimensionen:
- **Strukturell**: Das neue Paket definiert acht `core_roles`
  (`data/source_package.json:11-19`: Ressort, Amtliche Statistik, Polizei, Nachrichtendienst,
  Cyber-Fachbehörde, Bevölkerungsschutz, Aufenthaltsverwaltung, Kontrollinstanz), von denen
  **keine** in der bestehenden Landesmodul-Pflichtklassen-Taxonomie (15 Klassen, ausschließlich
  Parlament/Regierung/Partei/Medien) vorkommt (siehe §5.1). Die Bund-Ebene hat für Fachbehörden
  aktuell gar kein Klassenmodell (`required_classes: {}`).
- **Modell der Architektur-Referenz**: Das Paket behandelt die App-Architektur nur als
  vereinfachten Prüfkontext („`sources -> raw_documents -> knowledge_objects -> ko_document_links
  -> decisions/briefings`", `data/source_package.json:8`, wörtlich so auch in
  `audit/AUDIT_FINAL.md:17` bestätigt). Die tatsächliche, seit 2026-07-15 aktive Architektur ist
  deutlich reicher (Publisher/Retrieval-Path-Trennung, Geografie-Hierarchie, politische Entitäten,
  Paket-Pflichtklassen, sechsstufiger Pfadstatus, hartes BE/BB-Gate). Das ist keine
  Falschangabe des Pakets — es benennt diese Vereinfachung selbst explizit als Prüfvorbehalt
  („Claude Code soll das Paket gegen den echten Code auf main prüfen") — aber der Abgleich zeigt,
  dass die reale Zielstruktur komplexer ist als im Paket unterstellt.

**6. Gibt es einen Konflikt durch mehrere Ebenen oder Geografien?**
Ja, in drei Formen:
- Das Paket ist als **eine** fachliche Einheit über drei Ebenen/Geografien (Bund, Berlin,
  Brandenburg) konzipiert. Das bestehende Datenmodell führt `source_packages` jedoch strikt mit
  genau **einer** `political_level`/`geography_id` je Paket (siehe `pkg-bund-basis` = bund/geo-bund,
  `pkg-berlin-basis` = land/geo-land-berlin, `pkg-brandenburg-basis` = land/geo-land-brandenburg,
  `supabase/seeds/20260713_source_architecture_seed.sql:198-203`). Ein einzelnes
  „innere-sicherheit-und-bevoelkerungsschutz"-Paket würde diesem Muster widersprechen; es müsste
  — wie die bestehenden Basispakete — pro Ebene/Geografie aufgeteilt werden.
- Innerhalb Berlins kollidieren fünf fachlich getrennte Behörden auf einer Publisher-Domain
  (§5.2) — ein Ebenen-/Rollenkonflikt auf technischer Modellebene.
- Berlin/Brandenburg-Anteile hängen zusätzlich am bereits bestehenden, übergeordneten harten
  BE/BB-Gate (§5.4) — eine Aktivierung dieses Fachpakets für diese zwei Geografien ist nicht
  unabhängig von der allgemeinen BE/BB-Freigabeentscheidung möglich.

**7. Welche Dateien wurden verändert?**
Es wurden ausschließlich die zwei beauftragten Dateien neu angelegt — keine bestehende Datei im
Repository wurde verändert, gelöscht oder verschoben:
- `docs/quellen/innere-sicherheit-und-bevoelkerungsschutz/bestandsabgleich.md` (dieses Dokument)
- `docs/quellen/innere-sicherheit-und-bevoelkerungsschutz/bestandsmatrix.csv`

## Scope-Einhaltung

Nicht durchgeführt (auftragsgemäß): Live-Abrufe, Öffnen von Webseiten, Implementierung von
Quellen, Schreiben von Parsern, Anlegen von Retrieval Paths, Ändern von Seeds, Aktivierung,
Migration, Deployment, Löschen/Verändern bestehender Quellen, Sprint 2, Live-Tests. Es wurde keine
Datenbank live abgefragt (auch nicht lesend über verfügbare MCP-Werkzeuge) — der gesamte Abgleich
beruht ausschließlich auf dem Stand des Repositorys `main` zum Zeitpunkt dieses Sprints.
