# Morgenversorgung: gespeicherte Pakete und ehrliche Abdeckung

Stand 17.09.2026. Begrenzter dritter Reparaturteil, aufbauend auf PR420. Keine Production Wirkung. Gesamtinhaltsabnahme und neuer 500er Nachweis bleiben offen.

## Uebernahme und Basis

Rein lesender Abgleich am 17.09. gegen 11:39 Tuerkei / 10:39 Berlin / 08:39 UTC: Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`; PR419 Head `eea7c24f4d9f3ed8bb2cd74d7eaab87043c34d8e`; PR420 Head `eb687a5c849cb0602a08035c2c4893c944a1d4ce`. Beide offen, Draft, mergeable, ungemergt. Beide Pflichtjobs einschliesslich Datenbanknachweisen erfolgreich: CI35194395708 und CI35197748793. Diese alten CI Laeufe wurden nur nachgelesen; der neue PR verlangt einen eigenen Gesamtlauf.

Keine laufende oder wartende Action; nur zwei alte queued CI Laeufe vom 06.08. auf anderen Branches. Keine weitere entfernte Reparatur und keine lokale Aenderung nach PR420 gefunden. Relevante Testautomationen deaktiviert. Die alte isolierte Testautomation hatte keinen naechsten Termin und zuletzt am 28.08. gearbeitet. Privater Uebergabestand Version505: Steuerung FREI. Kein anderer lokaler Reparaturprozess sichtbar; ein globaler Work Sitzungsstatus ist nicht abfragbar. Der aktuelle Betreiberauftrag autorisiert diesen rein lokalen Folgesprint.

Erster gesicherter Zwischencommit `4a30a2220441c6b974db977c0eb47ec083227bb8`; der nachfolgende Abschlusscommit enthaelt die belegte Telemetriekorrektur, den erweiterten Testvertrag und diese Ergebnisse. Beide bauen auf PR420 auf. Der finale Commit ist im zugehoerigen PR und dessen CI eindeutig gebunden.

Eigene saubere Kopie auf Branch `codex/morgen-paketnachweis-20260917`, Basis PR420. Die beiden fertigen PRs und die alte Kopie mit 55 uncommitteten Vorarbeiten bleiben unveraendert. Aus der alten Vorarbeit wird die Idee der regulaeren Paketmaterialisierung fortgesetzt, nicht deren neue Crons, vier Verarbeitungsspuren oder Qualitaetsumbau.

## Belegter Blocker und Ursache

Der abgeschlossene Production Test meldete 131 Morgenquittungen bei 500 aktiven Zielprofilen. Der private Endbeleg und `500-productiontest-2026-09-15.md` unterscheiden Quittungen, gespeicherte Gesamtpakete und Lage. Ein erfolgreicher Morgenprozess hatte keinen neuen gespeicherten Gesamtbriefinginhalt bewiesen. Dies sind historische Befunde, keine neue Production Auswertung.

Im Handler baute `buildV3Briefing` die Ausgabe, danach wurden Push und `morgenlage` Quittung behandelt. Der vorhandene `briefing-speicher.materialisiere` wurde dort nie aufgerufen. Die Prozessentscheidung ignorierte zudem die unvollstaendige Frischeabdeckung. Der neue Routentest scheiterte vor der Aenderung genau am fehlenden gespeicherten Paket.

Die andere belegte Morgenluecke, fehlende weitere Ausfuehrungszeiten innerhalb desselben Morgens, bleibt getrennt. Ein gespeichertes Paket ist eine Voraussetzung fuer einen sinnvollen Fortsetzungslauf, ersetzt dessen Planung aber nicht.

## Kleinste Korrektur

* Der regulaere Morgenhandler uebergibt sein gebautes Briefing an den bestehenden Paketspeicher und liest das Ergebnis mandats und tagesscharf zurueck. Kein neuer Generator, kein zusaetzlicher Modellaufruf, keine neue Tabelle oder Migration.
* Unvollstaendige Pakete koennen bei einem spaeteren regulaeren Aufruf um inzwischen gespeicherte Lage ergaenzt werden. Die vorhandene bedingte Speicherung und der komplette Vorgaenger bleiben erhalten. Ein Konflikt ist ein Fehler und wird nicht automatisch wiederholt.
* Ein bereits vollstaendiges Paket wird nicht ueberschrieben. Quittungssignatur und Push beziehen sich auf dessen wirklich gespeicherten Briefinginhalt. Identische Wiederholungen erzeugen keine weitere Paket oder Quittungszeile und keinen zweiten Push.
* Paketfehler verhindern Erfolgsquittung und Push. Eine nicht bestaetigte Quittung zaehlt auch bei vorhandenem Paket als Fehler. Ein Berliner Tageswechsel waehrend des Baus erzeugt kein Paket fuer einen anderen Tag.
* Die Antwort zaehlt Quittungen, gespeicherte Pakete, strukturell vollstaendige Pakete und die gemeinsame Versorgung getrennt. Die aktive Zielmenge bleibt der Nenner. `processed` ist jetzt die im aktuellen Aufruf bestaetigte gemeinsame Versorgung; `deferred` nennt die noch fehlende Versorgung und kann technische Fehler einschliessen. `fehlgeschlagen` bleibt deren separater Zaehler (relational `failed_count`).
* Vollstaendigkeit verlangt erneut gepruefte Struktur und den aktuellen Lagequellenvertrag. Ein altes gespeichertes positives Flag reicht nicht. Teilversorgung wird `partial`, technische Totalausfaelle `failed`. Der ausgeschaltete Frischevertrag meldet weiterhin keine Frischeabnahme; ein leerer aktiver Bestand bleibt ein erfolgreicher Leerlauf.
* Der Morgenhandler verwendet die in PR420 bereits vorhandenen Optionen fuer gleichberechtigte Rotation und verpflichtende bestaetigte Fortsetzung. Keine neue Fairnessimplementierung und keine Parallelisierung. Ohne funktionierenden Fairnessspeicher beginnt keine Facharbeit.

`versorgung` ist der Nachweis dieses Aufrufs, keine kumulative Vollaufnahme aller heute gespeicherten Pakete. Eine spaetere vollstaendige Tagesabnahme muss alle 500 Profile separat lesen. Die Morgenquittung bleibt ein technischer Beleg, keine fachliche Inhaltsfreigabe. `fachlicheAbnahme` bleibt ausdruecklich offen.

## Pruefung

Neue Routensuite: 18/18 Gruppen erfolgreich. Echter Handler, Mandantenresolver, Fairness, Paketmaterialisierer, Quittung und Telemetrieprojektion; Speichertransport, Uhr, Briefingbau und Zustellung sind lokale Attrappen. Enthalten: fehlende Lage, spaetere Ergaenzung mit Vorgaenger, Idempotenz, gespeicherter statt neu gebauter Inhalt, Lese und Schreibfehler, fehlende/fremde Gegenlesung, Konflikt, Quittungsfehler, Leerzustand, alte Quellenversion, 500er Zielmenge mit Zeitende und Fortsetzung, 500 technisch vollstaendige Pakete, Fairnessfehler, Deaktivierung, Listenfehler, Baufehler, abgeschalteter Vertrag und Tageswechsel.

Gezielte Regressionen: Frischeaudit38/38, Frische Ende zu Ende68/68, Paketvollstaendigkeit23/23, Fehlervertrag80/80 und aktive Lagefortsetzung14/14 erfolgreich. Syntax der geaenderten Javascript Dateien, Statusgroesse4/4 und Diffpruefung erfolgreich.

Kanonischer Gesamtlauf: **393/396 Suiten in652 Sekunden**. Zwei Ausnahmen waren Arbeitsumgebungsfehler: globale Playwright Version verlangte Chromium1234, vorhanden war der zu CI passende Browser1194. Mit der bereits vorhandenen Playwright1.56.1 Laufzeit und demselben unveraenderten Testcode danach Nutzerloeschung75/75 und Passwortfluss39/39 erfolgreich. Kein Download, keine Aenderung an Paketdateien oder Schutzregeln. Die dritte Suite `punkt29-fixpfade` erwartete die alte kuerzere Fehlerbedingung im Quelltext. Der Vertrag wurde um Paket und Quittungsfehler erweitert, danach40/40 erfolgreich. Der echte Routentest prueft zusaetzlich den simulierten Pushfehler und den unveraenderten Fehlerausgang.

Bei der Speicherpruefung wurde der Telemetriezaehler auf das tatsaechlich erhaltene Feld `fehlgeschlagen` korrigiert. Die neue Route wurde nach dieser letzten Anwendungscodekorrektur mit18/18 erneut geprueft, einschliesslich relationalem `failed_count`, `processed_count` und `deferred_count`. Es bleibt kein offener lokaler Testfehler. Dies ist **Gesamtlauf plus gezielte Nachpruefungen**, kein behaupteter zweiter durchgehend gruener Gesamtlauf. Der zugehoerige Draft PR dokumentiert den finalen Commit und dessen getrennte GitHub Pflichtpruefungen.

Alle Tests laufen ueber `scripts/lokal.js`, ohne Production Zugang. Kein abgeschlossener Production Nachweis aus diesen lokalen Simulationen.

## Grenzen, Risiko und Rueckweg

Die zusaetzlichen Paketlesungen und Schreibvorgaenge kosten Laufzeit. Die Verarbeitung bleibt seriell bei 240 Sekunden. Ein durchgehender 500er Morgenslot ist nicht bewiesen; kein neuer Ausloeser wird eingerichtet. Nicht erreichte Profile bleiben fuer den naechsten vorhandenen oder spaeter gesondert freizugebenden Aufruf in der gespeicherten Rotation.

Vollstaendige Altbelege mit altem Quellenvertrag werden als unvollstaendige Versorgung gemeldet, aber nicht automatisch geaendert. Deren eventuelle Erneuerung gehoert zur spaeteren Rollout und Testvorbereitung. Im neuen Test muss der Testtag eindeutig sein; keine Vermischung alter Tage oder fachlicher Urteile.

Automatische Deployments dieses Folgebranches sind in `vercel.json` ausgeschaltet. Alle 13 Crondefinitionen sind unveraendert. Keine Workflow, Environment, Azure, Budget, Profil oder Production Datenaenderung. Kein externer Versand und kein bezahlter Modellaufruf.

Lokaler Rueckweg: nur diesen isolierten Folgecommit zuruecknehmen. Ein spaeterer produktiver Rueckweg braucht eine eigene Freigabe und muss die Zustandsversion3 aus PR420 erhalten. Merge wuerde Production deployen und ist nicht freigegeben.

## Reparaturstand vor erneutem 500er Nachweis

| Teil | Technisch vorbereitet | Noch offen |
| --- | --- | --- |
| PR419 | Quellentext und Publikationsmetadaten getrennt; gueltige Kalenderdaten und Quellenjahr erhalten | Fachliche Wirkung am Modelloutput und Quellenvollstaendigkeit |
| PR420 | Aktive Lagezielmenge, gespeicherte Rotation, bestaetigter Beginn, 500 Laufplaetze | Tatsaechliche Kapazitaet und weitere Ausloeser |
| Dieser Folgebranch | Morgenpaket speichern und gegenlesen; spaetere Ergaenzung; ehrliche Versorgung | Review und spaetere Production Wirkung; CI separat im PR |

Weitere belegte Fehler bleiben gesondert zu bearbeiten: fehlender Quellentext, falsche Zuschreibung und Ebene, Ereignisaktualitaet, sachlicher Profilbezug, doppelte Artikelkennungen und abgebrochene Titel. Titel und Artikelvarianten sind der naechste kleinere unabhaengige Inhaltsblock; Originalbefunde zuerst gezielt abgleichen. Fachliche Aussagenpruefung und vollstaendiger App Abruf fuer alle 500 bleiben verpflichtend. Die benoetigte Ausfuehrungskapazitaet, begrenzte Fortsetzungsplanung, Kosten und zuverlaessiges Testende muessen vor neuer Startfreigabe geklaert sein.

Der neue kostenpflichtige Production Test braucht weiterhin ausdrueckliche Freigabe mit exakt 500 Zielprofilen, Zeitfenster, Gesamtkosten, Stopps und unabhaengigem Endnachweis. Code fertig, lokale Tests und Production Nachweis bleiben getrennt.
