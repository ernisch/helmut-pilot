# Helmut Datenmotor — Verbindliche Übergabe an Thread 2

> **Zweck:** Diese Datei ist die *verbindliche* Arbeitsgrundlage für den
> Implementierungs-Thread („Thread 2"). Sie legt Reihenfolge, Abhängigkeiten,
> Akzeptanzkriterien, Freigabe-Grenzen, Tests und die notwendigen
> Production-Beweisläufe fest. Sie ersetzt keine der Grundlagen, sondern bündelt
> sie handlungsfähig.

| | |
|---|---|
| **Stand / Prüfdatum** | 2026-07-16 |
| **Geprüfter Commit** | `427295c` · verifiziert = `main` = `origin/main` = Production |
| **Auditstand** | **bestätigt aktuell** (siehe §0) |
| **Grundlagen** | `docs/helmut_datenmotor_audit.md`, `docs/helmut_datenmotor_umsetzungsplan.md` |
| **Visuelle Fassung** | `docs/visual/helmut_datenmotor_audit.pdf` (+ `…_umsetzungsplan.pdf`, `…_audit_und_umsetzungsplan.pdf`, `…audit.html`) |

> ### ⚠️ Statuskennzeichnung des PDF (verbindlich)
> Die abgelegten PDFs (`docs/visual/helmut_datenmotor_audit.pdf`,
> `…umsetzungsplan.pdf`, `…audit_und_umsetzungsplan.pdf`) sind ein **AUDITBERICHT
> und Umsetzungsplan** — sie beschreiben den *geprüften Ist-Zustand* und den
> *Plan*. Sie sind **ausdrücklich NOCH NICHT das endgültige Betriebsdokument.**
> Das endgültige Betriebsdokument (`docs/helmut_datenmotor_betriebslogik.md` +
> visuelle Fassung) entsteht erst **nach** der Umsetzung und dem
> Production-Nachweis der P0/P1-Härtungen durch Thread 2.

---

## 0. Auditstand — erneut bestätigt (Phase 1)

| Prüfung | Ergebnis |
|---|---|
| Aktueller Branch (dieser Thread) | `claude/optimistic-galileo-kvdswk` |
| Aktueller Commit (HEAD) | `427295c` |
| `origin/main` nach `git fetch` | `427295c` (der lokale Ref stand vorher veraltet auf `fce2e65`/PR #25 — genau die im Audit §1 dokumentierte Kuriosität; nach Fetch korrekt) |
| GitHub `main`-Tip | `427295c` (Commit #94) — **keine neueren Commits** |
| Production-Commit | `427295c` (Vercel, target=production, READY) |
| Working tree | sauber |
| Wurzel-Commits | 3 (wie im Audit) |
| **Fazit** | **HEAD = origin/main = Production = `427295c`. Der Auditstand ist unverändert gültig; seit dem Audit sind keine neuen Commits entstanden. Keine neuen Risiken.** |

**Weiterhin gültige Befunde:** Alle Risiken R1–R15 und alle Aufgaben P0-1…P3-10
gelten unverändert (kein Code seit `427295c` geändert). **Inzwischen erledigt:**
nichts zusätzlich seit dem Audit — der Radar-Teil (P1-8) wurde jedoch *bereits vor
dem Audit* isoliert via PR #89 gemergt (siehe §10, PR-#88-Warnung); der
`main`-Stand von `radar.js`/`radarState.js` ist vor P1-8 zu prüfen.

---

## 1. Verbindliche Reihenfolge aller P0- und P1-Aufgaben

Die Reihenfolge folgt den technischen Abhängigkeiten (§2), nicht der ID-Nummer.
**Innerhalb einer Stufe von oben nach unten abarbeiten.**

### Stufe A — P0 (kritisch, Beobachtbarkeit & Sicherheit)

| Reihenfolge | ID | Kurz | Warum an dieser Stelle |
|---|---|---|---|
| **1** | **P0-2** | `compactStore`-Whitelist um Diagnosefelder erweitern | **Muss zuerst.** Ohne die Whitelist werden `durationMs`/`understanding{}`/`googleUrlResolution` beim Speichern sofort wieder gestrippt — jede spätere Persistenz (P0-1) und der Google-News-Monitor (R4) wären wirkungslos. Kleinster Fix (S/S). |
| **2** | **P0-1** | Crawl-/Pipeline-/Lage-/Understanding-Laufzeit persistieren | Baut direkt auf P0-2 auf (nutzt die erweiterte Whitelist). |
| **3** | **P0-3** | Pipeline-Fehler in `systemErrors` schreiben | Unabhängig, additives Logging. Danach ist der Motor im Fehlerlog sichtbar. |
| **4** | **P0-4** | Atomaren Pipeline-Lock (fail-closed) + Understanding-Lock aktivieren | Verhaltensänderung am Lock — nach der Beobachtbarkeit (P0-1..3), damit ein Fehlverhalten sofort sichtbar würde. Sorgfältig testen. |
| **5** | **P0-5** | Blob-Timeout-Robustheit (Retry+Backoff; Locks relational; Retention senken) | Größte P0 (L). Der Locks-relational-Teil ergänzt P0-4; die volle Blob→relational-Migration ist **freigabepflichtig** (E3). |

### Stufe B — P1 (vor Bundestagspilot, Ehrlichkeit & Datenqualität)

| Reihenfolge | ID | Kurz | Warum an dieser Stelle |
|---|---|---|---|
| **6** | **P1-9** | Stale-Kommentare korrigieren + Alt-Audit als überholt kennzeichnen | Trivial, risikolos, reine Doku/Kommentare — jederzeit; hier als sauberer Auftakt zu P1. |
| **7** | **P1-2** | Ebenen-Casing vereinheitlichen (`bund` klein) | **Vor P1-1**, damit der Backfill konsistente, klein geschriebene Ebenen erzeugt und Downstream-Filter nicht verfehlen. |
| **8** | **P1-1** | KO-Klassifikations-Backfill (247 Alt-KOs) | **Braucht Freigabe (Prod-Write, E2).** Code + Trockenlauf ohne Freigabe vorbereiten; Ausführung erst nach Freigabe. Vor P1-3, damit die Priorisierung den vollständigen KO-Bestand sieht. |
| **9** | **P1-5** | Durchsatz ehrlich melden (`savedItems` → echte `raw_documents`-Deltas) | Liefert die ehrliche Zahlengrundlage, auf der P1-6 alarmiert. |
| **10** | **P1-6** | KI-Budget- & „Erfolg-ohne-Arbeit"-Achse im Health-Report | Braucht P0-2 (Whitelist) + P0-1 (Laufzeit) + P1-5 (ehrliche Deltas) als Datengrundlage. |
| **11** | **P1-7** | Monitoring-Zweitkanal + Meta-Heartbeat (Watchdog `?dryRun=1`) | Baut auf dem ausgebauten Health-Report (P1-6) auf. Aktivierung von `health-watch.yml`/Webhook ist **freigabepflichtig** (neuer Alarmkanal). |
| **12** | **P1-4** | `failed`-KO-Recovery (begrenzter Auto-Retry mit Zähler) | Unabhängig; nach der Beobachtbarkeit, damit Retry-Verhalten messbar ist. |
| **13** | **P1-8** | Radar-Störungswahrheit | **Zuerst `main`-Stand prüfen** — der Fix ist ggf. bereits via PR #89 live (§10). Nur die noch fehlende Differenz umsetzen. |
| **14** | **P1-3** | Understanding-Priorisierung scharfschalten | **Braucht Freigabe** (Verhaltensänderung). Zuletzt, nach P1-1 (Backfill), damit die Priorisierung auf dem vollständigen Bestand greift. |

---

## 2. Abhängigkeiten zwischen den Aufgaben

```
P0-2 ──▶ P0-1 ──▶ P1-6 ──▶ P1-7
  │                 ▲
  └───────▶ R4 ok   │
P1-5 ───────────────┘
P1-2 ──▶ P1-1 ──▶ P1-3
P0-4 ◀──┐
P0-5 ───┘ (Locks relational: gemeinsamer Baustein)
P0-3  (unabhängig)      P1-4  (unabhängig)      P1-9  (unabhängig)
P1-8  (abhängig vom aktuellen main-Stand / PR #89)
```

- **P0-2 → P0-1:** Whitelist muss vor der Laufzeit-Persistenz stehen, sonst
  Feld sofort gestrippt.
- **P0-2 → R4 (Google-News-Monitor):** Whitelist reanimiert den toten Monitor.
- **P0-1 + P1-5 → P1-6:** Health-Report-Achse braucht persistierte Laufzeiten und
  ehrliche Durchsatz-Deltas.
- **P1-6 → P1-7:** Zweitkanal/Heartbeat setzt den ausgebauten Health-Report voraus.
- **P1-2 → P1-1:** Casing-Kanon vor dem Backfill.
- **P1-1 → P1-3:** Priorisierung wirkt erst sinnvoll auf vollständig angereichertem
  KO-Bestand.
- **P0-4 ↔ P0-5:** „Locks relational" ist Baustein beider — gemeinsam planen.
- **P1-8** hängt vom aktuellen `main`-Stand ab (PR #89 hat den Radar-Teil evtl.
  bereits gemergt).

---

## 3. Klare Akzeptanzkriterien je Aufgabe

> **Ein Punkt gilt erst als erledigt, wenn (a) die Offline-Suite grün ist,
> (b) das jeweilige Akzeptanzkriterium durch einen neuen/erweiterten Test
> abgesichert ist, und — wo markiert — (c) ein Production-Beweislauf (§8) es
> bestätigt.**

| ID | Akzeptanzkriterium (nachweisbar) |
|---|---|
| **P0-2** | Ein Persistenz-Roundtrip-Test zeigt: nach `compactStore` bleiben `durationMs`, `understanding{}` und `googleUrlResolution` im gespeicherten `crawlRun` erhalten (vorher gestrippt). |
| **P0-1** | `pipeline-status.durationMs` ist nach einem Crawl **nicht mehr `null`**; Lage-Check und Understanding-Batch persistieren ihre Dauer; Werte sind plausibel > 0. Kein geschätzter Wert — echte Wall-Clock-Messung. |
| **P0-3** | Ein provozierter Crawl-/KI-/DB-Fehler erzeugt genau einen `systemErrors`-Eintrag mit Prozessname, Laufkennung, Fehlertyp (nur Metadaten, keine personenbezogenen Inhalte). Erfolgsläufe erzeugen keinen. |
| **P0-4** | Zwei gleichzeitige `runSourceCrawl`-Aufrufe führen nachweislich zu genau einer Verarbeitung (Lock atomar); bei Storage-Fehler wird **fail-closed** verweigert (nicht mehr fail-open). Understanding-Lock verhindert Doppel-KI-Calls in der 05:30-Überlappung. |
| **P0-5** | Ein simulierter Blob-Timeout löst Retry+Backoff aus; nach erschöpften Retries wird ein `systemError` geschrieben (kein stiller Lauf-Verlust). Blob-Größe des `main`-Keys sinkt messbar (Retention/Locks ausgelagert). |
| **P1-9** | Die drei falschen Kommentare sind korrigiert; `docs/AUDIT_DATENMOTOR_2026-07.md` trägt einen „überholt"-Hinweis. Kein Verhaltensänderung — Offline-Suite unverändert grün. |
| **P1-2** | Klassifikation schreibt ausschließlich klein (`bund`); alle Downstream-Filter/Debug-Seeds vergleichen case-insensitiv bzw. klein; ein Test mit `Bund`-Altdaten und `bund`-Neudaten liefert dieselbe Trefferzahl. |
| **P1-1** | Nach dem Backfill haben **alle 247 Alt-KOs** `decision_level` **und** Feature-Vektor (`embedding`); Lauf ist idempotent (zweiter Lauf 0 Änderungen) und kostenneutral (0 LLM-Calls). *Ausführung erst nach Freigabe E2.* |
| **P1-5** | Der gemeldete Durchsatz entspricht den echten neuen `raw_documents` (±0), nicht mehr `savedItems`; die `newCandidateItems=1012`-Klemme ist erklärt oder behoben. |
| **P1-6** | Health-Report enthält Budget-Ausschöpfungs-Achse (Calls/Limit/Rest/Skips) und meldet `ok=false` bei Budget=0 **oder** `processed=0`-Leerlauf; Pro-Quelle-„zuletzt erfolgreich" ist sichtbar. |
| **P1-7** | Ein zweiter, vom CallMeBot unabhängiger Alarmkanal existiert und ist testbar (Webhook/GitHub-Mail); der Watchdog prüft zusätzlich `health-report?dryRun=1`. *Aktivierung freigabepflichtig.* |
| **P1-4** | Ein `failed`-KO wird durch einen Recovery-Lauf begrenzt (Zähler) automatisch erneut versucht und erreicht `complete` oder `endgültig fehlgeschlagen`; keine Endlosschleife. |
| **P1-8** | Bei simuliertem Store-Fehler zeigt Radar eine **Störungsmeldung** (nicht „ruhiger Tag"). *Vorher prüfen, ob PR #89 dies bereits erfüllt — dann nur Rest-Differenz.* |
| **P1-3** | Bei Budgetdeckel werden nachweislich die höchstpriorisierten Vorgänge zuerst verstanden (nicht Ankunftsreihenfolge); ein Test mit gemischten Prioritäten belegt die Auswahl. *Scharfschalten freigabepflichtig.* |

---

## 4. Was Thread 2 OHNE Freigabe umsetzen darf

**Grundsatz:** Additive, reversible **Code-, Test- und Doku-Arbeit** auf dem
Feature-Branch ist frei — inklusive committen. **Aber:** Jeder Weg nach
Production (Merge nach `main` → Vercel-Deploy) sowie jede Migration,
Zeitplan-, Secret- und Flag-Änderung bleibt freigabepflichtig (§5, §7-Deploy).

| ✅ Ohne Freigabe (Code schreiben, testen, committen — **nicht deployen**) |
|---|
| P0-1, P0-2, P0-3 (rein additiv/Logging) |
| P0-4 (Code + Tests; **Deploy** freigabepflichtig, weil Verhaltensänderung am Lock) |
| P0-5 **Code-Teil** (Retry/Backoff, Retention-Konstante) — der *Locks-relational*-Teil, falls er eine **Migration** braucht, ist freigabepflichtig |
| P1-2, P1-4, P1-5, P1-6, P1-8, P1-9 |
| P1-7 **Code-Teil** (Watchdog-Erweiterung, Webhook-Verdrahtung) — **Aktivierung** des neuen Alarmkanals freigabepflichtig |
| P1-1 **Code + Trockenlauf** (`--dry-run`) — die **Ausführung auf Prod** ist freigabepflichtig |
| Alle Tests (Phase 6), fester Goldset-Testsatz, `docs/*`-Dokumentation |
| Landtag-Struktur **vorbereiten** (P2 nur als gekapselter, per Flag/Freigabe abgeschalteter Code — **nicht aktivieren**) |

---

## 5. Was meine (Gründer-)ausdrückliche Freigabe benötigt

| 🔒 Freigabepflichtig | Bezug |
|---|---|
| **Jedes Deployment nach Production** (Merge nach `main`, Vercel-Prod) | Arbeitsregel |
| **P1-1 Backfill-Ausführung auf Prod** (247 KOs) | E2 |
| **P1-3 Understanding-Priorisierung scharfschalten** | E-Plan |
| **P0-5 volle Blob→relational-Migration** der Betriebsdaten | E3 |
| **Jede DB-Migration** (auch P0-4/P0-5 „Locks relational", falls Schema) | Arbeitsregel |
| **P1-7 neuen Alarmkanal aktivieren** (`health-watch.yml`, `HELMUT_MONITORING_WEBHOOK_URL`) | R10 |
| **Jede Zeitplan-/Cron-Änderung** (P3-8 DST, neue Schedules) | Arbeitsregel |
| **Jede Secret-Rotation** | Arbeitsregel |
| **Alle P2 (Berlin/Brandenburg aktivieren)** — in diesem Thread nur strukturell vorbereiten | E4 |
| **E5 Scoring scharfschalten** (`HELMUT_SCORING_MODE`) | E5 |
| **Env-Wert-Änderungen** (z. B. `HELMUT_MAX_LLM_CALLS_PER_DAY`, `HELMUT_UNDERSTANDING_LOCK`) | E1 |

---

## 6. Welche Production-Env-Werte noch bestätigt werden müssen (E1)

Diese Werte sind in Vercel „sensitive" und aus der Arbeitsumgebung **nicht
lesbar**. Vor bzw. begleitend zu den markierten Aufgaben müssen sie bestätigt
werden (nur „gesetzt/Wert-Kategorie", **keine Secrets in Logs**):

| Env-Variable | Warum wichtig | Blockiert / betrifft |
|---|---|---|
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | 50 vs. 100? — Budgetdeckel | P1-6, Kostenwahrheit |
| `HELMUT_UNDERSTANDING_LOCK` | Default aus → Doppel-KI möglich | **P0-4** |
| `HELMUT_LLM_BUDGET_FAIL_CLOSED` | Fail-closed bei Budgetfehler? | P0-4, P1-6 |
| `HELMUT_LLM_RESERVE_UNDERSTANDING` | Reservierungspfad aktiv? | P0-4 |
| `HELMUT_V3_MATCHING` | Matching aktiv? | Relevanz, P1 |
| `HELMUT_V3_LAZY_UNDERSTANDING` | Lazy-Pfad aktiv? | Durchsatz, P1-5 |
| `HELMUT_AUTH_MODE` | Single- vs. Multi-Tenant | Nutzertrennung |
| `HELMUT_DIP_PRIMARY` | DIP als Primärquelle? | Quellenpfad |
| ~~`HELMUT_MORNING_PUSH_ALL_PROFILES`~~ (entfallen) | Morgen-Push läuft immer über alle aktiven Mandate | Briefing-Zustellung |
| `HELMUT_MONITORING_WEBHOOK_URL` | Zweitkanal vorhanden? | **P1-7** |
| `HELMUT_SCORING_MODE` | Scoring scharf? (Default aus) | E5 |

**Empfehlung:** Boolean-/Kategorie-Inventar bestätigen **und** einen
Boot-Zeit-Env-Selbstcheck (P3-9, nur „gesetzt/nicht gesetzt") einbauen.

---

## 7. Welche Tests nach jeder Aufgabe laufen müssen

**Pflicht nach *jeder* Aufgabe (das CI-Gate):**

```
node scripts/run-offline-tests.js      # blockierende Offline-Gesamtsuite (Syntax + alle Suiten)
```

Bei UI-/Client-Berührung zusätzlich:
```
node scripts/browser-smoke-test.js     # Chromium Desktop+Mobil (echter Browser)
```

**Aufgabenspezifische Suiten (zusätzlich, gezielt):**

| ID | Zusätzlich auszuführen / neu zu schreiben |
|---|---|
| P0-2 | Neuer compactStore-Roundtrip-Test; `npm run test:quality-watchdog`, `test:admin-source-report` |
| P0-1 | Neuer durationMs-Persistenz-Test; `test:watchdog-state` |
| P0-3 | Neuer `recordSystemError`-Sammler-Test; `npm run test:stoerungswahrheit` |
| P0-4 | Neuer Lock-Atomaritätstest (Muster `test:llm-reservation`); `test:llm-budget` |
| P0-5 | Neuer Blob-Retry/Backoff-Test; `npm run test:restore-drill` |
| P1-9 | `npm run test:source-mode` (Kommentare) — sonst keine Verhaltensänderung |
| P1-2 | `npm run test:ko-classification`, `test:matching-norm` |
| P1-1 | `npm run test:ko-backfill`, `test:ko-classification` (Trockenlauf vor Freigabe) |
| P1-5 | `npm run test:admin-source-report`, `test:source-mode` |
| P1-6 | `npm run test:quality-watchdog`, `test:watchdog-state`, `test:llm-breakdown`, `test:admin` |
| P1-7 | `npm run test:watchdog-state`, `test:env-inventar` |
| P1-4 | `npm run test:understanding-eval`, neuer Recovery-Test |
| P1-8 | `npm run test:radar`, `test:radar-state`, `test:radar-ui`, `test:stoerungswahrheit` |
| P1-3 | `npm run test:gate-integration`, `replay:gate-shadow` |

**Fester Testsatz (Phase 6):** `npm run test:goldset` (goldset-test.js,
`test/fixtures/`) als repräsentativer politischer Dokumentensatz für
Relevanz-/Nachverfolgbarkeits-Regressionen — bei jeder Aufgabe mit
Ausgabe-Bezug mitlaufen lassen. **Kein Merge nach `main`, bevor CI (Offline +
Browser-Smoke) grün ist und Branch Protection greift.**

---

## 8. Welche echten Production-Läufe danach zur Beweisführung notwendig sind

Code + Offline-Tests beweisen die *Logik*. Der *überwachte Pilot* braucht darüber
hinaus echte Production-Nachweise. **Diese Läufe erfordern Freigabe (kein
Prod-Eingriff ohne Freigabe) und müssen dokumentiert werden — keine geschätzten
Werte.**

| Nach | Production-Beweislauf | Nachweis-Artefakt |
|---|---|---|
| P0-2 + P0-1 | Ein echter Crawl → danach `GET /api/cron/pipeline-status` | `durationMs` ≠ `null`, `googleUrlResolution` sichtbar |
| P0-3 | Regulärer Betriebstag mit mind. einem realen Quellen-/KI-Fehler | `systemErrors`-Eintrag mit Metadaten vorhanden |
| P0-4 | 05:30-UTC-Überlappungsfenster (Understanding-Cron + Watchdog-Pipeline) beobachten | keine Doppel-KI-Calls; Lock-Skip sauber protokolliert |
| P0-5 | Betriebstage mit Blob-Last (der 10-s-Timeout tritt real auf) | Retry greift; kein „ganzer Lauf verloren"; Blob-Größe gesunken |
| P1-1 | Backfill-Lauf auf Prod (nach Freigabe) | 247 KOs mit Ebene/Vektor; Idempotenz-Zweitlauf 0 |
| P1-6 | Ein Health-Report-Zyklus (08:00 CEST) mit realen Zahlen | Budget-/Laufzeit-/Erfolg-ohne-Arbeit-Achse gefüllt |
| P1-7 | Watchdog-Lauf + provozierter Report-Ausfall | Zweitkanal-Alarm nachweislich zugestellt |
| P1-8 | Realer/simulierter Store-Fehler im Betrieb | Radar zeigt Störung statt „ruhig" |
| P1-3 | Budgetdeckel-Tag (nach Freigabe) | höchstpriorisierte Vorgänge zuerst verstanden |

**Reihenfolge Beweisführung:** erst Offline grün → committen → **Freigabe
einholen** → Deploy → Beweislauf → Werte in den Abschlussbericht /
Betriebsdokument eintragen (echte, gemessene Werte).

---

## 9. Was erst nach dem Bundestagspiloten bzw. vor dem Landtagspiloten bearbeitet wird

### Vor dem Landtagspilot (P2 — **in diesem/Thread 2 nur strukturell vorbereiten, nicht aktivieren**)

- **P2-1** Landesmodul-Gate parametrisieren (hinter Flag/Freigabe)
- **P2-2** PARDOK-Live-Modus bauen (neuer Ingest-Pfad)
- **P2-3** Ebenen-Default entkoppeln (kein Auto-`Bund`)
- **P2-4** BE/BB-Daten aktivieren (Seed/Status-Flip — **Prod-Freigabe**)
- **P2-5** Landes-Relevanz-/Scoring-Kataloge
- **P2-6** Landtags-Primärquelle (DIP-Pendant)
- **P2-7** Scoring scharfschalten (E5)

> **Berlin & Brandenburg:** In diesem Thread ausschließlich **strukturell
> vorbereiten** (gekapselter, abgeschalteter Code; Gate parametrisierbar machen).
> **Nicht aktivieren.** Aktivierung = Gründer-Freigabe E4.

### Erst nach dem Bundestagspiloten / bei Skalierung (P3 — Hygiene)

- **P3-1** Retention/Archiv `raw_documents`/`knowledge_objects`
- **P3-2** Briefing→Decision relational verlinken
- **P3-3** Toten V2-KI-Pfad entfernen (nach Bestätigung)
- **P3-4** Einmal-/Migrations-Module nach `scripts/one-off/` archivieren
- **P3-5** Dead-Code-/require-Graph-Scan in CI
- **P3-6** Zwei Erwähnungs-Engines konsolidieren (`radar.js` vs. `radarState.js`)
- **P3-7** `decisions`/`matching_results` bereinigen oder als Output nutzen (E6)
- **P3-8** Cron-Zeitzone/DST entscheiden (**Zeitplan-Freigabe**)
- **P3-9** Boot-Zeit-Env-Selbstcheck
- **P3-10** `document_type`-Befüllung

---

## 10. ⚠️ Ausdrücklicher Hinweis: PR #88 NICHT ungeprüft übernehmen

**Verbindlich:** PR #88 darf **nicht** ungeprüft gemergt, gecherry-pickt oder als
Basis übernommen werden.

| Fakt | Beleg |
|---|---|
| Status | **offen, Draft, nicht gemergt** |
| **Basis-Branch** | **`claude/happy-allen-g5q1ua` — NICHT `main`** (base.sha `e5e85cd`) |
| Head | `claude/helmut-monitoring-haertung-6cfns6` (`3c0e882`), 2 Commits, +1123/−45, 15 Dateien |
| Stapelung | „**Merge-Reihenfolge: erst #84, dann dieser**" — setzt PR #84 voraus, der nicht auf `main` ist |
| Inhalt (überschneidet P0/P1) | `durationMs`-Persistenz (P0-1), `compactStore`-Fix `googleUrlResolution`/`durationMs` (P0-2), `health-watch.yml`/Health-Report-Ausbau (P1-6/P1-7), **Radar-Störungswahrheit (P1-8)** |
| **Radar-Teil bereits live** | Der Radar-Teil wurde **isoliert via PR #89 gemergt** (Commit `3866967`: „PR 88 Radar-Teil isoliert via PR 89 live, Monitoring-Teil offen") |

**Warum das gefährlich ist:**
1. Der Diff von #88 ist gegen `claude/happy-allen-g5q1ua` gerechnet, **nicht gegen
   `main`** — ein direkter Merge/Cherry-Pick auf `main` würde auf falscher Basis
   diffen (es gibt keinen sauberen Merge-Base; HEAD hat 3 Wurzel-Commits).
2. Der **Radar-Teil ist bereits auf `main`** (via PR #89) — ein Übernehmen von #88
   würde ihn **duplizieren oder zurückrollen**.
3. #88 **setzt #84 voraus**, dessen Änderungen nicht garantiert auf `main` sind.

**Verbindliche Vorgehensweise für Thread 2:**
- PR #88 **nur als Referenz-Implementierung lesen** für P0-1, P0-2, P1-6, P1-7
  (die zwei Persistenz-Bugfixes dort sind fachlich korrekt und decken sich mit
  dem Audit).
- Die Fixes **gegen den aktuellen `main`-Stand NEU implementieren und testen**,
  nicht den PR-Diff übernehmen.
- **Vor P1-8** den `main`-Stand von `radar.js`/`radarState.js` prüfen (PR #89) und
  nur die noch fehlende Differenz umsetzen.
- Kein Merge von #88 ohne ausdrückliche Freigabe und vorherige Rebase-Prüfung
  gegen `main`.

---

## Zusammenfassung der Grenzen dieses Threads

- **Kein** Production-Eingriff, **keine** Migration, **keine**
  Production-Datenänderung, **keine** Zeitplan-/Cron-Änderung, **keine**
  Secret-Rotation, **kein** Deployment ohne ausdrückliche Freigabe.
- **Keine** Designänderung an Lage, Radar, Briefing, Büro, Navigation.
- Berlin/Brandenburg: **nur strukturell vorbereiten, nicht aktivieren.**
- **Keine geschätzten Laufzeitwerte** — nur gemessene. Nichts beschönigen.

*Prüfdatum: 2026-07-16 · Commit: `427295c` · Grundlage:
`docs/helmut_datenmotor_audit.md`, `docs/helmut_datenmotor_umsetzungsplan.md`.*
