# CURRENT STATE — Helmut

**Stand: 2026-08-06** (nach Merge PR #229 und den OP-25-Betreiberschritten K2/K3, Beweisprotokoll §9). Diese Datei enthält
**ausschließlich den aktuellen, entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die vollständige
Historie liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)
— byte-identisch mit `docs/CURRENT_STATE.md` auf `main`-Commit `4594fea` (per `git mv`
verschoben, SHA256 `bbc7cdd08824f49e596e3fc488973e49d5b4582961cd3948bb66e70c5732771d`,
Historie über `git log --follow`). Der **danach** über PR #227 ergänzte 12. Durchgang steht
hier verdichtet; kanonisch und vollständig ist er in
[`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.6.
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `f4f4500b`** = Merge von **PR #229** (2026-08-06): **Korrektursprint K1–K8**
  (eine Mandatswahrheit, harter Aufbewahrungsvertrag inkl. Watchdog, E3-Einlösung,
  bedingter Watchdog, Abschlussreserve) — Beleg
  [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md),
  kanonisch [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.7.
- Davor `dbb86b4` = **PR #228** (CURRENT_STATE kompaktiert) und `6cce829` = **PR #227**
  (**Ursachenanalyse §7.7.6**, rein lesend; widerlegt mehrere Befunde des
  Abschlussberichts).
- Davor `4594fea` = **PR #226** (Durchführung und Auswertung des Nachweisfensters
  2026-08-04/05, Ergebnis `nicht_bestanden`; Belege `belege/op25-startbaseline.json`,
  `belege/op25-auswertung-2026-08-05.log`).
- Weiter enthalten: #223 (Commitnachweis-Härtung), #222 (Nachweisvertrag + Werkzeug,
  4 Reviewdurchgänge), #219 (Kapazitätsfix globaler Abrufpfad), #220/#221 (Profilreife),
  #211–#214 (Fairness/K2.1/Timing), #199–#201 (R-6/K1/K2.1), #204–#209 (Mail/F-CAS/Kalender).
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40 Tabellen) und isolierter Restore seit 2026-07-28 geübt
  ([`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md));
  Restrisiko RPO bis 24 h.
- **Mandate — eine Wahrheit (K2-Betreiberschritt erledigt 2026-08-06):** `max-mustermann`
  wurde am 2026-08-06T08:01:31Z **relational deaktiviert** — konditionales Update, exakt
  1 Zeile, **kein Löschen** ([`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9).
  Aktiv sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion,
  Nachweiswerkzeug und Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**;
  das K2-Gate meldet keinen Widerspruch mehr. Insgesamt 8 Profile;
  `angela-merkel`/`james-brown`/`max-mustermann` deaktiviert (OP-04-Rest);
  **0 Testmandate, 0 Landtagsprofile**.
- **Aufbewahrung Crawl-Läufe (K3-Betreiberschritt erledigt 2026-08-06):**
  `HELMUT_CRAWL_RUN_RETENTION=36` (Betreiber-Sichtprüfung in Vercel, nur Production;
  zuvor Default 20), wirksam mit Redeploy **`dpl_3y5nBCiQtHnUnVuqh1SFr2X2ranu`**
  (READY 07:50:22 UTC, Commit `f4f4500b`). Mindestbedarf bei n=5: 30; ab 36 keine
  Knapp-Warnung.
- **Kapazität im Fenster real gelöst** (belegt, §7.7.6): crawl 04:00, Watchdog-pipeline
  08:03 und pipeline 16:00 haben je **6 von 6** Mandatsprojektionen abgeschlossen; der
  16:00-Lauf endete regulär nach ~4 min, weit vor dem 270/280-s-Limit.
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (Stand 2026-08-04:
  155 `needs_review` / 4 `broken` / 4 `healthy`); 18 Landesmodul-Wege (BE/BB) gesperrt.
  Quellen-Seeds `20260713`/`20260717` **nicht eingespielt**
  ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT,
  nur noch Betreiberfreigabe). Befund B1 (Google-Klumpenrisiko) besteht fort.
- **Crons:** 9 Vercel-Einträge unverändert (crawl 04:00/20:00 · pipeline 16:00 ·
  morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 ·
  lage-check 10:00 UTC, `vercel.json`). **Dazu ein vierter, planmäßiger Regel-Slot:** der
  GitHub-Actions-Watchdog (`briefing-watchdog.yml`) feuert täglich 05:30 UTC
  **bedingungslos** die volle Pipeline; GitHub verzögert regelmäßig um 2–3 h. Er ist
  **kein Störfall**, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** offen ist **nur noch `20260720`** (laut Datei-Header Blob-Entlastung
  P0-5/OP-17 — die frühere Zuordnung „gehört zu OP-03" war falsch; die OP-03-Migration
  `20260721` ist seit 2026-07-16 angewendet). `20260727` und beide `20260728` angewendet
  und verifiziert.
- **Kosten:** LLM im Mittel ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Nachweisfenster 0,1892 USD
  bei Rahmen 2 USD.
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase lesend erreichbar; **Vercel-Env weder
  lesbar noch setzbar** (Egress `CONNECT → 403`, Vercel-MCP ohne Env-/Redeploy-Werkzeug).
  Jede Flag-Aktivierung **und jeder Rückbau** ist Betreiberaktion
  ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Rotation Production-belegt 2026-08-03 ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.4/§14.5) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28, Auditpersistenz + Idempotenz belegt |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27, Dual-Write belegt (W-2 geschlossen) |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren (Token-belegt) |
| LLM-Tagesbudget 100 + Reserve 30 | fail-closed, live |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **`HELMUT_CRON_GLOBALABRUF`** | **`off`** — 2026-08-06 per **Betreiber-Sichtprüfung in Vercel direkt bestätigt** (aus Sitzungen nicht API-lesbar, §3) ⇒ es läuft der **Altpfad**. Zweiter Zyklus war `on` von READY 2026-08-04 18:23:57 UTC bis zum Rückbau; Wirkung im Fenster lesend belegt |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge, die nur der Stufe-D-Merge liefert; Code-Default wäre AUS). Direkte Env-Einsicht aus Sitzungen nicht möglich; Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt). Der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-05)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#231** (Draft, 2026-08-06) | **OP-03-Sprint:** Konten-Vorbedingung der Provisionierung (fail-closed gegen echte DB ohne `HELMUT_AUTH_MODE=accounts`/Admin-Konto), 1 Abgeordneten-Konto je Mandat (409), lokaler Mehrmandantentest `op03-mehrmandanten-test.js` (43 Prüfungen), Restliste-/Doku-Schärfung | offline vollständig grün (208/208); **Merge erst nach Ende des OP-25-Fensters (2026-08-07 18:24 Berlin) + Review** |
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Codeänderung auf dem Branch zurückgenommen; Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#229 gemergt
2026-08-06** — Production-Deployment der K1–K8-Korrekturen; davor #228 und #227
gemergt 2026-08-05; #203 geschlossen 2026-08-03). Historie: Archiv.

## 7 · Offene Blocker

1. **OP-01** Supabase Pro + PITR — reine Kostenentscheidung (~25 $/Monat); kostenfreier
   Teil erledigt.
2. **OP-02** Recht — Pilotvertrag/AVV/DSFA extern ungeprüft; `knowledge_objects` enthalten
   Art.-9-Daten. Blockiert OP-12 und echten Mailbetrieb.
3. **OP-03** Zweitmandanten-Freigabepaket — Grundsatzentscheidung „DB-seitige Durchsetzung
   vs. dokumentierte App-Guard-Akzeptanz"
   ([`mandantentrennung-architektur.md`](mandantentrennung-architektur.md)). Technisch
   weiter vorbereitet durch PR #231 (ungemergt): Konten-Vorbedingung, 1 Konto je Mandat,
   Mehrmandantentest. Zusätzlich offen: Betreiber-Verifikation `HELMUT_AUTH_MODE=accounts`
   in Production, `HELMUT_TENANT_LLM_CAP`-Limitwerte, Production-Probelauf (Restliste OP-03).
4. **OP-04-Rest** — Entscheidung über die deaktivierten Demo-Mandate; hängt mit K2 zusammen.
5. **Kein Vercel-Schreibweg aus Sitzungen** (§3) — blockiert jede Flag-Aktivierung/-Rücknahme
   und jede Landesmodul-Aktivierung.
6. **OP-11** Branch Protection — Aktivierungsstand unbestätigt; ohne sie blockiert das
   CI-Gate nicht ([`betrieb/branch-protection.md`](betrieb/branch-protection.md)).
Die früheren Blocker 7/8 (K2-/K3-Betreiberschritte) sind seit 2026-08-06 **erledigt**
(Beweisprotokoll §9): `max-mustermann` relational deaktiviert (eine 5er-Mandatswahrheit,
`m5-9aee228dbf2c9f13`), Retention 36 gesetzt + Redeploy. Der nächste OP-25-Nachweis ist
damit nur noch durch die **separate Startfreigabe** blockiert (§9/§11).

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| **OP-25** Fairness/Zeitdeckelung — Rotation, K1, K2.1, Nachweisvertrag §7.7.5 + Werkzeug; **Korrekturen K1–K8 gemergt (PR #229, 2026-08-06)**; beide Betreiberschritte K2/K3 erledigt (Beweisprotokoll §9) | Nachweis 2026-08-04/05 `nicht_bestanden`; Ursachenanalyse §7.7.6 (2 Befunde unzutreffend, 1 vorhersagbar, 1 Randartefakt, 1 erklärt, 1 echt: `rueckstand-nicht-dauerhaft` → K4). Alle acht Korrekturen grün (§7.7.7; Vertrag 271/271 · E3 55/55 · Laufpaar 29/29 · Watchdog 26/26 · Mutationsprobe 87/87 rot). **Es fehlt nur noch der neue Nachweis von vorn (separate Startfreigabe, §11).** Offen bleiben zudem Abdeckungsmessung, Abdeckungsalarm, R-1, R-3 |
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

- **OP-25-Nachweis nach §7.7.5 — beginnt von vorn; alle Vorbedingungen sind seit
  2026-08-06 erfüllt** (PR #229 gemergt; K2: eine 5er-Mandatswahrheit
  `m5-9aee228dbf2c9f13`; K3: Retention 36). Es fehlt **ausschließlich die separate
  Startfreigabe** (Flag `on` → neues Deployment → Baseline binnen 15 min mit vollem
  Commit → 24 h ohne weiteres Deployment → Auswertung unmittelbar danach). Die
  Abnahmekriterien aus §7.7.6 (Signatur-Assertion, harter Aufbewahrungsvertrag inkl.
  Watchdog, echtes Laufpaar, E3 `nichtVorgemerkt = 0`, Versiegelungstoleranz 1 s) sind
  Code und prüfen den Start technisch (§7.7.7).
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
- **OP-25-Nachweis, 1. Anlauf (2026-08-03, Kapazität) und 1. reguläres Fenster
  (2026-08-04/05)**: gescheitert. **Wichtig für den nächsten Anlauf:** das Fenster ist
  nicht am Kapazitätsblocker gescheitert (der war real gelöst, §3), sondern an
  Werkzeug-/Vertragsfehlern und an E3. Fenster-Untergrenze 2026-08-04T00:00Z bleibt
  verbindlich.
- **Methodisch:** grüne Offline-Tests haben hier nichts bewiesen — Fixtures kodierten die
  falsche `runId`-Konvention, modellierten nur **eine** Profilwahrheit, kannten nur
  `vercel.json`-Slots mit festem n, und die Kapazitätsmessung erreichte die Stopplinie nie.

## 11 · Nächster empfohlener Schritt

PR #229 ist gemergt und beide Betreiberschritte K2/K3 sind erledigt (2026-08-06,
Beweisprotokoll §9). **Der einzige nächste OP-25-Schritt ist die separate
Startfreigabe für den neuen §7.7.5-Nachweis** (Flag `HELMUT_CRON_GLOBALABRUF=on` →
neues Deployment → Startbaseline binnen 15 min mit vollem Commit → 24 h ohne weiteres
Deployment → Auswertung unmittelbar danach). Ohne ausdrücklichen Auftrag wird nichts
gestartet.

Parallel und unabhängig: **OP-01-Entscheidung** (Pro + PITR); **OP-11** Branch Protection
verifizieren (2 Minuten); Empfehlung zu **#218** umsetzen (schließen).

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
| Roadmap Phase 1 | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständige Historie bis `4594fea`** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-06 | **OP-03-Sprint** (Branch `claude/op-03-multi-tenant-security-rmbwpq`, PR #231 Draft): Sicherheitsinventar + Angriffsprüfung gegen aktuellen `main` (12 Angriffsklassen App-seitig abgewehrt, testbelegt); Befunde behoben: Konten-Vorbedingung der Provisionierung (Legacy-Pilotgate = Fremdzugriff bei ≥2 Mandaten), `updateUser`-Mandatsdublette; neuer Mehrmandantentest 43/43; Offline 208/208, Smoke 32/32; Doku-Korrekturen (20260721 längst angewendet, 20260720→OP-17). **Nichts gemergt, Production/OP-25 unberührt, keine Migration ausgeführt** | **teilweise** (Code+lokale Beweise fertig; Review/Merge nach OP-25-Fenster; Grundsatzentscheidung, Env-Schritte und Production-Probelauf offen) |
| 2026-08-06 | **OP-25-Betreiberschritte K2/K3** nach Merge PR #229 (`f4f4500b`): Vorprüfung rein lesend; `max-mustermann` relational deaktiviert (konditionales Update, 1 Zeile, 08:01:31Z, kein Delete); Retention 36 + Betreiber-Redeploy `dpl_3y5n…` READY 07:50:22Z; alle drei Sichten + Blob `m5-9aee228dbf2c9f13`, K2-Gate widerspruchsfrei; Doku-Korrekturen (Belegdatei §6 `user_id`, Env-Inventar) | **erfolgreich** (Nachweisstart bleibt separat freigabepflichtig; kein Lauf, keine Baseline) |
| 2026-08-05 | **Korrektursprint K1–K8** (PR #229, Branch `claude/op25-corrections-k1-k8-kc1tdw`): alle acht Korrekturen umgesetzt + getestet; Beleg [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md) | **teilweise** (Code vollständig + grün; Review/Merge + 2 Betreiberschritte + Production-Nachweis offen) — **Merge + Betreiberschritte am 2026-08-06 erfolgt** |
| 2026-08-05 | **OP-25-Ursachenanalyse** des gescheiterten Nachweises (PR #227, rein lesend aus dauerhaften Belegen) | **erfolgreich**; widerlegt 2 der 7 Befunde, ordnet die übrigen ein, definiert K1–K8; OP-25 bleibt teilweise |
| 2026-08-05 | Doku-Sprint: `CURRENT_STATE.md` kompaktiert, Historie archiviert, Größenkontrolle (PR #228) | dieser Stand |
| 2026-08-05 | OP-25: 1. regulärer Production-Nachweis §7.7.5 (Fenster 04.–05.08.), PR #226 | **gescheitert** (Exit 1, 7 Befunde); Ablauf und Commitnachweis selbst haben funktioniert |
| 2026-08-04 | PR #223: Startbaseline deploymentgebunden + Commitnachweis (inkl. adversarialer Nachprobe) | erfolgreich, gemergt |
| 2026-08-04 | PR #222: OP-25-Nachweisvertrag + Werkzeug, 4 Reviewdurchgänge | erfolgreich, gemergt; dabei F-E2E entdeckt (offen) |
| 2026-08-04 | Production-Profilreparatur (Betreiberfreigabe): 5 Profile repariert, `max-mustermann` deaktiviert — **wirkte nur im Blob** (§3) | erfolgreich mit Einschränkung |
| 2026-08-03/04 | PR #219: Kapazitätsfehler globaler Abrufpfad (F-RT/F-CL) behoben | gemergt; Wirkung im Fenster belegt (`cas=0`, 27 Requests) |
| 2026-08-03 | K2.1-Aktivierung → erster Wirkungslauf scheitert am Kapazitätsvertrag → Betreiber-Rückbau | gescheitert/zurückgerollt |
| 2026-08-03 | OP-25-Fairness-Production-Nachweis (Rotation, R-6, F-CAS) | bestanden; Befund F-POS |
| 2026-08-01/02 | Mail-Reihe #204–#207, #208 F-CAS-Fix, #209 Kalender-Machbarkeit | gemergt; Resend bleibt aus |
| 2026-07-31 | K1/K2/K2.1 gebaut (#199/#200/#201), Punkt 25 vollständig | teilweise/erfolgreich |
| 2026-07-30 | Punkte 27A/29 (E2E-Verträge, Fehlervertrag, P29-Fixes) | teilweise; 29B offen |
| 2026-07-28/29 | Matching-Audit 23B-1, Embeddings 22A–22C1 (Backfill 772/772), OP-24, OP-01-Restore-Übung, Punkt 24 | erfolgreich |
| 2026-07-27 | W-1/W-2-Werkzeughärtung + Migration `20260727` + B4-3/B4-4-Hotfixes + CSD-Nachweis | erfolgreich |
| 2026-07-26 | Berlin aktiviert und **am selben Abend zurückgerollt** (Abbruchkriterium 16) | zurückgerollt/teilweise |

Ältere Sprints, vollständige Berichte, Testzahlen und Beweisketten: **Archiv**
([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
