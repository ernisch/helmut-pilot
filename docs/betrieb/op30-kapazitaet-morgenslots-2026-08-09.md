# OP-30 — Kapazität der Morgenlage: R4-Korrektur und drei Morgenslots

**Sprint 2026-08-09/3 · kanonischer Beleg** · Vorgänger: [`op30-e1-abschlussreview-2026-08-09.md`](op30-e1-abschlussreview-2026-08-09.md)
(unabhängiger Abschlussreview von PR #236) und [`lage-narrativ-warteschlange-2026-08-09.md`](lage-narrativ-warteschlange-2026-08-09.md).

> **Nichts ist aktiviert.** Alle OP-30-Flags bleiben aus, keine Migration wurde angewendet,
> keine Environment-Variable gesetzt, kein Production-Lauf ausgelöst. Was hier steht, ist
> lokal bewiesen und in Production **unbewiesen**.

---

## 0 · Die Kurzfassung

| Frage | Antwort |
|---|---|
| Ist die geerbte doppelte Budgetzählung (R4) behoben? | **Ja.** Ursache lokalisiert, korrigiert, an echter PostgreSQL 16.13 nachgemessen: ein fachlicher Modellaufruf ergibt jetzt `global.used = 1` statt 2. |
| Stimmten die Kapazitätszahlen des Vorreviews (par 2 ≈ 14 · par 4 ≈ 52 · par 8 ≈ 127)? | **Nein, nicht in dieser Form.** Eigene, slotgenaue Messung: par 2 ≈ 39 · par 4 ≈ 88 · par 8 ≈ 179 Narrative je Morgenslot. Der Vorreview war zu pessimistisch und skalierte nicht linear; die Richtung („ein Slot trägt 200 nicht") war richtig. |
| Trägt die heutige Verdrahtung 200 Morgenlagen? | **Nein.** Parallelität 2 + ein Slot: **39 von 200**. |
| Was ist die kleinste sichere Lösung? | Parallelität **8** · Slotbudget **270 s** (wie crawl/pipeline) · **drei** Morgenslots (05:45 / 06:10 / 06:22 UTC) · eigene Zeitgrenze für Narrative (45 s) · gezieltes Leerlaufwarten. |
| Werden damit 200 fertig? | **Ja, im realistischen Szenario: 200 von 200 im Morgenfenster, 59,6 % Kapazitätsreserve** — und in allen vierzehn geprüften Störfällen ohne Verlust und ohne Doppelverarbeitung. |
| Ist das ein Production-Beweis? | **Nein.** Es sind 10 echte Profile vorhanden, nicht 200. Siehe §12. |

---

## 1 · Sicherheitszustand dieses Sprints

Alle Production-Zugriffe waren **rein lesend**. Gegengeprüft am 2026-08-09 (Supabase, MCP):

- `helmut_jobs` und `llm_reservations` existieren in Production **nicht** ⇒ keine OP-30-Migration angewendet.
- `helmut_reserve_llm_result` existiert **nicht**; `helmut_reserve_llm_call` (Bestand seit 20260717) existiert.
- **5 aktive Mandate**, unverändert. `mandate_profiles` enthält **9** Zeilen, davon 4 deaktiviert
  (`james-brown`, `angela-merkel`, `max-mustermann`, `helmut-abnahme-berlin`).
  **Berichtigung:** `CURRENT_STATE.md` §3 führte bisher „insgesamt 8 Profile" — es sind 9;
  `helmut-abnahme-berlin` (angelegt 2026-07-26, deaktiviert) fehlte in der Zählung.
- Seit dem Merge von PR #236 (13:12:54Z) bis zur Prüfung (13:22Z): **0 neue Läufe, 0 KI-Aufrufe**.
  Der nächste reguläre Cron ist 16:00Z — **eine Production-Regression durch PR #236 ist damit
  noch nicht beobachtbar** (dieselbe ehrliche Einschränkung wie beim Merge von PR #233).

Das Deployment des Merge-Commits `0f047b1` ist **READY**
(`dpl_2hdoPoZ6Y2J4iFmBvEFY7itgFgeY`, Commit gegengeprüft).

---

## 2 · Befund R4 — die doppelte Budgetzählung

### 2.1 Reproduktion (echte PostgreSQL 16.13, lokal)

Migrationen `20260717_llm_budget_reservation.sql` + `20260808_llm_budget_fairness.sql` in der
Fassung vor diesem Sprint; ein fachlicher Vorgang (ein Lage-Narrativ für ein Mandat):

```
A fairness  : erlaubt=true global=1 scope=1     -- helmut_reserve_llm_result
B chokepoint: allowed=true used=2               -- helmut_reserve_llm_call (ai.js requestOpenAI)
C ZAEHLER    : scope=global      used=2         -- llm_budget_counters
```

**Ein Aufruf, zwei Buchungen.** Ein Tagesdeckel von 100 hätte bei 50 fachlichen Aufrufen
geschlossen.

### 2.2 Ursache

Zwei Schreiber auf derselben Zeile `llm_budget_counters(day,'global')`:

1. die Fairnessschicht `helmut_reserve_llm_result` (Schritt 3 der alten Fassung) und
2. der Choke-Point `helmut_reserve_llm_call`, den `ai.js requestOpenAI` vor **jedem**
   Modellaufruf ruft — der einzige Ort im gesamten System, an dem ein Modell gerufen wird.

Der Warteschlangenpfad läuft durch **beide**. Der Altpfad nur durch den zweiten — deshalb war
der Fehler ohne aktive Fairness unsichtbar.

### 2.3 Die Korrektur — ein Buch, ein Schreiber

`supabase/migrations/20260808_llm_budget_fairness.sql` (**nicht angewendet**, deshalb in der
Datei selbst korrigiert statt über ein siebtes Paar):

| Buch | Inhalt | Einziger Schreiber |
|---|---|---|
| `llm_budget_counters` | **tatsächlich getätigte** Modellaufrufe des Tages | `helmut_reserve_llm_call` (Choke-Point) |
| `llm_reservations` | **Absichten**: Idempotenz je Ergebnis, Bereichsverbrauch | `helmut_reserve_llm_result` |

- **Belegung des Tagesdeckels** = getätigte Aufrufe + laufende Reservierungen (`status='reserviert'`).
- **Atomarität:** die Reservierung nimmt als Erstes den Row-Lock auf `llm_budget_counters(day,'global')`.
  Über dieselbe Zeile läuft der Choke-Point — damit sind Reservierer untereinander **und** gegen
  den tatsächlichen Aufruf serialisiert. Zwischen Prüfung und Eintrag kann niemand dazwischen.
- **Keine ausgleichende Rücknahme mehr** (kein `used = used - 1`). Genau diese
  Lesen-Ändern-Schreiben-Kompensation ist die Bauform, vor der `CLAUDE.md` §4.10 warnt.
- **Selbstkorrigierend:** scheiterte ein Auftrag *vor* dem Modellaufruf, hat der Choke-Point
  nichts gebucht — die Belegung fällt beim Abschluss von selbst auf den wahren Stand zurück.
  Ein Aufruf, der stattfand und scheiterte, bleibt gebucht (die Kosten sind entstanden).
- **Zukunftssicher:** würde `HELMUT_TENANT_LLM_CAP` je aktiviert, schrieben Fairness und
  Choke-Point in **verschiedene** Bücher — die Doppelzählung kann auf diesem Weg nicht zurückkehren.

Nachher, derselbe Vorgang:

```
A fairness  : erlaubt=true global=1 scope=1
B chokepoint: allowed=true used=1
C ZAEHLER    : scope=global      used=1     ⇐ genau EINE Buchung
```

### 2.4 Befund R4b (neu in diesem Sprint) — ein still wirkungsloser Deckel

Die alte Fassung wertete `p_scope_max` nur für `p_scope <> 'global'` aus. Der App-Code
übergibt für **globale** Arbeit (Verstehen) aber genau dort den `globalerTopf` — die Reserve,
die verhindert, dass das Verstehen den Tagesdeckel leerräumt und die sichtbaren Lage-Narrative
ausfallen. Dieser Deckel wurde berechnet, übergeben und in SQL **verworfen**.

Er gilt jetzt für jeden Bereich, `global` eingeschlossen; die Ablehnung heißt dort
`verstehensanteil-erschoepft` statt `mandantenanteil-erschoepft`, damit ein Betreiber die
beiden Fälle unterscheiden kann. Nachweis: `budgetvertrag-test.js` §18 (5 von 5 Zusagen,
sechste abgelehnt mit dem richtigen Grund).

---

## 3 · Der endgültige Budgetvertrag

Elf Zusagen, jede mit ihrem Beleg. Suite: `scripts/budgetvertrag-test.js`
(**59 PASS / 0 FAIL**, echte PostgreSQL 16.13), Gegenprobe:
`scripts/budgetvertrag-mutationsprobe-test.js` (**6 von 6 Mutationen erkannt**).

| # | Zusage | Beleg |
|---|---|---|
| 1 | Eine fachliche Modellnutzung wird **genau einmal** verbucht | §1.2, §17.5 (10 Zusagen ⇒ 10 Buchungen, nicht 20) |
| 2 | Eine Reservierung ist **noch kein** endgültiger Verbrauch | §9.4 (12 Reservierungen, Zähler steht auf 0) |
| 3 | Ein Cachetreffer ohne Modellaufruf verbraucht **kein** Modellbudget | §2.2/§2.3 (Zähler 0, Reservierung zurückgegeben) |
| 4 | Tatsächlich entstandene Kosten gehen **nicht** verloren | §5.2/§6.2 (Abbruch während/nach dem Aufruf: Buchung bleibt) |
| 5 | Nicht verbrauchtes reserviertes Budget wird nach **klaren Regeln** freigegeben | §4.3 — Rückgabe nur, wenn der Aufrufer beweisen kann, dass kein Aufruf stattfand |
| 6 | Wiederholungen zählen weder doppelt noch verschweigen sie etwas | §7.2/§8.2 (eine Buchung über beide Versuche) |
| 7 | Mandanten- und globales Budget bleiben **atomar** geschützt | §9, §10, §17 — Row-Lock, echte Gleichzeitigkeit |
| 8 | Unbekannte Modelle/Kosten bleiben **sicher geschlossen** | §13.1 (ein unbekanntes Modell verbraucht trotzdem genau einen Slot), §13.2/§14.1 (`kosten-unbekannt`, nie 0,00) |
| 9 | Gleichzeitige Worker erzeugen **keine** Überbuchung | §17.2 (40 echte Prozesse, Deckel 10 ⇒ genau 10) |
| 10 | Alle Kosten bleiben dem **richtigen** Mandat zugeordnet | §1.4, §10.2/§10.3 |
| 11 | Altpfad und ausgeschaltete Flags bleiben **unverändert** | §19.1–§19.4 |

**Die geprüften Fälle** (Sprintauftrag §4, alle 17): normaler Aufruf · Cachetreffer ·
Cachefehler mit Aufruf · Abbruch vor / während / nach der Modellnutzung · Wiederholung vor /
nach der Modellnutzung · konkurrierende Reservierungen · konkurrierende Aufträge eines Mandats ·
ausgeschöpftes Mandantenbudget · ausgeschöpftes globales Budget · unbekanntes Modell ·
unbekannte Kosten · fehlende Nutzungsdaten · bereits abgeschlossener Auftrag ·
40 gleichzeitige Worker gegen einen kleinen Deckel.

**Angepasste Bestandsprüfungen (nicht abgeschwächt, sondern richtiggestellt):**
`scripts/llm-budget-fairness-test.js` prüfte sieben Zusagen an der **rohen Zählerzeile** —
also genau an dem Wert, den R4 falsch machte. Sie messen jetzt die **Belegung**
(getätigt + laufend). Die Zusage ist dieselbe und genauso streng; sie wird nur an der
richtigen Stelle gelesen. Ergebnis: **60 PASS / 0 FAIL** (vorher 52/7).

---

## 4 · Die reale Kapazitätsarchitektur

Fünfzehn Größen, jede mit ihrer Herkunft. **gemessen** = an Production oder echter Datenbank
erhoben · **gelesen** = aus dem Produktionscode · **simuliert** = slotgenaue Rechnung ·
**offen** = erst in Production beweisbar.

| # | Größe | Wert | Herkunft |
|---|---|---|---|
| 1 | Verbindliches Morgenfenster | 05:45–06:30 UTC (07:45–08:30 Berlin) | **abgeleitet** aus dem Produktvertrag (Slot 05:45 UTC); der späteste Zeitpunkt, zu dem eine Morgenlage für ein Büro mit 08:00-Beginn noch eine ist |
| 2 | Vorhandene Cron-Zeitfenster | 11 Einträge (9 Bestand + 2 neu) | **gelesen** `vercel.json` |
| 3 | Maximale Laufzeit je Vercel-Ausführung | 300 s | **gelesen** `vercel.json` `functions.maxDuration` |
| 4 | Tatsächlich verdrahtete Worker | `workerBetrieb.durchlauf` in `narrativSlotLauf` und `runCronUeberWarteschlange` | **gelesen** `server.js` |
| 5 | Reale Parallelität | Default **2**, hart geklemmt 1–8; Morgenslots über `HELMUT_NARRATIV_PARALLEL` | **gelesen** `worker-betrieb.grenzenAusEnv`; gemessen erreicht 8 von 8 |
| 6 | Reservierungsgrenze der Queue | `for update skip locked`, Stapel 10 (1–200) | **gemessen** an echter PostgreSQL: 16 gleichzeitige Reservierer, 60 Aufträge, 0 Überschneidungen |
| 7 | Aufträge je Ausführung | begrenzt durch Slotbudget, nicht durch eine Zahl | **gemessen** 179 im ersten Slot bei 200 Mandaten |
| 8 | Reale Fälligkeitszeiten | alle Narrative 05:45 UTC + 0–1 s (Rotationsrang je 1 ms) | **gelesen** `source-demand.NARRATIV_STREU_MS`; Bestandsprüfung `narrativ-slotvertrag-test.js` |
| 9 | Modelllaufzeit Narrativ | n = 134 · Median **5 033 ms** · p90 7 765 · p95 32 201 · max 471 985 · **8 Fehlschläge (5,97 %)** | **gemessen** Production `llmUsage`, 2026-07-10 bis 2026-08-09, rein lesend |
| 9b | Der entscheidende Zusammenhang | von den **acht** Aufrufen über 20 s war **keiner** erfolgreich; langsamster erfolgreicher Aufruf 20 012 ms | **gemessen**, dieselbe Reihe |
| 10 | Nicht-Modellaufwand je Mandat | ≈ 3 300 ms (42 118 ms für 5 aktive Mandate im Direktpfad minus 5 107 ms Modellmittel) | **gemessen** Production `process_runs` `briefing-lage`, n = 13 |
| 11 | Datenbankaufwand je Auftrag | 150 / 400 / 1 200 ms je Szenario (claim, Vorbedingung, Reservierung, Melden, Abschluss) | **angenommen**, im ungünstigen Szenario dreifach; Störfall 14 misst zusätzlich 250 ms je Zugriff |
| 12 | Wiederholungsquote | 17 von 200 Aufträgen im realistischen Morgen | **simuliert** auf der gemessenen Fehlerreihe |
| 13 | Fehlerquote | 5,97 % je Aufruf | **gemessen** (Punkt 9) |
| 14 | Rückstandsverhalten | Backoff 30 s Basis, verdoppelnd, max. 5 Versuche; `first_due_at` unveränderlich | **gelesen** `scalable-pipeline.backoffMs` + Migration; **gemessen** an echter PostgreSQL |
| 15 | Sicherheitsreserve | **59,6 %** der angebotenen Workerzeit bei 200 Mandaten | **simuliert**, Definition: 1 − benötigte/angebotene Workerzeit (Reserve gegen **Arbeitslast**, nicht gegen Mandatszahl — Befund B16) |

### 4.1 Warum die Zahlen des Vorreviews nicht übernommen wurden

Der Abschlussreview von PR #236 nannte „ein Morgenslot trägt realistisch par 2 ≈ 14 ·
par 4 ≈ 52 · par 8 ≈ 127". Eigene Reproduktion mit slotgenauer Simulation auf derselben
Production-Messreihe:

| | par 2 | par 4 | par 8 |
|---|---|---|---|
| Vorreview (ein Morgenslot) | ~14 | ~52 | ~127 |
| **Diese Messung (ein Morgenslot, 270 s)** | **39** | **88** | **179** |

Zwei Unterschiede sind belegbar: (a) die Vorreview-Zahlen skalieren **nicht linear** mit der
Parallelität, obwohl jeder Worker sein eigenes Zeitbudget hat — 14 → 52 → 127 statt 14 → 28 → 56;
(b) das Slotbudget lag dort bei 230 s statt 270 s. Die **Richtung** des Vorreviews war richtig
und wird bestätigt: **ein Morgenslot trägt 200 Mandate in keiner Parallelität.**

---

## 5 · Die gewählte Lösung — und was jedes Element beiträgt

| Element | Wo | Wirkung | Freigabe nötig? |
|---|---|---|---|
| **Parallelität 8** in den Morgenslots | `HELMUT_NARRATIV_PARALLEL` (neu) | 39 → 179 Narrative je Slot | **ja** (Vercel-Env) |
| **Slotbudget 270 s** statt 230 s | `server.js narrativSlotGrenzen` | 199 → 200 von 200; dieselbe Marge zu `maxDuration 300`, die crawl/pipeline seit jeher fahren | nein (Code) |
| **Zwei zusätzliche Morgenslots** 06:10 / 06:22 UTC | `vercel.json`, Route `/api/cron/lage-briefing-nachlauf` | trägt Wiederholungen und Rückstand; hebt die Reserve von 39,5 % auf 59,6 % | **ja** (Deployment) |
| **Eigene Zeitgrenze 45 s** für `tenant_narrative` | `scalable-pipeline.TYP_ZEITGRENZE_MS` | nimmt einem hängenden Auftrag 75 s Slotzeit; kostet in der gemessenen Reihe **kein** Narrativ (§4, Punkt 9b) | nein (Code) |
| **Leerlaufwarten 20 s**, nur bei eigener Zurückstellung | `scalable-pipeline.arbeite`, Default **0 = aus** | fängt Wiederholungen ab, die kurz nach Slotende fällig würden | nein (Code, Default aus) |

### 5.1 Warum eine EIGENE Parallelitätsvariable

`HELMUT_WORKER_PARALLEL=8` global zu setzen wäre der naheliegende Weg — und er hätte einen
unerwünschten Nebeneffekt: dieselbe Variable steuert die Worker der **Crawl-/Pipeline-Slots**,
und dort läuft `source_fetch` gegen die Google-Drosselung. Der Code sagt das ausdrücklich
(„mehr Worker helfen dort nicht, sie schaden"). `HELMUT_NARRATIV_PARALLEL` hebt deshalb
ausschließlich die Morgenslots an. Ohne die Variable gilt unverändert der allgemeine Wert;
die harte Klemmung 1–8 gilt für beide Wege.

### 5.2 Warum eine EIGENE Route für die Nachlaufslots

Ein zweiter Zeiteintrag auf `/api/cron/lage-briefing` wäre kürzer — und **falsch**: bei
ausgeschalteten Flags liefe dort die bestehende Direktschleife, und die zusätzlichen Slots
würden die **bestehende Production-Verarbeitung verdoppeln**. Die neue Route hat **keinen
Altpfad**. Drei Riegel, in dieser Reihenfolge und **vor** jedem Datenbankschreibzugriff und
jedem Modellaufruf:

1. `authorizeCron` (fail closed: 503 ohne Secret, 403 bei falschem Secret),
2. `narrativUeberWarteschlange()` — **beide** Flags müssen an sein,
3. die Flaggrenze im Handler selbst.

Ein versehentlich ausgelöster Slot bei ausgeschalteten Flags schreibt **nichts**: keine
Lauftelemetrie, keine Warteschlangenzeile, kein Modellaufruf. Nachgewiesen an der **echten
HTTP-Route** (`morgenslot-idempotenz-test.js` §B12–B12d, vier Flagkombinationen).

### 5.3 Warum drei und nicht zwei Morgenslots

Zwei Slots erfüllen die Abnahme im **realistischen** Szenario (200/200, 39,5 % Reserve).
Das **ungünstige** Szenario entscheidet über die Rückfallbedingungen — und dort reichen zwei
nicht:

| Störung (200 Mandate) | 2 Slots | 3 Slots |
|---|---|---|
| normaler Morgen | 200/200 · 39,5 % | 200/200 · **59,6 %** |
| 10 % fehlerhafte Quellen | 199/200 · 46,6 % | **200/200** · 64,3 % |
| dreifach langsame Modellantworten | **180/200** · 3,6 % | **200/200** · 28,5 % |
| erster Morgenslot fällt vollständig aus | **179/200** · 3,3 % | **200/200** · 39,5 % |
| Rückstand 40 aus dem Vortag | 240/240 · 43,7 % | 240/240 · 62,4 % |

Der dritte Slot kostet **eine Zeile in `vercel.json`** — keine neue Route, keinen neuen Code,
keine zusätzlichen Modellaufrufe (es sind dieselben 200 Narrative, nur mehr Gelegenheiten).
Ein Slot ohne fällige Arbeit endet in Millisekunden.

---

## 6 · Konkurrenzschutz — keine doppelte Morgenlage

Suite `scripts/morgenslot-idempotenz-test.js` (**26 PASS / 0 FAIL / 1 OFFEN**), geprüft an
echter PostgreSQL **und** an der echten HTTP-Route.

| Zusage | Beleg |
|---|---|
| Atomare Reservierung | 16 gleichzeitige Reservierer (= zwei Slots × acht Worker), 60 Aufträge, **0 Überschneidungen** |
| Eindeutige fachliche Job-Identität | vier Einreihungen desselben Mandats/Fensters ⇒ **eine** Zeile |
| Idempotenz über Mandat, Typ, Zeitraum | ein anderes Fenster ist eine andere Absicht und wird angenommen |
| Keine Doppelveröffentlichung bei verschiedenen technischen Kennungen | zwei technisch verschiedene Aufträge für dieselbe Morgenlage ⇒ **ein** Modellaufruf, **eine** Veröffentlichung |
| Sichere Konkurrenz mehrerer Worker | kein Auftrag bei zwei Haltern gleichzeitig |
| Sichere Konkurrenz beider Morgenslots | beide gleichzeitig gestartet ⇒ beide Aufträge sauber abgeschlossen |
| Wiederanlauf nach Abbruch | **kein** zweiter Modellaufruf (Tagescache), Auftrag trotzdem erledigt |
| Abgelaufene Reservierung | der nächste Slot nimmt den Auftrag wieder auf, `attempts = 2` — der Abbruch bleibt sichtbar |
| Verspäteter erster Slot | ein noch nicht fälliger Auftrag wird von **keinem** Slot vorgezogen; `first_due_at` bleibt unverändert (Rückstand ist nicht löschbar) |
| Gleichzeitiger Start beider Slots | siehe oben |
| Teilweise angewendete Migration | ohne `20260809_jobqueue_narrativ` wird der Typ **sichtbar abgelehnt** (`helmut_jobs_type_chk`), nicht stillschweigend eingereiht |
| Trennung Altpfad / OP-30-Pfad | bei ausgeschalteten Flags läuft `lage-briefing` unverändert den Direktpfad; der Nachlaufslot startet nichts |

**Die Aufteilung der Arbeit zwischen den Slots ist keine eigene Mechanik** — sie fällt aus der
atomaren Reservierung. Beide Slots ziehen aus derselben Warteschlange, `helmut_claim_jobs`
reserviert mit `for update skip locked`. Eine Partitionierung wäre zusätzliche Mechanik ohne
zusätzliche Sicherheit.

---

## 7 · Messwerte

Suite `scripts/morgenkapazitaet-test.js` (**62 PASS / 0 FAIL / 4 OFFEN**), Fixture
`scripts/fixtures/morgenslot.js`. Verdrahtung: Parallelität 8, drei Slots (05:45/06:10/06:22 UTC),
Slotbudget 270 s, realistisches Szenario.

*(Die vollständige Tabelle steht im Testlauf; hier die entscheidungsrelevanten Zeilen.)*

### 7.1 Stufen

| Mandate | fertig | im Fenster | verspätet | offen | Reserve | letzte Fertigstellung |
|---|---|---|---|---|---|---|
| 5 | 5/5 | 5 | 0 | 0 | 94,6 % | 00:40 nach Slotbeginn |
| 25 | 25/25 | 25 | 0 | 0 | 89,3 % | — |
| 50 | 50/50 | 50 | 0 | 0 | 84,8 % | — |
| 100 | 100/100 | 100 | 0 | 0 | 76,3 % | — |
| **200** | **200/200** | **200** | **0** | **0** | **59,6 %** | 27:12 nach Slotbeginn |
| 1 000 (Stress) | 586/1 000 | 586 | 0 | 414 | 1,6 % | Überlast, **ehrlich als Rückstand gemeldet** |

### 7.2 Die vierzehn Störungen bei 200 Mandaten

In **allen vierzehn**: kein Auftrag doppelt, kein Auftrag verloren, keine Budgetverletzung.
Vollständig im Morgenfenster fertig wurden zwölf von vierzehn; die zwei Ausnahmen sind
**strukturell** und werden benannt:

- **gleichzeitige Budgetknappheit** (Deckel 230 bei 200 Mandaten): 115 von 200. Der Deckel
  hält, der Rest wird als offen gemeldet — genau das ist die gewünschte Wirkung.
- **1 000 Mandate**: 586 von 1 000. Überlast, ehrlich als Rückstand.

### 7.3 Die drei Szenarien

Für die **Abnahme** gilt das realistische. Das ungünstige bestimmt die Rückfallbedingungen
(§11) und die Alarmgrenzen.

---

## 8 · Kosten

| Stufe | USD je Morgen | USD je Mandat/Morgen | hochgerechnet USD je Mandat/Monat |
|---|---|---|---|
| 5 | 0,0065 | 0,001307 | 0,039 |
| 25 | 0,0327 | 0,001307 | 0,039 |
| 50 | 0,0654 | 0,001307 | 0,039 |
| 100 | 0,1307 | 0,001307 | 0,039 |
| 200 | 0,2614 | 0,001307 | 0,039 |

**Preisgrundlage ausdrücklich:** 0,001307 USD je erfolgreichem Narrativ ist der Mittelwert der
126 bepreisten Production-Aufrufe (ausschließlich `gpt-5-mini`) — eine **Messreihe, kein
Anbieterpreis**. Fehlgeschlagene Aufrufe sind **unbekannte** Kosten und werden nie als 0
geführt. Diese Zahlen decken **nur das Lage-Narrativ** ab; das Verstehen (der größere Posten)
steht unverändert in [`skalierung-200-mandate.md`](skalierung-200-mandate.md).

Die Kosten je Mandat sind über alle Stufen **konstant** — es gibt kein verstecktes Wachstum.

---

## 9 · Plattformgrenzen

| Grenze | Stand | Belegt durch |
|---|---|---|
| Cron-Einträge | 9 laufen heute, 11 nach diesem PR | `vercel.json`; 9 gleichzeitige Einträge laufen in Production |
| `maxDuration` 300 s | aktiv | `vercel.json`, Production-Läufe bis 265 s belegt |
| Mehrere Zeitpläne je Pfad | erlaubt | Vercel-Dokumentation („Configure multiple cron schedules in vercel.json") |
| Tarif | **Team-Konto** („Nohut"); 9 Crons und `maxDuration 300` laufen bereits — beides ist erst ab Pro möglich | Vercel-API `list_teams`/`list_deployments` |
| Parallelität 8 in EINER Ausführung | acht gleichzeitige Modellaufrufe in einem Node-Prozess, keine acht Ausführungen ⇒ kein Nebenläufigkeitslimit berührt | Code gelesen; **in Production nicht gemessen** (§12) |

**Ehrlich:** die exakte tarifliche Obergrenze der Cron-Anzahl war aus dieser Sitzung **nicht
auslesbar** (weder API noch die durchsuchte Dokumentation nennen sie). Belegt ist nur: neun
Einträge laufen. Ein Sprung von 9 auf 11 ist eine gewöhnliche Erweiterung; der Betreiber sieht
im Vercel-Dashboard sofort, ob sie angenommen wird. **Das ist keine Blockade, aber auch keine
Zusage** — sie wird beim Deployment des PR sichtbar, ohne dass irgendetwas aktiviert wird
(die Slots laufen dann bereits, tun aber bei ausgeschalteten Flags nichts).

---

## 10 · Aktivierungsplan

> **Abgrenzung (ergänzt 2026-08-24).** Dieser Plan ist der **Slot-Stufenplan** — er staffelt
> **Mandatszahlen** (5 → 200), Morgenslots und Worker-Parallelität. Er ist **nicht** die
> Quelle für den **siebentägigen Nachweis des Ereignis-Antriebs** (Warteschlange als Auslöser);
> die „7 Tage" in der Tabelle sind der Beobachtungszeitraum der **Mandatsstufe 25**. Der
> Nachweis des Ereignis-Antriebs mit den fünf bestehenden Mandaten steht in
> [`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §14 **Stufe 2**;
> der Vorlauf dazu in [`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) §31.
> Beides wurde mehrfach verwechselt.

**Kein Schritt wird automatisch ausgeführt. Jede Stufe ist eine eigene Freigabe.**
Der Plan unterscheidet vier Dinge, die gern verwechselt werden:
**(a) technische Grundlage** — was im Repository liegt und lokal bewiesen ist;
**(b) lokale Simulation** — die Zahlen dieses Belegs;
**(c) kontrollierter Production-Nachweis** — Messung an echten Mandaten;
**(d) allgemeine SaaS-Bereitschaft** — OP-01 bis OP-04, davon unabhängig.

| | **Stufe 1: 5** | **Stufe 2: 25** | **Stufe 3: 50** | **Stufe 4: 100** | **Stufe 5: 200** |
|---|---|---|---|---|---|
| **Flags** | keine (heutiger Betrieb) | `HELMUT_SCALABLE_PIPELINE=on` | + unverändert | + `HELMUT_LLM_FAIRNESS=on` | + `HELMUT_NARRATIV_QUEUE=on` |
| **Migration** | keine | alle sechs Paare | angewendet | angewendet | angewendet |
| **Worker-Parallelität** | 2 (Default) | 2 | 4 (`HELMUT_NARRATIV_PARALLEL`) | 4 | **8** |
| **Cron-Slots** | 1 (05:45) | 1 | 2 (+06:10) | 2 | **3** (+06:22) |
| **Beobachtungszeitraum** | — | 7 Tage | 7 Tage | 14 Tage | **14 Tage** |
| **Erwartete Laufzeit** | ~42 s | < 60 s | < 120 s | < 200 s | Slot 1 ~267 s, Slot 2/3 Rest |
| **Erwartete Kosten (Narrativ)** | 0,007 USD/Tag | 0,033 | 0,065 | 0,131 | **0,261 USD/Tag** |
| **Pflichtmetriken** | — | `process_runs` Status/Dauer · `helmut_job_metrics` Rückstand · `llm_budget_counters.global` | + Rückstandsalter | + Bereichsverbrauch je Mandat · Fairness min/max | + rechtzeitige Mandate je Morgen · p95 Fertigstellung |
| **Abnahmekriterien** | unverändert grün | 3 Tage in Folge alle Mandate im Fenster, 0 doppelte, 0 verlorene, Deckel nicht erreicht | dito | dito + `global.used` = Zahl der fachlichen Aufrufe (R4-Gegenprobe in Production) | dito + **≥ 25 % Reserve** gemessen |
| **Rückfallbedingungen** | — | ein Mandat ohne Morgenlage · ein doppeltes Narrativ · Deckel erreicht · Slot > 280 s | dito | dito | dito + Reserve < 25 % an zwei Tagen |
| **Rückfallvorgang** | — | Flag `off` + Redeploy (Direktschleife übernimmt sofort); Migration bleibt liegen — sie ist wirkungslos ohne Flag | dito | dito | dito, zusätzlich `HELMUT_NARRATIV_PARALLEL` löschen |
| **Entscheidung für die nächste Stufe** | Betreiber | Betreiber nach Auswertung | Betreiber | Betreiber | Betreiber |

**Vor Stufe 2 zwingend:** die sechs Migrationspaare anwenden (freigabepflichtig) und
**OP-25 vollständig wiederholen** — eine Aktivierung verändert `quellenVereinigung`, die
K2.1-Sichtbarkeitsmengen und die Laufzeitbilanz.

**Vor Stufe 5 zwingend:** 190 fehlende echte Profile. Es gibt 10.

---

## 11 · Rückfallbedingungen und Alarmgrenzen

Abgeleitet aus dem **ungünstigen** Szenario:

| Beobachtung | Grenze | Handlung |
|---|---|---|
| Mandate ohne Morgenlage bis 06:30 UTC | > 0 | Stufe halten, Ursache klären |
| Kapazitätsreserve | < 25 % an zwei aufeinanderfolgenden Tagen | Stufe zurück |
| Slotdauer | > 280 s | Parallelität senken oder Stufe zurück |
| Rückstand nach dem letzten Morgenslot | > 5 % der Mandate | Stufe zurück |
| `global.used` gegen die Zahl der fachlichen Aufrufe | Abweichung > 0 | **sofort** Flag `off` (R4 wäre zurück) |
| Doppelte Veröffentlichung | ≥ 1 | **sofort** Flag `off` |
| Endgültig fehlgeschlagene Narrativaufträge | > 1 % | Ursache klären, Stufe halten |

---

## 12 · Was dieser Sprint ausdrücklich NICHT beweist

1. **Production-Verhalten.** Alle Kapazitätszahlen stammen aus einer Simulation mit
   gemessenen Eingangsgrößen. Ob Production sich so verhält, weiß erst der stufenweise Nachweis.
2. **190 fehlende echte Profile.** Es gibt 10 Profile, 5 aktiv. Echte Profile haben mehr
   Quellen, mehr Vorgänge und andere Laufzeiten als synthetische.
3. **Der wirksame Production-Tagesdeckel** (`HELMUT_MAX_LLM_CALLS_PER_DAY`) ist aus einer
   Sitzung nicht lesbar (Vercel-Env, Egress `CONNECT → 403`).
4. **Vercel bei Parallelität 8**: acht gleichzeitige Modellaufrufe in **einer** Ausführung sind
   lokal geprüft, in Production nicht gemessen (Speicher, Netzgrenzen der Funktion).
5. **Die echten Google-/Quellenlaufzeiten** unter 200 Mandaten. Die Morgenslots berühren sie
   nicht (das Narrativ ruft kein Google), die vorgelagerten Abrufe schon — das ist OP-30s
   ursprünglicher Befund und **unverändert offen**.
6. **Der Nutzen des dritten Slots** ist simuliert, nicht gemessen.

---

## 13 · Testergebnisse dieses Sprints

| Suite | Ergebnis |
|---|---|
| `budgetvertrag-test.js` (echte PostgreSQL 16.13, 17 Fälle) | **59 PASS / 0 FAIL** |
| `budgetvertrag-mutationsprobe-test.js` (6 Mutationen) | **7 PASS / 0 FAIL** — jede Mutation erkannt |
| `morgenkapazitaet-test.js` (Stufen, 3 Szenarien, 14 Störungen, Stress) | **62 PASS / 0 FAIL / 4 OFFEN** |
| `morgenslot-idempotenz-test.js` (echte PostgreSQL + echte HTTP-Route) | **26 PASS / 0 FAIL / 1 OFFEN** |
| `op30-migrationskette-test.js` (sechs Paare, 12 Belege) | **31 PASS / 0 FAIL** |
| `llm-budget-fairness-test.js` (angepasst auf die korrigierte Buchführung) | **60 PASS / 0 FAIL** |
| `narrativ-slotvertrag-test.js` (nach dem Umbau nachgezogen) | **66 PASS / 0 FAIL** |
| `scalable-pipeline-flag-test.js` (Cronprüfungen ehrlich umgestellt) | **55 PASS / 0 FAIL** |
| `env-inventar-test.js` (drei neue Variablen) | **38 PASS / 0 FAIL** |

Vollständiger Offline-Lauf und Baselinevergleich: siehe PR-Beschreibung und
[`CURRENT_STATE.md`](../CURRENT_STATE.md) §7a.

### 13.1 Befund R6 — das Flakerisiko des 1000-Mandate-Stresstests

`narrativ-stress-1000-test.js` brauchte auf `origin/main` **174,6 s** gegen das **180-s**-Limit
des kanonischen Runners — ein Abstand von 3 %. Ein CPU-Profil zeigt, wo die Zeit blieb: der
größte Einzelposten des **Testgerüsts** war `offeneVorbedingungen` (22,6 s), gefolgt von
`claim` und der Speicherbereinigung. Der zweitgrößte Posten insgesamt ist die deterministische
Hashbildung (`crypto`) — die gehört zur **geprüften Fachlogik** und wurde **nicht angefasst**.
Behoben wurde ausschließlich das Gerüst:

- `finish` suchte die betroffene Zeile mit `q.alle().find(...)` — das baut je Abschluss ein
  neues Array über **alle** Zeilen. Bei ~12 000 Zeilen und ~12 000 Abschlüssen sind das über
  10⁸ Objektkopien allein für die Buchhaltung. Ersetzt durch einen `Map`-Zugriff.
- Die Auswertung je Takt baute **vier** vollständige Arrays; jetzt ein Durchlauf.
- `claim` rief `Date.parse` **innerhalb** des Sortiervergleichs — bis zu 3·m·log(m)
  Zeichenkettenanalysen je Reservierung. Jetzt wird jeder Sortierschlüssel genau einmal
  berechnet (decorate–sort–undecorate), Feld für Feld dieselbe Reihenfolge.
- `offeneVorbedingungen` baute **sechs** vollständige Arrays über alle Zeilen (einmal filtern,
  fünfmal zählen) und verglich mit `Array.includes`. Es wird **einmal je Auftrag** gerufen —
  bei über 12 000 Aufträgen auf über 12 000 Zeilen. Jetzt: ein Durchlauf, `Set`-Vergleiche,
  keine Zwischenarrays.

**Ergebnis: 174,6 s → 140,5 s** (−19,5 %); der Abstand zum Runnerlimit wächst von 3 % auf 22 %.
Die ausgegebenen Kennzahlen des Laufs (Aufträge, Narrative, erstes/letztes Narrativ, Kosten)
sind vorher und nachher **zeichengleich** — die Belastung ist nachweislich dieselbe.

Unverändert bleiben: Mandatszahl (1 000 + 100 deaktivierte + 50 neue), Störprofil
(5 % Fehler, 2 % Rate Limits, 3 % Timeouts, Drosselung 0,1, Anbieterausfall, Absturz in
Stunde 6, doppelter Scheduler, Vorlaufrückstand 1 000, großes Mandat), Deckel, Zeitraum und
**alle Prüfungen**. Die Verhaltensgleichheit der Attrappe mit der echten Datenbank prüft
`jobqueue-vertrag-test.js` weiterhin (**108 PASS / 0 FAIL**).
