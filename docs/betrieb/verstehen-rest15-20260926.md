# Begrenzter Auftrag fuer die 15 unbegonnenen Quellen

Der erste16er Auftrag hat nach einem ungueltigen Parteienbeleg im ersten
Vorgang gestoppt. Sein Ergebnis und seine Quittung bleiben unveraendert.
Die anderen15 Quellen wurden noch nicht verarbeitet. Der aktuelle
[Betreiberauftrag](autonom-bis-500-starttor-20260926.md) umfasst ihre Bearbeitung.

Der neue Auftrag bindet genau diese15 Originale und ihre vorhandenen Artikelbelege.
Er liest zuerst die fest gebundene Vorgaengerquittung und den gesperrten Vorgang.
Keine Quelle wird neu importiert, umdatiert oder erneut abgerufen. Der gesperrte
Vorgang wird auch bei einer abweichenden Zuordnung im Nurleseplan ausgeschlossen.

Grenzen: maximal15 Modellaufrufe,0,80USD und15Minuten; unveraenderter4USD-Tagesriegel.
Alle500 Profile bleiben inaktiv; ihr vollstaendiger Hash sowie der gesperrte
Vorgang werden anschliessend unveraendert nachgelesen. Keine Kommunikation.
Eigene Einmalquittung, kein automatischer Retry und keine Freigabe alter Fehler.

Der bestehende Motor unterscheidet lokale fachliche Fehler von globalen technischen
Fehlern: Ein ungueltiger Einzelvorgang bleibt gesperrt und wird als Fehler bilanziert;
die unabhaengigen Quellen werden weiter geprueft. Jeder unbekannte technische
Ausgang, Speicherfehler oder Kostenfehler stoppt den Lauf. Bei jedem fachlichen
Fehler bleibt das Gesamtergebnis rot. Validatoren und historische Auftraege werden
nicht abgeschwaecht.

Vor Ausfuehrung: gruene Pflicht-CI, passender Production-Commit und erfolgreicher
Nurleseplan. Nachher Quittung, Kosten, Quellenergebnisse, Profile und Ruhe nachlesen.
Rueckweg ist Anhalten ohne erneuten Modellaufruf; bereits verarbeitete Quellen
werden nicht zurueckgesetzt. Dieser Quellenauftrag ist kein500er Funktionsnachweis.
