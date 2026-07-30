# Punkt 29 — Fehlerpfade und Wiederholungen (Belastungs- und Fehlervertrag)

**Stand:** 2026-07-30 · **Kanonisch für:** Checklisten-Zeile 29 (Schnitt 29A/29B, Umfang,
Belege, Befunde) · **Code/Tests:** [`scripts/punkt29-fehlervertrag-test.js`](../../scripts/punkt29-fehlervertrag-test.js),
[`scripts/punkt29-mutationsprobe.js`](../../scripts/punkt29-mutationsprobe.js),
[`scripts/punkt29-befundproben.js`](../../scripts/punkt29-befundproben.js)

---

## 1 · Verbindliche Definition und Schnitt

**Punkt 29** ist Zeile 29 der [`phase_1_checkliste.md`](phase_1_checkliste.md)
(Bereich **Betrieb**): *„Fehlerpfade und Wiederholungen prüfen — Timeouts, Limits,
fehlerhafte Inhalte und Wiederholungen funktionieren kontrolliert."* Die Checkliste
ordnet dem Punkt ausdrücklich **Befund A-7** zu (Doppelläufe mit `circuit-open`
verzerren die Telemetrie → auch OP-15) und führt die **OP-25-Cron-Fairness** als
Teilvorleistung mit **offenem Production-Nachweis**.

**Nicht verwechseln:** OP-15 (Google-News-Klumpenrisiko) und OP-25 (Cron-Fairness)
sind Punkte der [`../datenmotor-restliste.md`](../datenmotor-restliste.md) und bleiben
von diesem Sprint unberührt.

Der Punkt ist — wie die Punkte 25/26/27 — geschnitten in:

- **29A (dieser Sprint): deterministischer Repository-Vertrag.** Alle Fehlerklassen
  offline, gegen die echten Produktionsfunktionen, mit Testdoubles nur an äußeren
  Grenzen (Netz, DB, KI, Zeit). **Erfüllt** — Belege unten.
- **29B (offen): rein lesender Production-Nachweis.** Ein Punkt im Bereich „Betrieb"
  wird erst grün, wenn das kontrollierte Verhalten auch an **echten regulären Läufen**
  belegt ist (Checklisten-Grundregel: „Code oder Datenbankzeilen allein genügen
  nicht"; Präzedenz: A/B-Schnitt der Punkte 25/26/27; die 29-Zeile führt den
  OP-25-Production-Nachweis selbst als offen). Wichtig: **künstliche Fehler in
  Production sind verboten** ([`../betrieb/quellenstoerungen.md`](../betrieb/quellenstoerungen.md) §11) —
  29B ist ausschließlich die rein lesende Verifikation **natürlich auftretender**
  Fehlerzustände (§6).

**Abhängigkeiten:** 29A hängt an keinem anderen Punkt. 29B braucht reguläre Läufe
(dieselbe Wartesituation wie 25B, aber ein **getrennter** Auftrag) und wird durch die
**Befunde P29-1…P29-4 (§5)** mitbestimmt: zwei der gefundenen Fehler betreffen genau
die Ehrlichkeit der Lauftelemetrie, die 29B lesend prüfen würde.

## 2 · Stand vor diesem Sprint

Punkt 29 stand auf **☐ offen**; es gab keine kanonische Nachweisdoku, keinen
gebündelten Fehlervertrag und — bis auf die eingebaute Mutationsprobe der
Cron-Fairness — **keine Mutationsnachweise** für die Fehlerpfade. Es gab aber
**erhebliche belastbare Bestandsbelege** (vollständige Tabelle §7), v. a.:
`cron-fairness-test.js` (Deadline/Rotation/Abbruch, inkl. 10 eingebauter Mutationen),
`crawler-hardening-test.js` + `incident-crawl-amplifikation-test.js` (Fehler-,
Timeout-, Breaker-Verhalten am echten `crawlAllSources` mit echtem lokalem HTTP),
`google-news-hardening-test.js` (Breaker/Retry/Cooldown), `source-failure-test.js`
(Störungsklassifikation, 14 Zustandsklassen), `llm-reservation-test.js`
(Budget-Race am Choke-Point), `matching-audit-test.js` (Idempotenz, Publish-Fehler,
Lock-TTL), `stoerungswahrheit-test.js` + `werkzeug-lesefehler-test.js` (kein
falsches Grün), `prozesslauf-telemetrie-test.js` (Telemetrieverlust W-2),
`pilot-e2e-vertrag-test.js` (Störfall/Idempotenz Ende-zu-Ende).

**Lücken, die 29A geschlossen hat:** fehlerhafte **Inhalte** am echten
Understanding-Pfad (leer/ungültig/falscher Typ/fehlende Pflichtfelder/nicht
verwertbarer Rückgabewert), die **Ende-zu-Ende-Wiederaufnahme** (Teilzustand →
Nachholpfad → keine Duplikate → Matching → Entscheidung → Lage), die
**Zustandsprüfliste** „kein Zustand gilt als Erfolg, nur weil keine Exception flog",
und **Mutationsnachweise** für zwölf Kerngarantien.

## 3 · 29A — Der deterministische Fehlervertrag

**Suite:** [`scripts/punkt29-fehlervertrag-test.js`](../../scripts/punkt29-fehlervertrag-test.js) — **79/79**,
deterministisch (drei Läufe identisch), **identisch mit und ohne**
Production-Secrets, 0 KI-Aufrufe, 0 Netz.

**Echte Produktionsfunktionen** (Testdoubles nur an äußeren Grenzen; gemeinsames
Gerüst `scripts/e2e-vertrag-geruest.js` wie 25A/26A/27A):
`cron-fairness.runTenantsFairly/planTenantOrder/claimPatch/finishPatch/entryOf` ·
`understanding.runUnderstandingShadow/runPendingUnderstandingShadow` (Budget,
Vormerk-Deadline, Ergebnisklassen, Telemetrie-Gruppen) · `dedup.toRawDocumentRow/
dedupeRawDocuments` · `ai.parseJsonText` · `google-news-hardening.createGoogleNewsGate/
evaluateCooldown/isRetryableGoogleError/isBreakerRelevantError/isGoogleNewsSource` ·
`crawl-run-state.classifyCrawlRunState/buildProviderBreakdown` ·
`source-telemetry.classifyCrawlError` · `matching.runMatchingShadow` mit echtem
`matching-audit` (Sperre, Fingerabdruck-Idempotenz, Publish) ·
`decisions.runDecisionShadow` · `lage.loadRankedVorgaenge/koToVorgangCard` ·
`ko-recovery.recoverFailedUnderstanding`.

Abdeckung je Fehlerklasse des Sprintauftrags (nur Neubau; Bestand in §7):

| Klasse | Suite-Abschnitt | Kernaussagen |
|---|---|---|
| **A Zeitüberschreitungen/harte Grenzen** | B (B1–B15) | Deadline vor Beginn → 0 begonnen, kein Versuchsvermerk, keine erfundene Obergrenze · Mandatsbudget → Rest kontrolliert vertagt, ceil(n/k) ehrlich · geworfener Mandatsfehler → Fehlerzähler, kein letzter Erfolg, gesunde Mandate laufen weiter · Understanding-Budget → Teilzustand, fertige Einheiten bleiben, Zurückgestellte als `pending` vorgemerkt+verknüpft, Telemetrie „erneut" statt „verarbeitet" · absolute Vormerk-Deadline → 0 Schreibvorgänge, ehrlich gezählt · Quellen-Timeout klassifiziert, nie retried |
| **B fehlerhafte Inhalte** | C (C1–C11) | leere Antwort/ungültiges JSON → throw → `skipped-error` + failed-Parkung + Skip-Log + begrenzter `errorCode` · falscher Typ/fehlende Pflichtfelder → `skipped-invalid` (Schema) · ein defekter Datensatz blockiert nicht (5 gesunde laufen durch) · defekter Inhalt erzeugt kein KO, erreicht weder Vektorsuche noch Entscheidung · keine Secrets/Volltexte im Fehlerzustand · unlesbarer Zeitstempel/Rieseninhalt/kaputte Kodierung → deterministisch, gedeckelt · widersprüchliche Metadaten → deterministisch mit Herkunftsnachweis · KI-Rückgabewert `null` → **Befund P29-2** (gepinnt) |
| **C Wiederholungen/Idempotenz** | D (D1–D9) | identische Eingabe zweimal → `duplicate`, 0 Schreibvorgänge, byte-identisch · neue Laufkennung + identischer Inhalt → idempotenter Audit-Treffer (`wiederholungen+1`, keine zweite Generation) · kein zweites sichtbares Ergebnis, Score/Begründung unverändert · vergebene Sperre → `matching-locked`, keine Laufzeile · `already running` → kein Erfolg/Fehler/Kapazität, Vermerk bleibt `laufend` und läuft kontrolliert ab · gescheiterte Aktualisierung → **Befund P29-3** (gepinnt) |
| **D Circuit Open/Schutzschaltungen** | E (E1–E13) | geschlossen → läuft · Schwelle → öffnet · unterbundene Aufrufe: kein Request, klassifizierbarer Grund (`circuit-open`), **nicht** als Erfolg und **nicht** als Quellenfehler gezählt (A-7-Zählvertrag: eigener Zähler, Laufzustand `aggregator-gedrosselt`) · echter Totalausfall bleibt `fehlgeschlagen` · Abkühlzeit + kontrollierte Probe (`evaluateCooldown`, Breaker-Gedächtnis) · mandanten-/quellenbezogene Trennung (Abstands-Schutz je Mandat; nur Google-Wege am Gate, direkte Wege frei) · Retry-Budget hart gedeckelt (keine Endlosschleife) |
| **E kein falsches Grün** | F (F1–F9) + quer | jeder Torzustand (`v3-store-disabled`, `ai-disabled`, `no-input`, `understanding-locked`, `matching-disabled`, `no-profile`, `matching-locked`, `skipped-budget`, `decision-error`) trägt seinen Grund und erhöht keinen Erfolgszähler · Budget-Skips im Skip-Log, Dokumente bleiben unverknüpft (= Nachholkandidat) · Publish-Abbruch nach fachlicher Verarbeitung → Lauf `fehlgeschlagen`, alte Generation bleibt aktuell, zählt nie als idempotenter Treffer · Lage wirft bei Store-Fehler statt „ruhiger Tag" · **Befund P29-1** (gepinnt) |
| **F kontrollierte Wiederaufnahme** | G (G1–G14) | Abbruch vor erstem Schreiben / nach Rohdokument / nach Wissensobjekt / nach Understanding / nach Matching / nach Entscheidung — jeweils Neustart ohne Duplikate (genau 1 KO je Vorgang, 1 aktuelle Matchingzeile je Vorgang, 1 Karte je Vorgang, deterministische Entscheidungs-IDs) · Nachholpfad findet den Cluster über die **Verknüpfung** · erneuter Fehler bei Wiederaufnahme → failed geparkt, kein Endlos-Retry · begrenzte Heilung (ko-recovery, Logik: failed→pending→complete, nach maxRetries terminal) · Fehlerzustand nach erfolgreicher Wiederaufnahme aufgelöst, Historie im Skip-Log · Mandantentrennung bei Wiederaufnahme (App-Guard + Audit-Guard `CROSS_TENANT_WRITE`) · ohne KI, ohne Secrets |

**Alle 15 Pflichtkonstellationen** des Sprintauftrags sind enthalten: gesunder
vollständiger Lauf (A3) · defekte Quelle unter gesunden (C3/C4) · Timeout Quelle
(B15 + Bestand `crawler-hardening`) · Timeout Mandat (B4) · harte globale Deadline
(B14) · geöffnete Schutzschaltung (E3/E4) · Sperre vergeben (D6/D7) · teilweise
gespeicherte Verarbeitung (B10–B12) · Wiederholung derselben Eingabe (D1/D3) ·
zweiter Mandant (G9) · defekter Inhalt (C3–C9) · Fehler nach fachlicher Verarbeitung
vor Abschlussmarkierung (F5–F7) · erfolgreiche Wiederaufnahme (G3–G8) · erneuter
Fehler bei Wiederaufnahme (G11–G12) · unabhängiger gesunder Pfad trotz Nachbarfehler
(B8, C4, E12).

## 4 · Mutationsnachweis

**Probe:** [`scripts/punkt29-mutationsprobe.js`](../../scripts/punkt29-mutationsprobe.js) — **12/12 rot**
(gemeinsames Gerüst `e2e-mutationsprobe-geruest.js`: vollständiger Abzug je Mutation,
Arbeitskopie unangetastet, eindeutige Anker, Referenzlauf grün). Jede Mutation baut
GENAU die vom Auftrag geforderte Lücke in die **Produktionsdatei** ein:

| # | Geforderte Lücke | Produktionsdatei / Rücknahme | rot |
|---|---|---|---|
| M1 | Timeout als Erfolg | `understanding.js` Budget-Abbruch entfernt | ✓ |
| M2 | `already running` als begonnen gezählt | `cron-fairness.js` Sperrverweigerungs-Sonderfall entfernt | ✓ |
| M3 | Erfolgszähler trotz Überspringen | `understanding.js` `skipped-budget` → Gruppe „verarbeitet" | ✓ |
| M4 | letzter Erfolg trotz Fehler | `cron-fairness.js` `finishPatch` setzt Erfolgszeitpunkt immer | ✓ |
| M5 | Fehlerfolge trotz Fehler zurückgesetzt | `cron-fairness.js` `fehlerSerie: 0` | ✓ |
| M6 | Circuit Open ignoriert | `google-news-hardening.js` Breaker öffnet nie | ✓ |
| M7 | defekter Inhalt in fachlicher Verarbeitung | `understanding.js` Schema-Validierung entfernt | ✓ |
| M8 | Mandantenfilter bei Wiederaufnahme entfernt | `matching-audit.js` Tenant-Guard entfernt | ✓ |
| M9 | Teilverarbeitung erzeugt Neustart-Duplikat | `understanding.js` KO-Identität `ko-<vorgangId>` destabilisiert | ✓ |
| M10 | Abbruchgrund verschluckt | `understanding.js` `errorCode` aus dem Ergebnis entfernt | ✓ |
| M11 | harte Deadline ignoriert | `understanding.js` Vormerk-Deadline entfernt | ✓ |
| M12 | gesunder Pfad unnötig mit abgebrochen | `understanding.js` Cluster-Fehlerisolation entfernt | ✓ |

## 5 · Befunde — echte Produktionsfehler (gefunden, NICHT behoben)

Nach der Befundregel des Sprints: deterministisch reproduziert
([`scripts/punkt29-befundproben.js`](../../scripts/punkt29-befundproben.js), der „rote
Regressionstest" — **erwartungsgemäß Exit 1, 4/4 rot**, bewusst NICHT im
Offline-Runner), das heutige Verhalten im Vertrag **gepinnt** (B9/C9/D9), **keine**
Korrektur in diesem Sprint (jede Korrektur verändert aktive Produktionslogik).

### P29-1 · Fairness verbucht zurückgegebene Fehler-/Timeout-Objekte als Erfolg

- **Ursache:** `lib/helmut/cron-fairness.js:535-537` — „Erfolg" ist definiert als
  „`perTenant` hat nicht geworfen"; einzige Ausnahme ist `already running`. Die
  Cron-Routen geben Timeouts aber als **Objekte** zurück (`server.js:840`
  `build-timeout`, `server.js:1066` `lage-check-timeout` → sogar als
  `status:'stable', bounded:true`, `server.js:842/1068` `push-timeout`).
- **Wirkung:** `finishPatch` schreibt `letzterErfolgAt`, `erfolge+1`,
  `fehlerSerie=0` — ein **erfundener letzter Erfolg** und eine **fälschlich
  zurückgesetzte Fehlerserie** in der Fairness-Buchführung (`wartend[]`,
  Systemfehler-Diagnose). Die **Rotation selbst bleibt korrekt** (sie sortiert
  bewusst nach Versuch, nicht Erfolg), und das Mandat zählt in die Kapazität `k`,
  wodurch die gemeldete Obergrenze ceil(n/k) zu optimistisch sein kann. Nicht in
  den dokumentierten Restlücken R-1…R-5 der [`../betrieb/cron-fairness.md`](../betrieb/cron-fairness.md) §8.
- **Produktionspfad:** alle Mehrmandanten-Crons über `runCronForTenants`.
- **Fix-Sprint (getrennt, freigabepflichtig):** `sperreVerweigert`-Muster auf eine
  allgemeine Ergebnisklassifikation erweitern (z. B. `ergebnis.ok === false` /
  `bounded === true` / `failed === true` → Fehler statt Erfolg) **plus** Entscheidung,
  ob `server.js:1066` einen Timeout weiter als `status:'stable'` maskieren darf.
  Risiko: gering (Buchführung, keine Fachlogik), aber Verhaltensänderung in
  `fehlerSerie`-Auswertungen. Rückweg: `git revert`. Abnahme:
  `punkt29-befundproben.js` P29-1 grün + `cron-fairness-test.js` grün + gepinnte
  Assertion B9 im Fehlervertrag umgestellt.

### P29-2 · KI-Rückgabewert `null` endet als cluster-error ohne failed-Parkung

- **Ursache:** `lib/helmut/ai.js` `parseJsonText("null")` liefert `null` **ohne
  throw** (gültiges JSON); `lib/helmut/understanding.js:839` ruft
  `assembleKnowledgeObject(aiResult…)` **außerhalb** des try/catch (818–834) auf —
  der Default `aiResult = {}` greift bei `null` nicht, es wirft ein TypeError.
- **Wirkung:** Der Cluster endet als `cluster-error` (`understanding.js:1142-1144`,
  eager sogar mit `vorgangId:null`) — **ohne** `markFailed`, **ohne** Skip-Log,
  Dokumente ohne Endzustand. Im Pending-Pfad (`understanding.js:1287`) bleibt das
  KO `pending` und wird **jeden Lauf erneut** versucht (unbegrenzter Retry, nur vom
  Tagesbudget gebremst — verletzt „kein unendlicher Wiederholungszyklus"). Sichtbar
  bleibt der Fall immerhin in Gruppe „fehlgeschlagen" der Lauftelemetrie.
- **Produktionspfad:** Understanding (eager, lage, pending) bei einem Modell, das
  literal `null` oder in `null` parsebaren Text liefert.
- **Fix-Sprint:** `parseJsonText`-Ergebnis `null`/Nicht-Objekt am Rückgabepunkt
  (ai.js) oder vor `assembleKnowledgeObject` (understanding.js) als
  `skipped-invalid`-Pfad behandeln (markFailed + logSkip). Risiko: gering, rein
  additiver Guard. Rückweg: `git revert`. Abnahme: P29-2 grün + gepinnte Assertion
  C9 umgestellt + `ai-json-parse-test.js`/`vorgangs-lebenszyklus-test.js` grün.

### P29-3 · Gescheiterte Aktualisierung wird beim Neustart zum „duplicate"

- **Ursache:** `lib/helmut/understanding.js:762-764` verknüpft die neuen Dokumente
  eines bestehenden Vorgangs **vor** dem KI-Call („nicht mehr verlierbar").
  Scheitert der Update-Call (`skipped-error`/`-invalid`/`-store`), sind beim
  nächsten identischen Lauf **alle Dokumente bekannt** → `duplicate` (Z.758-760).
  Der Code-Kommentar (Z.901-903) verweist auf Wiederholung „sobald erneut neue
  Dokumente eintreffen **oder der Nachholpfad sie aufgreift**" — Letzteres trifft
  nicht zu: der Nachholpfad holt nur `status='pending'`-KOs, der Bestand ist
  `complete`.
- **Wirkung:** die inhaltliche Aktualisierung unterbleibt **dauerhaft und
  unsichtbar** (falsches Grün auf Ergebnisklassen-Ebene: `duplicate` = Erfolgsklasse);
  Lage/Briefing zeigen den veralteten Stand. Dokumente gehen nicht verloren
  (bewusster Teil des Designs), aber die Wiederholung erscheint als Duplikat.
- **Produktionspfad:** Understanding-Update (`understandUpdate`) bei KI-/Store-Fehlern.
- **Fix-Sprint:** gescheiterte Updates wiederauffindbar machen (z. B. Update-Vormerkung
  analog `savePending`, oder `duplicate` nur bei nachweislich aktueller Fassung).
  Risiko: mittel (Kostenpfad — jeder Wiederholungsversuch ist ein KI-Call; Deckel
  nötig). Rückweg: `git revert`. Abnahme: P29-3 grün + gepinnte Assertion D9
  umgestellt + Kostenpfad-Nachweis (kein unbegrenzter Retry).

### P29-4 · Lesefehler kann ein fertiges Wissensobjekt auf `pending` zurücksetzen

- **Ursache:** `lib/helmut/storage.js:2344-2353` — `getKnowledgeObjectByVorgang`
  gibt bei **Lesefehler** `null` zurück (Fehler wird geschluckt);
  `savePendingKnowledgeObject` (Z.2961-2975) wertet `null` als „existiert nicht"
  und **upsertet** `status:'pending', understanding_status:'pending'` auf
  `ko-<vorgangId>`.
- **Wirkung:** ein transienter Lesefehler im Vormerkpfad kann ein **fertig
  verstandenes** Wissensobjekt auf `pending` zurückstufen — verletzt „bereits
  korrekt verarbeitete Arbeit darf nicht beschädigt werden" (Folge: erneuter
  KI-Lauf/Versionssprung, kein Datenverlust der Analysefelder, aber
  Zustandsregression + Kosten). Deterministisch reproduziert mit lokalem
  PostgREST-Stub (GET → 500, dann erfolgt der pending-POST).
- **Produktionspfad:** Vormerkung zurückgestellter Cluster (`runUnderstandingShadow`
  Vormerkpfad, `lazyUnderstanding`).
- **Fix-Sprint:** Existenz-Check fail-closed machen (Lesefehler → kein Schreiben,
  `skipped, reason:'existenz-unbekannt'`), analog Schranke 1 der
  Cron-Fairness-Ablage. Risiko: gering (im Fehlerfall wird nur die Vormerkung
  vertagt — exakt das heutige Verhalten bei Schreibfehlern). Rückweg: `git revert`.
  Abnahme: P29-4 grün.

## 5a · Beobachtungen (dokumentiert, bewusst keine Befunde dieses Sprints)

Bekannte, teils dokumentierte oder durch vorhandene Schutzschichten abgefederte
Schwächen — benannt, damit sie nicht als „geprüft und gut" gelten:

- **B29-1** `matching.js:679` + `storage.js:2700-2703`: ein harter DB-Fehler der
  Vektorsuche wird zu `{skipped, reason:'v3-store-error'}`; der Scheduler
  protokolliert nur **geworfene** Fehler (`scheduler.js:412-419`) — ein
  DB-Ausfall im Matching erscheint als stiller Skip. Kein Datenschaden (keine
  Laufzeile, alte Generation bleibt), aber stiller Ausfall. Gleiches Muster:
  `decisions.js:169-171` (catch-all → Skip; im Vertrag als F8 gepinnt).
- **B29-2** `crawler.js:67+184`: eine 200-Antwort mit unparsebarem Body wird
  `'empty'` (= Erfolg) — von einem ruhigen Tag nicht unterscheidbar. Abgefedert
  durch die abgeleitete Störungsklasse „leer"/„veraltet"
  (`source-failure.js`, ab 3 Leerläufen; getrennte `letzteLieferungAt`-Wahrheit).
- **B29-3** `dip.js:110-129`: DIP-Abruf ohne Timeout; HTTP-Fehler mitten in der
  Pagination liefert das Teilergebnis als Normalergebnis, ohne Zähler/Telemetrie.
- **B29-4** Blob-Lock-Backend (Default): fail-open bei Store-Fehler, nicht-atomarer
  RMW, Release ohne Token (`storage.js:1647-1689`). Der atomare, fail-closed-Modus
  existiert (`HELMUT_ATOMIC_LOCK`, `pipeline-lock-atomic-test.js`), ist aber
  flag-gated; der Understanding-Lock ist ohne `HELMUT_UNDERSTANDING_LOCK` ein No-Op.
- **B29-5** `storage.js:4361-4388`: `saveCrawlRun` hat kein runId-Dedup und der
  relationale Spiegel schluckt Fehler (`.catch(() => {})`) — eine Wiederholung
  desselben Laufs dupliziert Einträge (W-2-Muster, bei `process_runs` behoben).
- **B29-6** `storage.js:623-631`: `finding_count`-Inkrement ist Lese-dann-PATCH —
  bei Batch-Wiederholung nach Teilschreiben nicht idempotent (die
  `document_findings`-Zeilen selbst bleiben dedupliziert).
- **B29-7** `ai.js:596-597`: `success:true` wird beim HTTP-200 geloggt, **bevor**
  `parseJsonText` den Modelltext prüft — Kostenlog kann Erfolg zeigen, wo die
  Pipeline `skipped-error` zählt.
- **B29-8** `ko-recovery.js:65`: ein `writeRetries`-Fehler verliert den
  Retry-Zähler — ein failed-Vorgang kann öfter als `maxRetries` versucht werden
  (Pfad in Production ohnehin Default AUS).

## 6 · 29B — Production-Nachweis (offen, getrennter Folgeauftrag)

**Was genau noch fehlt** (rein lesend, an **regulären** Läufen, kein manueller
Lauf, kein Trigger, keine künstlichen Fehler):

1. **Fairness/Timeout-Verhalten:** über mehrere reguläre Läufe (aktive Cron-Termine
   laut `vercel.json`: `pipeline` 16:00 UTC, `crawl` 20:00/04:00 UTC) die
   `[cron/*/fairness]`-Zeilen bzw. den Fairness-Zustand lesen: alle aktiven Mandate
   werden erreicht, `zeitbudget`-Skips erscheinen ohne Versuchsvermerk, kein Mandat
   verhungert (deckt sich mit R-4 der OP-25-Doku, wird für Punkt 29 aber getrennt
   bewertet).
2. **Sperren:** mindestens ein natürlich auftretender `already running`- bzw.
   Lock-Skip-Fall bleibt ohne Erfolgs-/Fehlerbuchung sichtbar (Fairness-Feld
   `lockVerweigert` bzw. Log).
3. **Schutzschaltung/A-7:** die nächste natürlich auftretende Drossel-Episode
   erscheint als `aggregator-gedrosselt`/`circuitOpenSources` — **nicht** als
   N Quellenfehler (`crawl_runs.runState`, `source_crawl_telemetry` mit
   `error_code='circuit-open'`).
4. **Fehlerhafte Inhalte/Störungen:** `source_crawl_telemetry`-Fehlklassen der
   letzten Läufe stimmen mit der Klassifikation überein; `process_runs` enthält
   ehrliche `blocked`/`failed`-Zeilen (kein Pauschal-`success`).
5. **Wiederholung/Idempotenz:** eine natürlich auftretende Matching-Wiederholung
   zeigt `wiederholungen+1` ohne neue Generation; 0 `matching_results`-Zeilen auf
   unvollständigen Läufen (Bestandsnachweis existiert vom 2026-07-29, für 29B auf
   dem dann aktuellen Stand wiederholen).
6. **Falsches Grün ausschließen:** kein Lauf, der Fehler enthielt, erscheint in
   Telemetrie/Zählern als makelloser Erfolg — mit der Einschränkung aus **P29-1**
   (bis zum Fix ist die Fairness-Erfolgsbuchung bei zurückgegebenen
   Timeout-Objekten nachweislich falsch; 29B kann diesen Teil erst nach dem
   Fix-Sprint grün messen).

**Ehrliche Grenze** (wie [`../betrieb/quellenstoerungen.md`](../betrieb/quellenstoerungen.md) §10):
Fehlerklassen ohne natürliches Vorkommen im Messfenster bleiben test-belegt; sie
werden benannt, nicht behauptet.

## 7 · Bestandsprüfung — wiederverwendete Belege

Für jede Fehlerklasse wurden die vorhandenen Suiten geprüft (Testdatei → geprüfte
Produktionsfunktion → Klasse → warum als Beleg belastbar → Mutationsnachweis).
**Nicht dupliziert** — der neue Vertrag ergänzt nur Lücken:

| Testdatei | Produktionsfunktion (echter Import) | Klassen | Warum belastbar | Mutation |
|---|---|---|---|---|
| `cron-fairness-test.js` | `cron-fairness.js` komplett (injizierte Uhr/Ablage) | A,C,E,F | Deadline/Rotation/Abbruch/Ablage-Race verhaltensbelegt | **eingebaut, 10/10** |
| `pipeline-lock-atomic-test.js` | `storage.acquire/releasePipelineLock` (RPC-Replik) | C,D,F | atomarer Erwerb, fail-closed, TTL, Token-Release | nein |
| `pipeline-zeitbudget-test.js` | `understanding.runUnderstandingShadow` (Budget/Deadline) | A,E,F | Budget-/Deadline-Loop an echter Funktion (HTTP-Rand nur Grep) | über 29A: M1/M11 |
| `pipeline-error-collector-test.js` | `storage.recordPipelineError` (Roundtrip) | C,E | Klassifikation, Dedup, PII-frei | nein |
| `source-failure-test.js` | `source-failure.js` (Klassifikation) | A,B,D,E,F | 26 Fälle, `gedrosselt` ≠ Quellendefekt, Erholung braucht Lieferung | Gegenprobe (Schwelle) |
| `google-news-hardening-test.js` | Gate/Retry/Cooldown | A,C,D,E,F | Breaker-Schwelle/Memory/Cooldown unit-belegt | über 29A: M6 |
| `crawler-hardening-test.js` | `crawlAllSources` (echtes lokales HTTP) | A,C,D,E,F | Timeout/429/Breaker/Cooldown am echten Crawlpfad gemessen | nein |
| `incident-crawl-amplifikation-test.js` | `crawlAllSources` + run-state + health | A,C,D,E,F | Incident-Zahlen 144/3/11/130 → `aggregator-gedrosselt`; Gegenproben mit Alt-Zählern | Gegenproben |
| `blob-retry-test.js` | `storage.withStoreRetry` | A,C,E | begrenzter Retry, klassifiziert, sichtbar scheiternd | nein |
| `ai-json-parse-test.js` | `ai.parseJsonText` | B,E | echter Production-Fall (rohe Steuerzeichen), ehrliches Scheitern | nein |
| `understanding-recovery-test.js` | `understanding-recovery.js` | B,C,E | beweist die kontrollierte **Stilllegung** des gefährlichen Pfads | nein |
| `ko-recovery-test.js` | `ko-recovery.recoverFailedUnderstanding` | C,E,F | bounded Retry → terminal, Default AUS | nein |
| `pending-terminal-test.js` | `pending-terminal.js` + `understandOneCluster` | C,E,F | idempotent, konditionales PATCH, „nie wieder"-Garantie | nein |
| `matching-audit-test.js` | `runMatchingShadow` + Audit (DB-Replik) | C,E,F | Idempotenz, Publish-Fehler sichtbar, `laufend`/`fehlgeschlagen` nie idempotenter Treffer | nein |
| `stoerungswahrheit-test.js` | `lage.buildLageBriefing`, Push, Client (vm) | E | Störung ≠ ruhiger Tag über Backend/Push/Client | nein |
| `prozesslauf-telemetrie-test.js` | `storage.recordProcessRun*` | C,E,F | W-2-Verlust deterministisch reproduziert, Exit-7-Vertrag | Gegenprobe (Last-Write-Wins) |
| `werkzeug-lesefehler-test.js` | `storage.list*` + CLI (Stub-HTTP) | A,B,D,E | Lesefehler wird geworfen statt `[]`, Exit-Matrix | nein |
| `llm-budget-test.js` / `llm-reservation-test.js` / `kosten-limits-test.js` | Budget-Gate + Choke-Point | A,C,D,E | Race exakt (5/5 bei Limit 5), fail-closed-Limitparsing, ehrlicher fail-open-Grund | nein |
| `pilot-e2e-vertrag-test.js` (25A) | ganze Kette | B,C,E,F | Störfall (KI-Fehler → failed, Publish-Abbruch), Idempotenz beider Stufen | `pilot-e2e-mutationsprobe.js` 10/10 |
| `quality-watchdog-test.js` | quality-watchdog | E | „unbekannt statt grün", keine erfundenen Kennzahlen | Gegenprobe (leere Eingaben) |

Bekannte Grenzen der Bestandsbelege (bleiben offen benannt, kein 29A-Gegenstand):
das äußere HTTP-`withTimeout` der Cron-Routen ist nur per Quelltext-Grep belegt;
mehrere DB-Semantiken (Locks, Reservierung, Audit-Trigger) sind treue In-Memory-
Repliken mit separaten Production-Beweisläufen; das Breaker-Gedächtnis über
Prozessgrenzen ist nur per Options-Injektion belegt.

## 8 · Sicherheitsgrenzen, Datenschutz, unveränderte Bereiche

**Keine Zeile Produktionscode geändert** (`lib/`, `server.js`, `client.js`,
Migrationen, Seeds, `vercel.json`, `helmut-flags.json` unverändert — nur neue
Dateien unter `scripts/` und `docs/`). Kein Production-Schreibzugriff, keine
Migration, kein Backfill, kein manueller Lauf, 0 KI-Aufrufe / 0,00 USD, keine
Env-/Flag-/Cron-/Lock-/Budget-/Quellen-Änderung, Berlin/Brandenburg/M8 unverändert
AUS, keine neuen Mandate, keine Production-Daten im Repository (Fixtures künstlich,
`.example`-Domänen, Testprofile aus `scripts/fixtures/test-profiles.js`).
Fehlerzustände der Tests enthalten keine Volltexte/Secrets (eigene Assertion C6).

## 9 · Testergebnisse (real ermittelt, 2026-07-30)

| Lauf | Ergebnis |
|---|---|
| Neuer Fehlervertrag `punkt29-fehlervertrag-test.js` | **79/79**, deterministisch (3 Läufe), identisch mit/ohne Secrets |
| Neue Mutationsprobe `punkt29-mutationsprobe.js` | **12/12 rot** |
| Neue Befundproben `punkt29-befundproben.js` | **4/4 rot** (erwartungsgemäß — Befunde bestehen), Exit 1 |
| Offline-Suite ohne Production-Secrets (maßgeblich, bildet CI nach) | **185/189** — Basislinie `origin/main` `75d7286`: **184/188**, Fehlschlagliste **byte-identisch** (privacy-vollstaendigkeit, profile-db, provision-tenant, tenant-neutrality — umgebungsbedingt, im CI grün); die +1 ist die neue Suite |
| Pilot-Mutationsprobe (25A) | **10/10 rot** (unverändert) |
| Berlin-Mutationsprobe | **10/10 rot** (unverändert) |
| Brandenburg-Mutationsprobe | **17/17 rot** (unverändert) |
| Browser-/Mobile-Smoke | **32/32** |

Einzelsuiten des Bestands (alle im Offline-Lauf enthalten und grün): cron-fairness ·
pipeline-lock-atomic · pipeline-zeitbudget · pipeline-error-collector ·
source-failure · google-news-hardening · crawler-hardening ·
incident-crawl-amplifikation · blob-retry · ai-json-parse · understanding-recovery ·
ko-recovery · pending-terminal · matching-audit · stoerungswahrheit ·
prozesslauf-telemetrie · werkzeug-lesefehler · llm-budget · llm-reservation ·
kosten-limits · mandantentrennung · tenant-guard · cross-tenant-security · lage ·
drei-profile-e2e · pilot-/berlin-/brandenburg-e2e-vertrag · matching-relevanz-gate (M8).

## 10 · Verhältnis zu anderen Punkten

- **Punkt 25:** bleibt teilweise abgeschlossen (25B wartet auf den ersten regulären
  Production-Lauf). Dieser Sprint hat **nichts** an Läufen, Cron, Quellen, Locks,
  Budgets oder Env geändert und beeinflusst 25B nicht.
- **Punkt 27:** bleibt ⏳ (27B durch Punkt 15 blockiert). Unberührt.
- **OP-25 (Cron-Fairness):** getrennt und unverändert; ihr Production-Nachweis
  (R-4) bleibt offen. Befund P29-1 betrifft die Fairness-**Buchführung**, nicht die
  Rotation.
- **OP-15 / Befund A-7:** der Zählvertrag (circuit-open ≠ Quellenfehler) ist in 29A
  verankert (E6–E8); die strukturelle Google-Abhängigkeit bleibt OP-15.
- **M8:** unverändert AUS; der Vertrag beweist das (A1) und aktiviert nichts.
- **Punkt 30:** bleibt blockiert (erst nach 1–29).

## 11 · Status und nächster Schritt

**Punkt 29: ⏳ teilweise** — 29A erfüllt (79/79 + 12/12 Mutationen + Bestand),
29B (rein lesender Production-Nachweis, §6) offen; zusätzlich stehen die
Fix-Sprints zu P29-1…P29-4 aus (eigene, freigabepflichtige Aufträge — ein Punkt
über „kontrolliert funktionierende Fehlerpfade" kann nicht vollständig grün sein,
solange vier belegte Fehlerpfad-Befunde offen sind).

**Nächster Schritt:** Merge-Entscheidung über den 29A-PR (nur Tests + Doku, keine
Produktionswirkung) — **nicht vor Abschluss von 25B mergen** (Betreibervorgabe:
der wartende 25B-Nachweis hat Vorrang; dieser PR ändert zwar keine Läufe, aber die
Dokumentationsdateien überschneiden sich). Danach: Betreiberentscheidung über die
Reihenfolge der Fix-Sprints (Empfehlung: P29-2 und P29-4 zuerst — kleinste
Eingriffe, klarste Wirkung), dann 29B nach §6.
