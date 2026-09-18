# Globale Analyse ohne erfundenes Leserprofil

Stand 18.09.2026. Status: teilweise abgeschlossen. Der allgemeine Widerspruch im Analyseauftrag ist korrigiert. Reale Modellwirkung und fachliche Production Abnahme bleiben offen. Eigener Folgebranch `codex/mandatsneutral-verstehen-20260918`, Basis PR434 `3002b9f4559ab3a7e1496933cedc39fa60feed40`. Der zugehoerige Draft PR traegt den finalen Commit und CI Abschluss.

## Uebernahme und Beleg

Pflichtdokumente gelesen, keine geltende AGENTS.md gefunden. Die eigene Arbeitskopie war sauber. Main unveraendert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`; PR433 auf `a37855af379c223c268be13c20bf7f10b7215bc4` und PR434 auf der genannten Basis weiterhin offen, Draft und ungemergt. PR434 CI35331099924 ist abgeschlossen und erfolgreich; ihre408/408 Suiten werden uebernommen. Keine konkurrierende Reparatur in den offenen PRs. Keine Actions in_progress oder waiting; nur zwei alte queued CI Laeufe vom06.08. Lokal kein weiterer Prozess sichtbar. Ein globaler Work Sitzungsstatus ist technisch nicht abfragbar. Fremde Arbeitskopien bleiben unangetastet.

Der [gesicherte Gipfelbefund](gipfel-einzelversuch-2026-09-18.md#einmalige-ausfuehrung-des-korrigierten-ausfuehrers) ist Bestandteil der Inhaltsreparatur aus dem abgeschlossenen500er Test. Fachlauf35325406170, seine vollstaendige38 Felder Pruefung und die Kosten werden als abgeschlossen uebernommen. Kein erneuter Artikelabruf, Modellaufruf, Import oder Zuruecksetzen. Genau ein damaliger Azure Aufruf mit0,006921USD; Einmalquittung und Kostenbelege erhalten.

Offener Teilbefund4: Chancen fuer das Mandat, Reputationsrisiken und eine politische Unterstuetzungslinie ohne mitgeliefertes Profil. Die globale Analyse fordert im bisherigen `buildUnderstandingPrompt` ausdruecklich Relevanz fuer dieses Mandat, Betroffenheit dieses Profils und eine glaubwuerdige Positionierung. Zusaetzlich verlangt die eingebundene Stabschef Persona direkte Ansprache und persoenliche Handlungen. Der tatsaechliche Eingabepfad liefert ausschliesslich ausgewaehlte Quellen, kein Mandatsprofil. Dasselbe Wissensobjekt wird fuer verschiedene Mandate verwendet.

Das ist ein allgemeiner Widerspruch zwischen Auftrag und vorhandenen Informationen. Er betrifft alle zukuenftigen Quellen und Artikel. Die Reparatur enthaelt weder eine Gipfelkennung noch eine Personen, Parteien oder Artikelsonderregel. Keine Originalantwort oder bestehender Datensatz wird manuell korrigiert.

## Enger Motorfix

Der gemeinsame Prompt verlangt jetzt eine mandatsneutrale politische Analyse. Oeffentliche Akteure aus Quellen sind keine Profilangaben des Lesers. Allgemeine Bedeutung, Risiken und Chancen brauchen einen Bezug zum belegten Vorgang und seinen benannten Akteuren. Handlungs und Kommunikationsoptionen muessen Akteur und Voraussetzung nennen. Keine persoenliche Betroffenheit, Rufannahme, Positionierung, Unterstuetzung oder Aufgabenverteilung an ein unbekanntes Buero. Ohne Grundlage bleiben optionale Texte und Listen leer sowie Stufen unknown. Das bestehende nichtleere Pflichtfeld handlungsempfehlung kann die fehlende Handlungsgrundlage ausdruecklich benennen.

Die widersprechenden Feldanweisungen und persoenlichen Beispiele wurden ersetzt, statt nur ein weiteres Verbot daneben zu stellen. Der bislang nur vorbereitete optionale briefingType fuegt auch bei direkter Uebergabe keinen persoenlichen Tagesauftrag mehr in die globale Analyse ein. Ein Typ liefert weder ein Profil noch eine Tageslage. Die getrennten Sprachbausteine fuer spaetere Tagesbriefings bleiben erhalten; ihre bisherigen Tests bleiben bestehen.

Erstverstehen einschliesslich Pending, Aktualisierung und Auswertung benutzen denselben Promptbau. Antwortschema, Quellenauswahl, Quellenzeilen, Ministerienbeleg, Speicherlogik, Geldriegel und CAS bleiben unveraendert. Die persoenliche Relevanzerklaerung aus tatsaechlichen Profiltreffern in matching-begruendung und matching-erklaerung bleibt ebenfalls unveraendert. Es wird kein Profil in das globale Modell eingeschleust und kein zusaetzlicher Modellpfad eingefuehrt.

## Pruefung

Neue Offline Suite `scripts/understanding-mandatsneutral-test.js`:5/5 Gruppen. Sie prueft den gemeinsamen Auftrag, alle Tagesoptionen samt ignorierten fremden Profilfeldern, die unveraenderte Quellwiedergabe auch bei persoenlichen Zitaten, Erstverstehen und Aktualisierung jeweils mit und ohne expliziten Artikelkontext sowie den Auswerter. An der echten Aufrufgrenze wird genau eine lokale Attrappe angesprochen. Ehrliche Leerwerte und unknown bleiben speicherbar, bestehende Objekte werden nicht veraendert, kein zweiter Aufruf und keine erneute CAS Freigabe.

Gegenprobe mit dem unveraenderten Fachmodul aus PR434: dieselbe neue Suite scheitert an der weiterhin geforderten persoenlichen Relevanz ohne Profil. Nur der alte Code wurde in einen isolierten lokalen Testprozess geladen, keine Arbeitsdatei ersetzt. Das ist ein Nachweis des Promptwiderspruchs, kein nachgestelltes Modellurteil.

Bestehende Sprachsuite28/28. Fuenf Assertions pruefen jetzt den korrigierten globalen Auftrag; Tests der getrennten persoenlichen Sprachbausteine, Quellen und Datenschutzvorgaben bleiben erhalten. Alle Tests ueber scripts/lokal.js ohne Production Kennungen. Der nach CLAUDE.md Paragraph6 vor jedem PR vorgeschriebene kanonische Gesamtlauf bestand409/409 Suiten in826 Sekunden, Exit0. Anwendungscode waehrend des Laufs unveraendert; kein Fehler und kein zweiter lokaler Gesamtlauf. Statusgroesse4/4 und Diffpruefung erfolgreich. Vorhandene Abhaengigkeiten wiederverwendet, kein Paketupdate. Keine manuelle Wiederholung eines erfolgreichen alten PR Laufs. Die automatische CI am veroeffentlichten Head wird im zugehoerigen Draft PR separat nachgewiesen.

## Grenzen, Risiko und Fortsetzung

Diese Korrektur beseitigt eine allgemeine Ursache im Auftrag. Sie beweist noch nicht, dass ein Modell die Vorgabe immer einhaelt. Es gibt keine neue semantische Antwortsperre fuer beliebig formulierte persoenliche Behauptungen. Eine solche Antwort koennte weiterhin die vorhandene Formpruefung bestehen. Ein blosses Woerterverbot waere kein verlaesslicher Profilbeleg und koennte korrekt zitierte oeffentliche Akteure verwerfen.

Moegliche Folge nach spaeterem Deployment: weniger oder bedingte Handlungsempfehlungen und haeufiger ehrliche Leerfelder. Bereits gespeicherte fehlerhafte Wissensobjekte bleiben erhalten; kein Backfill. Reale Antwortqualitaet, unbelegte Beschluesse und Fristen sowie der gesamte500er Production Nachweis bleiben offen. Als naechster kleiner Inhaltsblock bietet sich die belegte Erzeugung konkreter Handlungsfristen ohne Zeitbeleg an. Keine automatische Ausweitung dieses Auftrags.

Automatische Deployments des eigenen Folgebranches sind gesperrt; alle13 Crons und die uebrige Konfiguration bleiben gleich. Kein Merge, Deployment, Production Datenzugriff, Profilwechsel, Migration, Environment oder Azure Wechsel, bezahlter Modellaufruf oder neuer500er Test. Vor einem Merge laesst sich ausschliesslich dieser ungemergte Folgebranch verwerfen. Ein spaeterer Merge nach main wuerde deployen und ist nicht freigegeben.
