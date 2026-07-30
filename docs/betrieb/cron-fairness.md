# Faire Mandantenreihenfolge der Mehrmandanten-Crons (OP-25)

**Stand:** 2026-07-30 · **Kanonisch für:** Reihenfolge, Fairnessgarantie, Beobachtbarkeit und
Wiederaufnahme in `runCronForTenants` · **Code:** [`lib/helmut/cron-fairness.js`](../../lib/helmut/cron-fairness.js),
`server.js` (`runCronForTenants`), `lib/helmut/storage.js` (`readCronFairnessState` /
`saveCronFairnessState` / `deleteCronFairnessTenant`) · **Tests:** `scripts/cron-fairness-test.js`

> **Nummerierung:** Der Sprintauftrag nennt diesen Punkt „Roadmap Punkt 25". Gemeint ist
> **OP-25** aus [`../datenmotor-restliste.md`](../datenmotor-restliste.md). Zeile 25 der
> [`../roadmap/phase_1_checkliste.md`](../roadmap/phase_1_checkliste.md) ist ein **anderer**
> Punkt (Ende-zu-Ende-Test für den Pilotmandanten) und bleibt von diesem Sprint unberührt.

---

## 1 · Der Fehler

`runCronForTenants` verarbeitete die aktiven Mandate **seriell** in der Reihenfolge von
`tenant-context.listActiveTenantIds` — und die endet auf `ids.sort()`, also **alphabetisch**.
Dagegen stand ein **hartes Zeitbudget** (270 000 ms für Crawl/Pipeline, 240 000 ms für
Briefing/Lage-Check). Wer hinten stand, fiel bei knapper Laufzeit aus — und zwar **immer
dasselbe Mandat**, Lauf für Lauf, ohne dass sich daran je etwas ändern konnte.

Belegt (nicht hergeleitet):

| Datum | Beleg | Wirkung |
|---|---|---|
| 2026-07-24 | [`incident_2026-07-25_crawl_mandantenamplifikation.md`](incident_2026-07-25_crawl_mandantenamplifikation.md) §33/§119 | **Vier von sechs** aktiven Mandaten wurden über Tage **nie** gecrawlt; Ursache: internes Mandanten-Zeitbudget (damals 240 s) |
| 2026-07-28 04:00 / 20:00, 2026-07-29 04:00 | Protokollzeile `[cron/crawl] 280001ms tenants=undefined bounded=true` | Lauf reproduzierbar am Zeitlimit; zwei Messungen **vor** `HELMUT_MATCHING_AUDIT` → Bestandsverhalten, kein Flag-Effekt |
| 2026-07-29 16:00 | Befund **B5** ([`../datenmotor-restliste.md`](../datenmotor-restliste.md) §135) | Der `pipeline`-Cron erreichte die Matching-Stufe bei **genau einem** von sieben Mandaten |

Der Lauf meldete dabei jedes Mal `ok:true`. Seit dem Incident 2026-07-25 erzeugt ein
abgeschnittenes Mandat zwar einen `systemError` — aber niemand konnte daraus lesen, **welche**
Mandate es traf und dass es **immer dieselben** waren.

**Stand nach PR #178 (`51732e2`) gegengeprüft:** der Fehler bestand unverändert.
`listActiveTenantIds` endete auf `ids.sort()`, `runCronForTenants` lief `for (const tenantId of
tenantIds)` gegen `Date.now() > deadline`, und **kein** persistenter Fortschritt je Mandat
existierte. Der Befund des Auftrags war also korrekt — mit einer Präzisierung: „4 von 6" ist der
Messwert vom 2026-07-24; am 2026-07-29 waren es **6 von 7**.

## 2 · Die Lösung

Die Reihenfolge kommt jetzt aus `cron-fairness.planTenantOrder`:

1. Mandate mit einem **aktiven** (`laufend`, nicht veralteten) Versuch werden **nicht geplant**.
2. Mandate **ohne jeden Versuch** stehen vorn.
3. Danach: **ältester letzter Versuch** zuerst.
4. Gleichstand: **Losentscheid** je 6-Stunden-Fenster (`sha256(cron|fenster|mandat)`).
5. Verbleibender Gleichstand: die Kennung — **nur** damit die Ausgabe reproduzierbar ist.

Entscheidend ist Regel 3: sortiert wird nach dem letzten **Versuch**, nicht nach dem letzten
**Erfolg**. Nach dem Erfolg zu sortieren würde ein dauerhaft scheiterndes oder hängendes Mandat
für immer nach vorn holen und alle anderen verdrängen — derselbe Fehler mit umgekehrtem
Vorzeichen.

Der Versuch wird **vor** der Verarbeitung persistiert, der Abschluss danach:

```
Restzeit prüfen  →  Versuch registrieren (persistent)  →  perTenant(mandat)  →  Abschluss schreiben
```

Nicht begonnene Mandate erhalten **keinen** Versuchsvermerk und stehen deshalb im nächsten Lauf
weiterhin vorn.

## 3 · Wo der Zustand liegt — und warum ohne Migration

Eine **eigene Zeile** im bereits existierenden `helmut_store`: `<storeId>-cron-fairness`
(lokal: `.helmut-data/cron-fairness.json`).

- **Keine neue Tabelle, keine Migration, kein Freigabegate.** Der Fix wirkt mit dem Deployment.
- **Keine RLS-Änderung.** Die Policy auf `helmut_store` matcht ausschließlich das Präfix
  `main-p-` ([`20260712_tenant_rls_policies.sql`](../../supabase/migrations/20260712_tenant_rls_policies.sql) §146 ff.);
  jede andere Zeile ist für `anon`/`authenticated` implizit gesperrt. Zugriff nur `service_role`,
  wie bei jedem Backend-Pfad.
- **Kein Last-Write-Wins-Wettlauf.** Genau **ein** Schreiber (dieser Pfad), ~4 KB statt der
  1,24 MB des Monolith-Blobs. Der Befund **W-2** (jeder Auth-Store-Writer ersetzt die komplette
  `data`-Spalte und verliert parallele Einträge lautlos) greift hier nicht.
- **Monotone Verschmelzung.** `saveCronFairnessState` liest unmittelbar vor dem Schreiben und
  verschmilzt: Zeitstempel und Zähler können nie zurückfallen, ein Abschluss derselben
  Laufkennung führt immer. Ein verspäteter älterer Stand kann einen jüngeren nicht überschreiben.
- **Drei Schranken gegen Datenverlust** (jede einzeln getestet, §19b/§19c der Suite):
  1. **Lesefehler → kein Schreibvorgang.** Der Patch trägt nur *ein* Mandat; auf einen leeren
     Lesestand geschrieben würde er die Einträge **aller anderen** Mandate löschen. Ein
     verlorener Versuchsvermerk ist harmlos (das Mandat bleibt vorn), ein gelöschter Zustand
     nimmt der Rotation ihr Gedächtnis. Gemessen: 0 Schreibvorgänge, Bestand unverändert.
  2. **Neuere Schemaversion in der Zeile → kein Schreibvorgang.** Während eines Rollouts können
     zwei Codestände laufen; der ältere kennt die zusätzlichen Felder nicht und darf den neueren
     nicht plattmachen (`zustand-neuere-version`). Genau dafür ist das Feld `version` da — es ist
     keine Dekoration, sondern wird beim Schreiben ausgewertet.
  3. **Versuchsvermerk wird gegengelesen.** Nach dem Schreiben eines *Claims* wird zurückgelesen;
     fehlt der eigene Eintrag, hat ein überlappender Lauf ihn überschrieben → begrenzte
     Wiederholung (Default 3) statt stillem Verlust; danach ehrlich `ok: false` mit
     `konflikt: true`. Gewinnt dabei ein **neuerer fremder** Versuch, ist nichts verloren — dann
     hat der andere Lauf das Mandat, und dieser Lauf lässt es aus. Beim **Abschluss** entfällt
     die Gegenprüfung bewusst (ein verlorener Abschluss lässt den Eintrag `laufend`, und der
     läuft nach der Frist kontrolliert ab): genau ein Lesen und ein Schreiben, damit die
     Buchführung das Zeitbudget nicht auffrisst.
- **Ein korrupter Eintrag blockiert niemanden.** Nicht-Objekte, unbekannte Statuswörter,
  unlesbare Datumsangaben, negative Zähler und fremde Felder werden beim Lesen verworfen bzw.
  gesäubert (Weißliste); das betroffene Mandat gilt dann als „ohne Versuch" und wird als
  erstes verarbeitet — es heilt sich also selbst. Alle übrigen Mandate bleiben planbar.
- **DSGVO:** ausschließlich pseudonyme Mandatskennung, Zeitstempel, Zähler, Statuswort. Keine
  Inhalte, keine Roh-Fehlertexte, keine PII. `deleteProfileData` und `deleteTenantScopedData`
  entfernen die Spur eines Mandats mit; Einträge ohne Versuch seit 90 Tagen fallen automatisch weg
  (rein zeitbasiert — **nie** anhand der aktiven Mandantenliste, damit ein vorübergehend
  deaktiviertes Mandat seinen Verlauf behält).

## 3a · Beweis: zwei Läufe verarbeiten dasselbe Mandat nicht gleichzeitig

Die Frage ist nicht theoretisch: der GitHub-Actions-Watchdog
(`.github/workflows/briefing-watchdog.yml`, `schedule: 30 5 * * *` **und** `workflow_dispatch`)
ruft `/api/cron/pipeline` auf — also einen **zweiten, außerplanmäßigen** Durchlauf derselben
Mandantenschleife (`scripts/watchdog-pipeline-check.js`, Zeile 127).

**Erste Schranke — die eigentliche Sperre (unverändert, nicht von diesem Sprint):**

| Frage | Antwort | Belegstelle |
|---|---|---|
| Wo erworben? | Als **erste** Anweisung in `runSourceCrawl`, vor jeder Arbeit am Mandat | `lib/helmut/scheduler.js:223-224` |
| Reichweite? | **Mandatsscharf**: `crawl-<mandat>`. Deckt den gesamten Lauf eines Mandats ab (Crawl → Understanding → Matching) und gilt für den `crawl`- und den `pipeline`-Cron ebenso wie für den internen Crawl des `lage-check` | `scheduler.js:223`, `scheduler.js:629` |
| Gültigkeit? | **15 Minuten** — länger als das Funktionslimit (300 s), kürzer als der Abstand der regulären Läufe (≥ 45 min) | `scheduler.js:224` |
| Bei Verweigerung? | Der zweite Lauf verarbeitet das Mandat **nicht** (`{ skipped: true, reason: "already running" }`) | `scheduler.js:225-228` |
| Bei Prozessabbruch? | Die Sperre bleibt bis zum Ablauf stehen — genau deshalb fasst ein überlappender Lauf das Mandat nicht an. Freigabe sonst im `finally` | `scheduler.js:543`, `storage.js` („TTL raeumt auf") |
| Atomar? | Ja im atomaren Modus: **ein** `INSERT … ON CONFLICT … WHERE` (`helmut_acquire_pipeline_lock`), Postgres serialisiert konkurrierende Upserts über den Row-Lock; bei DB-Fehler **fail-closed**. Freigabe ist token-gebunden | `20260719_pipeline_lock_atomic.sql`, `storage.js:acquirePipelineLockAtomic` |

**Ist der atomare Modus in Production aktiv?** Zwei Projektdokumente widersprachen sich hier.
Rein lesend in Production gegengeprüft (2026-07-30, keine Schreibzugriffe):

- `helmut_acquire_pipeline_lock` **existiert** (1), `helmut_release_pipeline_lock` **existiert** (1),
  `pipeline_locks.token` **existiert** (1) → **Migration `20260719` ist angewendet.**
- `public.pipeline_locks` trägt Zeilen **mit Token** — u. a. `crawl-<mandat>`, gesperrt
  **2026-07-30 04:05:04 UTC**, Ablauf 04:20:04. Einen Token schreibt **ausschließlich** die
  atomare RPC; der Blob-Pfad legt seine Sperren im Auth-Blob ab und berührt `pipeline_locks`
  nie → **`HELMUT_ATOMIC_LOCK` ist in Production AN und wird vom regulären Cron benutzt.**
- Die Angabe „Migration NICHT auf Prod angewendet / Default fail-open" in
  [`env-inventar.md`](env-inventar.md) war damit **veraltet und falsch**; sie ist korrigiert.
  Richtig war `datenmotor-restliste.md` FT2-2 („live seit 2026-07-16, production-bewiesen").

**Ergebnis:** für `crawl`, `pipeline` und `lage-check` ist die gleichzeitige Verarbeitung
desselben Mandats **zuverlässig ausgeschlossen** — atomar und fail-closed, in Production
nachweislich aktiv. Ein **atomarer Mandatsclaim in der Fairnessschicht ist deshalb nicht
erforderlich**; er würde eine bereits vorhandene, bewiesene Sperre verdoppeln. Keine Queue,
keine Parallelisierung, keine Architekturänderung.

**Zweite Schranke — die Fairnessschicht (neu, ergänzend):** vor der Sperre steht jetzt der
`laufend`-Vermerk. Er verhindert, dass ein überlappender Lauf ein Mandat überhaupt beginnt, und
er macht den Fall sichtbar (`laeuft-bereits`). Zusätzlich wird der Versuchsvermerk nach dem
Schreiben **gegengelesen**: gewinnt dort eine fremde Laufkennung, lässt dieser Lauf das Mandat
aus (`cron-fairness.fremderHalter`). Das ist eine unabhängige zweite Schranke, **kein Ersatz**
für die Sperre — sie ist ein Read-modify-write und für sich allein nicht atomar.

**Nebenbefund, ehrlich benannt:** der Lauf vom **2026-07-30, 04:05:04 UTC** hat seine Sperre
`crawl-<mandat>` **nie freigegeben** — der Prozess wurde am Zeitlimit beendet, während er das
**zweite** Mandat der alphabetischen Reihenfolge bearbeitete. Das ist derselbe Mandant und
dasselbe Muster wie am 29.07. (Befund B5) und damit ein **frischer, unabhängiger Beleg, dass
OP-25 zum Zeitpunkt dieses Sprints in Production weiterhin auftrat**.

## 4 · Die Fairnessgarantie

> Werden je regulärem Lauf mindestens **k ≥ 1** Mandate **begonnen**, dann wird bei **n**
> planbaren Mandaten jedes Mandat spätestens im **ceil(n / k)**-ten Lauf begonnen.
>
> Für Läufe mit **k = 0** gilt sie **nicht** — siehe unten.

**Warum:** begonnene Mandate erhalten einen frischen Versuchszeitpunkt und stehen damit strikt
hinter jedem nicht begonnenen Mandat. Die je Lauf begonnenen `k` Mandate waren die `k` mit dem
ältesten Versuch; ein nicht begonnenes Mandat stand also hinter ihnen und rückt um genau `k`
Plätze vor. Von Rang `n-1` erreicht es die vorderen `k` Plätze nach höchstens `ceil(n/k)` Läufen.
Für Mandate ohne jeden Versuch gilt dasselbe: die Gruppe schrumpft je Lauf um `k`, unabhängig
davon, wie der Losentscheid innerhalb der Gruppe ausfällt.

Deterministisch getestet für `n = 1…9` und `k = 1…4` (`scripts/cron-fairness-test.js` §14) und
mit vier Mutationen gegengeprüft (§19).

**Die Garantie hängt an `k >= 1` — und nur daran.** Sie ist eine Aussage über *Läufe, die
mindestens ein Mandat beginnen konnten*. Ein Lauf mit `k = 0` bewegt nichts und trägt **keine**
Fortschrittsgarantie; die Formel behauptet das auch nicht (`fairnessBound(n, 0) = Infinity`).

**Was bei `k = 0` passiert (Auslöser: die Restlaufzeit reicht nicht einmal für die Reserve —
etwa wenn das Laden der Mandantenliste in Blob-Timeouts lief):**

1. **Nachvollziehbar im Code:** die Restzeitprüfung steht **vor** dem Beginn jedes Mandats
   (`cron-fairness.js`, `if (now() + reserveMs > deadline)`); `fairnessBound` liefert
   ausdrücklich `Infinity`, und `runTenantsFairly` setzt `ohneFortschritt = planbar > 0 && k === 0`.
2. **Beobachtbar:** die Protokollzeile trägt `kapazitaet=0` und `obergrenzeLaeufe=keine-garantie`;
   der Antwortkörper trägt `kapazitaet: 0`, `fortschrittsgarantie: false`, `ohneFortschritt: true`
   und `obergrenzeLaeufe: null` (**nicht** `Infinity` — das würde in JSON zu `null` werden und wäre
   dort nicht von „unbekannt" zu unterscheiden); der `systemError` benennt den Fall wörtlich:
   *„KEIN Mandat begonnen (0 von n) — Lauf ohne Fortschritt, für diesen Lauf gilt KEINE
   Fairnessgarantie."*
3. **Kein Schaden an der Rotation:** ein `k = 0`-Lauf schreibt **nichts** — die Warteschlange
   bleibt unverändert, und der nächste Lauf mit Kapazität beginnt genau dort, wo dieser
   beginnen wollte.
4. **Deterministisch getestet:** `scripts/cron-fairness-test.js` §12b (acht Prüfungen, u. a.
   0 Schreibvorgänge, unveränderter Zustand, Nachholen im Folgelauf) plus eine Mutationsprobe,
   die eine erfundene Garantie bei `k = 0` rot werden lässt.
5. **Abgrenzung:** **0 aktive Mandate** sind *kein* `ohneFortschritt` — nichts zu tun ist kein
   Rückstand (`obergrenzeLaeufe: 0`).

**Weitere Grenzen der Garantie — ehrlich benannt:**

| Fall | Wirkung |
|---|---|
| `k = 0` (kein Mandat wird begonnen, weil schon der erste die Restzeit reißt) | **keine** Garantie für diesen Lauf — siehe oben. Der Zustand bleibt unberührt, der nächste Lauf holt nach. |
| Ein Mandat bleibt als `laufend` zurück (Prozessabbruch) | Es gilt bis `HELMUT_CRON_FAIRNESS_STALE_MS` (Default 30 min) als versucht und ist nicht planbar; die Garantie gilt für die verbleibenden Mandate. Der Verzug ist auf diese Frist begrenzt. |
| Der Fairnesszustand ist nicht lesbar/schreibbar | Der Lauf läuft weiter (fail-safe), aber **ohne** Garantie: die Reihenfolge fällt auf den Losentscheid zurück. Das erzeugt einen eigenen `systemError`, eine Fehlerzeile im Protokoll (`zustand=gestoert`) und das Feld `fairnessGestoert: true` in der Antwort. `ok` bleibt bewusst `true` — es ist die Aussage über die **Verarbeitung**, und sie auf `false` zu setzen würde einen erfolgreichen Crawl als Ausfall melden und den Watchdog fehlalarmieren. Sauber sieht der Lauf damit nicht aus. |
| `HELMUT_CRON_FAIRNESS=off` | Rückweg auf das alte, alphabetische Verhalten. Bewusst ohne Garantie. |

## 5 · Verhalten in den Randfällen

| Fall | Verhalten |
|---|---|
| **Deadline erreicht** | Vor jedem weiteren Mandat wird `Restzeit ≥ HELMUT_CRON_TENANT_RESERVE_MS` (Default 15 000 ms) geprüft. Reicht sie nicht, wird das Mandat **nicht begonnen** und **nicht** als versucht vermerkt. Kein Budget wurde angehoben oder gesenkt. |
| **Einzelnes Mandat scheitert** | Fehler bleibt isoliert (nur dieses Mandat), der Versuch zählt, Status/Fehlerzeitpunkt/Fehlerserie werden getrennt dokumentiert. Es blockiert niemanden — es rutscht wie jedes verarbeitete Mandat nach hinten. |
| **Mandat scheitert dauerhaft** | Wird weiter versucht (kein stilles Ausschließen), verdrängt aber niemanden. `fehlerSerie` macht die Dauerstörung sichtbar. |
| **Mandat frisst das ganze Budget** | Es wird registriert, verbraucht seinen Lauf und steht danach hinten. Die übrigen Mandate kommen in den Folgeläufen dran. |
| **Prozessabbruch nach Registrierung** | Mandat bleibt `laufend`, wird nach der Frist kontrolliert erneut zugelassen und zählt bis dahin als versucht. |
| **Prozessabbruch nach einem fertigen Mandat** | Der Abschluss ist persistiert; der nächste Lauf setzt an der **Mandatsgrenze** fort, nicht von vorn. |
| **Überlappende Läufe** | Ein als `laufend` vermerktes Mandat wird vom zweiten Lauf nicht begonnen, sondern als `laeuft-bereits` ausgewiesen; verliert er den Wettlauf erst beim Registrieren, erkennt er den fremden Halter und lässt das Mandat aus. Der **harte** Riegel bleibt der bestehende Lock `crawl-<mandat>` — atomar, fail-closed und in Production nachweislich aktiv (§3a). |
| **Neues Mandat** | Kein Versuch = ältester Versuch → **Rang 1** im ersten Lauf danach. |
| **Deaktiviertes Mandat** | Steht nicht in der aktiven Liste → wird nicht geplant. Sein Verlauf bleibt erhalten. |
| **Reaktiviertes Mandat** | Kommt mit dem ältesten Versuch zurück → steht vorn. |
| **Ein einzelnes Mandat** | Unverändert: ein Lauf, ein Versuch, dieselbe Ergebnisform (`politicianId` + Nutzlast bzw. `failed`/`error`). |

## 6 · Beobachtbarkeit

Jeder Lauf schreibt **eine** Protokollzeile — kein neuer Admin-Bereich, keine neue Tabelle:

```
[cron/crawl/fairness] geplant=a,b,c,d,e,f begonnen=c,d erfolgreich=1 fehlgeschlagen=1
                      zeitbudget=e,f laeuftBereits=- naechstes=e kapazitaet=2
                      obergrenzeLaeufe=3 zustand=ok
```

Bei einem Lauf ohne Kapazität steht dort `kapazitaet=0 obergrenzeLaeufe=keine-garantie`.

Dieselben Angaben liegen im Antwortkörper des Crons unter `fairness` (`aktive`, `geplant`,
`begonnen`, `erfolgreich`, `fehlgeschlagen`, `zeitbudget`, `laeuftBereits`, `wartend[]` mit
`letzterVersuchAt` / `letzterErfolgAt` / `wartetMs` / `fehlerSerie`, `naechstesMandat`,
`kapazitaet`, `fortschrittsgarantie`, `ohneFortschritt`, `obergrenzeLaeufe`, `zustandGeladen`) —
plus die beiden Kurzflaggen `fairnessGestoert` und `ohneFortschritt` auf oberster Ebene.

Zwei Meldewege bleiben laut, statt still zu bleiben:

- **Zeitbudget erschöpft** → `systemError` mit den **Kennungen** der nicht verarbeiteten Mandate
  und dem voraussichtlich nächsten Mandat (vorher nur eine Anzahl).
- **Fairnesszustand nicht nutzbar** → eigener `systemError`: „Reihenfolge ohne Verlaufswissen,
  keine Fairnessgarantie."

Damit kann ein global grüner Lauf nicht mehr verbergen, dass einzelne Mandate wiederholt nicht
verarbeitet wurden.

## 7 · Verworfene Alternativen

| Alternative | Warum nicht |
|---|---|
| **Neue Tabelle `cron_tenant_schedule` + atomare Claim-Funktion** | Fachlich die sauberste Lösung, aber **freigabepflichtig**: die Migration darf in diesem Sprint nicht angewendet werden. Der Fix wäre bis zur Freigabe wirkungslos geblieben. Eine eigene `helmut_store`-Zeile liefert dieselbe Persistenz sofort. Bleibt als Ausbaupfad, falls echte Atomizität nötig wird. |
| **Fairnesszustand in den Auth-/Main-Blob** | Last-Write-Wins (Befund W-2) verliert Einträge lautlos, und jeder Schreibvorgang würde 1,24 MB neu schreiben — mitten im Zeitbudget, das wir schützen wollen. |
| **`crawlRuns` (Blob, Retention 20) als Verlaufsquelle** | Enthält nur **abgeschlossene** Läufe. Ein Mandat, das hängt und abgebrochen wird, hinterlässt keine Spur, bliebe vorn und würde alle anderen weiter verdrängen — genau der Fehler. |
| **`matching_runs` als Verlaufsquelle** | Nur die Matching-Stufe, nur bei `HELMUT_MATCHING_AUDIT=on`, und erst **am Ende** des Crawls geschrieben. Sagt nichts über begonnene Versuche. |
| **`pipeline_locks` als Verlauf missbrauchen** (Release nicht löschen, nur ablaufen lassen) | Bräuchte eine Änderung der DB-Funktion, also doch eine Migration — und würde eine Sperrtabelle zur Scheduler-Historie umdeuten. Schlechte Langzeitwartbarkeit. |
| **Zusätzliche Warteschlange** | Ausdrücklich nicht gewünscht und nicht nötig: die Reihenfolge ist eine Sortierung, kein Transportproblem. |
| **Parallelisierung der Mandate** | Nicht das Ziel, und riskant: der Crawl teilt eine Egress-IP und ein KI-Budget (Incident 2026-07-25, Google-Amplifikation). Fairness braucht keine Parallelität. |
| **Stateless Rotation über die Uhr** (`floor(now/6h) % n`) | Wäre migrationsfrei, hat aber **keine** Garantie: bei realen Cron-Kadenzen teilen Versatz und Mandatszahl gemeinsame Teiler, wodurch nur ein Teil der Positionen je erreicht wird. Der Losentscheid nutzt dieses Muster nur noch als Gleichstandsbrecher. |

## 8 · Restlücken

| # | Lücke | Bewertung |
|---|---|---|
| **R-1** | Der Cron `/api/cron/lage-briefing` hat eine **eigene** Schleife über `listProfiles()` mit eigener Deadline und ist **nicht** über `runCronForTenants` fair. | Geringes Risiko: reiner Vorwärm-Lauf, `generate-if-missing`, idempotent. Auftrag dieses Sprints war ausdrücklich `runCronForTenants`. Nachziehbar mit demselben Baustein. |
| **R-2** | `/api/cron/health-report` iteriert Mandate **ohne** Deadline. | Rein lesend, keine Verdrängung möglich — kein Fairnessproblem, deshalb bewusst unverändert. |
| **R-3** | Der `laufend`-Vermerk ist ein Read-modify-write, kein atomarer Claim. | **Kein Blocker, kein Handlungsbedarf** — der harte, atomare Riegel gegen Doppelverarbeitung ist `crawl-<mandat>` und in Production nachweislich aktiv (§3a). Der Vermerk ist die zweite, ergänzende Schranke; das Fenster für einen verlorenen Vermerk ist auf Lesen→Schreiben begrenzt, wird gegengelesen und wiederholt, und die Folge wäre ein doppelter **Versuch**, kein Datenschaden. |
| **R-5** | `/api/cron/morning-briefing` hat **keine** eigene Sperre je Mandat (kein Crawl darin). Überlappen zwei Läufe dieses Crons, ist der `laufend`-Vermerk die einzige Schranke. | **Vorbestehend, von diesem Sprint nicht verschlechtert** — vorher gab es dort *überhaupt* keine Schranke. Folge einer Überlappung: ein doppelt gebautes Briefing und ggf. ein doppelter Push, kein Datenschaden (0 KI im Briefing-Aufbau). Regulär nicht auslösbar: der Cron läuft 1×/Tag und ist auf 240 s begrenzt. Kleinste Nachbesserung, falls gewünscht: in `runCronForTenants` den bereits vorhandenen `acquirePipelineLock("cron-<cron>-<mandat>")` um jedes Mandat legen — **bewusst nicht in diesem Sprint**, weil es jedem Mandat je Lauf eine zusätzliche Sperroperation aufbürdet und der Crawl-Pfad sie doppelt hätte. |
| **R-4** | **Production-Nachweis offen.** Die Wirkung ist offline und gegen den echten Cron-Pfad (lokaler Speicher) belegt, aber noch nicht an einem regulären Production-Lauf. | Erst nach Merge/Deployment beobachtbar: erwartet werden über vier reguläre Läufe (04/10/16/20 UTC) **alle** aktiven Mandate mindestens einmal begonnen, mit `[cron/*/fairness]`-Zeilen als Beleg. Bis dahin bleibt OP-25 **teilweise abgeschlossen**. |

## 9 · Verbindliche Folgeregel: weitere Testmandate

**Weitere reale Testmandate dürfen erst angelegt/aktiviert werden, wenn der Merge erfolgt **und**
der reguläre Production-Nachweis erbracht ist** — also nachweislich alle aktiven Mandate über die
vier Läufe eines Tages mindestens einmal begonnen wurden.

Begründung, in Zahlen: die Mandate teilen **ein** Zeitbudget. Die Rotation verändert nicht, wie
viel Arbeit in einen Lauf passt, sondern nur **wen** es trifft — sie verteilt den Rückstand
gleichmäßig statt ihn immer denselben aufzubürden. Mit `n` Mandaten und `k` begonnenen je Lauf
wächst der Abstand zwischen zwei Versuchen desselben Mandats auf `ceil(n/k)` Läufe: bei sechs
Mandaten und `k = 2` sind das 3 Läufe (< 1 Tag), bei elf Mandaten schon 6 Läufe (1,5 Tage).
Vor dem Nachweis ist `k` in Production **unbekannt** — heute wird sogar ein Lauf beobachtet, der
beim zweiten Mandat am Zeitlimit endete (§3a). Neue Mandate vor dem Nachweis würden also einen
unvermessenen Rückstand vergrößern und den Nachweis selbst verfälschen.

Nach dem Nachweis liefert die Protokollzeile `kapazitaet=` genau die Zahl, mit der sich die
Obergrenze für jede geplante Mandatszahl vorher ausrechnen lässt.
