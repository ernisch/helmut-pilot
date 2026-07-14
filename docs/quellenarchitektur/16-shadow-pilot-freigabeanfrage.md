# Sprint 9C — Shadow-Pilot Berlin/Brandenburg · Freigabeanfrage

**Status: VORBEREITET — nichts ausgeführt. Wartet auf ausdrückliche Freigabe („Go").**
Datum der Vorbereitung: 2026-07-14

Dieser Pilot beobachtet **6 stabile Berlin/Brandenburg-Abrufwege** unter realen Bedingungen,
**ohne** die Live-Produktion (Lage, Radar, Helmut, Büro) zu berühren. Es wird **nichts** in
Production geschrieben, **keine** Quelle aktiviert, **kein** Cron/Flag/Deployment gesetzt, **kein**
LLM aufgerufen und **keine** Bot-Sperre umgangen.

Die Auswahl und die Isolationsbehauptung wurden vorab durch eine Kartierung des echten Datenflusses
(6 Agenten) und eine **adversariale Isolationsprüfung** (Versuch, ein Leck zu beweisen) abgesichert.
Zwei von drei Verifizierern (`read-leck`, `pipeline-leck`) konnten **kein Leck widerlegen**; der
dritte (`schema-leck`) **brach technisch ab** — sein Aspekt ist durch Befund 5 des read-leck-
Verifizierers bereits beantwortet (siehe §8, Ehrlichkeitshinweis).

---

## 1. Ausgewählte Abrufwege (6) und Begründung

Auswahl aus den 18 verifizierten BE/BB-Wegen nach **zwei Achsen**: hohe technische Sicherheit
(deterministische Parser bevorzugt) **und** hoher politischer Nutzen. Beide Länder voll abgedeckt,
voller Methoden-Mix, Mehrheit (4/6) auf den sichersten Methoden.

| # | Weg (`legacy_source_id`) | Land | Klasse | Methode | Parser | Kritisch | Tech-Sicherheit | Begründung (kurz) |
|---|---|---|---|---|---|:--:|:--:|---|
| 1 | `be-plenum` | Berlin | Plenum/Drucksachen/Anfragen/Gesetzgebung | `opendata_xml` | pardok-xml | ✅ | hoch | Amtliche Primärquelle AGH Berlin, deterministischer Open-Data-XML-Abruf (PARDOK WP19, R3: 8108 `<Dokument>`, HTTP 200). Deckt allein 4 Pflichtklassen. |
| 2 | `bb-plenum` | Brandenburg | Plenum/Drucksachen/Anfragen/Gesetzgebung | `opendata_xml` | pardok-xml | ✅ | hoch | Symmetrisches BB-Gegenstück, Landtag Brandenburg parldok WP8 (R3: 6092 `<Vorgang>`, HTTP 200). |
| 3 | `be-regionale_leitmedien` | Berlin | Regionale Leitmedien | `rss` | rss-regex | – | hoch | Direkter RSS-Feed Tagesspiegel Berlin (R3: 20 Items/0 Tage). Journalistische Einordnung. |
| 4 | `rbb24-politik` | **beide** | ÖR-Landesberichterstattung | `rss` | rss-regex | – | hoch | Direkter RSS-Feed rbb24 Politik (R3: 20 Items/0 Tage). **Ein Weg deckt BE+BB.** |
| 5 | `be-landesregierung` | Berlin | Landesregierung/Ministerien | `googlenews_search` | googlenews-batchexecute | ✅ | mittel | Exekutive Senat Berlin — die legislativen Open-Data-Wege erfassen sie nicht (R3: 20 Items/3 Tage). |
| 6 | `bb-landesregierung` | Brandenburg | Landesregierung/Staatskanzlei | `googlenews_search` | googlenews-batchexecute | ✅ | mittel | Exekutive Brandenburg (R3: 20 Items/0 Tage). |

**Vollständig ausgeschlossen (harte Sperre, Bot-gesperrt — nie in der Auswahl):**
`be-partei_pilot`, `be-fraktion_pilot`, `bb-partei_pilot` (alle R3 „geeignet mit Einschränkung"
wegen HTTP 429 — Sperre **nicht** umgangen). Diese IDs sind im Harness zusätzlich als
`BOT_EXCLUDED` gelistet und würden einen Startabbruch auslösen, falls sie versehentlich in die
Auswahl gerieten.

**Konkrete Adressen** (aus den Seeds, Single Source of Truth — kein URL-Drift):
- `be-plenum` → `https://www.parlament-berlin.de/opendata/pardok-wp19.xml`
- `bb-plenum` → `https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml`
- `be-regionale_leitmedien` → `https://www.tagesspiegel.de/contentexport/feed/berlin`
- `rbb24-politik` → `https://www.rbb24.de/politik/index.xml/feed=rss.xml`
- `be-landesregierung` → `https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de`
- `bb-landesregierung` → `https://news.google.com/rss/search?q=Landesregierung%20Brandenburg&hl=de&gl=DE&ceid=DE:de`

---

## 2. Crawl-Frequenz

- **Ausschließlich manuell** (`workflow_dispatch`). **Kein Cron, kein Zeitplan, kein
  `pull_request`-Trigger** (respektiert „kein Cron").
- Vorschlag: **höchstens 1× pro Tag**, über ein **befristetes Pilotfenster von 14 Tagen** →
  **≤ 14 Läufe gesamt**. Jeder Lauf wird bewusst von einer Person ausgelöst.
- Läuft **nicht** über `/api/cron/*`, **nicht** über den Scheduler, **nicht** auf dem Produktions-
  Server, sondern als Standalone-GitHub-Action (offener Egress) — analog zum bereits akzeptierten
  Sprint-9B-Verifikations-Workflow.

---

## 3. Maximale Dokumentmenge (harte Obergrenzen)

| Grenze | Wert | Wirkung |
|---|---|---|
| Items je RSS-/Google-News-Weg | **20** (`SP_RSS_MAX`) | 4 Wege × 20 = ≤ 80 |
| Datensätze je Open-Data-Weg | **25** (`SP_OPENDATA_MAX`) | 2 Wege × 25 = ≤ 50 |
| **Gesamt-Items je Lauf** | **250** (`SP_TOTAL_CAP`) | **harte Stop-Bedingung** — bei Überschreitung wird abgeschnitten und `gestoppt` gesetzt |
| Erwartete reale Menge je Lauf | ~**130** Items (80 RSS/GN + 50 Open-Data) | weit unter dem Gesamt-Cap |
| Über 14 Läufe (grobe Schätzung) | einige Hundert **eindeutige** Dokumente | der Rest sind Duplikate (Dedup, §6) |

Nach Dedup (Ebene 1 + globaler Fundstellen-Merge) liegt die Zahl **eindeutiger** Dokumente
deutlich unter der Rohmenge.

---

## 4. Kostenlimit

- **0 € API-/LLM-Kosten.** Der Pilot ruft **kein** LLM auf (kein Understanding/Matching/Decision).
  Es entsteht **keine** `llm_usage`-Zeile.
- **0 € Supabase-/Egress-Kosten.** Es wird **keine** Supabase-Verbindung aufgebaut, kein
  Service-Role-Key verwendet, nichts in die DB geschrieben oder gelesen.
- Einziger Ressourcenverbrauch: **GitHub-Actions-Runner-Minuten** (~2–4 min je Lauf, siehe §12) —
  im kostenlosen Kontingent vernachlässigbar.
- **Kosten-Stop:** Jeder Versuch eines LLM-Aufrufs oder DB-Writes ist per Konstruktion
  ausgeschlossen (Harness requiret keine entsprechenden Module — §7/§11); ein solcher Versuch würde
  den Lauf abbrechen, nicht Kosten verursachen.

---

## 5. Parser und erwarteter Output

Es wird **der Produktionsparser** verwendet, nicht ein Neuentwurf.

| Methode | Parser | Status | Erwarteter Output je Item |
|---|---|---|---|
| `rss` (Weg 3, 4) | `crawler.parseRssItems` (rss-regex) | **real, live verdrahtet** | `title`, `url` (nur direkter, nutzbarer Nicht-Google-Link, sonst `""`), `originalUrl`, `linkType` (direct/publisher/google_proxy/missing), `content`/`excerpt`, `publishedAt` (ISO), `publisherName`, `sourceId` |
| `googlenews_search` (Weg 5, 6) | `crawler.parseRssItems` (Stufe 1) | **real, live verdrahtet** | wie RSS; Google-News liefert RSS-XML. `linkType` häufig `google_proxy` (Original-URL in `originalUrl`) |
| `opendata_xml` (Weg 1, 2) | **Shadow-Extraktor** `extractPardokRecordsShadow` | **⚠ kein Produktions-Ingest** | je `<Dokument>`/`<Vorgang>`: best-effort `title`, `url` (falls im Block), `publishedAt` (falls Datumsfeld). Bewusst konservativ, nicht schemavollständig. |

**Ehrlichkeitshinweis (wichtig):** Für `opendata_xml`/`pardok-xml` existiert in Production
**kein** Ingest-Parser — der Live-Crawler dispatcht nur auf RSS/HTML. Der Pilot nutzt daher einen
**klar als Shadow-only markierten** Minimal-Extraktor (`extractPardokRecordsShadow`), rein um den
Output der beiden Plenums-Wege beobachtbar zu machen. Ein vollständiger PARDOK→Dokument-Mapper für
den echten Ingest ist ein **eigener, späterer** Schritt (nicht Teil dieses Piloten). Die
Eignungsprobe aus Sprint 9B (Datensatzzählung) hatte diese Wege bereits als „geeignet" bestätigt.

Alle Items werden mit dem **Produktions-Normalisierer** `crawler.normalizeRawItem` in die
kanonische Roh-Item-Form gebracht (inkl. Titel-Deckelung auf 300 Zeichen als Sicherheitsschranke).

---

## 6. Deduplizierung und Fundstellenprüfung

Es werden die **Produktions-Dedup-Module** angewandt (read-only, kein DB-Write):

1. **Ebene 1 (In-Lauf):** `crawler.deduplicateRawItems` — Kollaps identischer Items über
   `hash = sha256(title|url|date)`. First-seen gewinnt. *Eigenschaft (ehrlich):* identische
   `(Titel|URL|Datum)`-Items **verschiedener Wege** kollabieren hier **bereits vor** dem globalen
   Merge; getrennte Fundstellen über mehrere Wege entstehen dadurch v. a. für Storys, die sich in
   der URL unterscheiden (z. B. Google-News-Proxy vs. direkter Verlagslink).
2. **Ebene 3 (global, Fundstellen):** `dedup-global.mergeIntoDocuments` — clustert Items zu
   **einem Dokument + N Fundstellen** über drei Signalstufen: (A) exakte Canonical-URL, (B)
   Inhaltsfingerabdruck, (C) Herausgeberdomain + Titelähnlichkeit + Datumsfenster. Jede Fundstelle
   weist aus, **welcher Weg** die Story gefunden hat (`source_id`, `retrieval_path_id`,
   `original_url`, `link_type`).

Der Pilot berichtet je Lauf: `itemsRoh`, `itemsNachDedupL1`, `dokumente`, `fundstellenGesamt`,
`dokumenteMitMehrfachFundstellen`. So wird die **Mehrfach-Abdeckung** derselben Story über
verschiedene Wege sichtbar gemacht (Auftrags-Ziel „Fundstellenprüfung"), ohne dass das
Produktions-`document_findings` (heute leer) beschrieben wird.

Optionale **read-only** Überschneidungsprüfung gegen den Live-Bestand ist **nicht** Teil des
Standardlaufs (um jeden DB-Zugriff zu vermeiden); falls gewünscht, kann sie als separater,
ausdrücklich freigegebener read-only `SELECT count(*)`-Vergleich nachgereicht werden.

---

## 7. Speicherung ausschließlich im Shadow-Modus

- **Einziges Schreibziel: eine JSON-Artefaktdatei** (`shadow-pilot-report.json`), hochgeladen als
  GitHub-Actions-Artefakt (Retention 30 Tage).
- **NICHT beschrieben werden:** `raw_documents`, `knowledge_objects`, `briefings`, `decisions`,
  `matching_results`, `ko_document_links`, `office_outputs`, `profile_embeddings` und der
  Blob-Store `helmut_store` (Zeilen `main` / `p-<id>`). Auch **keine** Datei `store.json` /
  `p-<id>.json` (die von Admin/Watchdog gezählt würde).
- Der Harness **requiret** ausschließlich reine Fetch-/Parse-/Dedup-Module (`crawler`,
  `dedup-global`) plus die Seeds. Er requiret **kein** `storage`-Schreibmodul, **keinen**
  `scheduler`, **kein** `understanding`/`matching`/`decisions`. Eine **Selbstprüfung**
  (`isolationSelfCheck`) bricht den Start ab, falls doch ein verbotenes Modul im require-Graph
  auftaucht.
- Die 6 Wege werden **nicht** in `store.sources` eingetragen → der Live-Crawl (nutzt `v1Sources`)
  sieht sie nie. In `retrieval_paths` stehen sie als `status='needs_review'`,
  `activation_mode='manual'` → der Scheduler crawlt sie ohnehin nie.

---

## 8. Nachweis: Lage, Radar, Helmut, Büro bleiben unverändert

Kartierung der 4 Lese-Oberflächen (mit Belegen) ergab: **keine** liest eine isolierte Shadow-Ablage.

| Oberfläche | Endpoint | Liest | Berührt Shadow-Artefakt? |
|---|---|---|---|
| **Lage** | `/api/lage/briefing` | `knowledge_objects` (global) + `raw_documents` je Vorgang (über `ko_document_links`) | **nein** |
| **Radar** | `/api/radar/archive` | `knowledge_objects` (global), Feld `best_source_url` | **nein** |
| **Helmut** | `/api/briefing/latest`, `/api/briefing/run` | `knowledge_objects` (global) + `raw_documents` je Vorgang | **nein** |
| **Büro** | `/api/office/generate`, `/api/tasks` | ein `knowledge_object` je `vorgang_id`; JSON-Store `tasks`/`office_outputs` | **nein** |

**Begründung der Unveränderlichkeit:**
1. Alle vier lesen nur `knowledge_objects` und (vorgang-gefiltert) `raw_documents` sowie feste
   `helmut_store`-Zeilen/Templatepfade. Der Pilot schreibt in **keine** davon.
2. `knowledge_objects` entstehen **nur** aus `raw_documents` per Understanding (LLM). Der Pilot
   schreibt **kein** `raw_documents` und ruft **kein** Understanding → **keine** neuen KOs → die 4
   Oberflächen sehen **nichts** Neues.
3. Die App spricht **9 hartcodierte** `/rest/v1/<Tabelle>`-Pfade an; **keine** schemaweite
   Tabellen-Aufzählung (`information_schema`/`pg_catalog`/VIEW/UNION), **kein** Verzeichnis-Glob.
   Eine isolierte Shadow-Tabelle mit anderem Namen bzw. eine Artefaktdatei mit anderem Dateinamen
   gelangt daher in **keinen** Read (Befund 5 des `read-leck`-Verifizierers).

**Adversariale Isolationsprüfung (Zusammenfassung):**
- `read-leck`: **nicht widerlegt** — kein Read-Leck; die 4 Oberflächen lesen nur benannte Tabellen/
  feste Dateinamen.
- `pipeline-leck`: **nicht widerlegt** — Crawler (`crawlSource`/`parseRssItems`) ist sauber von
  Storage und Pipeline entkoppelt; alle Schreib-/Understanding-/`llm_usage`-Schritte liegen erst im
  Scheduler **nach** `saveRawItems`, den der Pilot nie aufruft.
- `schema-leck`: **technischer Abbruch** des Verifizierers (Tool-Retry-Limit, kein Befund). Seine
  Frage („erreicht die Shadow-Ablage über eine schemaweite Aufzählung doch einen Read?") ist durch
  Befund 5 des `read-leck`-Verifizierers **inhaltlich bereits beantwortet** (keine solche
  Aufzählung; 9 hartcodierte Tabellenpfade). Dieser Punkt wird ehrlich als **nicht durch einen
  eigenständigen Verifizierer** bestätigt ausgewiesen und im Go-Smoke-Test (§11) zusätzlich durch
  einen Vorher/Nachher-Count abgesichert.

---

## 9. Stop-Bedingungen (sofortiger Abbruch)

Der Lauf stoppt bzw. der Weg wird übersprungen, wenn:
1. **Isolationsverletzung:** ein verbotenes Modul (`storage`/`scheduler`/`understanding`/…) im
   require-Graph → **Startabbruch** vor jedem Abruf.
2. **Bot-Quelle in Auswahl:** eine der 3 `BOT_EXCLUDED`-IDs in `SELECTED` → **Startabbruch**.
3. **Mehr als 6 Wege** in der Auswahl → **Startabbruch**.
4. **Bot-Sperre je Weg:** HTTP 401/403/429 oder Bot-Body-Marker → Weg als `bot_gesperrt`, **0
   Items**, **kein** Retry, **keine** Umgehung.
5. **Egress gesperrt:** Kontroll-Abruf (example.com/google.com) nicht 2xx → **alle** Wege
   `nicht_verifizierbar`, **kein** erfundenes Ergebnis, Exit 0.
6. **Mengen-Cap:** Gesamt-Items > 250 → Abschneiden + `gestoppt`-Vermerk, Abbruch der Restwege.
7. **Offline-Test rot:** die harte CI-Schranke (`shadow-pilot-test.js`) schlägt fehl → **kein**
   Crawl-Schritt.

---

## 10. Vollständiger Rollback

**Der Rollback ist trivial, weil der Pilot keinerlei Production-Zustand schreibt.**
- Es gibt **nichts** in der DB oder im `helmut_store` rückgängig zu machen (0 Writes).
- Einziges Artefakt: die Workflow-JSON-Datei → **löschen/verwerfen** (bzw. Artefakt in GitHub
  Actions entfernen). Damit ist der Zustand vollständig zurückgesetzt.
- **Kein** `DROP TABLE`, **kein** `DELETE`, **kein** Seed-Rückbau nötig, da keine Tabelle/Zeile
  angelegt wurde.
- Falls in einer späteren Ausbaustufe (ausdrücklich getrennt freizugeben) doch eine isolierte
  Shadow-Tabelle genutzt würde, wäre deren Rollback ein einzelnes `DROP TABLE <shadow-tabelle>` mit
  Nachweis, dass **keine** der 9 Live-Tabellen berührt wurde — **nicht** Teil dieses Piloten.

---

## 11. Smoke-Tests / Integritätsprüfungen

**Vor Go bereits grün (offline, reine Logik — keine erfundenen Zahlen):**
`node scripts/shadow-pilot-test.js` → **27/27 PASS**, u. a.:
- genau 6 Wege, **keine** der 3 Bot-Quellen, **beide** Länder, Methoden-Mix 2/2/2;
- Isolations-Selbstprüfung ok (kein `storage`/`scheduler`/`understanding`/… im require-Graph);
- Bot-Sperre respektiert (429/403/Body-Marker → 0 Items, kein Retry);
- Egress-Fehler → `nicht_verifizierbar` (kein erfundenes Ergebnis);
- RSS via Produktionsparser (2 Items), PARDOK-Shadow-Extraktor (3 Datensätze);
- Dedup Ebene 1 (Hash-Kollaps) + globaler Fundstellen-Merge (1 Dokument, 2 Fundstellen über 2 Wege).

**Beim/nach dem Go-Lauf (auf dem Runner bzw. read-only gegen Production):**
1. Report-Feld `isolation.ok === true`, `isolation.verboteneModule === []`.
2. Report-Feld `egressOffen === true` und je Weg ein Befund
   (`items`/`bot_gesperrt`/`leer`/`nicht_verifizierbar`).
3. **Vorher/Nachher-Count (read-only, ausdrücklich freizugeben):**
   `select count(*) from raw_documents / knowledge_objects / briefings` vor und nach dem Lauf →
   **Delta muss 0 sein**. (Dies deckt zusätzlich den abgebrochenen `schema-leck`-Aspekt ab.)
4. Optionaler Payload-Hash-Vergleich von `/api/lage/briefing` + `/api/radar/archive` vor/nach →
   unverändert.

---

## 12. Erwartete Laufzeit

- **Netto-Crawl:** 6 Abrufe + Parsen + Dedup, **kein** LLM → ~**30–90 s** je Lauf (Timeout je
  Abruf 12 s; Google-News/Open-Data ggf. etwas langsamer).
- **GitHub-Actions-Job gesamt** (Checkout + `npm install` + Offline-Test + Crawl + Artefakt-Upload):
  ~**2–4 min**.

---

## Was auf „Go" passiert (und was nicht)

**Auf Go:** der manuell startbare Workflow `.github/workflows/shadow-pilot.yml` wird einmal
ausgelöst (offener Runner-Egress). Er testet zuerst offline, führt dann den isolierten
Beobachtungslauf aus und lädt `shadow-pilot-report.json` als Artefakt hoch. Danach werte ich das
Artefakt aus und liefere einen ehrlichen Bericht (je Weg: Items/Befund, Dokumente, Fundstellen,
Isolationsnachweis).

**Nicht Teil des Piloten (bleibt gesperrt):** Production-Datenänderung, Quellenaktivierung,
Paketaktivierung, Flags, Cron, Deployment, Crawl über den Scheduler, Veränderung an
`raw_documents`/`knowledge_objects`/`briefings`, Umgehung von Bot-Sperren, PARDOK-Produktions-Ingest.

**Bereitgestellte Dateien (vorbereitet, nichts ausgeführt außer dem Offline-Test):**
- `scripts/shadow-pilot-crawl.js` — isolierte Beobachtungs-Harness (Artefakt-only)
- `scripts/shadow-pilot-test.js` — Offline-Logiktest (27/27 grün)
- `.github/workflows/shadow-pilot.yml` — manueller, sicherer Workflow (keine Secrets, `contents: read`)
- dieses Dokument
