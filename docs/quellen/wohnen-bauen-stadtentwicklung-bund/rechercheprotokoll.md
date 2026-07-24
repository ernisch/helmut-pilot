# Rechercheprotokoll — Quellenpaket `wohnen-bauen-stadtentwicklung-bund`

**Ebene:** Bund · **Geography:** Deutschland · **Sprint-Typ:** Pilot (Vorbereitung, keine Freigabe)
**Stand:** 2026-07-24 · **Status des Pakets:** `prepared` (technisch INAKTIV — `needs_review` / `manual`)

> Dieses Paket ist nach diesem Sprint **noch nicht freigegeben**. Die Freigabe erfolgt
> ausschließlich durch einen separaten Auditlauf.

---

## 1. Ziel und Scope

Aufbau des fachlichen Pflichtkerns an **offiziellen Bund-Primärquellen**, damit Helmut
relevante politische Entwicklungen in folgenden Bereichen erkennen kann:
Wohnen & Mietrecht, sozialer Wohnungsbau, Wohnraumförderung, Baupolitik, Baugesetzgebung,
Stadtentwicklung, Städtebauförderung, Raumordnung, Immobilien-/Wohnungsmarktdaten,
Baukosten & Bautätigkeit, relevante parlamentarische Vorgänge, Förderprogramme/Richtlinien.

**Nicht Bestandteil dieses Sprints:** Berlin/Brandenburg, Produktionsaktivierung,
DB-Ausführung, Migration, Deployment, Änderungen an bestehenden aktiven Quellen, Umbau der
Quellenarchitektur, automatische Freigabe.

**Nicht in den Pflichtkern** (Auftrag §2): Verbände, Unternehmen, Medien, Google News,
sonstige Sekundärquellen.

## 2. Bestandsabgleich (vor der Recherche)

Geprüft gegen `lib/helmut/sources.js` (v1Sources, 143 kuratierte Quellen) und die
Quellenarchitektur (`buildFullModel`):

- **Bereits vorhanden (nicht dupliziert):**
  - `committee-bau-wohnen` — Google-News-Themensuche „(Wohnungspolitik OR Mieten OR
    Wohnungsbau OR Mietpreisbremse OR Bauminister) …“, Typ `committee`, `neutral`, im Paket
    **bund-basis**. Das ist ein **Google-News-Ersatzweg** und wird bewusst **separat**
    behandelt (Auftrag §5) — er bleibt unverändert im Bestand.
  - `bundle-ausschuss-wohnungslosigkeit` — Themen-Bündel im Paket **arbeit-und-soziales**.
  - Entität `committee-bt-bau-wohnen` („Ausschuss für Bauen und Wohnen", Bund) — existiert.
  - Herausgeber **destatis.de** (Statistisches Bundesamt) und **bundestag.de** (Deutscher
    Bundestag) existieren bereits → in diesem Paket **wiederverwendet**, nicht dupliziert.
  - **DIP-API** (`rp-dip`, `search.dip.bundestag.de/api/v1`, `healthy`, `always_on`, bund-basis)
    deckt parlamentarische Vorgänge bereits ab → **wiederverwendet** (kein zweiter DIP-Weg;
    `api`-Methode wird vom Quellen-Crawl ohnehin ausgeschlossen, DIP läuft über `lib/helmut/dip.js`).
- **Fachliche Vorgaben** für „Wohnen, Bauen, Stadtentwicklung": keine eigene Quellenliste im
  Repo; das Thema war bislang nur über den o. g. Google-News-Committee-Weg abgedeckt.

**Fazit:** Es existierte **kein** offizieller Bau-/Wohnungs-Primärherausgeber. Der Pilot legt
den Pflichtkern erstmals an — additiv, ohne Bestand zu verändern.

## 3. Suchstrategie

1. **Kandidaten-Discovery ausschließlich über WebSearch** (14 thematische Beats parallel +
   Vollständigkeitskritik). Grund: In der Agent-Sandbox ist der Egress durch die
   Netzwerk-Policy blockiert (curl → HTTP 000, WebFetch → 403 für **alle** Hosts inkl.
   Wikipedia/Bundestag/Destatis). Es wurden **nur reale URLs aus WebSearch-Ergebnissen**
   (Titel/Link/Snippet) übernommen — **keine** aus Namensmustern abgeleiteten URLs.
2. **Reale technische Verifikation auf einem GitHub-Actions-Runner mit offenem Egress**
   (etabliertes Repo-Muster, vgl. Sprint 9B): `scripts/wohnen-bauen-stadtentwicklung-verify.js`
   prüft je Kandidat HTTP-Status, Weiterleitungskette, finale URL, Content-Type, Retrieval-Typ,
   verwertbaren Inhalt (RSS/Atom via Produktionsparser `crawler.parseRssItems`; JSON/XML-API;
   HTML-Liste/Suche; PDF) und Aktualität. Ein **Egress-Gate** (Kontroll-URLs example.com/
   google.com) verhindert erfundene Urteile.
   - **Lauf:** Actions-Run `30079020728` (PR #116), 2026-07-24T08:29Z. Egress **OFFEN**
     (Kontrolle: example.com = HTTP 200, google.com = HTTP 200).
   - **Ergebnis:** 28 Kandidaten · 24 real verifiziert · 19 „geeignet mit Einschränkung" ·
     5 „ablehnen" · 4 „nicht_verifizierbar" (Timeouts).
3. **Fachliche Auswahl** des Pflichtkerns aus den real erreichbaren, thematisch passenden
   offiziellen Primärquellen; Konsolidierung von Redundanzen; bewusste Ablehnung fachfremder
   bzw. nicht-primärer Quellen.

Vollständige Roh-/Prüfdaten: `quellenpruefung.csv` (28 Zeilen mit echten HTTP-Ergebnissen).

## 4. Finaler Pflichtkern (11 aufgenommene Quellen)

Alle Wege real geprüft (HTTP 200), Retrieval-Typ `html_liste`/`html_suche`, Parser
`html-scrape`, Status **`needs_review`**, Aktivierung **`manual`**, `is_critical=false`
(technisch INAKTIV). „geeignet mit Einschränkung" = erreichbar + inhaltsreich, aber
HTML-Scrape (kein stabiler Feed real auffindbar).

| # | Herausgeber (Domain) | Quellenrolle | Abgedeckter Auftrags-Bereich | HTTP |
|---|---|---|---|---|
| 1 | BMWSB (`bmwsb.bund.de`) | Pressemitteilungen | Baupolitik, Wohnen, Stadtentwicklung (Ressort-Primär) | 200 |
| 2 | BMWSB (`bmwsb.bund.de`) | Förderprogramme Wohnen | sozialer Wohnungsbau, Wohnraumförderung | 200 |
| 3 | BBR (`bbr.bund.de`) | Pressemitteilungen (Suchformular) | Raumordnung, Bundesbau | 200 |
| 4 | Destatis (`destatis.de`) | Bautätigkeit (Übersicht) | Bautätigkeit (Genehmigungen/Fertigstellungen) | 200 |
| 5 | Destatis (`destatis.de`) | Baupreisindex | Baukosten | 200 |
| 6 | Destatis (`destatis.de`) | Wohnen (Mieten/Wohnkosten) | Immobilien-/Wohnungsmarktdaten, Mietrecht | 200 |
| 7 | Destatis (`destatis.de`) | Wohngeld-Statistik | Wohnraumförderung/Wohngeld | 200 |
| 8 | Bundesamt für Justiz (`recht.bund.de`) | Bundesgesetzblatt Teil I — Verkündungsliste | Baugesetzgebung, offizielle Gesetzesquelle | 200 |
| 9 | Deutscher Bundestag (`bundestag.de`) | Ausschuss Wohnen/Stadtentwicklung/Bauwesen/Kommunen | parlamentarische Vorgänge | 200 |
| 10 | Städtebauförderung (`staedtebaufoerderung.info`) | Bund-Länder-Portal (Aktuelles/Programme) | Stadtentwicklung, Städtebauförderung | 200 |
| 11 | Förderdatenbank des Bundes (`foerderdatenbank.de`) | BMWSB-Förderprogramme | Förderprogramme/Richtlinien | 200 |

**Zuordnung je Quelle:** eindeutiger Herausgeber · Rolle wie oben · Geography Deutschland ·
Ebene Bund · Retrieval `html` · Format HTML-Liste/-Suche · Aktualisierung laufend/periodisch ·
Parser `html-scrape` · Aktivierungsstatus `needs_review`/`manual` (inaktiv). Dubletten-Hinweise
siehe `quellenpruefung.csv` und `implementierungsprotokoll.md`.

### Fachliche Begründung je Quelle
1. **BMWSB Pressemitteilungen** — zuständiges Bundesressort; Erstquelle für Gesetzentwürfe,
   Programm- und Ministerentscheidungen zu Wohnen/Bauen/Stadtentwicklung.
2. **BMWSB Wohnraumförderung** — ressorteigene Übersicht der Förderprogramme (sozialer
   Wohnungsbau, Neubau, Wohngeld) — Frühindikator für förderpolitische Änderungen.
3. **BBR Pressemitteilungen** — nachgeordnete Bundesbehörde für Bundesbau und **Raumordnung**
   (der einzige verifizierte Träger des Raumordnungs-Bereichs; BBSR fiel technisch aus, s. u.).
4. **Destatis Bautätigkeit** — amtlicher Kernindikator (Genehmigungen/Fertigstellungen) für die
   Wohnungsbau-Zielerreichung.
5. **Destatis Baupreisindex** — amtliche Baukosten-/Baupreisentwicklung.
6. **Destatis Wohnen (Mieten)** — amtliche Wohnungsmarkt-/Mietdaten (Basis für mietpolitische
   Bewertung).
7. **Destatis Wohngeld** — amtliche Wohngeld-Statistik (Wohnraumförderung).
8. **Bundesgesetzblatt Teil I (recht.bund.de)** — amtliche Verkündung neuer Bundesgesetze/
   -verordnungen (seit 2023 ausschließlich hier) — Primärquelle für in Kraft getretene
   Baugesetzgebung.
9. **Bundestag-Bauausschuss** — parlamentarischer Fachausschuss; Ort der Gesetzesberatung und
   Anhörungen (ergänzt die bestehende DIP-API-Abdeckung parlamentarischer Vorgänge).
10. **Städtebauförderung (Bund-Länder-Portal)** — offizielles Programmportal (Verwaltungs-
    vereinbarungen, Mittelverteilung, Programme).
11. **Förderdatenbank des Bundes (Fördergeber BMWSB)** — amtliche, neutrale und vollständige
    Sicht der Bundes-Förderprogramme Bauen/Wohnen/Städtebau.

## 5. Geprüfte, aber abgelehnte Kandidaten (17)

Alle Ablehnungen mit echtem HTTP-Beleg in `quellenpruefung.csv`.

**A) Technisch nicht nutzbar (real geprüft):**
- **BBSR — `rssnewsfeed_node`, `NeueVeroeffentlichungen`, `Aktuell` (alle HTTP 404):** die per
  WebSearch gefundenen BBSR-URLs sind veraltet/umgezogen. **Folge-Risiko:** BBSR (zentrale
  Ressortforschung Wohnungsmarkt/Stadtentwicklung/Raumbeobachtung) ist derzeit **nicht** im
  Pflichtkern → offene Nachrecherche (siehe §6). Raumordnung ist über BBR abgedeckt.
- **BMWSB RSS-Landingpage `rss.html` (HTTP 200, aber `text/html`):** keine Feed-Datei, sondern
  Übersichtsseite; konkrete `.xml`-Feed-Adresse nicht per Suche belegt → BMWSB via
  HTML-Presseliste aufgenommen.
- **BGBl RSS-Hub `rss_node.html` (HTTP 200, aber `text/html`):** kein Feed → Gesetzgebung über
  die HTML-Verkündungsliste (Teil I) aufgenommen.
- **Gesetze im Internet — `aktuDienst.html`, `bbaug` (BauGB), `baunvo`, `geg` (alle
  `nicht_verifizierbar`, Timeout 12 s):** Egress war offen (Kontrolle 200), d. h. echte
  Zeitüberschreitungen der Zielseite auf dem Runner. Nicht aufgenommen (kein bestätigter
  Inhalt); Baugesetzgebung ist über das Bundesgesetzblatt (recht.bund.de) abgedeckt. BauGB/
  BauNVO/GEG sind zudem **statische** Referenztexte (geringe Eigen-Aktualität; Änderungen
  laufen über das BGBl).

**B) Erreichbar, aber bewusst nicht aufgenommen (Konsolidierung/Redundanz):**
- BMWSB `aktuelle-meldungen`, BMWSB `publikationen` — redundant zur BMWSB-Presseliste.
- Destatis `baugenehmigungen` — in der Bautätigkeits-Übersicht enthalten.
- Destatis `wohnungsbestand` — in der Wohnen-Tabellenübersicht enthalten.
- Destatis `genesis-api` (Beschreibungsseite) — REST-Basis-URL nicht per Suche belegt (nicht
  erfunden); als Referenz für spätere strukturierte Anbindung notiert.
- `staedtebaufoerderung-programme` — redundant zur Portal-Startseite.

**C) Fachfremd / nicht Primärquelle (bewusst mitgeprüft, HTTP 200):**
- **KfW — Förderprodukte Bestandsimmobilie:** Umsetzungs-/Marketingebene einer Förderbank,
  keine politische Primärquelle; die Förderlandschaft ist neutraler/vollständiger über die
  Förderdatenbank des Bundes abgedeckt.
- **BImA — Pressemeldungen:** operativer Immobilienverwalter des Bundes (Umsetzungsebene),
  keine bau-/wohnungspolitische Primärquelle; zusätzlich fragile Hash-URLs.

> **Grundsatz eingehalten:** Mehr Quellen sind nicht automatisch besser — der Pflichtkern
> wurde auf Quellen mit echtem Nutzen begrenzt (11 statt 28).

## 6. Offene fachliche Risiken (für den Auditor)

1. **BBSR-Lücke:** Die zentrale Ressortforschungseinrichtung (Wohnungsmärkte, Stadtentwicklung,
   laufende Raumbeobachtung) fehlt, weil die gefundenen URLs 404 lieferten. **Nachrecherche der
   aktuellen BBSR-URLs** (Aktuelles/Publikationen/RSS) empfohlen.
2. **Kein maschinenlesbarer Feed:** Alle 11 Pflichtkern-Wege sind HTML-Listen/-Suchen
   (`html-scrape`) — kein sauberer RSS/Atom/JSON-Feed real auffindbar. Scrape/DOM-Selektoren
   sind fragil; vor Aktivierung sollten die konkreten `.xml`-Feeds (GSB-`SharedDocs/RSS/…`) bzw.
   die GENESIS-REST-Basis und die DIP-Themenfilterung serverseitig ermittelt werden.
3. **Aktualität nicht maschinell gemessen:** Bei HTML-Listen konnte das Prüfskript kein
   Item-Datum parsen → Spalte `aktuell` = „unbekannt (HTML)". Freshness bei Aktivierung prüfen.
4. **`gesetze-im-internet.de`-Timeouts:** einmalige Zeitüberschreitung (12 s) auf dem Runner —
   erneute Prüfung mit höherem Timeout empfohlen, falls die statischen Gesetzestexte doch
   gewünscht sind.
5. **Bot-Sperren bei Aktivierung:** bund.de-GSB-Seiten können bei echten Crawls
   403/429 liefern (realistischer User-Agent nötig, keine Umgehung) — vor Produktivnahme
   pro Weg re-verifizieren (`verifyBeforeActivation`).
6. **BBR-Presse finale URL** ist ein Suchformular (`…PressemitteilungenSuche_Formular.html`);
   Ergebnis-Parsing vor Aktivierung absichern.

## 7. Verifikations-Nachweis

- Skript: `scripts/wohnen-bauen-stadtentwicklung-verify.js` (+ Offline-Selbsttest
  `…-verify-test.js`, 14 Fälle).
- Workflow: `.github/workflows/wohnen-bauen-stadtentwicklung-verify.yml`
  (`workflow_dispatch` + `pull_request`, `permissions: contents: read`, keine Secrets).
- Lauf: GitHub-Actions-Run **30079020728** (PR #116), 2026-07-24 · Egress OFFEN ·
  Artefakt `wbsb-verifikation` (`wbsb-verify-report.json`).
- Kandidaten-Rohdaten: `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten.js`.
