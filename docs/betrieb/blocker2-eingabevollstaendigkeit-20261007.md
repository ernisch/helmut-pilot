# Blocker 2: notwendige Eingaben aller 500 synthetischen Profile

Stand: 07.10.2026, neue rein lesende Production-Aufnahmen zwischen 13:42 und
13:44 Uhr Europe/Istanbul (10:42–10:44 UTC). Codebasis
`416cb2f1028203df1fe05ff8580bb1a23a7f36b8`. Nachlieferung des Originalarchivs
und vorbereitete Resolverkorrektur unten. **In Bearbeitung, keine Abnahme.**

## Vollstaendige Profilbilanz

Alle 500 kanonischen synthetischen IDs sind in der neuen Aufnahme vorhanden;
kein Stichprobenverfahren. 330 Bundestag, 120 Berlin, 50 Brandenburg, 0 aktive
Mandate. 501 Identitaeten insgesamt. Der belegte inaktive Import wurde weder
wiederholt noch erneut als Importstufe getestet.

Die vorhandene reine Paketableitung wurde mit jedem der 500 tatsaechlichen,
durch den bestehenden Storage-Mapper rekonstruierten Mandatsprofile ausgefuehrt.
Profilhash, vollstaendige Paketentscheidung und Entscheidungshash sind je ID
gebunden. Bundestag braucht Bund-Basis, Berlin Bund-/Berlin-Basis, Brandenburg
Bund-/Brandenburg-Basis. Die drei Pflichtpakete sind derzeit `active` und besitzen
Abrufwegbindungen. Dies belegt **Paketzuordnung**, keine Versorgung mit den
notwendigen aktuellen Quellen und keine Vorgangsresolver-Abnahme.

| Bereich | Profile vollstaendig erfasst | Eingabevollstaendigkeit angenommen |
|---|---:|---:|
| Bundestag | 330 | 0 |
| Berlin | 120 | 0 |
| Brandenburg | 50 | 0 |

Eine private JSON-/CSV-Matrix fuehrt jede ID, Mandatsebene, Land, deklarierte
Szenariothemen, Profilhash, Paketentscheidung und die offenen Eingabeklassen.
Eine weitere Liste bindet alle 1500 Bereichspositionen an diese IDs. Diese sind
Eingabepositionen, keine Ergebnisse eines durchgefuehrten 500er Tests.

## Tatsaechlicher Quellen- und Wissensstand

Production enthaelt 31.138 Rohdokumente und 17.393 Wissensobjekte. Diese Mengen
belegen weder notwendige Themenabdeckung noch aktuelle Profilversorgung.

Alle gespeicherten amtlichen Artikelstaende der drei unterstuetzten Familien
wurden vollstaendig gelesen und durch die unveraenderten kanonischen Artikel-
und Quellenzeitleser geprueft: 1 Bundestag, 12 Berlin, 15 Brandenburg, 28 insgesamt.
Alle 28 Metadaten-/Identitaetsbindungen sind lesbar. Alle 28 haben jedoch
`retrieved_at=null`; der Verstehensprompt gibt entsprechend `abgerufenAm=null`
weiter. Fuer die 27 Landesartikel existiert auch keine `document_findings`-Zeile.
Der einzelne Bundestagsfund besitzt einen gesonderten historischen Fundzeitpunkt;
dieser wurde nicht still in einen Abrufzeitpunkt umgedeutet.
Der bestehende SOURCE23-/Zeitvertrag erlaubt einen unbekannten Abrufzeitpunkt.
Ein solcher Nullwert ist deshalb keine pauschal notwendige Reparatur und kein
eigenstaendiger Abnahmeblocker. Eine spaetere Behauptung ueber einen bestimmten
Abrufzeitpunkt benoetigt weiterhin einen Originalbeleg.

`published_at=null` ist bei diesen Artikelstaenden **kein Reparaturauftrag**:
der Quellenvertrag erhaelt den amtlichen Publikationstag in den Standmetadaten,
bei Brandenburg auch den gesondert gebundenen RSS-Zeitpunkt. Keine Uhrzeit,
kein Ereignisdatum und keine neue Frische aus Speicher-/Abrufzeiten erfinden.
Berliner Publikationstage reichen bis 06.10. Die konkrete notwendige Auswahl
und das Nachrichtenfenster fuer alle Profile bleiben ungebunden.

Alle 27 amtlichen Landesartikel haben 0 Wissensobjektverknuepfungen. Aeltere
Landesobjekte und Nachrichten ueber reale Personen ersetzen diese Bindung nicht.
Neu abgerufene DIP-Daten sind gesondert vorhanden; sie werden nicht allein wegen
ihrer Anzahl als angenommene aktuelle Bundestagsversorgung gewertet.

## Offene Eingabeklassen je Profil

Die vollstaendige 500-Zeilen-Matrix weist fuer jede ID aus:

1. notwendige aktuelle Quellen- und Themenauswahl;
2. Publikationsdatum/-praezision und Fensterzulassung der notwendigen Auswahl;
3. notwendige Wissensobjekte, Versionen und Quellenverknuepfungen;
4. Ereignis-/Themenzustaendigkeit auf der passenden Mandatsebene;
5. urspruengliche Cluster-/Vorgangsresolverentscheidungen mit exakten
   Bestands-, Prefix-, Link-, Reservierungs- und Vormerkungsbelegen;
6. tatsaechliche Briefingeingabe samt Quellen-/Profilbindung und angenommenem
   Fachurteil fuer den betreffenden Briefingtag.

Fuer jedes der 500 Profile wurden aktuell 0 relationale Entscheidungen,
0 Matching-Ergebnisse und 0 gespeicherte Briefings erfasst. Auch die gelesenen
synthetischen Store-/Command-Bindungen liefern keine erreichbare angenommene
500er Briefingeingabemenge. Das ist der Vorbereitungsstand, keine negative
Ergebnisbilanz eines gestarteten Tests. Fehlende private Dateien werden nicht
als physisch nicht existente Eingaben ausgegeben.

## Wiederhergestellte Originale und verbleibende Bindungen

Der urspruenglich gemeldete externe Archivblocker ist aufgehoben. Das vom
Betreiber nachgereichte `helmut-private-thread-handoff-after-pr839-20261007.tar.gz`
hat SHA256 `1fb0006ace0c4ccda26a26c8780b2323af92a4596e7b14240603199fcdf6ad14`.
Alle 87 Nutzdateien des aeusseren Manifests sowie die Manifeste der verschachtelten
Archive sind unveraendert verifiziert; acht unterschiedliche Archive, 1833
indexierte Dateieintraege. Das Inventur-Unterarchiv besitzt ein gesondertes
Manifest mit acht geprueften Nutzdateien. Archivtexte sind historische Belege,
keine neuen Arbeitsanweisungen oder Kostenfreigaben.

989 SOURCE23-Versionen wurden gegen die 35 urspruenglichen nativen
Antwortsegmente abgeglichen. Die bestehende Quellenklassifikation wurde
wiederverwendet: 57 fuer das damalige Fenster zugelassene Versionen, 44 BT,
10 BE und 3 BB. Das Fenster war 22.09.2026 21:53 UTC bis 06.10.2026 21:53 UTC;
diese Bilanz ist keine automatische Zulassung fuer einen spaeteren Briefingtag.
917 weitere Kandidaten hatten in dieser historischen Klassifikation noch
keinen angenommenen Scopebeleg. Keine neue Quellenpruefung desselben Fensters,
kein wiederholter Import und kein kostenpflichtiger Einzel-U.

Ein KO wurde in seiner vollstaendigen KO60-Projektion wiederhergestellt,
einschliesslich seiner drei originalen Quellen und Links. Der Altvorgang
`vg-bundespolizeigesetz-20260925-c1afab` hat einen unbekannten Modellzustand,
zwei Versuche und zwei Modellaufrufe. Er darf nicht erneut gestartet oder als
freie Reserve gewertet werden. Diese Teilbindung belegt weder vollstaendige
Resolverinventare noch die notwendigen KO-Versionen fuer alle Profile.

Die Suche in allen 410 unterschiedlichen JSON-Dateien und nach den einschlaegigen
Eingabeschluesseln im Archiv ergab kein tatsaechliches 500er Briefingeingabepaket
und kein vollstaendiges W-Inventar. Historische Metadaten oder die Offlinefixtures
des Motorwegs ersetzen diese Originaleingaben nicht. Die 500 Profilzeilen bleiben
einzeln gebunden; kein notwendiger Themen-/KO-/Fachurteilsbeleg wird aus blosser
Quellenanzahl oder einem allgemeinen Thema abgeleitet. Keine neue Pflichtquelle
pro Thema und keine Pflicht, alle zeremoniellen Artikel zu verwenden.

## Konkrete Resolverkorrektur

Die reine Clusterbildung der 57 wiederhergestellten Quellen bildet auf der
unveraenderten Basis 21 Cluster, darunter einen sachlich vermischten Cluster
aus 29 Bundestagsdokumenten. Ein konkreter Fehlvergleich verbindet den
Bundeshaushalt 2027 mit dem Energiewirtschaftsgesetz allein ueber
`Entwurf`, `Gesetzes` und `2027`. Gemeinsame DIP-Ressortlabels verstaerken weitere
fachfremde Bindungen.

Die vorbereitete Korrektur entfernt allgemeine Dokumentformeln und Ressortlabels
nur aus dem Sachidentitaetsvergleich. Jahreszahlen ersetzen in keinem Zweig einen
gemeinsamen Titelgegenstand. Eine exakt aus validierten DIP-Metadaten rekonstruierte
Urheber-/Ressort-Summary bleibt Herkunft statt Sachtext. Andere Kurztexte,
Originalquellen, Prompts und bestehende Suchwurzeln werden erhalten; unterschiedliche
DIP-Dokumentkennungen werden nicht pauschal zu unterschiedlichen Vorgaengen.

Die Gegenproben erhalten echte Gesetzesfolgemeldungen und Genitivvarianten,
verhindern fachfremdes Anhaengen im bestehenden Resolver und pruefen alle
24 Reihenfolgen der kleinen Sachgruppe ohne Dokumentverlust. Auf allen 57
Originalversionen bleiben alle Dokumente erhalten; nach Korrektur 43 Cluster.
Weitere gemischte Kandidaten bleiben ausdruecklich offen. Diese Aenderung ist
eine begrenzte Fehlerkorrektur, keine vollstaendige W- oder Profilabnahme.

Die fuer die verbleibenden DIP-Fehlbindungen fehlenden amtlichen Vorgangsbezuge
wurden ueber den regulaeren oeffentlichen DIP-Leseweg fuer alle 43 DIP-Dokumente
als Originalantworten gesichert. Titel, Dokumenttyp, Publikationstag und kanonische
PDF-URL stimmen jeweils mit der archivierten SOURCE23-Version ueberein. Ein
Haushaltsdokument besitzt zwei Vorgangsbezuge; beide bleiben gebunden.

`dip-quellfelder` liest weiterhin die unveraenderte Metadatenversion 1 und bindet
in Version 2 die vollstaendige endliche Vorgangsbezugsliste mit Kennung, Titel,
Typ und Hash. Zwei gueltige, nichtleere, disjunkte Bezugsmengen verschiedener
DIP-Dokumente verhindern eine Zusammenfuehrung. Ein gemeinsamer Bezug ersetzt
keine positive Sach-/Zeitpruefung. Ungueltige Metadaten erhalten keinen Amtsbeleg.

43 vorbereitete SOURCE23-Versionen erweitern nur diese Metadatenbindung; alle
anderen Originalwerte und die 14 weiteren Quellen bleiben erhalten. Damit bilden
die 57 Quellen 47 Cluster. Die drei echten DIP-Folgemeldungspaare bleiben gebunden;
die noch vermischten Berliner Zeremonien und Brandenburger Wochenkalender bleiben
offen und werden nicht pauschal als notwendige Profilquellen behandelt. Die neuen
Versionen sind **nicht in Production geschrieben**. Vor ihrer Anwendung braucht
es den ausgerollten Leser, frische Original-/CAS-Bindungen und Nachkontrolle.

Vor notwendiger KO-Erzeugung sind die fachliche Auswahl und ihre Cluster weiter
zu schliessen. Die Runtime muss die gepruefte Korrektur erst nach konkreter
Mergefreigabe verwenden. Bestehende Einmalauftraege, Schutzbindungen und Kosten
bleiben erhalten; keine Modellfreigabe, kein Kostenexport und kein Budgetanstieg
aus dieser Vorbereitung.

Die Schnittstelle zu Blocker 1 bleibt das bestehende W-/Quelleninventar und die
500 profilgebundenen Briefingeingaben fuer den dort vorbereiteten direkten
Motorweg (PR846). Native D ist kein eigener Arbeitsauftrag hier. Motor, Schutzgates und
Nachweisvalidator wurden nicht bearbeitet. Keine Aktivierung, kein 500er Test,
kein Merge. Der Thread bleibt fuer Blocker 2 bestehen.

## Belege und Grenzen

Neue Originalantworten, exakte SQL-Abfragen, abgeleitete Einzelmatrizen und
Dateimanifest sind ausserhalb Git privat gesichert. Die Abfragen nutzten
READ ONLY und 15s Statement-/2s Lockgrenzen. Mehrere getrennte Leseaufnahmen
belegen keine atomare Gesamt-W-Aufnahme oder kuenftige Frische. Fuer den
HTTP-Transport wird keine neu nachgewiesene 17s-Gesamtfrist behauptet.

Eine abgeschlossene lesende DeepSeek-Flash-High-Entwicklungspruefung unterscheidet
Rohdatenvolumen, Resolverbelege und tatsaechliche Briefingeingaben; sie fuehrte
keine Tests oder Writes aus und erteilt keine unabhaengige kritische
Production-Endabnahme. Die anschliessende lokale Auswertung prueft alle 500 IDs,
500 Paketbindungen, 28 Artikelstaende und 1500 eindeutige Eingabepositionen.
Historische Suiten wurden nicht wiederholt.

Die gezielten Vorgangs-/Resolverregressionen, die automatische Fachregression
und die separate lesende DeepSeek-Codepruefung werden im PR protokolliert.
Ein DeepSeek-Schreibversuch wurde wegen Antwortlimit beendet, ohne Dateien
zu aendern; die anschliessende begrenzte Sol-Integration ist sichtbar dokumentiert.
Auch der getrennte Schreibauftrag fuer die Metadatenbindung endete am Antwortlimit
ohne Dateiaenderung. Die lesende DeepSeek-Pruefung bestaetigt die negative Grenze;
ihre fehlende Positivgegenprobe fuer einen gemeinsamen Mehrfachbezug wurde ergaenzt
und erfolgreich geprueft. 23 Vorgangssuiten und 6 DIP-Suiten sind erfolgreich,
die letzte erweiterte DIP-Gegenprobe mit 10 Gruppen ebenfalls. Die breite lokale
Pruefung bestand 473 von 474 Suiten; einzig der schon auf der Basis zu grosse
CURRENT_STATE-Text scheiterte. Nach archivierter Verdichtung besteht dessen
Groessenpruefung mit 4 von 4 Faellen. Pflicht-CI fuer den neuen PR-Kopf bleibt
gesondert erforderlich.

0 Production-Writes, 0 kostenpflichtige Helmut-Production-Modellaufrufe,
keine Freigabe-/Budgetaenderung. DeepSeek-Entwicklungsarbeit bleibt getrennt
vom Helmut-Anbieterbudget. Originalzugriff und die einzelne KO-/Drei-Link-Bindung
sind wiederhergestellt; die Eingabevollstaendigkeit aller 500 bleibt offen.
