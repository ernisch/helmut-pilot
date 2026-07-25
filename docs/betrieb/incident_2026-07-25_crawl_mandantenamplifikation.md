# Incident 2026-07-25 — „141 von 144 Quellen fehlgeschlagen"

**Status:** Ursache bestätigt · Fix implementiert + offline getestet · **gemergt und in Production
deployt** · Production-Beweislauf **läuft** (§10/§11).

**Merge:** PR **#120** → `main` `9f95d87`, 2026-07-25 10:27 UTC ·
**Production-Deployment:** `dpl_146taCPQSupxYfD3Lav1HoiVAHkP` READY 10:27 UTC, abgelöst durch
`dpl_4ohE8HRNxYCHuXLPALq8rFw8GReD` (Merge #121, reiner Doku-Commit, Incident-Code unverändert)
READY 10:33 UTC.

**Ursprünglicher Branch:** `claude/helmut-crawl-incident-triage-ce39a2` · **Basis:** `main` @ `035898b`
· **Rollout-Branch:** `claude/helmut-incident-rollout-nm2j7u`

> **Korrekturhinweis 2026-07-25:** Das ursprüngliche Beweisprotokoll in §10 beschrieb in den
> Stufen B1–B3 Testläufe, die **technisch nie ausführbar waren** (keine Schnittstelle grenzt
> einen Crawl auf einzelne Abrufwege oder auf `rss` ein). Das ist eine **Spezifikationslücke
> der Dokumentation**, kein Implementierungsfehler — an der Software wurde deshalb nichts
> geändert. §10 ist durch das an der realen Implementierung ausgerichtete Protokoll **§11**
> ersetzt; die Lücke ist in §11.1 belegt.

---

## 1 · Kurzfassung für Nicht-Entwickler

Die Datenzufuhr war **nicht gestört**. Es gab **keine defekte Quelle** und **keinen
Google-News-Ausfall**.

Helmut versorgt inzwischen **sechs aktive Mandate**. Der Crawl-Cron arbeitet diese Mandate
**nacheinander im selben Programmlauf** ab — und holte für **jedes** Mandat dieselben
Nachrichten-Suchen erneut. Von den 144 Abrufwegen eines Mandats sind **138 mit den anderen
Mandaten identisch**. Google zählt Anfragen aber **pro Server**, nicht pro Mandat.

Ergebnis: Das erste Mandat holte alle 145 Wege erfolgreich. Das zweite Mandat startete rund
drei Minuten später, lief in Zeitüberschreitungen, und der eingebaute Notausschalter
(Circuit Breaker) stoppte korrekt die restlichen Abrufe. Diese **gestoppten** 130 Wege
wurden anschließend als **130 einzelne Quellenfehler** gezählt — daraus entstand die Meldung
„141/144 Fehler".

Die Dokumente selbst waren längst da: sie kamen aus dem gesunden ersten Lauf, und der
Dokumentenbestand ist **gemeinsam** (nicht pro Mandat getrennt). Es ist also **kein Dokument
verloren gegangen**.

Zusätzlich gefunden — und wichtiger als die Alarmmeldung:

* **Vier der sechs aktiven Mandate wurden nie gecrawlt.** Das Zeitbudget des Crons (240 s)
  war nach den ersten zwei Mandaten erschöpft; die restlichen wurden **stillschweigend**
  übersprungen.
* **„Lage-Check veraltet" war ein Dauerfehlalarm.** Der Lage-Cron läuft einmal täglich um
  10:00 UTC, der Health-Report um 06:00 UTC. Die Lage ist zur Report-Zeit also **immer**
  ~20 h alt — geprüft wurde sie gegen eine 4-Stunden-Schwelle.

---

## 2 · Betroffene Läufe (Production-Belege)

Quelle: `source_crawl_telemetry`, `helmut_store.data->crawlRuns`, Vercel-Runtime-Logs.

| Lauf | Start (UTC) | Mandat | Geprüft | OK | Fehler | Zustand | Dauer |
|---|---|---|---|---|---|---|---|
| `crawl-20260725040036-uu3fk` | 04:00:37 | `annika-klose` | 145 | **145** | 0 | `gesund` | 193 s |
| `crawl-20260725040353-3kste` | 04:03:53 | `cem-ince` | 144 | 3 | **141** | `stark-degradiert` | 72 s |
| `crawl-20260724200018-rh445` | 20:00:19 | `annika-klose` | 145 | **145** | 0 | `gesund` | 197 s |
| `crawl-20260724200338-bofoo` | 20:03:39 | `cem-ince` | 144 | 3 | **141** | `stark-degradiert` | 84 s |
| `crawl-20260724040036-zw0vt` | 04:00:37 | `annika-klose` | 145 | **145** | 0 | `gesund` | 165 s |
| `crawl-20260724040322-fg6tx` | 04:03:23 | `cem-ince` | 144 | 3 | **141** | `stark-degradiert` | 122 s |

**Muster über die gesamte Historie:**

* `annika-klose`: **14 Läufe, 14× `gesund`**
* `cem-ince`: **6 Läufe, 6× `stark-degradiert` — nie ein gesunder Lauf**
* `helmut-kleebank`, `max-mustermann`, `ottilie-paola-klein-2`, `ruppert-st-we`:
  **0 Läufe** (nie gecrawlt)

Der Vorfall ist damit **kein neues Ereignis, sondern ein deterministischer Zustand seit
2026-07-21** (Anlage der vier weiteren Mandate am 2026-07-20 23:15 UTC).

### 2.1 · Fehlerverteilung des degradierten Laufs

`crawl-20260725040353-3kste` (144 Wege, Spanne 21 s):

| Fehlerart | Anzahl | Ø Dauer | Retries | Bewertung |
|---|---|---|---|---|
| `circuit-open` | **130** | **0 ms** | 0 | **kein Request** — zentraler Breaker-Abbruch |
| `timeout` | 8 | 9 428 ms | 2 | echte Fehlversuche |
| `http-5xx` (HTTP **503**) | 3 | 6 176 ms | 0 | echte Fehlversuche |
| `ok` | 3 | 67 ms | 0 | `bmas`, `deutschlandfunk-politik`, `tagesschau-politik` |

**Nur 11 der 141 „Fehler" waren überhaupt Abrufversuche.** Die anderen 130 waren
**ein** Ereignis: der Breaker öffnete nach ~11 Beobachtungen (Schwelle: 10 Beobachtungen /
60 % Drossel-Fehler) und beendete die restlichen Google-Wege sofort — genau wie entworfen.

### 2.2 · Der entscheidende Beleg: dieselben Wege waren 3 Minuten davor erfolgreich

Abgleich der Wege beider Läufe (`source_id`-Join):

| Fehlerart in `cem-ince` | Anzahl | davon auch im gesunden Lauf | dort **erfolgreich** |
|---|---|---|---|
| `circuit-open` | 130 | 130 | **130** |
| `http-5xx` | 3 | 3 | **3** |
| `timeout` | 8 | 2 | **2** |

138 der 144 Wege sind identisch (`shared=138`, nur-A=7, nur-B=6 → mandantseigene Wege).
**Keine einzige Quelle war defekt.**

### 2.3 · Runtime-Log-Beleg (Vercel, `dpl_3CsTxpcgEuXVpfB6oY82xtSyJB7t`)

```
04:00:34 GET /api/cron/crawl 200            ← EIN Cron-Aufruf, keine Retry-Doppelung
  [crawler] Google-News URL-Auflösung: 1737/1744 aufgelöst, 7 ungelöst   ← Mandat 1
  [runSourceCrawl] eager-understanding 96002ms {"processed":75,"deferred":2}
  Crawl failed for … news.google.com/… : Timeout for …                   ← Mandat 2 (8×)
  Crawl failed for … news.google.com/… : HTTP 503 for …                  ← Mandat 2 (3×)
  [crawler] Google-News URL-Auflösung: 0/0 aufgelöst, 0 ungelöst          ← Breaker offen
```

**1 744 Google-URL-Auflösungen** im ersten Mandatslauf — das ist die eigentliche Last, die
Googles Toleranz erschöpft. Danach: 8 Timeouts + 3× HTTP 503.

### 2.4 · Explizit geprüft und ausgeschlossen

| Prüffrage | Befund |
|---|---|
| Sind fast alle fehlgeschlagenen Wege Google-News-Wege? | **Ja, genau alle 141.** 146 von 163 `retrieval_paths` sind `googlenews_search`. |
| Haben die 3 erfolgreichen Wege eine andere Methode? | **Ja** — `rss`/`api`-Direktfeeds (die einzigen mit `status='healthy'`). |
| Fehler vor oder nach der HTTP-Anfrage? | **130 davor** (0 ms, kein Request), **11 danach**. |
| Globaler Breaker, der Folgequellen als Fehler zählt? | **Ja — das ist der Zähl-Defekt.** 130 `circuit-open` landeten in `failedSources`. |
| Google-News-Batchresolver ausgefallen? | **Nein.** Mandat 1: 1 737/1 744 aufgelöst. Mandat 2: 0/0, weil der Breaker offen war. |
| Antwortstruktur von Google geändert? | **Nein.** Keine Parser-Fehler (`parse`: 0). |
| Token/Cookie/Header/RPC-ID ungültig? | **Nein.** Keine 401/403 gegen Google; Mandat 1 identisch authentifiziert und erfolgreich. |
| 403-/429-Antworten? | **Keine.** Google antwortete mit **503** und Timeouts (weiche Drosselung). |
| Ist außer dem Crawl noch ein Cron-Pfad betroffen? | **Ja — der Lage-Check.** Siehe §2.5. |
| Vercel-Laufzeitgrenze erreicht? | **Nein** für die Function (300 s, Antwort 200). **Ja** für das interne Tenant-Zeitbudget (240 s) → 4 Mandate stillschweigend übersprungen. |
| Parallele Crawl-/Understanding-Jobs? | **Nein.** Ein Cron-Aufruf, `pipeline_locks` je Mandat, keine Overlaps. |
| Scheduler-Überlappung / Doppel-Crawl? | **Ja, aber intern:** ein Cron, sequenzieller Mandanten-Loop, 138 doppelt geholte Wege. |
| Werden übersprungene Wege als Fehler gezählt? | `skipped-cooldown` **nein** (korrekt) — `circuit-open` **ja** (der Defekt). |
| Lock-Konflikte / Lock-Leaks? | **Keine.** |
| Ist die Health-Meldung korrekt? | **Arithmetisch ja, semantisch nein** — siehe §3.3. |
| KI-Budget/Kosten beteiligt? | **Nein.** 15/100, 0 Skips, 0 KI-Calls im Crawl-Fehlerpfad. |

### 2.5 · Zweiter betroffener Pfad: der Lage-Check 10:00 UTC

Der Fix deckt ihn ab (`runLageCheck` baut dasselbe geteilte Wege-Gedächtnis, `scheduler.js`),
die Belegtabelle in §2 zeigte ihn aber nicht. Nachgetragen, weil er dieselbe Ursache mit
derselben Signatur trägt — und weil er im Beweislauf eine eigene Stufe braucht (§11, IB-5).

`/api/cron/lage-check` läuft ebenfalls über `runCronForTenants`: **ein** Aufruf, alle Mandate
sequenziell, je Mandat ein quellenreduzierter Lauf über **90 Wege**. Telemetrie
(`source_crawl_telemetry`, Läufe `lage-*`), zwei aufeinanderfolgende Tage vor dem Deploy:

| Datum | Läufe 10:0x UTC | Mandat 1 | Mandate 2–6 |
|---|---|---|---|
| 2026-07-24 | 6 | `8ks53`: 90 Wege, **89 ok, 0 Fehler** | je 90 Wege, **3 ok / 87 Fehler**, davon 80–87 `circuit-open` |
| 2026-07-25 | 6 | `tz751`: 90 Wege, **89 ok, 0 Fehler** | je 90 Wege, **3 ok / 87 Fehler**, davon 76–87 `circuit-open` |

Identisches Muster wie beim Crawl: der erste Mandantenlauf ist vollständig gesund, alle
folgenden laufen in dieselbe Egress-IP-Drosselung; die überwiegende Mehrheit der „Fehler" sind
Breaker-Abbrüche ohne Request. Die **Lage-Ergebnisse** blieben davon unberührt (RC-5, §3):
der Kandidatenpfad liest den **globalen** Rohbestand (`getRawItemsSince`) und sieht die
Dokumente des ersten Mandats vollständig — belegt durch 6/6 Lage-Checks mit Status `changed`
am 23. und 24.07. **Kein Lage-Datenverlust, aber dieselbe unnötige Last gegen Google.**

---

## 3 · Bestätigte Ursachen

### RC-1 (primär) — Mandanten-Amplifikation gegen eine IP-gedrosselte Ressource

`runCronForTenants` (`server.js`) durchläuft **alle aktiven Mandate sequenziell in einer
Function-Invocation**; jedes Mandat ruft `runSourceCrawl(tenantId)` mit seinem **vollen**
Quellenplan auf. Da ~138 Wege mandantenunabhängig identisch sind und Google **pro
Egress-IP** drosselt, verbraucht Mandat 1 das Budget und Mandat 2 läuft in die Drosselung.

Der vorhandene Schutz greift **konstruktionsbedingt nicht**:

* `fullCrawlMinSpacingMs` (30 min) ist **pro Mandat** gefiltert
  (`google-news-hardening.js:303`) — Mandat 2 hat keinen eigenen Vorlauf.
* Der Degradations-Cooldown ist mandantsübergreifend, greift aber erst **nach** einem
  degradierten Lauf. Mandat 1 ist gesund → der Schutz ist innerhalb desselben Durchlaufs
  nie aktiv.
* Das Breaker-Gedächtnis hat nichts zu erinnern: Mandat 1 öffnete den Breaker nie.

### RC-2 — Ein zentraler Abbruch wurde als N Einzelquellenfehler gezählt

`circuit-open`-Ergebnisse trugen `status: "error"` und landeten in `failedSources`
(`crawler.js`), `skippedSources` erkannte nur `skipped-cooldown`. Ein **einzelnes**
Provider-Ereignis erschien damit als 130 defekte Quellen → `stark-degradiert`.

### RC-3 — Health-Report bewertete den zufällig letzten Mandantenlauf

`getLatestCrawlRun()` = `crawlRuns[0]`, **ohne Mandantenfilter**. Weil die Mandate
alphabetisch laufen, ist `cem-ince` **immer** der letzte Lauf. Der Report beschrieb also
dauerhaft den strukturell aussichtslosen Lauf und **nie** den gesunden, der die Daten geholt
hat → „Datenzufuhr verzögert oder Quellenbasis dünn" / „Teilweise gestört".

Der rollierende Report zählte konsistent **2 von 6 Läufen degradiert** (24-h-Fenster:
3 Cron-Ticks × 2 Mandatsläufe) — arithmetisch korrekt, semantisch irreführend.

### RC-4 — Vier aktive Mandate wurden nie gecrawlt

Zeitbudget `deadlineMs = 240 000` gegen tatsächliche Laufzeiten (193 s + 72 s = 265 s):
ab dem dritten Mandat greift `reason: "zeitbudget"`. Dieser Abbruch stand **nur im
Antwort-Body** — kein Log-Fehler, kein Systemfehler, kein Health-Signal.

### RC-5 — Lage-Fehlalarm durch Schwelle gegen Cron-Takt

Lage-Cron `0 10 * * *` (1×/Tag), Health-Report `0 6 * * *`, Schwelle 4 h. Die Lage ist zur
Report-Zeit strukturell **immer ~20 h** alt → `lageAxis` → `warn` → `TEILWEISE`.

**Belegt korrekt gelaufen:** alle **6/6 Mandate** haben am 23.07. und 24.07. um 10:0x UTC
einen Lage-Check mit Status `changed`. **Kein Lage-Defekt.**

---

## 4 · Antworten auf die Phase-4-Fragen (Lage & Folgeprozesse)

| Frage | Antwort |
|---|---|
| Lage wegen fehlender Rohdaten nicht aktualisiert? | **Nein.** Rohdaten kamen normal (41 Dokumente um 04:00 UTC, wie an allen Vortagen). |
| Sind Lage-Check und Crawl-Lock gekoppelt? | **Nein.** Getrennte Locks (`crawl-<tenant>` vs. eigener Lage-Pfad), keine Blockade. |
| Sollte ein erfolgreicher Direktquellen-Teilcrawl die Lage aktualisieren? | Die Lage lief **vollständig und pünktlich** — es gab nichts nachzuholen. |
| Verarbeitet Understanding alte Daten erneut? | **Nein.** `eager-understanding`: 75 verarbeitet / 2 zurückgestellt aus **neuen** Clustern. |
| Kombiniert die Health-Nachricht irreführend zwei Zeitstempel? | **Ja** — „Crawl vor 2 h" (2×/Tag-Takt) neben „Lage vor 20 h" (1×/Tag-Takt), bewertet an einer 4-h-Schwelle. Das ist RC-5. |
| Liegt ein separater Lage-Fehler vor? | **Nein.** |

**Kein Zeitstempel wurde künstlich erneuert.** Korrigiert wurde ausschließlich die
**Schwelle**, gegen die der Takt gemessen wird.

---

## 5 · Umgesetzter Fix (kleinste belastbare Lösung)

Kein neuer Dienst, keine neue Abhängigkeit, **kein Providerwechsel**, keine Migration, keine
Cron-Änderung, keine Quellenpaket-Änderung, keine Budget-/Timeout-Erhöhung.

| # | Fix | Datei | Wirkung |
|---|---|---|---|
| **A** | **Geteilte Google-Wege je Cron-Durchlauf nur einmal abrufen.** Prozessweites, zeitfensterbegrenztes Gedächtnis der Abruf-**URLs**; identische URL im selben Durchlauf → `status: "skipped-shared"` (weder Erfolg noch Fehler). | `google-news-hardening.js`, `crawler.js`, `scheduler.js` | Beseitigt die **Ursache**: die selbst verursachte Drosselung entfällt. Mandantseigene Wege und **alle** Direktquellen laufen unverändert. |
| **B** | **`circuit-open` ist kein Quellenfehler.** Eigener Status + eigener Zähler `circuitOpenSources`; aus der Fehlerquote ausgenommen (nie abgerufen). Neuer Lauf-Zustand **`aggregator-gedrosselt`**. | `crawler.js`, `crawl-run-state.js`, `rolling-health.js`, `storage.js` | Ein zentrales Ereignis wird als **eines** gemeldet — „141 Fehler" kann nicht mehr entstehen. Ein echter Ausfall alarmiert weiterhin. |
| **C** | **Basis-Lauf des Health-Reports ist mandantenbewusst.** Bewusst reduzierte Läufe (`isReducedRun`) sind keine Grundlage der Frische-/Qualitätsachsen. | `rolling-health.js`, `server.js` | Der Report bewertet wieder den Lauf, der die Daten **geholt** hat. |
| **D** | **Zeitbudget-Abbruch wird sichtbar.** Übersprungene Mandate erzeugen Log-Fehler + Systemfehler. | `server.js` | RC-4 ist nicht mehr stillschweigend. Durch Fix A werden Folgeläufe zudem schnell, sodass alle 6 Mandate ins Budget passen. |
| **E** | **Watchdog-Lage-Schwelle am Cron-Takt** (`HELMUT_WATCHDOG_LAGE_FRESH_MS`, Default 26 h = 24 h Takt + 2 h Kulanz). In-App-Schwelle (4 h) **unverändert**. | `server.js` | Kein Dauerfehlalarm; ein wirklich ausgefallener Lauf (> 26 h) alarmiert weiter. |

**Warum Fix A kein Datenverlust ist:** `raw_documents` hat **keine Mandantenspalte** — der
Dokumentenkorpus und die Knowledge Objects sind **global**. Ein zweiter Abruf derselben URL
liefert dieselben Dokumente in denselben Bestand. Belegt: der degradierte Lauf trug im
gemessenen Fenster **4** Rohdokumente bei (aus seinen 3 Direktquellen).

### Neue Env-Schalter (alle optional, Defaults dokumentiert in `env-inventar.md`)

| Variable | Default | Zweck |
|---|---|---|
| `HELMUT_SHARED_PATH_DEDUP` | `on` | **Kill-Switch für Fix A** (Rollback ohne Deploy). |
| `HELMUT_SHARED_PATH_WINDOW_MS` | `900000` (15 min) | Fensterbreite des Wege-Gedächtnisses. |
| `HELMUT_RUNSTATE_MIN_ATTEMPTED` | `10` | Mindestzahl versuchter Wege für eine Quoten-Bewertung (nur bei reduzierten Läufen). |
| `HELMUT_WATCHDOG_LAGE_FRESH_MS` | `93600000` (26 h) | Lage-Frische am Cron-Takt. |

---

## 6 · Tests

**Neu:** `scripts/incident-crawl-amplifikation-test.js` — **52 Assertions, grün.**
Deckt ab: Wege-Gedächtnis (Fenster, Größenbegrenzung, URL- statt id-Schlüssel, direkte
Quellen nie dedupliziert), Zwei-Mandanten-Durchlauf am **echten** `crawlAllSources`-Pfad mit
**gemessener** Trefferzahl je URL (kein Doppel-Abruf), 503-/429-/403-/Timeout-Welle,
Breaker-fail-fast, Direktquellen trotz Aggregator-Totalausfall, Lauf-Klassifikation mit den
**echten** Incident-Zahlen (144/3/11/130), rollierender Report, Lage-Achse, Telemetrie und
Nicht-Leak roher URLs. Enthält **Gegenproben**, die mit den Alt-Zählern/-Schwellen
fehlschlagen — der Test trifft also die Ursache und verschiebt nicht nur eine Grenze.

**Angepasst:** `google-news-hardening-test.js` (Zustandskatalog 7 → 8),
`env-inventar-test.js` via `env-inventar.md` (4 neue Variablen dokumentiert).

**Gesamt:** `node scripts/run-offline-tests.js` → **141/141 Suiten grün** (vorher 140/140).
`node --check` grün. **Keine Seed-, Migrations-, Cron- oder Quellenpaket-Änderung.**

---

## 7 · Erwartetes Verhalten nach Deploy

Crawl-Cron 04:00 UTC, 6 aktive Mandate:

1. **Mandat 1** holt alle Wege → `gesund` (unverändert).
2. **Mandate 2–6** überspringen die ~138 geteilten Google-Wege (`skipped-shared`), holen
   ihre **eigenen** Wege und **alle** Direktquellen → `cooldown-reduziert`, **0 Fehler**.
3. Google sieht statt ~6 × 1 744 nur **einmal** ~1 744 Auflösungen → keine Drosselung.
4. Läufe 2–6 dauern Sekunden statt Minuten → **alle 6 Mandate passen ins 240-s-Budget**
   (RC-4 löst sich mit).
5. Health-Report 06:00: Basis ist der gesunde Lauf → `aktuell-gesund`, Lage bei 20 h
   `fresh` → **kein „Teilweise gestört"**, kein „wiederholt degradiert".

---

## 8 · Verbleibende Risiken

| Risiko | Bewertung / Umgang |
|---|---|
| **Kein Warmstart-Prozess** (Cold Start je Mandat) würde das Gedächtnis leeren. | Belegt gegenteilig: ein Cron = **eine** Invocation (Log `04:00:34 … 200`). Fällt es doch, ist das Verhalten das heutige — kein neuer Schaden. |
| Fenster 15 min zu kurz/lang. | 15 min > beobachtete Durchlaufdauer (~4,5 min), deutlich < 30-min-Abstandsschutz. Env-justierbar. |
| Echter Google-Ausfall trifft nur noch Mandat 1 sichtbar. | Genau richtig: Mandat 1 überspringt nichts, wird `aggregator-gedrosselt` und **alarmiert**. Durch Test belegt. |
| Lage-Schwelle 26 h verdeckt einen einzelnen verpassten Lauf für ~2 h. | Bewusst: 24-h-Takt + Kulanz. > 26 h warnt, > 28 h ist `dead`. |
| **`retrieval_paths`: 146/163 sind `googlenews_search`, 156/163 `needs_review`/`broken`.** | **Strukturelles Klumpenrisiko, nicht Teil dieses Incident-Sprints** (bereits als Empfehlung in `google_news_haertung.md` §4 vermerkt: Direkt-RSS statt Google-Suchen). Eigener Sprint, eigene Freigabe. |
| **Datenhygiene: `max-mustermann` u. a. Demo-Mandate sind `aktiv=true`.** | Verstärkt die Amplifikation (6 statt 2 Mandate) und ist offener Punkt **OP-04**. Deaktivierung ist eine **Betreiberentscheidung** (Quellen-/Mandatsaktivierung ist in diesem Sprint nicht erlaubt) — empfohlen, aber nicht ausgeführt. |
| Weg `cem-ince News-Suche` sucht nach dem **Slug** (`q="cem-ince"`) statt dem Klarnamen. | Eigener Datenqualitätsfehler, im Log sichtbar, **nicht** Ursache des Incidents. Separat zu beheben. |

---

## 9 · Rollback

| Stufe | Maßnahme | Wirkung |
|---|---|---|
| 1 (ohne Deploy) | `HELMUT_SHARED_PATH_DEDUP=off` in Vercel | Fix A inert → Alt-Crawlverhalten. Zählung/Report-Fixes bleiben (rein beobachtend). |
| 2 (ohne Deploy) | `HELMUT_WATCHDOG_LAGE_FRESH_MS=14400` | Alte 4-h-Lage-Schwelle zurück. |
| 3 (ohne Deploy) | `HELMUT_GOOGLE_HARDENING=off` | Gesamte Google-Härtung inert (bestehender Kill-Switch). |
| 4 (voll) | `git revert` des Merge-Commits | Vollständiger Rückbau. **Keine Migration, kein Cron, keine Env-Pflicht** beteiligt — alle neuen Variablen sind optional mit Defaults. |

Kein Rollback erfordert Datenreparatur: es wurden **keine** Production-Daten geschrieben,
gelöscht oder migriert.

---

## 10 · Ursprüngliche Freigabevorlage (B0–B6) — **historisch, ersetzt durch §11**

Die erste Fassung dieses Abschnitts entwarf sieben Stufen B0–B6. Drei davon (B1, B2, B3)
beschrieben Läufe, die es in der Software **nicht gibt**; zwei weitere (B2, B3) hätten über
`force` genau den Schutz abgeschaltet, den sie beweisen sollten. Der Entwurf entstand vor
dem Deploy und wurde nie ausgeführt — außer B0, das als reine Whitelist-/Deploy-Prüfung
gültig bleibt und in §11 als **IB-0** weitergeführt wird.

**Nicht als Ablaufplan verwenden.** Verbindlich ist §11. Die Stufenbezeichnungen sind dort
bewusst auf `IB-x` umgestellt: `B1`/`B2`/`B3` sind in
[`production_beweisprotokoll.md`](production_beweisprotokoll.md) seit dem 17.07. mit einer
**anderen** Bedeutung belegt (Betriebsbefunde Google-News-Rate-Limiting,
Understanding-Rückstand, Quellenzahl) — die Doppelbelegung war Teil des Problems.

---

## 11 · Production-Beweislauf (verbindlich, an der realen Implementierung ausgerichtet)

### 11.1 · Spezifikationslücke SL-1: B1–B3 waren technisch nie ausführbar

**Befund:** Es existiert **keine** Schnittstelle, die einen Crawl auf eine Teilmenge der
Abrufwege, auf eine Anzahl Wege oder auf ein Abrufverfahren (`rss`) eingrenzt. Ein Crawl ist
in Helmut immer der **vollständige Quellenplan eines Mandats**.

Belege im Code (Stand `9f95d87`):

| Einstiegspunkt | Datei | Wirksame Parameter |
|---|---|---|
| `GET /api/crawl/run` | `server.js:512–527` | nur `force` (aus `isForcedPilotRun` / `hasAdminBypass`) → `runSourceCrawl(politicianId, { force })` |
| `GET /api/pipeline/run` | `server.js:529–546` | nur `force`, sonst identisch |
| `GET /api/cron/crawl` | `server.js:800–803` | keine → `runCronForTenants("crawl", (t) => runSourceCrawl(t))` |
| `GET /api/debug/crawl` | `server.js:6017–6023` | keine → `runSourceCrawl(politicianId)` |

`runSourceCrawl` (`scheduler.js:219–240`) setzt `mode` auf `"full"`, wenn nichts anderes
übergeben wird, und benutzt dann `allSources` — den kompletten Plan. Das Feld `sourceLimit`
wird **ausschließlich** im Zweig `mode === "lage-check"` ausgewertet (`scheduler.js:239`) und
ist über HTTP nicht setzbar. Ein Filter nach Abrufverfahren existiert im gesamten Crawl-Pfad
nicht.

**Damit sind hinfällig:** B1 („eine Direktquelle, `sourceLimit` klein, nur `rss`-Wege"),
B2 („ein Google-News-Weg") und B3 („~20 Wege, gemischt").

**Einordnung:** Dokumentationsfehler, kein Implementierungsfehler. Es wird **keine** Software
geändert und **kein** solcher Parameter nachgerüstet — der Beweis ist ohne ihn führbar (§11.3),
und eine Schnittstelle zum gezielten Teil-Crawl wäre eine neue Funktion außerhalb dieses
Incidents.

### 11.2 · Spezifikationslücke SL-2: `force` schaltet genau den zu beweisenden Schutz ab

`scheduler.js:263` baut das geteilte Wege-Gedächtnis nur, wenn **kein** `force` gesetzt ist:

```js
const sharedLedger = hardening.enabled && hardening.sharedPathDedup && !options.force
  ? sharedFetchLedger(hardening.sharedPathWindowMs) : null;
```

Gleiches gilt für den Cooldown (`scheduler.js:253`, `force: Boolean(options.force)`). Ein
manuell forcierter Lauf fährt also **das Verhalten von vor dem Incident**: voller Plan, ~1 744
Google-URL-Auflösungen, ohne Abstands- und Dedup-Schutz.

**Konsequenz:** Manuell forcierte Crawls sind **kein** Beweismittel und werden aus dem
Beweislauf ausgeschlossen. Sie würden die Drosselung, die den Incident ausgelöst hat, aktiv
erneut provozieren.

### 11.3 · Der tatsächliche Ablauf

Fix A wirkt **prozessweit innerhalb einer Function-Invocation** über mehrere Mandate hinweg
(`sharedFetchLedger` ist eine Modul-Singleton-Instanz, `google-news-hardening.js:177–185`).
Reproduzierbar ist das **ausschließlich** auf dem regulären Cron-Pfad — ein Aufruf,
sequenzieller Mandanten-Loop, dieselbe Egress-IP.

Der Beweislauf ist deshalb **rein beobachtend**: keine manuellen Läufe, keine Eingriffe,
ausschließlich lesende `SELECT`s gegen `ddckuvvpcytqbyfmbvie` und Vercel-Runtime-Logs.

**Beobachtete Cron-Zeiten (UTC, aus `vercel.json`):**
Pipeline 16:00 · Crawl 20:00 und 04:00 · Health-Report 06:00 · Lage-Check 10:00.

| Stufe | Ereignis | Erfolgskriterium | Abbruch / Stopp bei |
|---|---|---|---|
| **IB-0** | Deploy-Bereitschaft (kein Lauf) | Production-Deployment des Merge-Commits `READY`; `circuitOpenSources`/`sharedSkippedSources` stehen in der `compactCrawlRunForStore`-Whitelist (`storage.js:2759–2760`); Baseline vor dem Fix dokumentiert | Deployment nicht READY oder Feld fehlt |
| **IB-1** | **Pipeline-Cron 16:00 UTC** — erster Mehr-Mandanten-Durchlauf unter dem Fix | Mandat 1 `gesund`; jedes Folgemandat `sharedSkippedSources > 0`, `failedSources = 0`, `circuitOpenSources = 0`; Folgeläufe deutlich kürzer als Mandat 1 | ein Folgemandat zeigt `circuit-open` oder Fehler > 5 |
| **IB-2** | **Crawl-Cron 20:00 UTC** — Hauptbeweis über alle aktiven Mandate | **alle 6 Mandate** in `crawlRuns`; **kein** `zeitbudget`-Systemfehler; **keine** `circuit-open`-Zeile in der Telemetrie des Durchlaufs; neue Rohdokumente ≥ Niveau der Vortage | ein Mandat fehlt, degradiert, oder Rohdokumente brechen ein |
| **IB-3** | **Crawl-Cron 04:00 UTC (Folgetag)** — Wiederholbarkeit | wie IB-2, an einem zweiten unabhängigen Durchlauf | wie IB-2 |
| **IB-4** | **Health-Report 06:00 UTC** (kein Eingriff) | Basislauf ist der **nicht** reduzierte Lauf (`isReducedRun`); Gesamtzustand `aktuell-gesund`; keine „141/144"-Meldung; **kein** „Lage-Check veraltet" | erneute Degradations- oder Lage-Fehlalarm-Meldung |
| **IB-5** | **Lage-Check-Cron 10:00 UTC** — zweiter amplifizierter Pfad (§2.5) | Mandat 1 vollständig (~89 ok); Folgemandate mit `skipped-shared` statt `circuit-open`; 6/6 Mandate mit Lage-Ergebnis | Folgemandate zeigen weiterhin ~87 `circuit-open` |

**Fortschreiten nur bei vollständig erfüllter Stufe.** Ergebnisse je Stufe werden in
[`production_beweisprotokoll.md`](production_beweisprotokoll.md) §9 mit Messwerten
festgehalten.

**Ausdrücklich nicht Teil des Beweislaufs:** manuelle oder forcierte Crawls, Migration,
Secret-Änderung, Cron-Änderung, Quellenpaket-Aktivierung, Mandats-Deaktivierung,
Budget-Erhöhung, Flag-Umschaltung.

### 11.4 · Baseline vor dem Fix (gemessen 2026-07-25 10:46 UTC, vor dem ersten Cron unter #120)

| Größe | Wert |
|---|---|
| Letzte Crawl-Durchläufe (04:00, 20:00, 07:31 manuell) | je Mandat 1 `gesund` 145/145/0 · Mandat 2 `stark-degradiert` 144/3/**141** |
| `circuitOpenSources` / `sharedSkippedSources` in `crawlRuns` | durchgängig `null` (Felder existieren, wurden von der Alt-Fassung nie geschrieben) |
| `googleGate` Mandat 2 | `{open: true, observed: 14, breakerFailures: 14}` |
| Lage-Läufe 10:0x | 1× 89 ok / 0 Fehler, 5× 3 ok / 87 Fehler (§2.5) |
| `systemErrors` (`main-auth`) | **65**, jüngster Eintrag **2026-07-20** — insbesondere **kein** `zeitbudget`-Fehler, obwohl seit dem 21.07. täglich 4 Mandate übersprungen wurden (RC-4 war stumm) |
| Neue Rohdokumente je Tag | 25.07. (Teiltag) 97 · 24.07. 283 · 23.07. 296 · 22.07. 315 · 21.07. 302 |
