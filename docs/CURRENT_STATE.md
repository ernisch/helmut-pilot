# CURRENT STATE — Helmut

**Stand: 2026-09-05, 21:06 UTC.** PR **#303 gemergt**, `main` **`33f1158`**, Production **`dpl_36dEh3b6RPZBW5Ufokk2PuESJyZ2` READY**, exakter Merge Commit belegt. Weiter **29 Profile, 25 aktiv, vier inaktiv**, A 20/20, B/C nicht angelegt, null Löschmarken, `crawlRuns` 20, Migrationen 35. Alle Profile sind laut Betreiber Testprofile. Ziel exakt 500, B (75) und C (400) getrennt bedingt freigegeben. Tageszähler **104**, protokollierte Modellkosten **0,322782 USD**: alter Stopp bei 100 überschritten, exakter Deckel 2416 nicht bewiesen. **BLOCKIERT am sicheren Ausführungszugang** für kontrollierten Lage Check und Kohortenanlage. Nachprüfung und aktueller Korrekturstand: [SR §42](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

**Kernlage:** Der Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit 23.08.2026 in Production eingeschaltet**, Modus **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb, kein Ereignis-Antrieb, kein AWS). Die **fünf Mandate sind mit 376 echten Abschlüssen bewiesen**, Morgen-/Lagelauf 5/5, 0 Verlust, alle elf §28.6-Kontrollen erfüllt ([`op30-aktivierung-5-mandate §30.7`](betrieb/op30-aktivierung-5-mandate.md)). **Seit 30.08. stehen 3 Vorgänge auf `unbekannt` (§14–22).** **Der Selbstweck ist lokal belegt, in Production nie ausgeführt.**

## 1 · Aktive Produktphase

**Kontrollierter Funktionsnachweis bis exakt 500 aktiven Testprofilen.** Stufe A, B und C bleiben getrennt. Vorrang haben Datenintegrität, vollständige Kommunikationssperre und höchstens 10 USD Modellkosten je UTC Tag mit Sicherheitsstopp bei prognostiziert 9 USD. Danach Verkaufsreife und die weiterhin offenen P0 Punkte OP-01 bis OP-04; [verbindliche OP Liste](datenmotor-restliste.md). Kein Nachweis von 500 Kunden oder dauerhaft tragfähigem Mehrtagesbetrieb.

## 2 · Stand auf `main` und Pull Requests

- **`main` Kopf: `33f1158694273425e3430344a850c9d1c9335625`**, Merge von **#303** mit erwartetem Kopf und zwei Eltern: `9407f8c` und `9aa95e0`. Automatisches Production Deployment **`dpl_36dEh3b6RPZBW5Ufokk2PuESJyZ2` READY**, Commit exakt gleich, Alias `helmut-pilot.vercel.app`. Maßgeblich sind Git Historie und Deployment Metadaten.
- **Letzter fachlicher Production Code: `33f1158`** (#303: Lagekapazität, Vorgangskontexte, Fristen, `updated_at`). Der kontrollierte Laufzeitnachweis steht aus; vorher #301 (`8fa390d`, Speicherpfadschutz).
- **Zuletzt gemergt: #303**, davor #302 und #301. #275 bis #277 und #282 nach Konsolidierung geschlossen, nicht gemergt; Branches bleiben Auditbelege.
- **In Arbeit:** getrennte Korrektur `codex/kohorten-anlage-ohne-loeschung`: keine automatische Kontolöschung im inaktiven Kohortenpfad und keine Erfolgsmeldung nach teilweisem Profilwrite. Prüfstand und PR Status siehe SR §42.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und Restore seit 28.07. geübt, RPO ≤ 24 h.
- **Mandate (05.09., 21:06 UTC rein lesend):** **29 Profile, 25 aktiv, vier inaktiv**, null Löschmarken; A 20/20, B/C nicht angelegt. Alle einschließlich der fünf älteren sind laut Betreiber Testprofile. Vier andere inaktive Profile unverändert. **30 relationale Identitätsprofile**, **25 Auth Konten, drei aktiv**; davon **20 Kohortenkonten, null aktiv**. Profil und Kontenbestand vor/nach #303 unverändert. Natürlicher Crawl um 20:00 UTC: 111 verarbeitet, 71 zurückgestellt, null Fehler. A: 19 Quellenaufträge erledigt, 41 Aufträge offen. Vollbeleg SR §42.
- **Crawl-Aufbewahrung:** `HELMUT_CRAWL_RUN_RETENTION=36` (Betreiberangabe, aus dem Code nicht unabhängig belegbar). Der Blob-Ring `crawlRuns` steht seit 04.09. auf **20** (§28) und **füllt sich nicht nach**: seit 23.08. erreicht kein Cron mehr `saveCrawlRun` (SR §37.3). Stillgelegter Altpfad-Puffer; kein Entscheidungspfad liest über Position 20 hinaus. **Der Schutz gegen erneute Kürzung ist seit dem #301-Merge im Production-Code enthalten** (§29) — **offline verhaltensbasiert belegt (115 Assertions), kein schreibender Production-Test des Riegels**.
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` nicht in Production.** Dazu Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (05.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze); **0,002941 USD je Aufruf** (Listenpreis, Kontopreis unbelegt — F7); bei Deckel 2.416 ≈ **213 USD/Monat**, Schranke 243 ([`kostenmessung`](betrieb/kostenmessung.md)).
- **Zugang dieser ChatGPT Sitzung:** GitHub Lesen, Schreiben und Merge sowie Vercel Metadaten und Supabase SQL lesend belegt. Der getestete Skriptpfad ist vorhanden, seine geschützten Prozesszugänge fehlen. Vercel CLI Anmeldung durch Ausführungsrichtlinie blockiert trotz bereits aktiviertem Work Netzwerkschalter; Connector Zugriff funktioniert. Anwendungsprüfung `/api/cron/pipeline-status`: 403 wegen fehlendem Cron Secret. Kein kontrollierter Fachlauf; keine Zugriffssperre umgangen. Details SR §42.

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM Tagesbudget: Betreiber meldet **2.416** und Understanding Reserve **702**, danach Redeploy | Zähler 05.09. **104**, somit alter Stopp bei 100 überschritten; 99 protokollierte Modellaufrufe, berechnet **0,322782 USD**, null unbekannte Kostenangaben. Exakte Rohwerte weiterhin unbelegt. Kein harter USD Schutz durch die vier wirkungslosen Testlaufwerte. Schutzlimit ohne Deckelvariable weiterhin 50. |
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
| `HELMUT_TESTLAUF_*` | RPM, TPM, USD und Parallelität haben **keinen Laufzeitleser**. Vollständige Kommunikationssperre ist vor jedem Fachlauf technisch zu belegen; die ältere aktive Kennung mit Push Abonnement wird von der Kohortenfamilie nicht erfasst. Rohwerte dieser Sitzung nicht lesbar. |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | **im aktuellen Prozess nicht gesetzt**. Freigaben gelten ausschließlich pro vorgesehenem scharfen Schritt mit dessen Bestätigung; Vercel nicht ändern. `_QUELLEN` bleibt AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad in Production wirkungsbelegt**; roher Env-Wert unbestätigt. Ohne ihn schreibt `storage.saveProfile` **nur den Blob** und die Nachprüfung meldet falsches Grün (§28, SR §37.1). `HELMUT_PROFILE_DB_EXCLUSIVE` bleibt aus (Dual Write) |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |
| **20 Profile der Stufe A** (`test-kohorte-a-001…020`) | 04.09. angelegt, **05.09. 11:38 UTC mit Freigabe aktiviert** (§30): 20/20 `aktiv`, Konten weiterhin `active:false`, Adressen auf `.invalid`. Stufe B (75) und C (400) **nicht angelegt; jeweils bedingt freigegeben** (SR §41) |

## 6 · Skalierung von 25 auf exakt 500 Testprofile

**25 Profile sind aktiv.** Stufe B umfasst aus dem Code exakt 75 neue Kennungen, Stufe C 400. Anlage jeweils vollständig inaktiv, danach eigener Aktivierungsschritt und eigene Abnahme. Endbestand soll **504 insgesamt, 500 aktiv, 4 unverändert inaktiv** sein. Keine Kontoaktivierung.

1. **Zugang:** sicherer authentifizierter Ausführungskontext für `scripts/testkohorte-vorwaerts.js` fehlt. Bestehende Admin Routen und SQL sind kein zugelassener Ersatz.
2. **PR #303 gemergt und deployt:** Kontext und Fristfehler korrigiert, 129 gezielte Prüfungen und externe CI grün. Kontrollierter Production Lagebeleg fehlt wegen fehlendem Betriebszugang; SR §42.
3. **Kommunikation:** die fünf älteren Testprofile gelten im Code weiter als regulär. Eine aktive Push Subscription ist vorhanden; vor kontrollierten Läufen muss der vollständige Riegel wirksam belegt sein.
4. **Provisionierung:** der bisherige Fehlerpfad löscht automatisch ein gerade angelegtes Konto. Vor B/C ist eine gezielte getestete Korrektur nötig, damit das aktuelle Löschverbot auch im Fehlerfall gilt. Geteilte Blobs bleiben ohne CAS.
5. **Budget:** Betreiberangabe 2.416/702 ist kein Wirkungsbeleg. Vor B muss der Zähler erfolgreich über 100 steigen; bei Stop exakt 100 keine Env Änderung und keine Aktivierung.
6. **Abnahme:** kontinuierlicher Fortschritt, keine systematischen Auslassungen, Datenintegrität, Kommunikation und Tageskosten je Stufe belegen. Gewöhnlicher Altbestand im Rückstand oder fehlende mehrtägige Beobachtung blockieren laut Betreiber für sich allein nicht. Mehrtagesbetrieb und Verkaufsreife werden dadurch nicht behauptet.

Vollständige aktuelle Freigaben, Nachweisgrenzen und Fortsetzung: [SR §41](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR (Kostenentscheidung).
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mail.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. `20260720`).
4. **OP-04-Rest:** Umgang mit den deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderung bleibt Betreiberaktion.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten nie (`circuit-open`) — Production-Beweis der Härtung steht aus (§8).
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6. Belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf (§13).
9. **500er Funktionstest: BLOCKIERT am sicheren Ausführungszugang** (§6, SR §41). A aktiv; B/C bedingt freigegeben, noch nicht angelegt. Pipeline Fortschritt mit 25 ist belegt, Lage und Deckel über 100 noch nicht. Kein Kundenschutzblocker: alle Profile sind laut Betreiber synthetisch.
10. **OP-07:** Monitoring-Zweitkanal stellt seit mind. 17.08. täglich zu; Ziel von `HELMUT_MONITORING_WEBHOOK_URL` und der doppelte WhatsApp-Eingang bleiben ungeklärt (Betreiberprüfung, kein Code-Fix vorher).
11. **Profilpfad:** Speicherpfadschutz seit #301 ausgerollt, seine Schutzwirkung offline belegt (§29). A wurde später aktiviert (§30). B/C brauchen weiterhin den geprüften Ausführungspfad und ihre jeweilige Abnahme. Offene Datengefahr: `main` und `main-auth` werden ohne Compare-and-Set ersetzt; automatischer Löschpfad bei Anlagefehlern widerspricht dem aktuellen Auftrag (§6).

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

1. Nach gemergtem #303 die getrennte Korrektur gegen automatische Kontolöschung und falsche Erfolgsmeldungen abschließen; SR §42. Keine Kohortenanlage ohne sicheren Ausführungszugang.
2. Geschützte Prozesszugänge für den unveränderten geprüften Ausführer verfügbar machen, ohne Secrets im Chat oder Repository offenzulegen. Vor jedem scharfen Lauf Grundlinie, reale Uhr, laufende Prozesse, Kosten und Kommunikationsriegel frisch prüfen.
3. Danach den kontrollierten Lagebeweis für 25 erbringen und A vollständig abnehmen. Zähler über 100 bereits natürlich belegt. Anschließend B und C getrennt provisionieren, prüfen und aktivieren. Bei Deploymentfehler sofort stoppen, kein zweiter Versuch oder Rollback.
4. Vor B Provisionierung den automatischen Löschfehlerpfad gezielt korrigieren und testen. B inaktiv anlegen, getrennt aktivieren und abnehmen; erst danach C. Vollständiges Nachtfenster laut Code: **21:36 bis 03:59 UTC**, vor Ausführung frisch belegen. Alle Prüfungen und Grenzen in SR §41.
5. Erst nach 500 und Abschlussdokumentation wieder Verkaufsreife und die P0 Punkte bearbeiten. Ein gewöhnlicher Rückstand ist kein Grund, ohne weitere Prüfung abzubrechen.

## 12 · Verbindliche Betriebsgrenzen

Die konkrete Betreiberfreigabe vom 05.09. in [SR §41](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md) überstimmt ältere pauschale Nichtfreigaben für B/C, Merge und kontrollierte Modellläufe. Sie gilt **nur nach den dort genannten Bedingungen**.

1. Maximal **10 USD Modellkosten je UTC Tag**, Sicherheitsstopp spätestens bei prognostiziert **9 USD**. Die wirkungslosen RPM, TPM, USD und Parallelitätswerte sind kein Schutz.
2. Keine Aktivierung der vier sonstigen inaktiven Profile, kein aktives Kohortenkonto, keine externe Nachricht oder Zustellung.
3. Keine Löschung, Wiederherstellung verlorener `crawlRuns`, Migration, neue kostenpflichtige Ressource, Azure Änderung, Vercel Env Änderung, Secret Ausgabe, direkte SQL Aktivierung oder Riegelumgehung. Kein Rollback oder Revert ohne neue Betreiberfreigabe.
4. Stufen getrennt, keine Auslassung. Vor jeder Aktivierung genaue Zielmenge, Zeitfenster und getesteten Ausführungsweg belegen. Kein unbekannter Profilumfang oder unbekannte Änderung außerhalb des Auftrags.
5. Nach jedem erlaubten Merge automatisch deployen lassen und exakt zugehöriges READY belegen. Bei Fehlschlag sofort stoppen; kein zweites Deployment. Nach jedem Fachschritt unabhängig rein lesend kontrollieren.
6. Mandantentrennung bleibt App seitig mit `assertTenant` und explizitem Filter. Keine hartkodierten Mandate. Unbedingte Blobschreibvorgänge bleiben ein offenes Risiko, kein behaupteter CAS Nachweis.

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

**Offen:** kontrollierter Lage Check mit 25 Profilen, vollständiger Fachzyklus von A, B/C Anlage und Aktivierung. Der Tageszähler 104 widerlegt den bisherigen Stopp bei 100; er beweist nicht den exakten konfigurierten Deckel. **142 Sekunden für 25** und **acht Läufe für 500** bleiben Rechenmodelle. Kein Modellweg über `/api/debug/pipeline-probe`, da dort die Budgetreservierung laut Altbefund nicht gewährleistet ist.

**Gezielte Folgekorrektur vor B:** Der Kohortenpfad behält bei Anlagefehlern einen möglichen inaktiven Kontoteilbestand und meldet auch einen teilweise gespeicherten Profilstand als Fehler. Konten ohne Profil bleiben durch den bestehenden Bestandsschutz gesperrt; keine automatische Übernahme und kein Ersatzaktivierungsweg. Branch und Prüfstand SR §42.
