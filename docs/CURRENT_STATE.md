# CURRENT STATE — Helmut

**Letzte Aktualisierung: 23.09.2026.** Diese Datei ist das kompakte Cockpit fuer den aktuellen, entscheidungsrelevanten Zustand. Die vollstaendige vorherige Fassung mit allen historischen Details, Flags, Migrationen, Cron Angaben, alten Sprintstaenden und Belegen bleibt wortgleich erhalten unter [archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md). Aeltere historische Statusfassungen bleiben zusaetzlich im bestehenden [Archiv](archive/README.md).

## 1 · Aktueller Stand

* **Repository `main`:** `fee78569842306d99977006147baac425b49fe41`, Merge von PR519. Der einmalige 169er Understanding Runner, die gebundene Kennungsliste, die Resolver Korrekturen und die fail closed Bestandslesefehlerbehandlung sind damit auf `main`.
* **Production Vercel:** Deployment `dpl_2fuzLCbXapGVX6j881sGdbtKsD96` ist READY und zeigt auf exakt diesen Main Commit. Region und Aliaslogik bleiben unveraendert.
* **Profile:** letzter fachlich belegter Zustand nach dem abgeschlossenen Quellen und Understanding Vorlauf: **504 Profile, 0 aktiv**. Alle Profile bleiben inaktiv bis zu einer getrennten ausdruecklichen Startfreigabe.
* **Ruhender Betrieb:** im letzten Production Nachweis zu diesem Stand keine unerledigten Jobs, keine lebenden Job Leases und keine lebenden Understanding Leases. Dieser reine Dokumentationssprint fuehrt keine neue Datenbankinventur aus.
* **Kosten:** atomarer technischer Tagesriegel bleibt **4 USD je UTC Tag**. Alte 10 USD Betreiberfreigaben erhoehen diesen technischen Riegel nicht. Keine neue Kostenfreigabe durch diese Dokumentationsaenderung.
* **Offener PR520:** `codex/verstehen-169-actions-20260923`, Head `0243150e1645c5e46543b44939cf20f9b309ba69`. Er bereitet nur den manuellen GitHub Actions Ausfuehrungsweg fuer den bereits geprueften einmaligen 169er Runner vor. **Kein Dispatch, kein scharfer Lauf, keine Modellaufrufe und keine Production Writes.** Ein Start braucht weiterhin eine getrennte Betreiberfreigabe. [Beleg](betrieb/verstehen-einmalig-169-20260922.md).

## 2 · Stand auf dem Weg zum 500er Production Nachweis

### Erledigt und nicht ohne Grund wiederholen

1. **36er Prosa Fachabnahme bestanden.** Lauf `35704398267`: exakt 36 von 36 Pfadfaellen ausgewertet, 12 positive korrekt akzeptiert, 24 negative oder unklare korrekt nicht akzeptiert, 0 Fehlurteile, 36 Aufrufe, kein Retry. Kosten `0,189405 USD`. Diese Abnahme ist ein Fachbeleg, aber kein 500er Gesamtnachweis. [Beleg](betrieb/prosa-36er-vertrag-2026-09-21.md).

2. **Quellenreparaturen integriert.** Die Reparaturkette bis PR473 ist abgeschlossen. Ereignisketten sind fuer die belegten Faelle getrennt, amtliche Originalangaben erhalten, verschiedene DIP Kennungen gegen Titel und RSS Reihenfolge geschuetzt und Quellentitel werden nicht mehr sinnveraendernd abgeschnitten. Die vollstaendigen Integrationsdaten und CI Werte stehen im Archivsnapshot und im [500 Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

3. **Quellen Vorlauf fuer 500 fachlich abgeschlossen.** Zwei scharfe Quellenlaeufe erzeugten zusammen **169 neue Rohdokumente**. Der erste Lauf versuchte 43 deduplizierte Abrufe, davon 5 erfolgreich und 38 wegen Anbieter Minutengrenze fehlgeschlagen. Der kontrollierte Fortsetzungslauf erledigte die 38 Restabrufe vollstaendig und erzeugte weitere 137 Rohdokumente. **Kein weiterer Quellenabruf ist fuer diesen Vorlauf erforderlich.** Der zu breite Schutz Hash wurde danach durch PR517 korrigiert. [Beleg](betrieb/500-betriebsplan-2026-09-20.md).

4. **Einmaliger Understanding Lauf vorbereitet.** Gebunden sind exakt **169 Rohdokumente**, `idHash 5f387840…a2ed9`, **122 Cluster**, hoechstens **113 Kandidaten**, maximal **0,80 USD**, maximal **35 Minuten**, Aufruftyp `understanding-rueckstand`, technischer Tagesriegel unveraendert 4 USD. Der rein lesende Planlauf ergab zunaechst 114 Kandidaten und stoppte korrekt fail closed an `verstehen-kandidaten-ueber-deckel`. Die Ursache war ein Resolver Fenster, das exakte Bestandstreffer verdraengen konnte. PR519 korrigiert dies generisch im Motor und schaerft alle betroffenen Bestandslesefehler auf fail closed. **Ein scharfer 169er Lauf wurde noch nicht ausgefuehrt.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md).

### Noch offen fuer den 500er Nachweis

1. Den einmaligen 169er Understanding Lauf ueber den sicheren Ausfuehrungsweg ausfuehren und vollstaendig auswerten. PR520 ist dafuer nur Vorbereitung und noch offen.

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
2. **169er Understanding Lauf noch nicht scharf ausgefuehrt.** Der fachliche Runner ist auf main, der manuelle sichere Actions Weg liegt in PR520.
3. **Frische Vollversorgung und 1500er Bilanz fehlen.**
4. **Gesamtzeit, Gesamtkosten, automatisches Testende und Rueckweg muessen im neuen 500er Fenster gemeinsam belegt werden.**
5. **Allgemeine Faktenbindung und Quellenqualitaet bleiben ausserhalb der bereits bestandenen 36er Prosa Abnahme weiter zu beobachten.** Qualitaetswaechter duerfen nicht abgesenkt werden.
6. **Verkaufsblocker ausserhalb des 500er Nachweises bleiben bestehen:** insbesondere OP01 bis OP04, Rechts und Datenschutzfragen, Monitoring Zweitkanal, Branch Protection und weitere Punkte der kanonischen [Datenmotor Restliste](datenmotor-restliste.md). Sie werden erst nach dem Production Nachweis wieder zur Hauptprioritaet, sofern sie den Nachweis nicht direkt blockieren.

## 5 · Nicht wiederholen

* Den abgeschlossenen 169er Quellen Vorlauf nicht erneut ausfuehren.
* `understanding-recovery.yml` nie ausfuehren. Dieser Pfad ist in Production gescheitert.
* Keine kleineren Ersatzkohorten als Beweis fuer exakt 500 Profile.
* Keine alten geschlossenen Prosa, Quellen oder Relationsversuche fortsetzen oder deren Restkontingente wiederverwenden.
* Keine gruenen Offline Tests als Production Funktionsnachweis ausgeben.
* Keine Aktivierung, Provisionierung oder gespeicherte Ergebniszahl allein als 500er Funktionsnachweis behandeln.
* Keine historischen Statusangaben als heutigen Production Zustand ausgeben. Bei Widerspruch gilt: Production Beleg vor Repository, Repository vor CURRENT_STATE, CURRENT_STATE vor historischer Dokumentation.

## 6 · Naechster Schritt

**Unmittelbar:** PR520 rein lesend pruefen. Wenn er fachlich und technisch unveraendert zur beschriebenen Vorbereitung passt, braucht sein Merge eine ausdrueckliche Betreiberfreigabe. Merge und automatisches Production Deployment sind eine gemeinsame kritische Wirkung.

**Danach getrennt:** Production Wirkung von PR520 rein lesend bestaetigen. Erst anschliessend kann der einmalige 169er Understanding Lauf mit eigener ausdruecklicher Startfreigabe ausgefuehrt werden. Ein Merge von PR520 ist **keine** Freigabe fuer den Dispatch.

Nach erfolgreicher Vollauswertung des 169er Laufs wird neu entschieden, ob noch ein technischer oder qualitativer Blocker vor dem exakt 500er Testfenster besteht. Bereits erfolgreich belegte Pruefungen werden nicht ohne sachlichen Grund wiederholt.

## 7 · Kanonische Belege

* [500er Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)
* [500er Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md)
* [36er Prosa Fachabnahme](betrieb/prosa-36er-vertrag-2026-09-21.md)
* [169er Understanding Lauf](betrieb/verstehen-einmalig-169-20260922.md)
* [Production Beweisprotokoll](betrieb/production_beweisprotokoll.md)
* [Datenmotor Restliste](datenmotor-restliste.md)
* [Vollstaendiger vorheriger CURRENT_STATE Snapshot](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md)
