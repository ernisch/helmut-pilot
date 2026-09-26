# CURRENT STATE — Helmut

**Letzte Aktualisierung: 26.09.2026.** Diese Datei ist das kompakte Cockpit fuer den aktuellen, entscheidungsrelevanten Zustand. Die vollstaendige vorherige Fassung mit allen historischen Details, Flags, Migrationen, Cron Angaben, alten Sprintstaenden und Belegen bleibt wortgleich erhalten unter [archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md). Aeltere historische Statusfassungen bleiben zusaetzlich im bestehenden [Archiv](archive/README.md).

## 1 · Aktueller Stand

* **Roadmap26.09.: kein500er Start.** [PR609 und zwei Quellenkorrekturen Production-verifiziert](betrieb/bundestag-artikelstand-20260926.md): Polizeigesetz mit amtlichem Artikelstand, Tankrabatt mit vier Quellen. Nachlesung11:39UTC:500/0, Profilhashes gleich; nach regulärem Understanding-Lauf0,293493USD,0 offene Reserven,4USD-Riegel. Lokale Agentenkosten separat. Vollständiger lokaler Briefing-Bauer11:18UTC:127 Tagesprioritäten,373 ohne; ein persönlicher Radar-Hinweis,0 Beobachtungshinweise. Kein gefülltes Drei-Bereiche-Paket. Lage-Abnahme, Vollversorgung und Kosten-/Zeitplan offen. [Autonomer Auftrag](betrieb/autonom-bis-500-starttor-20260926.md).


* **Production-Belege dieses Sprints:** PR #549 (Trennung von Lage/Radar/Briefing) gemergt als `00ed4c27b7703849d57ca9f357dcf15a40f5f311`, Vercel `dpl_6iDLuovtgpFL7DSZX1M2djMYugdQ` READY, PR-CI `36031516394` SUCCESS. Auftragsbezogene Reparaturen: [PR #550](https://github.com/ernisch/helmut-pilot/pull/550) (Appstart ohne Hintergrundmodelle, begrenzte Quellenabrufe) und [PR #551](https://github.com/ernisch/helmut-pilot/pull/551) (500er Fachleser an neue Testfenster gebunden); ihre finalen Merge-/Ausrollbelege stehen direkt im jeweiligen PR. Vierer-Migration angewendet; Zweierlauf `36029408684` nach einem Parteienfehler gestoppt: 1 Aufruf, 0,005804 USD, Koçak nicht begonnen. [Vierer-Bilanz](betrieb/verstehen-vier-nacharbeit-20260924.md). **Noch keine belastbare 500er Startbereitschaft**, siehe [Starttor](betrieb/500-starttor-20260924.md).
* **Fuenfter (freigegebener) scharfer 169er Lauf — erstmals ALLE 122 Cluster verarbeitet, fachlich nicht bestanden.** Workflow-Run `35987448290`, `run_attempt = 1`, `failure`, 24.09.2026 10:28:42–10:54:17 UTC, Runtime-Commit = Dispatch = Checkout `2d412d0418f5d6170f2c34ff69dbd846c4e0c703`, Dokument-Snapshot `ea84f26c…`. Die Bindung hielt; der Schutzvertrag passierte mit **81 Modellkandidaten** (≤ 113) — **PR #541 wirkte belegbar** (der vierte Lauf war noch mit 114 Kandidaten gescheitert). `abbruchGrund = null`, `vollstaendigVerarbeitet = true`, `fachlichBestanden = false`; Bilanz `saved 63`, `updated 14`, `duplicate 34`, `merged 7`, `skipped-invalid 4` (`unbekannt 4`); **81 Modellaufrufe**, `quellenabrufe 0`, `profilwrites 0`, `kommunikation 0`; Laufkosten **0,522795 USD** von 0,80 USD; Quittung `verstehen169-20260924-c` terminal **`unbekannt`** (verbraucht). **Vier lokale `unknown`** (Klasse A, kein globaler Abbruch): `vg-gemeinsame-20260921-dcd0f5`, `vg-linkenpolitiker-20260921-37cdeb` und `vg-arbeitsplätze-20260715-6cc672` (Aktualisierung) mit `quellenbeleg-parteien`, sowie `vg-verzögerung-20230613-95c80f` mit `validierung-fehlgeschlagen` und leerer Fehlerliste. CAS danach je `zustand=unbekannt` (Betreiberbeleg). **In diesem 169er Lauf keine erneute Freigabe; die spaetere isolierte Nacharbeit steht oben.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §24.
* **PR #542 ist gemergt und ausgerollt; kein neuer fachlicher Erfolg der vier Faelle belegt.** (a) Ein unbelegter struktureller `parteien`-Wert sperrt die **gesamte** Antwort weiterhin fail closed (`quellenbeleg-parteien`, nichts wird gespeichert); eine Reduktion von `parteien` wurde geprueft und **verworfen**, weil eine umschreibende Prosa semantisch von der entfernten unbelegten Parteibeteiligung abhaengen kann, **ohne** den Namen zu nennen, und dafuer keine belastbare Belegstruktur je Aussage existiert. `mentioned_parties` und die Ministeriumslisten werden unveraendert weiter reduziert; `mentioned_parties` wird **nie** zu `parteien` befoerdert. `ausschuesse`, der strenge Validator und der GOLDSET-Auswerter bleiben unveraendert streng. (b) Rein schemabedingte Ablehnungen liefern jetzt einen **wertfreien** Fehlercode (`schema-<art>:<feld>`, `dsgvo-<art>`); der Schema-/DSGVO-Bereich ist zusaetzlich vollstaendig vermessen — real entstehen nur zwei Klassen (Pflichtprosa leer, DSGVO), und fuer beide ist **fail closed bewusst korrekt** (weder Erfinden noch Kuerzen zulaessig). Grenzen unveraendert (113 / 0,80 USD / 35 min / 4 USD Tagesriegel). Gezielt getestet: `parteien-quellenbindung-test` 31/31, `understanding-akteursbeleg-test` 21/21, `ministerien-quellenbindung-test` 22/22, `verstehen-einmalig-test` 117/117, `understanding-schema-diagnose-test` 51/51. [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §25.
* **Sicherer 169er Neuversuchsvertrag auf Production main (PR524 gemergt).** Die Quittungskennung ist jetzt ein ausdruecklicher, streng gepruefter Parameter (`HELMUT_VERSTEHEN_169_QUITTUNG` bzw. Workflow-Input `quittungsschluessel`): ohne Kennung gilt weiterhin der alte Auftrag — die alte Quittung `verstehen169-20260922-a` bleibt **verbraucht und unveraendert**, die ausdrueckliche Wiederverwendung der alten Kennung und Fremdformate stoppen fail closed, ein einstelliger Suffix ist zulaessig. Alle Grenzen unveraendert (169/122/113/0,80 USD/35 min/4 USD), keine automatische Wiederholung. **Zwischenzeitlich wurden `verstehen169-20260924-a` und `verstehen169-20260924-b` vergeben und verbraucht.** Der damalige Problemvorgang `vg-abschaffung-20260911-7420f6` ist NICHT mehr gesperrt: Production-Beleg `zustand=fertig`, `versuche=4`, `ki_aufrufe=4`, `fencing=4`, `ergebnis_fencing=4`, `besitzer/lease = null`, `letzter_grund = null`, Knowledge Object vorhanden — **nicht erneut freigeben** (§4.3). Test `verstehen-169-neuversuch-test.js` (19/19, offline, 0 Modellaufrufe, 0 Writes). **Der PR524-Sprint selbst startete keinen Lauf; die spaeteren scharfen Laeufe stehen oben (§1).** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §17.
* **Profile25.09.12:42UTC:** exakt500 Mandatsprofile/0 aktiv,501 Identitaeten; vier Nichtzielprofile gesichert entfernt. Alle500 aktivierungsreif; noch kein Funktionsnachweis. Belege siehe §6.
* **Vierer-Migration Production-verifiziert:** `20260924140548_verstehen_vier_start.sql` angewendet, Supabase-Version `20260924161115`. Nachkontrolle 24.09.2026, 16:11:46 UTC: Funktionskoerper exakt, SECURITY INVOKER, service_role darf ausfuehren, PUBLIC/anon/authenticated nicht. 504 Profile, 0 aktiv; Fingerabdruecke aller Profilzeilen und der vier CAS-Zeilen vor/nachher identisch; keine Jobs, Leases, Locks oder neue Vierer-Quittung. Kein Modellaufruf. [Beleg](betrieb/verstehen-vier-nacharbeit-20260924.md).
* **Kosten:** atomarer technischer Tagesriegel bleibt **4 USD je UTC Tag**. Alte 10 USD Betreiberfreigaben erhoehen diesen technischen Riegel nicht. Keine neue Kostenfreigabe durch diesen Sprint.
* **Offline-Pflichtlauf auf eine explizite Kernmenge reduziert (Testorganisation, kein Produktcode).** Der kanonische Standardlauf `node scripts/lokal.js -- node scripts/run-offline-tests.js` und das Pflicht-CI-Gate fuehren nur noch die **explizite Standardmenge** aus **93** Suiten aus (zuvor 453) — aktuelle Schutz-/Sicherheitsvertraege, aktuelle 500er-Schutzlogik und die grundlegenden Vertraege des heutigen Production-Pfads. Die vollstaendige Regression bleibt ueber `node scripts/run-offline-tests.js --extended` bzw. `npm run test:offline:extended` bewusst ausfuehrbar (**457** Suiten, davon **364** nicht mehr Pflicht). Keine Suite wurde geloescht oder fachlich geaendert. Eine neue Testdatei wird **nicht** mehr automatisch Pflicht: sie muss bewusst in `STANDARD` eingetragen werden (dauerhafte Regel neu in `CLAUDE.md` §6). Vertrag testgesichert durch `scripts/offline-suite-auswahl-test.js`. Kanonische Begruendung: Kopfkommentar `scripts/run-offline-tests.js`.
* **Automatische Bereichs-Regression (Testorganisation, kein Produktcode).** Zusaetzlich zum Standard laeuft bei jedem PR automatisch die fachliche Regression der **tatsaechlich geaenderten Bereiche** (eigener CI-Schritt „Bereichs-Regression“). Kanonische, deterministische Zuordnung: `scripts/bereichsauswahl.js` (keine KI, keine stille Heuristik). Bereiche u. a. Briefing, Lage, Radar, Quellen, Verstehen, Profil, Auth, Admin, Matching/Scoring, UI, Landesmodule/PARDOK, Warteschlange/Pipeline, Datenbank/Migrationen, Prosa, B055, 500-Nachweis. Reine Doku-Aenderungen starten keine Fachregression; eine relevante, nicht zuordenbare Datei oder eine geteilte Kerndatei erzwingt die konservative Sammelmenge (fail closed, sichtbar gemeldet). Die vollstaendige Extended-Suite bleibt bewusst manuell. Vertrag testgesichert durch `scripts/bereichsauswahl-test.js`.
* **Understanding-Akteursbeleg praezisiert (Produktcode, Branch `fix/understanding-akteursbeleg-20260923`).** Zwei belegte Ursachen behoben: (a) der bestaetigte Herausgebersuffix eines Titels (z. B. `- bundesregierung.de`) gilt **nicht mehr** als Quellentext — der Modellprompt traegt nur den Titelrumpf aus der kanonischen `herausgeber.titelRumpf()`-Logik; `herausgeber`, `url` und gespeicherte Dokumente bleiben unveraendert, Quellenhash und `understandingQuelle()` unveraendert. (b) Im Production-Speicherpfad werden woertlich belegte, aber eindeutig **falsch typisierte** Akteurswerte deterministisch entfernt (z. B. `Bundesregierung` als `government` aus `mentioned_ministries`), anhand der zentralen Entitaetsschicht. Unbelegte Werte, Schema, `decision_level-Konflikt`, CAS/Fencing, Locks, Budget und Quellenhash bleiben unveraendert streng; der Goldsetauswerter prueft weiter streng. Testgesichert durch `scripts/understanding-akteursbeleg-test.js`.
* **Rein lesender 169er Planlauf als eigener Bedienweg (kein Produktcode).** `.github/workflows/verstehen-169-plan.yml`: ausschliesslich manuell (`workflow_dispatch` auf `main`, `run_attempt = 1`, `contents: read`), verlangt den vollen `runtime_commit` und bindet ihn **dreiseitig fail closed** (Input = `github.sha` des Dispatches = echter Checkout). Nur `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` und die Speicher-Variablen — **keine** Azure-/Modell-Zugangsdaten, keine Quittung, kein CAS-/Lock-/Profil-/Budget-/Cron-Schalter. Ausgefuehrt (Run `35932243562`): 169 Dokumente, ID-Hash `5f387840…a2ed9`, 122 Cluster, 110 Kandidaten (≤ 113), 0 Aufrufe, 0 Writes, 0 USD. Testgesichert durch `scripts/verstehen-169-workflow-test.js` (**152/152**, offline).
* **Zweiter scharfer 169er Lauf ausgefuehrt — fail closed, vollstaendig diagnostiziert.** Workflow-Run `35934515630`, `run_attempt = 1`, `failure`, 23.09.2026 23:37–23:41 UTC. Die dreiseitige Bindung wurde gehalten (`runtime_commit` = Dispatch-SHA = Checkout `535fd630…`); Dokument-Snapshot `ea84f26c…`; Quittung `verstehen169-20260924-a` **terminal `unbekannt`**. Gebunden 169 Dokumente / 122 Cluster / 110 Kandidaten, Schutzvertrag `true`. Verarbeitet wurden nur **10 von 122 Clustern** (17 von 169 Dokumenten) mit **7 Modellaufrufen**, Laufkosten **0,042516 USD**; danach Stopp `verstehen-ausgang-unbekannt` am Cluster `vg-reformen-20260908-c646df` (`status skipped-invalid`, `validierungsfehler = ["quellenbeleg-mentioned_people"]`). Keine Profilwirkung (`profilwrites 0`), keine Kommunikation, keine automatische Wiederholung. **Die uebrigen 112 Cluster / 152 Dokumente sind NICHT bilanziert; kein 169er Nachweis.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16/§17.
* **Dritter scharfer 169er Lauf ausgefuehrt — fail closed, vollstaendig bilanziert.** Workflow-Run `35964405263`, `run_attempt = 1`, `failure`, 24.09.2026 06:25–06:33 UTC, Runtime-Commit `b35e34a208fe7972385e2ed7bfe5d72f15f2dc65`, Dokument-Snapshot `ea84f26c…`. Die dreiseitige Bindung wurde gehalten; Quittung `verstehen169-20260924-b` **terminal `unbekannt`**. Gebunden 169 Dokumente / 122 Cluster / 113 Kandidaten, Schutzvertrag `true`. Verarbeitet wurden **36 von 122 Clustern** (54 von 169 Dokumenten) mit **24 Modellaufrufen**, Laufkosten **0,15696 USD**; danach Stopp `verstehen-ausgang-unbekannt` am Cluster `vg-gemeinsame-20260921-dcd0f5` (`status skipped-invalid`, `validierungsfehler = ["quellenbeleg-parteien"]`). Keine Profilwirkung (`profilwrites 0`), keine Kommunikation, keine automatische Wiederholung. **Die uebrigen 86 Cluster / 115 Dokumente sind NICHT bilanziert; kein 169er Nachweis.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §20.
* **PR537: Erwaehnungslisten werden deterministisch auf belegte Werte reduziert.** Unbelegte Werte entfallen aus `mentioned_ministries`, `mentioned_parties`, `mentioned_people`, `mentioned_mps`, `mentioned_committees` und beiden Ministeriumslisten. Belegte Werte bleiben erhalten. Beteiligungslisten `parteien`/`ausschuesse`, Schema, Quellenbindung, Goldset und technische Schutzregeln bleiben streng. Der zuvor gesperrte Reformen-Vorgang wurde produktiv fertig; der dritte 169er Lauf scheiterte weiterhin an `quellenbeleg-parteien`. Die Parteienreduktion wurde mit PR542 verworfen. Kein vollstaendiger fachlicher 169er Erfolg. [Details und Belege](betrieb/verstehen-einmalig-169-20260922.md) §18–25.

* **Lokaler Clusterfehler beendet den 169er Lauf nicht mehr (Produktcode, PR #539, gemergt in `main` `cefffd95`; Vercel Production READY).** Bisher beendete EIN Cluster mit `ausgang = unbekannt` den GESAMTEN Lauf; der dritte Lauf stoppte dadurch nach 36 von 122 Clustern, 115 von 169 Dokumenten blieben ungeprueft. Der Runner trennt jetzt zwei Klassen: **Klasse A** = LOKALER Clusterfehler (`status = skipped-invalid`, z. B. `quellenbeleg-parteien`): der Vorgang bleibt terminal `unbekannt` gesperrt (CAS/Fencing, keine Verknuepfung, KEIN Retry), der Lauf arbeitet die uebrigen unabhaengigen Cluster weiter ab und bilanziert sie. **Klasse B** = GLOBALER Vertrags-/Infrastrukturfehler (`cluster-error` unerwarteter Motorwurf, `skipped-error`/`skipped-store`/`skipped-veraltet` sowie alle Bindungs-, Lock-, Quittungs-, Kosten- und Zeitfehler): unveraendert sofortiger Gesamtabbruch. Ein `cluster-error` ist ausdruecklich KEIN lokaler Fachfehler und kann **nie** zu `ok`/`fachlichBestanden` = true fuehren. **„Vollstaendig abgearbeitet" bleibt getrennt von „fachlich bestanden":** `bilanz.unbekannt > 0` ⇒ Bericht `vollstaendigVerarbeitet = true`, `fachlichBestanden`/`ok` = false, Quittung `unbekannt`. **Ein globaler Abbruch hat beim Quittungsstatus Vorrang vor lokalen unknown** (auch wenn zuvor ein `skipped-invalid` auftrat) ⇒ Quittung `gestoppt`. **Gemergt und ausgerollt (`cefffd95`, Vercel Production READY), Pflicht-CI nach dem Merge gruen (Run `35975413852`); die Semantik ist durch den fuenften Lauf (`35987448290`) belegt — er hat alle 122 Cluster abgearbeitet.** Testgesichert durch `scripts/verstehen-einmalig-test.js` §25 (offline).
* **Vierter 169er Lauf (24.09.08:55UTC) verbraucht.** Run35978125747 stoppte vor Modellen bei114 statt113 Kandidaten. PR541 behob die Ueberzaehlung; der fuenfte Lauf bestaetigte81 Kandidaten. [Vollstaendiger Beleg](betrieb/verstehen-einmalig-169-20260922.md) §22–24.

* **PR541 Production-belegt:** Plan und Motor verwenden dieselbe Kandidatenentscheidung; ausdrueckliche CAS-Freigabe erreicht genau ihren Vorgang. Grenzen113 Aufrufe/0,80USD/35min und4USD Tagesriegel unveraendert. [Ursachen und Pruefbelege](betrieb/verstehen-einmalig-169-20260922.md) §23–24.


## 2 · Stand auf dem Weg zum 500er Production Nachweis

### Erledigt und nicht ohne Grund wiederholen

1. **36er Prosa Fachabnahme bestanden.** Lauf `35704398267`: exakt 36 von 36 Pfadfaellen ausgewertet, 12 positive korrekt akzeptiert, 24 negative oder unklare korrekt nicht akzeptiert, 0 Fehlurteile, 36 Aufrufe, kein Retry. Kosten `0,189405 USD`. Diese Abnahme ist ein Fachbeleg, aber kein 500er Gesamtnachweis. [Beleg](betrieb/prosa-36er-vertrag-2026-09-21.md).

2. **Quellenreparaturen integriert.** Die Reparaturkette bis PR473 ist abgeschlossen. Ereignisketten sind fuer die belegten Faelle getrennt, amtliche Originalangaben erhalten, verschiedene DIP Kennungen gegen Titel und RSS Reihenfolge geschuetzt und Quellentitel werden nicht mehr sinnveraendernd abgeschnitten. Die vollstaendigen Integrationsdaten und CI Werte stehen im Archivsnapshot und im [500 Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

3. **Quellen Vorlauf fuer 500 fachlich abgeschlossen.** Zwei scharfe Quellenlaeufe erzeugten zusammen **169 neue Rohdokumente**. Der erste Lauf versuchte 43 deduplizierte Abrufe, davon 5 erfolgreich und 38 wegen Anbieter Minutengrenze fehlgeschlagen. Der kontrollierte Fortsetzungslauf erledigte die 38 Restabrufe vollstaendig und erzeugte weitere 137 Rohdokumente. **Kein weiterer Quellenabruf ist fuer diesen Vorlauf erforderlich.** Der zu breite Schutz Hash wurde danach durch PR517 korrigiert. [Beleg](betrieb/500-betriebsplan-2026-09-20.md).

4. **Einmaliger Understanding Lauf vorbereitet; erster scharfer Lauf ausgefuehrt.** Gebunden sind exakt **169 Rohdokumente**, `idHash 5f387840…a2ed9`, **122 Cluster**, hoechstens **113 Kandidaten**, maximal **0,80 USD**, maximal **35 Minuten**, Aufruftyp `understanding-rueckstand`, technischer Tagesriegel unveraendert 4 USD. Der rein lesende Planlauf ergab zunaechst 114 Kandidaten und stoppte korrekt fail closed an `verstehen-kandidaten-ueber-deckel`; PR519 korrigierte das Resolver Fenster generisch. Der scharfe Lauf (Run `35829992528`, 23.09.2026) stoppte nach **einem** Modellaufruf fail closed mit `verstehen-ausgang-unbekannt`; die Diagnose- und Ergebniswahrheit dieses Laufs ist in diesem Sprint repariert und testgesichert (siehe §1 und [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §16). **Kein Retry, kein zweiter Lauf desselben Auftrags.**

### Noch offen fuer den 500er Nachweis

1. **169er Understanding Lauf bleibt fachlich offen.** Fuenf scharfe Laeufe sind ausgefuehrt und gescheitert oder unvollstaendig (Run `35829992528`, `35934515630`, `35964405263`, `35978125747` und `35987448290`; alle terminal `unbekannt`). Der fuenfte (24.09.2026, 10:28 UTC) hat **erstmals alle 122 Cluster** verarbeitet und scheiterte nur noch an **vier lokalen `unknown`** — kein globaler Abbruch, kein Retry. Der strukturelle Grund der frueheren Abbrueche (PR #539: ein lokaler Fehler sperrt nur seinen Cluster) und die Kandidaten-Ueberzaehlung (PR #541) sind **Production-belegt**. Die vier lokalen Fehler sind im Code behandelt (PR #542, **ausgerollt, neue Fallresultate nicht belegt**): die drei `quellenbeleg-parteien`-Faelle bleiben bewusst strickt fail closed (Reduktion geprueft und verworfen), der vierte Fall liefert jetzt einen wertfreien Fehlercode. **Die isolierte Zweier-Nacharbeit ist inzwischen ebenfalls gestoppt; vollstaendige Vierer-Bilanz in §4. Kein weiterer Retry.** [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §23–§25.

2. Danach fuer **exakt 500 aktive Testprofile** frische Vollversorgung belegen. Aktivierung allein ist kein Funktionsnachweis.

3. Fuer alle 500 Profile die **1500 erwarteten Ergebnispositionen** vollstaendig pruefen: Mandatsbriefing, Morgenbriefing und Lage. Fehlende, leere, doppelte oder unbrauchbare Ergebnisse getrennt ausweisen.

4. Fachliche Qualitaet nach den geltenden Kriterien pruefen. Stichproben duerfen nie als vollstaendige Textpruefung ausgegeben werden.

5. Belastbare Gesamtzeit und Gesamtkosten messen, automatische Terminierung beweisen und den sicheren Rueckweg auf 0 aktive Testprofile bestaetigen.

Der historische Abschlusslauf vom 15. und 16.09. hat den Gesamtnachweis **nicht** bestanden: 497 von 500 Mandatsbriefings, 131 von 500 Morgenbriefings, 5 von 500 Lage Ergebnisse und damit keine Vollversorgung. Die Reparaturen danach machen diesen alten Lauf nicht nachtraeglich erfolgreich.

## 3 · Verbindliche Production Grenzen

* **Nur ein schreibender Ausfuehrer** im selben Production oder Testbereich. Fremde Arbeit erhalten. Bei unklarer Parallelitaet nicht schreiben.
* **Alle500 Zielprofile bleiben inaktiv**, bis fachliche Versorgung, Kosten-/Zeitplan, Endwaechter und frischer Startplan fuer den autorisierten Nachweis belegt sind.
* **Freigaben:** Die aktuelle `AGENTS.md` und der [autonome Betreiberauftrag26.09.](betrieb/autonom-bis-500-starttor-20260926.md) sind massgeblich. Gruene auftragsbezogene Merges und regulaere Deployments sind autorisiert. Gesamtkosten dieses Auftrags unter4USD. Keine Aktivierung oder500er Test in diesem Auftrag. Historische Merge-GO-Forderungen sind ueberholt.
* `HELMUT_SOURCE_MODE=on`, `HELMUT_VERSTEHEN_CAS=on`, `HELMUT_SCALABLE_PIPELINE=on` im Modus `shadow`. `HELMUT_TENANT_LLM_CAP` bleibt aus und darf fuer den 500er Test nicht eingeschaltet werden. Kommunikations und Testkohortenriegel bleiben wirksam.
* Relationaler Profilpfad und Exklusivmodus sind Production belegt. Vor einem neuen 500er Fenster Daten und Ausfuehrungskontext frisch abgleichen.
* Die Endfunktion fuer das Testfenster ist installiert. Offene Migrationen `20260720`, `20260825101500` und `20260902121500` bleiben unangewendet und brauchen jeweils separate Freigabe.
* Der Quellenbestand bleibt stark von Google News abhaengig. Historischer Stand: 146 von 163 Abrufwegen. Das ist ein Betriebsrisiko, aber kein Grund, den abgeschlossenen 169er Quellen Vorlauf zu wiederholen.
* Branch Protection ist weiterhin nicht technisch erzwungen. Pflicht CI muss deshalb vor jedem Merge bewusst geprueft werden.

Vollstaendige historische Betriebswerte zu Crons, Flags, Migrationen, Quellenpaketen, Budgets, Altprofilen und frueheren Production Aufnahmen stehen im [Archivsnapshot vom 23.09.](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md).

## 4 · Aktuelle offene Blocker

1. **500er Gesamtabnahme fehlt.** Das ist der zentrale technische Production Nachweis.
2. **Vierer-Block vollstaendig bilanziert, fachlich nicht bestanden.** Demo-Anreise: erneuter Parteienfehler, CAS unbekannt 3/3/3. Koçak: wegen Stoppregel nicht begonnen, unveraendert 1/1/1. Arbeitsplaetze: moeglicher Ereignismix, zurueckgestellt 2/2/2 (nur altes Ergebnis-fencing 1). Dachmeldung: alte Quelle ohne URL, zurueckgestellt 1/1/1. Alle gesperrt, ohne Besitzer/Lease; Quittung `verstehen4-20260924-a` verbraucht. Keine automatische Wiederaufnahme. [Bilanz](betrieb/verstehen-vier-nacharbeit-20260924.md).
3. **Historischer Profilschutz nach Zweierlauf (inzwischen auf500 bereinigt):** damals504 Mandatsprofile/0 aktiv; alle 505 Kontoprofile und Mandatszeilen hashgleich. Keine offenen Jobs oder lebenden Leases/Locks bei Nachkontrolle 16:47:20 UTC.
4. **Ein unbelegter Wert der Beteiligungsliste `parteien` sperrt die Antwort weiterhin vollstaendig fail closed** (`quellenbeleg-parteien`, Run `35987448290`). Eine Reduktion von `parteien` wurde geprueft und **verworfen**: die semantische Abhaengigkeit umschreibender Prosa ist per Namensvergleich nicht ausschliessbar. `ausschuesse` bleibt ebenfalls streng. **PR #542 ausgerollt; fachliche Nacharbeit weiterhin offen.**
5. **Fuer rein schemabedingte Ablehnungen ist fail closed bewusst korrekt** (Kriterium nicht durch Code loesbar): real entstehen nach der Sanitisierung nur „Pflichtprosa leer/ueberlang“ und DSGVO-Treffer in der Prosa; Erfinden und Kuerzen sind vertraglich ausgeschlossen (`prosa-textgrenzen-2026-09-19.md`, PR453/PR454). Die Ursache ist jetzt sichtbar (wertfreier Code). [Beleg](betrieb/verstehen-einmalig-169-20260922.md) §25.
6. **Frische Vollversorgung und 1500er Bilanz fehlen.**
7. **Gesamtzeit, Gesamtkosten, automatisches Testende und Rueckweg muessen im neuen 500er Fenster gemeinsam belegt werden.**
8. **Allgemeine Faktenbindung und Quellenqualitaet bleiben ausserhalb der bereits bestandenen 36er Prosa Abnahme weiter zu beobachten.** Qualitaetswaechter duerfen nicht abgesenkt werden.
9. **Verkaufsblocker ausserhalb des 500er Nachweises bleiben bestehen:** insbesondere OP01 bis OP04, Rechts und Datenschutzfragen, Monitoring Zweitkanal, Branch Protection und weitere Punkte der kanonischen [Datenmotor Restliste](datenmotor-restliste.md). Sie werden erst nach dem Production Nachweis wieder zur Hauptprioritaet, sofern sie den Nachweis nicht direkt blockieren.

## 5 · Nicht wiederholen

* Den abgeschlossenen 169er Quellen Vorlauf nicht erneut ausfuehren.
* `understanding-recovery.yml` nie ausfuehren. Dieser Pfad ist in Production gescheitert.
* Keine kleineren Ersatzkohorten als Beweis fuer exakt 500 Profile.
* Keine alten geschlossenen Prosa, Quellen oder Relationsversuche fortsetzen oder deren Restkontingente wiederverwenden.
* Keine gruenen Offline Tests als Production Funktionsnachweis ausgeben.
* Keine Aktivierung, Provisionierung oder gespeicherte Ergebniszahl allein als 500er Funktionsnachweis behandeln.
* Keine historischen Statusangaben als heutigen Production Zustand ausgeben. Bei Widerspruch gilt: Production Beleg vor Repository, Repository vor CURRENT_STATE, CURRENT_STATE vor historischer Dokumentation.

## 6 · Naechster Schritt

**Roadmap25.09. fortgesetzt; umfassendes Betreiber-GO samt Entscheidungsdelegation.**
Tagesriegel4USD und Profilschutz bestehen. PR582/bdd05dac Production READY.
[Profilreife](betrieb/500-profilreife-20260925.json):500/500 zulaessig,0 fehlende
Pflichtpakete nach61er Bundestagsumstellung und Entfernung zweier Rollenplatzhalter.
[Endfunktion fuer exakt500](betrieb/testfenster-exakt500-20260925.md) installiert
und funktions-/rechtegenau nachgelesen, Migration20260925115437.

[Bestandsbereinigung](betrieb/500-bestandsbereinigung-20260925.md)12:41:36UTC:
500/0,501 Identitaeten,498 Konten. Vier Nichtzielprofile samt642 Zeilen gesichert
entfernt;17 uebrige Tabellenbestaende unveraendert.10/10 Pruefgruppen bestanden.

**Naechste offene Fachphase: frische Vollversorgung und Bereichsabnahme.**
[Amtlicher Artikelkontext](betrieb/bundestag-artikelversorgung-20260925.md) integriert:
lokal7/11 ganze Leitabsaetze; vier benannte Ablehnungen.63 Pruefgruppen bestanden.
[Siebener-Auftrag](betrieb/verstehen-bund7-20260925.md):7/7 Import exakt.
Auftrag b36146635649 stoppte14:19:41UTC nach1 Modell/0,007794USD:
1 gespeichert,1 Artikelkontext-Abbruch,5 unbearbeitet. Quittungen a/b verbraucht.
PR575 nach Pflicht-CI36152588328 gemergt,25f656bc READY15:23:28UTC.
Regierungsakteur traegt keine Identitaet allein; Artikelzeitpruefung nur am Beleg.
Fehlbindung15:24:10UTC korrigiert: CO2-Quelle geloest, Vormerkung entfernt,
gemischter Altvorgang gesperrt;16 alte Quellen und CAS unveraendert.
[Sieben Quellen redaktionell korrigiert](betrieb/bund7-redaktion-20260925.md)
15:56:31UTC:5 neue Vorgaenge,2 Fortschreibungen,1 Dublette gesperrt;
8 KO-Hashes,10 Links und7 Rohquellen nachgelesen;13/13 Trigger-Laborgruppen.
[Persoenlicher Radar-Beleg](betrieb/radar-cem-redenquelle-20260925.md):
Import15:57:03UTC, vier Datenhashes bestaetigt, kein Modell. Private
Vollbilanzen stehen im [Nachpruefbericht](betrieb/roadmap-nachpruefung-20260925.md).
[Drei neue amtliche Quellen](betrieb/nachmittag3-quellen-20260925.md)16:21:58UTC
importiert; alle12 Datenhashes nachgelesen,500/0 und0,312021USD unveraendert.
Production-Aufnahme36160592624 um16:25:02UTC belegt Cems echten Personenhinweis
mit Originaltitel und Mediatheklink. Noch ohne Lage-Ansicht/Gesamtpaket.
[Vollstaendige Nachpruefung](betrieb/roadmap-nachpruefung-20260925.md):
PR578/579/580 nach gruener Pflicht-CI gemergt und READY.41 falsche
Ausschussbelege beseitigt; "keiner" erzeugt keine Dringlichkeitspunkte mehr.
Lokale500-Lesung derselben Datenbasis16:30:56UTC mit beiden Korrekturen:
61 frische Tagesprioritaeten,439 leer; Radar-Anzeige1 frisch/499 leer.
Alle Kennungen bilanziert, keine Quellen-/Profil-/Schwellenanpassung.
SQL17:19:07UTC:500/0 und Schutzhashes gleich,0 Jobs/Locks/Leases/offene
Kosten,0,312021USD von4USD. Keine Vollversorgung oder500er Abnahme.
RSA-Aufnahme36175850274 (25.09.18:49UTC,c6a55e36): Paartrennung bestanden,
Gesamturteil negativ;12 Karten/0 Absaetze. PR582 sperrt2 Ereignismischungen;
bdd05dac seit19:23:17UTC READY, keine neue Inhaltsaufnahme.
Titelbelegschutz:6 von10 Karten im lokalen Replay nur Originaltitel/Quellenhinweis,4 unveraendert.
[PR583](https://github.com/ernisch/helmut-pilot/pull/583) gemergt als32bb15d3;
[Pflicht-CI am finalen Kopf167ce420](https://github.com/ernisch/helmut-pilot/actions/runs/36202719319) gruen.
Cookie-/Zugriffstexte gelten ebenfalls nicht als Auszug. Faktenbindung/Nutzen offen. [Beleg](betrieb/roadmap-nachpruefung-20260925.md#inhaltsabnahme-und-quellenmix-korrektur-nach-der-einmalaufnahme).
Quellenkontext-Korrektur26.09.: Deutschlandfunk-Nachrichten ohne Article-JSON-LD
werden ueber kanonische Adresse, sichtbaren Artikelkopf und exakten Publikationszeitpunkt
gebunden. Nur der erste vollstaendige Absatz, keine spaetere Ersatzwahl. Lokal13/15
bereits gelesene oeffentliche Originale akzeptiert; zwei bewusst abgewiesen
(Mehrfachabsatz mit Zeilenumbruch, zu kurzer erster Absatz). Vier weitere Tagesschau-
Originale liefern bereits mit dem bestehenden Leser Kontext; zwei bleiben mehrdeutig.
Das belegt die lokale Kontextgewinnung, weder Import noch Verstehen oder500er Versorgung.
Versorgung, sichtbare Fachabnahme, Kosten/-zeit, lebender Endwaechter und finaler
Startplan bleiben vor Aktivierung notwendig.36er Abnahme und verbrauchte
Verstehenslaeufe nicht wiederholen.

## 7 · Kanonische Belege

* [500er Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md)
* [500er Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md)
* [36er Prosa Fachabnahme](betrieb/prosa-36er-vertrag-2026-09-21.md)
* [Vierer-Nacharbeit: Plan und Bedienvertrag](betrieb/verstehen-vier-nacharbeit-20260924.md)
* [169er Understanding Lauf](betrieb/verstehen-einmalig-169-20260922.md)
* [Production Beweisprotokoll](betrieb/production_beweisprotokoll.md)
* [Datenmotor Restliste](datenmotor-restliste.md)
* [Vollstaendiger vorheriger CURRENT_STATE Snapshot](archive/project_state/2026_09_23_CURRENT_STATE_vor_komprimierung.md)
