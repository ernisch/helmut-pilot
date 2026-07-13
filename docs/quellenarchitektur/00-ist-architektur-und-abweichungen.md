# Phase 0 — Ist-Architektur & Abweichungsliste (Neue Quellenarchitektur)

**Stand:** 2026-07-13 · **Modus:** rein lesend (keine Prod-/Cron-/Migrations-/Secret-Änderung) ·
**Prod-Supabase:** `ddckuvvpcytqbyfmbvie` (Postgres 17, eu-west-1)

> **Zweck dieses Dokuments:** Vollständige, am echten Code und an den echten Prod-Daten belegte
> Ist-Aufnahme des Helmut-V3-Datenmotors, geprüft gegen die im Auftrag geforderte Zielarchitektur.
> Keine Auftragsannahme wurde blind übernommen; jede wurde gegen Code/DB/Audit-CSV verifiziert.

## Methodik & Belegbasis

- **Codeanalyse:** 10 parallele Subsystem-Leser (Staff-Engineer-Rolle) über `lib/helmut/*.js`,
  `server.js`, `client.js`, `supabase/migrations/*`, `vercel.json` mit `file:line`-Belegen; 9/10
  strukturiert ausgewertet + Synthese. Der Leser `storage-datenmodell` fiel technisch aus
  (Antwort-Overflow); seine Kernbefunde sind über die anderen neun Analysen (Persistenz-Whitelist,
  `helmut_store`-Blob, `v3Upsert`, `buildLlmUsageRecord`) dennoch belegt und werden in Sprint 1 beim
  Bau der Persistenzschicht gezielt nachverifiziert.
- **Datenbank:** `list_tables`, `information_schema`-Spaltenabfragen und Zähl-SELECTs gegen die
  Prod-DB (read-only).
- **Quellen-Audit:** Vollständige Lektüre der vom Betreiber gelieferten `quellen-audit.csv`
  (157 Zeilen) + 4 Berichte (`quellenbestand`, `quellenzustand`, `quellenabdeckung-profile`,
  `quellenluecken-bund-berlin-brandenburg`).
- **Betriebskontext:** `docs/V3_MIGRATION_PLAN.md`, `docs/multitenancy-abschlussbericht.md`,
  Supabase-Security-Advisors.

## Baseline-Kennzahlen (Phase 1 — messbarer Ausgangszustand)

| Kennzahl | Wert | Quelle |
|---|---|---|
| `raw_documents` | **4805** | DB |
| `knowledge_objects` | **231** | DB |
| davon `political_level` befüllt | **0 / 231** | DB |
| davon `embedding` befüllt | **0 / 231** | DB |
| `ko_document_links` | **1127** (~4,9 Docs/KO) | DB |
| `decisions` | **78** (alle `user_id=cem-ince`) | DB |
| `matching_results` | **0** | DB |
| `profile_embeddings` | **1** (nur Cem) | DB |
| `briefings` | **4** | DB |
| `llm_usage` (Tabelle) | **0** — Kosten liegen im `helmut_store`-Blob (~1681 Einträge) | DB + Analyse |
| `public.sources` (Tabelle) | **0** — Katalog liegt hartkodiert im Code | DB + Analyse |
| Kuratierte Quellen | **144** (+ 13 Orphan = 157 CSV-Zeilen) | Audit-CSV |
| Direkt-Feeds gesund / defekt | **3 / 6** (nicht „7 defekt") | Audit-CSV |
| Berlin/Brandenburg-Crawlquellen | **0** | Audit |

## Verifikation der Auftrags-Eckdaten (Abschnitt 6 des Auftrags)

Alle 13 Eckdaten wurden gegen `quellen-audit.csv`, Code und DB geprüft — **alle bestätigt**:

| # | Auftrags-Eckdatum | Verifikation |
|---|---|---|
| 1 | 144 kuratierte Quellen | ✅ CSV: 144 mit `im_katalog=ja` |
| 2 | 157 Einträge (13 ältere mit Docs) | ✅ CSV: 157 Zeilen, 13× `im_katalog=nein` (9× `cem-ince-news-*`, 4× `test-mdb-news-*`) — dazu `dip` als 14. Sonderfall (gewollt aktiv, nicht als Katalogeintrag geführt) |
| 3 | 53 neutrale Bundesquellen | ✅ CSV/Bericht: `gate=neutral` = 53 |
| 4 | 84 fachlich tiefe Quellen (fast nur Arbeit&Soziales) | ✅ `gate=thema:social` = 84 |
| 5 | wenige regionale Quellen (Cems Region) | ✅ nur 4 (Niedersachsen) überleben Kuratierung |
| 6 | keine Landtags-/Landesregierungsabdeckung | ✅ 0 Landes-Crawlquellen |
| 7 | viele Quellen über Google News | ✅ 135/144 via `GoogleNews-RSS` |
| 8 | mehrere hochwertige Direktquellen ohne Dokumente | ✅ 6 Direkt-Feeds mit 0 Docs |
| 9 | Berlin/Brandenburg praktisch unversorgt | ✅ 0 Quellen |
| 10 | `political_level` bei KOs leer | ✅ 0/231 |
| 11 | regionale Quellen durch Kuratierung aussortiert | ✅ `keepCuratedSource` Prio-Schwelle 64/68 + Doppel-Gate |
| 12 | Abdi/Abraham/Achelwilm dünner versorgt als Cem | ✅ nur 53–55 von 144 Quellen |
| 13 | Audit nennt „7 defekt", real 6 defekt / 3 gesund | ✅ Widerspruch reproduziert: `quellenzustand.md` §2-Überschrift sagt „7 von 9", die Tabelle daneben listet **6 defekt + 3 gesund**. Verifizierte Wahrheit: **6 defekt / 3 gesund** |

**Bekannt gesund:** Deutschlandfunk (471), Tagesschau (338), BMAS (19).
**Bekannt defekt (0 Docs):** Bundestag, Bundesregierung, Die Linke, Linksfraktion, DGB (HTML), Ausschuss Arbeit und Soziales (HTML).

---

# Ist-Architektur Helmut V3 (Datenmotor & Quellen)

Dieses Dokument fasst neun Subsystem-Analysen zum tatsächlichen Ist-Zustand des Helmut-Repos zusammen (Stand 2026-07-13, Prod-Supabase `ddckuvvpcytqbyfmbvie`) und prüft ihn gegen die Zielarchitektur der neuen Quellenarchitektur. Helmut ist ein politischer KI-Stabschef mit den vier Produktbereichen **Lage** (allgemein Wichtiges), **Radar** (rund ums Profil), **Helmut** (was jetzt tun) und **Büro** (vorbereitete Ergebnisse). Diese Bereichstrennung existiert im UI, ist im Datenmotor aber noch nicht sauber getrennt.

## Tatsächlicher Datenfluss

**1. Quellen (Code statt DB).** Der Quellenkatalog ist vollständig hartkodiert als Konstante `v1Sources` (`lib/helmut/sources.js:570-596`) und wird über `storage.getSources()` (`storage.js:1891-1893`) aus dem geteilten JSON-Blob `helmut_store` (Zeile `id='main'`) geladen. Die Relationstabelle `public.sources` ist leer (0 Zeilen) — totes Legacy-Schema. „Code ist die Wahrheit" (`mergeSources` behält nur `custom=true`-DB-Quellen, `storage.js:1757-1777`). Ein Source-Objekt verschmilzt Herausgeber und Abrufweg in einem flachen Objekt (Fabriken `directSource`/`googleNewsSource`/`siteSource`, `sources.js:35-71`); bei Google News steckt der Herausgeber nur implizit als `site:domain` im Suchstring. **135 der 144 kuratierten Quellen** sind Google-News-Suchen (`crawlMethod=rss` gegen `news.google.com`), nur **9 Direkt-Feeds** — davon exakt **3 gesund** (deutschlandfunk-politik 471, tagesschau-politik 338, bmas 19 Docs) und **6 defekt/0-Docs** (bundestag, bundesregierung, die-linke, linksfraktion, dgb, ausschuss-arbeit-soziales). Der Google-News-`batchexecute`-Auflöser ist damit ein **Single Point of Failure** für ~94 % der Quellen. Gate-Klassen: 53 neutral (Bund), 84 `thema:social`, 4 regional, 2 partei, 1 person.

**2. Crawl (profilgebunden).** `runSourceCrawl(politicianId)` (`scheduler.js:155-263`) leitet je Lauf frisch die Quellen aus dem aktiven Profil ab (`getSourcesForProfile`/`sourceAllowedForProfile`, `scheduler.js:422-498`), crawlt via `crawlAllSources` (`crawler.js:22-49`, Concurrency 20, Timeout 7 s, 10-MB-Cap, TLS an), mischt DIP inline ein (`scheduler.js:170-173`) und löst Google-News-Links vierstufig zur Original-URL auf (`resolveArticleUrl`/`decodeGoogleNewsPageUrl`, `crawler.js:149-229`). Es gibt **keinen globalen, abrufweg-basierten Crawl** und **keine Referenzzählung**; jedes Profil würde geteilte Quellen erneut ziehen.

**3. Raw Documents & Dedup.** Persistiert wird doppelt: in den V2-Blob (`saveRawItems`, `storage.js:1779`) und als Schatten in `raw_documents` (`persistRawDocumentsShadow`, gated `HELMUT_V3_STORE`) mit idempotentem Upsert auf `id=rd-<content_hash>` (`v3Upsert`, `storage.js:747-766`). Es existieren **zwei divergierende Dedup-Identitäten**: der Crawler-Hash `sha256(title|url|date)` (`crawler.js:434`) und der V3-`content_hash` canonical-URL-first (`dedup.js:72-79`). `content_hash` ist fehlbenannt — es ist ein URL/Titel-Hash, kein Inhaltsfingerabdruck (Volltext wird DSGVO-bedingt nicht gespeichert). Ein **Fundstellen-Modell fehlt**: nur ein einziges `originalUrl` wird geführt (`crawler.js:445`), beim Merge bleibt das erste erhalten. DB-Ist: `raw_documents=4805`, `cluster_id` in **0/4805** gesetzt, `content_hash` 4805/4805 distinct, aber **157 normalisierte Titel-Keys verteilen sich auf >1 Canonical-URL** (dieselbe Story als getrennte Zeilen); 711 Publisher-Hosts nur implizit in `canonical_url`, ohne Herausgeber-Entität.

**4. Understanding & KO-Bildung.** `clusterRawDocuments` gruppiert rein lexikalisch über Anker-Token ≥8 Zeichen (`understanding.js:41-69`), `deriveVorgangId` bildet eine stabile ID. Pro Vorgang läuft **genau ein globaler KI-Call** (Azure `gpt-5-mini`, `politicianId=null`, strukturierte JSON-Ausgabe gegen `KNOWLEDGE_OBJECT_SCHEMA`); `assembleKnowledgeObject` (`understanding.js:429-477`) übernimmt nur Whitelist-Felder. DB-Ist: `knowledge_objects=231`, `ko_document_links=1127` (~4,9 Docs/KO). **`political_level` ist bei allen 231 leer, `embedding` bei allen 231 leer**; `tags` 161/231 und `policy_field` 61/231 kommen ausschließlich aus einem separaten Backfill (`ko-enrichment.js`), nicht aus dem Understanding-Call. Die Zielfelder `decision_level`/`related_levels`/`affected_geographies`/`mentioned_geographies`/`decision_entities`/`related_entities` existieren im Schema nicht; es gibt nur flache `text[]`-Erwähnungen ohne Hierarchie/IDs und einen eindimensionalen `confidence_score`.

**5. Matching & Decisions.** `matchProfileToKnowledgeObjects` (`matching.js:316`) ist vollständig deterministisch, KI-frei und wird bei **jeder** Anfrage read-time neu gerechnet. Weil `ko.embedding` bei allen 231 NULL ist, greift immer der Recompute-Zweig (`matching.js:330`) mit einem Hashing-Trick-Vektor (256-dim, **kein** semantisches Embedding). `scoreKnowledgeObject` (`decisions.js:64-80`) mischt persönliche Relevanz (Feature-Gewichte Ausschuss 34/Partei 22/Wahlkreis 20/Thema 12) und vermeintliche Wichtigkeit (Similarity 24, Urgency 8, Evidence 4, Confidence 4) in **eine** 0-100-Zahl (Schwelle 60/40). Da `deadline` in allen 78 Decisions leer ist, feuert der Urgency-Bonus nie: der Höchstscore ohne harten Feature-Treffer ist 24+4+4=32<40 → immer „Ignorieren"; die Kosinus-Ähnlichkeit ist faktisch dekorativ. `matching_results=0` (RPC leer wegen fehlender KO-Embeddings, plus `HELMUT_V3_MATCHING` aus), `profile_embeddings=1`. Die persistierte `decisions`-Tabelle (78 Zeilen, alle `cem-ince`) wird von keinem Produktions-Read gelesen (`listDecisions` ohne Aufrufer); der echte Read-Pfad rechnet `decideForUser` jedes Mal neu (`server.js:1533-1565`).

**6. Produktbereiche.** Alle vier lesen dieselbe globale Basis (verstandene `knowledge_objects` + `raw_documents`), personalisiert über denselben `decisions`-Score. **Lage** (`lage.js:288-320`) rankt mit dem **persönlichen** Profil-Matching (nicht global) und erzeugt 1 gecachtes KI-Narrativ pro Mandant (`rendered_briefings_v3`); Fallback #3 zeigt schlicht die neuesten Vorgänge. **Radar** ist doppelt implementiert (`radar.js` Bucket-Modell vs. `radarState.js` Lesevertrag). **Helmut** und Radar-State sind deterministische 0-KI-Read-Adapter. **Büro** läuft live über den V2-Pfad `/api/communication/generate` (`client.js:10727-10764`); die saubere V3-Engine `office.js` (KO-basiert, `office_outputs`-Cache) ist hinter `HELMUT_V3_OFFICE=off` dormant.

**7. Scheduler, Kosten, Watchdog.** Zwei fachliche Jobs: `runSourceCrawl` und `runLageCheck` (`scheduler.js:288-354`, letzterer crawlt **ohne** Crawl-Lock → Race-Risiko). 9 Cron-Einträge (`vercel.json`) = de facto 3-4 volle Crawls/Tag. `recordLlmUsage` schreibt in den JSON-Blob `helmut_store/main-auth/data.llmUsage` (**1681 Einträge**, ~0,60 USD), **nicht** in die tote Tabelle `public.llm_usage` (0 Zeilen). Das Budget ist ein globaler **Call-Count-Deckel** (`HELMUT_MAX_LLM_CALLS_PER_DAY`), kein Kostendeckel — er beißt hart (**1045/1681 Einträge = `skipped-understanding-budget`**, das Understanding wird von anderen Calls ausgehungert). Der Watchdog kennt nur 3 grobe Achsen (ingest/output/lage, `watchdog-state.js:53-96`); Understanding ist in die output-Achse gefaltet, Matching/KO/Decisions/Kosten/kritische-Quellen/Paketversorgung sind keine eigenen Checks.

**8. Profile & Mandanten.** Es existieren **vier** parallele Profilmodelle: der In-Memory-Seed `cemInceProfile` (`config.js:7-139`), der produktive Blob `store.profiles[id]` in der geteilten `main`-Zeile, die Legacy-Tabelle `public.profiles` (3 Platzhalterzeilen, nur id/name/email) und die neue `public.mandate_profiles` (1 reiche Zeile Cem). Produktiv gelesen wird der **Blob** (`HELMUT_PROFILE_DB_MODE` aus). Der gesamte DB-Zugriff läuft über `service_role`; der JWT/`authenticated`-Pfad ist per `tenantJwtModeEnabled()=false` (`storage.js:1431-1433`) stillgelegt (Supabase-Umstellung auf asymmetrische Signing-Keys → PGRST301). **Mandantentrennung wird heute ausschließlich app-seitig** über `assertTenant`/`assertTenantRows` erzwungen; die 23 RLS-Policies sind live angewendet, aber funktional inert, weil `service_role` RLS umgeht.

## Zentrale Module und Tabellen

| Schicht | Zentrale Module | Genutzte Tabellen (Wahrheit) | Tot/ungenutzt |
|---|---|---|---|
| Quellen | `sources.js`, `sourceSafety.js`, `scheduler.js:422-498` | `helmut_store` (`v1Sources` im Code) | `public.sources` (0) |
| Crawl/Dedup | `crawler.js`, `dedup.js`, `scheduler.js:137-263` | `raw_documents` (4805) | Crawler-Hash vs. `content_hash` divergent |
| Understanding | `understanding.js`, `understanding-schema.js`, `ko-enrichment.js` | `knowledge_objects` (231), `ko_document_links` (1127) | `political_level`/`embedding` 0/231 |
| Matching/Decisions | `matching.js`, `decisions.js`, `lage.js` | `decisions` (78, read-time neu) | `matching_results` (0), `profile_embeddings` (1) |
| Produkt | `lage.js`, `radarState.js`/`radar.js`, `briefingContract.js`, `office.js` | `rendered_briefings_v3` | `office_outputs` (V3 dormant) |
| Betrieb | `scheduler.js`, `watchdog-state.js`, `storage.js:407-449` | `helmut_store/main-auth` (llmUsage, Locks) | `public.llm_usage` (0), `pipeline_locks` (tot) |
| Profile/Mandanten | `config.js`, `auth.js`, `accounts.js`, `storage.js:2298-2846` | `helmut_store` (`main`/`main-auth`/`main-p-*`) | `public.profiles` (Platzhalter), RLS inert |

## Wiederverwendbare Bausteine

Diese Bausteine tragen die Zielarchitektur und sollten erhalten/ausgebaut, nicht neu gebaut werden.

**Herausgeber-/Abrufweg-Fundament.**
- Die Feldstruktur des Source-Objekts (`id`, `url`, `rssUrl`/`rssUrls[]`, `crawlMethod`, `priority`, `maxItems`, `active`, `lastCrawledAt`, `sources.js:36-60`) ist direkt als **Abrufweg**-Schema übernehmbar; `crawlMethod` ist der Keim für das Methoden-Enum (muss um `api` und `googlenews_search` erweitert werden).
- Das Domain-Register in `sourceSafety.js:24-56` (`OFFICIAL_DOMAINS`/`PARTY_DOMAINS`/`TRUSTED_MEDIA_HIGH/MID` + 17 Landtags-Domains) ist ein **fertiger Seed für die zentrale HERAUSGEBER-Tabelle** inkl. vorbelegter Kategorie/Trust und für Berlin/Brandenburg. `type`-Enum + `TYPE_CATEGORY`-Mapping mappen direkt auf die Ziel-Entitätstypen. `isAggregator`/`categorizeSource` (`sourceSafety.js:60,129-131`) kodiert bereits „Google News ist kein Herausgeber".
- Die ~15 Modul-Arrays (`coreSources`, `deepTopicSources`, `stateAndConstituencySources` …) plus `tagSources`-Meta `{neutral, themeTerms, party, regional}` (`sources.js:99-117`) sind natürliche **Seeds für QUELLENPAKETE** (Bund Basis = neutral core, Arbeit&Soziales = `themeTerms:SOCIAL`, je Land = regional). `sourceAllowedForProfile` (`scheduler.js:481-498`) bildet fachlich exakt die Paket-Ableitung ab.

**Crawl & Dedup.**
- `canonicalizeUrl` + `TRACKING_PARAMS` (`dedup.js:35-56`): solide URL-Normalisierung als „bereinigte URL"-Signal.
- Die vierstufige Google-News-Auflösung `resolveArticleUrl` + `batchexecute`-Decoder + `bestArticleCandidate`-Scoring (`crawler.js:149-320`): der schwierigste Teil ist gebaut und liefert 4740/4805 direct-Links.
- `classifyLinkType`-Enum (direct/publisher/google_proxy/missing) als Basis für Abrufweg-Qualität.
- Sicherheits-Baseline: 10-MB-Cap, 7-s-Timeout, 6-Redirect-Limit, TLS an.

**Understanding & Persistenz.**
- Das Prinzip **„1× global verstehen (KI) → mehrfach 0-KI bewerten"** ist fundamental verankert und deckt sich mit „öffentliche Daten global EINMAL verarbeiten".
- `assembleKnowledgeObject` (Whitelist-Assembler) + `validateKnowledgeObject` + `dsgvoScan` sind ein sauberer additiver Erweiterungspunkt: neue Zielfelder lassen sich **im selben KI-Call** ohne Extrakosten erzeugen. `requestStructuredJson` fordert neue Schema-Felder automatisch mit an.
- `saveKoDocumentLinks` (N:M-Provenienz) + idempotenter `v3Upsert` (`id=rd-<hash>`) sind ein tragfähiges Once-Write-/Referenzzählungs-Fundament.
- `derivePolicyFields` + `POLICY_FIELD_LABELS` (Ausschuss→Politikfeld) als Themen-Deriver.

**Matching & Normalisierung.**
- `normalizeParty`/`normalizeCommittee` + Synonymtabellen (`matching.js:55-106`): robuste kanonische Entitäten-Normalisierung — Basis für die zentrale Entitäten-Tabelle.
- Deterministisches Hash-Embedding + Kosinus (`matching.js:167-205`): taugt als billige Matching-Schicht, **sobald** KO-Embeddings write-time persistiert werden (Berechnung nur verschieben).
- `matchedFeatures {type,value}`: fertige Erklärbarkeits-Struktur.
- `radarState.js` belegbare Relations-Prüfung (`radarRelationBeleg`, `radarState.js:153-208`): sauberes deterministisches Beleg-Modell „Profil-Dimension strukturell im Vorgang verankert" — direkt nutzbar für Profil→Paket-Ableitung und `decision_entities`.

**Betrieb, Kosten, Mandanten.**
- Lock-Infrastruktur `acquirePipelineLock`/`releasePipelineLock` (`storage.js:627`): Basis für per-Abrufweg-/per-Paket-Locks und einmaliges Global-Crawlen.
- 3-Achsen-Watchdog `classifyOperationalState` + `saveWatchdogState`/Recovery-Hysterese: erweiterbar von 3 auf N Teilprozess-Achsen. `evaluatePipelineResponse` (`watchdog-eval.js`) als netzfreier Response-Parser.
- `buildLlmUsageRecord` (`storage.js:370-403`): reine, testbare Funktion, trägt bereits `tenantId`/`runId`/`pipelineStep`/`profileId` — ideale Erweiterungsstelle für `sourceId`/`packageId`/`vorgangId`. `logLjmUsage` deckt alle Call-Sites über **einen** zentralen Log-Punkt.
- `evaluateTenantBudget` (`llm-budget.js`): saubere, DB-freie EUR-Cent-Entscheidungslogik mit Warn-/Stopp-/fail-closed-Semantik — auf Paket-/Profil-Budgets erweiterbar.
- `mandate_profiles` + `profil_extras`-JSONB (verlustfreies Mapping) als kanonische Profilbasis; `assertTenant`/`assertTenantRows` als testbarer App-Guard neben RLS; `getAllowedPoliticianIds`/`pickPoliticianId` für Paketzuordnung.
- RLS-Policygerüst + `helmut_current_tenant()` wird scharf, sobald echtes Supabase-Auth (GoTrue) statt Selbstsignierung genutzt wird.

**Admin-UI.**
- `adminSection`/`adminDetails`/`adminStatCell` (`client.js:1324-1347`) + `dsRow`/`dsCard`-Muster + Sprungmarken-System (`data-admin-jump`): fertige, ankerbare Bausteine für neue Quellen-/Paket-/Länder-Ansichten in gleicher Optik. Der Crawl-Trichter (`renderAdminCrawlStats`) ist auf Pro-Paket-Versorgung übertragbar. Das Pro-Karte-Editor-Muster (`client.js:2072-2088`) ist Vorlage für editierbare Quellen-/Paket-Karten.

## Abweichungsliste zum Auftrag

Alle Abweichungen aus den neun Analysen, dedupliziert, gruppiert nach Schwere und Themenblock. Überlappende Punkte (z. B. „Herausgeber vs. Abrufweg" aus fünf Subsystemen) sind zu je einer Zeile mit mehreren Fundstellen konsolidiert.

### Schwere: hoch

| Themenblock | Thema | Auftrag | Ist (file:line) | Sprint-Hinweis |
|---|---|---|---|---|
| Quellenarchitektur | Herausgeber und Abrufweg in einem Objekt verschmolzen; keine zentrale Herausgeber-Registry | Herausgeber (Organisation, zentral einmalig) getrennt vom Abrufweg (RSS/API/HTML/GoogleNews); 1 Herausgeber → N Abrufwege | Jedes Source-Objekt fusioniert beides (`sources.js:35-71`); `getSources()` liefert flache Liste aus JSON-Blob (`storage.js:1891`); `sourceName` als Freitext pro rawItem (`crawler.js:426`); 711 Publisher-Hosts nur implizit in `raw_documents.canonical_url`, keine Entität | Herausgeber-Tabelle extrahieren (Domain-Register aus `sourceSafety` als Seed); `rssUrl`/`crawlMethod`/`query` zu Abrufweg mit FK normalisieren; `normalizeRawItem` setzt Herausgeber-ID statt String |
| Quellenarchitektur | Publisher-Duplikate / kein zentraler Herausgeber | Herausgeber existiert einmal; globale Dedup über Herausgeberdomain/Canonical | Derselbe Herausgeber als mehrere Objekte (BMAS 3×, Die Linke 2×, `sources.js:143-524`); `raw_documents.source_name` mit 713 distinct Freitext-Werten (‚Deutschlandfunk Politik'=474 vs ‚Deutschlandfunk'=93; ‚Tagesschau Politik'=341 vs ‚tagesschau.de'=67) | Kanonisierungs-/Alias-Mapping der 713 `source_name`-Strings auf normalisierte Herausgeber |
| Quellenarchitektur | Google News als Herausgeber statt Suchweg | Google News = Aggregator/Suchweg; echten Herausgeber/Originaldomain/Canonical erkennen | 135/144 Quellen sind GN-Suchen (`sources.js:45-61`), `crawlMethod` kennt kein `googlenews_search`/`api`; `canonical_url` ist normalisierte aufgelöste URL, KEIN `rel=canonical` vom Ziel gelesen (`crawler.js:149-163`); GN nur read-time als Aggregator erkannt (`sourceSafety.js:129`) | Abrufweg-Typ `googlenews_search` einführen; am Ingest echten Herausgeber/Canonical (`<link rel=canonical>`/og:url) auflösen; Domain in Herausgeber-Registry mappen |
| Dedup/Fundstellen | Fundstellen-Modell fehlt; keine globale Single-Crawl-Referenzzählung | Ein Artikel über mehrere Suchwege → EIN Raw Document, mehrere Fundstellen; Abrufweg global 1× gecrawlt (Refcount) | Nur ein `originalUrl` (`crawler.js:445`), beim Merge bleibt das erste (`storage.js:1790`); Dedup nur nach Katalog-`id` (`uniqueSources`, `sources.js:87`); Crawl profilgebunden (`scheduler.js:155-169`); 157 Titel-Keys auf >1 Canonical als getrennte Zeilen | Fundstellen als Relation (`raw_document_id × Abrufweg × original_url × found_at`); `dedupeRawDocuments`/`saveRawItems` akkumulieren statt verwerfen; Crawl von Profil auf Abrufweg-global entkoppeln, Refcount |
| Dedup/Fundstellen | Globale Dedup vor teurer KI nur lexikalisch | Global dedupen über bereinigte URL, Canonical, Herausgeberdomain, Titelähnlichkeit, Datum, Inhaltsfingerabdruck | Nur zwei exakte Signale (Canonical-exakt ODER titleKey+Tag, `dedup.js:72-79`); keine Herausgeberdomain-/Titelähnlichkeits-/Fingerprint-Dedup; `content_hash` ist URL/Titel-Hash, kein Inhaltsfingerabdruck; Cluster-Bildung über Anker ≥8 Zeichen (`understanding.js:55-69`) | Echte globale Dedup-Stufe VOR `understandOneCluster`: Herausgeberdomain + Titel-SimHash/Shingling + Datumsfenster; `content_hash` von echtem Fingerprint (Titel+summary) trennen |
| Understanding/KO | Politische Ebenen fehlen komplett | KO braucht `decision_level`, `related_levels` (international/eu/bund/land/kommune) | Nicht im Schema (`understanding-schema.js:48-159`), nie gesetzt (`understanding.js:429-477`), nie im Prompt; Spalte existiert (`schema.sql:275`) aber 0/231 befüllt; `related_levels` fehlt als Spalte; Matching kennt es nicht (`matching.js:208-231`) | Enums ins Schema+Prompt+`assembleKnowledgeObject`+Spalten-Whitelist+`schema.sql`; als Matching-Dimensionen; Backfill der 231 Alt-KOs |
| Geografie | Geografie-Struktur/Hierarchie fehlt vollständig | `affected_geographies`+`mentioned_geographies` hierarchisch (Deutschland/Bundesland/Bezirk-Landkreis/Kommune; Wahlkreis separat); 16 Länder strukturell, Berlin+Brandenburg zuerst | Nur `mentioned_locations` als flache `text[]` (`understanding-schema.js:84`), read-time als „regions" (`matching.js:226`); kein Ebenen-/Geografiefeld an Quellen; Region nur als Query-Freitext (`sources.js:442-453`); Berlin/Brandenburg 0 Crawl-Quellen (Prio-Gate 58<64), nur passive Whitelist (`sourceSafety.js:32-35`) | Strukturierte Geo-Objekte (Ebene+Name, FK auf zentrale Geografie-Hierarchie); Landespakete Berlin/Brandenburg mit eigenen Abrufwegen statt Prio-Filter |
| Entitäten | Politische Entitäten nicht typisiert/zentralisiert | `decision_entities`+`related_entities` gegen zentrale Entitäten mit Typen (person/party/parliamentary_group/committee/ministry/parliament/government/association/union/authority/statistical_office) | Getrennte flache `text[]`-Freitextlisten (`understanding-schema.js:73-85`); keine Entitäts-Tabelle, keine IDs, keine Rolle decision-vs-related; Profilfelder ebenfalls Freitext (`inferEntities` String-Match, `config.js:197-217`) | Zentrale `political_entities`-Tabelle; im Understanding Typ+Rolle erzeugen und per Resolver auf IDs auflösen (AKTEUR/ERWÄHNUNG-Prompt als Vorlage); Profilfelder als FK |
| Understanding/KO/Matching | Kein persistiertes, kein semantisches KO-Embedding; kein vorberechnetes Matching | 1× Embedding global erzeugen+speichern → günstiges Matching pro Profil; `matching_results` als Persistenz | `embedKnowledgeObject` (`matching.js:265`) ist read-time Hashing-Trick, kein LLM; `embedding` fehlt in `V3_KNOWLEDGE_OBJECT_COLUMNS` → `saveKnowledgeObject` droppt es; RPC `where embedding is not null` läuft leer; `matching_results=0`, `runMatchingShadow` hinter `HELMUT_V3_MATCHING` (aus); read-time-Recompute bis 500 KOs/Request (`server.js:1547`, `lage.js:312`) | Embedding write-time in Understanding/`ko-enrichment` schreiben, in Whitelist aufnehmen; Modell/Dimension entscheiden; `matching_results` füllen und im Read-Pfad lesen |
| Matching/Scoring | Globale Wichtigkeit == persönliche Relevanz; 3 Achsen nicht getrennt | Globale WICHTIGKEIT vs. persönliche RELEVANZ vs. HANDLUNGSFÄHIGKEIT getrennt; Lage = allgemein Wichtiges | Ein Score mischt Feature-Match + Cosinus + Urgency/Evidence/Confidence (`decisions.js:64-80`); Lage rankt mit demselben persönlichen `matchingFn` (`lage.js:310-313`); kein globaler Wichtigkeitsscore; Recency-Fallback maskiert das (`lage.js:318`) | Write-time globalen `importance`-Score auf KO (aus decision_level, Reichweite, Entitätsgewicht, Fristen, Quellenbreite); Lage nach Wichtigkeit, Radar nach Relevanz, Helmut nach Handlungsfähigkeit; Recency-Fallback ersetzen |
| Matching/Scoring | Handlungsfähigkeit fehlt vollständig | Handlungsfähigkeit als eigene Dimension (offene Frist, eigener Ausschuss, Entscheidungsfenster, ist decision_entity) | Nur `priority_type` aus Score-Schwellen + risiken/chancen-Count (`decisions.js:89-98`); `deadline` in allen 78 Decisions leer → Urgency-Bonus toter Code | Separates `actionability`-Feld auf decisions; Understanding muss `deadline`/`zeitdruck` füllen; Ausschuss-Zugehörigkeit/`decision_entity` als Eingang |
| Produkt | 3 Leer-Zustände im Nutzer-UI nicht unterschieden; Datenlücken-Signal nicht user-facing | 3 unterscheidbare Zustände: (1) kein Handlungsbedarf, (2) keine persönliche aber allgemeine Politik, (3) Datenlage technisch unvollständig | `renderLageEmpty`/`renderRadarEmpty` je ein fester Text, ignorieren `reason`/`quality.reason` (`client.js:3581,7914`); Helmut nur error vs. „kein Handlungsbedarf" (`client.js:5338`); Zustand (2) existiert nirgends; Datenausfall (store-error/budget/ai-unavailable) sieht aus wie ruhiger Tag; echte Trennung nur im operator-Watchdog | Server liefert `reason` bereits; pro Tab in 3 Zustände mappen; Zustand (2) über globalen Kandidatenpool erzeugbar machen; pro-Profil Datenqualitäts-/Frische-Signal in allen Tabs rendern |
| Quellenpakete | Quellenpakete existieren nur als Code-Arrays; Profil→Paket-Ableitung fehlt | Pakete bündeln Abrufwege je Produktzweck mit Status; Profil leitet automatisch Pakete ab (Bundestag min. Bund Basis; Landtag Bund Basis + Landespaket); m:n + Refcount | „Pakete" sind JS-Modul-Arrays (`sources.js:132-593`); kein Paket-Objekt/Status/Refcount/m:n; Gate ist Code-Konstante `keepCuratedSource` (Build) + `sourceAllowedForProfile` (String-Match, `scheduler.js:481-498`); kein `packageId` im Code (grep: 0 Treffer) | Paket-Tabelle + Join Paket↔Abrufweg (m:n, Refcount); persistente Profil→Paket-Zuordnung als Regel/Tabelle statt String-Matching; Pflicht-Basispakete garantieren |
| Quellen/Geografie | Landesebene ohne Quellen; Doppel-Gate auf Landes-/Wahlkreisquellen | Landtagsprofil = Bund Basis + Landespaket (geografie-getrieben); 16 Länder strukturell | Berlin/Brandenburg 0 Crawl-Quellen (Prio 58<64 UND `regional:true`+`themeTerms:SOCIAL` Doppel-Gate, `sources.js:593`, `scheduler.js:486-490`); Landes-Abrufweg nur als 1 dynamische GN-Suche bei `level==Landtag` (`scheduler.js:625-634`) | Landespakete Berlin/Brandenburg als echte Abrufweg-Sammlungen; rein geografie-/ebenen-gegated, nicht zusätzlich themen-gegated; beide Filterstellen adressieren |
| Betrieb | Watchdog-Teilprozesse zu grob | Watchdog trennt Crawl/Understanding/KO/Matching/Briefings/Lage/kritische Quellen/Paketversorgung/Frische/Kosten | Nur 3 Achsen ingest/output/lage (`watchdog-state.js:161-190`); Understanding in output gefaltet; Matching/KO/Decision/Kosten/kritische-Quellen/Paketversorgung fehlen; GitHub-Action nur binärer Response-Check; im Admin nur 1 Watchdog-Kachel (`client.js:1235`) | `classifyOperationalState` auf N Teilprozess-Achsen; je Teilprozess eigenes Signal + `saveWatchdogState`; Kosten-Achse braucht befülltes `llm_usage` |
| Betrieb | Global 1× verarbeiten nicht umgesetzt (Crawl profil-getrieben) | 1× crawlen/Understanding/KO/Embedding global, danach günstiges Matching pro Profil | `runSourceCrawl(politicianId)` crawlt nur aktives Profil (`server.js:620,649`); Signatur überall verdrahtet (`server.js:384,401,4361`); Understanding/Matching innerhalb des Profil-Crawls getriggert, kein globaler Ein-Mal-Schritt mit Fan-out | Crawl+Understanding vom `politicianId` entkoppeln; global-once je Abrufweg mit anschließendem Matching-Fan-out; Understanding-Budget global statt pro Profil verrechnen |
| Kosten | Kostenmessung pro Abrufweg/Paket fehlt vollständig | Kosten pro Abrufweg/Paket/Profil/Schritt/Tag messbar; `llm_usage` nutzen | `buildLlmUsageRecord` kennt keine `sourceId`/`packageId`/`vorgangId` (`storage.js:382-402`); Understanding gibt keine Quell-/Paket-Referenz ins meta (`understanding.js:495`); Reports gruppieren nur Modell/Kategorie/Tag | meta um `sourceIds[]`/`packageIds[]`/`vorgangId` erweitern und persistieren; Multi-Abrufweg-Cluster anteilig oder als Liste (Refcount beachten) |
| Kosten | Budget ist Call-COUNT statt Kostendeckel; ein globaler Topf für alle Schritte/Mandanten | Teure KI nur für Top-Vorgänge; Kosten pro Schritt getrennt; Understanding global getrennt | `canSpendLlm` prüft nur `calls < HELMUT_MAX_LLM_CALLS_PER_DAY` (`storage.js:501-516`); EUR-Deckel (`evaluateTenantBudget`) nur in `lage.js:481`, inert (ki_budget_*_cent NULL); 1045/1681 = `skipped-understanding-budget` → Understanding ausgehungert von communicationDraft/koTagsBackfill | Kostenbasiertes Tages-/Monatsbudget als primären Deckel, auch am Understanding-Pfad; getrennte Budget-Buckets pro Pipeline-Schritt; Count-Limit nur als Rate-Limit |
| Mandanten/RLS | RLS in Prod inert (service_role statt authenticated) | Mandantentrennung DB-seitig erzwungen (global geteilt vs. mandantenspezifisch) | 23 Policies live angewendet, aber `tenantJwtModeEnabled()=false` (`storage.js:1431-1433`) → jeder Request `service_role` (BYPASSRLS); JWT-Selbstsignierung tot (PGRST301); Trennung nur App-Guard | Echtes Supabase-Auth (GoTrue) einführen; bis dahin App-Guard als einzige Linie klar dokumentieren |
| Admin-UI | Keine Quellen-/Herausgeber-/Abrufweg-/Paket-/Länder-/Prüfbedarf-Ansicht | Admin-Ansichten für Quellen (Detail, Status healthy/…/archived, Frische, Kosten, Refcount), Herausgeber vs. Abrufweg, Pakete, 16 Länder, Prüfbedarf (needs_review) | Quellen nur als Aggregat-Zähler „X von Y ok" aus hartkodiertem `getSources()` (`server.js:3514`, `client.js:1200`); kein Einzelquellen-/Status-/Paket-/Länder-Begriff; grep needs_review/Paket im Admin: 0 Treffer | Neue `adminSection`-Blöcke über `dsCard`/`adminDetails`; blockiert bis Server-Lesevertrag (Herausgeber/Abrufweg/Paket/Status) existiert |

### Schwere: mittel

| Themenblock | Thema | Auftrag | Ist (file:line) | Sprint-Hinweis |
|---|---|---|---|---|
| Understanding/KO | Konfidenz eindimensional statt pro Merkmal | KO-Konfidenz differenziert (Ebene, Geografie, Entitäten, Ereignistyp, Fristen) | Nur ein `confidence_score` 0-100 (`understanding.js:437`); Debug-Seed setzt sogar 0.9 (`server.js:4409`) | `confidence_score` um dimensionierte Konfidenzfelder/-objekt (jsonb, analog `recommended_communication_struct`) ergänzen |
| Understanding/KO | Ereignistyp und Fristen fehlen strukturell | KO braucht Ereignistyp und Fristen explizit | Ereignistyp existiert nicht (Spalten `instrument`/`stage` nie gesetzt); `deadline` nie geschrieben; nur `zeitdruck`-Enum + `action_items_struct.dueHint` Freitext | Ereignistyp-Enum + strukturierte Frist(en) in den einen KI-Call; `deadline` aus `dueHint` ableiten und persistieren |
| Understanding/KO | Themen (policy_field/tags) nicht im Understanding-Call | Themen sind Pflichtbestandteil der globalen KO-Bildung | Entstehen nur per Backfill (`ko-enrichment.js`): tags via separatem KI-Call, policy_field deterministisch; `saveKnowledgeObjectEnrichment` patcht nur diese zwei; tags 161/231, policy_field 61/231 | Themen in den EINEN Understanding-Call ziehen (Evidence-Guard behalten); Backfill nur noch für Alt-KOs |
| Dedup | cluster_id/vorgang_id nicht persistiert; Pending-Recovery an lexikalische ID gekoppelt | 1× Understanding pro Vorgang; Vorgang stabil über Läufe; referenzgezählte Zuordnung | `cluster_id` immer NULL (0/4805, `dedup.js:96`); `vorgang_id` nur am KO, nie am raw_document; jeder Lauf re-clustert aus Ankern (`understanding.js:55-68,635-678`) → Re-Clustering-Drift | `cluster_id`/`vorgang_id` am raw_document / an `ko_document_links` persistieren; Clustering inkrementell statt Full-Recompute |
| Matching/Scoring | Kosinus-Ähnlichkeit ohne Entscheidungskraft | Embedding-Ähnlichkeit trägt persönliche Relevanz jenseits harter Overlaps | Ohne Feature-Treffer Höchstscore 24+4+4=32<40 → immer „Ignorieren" (`decisions.js:40-43`); 40/55 Ignorieren mit 0 matched_features; Embedding dekorativ | Similarity-Gewicht/Threshold von Feature-Achse trennen; mit echten KO-Embeddings neu kalibrieren |
| Matching/Scoring | Persistierte decisions-Tabelle toter Read-Pfad + Doppelberechnung | Deterministische Bewertung einmal erzeugen und konsistent nutzen | 78 Decisions von `runDecisionShadow` geschrieben, aber `listDecisions` ohne Aufrufer; UI rechnet `decideForUser` je Request neu (`server.js:1547`) → Drift möglich | Entscheiden: Tabelle = Wahrheit (dann `listDecisions` in Read-Pfad) ODER read-time = Wahrheit (dann `saveDecisions`-Shadow abschaffen) |
| Matching/Scoring | Learning-Bias nicht verdrahtet | Persönliche Relevanz adaptiert aus Nutzungsverhalten | `learningBiasForItem`/`learningReasonForItem` ohne Aufrufer (`learning.js:106-133`); nur `buildLearningProfile` für Anzeige | learningBias als additive persönliche Korrektur einhängen (getrennt von Wichtigkeit) oder bewusst streichen |
| Produkt | Büro: saubere V3-Engine dormant, real V2-Pfad; Kanal-Enums driften | Büro = 1× global verstehen → viele Formate pro Nutzer + Cache | `office.js` hinter `HELMUT_V3_OFFICE=off` inert; Live-Tab ruft `/api/communication/generate` aus Top-2 Decisions (`client.js:10727`); `OFFICE_FORMATS.channel` ≠ `OFFICE_CHANNELS` | Ziel-Büro-Pfad festlegen; V3-`office.js` aktivieren+verdrahten oder V2 ins KO-Prinzip überführen; Kanal-Enums vereinheitlichen |
| Produkt | Radar doppelt implementiert | Eine klare Radar-Wahrheit rund ums Profil | Zwei Engines: `radar.js` (Bucket, `/api/radar`) und `radarState.js` (`/api/app/start`); unterschiedliche Erwähnungslogik → Drift | Auf `currentRadarState` konsolidieren; `radar.js` ablösen oder als reinen Shadow-Runner markieren |
| Produkt | Lage-Recency-Fallback maskiert fehlende Wichtigkeit | Lage zeigt allgemein Wichtiges; echter Leerzustand ehrlich erreichbar | Fallback #3 zeigt neueste Vorgänge als „deine Lage" (`lage.js:318`, `client.js:3274`) → weder global wichtig noch persönlich relevant, nur neu | Recency-Fallback durch echte globale Wichtigkeit ersetzen |
| Betrieb | Status pro Abrufweg (6-stufig) und pro Paket (5-stufig) fehlt | healthy/degraded/broken/needs_review/paused/archived; Paket draft/prepared/active/paused/archived | Nur `active`-boolean + `circuit_state`-Spalte (default ‚closed', `schema.sql:204`) die in keinem JS gelesen/geschrieben wird; kein Auto-Pause defekter Quellen (6 tote Direkt-Feeds bleiben aktiv) | 6-stufigen Status-Enum pro Abrufweg + 5-stufig pro Paket; `circuit_state`-Slot nutzen; Crawl-Ergebnis → Status-Übergang |
| Betrieb | lage-check crawlt ohne Lock | Jobs koordiniert, keine parallelen konkurrierenden Crawls | `runLageCheck` ruft `crawlAllSources` OHNE crawl-Lock (`scheduler.js:298`), während `runSourceCrawl` `crawl-<id>` hält → Doppel-Crawl 10:00 möglich | lage-check unter denselben Crawl-Lock stellen oder auf gecrawlte Daten lesend umbauen |
| Kosten | Kostenlog im Blob statt Tabelle; tenantId/runId nie befüllt | `llm_usage` als abfragbare, mandantenisolierte Tabelle; Kosten je Profil/Lauf | `recordLlmUsage` → `helmut_store/main-auth/data.llmUsage` (1681 Einträge, 5000-Deckel), nicht `public.llm_usage` (0); `tenantId`/`runId` 0/1681, `profileId` 72/1681 | Kostenlog auf indizierte Tabelle (tenant_id, pipeline_step, source_ids) migrieren; `runId` pro Lauf, `tenantId` bei personalisierten Calls; globale Understanding-Kosten als ‚shared' ausweisen |
| Kosten | Embedding-Schritt ohne Kostensichtbarkeit | 1× Embedding als eigener Schritt; Kosten pro Schritt messbar | Kein `embedding`-callType im Log; Embeddings read-time, lösen kein `recordLlmUsage` aus | Embedding persistieren + mit `callType='embedding'`/`pipelineStep='embedding'` loggen; Preis in `llmPriceTable` |
| Kosten | Report-Kategorien gröber als Teilprozess-Trennung | Watchdog/Reports trennen Understanding/KO/Matching/Briefings/Lage/Paketversorgung/… | `categorizeLlmCallType` kennt nur intelligence/briefing/office/other (`storage.js:2879`); `pipelineStep` nicht zur Gruppierung genutzt; Crawl/Matching/Embedding fehlen im Kostenreport | Reports auf `pipelineStep` umstellen; Zielprozesse als feste Buckets; Nicht-LLM-Prozesse mit eigenen Kosten-/Metrikzeilen |
| Kosten | Fail-Open am teuren Pfad | fail-closed, keine unkontrollierten Kosten | Count-Deckel fällt bei Storage-Fehler fail-OPEN (default, `storage.js:478-494`) und schützt genau den teuersten Pfad (Understanding); nur EUR-Deckel fail-closed, aber inert | `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` für Understanding/Backfill scharf oder fail-closed dort hart verdrahten |
| Mandanten | Profile im geteilten ‚main'-Blob; vier konkurrierende Profilmodelle | Profile mandantenspezifisch getrennt; eine Quelle der Wahrheit; global vs. mandantenspezifisch | `getProfile` liest `store.profiles[id]` aus geteilter `main`-Zeile (`storage.js:2302`); `cemInceProfile` + Blob + `public.profiles` (3 Platzhalter) + `mandate_profiles` (1) parallel; `saveProfile` schreibt Blob immer + DB additiv → Divergenz | Auf `mandate_profiles` als kanonische Quelle umziehen (`HELMUT_PROFILE_DB_MODE` scharf); Blob/config.js/legacy nur als Migrationsquelle mit Ablaufdatum |
| Entitäten | Politische Entitäten im Profil als Freitext | Zentrale typisierte Entitäten (person/party/ministry/committee/…) | `relevante_ministerien`/`gegner`/`ausschuesse` als `text[]`-Freitext; `inferEntities` reines String-Matching (`config.js:197-217`) | Profilfelder als FK-Referenzen auf zentrale entities-Tabelle |
| Admin-UI | Kosten-Dimensionen fehlen; Mandanten-/RLS-Sichtbarkeit nur per curl; Google-News-Klumpenrisiko unsichtbar | Kosten pro Abrufweg/Paket/Profil/Schritt/Tag; global-vs-mandantenspezifisch betreibbar; GN-SPOF transparent | Kosten-Abschnitt zeigt nur pro Engine/Nutzer, `llm_usage`-Blob → effektiv leer; `/api/admin/tenant-mode` liefert nur Booleans, von keinem Client-UI konsumiert (0 Treffer); GN-Konzentration im Admin unsichtbar | Chart-Bausteine wiederverwenden, Dimensionen Abrufweg/Paket ergänzen; tenant-mode-Booleans als `dsCard` rendern (schneller Gewinn); GN-Warnbadge in Quellen-Ansicht |

### Schwere: niedrig

| Themenblock | Thema | Auftrag | Ist (file:line) | Sprint-Hinweis |
|---|---|---|---|---|
| Quellenarchitektur | Trust/Kategorie read-time abgeleitet statt am Herausgeber persistiert | Herausgeber zentral mit Vertrauensstufe/Typ | `category`/`trust` je Lesen neu via `withSafetyTags` aus Domain-Listen (`scheduler.js:516-522`); Override nur über Env-Listen | Domain-Register in Herausgeber-Tabelle migrieren; Ableitung als Default, DB-Wert als Override |
| Quellenarchitektur | RSS/HTML-Parsing-Robustheit | Robuste Abrufwege RSS/API/HTML | RSS per Regex, kein XML-Parser (`crawler.js:351-368`); HTML-Fallback mit hartkodierter Homepage-Blockliste (`crawler.js:398-412`) | Regex-RSS durch robusten Feed-Parser ersetzen; Homepage-Erkennung generalisieren |
| Understanding/KO | Pending-Recovery an lexikalische vorgang_id gekoppelt | Stabile referenzgezählte Zuordnung Rohdokument↔Vorgang | `runPendingUnderstandingShadow` re-derived aus Zeitfenster (`understanding.js:635-678`); driftet bei geänderten Ankern | `vorgang_id`/Cluster persistent an `ko_document_links` binden statt neu abzuleiten |
| Matching/Scoring | Risk/Chance ist Freitext-Übernahme statt Bewertung | Chance/Risiko als belastbare Richtungsbewertung | `chance`/`risk` = `risiken[0]`/`chancen[0]` gekürzt (`decisions.js:105-106`); alle 78 tragen beides | Aus strukturierten Understanding-Feldern + Handlungsfähigkeit ableiten |
| Betrieb | DIP nicht als eigener Herausgeber/Abrufweg | Amtliche Primärquelle als Herausgeber + API-Abrufweg mit Status/Refcount | DIP inline in `runSourceCrawl` eingemischt (`scheduler.js:170-173`), gated `DIP_API_KEY`; kein Abrufweg-Datensatz | DIP als API-Abrufweg des Herausgebers Bundestag modellieren, in Bund-Basis-Paket |
| Kosten | office.js reicht vorgangId, Record verwirft es | Kosten pro Schritt/Vorgang messbar | `office.js:104` übergibt `{vorgangId}`, `buildLlmUsageRecord` liest/persistiert es nie (`storage.js:382-402`) | `vorgangId` (+ `knowledge_object_id`) als persistiertes Feld aufnehmen |
| Kosten | Modell-Staffelung tot; V2-Altlast + Slot-Briefings ohne Motor | Teure KI nur für Top-Vorgänge (impl. Modell-Routing); V3 statt V2 | Prod fährt einheitlich `gpt-5-mini` (`ai.js:325-328,813-816`), 400-Fallback nur `!isAzure()`; 26× `v2ScoreAndPrioritize` zahlt aufs selbe Budget; `BRIEFING_TYPES` morning/midday/evening nur Sprache, kein Datenmotor (`briefingLanguage.js:61-112`) | Echtes Modell-Routing (Mini für Masse, großes Modell für Top-Briefings) oder toten Code entfernen; V2-Scoring abschalten; Slot-Briefing-Motor bei Bedarf |
| Mandanten/Doku | Dokumentation widerspricht Code (Sicherheitsposture überzeichnet); Legacy-profiles-Spalten tot | Belastbarer Ist-Stand der Mandantentrennung; sauberes DB-Profilmodell | `multitenancy-abschlussbericht.md:19-24` behauptet „JWT scharf, RLS scharf"; Code sagt Gegenteil; `public.profiles` reiche Spalten, aber `saveProfileToDb` schreibt nur id/name/email → 3 Zeilen mit `name=id` | Abschlussbericht korrigieren, Single Source of Truth für Rollout-Status; `public.profiles` auf Identität/FK reduzieren oder durch `mandate_profiles` ersetzen |

## Zentrale Risiken

**Datenmotor-Integrität.**
- **Single Point of Failure Google News:** 135/144 Quellen hängen am `batchexecute`-Auflöser; 3-4 volle Crawls/Tag laufen darüber. Bei Auflösungsfehler entstehen `google_proxy`-Zeilen mit leerer URL oder Duplikate; ohne Referenzzählung vervielfacht SaaS-Skalierung Crawl-Last/Kosten linear mit der Profilzahl.
- **Zwei divergierende Dedup-Identitäten** (Crawler-Hash vs. `content_hash`) erzeugen inkonsistente Zähler (`savedItems` vs. `deduped`); `content_hash` ist fehlbenannt (URL/Titel-Hash) → falsche Sicherheit, jede spätere Inhaltsfingerabdruck-Anforderung braucht ein NEUES Feld.
- **157 Same-Story-Duplikate** fließen als getrennte `raw_documents` ins Clustering → doppelte Vorgänge/KOs → vermeidbare KI-Kosten. `cluster_id` nie persistiert (0/4805) → jeder Understanding-Lauf re-clustert, Anker-Drift kann `vorgang_id` verschieben und die 1×-Idempotenz unterlaufen.
- **`lage-check` crawlt ohne Lock** parallel zum Cron-Crawl → Race/Doppel-Crawl, verfälscht Frische-/Kostenmessung.
- **SSRF-/Ressourcenfläche:** Der Crawler folgt aufgelösten GN-Links auf beliebige, nicht kontrollierte Hosts (gemindert durch 10-MB-Cap/7-s-Timeout/TLS, aber ohne Host-Allowlist).

**Pipeline-Fallen.**
- **Schreib-Whitelist-Falle:** Selbst wenn `political_level`/`embedding`/`decision_*` in Schema und Assembler gesetzt werden, verschluckt `saveKnowledgeObject` sie still, solange sie nicht in `V3_KNOWLEDGE_OBJECT_COLUMNS` stehen. Neue Felder müssen an drei Stellen synchron geführt werden (Schema, Assembler-Whitelist, Spalten-Whitelist+DB). `additionalProperties:true` + `strict:false` maskieren das (KI liefert, Feld wird verworfen).
- **pgvector-Produktionspfad ist praktisch tot:** RPC filtert `where embedding is not null`, kein KO hat je ein Embedding → `matching_results=0`. Jede Matching-Arbeit baut auf einer Funktion, die nie Treffer liefert.
- **Schema-Ausbau riskiert Token-Abschnitt:** `requestStructuredJson` deckelt bei `maxOutputTokens 3000`; viele neue Pflichtfelder können Antworten abschneiden → `validateKnowledgeObject` verwirft → `markUnderstandingFailed` parkt den Vorgang dauerhaft (kein Retry).
- **Budget-Aushungerung:** Ein globaler Count-Deckel vermischt alle Schritte; 1045/1681 Skips belegen, dass Understanding von persönlichen Calls verdrängt wird (erklärt `knowledge_objects=231` und leere `political_level`). Fail-Open am teuren Pfad → bei Auth-Store-Leseproblem läuft Understanding ungebremst.

**Betrieb & Skalierung.**
- **Read-time-Recompute** von bis zu 500 KO-Embeddings pro Profil/Request (`server.js:1547`, `lage.js:312`) skaliert nicht über den Piloten hinaus (O(Profile × KOs × 256)) plus N+1-Quellenladung.
- **Watchdog blind** für Matching/KO/Decisions/Kosten: stiller Ausfall dieser Stufen löst keinen Alarm aus. `circuit_state` default ‚closed' würde ein neuer Watchdog fälschlich als healthy interpretieren.
- **Doppelte Wahrheit Blob vs. Relation:** Legacy-Schema (`public.sources`/`circuit_state`/`last_crawled_at`, `public.llm_usage`, `pipeline_locks`) ist tot, während die Wahrheit im `helmut_store`/`authStore`-JSON liegt. Jede Migration muss beide Welten auflösen. **Race-Condition:** Read-modify-write des gesamten Auth-Store-Blobs pro `recordLlmUsage` → parallele Vercel-Invocations überschreiben Kostenzeilen (0,60 USD ist Untergrenze). 5000-Einträge-Ring läuft in ~5 Wochen voll → Monatsauswertungen lückenhaft; 68 % der Einträge tragen `estimatedCost='unknown'`.
- **Hoher Blast-Radius** bei Umstellung von Profil-Crawl auf global-once (Signatur `runSourceCrawl(politicianId)` überall verdrahtet). Stille Caps: `keepCuratedSource`-Schwellen und `slice(0,560)` ändern unbemerkt die gecrawlte Menge für ALLE Mandate (kein Snapshot-Test).

**Sicherheit & Mandantentrennung.**
- Der zentrale Trennmechanismus ist heute **allein** der App-Guard `assertTenant` + Session-Auflösung; ein einziger vergessener `assertTenant` auf einem neuen Relations-Read wäre ein **IDOR**, da RLS via `service_role` nicht greift. Die `main-auth`-Zeile bündelt ALLE Konten/Passwort-Hashes/Sessions in einem Blob, von keiner RLS-Policy erfasst. Profile in der geteilten `main`-Zeile: ein Fehler in der id-Schlüsselung exponiert fremde Profilfelder.
- **Falsche Sicherheit durch Doku:** Der Abschlussbericht suggeriert „DB erzwingt Trennung" → Risiko verfrühter Zweitkunden-Freigabe. Umschalten von `HELMUT_PROFILE_DB_MODE=1` würde heute alle Mandate außer `cem-ince` auf `blankProfile` fallen lassen.

**Produkt-Vertrauen.**
- Bei Supabase-Ausfall, erschöpftem Budget oder KI-Ausfall sieht der Abgeordnete in allen 3 Tabs „ruhiger Tag / kein Handlungsbedarf" statt „Datenlücke" → falsches Vertrauen in eine leere Lage. Umstellung des Recency-Fallbacks auf echte Wichtigkeit ändert sichtbar, was in Lage steht → Pilot-Erwartung managen. Für jedes Mandat außer `cem-ince` sind Umfeld/Dynamiken heute leer (hängen an `decisions.matched_features`, nur 78 Zeilen `cem-ince`).
- **Doppelte Pfade** (Radar `radar.js`/`radarState.js`, Büro `office.js`/`communication`): beim Umbau wird leicht der tote/dormante Pfad angefasst; Fixes wirken nicht im Live-UI. `admin-overview-test.js` verankert die Admin-Struktur hart (6 Kacheln, 7 Anker) → neue Abschnitte brechen Assertions.

## Offene Fragen / Freigabe-relevant

Legende: **[F]** = freigabepflichtig (Prod-Migration, RLS, Cron, neue Quellen aktivieren, Kostensteuerung), **[A]** = rein architektonische Richtungsentscheidung.

**Datenmodell Quellen/Herausgeber/Pakete.**
- **[F]** Wird das tote `public.sources`-Schema (mit `topic_filter[]`/`circuit_state`/`trust`) als Abrufweg-Tabelle wiederbelebt oder neu modelliert? Leben Abrufweg/Paket/Refcount künftig relational oder weiter im `helmut_store`-JSON? (Konsequenz für Locks, die heute im JSON liegen.)
- **[A]** Werden die ~15 Modul-Arrays 1:1 zu Startpaketen (Bund Basis = neutral core, Arbeit&Soziales = SOCIAL, je Land = regional) oder wird die Paketgrenze neu gezogen? Wo lebt die Herausgeber-Vertrauensstufe (Migration der `sourceSafety`-Domain-Listen vs. Ableitung mit DB-Override)?
- **[F]** Wie werden die 711/713 vorhandenen Publisher-Strings deterministisch auf normalisierte Herausgeber gemappt (Kanonisierung/Alias-Tabelle) und wie werden Aggregatoren (GN) sicher ausgeschlossen? Backfill für die 4805 bestehenden `raw_documents`?
- **[F]** Soll der 6-stufige Abrufweg-Status den Crawl aktiv steuern (Auto-Pause bei ‚broken', Circuit-Breaker) oder nur reporten? **[F]** Werden die 0 Crawl-Quellen für Berlin/Brandenburg mit echten Landes-Abrufwegen aktiviert (= neue Quellen live schalten)?

**Understanding, Embedding, Matching.**
- **[F]** Soll das globale KO-Embedding ein echtes semantisches LLM-Embedding (Embeddings-API existiert im Code NICHT → neue Kosten, `llm_usage`) oder der bestehende Hashing-Trick-Vektor werden, der nur einmalig persistiert wird? Das entscheidet Kosten und Matching-Qualität.
- **[F]** Werden die 231 Alt-KOs per erneutem KI-Call um Ebene/Geografie/Entitäten/Embedding nachgerüstet (Budget + Idempotenz: `status != 'pending'` blockiert Re-Understanding) oder gilt ein Schnitt (nur neue KOs strukturiert)?
- **[A]** Werden `decision_entities`/`affected_geographies` als FK auf zentrale Entitäts-/Geografie-Tabellen normalisiert (Referenzintegrität) oder zunächst als jsonb (schneller)? Wie wird die **globale Wichtigkeit** als eigenes, mandantenloses KO-Signal berechnet und gespeichert (Understanding vs. Batch), und rankt Lage künftig danach? Wie werden die 3 Leerzustände aus getrennten Wichtigkeits-/Relevanz-/Frische-Signalen abgeleitet?
- **[A]** Ist die `decisions`-Tabelle die Wahrheit (`listDecisions` in Read-Pfad) oder bleibt der read-time-Recompute kanonisch (`saveDecisions`-Shadow abschaffen)? Wird `learningBiasForItem` reaktiviert (persönliche Relevanz vs. separate Prioritätsschicht)?

**Betrieb, Cron, Kosten.**
- **[F]** Wird der Crawl von profilgebunden auf **global-once mit Referenzzählung** umgestellt (Signatur `runSourceCrawl(politicianId)` an fünf Stellen)? Wird der `lage-check`-Crawl (10:00, heute ungelockt) in den globalen Crawl gemerged? — beides ist **Cron-/Job-Architektur-Freigabe**.
- **[F]** Wird der Kostenlog auf eine echte, indizierte, mandantenisolierte `llm_usage`-Tabelle migriert (Ablösung des 5000-Deckel-Blobs)? Ist `public.llm_usage` bewusstes Zielschema (nur Schreibpfad fehlt) oder zu verwerfen (Spaltenstruktur ungeprüft)?
- **[F]** Wird ein **kostenbasierter Deckel** (USD/EUR, getrennte Buckets pro Schritt) statt des Call-Counts eingeführt und am Understanding-Pfad verdrahtet? Soll die per-Profil-EUR-Budgetierung (`ki_budget_*_cent`, heute inert) für den Pilot aktiviert werden? Welcher Wert von `HELMUT_MAX_LLM_CALLS_PER_DAY` ist in Prod gesetzt (1045 Skips belegen einen sehr niedrigen Deckel)? Soll `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` scharf geschaltet werden?
- **[A]** Bei Understanding-Calls über Multi-Abrufweg-Cluster: Kosten anteilig verteilen oder als Liste (1 Call = N Fundstellen)? Wie fließen Nicht-LLM-Kosten (Embeddings, Crawl-Traffic, GN-batchexecute) in „Kosten pro Schritt"? In welcher Reihenfolge werden die N Watchdog-Teilprozesse gewichtet (welcher Teilausfall = „Kritisch")?

**Profile, Mandanten, RLS.**
- **[F]** Ist ein Wechsel auf echtes Supabase-Auth (GoTrue) eingeplant, damit die bereits angewendeten RLS-Policies wirksam werden, oder bleibt `service_role`+App-Guard das dauerhafte Modell? — **RLS-/Sicherheits-Freigabe**, Voraussetzung für Zweitkunden.
- **[F]** Wird `HELMUT_PROFILE_DB_MODE` scharf geschaltet (kanonische Quelle `mandate_profiles`)? Das erfordert vorherige Migration aller Blob-Profile, sonst Datenverlust im Erlebnis. Wie kam die einzelne `mandate_profiles`-Zeile (cem-ince) in Prod, obwohl das Flag aus ist?
- **[A]** Setzt das kanonische Zielprofil auf `mandate_profiles` (deutsche Spalten) oder einem neuen Schema auf, und was passiert mit den 15 FKs auf `public.profiles`? Wo setzt die Profil→Paket-Ableitung an (Read-Zeit aus Ebene/Bundesland vs. persistierte, admin-editierbare Zuordnung mit Aktivierungsstatus)? Welcher Aktivierungsstatus ist führend (`users.status` vs. `mandate_profiles.aktiv`/`onboarding_status`)?
- **[F]** Sollen die 3 Platzhalter-/Testzeilen in `public.profiles` (angela-merkel, james-brown) und die 13 Orphan-Quellen vor realem Onboarding bereinigt werden?

**Produkt & Admin-UI.**
- **[A]** Wird der Ebenen-Enum von 2 (`bundestag`/`landtag`) auf 5 (`international/eu/bund/land/kommune`) erweitert und `decision_level` vom Parlamenttyp entkoppelt (`config.js:147-155`, Migration-CHECK `20260712`)? Darf das Radar-Umfeld Bundesland als Wahlkreisbeleg zulassen, sobald Landespakete existieren (`radarState.js:188-194`)?
- **[A]** Welcher Büro-Pfad ist der Ziel-Weg (V3-`office.js` aktivieren vs. V2 überführen), welche Kanal-Enum-Menge gilt, kann `radar.js` (`/api/radar`) abgeschaltet werden?
- **[A]** Werden Quellen/Pakete/Länder als Abschnitte innerhalb `renderAdminView()` oder als eigene Top-Level-Views realisiert? Bleibt Betreiber-Admin (global geteilt) im selben `role==='admin'`-Screen wie die mandantenspezifische Nutzerverwaltung? Dürfen Quellen/Pakete im Admin schreibend verwaltet werden (Status setzen, Paket zuordnen, pausieren) oder zunächst read-only?
---

## Ergänzende Betreiber-Befunde (Supabase-Security-Advisors, read-only)

Diese Befunde sind **freigaberelevant** (RLS/Secrets/DB) und fließen in den Sprintplan (spätere
Sicherheits-Sprints) ein — in Sprint 1 werden sie nur dokumentiert, nicht geändert:

| Advisor | Objekt | Bewertung |
|---|---|---|
| `anon_security_definer_function_executable` (WARN) | `public.helmut_ensure_profile()` | `SECURITY DEFINER`, ausführbar von `anon`/`authenticated` via `/rest/v1/rpc/...`. Relevant für Mandantentrennung — prüfen, ob gewollt. |
| `rls_enabled_no_policy` (INFO) | `public.pipeline_locks` | RLS aktiv, aber keine Policy → für `authenticated`/`anon` faktisch gesperrt (unkritisch, da nur `service_role` genutzt). |
| `function_search_path_mutable` (WARN) | `helmut_set_updated_at`, `match_knowledge_objects` | `search_path` nicht gesetzt (Härtung empfohlen). |
| `extension_in_public` (WARN) | `vector` | pgvector im `public`-Schema (Best-Practice: eigenes Schema). |

## Zentrale Schlussfolgerungen für die Umsetzung

1. **Das relationale Quellen-Fundament fehlt vollständig** (kein Herausgeber/Abrufweg/Paket/Geografie/
   Entitäts-Modell). Es ist die **Wurzelabhängigkeit** für Pakete, Aktivierung, Referenzzählung,
   Kostenmessung, Admin-Transparenz und die sichere Migration — daher **Sprint 1**.
2. **Zwei harte Landesfähigkeits-Blocker** (leeres `decision_level`/`political_level`; Kuratierung
   kürzt Regional-/Landesquellen weg) sind unabhängig von neuen Quellen und müssen **vor** dem
   Landesausbau gelöst werden.
3. **Sichere Migration ist Pflicht:** `helmut_store`-Blob bleibt bis zur Freigabe die Wahrheit; die
   neue Struktur wird **additiv** und als **Kompatibilitätsschicht** aufgebaut. Keine bestehende
   Tabelle/Spalte/Quelle wird gelöscht.
4. **Dev-Umgebung ohne Live-Supabase/KI-Keys:** Alle Sprint-Tests laufen **offline** mit injizierten
   Deps (wie `p1`/`lage`). Prod-Migrationen, Flag-Flips, Live-Crawls sind **freigabepflichtig**.
5. **RLS-Realität:** RLS-Policies sind angewendet, aber inert (alles läuft über `service_role`);
   Mandantentrennung ist heute **allein** der App-Guard. Neue globale Quellen-Tabellen werden daher
   als **global geteilt** (keine Tenant-Spalten, service-managed) modelliert — RLS-neutral.
