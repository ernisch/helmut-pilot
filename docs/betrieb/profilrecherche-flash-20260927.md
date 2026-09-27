# Begrenzte Flash-Pruefung amtlicher Profilangaben

Aktuelles Roadmapziel:500 quellenbelegte, gleich behandelte reale Mandatsprofile,
AfD ausgeschlossen; Bundestag/Berlin/Brandenburg zuerst. Production PR654 READY,
500 Profile inaktiv, Feldbelege noch offen. Betreiber hat DeepSeek-Unterstuetzung
fuer diese Recherche angeregt.

Umfang: genau ein rein lesender DeepSeek-Flash-Aufruf, Denkstufe High, auf bereits
abgerufenen oeffentlichen beruflichen Belegzeilen von50 Brandenburger Profilen.
Keine Profilanlage, keine Aktivierung, keine Nachrichten. Aufgabe: aktuelle Partei
von frueherer Mitgliedschaft und Fraktion unterscheiden; unbekannt bleibt offen.
Abnahme:50 eindeutig zugeordnete Ergebnisse, exakte vorhandene Belegzeilen,
anschliessende eigene Pruefung. Keine spaeteren Roadmapschritte durch den Helfer.

Technische Grenze: maximal55000 Eingabebytes und8192 Ausgabetokens, ein HTTP-Aufruf,
150 Sekunden Timeout, keine Wiederholung. Selbst zum Peak-Tarif0,30USD/Mio.Input
und1,20USD/Mio.Output hoechstens0,03USD; tatsaechliche Anfrage16978 Bytes.
[Offizielle Tarife](https://api-docs.deepseek.com/quick_start/pricing/).
Der einmalige direkte API-Aufruf setzt die feste Tokenobergrenze, die der allgemeine
lokale Agentenstarter nicht erzwingt. Der Helfer besitzt keine Werkzeuge/Schreibrechte.

Vorab-Bindung: `main-auth.testKostenAuftrag.externGebunden` in bestehender
Helmut-Production atomar von5192289 auf5222289 MikroUSD erhoehen, nur bei unveraenderter
Leserevision; `_authStoreRevision` erneuern. Kein Budgetlimit erhoehen.
Wirkung:0,03USD werden von weiteren Productionlaeufen nicht mehr als frei betrachtet.
Vorstand12:53:35UTC:6,551281USD gebunden; danach hoechstens6,581281USD,
weiterhin unter7USD insgesamt und6USD heute. Keine Profilfelder betroffen.
Risiko: konservative Ueberbindung bei fehlendem Modellresultat; niemals still erneut
aufrufen. Nachkontrolle: Kostenbindung und Profilbestand rein lesend pruefen.
Rueckweg: bei belegtem Nichtversand Bindung entfernen, sonst erst nach eindeutiger
Laufquittung auf konservativ berechnete Istkosten abstimmen. Unklar bleibt gebunden.

Erster Verbindungsaufbau12:56:43UTC lokal gescheitert (`URLError`). Diagnose:
Python findet keinen CA-Speicher, kostenlose Gegenprobe liefert
`SSLCertVerificationError: unable to get local issuer certificate`. Mit dem
vorhandenen System-CA-Speicher `/etc/ssl/cert.pem` ist TLS verifiziert (HTTP401
ohne Zugangsdaten). Genau ein technischer Neuversuch mit verifizierter TLS-Kette,
keine abgeschaltete Zertifikatspruefung. Kein bestaetigter erster Modellstart.
Laufquittung und Pruefergebnis folgen hier.

## Ergebnis und Abrechnung

Erfolgreicher API-Lauf12:57:40–12:57:52UTC, Modell `deepseek-flash`, Denkstufe High.
5507 Eingabe- und3645 Ausgabetokens (inklusive1555 Reasoningtokens), reguläres Ende.
Sonntag/off-peak:5507×0,15/1000000 +3645×0,60/1000000 =0,00301305USD.
Konservativ auf3014 MikroUSD aufgerundet. Die eindeutige Laufquittung erlaubt,
die0,03USD-Bindung auf0,003014USD abzustimmen: externGebunden5222289→5195303,
wieder mit aktueller Leserevision und neuer Schreibrevision. Limits unveraendert.

[50 Einzelresultate](brandenburg-parteipruefung-20260927.json):46 Parteifelder
belegt,4 offen. Eigene Pruefung: alle50 Kennungen eindeutig, jede zitierte Zeile
exakt in der zugeordneten amtlichen Quelle; zeitliche Aussagen geprueft. Die
offenen Faelle bleiben offen, keine Ableitung aus Fraktion. Dies ist nur eine
Teilfeldpruefung innerhalb der500er Gesamtmenge, keine freigegebene Teilgruppe
und keine vollstaendige Profil- oder Versorgungsabnahme. Keine Profile geaendert.

Nachkontrolle12:59:04UTC: externGebunden5195303, weiterhin500 Profile/0 aktiv
und Profilhash198f25ff81cf5ee4ad2645c1881a8191 unveraendert. Gesamt konservativ
6,554295USD gebunden,0,445705USD frei. Tagesstand inklusive dieses externen
Rechercheaufrufs0,187873USD; Auftrags- und Tagesgrenze unveraendert.
