# Quellenfrist und ehrlicher Morgenabschluss — 12.11.2026

Zwei weitere konkrete Fehler im bestehenden Verarbeitungsweg:

- Der gemeinsame Worker beendet sein Warten nach Timeout, die Handler-Promise
  laeuft aber weiter. Eine spaete Quellenantwort konnte danach noch Persistenz
  und Folgeauftraege starten. Der Quellenhandler prueft jetzt seine vorhandene
  absolute Auftragsfrist vor jeder neuen Phase und nach asynchronen Schritten.
  Bereits gestartete Anfragen werden dadurch nicht abgebrochen; deren spaeter
  Ausgang darf keine weitere Phase starten. Quoten und Wiederholungslogik bleiben.
- Der Morgenlauf meldete insgesamt ok=true trotz kanonisch bestaetigter
  Teilversorgung. Sein Gesamtstatus folgt jetzt derselben Versorgungsbilanz wie
  die gespeicherte Lauftelemetrie. Ein urspruenglicher Fehlergrund bleibt erhalten.

Vorherige Fehler sind durch Verhaltensproben reproduziert. Gezielte Pruefungen
ueber lokal.js: Anbieter-Fachpfad71/71, Queue-Inhaltsversorgung29/29 und
Morgenpaketnachweis19/19 bestanden; Syntax und Diff geprueft. Spaete positive
und negative Antworten erzeugen keine neuen Writes oder unbehandelten Rejections.

Stand: Korrekturen vorbereitet, Pflicht-CI und Rollout noch offen. Sie beweisen
weder die Ursache der Produktionsneustarts noch einen wiederhergestellten
Briefingbetrieb. Keine weiteren Betriebs-/Modelllaeufe oder Konfigurationsaenderung.
Rueckweg: gezielter Code-Revert ohne Daten- oder Zaehlerreset.
