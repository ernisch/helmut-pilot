# CURRENT STATE — Helmut

**Stand: 2026-08-25 — zuletzt aktualisiert im Skalierungssprint 25/50/100 (§15).** Vollständige
Fassung vor dieser Verdichtung: byte-identisch in [`archive/project_state/2026_08_24_CURRENT_STATE_full.md`](archive/project_state/2026_08_24_CURRENT_STATE_full.md). Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

**Kernlage in sechs Sätzen:** Der neue Warteschlangenmotor (`HELMUT_SCALABLE_PIPELINE=on`) ist **seit dem 23.08.2026 in Production eingeschaltet** (Vollbeleg Runbook §30.7). Die **fünf bestehenden Mandate sind mit 376 echten Abschlüssen bewiesen**; **Morgenlauf 5/5 und Lagelauf effektiv 5/5** aller aktiven Mandate waren erfolgreich. Der **R4-/GitHub-Actions-Watchdog-Nachweis ist grün**. Es gab **keine Doppelarbeit, keine verlorenen Aufträge, keine endgültigen Fehler, 0 `unbekannt`, 0 Lease-Probleme und 0 Fencing-Konflikte**; alle elf §28.6-Kontrollen sind erfüllt ([`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7). Der Modus ist weiterhin **`HELMUT_JOB_DISPATCH_MODE=shadow`** (Cron-Antrieb; kein Ereignis-Antrieb, kein AWS). **Der Selbstweck ist seit 24.08. lokal Ende-zu-Ende belegt, aber in Production nie ausgeführt** (§14).

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. Verbindliche OP-Liste: [`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

- **`main` = `24a895ed` = Merge von PR #269** (Härtung Selbstweck; gemergt 25.08. um **10:40:46 türkischer Zeit** / 09:40:46 Berlin / 07:40:46 UTC). Production-Deployment `dpl_4CqtdNj7dryJEUb2fu8V1z2132De` ist **READY** auf genau diesem Commit (rein lesend gegengeprüft, 25.08.). Die frühere Angabe „`main` = `572f5663` = PR #267" ist damit **überholt**; PR #267 steckt in dieser Historie.
- **Offen ist derzeit kein Pull Request** (Stand 25.08. nach dem Merge von #269). Der Skalierungssprint arbeitet auf `claude/helmut-scale-25-50-100-t6fcj6` (§15).
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
3. **KI-Tagesdeckel**: der **Gesamtdeckel 100** (davon 30 für das Verstehen reserviert ⇒ höchstens 70 für alles andere — **nicht** 130) reicht ab 25 Mandaten auch im günstigen Fall nicht (Restliste OP-30-Vermerk; Semantik [`betrieb/llm-budget-reservierung.md`](betrieb/llm-budget-reservierung.md); Rechengrundlage `scripts/skalierungsmodell.js`).
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
8. **Lage-/KI-Kapazität für Skalierung:** siehe §6 (Deckel, 7-Tage-Nachweis, Stufenplan).
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
| Skalierungsrechnung (KI-Bedarf/Kosten je Mandatszahl) | [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) · `scripts/skalierungsmodell.js` |
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

## 14 · Letzter Sprint (24./25.08. — Härtungssprint Selbstweck)

**Sprintzustand: erfolgreich abgeschlossen** (Abnahme = lokale Härtung + Wahrheitskorrektur + abgeschlossene Neutralisierung; die *Aktivierung* war ausdrücklich nicht Sprintziel). Branch `claude/helmut-selbstweck-hardening-t7lsbx`, **PR #269 — seit 25.08. gemergt** (nicht vom Sprint selbst; Merge = Production-Deployment und Betreiberentscheidung). Ausgangscommit `572f5663`.

**Nachtrag 25.08.:** PR #269 ist inzwischen **gemergt**; die Arbeit dieses Sprints liegt seither auf `main` (`24a895ed`) und ist deployt. Die frühere Lesart „`main` bleibt `572f5663`, der PR-Kopf ist ein Zweigstand" galt nur bis zum Merge. Code- und Teststand des Sprints: `ce5c189`; Dokumentationsabschluss der Neutralisierung: `62fb1a4` (Runbook §31.10).

- **Kein falsches Grün mehr:** `job-dispatch.aktivierungsVorpruefung` trennt angeforderten Modus, wirksamen Modus, Antrieb, gewählten Transport, dessen Verfügbarkeit, Grund und Bereitschaft; `/api/ops/jobqueue` gibt sie als **neues** Feld `ereignisbetrieb` aus (alle Bestandsfelder unverändert). Neun Zustände einzeln testgesichert; ohne Secrets/Adressen/Hostnamen.
- **`bereit` heißt Konfigurationsbereitschaft, nicht erfolgreiche Zustellung** (geschärft 24.08./2). Die Vorprüfung macht keinen Netzaufruf; sie sagt nur, dass die Konfiguration für einen späteren echten Versuch vollständig und widerspruchsfrei ist — nicht, dass das Ziel erreichbar ist, das Secret wirkt oder je ein Weckruf ankam. Die Antwort trägt die Lesart im Feld `bereitBedeutung` mit.
- **Aktivierungsvorlauf scheitert vollständig geschlossen** (nachgebessert 24.08./2): im Queue-Modus entscheidet die **vollständige** Vorprüfung vor der ersten Outbox-Vergabe. Fehlen Klassengrenzen, Motor, Weckziel, Production-Freigabe oder Queue-Adresse ⇒ keine Vergabe, kein Versuch, kein Backoff, kein HTTP/SQS, keine Verbuchung. Schattenmodus unberührt; bereiter Ereignisbetrieb unverändert.
- **Neuer Nachweis:** `scripts/selbstweck-ende-zu-ende-test.js` (**31 PASS**) fährt die echte Route, Autorisierung, Transport, Dispatcher, Workerbetrieb und Fachhandler; ersetzt sind nur Datenbank, Netzgrenze und externer Abruf. Zehn Fälle inkl. 429, unbestätigter Zustellung, doppelter Zustellung, Handlerfehler, Schattenmodus-Rückweg.
- **3 s gegen 60 s: empirisch ungeprüft.** Belegt ist nur, dass die Abbruch*unterstützung* auf Vercel ein **Opt-in** ist (`supportsCancellation`), das Helmut nicht setzt (Wächtertest hält den Stand fest). **Nicht** belegt ist, dass eine Funktion ohne diese Einstellung weiterläuft. Ein **Vorschauversuch ist ohne belegte Datenisolierung verboten** — sieben Vorbedingungen, heute nicht erfüllt, deshalb **blockiert** (Zielarchitektur §27.3.1).
- **Dokumentwahrheit:** AWS ist für den Fünfernachweis **nicht** notwendig · **fünf** statt drei Umgebungswerte · Budgetsemantik (Reserve ist Anteil, nicht Zuschlag) · „Selbstweck kostet null" ersetzt · `service_role`-Risiko der AWS-Vorlage + `sb_secret_…` als Ausweg · zwei KMS-Schlüssel 2/4/6 USD/Monat je nach Rotation · veralteter Hauptcommit, Env-Inventar, Workerbetriebs-Zustand und Quellenangabe des 7-Tage-Nachweises berichtigt.
- **Störung (offen, Betreiberentscheidung):** ein Handlauf der Bestandssuite `jobdispatch-vertrag-test.js` **ohne** `scripts/lokal.js` erzeugte am 24.08. um 20:32 UTC **zwei Testzeilen in Production** (`helmut_jobs` `371707a4…`, `source_fetch` ohne `payload.quelle`, Status `wartend`; `helmut_job_outbox` `24ba14ec…`, `offen`). Wirkung: kein Modellaufruf, keine Inhalts-/Mandatsdaten — aber die Zeile kann `endgueltig_fehler` um 1 erhöhen und damit eine Watchdog-Kennzahl verfälschen. Sofortmaßnahme umgesetzt: die Suite entfernt die Production-Kennungen jetzt selbst. **Nichts gelöscht, nichts in Production verändert.** Rein lesender Zustand (24.08. 21:33 UTC), Wirkungsanalyse und Empfehlung; das frühere nackte Lösch-SQL gilt ausdrücklich **nicht** als freigabefertig: Runbook §31.6. **Fortgang 25.08.: die Wirkung ist eingetreten** — siehe unten.
- **Weg dorthin (25.08., verdichtet — Belege im Runbook §31.6.2/§31.7–§31.9):** Begriffskorrektur („aufgeben" ist für einen Auftrag falsch — der Generator **löscht**) · getrennter Einzeilenvertrag, der **nur** die zwei Kennungen trifft, ohne Zeitfenster · **drei Vertragsfassungen**, weil der reguläre Betrieb den Zustand zweimal weiterbewegte (`wartend/offen` → `fehlgeschlagen/bestaetigt` → `fehlgeschlagen/verzichtet`); **jeder Riegel hat dabei getan, was er soll** und einen Lauf gegen einen veralteten Vertrag verhindert · Datensparsamkeit **am Wert** · `updated_at` als allgemeiner Änderungsmelder (E4.12). Mengenverträge durchgehend **bytegleich** (SHA-256 `e8a55ee3…`), Nachweis zuletzt **65 PASS** gegen echte PostgreSQL 16.
- **Neutralisierung abgeschlossen (25.08.).** Nach **Freigabe A** lief der frische Production-Trockenlauf um **09:52:02 türkischer Zeit** (08:52:02 Berlin, 06:52:02 UTC) mit `TROCKENLAUF-OK` und vollständigem Rollback (SQL-SHA-256 `3d3acbbf…`). Nach **getrennt** erteilter **Freigabe B** entfernte **genau ein** scharfer Lauf gegen **10:02 türkischer Zeit** (09:02 Berlin, 07:02 UTC) **genau eine** Auftragszeile und **genau eine** zugehörige Outbox-Zeile über `helmut_job_outbox_job_id_fkey` (SQL-SHA-256 `4ba3a936…`; Bestand 1124 → 1123 bzw. 889 → 888). Textvergleich gegen den Trockenlauf: nur die sechs zulässigen Unterschiede, alle Riegel E0–E10b bytegleich.
- **Nachprüfung (25.08., 10:03:23 türkischer Zeit** / 09:03:23 Berlin / 07:03:23 UTC): Auftrag, Outbox und Verweise je **0**, **`endgueltig_fehler_gesamt = 0`**, keine verwaiste Outbox-Zeile, keine offene Transaktion, keine Sperre, keine vorbereitete Transaktion, keine zurückgelassene Temp-Tabelle. Unabhängige Gegenprüfung um **10:05:40 türkischer Zeit** (09:05:40 Berlin, 07:05:40 UTC) bestätigt: beide Zeilen fehlen, `endgueltig_fehler = 0`, 1123 Aufträge / 888 Outbox-Zeilen. **Ehrlich:** die temporäre Quittungszeile war nach dem Commit (`on commit drop`) nicht mehr abrufbar — ihre Werte folgen aus dem Commit und den Riegeln E8–E10b; **kein zweiter Lauf**. Der **historische rote Cron-Beleg bleibt unverändert**, kein manueller Gesundheitslauf ausgelöst, ein regulärer grüner Lauf **noch nicht beobachtet**.
- **Der Einzeilenvertrag bleibt unverändert als geprüftes Werkzeug im Repository.** Seine Zielzeilen existieren nicht mehr; ein erneuter Lauf müsste am Riegel E0 mit `ABBRUCH-BEREITS-NEUTRALISIERT` enden und würde nichts verändern — **ausgeführt wurde er nicht**. **Der Selbstweck bleibt deaktiviert** (in Production nie ausgeführt, **nicht** aktivierungsbereit); der **siebentägige Fünfernachweis wurde nicht gestartet**.
- **Unverändert:** Production, Supabase-Schema, Vercel-Konfiguration, Flags, Crons, AWS (nichts angelegt), Profile (keine aktiviert), KI-Budget. Kein Deployment, kein manueller Actions-Lauf.
- Vorheriger Sprint („Vorbereitung 25 Mandate", PR #267) ist **gemergt**; sein Bericht steht in der Archivfassung und in §6.

## 15 · Letzter Sprint (25.08. — Skalierung 25/50/100, rein vorbereitend)

**Sprintzustand: teilweise abgeschlossen.** Technische Vorbereitung und synthetischer Lastnachweis sind erbracht; der realistische Nachweis und jede Aktivierung bleiben offen und freigabepflichtig. Branch `claude/helmut-scale-25-50-100-t6fcj6`, Ausgangscommit `24a895ed`. **Keine Production-Änderung.**

**Fünf Zustände strikt getrennt** (Z1 vorbereitet · Z2 synthetisch getestet · Z3 realistisch getestet · Z4 freigegeben · Z5 real aktiv). Erreicht sind **Z1 und Z2 für 25/50/100**. **Z3, Z4, Z5 sind nicht erreicht** und werden nicht behauptet. Kanonische Doku: [`betrieb/skalierung-25-50-100.md`](betrieb/skalierung-25-50-100.md).

- **Kapazitätsmodell, an der Messung geeicht.** `source_fetch` ist über Mandate dedupliziert (`payload.beispielMandate`): gemessen **139 geteilte Quellen** + **6 mandatsspezifische je Mandat**, je 2×/Tag. Formel `(139 + 6·M)·2` liefert für M=5 **exakt die gemessenen 338**. Hochrechnung: **841 / 1323 / 2287** Aufträge je Tag bei 25 / 50 / 100. **Der Motor skaliert unterlinear** — 20× Mandate ergeben 5× Arbeit.
- **Synthetischer Lasttest bestanden: 60 PASS / 0 FAIL** über alle drei Stufen (`scripts/skalierung-stufen-lasttest.js`, echter Motor, echte lokale PostgreSQL, echte Workerprozesse, echtes Fehler- und langsames Mandat; **Attrappen** für KI und Netz). 0 hängende Leases, 0 Dubletten, 0 unerwartete endgültige Fehler, Rückstau vollständig abgebaut, Fairness min = max, Verbindungsspitze 5/300. **Das misst Warteschlange und Datenbank, nicht die Wirklichkeit** — Production ist ~2 300× langsamer (externe Abrufe).
- **Zwei echte Produktfehler in der Provisionierung behoben:** (a) ein Wiederholungslauf löschte nachträglich gepflegte Profilfelder (vollständig ersetzender Upsert) — jetzt verschmelzend; (b) ein Wiederholungslauf **reaktivierte still ein deaktiviertes Mandat** und umging damit die Aktivierungsfreigabe (`CLAUDE.md` §5) — jetzt fail-closed. Neu: **Stapelprovisionierung** mit Vorprüfung der ganzen Liste, Trockenlauf als Standard, ehrlicher Bilanz (`scripts/provision-stapel-test.js`, 42 PASS).
- **Die vier bekannten Testbefunde sind gelöst — reine Umgebungsfehler.** Ursache per Bisektion über 139 Umgebungsvariablen isoliert: `HELMUT_V3_STORE=1` (privacy-vollstaendigkeit, provision-tenant, tenant-neutrality) und `HELMUT_STORAGE_BACKEND=supabase` (profile-db). Beidseitig belegt; CI meldete an PR #269 unabhängig **277/277 grün**. `scripts/lokal.js` stellt die Speicherwahl jetzt deterministisch auf lokal — **keine Testzusicherung abgeschwächt**, keine Suite geändert (Wächter: `netzschutz-test.js` §15). Die Ursachenangabe in [`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) war in 3 von 4 Fällen falsch und ist dort korrigiert.
- **Härtester Blocker bleibt der KI-Tagesdeckel:** 100 Aufrufe/Tag tragen **keine** Stufe (25 Mandate brauchen schon im günstigsten Fall 113). Das ist **keine Kostenfrage** — 350 Aufrufe/Tag kosten unter 1,20 USD; Modellkosten liegen bei 25/50/100 realistisch bei **15 / 21 / 33 USD im Monat**. Anhebung ist eine Freigabeentscheidung.
- **Neu belegt:** Vercel-Tarif des Teams ist **Pro** (bisher nirgends dokumentiert). Damit ist `maxDuration = 300 s` eine **Konfiguration, keine Plattformgrenze** — ein bisher übersehener Hebel auf das Slotbudget ohne Architekturänderung.
- **Unverändert:** Production-Daten, Cron, Worker, Watchdog, Selbstweck (bleibt deaktiviert), Umgebungsvariablen, Budgets, Flags, Migrationen, Profile (keine importiert, keine aktiviert). Kein Deployment, kein manueller Actions-Lauf, der **historische rote Cron-Beleg unangetastet**.
