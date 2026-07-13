# Qualitätsmessung · Kostenmessung · mehrachsiger Watchdog (Sprint 7)

**Auftragsphase 8 · Abhängig von:** Sprint 1 (Abrufweg/Paket-Dimensionen), teils Sprint 3/4
(Fundstellen/Aktivierung). Ziel: **vor** einer Production-Migration zuverlässig erkennen, was
funktioniert und was nicht — ohne Kennzahlen zu erfinden.

## Was jetzt messbar ist (die 10 Auftragspunkte)

Ein neues reines Logik-Modul **`lib/helmut/quellenarchitektur/quality-watchdog.js`** (keine KI/Netz/
Storage; **alle** Eingaben injiziert aus echten Reads) beantwortet:

| # | Frage | Funktion / Feld |
|---|---|---|
| 1 | Welcher Abrufweg **funktioniert**? | `assessRetrievalPaths` → `technicalHealth = 'gesund'` |
| 2 | Welcher Abrufweg ist **defekt**? | `technicalHealth = 'defekt'` |
| 3 | Welche Quelle erzeugt **Dokumente**? | `contentYield.documentCount` |
| 4 | Welche Quelle erzeugt **Knowledge Objects**? | `productValue = 'ergiebig'` / `koCount` |
| 5 | Welche Quelle erzeugt **nur Duplikate**? | `productValue = 'nur_duplikate'` |
| 6 | Welche **Pakete** vollständig/unterversorgt? | `assessPackages` → `supply` |
| 7 | Welche **Profile** versorgt/unversorgt? | `assessProfiles` (Sprint-4-`profileSupplyStatus`) |
| 8 | Welche **Pipeline-Teile** aktuell/veraltet? | `buildWatchdog` (10 getrennte Achsen) |
| 9 | Welche **KI-/Verarbeitungskosten** entstehen? | `assessCosts` (echte `llm_usage`-Records) |
| 10 | Welche **konkrete Admin-Handlung**? | `recommendedAction` je Objekt + `buildRecommendations` |

## Drei getrennte Qualitätsarten je Abrufweg

- **technische Gesundheit** (`gesund` / `defekt` / `pruefen` / `ruht` / `inaktiv`) — aus Sprint-1-Status
  (`broken`/`needs_review`/…) **plus** Dokument-Frische je `source_id`.
- **inhaltlicher Ertrag** — `documentCount` + Alter der jüngsten Quelle.
- **Produktnutzen** — führen die Dokumente zu Knowledge Objects (`ergiebig`) oder nur zu Duplikaten
  (`nur_duplikate`)? Ein Abrufweg kann technisch gesund und produktseitig wertlos sein — genau das wird
  jetzt getrennt sichtbar.

## Kostenmessung — echte `llm_usage`, nichts erfunden

`assessCosts` liest die **realen** Kostenrecords (Blob-Ring `store.llmUsage`, Feld `estimatedCost` in
USD, `pipelineStep`, `model`). Aggregiert nach **Pipeline-Schritt** und **Modell**, in **USD mit voller
Präzision** (ein Einzel-Call kostet Sub-Cent — Ganz-Cent-Rundung würde jede reale Kennzahl auf 0
verlieren). `skipped-*`-Einträge und Records außerhalb des Zeitfensters zählen nicht; `estimatedCost`
= `"unknown"` wird **ehrlich ausgeschlossen** (`unknownCostRecords`), nie als 0 erfunden.

**Kostenzuordnung je Quelle/Paket:** `buildLlmUsageRecord` (`lib/helmut/storage.js`) trägt jetzt additiv
`sourceId`/`packageId`/`vorgangId`/`knowledgeObjectId` (rückwärtskompatibel, fehlend → `null`). Solange
ältere Records diese Felder nicht tragen, meldet `assessCosts` `sourceAttributionAvailable = false` und
`bySource = null` — die Quellenkosten sind dann **ehrlich „noch nicht zuordenbar"** statt geraten. Die
begleitende Migration `20260716_llm_usage_source_attribution.sql` ergänzt die passenden Tabellenspalten
(additiv, **freigabepflichtig**, nicht angewendet).

## Watchdog: 10 getrennte Achsen (statt bisher 3)

Der bestehende `watchdog-state.js` (WhatsApp-Report) bleibt **unverändert**. Neu bewertet
`buildWatchdog` **getrennt**: **Crawl, Understanding, Knowledge Objects, Matching, Lage, Radar, Helmut,
Briefings, Paketversorgung, kritische Quellen**. Jede Achse: `frisch` / `warn` / `tot` / `unbekannt`
(fehlender Zeitstempel → `unbekannt`, **nie** `frisch`) **plus** konkrete Handlungsempfehlung. Die
Paketversorgungs-Achse leitet sich aus `assessPackages`, die Achse „kritische Quellen" aus defekten
Pflicht-Abrufwegen ab (`is_critical` + `defekt` → **nie** still archivieren).

## Ehrlichkeit (Auftrag: keine erfundenen Kennzahlen)

Der Report trägt **Verfügbarkeits-Flags**, weil Teile der neuen Architektur in Production heute noch
leer sind:

| Flag | Bedeutung |
|---|---|
| `documents` | `raw_documents` real vorhanden (heute: ja) |
| `knowledgeObjects` | KO-Zuordnung via `ko_document_links` vorhanden |
| `duplicates` | Dedup-Fundstellenmodell befüllt — **heute in Prod leer** → Duplikat-Kennzahl erst nach Shadow-Ingest (Sprint 6) |
| `costAttribution` | `llm_usage`-Records tragen `sourceId` — erst nach Verdrahtung + Freigabe |
| `pathTelemetry` | `retrieval_paths.last_success_at`/`error_streak` — **in Prod leer**, Health kommt bis dahin aus Status + Dokument-Frische |

Ist eine Grundlage leer, wird die betroffene Kennzahl als **nicht verfügbar** markiert (`null` /
`'unbekannt'` / `available:false`), nie geraten.

## Wie das Modul gespeist wird (Read-only, Sprint-8-Verdrahtung)

`buildQualityReport(inputs)` nimmt ausschließlich injizierte Realdaten:
`rawDocs` ← `storage.listRawDocuments`; `koSourceLinks` ← `ko_document_links` + `raw_documents.source_id`;
`dedupDocuments` ← Sprint-3-Dedup (heute leer); `llmUsage` ← `storage.getLlmUsage`; `catalog` ←
`buildFullModel`; `activation` ← `computeGlobalActivation` (Sprint 4); `signals` ← Frische-Zeitstempel
(`getLatestCompleteKnowledgeObjectAt`, Crawl-/Lage-Check). Die tatsächliche Admin-Darstellung ist
**Sprint 8** — Sprint 7 liefert die belastbare Mess-Logik.

## Tests

`test:quality-watchdog` (54) — alle 10 Auftragspunkte, die drei Qualitätsarten, Kosten-Sub-Cent-
Präzision, `skipped`/`unknown`/Fenster-Ausschluss, alle 10 Watchdog-Achsen inkl. `unbekannt`/`storageOk`,
ranked Empfehlungen und **jedes Ehrlichkeits-Flag**. Keine Regression (llm-budget 22, profile-db 44,
watchdog-state 43, p1 322, source-architecture 88, profile-packages 57).

## Freigabepflichtig (vorbereitet, NICHT ausgeführt)

Migration `20260716_llm_usage_source_attribution.sql` anwenden · `llm_usage`-Schreibpfad um `sourceId`/
`packageId`/`vorgangId` verdrahten (Understanding/Crawl) · Blob-Ring → Tabelle umstellen · Admin-
Darstellung (Sprint 8). **Nichts davon ausgeführt** — keine Prod-Migration/Datenänderung/Cron/Deployment.
