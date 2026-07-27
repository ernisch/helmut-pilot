# Incident 2026-07-27 — Crawl läuft ins 300-Sekunden-Funktionslimit

**Status:** Ursache **bewiesen und quantifiziert** · Reparatur implementiert + offline getestet ·
**NICHT deployt** (Merge/Deploy freigabepflichtig) · **Keine Production-Schreibzugriffe** in diesem
Sprint (ausschließlich lesende `SELECT`s gegen `ddckuvvpcytqbyfmbvie` + Vercel-Runtime-Logs).

**Branch:** `claude/pipeline-143-stabilisierung` · **Basis:** `main` @ `bc333cb` (nach #142/#143)

---

## 1 · Kurzfassung für Nicht-Entwickler

Der nächtliche Crawl bricht seit dem Deployment von **PR #143** nach fünf Minuten ab. Nicht, weil
etwas kaputt ist — sondern weil die Arbeit nicht mehr in die Zeit passt, die eine Vercel-Funktion
hat.

PR #143 hat einen echten Fehler behoben: zurückgestellte Themen gingen früher lautlos verloren.
Die Lösung merkt sie jetzt **alle** vor. Das ist richtig — aber es sind mehrere hundert je Lauf,
jeder braucht zwei Schreibvorgänge in die Datenbank, und **dieser Arbeitsschritt war der einzige
in der ganzen Kette ohne Zeitgrenze**.

Die eigentliche Folge ist nicht der Abbruch selbst. Die Quellen-Telemetrie wird als **allerletzte**
Anweisung des Laufs geschrieben — der Lauf stirbt vorher. Seit dem 26.07., 20:00 UTC steht
deshalb **keine einzige neue Telemetriezeile** in der Datenbank. Helmut ist für seine eigene
Datenzufuhr blind geworden, obwohl Briefings und Lage weiter funktionieren.

**Was NICHT betroffen ist:** die Morgenbriefings liefen heute für alle sechs Mandate, der
Understanding-Cron arbeitet den Rückstand ab, und die Reparatur aus #143 tut nachweislich das,
was sie versprochen hat.

---

## 2 · Belegte Ereignisse

| UTC | Pfad | Ergebnis |
|---|---|---|
| 2026-07-26 20:00:14 | `/api/cron/crawl` | **504** nach 300 s — **vor** #143, 91 Cluster, 6 Mandate |
| 2026-07-26 22:05:34 | — | **#143 deployt** (`746eaf92`, `dpl_8ot9fCnko…`) |
| 2026-07-26 22:09:52 | `/api/pipeline/run` (manuell) | **504** nach 300 s — 336 Cluster |
| 2026-07-27 04:01:21 | `/api/cron/crawl` (Cron) | **504** nach 300 s — 325 Cluster, **6 Mandate, kein Berlin** |
| 2026-07-27 05:00:12 | `/api/cron/morning-briefing` | **200**, 11 402 ms, 6 Mandate, `reason=ok` |
| 2026-07-27 05:31:07 | `/api/cron/understanding` | **200**, `processed: 20`, alle `saved` |
| 2026-07-27 05:45:44 | `/api/cron/lage-briefing` | **200** |

**Reproduzierbar:** ja — zwei Läufe auf dem #143-Stand, einer manuell, einer als regulärer Cron.
**Unabhängig von Berlin:** ja — der 04:01-Lauf hatte **0** Berliner Abrufwege und **0** Berliner
Mandate; Berlin war zu diesem Zeitpunkt bereits zurückgerollt.

---

## 3 · Wohin die 300 Sekunden gehen (04:01-Lauf, rekonstruiert)

Die Rekonstruktion stützt sich auf zwei Logzeilen und die Zeitstempel der geschriebenen
`knowledge_objects` — nicht auf Schätzung.

| Phase | Dauer | Beleg |
|---|---|---|
| Crawl inkl. Auflösung von **1 745** Google-News-URLs | **~156 s** | Rückrechnung aus den folgenden Marken |
| `lazy-understanding` (Budget 60 s) | **16,8 s** | Logzeile `clusters=325 processed=325` |
| `eager-understanding` (Budget 90 s) | **90 s** (ausgeschöpft) | kein Abschlusslog → Budget-Abbruch |
| **Summe bis hier** | **~263 s** | erster Vormerk-Write um **04:05:44** |
| **Vormerk-Loop** (kein Budget) | **braucht ~176 s, bekommt 37 s** | 56 `pending` in 32,9 s = **1,7/s** |
| Funktionslimit | **300 s** | Timeout 04:06:21 |

Zum Vergleich der 22:09-Lauf: **171** `pending` in 41,6 s (**4,1/s**) und 13 `complete` über
113 s (≈ 8,7 s je KI-Verstehen).

**Die Rechnung geht nicht auf, egal wie schnell der Vormerk-Loop ist:** er beginnt erst bei
Sekunde 263 von 300.

---

## 4 · Root Cause — zwei Teile, beide belegt

### 4.1 Der Vormerk-Loop hat als einziger keine Zeitgrenze (eingeführt mit #143)

`lib/helmut/understanding.js`, Block „ZURUECKGESTELLTE CLUSTER VERBINDLICH VORMERKEN":

```js
const zurueckgestellt = orderedClusters.slice(abgebrochenBei);
for (const cluster of zurueckgestellt) {
  await deps.savePending(...);   // Round-Trip 1
  await deps.saveSources(...);   // Round-Trip 2
}
```

Die beiden Loops **davor** (lazy, eager) prüfen jeweils `Date.now() - startedAt > budgetMs`.
Dieser nicht. Er läuft seriell über **alle** zurückgestellten Cluster — bei 325 Clustern und
einem eager-Loop, der nach 90 s abbricht, sind das ~300 Stück.

**Das ist kein Konzeptfehler von #143.** Das Vormerken ist genau die Reparatur, die den stillen
Verlust beendet hat. Es fehlt ihm nur die Grenze, die alle anderen Schritte haben.

### 4.2 Nichts begrenzte die Summe — und `/api/cron/crawl` war der einzige Cron ohne Zeitlimit

`server.js` vorher:

```js
if (url.pathname === "/api/cron/crawl") {
  if (!authorizeCron(request, url, response)) return;
  return handleAsync(response, () => runCronForTenants("crawl", (t) => runSourceCrawl(t)));
}
```

Sein Geschwisterpfad `/api/cron/pipeline` hat seit je **beides**: `withTimeout(…, 280000)` **und**
`deadlineMs: 270000`. `/api/cron/morning-briefing` hat `deadlineMs: 240000` plus Teil-Timeouts.
Der teuerste Pfad hatte als einziger nichts. Der manuelle `/api/pipeline/run` ebenfalls nicht.

Zusätzlich hatten die Phasenbudgets (60 s + 90 s) keinen gemeinsamen Deckel: sie gingen jeweils
davon aus, ihre volle Zeit zu haben, unabhängig davon, wie viel der Crawl schon verbraucht hatte.

### 4.3 Warum 227 zusätzliche `pending`

`savePending` ist genau der Schritt, der einen zurückgestellten Cluster vormerkt. Bei ~300
zurückgestellten Clustern je Lauf entstehen entsprechend viele Vormerkungen — der Loop schrieb,
so viele er vor dem Tod noch schaffte.

Gemessen am 2026-07-27, 06:05 UTC: **270 `pending` gesamt = 43 Alt-Bestand (02./03.07.) + 227 aus
den beiden abgebrochenen Läufen.**

### 4.4 Die eigentliche Folge: Telemetrieverlust

`persistSourceCrawlTelemetry` steht als **letzte** Anweisung in `runSourceCrawl`, nach
`eagerResult`. Stirbt der Lauf vorher, wird sie nie erreicht.

**Gemessen: `source_crawl_telemetry` hat seit dem 2026-07-26, 20:00:47 UTC keine neue Zeile** —
über zwei volle Crawl-Läufe hinweg. Das trifft drei Dinge auf einmal:

- **Punkt 16** (automatische Quellenstörungs-Erkennung) liest genau diese Tabelle und ist blind.
- **Invariante B3** („Telemetriezeilen = distinct `source_id`") ist nicht mehr messbar.
- **Punkt 14**: der Stufe-2-Riegel verlangt je Weg **2 Läufe mit `status='ok'`** aus dieser
  Tabelle. Solange Läufe im Timeout enden, ist er **nie** erfüllbar — unabhängig von Berlin.

---

## 5 · Was #143 nachweislich richtig macht

Fairnesshalber, weil es für die Bewertung zählt:

- Der Nachholpfad ist repariert. Der 05:31-Lauf zeigt `clusterHerkunft: "verknuepfung"` — die
  Cluster werden über `ko_document_links` gefunden statt über eine Neuclusterung, die praktisch
  nie traf. **Vorher: 3 Läufe, 0 verarbeitet. Jetzt: 20 `saved` in einem Lauf.**
- Die Verknüpfungsinvariante greift: **1 280 neue `ko_document_links`** seit dem Deployment.
- Briefings und Lage laufen unverändert (6 von 6 Mandaten heute früh).

**#143 muss nicht zurückgenommen werden.** Es fehlt eine Zeitgrenze, sonst nichts.

---

## 6 · Reparatur (kleinstmöglich, keine Architekturänderung)

| # | Datei | Änderung |
|---|---|---|
| A | `lib/helmut/understanding.js` | Der Vormerk-Loop bekommt eine Zeitgrenze — `vormerkBudgetMs` (Dauer) **oder** `vormerkDeadlineMs` (absolut). Beide optional; ohne sie bleibt das Verhalten byte-identisch, damit der Nachhollauf unberührt bleibt. Was nicht mehr passt, wird als **`nichtVorgemerkt` gezählt und protokolliert** — nicht verschwiegen. |
| B | `lib/helmut/scheduler.js` | Gesamtbudget `HELMUT_CRAWL_GESAMTBUDGET_MS` (Default **240 000 ms** = 80 % von `maxDuration`). Jede Phase bekommt `min(eigenes Budget, Restzeit)`. Der Vormerk-Loop bekommt eine **absolute** Deadline, weil er erst nach dem Verstehen startet — eine vorher berechnete Dauer wäre um dessen Laufzeit zu groß. |
| C | `server.js` | `/api/cron/crawl` und `/api/pipeline/run` bekommen dieselbe Zeitgrenze, die `/api/cron/pipeline` schon hat. |

**Bewusst nicht getan:** kein Refactoring des Vormerkens auf Batch-Writes, keine Änderung an der
Clusterbildung, keine Änderung an Budgets bestehender Phasen, kein Eingriff in #143s Fachlogik,
keine Migration, kein Flag scharfgeschaltet.

**Warum das dauerhaft trägt:** vorher konnte die Summe der Phasen das Funktionslimit
überschreiten, weil keine Phase von den anderen wusste. Jetzt leitet sich jede Grenze aus der
**Restzeit desselben Laufs** ab. Ein langsamerer Crawl verkürzt automatisch die Folgephasen,
statt den Lauf zu töten — und der Lauf erreicht in jedem Fall seinen Abschluss samt Telemetrie.

---

## 7 · Nachweis

### 7.1 Offline erbracht

| Suite | Ergebnis |
|---|---|
| `run-offline-tests.js` (kanonisch) | **161/161 grün** (vorher 160) |
| `pipeline-zeitbudget-test.js` (**neu**) | **21 PASS / 0 FAIL** |
| `browser-smoke-test.js` | **32 PASS / 0 FAIL** |

Der neue Test belegt: die Grenze greift als Dauer **und** als absolute Deadline · ohne Grenze
bleibt das #143-Verhalten unverändert · `vorgemerkt + nichtVorgemerkt = zurückgestellt` (nichts
verschwindet still) · Quelltext-Riegel gegen das stille Entfernen aller drei Zeitgrenzen · die
Summe der Regelbudgets liegt mit ≥ 30 s Reserve unter `maxDuration`.

### 7.2 In Production **nicht** erbracht — und warum

Der Production-Nachweis verlangt **Merge + Deployment**, und beides ist freigabepflichtig
(`CLAUDE.md` §5). Dieser Sprint durfte ausdrücklich nicht mergen. **Die Reparatur ist damit
bewiesen, aber nicht in Betrieb.**

**Messwerte vor der Reparatur (Baseline, 2026-07-27, 06:05 UTC):**

| Größe | Ist |
|---|---|
| `504` auf Crawl-Pfaden in 12 h | **2** |
| Letzte Telemetriezeile | **2026-07-26 20:00:47 UTC** (> 10 h alt) |
| Telemetriezeilen der letzten zwei Crawl-Läufe | **0** |
| `pending` | **270** (43 alt + 227 neu) |
| Aktive Locks | 0 |
| LLM heute | 38/100 |
| Briefings heute früh | 6 von 6 Mandaten |

**Was nach dem Deployment zu messen ist** (Abnahme, in dieser Reihenfolge):

1. **HTTP zuerst:** `/api/cron/crawl` antwortet mit **200** statt 504; im Log erscheint
   `[cron/crawl] …ms tenants=… bounded=…`.
2. `source_crawl_telemetry` bekommt wieder Zeilen; **Invariante B3** (`Zeilen = distinct
   source_id`) ist erfüllt.
3. `pending` wächst **nicht** weiter über 270 hinaus; bei erschöpftem Vormerk-Budget erscheint
   `[understanding] Vormerk-Zeitbudget erschoepft: … bleiben unvorgemerkt zurueckgestellt`.
4. Zwei aufeinanderfolgende Vollcrawls ohne `504` und ohne `Task timed out`.

---

## 8 · Offene Punkte, die dieser Sprint bewusst NICHT anfasst

1. **Der Alt-Rückstand von 270 `pending` baut sich nicht von selbst ab.** Der
   Understanding-Cron schafft ~20 je Lauf bei 2 Läufen/Tag, gedeckelt durch das
   LLM-Tagesbudget 100. Für den Altbestand existiert seit #143 das Werkzeug
   `scripts/vorgangsbildung-nachholen.js` (Vorschau ist Standard, Ausführung braucht
   `HELMUT_NACHHOLEN_BESTAETIGT=ja`) — **freigabepflichtig, eigene Entscheidung**.
2. **Der Crawl selbst braucht ~156 s** für 1 745 Google-News-Auflösungen. Das ist mehr als die
   Hälfte des Funktionslimits und gehört zu **OP-15/B1** (Google-News-Klumpenrisiko), nicht
   hierher. Die Reparatur macht den Lauf robust dagegen — sie macht ihn nicht schneller.
3. **Die Kostenfrage aus #143** (KI-Obergrenze 115 → 159/Tag bei Budget 100) bleibt offen und
   ist eine Betreiberentscheidung; sie wird durch die Zeitgrenze weder besser noch schlechter.
