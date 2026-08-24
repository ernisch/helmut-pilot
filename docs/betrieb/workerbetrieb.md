# Workerbetrieb der Arbeitswarteschlange

**Stand:** 2026-08-08, Zustandszeile berichtigt am 2026-08-24 · OP-30
**Code:** [`lib/helmut/worker-betrieb.js`](../../lib/helmut/worker-betrieb.js) · [`lib/helmut/scalable-pipeline.js`](../../lib/helmut/scalable-pipeline.js)
**Zustand (2026-08-24):** `HELMUT_SCALABLE_PIPELINE` ist in Production **seit dem 23.08.2026
eingeschaltet**; der Worker arbeitet also wirklich. Der **Antrieb** ist weiterhin der Zeitplan
(`HELMUT_JOB_DISPATCH_MODE=shadow`) — der Ereignis-Antrieb ist **nicht** aktiviert. Die frühere
Zeile „nicht scharfgeschaltet, Flag ist aus" ist **überholt**. Verbindlich:
[`../CURRENT_STATE.md`](../CURRENT_STATE.md) §4; Aktivierungsvorlauf des Ereignis-Antriebs:
[`op30-aktivierung-5-mandate.md`](op30-aktivierung-5-mandate.md) §31.

---

## 1 · Was der Worker ist

Der Worker holt sich Aufträge aus `public.helmut_jobs`, bearbeitet sie und meldet das Ergebnis
zurück. Er ist bewusst **kein neuer Dienst**: kein zusätzlicher Hoster, keine neue Abhängigkeit,
keine neue Laufzeit. Es ist Code im bestehenden Repository, der auf zwei Arten laufen kann.

Zwei harte Riegel, beide **fail closed**:

1. Ohne `HELMUT_SCALABLE_PIPELINE` passiert nichts (`durchlauf()` liefert `{gestartet:false, grund:"flag-aus"}`).
2. Bei `HELMUT_SOURCE_MODE=off` werden Aufgabentypen mit externem Abruf (`source_fetch`) gar
   nicht erst geholt — nicht „übersprungen", sondern nicht angefasst.

## 2 · Gesund ≠ bereit

| Auskunft | Frage | Typisch |
|---|---|---|
| `health()` | Läuft der Prozess? | Immer `laeuft`, solange er antwortet |
| `readiness()` | **Darf und kann** er arbeiten? | `bereit:false` + `gruende:[...]` |

Die Trennung ist der Punkt. Ein Worker, der läuft, aber wegen fehlender Migration nichts tun
kann, ist **gesund und nicht bereit**. `readiness()` gibt nie ein bloßes `false` zurück, sondern
immer die Gründe: `flag-aus`, `quellenmodus-aus`, `warteschlange:<grund>`.

## 3 · Grenzen (alle über Env, nichts hartkodiert)

| Variable | Standard | Grenzen | Warum |
|---|---|---|---|
| `HELMUT_WORKER_PARALLEL` | 2 | 1–8 | Der Engpass ist **nicht** die Warteschlange, sondern die Google-Drosselung. Mehr Worker helfen dort nicht, sie schaden. |
| `HELMUT_WORKER_BUDGET_MS` | 240 000 | 5 000–900 000 | Bleibt unter dem Vercel-Limit von 300 s (§5). |
| `HELMUT_WORKER_LEASE_MS` | 120 000 | 10 000–900 000 | Wie lange ein Auftrag „in fremder Hand" gilt, bevor ihn ein anderer Worker holen darf. |
| `HELMUT_WORKER_STAPEL` | 10 | 1–200 | Aufträge je Reservierung. |

## 4 · Die zwei Betriebsformen

Derselbe Code, zwei Aufrufmuster:

**(a) Langlaufender Prozess** — `betreibe()` in einer Schleife. Beendet sich sauber, wenn
`stopSignal()` zwischen zwei Durchläufen `true` liefert oder die Warteschlange leer ist. Ein
laufender Durchlauf wird **nie** mittendrin abgebrochen — genau das ließe Aufträge in der
Schwebe, bis die Lease abläuft.

**(b) Begrenzter Durchlauf je Zeitfenster** — `durchlauf()` einmal pro Cron-Aufruf.

## 5 · Die Vercel-Entscheidung

**Auf Vercel ist (a) nicht möglich.** Belegt aus `vercel.json`:

- `functions."api/index.js".maxDuration = 300` — eine Ausführung endet nach 300 Sekunden.
- Es gibt **9 Cron-Einträge**, alle als HTTP-Aufruf einer Serverless-Funktion.
- Es gibt keinen Prozess, der zwischen zwei Aufrufen weiterläuft. `setInterval` überlebt das
  Ende der Ausführung nicht.

Daraus folgt nüchtern: **auf Vercel läuft der Worker als Form (b)** — ein begrenzter Durchlauf
je Cron-Fenster, mit `budgetMs` unter 300 s. Das ist keine Notlösung, sondern die einzige Form,
die die Plattform trägt.

Was das kostet: der Durchsatz ist durch **Fenster × Dauer** begrenzt, nicht durch die
Warteschlange. Wer mehr Durchsatz braucht, als die Cron-Fenster hergeben, braucht **entweder**
mehr/engere Fenster **oder** eine Laufzeit, die lange Prozesse trägt (Container). Beides ist
eine **Betreiberentscheidung** und wird hier ausdrücklich **nicht** getroffen.

## 6 · Bereinigung der Warteschlange

Migration [`20260808_jobqueue_bereinigung.sql`](../../supabase/migrations/20260808_jobqueue_bereinigung.sql)
(Rollback im selben Verzeichnis). **Nicht angewendet, nicht scharfgeschaltet.**

Reihenfolge — erst anschauen, dann handeln:

```sql
select * from public.helmut_jobs_bereinigung_vorschau(14);   -- rein lesend
select * from public.helmut_jobs_bereinigen(14);             -- Trockenlauf (STANDARD), löscht nichts
select * from public.helmut_jobs_bereinigen(14, false, 5000);-- löscht wirklich, stapelweise
```

Den letzten Aufruf wiederholen, bis `geloescht < max_zeilen`.

**Was niemals gelöscht wird** (harte Bedingung, nicht Konvention): wartende, laufende,
zurückgestellte und **endgültig fehlgeschlagene** Aufträge — Letztere sind der Fehlerbeleg und
damit die Antwort auf „warum fehlt dieses Briefing?". Außerhalb von `helmut_jobs` wird nichts
angefasst.

### Gemessen (lokal, 2026-08-08)

`scripts/jobqueue-bereinigung-test.js`, echte PostgreSQL-Datenbank, **66 000 Zeilen**:

| Größe | Wert |
|---|---|
| Aufbau 66 000 Zeilen | 2 234 ms |
| Vorschau (rein lesend) | 72 ms |
| Bereinigung 46 200 Zeilen | 814 ms in 11 Aufrufen (~46 200 Zeilen/s) |
| langsamster Einzelaufruf | 94 ms |
| geschützter Bestand danach | 19 800 von 19 800 |

Weiter belegt in demselben Lauf: der Trockenlauf ist der Standard und löscht nichts; die
Obergrenze je Aufruf hält; ein **gleichzeitig arbeitender Worker** verliert keinen Auftrag
(2 000 offene Aufträge vorher = 1 000 reserviert + 1 000 wartend nachher); ein **Abbruch**
mitten in der Bereinigung hinterlässt keinen halben Zustand; Wiederholung löscht nichts mehr;
`anon` und `authenticated` dürfen nicht bereinigen, `service_role` schon; der Rollback lässt
`helmut_jobs` und `helmut_prune_jobs` unberührt.

**Einordnung:** lokale Datenbank, `fsync=off`, kein Netz. Die Zeiten sind eine **Untergrenze**
und keine Production-Zusage.

### Durchsatz der Warteschlange (lokal gemessen, 2026-08-08)

`scripts/jobqueue-lasttest.js`, echte Prozesse, echte Datenbank, echter Absturz (SIGKILL),
5 190 Aufträge aus 1 000 synthetischen Mandatsprofilen:

| Kennzahl | Wert |
|---|---|
| Durchsatz **ein** Worker | 1 064,6 Aufträge/s |
| Durchsatz **acht** Worker | 4 093,1 Aufträge/s (Wiederholung 4 257,6 — Abweichung 4 %) |
| durchschnittliche Bearbeitungszeit | 19,53 ms je Auftrag |
| maximales Rückstandsalter | 26 s |
| rechnerisch nötige Worker für 24 h | 1 (Bedarf 15 570 Aufträge/Tag bei 3 Fenstern) |
| Auslastung eines Workers heute | 0,017 % |

Beim harten Absturz eines Workers mitten im Lauf: **kein Auftrag verloren, keiner doppelt
erledigt** — die 5 Aufträge des Sterbenden wurden nach Ablauf der Lease neu vergeben und genau
einmal abgeschlossen.

**Was daraus folgt:** die Warteschlange ist **nicht** der Engpass. Der Engpass ist §5
(Zeitfenster) und die Google-Drosselung.

## 7 · Was dieser Aufbau NICHT beweist

- Die Aufgabenhandler im Belastungstest sind **Attrappen**. Kein Netzverkehr, kein
  Google-Abruf, kein KI-Aufruf. Gemessen ist die Kapazität der **Warteschlange**, nicht die
  Laufzeit echter externer Abrufe.
- Jede daraus abgeleitete Workerzahl ist eine **Untergrenze** für die Warteschlange und **keine**
  Aussage über die Gesamtlaufzeit in Production.
- Ob die Bereinigung laufen soll, ob der Deckel steigt, ob die Mandatsmenge wächst: alles
  Betreiberentscheidungen. Dieses Dokument trifft keine davon.

## 8 · Wenn etwas klemmt

| Symptom | Erste Prüfung |
|---|---|
| Worker tut nichts | `readiness().gruende` lesen — `flag-aus`? `warteschlange:<grund>`? |
| Aufträge hängen auf `laeuft` | Lease abgelaufen? `lease_expires_at` gegen `now()`; ein toter Worker gibt seine Aufträge erst nach Ablauf frei. |
| Warteschlange wächst | `helmut_job_metrics()`; wächst der Rückstand schneller als die Fenster, ist es §5, nicht die Datenbank. |
| Briefing fehlt | Erst die **endgültig fehlgeschlagenen** Aufträge lesen — sie sind absichtlich nicht wegbereinigt. |

## 9 · Verwandte Dokumente

- [`docs/betrieb/cron-fairness.md`](cron-fairness.md) — Reihenfolge und Fairness der Cron-Läufe
- [`docs/betrieb/env-inventar.md`](env-inventar.md) — alle Variablen und ihre Herkunft
- [`docs/betrieb/aufbewahrung-loeschung.md`](aufbewahrung-loeschung.md) — Aufbewahrung außerhalb der Warteschlange
- [`docs/datenmotor-restliste.md`](../datenmotor-restliste.md) — OP-30 und die übrigen offenen Punkte
