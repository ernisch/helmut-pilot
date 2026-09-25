# Sieben amtliche Quellen: begrenzter Anschlussauftrag

25.09.2026: Import verifiziert, Verarbeitung noch nicht gestartet.
Das umfassende Betreiber-GO samt Entscheidungsdelegation liegt vor. Ausfuehrung
erst nach gruener Pflicht-CI, Production-Rollout und frischer Vorlesung.

## Eingabe und Import

Genau sieben neue Rohdokumente mit sieben Fundstellen aus dem amtlichen
Bundestagsfeed `aktuellethemen.rss`. Originalpublikationen24.09.21:25UTC bis
25.09.11:00UTC. Die Quellenzeiten bleiben erhalten. Sieben bereits gesicherte
Originalabsatze nach dem [Artikelvertrag](bundestag-artikelversorgung-20260925.md)
werden quellen- und inhaltsgebunden hinterlegt; keine Volltexte im Repository.
Die gefundenen Adressen wurden13:00:44UTC gegen Production gegengeprueft:
kein Bestandstreffer,500 Profile/0 aktiv.

- Eingabe SHA256: `e4c48282338bf161d70e6fa844b7ba09f53834f9821aeded78182387fc521f8f`.
- Kennungsmenge SHA256: `3673a24e0b8eceb88ce98ee0a6914499c77956409bf996ec690d6698ba792f9f`.
- Nutzfelder SHA256: `e7322e54360c74b6746d225a1cd13d0c5597425cc69915609faa09c776e2bde8`.
- Gebundene Belege SHA256: `bddbeec40cbcf98c8ebf9938df13850c760965946b2d1a8af2db2333e4e041c1`.
- Private Eingabe: `/private/tmp/helmut-bund7-eingabe.json`.
- SQL-Plan: `scripts/quellen-bund7-plan.js`; erzeugte private Import-/Lese-/Rueckwegdateien
  `/private/tmp/helmut-bund7-*`. Importquittung `quellen-bund7-20260925-a`.

Atomarer Import,15 Sekunden je Anweisung,2 Sekunden Lockgrenze. Abbruch bei
Bestandstreffer, unfrischer Eingabe, aktivem Profil, Job, Prozess, Lock oder
Verstehenslease. Rohfelder und Fundstellen werden vollstaendig zurueckgelesen;
Profile, Identitaeten, Auth und Main muessen unveraendert bleiben. Die sieben
Belege entstehen in derselben Transaktion. Kein Modellaufruf im Import.

Rueckweg nur fuer die sieben unveraenderten Quellen/Fundstellen samt
Belegablage, solange keine fachliche Verknuepfung und keine Verstehensquittung
existiert. Spaetere Verarbeitung oder veraenderter Inhalt sperrt die Entfernung.
Zehn isolierte PostgreSQL-Gruppen bestanden: exakte Aufnahme, Wiederholungsverbot,
Rueckweg, Aktiv-/Job-/Leasesperre, Quittungskollision/Atomarik und Rueckwegsperren
bei nachtraeglichem Inhalt, Quellenverknuepfung oder Verstehensauftrag.

## Fachliche Verarbeitung

Genau diese sieben Eingaben, sieben getrennte Cluster. Bestehende Vorgangsauflosung,
CAS/Fencing, Kostenbuch und Modellvalidierung bleiben massgeblich. Fruehstartrente
oder Tankrabatt koennen bestehende Vorgaenge aktualisieren; keine erzwungene
Neuanlage und keine Freigabe alter gesperrter Fehler.

Der neue Auftrag verwendet nur die vorher gesicherten, exakt gehashten Belege.
Kein Artikelabruf waehrend des Laufs und kein Einschalten des allgemeinen
Artikelkontext-Flags. Der gesamte gesicherte Siebener-Datensatz und seine
Belege werden vor Planung validiert; bei der Modellverarbeitung wird der
aktuell ausgewaehlte Quellenstand nochmals an den einzelnen Beleg gebunden.
Fremde Lieferfunktionen und alte169er/30er Quittungen entriegeln diesen Auftrag nicht.

- Maximal7 Modellaufrufe; maximal10 Minuten.
- Maximal0,30USD inklusive offener Reservierungen; voller naechster Aufruf
  muss vorab passen. Technischer Tagesriegel unveraendert4USD.
-0 Profilwrites und0 Aktivierungen; alle500 bleiben inaktiv.
- Einmalquittung `verstehen-bund7-20260925-a`, kein automatischer Retry.
- Sofortiger Stopp beim ersten nicht bestaetigten Einzelresultat.
- Erfolg erst bei7/7 bestaetigten fachlichen Ergebnissen und unveraenderten
  Profilen. Ein technisch gespeichertes Ergebnis ist noch keine Prosaabnahme.

Workflow `verstehen-bund7.yml`, nur erster manueller Main-Dispatch am exakt
ausgerollten Commit. Zuerst leerer Bestaetigungstext fuer den Nurleseplan;
danach ausdruecklicher Bedienwert `DIE_7_AMTLICHEN_QUELLEN_EINMAL_VERSTEHEN`.
Die Nutzerfreigabe liegt vor; der Bedienwert wird durch Codex gesetzt.

Gezielte Pruefungen: sechs neue Gruppen inklusive echter privater Eingabebindung
und isolierter Laufsteuerung (7/7, Fehlerstopp nach2, Kostenstopp nach1,
Wiederholungsverbot),30er Vertrag6/6, bestehender Einmallauf117/117.
Fuer die Laufsteuerungspruefung wurde der Modellmotor durch eine Attrappe ersetzt;
dieser Test behauptet keine neue Modell-/Fachqualitaet. Vier der sechs neuen
Gruppen laufen ohne private Quelle in CI. Noch kein500er Funktionsnachweis.

## Integration des vorgeschalteten Lesers

PR571, Head5d3687a6, Pflicht-CI36138272757 SUCCESS. Merge13:07:59UTC
`520cdfa5ba68a518b8da83ff5816782ccf10b37a`, Deployment
`dpl_3BUovxrZsNb3yofiUL2fo1xxpgEr` READY13:08:20UTC.

## Import und Speicherformat-Korrektur

PR572 Head d32c3e1e, Pflicht-CI36139320410 SUCCESS. Merge
`ee4e9fa1b91ab1564a722b85e0147187ee7c6b89`13:18:38UTC, Production
`dpl_4h7Fyti2RcW76EHupWwcHrdj27ax` READY13:18:58UTC.
Import13:19:18.923761UTC; Nachlesung13:19:28UTC:7 Dokumente/7 Fundstellen,
alle Nutzfelder und alle gespeicherten Belege exakt.500/0 und saemtliche
Profil-/Identitaets-/Main-Fingerabdruecke unveraendert, Kosten0,304227USD.
Import ist verbraucht und darf nicht wiederholt werden.

Nurleseplan36140248162 stoppte13:20:36UTC vor Auftrag und Modellzugang.
Rein lesend13:22:55UTC bestaetigt: keine Verstehensquittung, Tageskosten
unveraendert. Ursache lokal mit allen sieben Production-Zeilen reproduziert:
PostgreSQL schreibt dieselben Zeitpunkte als `+00:00` statt `Z`; der alte
Artikelhash bindet auch diese Darstellung. Die Importinhalte sind identisch.

Korrektur ausschliesslich im Siebener-Vertrag: Beleg zuerst gegen dieselben
kanonischen UTC-Zeitpunkte vollstaendig pruefen; erst danach gegen die konkrete
Speicherzeile binden. Historische Vertraege, Originalbeleg und Daten unveraendert.
Echte Zeitverschiebung, Submillisekundenabweichung, Datum ohne Zeit, Text-,
Quellen- oder Zielaenderung bleiben gesperrt.8 gezielte Gruppen einschliesslich
aller7 echten Production-Zeilen und10 bisherige Artikelgruppen bestanden.
Noch kein kostenpflichtiger Lauf; erneuter Nurleseplan erst nach gruener CI
und Ausrollung dieser Reparatur.
