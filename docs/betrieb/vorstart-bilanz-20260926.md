# Vorstartbilanz vom26.09.2026

**Kein500er Start freigegeben oder ausgefuehrt.** Der autonome
[Betreiberauftrag](autonom-bis-500-starttor-20260926.md) ist gespeichert.
Die folgenden Ergebnisse ersetzen nicht die1500er Vollabnahme.

## Belegter Betriebsstand

Production-Lesung26.09.,02:19:43UTC: exakt500 Mandatsprofile,0 aktiv,
0 offene Jobs,0 lebende Sperren/Leases,0 offene Kostenreservierungen.
18 abgerechnete Modellaufrufe,0,128230USD bei unveraendert4USD Tagesgrenze.
Profile blieben bei allen Modellauftraegen vollstaendig hashgleich.

PR591 ist nach Pflicht-CI36210103294 als `d0ba4540` ausgerollt;
PR593 nach Pflicht-CI36210656244 als `daa57d9c`. Beide Deployments wurden
READY und ohne gemeldete Laufzeitfehler nachgelesen. Spaetere Integrations-
und Deploymentstaende stehen am jeweiligen PR, nicht in diesem Snapshot.

## Fachliche Bilanz

16 frische Originalquellen wurden importiert. Der erste Verstehensauftrag
stoppte nach einer fachlichen Ablehnung. Der eigene Restauftrag36208821692
verarbeitete nur die15 unbegonnenen Quellen:13 neue Vorgaenge,2 Aktualisierungen.
Beide Aktualisierungen vermischen verschiedene Ereignisse und sind keine
fachlichen Erfolge. Die bestehende Themenreinheitspruefung schliesst sie aus.
[PR591](https://github.com/ernisch/helmut-pilot/pull/591) verhindert neue
solche Zuordnungen; der Altbestand wurde nicht umgeschrieben.

Lokaler Originalbuilder auf gelesenen Production-Daten,01:40UTC:
500/500 Profile haben Briefing-Items,3/500 eine Tagesprioritaet,
497/500 keine Tagesprioritaet. Radar:499 leer,1 alt. Alle Kennungen wurden
bilanziert; dies ist kein Production-API-Mitschnitt und keine Textvollabnahme.
Die495 synthetischen Profile enthalten Testparteien/-themen/-wahlkreise und
reale Ausschuesse. Fiktive Signale begruenden keine echten Nachrichten. Auch
zwei reale Profile haben keinen Tagesanlass. Der geltende Speichervertrag
verlangt ihn ausdruecklich. Keine Prioritaeten erfinden oder Abnahme lockern.

Der begrenzte Lageauftrag36211228745 lief02:18:05–02:18:59UTC:
zwei Aufrufe,0,007648USD, zwei gespeicherte und rueckgelesene Absaetze,
keine Profilabweichung. Technisch bestanden; eigene Inhaltsabnahme **nicht
bestanden**: „fuer heute“ wurde aus einer Quelle vom Vortag uebernommen.
[PR594](https://github.com/ernisch/helmut-pilot/pull/594) sperrt diesen
verschobenen Zeitbezug beim Generieren und Lesen. Der datierte zweite Absatz
besteht die gezielte Gegenprobe. Original und private Pruefbelege bleiben erhalten.
Kein Retry dieses Auftrags. Eine technische Erfolgsquittung ist kein Fachurteil.

[PR592](https://github.com/ernisch/helmut-pilot/pull/592) entfernt die historische
Bevorzugung nach real/synthetisch aus Rotation, Cronreihenfolge, Einreihung,
Auftragsprioritaet und Aufrufgrenzen. Loeschschutz und Kommunikationssperren
bleiben erhalten. Die Pflicht-CI und der jeweilige Merge sind am PR zu pruefen.

## Verbleibende Startbedingungen

1. Belegte aktuelle Tagesversorgung fuer alle500 Zielprofile und fachlich
   bestandene tatsaechliche Lage-Ausgaben. Der aktuelle Bestand reicht nicht.
2. Tragfaehiger Kosten-/Zeitplan innerhalb4USD: Das einzelne Lagepaar kostet
   0,007648USD.500 identische Paare waeren3,824USD. Einschliesslich der letzten
   unveraenderten vollen Reserve ergibt das rechnerisch4,031289USD selbst auf
   einem sonst leeren Tag, aktuell4,159519USD. Das ist nur ein Rechenbeispiel,
   keine500er Messung; weitere Fachpruefung, Quellenarbeit und Fehler fehlen.
   Keine Budgeterhoehung und keine abgesenkte Qualitaetsstufe daraus ableiten.
3. Danach frischer rein lesender Startplan am tatsaechlichen Production-Commit,
   Endwaechter und Rueckweg auf0 bereit. Der installierte Endpfad ist vorhanden,
   aber fuer keinen neuen500er Lauf gestartet. Ein Startmanifest gilt nur kurz.
4. Erst ein neuer ausdruecklicher Betreiberauftrag darf diese500 Profile
   aktivieren und den Test starten.1500 Ergebnisse vollstaendig getrennt
   bilanzieren:500 Mandatsbriefings,500 Morgenbriefings,500 Lage-Ergebnisse.

Private Vollbelege liegen im lokalen Arbeitsartefaktordner der Aufgabe,
einschliesslich aller500 Einzelzeilen, unveraenderter Quellen-/Profilaufnahmen,
Modellquittungen, Kostenbuchungen und eigener Inhaltsabnahme. Keine private
Prosa oder Profilidentitaeten werden als oeffentliche PR-Belege ausgegeben.
