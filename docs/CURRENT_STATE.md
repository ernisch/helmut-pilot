# CURRENT STATE — Helmut

**Stand: 2026-08-19 (13:46 türkischer Zeit / 12:46 Berlin / 10:46 UTC).** OP-25/OP-31
bestanden; `HELMUT_VERSTEHEN_CAS` läuft (§7a). PR #256 (Reparatur Option B + D) und
PR #257 (gemischtes Neutralisierungsverfahren) sind **gemergt und deployt** (aktuell
`dpl_7DeB1qca…` READY auf exakt `fc9b611`). **Die 383 inerten Aufträge sind am 19.08.
~10:44 UTC NEUTRALISIERT** (Runbook §28.8): exakt 383 gelöscht (301 wartend + 82 laeuft
mit abgelaufener Lease), die 383 Outbox-Absichten über die bewiesene Kaskade mit entfernt,
die 235 Erledigten signaturgleich unangetastet. Warteschlange **0 / 235 / 0 / 0**,
Outbox **0**, Wache live `inaktiv-inert` mit `inert-bestand:0`. Der Motor bleibt **aus**;
die zwei CAS-Vorgänge sind `erneut`-freigegeben (§28.2). **Versuch 4 ist datenbankseitig
bereit, nicht aktiviert** (§28.6/§28.8).

Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000
Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die
vollständige Fassung vor dieser Verdichtung liegt verlustfrei in
[`archive/project_state/2026_08_17_CURRENT_STATE_full.md`](archive/project_state/2026_08_17_CURRENT_STATE_full.md).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `fc9b611`** = Merge **PR #257** am 2026-08-19: gemischtes
  Neutralisierungsverfahren + §28. Davor **PR #256** (`e43d306`): Blob-Entkopplung
  (Option B) + Slot-Quittung (Option D), Runbook §27; **PR #254** (`4072064`):
  Vollzugsbeleg der 524er-Neutralisierung (§26.7).
- **PR #253** (davor, `0d9cf62`) lieferte den **datensparsamen Neutralisierungsweg**
  (`lib/helmut/jobqueue-neutralisierung.js`, Riegel R1–R9, kein Export) und die
  **Warteschlangenwache V2** (`betriebsstatus`, `statusvertrag: 2`, Runbook §26.4).
- **PR #251** (`51d0e80`) bestätigte die Laufzeitinertheit der fünf Migrationen und
  ergänzte den Betreiberplan §25. Relevante Vorgänger: **#250/#249**
  Migrationsorganisation und Transaktionsschutz, **#248** CAS, **#247** Zielarchitektur.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40) und isolierter Restore seit 2026-07-28 geübt; RPO ≤ 24 h.
- **Mandate — eine Wahrheit (K2 erledigt 2026-08-06,
  [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9):** aktiv
  sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion, Nachweiswerkzeug und
  Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**; das K2-Gate meldet keinen Widerspruch.
  Insgesamt **9** Profile — deaktiviert sind `angela-merkel`, `james-brown`, `max-mustermann`
  **und `helmut-abnahme-berlin`**; OP-04-Rest; **0 Testmandate**.
- **Aufbewahrung Crawl-Läufe** (K3 erledigt 2026-08-06): `HELMUT_CRAWL_RUN_RETENTION=36`; Mindestbedarf bei n=5: 30.
- **Kapazität im Fenster real gelöst** (§7.7.6): crawl 04:00, Watchdog 08:03 und pipeline 16:00 je
  **6 von 6** Projektionen; der 16:00-Lauf endete nach ~4 min (Limit 270/280 s).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (2026-08-04: 155 `needs_review` / 4
  `broken` / 4 `healthy`); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht
  eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md):
  BLOCKIERT). Befund B1 (Google-Klumpenrisiko) besteht fort.
- **Crons (Production):** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning-briefing
  05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 · lage-check 10:00
  UTC · 2 Narrativ-Nachlaufslots 06:10/06:22, inert). **Dazu** der GitHub-Actions-Watchdog
  (`briefing-watchdog.yml`, täglich 05:30 UTC bedingungslos, oft 2–3 h verzögert): kein
  Störfall, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** die **fünf OP-30-Dateien sind am 15.08. angewendet** (§7a, Runbook §24.10;
  Einträge `20260815163732`–`20260815164241`). **Offen ist nur noch `20260720`** (OP-03).
  Die Strukturen des Schattenpfads (Outbox, Klassengrenzen, Anbietersteuerung) sind leer
  und wirkungslos, solange die Motor-Flags aus sind; die CAS-Tabellen werden seit dem
  17.08. produktiv genutzt (§7a).
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Nachweisfenster 0,1892 USD.
- **Zugangsgrenze jeder Claude-Sitzung (gemessen 2026-08-12, am 15.08. bestätigt):** Supabase
  lesend erreichbar, Deployments lesend über Vercel-MCP; **Vercel-Env weder lesbar noch
  setzbar**, `CRON_SECRET` nicht gesetzt ⇒ `/api/ops/jobqueue` fail closed. Flag-Zustände sind
  daher nur **wirkungsbasiert** prüfbar. Jede Flag-Aktivierung **und jeder Rückbau** ist
  Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Rotation Production-belegt 2026-08-03 ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.4/§14.5) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28, Auditpersistenz + Idempotenz belegt |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27, Dual-Write belegt (W-2 geschlossen) |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren (Token-belegt) |
| LLM-Tagesbudget 100 + Reserve 30 | fail-closed, live |
| **`HELMUT_VERSTEHEN_CAS=on`** | **seit 2026-08-17** (Betreiber). Atomarer Verstehensvertrag aktiv: ein Besitzer je Vorgang, at-most-once je Modellaufruf, monotones Fencing. Laufzeitgeprüft (§7a). **`HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt ⇒ Parallelität wirkt als 1**; > 1 ist eine eigene Freigabe (Runbook §23.1 Schritt 3) |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **`HELMUT_CRON_GLOBALABRUF`** | **`on`** seit 2026-08-06 ~08:15 UTC (Betreiber, für das Nachweisfenster) ⇒ **Kontextpfad aktiv**, laufzeitbelegt (drei Fensterläufe 06./07.08. global auf `d8bf68fa…`, E3 `nv=0`). Ob es `on` bleibt, ist Betreiberentscheidung. Dritter Zyklus |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **`HELMUT_SCALABLE_PIPELINE` (OP-30)** | **gelöscht (aus)** — erster Stufe-1-Anlauf 18.08. 16:15 UTC, Rücknahme 19.08. ~06:56 UTC (Ursache §27; Reparatur PR #256/#257 gemergt + deployt). **19.08. ~10:44 UTC: die 383 inerten Aufträge sind neutralisiert** (§28.8); Warteschlange **0/235/0/0**, Outbox 0. **Versuch 4 datenbankseitig bereit, nicht aktiviert** (§28.6) |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge; Code-Default wäre AUS). Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt); der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-17)

| PR | Tatsächlicher Diff | Aktueller Zustand |
|---|---|---|
| **#231** (Draft) | Konten-/Provisionierungs-Gates, Mehrmandantentest, Doku | konfliktbehaftet, Pflicht-CI/Vercel grün, keine Review |
| **#224** (Draft) | deterministische Lage-/Matching-Rangfolge, Tests, Doku | konfliktbehaftet, Vercel grün, kein aktueller Actions-Lauf, keine Review |
| **#225** (Draft) | nur LINIE-Roadmap und Statusdoku | konfliktbehaftet, Pflicht-CI/Vercel grün, keine Review |
| **#218** | alte OP-25-Analyse, Tests und Doku | konfliktbehaftet, durch #219 überholt; schließen |
| **#216** | F-PORT-Teststabilisierung und Doku | konfliktbehaftet, Pflicht-CI/Vercel grün, keine Review |

Keiner dieser Alt-PRs ist für die erste OP-30-Aktivierungsstufe erforderlich. Vor einer
Wiederaufnahme muss jeder gegen den aktuellen `main` neu bewertet werden.

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR — Kostenentscheidung; kostenfreier Backup-/Restore-Teil erledigt.
2. **OP-02:** Pilotvertrag, AVV und DSFA extern ungeprüft; blockiert OP-12 und echten Mailbetrieb.
3. **OP-03:** Freigabepaket für den ersten zahlenden Zweitmandanten; Entscheidung zur
   Datenbank-Durchsetzung oder dokumentierten App-Guard-Akzeptanz.
4. **OP-04-Rest:** Umgang mit deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-Aktivierung, Rückbau und Redeploy bleiben Betreiberaktionen.
6. **OP-11:** Branch Protection ist auf GitHub nicht aktiv; Pflicht-CI blockiert Merges daher
   nicht technisch.
7. **OP-15:** echte Google-Drosselung und Personenquellen bleiben Produktionsrisiken.

K2/K3 und OP-25 sind abgeschlossen: fünf aktive Mandate, Signatur
`m5-9aee228dbf2c9f13`, Retention 36 und drittes OP-25-Fenster bestanden. Nach einer
OP-30-Aktivierung muss OP-25 für die geänderte Architektur erneut vollständig laufen.

## 7a · OP-30 — aktueller Stand

- Der zweite Fünf-Mandate-Versuch wurde am 13.08. kontrolliert zurückgenommen:
  Ankunft etwa 440–470 Aufträge/Tag, Abfluss etwa 130–180/Tag (Runbook §19.4/§19.5).
- Die Zielarchitektur (Outbox, austauschbarer Transport, verteilte Klassengrenzen,
  Vorgangswache) ist gemergt und lokal lastgetestet. AWS ist nicht ausgerollt.
- Die fünf OP-30-Migrationen wurden am 15.08. fehlerfrei angewendet (§24.10); zwei
  vollständige Produktionszyklen belegten am 15./16.08. ihre Inertheit bei ausgeschalteten
  Flags — 145 Schreibvorgänge ohne `HV001`/`HV002` (§24.11).
- **`HELMUT_VERSTEHEN_CAS` ist seit 17.08. eingeschaltet** (Betreiber, Redeploy auf
  unverändertem Stand) und über drei Kontrollen laufzeitgeprüft: 45 Vorgänge, alle
  `fertig`, **0 `unbekannt`**, ein Modellaufruf je Vorgang, kein `HV001`/`HV002`, KI-Budget
  im Band. Der Morgenzyklus 18.08. war vollständig: **briefing-morning 5/5 Mandate,
  briefing-lage 5/5**, `understanding-cron` erfolgreich. **`HELMUT_VERSTEHEN_PARALLELITAET`
  ist nicht gesetzt und wirkt daher als 1** (Runbook §25).
- **Die 524 inerten Altaufträge sind am 18.08. neutralisiert** (ein scharfer Lauf
  07:11 UTC): exakt 524 gelöscht, die 235 erledigten signaturgleich unangetastet. **Kein
  Export**; Rückweg ausschließlich deterministische Neuerzeugung durch den Planer (§26.7).
- **Erste Stufe-1-Aktivierung 18.08. 16:15 UTC → Rücknahme 19.08. ~06:56 UTC** (Runbook
  §27): Planung/Outbox einwandfrei (193 Aufträge, 0 Duplikate, 0 Kosten), aber **0
  Abschlüsse** in beiden Slots (20:00/04:00 UTC) — je Auftrag las und schrieb
  `saveRawItems` die volle Blob-Zeile `main` (1,29 MB): Row-Lock-Konvoi, 10-s-Timeouts,
  Retry-Verstärkung (`helmut_store`: 12 Zeilen, 14 285 kumulierte Updates). Zweiter
  Befund: der Slot schrieb **keine** Laufquittung. Rest seit der Rücknahme: **301
  wartend / 82 laeuft (Leases abgelaufen) / 235 erledigt** = 383 inert, unangetastet;
  Behandlung (neuer Anlauf oder §26-Neutralisierung mit **neuen** Ankern) ist
  Betreiberentscheidung. Beim CAS entstanden 2 Vorgänge `unbekannt`
  (Klasse `modellfehler`/Timeout, §27.4 — Empfehlung: `pruefen`, dann `erneut`;
  freigabepflichtig).
- **Reparatursprint 19.08. (PR #256, GEMERGT + DEPLOYT, §28.1):** Option B —
  `source_fetch` persistiert kanonisch relational, Blob nur noch Lesespiegel
  **höchstens 1×/Slot**; Option D — blob-unabhängige Slot-Quittung (`process_runs`).
  Wächter-/Parallelitätssuiten 40 + 16 PASS (Blob-Zugriffe konstant 2/Slot statt ≥ 120,
  0 Doppelarbeit, Lease-Wiederaufnahme). Altpfad mit Flag AUS byte-identisch.
- **Folgesprint 19.08. nachmittags (Runbook §28):** Deployment-Nachweis + Ruheprüfung
  bestanden (0 Aufträge seit der Rücknahme verändert, 0 Laufzeitfehler) · CAS-Behandlung
  ausgeführt (freigegeben): beide `unbekannt` per kanonischem `pruefen`/`erneut` →
  **0 `unbekannt`**, 2 `offen`, 0 Modellaufrufe durch die Behandlung, **bis zu 2** folgen
  im nächsten Verstehenslauf · **Neutralisierung der 383 NICHT ausgeführt** — belegter
  Blocker: §26-Verfahren bricht an den 82 abgelaufenen `laeuft`-Leases ab (§28.3);
  korrigiertes gemischtes Verfahren (`neutralisierungGemischtSql`, neue Anker vom 19.08.,
  Outbox-Riegel R12) an echter PostgreSQL bewiesen (**58 PASS / 0 FAIL**), als PR #257
  gemergt und deployt.
- **Vollzug 19.08. ~13:44 TR / 10:44 UTC (freigegeben; Beleg §28.8):** Vorprüfung alle
  Anker byte-exakt → Trockenlauf `TROCKENLAUF-OK` (belegt folgenlos) → scharf: **exakt
  383 gelöscht**, 383 Outbox-Absichten kaskadiert entfernt (R12 bewiesen), 235 Erledigte
  signaturgleich (`f7989b8c…`, pg_stat ins/upd unverändert), CAS byte-gleich zum
  Vorheranker (90 `fertig`/1 `modell-laeuft` mit abgelaufener Lease aus dem
  10:00-Lage-Check/2 `offen`), kein Cron/KI/Deploy/Flag/Export; Wache live
  `inaktiv-inert`, `inert-bestand:0`; Wiederholungsschutz in Production belegt
  (`ABBRUCH-BEREITS-NEUTRALISIERT`).
- **Der neue Motor ist wieder ausgeschaltet**; **Versuch 3 ist nicht gestartet**. Für
  25–500 Mandate besteht keine Produktionsfreigabe.

Kanonisch: [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)
§24/§25/§26/**§27**, [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md)
und [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md).

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04-Teil) — 5 Profile am 2026-08-04 repariert | 29B (lesender Fehlerzustands-Nachweis); relationale Profilzeilen bleiben veraltete Schnappschüsse (F-P6); K2 |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| Monitoring-Zweitkanal (OP-07) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörungs-Erkennung | 7 von 14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | ~16 % Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching-Nachvollziehbarkeit | 23B-2 (Briefing-Historisierung); Abdeckung wächst nur mit Läufen |
| Punkt 26/27 (E2E Berlin/Brandenburg) | 26B blockiert durch Punkt 14, 27B durch Punkt 15; 27A-2-Abnahmemessung offen |
| Punkt 29 Fehlervertrag | 29B offen; P29-Fixes gemergt |
| Mail (#204/#205) | Mailpit-Bestätigungslauf auf dem Betreiber-Mac; Production-Aktivierung freigabepflichtig |
| Kalender-Machbarkeit 1 (#209) | reine Machbarkeit; vor Ausbau zuerst die **Rechtsfrage** ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline; Aktivierungsset 4 Wege |
| Quellen-Seed-Einspielung | nur noch Betreiberfreigabe (Export + Reaktivierung der 6 Bundeswege) |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe **und** Fachfrage (16 Begründungen pilotmandats-relativ, Tabelle mandantenneutral) |
| Pre-Seed-Sicherung/Seed-Restore | Restore lief nie gegen Production (bewusst) |

## 9 · Ausstehende Production-Nachweise

- **OP-25-Nachweis nach §7.7.5: BESTANDEN — drittes Fenster 2026-08-07/08 (Exit 0, null
  Befunde), kanonisch §7.7.9** (Fenster 1 `nicht_bestanden`, Fenster 2 `nicht_pruefbar`
  bleiben dokumentiert). **Geltung: nur die aktuelle Architektur mit 5 Mandaten — beweist
  weder OP-30 noch 200 Mandate; nach einer OP-30-Aktivierung vollständige Wiederholung.**
  OP-14 (Verstehensrückstand) bleibt offen.
- **OP-31-Nachweis: BESTANDEN — Morgenlauf 2026-08-11 05:00 UTC** ([`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md)). Kopfstatus/UI live
  nicht abgerufen (kein Zugangsgeheimnis) — die Aussage stützt sich auf den relational
  geprüften Beleg plus testgesicherten Code.
- **F-E2E** (nichtdeterministische E2E-Rangfolge im CI, belegt 2026-08-04) — Ursache offen;
  PR #224 (Draft) liegt vor, nicht abgenommen.
- **29B** — wartet auf natürlich auftretende Fehlerzustände (künstliche Fehler verboten).
- **27A-2-Abnahme** — Wiederholungsmessung nach Deployment.
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen.

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung).

- **F-1** Tenant-JWT-Selbstsignierung → RLS scharfschalten: **dauerhaft stillgelegt**;
  RLS inert, Trennung App-seitig, Nachfolge gehört zu OP-03. `HELMUT_TENANT_JWT_MODE`
  ist wirkungslos.
- **F-2** Generation B „Quellenplattform": **nicht mergen, nicht als Basis nutzen**
  ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: **in Production gescheitert**,
  dreifach stillgelegt + CI-Riegel; Workflow `understanding-recovery.yml` **nie ausführen**
  (`CLAUDE.md` §5). Ersatz: Einzeldokument-Recovery je exakter `raw_document_id`.
- **F-4** „Quellenbasis zu dünn": **Fehlbefund** — nicht neu aufsetzen.
- **F-5** Feste Referenzzahl „145 Quellen": **verworfen** — gültig ist
  `Telemetriezeilen = distinct source_id` (B3).
- **OP-25-Nachweis, 1. Anlauf (2026-08-03) und 1. reguläres Fenster (2026-08-04/05)**:
  gescheitert — **nicht** am Kapazitätsblocker (der war real gelöst, §3), sondern an
  Werkzeug-/Vertragsfehlern und an E3. Fenster-Untergrenze 2026-08-04T00:00Z bleibt
  verbindlich.
- **Methodisch:** grüne Offline-Tests haben hier nichts bewiesen — Fixtures kodierten die
  falsche `runId`-Konvention, modellierten nur **eine** Profilwahrheit und kannten nur
  `vercel.json`-Slots mit festem n.

## 11 · Nächster empfohlener Schritt

**Genau ein Schritt: Versuch 4 nach Runbook §28.6 aktivieren** — die datenbankseitigen
Vorbedingungen sind seit dem Vollzug §28.8 erfüllt (0/235/0/0, Outbox 0, Wache
`inert-bestand:0`). Nächstes sicheres Fenster: **19:10–20:50 türkischer Zeit
(18:10–19:50 Berlin, 16:10–17:50 UTC)**, erster Wirkungslauf crawl 23:00 türkischer Zeit
(22:00 Berlin, 20:00 UTC) mit den 11 Kontrollen; Rückweg = Flag löschen + Redeploy.
Vorher den Vollzugs-Doku-PR mergen. Danach:

1. **CAS-Folgekontrolle** nach dem nächsten Verstehenslauf (§28.2): beide freigegebenen
   Vorgänge `fertig` mit Fencing ≥ 2 — oder ehrlich erneut `unbekannt`; dazu der eine
   `modell-laeuft`-Vorgang mit abgelaufener Lease (10:00-Lage-Check, §28.8) — der Wärter
   löst ihn regulär auf oder stellt ihn ehrlich `unbekannt` (dann §23.3-Entscheidung).
2. Nach jeder wirksamen OP-30-Aktivierung: **OP-25 vollständig wiederholen**.
3. Unabhängig davon: **OP-15** (Personenquellen) beziffert und offen; `CRON_SECRET`/Egress
   für eine Folgesitzung freigeben (schließt die K0-Teillücke `/api/ops/jobqueue`).

Die fünf OP-30-Migrationen sind angewendet und dürfen **nicht** erneut ausgeführt werden;
`20260720` bleibt offen. Ein Rückweg für die neutralisierten Aufträge ist ausschließlich die
**deterministische Neuerzeugung durch den Planer** — es existiert **kein Export** und keine
Sicherungskopie (§26.2/§26.7).

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung,
  keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe.
- Migration auf Production: offen ist nur `20260720` — Anwendung freigabepflichtig.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; die
  5 Offline-Testmandate bleiben deaktivierte Repo-Daten.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls);
  `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung ist App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant wird
  hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-29 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| **OP-25: Ursachenanalyse, Korrekturen K1–K8, neue Abnahmekriterien** | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.6/§7.7.7** |
| OP-25: Korrektursprint-Beleg (Umsetzung, Testzahlen, Betreiberaktionen) | [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md) |
| OP-25-Nachweisvertrag + Betreiberablauf | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5 |
| Cron-Fairness inkl. Production-Nachweise, F-CAS, F-POS, Watchdog-Verzug | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Globalphase/Globalabruf (K1/K2/K2.1) | [`betrieb/cron-globalphase.md`](betrieb/cron-globalphase.md) |
| Berlin-Aktivierung/-Rollback, Runbook | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Seed-Einspielung (blockiert) | [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) · [`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md) |
| Env-/Secret-Inventar, Cloud-Zugangsgrenzen | [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| Matching (Audit, Erklärung, M-Befunde) | [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) |
| Vorgangsbildung B4-Kette (CSD) | [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) |
| Profilreife/Reparatur 2026-08-04 | [`multitenancy-profilbereitschaft-bundestag.md`](multitenancy-profilbereitschaft-bundestag.md) |
| PARDOK-Parser (Punkt 24) | [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) |
| Paket-Inventur (wiederholbar) | [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) |
| **OP-30: Kapazität der Morgenlage, R4/R4b, Stufenplan** | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) |
| **OP-30: Aktivierungs-Runbook 5 Mandate (Pläne, Grenzen, `mdb-a`)** | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| **OP-30 CAS: atomarer Verstehensvertrag, Unmoeglichkeitsgrenze, Nebenlaeufigkeitsnachweise** | [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md) |
| **OP-31: Frischevertrag + adversarialer Review (§10)** | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) |
| Roadmap Phase 1 | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständiger Status vor der Verdichtung 17.08.** | [`archive/project_state/2026_08_17_CURRENT_STATE_full.md`](archive/project_state/2026_08_17_CURRENT_STATE_full.md) |
| Vollständige Historie bis `4594fea` | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints

- **19.08. ~10:44 UTC (Vollzug, §28.8):** die 383 inerten Aufträge nach dem gemergten
  §28.4-Verfahren neutralisiert — 383 gelöscht, Outbox kaskadiert 0, 235 Erledigte
  signaturgleich, CAS unverändert, Wache `inert-bestand:0`; Versuch 4 nicht gestartet.
- **19.08. nachm. (Folgesprint, Runbook §28):** PR-#256-Deployment nachgewiesen; CAS
  behandelt (2× `erneut`, 0 `unbekannt`); Blocker des §26-Verfahrens für die gemischte
  Zielmenge belegt; gemischtes Verfahren (Anker 19.08., R12) 58/0 bewiesen, PR #257
  (gemergt); Versuch-4-Plan §28.6.
- **19.08. (Reparatursprint, PR #256, gemergt):** Ursache des 0-Abschluss-Laufs belegt
  (Blob-RMW je Auftrag + fehlende Slot-Quittung), Option B + D implementiert, Wächter-
  und Parallelitätssuiten neu (40+16 PASS); CAS-Review der 2 `unbekannt` rein lesend
  (Runbook §27).
- **18.08. (Betreiber): Stufe 1 aktiviert 16:15 UTC, 19.08. ~06:56 UTC zurückgenommen**
  — 2 Slots mit 0 Abschlüssen, Rest 383 inert (§27.1).
- **18.08., PR #254:** Neutralisierung der 524 Altaufträge vollzogen (0/235/0/0);
  235 Erledigte signaturgleich unangetastet; kein Export, kein Flag, kein Cron.
- **17.08., PR #253:** datensparsamer Neutralisierungsweg (R1–R9) und
  Warteschlangenwache V2; Watchdog-Vertrag queue-tauglich.
- **17./18.08. (Betreiber):** `HELMUT_VERSTEHEN_CAS=on` aktiviert und über drei
  Kontrollen laufzeitgeprüft — 45 Vorgänge, 0 `unbekannt`, Morgenzyklus 5/5 je Slot.
- **16.08., PR #251:** Laufzeitinertheit der fünf Migrationen bestätigt; Betreiberplan
  der ersten CAS-Aktivierung dokumentiert; nur Dokumentation.
- **15.08., PR #249/#250:** fünf OP-30-Migrationen nach Transaktions- und
  Organisationskorrekturen fehlerfrei auf Production angewendet; alle Flags aus.
- **14./15.08., PR #248:** atomarer Verstehensvertrag und drei Korrekturen lokal belegt.
- **13./14.08., PR #247:** OP-30-Zielarchitektur und Bereitstellungsweg gebaut; AWS nicht
  ausgerollt.

Ältere Sprintberichte stehen in den kanonischen Belegdateien aus §13 und in der
verlustfreien Archivfassung vom 17.08.
