# Understanding-Laufmeldung: roter Production-Befund vom 30.08.2026 und lokale Korrektur

**Sprintzustand: teilweise abgeschlossen.** Die Diagnose ist vollständig und rein lesend
belegt, die Korrektur ist umgesetzt und getestet. **Nichts ist nach Production gebracht
worden** — kein Merge, kein Production-Deployment, keine Preview, keine Migration, keine
Datenänderung, keine Env-/Flag-Änderung, kein Cron-Lauf, kein Modellaufruf, kein Pull
Request. Der Branch wurde am 30.08. **ausschließlich zur Sicherung** nach GitHub gepusht,
nachdem er sich in seiner eigenen `vercel.json` selbst für Deployments gesperrt hatte (§12).
Der Production-Nachweis steht deshalb ausdrücklich aus (§9).

**Untersuchter Lauf:** natürlicher `understanding-cron`, 2026-08-30
21:30:04,417–21:33:45,398 UTC, Laufzeit 220 981 ms, Production-Commit `afc807e0`,
Region `fra1`.

---

## 1 · Was gemeldet wurde und was wahr war

Die relationale Laufquittung (`process_runs`) und die Fachtelemetrie desselben Laufs
widersprachen sich:

| Feld | gemeldet | wahr (Fachtelemetrie) |
|---|---:|---:|
| `status` | `success` | ein echter Fehlerfall enthalten |
| `saved_count` | **0** | 18 |
| `skipped_count` | **0** | 0 (zufällig richtig) |
| `failed_count` | **0** | 1 |
| `deferred_count` | 32 | 32 |
| `processed_count` | 18 | 18 |
| `error_class` | leer | `skipped-error` |

Fachtelemetrie derselben Zeile: `cluster 51` · `ergebnisse { saved: 18, skipped-error: 1 }` ·
`gruppen { verarbeitet 18, erneut 32, fehlgeschlagen 1, duplikate 0, unbekannt 0,
ausgeschlossen 0, zusammengefuehrt 0 }` · `auffaelligkeitenGesamt 1`.

**Der Befund ist nicht auf diesen Lauf beschränkt.** Alle **zehn** Laufquittungen des
30.08. — `warteschlange-crawl`, `warteschlange-pipeline`, `understanding-cron`,
`understanding-lage`, `briefing-morning`, `briefing-lage` — trugen
`saved_count = skipped_count = failed_count = 0`.

## 2 · Ursachen (am Quelltext und an der Zeile belegt)

**U1 — Der Gesamtstatus kannte nur zwei Ausgänge.**
`server.js`, `/api/cron/understanding`: `status: result && result.skipped ? "blocked" : "success"`.
Ein Teilerfolg **mit** Fehlerfall hatte damit gar keine Ausdrucksform, obwohl `partial`
und `failed` seit dem 27.07. im CHECK-Constraint der Tabelle stehen und der
Lage-Briefing-Cron sie seit Befund R3 auch benutzt. Dieselbe Zeile stand in
`lib/helmut/scheduler.js` für `understanding-lage`.

**U2 — Die skalaren Zähler wurden nie übergeben und dann still zu einer harten Null.**
Der Cron übergab `processed`, `deferred`, `skippedStore`, `reason`, `zielmenge`, `status`
und `telemetrie` — **nicht** `gespeichert`, `uebersprungen`, `fehlgeschlagen`.
`sanitizeProcessRun` machte daraus `null`. Anschließend traf `null` in
`blob-relational.js` auf

```js
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);   // Number(null) === 0
```

und wurde zu einer **gemessenen 0**. Eine unbekannte Menge erschien damit als belegte
Null — genau das, was `CLAUDE.md` §4.4 verbietet. Lokal exakt reproduziert:
`num(undefined) → null`, **`num(null) → 0`**.

Das trifft nicht nur die Meldung: `motor-health.js` entscheidet über
`num(v) != null`, ob eine Quittung überhaupt abrechenbar ist (`zaehlbar`), und führt
dort bereits die **richtige** Unterscheidung. Beide Helfer liefen auseinander.

## 3 · Der erneut freigegebene Parserfall — nicht erfolgreich, aber andere Ursache

**Eindeutig belegt, ohne Ausgabe einer Kennung.** Im Laufzeitfenster wechselte **genau
eine** Reservierung nach `unbekannt`, mit `versuche = 3` und `ki_aufrufe = 3` — passend
zum dokumentierten Vorzustand (`offen`, `versuche = 2`, `ki_aufrufe = 2`, kein Besitzer,
keine Lease). Sie wurde **als erste** bearbeitet (11 889 ms nach Laufstart) — genau die
Position, die `runPendingUnderstandingShadow` ausdrücklichen Wiederaufnahmen einräumt
(„VORNE einsortiert"). Das Vercel-Laufzeitprotokoll führt denselben Fall als einzigen
`skipped-error` mit `wiederaufnahmeFreigabe: true` und `ausgang: "unbekannt"`.

**Der Fall war also der eine `skipped-error` — und er ist erneut gescheitert.**

Seine klassifizierte Ursache lautet jedoch:

> `modellfehler:KI-Antwort wurde nicht vollstaendig abgeschlossen`

Das ist `AI_RESPONSE_NOT_COMPLETED` aus `requireCompletedProviderResponse` — eine
Anbieterantwort ohne `status: completed`, also die von **PR #274 absichtlich
eingeführte** Ablehnung unvollständiger Antworten (Regel 4/5 des Parserfix-Belegs).
Es ist **kein** Parserfehler und **kein** rohes Steuerzeichen im Umschlag.

**Folge: der Parser wird nicht verändert.** Der Fix aus PR #274 hat für diesen Fall
getan, was er soll; die Antwort war inhaltlich unvollständig und wurde fail-closed
abgelehnt statt als Erfolg gebucht.

## 4 · Zweiter, neuer roter Befund: U+0000 erreichte die Ablage (30.08. 20:02 UTC)

Bei der Diagnose fiel eine **zweite**, bis dahin unbekannte `unbekannt`-Zeile auf,
entstanden im Warteschlangen-Crawlslot um 20:02 UTC (nicht im 21:30-Lauf). Klassifizierte
Ursache:

> `speicherfehler:nach-wiederholung:vertrag-nicht-pruefbar:Supabase storage failed (400):`
> `{"code":"22P05","details":"\u0000 cannot be converted to text.",`
> `"message":"unsupported Unicode escape sequence"}`

PostgreSQL kann in einer `text`-Spalte kein U+0000 halten. `JSON.stringify` schickt es als
`\u0000` an PostgREST, die Datenbank weist die ganze Zeile ab — der bezahlte Modellaufruf
war verloren.

**Das ist der belegte Rest der PR-#274-Lücke.** Die Rettung
`escapeControlCharsInJsonStrings` macht einen Umschlag mit **rohen** Steuerzeichen wieder
parsebar; `JSON.parse` verwandelt das dabei eskapierte Zeichen zurück in ein **echtes**
U+0000 im Modelltext. Vor PR #274 scheiterte so eine Antwort am Parser und erreichte die
Ablage nie; seit dem Fix erreicht sie sie — und scheitert dort. Derselbe Wert entsteht
auch ohne Rettung, wenn ein Modell `\u0000` regulär eskapiert liefert.

**Vollständig synthetisch reproduziert** (keine Production-Antwort, kein Netz):
roher NUL im Umschlag → `JSON.parse` scheitert → Rettung greift → `status: completed`
besteht → U+0000 im Modelltext → U+0000 im Modell-JSON → U+0000 im Prosafeld **und** im
Listenfeld des Wissensobjekts → `\u0000` in der Nutzlast an PostgREST.

## 5 · Die Grenze von 217,5 Sekunden — kein Laufzeitfehler

**Kanonische Herkunft:** `SLOT_P95_GRENZE_MS = 217500` steht ausschließlich in
`scripts/gruentage-auswertung.js` auf dem **ungemergten, nicht deployten** Branch
`claude/helmut-ten-mandate-transition-lg975i` (PR #282), kommentiert als
*„25 % Reserve im 290-s-Budget"* (0,75 × 290 000). Sie ist **Kriterium K9 der
Grüntage-Auswertung**: der **p95 über alle Verarbeitungsslots eines UTC-Tages**.
Im deployten Code kommt der Wert nicht vor.

Die vier Grenzen sind sauber zu trennen:

| Grenze | Wert | Bedeutung | Ort |
|---|---:|---|---|
| Funktionslimit | 300 000 ms | Vercel `maxDuration` | `vercel.json` |
| Harte Antwortgrenze | 280 000 ms | absolute Deadline des Laufs | `server.js` (`understandingStartMs + 280000`) |
| Vor-Modellstart-Reserve | 55 000 ms (Default) | **ab hier keine neue Arbeit mehr** | `lib/helmut/verstehen-restzeit.js` |
| Internes Verstehensbudget | 240 000 ms (Default) | relatives Loop-Budget | `HELMUT_UNDERSTAND_BUDGET_MS` |
| Grüntage-Kriterium K9 | 217 500 ms | **p95 je Tag**, Beobachtung | PR #282 (ungemergt) |

**217 500 ms ist keine Obergrenze für die Dauer eines einzelnen Laufs.** Sie ist die
Schwelle, ab der keine neue Arbeit mehr begonnen werden darf bzw. — als K9 — ein
Tages-p95. Dass ein Lauf danach noch fertigrechnet, ist genau der Zweck der Reserve.

**Was der Lauf wirklich tat, an der Datenbank gemessen:** der letzte Abschluss lag bei
t₀ + 218 574 ms. Die verbleibende Zeit bis zur harten Deadline betrug damit 61 426 ms —
zu wenig für die Reserve, also griff die Wache und stellte die restlichen **32** Vorgänge
ehrlich zurück, **ohne** einen weiteren Modellaufruf zu beginnen. Der Lauf endete bei
220 981 ms, also **59 019 ms vor** der harten 280-s-Grenze und **79 019 ms vor** dem
Funktionslimit. Aus `Reserve > 61 426 ms` folgt, dass in Production eine Reserve
oberhalb des Defaults von 55 000 ms wirkt (280 000 − 62 500 = 217 500 passt exakt); die
zugehörige Env-Variable ist aus einer Claude-Sitzung **nicht lesbar** und bleibt damit
unbestätigt.

**Ergebnis: keine Laufzeitkorrektur.** Die Restzeitwache existiert seit PR #259, ist in
`verstehen-restzeit-test.js` mit 50 PASS belegt und hat in diesem Lauf nachweislich
korrekt gearbeitet. Eine Änderung wäre hier nicht Korrektur, sondern Regression.
Weder Grenze noch Dokumentation wurden angepasst, um den Lauf grün erscheinen zu lassen.

**Der ehrliche Befund zum Tag bleibt trotzdem rot:** die Slotdauern des 30.08. waren
8 798 / 13 228 / 39 511 / 169 374 / 220 981 / 221 797 / 245 695 / 249 043 / 259 863 /
279 563 ms ⇒ **p95 = 279 563 ms** ≫ 217 500 ms. **K9 ist gerissen, der 30.08. ist kein
grüner Tag.** Treiber ist der 20:00-Crawlslot, nicht der Verstehenslauf — dieser liegt
nur an fünfter Stelle. K10 (kein Einzelwert über 280 000 ms) hielt mit **437 ms**
Abstand.

## 6 · Lokale Korrektur

Neu `lib/helmut/lauf-bilanz.js` — **eine** Ableitung der vier Hauptzähler und des
Gesamtstatus aus der bereits vorhandenen Fachtelemetrie (`buildOutcomeTelemetry`,
Gruppenkarte `ERGEBNISGRUPPEN`). Keine zweite, parallele Zählung.

Vier **disjunkte** Eimer, daraus eine prüfbare Identität:

```
gespeichert    = verarbeitet
uebersprungen  = zusammengefuehrt + duplikate + ausgeschlossen
fehlgeschlagen = fehlgeschlagen + unbekannt
vertagt        = erneut
⇒ gespeichert + uebersprungen + fehlgeschlagen + vertagt = cluster
```

Statussemantik:

Geprüft wird in dieser Reihenfolge; ein **struktureller** Befund schlägt den fachlichen,
weil er sagt, dass die Zahlen als Ganzes nicht belastbar sind:

| # | Bedingung | Status | Fehlerklasse |
|---|---|---|---|
| 0 | `skipped` (kein Store, keine KI, nichts vorgemerkt, fremde Sperre) | `blocked` | — |
| 1 | keine Fachtelemetrie | `failed` | `telemetrie-fehlt` |
| 2 | ein vorhandener Gruppenwert ist keine nichtnegative Zahl | `failed` | `telemetrie-unvollstaendig` |
| 3 | Arbeitsliste (`cluster`) fehlt oder ist unbrauchbar | gespeichert > 0 ? `partial` : `failed` | `telemetrie-unvollstaendig` |
| 4 | Summe der vier Zähler ≠ `cluster` | gespeichert > 0 ? `partial` : `failed` | `zaehlerwiderspruch` |
| 5 | mindestens ein echter Fehlerfall | gespeichert > 0 ? `partial` : `failed` | häufigster fehlerhafter Ergebnisschlüssel |
| 6 | Arbeitsliste vorhanden, aber null Zeilen (`cluster = 0`) | `blocked` | — |
| 7 | sonst | `success` | — |

**Eine nicht stimmige Bilanz kann damit nie `success` werden** — und eine nicht
abrechenbare Bilanz (Zeilen 1 und 2) liefert **alle** Zähler als `null`, nie als `0`.

Vertagte Arbeit bleibt eigenständig sichtbar und wird **nie** als technischer Fehler
gezählt. Ergebnisarten, die die Gruppenkarte nicht kennt, fallen in `gruppen.unbekannt`,
zählen als Fehler und werden als `ergebnisart-unbekannt:<key>` benannt — ein nicht
abrechenbares Ergebnis kann nicht mehr still grün werden.

Geändert:

| Datei | Änderung |
|---|---|
| `lib/helmut/lauf-bilanz.js` | **neu** — die kanonische Ableitung |
| `server.js` | `/api/cron/understanding` nutzt sie; Zähler + `fehlerklasse` werden übergeben; Zählerwiderspruch wird als Fehler geloggt |
| `lib/helmut/scheduler.js` | `understanding-lage` nutzt dieselbe Ableitung |
| `lib/helmut/blob-relational.js` | `num()` unterscheidet `null` von `0` — gleichgezogen mit `motor-health.js` |
| `lib/helmut/understanding.js` | `cleanEntry` verdichtet C0-Steuerzeichen und U+007F wie Leerraum (Befund §4) |
| `scripts/lauf-bilanz-test.js` | **neu** — Regressionssuite, 104 Prüfungen |
| `scripts/kostenmessung-test.js` | brüchiges Quelltextfenster (feste 3 200 Zeichen) auf Blockgrenze umgestellt |

**Keine Migration.** Der Fehler liegt vollständig im Anwendungscode; Tabelle und
CHECK-Constraint tragen `partial`/`failed` seit dem 27.07.

**Bewusst nicht geändert:** `zielmenge` des Understanding-Crons bleibt die Zahl der
geladenen Rohdokumente (500) und ist damit eine **andere Einheit** als die Arbeitsliste
(`cluster` = 51). Die Identität wird deshalb gegen `cluster` geprüft, nicht gegen
`zielmenge`. Eine Umstellung würde die historische Reihe brechen und ist eine eigene
Entscheidung.

### 6.1 · Nachtrag 31.08. — unabhängige Prüfung schloss drei Reste

Die erste Fassung berechnete `stimmig`, ließ es aber nicht auf den Status durchschlagen:
der Status entschied sich allein an `fehlgeschlagen > 0`, und `server.js` protokollierte
den Widerspruch nur, speicherte den berechneten Status jedoch weiter. Drei Reste, alle
geschlossen:

1. **Eine nicht stimmige Bilanz konnte `success` werden** — ebenso eine Bilanz ohne
   brauchbare Arbeitsliste. Beides ist jetzt Zeile 3 bzw. 4 der Tabelle oben.
2. **Ein ungültiger Gruppenwert wurde still zu `0`** (`summe()` glättete ihn). Die Bilanz
   sah dann vollständig aus, war es aber nicht. Jetzt fail closed, Zeile 2.
3. **`const processed = bilanz.gespeichert ?? 0`** machte aus einem unbekannten Wert
   erneut eine gemessene Null. Jetzt bleibt `processed` unbekannt. Damit das bis in die
   Ablage trägt, musste zusätzlich **`sanitizeProcessRun` in `lib/helmut/storage.js`**
   denselben `num(null) === 0`-Fehler ablegen wie zuvor `blob-relational.js` — sonst
   hätte der Speicherweg die Ehrlichkeit direkt wieder aufgehoben.

Belegt durch `scripts/lauf-bilanz-test.js` §14 (45 zusätzliche Prüfungen).

## 7 · Wirkung auf bestehende Verbraucher

- **Gesundheitsbericht** (`motor-health.js`): `partial` gilt seit der Watchdog-Korrektur
  vom 26.08. **nie** als „Slot fehlt"; ein Slot ist vorhanden, sobald irgendeine Quittung
  im Fenster liegt. Ein `partial` wird als Störung erfasst und gilt nach einem späteren
  erfolgreichen Lauf desselben Prozesses als **erholt**. Beides ist in der neuen Suite
  §9 festgehalten. Der 21:30-Lauf würde künftig als Störung erscheinen und mit dem
  05:30-Lauf des Folgetags als erholt gelten — das ist die beabsichtigte Ehrlichkeit,
  kein Fehlalarm.
- **Abrechnung der Quittung**: `fehlgeschlagen` ist jetzt belegt statt unbekannt;
  `stapelrest` bleibt nichtnegativ, kein Widerspruch.
- **Kostenbericht / WhatsApp-Watchdog / Slotauswertung**: lesen `saved_count`,
  `skipped_count` und `failed_count` nicht; die Grüntage-Auswertung (PR #282) wertet
  `duration_ms` und `status` aus. Wo bisher eine falsche `0` stand, steht künftig
  entweder der belegte Wert oder ehrlich `null`.

## 8 · Prüfungen (alle über `scripts/lokal.js`, kein Netz, kein Anbieter, keine Production)

| Prüfung | Ergebnis |
|---|---:|
| `lauf-bilanz-test.js` (neu) | **149 PASS / 0 FAIL** |
| `verstehen-restzeit-test.js` | 50 PASS / 0 FAIL |
| `ai-json-parse-test.js` | 25 / 25 |
| `ki-antwortvertrag-test.js` | 10 PASS / 0 FAIL |
| `prozesslauf-telemetrie-test.js` | 37 PASS / 0 FAIL |
| `prozess-laufzeit-test.js` | 16 / 16 |
| `motor-health-test.js` | 65 PASS / 0 FAIL |
| `health-report-route-test.js` | 49 PASS / 0 FAIL |
| `vorgangs-lebenszyklus-test.js` | 81 / 81 |
| `kostenmessung-test.js` | 129 PASS / 0 FAIL |
| vollständiger Offline-Lauf | **284/286 Suiten grün** |

Die zwei roten Suiten des Gesamtlaufs liegen außerhalb des Änderungssatzes und sind
fehlende lokale npm-Abhängigkeiten: `kalender-ics-test.js` (`ical.js`) und
`lambda-paket-test.js` (`@aws-sdk/client-sqs`). Eine vollständig grüne Gesamtsuite wird
**nicht** behauptet.

Zusätzlich mit der Fachtelemetrie der echten Production-Zeile gegengerechnet (offline,
nur Zahlen): der Lauf ergibt jetzt `status = partial`, `saved_count = 18`,
`skipped_count = 0`, `failed_count = 1`, `deferred_count = 32`,
`error_class = skipped-error`, Identität 18 + 0 + 1 + 32 = 51 = `cluster` ✓.

## 9 · Was in Production weiterhin unbewiesen ist

1. **Die Korrektur ist in Production nicht bewiesen.** Sie ist ungemergt, nicht deployt.
   Erst ein späterer **natürlicher** Lauf nach einem gesondert freigegebenen Merge kann
   sie belegen. Ein künstlicher Lauf ist dafür weder freigegeben noch nötig.
2. **Der Parserfall bleibt offen.** Der Vorgang steht weiter auf `unbekannt`
   (`versuche = 3`, `ki_aufrufe = 3`). Ob die Anbieterantwort dauerhaft unvollständig
   bleibt, ist unbewiesen; eine erneute Freigabe ist eine Betreiberentscheidung und
   kostet einen weiteren bezahlten Aufruf.
3. **Der U+0000-Fall bleibt offen** (zweiter `unbekannt`-Vorgang, 30.08. 20:02 UTC).
4. **Die wirksame Restzeitreserve in Production ist unbestätigt** — Vercel-Env ist aus
   einer Claude-Sitzung nicht lesbar.
5. **Der Siebentagenachweis hat nicht begonnen.** Der 30.08. ist wegen K9
   (p95 279 563 ms > 217 500 ms) **kein grüner Tag**.
6. **Ankunft > Abfluss, durchgehend.** 23.–30.08. kamen 247/282/226/469/358/298/232/286
   neue Wissensobjekte an, verstanden wurden 47/59/64/71/68/64/82/69. Der Rückstand
   beträgt **9 065** Wissensobjekte im Zustand `pending`, davon **8 836** älter als 24 h
   (ältestes vom 02.07.). Die Obergrenze ist der KI-Tagesdeckel: 84 Aufrufe am 30.08.,
   **100 am 29.08. — dort war der Deckel erreicht**. Das ist ein Kapazitäts-, kein
   Meldebefund, widerspricht aber der Stufe-2-Bedingung „Abfluss ≥ Ankunft über 7 Tage".

## 10 · Rein lesender Production-Befund im Überblick (30.08.2026)

- **5 aktive Mandate** (9 Mandatsprofile gesamt) — unverändert.
- **Briefings 5/5**: alle fünf aktiven Mandate haben am 30.08. je ein `morgenlage`- und
  ein `lage`-Briefing.
- **CAS-Zustände:** `fertig` 745 · `offen` 11 · `unbekannt` 2 · `aufgegeben` 1 ·
  `reserviert` 0 · `modell-laeuft` 0. **Zwei neue `unbekannt` am 30.08.** (§3, §4) —
  vorher 0.
- **Keine hängenden Leases:** 0 CAS-Zeilen mit aktiver oder abgelaufener Lease,
  0 Aufträge im Zustand `laufend`, 0 mit abgelaufener Auftrags-Lease.
- **Warteschlange:** 77 wartend, 0 laufend, **0 fehlgeschlagen**; 1 Auftrag älter als 24 h.
- **Keine Dubletten:** 0 doppelte `vorgang_id`, 0 Wissensobjekte ohne `vorgang_id`,
  0 `fertig`-Reservierungen ohne zugehöriges Wissensobjekt (kein Ergebnisverlust).
- **Keine unerwarteten endgültigen Fehler:** 30 Wissensobjekte auf
  `understanding_status = failed` — unverändert seit 17.08., der bekannte OP-06-Bestand.
- **KI-Verbrauch 30.08. (UTC-Tag): 84**, Deckel (dokumentiert 100) **nicht** erreicht;
  29.08. lag bei 100, also am Deckel. `llm_usage` ist leer — der Verbrauch wird im
  Auth-Blob geführt, maßgeblich ist `llm_budget_counters` (bekannter Logverlust, OP-17).
- **Deployment:** `dpl_DenQ26p…`, Ziel `production`, Zustand `READY`, Commit `afc807e0`
  (Merge PR #274), Region `fra1` — deckungsgleich mit dem `commit_ref` aller Quittungen.

## 11 · Nächster sicherer Schritt

1. Betreiberentscheidung über Review und Merge dieses Branches (Merge = Deployment).
2. Danach den **nächsten natürlichen** `understanding-cron`-Lauf rein lesend prüfen:
   trägt seine Quittung belegte Zähler und einen ehrlichen Status?
3. Getrennt entscheiden: erneute Freigabe des `unbekannt`-Vorgangs aus §3 (ein weiterer
   bezahlter Aufruf) und Behandlung des U+0000-Vorgangs aus §4.
4. Unabhängig davon bleibt der Kapazitätsbefund aus §9.6 die eigentliche Blockade des
   Siebentagenachweises.

## 12 · Gesicherter Push ohne Bereitstellung (30.08., Betreiberfreigabe)

Der Branch wurde nach ausdrücklicher Freigabe nach GitHub gepusht — **nicht** als
gewöhnlicher Branch-Push, sondern erst nachdem ein zusätzlicher Commit den Zweig in
`vercel.json` unter `git.deploymentEnabled` selbst auf `false` gesetzt hatte.

**Wirksamkeit VOR dem Push belegt (rein lesend).** Die Vercel-Dokumentation nennt Syntax
und Semantik (nicht genannte Branches sind standardmäßig aktiviert), sagt aber nicht,
aus welchem Branch die Datei gelesen wird. Das entscheidet ein natürliches Experiment im
eigenen Projekt vom 29.08.: **vier** Zweige, die sich in ihrer **eigenen** `vercel.json`
selbst sperren, wurden um 19:44:18, 19:54:57, 20:04:09 und 20:34:22 UTC gepusht — im
Fenster 19:40–21:00 UTC entstand **kein einziges** Deployment. Im unmittelbar
angrenzenden Fenster erhielt `claude/helmut-ten-mandate-transition-lg975i`, der sich
**nicht** selbst sperrt, für **jeden** Push eine Preview (21:05, 21:26, 21:41 UTC).
Entscheidend: `main` stand zu diesem Zeitpunkt auf `bb0577a` und trug **überhaupt kein**
`deploymentEnabled` — die Sperreinträge existierten also ausschließlich im jeweils
gepushten Branch. Vercel liest die Einstellung damit belegt aus dem **gepushten Commit**.

**Lokale Vorabprüfung: 16 von 16 Zusicherungen** — JSON gültig, genau ein Eintrag
ergänzt, kein Platzhalter, kein Eintrag für `main`, alle Werte exakt `false`, außerhalb
von `git` ist `vercel.json` unverändert (`maxDuration` 300, `regions` unverändert). Die
drei Repo-Suiten, die `vercel.json` lesen, bleiben grün: `selbstweck-ende-zu-ende` 31/0,
`cron-globalphase` 176/0, `pipeline-zeitbudget` 21/0.

**Nachweis nach dem Push (rein lesend, zwei unabhängige Systeme):**

| Kontrolle | Ergebnis |
|---|---|
| Branch und alle Commits auf GitHub | ja — Remote-Kopf identisch mit lokal, 0 ungepushte Commits |
| Vercel-Deployments seit dem Push | **0** (Vercel-API, Fenster ab 22:20 UTC; Push 22:56:50 UTC) |
| Preview erstellt | **nein** — neuester `Preview`-Eintrag der GitHub-Deployments-API stammt vom 29.08. 22:06 UTC |
| Commit-Status auf dem Kopf | keine Statuszeile — Vercel hat keinen Lauf angelegt |
| GitHub-Actions-Läufe für den Branch | 0 (ohne Pull Request kein CI-Lauf) |
| Production | unverändert `afc807e0`, Deployment `READY`, `target: production`, Alias gebunden; neuester `Production`-Eintrag weiterhin 29.08. 22:02 UTC |

Kein Pull Request, kein Merge, kein Production-Deployment, keine Änderung an Supabase.
