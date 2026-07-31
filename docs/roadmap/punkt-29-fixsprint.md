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
| 29A-Befundproben nach den Fixes (erster Stand) | **3/4 behoben** — P29-3 formal rot wegen der überstrengen Probenerwartung, seit §5a korrigiert |
| Mutationsprobe `punkt29-fix-mutationsprobe.js` | **7/7 rot erkannt** (Referenzlauf grün) |
| Browser-/Mobile-Smoke | **32/32** |
| CI auf PR #188 (Head `20eb13b`, Run 30564617564) | **vollständig grün** — beide Pflicht-Checks ✅ (2026-07-30 17:09 UTC) |

**Nach der Integration in den 29A-Vertrag (2026-07-31, Rebase auf `main` `cb10d76`) neu gemessen:**

| Lauf | Ergebnis |
|---|---|
| 29A-Fehlervertrag `punkt29-fehlervertrag-test.js` | **80/80** (79 + neuer Fall C9b) |
| 29A-Mutationsprobe `punkt29-mutationsprobe.js` | **12/12 rot** — M12 wird wieder erkannt (vor C9b überlebte sie) |
| 29A-Befundproben `punkt29-befundproben.js` | **4/4 behoben, Exit 0** |
| Fix-Regressionssuite `punkt29-fixpfade-test.js` | **40/40** |
| Fix-Mutationsprobe `punkt29-fix-mutationsprobe.js` | **7/7 rot** |
| Offline-Suite ohne Production-Secrets (maßgeblich, bildet CI nach) | **186/190** gegen Basislinie `origin/main` `cb10d76` **185/189**, Fehlschlagliste **identisch** (privacy-vollstaendigkeit, profile-db, provision-tenant, tenant-neutrality — umgebungsbedingt, im CI grün); Suiten-Delta genau **+1** = `punkt29-fixpfade-test.js` |
| E2E-Mutationsproben Pilot / Berlin / Brandenburg | **10/10 · 10/10 · 17/17 rot** (nach der Ankerreparatur aus §5a; davor Exit 2, sie liefen gar nicht) |
| E2E-Verträge Pilot / Berlin / Brandenburg | **96/96 · 76/76 · 98/98** |
| Bestandsverträge einzeln | cron-fairness 201/201 · vorgangs-lebenszyklus 81/81 · matching-audit 178/178 · matching-aktualitaet 29/29 · pending-terminal 63/63 · ko-recovery 12/12 · ai-json-parse 13/13 · nachhol-schreibgate 52/52 · understanding-recovery 57/57 · understanding-gate grün |
| Browser-/Mobile-Smoke | **32/32** |

**Benannte Beobachtung B29-F1 (kein Befund dieses PRs):** `berlin-e2e-vertrag-test.js`
ist **unter hoher Parallellast flaky** — Fall **J8** („Rangfolge: der relevante Berliner
Vorgang steht vor dem irrelevanten") schlug in einem Lauf fehl, während fünf weitere
Node-Prozesse liefen. Der Fehlschlag trat **auf `main` `cb10d76` ebenso auf** (isoliert
reproduziert: 75/76) und ist damit **nicht** von diesem PR verursacht. Ohne Parallellast
4/4 grün auf beiden Ständen. Nicht in diesem PR behoben — eine eigene, kleine Aufgabe.

## 5 · Abweichung zur 29A-Befundprobe P29-3 — **erledigt am 2026-07-31**

> **Integration abgeschlossen (Etappe 2, Rebase auf `main` `cb10d76`).** PR #187 ist
> gemergt; die hier angekündigten Anpassungen sind in **diesem** PR vollzogen — siehe
> §5a. Der Abschnitt darunter bleibt als Begründung erhalten.

### 5a · Was tatsächlich angepasst wurde

| Stelle | vorher | jetzt |
|---|---|---|
| `punkt29-befundproben.js` P29-3 | `duplicate === 0` über **alle** Cluster (unerfüllbar streng) | `updateVersuche >= 2` **und** `u2['skipped-error'] === 1` **und** `u2.duplicate === 1` — geprüft wird der geforderte zweite Update-Versuch; der **unveränderte** Nachbarcluster darf zulässig `duplicate` sein |
| `punkt29-fehlervertrag-test.js` **B9** | pinnte: zurückgegebenes Timeout zählt als **Erfolg**, Fehlerserie 0 | fordert: wird als **Fehler** gebucht, `letzterErfolgAt === null`, Fehlerserie läuft weiter |
| `punkt29-fehlervertrag-test.js` **C9** | pinnte: `null` endet als `cluster-error` **ohne** failed-Parkung | fordert: `skipped-invalid` **mit** markFailed, Begründung und Endzustand; `cluster-error === 0` |
| `punkt29-fehlervertrag-test.js` **D9** | pinnte: kein zweiter Update-Versuch, `skipped-error === 0` im zweiten Lauf | fordert: `updateVersucht === 2`, zweiter Lauf zeigt `skipped-error === 1`; die **4 unveränderten** Cluster bleiben zulässige Duplikate (`duplicate === 4`) |
| `punkt29-fehlervertrag-test.js` **C9b** (neu) | — | Fehlerisolation je Cluster, ausgelöst über einen ungeschützten Speicherfehler (`deps.save` wirft) |
| `pilot-/berlin-/brandenburg-e2e-mutationsprobe.js` | Ankertext über 3 Zeilen inkl. `return … "duplicate" …` | Anker auf die stabile Zeile `if (!neueDocs.length) {` verkürzt |

**Zwei Regressionen, die dabei aufgefallen sind und hier behoben wurden:**

1. **Deckungslücke (von der 29A-Mutationsprobe aufgedeckt).** Nach dem P29-2-Fix läuft
   der `null`-Rückgabewert sauber innen über `skipped-invalid` — damit lief **kein Test
   mehr** durch den `cluster-error`-Catch, der die Fehlerisolation je Cluster absichert.
   Mutation **M12 überlebte**. Geschlossen durch den neuen Fall **C9b**; die Probe
   erkennt M12 wieder (12/12).
2. **Drei veraltete Mutationsproben.** Der P29-3-Fix hat den `duplicate`-Block
   umgeschrieben; die Ankertexte der Pilot-/Berlin-/Brandenburg-Proben passten nicht
   mehr, die Proben brachen mit **Exit 2 („Probe ist veraltet")** ab und liefen gar
   nicht. Anker verkürzt, alle drei laufen wieder (**10/10 · 10/10 · 17/17 rot**).

### 5b · Ursprüngliche Begründung (unverändert)

Die SOLL-Erwartung der 29A-Befundprobe P29-3 verlangt im zweiten Lauf
`duplicate === 0` **über alle Cluster**. Das ist unerfüllbar streng: die
Probe-Fixture enthält einen zweiten, **unveränderten** Cluster
(„Havariebericht"), der auch nach einem korrekten Fix ehrlich ein Duplikat
bleibt (jede andere Klassifikation wäre falsch oder ein unnötiger KI-Call).
Mit den Fixes zeigt die Probe real: `Versuche: 2` (der geforderte zweite
Update-Versuch findet statt) und `zweiter Lauf: { duplicate: 1, skipped-error: 1 }`
— das Duplikat ist der unberührte Nachbar. Beide Anpassungen (Befundprobe **und**
die gepinnten Assertions B9/C9/D9) sind mit §5a **vollzogen**; die Befundproben
stehen jetzt auf **4/4 behoben (Exit 0)**.

## 6 · Sicherheitsgrenzen (eingehalten)

Keine Production-Zugriffe (auch nicht lesend) · keine Migration · kein
Backfill · keine Datenkorrektur · kein manueller Crawl-/Pipeline-/
Understanding-/Matchinglauf · 0 echte KI-Aufrufe / 0,00 USD · keine Secrets-,
Env-, Cron-, Lock-, Budget- oder Quellenänderung · Berlin/Brandenburg/M8
unverändert AUS · keine neuen Mandate · keine Production-Daten im Repository
(Fixtures künstlich, `.example`-Domänen) · kein Merge.

## 7 · Status und nächster Schritt

**Punkt 29 bleibt ⏳ teilweise:** 29A ist erfüllt und **gemergt** (PR #187, in `main`
seit `cb10d76`), die vier Fix-Sprints P29-1…P29-4 sind mit **PR #188** (dieser
Fix-PR, Branch `claude/p29-fehlerpfade-schliessen-wpxb1h`, rebasiert auf `cb10d76`)
**gebaut, offline belegt und in den 29A-Vertrag integriert** (§5a).

**29B bleibt offen** — und daran ändert dieser PR nichts. Ein Punkt über
„kontrolliert funktionierende Fehlerpfade" wird erst grün, wenn das korrigierte
Verhalten an **echten regulären Läufen** rein lesend belegt ist. Künstliche Fehler
in Production sind verboten ([`../betrieb/quellenstoerungen.md`](../betrieb/quellenstoerungen.md) §11),
also ist 29B davon abhängig, dass die betreffenden Fehlerzustände **natürlich**
auftreten. Tritt ein benötigter Zustand im Beobachtungsfenster nicht auf, wird 29B
ehrlich als blockiert oder teilweise abgeschlossen geführt — **nicht** als erfüllt.

**Nächster Schritt:** Betreiberentscheidung über den Merge dieses Fix-PRs
(Merge = Production-Deployment). Danach 29B rein lesend an regulären Läufen.
