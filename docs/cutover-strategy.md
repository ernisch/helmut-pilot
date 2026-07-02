# Helmut Core V3 — C10: Cut-Over-Strategie

**Datum:** 2026-07-02
**Status:** Plan (kein Produktionscode). Definiert, WIE V3 später sicher an das
Frontend geht — ohne Big-Bang, jederzeit rücknehmbar.
**Grundhaltung:** Strangler-Fig (Option B aus dem Engine-Plan). Additive Tabellen
neben dem Blob, ein Adapter hält den bestehenden `/api/app/start`-Vertrag, jeder
Schritt ist flag-gated und einzeln rückrollbar.

> Leitsatz: **Der Frontend-Vertrag ist heilig.** `client.js` filtert Items still
> weg (`linkType != 'direct'`) und rechnet die Entscheidung selbst nach
> (`score >= 60` / `>= 40`). Ein Cut-Over, der diesen Vertrag verletzt, bricht
> **lautlos** — deshalb ist der Contract-Snapshot-Test (C2) das Sicherheitsnetz
> für jeden einzelnen Schritt hier.

---

## 0. Vorbedingungen (müssen grün sein, bevor Cut-Over beginnt)

- **C2 Contract-Snapshot-Test** grün: `npm run test:contract`.
- **P1 Security-Check** grün: `npm run test:p1` (inkl. C7a/C7b/C7c-Checks).
- **Goldset-Test** grün: `npm run test:goldset`.
- **C8** (echter Understanding-KI-Call) liefert valide `knowledge_objects` im
  Schatten (Goldset als Regressionsnetz).
- Genügend `knowledge_objects` + `decisions`/`matching_results` im Schatten, dass
  ein V3-Briefing für den Testnutzer überhaupt gefüllt ist.

---

## 1. Vier Bausteine des Cut-Over

Alle vier sind **eigene, später zu setzende Flags** (Default AUS). Sie existieren
in diesem Dokument als Plan — der Code kommt in späteren, kleinen Commits.

### 1a. Dual-Write — V3 schreibt parallel zu V2
**Flag (geplant):** `HELMUT_V3_DUAL_WRITE`

- Bei jedem Schreibpfad, den V2 heute nutzt (`saveBriefing`, `saveTask`,
  `savePersonalizedRecommendations`, …), schreibt V3 **zusätzlich** in seine
  Tabellen (`briefings`, `decisions`, `matching_results`, …).
- V2 bleibt die **Quelle der Wahrheit**; V3 schreibt nur mit.
- Fehler im V3-Zweig dürfen den V2-Zweig **nie** beeinflussen (try/catch, fail-safe,
  wie die C5-Storage-Funktionen: `skipped` statt throw).
- Zweck: V3-Tabellen mit echten Daten füllen, damit Read-Through/Monitoring etwas
  zum Vergleichen haben — ohne dass der Nutzer etwas merkt.
- **Rückrollen:** Flag aus → V3 schreibt nicht mehr mit, V2 unberührt.

### 1b. Canary-User — 1 % der Nutzer bekommen V3
**Flags (geplant):** `HELMUT_V3_READ_THROUGH` + `HELMUT_V3_CANARY_PERCENT` (Default 0)

- Deterministische Zuordnung, damit ein Nutzer **stabil** in derselben Kohorte
  bleibt (kein Flackern zwischen Requests):
  `bucket(userId) = (sha256(userId) mod 100) < CANARY_PERCENT`.
- Start: `CANARY_PERCENT=1` (≈ 1 %). Danach 5 → 25 → 50 → 100, jeweils erst nach
  grünem Monitoring-Fenster.
- Der **eine Testnutzer** (Pilot) kann per Allowlist immer in die Canary-Gruppe
  gezwungen werden (`HELMUT_V3_CANARY_USERS=<id>`), unabhängig vom Prozentsatz.
- **Rückrollen:** `CANARY_PERCENT=0` → sofort wieder 100 % V2.

### 1c. Read-Through — API versucht V3, Fallback V2
**Flag (geplant):** `HELMUT_V3_READ_THROUGH`

- Nur für Canary-Nutzer aktiv. Ablauf im `/api/app/start`-Handler:
  1. V3-Adapter `toBriefingContractV3(...)` bauen (bestehende Item-Felder +
     DIP-`linkType='direct'`).
  2. Ergebnis gegen den Contract validieren (dieselbe Prüfung wie C2:
     Feldnamen, `decision`/`priorityType`-Enums, `score`↔`decision`-Schwelle).
  3. **Gültig** → V3-Antwort ausliefern. **Ungültig oder leer oder Fehler** →
     transparent auf V2 zurückfallen (der Nutzer bekommt immer eine Antwort).
- Der Fallback ist **fail-safe**: V3 darf nie einen 5xx verursachen, den V2 nicht
  auch gehabt hätte.
- **Rückrollen:** Flag aus → alle Nutzer lesen V2.

### 1d. Monitoring — V2 vs. V3 (gleiche Anfrage, gleiche Antwort)
**Flag (geplant):** `HELMUT_V3_SHADOW_COMPARE`

- Für Canary-Nutzer (oder eine kleine Stichprobe): V2 UND V3 für **dieselbe**
  Anfrage berechnen, V2 ausliefern, beide vergleichen, Diff loggen.
- Verglichen wird der **vertragsrelevante** Teil (nicht Byte-Gleichheit):
  - gleiche Menge/Reihenfolge der ausgelieferten Items (nach `hasPreciseSource`-Filter),
  - identische `decision`- und `priorityType`-Werte pro Item,
  - `score`-Abweichung innerhalb Toleranz und **nie** über eine Client-Schwelle
    (`>=60`/`>=40`) hinweg kippend (das würde die Client-Entscheidung ändern).
- Metriken: `v3_match_rate`, `v3_decision_mismatch`, `v3_missing_items`,
  `v3_extra_items`, `v3_error_rate`, `v3_latency_ms`. Ablage additiv (z. B.
  `pipelineDebugReports` / eigene Zeile), **ohne** Prompt-/PII-Inhalte.
- **Gate:** Prozentsatz erst erhöhen, wenn `decision_mismatch ≈ 0` und
  `error_rate` nicht über V2 liegt.
- **Rückrollen:** Flag aus → keine Doppelberechnung mehr.

---

## 2. Reihenfolge (jeder Schritt einzeln rücknehmbar)

1. **Dual-Write an** (`HELMUT_V3_DUAL_WRITE=1`) → V3-Tabellen füllen sich. Kein
   Nutzer sieht V3. Beobachten: schreibt V3 sauber, keine V2-Regression?
2. **Monitoring an** (`HELMUT_V3_SHADOW_COMPARE=1`, 0 % Canary) → V2 vs. V3
   vergleichen, ohne dass jemand V3 sieht. Diffs analysieren, Motor kalibrieren,
   bis `decision_mismatch ≈ 0`.
3. **Read-Through + Canary 1 %** (`HELMUT_V3_READ_THROUGH=1`, `CANARY_PERCENT=1`)
   → erste echte Nutzer lesen V3, Fallback bleibt scharf.
4. **Hochfahren** 1 → 5 → 25 → 50 → 100 %, jede Stufe nur nach grünem
   Monitoring-Fenster (z. B. 48 h ohne Mismatch/Fehleranstieg).
5. **100 % + stabil** → `HELMUT_V3_STORE`/Read-Through als Default, V2-Lesepfad
   bleibt als Fallback erhalten, bis mehrere Wochen stabil.
6. **Aufräumen (späterer Commit, nicht Teil des Cut-Over):** erst wenn V3 dauerhaft
   trägt, toten Code + Hardcodes entfernen (`scoring.ts`, `briefingEngine.ts`,
   `mockData.ts`, `types.ts`, `prompts.ts`, Cem-Ince-Hardcodes, Doppel-Scoring).

**Not-Aus (jederzeit):** jedes Flag einzeln auf AUS. Reihenfolge im Zweifel:
`CANARY_PERCENT=0` (Nutzer sofort zurück auf V2) → `READ_THROUGH` aus →
`SHADOW_COMPARE` aus → `DUAL_WRITE` aus. Danach ist der Zustand exakt wie vor C10.

---

## 3. Der Contract-Test als Equivalenz-Orakel

Der bestehende [contract-snapshot-test.js](../scripts/contract-snapshot-test.js)
friert die heutige V2-Antwort ein. Für den Cut-Over wird er (in einem späteren
Commit) zum **Vergleichswerkzeug** erweitert, ohne die bestehende Prüfung zu ändern:

- **Gleiche Eingabe → gleiche vertragsrelevante Ausgabe:** denselben Testnutzer
  einmal durch V2 und einmal durch den V3-Adapter schicken und die
  vertragsrelevanten Felder vergleichen (Items, `decision`, `priorityType`,
  `score`-Schwellen). Das ist die maschinelle Form von „gleiche Anfrage, gleiche
  Antwort" aus 1d.
- Solange der V3-Adapter (C9) noch nicht existiert, bleibt der Test unverändert
  grün und schützt nur den V2-Vertrag.

---

## 4. Sinnvolle Tests für C10 (Vorschlag, kommen mit dem jeweiligen Code)

Diese Tests gehören zu den späteren Commits, die die obigen Flags einführen —
**nicht** in diesen Plan-Commit (hier gibt es bewusst keinen Code):

- **Bucketing deterministisch:** `bucket(userId)` ist stabil über viele Aufrufe;
  `CANARY_PERCENT=0` → niemand in Canary; `=100` → alle; grobe Gleichverteilung.
- **Read-Through-Fallback fail-safe:** V3 wirft/liefert leer → Antwort == V2, kein
  5xx (in P1, offline, mit gemocktem V3-Zweig).
- **Dual-Write fail-safe:** V3-Schreibfehler lässt den V2-Schreibpfad unberührt
  (V2-Ergebnis unverändert, V3 meldet `skipped`).
- **Monitoring-Diff:** identische V2/V3-Eingaben → 0 Mismatch; künstlich geänderte
  `decision` → Mismatch wird erkannt und gezählt.
- **Flags AUS = No-Op:** alle vier Flags aus → Verhalten exakt wie heute (analog zu
  den bestehenden C5/C6/C7a-„Flag aus → inert"-Checks in P1).

---

## 5. Zusammenfassung

| Baustein | Flag (geplant, Default AUS) | Rückrollen |
|---|---|---|
| Dual-Write | `HELMUT_V3_DUAL_WRITE` | Flag aus → nur V2 schreibt |
| Canary | `HELMUT_V3_CANARY_PERCENT` (+ `_USERS`) | `=0` → 100 % V2 |
| Read-Through | `HELMUT_V3_READ_THROUGH` | Flag aus → alle lesen V2 |
| Monitoring | `HELMUT_V3_SHADOW_COMPARE` | Flag aus → keine Doppelberechnung |

Kein Schritt fasst das Frontend an. Jeder Schritt ist einzeln flag-gated und
rücknehmbar. Der Contract-Test bleibt in jeder Stufe das Netz, das einen stillen
Vertragsbruch sofort sichtbar macht.
