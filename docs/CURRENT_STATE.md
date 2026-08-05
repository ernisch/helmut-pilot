# CURRENT STATE — Helmut

**Stand: 2026-08-05.** Diese Datei enthält **ausschließlich den aktuellen,
entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert
durch `scripts/current-state-groesse-test.js`). Die vollständige Historie bis zum
2026-08-05 liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)
(per `git mv` verschoben, SHA256
`bbc7cdd08824f49e596e3fc488973e49d5b4582961cd3948bb66e70c5732771d`; Historie über
`git log --follow`). Regeln zur Ablage: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `4594fea`** = Merge von **PR #226** (2026-08-05): Dokumentation des ersten
  regulären OP-25-Production-Nachweises nach
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5 — Ergebnis
  **nicht bestanden**, Belege `belege/op25-startbaseline.json` und
  `belege/op25-auswertung-2026-08-05.log`.
- Enthalten u. a.: #223 (Commitnachweis-Härtung des Nachweiswerkzeugs), #222
  (OP-25-Nachweisvertrag + Werkzeug, 4 Reviewdurchgänge), #219 (Kapazitätsfix
  globaler Abrufpfad), #220/#221 (Profilreife), #214/#213/#211/#212 (K2.1/Fairness/
  Timing-Test), #201/#200/#199 (K2.1/K1/R-6), #204–#209 (Mail/Timing/F-CAS/Kalender).
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 3 · Production-Zustand

- **Deployment:** Das OP-25-Aktivierungsdeployment `dpl_4gCKkwSFfagHnCxs2jj4RCWLfviW`
  (Commit `2e4e00e`, PR #223) wurde **READY 2026-08-04 18:23:57 UTC**; seitdem folgt
  Production den `main`-Merges automatisch.
- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40 Tabellen) und isolierter Restore sind seit 2026-07-28 geübt
  ([`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md));
  Restrisiko RPO bis 24 h.
- **Mandate:** 8 Profile = **5 aktive reale Mandate** + 3 deaktivierte Demos
  (`max-mustermann` am 2026-08-04 deaktiviert; `angela-merkel`/`james-brown`
  Alt-Bestand, OP-04-Rest). **0 Testmandate, 0 Landtagsprofile** in Production.
  Baseline-Signatur der aktiven Menge: `m5-9aee228dbf2c9f13`.
  **Offene Betreiberklärung:** im Nachweisfenster 04./05.08. war `max-mustermann`
  zwischenzeitlich **reaktiviert und wieder deaktiviert** (Production-Datenänderung
  unbekannter Herkunft, nicht aus einer Claude-Sitzung).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (zuletzt gelesen
  2026-08-04: 155 `needs_review` / 4 `broken` / 4 `healthy`); 18 Landesmodul-Wege
  (BE/BB) gesperrt (`needs_review`+`manual`). Die Quellen-Seeds `20260713`/`20260717`
  sind **nicht eingespielt** (Runbook
  [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md):
  BLOCKIERT, nur noch Betreiberfreigabe offen). Befund B1 (Google-Klumpenrisiko)
  besteht fort.
- **Crons:** 9 Vercel-Cron-Einträge unverändert (crawl 04:00/20:00 · pipeline 16:00 ·
  morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 ·
  health 06:00 · lage-check 10:00 UTC, `vercel.json`). Der GitHub-Actions-Watchdog
  löst zusätzlich außerplanmäßige `pipeline`-Läufe aus (Befund **D-2**,
  [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.9) — er hat den
  OP-25-Nachweis mitverdorben (Retention-Verdrängung).
- **Migrationen:** offen ist **nur noch `20260720`** (gehört zu OP-03). `20260721`
  ist seit 2026-07-16 angewendet (in Production gegengeprüft); `20260727`
  (`process_runs`) und `20260728` (matching_audit, embedding_shadow) sind angewendet
  und verifiziert.
- **Kosten:** LLM im Mittel ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); OP-25-Fenster 04./05.08.
  gemessen 0,1892 USD bei Rahmen 2 USD.
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase erreichbar (lesend/messend);
  **Vercel-Env weder lesbar noch setzbar** (Egress zu `api.vercel.com` gesperrt,
  `CONNECT → 403`; Vercel-MCP ohne Env-/Redeploy-Werkzeug). Jede Flag-Aktivierung
  **und jeder Rückbau** ist Betreiberaktion
  ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Rotation Production-belegt 2026-08-03 ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.4/§14.5) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28, Auditpersistenz + Idempotenz belegt |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27, Dual-Write belegt (W-2 geschlossen) |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren (Token-belegt) |
| **`HELMUT_CRON_GLOBALABRUF=on`** | vom Betreiber gesetzt, wirksam seit READY 2026-08-04 18:23:57 UTC; Wirkung im Nachweisfenster lesend belegt. **Belassen oder Rückbau ist eine offene Betreiberentscheidung** (§7.2 Stufe 1 in [`betrieb/cron-globalphase.md`](betrieb/cron-globalphase.md)); der Wert selbst ist aus Sitzungen nicht lesbar |
| LLM-Tagesbudget 100 + Reserve 30 | fail-closed, live |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` ist seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback (Aktivierung + Rollback am 2026-07-26, [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag in Production wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge vereinheitlichen (Gate-Name) |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | nicht gesetzt — wirksam ist die Blob-Sicht; vor einem Cutover Backfill nötig (F-P6) |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-05)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Codeänderung auf dem Branch bereits zurückgenommen; Ursache/Fix kamen über #219 nach `main`. **Empfehlung: schließen, nicht mergen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28; unabhängig von OP-25 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt #226 gemergt
2026-08-05; #203 geschlossen 2026-08-03). Historie: Archiv.

## 7 · Offene Blocker

1. **OP-01** Supabase Pro + PITR — reine Kostenentscheidung des Betreibers
   (~25 $/Monat); kostenfreier Teil erledigt (Sicherung + bewiesener Restore).
2. **OP-02** Recht — Pilotvertrag/AVV/DSFA extern ungeprüft; `knowledge_objects`
   enthalten Art.-9-Daten. Blockiert OP-12 und echten Mailbetrieb (AVV Resend).
3. **OP-03** Zweitmandanten-Freigabepaket — Grundsatzentscheidung „DB-seitige
   Durchsetzung vs. dokumentierte App-Guard-Akzeptanz" fehlt
   ([`mandantentrennung-architektur.md`](mandantentrennung-architektur.md)).
4. **OP-04-Rest** — Entscheidung über die 3 deaktivierten Demo-Mandate
   (löschen/behalten/umbenennen); Namensduplikat Demo ↔ aktives Mandat besteht als
   Warnung fort.
5. **Kein Vercel-Schreibweg aus Sitzungen** (siehe §3) — blockiert jede
   Flag-Aktivierung/-Rücknahme inkl. `HELMUT_CRON_GLOBALABRUF`-Entscheidung und
   jede Landesmodul-Aktivierung.
6. **OP-11** Branch Protection — Aktivierungsstand unbestätigt; ohne sie blockiert
   das CI-Gate nicht ([`betrieb/branch-protection.md`](betrieb/branch-protection.md)).
7. **Betreiberklärung `max-mustermann`-Toggle** im OP-25-Fenster (§3) — vor jedem
   neuen Nachweis zu klären.
8. **D-2-Entscheidung:** Watchdog-Störläufe einplanen — Retention erhöhen
   (`HELMUT_CRAWL_RUN_RETENTION`, Vercel-Env, freigabepflichtig) **oder**
   Vertrag/Watchdog anpassen (Code-Sprint).
9. **OP-25-Kapazitätsblocker** ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md)
   §10.5/§10.7, Befund **F-POS**): dieselben Mandate schließen strukturell nie ab;
   der Nachweis-Befund `mandatslauf-fehlt` (16:00-Lauf ohne einen einzigen
   Mandatslauf) bestätigt das in Production.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| **OP-25** Crawl-Zeitdeckelung/Fairness — Rotation, K1, K2.1, Nachweisvertrag §7.7.5 + Werkzeug sind gebaut, gemergt und teils Production-belegt | Der **erste reguläre Nachweis ist am 2026-08-05 GESCHEITERT** (Exit 1, 7 Befunde — s. §10/§12); Analysesprint + neuer Nachweis von vorn. Offen zudem: Abdeckungsmessung, Abdeckungsalarm, R-1 (`lage-briefing` nicht fair), R-3 (kein atomarer Claim) |
| Profilreife (OP-29/OP-04-Teil) — 5 aktive Profile am 2026-08-04 mit Betreiberfreigabe repariert, alle „bereit" | 29B (lesender Fehlerzustands-Nachweis an natürlich auftretenden Fehlern); relationale Profilzeilen bleiben veraltete Schnappschüsse (F-P6, Backfill vor DB-Cutover) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| Monitoring-Zweitkanal (OP-07) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein Sendebeleg |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörungs-Erkennung | 7 von 14 Klassen nur testbelegt (dürfen nicht künstlich erzeugt werden) |
| Punkt 17 Kostenmessung | Datengrundlage: ~16 % Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching-Nachvollziehbarkeit | 23B-2 (Briefing-Historisierung); Abdeckung wächst nur mit regulären Läufen |
| Punkt 26/27 (E2E Berlin/Brandenburg) | 26B blockiert durch Punkt 14, 27B durch Punkt 15; 27A-2-Fix wartet auf Abnahmemessung nach Deployment |
| Punkt 29 Fehlervertrag | 29B offen (s. o.); P29-Fixes sind gemergt |
| Mail (Mailpit/Resend, PR #204/#205) | Mailpit-Bestätigungslauf auf dem Betreiber-Mac; Production-Aktivierung eigener freigabepflichtiger Schritt |
| Kalender-Machbarkeit 1 (PR #209) | reine Machbarkeit; vor jedem Ausbau zuerst die **Rechtsfrage** ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | wartet auf Betreiber-Flagzugang + stabile Pipeline; Aktivierungsset 4 Wege; Details [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Quellen-Seed-Einspielung (P0-2 u. a.) | nur noch Betreiberfreigabe (Export + ausdrückliche Reaktivierung der 6 Bundeswege) |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe **und** Fachfrage: 16 Begründungen sind pilotmandats-relativ, Tabelle ist mandantenneutral |
| Pre-Seed-Sicherung/Seed-Restore (OP-01-Teil) | Restore lief nie gegen Production (bewusst); isolierter Voll-Rückweg ist bewiesen |

## 9 · Ausstehende Production-Nachweise

- **OP-25-Nachweis nach §7.7.5** — von vorn, erst nach §12-Vorarbeiten.
- **F-E2E** (nichtdeterministische E2E-Rangfolge im CI, belegt 2026-08-04) — Ursache
  offen; PR #224 (Draft) liegt vor, ist aber nicht abgenommen.
- **29B** — wartet auf natürlich auftretende Fehlerzustände (künstliche Fehler in
  Production verboten).
- **27A-2-Abnahme** — Wiederholungsmessung nach Deployment („qualifizierte Fälle
  nachher: 0" + eine neue `matching_results`-Zeile).
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen (nur
  Redeploy belegt).

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung).

- **F-1** Tenant-JWT-Selbstsignierung → RLS scharfschalten: **dauerhaft stillgelegt**
  (Supabase-Umstellung auf asymmetrische Keys); RLS ist inert, Trennung App-seitig,
  Nachfolgekonzept gehört zu OP-03. `HELMUT_TENANT_JWT_MODE` ist wirkungslos.
- **F-2** Generation B „Quellenplattform": **nicht mergen, nicht als Basis nutzen**
  ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: **in Production gescheitert**
  (Multi-Themen-Digest, zurückgerollt); auf `main` dreifach stillgelegt + CI-Riegel.
  Workflow `understanding-recovery.yml` **nie ausführen** (`CLAUDE.md` §5). Ersatz:
  Einzeldokument-Recovery je exakter `raw_document_id`.
- **F-4** Befund „Quellenbasis zu dünn": **Fehlbefund** — Analyse nicht neu aufsetzen.
- **F-5** Feste Referenzzahl „145 Quellen": **verworfen** — gültige Invariante ist
  `Telemetriezeilen = distinct source_id` (B3).
- **OP-25-Nachweis, 1. Anlauf (2026-08-03)** und **1. reguläres Fenster
  (2026-08-04/05)**: gescheitert — Kapazität bzw. 7 Befunde; Wiederholung nur nach
  §12-Vorarbeiten, Fenster-Untergrenze 2026-08-04T00:00Z bleibt verbindlich.

## 11 · Nächster empfohlener Sprint

Reihenfolge aus dem gescheiterten OP-25-Nachweis (vor jedem neuen Nachweis):

1. **Betreiberklärung** `max-mustermann`-Toggle im Fenster (§3/§7.7).
2. **D-2-Entscheidung** (Retention erhöhen vs. Watchdog/Vertrag anpassen, §7.8).
3. **Analysesprint** zu drei Nachweisbefunden: (e) Rückstands-Vormerkung — die
   E3-Zusage der dauerhaften pending-Vormerkung wird in Production nicht erfüllt,
   obwohl offline bewiesen (`op25-e3-dauerhaftigkeit-test` 52/52); (d)
   Budget-Überziehung +313 ms; (f) unerklärte Kontextzahl 15 > 11.
4. Erst danach: **neuer §7.7.5-Nachweis von vorn** (Betreiberablauf: Merge → Flag →
   neues Deployment → Baseline binnen 15 min mit vollem Commit → 24 h ohne weiteres
   Deployment → Auswertung).

Parallel, unabhängig davon: **OP-01-Entscheidung** (Pro + PITR) einholen; **OP-11**
Branch Protection verifizieren (2 Minuten); Entscheidung **Belassen/Rückbau
`HELMUT_CRON_GLOBALABRUF`**; Empfehlung zu #218 umsetzen (schließen).

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine
  Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne
  ausdrückliche Freigabe.
- Migration auf Production: offen ist nur `20260720` — Anwendung freigabepflichtig.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung;
  die 5 Offline-Testmandate bleiben deaktivierte Repo-Daten.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls);
  `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung ist App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant
  wird hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-29 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-25-Nachweisvertrag + Betreiberablauf | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5 |
| Cron-Fairness inkl. Production-Nachweise, F-CAS, F-POS, D-2 | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
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
| Roadmap Phase 1 (operative Punkteliste) | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständige Historie bis 2026-08-05** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-05 | OP-25: 1. regulärer Production-Nachweis §7.7.5 (Fenster 04.–05.08.) | **gescheitert** (Exit 1, 7 Befunde; Commitnachweis bestanden, Kosten 0,19 USD); OP-25 bleibt teilweise; PR #226 gemergt |
| 2026-08-05 | Doku-Sprint: `CURRENT_STATE.md` kompaktiert, Historie archiviert, Größenkontrolle | dieser Stand |
| 2026-08-04 | PR #223: Startbaseline deploymentgebunden + verbindlicher Commitnachweis (inkl. adversarialer Nachprobe, 6 Befunde geschlossen) | erfolgreich, gemergt |
| 2026-08-04 | PR #222: OP-25-Nachweisvertrag + Werkzeug, 4 Reviewdurchgänge (Kosten-, Baseline-, Commit-Härtung) | erfolgreich, gemergt; dabei F-E2E entdeckt (offen) |
| 2026-08-04 | Production-Profilreparatur (Betreiberfreigabe): 5 Profile repariert, `max-mustermann` deaktiviert, F-P6-Namenszeile per CAS | erfolgreich |
| 2026-08-03/04 | PR #219: Kapazitätsfehler globaler Abrufpfad (F-RT/F-CL) behoben; #218 als konkurrierende Analyse widerlegt | gemergt; Production-Wirkung = Teil des OP-25-Nachweises |
| 2026-08-03 | K2.1-Aktivierung (`HELMUT_CRON_GLOBALABRUF=on`) → erster Wirkungslauf scheitert am Kapazitätsvertrag → Betreiber-Rückbau | gescheitert/zurückgerollt; Flag am 04.08. erneut gesetzt |
| 2026-08-03 | OP-25-Fairness-Production-Nachweis (Rotation, R-6, F-CAS) | bestanden; neuer Befund F-POS |
| 2026-08-01/02 | Mail-Reihe #204–#207 (Mailpit, Resend, Timing-Seitenkanal, HTML) + #208 F-CAS-Fix + #209 Kalender-Machbarkeit | gemergt; Resend bleibt aus |
| 2026-07-31 | K1/K2/K2.1 gebaut (#199/#200/#201), 25B abgeschlossen, Punkt 25 vollständig | teilweise/erfolgreich |
| 2026-07-30 | Punkte 27A/29 (E2E-Verträge, Fehlervertrag, P29-Fixes) | teilweise; 29B offen |
| 2026-07-28/29 | Matching-Audit 23B-1 (Migration + Flag), Embeddings 22A–22C1 (Backfill 772/772), OP-24-Nachklassifikation, OP-01-Restore-Übung, Punkt 24 PARDOK | erfolgreich |
| 2026-07-27 | W-1/W-2-Werkzeughärtung + Migration `20260727` + B4-3/B4-4-Hotfixes + CSD-Nachweis | erfolgreich |
| 2026-07-26 | Berlin-Aktivierung ausgeführt und **noch am selben Abend zurückgerollt** (Abbruchkriterium 16); Punkt-13/14/16/17-Reihe | zurückgerollt/teilweise |

Ältere Sprints, vollständige Berichte, alle Testzahlen und Beweisketten: **Archiv**
([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
