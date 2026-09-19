# Lagebriefing: aktive Zielmenge und gespeicherte Fortsetzung

Stand 17.09.2026. Zweiter begrenzter Reparatursprint, ausschliesslich Code und Offlinepruefung. Kein Merge, Deployment, neuer Production Lauf oder Profilzugriff mit Schreibwirkung.

## Ausgangspunkt und Branch

Branch `codex/lage-aktive-fortsetzung-20260917` baut auf `eea7c24f4d9f3ed8bb2cd74d7eaab87043c34d8e` aus [PR419](https://github.com/ernisch/helmut-pilot/pull/419) auf. Der Folge PR richtet sich gegen diesen Branch, damit sein Diff nur diesen zweiten Sprint zeigt. Er ist von PR419 abhaengig; beide bleiben ungemergt. Main bleibt `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`.

Vor den Aenderungen: Arbeitskopie sauber, Main und beide offenen PRs unveraendert. Nur die lesende CI zu PR419 laeuft; die zwei alten wartenden CI Laeufe vom 06.08. betreffen andere Branches. Kein weiterer lokaler Reparaturprozess sichtbar. Kein neuer Vercel Deployment seit 07:00 UTC. Ein globaler Work Sitzungsstatus ist weiterhin nicht abfragbar. Der alte Arbeitsstand mit 55 uncommitteten Dateien bleibt erhalten und unveraendert.

Die alte Vorbereitung vom 16.09. wurde gezielt verglichen. Uebernommen wurde die Verwendung des aktiven Mandantenresolvers und des vorhandenen Fairnessspeichers fuer den direkten Lagepfad. Die dort vorbereiteten vier Verarbeitungsspuren, neuen Crontermine, Morgenpakete und fachlichen Ablehnungscaches sind nicht Bestandteil dieses Sprints.

## Ursache und Korrektur

Der erhaltene Testabschluss nennt fuer den direkten Lagepfad **504 als Zielmenge und nur 12 begonnene Profile**. Im bisherigen Code ist die Ursache nachvollziehbar: `listProfiles()` liefert auch inaktive Profile, `profiles.length` zaehlt sie mit. Die feste Liste wird bei jedem Aufruf erneut von vorn durchlaufen, bis 240 Sekunden erreicht sind. Zudem wurde ein Fehler beim Laden dieser Liste als leere Liste verschwiegen.

Der direkte Handler verwendet jetzt `runCronForTenants` mit dem bestehenden aktiven Resolver. Inaktive und geloeschte Profile werden vor der Zielmengenbildung entfernt, doppelte Kennungen nur einmal beruecksichtigt. Ein Listenfehler bleibt ein Fehler. Vor der eigentlichen Facharbeit wird das einzelne Profil erneut auf Deaktivierung geprueft.

Die Reihenfolge folgt fuer diesen Pfad ausschliesslich der Versuchshistorie: bisher nicht begonnene Profile zuerst, danach der aelteste Versuch. Es gibt hier keinen Vorrang einer Profilklasse. Jeder Beginn wird ueber die vorhandene bedingte Speicherung und Gegenlesung bestaetigt. Ein anderer Halter verhindert doppelte Arbeit. Scheitert das Laden, Schreiben oder Bestaetigen der Fortsetzung, beginnt keine weitere Facharbeit. Das gilt fuer diesen Pfad auch bei ausgeschalteter Fairness. Bisherige Aufrufer behalten ihre bisherigen Standardoptionen.

Bei der Umsetzung wurde ein zusaetzlicher, direkt betroffener Fehler gefunden: Das Laufprotokoll schnitt Planung und Ausgaenge nach **200 Profilen** ab. Die begrenzte Kapazitaet betraegt jetzt **500**. Nicht bestaetigte Beginne erhalten einen eigenen Ausgang; sie werden nicht als verarbeitet oder erfolgreich rekonstruiert. Dafuer steigt die Version des vorhandenen JSON Zustands von 2 auf 3. Es gibt keine Datenbankmigration.

Versorgungszaehler und Vollstaendigkeit beziehen sich auf die gesamte aktive Zielmenge. Demoausgaben, ausstehende Narrative und fehlendes Quellenmaterial gelten nicht als gespeicherte Lage. Ein Zeitrest ist `partial`; fachliche oder technische Fehler bleiben sichtbar. Die Einzelbefunde bleiben datensparsam in beiden bisherigen Protokollprojektionen erhalten.

## Pruefung

Die erweiterte Routensuite wurde vor der Codeaenderung ausgefuehrt: **5 bestanden, 3 gescheitert**. Nach der Korrektur **8/8 bestanden**, einschliesslich 500 aktiver plus vier inaktiver Profile, 500 gespeicherter Planungsplaetze und Ausgaenge sowie leerer Persistenzabweichung.

Die neue Fortsetzungssuite prueft **14/14 Gruppen** ueber den echten Handler, den echten Mandantenwrapper, Resolver und Fairnessablauf. Nur Speichertransport, Uhr und Facharbeit sind lokale Attrappen. Sie deckt Fortsetzung in einem neuen Ausfuehrungskontext, eine aktive 500er Zielmenge, Profilklassen, Liste und Speicherfehler, fehlende Gegenlesung, ausgeschaltete Fairness, fremde Claims vor und waehrend der Registrierung, zwischenzeitliche Deaktivierung, unechte Versorgungserfolge und den getrennten Warteschlangenzweig ab.

Bestehende Regressionen: Fairness **288/288**, bedingte Persistenz **54/54**, Narrativ **92/92**, Verdraengungsschutz **38/38**, Pipelineflags **52/52**, Fehlervertrag **80/80**. Sechs anfaenglich gescheiterte Strukturpruefungen wurden auf den neuen Aufruf, dieselben 240 Sekunden und die neue Zustandsversion angepasst; der Mutationstest bleibt wirksam. Kein Pruefziel wurde entfernt. Syntax aller elf betroffenen Javascript Dateien und `git diff --check` bestanden.

PR419 hat beide GitHub Pflichtpruefungen bestanden: Lauf `35194395708`, abgeschlossen am 17.09. um 07:39:22 UTC.

Der erste kanonische Gesamtlauf endete mit Exit1. Sein Dateiprotokoll blieb unvollstaendig und belegt nur die ersten 54 Suiten, darunter eine veraltete Signaturerwartung im Berlintest. Diese wurde angepasst und mit 80/80 Assertions erfolgreich nachgeprueft. Fuer die restlichen Suiten dieses Laufs wird kein Ergebnis behauptet. Deshalb wurde das vorgeschriebene Gate einmal erneut mit direkt mitgelesener Terminalausgabe vollstaendig ausgefuehrt: **394/395 Suiten erfolgreich in 680 Sekunden**. Einzige verbliebene Suite: `warteschlangen-abfluss-test.js`, zwei Strukturpruefungen erwarteten noch `listProfiles()` statt des aktiven Wrappers. Auf den neuen Aufruf angepasst, danach **32/32 Assertions erfolgreich**. Der Nachlauf wird weiterhin auf fehlende Direktverarbeitung geprueft. Keine weitere Anwendungscodeaenderung nach dem Gesamtlauf. Damit kein offener Testfehler; dies ist ausdruecklich ein vollstaendig protokollierter Gesamtlauf plus erfolgreiche gezielte Nachpruefung, kein behaupteter 395/395 Gesamtlauf. Alle lokalen Pruefungen entfernen Production Kennungen und sperren externe Netzwerkzugriffe. GitHub CI und ein spaeterer Production Nachweis sind getrennte Nachweise.

## Grenzen, Risiko und Rueckweg

* Dies garantiert keine Versorgung von 500 Profilen innerhalb eines Morgenslots. Verarbeitung bleibt seriell; Facharbeit, Speicherlatenz und das bestehende Zeitbudget begrenzen die Kapazitaet. Es gibt keinen neuen Ausloeser fuer einen Folgelauf.
* Aktive Zielmenge bedeutet alle dann aktiven Profile. Die Uebereinstimmung mit einer vorab festgelegten Liste von exakt 500 Profilen muss der gesondert freizugebende Testvorflug belegen. Es gibt keine kuenstliche Auswahl oder automatische Aktivierung.
* Ein erfolgloser Fachversuch bleibt ein Versuch. Dauerhaft fehlende Quellen oder abgelehnte Texte werden durch faire Reihenfolge nicht fachlich repariert. Die Rotation verspricht Beginn, keinen inhaltlichen Erfolg.
* Nach einem spaeteren Deployment koennen alte Instanzen den Zustand Version3 wegen der schon vorhandenen Versionsschranke nicht ueberschreiben. Ein reines Zurueckrollen auf Version2 stellt deshalb die gespeicherte Fortsetzung nicht wieder her. Ein spaeterer Rueckweg muss Version3 weiterhin lesen und erhalten; den Zustand nicht loeschen oder herabstufen. Vor einem produktiven Rollout sind dieser Effekt und die groessere gespeicherte Planung zu beruecksichtigen.
* `vercel.json` erhaelt nur die Deploymentsperre fuer den neuen Branch. Alle **13 Crondefinitionen** bleiben identisch. Kein Workflow, Flag, Budget, Modell, Environment, Azure Wert, Profil oder Production Datensatz wurde geaendert.

Lokal kann der isolierte Folgebranch verworfen werden, ohne PR419 oder die erhaltene alte Arbeitskopie zu veraendern. Ein produktiver Rueckweg sowie Merge und Deployment benoetigen eine eigene Freigabe.

## Noch offen

Morgenversorgung und gespeicherte Gesamtpakete, tatsaechliche Kapazitaet und freizugebende Folgelaufplanung, Quellenversorgung, Zuschreibung und sachlicher Profilbezug, Titel und Dubletten sowie der verbindliche Testabschluss bleiben gesonderte Arbeit. Die bestehenden Budgetreserven und anderen Verarbeitungswege wurden nicht auf Gleichbehandlung umgestellt. Ein erneuter kostenpflichtiger 500er Production Test ist nicht freigegeben.

Naechster sinnvoller kleiner Sprint: pruefen und korrigieren, wann eine Morgenquittung tatsaechlich ein gespeichertes vollstaendiges Gesamtpaket belegt. Keine neuen Crontermine oder Production Aufrufe daraus ableiten.
