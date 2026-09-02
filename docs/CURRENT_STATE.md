# CURRENT STATE — Helmut

**Stand: 2026-09-02 — PR #295 gemergt und deployt (`9079ac3`, Deployment `dpl_DHTnMxFsibaj3XxdkpgDzandursx` READY). Verdrängungsschutz der fünf realen Mandate, Vorwärts- und Rückweg, Stufenkontrolle und Fachzyklus-Startweg sind damit in Production wirksam — der 500er-Funktionstest ist dadurch **nicht** startbereit geworden (§24, zwei strukturelle Blocker). Nachbereitungssprint als Draft-PR offen, nichts weiter gemergt.** Vollfassungen: [`archive/project_state/`](archive/project_state/). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen, testgesichert). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet** (Runbook §30.7); Modus weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgenlauf 5/5 und Lagelauf effektiv 5/5; der R4-/Watchdog-Nachweis ist grün; im Aktivierungsfenster keine Doppelarbeit, keine verlorenen Aufträge, keine endgültigen Fehler, 0 Lease-/Fencing-Probleme, alle elf §28.6-Kontrollen erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§20).** **Der Selbstweck ist lokal Ende-zu-Ende belegt, in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main`-Kopf und letzter fachlich wirksamer Production-Code: `9079ac3cc7d5d60ee993f7c45684a0591a254802`** (Merge von #295, Betreiberfreigabe 02.09. 13:08:53 UTC; Eltern `881739da` + `04b9f076`). Vercel-Deployment `dpl_DHTnMxFsibaj3XxdkpgDzandursx` **READY**, Ziel `production`, exakt auf diesem Commit; beide Pflicht-Checks grün (Lauf 33634007860) — 02.09. rein lesend bestätigt. Davor `881739da` (#294), `9d6d18e5` (#292), `98cfedc1` (#290), `936b2676` (#286), `3a153b50` (#287), `a03480bb` (#285).
- **Gemergt:** #273, #274, #279, #280, #281, #283–#290, #292, #293, #294, **#295**; davor #271, #270, #265, #262, #261, #260/#259/#256/#257, #225, #216. #275–#277 und #282 wurden nach Konsolidierung **geschlossen, nicht gemergt**; ihre Branches bleiben Auditbelege.
- **Offen (Draft, NICHT gemergt):** Nachbereitungssprint nach #295 auf `claude/helmut-pilot-post-pr295-dveogp`, Basis `9079ac3` (§25). Sonst keine fachlichen offenen PRs.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und isolierter Restore seit 28.07. geübt; RPO ≤ 24 h.
- **Mandate (zwei Zählungen, nicht dasselbe — 02.09. rein lesend bestätigt):** **9 Mandatsprofile**, davon **5 aktiv** (`m5-9aee228dbf2c9f13`) und 4 deaktivierte Demo-Mandate (OP-04-Rest), 0 Löschmarken. Daneben **10 Identitätsprofile**, davon **0** der Kohorte, **0 aktive Kohortenkonten**. **0 synthetische Zeilen** jeder Familie. Nur die 5 aktiven erzeugen Last.
- **Crawl-Lauf-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Mindestbedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (Klumpenrisiko B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT).
- **Crons (Production, 13):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 UTC · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` ist nicht in Production.** Dazu der Actions-Watchdog (`briefing-watchdog.yml`, 05:30 UTC, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (02.09. rein lesend bestätigt). **Z22 ist seit 29.08. mit Betreiberfreigabe angewendet** (Basis `20260826190000` → Buchung `20260829175642`, Vorwärtskorrektur `20260829123132` → `20260829175749`; Nachprüfung grün, §18) — **nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**: `20260720` und F9 (`20260825101500`). Jede weitere Production-Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze). Seit 01.09. gemessen: **0,002941 USD je Aufruf gemischt** (Listenpreis, Kontopreis weiter unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, obere Schranke 243 (§23). ([`betrieb/kostenmessung.md`](betrieb/kostenmessung.md))
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase lesend, Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar** — Aussagen über die Env-Oberfläche können in einer Sitzung nur als **Betreiberangabe** geführt werden (Beleg §16.8a). Flag-Zustände nur wirkungsbasiert prüfbar; jede Flag-/Env-Änderung ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8). Parlamentsdomains sind per Egress-Proxy gesperrt — bytegenaue Quellenprüfung über den freigegebenen Actions-Weg.

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md)) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget: Deckel **100**, davon **30** für Verstehen reserviert (Reserve liegt **im** Deckel ⇒ höchstens 70 nicht priorisiert, **nie 130**) | fail-closed im Code. **100/30 sind dokumentiert, nicht live verifiziert** (Vercel-Env nicht lesbar; `llm_budget_counters` speichert nur den Verbrauch). Fehlt die Variable, greift das Schutzlimit **50**. Tragfähigkeit 25 offen; **ab 50 reicht 100 nicht** (§6.3) |
| `HELMUT_VERSTEHEN_CAS=on` | seit 2026-08-17; `HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt ⇒ wirkt als 1 |
| `HELMUT_SCALABLE_PIPELINE=on` | **seit 23.08. 16:47 UTC**, `HELMUT_JOB_DISPATCH_MODE=shadow`, Worker 4/25/25; Rückweg: Flag löschen + Redeploy (Betreiber) |
| `HELMUT_CRON_GLOBALABRUF=on` | seit 2026-08-06 (Betreiber); Fortbestand ist Betreiberentscheidung |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **Berlin (Landesmodul)** | inaktiv; `HELMUT_LANDESMODULE=berlin` gesetzt, aber wirkungslos (0 berechtigte Mandate); Wirkung **unbewiesen** ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22) |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt) |
| M8 / `HELMUT_MATCHING_RELEVANZ_GATE` | aus (nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, nicht aktiviert (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03). **Für den 500er-Test ausdrücklich NICHT einschalten** (§24) |
| `HELMUT_TESTLAUF_*` (Vorrang real, Kommunikation, RPM/TPM, Kostenbudget, Parallelität) | **nicht gesetzt**; Werte vorbereitet und belegt (§24, [`betrieb/env-inventar.md`](betrieb/env-inventar.md) §3a) |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | nicht gesetzt; ohne beide Riegel fällt jeder Kohortenschritt auf den Trockenlauf |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` liegt als Datei vor, **nicht angewendet** |
| `HELMUT_PROFILE_DB_MODE` | Wirkung AN (laufzeitbelegt); Wert/Setzzeitpunkt unbestätigt |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind ein **lokales, vollständig deaktiviertes Importpaket** (`aktiv: false`, kein Import in Production). Voraussetzungen:

1. **Siebentägiger Nachweis des Warteschlangenbetriebs mit fünf Mandaten** — nicht begonnen. Verbindlich: [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) §14 **Stufe 2** (Abfluss ≥ Ankunft über 7 Tage, 0 Verlust, Wartezeit < 24 h). Umschaltung braucht **fünf** Umgebungswerte ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §7a).
2. **Regionale Quellen BE/BB**: beide Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert; Semantik und Schutzlimit 50 siehe §4. **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Modelllinien nicht.** Seit 01.09. **gemessen**: p95-Tagesbedarf **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23). ([`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2c.)
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 inkl. OP-25-Wiederholung).
5. **20 zusätzliche Profile**: amtlich bestätigt (rein lesende Actions-Läufe 24.08., Lauf 4 unter Strenge-Stufe 2; **maßgeblich ist der letzte Verifikationslauf am PR**, `daten/…-pruefstand.md`); Import/Aktivierung freigabepflichtig. **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — danach erneute Prüfung, keine ungeprüfte Aktivierung; Terminrisiko für den 25er-Nachweis.
6. **Ereignis-Antrieb:** **AWS ist dafür nicht technisch notwendig** (Korrektur 24.08.). Den Fünfernachweis trägt der **Selbstweck** — gebaut, verriegelt, lokal belegt, **in Production nie ausgeführt** (Runbook §31). AWS bleibt kanonischer Transport für **große** Mandatszahlen und eine getrennte, kostenpflichtige Entscheidung.

Entscheidungsgrundlage: [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR — Kostenentscheidung.
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mailbetrieb.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. Migration `20260720`).
4. **OP-04-Rest:** Umgang mit deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderungen bleiben Betreiberaktionen.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Versorgungsausfall-Risiko, Production-Beweis der Härtung steht aus.
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6 (Deckel, 7-Tage-Nachweis, Stufenplan). Neu belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf ([`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2a).
8a. **500er-Funktionstest:** technisch vorbereitet (§24), **nicht freigegeben**. Es fehlen ausschließlich Betreiberentscheidungen: die acht Werte setzen, dann die Einzelfreigaben 7–14 aus §13 des Belegs. Fachlich offen bleiben das Azure-**Gesamtkontingent des Kontos**, das Verstehenswachstum bei 500 Mandaten, der Verdrängungsschutz **unter echter Last** und der operative Mehrtagesbetrieb.
9. **Zwei Testzeilen in Production — ERLEDIGT (25.08.).** Beide entfernt, **`endgueltig_fehler = 0`**, keine fremde Zeile verändert; der historische rote Cron-Beleg bleibt erhalten. Belege: Runbook §31.10.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).

K2/K3 und OP-25 sind abgeschlossen (OP-25 laut Betreiberfeststellung vom 24.08.). Nach einer weiteren OP-30-Stufenaktivierung muss OP-25 vollständig wiederholt werden.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04-Teil) | 29B; relationale Profilzeilen veraltete Schnappschüsse (F-P6) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörung | 7 von 14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | Logverlust (§24 Ursache belegt), Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching-Nachvollziehbarkeit | 23B-2 (Briefing-Historisierung) |
| Punkt 26/27 (E2E BE/BB) | 26B blockiert (Punkt 14), 27B (Punkt 15); 27A-2-Messung offen |
| Punkt 29 Fehlervertrag | 29B offen |
| Mail (#204/#205) | Mailpit-Bestätigungslauf; Aktivierung freigabepflichtig |
| Kalender-Machbarkeit 1 (#209) | zuerst die Rechtsfrage ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Reife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline |
| Quellen-Seed-Einspielung | nur noch Betreiberfreigabe |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe und Fachfrage |
| Gesundheitsbot-Folgepunkt | Watchdog-Vorprüfung findet keine Altquittungen (Runbook §30.7) |

## 9 · Ausstehende Production-Nachweise

- **OP-25**: drittes Fenster BESTANDEN (07./08.08.); gilt nur für die aktuelle Architektur mit 5 Mandaten — nach Stufenaktivierung vollständige Wiederholung. OP-14 offen. **OP-31**: BESTANDEN (Morgenlauf 11.08.), Kopfstatus/UI nicht live abgerufen.
- **F-E2E — Ursache belegt, korrigiert, seit #290 deployt (§21):** `created_at` friert beim Erstauftritt ein (588 Inversionen); `listMatchingResults` sortiert jetzt **rank-primär** (`rank.asc.nullslast,id.asc`). Regression 15/0, Landes-E2E je 10/10; PR #224 (Draft) ist überholt. Offen: natürlicher Production-Nachweis der neuen Reihenfolge.
- **29B** — wartet auf natürlich auftretende Fehlerzustände (künstliche Fehler verboten).
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen.
- **Selbstweck:** **bleibt deaktiviert**, in Production nie ausgeführt. Offen: (a) Preview-Beleg zum 3-s-Abbruch — **blockiert** ohne belegte Datenisolierung der Vorschau (Zielarchitektur §27.3.1), (b) 7-Tage-Fenster, (c) zusätzliche Vercel-Kosten. Der Ereignis-Antrieb ist **nicht aktivierungsbereit** (Runbook §31.5).

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung 2026-08-05).

- **F-1** Tenant-JWT-Selbstsignierung/RLS: dauerhaft stillgelegt; Trennung App-seitig.
- **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: in Production gescheitert; `understanding-recovery.yml` **nie ausführen** (`CLAUDE.md` §5).
- **F-4** „Quellenbasis zu dünn": Fehlbefund.
- **F-5** Feste Referenzzahl „145 Quellen": verworfen; gültig ist `Telemetriezeilen = distinct source_id` (B3).
- **OP-25 Anlauf 1 + Fenster 1/2**: gescheitert (Werkzeug-/Vertragsfehler, E3); Fenster-Untergrenze 2026-08-04 bleibt verbindlich.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen). **Neu:** auch eine leere Tabelle beweist nichts — `llm_usage` war leer, die Nutzung stand im Blob (§23, K4).

## 11 · Nächster empfohlener Schritt

1. **Den Draft-PR des Vorbereitungssprints prüfen und über den Merge entscheiden** (grün, ohne Datenwirkung, ohne angewendete Migration). Danach ist von den 14 Freigaben aus §13 des Belegs die nächste **Freigabe 4+5: die acht Betreiberwerte setzen** (Deckel 2.416 · Reserve 702 · Vorrang real 200 · RPM 82 · TPM 250000 · Kostenbudget 10,00 · Parallelität 1 · Kommunikationsriegel scharf). Ohne sie meldet `startbereitschaft()` **nicht startbereit** — die Vorrangreserve wird zur Laufzeit gelesen, nicht aus der Konfiguration.
2. **Gründerentscheidung zur Skalierung** (Entscheidungsvorlage, §6): KI-Deckel, AWS-Frage, Reihenfolge 10 → 25.
3. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach den **siebentägigen Nachweis** mit 5 Mandaten. Davor empfohlen: kleinster Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
4. **Rückkehr zu den P0-Verkaufsblockern OP-01…OP-04.**
5. **Betreiberprüfung Doppelkanal** (OP-07, §7 Punkt 9) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. In Production offen: `20260720` und F9 (`20260825101500`); Z22 ist seit 29.08. angewendet und wird **nicht erneut angewendet** (§18).
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 neuen Profile wird ohne gesonderte Freigabe importiert oder aktiviert**.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-30 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-30 Aktivierungs-Runbook (§30.7-Abschluss) | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| Skalierung 25/50/100 (Abfluss, Modelllinien, Deckelsemantik) | [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) |
| KI-Bedarf/Kosten je Mandatszahl | [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) |
| Kapazität Morgenlage, Stufenplan | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) |
| Profil-Importvertrag (20-Profile-Paket) | [`betrieb/op30-profilvertrag-200-mandate.md`](betrieb/op30-profilvertrag-200-mandate.md) |
| Entscheidungsvorlage Skalierung 10/25 | [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md) |
| OP-25 Ursachen und Nachweisvertrag | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7 |
| Cron-Fairness, F-CAS, F-POS, Watchdog-Verzug | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Berlin-Aktivierung/-Rollback | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Seed-Einspielung (blockiert) | [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore · Env-/Secret-Inventar | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) · [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| OP-31 Frischevertrag · OP-30 CAS Verstehensvertrag | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) · [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md) |
| Paket-Inventur Production | [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) |
| Watchdog-Korrektur 26.08. | [`betrieb/watchdog-korrektur-2026-08-26.md`](betrieb/watchdog-korrektur-2026-08-26.md) |
| **500er-Funktionstest: Rahmen, Runbook, Ablaufplan, Azure-Messwerte, K1–K6** | [`betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) |
| Production-Beweise | [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) |
| Vollstände vor den Verdichtungen | [`archive/project_state/`](archive/project_state/) (Index: [`archive/README.md`](archive/README.md)) |

## 14–17 · Sprints 24.–26.08. (Kurzform; Vollfassung im Archiv `2026_09_01c`)

- **§14 Selbstweck-Härtung** (#269): `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung; 3-s-Abbruch ungeprüft. Seither gilt `CLAUDE.md` §6: **jeder** Testlauf über `scripts/lokal.js`.
- **§15 Skalierung 25/50/100** (#270): Anlage-Stapel legt nur **inaktiv** an · **kein Index nötig, F9 nicht angewendet**; zuerst reißt die 500-MB-Free-Grenze (2,70 MB/Tag).
- **§16 Watchdog** (#271, deployt): **`partial` heißt nie „Slot fehlt"**; offen: 5/5 Briefings personalisiert, nur **1/5** mit registriertem Push-Empfänger.
- **§17 Realistiknachweis Z3a** (#272): echte Fachhandler/PostgREST/Netz über 5/25/50/100 Mandate (92/92, 0 Fehler) — **nicht** die echten Anbieter; Z3b/Azure ist seit 01.09. gemessen (§23).

## 18–22 · Sprints 26.08.–01.09. (Kurzform; Vollfassung im Archiv `2026_09_01c`)

- **§18 Z22** — *erfolgreich abgeschlossen (29.08., CI-Nachweis 01.09.)*, Zahlen in [`betrieb/z3-realistiknachweis-2026-08-26.md`](betrieb/z3-realistiknachweis-2026-08-26.md) §13–§14: `helmut_jobs_offen` zählte mandatsblind, Z22 ergänzt `p_mandat`. Buchungen `20260829175642`/`20260829175749`, Nachprüfung 5/5 grün — **Z22 nicht erneut anwenden.** Der §11-PostgREST-Rückfallnachweis läuft seit #292 fail-closed im Pflicht-CI.
- **§19 Understanding-Laufmeldung** — *erfolgreich* (#283, deployt als `0f900e68`): `lauf-bilanz.js` als **eine** kanonische Zähler-/Statusableitung (`Number(null)` ist nie mehr eine gemessene 0) · 217,5 s ist **keine** Laufzeitgrenze. Offen: drei `unbekannt`-Vorgänge.
- **§20 Kapazität Understanding** — **BLOCKIERT**, Gate-Flip und PR-B bleiben gestoppt ([`betrieb/understanding-kapazitaet-2026-08-31.md`](betrieb/understanding-kapazitaet-2026-08-31.md)): belegt sind Verhungern und wachsender Rückstand (31.08.: 9.080 pending; Ankunft Ø 307/Tag, Abfluss Ø 68/Tag). Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06 (1.769 Altfälle), Siebentagenachweis.
- **§21 500-Mandate-Reife + Korrektursprint** — *erfolgreich, Betreiberfreigabe 01.09.* (#290 per `98cfedc1`, Deployment READY; [`betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md`](betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md)). **Drei getrennte Urteile, unverändert gültig:** Warteschlangen-Aufnahmefähigkeit 500 **erbracht** (Altbeleg) · rechnerisch-architektonisch **vorbereitet, finale Dimensionierung offen** · operativer Mehrtagesbetrieb **NICHT BEWIESEN**. Fünf Gate-Blocker und sieben Betreiber-Befunde korrigiert (u. a. Matching rank-primär, **05:45/05:48 OFFEN**); Gesamtläufe 294/294 und 295/295. **Minimal-Cron `18,48 * * * *` vorbereitet, nicht aktiviert** · **Kohorte 495** validiert, inaktiv.
- **§22 PR-Bereinigung** — *erfolgreich, Betreiberfreigabe 01.09.*: #275–#277 und #282 nach Einzelprüfung **geschlossen, nicht gemergt** (Branches bleiben Auditbeleg; aus #277 stammt der in §23 wiederhergestellte Messläufer). Sichere Teile über #292 in `9d6d18e5`, Pflichtlauf grün, Vercel `success`. Keine Migration, Daten-, Mandats-, Cron-, Env-, Secret-, Flag- oder Budgetänderung. Vollbeleg: [`betrieb/pr-bereinigung-2026-09-01.md`](betrieb/pr-bereinigung-2026-09-01.md).

## 23 · Sprints 01./02.09. — Sicherheitsrahmen, Azure-Messungen, Endpunktguard (**gemergt als #294**)

*Erfolgreich abgeschlossen; Betreiberfreigabe 02.09., Deployment READY auf `881739da`.* Vollbeleg: [`betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) §1–§17.

- **Gebaut:** fail-closed **Kommunikationsriegel** vor allen sieben Außenkanälen · Kohortenwerkzeuge mit Erlaubnisliste · Kapazitäts-/Kostenriegel · Azure-**Endpunktguard** · Geheimnisredaktion an vier Leckwegen korrigiert. **Azure-Messungen**: 24/24 Aufrufe, **0,040841 USD**, 0 Fehler.
- **Maßgebliche Telemetriequelle korrigiert:** `helmut_store.data.llmUsage` (Ring 5.000), nicht die leere Tabelle `llm_usage` (K1–K6). Fenster 02.07.–01.09.: 3.673 Erfolge · **19 Azure-Fehler (0,51 %)** · 1.260 Budgetablehnungen.
- **Gemessener Tagesbedarf:** p95 **170** / max 298 (UNTERGRENZE). **Ursache der Untererfassung bewiesen** (unbedingtes Lese-Ändere-Schreibe auf dem Blob).
- **Azure-Deploymentkontingent bestätigt** (02.09.): 250.000 TPM / 250 RPM, `gpt-5-mini`, Sweden Central. **Gesamtkontingent des Kontos bleibt unbelegt.**

## 24 · Sprint 02.09. — Vorbereitungssprint 500er-Funktionstest (**gemergt als #295**)

*Erfolgreich abgeschlossen; Betreiberfreigabe 02.09., Merge `9079ac3`, Deployment READY.* Vollbeleg: [`betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) **§18–§21**. Der Merge machte Schutzregeln, Ausführer und beide Blocker-Hürden wirksam — er machte den Test **nicht** startbereit.

- **Kernbefund:** „synthetisch" existierte außerhalb des Kommunikationsriegels **nicht**; die fünf realen Mandate waren an **vier** Stellen verdrängbar (Budget, Priorisierung, Warteschlange, Laufzeit). Gebaut: `mandatsklasse.js` (kein realer Slug) und vier Schutzregeln. **Bei 0 synthetischen Zeilen byte-identisch.** Synthetische Profile bauen keine eigenen Außenquellen (OP-15).
- **Gebaut:** Vorwärtsweg (`testkohorte-vorwaerts.js`, drei Riegel + Startfenster) · Fachzyklus-Startweg (`funktionstest-zyklus.js`, ruft nur `/api/cron/pipeline` in 280-s-Scheiben) · echte Auswerter (`funktionstest-nachweise.js`; A10 zählt nur `versand=ja` + `pushEvents.delivered` + `helmut_job_outbox`, **drei Kanäle nicht messbar**) · Stufenkontrolle (15 Regeln, 6 Pflichtgrenzen) · Rückbau-Ausführer. `recordLlmUsage` relational als Dual-Write, Flag **AUS**, Migration `20260902121500` als Datei — **nicht angewendet**.
- **Vier Reviews, 35 bestätigte Befunde, 33 geschlossen.** Der schwerste traf die eigene Änderung: die Vorrangreserve zog auch der GETEILTEN Verstehensarbeit Budget ab — bei Deckel 100 gegen Vorrang 200 wäre `effectiveMax = 0` gewesen, der Datenmotor **auch der fünf realen Mandate** hätte stillgestanden. Behoben (Untergrenze + Hürde gegen die laufende Umgebung).
- **Acht vorbereitete Betreiberwerte (NICHTS gesetzt):** Deckel **2.416** · Verstehens-Reserve **702** · Vorrang real **200** · RPM **82** · TPM **250000** · Kostenbudget **10,00 USD/Tag** · Parallelität **1** · Kommunikation `gesperrt`. Reihenfolge bindend: Deckel **vor** Reserve. **`HELMUT_TENANT_LLM_CAP` NICHT einschalten.**
- **Tests am Kopf `04b9f07`:** Offline-Gesamtlauf **311/311 grün** in 499 s, Exit 0 · Browser-Smoke **32/0**.
- **Unverändert:** 5 reale Mandate, Gate `shadow`, 13 Crons, 35 Migrationen, alle Production-Daten, jede Umgebungsvariable.
