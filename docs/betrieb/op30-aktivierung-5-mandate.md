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
>
> **Nachtrag 2026-08-11/5 (Aktivierungssprint, ausdrückliche Freigabe für
> `HELMUT_SCALABLE_PIPELINE=on`):** §6 Schritt 3 **konnte nicht ausgeführt werden** und
> wurde **nicht** ausgeführt. 14 von 15 Voraussetzungen erfüllt; es fehlt der Schreibweg
> zur Vercel-Production-Konfiguration (gemessen, §14.1). **Nichts aktiviert, nichts
> verändert, K0–K3 nicht begonnen** — vollständiger Beleg samt K0-tauglichem Vorzustand
> in **§14**.
>
> **Nachtrag 2026-08-11/6 — OP-30 IST AKTIV.** Der **Betreiber** hat
> `HELMUT_SCALABLE_PIPELINE=on` gesetzt und Production neu bereitgestellt (READY
> 18:52:47Z, unveränderter Commit `eb136522…`). Der einleitende Satz „Nichts ist
> aktiviert" gilt **nur noch für die Sprints /2 bis /5**. Diese Sitzung hat weiterhin
> **nichts aktiviert und nichts verändert** — sie kontrolliert rein lesend: **K0
> bestanden** (mit benannter Lücke), erster Lauf und K1–K3 in **§15**.
> **Ergebnis: K0 bestanden, erster Lauf sauber — aber in §8.2 ist die Grenze „ältester
> offener Auftrag > 24 h" eingetreten (`betriebsstatus zustand=kritisch`). Die Kontrollen
> sind deshalb bei K1 gestoppt; K2/K3 nicht begonnen. Ursache und Entscheidungsvorlage in
> §15.5/§15.6. Die Rücknahme ist eine Betreiberaktion.**
>
> **Nachtrag 2026-08-12/1 — OP-30 IST ZURÜCKGENOMMEN (rein lesend geprüft).** Der
> **Betreiber** hat `HELMUT_SCALABLE_PIPELINE` nur für Production auf `off` gesetzt und
> denselben Commit `eb136522…` erneut bereitgestellt (`dpl_7kcdpTbhLMQHH1eUNGVTcKuSYWBt`,
> READY **2026-08-12T00:54:14Z / 02:54:14 Uhr Berlin**). **Rücknahmebeleg §16.**
> Zustandsseitig vollständig: die 235 Aufträge stehen unverändert und ohne offene Enden,
> 0 Reservierungen, 0 KI-Aufrufe seit Mitternacht UTC, fünf Mandate und `mdb-a` unverändert,
> keine neuen Fehler. **Wirkungsseitig noch offen:** seit dem Redeployment gab es keinen
> Lauf durch `cronSchwererPfad` — entschieden wird das am **crawl 04:00 UTC / 06:00 Uhr
> Berlin** (§16.6). **Der Fünferlauf ist nicht bestanden; K2 und K3 bleiben offen** (§16.10).
> Die Korrektur der Altersgrenze ist ausdrücklich **ein eigener Folgesprint**.
>
> **Nachtrag 2026-08-12/2 — WIRKUNGSNACHWEIS BESTANDEN (rein lesend).** Der crawl 04:00 UTC
> lief **vollständig über den Altpfad**: Laufquittung `[cron/crawl/globalphase]` statt
> `[cron/crawl/warteschlange]`, `erfolgreich=5 fehlgeschlagen=0 zustand=ok`, und
> `helmut_jobs` hat **keinen einzigen Schreibvorgang** gesehen (`n_tup_ins/upd/del`
> unverändert 235/202/0). **OP-30 ist damit nachweislich aus**, §7 Schritt 5 ist erfüllt und
> der Rücknahmeplan vollständig abgenommen — **Beleg §16.12**.
>
> **Nachtrag 2026-08-12/3 — ALTERSGRENZE BERICHTIGT (Code + Migration, PR offen).** Der
> Fehlbefund aus §15.5 ist reproduziert (echte PostgreSQL) und behoben: die Grenze misst ab
> jetzt die **Wartezeit** ab `max(created_at, first_due_at)` statt der Fälligkeit. Ursache
> präzisiert: die **7-Tage-Fensterbreite des Archivabrufs**, nicht (nur) OP-15 — **§17**.
> **Production unverändert:** Flag `off`, Migration `20260812` **nicht angewendet**, die
> 235 Aufträge **unangetastet**. Vor dem nächsten Versuch sind die 180 offenen Aufträge zu
> neutralisieren — Begründung §17.7, Betreiberablauf §17.8.

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
   **✅ Vom Betreiber ausgeführt 2026-08-11** — Redeploy READY **18:52:47Z** auf
   unverändertem Commit `eb136522…` (Beleg §15.1). Der Versuch 2026-08-11/5 war zuvor vor
   jeder Änderung gestoppt worden, weil es aus Sitzungen keinen Schreibweg zur Vercel-Env
   gibt (§14); dieser Zugangsblocker besteht unverändert fort.
4. **Sofortkontrolle** (§8.4, Punkt K0).
   **✅ Erledigt 2026-08-11, 18:55–19:05 UTC — bestanden mit einer benannten Lücke
   (`/api/ops/jobqueue` mangels `CRON_SECRET` nicht abrufbar); Beleg §15.1.**
5. Beobachtung nach Kontrollplan §8.4 (K1 nach dem ersten vollen Lauf, K2 nach 24 h,
   K3 nach 72 h). Erst nach K3 grün ist die 5er-Aktivierung **bestanden**.
   **❌ Abgebrochen 2026-08-11 nach K1** — Abbruchgrenze §8.2 eingetreten (§15.5);
   **K2 und K3 nie begonnen ⇒ die 5er-Stufe ist NICHT bestanden.** Der Betreiber hat die
   Aktivierung am 2026-08-12 zurückgenommen (§7 Schritt 1, Beleg §16). Ein zweiter Versuch
   setzt die berichtigte Altersgrenze voraus (eigener Folgesprint, §16.10 Punkt 4).
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
   **✅ Vom Betreiber ausgeführt 2026-08-12, Redeploy READY 00:54:14 UTC / 02:54:14 Uhr
   Berlin — Rücknahmebeleg §16; Schritt 5 (Abnahme am nächsten Regellauf) steht aus.**
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
   **✅ Erfüllt 2026-08-12, crawl 04:01:15–04:04:40 UTC — Wirkungsnachweis bestanden
   (Beleg §16.12): Altpfad, 5/5 Mandate, `helmut_jobs` ohne jeden Schreibvorgang.**

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
| 11 | Alter des ältesten offenen Auftrags — **berichtigt 2026-08-12, verbindlich ist §17.5**: gemessen wird die **Wartezeit** ab `max(created_at, first_due_at)`, nicht die Fälligkeit | < 24 h (ab 24 h meldet `betriebsstatus` **kritisch** — bewusst dieselbe Grenze) |
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
| ältester offener Auftrag (**Wartezeit**, berichtigte Fassung → **§17.5**; der reine Fälligkeitsrückstand ist **nie allein** ein Abbruchgrund) | < 12 h | 12–24 h | > 24 h (`betriebsstatus` kritisch) |
| Slotdauer | ≤ 270 s | 270–280 s einmalig | > 280 s **zweimal in Folge** |
| `used` = 100 (Deckel) | nie | einmal, nach 20:00 UTC erreicht | vor 12:00 UTC erreicht **oder** 2 Tage in Folge 100 |
| Frischebelege | 5/5 | 4/5 einmal | < 5 zweimal in Folge |
| Warteschlangengröße | fallend je Slot | stagnierend 24 h | wachsend 24 h |
| Zurückstellquote je Lauf | < 30 % | 30–60 % | > 60 % über zwei Läufe (Leerlaufverdacht) |

### 8.3 Zweiter identischer Lauf — **queue-taugliche Fassung (berichtigt 2026-08-17, §19.6 Punkt 1)**

> **Die frühere Fassung („ein wiederholter Lauf erzeugt 0 neue KI-Aufrufe") ist für den
> Warteschlangenpfad falsch** und hat im zweiten Fünferlauf einen korrekten Betrieb als
> Kriterienverstoß erscheinen lassen (§19.3, Watchdog 13.08.): unter OP-30 ist der
> Watchdog-Zweitlauf ein **regulärer Drain-Slot** — er arbeitet legitim neuen Rückstand ab
> und darf dafür selbstverständlich KI-Aufrufe buchen.

Verbindlich ist ab jetzt: ein wiederholter Lauf im selben Aktualitätsfenster erzeugt
**keine Doppelarbeit** —

1. **0 doppelte Idempotenzschlüssel** (dieselbe Arbeit entsteht nie zweimal;
   Einreihung meldet `neu=false`),
2. **0 Doppel-Pushs** (genau 1 Push je Mandat und Tag, Messwert 12),
3. **Buchungen nur für erstmalige Arbeit**: jeder KI-Aufruf des Zweitlaufs gehört zu einem
   Auftrag, der zuvor **nicht** erledigt war (R4-Gegenprobe: Buchungen ↔ persistierte
   Gegenstücke; `existing`-Kurzschluss + ergebnisgebundene Reservierung unverändert bewiesen —
   Migrationskette 5.4, `morgenslot-idempotenz-test`, Budgetvertrag Zusage 3/6).

In Production prüfbar am Watchdog-Pipelinelauf (05:30-Workflow, feuert bedingungslos
dieselbe Route): erwartet ist **Drain ohne Dubletten** (wie am 13.08. gemessen: 31 erledigt,
0 Doppel-Pushs, 0 doppelte Schlüssel), **nicht** „0 neue KI-Aufrufe".

### 8.4 Kontrollplan nach der Aktivierung

| Kontrolle | Wann | Was |
|---|---|---|
| **K0 Sofort** | ≤ 15 min nach Redeploy | Deployment READY trägt den erwarteten Commit; `/api/ops/jobqueue`: `bereit:true` (Gründe leer), `altersvertrag="wartezeit"` (§17.5), **`statusvertrag=2` und `zustandsklasse` vorhanden (§26.4)**, **`HELMUT_SCALABLE_PIPELINE_SEIT` gesetzt und `motor.aktivSeit` trägt den Aktivierungszeitpunkt** (sonst zählt Altbestand ab `created_at` — §17.7(d)); keine Runtime-Fehler; `helmut_jobs` leer bzw. exakt der dokumentierte Reststand |
| **K1 Erster voller Lauf** | nach 04:00-crawl + 05:00-briefing + 05:30-Watchdog + 16:00-pipeline | Messwerte 1–15 einmal vollständig erheben; R4-Gegenprobe; **Watchdog-Zweitlauf ohne Doppelarbeit (§8.3 berichtigte Fassung: 0 doppelte Schlüssel, 0 Doppel-Pushs, Buchungen nur für erstmalige Arbeit)**; Frischebelege 5/5 |
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

## 14 · Aktivierungsversuch 2026-08-11/5 — **blockiert vor jeder Änderung** (rein lesend)

**Auftrag:** §6 Schritt 3–5 ausführen — ausschließlich `HELMUT_SCALABLE_PIPELINE=on`,
Redeploy, danach Kontrollplan K0–K3. Freigabe lag ausdrücklich vor.

**Ergebnis: nicht ausgeführt.** Die Vorprüfung (Phase 1) ergab **14 von 15 Voraussetzungen
erfüllt**; die fünfzehnte — *„die aktuelle Production-Konfiguration kann sicher eingesehen
und verändert werden"* — ist **nicht erfüllt**. Nach der Auftragsregel („wenn eine
Voraussetzung nicht eindeutig erfüllt ist, stoppe vor jeder Änderung") wurde **nichts**
verändert: kein Flag, keine Env-Variable, kein Redeploy, kein Lauf, keine Datenzeile.

### 14.1 Der Blocker, gemessen (nicht vermutet)

| Prüfung | Messung 2026-08-11, 17:46–17:47 UTC | Folge |
|---|---|---|
| `VERCEL_TOKEN` in der Sitzung | vorhanden (Wert nicht ausgegeben) | allein wertlos |
| Egress `api.vercel.com:443` | `CONNECT → HTTP 403` (Proxy-Statusmeldung: *policy denial*) | Vercel-REST-Weg gesperrt |
| Egress `vercel.com:443` | `CONNECT → HTTP 403` | Vercel-Oberfläche gesperrt |
| Vercel-MCP-Werkzeugsatz | Teams/Projekte/Deployments/Logs/Runtime-Fehler lesbar — **kein Environment-Werkzeug, kein Redeploy-Werkzeug** | Flag weder lesbar noch setzbar |
| Egress `helmut-pilot.vercel.app` | `CONNECT → HTTP 403` | K0-Erreichbarkeitsprüfung nicht durchführbar |
| `CRON_SECRET` in der Sitzung | nicht gesetzt | `/api/ops/jobqueue` (K0/K1-Messquelle) nicht abrufbar |

Damit gilt [`env-inventar.md`](env-inventar.md) §8 unverändert: **eine Vercel-Env-Änderung
ist nur möglich, wenn Token UND geöffneter Egress zusammenkommen.** Ein Umgehen der
403-Ablehnung ist untersagt und wurde **nicht versucht**. Zweiter, unabhängiger Blocker:
selbst bei gesetztem Flag wären **K0 und K1 aus dieser Sitzung nicht vollständig
belegbar** (weder Anwendungserreichbarkeit noch `/api/ops/jobqueue`).

Der Rücknahmeweg (§7 Schritt 1: Flag `off` + Redeploy) hängt am **selben** gesperrten Weg.
Eine Aktivierung durch diese Sitzung wäre also nicht nur unmöglich, sondern wäre — wenn sie
möglich gewesen wäre — **ohne eigenen Rückweg** erfolgt. Das ist der Grund, warum hier
gestoppt statt improvisiert wurde.

### 14.2 Vorprüfung Phase 1 — Ergebnis je Punkt (alles rein lesend)

| # | Voraussetzung | Befund |
|---|---|---|
| 1 | PR #242 gemergt | ✅ `merged=true`, 2026-08-11T17:43:10Z, Merge-Commit `eb136522b89c39a908c3feccbc2385f007dd5186` |
| 2 | Production-Deployment READY | ✅ **`dpl_7XYS3L6pMBtkQwiXJCswmWYkYKvY`**, `target=production`, `state=READY`, erstellt 17:43:13.974Z |
| 3 | Production auf dem erwarteten Commit | ✅ `githubCommitSha` = `eb136522…`, `githubCommitRef=main`, identisch mit lokalem `main`-HEAD |
| 4 | Neutralitätsbeweis vollständig dokumentiert | ✅ §13, 16 Prüfpunkte, im Repo auf `main` |
| 5 | Sechs OP-30-Migrationen registriert | ✅ exakt `20260811104749 / 104841 / 104923 / 105100 / 105131 / 105229`; Gesamtzahl 25 unverändert |
| 6 | `helmut_jobs` leer | ✅ 0 Zeilen; `n_tup_ins/upd/del = 0/0/0`, `idx_scan=0` (seit Anlage nie beschrieben) |
| 7 | `llm_reservations` leer | ✅ 0 Zeilen; `n_tup_ins/upd/del = 0/0/0`, `idx_scan=0` |
| 8 | Exakt die fünf Mandate aktiv | ✅ `annika-klose, cem-ince, helmut-kleebank, ottilie-paola-klein-2, ruppert-st-we` (9 Zeilen gesamt, 5 aktiv) |
| 9 | `mdb-a` unverändert und inert | ✅ `profiles` 1 / `decisions` 1 / `mandate_profiles` **0** — wie §9 |
| 10 | V2-Betrieb und OP-31 unauffällig | ✅ alle Läufe des Tages `success`/`partial`(Normalstand), `failed_count=0`; 10 Briefingzeilen (5× `morgenlage` 05:00:31–05:00:39Z, 5× `lage` 05:45:33–05:45:59Z), je genau eine je Mandat |
| 11 | Kein laufender Lauf/Worker | ✅ `process_runs` ohne `finished_at`: **0**; aktive Datenbankabfragen 0; gewährte Sperren fremder Sitzungen 0; nächster Regel-Slot erst 20:00 UTC |
| 12 | Kein ungeklärter Fehler-/Sperrzustand | ✅ Vercel-Runtime-Fehler 24 h: **keine**. PostgreSQL 24 h: 0 FATAL/PANIC, 0 Berechtigungsfehler; 10 ERROR = ausnahmslos fehlgeschlagene **Ad-hoc-Leseabfragen aus Prüfsitzungen** („column … does not exist", jüngste 17:47:48Z aus **dieser** Sitzung), 12 WARNING = Transaktionshinweise aus dem Migrationsfenster 10:47–10:52Z |
| 13 | Rücknahmeweg eindeutig ausführbar | ⚠️ **für den Betreiber ja** (§7, unverändert gültig) — **aus dieser Sitzung nein**, siehe §14.1 |
| 14 | Ausschließlich Production-Projekt `ddckuvvpcytqbyfmbvie` | ✅ einziges Projekt der Organisation, `ACTIVE_HEALTHY`, eu-west-1, PostgreSQL 17.6 |
| 15 | Production-Konfiguration einsehbar und veränderbar | ❌ **nicht erfüllt** — §14.1 |

### 14.3 Vorzustand (Phase 2) — erhoben 2026-08-11, **17:47 UTC / 19:47 Uhr Berlin**

Diese Werte sind die **verwendbare K0-Grundlinie** für den Betreiber: wer nach dem Setzen
des Flags Schritt 4 ausführt, vergleicht gegen genau diese Tabelle.

| Größe | Wert |
|---|---|
| Production-Commit | `eb136522b89c39a908c3feccbc2385f007dd5186` (Merge PR #242) |
| Production-Deployment | `dpl_7XYS3L6pMBtkQwiXJCswmWYkYKvY`, READY 17:43:13.974Z |
| Aktive Mandate | 5 (Liste §14.2 Punkt 8), `mandate_profiles` gesamt 9 |
| `helmut_jobs` | 0 Zeilen, nie beschrieben |
| `llm_reservations` | 0 Zeilen, nie beschrieben |
| KI-Budget `global.used` | **41** (2026-08-11) · Vortage: 69 (10.08.), 70 (09.08.) · Rahmen 100 + Reserve 30 |
| Briefingstand | `briefings` gesamt **163**; heute 10 Zeilen (5 `morgenlage` + 5 `lage`), OP-31-Frischebelege 5/5 |
| Letzter V2-Lauf | `cron-pipeline-20260811160305-zvzhe-global`, 16:03:05.566Z → 16:06:44.039Z, 218 472 ms, `partial` (Normalstand), `failed_count=0`, `commit_ref=6ed4f657…` |
| Letzter OP-31-Lauf | `briefing-morning-20260811050027-ewtbk`, `success`, 12 308 ms, `failed_count=0`; `briefing-lage-20260811054525-gk9l8`, `success`, 33 652 ms |
| Fehlergrundlinie | Vercel 0 Runtime-Fehler/24 h; PostgreSQL 0 FATAL, 10 ERROR (nur Ad-hoc-Leseabfragen), 12 WARNING (Migrationsfenster) |
| Struktur | `profiles` 10 · Policies 24 · registrierte Migrationen 25 |
| Relevante Flags | **nicht direkt einsehbar** (§14.1). Wirkungsbasiert unverändert belegt: alle OP-30-Flags **aus** (`n_tup_ins=0` auf beiden Tabellen). Keine Geheimnisse ausgegeben |

### 14.4 Kontrollplan K0–K3

**Nicht begonnen.** K0 setzt Schritt 3 (Flag + Redeploy) voraus; ohne Aktivierung gibt es
nichts zu kontrollieren. Es wurden **keine** Messwerte des Kontrollplans erhoben, kein
Auftrag angelegt, kein Mandat verarbeitet, keine Reservierung erzeugt, keine Zusatzkosten
verursacht (`global.used` unverändert 41). **Der Fünferlauf ist damit nicht bestanden —
er hat nicht stattgefunden.**

### 14.5 Was der Betreiber jetzt genau tun muss

Einer der beiden Wege, dann bleibt das Runbook unverändert gültig:

1. **Empfohlen — Betreiber setzt selbst:** in Vercel → Projekt `helmut-pilot` → Settings →
   Environment Variables → **nur** `HELMUT_SCALABLE_PIPELINE=on`, **nur** Environment
   *Production*; danach Redeploy des aktuellen Production-Commits `eb136522…`
   (Deployments → aktuelles Production-Deployment → *Redeploy*, **ohne** Build-Cache-Zwang
   ist nicht nötig). Anschließend §6 Schritt 4–5 (K0 sofort, K1/K2/K3) — K0/K1 brauchen
   `/api/ops/jobqueue` mit `CRON_SECRET`, das nur der Betreiber hat.
2. **Alternativ — Sitzung befähigen:** Egress zu `api.vercel.com` in den Claude-Code-
   Environment-Einstellungen freigeben **und** `CRON_SECRET` als Environment-Variable
   hinterlegen (nie über den Chat). Dann kann eine Folgesitzung §6 Schritt 3–5 und K0–K3
   vollständig selbst ausführen und belegen. Vorher: erneut §14.2 durchprüfen, weil sich
   Lauf- und Zeitlage bis dahin verschieben.

**Wichtig für beide Wege:** Die Grenzen aus §8.2 gelten unverändert; K3 (72 h) entscheidet.
Eine Ausweitung auf 25 Mandate bleibt bis dahin ausgeschlossen — und danach zusätzlich vom
neu bestandenen OP-25-Nachweis abhängig.

### 14.6 Nicht getan (Verbote eingehalten)

Kein Flag gesetzt oder geändert · keine Env-Variable · kein Redeploy · kein manueller
Cronlauf · kein Worker · keine Migration angewendet oder zurückgenommen · keine
Production-Datenänderung · keine Mandatsänderung · `mdb-a` unangetastet · keine Testdaten ·
keine Grenzwerte verändert · keine Sicherheitsprüfung umgangen · kein 403-Umgehungsversuch ·
keine Geheimnisse ausgegeben · kein Merge · keine Ausweitung auf 25 Mandate.

## 15 · OP-30 ist aktiv — Kontrollen ab 2026-08-11/6 (rein lesend)

**Der Betreiber hat §6 Schritt 3 selbst ausgeführt** (Weg 1 aus §14.5). Diese Sitzung hat
**nichts aktiviert und nichts verändert**: kein Flag, keine Env-Variable, kein Redeploy,
kein manueller Lauf, keine Datenzeile. Alle Zugriffe sind rein lesend.

**Zugangslage unverändert (erneut gemessen, 18:55–18:58 UTC):** `api.vercel.com:443`,
`vercel.com:443` und `helmut-pilot.vercel.app` antworten weiterhin `CONNECT → HTTP 403`;
`CRON_SECRET` ist in dieser Sitzung **nicht** gesetzt. Neu gegenüber §14: die Anwendung ist
über das **Vercel-MCP-Lesewerkzeug** (`web_fetch_vercel_url`) abrufbar — damit ist die
K0-Erreichbarkeitsprüfung möglich, `/api/ops/jobqueue` bleibt es nicht.
**Folge, die ehrlich benannt bleiben muss: diese Sitzung kann den Rücknahmeweg (§7 Schritt 1)
weiterhin nicht selbst ausführen.** Tritt ein Abbruchkriterium aus §8.2 ein, ist das
Ausschalten des Flags eine **Betreiberaktion**.

### 15.1 K0 — Sofortkontrolle (durchgeführt 18:55–19:05 UTC / 20:55–21:05 Uhr Berlin)

Bezugsgröße ist die K0-Grundlinie aus §14.3 (erhoben 17:47 UTC, vor der Aktivierung).

| # | Prüfpunkt | Befund | Urteil |
|---|---|---|---|
| 1 | Welches Production-Deployment ist READY | **`dpl_BmBpsBmg6QK2ydJVg57tx8JVeVGN`** — `target=production`, `state/readyState=READY`, Aliasse `helmut-pilot.vercel.app`, `helmut-pilot-nohut.vercel.app`, `helmut-pilot-git-main-nohut.vercel.app`, Region `fra1` | ✅ |
| 2 | Welcher Commit läuft tatsächlich | `githubCommitSha` **`eb136522b89c39a908c3feccbc2385f007dd5186`**, `githubCommitRef=main` — identisch mit `main`-HEAD (Merge PR #242) und mit dem Vor-Aktivierungsstand. `source/action = redeploy`, `originalDeploymentId = dpl_7XYS3L6pMBtkQwiXJCswmWYkYKvY` ⇒ **reine Konfigurationsänderung, kein Codewechsel** | ✅ |
| 3 | Wann war das neue Deployment bereit | erstellt **18:52:32.338Z**, Build ab 18:52:35.039Z, **READY 18:52:47.418Z** (= 20:52:47 Uhr Berlin). **Zwei** Redeploys desselben Commits: `dpl_H2ReArdsfMuxwTiNaoZF2jTkuwsR` 18:50:54.086Z und der obige 98 s später; der zweite trägt die Production-Aliasse und ist der wirksame Stand | ✅ (Doppel-Redeploy vermerkt, unschädlich) |
| 4 | Anwendung erreichbar und fehlerfrei | `GET https://helmut-pilot.vercel.app/` → **HTTP 200**, 18:57:54Z, vollständige HTML-Auslieferung, Sicherheitskopfzeilen (CSP, HSTS, `x-frame-options`) unverändert. **Ausgelieferte Asset-Version `?v=eb136522`** — der laufende Commit ist damit **aus der Anwendung selbst** bestätigt, nicht nur aus der Deployment-Verwaltung | ✅ |
| 5 | Weiterhin exakt fünf Mandate aktiv | `mandate_profiles`: **5 aktiv** — `annika-klose, cem-ince, helmut-kleebank, ottilie-paola-klein-2, ruppert-st-we`; 9 Zeilen gesamt | ✅ unverändert |
| 6 | `mdb-a` unverändert inert | `profiles` 1 / `decisions` 1 / `mandate_profiles` **0** — identisch zu §9 und §14.3 | ✅ unverändert |
| 7 | Ausgangszustand `helmut_jobs` / `llm_reservations` vor dem ersten aktiven Lauf | beide **0 Zeilen**; `pg_stat_user_tables`: `n_tup_ins/upd/del = 0/0/0`, `idx_scan = 0` auf **beiden** Tabellen ⇒ seit ihrer Anlage (10:47 UTC) **nie beschrieben**. Die `seq_scan`-Zähler (18 bzw. 11) stammen ausschließlich aus den lesenden Prüfabfragen dieser und der Vorsitzungen | ✅ erwarteter Ausgangszustand |
| 8 | KI-Budget, Briefings, OP-31 unverändert | `llm_budget_counters` 2026-08-11 `global.used` = **41**, letzte Änderung **16:06:11Z** (also vom V2-Pipelinelauf, **nicht** von der Aktivierung) · `briefings` gesamt **163** · heute genau 10 Zeilen: 5× `morgenlage` (alle `status=erfolg`, 05:00:31–05:00:39Z) + 5× `lage` (05:45:33–05:45:59Z), je genau eine je Mandat | ✅ unverändert, **0 Zusatzkosten durch die Aktivierung** |
| 9 | Wurde ausschließlich der skalierbare Pipeline-Schalter wirksam | **aus dieser Sitzung nicht direkt belegbar** — Vercel-Environment bleibt weder lesbar noch setzbar (§14.1). Was belegt ist: es gab **keinen Codewechsel** (Punkt 2), **keine** neue Migration (letzte registrierte unverändert `20260811105229`, Gesamtzahl 25) und bis zum ersten Lauf **keine** Wirkung in den OP-30-Tabellen. Der wirkungsbasierte Nachweis ist erst am ersten Lauf möglich (§15.3/§15.4) | ⚠️ **offen bis zum ersten Lauf** |
| 10 | Andere Production-Änderung erkennbar | **nein.** Registrierte Migrationen 25 (unverändert) · Policies `public` 24 (unverändert) · `profiles` 10 · `mandate_profiles` 9/5 · Security-Advisor unverändert (20× INFO `rls_enabled_no_policy` inkl. der zwei OP-30-Tabellen — der geprüfte Vertrag — sowie der vorbestehende WARN `extension_in_public` für `vector`; **kein neuer WARN, kein ERROR**) · Vercel-Runtime-Fehler seit dem Redeploy: **keine** (jüngste Fehlerzeilen 16:03:03Z aus dem V2-Pipelinelauf, ausnahmslos die dokumentierte Google-Basisklasse OP-15) · `process_runs` ohne `finished_at`: **0** (kein Lauf in Arbeit) | ✅ |

**K0-Ergebnis: bestanden, mit einer benannten Lücke.** Neun von zehn Punkten sind belegt;
Punkt 9 ist aus dieser Sitzung strukturell nicht direkt prüfbar.

**Was K0 laut §8.4 zusätzlich verlangt und hier NICHT geleistet werden konnte:**
`/api/ops/jobqueue` mit `bereit:true` und leeren Gründen. Die Route ist `authorizeCron`-
geschützt und `CRON_SECRET` liegt dieser Sitzung nicht vor. **Ersatzbeleg** (schwächer, aber
ehrlich): die beiden Tabellen sind nachweislich leer **und nie beschrieben**, und der
Zustand „ein Worker darf und kann abarbeiten" wird ohnehin erst am ersten Lauf sichtbar.
Diese Teilprüfung bleibt damit **offen** und ist vom Betreiber nachzuholen.

### 15.2 Kein manueller Lauf — Begründung

Das Runbook erlaubt **keinen** manuellen Lauf: §6 kennt nach Schritt 3 nur Beobachtung
(Schritt 4/5), §8.4 bindet K1 ausdrücklich an die **regulären** Slots. Unabhängig davon
wäre er aus dieser Sitzung technisch nicht auslösbar (`CRON_SECRET` fehlt, Egress 403) und
er wäre ein kostenverursachender Lauf. Es wurde **kein** alternativer Zugriffsweg gesucht
oder gebaut.

### 15.3 Wann der erste gültige Lauf mit aktivem OP-30 stattfindet — **berichtigt**

Die Annahme „nächster Lauf am 12.08.2026 um 16:00 UTC / 18:00 Uhr Berlin" ist **falsch**.
Belegt am Code und am Betriebsverlauf:

- `server.js:845` ruft `cronSchwererPfad("crawl", …)` und `server.js:1030`
  `cronSchwererPfad("pipeline", …)`. Der Einsprung in die Warteschlange
  (`skalierbarerPfadAktiv() → return runCronUeberWarteschlange(…)`) sitzt **in
  `cronSchwererPfad` selbst** — er gilt also für **beide** Crons, nicht nur für `pipeline`.
- `vercel.json` plant `/api/cron/crawl` **zweimal** täglich: `0 4 * * *` **und `0 20 * * *`**.
- Der 20:00-Slot ist real belegt: `cron-crawl-20260810200142-iquxi` (10.08., 20:01:42Z),
  `cron-crawl-20260809200052-zxn0v` (09.08.).

**Der erste gültige Production-Lauf mit aktivem OP-30 ist daher der `crawl`-Slot am
2026-08-11 um 20:00 UTC (22:00 Uhr Berlin)** — rund 65 Minuten nach der Aktivierung, nicht
erst am Folgetag. Diese Sitzung wartet ihn ab und wertet ihn rein lesend aus (§15.4).

### 15.4 Erster Lauf mit aktivem OP-30 — `cron-crawl-20260811200004-xyejr`

**OP-30 ist wirksam.** Damit ist auch K0-Punkt 9 wirkungsbasiert beantwortet: der Schalter
`HELMUT_SCALABLE_PIPELINE` **hat gegriffen**, und zwar **nur er** — `HELMUT_NARRATIV_QUEUE`
hätte einen fünften Auftragstyp `tenant_narrative` erzeugt (0 vorhanden),
`HELMUT_LLM_FAIRNESS` hätte Zeilen in `llm_reservations` erzeugt (0 vorhanden).

Laufquittung (Vercel-Runtimelog, `GET /api/cron/crawl` **200**, Deployment
`dpl_BmBpsBmg6QK2ydJVg57tx8JVeVGN`):

```
[cron/crawl/warteschlange] 266583ms geplant=193 neu=193 worker=2 erledigt=55
  wiederholt=2 endgueltigFehler=0 wiedervorgelegt=0 rotation=5 zustand=kritisch
  lauf=cron-crawl-20260811200004-xyejr
[cron/crawl] 266583ms tenants=5 bounded=false lauf=cron-crawl-20260811200004-xyejr
```

**Angelegte Aufträge: 235** (193 in der Planung + 42 während des Laufs aus den frisch
geholten Dokumenten). Aufteilung nach Typ, Mandat und Zustand:

| Auftragstyp | Mandat | angelegt | erledigt | offen |
|---|---|---|---|---|
| `source_fetch` | (global) | 169 | 43 | 126 |
| `source_fetch` | annika-klose | 3 | 2 | 1 |
| `source_fetch` | cem-ince | 2 | 1 | 1 |
| `source_fetch` | helmut-kleebank | 3 | 2 | 1 |
| `source_fetch` | ottilie-paola-klein-2 | 3 | 2 | 1 |
| `source_fetch` | ruppert-st-we | 3 | 2 | 1 |
| `document_understanding` | (global) | 42 | 3 | 39 |
| `mandate_projection` | je 1 für **alle fünf** | 5 | 0 | 5 |
| `briefing_materialization` | je 1 für **alle fünf** | 5 | 0 | 5 |
| **Summe** | | **235** | **55** | **180** |

**Belegte Antworten auf die Kontrollfragen des Auftrags:**

| Frage | Befund |
|---|---|
| Nur die fünf aktiven Mandate berücksichtigt | ✅ Aufträge mit `tenant_id` außerhalb der fünf aktiven Mandate: **0** |
| Auftrag für `mdb-a` | ✅ **0** — `mdb-a` blieb vollständig unbeteiligt und unverändert |
| Abhängigkeiten und Reihenfolge | ✅ korrekt: `source_fetch` ab 20:00:06 → `document_understanding` ab 20:00:26 (erst nach den Dokumenten) → `mandate_projection`/`briefing_materialization` bleiben **wartend**, weil ihre Vorbedingung (Verstehen) offen ist. Keine Projektion ohne Verstehen, kein Briefing ohne Projektion |
| Abgeschlossen / zurückgestellt / abgebrochen | **55 erledigt** · **43 zurückgestellt** · **0 endgültig fehlgeschlagen** · 0 abgebrochen. Zurückstellgründe ausschließlich: `verstehen-uebersprungen: understanding-locked` (39) und `zeitbudget-des-laufs-erschoepft` (4) |
| Verloren / hängengeblieben / unkontrolliert wiederholt | ✅ nichts: 0 offene Leases, 0 Aufträge in `laufend`, `wiederholt=2` (beide `auftrag-zeitlimit`, `attempts=1` von `max_attempts` 3 bzw. 5), 0 doppelte Idempotenzschlüssel |
| Faire Berücksichtigung aller fünf | ✅ `rotation=5`; jedes Mandat hat eigene `source_fetch`-, Projektions- und Briefingaufträge; die erledigten mandatseigenen Abrufe verteilen sich 2/1/2/2/2 |
| Einträge in `llm_reservations` | **0** — **erwartet**, weil `HELMUT_LLM_FAIRNESS` bewusst **aus** ist (§1). Die Reservierungsschicht gehört zu diesem Flag, nicht zum Warteschlangenpfad |
| Tatsächliche KI-Aufrufe | **+11** (`global.used` 41 → 52, 20:04:12Z) |
| Reservierungen / Aufrufe / Kosten passen zusammen | ✅ **+11 KI-Aufrufe = +11 neue `knowledge_objects`** im selben Fenster. Keine Reservierung, keine Buchung ohne Gegenstück, keine Doppelzählung (R4-Gegenprobe: Abweichung **0**) |
| KI-Deckel eingehalten | ✅ 52 von Rahmen 100 (+ Reserve 30); Vortage 69/70. **Kein** Deckelkontakt |
| Korrekte Briefings entstanden | ⚠️ **in diesem Slot keine** — Projektion und Briefing stehen für alle fünf noch aus (siehe Reihenfolge). Der `crawl`-Slot ist auch im Altbetrieb kein Briefingslot; die Morgenlage entsteht um 05:00 UTC |
| Doppelte Briefings / konkurrierende Pushs | ✅ **0** — `briefings` unverändert **163**, keine neue Zeile, kein Push. `scalable-pipeline.js` enthält keinen Pushaufruf |
| V2 unbeabsichtigt parallel | ✅ **nein** — `process_runs` unverändert **150** (der Altpfad legt dort Läufe an), `decisions` seit 19:55 **+0**, keine `globalphase`-Logzeile. Der Pfadwechsel ist ein `return`, wie in §1 beschrieben |
| OP-31 und Frischebelege intakt | ✅ die zehn Belegzeilen des Tages unverändert (5× `morgenlage` `status=erfolg`, 5× `lage`). **Der eigentliche OP-31-Test ist der Morgenlauf 05:00 UTC — er steht noch aus** |
| Neue Runtime-/DB-/RLS-/Berechtigungsfehler | ✅ **keine**: Route HTTP 200, 0 ERROR/FATAL, 0 Berechtigungsfehler, 0 RLS-Verstöße. Im Lauf protokolliert und abgefangen: 3× `blob-retry` (Supabase-Storage-Timeout, Wiederholung griff) und 1× `[understanding] skipped-error … OpenAI request timeout` — beide gehören zur dokumentierten Basisklasse, keine neue Fehlerklasse |
| Laufzeiten / Warteschlangentiefe / offene Aufträge in den Grenzen | ⚠️ **teilweise**: Slotdauer **266 583 ms < 270 000 ms** ✅ · Zurückstellquote 43/235 = **18,3 %** (< 30 %) ✅ · offene Aufträge **180** · **ältester offener Auftrag 5,84 Tage** ❌ |
| Normale Zurückstellung anschließend korrekt weiterverarbeitet | ⏳ **nicht prüfbar** — das zeigt sich erst am nächsten Slot (`understanding` 21:30 UTC / `crawl` 04:00 UTC) |

**Wichtigster fachlicher Einzelbefund — der portierte Produktfehler-Fix wirkt in Production.**
Die 39 übersprungenen Verstehensläufe (`understanding-locked`) sind **zurückgestellt**
(`status=wartend`, `attempts=0`, sichtbarer Grund im Auftrag) — **nicht** als erledigt
gemeldet. Genau das war der Fehler aus §4, der bis 2026-08-11 nur auf einem nie gemergten
Branch behoben war. Er ist damit erstmals unter echter Last belegt.

### 15.5 Abbruchkriterium — **eingetreten** (§8.2, Zeile „ältester offener Auftrag")

| Grenze aus §8.2 | Messwert | Urteil |
|---|---|---|
| Doppelte Verarbeitung / doppelter Push = 0 | 0 | ✅ weiterlaufen |
| `global.used` vs. fachliche Aufrufe, Abweichung 0 | 0 | ✅ weiterlaufen |
| endgültig fehlgeschlagene Aufträge 0 | 0 | ✅ weiterlaufen |
| Slotdauer ≤ 270 s | 266,6 s | ✅ weiterlaufen |
| `used` = 100 (Deckel) nie | 52 | ✅ weiterlaufen |
| Zurückstellquote < 30 % | 18,3 % | ✅ weiterlaufen |
| Frischebelege 5/5 | 5/5 (Vortagsstand, Morgenlauf steht aus) | ✅ vorerst |
| Warteschlangengröße fallend je Slot | erst ein Slot — nicht beurteilbar | ⏳ offen |
| Mandate mit Projektion je Fenster 5/5 | 0/5 in diesem Slot | ⚠️ beobachten |
| **ältester offener Auftrag < 12 h · 12–24 h · > 24 h** | **504 477 s = 5,84 Tage**, `betriebsstatus` meldet **`zustand=kritisch`** | ❌ **„sofort stoppen + zurücknehmen"** |

**Die Kontrollen werden hier beendet. K2 (24 h) und K3 (72 h) wurden nicht begonnen.**

**Genaue Ursache (damit der Betreiber in einer Minute entscheiden kann):** der kritische
Zustand kommt **nicht** von einem hängenden Auftrag und **nicht** von der Warteschlange
selbst. Von 180 offenen Aufträgen sind **176 jünger als 24 h**; genau **vier** tragen ein
zurückdatiertes Fälligkeitsdatum:

| Auftrag | Mandat | fällig seit |
|---|---|---|
| `source_fetch\|person\|…\|2026-08-06T00Z` | ottilie-paola-klein-2 | 2026-08-06 00:00 |
| `source_fetch\|person\|…\|2026-08-06T00Z` | annika-klose | 2026-08-07 06:14 |
| `source_fetch\|person\|…\|2026-08-06T00Z` | helmut-kleebank | 2026-08-08 12:28 |
| `source_fetch\|person\|…\|2026-08-06T00Z` | ruppert-st-we | 2026-08-09 18:43 |

Das sind die **Personenquellen** von vier der fünf Mandate. Ihr Aktualitätsfenster steht auf
`2026-08-06` — sie sind seither **nicht erfolgreich abgerufen** worden. Das deckt sich exakt
mit der vorbestehenden Fehlerklasse OP-15 (Google-News-Drosselung; die Runtime-Fehlerliste
zeigt für genau diese Quellen seit Wochen `Timeout`/`HTTP 503`).

**Bewertung, ehrlich getrennt:**

1. **Die Regel ist eingetreten und ist verbindlich.** §8.1 Nr. 11 und §8.2 binden das
   Abbruchkriterium ausdrücklich an denselben Wert, den `betriebsstatus` als `kritisch`
   meldet. Dieser Wert ist gemessen, nicht vermutet. Eine Sitzung darf eine verbindliche
   Abbruchgrenze **nicht** eigenmächtig umdeuten — deshalb wird gestoppt und eskaliert.
2. **Die Ursache ist mit hoher Wahrscheinlichkeit älter als die Aktivierung.** Der Rückstand
   der Personenquellen bestand schon vorher; der Altpfad kannte keinen Fälligkeitsbegriff und
   hat ihn deshalb **nie sichtbar gemacht**. Die Warteschlange macht ihn zum ersten Mal
   sichtbar — das ist die von CLAUDE.md §4.4 gewollte Ehrlichkeit, kein neuer Schaden.
3. **Daraus folgt ein echter Mangel am Nachweisvertrag, nicht (nur) am Betrieb** — *berichtigt
   und abgeschlossen am 2026-08-12, siehe §17: die Ursache ist die **7-Tage-Fensterbreite des
   Archivabrufs**, nicht (nur) der OP-15-Rückstand; die Grenze wäre bei jedem ersten Lauf in
   einem laufenden Archivfenster eingetreten. Punkt 2 dieser Liste bleibt richtig, Punkt 3
   ist durch §17.2 präzisiert:* die Grenze
   „ältester offener Auftrag" unterstellt stillschweigend, dass `due_at` das Alter des
   *Auftrags* misst. Tatsächlich misst sie das Alter der *Fälligkeit* und übernimmt damit
   beim allerersten Lauf einen vorbestehenden Datenrückstand. Für die Wiederholung muss die
   Grenze entweder auf `created_at` bezogen oder für den Erstlauf ausdrücklich ausgenommen
   werden. **Diese Änderung ist eine Betreiberentscheidung und wurde hier nicht vorgenommen.**

**Was gegen einen echten Notfall spricht** (ausdrücklich als Entscheidungshilfe, nicht als
Entwarnung): kein Auftrag verloren, keine Dublette, kein endgültiger Fehler, kein
Deckelkontakt, Slot im Zeitbudget, Rücknahmeweg unverändert intakt, Altpfad byte-identisch
reaktivierbar. **Was dafür spricht:** Projektion und Briefing aller fünf Mandate hängen
hinter 39 zurückgestellten Verstehensaufträgen, und der nächste Produktausgabe-Termin ist
die **Morgenlage 05:00 UTC**. Ob die Warteschlange bis dahin leerläuft, ist **unbewiesen**.

### 15.6 Was der Betreiber jetzt entscheiden muss

Diese Sitzung kann den Schalter **nicht** selbst zurücknehmen (§7 Schritt 1 verlangt
Vercel-Env-Zugriff; Egress unverändert `403`, kein Environment-/Redeploy-Werkzeug). Deshalb:

1. **Sicherer Weg (regelkonform):** `HELMUT_SCALABLE_PIPELINE` auf `off` setzen oder löschen
   (Vercel → `helmut-pilot` → Environment Variables, nur *Production*) **+ Redeploy**. Ab dem
   nächsten Cron-Fenster läuft der Altpfad unverändert; die 180 offenen Aufträge bleiben als
   ehrlicher Zustand stehen, niemand holt sie ab, es entstehen keine Kosten (§7 Schritt 2/3).
   Keine Rücknahmemigration nötig.
2. **Bewusstes Weiterlaufen:** wer den Befund aus §15.5 Punkt 2/3 teilt, kann die Aktivierung
   **stehen lassen** und den Morgenlauf abwarten — dann aber mit ausdrücklicher Entscheidung
   und mit einer **berichtigten Grenze** in §8.2. Prüfpunkte am Morgen: Morgenlage 5/5,
   Frischebelege 5/5, offene Aufträge fallend, `zustand` nicht mehr `kritisch`.

**Vor jeder Ausweitung bleibt es unverändert dabei:** keine 25 Mandate ohne bestandenes K3
**und** ohne neu bestandenen OP-25-Nachweis.

### 15.7 Nicht getan (Verbote eingehalten)

Kein Flag gesetzt oder geändert · keine Env-Variable · kein Redeploy · kein manueller
Cronlauf · kein Worker gestartet · keine Migration angewendet oder zurückgenommen · **keine
Rücknahmemigration** · keine Production-Datenänderung · keine Mandatsänderung · `mdb-a`
unangetastet · keine Testdaten · keine Grenzwerte erhöht oder verändert · keine Codeänderung ·
kein 403-Umgehungsversuch · keine Geheimnisse ausgegeben · kein Merge · **keine Ausweitung
auf 25 Mandate**.

## 16 · Rücknahmebeleg (Sprint 2026-08-12/1, rein lesend)

**Der Betreiber hat die Aktivierung zurückgenommen** (§7 Schritt 1, Weg 1 aus §15.6):
`HELMUT_SCALABLE_PIPELINE` in Vercel **nur für Production** auf `off` gesetzt und den
unveränderten Commit erneut bereitgestellt. Dieser Abschnitt prüft die Rücknahme
**gegen den sichtbaren Zustand**, nicht gegen die Angabe. Alle Zugriffe waren rein lesend;
kein Lauf, kein Flag, keine Datenänderung.

**Ergebnis in einem Satz:** die Rücknahme ist **zustandsseitig vollständig belegt und
gefahrlos**, **wirkungsseitig aber noch nicht** — seit dem Redeployment hat schlicht kein
Lauf stattgefunden, der den Warteschlangenpfad hätte benutzen können (§16.5).

### 16.1 Das laufende Production-Deployment

| Größe | Messwert |
|---|---|
| Deployment | **`dpl_7kcdpTbhLMQHH1eUNGVTcKuSYWBt`** |
| Zustand | `state`/`readyState` **`READY`**, `target=production`, Region `fra1` |
| Aliasse | `helmut-pilot.vercel.app` · `helmut-pilot-nohut.vercel.app` · `helmut-pilot-git-main-nohut.vercel.app` ⇒ **dieses Deployment beliefert Production** |
| Commit | `githubCommitSha` = **`eb136522b89c39a908c3feccbc2385f007dd5186`** — exakt der genannte Commit, unverändert `main`-HEAD (Merge PR #242) |
| Herkunft | `source=redeploy`, `originalDeploymentId=dpl_7XYS3L6pMBtkQwiXJCswmWYkYKvY` ⇒ **kein Codewechsel**, reine Konfigurationsänderung |
| Angelegt | `createdAt` **2026-08-12T00:54:01.443Z** = **02:54:01 Uhr Berlin (CEST)** |
| Betriebsbereit | `ready` **2026-08-12T00:54:14.310Z** = **02:54:14 Uhr Berlin** |

**Wirksam wurde die Abschaltung mit `ready`, also 2026-08-12T00:54:14Z / 02:54:14 Uhr
Berlin.** Ab diesem Zeitpunkt liefert Production die Konfiguration dieses Deployments aus.

**Vollständigkeitshalber, weil es sonst wie zwei Abschaltungen aussieht:** wie schon bei der
Aktivierung liegen **zwei** Redeploys dicht beieinander — `dpl_HmZqRHMUg8nQqkbsMNhB6vMnAnNe`
(00:52:12.037Z, Redeploy des *Aktivierungs*-Deployments) und das obige (00:54:01.443Z,
Redeploy des Deployments **vor** der Aktivierung). Beide sind `READY`; **die Aliasse trägt
nur das zweite**, und nur das zweite ist damit Production.

### 16.2 Die Anwendung ist erreichbar — und meldet denselben Commit

`GET https://helmut-pilot.vercel.app/` am 2026-08-12T01:26:10Z: **HTTP 200**,
`server: Vercel`, `x-vercel-id: …fra1…`, vollständiges Helmut-Dokument.
Die ausgelieferte Seite trägt die Asset-Version **`?v=eb136522`** (`styles.css`, `client.js`,
Manifest, Icons) — **die Anwendung selbst bestätigt den laufenden Commit**, unabhängig von
der Vercel-Verwaltungssicht.

Gegenprobe im Vercel-Runtimelog: `GET /` **200** (00:54:15Z, 00:54:15Z, 00:54:16Z) und
`GET /api/auth/session` **200** (00:54:16Z, 00:54:17Z), jeweils
`dep=dpl_7kcdpTbhLMQHH1eUNGVTcKuSYWBt` — das neue Deployment hat unmittelbar nach
`ready` fehlerfrei ausgeliefert.

### 16.3 Die 235 Aufträge — unverändert, vollständig, ohne offene Enden

Der Auslöse-Trigger `helmut_jobs_kappen_trg` (`BEFORE INSERT OR UPDATE`, Migration
`20260808_scalable_job_queue.sql`) setzt bei **jedem** Schreibvorgang `updated_at := now()`.
`max(updated_at)` ist damit ein harter, nicht umgehbarer Beleg dafür, wann die Tabelle
zuletzt berührt wurde.

| Prüfpunkt | Messwert (2026-08-12 01:22Z) | Urteil |
|---|---|---|
| Zeilen gesamt | **235** | unverändert (= K1-Stand §15.4) |
| `n_tup_ins` / `n_tup_upd` / `n_tup_del` | **235 / 202 / 0** | genau 235 Anlagen insgesamt, **nie gelöscht** |
| `max(created_at)` | 2026-08-11 **20:03:54.674Z** | **kein Auftrag nach dem 20:00-Lauf angelegt** |
| `max(updated_at)` | 2026-08-11 **20:04:26.487Z** | **kein Auftrag seither verarbeitet, verändert oder zurückgestellt** |
| `max(finished_at)` | 2026-08-11 20:03:56.941Z | letzter Abschluss im 20:00-Lauf |
| verschiedene Idempotenzschlüssel | **235** | 0 Dubletten |
| `status='laeuft'` | **0** | kein Auftrag hängt in Verarbeitung |
| `status='fehlgeschlagen'` | **0** | **0 endgültige Fehlschläge** |
| `lease_owner` **oder** `lease_expires_at` gesetzt | **0** | **keine offenen Leases, keine verlorenen Aufträge** |
| `attempts > 1` | **0** | keine unkontrollierte Wiederholung |
| `wiedervorlagen > 0` | **0** | keine Wiedervorlage ausgelöst |
| Aufträge außerhalb der fünf aktiven Mandate | **0** | keine Fremdmandate |
| Aufträge für `mdb-a` | **0** | unverändert unbeteiligt |

**Zustand nach Typ** (Summe 235 = 55 erledigt + 180 wartend):

| Auftragstyp | erledigt | wartend | Summe |
|---|---|---|---|
| `source_fetch` | 52 | 131 | 183 |
| `document_understanding` | 3 | 39 | 42 |
| `mandate_projection` | 0 | 5 | 5 |
| `briefing_materialization` | 0 | 5 | 5 |

**Zustand nach Ursache** (Summe 235): 55 `erledigt` (`attempts=1`, **kein** Fehlertext) ·
178 `wartend` mit `attempts=0`, davon **43** mit sichtbarem Zurückstellgrund
(`zurueckgestellt: verstehen-uebersprungen: understanding-locked` u. a.) · **2** `wartend`
mit `attempts=1` und Grund `auftrag-zeitlimit (document_understanding, 22 216 ms)`.
Mandatsverteilung unverändert: annika-klose 5 · cem-ince 4 · helmut-kleebank 5 ·
ottilie-paola-klein-2 5 · ruppert-st-we 5 · ohne Mandatsbezug (global) 211.

**Das ist genau der von §7 Schritt 2 versprochene Zustand:** die Aufträge stehen als
ehrlicher Rückstand still, niemand holt sie ab, nichts läuft ins Leere, nichts ist verloren.

**Ein Hinweis, der bei der Entscheidung zählt:** **alle 235 Aufträge sind fällig**
(`due_at ≤ now`, 235/235). Sie sind also nicht durch eine Wartezeit gebremst, sondern
ausschließlich dadurch, dass niemand sie abholt. Genau deshalb ist der nächste Regellauf ein
scharfer Test (§16.5).

### 16.4 Reservierungen, KI-Aufrufe und Kosten

| Prüfpunkt | Messwert | Urteil |
|---|---|---|
| `llm_reservations` Zeilen | **0** | leer |
| `llm_reservations` `n_tup_ins`/`upd`/`del` | **0 / 0 / 0** | **seit Anlage nie beschrieben** |
| `llm_reservations` `idx_scan` | **0** | nie über Index gelesen |
| `llm_budget_counters` 2026-08-11 `global.used` | **73**, zuletzt 21:34:44Z | erklärt, siehe unten |
| `llm_budget_counters` 2026-08-12 | **keine Zeile vorhanden** | **0 KI-Aufrufe seit 00:00 UTC** ⇒ **0 nach der Abschaltung** |

**Lückenlose Herleitung der 73 (keine offene Differenz):** 41 (K0-Grundlinie 17:47Z, §14.3)
→ **52** nach dem OP-30-Lauf (**+11**, §15.4, gegengeprüft an +11 neuen `knowledge_objects`)
→ **73** nach dem `understanding`-Cron 21:30 (**+21** = dessen `processed_count=21`,
Altpfad, von OP-30 unberührt). Der KI-Rahmen 100 (+30 Reserve) wurde **nie** erreicht;
Vortage 69/70.

**Nach der Abschaltung sind durch OP-30 keinerlei KI-Aufrufe und keinerlei Kosten
entstanden** — für 2026-08-12 existiert überhaupt keine Zählerzeile, und die
Reservierungstabelle wurde nie beschrieben.

*Belegtreue:* die Tabelle `llm_usage` (Modell, Tokens, `estimated_cost`) ist in Production
**vollständig leer** und wird nicht geführt. Eine Kostenangabe in USD lässt sich für dieses
Fenster deshalb **nicht** aus der Datenbank belegen; belastbar ist allein die
**Aufrufzahl** aus `llm_budget_counters`. Das ist die bekannte Lücke aus
[`kostenmessung.md`](kostenmessung.md), kein neuer Befund.

### 16.5 Warum die Abschaltung **noch nicht** wirkungsbasiert belegt ist

Der Einsprung in die Warteschlange sitzt in `cronSchwererPfad` (`server.js:6701`) und wird an
**genau zwei** Stellen aufgerufen: `crawl` (`server.js:845`) und `pipeline`
(`server.js:1030`). Wirksam werden kann OP-30 also nur in den Slots **crawl 04:00/20:00 UTC**
und **pipeline 16:00 UTC**.

Seit dem Redeployment (`ready` 00:54:14Z) hat Production ausschließlich folgende Anfragen
gesehen (Vercel-Runtimelog, nach `requestPath` gruppiert, Fenster 2026-08-11T20:04:40Z →
2026-08-12T01:28Z): `/` **5** · `/api/auth/session` **2** · `/api/cron/understanding` **1**
(21:30:48Z, also **vor** der Abschaltung). **Kein `crawl`, kein `pipeline`, kein Worker,
keine Ops-Route.**

⇒ **Es hat seit der Abschaltung kein Lauf stattgefunden, der den neuen Pfad hätte benutzen
können.** Dass `helmut_jobs` unberührt ist, beweist deshalb im Moment nur, dass **nichts**
lief — nicht, dass das Flag `off` ist. Das wird hier ausdrücklich **nicht** als Beleg
ausgegeben (CLAUDE.md §4.4).

**Direkt nachsehen geht aus einer Sitzung weiterhin nicht** (unverändert
[`env-inventar.md`](env-inventar.md) §8; am 2026-08-12 01:22–01:26Z erneut gemessen, nicht
vermutet): `api.vercel.com:443` per `curl` **`CONNECT tunnel failed, response 403`** ·
`helmut-pilot.vercel.app` per `curl` ebenso `403` (erreichbar nur über das Vercel-MCP-
Werkzeug, §16.2) · `CRON_SECRET` **nicht gesetzt** ⇒ `/api/ops/jobqueue` — der einzige
Endpunkt, der `pfadAktiv` ausgibt — ist fail closed nicht abrufbar · Vercel-MCP ohne
Environment- und Redeploy-Werkzeug. Ein Umgehen der Ablehnung ist untersagt und wurde
**nicht** versucht.

**Was den Betreiberangaben nicht widerspricht** (schwache, aber echte Anzeichen): das
Deployment ist ein `redeploy` **des Deployments vor der Aktivierung**, es ist `READY`, es
trägt die Aliasse, und es ist zeitlich exakt dort, wo die Rücknahme gemeldet wurde. Das
ersetzt den Wirkungsnachweis **nicht**.

### 16.6 Der nächste reguläre Lauf — und was ihn zum eindeutigen Test macht

**Nächster Lauf durch `cronSchwererPfad`: `crawl` am 2026-08-12 um 04:00 UTC = 06:00 Uhr
Berlin** (Vercel-Cron `0 4 * * *`, `vercel.json`). Zweite Gelegenheit: der
GitHub-Actions-Watchdog `briefing-watchdog.yml` (05:30 UTC, feuert `/api/cron/pipeline`
bedingungslos, verzögert regelmäßig um 2–3 h).

Der Test ist **zweiseitig und ohne Auslegungsspielraum**, weil alle 235 Aufträge fällig sind:

| Wenn die Abschaltung wirkt | Wenn das Flag noch wirksam wäre |
|---|---|
| `helmut_jobs` bleibt **exakt** bei 235 Zeilen, `max(updated_at)` bleibt **2026-08-11 20:04:26.487Z**, `n_tup_upd` bleibt **202** | Aufträge werden sofort beansprucht: `n_tup_upd` steigt, `status='laeuft'` und `lease_owner` treten auf, `updated_at` wandert |
| `process_runs` bekommt eine `globalphase`-Zeile des Altpfads, Logzeile `[cron/crawl]` **ohne** `warteschlange` | Logzeile `[cron/crawl/warteschlange] … geplant=… worker=…` |

**Geplante Fortsetzung: rein lesend, unmittelbar nach dem 04:00-Lauf** (Prüfzeitpunkt
04:15 UTC / 06:15 Uhr Berlin, damit die Laufquittung vollständig vorliegt). Prüfliste:

1. `helmut_jobs`: Zeilenzahl, `max(updated_at)`, `n_tup_ins`/`upd`/`del`, `status='laeuft'`, Leases
2. `llm_reservations`: weiterhin `0 / 0 / 0`
3. `process_runs`: Zeile des 04:00-Laufs, `commit_ref`, `status`, `failed_count`
4. Vercel-Runtimelog: Laufquittung **mit oder ohne** `warteschlange`
5. `llm_budget_counters` für 2026-08-12 (Aufrufzahl des Tages)
6. Morgenlauf 05:00 UTC: `frischevertrag.belegt=5/5`, fünf Belegzeilen, genau ein Push je Mandat
7. genau fünf aktive Mandate · `mdb-a` weiterhin inert
8. neue Runtime-, Datenbank-, RLS- oder Berechtigungsfehler

**Kein manuelles Auslösen eines Cronlaufs** — der Slot kommt von selbst.

### 16.7 Fünf Mandate, `mdb-a`, V2 und OP-31

| Prüfpunkt | Messwert | Urteil |
|---|---|---|
| aktive Mandate | **5**: `annika-klose`, `cem-ince`, `helmut-kleebank`, `ottilie-paola-klein-2`, `ruppert-st-we` | unverändert |
| `mandate_profiles` gesamt / letzte Änderung | 9 / **2026-08-06 08:01:31Z** | seit dem K2-Betreiberschritt **nichts angefasst** |
| `profiles` | 10 | unverändert |
| `mdb-a` (`profiles`/`decisions`/`mandate_profiles`/`helmut_jobs`) | **1 / 1 / 0 / 0**, letzte Berührung `dec-y` 2026-08-07 23:41:05Z | **unverändert inert** |
| V2-Lauf während des OP-30-Fensters | `understanding-cron` 21:30:49→21:35:03Z, HTTP 200, `status=success`, `processed=21`, `failed_count=0`, `commit_ref=eb136522` | **Altpfad lief normal weiter** |
| `process_runs` | 151 Zeilen, jüngster Lauf 21:35:03Z | plausibel (150 + der 21:30-Lauf) |
| `briefings` | **163**, unverändert seit 2026-08-11 05:45Z | **keine Pushs, keine Dubletten** |
| OP-31-Belege 2026-08-11 | **5× `morgenlage`** (`status=erfolg`, `ausloeser=morgenlauf`, 05:00:31–05:00:39Z) + **5× `lage`** (05:45:33–05:45:59Z), je genau eine Zeile je Mandat | **intakt** |
| OP-31-Belege 2026-08-12 | noch keine — der Morgenlauf ist erst um 05:00 UTC | erwartungsgemäß |

**Wichtige Einordnung:** der `understanding`-Cron gehört **nicht** zu `cronSchwererPfad`;
sein sauberer Lauf um 21:30 belegt, dass der bisherige Betrieb selbst **während** der
Aktivierung unbeeinträchtigt blieb — er ist aber **kein** Beleg für den Flagzustand.
**Der eigentliche OP-31-Test unter den neuen Verhältnissen ist der Morgenlauf 05:00 UTC**
und steht aus.

**Nebenbefund (nicht blockierend, für die Wiederholung vormerken):** der 20:00-Lauf über die
Warteschlange hat **keine** Zeile in `process_runs` hinterlassen — die Laufquittung existiert
nur im Vercel-Log. Der Altpfad schreibt dort. Solange das so ist, ist `process_runs` bei
aktivem OP-30 keine vollständige Laufhistorie.

### 16.8 Fehlerbild

| Quelle | Befund |
|---|---|
| Vercel-Runtimefehler, 24 h | 20 Gruppen; **jüngste 2026-08-11T20:00:03Z** (`[understanding] skipped-error … OpenAI request timeout`, Aktivierungs-Deployment). Alle übrigen 16:03:03Z bzw. 10:00:26Z — sämtlich die vorbestehende Google-Basisklasse (OP-15). **Keine neue Gruppe nach 20:00:03Z, keine einzige nach der Abschaltung** |
| PostgreSQL-Log | **0 FATAL, 0 PANIC, 0 Berechtigungsfehler, 0 RLS-Verstöße** |
| PostgreSQL — neu gegenüber §13 | **3× `canceling statement due to statement timeout`** (20:04:08Z, 20:04:30Z, 20:04:38Z) am Ende des OP-30-Laufs, plus einmal Sperrwarten (`ShareLock`, 1 651 ms, danach erteilt) um 20:01:12Z durch die zwei Worker. **Beides gehört zum Lauf aus §15.4, nicht zur Abschaltung**; folgenlos (`endgueltigFehler=0`, keine Zeile verloren) |
| PostgreSQL nach 20:04:38Z | **keine ERROR-/WARNING-Zeile** außer drei fehlgeschlagenen **Ad-hoc-Leseabfragen dieser Prüfsitzung** um 01:24Z (`column "id"`, `column "kind"`, `operator … text >= date`) |
| Supabase-Security-Advisor | **unverändert**: 20× INFO `rls_enabled_no_policy` (darunter `helmut_jobs` und `llm_reservations` — der geprüfte Vertrag) + 1× WARN `extension_in_public` (`vector`). **Kein neuer WARN, kein ERROR** |

*Ehrliche Grenze:* das Logwerkzeug lieferte **genau 100 Zeilen** im Fenster
2026-08-11T03:09:46Z → 2026-08-12T01:25:38Z. Das ist eine gedeckelte Stichprobe; die
Aussagen oben gelten für die zurückgegebene Menge, nicht beweisbar für jede einzelne
Logzeile des Fensters.

### 16.9 Nichts sonst wurde verändert

| Prüfpunkt | Messwert | Urteil |
|---|---|---|
| registrierte Migrationen | **25**, oberste sechs `20260811104749 … 20260811105229` | unverändert; **keine Rücknahmemigration angewendet** |
| Policies in `public` | **24** | unverändert |
| Tabellen in `public` | 44, beide OP-30-Tabellen vorhanden | unverändert |
| RLS `helmut_jobs` / `llm_reservations` | je `rls=true` **und** `force=true`, **keine** Policy | Vertrag aus §12 unverändert |
| Rechte `anon`/`authenticated`/`PUBLIC` auf beide Tabellen | **0** | unverändert |
| `helmut_`-Funktionen | 29; **genau eine** `SECURITY DEFINER`: `helmut_ensure_profile` (vorbestehende Triggerfunktion aus §9, **kein** OP-30-Bestandteil) | unverändert |
| Cron-Einträge (`vercel.json`) | **11**, unverändert — Commit ist derselbe | unverändert |
| `helmut-flags.json` | unverändert (`HELMUT_UNDERSTANDING_GATE=shadow`, `HELMUT_PARDOK_DISPATCH=shadow`, `HELMUT_SOURCE_MODE=on`); enthält **kein** OP-30-Flag | unverändert |

Über den Zustand **anderer** Vercel-Env-Variablen kann diese Sitzung nichts sagen — sie sind
weder lesbar noch setzbar (§16.5). Die Aussage lautet deshalb: **an allem, was aus einer
Sitzung sichtbar ist, wurde nichts verändert.**

### 16.10 Urteil

1. **Der Fünferlauf ist NICHT bestanden.** Nach K1 ist die Abbruchgrenze aus §8.2 eingetreten
   (§15.5), die Aktivierung wurde zurückgenommen. **K2 (24 h) und K3 (72 h) wurden nie
   begonnen und bleiben offen.** Ohne bestandenes K3 bleibt die 5er-Stufe unbestanden — und
   damit bleibt jede Ausweitung auf 25 Mandate ausgeschlossen (zusätzlich weiterhin
   Vorbedingung: neu bestandener OP-25-Nachweis).
2. **Production ist im sicheren Zustand.** Nichts läuft, nichts hängt, nichts kostet:
   0 laufende Aufträge, 0 Leases, 0 endgültige Fehler, 0 Reservierungen, 0 KI-Aufrufe seit
   Mitternacht UTC, 0 neue Fehlerklassen, fünf Mandate unverändert, `mdb-a` inert, V2 und die
   OP-31-Belege intakt.
3. **Die Wirksamkeit der Abschaltung ist noch offen** und wird am 04:00-Lauf entschieden
   (§16.6). Das ist eine Frage von Stunden, kein Risiko: selbst wenn das Flag wider Erwarten
   noch wirkte, wäre die Folge ein weiterer Warteschlangenlauf im bekannten Rahmen
   (Slotbudget 270 s, KI-Deckel greift, kein Push-Pfad) — nicht ein Schaden.
4. **Die Korrektur der Altersgrenze ist ausdrücklich NICHT Teil dieses Sprints.** Der Mangel
   ist in §15.5 Punkt 3 belegt: die Grenze „ältester offener Auftrag" misst das Alter der
   *Fälligkeit* (`due_at`), nicht des *Auftrags* (`created_at`), und übernimmt damit beim
   ersten Lauf einen vorbestehenden OP-15-Datenrückstand. **Das wird ein eigener
   Folgesprint** (Änderung an §8.1 Nr. 11 / §8.2 und an `betriebsstatus`); erst danach ist
   ein zweiter Aktivierungsversuch sinnvoll bewertbar.
5. **Unabhängig davon bleibt OP-15 offen:** die Personenquellen von vier der fünf Mandate
   sind seit 2026-08-06 nicht erfolgreich abgerufen worden (§15.5). Das ist ein echter
   Datenrückstand, den die Warteschlange nur sichtbar gemacht hat.

### 16.11 Nicht getan (Verbote eingehalten)

Kein Flag gesetzt oder geändert · keine Env-Variable · kein Redeploy · **kein manueller
Cronlauf, kein Cron ausgelöst** · kein Worker gestartet · **keiner der 235 Aufträge
verändert, verschoben oder gelöscht** · keine Reservierung angefasst · keine
Production-Datenänderung · keine Mandatsänderung · `mdb-a` unangetastet · keine Migration
angewendet oder zurückgenommen · keine Codeänderung · **keine Korrektur der Altersgrenze** ·
keine Grenzwertänderung · keine Testdaten · kein 403-Umgehungsversuch · keine Geheimnisse
ausgegeben · kein Merge · **keine Ausweitung auf 25 Mandate**.

### 16.12 Wirkungsnachweis am ersten Regellauf nach der Abschaltung — **BESTANDEN**

**Erfüllt §7 Schritt 5 und schließt die offene Frage aus §16.5/§16.10 Punkt 3.**
Geprüft: der reguläre Vercel-Cron **`crawl` 04:00 UTC am 2026-08-12** — der erste Lauf durch
`cronSchwererPfad` nach dem Rücknahme-Redeploy. Rein lesend, kein manueller Lauf, keine
Änderung. Erhebungszeit 04:16–04:18 UTC / 06:16–06:18 Uhr Berlin.

**Ergebnis: `HELMUT_SCALABLE_PIPELINE` ist nachweislich unwirksam. OP-30 ist aus.**

#### 16.12.1 Der Lauf hat stattgefunden — und lief über den Altpfad

`GET /api/cron/crawl` **HTTP 200**, `dep=dpl_7kcdpTbhLMQHH1eUNGVTcKuSYWBt` (das
Rücknahme-Deployment), Beginn 04:01:14Z, Lauf `cron-crawl-20260812040115-0xlmm`.

Laufquittung (Vercel-Runtimelog, wörtlich):

```
[cron/crawl/globalphase] 208443ms status=teilweise quellen=174 rohdokumente=1978
  verstanden=4 frisch=false budgetGlobalMs=229731 reserveMs=40000 restMs=61287
  lauf=cron-crawl-20260812040115-0xlmm-global
[cron/crawl/fairness] geplant=ottilie-paola-klein-2,cem-ince,helmut-kleebank,annika-klose,
  ruppert-st-we begonnen=<dieselben fünf> erfolgreich=5 fehlgeschlagen=0 kapazitaet=5
  obergrenzeLaeufe=1 laufzustand=abgeschlossen abweichung=- zustand=ok
[cron/crawl] 233079ms tenants=5 bounded=false lauf=cron-crawl-20260812040115-0xlmm
```

**Der entscheidende Unterschied ist die erste Zeile.** Am 2026-08-11 mit aktivem Flag stand
dort `[cron/crawl/warteschlange] … geplant=193 neu=193 worker=2 …` (§15.4). Heute steht dort
`[cron/crawl/globalphase]`, und **keine einzige Logzeile des Laufs enthält `warteschlange`**.
Der Lauf durchlief den bekannten Altpfad: `Quellen vereinigt gesamt=174 gemeinsam=140
mandatseigen=34 doppelteWege=0 fehlerhafteProfile=0` → `globalphase/persistenz 5937ms
dokumente=1978 neu=1539 bestandstreffer=251 zaehlerVerfehlt=0` → `lazy-understanding`
(clusters=1134, processed=279) → `eager-understanding` (processed=4, `reason=zeitbudget`)
→ `vormerk-abschluss` (vorgemerkt=6, fehlgeschlagen=0) → `datenstand … versiegelt=true`.

Relational bestätigt in `process_runs` (der Warteschlangenpfad schreibt dort **nicht**, §16.7):

| Lauf | Zeit UTC | Status | Dauer | commit_ref |
|---|---|---|---|---|
| `globalphase` | 04:01:15 → 04:04:40 | `partial`, `failed_count=0`, `processed=4`, `target_count=1978` | 204 253 ms von 229 731 ms | `eb136522` |
| `understanding-eager` | 04:03:06 → 04:04:26 | `success`, `failed_count=0`, `processed=4` | 80 257 ms | `eb136522` |

Reason-String `status=teilweise budget=1 fehler=0 abruf=0 persistenz=ok cas=0 lazyskip=0
nv=0 vk=932` — formgleich mit allen bisherigen `globalphase`-Läufen; `partial` ist deren
unveränderter Normalzustand (§13.2).

#### 16.12.2 Die Warteschlange wurde nicht angefasst

| Prüfpunkt | vor dem Lauf (01:22Z) | nach dem Lauf (04:16Z) | Urteil |
|---|---|---|---|
| `helmut_jobs` Zeilen | 235 | **235** | unverändert |
| `helmut_jobs` `max(updated_at)` | 2026-08-11 20:04:26.487Z | **2026-08-11 20:04:26.487Z** | **kein Schreibvorgang** (Trigger `helmut_jobs_kappen_trg`) |
| `helmut_jobs` `max(created_at)` | 2026-08-11 20:03:54.674Z | **20:03:54.674Z** | kein neuer Auftrag |
| `n_tup_ins` / `n_tup_upd` / `n_tup_del` | 235 / 202 / 0 | **235 / 202 / 0** | **kein einziges Insert/Update/Delete** |
| `status='laeuft'` | 0 | **0** | nichts beansprucht |
| `lease_owner` oder `lease_expires_at` | 0 | **0** | keine Lease vergeben |
| `status='fehlgeschlagen'` · `attempts>1` | 0 · 0 | **0 · 0** | keine neuen Fehler, keine Wiederholung |
| `first_claimed_at` gesetzt | 100 | **100** | Altbestand vom 20:00-Lauf, unverändert |
| `llm_reservations` Zeilen · `n_tup_ins/upd/del` · `idx_scan` | 0 · 0/0/0 · 0 | **0 · 0/0/0 · 0** | weiterhin nie beschrieben, nie über Index gelesen |

*Zur Vollständigkeit:* `seq_scan`/`idx_scan` auf `helmut_jobs` sind um 25 bzw. 8 gestiegen —
das sind die **Leseabfragen dieser Prüfsitzung**. Die **Schreibzähler stehen exakt still**,
und nur die zählen für die Frage.

#### 16.12.3 Warum das zwingend ist und keine andere Erklärung zulässt

Alle 235 Aufträge waren **fällig** (`due_at ≤ now`, §16.3). Mit wirksamem
`HELMUT_SCALABLE_PIPELINE` hätte `runCronUeberWarteschlange` sie zwingend beansprucht —
`helmut_claim_jobs` setzt `status='laeuft'`, `lease_owner` und `updated_at`. Nichts davon ist
passiert. Die zweite denkbare Erklärung — „Flag an, aber Migration fehlt" — scheidet aus:
in dem Fall meldet der Lauf ehrlich `verfuegbar:false / migration-fehlt` und gilt als **nicht
ok** (§6); tatsächlich sind alle sechs Migrationen registriert (25 Einträge) und der Lauf
meldet `zustand=ok`. **Es bleibt genau eine Erklärung: das Flag ist aus.**

#### 16.12.4 Kosten, Mandate, Fehler

| Prüfpunkt | Messwert | Urteil |
|---|---|---|
| `llm_budget_counters` 2026-08-12 `global.used` | **4** (04:04:10Z) | **vollständig erklärt**: exakt `verstanden=4` bzw. `eager-understanding processed=4` des **Altpfads**. Da `llm_reservations` nie beschrieben wurde: **0 Aufrufe, 0 Kosten durch OP-30** |
| Rahmen | 4 von 100 (+30 Reserve) | kein Deckelkontakt |
| Anfragen an Production seit 00:54:14Z | `/` 5 · `/api/auth/session` 2 · `/robots.txt` 1 · **`/api/cron/crawl` 1** | **genau ein Cronlauf**, keine Worker-, Admin- oder Ops-Route, kein Zweitlauf |
| aktive Mandate | **5**, unverändert; alle fünf im Lauf `erfolgreich`, `fehlgeschlagen=0` | unverändert |
| `mandate_profiles` letzte Änderung | 2026-08-06 08:01:31Z | unverändert |
| `mdb-a` (`profiles`/`decisions`/`mandate_profiles`/`helmut_jobs`) | **1 / 1 / 0 / 0** | **unverändert inert** |
| `briefings` · `profiles` · Policies · Migrationen | 163 · 10 · 24 · 25 | unverändert |
| Vercel-Runtimefehler seit 2026-08-12T00:00Z | **keine** — auch keine Google-Timeouts (alle URL-Auflösungen des Laufs erfolgreich) | 0 neue Fehlerklassen |
| PostgreSQL im Lauffenster 04:00–04:10Z | **eine** Routinezeile (`checkpoint starting`) — **0 ERROR, 0 WARNING, kein Sperrwarten** | sauber; deutlicher Kontrast zum OP-30-Lauf (3× `statement timeout` + `ShareLock`, §16.8) |
| PostgreSQL seit 00:54:14Z gesamt | 5 ERROR — **ausnahmslos fehlgeschlagene Ad-hoc-Leseabfragen der Prüfsitzungen** (01:24–01:27Z); **0 FATAL, 0 PANIC, 0 Berechtigungsfehler, 0 RLS-Verstöße** | keine echten Fehler |
| Security-Advisor | unverändert: 20× INFO `rls_enabled_no_policy` + 1× WARN `extension_in_public` | kein neuer Befund |

*Ehrliche Grenze wie in §16.8:* das PostgreSQL-Logwerkzeug liefert 100 Zeilen (Fenster
2026-08-11 05:35:59Z → 2026-08-12 04:10:10Z); die Aussagen gelten für die zurückgegebene Menge.

#### 16.12.5 Was weiterhin aussteht

- **Morgenlauf 05:00 UTC (07:00 Uhr Berlin) war zum Prüfzeitpunkt noch nicht gelaufen**
  (Erhebung 04:16–04:18 UTC). `briefings` steht unverändert bei 163, für 2026-08-12 gibt es
  **noch keine** Belegzeile — das ist erwartungsgemäß, **kein Befund**. Der OP-31-Frischebeleg
  (`belegt=5/5`, ein Push je Mandat) ist damit die nächste **Routinebeobachtung**, nicht mehr
  Teil des OP-30-Nachweises: der Warteschlangenpfad hat ohnehin keinen Pushaufruf (§1), und
  OP-31 ist seit 2026-08-11 eigenständig bestanden.
- Der zweite Beobachtungsanlass (GitHub-Actions-Watchdog 05:30 UTC, `/api/cron/pipeline`)
  wird nicht mehr gebraucht — er könnte den Befund nur wiederholen.

#### 16.12.6 Urteil

1. **Die Abschaltung ist wirkungsbasiert belegt.** Der erste Regellauf durch
   `cronSchwererPfad` nach dem Redeployment lief vollständig über den Altpfad, hat alle fünf
   Mandate erfolgreich bearbeitet und die Warteschlange **mit keinem einzigen Schreibvorgang**
   berührt. Damit ist §7 Schritt 5 erfüllt und der Rücknahmeplan **vollständig abgenommen**.
2. **Production ist im Normalbetrieb** — nicht nur „still": 174 Quellen, 1 978 Rohdokumente,
   5/5 Mandate, `zustand=ok`, 0 Fehler, 4 KI-Aufrufe.
3. **Die 235 Aufträge bleiben unverändert liegen** und sind jetzt belegt folgenlos: ein
   vollständiger Regellauf ist über sie hinweggegangen, ohne sie anzufassen. Sie sind
   Datenrest, kein Betriebszustand. Ihre Bereinigung ist eine eigene, freigabepflichtige
   Entscheidung (Rollback-SQL wird dafür **nicht** gebraucht — §7 Punkt 3).
4. **Unverändert offen bleibt:** der **Fünferlauf ist nicht bestanden** (K2/K3 nie begonnen,
   §16.10 Punkt 1) · die **Korrektur der Altersgrenze** ist ein eigener Folgesprint
   (§16.10 Punkt 4) · **OP-15** (Personenquellen seit 2026-08-06 ohne erfolgreichen Abruf)
   ist beziffert und offen.

#### 16.12.7 Nicht getan (Verbote eingehalten)

Kein manueller Cronlauf und kein Cron ausgelöst — der Slot kam von selbst · kein Flag ·
keine Env-Variable · kein Redeploy · kein Worker · **keiner der 235 Aufträge verändert,
verschoben oder gelöscht** · keine Reservierung angefasst · keine Production-Datenänderung ·
keine Mandatsänderung · `mdb-a` unangetastet · keine Migration angewendet oder zurückgenommen ·
keine Codeänderung · **keine Korrektur der Altersgrenze** · keine Grenzwertänderung ·
kein 403-Umgehungsversuch · kein Merge · **keine Ausweitung auf 25 Mandate**.

---

## 17 · Berichtigte Altersmessung der Warteschlange (Sprint 2026-08-12/3)

> **Stand:** Code, Migration und Tests liegen auf `claude/queue-age-measurement-ka8gbz`
> (PR offen, **nicht** gemergt). **In Production ist noch nichts davon wirksam** —
> `HELMUT_SCALABLE_PIPELINE` bleibt `off`, die Migration `20260812` ist **nicht angewendet**,
> die 235 Aufträge sind **unverändert**. Dieser Sprint hat rein lesend auf Production
> zugegriffen.

### 17.1 Der Fehlbefund, in einem Satz

Die Grenze aus §8.2 maß, **seit wann Arbeit fachlich fällig gewesen wäre**, nicht **wie lange
ein Auftrag tatsächlich wartet** — und ein frisch erzeugter Auftrag kann bauartbedingt ein
tagealtes Fälligkeitsdatum tragen.

### 17.2 Genaue Ursache (belegt, nicht vermutet)

Der Verdacht aus §15.5 Punkt 3 hat sich bestätigt und ist jetzt **präzise**:

1. `helmut_job_metrics` maß das Alter gegen `first_due_at` (`max_mandatsalter_s`,
   `ueberfaellige_mandate`) bzw. gegen `due_at` (`aeltester_faelliger_s`). Beides ist die
   **Fälligkeit**.
2. `first_due_at` ist die fachliche Fälligkeit **beim Einreihen**. `source-demand.js` streut
   sie deterministisch **ab dem Beginn des Aktualitätsfensters** und klemmt sie ausdrücklich
   nicht in die Zukunft („ein bereits fälliger Auftrag bleibt sofort fällig"). Fällt ein
   Auftrag in ein **bereits laufendes** Fenster, ist er in der Sekunde seiner Entstehung
   „überfällig".
3. Entscheidend ist die **Fensterbreite**: das Archivfenster der Personensuchen ist
   **7 Tage** breit (`HELMUT_DEMAND_ARCHIVE_WINDOW_H`, Vorgabe 168). Der Streuversatz folgt
   dem Rotationsrang — 0 h / 30,25 h / 60,5 h / 90,75 h / 121 h.

**Gegenprobe an den Production-Daten (rein lesend, 2026-08-12 08:38 UTC):** genau
**5 Aufträge** tragen das Fenster `2026-08-06T00Z`, alle vom Typ `source_fetch`,
`payload.art = "person-archiv"`, alle am 2026-08-11 20:00 erzeugt. Ihre `first_due_at`-Werte
sind exakt die fünf Rangversätze. Alle **230 übrigen** Aufträge liegen unter 24 h
Fälligkeitsalter. Der gemeldete Wert 504 477 s = 5,84 Tage ist genau
`20:04 UTC − 2026-08-06T00:00Z`.

**Damit ist die Erstdiagnose aus §15.5 in einem Punkt zu berichtigen:** es ist **nicht**
(nur) der vorbestehende OP-15-Rückstand, der die Grenze auslöste, sondern die **Fensterbreite
des Archivabrufs**. Die Grenze wäre bei **jedem** ersten Lauf in einem laufenden
7-Tage-Fenster eingetreten — auch bei völlig gesunden Quellen. Sie war strukturell
unbrauchbar, nicht bloß unglücklich kalibriert. (OP-15 bleibt davon unberührt offen: die
Personenquellen laufen tatsächlich seit dem 6.8. nicht durch — das ist ein echter, weiterhin
gemeldeter Datenbefund, §17.4.)

**Reproduziert** an echter PostgreSQL 16.13: `scripts/jobqueue-alter-datenbank-test.js` §1
stellt den Fall mit der **alten** Funktion nach und misst 5,84 Tage; §2 misst mit der neuen
Funktion auf **denselben Zeilen** 0 s.

### 17.3 Die Semantik, ab jetzt verbindlich

Zwei Begriffe, überall gleich benannt (SQL, Anwendung, dieses Runbook):

| Begriff | Formel | Wofür |
|---|---|---|
| **Fälligkeitsrückstand** | `now − first_due_at` | „Seit wann *wäre* diese Arbeit fällig gewesen." Datenbefund (z. B. OP-15). **Keine Betriebsgrenze.** |
| **Wartezeit** | `max(now − max(created_at, first_due_at), 0)` | „Wie lange wartet dieser Auftrag *tatsächlich*, seit er bearbeitbar ist." **Die Betriebsgrenze.** |

Warum genau diese Formel — und nicht ein getauschtes Feld:

- **`created_at` statt `due_at`:** `helmut_defer_job` setzt `due_at` bei **jedem**
  Zurückstellen neu. Eine Messung dagegen wäre durch Warten löschbar — derselbe Fehler, der
  am 2026-08-08 schon einmal belegt wurde. `created_at` steht fest; ein wirklich alter
  Auftrag altert also auch nach beliebig vielen Zurückstellungen und Wiederholungen weiter.
- **`first_due_at` als Obergrenze:** ein Auftrag, der erst heute Abend bearbeitbar wird,
  wartet **jetzt** 0 s. Ohne diesen Deckel wäre die Vorausplanung selbst ein Rückstand.
- **`first_claimed_at` scheidet aus** (2026-08-08 belegt): es springt beim ersten Zugriff
  nach vorn und verliert die Wartezeit davor.
- Der **spätere** der beiden Zeitpunkte ist damit exakt „ab wann wartet er wirklich".

### 17.4 Was geändert wurde

| Ort | Änderung |
|---|---|
| `supabase/migrations/20260812_jobqueue_altersmessung.sql` (+ Rollback) | ersetzt **nur** die lesende Funktion `helmut_job_metrics` und ergänzt drei Spalten: `aeltester_offener_s`, `max_mandatswartezeit_s`, `ueberfaellige_mandate_wartezeit`. **Keine** Tabelle, Spalte, Policy, kein Index, kein Backfill. Die 14 bisherigen Spalten bleiben nach Name, Typ, Reihenfolge **und Formel** unverändert (`drop + create`, weil PostgreSQL den Rückgabetyp nicht per `replace` erweitert; Rechte werden identisch neu gesetzt) |
| `lib/helmut/scalable-pipeline.js` | `betriebsstatus` prüft die Schwellen gegen die **Wartezeit**; neue Ausgabefelder `altersvertrag`, `kennzahlen.aeltesterOffenerS/maxMandatswartezeitS/ueberfaelligeMandateWartezeit/gemessenesAlterS`, `schwellen.bezug`. Neue, exportierte Formel `bearbeitbarAbMs`/`wartezeitS` — **eine** Fassung für App, Attrappe und Tests |
| `scripts/fixtures/jobqueue-speicher-treiber.js` | liefert dieselben drei Kennzahlen und **leiht** die Formel aus der Anwendung, statt sie ein drittes Mal nachzubauen |

**Der fachliche Rückstand bleibt sichtbar** (CLAUDE.md §4.4): `max_mandatsalter_s` und
`ueberfaellige_mandate` werden unverändert weiter gemeldet, und überschreitet der
Fälligkeitsrückstand 24 h, erscheint der Befund `faelligkeitsrueckstand:<n>s-nicht-wartezeit`.
Er färbt den Zustand **nicht** ein — er sagt „diese Quelle läuft seit Tagen nicht durch",
nicht „die Warteschlange kommt nicht hinterher".

**Fehlt die Migration**, wird nicht geraten und nicht grüngerechnet: dann gilt ausdrücklich
der **alte, zu strenge** Vertrag (`altersvertrag="faelligkeit-alt"`, Befund
`altersmessung-alt:migration-20260812-fehlt`). Fehlalarm ist zulässig, falsches Grün nicht.

### 17.5 §8.1 Nr. 11 und §8.2 — berichtigte Fassung

Die Zeilen aus §8 gelten unverändert **in ihren Zahlen**; berichtigt ist ausschließlich der
**Bezugspunkt**:

| # | Messwert (berichtigt) | Erwartung (5 Mandate) |
|---|---|---|
| 11 | **Wartezeit des ältesten offenen Auftrags** (`aeltester_offener_s`; ab `max(created_at, first_due_at)`, alle offenen Aufträge — auch die ohne Mandatsbezug) | < 24 h (ab 24 h meldet `betriebsstatus` **kritisch** — bewusst dieselbe Grenze) |
| 11b | **Fälligkeitsrückstand** (`max_mandatsalter_s`) | wird **berichtet**, ist **kein** Abbruchkriterium; > 24 h ⇒ Ursache klären (OP-15), Stufe halten |

| Beobachtung | **Weiterlaufen** | **Beobachten** | **Sofort stoppen + zurücknehmen** (§7) |
|---|---|---|---|
| **Wartezeit** des ältesten offenen Auftrags | < 12 h | 12–24 h | > 24 h (`betriebsstatus` kritisch) |
| Fälligkeitsrückstand | — | jederzeit, wenn > 24 h: Ursache klären | **nie allein** ein Abbruchgrund |

Zusätzlich zu prüfen ist ab jetzt bei K0: `altersvertrag` muss `wartezeit` sein. Steht dort
`faelligkeit-alt`, ist die Migration `20260812` **nicht** angewendet — dann ist die Grenze
nicht aussagekräftig und der Versuch beginnt gar nicht erst.

### 17.6 Testergebnisse (alle lokal ausgeführt, echte Zahlen)

| Suite | Ergebnis |
|---|---|
| `scripts/jobqueue-alter-test.js` (neu, offline; Fälle a–h + adversariale Mutationsproben) | **59 PASS / 0 FAIL** |
| `scripts/jobqueue-alter-datenbank-test.js` (neu, **echte PostgreSQL 16.13**; Fehlbefund reproduziert, Fix belegt, Rechte, Rollback) | **26 PASS / 0 FAIL** |
| `scripts/jobqueue-ruecknahme-datenbank-test.js` (neu, **echte PostgreSQL 16.13**; Export → Löschung → Wiederherstellung → Gleichheit, drei Abbruchfälle — der Nachweis zu §17.8) | **31 PASS / 0 FAIL** |
| `scripts/jobqueue-vertrag-test.js` (mit DB-Gleichheitsteil, neuer Fall F) | **125 PASS / 0 FAIL** |
| `scripts/jobqueue-datenbank-test.js` (echte PostgreSQL) | **55 PASS / 0 FAIL** |
| `scripts/jobqueue-mutationsprobe.js` (echte PostgreSQL) | **10/10 ROT** (alle Mutationen erkannt) |
| `scripts/skalierung-1000-test.js` | **70 PASS / 0 FAIL / 2 OFFEN** (die 2 offenen sind Bestand) |
| `scripts/vorgangskontext-test.js` | **103 PASS / 0 FAIL** |
| `node scripts/run-offline-tests.js` (kanonisch) | **240/245 Suiten grün** (mit den drei neuen Suiten). Die 5 roten sind **Basisrot** — `kalender-ics`, `privacy-vollstaendigkeit`, `profile-db`, `provision-tenant`, `tenant-neutrality`, auf unverändertem `main` gegengeprüft; sie sind lokale Umgebungsfehler und im CI grün |
| **CI-Gate von PR #244** — `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)` | **beide grün**, zuletzt auf Commit `201335f` (2026-08-12 13:23 UTC); davor `914458e` (09:35 UTC) |

### 17.7 Die 235 Production-Aufträge — rein lesende Untersuchung

Zustand am 2026-08-12 08:38 UTC (unverändert seit 2026-08-11 20:04): **235 gesamt**,
55 `erledigt`, **180 `wartend`**, 0 `laeuft`, 0 `fehlgeschlagen`, **0 Leases**.

| Typ | Fenster | offen | Fenster heute noch gültig? |
|---|---|---|---|
| `source_fetch` geteilt | `2026-08-11T16Z` (8 h) | 126 | **nein** (abgelaufen 2026-08-12T00Z) |
| `document_understanding` | `2026-08-11T16Z` | 39 | Schlüssel trägt **kein** Fenster |
| `source_fetch` person-archiv | `2026-08-06T00Z` (7 d) | 5 | **ja**, bis 2026-08-13T00:00Z |
| `mandate_projection` | `2026-08-11T00Z` (24 h) | 5 | **nein** |
| `briefing_materialization` | `2026-08-11T00Z` (24 h) | 5 | **nein** |

**(a) Würden sie bei einer erneuten Aktivierung sofort verarbeitet? — Ja, alle 180.**
`due_at <= now()` gilt für **180 von 180**; `helmut_claim_jobs` würde sie im ersten Slot
beanspruchen, und zwar **vor** der neu geplanten Arbeit des Tages (Sortierung
`priority, due_at, created_at` — die zurückdatierten stehen vorn).

**(b) Gefahr doppelter Verarbeitung? — Ja, für 10 Aufträge, und sie ist konkret.**
`VORBEDINGUNG_MAX_WARTE_MS` beträgt 6 h ab `created_at`; die 5 Projektions- und
5 Briefingaufträge sind seit **> 13 h** alt. Sie würden also **nicht mehr auf ihre
Vorbedingungen warten**, sondern sofort laufen — und im selben Slot entstehen für dasselbe
Mandat die Aufträge des **heutigen** Fensters (`2026-08-12T00Z`). Ergebnis: Matching,
Entscheidungen und Briefingaufbau laufen je Mandat **zweimal** am selben Tag. Ein doppelter
**Push** entsteht dabei nicht (der Warteschlangenpfad hat keinen Pushaufruf, §1), aber §8.2
kennt „doppelte Verarbeitung ≥ 1" **ohne Ermessen** als Abbruchgrund.

**(c) Zweite Falle: `BUDGET_MAX_WARTE_MS` = 48 h.** Ein Verstehensauftrag, der übersprungen
wird (`understanding-locked`, `ai-disabled`) und dessen `created_at` länger als 48 h zurück
liegt, wird **nicht** mehr zurückgestellt, sondern als Fehler geworfen. Für die 39 offenen
Verstehensaufträge läuft diese Frist am **2026-08-13 20:04 UTC** ab. Danach können sie
`max_attempts` verbrauchen und als **endgültige Fehler** enden — und „≥ 3 endgültige
Fehler/Tag" ist ebenfalls ein Abbruchgrund aus §8.2.

**(d) Dritte Falle — und sie gilt ausdrücklich auch nach diesem Fix:** die berichtigte
Wartezeit der 180 offenen Aufträge beträgt am 2026-08-12 08:38 UTC **13,1 h** und überschreitet
am **2026-08-12 ~20:04 UTC** die 24-h-Grenze. Das ist dann **kein Fehlalarm mehr**, sondern
richtig: es liegt echte, unbearbeitete Arbeit in der Warteschlange. Eine Aktivierung nach
diesem Zeitpunkt würde bei K0 **zu Recht** `kritisch` melden — aus einem Grund, der mit dem
neuen Versuch nichts zu tun hat.

**Können sie sicher weiterverwendet werden? — Nein.** Sie tragen keine Information, die
verloren ginge: der Planer erzeugt bei jedem schweren Cronlauf genau die Aufträge, die das
dann aktuelle Fenster braucht — einschließlich des Archivauftrags, solange dessen Fenster
läuft (identischer Idempotenzschlüssel ⇒ er entsteht neu, mit frischem `created_at`). Ihr
einziger Effekt bei einer Wiederverwendung sind die drei Fallen (b)/(c)/(d).

**Die 55 erledigten Aufträge bleiben stehen.** Sie werden nie wieder beansprucht, sind der
Beleg des ersten Laufs und stören keinen neuen Versuch (ihre Fenster sind durch; die
3 erledigten Verstehensaufträge tragen kein Fenster und wirken dort als **korrekte**
Idempotenzsperre gegen erneutes Verstehen derselben Dokumentmenge).

### 17.8 Erforderliche Betreiberaktion vor dem nächsten Versuch

> **Datenschutz-Hinweis (2026-08-17/2, nachträglich):** dieser Abschnitt ist der am
> 2026-08-12 **bereits ausgeführte** historische Ablauf (§17.10) und bleibt als Beleg
> unverändert stehen. Für **künftige** Neutralisierungen ist er **nicht** mehr maßgeblich:
> der hier enthaltene Vollzeilenexport (Schritt 1, `to_jsonb`) schreibt `payload`,
> `tenant_id`, `idempotency_key` und `last_error` in eine Datei und ist aus dem aktuellen
> Betreiberablauf **entfernt**. Verbindlich ist **§26.2** (kein Export; Rückweg =
> deterministische Neuerzeugung).

**In dieser Reihenfolge, vollständig, sonst kein zweiter Versuch.** Alles hiervon ist
freigabepflichtig (CLAUDE.md §5); diese Sitzung hat **nichts davon ausgeführt**.

> **Der gesamte Ablauf inklusive Rückweg ist an einer echten PostgreSQL 16.13 bewiesen:**
> `scripts/jobqueue-ruecknahme-datenbank-test.js` — **31 PASS / 0 FAIL**, gegen eine
> wegwerfbare lokale Datenbank mit demselben Bestandsbild (180 offen / 55 erledigt). Die
> Suite führt exakt die hier stehenden Anweisungen aus; weicht dieses Runbook später ab,
> wird sie rot. Ohne diesen Nachweis darf Schritt 2 **nicht** ausgeführt werden.

**Vorbedingungen für den gesamten Ablauf (alle müssen gelten):**

1. `HELMUT_SCALABLE_PIPELINE` ist **`off`** und das ist am laufenden Deployment geprüft. Das
   ist der **einzige** wirksame Riegel gegen Verarbeitung — die Datenbank selbst kann sie
   nicht verhindern (§17.8-R7).
2. Es läuft gerade **kein** schwerer Cronslot (crawl 04:00/20:00, pipeline 16:00 UTC).
3. Die Zahl **180** ist unmittelbar vorher gemessen worden (Schritt 0). Sie ist eine
   **Eingabe**, keine Selbstauskunft — ein Skript, das seine eigene Erwartung nachrechnet,
   prüft nichts.

#### Schritt 0 — Erwartung messen (rein lesend)

```sql
select count(*) as offen,
       (select count(*) from public.helmut_jobs) as gesamt
  from public.helmut_jobs
 where status in ('wartend','laeuft')
   and created_at < timestamptz '2026-08-12 00:00:00+00';
-- Erwartet: offen = 180, gesamt = 235. Weicht das ab: HIER anhalten und neu bewerten.
```

#### Schritt 1 — Vollständiger Export (rein lesend, das ist der Rückweg)

```sql
select coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)
  from public.helmut_jobs j
 where j.status in ('wartend','laeuft')
   and j.created_at < timestamptz '2026-08-12 00:00:00+00';
```

`to_jsonb(j)` nimmt **alle 19 Spalten** der Zeile mit — `id`, `job_type`, `idempotency_key`,
`freshness_window`, `due_at`, `first_due_at`, `priority`, `status`, `created_at`,
`updated_at`, `attempts`, `max_attempts`, `lease_owner`, `lease_expires_at`, `last_error`,
`finished_at`, `payload`, `tenant_id`, `first_claimed_at` — einschließlich der Felder, die
`null` sind. Das Ergebnis in **eine Datei** speichern (nicht in ein Ticketfeld, das
umbricht).

**Export prüfen, BEVOR gelöscht wird** (drei Prüfungen, alle müssen stimmen):

```sql
-- (E1) Anzahl im Export == gemessene Anzahl
select jsonb_array_length(:'export'::jsonb);                       -- erwartet 180

-- (E2) Jedes Element trägt ALLE Spalten der Tabelle
select count(*) from jsonb_array_elements(:'export'::jsonb) e
 where (select count(*) from jsonb_object_keys(e.value))
    <> (select count(*) from information_schema.columns
         where table_schema='public' and table_name='helmut_jobs');   -- erwartet 0

-- (E3) Prüfsumme der Datei festhalten (macht den Export später belegbar)
select md5(:'export');
```

`:'export'` ist eine psql-Variable (`psql -v export="$(cat export.json)"`); sie erzeugt ein
korrekt maskiertes Stringliteral. **Nur wenn E1 = 180, E2 = 0 und die Prüfsumme notiert ist,
geht es weiter.**

#### Schritt 2 — Neutralisieren (die eine Datenänderung, geschützt und gedeckelt)

```sql
begin;
do $ruecknahme$
declare v_geloescht bigint;
begin
  delete from public.helmut_jobs
   where status in ('wartend','laeuft')
     and created_at < timestamptz '2026-08-12 00:00:00+00';
  get diagnostics v_geloescht = row_count;
  if v_geloescht <> 180 then
    raise exception 'ABBRUCH: % Zeilen geloescht, erwartet 180 — nichts veraendert', v_geloescht;
  end if;
end
$ruecknahme$;
commit;
```

Der `raise` bricht die Transaktion ab — bei jeder anderen Zahl als 180 wird **nichts**
gelöscht. Bewiesen in §3 der Nachweissuite (Erwartung 179 gesetzt ⇒ Abbruch, danach
unverändert 235 Zeilen).

**Gegenprobe nach dem Commit:**
```sql
select count(*) filter (where status in ('wartend','laeuft')) as offen,
       count(*) as gesamt from public.helmut_jobs;   -- erwartet 0 und 55
```

Warum **Löschen** und nicht Umstatuieren: `fehlgeschlagen` würde entweder als *endgültiger
Fehler* gezählt (sofort `kritisch`) oder von der Wiedervorlage (`helmut_jobs_wiedervorlage`,
Typen `source_fetch`/`document_understanding`, ab 24 h) **zurückgeholt** — beides schlechter
als der ehrliche Löschvorgang. `first_due_at` zu verschieben scheidet aus: die Spalte ist
ausdrücklich „wird NIE verändert", eine Verschiebung wäre eine Falschaussage im Prüfpfad.
`helmut_jobs_bereinigen` kann hier **nicht** helfen — sie schützt offene Aufträge bewusst.
Die **55 erledigten** Aufträge bleiben stehen (Beleg des ersten Laufs; §17.7).

#### Schritt R — Wiederherstellung (nur falls nötig)

**Wann sie zulässig ist** — alle vier Bedingungen gleichzeitig:

| # | Bedingung | Warum |
|---|---|---|
| R-a | `HELMUT_SCALABLE_PIPELINE` ist **`off`** | sonst beansprucht der nächste Slot die Aufträge sofort — **alle 180 sind fällig** |
| R-b | Die Exportdatei liegt vor und ihre **Prüfsumme** stimmt mit der aus Schritt 1 überein | ein halber Export wäre schlimmer als keiner |
| R-c | Es gibt **keine** Zeile mit derselben `id` oder demselben `idempotency_key` | der Schlüssel ist global eindeutig; nach einem zwischenzeitlichen Planungslauf ist die Wiederherstellung **unzulässig**, nicht bloß unbequem |
| R-d | Es läuft **kein** schwerer Cronslot | keine Reservierung mitten in der Transaktion |

R-c wird nicht geglaubt, sondern **in derselben Transaktion geprüft** — siehe unten.

```sql
begin;
create temporary table wh_export (daten jsonb) on commit drop;
insert into wh_export values (:'export'::jsonb);
create temporary view wh_zeilen as
  select * from jsonb_populate_recordset(null::public.helmut_jobs, (select daten from wh_export));

-- VARIANTE B (byte-gleich, siehe unten) — nur dann diese Zeile mit ausführen:
-- alter table public.helmut_jobs disable trigger helmut_jobs_kappen_trg;

do $wh$
declare
  v_erwartet   bigint := 180;
  v_im_export  bigint;
  v_konflikte  bigint;
  v_eingefuegt bigint;
  v_abweichend bigint;
begin
  select count(*) into v_im_export from wh_zeilen;
  if v_im_export <> v_erwartet then
    raise exception 'ABBRUCH: Export enthaelt % Zeilen, erwartet % — nichts eingefuegt',
      v_im_export, v_erwartet;
  end if;

  select count(*) into v_konflikte
    from wh_zeilen e
    join public.helmut_jobs j
      on j.id = e.id or j.idempotency_key = e.idempotency_key;
  if v_konflikte > 0 then
    raise exception 'ABBRUCH: % vorhandene Zeile(n) kollidieren mit dem Export — nichts eingefuegt',
      v_konflikte;
  end if;

  insert into public.helmut_jobs select * from wh_zeilen;
  get diagnostics v_eingefuegt = row_count;
  if v_eingefuegt <> v_erwartet then
    raise exception 'ABBRUCH: % Zeilen eingefuegt, erwartet % — Transaktion zurueckgenommen',
      v_eingefuegt, v_erwartet;
  end if;

  -- INHALTSPRUEFUNG NOCH VOR DEM COMMIT (Variante A: `updated_at` ausgenommen, siehe unten).
  select count(*) into v_abweichend
    from wh_zeilen e
    join public.helmut_jobs j on j.id = e.id
   where (to_jsonb(j) - 'updated_at') is distinct from (to_jsonb(e) - 'updated_at');
  if v_abweichend > 0 then
    raise exception 'ABBRUCH: % wiederhergestellte Zeile(n) weichen vom Export ab', v_abweichend;
  end if;
end
$wh$;

-- nur bei VARIANTE B:
-- alter table public.helmut_jobs enable trigger helmut_jobs_kappen_trg;
commit;
```

**Alle vier Prüfungen liegen INNERHALB der Transaktion.** Schlägt eine fehl, ist der Zustand
unverändert — es gibt keinen Zwischenstand, den jemand aufräumen müsste. Bewiesen in §6 der
Nachweissuite: Schlüsselkonflikt ⇒ Abbruch, 0 eingefügt; leerer Export ⇒ Abbruch, 0 eingefügt.

**Zwei Varianten, und der Unterschied ist genau ein Feld:**

| Variante | Trigger | Ergebnis | Wann |
|---|---|---|---|
| **A (Regelfall)** | bleibt aktiv | alle 180 Zeilen in **jedem** Feld identisch **außer `updated_at`** — der Trigger `helmut_jobs_kappen_trg` stempelt es bei jedem Insert auf `now()` | wenn der fachliche Zustand zählt (Normalfall) |
| **B (byte-gleich)** | für die Dauer der Transaktion aus | **alle 19 Felder identisch**, auch `updated_at`; der erneute Export ist byte-gleich zum ursprünglichen | wenn Byte-Gleichheit belegt werden muss (Audit) |

Variante B braucht Eigentumsrechte an der Tabelle und nimmt kurz eine `ACCESS EXCLUSIVE`-
Sperre. Der Trigger wird in **derselben** Transaktion wieder eingeschaltet — bricht sie ab,
bleibt er an. Die Nachweissuite prüft das ausdrücklich (§7.3: `tgenabled = 'O'` danach).

**Gegenprobe nach dem Commit** (beides muss stimmen):
```sql
-- (W1) Anzahl und Verteilung
select count(*) filter (where status in ('wartend','laeuft')) || '/'
    || count(*) filter (where status = 'erledigt') from public.helmut_jobs;   -- erwartet 180/55

-- (W2) Inhalt gegen die Exportdatei — 0 Abweichungen, 0 fehlende Aufträge
select (select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
          join public.helmut_jobs j on j.id = e.id
         where (to_jsonb(j) - 'updated_at') is distinct from (to_jsonb(e) - 'updated_at')) as abweichend,
       (select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
         where not exists (select 1 from public.helmut_jobs j where j.id = e.id)) as fehlend;
-- erwartet: 0 | 0     (bei Variante B zusätzlich: md5 des erneuten Exports == md5 aus Schritt 1)
```

**R7 — kein unbeabsichtigtes Verarbeiten.** Wiederhergestellte Aufträge stehen auf `wartend`,
ohne Lease, ohne Halter (Nachweissuite §8.1/§8.2). Aber **alle 180 sind fällig** und würden
bei aktivem Flag im nächsten Slot sofort beansprucht (§8.3, ausdrücklich so gemessen). Der
**einzige** Riegel ist deshalb `HELMUT_SCALABLE_PIPELINE=off`. Es gibt in der Tabelle kein
„pausiert"-Feld, und ein in die Zukunft geschobenes `due_at` wäre zwar eine Bremse, aber
keine originalgetreue Wiederherstellung mehr — dann stimmt die Gegenprobe W2 nicht mehr. Wer
die Aufträge zurückholt, muss vor dem nächsten Einschalten des Flags neu entscheiden, was mit
ihnen geschehen soll.

**R8 — Abbruch und Rollback.** Jede der acht Prüfungen (E1–E3, Löschanzahl, Exportgröße,
Konflikte, Einfügeanzahl, Inhalt) endet im Fehlerfall mit `raise exception` innerhalb einer
Transaktion; PostgreSQL nimmt sie vollständig zurück. Es gibt keinen Pfad, auf dem ein
Teilzustand entsteht. Ist bereits committet und man will zurück: Schritt R ist selbst der
Rückweg für Schritt 2 — und für Schritt R gibt es keinen eigenen, weil er nur einfügt, was
vorher exportiert wurde (Konfliktprüfung R-c verhindert Dubletten).

#### Schritt 3 — Migration anwenden

`20260812_jobqueue_altersmessung.sql` (nach Merge des PR; freigabepflichtig). Gegenprobe rein
lesend:
```sql
select round(aeltester_offener_s), round(max_mandatsalter_s), ueberfaellige_mandate_wartezeit
  from public.helmut_job_metrics(1440);   -- erwartet nach Schritt 2: 0 | 0 | 0
```

#### Schritt 4 — erst dann aktivieren

`HELMUT_SCALABLE_PIPELINE=on` + Redeploy; der Kontrollplan beginnt wieder bei §6 Schritt 3 mit
**K0–K3**. K0 bekommt einen Punkt dazu: `altersvertrag = "wartezeit"` (sonst fehlt die
Migration).

**Reihenfolge ist nicht beliebig:** Schritt 2 vor Schritt 4, sonst greifen die Fallen aus
§17.7. Schritt 3 vor Schritt 4, sonst misst K0 noch mit dem alten Vertrag.

### 17.9 Nicht getan (Verbote eingehalten)

Kein Flag gesetzt · keine Env-Variable geändert · kein Deployment, kein Redeploy · kein
Cronlauf ausgelöst · **kein Auftrag der 235 verändert, verschoben oder gelöscht** · keine
Migration auf Production angewendet · keine Production-Datenänderung · keine Ausweitung auf
25 Mandate · OP-15 **nicht** nebenbei repariert · kein Merge.

**Ausdrücklich auch für §17.8:** der Export-/Lösch-/Wiederherstellungsablauf wurde
**ausschließlich gegen eine wegwerfbare lokale PostgreSQL** ausgeführt
(`scripts/jobqueue-ruecknahme-datenbank-test.js`, eigene Datenbank `helmut_test_ruecknahme`,
am Ende zurückgerollt). Gegen Production liefen in diesem Sprint **nur lesende** Abfragen
(`select`); kein `insert`, `update`, `delete`, kein DDL.

---

## 18 · Belegdateien des OP-30-Strangs (Vorgeschichte, vollständig)

Diese Liste stand bis 2026-08-12 in `docs/CURRENT_STATE.md` §7a und ist von dort hierher
verlagert worden (CLAUDE.md §9: der Status bleibt kompakt, Belege stehen in den Belegdateien).

[`v3-skalierungspruefung-2026-08-08.md`](v3-skalierungspruefung-2026-08-08.md) ·
[`skalierungsgrundlage-1000.md`](skalierungsgrundlage-1000.md) ·
[`op30-abnahme-2026-08-08.md`](op30-abnahme-2026-08-08.md) ·
[`skalierung-200-mandate.md`](skalierung-200-mandate.md) ·
[`lokaler-production-schutz.md`](lokaler-production-schutz.md) ·
[`op30-testbefunde-2026-08-08.md`](op30-testbefunde-2026-08-08.md) ·
[`workerbetrieb.md`](workerbetrieb.md) ·
[`op30-abschlussreview-2026-08-08.md`](op30-abschlussreview-2026-08-08.md) ·
[`op30-aktivierungsreife-2026-08-09.md`](op30-aktivierungsreife-2026-08-09.md) ·
[`lage-narrativ-warteschlange-2026-08-09.md`](lage-narrativ-warteschlange-2026-08-09.md) ·
[`op30-e1-abschlussreview-2026-08-09.md`](op30-e1-abschlussreview-2026-08-09.md) ·
[`op30-kapazitaet-morgenslots-2026-08-09.md`](op30-kapazitaet-morgenslots-2026-08-09.md) ·
[`briefing-frischevertrag-2026-08-10.md`](briefing-frischevertrag-2026-08-10.md).

Innerhalb dieses Runbooks: Inventar/Pläne/Grenzen §1–§8 · `mdb-a` §9 · Migrationsbeleg §12 ·
Neutralität §13 · blockierter Versuch §14 · Aktivierung + erster Lauf §15 · Rücknahme §16 ·
**berichtigte Altersmessung §17**.

### 17.10 Ausführungsbeleg — Betreiberablauf §17.8 ausgeführt (2026-08-12, freigegeben)

**Ausgeführt am 2026-08-12 zwischen 17:17 und 17:24 UTC** aus einer Claude-Sitzung mit
ausdrücklicher Betreiberfreigabe (Chat-Auftrag; Umfang: Export der 180 offenen Aufträge,
kontrollierte Löschung genau dieser 180, Anwendung der Migration `20260812`). Alle Werte
gemessen, keine Nutzdaten in diesem Beleg.

**Vorprüfung (14 Punkte, alle bestanden):** PR #244 gemergt (`1fd9c98b` auf `main`),
Production-Deployment `dpl_6joktzAKgqp5CfhFqHT771znrEKZ` READY, **kein** weiteres Deployment
seit dem Merge (⇒ keine wirksame Env-Änderung; der 16:00-Wirkungsnachweis des ausgeschalteten
Motors gilt für exakt dieses Deployment), Migration nicht angewendet, Zustand exakt
235 / 180 wartend / 0 laufend / 55 erledigt / 0 fehlgeschlagen, 0 Leases, 0 Reservierungen,
0 Änderungen seit dem Nachweis, Löschauswahl = exakt 180, Migrationsdateien byte-identisch
mit `origin/main` (SHA256 `90ca4ef2…d37d` / `257ddba2…f9d7`).

**Lokaler Rücknahmenachweis unmittelbar davor erneut geführt:**
`jobqueue-ruecknahme-datenbank-test.js` **31 PASS / 0 FAIL** ·
`jobqueue-alter-datenbank-test.js` **26 PASS / 0 FAIL** (PostgreSQL 16.13, wegwerfbar).

**Schritt 0/1 — Export:** Datei `helmut_jobs_offen_2026-08-12.json`, 257 848 Bytes,
**180 Elemente, alle 20 Spalten je Element** (Production trägt seit
`20260809_jobqueue_wiedervorlage` eine Spalte mehr als die 19-Spalten-Basis), 180 eindeutige
IDs, Pflichtfelder vollständig, zweimal gelesen und geparst. **SHA256
`d74e76188cd47b3a5f4fe4f895d7db8d901cac60fd9c80304595eb89bfbfcda9`.**
Identität mit der Löschauswahl über die ID-Ketten-md5 bewiesen (sortierte IDs, Komma):
lokal = Server = `df57f03b6909cb6fa3f4da5212497402`; Inhalts-Kennzahlen identisch
(Σ attempts 2 · 45 Fehlertexte · Typen 131/39/5/5 · Fenster 165/10/5). Server-Referenz-md5
der `jsonb_agg`-Fassung: `699f8040545abf07e0fb52b8384a4613`. Die Datei wurde dem Betreiber
**direkt übergeben** (Konversations-Anhang; nicht committet, nicht veröffentlicht) und liegt
zusätzlich im Sitzungs-Scratchpad (chmod 600).

**Schritt 2 — Neutralisierung:** eine Transaktion, Zielzeilen mit `for update` gesperrt,
darin nacheinander geprüft: Zählung = 180 · ID-Ketten-md5 = Exportwert · `row_count` der
Löschung = 180 · Nachzustand in der Transaktion = 55/55/0. Erst dann Commit. Ergebnis:
**exakt 180 gelöscht**; `pg_stat` zeigt `n_tup_ins/upd/del = 235/202/180` (kein Insert,
kein Update). Die **55 erledigten Aufträge sind byte-identisch unverändert**
(`jsonb_agg`-md5 vorher = nachher = `0ad846c771668db5fb9d7e5ae8d9fe2c`). Alle 180
Export-IDs fehlen aus der Tabelle (verbleibende 55 vollständig geholt, Schnittmenge 0).
Nebenwirkungsfreiheit strukturell belegt: **0 Fremdschlüssel** auf `helmut_jobs`,
**0 DELETE-Trigger**; `llm_reservations` unverändert 0/0/0.

**Schritt 3 — Migration `20260812`:** Funktionszustand vorher gesichert
(md5 `94357e97dcc4f9f82da481c8c569ab13`; Wiederherstellung = Rollback-Datei). Angewendet
über den dokumentierten Weg (MCP `apply_migration`, derselbe wie am 2026-08-11) als
**genau eine** Migration → Historieneintrag **`20260812172327 ·
20260812_jobqueue_altersmessung`** (jetzt 26 Einträge). Abnahme: 17 Ausgabespalten, die
drei Wartezeit-Spalten am Ende, Formel `greatest(created_at, first_due_at)` in der
Definition, SECURITY INVOKER, **0 Rechte** für `anon`/`authenticated`/`PUBLIC`, Advisor
unverändert (kein neuer WARN/ERROR). Kennzahlen auf der leeren offenen Warteschlange:
`wartend/laufend/fehlgeschlagen/endgueltig = 0`, **alle vier Alterswerte 0**,
`ueberfaellige_mandate(_wartezeit) = 0`, `erledigt_im_zeitraum = 55` (die Abschlüsse vom
11.08. liegen im 24-h-Fenster — korrekt). Die Schwellen (18 h / 24 h) stehen unverändert im
deployten App-Code. Der Nachweis „historisches Quelldatum erzeugt keinen falschen kritischen
Zustand" stützt sich auf die byte-identisch angewendete, lokal bewiesene Migration
(26 PASS, §17.6) plus die Production-Definitionsprüfung — **kein** künstlicher Auftrag
wurde in Production eingeführt.

**Nicht getan:** kein Flag, keine Env-Änderung, kein Deployment (0 neue Deployments seit
`dpl_6jokt…`), kein Cronlauf (letzter Lauf unverändert `cron-pipeline-20260812160111-ejqa2`),
kein Worker, kein neuer Auftrag, keine weitere Migration (offen bleibt nur `20260720`,
OP-03), keine Änderung an den 55 erledigten Aufträgen, OP-15 unberührt, keine Ausweitung.

**Damit ist §17.8 bis einschließlich Schritt 3 erledigt. Schritt 4 (Flag + Redeploy,
K0–K3 von vorn) ist NICHT ausgeführt — er ist der nächste, separat freigabepflichtige
Betreiberschritt.** K0 prüft zusätzlich `altersvertrag = "wartezeit"`; diese Bedingung ist
durch die angewendete Migration jetzt erfüllbar.

## 19 · Zweiter Aktivierungsversuch 2026-08-12/13 — kontrollierte Rücknahme VOR Grenzübertritt (Fünferlauf NICHT bestanden)

Durchgeführt in einer Claude-Sitzung mit ausdrücklicher Betreiberfreigabe (Aktivierung)
und Betreiber-Ausführung beider Env-Änderungen (kein Schreibweg aus Sitzungen, §14.1
unverändert). Alle Sitzungszugriffe rein lesend; kein manueller Cronlauf, keine
Production-Datenänderung, keine Migration, keine Codeänderung.

### 19.1 K0-Vorprüfung vor der Aktivierung (2026-08-12, 18:27–18:50 UTC) — bestanden

Alle zehn Auftragspunkte a–j grün, u. a.: Production-Deployment
`dpl_6TeiGM7w4aeWhp8fTUL28ThSsJED` READY 18:27:35Z mit Commit `8088fc9` (= Merge PR #245 =
`main`-HEAD; Asset-Version `?v=8088fc99` aus der Anwendung bestätigt, CI grün) ·
Flag wirkungsbasiert aus (16:00-Lauf Altpfad; `pg_stat` 235/202/180 unverändert seit §17.10) ·
26 Migrationen, zuletzt `20260812172327`, offen nur `20260720` (OP-03) ·
**`altersvertrag="wartezeit"` erfüllt** (alle drei Wartezeit-Spalten in `helmut_job_metrics()`,
Werte 0; Formel `greatest(created_at, first_due_at)` in der Definition) · Warteschlange exakt
55 erledigt / 0 offen, Inhalts-md5 `0ad846c7…fe2c` byte-identisch zu §17.10 · 0 Leases /
0 Reservierungen · genau die 5 Mandate, `mdb-a` inert (1/1/0) · 0 konkurrierende
Deployments/Läufe · Offline-Suite lokal 240/245 (die 5 roten = dokumentiertes lokales
Basisrot, §17.6; im CI grün). Bekannte Lücke unverändert: `/api/ops/jobqueue` ohne
`CRON_SECRET` nicht abrufbar (fail-closed 401 bestätigt) — Ersatzbeleg wie §15.1.
CI-Nebenbefund: der main-Lauf auf `1fd9c98` war durch die einzelne flackernde Suite
`brandenburg-e2e-vertrag-test.js` rot (244/245; F-E2E-Klasse); auf `8088fc9` grün.

### 19.2 Aktivierung und K0-Sofortkontrolle (18:50–18:52 UTC) — bestanden

Betreiber setzte `HELMUT_SCALABLE_PIPELINE=on` (nur Production) + Redeploy:
**`dpl_9Pvj1N6y94PhdqWQ5BawoxVk839C` READY 18:50:17Z**, `source=redeploy`, Commit `8088fc9`
unverändert ⇒ reine Konfigurationsänderung (erneut Doppel-Redeploy, der zweite trägt die
Aliasse — bekanntes Muster, unschädlich). K0 sofort: Anwendung HTTP 200, DB seit Aktivierung
unberührt (55/0, 0 Leases/Reservierungen, Budget und Briefings unverändert) — 0 Zusatzkosten.
Punkt 9 (nur dieses Flag wirksam) wie beim ersten Versuch erst am ersten Lauf belegbar — dort
belegt (§19.3: 0 `tenant_narrative`, 0 `llm_reservations`).

### 19.3 Die fünf Läufe des Nachweisfensters (alle Werte gemessen)

| Lauf | Kennzahlen | Urteil |
|---|---|---|
| **crawl 20:00 12.08.** `cron-crawl-20260812200012-pe1ba` | `[cron/crawl/warteschlange]` **272 640 ms** · geplant=193 neu=193 · erledigt=65 · wiederholt=2 · endgueltigFehler=0 · rotation=5 · zustand=**unbekannt** (Metrik-Lesetimeout am Laufende nach 2 Storage-Timeouts; Direktmessung real grün) · 247 neue Aufträge, nur die 5 Mandate, `mdb-a`=0, 0 Dubletten · **Wartezeitvertrag wirkt:** Fälligkeitsrückstand 6,8 d gemeldet ohne Abbruch, Wartezeit 825 s · R4: +12 Buchungen / 11 persistierte Gegenstücke (1 neues + 10 aktualisierte KO; 12. Buchung koinzidiert mit 2 am Slotende abgeschnittenen Verstehensaufträgen — keine Verdopplungssignatur) · 11 Zeilen in `laeuft` mit ablaufenden Leases (Slotende-Abschnitt, by design) | Wirkungsnachweis OP-30 erbracht; Slotdauer in Beobachtungszone 270–280 s |
| **crawl 04:00 13.08.** `cron-crawl-20260813040043-t6f2s` | **262 637 ms** · erledigt=30 · endgueltigFehler=0 · zustand=**gruen** · die 11 Abgeschnittenen ohne Dubletten wiedergeholt (9× attempts>1) · R4: +12 Buchungen / 14 KO-Gegenstücke, kein Überschuss | grün |
| **morning 05:00 + lage 05:45 13.08.** | **5/5 `morgenlage` `status=erfolg`** + 5/5 `lage`, je genau 1 je Mandat, +10 Briefings exakt, genau 1 Push je Mandat, Budget +26 | grün — OP-31 hält unter OP-30 |
| **Watchdog 06:54–06:58 13.08.** (GitHub Actions success) | Unter OP-30 ein regulärer Drain-Slot: 31 erledigt (28 Abrufe + 3 Verstehen), +12 Buchungen / 9 Gegenstücke, **0 neue Briefings, 0 Doppel-Pushs, 0 Dubletten** | Schutzabsicht erfüllt; **§8.3 wörtlich („0 neue KI-Aufrufe") ist queue-inkompatibel** — der Zweitlauf arbeitet legitim neuen Rückstand ab (Kriterienbefund → §19.6) |
| **pipeline 16:00 13.08.** `cron-pipeline-20260813160255-6fswd` | **257 041 ms** · erledigt=54 · **neu=169 < geplant=193 ⇒ Dedupe erstmals produktiv belegt** (Messwert 8) · endgueltigFehler=0 · zustand=**warnung** (Wartezeit 12–24-h-Zone, korrekt) | grün, Warnzone korrekt gemeldet |

Durchgehend über alle Läufe: **0 endgültige Fehler, 0 doppelte Idempotenzschlüssel, 0 fremde
Mandate, 0 Aufträge für `mdb-a`, 0 `llm_reservations`, 0 `tenant_narrative`, kein
Deckelkontakt** (12.08.: 62/100 gesamt; 13.08.: 77/100), keine neue Runtime-Fehlerklasse
(nur OP-15-Google-Klasse und Supabase-Storage-Timeouts beim Blob-Schreiben).

### 19.4 Der Kapazitätsbefund — Grund der Rücknahme

**Ankunftsrate ≫ Abflussrate bei der §6-Default-Konfiguration** (worker=2, Slotbudget 270 s,
3–4 Drain-Slots/Tag; Briefing-/Lage-Slots konsumieren die Warteschlange nicht):

- Ankunft: ~440–470 Aufträge/Tag bei 5 Mandaten (12.08. 20:00: +247; 13.08.: +218 am 04:00,
  +169 netto am 16:00 trotz Dedupe).
- Abfluss: 30–65 Aufträge je Slot gemessen (65/30/31/54) ⇒ ~130–180/Tag.
- Folge: offener Bestand 0 → 182 (12.08. 20:15) → 371 (13.08. 06:18) → **524** (16:20);
  vom 12.08.-Lauf waren um 08:46 noch 125, nach dem 16:00-Slot noch **77 offen** — deren
  24-h-Wartezeitmarke (20:00:26–20:05 UTC) war ohne weiteren Drain-Slot **rechnerisch sicher**
  nicht mehr einhaltbar. Zwei §8.2-Stopp-Kriterien liefen damit auf: Wartezeit > 24 h und
  „Warteschlange wachsend über 24 h".

Die Produktausgabe blieb durchgehend unberührt (Morgenlage über die unveränderte
Briefing-Route). Kein Warteschlangenfehler: der Motor arbeitete fehlerfrei, fair, ohne
Doppelarbeit — er ist mit den Defaults schlicht zu langsam für die eigene Ankunftsrate.
Vorwarnung an den Betreiber 08:55 UTC, Entscheidungsmessung 16:19, Rücknahme-Anforderung
16:20 — **die Rücknahme erfolgte VOR Eintritt des kritischen Zustands** (bewusste
Betreiberentscheidung statt Nachtbetrieb in `kritisch`).

### 19.5 Rücknahme und Wirkungsnachweis (§7 Schritt 1 + 5) — BESTANDEN

Betreiber setzte das Flag `off` + Redeploy: **`dpl_5Ktikubeezvj1hwfmXaxr7QqhWPi` READY
16:27:27Z**, `source=redeploy`, Commit `8088fc9` unverändert. Basislinie 17:18/19:38 UTC
eingefroren: 524 wartend / 235 erledigt, `pg_stat` **939/1765/180**, 0 Leases,
0 Reservierungen, Budget 72 (16:07). **crawl 20:00 UTC 13.08.**
(`cron-crawl-20260813200040-6d9uc`): vollständig Altpfad — `[cron/crawl/globalphase]`
202 563 ms, status=teilweise, quellen=174, rohdokumente=1946, verstanden=9;
`[cron/crawl/fairness] erfolgreich=5 zustand=ok`; **keine** `warteschlange`-Zeile;
`pg_stat` byte-genau unverändert 939/1765/180; 524/235 unverändert; 0 Leases;
0 Reservierungen; Budget +5 vollständig durch das Altpfad-Verstehen erklärt (5 Clusteraufrufe
für 9 Dokumente); Fehler nur OP-15-Klasse (1 Google-Timeout). **OP-30 ist wirkungsbasiert
wieder aus.** Die 524 wartenden Aufträge bleiben als ehrlicher, inerter Zustand stehen
(§7 Schritt 2/3: niemand holt sie ab, keine Kosten); die überschrittene 24-h-Marke ist im
ausgeschalteten Zustand bedeutungslos.

### 19.6 Kriterien- und Messbefunde für den nächsten Versuch

1. **§8.4-K1-Kriterium „Watchdog-Zweitlauf ohne neue KI-Aufrufe" (§8.3) passt nicht zum
   Warteschlangenpfad:** der Zweitlauf draint legitim neuen Rückstand. Richtige Fassung:
   „0 Doppelarbeit, 0 Doppel-Pushs, Buchungen nur für erstmalige Arbeit" — vor dem nächsten
   Versuch in §8.3/§8.4 einarbeiten.
2. **`llm_usage` ist leer** (auch an Vortagen) — die R4-Gegenprobe stützt sich auf
   KO-Gegenstücke und ist bei Slotende-Abschnitten nicht exakt schließbar (Punkt 17,
   Kostenmessung). Echte Aufruf-Telemetrie wäre der saubere Träger.
3. **`zustand=unbekannt` bei Metrik-Lesetimeout am Laufende** (12.08. 20:04): ehrlich statt
   falschem Grün, aber eine Messlücke — der Laufabschluss sollte die Metrik-Lesung
   wiederholen dürfen.
4. **Wartezeitvertrag §17.5 erstmals produktiv bestätigt:** 6,8 d Fälligkeitsrückstand ohne
   Fehlabbruch, Wartezeit als maßgebliche Größe; Warn-/Kritisch-Stufen feuerten korrekt.
5. **Vor einem dritten Versuch zu entscheiden (Betreiber):** (a) Abflussrate erhöhen —
   `HELMUT_WORKER_*`-Parallelität (lokal bis 8 bewiesen: 4 093 Aufträge/s) und/oder mehr
   Drain-Slots; §6 Schritt 3 („Defaults, sonst nichts") wäre entsprechend neu zu fassen und
   die Kapazität je Slot vorab zu bemessen; (b) Umgang mit den 524 inerten Aufträgen — vor
   einem dritten Versuch erneute Neutralisierung nach dem bewiesenen Muster §17.8/§17.10
   (Export → geschützte Löschung; Rückweg 31-PASS-belegt).

### 19.7 Nicht getan (Verbote eingehalten)

Kein Merge nach `main`, kein Deployment aus der Sitzung (beide Env-Änderungen + Redeploys
waren Betreiberaktionen nach ausdrücklicher Freigabe bzw. §8.2-Empfehlung), kein manueller
Cronlauf, keine Migration (offen bleibt nur `20260720`), keine Production-Datenänderung
(0 Schreibzugriffe; alle Belege rein lesend), keine Änderung an Crons/Secrets/anderen Flags,
keine Ausweitung über 5 Mandate, `understanding-recovery.yml` nicht berührt.

## 20 · Zielarchitektur statt „mehr Slots" (Architektursprint 2026-08-13/3)

Der auf §19 folgende **Kapazitätssprint wurde kontrolliert abgebrochen**; seine geplante
Zwischenlösung (Parallelität 6 + sechs zusätzliche Drain-Slots) war weder getestet noch
committet und wurde **verworfen — sie ist nicht die Zielarchitektur und wurde nicht
rekonstruiert**. An ihre Stelle tritt die im Architektursprint 2026-08-13/3 gebaute und
lokal nachgewiesene **OP-30-Zielarchitektur** (transaktionale Outbox, austauschbarer
Transport mit Wecksignalen, verteilte Klassengrenzen, Vorgangswache als engere Nachfolgerin
des globalen Understanding-Schlosses). Kanonische Entscheidungs- und Belegdatei:
[`op30-zielarchitektur-2026-08-13.md`](op30-zielarchitektur-2026-08-13.md) — dort stehen
Architekturvergleich (7 Varianten × 20 Kriterien), Mengengerüst 5–500, der lokale
Architektur- und Lastnachweis samt ehrlicher Grenzen, die Analyse der 524 inerten
Aufträge, der Stufenplan und der genaue nächste Betreiberablauf.

**Wirkung auf dieses Runbook:** §1–§19 bleiben unverändert gültig (der Altpfad und der
Cron-Queue-Antrieb bestehen fort; die 524 Aufträge stehen weiter inert). Ein **Versuch 3**
beginnt unverändert bei §6 Schritt 3 mit K0–K3 von vorn — neu ist, dass Stufe 1 des
Zielarchitektur-Stufenplans (`HELMUT_JOB_DISPATCH_MODE=shadow`) parallel den Outbox-Beweis
erbringt, ohne dass irgendetwas den Prozess verlässt. Vorher gelten unverändert §19.6:
524 neutralisieren (Muster §17.8/§17.10) und §8.3/§8.4 queue-tauglich fassen. In
Production wurde in diesem Sprint **nichts** verändert (alle Zugriffe rein lesend; die
zwei neuen Migrationspaare `20260813` sind NICHT angewendet; alle neuen Flags Default-AUS).

---

## §21 · Haertungssprint 2026-08-14: verwalteter Transport (SQS + Lambda)

Der Aktivierungsweg dieses Runbooks (§19.6, §20) bleibt unveraendert gueltig — er beschreibt
die Stufen 0–2 mit dem **Cron-Antrieb** und dem Schattenmodus. Was sich geaendert hat:

1. **Der Standardtransport ist `sqs`,** nicht mehr der Selbstweck. Der Selbstweck ist in
   Production ohne `HELMUT_SELBSTWECK_ERLAUBT=on` **gesperrt** (Notfall-/Entwicklungsweg).
2. **Fuer Stufe 2 (Ereignis-Antrieb) sind jetzt AWS-Ressourcen noetig**, die es **nicht
   gibt**: Queue, Dead-Letter-Queue, KMS-Schluessel, IAM-Sender, Lambda-Verbraucher. Die
   Definition liegt vollstaendig in `infra/aws/helmut-auftrags-queue.yaml`; ihr Anlegen ist
   eine **kostenpflichtige Gruenderentscheidung**.
3. **Zwei neue Migrationen** (`20260814090000`, `20260814090100`) gehoeren zur Stufe 1 dazu.
   Beide sind **nicht angewendet**.

### §21.1 Reihenfolge fuer Stufe 1 (unveraendert freigabepflichtig)

1. Die 524 wartenden Auftraege nach §17.8 neutralisieren (unveraendert).
2. Migrationen anwenden — in dieser Reihenfolge:
   `20260813090000_jobqueue_outbox.sql` → `20260813090100_verteilte_grenzen.sql` →
   `20260814090000_queue_verbraucher.sql` → `20260814090100_anbieter_steuerung.sql`.
   Die Verifikationsbloecke stehen jeweils am Dateiende.
3. Flags: `HELMUT_SCALABLE_PIPELINE=on`, `HELMUT_JOB_DISPATCH_MODE=shadow`.
   **Noch KEIN** `HELMUT_JOB_TRANSPORT`, **kein** AWS.
4. Beobachten wie in §19.6 beschrieben.

### §21.2 Zusaetzliche Schritte fuer Stufe 2 (Ereignis-Antrieb)

1. Gruenderentscheidung ueber die AWS-Kosten (SQS je Anfrage, Lambda je Aufruf und
   GB-Sekunde, KMS je Schluessel, CloudWatch je Protokoll — Mengen siehe Belegdatei §23).
2. Stack aus `infra/aws/helmut-auftrags-queue.yaml` in **eu-central-1** anlegen.
3. Supabase-URL und service_role-Schluessel als **SSM-Parameter** hinterlegen (SecureString);
   sie stehen NIE in der Vorlage und NIE in einer Lambda-Umgebungsvariablen im Klartext.
4. Lambda-Paket aus dem Repository bauen (Einstieg `lambda/index.js`).
5. In Vercel setzen: `HELMUT_SQS_QUEUE_URL` (Ausgabe `QueueUrl`), `HELMUT_KLASSEN_GRENZEN=on`,
   `HELMUT_JOB_DISPATCH_MODE=queue`. `AWS_REGION` bleibt auf `eu-central-1`.
6. Zugangsdaten des IAM-Senders in Vercel hinterlegen (nur `sqs:SendMessage`).
7. **Ruecknahme in einem Schritt:** `HELMUT_JOB_DISPATCH_MODE=shadow` (oder `off`) +
   Redeploy. Die Queue laeuft dann leer; kein Auftrag geht verloren, der Cron-Rueckfallweg
   traegt weiter.

### §21.3 Was der Haertungssprint NICHT freigibt

Weder die AWS-Aktivierung noch die Anhebung des KI-Tagesdeckels noch eine hoehere
Verstehensparallelitaet (die bleibt bei 1, Belegdatei §22). Helmut ist durch diesen Sprint
**nicht** fuer 25, 100, 200 oder 500 Mandate freigegeben.

---

## §22 · AWS-Betreiberanleitung nach dem Korrekturlauf 2026-08-14/3

Diese Anleitung **ersetzt §21.2 Schritt 3–6**. Sie ist die vollständige Reihenfolge für den
Tag, an dem der Betreiber Stufe 2 tatsächlich einschalten will. **Nichts davon ist getan.**

### §22.1 Was AWS zu sehen bekommt (Datenumfang)

Über die Transportgrenze geht ausschließlich `{ jobId, schemaVersion }` — eine UUID und eine
Zahl. **Kein Mandatsname, kein Dokument, kein Text, keine Quelle, keine E-Mail-Adresse.** Die
Outbox hat strukturell keine Inhaltsspalte. In den CloudWatch-Protokollen stehen nur Zahlen
und Ausgänge, nie eine Auftrags-, Mandats- oder Quellenkennung.
**Der Supabase-Dienstschlüssel liegt in AWS** — als SSM-SecureString und zur Laufzeit im
Prozessspeicher der Lambda-Funktionen. Das ist die eigentliche Vertrauensentscheidung, nicht
die Nachrichtenmenge.

### §22.2 Reihenfolge

1. **Kostenentscheidung.** Mengen: Belegdatei §23 (Nachrichten/Tag) und §24.1 (Zeitgeber).
   Größenordnung bei 5–25 Mandaten: SQS, Lambda und EventBridge liegen im kostenlosen
   Kontingent; KMS kostet ~1 $/Monat je Schlüssel, CloudWatch nach Volumen.
2. **Paket bauen** (reproduzierbar):
   `node scripts/lambda-paket-bauen.js --ziel build/`
   Ergebnis prüfen: 1.515 Dateien, 2,17 MiB Archiv, SHA-256 aus dem Manifest **notieren**.
   Der Bau ist deterministisch — zwei Läufe ergeben dieselbe Prüfsumme.
3. **Paket nach S3** in **eu-central-1** hochladen (eigener Bucket, keine öffentliche
   Freigabe, Versionierung an). Bucketname und Objektschlüssel merken.
3b. **Trockenlauf ohne jede Ressource** (kostet nichts, legt nichts an) — **beide Läufe
   gehören vor Schritt 4**, sie sind der bisher offene AWS-Nachweis aus Belegdatei §26.3:

   ```bash
   # (a) FALSCHE Region: der Plan muss LEER sein — null Ressourcen.
   aws cloudformation create-change-set --region eu-west-1 \
     --stack-name helmut-auftrag-probe --change-set-name riegelprobe --change-set-type CREATE \
     --template-body file://infra/aws/helmut-auftrags-queue.yaml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameters ParameterKey=PaketBucket,ParameterValue=<bucket>
   aws cloudformation describe-change-set --region eu-west-1 \
     --stack-name helmut-auftrag-probe --change-set-name riegelprobe \
     --query 'length(Changes)'          # ERWARTET: 1 (nur RegionsRiegel) — nie eine Queue,
                                        # Funktion, Rolle, Protokollgruppe oder ein Schlüssel
   # (b) eu-central-1: derselbe Aufruf muss 17 Einträge planen.
   ```
   Beide Change-Sets danach **löschen** (`delete-change-set`, dann `delete-stack` auf den
   `REVIEW_IN_PROGRESS`-Stack). Ein Change-Set legt **keine** Ressource an — es ist ein Plan.

4. **Stack anlegen** aus `infra/aws/helmut-auftrags-queue.yaml` mit den Parametern
   `PaketBucket`, `PaketSchluessel`, `SupabaseUrlParameter`, `SupabaseSchluesselParameter`,
   `Umgebung`, `MaxParallelitaet`.
   **Diese Reihenfolge ist verbindlich:** der Stack legt den KMS-Schlüssel für die Parameter
   an, und den braucht Schritt 5. Umgekehrt ginge es nicht.
5. **SSM-Parameter anlegen** (eu-central-1, Typ **SecureString**) — mit **genau dem
   Schlüssel aus dem Stack**:

   ```
   aws ssm put-parameter --region eu-central-1 --type SecureString \
     --key-id alias/helmut-ssm-production \
     --name /helmut/production/supabase-url --value '<URL>'
   aws ssm put-parameter --region eu-central-1 --type SecureString \
     --key-id alias/helmut-ssm-production \
     --name /helmut/production/supabase-service-role-key --value '<SCHLUESSEL>'
   ```

   **`--key-id` ist nicht optional.** Ohne ihn landet der Parameter unter dem Vorgabeschlüssel
   des Kontos, und die Berechtigung der Lambda-Rollen greift nicht — die Funktionen stoppen
   dann geschlossen und arbeiten nie. Der Fehler tritt beim ersten Lauf sofort und laut auf,
   aber er kostet einen Anlauf.
   **Die Werte werden direkt in die Kommandozeile bzw. das Konsolenformular eingegeben — nie
   in eine Datei, nie in einen Commit, nie in einen Chat.**
   **Nur in eu-central-1.** Jede echte Ressource der Vorlage trägt `Condition: IstFrankfurt`;
   CloudFormation wertet Bedingungen **vor** dem Anlegen aus, in jeder anderen Region entsteht
   deshalb **keine einzige** Ressource (Belegdatei §26.2). Ein früher dokumentierter
   „KMS-Riegel" (§24.7) hielt nichts und ist ersetzt.
6. **Vercel-Variablen setzen:** `HELMUT_SQS_QUEUE_URL` (Stack-Ausgabe), `AWS_REGION` bleibt
   `eu-central-1`, `HELMUT_KLASSEN_GRENZEN=on`, `HELMUT_JOB_DISPATCH_MODE=queue`.
   Zugangsdaten des IAM-Senders hinterlegen (**nur** `sqs:SendMessage` + KMS-Produzentenrechte).
7. **Ereignisquelle prüfen, dann Zeitgeber einschalten.** Der EventBridge-Zeitgeber
   (`helmut-outbox-relay-<umgebung>`) wird **DISABLED** ausgeliefert. Er ist die
   Wiedervorlage später fälliger Arbeit **und** die automatische Reparatur eines verlorenen
   Anstoßes. Ohne ihn trägt nur der unmittelbare Anstoß — Ketten laufen, aber später fällige
   Arbeit und Wiederholungen bleiben liegen, bis ein Cron-Slot sie aufsammelt.
   Kosten: 1.440 Aufrufe/Tag, Kostenklasse unter 1 $/Monat.

### §22.3 Erste Kontrolle nach dem Einschalten

| Prüfung | Erwartung |
|---|---|
| CloudWatch `helmut-auftrags-verbraucher` | Zeilen `[lambda/verbraucher] … ausgang=erledigt`, **keine** `konfiguration-nicht-geladen`, **keine** `supabase-nicht-verbunden` |
| CloudWatch `helmut-outbox-relay` | `[lambda/relay] ausloeser=… versendet=n` — es **muss** Zeilen mit `ausloeser=verbraucher` geben, sonst ist der unmittelbare Anstoß nicht angekommen |
| CloudWatch `helmut-auftrags-verbraucher` | **keine** Zeile `KONFIGURATIONSBEFUND relay=` — sie bedeutet, dass `HELMUT_RELAY_FUNKTION` fehlt; die Stapelbilanz muss `relay=relay-verdrahtet` zeigen |
| SQS `…-quarantaene` | **leer** — jede Nachricht darin ist ein Befund, kein Betriebsrauschen |
| `helmut_outbox_kennzahlen()` | `offen` fällt, `aelteste_offene_s` bleibt klein |
| `helmut_jobs` | `wartend` sinkt, `laeuft` bleibt klein, `fehlgeschlagen` wächst nicht |

### §22.4 Rücknahme (ein Schritt, jederzeit)

`HELMUT_JOB_DISPATCH_MODE=shadow` (oder `off`) + Redeploy. Die Queue läuft leer, der
Cron-Rückfallweg trägt weiter, **kein Auftrag geht verloren**. Zusätzlich optional: den
EventBridge-Zeitgeber deaktivieren und die reservierte Lambda-Parallelität auf 0 setzen —
dann verarbeitet AWS nichts mehr, ohne dass etwas gelöscht wird.

### §22.5 Was auch nach diesem Korrekturlauf NICHT freigegeben ist

Die AWS-Aktivierung selbst, die Anhebung des KI-Tagesdeckels und eine höhere
Verstehensparallelität (bleibt 1). **Helmut ist nicht für 25, 100, 200 oder 500 Mandate
freigegeben.** Der Korrekturlauf hat die Lücken geschlossen, die eine Aktivierung technisch
unmöglich gemacht hätten — er ersetzt keinen Production-Nachweis.

---

## §23 · Verstehensparallelität: der Vertrag steht, die Zahl bleibt 1 (Sprint 2026-08-14/6)

Der Stufenplan trug bisher an genau einer Stelle eine Auflage: *„vor Verstehens-Parallelität
> 1 CAS-Härtung des Update-Vormerkungs-Stores"*. Sie ist eingelöst — der atomare
Verstehensvertrag ist gebaut und lokal nachgewiesen. Kanonisch:
[`op30-verstehen-cas-2026-08-14.md`](op30-verstehen-cas-2026-08-14.md).

**Für den Betreiber ändert sich in diesem Sprint nichts.** Es ist nichts aktiviert, nichts
angewendet, nichts deployt. Der Standard bleibt Parallelität 1; Production läuft unverändert
auf dem Altpfad.

### §23.1 Was neu freigebbar wäre (und in welcher Reihenfolge)

Drei Schritte, jeder einzeln zurücknehmbar, jeder eine eigene Entscheidung:

| Schritt | Aktion | Wirkung | Rücknahme |
|---|---|---|---|
| 1 | Migration `20260814180000_verstehen_cas.sql` anwenden | **keine** — ohne Flag rührt sie kein Codepfad an; der Trigger feuert nur, wenn ein Schreibvorgang `verstehen_fencing` ausdrücklich setzt, und das tut ohne Vertrag niemand | `rollback_20260814180000_verstehen_cas.sql` |
| 2 | `HELMUT_VERSTEHEN_CAS=on` + Redeploy | der Vertrag wirkt; die Vormerkungen wandern vom Karten-Store in die Vorgangszeilen. **Der Durchsatz ändert sich nicht** — Parallelität bleibt 1 | Flag zurück auf leer + Redeploy |
| 3 | `HELMUT_VERSTEHEN_PARALLELITAET` und/oder `HELMUT_KLASSE_VERSTEHEN_MAX` > 1 | erst hier steigt der Verstehensdurchsatz | Wert zurück auf 1 + Redeploy |

Schritt 3 setzt Schritt 2 technisch voraus: ohne `HELMUT_VERSTEHEN_CAS` wird jede Zahl > 1
**hart auf 1 geklemmt** und einmalig gemeldet. Das ist Absicht — ein vergessenes Flag darf
nicht in doppelte KI-Kosten münden.

### §23.2 Erste Kontrolle nach Schritt 2 (rein lesend)

| Prüfung | Erwartung |
|---|---|
| `select * from helmut_verstehen_kennzahlen()` | Zeilen mit `zustand='fertig'` wachsen; **`unbekannt` bleibt bei 0** |
| `select count(*) from helmut_verstehen_reservierungen where zustand='unbekannt'` | 0 — jede Zeile hier ist ein Befund (abgestürzter Modellaufruf mit unbekanntem Ausgang), kein Betriebsrauschen |
| Lauftelemetrie (`processRuns`) | keine Klasse `skipped-ausgang-unbekannt`; `skipped-veraltet` nur bei echter Nebenläufigkeit |
| `select count(*) from knowledge_objects where verstehen_fencing is not null` | wächst — der Beleg, dass der Vertrag wirklich schreibt |
| KI-Tagesbudget | **unverändert** — der Vertrag erzeugt keinen zusätzlichen Aufruf |

### §23.3 Wenn ein unbekannter Ausgang auftritt

Er ist **kein Störfall**, sondern eine Entscheidung: ein Modellaufruf wurde begonnen, sein
Ergebnis ist aber nicht persistiert, und niemand kann belegen, ob er eines geliefert hat.
Der Vorgang ist blockiert und kostet nichts.

**Seit dem Korrekturlauf 2026-08-15 erreicht diesen Zustand deutlich mehr als nur ein
Absturz** (kanonisch: [`op30-verstehen-cas-2026-08-14.md`](op30-verstehen-cas-2026-08-14.md)
§10.1). `unbekannt` heißt jetzt auch: Zeitüberschreitung, Verbindungsabbruch, unklarer
Anbieterfehler, unbrauchbare oder schemawidrige Modellantwort, Validierungs- oder
Speicherfehler. Das ist **Absicht** — jeder dieser Fälle hat den Aufruf möglicherweise
bezahlt, und keiner rechtfertigt eine automatische Wiederholung. `letzter_grund` in
`helmut_verstehen_reservierungen` nennt die Ursache.

**Erwartung für den Betrieb:** ein paar solcher Zeilen sind normal, sobald der Vertrag
scharf ist — sie sind nicht mehr gleichbedeutend mit „etwas ist kaputt". Ein *wachsender*
Rückstand ist es sehr wohl. Die Kontrolle in §23.2 („`unbekannt` bleibt bei 0") gilt
unverändert für die **erste** Beobachtung direkt nach Schritt 2; danach ist die Frage nicht
mehr „ist es 0?", sondern „wächst es?".

1. Zuerst prüfen lassen, ob das Ergebnis doch vorliegt (kostet nichts, kein KI-Aufruf):
   `select public.helmut_verstehen_ausgang_aufloesen('<vorgang>', 'pruefen');`
   → `aufgeloest-ergebnis-vorhanden` bedeutet: erledigt, nichts weiter zu tun.
2. Sonst entscheiden:
   `… 'erneut'` = **ausdrückliche Zustimmung zu einem zweiten, bezahlten Modellaufruf**;
   `… 'aufgeben'` = terminal, der Vorgang wird nie wieder automatisch verstanden.

Beides sind Änderungen an Production-Daten und damit **freigabepflichtig** (`CLAUDE.md` §5).

### §23.4 Was auch nach diesem Sprint NICHT freigegeben ist

Die AWS-Aktivierung, die Anhebung des KI-Tagesdeckels und die Ausweitung auf 25+ Mandate.
**Helmut ist nicht für 25, 100, 200 oder 500 Mandate freigegeben.** Der Sprint hat einen
technischen Engpass beseitigt — der bindende Grund gegen mehr Mandate war ohnehin ein
anderer: der KI-Tagesdeckel (ab 25 Mandaten reicht 100+30 auch im günstigen Fall nicht) und
OP-15 (Google-Drosselung, ab ~10 Mandaten). Auch der AWS-Trockenlauf aus §22 bleibt eine
gesonderte Betreiberentscheidung und wurde nicht ausgeführt.

---

## §24 · Production-Vorprüfung nach PR #248 und Migrationsplan (2026-08-15)

Rein lesende Vorprüfung gegen Production und Supabase Production; **nichts angewendet,
nichts geändert, nichts deployt, kein Lauf gestartet, keine AWS-Aktion**. Ergebnis: die
fünf offenen OP-30-Migrationen sind bereit — **nach** dem Merge des unten genannten
Korrektur-PRs.

### §24.1 Production-Istzustand (gemessen 2026-08-15 03:02 UTC)

| Gegenstand | Befund |
|---|---|
| `main` / Deployment | `6a501ee` (Merge PR #248) ist auf `main`; Production-Deployment `dpl_Cuub2Uu8vpE5ryKZVevMQJ2mafUZ` **READY**, Ziel `production`, Commit `6a501ee` (2026-08-15 02:51 UTC) |
| Warteschlange | **759 Zeilen: 524 wartend · 235 erledigt · 0 laufend · 0 fehlgeschlagen**, 0 offene Leases. Signatur (id+status+typ+versuche, **keine Inhalte**): `a069f91fde4547493796395f2c989497` |
| Neue Aufträge seit der Rücknahme (13.08. 16:07 UTC) | **0** — `HELMUT_SCALABLE_PIPELINE` ist wirkungsbelegt weiterhin aus |
| Alter Motor | läuft unverändert: jüngstes Wissensobjekt und Rohdokument 14.08. 20:04 UTC (crawl 20:00), jüngster `process_run` 14.08. 21:35 UTC (understanding 21:30) |
| Angewendete Migrationen | letzte ist `20260812172327`. Offen: die **fünf** OP-30-Dateien unten **plus** `20260720` (OP-03, nicht Teil dieses Plans) |
| Namenskonflikte | **keine** — keine der 7 neuen Tabellen und keiner der 32 neuen Funktionsnamen existiert in Production |
| Trigger auf `knowledge_objects` | **keine** — `helmut_ko_fencing_wache_trg` kollidiert mit nichts |
| Voraussetzung der Outbox | `helmut_enqueue_job(text,text,text,jsonb,timestamptz,smallint,integer,text)` existiert mit **exakt** der aufgerufenen Signatur |

**Ehrliche Grenze:** seit dem Deployment von `6a501ee` (02:51 UTC) ist **noch kein Cron
gelaufen**. Der erste Lauf auf diesem Stand ist morning-briefing 05:00 UTC (07:00 Berlin).
Die Aussage „Production-Verhalten unverändert" ist damit codeseitig belegt (alles
Default-AUS, siehe §24.3), **nicht** laufzeitbelegt auf genau diesem Commit.

### §24.2 Migrationsinventar — Reihenfolge, Abhängigkeiten, Prüfsummen

Reihenfolge **1 → 5**. Nur Schritt 3 hat echte Vorbedingungen (empirisch geprüft: ohne
Schritt 1 bricht er mit `relation "public.helmut_job_outbox" does not exist` ab);
1, 2, 4 und 5 sind voneinander unabhängig und einzeln anwendbar.

| # | Datei | Hängt ab von | SHA-256 (nach Korrektur-PR) |
|---|---|---|---|
| 1 | `20260813090000_jobqueue_outbox.sql` | `20260808_scalable_job_queue` (angewendet) | `fb383be116bc1b41…` |
| 2 | `20260813090100_verteilte_grenzen.sql` | — | `4dc5cdb0fa608f9b…` |
| 3 | `20260814090000_queue_verbraucher.sql` | **1 und 2** | `2615433a4f693881…` |
| 4 | `20260814090100_anbieter_steuerung.sql` | — | `ffd85fcad680e69a…` |
| 5 | `20260814180000_verstehen_cas.sql` | nur `knowledge_objects` (per `do`-Block geprüft) | `c21ddc8319b2797d…` |

Jeder Schritt hat **einen eigenen Rückweg** im selben Verzeichnis
(`rollback_<vorwärtsname>.sql`), rückwärts in umgekehrter Reihenfolge 5 → 1.

### §24.3 Warum die Migrationen bei ausgeschalteten Schaltern inert sind

Alle sieben Tabellen sind neu und leer; alle 32 Funktionen werden nur von Codepfaden
gerufen, die hinter `HELMUT_JOB_DISPATCH_MODE`, `HELMUT_KLASSEN_GRENZEN` bzw.
`HELMUT_VERSTEHEN_CAS` liegen (alle Default aus). Der einzige Eingriff in eine bestehende
Tabelle ist die CAS-Migration:

* `knowledge_objects.verstehen_fencing` — nullbare Spalte ohne Default, in PostgreSQL 11+
  reine Metadatenänderung, überall `NULL`.
* `helmut_ko_fencing_wache_trg` — `before insert or update **of verstehen_fencing**`. Bei
  UPDATE feuert er **nur**, wenn die Spalte ausdrücklich im `SET` steht; kein bestehender
  Schreibweg tut das (`storage.js` schreibt über die Allowlists
  `V3_KO_WRITE_COLUMNS`/`V3_KNOWLEDGE_OBJECT_COLUMNS`, in denen `verstehen_fencing`
  ausdrücklich **nicht** steht). Bei INSERT feuert er immer, findet `NULL` und lässt durch.

Lokal als `service_role` (mit `bypassrls` wie in Production) gegen die nachgebaute
Production-Schemaform geprüft — alles grün: Einfügen ohne Fencing-Wert · Update ohne die
Spalte · PostgREST-Upsert-Form · fremdes Setzen wird mit `HV002` abgewiesen (auch bei
Wertgleichheit) · `helmut_enqueue_job`/`helmut_claim_jobs` unverändert · der Altweg erzeugt
**keine** Versandabsicht (Outbox bleibt bei 0).

Weiter geprüft: RLS auf allen 7 Tabellen **an und erzwungen**, **0** Policies, **0** Rechte
für `anon`/`authenticated`/`PUBLIC` (Tabellen wie Funktionen), alle 32 Funktionen
`SECURITY INVOKER` mit festem `search_path = public, pg_temp`.

### §24.4 Sicherstes Zeitfenster (Berliner Zeit)

Cron-Belegung (UTC → Berlin, CEST): 04:00→06:00 crawl · 05:00→07:00 morning · 05:30→07:30
understanding · 05:45→07:45 lage · 06:00→08:00 health · 06:10/06:22→08:10/08:22 Nachlauf ·
10:00→12:00 lage-check · 16:00→18:00 pipeline · 20:00→22:00 crawl · 21:30→23:30
understanding. Dazu der GitHub-Actions-Watchdog (05:30 UTC, oft 2–3 h verzögert → bis ~08:30
UTC / 10:30 Berlin).

**Empfohlenes Fenster: 18:10–19:50 Berlin** (16:10–17:50 UTC) — direkt nachdem der
pipeline-Lauf 18:00 Berlin beendet ist (er dauert ~4–5 min), mit ~2 h Abstand zum
crawl 22:00 Berlin und weit außerhalb jeder Watchdog-Verzögerung. Zweitbestes Fenster:
12:15–17:45 Berlin.

**Pflicht-Vorsatz je Schritt**, weil die CAS-Migration kurz eine `ACCESS EXCLUSIVE`-Sperre
auf `knowledge_objects` braucht: `set lock_timeout = '5s'; set statement_timeout = '60s';`
Damit scheitert ein Schritt schnell und sichtbar, statt sich hinter einen laufenden
Crawl zu stellen und alle nachfolgenden Zugriffe auf `knowledge_objects` mit anzustauen.
Erst durch die Korrektur aus §24.6 ist ein solcher Abbruch folgenlos.

### §24.5 Wirkung bei weiterhin ausgeschalteten Flags

**Keine.** Kein Cron, keine Route und kein Handler ruft eine der neuen Funktionen, solange
`HELMUT_JOB_DISPATCH_MODE`, `HELMUT_KLASSEN_GRENZEN` und `HELMUT_VERSTEHEN_CAS` aus sind.
Die 524 wartenden Aufträge bleiben unberührt und inert: keine Versandabsicht entsteht (der
Altweg `helmut_enqueue_job` legt keine an), niemand holt sie ab, keine Kosten. Der KI-
Tagesdeckel bleibt unverändert; die Migrationen erzeugen keinen einzigen Modellaufruf.

### §24.6 BEFUND — zwei Dateien waren nicht „alles oder nichts"

`20260814090000_queue_verbraucher.sql` und `20260814090100_anbieter_steuerung.sql` trugen
als **einzige** Dateien des Verzeichnisses keine `begin;`/`commit;`-Klammer (ihre beiden
Rollbacks ebenso). Der Inhalt war korrekt — die Lücke betraf ausschließlich den Abbruchfall:
an einer frischen PostgreSQL 16 belegt blieb nach einem Abbruch in der Mitte
`helmut_claim_job_by_id` allein stehen, während alles danach fehlte. Ein halb angewendeter
Schritt ist falsches Grün (`CLAUDE.md` §4 Regel 4) und macht den Rückweg mehrdeutig — und
der in §24.4 empfohlene `lock_timeout` macht einen Abbruch mitten im Skript wahrscheinlicher,
nicht unwahrscheinlicher.

Behoben mit **PR #249** (Branch `claude/op30-production-pr248-k0ixy5`): Klammer in allen vier Dateien ergänzt,
Regressionsprüfung `migrations-organisation-test.js` §5 (jede neue Datei genau einmal
geklammert, vorwärts wie rückwärts). Nach der Korrektur hinterlässt derselbe Abbruch
**keine** Zeile mehr. **Bis PR #249 gemergt ist, sollen die Schritte 3 und 4 nicht
angewendet werden** — die Schritte 1, 2 und 5 sind davon unberührt.

### §24.7 Sicherung vor der Anwendung

Eine Vollsicherung ist **nicht** erforderlich: alle fünf Migrationen sind additiv, keine
bestehende Zeile, Spalte, Policy oder Funktion wird verändert, und jeder Schritt hat einen
geprüften Rückweg. Der kleinste datensparsame Umfang, der trotzdem sinnvoll ist — **ohne
jeden personenbezogenen Inhalt**:

1. **Schemastand** (nur Struktur, keine Zeilen): die Ausgabe von
   `select table_name, column_name, data_type from information_schema.columns
    where table_schema='public' order by 1,2` sichern.
2. **Zwei Zählwerte als Vergleichsanker**: die Warteschlangensignatur aus §24.1
   (`a069f91fde4547493796395f2c989497`) und `select count(*) from knowledge_objects`.

Beides ist rein technisch (Namen, Typen, Zahlen) und enthält keine politischen Inhalte,
keine Mandate und keine URLs.

### §24.8 Ablauf je Schritt — anwenden, prüfen, zurücknehmen

Für **jeden** der fünf Schritte, einzeln und in der Reihenfolge aus §24.2:

1. `set lock_timeout = '5s'; set statement_timeout = '60s';` voranstellen.
2. Die Datei über den belegten Weg anwenden (MCP `apply_migration`, wie am 2026-08-11/12).
3. **Verifikation** — die rein lesenden Abfragen stehen am Ende jeder Migrationsdatei
   („Verifikation nach der Anwendung"); zusätzlich nach **jedem** Schritt:
   `select count(*) from helmut_jobs where status='wartend'` → **524** und
   `select count(*) from helmut_jobs where status='erledigt'` → **235**.
4. **Rücknahme dieses Schrittes** (falls die Verifikation abweicht):
   `rollback_<vorwärtsname>.sql` anwenden — danach ist der Ausgangsstand exakt
   wiederhergestellt (lokal belegt: Tabellen/Funktionen/Trigger/Spalten kehren auf
   44/103/18/540 zurück).

Nach Schritt 5 zusätzlich: `select count(*) from knowledge_objects where verstehen_fencing
is not null` → **0** (niemand schreibt den Wert, solange `HELMUT_VERSTEHEN_CAS` aus ist)
und `select * from helmut_verstehen_kennzahlen()` → **leer**.

### §24.9 Was dieser Plan NICHT enthält

Keine Flag-Aktivierung, kein Redeploy, keine AWS-Aktion, kein Production-Lauf, keine
Neutralisierung der 524 Aufträge, keine Anwendung von `20260720`. Die Aktivierungsschritte
stehen unverändert in §23.1 (CAS) und in der Zielarchitektur-Belegdatei §14 (Stufenplan) —
sie sind **eigene** Entscheidungen nach dieser Migration.

### §24.10 AUSFÜHRUNGSBELEG — alle fünf Migrationen angewendet (2026-08-15, freigegeben)

Der Plan §24.1–§24.8 wurde am 2026-08-15 im empfohlenen Fenster **18:10–19:50 Berlin**
ausgeführt. **Ergebnis: 5/5 angewendet, 0 Fehler, 0 Rücknahmen, Production-Verhalten
unverändert.**

**Vorbedingungen (alle zehn erneut geprüft, 18:35–18:40 Berlin / 16:35–16:40 UTC):**

| # | Gegenstand | Befund |
|---|---|---|
| 1 | PR #249 | gemergt 15.08. 11:08:03 UTC, Merge-Commit `f084d72` auf `main` |
| 2 | Deployment | `dpl_2q87SSJp2tMJzccG49sT6R1oNPTT`, target `production`, Commit `f084d72`, **READY** |
| 3 | `HELMUT_SCALABLE_PIPELINE` | wirkungsbelegt aus: jüngster Auftrag `2026-08-13 16:07:05 UTC` = Zeitpunkt der Rücknahme, **0 neue Aufträge seit 2 Tagen** |
| 4 | Laufende Schreibvorgänge | **0** aktive Abfragen, **0** Sperren auf `knowledge_objects`; der 16:00-UTC-pipeline-Lauf war um 16:04:48 UTC beendet |
| 5 | Warteschlange | **524 / 235 / 0 / 0**, 0 offene Leases |
| 6 | Signatur | `a069f91fde4547493796395f2c989497` — exakt getroffen |
| 7 | Fehlende Migrationen | letzte angewendete `20260812172327`; **0 von 7** neuen Tabellen, **0 von 32** neuen Funktionen, **0 von 2** neuen Triggern vorhanden |
| 8 | Dateien/Prüfsummen | alle fünf SHA-256 = §24.2; `git diff origin/main -- supabase/migrations/` **leer** |
| 9 | Neue Flags | alle aus — wirkungsbelegt, da keine der neuen Strukturen existierte |
| 10 | Konkurrierende Aktion | `main` unverändert seit 11:08 UTC, kein neueres Deployment, 0 aktive DB-Sitzungen |

**Ausgangsanker (§24.7, rein technisch):** Schema-Signatur
`7a902e09dc3b9d0b563868d907023fbf` · 44 Tabellen · 148 Funktionen · 546 Spalten ·
18 Trigger · 6.691 Wissensobjekte. Die Signaturformel der Warteschlange ist
`md5(string_agg(id||'|'||status||'|'||job_type||'|'||attempts, ',' order by id))`.

**Ausführung** — einzeln über MCP `apply_migration`, je Schritt mit vorangestelltem
`set lock_timeout='5s'; set statement_timeout='60s';`:

| # | Datei | Eintrag in `supabase_migrations` | Ergebnis |
|---|---|---|---|
| 1 | `20260813090000_jobqueue_outbox` | `20260815163732` | Tabelle 1/1 · RLS `t/t` · 0 Policies · 0 Fremdrechte · **0 Inhaltsspalten** · Trigger 1 · 6/6 Funktionen |
| 2 | `20260813090100_verteilte_grenzen` | `20260815163814` | 2/2 Tabellen · RLS `t/t` je Tabelle · 0 Policies · 0 Fremdrechte · 3/3 Funktionen |
| 3 | `20260814090000_queue_verbraucher` | `20260815163924` | 6/6 Funktionen · 0 Fremdrechte |
| 4 | `20260814090100_anbieter_steuerung` | `20260815164026` | 2/2 Tabellen · RLS `t/t` · 0 Policies · 0 Fremdrechte · 4/4 Funktionen |
| 5 | `20260814180000_verstehen_cas` | `20260815164241` | 2/2 Tabellen · RLS `t/t` · 0 Policies · 0 Fremdrechte · Spalte `verstehen_fencing` 1 · Trigger `helmut_ko_fencing_wache_trg` 1 |

Alle 32 neuen Funktionen sind `SECURITY INVOKER` mit festem `search_path = public, pg_temp`
(geprüft je Schritt, **0** Abweichungen).

**Nach JEDEM der fünf Schritte gemessen — durchgehend identisch:** 524 wartend · 235 erledigt ·
0 laufend · 0 fehlgeschlagen · 0 offene Leases · Signatur `a069f91fde4547493796395f2c989497`.
Keine Lease, keine Reservierung, keine Versandabsicht, keine Anbieterbuchung: alle sieben neuen
Tabellen blieben nach jedem Schritt bei **0 Zeilen**.

**Zusätzliche Prüfungen nach Schritt 5:**

* `select count(*) from knowledge_objects where verstehen_fencing is not null` → **0**
  (bei allen 6.691 Wissensobjekten `NULL`).
* `select * from helmut_verstehen_kennzahlen()` → **leer** (0 Arbeitszeilen).
* Outbox, Klassenanker/-slots, Anbieterfenster/-schutzschalter, CAS-Reservierungen und
  -Vormerkungen: **je 0 Zeilen** — keine Laufzeitdaten.
* **Der alte Motor bleibt aktiv:** jüngstes Wissensobjekt und jüngster `process_run`
  15.08. 16:04 UTC (pipeline-Lauf 18:00 Berlin), Zahl der Wissensobjekte vor und nach der
  Migration identisch (6.691) — keine politischen Inhalte und keine bestehenden
  Wissensobjekte verändert.
* **Keine Warteschlangenverarbeitung, kein KI-Aufruf** durch die Migration ausgelöst
  (`ki_aufrufe` existiert nur in der leeren CAS-Tabelle; 0 neue Aufträge, 0 Leases).
* Schema danach: **51 Tabellen (+7) · 180 Funktionen (+32) · 597 Spalten (+51) ·
  20 Trigger (+2)** — exakt der erwartete additive Zuwachs.
* Advisor (security) nach der Anwendung: **keine neue Fehlerklasse.** Die 7 neuen Tabellen
  erscheinen ausschließlich unter dem bereits bekannten INFO-Lint `rls_enabled_no_policy`
  — das ist die beabsichtigte Bauform (RLS an+erzwungen, 0 Policies, Zugriff nur über
  `service_role`), identisch zu `helmut_jobs` und `llm_reservations`. Einzige WARN-Meldung
  bleibt das vorbestehende `extension_in_public` (`vector`).

**Nicht getan (Verbote eingehalten):** keine Flag-Änderung, kein Redeployment, keine
AWS-Ressource, keine Neutralisierung der 524 Aufträge, kein manueller Production-Lauf, keine
Anwendung von `20260720`, keine Secrets gelesen oder ausgegeben, keine Production-Daten
geändert. Die Rollback-Skripte wurden **nicht** gebraucht.

**Ehrliche Grenze:** die Inertheit ist zum Zeitpunkt dieses Belegs **strukturell** belegt (alle
neuen Strukturen leer, alle Flags aus, Zähler und Signatur unverändert), aber noch **nicht**
über einen vollständigen Cron-Zyklus auf dem migrierten Schema laufzeitbelegt. Der erste Lauf
danach ist crawl 20:00 UTC (22:00 Berlin); der erste vollständige Morgenzyklus folgt am 16.08.
Erwartung: unverändertes Verhalten, weil kein Codepfad die neuen Strukturen ohne Flag berührt
(§24.3, §24.5).

**Nächster Schritt:** unverändert eine **eigene** Betreiberentscheidung — die Aktivierung nach
§23.1 (CAS) bzw. Zielarchitektur-Belegdatei §14 (Stufenplan). Diese Migration gibt davon
**nichts** frei. Der ausformulierte Plan der ersten Stufe steht in **§25**.

### §24.11 LAUFZEITNACHWEIS — zwei vollständige Zyklen auf dem migrierten Schema (2026-08-16)

Die in §24.10 benannte ehrliche Grenze („strukturell belegt, noch nicht laufzeitbelegt") ist
**geschlossen**. Rein lesend geprüft, nichts geändert, nichts aktiviert, nichts deployt.

**Was gelaufen ist.** Der Crawl 20:00 UTC am 15.08. (auf Commit `34ebae77`, Deployment
`dpl_EpKBbGCGAi2D4gxQseqKJ1REYLeQ`) und am 16.08. der **vollständige Morgenzyklus**:
`globalphase` 04:03 · `understanding-eager` 04:04 · `briefing-morning` 05:01 ·
`understanding-cron` 05:30 · `briefing-lage` 05:45.

**Vergleich mit den letzten gesunden Zyklen vor der Migration** (14./15.08.):

| Lauf | 14.08. (vorher) | 15.08. (vorher) | **16.08. (nachher)** |
|---|---|---|---|
| `globalphase` 04:0x | `partial`, 189,7 s, Ziel 1934, gespeichert 1465, `failed` 0 | `partial`, 212,6 s, Ziel 1925, gespeichert 1461, `failed` 0 | **`partial`, 205,1 s, Ziel 1997, gespeichert 1468, `failed` 0** |
| `understanding-eager` 04:0x | `success`, 97,1 s, 10 verarbeitet | `success`, 89,6 s, 10 verarbeitet | **`success`, 97,8 s, 16 verarbeitet** |
| `briefing-morning` 05:0x | `success`, 12,3 s, **5/5** | `success`, 11,0 s, **5/5** | **`success`, 17,7 s, 5/5** |
| `understanding-cron` 05:30 | `success`, 252,2 s, Ziel 500, 18 verarbeitet | `success`, 254,0 s, Ziel 500, 21 verarbeitet | **`success`, 244,3 s, Ziel 500, 15 verarbeitet** |
| `briefing-lage` 05:45 | `success`, 31,1 s, **9/9** | `success`, 31,3 s, **9/9** | **`success`, 34,7 s, 9/9** |

Jeder Wert liegt im Band der Vergleichstage. `status`-Arten unverändert (`partial` für
`globalphase` — das ist seit jeher der Normalzustand, 17/17 Läufe in 7 Tagen —, `success`
sonst). **`error_class` ist über sechs Tage durchgehend `null`, die Summe aller
`failed_count` ist 0.**

**Briefings je geplantem Mandat.** `morgenlage` **5 Briefings / 5 Mandate** um 05:01,
`lage` **5/5** um 05:45 — identisch zum 15.08., 13.08. und 12.08. Es sind **dieselben fünf**
Mandate wie an den Vergleichstagen; das sechste, deaktivierte Mandat erhält wie zuvor keines.

**Der Fencing-Trigger blieb inert — der belastbarste Einzelbefund.** Er ist aktiv
(`tgenabled='O'`) und hat über beide Zyklen **145 echte Schreibvorgänge** auf
`knowledge_objects` gesehen: **139 INSERT** (dort feuert er immer) und **6 UPDATE** auf
vorbestehenden Zeilen. **Alle liefen durch. Kein einziger `HV001`/`HV002`.**
`verstehen_fencing` ist bei **0 von 6.830** Wissensobjekten gesetzt. Damit ist beides belegt,
was §24.3 vorhergesagt hat: der Fremdschreibweg wird nicht behindert, und ohne den CAS-Pfad
entsteht nirgends ein Fencing-Wert.

**Alles Weitere unverändert:** Warteschlange **524 / 235 / 0 / 0**, 0 offene Leases, Signatur
`a069f91fde4547493796395f2c989497`, jüngster Auftrag weiterhin 13.08. 16:07:05 UTC (der
Betrieb hat **keinen** Auftrag erzeugt oder angefasst). Alle sieben neuen Tabellen: **0
Zeilen**; `helmut_verstehen_kennzahlen()`, `helmut_outbox_kennzahlen()`,
`helmut_klassen_kennzahlen()` und `helmut_anbieter_kennzahlen()` liefern **keine
Arbeitszeile**. Schema unverändert 51/180/597/20. KI-Tagesbudget im Normalband (15.08. 70;
Band der Vortage 62–94). Laufprotokoll durchgehend `persistenz=ok fehler=0 cas=0`.

**Ehrlich benannt, keine Abweichung:** am 16.08. 05:30 stehen zwei Laufzeitmeldungen
`[understanding] skipped-error: … OpenAI request timeout`. Das ist eine **bestehende Klasse**
(dieselbe Meldung am 14.08. 21:31 und 15.08. 04:00, also vor der Migration), ein externer
Anbieter-Zeitüberlauf, vom Lauf sauber abgefangen (`understanding-cron` meldet `success` mit
`failed_count` 0). Sie hat mit Schema, Trigger oder Migration nichts zu tun.

**Schluss: die Laufzeitinertheit der fünf Migrationen ist bestätigt.** Der alte Motor
funktioniert auf dem migrierten Schema unverändert; die neuen Strukturen sind vorhanden,
leer und wirkungslos.

---

## §25 · Betreiberplan der ERSTEN kontrollierten OP-30-Aktivierungsstufe (Stand 2026-08-16)

**Nichts hiervon ist ausgeführt.** Dieser Abschnitt ist der Plan, nicht sein Vollzug. Jeder
Schritt ist freigabepflichtig (`CLAUDE.md` §5).

### §25.1 Welche Stufe zuerst — und warum diese

Es gibt zwei Kandidaten. Empfohlen ist **A**.

| | **A · CAS scharfschalten** (§23.1 Schritt 2) | B · Stufenplan Stufe 1 (Zielarchitektur §14) |
|---|---|---|
| Aktion | `HELMUT_VERSTEHEN_CAS=on` + Redeploy | `HELMUT_SCALABLE_PIPELINE=on` + `HELMUT_JOB_DISPATCH_MODE=shadow` + Redeploy |
| Wirkung auf den Durchsatz | **keine** — Parallelität bleibt hart auf 1 geklemmt | Aufträge entstehen wieder; Schattenversand beginnt |
| Berührt die 524 inerten Aufträge | **nein** | ja — Neutralisierung **vorher** nötig (§17.8) |
| Offene Vorbedingungen | **keine** | **zwei** (§19.6; Stand 2026-08-17: §8.3/§8.4 sind queue-tauglich berichtigt und die Neutralisierung ist vollständig vorbereitet und lokal bewiesen — §26; offen bleibt ihre **Ausführung** als freigabepflichtige Betreiberaktion) |
| Rückweg | Flag leeren + Redeploy, eine Minute | Flag leeren + Redeploy, danach Wirkungsnachweis wie §19.5 |
| Kostenrisiko | keine zusätzlichen Modellaufrufe (der Vertrag erzeugt keinen) | Abflussrate-Entscheidung steht noch aus (§19.4) |

**A ist der kleinste umkehrbare Schritt mit echtem Erkenntnisgewinn.** Er wechselt nur den
Speicherort der Update-Vormerkungen (Karte → Vorgangszeilen) und beseitigt damit den
Lesen-Ändern-Schreiben-Verstoß (`CLAUDE.md` §4 Regel 10), ohne Durchsatz, Kosten oder
Warteschlange anzufassen.

**Bewusst benannter Widerspruch:** der Stufenplan (Zielarchitektur §14) führt CAS erst unter
Stufe 4 (100 Mandate). Das ist die **ältere** Einordnung. §23.1 (14.08.) macht den
CAS-Vertrag ausdrücklich **unabhängig freigebbar** und trennt Flag (Schritt 2) von
Parallelität (Schritt 3). Beides ist vereinbar, solange **Schritt 3 nicht** mitgezogen wird:
Stufe 4 meint die *Parallelität*, nicht das Flag. Wer A ausführt, hat damit **nicht** Stufe 4
begonnen und Helmut **nicht** für 25–500 Mandate freigegeben.

### §25.2 Vorbedingungen vor dem ersten Schreibzugriff (alle rein lesend prüfbar)

1. `main` unverändert, Production-Deployment **READY**.
2. Warteschlange **524 / 235 / 0 / 0**, 0 offene Leases, Signatur
   `a069f91fde4547493796395f2c989497`.
3. `helmut_verstehen_reservierungen` und `helmut_verstehen_vormerkungen` **leer**.
4. `select count(*) from knowledge_objects where verstehen_fencing is not null` → **0**.
5. Trigger `helmut_ko_fencing_wache_trg` vorhanden und aktiv.
6. Kein Cron-Lauf aktiv, keine Sperre auf `knowledge_objects`.
7. Die vier übrigen Flags bleiben aus — insbesondere `HELMUT_VERSTEHEN_PARALLELITAET` und
   `HELMUT_KLASSE_VERSTEHEN_MAX` **unverändert 1**.

### §25.3 Zeitfenster

**18:10–19:50 Berlin** (wie §24.4) — nach dem pipeline-Lauf 18:00, mit Abstand zum crawl
22:00. Ein Redeploy ist in Sekunden wirksam; der erste Lauf, der den Vertrag benutzt, ist
`understanding` **21:30 UTC / 23:30 Berlin**. Das ist zugleich die erste Kontrollgelegenheit.

### §25.4 Ablauf (Betreiberaktion — aus einer Claude-Sitzung nicht ausführbar)

Vercel-Env ist aus Claude-Sitzungen **weder lesbar noch setzbar** (`CURRENT_STATE.md` §3);
Schritte 1–2 macht ausschließlich der Betreiber.

1. In Vercel `HELMUT_VERSTEHEN_CAS=on` für **Production** setzen.
2. Production-Deployment auslösen und `READY` abwarten.
3. **Sofortkontrolle, rein lesend** (§25.5) — vor dem 21:30-Lauf.
4. Nach dem 21:30-Lauf: **erste Wirkungskontrolle** (§25.5).
5. Nach dem Morgenzyklus des Folgetags: **Bestätigungskontrolle** (§25.5), dann Entscheidung
   über Schritt 3 aus §23.1 (Parallelität) — **frühestens dann**, nie am selben Tag.

### §25.5 Kontrollen (rein lesend, nach §23.2)

| Zeitpunkt | Prüfung | Erwartung |
|---|---|---|
| Sofort nach Redeploy | alle sieben neuen Tabellen | weiterhin **0 Zeilen** (kein Lauf war) |
| Sofort | Warteschlange + Signatur | unverändert 524/235/0/0, Signatur gleich |
| Nach 21:30 | `select * from helmut_verstehen_kennzahlen()` | Zeilen erscheinen; `zustand='fertig'` wächst; **`unbekannt` = 0** |
| Nach 21:30 | `count(*) from knowledge_objects where verstehen_fencing is not null` | **> 0** — der Beleg, dass der Vertrag wirklich schreibt |
| Nach 21:30 | KI-Tagesbudget | im bisherigen Band (62–94/Tag); **kein Sprung** |
| Nach 21:30 | `process_runs` | `error_class` `null`, `failed_count` 0, keine Klasse `skipped-ausgang-unbekannt` |
| Nach 21:30 | Warteschlange | **unverändert 524/235/0/0** — der CAS-Vertrag fasst keine Aufträge an |
| Folgetag | Briefings je Mandat | **5/5** je Slot, wie im Vergleichsband |
| Folgetag | `helmut_verstehen_reservierungen where zustand='unbekannt'` | wächst **nicht** |

### §25.6 Abbruchgrenzen (jede einzelne genügt für den Rückweg)

* `unbekannt` > 0 bei der **ersten** Kontrolle nach 21:30 (§23.2), oder danach wachsend.
* `verstehen_fencing` bleibt nach dem 21:30-Lauf bei 0 → der Vertrag greift nicht.
* Irgendein `HV001`/`HV002` in den Laufzeitmeldungen.
* Eine neue Fehlerklasse in `process_runs` oder `failed_count` > 0.
* Warteschlange oder Signatur verändert.
* KI-Tagesbudget springt aus dem Band (Verdacht auf Doppelaufruf).
* Briefings am Folgetag nicht 5/5.

### §25.7 Rückweg

`HELMUT_VERSTEHEN_CAS` leeren + Redeploy. Danach läuft der Karten-Store byte-identisch
weiter; die CAS-Tabellen bleiben mit ihrem Inhalt stehen und sind **wirkungslos** (kein
Codepfad liest sie ohne Flag). Die Migration wird dafür **nicht** zurückgenommen — ein
Rollback der Migration ist nur nötig, wenn das Schema selbst als Ursache belegt wäre, und
dafür gibt es nach §24.11 keinen Anhaltspunkt. Rückweg ist damit eine Minute Arbeit ohne
Datenverlust.

### §25.8 Was §25 ausdrücklich NICHT enthält

Keine Parallelität > 1 (§23.1 Schritt 3), keine Neutralisierung der 524 Aufträge, keine
AWS-Aktion, keine Anhebung des KI-Deckels, keine Ausweitung über 5 Mandate, keine Anwendung
von `20260720`, kein Versuch 3 des Fünferlaufs. **Helmut bleibt nicht für 25–500 Mandate
freigegeben**; bindend bleiben KI-Tagesdeckel und OP-15 (§23.4).

## §26 · Neutralisierung der 524 Altaufträge + Warteschlangenwache V2 (Sprint 2026-08-17)

> **Nachtrag 2026-08-18: die Neutralisierung ist mit ausdrücklicher Betreiberfreigabe
> AUSGEFÜHRT — Vollzugsbeleg §26.7.** Die Absätze darunter beschreiben den Stand des
> Vorbereitungssprints (17.08.) und bleiben als Beleg unverändert stehen.

**Sprintzustand: erfolgreich abgeschlossen (lokal bewiesen; Production unangetastet).**
Dieser Sprint löst die beiden §19.6-Blocker vor dem dritten Fünferlauf: (1) ein sicherer,
wiederholbarer, belegbarer Neutralisierungsweg für die 524 inerten wartenden Aufträge ist
vollständig vorbereitet und an echter PostgreSQL bewiesen — **nichts davon wurde gegen
Production ausgeführt**; (2) §8.3/§8.4 sind queue-tauglich berichtigt und `betriebsstatus`
trägt einen neuen, maschinenprüfbaren Wachvertrag mit neun Zustandsklassen. Alle Zugriffe
auf Production waren rein lesend (nur technische Metadaten und Zählwerte).

### §26.1 Teil A — Herkunft und exakte Abgrenzung der 524 Aufträge (rein lesend, 2026-08-17)

**Gesamtbild (gemessen ~18:20 UTC):** 759 Zeilen = **524 wartend · 235 erledigt · 0 laufend ·
0 fehlgeschlagen**, 0 offene Leases; Gesamtsignatur
(`md5(string_agg(id||'|'||status||'|'||job_type||'|'||attempts, ',' order by id))`, §24.7)
**`a069f91fde4547493796395f2c989497`** — byte-identisch zu §24.10/§24.11 und §25.2. Der
Anker ist damit weiterhin gültig.

**Die 524 wartenden Aufträge — Herkunft eindeutig belegt:**

| Merkmal | Befund |
|---|---|
| Entstehungsfenster | **alle 524** zwischen 2026-08-12 20:00:15 und 2026-08-13 16:07:05 UTC — exakt die fünf Läufe des zweiten Aktivierungsversuchs (§19.3); 524/524 im Fenster [Aktivierung 18:50 12.08., Rücknahme 16:27 13.08.] |
| Typen | 365 `source_fetch` (354 geteilt · 10 `person-archiv` · 1 `person-aktuell`) · 139 `document_understanding` · 10 `mandate_projection` · 10 `briefing_materialization` — deckungsgleich mit Zielarchitektur §13 |
| Mandate | 493 global (kein Mandat) · 31 mandatsgebunden auf genau die 5 aktiven Mandate |
| Versuche | 515× `attempts=0` · 7× `1` · 2× `2` |
| Zurückstellgründe | 140 mit technischem `last_error`: 124× `zurueckgestellt: verstehen-uebersprungen` · 11× `zurueckgestellt: zeitbudget-deckel` · 5 Einzel-Timeouts/Storage — keine unbekannte Fehlerklasse |
| Inertheit | 0 Leases, jüngstes `updated_at` **2026-08-13 16:07:11 UTC** — seit der Rücknahme hat nichts sie angefasst; das Flag ist wirkungsbelegt aus (§19.5, §24.11) |

**Die 235 erledigten Aufträge gehören NICHT zur Zielmenge:** 55 aus dem Erstlauf (erzeugt
11.08., §17.7) + 180 aus dem Zweitlauf (erzeugt 12./13.08., erledigt bis 13.08. 16:07:05);
0 davon seit dem 13.08. verändert. Es existieren nur die zwei Statusarten `wartend`/`erledigt`
— keine laufenden, keine fehlgeschlagenen, keine neuen Aufträge. Politische Inhalte wurden
weder gelesen noch exportiert (ausschließlich Zähler, Zeitstempel, Prüfsummen, Typnamen).

**Zusätzliche unveränderliche Anker für die Zielmenge** (erhoben 2026-08-17, Eingaben des
Neutralisierungsvertrags — nie Selbstauskunft des Skripts):

| Anker | Wert |
|---|---|
| ID-Ketten-md5 der 524 wartenden (sortierte IDs, Komma) | `59af8c9e9e61631f30fc9e968c14de7c` |
| Signatur nur der 235 erledigten (gleiche Formel) | `f7989b8cc2828acb99f26148a405999f` |
| Zeitgrenze der Zielmenge | `created_at < 2026-08-13 16:30:00+00` (strikt nach dem jüngsten Zielauftrag 16:07:05, vor jeder möglichen neuen Arbeit) |

### §26.2 Teil B — der Neutralisierungsvertrag (vorbereitet, bewiesen; ausgeführt am 2026-08-18 — §26.7)

**Gewählte Lösung: die geschützte Löschung in einer Transaktion.** Aus dem historischen
Ablauf §17.8/§17.10 übernommen sind **ausschließlich** das Transaktionsmuster, die
Sicherheitsriegel, der Trockenlauf als Standard und die Nachkontrolle. **Ein Vollzeilenexport
ist ausdrücklich NICHT Teil des aktuellen Verfahrens** (Datenschutzkorrektur weiter unten);
der Rückweg besteht **ausschließlich** in der deterministischen Neuerzeugung der benötigten
Arbeit durch den Planer. §17.8 bleibt nur als historischer Beleg des am 12.08. vollzogenen
Eingriffs stehen und ist **keine aktuelle Betreiberanweisung**. Kein neuer Status, keine
neue Migration — Löschen bleibt aus denselben Gründen richtig wie damals (kein Datenverlust:
die Arbeit entsteht fensterfrisch neu, Zielarchitektur §13).

**Eine Quelle, drei Nutzer:** `lib/helmut/jobqueue-neutralisierung.js` erzeugt das gesamte
SQL (Vertragsprüfung fail closed); `scripts/jobqueue-neutralisierung-524.js` druckt es für
den Betreiber (**verbindet sich nirgendwohin**); `scripts/jobqueue-neutralisierung-datenbank-test.js`
führt exakt dieses SQL an einer wegwerfbaren lokalen PostgreSQL aus — weicht dieses Runbook
vom Modul ab, wird die Suite rot (sie prüft die Anker aus §26.1 gegen diese Datei).

**Die Sicherheitsriegel (jeder einzelne bricht die gesamte Transaktion ab):** R1 exakte
Statusverteilung 524/235/0/0 (gesamt 759) · R2 keine offene Lease · R3 exakte Gesamtsignatur
· R4 exakte ID-Kette der Zielmenge · R5 Erledigt-Signatur vor UND nach der Löschung
unverändert · R6 keine wartende Zeile neuer als die Zeitgrenze · R7 exakte Typverteilung
(365/139/10/10) · R8 Löschanzahl exakt 524 (`get diagnostics`, nach dem Delete, in der
Transaktion) · R9 Nachzustand 0/235 noch in der Transaktion · R10 `serializable` +
`for update`-Sperre der Zielzeilen ab der ersten Prüfung — die erneute Prüfung liegt
**innerhalb derselben Transaktion unmittelbar vor der Änderung**, eine konkurrierende
Änderung zwischen Vorprüfung und Commit endet als Abbruch, nie als Teilzustand · R11 **der
Standardmodus ist der Trockenlauf und endet bauartbedingt im Rollback** (er schließt mit
`raise exception 'TROCKENLAUF-OK…'` — ein Commit ist in diesem Modus unmöglich).

**Wiederholbarkeit:** nach erfolgreicher scharfer Ausführung erkennt jeder weitere Lauf den
Zustand an der Erledigt-Signatur und bricht mit `ABBRUCH-BEREITS-NEUTRALISIERT` ab, ohne
Änderung. **Laufquittung:** jede Ausführung (auch der Trockenlauf) liefert eine jsonb-Quittung
mit Verfahren, Modus, UTC-Zeit, Löschanzahl, Grenze, allen drei Prüfsummen und Ergebnis —
ausschließlich technische Werte.

**Rückweg = deterministische Neuerzeugung — KEIN Export (Datenschutzkorrektur 2026-08-17/2).**
Die erste Fassung dieses Abschnitts sah als Schritt 1 einen Vollzeilenexport (`to_jsonb`)
vor. Der hätte `payload`, `tenant_id`, `idempotency_key` und `last_error` — und damit
politische bzw. personenbeziehbare Inhalte — aus Production in eine Datei geschrieben, im
Widerspruch zum eigenen Vertrag („nur technische Werte und Prüfsummen"). **Der Exportschritt
ist ersatzlos gestrichen** (aus Modul, CLI und Suite entfernt; das Modul verweigert
bauartbedingt jedes SQL, das eine der vier sensiblen Spalten oder ein Vollzeilenkonstrukt
enthält). Der Rückweg ist stattdessen **funktional**: die Zielmenge ist belegt inert und
fensterveraltet; der Planer erzeugt beim nächsten regulären Lauf exakt die dann benötigte
Arbeit deterministisch neu — gleiche Schlüsselbildung, „kein Datenverlust durch
Neutralisierung" (Zielarchitektur §13). **Das ist ausdrücklich KEIN byte-identischer
Restore:** `created_at`/`attempts`/Fehlertexte der gelöschten Zeilen sind danach weg — und
das ist gewollt, denn ein byte-identischer Rücktransport würde genau die drei §17.7-Fallen
(Doppelverarbeitung, 48-h-Frist, sofortige Überalterung) wiederherstellen, die die
Neutralisierung beseitigt. Ein byte-identischer Restore ist deshalb **nicht erforderlich**;
eine serverseitige Sicherungslösung samt Migration braucht es nicht — sie würde dieselben
sensiblen Inhalte nur an einen zweiten Ort kopieren, ohne betrieblichen Nutzen.

**Betreiberablauf (freigabepflichtig, CLAUDE.md §5 — Reihenfolge bindend):**

| Schritt | Aktion | Werkzeug |
|---|---|---|
| Vorbedingungen | `HELMUT_SCALABLE_PIPELINE=off` am laufenden Deployment geprüft · kein schwerer Cronslot aktiv · Anker §26.1 unverändert | rein lesend |
| 0 | Vorprüfung: Verteilung, Leases, alle drei Anker, Grenze | `node scripts/jobqueue-neutralisierung-524.js --vorpruefung` |
| 1 | **Trockenlauf (Standard)** — alle Riegel, garantiertes Rollback, Quittung | `… ` (ohne Argument) |
| 2 | Scharfe Ausführung — nur nach bestandenem Trockenlauf | `… --scharf` |
| Gegenprobe | 0 offen · 235 gesamt · Erledigt-Signatur `f7989b8c…` (steht am Ende der scharfen Ausgabe) | rein lesend |
| Rückweg | keiner nötig: der nächste reguläre Planungslauf erzeugt die benötigte Arbeit fensterfrisch neu (funktional, nicht byte-identisch — siehe oben) | — |

Danach (getrennte Schritte des Versuchs 3, nicht Teil der Neutralisierung):
`HELMUT_SCALABLE_PIPELINE_SEIT=<Aktivierungszeitpunkt ISO-8601>` setzen (§26.4) und weiter
nach Stufenplan (Zielarchitektur §14, Runbook §6/K0–K3).

### §26.3 Nachweise Teil B (echte PostgreSQL 16.13, wegwerfbare Datenbank, 2026-08-17; Datenschutzkorrektur /2)

`scripts/jobqueue-neutralisierung-datenbank-test.js` — **55 PASS / 0 FAIL** gegen das
Production-Bestandsbild (524/235, gleiche Typ-/Mandats-/Versuchs-/Fehlertextverteilung),
darunter alle Pflichtfälle: Trockenlauf exakt und folgenlos · 235 Erledigte **byte-identisch**
(md5 über alle Spalten, auch `updated_at`) · abweichende Signatur blockiert · neue Zeile
blockiert (R1) · zählungsneutraler Zeilentausch blockiert (R6) · offene Lease blockiert (R2)
· laufender/fehlgeschlagener Auftrag blockiert (R1) · konkurrierende Statusänderung zwischen
Vorprüfung und Transaktion blockiert · Wiederholung nach Erfolg sicher
(`ABBRUCH-BEREITS-NEUTRALISIERT`) · **funktionaler Rückweg belegt** (ein neutralisierter
Schlüssel ist wieder frei und wird fensterfrisch neu erzeugt; ein erledigter Schlüssel
dedupliziert weiter; ausdrücklich kein byte-identischer Restore) · **Mutationsproben:** R2
entfernt ⇒ Löschung liefe trotz Lease durch (Riegel tragend) · R3 entfernt ⇒ Feldmutation
unbemerkt (Riegel tragend) · R8 mit falscher Erwartung nimmt eine vollzogene Löschung
vollständig zurück · **Datenschutzvertrag testgesichert:** kein Exportweg mehr im Modul;
kein erzeugtes SQL liest `payload`/`tenant_id`/`idempotency_key`/`last_error` oder ein
Vollzeilenkonstrukt; fünf Wiedereinführungs-Muster werden zuverlässig abgelehnt; **Kanarien
in allen vier sensiblen Spalten erscheinen in keiner einzigen Ausgabe** des gesamten
Betreiberwegs (gesammelt über alle Läufe der Suite). Die historische §17.8-Suite bleibt
unverändert grün (**31 PASS**) — sie belegt den bereits am 12.08. ausgeführten Alt-Ablauf,
der für künftige Neutralisierungen **nicht** mehr maßgeblich ist (siehe Hinweis in §17.8).

### §26.4 Teil C — Warteschlangenwache V2 (`betriebsstatus`, `statusvertrag: 2`)

**Ursache der beiden Fehlbefunde:** (a) bei `HELMUT_SCALABLE_PIPELINE=off` las die Wache
dieselben Schwellen wie im Betrieb und meldete den inerten 524er-Bestand als `kritisch` —
niemand holt diese Aufträge ab, die 24-h-Marke ist dort bedeutungslos (§19.5); zugleich wäre
„gruen" gelogen (niemand arbeitet). (b) nach einer Reaktivierung zählte die Wartezeit ab
`created_at`, auch wenn der Auftrag nachweislich nie ausführbar war (dritte Falle §17.7(d)).

**Der neue Vertrag** (implementiert in `lib/helmut/scalable-pipeline.js`; Ausgabe über
`/api/ops/jobqueue`): `zustand` bleibt die Schweregrad-Ampel (`gruen|warnung|kritisch|
unbekannt`, **neu: `inaktiv`** nur bei Motor aus — versioniert über `statusvertrag: 2`);
**`zustandsklasse`** ist die maschinenlesbare Diagnose, **`betreiberaktion`** die zugehörige
Handlungsanweisung. Neue Kennzahlen: `rohesAlterS`, `abgelaufeneLeases`,
`zurueckgestellt.nachGrundklasse`, `motor.aktivSeit`.

| # | `zustandsklasse` | Messgrundlage · Zeitbezug | Schwelle | `zustand` | Betreiberaktion | Abbruchgrenze |
|---|---|---|---|---|---|---|
| 1 | `inaktiv-inert` | Flag aus; Bestand `wartend+laufend` | — | **inaktiv** | keine; vor Reaktivierung neutralisieren (§26.2) + `…_SEIT` setzen | keine (kein Betrieb) |
| 2 | `aktiv-keine-faellige-arbeit` | Flag an; 0 fällige wartende, 0 laufende | — | gruen | keine | — |
| 3 | `aktiv-gesund` | fällige Arbeit + Abfluss; effektive Wartezeit | < 18 h | gruen | keine | — |
| 4 | `aktiv-verzoegert` | effektive Wartezeit bzw. überfällige Mandate | ≥ 18 h bzw. > 0 | warnung | beobachten, Ursache klären (§8.2) | — |
| 5 | `aktiv-festgefahren` | Wartezeit ≥ 24 h **ohne** Abfluss im Fenster, oder endgültige Fehler > 0 | ≥ 24 h / > 0 | kritisch | sofort stoppen + zurücknehmen (§7) | ja (§8.2) |
| 6 | `aktiv-lease-ohne-fortschritt` | `laufend − aktive_leases` (abgelaufene Leases) | > 0 | ≥ warnung | nächsten Slot abwarten; wiederholt: Verbraucher prüfen | über Wartezeitpfad |
| 7 | `aktiv-ueberfaellig-trotz-abfluss` | Wartezeit ≥ 24 h **mit** Abfluss (der reale §19.4-Befund) | ≥ 24 h | kritisch | Abflussrate erhöhen oder zurücknehmen (§19.4) | ja (§8.2) |
| 8 | `aktiv-abhaengigkeit-oder-anbietergrenze` | dauerhaft Blockierte > 0, oder ≥ 50 % der wartenden mit Schloss-/Vorbedingungs-/Budget-/Anbieter-Grund bei Verzögerung | > 0 / ≥ 0,5 | wie 4/5/7 | Abhängigkeit/Deckel prüfen — **nicht** den Verbraucher neu starten | dauerhaft blockiert: ja |
| 9 | `unbekannt` | Metrik unlesbar, negative/nicht-numerische Zähler, `aktive_leases > laufend`, `…_SEIT` in der Zukunft | — | unbekannt | **geschlossen blockieren**: keine Entscheidung auf dieser Messung | Aktivierung/Weiterlauf nein |

**Zeitbezug der Betriebsgrenze (Ergänzung zu §17.5):** die effektive Wartezeit ist
`min(Wartezeit ab max(created_at, first_due_at), jetzt − HELMUT_SCALABLE_PIPELINE_SEIT)`.
Der Betreiber erklärt den Aktivierungszeitpunkt beim Einschalten des Flags; ein während der
Abschaltung entstandener (nachweislich nicht ausführbarer) Auftrag zählt damit ab
Ausführbarkeit, nicht ab Erstellungsdatum — und sobald er ausführbar ist, läuft die
18-h-/24-h-Frist unverkürzt. Ohne die Variable gilt die rohe Wartezeit (Fehlalarm zulässig,
falsches Grün nie); die Klemmung ist immer als Befund `wartezeit-ab-aktivierung:…` sichtbar,
`rohesAlterS` bleibt daneben stehen; ein Zeitpunkt in der Zukunft ist Klasse 9.
**Ein echter Rückstau wird nie verharmlost:** bei aktivem Motor gelten die §8.2-Schwellen
unverändert quer durch alle Diagnoseklassen (Sweep-Beweis §26.5); Fälligkeitsrückstand
(`max_mandatsalter_s`, OP-15) wird unverändert weiter gemeldet.

**Rückwärtskompatibilität:** alle V1-Felder und -Kennzahlen bleiben nach Name und Bedeutung
erhalten; neue Felder sind additiv; der einzige neue `zustand`-Wert `inaktiv` tritt
ausschließlich bei Motor aus auf und ist über `statusvertrag: 2` als Vertragsänderung
gekennzeichnet. Verschärft (bewusst, fail closed): eine fehlende Blockierten-Sicht ist keine
grüne Zusage mehr (höchstens `warnung`), Widersprüche enden in `unbekannt` statt in einer
gerechneten Ampel. Messgrundlage Klasse 8: neue rein lesende Storage-Funktion
`jobQueueZurueckgestellteGruende` (nur `last_error`-Texte, keine Nutzdaten).

### §26.5 Nachweise Teil C (offline, 2026-08-17)

`scripts/warteschlangenwache-vertrag-test.js` — **65 PASS / 0 FAIL**: alle neun Klassen ·
Motor aus + 524 inert ⇒ ehrlich `inaktiv` (nie gruen, nie kritisch) · Schwellen exakt bei
18 h/24 h (≥, nicht >) · Aktivierungsklemme §17.7(d) (5 Tage alter, nie ausführbarer Auftrag
bei frischer Aktivierung gruen; nach 19 h Warnung, nach 25 h kritisch) · hängende Lease
erkannt, aktive Leases kein Befund (Slotende-Normalfall §19.3) · Anbieterlimit/Abhängigkeit
getrennt vom festgefahrenen Verbraucher (Betreiberaktion zeigt auf den Deckel) ·
Unbekanntes/Widersprüchliches blockiert geschlossen · **Verharmlosungs-Sweep: alle 12
Konstellationen mit 25-h-Rückstau melden kritisch** · V1-Feldkompatibilität vollständig ·
Mutationsproben (dauerklemmende `SEIT`-Variable bleibt sichtbar; identische Kennzahlen kippen
nur mit dem Flag; Grenzwert-Paare; Diagnose eskaliert nie künstlich). Bestehende Suiten
unverändert grün: `jobqueue-alter-test` 59 · `jobqueue-vertrag-test` **125** (mit DB-Teil an
echter PostgreSQL; §8 stellt der Wache jetzt ausdrücklich Blockierten- und Grund-Attrappen
bereit, weil eine Messlücke seit V2 keine grüne Zusage mehr ist) ·
`op30-aktivierungsreife-test` 55 (3 OFFEN, Bestand) · `anbieterausfall-test` 17 ·
`skalierung-1000-test` 70 (2 OFFEN, Bestand) · `scalable-pipeline-flag-test` 52.

**Gesamtläufe (lokal, 2026-08-17):** kanonische Offline-Suite **260/264 Suiten grün**
(841 s; die 4 roten — `privacy-vollstaendigkeit`, `profile-db`, `provision-tenant`,
`tenant-neutrality` — sind **identisch** auf unverändertem `main`-Stand `51d0e80` rot:
258/262, gleiche Namen; dokumentiertes lokales Basisrot §17.6, im CI grün) ·
Migrationsorganisation **23 PASS** · CURRENT_STATE-Größe **4 PASS** ·
Browser-/Mobile-Smoke (Chromium, `HELMUT_REQUIRE_BROWSER=1`) **32 PASS / 0 FAIL** ·
DB-Suiten an echter PostgreSQL 16.13: `jobqueue-datenbank` 55 · `jobqueue-alter-datenbank`
26 · `jobqueue-ruecknahme-datenbank` 31 · `jobqueue-wiedervorlage-datenbank` 48 ·
`jobqueue-outbox-datenbank` 37 · `jobqueue-narrativ-datenbank` 27 ·
`jobqueue-mutationsprobe` **10/10 ROT** (erkannt) · `queue-ende-zu-ende` 53 ·
`lambda-paket` 43.

### §26.6 Nicht getan (Verbote eingehalten)

Kein Auftrag der 759 gelesen (nur Aggregatwerte), verändert, reserviert, beansprucht oder
gelöscht · keine Migration angewendet · kein Flag, keine Env-Variable, kein Deployment,
kein Cronlauf, kein Timer, keine Wache, kein Abo · keine politischen oder personenbezogenen
Inhalte gelesen oder exportiert · PR #252 nicht berührt (CURRENT_STATE.md/START_HERE.md in
diesem Sprint bewusst unverändert) · Production, Supabase Production, Vercel und AWS
unangetastet. Der Neutralisierungsweg wurde **ausschließlich** gegen die wegwerfbare lokale
Datenbank `helmut_test_neutralisierung` ausgeführt.

### §26.7 AUSFÜHRUNGSBELEG — Neutralisierung vollzogen (2026-08-18, freigegeben)

**Ausgeführt am 2026-08-18 zwischen 07:08 und 07:13 UTC (09:08–09:13 Berlin)** aus einer
Claude-Sitzung mit **ausdrücklicher Betreiberfreigabe** (Chat-Auftrag: Vorprüfung,
Trockenlauf und scharfe Ausführung ohne weiteren Haltepunkt, sofern alle Riegel exakt
treffen). Ausschließlich der kanonische Weg aus §26.2: SQL aus
`scripts/jobqueue-neutralisierung-524.js` (byte-identisch zum Generator, vor jeder
Ausführung erneut durch `pruefeDatensparsamkeit` geprüft), ausgeführt über die freigegebene
Supabase-MCP-Verbindung. **Keine Nutzdaten wurden gelesen, gespeichert oder ausgegeben** —
alle Belege dieses Abschnitts sind Zähler, Zeitstempel und md5-Prüfsummen.

**Vorbedingungen (alle bestanden):** `main` = Merge PR #253 (`0d9cf62`), einziges und
jüngstes Production-Deployment `dpl_CdJo36VoDys5TsHZkiC9sRhZdnYM` READY auf exakt diesem
Commit, kein weiteres/unbekanntes Deployment · lokale Suiten auf dem gemergten Stand:
Neutralisierung **55 PASS / 0 FAIL** · Wache 65 · Migrationsorganisation 23 ·
CURRENT_STATE-Größe 4 · Syntax OK · MCP-Transaktionsprobe (begin/serializable/temp-table/
rollback) verhaltensgleich zu psql · kein schwerer Cronslot (07:08 UTC; jüngster
`process_run` 05:46:19 UTC = lage-briefing).

**Vorprüfung (Schritt 0, 07:08–07:09 UTC) — alle Werte exakt:** 524 wartend · 235 erledigt ·
0 laufend · 0 fehlgeschlagen · 759 gesamt · 0 offene Leases · Gesamtsignatur
`a069f91fde4547493796395f2c989497` · ID-Kette `59af8c9e9e61631f30fc9e968c14de7c` ·
Erledigt-Signatur `f7989b8cc2828acb99f26148a405999f` · 0 wartende außerhalb der Grenze ·
Typen 365/139/10/10 · Entstehungsfenster [12.08. 20:00:15, 13.08. 16:07:05] · jüngstes
`updated_at` der Zielmenge 13.08. 16:07:11 (unangetastet) · **0 fremde aktive Abfragen,
0 fremde Sperren auf `helmut_jobs`**. **CAS-Vorherwert:** 45 Reservierungen (45 `fertig`,
0 `unbekannt`, 0 andere), 0 Vormerkungen, 45 Wissensobjekte mit `verstehen_fencing`.
KI-Budget heute: 26. Migrationen: 31, letzte `20260815164241`.

**Trockenlauf (Schritt 1, 07:10:03 UTC) — exakt der dokumentierte Abschluss:**
`TROCKENLAUF-OK: alle Riegel bestanden, 524 Zeilen WAEREN geloescht worden — Transaktion
vollstaendig zurueckgenommen`, Quittung mit allen drei Prüfsummen und Nachzustand 0/235/0/0
(`ergebnis: trockenlauf-ok`). Gegenmessung danach: **524/235/0/0, 0 Leases, Gesamtsignatur
unverändert** — vollständig folgenlos.

**Scharfe Ausführung (Schritt 2, ~07:11 UTC, genau ein Lauf):** eine `serializable`-
Transaktion, Zielzeilen per `for update` gesperrt, alle Riegel R1–R9 erneut innerhalb der
Transaktion — **exakt 524 gelöscht** (R8), Nachzustand in der Transaktion 0/235 mit
unveränderter Erledigt-Signatur (R9), erst dann Commit. **Gegenprobe nach dem Commit:
0 offen · 235 gesamt · Erledigt-Signatur `f7989b8cc2828acb99f26148a405999f`.**

**Nachkontrolle (07:12–07:13 UTC, rein lesend):** Warteschlange **0 wartend · 235 erledigt ·
0 laufend · 0 fehlgeschlagen · 0 offene Leases**; die 235 Erledigten tragen dieselbe
kanonische Signatur wie vor dem Eingriff (`f7989b8c…` — unangetastet). **CAS byte-gleich zum
Vorherwert:** 45/45/0/0, 0 Vormerkungen, 45 fencing; kein `HV001`/`HV002`. Jüngster
`process_run` unverändert 05:46:19 UTC (**kein Cronlauf ausgelöst**), 0 Fehlerklassen in 6 h.
`llm_reservations` 0, KI-Budget unverändert 26 (**kein KI-Aufruf**). Migrationen unverändert
31/`20260815164241` (`20260720` weiterhin **nicht** angewendet). **Kein Vercel-Deployment
seit dem Merge-Deployment** (`since`-Abfrage: genau 1 Ergebnis, das Merge-Deployment selbst);
kein Flag verändert, `HELMUT_SCALABLE_PIPELINE_SEIT` nicht gesetzt (kein Env-Schreibweg aus
Sitzungen, kein Redeploy), AWS unberührt. **Struktureller Löschbeleg** (`pg_stat_user_tables`
für `helmut_jobs`): `n_tup_ins` 939 und `n_tup_upd` 1765 **unverändert** seit §19.5 (kein
Insert, kein Update — auch nicht an den 235); `n_tup_del` 180 (§19.5) → **1228** = +524
(zurückgerollter Trockenlauf-Delete zählt kumulativ mit) +524 (Commit); `n_live_tup` 235.

**Rückweg:** wie §26.2 — ausschließlich die deterministische Neuerzeugung durch den Planer;
es existiert **kein Export** und keine Sicherungskopie. Ein erneuter Lauf des Verfahrens
endet jetzt mit `ABBRUCH-BEREITS-NEUTRALISIERT` (lokal 55-PASS-belegt, gegen Production
nicht wiederholt — der Auftrag lautete: genau ein scharfer Lauf).

**Damit ist die letzte offene §19.6-Vorbedingung des dritten Fünferlaufs erfüllt.** Vor
Versuch 3 verbleiben die Abflussraten-Entscheidung (§19.4) und der Stufenplan
(Zielarchitektur §14, Stufe 1) samt `HELMUT_SCALABLE_PIPELINE_SEIT` (§26.4) — alles
Betreiberentscheidungen.

---

## §27 · Erster Aktivierungslauf der Stufe 1: Befund, Rücknahme, Reparatur (2026-08-18/19)

Kanonischer Beleg des ersten Production-Laufs des neuen Motors, seiner Rücknahme und des
Reparatursprints. Alle Production-Zugriffe dieses Abschnitts waren **rein lesend und
aggregiert** — keine Nutzdaten, keine Mandatskennungen, keine Fehlertexte.

### §27.1 Hergang (belegt)

1. **Aktivierung 18.08. ~16:15 UTC** (Betreiber, §25.2-Variablen inkl.
   `HELMUT_WORKER_PARALLEL=4`, `HELMUT_WORKER_BATCH=25`,
   `HELMUT_SCALABLE_PIPELINE_SEIT=2026-08-18T16:15:00Z`), Redeployment READY.
   Sofortkontrolle grün; die **Planung** des ersten Slots war einwandfrei: 193 Aufträge
   deterministisch kompiliert, Outbox-Absichten atomar, 0 Duplikate, 0 Kosten.
2. **Slot crawl 20:00 UTC: 0 von 193 Abschlüssen.** Vercel-Runtime-Log:
   `[cron/crawl/warteschlange] 279116ms … erledigt=0 wiederholt=6` inmitten einer Serie
   von `helmut_store`-10-s-Timeouts. **Keine `process_runs`-Zeile** — nicht wegen des
   Blobs, sondern weil `runCronUeberWarteschlange` bis zu diesem Sprint **gar keine
   Lauftelemetrie schrieb** (zweiter Befund, §27.2).
3. **Slot crawl 04:00 UTC (19.08.): gleiches Bild** — 0 Abschlüsse, keine Laufzeile.
4. **Rücknahme durch den Betreiber** (Flag geleert), Redeployment
   `dpl_4WcYbNowXxK3kaMBAxpbzo2ZaTgU` READY ~06:56 UTC — verifiziert: exakter Rebuild von
   `main` `6bc5e35`, seitdem **0 veränderte Aufträge** (gegengeprüft 19.08. ~07:45 UTC),
   Briefings 10/10 intakt, Wache ehrlich `inaktiv` (Statusvertrag 2) mit Inert-Befunden.
5. **Bestand seit der Rücknahme (inert):** **301 `wartend` · 82 `laeuft` mit abgelaufener
   Lease** (der Slot starb vor dem Abschluss; letzte Bewegung 05:53/05:58 UTC) ·
   235 `erledigt` (Historie, unangetastet) · 0 `fehlgeschlagen`. Die **383** (301+82)
   sind mit Flag AUS wirkungslos; ihre Behandlung (erneuter Anlauf nach der Reparatur
   **oder** Neutralisierung nach dem §26-Verfahren mit **neuen** Ankern und **neuer**
   Freigabe) ist eine Betreiberentscheidung — im Reparatursprint wurde ausdrücklich
   **nichts** an ihnen verändert.

### §27.2 Technische Ursache (am Code belegt, an Production gemessen)

**Befund 1 — Blob-Konvoi je Auftrag:** `handleSourceFetch` rief je Auftrag
`storage.saveRawItems` auf — ein vollständiges Lesen **und** Schreiben der zentralen
Blob-Zeile `main` (gemessen 1,29 MB; `main-auth` 266 KB) über PostgREST, je Auftrag.
Unter Parallelität 4 serialisiert der Row-Lock der einen Zeile alle Worker
(`resolution=merge-duplicates` = UPDATE unter Zeilensperre), die Anfragen laufen in das
10-s-Timeout (`SUPABASE_REQUEST_TIMEOUT_MS`, storage.js), `withStoreRetry` verdreifacht
die Last, und die Fehlerpfade schreiben zusätzlich den Auth-Blob (`systemErrors`).
Messbeleg: `helmut_store` trägt 12 Zeilen bei **14 285 kumulierten Updates**
(`pg_stat_user_tables`, 19.08.). Ergebnis: kein Auftrag erreichte seinen Abschluss im
Auftragszeitbudget — `wiederholt=6`, `erledigt=0`. Die Vorab-Suiten waren grün, weil sie
`saveRawItems` als Attrappe einreichten — die Blob-Kosten je Auftrag hat keine Suite
gemessen (diese Lücke schließen die Wächter aus §27.3).

**Befund 2 — keine Slot-Quittung:** `runCronUeberWarteschlange` schrieb — anders als
Narrativ-Slot und Understanding-Cron — **keinerlei** `recordProcessRun`. Beide Slots des
Fensters sind deshalb ohne dauerhafte Laufzeile; die Diagnose musste auf
Vercel-Runtime-Logs ausweichen (gegengeprüft 19.08.: 0 Zeilen `process like
'warteschlange%'`).

### §27.3 Reparatur (Sprint 2026-08-19, Option B + D — PR #256, kein Deployment)

* **Option B — Blob-Entkopplung:** der Warteschlangenpfad `source_fetch` persistiert
  Rohdokumente **kanonisch relational** (`storage.persistiereRohdokumenteWarteschlange`:
  gebündelter `raw_documents`-Upsert mit `ignore-duplicates` + `return=representation`
  — **ein** Round-Trip liefert exakt die neuen `rd-`Kennungen, die das Verstehen
  einreihen). Die Blob-Zeilen `main`/`main-auth` werden **je Auftrag nie mehr**
  angefasst; der Blob bleibt Lesespiegel (Lage-Check `getRawItemsSince`, Admin-Zähler)
  und wird **höchstens einmal je Slot** am Slotende nachgezogen
  (`worker-betrieb.durchlauf` → `blobSpiegel`; Ausfall des Spiegels bricht den Slot
  nicht und wird ehrlich gemeldet). Mit Flag AUS ist der Altpfad byte-identisch
  (scheduler.js unverändert).
* **Option D — blob-unabhängige Slot-Quittung:** `runCronUeberWarteschlange` schreibt
  Start- (`running`) und Abschlussquittung in `process_runs`
  (`storage.schreibeWarteschlangenLaufquittung`: relational-nativ, fasst **keinen** Blob
  an, Gate nur `v3StoreReady()` — Beginn, Ende, Status, Zählwerte und Fehlerklasse
  überleben Blob-/Storage-Ausfälle; Prozessname `warteschlange-<cron>`, atomarer Upsert
  je (run_id, process)). Ein Slot mit Reservierungen und 0 Abschlüssen quittiert
  ehrlich `partial` mit Klasse `lease-ohne-fortschritt` — exakt das Bild des 18.08.
* **Wächter (machen die Rückkehr des Musters rot):**
  `scripts/warteschlange-blob-entkopplung-test.js` — **40 PASS / 0 FAIL** (statische +
  verhaltensbasierte Wächter gegen jeden `helmut_store`-Zugriff je Auftrag an einer
  lokalen PostgREST-Attrappe mit echten storage-Funktionen; Quittungs-Vertrag inkl.
  simuliertem Blob-Ausfall; Spiegel höchstens 1×/Slot; Mutationsproben belegen die
  Tragfähigkeit der Wächter).
* **Parallelitätsnachweis:** `scripts/warteschlange-parallelitaet-test.js` — **16 PASS /
  0 FAIL** an echter lokaler PostgreSQL (echte SQL-Funktionen, 4 getrennte
  DB-Sitzungen): worker=4/stapel=25 arbeitet 60/60 Aufträge ab, **Blob-Zugriffe konstant
  2 je Slot** (alte Bauart: ≥ 120) — identisch bei 1,35-MB- und Mini-Blob; 0
  Doppelarbeit, 0 verlorene Aufträge, Wiederaufnahme abgelaufener Leases, voller
  Durchsatz bei simuliertem Blob-Totalausfall. **Keine Aussage über
  Production-Performance** — der Beweis ist strukturell (Zugriffsmuster,
  Verlustfreiheit), nicht latenzbasiert.

### §27.4 CAS-Kontrolle nach §23.3 (rein lesend, 19.08. ~07:30 UTC)

Gesamtbild gesund: **85 `fertig`** (deckungsgleich 85 Wissensobjekte mit
`verstehen_fencing`), **2 `unbekannt`**, 0 Vormerkungen. Die beiden `unbekannt`-Vorgänge
(nur technische Felder; Kennungen als md5-Präfix):

| Vorgang (md5) | Zeitpunkt (UTC) | Versuche | KI-Aufrufe | Fehlerklasse | Ergebnis persistiert? |
|---|---|---|---|---|---|
| `7aae32c1` | 18.08. 21:31:11 → :33 | 1 | 1 | `modellfehler`, Timeout-Marker | nein (`verstehen_fencing` fehlt) |
| `744a7780` | 19.08. 05:31:05 → :26 | 1 | 1 | `modellfehler`, Timeout-Marker | nein |

Beide sind der **erwartete** §23.3-Fall: Modellaufruf gestartet, nach ~22 s als
Timeout-Klasse gescheitert, Ausgang nicht belegbar → ehrlich blockiert, keine
automatische Wiederholung, keine weiteren Kosten. Beide identische Fehlerlänge (35
Zeichen) und Timeout-Marker; beide fielen in das gestörte Aktivierungsfenster — ein
Zusammenhang mit der Blob-Überlast ist **plausibel, nicht bewiesen** (der Timeout traf
den Modell-, nicht den Datenbankaufruf). **Nicht wachsend** seit der Rücknahme. Es wurde
**nichts** verändert: kein `helmut_verstehen_ausgang_aufloesen` (auch nicht `pruefen` —
der Aufruf kann Zustand auflösen und wäre keine reine Lesung), keine Wiederholung, keine
Freigabe, keine Löschung.

**Empfohlene Betreiberentscheidung (freigabepflichtig, CLAUDE.md §5):** je Vorgang
zuerst `… 'pruefen'` (kostenlos), dann `… 'erneut'` — die Fehlerklasse ist transient
(Timeout), nicht inhaltlich; Kosten: bis zu 2 bezahlte Modellaufrufe. `'aufgeben'` nur,
falls die Vorgänge inhaltlich entbehrlich sind. Beides führt der Betreiber aus, nicht
eine Sitzung ohne Freigabe.

### §27.5 Nicht getan (Verbote eingehalten)

Kein Production-Schreibzugriff irgendeiner Art · keine Neutralisierung der 383 · kein
Flag, kein Deployment, keine Migration, kein Cronlauf, kein KI-Aufruf · PR #255
unberührt · keine Nutzdaten/Mandatskennungen/Fehlertexte exportiert (Vorgänge nur als
md5-Präfix, Fehlertexte nur als Klasse/Marker-Booleans).

---

## §28 · Nach dem Merge von PR #256: Deployment-Nachweis, CAS-Behandlung, gemischte Neutralisierung, Versuch-4-Plan (2026-08-19)

Alle Zeitangaben: türkische Zeit (UTC+3), dann Berlin (UTC+2), dann UTC. Production-Zugriffe
dieses Sprints: rein lesend und aggregiert — **plus** exakt zwei freigegebene Mutationen
(§28.2, CAS-`erneut` je Vorgang). Keine Neutralisierung ausgeführt (§28.3).

### §28.1 Deployment-Nachweis PR #256 und Ruheprüfung (Teil A — bestanden)

- **`main` = `e43d306`** (Merge PR #256). Production-Deployment
  **`dpl_EqcMLYpugcXBfoGuDSVRfzNFuq6i`**, **READY**, `target=production`, Commit-SHA exakt
  `e43d3064dd42570d576a9ad76801365651a24cce` — deckungsgleich mit `origin/main`; erstellt
  11:53:43 TR / 10:53:43 Berlin / 08:53:43 UTC. Es ist das **einzige** Production-Deployment
  seit der Rücknahme (`dpl_4WcYbNow…`, §27.1); dazwischen nur Preview-Deployments des PR.
- **Ruheprüfung 12:08 TR / 11:08 Berlin / 09:08 UTC (rein lesend):** Warteschlange exakt
  **301 wartend / 235 erledigt / 82 laeuft / 0 fehlgeschlagen**; **0 aktive Leases, alle 82
  laeuft-Leases abgelaufen**; **0 Aufträge seit der Rücknahme erzeugt oder geändert**;
  Outbox 220 offen / 163 bestätigt (alle 383 gehören zur Zielmenge, §28.3); CAS 85 `fertig`
  / 2 `unbekannt` / 0 Vormerkungen / 85 KO-Fencing; Migrationen unverändert
  31/`20260815164241` (`20260720` nicht angewendet); 0 fremde aktive Abfragen, 0 Sperren
  auf `helmut_jobs`; **0 Laufzeitfehler** (error/fatal) in den 3 h um das Deployment.
- **Motor wirkungsbasiert aus:** seit der Rücknahme 0 neue/geänderte Aufträge, keine
  `warteschlange-*`-Quittungen, keine Warteschlangen-Logzeilen; die Variablen aus §25.2
  sind ohne das Hauptflag wirkungslos. Der nächste flaggeschaltete Slot (pipeline 19:00 TR
  / 18:00 Berlin / 16:00 UTC) läuft planmäßig über den Altpfad.

### §28.2 CAS-Behandlung nach §23.3/§27.4 (Teil B — AUSGEFÜHRT, ausdrücklich freigegeben)

Betreiberfreigabe: eng begrenzt auf exakt die zwei dokumentierten `unbekannt`-Vorgänge
(md5-Präfixe `7aae32c1`, `744a7780`). Ablauf 12:15–12:20 TR / 11:15–11:20 Berlin /
09:15–09:20 UTC, ausschließlich über die kanonische Funktion
`helmut_verstehen_ausgang_aufloesen` — keine direkte SQL-Zustandskorrektur:

1. **Vorprüfung erneut bestanden:** exakt 2 `unbekannt`, je 1 Versuch / 1 KI-Aufruf, kein
   Besitzer, keine aktive Lease, kein Ergebnis (weder reserviert noch am Wissensobjekt),
   0 Vormerkungen, Klasse `modellfehler`.
2. **`pruefen` je Vorgang:** beide `entscheidung-unbekannt` = kein nachträglich belegtes
   Ergebnis vorhanden; belegt zustandsneutral (die Funktion ändert in diesem Zweig nichts).
3. **`erneut` je Vorgang:** beide `erneut-freigegeben` → Zustand `offen`,
   `letzter_grund='erneut-freigegeben'`.
4. **Nachkontrolle:** `unbekannt` = **0** (85 `fertig` + 2 `offen`); Versuchs-/KI-Zähler
   unverändert 1/1 (durch diese Aktion entstand **kein** Modellaufruf); 0 Vormerkungen;
   0 offene LLM-Reservierungen; KO-Fencing unverändert 85; kein HV001/HV002.

**Kosten:** 0 Modellaufrufe durch die Behandlung selbst; **bis zu 2 bezahlte Aufrufe**
folgen im nächsten regulären Verstehenslauf (frühestens Pipeline-Slot 19:00 TR / 16:00 UTC,
spätestens understanding-cron 00:30 TR / 23:30 Berlin / 21:30 UTC) — exakt die freigegebene
Obergrenze. Kontrolle danach: beide Vorgänge `fertig` mit `verstehen_fencing` ≥ 2, oder
erneut ehrlich `unbekannt` (dann neue Betreiberentscheidung, keine automatische dritte
Wiederholung).

### §28.3 BELEGTER BLOCKER: das §26-Verfahren unterstützt die gemischte Zielmenge nicht (Teil C)

Die Zielmenge besteht jetzt aus **301 `wartend` + 82 `laeuft` mit abgelaufener Lease**
(= 383; die 82 stammen aus den zwei gescheiterten Slots, deren Worker vor dem Abschluss
starben). Das §26-Verfahren scheitert daran dreifach — am Code belegt und in der neuen
Nachweissuite am echten SQL bewiesen: (1) seine Zielmenge trifft nur `status='wartend'`;
(2) sein R2 bricht bei **jeder** nicht erledigten Zeile mit `lease_owner` ab — eine
`laeuft`-Zeile trägt ihn per CHECK-Constraint zwingend, auch mit abgelaufener Lease;
(3) sein R9 verlangt 0 `laeuft` im Nachzustand. Es ist fail closed (kein Teilzustand
möglich), aber für diese Zielmenge unbrauchbar. **Deshalb wurde in diesem Sprint NICHT
neutralisiert** (Auftrag Teil C Punkt 7): die kleinste notwendige Korrektur liegt als
eigenes, zusätzliches Verfahren im selben Modul vor — Ausführung erst nach Merge und
erneuter Vorprüfung (§28.4).

### §28.4 Das gemischte Verfahren: Anker, Riegel, Betreiberablauf

**Anker (rein lesend erhoben 12:12 TR / 11:12 Berlin / 09:12 UTC; unveränderlich):**

| Anker | Wert |
|---|---|
| Verteilung (wartend/erledigt/laeuft/fehlgeschlagen) | **301 / 235 / 82 / 0** (gesamt 618) |
| Zielmenge (wartend + laeuft mit abgelaufener Lease) | **383** |
| Zeitgrenze (strikt nach jüngster Zielzeile 05:56:54 UTC und Rücknahme 06:56 UTC) | `2026-08-19 07:00:00+00` |
| Gesamtsignatur md5(id\|status\|typ\|versuche) | `3fd4565a65cdea28a52bde279d6dd69c` |
| ID-Kette der Zielmenge (md5) | `3b709747630e28d5b7eaae8a36e24939` |
| Erledigt-Signatur (identisch seit §26.7 — die 235 sind unangetastet) | `f7989b8cc2828acb99f26148a405999f` |
| Typverteilung der Zielmenge | source_fetch 361 · document_understanding 2 · mandate_projection 10 · briefing_materialization 10 |
| Entstehungsfenster der Zielmenge | 18.08. 20:00:22 – 19.08. 05:56:54 UTC |
| Outbox-Absichten der Zielmenge | **383** (= gesamte Outbox; 220 offen / 163 bestätigt) |

**Was sich gegenüber §26 ändert (und nur das):** Zielmenge = `wartend` ODER `laeuft` mit
`lease_expires_at <= now()`, jeweils vor der Grenze · R2 zweiteilig (R2a: 0 **aktive**
Leases im gesamten Bestand; R2b: jede `laeuft`-Zeile gehört zur Zielmenge) · **neuer
Riegel R12**: die Outbox-Absichten der Zielmenge werden vor der Löschung gegen den Anker
(383) geprüft und müssen nach der Löschung 0 sein — die `on delete cascade`-Kopplung
(Migration `20260813090000`) wird in der Transaktion **bewiesen**, nicht angenommen; es
bleibt keine zur Zielmenge gehörende Outbox-Restarbeit · R9 prüft 0 `wartend` **und**
0 `laeuft`. Unverändert: Serializable + FOR UPDATE, Trockenlauf-Standard mit
bauartbedingtem Rollback, `ABBRUCH-BEREITS-NEUTRALISIERT`, Datensparsamkeit (keine
sensible Spalte, kein Vollzeilenkonstrukt, kein Export), **Rückweg ausschließlich die
deterministische Neuerzeugung durch den Planer** (kein byte-identischer Restore, keine
Kopie gelöschter Nutzdaten — §26.2 gilt wörtlich weiter).

**Betreiberablauf (nach Merge des Sprint-PR, mit neuer ausdrücklicher Freigabe):**

1. Ruheprüfung wie §28.1 (kein schwerer Cronslot aktiv, 0 fremde Abfragen/Sperren, 0 neue
   Aufträge seit der Rücknahme — sonst Anker neu erheben und neu entscheiden).
2. `node scripts/jobqueue-neutralisierung-383.js --vorpruefung` → alle 12 Werte exakt.
3. `node scripts/jobqueue-neutralisierung-383.js` (Trockenlauf) → muss mit
   `TROCKENLAUF-OK … 383 Zeilen WAEREN geloescht` enden; Gegenmessung: nichts verändert.
4. `node scripts/jobqueue-neutralisierung-383.js --scharf` → genau ein Lauf; erwarteter
   Nachzustand **0 / 235 / 0 / 0**, 0 aktive Leases, Outbox 0, Erledigt-Signatur
   `f7989b8c…` unverändert, CAS unverändert gegenüber §28.2.
5. Nachkontrolle rein lesend (Verteilung, Signaturen, Outbox, CAS, kein Cron/KI/Deploy).

**Erwarteter Nachzustand deckt sich mit dem Auftrag:** 0 wartend · 235 erledigt · 0 laeuft
· 0 fehlgeschlagen · 0 aktive Leases · keine Outbox-Restarbeit der Zielmenge ·
Erledigt-Signatur unverändert · CAS unverändert · kein Cron, kein KI-Aufruf, keine
Migration, kein Deployment, kein Flag, kein Export.

### §28.5 Nachweise des gemischten Verfahrens (echte lokale PostgreSQL)

Suite `scripts/jobqueue-neutralisierung-gemischt-datenbank-test.js` (vom Offline-Runner
automatisch eingesammelt; ohne lokalen PG ehrlich OFFEN): **58 PASS / 0 FAIL** an echter
PostgreSQL 16.13 (PR #257).
Bewiesen werden: der §26-Blocker am echten SQL (R2-Abbruch an den abgelaufenen Leases,
folgenlos) · Vorprüfung und folgenloser Trockenlauf · Abbruch bei aktiver Lease (R2a),
Feldmutation (R3), neuer Zeile (R1), zählungsneutralem Tausch (R6), fehlender
Outbox-Absicht (R12), Fehlgeschlagenem (R1) · Mutationsproben: ohne R2a/R2b nimmt R9 die
Löschung vollständig zurück (Tiefenstaffelung), ohne R3 bliebe eine Feldmutation
unbemerkt, ohne R12 fremde Outbox-Aktivität, R8 rollt eine falsche Löschanzahl nach dem
Delete zurück · scharfe Ausführung: Zielmenge weg, Erledigte byte-identisch, Outbox-Kaskade
bewiesen, fremde (erledigte) Outbox-Absicht überlebt · Wiederholung
`ABBRUCH-BEREITS-NEUTRALISIERT` · funktionaler Rückweg (Schlüssel wieder frei, erledigte
deduplizieren weiter) · Kanarien-Beweis über alle Ausgaben (payload/last_error/tenant_id/
idempotency_key/outbox-Fehlertext erscheinen nirgends).

### §28.6 Vorprüfung und Betreiberplan für Versuch 4 (Teil D — NICHT aktiviert)

**Unmittelbare Vorprüfung (alles rein lesend, unmittelbar vor dem Setzen der Variablen):**

| Nr. | Prüfung | Erwartung |
|---|---|---|
| V4-1 | `main`-HEAD = jüngstes Production-Deployment, READY | deckungsgleich, enthält PR #256 **und** den Sprint-PR |
| V4-2 | Warteschlange | 0 wartend / 235 erledigt / 0 laeuft / 0 fehlgeschlagen · 0 aktive Leases (nach §28.4) |
| V4-3 | Outbox | 0 offene Absichten |
| V4-4 | CAS | 0 `unbekannt` oder jeder Fall mit §23.3-Blocker erklärt; 0 Vormerkungen; kein HV001/HV002 |
| V4-5 | Kein schwerer Cronslot im Aktivierungsfenster aktiv | Fenster 19:10–20:50 TR liegt nach dem 16:00-UTC-Slot |
| V4-6 | Migrationen | Basispunkt 33/`20260823063208`; zwei dokumentierte bytegleiche Einträge für `20260823043633`; `20260720` NICHT anwenden |
| V4-7 | 0 fremde aktive Abfragen/Sperren auf `helmut_jobs` | 0/0 |

**Variablen (Vercel → Production, exakt diese Werte):** `HELMUT_SCALABLE_PIPELINE=on` ·
`HELMUT_JOB_DISPATCH_MODE=shadow` · `HELMUT_SCALABLE_PIPELINE_SEIT=<exakter
Aktivierungszeitpunkt UTC, z. B. 2026-08-19T16:15:00Z>` · `HELMUT_WORKER_PARALLEL=4` ·
`HELMUT_WORKER_STAPEL=25` · `HELMUT_WORKER_BATCH=25`. Unverändert: `HELMUT_VERSTEHEN_CAS=on`;
`HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt (wirkt als 1); `HELMUT_KLASSEN_GRENZEN` und
`HELMUT_ANBIETER_STEUERUNG` aus. Danach Redeployment abwarten (READY, gleicher Git-Stand).

**Fenster:** Aktivierung 19:10–20:50 TR / 18:10–19:50 Berlin / 16:10–17:50 UTC. Erster
Wirkungslauf: crawl 23:00 TR / 22:00 Berlin / **20:00 UTC**.

**Kontrollen des ersten Wirkungslaufs (Abbruch-/Erfolgsgrenzen):**

1. **Echter Abfluss > 0** (`erledigt > 0` im Slot — das K.-o.-Kriterium des 18.08.).
2. **Keine Blob-Zugriffe je `source_fetch`-Auftrag**; höchstens der dokumentierte gebündelte
   Blob-Spiegel **einmal je Slot** (Logzeile `spiegel=ok:<n>` oder ehrlich `FEHLER`).
3. **`process_runs`-Quittungen vorhanden:** `warteschlange-crawl` mit Start- (`running`)
   und Abschlusszeile; Status `success` (oder ehrlich `partial` mit Fehlerklasse).
4. **Keine Doppelarbeit, keine verlorenen Aufträge** (Zähler der Quittung konsistent:
   zielmenge = erledigt + zurückgestellt + wiederholt-offen; keine doppelten Abschlüsse).
5. **0 endgültige Fehler** (`endgueltigFehlgeschlagen = 0`).
6. **R4-Abweichung 0** (Watchdog-Vertrag §8.3/§8.4: keine Doppelarbeit-Befunde).
7. **CAS ohne neue `unbekannt`-Vorgänge** (Stand §28.2: 0; die bis zu 2 freigegebenen
   Wiederholungen können regulär `fertig` werden).
8. **Slotdauer unter der Runbook-Grenze** (< 280 s äußeres Limit; Soll ≤ 270 s).
9. **Warteschlange wächst nicht unkontrolliert** (Wache-Klassen 1–3; Klasse ≥ 6 = Abbruch).
10. **Briefings im Morgenzyklus vollständig** (nächster Morgen: briefing-morning 5/5,
    briefing-lage 5/5).
11. **Kein HV001/HV002.**

**Sofortiger Rückweg (unverändert §27):** `HELMUT_SCALABLE_PIPELINE` aus Production
löschen + Redeployment desselben Git-Stands; die Variablen aus §25.2 dürfen stehen
bleiben (ohne Hauptflag wirkungslos). Abbruchkriterien: Kontrolle 1, 5, 9 oder 11 verletzt
→ sofort zurücknehmen; Kontrolle 2/3 verletzt → zurücknehmen und Befund dokumentieren
(die Wächtersuiten müssten das eigentlich ausschließen).

### §28.7 Nicht getan (Verbote eingehalten)

Keine Neutralisierung ausgeführt (Blocker §28.3 — Verfahren liegt als PR vor) · kein Flag
gesetzt oder gelöscht, kein Deployment/Redeployment ausgelöst, keine Migration, kein
Cronlauf, keine AWS-Ressource · PR #255 unberührt · Production-Mutationen ausschließlich
die zwei freigegebenen CAS-`erneut`-Aufrufe (§28.2) · keine Nutzdaten, Payloads,
Mandatskennungen oder Fehlertexte übertragen oder ausgegeben (Vorgänge nur als
md5-Präfix; Zielmenge nur als Zähler/Zeitgrenzen/Prüfsummen).

### §28.8 AUSFÜHRUNGSBELEG — gemischte Neutralisierung der 383 vollzogen (2026-08-19, freigegeben)

**Ausgeführt am 2026-08-19 zwischen 13:40 und 13:46 türkischer Zeit (12:40–12:46 Berlin,
10:40–10:46 UTC)** aus einer Claude-Sitzung mit **ausdrücklicher Betreiberfreigabe** (Chat-
Auftrag: Vorprüfung, Trockenlauf und scharfe Ausführung ohne weiteren Haltepunkt, sofern
alle Riegel exakt treffen; genau ein scharfer Versuch). Ausschließlich der kanonische Weg
aus §28.4: SQL aus `scripts/jobqueue-neutralisierung-383.js` (byte-identisch zum Modul,
CLI-Gleichheit vor der Ausführung belegt; beide Fassungen erneut durch
`pruefeDatensparsamkeit` geprüft — 0 Verstöße), ausgeführt über die freigegebene
Supabase-MCP-Verbindung. **Keine Nutzdaten gelesen, gespeichert oder ausgegeben** — alle
Belege sind Zähler, Zeitstempel und md5-Prüfsummen.

**Vorbedingungen (alle bestanden):** `main` = Merge PR #257 (`fc9b611`), einziges und
jüngstes Production-Deployment `dpl_7DeB1qcaY3y4Fc2wiDLiFaKaiQLm` READY auf exakt diesem
Commit (13:34:52 TR / 10:34:52 UTC); Motor wirkungsbasiert aus (0 Aufträge seit der
Rücknahme 06:56 UTC verändert, keine Warteschlangen-Quittungen, 10:00-Lage-Check lief über
den Altpfad); kein schwerer Cronslot (jüngster `process_run` 10:03:57 UTC).

**Vorprüfung (Schritt 0, 13:40:05 TR / 10:40:05 UTC) — alle Werte exakt:** 301 wartend ·
235 erledigt · 82 laeuft (**alle 82 Leases abgelaufen, 0 aktive**) · 0 fehlgeschlagen ·
618 gesamt · Zielmenge **383** · Gesamtsignatur `3fd4565a65cdea28a52bde279d6dd69c` ·
ID-Kette `3b709747630e28d5b7eaae8a36e24939` · Erledigt-Signatur
`f7989b8cc2828acb99f26148a405999f` · Typen 361/2/10/10 · Fenster 18.08. 20:00:22 –
19.08. 05:56:54 UTC · 0 offene außerhalb der Grenze · **Outbox 383, vollständig
Zielmenge** (220 offen/163 bestätigt) · Migrationen 31/`20260815164241` · 0 fremde
Abfragen/Sperren · 0 Laufzeitfehler. **CAS-Vorheranker (unmittelbar gemessen):** 90
`fertig` · 2 `offen` (die §28.2-Freigaben, unverändert) · **1 `modell-laeuft` mit
abgelaufener Lease** (md5 `25c6c69d`, 10:05 UTC — der 10:00-Lage-Check riss sein äußeres
Zeitlimit; erwartbarer §23.3-Kandidat, hier auftragsgemäß **nicht** angefasst) · 0
Vormerkungen · 90 KO-Fencing. Abweichung vom nominellen Ausgangsstand (85/2/0) vollständig
durch den regulären 10:00-Verstehenslauf erklärt — zielmengenneutral (alle
`helmut_jobs`-Anker byte-exakt).

**Trockenlauf (Schritt 1, 13:42:48 TR / 10:42:48 UTC):** dokumentierter Abschluss
`TROCKENLAUF-OK: alle Riegel bestanden, 383 Zeilen WAEREN geloescht worden — Transaktion
vollstaendig zurueckgenommen`; Quittung: geloescht 383, Outbox 383→0 (R12 in der
Transaktion), Nachzustand 0/235/0/0, alle drei Prüfsummen exakt. Gegenmessung danach:
**301/235/82/0, Outbox 383/220, alle Signaturen und CAS unverändert** — vollständig
folgenlos (`pg_stat n_tup_del` +383 = zurückgerollter Delete, kumulative Zählung;
ins/upd unverändert).

**Scharfe Ausführung (Schritt 2, ~13:44 TR / ~10:44 UTC, genau ein Lauf):** eine
`serializable`-Transaktion, Zielzeilen per `for update` gesperrt, alle Riegel
R1–R9/R2a/R2b/R12 erneut innerhalb der Transaktion — **exakt 383 gelöscht** (R8), die
**383 Outbox-Absichten über die bewiesene Kaskade vollständig mit entfernt**
(R12-nachher = 0), Nachzustand in der Transaktion 0/235 mit unveränderter
Erledigt-Signatur (R9), erst dann Commit. **Gegenprobe nach dem Commit: 0 offen ·
235 gesamt · Erledigt-Signatur `f7989b8cc2828acb99f26148a405999f` · Outbox 0.**

**Nachkontrolle (13:45–13:46 TR / 10:45–10:46 UTC, rein lesend):** Warteschlange
**0 wartend · 235 erledigt · 0 laeuft · 0 fehlgeschlagen**, 0 aktive Leases, **Outbox 0**;
die 235 Erledigten signaturgleich unangetastet, **kein Insert, kein Update**
(`pg_stat_user_tables`: `n_tup_ins` 1322 und `n_tup_upd` 2302 unverändert; `n_tup_del`
1228 → 1611 (zurückgerollter Trockenlauf) → **1994** (+383 Commit); `n_live_tup` 235).
**CAS byte-gleich zum Vorheranker** (90/1/2, 0 Vormerkungen, 90 Fencing) — kein KI-Aufruf
(`llm_reservations` 0). Migrationen unverändert 31/`20260815164241` (`20260720` weiterhin
nicht angewendet). Jüngster `process_run` unverändert 10:03:57 UTC (**kein Cronlauf
ausgelöst**), 0 Laufzeitfehler, kein HV001/HV002, kein Deployment, kein Flag, keine
AWS-Aktion. **Wache mit echter Live-Eingabe** (echte exportierte `betriebsstatus()`,
echte RPCs): `statusvertrag 2` · `zustand inaktiv` · `zustandsklasse inaktiv-inert` ·
`motor.aktiv false` · Kennzahlen 0/0/0 abgelaufene Leases · Befund `inert-bestand:0` —
kein kritischer Rückstau. **Wiederholungsschutz in Production belegt:** der kanonische
Trockenlauf endet jetzt mit `ABBRUCH-BEREITS-NEUTRALISIERT` (ausgeführt, folgenlos);
keine zweite scharfe Ausführung gestartet.

**Rückweg:** wie §26.2/§28.4 — ausschließlich die deterministische Neuerzeugung durch den
Planer; **kein Export, keine Sicherungskopie, kein byte-identischer Restore.** Die
datenbankseitigen §28.6-Vorbedingungen für Versuch 4 (V4-2: 0/235/0/0 + 0 aktive Leases ·
V4-3: Outbox 0 · V4-6: Migrationen · V4-7: 0 fremde Abfragen/Sperren) sind damit
**erfüllt**; V4-4 trägt den ehrlichen Vorbehalt des einen `modell-laeuft`-Vorgangs mit
abgelaufener Lease (wird vom Wärter regulär aufgelöst bzw. ehrlich `unbekannt`). Versuch 4
wurde **nicht** aktiviert — Aktivierung bleibt Betreiberaktion nach §28.6.

## §29 · Versuch 4 vor der Aktivierung beendet: zwei Verstehensbefunde + Restzeitwache (Reparatursprint 2026-08-20)

### §29.1 Hergang und Befund (Versuch 4, 2026-08-20 — GESCHEITERT VOR AKTIVIERUNG)

Versuch 4 wurde am 20.08. **vor dem Setzen der Variablen beendet**; der neue
Warteschlangenmotor blieb wirkungsbasiert aus, es erfolgte **keine** Aktivierung. Die
Warteschlangenprüfung (Teil C) selbst war grün: Queue 0/235/0/0 mit korrekter
Erledigt-Signatur, Outbox 0, 0 Queue-Leases, 0 Vormerkungen, 0 HV001/HV002, Fencing
konsistent, 0 fremde Abfragen/Sperren, Budget 34/100, exakt 5 aktive Mandate. Blockiert
hat die CAS-Vorprüfung (Teil D, §28.6 V4-4) durch zwei Verstehensbefunde:

1. **`df1a6700`** blieb nach dem 10:00-Lage-Check als `modell-laeuft` mit abgelaufener
   Lease stehen — dasselbe Muster wie `25c6c69d` am Vortag (§28.8).
2. **`eff40db2`** endete im Eager-Verstehen des 16:00-Slots als `unbekannt`, Klasse
   `speicherfehler`, „Vertrag nicht prüfbar" — ein bezahlter Aufruf ohne belegtes Ergebnis.

Dazu entstanden **innerhalb von drei Tagen vier `unbekannt`-Fälle** durch
Anbieter-Timeouts nach Modellstart (Klasse `modellfehler`, vgl. §27.4).

**Beleglage:** die Scratchpad-Belege der Versuch-4-Sitzung sind mit deren ephemerem
Container verloren. Alle tragenden Aussagen wurden am 20.08. abends **rein lesend live
neu erhoben** (Supabase-MCP, nur Zähler/md5-Präfixe/Zeitstempel):
`df1a6700` `modell-laeuft`, Versuche 1, KI-Aufrufe 1, Modellstart **10:06:13 UTC**
(Lease-Ende 10:11:13); der persistierte `understanding-lage`-Lauf des Slots lief
10:02:11–10:05:05 (173,9 s, 14 verarbeitet / 558 vertagt) — der verwaiste Aufruf stammt
von einem **späteren Mandat desselben Lage-Laufs**, unmittelbar vor dem harten
Funktionsende. `eff40db2` `unbekannt` mit wörtlichem Grund
`speicherfehler:vertrag-nicht-pruefbar:Supabase storage timed out after 10000ms:
/rest/v1/rpc/helmut_verstehen_speichere` (16:04:44 UTC, im `understanding-eager`
16:04:01–16:04:53, Grund „zeitbudget", parallel zur `globalphase` 16:01:19–16:05:06);
das zugehörige KO trägt unverändert `ko_version 1` vom 13.08. — **der Speicher-RPC hat
nicht committet**, das bezahlte Aktualisierungsergebnis ist verloren. Queue 0/235/0/0,
Outbox leer, 0 aktive Leases, 0 LLM-Vormerkungen, Budget 35/100 (20.08. abends) live
gegenbestätigt. Die Herkunft der vier Timeout-Fälle ist über §27.4 und die sieben
`erneut`-freigegebenen `offen`-Vorgänge plausibilisiert (die `letzter_grund`-Texte sind
durch die Behandlung überschrieben — einzeln nicht mehr nachweisbar).

### §29.2 Bewiesene Ursachen (Code + Live-Messung)

1. **Der Verstehens-Loop kannte nur ein RELATIVES Zeitbudget** (`budgetMs` ab
   Loop-Start, geprüft nur VOR jedem Cluster — `understanding.js`), nie das absolute
   Funktionsende. Ein bei Budget−ε gestarteter Cluster führte Modellaufruf (~20 s) +
   Speicherung (~10 s) vollständig aus.
2. **Der Lage-Pfad hatte gar keine absolute Grenze:** `runLageCheck` ohne Gesamtbudget,
   `crawlAllSources` ohne Gesamtzeitgrenze (nur 7-s-Einzelanfragen), das 60-s-Budget des
   Lage-Verstehens relativ zu einem beliebig späten Loop-Start. `withTimeout` ist ein
   reines `Promise.race` (bricht nichts ab); `runTenantsFairly` hat nur ein
   Start-Gatter (15 s Reserve), kein Stopp-Gatter — nach innerem 240-s-Timeout lief das
   verlassene Mandat im Hintergrund weiter und startete um t+~293 s noch Modellaufrufe.
   Beim Funktionsende (Antwort nach 280-s-Race, Kill bei maxDuration 300) läuft kein
   `finally` mehr → `modell-laeuft` bleibt stehen; §4e löst erst bei der NÄCHSTEN
   Reservierung ehrlich nach `unbekannt` auf. Zustand/Lease/Zähler werden korrekt in
   `helmut_verstehen_reservierungen` gesetzt (Versuche nur im Übernahme-Zweig,
   KI-Aufrufe im Modellstart); das Tagesbudget wird am Choke-Point in `ai.js` VOR dem
   HTTP-Aufruf reserviert und nie zurückgegeben — der verwaiste Aufruf ist bezahlt.
3. **`eff40db2`:** Der atomare Speicherweg (`helmut_verstehen_speichere`, EINE
   Transaktion: Prüfung + KO-Upsert + Abschluss) wurde vom Storage-Client nach exakt
   10 s abgebrochen (`HELMUT_SUPABASE_TIMEOUT_MS`-Default, AbortController) — unter der
   Parallellast des 16:00-Slots. „Vertrag nicht prüfbar" heißt: die JS-Hülle konnte den
   RPC-Ausgang nicht feststellen (Timeout/Netzfehler/leere Antwort); ob committet wurde,
   war im Moment unentscheidbar. Live-Beweis: nicht committet. Das Fail-closed-Verhalten
   (ehrlich `unbekannt`, kein falscher Erfolg, kein Auto-Retry des Modells) war KORREKT —
   verloren ging „nur" der bezahlte Aufruf, weil es für den Speicherweg selbst keinen
   zweiten Versuch gab.
4. **Anbieter-Timeouts:** Der KI-HTTP-Timeout war ein **Literal 20 000 ms** in `ai.js`
   (Socket-Inaktivität, nicht konfigurierbar). Production-Messungen liegen knapp
   darüber (20,1–22 s, `befund-csd` §, §27.4) — eine **zu knappe lokale Frist ist
   plausible Mitursache**, echte Anbieterstörungen sind nicht ausschließbar (belegte
   Einzelfälle nicht mehr unterscheidbar). Kein Retry nach Timeout existiert (korrekt);
   die einzige automatische Zweitanfrage ist der 400er-Modell-Fallback (deterministisch
   abgelehnte Anfrage, erbt die Reservierung) — kein „unklares Ergebnis"-Fall.
5. **Betroffene Einstiegspunkte** (gemeinsamer Code `understanding.js`): lage-check
   (10:00), crawl/pipeline eager+lazy (04:00/20:00/16:00, alt + Globalphase),
   understanding-Cron (05:30/21:30, pending), Admin-Recovery, Debug-Routen (ohne
   Budget!), und der Queue-Auftrag `document_understanding` (dessen Handler sein
   Auftragsfenster bisher nicht kannte — `mitZeitgrenze` ist ebenfalls nur ein Race).

### §29.3 Reparatur: zentrale Restzeitwache (dieser Sprint, PR #259)

**Neu `lib/helmut/verstehen-restzeit.js`:** EINE zentrale, testbare Entscheidung
`restzeitEntscheidung({deadlineMs, reserveMs?})` mit ZWEI Reserven (Review-Korrektur
20.08. abends — der `modellstart`-RPC ist selbst ein bis zu 10 s dauernder
Supabase-Aufruf und war von der ersten Fassung nicht gedeckt): **Kernreserve** ab dem
externen KI-Aufruf = KI-Timeout (20 s) + Schreibrecht (10 s) + Speicherung (10 s) +
Abschluss (5 s) = **45 s** (Override `HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS`);
**Vor-Modellstart-Reserve** = Kernreserve + `modellstart`-RPC (10 s) = **55 s**. Der
KI-Timeout ist zentral `HELMUT_KI_TIMEOUT_MS` (Default unverändert 20 000, `ai.js`
liest dieselbe Quelle — Aufruf und Reserve können nie auseinanderlaufen).

**`understanding.js` — DREI Gates in Erstverstehen UND Aktualisierung:** (a) VOR der
Reservierung und (b) VOR dem Modellstart-Vermerk je mit der Vor-Modellstart-Reserve
(kein Lease bzw. reguläre Freigabe, kein Budget, Ausgang `skipped-zeitbudget`, Gruppe
`erneut`); (c) unmittelbar VOR dem externen KI-Aufruf (also NACH dem
Modellstart-Vermerk) mit der Kernreserve — dort ist belegbar nichts abgesendet, der
Rückweg ist `freigabeOhneAufruf` (Zeile wieder `offen`, `ki_aufrufe` korrigiert, keine
verwaiste Lease). Ist der Modellstart-VERMERK selbst nicht prüfbar (RPC-Timeout —
serverseitiger Commit möglich, Antwort verloren), greift derselbe belegbar sichere
Rückweg (`freigabeOhneAufruf` deckt `reserviert` UND `modell-laeuft`, Besitzer- und
Fencing-gesichert): Ausgang `skipped-modellstart-unklar` (Gruppe `erneut`) — nie eine
verwaiste `modell-laeuft`-Zeile, nie ein `unbekannt` ohne bezahlten Aufruf, nie eine
automatische bezahlte Wiederholung. Beide Loops (`understandClusters`,
`runPendingUnderstandingShadow`) stoppen zusätzlich VOR jedem Cluster
(Vor-Modellstart-Reserve); der Rest wird regulär vorgemerkt. Ohne Deadline
(0/undefined) ist alles byte-identisch zum Bestand.

**Speicherweg:** genau EINE Wiederholung des atomaren Speicher-RPC bei nicht prüfbarem
Ausgang (kein Modellaufruf, kein Budget; CAS-gesichert — hat der Erstversuch in Wahrheit
committet, antwortet die Wiederholung geordnet `zustand-fertig` und schreibt nie
doppelt), nur wenn die Restzeit dafür reicht — **einschließlich der konfigurierten
Wartezeit vor der Wiederholung** (Review-Korrektur). Danach unverändert fail closed
(`unbekannt`, Grund mit `nach-wiederholung:`-Vermerk).

**Deadline-Verdrahtung der Einstiegspunkte:** lage-check `t0+280 s` → `runLageCheck` →
`foldLageItemsIntoV3`; crawl/pipeline-Altpfad `startedMs+270 s` → `runSourceCrawl`
(min mit eigenem 240-s-Fenster) → eager; Globalphase `startedMs+budget−Abschlussreserve`;
understanding-Cron `+280 s`; Admin-Recovery `+240 s`; Queue: `fuehreAuftragAus` reicht
`auftragsDeadlineMs` (= jetzt + Auftragsbudget) an jeden Handler, der
Verstehens-Handler gibt sie in den Loop. Debug-Routen bleiben ohne Deadline
(unverändert; nur maxDuration).

### §29.4 Nachweise (offline, 2026-08-20)

Neue Suite `scripts/verstehen-restzeit-test.js`: **50 PASS / 0 FAIL** — §1 Grenzfälle
beider Reserven · §2 zu wenig Restzeit: kein Aufruf/Budget/Versuch/Lease · §3 genug
Restzeit: genau ein Aufruf, `fertig` · §4 zweites Gate: Freigabe statt Waise · §5
Anbieter-Timeout: genau ein Aufruf, ehrlich `unbekannt`, kein Auto-Zweitaufruf im
Folgelauf · §6 Speicherweg: Rettung im Zweitversuch, dauerhafter Fehler ehrlich, KEIN
Doppel-Schreiben nach verlorenem Commit, keine Wiederholung ohne Restzeit · §7
Loop-Gate: 0 Aufrufe, alles vorgemerkt · §8 Queue-Deadline erreicht den Handler · §9
Verdrahtungs-/Quelltextverträge · **§10–§12 (Review-Korrektur):** langsamer
`modellstart`-RPC → drittes Gate verhindert den Aufruf (0 Anbieteraufrufe, Zähler
korrigiert, keine Waise) · Antwortverlust nach serverseitigem `modellstart`-Commit →
`skipped-modellstart-unklar`, Zeile wieder `offen`, Folgelauf versteht regulär (auch
ohne Commit) · Wartezeit zählt in der Restzeitprüfung des Speicherweg-Zweitversuchs.
Kanonischer Offline-Lauf: 263/268 grün; die 4 verbliebenen Rot-Suiten sind per
Worktree-Baseline auf unverändertem `main` identisch rot (umgebungsbedingt — Details
PR #259); fünf Quelltextvertrags-Suiten bewusst an §29 nachgeführt (cron-fairness,
cron-globalphase, vorgangskontext, kostenmessung,
vorgangs-lebenszyklus/ERGEBNISGRUPPEN) + env-inventar-Eintrag.

### §29.5 Nicht getan (Verbote eingehalten)

Keine Aktivierung, kein Deployment, kein Merge, keine Migration, keine
Production-Datenänderung, keine Env-/Flag-/Cron-Änderung, kein bezahlter Modellaufruf,
kein kostenverursachender Lauf. Die sieben `offen`-Vorgänge sowie `df1a6700` und
`eff40db2` wurden **nicht** verändert und **nicht** erneut ausgeführt (alle Zugriffe
rein lesend). Die strenge Aktivierungsbedingung (§28.6, insb. 0 `unbekannt`, 0
`modell-laeuft` mit aktiver/abgelaufener Lease, 0 Vormerkungen, 0 HV001/HV002) ist
**unverändert**.

### §29.6 Verbleibende Risiken und Weg zu Versuch 5

- **Anbieter-Timeouts bleiben ein Skalierungsrisiko:** die Reparatur verhindert
  verwaiste Zustände und unnötige Starts, nicht den Timeout selbst. Eine Anhebung von
  `HELMUT_KI_TIMEOUT_MS` (hebt die Reserve automatisch mit) ist eine
  **Betreiberentscheidung**; bei 5 Mandaten trägt der `unbekannt`→`pruefen`/`erneut`-Weg
  (§23.3), bei 25+ Mandaten wächst die Behandlungslast linear.
- **Der Speicher-Timeout unter Slotlast** ist durch die eine Wiederholung gemildert,
  nicht beseitigt (Supabase Free, OP-01).
- **Altbestand vor Versuch 5:** `df1a6700` (läuft per §4e beim nächsten Verstehenslauf
  ehrlich nach `unbekannt` bzw. `fertig`), `eff40db2` (`unbekannt`) und die sieben
  `offen`-Vorgänge müssen regulär abfließen bzw. per §23.3 behandelt werden, bis die
  §28.6-Vorprüfung wieder vollständig grün ist — **nach Review, Merge und Deployment
  dieses Sprints**, damit die Restzeitwache im ersten Wirkungslauf bereits gilt.

## §30 · Strukturelle Wiederaufnahmelücke: freigegebene Vorgänge erreichten keinen Lauf (Sprint 2026-08-22)

### §30.1 Der belegte Fehler

Nach der Behandlung vom 21.08. (§29.7) standen sechs Vorgänge per kanonischem Betreiberweg
auf `offen` mit `letzter_grund='erneut-freigegeben'`. **Fünf von ihnen wurden über vier
aufeinanderfolgende Slots nicht ein einziges Mal angefasst** — obwohl dieselben Läufe reichlich
Arbeit leisteten:

| Slot (UTC) | Lauf | verarbeitet | einer der sechs dabei? |
|---|---|---|---|
| 21.08. 16:00 | globalphase + eager | 0 | nein |
| 21.08. 20:00 | globalphase + eager | 1 | **ja — `eff40db2` → `fertig`** |
| 21.08. 21:30 | understanding-cron | **18** | nein |
| 22.08. 04:00 | globalphase + eager | 6 | nein |

**Ursache, am Code belegt:** Der dedizierte Nachholpfad `runPendingUnderstandingShadow` liest
ausschließlich `storage.listPendingKnowledgeObjects()`, also Wissensobjekte mit
`status='pending'`. Ein per `erneut` freigegebener Vorgang hat aber entweder ein bestehendes
`complete`-KO (dann ist er nicht `pending`) oder gar kein KO (dann ist er dort erst recht
nicht). Er war damit in **keiner** Liste, die ein regulärer Lauf abarbeitet. Erreicht wurde er
nur über den eager-Pfad — und der sieht ihn ausschließlich, wenn sein Cluster **zufällig**
durch neue Dokumente erneut gebildet wird. Genau das traf am 20.08. auf `eff40db2` zu und auf
die übrigen fünf nicht. Die Freigabe war also wirkungslos, ohne dass irgendetwas fehlschlug —
ein stiller Rückstand, kein Fehler.

### §30.2 Der kleinste sichere Fix (ohne Migration)

**Neu `storage.verstehenWiederaufnahmen({limit})`** — eine **rein lesende** PostgREST-Abfrage
auf die bestehende Tabelle `helmut_verstehen_reservierungen`, gefiltert auf
`zustand=eq.offen` **und** `letzter_grund=eq.erneut-freigegeben`. Das ist exakt der Marker, den
`helmut_verstehen_ausgang_aufloesen(..., 'erneut')` schreibt (Migration `20260814180000`,
Zeile 815) — **keine** pauschale Wiederverarbeitung offener Vorgänge. Sortiert wird
`updated_at.desc`, damit ein Eintrag, der aus Struktur- oder Budgetgründen dauerhaft hängen
bleibt, keine frischere Freigabe verhungern lässt. **Keine Migration nötig:** die Tabelle und
alle benutzten Vertragsfunktionen stammen unverändert aus `20260814180000`.

**`understanding.js`:** `runPendingUnderstandingShadow` stellt diese Vorgänge der pending-Menge
voran (eine ausdrückliche Betreiberfreigabe soll nicht daran scheitern, dass das Zeitbudget
vorher aufgeht) und verarbeitet sie über **denselben, unveränderten** `understandOneCluster` —
dieselbe CAS-Reservierung, dieselbe Vorgangswache, dasselbe Budget-Gate, dieselbe
Restzeitwache (§29), dieselben Versuchs- und Wiederaufnahmegrenzen. Der Cluster wird über die
**Verknüpfung** rekonstruiert (`listVorgangDocuments`), nicht über eine Neuclusterung — genau
damit entfällt die Abhängigkeit von zufälliger Neuclusterung. Fehlt das KO, bleibt die
Kennungssuche als Rückfallebene; findet auch sie nichts, endet der Vorgang ehrlich als
`skipped-no-cluster` **ohne** Modellaufruf. Obergrenze je Lauf: 25
(`HELMUT_VERSTEHEN_WIEDERAUFNAHME_MAX`, hart auf 200 gedeckelt).

**Die zwei Vorfilter, die den belegten Fällen im Weg standen** (`duplicate` bei bestehendem
`complete`-KO, `skipped-failed` bei geparktem KO), greifen beim Wiederaufnahmepfad
**ausschließlich dann nicht**, wenn `wiederaufnahmeFreigabe` gesetzt ist — also genau bei einer
ausdrücklichen Betreiberfreigabe. Ohne Freigabe bleiben beide unverändert scharf (§30.3 §11c).
Das war der entscheidende Punkt: Cluster und Bestandsdokumente stammen aus **derselben**
Verknüpfungsabfrage, deshalb hätte der Wiederaufnahmepfad ohne diese Lockerung bei
`ba50848e`/`dcbb89b6`/`50390467` weiterhin `duplicate` gemeldet — der Fix hätte den belegten
Produktionsfall nicht gelöst.

**Drei harte Klammern um den neuen Pfad** (Review-Korrekturen, alle testgesichert):

1. **Vertragsbindung.** Die Liste wird nur gelesen, wenn der CAS-Vertrag aktiv ist
   (`verstehenVertrag()` bzw. `casAktiv()`). Ohne Flag gibt es keine Abfrage und keinen
   Modellaufruf — der neue Pfad kann nicht am CAS-Schalter vorbei bezahlte Aufrufe auslösen.
2. **Zeit-Gate vor der Vorarbeit.** Die Abfrage läuft nur, wenn die Restzeit die
   Vor-Modellstart-Reserve (§29) noch trägt. Reicht sie nicht, wird gar nicht erst gelesen.
   Die drei Gates im Lauf selbst bleiben unverändert.
3. **Strenger Bestandsleser.** Das bestehende Wissensobjekt wird erst **hinter** Sperre und
   Gates geholt, und zwar über `getKnowledgeObjectByVorgang(..., {throwOnError:true})`. Ein
   Lesefehler endet ehrlich als `skipped-store` mit Grund `bestand-nicht-lesbar:…`; er darf
   **niemals** als „kein Bestand" durchgehen, weil das ein lebendes KO mit `ko_version: 1`
   überschrieben hätte.

**Selbstbegrenzung — ehrlich abgegrenzt:** `helmut_verstehen_reserviere` setzt bei jeder
Übernahme `letzter_grund = null` (Migration `20260814180000`, Zeile 371). Sobald ein Vorgang
also tatsächlich reserviert wird, ist der Freigabemarker verbraucht: eine Freigabe führt zu
**höchstens einem** Reservierungs- und damit Modellaufrufversuch, einen automatischen zweiten
gibt es nicht. Endet der Vorgang **vor** der Reservierung (kein Cluster, Budget aus, Zeitbudget
aus, Bestand nicht lesbar, Versuchslimit ausgeschöpft), bleibt der Marker stehen und der
Vorgang wird im nächsten geeigneten Lauf erneut **angeboten** — jedes Mal ohne Modellaufruf,
weil er an derselben Stelle wieder endet. Das ist gewollt (die Freigabe verfällt nicht
stillschweigend), aber es ist **keine** Selbstlöschung: ein strukturell unlösbarer Vorgang
bleibt in der Liste, bis ein Betreiber ihn per `aufgeben` schließt. Die `desc`-Sortierung sorgt
dafür, dass er dabei niemandem den Platz nimmt. **Fail closed:** Ein Lesefehler der Liste gilt
nicht als „kein Rückstand", sondern wird als `wiederaufnahmeGrund` gemeldet; nur
`supabase-nicht-konfiguriert` wird still übergangen.

### §30.3 Nachweise (offline, 2026-08-22)

Neue Suite `scripts/verstehen-wiederaufnahme-test.js`: **47 PASS / 0 FAIL**.

- **§1 Kernbeweis** — ein freigegebener Vorgang wird bei **leerer** Rohdokumentmenge
  (`rawDocs = []`), also ohne jede Clusterbildung, reserviert und verstanden;
  Cluster-Herkunft `verknuepfung`. Genau die verlangte Unabhängigkeit von erneuter
  Clusterbildung.
- **§2/§7** — `complete`-KO mit Vormerkung über den Update-Pfad; Erfolg setzt `fertig` und löst
  die Vormerkung vertragsgemäß, Zähler exakt +1.
- **§3** — ohne KO: ehrlich `skipped-no-cluster` ohne Aufruf, bei Kennungstreffer reguläres
  Erstverstehen.
- **§4** — enge Grenze samt serverseitigem Filter: nur `erneut-freigegeben`, kein
  `zustand='offen'` ohne Marker.
- **§5** — ausgeschöpftes Versuchslimit: kein weiterer Modellaufruf (`skipped-update-final`).
- **§6** — parallele Läufe: genau **ein** Modellaufruf, keine verwaiste Lease.
- **§8** — erneuter Fehler endet ehrlich `unbekannt`, kein Doppelaufruf, kein stilles
  Verschwinden.
- **§9** — fail closed bei Lesefehler der Liste.
- **§10** — Grenzen und Quelltextverträge inklusive **unveränderter** Restzeitwache (§29) und
  unverändertem 30-Sekunden-Timeout.
- **§11 (Review-Korrektur)** — die belegten Produktionsfälle werden wirklich gelöst:
  `complete`-KO **ohne** Vormerkung wird verarbeitet statt als `duplicate` verworfen
  (§11a, Lage von `ba50848e`/`dcbb89b6`/`50390467`); geparktes KO mit
  `understanding_status='failed'` wird auf ausdrückliche Freigabe hin verarbeitet (§11b);
  **ohne** Freigabe bleiben beide Vorfilter scharf, kein Modellaufruf (§11c).
- **§12 (Review-Korrektur)** — ohne CAS-Vertrag wird die Liste gar nicht erst gelesen (§12a);
  ohne Restzeit ebenfalls nicht (§12b); ein Bestands-Lesefehler erzeugt keinen Modellaufruf und
  überschreibt kein Wissensobjekt, sondern meldet `skipped-store` mit Grund (§12c);
  „nicht konfiguriert" ist kein Alarm, ein echter Lesefehler schon (§12d); `desc`-Sortierung,
  Bestandslesung hinter der Sperre und Vertragsbindung sind am Quelltext festgenagelt (§12e).

**Vor der Korrektur** lief dieselbe Suite mit 34 Checks grün — eine unabhängige
Gegenprüfung fand danach vier ernste Mängel (fehlende Vertragsbindung, ungedeckelte Vorarbeit,
nicht gelöste Produktionsfälle wegen der beiden Vorfilter, stiller Bestandslesefehler). Alle
vier sind behoben, die Suite deckt sie jetzt ab. Das wird hier festgehalten, weil ein
grüner Testlauf allein kein Beleg für Vollständigkeit ist.

Zusätzlich: vollständige Offline-Suiten und Browser-Smoke — Zahlen in `CURRENT_STATE.md`.

### §30.4 Nicht getan (Verbote eingehalten)

Keine Production-Behandlung, kein manueller Modellaufruf, kein SQL-Schreiben, keine
Env-Änderung, kein Redeployment, keine Aktivierung. **Die Vormerkung von 0caefc33 wurde nicht
gelöscht.** Kein vierter Versuch für 0caefc33 — der Fix erhöht keine Grenze, er verschafft
einem bereits freigegebenen Vorgang nur die Gelegenheit, überhaupt reserviert zu werden.
Versuch 5 bleibt gestoppt; die Ausnahme für 0caefc33 wurde nicht erteilt.

### §30.5 Vertragsschließung: `aufgeben` für dauerhaft folgenlose Freigaben (Sprint 2026-08-23)

Die in §30.2 zugesagte Betreiberschließung („bleibt in der Liste, bis ein Betreiber ihn per
`aufgeben` schließt") war im deployten Datenbankvertrag **unmöglich**:
`helmut_verstehen_ausgang_aufloesen` — der einzige Schreiber von `zustand='aufgegeben'` —
löste ausschließlich `unbekannt` auf (`nicht-blockiert`-Riegel, Betreibersprint 22.08.
BLOCKIERT). Production-Fall: `df1a6700` (`offen`, Marker `erneut-freigegeben`, kein
Wissensobjekt, keine Dokumentverknüpfung, je Lauf ehrlich `skipped-no-cluster`).

**Schließung (Migration `20260823043633_verstehen_aufgeben_erneut_freigegeben.sql` +
`rollback_`-Gegenstück, gleiches Verzeichnis):** `aufgeben` zusätzlich erlaubt für GENAU

1. `zustand='offen'` **und** `letzter_grund='erneut-freigegeben'` — der Marker, den nur der
   kanonische Betreiberweg (`aufloesen(..., 'erneut')`) schreibt; die App-Freigaben schreiben
   andere Literale (`kein-ergebnis-vor-modellstart`, `aktualisierung-vor-modellstart`) bzw.
   den Präfix `belegt-ohne-aufruf:`. Sobald ein Lauf reserviert, ist der Marker verbraucht
   (`reserviere` setzt `letzter_grund = null`).
2. kein Besitzer, keine Lease (`besitzer IS NULL`, `lease_bis IS NULL`; Verstoß →
   `aufgeben-verweigert-besitz`, keine Änderung),
3. kein Wissensobjekt und keine `ko_document_links`-Verknüpfung zu dieser Vorgangskennung
   (Verstoß → `aufgeben-verweigert-dokumentgrundlage`, keine Änderung — die
   `ba50848e`-Klasse mit bestehendem complete-KO bleibt dem Wiederaufnahmepfad vorbehalten),
4. ausdrückliche Entscheidung `'aufgeben'`.

Alle Bedingungen atomar unter dem bestehenden `FOR UPDATE`-Row-Lock; Erfolg schreibt nur
`zustand='aufgegeben'` + `letzter_grund='aufgegeben-nach-freigabe'` (Herkunft ablesbar,
Zeile fällt aus dem §30.2-Listenfilter). `versuche`/`ki_aufrufe`/`fencing`/`ergebnis_*`
unangetastet; Signatur, SECURITY INVOKER, `search_path=public, pg_temp` und Rechte (EXECUTE
nur `service_role`) identisch — deckungsgleich mit den offiziellen Supabase-Hinweisen zu
Datenbankfunktionen (invoker als Best Practice, fester `search_path`, Rechte per REVOKE).
Jedes andere Verhalten der Funktion ist byte-gleich; `aufgegeben` bleibt terminal
(`reserviere` → `grund='aufgegeben'`).

**Nachweise (echte PostgreSQL 16, `scripts/verstehen-aufgeben-erneut-freigegeben-test.js`):
47 PASS / 0 FAIL** — Altvertrag unverändert (§1), Zielfall (§2), Fremdfälle/Lease/Besitzer/
Dokumentgrundlage verweigert (§3–§5), Zähler unverändert (§6), Idempotenz inkl. `updated_at`
(§7), Parallelität aufgeben ↔ reserviere ohne Widerspruch (§8), Rechte/Signatur (§9),
Rollback + erneutes Vorwärts (§10). Bestandssuite `verstehen-cas-datenbank-test.js`
unverändert **103/0**; Offline-Gesamtlauf grün.

**Production Vollzug 2026-08-23:**

1. PR #262 wurde gemergt (`81f396b5`) und als Production Deployment
   `dpl_8Z74anCHqxZVNQjmUPs5UGq7GuRZ` READY ausgeliefert.
2. Die Migration wurde nach eigener Betreiberfreigabe angewendet. Die Buchführung enthält
   zwei bytegleiche Einträge mit demselben Namen und den Anwendungsversionen
   `20260823063140` und `20260823063208`. Ursache waren zwei parallele Anwendungen durch
   getrennte Agenten, nicht ein interner Werkzeugretry. Die Funktion existiert genau einmal;
   die Anwendung änderte keine Daten. Die Dublette wurde nicht gelöscht.
3. Unmittelbare Vorprüfung um 09:38:42 TR / 08:38:42 Berlin / 06:38:42 UTC:
   df1a6700 exakt `offen` + `erneut-freigegeben`, Besitzer und Lease null,
   0 Wissensobjekte, 0 Dokumentverknüpfungen, Funktion und Row Lock vorhanden.
4. Der getrennt freigegebene Aufruf für
   `vg-ausschreibung-20260708-3ff6e2-2` lieferte um 09:38:54 TR /
   08:38:54 Berlin / 06:38:54 UTC exakt `aufgegeben`.
5. Nachkontrolle: Zustand `aufgegeben`, Grund `aufgegeben-nach-freigabe`,
   Versuche/KI Aufrufe/Fencing unverändert 1/1/1, Besitzer/Lease null. Seit der Vorprüfung
   änderte sich genau diese eine Reservierungszeile. 492dcd48 blieb `fertig` mit 2/2/2.
   Gesamtstand 239 fertig / 1 aufgegeben; Queue 0/235/0/0, Outbox 0,
   Vormerkungen 0, aktive Leases 0.

**V4 Nachkontrolle 09:44:50 TR / 08:44:50 Berlin / 06:44:50 UTC:** V4 1/2/3/4/6/7
grün; V4 5 bleibt bis unmittelbar vor einer ausdrücklich freigegebenen Aktivierung offen.
Kein Flag, kein Redeployment, kein Motorstart, kein Versuch 5.

### §30.6 Live-Vorprüfung V4 im Aktivierungsfenster (2026-08-23, rein lesend) — ROT UND BLOCKIERT

**Gemessen 19:12:31–19:23:18 TR / 18:12:31–18:23:18 Berlin / 16:12:31–16:23:18 UTC**, also
vollständig im kanonischen Fenster (19:10–20:50 TR / 16:10–17:50 UTC). Ausschließlich lesende
Zugriffe (Git/GitHub lesend, Vercel lesend, Supabase `select`/Logs); keine Nutzdaten gelesen
oder ausgegeben — Vorgänge nur als md5-Präfix, Mandate nur als Zähler/Signatur. **Kein Flag,
keine Env-Änderung, kein Deployment, kein SQL-Schreiben, kein Cron-/Worker-/Modelllauf, keine
Migration, keine Löschung der doppelten Buchung, keine Aktivierung von Versuch 5.**

| Tor | Erwartung (Freigabetext) | Messung | Ergebnis |
|---|---|---|---|
| V4-1 | main-HEAD = jüngstes Production-Deployment, READY; erwartet `a7559186` | `origin/main` = `a7559186dfb0…`; jüngstes Production-Deployment `dpl_95o8QLbe1QT2jCVHv88s8hZDTDc3` (07:40:36 UTC) READY auf exakt diesem Commit; jüngeres Deployment nur Preview (07:54:22 UTC, PR #264, kein `target=production`) | **grün** |
| V4-2 | 0 wartend / 235 erledigt / 0 laeuft / 0 fehlgeschlagen · 0 aktive/abgelaufene Leases | exakt 0/235/0/0, Leases 0/0; `pg_stat_user_tables` für `helmut_jobs` ins/upd/del/live = **1322/2302/1994/235**, byte-stabil identisch zu §28.8 (19.08.) ⇒ seither kein einziger Schreibvorgang | **grün** |
| V4-3 | Outbox 0 | `helmut_job_outbox` 0 Zeilen | **grün** |
| V4-4 | **239 fertig** · 1 aufgegeben · 0 offen · 0 unbekannt · 0 modell-laeuft · 0 Vormerkungen · 0 HV001/HV002 · 0 Fencing-Konflikte | **244 fertig** · 1 aufgegeben · 0 offen · 0 unbekannt · 0 modell-laeuft · 0 reserviert · 0 Besitzer/Leases · 0 Vormerkungen · KO-Fencing 244 = fertig-Anzahl · 0 Fencing-Konflikte · Logs seit 06:30 UTC: 0 HV001/HV002, 0 ERROR, 0 FATAL | **ABWEICHUNG** (nur Zählstand) |
| V4-5 | kein schwerer Cronslot im Fenster aktiv | `process_runs` 0 `running`; 16:00-UTC-Slot beendet 16:03:14 UTC (vor Fensterbeginn); nächster schwerer Slot crawl 20:00 UTC nach Fensterende. Hinweis: `globalphase` 16:00 endete ehrlich `partial` (`budget=1 fehler=0 persistenz=ok cas=0 nv=0`, vertagt 1888/2009, 182 s) — reguläres fail-closed-Budgetverhalten des Altpfads, kein V4-Tor | **grün** |
| V4-6 | Basispunkt 33/`20260823063208`; **zwei bytegleiche Einträge** für `20260823043633`; nichts löschen; `20260720` nicht anwenden | 33 Einträge, Ende `20260823063208` ✓; `20260720` nicht angewendet ✓; Dublette vorhanden, aber **nicht streng bytegleich**: `…063140` = Repo-Datei **byte-identisch** (md5 `ef205d5f30ca0ddbc6d95e0d2523d92a`, 12 684 Zeichen), `…063208` = identischer Inhalt **ohne das letzte Newline-Byte** (md5 `77f78362aad5552519aefecba05e2423`, 12 683 Zeichen, letztes Zeichen `;`); Präfix über 12 683 Zeichen exakt gleich, je 1 Statement ⇒ SQL-wirkungsgleich. Funktion `helmut_verstehen_ausgang_aufloesen` genau 1×. Nichts gelöscht, nichts angewendet | **ABWEICHUNG** (nur Wortlaut „bytegleich") |
| V4-7 | 0 fremde aktive Abfragen / 0 Sperren auf `helmut_jobs` | 0 / 0 | **grün** |
| Zusatz | 0 offene Pull Requests | 0 offene; #264 (überholte Doku-Variante zur Dubletten-Ursache) am 23.08. 07:57:32 UTC **geschlossen, nicht gemergt** | **grün** |
| Zusatz | `HELMUT_SCALABLE_PIPELINE` aus | wirkungsbasiert aus: Queue/pg_stat byte-stabil (s. V4-2), keine `warteschlange-*`-Quittungen, Outbox 0; 16:00-Slot lief als `globalphase mode=global` über den Altpfad | **grün** |
| Zusatz | genau 5 reale Mandate aktiv | `mandate_profiles`: **5 aktiv / 9 gesamt**, 0 aktive mit `test-*`-Präfix, 0 aktive gelöscht; Signatur **`m5-9aee228dbf2c9f13`** identisch zum K2-Beleg | **grün** |

**Erklärung der V4-4-Abweichung (kein Schadensbefund):** Der Erwartungswert 239 war der Stand
der Nachkontrolle 06:44:50 UTC. Seither liefen die regulären Slots 10:00 UTC (Lage-Check) und
16:00 UTC (Pipeline): **fünf neue Vorgänge**, alle regulär `fertig` mit Zählern/Fencing 1/1/1
(erstellt/abgeschlossen 10:01:44–10:02:40 bzw. 16:02:06–16:02:40 UTC), plus **eine reguläre
Aktualisierung** eines Bestandsvorgangs (`28aae85d`, 22.08. 21:34 erstellt, 16:02:55 UTC auf
3/3/3, `ergebnis_fencing=3`). 239 + 5 = 244; alle Vertragsinvarianten unverletzt (ein
Modellaufruf je Versuch, monotones Fencing, keine Vormerkung, kein `unbekannt`).

**Erklärung der V4-6-Abweichung:** Die beiden Buchungen unterscheiden sich um **genau ein
End-Newline-Byte** (0x0a); Anwendung 1 buchte die Datei wörtlich, Anwendung 2 ohne
End-Newline. Der Unterschied **stützt** die §30.5-Darstellung zweier getrennter paralleler
Anwendungen (ein interner Werkzeug-Retry desselben Aufrufs hätte zwei wirklich byte-identische
Zeilen erzeugt — genau das Gegenmodell aus dem nicht gemergten #264).
Inhaltlich/SQL-seitig identisch; die dokumentierte Formulierung „bytegleich"
(§30.5, CURRENT_STATE) ist um dieses eine Whitespace-Byte unpräzise. Kein Eingriff erfolgt;
die Dublette bleibt auftragsgemäß stehen.

**Ergebnis: Vorprüfung rot und blockiert.** Auftragsregel „jede Abweichung ⇒ stoppen, keine
Aktivierung empfehlen, nichts verändern, Blocker benennen" angewendet: beide Abweichungen sind
vollständig erklärt und ohne Schadensbefund, weichen aber vom wörtlich freigegebenen
Erwartungsstand ab. **Versuch 5 wurde nicht aktiviert.** Nächste Betreiberaktionen (nur
benannt, nicht ausgeführt): (1) neue Referenzwerte bestätigen — CAS-Basis 244 fertig /
1 aufgegeben (bzw. Stand des dann aktuellen Slots) und Dubletten-Wortlaut „inhaltsgleich bis
auf ein End-Newline-Byte"; (2) neues Aktivierungsfenster ausdrücklich freigeben; (3) unmittelbar
darin V4 1–7 frisch wiederholen; erst bei vollständigem Grün Aktivierung nach §28.6-Plan.
