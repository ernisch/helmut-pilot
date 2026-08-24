# E1 — Lage-Narrativ als fünfter Auftragstyp `tenant_narrative` (Sprint 2026-08-09)

**Stand:** 2026-08-09 · **Basis:** `origin/main` `40e7708` (Merge von PR #235) ·
**Branch:** `claude/lage-narrativ-fifth-job-type-4zm1za`
**Rolle:** kanonischer Sprintbeleg. Der kompakte Stand steht in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

> **In diesem Sprint wurde nichts aktiviert.** Kein Flag gesetzt, keine Migration angewendet,
> keine Environment-Änderung, kein manueller Production-Lauf, kein Mandat angelegt oder
> geändert, kein Merge. Alle Production-Zugriffe waren **lesend**. Alle lokalen Läufe liefen
> über `scripts/lokal.js` (Production-Zugangsdaten wurden nie an Kindprozesse gereicht).

---

## 1 · Ausgangslage und Production-Schutzprüfung (rein lesend)

| Prüfung | Ergebnis |
|---|---|
| PR #235 gemergt | ja — Merge-Commit `40e7708`, 2026-08-09T09:34:35Z; Branchbasis = `origin/main`-HEAD |
| Production-Deployment des Merges | **READY** — `dpl_A8NX4DoxEGeTx2fn8M8cQftyFfd5`, target `production`, Commit `40e7708a…` (Vercel-API, lesend) |
| OP-30-Migrationen angewendet? | **nein** — `helmut_jobs` existiert nicht, 0 der 6 OP-30-Funktionen vorhanden (`information_schema`/`pg_proc`, lesend) |
| OP-30-Flags | **nirgends gesetzt**: nicht in `vercel.json`, nicht in `helmut-flags.json` (dessen Allowlist kennt sie gar nicht); Code-Default AUS, fail closed. Vercel-Env aus Sitzungen nicht lesbar (env-inventar §8) — kein gegenteiliger Laufzeitbeleg |
| Mandate | **unverändert 5 aktiv**, 9 Profile gesamt, 4 deaktiviert (lesend) |
| Worker/Queue automatisch gestartet? | nein — kein Lauf, keine Tabelle, Flags aus |
| Reguläre Läufe seit dem Merge | Alle fünf Läufe des 2026-08-09 bis 05:45Z (globalphase 04:01, understanding-eager, briefing-morning, understanding-cron, **briefing-lage 05:45**: 9 Ziele, 9 verarbeitet, 0 Fehler, 32,3 s) liefen **vor** dem Merge auf `559a3d9` und waren `success`/planmäßig-`partial`. Die zunächst offene Laufprüfung wurde **im Sprint nachgeholt**: der erste reguläre Lauf auf `40e7708` — `understanding-lage`, `lage-20260809100105-r2ne1` (planmäßiger 10:00Z-Slot) — endete **`success`**, 173 473 ms, 6 verarbeitet, 0 Fehler, `commit_ref=40e7708a…`. **Keine erkennbare Regression durch PR #235**, soweit ein einzelner Lauf das zeigen kann |

## 2 · Der bisherige Lage-Narrativ-Pfad (Block „verstehen vor ändern")

1. **Auslöser/Zeitplan:** Cron `lage-briefing` 05:45 UTC (`vercel.json`, maxDuration 300).
   Route `server.js /api/cron/lage-briefing`: Schleife über **alle** Profile, deaktivierte
   werden übersprungen, Zeitbudget 240 s, je Mandat `buildLageBriefing(profile)`.
   Zusätzlich on-demand: App-Start liefert `cacheOnly` (nie ein Live-KI-Aufruf, P1-7) und
   stößt die Erzeugung asynchron an.
2. **Eingangsdaten:** verstandene Vorgänge (`knowledge_objects`, `understanding_status=
   complete`) + gespeicherte Matches (`listMatchingResults` — die **Projektion der
   Vorläufe**, nicht desselben Morgens) + echte Quellen je Vorgang. Abhängigkeit im
   Cron-Fahrplan: crawl 04:00 → understanding 05:30 → lage 05:45.
3. **Prompt/Modell:** `ai.generateLageBriefing` → `requestStructuredJson`,
   `understandingModelName()` (Production ausschließlich `gpt-5-mini`), max 250 Wörter,
   `vorgang_ids` gegen die vorgelegte Menge gefiltert (keine erfundenen Belege).
4. **Wiederholung/Fehler/Kosten:** kein eigener Retry; Fehler ⇒ `null` ⇒ ehrlicher
   Leerzustand (`ai-unavailable`). Budget dreifach: globaler Tageszähler (Choke-Point,
   `LLM_BUDGET_EXHAUSTED` ⇒ `budget`), per-Mandat-EUR-Deckel aus dem Profil
   (`canSpendLlmForTenant`), Skip-Marker `skipped-lage-narrativ` (belegt kostenfrei).
   Kostenlog `llmUsage` (Auth-Store) je Aufruf mit Modell, Token, Dauer, `politicianId`.
5. **Speicherung/Veröffentlichung:** idempotenter Tagescache `briefings`-Zeile
   `bf-<mandat>-lage-<Berlin-Tag>` mit `koSetHash` (Fingerabdruck der Eingangsmenge).
   Sichtbar wird **nur** dieser Cache — es gibt keinen zweiten Schreibweg.
6. **Tenant-Trennung:** `politicianId` zieht durch alle Schichten; Cache-Id trägt das
   Mandat; Lesen über `tenantRequest`. Sperre `lage-briefing-<mandat>` (90 s) gegen
   parallele Generatoren.
7. **Rand- und Störfälle:** keine Daten ⇒ `no-vorgaenge` (kein Fake) · Cache-Treffer bei
   unverändertem `koSetHash` ⇒ kein Aufruf · parallele Aufrufe ⇒ Sperre, `generating` ·
   Abbruch vor dem Cache-Schreiben ⇒ sichtbarer Stand unverändert, Wiederholung erzeugt neu.

**Warum der Pfad 200 Mandate nicht trägt:** ein einziger 300-s-Slot, sequenziell je Mandat.
Production-Metadaten (§5): Median 5,05 s, p95 24,3 s je Aufruf — 200 × 5 s ≈ 1 010 s Median
allein an Anbieterzeit, mehr als das Dreifache des Slots. Dazu ein realer Langschwanz:
4 von 134 Aufrufen über 120 s, Maximum **472 s** — **ein einzelner** Aufruf kann länger
dauern als der gesamte Slot. Nicht erreichte Mandate holt erst der nächste Tagesslot nach.
Inhalt, Prompt, Modell und sichtbare Qualität wurden in diesem Sprint **nicht verändert**.

## 3 · Was gebaut wurde (E1 umgesetzt, alles hinter default-AUS-Flags)

- **Migration `20260809_jobqueue_narrativ.sql` (+ Rollback, NICHT angewendet):** erweitert
  ausschließlich die CHECK-Menge um `tenant_narrative` — der in der Basismigration
  vorgesehene „Ein-Zeilen-Migrationsschritt". Rollback entfernt die Warteschlangenzeilen
  des Typs (Betriebszustand; die veröffentlichten Narrative liegen im Briefing-Tagescache
  und bleiben unberührt) und stellt die Vier-Typen-Menge wieder her; idempotent auch nach
  dem Basis-Rollback.
- **Neues Flag `HELMUT_NARRATIV_QUEUE`** (default AUS, fail closed; wirksam **nur**
  zusammen mit `HELMUT_SCALABLE_PIPELINE`). Warum ein eigenes Flag nötig ist: der
  Aktivierungsplan schaltet die Queue in Stufe 2 (5 Mandate), E1 erst ab Stufe 5 — ohne
  eigenes Flag zöge die Pipeline das Narrativ sofort mit um, und der Rückweg wäre nur über
  die Abschaltung der gesamten Warteschlange möglich.
- **Planung** (`source-demand.planeMandatsarbeit`, additiver Parameter): je aktivem Mandat
  und 24-h-Fenster genau **ein** Auftrag `tenant_narrative|<mandat>|<fenster>`,
  `tenant_id` = Mandat, Priorität 240, Fälligkeit im **Morgenkorridor [24 %, 33,3 %)** des
  Fensters (= 05:45–08:00 UTC; abgeleitet aus dem bestehenden Cron-Slot 05:45 und dem
  Beginn des zweiten geteilten 8-h-Abruffensters — keine neue Produktzusage), Platz nach
  Tagesrotation (O1). Payload: **nur** `mandatsId`, keine Inhaltskopien.
- **Vorbedingungen:** `source_fetch` + `document_understanding` der enthaltenen Fenster —
  **nicht** die Projektion desselben Fensters (die läuft erst ab 50 % des Tages; der
  Altpfad liest um 05:45 dieselben gespeicherten Vortags-Matches). Bestehender
  Mechanismus (`helmut_jobs_offen`, O3-Fensterliste), Wartefrist ab Entstehung, danach
  läuft das Narrativ mit dem, was da ist (kein Pendeln).
- **Handler `handleTenantNarrative`:** ruft die **unveränderte** `lage.buildLageBriefing`
  auf. Zusätzlich: Flaggrenze im Handler (Rückbau-Restauträge werden ohne Modellpfad
  übersprungen), erneute Deaktiviert-Prüfung unmittelbar vor Ausführung
  (`profile-validation.isDisabled`), Fairness-Reservierung `art=lageBriefing`
  (Scope `tenant:<mandat>`, Gegenstand = Fenster — **der Verbraucher, der O1 fehlte**),
  O4-Disziplin (48 h Budgetwarten, dann endgültig), Ergebnisabbildung: `available` ⇒
  veröffentlicht · `fromCache` ⇒ Reservierung zurück (nie bei wiederverwendeter) ·
  `budget` ⇒ langes Zurückstellen · `generating` ⇒ kurzes · `no-vorgaenge` ⇒ ehrlicher
  Leerzustand (ok, nicht veröffentlicht) · `ai-unavailable`/`store-error` ⇒ vorübergehend
  (Backoff) · `v3-disabled`/`no-profile` ⇒ endgültig (`narrativ-nicht-moeglich`).
- **Worker:** `ALLE_TYPEN` + `tenant_narrative` (kein Abruftyp); `durchlauf` nimmt eine
  **einschränkende** Typvorgabe an (kann die Menge nie erweitern, Quellenmodus-Riegel
  nicht umgehbar); `arbeite` reicht die Laufumgebung in die Handler-Deps.
- **Cron-Route `lage-briefing`:** bei beiden Flags ein `return`-Zweig — der Slot arbeitet
  als Worker ausschließlich fällige `tenant_narrative`-Aufträge ab (Budget 230 s,
  Telemetrie `mode=warteschlange`). **Strukturell kein Doppelpfad**: dieselbe Bauform wie
  `cronSchwererPfad`. Bei ausgeschalteten Flags ist die Route byte-gleich der bisherige
  Direktpfad.

**Atomare Veröffentlichung, Schutz vor veralteten Ergebnissen, Genau-einmal:** unverändert
durch die Bestandsfunktion (Tagescache + `koSetHash` + Sperre) — im Vertragstest §7 gegen
die **echte** `lage.buildLageBriefing` belegt (siehe §6): Fehler verändern den sichtbaren
Stand nicht; Wiederanlauf trifft den Cache statt ein zweites Mal zu zahlen; neue
Eingangsdaten ersetzen den Tagescache; leere Antworten werden nie veröffentlicht. Die
**vorbestehende** enge Race-Lücke zweier Generatoren nach Ablauf der 90-s-Sperre ist
Alt-Bestand des Lage-Pfads, wird durch die Queue weder erzeugt noch verbreitert und bleibt
durch Sperre + Tagescache begrenzt (Einordnung: niedrig, unverändert).

**Zustandsdefinitionen** (Block „Idempotenz und Aktualität"): *veraltet* = Auftrag eines
früheren Fensters; er erzeugt bei Ausführung den Stand des **aktuellen** Berlin-Tags oder
trifft dessen Cache — er überschreibt nie etwas Neueres. *ersetzt* = Tagescache wird bei
verändertem `koSetHash` vom neueren Stand überschrieben (genau die gewollte Ersetzung).
*fehlgeschlagen* = `status=fehlgeschlagen` nach `max_attempts` bzw. endgültigem Fehler;
im Betriebsstatus als `endgueltige-fehler` **kritisch** sichtbar; kein Cache-Eintrag
entsteht; der nächste Tag bekommt einen neuen Auftrag (Fenster im Schlüssel — keine
dauerhafte Blockade, deshalb bewusst **nicht** in der Wiedervorlage-Typmenge).
*erfolgreich veröffentlicht* = Tagescache-Zeile geschrieben, Auftrag `erledigt`.

## 4 · Flagmatrix und Altpfad

`flagmatrix-op30-test.js` (jetzt 75 Prüfungen) + `tenant-narrativ-test.js` §1/§2/§8:
Standard/fehlend/ungültig ⇒ AUS · nur ein Flag (egal welches) ⇒ nichts startet ·
ohne Queue/Scheduler/Worker kein Wechsel · Merge verändert Production nicht (Planung ohne
Flag zeichengleich; Route ohne Flag unverändert; ein Deployment startet keinen Worker —
kein Aufruf in `.github/`, `package.json`, `vercel.json`) · Altpfad bleibt bei AUS
vollständig erhalten (§8.4) · bei Aktivierung keine doppelte Verarbeitung (return-Zweig
§8.2 + Sperre/Cache als zweite Schicht) · Rückschalten stellt den Altpfad wieder her;
Restauträge räumt der Worker ohne Modellpfad ab (§6.8).

## 5 · Reale Messgrundlage (Production-Metadaten, rein lesend, keine Inhalte)

`llmUsage`-Log (Auth-Store `main-auth`), ausschließlich technische Felder aggregiert:

| Größe | Wert |
|---|---|
| Aufrufe `lageBriefing` | **134** (2026-07-10 → 2026-08-09), Modell ausschließlich **gpt-5-mini** |
| Erfolg / Fehler | 126 / **8** (6,0 % — `request-error`, `ECONNRESET`; 0 explizite 429) |
| Laufzeit | Median **5 052 ms** · p95 **24 278 ms** · p99 370 462 ms · Max **471 985 ms** — **p99/Max aus n=134 nur schwach belegt** (2 Beobachtungen jenseits p99) |
| über 60 s / über 120 s | 6 / **4** (3,0 %) |
| Token | Ø **1 735** ein / **437** aus |
| Kosten | Ø **0,001307 USD**/Aufruf (126 bepreiste); **8 unbekannt** (die Fehlläufe) |
| Budget-Skips | 3 × `skipped-lage-narrativ`, 11 × `skipped-lageBriefing` (belegt kostenfrei) |

**Kleine Datenmenge ausdrücklich gekennzeichnet:** n=134 reicht für Median/p95; p99 und
Maximum sind Einzelbeobachtungen. Preisbasis der Kostenspalte ist die interne Schätzlogik
(`kostenmessung.md`: Preisbasis unbelegt).

## 6 · Tests (alle selbst ausgeführt; Umgebung: Node v22.22.2, PostgreSQL 16.13 lokal auf 127.0.0.1:5433, jeder Lauf über `scripts/lokal.js`)

| Prüfung | Ergebnis |
|---|---|
| **`tenant-narrativ-test.js`** (neu — Vertrag, Flaggrenzen, Idempotenz, Vorbedingungen, Handler-Pfade, Budget, Worker, echte `buildLageBriefing`-Veröffentlichung, Doppelpfad-Schutz) | **90 PASS / 0 FAIL** |
| **`narrativ-stufen-test.js`** (neu — Stufen 5/25/50/100/200/250 + Stress 1 000, ALLE FÜNF Typen, Störprofil 5 % Fehler · 2 % Rate Limits · 3 % lange Antworten) | **35 PASS / 0 FAIL / 6 ausdrücklich OFFEN** |
| **`jobqueue-narrativ-datenbank-test.js`** (neu — echte PostgreSQL: CHECK vor/nach, Additivität, Claim/Typfilter/Fremdabschluss/Defer, Trigger, RLS/Rechte, Rollback mit Bestandszeilen, Teilzustände, Reihenfolge-Unabhängigkeit) | **27 PASS / 0 FAIL** |
| **Migrationskette** aller sechs OP-30-Paare (+ `20260717`-Voraussetzung): anwenden ×2 → Rollback rückwärts ×2 → erneut anwenden | **35 Schritte fehlerfrei** |
| **`narrativ-mutationsprobe.js`** (neu — 12 gezielte Sabotagen: Flaggrenze, Kopplung, Planung, Vorbedingungen, Deaktiviert-Prüfung, falsches Grün, Budgetleckage, 48-h-Grenze, Doppelpfad, Typ-Erweiterung, Worker-Typmenge, Korridor) | **12/12 erkannt (rot)**, alle Dateien byte-identisch wiederhergestellt |
| `flagmatrix-op30-test.js` (erweitert um `HELMUT_NARRATIV_QUEUE`) | 75 PASS / 0 FAIL |
| `jobqueue-vertrag-test.js` (mit DB-Gleichheitsteil) | 113 PASS / 0 FAIL |
| `jobqueue-datenbank-test.js` | 55 PASS / 0 FAIL |
| `jobqueue-wiedervorlage-datenbank-test.js` | 48 PASS / 0 FAIL |
| `jobqueue-bereinigung-test.js` | 38 PASS / 0 FAIL / 1 OFFEN |
| `jobqueue-sicherheit-test.js` | 69 PASS / 0 FAIL |
| `llm-budget-fairness-test.js` | 59 PASS / 0 FAIL |
| `source-demand-test.js` | 59 PASS / 0 FAIL |
| Vollständige Offline-Suite + Browser-Smoke + Baseline-Vergleich `origin/main` | siehe §10 |

Ein Befund an der eigenen Arbeit wurde dabei gefunden und behoben: der neue Rollback war
nach dem Basis-Rollback **nicht** idempotent (Tabelle weg ⇒ Fehler beim zweiten Durchlauf);
die Kettenprobe hat es gezeigt, der Rollback prüft jetzt die Existenz (`if exists`-Stil).

**Vorbehalt (Befund O21, unverändert offen):** der kanonische Runner zählt übersprungene
Datenbanksuiten als PASS — die Datenbanknachweise sind ausschließlich durch die Läufe in
diesem Beleg gedeckt, nicht durch CI. Übersprungene Suiten gelten nicht als bestanden.

## 7 · Messwerte der Stufen (alle fünf Auftragstypen, unfreundliches Szenario)

Szenario je Stufe: 10 % HTTP 429 · dauerhaft fehlerhafte Quellenfamilie · Workerabsturz in
Stunde 6 · doppelter Scheduler · 4 konkurrierende Worker · langsame Verarbeitung · 10 %
deaktivierte Mandate beigemischt · Zugang neuer Mandate in Stunde 8 · Rückstand aus dem
Vortag · ein Schwergewicht · **Narrativ-Störprofil 5 % Modellfehler + 2 % Rate Limits +
3 % lange Antworten** (Anbieter-Adapter aus den Production-Metadaten in §5).

| Stufe | Aufträge | Narrative veröffentlicht | Narrativ-Aufrufe | Verstehen | Anbieterzeit | erstes/letztes Narrativ | fertig | Verlust/Doppel/fremd | USD/Mandat/Tag |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 153 | 6/6* | 6 | 92 | 30 s | 06:02 / 14:02 | 21:02 | 0/0/0 | 0,04757 |
| 25 | 663 | 26/26 | 27 | 338 | 213 s | 06:02 / 14:02 | 21:30 | 0/0/0 | 0,03516 |
| 50 | 1 136 | 53/53 | 57 | 526 | 622 s | 06:02 / 14:02 | 21:34 | 0/0/0 | 0,02769 |
| 100 | 1 759 | 105/105 | 115 | 672 | 1 222 s | 06:02 / 14:02 | 21:36 | 0/0/0 | 0,01817 |
| **200** | **2 932** | **210/210** | **234** | **846** | **2 756 s** | **06:02 / 14:02** | **21:38** | **0/0/0** | **0,01195** |
| 250 (Reserve) | 3 520 | 263/263 | 291 | 894 | 3 413 s | 06:02 / 14:02 | 21:38 | 0/0/0 | 0,01031 |
| *1 000 (Stress)* | *12 311* | *1 050/1 050* | *1 160* | *998* | *14 600 s* | *06:02 / 14:04* | *21:38* | *0/0/0* | *0,00387* |

\* Zahlen über der Stufengröße enthalten die in Stunde 8 zugegangenen Mandate — auch sie
wurden bedient. „Letztes Narrativ 14:02" sind genau diese Spätzugänge plus die
Vorbedingungs-Wartefrist; die im Korridor geplanten Narrative lagen am Vormittag.
Auf jeder Stufe: 0 deaktivierte Mandate in Arbeit, 0 Fremdzugriffe, 0 Budgetverletzung,
alle gescheiterten Aufrufe als **unbekannte Kosten** geführt (nie 0). Fehler und Rate
Limits wurden vollständig abgearbeitet: **0 endgültig gescheiterte Narrative** auf allen
Stufen (deterministische Wiederholung mit Backoff).

**Reserveprobe** (Auftrag: ≥ 25 % zusätzliche relevante Arbeitslast): drei Messungen —
1. **250 Mandate** (= +25 % Mandate): vollständig getragen; **Narrativ-Aufrufe +25,2 %**
   (der fünfte Typ skaliert linear mit den Mandaten), aber Abrufversuche +19,5 % und
   Verstehen +5,7 % (geteilte Quellen; wie Befund B16).
2. **200 Mandate + 50 % Dokumentvolumen**: getragen; Verstehens-Aufrufe **+50 %**.
3. Eine Probe, die **alle** Dimensionen zugleich ≥ 25 % erhöht, existiert strukturell
   nicht ohne gleichzeitig +25 % Quellen und Dokumente und Mandate ⇒ die
   25-%-ARBEITSLAST-Reserve über alle Dimensionen bleibt **ehrlich OFFEN** (Prüfung C4),
   belegt sind +25 % **Mandate**, **lineare Narrativ-Mehrlast** und **+50 % Dokumentlast**.

## 8 · Kapazitätsentscheidung für 200 Mandate: **lokal nur teilweise belegt**

**Belegt (lokal):** alle fünf Auftragstypen · 200/200 (bzw. 210/210 inkl. Zugänge)
Narrative veröffentlicht, 0 Verlust, 0 Doppelveröffentlichung · Fehler/Rate
Limits/Timeouts abgearbeitet · Kosten mit 30-%-Marge und ausgewiesenen unbekannten
Positionen · reale Production-Metadaten als Adaptergrundlage · Annahmen dokumentiert.

**Nicht belegt — deshalb „teilweise":**
1. Die 25-%-**Arbeitslast**-Reserve über alle Dimensionen (§7, strukturell; wie B16).
2. Die **Slot-Kapazität der Morgenlage**.
   > **KORRIGIERT im unabhängigen Abschlussreview 2026-08-09**
   > ([`op30-e1-abschlussreview-2026-08-09.md`](op30-e1-abschlussreview-2026-08-09.md) §5,
   > Befund R5). Die hier ursprünglich stehende Rechnung („~39 Aufrufe je 05:45-Slot,
   > ~78 von 200 am Vormittag, par 8 ⇒ ~155") war **zu günstig** und wird zurückgezogen.
   > Zwei Gründe: (a) ein Slot bedient nur, was **fällig** ist — die Fälligkeit war über
   > 134 Minuten gestreut, sodass bei 5 Mandaten **1** und bei 200 Mandaten **5** Aufträge
   > im Slot fällig waren (Befund R1, im Review behoben); (b) die Laufzeit ist stark
   > rechtsschief (4/134 über 120 s, Max 472 s) — mit der **Verteilung** statt dem Mittel
   > gerechnet trägt der Slot bei Parallelität 2 realistisch **~14**, nicht 39. Die
   > Watchdog-Annahme trägt ebenfalls nicht: er ruft `/api/cron/pipeline` (typoffen), dort
   > stehen `source_fetch` (60) und `document_understanding` (100) **vor** dem Narrativ (240).
   >
   > **Belastbare Werte nach der R1-Korrektur** (Rechnung/Simulation, realistisches Szenario):
   > ein Morgenslot trägt **par 2: ~14 · par 4: ~52 · par 8: ~127** Narrative; mit der
   > geforderten Reserve von 25 % entspricht das **11 · 41 · 101 Mandaten**.
   > **200 Morgenlagen sind mit der heutigen Verdrahtung in keinem Szenario mit ≥ 25 %
   > Reserve erreichbar** — auch nicht bei der harten Obergrenze `HELMUT_WORKER_PARALLEL=8`.
   > Nötig sind **beides**: Parallelität 8 **und** mindestens ein zweiter Morgenslot. Beides
   > ist Vercel-Konfiguration und damit **Betreiberentscheidung** (keine neue Infrastruktur,
   > keine zusätzlichen Modellkosten). Ohne diese Entscheidung ist die Aktivierung auf
   > **Stufe 1 (5 Mandate)** begrenzt — dort ist die Morgenlage in jedem Szenario vollständig.
3. Eine lokale Simulation ist ohnehin **kein Production-Beweis**; es gibt 10 echte
   Profile, nicht 200.

**Kein Stopp nötig:** die Architektur selbst reicht (Warteschlange trägt 1 000 im
Stresslauf); der Engpass ist die Slot-Zuteilung — eine reversible Konfigurations- bzw.
Betreiberentscheidung, keine neue Infrastruktur.

> **Nachtrag 2026-08-09 (unabhängiger Abschlussreview, kanonisch für §8):** die Aussage
> „kein Stopp nötig" gilt für den **Merge** — nicht für die **Aktivierung bei 200**. Für
> 200 Morgenlagen mit 25 % Reserve reicht die heutige Verdrahtung nicht (siehe Kasten
> oben). Drei Befunde des Reviews sind in dieser PR behoben: **R1** Fälligkeitsstreuung
> (kritisch), **R2** fehlender Tagesplan im Narrativslot (`scopeMax` war `null` — Befund
> O1 beim eigenen Verbraucher), **R3** falsches Grün bei unerreichbarer Warteschlange.
> Zwei weitere sind benannt und **nicht** behoben: **R4** Doppelzählung im KI-Tagesdeckel
> bei aktiver Fairness (geerbt von `main`), **R6** `narrativ-stress-1000-test.js` reißt das
> 180-s-Zeitlimit des kanonischen Runners. Einzelheiten und Messwerte:
> [`op30-e1-abschlussreview-2026-08-09.md`](op30-e1-abschlussreview-2026-08-09.md).

## 9 · Kosten (lokale Messung × Preisgrundlage, Stand 2026-08-09; Monat = 22 Nutzungstage)

Preisgrundlage: Narrativ **0,001307 USD/Aufruf** (Mittel der 126 bepreisten
Production-Aufrufe, gpt-5-mini; interne Schätzlogik, **kein Anbieterpreis**) · Verstehen
**0,0025 USD/Aufruf** (bestehender Schätzwert im Code). Größenordnungen, keine
Rechnungsbeträge. Gescheiterte Aufrufe = **unbekannte Kosten, nie 0**.

| Mandate | USD/Tag | USD/Mandat/Monat | USD/Monat | mit 30 % Marge | Aufrufe mit unbekannten Kosten/Tag |
|---|---|---|---|---|---|
| 5 | 0,238 | 1,05 | 5,23 | 6,80 | 0 |
| 25 | 0,879 | 0,77 | 19,34 | 25,14 | 1 |
| 50 | 1,384 | 0,61 | 30,45 | 39,59 | 4 |
| 100 | 1,817 | 0,40 | 39,98 | 51,97 | 10 |
| **200** | **2,390** | **0,26** | **52,57** | **68,34** | **24** |
| 250 | 2,579 | 0,23 | 56,73 | 73,75 | 28 |
| *1 000 (theoretisch)* | *3,867* | *0,09* | *85,08* | *110,61* | *110* |

Wiederholungen sind enthalten (im 200er-Tag 234 Narrativ-Aufrufe für 210 Narrative).
**Tagesdeckel-Folge:** 200 Mandate brauchen ~1 056 KI-Aufrufe/Tag (846 Verstehen + 210
Narrativ + Wiederholungen) — der Production-Deckel (heute: Gesamtdeckel 100, davon 30 fuer das
Verstehen reserviert — nicht 130, [`llm-budget-reservierung.md`](llm-budget-reservierung.md))
muss vor Stufe 3 des
Aktivierungsplans angehoben werden (unverändert die Aussage aus `skalierung-200-mandate.md`).

## 10 · Pflichtläufe, Baseline-Vergleich und Befunde am eigenen Sprint

| Lauf | Ergebnis |
|---|---|
| **Offline-Suite auf dem Branch** (kanonischer Runner, `scripts/lokal.js`) | **227/233 Suiten grün** (524 s) |
| **Offline-Suite auf unverändertem `origin/main`** (`40e7708`, eigener Arbeitsbaum) | **224/229 Suiten grün** (333 s) |
| Browser-/Mobile-Smoke (Chromium) | **32/32 PASS** |

**Einordnung der roten Suiten (Branch vs. Baseline):**

- `kalender-ics-test` · `privacy-vollstaendigkeit-test` · `profile-db-test` ·
  `provision-tenant-test` · `tenant-neutrality-test`: **identisch rot auf unverändertem
  `origin/main`** ⇒ **bekannte Baseline** (dokumentiert seit dem OP-30-Prüfsprint:
  4 Baseline-Fehler + fehlende lokale Dev-Abhängigkeit `ical.js`), **nicht** durch diesen
  Sprint. Keine davon ist CI-Pflichtcheck-blockierend anders als am Basisstand.
- `pilot-e2e-vertrag-test` (nur im zweiten Branchlauf, Prüfung I10 „Rangfolge"):
  **bekannter offener Befund F-E2E** — nichtdeterministische E2E-Rangfolge unter
  CPU-Last (gleiche Familie wie J8 im Brandenburg-Vertragstest, Draft-PR #224).
  Standalone **3/3 grün**; der Sprint berührt weder Matching, Scoring, Relevanzordnung
  noch `lage.js`-Rangfolge. Einordnung: **umgebungsbedingt**, keine neue Regression.

**Drei Befunde am eigenen Sprint, im ersten vollständigen Lauf gefunden und behoben:**

1. `narrativ-stufen-test` wurde vom Runner-Zeitlimit (180 s) abgeschossen (`exit=null`) —
   der 1 000er-Stresslauf ist jetzt eine **eigene** Suite (`narrativ-stress-1000-test.js`);
   beide liegen einzeln bei ~72 s bzw. ~117 s.
2. `vorgangskontext-test` 8.8a meldete die neuen Migrationsdateien als sprintfremde
   Migration — begründeter Allowlist-Eintrag ergänzt (die **inhaltliche** Prüfung 8.8b,
   dass keine Migration den Kontextpfad berührt, blieb unangetastet und grün).
3. Der neue Rollback war nach dem Basis-Rollback nicht idempotent (Kettenprobe) — behoben
   (§6).

**Vorbehalt O21 unverändert:** übersprungene Datenbanksuiten zählt der Runner als PASS;
die DB-Nachweise sind ausschließlich durch die dokumentierten Läufe an der lokalen
PostgreSQL 16.13 gedeckt.

**Pull Request #236** (`claude/lage-narrativ-fifth-job-type-4zm1za` → `main`, Kopf
`4f45bdf`, 4 Commits, kein Rebase, kein Force-Push): beide **Pflichtchecks grün**
(„Syntax + Offline-Suiten" ✅, „Browser-/Mobile-Smoke (Chromium)" ✅), Vercel-Preview
**Ready** (`DEtep7Px38fUm9wZANa341AjZ7h8`), `mergeable_state: clean` (keine Konflikte),
keine Review-Kommentare zum Prüfzeitpunkt. **Nicht gemergt** — Merge = Production-
Deployment, Entscheidung liegt beim Betreiber.

## 11 · Aktivierungsreihenfolge (ersetzt Zeile „E1 offen" im Plan aus `op30-aktivierungsreife-2026-08-09.md` §8)

E1 ist **entschieden und umgesetzt** (dieser Sprint). Der Stufenplan gilt unverändert mit
diesen Präzisierungen:

| Stufe | Ergänzung durch diesen Sprint |
|---|---|
| 0 · Migration | jetzt **sechs** Paare; Rollback rückwärts (`20260809_jobqueue_wiedervorlage` und `20260809_jobqueue_narrativ` sind untereinander reihenfolgeunabhängig, beide vor der Basis zurücknehmen) |
| 2–4 (5→50 Mandate) | unverändert **ohne** `HELMUT_NARRATIV_QUEUE` — Altpfad-Cron trägt das Narrativ bis ~40 Mandate je Slot |
| 5 (100) | `HELMUT_NARRATIV_QUEUE=on` **zusätzlich** setzen (E1 aktiv); Rückfallbedingung: ein Mandat ohne Morgennarrativ bei freiem Budget ⇒ Flag off + Redeploy (Altpfad übernimmt sofort) |
| 6 (200) | zusätzlich Betreiberentscheidung Slot-Kapazität (§8.2): `HELMUT_WORKER_PARALLEL` anheben oder zusätzlicher Slot; Deckel ≥ ~1 100/Tag + Reserve |

**Erhalten bleibt ausdrücklich:** OP-25 belegt nur fünf Mandate der Altarchitektur, nicht
200 · PR #233/#235 und dieser Sprint aktivieren OP-30 **nicht** · alle Flags bleiben
default AUS · keine OP-30-Migration ist in Production · 190 echte Profile fehlen weiterhin
(es gibt 10) · lokale Tests sind kein Production-Beweis · nach einer späteren Aktivierung
ist ein stufenweiser Production-Nachweis nötig, und OP-25 ist danach vollständig zu
wiederholen.

## 12 · Was dieser Sprint **nicht** beweist

- Kein Production-Lauf des neuen Pfads; kein Lauf auf `40e7708` zum Sprintzeitpunkt
  (Laufprüfung offen, §1).
- Slot-Kapazität der Morgenlage für 200 Mandate: Rechnung, kein Nachweis (§8).
- 25-%-Arbeitslast-Reserve über alle Dimensionen: strukturell offen (§7).
- Preisbasis: Messreihe auf interner Schätzlogik, kein Anbieterpreis (§9).
- Wirksamer Production-Tagesdeckel: aus Sitzungen nicht lesbar.
- Die Migration `20260809_jobqueue_narrativ` ist **nicht angewendet**; ihr Nachweis steht
  in `jobqueue-narrativ-datenbank-test.js` gegen eine lokale PostgreSQL 16.13.
