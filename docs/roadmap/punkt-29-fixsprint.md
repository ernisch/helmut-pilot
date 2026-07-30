# Punkt 29 — Fix-Sprint: Fehlerpfade schließen (P29-1…P29-4)

**Stand:** 2026-07-30 · **Kanonisch für:** die Behebung der vier in Punkt 29A
deterministisch belegten Produktionsfehler · **Befunddoku (kanonisch, auf dem
29A-Branch / PR #187):** `docs/roadmap/punkt-29-fehlervertrag.md` §5 ·
**Code/Tests dieses Sprints:**
[`scripts/punkt29-fixpfade-test.js`](../../scripts/punkt29-fixpfade-test.js) (Regressionsvertrag, im Offline-Runner),
[`scripts/punkt29-fix-mutationsprobe.js`](../../scripts/punkt29-fix-mutationsprobe.js) (7 Mutationen)

---

## 1 · Auftrag und Schnitt

Getrennter **Fix-Sprint** nach der Befundregel von Punkt 29A: die vier Befunde
P29-1…P29-4 waren dort deterministisch belegt und im Fehlervertrag **gepinnt**
(B9/C9/D9), aber bewusst **nicht** behoben. Dieser Sprint ändert erstmals die
aktive Produktionslogik — eng begrenzt, testgetrieben, rückbaubar, ohne jede
Production-Maßnahme. Vorgehen je Befund: erneut reproduziert (rot auf
`main` = `75d7286`) → roter Regressionstest → kleinste sichere Korrektur →
Regressionstest grün → Mutation, die die Schutzbedingung verletzt und rot wird.

**Startprüfung (belegt):** Arbeitsbaum sauber · Ausgangspunkt `origin/main`
`75d7286` · offene PRs gesichtet · PR #187 offen und nicht gemergt · 25B offen
und unberührt · OP-25 getrennt · Punkt 27 unberührt · Berlin/Brandenburg/M8
deaktiviert. Die 29A-Befundproben aus PR #187 wurden **rein lesend** übernommen
und auf dem Ausgangscode ausgeführt: **0 von 4 behoben, Exit 1** (alle vier
Befunde bestehen auf `main`).

## 2 · Die vier Befunde und ihre Fixes

### P29-1 · Zurückgegebenes Timeout-Objekt wurde als Fairness-Erfolg gebucht

- **Ursache:** `cron-fairness.js` definierte „Erfolg" als „`perTenant` hat nicht
  geworfen" (einzige Ausnahme: `already running`). Die Cron-Routen geben
  Timeouts aber als **Objekte** zurück (`build-timeout`, `push-timeout`, der in
  der lage-check-Route sogar als `status:'stable'` maskierte
  `lage-check-timeout`).
- **Auswirkung:** erfundener `letzterErfolgAt`, `erfolge+1`, fälschlich
  zurückgesetzte `fehlerSerie` — falsches Grün in der Fairness-Buchführung und
  der Systemfehler-Diagnose. (Rotation selbst war korrekt, sie sortiert nach
  Versuch.)
- **Fix (2 Stellen):**
  1. `lib/helmut/cron-fairness.js`: neue exportierte Klassifikation
     `ergebnisFehlgeschlagen(ergebnis)` — ein zurückgegebenes Objekt mit
     `ok === false` / `bounded === true` / `failed === true` wird im Abschluss
     **wie ein geworfener Fehler gebucht** (`STATUS_FEHLER`, `fehler+1`,
     `fehlerSerie+1`, kein Erfolgsstempel). **Skip-Vorrang:** `skipped === true`
     ist NIE ein Fehler (auch mit `ok:false`, z. B. „Push nicht konfiguriert") —
     ein ehrlicher Skip bleibt von einem Fehler klar unterscheidbar. Das
     Ergebnisobjekt bleibt in `results` erhalten (`failed: true` ergänzt), der
     Verlauf trägt `ergebnisFehler: true`.
  2. `server.js` (morning-briefing, lage-check): die inneren Timeout-Befunde
     (`build-timeout`, `lage-check-timeout`, `push-timeout`) werden in die
     Mandatsantwort **gehoben** (`ok:false, bounded:true, reason`), damit die
     Buchführung sie sehen kann. Entscheidung zur Maskierung: `status:'stable'`
     bleibt für die **Push-Logik** erhalten (kein Push auf unbekannter Lage),
     maskiert aber nicht mehr die Erfolgsbuchung.
- **Regressionstest:** Suite Abschnitt A (A0–A12): Buchung, Skip-Vorrang,
  Fehlerserien-Kontinuität (geworfen + Objekt in derselben Serie), Gegenproben
  (echter Erfolg, Nicht-Objekt, Sperre), Routen-Quelltextvertrag.
- **Mutationen:** M1 (Klassifikation abgeklemmt) · M2 (Skip-Vorrang entfernt) ·
  M3 (Routen-Anhebung entfernt) — alle rot.
- **Risiko:** gering (Buchführung, keine Fachlogik). Verhaltensänderung: in
  `fehlerSerie`-Auswertungen erscheinen Timeouts jetzt ehrlich als Fehler; die
  Morning-Telemetrie kann bei komplettem Timeout-Ausfall jetzt ehrlich `failed`
  melden. Andere `perTenant`-Aufrufer (crawl/pipeline via `runSourceCrawl`)
  geben nie Fehlerformen zurück (geprüft) — keine falschen Positiven.
- **Rückweg:** `git revert` des Commits; kein Datenformat geändert.
- **Offene Production-Nachweisfrage (29B §6.1/6.6):** ein natürlich
  auftretender Cron-Timeout erscheint in der Fairness-Ablage als Fehler
  (`fehlerSerie > 0`), nicht als Erfolg.

### P29-2 · KI-Rückgabewert `null` endete als `cluster-error` ohne Parkung

- **Ursache:** `ai.parseJsonText("null")` liefert `null` **ohne throw**
  (gültiges JSON); `understanding.js` rief `assembleKnowledgeObject(aiResult…)`
  **außerhalb** des try/catch auf → TypeError → anonymer `cluster-error` ohne
  `markFailed`, ohne Skip-Log; im Pending-Pfad wurde das KO **jeden Lauf
  erneut** versucht (unbegrenzter Retry, nur vom Tagesbudget gebremst).
- **Auswirkung:** Dokumente ohne Endzustand, potenzieller Rückstau, unnötige
  KI-Kosten.
- **Fix:** Guard in `understandOneCluster` **und** `understandUpdate`
  (`lib/helmut/understanding.js`): ein nicht verwertbarer Rückgabewert
  (`null`/kein Objekt/Array) wird wie eine schema-ungültige Antwort behandelt —
  Erstverstehen: `markFailed` + `logSkip("skipped-understanding-invalid")` +
  `skipped-invalid` (geparkt, verknüpft, Gruppe „fehlgeschlagen", kein erneuter
  automatischer Versuch); Aktualisierung: Bestand bleibt unangetastet,
  `skipped-invalid` + Update-Vormerkung (→ P29-3). Keine echten KI-Aufrufe im
  Sprint (Fixture-Ersatz).
- **Regressionstest:** Suite Abschnitt B (B1–B8): null/String/Array/Zahl,
  Parkung + Verknüpfung + Telemetrie, Nachbar-Cluster unbeeinflusst, **kein
  weiterer KI-Versuch bei Wiederholung** (B5), Update-Variante (B7/B8).
- **Mutation:** M4 (Guard entfernt) — rot.
- **Risiko:** gering, rein additiver Guard vor einer bislang werfenden Stelle.
- **Rückweg:** `git revert`.
- **Offene Production-Nachweisfrage:** kein `cluster-error` mit
  `vorgangId:null` in der Lauftelemetrie regulärer Läufe; `skipped-invalid`
  erscheint mit failed-Parkung.

### P29-3 · Gescheiterte Aktualisierung wurde beim Neustart zum „duplicate"

- **Ursache:** die Aktualisierung verknüpft neue Dokumente bewusst **vor** dem
  KI-Call („nicht mehr verlierbar"). Scheiterte der Update-Call, waren beim
  nächsten identischen Lauf alle Dokumente bekannt → `duplicate` (Erfolgsklasse)
  — der zweite Update-Versuch fand **nie** statt; der Nachholpfad greift nur
  `status='pending'`, der Bestand ist `complete`.
- **Auswirkung:** die inhaltliche Aktualisierung unterblieb dauerhaft und
  unsichtbar; Lage/Briefing zeigten den veralteten Stand.
- **Fix (Variante „Update-Vormerkung", wie in der Befunddoku vorgeschlagen):**
  jede **nicht erfolgreiche** Aktualisierung wird vorgemerkt
  (`vorgangId → Zahl der Fehlversuche`; Ablage im kleinen Auth-Store nach dem
  P1-4-Muster `understandingRetries`, **keine Schema-Migration**; neue
  Storage-Primitiven `getUpdateRetries`/`saveUpdateRetries`). Der
  duplicate-Zweig prüft die Vormerkung: „duplicate" gilt nur für eine
  **nachweislich vollständig verarbeitete** Fassung; sonst begrenzte
  Wiederaufnahme über denselben `understandUpdate`-Pfad (Ergebnis trägt
  `wiederaufnahme: true`). **Kostendeckel:** Fehlversuche (KI-/Schema-/
  Store-Fehler) zählen; nach `UPDATE_WIEDERAUFNAHME_MAX = 3` endet der Vorgang
  sichtbar als `skipped-update-final` (neue Ergebnisklasse, Gruppe
  „fehlgeschlagen", **kein weiterer KI-Call**). Budget-Vertagung
  (`skipped-budget`) öffnet die Vormerkung, zählt aber **nicht** als
  Fehlversuch. Ein Erfolg (`updated`) löst die Vormerkung auf; echte **neue**
  Dokumente heilen auch einen erschöpften Vorgang über den normalen Update-Pfad.
  Ohne die neuen Deps (Alt-Aufrufer) bleibt das Verhalten byte-identisch zum
  Bestand. Testgerüst `e2e-vertrag-geruest.js` additiv um die Auth-Store-Replik
  erweitert.
- **Regressionstest:** Suite Abschnitt C (C1–C10): zweiter Versuch beim
  identischen Neustart, ehrliches Nachbar-Duplikat, Heilung + Vormerkungs-
  Auflösung, genau 1 KO je Vorgang (keine fachlichen Duplikate), Deckel (3
  Fehlversuche → `skipped-update-final`, 0 weitere KI-Calls), Budget-Vertagung
  ohne Deckelverbrauch, Bestandsverhalten ohne Vormerkung byte-identisch.
- **Mutationen:** M5 (Wiederaufnahme abgeklemmt) · M6 (Deckel entfernt) — rot.
- **Risiko:** mittel (Kostenpfad) — durch den Deckel begrenzt: höchstens 3
  KI-kostende Fehlversuche je Vorgang und Vormerkungszyklus, danach 0. Die
  Vormerkungs-Ablage ist fail-safe (Lese-/Schreibfehler ⇒ Verhalten wie vor dem
  Fix, nie Laufabbruch) und bounded (letzte 1000 Einträge).
- **Rückweg:** `git revert`; der Auth-Store-Schlüssel `updateRetries` ist
  additiv und kann folgenlos liegen bleiben oder geleert werden.
- **Offene Production-Nachweisfrage:** nach einem natürlich auftretenden
  Update-Fehler zeigt der Folgelauf `wiederaufnahme`/`updated` statt
  `duplicate`; `ko_version` erhöht sich genau einmal.

### P29-4 · Lesefehler konnte ein fertiges Wissensobjekt auf `pending` zurückstufen

- **Ursache:** `storage.getKnowledgeObjectByVorgang` gab bei **Lesefehler**
  `null` zurück (verschluckt); `savePendingKnowledgeObject` wertete `null` als
  „existiert nicht" und **upsertete** `status:'pending',
  understanding_status:'pending'` auf `ko-<vorgangId>`.
- **Auswirkung:** ein transienter Lesefehler im Vormerkpfad konnte ein fertig
  verstandenes KO zurückstufen (Zustandsregression, erneuter KI-Lauf/
  Versionssprung).
- **Fix:** Existenz-Check **fail-closed** (`lib/helmut/storage.js`):
  `getKnowledgeObjectByVorgang` erhält die Option `{ throwOnError: true }`
  (Default unverändert für alle Bestandsaufrufer); `savePendingKnowledgeObject`
  nutzt sie und beantwortet einen Lesefehler mit
  `{ skipped: true, reason: "existenz-unbekannt" }` — **kein Schreibvorgang**,
  die Vormerkung wird nur vertagt (exakt das etablierte Verhalten bei
  Schreibfehlern), der Fehler bleibt als Protokollzeile sichtbar.
- **Regressionstest:** Suite Abschnitt D (D1–D3, frisches `storage.js` im
  Kindprozess gegen lokalen PostgREST-Stub): Lesefehler ⇒ 0 Schreibvorgänge +
  sichtbare Protokollzeile; Gegenproben: bewiesene Abwesenheit schreibt
  weiterhin, vorhandenes KO bleibt unangetastet (`exists`).
- **Mutation:** M7 (`throwOnError` entfernt) — rot.
- **Risiko:** gering — im Fehlerfall wird nur die Vormerkung vertagt.
- **Rückweg:** `git revert`.
- **Offene Production-Nachweisfrage:** kein `complete`-KO fällt in regulären
  Läufen auf `pending` zurück; `existenz-unbekannt` erscheint höchstens als
  vertagte Vormerkung.

## 3 · Wechselwirkungen der Fixes untereinander und mit Bestandsverträgen

- P29-2 (Update-Variante) **nutzt** die P29-3-Vormerkung (B7/B8) — konsistent,
  kein Konflikt. P29-4 betrifft nur den Vormerk-**Schreibpfad**; P29-3 legt
  seine Vormerkungen im Auth-Store ab, nicht in `knowledge_objects` — getrennt.
  P29-1 ist reine Buchführung außerhalb des Understanding-Pfads.
- Bestandsverträge nach dem Fix **grün** (real ausgeführt): cron-fairness ·
  vorgangs-lebenszyklus 81/81 (inkl. struktureller Vollständigkeit der neuen
  Ergebnisklasse) · matching-audit 178/178 · ai-json-parse 13/13 · ko-recovery
  12/12 · pending-terminal 63 · pipeline-zeitbudget · Pilot-E2E **96/96** ·
  Berlin **76/76** · Brandenburg **98/98** (Gerüst-Erweiterung additiv,
  Verträge unverändert grün).

## 4 · Testergebnisse (real ermittelt, 2026-07-30)

| Lauf | Ergebnis |
|---|---|
| 29A-Befundproben (PR #187, rein lesend übernommen) auf `main` `75d7286` | **0/4 behoben, Exit 1** (Reproduktion) |
| Neue Regressionssuite `punkt29-fixpfade-test.js` auf `main`-Code | **24 FAIL / 16 PASS** (rot — Befundstand; die 16 PASS sind die Gegenproben des Bestandsverhaltens) |
| Neue Regressionssuite nach den Fixes | **40/40** |
| 29A-Befundproben nach den Fixes | **3/4 behoben** — P29-1/-2/-4 grün; P29-3 bleibt dort formal rot wegen einer überstrengen Erwartung der Probe, siehe §5 |
| Mutationsprobe `punkt29-fix-mutationsprobe.js` | **7/7 rot erkannt** (Referenzlauf grün) |
| Offline-Suite ohne Production-Secrets (maßgeblich, bildet CI nach) | **189/189** — Basislinie `origin/main` `75d7286` im getrennten Worktree, identische Umgebung: **188/188**; Fehlschlagliste **byte-identisch (beide leer)** — die in 25A/29A dokumentierten 4 umgebungsbedingten Fehlschläge treten in dieser Cloud-Umgebung nicht auf; die +1 ist die neue Suite |
| Browser-/Mobile-Smoke | **32/32** |
| CI auf PR #188 (Head `20eb13b`, Run 30564617564) | **vollständig grün** — Pflicht-Checks „Syntax + Offline-Suiten" ✅ und „Browser-/Mobile-Smoke (Chromium)" ✅ (2026-07-30 17:09 UTC) |

## 5 · Abweichung zur 29A-Befundprobe P29-3 (Integrationshinweis für PR #187)

Die SOLL-Erwartung der 29A-Befundprobe P29-3 verlangt im zweiten Lauf
`duplicate === 0` **über alle Cluster**. Das ist unerfüllbar streng: die
Probe-Fixture enthält einen zweiten, **unveränderten** Cluster
(„Havariebericht"), der auch nach einem korrekten Fix ehrlich ein Duplikat
bleibt (jede andere Klassifikation wäre falsch oder ein unnötiger KI-Call).
Mit den Fixes zeigt die Probe real: `Versuche: 2` (der geforderte zweite
Update-Versuch findet statt) und `zweiter Lauf: { duplicate: 1, skipped-error: 1 }`
— das Duplikat ist der unberührte Nachbar. **Beim Merge von PR #187 nach diesem
Fix-PR müssen dort angepasst werden:** (a) die P29-3-Erwartung der Befundprobe
(nur der gescheiterte Vorgang darf nicht `duplicate` sein), (b) die gepinnten
Assertions **B9/C9/D9** des Fehlervertrags (sie pinnen das alte Fehlverhalten
und werden nach den Fixes rot — gewollt, der Fix ist sichtbar). Die
Merge-Reihenfolge ist vom Betreiber vorgegeben: **PR #187 nicht vor 25B**;
dieser Fix-PR ist unabhängig davon mergefähig.

## 6 · Sicherheitsgrenzen (eingehalten)

Keine Production-Zugriffe (auch nicht lesend) · keine Migration · kein
Backfill · keine Datenkorrektur · kein manueller Crawl-/Pipeline-/
Understanding-/Matchinglauf · 0 echte KI-Aufrufe / 0,00 USD · keine Secrets-,
Env-, Cron-, Lock-, Budget- oder Quellenänderung · Berlin/Brandenburg/M8
unverändert AUS · keine neuen Mandate · keine Production-Daten im Repository
(Fixtures künstlich, `.example`-Domänen) · kein Merge.

## 7 · Status und nächster Schritt

**Punkt 29 bleibt ⏳ teilweise:** 29A erfüllt (PR #187, offen), die vier
Fix-Sprints P29-1…P29-4 sind mit **PR #188** (dieser Fix-PR, Branch
`claude/p29-fehlerpfade-schliessen-wpxb1h`) **gebaut und offline belegt**;
**29B bleibt offen**, bis nach Merge + Deployment natürliche reguläre
Production-Läufe rein lesend geprüft wurden (Fragenkatalog: §2 je Befund +
29A-Doku §6). **Nächster Schritt:** Betreiberentscheidung über den Merge dieses
Fix-PRs (unabhängig von 25B/PR #187 mergefähig; empfohlen VOR PR #187, dann
dort B9/C9/D9 + Befundprobe P29-3 anpassen — §5), danach 29B rein lesend.
