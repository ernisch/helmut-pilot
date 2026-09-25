# Sieben amtliche Quellen: begrenzter Anschlussauftrag

25.09.2026: Import verifiziert, erster scharfer Auftrag vor jedem Modell gestoppt.
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
- Erste Einmalquittung `verstehen-bund7-20260925-a` verbraucht; neuer begrenzter
  Auftrag `verstehen-bund7-20260925-b` nur nach den unten genannten Vorbedingungen.
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

## Kostenleser-Abbruch und neuer begrenzter Auftrag

PR573 Head1aff25b1, Pflicht-CI36140809080 SUCCESS; Merge
`02a19297e3b1656542b7d9e3dfdf35646238c0e9`13:33:00UTC. Production
`dpl_AXMyuzQci7vpC4Uq3t4JazbCh7RB` READY13:33:17UTC. Neuer Nurleseplan
36141732741 erfolgreich13:34:08UTC:7 Quellen/7 Cluster/7 Kandidaten,
6 neu/1 Aktualisierung,0 Modelle, Profile unveraendert.

Scharfer Auftrag36141840797 stoppte13:35:15.929UTC mit
`verstehen-kostenleser-fehler`:0 Modelle,0 verarbeitete Quellen,0 Profilwrites.
Production-Lesung13:36:05UTC bestaetigt die terminale Quittung a,0 Verknuepfungen
der sieben Quellen,0 Locks und unveraenderte Tageskosten0,304227USD.
Ursache: Der zentrale Kostenvertrag akzeptierte die neue Kennungsform
`verstehen-bund7-<Run-ID>` noch nicht. Das wird im zentralen bestehenden Adapter
ergänzt; Tarif, Reservierungshoehe und4USD-Riegel bleiben unveraendert.

Neuer Auftrag b erst nach gruener CI/Production-Rollout und neuer reiner
Vorpruefung. Er verlangt exakt die historische Quittung a samt Run36141840797,
Runtime02a19297, Kostenleser-Abbruch,0 Modellen/Verarbeitung und0 gebundenen
Kosten; jede bestehende Quellenverknuepfung sperrt. Der echte Kostenleser fuer
den neuen Lauf wird jetzt schon vor jeder Auftragsquittung und auch im
Nurleseplan ausgefuehrt. Keine alte Quittung wird geaendert oder wiederverwendet.
Beide Quittungen sperren die Importentfernung. Import wird nicht wiederholt.

Betreiber-GO und Entscheidungsdelegation liegen vor. Sachlich neue Grundlage
ist die belegte Adapterreparatur; keine automatische Wiederholung. Grenzen
unveraendert7 Modelle/0,30USD inklusive Reservierung/10min und4USD pro UTC-Tag.
Gezielt bestanden:10 Auftragsgruppen mit echtem Reservierungs-/Abrechnungsadapter,
12 bestehende Kostengruppen und29 Einmallauf-Kostenpruefungen.

## Auftrag b und Zuordnungsbefund

PR574 Headabac683f, Pflicht-CI36142368850 SUCCESS; Merge
`a4a1c0b50ae0711c7b0f164180530d2da6ae59fc`13:53:58UTC. Production
`dpl_ByRve8k6HYXwRGnS3oD6UBGdoso2` READY13:54:17UTC. Plan36144074961
bestand13:55:49UTC inklusive echtem Kostenleser und wirkungsfreiem Vorgaenger.

Scharfer Auftrag [36146635649](https://github.com/ernisch/helmut-pilot/actions/runs/36146635649)
14:19:05–14:19:41UTC:1 Modell,0,007794USD,1 gespeichert,
1 `skipped-artikelkontext`,5 nicht begonnen. Abbruch
`verstehen-bund7-einzelergebnis-nicht-bestaetigt`, Quittung b terminal gestoppt.
Kein Retry und keine neue Auftragskennung in dieser Reparatur.

Gespeichert: `vg-achtzehnjaehrige` (tatsaechliche Kennung mit Umlaut:
`vg-achtzehnjährige-20260925-d20924`), Fruehstartrente. Fachabnahme offen.
Die CO2-Quelle `rd-a1cd259ac1fb2d3a00e7e181a7ddcab55c6858d4e32875db2860f4e02791be32`
wurde schon vor der Update-Modellpruefung an `vg-bundesregierung-20260915-43922a`
verknuepft. Der Text dieses Altvorgangs wurde nicht aktualisiert. Er mischt
Sicherheits-, Pflege-, Energie- und IT-Vorhaben. Quellenkorrektur und Sperrung
sind getrennt vorzubereiten; die Codeaenderung bereinigt keine Bestandsdaten.

Reproduktion mit den gelesenen Originalzeilen: Allein `bundesregierung` trug
Beweisgewicht2 und den einzigen Bestandskern. Die Reparatur behandelt den
Regierungsakteur als generisch. Konkrete Sachanker sind weiter erforderlich;
alte Regierungskennungen bleiben Suchkandidaten, keine Identitaetsbelege.
Zweiter Fehler: Der Artikeladapter normalisierte auch fremde Altquellen mit
fehlendem Abrufzeitpunkt. Er prueft jetzt nur die eindeutig an den Beleg
gebundene Quelle. Doppelte Kennungen und echte Quellenaenderungen bleiben gesperrt.

Nachlesung14:21:27UTC:500 Profile/0 aktiv, Profil-MD5
`823590ce0d6f9971fe6fd9b028f811cf`, Identitaets-MD5
`831c8bd8ef299931cc39a33e2d166a5e`, Main-MD5
`48b15038d852547c6df44d61bdd06d67`;0 Jobs/Locks/Leases/offene Kosten.
Tageskosten0,312021USD, Limit4USD. Noch kein500er Funktionsnachweis.

## Vollstaendige lokale Eingabevorpruefung vor Auftrag b

Production-Snapshot13:40:01UTC:500 zuletzt aktualisierte Vorgaenge,936 Quellen.
Mit Code02a19297 alle500 unveraenderten Profile lokal und ohne Netz/Modelle
vollstaendig aufgebaut:51–77 Items je Profil,373–686 Pruefaussagen
(242641 insgesamt). Sichtbares Briefing bei500/500 leer; tatsaechliche Radar-
Anzeige ebenfalls500/500 leer. Der aeussere Radarstatus `fresh` allein ist
kein Inhaltsbeleg. Keine fertigen Lage-Texte und keine1500er Ergebnisabnahme.
Die private Eingabe und der Bericht liegen unter
`/private/tmp/helmut-500-versorgung-vor-bund7.json` und
`/private/tmp/helmut-500-versorgung-lokal-ergebnis.json`.

## Reparatur und Fehlbindung in Production verifiziert

[PR575](https://github.com/ernisch/helmut-pilot/pull/575), Head
`f0ef95bf291578c795398703e1e5b7dddffa42ad`, Pflicht-CI36152588328 SUCCESS
(Browser und Syntax/Offline). Merge25f656bc1688ec81dde7309792584df520153059
15:23:09UTC; Deployment dpl_A6nTCDsCm5tj4gpUD9WkhAJHPWCC READY15:23:28.727UTC.

Einmalige Quittung `bund7-fehlbindung-korrektur-20260925-a` abgeschlossen
15:24:10.648812UTC. Nachlesung15:24:29.847139UTC: genau die CO2-Fehlbindung
und die unbenutzte Vormerkung entfernt; Altvorgang pending/failed-final,
16 urspruengliche Quellen erhalten. Rohquelle, CAS und Modellgeschichte
unveraendert. KO-Nachhash `1a6b1f297d96d594b68b9dec7f444409` bestaetigt.
10/10 isolierte Datenbankgruppen vor Ausfuehrung bestanden. Keine Wiederholung.
SQL-SHA256 `1ba34a410ebcab2780ee50fb1743f4aa3c80987ff7d6a7a5591c1414e7294f02`.
Quittung enthaelt Vollsicherung; bedingter Rueckweg wuerde die Quelle wieder
anbinden, den gemischten Vorgang aber weiter sperren. Rueckweg nicht ausgefuehrt.
Profil-/Identitaets-/Main-Hashes unveraendert,500/0 und0 offene Kosten nachgelesen
15:24:39UTC. Tagesstand0,312021USD. Keine neue Modellquittung und kein500er Start.
Naechster begrenzter Schritt: [redaktioneller Siebenerplan](bund7-redaktion-20260925.md).
