# CURRENT STATE — Helmut

**Stand: 2026-09-03 — PR #297 gemergt und deployt (`b0071fd`, §2/§26). Die stufenweise Provisionierung und die verschärfte Bundestagsreife-Sperre sind damit in Production wirksam; 495/495 synthetische Profile sind offline reif. Der Production-Profilpfad ist relational wirkungsbelegt; genau ein aktives reales Profil trägt dort eine nicht auflösbare Ausschussangabe (§26). Der 500er-Funktionstest bleibt **nicht startbereit**.** Nur der aktuelle, entscheidungsrelevante Zustand (Grenze 30.000 Zeichen, testgesichert); Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet**, Modus **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgen-/Lagelauf 5/5, 0 Verlust, alle elf §28.6-Kontrollen erfüllt ([`op30-aktivierung-5-mandate §30.7`](betrieb/op30-aktivierung-5-mandate.md)). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§14–22).** **Der Selbstweck ist lokal belegt, in Production nie ausgeführt.**

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Blocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main`-Kopf und letzter fachlich wirksamer Production-Code: `b0071fd2683837619483b45a340d399ca01309f2`** (Merge von #297, 03.09. 12:39:05 UTC). Der Vercel-Status am exakten Merge-Commit ist **erfolgreich** ([Nachweis](https://vercel.com/nohut/helmut-pilot/8BLXbeq6PGzwG3P77z8BXRnnmF8f)); interne Deployment-Details und `dpl_`-Kennung **nicht zusätzlich bestätigt**. Beide Pflicht-Checks am PR-Kopf `540b57b` grün (Lauf 33755229167).
- **Gemergt:** zuletzt **#297**; die vollständige Merge-Folge steht in der PR-/Git-Historie. #275–#277 und #282 nach Konsolidierung **geschlossen, nicht gemergt** (Branches bleiben Auditbelege).
- **Offene fachliche PRs:** keine. Die abschließende reine Nach-Merge-Dokumentation zu #297 wird getrennt geführt und löst gemäß `CLAUDE.md` §9 keinen rekursiven Folge-PR aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und Restore seit 28.07. geübt, RPO ≤ 24 h.
- **Mandate (zwei Zählungen, nicht dasselbe — 03.09. rein lesend, Betreiberangabe):** **9 Mandatsprofile**, davon **5 aktiv** (`m5-9aee228dbf2c9f13`) und **4 inaktiv** (Demo, OP-04-Rest), 0 Löschmarken; alle 5 aktiven sind **Bundestagsprofile**. **0 Profile der Testkohorte**, **0 synthetische Zeilen**. Daneben 10 Identitätsprofile; nur die 5 aktiven erzeugen Last.
- **Crawl-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Bedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` ist nicht in Production.** Dazu der Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (02.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze); **0,002941 USD je Aufruf** (Listenpreis, Kontopreis unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, Schranke 243 ([`kostenmessung`](betrieb/kostenmessung.md)).
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase und Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar** — Env-Aussagen sind **Betreiberangabe**, ebenso Production-Erhebungen, die diese Sitzung nicht selbst fahren kann. Flag-Zustände nur wirkungsbasiert prüfbar; jede Flag-/Env-Änderung ist Betreiberaktion ([env-inventar §8](betrieb/env-inventar.md)). Parlamentsdomains per Egress-Proxy gesperrt.

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget: Deckel **100**, davon **30** für Verstehen reserviert (Reserve liegt **im** Deckel ⇒ höchstens 70 nicht priorisiert, **nie 130**) | fail-closed im Code. **Dokumentiert, nicht live verifiziert**. Ohne die Variable greift Schutzlimit **50**; **ab 50 reicht 100 nicht** (§6.3) |
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
| `HELMUT_TESTLAUF_*` (Vorrang real, Kommunikation, RPM/TPM, Kosten, Parallelität) | **nicht gesetzt**; Werte vorbereitet (§23–25, [env-inventar §3a](betrieb/env-inventar.md)). **Erst vor der Aktivierung der Stufe A Pflicht, nicht vor der inaktiven Provisionierung** (§26) |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | nicht gesetzt; ohne beide Riegel fällt jeder Kohortenschritt auf den Trockenlauf. `_QUELLEN` bleibt für den ganzen Test AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad in Production wirkungsbelegt**; der rohe Env-Wert bleibt unbestätigt. `GET /api/admin/tenant-mode` kann die relevanten Booleans mit Admin-Sitzung zusätzlich anzeigen (§26) |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind ein **lokales, deaktiviertes Importpaket** (`aktiv: false`, kein Import in Production). Offen:

1. **Siebentägiger Nachweis des Warteschlangenbetriebs mit 5 Mandaten** — nicht begonnen ([`op30-zielarchitektur §14 Stufe 2`](betrieb/op30-zielarchitektur-2026-08-13.md): Abfluss ≥ Ankunft über 7 Tage, 0 Verlust, Wartezeit < 24 h); Umschaltung braucht **fünf** Umgebungswerte.
2. **Regionale Quellen BE/BB**: Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert (Semantik/Schutzlimit 50: §4). **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Linien nicht.** p95 **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23–25; [`llm-budget-reservierung`](betrieb/llm-budget-reservierung.md), [`skalierung-25-50-100 §2c`](betrieb/skalierung-25-50-100.md)).
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 + OP-25-Wiederholung).
5. **20 zusätzliche Profile**: amtlich bestätigt (Strenge-Stufe 2; **maßgeblich ist der letzte Verifikationslauf am PR**); Import/Aktivierung freigabepflichtig. **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — danach erneute Prüfung; Terminrisiko für den 25er-Nachweis.
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
9. **500er-Funktionstest: NICHT startbereit, nicht freigegeben.** Stand 03.09. (§26, Kette §11.2): **PR #297 ist gemergt und der Vercel-Status am Merge-Commit erfolgreich**; Stufe A 20/20 und Bundestagsreife-Sperre geschlossen. Vor einer inaktiven Provisionierung bleiben **aktuelle Grundlinie + Sicherung der betroffenen Tabellen** Pflicht und die Provisionierung braucht eine eigene Freigabe. Vor der ersten Aktivierung müssen die relationale Profilabweichung fachlich und technisch aufgelöst und die **acht Betreiberwerte** wirksam belegt sein. Offen: Zahl offener Aufträge (erst nach Provisionierung messbar), Laufzeit der KI-freien Klassen, Azure-Gesamtkontingent, Verdrängungsschutz unter Last, Mehrtagesbetrieb.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).

K2/K3 und OP-25 abgeschlossen (OP-25 laut Betreiberfeststellung 24.08.). Nach einer weiteren OP-30-Stufenaktivierung muss OP-25 **vollständig wiederholt** werden.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04) | Genau ein aktives reales Profil trägt relational eine nicht auflösbare Ausschussangabe; amtlichen Stand prüfen und separat freigegebene Production-Korrektur vor der ersten Kohortenaktivierung (§26) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| `source_id`-Dubletten (OP-19) | Live-Nachweis der B3-Gleichung (§10 F-5) |
| Punkt 16 Quellenstörung | 7/14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching · 29 Fehlervertrag | 23B-2 (Briefing-Historisierung) · 29B |
| Punkt 26/27 (E2E BE/BB) | 26B blockiert (P14), 27B (P15), 27A-2 offen |
| Mail (#204/#205) · Kalender (#209) | Mailpit-Lauf, Aktivierung freigabepflichtig · zuerst die [Rechtsfrage](kalender-machbarkeit-1.md) |
| Berlin-Reife (P14) | Betreiber-Flagzugang + stabile Pipeline |
| OP-06 Aussortieren (34 Fälle) | Freigabe + Fachfrage |
| Gesundheitsbot-Folgepunkt | Watchdog findet keine Altquittungen |

## 9 · Ausstehende Production-Nachweise

- **OP-25**: drittes Fenster BESTANDEN (07./08.08.), nur für 5 Mandate (Wiederholungspflicht §7); OP-14 offen. **OP-31**: BESTANDEN (11.08.), Kopfstatus/UI nicht live abgerufen.
- **F-E2E — Ursache belegt, korrigiert, seit #290 deployt:** `created_at` friert beim Erstauftritt ein, deshalb sortiert `listMatchingResults` jetzt **rank-primär** (Regression 15/0). Offen: natürlicher Production-Nachweis.
- **29B** · **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — warten auf natürliche Fehler-/Störereignisse (künstliche verboten).
- **Selbstweck:** **bleibt deaktiviert**, in Production nie ausgeführt. Offen: (a) Preview-Beleg zum 3-s-Abbruch — **blockiert** ohne belegte Datenisolierung (Zielarchitektur §27.3.1), (b) 7-Tage-Fenster, (c) Vercel-Kosten. Ereignis-Antrieb **nicht aktivierungsbereit**.

## 10 · Gescheiterte Ansätze — nicht wiederholen

- **F-1** Tenant-JWT/RLS: stillgelegt, Trennung App-seitig. **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis ([Beleg](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: in Production gescheitert; `understanding-recovery.yml` **nie ausführen**.
- **F-5** feste Referenzzahl „145 Quellen": verworfen; gültig ist `Telemetriezeilen = distinct source_id` (B3). **OP-25 Anlauf 1 + Fenster 1/2**: gescheitert (E3); Fenster-Untergrenze 2026-08-04 bleibt verbindlich.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen). Eine leere Tabelle beweist nichts (`llm_usage`, §23–25). **Neu (§26):** ein scharfer Pfad, der nur mit einer Attrappe getestet wurde, ist nicht bewiesen; und ein Befund ist nur so gut wie sein **Lesepfad** (F-P6).

## 11 · Nächster empfohlener Schritt

1. **Profilabweichung (§26):** amtlichen aktuellen Ausschussstand des betroffenen realen Mandats fachlich belegen; danach eine eng begrenzte relationale Production-Profilkorrektur separat zur Freigabe vorlegen und rein lesend bestätigen. Keine automatische Ersetzung.
2. **Erst danach die Kette der Stufe A:** Grundlinie → Sicherung der betroffenen Tabellen → Fenster → `provisionierung --stufe=a` (inaktiv, eigene Freigabe) → `isolation --stufe=a` → **acht Betreiberwerte setzen und wirksam prüfen** → Aktivierung A (eigene Freigabe) → Fachzyklus A → Kontrolle A. B und C getrennt, erst nach kontrollierter Vorstufe. Plan: `node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan` (jeder Testlauf über `lokal.js`).
3. **Fenster:** allein **21:36–03:59 UTC** trägt die volle Kohorte (§23–25); Planung **vor 00:00 UTC**. Die Zahl offener Aufträge ist erst nach Provisionierung und Planung messbar (`erhebungsSql()`, SR §30.8).
4. **Gründerentscheidung zur Skalierung** (§6): KI-Deckel, AWS, Reihenfolge 10 → 25.
5. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach der **siebentägige Nachweis** mit 5 Mandaten; davor der Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
6. **Rückkehr zu den P0-Blockern OP-01…OP-04.** **Betreiberprüfung Doppelkanal** (OP-07, §7.10) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= **Production-Deployment**), keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. Migrationsstand und Anwendungsverbote: §3.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 neuen Profile ohne gesonderte Freigabe importieren oder aktivieren**; **keine Kohortenprovisionierung ohne die Einzelfreigabe der Stufe.**
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| **500er-Funktionstest (Rahmen, Ablauf, Fälligkeitstor, Sprint 03.09. §34)** | [`500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) |
| Production-Beweise · Backup/Restore | [`production_beweisprotokoll`](betrieb/production_beweisprotokoll.md) · [`backup-restore-runbook`](betrieb/backup-restore-runbook.md) |
| Skalierung 25/50/100 · 200 · Vorlage 10/25 | [`skalierung-25-50-100`](betrieb/skalierung-25-50-100.md) · [`skalierung-200-mandate`](betrieb/skalierung-200-mandate.md) · [`entscheidungsvorlage-skalierung`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md) |
| OP-01…OP-30 · OP-30-Runbook · Archiv | [`datenmotor-restliste`](datenmotor-restliste.md) · [`op30-aktivierung-5-mandate`](betrieb/op30-aktivierung-5-mandate.md) · [`archive/README`](archive/README.md) |
| Verträge: Morgenlage-Kapazität · Profil-Import · OP-31 Frische · OP-30 CAS · OP-25 Nachweis | [`op30-kapazitaet-morgenslots`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) · [`op30-profilvertrag-200-mandate`](betrieb/op30-profilvertrag-200-mandate.md) · [`briefing-frischevertrag`](betrieb/briefing-frischevertrag-2026-08-10.md) · [`op30-verstehen-cas`](betrieb/op30-verstehen-cas-2026-08-14.md) · [`vorgangskontext §7.7`](betrieb/vorgangskontext.md) |
| Cron-Fairness · Paket-Inventur · Watchdog 26.08. | [`cron-fairness`](betrieb/cron-fairness.md) · [`30-paket-inventur-production`](quellenarchitektur/30-paket-inventur-production.md) · [`watchdog-korrektur-2026-08-26`](betrieb/watchdog-korrektur-2026-08-26.md) |

## 14–22 · Sprints 24.08.–01.09. (Kurzform; Vollfassung im Archiv)

- **§20 Kapazität Understanding — BLOCKIERT**, Gate-Flip und PR-B gestoppt ([Beleg](betrieb/understanding-kapazitaet-2026-08-31.md)): Verhungern und wachsender Rückstand belegt (31.08.: 9.080 pending; Ankunft Ø 307, Abfluss Ø 68 /Tag). Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06 (1.769 Altfälle), Siebentagenachweis.
- **§21 500-Mandate-Reife** (#290, Freigabe 01.09.) — **drei getrennte Urteile, unverändert gültig:** Aufnahmefähigkeit 500 **erbracht** · rechnerisch **vorbereitet, Dimensionierung offen** · Mehrtagesbetrieb **NICHT BEWIESEN**. Minimal-Cron `18,48` vorbereitet, **nicht aktiviert**.
- **Geltende Lehren §14–§19:** `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung · der Anlage-Stapel legt nur **inaktiv** an, zuerst reißt die 500-MB-Free-Grenze · `partial` heißt nie „Slot fehlt", nur 1/5 mit Push-Empfänger · Z3a 92/92 **nicht** die echten Anbieter · Z22-Buchungen `20260829175642`/`20260829175749` **nicht erneut anwenden** · `lauf-bilanz.js` ist die **eine** kanonische Statusableitung.

## 23–25 · Gemergte Sprints 01.–03.09. (**#294 `881739da` · #295 `9079ac3` · #296 `a839c1b`**)

*Alle drei erfolgreich.* Vollbeleg: [SR](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) §1–§33, Nach-Merge-Beleg §34.1. Die Merges machten Schutzregeln, Ausführer und beide Blocker-Hürden wirksam — den Test **nicht** startbereit.

- **Kernbefund:** „synthetisch" existierte außerhalb des Kommunikationsriegels **nicht**; die fünf realen Mandate waren an **vier** Stellen verdrängbar. Daraufhin gebaut (SR §1–§21): Riegel über 7 Außenkanäle, `mandatsklasse.js` mit vier Schutzregeln, Kohortenwerkzeuge, Kapazitäts-/Kostenriegel, Azure-Endpunktguard — **bei 0 synthetischen Zeilen byte-identisch**. **Drei Auswerterkanäle nicht messbar.**
- **Telemetriequelle:** `helmut_store.data.llmUsage` (Ring 5.000), nicht `llm_usage` (§10). 02.07.–01.09.: 3.673 Erfolge · **19 Azure-Fehler (0,51 %)**. **Tagesbedarf** p95 **170** / max 298 (UNTERGRENZE). **Azure** (02.09.): 250.000 TPM / 250 RPM, `gpt-5-mini`, Sweden Central; **Gesamtkontingent des Kontos unbelegt.**
- **Acht vorbereitete Betreiberwerte (NICHTS gesetzt):** Deckel **2.416** · Reserve **702** · Vorrang real **200** · RPM **82** · TPM **250000** · Kosten **10,00 USD/Tag** · Parallelität **1** · Kommunikation `gesperrt`. Deckel **vor** Reserve. **`HELMUT_TENANT_LLM_CAP` nicht einschalten.**
- **Startfenster-Tor prüft FÄLLIGKEIT (SR §30):** maßgeblich ist `due_at <= jetzt`, fail closed. Gemessen (03.09.): Nachtfenster **21:36–03:59 UTC** trägt **100 %** aller drei Stufen; Tagesfenster 11:36–15:59 **0 %**; Abendfenster 55–60 %. **Planung vor 00:00 UTC** ist harte Startbedingung (SR §30.5). Kapazitätstor bei Parallelität 1: **2.522 ≥ 1.812** (SR §30.7). Sieben Statusmengen, **zwei Urteile** (Fachzyklus · Lastbeweis); `startbereit` für alle drei Stufen erreichbar (A/B ab 143 min, C ab 276 min). **Kein schreibender Planungscode.** Messintegrität: `frischefenster`/`stufe` Pflicht, `mindestAbdeckung` ≥ 0,5, Hürde 25/100/500.
- **Unverändert wahr** (Abschnitte des Sicherheitsrahmens): 3 von 4 Schutzgrenzen sind nicht hart (SR §23.4); `HELMUT_TESTLAUF_VORRANG_REAL` ungesetzt ⇒ Verdrängungsschutz **nicht wirksam** (SR §25.2); Ring 5.000 trägt einen Testtag je Stufe (SR §27); Lastbeweis in keiner Stufe erbracht.

## 26 · Sprint 03.09. — Stufenweise Provisionierung + §34.7 (**PR #297 gemergt, Production-Code deployt**)

*Erfolgreich abgeschlossen — offline bewiesen, als PR #297 auf `main` gemergt und durch erfolgreichen Vercel-Status am Merge-Commit belegt.* PR-Kopf `540b57b`, Merge-Commit `b0071fd`, Basis `a839c1b`. Vollbeleg: [SR](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) §34.

- **Befund/Korrektur (§34.2/.3):** `provisionierung --stufe=a` ignorierte die Stufe still (zielGroesse **495**, Pauschalwort, Exit 0). Jetzt ist `--stufe=a|b|c` Pflicht; fehlend/leer/unbekannt → **Exit 2 vor jedem Zugriff, kein Rückfall auf 495**; `--ids=` nur in derselben Stufe. **a→20 / b→75 / c→400**. Bibliothek unverändert.
- **Ablaufplan stufenweise (28 Schritte, kein Sammelschritt):** Reifebeleg → Anlage (inaktiv) → Isolation → Aktivierung → Fachzyklus → Kontrolle je Stufe; B erst nach kontrollierter A, C nach B. **Die acht Betreiberwerte sind Vorbedingung jeder Aktivierung, keiner Provisionierung** (SR §34.5). Rückweg nie gesperrt.
- **Verhaltensbelegt:** die inaktive Provisionierung (echter `provisionTenant`) erzeugt **0** Netz-, **0** Riegel-, **0** KI-Aufrufe, lädt kein Außenkanal-/KI-/Crawl-Modul nach; der echte Planer plant für 20 inaktive Profile **0** Aufträge (Gegenprobe: 1 aktives → 2). **Zwei Lücken geschlossen:** die Verstehens-Interessenprüfung zählte inaktive Profile mit (jetzt `isDisabled`); `provisionTenant` befolgte `spec.reaktivieren:true` auch in einem inaktiven Lauf — jetzt Abbruch vor dem Schreibvorgang.
- **§34.7 geschlossen (Variante A, Betreiberentscheidung 03.09.):** die Reifesperre wies **18 von 20** Stufe-A-Profilen ab („Testausschuss N" fehlt in der Sollmenge). Behoben in der **Kohorte**, nicht in der Regel: die **434 Bundestagsprofile** tragen amtliche WP-21-Namen aus der Sollmenge (**keine zweite Namensliste**), die **61 Landtagsprofile** weiter synthetische — ein Bundestagsausschuss auf Landesebene wäre die falsche Ebene. Kennungen, Adressen, Testnamen und -themen bleiben synthetisch. Stufe A **20/20**, Prüfung **495/495**.
- **Dabei verschärft, nicht gelockert:** veraltete Ausschussnamen liefen bisher als gültig durch (3 von 4 dokumentierten WP-20-Namen; die Negativliste wurde nur im Fehlerzweig gelesen). Jetzt weisen sie ab (36 Schreibvarianten geprüft), Kurzformen bleiben gültig (32 geprüft). Harte Sperre nur bei Neuaktivierung; für Bestandsprofile ändert sich nur die **Anzeige**.
- **Production-Profilpfad und Ausschussstand (03.09., rein lesend; §34.13.6a/.6b):** Production verwendet nachweislich die **relationalen Profile aus `mandate_profiles`**. Die Menge der jeweils ersten Ausschüsse der fünf relational aktiven Profile ist exakt `{Arbeit und Soziales, Finanzen, Gesundheit, Haushalt}`; die am 03.09. in `source_crawl_telemetry` ausgeführten profilbezogenen Ausschussradare tragen exakt dieselbe Menge. Die fünf ersten Blob-Ausschüsse bilden eine abweichende Menge und wurden nicht ausgeführt. Historische Kontrollgruppe: eine Blob-Deaktivierung vom 04.08. blieb rund 30 Stunden wirkungslos; erst die relationale Deaktivierung vom 06.08. beendete das Radar dauerhaft. Der rohe Wert von `HELMUT_PROFILE_DB_MODE` bleibt unbestätigt, die Wirkung ist damit trotzdem eindeutig belegt.
- **Production-wirksame Profilabweichung, NICHT durch #297 verursacht:** Genau eines der fünf aktiven realen Profile trägt relational eine Ausschussangabe, deren Zuschnitt zur 21. WP aufgeteilt wurde; die übrigen Angaben sind auflösbar, alle Stellvertretungsfelder leer. `mergeProfileLists` ersetzt bei gleicher Kennung das vollständige Blob-Profil durch das relationale Profil; SQL gewinnt. Der Resolver liefert schon am Basisstand `a839c1b` dasselbe Ergebnis, `server.js` ist nicht im Diff. Keine Deaktivierung, keine Blockade der normalen Verarbeitung, keine Datenänderung. Die Admin-Ansicht zeigt das Profil als nicht vollständig bereit; eine Neuaktivierung über den CLI-Pfad würde abgewiesen, der Admin-Schreibpfad behandelt die Reife nur als Warnung.
- **Die frühere Klärempfehlung ist zurückgezogen:** `scripts/profil-bereitschaft.js --production` entscheidet den Lesepfad anhand des lokalen `process.env`. Ohne gesetztes `HELMUT_PROFILE_DB_MODE` liest es den Blob und kann fälschlich fünf bereite Profile melden. Außerdem kann `readSupabaseStore` bei fehlender Blob-Zeile einen Default-Store anlegen; der Pfad ist strukturell nicht garantiert rein lesend. Die Korrektur vom 04.08. wurde im Blob vorgenommen, aber nicht in die relationalen Profile übertragen. Vor der ersten Aktivierung synthetischer Profile: amtlichen Ausschussstand belegen, relationale Profilkorrektur separat freigeben und danach rein lesend bestätigen. **In diesem PR keine Profilkorrektur und keine Production-Datenänderung.** Die Abweichung blockiert den Merge technisch nicht, wohl aber die erste Kohortenaktivierung.
- **Lastfolge (§34.13.4, drei Aussagen berichtigt):** 42 der 495 Profile (A2/B6/C34) erhalten über „Arbeit und Soziales" **ein** Sachpaket zusätzlich; kohortenweit **54 → 138 `source_fetch` je 8-h-Fenster**, also **+252/Tag** — **nicht** einmalig. Mandatsgebundene Klassen (je 495) unverändert, Kapazitätsmodell (SR §30.7) unberührt; der Folgeschritt über `document_understanding` **unbeziffert**. **Zweite Auswertestelle:** `scheduler.mandateNewsSources` Nr. 4 baut die Suchanfrage aus `committees[0]` — heute inert, mit `HELMUT_TESTKOHORTE_QUELLEN=aktiv` **1.802** statt 138. **Der Schalter bleibt für den ganzen Test AUS.**
- **Gefunden, NICHT repariert (§34.13.7):** `seeds/entities.js` führt eine **zweite** kuratierte Ausschussliste (23) für den Radar-Ausschussbeleg — **21 von 24** WP-21-Namen haben dort einen Eintrag, **3** sind veraltete WP-20-Bezeichnungen. Stille Radarlücke für **reale** Mandate; für die Kohorte keine Verschlechterung (vorher 0 von 24). Korrektur ändert Production-Klassifikation → eigener PR.
- **Tests:** Offline-Gesamtlauf **318/318**, Browser-/Mobile-Smoke **32/0**, fünf neue/erweiterte Suiten **346/0** (Einzelzahlen SR §34). Fünf Reviewrunden, alle Feststellungen behoben oder begründet offen.
- **Production-Wirkung des Merges:** Der Code aus PR #297 ist deployt. Es erfolgte dadurch keine Provisionierung, Aktivierung, Profiländerung, Umgebungsvariable, Migration, Cron-, Azure-, Budget- oder Reserveänderung, kein Modellaufruf und keine Nachricht. Die Kohortenlogik bleibt bei 0 synthetischen Production-Profilen inert; wirksam sind die allgemeinen Schutzkorrekturen und die verschärfte Reifeanzeige.
