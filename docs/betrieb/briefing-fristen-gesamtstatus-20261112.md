# Quellenfrist und ehrlicher Morgenabschluss — 12.11.2026

Zwei weitere konkrete Fehler im bestehenden Verarbeitungsweg:

- Der gemeinsame Worker beendet sein Warten nach Timeout, die Handler-Promise
  laeuft aber weiter. Eine spaete Quellenantwort konnte danach noch Persistenz
  und Folgeauftraege starten. Der Quellenhandler prueft jetzt seine vorhandene
  absolute Auftragsfrist vor jeder neuen Phase und nach asynchronen Schritten.
  Bereits gestartete Anfragen werden dadurch nicht abgebrochen; deren spaeterer
  Ausgang darf keine weitere Phase starten. Quoten und Wiederholungslogik bleiben.
- Der Morgenlauf meldete insgesamt ok=true trotz kanonisch bestaetigter
  Teilversorgung. Sein Gesamtstatus folgt jetzt derselben Versorgungsbilanz wie
  die gespeicherte Lauftelemetrie. Ein urspruenglicher Fehlergrund bleibt erhalten.

Vorherige Fehler sind durch Verhaltensproben reproduziert. Gezielte Pruefungen
ueber lokal.js: Anbieter-Fachpfad71/71, Queue-Inhaltsversorgung29/29 und
Morgenpaketnachweis19/19 bestanden; Syntax und Diff geprueft. Spaete positive
und negative Antworten starten keine neue Inhaltspersistenz oder Folgeauftraege
und erzeugen keine unbehandelten Rejections.

Eine isolierte lokale Probe mit zwei fiktiven Profilen bestand ausserdem den
Verarbeitungsweg mit PostgreSQL17.6, PostgREST14.5 und pgvector0.8.0 einschliesslich
nativer Vektorsuche, Lage und Morgenpaket. Gemeinsames RAM-Limit: 948191232 Bytes;
kein OOM oder Neustart. Modellantworten waren lokale Fixtures. Die x86-Probe
bildet weder den Supabase-Host noch dessen Control Plane ab und ist kein
Produktions- oder Mock100-Nachweis.

Stand19:38UTC: [PR1173](https://github.com/ernisch/helmut-pilot/pull/1173) gemergt.
Beide Pflichtchecks in CI43287629795 auf04aa4de9 erfolgreich. Production8d1740f7
READY; Hauptdomain, Startseitenversion und Runtime am19:37UTC per GET bestaetigt.
Kommunikationssperre aktiv, anonyme Sitzung nicht angemeldet. Rein lesender
Vorflug: keine aktiven Auftraege oder Sperren, Datenbank seit14:38UTC unveraendert.

Offen bleiben die Ursache der Produktionsneustarts und ein wiederhergestelltes
echtes Tagesbriefing. Die lokale Probe und der Rollout beweisen beides nicht.
Keine weiteren Betriebs-/Modelllaeufe oder Konfigurationsaenderung.
Rueckweg: gezielter Code-Revert ohne Daten- oder Zaehlerreset.
