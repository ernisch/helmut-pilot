# CURRENT STATE — Helmut

**Stand: 2026-08-24, Gesundheitsbot-Sprint (Teil A lesende Production-Analyse ~06:45 UTC · Teil B Bot-PR).**
**Der Warteschlangenmotor läuft seit 23.08. abends in Production (Versuch 5, Betreiberaktivierung; erste Queue-Quittung `cron-crawl-20260823200257`, 20:02 UTC).** Der aktuelle Production-Nachweis ist **grün**: alle Slot-Läufe seit Aktivierung `success` (20:02 → 117/137 · 04:03 → 204/238 · Watchdog-Ersatzlauf 06:01 → 55/67; jede Zielmenge vollständig aufgelöst in erledigt/zurückgestellt/wiederholt/Stapelrest), Queue 57 wartend / 611 erledigt / 0 laufend / 0 fehlgeschlagen, **0 hängende Leases**, CAS 296 `fertig` + 1 `aufgegeben` / **0 `unbekannt`**, Outbox 53 bestätigt / 321 verzichtet / 59 offen (Weck-Transport nicht ausgerollt, Cron-Fallback trägt — kein Stau).

**Der WhatsApp-Gesundheitsbot war bis 24.08. an tote Altquittungen gebunden:** der Blob `crawlRuns` endet seit der Aktivierung bei einem Projektionslauf mit 0 Quellen (16:03 UTC 23.08.) → fälschlich „Teilweise gestört" trotz gesundem Motor. Teil B stellt ihn auf die echten Motor-Quittungen um (`process_runs`, `betriebsstatus`, CAS); PR aus Branch `claude/whatsapp-bot-queue-engine-analysis-tom08f`, nicht gemergt.

**Der Monitoring-Zweitkanal (OP-07) stellt entgegen früherem Stand seit mind. 17.08. täglich zu** (Zustellstatus belegt 24.08., HTTP 200, attempts 1). Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte, nahezu identische WhatsApp-Eingang 09:02 TR sind **noch nicht abschließend geklärt** — Betreiberprüfung offen; kein Code-„Fix" vor dieser Klärung.

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

- Der letzte funktionale Stand vor diesem reinen Dokumentationsnachtrag ist
  **`bb1c992e` = Merge PR #261**: sichtbare quellenpflichtige Inhalte in
  Radar, Lage, Briefing und Büro benötigen eine echte öffnende HTTPS Quelle.
- Im selben geprüften Bereinigungszug wurden **PR #225** (LINIE Produktroadmap) und
  **PR #216** (Stabilisierung einer flackernden Offline Prüfung) gemergt.
- Davor: **PR #262** (`81f396b5`) enger Betreiberabschluss für dauerhaft folgenlose
  Wiederaufnahmefreigaben, **#260** Wiederaufnahmepfad, **#259** Restzeitwache und
  **#256** Blobentkopplung plus Slotquittung.
- Merge nach `main` löst automatisch ein Production Deployment aus. Alle Deployments
  dieses Bereinigungszugs wurden einzeln gegen Vercel geprüft.

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
- **Migrationen:** die fünf OP 30 Dateien sind seit 15.08. angewendet (§24.10).
  Zusätzlich ist die freigegebene Migration `20260823043633` seit 23.08. installiert.
  Die Buchführung steht bei 33 Einträgen und endet bei `20260823063208`; für dieselbe
  Migration existieren zwei bytegleiche Einträge (`20260823063140` und
  `20260823063208`) aus zwei parallelen Anwendungen. Funktion genau einmal vorhanden,
  keine Datenwirkung; kein Bereinigungseingriff. **Offen ist nur `20260720`** (OP 03).
  Schattenpfadstrukturen bleiben leer und wirkungslos, solange der Motor aus ist.
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
| **`HELMUT_SCALABLE_PIPELINE` (OP 30)** | **`on` seit 23.08. abends (Betreiber, Versuch 5)** — Queue-Slots quittieren `success` (Kopf dieser Datei); Nachweisführung läuft, OP-25 ist danach vollständig zu wiederholen |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge; Code-Default wäre AUS). Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt); der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Pull Request Bereinigung

Stand 10:31:35 TR / 09:31:35 Berlin / 07:31:35 UTC: **gemergt** wurden #225 Produktroadmap, #216 Teststabilisierung und
#261 Quellenpflicht. Die echten Diffs umfassten zuletzt 1, 3 und 20 Dateien; alle
Pflichtprüfungen und Vercel Deployments waren vor jedem Merge grün.
**Geschlossen, nicht gemergt:** #218 war durch #219 überholt; #231 und #224 waren
veraltet und konfliktbehaftet; #255 blieb wegen seiner Bedingung geschlossen: kein Merge
vor dem ersten grünen OP 30 Wirkungslauf. Zweige und Historie bleiben erhalten.
Nach dem Dokumentationsmerge 23.08.: 0 Pull Requests offen. Am 23.08. abends startete
der Betreiber Versuch 5; am 24.08. kommt der Gesundheitsbot-PR (Teil B, §14) hinzu.

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
8. **Lage-Rotation (eigener Kapazitätspunkt):** der Lage-Cron schafft 2 Mandate je Tageslauf
   (Zeitbudget, systemErrors 21.–23.08.) — bei 25 Mandaten wären das ≈ 13 Tage je
   vollständiger Rotation. Vor Zweitmandanten-Skalierung Kapazitätsentscheidung nötig;
   ab Merge von Teil B meldet der Bot den Rückstand als Produkthinweis, nicht als Störung.

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
  §27): Planung/Outbox einwandfrei, aber **0 Abschlüsse** in beiden Slots (Blob-Row-Lock-
  Konvoi je Auftrag, fehlende Slot-Quittung); Rest 383 inert, 2 CAS-`unbekannt`
  (`modellfehler`/Timeout). Befunde und Zahlen kanonisch in §27.
- **19.08. (drei Sprints, kanonisch Runbook §28):** PR #256 Blob-Entkopplung
  (`source_fetch` relational kanonisch, Slot-Quittung `process_runs`, Altpfad
  byte-identisch) · PR #257 gemischtes Neutralisierungsverfahren 58/0 + CAS-Behandlung ·
  Vollzug §28.8: exakt 383 inerte Aufträge gelöscht, Wiederholungsschutz belegt.
- **Versuch 4 (20.08.) VOR der Aktivierung beendet — gescheitert vor Aktivierung (§29):**
  Teil C grün (live gegenbestätigt), Teil D blockiert durch `df1a6700` und `eff40db2`
  (Details/Belege, Ursachen und Reparatur kanonisch in Runbook **§29**; Suite
  `verstehen-restzeit-test.js` 50/50 inkl. Review-Korrektur, keine Offline-Regression).
- **§30 und §30.5 in Production vollzogen (23.08.):** 492dcd48 ist im regulären
  05:30 UTC Lauf mit exakt einem weiteren Versuch und KI Aufruf fertig geworden
  (2/2/2, `ergebnis_fencing=2`). PR #262 wurde gemergt und als Production Deployment
  `dpl_8Z74anCHqxZVNQjmUPs5UGq7GuRZ` READY ausgeliefert.
- Die freigegebene Migration `20260823043633` wurde installiert. Zwei bytegleiche
  Buchungseinträge dokumentieren die parallele Doppelanwendung; Funktion genau einmal,
  Datenanker unverändert, kein Bereinigungseingriff.
- Der freigegebene Abschluss für df1a6700 lief um 06:38:54 UTC über den kanonischen
  Funktionsweg und gab `aufgegeben` zurück. Zustand `aufgegeben`, Grund
  `aufgegeben-nach-freigabe`, Zähler und Fencing unverändert 1/1/1. Danach nur dieser
  eine Reservierungsdatensatz verändert; Queue 0/235/0/0, Outbox 0, Vormerkungen 0.
- **V4 Nachkontrolle 23.08. 06:44:50 UTC:** V4 1/2/3/4/6/7 grün; V4 5 war bis zur
  Aktivierung offen.
- **Versuch 5 ist seit 23.08. abends AKTIV** (Betreiberaktivierung; erste
  Warteschlangen-Quittung 20:02 UTC). Alle Slots seither `success`, 0 `unbekannt`,
  0 hängende Leases (Zahlen im Kopf). Seit der Aktivierung füttert der Motor den Blob
  `crawlRuns` nicht mehr; der GitHub-Watchdog (K7) findet darum keinen brauchbaren
  Altlauf mehr und stößt täglich einen harmlosen Ersatzlauf an (24.08. 06:01, Lauf #59)
  — Anpassung der K7-Vorprüfung ist ein eigener offener Folgepunkt.
Kanonisch: [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)
§24/§25/§26/**§27**, [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md)
und [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md).

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04-Teil) — 5 Profile am 2026-08-04 repariert | 29B (lesender Fehlerzustands-Nachweis); relationale Profilzeilen bleiben veraltete Schnappschüsse (F-P6); K2 |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| Monitoring-Zweitkanal (OP-07) | Webhook stellt seit mind. 17.08. täglich zu (belegt 24.08.); Ziel-URL und doppelter WhatsApp-Eingang ungeklärt (Betreiber) |
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

Versuch 5 läuft (Betreiberaktivierung 23.08. abends); der Nachweis ist bislang grün.
Empfohlen, in dieser Reihenfolge:

1. **Bot-PR entscheiden** (Branch `claude/whatsapp-bot-queue-engine-analysis-tom08f`):
   ohne ihn meldet der Bot ab 25.08. 06:00 UTC fälschlich „Kritisch/Cron überfällig",
   weil der Blob `crawlRuns` seit der Aktivierung leer ausläuft.
2. **Betreiberprüfung Doppelkanal:** Ziel von `HELMUT_MONITORING_WEBHOOK_URL` prüfen (Kopf); erst danach ein Kanalschritt.
3. **Versuch 5 weiter beobachten** (Slots, Leases, CAS `unbekannt`, Budget), danach
   **OP-25 vollständig wiederholen**; K7-Vorprüfung des GitHub-Watchdogs anpassen
   (täglicher unnötiger Ersatzlauf). OP-15 und `CRON_SECRET`/Egress bleiben offen.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung,
  keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe.
- Migration auf Production: `20260823043633` ist freigegeben angewendet; die zwei
  bytegleichen Buchungseinträge bleiben dokumentiert. Offen ist nur `20260720`; jede
  künftige Anwendung bleibt freigabepflichtig.
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

- **24.08. (Gesundheitsbot Teil A+B):** Teil A rein lesend: Motor seit 23.08. abends
  aktiv und grün belegt; „Teilweise gestört" als Artefakt toter Blob-Altquittungen
  (Projektionslauf 0 Quellen) identifiziert; Quittungszahlen vollständig aufgelöst
  (238=204+23+11 · 67=55+12 · 137=117+8+4+8 Stapelrest); Doppelnachricht: ein Lauf,
  zwei Kanäle (CallMeBot + Webhook 06:01:11 UTC), Ziel-URL ungeprüft. Teil B: Bot auf
  Motor-Quittungen umgestellt (`lib/helmut/motor-health.js`, Weiche in `server.js`,
  Altpfad byte-gleich; vier Zustände Grün/Hinweise/Gestört/nicht bestimmbar); ein
  adversarialer 18-Befunde-Review härtete Slot-Fensterbindung, `blocked`-Leerlauf,
  Rot-vor-Unbestimmt und stabile Slugs nach. Suite `motor-health-test.js` 38/38,
  Offline-Lauf 267/273 (6 rote Suiten = umgebungsbedingter Altbestand, Basislauf
  identisch; F-E2E-Flake unverändert offen). Bekannte, bewusst offene Grenzen:
  Webhook-Ereignistyp bleibt bei „nicht bestimmbar" konservativ `alarm`;
  Quittungssicht braucht den relationalen Lesepfad (sonst „nicht bestimmbar").
- **23.08. (GitHub Bereinigung):** #225 Produktroadmap, #216 Teststabilisierung und
  #261 Quellenpflicht nach aktualisiertem Diff, Pflichtprüfungen und erfolgreichem
  Vercel Deployment gemergt. #218, #231, #224 und #255 mit konkreter Begründung
  geschlossen; danach 0 offene Pull Requests. Keine Datenbankaktion, kein Flag,
  kein KI Lauf und kein Versuch 5.
- **23.08. (§30.5 vollständig vollzogen):** PR #262 gemergt und deployt, Migration
  `20260823043633` freigegeben installiert, df1a6700 nach bestandener Vorprüfung über
  `helmut_verstehen_ausgang_aufloesen(..., 'aufgeben')` terminal abgeschlossen.
  Rückgabe `aufgegeben`; genau eine Reservierungszeile verändert, Zähler/Fencing 1/1/1.
  Nachkontrolle: 239 fertig / 1 aufgegeben, Queue 0/235/0/0, Outbox/Vormerkungen/Leases 0.
  Buchführung mit zwei bytegleichen Migrationseinträgen dokumentiert und nicht bereinigt.
  V4 1/2/3/4/6/7 grün, V4 5 offen; Versuch 5 nicht gestartet.
- **23.08. früh (Nachtrag zum Betreibersprint, AUSGEFÜHRT):** eigenständige Freigabe nur
  für 492dcd48 — kanonisch `pruefen` 04:15:46 UTC und `erneut` 04:15:53 UTC (Marker genau
  1×); Zähler/Fencing unverändert 1/1/1, keine Lease, kein Modellaufruf, 0 HV001/HV002;
  df1a6700 und alle übrigen Zustände byte-gleich (CAS 223/2/0, Queue 0/235/0/0, Outbox 0).
- **22./23.08. (Betreibersprint, BLOCKIERT ohne Änderung):** Freigabe 492dcd48
  `pruefen`/`erneut` + df1a6700 `aufgeben`; Vorprüfung bestätigte beide Sachlagen exakt,
  scheiterte am Vertragspunkt (`aufgeben` aus `offen` unmöglich) → **keine** Aktion
  ausgeführt, Invarianz belegt; Versuch-5-Vorprüfung §28.6 rein lesend (V4-4 rot, s. §11).
- **22.08. (§30, PR #260, gemergt + deployt):** strukturelle Wiederaufnahmelücke geschlossen
  (`storage.verstehenWiederaufnahmen`, Filter `erneut-freigegeben`, an `casAktiv()` + §29
  gebunden; `duplicate`/`skipped-failed` weichen nur bei ausdrücklicher Freigabe). Eine
  Gegenprüfung fand vier Mängel am Erstentwurf — behoben, Suite 47/0, CI 269/269.
- **21.08. (Betreiber + Kontrolle):** `HELMUT_KI_TIMEOUT_MS=30000` deployt; CAS-Bereinigung
  vollzogen (df1a6700 §4e-Wärterweg, 6× `pruefen`/`erneut`); erster Erfolg `eff40db2`.
- **20.08. (Reparatursprint nach Versuch 4, §29, PR #259):** Versuch 4 ehrlich gescheitert
  dokumentiert; zentrale Restzeitwache + Speicherweg-Zweitversuch; Suite 50/50.
- **19.08. (drei Sprints):** Vollzug §28.8 — 383 inerte Aufträge neutralisiert · Folgesprint
  §28 — CAS behandelt, gemischtes Verfahren 58/0 (PR #257) · Reparatursprint PR #256 —
  Blob-Entkopplung + Slot-Quittung (Suiten 40+16); Detail §7a, Runbook §27/§28.
Ältere Sprintberichte (inkl. PR #247–#251) stehen in den Belegdateien aus §13 und in der verlustfreien Archivfassung vom 17.08.
