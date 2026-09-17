# Ereignisbindung bei gleichzeitig berichteten Ministerreisen

Stand 17.09.2026. Sechster begrenzter Reparaturteil auf PR423. Status: teilweise abgeschlossen. Der belegte lokale Fehlerpfad ist korrigiert und der lokale Gesamtlauf erfolgreich. Der unabhängige GitHub CI Nachweis wird am veröffentlichten Head im zugehörigen Draft PR geführt; eine spätere Production Wirkung bleibt getrennt nachzuweisen. Kein Merge und keine Production Wirkung.

## Basis und Zuständigkeit

Rein lesende Übernahme: Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1` unverändert. PR419 bis PR423 offen, Draft und ungemergt mit den übergebenen Heads. CI35210945641 am PR423 Head `500c78f1a8b32fe369bc05c88359ca693a0f5a03` erfolgreich. Keine in_progress oder waiting Actions; ausschließlich die unveränderten queued Läufe31128435980 und31126446647 vom06.08. auf anderen Branches. Keine sichtbaren fremden Reparaturprozesse. Globaler Work Sitzungsstatus nicht abfragbar; Betreiber hat die Vorgänger beendet und die Fortsetzung autorisiert.

Vercel am17.09. bis13:59 Türkei /12:59 Berlin /10:59 UTC rein lesend bestätigt: Production `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy` READY, passender Main und Hauptalias. Keine neuen Deployments am17.09. im geprüften Zeitraum. Keine frische Datenbankaufnahme.

Eigene Arbeitskopie `/workspace/scratch/94bdc340ca7d/helmut`, Branch `codex/ereignisbindung-20260917`, Basis exakt PR423. Vorgängerkopien unverändert. Die fremde Kopie mit55 uncommitteten Vorarbeiten bleibt erhalten. Keine dieser Vorarbeiten übernommen.

## Originalbefund und nachgewiesene Ursache

Originale im privaten Paket `Helmut_500_Productiontest_20260915_Belege.zip`, Version18, Library ID `libfile_73a0aec215c8819190d5a55fd34b3924`: `Qualitaetsbefunde_A001_Quellenbindung_20260915.json`, `Qualitaetsbefunde_A001_Zeit_Titel_20260915.json` und `Pruefaufnahme_A001_34984794661.json`. Aufnahme SHA256 `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455`.

Der erhaltene Originalvergleich belegt zwei getrennte Ministerreisen. Die gemeinsame Karte beginnt mit der Genfer Reise, verlinkt aber primär auf die andere Reise in die USA. Beide Einzelsätze werden laut Originalprüfung jeweils von ihrem zugehörigen Bericht getragen; das beweist keinen gemeinsamen Vorgang.

Die unveränderten zwei Dokumente aus `korrekturBasis.sourcesByVorgang` reproduzieren auf PR423 exakt die gespeicherte Vorgangskennung `vg-heute-20260915-2f4939`. In `vorgang-identity.js` sind die einzigen gemeinsamen Belegwörter **reist** und **heute**. Beide zählen als spezifische Familien mit Gewicht1; gemeinsam erreichen sie die Schwelle2. Sowohl `docsShareEvent` für neue Gruppen als auch `sameVorgang` für die Zuordnung zum Bestand akzeptieren dadurch die sachlich getrennten Reisen. Die Ursache ist hier deterministisch belegt und liegt vor dem Modellaufruf.

Der ebenfalls belegte Arktisfehler hat einen anderen Fehlerpfad: Der erhaltene Auszug enthält „sollte den Anfang machen“, die Modellzusammenfassung „soll den Auftakt ... bilden“. Der damalige Originalvergleich belegt bereits den Gipfelabschluss. Die erhaltene Eingabe enthält den kurzen Auszug, nicht die dort genannten vollständigen Absätze zur Abschlusserklärung. Dieser Sprint kann weder den Abschluss aus neuen Originalstellen erneut nachweisen noch die Modellantwort fachlich korrigieren. Der Gipfel bleibt ausdrücklich offen. Fehlender Volltext muss für die deterministische Trennung der beiden Reisen dagegen nicht zuerst gelöst werden: Titel und Auszüge reichen zur Reproduktion des Fehlentscheids.

## Kleinste Korrektur

Das einzelne belegte Zeitwort `heute` wird der bestehenden Menge generischer Funktionswörter hinzugefügt. Es bleibt als Wort in den Quellen und Diagnoseankern erhalten, trägt aber kein spezifisches Ereignisgewicht mehr. Damit reicht das gemeinsame Wort `reist` allein nicht für die Verbindung. Dieselbe Regel schützt die Zuordnung zum Bestand und die Auswahl der Themenwurzel einer neuen Vorgangskennung.

Keine neue Wortarterkennung, kein Modellwechsel, keine neue Qualitätsplattform und keine Schwellenänderung. Dokumenttexte, Publikationszeiten, Rohdatenkennungen, Promptauswahl und Quellen werden nicht umgeschrieben. Es werden keine bestehenden Wissensobjekte oder Altpakete getrennt, gelöscht oder neu erzeugt. Insbesondere bleiben bereits gespeicherte falsche gemeinsame Karten zunächst unverändert.

## Prüfungen

Alle Läufe über `scripts/lokal.js`, ohne Production Zugang oder Modellaufruf.

Neue synthetische Suite `scripts/ereignisbindung-heute-test.js`:8/8 Gruppen erfolgreich. Vor der Änderung scheiterte sie am belegten Fehlentscheid. Geprüft sind beide Vergleichsrichtungen, verlustfreie und reihenfolgestabile Trennung, Bestandszuordnung einschließlich echtem Resolver mit lokalen Abhängigkeiten, erhaltene Zusammenführung echter Folgemeldungen, getrennte andere Ereignisse derselben Person, Großschreibung sowie unverändertes Quellenmaterial.

Gezielte Regressionen: Beweisfamilien108/108, Vorgangsidentität67/67 und Bestandsresolver54/54 erfolgreich.

Privater Replay aller123 erhaltenen Quellenlisten: Genau die betroffene Zweiergruppe wird getrennt,122 Listen liefern einschließlich ihrer abgeleiteten Kennungen dasselbe Ergebnis. Beide Originaldokumente bleiben vollständig erhalten. Originalhash, beide Vergleichsrichtungen und unveränderte Eingaben sind geprüft; alle123 Promptauswahlen bleiben identisch. Das ist ein Replay der vorhandenen Dokumentlisten, kein erneuter Production Lauf und keine Prüfung aller500 Profiltexte.

Zusätzliche Grenzprobe mit allen265 erhaltenen Dokumenten als einem künstlichen gemeinsamen Stapel:124 Gruppen vorher,125 danach, kein Dokumentverlust. Die beiden Ministerreisen bleiben auch darin getrennt. Andere fachlich unpassende Verbindungen sind weiterhin möglich, etwa die Verbindung der USA Reise mit einer anderen Meldung über denselben Verteidigungsminister. Dieser künstliche Stapel ist nicht der historische Crawl und liefert ausdrücklich keine Gesamtfreigabe der Ereignisbindung. Dieser unabhängige Befund wird hier nicht durch weitere Regeln überdeckt.

Kanonischer Gesamtlauf am unveränderten Anwendungscode: **399/399 Suiten in649 Sekunden**, Exit0. Anschließend gezielte Prüfung der abschließenden Statusdokumentation. Abhängigkeiten aus der vorhandenen Vorgängerlaufzeit bei identischen Paketdateien übernommen; keine Paketänderung oder Schutzabsenkung. Lokaler Zwischencommit `8bc3c13` sicherte die Korrektur vor dem Ende des Gesamtlaufs. Der abschließende veröffentlichte Commit ist über den Branch und den zugehörigen Draft PR eindeutig nachzulesen. Syntax und Diffprüfung erfolgreich.

## Grenzen und nächster Schritt

Behoben ist der konkrete Belegfehler `heute` bei neuer Ereignisbildung und Bestandsvergleich. Nicht behoben sind gespeicherte Altvermischungen, allgemeine Rollen oder Personengleichheit als zu schwacher Ereignisbeleg, der Gipfelabschluss, falsche Vornamen oder andere fachliche Aussagen. Neue Modellantworten wurden nicht erzeugt oder bewertet. Kein allgemeiner Nachweis korrekter Ereignisbindung.

Nächster kleiner Schritt: den nun abgegrenzten Gipfelfehler anhand des vorhandenen Quellenauszugs und des gespeicherten Originalvergleichs untersuchen; klären, ob die vollständigen Abschlussabsätze für eine sichere Korrektur benötigt werden und wie sie im tatsächlichen Eingabepfad fehlen. Bereits umgesetzten Quellenzeitvertrag aus PR419 erhalten. Umgang mit bestehenden gemischten Vorgängen separat planen; keine Production Datenkorrektur ohne Freigabe.

Vor erneutem500er Nachweis bleiben Versorgungskapazität, begrenzte Fortsetzungsplanung, fachliche Aussagenprüfung, vollständiger App Abruf aller500, Kosten, zuverlässiges Testende und unabhängiger Abschluss offen.

Automatisches Deployment dieses Folgebranches wird vor Veröffentlichung in `vercel.json` ausgeschaltet. Alle13 Crondefinitionen bleiben byteinhaltlich unverändert. Kein Merge, Deployment, Migration, Production Schreibvorgang, Profilwechsel, Cronwechsel, Budgetwechsel oder externer Versand. Lokaler Rückweg: diesen Folgebranch verwerfen. Merge würde Production deployen und ist nicht freigegeben; ein späterer Production Rückweg benötigt eigene Freigabe und muss die Zustandsversion3 aus PR420 erhalten.
