# CURRENT STATE — Helmut

**Stand: 07.09.2026, Korrekturen #330 in Production geprüft. TEILWEISE ABGESCHLOSSEN.** Merge `2ca0e62b`, READY um 11:50 UTC. Absatzlinks, Artikelregel, Vorrang und Watchdogstatus korrigiert; ein unzuverlässiger Test repariert. Lokal und extern **337/337 Suiten**, Browser **40/40**, Datenbank **10/10 und 48/48**, Sicherheitsmutationen **8/8** erkannt. Nachkontrolle 11:51 UTC **29/25/4**, Profile und Konten unverändert; 86 Reservierungen, **0,22847 USD** geschätzt. **A Abnahme und 500er Betrieb offen:** 25 heutige Caches, null mit neuer Quellenbindung. Fortsetzungen koordiniert; [SR §58.5](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).


**Kernlage:** Warteschlangenmotor seit 23.08. in Production `on`, Dispatch `shadow` (Cron-Antrieb, kein AWS). Fünferbeleg mit 376 Abschlüssen: [OP-30 §30.7](betrieb/op30-aktivierung-5-mandate.md). **Aktuell vier historische Vorgänge `unbekannt`, jüngste Änderung 02.09., 11:33 UTC; keine neue unbekannte Reservierung nach Wiederanlauf.** Selbstweck in Production nie ausgeführt.

## 1 · Aktive Produktphase

**Kontrollierter Funktionsnachweis bis exakt 500 aktiven Testprofilen.** Die neuere Betreiberanweisung ersetzt die bisherige Zwischenabnahme bei 100: erst den bestehenden Test abschließen, danach direkt auf 500 ausbauen und dort abnehmen. Der neue ausdrückliche Zielweg `--ziel=500` ergänzt den vorhandenen Ausführer; keine vorgetäuschte B Abnahme. Vorrang haben Datenintegrität, Kommunikationssperre und höchstens 10 USD Modellkosten je UTC Tag mit Stopp bei prognostiziert 9 USD. Danach Verkaufsreife und P0 Punkte OP-01 bis OP-04; [OP Liste](datenmotor-restliste.md). Kein Kunden- oder Mehrtagesnachweis.

## 2 · Stand auf `main` und Pull Requests

- **Aktueller Codekopf #330:** `2ca0e62b14aa0ef5928dc63969c655df620db1fa`, Production `dpl_5ZRdoym5m5U1R7iBerEE2fbBBrWV` READY am exakten Merge. PR CI `34117430546` mit beiden Pflichtjobs grün; 337/337 Suiten, Browser 40/40, echte Datenbankprüfungen 10/10 und 48/48. Zwei Merge Eltern und identischer geprüfter Baum bestätigt; SR §58.5. Ausführer aus #326/#328 wird weiterverwendet.
- **A Ausführer #322/#323:** deployt und geprüft; Einzelbelege SR §54/§55. Workflow `34066395564` scheiterte vor dem Production Aufruf; kein Wiederholungslauf.
- **Übernommen (§57):** Quellenbindung, begrenzte Briefingprüfung und manueller Testabschluss für höchstens 495 Profile. Fortsetzung für das kommende Nachtfenster eingerichtet; konkreter Abschalttermin erst vor tatsächlicher Aktivierung festzulegen. Keine neue Production Facharbeit gestartet.
- Frühere Schutzarbeiten **#303, #305, #307, #309, #310, #313, #316 und #318** sind deployt. Sie schützen Kontext, Leseantworten, Konten, gemeinsam genutzte Speicher und Appstart. Belege und Grenzen: SR §40–§51; Lage 25/25 seit §53.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Pro/Micro (`t4g.micro`, 1 GB)**, `ACTIVE_HEALTHY`; SQL bis **07.09., 00:32 UTC** wiederholt erfolgreich. Frisches Dashboard **00:19 UTC: RAM 43 %, CPU 2 %, 5/60 Verbindungen**. Neustart 06.09. 18:35:07, Sicherung 18:38:15 UTC, **PITR aus**. Speicherengpass als Ursache plausibel, nicht abschließend bewiesen; keine Ressourcenänderung durch diese Sitzung.
- **Bestand 07.09., 11:51 UTC, nach #330:** **29 gesamt, 25 aktiv, vier inaktiv, null gelöscht**, 30 Identitäten und 25 Konten. Vollständige Zeilen und Konten gegenüber 10:40 unverändert; Zähler 86. A20 aktiv, B/C unangelegt. A Fenster 06.09. mit 60/60 erledigten Aufträgen belegt. 25 heutige Lagecaches, null mit neuer Quellenbindung; keine fachliche A Abnahme. Natürlicher Rückstandslauf 11:30: 20 verarbeitet, null endgültige Fehler; SR §58.5.
- **Crawl-Aufbewahrung:** Wirksame Grenze **36** am 06.09. um 19:00 UTC erneut bestätigt. Frisch gelesener Blob Ring **20**; keine Wiederherstellung der verlorenen 16 Laufzeilen. Schutzcode aus #301 bleibt deployt (SR §37).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` nicht in Production.** Dazu Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (05.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten 07.09., 11:51 UTC:** 86 Reservierungen und 86 protokollierte Einträge, null unbekannte Kostenzeilen, **0,22847 USD geschätzt**. Mit 2 USD Reserve aktuell 2,22847 USD Prognose, unter Stopp 9 USD. Kein Rechnungsbeleg und keine atomare USD Grenze. In dieser Korrekturarbeit kein kostenpflichtiger Production Lauf gestartet. Frühere Tagesbelege in SR §57; [`kostenmessung`](betrieb/kostenmessung.md).
- **Zugang:** Azure und Foundry geschützt per Microsoft E Mail erreicht, keine Zugangsdaten offengelegt. Rein lesend: `gpt-5-mini` Global Standard **250.000/2.000.000 TPM**, Zuordnung 250.000 TPM, bekannte Grenze 250 RPM. Keine Azure Änderung. Production Leser **34058091793** bleibt gültig (§54).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM Tagesbudget | **Deckel 2416 / Understanding Reserve 702 / Vorrangreserve 200**, Production am **07.09., 00:30 UTC** gelesen. Am 07.09., 11:51 UTC: Zähler 86, 86 Kostenbelege, 0,22847 USD geschätzt. **Aktueller Beleg über 100 fehlt.** Maximal 10 USD, Prognosestopp 9 USD; kein Rechnungsbeleg oder atomarer USD Riegel. |
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
| `HELMUT_TESTLAUF_*` | **Kommunikation am 07.09., 00:30 UTC gesperrt**, Quellenriegel ebenfalls bestätigt; seit 06.09. 23:50 UTC keine neuen Push Ereignisse oder Outbox Versandquittungen. RPM, TPM, USD und Parallelität haben keinen Laufzeitleser. Historische Zustellungen werden dadurch nicht zu null. |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | **im aktuellen Prozess nicht gesetzt**. Freigaben gelten ausschließlich pro vorgesehenem scharfen Schritt mit dessen Bestätigung; Vercel nicht ändern. `_QUELLEN` bleibt AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad und Exklusivmodus am 06.09. um 07:59 UTC wirksam belegt.** Frühere Annahme `HELMUT_PROFILE_DB_EXCLUSIVE` sei aus ist damit überholt. Keine Env Änderung durch diese Sitzung; vor B/C den ausführenden Prozess an den tatsächlichen Speicherpfad binden und Bestand neu erheben. |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |
| **20 Profile der Stufe A** (`test-kohorte-a-001…020`) | 04.09. angelegt, **05.09. 11:38 UTC mit Freigabe aktiviert** (§30): 20/20 `aktiv`, Konten weiterhin `active:false`, Adressen auf `.invalid`. Stufe B (75) und C (400) **nicht angelegt; jeweils bedingt freigegeben** (SR §41) |

## 6 · Skalierung von 25 auf exakt 500 Testprofile

**25 Profile sind aktiv.** Zum Ziel fehlen **475** synthetische Profile: vorhandene Kennungsmengen B 75 und C 400. Neuer Betreiberwunsch: nach dem bestehenden Test direkt auf **500 aktiv**, ohne eigene Abnahme bei 100. Inaktive Anlage und anschließende Aktivierung bleiben getrennte Vorgänge. Endbestand **504 insgesamt, 500 aktiv, 4 unverändert inaktiv**. Keine Kontoaktivierung. Der ausdrückliche Zielweg ist mit #326 geprüft, gemergt und deployt; [Ablauf](betrieb/direkter-ausbau-500.md) und SR §56.

1. **Wiederanlauf erledigt:** Datenbank wiederholt erreichbar, geschützte Leser erfolgreich. Natürlicher Crawl um 20:00 UTC abgeschlossen und unabhängig geprüft, kein Ersatzcrawl. SR §53.
2. **Lagebeleg erledigt:** kontrollierter Lauf um 20:33 UTC erreichte **25/25** mit gespeicherter Wirkung und Quellenlinks. Der gescheiterte 10:00 UTC Lauf zählt weiterhin nicht. Am 07.09. morgens sind alle 60 A Aufträge des Fensters 06.09. erledigt. Vollständige Briefingqualität und aktueller Zählerbeleg über 100 bleiben offen.
3. **Kommunikation:** Vollständiger globaler Riegel am 06.09. um 19:00 UTC wirksam bestätigt. Vor einem späteren Fachlauf erneut prüfen. Frühere Push und Webhook Vorgänge sind kein Tagesnullbeleg.
4. **Provisionierung:** #305 ist gemergt und deployt. Der echte inaktive Kohortenpfad verhindert automatische Kontolöschung und meldet Schreibfehler auch bei lesbarem Teilprofil ehrlich. Schutz offline und in CI belegt. #310 schützt den Auth Blob mit CAS; 500 Kontoanlagen in PostgreSQL belegt. Keine schreibende Production Abnahme.
5. **Budget:** Zähler 124 vom 05.09. sowie wirksamer Deckel 2.416 und Reserve 702 sind belegt. Tagesverbrauch und Kostenobergrenze vor Facharbeit frisch erheben. Kein harter USD Schutz aus den vier wirkungslosen Werten.
6. **Abnahme:** kontinuierlichen Fortschritt, keine systematischen Auslassungen, Datenintegrität, Qualität, Kommunikation und Tageskosten bei der Zielmenge belegen. Gewöhnlicher vorwärts arbeitender Rückstand oder fehlende Mehrtagesbeobachtung blockieren für sich allein nicht. 500 angelegte Profile sind noch kein Funktionsnachweis.

Bestehende Grenzen und Freigaben: [SR §41 und neuere Betreiberänderung §55](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

## 7 · Offene Blocker

1. **OP-01:** Pro aktiv; PITR und anschließende PITR Restore Übung bleiben offen (getrennte Kostenentscheidung).
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mail.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. `20260720`).
4. **OP-04-Rest:** Umgang mit den deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderung bleibt Betreiberaktion.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Production-Beweis der Härtung steht aus (§8).
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6. Belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf (§13).
9. **500er Funktionstest: Qualitätsfehler und scharfer Ausbau offen** (§6, SR §57). 21 von 25 heutigen Lagebriefings referenzieren mindestens einen Vorgang mit ausschließlich über 14 Tage alten Quellen; außerdem unbelegte Rechtsfolge und inhaltsleere Personenmeldung. Quellenprüfung ist keine bestandene A Abnahme. Tageszähler zuletzt 59. Direkter Ausbau nur im Nachtfenster 21:36 bis vor 03:58 UTC. Für den früher automatisch abgelehnten neuen A Workflowstart gilt §55.3 separat weiter; natürliche Auftragsabschlüsse benötigen keinen Ersatzstart.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).
11. **Profilpfad:** Exklusivmodus in Production belegt; ältere Dual Write Annahme überholt. Vor B/C Daten und Ausführungskontext frisch abgleichen. Auth, main und p haben CAS Schutz; alte Instanzen und direkte Fremdschreiber bleiben ausgenommen. Schutz gegen automatische Kontolöschung aus #305 bleibt verpflichtend.

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

## 11 · Nächster Schritt

1. Quellenkorrekturen und Motorstatus sind nach SR §58.5 übernommen. Die beiden Fortsetzungen sind abgestimmt. Nach dem natürlichen Abendcrawl aktuelle Starttore und neue tatsächliche Briefingqualität prüfen; kein doppelter Fachstart.
2. Die A Aufträge des Fensters 06.09. sind natürlich fertig. Nach korrigiertem natürlichem oder ausdrücklich begrenztem Briefinglauf alle 25 Inhalte erneut prüfen und aktuellen Budgetbeleg ergänzen. `qualitaetspruefung-a-20260907.json` ist ausdrücklich keine bestandene `abnahme-a.json`. Ein erneuter A Workflowstart bleibt an die besondere Freigabe aus SR §55.3 gebunden.
3. Nach A Abnahme im belegten Nachtfenster **21:36 bis vor 03:58 UTC** die 475 Zielprofile inaktiv anlegen, unabhängig prüfen und erst mit ausdrücklicher Aktivierungszustimmung getrennt aktivieren. Der Fachzyklus startet ausschließlich bei exakt 500 aktiven Profilen. [Ausführung](betrieb/direkter-ausbau-500.md).
4. Ab tatsächlicher Aktivierung **24 Stunden Test planen, höchstens 48 Stunden**. Endzeit und ausführbaren Abschluss vor Beginn festlegen; der neue manuelle Workflow allein ist kein automatischer Timer. Dann 495 synthetische Profile deaktivieren und unabhängig bestätigen: 504 erhalten, fünf ältere aktiv. 500er Funktionsbefund und Fehler dokumentieren; kein unbeaufsichtigter Wochenlauf.

## 12 · Verbindliche Betriebsgrenzen

Die konkrete Betreiberfreigabe vom 05.09. in [SR §41](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) erlaubt bedingt Code PRs, Merges und kontrollierte Fachläufe. Die neuere direkte Betreiberanweisung in **§55** ändert die Zwischenstufenpflicht, nicht die übrigen Grenzen. Die automatische Ablehnung eines konkreten Workflowstarts bleibt ein eigener Blocker.

1. Maximal **10 USD Modellkosten je UTC Tag**, Sicherheitsstopp spätestens bei prognostiziert **9 USD**. Die wirkungslosen RPM, TPM, USD und Parallelitätswerte sind kein Schutz.
2. Keine Aktivierung der vier sonstigen inaktiven Profile, kein aktives Kohortenkonto, keine externe Nachricht oder Zustellung.
3. Keine Löschung, Wiederherstellung verlorener `crawlRuns`, Migration, neue kostenpflichtige Ressource, Azure Änderung, Vercel Env Änderung, Secret Ausgabe, direkte SQL Aktivierung oder Riegelumgehung. Kein Rollback oder Revert ohne neue Betreiberfreigabe.
4. Neue Zielreihenfolge laut §55: bestehenden Test abschließen, dann direkt 500. Vor jeder Aktivierung genaue Zielmenge, Zeitfenster und getesteten Ausführungsweg belegen; inaktive Anlage und Aktivierung getrennt. Bestehende Riegel nicht umgehen oder bestandene Messungen vortäuschen.
5. Nach jedem erlaubten Merge automatisch deployen lassen und exakt zugehöriges READY belegen. Bei Fehlschlag sofort stoppen; kein zweites Deployment. Nach jedem Fachschritt unabhängig rein lesend kontrollieren.
6. Mandantentrennung bleibt App seitig mit `assertTenant` und explizitem Filter. Keine hartkodierten Mandate. CAS für Auth, main und p belegt; keine Garantie für alte Fremdschreiber, lokale Dateien zwischen Prozessen oder Transaktionen über mehrere Zeilen.

## 13 · Detailnachweise und Archiv

Alle Pfade relativ zu `docs/`. **500er-Funktionstest** (Rahmen, Ablauf, Sprints §34–§38): [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
**OP-Liste und Archiv:** [Restliste](datenmotor-restliste.md) · [OP-30 Fünfermandate](betrieb/op30-aktivierung-5-mandate.md) · [Archiv](archive/README.md).
**Production/Betrieb:** [Beweisprotokoll](betrieb/production_beweisprotokoll.md) · [Backup/Restore](betrieb/backup-restore-runbook.md) · [Cron-Fairness](betrieb/cron-fairness.md) · [Env-Inventar](betrieb/env-inventar.md) · [Watchdog 26.08.](betrieb/watchdog-korrektur-2026-08-26.md) · [Kostenmessung](betrieb/kostenmessung.md) · [Paket-Inventur](quellenarchitektur/30-paket-inventur-production.md).
**Skalierung:** [25/50/100](betrieb/skalierung-25-50-100.md) · [200 Mandate](betrieb/skalierung-200-mandate.md) · [Entscheidungsvorlage 24.08.](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md).
**Verträge:** [Morgenlage-Kapazität](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) · [Profil-Import](betrieb/op30-profilvertrag-200-mandate.md) · [Briefing-Frische](betrieb/briefing-frischevertrag-2026-08-10.md) · [OP-31/OP-30 CAS](betrieb/op30-verstehen-cas-2026-08-14.md) · [OP-25 §7.7](betrieb/vorgangskontext.md).

## 14–22 · Sprints 24.08.–01.09. (Kurzform; Vollfassung im Archiv)

- **§20 Kapazität Understanding — BLOCKIERT** ([Beleg](betrieb/understanding-kapazitaet-2026-08-31.md)): 31.08. 9.080
  pending, Ankunft Ø 307 / Abfluss Ø 68 pro Tag. Gate bleibt `shadow`. **Offen:** natürlicher Nachweis, OP-06, Siebentagenachweis.
- **§21 500-Mandate-Reife** (#290): Aufnahmefähigkeit 500 **erbracht** · Dimensionierung **offen** · Mehrtagesbetrieb
  **NICHT BEWIESEN**. Minimal-Cron `18,48` vorbereitet, **nicht aktiviert**.
- **Lehren §14–§19:** `bereit` heißt Konfigurationsbereitschaft, **nicht** Zustellung · der Anlage-Stapel legt nur
  **inaktiv** an · Z22-Buchungen `20260829175642`/`20260829175749` **nicht erneut anwenden** · `lauf-bilanz.js` ist die
  kanonische Statusableitung.
## 23–25 · Gemergte Sprints 01.–03.09. (**#294 · #295 · #296**)

*Alle drei erfolgreich.* Vollbeleg: [SR §1–§33](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Sie machten
Schutzregeln und Ausführer wirksam — den Test **nicht** startbereit.

- **Telemetriequelle** ist `helmut_store` Zeile `<id>-auth`, Schlüssel `llmUsage` (Ring 5.000), **nicht** die Zeile
  `main` und **nicht** `llm_usage`; Tagesbedarf p95 **170** / max 298 (Untergrenze). Azure 250.000 TPM / 250 RPM,
  `gpt-5-mini`, Sweden Central; **Kontokontingent unbelegt**.
- **Acht vorbereitete Betreiberwerte.** Welche zur Laufzeit gelesen werden: [env-inventar §3a](betrieb/env-inventar.md).
- **Startfenster-Tor prüft FÄLLIGKEIT** (`due_at <= jetzt`, fail closed): nur **21:36–03:59 UTC** trägt **100 %**.
## 26 · Sprint 03.09. — Stufenweise Provisionierung + §34.7 (**#297 gemergt, deployt**)

*Erfolgreich.* Vollbeleg: [SR §34](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). `--stufe=a|b|c` ist bei
der Provisionierung **Pflicht** (fehlend/unbekannt = Exit 2; **a→20 / b→75 / c→400**); die acht Betreiberwerte sind
Vorbedingung jeder **Aktivierung**, keiner Provisionierung. Stufe A **20/20**, Prüfung **495/495**. Production nutzt die
**relationalen** Profile; `profil-bereitschaft.js --production` bleibt als Klärbeleg **unzulässig**. Lastfolge nach
Aktivierung: **+252 `source_fetch`/Tag**; `HELMUT_TESTKOHORTE_QUELLEN` bleibt **AUS** (sonst 1.802 statt 138).
## 27 · Sprint 03.09. — Fünferabgleich + freigegebene Profilkorrektur (ausgeführt)

*Erfolgreich.* Vollbeleg: [SR §35](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Die Blob-Korrektur vom
04.08. blieb relational unwirksam — betroffen **alle fünf** aktiven Profile. Mit Freigabe ausgeführt: **eine** atomare
Transaktion, 5 Zeilen, **8 Feldänderungen**, Compare-and-Set je Zeile, vorher Sicherung. **Offen (eigener PR):** zwei
fehlende WP-20-Bezeichnungen in `VERALTETE_AUSSCHUSSNAMEN`; `profil-bereitschaft.js` behauptet Z. 13/71 „rein
lesend" — für `--production` zu stark.
## 28 · Sprint 04.09. — Stufe A inaktiv provisioniert · **TEILWEISE ABGESCHLOSSEN**

Vollbeleg: [SR §36/§37](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Als **#300** gemergt (`350d901`,
Deployment `dpl_DFHbTQo5T4fButYGbEXUHgzSsfnP`); kein Anwendungscode. Scharfer Lauf `provisionierung --stufe=a`
(11:38–11:40 UTC): **20 Profile angelegt, 0 fehlgeschlagen, alle inaktiv und isoliert** (9/9); die 9 Mandats- und
10 Identitätszeilen **bytegenau unverändert**.

**Warum nicht vollständig:** `crawlRuns` wurde unbeabsichtigt **36 → 20** gekürzt (Wurzelfix: §29; **nicht
wiederhergestellt**), und `HELMUT_PROFILE_DB_MODE` wurde für den einzelnen Prozess gesetzt, obwohl der Auftrag
Umgebungsvariablen ausgeschlossen hatte — keine Vercel-Variable verändert, die Prozessvariable lag trotzdem
außerhalb der wörtlichen Freigabegrenze.
## 29 · Sprint 04.09. — Speicherpfad-Schutz gemergt und deployt · **ERFOLGREICH ABGESCHLOSSEN**

Vollbeleg: **[SR §38](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)** (inkl. §38.9). Erfüllt SR §37.5.
Gemergt als **#301** — Merge-Commit `8fa390d`, 04.09. 21:14:20 UTC, Deployment `dpl_BHEaHNmHC9xm9gSZtKCdZM6DbDTN`
READY. Production danach rein lesend unverändert geprüft.

- **Mechanismus:** `compactStore` verkleinert `crawlRuns` in **keiner** Konfiguration mehr (Grenze allein in
  `saveCrawlRun`, nie unter dem Lesefenster 20); **eine Wahrheit** in `speicherpfad-vorflug.js`; **Vorflug-Riegel**
  mit Exit 2 vor dem ersten Schreibvorgang in Provisionierung/Aktivierung/Entfernung und `provision-tenant`
  (Rückweg bewusst ungeriegelt); **`--validate`-Umgehung geschlossen**.
- **Nachweisgrenze:** die Wirkung ist **ausschließlich offline verhaltensbasiert** belegt (115 Assertions,
  64er-/256er-Kombinationsdurchlauf). **In Production wurde kein schreibender Test des Riegels ausgeführt.**
- **Nicht enthalten:** kein Compare-and-Set auf `main` (**SR §37.5 (7), weiterhin offen**) · keine Wiederherstellung
  der 16 `crawlRuns`.
## 30 · Sprint 05.09. — Stufe A aktiviert · **ERFOLGREICH ABGESCHLOSSEN**

Vollbeleg: **[SR §39](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)**. Mit Freigabe ausgeführt: **ein**
scharfer Lauf, 11:38:13–11:38:58 UTC (45 s), Startfenster geprüft, Vorflug-Riegel 5/5.
**20 aktiviert, 0 fehlgeschlagen, `beruehrtKeineKonten: true`.**

- **Rein lesend nachgeprüft (11:43 UTC):** 29 Profile → **25 aktiv / 4 inaktiv** (vorher 5/24), Stufe A **20/20**,
  B/C **0/0**, 0 Löschmarken, `crawlRuns` **20**, **35** Migrationen. Zeile `main` genau **einmal** geschrieben
  (11:38:58,387), `main-auth` **unberührt**. Invariante gehalten: `max(updated_at)` der 9 Nicht-Kohortenprofile
  unverändert `2026-08-06 08:01:31,744+00`.
- **Konten bleiben `active: false`** — der Bindungsvorgang brauchte keine Kontoaktivierung. Die Pipeline entscheidet
  über `profileActive`, nicht über das Konto; die Verarbeitung ist dadurch nicht blockiert, nur der Login.
- **Kosten:** 0 Modellaufrufe durch den Lauf. Tagesverbrauch bis 11:33 UTC 63 Aufrufe / **0,2010 USD**, Kohorte **0**.
  Durchgesetzt wird eine **Aufrufzahl**, kein USD-Betrag; der wirksame `HELMUT_MAX_LLM_CALLS_PER_DAY` ist aus einer
  Sitzung **nicht lesbar** (SR §39.2).
- **Deployment zum Abschluss von A:** `dpl_GCZLTfUSmFoeMP1WSfxG2bEYeinP` (READY, production, `redeploy` von `9407f8c8…`). Aktueller Nachfolger nach #303 siehe §2.
- **Befund:** `mandate_profiles.updated_at` blieb bei allen 20 Zeilen auf dem `created_at` vom 04.09. → §31.
## 31 · Lagekapazität und Übernahme am 05.09. · TEILWEISE ABGESCHLOSSEN

PR **#303 gemergt und Production READY**: faire Zeitscheiben, gemeinsame Erfassung, Vormerkgrenze und `mandate_profiles.updated_at`. Die unabhängige Kontextkorrektur verhindert die Vermischung unabhängiger Personenquellen und teilt ein absolutes Budget. Fünf externe Prüfungen am exakten Kopf grün, keine offenen Review Threads. Belege: [SR §40 bis §42](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

**Offen:** kontrollierter Lage Check mit 25 Profilen, vollständiger Fachzyklus von A, B/C Anlage und Aktivierung. Der Tageszähler 124 widerlegt den bisherigen Stopp bei 100; er beweist nicht den exakten konfigurierten Deckel. **142 Sekunden für 25** und **acht Läufe für 500** bleiben Rechenmodelle. Kein Modellweg über `/api/debug/pipeline-probe`, da dort die Budgetreservierung laut Altbefund nicht gewährleistet ist.

**Gezielte Folgekorrektur vor B:** Der Kohortenpfad behält bei Anlagefehlern einen möglichen inaktiven Kontoteilbestand und meldet auch einen teilweise gespeicherten Profilstand als Fehler. Konten ohne Profil bleiben durch den bestehenden Bestandsschutz gesperrt; keine automatische Übernahme und kein Ersatzaktivierungsweg. Als #305 gemergt und READY; Prüfstand SR §42 und §43.

## 32 · Nachtrag #305 und natürlicher Understanding Lauf

**#305 gemergt und deployt:** 321/321 Offline Suiten, 32/32 Browserprüfungen; externe Prüfungen am exakten Kopf erfolgreich, keine offenen Review Threads. Kein Kohortenprofil angelegt oder aktiviert. Details und beide Merge Eltern in [SR §43](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

Der natürliche Lauf um 21:30 UTC speicherte 20 Ergebnisse ohne Fehler. Reservierungszähler 124; 118 protokollierte Aufrufe und 0,385127 USD geschätzte KI Modellkosten insgesamt im UTC Tag bis etwa 21:45 Uhr. Keine belastbare Pro Profil Zuordnung und keine vollständige Rechnung. Seit 19:11 UTC keine neuen Push oder Audit Ereignisse in allen geprüften Stores; historische Tageszustellungen existieren. Keine Tagesnull behaupten.

Ein unverändertes `mandate_profiles.updated_at` nach dem Deployment ist erwartbar: #303 setzt es bei einem echten Profilwrite, ohne rückwirkende Migration. `max(updated_at)` am 05.09. um 21:48 UTC: `2026-09-04 11:40:34.994784+00`. Das ersetzt keinen Inventarvergleich. Zur Kontexttrennung siehe [cron-globalphase §8a](betrieb/cron-globalphase.md).
