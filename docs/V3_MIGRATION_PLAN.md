# Helmut V3 — Vollständiger Migrations- & Cutover-Plan

**Datum:** 2026-07-06
**Ziel:** V3 als **einzige** produktive Architektur. Genau ein Datenmotor, ein
Datenmodell, ein produktiver Codepfad. V1/V2 vollständig entfernt. Keine
dauerhaften Feature-Flags zurück zu V2, keine parallelen Implementierungen, kein
Legacy-Code.
**Grundregel (verbindlich):** Alter Code wird **erst** gelöscht, wenn V3 die
jeweilige Funktion **vollständig ersetzt** hat **und die Tests bestehen**.
Nachweislich toter Code darf sofort entfernt werden.

Dieses Dokument ist die Grundlage der Umsetzung. Es wurde aus einer vollständigen,
maschinell parallelisierten Lektüre **jeder** Quelldatei erstellt (12 Subsystem-
Analysen + Synthese).

---

## Umsetzungsstand (laufend)

### Bausteine gebaut + getestet (additiv)
| Baustein | Status | Verifikation |
|---|---|---|
| Toter Code entfernt (5 TS-Dateien + 2 runtime.js-Funktionen) | ✅ | offline grün |
| V3 Decision Engine (`decisions.js` + storage-CRUD) | ✅ | decisions 38/38 |
| `toBriefingContractV3`-Adapter (`briefingContract.js`) | ✅ | briefing-contract 27/27 |
| Radar-Server-Engine (`radar.js`) | ✅ | radar 22/22 |
| Adversarialer Review + 3 Fixes (vorgang_id/chance-risk-cap/deadline) | ✅ | decisions 38/38 |

### Cutover (Read-Path → V3, kein V2-Fallback)
| Schritt | Status | Verifikation |
|---|---|---|
| Rollen-Text-Briefing entfernt (`briefing.js` + `.j2` + Flag `HELMUT_V3_BRIEFING`) | ✅ | offline grün |
| Toter `HELMUT_ENGINE_V2`-Motor entfernt (ai.js-Block + Flag + Debug-Endpoint) | ✅ | p1, require-smoke |
| **Home/Briefing/Helmut** Read-Path → V3 (`buildV3Briefing`, fail-safe leer, KEIN V2-Fallback) | ✅ | Gate 8/8, contract 17/17 |
| **Radar** Read-Path → V3-Engine; Client liest server-`signalType`; `features`/`HELMUT_V3_RADAR` entfernt | ✅ | Gate 8/8 |
| Client-**60/40**-Nachrechnung entfernt → Server ist Entscheidungs-Quelle | ✅ | contract 17/17 |
| V2-Radar-Toter-Code + `situationalToDecisionItem`-Fabrikation + orphaned Client-Helfer entfernt | ✅ | Gate 8/8 |
| Contract-Snapshot auf V3-Form rebaselined (null↔Objekt datenabhängig) | ✅ | contract 17/17 |
| **Client-Refresh** auf V3 umgehängt: `/api/pipeline/run`→`runSourceCrawl` (V3-Feed), `/api/briefing/run`→V3-Read; `/api/briefing/demo` (V2) entfernt | ✅ | Gate 8/8 |

**Was der Nutzer SIEHT, kommt jetzt aus V3:** `/api/app/start` (Home/Briefing/Helmut)
und `/api/radar/archive` (Radar) + Lage (schon vorher V3). Kein stiller V2-Fallback —
fehlen V3-Daten, kommt ein expliziter Leerzustand (`available:false`).

### Noch V2 — WRITE-/OPS-Pfad (nicht am Nutzer-Read-Pfad; live zu verifizieren)
Diese Reste sind **nicht** offline verifizierbar (der Offline-Gate bootet die
Pipeline/Cron/Ops-mit-Daten nicht) und werden daher **nicht blind gelöscht**:

| V2-Rest | Wo | Grund noch da |
|---|---|---|
| `runMorningBriefing` (V2-Briefing-Motor) | scheduler.js | erzeugt (ungelesene) V2-Briefings; nur noch von **Cron** (`/api/cron/morning-briefing`, `/api/cron/pipeline`) + `runLageCheck` getriggert — die Client-Refresh-Endpunkte sind bereits auf V3 umgehängt |
| `personalization.js` | Modul | nur noch vom V2-Write-Pipeline genutzt (aus dem Read-Path entfernt) |
| `runtime.js` `generateBriefing`-Familie | Modul | vom V2-Write-Pipeline + Demo-Endpunkten genutzt; `cemInceProfile` ist Single-Tenant-Default (in ~5 Stellen) |
| `getLatestBriefing` (V2-Blob-Lesen) | server.js Ops/Health/Release-Check | Readiness-Dashboards lesen noch den Blob + `referentEngine` |
| `runLageCheck` regeneriert V2-Briefing | scheduler.js | Lage-Check-Feature erzeugt bei neuer Lage ein V2-Briefing |
| `/api/briefing/latest`, `/api/briefing/demo`, `/api/profile/demo` | server.js | V2-Read/Demo-Endpunkte (vom Client NICHT für die Anzeige gefetcht) |
| Flags `HELMUT_V3_STORE/_MATCHING/_LAZY_UNDERSTANDING/_OFFICE` + `HELMUT_UNDERSTANDING_LOCK` | env | erst „unbedingt live" schalten, wenn V3 als alleiniger Store bestätigt |

**Nächster Schritt (live-verifiziert, Betreiber gegen Vercel):**
1. ~~Client-Refresh-Endpunkte auf V3 umhängen~~ ✅ erledigt (`/api/pipeline/run`→
   `runSourceCrawl`, `/api/briefing/run`→V3-Read). Verbleibend: die **Cron**-Routen
   (`/api/cron/morning-briefing`, `/api/cron/pipeline`) auf den V3-Feed umstellen
   (nur `runSourceCrawl`, kein V2-Briefing + kein V2-Push).
2. Ops/Health/Release-Check (`backendHealth`/`computeReleaseCheck`/`buildHealthReport`)
   von `getLatestBriefing`+`referentEngine` auf V3-Qualitätssignale (KOs/decisions) umstellen.
3. `runLageCheck` auf V3 umstellen (kein V2-Briefing mehr regenerieren).
4. Erst dann `runMorningBriefing` + `personalization.js` + `runtime.js`-Briefing-Familie
   löschen (vorher `cemInceProfile`/`demoSources`/`getActiveProfile` in ein Config-Modul
   verschieben). Nach jedem Schritt: `npm test` (Smoke) + `npm run test:contract` gegen
   das Deployment.
5. Flags in `storage.js` unbedingt-live schalten + entfernen.

---

## 0. Kernbefund (ehrliche V3-Readiness)

Der Zustand ist **gespalten** — nicht „Flag umlegen und fertig":

| Oberfläche | Zustand | Aufwand |
|---|---|---|
| **Lage / Vorgang-Karten** (primäre Ansicht) | Read-Pfad end-to-end verdrahtet, Schema vollständig, Crons geplant. Aber **0 Knowledge Objects in Produktion** (Write-Pipeline lief nie), Understanding-Lock codiert aber **nicht verdrahtet**. | „Flag an **und** den bezahlten Write-Pfad erstmals beweisen/backfillen" |
| **Office / Büro** | Code-komplett, nur flag-gated. | „Flag an, sobald verstandene KOs existieren" |
| **Home / Briefing / Helmut** | **Kein V3-Produzent vorhanden.** `personalizedRecommendations`, `homeSections`, `helmutAssessment`, `decisionMetrics` kommen **ausschließlich** aus dem ungegateten V2-`personalization.js`. Der dokumentierte Adapter `toBriefingContractV3` ist **Plan, kein Code**. | **Echte Neuentwicklung** (nicht flag-gated — schlicht abwesend) |
| **Radar** | „V3-Radar" ist ein **client-seitiger Keyword-Klassifikator** — V2-Logik mit V3-Etikett. Kein Server-Engine. Null Testabdeckung. | Produktentscheidung + Neubau/Retire |
| **Entscheidung (Handeln/Beobachten/Ignorieren)** | Wird **im Browser** nachgerechnet (heilige 60/40-Schwelle + erfundene Scores). Server liefert die Entscheidung nicht. | Server-seitig neu bauen, Client entkernen |
| **„Helmut lernt" (learning.js)** | Kein V3-Äquivalent. | Produktentscheidung: streichen oder neu bauen |

**Fazit:** V3 kann nach einem Daten-Backfill + Lock-Fix die **primäre** Architektur
werden (Lage + Office). „V3 als **alleinige** Architektur mit vollständig gelöschtem
V2" verlangt zusätzlich: Contract-Adapter bauen, Entscheidungslogik server-seitig
verlagern, Radar & den doppelten Briefing-Renderer auflösen, und die
Recommendations-/Lern-Oberfläche entweder ersetzen **oder** bewusst zurückbauen.
Nichts davon ist „present-but-flag-gated" — es ist **abwesend** und muss gebaut
(oder als Produkt zurückgebaut) werden.

---

## 1. Die Map — aktuelle produktive Pfade

**Alle 6 `HELMUT_V3_*`-Flags sind per Default AUS.** Produktion läuft heute so:

```
Home / Briefing / Helmut / Radar   →  V2  (JSON-Blob helmut_store
                                            + Regel-Scoring personalization.js/runtime.js
                                            + LLM nur als Textveredler ai.js)
Lage (additiv)                     →  V3  (buildLageBriefing → knowledge_objects)
                                            aber inert ohne HELMUT_V3_STORE + Supabase + Daten
Büro / Office                      →  —   (V3 vorhanden, flag-gated aus; V2-Ersatz: ai.generateCommunicationDraft)
```

### V3-Module, die bereits existieren
- **Store (C5):** `storage.js` — relationale V3-Tabellen (`raw_documents`,
  `knowledge_objects`, `matching_results`, `briefings`, `office_outputs`,
  `profile_embeddings`, `ko_document_links`, `ko_relations`, `llm_usage`,
  `pipeline_locks`, `decisions`, `topic_memory`, `interactions`). Alle
  V3-Schreib-/Lesefunktionen gaten auf `v3StoreReady()` (Flag + Supabase).
- **Dedup/Cluster (C7c-Vorstufe):** `dedup.js` — `toRawDocumentRow`,
  `dedupeRawDocuments`, `clusterRawDocuments`, `deriveVorgangId`.
- **Lazy-Understanding-Trigger (C7c):** `lazyUnderstanding.js` —
  `runLazyUnderstandingShadow` (interessen-gated pending-KO-Anlage).
- **Understanding-Engine (C7/C8):** `understanding.js` + `understanding-schema.js`
  — 1 KI-Call pro neuem Vorgang → Knowledge Object mit Presentation Fields
  (`display_title`, `display_summary`, `why_relevant`, `recommendation`,
  `display_category`); Qualitätsgate `isValidDisplayTitle`/`sanitizeDisplayTitle`.
- **Matching-Engine (C7a):** `matching.js` — deterministische Merkmalsvektoren
  (256-dim, **keine KI**) + `match_knowledge_objects`-RPC (pgvector) **und** ein
  synchroner In-Memory-Ranker `matchProfileToKnowledgeObjects` (immer verfügbar).
- **Briefing-Engine (C7b):** `briefing.js` + `templates/{mdb,fraktion,mitarbeiter}.j2`
  + `template.js` (eigener Mini-Renderer). Rendert Rollen-Text-Briefings in die
  `briefings`-Tabelle. **Konkurriert** mit dem Lage-Karten-Pfad (siehe §7).
- **Lage-Read-Pfad:** `lage.js` — `buildLageBriefing`, `koToVorgangCard`
  (KO → Vorgang-Karte fürs Frontend).
- **Office-Engine (C9):** `office.js` + `templates/office/*.j2` (16 Kanäle) →
  `office_outputs`. Harte Vorbedingung `understanding_status==='complete'`.
- **Wartung:** `backfill.js` (Provenienz), `presentation-backfill.js` (display_*).

### Was V3 noch fehlt, um Home/Briefing/Helmut/Radar zu ersetzen
1. **Contract-Adapter** `toBriefingContractV3(KOs, matches, profile)` →
   `items` / `personalizedRecommendations` / `homeSections` / `helmutAssessment` /
   `decisionMetrics`. **Dokumentiert, aber nicht gebaut.**
2. **Server-seitige Entscheidung:** `decision` / `priorityType` / `priorityLabel`
   müssen vom Server kommen. Heute rechnet der Client die 60/40-Schwelle selbst.
3. **`decisions`-Tabelle:** existiert im Schema, hat aber **keine Storage-CRUD**;
   `office_outputs.decision_id` zeigt ins Leere.
4. **Radar-Server-Engine** (falls Radar erhalten bleibt) statt Client-Klassifikator.
5. **Lern-Ersatz** für `learning.js` (oder bewusster Rückbau).
6. **GDPR-Export/-Delete** (`exportProfileData`/`deleteProfileData`) zählen jede
   Blob-Collection einzeln auf → müssen bei jeder relationalen Migration mitziehen.

---

## 2. Flag-Inventar

| Flag | Gate | Cutover-Aktion |
|---|---|---|
| `HELMUT_V3_STORE` | Master-Gate (`v3StoreReady` = Flag + Supabase). Alle V3-Reads/Writes + Lage. | An in Pilot-Env → Write-Pipeline aktiv. Am Ende `v3StoreEnabled()` löschen, `v3StoreReady()` auf „Supabase konfiguriert" reduzieren → V3 bedingungslos. |
| `HELMUT_V3_MATCHING` | `runMatchingShadow`-Guard. (Sync-Ranker läuft immer.) | An; Guard löschen → immer aktiv. `EMBEDDING_DIM(256)`↔`vector(256)` prüfen. |
| `HELMUT_V3_LAZY_UNDERSTANDING` | `runLazyUnderstandingShadow`-Guard. Markiert Vorgänge als `pending` für C8. | An (mit Matching gekoppelt); Guard löschen. 0.12-Interesse-Schwelle tunen (steuert bezahlte KI-Calls). |
| `HELMUT_V3_BRIEFING` | `runBriefingShadow` (Rollen-Templates → `briefings`). | **ENTSCHEIDUNG:** Rollen-Text-Briefing Produkt oder von Lage-Karten abgelöst? Wenn abgelöst: `briefing.js` + `.j2` löschen. |
| `HELMUT_V3_OFFICE` | `isOfficeEnabled` in `office.js`. | An, sobald `complete`-KOs existieren; Gate löschen. Ersetzt `ai.generateCommunicationDraft` (V2-Comms). |
| `HELMUT_V3_RADAR` | Reiner UI-Toggle (`server.js:279` → Client `renderRadarV3View`). | **ENTSCHEIDUNG:** Server-Engine oder Client-View? Danach Flag + `features`-Objekt löschen. |
| `HELMUT_ENGINE_V2` (+`_MODEL`) | **Toter** „Datenmotor V2"-Hybrid-Scoring-Versuch (`ai.js` `enrichBriefingWithAiV2`/`applyV2Upgrade`). **Kein V3-Flag.** | **Sofort löschbar** (Default aus, läuft nie): Flag + `ai.js`-Block + `scheduler`-Toggle + `/api/debug/engine-flag` + `referentEngine`-Plumbing + p1-`engineV2Checks`. |
| `HELMUT_UNDERSTANDING_LOCK` | `understandingLockEnabled`. **Bereits verdrahtet** — `runUnderstandingShadow` (scheduler.js:218) und `runPendingUnderstandingShadow` (`/api/cron/understanding`, server.js:699) akquirieren/releasen den globalen Lock über `defaultDeps.acquireLock`; die einzigen Prod-Aufrufer von `understandOneCluster` sind diese beiden gelockten Runner. Inert nur, solange das Flag aus ist. | Für den Write-Betrieb **Flag an** (verhindert Doppel-Abrechnung beim 2×/Tag-Cron); am Ende immer-an schalten, Flag löschen. **Kein Code-Fix nötig — Naht ist da.** |
| `HELMUT_LLM_BUDGET_FAIL_CLOSED` | `canSpendLlm` fail-open vs. fail-closed bei Budget-Lookup-Fehler. | Für Pilot **an** bevor bezahlte Pipeline läuft; danach hart fail-closed verdrahten, Flag löschen. |

---

## 3. Cutover-Plan pro Bereich

Für jeden Bereich: **aktueller Pfad · zukünftiger V3-Pfad · fehlende Arbeit ·
Risiko · Tests · was danach gelöscht werden kann.**

### 3.1 Lage (primäre V3-Oberfläche)
- **Aktuell:** `buildLageBriefing` → `koToVorgangCard` → Client `renderVorgangCard`
  + Bottom-Sheet. Liest `knowledge_objects` über V3-Store. Ohne
  `HELMUT_V3_STORE`+Supabase+Daten: `unavailable('v3-disabled')`.
- **V3-Pfad:** identisch, bedingungslos. Presentation Fields sind Single Source of
  Truth (keine UI-Kürzung).
- **Fehlt:** Produktion hat **0 KOs** (Write-Pipeline nie gelaufen);
  Understanding-Lock verdrahten; `presentation-backfill` für Alt-KOs; Legacy-Shim
  `selectLageVorgaenge`/`isModernVorgang`/`LAGE_PRESENTATION_FIELDS` (lage.js
  339-368) + Client-Fallback entfernen.
- **Risiko:** **Leere Primär-Oberfläche**, wenn Flag vor Backfill gelesen wird.
  Feld-Rename bricht Karten **still** (kein Contract-Test auf Karten).
- **Tests:** `lage-test.js` (v3-disabled-Assertion umschreiben); Karten-Render-Smoke
  ergänzen.
- **Löschbar danach:** lage.js-Legacy-Shim + Client-Legacy-Fallback.

### 3.2 Home
- **Aktuell:** `/api/app/start` → `latestBriefingPayload` → `getLatestOrDemoBriefing`
  (V2-Blob) → `homeSections` (topTasks/needsAttention/opportunities/risks/…),
  Regel-Scoring.
- **V3-Pfad:** `toBriefingContractV3` erzeugt `homeSections` aus KOs +
  `matching_results` + `decisions`.
- **Fehlt:** **kompletter Adapter**; server-seitige Entscheidung; `decisions`-CRUD.
- **Risiko:** `personalization.js` vor Adapter löschen → Home leer.
- **Tests:** `contract-snapshot` (rebaseline/retire); `smoke` umschreiben.
- **Löschbar danach:** `personalization.js`-homeSections-Logik, `compact*`-Helper,
  `runtime.js` `generateBriefing`.

### 3.3 Briefing (Datenmotor-Ausgabe: items / themeOfDay / decisionMetrics)
- **Aktuell:** V2-Briefing-Objekt aus `scheduler.runMorningBriefing` →
  `generateBriefing`(runtime.js) → `enrichBriefing`(ai.js) → `personalizeBriefing`
  → `saveBriefing` (Blob).
- **V3-Pfad:** V3-Briefing (aus KOs + Matching) als Datenquelle; `runMorningBriefing`
  liest das V3-Briefing statt es regelbasiert zu erzeugen.
- **Fehlt:** Adapter/Producer (§3.2); Umbau `runMorningBriefing`.
- **Risiko:** Release-Gate `npm test` (Smoke) prüft V2-Briefing-Felder → muss im
  selben Schritt umgeschrieben werden.
- **Tests:** `smoke`, `contract` (rebaseline).
- **Löschbar danach:** `runtime.js` `generateBriefing`-Familie, `scheduler`-V2-
  Regel-Engine, `ai.js`-V2-Refine (`enrichBriefingWithAI`/`refineBriefingItem`).

### 3.4 Helmut (Entscheidung + Handlungsempfehlung)
- **Aktuell:** `helmutAssessment` (LLM `generateHelmutAssessment`) +
  `decisions`/`personalizedRecommendations` aus V2-Scoring; Client rendert Deck,
  rechnet 60/40 **selbst** nach, erfindet situative Scores (45/55/50).
- **V3-Pfad:** server-seitige `decisions`-Tabelle + V3-Office für Kommunikation;
  V3-Assessment-Producer **oder** Rückbau der Gesamt-Assessment-Fläche.
- **Fehlt:** `decisions`-CRUD; Server-Entscheidungs-Emission; Client-Nachrechnung
  entfernen; V3-`helmutAssessment` oder Retire; `learning.js` ohne V3-Äquivalent.
- **Risiko:** doppelte Entscheidungslogik → inkonsistente Zähler;
  `learning.js`-Löschung entfernt sichtbares „Helmut lernt".
- **Tests:** `contract`, `smoke`, p1 `personalizationChecks` entfernen.
- **Löschbar danach:** `ai.js` `generateHelmutAssessment`, `personalization.js`
  Entscheidungslogik, `learning.js` (nach Entscheidung), Client-60/40-Nachrechnung.

### 3.5 Radar
- **Aktuell:** `/api/radar/archive` (identisch in beiden Welten); Client
  `renderRadarView` (V2-Gruppen) **oder** `renderRadarV3View` (Client-Keyword-
  Klassifikator), gated per `features.v3Radar`.
- **V3-Pfad:** **ENTSCHEIDUNG** — echter Server-Engine (emittiert Bucket aus KO-
  Feldern `mentioned_*`) **oder** eine Radar-Sicht auf KOs. Kein Client-Scoring.
- **Fehlt:** Server-Radar-Engine (falls gewählt); **jegliche** Testabdeckung.
- **Risiko:** null Tests; Client-Klassifikator widerspricht V3-Prämisse.
- **Tests:** Radar-Abdeckung **neu** hinzufügen.
- **Löschbar danach:** `renderRadarView` (V2), `features.v3Radar`-Gate, das Flag.

### 3.6 Büro / Office (V3, netto-neu)
- **Aktuell:** `office.js` gated per `HELMUT_V3_OFFICE`; 16 Kanal-Templates →
  `office_outputs`; braucht `complete`-KOs. V2-Pendant: `ai.generateCommunicationDraft`.
- **V3-Pfad:** `office.js` bedingungslos.
- **Fehlt:** `complete`-KOs; Klärung `decision_id`-Dangling-FK.
- **Risiko:** gering (Feature ist isoliert).
- **Tests:** p1-C9-Happy-Path bleibt Kern; Endpoint-Smoke ergänzen.
- **Löschbar danach:** `ai.generateCommunicationDraft` (V2-Comms),
  `communication_drafts`.

### 3.7 Datenmotor / Store (Fundament)
- **Aktuell:** V2-JSON-Blob (`helmut_store`) ist Source of Truth; V3-Tabellen inert.
- **V3-Pfad:** relationale V3-Tabellen als **alleiniger** Store; Blob entfernt.
- **Fehlt:** alle Reads/Writes umhängen; GDPR-Export/-Delete umschreiben;
  gemeinsame Infra behalten (`llm_usage`, `pipeline_locks`, Auth-Store).
- **Risiko:** GDPR-Export verliert still Daten, wenn nicht im Gleichschritt.
- **Tests:** `smoke`, `contract`, `p1`.
- **Löschbar danach:** Blob-Read/-Write, die **ungenutzten** aspirationalen
  V1/V2-Relationstabellen in `schema.sql` (`profiles`, `mandate_profiles`,
  `political_items`, `personalized_recommendations`, `daily_tasks`,
  `communication_drafts`, `user_notes`, `priority_changes`), `helmut_store`.

---

## 4. Phasen (jede einzeln verifizierbar)

**Reihenfolge streng: bauen/beweisen → umschalten → erst dann löschen.**

### Phase A — Nachweislich toten Code entfernen *(sofort, kein Laufzeitpfad)*
- Löschen: `lib/helmut/scoring.ts`, `briefingEngine.ts`, `types.ts`, `mockData.ts`,
  `prompts.ts` (kein Importer; Node lädt `.ts` gar nicht — kein Build-Step).
- Löschen: `runtime.js` `scoreSignal` (603-653) + `rawItemToSignal` (655-672) —
  keine Aufrufer, nicht exportiert, tot auch innerhalb V2.
- **Verify:** `test:p1`, `test:goldset`, `test:lage`, `node --check` grün.

### Phase B — V3-**Write**-Pipeline in Pilot-Env beweisen *(Read bleibt V2)*
- *(Lock ist bereits verdrahtet — kein Code-Fix; nur Flag anschalten.)*
- Pilot/Staging: `HELMUT_V3_STORE`, `_LAZY_UNDERSTANDING`, `_MATCHING`,
  `HELMUT_UNDERSTANDING_LOCK`, `HELMUT_LLM_BUDGET_FAIL_CLOSED` = an. Read bleibt V2.
- `/api/cron/crawl` → `/api/cron/understanding` ausführen; `knowledge_objects`
  füllen, `display_title`-Qualitätsgate prüfen.
- **Verify:** `test:goldset`, `test:understanding-eval`, `test:understanding-smoke`
  grün; Pilot-Smoke = nicht-leere verstandene KOs; `test:contract` unverändert grün.

### Phase C — Primäre Oberfläche (Lage + Office) auf Live-V3 schalten
- Prod: `HELMUT_V3_STORE`-Read an → `buildLageBriefing` liefert Karten;
  `backfill:presentation` für Alt-KOs.
- Nach Backfill: lage.js-Legacy-Shim + Client-Fallback löschen.
- `HELMUT_V3_OFFICE` an; `HELMUT_V3_RADAR` entscheiden/klären.
- Guards `matching.js:262` + `lazyUnderstanding.js:95` löschen; die 5 Scheduler-
  Shadow-Calls von fail-safe-No-ops zum Primärpfad hochstufen.
- **Verify:** `test:lage` (v3-disabled-Assertion umschreiben) + Pilot-Smoke
  (Karten rendern displayTitle/whyRelevant/recommendation/sources, Office
  generiert); `test:contract` **weiter grün** (V2-app/start unangetastet).

### Phase D — V3-Producer für die Sekundär-/Contract-Oberfläche *(die eigentliche Neuentwicklung)*
- `toBriefingContractV3(KOs, matches, profile)` → V2-Contract-Felder bauen **ODER**
  Produktentscheidung: Helmut/Home-Recommendations zurückbauen, App auf Lage+Office
  reduzieren.
- Server-seitige `decision`/`priorityType`/`priorityLabel` emittieren (→ Client-
  60/40 wird später löschbar).
- `push.bestBriefingPush`/`sendLageChangePush` von V2-Blob-Feldern auf KO/display_*
  umhängen.
- Ops (`backendHealth`/`releaseCheck`) von `referentEngine`/`learning` auf V3-
  Qualitätssignale umstellen.
- **Verify:** `test:contract` **hier rebaselinen** (`--update`,
  `*_REQUIRED_KEYS` + Client-Greps auf V3-Form) **oder** retire; umgeschriebener
  `smoke` grün gegen V3-Endpunkte.

### Phase E — Read-Pfad vom V2-Blob abkoppeln, V2-**Writes** stoppen
- `latestBriefingPayload` (server.js:1035) von `getLatestOrDemoBriefing` auf den
  Phase-D-V3-Producer umhängen; `compact*`-Helper (1058-1204) auf V3-Feldnamen.
- `scheduler.runMorningBriefing` liest V3-Briefing statt
  `generateBriefing→enrichBriefing→personalizeBriefing→saveBriefing`; Shadow-Calls
  werden der hart-failende Primärpfad.
- `enrichBriefing`/`isEngineV2Enabled`-Toggle (scheduler.js:7-9) löschen;
  `saveRawItems→Blob` + V2-Scoring-Writes stoppen.
- Gemeinsame Infra behalten (`recordLlmUsage`/`canSpendLlm`/Locks/Auth).
- **Verify:** umgeschriebener `smoke` + rebaselinter `contract` + `test:lage` grün
  gegen ein Deployment ohne V2-Blob-Read/-Write.

### Phase F — V1/V2-Module, tote Flags & TEMP-Endpunkte löschen; V3 bedingungslos
- `runtime.js` (`generateBriefing`-Familie) löschen — vorher `cemInceProfile`/
  `demoSources` + `getActiveProfile`/`mergeProfileDefaults`/`neutralProfileDefaults`
  in ein Config-/Profil-Modul verschieben; `personalization.js` + `learning.js`
  löschen (nach „Helmut lernt"-Entscheidung); `briefing.js` löschen falls abgelöst.
- `ai.js`-V2-Refine/Assess-Fläche + gesamten „Datenmotor V2"-Block löschen;
  gemeinsamen HTTP-Kern + V3-Plumbing behalten (`requestStructuredJson`/
  `requestText`/`understandingModelName`/`generateLageBriefing`).
- `HELMUT_ENGINE_V2`/`_MODEL` + `/api/debug/engine-flag` löschen; ~20 TEMP-Debug-
  Endpunkte ausbauen (vorher `briefing-manual`-`renderBriefing` + `pipeline-probe`-
  Health ernten); `features.v3Radar`-Gate (server.js:279) löschen.
- Alle sechs V3-Flag-Reads + Understanding-Lock-Flag in `storage.js` entfernen →
  Funktionen bedingungslos live (Supabase-Voraussetzung behalten);
  `sources.js` `v1Sources`→`sources` umbenennen; `backfill.js`/
  `presentation-backfill.js` außer Dienst nehmen, sobald Ops keine provenienz-/
  display_*-losen KOs mehr meldet.
- `client.js` entkernen: 60/40-Nachrechnung (1735) + `situationalToDecisionItem`-
  Fabrikation + `prepareMeeting`/`fallbackMeetings`-Fabrikation +
  `renderRadarView`(V2) + `features`-Objekt.
- **Verify:** Volle V3-Suite grün (`goldset`, `understanding-eval`,
  `understanding-smoke`, `lage`, `contract` rebaselint, `p1` mit gelöschten
  V2-Sektionen/invertierten Flag-Assertions, `smoke` V3), und `grep` bestätigt: **0**
  Vorkommen von `HELMUT_V3_*`/`HELMUT_ENGINE_V2`/`getLatestOrDemoBriefing`.

---

## 5. Lösch-Inventar (mit Blocker)

| Ziel | Art | Blockiert durch |
|---|---|---|
| `scoring.ts`, `briefingEngine.ts`, `types.ts`, `mockData.ts`, `prompts.ts` | Datei | **nichts — toter Code** (Phase A) |
| `runtime.js` `scoreSignal`+`rawItemToSignal` (603-672) | Funktion | **nichts — toter Code** (Phase A) |
| `HELMUT_ENGINE_V2`/`_MODEL` + `ai.js`-„Datenmotor V2"-Block + `/api/debug/engine-flag` + p1-`engineV2Checks` | Flag/Block | **nichts — totes Legacy-Flag** (früh löschbar) |
| `runtime.js` (`generateBriefing`-Familie) | Datei | `runMorningBriefing`/Demo-Endpunkte auf V3-Read; Profil-Plumbing verschieben |
| `personalization.js` | Datei | ungegatete Live-Aufrufer (server:306/1052, scheduler:337); V3-Producer für Recommendations/homeSections (Phase D) |
| `learning.js` | Datei | Produktentscheidung „Helmut lernt"; server-Endpunkte 521/583/589/1992; Lernmodus-Health |
| `briefing.js` + `templates/{mdb,fraktion,mitarbeiter}.j2` | Datei | Produktentscheidung (Rollen-Text vs. Lage-Karten) |
| `ai.js` V2-Refine/Assess-Fläche | Block | Live-Aufrufer scheduler/server; V3-Briefing + Office müssen ersetzen |
| `scheduler.js` V2-Regel-Engine | Block | `runMorningBriefing` auf V3-Read umhängen |
| `server.js` `latestBriefingPayload`-V2 + `compact*` (1035-1204) | Block | Contract-Adapter `toBriefingContractV3` muss existieren |
| `server.js` ~20 TEMP-Debug-Endpunkte | Block | `briefing-manual`/`pipeline-probe`-Health vorher ernten |
| `lage.js`-Legacy-Shim (339-368) + Client-Mirror | Block | `presentation-backfill` gelaufen (alle 5 display_*-Felder) |
| `client.js` 60/40-Nachrechnung + Fabrikationen + `renderRadarView` | Block | Server emittiert Entscheidung; Radar-Entscheidung; Radar-Tests |
| `storage.js` V3-Flag-Branches | Block | V3 als alleiniger Store bestätigt |
| Alle 6 `HELMUT_V3_*` + `HELMUT_UNDERSTANDING_LOCK` | Flag | V3 bedingungslos live + Lock verdrahtet |
| Aspirationale V1/V2-Relationstabellen in `schema.sql` (profiles/mandate_profiles/political_items/…) | Schema | keiner — ungenutzt; entfernen, wenn V3-Store bestätigt |
| `helmut_store` (Blob) | Schema/Code | Read/Write auf V3 umgehängt; GDPR-Export/-Delete umgeschrieben |
| `backfill.js` + `presentation-backfill.js` | Datei | Ops bestätigt: keine provenienz-/display_*-losen KOs mehr |

---

## 6. Test-Strategie im V3-Only-Zustand

- **`contract-snapshot-test.js`** — härteste Entscheidung. Friert die V2-app/start-
  Form ein (`BRIEFING_REQUIRED_KEYS`/`ITEM_REQUIRED_KEYS`/`REC_REQUIRED_KEYS`).
  Bleibt bis Phase C grün. In Phase D/E: **rebaseline** (`--update`, Keys auf
  Vorgang/Lage-Form: `vorgaenge[].displayTitle/displaySummary/whyRelevant/
  recommendation/displayCategory/sources`, Client-Greps auf V3-Regeln) **oder
  retire**, falls app/start die V2-Payload fallen lässt.
- **`smoke-test.js`** (= `npm test`, Release-Gate gegen Live-Deployment) — jede
  V2-Briefing-Assertion auf V3-Lage/Vorgang + Office umhängen; `status.store.rawItems`
  + `pipeline/debug` durch `knowledge_objects`/`matching_results`-Health ersetzen;
  hartkodierte `cem ince`-Radar-Probe löschen; Accounts/RBAC/IDOR-Flow behalten.
  **Muss im Gleichschritt** mit jedem Endpoint-Cutover landen.
- **`p1-security-check.js`** — zweiseitig: V2-Sektionen
  (`personalizationChecks`/`entityChecks`/`debugReportChecks`/`engineV2Checks`) +
  fake-fallback-Greps **löschen** (sie `require()`n V2-Module → Crash beim Laden
  nach deren Löschung). Flag-default-OFF-Assertions (c5/c7a/c7b/c7c/c9 „disabled"
  + c1 fail-open/lock-no-op + c3 dip-default) **invertieren oder löschen**. Die
  injected-deps-Happy-Path-Hälften (C6/C7/C8/C9) als V3-Unit-Kern **behalten**.
- **`lage-test.js`** — Sektion 9 v3-disabled-Assertion streichen; HELMUT_LAGE_DEMO-
  Zweig behalten; Legacy-Fallback-Tests (6b2) mit dem lage.js-Shim gemeinsam löschen.
- **`goldset-test.js`, `understanding-eval.js`, `understanding-live-smoke.js`** —
  **keine Änderung** (reines V3). Jetzt in die Kern-Suite aufnehmen.
- **`package.json`** — `npm test` von „nur V2-Smoke" auf V3-Suite umstellen
  (goldset + understanding-eval + lage + umgeschriebener smoke).

---

## 7. Entscheidungen (getroffen 2026-07-06)

Die vier bau-bestimmenden Forks sind entschieden:

1. **Helmut/Recommendations-Fläche → V3-Adapter BAUEN.** `toBriefingContractV3`
   (KOs + Matching + `decisions`) speist Helmut-Tab + Home-Recommendations. Die
   Fläche bleibt als Produkt erhalten. → Phase D ist ein Neubau.
2. **Radar → Server-Engine aus KOs.** Radar wird server-seitig aus KO-Feldern
   (`mentioned_people`/`mps`/`parties`) gebaut, ein Renderer, mit Tests. Der
   client-seitige Klassifikator + `renderRadarView`(V2) + `features.v3Radar`
   entfallen.
3. **Rollen-Text-Briefing → LÖSCHEN.** `briefing.js` + `templates/{mdb,fraktion,
   mitarbeiter}.j2` + Flag `HELMUT_V3_BRIEFING` werden entfernt. Die Lage-Karten
   (`koToVorgangCard`) sind die **eine** V3-Briefing-Oberfläche.
4. **„Helmut lernt" (learning.js) → vorerst STREICHEN.** `learning.js` + zugehörige
   Endpunkte + Lernmodus-Health-Check entfallen. Späterer sauberer V3-Feedback-Loop
   auf der bereits vorhandenen `interactions`-Tabelle möglich.

Zusätzlich entschieden:
- **`decisions`-Layer wird gebaut** (CRUD in storage.js) — Grundlage für Adapter,
  Radar und Office (`decision_id`).
- **Single-Tenant bleibt** durch den Cutover (ein Pilot cem-ince); Hardcodes werden
  im Zuge des V2-Rückbaus in Profil-/Config-Daten überführt, nicht vorher.

### Noch operativ (durch den Betreiber, gegen das Live-Deployment)
- **Backfill-Kosten & -Freigabe:** Produktion hat 0 KOs. Freigabe der LLM-Ausgaben
  (1 bezahlter Understanding-Call pro Vorgang) + Tages-Kostenlimit, um genug KOs zu
  backfillen, dass Lage nicht leer ist.
- **Empty-to-Live-Umschaltung:** Shadow-anhäufen-dann-umschalten vs. atomar nach
  Backfill-Schwelle.
- **Safe-Rollout-Gerüst:** DUAL_WRITE/CANARY/READ_THROUGH/SHADOW_COMPARE bleibt
  **ungebaut** — bei effektiv einem Nutzer direkter Pilot-Env-First-Switch.

> **Sandbox-Hinweis:** Diese Entwicklungsumgebung hat kein Supabase, keine KI-Keys,
> keine Live-Daten. Offline **baubar + unit-testbar** (injizierte Deps, wie p1/lage):
> Contract-Adapter, `decisions`-CRUD, Lock-Wiring, Radar-Server-Engine, Löschen des
> toten `HELMUT_ENGINE_V2`. **Nur live** (Betreiber gegen Vercel) ausführ-/
> verifizierbar: Prod-Flag-Flips, Live-Cutover, Live-V2-Löschung + Smoke/Contract
> gegen das Deployment.

---

## 8. Top-Risiken

1. **Leere Primär-Oberfläche:** Lage hat keine V2→Karte-Brücke; `HELMUT_V3_STORE`
   read-on vor Backfill = leerer Hauptbildschirm.
2. **Stiller Contract-Bruch:** Contract-Test deckt nur V2-app/start. Lage-Karten,
   Client-60/40, Push-Shaping, Radar sind **ungedeckt** — Feld-Rename degradiert still.
3. **Unbewiesene bezahlte Pipeline:** globaler Understanding-Call pro Vorgang;
   Lock ist verdrahtet, aber flag-inert (bis `HELMUT_UNDERSTANDING_LOCK=1` droht
   Doppel-Abrechnung beim 2×/Tag-Cron); Budget default fail-OPEN.
4. **Ungegatetes V2-`personalization.js`:** live auf Read **und** Write, ohne Flag,
   ohne V3-Ersatz — vor Phase-D-Producer löschen = Home/Helmut/Push/Health leer.
5. **Doppelte heilige Entscheidung:** 60/40 + erfundene Scores im Browser; Server-
   Verlagerung ohne Client-Entkernung = inkonsistente Zähler.
6. **Release-Gate-Lockstep:** `npm test` (Smoke) läuft gegen Live-Deploy und
   hart-failt, sobald ein V2-Endpunkt/-Feld entfernt wird → Test-Umschrift **im
   selben** Cutover-Schritt.
7. **Überladenes `briefings` + zwei Renderer:** V2-Blob-`briefings` und V3-`briefings`-
   Tabelle teilen den Namen; lage.js + briefing.js schreiben denselben
   `bf-<user>-<slot>-<day>`-Namespace → ID-Kollision/Source-of-Truth-Ambiguität.
8. **Referent-Engine-Ops-Verflechtung:** `HELMUT_ENGINE_V2`-`referentEngine` steckt
   in `backendHealth`/`releaseCheck` (Pilot-Dashboard) → Entfernen ohne Ops-Umbau
   berichtet über eine gelöschte Engine.

---

_Erstellt aus vollständiger paralleler Codebasis-Analyse. Reihenfolge verbindlich:
bauen/beweisen → umschalten → erst dann löschen. Kein Bereich wird gelöscht, bevor
V3 ihn vollständig trägt und die Tests grün sind._
