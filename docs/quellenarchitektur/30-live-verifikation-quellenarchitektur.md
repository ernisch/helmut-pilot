# 30 — LIVE-VERIFIKATION DER QUELLENARCHITEKTUR (Evidenz-Sprint)

> **Auftrag:** Ausschließlich **Live-Verifikation** der bestehenden Quellenarchitektur — keine
> neuen Features, keine neuen Fachpakete, keine Architekturänderungen, keine BE/BB-Aktivierung,
> keine Spekulation. Nur **überprüfbare** Verbesserungen dürfen übernommen werden; was nicht
> eindeutig verifiziert werden kann, bleibt **unverändert** und wird dokumentiert.
> **Datum:** 2026-07-25 · **Branch:** `claude/helmut-source-verification-3a4z6m`
> **Prüfbasis (main-Stand):** `035898b` (Merge #114). **PR #118 (Remediation-Sprint) ist zum
> Zeitpunkt dieses Sprints NICHT gemergt** — die dort behobenen 6 Bundesweg-Reparaturen sind auf
> `main` noch **nicht** aktiv. Dieser Bericht bewertet den **tatsächlichen `main`-Stand** und
> weist PR #118 durchgängig als *ausstehende* Verbesserung aus.

---

## 0. METHODEN-EHRLICHKEIT — WAS IN DIESER UMGEBUNG VERIFIZIERBAR WAR (und was nicht)

Der Sprint sollte „live prüfen": HTTP-Status, Redirects, HTTPS, RSS-Gültigkeit, Feed-Struktur,
Parser-Kompatibilität, Bot-Sperren, Rate-Limits, robots.txt, Erreichbarkeit,
Aktualisierungshäufigkeit, Inhalts-Plausibilität, Langfrist-Stabilität.

**Befund vorab (belegt, nicht behauptet):** Ausgehende HTTP(S)-Verbindungen sind in dieser
Ausführungsumgebung durch die Organisations-Egress-Policy **vollständig gesperrt** — nicht nur für
Behörden-/Medien-Domains, sondern für **jeden** Host.

**Belege:**
- `curl` gegen `www.bmas.de`, `www.bundestag.de`, `www.tagesschau.de`,
  `news.google.com`, `search.dip.bundestag.de`, **sowie `www.google.com` und `example.com`**:
  durchgängig `curl: (56) CONNECT tunnel failed, response 403`.
- Proxy-Statusendpunkt (`$HTTPS_PROXY/__agentproxy/status`) protokolliert die Ablehnungen
  explizit: `"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial
  or upstream failure)"` für `www.bmas.de:443`, `www.bundestag.de:443`, `www.tagesschau.de:443`.
- `WebFetch` gegen `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` → **HTTP 403**.
- Der Proxy-README weist ausdrücklich an: *„Do not retry or route around it — report the blocked
  host."* Ein Umgehen wäre eine Policy-Verletzung und wurde **nicht** versucht.

**Folge — was NICHT möglich war (und daher nicht behauptet wird):**
HTTP-Status, Redirect-Ketten, HTTPS-Handshakes, echtes RSS-Abrufen, Feed-Struktur am lebenden
Objekt, Parser-Lauf gegen echte Antworten, Bot-Sperren-Erkennung (403/429), Rate-Limit-Messung,
`robots.txt`-Abruf. **Diese Prüfungen konnten für KEINE Quelle durchgeführt werden.** Das ist
**dieselbe** Einschränkung, unter der bereits der Gesamt-Audit (Doku 29) stand.

**Was verfügbar war:** `WebSearch` (funktioniert, US-seitig). Damit ist möglich:
**Existenz-/Aktualitäts-Korroboration** einer Feed-/Landing-URL (ist sie 2026 indexiert? unter
welchem Pfad?), sowie öffentlich dokumentierte Betriebsfakten (z. B. Google-News-RSS-Verhalten
2026, DIP-API-Schlüssellauf). **Wichtig:** Ausgewertet werden **ausschließlich die zurückgegebenen
Link-URLs** (real indexierte Ziele), **nicht** die Prosa-Zusammenfassung des Suchmodells (die
mehrfach nachweislich falsch war, z. B. „Bundestag-RSS liegt unter `/rss`", während die Links
`/services/rss/` zeigen).

**Konsequenz für den Sprint (evidenz-diszipliniert):** Da die geforderten Live-Prüfungen für
**keine** Quelle ausführbar waren, ist **keine** Quelle in diesem Sprint „eindeutig verifiziert"
im Sinne der Auftrags-Prüfliste. Gemäß Auftrag („Wenn eine Quelle nicht eindeutig verifiziert
werden kann, bleibt sie unverändert") wird **der Katalog nicht verändert**. Der Sprint liefert
stattdessen: (a) eine ehrliche WebSearch-Korroboration je Direktquelle, (b) zwei neue,
belegbare Betriebsbefunde (DIP-Schlüssellauf, Google-News-Staleness 2026), (c) neu vergebene
Reifegrade auf Basis der verfügbaren Evidenz. Details zur Nicht-Änderung: §11.

---

## 1. EVIDENZ-LEGENDE

| Marker | Bedeutung | Beweiskraft |
|---|---|---|
| **[WS-KORR]** | WebSearch lieferte die Feed-/Landing-URL als 2026 real indexiertes Ziel | mittel — Existenz/Aktualität, **kein** Live-200/Parser |
| **[WS-INDIZ-DEFEKT]** | WebSearch fand die **alte** URL nicht, aber einen **umgezogenen** Ort | mittel — Indiz für Umzug/Bruch, deckt sich mit Audit |
| **[WS-SCHEMA]** | Nur das URL-Schema korroboriert (Schwester-Feed indexiert), exakte URL nicht | niedrig-mittel |
| **[REPO-9B]** | Sprint-9B-Runner-Test (2026-07-14, offener Egress, HTTP 200 byte-belegt) | hoch, aber **11 Tage alt**, nicht heute |
| **[REPO-SNAP]** | `catalog.KNOWN_PATH_HEALTH` / `quellen-audit.csv` (Repo-Snapshot) | niedrig — statischer Altstand |
| **[LIVE-BLOCK]** | Live-HTTP-Prüfung war policy-gesperrt (siehe §0) | — |

---

## 2. DIREKTQUELLEN — VERIFIKATION (9 Direkt-Feeds + DIP-API)

Alle 9 Direkt-/HTML-Quellen aus `lib/helmut/sources.js` (`coreSources`) plus die DIP-API. **Status
= `main`-Stand** (`catalog.KNOWN_PATH_HEALTH`, PR #118 **nicht** eingespielt).

| Quelle | URL auf `main` | `main`-Status | Live-Test | WebSearch-Evidenz (2026-07-25) | Bewertung |
|---|---|---|:---:|---|---|
| **bmas** | `bmas.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml` | healthy | [LIVE-BLOCK] | RSS-Landing zog um auf `bmas.de/DE/Service/Newsletter/RSS/rss-feed.html` **[WS-INDIZ]**; die exakte `SiteGlobals`-XML-URL **nicht** indexiert (GSB-Feeds sind selten indexiert → weder bestätigt noch widerlegt) | **unklar** → unverändert |
| **tagesschau-politik** | `tagesschau.de/infoservices/alle-meldungen-100~rss2.xml` (+ `/xml/rss2`) | healthy | [LIVE-BLOCK] | `tagesschau.de/xml/rss2` als aktiver Feed indexiert (Inoreader) **[WS-KORR]**; `alle-meldungen-100~rss2.xml` schema-konsistent **[WS-SCHEMA]** | **plausibel aktuell** |
| **deutschlandfunk-politik** | `deutschlandfunk.de/nachrichten-100.rss` | healthy | [LIVE-BLOCK] | `nachrichten-100.rss` **und** `politikportal-100.rss` als aktive DLF-Feeds indexiert **[WS-KORR]** | **plausibel aktuell** |
| **DIP-API** | `search.dip.bundestag.de/api/v1` (API-Key via `DIP_API_KEY`) | healthy | [LIVE-BLOCK] | API real, RESTful, 42-Zeichen-Key nötig **[WS-KORR]**; **öffentlicher Temp-Key gültig nur bis Ende 05/2026** → **heute abgelaufen** (§6.1) | **⚠️ Schlüssel-Risiko** |
| **bundestag** | `bundestag.de/rss` (+ `/presse/hib/rss`) | **broken** | [LIVE-BLOCK] | RSS-Hub liegt real unter `bundestag.de/services/rss/` + `…/feeds_allgemein-249014` **[WS-INDIZ-DEFEKT]**; bare `/rss` = Redirect/Landing → deckt sich mit Audit; PR-#118-Ersatz `…/static/appdata/includes/rss/pressemitteilungen.rss` nur schema-plausibel **[WS-SCHEMA]** | **defekt auf `main`**; Reparatur in PR #118 |
| **bundesregierung** | `bundesregierung.de/breg-de/service/rss` | **broken** | [LIVE-BLOCK] | RSS-Reader zog um auf `…/service/newsletter-und-abos/rss-newsfeed` **[WS-INDIZ-DEFEKT]**; alte `/service/rss` nicht indexiert; `service.bund.de`-Aggregator existiert | **defekt auf `main`**; PR #118 → Google-News-Ersatz |
| **die-linke** | `die-linke.de/start/presse/rss.xml` | **broken** | [LIVE-BLOCK] | Presse-Seite `die-linke.de/start/presse/` existiert, aber **kein** `rss.xml` dort indexiert **[WS-INDIZ-DEFEKT]** → deckt sich mit Audit (TYPO3-Relaunch) | **defekt auf `main`**; PR #118 → Google-News-Ersatz |
| **linksfraktion** | `dielinkebt.de/presse/pressemitteilungen/rss.xml` (+ veraltete `linksfraktion.de`-Variante) | **broken** | [LIVE-BLOCK] | **Starke Evidenz:** `dielinkebt.de/presse/pressemitteilungen/feed.rss` ist Top-Treffer in 2 Suchen, mit **datierten** PMs (06/2025) **[WS-KORR]**; `rss.xml`-Pfad falsch | **defekt auf `main`**; PR #118 → `feed.rss` (belegt korrekt) |
| **ausschuss-arbeit-soziales** | `bundestag.de/ausschuesse/a11_arbeit_soziales` (HTML-Scrape) | **broken** | [LIVE-BLOCK] | Kein eigener Ausschuss-Feed indexiert; nur die (bot-anfällige) HTML-Seite → deckt sich mit Audit | **defekt auf `main`**; PR #118 → Google-News-Ersatz |
| **dgb** | `dgb.de` (HTML-Scrape) | **broken** | [LIVE-BLOCK] | **Echte DGB-Direkt-Feeds indexiert:** `dgb.de/einblick/rss`, `dgb.de/service/rss`, `dgb.de/unsere-rss-feeds/` **[WS-KORR]** → besser als der PR-#118-Google-News-Ersatz | **defekt auf `main`**; echter Direkt-Feed existiert (§6.3) |

**Zusammenfassung Direktquellen:** Von 10 Direkt-/API-Wegen sind auf `main` **3 als healthy**
markiert (bmas, tagesschau, dlf), **1 API healthy** (DIP), **6 broken**. Die WebSearch-Evidenz
**bestätigt die Bruch-Diagnosen** für alle 6 broken-Wege (umgezogene/entfernte Pfade) und
**stützt PR #118** als korrekte Reparatur — insbesondere `dielinkebt.de/.../feed.rss` ist stark
belegt. Keiner dieser Befunde ersetzt jedoch einen echten Live-200-+-Parser-Test.

---

## 3. GOOGLE-NEWS-QUELLEN — BEWERTUNG (behalten / ergänzen / ersetzen)

**Anteil:** ~134 von ~144 aktiven Abrufwegen (~93 %) laufen als `googlenews_search` über **einen**
`news.google.com/rss/search`-Endpunkt (Single Point of Failure, Audit P1-7). Regel des Auftrags:
*Google News bleibt nur, wenn kein gleichwertiger offizieller Direktweg existiert.*

**Neue Betriebsevidenz zu Google-News-RSS (2026-07, WebSearch-belegt):** Der Endpunkt
funktioniert weiterhin für **low-volume** Nutzung; **429-Rate-Limits sind ein reales,
dokumentiertes Risiko** ohne offizielle Quote; in einer **Juli-2026-Stichprobe (48 Queries)** lag
das **Median-Alter der Items bei ~6,6 Tagen**, nur **7,6 % ≤ 6 h alt** („deep but stale");
Empfehlung Dritter: RSS nur für Prototyp/low-volume, für Frische/Skalierung/SLA strukturierte API.
Das **quantifiziert** den Master-Status-Befund B1 (transientes Rate-Limiting, Klumpenrisiko).

| Google-News-Kategorie | Wege | Gleichwertiger Direktweg heute? | Empfehlung | Begründung (evidenzbasiert) |
|---|:---:|---|---|---|
| 22 Ausschuss-Suchen | 22 | **Nein** (kein amtlicher Ausschuss-Feed; nur bot-anfällige HTML-Seiten) | **behalten** | Direkt-Alternative wäre DIP-API gefiltert (Anker) — Ausbau, kein Ersatz |
| 8 Fraktions-Suchen | 8 | Teilweise (nur Linksfraktion hat `feed.rss` **[WS-KORR]**) | **überwiegend behalten**; Linksfraktion **ergänzen** | Für 7 Fraktionen kein einheitlicher Direkt-Feed belegt |
| Leitmedien-`site:`-Suchen (Spiegel/Zeit/SZ/FAZ/…) | ~14 | Ja (die meisten Leitmedien haben eigene RSS) — aber `site:`-Suche liefert **thematisch gefiltert**, Direkt-Feed nicht | **behalten** | Der `site:`+Themen-Filter ist funktional nicht durch einen ungefilterten Voll-Feed ersetzbar; Ersatz wäre Feature-Änderung (out of scope) |
| A&S Verbände/Institutionen (`site:verdi.de` etc.) | ~30 | Uneinheitlich | **behalten** | Kein flächendeckender Direkt-Feed-Nachweis; Einzelprüfung live nicht möglich |
| A&S `radar-*`/`signal-*`/`process-*`/`bundle-*` | ~40 | n/a (Themen-Aggregation) | **behalten**, **P2-8 konsolidieren** (Audit) | Starke Query-Überlappung → Dedup-Last + Klumpenrisiko; Konsolidierung ist Fachpaket-Arbeit, **out of scope** dieses Sprints |
| dgb (PR-#118-Ersatz `site:dgb.de`) | 1 | **JA — echter `dgb.de/einblick/rss`** **[WS-KORR]** | **ersetzen (Kandidat)** | Echter Direkt-Feed belegt; Übernahme erst nach echtem Live-+Parser-Test (§6.3) |
| bundesregierung/die-linke/ausschuss (PR-#118-Ersatz) | 3 | Direktfeeds real 404/429 (Audit) | **behalten** (als Ersatz) | Kein funktionierender Direktweg belegt |
| Regional NDS | 4 | Nein | **behalten** | Lokalmedien ohne einheitlichen Feed |
| Personensuche `<mandat>-news` (dynamisch) | 1/Mandat | Nein | **behalten** | Personensuche hat naturgemäß keinen Direkt-Feed |

**Vollständig ersetzbare Google-News-Wege (belegt): 1** — `dgb` (echter `dgb.de/einblick/rss`),
**als Kandidat**, nicht in diesem Sprint übernommen (Live-Test fehlt). **Alle übrigen ~133
Google-News-Wege:** kein gleichwertiger belegter Direktweg → **bleiben dauerhaft**.

---

## 4. PAKETWEISE BEWERTUNG + REIFEGRAD (A–F)

**Reifegrad-Skala:** A = produktionsreif · B = fast produktionsreif · C = teilweise
produktionsreif · D = noch nicht produktionsreif · F = neu aufbauen.

**Deckelung vorab (ehrlich):** Da in dieser Umgebung **keine** der geforderten Live-Prüfungen
(HTTP/Parser/Rate-Limit/robots) ausführbar war, kann **kein** Paket in **diesem** Sprint auf **A**
gehoben werden — A würde eine Live-Produktionsreife-Bestätigung behaupten, die hier nicht erbracht
werden konnte. Die Grade spiegeln **korroborierte Evidenz + Repo-Snapshots**, nicht Live-Beweise.

| Paket | Status | Wege (`main`) | Google-News-Anteil | Reifegrad | Begründung |
|---|---|:---:|:---:|:---:|---|
| **bund-basis** | active | 54 | ~50/54 (≈93 %) | **C** | Struktur stark; aber 2 kritische `always_on`-Direktfeeds (`bundestag`, `bundesregierung`) auf `main` **broken**; DIP-Schlüssel evtl. abgelaufen (§6.1); Google-News-Staleness (~6,6 d) + 429-Risiko. Ertrag laut Master-Status §5 via Google-News gedeckt → nicht D, aber kein B, solange kritische Direktfeeds defekt sind. *(Mit PR #118: `bundestag` Direktfeed repariert → Richtung B.)* |
| **arbeit-und-soziales** | active | 84 | ~82/84 | **C** | `bmas` healthy (korroboriert); `ausschuss-a-s` + `dgb` auf `main` **broken**; hohe Query-Redundanz (P2-8); Staleness-Risiko. Fachversorgung funktional, aber amtliche Direkt-Rückgrate fehlen/defekt. |
| **die-linke-bund** | active | 3 | 1/3 funktional | **D** | Auf `main` **beide** Partei-Direktfeeds (`die-linke`, `linksfraktion`) **broken**; Versorgung nur über **einen** Google-News-Weg (`fraction-linke`). Reproduzierbarkeit (P0-1) erst in PR #118 geheilt. Evidenz für korrekte `feed.rss`-Reparatur stark, aber nicht live-getestet. |
| **regional-niedersachsen** | active | 4 | 4/4 | **C** | Rein Google-News; niedriger Signalwert, Staleness; funktional für Pilot-Region, aber ohne Direktquellen und ohne Live-Bestätigung. |
| **profil-\<id\>** (dynamisch) | Laufzeit | 1/Mandat | 1/1 | **C** | Einzelne Google-News-Personensuche; mandantenlokal, funktional; Staleness/429-Risiko; kein Direktweg möglich. |
| **berlin-basis** | prepared | 7 (inaktiv) | gemischt | **D** | Nicht aktivierbar (P1-3/P1-4/P1-6 offen). Auf `main` trägt das Pflicht-`is_base`-Paket **weiterhin** Partei-/Person-Quellen (P0-2 erst in PR #118 behoben) → Neutralitätsdefekt. Struktur Sprint-9B-verifiziert, aber **nicht** heute live re-verifizierbar. |
| **brandenburg-basis** | prepared | 8 (inaktiv) | gemischt | **D** | Wie Berlin + Orphan `stk.brandenburg.de` (P2-12) + unbesetzte Pflichtklassen; PARDOK-URLs WP-gebunden (P3-21). Nicht aktivierbar, nicht live-verifizierbar. |

> Die in PR #118 neu angelegten Pakete `die-linke-berlin`/`die-linke-brandenburg` existieren auf
> `main` **nicht** und sind daher hier nicht bewertet.

---

## 5. GESAMTAUSWERTUNG (Reifegrad-Verteilung, `main`-Stand)

| Grad | Bedeutung | Anzahl | Pakete |
|:---:|---|:---:|---|
| **A** | produktionsreif | **0** | — |
| **B** | fast produktionsreif | **0** | — |
| **C** | teilweise produktionsreif | **4** | bund-basis, arbeit-und-soziales, regional-niedersachsen, profil-\<id\> |
| **D** | noch nicht produktionsreif | **3** | die-linke-bund, berlin-basis, brandenburg-basis |
| **F** | neu aufbauen | **0** | — |

**Warum kein Paket A/B erreicht (ehrlich, wie im Auftrag verlangt):**
1. **Keine Live-Verifikation möglich** (§0) — der Kern-Nachweis für „produktionsreif" fehlt
   umgebungsbedingt, nicht architekturbedingt.
2. **Google-News-SPOF (93 %)** mit **belegter Staleness (~6,6 d Median, 2026-07)** und
   429-Risiko drückt jedes aktive Paket strukturell unter B, solange kein Zweitpfad existiert.
3. **`main` trägt 6 defekte Direktfeeds** (PR #118 ungemergt), darunter 2 kritische
   `always_on`-Wege → `bund-basis`/`die-linke-bund` können nicht höher als C/D.
4. **DIP-Schlüssel-Risiko** (§6.1) betrifft den einzigen amtlichen Struktur-Anker.

---

## 6. NEUE EVIDENZBASIERTE BEFUNDE (in Audit 29 noch nicht enthalten)

### 6.1 — ⚠️ DIP-API: öffentlicher Temp-Schlüssel seit Ende 05/2026 abgelaufen
**Beleg (WebSearch, offizielle DIP-API-Doku 2026):** Die DIP-API verlangt einen 42-Zeichen-Key;
ein **temporärer öffentlicher Key ist „gültig bis Ende 05/2026"**. Heute ist **2026-07-25** →
der öffentliche Key ist **~2 Monate abgelaufen**. Helmut bezieht den Key aus
`process.env.DIP_API_KEY` (`lib/helmut/dip.js:14`), Abruf nur wenn gesetzt (`scheduler.js:296`).
**Risiko:** Falls Production den öffentlichen Temp-Key nutzte, ist die DIP-API — der einzige
amtliche `api`-Anker mit „sehr hohem" Signalwert, `is_critical` + `always_on` — **aktuell tot**.
**Nicht verifizierbar hier:** welchen Key Production trägt (Env nicht lesbar). **Empfehlung
(operativ, kein Codefix):** individuellen DIP-Key per E-Mail (`parlamentsdokumentation@bundestag.de`)
anfordern/bestätigen und in `DIP_API_KEY` hinterlegen. **In diesem Sprint nicht behebbar** (Env +
Live-Test außerhalb Reichweite), aber der wichtigste neue Betriebsbefund.

### 6.2 — Google-News-RSS 2026: „deep but stale" + 429 (quantifiziert)
Siehe §3. Median-Item-Alter ~6,6 Tage, 7,6 % ≤6 h; 429 real. Konkretisiert P1-7/B1: Der
93-%-Anteil ist nicht nur ein Ausfall-SPOF, sondern liefert auch **strukturell veraltete** Items —
relevant für die Frische von Lage/Briefing. Untermauert die Audit-Empfehlung eines Zweitpfads.

### 6.3 — DGB: echter Direkt-Feed belegt (Ersatzkandidat für Google-News-Weg)
`dgb.de/einblick/rss`, `dgb.de/service/rss`, `dgb.de/unsere-rss-feeds/` sind 2026 indexiert
**[WS-KORR]**. Bestätigt den Audit-Zusatzfund (Doku 29, §4 P1-5). **Nicht übernommen** — die
exakte XML-URL braucht einen echten Live-+Parser-Test, der hier nicht möglich war. Vorgemerkt für
eine künftige, eigens verifizierte Reparaturrunde (mit offenem Egress).

---

## 7. TESTS (nach diesem Sprint)

**Es wurde keine Code-/Katalog-Änderung vorgenommen** (§0/§11), daher bleibt die Suite
unverändert am geprüften `main`-Baseline-Stand:

- **Offline-Suite:** `node scripts/run-offline-tests.js` → **140/140 Suiten grün** (41 s).
- Der `[NETZ-GUARD]` meldet erwartungsgemäß `pardok-shadow-test.js` (bewusst netzblockierter Test).
- Generator/Seed-Drift/Referenzen/Rollback/Paket-/Profilauflösung sind Bestandteil der 140 Suiten
  (`source-architecture-test.js`, `landesmodule-*`, `profile-packages-test.js`, `pardok-*`) und
  bleiben grün, da nichts geändert wurde.

> Hinweis: Das in PR #118 neu hinzukommende `seed-drift-test.js` (→ dort 141/141) ist auf `main`
> noch nicht vorhanden; das ist kein Regress, sondern der ungemergte Zustand.

---

## 8. ABSCHLUSSBERICHT JE PAKET

| Paket | Alt-Reifegrad¹ | Neu-Reifegrad | Neu bestätigte Direktquellen² | Entfernte Quellen | Ersetzte Quellen | Google-News-Anteil vorher→nachher | Verbleibende Risiken |
|---|:---:|:---:|---|:---:|:---:|:---:|---|
| bund-basis | C | **C** | tagesschau, dlf (plausibel aktuell); DIP existiert (⚠️ Key) | 0 | 0 | ~93 % → ~93 % (unverändert) | 2 kritische Direktfeeds broken; DIP-Key; Google-News-Staleness/SPOF |
| arbeit-und-soziales | C | **C** | bmas (Landing bestätigt); DGB-Direktfeed belegt (Kandidat) | 0 | 0 | ~98 % → ~98 % | ausschuss/dgb broken; P2-8-Redundanz; Staleness |
| die-linke-bund | D | **D** | `dielinkebt.de/.../feed.rss` stark belegt (Kandidat, PR #118) | 0 | 0 | 1/3 → 1/3 | beide Partei-Direktfeeds broken auf `main`; nur 1 Google-News-Weg |
| regional-niedersachsen | C | **C** | keine (rein Google-News) | 0 | 0 | 100 % → 100 % | niedriger Signalwert; Staleness |
| profil-\<id\> | C | **C** | keine (Personensuche) | 0 | 0 | 100 % → 100 % | Staleness/429 |
| berlin-basis | D | **D** | keine (inaktiv, nicht live-prüfbar) | 0 | 0 | — | P0-2 auf `main` offen; P1-3/4/6; nicht aktivierbar |
| brandenburg-basis | D | **D** | keine (inaktiv) | 0 | 0 | — | P0-2; Orphan stk; WP-gebundene PARDOK-URLs |

¹ „Alt-Reifegrad" = aus Audit 29 abgeleitete implizite Einstufung (Audit vergab keine A–F-Buchstaben,
sondern Aktivierungs-/Rollback-Status + Score 7,25). ² „Bestätigt" = WebSearch-korroboriert
(Existenz/Aktualität), **nicht** live-200-getestet.

**Netto:** 0 entfernte, 0 ersetzte, 0 neu übernommene Quellen — vollständig konsistent mit der
Evidenzlage (keine Quelle „eindeutig verifiziert" i. S. der Live-Prüfliste).

---

## 9. DIE SECHS ABSCHLUSSFRAGEN

**1. Welche Quellen waren überraschend stabil?**
Kein Live-Beweis möglich. **Korroboriert stabil** (Existenz/Aktualität, gleiche URL wie im
Katalog): `tagesschau.de/xml/rss2`, `deutschlandfunk.de/nachrichten-100.rss`,
`deutschlandfunk.de/politikportal-100.rss`. **Überraschend positiv:** `dielinkebt.de/presse/
pressemitteilungen/feed.rss` ist mit **datierten** PMs (06/2025) klar aktiv — obwohl der auf `main`
eingetragene `rss.xml`-Pfad falsch ist. Der Google-News-RSS-Endpunkt selbst ist 2026 **überraschend
langlebig** (funktioniert noch), aber inhaltlich veraltet.

**2. Welche Quellen waren dauerhaft defekt?**
Auf `main` als broken markiert und durch WebSearch-Indizien **bestätigt umgezogen/entfernt**:
`bundestag.de/rss` (→ `/services/rss/`), `bundesregierung.de/breg-de/service/rss`
(→ `…/newsletter-und-abos/rss-newsfeed`), `die-linke.de/start/presse/rss.xml` (TYPO3-Relaunch),
`dielinkebt.de/.../rss.xml` (→ `feed.rss`), `ausschuss-a-s`-HTML-Scrape, `dgb.de`-HTML-Scrape. Alle
6 sind in PR #118 (ungemergt) bereits repariert. **Kein Live-Test** — „defekt" hier = Repo-Status +
WebSearch-Indiz, nicht Live-404.

**3. Welche Google-News-Wege konnten vollständig ersetzt werden?**
**Belegbar genau einer als Kandidat:** `dgb` → echter `dgb.de/einblick/rss` **[WS-KORR]**. **In
diesem Sprint tatsächlich ersetzt: keiner** — die Übernahme erfordert einen echten Live-+Parser-Test,
der hier nicht möglich war (Evidenz-Disziplin). Vorgemerkt für eine Egress-offene Runde.

**4. Welche Google-News-Wege müssen dauerhaft bleiben?**
Die ~133 übrigen: alle Ausschuss-Suchen (kein amtlicher Feed), 7 von 8 Fraktionen, die
Leitmedien-`site:`+Themen-Suchen (funktional nicht durch Voll-Feeds ersetzbar), A&S-Verbände/
Institutionen ohne einheitlichen Feed, die Regional-NDS-Wege und die dynamischen Personensuchen.
Für sie existiert **kein gleichwertiger offizieller Direktweg** (belegt bzw. strukturell unmöglich).

**5. Welche zukünftigen Verbesserungen sind realistisch?**
(a) **DIP-Key verifizieren/erneuern** (§6.1) — höchste Priorität, rein operativ. (b) **PR #118
mergen** — behebt die 6 Direktfeeds evidenzgestützt. (c) **Egress-offene Live-Verifikationsrunde**
(GitHub-Actions-Runner wie Sprint 9B) für echten HTTP-/Parser-/Rate-Limit-Test aller 9 Direktfeeds
+ DGB-Direktfeed-Übernahme. (d) **Google-News-Zweitpfad/Heartbeat** gegen SPOF + Staleness (P1-7).
(e) **A&S-Query-Konsolidierung** (P2-8). (f) **Amtliche Primärquellen** (Bundesgesetzblatt/
recht.bund.de, DIP-gefilterte Ausschusswege — P2-9).

**6. Ist der Quellenbestand jetzt produktionsreif?**
**Für den laufenden Bund-Pilotbetrieb: funktional ausreichend** (Master-Status §5: 100 %
Ertragsabdeckung über die Google-News-Fallbacks), **aber im Sinne dieses Verifikations-Sprints
NICHT als produktionsreif *nachgewiesen*** — weil (i) die geforderten Live-Prüfungen umgebungsbedingt
für keine Quelle ausführbar waren, (ii) `main` 6 defekte Direktfeeds trägt (PR #118 ausstehend),
(iii) 93 % der Wege an einem belegt veraltenden/ratelimitierten Google-News-SPOF hängen und
(iv) der amtliche DIP-Anker ein akutes Schlüssel-Ablauf-Risiko hat. **Ampel: 🟡 GELB** — kein
Produktionsreife-*Nachweis* in dieser Umgebung; BE/BB bleiben unverändert nicht aktivierbar.

---

## 10. VERBLEIBENDE RISIKEN (gesammelt)

| Risiko | Quelle | Schwere | Status |
|---|---|:---:|---|
| DIP-Key seit 05/2026 abgelaufen (falls Temp-Key) | §6.1 | **hoch** | offen, operativ |
| 6 Direktfeeds defekt auf `main` | §2 | hoch | Reparatur in PR #118 (ungemergt) |
| Google-News-SPOF 93 % + Staleness ~6,6 d + 429 | §3/§6.2 | hoch | offen (P1-7) |
| P0-2 Neutralitätsdefekt in BE/BB-Basis auf `main` | §4 | mittel | Behebung in PR #118 |
| Keine Live-Verifikationsfähigkeit in dieser Umgebung | §0 | mittel | Umgebungsbedingt; Egress-Runner nötig |
| A&S-Query-Redundanz (P2-8) | §3 | niedrig | offen, Fachpaket-Arbeit |

---

## 11. WARUM KEINE KATALOGÄNDERUNG ÜBERNOMMEN WURDE (Disziplin-Nachweis)

Der Auftrag ist eindeutig: *„Nur verifizierte Erkenntnisse dürfen übernommen werden"*, *„Nur
übernehmen, wenn alle Prüfungen bestanden wurden"*, *„Keine hypothetischen Quellen. Keine ‚könnte
funktionieren'"*, *„Wenn eine Quelle nicht eindeutig verifiziert werden kann, bleibt sie
unverändert."*

1. **Die geforderten Prüfungen (HTTP/Redirect/Parser/Feed/Rate-Limit/robots) waren für keine
   Quelle ausführbar** (§0, belegt). Damit hat **keine** Quelle „alle Prüfungen bestanden".
2. **WebSearch-Korroboration ist Existenz-/Aktualitätsevidenz, kein Feed-/Parser-Test.** Auf ihrer
   Basis eine URL im Live-Katalog zu ändern, wäre „könnte funktionieren" — explizit untersagt.
3. **Die stärksten Kandidaten (dielinkebt `feed.rss`, dgb `einblick/rss`, bundestag static-RSS)
   sind bereits Gegenstand von PR #118 bzw. dort als Kandidat dokumentiert.** Eine parallele,
   nicht-live-getestete Zweitänderung auf diesem Branch würde PR #118 nur duplizieren/kollidieren
   und den ausstehenden, sauber getesteten Reparaturweg verwässern.
4. **Ergebnis:** Der Katalog bleibt **byte-identisch**; die Suite bleibt **140/140 grün**; dieser
   Bericht ist das Sprint-Ergebnis. Das ist die evidenz-disziplinierte, korrekte Konsequenz —
   kein Ausweichen, sondern die vom Auftrag verlangte Ehrlichkeit.

---

## 12. STOP

Auftragsgemäß endet der Sprint hier: **kein PR, kein Merge, keine Aktivierung.** Empfohlene
nächste Schritte (nicht Teil dieses Sprints): DIP-Key prüfen (§6.1), PR #118 mergen, eine
Egress-offene Live-Verifikationsrunde ansetzen.

---

*Erstellt im Rahmen des Live-Verifikations-Sprints. Live-HTTP-Verifikation war in dieser Umgebung
policy-gesperrt (curl/WebFetch 403 für alle Hosts, Proxy-Statusendpunkt belegt); die Evidenz stützt
sich auf WebSearch-Korroboration (2026-07-25, nur Link-Ziele gewertet), die Repo-Health-Snapshots
und den Sprint-9B-Runner-Test. Alle Datei:Zeile-Belege gegen `main` (`035898b`).*
