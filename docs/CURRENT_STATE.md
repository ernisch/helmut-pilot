# CURRENT STATE — Helmut

**Stand: 2026-08-25 — zuletzt aktualisiert in der Korrekturrunde 4 des Skalierungssprints 25/50/100 (§15).** Vollständige
Fassung vor dieser Verdichtung: byte-identisch in [`archive/project_state/2026_08_24_CURRENT_STATE_full.md`](archive/project_state/2026_08_24_CURRENT_STATE_full.md). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage in sechs Sätzen:** Der neue Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit dem 23.08.2026 in Production eingeschaltet** (Vollbeleg Runbook §30.7). Die **fünf bestehenden Mandate sind mit 376 echten Abschlüssen bewiesen**; **Morgenlauf 5/5 und Lagelauf effektiv 5/5** aller aktiven Mandate waren erfolgreich. Der **R4-/GitHub-Actions-Watchdog-Nachweis ist grün**. Es gab **keine Doppelarbeit, keine verlorenen Aufträge, keine endgültigen Fehler, 0 `unbekannt`, 0 Lease-Probleme und 0 Fencing-Konflikte**; alle elf §28.6-Kontrollen sind erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). Der Modus ist weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb; kein Ereignis-Antrieb, kein AWS). **Der Selbstweck ist seit 24.08. lokal Ende-zu-Ende belegt, aber in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main` = `24a895ed` = Merge von PR #269** (Härtung Selbstweck; gemergt 25.08. um **10:40:46 türkischer Zeit** / 09:40:46 Berlin / 07:40:46 UTC). Production-Deployment `dpl_4CqtdNj7dryJEUb2fu8V1z2132De` ist **READY** auf genau diesem Commit (rein lesend gegengeprüft, 25.08.). Die frühere Angabe „`main` = `572f5663` = PR #267" ist damit **überholt**; PR #267 steckt in dieser Historie.
- **Offen ist genau ein Pull Request: PR #270** (Skalierung 25/50/100, Branch `claude/helmut-scale-25-50-100-t6fcj6`, §15). **Nicht gemergt** — Merge = Production-Deployment und Betreiberentscheidung.
- Davor gemergt: #265, #262, #261, #260/#259/#256/#257, #225, #216; die PR-Bereinigung vom 23.08. (inkl. begründeter Schließungen) ist in Archivfassung und Runbook dokumentiert.
- Merge nach `main` löst automatisch ein Production-Deployment aus.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01). Vollsicherung (40/40) und isolierter Restore seit 2026-07-28 geübt; RPO ≤ 24 h.
- **Mandate:** aktiv sind **5** (Signatur `m5-9aee228dbf2c9f13`, K2-Gate ohne Widerspruch); insgesamt 9 Profile, 4 deaktiviert (`angela-merkel`, `james-brown`, `max-mustermann`, `helmut-abnahme-berlin`; OP-04-Rest); 0 Testmandate.
- **Aufbewahrung Crawl-Läufe:** `HELMUT_CRAWL_RUN_RETENTION=36` (Mindestbedarf n=5: 30).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146 von 163 Wegen Google-News** (Klumpenrisiko B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT).
- **Crons (Production):** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 · lage-check 10:00 UTC · 2 Narrativ-Nachlaufslots 06:10/06:22, inert). Dazu der GitHub-Actions-Watchdog (`briefing-watchdog.yml`, täglich 05:30 UTC, oft 2–3 h verzögert).
- **Migrationen:** OP-30-Dateien seit 15.08. angewendet; `20260823043633` seit 23.08. installiert (Doppelbuchung dokumentiert, Runbook §30.6). **Offen ist nur `20260720`** (OP-03); Anwendung freigabepflichtig.
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
| LLM-Tagesbudget: **Gesamtdeckel 100**, davon 30 für Verstehen reserviert (nicht priorisiert: max. 70) | fail-closed, live; **reicht ab 25 Mandaten nicht** (§7) |
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
3. **KI-Tagesdeckel**: der **Gesamtdeckel 100** (davon 30 für das Verstehen reserviert ⇒ höchstens 70 für alles andere — **nicht** 130; fehlt die Variable, greift laut Code das Schutzlimit **50**) reicht **ab 50 Mandaten in beiden Modelllinien** nicht; **für 25 ist die Antwort modellabhängig und offen** (Semantik [`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); Modellvergleich [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) §2c). Der in Production gesetzte Wert ist aus einer Claude-Sitzung nicht nachprüfbar.
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
9. **Zwei Testzeilen in Production — ERLEDIGT (25.08.).** Auftrag `371707a4…` und Outbox-Zeile `24ba14ec…` sind **entfernt**; die Neutralisierung lief gegen **10:02 Uhr türkischer Zeit** (09:02 Berlin, 07:02 UTC) genau einmal, nach getrennt erteilter Freigabe A (Trockenlauf) und Freigabe B (scharfer Lauf). **`endgueltig_fehler = 0`** — der aktuelle Datenbankfehler ist bereinigt, keine verwaiste Outbox-Zeile, keine fremde Zeile verändert. Der **historische rote Cron-Beleg bleibt erhalten**; ein späterer regulärer grüner Lauf ist **noch nicht beobachtet** und wird nicht behauptet. Belege: Runbook §31.10.
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

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung, keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe. Migration: offen ist nur `20260720`, Anwendung freigabepflichtig.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; **keines der 20 neuen Profile wird ohne gesonderte Freigabe importiert oder aktiviert**.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls); `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-30 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-30: Aktivierungs-Runbook, Versuch 5, §30.7-Abschluss | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| OP-30: Kapazität Morgenlage, Stufenplan 5→200 | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) |
| Skalierung 25/50/100: Abflussplätze, Modelllinien, Deckelsemantik, Indexnachweis | [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) |
| Skalierungsrechnung (KI-Bedarf/Kosten je Mandatszahl) | [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) · `scripts/skalierungsmodell.js` (eine von **drei** Modelllinien, Vergleich in `skalierung-25-50-100.md` §2c) |
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
| Production-Beweise | [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) |
| Vollstände vor den Verdichtungen (24.08./17.08./05.08.) | [`archive/project_state/`](archive/project_state/) (Index: [`archive/README.md`](archive/README.md)) |

## 14 · Vorletzter Sprint (24./25.08. — Härtungssprint Selbstweck)

**Sprintzustand: erfolgreich abgeschlossen.** Branch `claude/helmut-selbstweck-hardening-t7lsbx`, **PR #269 seit 25.08. gemergt** (nicht vom Sprint selbst). Ausgangscommit `572f5663`; Code-/Teststand `ce5c189`, Dokumentationsabschluss `62fb1a4`. Vollständiger Bericht: Runbook §31 ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)) — hier nur, was heute noch entscheidungsrelevant ist.

- **Kein falsches Grün mehr:** `job-dispatch.aktivierungsVorpruefung` trennt angeforderten und wirksamen Modus, Antrieb, Transport, Verfügbarkeit, Grund und Bereitschaft; `/api/ops/jobqueue` gibt sie als Feld `ereignisbetrieb` aus. **`bereit` heißt Konfigurationsbereitschaft, nicht erfolgreiche Zustellung** (kein Netzaufruf; Lesart im Feld `bereitBedeutung`). Der Aktivierungsvorlauf scheitert vollständig geschlossen: fehlen Klassengrenzen, Motor, Weckziel, Freigabe oder Queue-Adresse ⇒ keine Vergabe, kein Versuch, keine Verbuchung.
- **Nachweis:** `scripts/selbstweck-ende-zu-ende-test.js` (**31 PASS**) — echte Route, Autorisierung, Transport, Dispatcher, Workerbetrieb, Fachhandler; ersetzt sind nur Datenbank, Netzgrenze und externer Abruf.
- **3 s gegen 60 s: empirisch ungeprüft.** Belegt ist nur, dass die Abbruch*unterstützung* auf Vercel ein Opt-in ist (`supportsCancellation`), das Helmut nicht setzt. Ein Vorschauversuch ist ohne belegte Datenisolierung **verboten** — sieben Vorbedingungen, heute nicht erfüllt (Zielarchitektur §27.3.1).
- **Dokumentwahrheit berichtigt:** AWS ist für den Fünfernachweis **nicht** notwendig · **fünf** statt drei Umgebungswerte · Budgetsemantik (Reserve ist Anteil, nicht Zuschlag) · `service_role`-Risiko der AWS-Vorlage · zwei KMS-Schlüssel 2/4/6 USD/Monat.
- **Zwei Testzeilen in Production (Ursache: Handlauf ohne `scripts/lokal.js`) sind am 25.08. neutralisiert** — getrennte Freigaben A/B, genau ein scharfer Lauf, Nachprüfung und unabhängige Gegenprüfung grün, `endgueltig_fehler = 0` (§7 Punkt 9; Runbook §31.6–§31.10). Der **historische rote Cron-Beleg bleibt unverändert**; ein regulärer grüner Lauf ist **noch nicht beobachtet**. Daraus folgte die verschärfte Regel `CLAUDE.md` §6 (jeder Testlauf über `scripts/lokal.js`).
- **Unverändert:** Production, Schema, Vercel-Konfiguration, Flags, Crons, AWS, Profile, KI-Budget. **Der Selbstweck bleibt deaktiviert** und wurde in Production nie ausgeführt.

## 15 · Letzter Sprint (25.08. — Skalierung 25/50/100, Korrekturrunde 4)

**Sprintzustand: teilweise abgeschlossen.** Technische Vorbereitung, synthetischer Lastnachweis und die Korrektur von sieben bestätigten Widersprüchen sind erbracht; der realistische Nachweis (Z3) und jede Aktivierung bleiben offen und freigabepflichtig. Branch `claude/helmut-scale-25-50-100-t6fcj6`, **PR #270 (offen, nicht gemergt)**, Ausgangscommit `24a895ed`. **Keine Production-Änderung.**

**Status (verbindlich):** Werkzeuge und Änderungssatz **lokal vollständig belegt** · synthetischer Motorlasttest 25/50/100 **bestanden** · **Z1 weiterhin teilweise/offen** · **Z3/Z4/Z5 nicht erreicht, keine Production-Freigabe**. Kanonische Doku: [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md) (§0.2 = Liste aller Korrekturen).

- **Abflussplätze berichtigt:** es gibt **drei reguläre Warteschlangenabflüsse/Tag** (crawl 04:00, pipeline 16:00, crawl 20:00 UTC) — nicht elf. Die 11 war die Zahl der Cron-**Einträge**. Der GitHub-Watchdog ist ein **bedingter Ersatzlauf** und zählt nicht als Kapazität. Testgesichert: `warteschlangen-abfluss-test.js` (§2a).
- **KI-Deckelsemantik berichtigt:** das Tageslimit ist die **Gesamtobergrenze**; die Reserve wird darin freigehalten, **nicht addiert**. Bei 100/30 gilt: gesamt **100**, priorisiert bis 100, nicht priorisiert höchstens **70** — **nie 130**. Fehlt die Variable, greift laut Code das Schutzlimit **50**. Der in Production gesetzte Wert ist aus einer Claude-Sitzung **nicht nachprüfbar** (Vercel-Env; die DB speichert nur den Verbrauch) — 100/30 ist **dokumentiert**, nicht verifiziert. `kapazitaetsmodell-test.js` §B0.
- **Anlage und Aktivierung sind jetzt technisch getrennt:** der Stapelpfad legte Mandate **aktiv** an und umging damit die Freigabe. Jetzt: kein stiller Vorgabewert (`buildProfile`/`provisionTenant` **werfen** ohne ausdrücklichen Zustand), der Stapel legt ausschließlich **inaktiv** an (Profil `profileActive: false`, Konto gesperrt), ein Aktivierungswunsch wird **abgelehnt statt umgedeutet**, ein bestehendes Mandat behält seinen Zustand in **beiden** Richtungen, die Vorschau nennt den Zielzustand und schlägt bei Unbestimmtheit geschlossen fehl. **Kein Aktivierungspfad gebaut.** (§4.5a)
- **Indexfrage lokal entschieden — und dabei ein besserer Hebel gefunden:** `helmut_job_ankunft` liest immer die **ganze** Tabelle (7 d 19 ms · 90 d 356 ms · 1 Jahr 1,5 s bei 2287 Aufträgen/Tag, echte PostgreSQL 16, Nutzlast auf die gemessenen 821 Byte geeicht). Nicht der Index fehlt: die **Form** der Abfrage (CTE-Join statt fester Zeitgrenze) sperrt einen **bereits vorhandenen** Index aus (`helmut_jobs_bereinigung_idx` deckt die Abflusshälfte, Faktor 15 — außerhalb der Funktion). Inline gerechnet: Faktor 2,5 bei **0 MB**; ein `created_at`-Index: derselbe Faktor bei **18 MB**. **Kein Index, F9 unverändert;** der Formfix ist als **F10** dokumentiert, aber bewusst nicht gezogen. Die 500-MB-Free-Grenze reißt ohnehin vorher (**2,70 MB/Tag**; heute 160 MB belegt); Ursache ist die fehlende Aufbewahrung (R5). **Selbst gefunden und behoben:** die erste Messung lief gegen ein Teilschema (7 statt 10 Indizes) und hätte den Indexbedarf überschätzt. (§4.9)
- **Zurückgenommen:** zu weite Aussagen zu Datenbankverbindungen (§4.3a) · der Alleinvertretungsanspruch von `scripts/skalierungsmodell.js` — es gibt **drei** Modelllinien, jetzt mit Zweck und Grenze nebeneinander (§2c) · die Zahlen 8/12/20 Läufe sind eine **Hochrechnung**, kein bewiesener Bedarf (§2).
- **Widerlegt:** die 20 BE/BB-Profile haben keine offene „Zweitquellenanforderung" — die Zweitquelle wurde in Lauf 4 bewusst als doppelte Beweislogik entfernt; die echte Lücke ist die **Quellenversorgung** (Landesmodule gesperrt, Seeds nicht eingespielt). Eine Liste von „80 weiteren Kandidaten" existiert im Repository **nicht**. (§8.0)
- **Ungelöst und entscheidungsrelevant:** ob der Deckel 100 die Stufe **25** trägt, ist **modellabhängig** (Linie A: 88–265, Linie B: 113–336) und damit **nicht entschieden**. Ab **50** reißt er in beiden Linien. Vercel Pro erlaubt mit Fluid compute 300 s Standard / 800 s Maximum (1800 s Beta) — **Fluid Compute ist für dieses Projekt unbestätigt**, und der kleinste Cron-Abstand ist **10 Minuten**: Laufzeit und Cron-Plan sind eine gemeinsame Entscheidung (§6.1).
- **Tests:** Gesamtlauf **281/281 Suiten grün, 0 FAIL**. Mit echter lokaler PostgreSQL zusätzlich: Lasttest 60 PASS (2×), Ankunftskennzahl 30 PASS, Indexnachweis 36 PASS. Einzeln: `provision-stapel` **117**, `kapazitaetsmodell` **53**, `warteschlangen-abfluss` **20**.
- **Unverändert:** Production, Schema, Migrationen (F9 **nicht angewendet**), Vercel-Konfiguration, Flags, Crons, KI-Budget, Profile (keine importiert, keine aktiviert). Kein Merge, kein Deployment, kein manueller Cron-, Worker-, Watchdog- oder Gesundheitslauf.
