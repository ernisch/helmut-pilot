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

**In welche Richtung das Modell irrt (wichtig für die Bewertung):** die 6 mandatsspezifischen
Quellen je Mandat stammen aus den 30 Quellen, die heute von **genau einem** der fünf Mandate
nachgefragt werden. Mit wachsender Mandatszahl werden einige davon zwangsläufig **geteilt**
(gleicher Ausschuss, gleiche Partei, gleiches Bundesland) und fallen aus dem
mandatsspezifischen Anteil heraus. Die 6 sind deshalb eine **Obergrenze**, und die
Hochrechnung **überschätzt** die Arbeit eher, als sie zu unterschätzen. Der Lasttest bestätigt
die Richtung unabhängig: der Planer erzeugt für 100 Mandate nur 490 statt der linear
fortgeschriebenen 593 `source_fetch` (§4.2).

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

### 4.1 Gestufter Belastungsnachweis — **Zustand Z2 (synthetisch)**

Werkzeug: `scripts/skalierung-stufen-lasttest.js`, ausgeführt am 2026-08-25 über
`scripts/lokal.js` gegen eine **lokale** PostgreSQL 16.13 (127.0.0.1:5433).

**Was echt war:** der Arbeitsplan aus dem Produktionscode (`planeArbeit` →
`kompiliereQuellenbedarf` + `planeMandatsarbeit`), die echten Migrationen, echte
Workerprozesse (eigener Node-Prozess, eigene Verbindung, eigener Lease-Besitzer, echter
`arbeite()`-Aufruf, echte Leases und Fencing), ein echtes Fehlermandat und ein echtes
langsames Mandat.

**Was Attrappe war:** die Aufgabenhandler. Kein Netzverkehr, kein Google-Abruf, kein
KI-Aufruf. **Damit ist dies ein synthetischer Nachweis (Z2), kein realistischer (Z3).**

**Ergebnis: 60 PASS / 0 FAIL über alle drei Stufen.**

| Mandate | Aufträge | Laufzeit | Durchsatz | erledigt | endgült. Fehler | Rest | häng. Leases | Verbindungen (Spitze, **lokal**) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 25 | 244 | 463 ms | 522,7/s | 242 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |
| 50 | 427 | 442 ms | 961,5/s | 425 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |
| 100 | 690 | 660 ms | 1042,4/s | 688 | 2 (Fehlermandat) | 0 | 0 | 5 / 300 |

**Fairness:** in allen drei Stufen hatten **alle** gesunden Mandate exakt gleich viele
Abschlüsse (min = max = 4). Kein Mandat verhungert.

**Fehlermandat und langsames Mandat:** das Fehlermandat scheiterte bei jedem Versuch und
erreichte nach den Wiederholungen den Endzustand `fehlgeschlagen` (K13b, die Probe war also
wirksam). Die gesunden Mandate waren dennoch **nach dem Hauptlauf vollständig** abgearbeitet
(K13) — ein krankes Mandat hält die gesunden nicht auf.

**Determinismus belegt — auf zwei Ebenen:**

1. **Der Plan.** Drei unabhängige Planungsläufe für 25 Mandate ergaben je **244 Aufträge**
   mit identischer SHA-256-Summe der sortierten Idempotenzschlüssel (`b7e397b0db3113f3`).
   Die Fixture `synthetische-mandate-1000.js` benutzt kein `Math.random`.
2. **Der ganze Lauf.** Ein **zweiter vollständiger Durchlauf** aller drei Stufen ergab
   erneut **60 PASS / 0 FAIL** mit **identischen** Mengen und Ergebnissen —
   244/427/690 Aufträge, 242/425/688 erledigt, je 2 endgültige Fehler (Fehlermandat),
   0 Rest, 0 hängende Leases, Verbindungsspitze 5/300. Abweichend waren **nur die
   Laufzeiten** (423/534/549 ms gegen 463/442/660 ms) — erwartbar, weil parallel die
   Offline-Gesamtsuite lief. Der Nachweis ist also **wiederholbar, nicht einmalig**.

### 4.2 Zweite, unabhängige Bestätigung der Unterlinearität

Der Planer erzeugt für 25 / 50 / 100 Mandate **194 / 327 / 490** `source_fetch`-Aufträge.
Eine Verdopplung der Mandate erhöht die Abrufe nur um Faktor 1,69 bzw. 1,50 — dieselbe
Dedup-Wirkung, die §2 aus den Production-Daten misst, hier unabhängig aus dem Planer.

### 4.3 Was diese Zahlen **nicht** sagen

Nachgeschärft nach Review 2026-08-25/2 — drei Grenzen, die vorher zu weit formuliert waren:

1. **Die Laufzeiten messen die LOKALE Mechanik, nicht die Wirklichkeit.** In Production
   dominieren die externen Abrufe: der reale Wirkungslauf brauchte **259 s für 117
   Abschlüsse** (0,45/s) — rund **2 300-mal langsamer**. Über die Gesamtdauer eines echten
   Tageslaufs sagt der Test nichts.
2. **Die Verbindungsspitze 5/300 ist ein LOKALER Messwert** einer selbst gestarteten
   PostgreSQL 16 mit `max_connections=300`. Sie ist **kein Supabase-Grenzwert** und **keine
   Aussage über den Pooler des Free-Plans**. Production spricht über PostgREST/HTTP mit
   PostgreSQL 17.6.1 und ganz anderen Verbindungsgrenzen — die hier **nicht** gemessen wurden.
3. **Der Test beweist NICHT, dass Supabase unter realistischer Production-Last kein Engpass
   wird.** Bewiesen ist ausschließlich: *die Warteschlangenmechanik selbst* — Reservieren,
   Lease, Fencing, Abschluss, Nebenläufigkeit — trägt bis 100 Mandate gegen eine lokale
   Datenbank. Ob der Supabase-Free-Plan die dabei entstehenden Abfragen, Verbindungen und
   Datenmengen trägt, ist **offen** und gehört zum realistischen Nachweis (Z3).

Die frühere Formulierung „Warteschlange und Datenbank sind bis 100 Mandate nicht der
Engpass" ging über die Belege hinaus und ist **zurückgenommen**.

### 4.4 Provisionierung

`scripts/provision-stapel-test.js` — **42 PASS / 0 FAIL**. Abgedeckt: Wiederholungslauf ohne
Feldverlust, keine stille Reaktivierung, Vorprüfung des ganzen Pakets (unvollständig,
doppelte id, doppelte E-Mail, leeres Paket), Trockenlauf ohne Schreibvorgang, zweiter
identischer Stapellauf ohne Dubletten, fehlerhaftes Mandat ohne Teilzustand,
`weiterBeiFehler`, Mandantentrennung.

Bestandssuiten unverändert grün: `provision-tenant-test.js` 41 PASS,
`profil-bereitschaft-test.js` 91 PASS, `jobqueue-lasttest.js` 19 PASS (inkl. SIGKILL-Probe).

### 4.7 Gesamtlauf

**`node scripts/lokal.js -- node scripts/run-offline-tests.js` → 279/279 Suiten grün in 729 s,
0 FAIL, 0 SKIP.** Das sind die 277 Bestandssuiten plus die zwei neuen dieses Sprints.
Darin ausdrücklich grün: alle vier vormals roten Befunde (`privacy-vollstaendigkeit`,
`profile-db`, `provision-tenant`, `tenant-neutrality`).

**Ehrlich zur Einordnung:** `jobqueue-ankunft-datenbank-test.js` läuft im kanonischen Lauf
in **79 ms** — das ist der saubere Übersprung, weil dort kein PostgreSQL-Server gesetzt ist.
Sein eigentlicher Nachweis (24 PASS, §4.6) wurde getrennt **mit** echter PostgreSQL geführt.
Dasselbe gilt für alle `*-datenbank-test.js`-Suiten; der kanonische Lauf ist bewusst
DB-frei (so läuft auch die CI).

**Zwei Zwischenläufe waren rot und sind es nicht mehr — beide aus Umgebungsgründen, nicht
aus Codegründen:**
- `kalender-ics` und `lambda-paket` scheiterten, weil in dieser Sitzung **`node_modules`
  fehlte** (`npm ci` war nie gelaufen). Nach der Installation grün.
- `quellen-mehrfachabruf` scheiterte an einer **zeitabhängigen** Zusicherung
  (1304 ms gegen 1339 ms), während parallel der Lasttest lief. Ohne Konkurrenzlast grün.
- `vorgangskontext` §8.8a schlug an, weil die neue Migration nicht in der Allowlist stand.
  Das ist die **vorgesehene Wirkung** dieser Prüfung: jede fremde Migration muss ausdrücklich
  mit Begründung deklariert werden. Nachgetragen; die inhaltliche Gegenprüfung 8.8b war und
  bleibt grün.

### 4.5 Zwei echte Produktfehler in der Provisionierung — behoben

Beide betrafen genau die geforderte Zusicherung „ein zweiter identischer
Provisionierungslauf erzeugt keine Dubletten **und keine unbeabsichtigten Änderungen**".

1. **Feldverlust bei Wiederholung.** `buildProfile` erzeugt 13 Felder, `toMandateProfileRow`
   schreibt jede Spalte, der Upsert ersetzt die Zeile vollständig — ein zweiter Lauf löschte
   damit alle nachträglich gepflegten Felder (`regionale_interessen`,
   `relevante_ministerien`, `namensvarianten`, `regierungsrolle`, `themen_prioritaeten`,
   `profil_extras`). Behoben durch `mergeMitBestand`: **was die Spec nicht trägt, behält
   seinen Bestandswert.**
2. **Stille Reaktivierung.** `profileActive: true` war fest gesetzt; ein Wiederholungslauf
   aktivierte damit ein deaktiviertes Mandat wieder und umging faktisch die
   Aktivierungsfreigabe (`CLAUDE.md` §5). Jetzt gewinnt der Bestandswert — und das
   Zusammenspiel ist sogar **fail-closed**: der Lauf bricht mit `profile-not-ready` ab und
   verändert das Mandat überhaupt nicht. Eine Reaktivierung verlangt ausdrücklich
   `reaktivieren: true`.

Zusätzlich: nach dem Anlegen eines Auth-Nutzers wird der persistierte Stand
zurückgeprüft (`CLAUDE.md` §4.10) — der Auth-Speicher wird als ganzer Blob unbedingt
geschrieben, was bei einem Stapel über 25/50/100 Mandate ein realer Rennfall ist.

### 4.6 Beobachtbarkeit: die fehlende Ankunftskennzahl — vorbereitet, nicht angewendet

**Befund:** die verbindliche Freigabebedingung der Stufe 2 lautet „**Abfluss ≥ Ankunft**
über 7 Tage". Die vorhandene `helmut_job_metrics` liefert den **Abfluss**
(`erledigt_im_zeitraum`), aber **keine Ankunft**. Der siebentägige Fünfernachweis ist
damit heute **gar nicht messbar** — nicht, weil er scheitern würde, sondern weil eine
Seite der Ungleichung nirgends erhoben wird.

**Vorbereitet:** `supabase/migrations/20260825101500_jobqueue_ankunftskennzahl.sql` legt
eine **neue, rein lesende** Funktion `helmut_job_ankunft(p_seit_minuten)` an
(Ankunft, Abfluss, Abflussverhältnis, Fenster). Rollback-SQL liegt im selben Verzeichnis.

**Warum eine neue Funktion statt einer Erweiterung:** eine zusätzliche Spalte in einer
`returns table`-Funktion erzwingt in PostgreSQL ein DROP + CREATE — ein Eingriff in eine
Funktion, die Production laufend liest, mit einem Fenster, in dem sie nicht existiert.
Die neue Funktion daneben hat denselben Nutzen ohne dieses Risiko: **kein bestehender
Aufrufer ändert sich, keine bestehende Signatur wird angefasst.**

**Nachweis:** `scripts/jobqueue-ankunft-datenbank-test.js` — **24 PASS / 0 FAIL** gegen
echte PostgreSQL 16: Migration additiv, wiederholbar, Rechte wie `helmut_job_metrics`
(nichts für `anon`/`authenticated`/`public`), Datensparsamkeit, Zeitfenster wirkt,
Rollback ohne Datenverlust und idempotent. Bei leerer Warteschlange meldet das Verhältnis
**`null` (unbestimmt)**, nicht `0` — eine `0` wäre ein falsches Alarmsignal.

> **Die Migration ist NICHT angewendet.** Anwendung gegen Production ist freigabepflichtig
> (`CLAUDE.md` §5) und in §10 als **F9** geführt.

---

## 4.8 · Die 139 Befundlücken — ehrliche Einordnung

Die rein lesende Prüfung (zwölf Aufträge) hat **139 Lücken** erhoben:
**28 kritisch · 47 hoch · 44 mittel · 20 niedrig**. Dieser Sprint hat sie **nicht alle
geschlossen** — er hat sie erhoben und einen kleinen, klar begrenzten Teil behoben.

### Geschlossen (in diesem PR belegt)

| Lücke | Nachweis |
|---|---|
| Kein Stapelpfad für viele Mandate | `provision-stapel-test.js` |
| Wiederholungslauf löscht gepflegte Profilfelder | `provision-stapel-test.js` §1 |
| Wiederholungslauf reaktiviert still ein deaktiviertes Mandat | §2 |
| Auth-Blob ohne Erfolgsprüfung gegen die Ablage | §11 |
| Halber Zustand nach fehlgeschlagener Auth-Kontrolle | §11 *(Review 2)* |
| Falsches Grün im Trockenlauf | §9 *(Review 2)* |
| Trockenlauf sagt Konto-/E-Mail-/Deaktivierungskonflikte nicht voraus | §10 *(Review 2)* |
| `service_role` ohne EXECUTE auf der neuen Funktion | `jobqueue-ankunft-datenbank-test.js` §6 *(Review 2)* |
| Vier vermeintliche Testbefunde (Ursache falsch dokumentiert) | Bisektion + CI 279/279 |
| `CURRENT_STATE` nach dem Merge von PR #269 veraltet | §2/§14 berichtigt |
| Doku-Drift: 9 statt 11 Crons, falscher Modell-Default | `workerbetrieb.md`, `env-inventar.md` |

**Vorbereitet, aber nicht wirksam:** die fehlende Ankunftskennzahl. Migration liegt vor und
ist lokal belegt, ist aber **nicht angewendet** (F9) — die Lücke bleibt bis dahin offen.

### Weiterhin blockierend (entscheidungsrelevant)

| # | Lücke | Blockiert |
|---|---|---|
| R1 | KI-Tagesdeckel 100 trägt keine Stufe | jede Aktivierung |
| — | Siebentägiger Fünfernachweis nicht begonnen | Stufe A |
| F9 | Ankunftskennzahl nicht angewendet ⇒ Nachweis nicht messbar | Stufe A |
| R2 | Slot-Anzahl (19,5 nötig bei 100, ~11 schwere vorhanden) | Stufe B/C |
| R8 | Morgenlage im Direktpfad: ~28 Mandate je Lauf | Stufe B/C |
| R5 | keine automatische Aufbewahrung (`helmut_jobs` wächst unbegrenzt) | Stufe B/C |
| R3/R4 | Supabase 500-MB-Grenze unüberwacht, kein PITR | Stufe C |
| — | Berlin/Brandenburg: Landesmodule inaktiv, Seeds nicht eingespielt | Stufe A (BE/BB-Profile) |
| — | Migration `20260720` offen (OP-03) | Zweitmandant |

### Nicht blockierend

Der verbleibende Rest — im Wesentlichen die Stufen *mittel* und *niedrig* sowie ein Teil der
*hohen* — betrifft Härtung, Beobachtbarkeit und Dokumentation (z. B. fehlende Teilindizes,
ungedeckelte Outbox-Zweige, Ringspeicher im Auth-Blob, Fairness-Rotation, Doppelpfad über
`POST /api/admin/users`). Sie sind in den Prüfberichten mit Datei und Zeile erfasst.

> **Ehrlich zur Methode:** diese Einordnung ist **nicht** eine einzeln nachgeprüfte Triage
> aller 139 Punkte. Geschlossen und blockierend sind namentlich belegt; der Rest ist nach
> der Schwere-Einstufung der Prüfberichte eingeordnet und **nicht erneut verifiziert**.
> Wer eine belastbare Vollständigkeitsaussage braucht, muss die Restliste einzeln abarbeiten.

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

> **Korrektur nach Review 2026-08-25/2:** Die Beträge **15 / 21 / 33 USD im Monat**
> (25/50/100, Spalte „realistisch") sind **angenommene Szenarien, keine gemessenen
> Monatswerte**. Sie beruhen auf einem angenommenen Aufruffaktor und angenommenen
> Tokenmengen je Aufruf; offiziell belegt sind nur die Preise, gemessen ist nur die
> Vergleichszeile unten. Als „Kosten" dürfen sie erst gelten, wenn F7 erfüllt ist —
> bis dahin sind es **Größenordnungen**.

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

**Ein möglicher Hebel — ausdrücklich UNBESTÄTIGT:** `maxDuration` = 300 s ist eine
**Konfiguration im Repository**. Die Projektdokumentation nennt für den Pro-Tarif höhere
Werte ([`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) §80-82:
bis 800 s).

> **Korrektur nach Review 2026-08-25/2:** Eine Laufzeit über 300 s darf **erst dann als
> verfügbar gelten, wenn Fluid Compute für genau dieses Projekt rein lesend bestätigt ist.**
> Das ist es **nicht**. Die Vercel-Projekt-API (`get_project` für `helmut-pilot`) liefert
> `nodeVersion`, `framework`, Domains und das letzte Deployment — **kein Feld zu Fluid
> Compute und keines zur maximal zulässigen Laufzeit**. Der Hebel ist damit eine
> **Hypothese, kein Beleg**, und trägt keine Kapazitätsplanung. Belegt ist ausschließlich
> der Tarif (`plan: "pro"`). Prüfweg: Betreiber liest im Vercel-Dashboard unter
> Settings → Functions nach und trägt das Ergebnis ins Env-Inventar ein.

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
   0 Verlust, 0 Doppelarbeit, Wartezeit < 24 h). **Heute nicht begonnen — und ohne die
   Ankunftskennzahl (§4.6, F9) auch nicht messbar.**
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
| F9 | Migration `20260825101500_jobqueue_ankunftskennzahl.sql` anwenden | Gründer | Messbarkeit des 7-Tage-Nachweises (F4) |
