# CURRENT STATE — Helmut

**Stand: 2026-09-05 — `main`-Kopf `9407f8c` (Merge von #302, reine Doku). Production: **29 Profile, unverändert 5 aktiv**, 24 inaktiv (davon die **20 der Stufe A, alle inaktiv**), 0 Löschmarken; `crawlRuns` steht auf 20 und wurde **nicht wiederhergestellt** (§28). Der **Speicherpfad-Schutz ist gemergt und im Production-Deployment ausgerollt** (§29) — **offline verhaltensbasiert belegt, kein schreibender Production-Test des Riegels**. **Stufe A ist angelegt und vollständig inaktiv, Aktivierung nicht freigegeben** (§7.11). **Offene technische Befunde vom 05.09., Zwischenstand und ausdrücklich kein Urteil:** vier der acht Betreiberwerte haben keinen Laufzeitleser ([env-inventar §3a](betrieb/env-inventar.md)); der Tagesdeckel 100 bindet bereits bei fünf Mandaten; der Aktivierungspfad schreibt die geteilte Zeile `main` unbedingt (`CLAUDE.md` §4.10).** Nur der aktuelle, entscheidungsrelevante Zustand (Größengrenze testgesichert); Ablageregeln: [Archiv](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet**, Modus **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgen-/Lagelauf 5/5, 0 Verlust, alle elf §28.6-Kontrollen erfüllt ([`op30-aktivierung-5-mandate §30.7`](betrieb/op30-aktivierung-5-mandate.md)). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§14–22).** **Der Selbstweck ist lokal belegt, in Production nie ausgeführt.**

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Blocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main`-Kopf (05.09., 00:45 UTC): `9407f8c83fa37ecb371c0423ff87e64284409f51`** — Merge von **#302** (reine Doku), Eltern `8fa390d` (alter Kopf) und `6dbe25d` (PR-Kopf). Production-Deployment **`dpl_5vyVzomHBTy4soQLzq9dXwZVmwTU`, READY** (`githubCommitSha` = Merge-Commit) — rein lesend bestätigt. Nach weiteren Merges rückt der Kopf vor; maßgeblich ist dann die Git-Historie.
- **Letzter fachlich wirksamer Production-Code: `8fa390d`** (Merge von **#301**, Speicherpfad-Schutz — §29). Vorheriger fachlicher Stand **`b0071fd`** (Merge von #297); **#298–#300 und #302 änderten keinen Anwendungscode**.
- **Zuletzt gemergt: #302** (reine Doku: Nach-Merge-Beleg für #301, „wirksam" → „ausgerollt"); davor **#301** (Speicherpfad-Schutz, letzter fachlicher Code — §29) und **#300** (reine Doku). #275–#277 und #282 nach Konsolidierung **geschlossen, nicht gemergt** (Branches bleiben Auditbelege).
- **Offen:** kein fachlicher PR.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und Restore seit 28.07. geübt, RPO ≤ 24 h.
- **Mandate (04.09. rein lesend, selbst erhoben):** **29 Profile**, davon **5 aktiv** (`m5-9aee228dbf2c9f13`, alle **Bundestag**), **24 inaktiv**, 0 Löschmarken. Die 24 inaktiven = **4 Demo-Mandate** (OP-04-Rest) + **20 Stufe A** (`test-kohorte-a-001…020`, seit 04.09., §28). Daneben 30 Identitätsprofile (10 real + 20 Kohorte). **Nur die 5 aktiven erzeugen Last.** Ihre Ausschussfelder tragen seit 03.09. den amtlichen WP-21-Stand (§27); relational und Blob deckungsgleich.
- **Crawl-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Betreiberangabe, aus dem Code nicht unabhängig belegbar). Der Blob-Ring `crawlRuns` steht seit 04.09. auf **20** (§28) und **füllt sich nicht nach**: seit 23.08. erreicht kein Cron mehr `saveCrawlRun` (SR §37.3). Stillgelegter Altpfad-Puffer; kein Entscheidungspfad liest über Position 20 hinaus. **Der Schutz gegen erneute Kürzung ist seit dem #301-Merge im Production-Code enthalten** (§29) — **offline verhaltensbasiert belegt (115 Assertions), kein schreibender Production-Test des Riegels**.
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` nicht in Production.** Dazu Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (04.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze); **0,002941 USD je Aufruf** (Listenpreis, Kontopreis unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, Schranke 243 ([`kostenmessung`](betrieb/kostenmessung.md)).
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase und Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar** — Env-Aussagen sind **Betreiberangabe**, Flags nur wirkungsbasiert prüfbar; jede Flag-/Env-Änderung ist Betreiberaktion ([env-inventar §8](betrieb/env-inventar.md)). Parlamentsdomains per Egress-Proxy gesperrt.

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
| **20 Profile der Stufe A** (`test-kohorte-a-001…020`) | seit 04.09. in Production **angelegt und inaktiv** (§28), Konten gesperrt, Adressen auf `.invalid`. Aktivierung **nicht freigegeben** (§7.11); offene technische Befunde vom 05.09. in der Kopfzeile. Stufe B (75) und C (400) **nicht angelegt** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind seit 04.09. **in Production angelegt, aber inaktiv** (§28) — sie erzeugen keine Last. Offen:

1. **Siebentägiger Nachweis des Warteschlangenbetriebs mit 5 Mandaten** — nicht begonnen ([`op30-zielarchitektur §14 Stufe 2`](betrieb/op30-zielarchitektur-2026-08-13.md): Abfluss ≥ Ankunft über 7 Tage, 0 Verlust, Wartezeit < 24 h); Umschaltung braucht **fünf** Umgebungswerte.
2. **Regionale Quellen BE/BB**: Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert (Semantik/Schutzlimit 50: §4). **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Linien nicht.** p95 **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23–25; [`llm-budget-reservierung`](betrieb/llm-budget-reservierung.md)).
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 + OP-25-Wiederholung).
5. **20 zusätzliche Profile**: isolationsbelegt, **Aktivierung weiterhin nicht freigegeben** (§7.11) — braucht die acht geprüften Betreiberwerte (§11 Punkt 1). **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — Terminrisiko für den 25er-Nachweis.
6. **Ereignis-Antrieb:** **AWS ist dafür nicht technisch notwendig.** Den Fünfernachweis trägt der **Selbstweck** (Zustand: §9). AWS bleibt Transport für **große** Mandatszahlen — getrennte, kostenpflichtige Entscheidung.

Entscheidungsgrundlage: Entscheidungsvorlage Skalierung (§13).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR (Kostenentscheidung).
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mail.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. `20260720`).
4. **OP-04-Rest:** Umgang mit den deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderung bleibt Betreiberaktion.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Production-Beweis der Härtung steht aus (§8).
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6. Belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf (§13).
9. **500er-Funktionstest: NICHT startbereit.** Stand 04.09. (§28): **Stufe A ist inaktiv provisioniert und isolationsbelegt** — Schritt 6 von 28 erreicht; die Merge-Sperre vor Schritt 7 ist mit #301 aufgehoben (§7.11). **Schritt 7 (acht Betreiberwerte) bleibt eine eigene, bislang nicht erteilte Freigabe.** Offen bleiben: Laufzeit der KI-freien Klassen, Azure-Gesamtkontingent, Verdrängungsschutz unter Last, Mehrtagesbetrieb.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).
11. **(04.09.) — Profil-Schreibpfad: Absicherung ausgerollt, Aktivierungsfreigabe weiterhin offen.** Der Speicherpfad-Schutz ist mit #301 gemergt und im Production-Deployment ausgerollt (Kopf/Deployment: §29, Vollbeleg SR §38) — **ausschließlich offline verhaltensbasiert belegt, kein schreibender Production-Test des Riegels**; eine **beobachtete** Production-Wirkung ist damit **nicht** behauptet, diese Nachweisgrenze bleibt ausdrücklich bestehen. **Aktivierung der Stufe A, Stufe B und Stufe C bleiben weiterhin nicht freigegeben** — Vorbedingung ist die vollständige Prüfung und gesonderte Freigabe der acht Betreiberwerte (§11 Punkt 1). **Weiter offen, bewusst nicht angefasst:** die geteilte Zeile `main` wird unbedingt und vollständig ersetzt (**Last-Write-Wins ohne Compare-and-Set**) — Architekturschritt SR §37.5 (7), eigener Nachweis nötig.

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

1. **Acht Betreiberwerte prüfen und gesondert freigeben (Schritt 7)** — Deckel, Reserve, Vorrang real, RPM, TPM, Kosten, Parallelität, Kommunikation (Werte: §23–25); Betreiberaktion an der Vercel-Env. Danach Riegel- (Schritt 8) und Wirksamkeitsprüfung (Schritt 9). **Die Aktivierung (Schritt 10) braucht diese eigene Freigabe** — der jetzt ausgerollte Speicherpfad-Schutz (§29) ersetzt sie nicht. Plan: `node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan`.
2. **Radar-Wirkungsbeleg (§9) weiter abwarten** — rein lesend, nichts auslösen. **Fenster:** allein **21:36–03:59 UTC** trägt die volle Kohorte für Aktivierung und Fachzyklus; für die reine Provisionierung gilt nur Cron-Kollisionsfreiheit.
3. **Gründerentscheidung Skalierung** (§6): KI-Deckel, AWS, Reihenfolge 10 → 25.
4. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach der **siebentägige Nachweis** mit 5 Mandaten; davor der Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
5. **Rückkehr zu den P0-Blockern OP-01…OP-04.** **Betreiberprüfung Doppelkanal** (OP-07, §7.10) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Unverändert gilt:

- Kein Merge nach `main` (= **Production-Deployment**), keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. Migrationsstand und Anwendungsverbote: §3.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 angelegten Profile aktivieren und keine Stufe B/C provisionieren, ohne die acht geprüften Betreiberwerte und eine gesonderte Aktivierungsfreigabe** (§7.11, §11 Punkt 1); **eine Umgebungsvariable ist auch dann freigabepflichtig, wenn sie nur im Prozess gesetzt wird** (§28).
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

Alle Pfade relativ zu `docs/`. **500er-Funktionstest** (Rahmen, Ablauf, Sprints §34–§38): [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
**OP-Liste und Archiv:** [Restliste](datenmotor-restliste.md) · [OP-30 Fünfermandate](betrieb/op30-aktivierung-5-mandate.md) · [Archiv](archive/README.md).
**Production/Betrieb:** [Beweisprotokoll](betrieb/production_beweisprotokoll.md) · [Backup/Restore](betrieb/backup-restore-runbook.md) · [Cron-Fairness](betrieb/cron-fairness.md) · [Env-Inventar](betrieb/env-inventar.md) · [Watchdog 26.08.](betrieb/watchdog-korrektur-2026-08-26.md) · [Kostenmessung](betrieb/kostenmessung.md) · [Paket-Inventur](quellenarchitektur/30-paket-inventur-production.md).
**Skalierung:** [25/50/100](betrieb/skalierung-25-50-100.md) · [200 Mandate](betrieb/skalierung-200-mandate.md) · [Entscheidungsvorlage 24.08.](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md).
**Verträge:** [Morgenlage-Kapazität](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) · [Profil-Import](betrieb/op30-profilvertrag-200-mandate.md) · [Briefing-Frische](betrieb/briefing-frischevertrag-2026-08-10.md) · [OP-31/OP-30 CAS](betrieb/op30-verstehen-cas-2026-08-14.md) · [OP-25 §7.7](betrieb/vorgangskontext.md).

## 14–22 · Sprints 24.08.–01.09. (Kurzform; Vollfassung im Archiv)

- **§20 Kapazität Understanding — BLOCKIERT** ([Beleg](betrieb/understanding-kapazitaet-2026-08-31.md)): 31.08. 9.080 pending, Ankunft Ø 307 / Abfluss Ø 68 pro Tag. Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06 (1.769 Altfälle), Siebentagenachweis.
- **§21 500-Mandate-Reife** (#290) — **drei Urteile, gültig:** Aufnahmefähigkeit 500 **erbracht** · Dimensionierung **offen** · Mehrtagesbetrieb **NICHT BEWIESEN**. Minimal-Cron `18,48` vorbereitet, **nicht aktiviert**.
- **Lehren §14–§19:** `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung · der Anlage-Stapel legt nur **inaktiv** an · `partial` heißt nie „Slot fehlt" · Z22-Buchungen `20260829175642`/`20260829175749` **nicht erneut anwenden** · `lauf-bilanz.js` ist die kanonische Statusableitung.

## 23–25 · Gemergte Sprints 01.–03.09. (**#294 · #295 · #296**)

*Alle drei erfolgreich.* Vollbeleg: [SR §1–§33](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Sie machten Schutzregeln und Ausführer wirksam — den Test **nicht** startbereit.

- **Entscheidungsrelevant:** Telemetriequelle ist `helmut_store` Zeile `<id>-auth`, Schlüssel `llmUsage` (Ring 5.000), **nicht** die Zeile `main` und **nicht** `llm_usage`; Tagesbedarf p95 **170** / max 298 (Untergrenze). Azure 250.000 TPM / 250 RPM, `gpt-5-mini`, Sweden Central; **Kontokontingent unbelegt**.
- **Acht vorbereitete Betreiberwerte, NICHTS gesetzt.** Welche davon zur Laufzeit überhaupt gelesen werden: [env-inventar §3a](betrieb/env-inventar.md) (Codeprüfung 05.09.).
- **Startfenster-Tor prüft FÄLLIGKEIT** (`due_at <= jetzt`, fail closed): nur **21:36–03:59 UTC** trägt **100 %**; die **Aktivierung** muss **vor** 21:36 abgeschlossen sein, sie liegt vor dem Fenster. **Planung vor 00:00 UTC** ist harte Startbedingung.

## 26 · Sprint 03.09. — Stufenweise Provisionierung + §34.7 (**#297 gemergt, deployt**)

*Erfolgreich.* Vollbeleg: [SR §34](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). `--stufe=a|b|c` ist bei der Provisionierung **Pflicht** (fehlend/unbekannt = Exit 2, **a→20 / b→75 / c→400**); Ablaufplan **28 Schritte**; die acht Betreiberwerte sind Vorbedingung jeder **Aktivierung**, keiner Provisionierung. Die inaktive Anlage erzeugt **0** Netz-, Riegel- und KI-Aufrufe. Stufe A **20/20**, Prüfung **495/495**. Production nutzt die **relationalen** Profile; `profil-bereitschaft.js --production` bleibt als Klärbeleg **unzulässig**. Lastfolge **nach Aktivierung**: **+252 `source_fetch`/Tag** (2 davon in Stufe A); `HELMUT_TESTKOHORTE_QUELLEN` bleibt **AUS** (sonst 1.802 statt 138).

## 27 · Sprint 03.09. — Fünferabgleich + freigegebene Profilkorrektur (ausgeführt)

*Erfolgreich.* Vollbeleg: [SR §35](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Die Blob-Korrektur vom 04.08. blieb relational unwirksam — betroffen **alle fünf** aktiven Profile. Mit Freigabe ausgeführt: **eine** atomare Transaktion, 5 Zeilen, **8 Feldänderungen**, Compare-and-Set je Zeile, vorher Sicherung; Abnahme rein lesend bestanden. Modelllücke: Rechnungsprüfungsausschuss und Parlamentarischer Beirat sind keine ständigen Ausschüsse der Sollmenge. **Offen (eigener PR):** zwei fehlende WP-20-Bezeichnungen in `VERALTETE_AUSSCHUSSNAMEN`; `profil-bereitschaft.js` behauptet Z. 13/71 „rein lesend" — für `--production` zu stark.

## 28 · Sprint 04.09. — Stufe A inaktiv provisioniert · **TEILWEISE ABGESCHLOSSEN**

Vollbeleg: [SR §36/§37](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Als **#300** gemergt — Merge-Commit `350d9015576c724711179322dddd6063fcf02fd8`, Deployment `dpl_DFHbTQo5T4fButYGbEXUHgzSsfnP` (READY); kein Anwendungscode, keine Production-Daten. Unmittelbar danach rein lesend nachgeprüft (29/5/24, Stufe A 20/20 inaktiv, `crawlRuns` 20, `md5` der Zeile `main` **unverändert**); die spätere Änderung (16:04 UTC) stammt vom **regulären 16:00-Pipelinecron** (0 Kohortenaufträge, 0 Profiländerungen).

**Erfolgreicher Kern.** Scharfer Lauf `provisionierung --stufe=a` (11:38–11:40 UTC): **20 Profile** angelegt, 0 fehlgeschlagen, **alle inaktiv und isoliert** (9/9); die 9 Mandats- und 10 Identitätszeilen **bytegenau unverändert**.

**Warum nicht vollständig erfolgreich:**

1. **`helmut_store.main.crawlRuns` wurde unbeabsichtigt von 36 auf 20 gekürzt.** `compactStore` kappte bei **jedem** `main`-Schreibvorgang mit der Aufbewahrung **der ausführenden Umgebung**; in der Sitzung nicht gesetzt ⇒ Code-Vorgabewert 20. **Bewusst NICHT repariert:** die 16 Einträge sind nicht rekonstruierbar, eine Rekonstruktion müsste Felder **erfinden**. **Wirkung (SR §37.2): kein Entscheidungspfad betroffen** — alle Entscheider lesen `listCrawlRuns(20)` oder nur `[0]`; betroffen sind eine Admin-Statistik und eine Admin-Kachel. Der Ring füllt sich **nicht** von allein wieder auf (SR §37.3).
2. **`HELMUT_PROFILE_DB_MODE=1` wurde nur für den einen Prozess gesetzt** — keine Vercel-Variable. Ohne ihn hätte `saveProfile` nur den Blob geschrieben und falsches Grün gemeldet; die Prozessvariable lag dennoch **außerhalb der Freigabe**. **Regel ab jetzt: eine Umgebungsvariable ist auch dann freigabepflichtig, wenn sie nur im Prozess gesetzt wird.**

## 29 · Sprint 04.09. — Speicherpfad-Schutz gemergt und deployt · **ERFOLGREICH ABGESCHLOSSEN** (**#301**, Deployment READY, Production unverändert, Wirkung **offline** belegt — kein schreibender Production-Test)

Vollbeleg: **[SR §38](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)** (inkl. §38.9, fünfte Nachbesserung). Erfüllt SR §37.5. Gemergt als **#301** — Merge-Commit **`8fa390d065a1b8c895b2f9f94c889bced4cd1d89`**, Eltern `350d901`/`c6e6435`, 04.09. 21:14:20 UTC. Production-Deployment **`dpl_BHEaHNmHC9xm9gSZtKCdZM6DbDTN`, Status READY** (target `production`, `githubCommitSha` = Merge-Commit) — rein lesend bestätigt.

- **Production nach dem Merge rein lesend geprüft, unverändert:** 29 Profile (5 aktiv, 24 inaktiv), **20/20 Stufe A weiterhin inaktiv**, 0 Stufe B/C, 0 Löschmarken, **0 aktive Kohortenkonten**, **0 Kohortenaufträge**, 0 neue Kohortenaktivität (Audit/Sessions/ProcessRuns), **0 Kohorten-Modellverbrauch**, `crawlRuns` weiterhin **20**, **35** Migrationen, Profil-Zeitstempel (`max(updated_at)`) unverändert.
- **Nachweisgrenze, ausdrücklich erhalten:** die Wirkung des Riegels ist **ausschließlich offline verhaltensbasiert** belegt (115 Assertions, 64er-/256er-Kombinationsdurchlauf). **In Production wurde kein schreibender Test des Riegels ausgeführt.**
- **Mechanismus (Vollbeleg SR §38):** `compactStore` verkleinert `crawlRuns` in **keiner** Konfiguration mehr (Grenze allein in `saveCrawlRun`, nie unter dem Lesefenster 20); **eine Wahrheit** in `speicherpfad-vorflug.js`; **Vorflug-Riegel** mit Exit 2 vor dem ersten Schreibvorgang in Provisionierung/Aktivierung/Entfernung und `provision-tenant` (Rückweg bewusst ungeriegelt); **`--validate`-Umgehung geschlossen** (SR §38.9).
- **Tests vor dem Merge:** Offline 319/319, Browser-Smoke 32/0, `speicherpfad-schutz-test.js` 115/115.
- **Nicht enthalten:** kein Compare-and-Set auf `main` (**SR §37.5 (7), weiterhin offen**, eigener Nachweis nötig) · keine Wiederherstellung der 16 `crawlRuns` · **keine Aktivierung, keine Stufe B/C, keine Profiländerung** — Stufe A ist unverändert vollständig inaktiv.
