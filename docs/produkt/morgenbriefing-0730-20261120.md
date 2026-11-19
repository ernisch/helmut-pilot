# HELMUT: Verbindliches Ziel für das Morgenbriefing um 07:30 Uhr

**Betreiberentscheidung: 20.11.2026.** **Status: verbindliches redaktionelles Produktziel, keine bereits produktive oder technisch abgenommene Zeitumstellung.**

**Geltung:** Zuerst 1 vollständig versorgtes Bundestagspilotmandat, danach nach eigener Quellfreigabe und Abnahme Landtagsmandate und bis höchstens 100 aktive Mandate. Bestehender [Produktvertrag](../produktvertrag-20261115.md), [Architekturentscheidung](../architecture/entscheidung-quellenbetrieb-100-20261119.md), [Prioritätsmatrix und Kapazitätsplanung in PR #1278](https://github.com/ernisch/helmut-pilot/pull/1278) (noch nicht in `main`) und [AGENTS.md](../../AGENTS.md) bleiben maßgeblich. Historische Belege und Produktion werden nicht allein durch diese Entscheidung geändert.

## Entscheidung und Vergleich

**Reguläres Morgenbriefing: bis 07:30 Uhr in der Zeitzone `Europe/Berlin`, an jedem Kalendertag. Regulärer Redaktionsschluss neuer Quellen: 06:45 Uhr Berliner Zeit.** Neue wichtige Ereignisse nach dem Schnitt werden regulär in Lage und Radar nachgeführt. Im Kundenprodukt wird der tatsächliche Datenstand mit Zeitpunkt und gegebenenfalls Versorgungslücken sichtbar. Es wird kein Briefing per E-Mail versandt.

| Kandidat | Nutzen | Nachteil | Entscheidung |
| --- | --- | --- | --- |
| 07:00 | Mehr Vorlauf vor frühen Terminen | 30 Minuten weniger für nachträgliche Originalprüfung, Zuordnung und sicheren Abschluss | Nicht als erster Regelwert |
| **07:30** | Frühe Vorbereitung für Vormittagstermine, 45 Minuten zwischen Redaktionsschluss und Zielzeit, Vorabenddaten nutzbar | Keine Garantie, dass alle erst morgens verfügbaren Originale bereits gelesen sind | **Redaktionelles Ziel** |
| 08:00 | 30 Minuten mehr Verarbeitung | Weniger Vorlauf bei frühen Parlamentsterminen, viele wichtige Veröffentlichungen erscheinen dennoch erst später | Nicht als erster Regelwert |

Die Wahl ist eine **begründete Produktentscheidung**, keine empirisch validierte Präferenz aller parlamentarischen Büros. Bei einer echten Kundenabnahme ist die Eignung der Zeit zu prüfen. Keine automatische Verschiebung auf 08:00 oder 09:00 Uhr, um unbelegte Vollständigkeit zu behaupten.

**Sommerzeit:** 07:30 Berliner Zeit entspricht **06:30 UTC im Winter** und **05:30 UTC im Sommer**. 06:45 Berliner Redaktionsschluss entspricht **05:45 UTC im Winter** und **04:45 UTC im Sommer**. Die bisherige technische Frist 05:00 UTC (Lage) und 05:15 UTC (Briefing) ist deshalb **nicht** einfach durch eine feste neue UTC Zeit ersetzbar. Codex muss die bestehende Zeitzonenbehandlung, Uhrzeitumstellung im März/Oktober, einmalige Morgenquittung sowie ausbleibende und doppelte Zustellung in den vorhandenen Prüfungen nachweisen. Vercel Cron arbeitet nach UTC; die Anwendung darf nicht ungeprüft von einer festen Berliner UTC Verschiebung ausgehen.

## Warum dieses Ziel für Bundestag und Landtage sachgerecht ist

- Bundestag: Nach § 20 der Geschäftsordnung sind Änderungsanträge zu angekündigten Tagesordnungen bis **18:00 Uhr am Vortag** möglich. Dies ist **keine zugesagte Veröffentlichungsuhrzeit**. Bekannte Tagesordnungen und Ergänzungen lassen sich am Abend vorbereiten und morgens erneut prüfen. [Bundestag Geschäftsordnung](https://www.bundestag.de/parlament/aufgaben/rechtsgrundlagen/go_btg).
- Bundestag hib: Thematische Newsletter erscheinen werktags **gegen 15:30 Uhr**. Die Meldungen des Vortags können am Abend vorbereitet werden; einzelne neue Meldungen können zu anderen Zeiten erscheinen. [Bundestag Newsletter](https://www.bundestag.de/services/newsletter/newsletter?newsletter=hib).
- Bundesagentur für Arbeit: Die wichtigsten monatlichen statistischen Veröffentlichungen sind für **10:00 Uhr** vorgesehen; der separate Kalender nennt eine Sperrfrist der Pressemeldung um **09:55 Uhr**. Keine Nutzung vor zulässiger Veröffentlichung. Diese Inhalte gehören nach 07:30 Uhr in die laufende Lage/Radar Versorgung, sofern rechtlich und technisch freigegeben. [Veröffentlichungskalender](https://statistik.arbeitsagentur.de/DE/Navigation/Service/Veroeffentlichungskalender/Veroeffentlichungskalender-Nav.html).
- Abgeordnetenhaus Berlin: Der Ältestenrat legt die Tagesordnung regulärer Donnerstagssitzungen am Dienstag fest. Die konkrete Quellenversorgung und Rechte sind für Landesmandate gesondert zu prüfen. [Berliner Plenum](https://www.parlament-berlin.de/Ausschuesse/19-plenum).
- DIP Vorgänge enthalten im bisherigen Pilot teils nur einen Kalendertag. Aus einem Tagesdatum darf **keine erfundene Veröffentlichungsuhrzeit** abgeleitet werden. [DIP API](https://search.dip.bundestag.de/api/v1/swagger-ui/).

**Vollständig** heißt **nicht**, alle am selben Tag erst nach dem Morgenbriefing erscheinenden Artikel zu erfassen. Es heißt: Alle nach dem mandatsindividuellen Quellenvertrag für diesen Morgen tatsächlich fälligen, veröffentlichten, rechtlich zulässig lesbaren und relevanten Pflichtinformationen wurden geprüft und bei Relevanz bis in den gespeicherten Mandatsinhalt verarbeitet. Eine belegte fehlende Veröffentlichung, ein Zugriffsverbot, ein technischer Abruffehler und ein ruhiger Tag sind verschiedene Zustände.

## Verbindliche fachliche Ablaufplanung

Alle Zeiten beziehen sich auf **Europe/Berlin**. Dies sind **redaktionelle Zielphasen**, keine heute schon freigegebenen Cron Starts.

| Phase | Uhrzeit | Auftrag |
| --- | --- | --- |
| Vorabend | 16:00–22:00 | Neu veröffentlichte amtliche Vorgänge, Fristen, Tagesordnungen, Ausschusspläne, passende Regierungs- und Fachmeldungen, wichtige Presse und bereits identifizierte konkrete Handlungsanlässe lesen, analysieren und belegen |
| Nacht | 22:00–04:30 | Fällige nichtkritische Quellen, bestätigte Wiederverwendung, neue Nachrichten und Rückstände bearbeiten; die morgendliche Reserve und Originalkontingente nicht verbrauchen |
| Früher Pflichtdurchlauf | 04:30–06:45 | Geänderte Sitzungskalender, Plenum, relevante Ausschüsse, DIP, konkrete Fristen und bereits beobachtete Eilmeldungen gemäß Priorität abgleichen; analysierte Inhalte bis zum Redaktionsschluss an die Morgenpipeline übergeben |
| **Redaktionsschluss** | **06:45** | Neue reguläre Funde für diesen Morgen einfrieren; der Quellen- und Versionsstand wird nachvollziehbar gespeichert |
| Fachliche Ausgabe | 06:45–07:10 | Zulässige bereits gefundene Originale abschließend analysieren, dem richtigen Mandat zuordnen, maximal 3 belegte Tagesprioritäten auswählen, Lage und Briefing erstellen |
| Nachweis | 07:10–07:20 | Speicherung und Originalbelege rücklesen, Fristen, Mandantentrennung, tatsächliche Auslieferbarkeit und Vollständigkeitsstatus prüfen |
| Reserve | 07:20–07:30 | Nur begrenzte, sichere Wiederaufnahme; keine ungeprüfte späte Quelle erzwingen |
| **Morgenausgabe** | **spätestens 07:30** | Individuelles Briefing im Kundenprodukt sichtbar, mit tatsächlichem Quellenstand und korrekter Kennzeichnung vollständig/teilweise/gestört |
| Tagsüber | 07:30–22:00 | Neu veröffentlichte Artikel, amtliche Änderungen, Termine und dringende Signale nach tatsächlicher Fälligkeit verarbeiten; Lage und Radar aktuell halten; am Vorabend Folgebriefing vorbereiten |

**Ausnahme bei Eilmeldungen:** Ein nach 06:45 bestätigter außergewöhnlich dringender Vorgang darf nur dann noch zum Morgenpaket, wenn komplette Originalprüfung, Rechte, Fachurteil, Zuordnung und Speicherung ohne Risiko für die pünktliche Ausgabe nachweisbar möglich sind. Sonst unverzüglich im nächsten regulären Lage/Radar Zyklus bearbeiten. Kein rückdatiertes Briefing und keine verschleierte Lücke.

## Prioritäten nach Mandat, nicht nur nach Quellentyp

**P0 bis zum Morgen:** belegte heute bevorstehende Plenumsentscheidungen und Sitzungen, tatsächliche Fristen, relevante Ausschussunterlagen und Änderungen, relevante neue DIP Vorgänge mit unmittelbarem Handlungsanlass sowie belegte Eilmeldungen. Ein amtlicher Anbieter ist nicht allein deswegen automatisch P0. An einem Tag ohne einschlägigen Termin kann der Bedarf gering sein.

**P1 zeitnah:** bereits veröffentlichte wichtige Ministeriumsentscheidungen, Rechtsänderungen, Mandatserwähnungen, Fraktionssignale, verifizierte aktuelle politische und regionale Entwicklungen mit möglicher Handlung am selben Tag.

**P2 tagsüber:** Fachstatistiken nach ihrem echten Veröffentlichungskalender, weitere Regierung, Ministerien, Verbände, seriöse Medien, Parteien, Regionen und Quellen mit nachgewiesenem Tagesrhythmus.

**P3 nachrangig, aber nicht vergessen:** breite Google Entdeckung, Hintergrund, Archive und bereits bekannte doppelte Fundstellen; reservierte faire Verarbeitung überfälliger Arbeit. Ein neu gefundener dringender Artikel kann nach Originalprüfung sofort höhere **Analysepriorität** erhalten.

**Unterscheide:** Vor dem Abruf lässt sich die Quelle und ihre Fälligkeit priorisieren. Die konkrete Bedeutung eines **noch unbekannten Artikels** lässt sich erst nach dem Fund und der zulässigen Originalprüfung feststellen. Abrufpriorität und Analysepriorität sind getrennt.

## Technischer Vertrag und Abnahme

1. **Architektur unverändert:** Vercel Pro als begrenzter Ausführer, Supabase als einzige Queue und Datenwahrheit, vorhandener fachlicher Verarbeitungskern. Fly.io Frankfurt nur bei nachgewiesenem Infrastrukturproblem als Rückfall; kein Neubau, kein weiterer Server allein wegen dieser Entscheidung.
2. **Der heutige Zustand erfüllt die Zusage noch nicht:** 19.11. regulär 41/162 Quellen technisch erledigt, 754 alte fällige Aufträge; PR #1276 mit 0/1 vollständigen Pilotmorgen, 21 unterschiedlichen Originaladressen bei 16 internen Buchungen und fehlender vollständiger DIP Ausgabebindung. PR #1278 ist Forschung und Kapazitätsplanung, **keine** produktive 24 Stunden Umstellung. Quellenprobleme nicht mit neuer Zieluhrzeit kaschieren.
3. **Kapazitätsvorrang:** Zusätzliche genehmigte Arbeitsfenster über 24 Stunden so dimensionieren, dass P0 Abschluss und Ausgabe vor 07:30 nicht durch Google Hintergrundarbeit, Rückstände oder P3 blockiert werden. Bei Engpässen P0 Quelle, Parser, Analyse, Mandatsmatching und Speicherung rechtzeitig bis zur Produktausgabe einplanen, nicht nur den HTTP Abruf. Bestehende atomare Claims, Lease, CAS, Quotenbuch, Zeitbudget, Wiederanlauf und idempotente Auslieferung bleiben.
4. **Quoten und Rechte:** Weder 16 interne Originalreservierungen noch 1 USD pro UTC Tag, 30 USD Gesamtrahmen, Google Grenzen oder Quellenlizenzen werden mit dieser Doku erhöht. Neue Kosten oder Quellenrechte benötigen die geltenden Freigaben. Persönliche Inhalte nur mit Mandantentrennung und den vorhandenen expliziten Zugriffsfiltern.
5. **Echte Pilotabnahme:** Bei 1 realen aktiven Pilotmandat im isolierten gezielten Prüfstand und anschließend im regulären zugelassenen Betrieb Quellen → gültiges Original → Parser → Analyse → Mandatsmatching → gespeicherte Lage → max. 3 belegte Briefingprioritäten → sichtbares Kundenprodukt bis 07:30 nachweisen. Keine Erfolgsquittung für nur 41 erledigte Abrufe oder einen gespeicherten Leerzustand.
6. **Zeitnachweis:** Speicherung, Quellenrücklese und Auslieferung vor der Frist belegen; Winter und Sommerzeit mit gezieltem automatischem Test des Berliner Tageswechsels und der doppelten/nicht existenten Stunde; verspätete oder doppelte Cronzustellung darf keine doppelten Briefings erzeugen. Die 45 Minuten nach dem Schnitt sind **zu messender Puffer**, keine Garantie.
7. **Abweichungen offen anzeigen:** Bei fehlender veröffentlichter Information kein Fehler vortäuschen; bei defektem PDF, amtlichem Originalmangel, Zugriffssperre, unfertiger DIP Bindung oder ausstehendem Auftrag keine vollständige Versorgung behaupten. Rechtzeitig ein klar als teilweise gekennzeichnetes Briefing ist besser als erfundene Sicherheit.
8. **Danach bis 100:** Erst nach erfolgreichem Pilot eine belastbare Skalierungsrechnung einschließlich verschiedener Bundestags- und Landtagsquellen, tatsächlicher Google Reuse Rate, Modellkosten und Stoppkriterien. Historische Massentests nicht neu starten.

## Umsetzung und Freigabegrenze

**Dieses Dokument hält die bestätigte Produktentscheidung fest.** Es beauftragt **keine sofortige Änderung** von `vercel.json`, Produktionscrons, Datenbank, Tageslimits oder Budgets. Bis zum getesteten Umstieg bleiben die realen bisherigen UTC Produktionsfristen aktiv; der neue Produktvertrag ist ein **Sollwert**. Technische Umstellung nur unter `AGENTS.md` und `CLAUDE.md` und nach erfolgreicher gezielter Abnahme. PR #1276 und PR #1278 als vorhandene Vorarbeiten nicht duplizieren.

**Genau ein nächster Schritt:** Codex soll den vorhandenen offenen Pilotpfad aus PR #1276 unter Berücksichtigung der Quellenmatrix aus PR #1278 bis zum vollständigen 07:30 Morgenbriefing nachweisbar fertigstellen und erst dann die sichere Betriebsumstellung auf mehr Vercel Fenster durchführen. Keine zusätzlichen Tests oder Infrastrukturbeschaffungen ohne konkreten Anlass.
