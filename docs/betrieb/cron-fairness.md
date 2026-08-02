# Faire Mandantenreihenfolge der Mehrmandanten-Crons (OP-25)

**Stand:** 2026-08-02 (§13 neu: **Befund F-CAS** — die Fairnesszeile verlor Abschlüsse an
überlappende Crons; bedingtes Schreiben + Gegenprobe. **§11.8 (R-6-Nachweis) ist damit
GESCHEITERT und muss nach dem Merge neu laufen** — siehe §13.6) · zuvor 2026-07-31 (§11:
R-6 im Code behoben; §10 regulärer Production-Nachweis — **teilweise bestanden**, Fairness
korrekt, Kapazität unzureichend) · **Kanonisch für:** Reihenfolge, Fairnessgarantie,
Beobachtbarkeit, **Laufprotokoll/Telemetrievertrag**, **Persistenzvertrag der Zeile** und
Wiederaufnahme in `runCronForTenants` · **Code:** [`lib/helmut/cron-fairness.js`](../../lib/helmut/cron-fairness.js),
`server.js` (`runCronForTenants`, `markiereAeusseresCronTimeout`), `lib/helmut/storage.js`
(`readCronFairnessState` / `saveCronFairnessState` / `deleteCronFairnessTenant`) ·
**Tests:** `scripts/cron-fairness-test.js`, `scripts/cron-fairness-persistenz-test.js`

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
(lokal: `.helmut-data/cron-fairness.json`). Sie trägt zwei getrennte Bereiche:
`crons[<cron>][<mandat>]` = **Buchführung je Mandat** (bewegt die Rotation) und seit
2026-07-31 `laeufe[<cron>]` = **Laufdatensatz** (reine Beobachtbarkeit, bewegt nichts, §11).

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

**Zweite Schranke — die Fairnessschicht (ergänzend):** vor der Sperre steht der
`laufend`-Vermerk. Er verhindert, dass ein überlappender Lauf ein Mandat überhaupt beginnt, und
er macht den Fall sichtbar (`laeuft-bereits`). Zusätzlich wird der Versuchsvermerk nach dem
Schreiben **gegengelesen**: gewinnt dort eine fremde Laufkennung, lässt dieser Lauf das Mandat
aus (`cron-fairness.fremderHalter`). Das ist eine unabhängige zweite Schranke, **kein Ersatz**
für die Sperre — sie ist ein Read-modify-write und für sich allein nicht atomar.

### 3a.1 · Die Reihenfolge Vermerk → Sperre, und was sie bedeutet

Der Fairnessvermerk entsteht **vor** der Verarbeitung, die Sperre `crawl-<mandat>` erst **in**
`runSourceCrawl`. Zwischen beiden liegt ein Fenster, und die zweite Schranke schließt es **nicht
vollständig**:

- Hat Lauf A sein `laufend` geschrieben, **bevor** Lauf B geplant hat, wird B das Mandat gar
  nicht einplanen (`planTenantOrder` → `blockiert`).
- Claimt A **nachdem** B geplant hat, greift `fremderHalter` **nicht**: Bs eigener Vermerk ist
  der jüngere und führt daher die Verschmelzung. B ruft dann `perTenant` auf — und läuft dort in
  die Sperre.

**Genau dieser Pfad war bis 2026-07-30 falsch verbucht.** `runSourceCrawl` **wirft** bei
verweigerter Sperre nicht, sondern liefert `{ skipped: true, reason: "already running" }`. Die
Ausführungsschleife sah darin einen erfolgreichen Rückgabewert und schrieb einen **erfundenen
Erfolg**: Erfolgszeitpunkt gesetzt, Erfolgszähler erhöht, Fehlerserie auf 0 zurück, das Mandat in
`begonnen` und damit in der Kapazität `k` — die gemeldete Obergrenze `ceil(n/k)` war dadurch zu
optimistisch, und `fairness.erfolgreich` nannte ein Mandat, das dieser Lauf nie angefasst hat.

**Behoben.** Eine verweigerte Sperre wird jetzt erkannt (`sperreVerweigert`) und behandelt als
das, was sie ist:

| Anforderung | Verhalten |
|---|---|
| zählt nicht als begonnene Verarbeitung | `begonnen` wird zurückgenommen |
| erhöht `k` nicht | `kapazitaet = begonnen.size` → das Mandat fehlt darin |
| kein erfundener Erfolg, kein erfundener Fehler | **kein** Abschluss-Schreibvorgang: `letzterErfolgAt`/`erfolge` unverändert, `letzterFehlerAt`/`fehler`/`fehlerSerie` unverändert |
| verfälscht `ceil(n/k)` nicht | die Obergrenze wird aus der echten Kapazität gerechnet |
| verzögert andere Mandate nicht | es wurde keine Laufzeit verbraucht, und der frei gebliebene Platz wird im selben Lauf genutzt |
| nicht als normaler Versuch protokolliert | eigener Ausgang; sichtbar in `fairness.lockVerweigert` (Teilmenge von `laeuftBereits`) und in der Protokollzeile als `sperreVerweigert=…` |

**Was bewusst bleibt:** der bereits geschriebene **Versuchsvermerk** (`laufend`, aus dem Claim)
lässt sich nicht zurücknehmen — die Verschmelzung ist monoton, ein älterer Zeitstempel kann einen
jüngeren nicht überschreiben. Das ist kein Schaden, sondern nützlich: der Vermerk hält das Mandat
für **weitere** überlappende Läufe gesperrt und läuft nach `HELMUT_CRON_FAIRNESS_STALE_MS`
kontrolliert ab. Danach steht das Mandat wieder **vorn**, weil sein Versuchszeitpunkt der älteste
ist — getestet. Einzige Unschärfe: der Zähler `versuche` enthält diesen nicht ausgeführten
Versuch mit; er ist reine Telemetrie und beeinflusst die Reihenfolge nicht.

**Nur diese eine Zeichenkette** wird als Verweigerung gedeutet (`already running`, exakt so von
`runSourceCrawl` geliefert); ein Vertragstest schlägt fehl, falls sie sich ändert. Andere
`skipped`-Gründe (etwa `profil-deaktiviert`) bleiben **normale Versuche** — dort hat der Lauf das
Mandat besucht und es gab nichts zu tun.

Belege: `scripts/cron-fairness-test.js` §18b2 (15 Prüfungen, jede der sechs Anforderungen
einzeln) plus eine Mutationsprobe, die das alte Verhalten rot werden lässt.

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
3. **Kein Schaden an der Rotation:** ein `k = 0`-Lauf schreibt **nichts an der Buchführung je
   Mandat** — die Warteschlange bleibt unverändert, und der nächste Lauf mit Kapazität beginnt
   genau dort, wo dieser beginnen wollte. (Seit R-6 schreibt er sehr wohl seinen
   **Laufdatensatz**, §11 — der bewegt die Rotation nicht, macht den Leerlauf aber sichtbar,
   statt ihn spurlos zu lassen. Beides wird getrennt getestet, §12b.)
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
| **Prozessabbruch nach Registrierung** | Mandat bleibt `laufend`, wird nach der Frist kontrolliert erneut zugelassen und zählt bis dahin als versucht. Im **Laufdatensatz** (§11) steht es als `begonnen` **ohne Abschluss** — sichtbar abgebrochen, nie als Erfolg. |
| **Prozessabbruch nach einem fertigen Mandat** | Der Abschluss ist persistiert; der nächste Lauf setzt an der **Mandatsgrenze** fort, nicht von vorn. Der Laufdatensatz bleibt `laufend` und wird nach der Frist als `abgebrochen` **abgeleitet** (§11.3). |
| **Äußeres Zeitlimit (`withTimeout`, 280 s)** | `runCronForTenants` kehrt nie zurück, die Telemetriezeile entfällt — der bereits fortgeschriebene **Laufdatensatz** trägt Planung und alle bisherigen Ausgänge, der Catch vermerkt zusätzlich `aeusseresTimeoutAt` (§11). Läuft die Promise intern weiter, hebt ihr Abschluss den Zustand. |
| **Überlappende Läufe** | Ein als `laufend` vermerktes Mandat wird vom zweiten Lauf nicht begonnen, sondern als `laeuft-bereits` ausgewiesen; verliert er den Wettlauf erst beim Registrieren, erkennt er den fremden Halter und lässt das Mandat aus. Der **harte** Riegel bleibt der bestehende Lock `crawl-<mandat>` — atomar, fail-closed und in Production nachweislich aktiv (§3a). |
| **Sperre verweigert** (der andere Lauf hat das Mandat schon) | Keine Verarbeitung, kein Erfolg, kein Fehler, nicht in der Kapazität `k`, kein Abschluss-Schreibvorgang — sichtbar als `lockVerweigert` / `sperreVerweigert=…`. Der Versuchsvermerk bleibt `laufend` und läuft über die Frist ab; danach steht das Mandat wieder vorn (§3a.1). |
| **Neues Mandat** | Kein Versuch = ältester Versuch → **Rang 1** im ersten Lauf danach. |
| **Deaktiviertes Mandat** | Steht nicht in der aktiven Liste → wird nicht geplant. Sein Verlauf bleibt erhalten. |
| **Reaktiviertes Mandat** | Kommt mit dem ältesten Versuch zurück → steht vorn. |
| **Ein einzelnes Mandat** | Unverändert: ein Lauf, ein Versuch, dieselbe Ergebnisform (`politicianId` + Nutzlast bzw. `failed`/`error`). |

## 6 · Beobachtbarkeit

Jeder Lauf schreibt **eine** Protokollzeile — kein neuer Admin-Bereich, keine neue Tabelle:

```
[cron/crawl/fairness] geplant=a,b,c,d,e,f begonnen=c,d erfolgreich=1 fehlgeschlagen=1
                      zeitbudget=e,f laeuftBereits=- sperreVerweigert=- naechstes=e
                      kapazitaet=2 obergrenzeLaeufe=3 lauf=cron-crawl-20260731040100-x7k2q
                      laufzustand=teilweise zustand=ok
```

Bei einem Lauf ohne Kapazität steht dort `kapazitaet=0 obergrenzeLaeufe=keine-garantie`.

`lauf=` und `laufzustand=` verbinden die Zeile mit dem **Laufdatensatz** in der Ablage (§11).
**Diese Zeile ist seit 2026-07-31 nicht mehr die einzige vollständige Quelle** — fehlt sie
(äußeres Zeitlimit, Prozessabbruch), trägt der Laufdatensatz denselben Stand.

Dieselben Angaben liegen im Antwortkörper des Crons unter `fairness` (`aktive`, `geplant`,
`begonnen`, `erfolgreich`, `fehlgeschlagen`, `zeitbudget`, `laeuftBereits`, `wartend[]` mit
`letzterVersuchAt` / `letzterErfolgAt` / `wartetMs` / `fehlerSerie`, `lockVerweigert`,
`naechstesMandat`, `kapazitaet`, `fortschrittsgarantie`, `ohneFortschritt`, `obergrenzeLaeufe`,
`zustandGeladen`) —
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
| **R-4** | **Production-Nachweis erbracht, aber nur teilweise bestanden** (2026-07-31, §10). Die Fairnesslogik selbst arbeitet in Production nachweislich korrekt; ein **vollständiger** Zyklus gelang nur beim leichtesten Cron. | Siehe §10. Die frühere Erwartung „über vier reguläre Läufe (04/10/16/20 UTC) sind **alle** aktiven Mandate mindestens einmal begonnen" ist **fachlich falsch** und hiermit korrigiert: der Fairnesszustand ist **je Cron getrennt** (`data.crons[<cronName>]`), jeder Cron rotiert seinen **eigenen** Zyklus. Vier Läufe verschiedener Crons ergeben deshalb keinen gemeinsamen Zyklus. OP-25 bleibt **teilweise abgeschlossen**. |
| **R-6** | **Beobachtbarkeitslücke bei äußerem Timeout** (2026-07-31, §10.4). Endet `crawl`/`pipeline` im äußeren `withTimeout(…, 280000)`, kehrt `runCronForTenants` nie zurück — die `[cron/*/fairness]`-Zeile wurde **nie geschrieben**. Sichtbar blieb nur `tenants=undefined bounded=true`. Betroffen 3 von 5 gewerteten Läufen. | **BEHOBEN im Code (2026-07-31, §11), Production-Nachweis steht aus.** Der Fortschritt wird jetzt bei **jedem Mandatsübergang** persistent fortgeschrieben (Laufdatensatz in derselben `helmut_store`-Zeile), und der äußere Catch vermerkt die Tatsache des Zeitlimits. Die Telemetriezeile darf fehlen, ohne dass Wissen verloren geht. Weder Reihenfolge noch `k` noch ceil(n/k) noch ein Zeitbudget wurden verändert. |

## 9 · Verbindliche Folgeregel: weitere Testmandate

> **Nachtrag 2026-07-31 (OP-25 K1): Die Sperre bleibt unverändert bestehen.** Der
> Kapazitätsblocker aus §10.5/§10.7 ist inzwischen **im Repository adressiert** — als
> **Schattenpfad hinter einem Feature-Flag, das in Production NICHT gesetzt ist**:
> [`cron-globalphase.md`](cron-globalphase.md). Die globale Datenerfassung läuft dort einmal
> je Lauf, danach folgen nur noch die mandatsbezogenen Projektionen (≈ 1,05 s je Mandat,
> Production gemessen). **Solange das Flag aus ist, gilt jede Zahl dieses Dokuments
> unverändert** — insbesondere `k` und `ceil(n/k)`. Eine Lockerung der Sperre setzt Merge,
> Aktivierung **und** einen eigenen Production-Nachweis voraus (K2).

> **Stand 2026-07-31 (§10): Die Sperre bleibt bestehen — jetzt aus einem gemessenen Grund.**
> Der Nachweis ist erbracht, `k` ist gemessen, und das Ergebnis trägt die Aktivierung **nicht**:
> im schweren Datenpfad (`crawl`/`pipeline`) wird ein Mandat real nur alle **1,5–3 Tage**
> erfolgreich verarbeitet, im `lage-check` nur alle **6 Tage**. Bei elf Mandaten würden daraus
> 3–5,5 bzw. 11 Tage. Die Fairness funktioniert; die **Kapazität** reicht nicht.
> Details und Hochrechnung: §10.5/§10.6.

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

---

## 10 · Regulärer Production-Nachweis (2026-07-31, rein lesend)

**Ergebnis in einem Satz:** Die Fairnesslogik arbeitet in Production nachweislich korrekt —
Reihenfolge, Nachholen, ehrliche Fehlermeldung und persistenter Zustand sind belegt. **Ein
vollständiger Fairnesszyklus gelang aber nur beim leichtesten Cron** (`morning-briefing`); in
den schweren Datenpfaden reicht die Kapazität nicht. **OP-25 bleibt teilweise abgeschlossen.**

Alle Angaben stammen aus rein lesenden Zugriffen (Vercel-Deployment-Metadaten und Runtime-Logs,
`SELECT` auf `helmut_store`, `mandate_profiles`, `process_runs`, `pipeline_locks`). **Mandate
erscheinen ausschließlich pseudonymisiert** (`M-1` … `M-6`); die Zuordnung zu Klarnamen wird
bewusst nicht dokumentiert (`CLAUDE.md` §4.2).

### 10.1 · Vorprüfung

| # | Prüfpunkt | Ergebnis |
|---|---|---|
| 1 | PR #179 gemergt | ✅ Merge-Commit `30c86cf` |
| 2 | `main` enthält `9454d8e` | ✅ per `git merge-base --is-ancestor` bestätigt (Nachfix „verweigerte Mandatssperre galt als erfolgreiche Verarbeitung") |
| 3 | Deployment `READY` | ✅ `dpl_9PvfRQV4…` (Commit `30c86cf`), **READY 2026-07-30 06:27:19 UTC** |
| 4 | Deployment vor den gewerteten Läufen aktiv | ✅ alle gewerteten Läufe ab 10:00 UTC am 30.07.; die Fairnesslogik war seither in **jedem** Production-Deployment enthalten (`75d7286`, `071f91c` u. a.) |
| 5 | Arbeitsbaum sauber | ✅ |
| 6 | M8 deaktiviert | ✅ `HELMUT_MATCHING_RELEVANZ_GATE` nicht gesetzt (Default aus) |
| 7 | Berlin deaktiviert | ✅ `HELMUT_PARDOK_DISPATCH=shadow`, kein Live-Cutover |
| 8 | Brandenburg deaktiviert | ✅ wie 7 |
| 9 | Aktive Bundestagsquellen unverändert | ✅ keine Quellenänderung im Fenster |
| 10 | Budgets unverändert | ✅ keine Änderung |
| 11 | Cron-Zeiten/Frequenzen unverändert | ✅ `vercel.json` im Fenster unverändert |
| 12 | `HELMUT_CRON_FAIRNESS` nicht auf `off` | ✅ **positiv belegt**: die Protokollzeilen zeigen `zustand=ok`, und die Reihenfolge weicht nachweislich von der alphabetischen ab (§10.3) — bei `off` wäre sie exakt alphabetisch |

### 10.2 · Beobachtungsfenster und gewertete Läufe

**Fenster:** 2026-07-30 06:27:19 UTC (Deployment `READY`) → 2026-07-31 08:00 UTC.

Fairness-relevante Crons (über `runCronForTenants`): `crawl` 04:00/20:00 · `morning-briefing`
05:00 · `lage-check` 10:00 · `pipeline` 16:00 UTC.

| # | Cron | Start UTC | Commit | n | **k** | erfolgreich | Obergrenze | Telemetriezeile |
|---|---|---|---|---|---|---|---|---|
| 1 | `lage-check` | 30.07. 10:00:31 | (Deployment `dpl_B1rqpr7v…`) | 6 | **1** | 1 | 6 | ✅ vollständig |
| 2 | `pipeline` | 30.07. 16:01:01 | `75d7286` | 6 | **2** | 1 | — | ❌ fehlt (R-6) |
| 3 | `crawl` | 30.07. 20:00:30 | `75d7286` | 6 | **2** | 1 | — | ❌ fehlt (R-6) |
| 4 | `crawl` | 31.07. 04:01:04 | `071f91c` | 6 | **2** | 1 | — | ❌ fehlt (R-6) |
| 5 | `morning-briefing` | 31.07. 05:00:50 | `071f91c` | 6 | **6** | **6** | **1** | ✅ vollständig |

Für die Läufe 2–4 ist `k` aus dem **persistenten Zustand** rekonstruiert (je zwei
Versuchsvermerke mit dem Laufzeitstempel), nicht aus einer Telemetriezeile — die fehlt dort
(R-6). Das ist eine Rekonstruktion aus Primärdaten, keine Schätzung.

**Nicht gewertet:** 30.07. **07:52:56** `GET /api/cron/pipeline` — dieser Zeitpunkt entspricht
**keinem** Cron-Eintrag in `vercel.json` (`pipeline` = 16:00 UTC). Der Lauf war damit nicht
regulär und zählt nicht als Nachweis. Seine Wirkung auf den Zustand ist real und wird
ausgewiesen: er trug für `pipeline` die Versuchsvermerke von `M-1` (Erfolg) und `M-4` (ohne
Abschluss) ein.

### 10.3 · Die zentralen Nachweisfragen

| # | Frage | Antwort mit Production-Beleg |
|---|---|---|
| 1 | Alle aktiven, planbaren Mandate mindestens einmal **begonnen**? | **Nur beim `morning-briefing`.** Dort 6 von 6 in einem Lauf. `crawl` 4 von 6, `pipeline` 4 von 6, `lage-check` 1 von 6. |
| 2 | Benachteiligung nach Kennung/Alphabet? | **Nein.** Alphabetisch wäre `M-2, M-1, M-5, M-3, M-6, M-4`. Beobachtet: `lage-check` `M-1, M-2, M-5, M-6, M-3, M-4`; `morning-briefing` `M-3, M-6, M-1, M-2, M-5, M-4`. Beide weichen ab und unterscheiden sich voneinander. |
| 3 | Blieben nicht begonnene Mandate vorne? | **Ja.** `crawl` 20:00 begann mit `M-1`/`M-6`; der Folgelauf 04:00 begann mit `M-4`/`M-2` — also mit noch nicht versuchten, nicht erneut mit `M-1`. Ebenso `pipeline`: 07:52 `M-1`/`M-4`, 16:00 `M-3`/`M-5`. |
| 4 | Verweigerter Lock aus `begonnen`/`k` entfernt? | **Nicht beobachtbar** — `sperreVerweigert=-` in beiden vollständigen Telemetriezeilen; der Fall trat im Fenster **nicht auf**. Es gilt weiter nur der Offline-Beweis aus PR #179 (`9454d8e`). |
| 5 | Verweigerter Lock nur als `lockVerweigert` sichtbar? | wie 4 — nicht aufgetreten. |
| 6 | Kein erfundener Erfolg? | **Ja, belegt.** In `crawl` und `pipeline` trägt jeweils das zweite begonnene Mandat `versuche=1, erfolge=0` und **kein** `letzterErfolgAt` — obwohl der Lauf global mit HTTP 200 endete. |
| 7 | Erfolgszeitpunkt/Fehlerstatus bei verweigertem Lock unverändert? | wie 4 — nicht aufgetreten. |
| 8 | Blockierte ein fehlerhaftes Mandat andere? | **Nicht beobachtbar** — im Fenster trat **kein** Mandatsfehler auf (`fehlgeschlagen=0`, `fehlerSerie=0` bei allen). Die Isolation bleibt offline belegt. |
| 9 | Fairnesszustand über Läufe **und Deployments** erhalten? | **Ja.** Die Zeile `main-cron-fairness` trägt Einträge aus Läufen unter mindestens drei verschiedenen Commits (`75d7286`, `071f91c` und dem Stand vom 30.07. vormittags) und über 22 Stunden hinweg. |
| 10 | Trat `k = 0` auf? | **Nein.** Kleinstes beobachtetes `k` ist **1** (`lage-check`). |
| 11 | Falls ja: keine Garantie behauptet? | entfällt (10). Der Pfad bleibt offline belegt. |
| 12 | Reihenfolge = ältester letzter Versuch? | **Ja**, soweit prüfbar: beim `morning-briefing` standen die im `crawl`/`pipeline` zuletzt versuchten Mandate hinten, die länger nicht versuchten vorn. |
| 13 | `ceil(n / k)` mit den realen Läufen vereinbar? | **Ja.** `lage-check`: `k=1`, gemeldet `obergrenzeLaeufe=6` = `ceil(6/1)`. `morning-briefing`: `k=6`, gemeldet `1` = `ceil(6/6)`. Beide stimmen mit der Formel überein. |
| 14 | Stille Teilerfolge / global grüne Läufe mit ausgelassenen Mandaten? | **Nein — der Fall tritt auf, wird aber gemeldet.** Der `lage-check` endete mit HTTP 200, verarbeitete aber nur 1 von 6; die Protokollzeile `[cron/lage-check] Zeitbudget erschoepft — 5 von 6 Mandaten NICHT verarbeitet.` und ein Systemfehler machen das sichtbar. Genau das war das Ziel von OP-25. |
| 15 | Neue Runtime-/DB-/Lock-/Fairness-Fehler? | **Keine neuen.** Beobachtet: Google-News-Timeouts/`503` (Bestandsbefund OP-15), ein `OpenAI request timeout` im Understanding, das bekannte 280-s-Zeitlimit (Befund **B5**). Keine Datenbank-, Sperr- oder Fairnessfehler; `zustand=ok` in allen Telemetriezeilen. **Neu ist die Beobachtbarkeitslücke R-6** (§10.4). |

### 10.4 · Neuer Befund R-6: Telemetrieverlust bei äußerem Timeout

`/api/cron/crawl` und `/api/cron/pipeline` umschließen `runCronForTenants` mit
`withTimeout(…, 280000)`, während die **innere** Deadline bei 270 000 ms liegt. Läuft die
Verarbeitung über 280 s, greift der äußere Timeout — `runCronForTenants` kehrt **nie** zurück,
und die Zeile `[cron/*/fairness]` wird nie geschrieben. Im Protokoll bleibt nur
`[cron/crawl] 280003ms tenants=undefined bounded=true` (`tenants=undefined`, weil das
Ersatzobjekt aus dem `.catch()` kein `tenants` trägt).

**Betroffen: 3 von 5 gewerteten Läufen.** Die Buchführung selbst bleibt korrekt — der
Versuchsvermerk wird **vor** der Verarbeitung persistiert, der Erfolg getrennt danach; deshalb
ließ sich `k` aus dem Zustand rekonstruieren. Verloren geht ausschließlich die Telemetrie.
Behebbar ohne Änderung der Fairnesslogik; **eigener Sprint, hier nicht umgesetzt.**

### 10.5 · Gemessene Kapazität

| Größe | Wert (gemessen) |
|---|---|
| Aktive Mandate `n` | **6** (`mandate_profiles.aktiv = true`) |
| Minimales `k` | **1** (`lage-check`) |
| Typisches `k` im schweren Pfad | **2 begonnen, davon 1 erfolgreich** (`crawl`, `pipeline`) |
| Maximales `k` | **6** (`morning-briefing`, 13 596 ms für alle sechs ≈ 2,3 s/Mandat) |

**Reale Obergrenzen bei `n = 6`** (Läufe → Zeit, aus den gemessenen `k` und der aktiven
Cron-Frequenz):

| Cron | Frequenz | `k` | Läufe bis jedes Mandat **begonnen** | Zeit | Läufe bis **erfolgreich** | Zeit |
|---|---|---|---|---|---|---|
| `morning-briefing` | 1×/Tag | 6 | **1** | < 1 Tag | 1 | < 1 Tag |
| `crawl` | 2×/Tag | 2 | 3 | **1,5 Tage** | 6 | **3 Tage** |
| `pipeline` | 1×/Tag | 2 | 3 | **3 Tage** | 6 | **6 Tage** |
| `lage-check` | 1×/Tag | 1 | 6 | **6 Tage** | 6 | **6 Tage** |

### 10.6 · Hochrechnung auf elf Mandate (klar getrennt: Rechnung, keine Messung)

Unter der Annahme, dass `k` durch das Zeitbudget bestimmt bleibt (also **nicht** mit `n` wächst):

| Cron | `k` | Läufe bis begonnen | Zeit | Läufe bis erfolgreich | Zeit |
|---|---|---|---|---|---|
| `morning-briefing` | 11 (≈ 25 s bei 240 s Budget) | 1 | < 1 Tag | 1 | < 1 Tag |
| `crawl` | 2 | 6 | **3 Tage** | 11 | **5,5 Tage** |
| `pipeline` | 2 | 6 | **6 Tage** | 11 | **11 Tage** |
| `lage-check` | 1 | 11 | **11 Tage** | 11 | **11 Tage** |

### 10.7 · Produktbewertung und Entscheidung zu den fünf Testmandaten

**Empfehlung: die fünf weiteren realen Testmandate jetzt NICHT aktivieren.** Sie dürfen
vorbereitet, aber nicht aktiviert werden. Auch die Aktivierung **eines** weiteren Mandats wird
nicht empfohlen, solange der Kapazitätsbefund offen ist.

Begründung — die Fairness ist **nicht** das Problem, die Kapazität ist es:

1. Schon bei sechs Mandaten wird der schwere Datenpfad je Mandat nur alle **1,5 Tage begonnen**
   und alle **3 Tage erfolgreich** abgeschlossen. Für Lage, Radar und Matching heißt das:
   die Datengrundlage eines Mandats ist im Mittel **1–3 Tage alt**.
2. Das `morning-briefing` läuft zwar täglich für alle sechs — es **baut aber auf genau diesen
   Daten auf**. Ein täglich frisch erzeugtes Briefing über drei Tage alte Vorgänge ist für einen
   politischen KI-Stabschef nicht ausreichend aktuell (`START_HERE.md` §1: „Was steht heute an?").
3. Bei elf Mandaten verdoppelt sich der Abstand auf **3 bzw. 5,5 Tage** im `crawl` und auf
   **11 Tage** im `lage-check`. Das ist kein Fairness-, sondern ein **Produktproblem**.
4. **Es entsteht damit ein neuer Kapazitätsblocker, obwohl die Fairness korrekt funktioniert.**
   Er ist die direkte Fortsetzung von Befund **B5** (280-s-Zeitlimit) und gehört fachlich zu
   OP-25/OP-15/OP-21.

**Voraussetzung für eine spätere Aktivierung:** `k` im schweren Pfad muss steigen — z. B. durch
Aufteilung des Crawls in mehrere Cron-Slots, Parallelisierung je Mandat, Verkürzung der
Google-News-Timeouts (OP-15) oder eine eigene Verarbeitungsstufe außerhalb des 300-s-Fensters.
Erst danach ist die Frage „wie viele Mandate verträgt der Betrieb?" datenbasiert neu zu stellen.

---

## 11 · Telemetrievertrag bei Zeitüberschreitung (R-6, behoben 2026-07-31)

**Was dieser Abschnitt regelt:** was nach einem Mehrmandantenlauf **garantiert** in der Ablage
steht — auch dann, wenn der Lauf nie zurückkehrt. **Was er ausdrücklich nicht ändert:**
Reihenfolge, Fairnessgarantie, `k`, `ceil(n/k)`, Zeitbudgets, Cron-Zeiten, Kosten.

### 11.1 · Die Ursache, im Code belegt

| # | Belegte Ursache | Belegstelle |
|---|---|---|
| 1 | `withTimeout` ist ein `Promise.race`. Es **beendet die ursprüngliche Promise nicht** — Node kennt kein Cancel. Greift das äußere Zeitlimit, kehrt `runCronForTenants` **nie** zurück; alles danach (Telemetriezeile, `systemError`, Antwortkörper) entfällt. | `server.js` `withTimeout` |
| 2 | Die **10 s Differenz** (270 000 innen / 280 000 außen) reichen prinzipiell nicht: die innere Deadline ist ein **START**-Gatter (`if (now() + reserveMs > deadline) … continue`), kein **STOPP**-Gatter. Ein bei 269 s begonnenes Mandat darf beliebig lange weiterlaufen — `runSourceCrawl` hat sein eigenes, unabhängiges Budget. Die Überschreitung ist nach oben offen. | `cron-fairness.js` `runTenantsFairly`, Test §21.1 (gemessen: > 400 s über der Deadline) |
| 3 | Ein **`finally` allein hätte nicht gereicht.** Bei einem echten Plattformabbruch (Vercel beendet/friert die Instanz) läuft die Ereignisschleife nicht weiter: `finally`, `process.on`, Abschlusscode entfallen. Auch die Freigabe der Sperre `crawl-<mandat>` im `finally` von `runSourceCrawl` ist deshalb schon heute nicht garantiert (die TTL räumt auf). | `scheduler.js` `finally`, §3a |

Daraus folgt die Entwurfsregel: **kein Vertrag darf an Abschlusscode am Laufende hängen.**

### 11.2 · Was jetzt wann persistent geschrieben wird

Derselbe Zustand (`helmut_store`-Zeile `<storeId>-cron-fairness`) trägt zusätzlich einen
kompakten **Laufdatensatz je Cron** unter `laeufe[<cron>]`. **Keine neue Tabelle, keine
Migration, keine RLS-Änderung, kein zweites System.**

| Zeitpunkt | Was geschrieben wird | Zusätzliches IO |
|---|---|---|
| **Laufbeginn** (nach der Planung, vor dem ersten Mandat) | `laufId`, `startAt`, `aktive`, `geplant[]`, `blockiert[]` (mit Ausgang `laeuft-bereits`), `zustandGeladen`/`zustandFehler`, Status `laufend` | **1 Schreibvorgang** |
| **Vor jedem Mandat** (mit dem Versuchsvermerk) | Ausgang `begonnen` | **0** — huckepack auf den Claim |
| **Nach jedem Mandat** (mit dem Abschluss) | Ausgang `erfolgreich` / `fehlgeschlagen` | **0** — huckepack auf den Abschluss |
| **Verweigerte Sperre** | Ausgang `sperre-verweigert` — **nur** `laeufe`, der Mandatseintrag bleibt unberührt (kein erfundener Erfolg, kein erfundener Fehler, §3a.1) | 1, nur bei Überlappung |
| **Fremder Halter** | Ausgang `laeuft-bereits` | 1, nur bei Überlappung |
| **Laufende** | Status `abgeschlossen`/`teilweise`, `beendetAt`, `kapazitaet`, `obergrenzeLaeufe`, `naechstesMandat`, `zeitbudget[]` | **1 Schreibvorgang** |
| **Äußeres Zeitlimit** (Catch in der Route) | `aeusseresTimeoutAt` + Status `abgebrochen` — **nur wenn der Datensatz noch `laufend` ist** | 1, nur im Timeoutfall |

Zusatzkosten im Normalfall: **2 kleine Schreibvorgänge je Lauf** auf einer ~4-KB-Zeile
(≈ 0,04 % des Zeitbudgets). **Kein KI-Aufruf, keine Kostenwirkung, kein zusätzliches Budget.**

### 11.3 · Der Vertrag

> Nach **jedem** Mandatsübergang existiert ein persistenter Stand, aus dem sich der Ausgang
> **jedes geplanten Mandats** eindeutig einer dieser Klassen zuordnen lässt:
> `begonnen` (ohne Abschluss) · `erfolgreich` · `fehlgeschlagen` · `laeuft-bereits` ·
> `sperre-verweigert` · `zeitbudget` · **kein Ausgang = nicht begonnen**.

`cron-fairness.rekonstruiereLauf(state, cronName)` rechnet daraus die vollständige
Telemetriezeile nach — einschließlich `kapazitaet` (= Anzahl der Mandate mit Ausgang
`begonnen`/`erfolgreich`/`fehlgeschlagen`) und `obergrenzeLaeufe` (= `ceil(n/k)`).
Getestet wird beides **gegeneinander**: für einen vollständigen Lauf müssen Rekonstruktion
und gemeldete Telemetrie identisch sein (§21.2).

**Laufzustand — eindeutig ableitbar:**

| Zustand | Wann | Wie erkannt |
|---|---|---|
| `laufend` | Lauf schreibt noch fort | Status `laufend`, `standAt` jünger als `HELMUT_CRON_FAIRNESS_STALE_MS` (30 min) |
| `abgeschlossen` | jedes geplante Mandat kam zu einem Ausgang, keines fiel dem Zeitbudget zum Opfer | `beendetAt` gesetzt |
| `teilweise` | Lauf regulär beendet, aber ≥ 1 geplantes Mandat aus **Zeitmangel** nicht begonnen | `beendetAt` gesetzt + `zeitbudget[]` nicht leer |
| `abgebrochen` | äußeres Zeitlimit **oder** Prozessabbruch | entweder `aeusseresTimeoutAt` gesetzt, **oder** Status `laufend` **und** `standAt` älter als die Frist — **abgeleitet, nicht behauptet** |

**Warum ein Prozessabbruch keinen erfundenen Erfolg erzeugen kann:** ein Abschluss entsteht
**nur** durch einen Schreibvorgang. Bleibt er aus, bleibt der Datensatz `laufend` — und ein
veraltetes `laufend` **ist** die Abbruchmeldung. Es gibt keinen Pfad, auf dem Abwesenheit von
Information zu „fertig" wird.

**Warum der äußere Catch nichts erfindet:** `laufTimeoutPatch` hält **eine** Tatsache fest —
„zum Zeitpunkt X hatte der Lauf noch nicht zurückgegeben." Er behauptet nicht, dass die
Promise beendet wurde. Läuft sie intern weiter und schreibt später ihren Abschluss, **hebt
dieser den Zustand** (monotone Rangfolge `laufend < abgebrochen < teilweise/abgeschlossen`),
und `aeusseresTimeoutAt` bleibt als Tatsache daneben stehen.

### 11.4 · Warum diese Ablage — und nicht `process_runs`

| Kandidat | Bewertung |
|---|---|
| **Fairnesszeile `<storeId>-cron-fairness`** (gewählt) | Existiert, ein Schreiber, ~4 KB, monotone Verschmelzung, Versionsschranke, DSGVO-Löschung bereits verdrahtet. Der Laufdatensatz steht **neben** derselben Buchführung, die er beschreibt — **keine zweite, konkurrierende Wahrheit.** |
| `process_runs` (relational) | **Nicht nutzbar ohne Freigabe:** kanonisch nur bei `HELMUT_PROCESS_RUNS_RELATIONAL` (Default **AUS**); Flags scharfzuschalten ist freigabepflichtig (`CLAUDE.md` §5). |
| `process_runs` (Blob-Rückfallpfad) | Schreibt den **Auth-Blob** — genau der Last-Write-Wins-Pfad (Befund **W-2**) und 1,24 MB je Schreibvorgang **mitten im geschützten Zeitbudget**. Aus demselben Grund schon in §7 verworfen. |
| **Beide kombiniert** | Erzeugt zwei Quellen für dieselbe Aussage. Ausdrücklich vermieden. |
| Neue Tabelle | Migration = Freigabegate; der Fix wäre bis dahin wirkungslos. Unnötig, weil die vorhandene Ablage den Vertrag trägt. |

### 11.5 · Wachstumsgrenzen (der Zustand ist eine Notiz, kein Archiv)

- **Genau ein** Laufdatensatz je Cron — der letzte. 40 Läufe hinterlassen einen (Test §21.10).
- Höchstens `MAX_LAUF_CRONS = 12` Datensätze; die ältesten fallen weg.
- Höchstens `MAX_LAUF_MANDATE = 200` Kennungen je Datensatz.
- Datensätze, die seit `LAUF_RETENTION_MS` (14 Tage) niemand fortschreibt, fallen weg.
- Gemessen: **< 8 KB** bei 6 Mandaten und 40 Läufen.
- **DSGVO:** `withoutTenant` entfernt die Kennung eines Mandats auch aus `geplant`,
  `blockiert` und `ausgaenge`. Inhalt bleiben ausschließlich pseudonyme Kennungen,
  Zeitstempel, Zähler und Statuswörter — keine Inhalte, keine PII, keine Roh-Fehlertexte.

### 11.6 · Der Preis: eine erhöhte Schemaversion

`FAIRNESS_VERSION` steigt von **1 auf 2**. Das ist **Pflicht**, nicht Kosmetik: ein Codestand
der Version 1 kennt `laeufe` nicht und würde den Bereich beim Verschmelzen **still verwerfen**
(Weißliste in `normalizeState`) — genau dagegen wirkt Schranke 2 in `saveCronFairnessState`.

**Folge im Rolloutfenster:** läuft während des Deployments noch eine Instanz mit Version 1 und
startet dort ein Cron, **verweigert sie den Schreibvorgang** (`zustand-neuere-version-2`). Das
ist der bereits getestete Fail-safe-Pfad: der Lauf verarbeitet weiter, meldet
`fairnessGestoert: true`, schreibt einen `systemError` und `zustand=gestoert` ins Protokoll.
Die Rotation bleibt unbeschädigt (nicht begonnene Mandate bleiben vorn). **Laut und begrenzt**
ist hier bewusst besser als **still und dauerhaft** (`CLAUDE.md` §4.4).

### 11.7 · Was dieser Sprint ausdrücklich NICHT tut

Reihenfolge, Losentscheid, `k`, `ceil(n/k)`, Rotation, Zeitbudgets (270 000 / 240 000 ms),
äußere Zeitlimits (280 000 ms), Funktionslimit (300 s), Cron-Zeiten, Kostenbudgets, Quellen,
Flags, Mandatszahl — **alles unverändert.** Der **Kapazitätsblocker aus §10.5/§10.7 bleibt
vollständig offen**; dieser Sprint macht ihn nur zuverlässig **messbar**, er behebt ihn nicht.

### 11.8 · Späterer Production-Nachweis (rein lesend, nach einem Merge)

> **GESCHEITERT am 2026-08-02 — Prüfpunkt 1 und 3.** Der reguläre Lauf
> `cron-morning-briefing-20260802050021-opjp0` meldete im Log sechs Erfolge, die Zeile trug
> nur fünf; ein Mandat stand dort mit der Kennung genau dieses Laufs auf `begonnen`. Ursache
> ist **nicht** R-6, sondern ein darunterliegender Schreibfehler, den R-6 erstmals sichtbar
> gemacht hat: **§13**. Dieser Nachweis muss nach dem Merge des F-CAS-Fixes **vollständig neu**
> laufen; die untenstehende Tabelle gilt unverändert weiter und wird um §13.6 ergänzt.

**Noch nicht bestanden.** Zu beobachten sind die reguläre Kadenz aus `vercel.json` —
`crawl` 04:00/20:00 UTC · `morning-briefing` 05:00 · `lage-check` 10:00 · `pipeline` 16:00 —
über **mindestens 24 h nach einem `READY`-Deployment**, davon mindestens **ein Lauf mit
äußerem Zeitlimit** (bei `crawl`/`pipeline` derzeit der Regelfall, 3 von 5).

| # | Prüfpunkt | Quelle (rein lesend) |
|---|---|---|
| 1 | Persistenter Fortschritt stimmt mit den sichtbaren Mandatsausgängen überein | `SELECT data FROM helmut_store WHERE id='<storeId>-cron-fairness'` → `laeufe[<cron>]` gegen `crons[<cron>]` |
| 2 | Ein Lauf mit äußerem Zeitlimit bleibt vollständig rekonstruierbar | Runtime-Log `[cron/*] …ms tenants=undefined bounded=true lauf=<laufId>` → derselbe `laufId` im Laufdatensatz, mit `aeusseresTimeoutAt` und vollständigem `geplant`/`ausgaenge` |
| 3 | Kein erfundener Erfolg | kein Mandat trägt `erfolgreich`, dessen Mandatseintrag kein `letzterErfolgAt` mit dieser Laufkennung hat |
| 4 | Kein Verlust der Fairnessrotation | Reihenfolge weiterhin nicht alphabetisch; nicht begonnene Mandate rücken im Folgelauf vor; `ceil(n/k)` stimmt mit `kapazitaet` |
| 5 | Keine neuen Locks oder Laufzeitfehler | Vercel-Runtime-Logs: keine neuen DB-/Sperr-/Fairnessfehler, `zustand=ok`; `pipeline_locks` unauffällig |
| 6 | `crawl`, `pipeline`, `lage-check` liefern nachvollziehbare Zustände | je Cron genau ein Laufdatensatz mit Status `abgeschlossen`, `teilweise` oder `abgebrochen` — **nie** ein dauerhaft veraltetes `laufend` ohne ableitbaren Abbruch |
| 7 | Kein Wachstum der Zeile | Länge von `data` bleibt in derselben Größenordnung (~4–8 KB) |

**Erwartete Abweichung, die kein Fehler ist:** im ersten Lauf nach dem Deployment kann
`zustand=gestoert` / `zustand-neuere-version-2` auftreten, falls parallel noch eine
Vorgänger-Instanz einen Cron bedient (§11.6). Einmalig und auf das Rolloutfenster begrenzt.

---

## 12 · Verhältnis zu OP-25 K1 (Globalphase)

Dieses Dokument beschreibt, **wer wann drankommt** (Fairness) und **wie ein Lauf beobachtbar
bleibt** (R-6). Es beschreibt **nicht**, wie viel Arbeit in einen Lauf passt — das ist der
Kapazitätsblocker aus §10.5/§10.7.

Der Kapazitätsblocker wird in [`cron-globalphase.md`](cron-globalphase.md) adressiert:
**globale Erfassung einmal je Lauf, danach nur noch mandatsbezogene Projektionen.**

**Abgrenzung, verbindlich:**

- K1 ändert **nichts** an der Fairnesslogik. Die Mandatsphase läuft durch **dieselbe**
  `runCronForTenants` → `cron-fairness.runTenantsFairly` — Reihenfolge, Losentscheid, Sperren,
  Laufdatensatz, Fehlerisolation und `ceil(n/k)` sind unverändert. Nur die **Arbeit je Mandat**
  ist eine andere (Matching + Entscheidungen statt vollständiger Crawl).
- K1 ändert **kein** Zeitbudget. Es **teilt** das bestehende Laufbudget zwischen globaler
  Phase und Mandatsphase auf; die globale Phase erhält höchstens `HELMUT_CRAWL_GESAMTBUDGET_MS`
  und nie weniger als 50 % der Restzeit.
- K1 ist **Default AUS** (`HELMUT_CRON_GLOBALPHASE`) und in Production **nicht gesetzt**.
  **Alle Messwerte dieses Dokuments — `k`, `ceil(n/k)`, die Kapazitätszahlen aus §10.5, die
  Hochrechnung aus §10.6 und die Testmandat-Sperre aus §9 — gelten unverändert weiter.**
- Der Production-Nachweis aus §11.8 (R-6) ist **unabhängig** vom K1-Nachweis und muss zuerst
  erbracht werden: er misst den heutigen Pfad.

---

## 13 · Persistenzvertrag der Fairnesszeile (Befund F-CAS, 2026-08-02)

**Was dieser Abschnitt regelt:** unter welcher Bedingung ein Schreibvorgang auf die Zeile
`<storeId>-cron-fairness` gilt — und warum die Telemetriezeile eines Laufs erst dann etwas
behaupten darf, wenn die Ablage es trägt. **Was er nicht ändert:** Reihenfolge,
Fairnessgarantie, `k`, `ceil(n/k)`, Zeitbudgets, Cron-Zeiten, Schemaversion, Kosten.

### 13.1 · Der Befund

Realer regulärer Lauf, rein lesend belegt:

| Quelle | Aussage |
|---|---|
| Runtime-Log 2026-08-02 ~05:00 UTC, `cron-morning-briefing-20260802050021-opjp0` | geplant 6 · begonnen 6 · **erfolgreich 6** · fehlgeschlagen 0 · `kapazitaet=6` · `laufzustand=abgeschlossen` · **`zustand=ok`** |
| `helmut_store/main-cron-fairness`, `laeufe["morning-briefing"]`, derselbe Lauf | `status=abgeschlossen` · `kapazitaet=6` · **fünf** Mandate `erfolgreich` · **eines `begonnen`** |
| `crons["morning-briefing"][<dieses Mandat>]` | `status=laufend` · `versuche=3` · `erfolge=2` · `letzterVersuchAt=05:00:26.807Z` · **`letzterErfolgAt` vom Vortag** · `letzteLaufkennung` = genau dieser Lauf |

Zeitlich davor: der reguläre `crawl`-Lauf `cron-crawl-20260802040020-5rsy9` lief nach seinem
**äußeren** Zeitlimit intern weiter und schrieb **während** des Briefinglaufs; seine
Fairnessmeldung erschien ~05:00:33 UTC, der Briefinglauf lief ~05:00:21–05:00:42 UTC.

### 13.2 · Die Ursache, im Code belegt

`storage.saveCronFairnessState` war ein **Lesen → Verschmelzen → Schreiben ohne Bedingung**:
die Zeile wurde frisch gelesen, der Patch monoton hineinverschmolzen und das Ergebnis als
**ganze Zeile** zurückgeschrieben (`POST … resolution=merge-duplicates`). Zwischen Lesen und
Schreiben liegt ein Rundlauf zur Datenbank. Schreibt ein **anderer** Prozess in genau diesem
Fenster, geht dessen Schreibvorgang beim Zurückschreiben verloren — ohne Fehler, ohne Signal.

**Warum die monotone Verschmelzung nicht schützt:** `mergeState`/`mergeEntry` sind monoton
gegenüber dem **gelesenen** Stand. Gegen einen Schreibvorgang, den der Prozess **nie gesehen
hat**, können sie nichts ausrichten — er ist im Lesestand nicht enthalten.

**Warum das genau die beobachtete Signatur erzeugt:** der clobbernde Lesestand enthielt den
**Claim** des Briefinglaufs (`versuche=3`, Laufkennung, Versuchszeitpunkt 05:00:26.807), aber
nicht dessen **Abschluss**. Genau ein Schreibvorgang ging verloren.

**Warum es kein Schreibfehler war:** ein fehlgeschlagener Schreibvorgang hätte
`zustandFehler` gesetzt und die Zeile hätte `zustand=gestoert` gemeldet. Sie meldete
`zustand=ok`. Der Schreibvorgang war also erfolgreich **und wurde danach überschrieben**.

**Warum es niemandem auffiel:** `[cron/*/fairness]` entsteht aus dem, was der **Lauf** getan
hat (`verlauf`), nicht aus dem, was in der **Ablage** steht. Beide Sichten waren nie
gegeneinander geprüft.

### 13.3 · Reichweite — was betroffen ist und was nicht

| Frage | Antwort |
|---|---|
| Fachliche Verarbeitung (Briefing, Crawl, Matching, Inhalte)? | **Nein.** Die Zeile ist reine Scheduler-Buchführung. Alle sechs Mandate wurden verarbeitet. |
| Rotationsreihenfolge im beobachteten Lauf? | **Nein.** `letzterVersuchAt` ist der Anker der Rotation; der verlorene Abschluss hätte **denselben** Wert geschrieben (`finishPatch` setzt ihn auf den Claim-Zeitpunkt). |
| Rotation grundsätzlich? | **Nicht garantiert.** Ein verlorener **Claim** (statt eines Abschlusses) dreht `letzterVersuchAt` zurück und schiebt ein Mandat nach vorn; ein zurückgerollter Stand kann ein veraltetes `laufend` wieder einspielen und ein Mandat bis zu `HELMUT_CRON_FAIRNESS_STALE_MS` (30 min) **fälschlich** aus der Planung nehmen. Die Fairnessgarantie beruht auf dieser Zeile — ist die Zeile nicht verlässlich, ist die Garantie **unbelegt**, auch wenn sie im Einzelfall hielt. |
| Beobachtbarkeit? | **Ja, nachweislich.** Ein `erfolgreich=6` ohne Deckung ist genau das falsche Grün aus `CLAUDE.md` §4.4. |
| Erfundener Erfolg in der Ablage? | **Nein.** Der Verlust wirkt nur in die Richtung „echter Abschluss verschwindet". Ein Erfolg entsteht weiterhin ausschließlich durch einen Schreibvorgang. |

### 13.4 · Die Behebung

**(1) Bedingtes Schreiben (Compare-and-Set) — die eigentliche Maßnahme.** Die Zeile trägt
neben `version`, `crons` und `laeufe` einen Fortschreibungszähler `rev`. Geschrieben wird als
`PATCH … ?id=eq.<zeile>&data->>rev=eq.<gelesener Wert>`; Postgres serialisiert konkurrierende
Updates derselben Zeile über den Row-Lock und prüft die Bedingung gegen den **neuen** Stand.
Trifft sie nicht mehr zu, ändert das Update **0 Zeilen** — das ist das Konfliktsignal. Der
Aufrufer liest dann neu und verschmilzt denselben Patch erneut. Das Anlegen der Zeile läuft
als `POST` **ohne** `merge-duplicates`, damit ein gleichzeitiges Anlegen ein sichtbarer
Konflikt (409) ist und kein stilles Überschreiben. `deleteCronFairnessTenant` (DSGVO) nutzt
denselben Weg — es gibt **keinen** unbedingten Schreiber mehr auf dieser Zeile.

Daraus folgt eine Zusage, die vorher nicht galt: **ein erfolgreicher Schreibvorgang bedeutet,
dass die Zeile genau den zurückgegebenen Stand trägt.**

**(2) Kein Rückfall eines Abschlusses (`mergeEntry`).** Die Regel „gleicher Lauf → der Patch
führt immer" (nötig, damit ein Abschluss nicht hinter seinem eigenen Claim zurückfällt) konnte
umgekehrt einen **verspäteten Claim** über einen bereits persistierten Abschluss legen. Ein
Endzustand (`erfolgreich`/`fehlgeschlagen`) wird jetzt nur noch von einem **echt neueren**
Versuch (strikt jüngerer Versuchszeitpunkt) zurückgedreht. Der Überlappungsschutz bleibt
unberührt: ein fremder Lauf, der ein Mandat neu beginnt, setzt weiterhin `laufend`, und
`fremderHalter` sieht ihn.

**(3) Gegenprobe am Laufende.** Nach dem Abschluss-Schreibvorgang vergleicht
`cron-fairness.persistenzAbweichungen` das, was der Lauf gleich meldet, mit dem **vom Speicher
zurückgegebenen Stand** — nicht mit der eigenen Sicht, die sich sonst selbst bestätigen würde.
Geprüft werden: jeder gemeldete Erfolg/Fehlschlag hat denselben Ausgang im Laufdatensatz ·
jeder gemeldete Erfolg hat einen `erfolgreich`-Mandatseintrag dieses Laufs · die Kapazität
stimmt · der Laufdatensatz ist nicht auf einen **älteren** Lauf zurückgefallen. Ein **neuerer**
Laufdatensatz desselben Crons ist keine Abweichung (§11.5), und ein von einem **fremden** Lauf
übernommenes Mandat ebenfalls nicht — beides ist erlaubtes Verhalten und darf keinen Fehlalarm
erzeugen.

Bei einer Abweichung: Protokollfeld `abweichung=…`, `zustand=gestoert`, ein **eigener**
`systemError` mit zutreffendem Wortlaut, das Antwortfeld `persistenzAbweichung` — **und** ein
Vermerk im Laufdatensatz selbst, damit ein späterer Leser die falsche Zeile nicht ungewarnt
liest. Der Vermerk hebt den Laufzustand nicht (er behauptet keinen Abschluss).

**Ehrliche Grenze von (3):** die Gegenprobe sieht nur, was **bis zum Laufende** passiert ist.
Wird die Zeile **nach** dem letzten Schreibvorgang eines Laufs beschädigt, kann dieser Lauf es
nicht mehr melden. Gegen genau diesen Fall wirkt (1) — deshalb ersetzt (3) das bedingte
Schreiben nicht, sondern ergänzt es.

### 13.5 · Kosten, Grenzen, Rolloutverhalten

- **Kein zusätzliches IO im Normalfall:** weiterhin ein Lesen und ein Schreiben je Vorgang.
  Nur ein erkannter Konflikt kostet einen weiteren Rundlauf (bis zu 3 Versuche), und nur eine
  festgestellte Abweichung kostet einen zusätzlichen kleinen Schreibvorgang.
- **Keine Migration, keine neue Tabelle, kein RPC, keine Transaktion, kein Lock.** `rev` ist
  ein Feld im vorhandenen `data`-JSON.
- **`FAIRNESS_VERSION` bleibt 2.** Eine Erhöhung wäre nicht nur unnötig, sondern schädlich:
  sie würde jede noch laufende Vorgänger-Instanz im Rolloutfenster am Schreiben hindern. Der
  Schutz greift auch ohne sie — ein Codestand **ohne** CAS schreibt `rev` nicht mit, wodurch
  die Bedingung eines neuen Codestandes **nicht** mehr trifft und dessen Patch korrekt
  wiederholt wird. Im Rolloutfenster kann also nur noch die **alte** Instanz ihren eigenen
  Schreibvorgang verlieren — das ist ihr heutiges Verhalten und endet mit dem Rollout.
- **Fail-safe unverändert:** ein dauerhafter Wettlauf endet nach 3 Versuchen mit `ok:false`;
  der Lauf verarbeitet weiter und meldet die Störung, statt sie zu verschweigen.

### 13.6 · Nachweis nach dem Merge (rein lesend, zusätzlich zu §11.8)

| # | Prüfpunkt | Quelle (rein lesend) |
|---|---|---|
| 1 | Die Zeile trägt einen **monoton wachsenden** `rev` | `SELECT data->>'rev' FROM helmut_store WHERE id='<storeId>-cron-fairness'` über mehrere Läufe |
| 2 | Kein Lauf meldet `abweichung=…` | Runtime-Log `[cron/*/fairness] … abweichung=- zustand=ok` |
| 3 | Für **jeden** im Log als erfolgreich gemeldeten Mandanten trägt die Zeile denselben Ausgang | `laeufe[<cron>].ausgaenge` gegen die Logzeile desselben `lauf=<laufId>` |
| 4 | Ein Lauf, der einen **überlappenden** Cron trifft, verliert nichts | ein `crawl`/`pipeline`-Lauf mit äußerem Zeitlimit und ein danach startender Cron: beide Bereiche vollständig |
| 5 | Keine neuen `systemError`-Einträge mit `Fairness-Persistenz weicht ab` | Health-Report/Fehlerliste |
| 6 | Kein Anstieg der Cron-Laufzeiten | `[cron/*] …ms` im Vergleich zu den Vortagen |

**Der Altstand der Zeile wird nicht repariert.** Der Eintrag des betroffenen Mandats läuft
über `HELMUT_CRON_FAIRNESS_STALE_MS` (30 min) von selbst ab; ein Eingriff in
Production-Daten ist freigabepflichtig (`CLAUDE.md` §5) und wäre hier ohne Nutzen.
