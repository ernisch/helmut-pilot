# Skalierung 25 / 50 / 100 Mandate — Kapazität, Kriterien, Nachweise, Aktivierungsplan

**Stand:** 2026-08-25 · **Ausgangscommit:** `24a895ed` (= `main`, Merge PR #269)
**Kanonische Stelle für die Skalierung auf 25/50/100.** Ältere Skalierungsdokumente bleiben
gültig für ihren jeweiligen Gegenstand:
[`skalierung-200-mandate.md`](skalierung-200-mandate.md) (Rechenmodell 200),
[`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md)
(Slot-Stufenplan 5→200),
[`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §14 (Stufe 2).

---

## 0 · Die fünf Zustände — strikt getrennt

Diese Datei verwendet ausschließlich diese Begriffe. Sie werden **nie** vermischt.

| # | Zustand | Bedeutung |
|---|---|---|
| **Z1** | technisch vorbereitet | Code, Werkzeuge und Tests existieren und sind lokal grün |
| **Z2** | mit synthetischer Last getestet | echter Motor, echte Datenbank, **Attrappen** für KI und Netz |
| **Z3** | mit realistischer Last getestet | echte Laufzeiten, echte Datenbankpfade, echte externe Dienste |
| **Z4** | für Aktivierung freigegeben | ausdrückliche Gründerfreigabe liegt vor |
| **Z5** | real in Production aktiv | Mandate sind angelegt und arbeiten |

**Ein Nachweis auf Z2 ist niemals ein Nachweis auf Z3, und Z3 ist niemals Z4.**

---

## 1 · Belegter Ausgangszustand (gemessen, 2026-08-25)

Rein lesende SELECTs gegen Production (Supabase `ddckuvvpcytqbyfmbvie`, PostgreSQL 17.6.1).
Keine Schreiboperation, kein `EXPLAIN ANALYZE`.

| Größe | Wert | Bewertung |
|---|---|---|
| aktive Mandate | **5** | Z5 für 5 Mandate |
| `helmut_jobs` / `helmut_job_outbox` | 1123 / 888 | deckt sich mit 1124→1123 bzw. 889→888 nach der Neutralisierung |
| Status `fehlgeschlagen` | **0** | `endgueltig_fehler = 0` |
| hängende Leases | **0** | |
| verwaiste Outbox-Zeilen | **0** | |
| Dubletten über `idempotency_key` | **0** | |
| neu / abgeschlossen in 24 h | **455 / 456** | Abfluss ≥ Ankunft |
| ältester fälliger Auftrag | **2,3 h** | < 24 h |

### 1.1 Arbeitsprofil (24 h, 5 Mandate)

| `job_type` | global | neu 24 h |
|---|---|---|
| `source_fetch` | ja | 338 |
| `document_understanding` | ja | 98 |
| `source_fetch` | nein | 9 |
| `briefing_materialization` | nein | 5 |
| `mandate_projection` | nein | 5 |

**Mandatsgebunden 19/Tag (3,8 je Mandat), global 436/Tag.**

---

## 2 · Kapazitätsmodell — an der Messung geeicht

`source_fetch`-Aufträge tragen `payload.beispielMandate`: Quellenabrufe sind über Mandate
**nachfrageaggregiert und dedupliziert**. Gemessen:

| Nachfrage je Quelle | distinkte Quellen |
|---|---|
| von **allen 5** Mandaten (geteilt) | **139** |
| von **genau 1** Mandat (mandatsspezifisch) | **30** ⇒ 6 je Mandat |

Jede Quelle wird **2×/Tag** abgerufen (crawl 04:00 + 20:00 UTC).

```
source_fetch/Tag       = (139 + 6 × M) × 2
document_understanding = source_fetch × 0,29     (gemessen 98/338)
mandatsgebunden/Tag    = 3,8 × M                 (gemessen 19/5)
```

**Eichprobe:** für M = 5 liefert die Formel `(139 + 30) × 2 = 338`; gemessen sind **exakt 338**.

| Mandate | source_fetch | verstehen | mandatsgeb. | **Gesamt/Tag** | Minuten/Tag¹ | Slots à 117¹ |
|---:|---:|---:|---:|---:|---:|---:|
| 5 (gemessen) | 338 | 98 | 19 | **455** | 17 | 3,9 |
| 25 | 578 | 168 | 95 | **841** | 31 | 7,2 |
| 50 | 878 | 255 | 190 | **1323** | 49 | 11,3 |
| 100 | 1478 | 429 | 380 | **2287** | 84 | 19,5 |

¹ Grundlage: **27,1 Abschlüsse/min** (117 in 259 s, Runbook §30.7, Worker 4/25/25).

**Kernaussage:** der Motor skaliert **unterlinear** — 20× Mandate ergeben nur **5,0×** Arbeit,
weil 139 Quellen geteilt bleiben. Der Engpass ist nicht der Durchsatz, sondern die
**Anzahl der Slots** und der **KI-Tagesdeckel**.

---

## 3 · Abnahmekriterien — VOR dem ersten Lasttest festgeschrieben

> **Diese Kriterien wurden vor dem ersten Lauf festgelegt und werden nach einem Ergebnis
> nicht rückwirkend geändert.** Sie sind in einem eigenen Commit festgehalten, der dem
> Ergebniscommit vorausgeht.

### 3.1 Herleitung der Zeitgrenze

- reguläres Zeitfenster je Slot: `maxDuration` = **300 s** (`vercel.json`), Arbeitsbudget der
  schweren Crons **240–280 s**
- Sicherheitsreserve: der Lauf muss in **≤ 70 %** des Slotbudgets fertig sein
- erwarteter Durchsatz je Stufe aus §2

### 3.2 Verbindliche Kriterien (gelten für jede Stufe 25 / 50 / 100)

| # | Kriterium | Grenze |
|---|---|---|
| K1 | alle erwarteten Testaufträge eindeutig verbucht | Soll = Ist, exakt |
| K2 | Quittung und tatsächliche Verarbeitung deckungsgleich | Differenz 0 |
| K3 | unerwartete endgültige Fehler | **0** (absichtliche Fehler des Fehlermandats zählen nicht) |
| K4 | unbekannte Vorgänge | **0** |
| K5 | hängende Leases nach Laufende | **0** |
| K6 | Dubletten (doppelt erledigte Aufträge, doppelte `idempotency_key`) | **0** |
| K7 | mandatsfremde Lese-/Schreibzugriffe | **0** |
| K8 | verwaiste Outbox-Einträge | **0** |
| K9 | kein gesundes Mandat verhungert | jedes gesunde Mandat ≥ 1 Abschluss |
| K10 | Rückstau wächst nicht dauerhaft | Abfluss ≥ Ankunft über den Lauf |
| K11 | begrenzter Rückstau wird abgebaut | Restbestand nach Aufräumlauf = 0 |
| K12 | Laufzeit / Parallelität / DB-Verbindungen unter den Grenzen | Laufzeit ≤ 70 % Slotbudget; Verbindungen ≤ 50 % `max_connections` |
| K13 | fehlerhaftes Mandat beeinträchtigt gesunde nicht | gesunde Mandate 100 % abgeschlossen |
| K14 | Wiederaufnahme/Wiederholung ohne Doppelverarbeitung | jeder Auftrag genau 1× `erledigt` |
| K15 | Kosten innerhalb der dokumentierten Obergrenze | Attrappen ⇒ 0 KI-Aufrufe, 0 USD |

### 3.3 Stufenregel

Die nächste **nicht produktive** Teststufe wird nur ausgeführt, wenn die vorherige Stufe
**vollständig** bestanden ist. Das ist **keine** Freigabe für eine Production-Aktivierung (Z4).

---

## 4 · Testergebnisse

> Wird nach der Ausführung eingetragen. Bis dahin: **nicht erbracht.**

---

## 5 · Kostenrechnung

Preisquelle: offizielle OpenAI-Preisseiten, Abruf **2026-08-25**
(`https://developers.openai.com/api/docs/pricing` und die Modellseiten).
**Einschränkung, ehrlich:** der direkte Seitenabruf ist aus dieser Sitzung egress-gesperrt;
die Werte stammen aus Suchtreffern, die auf die offiziellen Anbieterdomains beschränkt waren —
**belegt, aber nicht eigenhändig geöffnet**. Die Azure-Preisseite war **nicht** erreichbar.

| Modell | Eingabe $/1M | Ausgabe $/1M | Rolle |
|---|--:|--:|---|
| `gpt-5-mini` | 0,25 | 2,00 | Verstehen; in Production laut Kostenlog **alle** bepreisten Aufrufe |
| `gpt-5.5` | 5,00 | 30,00 | Standardmodell im OpenAI-Direktpfad (`ai.js:8`) |
| `gpt-4.1` | 2,00 | 8,00 | Rückfall bei HTTP 400 |

### 5.1 Szenarien (Modell `gpt-5-mini`)

| Mandate | Szenario | Aufrufe/Tag | **USD/Monat** | Belegqualität |
|---:|---|---:|---:|---|
| 25 | niedrig | 113 | **6,36** | BERECHNET aus gemessenen Tokens |
| 25 | realistisch | 198 | **15,12** | ANGENOMMEN |
| 25 | hoch | 336 | **33,77** | ANGENOMMEN + 16 % Logverlust |
| 50 | niedrig | 160 | **9,00** | BERECHNET |
| 50 | realistisch | 268 | **21,22** | ANGENOMMEN |
| 50 | hoch | 444 | **44,63** | ANGENOMMEN |
| 100 | niedrig | 251 | **14,12** | BERECHNET |
| 100 | realistisch | 399 | **32,78** | ANGENOMMEN |
| 100 | hoch | 647 | **65,03** | ANGENOMMEN |

**Einziger Ist-Wert:** heute 5–6 Mandate → **0,1370 USD/Tag** ≈ 4,11 USD/Monat
([`kostenmessung.md`](kostenmessung.md) §3.2). Die Szenarien klammern diesen Wert ein.

### 5.2 Zwei Kostenbefunde, die eine Betreiberentscheidung brauchen

1. **Der KI-Tagesdeckel ist kein Kostenproblem, sondern eine Einstellung.** Gesamtdeckel
   **100** Aufrufe/Tag (davon 30 fürs Verstehen reserviert ⇒ höchstens 70 für alles andere).
   Schon **25 Mandate brauchen im günstigsten Fall 113 Aufrufe/Tag**. Gleichzeitig kosten
   350 Aufrufe/Tag **unter 1,20 USD**. Der Deckel drosselt fail-closed — er kostet Wirkung,
   nicht Geld. → Anhebung ist eine Freigabeentscheidung (`CLAUDE.md` §5).
2. **Die Preisbasis im Code ist ausdrücklich unbelegt.** `llmPriceProvenance()` meldet
   dauerhaft `unbelegt-schaetzwert`, solange `HELMUT_LLM_PRICE_SOURCE` fehlt
   (`storage.js:990-1009`). Zusätzlich weicht der hinterlegte `gpt-5.5`-Preis
   (1,25/10,00) vom offiziellen (5,00/30,00) ab. **Dieser Sprint ändert die Preistabelle
   bewusst NICHT** — der Codekommentar erklärt ausdrücklich, dass ein aus zweiter Hand
   gesetzter Preis schlechter wäre als ein deklarierter Schätzwert. Richtige Behebung:
   der Betreiber setzt `HELMUT_LLM_PRICE_JSON` + `HELMUT_LLM_PRICE_SOURCE` +
   `HELMUT_LLM_PRICE_ASOF` aus einer echten Rechnung. Solange das offen ist, ist jeder
   Betrag oben eine **Größenordnung, kein Rechnungsbetrag**.

---

## 6 · Plattformgrenzen

| Grenze | Wert | Quelle | Abruf |
|---|---|---|---|
| Vercel-Tarif Team `nohut` | **Pro** | Vercel-API `list_teams` → `plan: "pro"` | 2026-08-25 |
| `maxDuration` konfiguriert | **300 s** | `vercel.json:6` | — |
| Cron-Einträge konfiguriert | **11** | `vercel.json` | — |
| Supabase-Plan | **Free** | [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 | — |
| Production-Postgres | **17.6.1** | Supabase-API | 2026-08-25 |

**Der wichtigste bisher übersehene Hebel:** `maxDuration` = 300 s ist eine **Konfiguration im
Repository**, keine Plattformgrenze. Auf dem **Pro**-Tarif sind höhere Werte möglich
(vgl. [`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §80-82: Pro
bis 800 s). Das wäre ein Faktor auf das Slotbudget **ohne Architekturänderung und ohne
Ereignis-Antrieb**. Vor einer Nutzung ist der genaue heute gültige Grenzwert des Tarifs beim
Anbieter zu bestätigen — er ist hier **nicht** eigenhändig verifiziert.

---

## 7 · Bekannte Risiken

| # | Risiko | Stufe | Bewertung |
|---|---|---|---|
| R1 | KI-Tagesdeckel 100 trägt keine Stufe | 25/50/100 | **blockierend**, Freigabeentscheidung |
| R2 | Slot-Anzahl: 19,5 nötig bei 100, ~11 schwere Slots vorhanden | 50/100 | hoch |
| R3 | Supabase Free: 500-MB-Grenze nicht überwacht; Überschreitung ⇒ Read-only | 25/50/100 | hoch |
| R4 | kein PITR/Backup (OP-01) | alle | hoch, Kostenentscheidung |
| R5 | keine automatische Aufbewahrung: `helmut_jobs`/`helmut_job_outbox` wachsen unbegrenzt | 25/50/100 | hoch |
| R6 | Google-Klumpenrisiko 146/163 Wege (OP-15) | alle | bestehend |
| R7 | `HELMUT_CRAWL_RUN_RETENTION=36` reicht nur für n=5 | 25/50/100 | mittel, Betreiberaktion |
| R8 | Morgenlage im Direktpfad: ~28 Mandate je Lauf sind die Obergrenze | 50/100 | hoch |

---

## 8 · Aktivierungsplan für echte Mandate

**Keine Stufe gibt automatisch die nächste frei. Jede Stufe braucht eine eigene
ausdrückliche Gründerfreigabe.**

### Stufe A · 5 → 25

1. **Vorprüfung:** siebentägiger Nachweis des echten Warteschlangenbetriebs mit fünf
   Mandaten bestanden (Stufe 2 nach Zielarchitektur §14: Abfluss ≥ Ankunft über 7 Tage,
   0 Verlust, 0 Doppelarbeit, Wartezeit < 24 h). **Heute nicht begonnen.**
2. **Vollständige Mandatsdaten:** 20 Profile amtlich bestätigt, `aktiv: false`, nicht
   importiert. Berliner Wahl **20.09.2026** — die zehn Berliner Profile gelten nur für die
   19. WP; danach erneute Prüfung.
3. **Ausdrückliche Gründerfreigabe** für Import **und** getrennt für Aktivierung.
4. **KI-Deckel vorher anheben** (R1) — sonst ist die Aktivierung wirkungslos.
5. **Begrenzte Aktivierung:** in Tranchen, nicht 20 auf einmal.
6. **Rein lesende Wirkungskontrolle:** Briefings je Mandat, `endgueltig_fehler`, Leases,
   Rückstauentwicklung über mindestens drei Tage.
7. **Stopkriterien:** `endgueltig_fehler > 0` · hängende Leases > 0 · Rückstau wächst zwei
   Tage in Folge · ein Mandat ohne Briefing · Datenbank über 350 MB.
8. **Rückfallweg:** betroffene Profile auf `aktiv: false` setzen (Betreiberaktion); der
   Motor bleibt unverändert. Kein Code-Rollback nötig.

### Stufe B · 25 → 50

Zusätzlich zu A: **R8 muss vorher gelöst sein** (Morgenlage über die Warteschlange:
Migration `20260809_jobqueue_narrativ.sql` freigeben und anwenden, dann
`HELMUT_NARRATIV_QUEUE=on`) — sonst bleiben ab ~28 Mandaten Mandate systematisch ohne
Morgenlage. Außerdem: Aufbewahrung (R5) scharf, `HELMUT_CRAWL_RUN_RETENTION` angehoben (R7).

### Stufe C · 50 → 100

Zusätzlich zu B: Slot-Kapazität (R2) belegt erhöht — entweder mehr Slots, höhere
`maxDuration` (Pro-Tarif, §6) oder Ereignis-Antrieb. Supabase-Plan entschieden (R3/R4:
500-MB-Grenze und PITR). **Ohne diese drei Punkte ist 100 nicht betreibbar.**

---

## 9 · Stopkriterien für jeden Lasttest

Ein Lauf wird sofort abgebrochen und gilt als **nicht bestanden**, wenn eines eintritt:

- ein Kriterium aus §3.2 verletzt
- der Lauf schreibt gegen eine andere Datenbank als die lokale Testdatenbank
- Produktionskennungen sind in der Prozessumgebung sichtbar
- die Laufzeit überschreitet das doppelte Slotbudget

---

## 10 · Noch erforderliche Freigaben

| # | Freigabe | Wer | blockiert |
|---|---|---|---|
| F1 | KI-Tagesdeckel anheben (350/450/700 je Stufe) | Gründer | jede Stufe |
| F2 | Import der 20 Profile | Gründer | Stufe A |
| F3 | Aktivierung je Tranche (getrennt von F2) | Gründer | Stufe A |
| F4 | Siebentägiger Fünfernachweis starten | Betreiber | Stufe A |
| F5 | Supabase Pro (PITR, 500-MB-Grenze) | Gründer, Kosten | Stufe C |
| F6 | Migration `20260809_jobqueue_narrativ.sql` anwenden | Gründer | Stufe B |
| F7 | Preisbasis aus echter Rechnung belegen | Betreiber | ehrliche Kostenangabe |
| F8 | Realistischer Belastungsnachweis (Z3) | Gründer, Kosten | Z3 überhaupt |
