# CURRENT STATE — Helmut

**Letzte Aktualisierung: 23.09.2026.** Diese Datei ist das kompakte Cockpit fuer den aktuellen, entscheidungsrelevanten Zustand. Die vollstaendige vorherige Fassung mit allen historischen Details, Flags, Migrationen, Cron Angaben, alten Sprintstaenden und Belegen bleibt wortgleich erhalten unter [archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md). Aeltere historische Statusfassungen bleiben zusaetzlich im bestehenden [Archiv](archive/README.md).

## 1 · Aktueller Stand

* **Repository `main`:** `f0da00825f92fec1155135e68793b8cadc8887b6`, Merge von PR524 (sicherer 169er Neuversuchsvertrag; davor PR523 Doku-Regeln, PR522 Diagnosewahrheit). Vercel Production READY ohne Runtime Fehler (Deployment `dpl_Exoh9dP69SufcjtuA5QSKEguCRY8`, Region fra1). Der manuelle GitHub-Actions-Ausfuehrungsweg fuer den einmaligen 169er Runner und der harte 0,80-USD-Laufdeckel stammen aus PR519/PR520.
* **Scharfer 169er Lauf ausgefuehrt — fehlgeschlagen, fail closed.** Workflow-Run `35829992528`, `run_attempt = 1`, `failure`, 07:06–07:09 UTC am 23.09.2026. Genau **ein** Modellaufruf, dann Stopp `verstehen-ausgang-unbekannt` am ersten Cluster (`skipped-invalid`, Fehlerklasse `validierung-fehlgeschlagen`). Einmalquittung `verstehen169-20260922-a` terminal `unbekannt` — kein zweiter Lauf desselben Auftrags, kein automatischer Retry. Finale Laufkosten `0,005997 USD`; globaler Tagesstand danach `0,116068 USD` von 4 USD. **Kein 500er Nachweis, keine Profilaktivierung (weiterhin 0 aktiv).** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16.
* **Diagnose- und Ergebniswahrheit repariert und gemergt (PR522).** Der Motor traegt bei `skipped-invalid` jetzt die Fehlerklasse (`reason`) und die echte Clustergroesse (`documents`); der Runner uebernimmt hoechstens fuenf **sichere** Fehlercodes als `validierungsfehler` (auch in die Einmalquittung). Der historische konkrete Validierungsfehler bleibt **nicht rekonstruierbar**. Kein Retry, keine Quittungsaenderung.
* **Sicherer 169er Neuversuchsvertrag auf Production main (PR524 gemergt).** Die Quittungskennung ist jetzt ein ausdruecklicher, streng gepruefter Parameter (`HELMUT_VERSTEHEN_169_QUITTUNG` bzw. Workflow-Input `quittungsschluessel`): ohne Kennung gilt weiterhin der alte Auftrag — die alte Quittung `verstehen169-20260922-a` bleibt **verbraucht und unveraendert**, die ausdrueckliche Wiederverwendung der alten Kennung und Fremdformate stoppen fail closed, ein einstelliger Suffix ist zulaessig. Alle Grenzen unveraendert (169/122/113/0,80 USD/35 min/4 USD), keine automatische Wiederholung. **Noch keine neue Quittungskennung vergeben.** Der Problemvorgang `vg-abschaffung-20260911-7420f6` bleibt CAS-gesperrt (`unbekannt`, keine Aufloesung vorgenommen) und wird ohne Betreibereingriff ehrlich als `skipped-failed` gemeldet; erneutes Verstehen nur ueber den kanonischen Weg `helmut_verstehen_ausgang_aufloesen(…, 'erneut')` + Wiederaufnahmepfad. Test `verstehen-169-neuversuch-test.js` (19/19, offline, 0 Modellaufrufe, 0 Writes). **Kein neuer 169er Lauf gestartet.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §17.
* **Profile:** letzter fachlich belegter Zustand nach dem abgeschlossenen Quellen und Understanding Vorlauf: **504 Profile, 0 aktiv**. Alle Profile bleiben inaktiv bis zu einer getrennten ausdruecklichen Startfreigabe.
* **Ruhender Betrieb:** im letzten Production Nachweis zu diesem Stand keine unerledigten Jobs, keine lebenden Job Leases und keine lebenden Understanding Leases. Dieser Sprint (Analyse, Code, Tests, Doku) fuehrt keine neue Datenbankinventur aus und schreibt nichts nach Production.
* **Kosten:** atomarer technischer Tagesriegel bleibt **4 USD je UTC Tag**. Alte 10 USD Betreiberfreigaben erhoehen diesen technischen Riegel nicht. Keine neue Kostenfreigabe durch diesen Sprint.
* **Offline-Pflichtlauf auf eine explizite Kernmenge reduziert (Testorganisation, kein Produktcode).** Der kanonische Standardlauf `node scripts/lokal.js -- node scripts/run-offline-tests.js` und das Pflicht-CI-Gate fuehren nur noch die **explizite Standardmenge** aus **93** Suiten aus (zuvor 453) — aktuelle Schutz-/Sicherheitsvertraege, aktuelle 500er-Schutzlogik und die grundlegenden Vertraege des heutigen Production-Pfads. Die vollstaendige Regression bleibt ueber `node scripts/run-offline-tests.js --extended` bzw. `npm run test:offline:extended` bewusst ausfuehrbar (**457** Suiten, davon **364** nicht mehr Pflicht). Keine Suite wurde geloescht oder fachlich geaendert. Eine neue Testdatei wird **nicht** mehr automatisch Pflicht: sie muss bewusst in `STANDARD` eingetragen werden (dauerhafte Regel neu in `CLAUDE.md` §6). Vertrag testgesichert durch `scripts/offline-suite-auswahl-test.js`. Kanonische Begruendung: Kopfkommentar `scripts/run-offline-tests.js`.
* **Automatische Bereichs-Regression (Testorganisation, kein Produktcode).** Zusaetzlich zum Standard laeuft bei jedem PR automatisch die fachliche Regression der **tatsaechlich geaenderten Bereiche** (eigener CI-Schritt „Bereichs-Regression“). Kanonische, deterministische Zuordnung: `scripts/bereichsauswahl.js` (keine KI, keine stille Heuristik). Bereiche u. a. Briefing, Lage, Radar, Quellen, Verstehen, Profil, Auth, Admin, Matching/Scoring, UI, Landesmodule/PARDOK, Warteschlange/Pipeline, Datenbank/Migrationen, Prosa, B055, 500-Nachweis. Reine Doku-Aenderungen starten keine Fachregression; eine relevante, nicht zuordenbare Datei oder eine geteilte Kerndatei erzwingt die konservative Sammelmenge (fail closed, sichtbar gemeldet). Die vollstaendige Extended-Suite bleibt bewusst manuell. Vertrag testgesichert durch `scripts/bereichsauswahl-test.js`.
* **Understanding-Akteursbeleg praezisiert (Produktcode, Branch `fix/understanding-akteursbeleg-20260923`).** Zwei belegte Ursachen behoben: (a) der bestaetigte Herausgebersuffix eines Titels (z. B. `- bundesregierung.de`) gilt **nicht mehr** als Quellentext — der Modellprompt traegt nur den Titelrumpf aus der kanonischen `herausgeber.titelRumpf()`-Logik; `herausgeber`, `url` und gespeicherte Dokumente bleiben unveraendert, Quellenhash und `understandingQuelle()` unveraendert. (b) Im Production-Speicherpfad werden woertlich belegte, aber eindeutig **falsch typisierte** Akteurswerte deterministisch entfernt (z. B. `Bundesregierung` als `government` aus `mentioned_ministries`), anhand der zentralen Entitaetsschicht. Unbelegte Werte, Schema, `decision_level-Konflikt`, CAS/Fencing, Locks, Budget und Quellenhash bleiben unveraendert streng; der Goldsetauswerter prueft weiter streng. Testgesichert durch `scripts/understanding-akteursbeleg-test.js`.
* **Rein lesender 169er Planlauf als eigener Bedienweg (kein Produktcode; Branch `feat/verstehen-169-planlauf-workflow-20260923`).** Die belegte Bedienluecke ist geschlossen: der Planmodus des 169er Runners braucht echten Production-Lesezugriff, den `scripts/lokal.js` bewusst entfernt (der Plan endet dort strukturell mit `verstehen-speicher-nicht-verfuegbar`). Neu ist `.github/workflows/verstehen-169-plan.yml`: ausschliesslich manuell (`workflow_dispatch` auf `main`, `run_attempt = 1`, `contents: read`), verlangt den vollen `runtime_commit` als Pflicht-Input, prueft ihn per `git rev-parse HEAD` gegen den echten Checkout, nutzt dieselbe globale Concurrency-Gruppe und ruft **denselben** Runner **ohne** `HELMUT_VERSTEHEN_169_SCHARF` auf. Er erhaelt nur `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sowie `HELMUT_V3_STORE`/`HELMUT_STORAGE_BACKEND`/`HELMUT_SUPABASE_STORE_ID` — **keine** Azure-/Modell-Zugangsdaten, keine Quittung, keine Profil-/Lock-/CAS-/Budget-/Cron-Variablen. Der scharfe Workflow bleibt unveraendert und getrennt; es gibt bewusst keine gemeinsame Umschaltung (`mode=...`). Planlauf = rein lesend: 0 Modellaufrufe, 0 Writes, keine Quittung, 0 USD. Testgesichert durch `scripts/verstehen-169-workflow-test.js` (**130/130**, offline). **Kein Workflow wurde ausgefuehrt, keine Production-Wirkung.**

## 2 · Stand auf dem Weg zum 500er Production Nachweis

### Erledigt und nicht ohne Grund wiederholen

1. **36er Prosa Fachabnahme bestanden.** Lauf `35704398267`: exakt 36 von 36 Pfadfaellen ausgewertet, 12 positive korrekt akzeptiert, 24 negative oder unklare korrekt nicht akzeptiert, 0 Fehlurteile, 36 Aufrufe, kein Retry. Kosten `0,189405 USD`. Diese Abnahme ist ein Fachbeleg, aber kein 500er Gesamtnachweis. [Beleg](betrieb/prosa-36er-vertrag-2026-09-21.md).

2. **Quellenreparaturen integriert.** Die Reparaturkette bis PR473 ist abgeschlossen. Ereignisketten sind fuer die belegten Faelle getrennt, amtliche Originalangaben erhalten, verschiedene DIP Kennungen gegen Titel und RSS Reihenfolge geschuetzt und Quellentitel werden nicht mehr sinnveraendernd abgeschnitten. Die vollstaendigen Integrationsdaten und CI Werte stehen im Archivsnapshot und im [500 Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

3. **Quellen Vorlauf fuer 500 fachlich abgeschlossen.** Zwei scharfe Quellenlaeufe erzeugten zusammen **169 neue Rohdokumente**. Der erste Lauf versuchte 43 deduplizierte Abrufe, davon 5 erfolgreich und 38 wegen Anbieter Minutengrenze fehlgeschlagen. Der kontrollierte Fortsetzungslauf erledigte die 38 Restabrufe vollstaendig und erzeugte weitere 137 Rohdokumente. **Kein weiterer Quellenabruf ist fuer diesen Vorlauf erforderlich.** Der zu breite Schutz Hash wurde danach durch PR517 korrigiert. [Beleg](betrieb/500-betriebsplan-2026-09-20.md).

4. **Einmaliger Understanding Lauf vorbereitet und genau einmal ausgefuehrt.** Gebunden sind exakt **169 Rohdokumente**, `idHash 5f387840…a2ed9`, **122 Cluster**, hoechstens **113 Kandidaten**, maximal **0,80 USD**, maximal **35 Minuten**, Aufruftyp `understanding-rueckstand`, technischer Tagesriegel unveraendert 4 USD. Der rein lesende Planlauf ergab zunaechst 114 Kandidaten und stoppte korrekt fail closed an `verstehen-kandidaten-ueber-deckel`; PR519 korrigierte das Resolver Fenster generisch. Der scharfe Lauf (Run `35829992528`, 23.09.2026) stoppte nach **einem** Modellaufruf fail closed mit `verstehen-ausgang-unbekannt`; die Diagnose- und Ergebniswahrheit dieses Laufs ist in diesem Sprint repariert und testgesichert (siehe §1 und [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16). **Kein Retry, kein zweiter Lauf.**

### Noch offen fuer den 500er Nachweis

1. Den einmaligen 169er Understanding Lauf auswerten und ueber das weitere Vorgehen entscheiden. Er wurde **genau einmal** ausgefuehrt (Run `35829992528`) und stoppte nach einem Modellaufruf fail closed (`verstehen-ausgang-unbekannt`, Quittung terminal `unbekannt`). Ein erneuter Lauf ist eine **getrennte Betreiberentscheidung** — er braucht eine neue, vom Betreiber vergebene Quittungskennung (siehe [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §17) und ist ausdruecklich kein automatischer Folgeschritt dieses Sprints.

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
2. **Die Betreiberentscheidung ueber den neuen 169er Versuch steht aus** (der sichere Vertrag selbst ist mit PR524 auf Production main). Offen: neue Quittungskennung vergeben, Problemvorgang `vg-abschaffung-20260911-7420f6` per `erneut` freigeben und erst danach ggf. genau einen neuen scharfen 169er Lauf freigeben. Kein Retry, kein automatischer Schritt.
3. **Der unbekannte CAS-Zustand des Vorgangs `vg-abschaffung-20260911-7420f6` bleibt unveraendert** (`zustand=unbekannt`, `ki_aufrufe=1`, `letzter_grund=validierung-fehlgeschlagen`) — keine Aufloesung, keine Quittungsaenderung ohne Freigabe. Erneutes Verstehen nur ueber den kanonischen Weg `helmut_verstehen_ausgang_aufloesen(…, 'erneut')` mit anschliessender Wiederaufnahme.
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

**Getrennte Betreiberentscheidungen, in dieser Reihenfolge:** (a) den Problemvorgang `vg-abschaffung-20260911-7420f6` per kanonischem Weg `helmut_verstehen_ausgang_aufloesen('vg-abschaffung-20260911-7420f6', 'erneut')` freigeben und ueber den Wiederaufnahmepfad verstehen lassen, (b) eine neue Quittungskennung vergeben (Format `verstehen169-<JJJJMMTT>-<suffix>`), (c) erst danach ggf. genau einen neuen scharfen 169er Lauf freigeben. **Kein Retry, kein Dispatch, keine Quittungs-, CAS- oder Budgetaenderung ohne Freigabe.**

Nach erfolgreicher Vollauswertung des 169er Laufs wird neu entschieden, ob noch ein technischer oder qualitativer Blocker vor dem exakt 500er Testfenster besteht. Bereits erfolgreich belegte Pruefungen werden nicht ohne sachlichen Grund wiederholt.

## 7 · Kanonische Belege

* [500er Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)
* [500er Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md)
* [36er Prosa Fachabnahme](betrieb/prosa-36er-vertrag-2026-09-21.md)
* [169er Understanding Lauf](betrieb/verstehen-einmalig-169-20260922.md)
* [Production Beweisprotokoll](betrieb/production_beweisprotokoll.md)
* [Datenmotor Restliste](datenmotor-restliste.md)
* [Vollstaendiger vorheriger CURRENT_STATE Snapshot](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md)
