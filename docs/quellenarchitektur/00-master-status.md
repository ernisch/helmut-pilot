# MASTER-STATUS — Helmut Quellenarchitektur-Migration

> # 🧭 RE-ANKER (Recovery Sprint R2, 2026-07-22)
>
> - **Aktueller `main`-HEAD: `d6d9063`** (Merge #113). Ältere HEAD-Angaben in diesem
>   Dokument (`7346653`/#100 usw.) sind **historische Stände**, nicht der aktuelle.
> - **Quellenmodus: `HELMUT_SOURCE_MODE=on` — der Cutover ist AUSGEFÜHRT** (Freigabe
>   „Go Quellen Cutover" 2026-07-15, `helmut-flags.json`). Die relationale DB ist die
>   **aktive** Quellenwahrheit, der hartkodierte Katalog ist Fallback. **Es gibt kein
>   offenes Quellen-Cutover-Gate mehr.** Ältere Passagen unten (§4/§8/§9, Stand
>   2026-07-14), die den Cutover als „einzige noch offene Freigabe / NICHT ausgeführt"
>   beschreiben, sind ein **historischer Vor-Cutover-Snapshot** und überholt.
> - **JWT-Selbstsignierung: dauerhaft stillgelegt** (`tenantJwtModeEnabled()`→`false`,
>   `storage.js:2432-2434`). RLS ist **inert**; Mandantentrennung erfolgt **ausschließlich
>   App-seitig**. Kein Dokument darf behaupten, RLS schütze die Produktion vollständig.
>   Verbindlich: `05-sicherheitsmodell-rls.md`.
> - **OP-03** (DB-seitige Scharfschaltung): **blockiert den Einzelpiloten nicht**,
>   ist aber **zwingende Voraussetzung vor dem ersten echten zahlenden Zweitmandanten**.
> - **Demo-/Pilot-Mandate:** offene Bereinigungsaufgabe **OP-04** (nicht erledigt).
> - **Generation B („Quellenplattform") wird bewusst NICHT integriert** — siehe
>   `docs/architecture/retired-quellenplattform-branches.md`.
> - **Scope:** dieses Dokument = Gesamt-Migrationsstatus. Sicherheit/RLS/JWT →
>   `05-sicherheitsmodell-rls.md`; offene Punkte → `datenmotor-restliste.md`.

## NACHTRAG 2026-07-24 (Vorbereitetes Fachthemenpaket „Wohnen, Bauen & Stadtentwicklung (Bund)" — INAKTIV)

- Neues Bund-Fachthemenpaket `wohnen-bauen-stadtentwicklung-bund` **strukturell
  vorbereitet, technisch VOLLSTÄNDIG INAKTIV** (`status = prepared`; 10 Abrufwege
  `needs_review` + `manual`; 0 aktive Wege). **Nicht aktiviert, nicht deployt, nicht
  gemergt.** Kompaktes Manifest + Integrationsprotokoll:
  **`docs/quellenarchitektur/29-wohnen-bauen-stadtentwicklung-bund.md`** (dort steht
  alles Nötige — zukünftige Threads müssen NICHT das ganze Repo lesen).
- Lebt eigenständig in `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-quellen.js`
  (+ Generator/Test/SQL). **Kein** Eingriff in Katalog/Registry/Generator/Methodik:
  `buildFullModel` bleibt 6 Pakete, `source-architecture-test` 91/91 unverändert.
  Wiederverwendet Destatis/Bundesrat/Bundestag/DIP/Ausschuss (keine Dubletten);
  8 neue Entitäten (BMWSB/BBSR/UBA/BiB/KfW/Difu/Städtetag/Landkreistag). BBSR=BBR
  (eine Institution). GMBl/ARGEBAU = Future Targets. Offline-Suite 141/141 grün.
- **Betrieb dadurch unverändert** (nichts crawlt; Aktivierung ist eigener,
  freigabepflichtiger Schritt — siehe Doku 29 §7).

## NACHTRAG 2026-07-17 (Konsolidierung: Thread-2-Härtung, Sprint 1, Mandantenneutralisierung, Understanding-Forensik, Recovery-Pfad) — aktuellster verifizierter Stand

> **Verbindliche Restliste aller offenen Punkte:** `docs/datenmotor-restliste.md`.
> **Nummernschema:** Die früheren, kollidierenden F-/P-Nummern sind aufgelöst —
> Alt-Freigabepunkte heißen jetzt **FA-1…FA-13**, Thread-2-Freigaben **FT2-1…FT2-8**,
> offene Punkte tragen eindeutige **OP-Nummern** (Mapping in der Restliste). Die in
> älteren Nachträgen unten verwendeten Bezeichnungen (z. B. „F12") sind historisch.

| Was | Wert (verifiziert) |
|---|---|
| `main`-HEAD (= Stand dieser Konsolidierung) | **`7346653`** (Merge PR #100) |
| Gemergte PRs seit letztem Nachtrag | **#95** (Thread-2-Härtung P0/P1 + Beobachtbarkeit) · **#96** (Sprint 1: Sicherheit & Mehrmandantenfähigkeit) · **#97** (Mandantenneutralisierung) · **#98** (Understanding-Forensik + Feldbug-Fix + gated Recovery-Pfad) · **#99/#100** (Recovery-Action `workflow_dispatch` registriert) |
| Migrationen live (neu) | `20260718` (`source_crawl_telemetry`) · `20260719` (`pipeline_locks` + atomare Lock-Funktionen) |
| Flags live seit 2026-07-16 18:06 UTC | `HELMUT_ATOMIC_LOCK=on` · `HELMUT_UNDERSTANDING_LOCK=on` · `HELMUT_SOURCE_TELEMETRY=on` (= FT2-1…FT2-3) |
| Production-Beweise | `docs/betrieb/production_beweisprotokoll.md` — 3 echte Crawls + voller Morgenzyklus; Locks live gefangen (inkl. gleichzeitiger Haltung), je Crawl 145 Telemetrie-Zeilen, echte Laufzeiten (183/170/170 s), 0 neue `systemErrors` |

**1 · Thread-2-Härtung (PR #95, deployt).** Alle Audit-Aufgaben P0-1…P0-5(Stufe 1)
und P1-1…P1-9 sind im Code umgesetzt; Erledigungsstand je Aufgabe:
`docs/helmut_datenmotor_thread2_handoff.md` §0a. In Production **wirksam**:
Laufzeitmessung, Fehler-Sammler, atomare fail-closed Locks, Quellen-Telemetrie,
ehrlicher Durchsatz, ausgebauter Health-Report, Radar-Störungswahrheit,
Ebenen-Kanon. **Gebaut, aber bewusst AUS** (je eigene Freigabe): KO-Backfill-Lauf
(FT2-4), Zweitkanal/Meta-Heartbeat (FT2-5), `failed`-KO-Recovery (FT2-6),
Understanding-Priorisierung (FT2-7), Crawl-Läufe relational + Retention (FT2-8).
Betriebsbefunde aus den Beweisläufen: **B1** (Google-News-Rate-Limiting, transient,
erholt; latentes Klumpenrisiko) und **B2** (Understanding-Rückstand → Punkt 4).

**2 · Sprint 1 — Sicherheit & Mehrmandantenfähigkeit (PR #96, deployt).**
App-seitige Tenant-Guards vervollständigt + Cross-Tenant-Write-Guard; atomarer
**Per-Mandant-Kostendeckel** (`HELMUT_TENANT_LLM_CAP`, Default AUS, nutzt die
vorhandene Reservierungs-Funktion, keine neue Migration); **idempotente
Zweitmandanten-Provisionierung** mit Rollback, Teardown-Isolation und
datengetriebenem Schutz bestehender Mandanten; DSGVO-Nachbesserung
(E-Mail-Maskierung im Provisionierungs-Protokoll); adversariale Review (3 echte
Funde behoben, u. a. Kontoübernahme-, Teardown-Kollateral-, Eviction-Bug).
DB-Härtungs-Migration `20260721` (Advisor-Fixes) **vorbereitet, NICHT angewandt**.
Doku: `docs/sprint1-sicherheit/01-zugriffsmatrix.md`, `02-zielarchitektur.md`,
`03-qualitaetskontrolle-und-freigabe.md`. Offline-Suite 120/120.

**3 · Mandantenneutralisierung (PR #97, deployt).** Kein bevorzugter/Pilot-/
Default-/Fallback-Mandant mehr — weder im Code noch als Env-Variable. Nutzeranfragen
und Crons beziehen ihr Mandat ausschließlich aus den **aktiven DB-Mandaten**
(`resolveActiveTenant`/`resolveCronTenants`); mandantenbezogene Crons laufen je
Mandat isoliert (try/catch + Zeitbudget); vollständige Cron-Inventur und
0/1/n-Mandanten-Verhalten: `docs/multitenancy-pilot-neutralisierung.md`. Tests
ausschließlich mit künstlichen Identitäten + Beweis-Suite für Mandantenneutralität;
Doku/Assets von Pilot-Bezügen bereinigt. Damit sind FA-4 (Morgen-Push alle Profile)
und FA-13 (keine Mandanten-Env) gegenstandslos bzw. erledigt; offen bleibt nur die
**Daten-Hygiene** (zwei Demo-Mandate deaktivieren, Restliste OP-04).

**4 · Understanding-Forensik (PR #98).** Befund B2 vollständig aufgelöst
(`docs/betrieb/understanding_rueckstand_analyse.md`, rein lesend): **kein laufender
Datenverlust** (alle Rohdokumente seit 04.07. verarbeitet); der Rückstand ist ein
**eingefrorener Alt-Bestand** (50 `pending` vom 02./03.07. + 2 `failed`), Ursache
ist das recency-begrenzte `skipped-no-cluster`-Fenster — **nicht nur Rauschen**:
~8 kernmandatsrelevante Fälle + 2 `failed` sind blockiert, die Seed-Rohdokumente
existieren noch (Verlust aktuell reversibel; wird permanent bei Retention-Löschung).
Der aktive **Feldbug** (`source_document_count` immer 0 im Lazy-Pfad) ist gefixt
und deployt (null Runtime-Wirkung, Pfad Default AUS).

**5 · Vorbereiteter Recovery-Pfad (PR #98–#100, NICHT ausgeführt).** Trockenlauf
bestätigt **6 netto-neue, eindeutig/wahrscheinlich rekonstruierbare Fälle**
(`docs/betrieb/understanding_recovery_trockenlauf.md`); echter Pfad ist verdrahtet,
aber **doppelt gesperrt** (Flag `HELMUT_RECOVERY_EXECUTE` Default AUS + Token
`RECOVER_6_CONFIRMED`), eng begrenzt (6er-Allowlist, ≤ ~6 KI-Calls, additiv,
Rollback-Kennung) und als GitHub-Action `understanding-recovery.yml` **nur** per
`workflow_dispatch` startbar (Schritt A immer read-only). Ausführung =
freigabepflichtig (Restliste OP-05); bis dahin **keine Retention-Löschung** der
02./03.07.-Rohdokumente.

**Betrieb unverändert:** Quellen **on** · Gate **shadow** · PARDOK **shadow** ·
Scoring **off** · BE/BB **inaktiv** · Budget 100/Reserve 30/fail-closed/Locks an.

---

## NACHTRAG 2026-07-17 (Mandantenneutralisierung — Hinweis)

- Diese Doku-Serie ist vom realen Pilotmandanten anonymisiert: technische Stellen
  verwenden die Platzhalter `<pilot-mandats-id>` (Pilot) bzw. `<demo-mandant-b>`/
  `<demo-mandant-c>` (Testprofile); in Prosa steht „der Pilotmandant".
- Das persönliche Quellenpaket folgt seit der Mandantenneutralisierung der Konvention
  `profil-<mandats-id>` (`profile-packages.personalPackageKeyFor`); die Personenquelle
  entsteht zur Laufzeit dynamisch als `<mandats-id>-news`. Der Code-Seed enthält
  **keine Personenpakete mehr** — bestehende DB-Zeilen (inkl. des persönlichen Pakets
  des Pilotmandanten) bleiben unverändert.
- Referenz: `docs/multitenancy-pilot-neutralisierung.md` (kein bevorzugter/
  Pilot-/Default-Mandant; Nutzeranfragen und Crons beziehen ihr Mandat aus den
  aktiven DB-Mandaten — ohne mandantenspezifische Env-Variable; Provisionierungs-
  Schutz datengetrieben statt Namensliste).

## NACHTRAG 2026-07-15 (Technische Rest-PRs: Watchdog-Timeout + Radar-Störungswahrheit live) — historisch (überholt durch Nachtrag 2026-07-17 oben)

| Was | Wert (live verifiziert) |
|---|---|
| Production-Commit | **`b9e9816`** |
| Production-Deployment | **`dpl_EwJTdX3oVTsUmX1jfQ4wKMpijDKQ`** (READY, target=production) |
| Rollback-Referenz | `dpl_4ykmhzT5ywpUnFjMC5YEm2VzMSxC` (15b3303, vor Radar) · `dpl_FHhkVVPtr7y6GrcU8uGHoUwF9dTE` (fe7078c, vor Watchdog) |

**PR 87 (Watchdog-Timeout) ✅ gemerged + live (`15b3303`).** Client-Timeout 120→330 s,
neuer rein lesender `/api/cron/pipeline-status` (auth-gated 403 ohne Secret), vier
ehrliche Endzustände, Doppel-Trigger-Schutz. Cron-Schedule unverändert (`30 5 * * *`).
Nachweis: kontrollierter Workflow-Lauf **#19 grün** — realer ~200-s-Pipeline-Lauf →
`Watchdog OK — Pipeline ok (successfulSources=145, understanding.processed=43)` (der
alte 120-s-curl hätte hier falsch „nicht ausgeführt" gemeldet; Läufe #18/#13 mit
Altcode schlugen fehl). Tests: watchdog 17/17 + Offline 93/93.

**PR 88 — nur der Radar-Teil isoliert gemerged (PR 89, `b9e9816`); Monitoring-Teil bleibt OFFEN.**
PR 88 war breiter als „Radar-Störungswahrheit" (15 Dateien, u. a. NEUER 06:30-UTC-Cron
`health-watch.yml`, Audit-Log, Health-Report-Ausbau, 2 Persistenz-Bugfixes). Auf
Gründer-Entscheid wurde **ausschließlich** der Radar-Commit `3c0e882` per Cherry-Pick
auf Main gebracht (client.js `radarDisruption()`, radarState `pickPrimarySource`-Fallback,
server.js `MENTION_CAP`-Kopplung, styles.css, Radar-Tests). Der **Monitoring-Commit
`fa7d528` bleibt in PR 88 offen** (kein neuer Cron, kein Audit-Log in Production).
Radar-Verhalten: `store-error/v3-store-disabled` → ehrliche Störung, `keine-vorgaenge` →
„Noch keine Datengrundlage", `keine-treffer` = ruhiger Tag; Refresh-Fehlschlag zeigt
ruhige Hinweiszeile mit letztem Stand. Tests: radar-state 113/113, radar-ui 26/26,
Browser-Smoke 21/21.

**Betrieb (nach beiden Merges):** 0 neue 5xx/Runtime-Fehler, 0 Systemfehler heute.
Budget **100 / Reserve 30 / fail-closed / Lock** unverändert wirksam; Zähler **8/100**,
Kosten **$0,1037** (< $0,50/Tag). Quellen **on** / Gate **shadow** / PARDOK **shadow** /
Scoring **off** / BE+BB **inaktiv** — unverändert. Pilotmandant: Store present, **10 Briefings**.

**Offen bleibt (Freigabepunkt):** der Monitoring-Härtungs-Teil aus PR 88 (`fa7d528`):
Wächter-Wächter-Cron `health-watch.yml` (06:30 UTC), Audit-Log an Admin-/Debug-Routen,
Health-Report-Ausbau, `compactStore`/`normalizePoliticianStore`-Persistenz-Bugfixes,
`reset-llm-budget`-Ehrlichkeit. Braucht eine eigene Cron-Freigabe.

---

## NACHTRAG 2026-07-15 (F12 FINAL: Understanding-Reserve + Lock live verifiziert)

Gründer hat `HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1`
manuell in Vercel gesetzt und das Production-Deployment neu deployt. Finale
Verifikation durchgeführt — **alles grün, keine Abweichung**.

| Was | Wert (live verifiziert) |
|---|---|
| Production-Commit | **`e915080`** (unverändert; die Env-Werte brauchten keinen Code-Change) |
| Production-Deployment | **`dpl_ruEJ3xPBf2iWiFGygR96Lmb93uEk`** — READY, `target=production`, `action=redeploy` von `dpl_715BHZo25DXQ3sZ9HAuJvmQ593aD` |
| Effektive Werte | Deckel **100** · Reserve **30** · Nicht-Understanding-Deckel **70** · Understanding-Deckel **100** · Fail-closed **1** · Understanding-Lock **an** |
| Grenzfall isoliert (Wegwerf-Scope, 0 bezahlte Calls) | Nicht-Understanding (Deckel 70): **exakt 70 erlaubt, 71. blockiert**. Danach Understanding (Deckel 100): **exakt 30 weitere (70→100)**, 101. blockiert. **max used = 100, Zähler endet exakt bei 100, nie 101.** |
| Understanding-Lock | Code erzwingt `granted=false → skip` (understanding.js:664/753, beide Batch-Pfade); lokaler Determinismus-Test: 2. überlappender Lauf `granted:false` (mit Flag), No-op ohne Flag. |
| RPC-Nutzung / kein Fallback | Realer Production-Call **12:37:14 UTC → `global used=1`** (atomar). Kein „RPC fehlt"-Log, **kein PGRST202/404**, 0 error/warning-Logs in 25 min (Redeploy-Fenster). Redeploy fährt denselben RPC-aufrufenden Code — Atomik bleibt aktiv. |
| Keine Überbuchung | Row-Lock serialisiert (früher: Burst 10 parallel @ Deckel 5 → exakt 5). Isolierter 100er-Deckel nie überschritten. |
| Betrieb | 0 Systemfehler heute, 0 neue Runtime-Fehlercluster ab 12:32; Shell 200 + Asset `e9150801`; Daten unverändert (findings 990 / KO 274 / raw 5462 / gate_shadow 2043). |
| Pilotmandant / Quellen | Pilot-Store present, **4 Briefings**; Quellenmodus **on**, Gate **shadow**, PARDOK **shadow** (helmut-flags.json byte-identisch), Scoring **off**, BE/BB **inaktiv**. |
| Kosten heute | **33 billable Calls / $0,0838** — deutlich < $0,50/Tag. |
| Methoden-Hinweis (ehrlich) | Vercel-Env-Werte selbst nicht separat rückgelesen (in dieser Umgebung keine Env-Lesefähigkeit) — Wirksamkeit ist durch Redeploy-READY + exakte Wirkungstests (Reserve 70/30/100, Lock granted:false) belegt. Tab-Funktionen (Lage/Radar/Briefing/Büro/Admin) sind auth-gebunden nicht eingeloggt durchklickbar — bestätigt über Datenintegrität, App-200, 0 Fehler und die additive DB-only-Natur der Migration (keine Regressionsfläche). |

Der volle „≤100 pro UTC-Tag"-Deckel greift kalendertagsgenau ab **morgen 00:00 UTC**
(Zähler zählt vorwärts ab Aktivierung; heute steht er bei 1). **Nächster Schritt: Go PR 84.**

---

## NACHTRAG 2026-07-15 (F12: Migration atomare LLM-Budget-Reservierung LIVE) — Migrationsschritt (durch F12-FINAL oben ergänzt)

| Was | Wert (live verifiziert via Supabase + Vercel-API, read-only) |
|---|---|
| Migration F12 | `20260717_llm_budget_reservation.sql` in Production eingespielt (Registry-Version `20260715123216`, **genau einmal**). Tabelle `llm_budget_counters` (PK day,scope) + Funktion `helmut_reserve_llm_call(text,text,integer)` **INVOKER**, EXECUTE für public/anon/authenticated **entzogen**, RLS **an**, 0 Policies (service_role-only) — alles per Nachprüfung bestätigt. |
| Atomik **LIVE** | Belegt durch **realen** Production-Call um 12:37:14 UTC → `llm_budget_counters(2026-07-15, global) used=1`; kein „RPC fehlt"-Fallback-Log mehr, kein Fehler. Der 100er-Deckel ist ab jetzt **hart + parallelsicher** (Row-Lock; Burst-Test 10 parallel bei Deckel 5 → exakt 5, nie 6). |
| Kontroll-Test (0 bezahlte Calls) | Wegwerf-Scopes (Tag 2000-01-01): cap2 (t,1)(t,2)(f,2) · cap0 (f,0) · cap1 (t,1)(f,1) · no-limit immer erlaubt; alle Testzeilen wieder gelöscht. Lokale Suite `test:llm-reservation` 38/38. |
| Budget-Env | `HELMUT_MAX_LLM_CALLS_PER_DAY=100` + `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` weiter live. **NOCH OFFEN (Gründer-Dashboard-Schritt, Vercel):** `HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1` + Redeploy → erst danach greifen Understanding-Reserve (Büro/Lage/App-Start max. 70) und der Doppel-Call-Lock. Solange Reserve=0 (Default): globaler harter 100-Deckel für ALLE Pfade, ohne Understanding-Vorrang. |
| Prod-Smoke nach F12 | Shell 200 + Asset `e9150801` **unverändert** (Build unberührt — Migration ist DB-only), Auth-Gate aktiv (403 unauth), **0 Systemfehler heute**, **0 neue Runtime-Fehlercluster ab 12:32** (alle 50 Cluster = bekannte Google-News-429/503 aus dem 10:00-Crawl, extern/fail-safe). |
| Admin-Kostenwahrheit | Audit-Log (`llmUsage`) heute: **33 billable / 1 skipped / $0,0838** — unverändert korrekt als Tages-Kostenanzeige. Der atomare Zähler zählt bewusst **getrennt vorwärts ab Aktivierung** (Design: Supabase-Zähler wird nicht rückwirkend geseedet) → voller UTC-Tagesdeckel greift ab **morgen 00:00 UTC**; heute Restrisiko praktisch null (Morgen-Crons bereits gelaufen, Zähler bei 1). |
| Rollback | `20260717_llm_budget_reservation_rollback.sql` (drop function+table; App fällt **geloggt** aufs Altverhalten zurück, **kein Deploy nötig**). Env-Rollback: die zwei neuen Variablen entfernen + Redeploy. |
| Nächste Freigabe | Gründer setzt die 2 Env-Variablen + Redeploy (2-Minuten-Dashboard-Schritt; ich habe keine Vercel-Env-Schreibfähigkeit in dieser Umgebung) → dann verifiziere ich die Understanding-Reserve live. Danach **Go PR 84** (migrationsfreie Code-Ehrlichkeits-Fixes). |

Der Schritt-B-Abschnitt unten ist damit historisch (seine Budget-Zeile „inert bis Migration F12" ist durch diesen F12-Nachtrag überholt).

---

## NACHTRAG 2026-07-15 (Schritt B: PR 86 live) — vorheriger Stand (Budget-Zeile durch F12 oben überholt)

| Was | Wert (live verifiziert via Vercel-API, GitHub-API, Supabase read-only) |
|---|---|
| Production-Commit (main) | **`e915080`** — Squash-Merge PR #86 (Budget-Race atomar + Härtung) auf `3875674` (PR #85) auf `170d310` (PR #82 + Budget-Rollout) |
| Production-Deployment | `dpl_715BHZo25DXQ3sZ9HAuJvmQ593aD`, READY, Asset-Version `e9150801` live bestätigt |
| Rollback | Vercel Instant Rollback auf `dpl_9NaaV71MBFaJV9BHiMye4AU43kQN` (`3875674`, Stand nach PR 85) bzw. Revert des Squash-Commits |
| Quellenmodus | **on** (relational aktiv, Alt-Katalog Fallback) · Gate **shadow** · PARDOK **shadow** · Scoring **off** · BE/BB **inaktiv** (0 Dokumente, verifiziert) |
| Budget | `HELMUT_MAX_LLM_CALLS_PER_DAY=100` + `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` wirksam. Atomare Reservierung deployt, aber **inert bis Migration F12** — RPC/Tabelle fehlen (verifiziert), Code fällt sicher aufs bisherige Read-then-Decide-Gate zurück (fehlende Migration löst NICHT fail-closed aus). Reserve 30 + Understanding-Lock noch NICHT gesetzt. |
| Merge-/Prod-Smoke | Suite 91/91 + Browser 21/21 auf `b28d0c2`, CI grün; adversariale Deckel-Prüfung 38/38 (Stand 99/Limit 100, 50 parallel, Reserve 30). Nach Deploy: Shell 200 + Asset-Version `e9150801`, Auth-Gate 401, 0 neue Systemfehler, Datenstand unverändert (5462/274/990/2043), Pilotprofil + 4 Briefings vorhanden, BE/BB/PARDOK 0 |
| Offene PRs | **PR 84** (Rest-Fixes der Tiefenprüfung: Parlaments-Gate, tote Deck-Buttons, Privacy-Ehrlichkeit, Debug-POST, Mandatsebene, SW-Update — auf `e915080` rebased, Duplikate entfernt, 92/92, **mergebereit, NICHT gemergt**) · **PR 87** (Watchdog, unabhängig, ungeprüft in diesem Auftrag) |
| Nächste Freigabe | **Migration F12** (`supabase/migrations/20260717_llm_budget_reservation.sql` einspielen → dann `HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1`) ODER **Go PR 84** (reine Code-Ehrlichkeits-Fixes, migrationsfrei) — Reihenfolge nach Gründer-Wahl |

Der Abschnitt unten (Stand 2026-07-14) bleibt als historischer Detailnachweis.

---

**Hinweis 2026-07-17:** Die aktuelle Statuswahrheit ist der **oberste Nachtrag
(2026-07-17, Konsolidierung)**; die einzige verbindliche Liste offener Punkte ist
`docs/datenmotor-restliste.md`. Der folgende Satz gilt historisch für den Stand 2026-07-14.

**Dies ist die EINZIGE aktuelle Statuswahrheit (Stand 2026-07-14).** Alle älteren Status-/Abschlussberichte —
insbesondere Doku 20–27 und frühere Master-Status-Fassungen — sind **ÜBERHOLT** und dürfen
nicht mehr als aktueller Stand zitiert werden; sie bleiben historische Detailnachweise.
Konsolidiert am **2026-07-14 (abends, nach Diagnose- und Shadow-Deployment + Quellenmodus-Bau)**
aus Repository, Production-DB (read-only), Vercel-API und Thread-Verlauf.

## 1) Deployments & Commits (verifiziert via Vercel-API + git)
| Was | Wert |
|---|---|
| Production-Commit (main) | **`35384f5`** — Merge PR #78 (Gate-Shadow + PARDOK-Shadow per Datei-Flag) |
| Production-Deployment | `dpl_5FTcCGDQbxNb4yKhB8X55hT9rRNq`, READY, `helmut-pilot.vercel.app` |
| Rollback-Kette | `7a27f5b` (PR #77 Admin-Diagnose, `dpl_3wuS8ivWMrTHpEg4npZZChZsauRx`) → `6539fbf` (PR #76 Briefing-Reiter) → `9685a0b` (PR #75 Quellenarchitektur, Guards off) → `74ae2a6` (Alt-Stand) |
| Feature-Branch | `claude/helmut-source-architecture-ruhyvb` (main + Quellenmodus/Cutover-Bau, ungemergt) |
| Crons (vercel.json, unverändert) | crawl 04:00+20:00 · morning-briefing 05:00 · understanding 05:30+21:30 · health 06:00 · lage-check 10:00 · pipeline 16:00 · lage-briefing 05:45 (UTC) |

**Live in Production:** Quellenarchitektur-Codebasis (Quellen-Guards off), evidenzbasierte
Radar-Beleglogik, ai.js-Parserfix, Reiter „Briefing", **Admin-Konfigurations-Diagnose**
(System & Sicherheit, 7 Variablen mit Quelle Env/Datei/Default), **Gate-Shadow + PARDOK-Shadow**
(seit `35384f5`, ~17:57 UTC, per `helmut-flags.json`).

## 2) Die 7 Helmut-Konfigurationen (Stand nach PR #78)
Präzedenz: **Vercel-Env > helmut-flags.json (Datei-Flag) > Code-Default.** Eine gesetzte
Env-Variable überstimmt die Datei immer (Betreiber-Kontrolle; Rollback ohne Deployment möglich).

| Variable | Env (Production) | Datei-Flag | wirksam |
|---|---|---|---|
| HELMUT_UNDERSTANDING_GATE | nicht gesetzt (erwartet, Prüfung via Live-Diagnose) | **shadow** | **shadow** — blockiert NICHTS, schreibt nur Telemetrie |
| HELMUT_PARDOK_DISPATCH | nicht gesetzt (erwartet) | **shadow** | **shadow** — konstruktionsbedingt wirkungslos (0 structured_download-Quellen im Live-Katalog) |
| HELMUT_MAX_LLM_CALLS_PER_DAY | **gesetzt** (Preview zeigte 20; Prod-Wert via Live-Diagnose ablesen) | bewusst NICHT dateisteuerbar | endlicher Deckel aktiv, **unverändert** |
| HELMUT_V3_STORE | gesetzt = 1 (Verhalten + Preview) | — | an (bleibt an) |
| HELMUT_SCORING_MODE | nicht gesetzt | — | off (Alt-Ranking byte-identisch) |
| HELMUT_V3_SHADOW_COMPARE | nicht gesetzt | — | aus |
| HELMUT_PROFILE_DB_MODE | nicht gesetzt | — | aus (Blob-only) |
| (neu) HELMUT_SOURCE_MODE | nicht gesetzt | **nicht gesetzt** | **off** — alter Katalog ist aktive Quellenwahrheit |

**Einziger offener Konfigurationspunkt:** exakter Production-Wert des Tageslimits. Er ist
jetzt direkt in der Live-Diagnose ablesbar (Admin → System & Sicherheit). Erst nach dieser
Ablesung + Dokumentation als Rollback-Wert darf auf 150 erhöht werden (Vercel-Dashboard;
Grenzen: ~100 Understanding + Spielraum, ~$8–10/Monat, Stop >$0,50/Tag, NIE unbegrenzt).

## 3) Gate-Shadow + PARDOK-Shadow (Phase 4 — AKTIV seit 35384f5)
- Gate-Shadow: berechnet je Understanding-Cluster die Entscheidung, **blockiert nichts**
  (Integrationstest: off/shadow/on identische Call-Zahlen) und schreibt je Dokument eine
  Zeile nach `gate_shadow_events` (nur Signale/IDs, kein Volltext; doppelt fail-safe).
- PARDOK-Shadow: nur relevant für `structured_download`-Quellen — davon sind **0** im
  aktiven Katalog. Kein Fetch, kein Write, kein sichtbares Item, bis BE/BB (eigene
  Freigabe) Wege in den Plan brächte. Shadow-Datei-Ablage zusätzlich gegen read-only-FS
  gehärtet (Fehler brechen den Crawl nie).
- **Messfenster:** Crawl-Cron 20:00 UTC (PARDOK-Negativ- und Fehlerprüfung), Understanding-Cron
  21:30 UTC (`gate_shadow_events` muss wachsen, Understanding-Zahl darf nicht sinken).
  Selbst-Check-ins sind für 20:12 und 21:45 UTC geplant; Ergebnisse werden hier ergänzt.
- Offline-Messung (bereits erbracht, Doku 21): Gate-Kalibrierung gegen echte Produktionsdaten,
  107→0 kritische Fehlentscheidungen, amtliche Dokumente nie geparkt, kuratierte Feeds nie geparkt.
- **Historischer Replay (P6, 2026-07-14 ~18:50 UTC, `scripts/gate-shadow-replay.js`):** exakter
  Production-Shadow-Pfad über 2064 echte Dokumente (7 Tage) → 206 Cluster: 31 verstehen /
  88 zurückstellen / 87 parken (Dok-Ebene: 948/652/464). ALLE Prüfpunkte grün: nichts
  blockiert, keine amtliche Quelle geparkt, kuratierte nie geparkt, regionale Quellen nicht
  benachteiligt (Park-Rate 0% vs. 40,9% überregionale Medien; n regional=1 — Regionalwege
  liefern derzeit wenig), keine BE/BB-Dokumente im Bestand, Telemetrie wohlgeformt ohne
  Volltext, 0 LLM-Kosten. Ersparnispotenzial bei späterem Gate-on: ~54% der Dokumente.
- **Isolierter PARDOK-Shadow-Lauf (P6):** Parser über Gold-Fixtures im Shadow-Modus —
  be-plenum 8/8 geparst (8 externe IDs), bb-plenum 6/7 (1 bewusst defekter Datensatz),
  0 Pipeline-Items, keine Fehlerseite, 6–10 ms, ~5 MB Heap, isolierte Ablage ok.
- **ERSTER ECHTER PRODUCTION-SHADOW-MESSLAUF (20:00-UTC-Crawl, Bericht 20:01:45, 1353 ms, +$0):**
  Alt-Plan real: 149 Wege, 149 erfolgreich, 0 Fehler, 1745 Dokument-Kandidaten. Relational
  zugerechnet: 138 Wege (137 im Lauf), 0 Fehler, 1601 Kandidaten = **91,7 % Abdeckung**;
  die Differenz sind exakt die 6 profilgenerierten Personensuchen des Pilotmandanten (bleiben im ON-Modus
  erhalten — mergeProfileAndPlanSources) + die 6 defekten Wege (heute 0 persistierte neue
  Docs — kein Ertragsverlust). nurRelational: +1 funktionierender Weg
  (region-braunschweig-arbeit-soziales). Dedup-Dry-Run: 1601 Kandidaten → 1465 eindeutig,
  136 Duplikate (8,5 %), 1601 Fundstellen. Aktivierung: 3 Profile → 5 Pakete
  (inkl. die-linke-bund refCount 1); BE/BB prepared/inactive. Kein Nutzerpfad-Write
  (document_findings weiter 0), +62 normale neue raw_documents, 0 BE/BB/PARDOK,
  0 Runtime-Fehler.
- **gate_shadow_events LIVE: 500 Zeilen ab 20:02:58 UTC** (Crawl-eager-Pfad): 352 verstehen /
  147 zurückstellen / **1 parken** (fraction-fdp, „kein-politisches-signal") über 500
  distinct Dokumente; **0 amtliche geparkt, 0 kuratierte geparkt**; Tiers 441 kuratiert /
  49 medien / 10 amtlich. **Befund (Bestandsverhalten, kein neuer Fehler):** der
  eager-Crawl-Pfad clustert den Tagesbatch per Anker-Schneeball zu EINEM Riesen-Cluster →
  alle Zeilen tragen vorgang_id „vg-bundestag", und die 500-Zeilen-Leitplanke griff
  (Stichprobe statt Vollerhebung). Per-Dokument-Entscheidungen bleiben valide (dokumentweise
  berechnet). Der dedizierte 21:30-Cron (runPendingUnderstandingShadow) arbeitet
  vorgangsweise — saubere vorgang_ids dort werden um 21:45 UTC verifiziert.
- **21:30-UTC-Understanding-Cron (Auswertung 21:45):** gate_shadow_events **+500 → 1000 gesamt**
  (Verteilung des Laufs: 345 verstehen / 153 zurückstellen / 2 parken); **0 amtliche
  Dokumente falsch behandelt** (über alle 1000 Events). Understanding heute 15 = exakt
  Ø-Normalbereich (NICHT gesunken); 9 neue KO-Vormerkungen ohne KI-Call; 41×
  skipped-understanding-budget stammen vom BESTEHENDEN Tagesdeckel (Bestandsverhalten,
  Begründung für Phase 4B) — das Gate blockierte nichts. Pilotmandant: Lesepfad unverändert,
  Briefing 05:45 erzeugt, 0 sichtbare Abweichung. 0 Runtime-Fehler (4-h-Fenster über
  beide Crons). document_findings weiter 0, BE/BB/PARDOK weiter 0.
- **Telemetrie-Qualitätsbefund (Folgearbeit, KEIN Cutover-Blocker):** auch der 21:30-Pfad
  clustert den Batch per Anker-Schneeball zu EINEM Riesen-Cluster (alle 500 Zeilen eine
  vorgang_id, 500er-Kappung = Stichprobe). Per-Dokument-Entscheidungen bleiben valide;
  der Quellen-Cutover berührt das Gate nicht. Empfohlene Folgearbeit: vorgang_id je
  Dokument aus dessen Einzel-Anker ableiten + Kappung dokumentierend loggen.
- Kosten heute (Endstand): **$0,0654** / 36 billable Calls; Shadow-Zusatzkosten $0.
- **Rollback:** `helmut-flags.json` auf `off` + Deploy, ODER Vercel-Env `off` + Redeploy
  (überstimmt sofort), ODER Instant Rollback auf `7a27f5b`.

## 4) Quellenmodus (P7 — gebaut; **shadow AKTIV seit `0159ae6`**, 2026-07-14 ~19:09 UTC)
`HELMUT_SOURCE_MODE` (off/shadow/on, via Flag-Resolver; `source-mode.js`):
- Ausgangswert (dokumentierter Rollback): **nicht gesetzt = off** (weder Vercel-Env noch
  Datei). Rollback: Flag-Zeile entfernen/`off` + Deploy oder Vercel-Env `off` + Redeploy.
- **shadow (AKTIV, Gründer-Freigabe):** alter Katalog bleibt die sichtbare Quellenwahrheit
  (Quellenliste byte-identisch); nach jedem echten Crawl misst ein fail-safe Block den
  relationalen Plan gegen die REALEN Ergebnisse desselben Laufs (keine Extra-Fetches,
  kein LLM, $0, kein Nutzerpfad-Write) → Console-Log `[source-mode:shadow]` + kompakter
  Auth-Store-Eintrag `sourceModeShadowLastRun` (Admin-Panel). Erster Messlauf: Crawl-Cron
  20:00 UTC; Auswertung per Wake-up 20:12 UTC.
- **on (= QUELLEN-CUTOVER, nicht aktiviert):** relationale DB (publishers/retrieval_paths/
  source_packages/package_paths) wird aktive Quellenwahrheit; alter Katalog bleibt Fallback
  (Ladefehler/leerer Plan). Profile werden über Pakete versorgt (Resolver + Referenzzählung);
  jeder Abrufweg läuft global genau EINMAL; ohne aktivierungsberechtigte Profile nur
  always_on-Kernwege; BE/BB hart gesperrt; dev_only/pausierte/Orphans nie; defekte Wege ohne
  Abruf; DIP unverändert eigener API-Pfad; Dedup-Schreibpfad (unten) aktiv.

## 5) Alter vs. relationaler Plan (P8 — realer Vergleich, Production-Snapshot 2026-07-14)
- Wege gesamt 163 · **relational aktiv 138** · defekt 6 · ausgeschlossen 19 (18 BE/BB + DIP separat)
- Alt-Plan 143 geteilte Quellen; **Ertragsabdeckung 100%**: alle Altquellen mit realem
  30-Tage-Ertrag (4736 Dokumente, 866 KO-Kandidaten) sind im relationalen Plan abgedeckt;
  **0 fehlende Wege mit Ertrag.** Die 6 „fehlenden" Altquellen sind exakt die 6 defekten
  (bot-gesperrten) Wege mit 0 Ertrag (bundestag/bundesregierung/die-linke/linksfraktion/
  ausschuss-arbeit-soziales/dgb) — Ersatz über Google-News-Wege vorhanden und aktiv.
- Pilot-Pakete: bund-basis 51 aktiv · arbeit-und-soziales 82 · regional-niedersachsen 4 ·
  profil-<pilot-mandats-id> 1 · die-linke-bund 1 (nach Paketfix, s. u.). Aktive Profile: 3
  (<pilot-mandats-id> + 2 Testprofile <demo-mandant-b>/<demo-mandant-c>), aktive Pakete: 5.
- **Behobener Paketfehler (sicher, additiv):** die-linke-bund enthielt nur die 2 defekten
  Original-RSS-Wege → `rp-fraction-linke` (funktionierender Fraktions-Suchweg) zusätzlich
  zugeordnet (Seed-Regel + 1 additiver `package_paths`-Link in Production;
  Rollback: `DELETE FROM package_paths WHERE package_id='pkg-die-linke-bund' AND retrieval_path_id='rp-fraction-linke'`).
- Live-Fetch aus der Arbeitsumgebung ist netzwerkseitig gesperrt; der Ausführungsnachweis
  läuft ehrlich über die echten 30-Tage-Erträge (identische Abruf-URLs via legacy_source_id).

## 6) Dedup + Fundstellen (P9 — Schreibpfad gebaut, Cutover-only; Messung real)
- Reale 14-Tage-Messung (5242 Docs): URL-Duplikate ≈ 0 (content_hash-Dedup wirkt);
  **191 Titel-Duplikatgruppen (308 Überschuss-Docs ≈ 5,9%)**, 21 Gruppen über mehrere
  Abrufwege; nur **4 Gruppen** erzeugten doppelte KOs (vorgang-Dedup fängt das meiste).
- Cutover-Schreibpfad `persistRawDocumentsDeduped` (NUR Modus on): 1 Artikel über n Wege →
  1 raw_document + n `document_findings`; Bestands-Match über content_fingerprint/
  canonical_target_url; finding_count-Pflege; Google News bleibt Suchweg (Herausgeber-
  Domain trägt Identität, Proxy-URL bleibt Fundstelle); unterschiedliche Vorgänge werden
  nie zusammengelegt (Titel-Ähnlichkeit nur je Herausgeber + Datumsfenster).
- In Production heute: `document_findings` 0 Zeilen, Fingerprint-Spalten unbefüllt — Befüllung
  beginnt erst mit dem Cutover.

## 7) Datenbank-Ist (Production, read-only 2026-07-14 ~17:35 UTC)
raw_documents **5242** · knowledge_objects **247** · briefings **7** · decisions **86** ·
mandate_profiles **1** · ko_document_links **1147** · gate_shadow_events **0** (Wachstum ab
21:30-Cron erwartet) · document_findings **0** · BE/BB-Pakete **prepared**, 19 Wege
needs_review+manual · Migration-Registry 12 Einträge, **keine Migration offen**; einzige
Datenänderung seit letzter Konsolidierung: der additive package_paths-Link (§5).

## 8) Verbindlich AUS (bis je eigene Freigabe)
Quellenmodus **on** (= Cutover, ~~einzige noch offene Freigabe~~ **erledigt 2026-07-15, siehe Re-Anker-Banner**) · Gate **on** · Cheap-Triage ·
Scoring **on** · Berlin-/Brandenburg-Aktivierung · Bot-Quellen · Datenlöschungen ·
Cron-Änderungen · KO-Klassifikations-Backfill.

## 9) CUTOVER-PAKET (P14 — historischer Vor-Cutover-Snapshot, 2026-07-14)
> **[ÜBERHOLT — R2, 2026-07-22]** Dieser Cutover wurde am **2026-07-15 ausgeführt**
> (`HELMUT_SOURCE_MODE=on`). Der Abschnitt unten ist der **historische Plan von vor**
> der Ausführung; „offenes Gate" gilt **nicht mehr**. Siehe Re-Anker-Banner am Dateianfang.

**~~Nächstes und einziges offenes Gate: „Go Quellen Cutover?"~~ (erledigt 2026-07-15)**
1. **Exakte Änderung:** in `helmut-flags.json` eine Zeile ergänzen: `"HELMUT_SOURCE_MODE": "on"`
   → PR → Merge → Production-Deployment. (Env-Alternative: Vercel-Env `HELMUT_SOURCE_MODE=on`
   + Redeploy — überstimmt die Datei.) Der Feature-Branch enthält den kompletten Code bereits.
2. **Wirkung:** relationale DB = aktive Quellenwahrheit (138 Wege, global je einmal),
   alter Katalog = Fallback; Profile über Pakete; globale Dedup + Fundstellen aktiv;
   BE/BB bleiben gesperrt; Gate bleibt shadow; Scoring bleibt off.
3. **Production-Snapshot davor:** DB-Zählerstand (§7) + `git tag` des Prod-Commits +
   Vercel-Deployment-ID notieren (Instant-Rollback-Ziel).
4. **Erster begrenzter Lauf:** nächster 20:00/04:00-Crawl-Cron beobachten (kein manueller
   Massen-Crawl); Vergleich Dokumentzahl/Quellenabdeckung gegen Vortag.
5. **Smoke:** App-Start/Lage/Radar/Briefing/Büro/Admin unverändert · 0 neue Runtime-Fehler ·
   Admin-Quellenmodus-Panel zeigt on + Plan · raw_documents wachsen weiter (±Normalbereich) ·
   document_findings beginnen zu wachsen · KEINE BE/BB-Inhalte · Pilot-Briefing gefüllt.
6. **Pilot-Vergleich:** Briefing/Radar vor/nach Cutover — mindestens gleiche Versorgung
   (Referenz: 100% Ertragsabdeckung, §5).
7. **Kostenlimit:** unverändert (Tagesdeckel bleibt; Dedup REDUZIERT Understanding-Nachfrage).
8. **Stop-Bedingungen:** Dokumentzufluss bricht ein (> −50% vs. Vortag) · leere Briefings ·
   BE/BB-Inhalt sichtbar · neue Fehlerrate · Admin zeigt Fallback-Warnung dauerhaft.
9. **Rollback:** `HELMUT_SOURCE_MODE` löschen/`off` (Datei-Deploy oder Env+Redeploy) ODER
   Vercel Instant Rollback aufs Snapshot-Deployment; Daten: neue document_findings sind
   additiv und harmlos (kein Nutzerpfad liest sie vor dem Cutover).

## 10) Testabdeckung
62 Offline-Suiten grün (inkl. neu: flags 26 · source-mode 38 · gate-integration 14 ·
pardok-dispatch/smoke · dedup-findings 39 · admin-config-diagnose 27; ausgenommen wie immer
nur die 2 Live-LLM-Suiten). Adversariale Pflichtfälle abgedeckt: Profil ohne Pflichtpaket,
kein aktives Profil, 100 gleiche Profile, doppelte Wege/URLs, Google-News-Mehrfachfund,
defekte Pflichtquelle, Orphan, Testquelle, Paket pausiert, Profil deaktiviert, BE/BB
versehentlich aktiv (hartes Gate), Gate blockiert im Shadow (nie), PARDOK sichtbar (nie),
Fallback-Versagen (alter Katalog), Tenant-Isolation (322+104+37+70+28+30 Assertions).
