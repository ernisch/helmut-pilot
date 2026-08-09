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
| **B14** | **hoch** | `lib/helmut/scalable-pipeline.js` (`handleDocumentUnderstanding`, `handleMandateProjection`) | **Ein ausdrücklich übersprungener V3-Lauf wurde als erledigter Auftrag verbucht.** `runUnderstandingShadow`, `runMatchingShadow` und `runDecisionShadow` liefern in mehreren Fällen `{ skipped: true, reason }` — darunter **`understanding-locked` und `matching-locked`, also vorübergehende Sperrkollisionen**. Der Handler meldete darauf `ok:true` und der Auftrag galt als erledigt. Beim Verstehen trägt der Idempotenzschlüssel bewusst **kein** Aktualitätsfenster: die Dokumente wären damit **dauerhaft unverstanden** geblieben — gemeldet als Erfolg. Bei der Projektion hätte das Mandat seine Projektion für das **ganze 24-h-Fenster** verloren. Dritter Fall derselben Familie wie B1 und B7 (CLAUDE.md §4.10). | Beide Handler stellen jetzt **zurück** statt abzuschließen — über den bereits vorhandenen `zurueckgestellt`-Weg, der den Versuch nicht verbraucht. Regression: `jobqueue-vertrag-test.js` 12.14–12.16 (inkl. Gegenprobe, dass eine echte Projektion unverändert erfolgreich bleibt). |
| **B11** | **niedrig** | `server.js` | `Number(process.env.HELMUT_WORKER_BATCH \|\| 10)` ⇒ ein unbrauchbarer Wert ergibt `NaN`, `Math.max(1, NaN)` ist `NaN`. | `Number(...) \|\| 10`. |
| **B12** | **niedrig** | `docs/betrieb/env-inventar.md`, `scripts/env-inventar-test.js` | `HELMUT_WORKER_PARALLEL/_BUDGET_MS/_LEASE_MS/_STAPEL` fehlten im Inventar. Der Vollständigkeitsscanner sieht nur `process.env.NAME`, `flagValue("NAME")` und `env.NAME` — `worker-betrieb.js` liest über einen eigenen Helfer und war deshalb unsichtbar, während der Scanner „vollständig" meldete. | Vier Variablen dokumentiert; der Scanner kennt sie jetzt ausdrücklich. |
| **B13** | **hoch** | `scripts/jobqueue-datenbank-test.js` (Abschnitt 8.1) | **Ein flackernder Nachweis.** Die Prüfung las die Reihenfolge über `row_number() over ()` aus der Rückgabe von `helmut_claim_jobs`. Ein **leeres Fensterfeld** hat in PostgreSQL keine definierte Sortierung, und `helmut_claim_jobs` sagt über die Reihenfolge seiner Rückgabe ohnehin nichts zu: die Sortierung steht im CTE `kandidaten` und bestimmt, **welche** Zeilen reserviert werden; das `update … returning j.*` liefert sie in Join-Reihenfolge. **Im vollständigen Offline-Lauf unter Last einmal rot geworden** (`P-spaet,P-frueh`); im Leerlauf 10/10 grün. Genau die Sorte Nichtdeterminismus, die dieser PR an anderer Stelle selbst benennt (`created_at desc`). Da die Suite im CI mangels Datenbank übersprungen wird (O21), hätte sie das Pflicht-Gate erst rot gemacht, sobald dort eine Datenbank steht. | Statt der Rückgabereihenfolge wird jetzt die Zusage geprüft, die die Funktion **wirklich** gibt: zwei aufeinanderfolgende Reservierungen mit `p_limit := 1`. Verifiziert über **5 Läufe, davon 3 unter künstlicher Fremdlast, 5/5 grün**. |

### 2.2 Bestätigt, aber **nicht** geändert (Begründung jeweils)

Vierunddreissig Punkte. Keiner davon wirkt bei ausgeschalteten Flags; O1–O5 sind vor der ersten
Aktivierung zu entscheiden, O17–O19 vor dem nächsten Veröffentlichen der Skalierungszahlen.

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
| O17 | mittel | **`skalierungsmodell.rechneSzenario` leitet die geteilten Abrufe je Tag aus der FENSTERBREITE ab** (`geteilteAuftraege * 24 / geteiltStundenFenster`), nicht aus der tatsächlichen Planungskadenz. Das ist eine Modellannahme („in jedem 8-h-Fenster wird jeder geteilte Weg genau einmal geholt"), die im Text nicht als solche benannt ist. Sie geht in **1 645 KI-Aufrufe/Tag** und damit in die Deckelempfehlung ein. | Die Annahme zu ersetzen hieße, die veröffentlichten Zahlen neu abzuleiten — das ist Rechenarbeit mit eigenem Nachweisbedarf, keine Reviewkorrektur. Die Zahlen bleiben als **`berechnet`** gekennzeichnet. |
| O18 | niedrig | **`rechneErstbefuellung` überschreibt nur einen Teil der abgeleiteten Werte** (`rohitems`, `dokumenteNachDedup`, `neueVorgaenge`, `ki`, `zumDeckel`); **Kosten, Speicher und Warteschlangenbestand stammen weiter aus dem Normaltag** und werden trotzdem unter „Erstbefüllung" ausgewiesen. Die einzige in der PR genannte Erstbefüllungszahl (**19 197** Aufrufe) ist von der Lücke **nicht** betroffen. | Latente Inkonsistenz ohne veröffentlichten Fehlwert. |
| O19 | niedrig | Die Bündelgröße des Verstehens steht in `skalierungsmodell.js` als Literal `25` statt aus `scalable-pipeline.UNDERSTANDING_BUENDEL` gelesen — zwei Wahrheiten für denselben Wert. | Einzeiler, aber er verändert eine veröffentlichte Rechnung; gehört in denselben Schritt wie O17. |
| O20 | niedrig | `scripts/skalierung-simulation-test.js` ändert sein Ergebnis abhängig von Umgebungsvariablen (`HELMUT_DEMAND_*`, `HELMUT_WORKER_*`), ohne das im Bericht auszuweisen. Im CI und in diesem Review sind sie ungesetzt. | Kennzeichnung wäre gut, ändert aber keinen Messwert. |
| O21 | **hoch** | **Übersprungene Datenbank-Suiten meldet der kanonische Runner als `PASS` und zählt sie in der Zeile „N/N Suiten grün" mit.** `jobqueue-datenbank-test.js` beendet sich ohne erreichbaren Server mit Exit 0 und der ehrlichen Zeile „übersprungen, Nachweis offen" — `run-offline-tests.js` sieht nur den Exit-Code. **Das CI-Grün `225/225` enthält den Datenbanknachweis deshalb NICHT.** Er wurde in diesem Review separat und mit echter Datenbank geführt (§3, §4). | Der Runner bräuchte einen dritten Zustand (`OFFEN`). Das ist eine Änderung am Pflicht-Gate selbst und gehört nicht in den Review dieses PR. **Bis dahin gilt: CI-Grün beweist den Datenbankteil nicht.** |
| O22 | mittel | **`scripts/jobqueue-mutationsprobe.js` und `scripts/jobqueue-lasttest.js` werden von keinem Gate eingesammelt** — sie enden nicht auf `-test.js` und stehen auch nicht in der `DENYLIST`. Die in der PR genannte Zusage „Mutationsprobe 10/10 rot" wird also nie automatisch geprüft. In diesem Review manuell ausgeführt: **10/10 rot**. | Umbenennen holte sie ins Pflicht-Gate (der Lasttest braucht eine Datenbank) — das ist eine Gate-Entscheidung. |
| O23 | mittel | **Abschnitt 9 von `jobqueue-vertrag-test.js` („Gleichheit der Attrappe mit der ECHTEN Datenbank") verschwindet ohne Server spurlos.** Ohne `HELMUT_TEST_PG_HOST` läuft die Suite mit **108** statt **113** Zusagen und meldet trotzdem `FAIL 0`. Die Gleichheitszusage, auf der alle übrigen Befunde dieser Suite ruhen, ist im CI also **nicht** geprüft. | Gleiche Ursache und gleiche Entscheidung wie O21. |
| O24 | niedrig | `scripts/jobqueue-mutationsprobe.js` mutiert ausschließlich die SQL-Migration, nicht den neuen JavaScript-Produktionscode. Die JS-Seite ist in diesem Review durch **eigene** Mutationsproben abgedeckt (§4). | Erweiterung ist eigene Arbeit. |
| O25 | mittel | **`scripts/matching-erklaerung-test.js` prüft — wie `scoring-integration-test.js` (O6) — nur noch den Pfad mit eingeschalteter Relevanzordnung.** Die Änderung ist im Test begründet, aber die Doppelung ist in der PR-Beschreibung nicht als solche benannt. | Gleiche Begründung wie O6: ein Rückbau machte die Zusagen der Suite widersprüchlich. Hier benannt statt still gelassen. |
| O26 | niedrig | `scripts/e2e-vertrag-geruest.js`: ein Kommentar behauptet eine Korrektur am Lesepfad, die im Diff nicht stattfindet. | Kommentarfehler ohne Wirkung. |
| O27 | mittel | **Der globale Tageszähler wird bei aktivem `HELMUT_LLM_FAIRNESS` doppelt belastet.** `helmut_reserve_llm_result` erhöht dieselbe `llm_budget_counters`-Zeile (`scope='global'`), die der unveränderte V3-Pfad über `helmut_reserve_llm_call` je **einzelnem** Modellaufruf erhöht. Ein `document_understanding`-Auftrag bucht damit eine zusätzliche Einheit, der kein Modellaufruf entspricht — der wirksame Deckel liegt um die Zahl der Verstehensaufträge unter dem konfigurierten Wert. Richtung: **konservativ** (zu früh gedeckelt, nie zu spät). | Die saubere Trennung der beiden Zählerwelten ist eine Entwurfsentscheidung der Budgetschicht, kein Reviewfix. **Vor Aktivierung von `HELMUT_LLM_FAIRNESS` zu klären.** |
| O28 | mittel | **Eine Reservierungseinheit deckt ein Bündel von bis zu 25 Dokumenten**, wird aber in denselben Zähler gebucht wie ein einzelner Modellaufruf. Die Buchführung unterschätzt den echten Verbrauch also um bis zu Faktor 25 — anders als O27 in die **unsichere** Richtung. | Gleiche Ursache wie O27: die Buchungseinheit der neuen Schicht ist der *Auftrag*, die der alten der *Aufruf*. Muss vor der Aktivierung zusammengeführt werden. |
| O29 | mittel | **Die Budgetschicht ist bei Speicher-/Netzfehlern still fail-OPEN.** `budgetAdapter.reserviere` gibt bei `verfuegbar:false` `null` zurück, der Handler läuft dann ohne Reservierung weiter — ohne Log und ohne Kennzahl. Der bestehende V3-Deckel greift weiterhin, es ist also kein offener Deckel; aber der Ausfall der neuen Schicht ist unsichtbar. | Bewusst so kommentiert („fällt auf den bestehenden Deckel zurück"). Eine Kennzahl dafür ist neue Funktionalität. |
| O30 | niedrig | `helmut_prune_llm_reservations` hat keinen Aufrufer — `llm_reservations` wächst unbegrenzt. | Aufbewahrung ist Betreiberentscheidung (OP-12/OP-02), wie bei `helmut_prune_jobs`. |
| O31 | niedrig | `scripts/lokal.js` stürzt bei `node scripts/lokal.js --` ohne Befehl mit `TypeError` ab statt die Nutzung anzuzeigen. | Kosmetik am lokalen Starter. |
| O32 | niedrig | `scripts/ki-modellzahlen-test.js` leitet dieselben Zahlen ein zweites Mal her und veröffentlicht dabei einen Wert, den `skalierungsmodell.js` an anderer Stelle als unbelegt bezeichnet. | Zwei Herleitungen derselben Größe — zusammenzuführen gehört zu O17/O19. |
| O33 | niedrig | `docs/betrieb/op30-abnahme-2026-08-08.md` nennt PASS-Zahlen, die durch spätere Sprints desselben PR überholt sind. | Belegdatei eines früheren Sprints; sie beschreibt ihren eigenen Stand korrekt. |
| O34 | niedrig | Die Liste der geprüften Zugangsdaten in `lokaler-netzschutz.js` deckt sich nicht vollständig mit den Variablen, die der Code an anderer Stelle liest; der Abbruchhinweis nennt bei einem Adress-Befund weiterhin nur die Zugangsdaten. | Der Riegel bleibt fail closed; betroffen ist nur die Formulierung des Hinweises. |

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
| Warteschlange Datenbank (echte Migration + Rollback) | **55 PASS / 0 FAIL** (vorher 52; +3 neu) · zusätzlich **5 Läufe, 3 unter Fremdlast, 5/5 grün** (Flackern B13) |
| Warteschlange Vertrag (mit Datenbank) | **116 PASS / 0 FAIL** (vorher 100; +16 neu) |
| Warteschlange Vertrag **ohne** Datenbank (wie im CI) | **111 PASS / 0 FAIL** — Abschnitt 9 entfällt still (O23) |
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
| `skipped`-Riegel im Verstehen entfernt | **rot** (1 FAIL) |
| Lease-Deckel entfernen | Verhalten ändert sich nachweisbar (der Auftrag läuft dann bis `HELMUT_JOB_TIMEOUT_MS` statt bis 2 000 ms; die Zusage in 12.8 trifft nicht mehr zu) |

**Keine der neuen Prüfungen ist trivial grün.**

**Ehrlichkeitsvorbehalt zum CI-Grün (O21/O23):** `225/225 Suiten grün` im CI schließt den
Datenbanknachweis **nicht** ein — dort ist kein PostgreSQL erreichbar, `jobqueue-datenbank-test.js`
überspringt sich mit Exit 0 und wird vom Runner als `PASS` gezählt. Der Datenbankteil ist
ausschließlich durch die Läufe in §3 und §4 dieses Belegs gedeckt.

Die neue Prüfung 12.8 kostet reale Wartezeit; sie wurde deshalb auf **2 s** verkürzt (Lease 4 000 ms)
und über **12 Wiederholungen, davon 6 unter künstlicher Fremdlast, 12/12 grün** auf Determinismus
geprüft — ein flackerndes Pflicht-Gate wäre schlimmer als kein Nachweis.

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

## 8a · Weitere Dokumentationskorrekturen dieses Reviews

Alle vier sind **veraltete oder widersprüchliche Statusangaben**, keine inhaltlichen Änderungen:

| Datei | Vorher | Jetzt |
|---|---|---|
| [`vorgangskontext.md`](vorgangskontext.md) Kopf | „Zustand von `HELMUT_CRON_GLOBALABRUF` ist nicht lesbar — offene Betreiberprüfung" | `on`, Betreiberbestätigung 2026-08-08 (weiterhin keine API-Einsicht) |
| [`../roadmap/phase_1_checkliste.md`](../roadmap/phase_1_checkliste.md) Zeile 106 | „Deckel 100 + Reserve 30" als belegter Zustand | „100" ist eine Runbook-Empfehlung; der Code fällt fail-closed auf **50** zurück, der wirksame Wert ist offline nicht lesbar — genau das, was derselbe PR an anderer Stelle bereits richtigstellt |
| [`../datenmotor-restliste.md`](../datenmotor-restliste.md) OP-30-Block | „24 PASS" · „Relevanzordnung … Default AN" | „26 PASS" mit Hinweis auf Befund B6 · ausdrücklich als Stand **vor** der Umstellung auf Default AUS gekennzeichnet |
| [`../CURRENT_STATE.md`](../CURRENT_STATE.md) §7a | „CI der PR ist grün (Lauf `31280498362`)" — dieser Lauf gehörte zu `6d54dbb`, nicht zum Kopf | „CI der PR ist grün — **auf dem aktuellen Kopf**", ohne Laufnummer |

Der letzte Punkt war ein Fehler **dieses Reviews**: eine Grün-Aussage, die einen anderen Commit
belegte als den, über den entschieden wird. Genau die Art Aussage, die dieser Review sonst
beanstandet.

## 9 · Empfehlung

**Merge ist aus Sicht dieses Reviews vertretbar** — die Verhaltensneutralität ist belegt, es
gibt keine offenen kritischen oder hohen Befunde mehr, und keine neue Regression. Der Merge
bleibt eine Betreiberentscheidung und ist zugleich ein Production-Deployment.

**Vor der ersten Aktivierung von `HELMUT_SCALABLE_PIPELINE` sind O1–O5 zu entscheiden** —
insbesondere O1 (Mandantenanteil/Rotation sind gebaut, aber nicht verdrahtet) und O2 (der
Workerbetrieb ist gebaut, aber nicht erreichbar). Ohne diese Entscheidungen liefert der
Warteschlangenpfad weniger, als die Beschreibung nahelegt.
