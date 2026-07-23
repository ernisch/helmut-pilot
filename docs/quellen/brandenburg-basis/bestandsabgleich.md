# Bestandsabgleich `brandenburg-basis` — Sprint 1

**Datum:** 2026-07-23
**Branch:** `claude/berlin-basis-bestandsabgleich-rr6u7s`
**Verglichener Stand:** `main` @ `035898b`
**Auftrag:** Masterübergabe `Helmut_brandenburg_basis_Master_Uebergabe.zip` (hochgeladenes Paket), Sprint 1 (Bestandsabgleich), analog zum bereits abgeschlossenen Sprint 1 für `berlin-basis` (`docs/quellen/berlin-basis/bestandsabgleich.md`).

## 0. Was dieser Sprint NICHT umfasst

Wie beauftragt: keine Live-Abrufe, keine geöffneten Webseiten, keine implementierten Quellen, keine Parser, keine neu angelegten Retrieval Paths, keine Seed-Änderungen, keine Aktivierung, keine Migration, kein Deployment, keine Löschung oder Veränderung bestehender Quellen. Es wurden ausschließlich die beiden unten genannten neuen Dateien angelegt. Alle Aussagen zu HTTP-Status/Live-Verifikation in diesem Bericht stammen aus **bereits im Repository dokumentierten** früheren Prüfläufen (Sprint 9B, 2026-07-14, GitHub-Actions-Runner mit offenem Egress) — es wurde in diesem Sprint selbst **keine einzige Live-Anfrage** gestellt.

## 1. Methodik

Verglichen wurde der **Code-/Dokumentationsstand auf `main`** (Seeds, Migrations, Tests, `docs/quellenarchitektur/*`) gegen die acht Pflichtpfade aus `00_MASTER/05_finaler_pflichtkern.csv` / `02_architektur_master.json`. Wie bei `berlin-basis` wurde bewusst **keine Live-Abfrage** einer Supabase-Datenbank herangezogen — der Vergleich bleibt auf den Repository-Stand („main") beschränkt und damit reproduzierbar aus dem Git-Verlauf. Da Berlin und Brandenburg im Repository als **ein gemeinsames** „Landesmodul BE/BB"-Vorhaben geführt werden, wurden dieselben Dateien wie im Berlin-Sprint erneut ausgewertet, diesmal gezielt auf die Brandenburg-Abschnitte (`BRANDENBURG_KANDIDATEN`, `bb-*`-IDs, `pkg-brandenburg-basis`):

- `supabase/migrations/20260713_source_architecture.sql` (Schema)
- `supabase/seeds/20260713_source_architecture_seed.sql`, `20260717_landesmodul_be_bb_seed.sql`
- `lib/helmut/quellenarchitektur/{model,catalog,admin-report,classification}.js` und `seeds/{packages,publishers,entities,geographies,landesmodule-kandidaten,landesmodule-quellen,landesmodule-verifikation}.js`
- `lib/helmut/sources.js` (Alt-Katalog / Bund-Basis)
- `docs/quellenarchitektur/00-master-status.md`, `00-ist-architektur-und-abweichungen.md`, `02-zielarchitektur.md`, `11-landesmodule-berlin-brandenburg.md`, `13-landesmodule-technische-pruefung-und-bundeswege.md`, `14-sprint-9b-verifikation.md`, `sprint-9-abschlussbericht.md`
- Volltextsuche im gesamten Repository nach allen acht offiziellen URLs/Domain-/Pfadfragmenten aus dem Übergabepaket (u. a. `267951`, `267952`, `222669`, `dislservice`, `verfgbbg`, `lrh-brandenburg`, `DatenAdler`)

**Begriffsklärung wie im Berlin-Bericht:** Bei den acht *Pflichtpfaden* bedeutet „vollständig vorhanden" echten Produktionsbetrieb. Bei den sieben *Kandidaten* verlangt der Auftrag nur eine Existenzprüfung — ein vollständig vorbereiteter, aber inaktiver Kandidat zählt dort bereits als „vollständig vorhanden als Kandidat".

## 2. Architektur-Kurzcheck (keine Abweichung)

Wie bei `berlin-basis` existiert die vorgegebene Architektur (Publishers, Retrieval Paths, Source Packages, Package Paths, Political Entities, Geographies) bereits exakt als Schema. Das Source Package heißt bereits exakt `brandenburg-basis` (`pkg-brandenburg-basis`, Key `brandenburg-basis`), ist `is_base: true`, `political_level: "land"`, `geography_id: "geo-land-brandenburg"`. Publisher, Retrieval Paths und Pakete für Brandenburg hängen über `package_paths` korrekt an genau diesem Paket — kein Mandat erhält Quellen direkt. **Auf struktureller Architekturebene besteht keine Abweichung.**

Geografie (`geo-land-brandenburg`, 4 kreisfreie Städte, 14 Landkreise) und die parlamentarische/exekutive Grundentität (`parliament-brandenburg-landtag`, `government-brandenburg`) sind bereits vorhanden.

## 3. Ergebnis je Pflichtpfad (Kurzfassung)

Vollständige Details, Belegstellen und Anmerkungen: siehe `bestandsmatrix.csv`. Kurzfassung:

| Nr | Pflichtpfad | Status | Kernbefund |
|---|---|---|---|
| 1 | Parlamentsdokumentation | **teilweise vorhanden** | Existierender Kandidat nutzt den maschinenlesbaren OpenData-Export (`exportWP8.xml`) desselben parldok-Systems statt der im Auftrag genannten `starweb/LBB/ELVIS`-Suchoberfläche — inkl. wiederverwendetem PARDOK-Parser und Live-Verifikation (2026-07-14, HTTP 200, 6092 Vorgänge). |
| 2 | Termine und Tagesordnungen Plenum | **teilweise vorhanden** | Nur ein grober Google-News-Themenersatz für „Landtag" vorhanden, nicht die amtliche Termin-RSS-URL. |
| 3 | Termine und Tagesordnungen Ausschüsse | **teilweise vorhanden** | Eigener Google-News-Themenersatz („Landtag Brandenburg Ausschuss"), nicht die amtliche Termin-RSS-URL. |
| 4 | Pressemitteilungen der Staatskanzlei | **teilweise vorhanden** | Nur über den Google-News-Ersatzweg der Altklasse „landesregierung" mit abgedeckt; ein echter zentraler Presse-Feed (`bbo_rss`) wurde live getestet, war aber defekt (404/HTML). |
| 5 | Gesetz- und Verordnungsblatt Teil I/II | **fehlt vollständig** | 0 Treffer für die amtliche Domain; nur die andere Domain BRAVORS wurde für einen engeren Zweck geprüft und abgelehnt. |
| 6 | Entscheidungen Verfassungsgericht | **fehlt vollständig** | 0 Treffer für „verfgbbg"; auch konzeptionell nicht vorgesehen. |
| 7 | Pressemitteilungen/Terminankündigungen Verfassungsgericht | **fehlt vollständig** | 0 Treffer im gesamten Repository. |
| 8 | Veröffentlichungen Landesrechnungshof | **fehlt vollständig** | 0 Treffer; nur der fachlich andere **Bundesrechnungshof** existiert (Verwechslungsgefahr). |

## 4. Kandidaten-Check (nur Existenzprüfung)

| Nr | Kandidat | Im Repository vorhanden? |
|---|---|---|
| 1 | Dokument RSS Trigger | Nein — 0 Treffer |
| 2 | Landtag Datensätze im DatenAdler | Nein — 0 Treffer |
| 3 | Terminvorschau der Landesregierung | Nein — 0 Treffer |
| 4 | BRAVORS Rechtsstandsauflösung | Teilweise — Domain für einen anderen (Dauerstream-)Zweck bereits geprüft und **explizit abgelehnt**; Ablehnungsgrund deckt sich bereits mit dem neuen No-Go Nr. 9 |
| 5 | Haushalts- und Finanzplanungspfad | Nein — 0 Treffer, keine passende Altklasse |
| 6 | Landeswahlleitung | Nein — 0 Treffer |
| 7 | rbb24 Brandenburg | **Ja, vollständig als Kandidat** (Publisher, Retrieval Path, Parser, Paketzuordnung, Live-Verifikation) — identischer, global deduplizierter Weg wie bei Berlin, nur inaktiv |

## 5. Wichtigste Abweichungen zur neuen fachlichen Definition

1. **Andere Klassentaxonomie.** Der Bestand strukturiert Brandenburg (wie Berlin) über dieselben 15 „Landesmodul-Pflichtklassen" (`lib/helmut/quellenarchitektur/seeds/packages.js:20-25`), die strukturell verschieden von den acht neuen Pflichtpfaden sind. Verfassungsgericht und Landesrechnungshof kommen im bestehenden Klassenraster **überhaupt nicht vor** — für zwei der vier fachlichen Blöcke des neuen Kerns gibt es im Bestand nicht einmal eine Kategorie.
2. **Neutralitätskonflikt.** Das neue Dokument schließt „Parteien, Fraktionen, Personen und soziale Medien" explizit aus. Der bestehende, vorbereitete `brandenburg-basis`-Kandidatensatz enthält direkt im Basispaket eine parteibezogene „Pilot"-Quelle (Die Linke Brandenburg, `seeds/landesmodule-kandidaten.js:91`, verankert über `package_paths`) sowie einen allgemeinen Fraktionen-Kandidaten (`landesfraktionen`). Das widerspricht der neuen Neutralitätsvorgabe.
3. **Regionalmedien bereits vorbereitet, aber neu ausgeschlossen.** Märkische Allgemeine/Lausitzer Rundschau (MAZ) ist im Bestand als Brandenburg-Regionalmedium vorbereitet (`regionale_leitmedien`, `seeds/landesmodule-kandidaten.js:89`), wird aber im neuen Dokument bewusst ausgeschlossen („Sekundär; Regionale Zeitungen; Teilabdeckung, Bezahlschranken und Lizenz").
4. **Google-News-Abhängigkeit.** Von den 8 im Bestand vorbereiteten Brandenburg-Wegen nutzen **6 Google News** als Methode (alle außer Parlamentsdokumentation und Partei-Pilot) — das betrifft konkret die neuen Pflichtpfade 2, 3 und 4, für die die neue Definition eigene amtliche URLs vorsieht. Widerspricht No-Go Nr. 12 „Keine notwendige Google-News-Abhängigkeit".
5. **Punktuelle Übereinstimmung statt Abweichung (BRAVORS).** Die bestehende Ablehnung eines BRAVORS-Dauerstreams (`seeds/landesmodule-kandidaten.js:106`, Grund „kein RSS/Feed, StarWeb/HTML") deckt sich bereits inhaltlich mit No-Go Nr. 9 der neuen Definition („Kein vollständiger Dauerabruf von BRAVORS"). Ebenso ist der alte „ministerien"-Kandidat im neuen Dokument ohnehin bewusst ausgeschlossen — auch hier kein Konflikt.
6. **Andere Reichweite beim Rechnungshof (fachlicher Hinweis, keine Repo-Abweichung).** Das neue Dokument verlangt für Brandenburg alle „Veröffentlichungen" des Landesrechnungshofs, nicht nur Jahresberichte (wie bei Berlin). Da im Bestand ohnehin nichts vorhanden ist, ändert das den Befund nicht, ist aber für die spätere technische Umsetzung relevant.
7. **Architektur selbst weicht nicht ab** (siehe Abschnitt 2) — Tabellenmodell und Paketname `brandenburg-basis` sind bereits deckungsgleich mit der Vorgabe.

## 6. Risikohinweise (Beobachtung, keine Umsetzung in diesem Sprint)

- **Google-News-Klumpenrisiko:** siehe Punkt 5.4 oben — gilt strukturell identisch zum bereits für Berlin dokumentierten Befund.
- **Namensverwechslung Rechnungshof:** Der bestehende Katalog kennt bereits einen „Bundesrechnungshof" (Bundesebene); bei künftiger Umsetzung von Pfad 8 ist strikt auf Landesebene/eigene Entität (Landesrechnungshof Brandenburg) zu achten.
- **Zwei unterschiedliche Brandenburger Rechtsportale:** BRAVORS (`bravors.brandenburg.de`, bereits geprüft/abgelehnt für Dauerstream) und das im neuen Auftrag für Pfad 5 genannte Landesrechtsportal (`landesrecht.brandenburg.de/dislservice`) sind **unterschiedliche Domains** — die bestehende Ablehnung darf nicht unreflektiert auf Pfad 5 übertragen werden.
- **Produktionsstatus unverändert:** Laut `docs/quellenarchitektur/00-master-status.md` ist `HELMUT_SOURCE_MODE=on` seit 2026-07-15, aber ausdrücklich nur für den Bund-Katalog — **„BE/BB inaktiv (0 Dokumente, verifiziert)"** gilt für Brandenburg genauso wie für Berlin.
- **WP-Aktualität:** Die Parlamentsdokumentation referenziert Wahlperiode 8 (`exportWP8.xml`); vor jeder technischen Validierung ist die Aktualität der Wahlperiodennummer zu prüfen.

## 7. Abschlussbericht

**1. Wie viele Pflichtpfade sind vollständig vorhanden?**
**0 von 8.** Keiner der acht Pflichtpfade ist aktiv/in Produktion.

**2. Wie viele sind teilweise vorhanden?**
**4 von 8** — Pfad 1 (Parlamentsdokumentation, technisch am weitesten: Publisher, Retrieval Path, wiederverwendeter Parser und Live-Verifikation vorhanden, aber andere konkrete URL als im Auftrag genannt und inaktiv), Pfad 2 und Pfad 3 (Termine Plenum/Ausschüsse, jeweils nur als grober Google-News-Themenersatz) sowie Pfad 4 (Staatskanzlei, nur über den Google-News-Ersatz der Altklasse „landesregierung" mit abgedeckt, amtliche URL ungenutzt).

**3. Wie viele fehlen?**
**4 von 8** — Pfade 5 (GVBl), 6 (Verfassungsgericht Entscheidungen), 7 (Verfassungsgericht Pressemitteilungen) und 8 (Landesrechnungshof). Für 6, 7 und 8 existiert im Bestand nicht einmal eine passende Kategorie.

**4. Welche drei Pfade sollten zuerst technisch validiert werden?**
Empfehlung: **Pfad 1 (Parlamentsdokumentation)**, **Pfad 2 (Termine Plenum)** und **Pfad 3 (Termine Ausschüsse)** — alle drei teilen denselben Publisher/dieselbe Domain-Familie (`landtag.brandenburg.de` / `parlamentsdokumentation.brandenburg.de`), Pfad 1 hat bereits einen wiederverwendeten Parser und eine bestätigte Live-Prüfung, und mit den beiden Termin-RSS-Pfaden ließe sich Block 1 (Landtag) technisch vollständig und ohne Google-News-Ersatzweg schließen. **Pfad 4 (Staatskanzlei)** ist als naher vierter Kandidat zu nennen, da dort bereits ein — bislang unvollständiger — Ersatzweg-Versuch dokumentiert ist.

**5. Gibt es eine Abweichung zwischen dem bestehenden Paket und der neuen fachlichen Definition?**
**Ja, mehrere wesentliche** (Details: Abschnitt 5): unterschiedliche Klassentaxonomie mit zwei fachlich komplett fehlenden Themenblöcken (Verfassungsgericht, Landesrechnungshof), ein Neutralitätskonflikt durch eine bereits vorbereitete parteibezogene Quelle und einen allgemeinen Fraktionen-Kandidaten im Basispaket, eine bereits vorbereitete, aber neu explizit ausgeschlossene Quelle (MAZ/Lausitzer Rundschau), sowie eine Google-News-Abhängigkeit in genau den Pfaden, für die das neue Dokument amtliche Direktquellen vorsieht. Eine punktuelle **Übereinstimmung** besteht bei BRAVORS: die bestehende Ablehnung eines Dauerstreams deckt sich bereits mit dem neuen No-Go Nr. 9. Keine Abweichung besteht auf der reinen Architektur-/Datenmodellebene und beim Paketnamen `brandenburg-basis` selbst.

**6. Welche Dateien wurden verändert?**
Ausschließlich zwei **neu angelegte** Dateien:
- `docs/quellen/brandenburg-basis/bestandsabgleich.md` (dieser Bericht)
- `docs/quellen/brandenburg-basis/bestandsmatrix.csv`

Keine bestehende Datei wurde verändert, keine Seeds, keine Migration, keine Konfiguration, keine Aktivierung.

---

**Sprint 1 ist hiermit abgeschlossen. Es folgen in diesem Durchlauf keine Live-Tests und kein Sprint 2.**
