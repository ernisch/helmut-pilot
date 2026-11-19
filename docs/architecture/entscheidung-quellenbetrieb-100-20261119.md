# Architekturentscheidung: Quellenbetrieb für höchstens 100 Mandate

**Entscheidung des Betreibers: 19.11.2026.**
**Status: verbindliche Zielrichtung, noch keine technische Umsetzung oder Produktionsabnahme.**
**Geltungsbereich: HELMUT Quellenversorgung, Verarbeitung und Morgenausgabe.**

## 1. Entscheidung

HELMUT behält die vorhandene Kundenanwendung auf **Vercel Pro**, die bestehenden Fachfunktionen und **Supabase als einzige verbindliche Datenbasis und Auftragsverwaltung**.

Der Quellenmotor wird **gezielt vom engen Morgenfenster auf eine fälligkeitsgesteuerte Verarbeitung über Tag und Nacht umgestellt**. Die vorhandene Supabase Warteschlange bleibt erhalten. Vorhandene Vercel Functions führen zeitlich begrenzte Arbeitseinheiten aus und werden in geeigneter, belegter Kadenz erneut geweckt. Ein dauerhaft laufender Server ist dafür zunächst nicht vorgesehen.

**Kein neuer Hetzner Server, kein Vercel Daemon und keine zusätzliche Vercel Queue als Ausgangsarchitektur.** Ein anderer Antrieb wird nur dann neu entschieden, wenn konkrete Kapazitätsmessungen nach der geplanten Entkopplung ihn erforderlich machen. Die vorhandene Warteschlange wird nicht durch eine zweite unabhängige Auftragswahrheit ersetzt.

Diese Entscheidung ist **keine Erlaubnis**, Crons, Budgets, Production, Flags, Anbieterquoten, Quellenrechte oder die Datenbank ohne ihre jeweils bestehenden Freigaben zu verändern.

## 2. Warum diese Architektur

Am 19.11.2026 waren bei einem aktiven Pilotmandat 162 Quellenabrufe fällig, aber nur 41 technisch erledigt. Insgesamt warteten 754 fällige Abrufaufträge. Von 145 Google Aufträgen wurden 28 technisch abgeschlossen. Der komplette Morgenabschluss wurde nicht belegt.

Am 18. und 19.11. verbrauchten 58 abgeschlossene Google Aufträge 990 Reservierungen, durchschnittlich **17,07 Reservierungen je Abschluss**. Der beobachtete Bedarf von 145 Abschlüssen entspräche damit etwa **2.475 Reservierungen**. Die bisherigen acht Arbeitsfenster berührten höchstens 48 volle Anbieterminuten und damit bei der internen Grenze von 30 je Minute rechnerisch höchstens **1.440 Reservierungen**, tatsächlich waren 500 gebucht. Der Engpass ist also schon ohne zusätzliche Mandate strukturell sichtbar.

Das ist **kein Nachweis fehlender CPU Leistung** und **kein Nachweis, dass Google dauerhaft 30 Reservierungen je Minute erlaubt**. Die 16 Originalreservierungen pro Tag, der einzelne PDF Lesefehler und die Übergänge von Abruf zu Analyse, Matching und Ausgabe sind **separate Blocker**. Zusätzliche Server beseitigen sie nicht.

## 3. Beabsichtigter Datenfluss

1. **Quellenbedarf bilden:** Alle aktiven, berechtigten Mandatsprofile bestimmen ihren Bedarf. Identische zulässige Abrufdefinitionen werden gemeinsam geplant; personenbezogene Suchwege und Sichtbarkeitskontexte bleiben getrennt.
2. **Fälligkeiten planen:** Die Supabase Queue enthält dauerhaft die Abrufaufträge mit Fälligkeit, Priorität, Status, eindeutiger Identität und Wiederaufnahme. Amtliche Pflichtquellen werden früh genug für den Morgen eingeplant. Tagesquellen werden über den gesamten Tag nach ihrem Bedarf geprüft. Die Quellenauswahl wird nicht künstlich verkleinert.
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

## 5. Fachlicher Morgenvertrag

Amtliche und mandatsrelevante **Plenumsinformationen, Sitzungskalender, Ausschüsse und DIP Vorgänge** haben in der Versorgung Vorrang. Weitere rechtmäßig nutzbare Quellen bleiben als Tagesversorgung bestehen. Es gibt keine künstliche Quellenreduzierung für bessere Erfolgsquoten.

Ziel sind **gespeicherte, belegte Lage bis 05:00 UTC und gespeichertes Morgenbriefing bis 05:15 UTC**. Der Abschluss setzt nicht nur einen erfolgreichen HTTP Abruf voraus, sondern auch das zulässige Original, vollständige Verarbeitung, Mandatszuordnung, Quellenbindung und reguläre Auslieferung. Spätere Veröffentlichungen werden nachgeführt; noch nicht publizierte, unerreichbare oder rechtlich unzulässige Informationen können nicht als vollständig versorgt gelten. Ein Teilstatus bleibt ehrlich sichtbar.

Die Grenze von **16 Originalreservierungen pro Tag** und ein bekannter **PDF Lesefehler** sind vor dem behaupteten Morgenerfolg gesondert zu lösen. Eine unveränderte URL beweist noch keine unveränderte Fassung.

## 6. Abnahmekriterien und Rückfallentscheidung

Ein Umbau gilt nur dann als fachlich wirksam, wenn:

1. Der bestehende isolierte GitHub Quellenprüfstand mit den realen Produktionsrouten den Morgenvertrag für **1 Pilotmandat** einschließlich Originalen, Analyse, Matching, gespeicherter Lage, Briefing und Fristen nachweist.
2. Ein begrenzter, kostensicherer Kapazitätsnachweis mit den vorhandenen Szenariodaten zeigt, dass die Queue bei **bis zu 100 Mandaten** im normalen und erhöhten Tagesbedarf nicht dauerhaft anwächst. Kein neuer historischer Massentest.
3. Die reale Rate der Quellenabrufe, Wiederverwendung, PDF und ICS Leser, Quoten, Rechte, Kosten, Ausfälle und Wiederanläufe getrennt und ehrlich erfasst sind. Ungeklärte Google Anbietergrenzen bleiben ein ausgewiesener Blocker, auch wenn der synthetische Prüfstand grün ist.
4. Mandantentrennung, personenbezogene Daten, Auth, Quellenlizenzen und KI Budgetgrenzen unverändert sicher sind. Kein Quellenverlust und keine erfundenen oder als echt ausgegebenen Simulationsergebnisse.
5. Vercel Pro bietet für die gewählte Weckkadenz und Auftragsdauer genügend vertraglich erlaubte Kapazität zu belegbaren Kosten, auch in der gewählten Region.

**Rückfallentscheidung nur anhand von Belegen:** Erst wenn die Nutzung über Tag und Nacht mit den zulässigen Vercel Functions nachgewiesen unzureichend oder unverhältnismäßig teuer ist, werden Vercel Queues, ein Vercel Daemon oder ein deutscher externer Worker als Transport beziehungsweise Laufzeit neu verglichen. Eine externe Anbietergrenze wird durch einen Hostingwechsel nicht umgangen.

## 7. Reihenfolge und Freigaben

**Jetzt:** Diese Entscheidung rein dokumentieren, ohne Runtime, Cron, Datenbank, Produkt, Budgets oder Production zu verändern.

**Parallel laufender Sprint:** Der bereits beauftragte Morgenquellen Sprint bleibt der einzige ausführende Entwicklungsauftrag. Seine Ergebnisse und Änderungen haben vor der technischen Integration Vorrang; keine gleichen Dateien parallel bearbeiten und keinen zweiten konkurrierenden Auftrag starten.

**Nach Sprintabschluss:** Den Sprintbefund gegen diesen Vertrag einordnen. Nur verbleibende nachgewiesene Lücken der verteilten Fälligkeitsverarbeitung angehen; vorhandene Komponenten, CI und Prüfstand wiederverwenden. Für Änderungen an geschützten Crons, Budgets, Konfiguration und Production gelten die bestehenden Freigaberegeln aus \`AGENTS.md\` und \`CLAUDE.md\`.

**Keine Änderung an historischen 500er Belegen.** Der aktuelle Auftrag und alle neuen Planungen sind auf **maximal 100 Mandate** begrenzt. Erfolg wird nicht aus simulierten Ergebnissen als Production PASS abgeleitet.

## 8. Nachweise

- [Aktueller Status](../CURRENT_STATE.md)
- [Gemessene Quellenfälligkeiten vom 19.11.2026](../betrieb/quellenfaelligkeit-20261119.md)
- [Bestehender Quellenprüfstand](../betrieb/quellenpruefstand-20261119.md)
- [Systemarchitektur und bereits vorhandene Queue](../ARCHITECTURE.md)
- [Aktueller Quellenauftrag und Prioritätsvertrag](https://github.com/ernisch/helmut-pilot/issues/1266)
- [Sicherheitsregeln](../../CLAUDE.md) und [Freigaben](../../AGENTS.md)
