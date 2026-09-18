# Beschluesse und Fristen im allgemeinen Verstehensauftrag

Stand 18.09.2026. Status: teilweise abgeschlossen. Der gemeinsame Promptfehler ist
korrigiert; eine verlaessliche semantische Antwortsperre und echte Modellwirkung sind
damit nicht bewiesen. Folgebranch `codex/aussagen-fristen-vertrag-20260918`, Basis
PR435 `6f122bbc41d27d64ad20a8b33ed8bcdec091ecfb`. Finaler Head und Pflicht CI im Draft PR.

## Beleg und Uebernahme

CLAUDE.md, START_HERE.md und CURRENT_STATE.md vollstaendig gelesen; keine geltende
AGENTS.md gefunden. Relevante Architektur und Fachpfade gezielt gelesen. PR433,
PR434 und PR435 offen, Draft, ungemergt und auf den vom Betreiber genannten Heads.
Main unveraendert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. Pflicht CI35334858874
von PR435 ist inzwischen erfolgreich abgeschlossen, am 18.09. um 13:43:45 Tuerkei /
12:43:45 Berlin / 10:43:45 UTC. Keine erfolgreiche Vorgaengerpruefung neu gestartet.

Vor Schreiben keine Actions in_progress oder waiting; nur die beiden queued
Altläufe 31128435980 und 31126446647 vom 06.08. Keine konkurrierende Reparatur in
den aktuellen offenen PRs, keine sichtbaren anderen lokalen Fachprozesse. Globaler
Work Sitzungsstatus ist nicht abfragbar. Saubere eigene Kopie auf der exakten Basis
angelegt; fremde Arbeitskopien nicht veraendert. Keine neue Datenbankaufnahme.

Der [abgeschlossene Gipfelversuch](gipfel-einzelversuch-2026-09-18.md#einmalige-ausfuehrung-des-korrigierten-ausfuehrers)
belegt zwei verbleibende Fehlerarten: politische Blickrichtung wird zu Beschluss
oder Verstaendigung; Empfehlungen erhalten Wochenfrist, Freitag und zwei Wochen
ohne Quellenbeleg. Seine vollstaendige Fachauswertung wird uebernommen, nicht
wiederholt. Originalantwort, Einmalquittung und damalige Kosten 0,006921 USD bleiben
erhalten. Kein neuer Artikelabruf oder Modellaufruf.

## Ursache und Auswahl des Blocks

Beide Fehlerarten treffen im selben globalen Prompt auf konkrete widersprechende
Anweisungen. Neben der bereits vorhandenen allgemeinen Belegpflicht verlangen
Titelmuster aktive politische Handlungen. Ein Beispiel macht aus der Aussage einer
einzelnen Person eine Position von Laendern beziehungsweise Bundesrat. Ein weiteres
macht aus einer unvollstaendigen Veroeffentlichungsmeldung eine geplante Reform.
Die Feldanweisung zu dueHint bietet heute, Freitag und diese Woche an, ohne dort die
Bindung an eine tatsaechlich belegte Handlungsfrist zu verlangen. Solche Beispiele
belohnen das Ausfuellen von Informationsluecken.

Das ist ein gemeinsamer Reparaturblock im Auftrag, keine nachgewiesene einzige
Ursache jedes semantischen Modellfehlers. Die bisherige Nachverarbeitung erzeugt
diese konkreten Saetze und Fristen nicht selbst: Sie uebernimmt Modellprosa und
dueHint, begrenzt Laengen und prueft die Form. Kommunikation und Handlungstitel
werden teilweise zwischen freien und strukturierten Feldern gespiegelt. Dadurch
kann sich ein unbelegter Inhalt weitertragen. Die deterministische Klassifikation
nutzt ebenfalls bereits erzeugte Texte und Listen; sie prueft keine Aussage gegen
Originaltext. Die Ministerienpruefung aus PR434 bindet nur zwei Namenslisten.

Der bereits vorhandene `briefing-quellenqualitaet` Pfad hat einen begrenzten
Fristenschutz fuer bestimmte spaetere Ausgabefelder. Er bearbeitet eine Ausgabekopie
und prueft unter anderem relative Zeitbelege. Er wird im globalen Understanding
nicht als Gesamtvalidierung aufgerufen und deckt etwa risk_of_no_action dort nicht
ab. Sein Bestehen ersetzt weder die Korrektur des Auftrags noch eine vollstaendige
semantische Abnahme. Dieser Schutz und seine vorhandenen Tests bleiben unveraendert.

| Bereich | Betroffene Felder und Weitergabe |
|---|---|
| Ereignis und Akteur | was_ist_passiert, headline, display_title, display_summary, wer_ist_betroffen, Akteurslisten |
| Bedeutung und Folgen | warum_wichtig, why_relevant, risiken, chancen, risk_of_no_action, opportunity_summary |
| Empfehlung und Zeit | handlungsempfehlung, recommendation, action_items, action_items_struct mit title, description und dueHint |
| Kommunikation | recommended_communication, recommended_communication_struct.communicationLine; gegenseitige Uebernahme bleibt bestehen |
| Abgeleitete Struktur | event_type und decision_entities koennen erzeugte Aussagen verwenden; keine zusaetzliche Quellenvalidierung |

## Vor der Aenderung festgelegtes Ergebnis

Ohne Quellenbeleg keinen Beschluss oder politische Verstaendigung als Tatsache
behaupten. Diskussion, Absicht, Forderung, Verneinung und Zuschreibung erhalten.
Keine Institution oder kollektive Position aus einer Personenstellungnahme machen.
Konkrete Fristen brauchen den belegten Zusammenhang von Akteur, Handlung und Zeit.
Publikation, Ereignistermin und Prioritaet erzeugen keine eigene Deadline.
Ohne Beleg bleibt dueHint leer; auch im Freitext keine Ersatzfrist. Belegte
Beschluesse und echte Fristen muessen unveraendert moeglich bleiben.

Diese Ziele sind der Arbeitsauftrag an das Modell, keine Garantie aus Offlinefixtures.
Die strengere fachliche Abnahme bleibt offen, solange eine echte Antwort oder eine
tragfaehige semantische Pruefung den gewuenschten Effekt nicht belegt.

## Kleine allgemeine Reparatur

Nur `buildUnderstandingPrompt` im bestehenden Fachmodul geaendert: gemeinsamer
Aussagen und Fristenvertrag fuer alle freien und strukturierten Felder; die
widersprechenden Titelbeispiele ersetzt und die dueHint Aufforderung korrigiert.
Die neuen Beispiele unterscheiden eine offene Diskussion von einem tatsaechlichen
Beschluss und erhalten den Sprecher einer Forderung. Akteur, Handlung, Gegenstand,
Aussagegrad und Zeitbezug bleiben zusammen. Bedingte Empfehlungen erlauben keine
erfundene Deadline. Fehlende Handlungen werden nicht durch Titelmuster erzwungen.

Keine Artikelkennung, Titelliste oder Herausgebersonderregel; der gemeinsame
Prompt gilt fuer alle zukuenftigen Quellen in Erstverstehen, Pending,
Aktualisierung und Auswerter, mit und ohne expliziten Artikelkontext. Quellenauswahl,
Quellenzeilen, Antwortschema, Nachverarbeitung, Speicherpfad, Kosten und CAS bleiben
unveraendert. Kein pauschales Woerterverbot und kein Abschneiden richtiger Fakten.

## Pruefungen

Neue Suite `scripts/understanding-aussagen-fristen-test.js`: 6/6 Gruppen erfolgreich.
Vier neutrale Faelle zu Schulsanierung statt Gipfel: Diskussion ohne Beschluss,
Beschluss mit festem Datum, bestrittene Einigung und Beschluss mit relativer Frist
ab Zustellung. Alle vier laufen in beiden Fachpfaden jeweils mit und ohne expliziten
Zusatz, insgesamt 16 isolierte Aufrufkombinationen. Genau eine Modellattrappe pro
Kombination, Speicherung der korrekten Antwort, Bestand unveraendert und keine
erneute Freigabe. Absolute und relative Frist bleiben auch im Auswerter erhalten.
Metadaten und ungenutzte Rohfelder bleiben von den gelieferten Quellentexten getrennt.

Dies sind feste synthetische Antworten. Geprueft sind Promptvertrag, Weitergabe und
Erhalt fachlich passender Daten, nicht das Verhalten eines echten Modells.
Gegenprobe mit unveraendertem Fachmodul aus PR435: dieselbe Suite scheitert an der
alten dueHint Aufforderung. Keine Arbeitsdatei zurueckgesetzt oder Antwort manipuliert.
Alle Testprozesse ueber `scripts/lokal.js` mit technischem Netzschutz.

Der kanonische Gesamtlauf ist gemaess CLAUDE.md Paragraph 6 vor einem neuen PR
verbindlich. Ergebnis und unabhaengige Pflicht CI werden nach Abschluss ergaenzt.

## Grenzen und Fortsetzung

Kein semantischer Ausgangsfilter hinzugefuegt. Eine erfundene Aussage kann bei
Missachtung des korrigierten Auftrags weiterhin die bestehende Formpruefung bestehen.
Auch gleiche Woerter in Quelle und Antwort beweisen weder denselben Akteur noch
dieselbe Handlung oder Frist. Deshalb kein scheinbarer Faktennachweis durch ein
einfaches Schlagwortverbot. Bestehende Wissensobjekte bleiben unveraendert.

Nach spaeterer Anwendung sind zurueckhaltendere Titel, weniger konkrete Empfehlungen
und haeufiger leere Fristfelder moeglich. Keine neue Quellenbeschaffung oder Aktivierung.
Artikelkontext bleibt AUS. Reale Modellwirkung, allgemeine Aussagequalitaet und der
vollstaendige neue 500er Production Nachweis bleiben offen. Der naechste sinnvolle
Schritt ist die zusammenhaengende Abnahme der Inhaltskorrekturen und ihrer Grenzen;
weitere Verbote ohne neuen Befund sind kein Nachweis. Kein neuer Modellversuch freigegeben.

Nur automatisches Deployment dieses Folgebranches in vercel.json gesperrt; alle
Crons und uebrigen Einstellungen unveraendert. Kein Merge, Deployment, Profilwechsel,
Production Datenzugriff, Migration, Environment oder Azure Wechsel. Rueckweg vor
Merge: diesen ungemergten Folgebranch verwerfen. Merge nach main wuerde Production
deployen und braucht eine eigene Freigabe.
