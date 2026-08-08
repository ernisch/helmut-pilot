# OP-30 — Unabhängiger adversarialer Abschlussreview von PR #233

**Stand:** 2026-08-08 · **Geprüfter Stand:** `6d54dbb` (Merge-Basis `origin/main` `1f10d66`)
**Rolle dieses Dokuments:** Belegdatei. Der kompakte Stand steht in
[`../CURRENT_STATE.md`](../CURRENT_STATE.md); hier liegen Befunde, Korrekturen und Messwerte.

> **Was dieser Review NICHT ist:** keine Bestätigung früherer Abschlussberichte. Jede Aussage
> unten wurde am Code, an den Migrationen gegen eine **echte lokale PostgreSQL 16.13** und an
> eigenen Proben nachgeprüft — nicht aus der PR-Beschreibung übernommen.

---

## 1 · Die Kernfrage: ist der Merge verhaltensneutral?

**Ja — belegt, nicht behauptet.** Vier unabhängige Prüfungen, davon zwei eigene:

| Prüfung | Ergebnis |
|---|---|
| Eigene Flagmatrix über 26 Werte (`""`, `" "`, `0`, `false`, `off`, `OFF`, `aus`, `no`, `nein`, `n`, `onn`, `ON!`, `yes`, `ja`, `2`, `-1`, `null`, `undefined`, `True`, `TRUE`, `On`, `ON`, `an`, `AN`, `1`, `true`, `on`) | **23 PASS / 0 FAIL** |
| `HELMUT_SCALABLE_PIPELINE` / `HELMUT_LLM_FAIRNESS` | schalten nur bei `on`/`true`/`1`/`an` (Groß-/Kleinschreibung egal), sonst AUS |
| `HELMUT_RELEVANZORDNUNG` | schaltet **ausschließlich** bei `on`; jeder andere unbekannte Wert erzeugt einmalig eine Diagnose |
| Modul-Ladeeffekte | `scalable-pipeline`, `relevanzordnung`, `source-demand`, `llm-budget-fair`: **kein** Timer, **keine** Veränderung an `globalThis.fetch`, kein IO |
| `planeArbeit` / `arbeite` bei Flag AUS mit Fallen-Proxy als `deps` | **0 Berührungen**, `uebersprungen: true, grund: "flag-aus"` |
| Migration automatisch angewendet? | **Nein** — kein Aufruf in `lib/`, `server.js`, `api/`, `.github/`, `package.json`, `vercel.json` |

**Der Merge aktiviert nichts:** keine Migration, keinen Worker, keine Warteschlange, keinen
neuen Ausführungspfad. Der Altpfad (`cronSchwererPfad` → `runCronForTenants` /
`runCronMitGlobalerPhase`) bleibt unberührt; der neue Einsprung ist ein `return` hinter einer
reinen Flagabfrage.

**Ein neuer, im Betrieb erreichbarer Pfad existiert trotzdem:** die Route
`/api/ops/jobqueue`. Sie ist durch dasselbe `CRON_SECRET` geschützt wie die übrigen
Betriebsendpunkte, ist rein lesend und meldet bei fehlender Migration ehrlich
`verfuegbar:false / migration-fehlt` und `zustand: "unbekannt"` — **nicht** „grün".
Das ist geprüft und in Ordnung.

---

## 2 · Befunde

Alle Befunde betreffen **ausschließlich** den ausgeschalteten OP-30-Pfad. Keiner von ihnen
kann bei ausgeschalteten Flags wirken. Sie wären aber **vor der ersten Aktivierung** wirksam
geworden — mehrere davon so, dass der Pfad stillschweigend nichts geleistet hätte.

### 2.1 Behoben in diesem Review

| # | Schwere | Datei | Befund | Korrektur |
|---|---|---|---|---|
| **B1** | **kritisch** | `lib/helmut/scalable-pipeline.js` (`handleSourceFetch`) | Der Verstehensauftrag trug die **Blob-Kennung** `raw-<hash16>` (aus `crawler.js`), gelesen wird aber `raw_documents` unter `rd-<inhaltsfingerabdruck>` (`dedup.toRawDocumentRow`). `getRawDocumentsByIds` hätte **nie** ein Dokument gefunden; `handleDocumentUnderstanding` hätte jeden Auftrag mit `ok:true, verstanden:0, grund:"keine-dokumente-mehr-vorhanden"` beantwortet. **Der Warteschlangenpfad hätte nie ein Dokument verstanden — und das als Erfolg gemeldet.** | Neue Funktion `rohdokumentKennungen()` leitet die Kennung über **dieselbe** Funktion ab wie `persistRawDocumentsShadow`. Eine Kennungswahrheit statt zweier. |
| **B2** | **hoch** | `supabase/migrations/20260808_scalable_job_queue.sql` (`helmut_job_metrics`) | Der Rückstandsalarm rechnete gegen `due_at` — genau den Wert, den `helmut_defer_job` bei **jedem** Zurückstellen neu setzt (alle 2 min bei offener Vorbedingung, stündlich bei erschöpftem Budget). **An echter Datenbank gemessen:** ein Auftrag mit 72 h Rückstand meldete `ueberfaellige_mandate=1`, `max_mandatsalter_s=259200`; nach **einer** Zurückstellung `0` und `0`. Die 24-h-Schwelle in `betriebsstatus` hätte nie ausgelöst — falsches Grün (CLAUDE.md §4.4). | Neue Spalte `first_due_at` (ursprüngliche Fälligkeit, wird nie verändert); die beiden Mandatskennzahlen rechnen dagegen. `first_claimed_at` wäre falsch gewesen: es springt beim ersten Zugriff nach vorn. |
| **B3** | **hoch** | `lib/helmut/scalable-pipeline.js` (`workerDeps`) | `buildV3Briefing` wurde aus `lib/helmut/briefingContract.js` geholt — **dort gibt es diesen Namen nicht** (die Funktion steht in `server.js`). Zur Laufzeit nachgewiesen: `require(...)[name] is not a function`. **Jeder Briefingauftrag wäre gescheitert**, fünfmal wiederholt und endgültig fehlgeschlagen; die Briefingstufe des Pfads war tot. | `server.js` reicht die echte Funktion ein (kein Verschieben von Production-Code). Ohne Einreichung bricht der Handler ehrlich mit `nicht-implementiert` ab statt mit einem irreführenden `TypeError`. Neuer Vertragstest prüft **alle 10** über Modulnamen aufgelösten Abhängigkeiten. |
| **B4** | **hoch** | `lib/helmut/scalable-pipeline.js` (`planeArbeit`) | Mandatsfilter war `p.disabled !== true`. Ein Profil trägt **kein** Feld `disabled` — das gibt es nur am Ergebnis von `profile-validation.validateProfile`. Die Bedingung war immer wahr: **deaktivierte (`profileActive === false`) und soft-gelöschte Mandate wären mitgeplant worden**, inklusive ihrer personenbezogenen Nachrichtensuche. In Production betrifft das heute 3 von 8 Profilen und untergräbt die m5-Mandatswahrheit aus OP-25. | Verbindliches Projektprädikat `profile-validation.isDisabled(p)`. |
| **B5** | **hoch** | `lib/helmut/scalable-pipeline.js` (`arbeite`) | `helmut_claim_jobs` erhöht `attempts` für den **ganzen** reservierten Stapel. Der bei Zeitablauf nicht bearbeitete Rest blieb liegen und verbrauchte damit Versuche für Arbeit, die nie stattfand. **An echter Datenbank gemessen:** fünf Reservierungen ohne eine einzige Ausführung ⇒ `attempts = 5`, danach `fehlgeschlagen / versuche-erschoepft`. Bei Stapel 10 genügt ein langsamer Auftrag je Lauf. | Der Rest wird über `helmut_defer_job` zurückgegeben (nimmt den Versuch zurück). Reicht die Zeit dafür nicht mehr, bleibt das bisherige Verhalten — nie schlechter, aber ehrlich gezählt (`stapelrestZurueckgegeben` / `stapelrestNichtZurueckgegeben`). |
| **B6** | **hoch** | `scripts/relevanzordnung-mergeneutralitaet-test.js` | **Drei der „vier unabhängigen Merge-Neutralitätsbeweise" waren Tautologien.** B, C und D riefen `lage.selectLageVorgaenge(…)` auf — eine Funktion, die ein Argument nimmt, nach echter Quelle filtert und in „modern"/„Rest" teilt (lage.js:474–479). Sie hat mit der Relevanzordnung **nichts** zu tun; die hängt an `loadRankedVorgaenge`. „Die Ordnung wurde nicht aufgerufen", „die Falle wurde nicht betreten" und „byteweise gleich" waren trivial wahr. | B, C und D laufen jetzt gegen `loadRankedVorgaenge` mit einer Ablage-Attrappe — **plus je einer Gegenprobe** (`B.4`, `C.3`), die beweist, dass derselbe Weg mit `on` sehr wohl durch die Ordnung läuft. Sonst wäre die Korrektur nur eine besser versteckte Tautologie. |
| **B7** | **hoch** | `lib/helmut/scalable-pipeline.js` (`handleSourceFetch`) | `verstehensAuftraege` wurde bedingungslos hochgezählt und `ok:true` gemeldet — auch wenn `enqueue` `verfuegbar:false` lieferte. Weil der Idempotenzschlüssel des Abrufs sein Aktualitätsfenster enthält und `saveRawItems` nur **neue** Items zurückgibt, wären die Dokumente danach **nie** verstanden worden (CLAUDE.md §4.10). | Nicht eingereihte Aufträge werden gezählt und führen zu einem ehrlichen, **vorübergehenden** Fehler (`verstehen-nicht-eingereiht`, mit Backoff). |
| **B8** | **mittel** | `lib/helmut/scalable-pipeline.js` (`arbeite`) | Die Lease wird nur **vor** einem Auftrag verlängert. Ein Auftrag durfte damit genauso lange laufen wie seine Lease (`worker-betrieb`-Standard: beides 120 000 ms) — ein zweiter Worker hätte ihn **mitten in der Ausführung** übernommen, derselbe Quellenabruf wäre doppelt gelaufen. Im verdrahteten Pfad (Lease 300 000 / Auftrag 120 000) nicht erreichbar. | Auftragsbudget zusätzlich auf **die halbe Lease** gedeckelt. Im verdrahteten Pfad ändert das nichts. |
| **B9** | **mittel** | `lib/helmut/lage.js` | `require("./relevanzordnung")` stand **vor** dem Flag-Riegel und außerhalb des `try/catch`. Ein Ladefehler hätte die Lage geleert, obwohl das Flag AUS ist — und machte Beweis D unführbar. | Toleranter Ladehelfer `relevanzModul()`: ist die Ordnung nicht ladbar, verhält sich die Lage exakt wie vor dem Sprint. Beweis D ist damit **erstmals wirklich führbar** (2 032 vs. 2 032 Zeichen, byteweise gleich). |
| **B10** | **mittel** | `scripts/v3-anbindung-test.js`, `scripts/skalierung-simulation-test.js` | Beide Attrappen bauten die Dokumentkennung **selbst** (`rd-<sha256(url)[0..16]>`) und gaben sie im Rückgabewert von `saveRawItems` mit — was Production nicht tut. Genau dadurch blieb B1 unentdeckt. Zusätzlich unterschieden sich die Artikel-URLs nur im **Fragment** (`#artikel-N`), das `canonicalizeUrl` entfernt: drei modellierte Artikel waren in Wahrheit einer. | Beide Attrappen benutzen jetzt `dedup.toRawDocumentRow`, liefern die Blob-Form zurück, führen die Herkunft (`_weg`) ausdrücklich mit und verwenden pfad-unterscheidbare Artikel-URLs. |
| **B11** | **niedrig** | `server.js` | `Number(process.env.HELMUT_WORKER_BATCH \|\| 10)` ⇒ ein unbrauchbarer Wert ergibt `NaN`, `Math.max(1, NaN)` ist `NaN`. | `Number(...) \|\| 10`. |
| **B12** | **niedrig** | `docs/betrieb/env-inventar.md`, `scripts/env-inventar-test.js` | `HELMUT_WORKER_PARALLEL/_BUDGET_MS/_LEASE_MS/_STAPEL` fehlten im Inventar. Der Vollständigkeitsscanner sieht nur `process.env.NAME`, `flagValue("NAME")` und `env.NAME` — `worker-betrieb.js` liest über einen eigenen Helfer und war deshalb unsichtbar, während der Scanner „vollständig" meldete. | Vier Variablen dokumentiert; der Scanner kennt sie jetzt ausdrücklich. |

### 2.2 Bestätigt, aber **nicht** geändert (Begründung jeweils)

| # | Schwere | Befund | Warum nicht in diesem Review korrigiert |
|---|---|---|---|
| O1 | mittel | **Mandantenanteil und faire Rotation sind im Produktionspfad unbenutzt.** `llm-budget-fair.tagesplan`/`rotationsReihenfolge`/`mandantenDeckel` werden von `lib/` **nirgends** aufgerufen; `budgetAdapter.reserviere` übergibt `scopeMax` immer `null`. Wirksam ist nur die ergebnisbezogene Idempotenz plus der globale Deckel. Die PR-Beschreibung („ein faires KI-Budget", „faire Rotation") liest sich stärker, als die Verdrahtung ist. | Die Verdrahtung ist eine **Architektur-/Produktentscheidung** (wer bekommt welchen Anteil, ab wann), keine Aufräumarbeit. Gehört in den Aktivierungssprint. |
| O2 | mittel | **`lib/helmut/worker-betrieb.js` ist im Betrieb tot.** Nur Tests laden es; `server.js` ruft `scalable-pipeline.arbeite` direkt. Health/Readiness/Parallelität/sauberes Herunterfahren sind gebaut, aber nicht erreichbar. | Verdrahtung = Betreiberentscheidung über die Laufzeitform (Cron-Durchlauf vs. langlaufender Prozess), ausdrücklich offen gelassen. |
| O3 | mittel | **Vorbedingungsprüfung greift nur teilweise.** Projektion/Briefing fragen mit ihrem 24-h-Fenster; geteilte Abrufe liegen in 8-h-Fenstern (`…T00Z`, `…T08Z`, `…T16Z`). Zwei Drittel der Abrufaufträge werden deshalb nicht gesehen. Folge: dünnere Lage, **keine** Fehlzuordnung. | Das Fenstermodell zu vereinheitlichen ist ein Entwurfsschritt, kein Fix. |
| O4 | mittel | **Budgetbedingtes Zurückstellen ist unbegrenzt.** Bei dauerhaft erschöpftem Tagesbudget pendelt ein Verstehensauftrag stündlich zwischen `wartend` und `laeuft`. Sichtbar wird das **erst durch B2** — vorher war der Alarm blind. | Eine Obergrenze wäre eine Produktentscheidung („ab wann gilt Verstehen als aufgegeben?"). |
| O5 | mittel | **Endgültig fehlgeschlagene Verstehensaufträge kommen nie wieder.** Der Idempotenzschlüssel trägt bewusst **kein** Fenster; nach `fehlgeschlagen` blockiert er dieselbe Dokumentmenge dauerhaft. | Bewusster Entwurf laut Kommentar; die Gegenmaßnahme (Aufräumen fehlgeschlagener Aufträge) ist neue Funktionalität. |
| O6 | mittel | **`scripts/scoring-integration-test.js` erzwingt `HELMUT_RELEVANZORDNUNG="on"` als Vorgabe.** Die frühere Zusage zum **Produktionsstandard** (Flag AUS ⇒ Ablagereihenfolge) wird in dieser Suite nicht mehr geprüft. Die Änderung ist ausführlich begründet und nicht verdeckt; die AUS-Stellung ist über `relevanzordnung-mergeneutralitaet-test.js` abgedeckt. | Rückbau würde die Zusagen der Suite widersprüchlich machen. Hier benannt statt still gelassen. |
| O7 | mittel | **`scripts/lokaler-netzschutz.js` wird von keinem netzfähigen Werkzeug selbst geladen** — nur von `run-offline-tests.js`, `lokal.js` und der eigenen Suite. Ein Direktaufruf ist nur geschützt, wenn der Betreiber `scripts/lokal.js` benutzt. Der Anlassfall (`gate-shadow-auswertung.js`) hat inzwischen ein **eigenes** Zugriffsgatter, greift also nicht mehr. Die Formulierung „der EINE zentrale Riegel" ist stärker als die Verdrahtung. | Den Preload in ~25 Skripte einzubauen ist ein eigener Sprint mit eigenem Regressionsrisiko. |
| O8 | mittel | **Laufzeitsperre deckt `net.Socket.prototype.connect` nicht ab** (nur `net.connect`/`createConnection`), ebenso wenig `dns` und Nicht-Node-Kindprozesse. Die Umgebungsprüfung (Schicht 1) greift dort weiterhin. | Erweiterung der Sperre ist eigene Arbeit mit eigenem Testbedarf. |
| O9 | mittel | **Der Pflichtbefehl aus `CLAUDE.md` §6 bricht in einer Sitzung mit Zugangsdaten mit Exit 3 ab.** Richtig und beabsichtigt — aber der Ersatzweg muss bekannt sein: `node scripts/lokal.js scripts/run-offline-tests.js`. So wurde in diesem Review gemessen. | `CLAUDE.md` wird nur für dauerhaft verbindliche Regeln geändert; der Hinweis steht jetzt in [`lokaler-production-schutz.md`](lokaler-production-schutz.md) §7a. |
| O10 | niedrig | `helmut_reserve_llm_result`: die Idempotenzprüfung kann eine **noch nicht existierende** Zeile nicht sperren. Zwei gleichzeitige Aufrufe mit demselben `result_key` buchen beide den globalen Zähler; die Reservierungszeile entsteht nur einmal. Wirkung ist **konservativ** (zu viel gezählt, nie zu wenig) und damit fail-closed. | Ein `insert … on conflict` als Sperre wäre die saubere Form, ändert aber die Buchungsreihenfolge — nicht ohne eigenen Nachweis. |
| O11 | niedrig | `helmut_release_llm_reservation` zieht den Mandantenzähler herunter, auch wenn bei der Reservierung kein `p_scope_max` gesetzt und er nie erhöht wurde. Im verdrahteten Pfad unerreichbar (dort ist `scope` immer `global`). | Erst relevant, wenn O1 verdrahtet wird. |
| O12 | niedrig | `helmut_job_metrics.durchsatz_pro_stunde` liefert `NULL` statt `0`, wenn im Zeitraum nichts erledigt wurde. `betriebsstatus` fängt das mit `zahl()` ab. | Reine Kosmetik in einer nicht angewendeten Migration. |
| O13 | niedrig | Migrationskopf `20260808_llm_budget_fairness.sql` nennt eine Funktion `helmut_reclaim_llm_reservations`, die die Migration nicht anlegt. | Kommentarfehler ohne Wirkung. |
| O14 | niedrig | `HELMUT_RELEVANZORDNUNG` akzeptiert **nur** `on`, die Geschwisterflags auch `true`/`1`/`an`. Eine Freigabe mit `true` schlüge still fehl (immerhin mit Diagnosezeile). | Beide Verhalten sind dokumentiert; eine Vereinheitlichung ist eine Konventionsentscheidung. |
| O15 | niedrig | `env-inventar.md` führt `HELMUT_LLM_GLOBAL_ANTEIL` und `HELMUT_VORBEDINGUNG_WARTE_MS` je **zweimal** (CLAUDE.md §7.7: nur eine kanonische Stelle). Die Angaben widersprechen sich nicht. | Reine Doppelpflege; Zusammenführung berührt fremde Abschnitte. |
| O16 | niedrig | `llm-budget-fair.MIN_PRO_MANDAT` wird exportiert, aber nirgends benutzt. `relevanzordnung.ordne` nimmt `opts.now` entgegen und benutzt es nicht. | Toter Code ohne Wirkung. |

### 2.3 Geprüft und **kein** Problem

- **Mandantentrennung beim Einreihen:** geteilte Abrufe tragen `tenant_id = null` und einen
  Schlüssel **ohne** Mandatskennung; persönliche Suchen tragen die Mandatskennung im Schlüssel
  **und** im `tenant_id`; Projektion/Briefing ebenso. Eine Kollision zweier Mandate ist
  strukturell ausgeschlossen (eigene Probe: zwei Mandate ⇒ zwei verschiedene
  Ergebnisschlüssel; `scopeFuer` trennt `tenant:a`/`tenant:b`; eine globale Art **mit**
  Mandatskennung wird abgelehnt, eine mandatsbezogene **ohne** ebenso).
- **Kein Mandant hartkodiert** in den geänderten `lib/`-, `server.js`-, `api/`- und
  `supabase/`-Dateien (gezielte Suche über die Diff-Dateiliste).
- **Keine Geheimnisse** im Diff. Die zwei JWT-artigen Zeichenketten sind Testeingaben für die
  Maskierungsregeln (`{"alg":"HS256"}.{"sub":"1"}.abcdefghijklmnop`), keine echten Werte.
- **RLS und Rechte:** beide neuen Tabellen `enable` **und** `force row level security`, **0**
  Policies, **0** Rechte für `anon`/`authenticated`/`PUBLIC`, `service_role` gezielt berechtigt.
  Alle **16** neuen Funktionen `SECURITY INVOKER` mit festem `search_path` (die einzige Funktion
  ohne `search_path` in der Testdatenbank ist `helmut_reserve_llm_call` aus `20260717`, gehärtet
  durch `20260721` — nicht aus dieser PR).
- **Atomare Reservierung:** `for update skip locked`; an echter Datenbank mit echt
  nebenläufigen `psql`-Prozessen geprüft (Suite `jobqueue-datenbank-test.js` Abschnitt 4).
- **Doppelabschluss:** haltergebunden, strukturell ausgeschlossen.
- **`/api/ops/jobqueue`:** `CRON_SECRET`-geschützt, rein lesend, fail-closed bei fehlender
  Migration.

---

## 3 · Migration und Rollback — eigener Durchlauf an echter Datenbank

**PostgreSQL 16.13**, frische Datenbank, Rollen `anon`/`authenticated`/`service_role` angelegt.

| Schritt | Ergebnis |
|---|---|
| Voraussetzung `20260717_llm_budget_reservation.sql` | OK |
| Alle vier Migrationen anwenden | 4/4 OK |
| **Dieselben vier erneut** anwenden (Idempotenz) | 4/4 OK |
| Vier Rollbacks in umgekehrter Reihenfolge | 4/4 OK |
| **Dieselben vier Rollbacks erneut** (Idempotenz) | 4/4 OK |
| Nach Rollback erneut anwenden | 4/4 OK |
| **Summe** | **21 Schritte fehlerfrei** |
| Restzustand nach Rollback | 0 neue Tabellen · `llm_budget_counters` und `helmut_reserve_llm_call` aus `20260717` **unberührt** |
| Reihenfolgeprobe: `…budget_fairness` **ohne** `20260717` | bricht ab, **Transaktion rollt vollständig zurück** (0 Zeilen zurückgelassen) |
| Reihenfolgeprobe: `…abhaengigkeiten` **ohne** `…scalable_job_queue` | bricht ab (`relation "public.helmut_jobs" does not exist`) |

Beide Reihenfolgefehler sind **laut und vollständig** — kein Teilzustand. Die
Abhängigkeitsreihenfolge ist in den Dateiköpfen genannt.

---

## 4 · Testergebnisse (alle selbst ausgeführt)

Alle Läufe über `node scripts/lokal.js …` (siehe §2.2 O9), `HELMUT_TEST_PG_HOST=127.0.0.1`,
`HELMUT_TEST_PG_PORT=5433`.

| Prüfung | Ergebnis |
|---|---|
| Eigene Flagmatrix-/Neutralitätsprobe (nicht aus der PR) | **23 PASS / 0 FAIL** |
| Warteschlange Datenbank (echte Migration + Rollback) | **55 PASS / 0 FAIL** (vorher 52; +3 neu) |
| Warteschlange Vertrag | **113 PASS / 0 FAIL** (vorher 100; +13 neu) |
| Merge-Neutralität Relevanzordnung | **26 PASS / 0 FAIL** (vorher 24; B/C/D jetzt echt + 2 Gegenproben) |
| V3-Anbindung | **56 PASS / 0 FAIL / 2 OFFEN** (vorher 55) |
| Mandantentrennung Warteschlange | **69 PASS / 0 FAIL** |
| KI-Budget Fairness | **59 PASS / 0 FAIL** |
| Flagmatrix OP-30 | **57 PASS / 0 FAIL** |
| Relevanzordnung | **47 PASS / 0 FAIL** |
| Lokaler Production-Schutz | **76 PASS / 0 FAIL** |
| Source-Demand | **59 PASS / 0 FAIL** |
| 24-h-Simulation | **64 PASS / 0 FAIL / 3 OFFEN** |
| 1000 Mandate | **69 PASS / 0 FAIL / 2 OFFEN** |
| Bereinigung | **38 PASS / 0 FAIL / 1 OFFEN** |
| Pipeline-Flag | **50 PASS / 0 FAIL** |
| Profilinventar 200 | **18 PASS / 0 FAIL / 3 OFFEN** |
| Anbieterausfall · KI-Modellzahlen | **17** · **9 PASS / 0 FAIL** |
| Env-Inventar · Sales-Blocker | **38** · **30 PASS / 0 FAIL** |
| Größenprüfung `CURRENT_STATE.md` | **4 PASS / 0 FAIL** |
| Mutationsprobe Warteschlange | **10/10 rot** |

### Mutationsproben zu den eigenen Korrekturen

Jede Korrektur wurde einzeln zurückgedreht; der zugehörige Nachweis muss dann **rot** werden:

| Zurückgedreht | Ergebnis |
|---|---|
| Mandatsfilter zurück auf `p.disabled !== true` | **rot** (2 FAIL) |
| Dokumentkennung zurück auf die Blob-`id` | **rot** (2 FAIL) |
| Stapelrest wieder liegen lassen | **rot** (2 FAIL) |
| Rückstandsmessung zurück auf `due_at` | **rot** (1 FAIL, gemessen `-119,96 s` statt `> 90 000 s`) |
| Lease-Deckel entfernen | Verhalten ändert sich nachweisbar (Auftrag läuft 120 000 ms statt 10 000 ms; die Zusage in 12.8 trifft nicht mehr zu) |

**Keine der neuen Prüfungen ist trivial grün.**

---

## 5 · Vergleich mit `origin/main`

Die lokal roten Suiten wurden in einem **separaten Arbeitsbaum** auf unverändertem
`origin/main` (`1f10d66`) mit demselben Node (v22.22.2) und derselben Umgebung nachgestellt:

| Suite | auf `origin/main` | Einordnung |
|---|---|---|
| `privacy-vollstaendigkeit-test` | rot (2 FAIL) | **bekannte Baseline** |
| `profile-db-test` | rot (3 FAIL, Netz-Guard-Treffer) | **bekannte Baseline** |
| `provision-tenant-test` | rot (1 FAIL) | **bekannte Baseline** |
| `tenant-neutrality-test` | rot (1 FAIL) | **bekannte Baseline** |
| `kalender-ics-test` | **grün** mit installierten Abhängigkeiten | umgebungsbedingt (die PR-Beschreibung nennt es rot, weil dort `node_modules` leer war) |

**Keine neue Regression.** Die vier roten Suiten sind auf `origin/main` wortgleich rot.
**Im CI sind sie grün** (Lauf `31280498362`: `225/225 Suiten grün`) — sie sind also
**umgebungsbedingt** in dieser Sitzung, nicht in der Sache.

---

## 6 · Was dieser Review **nicht** beweist

- **Keine Aussage über Production.** Kein Lauf, kein Deployment, kein Environment-Zugriff.
- **200 und 1 000 Mandate sind `lokal simuliert` und `berechnet`,** nicht gemessen. Die
  Simulation benutzt **synthetische** Profile und Attrappen für Abruf und Verstehen.
  Es gibt **10 echte Profile, nicht 200**.
- **Die Preisbasis der Kostenrechnung ist ein unbelegter Schätzwert im Code.** Die Beträge
  sind Größenordnungen, keine Rechnungsbeträge.
- **Der wirksame Tagesdeckel in Production ist offline nicht lesbar.**
- **Die OP-30-Befunde oben sind offline nachgewiesen.** Dass der Warteschlangenpfad nach den
  Korrekturen unter echter Last, echter Google-Drosselung und echter KI funktioniert, ist
  **nicht** gezeigt und kann nur in Production gezeigt werden.

---

## 7 · Geltung von OP-25 (unverändert)

1. **OP-25 ist für die bisherige Architektur mit fünf Mandaten bestanden**
   (drittes Fenster 2026-08-07/08, Exit 0, null Befunde — [`vorgangskontext.md`](vorgangskontext.md) §7.7.9).
2. **OP-25 beweist weder OP-30 noch 200 Mandate.**
3. **Nach Aktivierung des OP-30-Ausführungspfads muss OP-25 vollständig wiederholt werden**
   (die Aktivierung verändert `quellenVereinigung`, die K2.1-Sichtbarkeitsmengen und die Laufzeitbilanz).
4. **OP-14 und die dokumentierten OP-25-Restpunkte** (Abdeckungsmessung, Abdeckungsalarm,
   R-1, R-3) **bleiben offen.**
5. **Alle OP-30-Flags bleiben standardmäßig ausgeschaltet.**

## 8 · Betreiberbestätigung `HELMUT_CRON_GLOBALABRUF`

Der Betreiber hat am 2026-08-08 ausdrücklich bestätigt: **`HELMUT_CRON_GLOBALABRUF` steht in
Vercel Production auf `on`.** [`env-inventar.md`](env-inventar.md) führte noch `off` (Stand
2026-08-06) und ist auf diese Betreiberbestätigung korrigiert; der Widerspruch zu
[`../CURRENT_STATE.md`](../CURRENT_STATE.md) §5 ist damit aufgelöst. Die dagegenstehende
Zeile in [`production_beweisprotokoll.md`](production_beweisprotokoll.md) §9.1 bleibt
**unverändert** stehen — sie ist ein datierter Nachweis des Zustands zum Zeitpunkt des
Redeploys `dpl_3y5n…` (07:50:22Z) und kein Aussage über heute.

**Kein Vercel-Zugriff, keine Environment-Änderung, kein Flag verändert.**

## 9 · Empfehlung

**Merge ist aus Sicht dieses Reviews vertretbar** — die Verhaltensneutralität ist belegt, es
gibt keine offenen kritischen oder hohen Befunde mehr, und keine neue Regression. Der Merge
bleibt eine Betreiberentscheidung und ist zugleich ein Production-Deployment.

**Vor der ersten Aktivierung von `HELMUT_SCALABLE_PIPELINE` sind O1–O5 zu entscheiden** —
insbesondere O1 (Mandantenanteil/Rotation sind gebaut, aber nicht verdrahtet) und O2 (der
Workerbetrieb ist gebaut, aber nicht erreichbar). Ohne diese Entscheidungen liefert der
Warteschlangenpfad weniger, als die Beschreibung nahelegt.
