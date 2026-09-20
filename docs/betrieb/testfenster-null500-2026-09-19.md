# Vorbereiteter Weg von null auf500 und wieder null

19.09.2026. Gesamtstatus **teilweise abgeschlossen**. Der Planer aus
`codex/testfenster-null500-20260919` ist integriert; sein Aktivierungs und
End SQL wurde in Production nicht ausgefuehrt. Die spaeter vorbereitete
Endfunktion ist inzwischen mit gesonderter Freigabe einmalig installiert,
siehe [aktueller Installationsbeleg](#freigegebene-installation-am-1909-1800-utc).
Keine Aktivierung, kein Timerstart, kein neuer500er Test, keine neue Tabelle,
Environmentvariable oder Cronzeit. Fruehere Nichtinstallationsangaben unten
sind zeitlich begrenzte historische Aufnahmen.

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

Historischer Stand19.09.17:41 UTC, `codex/testende-null500-20260919`: damals **blockiert** an der Production Installation. Diese Grenze wurde um18:00:45 UTC mit gesonderter Betreiberfreigabe erledigt. PR457 ist technisch abgenommen und integriert; der automatische Endweg wurde in Production nicht bewaffnet.
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
bewaffneten Endlaeufe. **Zum damaligen Vorbereitungsstand noch nicht angewendet; inzwischen installiert, nicht wiederholen.**

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

Gezielte Offlineprobe zunaechst10/10. Kanonischer Gesamtlauf426/426 in640s, Exit0, ueber scripts/lokal.js mit vorhandenem Browsercache, vor dem unten beschriebenen abschliessenden Bewaffnungsschutz. Danach gezielt11/11; der finale Head muss die vollstaendige Pflicht CI bestehen. Migrationsorganisation41/41. Echter PostgreSQL und PostgREST Nachweis sowie finale Pflicht CI inzwischen erfolgreich, siehe Abschluss unten; lokal steht kein PostgreSQL Client bereit.
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


Abnahmebefund vor Merge von PR457: Der erste Entwurf meldete bewaffnet,
bevor die erste Quittungslesung erfolgreich war. Bei falschem Zugang konnte
damit ein irrefuehrendes Bereitschaftssignal entstehen. Der korrigierte
Endlauf prueft zuerst den Zugriff und bei vorhandener Quittung die Bindung.
Nur bestaetigte Abwesenheit oder eine gueltige Quittung erlauben das Signal.
Negative Regression gegen a6aa0ef: neues Erwartungskriterium verweigert das
zu fruehe Signal (1 statt0 Meldungen bei gescheiterter erster Lesung).
Korrigiert11/11 erfolgreich, einschliesslich positivem Warten nach
bestaetigter Abwesenheit. Kein Schutz abgesenkt. Die Installation der RPC,
der lebende Job und der unabhaengige manuelle Rueckweg bleiben gesonderte
Vorbedingungen vor jeder spaeter ausdruecklich freigegebenen Aktivierung.


## Integration, Production Nachkontrolle und erforderliche Freigabe

PR457 Head `67ec54b591ba169660c787ddcb10498d1a5ec3b8`, Tree
`31be2b3b48fe6216e3c27c1fb12497b0ac1e7c28`. CI35457881913 vollstaendig
erfolgreich:426/426 in644s, Browser50/50, Kontoschutz15/15 samt500
isolierten Registrierungen, atomarer Testweg und neue RPC26/26 gegen
PostgreSQL17 und PostgREST12.2.3, Z22 PASS48/FAIL0. Alle25 Pflichtschritte.
Der vorherige Lauf35457515157 wurde beim Headwechsel automatisch ersetzt;
sein bereits erfolgreicher Datenbankschritt wurde nicht als Gesamt CI
gewertet. Die neue CI prueft auch den abschliessenden Bewaffnungsschutz.

Vor dem Merge endete der regulaere Production Rueckstandslauf
`understanding-rueckstand-20260919173037-g3swa`. Die Telemetrie enthaelt20
Modellbuchungen mit gpt-5-mini sowie getrennt18 Budgetvertagungen und zwei
fachlich/strukturell abgewiesene Verstehensfaelle mit Modellkennzeichen none.
Diese zusaetzlichen Telemetriezeilen sind keine weiteren Modellaufrufe und
keine500er Versorgungsergebnisse. Tagesbuch danach0,386081 USD statt
0,262850 USD, keine offene Reserve. Profile, Identitaeten, Main und
Konten/Sessions blieben gleich. Der gesamte Authhash aenderte sich wegen
der Betriebsbuchungen; er wurde nach Abschluss neu als Grundlinie gelesen.
Kein zusaetzlicher Fachlauf durch diesen Reparatursprint gestartet.

Merge `a0ba6f8444f39923d60b45b0e339a14726d94bd7`, Production READY
`dpl_F8Bj3J8hvfk5xrv6kC7HMzDsp81Z` am19.09.17:37:53 UTC, Hauptalias und
Commit korrekt. Leser35458848599 am17:41:19 UTC HTTP200 mit genau diesem
Commit. V3, exklusiver relationaler Profilpfad, Retention36,
Kommunikations- und Kohortenquellensperre, atomare Sperre sowie4 USD
Kostenregel2 wirksam. Optionaler Inhaltsabruf bleibt mangels neuer
Testfensterquittung aus. Main CI35458671797 ebenfalls vollstaendig
erfolgreich:426/426 in802s, Browser50, Kontoschutz15 samt500 isolierten
Registrierungen, Datenbank26 und Z22 PASS48/FAIL0; alle25 Pflichtschritte.

Native SQL17:41:07 UTC gegen den ruhenden Vorflug17:35:10:504 Profile,
0 aktiv, alle Profil-, Identitaets-, Auth-, Main- und Kontoschutzhashes
gleich. Keine lebende Sperre, Lease, junge offene Prozessquittung oder
Kostenreserve;22709 Jobs erledigt,386081 Mikro USD, nicht eingefroren.
Die neue Funktionssignatur ist weiterhin nicht vorhanden; null neue
Testfensterquittungen. Merge hat keine Migration ausgefuehrt. Rein lesende
Quellenkontrolle17:43 bestaetigt weiter10710 alte Itemzeilen,114 aufloesbare
Objekte,91 nur ohne summary;500 Profile betroffen, vier ausschliesslich,
null unaufgeloeste Itemverweise. Kein neuer500er Fachnachweis.

Die damals konkret benoetigte und inzwischen erteilte Freigabe betraf ausschliesslich die einmalige
Installation von `supabase/migrations/20260919170000_testfenster_null500_ende.sql`
auf dem bestehenden Production Projekt. Sie legt die gepruefte Endfunktion
und deren enge Ausfuehrungsrechte an und aktualisiert den PostgREST
Schemacache. Sie aktiviert kein Profil, startet keinen Endlauf, aendert
keine Kosten- oder Environmentwerte und ruft kein Modell auf. Vor Anwendung
Main, Funktionsabwesenheit, Rechte, Grundlinien und Ruhezustand frisch lesen;
danach Funktionssignatur, SECURITY INVOKER, Rechte,504/0 und Schutzgrundlinien
rein lesend bestaetigen. Kein scharfer Probeaufruf in Production.

`CLAUDE.md §5` verlangt fuer Production Migrationen eine ausdrueckliche
Freigabe; diese war um17:41 noch offen und wurde danach im uebernehmenden
Thread separat erteilt. Die Freigabe des einmaligen Quellenlaufs ist
verbraucht und war keine Freigabe fuer diese Schemaaenderung. Code Merge
und Deployment waren bereits erlaubt und sind erledigt. Die damalige
Installationssperre ist inzwischen aufgehoben und die Installation ausgefuehrt.
Rollback Datei und unabhaengiger
nativer SQL Endplan liegen bereit. Bewaffnung, Profilaktivierung und neuer
500er Test bleiben auch nach einer Installationsfreigabe gesondert gesperrt.
Prosa, Quellenreichweite, Vollversorgung, Frische und belastbare Laufzeit-
und Kostenplanung bleiben nach der Installation weiter zu bearbeiten.

Dieser abschliessende Folge PR dokumentiert ausschliesslich den wirklichen
Nach Merge Stand gemaess CLAUDE §9. Er aendert weder Code noch Konfiguration
oder Daten; sein eigener Merge wird ueber Git und Deployment Historie
nachgewiesen, ohne rekursiven weiteren Dokumentations PR.

## Freigegebene Installation am 19.09. 18:00 UTC

Status der Installation **erfolgreich abgeschlossen**; gesamter500er Auftrag
weiter **teilweise abgeschlossen**. Der Betreiber hat im uebernehmenden
Thread die einmalige Installation ausdruecklich freigegeben. Genau ein
`apply_migration` Aufruf war erfolgreich. Keine Wiederholung und kein
scharfer Funktionsaufruf. Der bereits gepruefte SQL Inhalt aus Main
`a0ba6f8444f39923d60b45b0e339a14726d94bd7` wurde unveraendert angewendet;
lokaler Git Inhalt und GitHub Datei am exakten Commit waren bytegleich.
Git Blob `a5618cd029e82066386e61114d68ef3863cf8d73`.

Repository Datei: `supabase/migrations/20260919170000_testfenster_null500_ende.sql`.
Persistierte Production Version: `20260919180045`, Name
`testfenster_null500_ende`. Die vom Dienst vergebene Version unterscheidet
sich vom Dateistempel. Das ist keine fehlende Migration und kein Grund fuer
eine zweite Anwendung oder Umbenennung der versionierten Datei.

Installation19.09.21:00:45 Tuerkei /20:00:45 Berlin /18:00:45 UTC.
Rein lesender Vorflug18:00:23 und Nachkontrolle18:01:08 UTC:504 Profile,
0 aktiv, keine Sperren, Leases, offenen Jobs, jungen offenen Prozesse,
Testfensterquittungen oder Kostenreserven. Tagesbuch beide Male386081
Mikro USD; Limit4000000. Vollstaendige Hashes vor und nach Installation:

| Bestand | SHA256 vor und nach Installation identisch |
| --- | --- |
| Profile | `ea339008ddc23668d7234b6305a2346c116b474a40ff68dbd474d73005056e06` |
| Identitaeten | `03e0b4e26272fbaa1d78aa199ad7e66b44e84d93b3d2d8ef02c62dcd0907f60e` |
| Gesamter Authinhalt, einschliesslich Konten/Sessions | `4ded5801fac98616d682aee712eed6612ae5d4d2a3f5411342c1c299b93dbcfb` |
| Main | `58d58420f47f7bb9b29be1ec47c32a7c3670363f5f5c2c5cf5ef701211c238ef` |

Native Funktionspruefung: `public.helmut_testfenster_null500_ende(text,jsonb,text,text)`,
Rumpf bytegleich zur Migration, plpgsql, SECURITY INVOKER,
`search_path=pg_catalog`, `lock_timeout=3s`. Eigentuemer postgres;
EXECUTE nur postgres und service_role, nicht anon oder authenticated.
Vorherige READY Aufnahme bestaetigte Main und Hauptalias, der HTTP200
Beleg stammt aus Leser35458848599. Kein neues Deployment durch Installation.
Vollstaendiger privater Installationsbeleg:
`Helmut_Endfunktion_Installation_20260919.md`.

### Spaetere Aufnahme und Uebernahme der Dokumentation

PR458 bewahrte zunaechst den Stand17:41. Sein Ausfuehrer fand die
inzwischen installierte Funktion bei einer eigenen Lesung und stoppte den
PR als Draft, da ihm diese separate Freigabe unbekannt war. Die Herkunft
der Installation ist durch den obigen Auftrag und Nachweis geklaert.
CI35459908315 ist erfolgreich; dieser technische Erfolg ersetzt die
inhaltliche Korrektur der drei Markdown Dateien nicht. Die Vorarbeit aus
Head `9954d718bfee8948f3cbbef87a9c33efa0a0b5d6` bleibt erhalten. Nach dem
dokumentierten Stopp uebernimmt der Installationsausfuehrer PR458 in einer
isolierten Arbeitskopie und fuehrt dessen bestehenden Branch
`codex/testende-null500-20260919` weiter. So bleibt die vorhandene
Previewsperre erhalten, ohne eine Konfiguration zu aendern. Keine weitere
Arbeit in der fremden Arbeitskopie und keine erneute Migration.

Die erneute native Lesung18:13:21 UTC bestaetigte504/0, dieselben Profil-,
Identitaets- und Mainhashes, keine offene Arbeit oder Reserve und unveraendert
0,386081 USD bei4 USD Limit. Der Authblob wurde jedoch um18:11:08 UTC
geaendert; neuer Gesamthash
`8056d8c61bcdee8f15bc74f2fed88d4560296c2d8eb4f157a156107b6d56000b`.
PR458 dokumentiert die verlaengerte Gueltigkeit einer bestehenden Session.
Diese spaetere Aenderung ist keine Wirkung der um18:01 bereits unveraendert
abgenommenen Installation. Daraus folgt weder ein behaupteter Kontoschaden
noch ein unveraenderter Sessionsnachweis ueber beide Zeitpunkte.

Die gezielt gelesenen Vercel Laufzeitlogs belegen auf demselben Production
Deployment GET `/` um18:11:04 und GET `/api/auth/session` um18:11:06 UTC,
jeweils HTTP200. `server.js:handleAuthSession` ruft fuer eine gueltige
Sitzung `accounts.extendSession` auf; diese vorhandene Funktion verlaengert
um30 Tage, wenn sich das Ablaufdatum um mehr als eine Stunde verschiebt.
Der protokollierte Appabruf und die Sessionverlaengerung passen zeitlich
und technisch zusammen. Der Aufrufer ist durch diese Logzeilen nicht
identifiziert. Kein Grund, die erfolgreiche Installation zu wiederholen
oder die Sitzung zurueckzusetzen. Weitere Eingriffe werden gegen eine
frisch gelesene Schutzgrundlinie geprueft; authentifizierte Appaufrufe sind
wegen dieses normalen Verlaengerungspfads kein reiner Sessionslesebeleg.

Die Installation umfasst keine Bewaffnung, Aktivierung, Provisionierung,
Modellaufrufe, Cron oder Environment Aenderung und keinen500er Start.
Prosaquellebindung, Quellenreichweite und Frische, alle drei Ergebnisarten
fuer jedes der500 Profile, begrenzte Versorgungslaufzeit, Kostenplan und
fachliche Abnahme bleiben offen. Der4 USD Kostenriegel bleibt unveraendert;
die10 USD Betreibergrenze erlaubt dessen Aenderung nicht automatisch.

Lokale Abnahme der Dokumentationskorrektur: kanonischer Gesamtlauf ueber
`scripts/lokal.js` mit425/426 Suiten in637s, Exit1. Einziger Fehler war die
durch den Nachtrag ueberschrittene Groessengrenze von CURRENT_STATE.
Die neuen Statuszeilen wurden anschliessend gekuerzt, ohne Historie oder
Grenzwerte zu entfernen; gezielte Groessenpruefung4/4 erfolgreich.
Das ist kein behaupteter gruener lokaler Gesamtlauf. Der korrigierte Head
muss vor Merge die vollstaendige Pflicht CI bestehen. Ausschliesslich drei
Markdown Dateien, kein neuer Anwendungscode und keine zusaetzlichen Modellkosten.

## Inhaltsbindung und drei Ergebnisarten

19.09., Branch `codex/morgen-inhaltsbindung-20260919`, **teilweise abgeschlossen**.
Basis ist PR458/Main `f9ab47b57b5e75a7c5252ceeb50ddc0d5581dae5`.
Dessen finale CI35461755164 bestand426/426 in784s und alle25 Pflichtschritte.
Production READY `dpl_Gfd9xxRUw4KnVMvCGrheMHUV9wTN`, Hauptalias und Commit
korrekt; Leser35462701804 um18:55:10 UTC HTTP200. Native Nachkontrolle18:55:39
gegen18:52:15:504/0, Profil-, Identitaets-, vollstaendiger Auth- und Mainhash
gleich, keine offene Arbeit oder Reserve,0,386081 USD bei4 USD Limit.
Die Installation ist abgeschlossen und wurde nicht wiederholt.

Belegte Luecke: Die Morgenquittung signierte Kennungen und Zeitstempel,
nicht den vollstaendigen Text. Gleiche Kennungen konnten einen anderen
Text begleiten. Der bestehende500er Leser zaehlte historische App Pakete;
weder Morgenquittung noch Erzeugung im neuen Testfenster waren abgedeckt.
Er behauptete deshalb richtigerweise keinen500er Funktionsnachweis.

Vor Aenderung festgelegter Vertrag: anderer Text bei gleichen Kennungen
darf keine passende Morgenquittung ergeben. Identischer gespeicherter Text
bleibt wiederholbar, auch wenn danach Lage ergaenzt wird. Fehlende, fremde,
doppelte, alte oder nach Testende entstandene Belege zaehlen nicht als
vollstaendig. Alle500 Ziele bleiben fuer jede der drei Ergebnisarten im
Nenner. Eine Strukturpruefung ist kein fachliches Gesamturteil.

Engster Eingriff: Die regulaere Morgenversorgung fuegt ihrer vorhandenen
Quittung einen Hash des gesamten gespeicherten Briefings samt Mandat,
Berliner Tag, Paketkennung und Profilhash hinzu. Ruecklesung und
Wiederholung vergleichen diesen Beleg. Die alte Signatur bleibt erhalten.
Ein Altbeleg ohne Inhaltsbindung bekommt beim regulaeren Lauf einen neuen
Beleg; das allein erzeugt keinen zweiten Push. Kein neuer Speicherweg,
keine Migration und kein Backfill. Die bereits freigegebene
Kommunikationssperre bleibt wirksam.

Der bestehende Betreiberleser prueft zusaetzlich die drei exakt adressierten
Zeilen je Profil: Paket, Morgenquittung und Lage. Zwei GET Lesungen mit
ausdruecklichem Mandatsfilter muessen gleich sein. App Ausgabe und Paket
binden denselben Inhaltshash. Paket und Lage muessen dieselbe Lage tragen;
die Quittung muss den gesamten Briefinginhalt tragen. Erzeugungszeiten
muessen zwischen bestaetigter Aktivierung und gebundenem Ende liegen,
bei fruehem Ende entsprechend davor. Zukunft und fehlende Zeit sind kein
Beleg. Der Anzeigeersatzzeitpunkt aus `lage.finalize` wird nicht verwendet.

Je Ergebnisart werden500 Soll, geprueft, vollstaendig, nicht bestaetigt und
feste Fehlergruende ausgegeben. Einzelhashes und Texte bleiben privat.
Historische Tagesabrufe bleiben moeglich, zaehlen aber ausserhalb des
Testfensters nicht als neue Versorgung. Fehlende App Ausgabe ist fuer die
neue Bilanz unpruefbar, keine erfundene Aussage ueber vorhandene Morgenzeilen.
Die bisherigen strengeren Paket- und Lagepruefungen werden neu berechnet;
gespeichertes Gruen allein reicht nicht. Keine transaktionale Snapshotzusage,
keine500er Faktenfreigabe und kein Quellenfrischenachweis durch einen neuen
Erzeugungszeitpunkt. Quellenalter und fachliche Prosa bleiben separat offen.

Gezielt lokal: neun neue Gruppen, darunter synthetische500/1500, App Leser7/7,
Morgenpaketvertrag19/19 einschliesslich Altbeleg/Pussschutz sowie bestehende
Frischevertraege69/69,38/38 und68/68 erfolgreich. Kanonischer Gesamtlauf
427/427 in632s, Exit0. Waehrenddessen wurde die neue Bilanz praezisiert:
Ein unlesbarer Inhalt zaehlt nicht als geprueft. Die betroffenen neun und
sieben Gruppen danach gezielt bestanden. Kein behaupteter einzelner Lauf
eines unveraenderten letzten Heads; diesen muss die vollstaendige Pflicht CI
pruefen. Alle Tests ueber `scripts/lokal.js`, keine Modellaufrufe.
Kein Production Inhaltslauf, weil keine neue Testfensterquittung angelegt
werden darf.

Risiko: Pro Profil bis zu zwei zusaetzliche begrenzte Datenbanklesungen;
das bestehende15 Minuten Gesamtbudget und17 Minuten Joblimit bleiben.
Teilabdeckung bleibt sichtbar. Ein bereits vor dem Test erzeugtes Tagespaket
wird nicht fuer einen neuen Zeitnachweis umgeschrieben. Der spaetere Testplan
muss einen passenden frischen Tagesstand beruecksichtigen. Branchpreview
gezielt gesperrt; Cron und Environment unveraendert. Rueckweg ist ein
gepruefter Coderevert; additive Quittungsfelder bleiben lesbar, keine
Produktionsdaten loeschen. Vor Merge volle CI, danach READY/Commit/Alias,
App und Schutzgrundlinien ausschliesslich lesen.

## Production Abschluss PR459

Der begrenzte Inhaltsbindungs- und Ergebnislesersprint ist **erfolgreich
abgeschlossen**. Head `b3420d3064ee03ef3e9312c14d7b05e3da86da5d`,
CI35463970380:427/427 in642s, Browser50/0, Kontoschutz15/0 samt500
isolierten Registrierungen, PostgreSQL/PostgREST26/0, Z22 PASS48/FAIL0.
Beide Pflichtjobs und alle25 Schritte erfolgreich, kein Skip.

Merge `09f62654d46633dcd3e6f52d2781a60046629e70`, Baum
`88bb14149c31e4db30113861bb31868397e8def9` identisch zum geprueften Head.
Production `dpl_C5HJYhVz34NdvTykLTA8SLWZfUWn` READY, korrekter Commit und
Hauptalias. Reiner Leser35464768351 am19.09.19:34:48 UTC HTTP200,
null Modell- oder Schreibaufrufe. V3, exklusiver Profilpfad, Retention36,
Kommunikations- und Quellensperre, Tagesdeckel2416/Reserve702/Vorrang200,
atomare Sperre und4 USD Kostenregel2 unveraendert.

Native Nachkontrolle19:35:16 gegen Vorflug19:32:56 UTC:504/0, vollstaendige
Profil-, Identitaets-, Auth-/Sessions- und Mainhashes identisch. Keine
Sperre, Lease, offene Jobs, jungen offenen Prozesse, Kostenreserven oder
Testfensterquittungen. Tagesbuch0,386081 USD. Endfunktion weiter installiert,
kein Timer oder500er Start. Allgemeine Prosaquellebindung, Quellenfrische,
Versorgung und belastbarer Zeit-/Kostenplan bleiben offen.

## Nachlauf an das neue Testfenster binden

19.09., Branch `codex/testnachlauf-fenster-20260919`, **teilweise abgeschlossen**.
Belegte Vertragsluecke: Der manuelle Textnachlauf kennt bisher nur500 aktive
Profile. Er liest weder die neue Testfensterquittung noch deren500 Kennungen
und Endfrist. Das reicht fuer eine eindeutig gebundene Fortsetzung nicht.

Vor Aenderung festgelegte Erwartungen: keine Modellfreigabe ohne gueltige
aktive Quittung, passenden Production Commit und offene Endfrist. Die aktive
Menge muss exakt den500 Manifestkennungen entsprechen, alle vier Ausnahmen
bleiben inaktiv. Vor Entwurf, Review und Speicherung wird der aktuelle
Fensterzustand erneut gelesen. Ein Ende verhindert weitere Aufrufe; ein
unbekannter Ausgang berechtigt nicht zur Wiederholung. Gueltige Arbeit
bleibt an die vorhandenen Fach-, Quellen-, Kosten-, Profil- und
Kommunikationsschutzregeln gebunden. Keine Testausfuehrung in diesem Sprint.

Negativer Ausgangsbeleg gegen Main09f6265: Eine lokal simulierte, gueltig
beendete Quittung bei weiterhin500 aktiven Fixtureprofilen wurde ignoriert;
478 simulierte Generierungen statt erwarteter null. Die neue Assertion
schlug vor dem Fix fehl. Kein echter Modell- oder Production Aufruf.

Engster Eingriff: Der bestehende Actionsauftrag nimmt eine Testfenster UUID
an und transportiert sie im geschuetzten POST. Client und Server lesen die
exakt adressierte Quittung, pruefen vorhandenen Manifestvertrag, Commit,
Aktivzustand, Frist und die gesamte aktive Auswahl. Die Antwort bindet UUID,
Manifesthash, Zielhash und Ende. Fehlt dieser Beleg oder ist er anders,
bleibt der Ausgang unbestaetigt; kein automatischer Wiederholungsaufruf.
Der Server wiederholt die Lesung mit seinem vorhandenen Voraufrufschutz
vor Entwurf, Review und Speicherung. Sein vierminuetiges Arbeitsbudget
wird durch die kuerzere Manifestfrist begrenzt;90 Sekunden Reserve bleiben.

Der alte Modus bleibt nur zulaessig, wenn noch keinerlei neue0/500/0
Quittung existiert. Sobald eine vorhanden ist, blockiert das Weglassen
der UUID vor Facharbeit. Ein neuer Lauf ohne UUID ist also kein Rueckfall
auf die aktive Menge. Alte geschlossene Quittungen werden nicht geloescht.
Die neue Versionsangabe ist eine gelesene Codefaehigkeit, kein Featureflag
und keine dauerhafte Environmentaenderung. Neue Branchpreview gesperrt.

Gezielte lokale Abnahme ueber scripts/lokal.js:33/33 Textnachlaufgruppen,
31/31 Actionsgruppen und69/69 Laufzeit-/HTTP Schutzpruefungen. Bestehende
Assertions erhalten; nur synthetische Lesefakes um die neue Quittungsquery
ergaenzt. Positiver Fall500 lokale Ergebnisse; Negativfaelle umfassen
beendetes/abgelaufenes Fenster, falschen Commit, vertauschte Auswahl,
fehlende Kennung, Fristverlaengerung, Ende vor Review/Speichern, fehlendes
Antwortecho und zu kurze Restzeit. Kanonischer Gesamtlauf am19.09.19:57 UTC:
427/427 Suiten in637s, Exitcode0, unveraenderter Code. Finale CI noch offen.

Risiko sind zusaetzliche begrenzte Quittungs- und Profilzustandslesungen im
manuellen Nachlauf. Keine neue Queue, kein Timer, keine Profilmutation und
kein Modellwechsel. Eine bereits begonnene externe Anfrage ist dadurch
nicht rueckrufbar; spaete Ergebnisse, Leases und Prozesse muessen nach dem
Ende separat gelesen werden. Der Leser aus PR459 zaehlt Ergebnisse nach
der Endfrist nicht als Versorgung im Testfenster. Keine transaktionale
Snapshotzusage fuer HTTP Gegenlesungen und keine Fachfreigabe durch die UUID.
Rueckweg: gezielter Code Revert vor einem Test; nach Aktivierung zuerst den
vorbereiteten gebundenen Endweg benutzen. Quittungen und Ergebnisse erhalten.

## Production Abschluss PR460

Der begrenzte Nachlaufbindungssprint ist **erfolgreich abgeschlossen**.
Head ea5892706e1ef72b2155e92cef52f01bbb6c3f59,
CI35466029808:427/427 in666s, Browser50/0, Kontoschutz15/0 samt500
isolierten Registrierungen, PostgreSQL/PostgREST26/0, Z22 PASS48/FAIL0.
Beide Pflichtjobs und alle25 Schritte erfolgreich, keine Pflichtstufe
uebersprungen. Reviews und Kommentare vor Merge leer.

Merge ce090c2a4ef0c6fbae74d8cc5ed376382d0cb1bd mit identischem geprueftem
Baum a4ac8ecfe1a6c7b231a393012c67a400a780b970. Production
dpl_84NBPWed2eUxGYdYVEqrKnUCqtoR READY, richtiger Commit und Hauptalias.
Reiner Leser35466909269 am19.09.20:17:12 UTC HTTP200, null Modell- und
Schreibaufrufe. Neue Codefaehigkeit textnachlaufTestfensterVersion1 belegt.
V3, exklusive relationale Profile, Retention36, Kommunikations- und
Kohortenquellensperre, Tagesdeckel2416/Reserve702/Vorrang200, atomare Sperre
und Kostenregel2 mit4 USD unveraendert. Optionale Inhaltsjobs nicht angefordert.

Native Vorher-/Nachherkontrolle20:15:18/20:17:33 UTC:504/0, vollstaendige
Profil-, Identitaets-, Auth-/Sessions- und Mainhashes identisch. Keine
Sperren, Leases, offenen Jobs, jungen offenen Prozesse, Testfensterquittungen
oder offenen Kostenreserven.0,386081 USD gebucht. Endfunktion installiert,
kein Timer bewaffnet, keine Profile aktiviert, kein500er Test gestartet.
Die allgemeine Quellenbindung freier Bedeutung ist dadurch nicht repariert.

## Kosten und Versorgungsplan: verbleibende Beleggrenzen

Rein lesende Aufnahme19.09.20:02 UTC:0,386081 USD im Tagesbuch, keine
offene Reserve, unveraenderter technischer4 USD Tagesriegel. Die allgemeine
10 USD Betreiberfreigabe erhoeht diesen Riegel nicht. Alle504 Profile inaktiv,
keine Testfensterquittung und keine offene Verarbeitung.

Fuer500 erstmals im neuen Fenster erzeugte Lagen sieht der aktuelle Pfad
bis zu1000 erfolgreiche Modelltransporte vor: je ein Entwurf und eine
getrennte Pruefung. Ein gespeicherter, exakt gebundener Entwurf kann einen
unterbrochenen zweiten Schritt fortsetzen; ein unbekannter Ausgang darf
nicht erneut erzeugt werden. Ein alter fertiger Text ausserhalb des neuen
Fensters ist kein neuer Versorgungsnachweis.

Vier explizit phasengebundene Kostenbelege vom15.09.: zwei Entwuerfe zusammen
0,008813 USD, zwei Pruefungen zusammen0,015882 USD. Rein rechnerisch ergibt
das0,0123475 USD je Paar beziehungsweise6,173750 USD fuer500 Paare.
Diese winzige historische Stichprobe ist weder ein Mindestpreis noch eine
belastbare Obergrenze oder Zusage fuer neue Quellen. Ohne Phasenbindung
duerfen die uebrigen Kostenzeilen nicht als gemessene Entwurf/Reviewpaare
ausgegeben werden. Die jeweils bis0,212 USD Vollreserve ist ebenfalls
kein gemessener Preis; sie wird nach bekannter Abrechnung wieder freigegeben.

Daraus folgt: ein belegter Plan fuer500 vollstaendige Ergebnisse innerhalb
des4 USD Riegels liegt weiterhin nicht vor. Keine Absenkung von Review,
Quellenschutz, Outputqualitaet oder Reserve, um die Rechnung passend zu machen.
Eine Budgetaenderung waere eine gesonderte konkrete Betreiberentscheidung;
sie wurde weder beantragt noch vorgenommen und wuerde den Prosablocker
fuer sich allein nicht beheben.

Zeitgrenze des vorbereiteten automatischen Endwegs: hoechstens4 Stunden.
Der direkte manuelle Textnachlauf arbeitet seriell mit240 Sekunden
Handlerbudget und90 Sekunden Reserve vor einem neuen Modellschritt.
Die Narrativslots06:10/06:22 sind bei ausgeschalteter Narrativqueue inert
und duerfen nicht als zusaetzliche Versorgung eingerechnet werden.
Actionsstart, Lesepruefungen, Quellenablehnungen, Fachurteile, Speicherung,
Morgenpakete und Gegenlesung brauchen ebenfalls Zeit. Ein konkretes
Startdatum und eine ausreichende Anzahl sicherer Fortsetzungen sind daher
noch nicht festgelegt; kein erfundenes fertiges Vierstundenversprechen.

Vor dem Start ist ein Berliner Tagesstand ohne passende Altpakete zu
waehlen. Datenstand hoechstens24 Stunden, Artikel im geltenden14 Tage
Relevanzfenster mit echtem Publikationsdatum und korrekter Ereigniszeit.
Aeltere sachlich relevante Quellen duerfen enthalten sein, aber nicht als
neue heutige Entwicklung ausgegeben werden. Neue Erzeugungszeit allein
macht alte Quellen nicht frisch.

Die private feste500er Auswahl samt vier Ausnahmen ist erhalten
(Zielhash dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6).
Erwartet sind fuer jedes Profil Mandatsbriefing, Morgenbriefing samt
inhaltlich gebundener Quittung und Lage:1500 getrennte Ergebnisnachweise.
Der integrierte Leser prueft alle500, Tages-/Zeitfenster, Profil- und
Inhaltshashes, Eindeutigkeit, Nichtleere und Struktur. Fehlend, unlesbar,
abgelehnt, deferred, ausserhalb der Frist oder widerspruechlich bleibt
Nichtabschluss im Nenner500. Das ersetzt keine vollstaendige semantische
Textabnahme. Eine begrenzte fachliche Sichtung muss ihren tatsaechlichen
Umfang nennen; sie wird niemals zur Vollpruefung aller500 umbenannt.

Stoppbedingungen bleiben: unerlaubte Kommunikation, andere aktive Auswahl,
fremde Profil-/Konten-/Sessionsaenderung, konkurrierender Schreiber,
unbekannter Schreib- oder Modellausgang, Kosten-/Reserve-/Zeitstopp,
kritischer Fachfehler und nicht bestaetigte Speicherung. Danach keine
weitere Facharbeit; genau die gebundenen500 auf0 zurueckfuehren. Bei
unklarem Endausgang zuerst lesen, nicht blind wiederholen. SQL Rueckweg
und installierter Endauftrag erhalten Ergebnisse und die vier Ausnahmen.
Nachkontrolle: alle504 inaktiv, Konten/Sessions unveraendert, Kommunikation,
Sperren, Leases, laufende Anfragen, Kosten und alle1500 Ergebnispositionen
lesen. Inflight Arbeit und spaete Writes gesondert ausweisen.

## UTC Grenze der Datenbankfixture

20.09.2026, teilweise abgeschlossen. PR462 CI35477560079 scheiterte
um03:01:40 Tuerkei /02:01:40 Berlin /00:01:40 UTC nach erfolgreichen
Kontoschutz und Quellenpruefungen an null500-kostenfenster-ungueltig.
Die abgelaufene Fixture setzte vorflugAm auf jetzt minus zwei Minuten,
startBis auf minus eine Minute, beliess endeAm aber in der Zukunft.
Kurz nach Mitternacht lag der Vorflug damit am Vortag. Der bestehende
Kostenriegel verwarf korrekt das Manifest, bevor SQL den beabsichtigten
Fristfehler pruefen konnte. Kein Production Fehler und kein Kostenwechsel.

Nur die Testdaten korrigiert: abgelaufenes Fenster vollstaendig am
Vortag; die SQL Ablehnung muss jetzt ausdruecklich
null500-startfenster-abgelaufen nennen. Gueltige Live Fixtures verwenden
einen gemeinsamen UTC Kostentag und begrenzen ihr Ende auf dessen Ende.
In der letzten Minute wartet nur die isolierte Fixture auf den neuen Tag,
in einzelnen Abschnitten hoechstens60 Sekunden. Kein Uhrzeitpatch in SQL.
Alle bisherigen Assertions und Production Grenzen bleiben erhalten.
Acht lokale Gruppen erfolgreich, darunter Mitternacht, der beobachtete
Fehlerzeitpunkt, Tagesende und unveraenderte Ablehnung echter Tageswechsel.
Vollstaendige CI mit echtem PostgreSQL am neuen Head erforderlich.
