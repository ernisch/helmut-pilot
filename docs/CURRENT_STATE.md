# CURRENT STATE — Helmut

**Stand: 2026-09-03 — PR #296 gemergt und deployt (`a839c1b`, Vercel „Deployment has completed", beide Pflichtprüfungen grün). Das Startfenster-Tor prüft Fälligkeit, der Startweg ist bedienbar (§25). Korrektursprint 03.09. (**PR offen, nicht gemergt**, §26): der Betreiberweg der Provisionierung ignorierte `--stufe` und zielte auf alle 495 — jetzt stufenweise, Ablaufplan umgebaut. **Neuer Blocker:** die Bundestagsreife-Sperre weist 18 von 20 Stufe-A-Profilen ab. Der 500er-Funktionstest ist **nicht startbereit**.** Vollfassungen: [`archive/project_state/`](archive/project_state/). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen, testgesichert). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet**; Modus weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgenlauf 5/5 und Lagelauf effektiv 5/5, R4-/Watchdog-Nachweis grün, keine Doppelarbeit, keine verlorenen Aufträge, 0 Lease-/Fencing-Probleme, alle elf §28.6-Kontrollen erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§20).** **Der Selbstweck ist lokal Ende-zu-Ende belegt, in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main`-Kopf und letzter fachlich wirksamer Production-Code: `a839c1b19f55246bfe747efbfcfa2269f5e28842`** (Merge von #296, 03.09. 05:08:15 UTC; Eltern `9079ac3` + `ba09633`). Vercel meldet für exakt diesen Commit **„Deployment has completed"** ([Nachweis](https://vercel.com/nohut/helmut-pilot/CCbSsp58pxGNMqjuGQziVZYknaHd)); interne Deployment-Details und `dpl_`-Kennung **nicht zusätzlich bestätigt**. Beide Pflicht-Checks grün (Lauf 33717626724, rein lesend bestätigt). Davor `9079ac3` (#295), `881739da` (#294), `9d6d18e5` (#292), `98cfedc1` (#290).
- **Gemergt:** #273, #274, #279, #280, #281, #283–#290, #292–#295, **#296**; davor #271, #270, #265, #262, #261, #260/#259/#256/#257, #225, #216. #275–#277 und #282 nach Konsolidierung **geschlossen, nicht gemergt** (Branches bleiben Auditbelege).
- **Vor Beginn des Sprints 03.09. gab es keine offenen Pull Requests.** **Offen (NICHT gemergt):** der Korrektur-PR des Sprints 03.09. auf `claude/stufenweise-provisionierung-fix-rg6sij`, Basis `a839c1b` (§26). Sonst keine offenen PRs.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und Restore seit 28.07. geübt; RPO ≤ 24 h.
- **Mandate (zwei Zählungen, nicht dasselbe — 02.09. rein lesend bestätigt):** **9 Mandatsprofile**, davon **5 aktiv** (`m5-9aee228dbf2c9f13`) und 4 deaktivierte Demo-Mandate (OP-04-Rest), 0 Löschmarken. Daneben **10 Identitätsprofile**, **0** davon aus der Kohorte. **0 synthetische Zeilen** jeder Familie. Nur die 5 aktiven erzeugen Last. Der Merge von #296 hat daran nichts verändert (Betreiberangabe 03.09.).
- **Crawl-Lauf-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Mindestbedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT).
- **Crons (Production, 13):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 UTC · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` ist nicht in Production.** Dazu der Actions-Watchdog (`briefing-watchdog.yml`, 05:30 UTC, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (02.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§18) — **nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`) und `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze); gemessen **0,002941 USD je Aufruf** (Listenpreis, Kontopreis unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, obere Schranke 243 (§23). ([`betrieb/kostenmessung.md`](betrieb/kostenmessung.md))
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase und Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar** — Env-Aussagen sind nur **Betreiberangabe**. Flag-Zustände nur wirkungsbasiert prüfbar; jede Flag-/Env-Änderung ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8). Parlamentsdomains per Egress-Proxy gesperrt — bytegenaue Quellenprüfung über den freigegebenen Actions-Weg.

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget: Deckel **100**, davon **30** für Verstehen reserviert (Reserve liegt **im** Deckel ⇒ höchstens 70 nicht priorisiert, **nie 130**) | fail-closed im Code. **100/30 dokumentiert, nicht live verifiziert** (Vercel-Env nicht lesbar). Fehlt die Variable, greift Schutzlimit **50**. Tragfähigkeit 25 offen; **ab 50 reicht 100 nicht** (§6.3) |
| `HELMUT_VERSTEHEN_CAS=on` | seit 2026-08-17; `HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt ⇒ wirkt als 1 |
| `HELMUT_SCALABLE_PIPELINE=on` | **seit 23.08. 16:47 UTC**, Modus `shadow`, Worker 4/25/25; Rückweg: Flag löschen + Redeploy (Betreiber) |
| `HELMUT_CRON_GLOBALABRUF=on` | seit 2026-08-06 (Betreiber); Fortbestand ist Betreiberentscheidung |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **Berlin (Landesmodul)** | inaktiv; `HELMUT_LANDESMODULE=berlin` gesetzt, aber wirkungslos (0 berechtigte Mandate); Wirkung **unbewiesen** ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md)) |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt) |
| M8 / `HELMUT_MATCHING_RELEVANZ_GATE` | aus (nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, nicht aktiviert (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03). **Für den 500er-Test ausdrücklich NICHT einschalten** (§24) |
| `HELMUT_TESTLAUF_*` (Vorrang real, Kommunikation, RPM/TPM, Kostenbudget, Parallelität) | **nicht gesetzt**; Werte vorbereitet (§24, [`betrieb/env-inventar.md`](betrieb/env-inventar.md) §3a). **Erst vor der Aktivierung der Stufe A Pflicht, nicht vor der inaktiven Provisionierung** (§26) |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | nicht gesetzt; ohne beide Riegel fällt jeder Kohortenschritt auf den Trockenlauf |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` liegt als Datei vor, **nicht angewendet** |
| `HELMUT_PROFILE_DB_MODE` | Wirkung AN (laufzeitbelegt); Wert unbestätigt |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile sind ein **lokales, deaktiviertes Importpaket** (`aktiv: false`, kein Import in Production). Voraussetzungen:

1. **Siebentägiger Nachweis des Warteschlangenbetriebs mit fünf Mandaten** — nicht begonnen. Verbindlich: [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) §14 **Stufe 2** (Abfluss ≥ Ankunft über 7 Tage, 0 Verlust, Wartezeit < 24 h); Umschaltung braucht **fünf** Umgebungswerte.
2. **Regionale Quellen BE/BB**: beide Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: 100/30 dokumentiert, nicht live verifiziert; Semantik und Schutzlimit 50 siehe §4. **Für 25 Mandate ist die Tragfähigkeit offen** (Linie A 88–265, Linie B 113–336); **ab 50 reicht 100 in beiden Modelllinien nicht.** Seit 01.09. **gemessen**: p95-Tagesbedarf **170** bei 5 Mandaten, Deckelvorschlag 500 = **2.416** (§23). ([`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2c.)
4. **Tägliche Lagekapazität**: Altpfad 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 offen (Stufe 2 inkl. OP-25-Wiederholung).
5. **20 zusätzliche Profile**: amtlich bestätigt (Actions-Läufe 24.08., Strenge-Stufe 2; **maßgeblich ist der letzte Verifikationslauf am PR**); Import/Aktivierung freigabepflichtig. **Berliner Wahl 20.09.2026**: die zehn Berliner Profile gelten nur für die 19. WP — danach erneute Prüfung; Terminrisiko für den 25er-Nachweis.
6. **Ereignis-Antrieb:** **AWS ist dafür nicht technisch notwendig** (Korrektur 24.08.). Den Fünfernachweis trägt der **Selbstweck** — gebaut, verriegelt, lokal belegt, **in Production nie ausgeführt** (Runbook §31). AWS bleibt Transport für **große** Mandatszahlen und eine getrennte, kostenpflichtige Entscheidung.

Entscheidungsgrundlage: [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR — Kostenentscheidung.
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mailbetrieb.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. Migration `20260720`).
4. **OP-04-Rest:** Umgang mit deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderungen bleiben Betreiberaktionen.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Production-Beweis der Härtung steht aus.
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6. Belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf ([`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2a).
8a. **500er-Funktionstest: NICHT startbereit, nicht freigegeben.** Neu (§26): (1) der Betreiberweg der Provisionierung ist korrigiert, der Korrektur-PR ist **offen** — die Provisionierung der Stufe A darf erst nach Merge **und** Production-Prüfung empfohlen werden; (2) **Bundestagsreife-Blocker:** die Kohorte trägt synthetische „Testausschuss"-Namen, die Reife-Sperre verlangt WP-21-Ausschüsse — 18 von 20 Stufe-A-Profilen (433 von 495) würden abgewiesen; Entscheidung nötig (Beleg §34.7); (3) vor der Provisionierung zuerst eine **aktuelle Grundlinie** und die vorgeschriebene **Sicherung der betroffenen Tabellen**; (4) die **acht Betreiberwerte** erst zwingend vor der **Aktivierung** der Stufe A. Weiterhin offen: Zahl offener Aufträge (erst nach Provisionierung und Planung messbar), Laufzeit der KI-freien Klassen, Azure-Gesamtkontingent, Verdrängungsschutz unter Last, Mehrtagesbetrieb.
9. **Zwei Testzeilen in Production — ERLEDIGT (25.08.).** Beide entfernt, **`endgueltig_fehler = 0`**, keine fremde Zeile verändert (Runbook §31.10).
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).

K2/K3 und OP-25 sind abgeschlossen (OP-25 laut Betreiberfeststellung vom 24.08.). Nach einer weiteren OP-30-Stufenaktivierung muss OP-25 vollständig wiederholt werden.

## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04) | 29B; relationale Profilzeilen veraltete Schnappschüsse (F-P6) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörung | 7/14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | Logverlust (Ursache belegt), Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching | 23B-2 (Briefing-Historisierung) |
| Punkt 26/27 (E2E BE/BB) | 26B blockiert (Punkt 14), 27B (Punkt 15); 27A-2 offen |
| Punkt 29 Fehlervertrag | 29B offen |
| Mail (#204/#205) | Mailpit-Lauf; Aktivierung freigabepflichtig |
| Kalender-Machbarkeit (#209) | zuerst die Rechtsfrage ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md)) |
| Berlin-Reife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline |
| Quellen-Seed-Einspielung | nur noch Betreiberfreigabe |
| OP-06 Aussortieren (34 Fälle) | Freigabe und Fachfrage |
| Gesundheitsbot-Folgepunkt | Watchdog-Vorprüfung findet keine Altquittungen |
| **Stufenweise Provisionierung (§26)** | Merge und Production-Prüfung des Korrektur-PR; Entscheidung zum Bundestagsreife-Blocker |

## 9 · Ausstehende Production-Nachweise

- **OP-25**: drittes Fenster BESTANDEN (07./08.08.), gilt nur für 5 Mandate — nach Stufenaktivierung vollständige Wiederholung; OP-14 offen. **OP-31**: BESTANDEN (11.08.), Kopfstatus/UI nicht live abgerufen.
- **F-E2E — Ursache belegt, korrigiert, seit #290 deployt (§21):** `created_at` friert beim Erstauftritt ein; `listMatchingResults` sortiert jetzt **rank-primär**. Regression 15/0; PR #224 überholt. Offen: natürlicher Production-Nachweis.
- **29B** — wartet auf natürliche Fehlerzustände (künstliche Fehler verboten).
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen.
- **Selbstweck:** **bleibt deaktiviert**, in Production nie ausgeführt. Offen: (a) Preview-Beleg zum 3-s-Abbruch — **blockiert** ohne belegte Datenisolierung (Zielarchitektur §27.3.1), (b) 7-Tage-Fenster, (c) Vercel-Kosten. Der Ereignis-Antrieb ist **nicht aktivierungsbereit**.

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung 2026-08-05).

- **F-1** Tenant-JWT/RLS: dauerhaft stillgelegt; Trennung App-seitig. **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: in Production gescheitert; `understanding-recovery.yml` **nie ausführen** (`CLAUDE.md` §5).
- **F-4** „Quellenbasis zu dünn": Fehlbefund. **F-5** Feste Referenzzahl „145 Quellen": verworfen; gültig ist `Telemetriezeilen = distinct source_id` (B3). **OP-25 Anlauf 1 + Fenster 1/2**: gescheitert (E3); Fenster-Untergrenze 2026-08-04 bleibt verbindlich.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen). Auch eine leere Tabelle beweist nichts — `llm_usage` war leer, die Nutzung stand im Blob (§23, K4). **Neu (§26):** ein scharfer Pfad, der nur mit einer Attrappe getestet wurde, ist nicht bewiesen — der Bundestagsreife-Blocker blieb dadurch bis 03.09. unsichtbar.

## 11 · Nächster empfohlener Schritt

1. **Korrektur-PR (§26) prüfen und mergen** (Betreiberentscheidung), danach rein lesend die Production-Wirkung belegen und diesen Status nachziehen (`CLAUDE.md` §9).
2. **Entscheidung zum Bundestagsreife-Blocker** (Beleg §34.7): Kohorte auf WP-21-Ausschüsse umstellen (Empfehlung, Kennungen bleiben unverändert) oder anders — **vor jeder Provisionierung**. Ohne Entscheidung endet ein scharfer Lauf der Stufe A mit 18/20 abgewiesen.
3. **Erst danach die Kette der Stufe A:** aktuelle Grundlinie → Sicherung der betroffenen Tabellen → Fenster → `provisionierung --stufe=a` (inaktiv, eigene Freigabe) → `isolation --stufe=a` → **acht Betreiberwerte setzen und wirksam prüfen** → Aktivierung A (eigene Freigabe) → Fachzyklus A → Kontrolle A. Stufe B und C jeweils getrennt, erst nach kontrollierter Vorstufe. Maschinenlesbar: `node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan`.
4. **Fenster:** nach Fälligkeit trägt allein **21:36–03:59 UTC** die volle Kohorte (§25); Planung **vor 00:00 UTC**. Die Zahl offener Aufträge ist erst nach Provisionierung und Planung messbar (`erhebungsSql()`, Beleg §30.8).
5. **Gründerentscheidung zur Skalierung** (Entscheidungsvorlage, §6): KI-Deckel, AWS-Frage, Reihenfolge 10 → 25.
6. **Selbstweck-Vorlauf entscheiden:** fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach der **siebentägige Nachweis** mit 5 Mandaten. Davor empfohlen: kleinster Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
7. **Rückkehr zu den P0-Verkaufsblockern OP-01…OP-04.** **Betreiberprüfung Doppelkanal** (OP-07, §7 Punkt 10) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. In Production offen: `20260720`, F9 (`20260825101500`), `20260902121500`; Z22 seit 29.08. angewendet, **nicht erneut anwenden** (§18).
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 neuen Profile ohne gesonderte Freigabe importieren oder aktivieren**; **keine Kohortenprovisionierung ohne die Einzelfreigabe der Stufe.**
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-30 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-30 Aktivierungs-Runbook | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| Skalierung 25/50/100 · KI-Bedarf je Mandatszahl | [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) · [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) |
| Kapazität Morgenlage · Profil-Importvertrag | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) · [`betrieb/op30-profilvertrag-200-mandate.md`](betrieb/op30-profilvertrag-200-mandate.md) |
| Entscheidungsvorlage Skalierung 10/25 | [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md) |
| OP-25 Ursachen und Nachweisvertrag | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7 |
| Cron-Fairness, F-CAS, F-POS | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Berlin-Aktivierung/-Rollback · Seed-Einspielung (blockiert) | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) · [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore · Env-/Secret-Inventar | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) · [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| OP-31 Frischevertrag · OP-30 CAS Verstehensvertrag | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) · [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md) |
| Paket-Inventur Production · Watchdog-Korrektur 26.08. | [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) · [`betrieb/watchdog-korrektur-2026-08-26.md`](betrieb/watchdog-korrektur-2026-08-26.md) |
| **500er-Funktionstest: Rahmen, Runbook, Ablauf, Azure, Fälligkeitstor, Korrektursprint 03.09. (§34)** | [`betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md`](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) |
| Production-Beweise | [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) |
| Vollstände vor den Verdichtungen | [`archive/project_state/`](archive/project_state/) (Index: [`archive/README.md`](archive/README.md)) |

## 14–22 · Sprints 24.08.–01.09. (Kurzform; Vollfassung im Archiv `2026_09_01c`)

- **§20 Kapazität Understanding — BLOCKIERT**, Gate-Flip und PR-B bleiben gestoppt ([`betrieb/understanding-kapazitaet-2026-08-31.md`](betrieb/understanding-kapazitaet-2026-08-31.md)): belegt sind Verhungern und wachsender Rückstand (31.08.: 9.080 pending; Ankunft Ø 307/Tag, Abfluss Ø 68/Tag). Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06 (1.769 Altfälle), Siebentagenachweis.
- **§21 500-Mandate-Reife** — *erfolgreich, Freigabe 01.09.* (#290). **Drei getrennte Urteile, unverändert gültig:** Aufnahmefähigkeit 500 **erbracht** · rechnerisch **vorbereitet, Dimensionierung offen** · Mehrtagesbetrieb **NICHT BEWIESEN**. Minimal-Cron `18,48` vorbereitet, **nicht aktiviert**; Kohorte 495 gegen `validateSpec` validiert — **nicht** gegen die Bundestagsreife-Sperre (§26).
- **§14** (#269): `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung; 3-s-Abbruch ungeprüft; seither jeder Testlauf über `scripts/lokal.js`. **§15** (#270): Anlage-Stapel legt nur **inaktiv** an, kein Index nötig; zuerst reißt die 500-MB-Free-Grenze. **§16 Watchdog** (#271): `partial` heißt nie „Slot fehlt"; nur 1/5 mit Push-Empfänger. **§17 Z3a** (#272): 92/92 — **nicht** die echten Anbieter.
- **§18 Z22** (29.08.): `helmut_jobs_offen` zählte mandatsblind; Buchungen `20260829175642`/`20260829175749` — **nicht erneut anwenden.** **§19** (#283): `lauf-bilanz.js` als **eine** kanonische Statusableitung; offen drei `unbekannt`-Vorgänge. **§22**: #275–#277 und #282 **geschlossen, nicht gemergt**.

## 23 · Sprints 01./02.09. — Sicherheitsrahmen, Azure-Messungen, Endpunktguard (**gemergt als #294**)

*Erfolgreich abgeschlossen; Freigabe 02.09., Deployment READY auf `881739da`.* Vollbeleg: [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) §1–§17.

- **Gebaut:** fail-closed **Kommunikationsriegel** vor allen sieben Außenkanälen · Kohortenwerkzeuge mit Erlaubnisliste · Kapazitäts-/Kostenriegel · Azure-**Endpunktguard** · Geheimnisredaktion. **Azure-Messungen**: 24/24 Aufrufe, **0,040841 USD**, 0 Fehler.
- **Maßgebliche Telemetriequelle korrigiert:** `helmut_store.data.llmUsage` (Ring 5.000), nicht die leere Tabelle `llm_usage`. Fenster 02.07.–01.09.: 3.673 Erfolge · **19 Azure-Fehler (0,51 %)**. **Tagesbedarf:** p95 **170** / max 298 (UNTERGRENZE).
- **Azure-Deploymentkontingent** (02.09.): 250.000 TPM / 250 RPM, `gpt-5-mini`, Sweden Central. **Gesamtkontingent des Kontos bleibt unbelegt.**

## 24 · Sprint 02.09. — Vorbereitungssprint 500er-Funktionstest (**gemergt als #295**)

*Erfolgreich abgeschlossen; Freigabe 02.09., Merge `9079ac3`, Deployment READY.* Vollbeleg: [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) **§18–§21**. Der Merge machte Schutzregeln, Ausführer und beide Blocker-Hürden wirksam — er machte den Test **nicht** startbereit.

- **Kernbefund:** „synthetisch" existierte außerhalb des Kommunikationsriegels **nicht**; die fünf realen Mandate waren an **vier** Stellen verdrängbar. Gebaut: `mandatsklasse.js` und vier Schutzregeln; Vorwärtsweg, Fachzyklus-Startweg, echte Auswerter (drei Kanäle **nicht messbar**), Stufenkontrolle, Rückbau-Ausführer. **Bei 0 synthetischen Zeilen byte-identisch.** `recordLlmUsage` relational als Dual-Write, Flag **AUS**, Migration `20260902121500` **nicht angewendet**.
- **Vier Reviews, 35 Befunde, 33 geschlossen** — der schwerste: die Vorrangreserve hätte bei Deckel 100 gegen Vorrang 200 den Datenmotor **auch der fünf realen Mandate** stillgestellt.
- **Acht vorbereitete Betreiberwerte (NICHTS gesetzt):** Deckel **2.416** · Reserve **702** · Vorrang real **200** · RPM **82** · TPM **250000** · Kosten **10,00 USD/Tag** · Parallelität **1** · Kommunikation `gesperrt`. Deckel **vor** Reserve. **`HELMUT_TENANT_LLM_CAP` nicht einschalten.**

## 25 · Sprints 02./03.09. — Nachbereitung nach #295 (**gemergt als #296**)

*Erfolgreich abgeschlossen; Merge 03.09. 05:08:15 UTC auf `a839c1b`, Vercel „Deployment has completed", beide Pflichtprüfungen grün.* Vollbeleg: [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) **§22–§33**; Nach-Merge-Beleg **§34.1**.

- **Das Startfenster-Tor prüft FÄLLIGKEIT (§30):** maßgeblich ist `due_at <= jetzt`. `funktionstest-faelligkeit.js` ruft die echte `planeMandatsarbeit` mit den Eingaben von Production auf, fail closed. Gemessen (03.09.): Nachtfenster **21:36–03:59 UTC** (Türkei 00:36–06:59, Berlin 23:36–05:59) trägt **100 %** aller drei Stufen, unabhängig vom Rotationsrang; Tagesfenster 11:36–15:59 **0 %**; Abendfenster 55–60 %. **Mitternacht:** Planung **vor 00:00 UTC** ist harte Startbedingung (§30.5). Kapazitätstor bei Parallelität 1: **2.522 ≥ 1.812** (§30.7).
- **Kreisschluss aufgelöst (§32/§33):** das Tor war falsch-negativ (ein erledigter Zyklus galt als gescheitert). Jetzt **sieben Statusmengen**, **zwei getrennte Urteile** (Fachzyklus · Lastbeweis); `startbereit` für alle drei Stufen erreichbar (A/B ab 143 min, C ab 276 min). **Kein neuer schreibender Planungscode** — der Bestandscron plant, sobald die Stufe aktiv ist; um 20:00 UTC läuft `/api/cron/crawl`, nicht die Pipeline.
- **Vier Blocker geschlossen:** zwei sich ausschließende Freigabeworte · das CLI konnte `startbereit` nie erreichen (jetzt belegt `true`) · das Deaktivierungswort für 20 hätte 495 freigegeben · die Teardown-Korrektur wirkte in Production nicht. Messintegrität: `frischefenster`/`stufe` Pflicht, `mindestAbdeckung` ≥ 0,5, `--startbereit=ja` entfernt, Kapazitätshürde 25/100/500.
- **Unverändert wahr:** drei von vier Schutzgrenzen sind nicht hart (RPM/TPM liest kein Ausführungspfad, §23.4); `HELMUT_TESTLAUF_VORRANG_REAL` ungesetzt ⇒ Verdrängungsschutz **nicht wirksam** (§25.2); Ring 5.000 trägt einen Testtag je Stufe (§27); Lastbeweis in keiner Stufe erbracht.

## 26 · Sprint 03.09. — Korrektur der stufenweisen Provisionierung (**PR offen, nicht gemergt**)

*Teilweise abgeschlossen — offline bewiesen, Merge und Production-Prüfung ausstehend.* Branch `claude/stufenweise-provisionierung-fix-rg6sij`, Basis `a839c1b`. Vollbeleg: [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) **§34**.

- **Befund (reproduziert):** `testkohorte-vorwaerts.js provisionierung --stufe=a` ignorierte die Stufe still — zielGroesse **495**, Pauschalwort `TESTKOHORTE_495_ANLEGEN_BESTAETIGT`, Exit 0. Die Bibliothek war seit 02.09. stufenfähig; der Betreiberweg reichte es nicht durch.
- **Korrektur:** `--stufe=a|b|c` ist Pflicht; fehlend/leer/unbekannt → **Exit 2 vor jedem Zugriff, kein Rückfall auf 495**; unbekannte Angaben brechen ab; `--ids=` nur innerhalb derselben Stufe. Gemessen: **a → 20 / b → 75 / c → 400** mit stufengenauem Wort. Bibliothek unverändert (ohne `stufe` weiter 495).
- **Ablaufplan stufenweise (28 Schritte, kein Sammelschritt):** Betreiberentscheidung zur Reifesperre → je Stufe Anlage (inaktiv) → Isolation (`isolation --stufe=`) → Aktivierung → Fachzyklus → Kontrolle; jeder Schritt der Stufe B erst nach kontrollierter A, C nach B. **Die acht Betreiberwerte sind Vorbedingung jeder Aktivierung und keiner Provisionierung** — gesetzt, wirksam und geprüft, bevor das erste synthetische Profil aktiviert wird (§34.5); rein lesend belegbar ist davon heute nur der Deckel, der Rest bleibt Betreiberangabe. Rückweg nie gesperrt, Rückbau-Beleg stufenbewusst (`rueckbau --stufe=`).
- **Verhaltensbelegt:** die inaktive Provisionierung (echter `provisionTenant`) erzeugt **0** Netzaufrufe, **0** Riegelanfragen, **0** KI-Aufrufe, Außenkanalmodule nicht geladen; der echte Planer plant für 20 inaktive Profile **0** Aufträge (Gegenprobe: 1 aktives → 2). **Dabei geschlossen:** die Verstehens-Interessenprüfung (`lazyUnderstanding`) zählte inaktive Profile mit — jetzt Planer-Prädikat `isDisabled` (Flag in Production nicht gesetzt, also heute inert). Die Anlage selbst schreibt je Kennung Konto (Auth-Blob, Last-Write-Wins) und Profil.
- **NEUER BLOCKER (§34.7):** die Bundestagsreife-Sperre weist **18 von 20** Stufe-A-Profilen ab (`bundestagsprofil-nicht-bereit`: „Testausschuss" nicht in der WP-21-Sollmenge). Alle früheren Suiten prüften den scharfen Pfad mit einer Attrappe. Zustand nach einem solchen Lauf ist sicher (Abweisung vor jedem Schreibvorgang), aber der Lauf endet `ok: false`. **Entscheidung nötig** (Empfehlung: Kohorte auf Sollmengen-Ausschüsse; Kennungen bleiben); im Plan als Vorbedingung `kohortenreife` verankert.
- **Review:** vier Linsen, zwei Widerleger je Feststellung — 18 bestätigte Befunde geschlossen (§34.12).
- **Tests:** neu `testkohorte-vorwaerts-cli-test.js` **55/0** (echte Kindprozesse, Schreibspion) und `testkohorte-provisionierung-inaktiv-test.js` **44/0**; `funktionstest-ablaufplan-test.js` **81/0**; Offline-Gesamtlauf und Pflichtprüfungen: siehe PR-Text (§34.10).
- **Keine Production-Wirkung:** keine Provisionierung, Aktivierung, Umgebungsvariable, Migration, Cron-, Azure-, Budget- oder Reserveänderung, kein Modellaufruf, keine externe Nachricht. `docs/ARCHITECTURE.md` und `CLAUDE.md` unverändert (keine Architektur-, keine neue Projektregel).
