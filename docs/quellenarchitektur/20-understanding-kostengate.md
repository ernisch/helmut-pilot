# Kostenlogik vor dem Understanding — Prüfung + Vorprüfungs-Gate (Teil 1–4)

Read-only geprüft, keine Annahmen. Alle Zahlen unten sind read-only aus Production gemessen
(Fenster 09.–14.07.2026, 20 `full`-Crawls) oder klar als **Simulation** gekennzeichnet.

## Teil 1 — Tatsächlicher Production-Pfad (Code-belegt)

Kette: `scheduler.runSourceCrawl` → `crawler.crawlAllSources` → `saveRawItems` (Legacy-Blob) →
`persistRawDocumentsShadow` (→ `raw_documents`, gatet auf `HELMUT_V3_STORE`) →
`understanding.runUnderstandingShadow(savedItems)` (eager) bzw. `runPendingUnderstandingShadow`
(Cron `/api/cron/understanding`).

1. **Auswahl der raw_documents fürs Understanding:** `runUnderstandingShadow` bekommt nur die
   **neuen** Items eines Crawls (`saveRawItems` liefert nur unbekannte `hash`). Diese werden
   `toRawDocumentRow` → `dedupeRawDocuments` (content_hash) → `clusterRawDocuments` (Anker-Token)
   zu **Vorgangs-Clustern**. **Ein LLM-Call pro Cluster**, nicht pro Dokument.
2. **Filter direkt vor dem LLM (`understandOneCluster`):** genau zwei — (a) existiert bereits ein
   KO zur `vorgang_id` (`status != 'pending'`) → `skipped-exists` (kein Call); (b) `canSpendLlm()`
   = **globaler Tages-Call-Deckel** (`HELMUT_MAX_LLM_CALLS_PER_DAY`, Default ∞) erreicht →
   `skipped-budget`. Sonst → **voller gpt-5-mini-Call**.
3. **Übersprungen:** `skipped-exists` (Vorgang schon verstanden), `skipped-failed` (geparkt,
   kein Retry), `skipped-budget` (Deckel), `skipped-error`/`skipped-invalid` (nach dem Call).
4. **Bereits verstanden / unverändert:** doppelt geschützt — gleicher `hash` wird gar nicht erst
   als „neu" übergeben; gleicher `vorgang_id` → `skipped-exists`. Ein bereits verstandener Vorgang
   erzeugt keinen zweiten Call.
5. **Geprüft wird VOR dem LLM:** nur Cluster-Existenz + Tagesdeckel. **NICHT** geprüft: politische
   Relevanz, Alter, Länge, Sprache, Quarantäne/Source-Safety, Dokumentart. Relevanz (`why_relevant`,
   `confidence_score`) ist ein **Output** des LLM, kein Vorfilter. Source-Safety/Quarantäne greift
   nur im **Lese-Pfad** (`lage`/`radar`/`radarState`), also **nach** dem bezahlten Call.
6. **Kann jedes neue eindeutige Dokument einen LLM-Call auslösen?** Ja — jeder **neue Vorgang**
   (neue `vorgang_id`) mit ≥1 Dokument erzeugt einen vollen Call, allein durch den blinden
   Tagesdeckel begrenzt (verwirft nach **Ankunftszeit**, nicht nach Relevanz).
7. **Durchsatz-Steuerung:** `HELMUT_V3_STORE`/`ai.isAiEnabled` (an/aus), globaler
   Understanding-Lock, `HELMUT_MAX_LLM_CALLS_PER_DAY` (Tagesdeckel), `budgetMs`-Zeitfenster
   (eager 90 s, sonst Rest im Understanding-Cron), Cluster-Dedup, `vorgang_id`-Dedup.

## Teil 2 — Reale Mengen (7 Tage, read-only)

Kostenlog liegt in `helmut_store['main-auth'].llmUsage` (**1730 Einträge**); die separate
Supabase-Tabelle `llm_usage` ist leer/ungenutzt.

| # | Kennzahl | Wert (7 Tage) | Quelle |
|---|---|---|---|
| 1 | Crawlfunde gesamt (roh, vor Dedup) | **nicht persistiert** | crawlRun speichert erst nach Dedup |
| 2/3 | Kandidaten (nach Crawl-Dedup + Cap) | **20.240** | `crawlRuns` Σ `newCandidateItems` |
| 4 | neue eindeutige raw_documents | **2.280** | `raw_documents`, alle distinct `content_hash` |
| 5 | fürs Understanding vorgesehen (neue Vorgänge) | **574** | 99 ausgeführt + 475 geblockt |
| 6 | tatsächlich gestartete Understanding-Calls | **99** | `llmUsage` callType=understanding |
| 7 | erfolgreich verstanden | **99** (0 Fehler/invalid) | `llmUsage` success=true |
| 8 | übersprungen (Gründe) | **475 skipped-budget**; 0 error/invalid; + ungeloggte skipped-exists | `llmUsage` |
| 9 | erzeugte Knowledge Objects | **82** (gesamt 247) | `knowledge_objects` |
| 10 | Tokens / Kosten | understanding **301.846 in / 87.186 out**, **$0,25**; alle Calls **$0,37** | `llmUsage` |

Kernbefund: **83 % der Understanding-Nachfrage (475/574) wird blind durch den Tagesdeckel
verworfen** — nach Ankunftszeit, nicht nach Relevanz. Ø Understanding-Call: 3.049 in / 881 out
Token, **$0,00252**.

## Teil 3 — Bewertung der bestehenden Vorprüfung

| Stufe | Status | Beleg |
|---|---|---|
| Quellenfilter vor dem Crawl | **vollständig** | `crawlAllSources` crawlt nur `active`-Quellen; kuratierte Quellen/retrieval_paths |
| Technische Dokumentfilter | **teilweise** | leere Titel/URL raus, Homepage-Filter, Titel-Cap; **kein** Alters-/Längen-/Sprachfilter |
| Deduplizierung | **vollständig** | mehrschichtig: Crawl-hash, `saveRawItems`-hash, `dedupeRawDocuments`, `vorgang_id` |
| Source Safety | **teilweise** | existiert, greift aber **nur im Lese-Pfad** (nach dem LLM), nicht als Kosten-Gate davor |
| **Politische Relevanzprüfung** | **nicht vorhanden** | Relevanz ist LLM-Output, kein Vorfilter — **die Lücke** |
| Vollständiges Understanding | **vollständig** | gpt-5-mini, JSON-Schema, KO + Provenienz |

**Lücke:** keine politische Vorprüfung direkt vor dem vollen Understanding; die einzige Bremse ist
der blinde Tagesdeckel. Zusatzrisiko zum Go-Live: PARDOK-Struktur würde erneut per KI extrahiert
(doppelte KI), da amtliche Dokumente denselben Weg nähmen.

## Teil 4 — Understanding-Gate (offline gebaut, NICHT verdrahtet)

`lib/helmut/quellenarchitektur/understanding-gate.js` — reine Logik, keine KI/Netz/DB, von keinem
Runtime-Modul importiert (sichtbare Pfade unverändert). Reihenfolge exakt nach Auftrag:

1. **Hygiene** — ungültige/leere/extrem kurze/zu alte/unveränderte Dokumente raus (mit Grund).
2. **Globale Dedup** — gleicher `content_hash` höchstens einmal → höchstens ein voller Call.
3. **Amtlich/strukturiert** — bekannte `document_type`/amtliche Quelle → `verstehen` mit
   `structured:true`; **keine erneute KI-Extraktion** der Struktur.
4. **Politische Relevanz** — Regeln + Metadaten (`deriveDecisionLevel` = Institution/Ebene, plus
   Topic-/Partei-Signale). Klare Institution **oder** Topic+Partei → `verstehen`.
5. **Grenzfall** — genau ein schwaches Signal → `zurueckstellen` (optional günstiges Modell /
   Operator-Sichtung; **markiert, nicht gelöscht**).
6. **Voll verstehen nur** für `verstehen`-Kandidaten; `parken` (kein Signal) → nie gelöscht.

**Profil-unabhängig** (nur allgemeinpolitische Signale). Entscheidungen: `verstehen` /
`zurueckstellen` / `parken` / `unveraendert` / `hygiene`, je mit Grund.

**Gemessene Gate-Verteilung auf den echten 2.280 Titeln:** `verstehen` **27,6 %**
(amtlich 35 + Institution 541 + Topic&Partei 54), `zurueckstellen` **27,6 %** (nur Topic 380 +
nur Partei 249), `parken` **44,8 %** (kein Signal 1.021).

### Simulation (real erdet, `scripts/understanding-gate-cost-sim.js`)

Pro **1000 neue Dokumente**: ohne Gate **$0,6355** → mit Gate **$0,20–0,37**
(Einsparung **41–69 %**, realistisch ~58 % bei 40 % Promotion der Grenzfälle).
Pro **1000 Crawlfunde** (≈113 neue Docs): ohne Gate $0,072 → mit Gate $0,022–0,042.
Die einzige Annahme (Promotion-Rate) ist als Band ausgewiesen; alle übrigen Zahlen sind gemessen.

### Akzeptanzkriterien — Nachweis (`scripts/understanding-gate-test.js`, alle grün)

1. Kein relevantes amtliches Dokument still verworfen (amtlich von Alters-/Kurz-Hygiene ausgenommen).
2. Jede Ablehnung mit nachvollziehbarem Grund. 3. Unsicheres → `zurueckstellen`, nicht gelöscht.
4. Amtliche Struktur → `structured:true`, keine doppelte KI. 5. Derselbe Inhalt höchstens ein
   voller Call (Dedup + `unveraendert`). 6. Kosten/Einsparung für 1000 simuliert.
7.–11. Lage/Radar/Helmut/Büro unverändert; keine Prod-Datenänderung; kein Deployment; keine
   Quellenaktivierung; keine Flags/Cron — das Gate ist ein isoliertes, nicht verdrahtetes Modul.

## Empfohlene Reihenfolge zur Aktivierung (separate Freigaben)

1. **Shadow-Messung** des Gate über `raw_documents` (read-only) über 1–2 Wochen → reale
   `verstehen`/`zurueckstellen`/`parken`-Verteilung + Promotion-Rate bestätigen.
2. **Verdrahtung als Vorfilter** in `understanding.runUnderstandingShadow` **hinter einem Flag**
   (`HELMUT_UNDERSTANDING_GATE`, Default aus): Cluster ohne `verstehen`-Dokument bekommen keinen
   vollen Call; `zurueckstellen` → optionaler gpt-4o-mini-Check; `parken` → nur markiert.
3. **Erst dann** Tagesdeckel anheben/lösen — die Relevanz statt der Ankunftszeit begrenzt dann die
   Kosten. Kein Schritt verändert Lage/Radar/Helmut/Büro.
