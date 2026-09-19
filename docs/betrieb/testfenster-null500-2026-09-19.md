# Vorbereiteter Weg von null auf500 und wieder null

19.09.2026. Status **teilweise abgeschlossen**. Branch
`codex/testfenster-null500-20260919`. Kein SQL dieses Planers wurde in
Production ausgefuehrt. Keine Aktivierung, kein Teststart und keine neue
Production Tabelle, Funktion, Migration, Environmentvariable oder Cronzeit.

## Belegte Luecke und engster Eingriff

Der alte Reaktivierer setzt fuenf aktive Bestandsprofile voraus. Sein
Abschluss deaktiviert nur495 synthetische Profile. Der bisherige Timer ist
auf15./16.09. begrenzt. Keiner dieser Pfade sichert den neuen Ausgang und
Rueckweg mit504 inaktiven Profilen. Die alten Vertraege bleiben erhalten.

`testfenster-null500.js` ist ein reiner Planer ohne Datenbankclient oder
HTTP. Er erzeugt getrennte SQL Texte fuer Aktivierung, Ende und reine
Gegenlesung. Kein Anwendungsweg importiert ihn. Sein Veroeffentlichen und
Testen erteilt keine Ausfuehrungsfreigabe. Das Wort im Manifest ist eine
technische Bindung; die ausdrueckliche Betreiberfreigabe bleibt notwendig.

Die vorhandene strenge Ruhepruefung validiert alle495 synthetischen
Profilinhalte, inaktive synthetische Konten, Identitaeten, geschuetzte
Bestandskonten und Main. Fuenf weitere Kennungen muessen explizit vom
Betreiber kommen. Die vollstaendige sortierte500er Liste und ihre vier
Ausnahmen werden gehasht. Es gibt keine Ableitung aus aktiven Konten und
keine hartcodierten realen Mandate im Programm.

## Aktivierung als eine Transaktion

Das Manifest bindet eine neue UUID, Production Commit, genau500 plus vier
Kennungen, frisch gelesene native SHA256 Grundlinien von Profilen,
Identitaeten, vollstaendigem Auth und Main sowie ein hoechstens fuenf Minuten
langes Startfenster. Das Ende liegt spaeter am selben UTC Kostentag,
hoechstens24 Stunden nach dem Vorflug. Dieser erste Planer belaesst den
wirksamen4 USD Tagesdeckel; er behauptet keine Versorgungsgarantie darin.

Die Transaktion sperrt konkurrierende Tabellenschreiber kurzzeitig, mit
drei Sekunden Sperrwartezeit und15 Sekunden Anweisungsgrenze. Sie verlangt
exakt504/0,505 Identitaeten, unveraenderte Grundlinien, keine lebenden
Sperren/Leases, keine unerledigten Jobs, keine junge offene Prozessquittung,
keine offene oder ungeklaerte Kostenreserve und ein lesbares freies
Kostenbuch. Nur die500 gebundenen Profile wechseln von inaktiv zu aktiv.
Genau500 veraenderte Zeilen und500 aktive Profile sind Postconditions.

Die einmalige Quittung liegt in einer eigenen Zeile der bestehenden
`helmut_store`, Schluessel `testfenster-null500-<UUID>`. Manifest und
Aktivierung werden gemeinsam committet. Ein Fehler rollt beides zurueck.
Eine bereits benutzte UUID wird auch nach dem Ende nicht wieder akzeptiert;
ein weiterer Auftrag bei noch aktiver Quittung wird ebenso abgewiesen.
Keine Konten, Sessions, Identitaeten, Main Inhalte oder Profilinhalte werden
geschrieben. Die vier Ausnahmen bleiben einschliesslich ihres Zeitstempels
identisch. Postconditions sichern diese Aussage innerhalb derselben Transaktion.

## Ende und unbekannter Schreibausgang

Das gebundene Ende setzt genau die im gespeicherten Manifest benannten
Profile in einer Transaktion auf inaktiv. Bereits einzelne inaktive Ziele
sind zulaessig; fremde Kennungen werden nie mit deaktiviert. Fehlendes
Kostenbuch, ein anderes Deployment oder laufende Arbeit verhindern dieses
kostenfreie Ende nicht. Aktive Jobs werden dadurch nicht abgebrochen;
Leases, Prozesse und spaete Ergebnisse werden danach getrennt gelesen.
Ein wiederholtes bestaetigtes Ende schreibt nichts. Eine unerwartete
Reaktivierung nach einer Endquittung wird nicht still als Wiederholung behandelt.

Nach Timeout oder verlorener Antwort niemals die Aktivierung wiederholen.
Der einzelne gebundene Leser unterscheidet: keine Quittung und504/0;
passende Aktivquittung und exakt500; passende Endquittung und504/0;
ansonsten unklar. Zielbestand und vier ausgeschlossene Kennungen werden
ebenfalls abgeglichen. Keiner dieser Zustaende gibt automatisch einen
Fachlauf frei. Bei unklarem Zustand keine neuen Modellaufrufe; Quittung,
alle504 Profile und Schutzgrundlinien nativ lesen und den gebundenen
Endweg beziehungsweise einen gesonderten Sicherheitsvorfall behandeln.

## Test und noch fehlender Betriebsnachweis

Sieben lokale Gruppen erfolgreich: explizite Auswahl und Inhaltsschutz,
Ablehnung des alten Fuenferausgangs, fremde/doppelte Auswahl und aktive
Testkonten, Zeit-/Kostenbindung, unbekannte Schreibausgaenge und getrennte
SQL Texte sowie der vollstaendige bestehende Kostenbuchvertrag. Das beweist
noch keine PostgreSQL Transaktion.

Ein eigener verpflichtender CI Schritt benutzt eine zufaellige lokale
PostgreSQL17 Datenbank und synthetische Zeilen. Vorgesehen sind echte
500er Updates, Fehler mitten im Stapel, zwei konkurrierende Verbindungen,
abweichende Grundlinien, Sperren, offene Arbeit, abgelaufene Startfrist,
Rueckweg mit fehlendem Kostenbuch, Wiederholungsablehnung und Rollback eines
unerwarteten Seiteneffekts. Kein stiller Skip bei fehlender Datenbank.
Dieser echte Datenbanknachweis steht noch aus. Der kanonische lokale
Gesamtlauf bestand424/424 Suiten in637s. Danach wurde der Planer zusaetzlich
an den vorhandenen vollstaendigen Kostenbuchvalidator gebunden; seine
erweiterte gezielte Suite bestand7/7. Daher ist der lokale Beleg ein
Gesamtlauf plus gezielte Nachpruefung, kein behaupteter Gesamtlauf des
spaeteren Heads. Die CI muss den finalen Head vollstaendig pruefen.

Rein lesend bestaetigt: Production hat an den betroffenen Tabellen nur den
`helmut_store_set_updated_at` Update Trigger; dessen Wirkung wird in der
isolierten Datenbank nachgebildet. `helmut_store` besitzt genau id, data
und updated_at mit Default now(). Das ist eine Schemapruefung, kein
Production Schreibtest.

Vor einer Startentscheidung fehlen weiterhin: bestaetigtes automatisches
Ende mit unabhaengigem manuellem Rueckweg, ausreichender Fortsetzungs- und
Kostenplan, vollstaendiger Leser unabhaengig vom Aktivzustand sowie die
allgemeine fachliche Prosaabnahme. Der alte Timer wird nicht verlaengert.
Eine spaetere neue Production Terminierung wird zuerst konkret vorbereitet
und benoetigt die dafuer geltende Freigabe. Profile bleiben bis dahin null.

Rueckweg fuer diesen reinen Vorbereitungscode: gezielter Code Revert.
Vor einer spaeteren Aktivierung muss der gepruefte SQL Abschluss privat
vorliegen; ein Code Revert ersetzt ihn nicht und loescht keine Quittung.

## Integration und rein lesender Production Abschluss

PR455 Head `8bb39e21955ed113399e505b5ec73b6d95259f4f`, CI35453302966
vollstaendig erfolgreich:424/424 Suiten in791s, Browser50, Kontoschutz15
samt500 isolierten Registrierungen, neuer PostgreSQL Testweg16/16 und
Z22 PASS48/FAIL0. Alle25 Pflichtschritte erfolgreich, kein Skip. Damit ist
der oben zunaechst offene echte Datenbanknachweis erbracht. Er umfasst
auch unbekannte Kostenreserven, lebende Leases und den Schutz eines
unerwartet fremd aktivierten Profils beim Ende.

Merge `1feb22160259df887665d11a55b9ea9f5deb83c8`, Production READY
`dpl_CHvrsksfy1pNo2gUNgtMEUsQMM53` mit korrektem Main Alias und Commit.
Reiner Leser35454254225 erfolgreich, HTTP200 am19.09.16:13:29 UTC:
exklusiver relationaler Profilpfad, V3, Kommunikations- und Quellensperre,
Retention36, Tagesdeckel2416/Reserve702/Vorrang200, atomarer4 USD Riegel
und Sperrenschutz unveraendert. Artikelkontext nicht aktiviert.

Native SQL16:13:34 UTC bestaetigt504/0, unveraenderte Hashes aller Profile,
Identitaeten, des gesamten Authblobs einschliesslich Sessions, Kontoschutz
und Main. Keine lebende Sperre, Lease, junge offene Prozessquittung oder
Kostenreserve; alle22709 Jobs erledigt, Tagesbuch262850 Mikro USD.
Kein Aktivierungs- oder End SQL wurde in Production ausgefuehrt. Der
Vorbereitungsteil ist technisch erfolgreich abgeschlossen; der gesamte
Testweg bleibt bis zur automatischen Terminierung teilweise abgeschlossen.
Main CI35454184052 ebenfalls erfolgreich:424/424 in784s, Testweg16/16,
Z22 PASS48/FAIL0, beide Pflichtjobs. Vorherige Main CI35452802010 erfolgreich:
423/423 und Z22 PASS48/FAIL0.

## Ergebnisleser nach der Rueckkehr auf null

19.09., Branch `codex/nachweis-ziel500-20260919`, PR456 integriert. Der begrenzte Auswahlfehler ist **erfolgreich abgeschlossen**; Vollversorgung und Fachpruefung bleiben offen.
Beide alten Ergebnisleser bildeten ihre Zielmenge aus495 synthetischen und
den gerade aktiven Bestandsprofilen. Bei null aktiven Profilen fehlten damit
die fuenf Bestandsprofile; eine fremde Aktivierung konnte den Nenner aendern.

Die engste Reparatur verwendet die bereits vorhandene Testfensterquittung
aus PR455. Der neue optionale Workflowparameter `testfenster_id` ist fuer
beide Inhaltsleser Pflicht; der reine Production Statusleser bleibt ohne
ihn nutzbar. Nur eine UUID wird uebergeben. Die500 Kennungen kommen privat
aus der exakt adressierten gespeicherten Quittung, deren Manifest, Zielhash,
Startbestaetigung, Zustand und Zeitbindung geprueft werden. Es gibt keine
neue Tabelle, keine Quittungsanlage, keinen Schreibzugriff und keinen
Aktivierungsaufruf. Fehlende Quittung bedeutet Abbruch, keinen Rueckfall
auf den Aktivstatus. Die vier ausgeschlossenen Kennungen muessen ebenfalls
im504er Bestand vorhanden sein.

Vor und nach einer Lesung muss dieselbe Quittung stehen. Ihr Wechsel
verhindert ein erfolgreiches Lesergebnis. Der private Archivleser behaelt
auch seine doppelte Inhalts- und Bestandslesung sowie Verschluesselung.
Oeffentlich erscheinen nur feste Gesamtzahlen, UUID und Zielhash; die
vollstaendige Auswahl bleibt im verschluesselten Betreiberbeleg. Der
gewuenschte Archivtag wird weiterhin separat gewaehlt. Eine passende
Quittung allein bestaetigt weder den aktuellen Aktivzustand noch eine
Versorgung innerhalb des neuen Testfensters. Der Nenner ist repariert;
Morgenfrische, drei Ergebnisarten und die vollstaendige Fachpruefung sind
gesonderte noch offene Abnahmekriterien. Beide Leser behaupten weiterhin
keinen transaktionalen Snapshot und keinen500er Funktionsnachweis.

Lokale gezielte Pruefung: Zielvertrag4/4, App Leser7/7, privater Leser7/7,
Zugangsvertrag48/48. Belegte Gegenfaelle: gleiche500 bei aktiven und bei
inaktiven Profilen; ausgeschlossenes fremd aktives Profil bleibt draussen;
beschaedigte Auswahl, falsche Quittung und Zustandswechsel werden abgewiesen.
Alle vorhandenen Mandanten-, Tages-, Hash-, Schluessel- und
Klartextschutzpruefungen bleiben erhalten. Ein alter Zaehler erwartete
synthetische Profile zuerst; die neue unveraenderlich sortierte Auswahl
liefert zuerst die fuenf synthetischen Bestandsfixtures. Seine Erwartung
wurde auf diese belegte Reihenfolge angepasst, keine Assertion entfernt.
Kanonischer Gesamtlauf erfolgreich:425/425 Suiten in643s, Exit0. Der erste
Lauf wurde wegen eines fehlenden lokalen Browserpfads abgebrochen; der
vollstaendige zweite Lauf nutzt den bereits vorhandenen Browsercache.
Kein Test oder Schutz wurde dafuer veraendert. CI35455461295 erfolgreich:425/425 in522s, Browser50, Kontoschutz15 samt500 Registrierungen, echter PostgreSQL Testweg16 und Z22 PASS48/FAIL0, alle25 Pflichtschritte. Kein Production Inhaltslauf, weil noch keine neue Testfensterquittung angelegt werden darf.

Risiko und Rueckweg: Nur explizite Betreiberleser sind betroffen. Alte
manuelle Inhaltsaufrufe ohne UUID werden bewusst abgewiesen. Gezielt den
Lesercode zuruecksetzen, falls noetig; Quittungen und Testauswahl nicht
loeschen. Der bisherige abgelaufene aktive Eingabeprobevertrag bleibt
unveraendert gesperrt und wird durch die UUID nicht neu freigegeben.


## Production Abschluss PR456

Main `577cfafd9c0d1eb4769faec473fd344980c9210a`, READY
`dpl_DP7hgmcndST4D1oYuDGEZFPE44t9` am19.09.16:49:25 UTC, korrekter
Commit und Hauptalias. Leser35456323820 am16:52:43 UTC HTTP200, null
Schreibaufrufe, Speicherschutz, Kontoschutz, Kommunikations- und
Quellensperre sowie4 USD Riegel unveraendert. Native Nachkontrolle16:54:29
UTC:504/0, Profile,505 Identitaeten, gesamter Authblob einschliesslich
Sessions und Main unveraendert gegen16:48:39. Keine Sperre, Lease, junge
Prozessquittung oder offene Reserve;22709 Jobs erledigt,0,262850 USD.
Main CI35456149568 ebenfalls vollstaendig erfolgreich:425/425 in603s, Kontoschutz15 samt500 Registrierungen, PostgreSQL16, Z22 PASS48/FAIL0 und beide Pflichtjobs mit allen25 Schritten.

## Automatischer Endweg und konkrete Migrationsgrenze

19.09., `codex/testende-null500-20260919`, **teilweise abgeschlossen**.
Der alte Endlauf ist auf495 synthetische Profile begrenzt und laesst fuenf
Bestandsprofile aktiv. Der neue manuelle Transaktionsplan oben kann die
gebundenen500 bereits beenden. Fuer automatische Ausfuehrung kennt der
Actionszugang nur die vorhandene Supabase HTTP Schnittstelle.

Abwaegung vor der Reparatur:500 einzelne bedingte Profilwrites benoetigten
500 bestaetigte Netzschritte und koennten bei einem Ausfall einen Teilbestand
hinterlassen. Nur ein manueller Endplan erfordert einen verfuegbaren
Betreiber. Die vorbereitete enge RPC verwendet eine Datenbanktransaktion
und dieselbe gespeicherte Auswahl; Aufwand eine Funktion samt Rollback,
Endsteuerung und isoliertem Nachweis. Risiko ist die neue schreibende
Datenbankschnittstelle. Deshalb nur service_role, SECURITY INVOKER,
fester Suchpfad,3s Sperrfrist, keine dynamischen SQL Namen, volle Bindung
an Quittung und Manifest sowie Ruecknahme aller Aenderungen bei unerwarteten
Seiteneffekten. Kein neuer Datenbestand, kein allgemeiner Schreibendpunkt.

Vorbereitete Migration: `20260919170000_testfenster_null500_ende.sql`.
Sie installiert ausschliesslich `helmut_testfenster_null500_ende`; kein
Profil wird durch Installation veraendert, kein Timer gestartet. Die
passende `rollback_20260919170000_testfenster_null500_ende.sql` entfernt
nur die Funktion. Quittungen bleiben erhalten, der native manuelle Endplan
funktioniert unabhaengig davon. Rollback erst nach gesichertem Ende aller
bewaffneten Endlaeufe. **Keine Migration in Production angewendet.**

Der neue manuelle Workflow `null500-testende.yml` hat keinen Cron und
verlangt UUID, Hash des privaten vollstaendigen Manifests (mittels
`testkohorte-direkt500.hash`, stabil sortierte Objektschluessel), Main Commit,
exaktes Ende und `GEBUNDENE_500_NUR_DEAKTIVIEREN`. Standard prueft nur
Eingaben, ohne Netz. Bewaffnung ist erst mit spaeterer neuer Startfreigabe
erlaubt; sie ist in diesem Auftrag nicht ausgefuehrt. Hoechstens vier
Stunden Wartezeit,270 Minuten Joblimit, eigene Concurrency unabhaengig von
Facharbeit. Vor Aktivierung muessen installierte RPC, sichtbares
Bewaffnungssignal, lebender Job und unabhängiger SQL Rueckweg feststehen.
Ohne Aktivierungsquittung endet der Job nach maximal fuenf Minuten.
GitHub Ausfall oder Abbruch bleibt ein Grund fuer den manuellen Rueckweg;
eine unverfuegbare Infrastruktur wird nicht als garantiert laufender Timer
bezeichnet. Laufende Fachjobs werden durch Deaktivierung nicht abgebrochen.

Bei gueltiger Quittung prueft die Steuerung die Kosten alle hoechstens60
Sekunden. Fehlendes, unlesbares, eingefrorenes, ausgeschoepftes oder
ungeklaertes Kostenbuch fuehrt zum gebundenen Notstopp. Sonst gilt die
Manifestfrist. Genau ein RPC Schreibversuch; auch nach HTTP200 oder Timeout
werden Quittung und504 Profile frisch gelesen. Kein automatischer Retry.
Fremde aktive Profile bleiben erhalten und verhindern einen globalen
Nullnachweis. Ein beendeter Lauf mit spaeter reaktiviertem Ziel wird
abgewiesen. Konten, Sessions, Identitaeten, Profilinhalte, Main und alle
Profile ausserhalb der500 werden innerhalb derselben Transaktion geprueft.

Gezielte Offlineprobe10/10 erfolgreich. Kanonischer Gesamtlauf426/426 in640s, Exit0, ueber scripts/lokal.js mit vorhandenem Browsercache. Migrationsorganisation41/41. Echter PostgreSQL und PostgREST Nachweis sowie CI und Integration noch offen; lokal steht kein PostgreSQL Client bereit.
Keine neuen KI Modellaufrufe oder Production Buchungen. Die Installation
ist nach `CLAUDE.md §5` und der Betreibergrenze eine gesondert freizugebende
Production Schemaaenderung; geprueften Code zu mergen installiert sie nicht.


Rein lesender Installationsvorflug19.09.16:59:47 UTC: Production PostgreSQL
17.6, neue Funktionssignatur noch nicht vorhanden, null neue
Testfensterquittungen. service_role besitzt bereits SELECT und UPDATE auf
allen drei benoetigten Tabellen und BYPASSRLS. Keine Erweiterung dieser
Tabellenrechte oder neue Zugangsdaten erforderlich. Die auf270 Minuten
begrenzte Jobdauer liegt unter dem aktuellen sechs Stunden Limit fuer
GitHub Runner ([GitHub Actions Limits](https://docs.github.com/en/actions/reference/limits),
am19.09. gelesen). Dies belegt keine garantierte Verfuegbarkeit des Runners.

Der erste lokale Gesamtlauf wurde nach ausbleibender Ausgabe mit Exit130
beendet und gilt nicht als Nachweis. Die Browserprobe besteht separat50/50;
die unmittelbar naechste Suite nach der letzten Protokollzeile besteht
isoliert ebenfalls. Eine Browserursache ist daher nicht belegt. Kein Test
oder Timeout wurde geaendert. Der erneute kanonische Lauf wird mit sichtbarer
Prozessausgabe protokolliert und ist inzwischen426/426 erfolgreich. Die laufende Konsole zeigte zwischenzeitlich weiteren Fortschritt, waehrend die separat gelesene Datei noch einen aelteren Stand zeigte. Eine Ursache im Anwendungscode ist nicht belegt.
