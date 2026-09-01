# F9-Entscheidungsvorlage — Ankunftskennzahl vor dem Siebentagefenster (2026-08-29)

**Zweck:** Der Betreiber muss über die Production-Anwendung von **F9**
(`20260825101500_jobqueue_ankunftskennzahl.sql`) entscheiden, **bevor** der
Production-Stand für die sieben vollen grünen Tage eingefroren wird. Diese Vorlage
bereitet genau diese eine Entscheidung vor. Sie wendet nichts an.

## 1 · Was F9 ist

Eine **rein additive, rein lesende** SQL-Funktion `helmut_job_ankunft(p_seit_minuten)`:
zählt die im Fenster **eingereihten** Aufträge (`created_at`), liefert daneben den
vorhandenen Abfluss und das Abflussverhältnis. Keine Tabelle, kein Index, kein
Trigger, keine Änderung an `helmut_job_metrics` oder irgendeinem bestehenden Aufrufer.
Rechte wie `helmut_job_metrics`: nur `service_role`.

## 2 · Belegter Stand (29.08.2026)

| Ebene | Stand |
|---|---|
| Repository | auf `main` seit Merge PR #270, mit getrenntem Rollback (`rollback_20260825101500_…`) |
| Lokal | Datenbanksuiten vorhanden (`jobqueue-ankunft-datenbank-test.js`, Index-Test) |
| Isoliert (Testprojekt `ffzaxdbatoamsovncrym`) | **angewendet und lesend geprüft** (27.08., Z3b-Supabase-Testplan) |
| Production (`ddckuvvpcytqbyfmbvie`) | **nicht angewendet** (Migrationshistorie 29.08. gegengeprüft) |
| App-Code | **kein Aufrufer** — Betriebsstatus und `/api/ops/jobqueue` lesen `helmut_job_metrics` |

## 3 · Wozu F9 gebraucht wird — und wozu nicht

Das Grüntage-Kriterium 1 lautet **Abfluss ≥ Ankunft je vollem UTC-Tag**. Heute wird
die Ankunft in Production **nirgends** live gemessen; `helmut_job_metrics` liefert nur
den Abfluss.

- **Mit F9:** die Ankunft ist als eine RPC pro Lesung verfügbar — billig, live,
  unabhängig von der Tabellengröße; später direkt in `/api/ops/jobqueue` einbindbar
  (das wäre ein eigener, kleiner Code-PR).
- **Ohne F9:** die Ankunft ist trotzdem führbar — `scripts/gruentage-auswertung.js`
  (dieser Branch) rekonstruiert Ankunft/Abfluss je UTC-Tag rein lesend aus den
  `created_at`/`finished_at`-Spalten. Das genügt für 5–10 Mandate, liest dafür aber
  zeilenweise (heute ~3.300 Zeilen) und ist ein Werkzeug-, kein Betriebspfad.

F9 ist damit **keine Blocker-Migration** für das Fenster, aber der saubere
Betriebspfad — und die letzte Gelegenheit ist **vor dem Einfrieren**: jede relevante
Änderung danach setzt den Nachweis auf Tag 1 zurück.

## 4 · Risiken und Rückweg

| Punkt | Bewertung |
|---|---|
| Verhaltensrisiko | keines für bestehende Pfade: neue Funktion, kein Aufrufer ändert sich |
| Ausfallfenster | keines: additiv, eine Transaktion, kein DROP bestehender Objekte |
| Performance | `count(*)` über das Zeitfenster; auf heutigem Bestand (~3.330 Zeilen) unkritisch — dieselbe Größenordnung wie die bestehende Metrikfunktion |
| Rückweg | ein einzelnes `drop function` (`rollback_20260825101500_…`, getrennt gehalten) |
| Wechselwirkung Z22 | keine — andere Funktion, kein gemeinsamer Zustand |
| Fenster-Regel | Anwendung **während** eines laufenden Siebentagefensters würde es zurücksetzen ⇒ nur **vor** dem Einfrieren anwenden |

## 5 · Empfehlung

**F9 im selben Freigabezug wie das Parserfix-Deployment anwenden — als eigene,
getrennt erteilte Migrationsfreigabe, zeitlich vor dem Einfrieren des
Production-Standes.** Begründung entlang der Entscheidungskriterien: additiv und
trivial reversibel (Reversibilität), macht Kriterium 1 des Fensters live messbar
statt rekonstruiert (Korrektheit/Nachweisbarkeit), eine RPC statt Zeilenscan
(einfacher Betrieb, geringe Kosten). Die Alternative — Fenster ohne F9, Ankunft nur
über die Grüntage-Auswertung — bleibt gangbar und ist dann ausdrücklich als
Werkzeugweg zu dokumentieren.

**Diese Vorlage erteilt keine Freigabe.** Anwendung nur nach ausdrücklicher
Betreiberfreigabe, danach: Migrationsbuchung dokumentieren, rein lesende
Funktionsgegenprobe (Ankunft/Abfluss gegen direkte SQL-Zählung), Eintrag in
`CURRENT_STATE.md` §3.
