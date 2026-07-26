# Kostenmessung im Betrieb (Phase-1-Punkt 17)

**Stand:** 2026-07-26 · **Messung:** rein lesend gegen Production · **Kanonische Stelle
für Kostenwahrheit.** Ältere Kostenangaben in anderen Dokumenten sind nachrangig.

> **Kurz:** Helmut kann Kosten **pro Lauf** und **pro Kalendertag** belegen. Die
> bekannten Kosten sind klein (**~0,14 USD/Betriebstag**), aber sie sind eine
> **Untergrenze**, nicht der Gesamtwert — und die Preisbasis ist ein **unbelegter
> Schätzwert**. Beides steht unten belegt, statt kaschiert.

---

## 1 · Was gemessen wird — und was nicht

| Kostenart | Nutzungseinheit | gemessen? | Preis im Repo? | Deckel? |
|---|---|:--:|:--:|:--:|
| **OpenAI / Azure OpenAI** (einziger LLM-Provider) | Tokens | **ja** (Provider liefert Tokens, **keine** Kosten) | ja, aber **unbelegter Schätzwert** | ja (Aufrufzahl) |
| Supabase (Datenbank, Speicher, Requests) | Requests / Bytes | **nein** | nein | nein |
| Vercel (Function-Laufzeit, Bandbreite) | Invocations / GB-s | **nein** | nein | nein |
| Crawl-Ziele (Google News, Ministerien, PARDOK) | Requests / Volumen | Abrufe ja, **Volumen nein** | entfällt (unentgeltlich) | Mengengrenzen, keine Kostengrenze |
| DIP Bundestag | Requests | nein | entfällt (laut `dip.js` kostenlos) | nein |
| Web-Push | Nachrichten | nein | nein | nein |
| Mailversand | — | **existiert nicht** (`isMailConfigured()` gibt hart `false`) | — | — |

**Folge:** Eine Aussage „Helmut kostet heute X" ist nur für den LLM-Anteil belegbar.
Alle übrigen Anbieter sind **unbekannt, nicht null** — sie liegen vollständig
**außerhalb** jeder Deckelung.

## 2 · Wo die Daten liegen

| Quelle | Ort | Inhalt |
|---|---|---|
| `llmUsage` | `helmut_store['main-auth']` (JSON-Blob) | **die Kostenquelle**: je Aufruf Modell, Tokens, berechnete Kosten, Dauer, Erfolg |
| `processRuns` | `helmut_store['main-auth']` | Laufkennung, Start/Ende, Dauer, verarbeitete Einheiten |
| `crawlRuns` | `helmut_store['main']` | Crawl-Mengen je Lauf |
| `source_crawl_telemetry` | Supabase (13 081 Zeilen) | Abrufwege, Dokumente, Fehler **je Lauf** |
| `llm_budget_counters` | Supabase (12 Tageszeilen) | atomarer **Reservierungs**zähler je Tag |
| `llm_usage` (Tabelle) | Supabase | **0 Zeilen — wird nicht beschrieben.** Existiert seit `20260716`, der Schreibpfad geht in den Blob |

**Laufkennung:** `source_crawl_telemetry.run_id` und `processRuns.runId` tragen
**dieselbe** Kennung (z. B. `crawl-20260726160130-7bznw`). Bis zu diesem Sprint kam sie
im Kostenlog **nie** an (`runId` in 0 von 1 290 Einträgen). Jetzt wird sie durchgereicht.

## 3 · Gemessene Production-Zahlen (2026-07-26, rein lesend)

### 3.1 Gesamtbild des Nutzungslogs (2026-07-01 … 26)

| Größe | Wert |
|---|---|
| Einträge im Kostenlog | **2 493** |
| davon **echte Provideraufrufe** | **1 216** |
| davon ohne Provideraufruf (abgewiesen/übersprungen) | **1 277** → nachweislich 0,00 |
| Provideraufrufe **mit** bekannten Kosten | **1 189** |
| Provideraufrufe **ohne** Kostenwert (echte Messlücke) | **27** |
| Bekannte Kosten gesamt | **2,2295 USD** |
| Input-Tokens / Output-Tokens | **2 951 831** / **745 706** |
| Modelle | `gpt-5-mini` (alle bepreisten Aufrufe) |

### 3.2 Kosten je Betriebstag (7 volle Tage, 19.–25.07.)

| Größe | Wert |
|---|---|
| Mittel | **0,1370 USD/Tag** |
| Spanne | 0,1180 – 0,1504 USD |
| Summe 7 Tage | 0,9591 USD |
| Hochrechnung 30 Tage | **≈ 4,11 USD** |

Betriebsstand dabei: 1 Pilotmandat + 5 weitere aktive Profile, ~277 Rohdokumente/Tag.

### 3.3 Ein realer Lauf: `crawl-20260726160130-7bznw`

| Phase | Messwert |
|---|---|
| Crawl, Start | 2026-07-26 16:01:32 UTC, Spanne 32,7 s |
| Abrufwege geplant/ausgeführt | 147 · davon **145 ok**, **2 nicht ok** |
| Dokumente | **1 762 gefunden** · **940 neu** · 146 Dubletten · 616 verworfen · 0 Retries |
| Understanding (`understanding-eager`, gleiche Laufkennung) | Start 16:03:36, **96,0 s**, 24 Vorgänge verarbeitet, 66 zurückgestellt |
| **LLM** | **8 Aufrufe**, alle gemessen · 35 080 Input-, 9 017 Output-Tokens |
| **Kosten des Laufs** | **0,026805 USD** (berechnet, Preisbasis unbelegt) |
| Externe Providerkosten des Laufs | **unbekannt** (Crawl-Egress, DB, Hosting ungemessen) |

### 3.4 Global vs. mandantenspezifisch (gesamtes Log, gemessen)

| Zurechnung | Aufrufe | Kosten | Anteil |
|---|--:|--:|--:|
| **global** (`understanding`, `koTagsBackfill`) | 788 | 1,7621 USD | **79,0 %** |
| **direkt zurechenbar** (Kommunikation, Lage, Assessment) | 428 | 0,4674 USD | **21,0 %** |
| nicht zurechenbar | 0 | 0,0000 USD | 0 % |

**Vier Fünftel der Kosten sind geteilte Arbeit.** Sie einem Mandanten zuzurechnen wäre
frei erfunden — deshalb wird **nicht verteilt**, sondern nur die Bemessungsgrundlage
ausgewiesen. `tenantId` ist in **0 von 2 493** Einträgen gesetzt; die Zuordnung läuft
heute über `userId`/`politicianId`.

## 4 · Belegte Messlücken

| # | Befund | Beleg |
|---|---|---|
| **K-1** | **Kostenlog verliert Einträge.** Der Reservierungszähler liegt an **allen 12** gemessenen Tagen über der Zahl protokollierter Aufrufe (Σ 740 vs. 620, **≈ 16 %**). Ursache im Code benannt: `logLlmUsage` ist fire-and-forget und der Auth-Store ist ein JSON-Dokument mit Last-Write-Wins. **Bekannte Kosten sind eine Untergrenze.** | `storage.js:909-911`, `ai.js:447-454`; Vergleich `llm_budget_counters` ↔ `llmUsage` |
| **K-2** | **Preisbasis unbelegt.** Die Preistabelle ist im Code als „Schaetzwerte" deklariert, ohne Quelle, ohne Stand. Beträge sind **berechnet**, nicht vom Provider gemeldet. | `storage.js:553-568` |
| **K-3** | **Zusätzliche Tokenarten werden verworfen.** Gelesen werden nur `input_tokens`/`output_tokens`/`total_tokens`. `input_tokens_details.cached_tokens` und `output_tokens_details.reasoning_tokens` kommen im gesamten Repo **nicht vor** — obwohl aktiv Reasoning-Modelle gefahren werden. Zwischengespeicherte Eingaben sind billiger → die Rechnung ist an dieser Stelle eher zu hoch. | `storage.js:595-600` |
| **K-4** | **27 Provideraufrufe ohne Tokenmeldung** (fehlgeschlagene Aufrufe: Azure HTTP 404/401, `request-error`). Kosten dieser Aufrufe sind **unbekannt**, nicht null. | Kostenlog, `callType`-Aufschlüsselung |
| **K-5** | **Provider wird nie protokolliert.** Azure- und OpenAI-Aufrufe sind im Log nicht unterscheidbar, obwohl die Preistabelle OpenAI-Listenpreise abbildet und auf Azure-Deployments angewandt wird. | `buildLlmUsageRecord` schreibt kein `provider`-Feld |
| **K-6** | **Nicht-LLM-Provider vollständig ungemessen** (Supabase, Vercel, Crawl-Volumen, Push, DIP). | §1 |
| **K-7** | **Ringpuffer 5 000 Einträge.** Bei aktuell 2 493 noch keine Kürzung; ab 5 000 verliert der Kostenverlauf am Anfang stillschweigend Historie. | `storage.js` `writeAuthStore` |
| **K-8** | **`llm_usage`-Tabelle ist tot** (0 Zeilen). Ihre Spalten (`prompt_tokens`, `estimated_cost`, `source_id`, …) suggerieren eine relationale Kostenwahrheit, die es nicht gibt. | Production-Zählung |

## 5 · Kostenobergrenze — was der Deckel wirklich deckt

Der Tagesdeckel (`HELMUT_MAX_LLM_CALLS_PER_DAY`, Reserve
`HELMUT_LLM_RESERVE_UNDERSTANDING`) ist **atomar** und **fail-closed**: reserviert wird
per SQL-Funktion `helmut_reserve_llm_call` in **einem** `insert … on conflict … where`,
Postgres serialisiert konkurrierende Upserts über den Row-Lock. Ein ungültiger oder
gelöschter Grenzwert fällt auf ein Schutzlimit von 50 zurück, nicht auf „unbegrenzt".

**Was der Deckel NICHT leistet — ehrlich:**

1. **Er zählt Aufrufe, kein Geld.** 100 teure Aufrufe kosten ein Vielfaches von
   100 billigen. Eine Euro-Obergrenze existiert global **nicht**.
2. **Reservierungen werden nie freigegeben** — bewusst (`storage.js:919-922`), damit
   Retry-Stürme das Budget nicht umgehen können. Der Zähler misst damit
   **Reservierungen, keine bestätigten Kosten** und darf nicht als Kostenzahl gelesen
   werden. Ein Freigabe-/Bestätigungsschritt existiert nicht.
3. **Der Per-Mandant-Deckel ist AUS** (`HELMUT_TENANT_LLM_CAP`, gehört zu OP-03). Ein
   Mandant kann heute das gesamte Tagesbudget verbrauchen.
4. **Alle Nicht-LLM-Kosten liegen außerhalb** (§1) — offene Kostenexposition.

**Belegte Deckelwirkung:** am 2026-07-20 stand der Zähler auf **100/100**; im Kostenlog
finden sich für denselben Tag **34 Abweisungen** mit Grund `daily-llm-budget-reached`
(Kommunikation, Lage, Understanding) und **4 weitere** mit
`daily-llm-budget-reserved-for-understanding` — der Deckel **und** die
Understanding-Reserve haben real gegriffen, nicht nur theoretisch. Keine dieser 38
Abweisungen erzeugte Kosten (kein Provideraufruf).

## 6 · Was dieser Sprint geändert hat

1. **`lib/helmut/cost-model.js` (neu, rein, ohne I/O)** — der eine Ort, an dem aus
   Rohnutzung eine Kostenaussage wird. Trennt strikt
   `gemessen` / `kosten-unbekannt` / `kein-provideraufruf` und
   `global` / `direkt` / `nicht-zurechenbar`. Ein unbekannter Betrag wird **nie** zu 0.
2. **Laufkennung im Kostenlog.** `runId` wird vom Scheduler durch
   `runUnderstandingShadow` bis in den Nutzungseintrag durchgereicht. Kosten je Lauf
   sind damit **messbar** statt rekonstruiert. Der Altbestand bleibt rekonstruierbar
   (Zeitfenster) und wird als solcher **gekennzeichnet**.
3. **Preisherkunft deklariert.** `llmPriceProvenance()` sagt, worauf ein Betrag beruht.
   **Kein Preis wurde geändert oder erfunden** — der Betreiber belegt die Basis über
   `HELMUT_LLM_PRICE_SOURCE`/`HELMUT_LLM_PRICE_ASOF`.
4. **Unsichtbare Kosten sichtbar gemacht.** `/api/debug/pipeline-probe` verbrauchte
   echte Tokens **ohne** Reservierung **und ohne** Kostenlog. Der Aufruf wird jetzt als
   `callType: "pipeline-probe"` protokolliert; die Reservierung bleibt bewusst aus
   (eine Diagnose muss gerade bei erschöpftem Budget laufen).
5. **Betriebsbericht** in der bestehenden Admin-Ansicht „KI-Kosten": bekannte Kosten,
   unbekannte Anteile, abgewiesene Aufrufe, global vs. direkt, Kosten je Lauf,
   Budgetstatus in Betreibersprache.
6. **Neue Route** `GET /api/admin/stats/run-costs` (Admin-Rolle, rein lesend).

**Bewusst nicht geändert:** die Preiswerte · der Deckelmechanismus · die
Reservierungslogik · `source_crawl_telemetry` und die Pfad-Statusmaschine (Gebiet von
Punkt 16) · Crons · Flags · Quellen · Pakete · Production-Daten.

## 7 · Reproduktion

```bash
# Offline gegen einen Auszug (kein Netz, keine Secrets):
node scripts/kostenmessung-nachweis.js --fixture=<pfad.json> --tage=7 --laeufe=8

# Live gegen Production (rein lesend; braucht SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# aus der Umgebung — lokal aus der Shell, in einer Cloud-Sitzung aus den
# Claude-Code-Environment-Einstellungen; CLAUDE.md §4.9):
node scripts/kostenmessung-nachweis.js --tage=7 --laeufe=8
node scripts/kostenmessung-nachweis.js --json          # maschinenlesbar
```

Ohne gesetzte Secrets bricht das Skript **vor jedem Netzzugriff** mit Exit 2 ab.
Es führt ausschließlich `GET`-Anfragen aus und schreibt nichts.

### Verwendete lesende SQL-Abfragen

```sql
-- Tageskosten + Abgleich mit dem Reservierungszähler
with e as (select jsonb_array_elements(data->'llmUsage') as u
           from helmut_store where id='main-auth'),
n as (select left(u->>'createdAt',10) as tag,
        case when jsonb_typeof(u->'estimatedCost')='number'
             then (u->>'estimatedCost')::numeric end as cost,
        u->>'model' as modell
      from e)
select tag, count(*) filter (where modell not in ('none','unknown')) as provideraufrufe,
       count(cost) as gemessen, round(sum(cost),4) as bekannte_kosten_usd
from n group by tag order by tag desc;

select day, scope, used from llm_budget_counters order by day desc;

-- Mengen je Lauf
select run_id, count(*) as abrufwege, count(*) filter (where status='ok') as ok,
       sum(found_documents) as gefunden, sum(new_documents) as neu,
       sum(duplicate_documents) as dubletten, sum(ignored_documents) as verworfen
from source_crawl_telemetry group by run_id order by min(started_at) desc;
```

**Wichtig:** `promptTokens`/`estimatedCost` sind teils die **Zeichenkette** `"unknown"`.
Ein direkter `::numeric`-Cast bricht ab — deshalb überall der
`jsonb_typeof(...)='number'`-Wächter. Genau diese Falle ist der Grund, warum die
Altsummen im Code einen unbekannten Betrag als 0 verbuchen.

## 8 · Nächste sinnvolle Schritte

1. **K-1 schließen** (größter Hebel): den Kostenlog-Schreibpfad vom Last-Write-Wins-Blob
   auf die bereits existierende, leere Tabelle `llm_usage` umstellen. Schema, Spalten und
   Migration liegen vor; es fehlt nur der Schreibpfad. Danach ist der Zähler-Abgleich
   deckungsgleich und die Kosten sind ein Gesamtwert statt einer Untergrenze.
2. **K-2 schließen** (eine Betreiberhandlung, kein Code): `HELMUT_LLM_PRICE_SOURCE` und
   `HELMUT_LLM_PRICE_ASOF` aus einer echten Providerrechnung setzen und die Preiswerte
   gegen dieselbe Rechnung prüfen.
3. **K-3 schließen**: `input_tokens_details`/`output_tokens_details` mitlesen.
4. **Kosten je Mandant** werden erst nach OP-03 belastbar (`HELMUT_TENANT_LLM_CAP`,
   Migration `20260721`). Die Bemessungsgrundlage liegt vor; eine Verteilungsformel für
   die 79 % globalen Kosten braucht eine gemessene Bezugsgröße (z. B. je Mandant
   tatsächlich ausgelieferte Vorgänge) — die existiert noch nicht.
