# CURRENT STATE — Helmut

**Letzte Aktualisierung: 23.09.2026.** Diese Datei ist das kompakte Cockpit fuer den aktuellen, entscheidungsrelevanten Zustand. Die vollstaendige vorherige Fassung mit allen historischen Details, Flags, Migrationen, Cron Angaben, alten Sprintstaenden und Belegen bleibt wortgleich erhalten unter [archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md). Aeltere historische Statusfassungen bleiben zusaetzlich im bestehenden [Archiv](archive/README.md).

## 1 · Aktueller Stand

* **Repository `main`:** `972cbab1c2bfbfb913b45e2e684a060c16e0ad5a`, Merge von PR520. Der manuelle GitHub-Actions-Ausfuehrungsweg fuer den einmaligen 169er Runner und der harte 0,80-USD-Laufdeckel auf Basis der bestehenden atomaren Kostenwahrheit sind damit auf `main`. Der einmalige 169er Understanding Runner, die gebundene Kennungsliste, die Resolver Korrekturen und die fail closed Bestandslesefehlerbehandlung stammen aus PR519.
* **Scharfer 169er Lauf ausgefuehrt — fehlgeschlagen, fail closed.** Workflow-Run `35829992528`, `run_attempt = 1`, `failure`, 07:06–07:09 UTC am 23.09.2026. Genau **ein** Modellaufruf, dann Stopp `verstehen-ausgang-unbekannt` am ersten Cluster (`skipped-invalid`, Fehlerklasse `validierung-fehlgeschlagen`). Einmalquittung `verstehen169-20260922-a` terminal `unbekannt` — kein zweiter Lauf desselben Auftrags, kein automatischer Retry. Finale Laufkosten `0,005997 USD`; globaler Tagesstand danach `0,116068 USD` von 4 USD. **Kein 500er Nachweis, keine Profilaktivierung (weiterhin 0 aktiv).** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16.
* **Diagnose- und Ergebniswahrheit repariert (dieser Sprint).** Der gescheiterte Bericht meldete `reason=dokumente:kernueberdeckung` (Resolver-Begruendung der Bestandszuordnung, NICHT die Ursache) und `dokumente=0`, obwohl das neue Dokument tatsaechlich an `ko-vg-abschaffung-20260911-7420f6` verknuepft wurde. Der Motor traegt bei `skipped-invalid` jetzt die Fehlerklasse (`reason`) und die echte Clustergroesse (`documents`); der Runner uebernimmt hoechstens fuenf **sichere** Fehlercodes als `validierungsfehler` (auch in die Einmalquittung, ohne neue Tabelle). Der historische konkrete Validierungsfehler ist **nicht rekonstruierbar** (weder Skip-Log noch CAS tragen die Codes). Kein Retry, kein neuer Lauf, keine Quittungsaenderung. **Branch:** `codex/verstehen-169-diagnosewahrheit-20260923`, Commit `9a10ce07…`, **PR #522 offen** — Merge braucht Betreiberfreigabe.
* **Profile:** letzter fachlich belegter Zustand nach dem abgeschlossenen Quellen und Understanding Vorlauf: **504 Profile, 0 aktiv**. Alle Profile bleiben inaktiv bis zu einer getrennten ausdruecklichen Startfreigabe.
* **Ruhender Betrieb:** im letzten Production Nachweis zu diesem Stand keine unerledigten Jobs, keine lebenden Job Leases und keine lebenden Understanding Leases. Dieser reine Dokumentationssprint fuehrt keine neue Datenbankinventur aus.
* **Kosten:** atomarer technischer Tagesriegel bleibt **4 USD je UTC Tag**. Alte 10 USD Betreiberfreigaben erhoehen diesen technischen Riegel nicht. Keine neue Kostenfreigabe durch diese Dokumentationsaenderung.

## 2 · Stand auf dem Weg zum 500er Production Nachweis

### Erledigt und nicht ohne Grund wiederholen

1. **36er Prosa Fachabnahme bestanden.** Lauf `35704398267`: exakt 36 von 36 Pfadfaellen ausgewertet, 12 positive korrekt akzeptiert, 24 negative oder unklare korrekt nicht akzeptiert, 0 Fehlurteile, 36 Aufrufe, kein Retry. Kosten `0,189405 USD`. Diese Abnahme ist ein Fachbeleg, aber kein 500er Gesamtnachweis. [Beleg](betrieb/prosa-36er-vertrag-2026-09-21.md).

2. **Quellenreparaturen integriert.** Die Reparaturkette bis PR473 ist abgeschlossen. Ereignisketten sind fuer die belegten Faelle getrennt, amtliche Originalangaben erhalten, verschiedene DIP Kennungen gegen Titel und RSS Reihenfolge geschuetzt und Quellentitel werden nicht mehr sinnveraendernd abgeschnitten. Die vollstaendigen Integrationsdaten und CI Werte stehen im Archivsnapshot und im [500 Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

3. **Quellen Vorlauf fuer 500 fachlich abgeschlossen.** Zwei scharfe Quellenlaeufe erzeugten zusammen **169 neue Rohdokumente**. Der erste Lauf versuchte 43 deduplizierte Abrufe, davon 5 erfolgreich und 38 wegen Anbieter Minutengrenze fehlgeschlagen. Der kontrollierte Fortsetzungslauf erledigte die 38 Restabrufe vollstaendig und erzeugte weitere 137 Rohdokumente. **Kein weiterer Quellenabruf ist fuer diesen Vorlauf erforderlich.** Der zu breite Schutz Hash wurde danach durch PR517 korrigiert. [Beleg](betrieb/500-betriebsplan-2026-09-20.md).

4. **Einmaliger Understanding Lauf vorbereitet und genau einmal ausgefuehrt.** Gebunden sind exakt **169 Rohdokumente**, `idHash 5f387840…a2ed9`, **122 Cluster**, hoechstens **113 Kandidaten**, maximal **0,80 USD**, maximal **35 Minuten**, Aufruftyp `understanding-rueckstand`, technischer Tagesriegel unveraendert 4 USD. Der rein lesende Planlauf ergab zunaechst 114 Kandidaten und stoppte korrekt fail closed an `verstehen-kandidaten-ueber-deckel`; PR519 korrigierte das Resolver Fenster generisch. Der scharfe Lauf (Run `35829992528`, 23.09.2026) stoppte nach **einem** Modellaufruf fail closed mit `verstehen-ausgang-unbekannt`; die Diagnose- und Ergebniswahrheit dieses Laufs ist in diesem Sprint repariert und testgesichert (siehe §1 und [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16). **Kein Retry, kein zweiter Lauf.**

### Noch offen fuer den 500er Nachweis

1. Den einmaligen 169er Understanding Lauf auswerten und ueber das weitere Vorgehen entscheiden. Er wurde **genau einmal** ausgefuehrt (Run `35829992528`) und stoppte nach einem Modellaufruf fail closed (`verstehen-ausgang-unbekannt`, Quittung terminal `unbekannt`). Ein erneuter Lauf ist eine **getrennte Betreiberentscheidung** — er ist ausdruecklich kein automatischer Folgeschritt dieses Sprints.

2. Danach fuer **exakt 500 aktive Testprofile** frische Vollversorgung belegen. Aktivierung allein ist kein Funktionsnachweis.

3. Fuer alle 500 Profile die **1500 erwarteten Ergebnispositionen** vollstaendig pruefen: Mandatsbriefing, Morgenbriefing und Lage. Fehlende, leere, doppelte oder unbrauchbare Ergebnisse getrennt ausweisen.

4. Fachliche Qualitaet nach den geltenden Kriterien pruefen. Stichproben duerfen nie als vollstaendige Textpruefung ausgegeben werden.

5. Belastbare Gesamtzeit und Gesamtkosten messen, automatische Terminierung beweisen und den sicheren Rueckweg auf 0 aktive Testprofile bestaetigen.

Der historische Abschlusslauf vom 15. und 16.09. hat den Gesamtnachweis **nicht** bestanden: 497 von 500 Mandatsbriefings, 131 von 500 Morgenbriefings, 5 von 500 Lage Ergebnisse und damit keine Vollversorgung. Die Reparaturen danach machen diesen alten Lauf nicht nachtraeglich erfolgreich.

## 3 · Verbindliche Production Grenzen

* **Nur ein schreibender Ausfuehrer** im selben Production oder Testbereich. Fremde Arbeit erhalten. Bei unklarer Parallelitaet nicht schreiben.
* **Alle 504 Profile bleiben inaktiv**, bis eine konkret benannte Aktivierung fuer exakt 500 Testprofile ausdruecklich freigegeben wird.
* Kein Merge nach `main`, kein Production Deployment oder Umschalten, keine Migration, keine Production Datenveraenderung, keine Profilaktivierung oder Deaktivierung, keine Cron Aenderung, keine Environment Aenderung, keine Azure Aenderung, keine Budgeterhoehung, kein externer oder kostenpflichtiger Production Modelllauf und keine externe Nachricht ohne passende Freigabe.
* `HELMUT_SOURCE_MODE=on`, `HELMUT_VERSTEHEN_CAS=on`, `HELMUT_SCALABLE_PIPELINE=on` im Modus `shadow`. `HELMUT_TENANT_LLM_CAP` bleibt aus und darf fuer den 500er Test nicht eingeschaltet werden. Kommunikations und Testkohortenriegel bleiben wirksam.
* Relationaler Profilpfad und Exklusivmodus sind Production belegt. Vor einem neuen 500er Fenster Daten und Ausfuehrungskontext frisch abgleichen.
* Die Endfunktion fuer das Testfenster ist installiert. Offene Migrationen `20260720`, `20260825101500` und `20260902121500` bleiben unangewendet und brauchen jeweils separate Freigabe.
* Der Quellenbestand bleibt stark von Google News abhaengig. Historischer Stand: 146 von 163 Abrufwegen. Das ist ein Betriebsrisiko, aber kein Grund, den abgeschlossenen 169er Quellen Vorlauf zu wiederholen.
* Branch Protection ist weiterhin nicht technisch erzwungen. Pflicht CI muss deshalb vor jedem Merge bewusst geprueft werden.

Vollstaendige historische Betriebswerte zu Crons, Flags, Migrationen, Quellenpaketen, Budgets, Altprofilen und frueheren Production Aufnahmen stehen im [Archivsnapshot vom 23.09.](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md).

## 4 · Aktuelle offene Blocker

1. **500er Gesamtabnahme fehlt.** Das ist der zentrale technische Production Nachweis.
2. **Diagnosewahrheits-Reparatur des gescheiterten 169er Laufs liegt als PR #522 zur Review** (`codex/verstehen-169-diagnosewahrheit-20260923`, Commit `9a10ce07…`). Der Motor traegt bei `skipped-invalid` die Fehlerklasse und die echte Dokumentzahl, der Runner meldet die sicheren Validierungsfehlercodes begrenzt (`validierungsfehler`, max. 5, auch in der Einmalquittung). Offline testgesichert (`verstehen-einmalig-test` 84/84; Sammellauf 449/452 grün, drei Suiten nur wegen 180s-Sammler-Timeout auf langsamer Maschine, einzeln grün — CI ist der maßgebliche Lauf). Merge braucht Betreiberfreigabe.
3. **Der unbekannte CAS-Zustand des Vorgangs `vg-abschaffung-20260911-7420f6` bleibt unveraendert** (`zustand=unbekannt`, `ki_aufrufe=1`, `letzter_grund=validierung-fehlgeschlagen`) — keine Aufloesung, keine Quittungsaenderung ohne Freigabe.
4. **Frische Vollversorgung und 1500er Bilanz fehlen.**
5. **Gesamtzeit, Gesamtkosten, automatisches Testende und Rueckweg muessen im neuen 500er Fenster gemeinsam belegt werden.**
6. **Allgemeine Faktenbindung und Quellenqualitaet bleiben ausserhalb der bereits bestandenen 36er Prosa Abnahme weiter zu beobachten.** Qualitaetswaechter duerfen nicht abgesenkt werden.
7. **Verkaufsblocker ausserhalb des 500er Nachweises bleiben bestehen:** insbesondere OP01 bis OP04, Rechts und Datenschutzfragen, Monitoring Zweitkanal, Branch Protection und weitere Punkte der kanonischen [Datenmotor Restliste](datenmotor-restliste.md). Sie werden erst nach dem Production Nachweis wieder zur Hauptprioritaet, sofern sie den Nachweis nicht direkt blockieren.

## 5 · Nicht wiederholen

* Den abgeschlossenen 169er Quellen Vorlauf nicht erneut ausfuehren.
* `understanding-recovery.yml` nie ausfuehren. Dieser Pfad ist in Production gescheitert.
* Keine kleineren Ersatzkohorten als Beweis fuer exakt 500 Profile.
* Keine alten geschlossenen Prosa, Quellen oder Relationsversuche fortsetzen oder deren Restkontingente wiederverwenden.
* Keine gruenen Offline Tests als Production Funktionsnachweis ausgeben.
* Keine Aktivierung, Provisionierung oder gespeicherte Ergebniszahl allein als 500er Funktionsnachweis behandeln.
* Keine historischen Statusangaben als heutigen Production Zustand ausgeben. Bei Widerspruch gilt: Production Beleg vor Repository, Repository vor CURRENT_STATE, CURRENT_STATE vor historischer Dokumentation.

## 6 · Naechster Schritt

**Unmittelbar:** Die Diagnosewahrheits-Reparatur dieses Sprints reviewen (Motor `understanding.js`, Runner `verstehen-einmalig.js`, neue Pruefungen §23 in `verstehen-einmalig-test.js`). Merge nach `main` braucht eine ausdrueckliche Betreiberfreigabe — Merge und automatisches Production Deployment sind eine gemeinsame kritische Wirkung.

**Danach getrennt:** Betreiberentscheidung ueber den gescheiterten 169er Lauf. Der Lauf wurde genau einmal ausgefuehrt und bleibt terminal (`unbekannt`). Jeder weitere scharfe Lauf — ob ueberhaupt, mit welcher neuen Quittungskennung und nach welcher Aufloesung des unbekannten CAS-Zustands — ist eine eigene Freigabe. **Kein Retry, kein Dispatch, keine Quittungs- oder Budgetaenderung ohne Freigabe.**

Nach erfolgreicher Vollauswertung des 169er Laufs wird neu entschieden, ob noch ein technischer oder qualitativer Blocker vor dem exakt 500er Testfenster besteht. Bereits erfolgreich belegte Pruefungen werden nicht ohne sachlichen Grund wiederholt.

## 7 · Kanonische Belege

* [500er Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)
* [500er Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md)
* [36er Prosa Fachabnahme](betrieb/prosa-36er-vertrag-2026-09-21.md)
* [169er Understanding Lauf](betrieb/verstehen-einmalig-169-20260922.md)
* [Production Beweisprotokoll](betrieb/production_beweisprotokoll.md)
* [Datenmotor Restliste](datenmotor-restliste.md)
* [Vollstaendiger vorheriger CURRENT_STATE Snapshot](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md)
