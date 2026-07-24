# WBSB-Zielarchitektur — ideale Langfrist-Quellenarchitektur `wohnen-bauen-stadtentwicklung-bund`

**Stand:** 2026-07-24 · **Ebene:** Bund · **Sicht:** rein fachlich, ideal

> **Was dieses Dokument beschreibt — und was nicht.**
> Es beschreibt **ausschließlich** die ideale langfristige Quellenarchitektur des Felds Wohnen /
> Bauen / Stadtentwicklung auf Bundesebene. Es beschreibt **nicht** den aktuellen technischen
> Stand und **nicht** die aktuelle Implementierung.
>
> Leitfrage: **„Wenn keinerlei technische Einschränkungen existieren würden — welche Quellen würden
> wir verwenden?"**
>
> Der heutige Integrationsstand (HTML-Scrape, `prepared`/inaktiv, 11 Wege) steht im **Fachreview**
> (`wbsb-fachreview.md`) und im technischen **Rechercheprotokoll** (PR #117). Hier geht es um das
> Ziel, nicht um den Weg. Die technische Umsetzung ist NICHT die Wahrheit über dieses Ziel.

---

## 1. Prinzipien der Zielarchitektur

1. **Amtliche Primärquellen zuerst.** Das Feld wird von seinen Erstquellen getragen (Ministerium,
   Fachbehörden, Statistikamt, Parlament, amtliche Verkündung) — nicht von Aggregatoren oder
   Umsetzungsebenen.
2. **Strukturierter Zugang vor Scrape.** Wo eine Quelle einen maschinenlesbaren Zugang bietet
   (API/RSS/Atom/XML/strukturierter Download), ist **dieser** der Zielzustand — HTML-Scrape ist
   allenfalls Übergang.
3. **Ein Herausgeber, mehrere Abrufwege.** Die ideale Quelle bleibt dieselbe, auch wenn der
   ideale Abrufweg heute noch nicht steht (Trennung Herausgeber ↔ Abrufweg).
4. **Redundanz vermeiden.** Jede Rolle wird genau einmal ideal besetzt; Doppelabdeckungen werden
   konsolidiert.
5. **Neutralität/Zitierfähigkeit.** Jede Zielquelle muss in einem Briefing zitierfähig sein.

---

## 2. Die Zielquellen (ideal), je mit Begründung und Fehlt-Analyse

Legende Zielzugang: **✅ steht** · **◻ future_target** (fachlich gesetzt, technisch noch offen).

### 2.1 BMWSB — Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen
**Warum langfristig?** Das **zuständige Bundesressort** — die Primärquelle für Gesetzentwürfe,
Förderprogramme und Ministerentscheidungen des gesamten Felds. Ohne BMWSB ist das Paket nicht
denkbar.
**Idealer Zugang:** ◻ **RSS-Feed** des Ministeriums (maschinenlesbar, Presse + Meldungen).
**Was fehlt?** Die konkrete `.xml`-Feed-Adresse — die RSS-Landingpage liefert nur HTML. → **Feed**.
**Übergang bis dahin:** HTML-Presseliste (steht, Kat 1).

### 2.2 BBSR — Bundesinstitut für Bau-, Stadt- und Raumforschung
**Warum langfristig?** Die **zentrale Ressortforschung** zu Wohnungsmärkten, Stadtentwicklung und
laufender Raumbeobachtung — der wichtigste **analytische** Frühindikator des Felds und der
eigentliche Träger des Raumordnungs-/Marktbeobachtungs-Bereichs.
**Idealer Zugang:** ◻ Themen-**RSS-Feeds** (Raum-/Stadtentwicklung, Wohnungsmärkte, Bauen) bzw.
Publikations-/Aktuelles-Liste.
**Was fehlt?** Die per Recherche gefundenen URLs sind **veraltet (404)**. → **URL-Nachrecherche**,
danach Feed. *Ausdrücklich:* BBSR ist **fachlich A** und gehört in die Zielarchitektur — der 404
ist ein Integrationsproblem, kein fachlicher Ausschlussgrund.

### 2.3 Destatis — Statistisches Bundesamt (GENESIS)
**Warum langfristig?** Die **amtliche Datenbasis** für Bautätigkeit, Baupreisindex, Mieten/Wohnkosten
und Wohngeld — das statistische Rückgrat jeder baupolitischen/mietpolitischen Bewertung.
**Idealer Zugang:** ◻ **GENESIS-Online-API/Webservice** — maschinelle Abfrage der Bau-/Wohn-Zeitreihen
als **XML/JSON/CSV** statt HTML-Tabellen-Scrape. Ein Zugang deckt alle vier Destatis-Rollen ab.
**Was fehlt?**
- **API-Basis-URL** (REST-Endpunkt) — heute nur die Beschreibungsseite verifiziert; der Endpunkt
  wurde bewusst nicht erfunden.
- **Authentifizierung** — GENESIS erfordert Registrierung/Kennung.
- ggf. **POST statt GET** und ein **Parser** für das GENESIS-Antwortformat.
→ **API · Auth · Crawler/Parser**. *Lehrbuchfall Kategorie 2 / future_target.*
**Übergang bis dahin:** HTML-Tabellenlisten (stehen, Kat 3).

### 2.4 Deutscher Bundestag — parlamentarische Vorgänge (DIP) + Fachausschuss
**Warum langfristig?** Das **parlamentarische Rückgrat**: Gesetzentwürfe, Drucksachen, Anträge,
Anhörungen. Der Fachausschuss ist der Ort der Gesetzesberatung.
**Idealer Zugang:**
- ✅ **DIP-API** (`api`, bereits aktiv) — die strukturierte Primärquelle parlamentarischer Vorgänge.
- ◻ **DIP-Themenfilter** für das Feld (serverseitige Deskriptor-/Themenfilterung), damit nur die
  bau-/wohnungsrelevanten Vorgänge einlaufen.
- ✅ **Ausschuss-Seite** als Ergänzung (Anhörungen/Tagesordnungen, die die generische DIP-Sicht nicht
  fein genug abbildet).
**Was fehlt?** Nur der **Themenfilter** (Feld-Sicht) — die API selbst steht. → **Crawler/Filter**.

### 2.5 Bundesamt für Justiz — Verkündungsplattform des Bundes (recht.bund.de / BGBl)
**Warum langfristig?** Die **amtliche Verkündung** neuer Bundesgesetze/-verordnungen (seit 2023
ausschließlich hier) — die rechtsverbindliche Primärquelle für in Kraft getretene Baugesetzgebung.
**Idealer Zugang:** ◻ **RSS-Feed** neuer Verkündungen (BGBl Teil I).
**Was fehlt?** Konkrete `.xml`-Feed-Adresse (der RSS-Hub lieferte HTML). → **Feed**.
**Übergang bis dahin:** HTML-Verkündungsliste (steht, Kat 1).

### 2.6 Bundesamt für Justiz — Gesetze im Internet (Aktualitätendienst)
**Warum langfristig?** Die **konsolidierte Normänderungssicht** — erkennt Änderungen an
BauGB/BauNVO/WoFG/GEG **ohne Einzelgesetz-Polling**. Ergänzt das BGBl um eine normbezogene
Frühwarnung.
**Idealer Zugang:** ◻ Aktualitätendienst-Liste (maschinell geparst), idealerweise als Feed.
**Was fehlt?** **Re-Verifikation** (auf dem Prüf-Runner Timeout nach 12 s) und ein **Listen-Parser**.
→ **URL-Re-Verifikation · Crawler/Parser**.
**Hinweis:** Die **Volltexte** BauGB/BauNVO/GEG selbst sind statische Referenztexte und gehören
**nicht** in den Monitoring-Kern — nur als Nachschlage-Referenz.

### 2.7 Bundesamt für Bauwesen und Raumordnung (BBR)
**Warum langfristig?** Nachgeordnete Bundesbehörde für **Bundesbau und Raumordnung**. In der
Zielarchitektur mit **B**: eigenständig relevant für Bundesbau, aber im Raumordnungs-/Marktbereich
teils **Platzhalter für BBSR**. Bleibt für die Bundesbau-Presseschiene.
**Idealer Zugang:** ✅/◻ Presseliste; der reale Endpunkt ist ein **Suchformular** → **Ergebnis-Parser**
härten.
**Konsolidierung:** Sobald BBSR (2.2) wieder integriert ist, wird BBR im Raumordnungsteil
nachrangig (Ersetzungskandidat für diese Rolle).

### 2.8 Städtebauförderung — Bund-Länder-Portal
**Warum langfristig?** Das offizielle **Programmportal** der Städtebauförderung
(Verwaltungsvereinbarungen, Mittelverteilung, Programme). Primär für die Stadtentwicklungs-/
Städtebauförderungs-Schiene (**B**).
**Idealer Zugang:** ◻ Feed, falls das Portal einen bietet; sonst Scrape der Startseite.
**Was fehlt?** Prüfung auf einen Feed. → **Feed (optional)**.

### 2.9 Förderdatenbank des Bundes
**Warum langfristig?** Die **neutrale, vollständige** amtliche Sicht der Bundes-Förderprogramme
(Fördergeber BMWSB) — der Referenzbestand der Förderlandschaft (**B**, `data_source`).
**Idealer Zugang:** ◻ strukturierter Export/Filter-URL statt HTML.
**Konsolidierung:** überschneidet sich mit der BMWSB-eigenen Förderliste (2.1) — in der
Zielarchitektur wird **eine** Förder-Rolle ideal besetzt (die neutrale Förderdatenbank), die
Ministeriums-Förderliste entfällt als eigener Weg.

---

## 3. Bewusst NICHT in der Zielarchitektur (mit Begründung)

| Quelle | Warum nicht |
|---|---|
| **KfW** (Förderprodukte) | Umsetzungs-/Marketingebene einer Förderbank, keine politische Primärquelle. Förderlandschaft neutraler über die Förderdatenbank abgedeckt. |
| **BImA** (Pressemeldungen) | Operativer Immobilienverwalter des Bundes (Umsetzungsebene), keine bau-/wohnungspolitische Primärquelle; fragile Hash-URLs. |
| **BauGB/BauNVO/GEG Volltexte** | Statische Referenztexte ohne Eigen-Aktualität; Änderungen laufen über BGBl/Aktualitätendienst. Nur Nachschlage-Referenz, kein Monitoring. |
| **Google News als Herausgeber** | Aggregator/Suchweg, kein Herausgeber (Modell-Regel). Der bestehende `committee-bau-wohnen`-Themenweg bleibt als **breites Ergänzungsnetz**, nicht als Primärbeleg. |
| **Verbände/Unternehmen/Medien** | Nicht Gegenstand des amtlichen Bund-Pflichtkerns; ggf. eigenes Fachpaket, klar getrennt. |

---

## 4. Idealbild in einem Satz je Rolle

| Rolle im Feld | Ideale Quelle | Idealer Zugang | Status |
|---|---|---|:--:|
| Ressortpolitik (Gesetze/Programme) | BMWSB | RSS-Feed | ◻ future_target |
| Marktbeobachtung/Forschung | BBSR | Themen-RSS | ◻ future_target |
| Amtliche Kennzahlen | Destatis | GENESIS-API | ◻ future_target |
| Parlamentarische Vorgänge | Bundestag/DIP | DIP-API (+ Themenfilter) | ✅ / ◻ Filter |
| Anhörungen/Beratung | Bundestag-Bauausschuss | HTML-Liste | ✅ |
| Baugesetzgebung (Verkündung) | recht.bund.de / BGBl | RSS-Feed | ◻ future_target |
| Normänderungs-Frühwarnung | gesetze-im-internet | Aktualitätendienst | ◻ future_target |
| Bundesbau/Raumordnung | BBR (→ BBSR) | Presse (Parser) | ✅ (Platzhalter) |
| Städtebauförderung | Portal Bund-Länder | Feed/Scrape | ✅ |
| Förderlandschaft | Förderdatenbank | strukturierter Export | ◻ future_target |

---

## 5. Was von „ideal" heute noch trennt (aggregierter Fehlt-Katalog)

Damit die Zielarchitektur **vollständig** wird, sind ausschließlich **technische** Arbeiten nötig —
keine fachlichen Neubewertungen:

1. **GENESIS:** API-Basis-URL, Authentifizierung/Kennung, POST-fähiger Client, Antwort-Parser.
2. **Feeds auflösen:** BMWSB, BGBl, BBSR-Themen → konkrete `.xml`-Adressen; RSS/Atom-Fetcher statt
   `html-scrape`.
3. **BBSR:** aktuelle URLs nachrecherchieren + real verifizieren.
4. **DIP:** serverseitigen Themenfilter für das Feld definieren.
5. **BBR:** Suchformular-Ergebnisparser absichern.
6. **Förderdatenbank:** strukturierten Export/Filter prüfen; Förder-Rolle konsolidieren.
7. **Querschnitt:** Freshness/Datums-Parsing, Live-Re-Verifikation (Bot-Sperren/robots),
   rechtliche/robots-Prüfung des Scrapings, dann der separate freigabepflichtige Aktivierungsschritt.

> **Kernaussage.** Die Zielarchitektur ist fachlich **heute schon vollständig bestimmt**. Jede
> Lücke zum Ideal ist ein **Integrations-Ticket** (API/Auth/Feed/Crawler/URL/Recht) — keine offene
> fachliche Frage. Kein amtlicher Primärherausgeber (GENESIS/BBSR eingeschlossen) wird wegen eines
> einzelnen 404 oder Timeouts aus dieser Architektur entfernt.

---

## 6. Verweise
- Fachreview (Bewertung + Kategorien): `docs/quellenarchitektur/wbsb-fachreview.md`
- Methodik: `docs/quellenarchitektur/quellen-fachreview-methodik.md`
- Technische Herkunft (PR #117): `docs/quellen/wohnen-bauen-stadtentwicklung-bund/`,
  `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung*.js`
- Modell/Struktur: `docs/quellenarchitektur/02-zielarchitektur.md`
