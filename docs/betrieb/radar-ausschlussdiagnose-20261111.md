# Radar: konkrete Ausschlussgruende am 11.11.2026

## Ergebnis und Grenze

Der authentifizierte lesende App-Abruf um14:27:07UTC liefert einen alten
Radarstand mit1Eigenerwaehnung,7Partei-Zuordnungen,1Dynamik und48Artikeln.
Die sichtbare Auswahl ist leer. Die geprueften Rohkandidaten enthalten kein
gueltiges aktuelles Radar-Signal, das durch den Anzeigefilter verloren geht.
Keine fachlichen Filter lockern und alte Quellen nicht als aktuell ausgeben.
Dieser Befund beurteilt die gelieferten Rohkandidaten; er beweist keine
vollstaendige globale Erwaehnungs- oder Quellenabdeckung.

Production zum Pruefzeitpunkt: `88c876f193488b73cd95fc2beabb66a88f334a53`,
Vercel `dpl_FzfUsDDwctRn7HBk7YBaH1QiXhtv`, READY.
Die spaeteren reinen Agenten-/Dokumentationsmerges aendern den geprueften
Radarcode nicht. Dieser Diagnoseauftrag enthaelt nur Dokumentation.

## Gepruefte Kandidaten

| Kandidat | Juengster gueltiger Artikel | Ausschluss |
| --- | --- | --- |
| Eigenerwaehnung, Bundestagsrede | 25.09.2026 | Aelter als das siebentaegige Personenfenster |
| Berliner Sondierungen | 26.09.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Pflichteinsatz Halle | 21.09.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Kreisvorstand Essen | 17.09.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Wohnungskrise Berlin | 12.09.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Social-Media-Regulierung | 12.09.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Rentenvorschlaege | 21.06.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |
| Jugendorganisation | 19.06.2026 | Keine aktuelle Folgequelle oder kommende belegte Frist |

Alle8Kandidaten haben in den verknuepften Originalquellen null gueltige
Publikationen innerhalb der letzten7Tage und keine kommende belegte Frist.
Die Quellenabfrage vom14:28:36UTC umfasst25Dokumente zu10Vorgaengen;
darunter sind die12Originaldokumente der8Personen-/Partei-Kandidaten.

Vier der48Rohartikel liegen im siebentaegigen Fenster: Pflegereform08.11.,
Mittelstand07.11., Angriffskrieg06.11. und Ausschusssitzungen05.11.
Ihre Rohrelationen sind ausschliesslich `media` oder `official`; sie tragen
keinen belegten Personen-, Partei-, Wahlkreis- oder Ausschussbezug.
Die Pflegereform-Dynamik wird deshalb bereits bei der Relationspruefung
ausgeschlossen. Eine aktuelle Fachnachricht allein ist kein persoenliches
Umfeldsignal.

Nach Relationspruefung und Artikelentdopplung bleiben1Erwaehnung,
7Partei-Zuordnungen und1Restartikel. Der Restartikel vom25.09. ist ein
Sachstand; der Bereichsvertrag erzeugt daraus keine zweite Artikelliste.
Die anschliessende Zeit-/Beobachtungspruefung entfernt die8alten Signale.

## Nachweis am vorhandenen Code

Die originale Radarantwort und ein rein lesend erhobener Quellensnapshot
wurden privat ausserhalbGit gespeichert. Netzloser Replay ueber
`scripts/lokal.js`, `radarState.ordneArtikelEinmal` und
`briefing-bereichsvertrag.radarAnzeige` reproduziert saemtliche sichtbaren
Listenlaengen der echten Antwort exakt:0Erwaehnungen,0Partei-,0Wahlkreis-,
0Ausschuss-Zuordnungen,0Dynamiken und0Artikel. Kein Modellaufruf oder
Production-Schreiben durch diesen Nachweis.

Private Belegdateien dieser Sitzung, SHA256:

- App-Antwort: `6d4e4015ff74c0125a42c682570b4b380c5464fe6e9b552862aad7f7d64a1fbc`.
- Quellensnapshot: `b8bf7d5d3b7565b973604e81ce2ee930933280929920fcd3977b6dc6d7b0af62`.
- Ausschlussbilanz: `feaacd86c874f1d6aa570c63b7d1432eddf02e62c6efd956a2fbfcba2b8f3c3d`.

Keine vertraulichen Originale oder Profilfelder inGit uebernehmen.
Der Replay ist eine begrenzte Diagnose, kein neuer End-to-End-Betriebsnachweis.

## Quellen-Nachschub und naechster Schritt

Letzter dokumentierter Rohquellenabruf09.11.,04:01:10UTC; letzte
vollstaendige Wissensverarbeitung09.11.,04:02:58UTC. Die protokollierten
Quellenstarts am11.11. scheiterten mit
`planung-einreihung-nicht-bestaetigt`; die Quellenabdeckung blieb blockiert.
Der inzwischen ausgerollte Automatikfix ist davon zeitlich zu unterscheiden:
ein erfolgreicher Quellenlauf nach seinem Rollout ist hier nicht belegt.

Native reine Lesepruefung14:31:31UTC:8von8Quellenarbeitsfenstern und
2400von2400reservierten Sekunden verbraucht;0laufende Prozesse und
0aktive Pipeline-Sperren. Auch fehlgeschlagene Reservierungen bleiben
verbraucht. Ein weiterer Adminstart kann dieses Tageskontingent nicht
ueberschreiten. Nichts zuruecksetzen oder erhoehen.

Der konfigurierte naechste regulaere Quellenstart liegt am12.11.,03:00UTC
(04:00Berlin). Danach sind Laufabschluss, neue ausgewertete Quellen und die
tatsaechliche Radaransicht erneut rein lesend zu pruefen; ein gefuellter
Radar ist dadurch noch nicht garantiert. Kein eigener Zeitplan oder neuer
Quellenlauf wurde eingerichtet/gestartet. Ein ausserplanmaessiger manueller
Lauf bleibt gesondert freizugeben und braucht den vorhandenen angemeldeten
Adminpfad; dessen Berechtigungen und Kontingente werden nicht umgangen.

Rueckweg dieses Dokumentationsauftrags: nur den Dokumentationscommit
revertieren. Kein Runtime-, Daten-, Budget-, Profil- oder Cron-Eingriff.
