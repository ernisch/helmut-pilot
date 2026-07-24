# Fachreview — Quellenpaket `wohnen-bauen-stadtentwicklung-bund` (WBSB)

**Ziel:** erstes **produktionsreifes Referenzpaket**. Alle weiteren Quellenpakete werden nach
diesem Muster aufgebaut.
**Ebene:** Bund · **Geography:** Deutschland · **Status:** `prepared` (technisch **INAKTIV** —
alle Wege `needs_review` / `manual`, `is_critical=false`).
**Stand:** 2026-07-24 · **Reviewtyp:** rein fachlich (kein Workflow-/Registry-/Generator-Umbau).
**Basis:** `main` nach dem Merge von PR #117 (Quellenarchitektur technisch abgeschlossen).

> Dieses Review betrifft ausschließlich die **fachliche Qualität** des Pakets. Die technische
> Quellenarchitektur (Registry, Generatoren, Testarchitektur) bleibt unverändert; geändert
> wurden nur die **Paketdaten** dieses einen Pakets und die davon **zwingend** abhängigen
> Paket-Assertions/Seeds.

---

## 0. Verifikationsrealität (ehrlich, vorab)

Die Agent-Sandbox blockt ausgehenden Egress per Organisations-Policy: `curl` → `403 CONNECT`,
`WebFetch` → `403` für **alle** `.bund.de`/`.de`-Hosts. **Nur `WebSearch`** ist verfügbar.
Reale HTTP-Verifikation (Status, Content-Type, Feed-Wohlgeformtheit) läuft daher — wie schon im
Vorsprint — **auf einem GitHub-Actions-Runner mit offenem Egress**
(`.github/workflows/wohnen-bauen-stadtentwicklung-verify.yml` → `scripts/wohnen-bauen-
stadtentwicklung-verify.js`, Egress-Gate über Kontroll-URLs).

Daraus folgen zwei **Ehrlichkeitsregeln**, die dieses Review durchgehend einhält:

1. **Keine erfundenen URLs.** Übernommen wurden nur reale WebSearch-Treffer bzw. amtlich
   dokumentierte Endpunkte. Wo ein struktureller Feed nachweislich *existiert*, seine konkrete
   `.xml`-Adresse aber aus der Sandbox nicht auflösbar ist (GSB-`nn`-ID), wird die **Zielmethode**
   dokumentiert und die Auflösung als **Aktivierungs-Gate** markiert — nicht geraten.
2. **Kein erfundenes Prüfurteil.** Bestehende Wege tragen das **echte** CI-Ergebnis des Vorlaufs
   (Actions-Run `30079020728`, 2026-07-24, HTTP 200). **Neue** Wege (BBSR, GENESIS, gii-toc)
   tragen `recherchiert_unverifiziert` und werden vor Aktivierung real geprüft.

Konsequenz für die Referenz-Eignung: Das Paket ist **fachlich** referenzreif; die **letzte
HTTP-Verifikation der neuen/geänderten Wege** ist Teil des ohnehin freigabepflichtigen
Aktivierungsschritts (`verifyBeforeActivation`).

---

## 1. Vollständige Fachanalyse je Quelle (§1)

Legende: ✔ ja · ✘ nein · ~ teilweise/eingeschränkt · „Feed vorh.?“ = maschinenlesbarer Feed
(RSS/Atom/JSON/API) real vorhanden.

### 1a. Analyse-Matrix (14 Prüffragen, verdichtet)

| # | Quelle | off. Herausg. | Bund | thematisch | dauerhaft erreichb. | RSS | Atom | JSON/API | Sitemap | HTML-Scrape nötig | robots-konform | Aktualisierung | Veröff.-Qualität | Dublette | bessere Alternative |
|---|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|---|---|---|
| 1 | BMWSB Pressemitteilungen | ✔ | ✔ | ✔ hoch | ✔ | ✔ (GSB) | ✘ | ✘ | ✔ | ~ (bis RSS) | ✔ | laufend | hoch | nein | RSS-Feed (Ziel) |
| 2 | BMWSB Wohnraumförderung | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | periodisch | mittel | ~ (Förderdatenbank) | — |
| 3 | BBSR Aktuelles/Presse | ✔ | ✔ | ✔ hoch | ✔ (URL neu) | ✔ (GSB/IDW) | ✘ | ✘ | ✔ | ~ (bis RSS) | ✔ | laufend | hoch | nein | RSS/IDW (Ziel) |
| 4 | BBR Pressemitteilungen | ✔ | ✔ | ✔ | ✔ | ✔ (GSB) | ✘ | ✘ | ✔ | ~ | ✔ | laufend | mittel | ~ (BBSR-Familie) | RSS (Ziel) |
| 5 | Destatis GENESIS REST-API | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ (REST) | n/a | ✘ | ✔ | periodisch | hoch (Daten) | Superset v. 6/7 | — (ist die Alternative) |
| 6 | Destatis Bautätigkeit (HTML) | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ (GENESIS) | ✔ | ✔ | ✔ | periodisch | hoch (Daten) | ~ (in GENESIS) | GENESIS-API |
| 7 | Destatis Wohnen/Mieten (HTML) | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ (GENESIS) | ✔ | ✔ | ✔ | periodisch | hoch (Daten) | ~ (in GENESIS) | GENESIS-API |
| 8 | Bundesgesetzblatt Teil I | ✔ | ✔ | ✔ hoch | ✔ | ✔ (3 Feeds dok.) | ✘ | ~ (ELI; XML geplant) | ✔ | ~ (bis RSS) | ✔ | laufend | hoch | nein | RSS Teil I (Ziel) |
| 9 | gii-toc.xml (Normindex) | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ (XML) | n/a | ✘ | ✔ | laufend* | hoch (Referenz) | ~ (vs. BGBl) | — (ist die Alternative) |
| 10 | Städtebauförderung Portal | ✔ | ✔ | ✔ | ✔ | ~ (GSB mögl.) | ✘ | ✘ | ✔ | ✔ | ✔ | laufend | mittel | ~ (BMWSB-Stadt) | RSS (prüfen) |
| 11 | Förderdatenbank (BMWSB) | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | periodisch | mittel | ~ (BMWSB-Förd.) | — |

\* gii-toc.xml ist ein *Norm-Index* (ändert sich, wenn irgendeine Norm geändert wird) — als
**News**-Frühwarnung nachrangig, als **strukturierte Änderungserkennung** wertvoll.

### 1b. Fachliche Einzelbewertung (Kurzform)

1. **BMWSB Pressemitteilungen** — zuständiges Bundesressort; Erstquelle für Gesetzentwürfe,
   Programm-/Ministerentscheidungen. **Kernquelle.** GSB-RSS existiert → Ziel `rss`.
2. **BMWSB Wohnraumförderung** — ressorteigene Förderübersicht; überschneidet sich mit der
   neutraleren Förderdatenbank → **optional**.
3. **BBSR Aktuelles/Presse** — zentrale Ressortforschung (Wohnungs-/Immobilienmärkte,
   Stadtentwicklung, Raumbeobachtung). **Vom Auditor vermisst → ergänzt.** GSB-RSS + IDW-Feed.
4. **BBR Pressemitteilungen** — Bundesbau/Raumordnung (nachgeordnete Behörde). Behördenfamilie
   mit BBSR, Rollen getrennt. Finale URL ist ein Suchformular → Ergebnis-Parsing absichern.
5. **Destatis GENESIS REST-API** — **strukturierter Superset** aller amtlichen Bau-/Wohn-
   Statistiken. Ersetzt fragile HTML-Tabellen-Scrapes; POST + kostenfreier Token (Aktivierung).
6. **Destatis Bautätigkeit (HTML)** — amtlicher Kernindikator der Wohnungsbau-Zielerreichung;
   **keyfreier Faktenbeleg** neben GENESIS. Daten-Grounding, keine News.
7. **Destatis Wohnen/Mieten (HTML)** — amtliche Miet-/Wohnkostendaten (mietpolitische Bewertung);
   keyfreier Faktenbeleg neben GENESIS. Daten-Grounding, keine News.
8. **Bundesgesetzblatt Teil I (recht.bund.de)** — amtliche Verkündung neuer Bundesgesetze (seit
   2023 ausschließlich hier). **Kernquelle.** 3 dokumentierte RSS-Feeds → Ziel `rss` (Teil I).
9. **gii-toc.xml** — maschinenlesbarer XML-Index aller geltenden Bundesnormen (BauGB/BauNVO/GEG/
   WoFG). Strukturierte Änderungserkennung ohne Einzelgesetz-Polling; **Referenz**.
10. **Städtebauförderung (Bund-Länder-Portal)** — Programmneuigkeiten, Verwaltungsvereinbarungen,
    Mittelverteilung. GSB → RSS am Runner prüfen.
11. **Förderdatenbank des Bundes (Fördergeber BMWSB)** — neutrale, vollständige Sicht der
    Bundes-Förderprogramme Bauen/Wohnen/Städtebau.

---

## 2. BBSR-Integration (§2)

**Befund:** Das BBSR fehlte im Erst-Pflichtkern, weil die per WebSearch gefundenen Erst-URLs im
CI-Lauf `HTTP 404` lieferten (stale/umgezogen). Der Auditor hat das ausdrücklich vermisst.

**Nachrecherche (WebSearch 2026-07-24):** Die aktuellen BBSR-Adressen sind **live**:

| Rolle | Aktuelle URL | Methode |
|---|---|---|
| Aktuelles/Meldungen | `https://www.bbsr.bund.de/BBSR/DE/Aktuell/aktuell.html` | html (Ziel rss) |
| Presseinformationen | `https://www.bbsr.bund.de/BBSR/DE/presse/presseinformationen/_node.html` | html |
| Veröffentlichungen | `https://www.bbsr.bund.de/BBSR/DE/veroeffentlichungen/_node.html` | html |
| RSS-Hub (GSB) | `https://www.bbsr.bund.de/BBSR/DE/Service/RSS/rssnewsfeed_node.html` | rss (Feed am Runner) |
| IDW-Feed (alternativ) | `https://idw-online.de/de/institution957` | rss |

**Bevorzugte Einbindung (RSS/API vor HTML):** BBSR läuft auf dem Government Site Builder (GSB);
GSB exponiert echte Feeds unter `/SiteGlobals/Functions/RSSFeed/RSSGenerator*.xml?nn=<ID>`
(belegt an service.bund.de/bundesrat.de/bva.bund.de). Die site-spezifische `nn`-ID ist aus der
Sandbox nicht auflösbar → **Zielmethode `rss`**, konkrete Feed-URL am offenen Runner extrahieren.
Zusätzlich existiert ein **IDW-Institutions-Feed** (BBSR = idw-Institution 957) als
maschinenlesbare Alternative.

**Umsetzung:** aufgenommen als `rp-wbsb-bbsr-aktuelles` (Herausgeber `bbsr.bund.de`, neue Entität
`authority-bbsr`), Priorität **A**, Status `needs_review`/`manual` (INAKTIV). Verifikation:
`recherchiert_unverifiziert` (Runner-Reverifikation der finalen URL = Aktivierungs-Gate).

---

## 3. HTML-Reduktion (§3)

Grundsatz: Wo eine strukturierte Alternative **existiert**, wird sie zur **Zielmethode**; HTML
bleibt nur, wo kein Feed nachweisbar ist oder als keyfreier Faktenbeleg sinnvoll.

| Dimension | vorher | nachher | Struktur-Gewinn |
|---|---|---|---|
| Statistik (4× Destatis-HTML) | 4 HTML-Tabellen-Scrapes | **1 GENESIS-REST-API** + 2 HTML-Faktenbelege | 4→(1 API + 2 HTML); `baupreisindex`/`wohngeld` konsolidiert |
| Gesetzgebung (Norminhalt) | verworfene HTML (Timeout) | **gii-toc.xml** (dokumentiert, XML) | HTML→XML |
| Gesetzgebung (Verkündung) | HTML-Verkündungsliste | HTML + **Ziel RSS Teil I** (3 Feeds dok.) | Zielmethode strukturiert |
| Ministerium/Forschung (Presse) | HTML-Listen | HTML + **Ziel RSS** (GSB-Feed belegt) | Zielmethode strukturiert |
| Parlament (Ausschuss) | HTML-Ausschussseite | **entfernt → DIP-API** (Bestand) | HTML entfällt ganz |

**Realität:** Ein *dramatischer* HTML-Abbau ist aus der Sandbox nicht ehrlich machbar, weil die
konkreten GSB-`.xml`-URLs nicht auflösbar sind (Regel: keine geratenen URLs). Erreicht wurde:

- **structured_download/api** statt HTML wo eine **exakte, dokumentierte** Adresse existiert
  (`gii-toc.xml`, GENESIS-REST-Basis).
- **Ein HTML-Weg vollständig entfernt** (Bauausschuss → DIP-API).
- **Zwei HTML-Tabellen konsolidiert** (Destatis baupreisindex/wohngeld → GENESIS-Superset).
- Für die verbleibenden GSB-Presse-/Verkündungsseiten ist die **Zielmethode RSS** samt Beleg
  ihrer Feed-Existenz dokumentiert; die Umstellung `html→rss` erfolgt bei Feed-Auflösung am Runner.

Methodenmix nachher: **9× html · 1× api · 1× structured_download** (vorher: 11× html).

---

## 4. Freshness (§4)

Bewertung = Eignung als **News-Frühwarnung für politische Lageberichte** (nicht bloße
Aktualisierungsfrequenz).

| Freshness | Quellen | Begründung |
|---|---|---|
| **hoch** | BMWSB-Presse, BBSR-Aktuelles, Bundesgesetzblatt Teil I, (Parlament via **rp-dip**) | laufende, politisch unmittelbare Meldungen/Verkündungen/Vorgänge |
| **mittel** | BBR-Presse, Städtebauförderung, BMWSB-Wohnraumförderung, Förderdatenbank | ereignisgetrieben, aber seltener/programmatisch |
| **niedrig** | Destatis-GENESIS-API, Destatis-Bautätigkeit, Destatis-Wohnen/Mieten, gii-toc.xml | periodische Statistik / statischer Normindex |

**Kennzeichnung „für politische Lageberichte ungeeignet als News“** (nur Daten-Grounding /
Faktenbeleg, **nicht** als Lagebericht-Auslöser verwenden):
`destatis-genesis-api`, `destatis-bautaetigkeit`, `destatis-wohnen-mieten`, `gii-toc`.
Diese Quellen liefern **Belege/Zahlen zur Untermauerung**, keine tagesaktuelle Lage. Der Paket-
Seed markiert das über `update_character: periodisch/laufend` + `ziel_hinweis` (Daten-Grounding).

---

## 5. Dubletten & Überschneidungen (§5)

Über URL-Dubletten hinaus (im Modell strukturell ausgeschlossen: eindeutige Path-IDs/URLs, eine
Domain = ein Herausgeber) wurden **fachliche** Überschneidungen geprüft:

| Überschneidung | Bewertung | Maßnahme |
|---|---|---|
| **Bauausschuss-HTML** ⟂ **DIP-API** (`rp-dip`, always_on, bund-basis) ⟂ **committee-bau-wohnen** (Google-News, bund-basis) | parlamentarische Vorgänge **dreifach** gedeckt | **Bauausschuss-HTML entfernt** → DIP-API (strukturiert, amtlich, Bestand) |
| **Destatis baupreisindex/wohngeld** ⟂ **GENESIS-API** | GENESIS ist Superset aller Tabellen | **konsolidiert** → GENESIS + 2 HTML-Faktenbelege |
| **BMWSB-Wohnraumförderung** ⟂ **Förderdatenbank (BMWSB)** | Ressortsicht vs. neutrale Vollsicht | beide behalten, Förderdatenbank priorisiert; BMWSB-Förd. → C |
| **BBR-Presse** ⟂ **BBSR** | gleiche Behördenfamilie (BBSR im BBR) | beide behalten, Rollen getrennt (BBR=Bundesbau/Raumordnung, BBSR=Forschung) |
| **gii-toc.xml** ⟂ **Bundesgesetzblatt Teil I** | Normbestand vs. neue Verkündungen | beide behalten (komplementär: Konsolidierung vs. Frühwarnung) |

Kein Ministerium-/Behörden-Spiegel und kein identischer Newsfeed doppelt aufgenommen.

---

## 6. Priorisierung (§6)

| Prio | Quelle | Begründung |
|---|---|---|
| **A** | BMWSB-Presse | zuständiges Ressort, politische Erstquelle |
| **A** | BBSR-Aktuelles | zentrale Ressortforschung, Frühindikator (Auditor-Lücke) |
| **A** | Bundesgesetzblatt Teil I | amtliche Baugesetzgebung, alleinige Verkündungsquelle |
| **A** | (Parlament via `rp-dip`, Bestand) | Ausschuss-Vorgänge/Drucksachen strukturiert (kein neuer Weg nötig) |
| **B** | BBR-Presse | Bundesbau/Raumordnung |
| **B** | Destatis GENESIS-API | strukturierte Statistik-Vollsicht (Grounding) |
| **B** | Destatis Bautätigkeit (HTML) | Kernindikator Wohnungsbau, keyfreier Beleg |
| **B** | Destatis Wohnen/Mieten (HTML) | Mietdaten, keyfreier Beleg |
| **B** | Städtebauförderung | Stadtentwicklungs-/Programmnachrichten |
| **B** | gii-toc.xml | strukturierte Norm-Änderungserkennung |
| **C** | BMWSB-Wohnraumförderung | Ressort-Förderliste (überschneidet Förderdatenbank) |
| **C** | Förderdatenbank (BMWSB) | Förderprogramm-Referenz |

---

## 7. Retrieval-Empfehlungen (§7)

Empfehlung **je Zielmethode**; alle Werte gelten für die **Aktivierung** (aktuell inaktiv).

| Quelle | Abrufmethode (Ziel) | Frequenz | Priorität | Retry | Timeout |
|---|---|---|---|---|---|
| BMWSB-Presse | rss (→ Feed) / html interim | 2×/Tag | A | 3× exp. Backoff | 12 s |
| BBSR-Aktuelles | rss/IDW (→ Feed) / html interim | 1×/Tag | A | 3× | 12 s |
| Bundesgesetzblatt Teil I | rss (Teil I) / html interim | 4×/Tag | A | 3× | 15 s |
| BBR-Presse | rss (→ Feed) / html interim | 1×/Tag | B | 2× | 12 s |
| Destatis GENESIS-API | api (POST, Token) | 1×/Woche | B | 2× | 20 s |
| Destatis Bautätigkeit (HTML) | html | 1×/Woche | B | 2× | 15 s |
| Destatis Wohnen/Mieten (HTML) | html | 1×/Woche | B | 2× | 15 s |
| Städtebauförderung | rss/html | 1×/Tag | B | 2× | 12 s |
| gii-toc.xml | structured_download (XML) | 1×/Tag (Diff) | B | 2× | 30 s (großes XML) |
| BMWSB-Wohnraumförderung | html | 2×/Woche | C | 2× | 12 s |
| Förderdatenbank (BMWSB) | html | 1×/Woche | C | 2× | 15 s |

Allgemein (GSB/bund.de): realistischer Browser-User-Agent (keine Umgehung), TLS an, bei
`403/429` **kein Bypass**, sondern serverseitiger Abruf + Backoff; `robots.txt` je Weg vor
Aktivierung prüfen (GSB-Sitemaps vorhanden, Content-Pfade i. d. R. erlaubt).

---

## 8. Empfohlene Änderungen / Ergänzungen / Löschungen & Referenzarchitektur (§8)

### Ergänzungen (neu)
- **BBSR** (`rp-wbsb-bbsr-aktuelles`, Publisher `bbsr.bund.de`, Entität `authority-bbsr`) — A.
- **Destatis GENESIS REST-API** (`rp-wbsb-destatis-genesis-api`, `api`) — strukturierter
  Statistik-Superset.
- **gii-toc.xml** (`rp-wbsb-gii-toc`, `structured_download`, Publisher `gesetze-im-internet.de`)
  — maschinenlesbarer Normindex.

### Änderungen (bestehende Wege)
- **Zielmethode `rss`** dokumentiert für BMWSB-Presse, BBSR, Bundesgesetzblatt Teil I (Feed
  existiert; `nn`/Feed-URL am Runner auflösen).
- **Prioritäten** neu gesetzt (A/B/C, s. §6); Statistik als Daten-Grounding gekennzeichnet.

### Löschungen (Dedup/Konsolidierung)
- **`bundestag-bauausschuss` (HTML) entfernt** → DIP-API (`rp-dip`, Bestand) deckt es strukturiert.
- **`destatis-baupreisindex` + `destatis-wohngeld` (HTML) entfernt** → GENESIS-Superset + niedrige
  News-Freshness.

### Endgültige Referenzarchitektur (11 Wege, INAKTIV)

```
pkg-wohnen-bauen-stadtentwicklung-bund  (prepared, Bund, Fachthema, is_base=false)
├─ A  rp-wbsb-bmwsb-presse             bmwsb.bund.de            html → Ziel rss
├─ A  rp-wbsb-bbsr-aktuelles           bbsr.bund.de   [NEU]     html → Ziel rss/IDW
├─ A  rp-wbsb-bgbl-teil1-liste         recht.bund.de            html → Ziel rss (Teil I)
├─ B  rp-wbsb-bbr-presse               bbr.bund.de              html → Ziel rss
├─ B  rp-wbsb-destatis-genesis-api     destatis.de    [NEU]     api  (Token @ Aktivierung)
├─ B  rp-wbsb-destatis-bautaetigkeit   destatis.de              html (Faktenbeleg)
├─ B  rp-wbsb-destatis-wohnen-mieten   destatis.de              html (Faktenbeleg)
├─ B  rp-wbsb-staedtebaufoerderung-start staedtebaufoerderung.info html → Ziel rss
├─ B  rp-wbsb-gii-toc                  gesetze-im-internet.de [NEU] structured_download (XML)
├─ C  rp-wbsb-bmwsb-foerderung-wohnen  bmwsb.bund.de            html
└─ C  rp-wbsb-foerderdatenbank-bmwsb   foerderdatenbank.de      html

Parlament: KEIN eigener Weg — Abdeckung über rp-dip (DIP-API, always_on, bund-basis).
Herausgeber: 7 neu (bmwsb/bbsr/bbr/recht.bund.de/gesetze-im-internet/staedtebaufoerderung/
             foerderdatenbank) + 1 wiederverwendet (destatis.de).
Sicherheit:  alle Wege needs_review + manual, is_critical=false → isPathActive()=false.
```

---

## 9. Umsetzung & Offline-Nachweis (§9)

Geänderte Dateien (nur dieses Paket + zwingend abhängige Paket-Assertions/Seeds):

- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung.js` — neuer Pflichtkern,
  per-Weg `method`/`parser`/`ziel_methode`, ehrliche `verifikation`.
- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten.js` — BBSR-URLs
  korrigiert (live), GENESIS-REST-Basis, `gii-toc.xml` ergänzt (für Runner-Reverifikation).
- `lib/helmut/quellenarchitektur/seeds/entities.js` — Entität `authority-bbsr` ergänzt.
- `scripts/source-architecture-test.js` — Paket-Assertions (neue Herausgeber/Entität) erweitert.
- `supabase/seeds/20260713_source_architecture_seed.sql` — deterministisch **regeneriert**.

**Offline-Suite:** `143/143 Suiten grün`. Kern-WBSB-Suiten: source-architecture **106**,
quellenpaket-workflow **30**, quellenpaket-negativ **35**, wbsb-verify **14**, admin-report **54**,
sprint6 **46**, landesmodul **18** — alle **0 FAIL**. Seed-Regeneration deterministisch.

Registry/Generatoren/Testarchitektur **unverändert** (die Registry leitet Zählungen aus dem
Paket-Seed ab → Änderungen fließen automatisch durch; nur zwei Paket-Assertions in
`source-architecture-test.js` wurden zwingend nachgezogen).

---

## 10. Offene Risiken (für den Auditor)

1. **Konkrete Feed-/Token-Auflösung offen (aktivierungspflichtig):** GSB-`.xml`-URLs
   (BMWSB/BBSR/BBR/Städtebauförderung), BGBl-Teil-I-RSS-URL und GENESIS-Token sind aus der
   Sandbox nicht auflösbar/prüfbar → am offenen Runner auflösen + `verify.js` re-laufen lassen.
2. **BBSR-URL 404↔live:** Vorsprint-CI meldete 404, WebSearch meldet live. Diskrepanz nur per
   Runner endgültig klärbar (Redirect-Case/Transiente).
3. **BBR-Presse finale URL = Suchformular:** Ergebnis-Parsing vor Aktivierung absichern.
4. **GENESIS-API = POST + Zugangsdaten:** eigener Abrufpfad (analog DIP, nicht generischer Crawl);
   kostenfreier Account/Token als Aktivierungs-Task.
5. **Bot-Sperren (403/429) bei echten Crawls** auf bund.de-GSB — realistischer UA, kein Bypass;
   je Weg re-verifizieren.
6. **Freshness bei HTML nicht maschinell messbar** (kein Item-Datum) — bei Aktivierung prüfen.

---

## 11. Referenz-Muster für weitere Quellenpakete

Dieses Paket etabliert den wiederverwendbaren Ablauf:
**(1)** Kandidaten-Superset per WebSearch (nur reale URLs) → `…-kandidaten.js`;
**(2)** ehrliche Trennung `echtes CI-Urteil` vs. `recherchiert_unverifiziert`;
**(3)** Zielmethode strukturiert (RSS/API/XML) mit belegter Feed-Existenz, HTML nur als
Interim/Faktenbeleg; **(4)** Dedup gegen Bestand (DIP/Google-News/andere Pakete);
**(5)** Priorisierung A/B/C + Retrieval-Profil; **(6)** Paket bleibt `prepared`/INAKTIV bis zum
freigabepflichtigen Aktivierungs-Gate mit Runner-Verifikation; **(7)** Offline-Suite grün +
deterministische Seed-Regeneration.
