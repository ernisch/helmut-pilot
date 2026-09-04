# CURRENT STATE — Helmut

**Stand: 2026-09-04 — `main`-Kopf `350d901` (Merge von #300, reine Doku). Production: **29 Profile, unverändert 5 aktiv**, 24 inaktiv (davon die **20 der Stufe A, alle inaktiv**), 0 Löschmarken; `crawlRuns` steht auf 20 und wurde **nicht wiederhergestellt** (§28). Der **Absicherungs-Code ist fertig und offline bewiesen, liegt als eigener PR vor und ist NICHT gemergt** (§29). **Nichts ist aktiviert; Aktivierung und Stufe B/C bleiben gesperrt, bis dieser PR gemergt und deployt ist** (§7.11).** Nur der aktuelle, entscheidungsrelevante Zustand (Grenze 30.000 Zeichen, testgesichert); Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet**, Modus **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgen-/Lagelauf 5/5, 0 Verlust, alle elf §28.6-Kontrollen erfüllt ([`op30-aktivierung-5-mandate §30.7`](betrieb/op30-aktivierung-5-mandate.md)). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§14–22).** **Der Selbstweck ist lokal belegt, in Production nie ausgeführt.**

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Blocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main`-Kopf (04.09.): `350d9015576c724711179322dddd6063fcf02fd8`** — Merge von **#300**, Eltern `92a0716` (alter Kopf) und `33154b4` (PR-Kopf). Zugehöriges Production-Deployment **`dpl_DFHbTQo5T4fButYGbEXUHgzSsfnP`, Status READY** (target `production`, `githubCommitSha` = Merge-Commit) — rein lesend bestätigt. Nach dem Merge weiterer PRs rückt der Kopf vor; die jeweils aktuelle Kennung ist der Git-Historie zu entnehmen, nicht dieser Zeile.
- **Letzter fachlich wirksamer Production-Code: `b0071fd`** (Merge von **#297**, 03.09. 12:39:05 UTC), Vercel-Status am Merge-Commit **erfolgreich**, beide Pflicht-Checks am PR-Kopf `540b57b` grün. **#298, #299 und #300 ändern keinen Anwendungscode** — dieser Stand bleibt unberührt.
- **Zuletzt gemergt: #300** (reine Doku zu §28, kein Code); letzter **fachlicher** Merge war **#297**. Die vollständige Merge-Folge steht in der PR-/Git-Historie. #275–#277 und #282 nach Konsolidierung **geschlossen, nicht gemergt** (Branches bleiben Auditbelege).
- **Offen: der Absicherungs-Code-PR** (§29) — Branch `claude/helmut-stufe-a-storage-protection-pd5i3x`, Basis `350d901`. **Erster fachlicher PR seit #297.** Er ändert Anwendungscode und Tests, **keine Konfiguration, keine Migration, keine Production-Daten**. **Er ist nicht gemergt**; bis dahin gilt die Sperre aus §7.11 unverändert.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und Restore seit 28.07. geübt, RPO ≤ 24 h.
- **Mandate (04.09. rein lesend, selbst erhoben):** **29 Mandatsprofile**, davon **5 aktiv** (`m5-9aee228dbf2c9f13`, alle **Bundestag**) und **24 inaktiv**, 0 Löschmarken. Die 24 inaktiven sind **4 Demo-Mandate** (OP-04-Rest) und die **20 synthetischen Profile der Stufe A** (`test-kohorte-a-001…020`, seit 04.09., §28). Daneben 30 Identitätsprofile (10 real + 20 Kohorte). **Nur die 5 aktiven erzeugen Last.** Die Ausschussfelder aller 5 aktiven Profile tragen seit 03.09. den amtlichen WP-21-Stand (§27); relationale Sicht und Blob sind deckungsgleich.
- **Crawl-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Betreiberangabe). Der Blob-Ring `crawlRuns` steht seit 04.09. auf **20** (§28) und **füllt sich nicht nach**: seit der Motoraktivierung am 23.08. erreicht kein Cron mehr `saveCrawlRun` (SR §37.3). Er ist ein stillgelegter Altpfad-Puffer; kein Entscheidungspfad liest über Position 20 hinaus. **Der Schutz gegen eine erneute Kürzung ist gebaut, aber noch NICHT in Production** (§29).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` ist nicht in Production.** Dazu der Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (02.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze); **0,002941 USD je Aufruf** (Listenpreis, Kontopreis unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, Schranke 243 ([`kostenmessung`](betrieb/kostenmessung.md)).
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase und Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar** — Env-Aussagen sind **Betreiberangabe**. Flag-Zustände nur wirkungsbasiert prüfbar; jede Flag-/Env-Änderung ist Betreiberaktion ([env-inventar §8](betrieb/env-inventar.md)). Parlamentsdomains per Egress-Proxy gesperrt.

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget: Deckel **100**, davon **30** für Verstehen reserviert (Reserve liegt **im** Deckel ⇒ höchstens 70 nicht priorisiert, **nie 130**) | fail-closed im Code, **dokumentiert, nicht live verifiziert**. Ohne die Variable Schutzlimit **50**; **ab 50 Mandaten reicht 100 nicht** (§6.3) |
| `HELMUT_VERSTEHEN_CAS=on` | seit 2026-08-17; `HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt ⇒ wirkt als 1 |
| `HELMUT_SCALABLE_PIPELINE=on` | **seit 23.08. 16:47 UTC**, Modus `shadow`, Worker 4/25/25; Rückweg: Flag löschen + Redeploy (Betreiber) |
| `HELMUT_CRON_GLOBALABRUF=on` | seit 2026-08-06 (Betreiber); Fortbestand ist Betreiberentscheidung |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **Berlin (Landesmodul)** | inaktiv; `HELMUT_LANDESMODULE=berlin` gesetzt, aber wirkungslos (0 berechtigte Mandate); Wirkung in Production **unbewiesen** ([Runbook](betrieb/berlin-aktivierung.md)) |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt) |
| M8 / `HELMUT_MATCHING_RELEVANZ_GATE` · `HELMUT_CRON_GLOBALPHASE` | aus · nicht gesetzt |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, nicht aktiviert (AVV/DNS offen) |
| Retention (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03). **Für den 500er-Test ausdrücklich NICHT einschalten** (§23–25) |
| `HELMUT_TESTLAUF_*` (Vorrang real, Kommunikation, RPM/TPM, Kosten, Parallelität) | **nicht gesetzt**; Werte vorbereitet (§23–25, [env-inventar §3a](betrieb/env-inventar.md)). Erst vor der **Aktivierung** Pflicht (§26) |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | **nicht gesetzt** (in Vercel nie; in einer Sitzung nur für den einen freigegebenen Lauf am 04.09.). `_QUELLEN` bleibt für den ganzen Test AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad in Production wirkungsbelegt**; roher Env-Wert unbestätigt. Ohne ihn schreibt `storage.saveProfile` **nur den Blob** und die Nachprüfung meldet falsches Grün (§28, SR §37.1). `HELMUT_PROFILE_DB_EXCLUSIVE` bleibt aus (Dual Write) |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |
| **20 Profile der Stufe A** (`test-kohorte-a-001…020`) | seit 04.09. in Production **angelegt und inaktiv** (§28), Konten gesperrt, Adressen auf `.invalid`. **Aktivierung gesperrt** (§7.11). Stufe B (75) und C (400) **nicht angelegt** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind seit 04.09. **in Production angelegt, aber inaktiv** (§28) — sie erzeugen keine Last. Offen:

1. **Siebentägiger Nachweis des Warteschlangenbetriebs mit 5 Mandaten** — nicht begonnen ([`op30-zielarchitektur §14 Stufe 2`](betrieb/op30-zielarchitektur-2026-08-13.md): Abfluss ≥ Ankunft über 7 Tage, 0 Verlust, Wartezeit < 24 h); Umschaltung braucht **fünf** Umgebungswerte.
2. **Regionale Quellen BE/BB**: Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert (Semantik/Schutzlimit 50: §4). **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Linien nicht.** p95 **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23–25; [`llm-budget-reservierung`](betrieb/llm-budget-reservierung.md), [`skalierung-25-50-100 §2c`](betrieb/skalierung-25-50-100.md)).
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 + OP-25-Wiederholung).
5. **20 zusätzliche Profile**: seit 04.09. inaktiv provisioniert und isolationsbelegt (§28); die **Aktivierung ist gesperrt** (§7.11). **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — Terminrisiko für den 25er-Nachweis.
6. **Ereignis-Antrieb:** **AWS ist dafür nicht technisch notwendig.** Den Fünfernachweis trägt der **Selbstweck** (Zustand: §9). AWS bleibt Transport für **große** Mandatszahlen — getrennte, kostenpflichtige Entscheidung.

Entscheidungsgrundlage: Entscheidungsvorlage Skalierung 10/25 (§13).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR (Kostenentscheidung).
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mail.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. `20260720`).
4. **OP-04-Rest:** Umgang mit den deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderung bleibt Betreiberaktion.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Production-Beweis der Härtung steht aus (§8).
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6. Belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf (§13).
9. **500er-Funktionstest: NICHT startbereit.** Stand 04.09. (§28): **Stufe A ist inaktiv provisioniert und isolationsbelegt** — Schritt 6 von 28 erreicht. Vor Schritt 7 (acht Betreiberwerte) steht jetzt die Sperre aus 11. Offen bleiben: Laufzeit der KI-freien Klassen, Azure-Gesamtkontingent, Verdrängungsschutz unter Last, Mehrtagesbetrieb.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).
11. **(04.09.) — Profil-Schreibpfad: Absicherung gebaut, aber NICHT in Production.** Der Code-Sprint ist offline abgeschlossen (§29, Vollbeleg SR §38) und liegt als eigener PR vor. **Aktivierung der Stufe A, Stufe B und Stufe C bleiben gesperrt, bis dieser PR gemergt und deployt ist** — der laufende Production-Code trägt die Absicherung noch nicht. Danach ist eine **eigene** Aktivierungsfreigabe weiterhin nötig. **Unverändert offen und in diesem Sprint bewusst nicht angefasst:** die geteilte Zeile `main` wird weiter unbedingt und vollständig ersetzt (**Last-Write-Wins ohne Compare-and-Set**); das ist der Architekturschritt aus SR §37.5 (7) und braucht einen eigenen Nachweis.

K2/K3 und OP-25 abgeschlossen (OP-25 laut Betreiberfeststellung 24.08.). Nach einer weiteren OP-30-Stufenaktivierung muss OP-25 **vollständig wiederholt** werden.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04) | Ausschussfelder korrigiert und abgenommen (§27). **Offen:** natürlicher Radar-Wirkungsbeleg (§9) · `wahlkreis` von `ottilie-paola-klein-2` weiter unspezifisch („Berlin") · OP-04-Rest (4 inaktive Demo-Mandate) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| `source_id`-Dubletten (OP-19) | Live-Nachweis der B3-Gleichung (§10 F-5) |
| Punkt 16 Quellenstörung | 7/14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching · 29 Fehlervertrag | 23B-2 (Briefing-Historisierung) · 29B |
| Punkt 26/27 (E2E BE/BB) | 26B blockiert (P14), 27B (P15), 27A-2 offen |
| Mail (#204/#205) · Kalender (#209) | Mailpit-Lauf, Aktivierung freigabepflichtig · zuerst die Rechtsfrage |
| Berlin-Reife (P14) | Betreiber-Flagzugang + stabile Pipeline |
| OP-06 Aussortieren (34 Fälle) | Freigabe + Fachfrage |
| Gesundheitsbot-Folgepunkt | Watchdog findet keine Altquittungen |

## 9 · Ausstehende Production-Nachweise

- **OP-25**: drittes Fenster BESTANDEN (07./08.08.), nur für 5 Mandate (Wiederholungspflicht §7); OP-14 offen. **OP-31**: BESTANDEN (11.08.), Kopfstatus/UI nicht live abgerufen.
- **F-E2E — Ursache belegt, korrigiert, seit #290 deployt:** `created_at` friert beim Erstauftritt ein, `listMatchingResults` sortiert jetzt **rank-primär** (Regression 15/0). Offen: natürlicher Production-Nachweis.
- **Radar-Wirkungsbeleg der Profilkorrektur (§27) — TEILWEISE.** Natürlich belegt (04.09. 10:0x, `source_crawl_telemetry`): `Ausschuss für Arbeit und Soziales` und `Petitionsausschuss Themenradar`; die Kurzformen `Gesundheit`/`Finanzen`/`Haushalt` laufen seit 03.09. nicht mehr. **Offen bleiben drei Profile** (`helmut-kleebank`, `ottilie-paola-klein-2`, `cem-ince`). **Kein Lauf wurde ausgelöst.** Liefert ein neues Langform-Radar dauerhaft 0 Treffer, Rückfall auf die Kurzform erwägen.
- **29B** · **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — warten auf natürliche Fehler-/Störereignisse (künstliche verboten).
- **Selbstweck:** **bleibt deaktiviert**, in Production nie ausgeführt. Offen: (a) Preview-Beleg zum 3-s-Abbruch — **blockiert** ohne belegte Datenisolierung (Zielarchitektur §27.3.1), (b) 7-Tage-Fenster, (c) Vercel-Kosten. Ereignis-Antrieb **nicht aktivierungsbereit**.

## 10 · Gescheiterte Ansätze — nicht wiederholen

- **F-1** Tenant-JWT/RLS: stillgelegt, Trennung App-seitig. **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis ([Beleg](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: in Production gescheitert; `understanding-recovery.yml` **nie ausführen**.
- **F-5** feste Referenzzahl „145 Quellen": verworfen; gültig ist `Telemetriezeilen = distinct source_id` (B3). **OP-25 Anlauf 1 + Fenster 1/2**: gescheitert (E3); Fenster-Untergrenze 2026-08-04 bleibt verbindlich.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen). Eine leere Tabelle beweist nichts (`llm_usage`, §23–25). **Neu (§26):** ein scharfer Pfad, der nur mit einer Attrappe getestet wurde, ist nicht bewiesen; und ein Befund ist nur so gut wie sein **Lesepfad** (F-P6).

## 11 · Nächster empfohlener Schritt

1. **Mergefreigabe für den Absicherungs-Code-PR (§29) — zwingend zuerst.** Der Code ist fertig und offline bewiesen; erst Merge **und** Production-Deployment heben die Sperre aus §7.11 auf. Eigene Freigabe, nicht selbst gemergt.
2. **Erst danach Schritt 7: die acht Betreiberwerte setzen** (Deckel 2.416 · Reserve 702 · Vorrang real 200 · RPM 82 · TPM 250000 · Kosten 10,00 USD/Tag · Parallelität 1 · Kommunikation `gesperrt`) — Betreiberaktion an der Vercel-Env, danach Riegel- (8) und Wirksamkeitsprüfung (9). Die **Aktivierung** (10) braucht eine **eigene** Freigabe. Plan: `node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan`.
3. **Radar-Wirkungsbeleg (§9) weiter abwarten** — rein lesend, nichts auslösen. **Fenster:** allein **21:36–03:59 UTC** trägt die volle Kohorte für Aktivierung und Fachzyklus; für die reine Provisionierung gilt nur Cron-Kollisionsfreiheit.
4. **Gründerentscheidung zur Skalierung** (§6): KI-Deckel, AWS, Reihenfolge 10 → 25.
5. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach der **siebentägige Nachweis** mit 5 Mandaten; davor der Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
6. **Rückkehr zu den P0-Blockern OP-01…OP-04.** **Betreiberprüfung Doppelkanal** (OP-07, §7.10) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= **Production-Deployment**), keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. Migrationsstand und Anwendungsverbote: §3.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 angelegten Profile aktivieren und keine Stufe B/C provisionieren, solange §7.11 offen ist** — danach zusätzlich je eine Einzelfreigabe; **eine Umgebungsvariable ist auch dann freigabepflichtig, wenn sie nur im Prozess gesetzt wird** (§28).
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| **500er-Funktionstest (Rahmen, Ablauf, Sprints §34–§37)** | [`500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) |
| Production-Beweise · Backup/Restore | [`production_beweisprotokoll`](betrieb/production_beweisprotokoll.md) · [`backup-restore-runbook`](betrieb/backup-restore-runbook.md) |
| Skalierung 25/50/100 · 200 · Vorlage 10/25 | [`skalierung-25-50-100`](betrieb/skalierung-25-50-100.md) · [`skalierung-200-mandate`](betrieb/skalierung-200-mandate.md) · [`entscheidungsvorlage-skalierung`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md) |
| OP-01…OP-30 · OP-30-Runbook · Archiv | [`datenmotor-restliste`](datenmotor-restliste.md) · [`op30-aktivierung-5-mandate`](betrieb/op30-aktivierung-5-mandate.md) · [`archive/README`](archive/README.md) |
| Verträge: Morgenlage · Profil-Import · OP-31 · OP-30 CAS · OP-25 | [`op30-kapazitaet-morgenslots`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) · [`op30-profilvertrag-200-mandate`](betrieb/op30-profilvertrag-200-mandate.md) · [`briefing-frischevertrag`](betrieb/briefing-frischevertrag-2026-08-10.md) · [`op30-verstehen-cas`](betrieb/op30-verstehen-cas-2026-08-14.md) · [`vorgangskontext §7.7`](betrieb/vorgangskontext.md) |
| Cron-Fairness · Paket-Inventur · Watchdog · Env-Inventar | [`cron-fairness`](betrieb/cron-fairness.md) · [`30-paket-inventur-production`](quellenarchitektur/30-paket-inventur-production.md) · [`watchdog-korrektur-2026-08-26`](betrieb/watchdog-korrektur-2026-08-26.md) · [`env-inventar`](betrieb/env-inventar.md) |

## 14–22 · Sprints 24.08.–01.09. (Kurzform; Vollfassung im Archiv)

- **§20 Kapazität Understanding — BLOCKIERT**, Gate-Flip und PR-B gestoppt ([Beleg](betrieb/understanding-kapazitaet-2026-08-31.md)): Verhungern und wachsender Rückstand belegt (31.08.: 9.080 pending; Ankunft Ø 307, Abfluss Ø 68 /Tag). Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06 (1.769 Altfälle), Siebentagenachweis.
- **§21 500-Mandate-Reife** (#290, Freigabe 01.09.) — **drei getrennte Urteile, unverändert gültig:** Aufnahmefähigkeit 500 **erbracht** · rechnerisch **vorbereitet, Dimensionierung offen** · Mehrtagesbetrieb **NICHT BEWIESEN**. Minimal-Cron `18,48` vorbereitet, **nicht aktiviert**.
- **Geltende Lehren §14–§19:** `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung · der Anlage-Stapel legt nur **inaktiv** an · `partial` heißt nie „Slot fehlt" · Z22-Buchungen `20260829175642`/`20260829175749` **nicht erneut anwenden** · `lauf-bilanz.js` ist die **eine** kanonische Statusableitung.

## 23–25 · Gemergte Sprints 01.–03.09. (**#294 · #295 · #296**)

*Alle drei erfolgreich.* Vollbeleg: [SR §1–§33](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Sie machten Schutzregeln, Ausführer und beide Blocker-Hürden wirksam — den Test **nicht** startbereit. Kernbefund: „synthetisch" existierte außerhalb des Kommunikationsriegels **nicht**, die fünf realen Mandate waren an **vier** Stellen verdrängbar; daraufhin gebaut: Riegel über 7 Außenkanäle, `mandatsklasse.js`, Kohortenwerkzeuge, Kapazitäts-/Kostenriegel, Azure-Endpunktguard.

- **Entscheidungsrelevant weiterhin:** Telemetriequelle ist `helmut_store.data.llmUsage` (Ring 5.000), **nicht** `llm_usage`; Tagesbedarf p95 **170** / max 298 (Untergrenze). Azure 250.000 TPM / 250 RPM, `gpt-5-mini`, Sweden Central; **Gesamtkontingent des Kontos unbelegt**.
- **Acht vorbereitete Betreiberwerte (NICHTS gesetzt):** Deckel **2.416** · Reserve **702** · Vorrang real **200** · RPM **82** · TPM **250000** · Kosten **10,00 USD/Tag** · Parallelität **1** · Kommunikation `gesperrt`. Deckel **vor** Reserve. **`HELMUT_TENANT_LLM_CAP` nicht einschalten.**
- **Startfenster-Tor prüft FÄLLIGKEIT** (`due_at <= jetzt`, fail closed): Nachtfenster **21:36–03:59 UTC** trägt **100 %** aller drei Stufen, Tagesfenster 11:36–15:59 **0 %**, Abend 55–60 %. **Planung vor 00:00 UTC** ist harte Startbedingung. Kapazitätstor bei Parallelität 1: **2.522 ≥ 1.812**.
- **Unverändert wahr:** 3 von 4 Schutzgrenzen sind **nicht hart**; ohne `HELMUT_TESTLAUF_VORRANG_REAL` ist der Verdrängungsschutz **nicht wirksam**; Ring 5.000 trägt einen Testtag je Stufe; Lastbeweis in keiner Stufe erbracht.

## 26 · Sprint 03.09. — Stufenweise Provisionierung + §34.7 (**#297 gemergt, deployt**)

*Erfolgreich.* Vollbeleg: [SR §34](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). `--stufe=a|b|c` ist für die Provisionierung jetzt **Pflicht** (fehlend/unbekannt = Exit 2, **kein** Rückfall auf 495; **a→20 / b→75 / c→400**); Ablaufplan **28 Schritte, kein Sammelschritt**; die acht Betreiberwerte sind Vorbedingung jeder **Aktivierung**, keiner Provisionierung. Verhaltensbelegt: die inaktive Anlage erzeugt **0** Netz-, Riegel- und KI-Aufrufe, der Planer plant für 20 inaktive Profile **0** Aufträge. §34.7 nach Variante A geschlossen: die 434 Bundestagsprofile tragen amtliche WP-21-Ausschussnamen aus der Sollmenge — Stufe A **20/20**, Prüfung **495/495**.

- **Weiterhin gültig:** Production nutzt nachweislich die **relationalen** Profile; `scripts/profil-bereitschaft.js --production` bleibt als Klärbeleg **unzulässig**. Lastfolge **nach Aktivierung**: 42 der 495 Profile ziehen über „Arbeit und Soziales" ein Sachpaket (**+252 `source_fetch`/Tag**, davon 2 Profile in Stufe A); mit `HELMUT_TESTKOHORTE_QUELLEN=aktiv` wären es 1.802 statt 138 — **der Schalter bleibt AUS**. Offen (eigener PR): zweite Ausschusswahrheit im Radar (§34.13.7).

## 27 · Sprint 03.09. — Fünferabgleich + freigegebene Profilkorrektur (ausgeführt)

*Erfolgreich.* Vollbeleg: [SR §35](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Die Blob-Korrektur vom 04.08. blieb relational unwirksam — betroffen **alle fünf** aktiven Profile. Ausgeführt mit Freigabe: **eine** atomare Transaktion, 5 Zeilen, **8 Feldänderungen**, Compare-and-Set je Zeile, vorher Sicherung `--scope=profil`. Abnahme rein lesend vollständig bestanden; `created_at`/`updated_at` aller neun Zeilen unverändert, relational und Blob deckungsgleich. Ausgeschlossen (kein ständiger Ausschuss der Sollmenge): **Rechnungsprüfungsausschuss**, **Parlamentarischer Beirat für nachhaltige Entwicklung** — dokumentierte Modelllücke.

- **Offene Codearbeiten (eigener PR):** `VERALTETE_AUSSCHUSSNAMEN` fehlen zwei WP-20-Bezeichnungen (eine löst sogar eindeutig auf Nr. 13 auf); `scripts/profil-bereitschaft.js` behauptet in Z. 13/71 „rein lesend" — für `--production` strukturell zu stark.

## 28 · Sprint 04.09. — Stufe A inaktiv provisioniert · **TEILWEISE ABGESCHLOSSEN**

Vollbeleg: [SR §36](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) (Protokoll) und **SR §37** (Ursachen-/Wirkungsprüfung, rein lesend). Als **#300** gemergt (Merge-Commit `350d901`, Deployment READY); der Merge änderte keinen Anwendungscode und keine Production-Daten — rein lesend nachgeprüft (29/5/24, Stufe A 20/20 inaktiv, 0 Löschmarken, `helmut_jobs` 7205, `llm_used` 68, `crawlRuns` 20, `md5` der Zeile `main` unverändert).

**Erfolgreicher Kern.** Ein einziger scharfer Lauf `provisionierung --stufe=a` (UTC 11:38–11:40) legte **20 synthetische Profile der Stufe A** an: 20 angelegt, 0 fehlgeschlagen, **alle inaktiv und isoliert** (Konten gesperrt, Adressen `.invalid`, Isolationsbeleg 9/9 ok). Die bisherigen **9 Mandats- und 10 Identitätszeilen bytegenau unverändert**. Keine Aufträge, Crawls oder Modellaufrufe.

**Warum nicht vollständig erfolgreich — zwei Punkte:**

1. **`helmut_store.main.crawlRuns` wurde unbeabsichtigt von 36 auf 20 gekürzt.** `compactStore` kappte bei **jedem** `main`-Schreibvorgang mit `HELMUT_CRAWL_RUN_RETENTION` **der ausführenden Umgebung**; in der Sitzung nicht gesetzt ⇒ Code-Vorgabewert 20 statt Production 36. **Bewusst NICHT repariert:** die 16 Einträge sind nicht rekonstruierbar, eine Rekonstruktion müsste Felder **erfinden**, und sie wäre ein zweiter unbedingter Schreibvorgang auf dieselbe Zeile. **Wirkung (SR §37.2): kein Entscheidungspfad betroffen** — alle Entscheider lesen `listCrawlRuns(20)` oder nur `[0]`; betroffen sind eine Admin-Statistik und eine Admin-Kachel. **Zurückgenommen:** der Ring füllt sich **nicht** von allein wieder auf (SR §37.3).
2. **`HELMUT_PROFILE_DB_MODE=1` wurde nur für den einen Prozess gesetzt** — keine Vercel-Variable, keine dauerhafte Änderung. Ohne ihn hätte `saveProfile` nur den Blob geschrieben und falsches Grün gemeldet. Die Prozessvariable lag dennoch **außerhalb der wörtlich erteilten Freigabe**. **Regel ab jetzt: eine Umgebungsvariable ist auch dann freigabepflichtig, wenn sie nur im Prozess gesetzt wird.**

## 29 · Sprint 04.09. — Speicherpfad abgesichert · **TEILWEISE ABGESCHLOSSEN** (Code fertig, **nicht gemergt**)

Vollbeleg: **[SR §38](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)**. Erfüllt die Anforderungen aus SR §37.5. **Kein Production-Schreibvorgang** (nur `SELECT`), keine Umgebungsvariable, keine Migration, kein Merge, kein Deployment.

- **Wurzelursache beseitigt:** `compactStore` verkleinert `crawlRuns` **in keiner Konfiguration** mehr. Die erste Fassung kappte noch mit „belegter" Grenze — der eigene Review verwarf das: mit `HELMUT_CRAWL_RUN_RETENTION=20` wäre der Vorfall per Umgebungsvariable **wiederholbar** geblieben, mit grünem Bericht. Die Aufbewahrung durchzusetzen ist jetzt allein Sache von `saveCrawlRun`, dem einzigen Schreiber des Rings. **Preis:** eine gesenkte Aufbewahrung wirkt erst beim nächsten `saveCrawlRun` — in der heutigen Production also vorerst gar nicht (SR §37.3). Sichere Richtung, verliert nichts.
- **Eine Wahrheit:** neues Modul `lib/helmut/speicherpfad-vorflug.js` (reine Logik, kein Netz, keine DB). `storage.js` liest die Regel von dort; die Zweitwahrheit in `scripts/op25-production-nachweis.js` ist geschlossen und blockiert fail closed, wenn die Aufbewahrung nicht belegt ist.
- **Grenze nie unter dem Lesefenster (20)** — sonst schaltet sich der Google-Cooldown still ab, er verkürzt sich nicht.
- **Vorflug-Riegel** in Provisionierung, Aktivierung und Entfernung: Abbruch **vor dem ersten Schreibvorgang** mit **Exitcode 2**, wenn Aufbewahrung, Backend-Kohärenz, Zeilenkennung (`main`/`main-auth`) oder der wirksame Profil-Schreibmodus fehlen. **Bewusst ohne Riegel: der Rückweg** — er ist die Notbremse und darf nie an einer Vorbedingung scheitern; die Nacharbeit fasst `main` ohnehin nie an. Werkzeuge mit eigenem Runbook (`provision-tenant`, `blob-purge`, `reverse-backfill`) bekommen den **Bericht**, keinen Abbruch.
- **Das Werkzeug weist sein Schreibziel aus:** Werkzeug · Stufe · Profilanzahl · Aktivierungsstatus · Blob-Backend · geteilte Zeile und Kontenzeile · beide Schreibmodi · wirksame Aufbewahrung.
- **Beide Werkzeugbefunde geschlossen:** `realeMandateBeruehrt`/`loeschtNichts` **ersatzlos entfernt** (ein Ersatzfeld wäre strukturell invariant und damit wieder eine Behauptung); vier tautologische Tests prüfen jetzt Verhalten. `erhebungsSql()` liest die Adresse aus dem Auth-Blob statt aus `profiles.email` — rein lesend gegen Production gegengeprüft: **20/20 `.invalid`, 20 eindeutig**, vorher 20 Leerwerte.
- **Tests:** Offline-Gesamtlauf **319/319 grün** (582 s), Browser-/Mobile-Smoke **32/0**, neue Suite `scripts/speicherpfad-schutz-test.js` **61/61**. Eigener adversarialer Review über fünf Linsen, 30 Feststellungen, je zwei Widerleger; sechs davon umgesetzt.
- **Nicht enthalten:** kein Compare-and-Set auf `main` (SR §37.5 (7), eigener Nachweis nötig) · keine Wiederherstellung der 16 `crawlRuns` · keine Aktivierung, keine Stufe B/C, keine Profiländerung. **Stufe A ist unverändert vollständig inaktiv.**
