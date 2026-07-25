# CURRENT_STATE — Understanding-Recovery-Pfad & PR #105

**Stand:** 2026-07-25 · **Sprint:** Review des scharfen Recovery-Pfades auf `main`, Merge-Entscheidung zu PR #105
**Geprüfter `main`-Stand:** `035898b` (Merge #114) · **PR #105 HEAD:** `525af50` (Basis war `8369a5b`, Merge #101)

> Hinweis: Die in der Sprint-Vorgabe genannten Orientierungsdateien `CLAUDE.md`,
> `docs/START_HERE.md` und `docs/CURRENT_STATE.md` existierten in diesem Repository
> **nicht**. Orientierung erfolgte daher über `docs/datenmotor-restliste.md`
> (die dort selbst als „EINZIGE verbindliche Liste aller offenen Punkte" deklarierte
> Restliste), `docs/betrieb/env-inventar.md`, `docs/betrieb/understanding_recovery_trockenlauf.md`
> und `docs/mandantentrennung-architektur.md`. Diese Datei wird hiermit angelegt.

---

## 1. Tatsächlicher Zustand auf `main`

Der Verdacht ist **bestätigt**. Auf `main` (`035898b`) gilt:

| Prüfpunkt | Befund auf `main` |
|---|---|
| `.github/workflows/understanding-recovery.yml` | **existiert** (94 Zeilen) |
| Trigger | **ausschließlich** `workflow_dispatch` — kein `schedule`, kein `push`, kein `workflow_call` |
| Manueller Trigger | ja, mit Freitext-Eingabe `confirm_text` |
| `RECOVERY_ALLOWLIST` | **gefüllt** — 6 `vorgang_id`s (`lib/helmut/understanding-recovery.js:161-168`) |
| Secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AZURE_OPENAI_*`, `OPENAI_API_KEY` |
| Erreichbare Umgebung | **Production-Datenbank** über den Service-Role-Key (umgeht RLS vollständig) |
| Schreiboperationen | bis zu **6 neue complete-KOs** + Dokument-Links über `understanding.understandOneCluster` |
| Schutzmechanismen | Allowlist · Doppelsperre (`HELMUT_RECOVERY_EXECUTE` + Token `RECOVER_6_CONFIRMED`) · `concurrency`-Gruppe · Idempotenz-Re-Check (`bereits-complete`) · Themen-Duplikat-Filter · Rollback-Kennung `recovery:rec-<run_id>` in `understanding_model` · KI-Key-Preflight |
| Fehlender Schutz | **keine Rückabwicklung im Code** (Rollback nur manuell über die Kennung); kein Dry-Run-Zwang vor dem Write |
| Gescheiterter Prod-Lauf | Lauf **`rec-29569461715`** (2026-07-17, `workflow_dispatch`, Branch `claude/helmut-datenmotor-impl-2-kd1jl9`) erzeugte einen Multi-Themen-Digest, wurde zurückgerollt |
| **Dokumentation des Fehlschlags auf `main`** | **fehlt vollständig.** `grep -rn "29569461715" docs/` auf `main` = 0 Treffer |

**Kernbefund:** Nicht nur der Pfad ist scharf — die Betriebsdokumentation auf `main`
(`docs/betrieb/understanding_recovery_trockenlauf.md` §B/§C) beschreibt den Anker-Pfad
weiterhin als *vorbereitet und freigabepflichtig offen*, inklusive des exakten Tokens
`RECOVER_6_CONFIRMED`. Ein Operator, der ausschließlich `main` liest, findet **keinen
Hinweis darauf, dass genau dieser Lauf in Production bereits falsche Ergebnisse
erzeugt hat**. Die Stilllegung *und* die Fehlerdokumentation liegen beide nur im
ungemergten PR #105.

### Ursache und Wiederholbarkeit

Die Ursache ist verstanden und liegt im Matcher, nicht in der Orchestrierung:
`matchDocuments`/`anchorsMatch` (`lib/helmut/understanding-recovery.js:31-53`) matcht über
**Teilstring-Anker** (`a.includes(b) || b.includes(a)`) ab 8 Zeichen Länge. Bei Multi-Doc-Fällen
zieht das fremde Themen in dasselbe Cluster → ein KO über mehrere unzusammenhängende Vorgänge.
Der Matcher ist auf `main` **unverändert**, die Allowlist unverändert → **derselbe Fehler kann
identisch erneut auftreten**.

### Andere Codepfade auf denselben Mechanismus (verifiziert)

- `lib/helmut/ko-recovery.js` (P1-4, bounded Auto-Retry, Flag `HELMUT_FAILED_KO_RECOVERY`, Default AUS) —
  setzt `failed` → `pending` und nutzt den **normalen** Understanding-Pfad, **nicht** den Anker-Matcher. Nicht betroffen.
- `POST /api/admin/recovery/reset-failed` (`server.js:1629`, Rolle `admin`, `confirm:true`) und
  `GET /api/debug/reset-failed-kos` (`server.js:6627`, gegated durch `HELMUT_ADMIN_SECRET` + Rate-Limit) —
  beide lösen `bulkResetUnderstandingFailed()` (Bulk-PATCH ohne Limit) plus einen Understanding-Lauf aus.
  Ebenfalls **normaler** Pfad, nicht der Anker-Matcher. `understanding_status=eq.failed` trifft
  `failed-final` nicht → die „nie wieder"-Garantie aus PR #105 bleibt intakt.
- Kein weiterer Workflow, kein Cron und kein Server-Endpunkt ruft
  `scripts/understanding-recovery-execute.js` oder `planRecovery`/`recoverOne` auf (repoweiter Grep).

---

## 2. Risiko des Recovery-Pfades auf `main`

| Dimension | Bewertung | Beleg |
|---|---|---|
| Datenkorruption | **mittel** | additive Writes, kein Delete/Update bestehender complete-KOs |
| Falsche Understanding-Ergebnisse | **hoch** | in Production eingetreten (`rec-29569461715`) |
| Überschreiben korrekter Ergebnisse | niedrig | Idempotenz-Re-Check + `completeTopicSet`-Duplikatfilter greifen vor dem Write |
| Mandantenübergreifend | **ja, strukturell** | `knowledge_objects` hat **kein** `tenant_id` (`supabase/schema.sql:238`); geteilter Wissenskorpus laut `docs/mandantentrennung-architektur.md:63` → ein falsches KO ist für **alle** Mandanten sichtbar |
| Doppelverarbeitung | niedrig | `concurrency`-Gruppe + Idempotenz |
| Kosten | vernachlässigbar | max. 6 KI-Calls, Tagesdeckel 150 |
| Lock-Konflikte | niedrig | eigener Pfad, `concurrency: understanding-recovery` |
| Wiederholbarkeit | **hoch** | Matcher + Allowlist unverändert |
| Fehlende Rückabwicklung | **mittel** | nur manuell über die Kennung `recovery:rec-<id>`; kein automatischer Rollback |
| Unbemerkte Ausführung | **niedrig** | nur `workflow_dispatch`; braucht Actions-Schreibrecht **und** das exakte Token. Ein Fehlstart ohne Token bleibt read-only (Schritt A) |
| Datenschutz | niedrig | ausschließlich öffentliche politische Quellen, keine PII; Ausgabe ist redigiert (`redactAssessment`) |
| Auswirkung Cem-Pilot | **hoch** | ein Multi-Themen-Digest erscheint direkt im Briefing des Piloten |

### Einstufung: **Hohes Risiko** (nicht kritisch)

Begründung: Der Schadensfall ist **real eingetreten**, die Ursache ist im Code **unverändert
vorhanden**, die Auswirkung reicht durch den geteilten Wissenskorpus über alle Mandanten bis in
das Pilot-Briefing, und `main` **dokumentiert den Fehlschlag nirgends** — die Doku lädt den
Operator sogar aktiv zum Lauf ein. Nicht *kritisch*, weil kein automatischer Trigger existiert,
der Write ein exaktes Token erfordert, der Blast-Radius auf 6 Vorgänge und ~6 KI-Calls begrenzt
ist, ein Rollback-Anker in jedem Datensatz mitgeschrieben wird und der reale Vorfall
nachweislich zurückgerollt werden konnte.

Das Risiko ist damit **operativer, nicht technischer Natur**: es realisiert sich nur durch eine
bewusste Operator-Handlung — die die aktuelle `main`-Dokumentation jedoch nahelegt.

---

## 3. Ergebnis des PR-#105-Reviews

**Die zentrale Sicherheitsaussage des PRs hält der Prüfung gegen den Code stand.**
Die Stilllegung ist **technisch wirksam**, nicht bloß dokumentarisch, und dreifach durchgesetzt:

1. `.github/workflows/understanding-recovery.yml` **gelöscht** → kein `workflow_dispatch` mehr
   möglich (Voraussetzung ist die Präsenz der Datei auf dem Default-Branch).
2. `scripts/understanding-recovery-execute.js` auf einen reinen `console.log`-Hinweis reduziert —
   **kein einziges `require`** von `storage`/`ai`/`understanding` mehr. Verhaltensbeleg:
   Aufruf mit `HELMUT_RECOVERY_EXECUTE=1` **und** korrektem Token liefert
   `{executed:false, stillgelegt:true}` (siehe neue Regression 13c).
3. `RECOVERY_ALLOWLIST = []` → `planRecovery` liefert strukturell nie einen Ausführungsfall.

Jede der drei Sperren allein würde genügen; sie sind unabhängig voneinander wirksam.

Weitere Prüfpunkte:

- **Aktive Production-Abläufe:** unbeeinträchtigt. Pending-Verarbeitung, Understanding und
  KO-Anreicherung laufen über `runPendingUnderstandingShadow`, das der PR nicht anfasst.
- **`failed-final`-Lücke (echter Fund des PRs):** `listPendingKnowledgeObjects` filterte auf
  `main` nur `!== "failed"`, nicht `failed-final` — terminale Fälle wären ewig neu geprüft und
  bei passendem Cluster erneut per KI verstanden worden. Der Fix ist verhaltensneutral und korrekt.
- **Mandantentrennung:** erhalten; `tenant-neutrality-test.js` 39/39, `tenant-guard-test.js` grün.
- **Keine festen Mandanten-IDs** eingeführt. Die neuen Allowlists enthalten `vorgang_id`s
  (mandantenneutrale Vorgangs-Slugs), keine Tenant-Identifikatoren.
- **PR-Größe:** 15 Dateien / +959/−256, davon der überwiegende Teil Doku und neue Tests.
  Zwei Themen (Stilllegung + OP-06-Vorbereitung) in einem PR — vertretbar, da OP-06 die
  `failed-final`-Semantik einführt, auf der die Stilllegungs-Nacharbeit aufsetzt. Eine Trennung
  brächte hier keinen Sicherheitsgewinn.
- **Aktualität:** Der PR basierte auf `8369a5b` und war **19 Commits hinter `main`** mit einem
  Merge-Konflikt in `docs/datenmotor-restliste.md`. Beides in diesem Sprint bereinigt (§4).
  Die 19 `main`-Commits berühren **keine** der Recovery-/Understanding-Dateien; der einzige
  Code-Overlap ist `lib/helmut/storage.js`, wo die Änderungen in disjunkten Bereichen liegen
  (Profil/Accounts vs. Pending-Filter) und sauber automerged.

### Verifizierte Restrisiken (kein Merge-Blocker)

1. **Wiederbelebung über den ungemergten `impl-2`-Branch (Hauptrisiko).**
   `claude/helmut-datenmotor-impl-2-kd1jl9` existiert weiterhin auf dem Remote und trägt unter
   **demselben Pfad** `.github/workflows/understanding-recovery.yml` eine **voll funktionsfähige**
   Fassung (Einzel-Dokument-Variante, Token `RECOVER_SOZIALWOHNUNGEN_CONFIRMED`) sowie ein
   **lebendes** `understanding-recovery-execute.js` (mit `require`s auf `storage`/`understanding`/`ai`
   und `understandOneCluster`-Aufruf). Die ursprüngliche PR-Beschreibung empfahl für den späteren
   Merge ausdrücklich, die **impl-2-Fassung zu übernehmen** — das hätte den Anker-Pfad samt seiner
   eigenen (alten) Tests **stillschweigend reaktiviert**. Behoben in §4.
2. **`planRecovery(opts.allowlist)`** akzeptiert weiterhin eine vom Aufrufer übergebene Allowlist,
   und `recoverOne` bleibt exportiert. Es existiert **kein** Production-Aufrufer (nur Tests) —
   eine Reaktivierung erforderte neuen Code, nicht nur eine Konfigurationsänderung. Akzeptabel.
3. **OP-06-Allowlist ist mandatsrelativ, die Tabelle nicht.** 16 der 34 Einträge in
   `lib/helmut/pending-terminal.js` sind mit „regional/lokal außerhalb Mandat" bzw.
   „Ausland/EU außerhalb Mandat" begründet — also relativ zum Mandat des **Cem-Piloten**.
   Geschrieben wird aber in `knowledge_objects` **ohne** `tenant_id`. In Kombination mit der neuen
   „nie wieder"-Garantie (`skipped-terminal`) würden diese Vorgänge auch für einen künftigen
   Zweitmandanten mit regionalem oder EU-Schwerpunkt **dauerhaft** nie verstanden.
   **Kein Merge-Blocker** — OP-06 wird durch den Merge nicht ausgeführt (Default AUS, nur
   `workflow_dispatch`, eigenes Token). **Aber: vor der OP-06-Freigabe zu entscheiden.**

---

## 4. Durchgeführte Änderungen (auf dem Branch von PR #105)

| Datei | Änderung |
|---|---|
| `docs/datenmotor-restliste.md` | Merge-Konflikt gegen aktuellen `main` aufgelöst (Kopfzeilen zusammengeführt: Basisstand + Re-Verankerung + Sprintstände; geprüfter Stand auf `035898b`/#114 gehoben) |
| `scripts/understanding-recovery-test.js` | **2 neue Regressionen** (55 → 57 Assertionen) |
| `docs/CURRENT_STATE.md` | **neu** — diese Datei |

Zusätzlich: `origin/main` (`035898b`) in den PR-Branch gemergt — der PR ist damit aktuell und konfliktfrei.

Die neuen Regressionen schließen genau Restrisiko 1:

- **13b · namensunabhängiger Riegel** — scannt **alle** `.github/workflows/*.yml` und schlägt fehl,
  sobald irgendein Workflow `understanding-recovery-execute` aufruft oder
  `HELMUT_RECOVERY_EXECUTE`/`HELMUT_RECOVERY_CONFIRM` setzt. Die bisherige Prüfung testete nur
  **einen festen Dateinamen** und hätte eine umbenannte Action nicht gefangen.
  *Negativkontrolle durchgeführt:* eine unter `zzz-renamed-recovery.yml` wiederhergestellte Kopie
  lässt 13b fehlschlagen (`gefunden: zzz-renamed-recovery.yml`).
- **13c · Verhaltensbeleg statt Quelltext-Regex** — startet das Execute-Skript als echten
  Subprozess mit `HELMUT_RECOVERY_EXECUTE=1` **und** korrektem Token und verlangt
  `executed:false, stillgelegt:true`. Die bisherigen 13er-Prüfungen waren reine
  Quelltext-Mustervergleiche und hätten eine Reaktivierung mit anderer Schreibweise nicht erkannt.

Da `.github/workflows/ci.yml` `scripts/run-offline-tests.js` ausführt, blockiert CI ab sofort jede
Wiederbelebung des Anker-Pfades — auch die über einen späteren `impl-2`-Merge.

Die PR-Beschreibung wurde entsprechend korrigiert: Für den `impl-2`-Merge gilt nun ausdrücklich
**nicht mehr** „impl-2-Fassung übernehmen", sondern die Stilllegung dieses Branches behalten.

**Keine** Production-Ausführung, **kein** Workflow-Dispatch, **keine** Secret-/Env-Änderung,
**keine** Production-Datenänderung, **kein** Merge, **kein** Deploy.

---

## 5. Tests

| Suite | Ergebnis |
|---|---|
| Offline-Gesamtsuite (`npm run test:offline`), PR-Branch gemergt auf `main` `035898b` | **141/141 grün** |
| Offline-Gesamtsuite, PR-Branch allein (vor Merge) | 130/130 grün |
| `understanding-recovery-test.js` | **57/57** (vorher 55, +13b, +13c) |
| Negativkontrolle 13b (umbenannter Workflow wiederhergestellt) | **schlägt korrekt fehl** |
| `pending-terminal-test.js` (OP-06) | 63 PASS / 0 FAIL |
| `tenant-neutrality-test.js` (Mandantentrennung) | 39 PASS / 0 FAIL |
| `ko-recovery-test.js` (P1-4) | 12/12 |
| `tenant-guard-test.js`, `understanding-gate-*`, `understanding-priorisierung` | grün (in der Gesamtsuite) |
| YAML-Validierung aller 11 Workflows | alle parsebar; `understanding-recovery.yml` entfernt; kein `schedule` auf dem neuen OP-06-Workflow |
| Direktaufruf des stillgelegten Skripts mit Flag + Token + `--confirm=` | kein DB-Zugriff, kein Write, kein KI-Call |

---

## 6. Offene Risiken

1. **Solange PR #105 nicht gemergt ist, bleibt der Anker-Recovery-Pfad auf `main` scharf**
   und die Betriebsdoku lädt weiterhin zum Lauf ein. Das ist der dringlichste offene Punkt.
2. **OP-06-Allowlist mandatsrelativ** (§3, Restrisiko 3) — vor der OP-06-Freigabe zu entscheiden,
   ob „außerhalb Mandat"-Fälle in einer mandantenneutralen Tabelle terminal markiert werden dürfen.
3. **`impl-2`-Branch** trägt weiterhin eine lauffähige Recovery-Fassung. Nach dem Merge von #105
   ist sie nicht mehr dispatchbar und CI blockiert ihre Rückkehr — der Branch sollte dennoch
   bereinigt oder gelöscht werden.
4. **OP-05-Restfälle** (4 Vorgänge) bleiben unverstanden, bis der Einzel-Dokument-Pfad läuft.
5. **OP-13-Fensterfalle** und **OP-14-Budgetdeckel-Beleg** unverändert offen (nicht aktiviert).

---

## 7. Merge-Empfehlung

**Ja — PR #105 mergen**, nach den in §4 ergänzten Korrekturen. Der PR ist die einzige
existierende Stilllegung des in Production nachweislich fehlgeschlagenen Recovery-Pfades;
ihn offen zu lassen ist deutlich riskanter als ihn zu mergen.

**Entscheidung: Option B** — PR #105 gezielt korrigiert, nicht ersetzt. Ein Ersatz-PR wäre
nicht gerechtfertigt: der PR ist inhaltlich korrekt, technisch wirksam, testgedeckt und nach
dem Merge von `main` konfliktfrei.

**Merge löst das Vercel-Deployment aus** — Merge und Deploy bleiben ausdrücklich beim Menschen.

---

## 8. Nächster Schritt

**PR #105 reviewen und mergen** (durch einen Menschen, mit Deployment-Fenster).
Erst danach die freigabepflichtigen Folgeschritte (OP-06-Ausführung, OP-05-Einzel-Doc-Recovery)
— OP-06 zusätzlich erst nach der Entscheidung zu Restrisiko 3.

---

## 9. Sprintzustand

**Erfolgreich abgeschlossen.** Zustand verifiziert, Risiko eingestuft, PR vollständig geprüft,
adversarialer Review durchgeführt, ein verifizierter Defekt gezielt behoben, Regressionstests
ergänzt und belegt, PR aktualisiert und mergefähig. Keine kritische Stopregel wurde ausgelöst.
