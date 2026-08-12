# CURRENT STATE — Helmut

**Stand: 2026-08-12/1** (Straenge: **(a) OP-25-Production-Nachweis BESTANDEN** (§7.7.9; gilt nur fuer die heutige Architektur mit 5 Mandaten). **(b) OP-30 war 2026-08-11 18:52 bis 2026-08-12 00:54 UTC aktiv und ist ZURUECKGENOMMEN** (§7a) — K0 bestanden, erster Lauf sauber, aber die Grenze „aeltester offener Auftrag > 24 h" trat ein ⇒ **Kontrollen bei K1 gestoppt, K2/K3 nie begonnen, der Fuenferlauf ist NICHT bestanden**; Ruecknahme zustandsseitig belegt, wirkungsseitig offen bis zum crawl 04:00 UTC (Runbook §15/§16). **(c) OP-31 Frischevertrag BESTANDEN** — Morgenlauf 2026-08-11: `belegt=5/5`, ein Push je Mandat. **(d)** Befund `mdb-a`/`dec-y` geklaert, kein Blocker (Runbook §9). Diese Datei enthaelt
**ausschließlich den aktuellen, entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die vollständige
Historie liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)
(byte-identisch mit `main`-Commit `4594fea`; der danach ergänzte 12. Durchgang steht kanonisch
in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.6).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `eb13652`** = Merge **PR #242** (OP-30-Neutralitätsnachweis). In Production läuft
  dieser Commit über den Rücknahme-Redeploy `dpl_7kcdpTbh…` (READY 2026-08-12T00:54:14Z,
  §7a/§5). Davor `6ed4f65` (#241), `9663fc8` (#240), `dcd6da5` (#239), `6030cbb7` (#238),
  `ec2e208` (#237), `0f047b1` (#236), `40e7708` (#235), `559a3d9` (#233), `1f10d66` (#234),
  `a07954df` (#232), `f4f4500b` (#229, K1–K8, kanonisch
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.7). Ältere: Archiv.
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40) und isolierter Restore seit 2026-07-28 geübt
  ([`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md)); RPO ≤ 24 h.
- **Mandate — eine Wahrheit (K2-Betreiberschritt erledigt 2026-08-06):** `max-mustermann`
  wurde am 2026-08-06T08:01:31Z **relational deaktiviert** — konditionales Update, exakt
  1 Zeile, **kein Löschen** ([`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9).
  Aktiv sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion,
  Nachweiswerkzeug und Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**;
  das K2-Gate meldet keinen Widerspruch mehr. **Berichtigt 2026-08-09/3:** insgesamt **9**
  Profile (nicht 8) — deaktiviert sind `angela-merkel`, `james-brown`, `max-mustermann` **und
  `helmut-abnahme-berlin`** (angelegt 2026-07-26, in der bisherigen Zählung übersehen);
  OP-04-Rest; **0 Testmandate, 0 Landtagsprofile**.
- **Aufbewahrung Crawl-Läufe** (K3 erledigt 2026-08-06): `HELMUT_CRAWL_RUN_RETENTION=36`
  (zuvor Default 20), wirksam mit Redeploy `dpl_3y5nBCiQ…`. Mindestbedarf bei n=5: 30.
- **Kapazität im Fenster real gelöst** (§7.7.6): crawl 04:00, Watchdog 08:03 und pipeline
  16:00 je **6 von 6** Projektionen; der 16:00-Lauf endete nach ~4 min (Limit 270/280 s).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (2026-08-04: 155 `needs_review` /
  4 `broken` / 4 `healthy`); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717`
  **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md):
  BLOCKIERT). Befund B1 (Google-Klumpenrisiko) besteht fort.
- **Crons (Production):** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning-briefing
  05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 · lage-check 10:00
  UTC · 2 Narrativ-Nachlaufslots 06:10/06:22, inert). **Dazu** der GitHub-Actions-Watchdog
  (`briefing-watchdog.yml`, täglich 05:30 UTC bedingungslos, oft 2–3 h verzögert): kein
  Störfall, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** die sechs OP-30-Paare am 2026-08-11 angewendet und abgenommen (Runbook
  §12); offen ist **nur noch `20260720`** (OP-03). `20260721`/`20260727`/`20260728`: erledigt.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Nachweisfenster 0,1892 USD.
- **Zugangsgrenze jeder Claude-Sitzung (erneut gemessen 2026-08-12 01:22 UTC):** Supabase
  lesend erreichbar; **Vercel-Env weder lesbar noch setzbar** (`api.vercel.com` und
  `helmut-pilot.vercel.app` per `curl`: `CONNECT → 403`; Vercel-MCP ohne Env-/Redeploy-
  Werkzeug; `CRON_SECRET` nicht gesetzt ⇒ `/api/ops/jobqueue` fail closed). Lesend geht die
  Anwendung über das Vercel-MCP-Werkzeug (HTTP 200). Jede Flag-Aktivierung **und jeder
  Rückbau** ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

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
| **`HELMUT_CRON_GLOBALABRUF`** | **`on`** seit 2026-08-06 ~08:15 UTC (Betreiber-Sichtprüfung, für das Nachweisfenster) ⇒ **Kontextpfad aktiv** — laufzeitbelegt: die drei Fensterläufe 06./07.08. liefen global auf `d8bf68fa…` mit E3 `nv=0`. Ob das Flag nach dem ausgewerteten Fenster `on` bleibt, ist Betreiberentscheidung (das nächste Fenster braucht ohnehin ein neues Deployment). Dritter Zyklus; zweiter war `on` 2026-08-04 18:23 → Rückbau 2026-08-05 |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **`HELMUT_SCALABLE_PIPELINE` (OP-30)** | **wieder `off`** — war `on` 2026-08-11 18:52 → Rücknahme-Redeploy 2026-08-12 **00:54:14Z** (`dpl_7kcdpTbh…`, Commit `eb13652` unverändert, Aliasse liegen dort). Die **235 Aufträge** des einen Laufs stehen unverändert still (0 laufend, 0 Leases, 0 endgültige Fehler, 0 Reservierungen). **Wirkungsnachweis der Abschaltung offen** bis zum crawl 04:00 UTC (Runbook §16) |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge, die nur der Stufe-D-Merge liefert; Code-Default wäre AUS). Direkte Env-Einsicht aus Sitzungen nicht möglich; Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt). Der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-11)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#243** (dieser Sprint) | Doku: blockierter Aktivierungsversuch (§14) · Aktivierungsbeleg K0 + erster Lauf + Abbruchbefund (§15) · **Rücknahmebeleg (§16)** | reine Doku, **mergefähig nach Review** (beide Pflicht-Checks grün); Merge ändert nichts an Production |
| **#231** (Draft) | OP-03 Konten-Vorbedingung, 1 Konto je Mandat | in §6 bisher nicht geführt (Korrektur 2026-08-11/2); Betreiberentscheidung |
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#240, #239, #238,
#237, #236, #235 und #233**). Historie: Archiv.

## 7 · Offene Blocker

1. **OP-01** Supabase Pro + PITR — reine Kostenentscheidung (~25 $/Monat); kostenfreier
   Teil erledigt.
2. **OP-02** Recht — Pilotvertrag/AVV/DSFA extern ungeprüft; `knowledge_objects` enthalten
   Art.-9-Daten. Blockiert OP-12 und echten Mailbetrieb.
3. **OP-03** Zweitmandanten-Freigabepaket — Grundsatzentscheidung „DB-seitige Durchsetzung
   vs. dokumentierte App-Guard-Akzeptanz"
   ([`mandantentrennung-architektur.md`](mandantentrennung-architektur.md)).
4. **OP-04-Rest** — Entscheidung über die deaktivierten Demo-Mandate; hängt mit K2 zusammen.
5. **Kein Vercel-Schreibweg aus Sitzungen** (§3) — blockiert jede Flag-Aktivierung/-Rücknahme
   und jede Landesmodul-Aktivierung.
6. **OP-11** Branch Protection — Aktivierungsstand unbestätigt; ohne sie blockiert das
   CI-Gate nicht ([`betrieb/branch-protection.md`](betrieb/branch-protection.md)).
Die früheren Blocker 7/8 (K2-/K3-Betreiberschritte) sind seit 2026-08-06 **erledigt**
(Beweisprotokoll §9): `max-mustermann` relational deaktiviert (eine 5er-Mandatswahrheit,
`m5-9aee228dbf2c9f13`), Retention 36 gesetzt + Redeploy. Der nächste OP-25-Nachweis ist
damit nur noch durch die **separate Startfreigabe** blockiert (§9/§11).

## 7a · Kapazitätsgrenze und OP-30 (Stand 2026-08-09)

Fünf Sprints an einem Tag. Die Einzelheiten stehen in den Belegdateien; hier steht nur, was
für eine Entscheidung zählt.

**Kanonische Belege** (Einzelheiten dort, nicht hier): Runbook
[`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) —
Inventar/Pläne/Grenzen · `mdb-a` §9 · Migrationsbeleg §12 · Neutralität §13 · blockierter
Versuch §14 · Aktivierung + erster Lauf §15 · **Rücknahme §16**. Vorgeschichte:
[`v3-skalierungspruefung-2026-08-08.md`](betrieb/v3-skalierungspruefung-2026-08-08.md) ·
[`skalierungsgrundlage-1000.md`](betrieb/skalierungsgrundlage-1000.md) ·
[`op30-abnahme-2026-08-08.md`](betrieb/op30-abnahme-2026-08-08.md) ·
[`skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) ·
[`lokaler-production-schutz.md`](betrieb/lokaler-production-schutz.md) ·
[`op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) ·
[`workerbetrieb.md`](betrieb/workerbetrieb.md) ·
[`op30-abschlussreview-2026-08-08.md`](betrieb/op30-abschlussreview-2026-08-08.md) ·
[`op30-aktivierungsreife-2026-08-09.md`](betrieb/op30-aktivierungsreife-2026-08-09.md) ·
[`lage-narrativ-warteschlange-2026-08-09.md`](betrieb/lage-narrativ-warteschlange-2026-08-09.md) ·
[`op30-e1-abschlussreview-2026-08-09.md`](betrieb/op30-e1-abschlussreview-2026-08-09.md) ·
[`op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) ·
[`briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md).

**Befund (unverändert gültig).** Der V3-Motorkern skaliert; die Grenze liegt **davor**: jedem
Profil werden 7–8 eigene Google-Wege vorangestellt (Kipppunkt **n ≈ 14–15**). **Zurückgezogen**
bleiben „V3 ist für 1000 Mandate konzipiert" und „Skalierungsnachweis für 200 Mandate liegt
vor". Nicht die Warteschlange ist der Engpass (8 Worker: 4 093 Aufträge/s), sondern die
Slot-Zuteilung: mit Parallelität 8 + zwei Morgenslots **200/200 bei 59,6 % Reserve** (2026-08-09/3,
PR #237; R4/R4b behoben). **Offen:** echte Google-/KI-Laufzeit · wirksamer Production-Deckel ·
**190 fehlende echte Profile** (es gibt 10) · Vercel-Verhalten bei Parallelität 8.

**Vorlauf 2026-08-08…/11/5, alles gemergt (PR #233–#242).** Warteschlange, Worker, KI-Budget,
Relevanzordnung und das Lage-Narrativ (`HELMUT_NARRATIV_QUEUE`, default AUS) gebaut und
getestet; der Produktfehler „übersprungener V3-Lauf gilt als erledigt" lag nur auf einem nie
gemergten Branch und ist portiert + gehärtet; sechs Migrationspaare am 2026-08-11 10:47–10:52
UTC angewendet; der Regellauf danach lief unverändert auf dem Altpfad. **OP-31 Frischevertrag
BESTANDEN** (Restrisiko: ohne `HELMUT_CRON_FAIRNESS` können exakt überlappende Läufe doppelt
pushen; `briefings` wächst täglich, OP-12; Alarmweg OP-07). **Sprint /5 BLOCKIERT** — es fehlte
der Schreibweg zur Vercel-Env; dieser Zugangsblocker besteht unverändert fort.

**Aktivierungskontrollen (2026-08-11/6, Runbook §15).** Betreiber setzte
`HELMUT_SCALABLE_PIPELINE=on` (Redeploy READY 18:52:47Z, **unveränderter** Commit
`eb13652`); rein lesend kontrolliert. **K0 bestanden** (9/10; offen `/api/ops/jobqueue`
mangels `CRON_SECRET`). **Erster Lauf `crawl` 20:00 UTC** (**nicht** 16:00 — der Einsprung
sitzt in `cronSchwererPfad`, gilt für crawl **und** pipeline): 235 Aufträge, nur die fünf
Mandate, **0 für `mdb-a`**, Reihenfolge korrekt, 55 erledigt · 43 zurückgestellt ·
**0 endgültige Fehler** · 0 verloren · 0 Dubletten · 0 Pushs · Slot 266,6 s < 270 s ·
KI **+11 = +11 `knowledge_objects`** (Abweichung 0), `used` 52/100 · V2 **nicht** parallel.
Der Überspring-Fix ist **erstmals in Production belegt**. **Aber:** `zustand=kritisch`,
ältester offener Auftrag **5,84 Tage** ⇒ Grenze §8.2 **eingetreten**, K2/K3 nicht begonnen.
Ursache: **4** von 180 offenen Aufträgen sind zurückdatiert (Personenquellen, fällig seit
2026-08-06 — vorbestehender OP-15-Rückstand, erst durch die Warteschlange sichtbar).
**Die Grenze misst das Alter der *Fälligkeit*, nicht des *Auftrags*** — ein Mangel am
Nachweisvertrag; seine Korrektur ist ein **eigener Folgesprint**, nicht erledigt.

**Rücknahme (2026-08-12/1, Runbook §16, rein lesend).** Betreiber setzte
`HELMUT_SCALABLE_PIPELINE=off` (nur Production) + Redeploy: **`dpl_7kcdpTbh…` READY
2026-08-12T00:54:14Z / 02:54:14 Uhr Berlin**, `githubCommitSha` = `eb136522…` gegengeprüft,
`source=redeploy` (kein Codewechsel), Aliasse inkl. `helmut-pilot.vercel.app`. Anwendung
erreichbar (HTTP 200, ausgelieferte Assetversion `?v=eb136522` bestätigt den Commit aus der
Anwendung selbst). **Zustandsseitig vollständig belegt:** die 235 Aufträge unverändert
(`max(updated_at)` **2026-08-11 20:04:26Z**, triggergesichert; 0 laufend, **0 Leases**,
0 `attempts>1`, 0 endgültige Fehler, 0 Dubletten, 0 Fremdmandate) · `llm_reservations`
**0/0/0, nie beschrieben** · **für 2026-08-12 keine Zählerzeile ⇒ 0 KI-Aufrufe, 0 Kosten
nach der Abschaltung** (2026-08-11 endete bei `used`=73: 41→52 OP-30-Lauf, →73
`understanding`-Cron 21:30) · 5 Mandate, `mdb-a` (1/1/0/0) und OP-31-Belege (5+5) unverändert
· 0 neue Runtime-/DB-/RLS-/Berechtigungsfehler, Advisor unverändert · Migrationen 25,
Policies 24, RLS force auf beiden Tabellen, **keine Rücknahmemigration**.
**Wirkungsseitig noch NICHT belegt:** seit dem Redeployment lief kein `crawl`/`pipeline` —
Production sah nur 5× `/`, 2× `/api/auth/session`, 1× `understanding` (21:30, davor).
Direkte Env-Einsicht bleibt unmöglich (`CRON_SECRET` fehlt, Vercel-Egress `403`, erneut
gemessen). **Entschieden wird das am crawl 04:00 UTC / 06:00 Uhr Berlin** — zweiseitig
eindeutig, weil **alle 235 Aufträge fällig sind** (`due_at ≤ now`): bleibt `helmut_jobs`
byte-identisch, ist die Abschaltung wirksam. Rein lesende Fortsetzung dafür eingeplant.

**Folge für OP-25:** eine Aktivierung verändert `quellenVereinigung`, die
K2.1-Sichtbarkeitsmengen und die Laufzeitbilanz ⇒ **OP-25 muss danach von vorn**.


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

- **OP-25-Nachweis nach §7.7.5: BESTANDEN — drittes Fenster 2026-08-07/08 (Exit 0, null
  Befunde), kanonisch §7.7.9** (Aktivierung `dpl_AdZ4JJJ…`, PR #232 / `a07954df…`; alle
  Kriterien grün, Kosten 0,2106 USD, Belege `belege/op25-*`). Fenster 1 `nicht_bestanden`,
  Fenster 2 `nicht_pruefbar` — bleiben dokumentiert. **Geltung: nur die aktuelle Architektur
  mit 5 Mandaten — beweist weder OP-30 noch 200 Mandate; nach einer OP-30-Aktivierung
  vollständige Wiederholung.** OP-14 (Verstehensrückstand) bleibt offen.
- **OP-31-Nachweis: BESTANDEN — Morgenlauf 2026-08-11 05:00 UTC** (§7a). Kopfstatus/UI-Rendering
  live nicht per Session abgerufen (kein Zugangsgeheimnis in dieser Sitzung) — Aussage stützt
  sich auf den relational geprüften Beleg plus testgesicherten Code (F1–F6 des Reviews).
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

**Runbook §6 Schritt 1–4 sind erledigt, Schritt 5 wurde nach K1 abgebrochen, und die
Rücknahme (§7 Schritt 1) ist ausgeführt** (§12/§13/§15/§16). Reihenfolge jetzt:

1. **Sofort (rein lesend, keine Freigabe nötig):** Abnahme der Rücknahme am **crawl
   04:00 UTC / 06:00 Uhr Berlin** nach der Prüfliste Runbook §16.6 — erst danach ist die
   Abschaltung wirkungsbasiert belegt. **Kein manueller Cronlauf.**
2. **Danach eigener Folgesprint: Altersgrenze berichtigen** — §8.1 Nr. 11 / §8.2 und
   `betriebsstatus` auf das Alter des *Auftrags* (`created_at`) statt der *Fälligkeit*
   (`due_at`) beziehen bzw. den Erstlauf ausdrücklich ausnehmen (Runbook §16.10 Punkt 4).
   **Ohne diese Korrektur ist ein zweiter Aktivierungsversuch nicht sinnvoll bewertbar.**
3. Unabhängig davon: **OP-15** (Personenquellen von vier Mandaten seit 2026-08-06 nicht
   erfolgreich abgerufen) ist jetzt beziffert und gehört behoben; `CRON_SECRET`/Egress für
   eine Folgesitzung freigeben, sonst bleiben Messquelle **und** Rücknahmeweg
   betreibergebunden.
4. **Der Fünferlauf ist nicht bestanden** (K2/K3 nie begonnen) — eine Wiederholung beginnt
   bei §6 Schritt 3 und braucht wieder K0–K3.

Ausweitung auf 25+ erst nach K3 **und neu bestandenem OP-25**
([`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) §10);
vor Stufe 5: **190 fehlende echte Profile** (es gibt 10).

Parallel und unabhängig: **OP-01** (Pro + PITR); **OP-11** verifizieren; **#218** schließen.

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
| **OP-31: Frischevertrag + adversarialer Review (§10)** | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) |
| Roadmap Phase 1 | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständige Historie bis `4594fea`** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-12/1 | **OP-30-Rücknahmebeleg** (§7a): Abschaltung zustandsseitig vollständig belegt (235 Aufträge unverändert, 0 Leases, 0 Reservierungen, 0 KI-Aufrufe/Kosten, 5 Mandate, `mdb-a` inert, 0 neue Fehler) — **wirkungsseitig offen bis zum crawl 04:00 UTC**, weil seither kein Lauf stattfand; **Fünferlauf nicht bestanden, K2/K3 offen** · Runbook §16 | **teilweise abgeschlossen** |
| 2026-08-11/6 | **OP-30-Aktivierungskontrollen** (§7a): K0 bestanden, erster Lauf sauber, **Abbruchgrenze §8.2 eingetreten** ⇒ bei K1 gestoppt · Runbook §15 | **teilweise abgeschlossen** |
| 2026-08-11/5 | **OP-30-Aktivierung 5 Mandate** (§7a): Vorprüfung 14/15 grün, kein Schreibweg zur Vercel-Env ⇒ vor jeder Änderung gestoppt; nichts aktiviert · Runbook §14 | **blockiert** |
| 2026-08-11/4 | **OP-30-Neutralitätsnachweis** (§7a): Regellauf nach PR #241 rein lesend geprüft — Altpfad unverändert, 5/5 erfolgreich, `helmut_jobs`/`llm_reservations` nie beschrieben, `mdb-a` inert · Runbook §13 | **erfolgreich abgeschlossen** |
| 2026-08-11/3 | **OP-30-Vorwärtsmigrationen Production** (§7a): alle sechs Paare angewendet (10:47–10:52 UTC), lesende Abnahme grün, Advisor ohne neuen WARN/ERROR · Runbook §12 | **erfolgreich abgeschlossen** |
| 2026-08-11/2 | **OP-30-Aktivierungsvorbereitung** (§7a): Überspring-Produktfehler portiert (120/120), Migrationskette 31/31, `mdb-a` geklärt, Runbook · [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) | **abgeschlossen** (PR #240) |

Der Sprint 2026-08-09/2 (E1 `tenant_narrative`, PR #236 gemergt) und die OP-30-Sprints vom 2026-08-08 stehen vollständig in den Belegdateien aus §7a ([`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) trägt den CI-Basisrot-Befund). Die OP-25-Sprints vom 2026-08-01 bis 2026-08-08 stehen kanonisch in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9; Sprints bis einschließlich 2026-07-31 und ältere Beweisketten: **Archiv** ([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
