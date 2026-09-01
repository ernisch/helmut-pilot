# CURRENT STATE — Helmut

**Stand: 2026-09-01 — Sicherheitsrahmen für den 500er-Production-Funktionstest gebaut und offline bewiesen, die zwei Azure-Messpakete ausgeführt; Draft-PR #294 offen, nichts gemergt (§23).** Vollfassungen vor den drei Verdichtungen vom 01.09.: byte-identisch unter [`archive/project_state/`](archive/project_state/) (`2026_09_01`, `…01b`, `…01c`). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet** (Runbook §30.7); Modus weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgenlauf 5/5 und Lagelauf effektiv 5/5; der R4-/Watchdog-Nachweis ist grün; im Aktivierungsfenster keine Doppelarbeit, keine verlorenen Aufträge, keine endgültigen Fehler, 0 Lease-/Fencing-Probleme, alle elf §28.6-Kontrollen erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§20).** **Der Selbstweck ist lokal Ende-zu-Ende belegt, in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **Letzter fachlich wirksamer Production-Code: `9d6d18e5` aus #292** (§22; Vercel-Status `success`); davor `98cfedc1` (#290), `936b2676` (#286), `3a153b50` (#287), `a03480bb` (#285), `3244f073` (#284), `0f900e68` (#283).
- **Gemergt:** #273, #274, #279, #280, #281, #283–#290, #292; davor #271, #270, #265, #262, #261, #260/#259/#256/#257, #225, #216. #275–#277 und #282 wurden nach Konsolidierung **geschlossen, nicht gemergt**; ihre Branches bleiben Auditbelege. **`672886c`/`be5bd15` existieren nicht mehr** (01.09. geprüft), Inhalte in §21 rekonstruiert.
- **Offen (Draft #294, NICHT gemergt):** Sicherheitsrahmen des 500er-Funktionstests auf `claude/security-sprint-functional-test-wap0q1`, Basis `b998e9bc` (§23). Sonst keine fachlichen offenen PRs.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und isolierter Restore seit 28.07. geübt; RPO ≤ 24 h.
- **Mandate (zwei Zählungen, nicht dasselbe — rein lesend bestätigt 01.09.):** **9 Mandatsprofile**, davon **5 aktiv** (Signatur `m5-9aee228dbf2c9f13`) und 4 deaktivierte Demo-Mandate (OP-04-Rest), 0 Löschmarken. Daneben **10 Identitätsprofile**, davon 1 ohne Mandatsprofil. **0 Testmandate, 0 `test-kohorte`-Zeilen.** Nur die 5 aktiven Mandatsprofile erzeugen Last.
- **Crawl-Lauf-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Mindestbedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (Klumpenrisiko B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT).
- **Crons (Production, 13):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 UTC · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` ist nicht in Production.** Dazu der Actions-Watchdog (`briefing-watchdog.yml`, 05:30 UTC, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (01.09. rein lesend bestätigt). **Z22 ist seit 29.08. mit Betreiberfreigabe angewendet** (Basis `20260826190000` → Buchung `20260829175642`, Vorwärtskorrektur `20260829123132` → `20260829175749`; Nachprüfung grün, §18) — **nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**: `20260720` und F9 (`20260825101500`). Jede weitere Production-Anwendung bleibt freigabepflichtig.
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
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | Wirkung AN (laufzeitbelegt); Wert/Setzzeitpunkt unbestätigt |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind ein **lokales, vollständig deaktiviertes Importpaket** (`aktiv: false`, kein Import in Production). Voraussetzungen:

1. **Siebentägiger Nachweis des echten Warteschlangenbetriebs mit fünf Mandaten** — nicht begonnen. Verbindlich: [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) §14 **Stufe 2** (Abfluss ≥ Ankunft über 7 Tage, 0 Verlust/Doppelarbeit, Wartezeit < 24 h) — **nicht** der ältere Slot-Stufenplan (frühere Angabe war falsch). Umschaltung braucht **fünf** Umgebungswerte, nicht drei ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §7a).
2. **Regionale Quellen BE/BB**: beide Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert; Semantik und Schutzlimit 50 siehe §4. **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Modelllinien nicht.** Seit 01.09. **gemessen**: p95-Tagesbedarf **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23). ([`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2c.)
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 inkl. OP-25-Wiederholung).
5. **20 zusätzliche Profile**: amtlich bestätigt (rein lesende Actions-Läufe 24.08., Lauf 4 unter Strenge-Stufe 2; **maßgeblich ist der letzte Verifikationslauf am PR**, `daten/…-pruefstand.md`); Import/Aktivierung freigabepflichtig. **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — danach erneute Prüfung, keine ungeprüfte Aktivierung; Terminrisiko für den 25er-Nachweis.
6. **Echter Warteschlangenbetrieb (Ereignis-Antrieb):** **AWS ist dafür nicht technisch notwendig** (Korrektur 24.08.). Den Fünfernachweis trägt der **Selbstweck** — gebaut, verriegelt, lokal belegt, **in Production nie ausgeführt**; Freischaltung ist Betreiberentscheidung (Runbook §31). AWS bleibt kanonischer Transport für **große** Mandatszahlen und eine getrennte, kostenpflichtige Entscheidung.

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
9. **Zwei Testzeilen in Production — ERLEDIGT (25.08.).** Beide entfernt, **`endgueltig_fehler = 0`**, keine fremde Zeile verändert; der historische rote Cron-Beleg bleibt erhalten. Belege: Runbook §31.10.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).

K2/K3 und OP-25 sind abgeschlossen (OP-25 laut Betreiberfeststellung vom 24.08.). Nach einer weiteren OP-30-Stufenaktivierung muss OP-25 vollständig wiederholt werden.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04-Teil) | 29B (lesender Fehlerzustands-Nachweis); relationale Profilzeilen veraltete Schnappschüsse (F-P6) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörungs-Erkennung | 7 von 14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | ~16 % Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching-Nachvollziehbarkeit | 23B-2 (Briefing-Historisierung) |
| Punkt 26/27 (E2E BE/BB) | 26B blockiert (Punkt 14), 27B (Punkt 15); 27A-2-Messung offen |
| Punkt 29 Fehlervertrag | 29B offen |
| Mail (#204/#205) | Mailpit-Bestätigungslauf; Production-Aktivierung freigabepflichtig |
| Kalender-Machbarkeit 1 (#209) | zuerst die Rechtsfrage ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline |
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
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen in Fixtures). **Neu 01.09.:** auch eine leere Tabelle beweist nichts — `llm_usage` war leer, die Nutzung stand im Blob (§23, K4).

## 11 · Nächster empfohlener Schritt

1. **Gründerentscheidung zur Skalierung** (Entscheidungsvorlage, §6): KI-Deckel, AWS-Frage, Reihenfolge 10 → 25.
2. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach den **siebentägigen Nachweis** mit 5 Mandaten (Quittungen `warteschlange-*`, Briefings 5/5; §28.6-Rückweg dokumentiert). Davor empfohlen: kleinster Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
3. **500er-Funktionstest:** Draft-PR #294 prüfen; Freigaben 1–3 der 14 sind erledigt, als Nächstes Deckel/Reserve (Vorschlag 2.416/702) und der Kommunikationsriegel.
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

- **§14 Selbstweck-Härtung** (PR #269): `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung; der 3-s-Abbruch bleibt ungeprüft. Seither gilt `CLAUDE.md` §6: **jeder** Testlauf über `scripts/lokal.js`.
- **§15 Skalierung 25/50/100** (PR #270): Anlage-Stapel legt nur **inaktiv** an · lage-briefing-Direktpfad typgebunden · **kein Index nötig, F9 nicht angewendet**; zuerst reißt die 500-MB-Free-Grenze (2,70 MB/Tag).
- **§16 Watchdog-Korrektur** (PR #271, deployt): **`partial` heißt nie „Slot fehlt"**; offener Produktbefund: 5/5 Briefings personalisiert, aber nur **1/5** mit registriertem Push-Empfänger.
- **§17 Realistiknachweis Z3a** (PR #272): echte Fachhandler/PostgREST/Netz über 5/25/50/100 Mandate (92/92, 0 Fehler) — **nicht** die echten Anbieter. Z3b/Azure ist seit 01.09. gemessen (§23).

## 18 · Z22: Befund, Pflichtbeleg und Production-Abschluss

**Erfolgreich abgeschlossen (29.08.; CI-Nachweis 01.09.);** Zahlen/Buchungen [`betrieb/z3-realistiknachweis-2026-08-26.md`](betrieb/z3-realistiknachweis-2026-08-26.md) §13–§14: `helmut_jobs_offen` zählte mandatsblind, Z22 ergänzt `p_mandat`. Buchungen `20260829175642`/`20260829175749`, Nachprüfung 5/5 grün — **Z22 nicht erneut anwenden.** Der §11-PostgREST-Rückfallnachweis läuft seit #292 fail-closed im Pflicht-CI. **Offen:** Z3b/Azure.

## 19 · Sprint 31.08. — Understanding-Laufmeldung: roter Befund vom 30.08. behoben

**Erfolgreich abgeschlossen; PR #283 gemergt, deployt als `0f900e68`.** [`betrieb/understanding-telemetrie-korrektur-2026-08-31.md`](betrieb/understanding-telemetrie-korrektur-2026-08-31.md): `lauf-bilanz.js` als **eine** kanonische Zähler-/Statusableitung (`Number(null)` ist nie mehr eine gemessene 0) · 217,5 s ist **keine** Laufzeitgrenze · U+0000-Fall geschlossen. Natürlicher Nachweis erbracht (21:30-Lauf 31.08.). Offen: drei `unbekannt`-Vorgänge (Betreiberentscheidung).

## 20 · Sprint 31.08. — Kapazitätssprint Understanding: Diagnose und Rückstandsschleife

**Blockiert — Gate-Flip und PR-B bleiben gestoppt.** Messreihen: [`betrieb/understanding-kapazitaet-2026-08-31.md`](betrieb/understanding-kapazitaet-2026-08-31.md). Belegt sind Verhungern und wachsender Rückstand (31.08.: 9.080 pending; Ankunft Ø 307/Tag, Abfluss Ø 68/Tag). #284–#287 sind deployt; die fünf Gate-Blocker wurden in #290 korrigiert (§21). Gate bleibt `shadow`; 0 `gate-geparkt`, keine Migration oder Mandatsänderung. **Offen:** natürlicher Nachweis des korrigierten Stands, OP-06 (1.769 Altfälle), Siebentagenachweis sowie jede getrennt freizugebende Gate-, Cron-, Deckel- oder Kohortenentscheidung.

## 21 · Sprint 31.08./01.09. — 500-Mandate-Reife + Korrektursprint (#290 gemergt + deployt)

**Erfolgreich abgeschlossen — Betreiberfreigabe 01.09.:** PR #290 per `98cfedc1` gemergt (Pflicht-CI grün), Deployment READY. Vollbeleg inkl. Nach-Merge-Prüfung: [`betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md`](betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md).

- **Drei getrennte Urteile, unverändert gültig:** Warteschlangen-Aufnahmefähigkeit 500 **erbracht** (Altbeleg) · rechnerisch-architektonisch **vorbereitet, finale Dimensionierung offen** · operativer Mehrtagesbetrieb **NICHT BEWIESEN**.
- Fünf Gate-Blocker aus §20 und sieben Betreiber-Befunde korrigiert (u. a. Matching rank-primär · Vorab-Boden auf atomaren Zähler · getrennte Verstehens-Reserve · **05:45/05:48 OFFEN**). Gesamtläufe 294/294 und 295/295.
- **Minimal-Cron `18,48 * * * *` vorbereitet, nicht aktiviert** (7 Betreiberschritte) · **Kohorte 495** validiert, inaktiv. **500 aktive Mandate sind NICHT freigegeben**; die Z3b-Messungen sind seit 01.09. erbracht (§23), Gate-, Deckel- und Kohortenfreigaben bleiben je eigene Entscheidungen.

## 22 · Sprint 01.09. — Bereinigung der offenen Pull Requests (#292 gemergt + deployt)

**Erfolgreich abgeschlossen — Betreiberfreigabe 01.09.:** #275–#277 und #282 nach Einzelprüfung geschlossen, nicht gemergt; ihre Branches bleiben Auditbeleg (aus #277 stammt der in §23 wiederhergestellte Messläufer). Die sicheren Teile gingen über #292 in `9d6d18e5`; Pflichtlauf `33485020305` grün, Vercel `success`. Keine Migration, Daten-, Mandats-, Cron-, Env-, Secret-, Flag- oder Budgetänderung. Vollbeleg: [`betrieb/pr-bereinigung-2026-09-01.md`](betrieb/pr-bereinigung-2026-09-01.md).

## 23 · Sprint 01.09. — Sicherheitsrahmen 500er-Funktionstest + ausgeführte Z3b-Messungen

**Teilweise abgeschlossen — Rahmen offline vollständig bewiesen, Azure-Messungen ausgeführt, Draft-PR #294 offen, nichts gemergt, keine Production-Wirkung.** Vollbeleg (Runbook, Ablaufplan, Entscheidungstabelle, Freigaben, Messwerte, K1–K6): [`betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Branch `claude/security-sprint-functional-test-wap0q1`, Basis `b998e9bc`.

- **Gebaut:** Azure-Messläufer wiederhergestellt (Auditbranch des geschlossenen PR #277), Stichprobe nur nach Laufkennung **und** Vorprobe-Fingerabdruck · **zentraler, fail-closed Kommunikationsriegel** (`lib/helmut/kommunikationsriegel.js`) vor **allen sechs** Außenkanälen, die bis dahin **keinen gemeinsamen Punkt** hatten · Kohortenwerkzeuge mit **Erlaubnislisten-Schutz** der realen Mandate · Kapazitäts-/Kostenriegel, **12 Abbruchregeln**, Startfensterprüfung.
- **Offline bewiesen:** 495/495 Kohortenprofile durch den echten Mail- und Push-Pfad bei voll konfigurierter Umgebung — **Netzzähler 0**; Messläufer über 25 unvollständige Konfigurationen — **Netzzähler 0**; Mengen 20/75/400, Idempotenz, Rückbau. Suiten 66 · 24 · 44 · 83 · 101 PASS/0 FAIL; **Gesamtlauf 302/302**, Browser-Smoke 32/0. **Adversariales Diff-Review (37 Agenten): 31 gemeldet, 13 bestätigt, alle behoben** — u. a. trug der Mailweg mangels durchgereichter Mandatskennung allein `.invalid`, und der Messläufer folgte Umleitungen (Schlüssel an ungeprüften Host).

**Ausgeführte Azure-Messungen (je eigene Betreiberfreigabe, `env -i`, `store: false`, kein Datenbankzugriff; `gpt-5-mini`, Global Standard, `swedencentral`):** Vorprobe `vorprobe20260901` **3/3**, 21,5 s, 0,005236 USD, Fingerabdruck `d69af1ae…7e30a` · Stichprobe `stichprobe20260901` **21/21**, 116,4 s, 63.385 Token, **0,035605 USD** (3,6 % des Limits), Fingerabdruck `5baac1c0…85d77`. Auslastung 4,3 % RPM / 13,1 % TPM der Deploymentgrenzen (250 / 250.000). Verstehen und Lage decken sich mit Production (1,6 % / 6,7 %); **Büro liegt 52 % daneben** (synthetischer Prompt zu klein) — dort gelten die Production-Werte.

**Korrigierte Datenquelle (Betreiberhinweis):** Maßgeblich ist **`helmut_store.data.llmUsage`**, nicht die leere Tabelle `llm_usage`. Der Blob ist ein **Ringpuffer über 5.000 Einträge** (`storage.js:622`) — das Fenster begrenzt die Puffergröße, keine Aufbewahrungsregel. Fenster 02.07.–01.09.: 3.673 Erfolge · **19 technische Azure-Fehler (0,51 %)** · 1.260 **Budgetablehnungen** (kein Azure-Fehler, sondern Bedarfsnachweis) · 48 fachliche Übersprünge.

- **Tagesbedarf (60 vollständige Tage):** ausgeführt p50 60 / p95 93 (durch Deckel 100 **rechtsseitig zensiert**) · **Bedarf p50 66 / p90 120 / p95 170 / max 298**. **p95 je Fachweg: Verstehen 82 · Büro 24 · Lage 7.** **`p95 = 170` ist eine Untergrenze:** der Blob untererfasst gegenüber dem atomaren Zähler an 47 von 48 Tagen um im Mittel 8,8/Tag (~12 %), Ursache **nicht ermittelt**.
- **Vorschlag (nicht gesetzt, nicht freigegeben): Gesamtdeckel 2.416, Verstehens-Reserve 702** — Reserve liegt **im** Deckel. Unabhängig gemessener Boden 1.496/Tag, 0,3 % neben dem Szenariowert 1.492. Kosten ≈ **7,10 USD/Tag = 213 USD/Monat**, obere Schranke 243 (Listenpreis; Kontopreis F7 offen).
- **Sechs Korrekturen K1–K6** gegenüber einem falschen Zwischenbericht, der die leere Tabelle `llm_usage` als einzige Quelle behandelt hatte (Büro und Lage als „keine Daten" gemeldet, Verstehen p50 0 statt 46, Fehlerquoten aus `process_runs`). Vollständig: Beleg §16.7.
- **Betreiberangabe, in der Sitzung nicht nachprüfbar:** Vercel zeigte die sensiblen Variablen **maskiert**, Production arbeitet korrekt. Vercel-Env ist aus Sitzungen weder lesbar noch setzbar; eigenständig belegbar ist nur die **Wirkung** (3.673 erfolgreiche Azure-Aufrufe, 0,51 % Fehler). Beleg §16.8a.
- **Offene Sicherheitsverbesserung (geprüft):** `lib/helmut/ai.js` baut die Azure-URL ungeprüft aus `AZURE_OPENAI_ENDPOINT` — kein Schema-Zwang, keine Host-Erlaubnisliste; mit dem `api-key`-Kopf ginge ein falsch gesetzter Wert samt Schlüssel an einen beliebigen Host. Kein Vorfall, kein Hinweis auf Fehlkonfiguration; **bewusst nicht behoben** (Doku-Auftrag). Nächster Schritt: Erlaubnisliste + Schemaprüfung, fail-closed. Beleg §16.8b.

**Weiterhin NICHT bewiesen:** fachlicher Zyklus mit 5 realen + 495 aktiven Profilen · Azure-**Gesamtkontingent des Kontos** (getrennt von der Deploymentgrenze) · Verstehenswachstum bei 500 Mandaten (geteiltes Korpus) · 05:45/05:48-Überschneidung · Riegel unter echter Last · operativer Mehrtagesbetrieb. **`HELMUT_TENANT_LLM_CAP` ist aus** — die fünf realen Mandate haben keinen wirksamen Verdrängungsschutz; ihr Tagesbedarf ist p95 **170**, nicht 5.

**Unverändert:** 5 aktive / 4 inaktive Mandate · 0 `test-kohorte`-Zeilen · 13 Crons ohne `18,48` · Migrationsliste · Gate `shadow` · keine Provisionierung, keine Aktivierung, kein Merge, kein Deployment. **Nächster Schritt:** von den 14 Freigaben (Beleg §13) sind 1–3 erledigt; als Nächstes stehen Deckel/Reserve und der Kommunikationsriegel an.
