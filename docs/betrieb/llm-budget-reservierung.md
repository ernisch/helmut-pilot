# LLM-Budget: Atomare Call-Reservierung (Race-Fix 2026-07)

## Der Befund (verifiziert, F5)

1. Das Budget-Gate (`canSpendLlm`) war **Read-then-Decide**: erst Zählerstand aus dem
   `llmUsage`-Log lesen, dann entscheiden — der Log-Eintrag (`recordLlmUsage`) folgt
   erst **nach** dem Modellaufruf. Parallele Requests lesen denselben alten Stand und
   werden gleichzeitig freigegeben (belegt: bei Zählerstand 20 wurde 1 zusätzlicher
   Call zugelassen; die theoretische Überschreitung wächst mit der Zahl paralleler
   Vercel-Invocations, ein hartes Maximum gibt es nicht).
2. Verschärfend: der Auth-Store ist **ein** JSON-Dokument mit Voll-Upsert
   (last-write-wins). Parallele `recordLlmUsage` können sich gegenseitig Einträge
   überschreiben — der Zähler zählt dann sogar zu **wenig**. Beides zusammen erklärt
   Tage mit bis zu 185 echten Calls trotz Limit 20.

## Die Lösung (kleinste sichere Variante)

- **Dedizierter Tageszähler** `llm_budget_counters` (Zeile pro Tag+Scope, heute nur
  Scope `global`; `tenant:<id>` ist für spätere Mandant-2-Unterdeckel reserviert).
- **Atomare SQL-Funktion** `helmut_reserve_llm_call(day, scope, max)`: ein einziges
  `INSERT … ON CONFLICT … DO UPDATE … WHERE used < max RETURNING`-Statement. Postgres
  serialisiert konkurrierende Upserts derselben Zeile über den Row-Lock — korrekt bei
  2, 10 oder N parallelen Calls, über beliebig viele Server-Instanzen, bei Retry und
  nach Timeout. Kein Advisory Lock, keine Transaktionslogik im App-Code, kein
  In-Memory-Lock als alleiniger Schutz.
- **Durchsetzung am Choke-Point**: `ai.js requestOpenAI` ist der einzige Ort, an dem
  tatsächlich ein Modell aufgerufen wird (alle Pfade laufen über
  `requestJson`/`requestStructuredJson`/`requestText`). Die Reservierung passiert dort
  **vor** dem HTTP-Call — kein LLM-Pfad (auch kein zukünftiger) kann das Budget
  umgehen. Die bestehenden Pre-Gates (`canSpendLlm`/`canSpendLlmForTenant`) bleiben
  als billige Frühprüfung mit ehrlichen Skip-Gründen erhalten; **reserviert** wird nur
  am Choke-Point, genau einmal pro Call-Kette (der 400er-Modell-Fallback erbt die
  Reservierung, wie er auch bisher nur einmal gezählt wurde).
- **Prioritätsklasse statt zweitem Budgetsystem**: Understanding (callType
  `understanding`) darf das volle Tageslimit nutzen; alle anderen Pfade (Büro,
  Kommunikation, Lage, App-Start, Backfills) nur `Limit − HELMUT_LLM_RESERVE_UNDERSTANDING`.
  So kann Büro Understanding nicht mehr aushungern (F5-Punkt 10), Büro bleibt bis zur
  Reservegrenze normal nutzbar, und es entsteht keine komplizierte Paketlogik.
- **Fehlgeschlagene/abgebrochene Calls**: eine verbrauchte Reservierung wird bewusst
  **nicht** zurückgegeben (konservativ; identisch zur bisherigen Zählung, die
  fehlgeschlagene Calls als billable zählt — Retry-Stürme können das Budget nicht umgehen).
- **Ehrlicher Nutzerzustand**: abgelehnte Reservierungen werfen am Choke-Point einen
  typisierten Fehler (`code: LLM_BUDGET_EXHAUSTED`) und loggen einen
  `skipped-<callType>`-Eintrag mit Grund (`daily-llm-budget-reached` bzw.
  `daily-llm-budget-reserved-for-understanding`). Alle Aufrufer haben bestehende,
  ehrlich gekennzeichnete Regel-Fallbacks (Büro/Kommunikation: Regeltext; Lage: kein
  Fake-Briefing; Understanding: Vorgang bleibt pending).

## Verhaltensmatrix

| Zustand | Verhalten |
| --- | --- |
| Supabase + Migration eingespielt | Atomare Reservierung (`atomic: true`). Der Deckel ist hart — auch parallel. |
| Supabase, Migration **noch nicht** eingespielt | Erkennung über PostgREST 404/PGRST202 → Altverhalten (Read-then-Decide, `atomic: false`) + **einmalige Log-Warnung**. Der Merge ist dadurch unabhängig von der Migrations-Freigabe deploybar; der bekannte Race bleibt bis zur Migration bestehen. |
| Lokaler Datei-Modus (Dev/Tests) | In-Prozess-serialisierter Zähler (ein Prozess — korrekt ohne DB). |
| Reservierungs-Infrastrukturfehler (z. B. Supabase 500) | Wie bisher zentral: fail-open ohne Flag, fail-closed mit `HELMUT_LLM_BUDGET_FAIL_CLOSED=1`. |
| Limit fehlt / leer / `0` / ungültig | **Schutzlimit 50, fail-closed:** `llmDailyCallLimit()` liefert IMMER eine endliche Zahl (fehlend, leer, `0`, negativ, unparsebar → 50, einmalige Log-Warnung). Die Reservierung läuft dann ganz normal gegen 50. Einen „kein Limit"-Zustand gibt es seit dem Budget-Rollout NICHT mehr; der entsprechende Zweig in `reserveLlmCall` ist ein dokumentierter toter Sicherheitszweig. Wer bewusst mehr will, setzt explizit eine hohe Zahl. |

Anmerkung zur Frage „Ist 100 danach ein echter Gesamtdeckel?": **Ja, global.** Der
Reservierungs-Scope ist `global` — er zählt alle Mandanten zusammen (das per-Mandant-
Euro-Budget aus dem Profil bleibt zusätzlich als Pre-Gate bestehen). Die alten
per-Mandant-Call-Zählungen der Pre-Gates bleiben als Frühprüfung erhalten, sind aber
nicht mehr die letzte Verteidigung.

## Tests

`npm run test:llm-reservation` (läuft automatisch in `npm run test:offline` + CI):
Grenzwert exakt, 10 parallele Reservierungen bei Limit 5 → exakt 5, Understanding-
Reserve, Tageswechsel, mehrere Mandanten am globalen Deckel, fehlende Migration →
Altverhalten, RPC-Fehler fail-open/fail-closed, lokaler Parallel-Modus, Choke-Point
(Stopp vor dem HTTP-Call inkl. Skip-Log; erlaubte Reservierung lässt den Call durch).

## Production-Freigabeschritt

**STATUS 2026-07-15:** Schritte 1–3 (Vorprüfung, Migration, Nachprüfung) sind
mit Gründer-Freigabe „Go für Migration F12" AUSGEFÜHRT und grün (Registry-Version
`20260715123216`; Atomik live belegt via realem Call → `used=1`). **Offen: nur
noch Schritt 4** (die zwei Env-Werte `HELMUT_LLM_RESERVE_UNDERSTANDING=30` +
`HELMUT_UNDERSTANDING_LOCK=1` + Redeploy im Vercel-Dashboard). Schritt 5 (Rollback)
bleibt als Rückweg dokumentiert.

Reihenfolge (nach dem Merge der PRs, siehe `docs/freigabepunkte.md`):

### 1. Vorprüfung (read-only)

```sql
-- Existiert die Funktion/Tabelle schon? (Erwartung vor der Migration: 0 Zeilen)
select proname from pg_proc where proname = 'helmut_reserve_llm_call';
select tablename from pg_tables where schemaname = 'public' and tablename = 'llm_budget_counters';
```

### 2. Migration einspielen

`supabase/migrations/20260717_llm_budget_reservation.sql`
(idempotent; keine Sperren auf bestehende App-Tabellen; erwartete Dauer < 1 s;
keine Nutzerwirkung — die App nutzt die Funktion erst, sobald sie existiert).

### 3. Nachprüfung

```sql
-- Funktion vorhanden + Probelauf mit einem Test-Scope (verändert KEINE echten Zähler):
select * from public.helmut_reserve_llm_call('2000-01-01', 'nachpruefung', 2); -- -> (true, 1)
select * from public.helmut_reserve_llm_call('2000-01-01', 'nachpruefung', 2); -- -> (true, 2)
select * from public.helmut_reserve_llm_call('2000-01-01', 'nachpruefung', 2); -- -> (false, 2)  << Deckel greift
delete from public.llm_budget_counters where day = '2000-01-01' and scope = 'nachpruefung';

-- RLS aktiv, keine Policies (service_role-only):
select relrowsecurity from pg_class where relname = 'llm_budget_counters'; -- -> true
```

Danach im App-Log prüfen: die Warnung `SQL-Funktion helmut_reserve_llm_call fehlt`
darf **nicht** mehr erscheinen.

### 4. Env-Werte im selben kontrollierten Schritt

- `HELMUT_MAX_LLM_CALLS_PER_DAY=100` (echter globaler harter Tagesdeckel)
- `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` (Fehler der Budgetprüfung → Call verweigern)
- `HELMUT_LLM_RESERVE_UNDERSTANDING=30` (Empfehlung: Understanding kann nie unter
  30 Calls/Tag gedrückt werden; Büro/App-Start/Lage teilen sich max. 70)
- Redeploy, dann Budgetverhalten in der Admin-Kostenanzeige beobachten.

### 5. Rollback

`supabase/migrations/20260717_llm_budget_reservation_rollback.sql` — die App erkennt
die fehlende Funktion und fällt automatisch (geloggt) auf das Altverhalten zurück;
kein Deploy nötig. Datenverlust: nur Tageszählerstände; das `llmUsage`-Log
(Kosten-/Audit-Quelle) ist unabhängig und bleibt vollständig.

- Beobachtungszeit nach Aktivierung: 1 Tag (ein voller Cron-Zyklus).
- Go-Kriterium: Admin-Kostenanzeige zeigt Calls ≤ 100/Tag; Understanding läuft trotz
  Büro-Nutzung; keine `budget-check-failed-*`-Einträge.
- Rollback-Kriterium: Understanding bleibt trotz freiem Budget stehen ODER
  fail-closed blockiert nachweislich wegen Supabase-Störung (dann Flag zurücknehmen
  und Störung beheben).

## Was bewusst NICHT jetzt gebaut wurde (erst vor Mandant 2)

- Per-Mandant-Unterdeckel im Zähler (`tenant:<id>`-Scope ist vorbereitet, wird aber
  erst mit echtem zweiten Mandanten gebraucht — bis dahin genügt der globale Deckel
  plus per-Profil-Euro-Budget).
- Echtes tägliches Euro-Kostenlimit statt Call-Zählung (braucht verlässliche
  Kosten-Attribution pro Call über alle Modelle; heute Schätzwerte).
- Warnstufen/Alerting auf Budgetstand (Monitoring-Zweitkanal existiert; Verdrahtung
  einer 80%-Warnung ist ein kleiner Folgeschritt nach dem Piloten).

Begründung: Der Cem-Pilot braucht einen harten, ehrlichen Gesamtdeckel und Schutz des
Understanding-Pfads — beides liefert diese Lösung mit einer Tabelle + einer Funktion.
Alles Weitere würde den Piloten verzögern, ohne das Risiko weiter zu senken.
