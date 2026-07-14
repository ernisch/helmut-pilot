# Understanding-Gate — Production-Bereitschaft (Phasen A–J)

Dieses Dokument beschreibt den fertig vorbereiteten, gegen echte Production-Daten kalibrierten
Understanding-Kosten-Gate. Ergänzt Doku 20 (Erst-Analyse). Alle Zahlen sind read-only gemessen
oder klar als Simulation gekennzeichnet. Es wurde **keine** Production-Änderung ausgeführt.

## Alter Understanding-Pfad (Ist)

`scheduler.runSourceCrawl` → `crawler.crawlAllSources` → `saveRawItems` →
`persistRawDocumentsShadow` (raw_documents) → `understanding.runUnderstandingShadow`. Ein
gpt-5-mini-Call **pro neuem Vorgangs-Cluster**; einzige Bremsen davor: `vorgang_id`-Dedup
(`skipped-exists`) und ein **blinder Tages-Call-Deckel** (verwirft nach Ankunftszeit). Keine
politische Relevanzprüfung. Real: 2280 neue Docs/7T → 574 Understanding-Nachfrage, 99 ausgeführt,
**475 gedeckelt**, $0,37/Woche gesamt.

## Neuer Gate-Pfad

`lib/helmut/quellenarchitektur/understanding-gate.js` (reine Logik). Reihenfolge:
Hygiene → globale Dedup → amtlich/strukturiert (ohne KI) → politische Relevanz (Regeln + Quellen-
Tier) → Grenzfall zurückstellen → volles Understanding nur für relevante Kandidaten.

### Gate-Entscheidungen & Gründe
- **verstehen** — voller Understanding gerechtfertigt. Gründe: `amtliche-dokumentart`,
  `amtliche-quelle`, `institution-ebene`, `topic-und-partei`.
- **zurueckstellen** — Grenzfall → optionaler günstiger gpt-4o-mini-Check / Operator-Sichtung,
  **markiert, nicht gelöscht**. Gründe: `kuratierte-quelle-ohne-keyword`, `nur-topic`, `nur-partei`.
- **parken** — kein politisches Signal (generischer Medien-Feed). Nicht gelöscht. Gründe:
  `kein-politisches-signal`, `zu-alt`.
- **unveraendert** — `content_hash` bereits verstanden → kein neuer Call.
- **hygiene** — ungültig/leer/zu kurz (amtliche Dokumente ausgenommen).

### Umgang mit Unsicherheit
Unsichere Dokumente werden **zurückgestellt**, nie geparkt-und-vergessen und nie gelöscht. Der
günstige Zweitcheck (gpt-4o-mini, 30× billiger) entscheidet später über Promotion zum vollen
Understanding.

### Amtliche Ausnahmen
Amtliche/strukturierte Dokumente (Dokumentart aus PARDOK/Drucksachen ODER Quelle `-plenum`/
`offiziell`) werden **immer verstanden** und sind von Titel-/Kürze-/Alters-Hygiene **ausgenommen**
(`structured:true` → keine doppelte KI-Extraktion der bereits geparsten Felder).

### Quellen-Tier (Kernkorrektur)
`amtlich` (nie geparkt, structured) · `kuratiert` (Ausschuss-/Prozess-/Ministeriums-/Fraktions-
Feeds → nie geparkt, mind. zurückgestellt) · `medien` (generisch → Keyword-Filter, ohne Signal
parken). Diese Korrektur senkte die kritischen Fehler von **107 → 0 echte**.

## Kalibrierung gegen echte Production-Daten (Phase A)
SQL-Spiegel des Gate über ALLE raw_documents + Gegenmatrix + kritische Fehler (KO, dessen alle
Quelldokumente geparkt würden). Erste Regelfassung: **107 kritische Fehler** (43 % der KOs). Nach
3 read-only nachgemessenen Iterationen (breiteres Lexikon + Quellen-Tier): **2 kritische Fehler,
beide korrekte Parks** (DAX-Marktbericht, Krankenhaus-Hitze aus tagesschau-politik) → **0 echte**.
Das echte JS-Gate deckt sich zu 100 % mit dem SQL-Spiegel (Stichprobe n=42, 0 kritische
Abweichungen). Verteilung 7 T (Doc): verstehen 43 % / zurückstellen 33 % / parken 24 %.

## Fairness (Phase B, 14 T)
Amtliche/kuratierte/Fraktions-/Verbands-/Ausschuss-Quellen: **0 geparkt**; amtliche Dokumente nie
nicht-verstanden. Nur generische Medien werden gefiltert (Auslandsnews/Börse korrekt). Kleine/
regionale Quellen nicht durch fehlende Bundessignale benachteiligt.

## Kostenmodell (Phase C, ehrlich)
Understanding läuft pro **Cluster** — real haben nur 23 % der Cluster ein `verstehen`-Doc, 76 % sind
reine Grenzfälle, 1 % komplett unpolitisch. Hebel ist das **günstige Triage** der 76 %, nicht das
Wegfallen von Clustern. Simulation (`understanding-gate-cost-sim.js`), Best/Real/Worst je 100
Cluster: Ersparnis 74,5 % / 36,6 % / −1,3 %. Im Worst Case (Triage bestätigt alles) minimal teurer
→ die **Triage-Ablehnungsrate** ist der im Shadow zu messende Schlüsselwert. Kosten und
Qualitätsrisiko getrennt bewertet.

## Tagesdeckel (Phase D)
Real ~15–20 Understanding/Tag, 75–95 % gedeckelt, Auswahl nach **Ankunftsreihenfolge**. Neue Logik
`understanding-priority.js` (reine Logik, Shadow): 7-stufig — amtliche Pflicht > hohe Relevanz >
Frist > globale Wichtigkeit > regionale Pflicht > Grenzfall > niedrig. Nachweis: unter Budget 10
verdrängt Ankunft 6/6 amtliche, Priorität 0/6. **Prod-Deckel unverändert.**

## Shadow-Modus & späterer On-Modus (Phase E)
Guard `HELMUT_UNDERSTANDING_GATE`, Default **off**:
- **off** → Gate nie aufgerufen, byte-identisches Altverhalten.
- **shadow** → Gate je Cluster berechnen + Aggregat protokollieren, **blockiert nichts**, keine
  Nutzerergebnis-Änderung.
- **on** → echter Vorfilter; bewusst **nicht scharf** (nur Protokoll + Hinweis), Aktivierung
  erfordert separate Freigabe.

## Monitoring / Telemetrie (Phase F)
Shadow-Senke default = Console-Aggregat (kein Prod-Write). Production-Tabelle `gate_shadow_events`
(Migration `20260716_gate_shadow_telemetry.sql` + Rollback) **vollständig vorbereitet, nicht
ausgeführt**: raw_document_id, source, package, tier, gate_decision, gate_reason, political_signals,
amtlich, geografie, document_type, vorgang_id, understanding_result, knowledge_object_id,
estimated_cost, model, created_at. RLS service_role-only, nur Signale/IDs (kein PII).

## Admin-Anzeige
Die Telemetrie-Aggregate (verstehen/zurückstellen/parken je Quelle/Paket, Triage-Ablehnungsrate,
kritische Fehler) sind für den bestehenden Admin-/Watchdog-Report auslesbar (read-only), sobald der
Shadow-Modus Daten liefert. Kein sichtbarer Nutzerpfad betroffen.

## Rollback
- **Gate/Priorität/Telemetrie-Code**: rein additiv, von den sichtbaren Lesepfaden nicht importiert.
  `HELMUT_UNDERSTANDING_GATE` default off → inert. Vollständige Rücknahme = Commit-Revert;
  `understanding.js` ist danach byte-identisch (der Gate-Block ist vollständig hinter `!== 'off'`).
- **Telemetrie-Tabelle**: `20260716_gate_shadow_telemetry_rollback.sql` (DROP TABLE, idempotent).
- Keine bestehende Tabelle/Spalte/Daten verändert.

## Tests (alle grün, 23/23 Offline-Suite)
`understanding-gate-test` · `gate-realdata-validation` (n=42, 100 % Deckung) ·
`understanding-priority-test` · `understanding-gate-integration-test` (off byte-identisch) ·
`pardok-gate-test` · `gate-adversarial-test` (18 Szenarien) · `gate-e2e-shadow-test` (4 Profile) +
alle Bestands-Tests (Parser/Dispatch/Dedup/Scoring/Watchdog/Profile/Preflight).
