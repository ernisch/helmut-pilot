# CURRENT STATE — Helmut

**Stand: 2026-08-31 — zuletzt aktualisiert zum Kapazitätssprint Understanding (§20; §19-PR gemergt).** Vollständige
Fassung vor dieser Verdichtung: byte-identisch in [`archive/project_state/2026_08_24_CURRENT_STATE_full.md`](archive/project_state/2026_08_24_CURRENT_STATE_full.md). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage in sechs Sätzen:** Der neue Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit dem 23.08.2026 in Production eingeschaltet** (Vollbeleg Runbook §30.7). Die **fünf bestehenden Mandate sind mit 376 echten Abschlüssen bewiesen**; **Morgenlauf 5/5 und Lagelauf effektiv 5/5** aller aktiven Mandate waren erfolgreich. Der **R4-/GitHub-Actions-Watchdog-Nachweis ist grün**. Im Aktivierungsfenster gab es **keine Doppelarbeit, keine verlorenen Aufträge, keine endgültigen Fehler, 0 Lease-Probleme und 0 Fencing-Konflikte**; alle elf §28.6-Kontrollen sind erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). **Der Stand `0 unbekannt` gilt seit dem 30.08. nicht mehr: es stehen 2 Vorgänge auf `unbekannt` (§19).** Der Modus ist weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb; kein Ereignis-Antrieb, kein AWS). **Der Selbstweck ist seit 24.08. lokal Ende-zu-Ende belegt, aber in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main` = `0f900e68` = Merge von PR #283** (Understanding-Laufmeldung, 31.08. 07:14 UTC nach Betreiberfreigabe); davor `afc807e0` (#274), `bb0577a9` (#281), `87bed221` (#280), `4f019797` (#279), `ae74a9bc` (#273). Das Vercel-Production-Deployment zu `0f900e68` ist `READY` (rein lesend über die Vercel-API geprüft, 31.08.); die Läufe bis einschließlich 31.08. 05:32 UTC trugen noch `afc807e0` (Merge lag danach — kein Widerspruch).
- **PR #273, #274, #279, #280, #281 und #283 sind gemergt.** Offen bleiben die gestapelten PRs #275–#277 (Basis war der #274-Branch) sowie **#282** (Beweisgatter Zehn-Mandate-Übergang, enthält die Grüntage-Auswertung); sie sind nicht Teil von Production.
- Davor gemergt: #271, #270, #265, #262, #261, #260/#259/#256/#257, #225, #216; die PR-Bereinigung vom 23.08. (inkl. begründeter Schließungen) ist in Archivfassung und Runbook dokumentiert.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und isolierter Restore seit 2026-07-28 geübt; RPO ≤ 24 h.
- **Mandate (zwei Zählungen, nicht dasselbe — rein lesend bestätigt 25.08.):** **9 Mandatsprofile** (`mandate_profiles`), davon **5 aktiv** (Signatur `m5-9aee228dbf2c9f13`, K2-Gate ohne Widerspruch) und 4 deaktiviert (`angela-merkel`, `james-brown`, `max-mustermann`, `helmut-abnahme-berlin`; OP-04-Rest), 0 mit Löschmarke. Daneben **10 Identitätsprofile** (`profiles`), davon **1 ohne zugehöriges Mandatsprofil**; 0 Mandatsprofile ohne Identitätsprofil. **0 Testmandate.** Ein Identitätsprofil ist kein Mandat — nur die 5 aktiven Mandatsprofile erzeugen Last.
- **Aufbewahrung Crawl-Läufe:** `HELMUT_CRAWL_RUN_RETENTION=36` (Mindestbedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146 von 163 Wegen Google-News** (Klumpenrisiko B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT).
- **Crons (Production):** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 · lage-check 10:00 UTC · 2 Narrativ-Nachlaufslots 06:10/06:22, inert). Dazu der GitHub-Actions-Watchdog (`briefing-watchdog.yml`, täglich 05:30 UTC, oft 2–3 h verzögert).
- **Migrationen:** OP-30-Dateien seit 15.08. angewendet; `20260823043633` seit 23.08. installiert (Doppelbuchung dokumentiert, Runbook §30.6). **Z22 ist seit 29.08. mit ausdrücklicher Betreiberfreigabe in Production angewendet:** Basis `20260826190000` unter Production-Buchung `20260829175642`, Vorwärtskorrektur `20260829123132` unter `20260829175749`; Nachprüfung grün (§18), **Z22 nicht erneut anwenden**. Auf `main`, aber **nicht in Production angewendet**, liegen weiterhin `20260720` und F9 (`20260825101500`). Im isolierten Z3b-Testprojekt ist die alte Z22-Fassung unter `20260827121931` und die Korrektur unter der Buchung `20260829135455` angewendet (§18). Jede weitere Production-Anwendung bleibt freigabepflichtig.
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt, [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)).
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase lesend, Vercel-Deployments lesend; **Vercel-Env weder lesbar noch setzbar**; Flag-Zustände nur wirkungsbasiert prüfbar. Jede Flag-/Env-Änderung und jeder Rückbau ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8). Die Parlamentsdomains sind aus Cloud-Sitzungen per Egress-Proxy gesperrt — bytegenaue Quellenprüfung läuft über den freigegebenen Actions-Weg (§14).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md)) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget: Gesamtdeckel **100**, davon **30** für Verstehen reserviert (nicht priorisiert: max. 70; nie 130) | Mechanismus fail-closed (Code). **Die Werte 100/30 sind dokumentiert, in dieser Sitzung nicht live verifiziert** — Vercel-Env ist weder lesbar noch setzbar, `llm_budget_counters` speichert nur den Verbrauch, nicht die Grenze. Fehlt die Variable, greift laut Code das Schutzlimit **50**. Tragfähigkeit: **25 offen (muss gemessen werden)**, **ab 50 reicht 100 in beiden Modelllinien nicht** (§6.3) |
| `HELMUT_VERSTEHEN_CAS=on` | seit 2026-08-17; `HELMUT_VERSTEHEN_PARALLELITAET` nicht gesetzt ⇒ wirkt als 1 |
| `HELMUT_SCALABLE_PIPELINE=on` | **seit 23.08. 16:47 UTC**, `HELMUT_JOB_DISPATCH_MODE=shadow`, Worker 4/25/25; Versuch 5 abgeschlossen, kein Rückbau nötig; Rückweg: Flag löschen + Redeploy (Betreiber) |
| `HELMUT_CRON_GLOBALABRUF=on` | seit 2026-08-06 (Betreiber); Fortbestand ist Betreiberentscheidung |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **Berlin (Landesmodul)** | inaktiv; `HELMUT_LANDESMODULE=berlin` gesetzt, aber wirkungslos (0 berechtigte Mandate); ob das Flag wirkt, ist **unbewiesen** ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22) |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt) |
| M8 / `HELMUT_MATCHING_RELEVANZ_GATE` | aus (nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, nicht aktiviert (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | Wirkung AN (laufzeitbelegt); Wert/Setzzeitpunkt nicht Betreiber-bestätigt |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Skalierung: was vor 10 und vor 25 Mandaten fehlt

**Die 25 Mandate sind nicht aktiviert.** Die 20 zusätzlichen Profile existieren als **lokales, vollständig deaktiviertes Importpaket** (`aktiv: false`, kein Import in Production; §14). Voraussetzungen bleiben ausdrücklich:

1. **Siebentägiger Nachweis des echten Warteschlangenbetriebs mit fünf Mandaten** — nicht begonnen. Verbindliche Quelle ist [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) §14 **Stufe 2** (Abfluss ≥ Ankunft über 7 Tage, 0 Verlust/Doppelarbeit, Wartezeit < 24 h). Die frühere Angabe „`op30-kapazitaet-morgenslots-2026-08-09.md` §10" war **falsch**: dort steht der ältere **Slot-Stufenplan** (Morgenslots, 5→200 Mandate), nicht der Ereignis-Antrieb. Für die Umschaltung sind **fünf** Umgebungswerte nötig, nicht drei ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §7a).
2. **Regionale Quellen Berlin/Brandenburg**: beide Landesmodule inaktiv, Wege gesperrt, Seeds nicht eingespielt; Wirkung von `HELMUT_LANDESMODULE` unbewiesen (§5).
3. **KI-Tagesdeckel**: **100/30 sind dokumentierte Werte, in dieser Sitzung nicht live verifiziert** (Vercel-Env weder lesbar noch setzbar; `llm_budget_counters` speichert nur den Verbrauch, nicht die Grenze). Semantik: Gesamtobergrenze ist das Limit, die Reserve wird darin freigehalten und **nicht** addiert ⇒ 100 gesamt, höchstens 70 nicht priorisiert, **nie 130**; fehlt die Variable, greift laut Code das Schutzlimit **50**. **Für 25 Mandate ist die Tragfähigkeit offen und muss gemessen werden** (Linie A 88–265, Linie B 113–336). **Ab 50 Mandaten reicht 100 in beiden Modelllinien nicht.** (Semantik [`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); Modellvergleich [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2c.)
4. **Tägliche Lagekapazität**: der Altpfad schaffte 2 Mandate je Tageslauf; der Motor liefert seit 23.08. effektiv 5/5, für 25 ist der Nachweis offen (Stufenplan Stufe 2 inkl. OP-25-Wiederholung).
5. **20 zusätzliche Profile**: gegen die amtlichen Live-Seiten abgeglichen und **amtlich bestätigt** (rein lesende Actions-Läufe 24.08.; Lauf 4 bestätigte alle 20 unter Strenge-Stufe 2, nicht amtlich Belegbares wurde entfernt statt behauptet — **maßgeblich ist der jeweils letzte Verifikationslauf am PR**, Protokoll: `daten/…-pruefstand.md`); Import/Aktivierung bleiben freigabepflichtig. **Berliner Wahl 20.09.2026** (berlin.de/wahlen): die zehn Berliner Profile gelten nur für die 19. WP — nach der Wahl erneute Prüfung, keine ungeprüfte Aktivierung; Terminrisiko für den 25er-Nachweis.
6. **Echter Warteschlangenbetrieb (Ereignis-Antrieb):** **AWS ist dafür nicht technisch notwendig** (Korrektur 24.08.). Für den Fünfernachweis trägt der vorhandene **Selbstweck** — gebaut, verriegelt, lokal Ende-zu-Ende belegt, **in Production nie ausgeführt**; Freischaltung ist eine Betreiberentscheidung (Runbook §31). AWS (SQS/DLQ/KMS/IAM/Lambda) bleibt der kanonische Transport für **große** Mandatszahlen und eine getrennte, kostenpflichtige Gründerentscheidung — die frühere Aussage „Voraussetzung des Fünfernachweises" ist überholt.

Entscheidungsgrundlage in einfacher Sprache: [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md).

## 7 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR — Kostenentscheidung.
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und Mailbetrieb.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant (inkl. Migration `20260720`).
4. **OP-04-Rest:** Umgang mit deaktivierten Demo-Mandaten.
5. **Vercel-Schreibzugriff:** Flag-/Env-Änderungen bleiben Betreiberaktionen.
6. **OP-11:** Branch Protection nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Klumpenrisiko (146/163 Wege); 29 von 42 Personensuchen lieferten im Betriebszeitraum nie (`circuit-open`) — Versorgungsausfall-Risiko, Production-Beweis der Härtung steht aus.
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6 (Deckel, 7-Tage-Nachweis, Stufenplan). Neu belegt: **drei** reguläre Warteschlangenabflüsse/Tag, nicht elf ([`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2a).
9. **Zwei Testzeilen in Production — ERLEDIGT (25.08.).** Auftrag `371707a4…` und Outbox-Zeile `24ba14ec…` sind **entfernt**; die Neutralisierung lief gegen **10:02 Uhr türkischer Zeit** (09:02 Berlin, 07:02 UTC) genau einmal, nach getrennt erteilter Freigabe A (Trockenlauf) und Freigabe B (scharfer Lauf). **`endgueltig_fehler = 0`** — der aktuelle Datenbankfehler ist bereinigt, keine verwaiste Outbox-Zeile, keine fremde Zeile verändert. Der **historische rote Cron-Beleg bleibt erhalten**. Die regulären Motorläufe danach waren durchweg `success` (rein lesend, 25./26.08.); der Gesundheitsbot meldete am 26.08. dennoch „Gestört" — ein Meldefehler, kein Motorbefund (§16). Belege: Runbook §31.10.
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
| Punkt 26/27 (E2E Berlin/Brandenburg) | 26B blockiert durch Punkt 14, 27B durch Punkt 15; 27A-2-Messung offen |
| Punkt 29 Fehlervertrag | 29B offen |
| Mail (#204/#205) | Mailpit-Bestätigungslauf; Production-Aktivierung freigabepflichtig |
| Kalender-Machbarkeit 1 (#209) | vor Ausbau zuerst die Rechtsfrage ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline |
| Quellen-Seed-Einspielung | nur noch Betreiberfreigabe |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe und Fachfrage |
| Gesundheitsbot-Folgepunkt | Watchdog-Vorprüfung findet seit Aktivierung keine Altquittungen (Runbook §30.7) |

## 9 · Ausstehende Production-Nachweise

- **OP-25**: drittes Fenster BESTANDEN (2026-08-07/08); Geltung nur aktuelle Architektur mit 5 Mandaten — nach Stufenaktivierung vollständige Wiederholung. OP-14 offen.
- **OP-31**: BESTANDEN (Morgenlauf 2026-08-11), Kopfstatus/UI nicht live abgerufen.
- **F-E2E** (nichtdeterministische E2E-Rangfolge im CI) — Ursache offen; PR #224 (Draft) nicht abgenommen.
- **29B** — wartet auf natürlich auftretende Fehlerzustände (künstliche Fehler verboten).
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen.
- **Selbstweck (neu, 24.08.):** **bleibt deaktiviert** und wurde in Production **nie ausgeführt**. Offen: (a) Preview-Beleg zum 3-s-Abbruch — **blockiert**, solange die Datenisolierung der Vorschau nicht belegt ist (Zielarchitektur §27.3.1), (b) das 7-Tage-Fenster, (c) Messung der zusätzlichen Vercel-Kosten. Bis dahin ist der Ereignis-Antrieb **nicht aktivierungsbereit** (Runbook §31.5).

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung 2026-08-05).

- **F-1** Tenant-JWT-Selbstsignierung/RLS: dauerhaft stillgelegt; Trennung App-seitig.
- **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: in Production gescheitert; `understanding-recovery.yml` **nie ausführen** (`CLAUDE.md` §5).
- **F-4** „Quellenbasis zu dünn": Fehlbefund.
- **F-5** Feste Referenzzahl „145 Quellen": verworfen; gültig ist `Telemetriezeilen = distinct source_id` (B3).
- **OP-25 Anlauf 1 + Fenster 1/2**: gescheitert (Werkzeug-/Vertragsfehler, E3); Fenster-Untergrenze 2026-08-04 bleibt verbindlich.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts (falsche `runId`-Konvention, eine Profilwahrheit, feste Slot-Annahmen in Fixtures).

## 11 · Nächster empfohlener Schritt

1. **Gründerentscheidung zur Skalierung** (Entscheidungsvorlage, §6): KI-Deckel, AWS-Frage, Reihenfolge 10 → 25.
2. **Selbstweck-Vorlauf entscheiden:** die fünf Werte setzen (Betreiberaktion), Vorprüfung `/api/ops/jobqueue` → `ereignisbetrieb.bereit === true`, danach den **siebentägigen Nachweis** mit 5 Mandaten führen (Quittungen `warteschlange-*`, Briefings 5/5; bei Verletzung einer §28.6-Grenze gilt der dokumentierte Rückweg). Empfohlen davor: der kleinste Preview-Versuch zum 3-s-Abbruch (Zielarchitektur §27.3).
3. **Rückkehr zu den P0-Verkaufsblockern OP-01…OP-04.**
4. **Betreiberprüfung Doppelkanal** (OP-07, §7 Punkt 9) vor jedem Kanalschritt.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. In Production offen sind `20260720` und F9 (`20260825101500`); Z22 samt Vorwärtskorrektur ist seit 29.08. angewendet und wird **nicht erneut angewendet** (§18). Der isolierte Testprojektbeleg erteilt keine Production-Freigabe.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 neuen Profile wird ohne gesonderte Freigabe importiert oder aktiviert**.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-30 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-30: Aktivierungs-Runbook, Versuch 5, §30.7-Abschluss | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| Skalierung 25/50/100: Abflussplätze, Modelllinien, Deckelsemantik, Indexnachweis | [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) |
| Skalierungsrechnung (KI-Bedarf/Kosten je Mandatszahl) | [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) · Modellvergleich in `skalierung-25-50-100.md` §2c |
| OP-30: Kapazität Morgenlage, Stufenplan 5→200 | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) |
| Profil-Importvertrag (20-Profile-Paket) | [`betrieb/op30-profilvertrag-200-mandate.md`](betrieb/op30-profilvertrag-200-mandate.md) |
| Entscheidungsvorlage Skalierung 10/25 | [`betrieb/entscheidungsvorlage-skalierung-2026-08-24.md`](betrieb/entscheidungsvorlage-skalierung-2026-08-24.md) |
| OP-25: Ursachen, Korrekturen, Nachweisvertrag | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7 |
| Cron-Fairness, F-CAS, F-POS, Watchdog-Verzug | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Berlin-Aktivierung/-Rollback | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Seed-Einspielung (blockiert) | [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) |
| Env-/Secret-Inventar, Cloud-Zugangsgrenzen | [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| OP-31: Frischevertrag | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) |
| OP-30 CAS: Verstehensvertrag | [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md) |
| Paket-Inventur (B-3/B-4 Personensuchen) | [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) |
| Watchdog-Korrektur 26.08. (Slotlogik, Briefingstufen, Skalierung) | [`betrieb/watchdog-korrektur-2026-08-26.md`](betrieb/watchdog-korrektur-2026-08-26.md) |
| Production-Beweise | [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) |
| Vollstände vor den Verdichtungen (24.08./17.08./05.08.) | [`archive/project_state/`](archive/project_state/) (Index: [`archive/README.md`](archive/README.md)) |

## 14 · Sprint 24./25.08. — Härtungssprint Selbstweck

**Erfolgreich abgeschlossen**, PR #269 gemergt. Vollständig: Runbook §31. Kernpunkte: **`bereit` heißt Konfigurationsbereitschaft, nicht Zustellung** (`/api/ops/jobqueue`, Feld `ereignisbetrieb`; Nachweis `selbstweck-ende-zu-ende-test.js`, 31 PASS) · der 3-s-Abbruch bleibt ungeprüft, ein Vorschauversuch ist ohne belegte Datenisolierung verboten · aus zwei Production-Testzeilen folgte dauerhaft `CLAUDE.md` §6: **jeder** Testlauf über `scripts/lokal.js`.

## 15 · Sprint 25.08. — Skalierung 25/50/100 (Korrekturrunden 4 und 5)

**Teilweise abgeschlossen**, **PR #270 am 26.08. gemergt**. Technische Vorbereitung, synthetischer Lastnachweis und dreizehn korrigierte Widersprüche sind erbracht; der realistische Nachweis (Z3) und jede Aktivierung bleiben offen und freigabepflichtig. Kanonisch mit allen Zahlen: [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) (§0.2/§0.3). Deckel, 7-Tage-Nachweis und Abflusszahl stehen in §6 und §7 — hier nur, was dort nicht steht:

- **Anlage und Aktivierung sind technisch getrennt:** der Stapel legt ausschließlich **inaktiv** an, ein Aktivierungswunsch wird **abgelehnt statt umgedeutet**. **Kein Aktivierungspfad gebaut.**
- `/api/cron/lage-briefing` (05:45) läuft bei ausgeschalteter Narrativwarteschlange über seinen **Direktpfad** weiter, ist aber typgebunden (`tenant_narrative`) und damit **kein** allgemeiner Abfluss.
- **Indexfrage entschieden:** nicht der Index fehlt, sondern die **Form** der Abfrage sperrt einen vorhandenen Index aus. **Kein Index, F9 unverändert und nicht angewendet.** Die 500-MB-Free-Grenze reißt vorher (2,70 MB/Tag, 160 MB belegt); Ursache ist die fehlende Aufbewahrung (R5).
- **Datenbanknachweis übertragbar:** die Lasttests liefen zusätzlich gegen eine lokale PostgreSQL **17.6** (Production-Hauptversion) — gleicher Plan, gleicher Faktor, gleiche 18 MB.

## 16 · Sprint 26.08. — Watchdog: Slotlogik, Briefingstufen, Skalierung

**Erfolgreich abgeschlossen und gemergt (PR #271).** Merge = Deployment ist erfolgt; offen bleibt nur der reguläre 06:00-Nachweis. Alle Zahlen und Befunde: [`betrieb/watchdog-korrektur-2026-08-26.md`](betrieb/watchdog-korrektur-2026-08-26.md). Zwei Punkte mit Folgewirkung: **`partial` heißt nie „Slot fehlt"** (ohne die Korrektur bis zu 24 h Fehlalarm), und der offene Produktbefund **5 von 5 Briefings personalisiert, aber nur 1 von 5 mit registriertem Push-Empfänger** — `delivered` heißt Annahme durch den Push-Dienst, nie „zugestellt".

## 17 · Sprint 26.08. — Realistiknachweis Z3a für 25/50/100

**Teilweise abgeschlossen** — der realistische Nachweis ist **als Z3a erbracht und als Z3 offen**. PR #272 ist als Merge `0ddb73e9` in `main`. Alle Zahlen, Messreihen und Kriterien: [`betrieb/z3-realistiknachweis-2026-08-26.md`](betrieb/z3-realistiknachweis-2026-08-26.md). Nur das Entscheidungsrelevante hier:

- **Was Z3a belegt:** echte Fachhandler, Datenbank über HTTP → PostgREST → PostgreSQL 17.6, echtes Netz, echte Modellaufrufe, Cron-Slots. Über vier Stufen (5/25/50/100 Mandate) **92 Korrektheitskriterien erfüllt, 0 nicht erfüllt**, 0 Transportfehler, 0 Konflikte; langsamster Slot 216 s von 290 s.
- **Was Z3a NICHT belegt:** die Anbieter sind lokal — weder Google noch Azure antwortet, der Google-Sonderweg bleibt ungeprüft. Das ist **Z3b** und bleibt offen.
- **Kapazitätsbefund:** die Tagesarbeit floss auf allen vier Stufen in den drei regulären Slots ab. Die eigentliche Grenze ist der **ungedeckelte KI-Bedarf** — rund 89/208/311/369 Aufrufe je Betriebstag gegen einen heutigen Deckel von 100.
- **Sicherheitslücke geschlossen:** `scripts/lokal.js` räumte `AZURE_OPENAI_KEY`/`_ENDPOINT` nicht aus der Kindprozess-Umgebung. Behoben, mit Laufzeit-Gegenprobe.
- **Preisbasis unverändert offen (F7):** alle Beträge sind berechnet, keine Rechnungsbeträge; die Azure-Preisseite ist aus Cloud-Sitzungen gesperrt.

## 18 · Z22: Befund, Pflichtbeleg und Production-Abschluss

**Erfolgreich abgeschlossen (29.08.).** Alle Zahlen, Prüfsummen und Buchungen: [`betrieb/z3-realistiknachweis-2026-08-26.md`](betrieb/z3-realistiknachweis-2026-08-26.md) §13–§14.

- **Ursache und Korrektur:** `helmut_jobs_offen` zählte persönliche Abrufe und Projektionen mandatsblind. Z22 ergänzt `p_mandat`; unbrauchbare Parameter- oder Zeilenkennung gilt sicher als globale Arbeit.
- **Production-Anwendung 29.08.** mit ausdrücklicher Betreiberfreigabe auf `ddckuvvpcytqbyfmbvie`: Basis `20260826190000` unter Buchung `20260829175642`, Vorwärtskorrektur `20260829123132` unter `20260829175749`. Nachprüfung grün (5 von 5 Mandaten gegen die direkte SQL-Erwartung, 0 Abweichungen); keine Auftragsdaten verändert. **Z22 nicht erneut anwenden.**
- **Beweisebenen:** lokal, im Pflicht-CI, isoliert gegen Supabase und **in Production** bewiesen — als Funktions- und Plattformzustand. Ein neuer **Mandatsnachweis** entstand nicht: Production bleibt bei fünf realen Mandaten.
- **Offen:** §11 (echter PostgREST-Rückfallnachweis), die übrigen still überspringenden Datenbanksuiten, Z3b und Azure.

## 19 · Sprint 31.08. — Understanding-Laufmeldung: roter Befund vom 30.08. lokal behoben

**Erfolgreich abgeschlossen (Nachtrag 31.08.): PR #283 ist am 31.08. 07:14 UTC gemergt und als `0f900e68` in Production deployt (`READY`).** Vollständiger Befund mit allen Zahlen: [`betrieb/understanding-telemetrie-korrektur-2026-08-31.md`](betrieb/understanding-telemetrie-korrektur-2026-08-31.md). Offen bleibt nur der natürliche Production-Nachweis der ehrlichen Zähler (erster Lauf auf dem neuen Commit: 31.08. 21:30 UTC).

Kernpunkte (Details ausschließlich im Beleg): `lauf-bilanz.js` als **eine** kanonische Zähler-/Statusableitung (Fehlerklassen `zaehlerwiderspruch`/`telemetrie-unvollstaendig`; `Number(null)` ist nie mehr eine gemessene 0) · der 30.08.-Lauf heißt korrekt `partial · 18/0/1/32` (18+0+1+32 = 51 = `cluster`) · Parser (PR #274) und Restzeitwache unverändert — 217,5 s ist **keine** Laufzeitgrenze (K9-Tages-p95 aus ungemergtem PR #282) · U+0000-Fall (22P05) durch `cleanEntry`-Härtung geschlossen · Suite `lauf-bilanz-test.js` 149 PASS / 0 FAIL. **Offen:** beide `unbekannt`-Vorgänge (Betreiberentscheidung). Der Kapazitätsbefund ist an §20 übergeben (die frühere Kurzzuschreibung „Obergrenze ist der KI-Tagesdeckel" war unvollständig — primär band die Slot-Laufzeit).

## 20 · Sprint 31.08. — Kapazitätssprint Understanding: Diagnose und Rückstandsschleife

**Teilweise abgeschlossen** (Code + Beleg fertig, Merge/Production-Nachweis ausstehend). Vollständig mit allen Messreihen: [`betrieb/understanding-kapazitaet-2026-08-31.md`](betrieb/understanding-kapazitaet-2026-08-31.md). Production ausschließlich lesend vermessen (31.08.):

- **Frisch belegt:** Rückstand **9 080** pending (8 895 > 24 h, ältester 02.07.), Ankunft Ø **307**/Tag (24.–30.08.; Max 469) gegen Abfluss Ø **68**/Tag ⇒ Defizit Ø −239/Tag. Abfluss fast nur < 24 h alt (>7 Tage: 1–5/Tag) — **Verhungern alter Vorgänge bewiesen**. Nur Ø **91**/Tag der Ankunft sind laut Gate-Schatten „verstehen"-würdig; **55 % der Aufrufe gingen an nicht gate-würdige Vorgänge**.
- **Primärer Engpass: Slot-Laufzeit, nicht der Deckel.** 2 Slots × ~220 s ÷ 11,5 s seriell ≈ 38 + Queue-Verstehensphase ~29 + Lage ~5 ≈ 72 Aufrufe/Tag; der Deckel 100 band nur an 4 von 47 Tagen (Ø ~19 Aufrufe/Tag ungenutzt). Sekundär: Auswahl `updated_at.desc` mit Fenster 50 (Verhungern) und danach der Deckel selbst.
- **Korrektur (dieser Sprint, Motor unverändert):** Rückstandsschleife `/api/cron/understanding-rueckstand` (11:30/17:30 UTC), Auswahl **älteste zuerst**, Buchung **nicht priorisiert** (Deckel−Reserve, atomar wie bisher), Laufdeckel 20 + Budget-Boden 30 fail-closed (`lib/helmut/verstehen-rueckstand.js`), Gesundheitsbericht überwacht die Slots selbstverankert. Erwartung bei Deckel 100: Abfluss ~84–98/Tag + garantierte Altbestand-Bedienung; **Gesamtstabilität erfordert zusätzlich Betreiberentscheidungen** (Deckel 200 und/oder Gate scharf — Zahlen im Beleg §8; Deckel-Erhöhung allein wäre wirkungslos).
- **Tests (alle über `scripts/lokal.js`):** neue Suite `verstehen-rueckstand-test.js` **56 PASS / 0 FAIL** (16 Pflichtprüfungen); nachgeführte Vertragstests grün (cron-fairness 285/0, scalable-pipeline-flag 52/0, warteschlangen-abfluss 32/0); **Offline-Gesamtlauf 285/287** (rot nur die zwei bekannten npm-Fehlstände `ical.js`/`@aws-sdk/client-sqs`, Altbestand §19).
- **Offen:** Merge (Betreiber), erste natürliche Rückstandsläufe, Betreiberentscheidungen Deckel/Gate/OP-06 (1 769 nicht verarbeitbare Altfälle), Siebentagenachweis weiterhin nicht begonnen.
