# Sprint 7 — Abschlussbericht (Qualitäts-/Kostenmessung + mehrachsiger Watchdog)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible, additive Arbeiten — **keine** Production-Migration,
keine Production-Datenänderung, keine Cron-Änderung, kein Deployment, keine Quellenaktivierung.

## 1. Architektur

Neues reines Logik-Modul **`lib/helmut/quellenarchitektur/quality-watchdog.js`** (keine KI/Netz/
Storage; **alle** Eingaben aus echten Reads injiziert). Beantwortet die 10 Auftragspunkte:
1/2 `assessRetrievalPaths.technicalHealth` (funktioniert/defekt), 3 `contentYield.documentCount`,
4 `productValue='ergiebig'`/`koCount`, 5 `productValue='nur_duplikate'`, 6 `assessPackages.supply`,
7 `assessProfiles` (Sprint-4-`profileSupplyStatus` wiederverwendet), 8 `buildWatchdog` (10 Achsen),
9 `assessCosts` (echte `llm_usage`), 10 `recommendedAction` je Objekt + `buildRecommendations` (ranked).

Zusätzlich: `buildLlmUsageRecord` (`storage.js`) trägt jetzt additiv `sourceId`/`packageId`/`vorgangId`/
`knowledgeObjectId` (rückwärtskompatibel). Migration `20260716_llm_usage_source_attribution.sql` +
Rollback (additive Spalten/Indizes, **freigabepflichtig**, nicht angewendet).

## 2. Umsetzung der Vorgaben
- **`llm_usage` tatsächlich genutzt:** `assessCosts` liest die realen Records (Blob-Ring, `estimatedCost`
  USD, `pipelineStep`, `model`), aggregiert nach Schritt/Modell in **USD mit Sub-Cent-Präzision**;
  `skipped-*`/außerhalb Fenster/`unknown` werden **ehrlich ausgeschlossen** (nie 0 erfunden).
- **Watchdog getrennt** für Crawl, Understanding, Knowledge Objects, Matching, Lage, Radar, Helmut,
  Briefings, Paketversorgung, kritische Quellen (`frisch`/`warn`/`tot`/`unbekannt` + Handlung je Achse).
- **Keine erfundenen Kennzahlen:** Verfügbarkeits-Flags (`duplicates`, `costAttribution`, `pathTelemetry`
  = heute leer in Prod) markieren fehlende Grundlagen als **nicht verfügbar** (`null`/`'unbekannt'`).
- **Bestehender `watchdog-state.js` (WhatsApp-Report) unverändert** — additiv daneben, kein Bruch.

## 3. Tests — alle grün
**`test:quality-watchdog` 54/54** — die 10 Auftragspunkte, drei Qualitätsarten, Kosten-Präzision +
Ausschlüsse, alle 10 Achsen inkl. `unbekannt`/`storageOk`, ranked Empfehlungen, jedes Ehrlichkeits-Flag,
echter Sprint-1-Katalog (jeder Abrufweg bewertet, defekte Pflichtquellen erkannt).
**Keine Regression:** llm-budget 22, profile-db 44, watchdog-state 43, p1 322, source-architecture 88,
profile-packages 57, supply-matrix 20, contract 17.

## 4. Sicherheit, Kosten, Performance
- **Sicherheit/Mandanten:** reine, mandantenlose Mess-Logik über öffentliche Quellendefinitionen +
  aggregierte Kosten (kein PII; `estimatedCost`/Token bleiben intern, nie im Abgeordneten-Frontend).
- **Kosten:** keine — reine Logik/Tests, 0 KI, 0 Netz. Die Metrik hilft, **künftige** Kosten zu senken
  (nur-Duplikate-Wege erkennen/deaktivieren).
- **Performance:** O(Dokumente + Records + Abrufwege); nicht im App-Start-Pfad, für Admin-Vorberechnung.

## 5. Offene Risiken / Grenzen
- **Nicht in den Admin verdrahtet** (Darstellung = Sprint 8). Sprint 7 liefert die Mess-Logik.
- **Duplikat-/Telemetrie-Kennzahlen erst nach Shadow-Ingest belastbar** (`document_findings`,
  `retrieval_paths.last_success_at` in Prod leer) — heute korrekt als „nicht verfügbar" markiert.
- **Kosten je Quelle erst nach Verdrahtung** des `sourceId` in den Schreibpfad + Freigabe.

## 6. Noch nicht ausgeführte Production-Schritte (freigabepflichtig, nichts ausgeführt)
Migration `20260716` (llm_usage-Attribution) + `20260713/14/15` anwenden · `sourceId`/`packageId`/
`vorgangId` in den `llm_usage`-Schreibpfad verdrahten (Understanding/Crawl) · Blob-Ring → Tabelle ·
kostenbasierter Deckel am Understanding-Pfad · Admin-Darstellung (Sprint 8). **Alles vorbereitet,
nichts ausgeführt.**

## 7. Nächster Sprint
**Sprint 8** (Admin-Oberfläche) macht `quality-watchdog` + `profileSupplyStatus`/`computeGlobalActivation`
(S4) + die S5-Scores/Leerzustände sichtbar — **ohne** etwas scharfzuschalten (sicher vorziehbar). **Oder**
Sprint 6 (Migration + Shadow-Betrieb, Cem-Schutz; freigabepflichtig), der die heute „nicht verfügbaren"
Kennzahlen (Duplikate/Telemetrie) mit echten Daten füllt.
