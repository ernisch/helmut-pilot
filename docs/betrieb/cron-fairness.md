# Faire Mandantenreihenfolge der Mehrmandanten-Crons (OP-25)

**Stand:** 2026-07-29 · **Kanonisch für:** Reihenfolge, Fairnessgarantie, Beobachtbarkeit und
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
- **DSGVO:** ausschließlich pseudonyme Mandatskennung, Zeitstempel, Zähler, Statuswort. Keine
  Inhalte, keine Roh-Fehlertexte, keine PII. `deleteProfileData` und `deleteTenantScopedData`
  entfernen die Spur eines Mandats mit; Einträge ohne Versuch seit 90 Tagen fallen automatisch weg
  (rein zeitbasiert — **nie** anhand der aktiven Mandantenliste, damit ein vorübergehend
  deaktiviertes Mandat seinen Verlauf behält).

## 4 · Die Fairnessgarantie

> Werden je regulärem Lauf mindestens **k** Mandate **begonnen**, dann wird bei **n** planbaren
> Mandaten jedes Mandat spätestens im **ceil(n / k)**-ten Lauf begonnen.

**Warum:** begonnene Mandate erhalten einen frischen Versuchszeitpunkt und stehen damit strikt
hinter jedem nicht begonnenen Mandat. Die je Lauf begonnenen `k` Mandate waren die `k` mit dem
ältesten Versuch; ein nicht begonnenes Mandat stand also hinter ihnen und rückt um genau `k`
Plätze vor. Von Rang `n-1` erreicht es die vorderen `k` Plätze nach höchstens `ceil(n/k)` Läufen.
Für Mandate ohne jeden Versuch gilt dasselbe: die Gruppe schrumpft je Lauf um `k`, unabhängig
davon, wie der Losentscheid innerhalb der Gruppe ausfällt.

Deterministisch getestet für `n = 1…9` und `k = 1…4` (`scripts/cron-fairness-test.js` §14) und
mit vier Mutationen gegengeprüft (§19).

**Grenzen der Garantie — ehrlich benannt:**

| Fall | Wirkung |
|---|---|
| `k = 0` (kein Mandat wird begonnen, weil schon der erste die Restzeit reißt) | **keine** Garantie — `fairnessBound` liefert `Infinity`. Der Lauf meldet dann `zeitbudget` für alle und einen `systemError`. |
| Ein Mandat bleibt als `laufend` zurück (Prozessabbruch) | Es gilt bis `HELMUT_CRON_FAIRNESS_STALE_MS` (Default 30 min) als versucht und ist nicht planbar; die Garantie gilt für die verbleibenden Mandate. Der Verzug ist auf diese Frist begrenzt. |
| Der Fairnesszustand ist nicht lesbar/schreibbar | Der Lauf läuft weiter (fail-safe), aber **ohne** Garantie: die Reihenfolge fällt auf den Losentscheid zurück. Das erzeugt einen `systemError` — kein falsches Grün. |
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
| **Überlappende Läufe** | Ein als `laufend` vermerktes Mandat wird vom zweiten Lauf nicht begonnen, sondern als `laeuft-bereits` ausgewiesen. Der **harte** Riegel für den Crawl-Pfad bleibt der bestehende Lock `crawl-<mandat>` (dessen atomarer Modus ist P0-4 und weiterhin freigabepflichtig — von diesem Sprint unberührt). |
| **Neues Mandat** | Kein Versuch = ältester Versuch → **Rang 1** im ersten Lauf danach. |
| **Deaktiviertes Mandat** | Steht nicht in der aktiven Liste → wird nicht geplant. Sein Verlauf bleibt erhalten. |
| **Reaktiviertes Mandat** | Kommt mit dem ältesten Versuch zurück → steht vorn. |
| **Ein einzelnes Mandat** | Unverändert: ein Lauf, ein Versuch, dieselbe Ergebnisform (`politicianId` + Nutzlast bzw. `failed`/`error`). |

## 6 · Beobachtbarkeit

Jeder Lauf schreibt **eine** Protokollzeile — kein neuer Admin-Bereich, keine neue Tabelle:

```
[cron/crawl/fairness] geplant=a,b,c,d,e,f begonnen=c,d erfolgreich=1 fehlgeschlagen=1
                      zeitbudget=e,f laeuftBereits=- naechstes=e obergrenzeLaeufe=3 zustand=ok
```

Dieselben Angaben liegen im Antwortkörper des Crons unter `fairness` (`aktive`, `geplant`,
`begonnen`, `erfolgreich`, `fehlgeschlagen`, `zeitbudget`, `laeuftBereits`, `wartend[]` mit
`letzterVersuchAt` / `letzterErfolgAt` / `wartetMs` / `fehlerSerie`, `naechstesMandat`,
`obergrenzeLaeufe`, `zustandGeladen`).

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
| **R-3** | Der `laufend`-Vermerk ist ein Read-modify-write, kein atomarer Claim. | Der harte Riegel gegen Doppelverarbeitung bleibt `crawl-<mandat>` (P0-4). Das Zeitfenster für einen verlorenen Vermerk ist auf Lesen→Schreiben (~100 ms) begrenzt, und die Folge wäre ein doppelter **Versuch**, kein Datenschaden. |
| **R-4** | **Production-Nachweis offen.** Die Wirkung ist offline und gegen den echten Cron-Pfad (lokaler Speicher) belegt, aber noch nicht an einem regulären Production-Lauf. | Erst nach Merge/Deployment beobachtbar: erwartet werden über vier reguläre Läufe (04/10/16/20 UTC) **alle** aktiven Mandate mindestens einmal begonnen, mit `[cron/*/fairness]`-Zeilen als Beleg. Bis dahin bleibt OP-25 **teilweise abgeschlossen**. |
