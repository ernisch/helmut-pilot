# CURRENT STATE — Helmut

**Stand: 2026-08-17.** OP-25 ist für die aktuelle Fünf-Mandate-Architektur bestanden;
OP-31 ist bestanden. Die OP-30-Zielarchitektur und der atomare Verstehensvertrag sind
gemergt. Alle fünf OP-30-Migrationen sind in Production angewendet und laufzeitbelegt
inert; alle neuen Motor-Flags bleiben aus, der Altpfad ist aktiv. Der nächste Schritt
ist eine eigene Betreiberentscheidung über die erste kontrollierte CAS-Aktivierung (§11).

Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand. Die vollständige
Fassung vor dieser Verdichtung liegt verlustfrei in
[`archive/project_state/2026_08_17_CURRENT_STATE_full.md`](archive/project_state/2026_08_17_CURRENT_STATE_full.md).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `51d0e80`** = Merge **PR #251** am 2026-08-16. Der PR änderte nur
  `docs/CURRENT_STATE.md`, das OP-30-Aktivierungs-Runbook und den CAS-Nachweis:
  Laufzeitinertheit der fünf Migrationen bestätigt, Betreiberplan §25 ergänzt.
- Der PR-Head `4289261` hatte grüne Pflicht-CI und einen grünen Vercel-Status; keine
  formale Review. Das Production-Deployment auf `51d0e80` wurde am 16.08. als READY
  belegt. Danach ist auf `main` kein weiterer Commit vorhanden.
- Relevante Vorgänger: **#250/#249** Migrationsorganisation und Transaktionsschutz,
  **#248** CAS, **#247** Zielarchitektur. Merge nach `main` löst automatisch ein
  Production-Deployment aus.

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
  Ankunft etwa 440–470 Aufträge/Tag, Abfluss etwa 130–180/Tag. Die Warteschlange steht
  seitdem inert bei **524 wartend / 235 erledigt / 0 laufend / 0 fehlgeschlagen**.
- Die Zielarchitektur (Outbox, austauschbarer Transport, verteilte Klassengrenzen,
  Vorgangswache) ist gemergt und lokal lastgetestet. AWS ist nicht ausgerollt.
- Der atomare Verstehensvertrag (CAS) ist gemergt. Die fünf zugehörigen Migrationen
  wurden am 15.08. fehlerfrei angewendet.
- Zwei vollständige Produktionszyklen belegten am 15./16.08., dass die neuen Strukturen
  bei ausgeschalteten Flags inert sind: 5/5 Briefings je Slot, keine neue Fehlerklasse,
  145 Schreibvorgänge ohne `HV001`/`HV002`, Warteschlange und Signatur unverändert.
- **Alle OP-30-Motor-Flags bleiben aus; der Altpfad ist aktiv.** Für 25–500 Mandate
  besteht keine Produktionsfreigabe.

Kanonisch: [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)
§24/§25, [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md)
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

**Erste kontrollierte OP-30-Stufe: `HELMUT_VERSTEHEN_CAS=on` als Betreiberentscheidung.**

1. Vorbedingungen nach Runbook §25.2 erneut vollständig lesend prüfen.
2. Nur bei Grün setzt der Betreiber das CAS-Flag und löst ein unverändertes Redeploy aus.
3. Sofortkontrolle, Wirkungskontrolle nach dem 21:30-UTC-Lauf und Bestätigung nach dem
   Morgenzyklus des Folgetags; bei jeder Abbruchgrenze Flag leeren und redeployen.
4. Durchsatz und Parallelität bleiben dabei unverändert bei 1; die 524 inerten Aufträge
   und das KI-Budget dürfen sich nicht verändern.
5. Erst nach bestandenem CAS-Beweis über Parallelität oder Schattenbetrieb entscheiden.

Für den Schattenbetrieb bleiben zwei Vorbedingungen offen: 524 inerte Aufträge erneut
neutralisieren und den Watchdog-Vertrag queue-tauglich fassen. Die fünf OP-30-Migrationen
sind bereits angewendet und dürfen **nicht** erneut ausgeführt werden. Nach jeder
wirksamen OP-30-Aktivierung ist OP-25 vollständig zu wiederholen.

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

- **16.08., PR #251:** Laufzeitinertheit der fünf Migrationen bestätigt; Betreiberplan
  der ersten CAS-Aktivierung dokumentiert; nur Dokumentation.
- **15.08., PR #249/#250:** fünf OP-30-Migrationen nach Transaktions- und
  Organisationskorrekturen fehlerfrei auf Production angewendet; alle Flags aus.
- **14./15.08., PR #248:** atomarer Verstehensvertrag und drei Korrekturen lokal belegt.
- **13./14.08., PR #247:** OP-30-Zielarchitektur und Bereitstellungsweg gebaut; AWS nicht
  ausgerollt.

Ältere Sprintberichte stehen in den kanonischen Belegdateien aus §13 und in der
verlustfreien Archivfassung vom 17.08.
