# Helmut Datenmotor — Umsetzungsplan

**Grundlage:** `docs/helmut_datenmotor_audit.md` (2026-07-16). **Zweck:** priorisierte, umsetzbare Aufgabenliste für den **zweiten Thread**. In *diesem* Thread wurde nichts geändert — hier steht, *was* zu tun ist, *warum*, *wo* (Datei:Zeile) und mit welchem *Risiko/Aufwand*.

**Prioritätslegende**
- **P0 — kritisch:** Beobachtbarkeit/Sicherheit; ohne diese ist ein *überwachter* Betrieb blind oder verlustanfällig.
- **P1 — vor Bundestagspilot:** nötig, damit der laufende Cem-/Bundestag-Pilot belastbar und ehrlich ist.
- **P2 — vor Landtagspilot:** nötig, damit Berlin/Brandenburg überhaupt Inhalte liefern.
- **P3 — später:** Hygiene, Skalierung, Aufräumen.

**Aufwandslegende:** S = klein (<½ Tag), M = mittel (1–2 Tage), L = groß (>2 Tage / Migration / Freigabe).

> **Reihenfolge-Hinweis:** Fast alle P0/P1-Aufgaben sind *additive Diagnose-/Härtungs-Änderungen* ohne Produktdesign-Eingriff (Lage/Radar/Briefing/Büro/Navigation bleiben unberührt). Migrationen, Zeitplanänderungen, Secret-Rotation und Deployments bleiben Gründer-Freigaben.

---

## P0 — Kritisch (Beobachtbarkeit & Sicherheit)

| ID | Aufgabe | Warum | Wo (Datei:Zeile) | Aufwand | Risiko |
|---|---|---|---|---|---|
| P0-1 | **Crawl-/Pipeline-Laufzeit persistieren.** `t0=Date.now()` in `runSourceCrawl`, `durationMs` in `saveCrawlRun`-Objekt **UND** in die `compactStore`-crawlRun-Whitelist aufnehmen. Analog Lage-Check/Understanding-Batch. | Ohne persistierte Dauer ist ein überwachter Pilot blind; `pipeline-status.durationMs` bleibt sonst `null`. (Audit §8) | `scheduler.js:168,283-309`; `storage.js:2124-2133`; `lage.js`, `understanding.js:731-733` | M | S — additiv; ohne Whitelist-Ergänzung wird das Feld sofort wieder gestrippt (Fallstrick beachten) |
| P0-2 | **`compactStore`-Whitelist um Diagnosefelder erweitern** (`durationMs`, `understanding{}`, `googleUrlResolution`), damit Health-Report/Watchdog echte Daten sehen. | Reanimiert u. a. den toten Google-News-Monitor. (Audit §9-1) | `storage.js:2124-2133` vs. `server.js:3201` | S | S |
| P0-3 | **Pipeline-Fehler in `systemErrors` schreiben.** Die verschluckten `.catch(()=>null)`/`.catch(()=>{})` in `runSourceCrawl`/`foldLageItemsIntoV3` durch einen `recordSystemError`-fähigen Sammler ersetzen (fail-safe, nur Metadaten). | Kein `lib/helmut`-Modul meldet je einen Systemfehler → der Motor ist im Fehlerlog unsichtbar. (Audit §9-2, R3) | `scheduler.js:224,244,263,267`; `accounts.js:594 recordSystemError` | M | S — nur additives Logging |
| P0-4 | **Atomaren Pipeline-Lock.** `acquirePipelineLock` von nicht-atomarem Blob-Read-modify-write auf einen DB-Advisory-Lock / atomaren Upsert (analog `helmut_reserve_llm_call`) umstellen; **fail-open → fail-closed** bei Storage-Fehler; globalen Understanding-Lock aktivieren. | Verhindert Doppelverarbeitung/Doppel-KI-Kosten (bes. 05:30-Überlappung). (Audit §9-3, R2, R14) | `storage.js:1017-1033, 1053-1074`; `understanding.js:537-538` | M | M — Verhaltensänderung am Lock; sorgfältig testen |
| P0-5 | **Blob-Timeout-Robustheit.** `writeSupabaseStore`/`readSupabaseStore` mit Retry+Backoff und/oder Verkleinerung des `main`-Blobs (Crawl-Läufe/Locks aus dem Blob ziehen). Sofort-Minimallösung: Retention `crawlRuns` senken + Locks relational. | Ein 10-s-Timeout verliert heute einen ganzen Crawl-Save (kein Retry, kein Teil-Commit). (Audit §9-4, R1) | `storage.js:141-158,188-195,1791-1814` | L | M — berührt zentralen Speicherpfad |

---

## P1 — Vor Bundestagspilot (Ehrlichkeit & Datenqualität)

| ID | Aufgabe | Warum | Wo | Aufwand | Risiko |
|---|---|---|---|---|---|
| P1-1 | **KO-Klassifikations-Backfill ausführen** (`ko-classification-backfill.js`, 0 KI) für die 247 Alt-KOs → `decision_level`/`political_level`/Feature-Vektor. | Relevanz-Matching wirkt heute nur auf ~21 % des KO-Bestands. (Audit §10, R5) | `lib/helmut/ko-classification-backfill.js`; `scripts/ko-classification-backfill.js --execute` | S | S — idempotent, kostenneutral; **Gründer-Freigabe für Prod-Write** |
| P1-2 | **Ebenen-Casing vereinheitlichen** (`bund` klein als Kanon) + Downstream-Filter/Debug-Seed angleichen. | Filter auf `Bund` (groß) verfehlen neue KOs. (Audit §10, R9) | `classification.js:24`; `server.js:4972`; alle `political_level`-Vergleiche | S | S |
| P1-3 | **Understanding-Priorisierung scharfschalten** (`understanding-priority.js` verdrahten) statt Ankunftsreihenfolge. | Bei Budgetdeckel (1115 Skips) entscheidet heute Zufall, welche Vorgänge verstanden werden; späte amtliche Vorgänge hungern aus. (Audit §11) | `understanding.js:721-730`; `quellenarchitektur/understanding-priority.js` | M | M — Freigabeentscheidung |
| P1-4 | **`failed`-KO-Recovery** an einen Cron/Recovery-Lauf hängen (begrenzter Auto-Retry mit Zähler) statt manuellem `resetFailedUnderstanding`. | 88 Skips/Fehler-KOs sind heute dauerhaft unsichtbar. (Audit §7, R6) | `storage.js:1583-1585`; `understanding.js:591-599` | M | S |
| P1-5 | **Durchsatz ehrlich melden:** `savedItems` (Blob-Cap-Artefakt, ~15× überzeichnet) durch echte neue `raw_documents`-Deltas ersetzen; `newCandidateItems=1012`-Klemme untersuchen. | Reporting-Basis lügt heute über den Durchsatz. (Audit §8, R8) | `scheduler.js:280-298`; `storage.js:2153-2167`; `crawler.js:43-50` | M | S |
| P1-6 | **KI-Budget- & „Erfolg-ohne-Arbeit"-Achse im Health-Report.** Budget-Ausschöpfung (`skipped-*`-Rate) und `processed=0`-Läufe in `report.ok` einfließen lassen; Pro-Quelle-„zuletzt erfolgreich". | Heute alarmiert nichts bei Budget-Erschöpfung oder stillem Leerlauf. (Audit §9-5/-7) | `server.js:buildHealthReport ~3098-3232`; `quality-watchdog.js:502` | M | S |
| P1-7 | **Monitoring-Zweitkanal + Meta-Heartbeat.** Sicherstellen, dass ein unabhängiger Alarmweg existiert (Webhook), und den GitHub-Watchdog um einen `health-report?dryRun=1`-Check erweitern. | Einziger Alarm (CallMeBot) ist fail-open/still; fällt der Report-Cron aus, merkt es niemand. (Audit §9-7, R10) | `server.js:3240-3279`; `.github/workflows/briefing-watchdog.yml` | M | S |
| P1-8 | **Radar-Störungswahrheit.** `buildRadarForUser` auf `listKnowledgeObjects({_signalError:true})` umstellen (wie Lage), damit Store-Ausfall nicht als „ruhig/keine Erwähnung" getarnt wird. | Radar tarnt heute DB-Fehler als leeres Ergebnis. (Audit §9, Lage-Radar-Analyse) | `radar.js:246` vs. `lage.js:301` | S | S — keine Designänderung, nur Ehrlichkeit |
| P1-9 | **Stale-Kommentare korrigieren:** `source-mode.js:14-15` behauptet fälschlich „`on` nicht aktiviert" (ist live); `classification.js:159-160` „sonst Bund" (Code gibt `unknown`); `docs/AUDIT_DATENMOTOR_2026-07.md` als überholt kennzeichnen. | Widersprüche zwischen Code-Kommentar und Realität führen bei Due Diligence/Betrieb in die Irre. (Audit §11) | genannte Stellen | S | keiner |

---

## P2 — Vor Landtagspilot (Berlin/Brandenburg)

| ID | Aufgabe | Warum | Wo | Aufwand | Risiko |
|---|---|---|---|---|---|
| P2-1 | **Hartes Landesmodul-Gate entfernen/parametrisieren** in `buildRelationalCrawlPlan`, sodass aktivierte BE/BB-Wege durchlaufen (Google-News/RSS zuerst, PARDOK separat). | Ohne diesen Code-Fix wirkt **kein** Datenflip; alle `rp-be-`/`rp-bb-`-Wege werden vorab ausgeschlossen. (Audit §12.2-1) | `source-mode.js:35-52,112-116` | M | M — muss hinter Freigabe/Flag |
| P2-2 | **PARDOK-Live-Modus bauen** (structured_download → `raw_documents`) für BE/BB-Plenum/Drucksachen. | Heute liefert `pardokDispatch` in jedem Modus 0 Items; Live ist „bewusst nicht implementiert". (Audit §12.2-2) | `quellenarchitektur/pardok-dispatch.js:16-19,39-42,72-113`; Parser vorhanden `pardok-parser.js` | L | M — neuer aktiver Ingest-Pfad; Byte-Deckel bereits vorhanden |
| P2-3 | **Ebenen-Default entkoppeln.** `blankProfile`/`neutralProfileDefaults`/Save-Fallback dürfen `politicalLevel` nicht mehr auto-`Bund` setzen; aus `mandate_profiles.politische_ebene` ableiten. | `parliamentTypeOf` klassifiziert sonst jedes Landtagsmandat als Bundestag. (Audit §12.4, R Landtag) | `scheduler.js:1404-1441`; `server.js:4490-4534,4621`; `config.js:162-164` | M | M — berührt Profil-Defaults produktweit |
| P2-4 | **BE/BB-Daten aktivieren:** Pakete `berlin-basis`/`brandenburg-basis` `prepared→active`, Wege `needs_review→healthy`+`manual→auto`; fehlende Entitäten (Landes-Ausschüsse, Fraktionen SPD/CDU/AfD/BSW/Grüne, Behörden) seeden; `electoral_districts` (Landtagswahlkreise) füllen; je ein BE- und BB-Mandatsprofil anlegen. | Datenseitige Voraussetzung, damit der Plan überhaupt BE/BB-Quellen enthält. (Audit §12.3) | Seeds `20260717_*`; `packages.js:60-70`; `mandate_profiles` | L | M — reine Daten; Gründer-Freigabe für Prod-Seed |
| P2-5 | **Landes-Relevanz-/Scoring-Kataloge.** `matching.js`-Synonyme + `itemPoliticalWeight`/`hasGovernmentWork`/`lageCheckSourceWeight` um Landtag/Landesregierung/Staatskanzlei/Landesministerium ergänzen; `LEVEL_IMPORTANCE` pro Mandat konfigurierbar. | Sonst wird Landes-Regierungsarbeit nicht als relevant erkannt und Bund dominiert die Lage. (Audit §12.4, Output-Analyse) | `matching.js:53-74,118-126`; `scheduler.js:427,975,1145`; `scoring.js:97-99` | M | M |
| P2-6 | **Landtags-Primärquelle** (Pendant zu DIP) oder BE/BB-Parlamentsdokumentation prüfen/anbinden. | DIP ist Bundestag-only; Landtagsmandate hätten keine amtliche Primärquelle. (Audit §12.4) | `dip.js`; PARDOK-Wege | L | M |
| P2-7 | **Scoring scharfschalten** (`HELMUT_SCORING_MODE`) mit landtauglichen `LEVEL_IMPORTANCE`-Gewichten, damit ebenen-gewichtete Lage + differenzierte Leerzustände aktiv sind. | Heute Default aus → Recency-Fallback, Bund-lastig für alle. (Audit §10, Lage-Analyse) | `scoring.js:32-38`; `lage.js:316` | M | M — Gründerentscheidung |

---

## P3 — Später (Hygiene & Skalierung)

| ID | Aufgabe | Warum | Wo | Aufwand |
|---|---|---|---|---|
| P3-1 | **Retention/Archiv** für `raw_documents`/`knowledge_objects` (unbegrenztes Wachstum). | R11 | Storage | M |
| P3-2 | **Briefing→Decision relational verlinken** (`decision_ids`/`ko_ids` in `briefings`) für revisionssichere Nachvollziehbarkeit. | R12, Audit §6 | `storage.js:1630-1636` | M |
| P3-3 | **Toten V2-KI-Pfad entfernen** (`generateHelmutAssessment` + Umfeld in `ai.js`) nach Bestätigung, dass `buildHelmutAssessment` endgültig ist. | Audit §11 | `ai.js:350-420,1201` | S |
| P3-4 | **Einmal-/Migrations-Module archivieren** (`staff-backfill`, `migration-mapper`, `cem-shadow-compare`, `ko-classification-backfill`) nach `scripts/one-off/`. | Audit §11 | `lib/helmut/` | S |
| P3-5 | **require-Graph-/Dead-Code-Scan in CI** (`scripts/deadcode-scan.js`). | Audit §11 | CI | S |
| P3-6 | **Zwei Erwähnungs-Engines konsolidieren** (`radar.js` vs. `radarState.js`). | Audit §10 | beide | M |
| P3-7 | **`decisions`/`matching_results` bereinigen** (verwaiste Zeilen; heute nie gelöscht) oder als Output-Quelle nutzen. | Audit §10, Output-Analyse | `storage.js:1443-1473` | M |
| P3-8 | **Cron-Zeitzone:** entscheiden, ob DST-Drift (UTC-fix) akzeptiert oder auf Ortszeit umgestellt wird. | Audit §5 | `vercel.json` | S |
| P3-9 | **Boot-Zeit-Env-Selbstcheck** (nur „gesetzt/nicht gesetzt", nie Werte) in den Health-Report. | Audit §2, Env-Analyse | Server-Boot | S |
| P3-10 | **`document_type`-Befüllung** (99 % null) falls für Filter/Anzeige gewünscht. | Audit §10 | Understanding/Crawler | M |

---

## Zuordnung: Prozesse ohne ausreichende Laufzeitmessung → wo Messung einbauen

| Prozess | Messung fehlt | Einbauort (2. Thread) | Priorität |
|---|---|---|---|
| Crawl / Pipeline | Gesamtdauer | `scheduler.js:283` + `compactStore`-Whitelist | P0-1 |
| Lage-Check | Dauer | `scheduler.js:339` + `saveLageCheck` | P0-1 |
| Understanding-Batch (eager+Cron) | Loop-Dauer, `processed/deferred` persistiert, `skipped-store` | Auth-Store-Zähler-Zeile | P0-1/P1-6 |
| Briefing-Aufbau (`buildV3Briefing`) | End-to-End-Dauer | `server.js:1746` | P1-6 |
| Radar-Aufbau | Dauer (keine Telemetrie) | `radar.js:234` | P3 |
| Pro-Quelle | `last_success_at` | `saveRawDocument`/`retrieval_paths` | P1-6 |
| Quellenpfad | relational vs. Fallback je Lauf | `scheduler.js:503-514` | P1-5 |
| KI-Budget | Ausschöpfung als Alarm | Health-Report | P1-6 |

---

## Offene Gründerentscheidungen

*Nur Fragen, die die Codeanalyse nicht beantworten kann.*

### E1 — Prod-Env-Werte bestätigen (nicht einsehbar)
1. **Entscheidung:** Die tatsächlichen Vercel-Env-Werte offenlegen/bestätigen.
2. **Einfache Erklärung:** Der Code liest „sensitive" Variablen nicht; wir kennen nur die Datei-Flags + abgeleitetes Verhalten.
3. **Warum notwendig:** Budgetdeckel, Fail-Closed-Verhalten, Locks, Matching-Aktivierung hängen daran.
4. **Optionen:** (a) Werte als sicheres Boolean-Inventar teilen; (b) Boot-Selbstcheck einbauen (P3-9); (c) unverändert lassen.
5. **Empfehlung:** (a)+(b).
6. **Vorteil:** Ende der Annahmen; belastbare Betriebsbasis.
7. **Risiko:** minimal (nur „gesetzt/nicht gesetzt", keine Werte in Logs).
8. **Folge ohne Entscheidung:** zentrale Betriebsparameter bleiben ungeklärt (u. a. 50 vs. 100 Calls/Tag).
9. **Dringlichkeit:** hoch.
10. **Betroffen:** LLM-Budget, Auth-Modus, Matching, Monitoring.

### E2 — KO-Klassifikations-Backfill freigeben
1. **Entscheidung:** `ko-classification-backfill` einmalig auf Prod ausführen.
2. **Erklärung:** 247 alte Wissensobjekte haben keine politische Ebene und keinen Feature-Vektor.
3. **Warum notwendig:** Ohne Ebene/Vektor findet das Relevanz-Matching sie nicht.
4. **Optionen:** (a) einmal ausführen; (b) zusätzlich an einen Cron hängen; (c) lassen.
5. **Empfehlung:** (a) sofort, (b) mittelfristig.
6. **Vorteil:** ~3× größerer nutzbarer KO-Bestand, kostenneutral (0 KI).
7. **Risiko:** sehr gering (idempotent, additiv).
8. **Folge ohne Entscheidung:** Matching bleibt auf ~21 % beschränkt; Landtag-Ebenen-Trennung unmöglich.
9. **Dringlichkeit:** hoch.
10. **Betroffen:** Matching, Lage, Radar, Landtagsfähigkeit.

### E3 — Blob→relational-Migration der Betriebsdaten terminieren
1. **Entscheidung:** Crawl-Läufe/Locks/Kosten aus dem 1,24-MB-Blob in relationale Tabellen ziehen.
2. **Erklärung:** Der Monolith-Blob läuft wiederkehrend in 10-s-Timeouts; ein Timeout kann einen Crawl-Save verlieren.
3. **Warum notwendig:** Der Blob wächst mit jedem Mandanten → skaliert nicht für Landtag/Mehrkunden.
4. **Optionen:** (a) sofortige Minimallösung (Retention senken + Locks relational, P0-5); (b) volle Migration (L); (c) lassen.
5. **Empfehlung:** (a) vor Bundestagspilot, (b) vor Landtag/Skalierung.
6. **Vorteil:** kein Lauf-Verlust; robustere Beobachtbarkeit.
7. **Risiko:** mittel (zentraler Speicherpfad; sorgfältig testen).
8. **Folge ohne Entscheidung:** sporadischer Datenverlust bleibt, verschärft sich mit Wachstum.
9. **Dringlichkeit:** hoch (P0 für Minimallösung).
10. **Betroffen:** gesamter Motor.

### E4 — Landtag-Cutover Berlin/Brandenburg
1. **Entscheidung:** BE/BB scharfschalten (2 Codeänderungen + Datenaktivierung) oder verschieben.
2. **Erklärung:** BE/BB ist heute dreifach hart gesperrt und liefert 0 Items.
3. **Warum notwendig:** Ohne Umbau kein Landtagsinhalt — kein reines Datenflippen.
4. **Optionen:** (a) voller Cutover (P2-1..P2-7); (b) nur Google-News/RSS-Landeswege (ohne PARDOK-Plenum); (c) verschieben.
5. **Empfehlung:** (b) als Zwischenschritt (schnell, ohne PARDOK-Code), dann (a).
6. **Vorteil:** frühe BE/BB-Abdeckung über Medien-/Fraktionswege.
7. **Risiko:** mittel; hinter Flag/Freigabe, Bundestagsbetrieb unberührt.
8. **Folge ohne Entscheidung:** Landtag bleibt strukturell vorbereitet, aber inaktiv.
9. **Dringlichkeit:** mittel (nach Bundestagspilot-Härtung).
10. **Betroffen:** Quellenarchitektur, Klassifikation, Scoring, Profile.

### E5 — Scoring scharfschalten (`HELMUT_SCORING_MODE`)
1. **Entscheidung:** die 3-Dimensionen-Bewertung (Wichtigkeit/Relevanz/Handlungsfähigkeit) aktivieren.
2. **Erklärung:** Heute aus → Lage/Radar nutzen reines Ähnlichkeits-Matching + Recency-Fallback.
3. **Warum notwendig:** ebenen-gewichtete Lage (Bund vs. Land) und ehrliche Leerzustände (Datenlücke vs. ruhig).
4. **Optionen:** (a) an, mit Bund-Gewichten; (b) an, mit landtauglichen Gewichten; (c) aus lassen.
5. **Empfehlung:** (a) für Bundestag jetzt, (b) für Landtag.
6. **Vorteil:** differenziertere, ehrlichere Priorisierung.
7. **Risiko:** mittel (verändert sichtbare Rangfolge — vor Aktivierung gegen Realdaten prüfen).
8. **Folge ohne Entscheidung:** Lage bleibt recency-getrieben, Landtag strukturell Bund-lastig.
9. **Dringlichkeit:** mittel.
10. **Betroffen:** Lage, Radar, Helmut-Stand.

### E6 — Rolle von `decisions`/`matching_results`
1. **Entscheidung:** persistierte Relevanz-Tabellen als Output-Quelle nutzen, über alle Profile schreiben, oder als Telemetrie führen.
2. **Erklärung:** Heute werden sie fast nie gelesen (Output = on-read-Recompute), nur für `cem-ince` geschrieben, nie bereinigt.
3. **Warum notwendig:** Klärt, ob Persistenz gebraucht wird und ob weitere Mandate sie brauchen.
4. **Optionen:** (a) als Telemetrie führen + Cleanup; (b) Read-Pfad umstellen + alle Profile loopen; (c) ganz entfernen.
5. **Empfehlung:** (a) kurzfristig; (b) wenn Persistenz-Vorteile (Historie) gewünscht.
6. **Vorteil:** weniger Verwirrung, kein verwaister Datenberg.
7. **Risiko:** gering.
8. **Folge ohne Entscheidung:** Schreib-Last ohne Nutzen; falsche Interpretation „was der Nutzer sieht".
9. **Dringlichkeit:** niedrig-mittel.
10. **Betroffen:** Ausgabe, Storage, Landtag-Skalierung.

### E7 — Sind `sources`/`rawItems`-Blob-Daten eingefroren?
1. **Entscheidung:** klären, ob die Blob-Kataloge (`sources`=144, `rawItems`=466) noch aktiv gepflegt werden.
2. **Erklärung:** Der Code liest/schreibt sie weiter; ob die *Daten* stillstehen, ist codeseitig nicht belegbar.
3. **Warum notwendig:** Betrifft, ob der alte Katalog-Pfad noch Wahrheit oder Altlast ist.
4. **Optionen:** (a) datenseitig prüfen (Zeitstempel); (b) als Fallback belassen; (c) abschalten.
5. **Empfehlung:** (a), dann entscheiden.
6. **Vorteil:** Klarheit über Alt-Pfad; ggf. kleinerer Blob (Timeout-Entlastung).
7. **Risiko:** gering.
8. **Folge ohne Entscheidung:** unklarer Alt-Pfad, größerer Blob.
9. **Dringlichkeit:** niedrig.
10. **Betroffen:** Storage, Quellenpfad.

---

*Erstellt aus `docs/helmut_datenmotor_audit.md`. Alle Datei:Zeile-Verweise beziehen sich auf HEAD = Production-Commit `427295c`.*
