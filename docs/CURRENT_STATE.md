# CURRENT STATE — Helmut

**17.09.2026: PR419, PR420 und PR421 offen, Draft, ungemergt; alle drei GitHub CI Laeufe erfolgreich. Vierter Folgebranch behebt die belegte Kuerzung von Ersatztiteln. Kein Merge und keine Production Wirkung.**

Rein lesende Uebernahme bis 10:04 Tuerkei / 09:04 Berlin / 07:04 UTC: GitHub Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`; Vercel Production `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy` READY. Keine neuen Deployments am 17.09. im geprueften Zeitraum. Keine laufenden Actions. Zwei wartende CI Laeufe vom 06.08. gehoeren zu anderen alten Branches. Einziger offener PR bei Uebernahme: historischer Draft345. Keine entfernte Motorreparatur gefunden. Relevante Testbegleitungsautomationen pausiert; kein lokaler alter Arbeitsprozess sichtbar. Das beweist keinen globalen Work Sitzungsstatus; der Betreiber hat den alten Lauf vor Uebernahme gestoppt.

**Lokale Vorarbeit erhalten:** Der alte Branch `codex/motor-reparatur-20260916` hatte 40 veraenderte und 15 neue Dateien, ohne neuen Commit. Die Arbeitskopie bleibt unveraendert. Der neue Branch `codex/quellen-zeitvertrag-20260917` setzt nur den zusammenhaengenden Quellenzeitvertrag auf Main fort. Vorbereitete Cron, Versorgungs und Auswerterarbeiten sind nicht Bestandteil des ersten Sprints und nicht als abgenommen zu behandeln. [Ursache, Umfang, Tests und offene Arbeit](betrieb/quellen-zeitvertrag-2026-09-17.md).

**Zweiter Reparaturteil PR420:** Head `eb687a5c849cb0602a08035c2c4893c944a1d4ce`, Basis PR419 `eea7c24f4d9f3ed8bb2cd74d7eaab87043c34d8e`. Aktive Lagezielmenge, gleichberechtigte gespeicherte Rotation, bestaetigter Beginn und 500 Laufplaetze. JSON Zustandsversion3 muss bei spaeterem Rueckweg erhalten bleiben. GitHub CI35197748793 vollstaendig erfolgreich, am17.09. frisch nachgelesen. [Umfang und Grenzen](betrieb/lage-aktive-fortsetzung-2026-09-17.md).

**Dritter Reparaturteil:** Branch `codex/morgen-paketnachweis-20260917` baut auf PR420 auf. Der Morgenlauf speichert und bestaetigt sein Paket, ergaenzt beim spaeteren Aufruf vorhandene Lage und meldet fehlende Versorgung als partial. Quittung, Paketvollstaendigkeit und fachliche Abnahme bleiben getrennt. 18 neue Routengruppen und gezielte Regressionen erfolgreich. Kanonischer Gesamtlauf393/396; beide Browserumgebungsfehler und die veraltete Strukturpruefung gezielt geschlossen. Kein offener lokaler Testfehler. Finaler Commit und GitHub CI im zugehoerigen Draft PR. Kein neuer Cron oder Modellaufruf. [Ursache, Tests, Risiken und gesamte Reparaturrestliste](betrieb/morgen-paketnachweis-2026-09-17.md).

**Vierter Reparaturteil:** Branch `codex/titel-satzgrenze-20260917`, Basis PR421 `1129d9ad8b163ce1ccf16adc0a02d35fbcb96126`. Ersatztitel behalten den bereits vorhandenen ganzen ersten Satz statt einer Kuerzung bei90 Zeichen. Neue Suite8/8 erfolgreich. Privater Replay reproduziert22 Originaltitel;5 bestaetigte Abbrueche korrigiert,17 weitere Titel und alle anderen Vertragsfelder unveraendert. Gesamtlauf395/397 in649s; zwei fehlende lokale Abhaengigkeiten mit unveraendertem vorhandenem Paketbestand gezielt geschlossen (Kalender134/134, Paketbau43/43). Kein offener lokaler Testfehler. Zwischencommit `47bec11ba479229e4cd781388deaff638ddf1f96`; finaler Head und neue CI separat im zugehoerigen Draft PR. Keine Quellen oder Faktenabnahme. WELT Artikelvarianten und widerspruechliche Datumsangaben bleiben eigener Inhaltsblock. [Belege, Grenzen und Folgearbeit](betrieb/titel-satzgrenze-2026-09-17.md).

**Historischer Testabschluss laut erhaltenem Bericht vom 16.09.:** Test beendet, 497 Mandatsbriefings, 131 Morgenquittungen, 5 Lage Texte, nur zwei Profile mit allen drei Ergebnissen. Kein vollstaendiger 500er Fachnachweis. Die dortige Datenbankaufnahme von 21:03:43 Tuerkei / 20:03:43 Berlin / 18:03:43 UTC nennt 504 Profile, 0 aktiv, 0 aktive Sperren und Leases, aber 829 wartende Jobs. Diese Zahlen wurden in diesem Sprint nicht neu gegen Production erhoben. Inaktive Profile stoppen globale Quellenarbeit nicht automatisch. Aktuelle Freigabe erlaubt keine Profil oder Jobmutation. [Status vor Uebernahme auf Main](archive/project_state/2026_09_17_vor_quellen_zeitvertrag.md) ist historisch.

## 1 · Aktive Produktphase

Vorbereitung eines erneut ausdruecklich freizugebenden Nachweises mit exakt 500 ausgewaehlten Profilen. Der vorherige Test ist laut Betreiber und Abschlussbericht beendet. Implementierung, lokale Pruefung und Production Nachweis bleiben getrennt. Keine kleineren Ersatzkohorten. Fehlender Quellenkontext und fehlender sachlicher Profilbezug bleiben offene Befunde; Qualitaetswaechter werden nicht abgesenkt. Verkaufsreife und P0 Punkte folgen danach; [OP Liste](datenmotor-restliste.md).

## 2 · Stand auf `main` und Pull Requests

Historische PR- und Deploymentdetails bis09.09. stehen unverändert im [archivierten Status](archive/project_state/2026_09_14_CURRENT_STATE_vor_lesebelegabschluss.md). Der aktuelle Main- und Productionstand steht im Statuskopf.

## 3 · Production-Zustand

- **Datenbank:** Supabase **Pro/Micro (`t4g.micro`, 1 GB)**, gesund. Dashboard **08.09., 08:56 UTC: CPU 6 %, RAM 52 %, 11/60 Verbindungen**. SQL und volle Grundlinie nach dem Fachlauf unveraendert. PITR aus; keine Ressourcen oder Schemaaenderung.
- **Historischer Bestand 09.09., 08:37 UTC (neuer Abschluss oben):** **504/5/499**, fuenf reale aktiv, alle 495 synthetischen inaktiv. Testende Workflow `34327808319` erfolgreich: 495 bestaetigt deaktiviert, 0 Fehler. Keine aktive Sperre, Lease oder junge Prozessquittung beim Mergevorflug. **44 gespeicherte Lage Texte fuer den 500er Testtag, 456 fehlen.** [Einzelbefunde](betrieb/500-textpruefung-2026-09-09.json).
- **Crawl-Aufbewahrung:** Wirksame Grenze **36** am 06.09. um 19:00 UTC erneut bestätigt. Frisch gelesener Blob Ring **20**; keine Wiederherstellung der verlorenen 16 Laufzeilen. Schutzcode aus #301 bleibt deployt (SR §37).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen; **146/163 Google-News** (B1, OP-15); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht eingespielt**, Einspielung [BLOCKIERT](betrieb/quellen-seed-einspielung.md) (nur noch Betreiberfreigabe).
- **Crons (Production, 13, UTC):** crawl 04:00/20:00 · pipeline 16:00 · morning-briefing 05:00 · understanding 05:30/21:30 · **rueckstand 11:30/17:30** · lage-briefing 05:45 · health 06:00 · lage-check 10:00 · 2 Narrativslots 06:10/06:22 (inert). **`18,48 * * * *` nicht in Production.** Dazu Actions-Watchdog (`briefing-watchdog.yml`, 05:30, oft 2–3 h verzögert).
- **Migrationen:** 35 Einträge, letzte `20260829175749` (05.09. rein lesend bestätigt). **Z22 seit 29.08. mit Freigabe angewendet** (§14–22) — **nicht erneut anwenden**. Auf `main`, **nicht in Production angewendet**: `20260720`, F9 (`20260825101500`), `20260902121500`. Jede weitere Anwendung bleibt freigabepflichtig.
- **Historische Kosten 09.09., 07:23 UTC (neue getrennte Kosten oben):** 92 Reservierungen, 92 Belege, **0,212737 USD Schaetzung**. Der historische Nachtrag ist als rekonstruiert gekennzeichnet. Keine neue Luecke. Grenze 10 USD je UTC Tag, Prognosestopp 9 USD. Kein Rechnungsbeleg oder atomarer USD Riegel.
- **Zugang:** Azure und Foundry geschützt per Microsoft E Mail erreicht, keine Zugangsdaten offengelegt. Rein lesend: `gpt-5-mini` Global Standard **250.000/2.000.000 TPM**, Zuordnung 250.000 TPM, bekannte Grenze 250 RPM. Keine Azure Änderung. Production Leser **34058091793** bleibt gültig (§54).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28 |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27 |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM Tagesbudget | **Deckel 2416 / Understanding Reserve 702 / Vorrangreserve 200** bestaetigt. Zusaetzlich atomarer Geldriegel **4 USD je UTC Tag**. Kostenregel 2 seit 10.09., 12:25:36 Tuerkei / 11:25:36 Berlin / 09:25:36 UTC live bestaetigt. 0,431472 USD gebunden, darunter 0,212 USD fuer einen unbekannten Ausgang; volle Reserve statt globalem Stillstand. Keine Anbieterrechnung. |
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
| `HELMUT_TESTLAUF_*` | Kommunikation und Kohortenquellen gesperrt, am 10.09. im authentifizierten Leser bestaetigt. Der gesonderte atomare Kostenriegel ist aktiv; alte RPM, TPM, USD und Parallelitaetswerte ersetzen ihn nicht. Keine neue externe Zustellung durch das freigegebene Fenster. |
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | **historische Aufnahme vom 16.09., in dieser Sitzung nicht neu geprueft**. Freigaben gelten ausschließlich pro vorgesehenem scharfen Schritt mit dessen Bestätigung; Vercel nicht ändern. `_QUELLEN` bleibt AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad und Exklusivmodus am 06.09. um 07:59 UTC wirksam belegt.** Frühere Annahme `HELMUT_PROFILE_DB_EXCLUSIVE` sei aus ist damit überholt. Keine Env Änderung durch diese Sitzung; vor B/C den ausführenden Prozess an den tatsächlichen Speicherpfad binden und Bestand neu erheben. |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |
| **Alle 504 Profile** | Laut erhaltenem Bericht am 16.09.21:03:43 Tuerkei / 20:03:43 Berlin / 18:03:43 UTC inaktiv bestaetigt; hier nicht neu abgefragt. Erneute Teilnahme von exakt 500 ausgewaehlten Profilen braucht ausdrueckliche Freigabe. |

## 6 · Skalierung von 25 auf exakt 500 Testprofile

**Historisches erstes Fenster:** Exakt 500 Profile waren ab 08.09., 07:43 UTC aktiv; am 09.09., 08:34 UTC beendet. **Zweites einmaliges Fenster:** am 09.09. wieder exakt 500 aktiv bestaetigt, seit 14:21:40 Tuerkei / 13:21:40 Berlin / 11:21:40 UTC sicher geschlossen (neuer Bericht oben). Anlage und Aktivierung aller 475 B/C Profile sowie Planung und begrenzte Fachlaeufe sind unabhaengig bestaetigt (SR §61). Das beweist keine vollstaendige heutige Textversorgung: 44/500 Texte vorhanden. Historischer Endbestand vom 09.09.: 504/5/499; aktueller Bestand steht im Statuskopf. [Ablauf](betrieb/direkter-ausbau-500.md) und [Abschluss](betrieb/500-nachlauf-2026-09-09.md).

1. **Wiederanlauf erledigt:** Datenbank wiederholt erreichbar, geschützte Leser erfolgreich. Natürlicher Crawl um 20:00 UTC abgeschlossen und unabhängig geprüft, kein Ersatzcrawl. SR §53.
2. **Lagebeleg erledigt:** kontrollierter Lauf am 06.09. um 20:33 UTC erreichte **25/25** mit gespeicherter Wirkung und Quellenlinks. Der gescheiterte 10:00 UTC Lauf zählt weiterhin nicht. Alle 60 A Aufträge des Fensters 06.09. sind erledigt, aktueller Tageszähler 147. Vollständige heutige Briefingqualität bleibt offen.
3. **Kommunikation:** Vollständiger globaler Riegel am 06.09. um 19:00 UTC wirksam bestätigt. Vor einem späteren Fachlauf erneut prüfen. Frühere Push und Webhook Vorgänge sind kein Tagesnullbeleg.
4. **Provisionierung und Aktivierung abgeschlossen:** Erster Anlagevorgang endete nach 307 bestaetigten Neuanlagen am Zeitbudget. Sichere Fortsetzung legte nur die fehlenden 168 an. Alle 475 neuen Profile danach aktiviert, jeder Schreibausgang gelesen und geschuetzte Grundlinie unveraendert (SR §61).
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
9. **500er Gesamtabnahme nicht bestanden:** Abschlussfenster 15./16.09. mit 497 Paketen, 131 Morgenquittungen und 5 Lage Texten; keine vollstaendige fachliche Abnahme. Reparaturen und offene Voraussetzungen stehen im [aktuellen Sprintbeleg](betrieb/morgen-paketnachweis-2026-09-17.md).
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

Die vier aufeinander aufbauenden Reparaturteile ungemergt pruefen lassen. Nach Abschluss des begrenzten Titelsprints naechsten Inhaltsblock anhand der WELT Originalbefunde bearbeiten: Artikelidentitaet und widerspruechliche Quellenzeiten. Quellenversorgung, Zuschreibung, Ereigniszeit und sachlicher Profilbezug bleiben fachlich offen. Die benoetigte Morgen und Lagekapazitaet samt Fortsetzungsplanung und sicherem Testende muss vor erneutem500er Nachweis geklaert sein. Keine neue Startfreigabe aus dieser Codearbeit ableiten.

## 12 · Verbindliche Betriebsgrenzen

**Massgeblich ist der Betreiberauftrag vom 17.09.2026. Er ersetzt alle aelteren pauschalen Freigaben in dieser Datei und den historischen Belegen.**

1. Erlaubt: rein lesende Production Pruefung, eigener Branch, auftragsbezogener Code, Dokumentation, lokale Offlinepruefungen, Commit, Push und PR. Keine weiteren Agenten oder parallelen schreibenden Ausfuehrer.
2. Nicht freigegeben: Merge, Deployment, Migration, Production Datenaenderung, Profilaktivierung, Aenderung laufender Crons oder Automationen, Environment oder Azure Aenderung, bezahlter Modelllauf, neuer Production Test.
3. mini bleibt technische Referenz. Harte 4 USD je UTC Tag inklusive voller offener Reserven bleiben bestehen. Kein weiterer Modellvergleich und keine bezahlten Richteraufrufe. Historische Kosten oder unbekannte Reserven nicht loeschen.
4. Alle Profile duerfen fuer kuenftige Tests gleich behandelt werden. Aktuell bleiben alle 504 inaktiv. Konten, Identitaeten und Kommunikationssperre bleiben geschuetzt.
5. Mandantentrennung mit `assertTenant` und explizitem Mandatsfilter; bedingte gemeinsame Schreibvorgaenge und persistente Gegenpruefung. Nicht pruefbar bedeutet niemals bestanden.

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
## 28–32 · Historische Schritte 04.–05.09. (Details im Sicherheitsrahmen)

- **§28 Stufe A inaktiv angelegt:** 20 Profile isoliert; teilweise abgeschlossen, weil crawlRuns unbeabsichtigt 36 auf 20 gekuerzt wurde. Nicht wiederhergestellt. Vollbeleg [SR §36/§37](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§29 Speicherpfadschutz #301:** erfolgreich deployt, Offline Schutz gegen erneute Ringkuerzung und Vorflug 115 Assertions. Kein damaliger main CAS und kein schreibender Production Schutztest. [SR §38](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§30 Aktivierung A:** 20 aktiviert, 0 Fehler, Grundlinie erhalten, Konten inaktiv. 25 aktive Profile damals belegt. [SR §39](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§31 Lagekapazitaet #303:** Zeitscheiben, Kontexttrennung und Profilzeitstempel deployt; damalige Gesamtabnahme offen. [SR §40–§42](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§32 Kontoschutz #305:** 321/321 Suiten und 32/32 Browserpruefungen, Production READY. Natuerlicher Understanding Lauf speicherte 20 Ergebnisse; damalige Kostenmessung keine vollstaendige Rechnung. [SR §43](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Aktuelle Skalierungsbelege stehen oben.
