# OP-30 — Aktivierungsreife für 200 Mandate (Sprint 2026-08-09)

**Stand:** 2026-08-09 · **Basis:** `origin/main` `559a3d9` (Merge von PR #233) ·
**Branch:** `claude/op30-aktivierungsreife-200-i10sv1`
**Rolle:** Belegdatei. Der kompakte Stand steht in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

> **In diesem Sprint wurde nichts aktiviert.** Kein Flag, keine Migration, keine
> Environment-Änderung, kein manueller Production-Lauf, kein echtes Profil angelegt oder
> geändert. Alle Production-Zugriffe waren **lesend**.

---

## 1 · Ausgangslage und Sicherheitsprüfung nach dem Merge

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| PR #233 vollständig in `main` | **ja** — gemergt 2026-08-09T00:35:12Z, Merge-Commit `559a3d9`, `be29b6a` ist Vorfahre von `origin/main` | GitHub-API, `git merge-base --is-ancestor` |
| Production-Deployment | **READY** — `dpl_E9b2Lqa387JLRz85U88xEXJkbaDD`, target `production`, Commit `559a3d9` | Vercel-API (lesend) |
| OP-30-Migration angewendet? | **nein** — `helmut_jobs` existiert in Production **nicht** | Supabase, lesende Abfrage auf `information_schema.tables` |
| OP-30-Flags | **alle default AUS** — fail closed im Code, nicht in `helmut-flags.json`, nicht in `vercel.json` | `flagmatrix-op30-test.js` 57/57 |
| Worker/Queue automatisch aktiv? | **nein** — `planeArbeit`/`arbeite` nur hinter `skalierbarerPfadAktiv()`; kein Aufruf in `.github/`, `package.json`, `vercel.json` | gezielte Suche über alle Einstiegspunkte |
| `HELMUT_CRON_GLOBALABRUF` | unverändert **`on`** (Betreiberbestätigung 2026-08-08) — **nicht angefasst** | keine Env-Änderung in diesem Sprint |
| Die fünf Mandate | **unverändert 5 aktiv** (`annika-klose`, `cem-ince`, `helmut-kleebank`, `ottilie-paola-klein-2`, `ruppert-st-we`), 4 deaktiviert | Supabase `mandate_profiles`, lesend |
| Altpfad verhaltensgleich | **ja** — `lage.ordneFrueh`/`ordne` geben bei Flag AUS die Eingabe unverändert zurück; `cronSchwererPfad` ist bei Flag AUS byte-gleich | Diff `1f10d66..559a3d9`, `relevanzordnung-mergeneutralitaet-test.js` 26/26 |

### Die eine ehrliche Einschränkung

**Eine Production-Regression durch PR #233 ist zum Zeitpunkt dieses Sprints noch nicht
beobachtbar.** Der Merge lief um 00:35:12Z, die Prüfung um 00:43Z — **acht Minuten später**.
Der nächste planmäßige Cron ist `crawl` um 04:00Z. Es gibt also **keinen einzigen Lauf auf
`559a3d9`**, weder einen erfolgreichen noch einen gescheiterten.

Was belegt ist: das Deployment ist READY, und die letzten Läufe vor dem Merge (bis
2026-08-08 21:30Z, Commit `1f10d66`/`a07954df`) waren durchweg `success` bzw. das erwartete
`partial` der globalen Phase. Was **nicht** belegt ist: dass der erste Lauf auf `559a3d9`
sauber durchgeht. Das ist **kein Grund zum Abbruch** (die Abbruchbedingung des Auftrags war
„Deployment nicht READY **oder** erkennbare Regression der Altarchitektur" — beides trifft
nicht zu), aber es gehört benannt.

**Nächster Prüfpunkt für den Betreiber:** nach 04:05Z einmal `process_runs` ansehen.

---

## 2 · Entscheidungen zu O1–O5

Alle fünf Punkte stammen aus [`op30-abschlussreview-2026-08-08.md`](op30-abschlussreview-2026-08-08.md) §2.2.
**Alle fünf sind gelöst**, nicht vertagt. Alle Änderungen liegen hinter den unverändert
ausgeschalteten Flags.

### O1 — Mandantenanteil und faire Rotation waren im Produktionspfad unbenutzt

**Der Befund ist reproduziert, nicht zitiert.** Die Fälligkeit mandatsbezogener Aufträge
entstand aus `streuwert("<typ>|<mandatsId>")` — einem SHA-256 der Mandatskennung, also
**tagesunabhängig**. Zusammen mit der Anspruchsordnung der Warteschlange
(`order by priority asc, due_at asc, created_at asc`) standen damit **jeden Tag dieselben
Mandate vorn und dieselben hinten**. Reicht das Zeitbudget eines Slots nicht für alle, fällt
immer dieselbe Gruppe herunter. Gemessen (`op30-aktivierungsreife-test.js` 1.1): zwei
Planungen, 17 Tage auseinander, sind **zeichengleich**.

**Entscheidung: verdrahten.**

- `planeArbeit` ruft `llm-budget-fair.tagesplan` auf und reicht `reihenfolge` an
  `kompiliereQuellenbedarf` und `planeMandatsarbeit` durch.
- Die Rotation **ordnet, sie wählt nicht aus**: es wird weiterhin jedes aktive Mandat geplant,
  ohne `slice`, ohne Obergrenze. Nur die Zuordnung der Plätze im ohnehin vorhandenen
  Streubereich wandert täglich.
- Die Schrittweite kommt aus `tagesplan` selbst: reicht das Budget für alle, bleibt die
  Reihenfolge stabil (dann verhungert niemand); reicht es nicht, wandert sie um genau die Zahl
  der Plätze weiter. **Gemessen:** 60 Mandate, Deckel 20 → nach **6 Tagen** war jedes einmal
  in den vordersten 10.

**`scopeMax` ist nicht mehr `null`.**

| Bereich | Wert | Woher |
|---|---|---|
| `global` (Verstehen) | `llm-budget-fair.globalerTopf` | Tagesdeckel **minus** dem tatsächlichen mandatsbezogenen Bedarf, höchstens der konfigurierte Anteil |
| `tenant:<id>` | `llm-budget-fair.mandantenDeckel` | Zuteilung dieses Mandats aus dem Tagesplan |

**Warum der globale Topf bedarfsgetrieben ist und kein fester Anteil.** Der 50-%-Schnitt aus
`HELMUT_LLM_GLOBAL_ANTEIL` wäre hier doppelt falsch:

1. **Er verschenkt.** Mandatsbezogene Warteschlangenarbeit (Projektion, Briefing) ist
   **KI-frei**. Ein fester 50-%-Mandatstopf bliebe weitgehend ungenutzt liegen, während das
   Verstehen — der einzige KI-Verbraucher der Warteschlange — bei der Hälfte des Deckels
   stehenbliebe. Der Abschlussreview hat genau diese Schieflage gemessen: 80–98 % des Bedarfs
   sind global, der Anteil steht auf 50 %.
2. **Er schützt das Falsche.** Mandatsbezogene KI gibt es sehr wohl — nur **außerhalb** der
   Warteschlange: das Lage-Narrativ (`lage.generateLageBriefing`, Cron `lage-briefing`, ein
   Aufruf je aktivem Mandat und Berliner Tag, `llm-pfad-karte.md` Pfad 6). Es zählt gegen
   **denselben** globalen Tageszähler. Ohne Reserve kann das Verstehen es verdrängen — und
   ausgerechnet der sichtbare Teil des Produkts fiele aus.

Reserviert wird deshalb genau der tatsächliche Bedarf (ein Narrativ je aktivem Mandat),
gedeckelt durch den konfigurierten Anteil. `HELMUT_LLM_GLOBAL_ANTEIL` ist damit eine
**Obergrenze der Mandatsreserve**, kein starrer Schnitt. Damit erledigt sich zugleich der
Befund des Abschlussreviews, der Anteil 0,5 passe nicht zum gemessenen Bedarf.

> **Ehrliche Grenze, ausdrücklich:** der mandatsbezogene Zweig ist verdrahtet, vertraglich
> geprüft und in der Simulation belegt — er hat aber im **heutigen** Warteschlangenpfad
> **keinen Verbraucher**. Siehe Entscheidungsfrage **E1** in §7.

### O2 — `worker-betrieb.js` war im Betrieb tot

**Entscheidung: verdrahten** (nicht entfernen).

`server.js runCronUeberWarteschlange` ruft nicht mehr `scalable-pipeline.arbeite` direkt,
sondern `worker-betrieb.durchlauf`. Damit sind erreichbar: begrenzte Parallelität, der Riegel
gegen externen Abruf bei `HELMUT_SOURCE_MODE=off`, Health und Readiness — und die vier
`HELMUT_WORKER_*`-Variablen sind wirksam statt dekorativ.

Der Cron gibt seine Slotgrenzen vor (nur er kennt seine Restzeit). Sie laufen durch **dieselbe
harte Klemmung** wie Umgebungswerte: ein Aufrufer kann keine unbegrenzte Lease, keine
unbegrenzte Parallelität und keinen unbegrenzten Stapel erzwingen (geprüft: 999 → 8,
99 999 999 ms → 900 000 ms, `"abc"` → Standard 2).

`/api/ops/jobqueue` meldet zusätzlich die Readiness. **Warum das zählt:** `zustand` beantwortet
„wie steht die Warteschlange?", `bereit` beantwortet „darf und kann überhaupt jemand sie
abarbeiten?". Ohne die zweite Frage sieht ein stillstehender Betrieb wie ein leerer aus.

### O3 — Die Vorbedingungsprüfung sah ein Drittel

`helmut_jobs_offen` nahm **genau ein** Fenster. Projektion und Briefing tragen das
24-h-Mandatsfenster, die geteilten Abrufe liegen in **8-h-Fenstern** (`…T00Z`, `…T08Z`,
`…T16Z`) — zwei Drittel waren unsichtbar, und ein Briefing hielt sich für vorbedingungsfrei,
während seine Abrufe noch liefen.

**Entscheidung: lösen.** Die Funktion nimmt eine **Liste**. Welche Fenster dazugehören,
entscheidet `scalable-pipeline.enthalteneFenster`: alle Fenster, die **vollständig im Fenster
des Auftrags liegen**. Das schließt das 7-Tage-Archivfenster bewusst aus — ein Briefing darf
nicht auf eine Hintergrundsuche mit Wochenkadenz warten (sie trägt deshalb auch Priorität 300).

Die alte Signatur wird ausdrücklich per `drop function` entfernt (`create or replace` kann den
Parametertyp nicht ändern); der Rollback räumt **beide**. **Gegenprobe im Test:** mit nur dem
24-h-Fenster ist derselbe offene Abruf unsichtbar (`offen=0`) — genau der Befund.

### O4 — Budgetbedingtes Zurückstellen war unbegrenzt

`helmut_defer_job` nimmt den Versuch zurück; es gab also **keine** Zählung, die das Pendeln je
beendet hätte. Ein Verstehensauftrag hätte bei dauerhaft erschöpftem Tagesbudget **für immer**
zwischen `wartend` und `läuft` gependelt.

**Entscheidung: begrenzen.** Nach `HELMUT_BUDGET_MAX_WARTE_MS` (Standard **48 h**, gemessen ab
`created_at` — `due_at` wird vom Zurückstellen selbst verschoben) bricht der Auftrag mit
`budget-dauerhaft-erschoepft` ab. Der Text gilt als **endgültig**, wird also nicht noch fünfmal
wiederholt. 48 h und nicht 24: erst wenn **zwei volle Tagesbudgets** nichts frei gemacht haben,
ist das kein Warten mehr, sondern ein Zustand. Ohne `created_at` wird **nicht** abgebrochen
(fail closed Richtung Warten).

### O5 — Endgültig gescheiterte Verstehensaufträge kamen nie wieder

Der Idempotenzschlüssel des Verstehens trägt bewusst **kein Fenster** (sonst würde derselbe
Artikel in jedem Fenster erneut angemeldet). Die Kehrseite: eine `fehlgeschlagen`-Zeile
blockierte ihre Dokumentmenge **dauerhaft** — und `helmut_jobs_bereinigen` räumt
`fehlgeschlagen` ausdrücklich nicht weg (sie ist der Fehlerbeleg). Nach **einer einzigen**
vorübergehenden Modellstörung wären diese Dokumente für immer ungelesen geblieben.

**Entscheidung: lösen — Beleg und Blockade trennen.** Neue Migration
`20260809_jobqueue_wiedervorlage.sql` (mit Rollback, **nicht angewendet**):

- Die Zeile **bleibt** mit ihrem Fehlertext stehen und wird lediglich wieder `wartend`.
- **Höchstens** `HELMUT_WIEDERVORLAGE_MAX` mal (Standard 2), **frühestens** nach 24 h.
- **Standard ist Trockenlauf** — dieselbe Disziplin wie bei der Bereinigung.
- **Nebenläufigkeitsfest** über `for update skip locked`.
- `first_due_at` bleibt **unverändert**: die Rückstandsmessung darf nicht zurückgesetzt werden
  (das war Befund B2 des Abschlussreviews).
- Was danach übrig bleibt, meldet `helmut_jobs_blockiert` — und `betriebsstatus` wird davon
  **kritisch** statt grün. Fehlt die Migration, ist das ein **unbekannter** Zustand, kein guter.

---

## 3 · Neuer Befund dieses Sprints

**B14 (mittel) — `jobqueue-bereinigung-test.js` hätte das Pflicht-Gate rot gemacht.**
Anders als alle Geschwistersuiten legte sie ihre Datenbank **nicht** an, sondern setzte
`helmut_test` als vorhanden voraus. Ohne die Datenbank brach sie mit `TESTLAUF-FEHLER` und
**Exit 1** ab — nicht mit dem ehrlichen Übersprung, den sie für den Fall „kein Server" vorsieht.
Auf jeder Maschine mit gesetztem `HELMUT_TEST_PG_HOST` und ohne handangelegte Datenbank wäre
das Gate rot geworden, mit einer Meldung, die wie ein Migrationsfehler aussieht und keiner ist.
**Gemessen in genau dieser Sitzung:** frische PostgreSQL 16.13, vier Geschwistersuiten grün,
diese eine rot. Behoben — die Suite legt ihre Datenbank jetzt selbst an.

**Nebenbefund an der Attrappe:** `scripts/fixtures/jobqueue-speicher-treiber.js` verglich
Fenster mit `===`, die Datenbank mit `= any(…)`. Eine Attrappe, die **enger** vergleicht als die
Ablage, meldet „keine Vorbedingung offen" — genau die Sorte falsches Grün, die dieser Pfad
ausschließen soll. Angeglichen.

---

## 4 · Der Ausführungspfad — was verdrahtet ist und was nicht

| # | Punkt aus dem Auftrag §4 | Zustand |
|---|---|---|
| 1 | Erzeugung und Einreihung von Aufträgen | verdrahtet · `source-demand` + `planeArbeit` |
| 2 | Tenant-Bindung jedes Auftrags | verdrahtet · geteilt = `tenant_id null`, persönlich = Mandatskennung im Schlüssel **und** in `tenant_id` |
| 3 | Atomare Reservierung konkurrierender Worker | verdrahtet · `for update skip locked`, an echter PostgreSQL geprüft |
| 4 | Verarbeitung und Abschluss | verdrahtet · haltergebunden, kein Doppelabschluss |
| 5 | Wiederholungen | verdrahtet · exponentieller Backoff mit stabiler Streuung, `max_attempts` |
| 6 | Idempotenz | verdrahtet · eindeutiger Index auf `idempotency_key` |
| 7 | Wiederanlauf nach Abbruch | verdrahtet · Lease-Ablauf; im Stufennachweis mit Workerabsturz in Stunde 6 belegt |
| 8 | Dauerhaft fehlgeschlagene Aufträge | **neu (O5)** · begrenzte Wiedervorlage + Meldung des Rests |
| 9 | Rückstandserkennung | verdrahtet · `first_due_at` (B2) + `helmut_jobs_blockiert` (neu) |
| 10 | Fairness zwischen Mandaten | **neu (O1)** · Rotation im echten Planungspfad |
| 11 | Globale und mandatsbezogene Kostenbudgets | **neu (O1)** · `scopeMax` beidseitig; mandatsbezogen **ohne Verbraucher** → E1 |
| 12 | Source-Demand-Berechnung | verdrahtet |
| 13 | Relevanzordnung | gebaut, **default AUS**, fail closed |
| 14 | Briefingstufe | verdrahtet (B3 des Abschlussreviews behoben) |
| 15 | Fehlerisolation | verdrahtet · ein kaputtes Profil kostet nie die Versorgung der übrigen |
| 16 | Kontrollierte Bereinigung | verdrahtet · Trockenlauf als Standard, geschützter Bestand |
| 17 | Status und Observability | **erweitert** · Readiness, dauerhaft blockierte Aufträge, Wiedervorlage-Vorschau |

**Die acht Dinge, die nicht möglich sein dürfen** — jedes davon ist entweder im
Abschlussreview behoben (B1–B13) oder in diesem Sprint (O1–O5, B14). Es ist **kein** Punkt
offen geblieben.

---

## 5 · Messwerte 5 / 25 / 50 / 100 / 200 (+ Stress 1 000)

`scripts/skalierung-stufen-test.js` · **43 PASS / 0 FAIL / 5 ausdrücklich OFFEN** · Laufzeit 51 s.

Jede Stufe läuft im **selben, absichtlich unfreundlichen** Szenario: 10 % HTTP 429 · eine
dauerhaft fehlerhafte Quellenfamilie · Workerabsturz in Stunde 6 · doppelter Scheduler ·
vier konkurrierende Worker · langsame Verarbeitung · 10 % deaktivierte Mandate beigemischt ·
Zugang neuer Mandate in Stunde 8 · Rückstand aus einem vorherigen Lauf · ein Schwergewicht
neben vielen Kleinen.

| Stufe | berücks. | vollst. | Verlust | Doppelt | blockiert | max. Warten | Median/p95 | Queue max | fertig | USD/Mandat | Gesamt USD | Durchsatz/h | Fairness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 5/5 | 5 | 0 | 0 | 0 | 2 880 min | 0 / 4 min | 147 | 21:02 | 0,04600 | 0,2300 | 7 | 0,75 |
| 25 | 25/25 | 25 | 0 | 0 | 0 | 3 360 min | 1 / 720 min | 637 | 21:30 | 0,03380 | 0,8450 | 29 | 0,75 |
| 50 | 50/50 | 50 | 0 | 0 | 0 | 2 880 min | 1 / 720 min | 1 083 | 21:34 | 0,02630 | 1,3150 | 49 | 0,75 |
| 100 | 100/100 | 100 | 0 | 0 | 0 | 2 880 min | 1 / 720 min | 1 654 | 21:36 | 0,01680 | 1,6800 | 74 | 0,75 |
| **200** | **200/200** | **200** | **0** | **0** | **0** | **3 187 min** | **1 / 720 min** | **2 722** | **21:38** | **0,01058** | **2,1150** | **121** | **0,75** |
| *1 000* | *1 000/1 000* | *1 000* | *0* | *0* | *0* | *3 308 min* | *1 / 720 min* | *11 261* | *21:38* | *0,00250* | *2,4950* | *495* | *0,75* |

Auf **jeder** Stufe: 0 Fremdzugriffe, 0 Budgetverletzungen, **0 deaktivierte Mandate in
Arbeit** (bei 20 beigemischten auf der 200er-Stufe).

**Die Kosten je Mandat sinken mit der Mandatszahl** (0,046 → 0,0106 USD/Tag), weil der geteilte
Anteil besser ausgenutzt wird. Geprüft in C5/C6.

> **Die Preisbasis `0,0025 USD je KI-Aufruf` ist ein Schätzwert im Code, kein Anbieterpreis.**
> Die Beträge sind Größenordnungen, keine Rechnungsbeträge.

### Die Kapazitätsreserve — und eine Fehlmessung, die ich selbst gebaut habe

Die erste Fassung dieser Suite führte **„Zeit bis Tagesende"** als Kapazitätsreserve und prüfte
sie gegen die geforderten 25 %. Sie lag bei **jeder** Stufe zwischen 9,9 % und 12,4 % — auch bei
**fünf** Mandaten, auch bei 1 000. Eine Größe, die sich zwischen 5 und 1 000 Mandaten kaum
bewegt, misst nicht die Kapazität, sondern den **Fahrplan**: der letzte Briefingauftrag wird per
Entwurf bei 90 % des Tages fällig (21:36, `source-demand.planeMandatsarbeit`) und wurde **zwei
Minuten später** erledigt. Das ist kein erschöpfter Motor, das ist ein pünktlicher.

Der Auftrag verlangt „rechnerische Kapazitätsreserve **gegenüber der erwarteten Last**". Die
wird jetzt **gemessen statt abgelesen**: derselbe unfreundliche Tag läuft zusätzlich mit
**250 statt 200** Mandaten (= +25 %).

> **Ergebnis: 250/250 berücksichtigt · Pflichtarbeit fertig 21:38 · 0 fällig offen ·
> 0 Verlust.** Die geforderten 25 % Reserve sind damit belegt — durch Nachmessen, nicht durch
> Rechnen.

Die Zeitreserve bleibt als ehrliche Zusatzangabe stehen, ausdrücklich als **„NICHT Kapazität"**
beschriftet, mit einer eigenen Prüfung (C3.x), die belegt, dass sie über alle Stufen nahezu
konstant ist (12,4 % · 10,4 % · 10,1 % · 10 % · 9,9 %).

### Abnahmekriterien für 200 Mandate — alle vierzehn erfüllt

| # | Kriterium | Ergebnis |
|---|---|---|
| 1 | alle 200 berücksichtigt | 200/200 |
| 2 | kein Mandat verhungert | Minimum **3** erledigte Aufträge je Mandat |
| 3 | kein Auftrag beim falschen Mandat | 0 Fremdzugriffe |
| 4 | keine Tenant-Grenze verletzt | 0 |
| 5 | kein Kandidat still verloren | 0 in ungültigem Zustand, 0 unter Plan |
| 6 | keine unkontrollierte Doppelverarbeitung | 0 · 423/423 Buchungen eindeutig |
| 7 | alle Rückstände abgebaut | 0 fällig offen · Vorlauf 0 · 113 Archiv (7-Tage-Fenster, planmäßig) |
| 8 | kein Budget überschritten | 423 von 30 000 |
| 9 | Fehlerisolation | 122 Abruffehler, trotzdem alle 200 bedient |
| 10 | Wiederanlauf und Idempotenz | zweite Planung legte **0** neue Aufträge an, Absturz verkraftet |
| 11 | deaktivierte Mandate nicht verarbeitet | 20 beigemischt, **0** in Arbeit |
| 12 | ≥ 25 % Kapazitätsreserve | **gemessen mit 250 Mandaten — gehalten** |
| 13 | alles durch Messwerte gedeckt | 19 Messwerte, keiner geschätzt |
| 14 | 5-Mandate-Pfad bei Flags AUS unverändert | Flag ohne Wert = AUS; Nachweise separat |

### Stresstest 1 000 Mandate

**Kein Abnahmekriterium für Phase 1.** Ergebnis: 1 000/1 000 berücksichtigt, Pflichtarbeit im
Tag fertig (21:38), 0 Verlust, 0 Doppelverarbeitung, 0 deaktivierte in Arbeit, größte
Warteschlange 11 261 Zeilen. **Eine frühe Architekturgrenze ist damit nicht sichtbar geworden** —
das ist eine Simulation und keine Zusage.

---

## 6 · Tests (alle selbst ausgeführt)

Umgebung: Node v22.22.2, lokale **PostgreSQL 16.13** auf `127.0.0.1:5433`, Rollen `anon`,
`authenticated`, `service_role` angelegt. Diese Sitzung trägt Production-Zugangsdaten, deshalb
lief **jeder** Aufruf über `node scripts/lokal.js …` (der dokumentierte Ersatzweg, Befund O9).

| Prüfung | Ergebnis |
|---|---|
| **`op30-aktivierungsreife-test.js`** (neu) | **55 PASS / 0 FAIL / 3 OFFEN** |
| **`jobqueue-wiedervorlage-datenbank-test.js`** (neu, echte DB) | **42 PASS / 0 FAIL** |
| **`profil-import-test.js`** (neu) | **58 PASS / 0 FAIL** |
| **`skalierung-stufen-test.js`** (neu) | **43 PASS / 0 FAIL / 5 OFFEN** |
| **Mutationsprobe O1–O5** (neu) | **9/9 erkannt (rot)**, alle Dateien byte-identisch wiederhergestellt |
| `jobqueue-vertrag-test.js` | 113 PASS / 0 FAIL |
| `jobqueue-datenbank-test.js` | 55 PASS / 0 FAIL |
| `jobqueue-sicherheit-test.js` | 69 PASS / 0 FAIL |
| `jobqueue-bereinigung-test.js` | 38 PASS / 0 FAIL / 1 OFFEN |
| `llm-budget-fairness-test.js` | 59 PASS / 0 FAIL |
| `flagmatrix-op30-test.js` | 57 PASS / 0 FAIL |
| `source-demand-test.js` | 59 PASS / 0 FAIL |
| `v3-anbindung-test.js` | 56 PASS / 0 FAIL / 2 OFFEN |
| `relevanzordnung-mergeneutralitaet-test.js` | 26 PASS / 0 FAIL |
| `skalierung-simulation-test.js` | 64 PASS / 0 FAIL / 3 OFFEN (unverändert nach dem Umzug des Harness) |
| `skalierung-1000-test.js` | 69 PASS / 0 FAIL / 2 OFFEN |
| Migrationskette anwenden → wiederholen → Rollback → wiederholen → erneut anwenden | **27 Schritte fehlerfrei** |

### Vorbehalt an den Testzahlen (Befund O21 des Abschlussreviews, weiterhin offen)

Der kanonische Runner zählt eine **übersprungene** Datenbank-Suite als `PASS`. Ein CI-Grün
schließt den Datenbankteil deshalb **nicht** ein. Er ist ausschließlich durch die Läufe in
diesem Beleg gedeckt. Das gilt jetzt zusätzlich für die neue Suite
`jobqueue-wiedervorlage-datenbank-test.js`.

### Mutationsprobe im Einzelnen

Jede Korrektur einzeln zurückgedreht, der zugehörige Nachweis **muss** rot werden:

| Zurückgedreht | Ergebnis |
|---|---|
| Rotation zurück auf den tagesunabhängigen Streuwert | **rot** (1.2, 1.3) |
| `scopeMax` wieder hart auf `null` | **rot** (1.6, 1.6b) |
| Mandatsreserve zurück auf den festen Anteil | **rot** (1.6, 1.8, 1.8b) |
| Workerbetrieb wieder umgehen | **rot** (2.1b, 2.1c) |
| Aufrufergrenzen wieder ignorieren | **rot** (2.2, 2.2b) |
| Vorbedingung wieder nur mit einem Fenster | **rot** (3.2) |
| Obergrenze des Budgetwartens entfernen | **rot** (4.2, 4.2b, 4.2c) |
| Blockierte Aufträge nicht mehr melden | **rot** (5.3b) |
| Wiedervorlage ohne Obergrenze | **rot** (5.2b) |

**Keine der neuen Prüfungen ist trivial grün.**

---

## 7 · Entscheidungsfrage an den Gründer

**E1 — Gehört das Lage-Narrativ in die Warteschlange?**

Der einzige mandatsbezogene KI-Verbraucher (`lage.generateLageBriefing`, ein Aufruf je aktivem
Mandat und Berliner Tag) läuft heute im Cron `lage-briefing` um 05:45Z — **außerhalb** der
Warteschlange, in **einem** Slot mit `maxDuration 300`.

- **Heute (5 Mandate):** unproblematisch.
- **Bei 200 Mandaten:** 200 KI-Aufrufe in einem 300-Sekunden-Slot. Das ist eine
  Kapazitätsgrenze **unabhängig** von der Warteschlange, und sie wird von keinem der Nachweise
  dieses Sprints berührt.
- **Folge für O1:** `mandantenDeckel` ist verdrahtet und geprüft, hat aber im
  Warteschlangenpfad keinen Verbraucher, solange das Narrativ außerhalb bleibt.

Ein fünfter Auftragstyp (`tenant_narrative`) wäre die natürliche Lösung und passt in die
bestehende Architektur — er ist aber eine **Architekturerweiterung** und deshalb hier
**nicht** umgesetzt. **Die Entscheidung liegt beim Gründer.** Bis dahin bleibt die
Aktivierungsempfehlung auf die Stufen begrenzt, bei denen der Narrativ-Cron trägt.

---

## 8 · Sicherer Aktivierungsplan

**Nichts davon ist Teil dieses Sprints.** Jede Stufe ist eine eigene Betreiberentscheidung.

| Stufe | Voraussetzung | Erwartete Laufzeit / Kosten (berechnet) | Rückfallbedingung |
|---|---|---|---|
| **0 · Migration** | Rollback bereitliegen | Minuten, 0 USD | Bei jedem Fehler: Rollback-SQL in umgekehrter Reihenfolge (**fünf** Paare, `20260809` zuerst) |
| **1 · Deckel ablesen** | rein lesend | Minuten, 0 USD | — |
| **2 · `HELMUT_SCALABLE_PIPELINE=on`, 5 Mandate** | Migration angewendet | wie heute, ~0,2 USD/Tag | Rückstand > 24 h **oder** `zustand: kritisch` **oder** ein Briefing fällt aus ⇒ Flag `off` + Redeploy |
| **3 · 25 Mandate** | 20 echte Profile importiert (deaktiviert) und einzeln aktiviert | ~0,85 USD/Tag | wie Stufe 2, zusätzlich: `dauerhaft-blockiert > 0` |
| **4 · 50 Mandate** | 45 Profile | ~1,32 USD/Tag | wie Stufe 3 |
| **5 · 100 Mandate** | 95 Profile · Entscheidung E1 getroffen | ~1,68 USD/Tag | wie Stufe 3, zusätzlich: Narrativ-Cron überschreitet 240 s |
| **6 · 200 Mandate** | 195 Profile · E1 umgesetzt · Deckel ≥ 1 645/Tag | ~2,12 USD/Tag | wie Stufe 5 |
| **je nach Bedarf** | `HELMUT_LLM_FAIRNESS=on` | — | Ablehnungen steigen ⇒ `off` |
| **eigenes Fenster** | `HELMUT_RELEVANZORDNUNG=on` | — | Lage wird unbrauchbar ⇒ `off` |

**Nach jeder Aktivierungsstufe ist OP-25 vollständig zu wiederholen** — die Aktivierung
verändert `quellenVereinigung`, die K2.1-Sichtbarkeitsmengen und die Laufzeitbilanz.

---

## 9 · Was dieser Sprint **nicht** beweist

- **Keine Aussage über Production.** Kein Lauf, kein Deployment, kein Environment-Zugriff, keine
  angewendete Migration.
- **Eine lokale Simulation ist kein Production-Beweis für 200 Mandate.** Synthetische Profile,
  Attrappen für Netz und KI, virtuelle Uhr. **Es gibt 10 echte Profile, nicht 200.**
- **Die Preisbasis ist ein Schätzwert im Code**, kein Anbieterpreis.
- **Der wirksame Tagesdeckel in Production ist offline nicht lesbar.**
- **Der erste Cron-Lauf auf `559a3d9` hat noch nicht stattgefunden** (§1).
- **Die Migration `20260809` ist nicht angewendet.** Ihr Nachweis steht in
  `jobqueue-wiedervorlage-datenbank-test.js` gegen eine lokale Datenbank.
