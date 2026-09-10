# CURRENT STATE — Helmut

**Stand 10.09.2026: teilweise abgeschlossen, autonome Fortsetzung freigegeben.** Die Freigabe umfasst temporaeres Aktivieren und anschliessendes Deaktivieren der 495 bestehenden synthetischen Testprofile bei unveraendert 4 USD je UTC Tag. Reaktivierung `34473218573`: 495/495 bestaetigt. SQL 16:07:18 Tuerkei / 15:07:18 Berlin / 13:07:18 UTC: 504 Profile, exakt 500 aktiv, 505 Identitaeten, drei Inhaltsfingerabdruecke unveraendert, keine aktiven Sperren/Leases/verwaisten oder jungen laufenden Prozesse. 104 Tickets, 0,654962 USD gebunden einschliesslich voller alter Reserve 0,212 USD. Sieben heutige Lage Texte, vier strukturell vollstaendige von 376 gespeicherten Briefingpaketen. Der vorherige App Leser bestaetigte drei; fuer das vierte bisher nur Datenbankbeleg. Volle fachliche Abnahme aller 500 offen.

**Production und Folgekorrektur:** PR #361 ist gemergt als `f5b3f0b88b51cdb18450bdbc4aae0328be986154`, Hauptalias `dpl_BjwzQAnZ1gfHygfNmFHtzBihHdPh` unabhaengig READY. CI `34478105888`: 348/348 Suiten, Browser 50, Datenbank 15 und 48 PASS. Textabschnitt `34480319437` nach Zeitstopp beendet, ein neuer Text samt Briefing gespeichert und alle 15 neuen Aufrufe abgerechnet. Ein weiterer Berichtsfehler ist reproduziert: HTTP lieferte nur die bearbeitete Teilmenge, die Datenbank alle 500. Die lokale Folgekorrektur verbindet echten Worker und Controller im Regressionstest; nicht erreichte Profile bleiben ausdruecklich unbearbeitet. Zusaetzlich nutzt nur das Quellenreview low statt minimal, innerhalb derselben 3000 Ausgabetokens und vollen Geldreserve. Bessere fachliche Urteile sind noch nicht belegt; Kriterien bleiben unveraendert. Branch `codex/500-zeitstopp-vollstaendig-20260910`: lokale Sammlung beendet, 346/348 in615s, zwei fehlende Browser. Danach Vorrang fuer bezahlte Entwuerfe separat17/17 geprueft. CI muss den endgueltigen Stand pruefen. Bezahlte Entwuerfe erhalten; noch keine neue Production Ausfuehrung dieser Folgekorrektur. [Belege und Grenzen](betrieb/500-kostenabbruch-2026-09-10.md).

**Historie bis 09.09.2026:** PR #346 und #347 wurden mit ausdruecklicher Freigabe uebernommen; damalige CI: 345/345 Suiten, 50 Browserpruefungen und beide Datenbankgates erfolgreich. Das freigegebene Fenster wurde geschlossen, die Quellenkorrektur anschliessend bis #354 veroeffentlicht. Die damaligen Kosten und Texte gehoeren zum 09.09., nicht zum heutigen Nachweis. [Historischer Fensterbericht](betrieb/500-testfenster-2026-09-09.md), [Kostenregel 1 und Quellenarbeit](betrieb/500-kostenbremse-2026-09-09.md). Alle Profile sind laut Betreiber ungenutzte Testprofile; der besondere Verfuegbarkeitsvorrang der fuenf alten Dummys entfaellt. Datenerhalt, Kosten und Ausschluss konkurrierender Laeufe bleiben verbindlich. Private Einzeluebersichten bleiben beim Betreiber. Aeltere naechste Schritte sind ueberholt, soweit sie dem aktuellen Befund oben widersprechen; gueltige Betriebsgrenzen stehen in Abschnitt 12.

**Kernlage:** Warteschlangenmotor seit 23.08. in Production `on`, Dispatch `shadow`. Fuenferbeleg: [OP-30 §30.7](betrieb/op30-aktivierung-5-mandate.md). **Frisch sieben Vorgaenge `unbekannt`, juengster 08.09., 17:32 UTC nach Modelltimeout**; alte Viererangabe ueberholt. Keine automatische Wiederholung. Selbstweck nie ausgefuehrt.

## 1 · Aktive Produktphase

**Fruehere Testfenster sicher geschlossen; aktueller 500er Nachweis am 10.09. mit 495 bestaetigt reaktivierten Profilen fortgesetzt. Vollstaendiger Funktionsnachweis offen.** Die neuere Betreiberanweisung ersetzt die bisherige Zwischenabnahme bei 100: direkt auf 500 ausbauen und dort abnehmen; seit 08.09. keine vorherige A Abnahme und kein Nachtfenster mehr. Der neue ausdrückliche Zielweg `--ziel=500` ergänzt den vorhandenen Ausführer; keine vorgetäuschte B Abnahme. Vorrang haben Datenintegrität, Kommunikationssperre und höchstens 4 USD Modellkosten insgesamt je UTC Tag. Kostenregel 2 ist Production bestaetigt und erlaubt ausschliesslich durch volle Reserven gedeckte weitere Arbeit; der neue fachliche 500er Nachweis steht aus. Danach Verkaufsreife und P0 Punkte OP-01 bis OP-04; [OP Liste](datenmotor-restliste.md). Kein Kunden- oder Mehrtagesnachweis.

## 2 · Stand auf `main` und Pull Requests

- **[PR #344 Production](https://github.com/ernisch/helmut-pilot/pull/344):** Mit ausdruecklichem Ja des Betreibers gemergt als `ac8e6236c3e688b85622999a2becafa717aa60cd`. READY `dpl_DMrxESHNv3YFNTCXd8g7Tn7hxZnJ`, Hauptalias bestaetigt. Exakter PR Kopf `087d4a6b080aad2f53f653df48f3fd28e7478760`, CI `34338561929`: 341/341 Suiten in 625s, Browser 50/50, Kontoschutz und Teilnahme 11/11, Z22 48/48. Baum `d69c82bd54aba6d2d50be9ab3a1971a1b6104438` in PR, CI Kandidat und echtem Merge gleich. Zusaetzliche main CI `34340148453` bei Uebernahme vollstaendig erfolgreich. Reiner Abschlussnachtrag auf `codex/344-production-uebergabe-20260909`; keine weitere Fachkorrektur oder Testausfuehrung in diesem Nachtrag.

- **[PR #343](https://github.com/ernisch/helmut-pilot/pull/343) Production:** Merge `4710c59b1098ce0025d8858e156e11cc694a25d8`, Deployment `dpl_HRf48dKcZTn5M3EL4sGcG1VAsW7k` READY am Hauptalias. Konsistentes Absatzbeispiel und genaue Textfehlerklassen. Exakter PR Kopf `7025efc`, CI `34325744062`: 340/340 in 508s, Browser erfolgreich, Kontoschutz 10/10 und Z22 48/48. Nach Merge keine Modellarbeit; neuer 500er Wirkungsbeleg offen.

- **#342 Production:** `f4c52fe66b04a0175b794575a90b60d98fddf455`, `dpl_7B9KWmSoXDRZufDMPJtx7z97EWUq` READY. PR CI `34321599919` vollstaendig erfolgreich; main CI `34322801570` erfolgreich. Kostenquittierung und Fehlerdiagnose deployt, freigegebener historischer Kostennachtrag ausgefuehrt. [Details](betrieb/500-nachlauf-2026-09-09.md).
- **#341 Production:** `d511d8d2d5d0b356b611ad6b1ac3f831f6db5aa8`, `dpl_5L7hHWTxKcxHA8ibbEcZyHVwvVic` READY. PR Lauf `34315835967` und main Lauf `34318569679` erfolgreich. Details im [aktuellen Beleg](betrieb/500-nachlauf-2026-09-09.md).
- **Watchdog und Lage Check 08.09.:** `34212536121` startete bei unlesbarem Status keinen Ersatzlauf; PR #338 haertet den GET Leser. Der Lauf `cron-lage-check-20260908100012-bnctn` erfasste global 103/103 Quellen, speicherte aber nur 83/500 Mandatslagen. 417 bleiben zeitbedingt offen; keine Gesamtabnahme, SR §61.7.
- **#334 bis #338 uebernommen:** direkter Ausbau, vollstaendige 500er Planung, begrenzter Dispatch und gehaerteter Statusleser; Einzelpruefungen und Production Belege SR §60 bis §62.
- **Quellenkorrektur #330:** `2ca0e62`, READY, beide Pflichtjobs gruen; Nachweis SR §58.5. Ausfuehrer aus #326/#328 bleibt bestehen.
- **A Ausführer #322/#323:** deployt und geprüft; Einzelbelege SR §54/§55. Workflow `34066395564` scheiterte vor dem Production Aufruf; kein Wiederholungslauf.
- **Uebernommen (§57/§60/§61):** Quellenbindung und geplanter Testabschluss fuer 495 synthetische Profile. Geplanter Abschluss am **09.09., 08:34 UTC / 11:34 Tuerkei** bestaetigt: 495 synthetische Profile deaktiviert, alle Profile und Identitaeten erhalten.
- Frühere Schutzarbeiten **#303, #305, #307, #309, #310, #313, #316 und #318** sind deployt. Sie schützen Kontext, Leseantworten, Konten, gemeinsam genutzte Speicher und Appstart. Belege und Grenzen: SR §40–§51; Lage 25/25 seit §53.

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
| `HELMUT_TESTKOHORTE_EXECUTE`/`_CONFIRM`/`_QUELLEN` | **im aktuellen Prozess nicht gesetzt**. Freigaben gelten ausschließlich pro vorgesehenem scharfen Schritt mit dessen Bestätigung; Vercel nicht ändern. `_QUELLEN` bleibt AUS (§26) |
| `HELMUT_LLM_USAGE_RELATIONAL` | aus; Migration `20260902121500` nicht angewendet (§3) |
| `HELMUT_PROFILE_DB_MODE` | **Relationaler Profilpfad und Exklusivmodus am 06.09. um 07:59 UTC wirksam belegt.** Frühere Annahme `HELMUT_PROFILE_DB_EXCLUSIVE` sei aus ist damit überholt. Keine Env Änderung durch diese Sitzung; vor B/C den ausführenden Prozess an den tatsächlichen Speicherpfad binden und Bestand neu erheben. |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |
| **495 synthetische Profile A/B/C** | Aktuell 495/495 mit ausdruecklicher Freigabe temporaer aktiv; Reaktivierung 34473218573 beendet. Gesamt 504 Profile, 500 aktiv, 505 Identitaeten erhalten. Anschliessende Deaktivierung ebenfalls freigegeben. |

## 6 · Skalierung von 25 auf exakt 500 Testprofile

**Historisches erstes Fenster:** Exakt 500 Profile waren ab 08.09., 07:43 UTC aktiv; am 09.09., 08:34 UTC beendet. **Zweites einmaliges Fenster:** am 09.09. wieder exakt 500 aktiv bestaetigt, seit 14:21:40 Tuerkei / 13:21:40 Berlin / 11:21:40 UTC sicher geschlossen (neuer Bericht oben). Anlage und Aktivierung aller 475 B/C Profile sowie Planung und begrenzte Fachlaeufe sind unabhaengig bestaetigt (SR §61). Das beweist keine vollstaendige heutige Textversorgung: 44/500 Texte vorhanden. Aktueller Endbestand 504/5/499, alle 495 synthetischen Profile und Konten inaktiv. [Ablauf](betrieb/direkter-ausbau-500.md) und [Abschluss](betrieb/500-nachlauf-2026-09-09.md).

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
9. **500er Gesamtabnahme offen:** 44 heutige Texte gelesen, 456 fehlen. Der deployte Nachlauf speicherte einen Text, dann fehlte ein gueltiges KI Ergebnis. Historische Kostenluecke mit freigegebenem Anbieterabgleich geschlossen. Fortsetzung nur kontrolliert. Zusaetzlich fehlen Quelldetails; konkrete Qualitaetsmaengel im [aktuellen Beleg](betrieb/500-nachlauf-2026-09-09.md).
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

1. Die Kostenkorrektur aus PR #356 ist mit ausdruecklichem „go“ gemergt und Production bestaetigt. Uebertragung, PR Pruefungen, Merge und Veroeffentlichung sind erledigt; dafuer keine erneute Freigabe verlangen. Der reine Abschlussnachtrag dokumentiert diese Wirkung.
2. Vor dem naechsten Fachschritt aktuellen Kostenstand, exakten Production Commit, aktive Kostenregel 2, Zielprofile und konkurrierende Arbeit frisch abgleichen. Die unbekannte Reserve bleibt voll gebunden; kein direkter SQL Eingriff und keine Wiederholung des alten ungeklärten Aufrufs.
3. Das alte Fenster ist sicher geschlossen. Die neue Betreiberanweisung verlangt Fortsetzung mit exakt 500 und erhaltener 4 USD Geldgrenze, ohne kuenstliche Vorstufen, manuelle Anzahlgrenze oder Morgenwartezeit. Vor Facharbeit aktuellen Bestand und fehlende Konkurrenz belegen; Abschluss unabhaengig absichern. Technische Prozessfristen der Hostingplattform nicht entfernen.
4. Fachliche Gesamtabnahme bleibt offen: Fuer alle 500 Lage und vollstaendiges Briefing speichern, aus der App abrufen und Inhalte pruefen. Paketanzahl, gedeckte Kosten und gruene Prozessquittung ersetzen keine vollstaendige Faktenpruefung.

## 12 · Verbindliche Betriebsgrenzen

Neuester Auftrag am 10.09.: alleinige vollautonome Fortsetzung bis zum vollstaendigen Nachweis fuer alle 500 Testmandate innerhalb 4 USD je UTC Tag. Dazu gehoeren notwendige sichere Korrekturen, gepruefte Veroeffentlichung und kontrollierte Facharbeit; Routinefreigaben nicht erneut verlangen.
Die neue ausdrueckliche Freigabe zur vollautonomen Fortsetzung gilt fuer erforderliche Korrekturen dieses Nachweises; andere Production Aenderungen brauchen weiter eine passende Freigabe. #342 und einzelner Kostennachtrag sind freigegeben und ausgefuehrt; keinen zweiten Kostennachtrag. Die genehmigte einmalige temporaere Teilnahme der 495 vorhandenen synthetischen Profile und der manuelle Fachlauf sind ausgefuehrt; das Fenster ist geschlossen. Keine Aenderung realer Profile, Identitaeten, Konten, Budgets, Umgebungsvariablen oder Cron Ablaeufe.
Nur die stuendliche Testaufgabe wurde zur alleinigen Steuerung pausiert;
Production Crons bleiben gleich; die Endaufgabe hat den Test bestaetigt beendet. [SR §64](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).

1. Maximal **4 USD Modellkosten insgesamt je UTC Tag**. Neuere Betreiberanweisung 10.09. hebt die kuenstliche manuelle Anzahlgrenze, das Sechsstundenfenster und die Morgenwartezeit auf. Der Geldriegel bleibt verbindlich: Auch unbekannte Ausgaenge muessen mit ihrer vollen vor HTTP bestaetigten Reserve im Deckel bleiben. Kostenregel 2 in Production seit 10.09. bestaetigt; siehe aktuellen Beleg oben. Alte Geldhistorie, betraege und Zaehler nicht loeschen oder erstatten.
2. Keine Aktivierung der vier sonstigen inaktiven Profile, kein aktives Kohortenkonto, keine externe Nachricht oder Zustellung.
3. Keine Löschung, Wiederherstellung verlorener `crawlRuns`, Migration, neue kostenpflichtige Ressource, Azure Änderung, Vercel Env Änderung, Secret Ausgabe, direkte SQL Aktivierung oder Riegelumgehung. Kein Rollback oder Revert ohne neue Betreiberfreigabe.
4. Direkter Test laut §60: keine vorgeschaltete Stufenabnahme und keine Nachtzeitsperre. Vor Aktivierung genaue Zielmenge und geprueften Ausfuehrungsweg belegen; inaktive Anlage und Aktivierung getrennt. Messungen nicht vortaeuschen; Zugriffs und Datenintegritaetsschutz erhalten.
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
## 28–32 · Historische Schritte 04.–05.09. (Details im Sicherheitsrahmen)

- **§28 Stufe A inaktiv angelegt:** 20 Profile isoliert; teilweise abgeschlossen, weil crawlRuns unbeabsichtigt 36 auf 20 gekuerzt wurde. Nicht wiederhergestellt. Vollbeleg [SR §36/§37](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§29 Speicherpfadschutz #301:** erfolgreich deployt, Offline Schutz gegen erneute Ringkuerzung und Vorflug 115 Assertions. Kein damaliger main CAS und kein schreibender Production Schutztest. [SR §38](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§30 Aktivierung A:** 20 aktiviert, 0 Fehler, Grundlinie erhalten, Konten inaktiv. 25 aktive Profile damals belegt. [SR §39](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§31 Lagekapazitaet #303:** Zeitscheiben, Kontexttrennung und Profilzeitstempel deployt; damalige Gesamtabnahme offen. [SR §40–§42](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md).
- **§32 Kontoschutz #305:** 321/321 Suiten und 32/32 Browserpruefungen, Production READY. Natuerlicher Understanding Lauf speicherte 20 Ergebnisse; damalige Kostenmessung keine vollstaendige Rechnung. [SR §43](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md). Aktuelle Skalierungsbelege stehen oben.
