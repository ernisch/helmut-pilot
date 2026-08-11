# OP-30 — Kontrollierte Aktivierung mit den fünf bestehenden Mandaten

**Sprint 2026-08-11 · kanonischer Beleg und verbindliches Runbook.**
Vorgänger: [`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md)
(Stufenplan 5→200, §10) · [`skalierungsgrundlage-1000.md`](skalierungsgrundlage-1000.md) ·
[`workerbetrieb.md`](workerbetrieb.md) · [`env-inventar.md`](env-inventar.md).

> **Nichts ist aktiviert.** Dieser Sprint hat keine Migration angewendet, keine
> Environment-Variable gesetzt, keinen Production-Lauf ausgelöst und keine
> Production-Datenzeile verändert. Alle Production-Zugriffe waren rein lesend.
> Jeder Schritt in §6/§7 ist eine **Betreiberaktion** (Vercel-Env ist aus Sitzungen
> weder lesbar noch setzbar, [`env-inventar.md`](env-inventar.md) §8).
>
> **Nachtrag 2026-08-11/3 (Folgesprint mit ausdrücklicher Freigabe):** §6 Schritt 1 ist
> ausgeführt — die sechs Vorwärtsmigrationen sind auf Production angewendet und rein
> lesend abgenommen (**Migrationsbeleg §12**). Alle OP-30-Flags sind weiterhin **aus**,
> nichts ist aktiviert, keine Rücknahmedatei wurde angewendet.
>
> **Nachtrag 2026-08-11/4 (rein lesend):** §6 Schritt 2 ist erfüllt — der erste reguläre
> Lauf nach PR #241 (pipeline 16:00 UTC) verhielt sich unverändert, der neue Motor wurde
> nicht gestartet (**Neutralitätsnachweis §13, bestanden**). Damit ist die Vorbedingung
> für §6 Schritt 3–5 erfüllt; die Aktivierung selbst bleibt ein eigener, freigabepflichtiger
> Sprint.

---

## 0 · Kurzfassung

| Frage | Antwort |
|---|---|
| Ist OP-30 für 5 Mandate technisch aktivierungsbereit? | **Ja — nach Merge des Korrektur-PRs dieses Sprints.** Ein echter, bis dahin nur auf einem nie gemergten Branch behobener Produktfehler (übersprungener V3-Lauf galt als erledigter Auftrag) ist auf `main`-Basis portiert und getestet. |
| Verbindlicher Quellstand | `main` (`dcd6da5`, Merge PR #239) **plus** der Korrektur-PR dieses Sprints. Der Branch `claude/helmut_scaling_foundation_1000` ist damit vollständig ausgewertet und wird nicht mehr gebraucht. |
| Migrationen | Sechs Paare, alle auf `main`. Kette an echter PostgreSQL 16.13 bewiesen: vorwärts, wiederholt, Rollback, erneut vorwärts, Teilzustände, Datenerhalt, RLS (31/31). **Seit 2026-08-11 auf Production angewendet (§12).** |
| Flags | Alle OP-30-Flags Default AUS, in Production **nirgends gesetzt** (gegengeprüft: 0 OP-30-Tabellen, 0 OP-30-Funktionen in Production, 2026-08-11). |
| Fünf Mandate | Bestätigt (rein lesend): genau `annika-klose`, `cem-ince`, `helmut-kleebank`, `ottilie-paola-klein-2`, `ruppert-st-we` sind `aktiv=true`. |
| Zeile `mdb-a` | Gefunden, Ursache belegt, **beeinflusst keinen aktiven Datenweg** und blockiert die Aktivierung nicht. Bereinigungsplan in §9, Ausführung freigabepflichtig. |
| KI-Deckel für 5 Mandate | **Reicht, aber ohne großen Puffer**: global `used` der letzten 10 Tage 63–80, zweimal 100 (= Deckel erreicht, 01./02.08.). Der Warteschlangenpfad erhöht die Aufrufzahl nicht (gleiche Arbeit, Budget-Schicht kann nur senken). Grenzwerte in §8. |

---

## 1 · Was „Aktivierung mit fünf Mandaten" genau heißt

Der Stufenplan (§10 des Kapazitätsbelegs) kennt OP-30-Flags erst ab Stufe 2 (25 Mandate).
Die hier vorbereitete Aktivierung ist **die OP-30-Mechanik bei unveränderter Mandatszahl 5** —
also die kleinste mögliche Scharfschaltung:

- **Aktiviert wird nur `HELMUT_SCALABLE_PIPELINE=on`**: die Crons `crawl` (04:00/20:00 UTC)
  und `pipeline` (16:00 UTC) laufen dann über die dauerhafte Warteschlange
  (`server.js cronSchwererPfad` → `runCronUeberWarteschlange`; der Einsprung ist ein
  `return` **vor** der bisherigen Pfadwahl — es gibt keine Konstellation doppelter
  externer Arbeit).
- **`HELMUT_NARRATIV_QUEUE` bleibt AUS**: `lage-briefing` (05:45 UTC) läuft unverändert die
  Direktschleife; die beiden Nachlaufslots (06:10/06:22 UTC) tun nichts (dreifacher Riegel,
  an der echten HTTP-Route bewiesen).
- **`HELMUT_LLM_FAIRNESS` bleibt AUS** (optionaler zweiter Schritt, §6.3): unabhängig und
  sicher (kann nur weniger zulassen, nie mehr; `migration-fehlt` fail closed), aber für
  5 Mandate nicht erforderlich.
- **`morning-briefing` (05:00 UTC, OP-31-Pushroute) ist strukturell unberührt**: eigene
  Route ohne Warteschlangenzweig; `scalable-pipeline.js` enthält keinerlei Push-Aufruf —
  der Warteschlangenpfad materialisiert nur. Alt- und Neupfad können **keine**
  konkurrierenden Pushs erzeugen.
- Die Ausweitung auf 25 Mandate wird durch diesen Sprint **weder vorbereitet noch
  freigegeben**. Vorher zwingend: stabiler 5er-Nachweis (§8.4) **und** ein neu
  bestandener OP-25-Nachweis (die Aktivierung verändert `quellenVereinigung`,
  K2.1-Sichtbarkeitsmengen und Laufzeitbilanz ⇒ OP-25 von vorn).

## 2 · Komponenteninventar (Zustand je Bestandteil, Stand 2026-08-11)

Zustände: **(1)** auf `main` und einsatzbereit · **(2)** vorhanden, nicht integriert ·
**(3)** vorhanden, aber fehlerhaft/unvollständig · **(4)** fehlend ·
**(5)** für die 5er-Aktivierung nicht erforderlich.

| Bestandteil | Zustand | Beleg |
|---|---|---|
| Migrationen (6 Paare, je mit Rollback) | **(1)** — seit 2026-08-11 in Production angewendet (§12) | `supabase/migrations/2026080{8,9}_*`; Kette 31/31 (§5) |
| Tabellen/Funktionen/Indizes/Rechte | **(1)** | 3 Tabellen, 20 `helmut_`-Funktionen, 14 Indizes; `helmut_claim_jobs` nutzt `helmut_jobs_claim_idx` (EXPLAIN geprüft); RLS aktiviert **und** erzwungen, keine Policy, `anon`/`authenticated`/PUBLIC ohne Rechte, keine SECURITY-DEFINER-Funktion |
| Warteschlange + Worker (`scalable-pipeline.js`, `worker-betrieb.js`) | **(1)** | `jobqueue-vertrag-test` 120/120 · `jobqueue-sicherheit-test` 69/69 |
| Worker-Startweg | **(1)** | Vercel-Form (b): `runCronUeberWarteschlange` je Cron-Fenster (`server.js:6710`), Budget 270 s < `maxDuration` 300 s; kein eigener Dienst nötig ([`workerbetrieb.md`](workerbetrieb.md) §5) |
| Auftragsabhängigkeiten (Vorbedingungen, `helmut_defer_job`) | **(1)** | `v3-anbindung-test` 56/56 (2 OFFEN production-ehrlich) |
| Fairness-/Budget-Schicht (`llm-budget-fair.js`, R4/R4b-korrigiert) | **(1)**, Flag aus; für 5er-Start **(5)** | `budgetvertrag-test` 59/59 · Mutationsprobe 6/6 erkannt · `llm-budget-fairness-test` 60/60 |
| Idempotenz/Deduplizierung | **(1)** | Migrationskette 5.3/5.4 · `morgenslot-idempotenz-test` 26/26 |
| Wiederaufnahme nach Fehlern (Backoff, Lease, Wiedervorlage O5) | **(1)** | `jobqueue-wiedervorlage-datenbank-test` 48/48 · Absturztest (SIGKILL) im Lasttest |
| **Verstehens-/Projektionshandler: übersprungener Lauf galt als erledigt (B14-Produktfehler)** | **war (3)** — Fix lag nur auf `claude/helmut_scaling_foundation_1000` (Commit `1ea1d5e`, nie gemergt); **in diesem Sprint auf `main`-Basis portiert und gehärtet** → mit dem PR dieses Sprints **(1)** | `jobqueue-vertrag-test` §12.14–12.20 (neu); Einzelheiten §4 |
| Env-Variablen + Defaults | **(1)** — alle Default AUS/konservativ, fail closed | §7; `env-inventar-test` |
| Cron-Routen und Zeitfenster (11 Einträge) | **(1)** — laufen bereits, Nachlaufslots inert | `vercel.json`; Production-Logbeleg „OP-30-Flags aus, keine Verarbeitung" |
| Beobachtung (`/api/ops/jobqueue`, `helmut_job_metrics`, `betriebsstatus`) | **(1)** | `narrativ-slotvertrag-test` 66/66 |
| Alarmierung (Zweitkanal) | **(4)** — unverändert OP-07 (`HELMUT_MONITORING_WEBHOOK_URL` unset ⇒ No-Op) | kein OP-30-spezifischer Mangel; Kontrollplan §8.4 gleicht das manuell aus |
| Rücknahmeweg | **(1)** | §7; Flag-Rückweg + Rollback-SQL bewiesen (31/31, Kostenwahrheit bleibt) |
| Wirkung auf V2-Betrieb bei Flags aus | **keine** | `scalable-pipeline-flag-test` 52/52 · `flagmatrix-op30-test` 75/75 |
| Wirkung auf OP-31/Morgenbriefing | **keine** (eigene Route, kein Queue-Push) | §1; OP-31-Nachweis 2026-08-11 bestanden |
| Lage-Narrativ über Warteschlange (E1) | **(2/5)** — gebaut und bewiesen, für den 5er-Start bewusst aus | `tenant-narrativ-test` 91/91 |

## 3 · Verbindlicher Quellstand (Phase-1-Ergebnis)

- `main` HEAD **`dcd6da5`** = Merge PR #239; alle Doku-Änderungen aus #239 enthalten
  (CURRENT_STATE, Restliste OP-31, Frischevertrag §11 — gegengeprüft).
- Auf `main` liegen alle OP-30-Bestandteile aus PR #233/#235/#236/#237.
- **Einziger ungemergter OP-30-Stand:** Branch `claude/helmut_scaling_foundation_1000`
  (2 Commits vor `main`): `1ea1d5e` (der echte Produktfehler-Fix, §4) und `6a871c4`
  (Ehrlichkeitskorrekturen: F-E2E nicht erledigt, Kommentarberichtigung). Beide Inhalte
  sind mit diesem Sprint auf `main`-Basis übernommen; der Branch ist damit ausgewertet.
- **Namensgleichheit, zwei verschiedene Befunde:** „B14" bezeichnete auf `main` (PR #235)
  einen Testinfrastruktur-Fehler (`jobqueue-bereinigung-test` legte seine DB nicht an,
  behoben) — und auf dem alten Branch den **Produktfehler** aus §4. Die frühere
  Statuszeile „B14 behoben" bezog sich nur auf ersteren.
- Offene PRs (#231, #225, #224, #218, #216) tragen keinen OP-30-Code. Arbeitsbaum sauber,
  keine nicht zuordenbaren OP-30-Änderungen.
- Seit dem letzten OP-30-Bericht kam PR #238 (OP-31): ändert `lage.js` nur am
  Berliner Tagesschlüssel (eine Quelle), `buildLageBriefing`-Schnittstelle unverändert,
  `server.js` ohne Berührung des OP-30-Pfads ⇒ **kein OP-30-Bericht ist dadurch überholt**.

## 4 · Der portierte Produktfehler-Fix (früher „B14", Abschlussreview 2026-08-08)

**Fehler:** `runUnderstandingShadow`, `runMatchingShadow` und `runDecisionShadow` liefern in
mehreren Fällen `{ skipped: true, reason }` — darunter `understanding-locked` und
`matching-locked` (vorübergehende Sperrkollisionen). Die Handler meldeten darauf `ok:true`;
der Auftrag galt als erledigt. Folgen: der Verstehens-Idempotenzschlüssel trägt bewusst kein
Aktualitätsfenster ⇒ die Dokumentmenge wäre **dauerhaft** unverstanden geblieben; die
Projektion trägt das Fenster ⇒ das Mandat hätte seine Projektion für das ganze 24-h-Fenster
verloren — jeweils als Erfolg gemeldet (Verstoß gegen CLAUDE.md §4.10).

**Port mit drei Härtungen gegenüber der Branch-Fassung** (die alte Fassung hätte für
dauerhafte Zustände unbegrenzt zurückgestellt — genau das O4-Muster):

1. Übersprungene Läufe werden **zurückgestellt** (Sperren kurz, abgeschaltete Pfade lang),
   aber mit der **O4-Obergrenze** (`HELMUT_BUDGET_MAX_WARTE_MS`, Default 48 h): danach
   enden sie **endgültig und sichtbar** (`verstehen-/projektion-uebersprungen-dauerhaft`,
   von `istEndgueltig` erkannt). *Präzisiert 2026-08-11/3:* die Wiedervorlage (O5,
   `helmut_jobs_wiedervorlage`) gilt standardmäßig für `document_understanding`. Für
   Projektionen erfolgt die Erholung über die Neuplanung im nächsten 24-Stunden-Fenster
   (der Projektionsschlüssel trägt das Fenster). Der Fehlerbeleg bleibt sichtbar.
2. `no-vorgaenge` ist ein **ehrlicher Leerzustand** und bleibt ein Erfolg mit 0 —
   kein Zurückstellen eines gesunden leeren Mandats.
3. `decision-error` (ein echter Fehler im Überspring-Gewand) wird **geworfen**: Versuch,
   Backoff, nach `max_attempts` sichtbar `fehlgeschlagen` — statt unbegrenzt versteckt.

Nachweis: `scripts/jobqueue-vertrag-test.js` §12.14–12.20 (7 neue Prüfungen, Suite
**120/120**); Mutationsprobe 10/10 rot erkannt.

## 5 · Migrationsbeweise (Phase 3, echte PostgreSQL 16.13, 2026-08-11)

Reihenfolge (verbindlich): Voraussetzung `20260717_llm_budget_reservation` (in Production
**angewendet**, gegengeprüft: `llm_budget_counters` existiert) → `20260808_scalable_job_queue`
→ `20260808_jobqueue_abhaengigkeiten` → `20260808_jobqueue_bereinigung` →
`20260808_llm_budget_fairness` → `20260809_jobqueue_narrativ` → `20260809_jobqueue_wiedervorlage`.

| Beweis | Ergebnis |
|---|---|
| Vorwärts, wiederholt (idempotent), Rollback rückwärts, zweites Rollback, erneut vorwärts | `op30-migrationskette-test` **31/31** |
| Abbruch mitten in der Kette: Transaktion nimmt alles zurück; Teilzustand lehnt neue Typen **sichtbar** ab (`helmut_jobs_type_chk`), Bestand funktioniert weiter | 2.1–2.6 |
| Datenerhalt: erneute Anwendung über Bestandsdaten verliert keine Zeile | 3.1/3.2 |
| RLS aktiviert **und** erzwungen, keine Policy, keine Rechte für `anon`/`authenticated`/PUBLIC, keine SECURITY-DEFINER-Funktion, Bereichsdeckel trennt Mandate | 4.1–4.6 |
| Indizes: 14 vorhanden; Claim-Abfrage nutzt `helmut_jobs_claim_idx` (EXPLAIN) | eigener Nachweis 2026-08-11 |
| Parallelität: 12 gleichzeitige Reservierer, 0 doppelt; 8 gleichzeitige Reservierungen desselben Ergebnisses ⇒ 1 Zeile | 5.1–5.4 |
| Rollback-Kosten beziffert: Betriebszustand (Warteschlange/Reservierungen) entfällt, **Kostenwahrheit (`llm_budget_counters`) bleibt** | 6.1–6.3 |
| Verhalten bei 5/25/50/100/200/1000 | `skalierung-stufen-test` 43/43 · `morgenkapazitaet-test` 62/62 (5er-Stufe: 5/5 im Fenster, 94,6 % Reserve) · Stress 1000 ehrlich als Rückstand |

**Ehrliche Einschränkung:** Production läuft PostgreSQL **17.6**, die lokalen Beweise auf
16.13 (dieselbe Version wie alle bisherigen dokumentierten Nachweise). Die Kette nutzt
keine versionsspezifischen Konstrukte; ein Restrisiko der Versionsdifferenz bleibt benannt.

## 6 · Aktivierungsplan (exakte Reihenfolge, jede Zeile eine Betreiberaktion)

**Vorbedingungen:** (a) der Korrektur-PR dieses Sprints ist gemergt und das Deployment
READY; (b) kein laufendes Nachweisfenster; (c) Betreiber hat §8 (Messwerte/Grenzen) gelesen.

1. **Migrationen anwenden** (freigabepflichtig, CLAUDE.md §5): die sechs Paare in der
   Reihenfolge aus §5 gegen Production ausführen (jede Datei ist idempotent; ein Abbruch
   hinterlässt nichts). *Rein lesende Abnahme danach:* `helmut_jobs`, `llm_reservations`
   existieren; 20 `helmut_`-Funktionen; `relrowsecurity=true` und `relforcerowsecurity=true`
   für beide neuen Tabellen; Bestandszahlen aller Alt-Tabellen unverändert.
   **✅ Erledigt 2026-08-11, 10:47–10:52 UTC — alle Abnahmekriterien erfüllt (Beleg §12).**
2. **Regellauf bei Flags aus beobachten** (ein Zyklus, z. B. 16:00-pipeline): Verhalten
   unverändert, keine Zeile in `helmut_jobs` (Migration ist ohne Flag wirkungslos —
   bewiesen, Flagmatrix 75/75).
   **✅ Erledigt 2026-08-11, pipeline 16:03:05–16:07:03 UTC — Neutralitätsnachweis
   bestanden, alle 16 Prüfpunkte grün (Beleg §13).**
3. **`HELMUT_SCALABLE_PIPELINE=on`** in Vercel setzen (nur Production) + Redeploy.
   Sonst **nichts**: `HELMUT_NARRATIV_QUEUE`, `HELMUT_LLM_FAIRNESS` und alle
   `HELMUT_WORKER_*`/`HELMUT_DEMAND_*` bleiben ungesetzt (Defaults greifen).
4. **Sofortkontrolle** (§8.4, Punkt K0).
5. Beobachtung nach Kontrollplan §8.4 (K1 nach dem ersten vollen Lauf, K2 nach 24 h,
   K3 nach 72 h). Erst nach K3 grün ist die 5er-Aktivierung **bestanden**.
6. *(Optionaler zweiter Schritt, frühestens nach K3:)* `HELMUT_LLM_FAIRNESS=on` — eigene
   Sofort-/24-h-Kontrolle; die Schicht kann nur weniger zulassen. Für die 5er-Stufe nicht
   erforderlich.

**Ein versehentlich einzeln gesetztes Flag startet nichts Halbes** (Phase-4-Prüfung):
`HELMUT_NARRATIV_QUEUE` allein ist vollständig wirkungslos; `HELMUT_LLM_FAIRNESS` allein
meldet ohne Migration `migration-fehlt` und der Bestandsdeckel greift; 
`HELMUT_SCALABLE_PIPELINE` **ohne Migration** meldet ehrlich `verfuegbar:false /
migration-fehlt`, der Lauf gilt als nicht ok — **darum Migration vor Flag** (Schritt 1
vor 3); es entsteht dabei kein stiller Erfolg und keine doppelte Arbeit
(Flagmatrix 75/75, `morgenslot-idempotenz-test` B12–B12d an der echten HTTP-Route).

## 7 · Rücknahmeplan (exakte Reihenfolge)

1. **`HELMUT_SCALABLE_PIPELINE` auf `off` setzen oder löschen** (Vercel, nur Production)
   + Redeploy. Der bisherige Direktpfad läuft ab dem nächsten Cron-Fenster unverändert —
   bewiesen: der Pfadwechsel ist ein `return` an einer Stelle; nach Rückbau ist der
   Altpfad byte-identisch aktiv (`scalable-pipeline-flag-test` §1–§3).
2. **Laufende Aufträge bleiben sicher stehen:** niemand holt sie ab (der Worker läuft nur
   hinter dem Flag), Leases laufen aus, Zeilen bleiben als ehrlicher Zustand liegen.
   Kein Verlust, keine Doppelverarbeitung, keine KI-Kosten (Reservierungen verfallen;
   der Choke-Point bucht nur tatsächliche Aufrufe).
3. **Tabellen bleiben stehen** — sie sind ohne Flag inert (niemand liest oder schreibt sie).
   Rollback-SQL ist der seltene Fall, nicht der Regelfall.
4. *(Nur bei endgültigem Rückzug:)* die sechs `_rollback.sql` in **umgekehrter**
   Reihenfolge. Kostet den Betriebszustand der Warteschlange, **nie** die Kostenwahrheit
   (bewiesen, Kette 6.1–6.3).
5. Abnahme des Rückbaus: nächster Regellauf zeigt den Altpfad (Logzeile ohne
   `warteschlange`), Morgenbriefing 5/5 Frischebelege, keine neuen Zeilen in `helmut_jobs`.

**Doppelte Verarbeitung/Pushs beim Rückbau:** strukturell ausgeschlossen — Push gibt es nur
auf der unveränderten `morning-briefing`-Route; Abruf/Projektion wechseln atomar mit dem
Deployment (eine Pfadwahl, ein `return`). Ein zur Rückbauzeit **laufender** Queue-Slot
endet mit seinem Slotbudget (max. 270 s) und startet nicht neu.

## 8 · Messwerte, Grenzen und Kontrollplan (Phase 7, verbindlich für die 5er-Stufe)

### 8.1 Messwerte (je Betriebstag, sofern nicht anders benannt)

Quellen: `/api/ops/jobqueue` (rein lesend, CRON_SECRET) · `helmut_job_metrics()` ·
`process_runs` · `llm_budget_counters` · `briefings`-Quittungen (`bf-<mandat>-…`) ·
Vercel-Runtime-Logs.

| # | Messwert | Erwartung (5 Mandate) |
|---|---|---|
| 1 | bearbeitete Mandate (Projektion + Briefing je Fenster) | 5/5 |
| 2 | zurückgestellte Aufträge (`zurueckgestellt`, Gründe) | vorhanden, fallend je Lauf |
| 3 | endgültig fehlgeschlagene Aufträge | 0 |
| 4 | Dauer je Stufe (`process_runs`, je Auftragstyp) | Abruf ≤ bisherige Crawl-Dauer; Projektion/Briefing < 60 s gesamt |
| 5 | Gesamtdauer je Slot | < 270 s (Slotbudget), nie > 280 s |
| 6 | KI-Aufrufe (`llm_budget_counters.global.used`) | 63–80 (heutige Basis); nicht dauerhaft 100 |
| 7 | KI-Kosten (`llmUsage`) | ≈ 0,14 USD/Tag Basis; < 0,50 USD/Tag |
| 8 | deduplizierte Aufträge (`neu=false` bei Einreihung) | > 0 ab dem zweiten Lauf desselben Fensters |
| 9 | Wiederholungen (`attempts > 1`) | vereinzelt; Quote < 10 % |
| 10 | Warteschlangengröße (wartend + läuft) | fällt nach jedem Slot; kein monotones Wachstum über 24 h |
| 11 | Alter des ältesten offenen Auftrags | < 24 h (ab 24 h meldet `betriebsstatus` **kritisch** — bewusst dieselbe Grenze) |
| 12 | Pushs je Mandat und Tag | genau 1 (Morgenbriefing) |
| 13 | gültige Frischebelege (OP-31) | 5/5, `status=erfolg` |
| 14 | Datenbankfehler (Queue-RPCs) | 0 systematisch |
| 15 | externe Quellenfehler | ≤ heutige Basisquote; Vollausfall ⇒ ehrlicher Leerzustand statt Stillstand |

### 8.2 Grenzen (konkret, dreistufig)

| Beobachtung | **Weiterlaufen** | **Beobachten** (Ursache klären, Stufe halten) | **Sofort stoppen + zurücknehmen** (§7) |
|---|---|---|---|
| Mandate mit Morgenlage/Projektion | 5/5 | 4/5 an einem Tag | < 5 an **zwei aufeinanderfolgenden** Tagen **oder** ein Mandat 2 Tage ohne |
| Doppelte Verarbeitung / doppelter Push | 0 | — | **≥ 1** (kein Ermessen) |
| `global.used` vs. Zahl fachlicher Aufrufe (R4-Gegenprobe) | Abweichung 0 | — | Abweichung **> 0** |
| endgültig fehlgeschlagene Aufträge | 0 | 1–2/Tag, erklärbar | ≥ 3/Tag **oder** derselbe Auftrag nach Wiedervorlage erneut |
| ältester offener Auftrag | < 12 h | 12–24 h | > 24 h (`betriebsstatus` kritisch) |
| Slotdauer | ≤ 270 s | 270–280 s einmalig | > 280 s **zweimal in Folge** |
| `used` = 100 (Deckel) | nie | einmal, nach 20:00 UTC erreicht | vor 12:00 UTC erreicht **oder** 2 Tage in Folge 100 |
| Frischebelege | 5/5 | 4/5 einmal | < 5 zweimal in Folge |
| Warteschlangengröße | fallend je Slot | stagnierend 24 h | wachsend 24 h |
| Zurückstellquote je Lauf | < 30 % | 30–60 % | > 60 % über zwei Läufe (Leerlaufverdacht) |

### 8.3 Zweiter identischer Lauf

Ein wiederholter Lauf im selben Aktualitätsfenster erzeugt **0 neue KI-Aufrufe**
(Idempotenzschlüssel + `existing`-Kurzschluss + ergebnisgebundene Reservierung; bewiesen:
Migrationskette 5.4, `morgenslot-idempotenz-test`, Budgetvertrag Zusage 3/6). In Production
prüfbar über `global.used` vor/nach dem Watchdog-Pipelinelauf (05:30-Workflow, feuert
bedingungslos dieselbe Route — er ist damit der **eingebaute tägliche Idempotenztest**).

### 8.4 Kontrollplan nach der Aktivierung

| Kontrolle | Wann | Was |
|---|---|---|
| **K0 Sofort** | ≤ 15 min nach Redeploy | Deployment READY trägt den erwarteten Commit; `/api/ops/jobqueue`: `bereit:true` (Gründe leer); keine Runtime-Fehler; `helmut_jobs` noch leer (kein Slot lief) |
| **K1 Erster voller Lauf** | nach 04:00-crawl + 05:00-briefing + 05:30-Watchdog + 16:00-pipeline | Messwerte 1–15 einmal vollständig erheben; R4-Gegenprobe; Watchdog-Zweitlauf ohne neue KI-Aufrufe (§8.3); Frischebelege 5/5 |
| **K2 24 h** | +1 Tag | alle Grenzen §8.2 in „Weiterlaufen"; Rückstand < 24 h; Kostenvergleich zur Basis |
| **K3 72 h** | +3 Tage | drei Tage in Folge alle Grenzen grün ⇒ 5er-Stufe **bestanden**; danach Betreiberentscheidung über OP-25-Wiederholung als Vorbedingung jeder Ausweitung |

## 9 · Die Zeile `mdb-a` (Phase 5 — Befund und Bereinigungsplan)

**Befund (rein lesend, 2026-08-11):**

1. **Wo:** `public.profiles`, `id='mdb-a'` (angelegt 2026-07-27 13:20:27 UTC) **plus**
   genau eine Kindzeile `public.decisions`, `id='dec-y'`, `user_id='mdb-a'`
   (`knowledge_object_id=null`, `score=10`, `updated_at` 2026-08-07 23:41:05 UTC).
   Sonst nirgends: 0 Zeilen in `briefings`, `matching_results`, `process_runs`,
   `profile_embeddings`, `llm_budget_counters`; **kein** Eintrag in `mandate_profiles`;
   Blob-Treffer sind Substring-Fehltreffer („…helmut-kleebank-**mdb-a**us-spandau…").
2. **Wie entstanden:** `scripts/tenant-guard-test.js` (Zeile 103) ruft
   `storage.saveDecisions([{ id:"dec-y", user_id:"mdb-a", score:10 }])` und erwartet
   „Store aus → skipped". In einer Sitzung **mit** Production-Zugangsdaten in der Umgebung
   schrieb der Aufruf echt; der Trigger `helmut_ensure_profile_trg` (BEFORE INSERT ON
   `decisions`) legte die Elternzeile `profiles/mdb-a` **in derselben Transaktion** an
   (mikrosekundengleiche `created_at` beider Zeilen). Zweite Berührung 2026-08-07 23:41 —
   ein weiterer Direktlauf vor Einführung des zweischichtigen lokalen Production-Schutzes
   ([`lokaler-production-schutz.md`](lokaler-production-schutz.md), 2026-08-08). Der Schutz
   verhindert genau diesen Weg seither (in diesem Sprint erneut belegt: der ungeschützte
   Runner-Aufruf wurde abgebrochen, der Lauf über `scripts/lokal.js` lief).
3. **Aktive Datenwege:** **nein.** Die eine Lebenszyklus-Wahrheit
   (`tenant-context.relationalesProfilLebenszyklus`) liefert für `profiles`-Zeilen **ohne**
   `mandate_profiles`-Zeile `null` — `mdb-a` ist damit aus Mandatswahl, Planung,
   K2-Signatur (`m5-9aee228dbf2c9f13`, unverändert 5 Mandate) und Admin-Sicht
   ausgeschlossen; das K2-Gate meldet keinen Widerspruch.
4. **Warteschlange/Kosten/Zählungen/Trennung:** Aufträge entstehen nur für aktive
   `mandate_profiles`-Zeilen (`jobqueue-vertrag-test` 12.12/12.13); `mdb-a` erzeugt keine
   Aufträge, keine Kosten, keine Pushs. Einzige Restwirkung: globale Rohzählungen
   (`decisions` +1). **Kein Blocker für die Aktivierung.**
5. **Bereinigung vor Aktivierung nötig?** Nein — empfohlen als Datenhygiene, unabhängig
   vom Aktivierungszeitpunkt.
6. **Sicherer Bereinigungsplan (freigabepflichtig, Production-Datenänderung):**
   - Vorher gegenlesen (Zeilen exakt so vorhanden?):
     `select id from public.profiles where id='mdb-a' and not exists (select 1 from public.mandate_profiles m where m.user_id='mdb-a');`
     und `select id from public.decisions where user_id='mdb-a';` (erwartet: genau `dec-y`).
   - Ein **konditionaler** Löschbefehl genügt (FK `decisions.user_id → profiles.id`
     ist `ON DELETE CASCADE`):
     `delete from public.profiles where id='mdb-a' and not exists (select 1 from public.mandate_profiles m where m.user_id='mdb-a');`
   - Abnahme: beide Vorher-Abfragen liefern 0 Zeilen; `mandate_profiles` unverändert
     9 Zeilen, 5 aktiv; K2-Signatur unverändert.
   - Beleg im [`production_beweisprotokoll.md`](production_beweisprotokoll.md) ergänzen.

## 10 · Was dieser Sprint ausdrücklich NICHT beweist

1. **Production-Verhalten des Warteschlangenpfads** — alle Kapazitäts- und Kettenzahlen
   sind lokale Beweise an echter PostgreSQL bzw. Simulationen mit gemessenen Eingangsgrößen.
   Genau dafür gibt es §8.
2. **Echte Google-/KI-Laufzeiten** unter dem neuen Pfad (Attrappen; unverändert offen).
3. **PostgreSQL-17-Verhalten** (lokal 16.13, §5).
4. **Vercel-Verhalten** der Nachlaufslots unter Last (bei der 5er-Stufe inert).
5. Der wirksame Production-Wert von `HELMUT_MAX_LLM_CALLS_PER_DAY` bleibt aus Sitzungen
   nicht lesbar; die Basis 100+30 stammt aus Code-Default und Betriebsbeobachtung.

## 11 · Testergebnisse dieses Sprints (alle 2026-08-11, lokal)

| Suite | Ergebnis |
|---|---|
| `op30-migrationskette-test` (echte PostgreSQL 16.13) | **31/31** |
| `budgetvertrag-test` | **59/59** · Mutationsprobe **6/6 erkannt** |
| `jobqueue-vertrag-test` (mit den 7 neuen §12.14–12.20) | **120/120** · Mutationsprobe **10/10 rot** |
| `jobqueue-wiedervorlage-datenbank-test` | **48/48** |
| `jobqueue-bereinigung-test` | **38/38** (+1 OFFEN: Scharfschaltung ist Betreiberentscheidung) |
| `jobqueue-sicherheit-test` | **69/69** |
| `morgenslot-idempotenz-test` (echte HTTP-Route) | **26/26** (+1 OFFEN production-ehrlich) |
| `llm-budget-fairness-test` | **60/60** |
| `scalable-pipeline-flag-test` | **52/52** |
| `flagmatrix-op30-test` | **75/75** |
| `source-demand-test` | **59/59** |
| `tenant-narrativ-test` | **91/91** |
| `narrativ-slotvertrag-test` | **66/66** |
| `v3-anbindung-test` | **56/56** (+2 OFFEN) |
| `op30-aktivierungsreife-test` | **55/55** (+3 OFFEN) |
| `skalierung-stufen-test` | **43/43** (+6 OFFEN) |
| `skalierung-simulation-test` (volle Kette, Störfälle, Wiederaufnahme) | **64/64** (+3 OFFEN) |
| `morgenkapazitaet-test` (5er-Stufe: 5/5, 94,6 % Reserve) | **62/62** (+4 OFFEN) |
| Kanonischer Offline-Gesamtlauf (`run-offline-tests` über `lokal.js`) + Browser-Smoke | siehe PR-Beschreibung (echte Zahlen) |

Die OFFEN-Punkte sind ausnahmslos ehrliche „erst in Production beweisbar"-Markierungen.

## 12 · Migrationsbeleg Production (Sprint 2026-08-11/3, ausdrückliche Freigabe)

**Ziel eindeutig bestätigt:** Supabase-Projekt `ddckuvvpcytqbyfmbvie` („ernisch's Project",
eu-west-1, `ACTIVE_HEALTHY`, PostgreSQL **17.6**) — das einzige Projekt der Organisation,
identisch mit dem in [`restore-uebung-2026-07-28.md`](restore-uebung-2026-07-28.md)
dokumentierten Production-Projekt. Quellstand: `main` = `9663fc8b` (Merge PR #240),
Arbeitsbaum sauber, Production-Deployment `dpl_HsbK5VJsp1T5A8SpwexgVmqbVsy8` READY mit
exakt diesem Commit. Migrationsweg: MCP `apply_migration` (derselbe belegte Weg wie
`20260727`/`20260728`). Supabase-CLI in der Sitzung nicht installiert (nicht benötigt);
der Supabase-Changelog war wegen Egress-Sperre (`supabase.com`) nicht abrufbar —
gemildert durch den unveränderten, belegten Werkzeugweg und die versionsneutrale Kette (§5).

**Vorzustand (rein lesend, vor 10:47 UTC):** 0 OP-30-Tabellen, 0 OP-30-Funktionen,
Voraussetzung `llm_budget_counters` vorhanden (39 Zeilen, `global.used`=39); Historie mit
19 Migrationen, keine der sechs registriert; keine Sperren/lang laufenden Operationen;
43 Tabellen mit erfassten Zeilenzahlen; genau 5 aktive Mandate; `mdb-a` wie in §9;
OP-31-Belege 5/5 (Morgenlage 05:00) + 5/5 (Lage 05:45); Runtime-Fehler nur die bekannten
Basisklassen (Google-Timeouts, `lage-check`-Zeitlimit 10:00 UTC).

**Anwendung (SHA256 der Vorwärtsdateien, Reihenfolge = §5; jede einzeln geprüft):**

| # | Datei | SHA256 (Kurzform) | Registriert (Version) | Ergebnis |
|---|---|---|---|---|
| 1 | `20260808_scalable_job_queue.sql` | `d2a32f41…3711761` | `20260811104749` | ✅ Tabelle + RLS true/true, 7 Indizes, 1 Trigger, 7 Funktionen, 0 Fremdrechte |
| 2 | `20260808_jobqueue_abhaengigkeiten.sql` | `e55538d5…c60c7d89` | `20260811104841` | ✅ `helmut_jobs_offen(text[],text[])` + `helmut_defer_job`, Fenster-Typ-Index |
| 3 | `20260808_jobqueue_bereinigung.sql` | `bf073594…257639b1` | `20260811104923` | ✅ Vorschau + Bereinigen (Default Trockenlauf), Bereinigungs-Index |
| 4 | `20260808_llm_budget_fairness.sql` | `e00e771d…53d92aa` | `20260811105100` | ✅ `llm_reservations` RLS true/true, 5 Funktionen, `llm_budget_counters` unberührt |
| 5 | `20260809_jobqueue_narrativ.sql` | `0f4675d9…6ca9a1` | `20260811105131` | ✅ `helmut_jobs_type_chk` enthält alle fünf Typen |
| 6 | `20260809_jobqueue_wiedervorlage.sql` | `f1181472…fc7b306` | `20260811105229` | ✅ Spalte `wiedervorlagen` + Check + Index + 3 Funktionen |

**Abnahme (rein lesend, vollständig grün):** Historie enthält exakt die sechs Einträge in
dieser Reihenfolge · 2 neue Tabellen, RLS **aktiviert und erzwungen**, **keine** Policy,
**0** Rechte für `anon`/`authenticated`/PUBLIC (Tabellen und alle Funktionen) · 19 neue
`helmut_`-Funktionen mit korrekten Signaturen, **0 SECURITY DEFINER**, überall fester
`search_path` (+ bestehende `helmut_reserve_llm_call` = die 20 aus §6.1) · 13 Indizes auf
den neuen Tabellen (11 explizite + 2 PK), **0 ungültige**, 0 unvalidierte Constraints ·
Policies gesamt unverändert 24 · **Bestandszeilenzahlen aller geprüften Alt-Tabellen
byte-identisch zum Vorzustand** · 5 aktive Mandate unverändert · `mdb-a` unverändert inert ·
`global.used` unverändert 39 (**0 KI-Aufrufe/Kosten**) · `helmut_jobs`/`llm_reservations`
**leer** (kein Worker, kein Cronlauf ausgelöst, kein Push) · OP-31-Belege unverändert ·
im Migrationsfenster 10:47–10:52 UTC **0 neue Runtime-/Datenbankfehler**.

**Security-Advisor (nach der Migration):** kein neuer WARN/ERROR-Befund. Neu (migrationsbedingt)
nur der **beabsichtigte** INFO-Hinweis `rls_enabled_no_policy` für `helmut_jobs` und
`llm_reservations` (RLS an + erzwungen ohne Policy = die zwei unabhängigen Riegel des
geprüften Vertrags; gleiche Klasse wie bei 18 Bestandstabellen). Vorbestehend und unverändert:
`extension_in_public` (`vector`, WARN) und die `rls_enabled_no_policy`-INFOs der Bestandstabellen.

**Rücknahmefähigkeit:** die sechs `_rollback.sql` referenzieren exakt die jetzt vorhandenen
Objekte (Tabellen, alle 19 Funktionen mit passenden Signaturen, alle 11 expliziten Indizes,
Trigger, Constraints) — der Rücknahmeweg aus §7 passt unverändert. **Keine Rücknahmedatei
wurde angewendet**; Anwendung bleibt freigabepflichtig.

**Nicht getan (Verbote eingehalten):** kein Flag gesetzt/geändert, keine Env-Variable, kein
Worker, kein manueller Cronlauf, keine Testdaten, keine Mandatsänderung, `mdb-a` unangetastet,
keine Rücknahme, keine Codeänderung, kein Merge.

## 13 · Neutralitätsnachweis des ersten Regellaufs (Sprint 2026-08-11/4, rein lesend)

**Erfüllt §6 Schritt 2.** Frage: verhält sich der bisherige Betrieb bei ausgeschalteten
OP-30-Flags unverändert, und wurde der neue Motor nicht gestartet? **Antwort: ja bzw. nein
— der Nachweis ist bestanden.** Kein manueller Lauf, keine Env-/Flag-Änderung, kein Worker,
keine Datenänderung; alle Zugriffe rein lesend.

### 13.1 Prüfobjekt

- **PR #241** gemergt 2026-08-11T11:53:27Z, Merge-Commit `6ed4f6570439c37629e539218369af3cf8d85d3b`.
- Production-Deployment **`dpl_F4e6ojyF5g4J9HZJGF28sWqHEEvW`**, `target=production`,
  `state=READY`, erstellt 11:53:30Z, `githubCommitSha` = exakt dieser Commit.
- Geprüfter Lauf: **regulärer Vercel-Cron `pipeline` 16:00 UTC** (`/api/cron/pipeline`,
  HTTP 200, **genau eine** Anfrage im Fenster), `run_id`
  `cron-pipeline-20260811160305-zvzhe`, `commit_ref` = derselbe Commit.
- Vor-Lauf-Grundlinie um 11:57 UTC erhoben (§13.3, Spalte „vorher").

### 13.2 Lauf begonnen und vollständig beendet

| Größe | Wert |
|---|---|
| `globalphase` | 16:03:05.566Z → 16:06:44.039Z, `duration_ms` 218 472 |
| Routenlaufzeit gesamt | 239 696 ms (16:03:03Z → ~16:07:03Z), `tenants=5 bounded=false` |
| Abschluss | `laufzustand=abgeschlossen` · `zustand=ok` · `versiegelt=true` |
| Zeitbudget | 218 472 ms von 229 734 ms, `restMs=47 732` — Limit **nicht** erreicht |
| Fehler | `failed_count=0` · `fehler=0` · `persistenz=ok` · `cas=0` |

`status=partial` ist der **unveränderte Normalzustand** von `globalphase`: alle elf Läufe
seit 2026-08-08 tragen ihn, bei Dauern 188 121–224 450 ms. Der Reason-String
`status=teilweise budget=1 fehler=0 abruf=0 persistenz=ok cas=0 lazyskip=1 nv=0 vk=1015`
ist formgleich mit allen Vorläufen (z. B. 04:00 desselben Tages, `vk=981`).

### 13.3 Ausschließlich der bisherige stabile Datenweg

Der Lauf durchlief `runGlobaleErfassung` → `crawlAllSources` → `globalphase/persistenz` →
`lazy-/eager-understanding` → `vormerk-abschluss` — der Altpfad. **Keine einzige Logzeile
mit `warteschlange`**, kein Worker-Start, keine Auftragsplanung. Belegt zusätzlich über
`pg_stat_user_tables`: beide OP-30-Tabellen wurden seit ihrer Anlage (10:47 UTC) **nie
gelesen und nie beschrieben**.

| Prüfpunkt | vorher (11:57Z) | nachher (16:19Z) | Urteil |
|---|---|---|---|
| `helmut_jobs` Zeilen | 0 | **0** | unverändert |
| `helmut_jobs` `n_tup_ins`/`upd`/`del` | — | **0 / 0 / 0** | nie beschrieben |
| `helmut_jobs` `idx_scan` | — | **0** | nie über Index gelesen |
| `llm_reservations` Zeilen | 0 | **0** | unverändert |
| `llm_reservations` `n_tup_ins`/`upd`/`del` | — | **0 / 0 / 0** | nie beschrieben |
| `llm_reservations` `idx_scan` | — | **0** | nie über Index gelesen |
| aktive Mandate | 5 | **5** | unverändert |
| `mdb-a` (profiles/decisions/mandate_profiles) | 1 / 1 / 0 | **1 / 1 / 0** | unverändert inert |
| `llm_budget_counters` `global.used` (2026-08-11) | 39 | **41** | +2, erklärt (§13.5) |
| Policies `public` | 24 | **24** | unverändert |
| registrierte Migrationen | 25 | **25** | unverändert |
| `briefings` gesamt | 163 | **163** | unverändert |
| `profiles` | 10 | **10** | unverändert |

### 13.4 Alle fünf Mandate, genau einmal

```
[cron/pipeline/fairness] geplant=ruppert-st-we,cem-ince,annika-klose,ottilie-paola-klein-2,
helmut-kleebank begonnen=<dieselben fünf> erfolgreich=5 fehlgeschlagen=0 zeitbudget=-
laeuftBereits=- sperreVerweigert=- kapazitaet=5 obergrenzeLaeufe=1 laufzustand=abgeschlossen
abweichung=- zustand=ok
```

Relational gegengelesen: alle fünf Mandate haben im Laufzeitfenster frische `decisions`
(annika-klose 21 · cem-ince 24 · helmut-kleebank 25 · ottilie-paola-klein-2 22 ·
ruppert-st-we 23; letzte Schreibvorgänge 16:06:50–16:07:03Z). **Kein sechstes Mandat, kein
`mdb-a`, kein Testmandat.** `obergrenzeLaeufe=1` und `laeuftBereits=-` belegen: kein
Zweitlauf, keine konkurrierende Verarbeitung.

### 13.5 Kosten und Pushs sind eindeutig getrennt

- **KI-Aufrufe:** `global.used` 39 → 41 = **+2**. Das ist exakt `verstanden=2` bzw.
  `eager-understanding {"processed":2}` des Altpfads. Da `llm_reservations` **nie** eine
  Zeile erhielt, hat die OP-30-Budgetschicht **null** Aufrufe verursacht oder reserviert.
- **Pushs:** der Pipelinelauf erzeugt keine Briefings — `briefings` blieb bei 163, seit
  05:45Z kam keine Zeile hinzu. Push gibt es nur auf der unveränderten
  `morning-briefing`-Route (§7). **Keine doppelten, keine konkurrierenden Pushs.**
- **OP-31 unverändert:** die zehn Belegzeilen des Tages stehen unberührt — 5× `morgenlage`
  (alle `status=erfolg`, `ausloeser=morgenlauf`, 05:00:31–05:00:39Z) + 5× `lage`
  (05:45:33–05:45:59Z), je genau eine Zeile pro Mandat, keine Fremd- oder Dublettenzeile.

### 13.6 Keine neuen Fehler

- **Vercel:** `get_runtime_errors` über 6 h — **keine**. Im Fenster 15:55–16:20 UTC genau
  **eine** Anfrage (`/api/cron/pipeline`, 200); keine Worker-, Admin- oder Ops-Route.
- **PostgreSQL:** das Logfenster deckt 2026-08-10 16:44Z bis 2026-08-11 16:20Z ab. Im
  Lauffenster stehen **nur zwei Routine-Zeilen** (`checkpoint starting`/`complete`) —
  **0 ERROR, 0 WARNING, 0 Berechtigungsfehler**. Die neun ERROR-Zeilen des Tages sind
  ausnahmslos fehlgeschlagene Ad-hoc-Leseabfragen aus Prüfsitzungen („column … does not
  exist"), die zwölf WARNING-Zeilen stammen aus dem Migrationsfenster 10:47–10:52Z.
- **Google-Abrufstörungen** (Timeouts/HTTP 503) traten wie in jedem Lauf auf. Sie sind die
  dokumentierte **vorbestehende Basisklasse** (OP-15), wurden von der Härtung abgefangen
  (`abruf=0`, `fehler=0`, `failed_count=0`) und sind **keine** neue Fehlerklasse.
- **Security-Advisor:** unverändert — INFO `rls_enabled_no_policy` für die beiden neuen
  Tabellen (der geprüfte Vertrag) und der vorbestehende WARN `extension_in_public`
  (`vector`). **Kein neuer WARN, kein ERROR.**

### 13.7 Flagzustand

Alle OP-30-Flags sind **aus**. Direkte Env-Einsicht bleibt aus Sitzungen unmöglich
([`env-inventar.md`](env-inventar.md) §8); der Nachweis ist deshalb **wirkungsbasiert und
insoweit schlüssig**: mit `HELMUT_SCALABLE_PIPELINE=on` hätte der Lauf zwingend Aufträge
angelegt (`scalable-pipeline-flag-test` §1–§3, `flagmatrix-op30-test` 75/75). `n_tup_ins=0`
auf beiden Tabellen schließt das aus. `HELMUT_NARRATIV_QUEUE` allein wäre ohnehin
wirkungslos (§6). Eine Bestätigung durch Betreiber-Sichtprüfung in Vercel bleibt der
einzige direkte Weg und ist **nicht** erfolgt.

### 13.8 Ergebnis und Grenzen

**Neutralitätsnachweis bestanden — alle 16 Prüfpunkte grün.** Der bisherige Betrieb
verhält sich bei ausgeschalteten Flags unverändert; kein Bestandteil von OP-30 wurde
gestartet; OP-30 verursachte **null** zusätzliche Aufträge, Aufrufe, Kosten und Pushs.

**Was das nicht beweist:** nichts über das Verhalten **mit** eingeschaltetem Flag (§10
gilt unverändert), nichts über 25 oder 200 Mandate, und es ersetzt weder K0–K3 noch den
nach einer Aktivierung fälligen neuen OP-25-Nachweis. Damit ist die Vorbedingung für einen
**eigenen Aktivierungssprint mit exakt fünf Mandaten** (§6 Schritt 3–5) erfüllt; dessen
Start bleibt eine Betreiberentscheidung.

**Nicht getan (Verbote eingehalten):** kein manueller Lauf, kein Cron ausgelöst, keine
Env-Variable, kein Flag, kein Worker, keine Migration angewendet oder zurückgenommen,
keine Production-Datenänderung, keine Mandatsänderung, `mdb-a` unangetastet, keine
Ausweitung auf 25 Mandate, kein Merge.
