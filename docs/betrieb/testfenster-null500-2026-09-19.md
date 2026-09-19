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
