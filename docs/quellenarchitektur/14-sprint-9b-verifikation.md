# 14 — Sprint 9B: technische Verifikation der 19 BE/BB-Abrufwege + 6 Bundes-Reparaturwege

**Stand:** 2026-07-13 · **Sprint 9B** · **Status: VERIFIKATIONS-HARNESS geliefert, echter Abruf Egress-blockiert**

---

## 0. Kernbefund (ehrlich, ohne erfundene Kennzahlen)

Der Auftrag verlangt, **jeden Weg tatsächlich gegen die echte Adresse** zu prüfen (HTTP-Status,
Content-Type, gültiges RSS/XML/HTML, Titel/Datum, Parser-Ergebnis, Bot-Sperre …). Dieser echte
Außen-Abruf ist **in dieser Ausführungsumgebung technisch nicht möglich**:

- `curl` gegen jede externe Domain → `403 CONNECT tunnel failed` (Organisations-Egress-Policy).
- `WebFetch` liefert **ebenfalls 403 — selbst für `example.com` und `en.wikipedia.org`**.
- Das 9B-Harness macht einen **Kontroll-Abruf** (`example.com`, `google.com`): beide `HTTP 403`
  → Egress **GESPERRT**. Ein per-URL „HTTP 403" stammt damit vom **Egress-Proxy**, nicht vom
  Zielserver — es ist **keine** Aussage über die Quelle.

**Konsequenz — bewusst keine erfundenen Ergebnisse:** Es wird **kein** HTTP-Status, kein
Titel, kein Datum und kein Parser-Ergebnis behauptet. Alle 25 Wege stehen ehrlich auf
`nicht_verifizierbar` (real verifiziert: **0/25**). Die 6 Bundeswege bleiben **`reparierbar`**,
**nicht „repariert"** (Auftrag: erst nach erfolgreichem echten Abruf+Parser).

Geliefert wird stattdessen der **maximale ehrliche Wert**: ein **lauffähiges Verifikations-
Harness**, das exakt die geforderten Prüfungen ausführt, sobald es in einer Umgebung **mit**
Egress läuft — plus **WebSearch-Korroboration** (WebSearch ist allowlist-erlaubt), klar als
**nicht byte-genau** gekennzeichnet.

---

## 1. Das Verifikations-Harness (`scripts/sprint9b-verify-abrufwege.js`)

Führt **echte** ausgehende HTTPS-Abrufe durch und urteilt je Weg **`geeignet` /
`geeignet mit Einschränkung` / `ablehnen`** — oder enthält das Urteil ehrlich
(`nicht_verifizierbar`), wenn der Abruf scheitert.

| Baustein | Verhalten |
|----------|-----------|
| **URL-Quelle** | liest die 25 URLs aus den Seeds (`buildLandesmodulSeed` + `BUNDESWEG_REPARATUREN`) — **kein** URL-Drift |
| **Abruf** | instrumentiert: Status, **Redirect-Kette**, Content-Type, Body (gedeckelt); realistischer Browser-UA; TLS bleibt an |
| **Parser** | **echter Produktionsparser** `crawler.parseRssItems` (aus `parseRssFeed` extrahiert) — kein Nachbau |
| **RSS/Atom** | Items>0 + jüngstes Datum ≤ 45 Tage → `geeignet`; veraltet/kein Datum → `mit Einschränkung`; HTML statt Feed → `ablehnen` |
| **Open-Data-XML** | Wohlgeformtheit + Datensatz-Elemente (`Vorgang`/`Dokument`…) → `geeignet`; HTML statt XML → `ablehnen` |
| **Bot-Sperre** | 401/403/429 oder Cloudflare/Captcha-Marker → `mit Einschränkung` (server-seitiger Abruf nötig — **nicht umgehen**) |
| **Egress-Schranke** | scheitert der Kontroll-Abruf (example.com/google.com) → **alle** Wege `nicht_verifizierbar` (kein erfundenes Urteil) |
| **Ausgabe** | Konsolentabelle + optional JSON (`--out`) |

**Aufruf in Umgebung mit Egress:** `node scripts/sprint9b-verify-abrufwege.js --out report.json`

> Wichtig: „umgehe keine technischen Zugriffsbeschränkungen" ist eingehalten — realistischer
> UA ja, aber **kein** Captcha-Solving, keine IP-Rotation, kein TLS-Abschalten. Eine echte
> Bot-Sperre führt zu `mit Einschränkung` (server-seitiger Abruf), nicht zu einem Trick.

---

## 2. Kompakte Verifikationstabelle (25 Wege)

- **Harness (hier):** Ergebnis des echten Abrufs in dieser Umgebung.
- **WebSearch-Indiz:** *nicht byte-genau* — Recherche-Beleg zur Adress-/Feed-Plausibilität.
- **Offene Korrektur:** was der echte Abruf voraussichtlich fixen muss.

### Berlin (10)

| Weg | Methode | krit. | Harness (hier) | WebSearch-Indiz (nicht byte-genau) | Offene Korrektur |
|-----|---------|:---:|----------------|-------------------------------------|------------------|
| be-landesparlament | rss | ⚠ | nicht_verifizierbar | `/service/rss-feeds` = **Hub bestätigt** (kein Feed) | **Feed-Deep-Link** statt Hub wählen |
| be-plenum | opendata_xml | ⚠ | nicht_verifizierbar | PARDOK-DB bestätigt (`pardok.parlament-berlin.de`) | `pardok-wp19.xml` byte-genau + WP-Nummer |
| be-landesregierung | rss | ⚠ | nicht_verifizierbar | LPD-Feed `berlin.de/presse/.../index/feed` plausibel | Feed-200 + Institutionsfilter prüfen |
| be-staatskanzlei | rss | ⚠ | nicht_verifizierbar | LPD + `institutions[]=Senatskanzlei` plausibel | Filter-Parameter byte-genau |
| be-landesfraktionen | rss | | nicht_verifizierbar | `/das-parlament/fraktionen` = **Landing** | je Fraktion **Deep-Link** |
| be-regionale_leitmedien | rss | | nicht_verifizierbar | Tagesspiegel `contentexport/feed/berlin` plausibel | Feed-200 + Paywall-Metadaten |
| rbb24-politik | rss | | nicht_verifizierbar | **Adresse bestätigt** `…/politik/index.xml/feed=rss.xml` | BE+BB Cross-Modul-Dedup |
| be-partei_pilot | rss | | nicht_verifizierbar | `dielinke.berlin/presse/` Landing bestätigt | `feed.rss` byte-genau |
| be-fraktion_pilot | rss | | nicht_verifizierbar | Deep-Link `…/aktuelles/presse/feed.rss` unbestätigt | Feed-Existenz prüfen |
| be-person_pilot | googlenews | | nicht_verifizierbar | Suchweg-Methode ok (Aggregator) | Batchexecute-Ausbeute prüfen |

### Brandenburg (9)

| Weg | Methode | krit. | Harness (hier) | WebSearch-Indiz (nicht byte-genau) | Offene Korrektur |
|-----|---------|:---:|----------------|-------------------------------------|------------------|
| bb-landesparlament | rss | ⚠ | nicht_verifizierbar | kanonischer Hub = `/de/rss-feeds/bb1.c.235770.de` | **URL korrigieren** (Seed: `/rss-infodienste/12411`) → Deep-Link |
| bb-plenum | opendata_xml | ⚠ | nicht_verifizierbar | parldok-Open-Data plausibel | `exportWP8.xml` byte-genau + WP-Nummer |
| bb-ausschuesse | rss | ⚠ | nicht_verifizierbar | `/de/ausschuesse` = **Landing** | je Ausschuss **Deep-Link** |
| bb-landesregierung | rss | ⚠ | nicht_verifizierbar | **kein RSS gefunden** (Presse = CMS-Detailseiten) | Deep-Link **oder** googlenews-Ersatz |
| bb-staatskanzlei | rss | ⚠ | nicht_verifizierbar | **kein RSS** auf `stk.brandenburg.de` (CMS) | Deep-Link **oder** googlenews-Ersatz |
| bb-ministerien | rss | ⚠ | nicht_verifizierbar | `mil.brandenburg.de/…/rss/` als Muster | je Ministerium Feed byte-genau |
| bb-landesfraktionen | rss | | nicht_verifizierbar | `/de/fraktionen` = **Landing** | je Fraktion **Deep-Link** |
| bb-regionale_leitmedien | googlenews | | nicht_verifizierbar | Suchweg `site:maz-online.de` ok | Ausbeute + Paywall prüfen |
| bb-partei_pilot | rss | | nicht_verifizierbar | `…/nc/politik/aktuell/feed.rss` unbestätigt | Feed-Existenz prüfen |

### Bund — Reparaturwege (6)

| Weg | Methode | krit. | Harness (hier) | WebSearch-Indiz (nicht byte-genau) | Status |
|-----|---------|:---:|----------------|-------------------------------------|--------|
| bundestag | rss | ⚠ | nicht_verifizierbar | Hub `/services/rss/` bestätigt; Dateiname offen | **reparierbar** (nicht repariert) |
| bundesregierung | rss | ⚠ | nicht_verifizierbar | **exakte Adresse bestätigt** `…/RSS_Breg_aktuell/RSSNewsfeed.xml` | **reparierbar** (nicht repariert) |
| die-linke | rss | ⚠ | nicht_verifizierbar | `/start/presse/feed.rss` **nicht** bestätigt; Alt: `/themen/nachrichten/feed.rss` | **reparierbar** — URL klären |
| linksfraktion | rss | ⚠ | nicht_verifizierbar | **bestätigt** `dielinkebt.de/presse/pressemitteilungen/feed.rss` (2026-Items) | **reparierbar** (nicht repariert) |
| ausschuss-arbeit-soziales | googlenews | | nicht_verifizierbar | Ersatz-Suchweg ok (kein direkter Feed) | **ersatzweg_noetig** |
| dgb | rss | | nicht_verifizierbar | Presse-RSS aus OPML zu ziehen | **reparierbar** (nicht repariert) |

**Zusammenfassung Harness (hier):** geeignet 0 · mit Einschränkung 0 · ablehnen 0 ·
**nicht_verifizierbar 25**. **Kein Weg** real verifiziert (Egress). **Kein Urteil erfunden.**

---

## 3. Tests

| Test | Zweck | Ergebnis |
|------|-------|----------|
| `scripts/sprint9b-verify-test.js` | Bewertungslogik + echter Parser + Egress-Schranke gegen Fixtures | **31 PASS / 0 FAIL** |
| `scripts/landesmodule-kandidaten-test.js` | BE/BB-Kandidaten + Struktur + Bundeswege (5+1, 4/4 kritisch) | **71 PASS / 0 FAIL** |
| `scripts/source-architecture-test.js` | Gesamtmodell-Integrität | **88 PASS / 0 FAIL** |
| `scripts/sprint6-cem-migration-test.js` | Migration/Cem-Regressionsschutz | **39 PASS / 0 FAIL** |

Der `parseRssItems`-Refactor in `crawler.js` ist **verhaltensgleich** (Extract-Method); die
RSS-Fixtures im 9B-Test beweisen die korrekte Item-/Titel-/Datums-Extraktion. `smoke-test`
scheitert rein **umgebungsbedingt** (Live-HTTP „Host not in allowlist"), unabhängig von 9B.

---

## 4. Exakte Liste: was sicher als `prepared` in Production eingetragen werden kann

**Wichtige Klarstellung (Reifegrad-Modell):** `prepared` bedeutet ausdrücklich
**unverifiziert + technisch inaktiv**. Der `prepared`-Eintrag ist **unabhängig** von der
byte-genauen Verifikation **risikofrei** — er crawlt nichts (`status=needs_review`,
`activation_mode=manual`, Landespaket `prepared`; Test: **0 aktive Abrufwege**). Die drei
Urteile (`geeignet`/…/`ablehnen`) sind das Gate für die **Aktivierung**, **nicht** für den
prepared-Eintrag.

**Sicher als `prepared` eintragbar (inert, kein Crawl) — die vollständige BE/BB-Struktur:**

- **14 Herausgeber** (publishers)
- **4 neue Landes-Entitäten** (`party-linke-berlin`, `group-agh-linke`,
  `person-tobias-schulze`, `party-linke-brandenburg`)
- **19 Abrufwege** (retrieval_paths) — alle `needs_review` / `manual` / **inaktiv**
- **20 Paketzuordnungen** (Berlin 10 + Brandenburg 10, Pakete `prepared`)
- politische Ebene `land` + Geografie je Weg

Diese Anwendung auf Production ist — wie die Bund-Migration — ein **eigener,
freigabepflichtiger Schritt** (DB-Insert). Er ist **noch nicht** ausgeführt.

**Vor jeder Aktivierung** (separat, nach Freigabe): 9B-Harness in Egress-Umgebung laufen
lassen → nur Wege mit `geeignet`/`geeignet mit Einschränkung` aktivieren; `ablehnen` und die
oben markierten Landing/Hub/Root-Wege vorher per Deep-Link korrigieren.

**6 Bundeswege:** bleiben reine Dokumentation (`angewendet=0`), **reparierbar**, **nicht
repariert** — Aktivierung/Umschreibung erst nach echtem Abruf+Parser.

---

## 5. Offene Risiken

- **Byte-genaue Verifikation aller 25 Wege ausstehend** (Egress der Umgebung). Einziger
  belastbarer Nachweis: 9B-Harness in Umgebung mit Egress.
- **Korrektur-Backlog (aus Harness-Logik + WebSearch):** Landing/Hub/Root statt Feed bei
  `be-landesparlament`, `be-landesfraktionen`, `bb-landesparlament` (URL korrigieren),
  `bb-ausschuesse`, `bb-landesregierung`, `bb-staatskanzlei`, `bb-landesfraktionen`;
  Feed-Pfad `die-linke` (Bund) klären.
- **Kein RSS bei Brandenburg StK/Landesregierung** (CMS-Detailseiten) → ggf. googlenews-Ersatz.
- **Wahlperioden-Nummer** (`pardok-wp19`, `exportWP8`) an laufende WP gebunden.
- **Paywall** (Tagesspiegel Plus, MAZ+) → nur Metadaten; **rbb24** BE+BB deduplizieren.
