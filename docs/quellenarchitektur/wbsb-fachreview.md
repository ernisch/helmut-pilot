# WBSB-Fachreview — Quellenpaket `wohnen-bauen-stadtentwicklung-bund`

**Stand:** 2026-07-24 · **Ebene:** Bund · **Sicht:** politischer Research Director (fachlich) ·
**Methodik:** `quellen-fachreview-methodik.md` (Zwei-Achsen-Bewertung)

> **Diese Überarbeitung trennt strikt zwei Ebenen** — die technische Umsetzung ist NICHT die
> Wahrheit über die Zielarchitektur. Fachliche Qualität (A/B/C) und technische Integrationsreife
> (Grün/Gelb/Rot) werden getrennt erhoben und erst über die Entscheidungsregel zu Kategorien
> zusammengeführt. Grundlage sind die real per CI verifizierten 28 Kandidaten (HTTP-Belege in
> `docs/quellen/wohnen-bauen-stadtentwicklung-bund/quellenpruefung.csv`, CI-Run **30079020728**,
> 2026-07-24, Egress offen).

> **Scope-Hinweis (Ehrlichkeit).** Das Paket selbst (Seeds/Katalog/Rechercheprotokolle) lebt in
> **PR #117** (`claude/quellenpaket-workflow-konsolidierung-7nqp04`), technisch **`prepared` /
> inaktiv** (alle 11 Wege `needs_review`/`manual`). Dieses Dokument fügt die **fachliche
> Review-Ebene** hinzu, ohne Code, Registry, Generatoren oder den Aktivierungsstatus zu berühren.
> PR #117 war ausdrücklich ein reiner Workflow-/Integrations-Sprint **ohne** fachliche
> Überarbeitung — diese liefert der vorliegende Fachreview nach.

---

## 1. Paketauftrag (fachlicher Bezugsrahmen)

Helmut soll bundespolitische Entwicklungen in folgenden Feldern erkennen: **Wohnen & Mietrecht,
sozialer Wohnungsbau, Wohnraumförderung, Baupolitik, Baugesetzgebung, Stadtentwicklung,
Städtebauförderung, Raumordnung, Immobilien-/Wohnungsmarktdaten, Baukosten & Bautätigkeit,
parlamentarische Vorgänge, Förderprogramme/Richtlinien.**

Nicht Paketgegenstand: Berlin/Brandenburg (eigene Landesmodule), Verbände, Unternehmen, Medien,
Google News als Herausgeber. Diese fachliche Abgrenzung ist Teil der Qualität — mehr Quellen sind
nicht automatisch besser.

---

## 2. Fachliche Bewertung je Herausgeber (Achse A)

Die Note liegt am **Herausgeber in seiner Rolle** und ist unabhängig von der heutigen technischen
Erreichbarkeit.

### BMWSB — Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen · **A**
Das **zuständige Bundesressort** und damit die wichtigste Einzel-Primärquelle des gesamten
Politikfelds. Relevanz maximal; Erstquelle für Gesetzentwürfe, Förderentscheidungen,
Ministerentscheidungen; laufend aktuell; voll zitierfähig; über Wahlperioden tragend; hoher
strategischer Frühindikatorwert. `official_primary`.

### BBSR — Bundesinstitut für Bau-, Stadt- und Raumforschung · **A**
Die **zentrale Ressortforschung des Bundes** zu Wohnungsmärkten, Stadtentwicklung und laufender
Raumbeobachtung. Analytische Primär-/Datenquelle mit hohem strategischem Früh- und
Alleinstellungswert (Marktbeobachtung, Prognosen). Langfristig tragend. Fachlich **A** —
**unabhängig davon**, dass die per WebSearch gefundenen URLs heute 404 liefern (siehe Achse B).

### Destatis — Statistisches Bundesamt · **A**
Maßgebliche **amtliche Datenquelle** für die harten Kennzahlen des Felds: Bautätigkeit
(Genehmigungen/Fertigstellungen), Baupreisindex, Mieten/Wohnkosten, Wohngeld. Das statistische
Rückgrat jeder mietpolitischen/baupolitischen Bewertung. `data_source`, höchste Zitierfähigkeit,
zeitreihen-langfristig.

### Bundesamt für Justiz — Verkündungsplattform des Bundes (recht.bund.de / BGBl) · **A**
**Amtliche Verkündung** neuer Bundesgesetze/-verordnungen — seit 2023 **ausschließlich** hier.
Primärquelle für in Kraft getretene Baugesetzgebung. Rechtsverbindlich, unersetzbar zitierfähig,
laufend.

### Deutscher Bundestag — Fachausschuss + DIP · **A**
Parlamentarischer **Fachausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen** (Ort der
Gesetzesberatung, Anhörungen, Tagesordnungen) und das parlamentarische Vorgangs-Rückgrat über die
**DIP-API**. Relevanz und Langfristigkeit maximal. `official_primary`.

### Bundesamt für Bauwesen und Raumordnung (BBR) · **B**
Nachgeordnete Bundesbehörde für **Bundesbau und Raumordnung**. Fachlich relevant und primär, aber
enger und administrativer als das Ministerium; die Presseausbeute ist dünner. **Derzeit der
einzige verifizierte Träger des Raumordnungs-Bereichs**, weil BBSR technisch ausfiel — teils also
Platzhalter für die BBSR-Rolle. Solide **B**.

### Städtebauförderung — Bund-Länder-Portal (staedtebaufoerderung.info) · **B**
Offizielles **Programmportal** der Städtebauförderung (Verwaltungsvereinbarungen, Mittelverteilung,
Programme „Lebendige Zentren"/„Sozialer Zusammenhalt"/„Wachstum & nachhaltige Erneuerung").
Primär für diese Programmschiene, aber enger und statischer als Ministerium/BBSR. **B**.

### Förderdatenbank des Bundes (foerderdatenbank.de) · **B**
Amtliche, **neutrale und vollständige** Sicht der Bundes-Förderprogramme (gefiltert auf Fördergeber
BMWSB). Guter Referenzbestand, aber `data_source`-Charakter, periodische Aktualität und
Überschneidung mit der BMWSB-eigenen Förderliste. **B**.

### Bundesamt für Justiz — Gesetze im Internet (gesetze-im-internet.de) · **A− / B**
- **Aktualitätendienst** (Liste neu eingestellter/geänderter Vorschriften): fachlich stark —
  erkennt Änderungen an BauGB/BauNVO/WoFG/GEG **ohne Einzelgesetz-Polling**. Konsolidierte
  Normänderungssicht; überschneidet sich aber mit dem BGBl. **A−**.
- **BauGB / BauNVO / GEG Volltexte**: **statische** Referenztexte (geringe Eigen-Aktualität;
  Änderungen laufen über das BGBl). Referenz-, kein Monitoring-Wert. **B/C**.

### KfW — Förderprodukte Bestandsimmobilie · **C**
**Umsetzungs-/Marketingebene** einer Förderbank, keine politische Primärquelle. Die
Förderlandschaft ist neutraler/vollständiger über die Förderdatenbank abgedeckt. `direct_interest`
statt `official_primary`. **C — fachfremd für den Pflichtkern.**

### BImA — Bundesanstalt für Immobilienaufgaben · **C**
**Operativer** Immobilienverwalter des Bundes (Umsetzungsebene), keine bau-/wohnungspolitische
Primärquelle; zusätzlich fragile Hash-URLs. **C — fachfremd.**

### Bestand: `committee-bau-wohnen` (Google-News-Themensuche, Paket bund-basis) · **B (Aggregator)**
Bestehender **Aggregator-Ersatzweg** (kein eigener Herausgeber). Fachlich als breites Suchnetz
nützlich, aber kein Primärbeleg (`aggregator`). Bleibt unverändert im Bestand und wird separat
behandelt.

---

## 3. Abrufweg-Matrix (Achse B → Kategorie)

Technische Note je **Abrufweg**; Kategorie nach der Entscheidungsregel der Methodik. „HTTP" =
realer CI-Beleg (Run 30079020728, 2026-07-24). Alle 11 Pflichtkern-Wege stehen technisch auf
`needs_review`/`manual` (inaktiv).

| # | Herausgeber | Abrufweg (Rolle) | Methode | Fachl. | Techn. | Kat. | Fehlt (→ Ziel) | HTTP |
|--:|---|---|---|:--:|:--:|:--:|---|:--:|
| 1 | BMWSB | Pressemitteilungen | html_liste | A | **Gelb** | **1** | Feed (RSS) als Upgrade | 200 |
| 2 | recht.bund.de | BGBl Teil I — Verkündungsliste | html_liste | A | **Gelb** | **1** | Feed (RSS) als Upgrade | 200 |
| 3 | Bundestag | Bauausschuss (Sitzungen/Anhörungen) | html_liste | A | **Gelb** | **1** | — (distinktes Primärinhalt) | 200 |
| — | Bundestag | **DIP-API** (parlam. Vorgänge, Bestand `rp-dip`) | api | A | **Grün** | **1** | — (aktiv, `always_on`) | — |
| 4 | Destatis | GENESIS-Online API/Webservice | api | A | **Rot** | **2** | API-Basis-URL, **Auth**, Parser | 200¹ |
| 5 | BBSR | RSS-Newsfeed / Neue Veröffentlichungen / Aktuelles | rss/html | A | **Rot** | **2** | **URL-Nachrecherche**, Feed | 404 |
| 6 | BMWSB | RSS-Newsfeed (`.xml`) | rss | A | **Rot** | **2** | konkrete Feed-URL | 200² |
| 7 | recht.bund.de | RSS-Hub Verkündungen (`.xml`) | rss | A | **Rot** | **2** | konkrete Feed-URL | 200² |
| 8 | gesetze-im-internet.de | Aktualitätendienst (Normänderungen) | html_liste | A− | **Rot** | **2** | Re-Verifikation (Timeout), Parser | Timeout |
| 9 | Destatis | Bautätigkeit (Tabellen) | html_liste | A | **Gelb** | **3** | → GENESIS (Kat 2) | 200 |
| 10 | Destatis | Baupreisindex (Tabellen) | html_liste | A | **Gelb** | **3** | → GENESIS (Kat 2) | 200 |
| 11 | Destatis | Wohnen/Mieten (Tabellen) | html_liste | A | **Gelb** | **3** | → GENESIS (Kat 2) | 200 |
| 12 | Destatis | Wohngeld (Tabellen) | html_liste | A | **Gelb** | **3** | → GENESIS (Kat 2) | 200 |
| 13 | BBR | Pressemitteilungen (Suchformular) | html_suche | B | **Gelb** | **3** | Ergebnis-Parser; ggf. BBSR ersetzt | 200 |
| 14 | Städtebauförderung | Portal-Startseite/Aktuelles | html_liste | B | **Gelb** | **3** | Feed falls vorhanden | 200 |
| 15 | Förderdatenbank | BMWSB-Förderprogramme | html_liste | B | **Gelb** | **3** | strukturierter Export; Konsolidierung | 200 |
| 16 | BMWSB | Wohnraumförderung (Förderprogramme) | html_liste | A | **Gelb** | **3** | Konsolidieren mit #15 | 200 |
| — | Bestand | `committee-bau-wohnen` (Google-News) | googlenews_search | B | **Grün** | **3** | breites Netz, kein Primärbeleg | — |
| 17 | BMWSB | aktuelle-meldungen | html_liste | A | Gelb | **4** | redundant zu #1 | 200 |
| 18 | BMWSB | publikationen | html_liste | A | Gelb | **4** | nachrangig/redundant | 200 |
| 19 | Destatis | baugenehmigungen (Einzeltabelle) | html_liste | A | Gelb | **4** | in #9 enthalten | 200 |
| 20 | Destatis | wohnungsbestand (Einzeltabelle) | html_liste | A | Gelb | **4** | in #11 enthalten | 200 |
| 21 | Städtebauförderung | Programme/Förderung (Unterseite) | html_liste | B | Gelb | **4** | redundant zu #14 | 200 |
| 22 | gesetze-im-internet.de | BauGB Volltext | html_liste | B/C | **Rot** | **4** | statisch; Referenz-only | Timeout |
| 23 | gesetze-im-internet.de | BauNVO Volltext | html_liste | B/C | **Rot** | **4** | statisch; Referenz-only | Timeout |
| 24 | gesetze-im-internet.de | GEG Volltext | html_liste | B/C | **Rot** | **4** | statisch; Referenz-only | Timeout |
| 25 | KfW | Förderprodukte Bestandsimmobilie | html_liste | C | Grün | **4** | fachfremd (Umsetzungsebene) | 200 |
| 26 | BImA | Pressemeldungen | html_liste | C | Gelb | **4** | fachfremd (operativ) | 200 |

¹ Nur die **Beschreibungsseite** liefert HTTP 200; die REST-Basis-URL wurde bewusst **nicht
erfunden** — der eigentliche API-Endpunkt ist unverifiziert. ² HTTP 200, aber `text/html` statt
Feed — die RSS-Landingpage ist eine Übersichtsseite; die konkrete `.xml`-Adresse ist unaufgelöst.

**Lesehilfe zur Doppelrolle A-Quelle in Kat 3/4:** Destatis und BMWSB sind fachlich **A**. Dass
einzelne ihrer Abrufwege in Kat 3 (Scrape-Stopgap) oder Kat 4 (redundante Einzelseite) stehen, ist
eine Aussage über den **Weg**, nicht über die **Quelle**. Der fachliche A-Wert der Quelle bleibt —
er wird über die Kat-2-Zielwege (GENESIS, RSS) und die Kat-1-Kernwege realisiert.

---

## 4. Kategorien-Zusammenfassung

### Kategorie 1 — IDEAL + SOFORT NUTZBAR
Fachlich A, technisch einsatzbereit (bzw. belastbares Gelb mit HTML-Scrape als akzeptiertem
Kernweg) — nach Standard-Freigabe sofort produktiv:

- **DIP-API** (Bestand `rp-dip`, `api`, `always_on`) — parlamentarisches Vorgangs-Rückgrat. Der
  einzige **grüne** Zugang des Felds; bereits aktiv, wird nur wiederverwendet.
- **BMWSB Pressemitteilungen** — Ressort-Primärquelle Nr. 1.
- **BGBl Teil I Verkündungsliste** (recht.bund.de) — amtliche Baugesetzgebung.
- **Bundestag Bauausschuss** — Anhörungen/Tagesordnungen (distinkt zu DIP).

### Kategorie 2 — IDEAL, aber technisch noch nicht sauber integrierbar → `future_target`
Fachlich A, bleiben **ausdrücklich Bestandteil der Zielarchitektur**, werden **nicht entfernt**:

- **Destatis GENESIS-Online-API** — maschineller Zugang zu denselben Bau-/Wohn-Zeitreihen
  (XML/JSON/CSV) statt HTML-Scrape. *Das Lehrbuchbeispiel:* fachlich A, technisch Rot, **nicht**
  wegen Ungeeignetheit, sondern weil API-Basis/Auth/Parser fehlen.
- **BBSR** (Aktuelles/Publikationen/Themen-RSS) — zentrale Ressortforschung; heute Rot **nur wegen
  veralteter URLs (404)** — genau der Fall, der **nicht** aus fachlichen Gründen verworfen werden
  darf.
- **BMWSB RSS-Feed** und **BGBl RSS-Hub** — die maschinenlesbaren `.xml`-Feeds als Ersatz der
  jeweiligen Kat-1-HTML-Scrapes.
- **gesetze-im-internet.de Aktualitätendienst** — konsolidierte Normänderungs-Frühwarnung; heute
  Rot wegen Timeout (Re-Verifikation nötig).

### Kategorie 3 — Übergang (fachlich okay, später ersetzen)
Technisch heute nutzbar, aber Ziel ist ein besserer (meist Kat-2-)Weg:

- **Destatis HTML-Tabellen** (Bautätigkeit, Baupreisindex, Mieten, Wohngeld) → ersetzen durch
  GENESIS-API.
- **BBR Presse-Suchformular** → Ergebnis-Parser härten; ggf. durch reaktiviertes BBSR ersetzt.
- **BMWSB Wohnraumförderung** + **Förderdatenbank BMWSB** → auf **einen** Förder-Weg konsolidieren.
- **Städtebauförderung Portal** (Scrape) → Feed falls auffindbar.
- **`committee-bau-wohnen` Google-News** (Bestand) → breites Ergänzungsnetz, kein Primärbeleg.

### Kategorie 4 — Entfernen / nicht in den Pflichtkern
- **Redundanzen** (durch eine bessere Quelle abgedeckt): BMWSB aktuelle-meldungen, BMWSB
  publikationen, Destatis baugenehmigungen, Destatis wohnungsbestand, Städtebauförderung-Unterseite.
- **Statische Referenztexte** (kein Monitoring-Wert; Änderungen laufen über das BGBl): BauGB,
  BauNVO, GEG — als reine Nachschlage-Referenz optional, **nicht** im Monitoring-Kern.
- **Fachfremd** (Umsetzungs-/Marketingebene, keine Primärquelle): **KfW**, **BImA**.

> **Prinzip eingehalten:** Der Pflichtkern wurde bewusst auf 11 Quellen mit echtem Nutzen begrenzt
> (statt 28). Kat 4 ist überwiegend Redundanz-Konsolidierung, **nicht** fachliche Abwertung guter
> Herausgeber.

---

## 5. `future_target`-Liste (Kat 2) mit Fehlt-Katalog und Höherstufungs-Auslöser

| Quelle | Fachl. | Fehlt (§2 der Methodik) | Auslöser für Höherstufung → Kat 1 |
|---|:--:|---|---|
| Destatis **GENESIS-API** | A | API-Basis-URL · **Authentifizierung** (Registrierung/Kennung) · POST-fähiger Client · Parser (XML/CSV/JSON) | Endpunkt+Auth ermittelt, `structured_download`/`api`-Fetcher gebaut, CI-verifiziert |
| **BBSR** (Aktuelles/Publikationen/RSS) | A | **URL-Nachrecherche** (aktuelle Adressen) · idealerweise Themen-`.xml`-Feed | Aktuelle URL real verifiziert (HTTP 200 + Inhalt) |
| **BMWSB RSS-Feed** | A | konkrete `.xml`-Feed-Adresse (Landingpage war HTML) | Feed-URL aufgelöst + Parser `parseRssItems` grün |
| **BGBl RSS-Hub** | A | konkrete `.xml`-Feed-Adresse (Hub war HTML) | Feed-URL aufgelöst + Parser grün |
| **gesetze-im-internet Aktualitätendienst** | A− | Re-Verifikation (Timeout 12 s) · Listen-Parser | Erreichbarkeit mit höherem Timeout bestätigt |
| **DIP-Themenfilter** (Feld-Sicht) | A | serverseitige Themen-/Deskriptor-Filterung auf `lib/helmut/dip.js` | Feld-Filter definiert + getestet |

---

## 6. Antworten auf die sechs Pflichtfragen

### 1. Welche Quellen gehören zur endgültigen Zielarchitektur?
Alle fachlich **A/B** Primär- und Datenquellen — unabhängig vom heutigen Integrationsstand:
**BMWSB, BBSR, Destatis (mit GENESIS als Idealzugang), Deutscher Bundestag / DIP, Bundesamt für
Justiz / BGBl (recht.bund.de), gesetze-im-internet Aktualitätendienst, BBR, Städtebauförderung,
Förderdatenbank des Bundes.** Details in `wbsb-zielarchitektur.md`.

### 2. Welche Quellen bleiben Übergangslösungen?
Die **HTML-Scrape-Wege**, deren Idealzugang strukturiert ist: Destatis-Tabellen (→ GENESIS),
BMWSB-/BGBl-HTML-Listen (→ RSS), BBR-Suchformular, Städtebauförderung-/Förderdatenbank-Scrape,
Bundestag-Ausschuss-HTML (Ergänzung zu DIP) sowie der Google-News-Weg `committee-bau-wohnen`
(breites Netz). Sie **funktionieren jetzt**, sollen aber durch die strukturierten Wege ersetzt
werden.

### 3. Welche Quellen können später ersetzt werden?
**BBR** (Raumordnungs-Platzhalter — ersetzbar, sobald BBSR wieder verifiziert ist);
**BMWSB-Förderung vs. Förderdatenbank** (auf einen Weg konsolidieren); die **statischen
Gesetzestexte** (BauGB/BauNVO/GEG — durch BGBl/Aktualitätendienst abgedeckt); **KfW/BImA** sind
bereits ersetzt (Förderdatenbank bzw. gestrichen).

### 4. Welche Quellen sollten wir aktiv weiter erforschen?
- **BBSR** — aktuelle URLs + Themen-RSS-Feeds nachrecherchieren und real verifizieren.
- **GENESIS** — REST-Basis-URL, Registrierung/API-Kennung, XML/CSV/JSON-Parser.
- **Konkrete `.xml`-Feeds** für BMWSB und BGBl (GSB-`SharedDocs/RSS/…`-Muster).
- **DIP-Themenfilter** für das Feld (serverseitig, auf bestehender DIP-Anbindung).
- **gesetze-im-internet Aktualitätendienst** — Re-Verifikation mit höherem Timeout.
- **robots/Rate-Limit/rechtliche Prüfung** für das Scraping der bund.de-GSB-Seiten (realistischer
  User-Agent, kein Umgehen von Sperren).

### 5. Welche technischen Arbeiten sind nötig, um die Zielarchitektur vollständig umzusetzen?
1. **GENESIS-Anbindung:** Auth-/Kennungs-Handling, REST-Basis-URL, POST-fähiger Client,
   `structured_download`/`api`-Fetcher + Parser für die GENESIS-Tabellen.
2. **Feed-Auflösung:** konkrete `.xml`-Feeds (BMWSB, BGBl, BBSR-Themen) ermitteln; `html-scrape`
   durch `rss`/Atom ersetzen.
3. **BBSR-URL-Nachrecherche** + reale Verifikation.
4. **DIP-Themenfilterung** serverseitig (bestehender `lib/helmut/dip.js`-Client).
5. **BBR-Suchformular-Ergebnisparser** absichern.
6. **Freshness/Datums-Parsing** für HTML-Listen (heute `aktuell=unbekannt`).
7. **Live-Re-Verifikation je Weg** vor Aktivierung (Bot-Sperren 403/429, realistischer UA,
   robots-Konformität) — `verifyBeforeActivation`.
8. **Rechtliche/robots-Prüfung** des Scrapings (TOS/robots; DSGVO für amtliche Sachdaten
   nachrangig).
9. **Erst danach** der separate, freigabepflichtige Schritt: Paket `prepared → active`, Wege
   `needs_review/manual → healthy/auto`, Seed-Anwendung.

### 6. Trägt diese Bewertungsmethodik für ALLE künftigen Quellenpakete?
**Ja — mit den in der Methodik verankerten Verfeinerungen.** Details und die konkreten
Verbesserungen: nächster Abschnitt.

---

## 7. Eignung der Methodik für ALLE Pakete — Bewertung und vorgenommene Verbesserungen

Die Zwei-Achsen-Methodik (Fachliche Qualität A/B/C × Technische Integrationsreife Grün/Gelb/Rot →
4 Kategorien + `future_target`) ist **generisch** und ergänzt den bestehenden technischen
`quellenpaket-workflow.md` sauber (der die fachliche Ebene ausdrücklich offenließ). Am WBSB-Paket
hat sich die Methodik bewährt: Sie hat GENESIS und BBSR korrekt als **fachlich A / technisch noch
offen** eingeordnet, statt sie wegen 404/Timeout zu verwerfen.

**Beim Anwenden nachgeschärft** (bereits in `quellen-fachreview-methodik.md` eingearbeitet):

1. **Bewertungsgranularität getrennt:** fachliche Note am **Herausgeber/Rolle**, technische Note am
   **einzelnen Abrufweg**. Ohne diese Trennung landet eine A-Quelle (Destatis) fälschlich in einer
   niedrigen Kategorie, nur weil *ein* Weg (HTML-Scrape) unreif ist.
2. **Kategorie = Lebenszyklus des Wegs, nicht Wert der Quelle.** Eine A-Quelle darf für ihren
   Scrape-Weg in Kat 3 und für ihren Idealweg in Kat 2 stehen; die fachliche A bleibt auf Achse A.
3. **`future_target` als erstklassiger Status** definiert, inkl. Abbildung auf das reale Modell
   (Weg noch nicht angelegt **oder** `needs_review`/`manual` mit dokumentiertem Ziel-Upgrade), da
   die DB diesen Status nicht kennt.
4. **Fehlt-Katalog verpflichtend** (`API`/`Auth`/`Feed`/`Crawler`/`URL-Nachrecherche`/`Recht`): Jedes
   technische Rot **muss** benennen, was fehlt — so ist „nicht integriert" nie mit „ungeeignet"
   verwechselbar.
5. **Belegpflicht:** jede technische Note zitiert ihren realen Nachweis (HTTP + CI-Lauf/Datum).
6. **Redundanz-Regel:** „mehr Quellen ≠ besser" — Redundanz führt zu Kat 3/4, nicht zu künstlicher
   Kat-1-Aufblähung.

Diese Methodik ist damit ab sofort die **verbindliche Referenz** für den Fachreview aller
künftigen Quellenpakete.

---

## 8. Verweise

- Methodik: `docs/quellenarchitektur/quellen-fachreview-methodik.md`
- Zielarchitektur (ideal): `docs/quellenarchitektur/wbsb-zielarchitektur.md`
- Technische Herkunft des Pakets (PR #117): `docs/quellen/wohnen-bauen-stadtentwicklung-bund/`
  (`rechercheprotokoll.md`, `quellenpruefung.csv`, `implementierungsprotokoll.md`),
  `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung*.js`
- Struktur-/Modellebene: `docs/quellenarchitektur/02-zielarchitektur.md`
- Technischer Workflow: `docs/quellenarchitektur/quellenpaket-workflow.md`
- Verifikation: CI-Run **30079020728** (2026-07-24, Egress offen), Artefakt `wbsb-verifikation`
