# Quellenreparatur für das Pilotmandat am 26.11.2026

Stand vor dem regulären Morgenbriefing. Alle Uhrzeiten sind Berliner Zeit. Die fachliche Abnahme, der Rollout und die Bereinigung sind offen.

## Produktionsbefund

Hetzner quittierte am 26.11. die Fenster ab 01:00 Uhr auf `18068575`. Im Fenster 01:45–01:48 Uhr verarbeitete der Worker 13 von 139 beanspruchten Aufträgen und stellte 126 zurück. Der Quellenabgleich blieb eingeschränkt. Die fünf aktiven Bundestags-Terminwege mit PDF oder ICS wurden heute zwischen 01:01:05 und 01:01:13 Uhr abgeschlossen. Der frühere PDF-Ladefehler und die begrenzte 503-Wiedervorlage sind bereits korrigiert. [Betriebsprotokoll](hetzner-live-20261123.md) · [PDF](https://github.com/ernisch/helmut-pilot/pull/1267) · [503](https://github.com/ernisch/helmut-pilot/pull/1350)

| Auftragstyp um 01:58:04 Uhr | Wartend | Davon fällig | Davon erstmals vor dem UTC-Tagesbeginn fällig | Laufend | Endgültig fehlgeschlagen |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dokumentanalyse | 1.196 | 1.196 | 1.168 | 0 | 2.028 |
| Quellenabruf | 737 | 128 | 125 | 0 | 1 |
| Mandatsprojektion | 1 | 0 | 0 | 0 | 0 |
| Briefing-Materialisierung | 1 | 0 | 0 | 0 | 0 |

Direkte Lesung aus `public.helmut_jobs` mit gemeinsamem DB-Zeitpunkt. 35 Analysen und 23 Abrufe hatten seit UTC-Tagesbeginn einen Abschluss. Die Fehlerzahl enthält historische Endzustände. Beim Abruf waren 469 alte RSS-Definitionen wegen fehlender Bestätigung im aktuellen Plan zurückgestellt. Alle 469 Quellkennungen erscheinen weiter im bestätigten Tagesplan. 428 alte URLs stehen noch im Katalog. Neue Planung und vollständige Abarbeitung des Bestands sind dadurch getrennt zu bewerten.

- **739 wieder vorgelegte Profilbindungsfehler.** Der alte Worker las aktive Altprofile aus dem falschen Profilbestand und scheiterte vor Modell oder Beschaffung. Die Bindung an den relationalen Bestand ist im aktuellen Betrieb nachgewiesen. Die Produktionswache prüft weiterhin Profilzulassung und Kostenvertrag. Eine korrigierte Bindung allein begründet keinen Bedarf an allen alten Artikeln. [Profilbindungsbeleg](quellen-status-20261124.md#3-profilbindung-geprüft-rein-lesend)
- **138 fällige historische Versionsdiagnosen.** Alle tragen den eigenen Diagnoseschlüssel. Der Abgleich mit der archivierten Fassung ergibt 74 reine Datums-, 44 Titel- und 20 Herausgeberabweichungen. Ein regulärer Einzelauftrag für einen der 74 Fälle war heute bereits separat wartend. Echte Titel- oder Herausgeberabweichungen bleiben fachlich offen. Zwei heute wieder beobachtete Ministeriumsversionen sind Beispiele für ältere, gesondert nachzuprüfende reguläre Aufträge mit ausschließlich Datumsabweichung. Ihr tatsächlicher Abschluss als Fehler liegt vor dem korrigierten Worker. `updated_at` belegt hier Wiederbeobachtung, `finished_at` den Fehlversuch. [Historische Diagnose](https://github.com/ernisch/helmut-pilot/pull/1334) · [Archivleser](https://github.com/ernisch/helmut-pilot/pull/1340)
- **Wiederanlauf und Priorität.** Die reguläre Wiedervorlage zog beim Planstart alte Fehler in Portionen bis 500 anhand von Alter und Versuchszähler zurück in die Queue. Sie prüfte weder die konkrete Fehlerursache noch Fassungs- oder Mandatsrelevanz. Derselbe Artikel konnte bei einem neuen Pflichtabruf zudem seinen früheren Hintergrundwert 80 behalten. Die Quittungen des 25. und 26.11. belegen insgesamt 30 solcher Verweise, darunter zwei auf fehlgeschlagene Analysen. Zugleich betrachtete die Morgenprüfung alle Tagesanalysen als Voraussetzung, auch wenn der Worker sie absichtlich in den Tagesbetrieb verschob.
- **Quoten und unbekannte Ausgänge.** 25.11. 07:20 Uhr, gespeicherte und quittierte Teilfassung, 50/61 fällige Abrufe belegt und kein belegter Tagesanlass. Das tägliche Aufruflimit von 100 wurde an diesem Tag um 08:32 Uhr erreicht. Der Verbrauch lag bei 0,693237 USD und 7 von 16 Originalen. Um 01:51 Uhr am 26.11. waren 35 Aufrufe mit 0,275056 USD abgerechnet, 0 Buchungen des Tages offen und insgesamt 9,038227 USD gebunden. Die Limits für Aufrufzahl, Geld und Originale wirken getrennt. Das Stoppen bei nicht bestätigter Auftragsvertagung trat am 24.11. um 15:00 Uhr und am 25.11. um 08:45 Uhr auf. Der bestehende eng gebundene HTTP-521-Rückleseweg bleibt wirksam. [Laufbefunde](quellen-status-20261124.md) · [Vertagungsprüfung](https://github.com/ernisch/helmut-pilot/commit/2312c087)

## Vorbereitete Reparatur

- Die regulären Quellenfenster führen keine allgemeine altersbasierte Wiedervorlage aus. Laufende Transient-Retries und die bestehende Versuchsgrenze bleiben wirksam. Ein neuer, versionsgebundener Eingangsfehler wird einmal quittiert.
- Vor Redaktionsschluss akzeptiert der Worker Pflichtanalysen im aktuellen Beobachtungstag. Die Migration `20261126005158_morgenpflicht_artikelprioritaet` bindet die Priorität offener, exakt identischer Fassungen atomar an ihren Beobachtungstag. Ein optionaler Wiederfund übernimmt keine Pflichtpriorität vom Vortag. Ein späterer amtlicher Beleg desselben Tages erhält Vorrang vor Hintergrund und Altbestand. Status, ursprüngliche Fälligkeit und laufende Leases bleiben erhalten. Das Rollback stellt den vorigen Funktionskörper wieder her. Bereits regulär vergebene Prioritäten bleiben darin bestehen.
- Der Morgenleser prüft alle fälligen Abrufquittungen und die in bestätigten Pflichtabrufen referenzierten Analysen. Er verlangt die genaue Artikelversion, deren Auftragsschlüssel und einen bestätigten Abschluss vor der Paketprüfung. Fehlende, unpassende und gescheiterte Pflichtbelege verhindern einen vollständigen Status. Die normale Tagesdiagnose bilanziert auch den übrigen Rückstand.
- Ein bestätigtes globales Tagesaufruflimit verschiebt die einzelne Analyse bis zur nächsten UTC-Tagesgrenze. Für andere oder unbekannte Budgetgründe gilt die bisherige begrenzte Pause. Die Quoten, Reservierungslogik und der Schutz bei ungewissem Modellausgang gelten weiter.

## Abnahme und Altbestand

Nach 07:30 Uhr zuerst den regulären Lauf rein lesend prüfen. Die bestehende Route `GET /api/cron/briefing-nachweis?mandat=<freigegebenes Pilotmandat>` ohne historischen Modus verwendet den Produktleser. Die vorhandene Cron-Leseautorität ausschließlich für den gebundenen Host verwenden. Gegen die unveränderte Morgenquittung, den Berliner Morgenplan, bestätigte Originale und die zeitlich passenden Lage- und Paketläufe abgleichen. Teilfassung und belegte ruhige Lage getrennt bewerten. Danach die Warteschlangen- und Buchungsbilanz mit frischem Zeitbezug erheben.

Die Prioritätsmigration und eine spätere direkte Bestandsbereinigung benötigen getrennte, konkrete Production-Freigaben. Für jede betroffene Zeile ist vorab ein unveränderter privater Vorwertbeleg erforderlich, einschließlich Auftragsschlüssel, Status, Versuchen, letzter Fehlerklasse, Version und relevantem Quellbeleg. Die Änderung muss den Vorwert und freie Lease atomar prüfen, bei Abweichung stoppen und genau die freigegebene Menge zurücklesen.

| Kohorte | Prüfkriterium für den freizugebenden Einzelauftrag |
| --- | --- |
| Alter Diagnosejob mit Suffix `\|eingangsfehler\|versionskonflikt` | Exakter Schlüssel und alter Fehlertyp beweisen die reine Diagnose. Als historischen Endzustand dokumentieren. Die Archivfassung und ein möglicher regulärer Einzelauftrag bleiben erhalten. |
| Alte Profil- oder reine Datumsfehler | Konkrete Fassung im aktuellen fachlich relevanten Abruf nachweisen, Ursache im tatsächlich laufenden Build behoben, keine Modellreserve oder unbekannte Ausführung für die geplante Wiederaufnahme. Nur exakt bestätigte und kostenmäßig begrenzte Aufträge kommen infrage. |
| Zurückgestellte alte Abrufdefinition | Identität, Rechte, Mandatsbindung, heutige Ablösung und den dazugehörigen Abrufbeleg positiv prüfen. Soll eine weiterhin zulässige Definition nachgeholt werden, gilt ihr bestehender Plan- und Quotenvertrag. |
| Inhaltliche Metadatenabweichung, unbekannter Modell-/Speicherausgang | Historische Schutzentscheidung und Originale erhalten. Für weitere Verarbeitung sind ein eigener Beleg der korrekten Fassung beziehungsweise ein geklärter Ausgang erforderlich. |

Lokal bestanden 20/20 PostgreSQL-Prüfungen, 32/32 Queue-Inhaltsprüfungen und 15/15 Prüfungen des Versorgungslesers. Der bestehende Worker-Prozesstest bestand mit der erforderlichen lokalen Prozessberechtigung. Der Produktionsleser antwortete vor dem Morgenlauf mit HTTP 200, Status `fehlt` und `vollstaendig:false`. Dieser Bericht dokumentiert einen Lesestand und Korrekturen im Arbeitsbranch. Die Queue und deren Produktionsnachweise wurden in diesem Auftrag bisher ausschließlich gelesen.
