# Unabhängiger adversarialer Abschlussreview — PR #236 (E1: `tenant_narrative`)

**Datum:** 2026-08-09 · **Geprüfter Stand:** Branch `claude/lage-narrativ-fifth-job-type-4zm1za`,
HEAD `01c3e52` gegen Basis `origin/main` `40e7708` · **Rolle:** unabhängige Gegenprüfung, nicht
Fortsetzung des Umsetzungssprints. Weder PR-Beschreibung noch der Sprintbeleg
[`lage-narrativ-warteschlange-2026-08-09.md`](lage-narrativ-warteschlange-2026-08-09.md) wurden
als Nachweis übernommen; alle Aussagen unten sind eigenständig gemessen oder ausdrücklich als
Rechnung/Simulation gekennzeichnet.

**Ergebnis in einem Satz:** der Merge ist verhaltensneutral und sicher — aber drei Zusagen
galten im **tatsächlich verdrahteten Pfad** nicht, obwohl die Bestandssuiten grün waren; sie
sind in diesem Review behoben und mit Regressionstests plus Mutationsproben abgesichert.

---

## 1 · Sicherheitszustand vor jeder Änderung (rein lesend geprüft)

| Prüfung | Beleg | Ergebnis |
|---|---|---|
| OP-30-Flags default AUS | `narrativFlagAktiv`/`skalierbarerPfadAktiv`, Ausführungsmatrix §4 | **ja**, fail closed |
| Flags irgendwo im Repo gesetzt | `helmut-flags.json`, `vercel.json`, `.github/**` durchsucht | **nein** — kein Treffer; die Allowlist von `flags.js` kennt die OP-30-Flags gar nicht |
| OP-30-Migration in Production angewendet | Supabase, lesend: `helmut_jobs` 0 · `llm_reservations` 0 · Jobqueue-Funktionen 0 · `helmut_reserve_llm_result` 0 | **nein** |
| Neuer Queue-/Worker-Pfad in Production aktiv | ohne Tabelle und ohne Flag strukturell unmöglich | **nein** |
| Betrieb mit 5 Mandaten läuft über die Altarchitektur | `vercel.json` unverändert; Cron-Zeiten unverändert | **ja** |
| Merge ändert Env / führt Migration aus / legt Profile an | Diff enthält keine Env-, Vercel-, Workflow- oder Datenänderung | **nein** |

Es wurde **kein** Production-Eingriff vorgenommen: keine Migration, kein Flag, kein Lauf, keine
Datenänderung. Alle Supabase-Zugriffe waren `select`.

---

## 2 · Befunde

Bewertung: **kritisch** = Produktversprechen bricht bei Aktivierung · **hoch** = falsches Grün
oder unwirksame Zusage · **mittel** = Zahl/Behauptung nicht gedeckt · **niedrig** = Hinweis.

### R1 (**kritisch**, behoben) — die Fälligkeit passte nicht in den Slot, der sie abarbeitet

* **Stelle:** `lib/helmut/source-demand.js`, `NARRATIV_PHASE = ["tenant_narrative", 240, 0.24, 1/3]`
  in `planeMandatsarbeit`.
* **Fehlverhalten:** die Fälligkeit wurde über das **ganze** Phasenfenster gestreut —
  33,3 % − 24 % = **134,4 Minuten** (05:45–08:00 UTC). Abgearbeitet wird sie aber ausschließlich
  vom Cron `lage-briefing`: **ein** Slot mit **230 s** Budget. Der Worker beendet einen Slot
  sofort, wenn nichts *fällig* ist (`scalable-pipeline.arbeite`: `if (!auftraege.length) break`).
* **Gemessen mit dem echten Planer** (`scripts/narrativ-slotvertrag-test.js`, Gegenprobe 1.7/1.8):

  | Mandate | im 05:45-Slot fällig | erst später fällig |
  |---|---|---|
  | 5 | **1** | 4 |
  | 25 | 1 | 24 |
  | 50 | 2 | 48 |
  | 100 | 3 | 97 |
  | 200 | **5** | 195 |
  | 250 | 7 | 243 |

* **Schadensszenario:** nach Aktivierung von E1 entstünde bei den **heutigen 5 Mandaten**
  genau **ein** Narrativ am Morgen; die übrigen vier würden erst im 16:00-Slot fällig — und dort
  hinter Priorität 60 (`source_fetch`) und 100 (`document_understanding`) eingereiht
  (`order by priority asc, due_at asc`, Migration `20260808_scalable_job_queue.sql:323`). Die
  **Morgenlage stünde am Nachmittag**. Über 97 % des Slotbudgets blieben ungenutzt.
* **Warum die Tests es übersahen:** die Simulation (`scripts/fixtures/skalierung-lauf.js`) nimmt
  einen Worker **alle 2 Minuten** an (`taktMs = VORBEDINGUNG_WARTE_MS`); Production hat vier
  Cron-Slots am Tag. Mit einem Zwei-Minuten-Takt wird eine 134-Minuten-Streuung lückenlos
  bedient — der Defekt ist in diesem Modell strukturell unsichtbar. Der Sprintbeleg benennt die
  Abweichung („die Simulation nimmt Worker alle 2 Minuten an"), zieht daraus aber nur die
  Folgerung über die *Slot-Kapazität*, nicht über die *Fälligkeit*.
* **Korrektur:** die Streuung des Narrativs ist auf `NARRATIV_STREU_MS = 1000` begrenzt
  (1 ms je Rotationsrang). Phasenbeginn 24 % und Obergrenze 33,3 % bleiben unverändert; die
  Fälligkeit liegt weiterhin im Morgenkorridor, nur an dessen Anfang. Die **Rotationsreihenfolge
  (Befund O1) bleibt bestimmend** — nachgewiesen in 1.4/1.5.
  Nach der Korrektur: **alle** Aufträge jeder Stufe sind im Slot fällig (5/5 … 250/250).

### R2 (**hoch**, behoben) — der verdrahtete Narrativ-Worker bekam keinen Tagesplan

* **Stelle:** `server.js`, Zweig `if (scalablePipeline.narrativUeberWarteschlange())` — der
  Aufruf `workerBetrieb.durchlauf({ kennung, grenzen, typen })` **ohne** `tagesplan`.
* **Fehlverhalten:** ohne Tagesplan liefert `budgetAdapter.deckelFuer` `null`, also geht
  `scopeMax: null` in `helmut_reserve_llm_result`. Die SQL-Funktion überspringt den
  Mandantenanteil dann vollständig (`if p_scope <> 'global' and p_scope_max is not null`).
  Folge: `llm-budget-fair.mandantenDeckel` wird **nie** aufgerufen, und in
  `llm_budget_counters` entsteht **keine einzige** `tenant:<id>`-Zeile.
* **An echter PostgreSQL 16.13 nachgemessen** (§3, Probe B5): fünf Reservierungen desselben
  Mandats ohne `scopeMax` → **keine** Mandantenzeile, kein Deckel. Mit `scopeMax = 1` wären vier
  davon abgelehnt worden.
* **Schadensszenario:** das ist Befund **O1** — und zwar bei genau dem Verbraucher, für den O1
  gebaut wurde. Der Betreiber sähe den mandatsbezogenen KI-Verbrauch nirgends
  (`helmut_llm_budget_kennzahlen.mandanten_mit_verbrauch` = 0,
  `groesster_mandantenanteil` = 0). Zusätzlich verhielte sich derselbe Auftragstyp **je nach
  Slot verschieden**: im 16:00-Slot (`runCronUeberWarteschlange`) gilt der Mandantendeckel, im
  05:45-Slot nicht.
* **Warum die Tests es übersahen:** `tenant-narrativ-test.js` 5.9 prüft `mandantenDeckel` als
  **isolierte Hilfsfunktion**; keine Zusicherung prüft, was `server.js` dem Worker übergibt.
* **Korrektur:** neuer Einstieg `scalable-pipeline.tagesplanFuerLauf` — liefert den Tagesplan
  **ohne zu planen** (liest die aktiven Profile, rechnet die Zuteilung; dieselbe eine
  Profilabfrage, die der Altpfad an dieser Stelle ohnehin machte) und wird im Narrativzweig
  übergeben. Die Form des Objekts kommt aus **einer** Funktion (`tagesplanSicht`), die sich
  `planeArbeit` und der neue Einstieg teilen. Schlägt etwas fehl → `null`, und der Worker meldet
  ehrlich `budgetSchicht: "ohne-tagesplan"`.

### R3 (**hoch**, behoben) — eine unerreichbare Warteschlange meldete Erfolg

* **Stelle:** `server.js`, derselbe Zweig:
  `status: durchlauf.gestartet === false ? "partial" : "success"`.
* **Fehlverhalten:** `gestartet` ist `true`, sobald der Worker **startet** — auch wenn jeder
  Wurf `verfuegbar: false` zurückgibt (fehlende Migration). Die Rückgabe der Route trug zudem
  **kein** `ok`/`verfuegbar`/`grund` auf oberster Ebene.
* **Ausgeführt nachgestellt** (Probe, Migration fehlt): Altpfad durch das Flag abgeschaltet,
  **0** Narrative erzeugt, `recordProcessRun(status = "success")`.
* **Schadensszenario:** Betreiber schaltet beide Flags, vergisst die Migration → jeden Morgen
  „success", **null** Narrative, kein Alarm. Das ist genau das falsche Grün, das
  `CLAUDE.md` §4.4 verbietet — und `runCronUeberWarteschlange` vermeidet es an derselben
  Stelle bereits ausdrücklich („Eine nicht erreichbare Warteschlange ist kein stiller Erfolg").
* **Korrektur:** `warteschlangeVerfuegbar` wird aus den Bilanzen bestimmt; Status `partial`
  statt `success`, Rückgabe trägt `ok`/`verfuegbar`/`grund`/`tagesplanVorhanden`, die Logzeile
  nennt beides. Gegenprobe 4.7: eine erreichbare, **leere** Warteschlange bleibt ein Erfolg.

### R4 (**mittel**, nicht behoben — geerbt, Betreiberentscheidung)

**Ein KI-Aufruf zählt zweimal gegen den Tagesdeckel, sobald `HELMUT_LLM_FAIRNESS` an ist.**
`helmut_reserve_llm_result` (Fairness-Schicht des Handlers) und `helmut_reserve_llm_call`
(Choke-Point in `ai.js` vor jedem Modellaufruf) schreiben **dieselbe Zeile**
`llm_budget_counters(day,'global')`. An echter PostgreSQL gemessen (Probe B1): ein Narrativ →
`global.used = 2`, `tenant:<id>.used = 1`.

* **Nicht neu in PR #236:** `handleDocumentUnderstanding` verhält sich auf `main` identisch;
  PR #236 erweitert das Muster nur auf den Narrativpfad.
* **Folge für die Zahlen dieser PR:** die dokumentierte Deckelanforderung „200 Mandate brauchen
  ~1 056 KI-Aufrufe/Tag" beschreibt **Modellaufrufe**. Der wirksame Zählerbedarf ist bei
  aktiver Fairness ungefähr **das Doppelte**. `HELMUT_MAX_LLM_CALLS_PER_DAY` muss entsprechend
  gesetzt werden, sonst greift der Deckel bei der Hälfte der Arbeit.
* **Ebenfalls gemessen (B3):** eine Wiederholung nach *gemeldetem* Fehlschlag ruft das Modell
  erneut auf, zieht aber keine zweite Fairness-Reservierung (`wiederverwendet = true`). Zwei
  echte Aufrufe, `global.used = 3`. `llm_budget_counters.global` ist damit **keine wahrheitsgemäße
  Zählung der Modellaufrufe** — weder Ober- noch Untergrenze.
* **Nicht hier korrigiert:** die Auflösung berührt den Verstehenspfad auf `main` und die
  Frage, welcher der beiden Zähler die Wahrheit sein soll. Das ist eine Architekturentscheidung
  des Betreibers, nicht Umfang dieses Reviews.

### R5 (**mittel**, nicht behoben) — die Kapazitätsaussage des Sprintbelegs ist zu günstig

Der Beleg rechnet „der 05:45-Slot schafft ~39 Aufrufe" aus dem **Mittelwert** 11,8 s. Zwei
Gründe machen das zu optimistisch:

1. Ein Slot kann nur bedienen, was **fällig** ist (Befund R1) — vor der Korrektur waren das
   1–7 Aufträge, nicht 39.
2. Die Laufzeit ist stark rechtsschief (4 von 134 Aufrufen über 120 s, Maximum 472 s). Ein
   einzelner am `HELMUT_JOB_TIMEOUT_MS` (120 s) abgeschnittener Aufruf verbraucht **mehr als die
   Hälfte** des 225-s-Workerbudgets. Mit der Verteilung statt dem Mittelwert gerechnet trägt der
   Slot bei Parallelität 2 realistisch **~14**, nicht 39 (§5).

Die Aussage „mit dem Watchdog-Slot ~78 von 200 am Vormittag" ist zusätzlich nicht gedeckt: der
Watchdog ruft `/api/cron/pipeline` (typoffener Worker), dort stehen `source_fetch` (60) und
`document_understanding` (100) **vor** dem Narrativ (240) — bei 200 Mandaten füllt die
Abrufarbeit den Slot.

### R6 (**mittel**, nicht behoben — Betreiberentscheidung) — neue Suite reißt das CI-Zeitlimit

`scripts/narrativ-stress-1000-test.js` überschreitet das Zeitlimit des kanonischen Runners
(`scripts/run-offline-tests.js`, `timeout: 180000`). Hier gemessen, allein laufend:
**214,5 s** und **190,4 s** (Suite selbst `exit = 0`, der Runner schießt sie ab). Im
GitHub-CI dieser PR blieb sie darunter — die Marge hängt an der Hardware.

* **Schaden:** ein Pflicht-Check (`Syntax + Offline-Suiten`) kann ohne echten Defekt rot werden.
* **Bewusst nicht geändert:** den Umfang zu kürzen hieße, den Test zu schwächen. Die Suite ist
  laut eigenem Kopf **kein Abnahmekriterium**; die saubere Auflösung (aus dem Pflicht-Gate
  nehmen oder das Runner-Limit anheben) ändert das CI-Gate und ist Betreiberentscheidung.

### Kein Problem (eigenständig geprüft, Behauptung bestätigt)

* **Doppelpfad** — ausführungsseitig widerlegt, §4.
* **Cache-Treffer bezahlen nichts** — B2: Reservierung zurückgegeben, beide Zähler auf 0,
  Status `zurueckgegeben`.
* **Keine Überbuchung bei Nebenläufigkeit** — B7: 40 gleichzeitige Worker gegen Deckel 10 →
  genau 10. B8: 20 gleichzeitige Versuche desselben `result_key` → **eine** Zeile, `used = 1`.
* **Mandantenanteil ohne Deckung wird zurückgenommen** — B6.
* **Späte Rückgabe einer verbrauchten Reservierung ist wirkungslos** — B9.
* **Tenantbindung** — jeder Auftrag trägt `tenantId = mandatsId`; der Idempotenzschlüssel
  `tenant_narrative|<mandat>|<fenster>` ist mandats- und fenstergebunden.
* **Deaktivierte Mandate** — Planer filtert über `profile-validation.isDisabled`, der Handler
  prüft unmittelbar vor dem Modellaufruf erneut.
* **Migration/Rollback** — rein additive CHECK-Erweiterung; Rollback entfernt nur
  Warteschlangenzeilen des Typs und ist auch nach dem Basis-Rollback idempotent.
* **Wiedervorlage** — fasst `tenant_narrative` nicht an (Standardtypmenge
  `array['document_understanding']`); richtig, weil ein neues Fenster ohnehin einen neuen
  Auftrag erzeugt.

---

## 3 · Budgetvertrag, an echter PostgreSQL 16.13 nachgemessen

Migrationen `20260717_llm_budget_reservation.sql` + `20260808_llm_budget_fairness.sql` auf eine
frische Datenbank, dann die Aufrufreihenfolge des Handlers nachgestellt.

| Probe | Frage | Ergebnis |
|---|---|---|
| B1 | zählt ein Narrativ einmal? | **nein — `global.used = 2`**, `tenant = 1` (→ R4) |
| B2 | Cache-Treffer | Rückgabe wirkt: beide Zähler 0, Status `zurueckgegeben` ✔ |
| B3 | Wiederholung nach gemeldetem Fehlschlag | `wiederverwendet = true`, keine zweite Fairness-Buchung; zwei echte Aufrufe → `global.used = 3` (→ R4) |
| B4 | Mandantendeckel 0 | `mandantenanteil-erschoepft`, global unberührt ✔ |
| B5 | `scopeMax = null` (Zustand vor R2-Fix) | **keine** `tenant:`-Zeile, kein Deckel |
| B6 | globales Limit erreicht | Mandantenanteil in derselben Transaktion zurückgenommen ✔ |
| B7 | 40 gleichzeitige Worker, Deckel 10 | genau **10** erlaubt, `used = 10` ✔ |
| B8 | 20 gleichzeitige Versuche, gleicher `result_key` | **1** Zeile, `used = 1` ✔ |
| B9 | Rückgabe nach `settle` | wirkungslos, `used` bleibt 1 ✔ |

**Vollständiger Vertrag des Narrativpfads** (Handler `handleTenantNarrative`):

| Zustand | Reservierung | Modellaufruf | Buchung |
|---|---|---|---|
| Cache-Treffer, frische Reservierung | gezogen | nein | **freigegeben** |
| Cache-Treffer, wiederverwendete Reservierung | wiederverwendet | nein | bleibt (keine Doppelbuchung) |
| echter Aufruf, Erfolg | gezogen | ja | **verbraucht** |
| inneres Budget-Gate (`reason: budget`) | gezogen | nein | freigegeben, zurückgestellt |
| fremde Sperre (`generating`) | gezogen | nein | freigegeben, kurz zurückgestellt |
| Leerzustand (`no-vorgaenge`) | gezogen | nein | freigegeben, `ok` ohne Veröffentlichung |
| `v3-disabled` / `no-profile` | gezogen | nein | freigegeben, **endgültig** |
| `ai-unavailable` | gezogen | **kann stattgefunden haben** | **nicht** freigegeben (konservativ) |
| `store-error` | gezogen | nein | freigegeben, vorübergehend |
| Wurf/Zeitlimit | gezogen | offen | als `fehlgeschlagen` gemeldet; Wiederholung bucht nicht erneut |
| Fairness lehnt ab | keine | nein | nach 48 h `budget-dauerhaft-erschoepft` (endgültig, kritisch) |

**Grenze, ausdrücklich:** ein durch `mitZeitgrenze` abgeschnittener Aufruf (>120 s) bricht die
darunterliegende Zusage **nicht** ab — `buildLageBriefing` läuft im Hintergrund weiter und kann
den Tagescache noch füllen. Der Auftrag wird wiederholt und findet das Ergebnis dann im Cache.
Kosten entstehen dabei einmal, gezählt wird einmal (Fairness) bzw. zweimal (Choke-Point, R4).

---

## 4 · Doppelpfad: Ausführungsmatrix der echten Route

Die Bestandssuite belegt „kein Doppelpfad" mit **Regex am Quelltext** von `server.js`
(`tenant-narrativ-test.js` §8). Hier fährt der Test die reale Route
`/api/cron/lage-briefing` über HTTP durch `server.js` und zählt, welcher Pfad **lief**
(`scripts/narrativ-slotvertrag-test.js` §2).

| # | Flags | erwartet | gelaufen |
|---|---|---|---|
| 1 | alle aus | Altpfad | Altpfad ✔ |
| 2 | nur `HELMUT_SCALABLE_PIPELINE` | Altpfad | Altpfad ✔ |
| 3 | nur `HELMUT_LLM_FAIRNESS` | Altpfad | Altpfad ✔ |
| 4 | nur `HELMUT_RELEVANZORDNUNG` | Altpfad | Altpfad ✔ |
| 5 | nur `HELMUT_NARRATIV_QUEUE` | Altpfad | Altpfad ✔ |
| 6 | Pipeline + Fairness | Altpfad | Altpfad ✔ |
| 7 | Pipeline + Narrativ | Warteschlange | Warteschlange ✔ |
| 8 | alle vier | Warteschlange | Warteschlange ✔ |
| 9 | `NARRATIV_QUEUE=yes` (ungültig) | Altpfad | Altpfad ✔ |
| 10 | `NARRATIV_QUEUE=""` | Altpfad | Altpfad ✔ |
| 11 | `ON`/`ON` (Großschreibung) | Warteschlange | Warteschlange ✔ |
| 12 | `On`/`True` (gemischt) | Warteschlange | Warteschlange ✔ |
| 13 | `NARRATIV_QUEUE=off` | Altpfad | Altpfad ✔ |
| 14 | `" on "` mit Leerzeichen | Warteschlange | Warteschlange ✔ |
| 15 | `1`/`an` | Warteschlange | Warteschlange ✔ |

In **keiner** der 15 Kombinationen liefen beide Pfade. **Der Doppelpfad ist widerlegt.**

**Fachliche Einmaligkeit** (über die Job-Ebene hinaus) ruht auf drei unabhängigen Riegeln:
Idempotenzschlüssel `tenant_narrative|<mandat>|<fenster>` (ein Auftrag je Mandat und Fenster) ·
`acquirePipelineLock('lage-briefing-<mandat>')` (nur ein Generator, auch gegen Altpfad und
App-Start-Nachzieher) · idempotenter Tagescache `bf-<mandat>-lage-<Berlin-Tag>` mit
`koSetHash`. **Nicht** abgedeckt: die nutzergetriebenen Aufrufe von `buildLageBriefing`
(`/api/app/start`-Nachzieher, `?force=`) laufen unverändert außerhalb der Warteschlange und
damit außerhalb der Fairness-Reservierung — Bestand, nicht neu, aber für die Kostenzählung
relevant.

---

## 5 · Kapazität: 200 Morgenlagen im echten Zeitfenster

**Alle Werte hier sind RECHNUNG bzw. SIMULATION**, keine Production-Messung. Herkunft jeder
Eingangsgröße:

| Größe | Wert | Herkunft |
|---|---|---|
| Cron-Slots | crawl 04:00/20:00 · pipeline 16:00 · lage-briefing 05:45 (UTC) | `vercel.json`, **gelesen** |
| `maxDuration` | 300 s | `vercel.json` |
| Narrativ-Slotbudget | 230 000 ms, Abschlussreserve 5 000 ms | `server.js`, `scalable-pipeline.js` |
| Workerparallelität | Default **2**, harte Klemmung **1…8** | `worker-betrieb.js` `grenzenAusEnv` |
| Auftragszeitlimit | 120 000 ms | `scalable-pipeline.js` `AUFTRAG_MAX_MS` |
| Anspruchsordnung | `priority asc, due_at asc` | `20260808_scalable_job_queue.sql:323` |
| Prioritäten | 60 / 100 / 200 / **240** / 250 | `source-demand.js` |
| Narrativlaufzeit | Median 5,05 s · p95 24,3 s · Max 472 s · Mittel 11,8 s | Production-Metadaten der PR (n = 134) — **gemessen, aber nicht von diesem Review** |

**Nutzbare Worker im echten Betrieb:** genau **einer** — der Cron `lage-briefing`. `crawl` und
`pipeline` sind typoffen; dort steht das Narrativ (240) hinter Abruf (60) und Verstehen (100).
`worker-betrieb.betreibe` (langlaufender Prozess) ist **nirgends verdrahtet** und geht deshalb
**nicht** in diese Rechnung ein.

### 5.1 Kapazität des Morgenslots (nach der R1-Korrektur, Verteilung statt Mittelwert)

| Szenario | par 2 | par 4 | par 6 | par 8 |
|---|---|---|---|---|
| optimistisch (Laufzeiten Richtung Median, 0 % Fehler) | 23 | 94 | 147 | 218 |
| **realistisch** (gemessene Verteilung, 5 % Fehler) | **14** | 52 | 96 | **127** |
| ungünstig (Faktor 1,8, 15 % Fehler) | 11 | 26 | 50 | 65 |

### 5.2 Stufen 5 / 25 / 50 / 100 / 200 im Morgenslot, Parallelität 2 (Standard)

| Szenario | Mandate | morgens fertig | Rückstand | Median | p95 | max | Aufrufe | Wdh. |
|---|---|---|---|---|---|---|---|---|
| realistisch | 5 | **5** | 0 | 27 s | 31 s | 31 s | 6 | 1 |
| realistisch | 25 | 14 | 11 | 81 s | 186 s | 186 s | 15 | 1 |
| realistisch | 50 | 14 | 36 | 81 s | 186 s | 186 s | 15 | 1 |
| realistisch | 100 | 14 | 86 | 81 s | 186 s | 186 s | 15 | 1 |
| realistisch | 200 | 14 | **186** | 81 s | 186 s | 186 s | 15 | 1 |
| ungünstig | 5 | **5** | 0 | 48 s | 56 s | 56 s | 6 | 1 |
| ungünstig | 200 | 11 | 189 | 84 s | 182 s | 182 s | 12 | 1 |
| optimistisch | 200 | 23 | 177 | 148 s | 209 s | 218 s | 25 | 2 |

Der Rückstand ist **nicht verloren** — er wird im 16:00-Slot abgebaut (dort hinter der
Abrufarbeit). Er ist aber keine **Morgen**lage mehr.

### 5.3 Höchste Mandatszahl mit ≥ 25 % Kapazitätsreserve, ein Morgenslot

| Szenario | par 2 (Standard) | par 4 | par 8 (Maximum) |
|---|---|---|---|
| optimistisch | 18 | 75 | 174 |
| **realistisch** | **11** | 41 | **101** |
| ungünstig | 8 | 20 | 52 |

**Damit ist die Kapazitätsfrage beantwortet — und die Antwort ist negativ:**

> **200 Morgenlagen sind mit der heutigen Verdrahtung nicht erreichbar, auch nicht bei der
> maximal zulässigen Workerparallelität 8.** Im realistischen Szenario trägt ein Morgenslot
> ~127 Narrative; mit der geforderten Reserve von 25 % entspricht das **~101 Mandaten**. Selbst
> im optimistischen Szenario erreicht Parallelität 8 zwar 200, aber nur mit **+9 %** Reserve —
> das Kriterium „≥ 25 %" ist in **keinem** Szenario erfüllt.

### 5.4 Kosten (übernommen, nicht nachgerechnet — mit einer Korrektur)

Die Kostentabelle des Sprintbelegs (§9 dort) bleibt gültig: **~2,39 USD/Tag**, **0,26
USD/Mandat/Monat**, **52,57 USD/Monat** bei 200 Mandaten; Preisbasis ist eine **interne
Schätzlogik, kein Anbieterpreis**. Gescheiterte Aufrufe werden als **unbekannte Kosten**
geführt, nie als 0.

**Korrektur (R4):** der Bedarf „~1 056 KI-Aufrufe/Tag" zählt **Modellaufrufe**. Bei aktivem
`HELMUT_LLM_FAIRNESS` verbraucht jeder davon **zwei** Einheiten von
`HELMUT_MAX_LLM_CALLS_PER_DAY`. Der Deckel ist entsprechend zu bemessen.

---

## 6 · Architekturentscheidung (Antwort auf die Fragen des Auftrags)

1. **Reicht die vorhandene Architektur für 200 Morgenlagen?** **Nein** — nicht für die
   *Morgen*lage. Die Warteschlange selbst ist nicht der Engpass (Stresslauf 1 000); der Engpass
   ist **ein** Slot von 230 s mit höchstens 8 Workern.
2. **Muss die Workerparallelität erhöht werden?** **Ja** — von 2 auf 8 hebt den Slot von ~14 auf
   ~127 (realistisch). Das ist eine reine Env-Änderung (`HELMUT_WORKER_PARALLEL`), **aber** sie
   ist in Production nur vom Betreiber setzbar.
3. **Werden zusätzliche Zeitfenster gebraucht?** **Ja, ab ~100 Mandaten.** Selbst par 8 trägt
   mit Reserve nur ~101.
4. **Beides?** Für 200 mit 25 % Reserve: **ja** — par 8 **und** mindestens ein zweiter
   Morgenslot (rechnerisch ~2 Slots à par 8; ein dritter gibt die Reserve).
5. **Zusätzliche Infrastruktur/laufende Kosten?** Mehr Cron-Slots und höhere Parallelität sind
   Vercel-Konfiguration, keine neue Infrastruktur. Die Modellkosten ändern sich **nicht** (die
   Zahl der Aufrufe bleibt gleich, nur ihre Verteilung ändert sich). Der langlaufende Worker
   (`worker-betrieb.betreibe`) wäre neue Infrastruktur und ist **nicht** nötig.
6. **Kleinste ausreichende Lösung?** `HELMUT_WORKER_PARALLEL=8` + ein zweiter
   Narrativ-Cron-Slot am Morgen. Beide reversibel, beide Betreiberaktion.
7. **Realistische Kapazität der aktuellen Konfiguration:** **~11 Mandate** mit voller
   Morgenreserve (par 2). Das deckt sich mit der bereits geführten Empfehlung „Obergrenze
   10 Mandate".
8. **Bis zu welcher Stufe kann ohne weitere Entscheidung aktiviert werden?** Bis **Stufe 1
   (5 Mandate)** — dort ist die Morgenlage in **jedem** Szenario vollständig
   (5/5, auch ungünstig). Ab 25 Mandaten ist die Erhöhung der Parallelität eine Voraussetzung,
   ab ~100 zusätzlich ein weiterer Slot.

**Diese Punkte sind ausdrücklich NICHT umgesetzt** — sie berühren Vercel-Konfiguration,
Production-Env und Cron-Einträge und sind damit ausdrücklich Gründer-/Betreiberentscheidungen
(`CLAUDE.md` §5).

---

## 7 · Testergebnisse (Zahlen, keine Behauptungen)

Umgebung: Node v22.22.2 · **echte lokale PostgreSQL 16.13** (Port 5433, Rollen `anon`,
`authenticated`, `service_role` angelegt) · alle Läufe über `scripts/lokal.js` (lokaler
Production-Schutz aktiv).

| Lauf | Ergebnis |
|---|---|
| Offline-Suite **`origin/main`** (Basis) | **225/229 grün** in 463 s |
| Offline-Suite **PR #236 vor diesem Review** | **228/233 grün** in 713 s |
| Offline-Suite **PR #236 nach den Korrekturen** | **230/234 grün** in 686 s |
| **Neu:** `narrativ-slotvertrag-test.js` | **66 PASS / 0 FAIL** |
| Mutationsprobe R1 (Streuung zurückgedreht) | **12 FAIL** — erkannt |
| Mutationsprobe R2 (Tagesplan entfernt) | **4 FAIL** — erkannt |
| Mutationsprobe R3 (Status wieder `success`) | **2 FAIL** — erkannt |
| nach Wiederherstellung aller drei | **66 PASS / 0 FAIL** |
| Budgetproben B1–B9 an echter PostgreSQL | 9 Proben, Ergebnisse in §3 |
| `current-state-groesse-test.js` | **4 PASS / 0 FAIL** (29 758 Zeichen / 348 Zeilen) |
| **Browser-/Mobile-Smoke (Chromium)** | **32 PASS / 0 FAIL** |

Die vier roten Suiten sind nach den Korrekturen **exakt** die vier der `origin/main`-Basis.
`narrativ-stress-1000-test.js` lief im Lauf nach den Korrekturen durch (sie liegt genau an der
Zeitgrenze — siehe R6).

**Rote Suiten, ehrlich eingeordnet:**

| Suite | auf `main`? | Einordnung |
|---|---|---|
| `privacy-vollstaendigkeit-test.js` | **ja** | bekannte Baseline |
| `profile-db-test.js` | **ja** | bekannte Baseline (Netz-Guard) |
| `provision-tenant-test.js` | **ja** | bekannte Baseline |
| `tenant-neutrality-test.js` | **ja** | bekannte Baseline |
| `narrativ-stress-1000-test.js` | nein (neu) | **umgebungsbedingt** — Runner-Zeitlimit, siehe R6 |

**Keine neue Regression.** Die vier Baseline-Fehler sind auf `origin/main` identisch rot.

---

## 8 · Was dieser Review NICHT belegt

* Keine **Production**-Messung. Alle Kapazitätszahlen sind Rechnung/Simulation auf Basis von
  Production-**Metadaten**, die dieser Review nicht selbst erhoben hat.
* Keine echten Modelllaufzeiten gemessen; die Verteilung ist nachgebildet.
* Es gibt **10** echte Profile, nicht 200 — jede Stufenaussage über 10 hinaus ist synthetisch.
* Der wirksame Production-Deckel (`HELMUT_MAX_LLM_CALLS_PER_DAY`) ist aus Sitzungen **nicht
  lesbar** (Egress-Sperre auf `api.vercel.com`).
* R4 (Doppelzählung) ist gemessen, aber **nicht** aufgelöst.

---

## 9 · Sprintzustand

**Teilweise abgeschlossen.** Die Prüfung ist vollständig, drei Befunde (1 kritisch, 2 hoch) sind
behoben und mit Regressionstests plus Mutationsproben abgesichert. Offen bleiben: die
Betreiberentscheidungen zu Parallelität und Zeitfenstern (§6), R4 und R6, sowie jeder
Production-Nachweis.

**Merge-Empfehlung:** PR #236 ist **verhaltensneutral und mergefähig**. Der Merge aktiviert
nichts, wendet keine Migration an und ändert keine Env. Er macht Helmut **nicht** aktivierungsbereit
für 200 Production-Mandate — die dafür nötigen Entscheidungen stehen in §6.
