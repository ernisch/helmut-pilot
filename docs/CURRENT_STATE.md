# CURRENT STATE — Helmut

**Stand: 2026-08-15** (Straenge: **(a) OP-25-Production-Nachweis BESTANDEN** (§7.7.9; gilt nur fuer die heutige Architektur mit 5 Mandaten). **(b) OP-30-Fuenferlauf, zweiter Versuch (12./13.08.): NICHT bestanden — kontrollierte Ruecknahme VOR Grenzuebertritt** (Runbook §19): Ankunft ~440–470 Auftraege/Tag ≫ Abfluss ~130–180/Tag ⇒ Flag wieder `off`; **524 wartende Auftraege bleiben inert**. **(c) OP-30-ZIELARCHITEKTUR gebaut und lokal nachgewiesen** (§7c; Outbox + austauschbarer Transport + verteilte Grenzen + Vorgangswache + SQS/Lambda-Transport; Production unangetastet, alles Default-AUS, AWS **nicht** ausgerollt; Belegdatei §17–§26). **(d) OP-31 Frischevertrag BESTANDEN** (5/5 am 13.08.). **(e) atomarer Verstehensvertrag (CAS) gemergt** (§7d, PR #248). **(f) NEU 15.08.: die fuenf OP-30-Migrationen sind auf Production ANGEWENDET** — 5/5 fehlerfrei, Warteschlange unveraendert 524/235/0/0, alle neuen Strukturen leer, **alle Flags blieben aus**, alter Motor aktiv; die Aktivierung ist eine eigene, offene Entscheidung (§7e, Runbook §24.10).) Diese Datei enthaelt
**ausschließlich den aktuellen, entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die vollständige
Historie liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `6a501ee`** = Merge **PR #248** (CAS, alles Default-AUS). Production läuft auf
  diesem Commit (`dpl_Cuub2Uu8vpE5…`, READY 2026-08-15T02:51Z) mit
  `HELMUT_SCALABLE_PIPELINE=off`. **Auf diesem Commit ist noch kein Cron gelaufen** (erster:
  morning-briefing 05:00 UTC). Davor `9923a7e` (#247), `8088fc9` (#245), `1fd9c98` (#244),
  `104f4e1` (#243); ältere Merges: Archiv/Runbook.
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

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
- **Migrationen:** die **fünf OP-30-Dateien sind am 15.08. angewendet** (§7e, Runbook §24.10;
  Einträge `20260815163732`–`20260815164241`). **Offen ist nur noch `20260720`** (OP-03).
  Alle neuen Strukturen sind leer und wirkungslos, solange die Flags aus sind.
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

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **`HELMUT_CRON_GLOBALABRUF`** | **`on`** seit 2026-08-06 ~08:15 UTC (Betreiber, für das Nachweisfenster) ⇒ **Kontextpfad aktiv**, laufzeitbelegt (drei Fensterläufe 06./07.08. global auf `d8bf68fa…`, E3 `nv=0`). Ob es `on` bleibt, ist Betreiberentscheidung. Dritter Zyklus |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **`HELMUT_SCALABLE_PIPELINE` (OP-30)** | **`off`, wirkungsbasiert belegt** (Rücknahme des zweiten Versuchs 2026-08-13 16:27Z; crawl 20:00 UTC lief vollständig über den Altpfad, `pg_stat helmut_jobs` 939/1765/180 unverändert — Runbook §19.5). **524 wartende Aufträge stehen inert** (niemand holt sie ab, keine Kosten); vor einem dritten Versuch: Abflussrate-Entscheidung + erneute Neutralisierung (Runbook §19.6) |
| **`HELMUT_VERSTEHEN_CAS` (OP-30 CAS)** | **aus** (nirgends gesetzt). Ohne das Flag laeuft der Karten-Store byte-identisch weiter und jede Verstehensparallelitaet > 1 wird hart auf 1 geklemmt. Migration `20260814180000` ist seit 15.08. **angewendet** und laufzeitbelegt inert (§7e) — **das Flag ist der naechste, kleinste Aktivierungsschritt** (Runbook §25) |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge; Code-Default wäre AUS). Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt); der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-11)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#231** (Draft) | OP-03 Konten-Vorbedingung, 1 Konto je Mandat | in §6 bisher nicht geführt (Korrektur 2026-08-11/2); Betreiberentscheidung |
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#248** — CAS, Merge-Commit `6a501ee` —, davor #247, #246, #243,
#239, #238, #237, #236, #235, #233). Historie: Archiv.

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

Die Einzelheiten stehen in den Belegdateien; hier steht nur, was für eine Entscheidung zählt.
**Kanonisch:** Runbook [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)
§9/§12–§19 und §24.

**Befund (unverändert gültig).** Der V3-Motorkern skaliert; die Grenze liegt **davor**: jedem Profil
werden 7–8 eigene Google-Wege vorangestellt (Kipppunkt **n ≈ 14–15**). **Zurückgezogen** bleiben „V3 ist
für 1000 Mandate konzipiert" und „Skalierungsnachweis für 200 Mandate liegt vor". Engpass ist nicht die
Warteschlange (8 Worker: 4 093 Aufträge/s), sondern die Slot-Zuteilung: mit Parallelität 8 + zwei
Morgenslots **200/200 bei 59,6 % Reserve** (PR #237). **Offen:** echte Google-/KI-Laufzeit ·
wirksamer Production-Deckel · **190 fehlende echte Profile** (es gibt 10) · Vercel bei Parallelität 8.

**Vorlauf 2026-08-08…/11/5, alles gemergt (PR #233–#242).** Warteschlange, Worker, KI-Budget,
Relevanzordnung und Lage-Narrativ gebaut und getestet; sechs Migrationspaare am 2026-08-11 angewendet.
**OP-31 Frischevertrag BESTANDEN** (Restrisiko: ohne `HELMUT_CRON_FAIRNESS` können exakt überlappende
Läufe doppelt pushen; `briefings` wächst täglich, OP-12; Alarmweg OP-07). Versuch 1 (Runbook
§15–§17) ist historisch abgeschlossen: Berichtigung und Neutralisierung sind ausgeführt.

## 7b · Zweiter Versuch 2026-08-12/13: Kapazitätsbefund, kontrollierte Rücknahme (Runbook §19)

**K0 vollständig bestanden**; Betreiber aktivierte 18:50 UTC (`dpl_9Pvj1N6y…`, Commit `8088fc9`).
**Fünf Läufe, alle fehlerfrei und fair**: 0 endgültige Fehler, 0 Dubletten, 0 fremde Mandate,
kein Deckelkontakt, keine neue Fehlerklasse.

**Aber: Ankunft ~440–470 Aufträge/Tag ≫ Abfluss ~130–180/Tag** (worker=2, Slotbudget 270 s,
3–4 Drain-Slots/Tag) ⇒ Bestand 0→182→371→**524**; die 24-h-Wartezeitgrenze der Altaufträge war
rechnerisch sicher nicht mehr einhaltbar. **Rücknahme VOR Grenzübertritt** (Betreiber, 16:27 UTC,
`dpl_5Ktikubeezvj…`); **Wirkungsnachweis am crawl 20:00 bestanden** (§19.5: Altpfad, `pg_stat`
939/1765/180 unverändert). Kein Warteschlangenfehler — der Motor ist mit Defaults zu langsam für die
eigene Ankunftsrate. **Kriterienbefunde §19.6:** §8.3-Watchdog-Kriterium queue-inkompatibel ·
`llm_usage` leer · `zustand=unbekannt` bei Metrik-Lesetimeout. **Vor Versuch 3
(Betreiberentscheidung):** Abflussrate **und** erneute Neutralisierung der 524 inerten Aufträge (§17.8).

**Folge für OP-25:** eine Aktivierung verändert `quellenVereinigung`, die K2.1-Sichtbarkeitsmengen
und die Laufzeitbilanz ⇒ **OP-25 muss danach von vorn**.

## 7c · Zielarchitektur-Sprint 2026-08-13/3 (erfolgreich abgeschlossen; Aktivierung = Betreiberentscheidung; Belegdatei §17–§26)

Der Kapazitätssprint nach §7b wurde **kontrolliert abgebrochen**; die Zwischenlösung
(Parallelität 6 + sechs Drain-Slots) wurde **verworfen**. Stattdessen gebaut und lokal
nachgewiesen (Production nur lesend): **transaktionale Outbox** (`20260813090000`, atomar mit
dem Auftrag, ohne Inhaltsspalte) · **austauschbarer Transport**
(`HELMUT_JOB_DISPATCH_MODE=off|shadow|queue`, fail closed; Payload nur
`{jobId, schemaVersion}`) · **verteilte Klassengrenzen** (`20260813090100`: quellenabruf 5 ·
verstehen 1 · worker-drain 1) · **Vorgangswache** (`HELMUT_VERSTEHEN_KONKURRENZ`, aus).
Lastnachweis 5–500 an echter PostgreSQL (kein Verlust, keine Doppelarbeit; 500er-Reserve ×3,7
— **kein Production-Beweis**; KI-Bedarf ~1.040/Tag bei 500 ≫ Deckel 130). Die Läufe 14/3–14/5
schlossen neun Betriebs-, Einsatz- und Bereitstellungsblocker (Outbox-Relay · Lambda-Paket ·
SSM-Startweg · Anbietersteuerung · KMS · CloudFormation erstbereitstellbar). Der
AWS-Trockenlauf bleibt offen (§26.3), ebenso §25.3; **AWS ist nicht ausgerollt**. Kanonisch:
[`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md)
(Varianten, Mengengerüst, Stufenplan, Betreiberablauf); Runbook §20.

## 7d · Verstehensparallelität und CAS — gemergt als PR #248 (lokal belegt)

Der **letzte globale Engpass** der Zielarchitektur ist beseitigt: `verstehen` stand auf
Parallelität 1, weil die Update-Vormerkungen in **einer Karte** mit Lesen → Ändern → Schreiben
gepflegt wurden (`CLAUDE.md` §4 Regel 10). Ersetzt durch den **atomaren Verstehensvertrag**
(Migration `20260814180000`, seit 15.08. angewendet, §7e): eine Zeile je Vorgang mit Besitzer,
Lease und monotonem Fencing-Wert. Der Korrekturlauf 15.08. schloss drei bestätigte Lücken
(at-most-once nach dem Modellstart · Lease-Zwang · Fencing-Umgehung bei Wertgleichheit).

**Flag `HELMUT_VERSTEHEN_CAS` ist AUS**; Parallelität > 1 wird ohne den Vertrag **hart auf 1
geklemmt**, Obergrenze 8. Nachweise: DB-Suite **103 PASS** · Vertragssuite **107 PASS** ·
**Mutationsprobe 9/9 rot** · Kapazitätsmodell **37 PASS**. **Helmut ist NICHT für 25–500
Mandate freigegeben** — bindend bleiben KI-Tagesdeckel und OP-15. Kanonisch:
[`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md); Runbook §23/§25.

## 7e · Die fünf OP-30-Migrationen sind ANGEWENDET und laufzeitbelegt inert (15./16.08.)

**Angewendet 15.08. 16:37–16:43 UTC (freigegeben): 5/5, 0 Fehler, 0 Rücknahmen.** Ablauf, Vorbedingungen,
Prüfsummen und Verifikation je Schritt: Runbook
[`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) **§24.10**, Laufzeitnachweis **§24.11**.
Schema additiv 44→51 Tabellen, 148→180 Funktionen, 546→597 Spalten, 18→20 Trigger; RLS an+erzwungen 7/7,
0 Policies, 0 Rechte für `anon`/`authenticated`, 32/32 Funktionen `SECURITY INVOKER` mit festem `search_path`.

**LAUFZEITINERTHEIT BESTÄTIGT (16.08., rein lesend).** Zwei vollständige Zyklen auf dem
migrierten Schema — crawl 20:00 UTC und der ganze Morgenzyklus (globalphase 04:03 ·
understanding-eager 04:04 · briefing-morning 05:01 · understanding-cron 05:30 ·
briefing-lage 05:45): alle Läufe im Normalband der gesunden Zyklen davor, **`error_class`
über 6 Tage durchgehend `null`, `failed_count` 0**, Briefings **5/5 Mandate je Slot**
(dieselben fünf). Der Fencing-Trigger ist aktiv und sah **145 echte Schreibvorgänge**
(139 INSERT + 6 UPDATE) — alle liefen durch, **kein `HV001`/`HV002`**, `verstehen_fencing`
bei **0 von 6.830** Wissensobjekten gesetzt. Warteschlange unverändert **524/235/0/0**, 0 Leases,
Signatur `a069f91fde4547493796395f2c989497`, jüngster Auftrag weiterhin 13.08.; alle sieben neuen
Tabellen **0 Zeilen**; KI-Tagesbudget im Normalband (15.08. 70); keine neue Fehlerklasse.

**Alle fünf Flags blieben aus** — der alte Motor ist der aktive Pfad. **Die Aktivierung ist
eine eigene, offene Entscheidung; der Plan dafür steht in Runbook §25.**

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| **OP-25** Fairness/Zeitdeckelung — Rotation, K1, K2.1, Nachweisvertrag §7.7.5 + Werkzeug; **Korrekturen K1–K8 gemergt (PR #229)**; beide Betreiberschritte K2/K3 erledigt | Ursachenanalyse §7.7.6; alle acht Korrekturen grün (§7.7.7; Vertrag 271/271 · E3 55/55 · Laufpaar 29/29 · Watchdog 26/26 · Mutationsprobe 87/87 rot). **Es fehlt nur noch der neue Nachweis von vorn (separate Startfreigabe, §11).** Offen bleiben zudem Abdeckungsmessung, Abdeckungsalarm, R-1, R-3 |
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
- **OP-31-Nachweis: BESTANDEN — Morgenlauf 2026-08-11 05:00 UTC** (§7a). Kopfstatus/UI live
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

**Zielarchitektur (#247) und CAS (#248) sind gemergt, die fünf Migrationen sind angewendet
(§7e).** Production läuft unverändert im Normalbetrieb auf dem Altpfad:

1. **Betreiberentscheidung: `HELMUT_VERSTEHEN_CAS=on` als erste kontrollierte Stufe?** Die
   Struktur steht in Production und ist laufzeitbelegt inert (§7e). Der ausformulierte
   Betreiberplan — Vorbedingungen, genaue Schritte, Kontrollen, Rückweg, Abbruchgrenzen —
   steht in Runbook **§25**. Es ist der kleinste umkehrbare Schritt: der Durchsatz ändert
   sich **nicht** (Parallelität bleibt 1), die 524 Aufträge bleiben unberührt. **Stufe 1 des
   Stufenplans** (Zielarchitektur §14: `HELMUT_SCALABLE_PIPELINE`/`…DISPATCH_MODE=shadow`)
   ist davon getrennt und hat **zwei offene Vorbedingungen** (Punkt 2). Nichts ist freigegeben.
2. **Vor Versuch 3:** die 524 inerten Aufträge neutralisieren (bewiesenes Muster Runbook
   §17.8/§17.10) und §8.3/§8.4 (Watchdog-Kriterium) queue-tauglich umformulieren.
3. Versuch 3 nach Stufenplan (Zielarchitektur §14, Stufe 1: Migrationen `20260813` anwenden +
   `HELMUT_JOB_DISPATCH_MODE=shadow`); beginnt unverändert bei Runbook §6 Schritt 3 mit K0–K3.
   Der CAS-Vertrag ist davon **unabhängig** freigebbar (Runbook §23.1: Migration → Flag →
   erst danach Parallelität).
4. Unabhängig davon: **OP-15** (Personenquellen) beziffert und offen; `CRON_SECRET`/Egress
   für eine Folgesitzung freigeben (schließt die K0-Teillücke `/api/ops/jobqueue`).

Ausweitung auf 25+ erst nach K3 **und neu bestandenem OP-25**
([`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) §10);
vor Stufe 5: **190 fehlende echte Profile** (es gibt 10). Parallel: **OP-01**; **OP-11**
verifizieren; **#218** schließen.

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
| **Vollständige Historie bis `4594fea`** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-14/6 + Korrekturlauf 15.08. | **Verstehensparallelitaet und CAS** (Belegdatei [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md)): atomarer Verstehensvertrag loest den Karten-Store ab; Korrekturlauf schliesst 3 Luecken (at-most-once nach Modellstart, Lease-Zwang, Fencing-Umgehung) | DB-Suite **103 PASS** (echte Nebenlaeufigkeit), Vertragssuite **107 PASS**, Mutationsprobe **9/9 rot**, Kapazitaetsmodell **37 PASS**; alles Default-AUS |
| 2026-08-16 | **Laufzeitnachweis der fuenf Migrationen** (§7e, Runbook §24.11), rein lesend: crawl 22:00 + vollstaendiger Morgenzyklus auf dem migrierten Schema gegen die gesunden Zyklen davor | **erfolgreich abgeschlossen** — alle Laeufe im Normalband, `error_class` 6 Tage `null`, Briefings 5/5 je Slot, 145 Schreibvorgaenge auf `knowledge_objects` ohne `HV001`/`HV002`, Fencing ueberall NULL, Warteschlange/Signatur unveraendert; **Laufzeitinertheit bestaetigt**; Betreiberplan Runbook §25 |
| 2026-08-15 | **Vorpruefung + Anwendung der fuenf OP-30-Migrationen auf Production** (§7e, Runbook §24), freigegeben, Fenster 18:10–19:50 Berlin | **erfolgreich abgeschlossen** — Vorpruefung fand **einen Befund** (fehlende Transaktionsklammer, PR #249 gemergt); danach 5/5 angewendet, 0 Fehler, 0 Ruecknahmen; Warteschlange je Schritt 524/235/0/0, alle neuen Tabellen leer; **alle Flags blieben aus** |
| 2026-08-14/5 | **CloudFormation-Korrektur OP-30** (Belegdatei §26): zwei Bereitstellungsblocker — Rollen-Principals in der Schluesselrichtlinie (Zyklus) und ein Riegel an der OPTIONALEN `KeyPolicy` | Ende-zu-Ende **53 PASS**, Infrastruktur **124 PASS**, Mutationsprobe **16/16 rot**; AWS und Production unangetastet |

Die sechs OP-30-Sprints davor (Zielarchitektur 13/3 bis CloudFormation 14/5) stehen vollstaendig in der Belegdatei [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) §17–§26. Die Sprints 2026-08-11/3 – 13/2 (bis zum **zweiten Fuenferlauf, nicht bestanden**) stehen kanonisch im Runbook [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §12–§19. Sprint 2026-08-09/2 und die OP-30-Sprints vom 2026-08-08: Belegdateien aus §7a ([`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) traegt den CI-Basisrot-Befund). OP-25-Sprints 01.–08.08.: [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9; alles bis 2026-07-31: **Archiv**.
