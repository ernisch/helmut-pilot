# Kontrollierte Quellenwiederaufnahme nach Datenbankausfall

Der Quellenlauf vom 28.11. um 09:00 Berlin endete nach einer belegten
Datenbankunterbrechung ohne vollständige Auftragsbilanz. Der Worker bleibt aktiv;
seine bestehende Automatik stoppt bei failed/UNKNOWN. PR1364 ist auf beiden
Plattformen als0b685583 belegt. Ein Containerneustart hebt den gespeicherten
Fehlerzustand nicht auf. Das Morgenbriefing war bereits vorher unvollständig.

## Kleinste technische Korrektur

Der bestehende ausdrückliche Adminauftrag kann jetzt auch den nativen
Hetzner-Worker ansprechen. Im24h-Modus gilt das bereits regulär verwendete
Tagesmaximum96Fenster/28800Sekunden einschließlich aller bisherigen Buchungen;
der alte Adminpfad war hier noch auf8/2400begrenzt. Originale bleiben16,
Modellaufrufe100mitReserve0, Geld1USD/UTC-Tag und30USDgesamt.

Vor dem Start bindet eine reine GET-Vorschau den konkreten Adminauftrag, UTC-Tag,
Commit, Codehashes, den abgelaufenen einzelnen source_fetch1/3, die vollständigen
Tagesläufe, Quellenkonten, den hundertfach abgerechneten Aufrufbestand und das
vollständige Kostenbuch als Hash. Nur ein fehlgeschlagener Hetzner-Transportlauf
mit genau einem unbestätigten Claim ist zulässig; fremde laufende Aufträge,
Leaseverluste, offene Prozessquittungen und unklare Zähler stoppen.

Die Vorschau gilt fünf Minuten. Der vollständige Vergleich erfolgt erneut
unter derselben nativen globalen Arbeitssperre vor jeder Mengenbuchung.
Normale Quellenslots, Startkulanz und Redaktionspause gelten auch für diesen
Adminweg. Ablehnung vor der Reservierung verbraucht keinen neuen Fensterslot.

Danach läuft genau ein normaler nativer Queue-Drain bis270Sekunden mit
bestehender Abschlussfrist bis290Sekunden. Er bearbeitet die normale Queue,
nicht ausschließlich den einen Quellenauftrag. Die vorhandene Quellenclaim-RPC
kann dessen abgelaufene Lease regulär neu übernehmen. Dokumentanalysen können
ihre normalen CAS-Vorprüfungen ausführen; vorhandene UNKNOWN-CAS und ungeklärte
Geldbindungen erhalten dadurch kein neues Recht. Der bereits voll belegte
100erAufrufzähler verhindert neue bezahlte Modellaufrufe. Kein Sonderreaper,
kein PATCH, keine Versuchs-/Zählerresets und keine Erfolgsumschreibung alter Läufe.

Der neue Lauf erhält einen eigenen Admin-Einmalschlüssel und eine native
Prozessquittung. Erst eine entsprechend der unveränderten Automatik ausreichend
bestätigte neue Bilanz erlaubt die späteren regulären Fenster. Bei unbekanntem
Ausgang, fehlender Quittung, Leaseverlust oder Teilreservierung kein weiterer
Versuch und keine Rückerstattung. Der Operator meldet jeden Teilstand mit
Exit2; ausschließlich ok=true mit Start-/Endquittung und success hat Exit0.
Das ist kein Nachweis vollständiger Morgenversorgung.

## Nachweise

Vorhandene Arbeitsfenster-Suite35/35, Worker einschließlich43gezielter
Bindungs-/Störfälle und unveränderte Automatik-Suite15/15 bestanden.
Ein lokaler reiner Prüfer-Replay des frischen gespeicherten Produktionsbestands
bestätigt30Läufe/33Quellenkonten und den konkreten Fehlerzustand. Nur die
Auftrags-UUID und lokalen Codehashes sind deklarierte Prüffixierung; der Replay
ist keine ausführbare Hostvorschau und kein KI-Erfolg. Neue native GET-Pfade
lieferten HTTP200 mit30Läufen und33Konten. Keine Anbieter-/Modellaufrufe,
keine neue Testinfrastruktur und keine Monats-/Gesamtsimulation.

Die unabhängige Prüfung fand vor Integration Fehler: Ein quittierter
UNKNOWN-Teilstand durfte zunächst Exit0 liefern; außerdem konnte ein langsamer
Adminvorflug die fünfte Slotminute überschreiten. Beide sind gezielt korrigiert
und mit Negativfällen belegt. Der Macadapter bewahrt auch bei einem Timeout die
Originalausgaben und stoppt bei einer mit Fehlergrund gespeicherten success-Zeile.
Endreview und exakte Pflicht-CI bleiben separate
Freigabetore.

## Aktivierung und Rückweg

Code-Merge und regulärer Rollout starten keine Wiederaufnahme. Der separate
Produktionsschritt benötigt ein konkretes GO für Job/Lauf, Tag, Einmalauftrag,
Merge und den beschriebenen Queue-Drain. Eine vorbereitete Mac-Datei nutzt den
bestehenden Betreiber-SSH-Zugang; Schlüssel bleiben auf dem Mac. Sie speichert
die vollständige Vorschau vor der einmaligen Aktion privat, gleicht den
Container erneut ab und liest danach Job, neue Laufquittung, Kostenbuch und
Aufrufzähler rein lesend zurück. Bei jeder Abweichung STOP, Originale erhalten,
keine zweite Freigabe. Fehlender oder falscher Build stoppt vor der Aktion.

Vor der Mengenbuchung ist Abbruch ohne neue fachliche Verarbeitung möglich.
Nach Beginn bleiben bestätigte Arbeit und konservativ verbrauchte Reserven
erhalten. Keine pauschale Datenrücknahme; ein Coderevert ist getrennt von einem
Datenrückweg. Alte Laufquittungen bleiben unverändert. Die Mac-Datei prüft neben
der vollständigen neuen Bilanz auch, dass der Zielauftrag keine unbestätigte
Lease mehr trägt; eine weiter wartende oder terminale Quelle bleibt fachlich
separat auszuweisen.

## Weiter geschützte Fehlerfälle

Die erneute Prüfung der20übrigen terminalen Fälle hat keine weiteren belegten
Codefehler ergeben:9echte/ungeklärte Metadatenkonflikte,4abgelaufene historische
Wiederaufnahmebindungen,5alte Budgetwartefristen und2alte KO-/CAS-Ausgänge.
Fehlende historische Modellantworten/Validatorcodes lassen sich nicht
nachträglich herstellen. Die EU-Einmalfreigabe mit unbekanntem Ausgang wird
nicht wiederholt; alle sieben ungeklärten Geldbindungen bleiben erhalten.

Für die vollständige historische Abgrenzung des fehlenden Tagesanlasses fehlen
die Auswahlentscheidungen und zugehörigen KO-/Quellenstände vom damaligen
Paketbau. Die Pflichtversorgung war im gespeicherten Morgenpaket9/12; der
spätere09:01-Ausfall erklärt diese frühere Lücke nicht. Der28Nov-Morgen bleibt
FAILED. Auch nach einer Wiederaufnahme sind ein echter regulärer Folgelauf,
die Quellenabdeckung und die vollständige fristgerechte Kundenausgabe
nachzuweisen. Keine Pilotfreigabe aus grünen Tests ableiten.
