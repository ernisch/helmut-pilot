# Architekturentscheidung: Quellenbetrieb für höchstens 100 Mandate

**Entscheidung des Betreibers: 19.11.2026.**
**Status: verbindliche Zielrichtung, noch keine technische Umsetzung oder Produktionsabnahme.**
**Geltungsbereich: HELMUT Quellenversorgung, Verarbeitung und Morgenausgabe.**
**Ergänzende bestätigte Produktentscheidung vom 20.11.2026:** [Morgenbriefing bis 07:30 Uhr Berliner Zeit, Redaktionsschluss 06:45 Uhr](../produkt/morgenbriefing-0730-20261120.md). Redaktionelles Ziel, keine bereits umgesetzte oder freigegebene Produktionsumstellung.

## 1. Entscheidung

HELMUT behält die vorhandene Kundenanwendung auf **Vercel Pro**, die bestehenden Fachfunktionen und **Supabase als einzige verbindliche Datenbasis und Auftragsverwaltung**.

Der Quellenmotor wird **gezielt vom engen Morgenfenster auf eine fälligkeitsgesteuerte Verarbeitung über Tag und Nacht umgestellt**. Die vorhandene Supabase Warteschlange bleibt erhalten. Vorhandene Vercel Functions führen zeitlich begrenzte Arbeitseinheiten aus und werden in geeigneter, belegter Kadenz erneut geweckt. Ein dauerhaft laufender Server ist dafür zunächst nicht vorgesehen.

**Kein neuer Hetzner Server, kein Vercel Daemon und keine zusätzliche Vercel Queue als Ausgangsarchitektur.** **Fly.io in Frankfurt mit einem dauerhaften Node.js Worker ist die ausdrücklich vorgemerkte erste Ausweichlösung**, aber keine beschlossene Bereitstellung. Sie kommt erst in Betracht, wenn die Vercel Umsetzung nachweisbar an Laufzeit, Zuverlässigkeit oder tragbaren Betriebskosten scheitert. In diesem Fall übernimmt der Worker ausschließlich den bestehenden Ausführungsauftrag aus Supabase; Vercel bleibt für API, Authentifizierung und Oberfläche. Kein neues Queue System, kein automatischer Hostingwechsel und keine zweite Auftragswahrheit. Anbieterquoten und die interne Originalgrenze bleiben auch dort wirksam.

Diese Entscheidung ist **keine Erlaubnis**, Crons, Budgets, Production, Flags, Anbieterquoten, Quellenrechte oder die Datenbank ohne ihre jeweils bestehenden Freigaben zu verändern.

## 2. Warum diese Architektur

Am 19.11.2026 waren bei einem aktiven Pilotmandat 162 Quellenabrufe fällig, aber nur 41 technisch erledigt. Insgesamt warteten 754 fällige Abrufaufträge. Von 145 Google Aufträgen wurden 28 technisch abgeschlossen. Der komplette Morgenabschluss wurde nicht belegt.

Am 18. und 19.11. verbrauchten 58 abgeschlossene Google Aufträge 990 Reservierungen, durchschnittlich **17,07 Reservierungen je Abschluss**. Der beobachtete Bedarf von 145 Abschlüssen entspräche damit etwa **2.475 Reservierungen**. Die bisherigen acht Arbeitsfenster berührten höchstens 48 volle Anbieterminuten und damit bei der internen Grenze von 30 je Minute rechnerisch höchstens **1.440 Reservierungen**, tatsächlich waren 500 gebucht. Der Engpass ist also schon ohne zusätzliche Mandate strukturell sichtbar.

Das ist **kein Nachweis fehlender CPU Leistung** und **kein Nachweis, dass Google dauerhaft 30 Reservierungen je Minute erlaubt**. Die 16 Originalreservierungen pro Tag, der einzelne PDF Lesefehler und die Übergänge von Abruf zu Analyse, Matching und Ausgabe sind **separate Blocker**. Zusätzliche Server beseitigen sie nicht.

## 3. Beabsichtigter Datenfluss

1. **Quellenbedarf bilden:** Alle aktiven, berechtigten Mandatsprofile bestimmen ihren Bedarf. Identische zulässige Abrufdefinitionen werden gemeinsam geplant; personenbezogene Suchwege und Sichtbarkeitskontexte bleiben getrennt.
2. **Fälligkeiten planen:** Die Supabase Queue enthält dauerhaft die Abrufaufträge mit Fälligkeit, Priorität, Status, eindeutiger Identität und Wiederaufnahme. Die Aktualisierungsfrequenzen werden je Quelle anhand offizieller Veröffentlichungspraxis, gemessener Änderungsrate und Mandatsbedarf **recherchiert und begründet**, nicht pauschal stündlich gesetzt. Amtliche Pflichtquellen werden früh genug für den Morgen eingeplant. Weitere Quellen werden nach ihrem Bedarf über den gesamten Tag und die Nacht geprüft. Echte Eilmeldungen können eine neue Priorität begründen. Die Quellenauswahl wird nicht künstlich verkleinert.
3. **Arbeit ausführen:** Vercel Functions beanspruchen begrenzte Auftragsmengen atomar, respektieren die bestehenden Anbietergrenzen, Zeitbudgets, Quellenrechte und Sicherheitswachen, speichern Ergebnisse und geben Folgearbeit frei. Neue Weckzeiten und maximale Laufdauern sind **erst nach Machbarkeitsprüfung und Freigabe** festzulegen.
4. **Inhalte wiederverwenden:** Originale, unveränderliche Artikelversionen, URL, Herkunft, Publikationsdatum, Hash und zulässiger Inhaltsumfang werden geprüft und gespeichert. Nur neue oder tatsächlich geänderte geeignete Inhalte benötigen erneut eine KI Verstehensphase. Doppelte Fundstellen dürfen keine doppelte globale Analyse auslösen. Die Anzahl offener Abrufaufträge ist **nicht** die Anzahl der KI Aufrufe.
5. **Individuell ausgeben:** Verlässliche Wissensobjekte werden unter strikter Mandantentrennung zugeordnet und in Lage, Radar und Briefing umgesetzt. Mandatsgebundene Aussagen müssen auf zulässige Originalbelege zurückführen. Das Büro bleibt als bestehende nutzerbeauftragte Funktion erhalten.

Es gibt weiterhin **einen Fachkern** und **eine verbindliche Queue**. Ein zweiter Motor, neues Produkt oder vollständiger Neubau ist nicht vorgesehen. Dormante historische Pfade, insbesondere fehlerhafte globale Vorgangsbündelung, dürfen nicht pauschal aktiviert werden.

## 4. Planung ausschließlich bis 100 Mandate

**Entwicklungsziel: zuerst 1 vollständiges aktives Pilotmandat, danach schrittweise maximal 100 aktive Mandate.** Größere Szenarien sind weder Ziel noch Auslöser neuer Massentests. Vorhandene historische Prüfbelege, Dateien und Testprofile bleiben unverändert als Historie erhalten; sie sind keine aktuelle Skalierungsanforderung.

Die bestehende Rechnung für 100 Mandate nennt:
 
| Kenngröße | Durchschnittstag | Archivwechsel |
| --- | ---: | ---: |
| Geplante Quellenaufträge | 274,29 | 360 |
| Google Feeds | 257,29 | 343 |
| Google Reservierungen beim historischen Mix | rund 4.392 | rund 5.855 |
| Bei 25 Prozent rechnerischer Reserve | rund 5.490 | rund 7.319 |
| Reine Mindestdauer bei intern 30 Reservierungen/Minute, mit Reserve | rund 183 Minuten | rund 244 Minuten |

Diese letzte Zeit ist nur eine **untere rechnerische Schranke für Google Reservierungen**. Artikelauflösung, Latenz, Sperren, Nachbearbeitung, Speicherung, Modellphasen, individuelle Ausgaben, Rechtsgrenzen und Rückstände kommen hinzu. Sie beweist **keine** machbare Gesamtverarbeitung und keine Erlaubnis zur Quotensteigerung. Die günstige Verteilung über 24 Stunden muss gegen reale Anbieterantworten und vollständige Produktbelege validiert werden.

Die letzte belegte Optimierung der Wiederverwendung senkte bei einem wiederholten Feed die Reservierungen von **13 auf 9** bei identischen Fundstücken. Das ist **kein gemessener Durchschnitt über alle Quellen**.

Die bisherigen Modellmessungen ergeben für 100 täglich neu erstellte und geprüfte Lagen etwa **1,905 bis 1,913 USD pro Tag**, ohne Zusatzkosten für Radar, Büro und weitere Analyse. Der heutige Pilotrahmen von **1 USD je UTC Tag und 30 USD insgesamt** bleibt unverändert; er ist **kein freigegebener 100 Mandate Betriebsrahmen**. Auch für Vercel Functions und ihre regionale Nutzung fehlt eine belastbare Endkostenrechnung. Vor Aktivierung wird ein begrenztes, realistisch gerechnetes Kostenmodell verlangt.

## 5. Fachlicher Morgenvertrag und verbindliche Prioritätsforschung

**Priorisierung vor Umsetzung verbindlich:** Zuerst den bestehenden aktiven Quellenkatalog und die konkreten Mandatsprofile gegen die offiziellen Veröffentlichungswege prüfen. Für jeden Quellentyp erfassen: fachliche Bedeutung, nachweisbare Publikationshäufigkeit, Änderungszeitpunkte einschließlich Wochenenden, bevorstehende Fristen, Kosten je Abruf, Rechtsstatus, Originalgröße, technische Zuverlässigkeit, mögliche Wiederverwendung und bisherige Erfolgsquote. Eine noch unbekannte Uhrzeit darf nicht erfunden werden. Erst daraus die angemessene Abruffälligkeit ableiten. Prioritäten gelten sowohl für das **Abrufen unbekannter Neuigkeiten** als auch getrennt für die **Analyse bereits gefundener Artikel**. Nicht jeder Artikel lässt sich vor dem Abruf nach Wichtigkeit bewerten.

**Vorgesehene Reihenfolge je konkretem Mandat, vorbehaltlich der Quellenrecherche:**

1. **Fristkritisch, früh für das Morgenbriefing:** belegte heutige oder unmittelbar bevorstehende Plenumsentscheidungen, Tagesordnungen, Ausschusstermine und rechtlich wirksame Fristen; neu geänderte amtliche Unterlagen hierzu; wichtige neue DIP Vorgänge, die das Mandat betreffen. Amtliche Originale, notwendige PDF und ICS Fassungen sowie die zugehörige Analyse und Mandatszuordnung erhalten genug Vorlauf vor 05:00 UTC. Ein angekündigter Termin ist wichtiger als eine bloße Menge allgemeiner Nachrichten.
2. **Früh, sofern tatsächlich veröffentlicht und relevant:** neue Beschlüsse, parlamentarische Drucksachen, offizielle Ministeriumsmitteilungen, Gesetze und relevante verlässliche Medienberichte mit unmittelbaren politischen Auswirkungen. Ein bestätigter eiliger Vorgang kann auch außerhalb amtlicher Quellen die höchste Priorität erhalten. Keine allgemeine Gleichsetzung „amtlich = immer dringend“.
3. **Fortlaufend tagsüber und abends:** Ministerien, Landesregierungen, fachliche Institute, Verbände, Fraktionen, Parteien, lokale und regionale Originalquellen, laufende Verfahren und weitere neue Artikel; nach tatsächlichem Änderungsbedarf und Bedeutung wiederholt prüfen. Quelle und neues Ereignis getrennt priorisieren. Dringende Änderungen nach dem Morgenbriefing in Lage und Radar nachführen.
4. **Nachrangig, aber nicht auslassen:** breit angelegte Google News Suchen, doppelte Fundstellen, Hintergrund und unveränderte Archivartikel. Google News dient der Entdeckung, nicht als Ersatz für zugängliche amtliche Originale. Relevante neue Personen, Fraktions oder Regionalsignale werden trotzdem rechtzeitig geprüft; Anti Starvation für weniger dringende, überfällige Aufgaben vorsehen.

**Recherchegrundlagen für den Start:** Die offizielle [DIP API](https://search.dip.bundestag.de/api/v1/swagger-ui/) stellt Drucksachen und Vorgänge maschinenlesbar bereit; [Bundestag Open Data](https://www.bundestag.de/services/opendata/) bietet parlamentarische Originaldaten. [Ausschusstagesordnungen](https://www.bundestag.de/ausschuesse/a11_arbeit_soziales/tagesordnungen) erscheinen in den zuständigen Ausschüssen. Das [Abgeordnetenhaus Berlin](https://www.parlament-berlin.de/dokumente/open-data) stellt Metadaten seiner Parlamentsdokumentation auch über eine API bereit; laut [Plenumsinformation](https://www.parlament-berlin.de/Ausschuesse/19-plenum) wird die reguläre Plenartagesordnung im Ältestenrat dienstags vor dem Donnerstagplenum festgelegt. Brandenburg und weitere Ebenen sind vor Freigabe ihrer jeweiligen Quellen getrennt anhand der amtlichen Veröffentlichungen zu prüfen. Diese Belege dienen der **Prioritätsrecherche**, nicht als pauschale neue Quellenaktivierung, Rechtezusage oder Garantie täglicher Veröffentlichungen.

**Zeitliche Zielerfüllung:** Gespeicherte, belegte Lage bis 05:00 UTC und gespeichertes Morgenbriefing bis 05:15 UTC. Der Abschluss setzt nicht nur einen erfolgreichen HTTP Abruf voraus, sondern auch zulässige Originale, vollständige Verarbeitung, Mandatszuordnung, Quellenbindung und reguläre Auslieferung. Später veröffentlichte Inhalte werden nachgeführt, nicht rückdatiert. Fehlende Veröffentlichung, echte Zugriffsperre und technische Versorgungslücke bleiben unterscheidbar. Ein Teilstatus bleibt ehrlich sichtbar.

**Nachweis vom abgeschlossenen Sprint in PR #1276:** Im isolierten Zweitageslauf waren **0/1 Pilotmandate vollständig versorgt**, bei **42/162** beziehungsweise **54/161** technisch abgeschlossenen Quellenaufträgen. Der Rückstand stieg **754 → 872 → 977**. Im fehlerfreien simulierten Kaltstart sind **21 unterschiedliche Originaladressen bei intern 16 erlaubten Buchungen** erforderlich. Die tatsächliche Anzahl in Production ist offen. Weiter ungelöst sind unter anderem das sichtbare Mandatsmatching neuer DIP Vorgänge und die Ursache des nicht verfügbaren fehlerhaften Original PDF. Die Korrekturen liegen im Entwurf, nicht auf `main`. Das Limit nicht blind erhöhen oder durch einen anderen Anbieter umgehen: notwendige einzelne Originale, echte Wiederverwendung, Anbieterrechte und getrennte Budgetgrenzen zuerst nachweisen.

## 6. Abnahmekriterien und Rückfallentscheidung

Ein Umbau gilt nur dann als fachlich wirksam, wenn:

1. Der bestehende isolierte GitHub Quellenprüfstand mit den realen Produktionsrouten den Morgenvertrag für **1 Pilotmandat** einschließlich Originalen, Analyse, Matching, gespeicherter Lage, Briefing und Fristen nachweist.
2. Ein begrenzter, kostensicherer Kapazitätsnachweis mit den vorhandenen Szenariodaten zeigt, dass die Queue bei **bis zu 100 Mandaten** im normalen und erhöhten Tagesbedarf nicht dauerhaft anwächst. Kein neuer historischer Massentest.
3. Die reale Rate der Quellenabrufe, Wiederverwendung, PDF und ICS Leser, Quoten, Rechte, Kosten, Ausfälle und Wiederanläufe getrennt und ehrlich erfasst sind. Ungeklärte Google Anbietergrenzen bleiben ein ausgewiesener Blocker, auch wenn der synthetische Prüfstand grün ist.
4. Mandantentrennung, personenbezogene Daten, Auth, Quellenlizenzen und KI Budgetgrenzen unverändert sicher sind. Kein Quellenverlust und keine erfundenen oder als echt ausgegebenen Simulationsergebnisse.
5. Vercel Pro bietet für die gewählte Weckkadenz und Auftragsdauer genügend vertraglich erlaubte Kapazität zu belegbaren Kosten, auch in der gewählten Region.

**Rückfallentscheidung nur anhand von Belegen:** Erst wenn die verteilten Vercel Functions im erlaubten 24 Stunden Betrieb nachweislich nicht fristgerecht, zuverlässig oder zu tragbaren Kosten arbeiten, wird **Fly.io Frankfurt als erste konkrete Alternative** mit einem kleinen dauerhaften Node.js Worker aus dem vorhandenen Supabase Auftragsbestand dimensioniert und geprüft. Vor Entscheidung zählen gemessene CPU, RAM, Laufzeiten, Wiederanläufe, echte Anbietergrenzen, Kosten und Datenschutzverträge; die theoretische Monatsmiete allein reicht nicht. Hetzner und andere Anbieter sind nur nachrangige Vergleichsoptionen. Es gibt keinen automatischen Wechsel, keine pauschale neue Queue, keine Anbieterlimitumgehung und keinen Umbau der Fachlogik ohne konkreten Beleg.

## 7. Reihenfolge und Freigaben

**Jetzt:** Diese Entscheidung und das Prioritätsforschungsziel dokumentieren, ohne Runtime, Cron, Datenbank, Produkt, Budgets oder Production zu verändern.

**Sprintlage:** PR #1276 ist mit grünem isoliertem Prüfstand **abgeschlossen, aber wegen 0/1 voller Morgenversorgung nicht gemergt**. Er ist kein Produkt PASS. Seine gezielten Korrekturen dürfen als vorhandene Vorarbeit integriert werden, sobald sie am gültigen PR Kopf alle dafür notwendigen Anforderungen erfüllen; den offenen Befund nicht wegdokumentieren.

**Implementierung kann nach Dokumentationsabschluss sofort im bestehenden Entwicklungsprozess beginnen, ohne einen weiteren Morgen abzuwarten:** (1) aktive Quellen und tatsächliche Veröffentlichungspraxis recherchieren und daraus eine begründete Prioritäts und Fälligkeitsmatrix je Quellentyp und Mandat bilden; (2) den kleinsten umsetzbaren, sicheren und reversiblen 24 Stunden Antrieb mit vorhandener Supabase Queue und Vercel Functions gegen diese Matrix entwerfen; (3) zuerst das Pilotmandat mit amtlichen Originalen einschließlich der fehlenden Originalkontingentprüfung und DIP Bindung vollständig schließen, dann erst den Arbeitsbestand und die berechnete Kapazität bis 100 nachweisen. Bereits bestehende Planer, Caches, Reader und Tests weiterverwenden. Keine parallele Änderung derselben Dateien zu PR #1276; keinen ungemergten Fremdbranch als Architekturhauptstand ausgeben.

Vor geschützten Änderungen an Crons, Budget, Originalkontingenten, Konfiguration oder Production gelten die Freigaberegeln aus `AGENTS.md` und `CLAUDE.md`. **Die Dokumentationsfreigabe autorisiert weder eine Budgeterhöhung noch einen weiteren kostenpflichtigen Live Lauf.**

**Keine Änderung an historischen 500er Belegen.** Der aktuelle Auftrag und alle neuen Planungen sind auf **maximal 100 Mandate** begrenzt. Erfolg wird nicht aus simulierten Ergebnissen als Production PASS abgeleitet.

## 8. Nachweise

- [Aktueller Status](../CURRENT_STATE.md)
- [Gemessene Quellenfälligkeiten vom 19.11.2026](../betrieb/quellenfaelligkeit-20261119.md)
- [Bestehender Quellenprüfstand](../betrieb/quellenpruefstand-20261119.md)
- [Systemarchitektur und bereits vorhandene Queue](../ARCHITECTURE.md)
- [Aktueller Quellenauftrag und Prioritätsvertrag](https://github.com/ernisch/helmut-pilot/issues/1266)
- [Abgeschlossener Pilotmorgen Sprint, Abnahme 0/1](https://github.com/ernisch/helmut-pilot/pull/1276)
- [Isolierter Zweitageslauf](https://github.com/ernisch/helmut-pilot/actions/runs/44601018316)
- [Fachlicher Produktvertrag](../produktvertrag-20261115.md)
- [Sicherheitsregeln](../../CLAUDE.md) und [Freigaben](../../AGENTS.md)
