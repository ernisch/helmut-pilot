# Bestandsabgleich `berlin-basis` — Sprint 1

**Datum:** 2026-07-23
**Branch:** `claude/berlin-basis-bestandsabgleich-rr6u7s`
**Verglichener Stand:** `main` @ `035898b`
**Auftrag:** Masterübergabe `Helmut_berlin_basis_Master_Uebergabe.zip` (hochgeladenes Paket), Sprint 1 (Bestandsabgleich) gemäß `CLAUDE_CODE_START_HIER.md` / `00_MASTER/03_claude_code_masterauftrag.md` (Phase 1), eingeschränkt auf den vom Auftraggeber vorgegebenen Umfang dieses Sprints.

## 0. Was dieser Sprint NICHT umfasst

Wie beauftragt: keine echten Webseiten-Abrufe, keine neuen Quellen, keine Parser, keine Seed-Änderungen, keine Aktivierung, keine Migration, kein Deployment, keine Production Writes, keine Löschung oder Korrektur bestehender Quellen. Es wurden ausschließlich die beiden unten genannten neuen Dateien angelegt. Alle Aussagen zu HTTP-Status/Live-Verifikation in diesem Bericht stammen aus **bereits im Repository dokumentierten** früheren Prüfläufen (Sprint 9B, 2026-07-14, GitHub-Actions-Runner mit offenem Egress) — es wurde in diesem Sprint selbst **keine einzige Live-Anfrage** gestellt.

## 1. Methodik

Verglichen wurde der **Code-/Dokumentationsstand auf `main`** (Seeds, Migrations, Tests, `docs/quellenarchitektur/*`) gegen die zehn Pflichtpfade aus `00_MASTER/05_finaler_pflichtkern.csv` / `02_architektur_master.json`. Bewusst **nicht** herangezogen wurde eine Live-Abfrage der Supabase-Datenbank: Sprint 1 ist als Vergleich gegen den Repository-Stand („main") beauftragt, nicht gegen einen laufenden Produktions- oder Entwicklungs-Datenbankzustand. Das deckt sich mit dem No-Go „Kein Production Write" und hält die Prüfung reproduzierbar aus dem Git-Verlauf heraus. Herangezogene Quellen u. a.:

- `supabase/migrations/20260713_source_architecture.sql` (Schema)
- `supabase/seeds/20260713_source_architecture_seed.sql`, `20260717_landesmodul_be_bb_seed.sql`
- `lib/helmut/quellenarchitektur/{model,catalog,admin-report}.js` und `seeds/{packages,publishers,entities,geographies,landesmodule-kandidaten,landesmodule-quellen,landesmodule-verifikation}.js`
- `lib/helmut/sources.js` (Alt-Katalog / Bund-Basis)
- `docs/quellenarchitektur/00-master-status.md`, `00-ist-architektur-und-abweichungen.md`, `02-zielarchitektur.md`, `11-landesmodule-berlin-brandenburg.md`, `13-landesmodule-technische-pruefung-und-bundeswege.md`, `14-sprint-9b-verifikation.md`, `17-pardok-parser.md`, `19-schritt-c-pardok-dispatch.md`, `26-…`, `27-…` (Sprint-Abschlussberichte)
- Volltextsuche im gesamten Repository nach allen zehn offiziellen URLs/Domain-Fragmenten aus dem Übergabepaket

**Wichtige Begriffsklärung für die Matrix:** Bei den zehn *Pflichtpfaden* bedeutet „vollständig vorhanden" echten Produktionsbetrieb (aktiv, nicht nur vorbereitet). Bei den sechs *Kandidaten* verlangt der Auftrag nur eine Existenzprüfung im Repository — dort zählt bereits ein vollständig vorbereiteter, aber inaktiver Kandidat (Publisher + Retrieval Path + Parser + Paketzuordnung) als „vollständig vorhanden als Kandidat".

## 2. Architektur-Kurzcheck (keine Abweichung)

Die im Übergabepaket verbindlich vorgegebene Architektur — Publishers, Retrieval Paths, Source Packages, Package Paths, Political Entities, Geographies — existiert **exakt so** bereits als Datenbankschema (`supabase/migrations/20260713_source_architecture.sql`, Tabellen `public.publishers`, `public.retrieval_paths`, `public.source_packages`, `public.package_paths`, `public.political_entities`, `public.geographies`). Das Source Package heißt bereits exakt `berlin-basis` (`pkg-berlin-basis`, Key `berlin-basis`), ist `is_base: true`, `political_level: "land"`, `geography_id: "geo-land-berlin"`. Ein Mandat erhält auch im Bestand nie direkt Quellen, sondern ausschließlich über Pakete (`lib/helmut/quellenarchitektur/profile-packages.js`, Mapping `berlin → berlin-basis`). **Auf struktureller Architekturebene besteht damit keine Abweichung** — die Abweichungen liegen ausschließlich auf fachlicher/inhaltlicher Ebene (Abschnitt 5).

Geografie (`geo-land-berlin`, 12 Bezirke) und die parlamentarische/exekutive Grundentität (`parliament-berlin-agh`, `government-berlin-senat`) sind ebenfalls bereits vorhanden.

## 3. Ergebnis je Pflichtpfad (Kurzfassung)

Vollständige Details, Belegstellen und Anmerkungen: siehe `bestandsmatrix.csv`. Kurzfassung:

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 1 | PARDOK Open Data XML | **teilweise vorhanden** | Identische Original-URL bereits als Kandidat hinterlegt, inkl. dediziertem Parser/Dispatcher/Testfixtures und echter Live-Verifikation (2026-07-14, HTTP 200, 8108 Dokumente). Nur Aktivierung/Produktionsstatus fehlt. |
| 2 | XML Termine Plenum | **fehlt vollständig** | 0 Treffer im gesamten Repository für `app_plen.xml`. |
| 3 | XML Termine Ausschüsse | **teilweise vorhanden** | Nur ein grober Google-News-Themenersatz für „Ausschüsse" vorhanden, nicht das amtliche `app_com.xml`. |
| 4 | Pressemitteilungen Senatskanzlei | **teilweise vorhanden** | Zwei Google-News-Ersatzwege vorhanden; der echte Landespressedienst-Feed wurde bereits getestet und als leer befunden, die im Auftrag genannte `rbmskzl`-URL wird nirgends verwendet. |
| 5 | Gesetz- und Verordnungsblatt | **fehlt vollständig** | Verwandte Domain (`gesetze.berlin.de`) wurde bereits geprüft und als eigener Feed **abgelehnt**; kein eigener Weg vorhanden. |
| 6 | Entscheidungen Verfassungsgerichtshof | **fehlt vollständig** | 0 Treffer für „Verfassungsgerichtshof" oder „bsbe" im gesamten Repository — auch konzeptionell nicht vorgesehen. |
| 7 | Pressemitteilungen Verfassungsgerichtshof | **fehlt vollständig** | 0 Treffer im gesamten Repository. |
| 8 | Haushaltsplan / Haushaltsdaten | **fehlt vollständig** | 0 Treffer; „Haushalt" ist keine der 15 bestehenden Landesmodul-Pflichtklassen. |
| 9 | Finanzplanung SenFin | **fehlt vollständig** | 0 Treffer im gesamten Repository. |
| 10 | Rechnungshof-Jahresberichte | **fehlt vollständig** | 0 Treffer für Berlin; nur der fachlich andere **Bundesrechnungshof** existiert (Verwechslungsgefahr, kein Bezug zu Berlin). |

## 4. Kandidaten-Check (nur Existenzprüfung)

| Nr | Kandidat | Im Repository vorhanden? |
|---|---|---|
| 1 | RSS Schriftliche Anfragen | Nein als eigener Weg — im Bestand bereits **geprüft und bewusst abgelehnt** (Redundanz zu PARDOK, inhaltlich deckungsgleich mit der neuen Freigabebedingung) |
| 2 | RSS Materialien des Plenums | Nein — 0 Treffer |
| 3 | Gefilterter Presseportal-Strom | Teilweise — verwandter LPD-Feed-Deep-Link dokumentiert, im Realtest aber durch Google News ersetzt; kein eigener Weg |
| 4 | VIS Rechtsstandsauflösung | Nein — verwandte Domain nur für einen anderen Zweck (GVBl) geprüft |
| 5 | Landeswahlleitung | Nein — 0 Treffer |
| 6 | rbb24 Politik | **Ja, vollständig als Kandidat** (Publisher, Retrieval Path, Parser, Paketzuordnung, Live-Verifikation) — nur inaktiv |

## 5. Wichtigste Abweichungen zur neuen fachlichen Definition

1. **Andere Klassentaxonomie.** Der Bestand strukturiert Berlin über 15 „Landesmodul-Pflichtklassen" (`landesparlament`, `plenum`, `ausschuesse`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung`, `landesregierung`, `staatskanzlei`, `ministerien`, `landesfraktionen`, `regionale_leitmedien`, `oer_landesberichterstattung`, `partei_pilot`, `fraktion_pilot`, `person_pilot` — `lib/helmut/quellenarchitektur/seeds/packages.js:20-25`). Diese Taxonomie ist **strukturell verschieden** von den zehn neuen Pflichtpfaden. Am gravierendsten: **Verfassungsgerichtshof, Haushalt/Finanzplanung und Rechnungshof kommen im bestehenden Klassenraster überhaupt nicht vor** — das sind drei von vier fachlichen Blöcken des neuen Kerns, für die es im Bestand nicht einmal eine Kategorie gibt (nicht nur keine Quelle).
2. **Neutralitätskonflikt.** Das neue Dokument fordert Neutralität und schließt „Parteien, Fraktionen, Personen und soziale Medien" explizit aus (`07_bewusste_ausschluesse.csv`, Zeile „Übergreifend"). Der bestehende, vorbereitete `berlin-basis`-Kandidatensatz enthält jedoch direkt im Basispaket partei-/fraktions-/personenbezogene „Pilot"-Quellen (Die Linke Berlin, Linksfraktion Berlin, Tobias Schulze MdA — `seeds/landesmodule-kandidaten.js:68-70`, verankert in `pkg-berlin-basis` über `package_paths`). Das widerspricht der neuen Neutralitätsvorgabe direkt.
3. **Tagesspiegel bereits vorbereitet, aber neu ausgeschlossen.** Tagesspiegel ist im Bestand als Berlin-Regionalmedium vorbereitet (`regionale_leitmedien`, `seeds/landesmodule-kandidaten.js:66`), wird aber im neuen Dokument bewusst ausgeschlossen („Tagesspiegel, Morgenpost und Berliner Zeitung — Lizenz, Bezahlschranke und Redundanz").
4. **Google-News-Abhängigkeit.** Ziel des neuen Dokuments ist ausdrücklich „keine notwendige Google-News-Abhängigkeit" (No-Go Nr. 11). Von den 18 im Bestand vorbereiteten Berlin-/Brandenburg-Wegen nutzen **11 Google News** als Methode — für Berlin betrifft das u. a. genau die Pfade 3 und 4 des neuen Pflichtkerns, die dort ausdrücklich mit **eigener** amtlicher URL definiert sind. Bei unveränderter Übernahme des Bestands würde die im Betrieb bereits dokumentierte Google-News-Drosselung (Betriebsbefund B1, `docs/betrieb/google_news_drosselung_analyse.md`) strukturell auf Berlin ausgeweitet.
5. **Architektur selbst weicht nicht ab** (siehe Abschnitt 2) — Tabellenmodell und Paketname `berlin-basis` sind bereits deckungsgleich mit der Vorgabe.

## 6. Risikohinweise (Beobachtung, keine Umsetzung in diesem Sprint)

- **Google-News-Klumpenrisiko:** siehe Punkt 5.4 oben.
- **Namensverwechslung Rechnungshof:** Der bestehende Katalog kennt bereits einen „Bundesrechnungshof" (Bundesebene); bei künftiger Umsetzung von Pfad 10 (Rechnungshof von Berlin) ist strikt auf Landesebene/eigene Entität zu achten.
- **Dokumentationsstand:** `docs/quellenarchitektur/27-abschluss-und-production-freigabe.md` ist laut `00-master-status.md` selbst als überholt markiert; für den aktuellen Betriebsstatus ist ausschließlich `00-master-status.md` maßgeblich (dort bestätigt: `HELMUT_SOURCE_MODE=on` seit 2026-07-15, aber ausdrücklich nur für den Bund-Katalog — **Berlin/Brandenburg durchgängig „inaktiv", 0 Dokumente**).
- **WP-Aktualität:** PARDOK-URL referenziert Wahlperiode 19 (`pardok-wp19.xml`); vor jeder technischen Validierung ist zu prüfen, ob die Abgeordnetenhauswahl 2026 bereits eine neue Wahlperiode (WP20) und damit eine neue URL erfordert.

## 7. Abschlussbericht

**1. Wie viele der zehn Pflichtpfade sind vollständig vorhanden?**
**0 von 10.** Keiner der zehn Pflichtpfade ist aktiv/in Produktion; alles, was existiert, ist bestenfalls als inaktiver Kandidat vorbereitet.

**2. Wie viele sind teilweise vorhanden?**
**3 von 10** — Pfad 1 (PARDOK, technisch am weitesten: Publisher, Retrieval Path mit identischer URL, dedizierter Parser, Live-Verifikation vorhanden, nur inaktiv), Pfad 3 (Ausschüsse, nur als grober Google-News-Themenersatz, nicht die amtliche Termin-XML) und Pfad 4 (Senatskanzlei, nur als zweifacher Google-News-Ersatz, amtliche URL ungenutzt).

**3. Wie viele fehlen vollständig?**
**7 von 10** — Pfade 2 (XML Termine Plenum), 5 (GVBl), 6 (VerfGH Entscheidungen), 7 (VerfGH Pressemitteilungen), 8 (Haushaltsplan), 9 (Finanzplanung), 10 (Rechnungshof). Für 6, 7, 8, 9 und 10 existiert im Bestand nicht einmal eine passende Kategorie.

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
Empfehlung: **Pfad 1 (PARDOK Open Data XML)**, **Pfad 2 (XML Termine Plenum)** und **Pfad 3 (XML Termine Ausschüsse)** — alle drei teilen Publisher und Domain (`parlament-berlin.de`), PARDOK hat bereits Parser-/Dispatch-Infrastruktur und eine bestätigte Live-Prüfung, und mit den beiden Termin-XMLs ließe sich Block 1 (Abgeordnetenhaus) technisch vollständig und ohne Google-News-Ersatzweg schließen. **Pfad 4 (Senatskanzlei)** ist als naher vierter Kandidat zu nennen, da dort bereits ein — bislang unvollständiger — Ersatzweg-Versuch dokumentiert ist, den es durch die amtliche URL zu ersetzen gilt.

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
**Ja, mehrere wesentliche** (Details: Abschnitt 5): unterschiedliche Klassentaxonomie mit drei fachlich komplett fehlenden Themenblöcken (VerfGH, Haushalt, Rechnungshof), ein Neutralitätskonflikt durch bereits vorbereitete partei-/fraktions-/personenbezogene Quellen im Basispaket, eine bereits vorbereitete, aber neu explizit ausgeschlossene Quelle (Tagesspiegel), sowie eine Google-News-Abhängigkeit in genau den Pfaden, die im neuen Dokument amtliche Direktquellen vorsehen. Keine Abweichung besteht dagegen auf der reinen Architektur-/Datenmodellebene und beim Paketnamen `berlin-basis` selbst.

**6. Welche Dateien wurden verändert?**
Ausschließlich zwei **neu angelegte** Dateien:
- `docs/quellen/berlin-basis/bestandsabgleich.md` (dieser Bericht)
- `docs/quellen/berlin-basis/bestandsmatrix.csv`

Keine bestehende Datei wurde verändert, keine Seeds, keine Migration, keine Konfiguration, keine Aktivierung.

---

**Sprint 1 ist hiermit abgeschlossen. Es folgen in diesem Durchlauf keine Live-Tests und kein Sprint 2.**
